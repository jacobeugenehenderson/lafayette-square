/**
 * Menu item identity — the one place that decides what a menu item IS.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * A menu item had no identity. The cart keyed on `"sectionIdx-itemIdx"`
 * (`MenuTab`), which names a POSITION, not a thing: a guardian reordering the
 * menu re-points every ref behind the edit, and a live cart silently becomes a
 * cart for different food. That was survivable only while nothing persisted.
 * It stops being survivable the moment an order is a row that gets reconciled
 * against a POS tender record and refunded weeks later, and it is what makes a
 * menu re-pour destructive instead of diffable (`cary/pos/cary-order.md`).
 *
 * ── The three homes problem ────────────────────────────────────────────
 * The same menu can arrive from three places (`ls/reference/INVENTORY-DATA.md`):
 *
 *   1. the bundled instance payload   src/data/<look>/menus.json
 *   2. GAS `menu_json`                the guardian's authored copy
 *   3. (soon) Cary                    the commercial fields
 *
 * `useListings.js` merges 1 and 2 ("keep the static menu if the API has no
 * sections"). If each home invented its own ids, the merge would swap one id
 * set for another under a live cart and any Cary row pointing at an item would
 * dangle. So:
 *
 *   ⭐ DERIVATION IS THE BRIDGE. An id is DERIVED from the item's own content,
 *      so all three homes independently compute the SAME id for the same item.
 *      Minting is reserved for items that genuinely did not exist before.
 *
 * ── The two kinds, and why the prefix is kept ──────────────────────────
 *   `d_…`  derived  — computed from section name + item name.
 *                     Stable across the homes without anyone writing anything.
 *   `i_…`  minted   — a fresh item authored in the editor. Random, permanent.
 *
 * The prefix is provenance, not decoration: it is readable at a glance which
 * items have ever been through the editor and which are still riding their
 * derived bridge id. (The same discipline as the `producer`/`producerReason`
 * stamps on a poured tile — a value that records where it came from.)
 *
 * ⚠️ Once an item HAS an id, the id wins, forever. A rename would derive a
 * different id, but `ensureMenuIds` never recomputes an id that is already
 * present — so identity survives a rename, which is the whole point.
 * Derivation is a bootstrap for data that predates ids, not an ongoing rule.
 *
 * ⛔ The bundled payload is deliberately NOT backfilled with written-out ids.
 * Derivation is the command that produces them; writing 819 of them into JSON
 * would restate what this function computes and go stale the day it changes.
 */

/** FNV-1a, 32-bit. Chosen so Node (the check) and the browser (ingest) compute
 *  byte-identical ids with no dependency and no crypto import. */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Normalize the text an id is derived from, so trivial edits (case, padding,
 *  a doubled space) don't fork identity. */
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * The derived id for an item: its section and its name, and deliberately NOT
 * its price. Identity is what the item IS, not what it costs — folding price in
 * would fork the id of any legacy item whose price was edited straight in the
 * Sheet, which is exactly the bridge this is here to hold.
 *
 * ⚠️ A section is identified by its menu TYPE as well as its name, because a
 * section name is not unique within a listing. LS `lmk-008` carries two sections
 * called "Mocktails" — one on `brunch`, one on `drinks` — holding the same three
 * drinks, and two called "Small Plates" holding different food. Those are
 * genuinely distinct orderable lines: they sit in different serving windows, and
 * `orderableSections` decides orderability per section. Keying on section name
 * alone collapsed them and minted duplicate ids (caught by
 * `scratch/claims-menu-item-ids.mjs` on its first run).
 *
 * `occurrence` disambiguates what is left — two items of the same name in the
 * same section. It is 0 for the first, so the common case carries no suffix.
 */
export function deriveItemId(section, item, occurrence = 0) {
  const basis = `${norm(section?.menu || 'all_day')}|${norm(section?.name)}|${norm(item?.name)}`
  return `d_${fnv1a(occurrence ? `${basis}#${occurrence}` : basis)}`
}

/** The derived id for a modifier, namespaced under its owning item. */
export function deriveModifierId(itemId, mod, occurrence = 0) {
  const basis = `${itemId}|${norm(mod?.name)}`
  return `m_${fnv1a(occurrence ? `${basis}#${occurrence}` : basis)}`
}

let _mintCounter = 0
/** A fresh id for an item authored in the editor. Random + a counter so two
 *  items added in the same millisecond cannot collide. */
export function mintItemId() {
  const rand = Math.random().toString(36).slice(2, 8)
  return `i_${fnv1a(`${Date.now()}|${rand}|${_mintCounter++}`)}`
}

