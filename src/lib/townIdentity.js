/**
 * THE TOWN'S IDENTITY — how the town looks, one home: the Look's `design.json` `identity` block, authored in
 * Cartograph's Identity panel, carried into `scene.json` by cartograph/bake-scene.js and published in the town's
 * manifest `look` block by cartograph/bake-manifest.mjs (Warden's ruling, 2026-09-28). Pure; the bake, the manifest
 * and the renderer all import it.
 *
 *   mark        the town's ONE emoji: avatar, load screen, tab, and what its places are rated in (Jacob, 2026-09-29:
 *               "emojis are supposed to be the ratings and the map vis ID" — there is no second rating emoji)
 *   markStyle   how the town's generic mark is drawn in the Ward header's ◉, on every screen where ◉ shows the town
 *               rather than a person (Jacob, 2026-09-29, final: mock v38/v39): 'regular' — a white silhouette ·
 *               'engraved' — greyscale lifted to white · 'colored' — as the emoji draws. Always on ◉'s one dark neutral
 *               field (#141519, the Ward's; the kit carries no field). Rating and a person's emoji are untouched.
 *   accent      the Ward's chrome accent, '#rrggbb'
 *   litTint     { color: '#rrggbb', strength: 0..1 } — the roof tint of a lit set and the selected building
 *   locals      { one, many } — what the town calls its locals, the Ward's check-in standing ("Townie" /
 *               "Townies"), wherever the Ward names that standing (Jacob, 2026-10-05). Both authored, never a plural
 *               derived; the kit's neutral is Local / Locals ("Townie" is Lafayette Square's own, declared in its Look).
 *               ⛔ Words, not identifiers: `counts.townies`, `is_local`, `not_townie`, the `townie` standing key stay.
 *
 * ⛔ A channel the town has not chosen is the kit's NEUTRAL value below — no town's — and is published with
 *    `<channel>Authored: false`, so the Ward says so. `null` neutral = the kit has no value: the reader reports it.
 * ⛔ A malformed channel throws at the bake, naming the town and the channel; it is never repaired.
 * Not here: a town's name and locale (who it is — its instance), its category neon (materialColors.neon_*, read by
 * src/lib/categoryColor.js), its label style (src/lib/labelStyle.js).
 * ▶ node checks/claims-a-towns-identity-is-its-own.mjs
 */

export const IDENTITY_CHANNELS = ['mark', 'markStyle', 'accent', 'litTint', 'locals']

/** The kit's neutral identity. `accent: null` — the kit has not chosen one yet (Jacob's eye). */
export const IDENTITY_NEUTRAL = {
  mark: null,
  markStyle: 'engraved',
  accent: null,
  litTint: { color: '#f2c14e', strength: 0.45 },
  locals: { one: 'Local', many: 'Locals' },
}

const HEX = /^#[0-9a-f]{6}$/i
/** How the mark may be drawn in the Ward's ◉. ⛔ A new value is a ruling (Jacob), and the Ward must draw it. */
export const MARK_STYLES = ['regular', 'engraved', 'colored']
/** Each style, drawn: the CSS filter on the glyph — the Ward's ◉ (theward src/styles/band.css) and the kit's splash
 *  (TownSplash) draw a mark the same way. ⚠️ band.css carries the same three today; this is their home in the kit. */