/** A fresh id for a modifier authored in the editor. */
export function mintModifierId() {
  const rand = Math.random().toString(36).slice(2, 8)
  return `im_${fnv1a(`${Date.now()}|${rand}|${_mintCounter++}`)}`
}

/**
 * The cart key for one orderable line.
 *
 * Today a line is just an item, so the key is the item id. Modifier selection
 * is not wired yet (`ls/CARY.md §6` — the card displays priced modifiers the
 * cart cannot order). The signature takes the modifier ids NOW so that wiring
 * them later fills this shape instead of reshaping every caller — the same
 * reason `CaryOrder` carries a `modifiers[]` it does not yet populate.
 */
export function lineKey(itemId, modifierIds = []) {
  if (!itemId) return null
  if (!modifierIds.length) return itemId
  return `${itemId}#${[...modifierIds].sort().join('+')}`
}

/** The item id back out of a cart key. */
export function itemIdOf(key) {
  return typeof key === 'string' ? key.split('#')[0] : null
}

/**
 * Fill in every missing id on a menu, deterministically.
 *
 * Pure and idempotent: running it twice gives the same menu, and an id that is
 * already present is never recomputed. Safe to call on every ingest, which is
 * how the bundled payload and the GAS payload end up agreeing.
 *
 * Returns the same object identity when nothing was missing, so React consumers
 * don't re-render over a no-op.
 */
export function ensureMenuIds(menu) {
  if (!menu?.sections?.length) return menu

  let changed = false
  const sections = menu.sections.map((section) => {
    const seenItems = new Map()
    let itemsChanged = false

    const items = (section.items || []).map((item) => {
      let id = item?.id
      if (!id) {
        // occurrence: how many items of this name we have already seen in this
        // section — 0 for the first, which is the normal case.
        const sig = norm(item?.name)
        const n = seenItems.get(sig) || 0
        seenItems.set(sig, n + 1)
        id = deriveItemId(section, item, n)
        itemsChanged = true
      }

      let modifiers = item?.modifiers
      if (modifiers?.length) {
        const seenMods = new Map()
        let modsChanged = false
        const next = modifiers.map((mod) => {
          if (mod?.id) return mod
          const sig = norm(mod?.name)
          const n = seenMods.get(sig) || 0
          seenMods.set(sig, n + 1)
          modsChanged = true
          return { ...mod, id: deriveModifierId(id, mod, n) }
        })
        if (modsChanged) { modifiers = next; itemsChanged = true }
      }

      if (id === item?.id && modifiers === item?.modifiers) return item
      return { ...item, id, ...(modifiers ? { modifiers } : {}) }
    })

    if (!itemsChanged) return section
    changed = true
    return { ...section, items }
  })

  return changed ? { ...menu, sections } : menu
}

/**
 * Every orderable item on a menu, indexed by id.
 *
 * Carries the section index because menu-window orderability is decided per
 * SECTION (`orderableMenus` — a section belongs to a menu type, and a menu type
 * is in or out of its serving window right now).
 */
export function indexMenuItems(menu) {
  const index = new Map()
  ;(menu?.sections || []).forEach((section, sectionIdx) => {
    ;(section.items || []).forEach((item, itemIdx) => {
      if (item?.id) index.set(item.id, { item, section, sectionIdx, itemIdx })
    })
  })
  return index
}

/**
 * Report what is wrong with a menu's identity — for the check script, and for
 * anything that wants to refuse to trade on a menu it cannot address.
 *
 * ⛔ A duplicate id is the one that must never be silent: two items sharing an
 * id means a cart line, an order line and a POS ref can all name the wrong
 * food, and every downstream number would still look plausible.
 */
export function auditMenuIds(menu) {
  const seen = new Map()
  const problems = []
  let items = 0
  let derived = 0
  let minted = 0

  ;(menu?.sections || []).forEach((section) => {
    ;(section.items || []).forEach((item) => {
      items++
      if (!item?.id) {
        problems.push({ kind: 'missing', section: section.name, item: item?.name })
        return
      }
      if (item.id.startsWith('d_')) derived++
      else if (item.id.startsWith('i_')) minted++
      else problems.push({ kind: 'unknown-prefix', id: item.id, item: item.name })

      const prior = seen.get(item.id)
      if (prior) problems.push({ kind: 'duplicate', id: item.id, item: item.name, alsoIn: prior })
      else seen.set(item.id, `${section.name} / ${item.name}`)
    })
  })

  return { items, derived, minted, problems }
}