export const MARK_STYLE_FILTER = { regular: 'brightness(0) invert(1)', engraved: 'grayscale(1) contrast(0.45) brightness(1.7)', colored: 'none' }
const oneEmoji = (s) => typeof s === 'string'
  && [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length === 1
  && /\p{Extended_Pictographic}/u.test(s)
// A name the Ward sets in a sentence: words on one line, no space at either end.
const aName = (s) => typeof s === 'string' && s.length > 0 && s === s.trim() && !/[\n\r\t]/.test(s)

const VALID = {
  mark: (v) => oneEmoji(v) || 'one emoji',
  markStyle: (v) => MARK_STYLES.includes(v) || MARK_STYLES.map((s) => `'${s}'`).join(' | '),
  accent: (v) => HEX.test(v) || "'#rrggbb'",
  litTint: (v) => (v && typeof v === 'object' && HEX.test(v.color) && Number.isFinite(v.strength) && v.strength >= 0 && v.strength <= 1
    && Object.keys(v).every((k) => k === 'color' || k === 'strength')) || "{ color: '#rrggbb', strength: 0..1 }",
  locals: (v) => (v && typeof v === 'object' && aName(v.one) && aName(v.many)
    && Object.keys(v).every((k) => k === 'one' || k === 'many')) || "{ one, many } — both names, singular and plural, each on one line",
}

/** The authored block, checked. Throws on an unknown channel or a malformed value; returns only authored channels. */
export function validateIdentity(block, where) {
  if (block == null) return {}
  if (typeof block !== 'object' || Array.isArray(block)) throw new Error(`${where}: identity must be an object`)
  const out = {}
  for (const [k, v] of Object.entries(block)) {
    if (!VALID[k]) throw new Error(`${where}: identity.${k} is not an identity channel (${IDENTITY_CHANNELS.join(', ')})`)
    if (v == null) continue
    const ok = VALID[k](v)
    if (ok !== true) throw new Error(`${where}: identity.${k} = ${JSON.stringify(v)} — must be ${ok}`)
    out[k] = v
  }
  return out
}

/** What a town shows: each channel's authored value, else the kit's neutral one, with `<channel>Authored`. */
export function resolveIdentity(authored) {
  const out = {}
  for (const k of IDENTITY_CHANNELS) {
    const has = authored?.[k] != null
    out[k] = has ? authored[k] : IDENTITY_NEUTRAL[k]
    out[`${k}Authored`] = has
  }
  return out
}

/**
 * ⭐ THE TOWN'S ICON (the tab, a crawler's share card): the mark as an inline SVG, or, for a town with no mark, its
 * initial on ◉'s dark field (Jacob, 2026-10-07: "the identity emoji is the favicon"; 2026-10-31: "Get rid of the
 * arch"). A data: URI, never a file and never a URL, so no town's icon can be served from another town's host.
 * ⛔ Drawn exactly as theward src/town/favicon.js#iconFor draws it, so the card and the tab show one icon.
 */
const svgIcon = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`)}`
const escSvg = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
export function iconFor({ mark, initial }) {
  if (mark) return svgIcon(`<text y=".9em" font-size="90">${escSvg(mark)}</text>`)
  return svgIcon(`<rect width="100" height="100" rx="22" fill="#141519"/><text x="50" y="72" font-size="64" text-anchor="middle" font-family="Georgia, serif" fill="#F2EFE9">${escSvg(initial)}</text>`)
}

/** A title's initial: its first character, upper-cased (as the Ward's favicon.js takes it). */
export const initialOf = (title) => [...String(title ?? '').trim()][0]?.toUpperCase() || ''

/**
 * A town's icon from its BAKED Look: `look` is the manifest's `look` block (resolveIdentity of the baked scene's
 * identity, cartograph/bake-manifest.mjs). → { icon, from }: 'look.mark', or 'initial: its baked Look authors no mark'.
 * ⛔ The initial means only that: a town with no bake or a stale one is its caller's to refuse (scripts/towns-record.mjs).
 */
export function townIcon({ look, title }) {
  if (!look || typeof look !== 'object') throw new Error('townIcon: no baked look block — an unbaked or stale town has no icon to draw')
  if (look.mark) return { icon: iconFor({ mark: look.mark }), from: 'look.mark' }
  const initial = initialOf(title)
  if (!initial) throw new Error('townIcon: no mark and no title to take an initial from')
  return { icon: iconFor({ initial }), from: 'initial: its baked Look authors no mark' }
}
