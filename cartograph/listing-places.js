// listing-places.js — ONE PLACE PER (identity, building), and a listing is never named by its own address. Any town.
//
// ⭐ THE DEFECT (Ward's PTown sweep, 2026-10-30): the same place shipped twice from two producers. An OSM way and an OSM node
// for one business (loadOsmPois dedupes on `osmId|name`, so two OSM objects are never compared), and a research add beside
// its OSM twin (the add re-anchors address → parcel → the nearest building within 60 m, the OSM point the nearest within
// 25 m, so the two land on DIFFERENT footprints of one parcel and a building-keyed supersede missed them).
//
// ⭐ THE RULE: two listings with the same IDENTITY (normName) and a shared WITNESS (the same building, the same addressKey
// of their addresses, or the same parcel under their buildings) are one place. The kit never picks which one survives:
// the bake REFUSES, naming each pair as a `join_conflicts` entry, until the operator authors it in listings.overrides.json:
//   places: { merge: { "<kept>": ["<absorbed>", …] }, apart: [["<a>", "<b>"], …] }
// merge — the absorbed listings leave the slab and their ids stay reserved; apart — two places that share a name and a
// witness (a chain's two counters on one parcel). An entry names a listing by its source key (`_key`, OSM/Overture/a
// researched add without an id) or by its authored `id` (a researched add), in exactly ONE of the two: an entry that
// reaches both or neither refuses.
// ⛔ normName is the identity, so its limit is the rule's: "Crown & Anchor" and "Crown and Anchor Inn" are two identities.
// It is never widened into a fuzzy picker; the same-witness pairs whose names differ but one contains the other are
// REPORTED (nearMisses), never acted on.
//
// ⭐ A LISTING NAMED BY ITS OWN ADDRESS refuses ("9 Ryder Street" at 9 Ryder Street Extension): its normalised name is its
// own house number and a street that is its address's street or the start of it. The fix is a `name` patch, from the
// source or the operator. ⛔ No allow switch: never shown as-is.
// ▶ node checks/claims-a-town-lists-each-place-once.mjs

import { addressKey, addressParts, streetKey } from '../src/lib/addressKey.js'

export const normName = s => (s || '').toLowerCase().replace(/['’.]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim()

const label = (l) => `"${l.name}" ${l.id || l._key}${l.address ? ` at ${l.address}` : ''} on ${l.building_id}`

// an address is a witness only with a HOUSE: "Commercial Street", "REAR" or "Lot 7" names a street or a note, never one place
const housed = (addr) => (addressParts(addr).house ? addressKey(addr) : null)
// The witnesses two same-identity listings share, by name. `parcelOf` maps a building id to its parcel (any object with an
// identity; compared by its address key, else by itself); a town with no parcels passes an empty Map
export function witnessesOf(a, b, parcelOf) {
  const out = []
  if (a.building_id && a.building_id === b.building_id) out.push('building')
  const ka = housed(a.address), kb = housed(b.address)
  if (ka && ka === kb) out.push('address')
  const pa = parcelOf.get(a.building_id), pb = parcelOf.get(b.building_id), qa = pa && housed(pa.address)
  if (pa && pb && (pa === pb || (qa && qa === housed(pb.address)))) out.push('parcel')
  return out
}

// An authored `places` entry → the one listing it names, or why it names none. `_key` and `id` are two namespaces
function resolver(listings) {
  const byKey = new Map(), byId = new Map()
  for (const l of listings) { if (l._key) byKey.set(l._key, l); if (l.id) byId.set(l.id, l) }
  return (ref) => {
    const k = byKey.get(ref), i = byId.get(ref)
    if (k && i && k !== i) return { why: `"${ref}" names two listings, one by source key (${label(k)}) and one by id (${label(i)})` }
    if (!k && !i) return { why: `"${ref}" reaches no listing (neither a source key nor an id)` }
    return { l: k || i }
  }
}

/**
 * One place per (identity, building). → { listings, absorbed: [{ absorbed, kept }], conflicts, refusals, nearMisses }
 *   listings   the input minus the absorbed (an authored merge); order kept
 *   conflicts  `join_conflicts`: same identity, a shared witness, and no merge or apart for the pair
 *   refusals   authored entries that cannot be honoured (unresolved, two namespaces, a listing merged twice or into itself)
 *   nearMisses report only: a shared building or parcel, different identities, one name containing the other
 * Pure: the bake throws on conflicts or refusals (refusePlaces), the check calls this directly.
 */
export function onePlacePerIdentity(listings, { places = {}, parcelOf = new Map() } = {}) {
  const resolve = resolver(listings), refusals = [], absorbed = [], gone = new Set(), apart = new Set()
  const pair = (a, b) => [a, b].sort().join('\u0000')
  const idOf = (l) => listings.indexOf(l)
  for (const [keep, list] of Object.entries(places.merge || {})) {
    const k = resolve(keep); if (k.why) { refusals.push(`merge: ${k.why}`); continue }
    for (const ref of list || []) {
      const a = resolve(ref); if (a.why) { refusals.push(`merge into "${keep}": ${a.why}`); continue }
      if (a.l === k.l) { refusals.push(`merge: "${ref}" is merged into itself`); continue }
      if (gone.has(a.l)) { refusals.push(`merge: "${ref}" is absorbed twice`); continue }
      gone.add(a.l); absorbed.push({ absorbed: a.l, kept: k.l })
    }
  }
  for (const k of [...gone]) if (absorbed.some(x => x.kept === k)) refusals.push(`merge: ${label(k)} is kept and absorbed at once`)
  for (const [x, y] of places.apart || []) {
    const a = resolve(x), b = resolve(y)
    if (a.why || b.why) { refusals.push(`apart: ${a.why || b.why}`); continue }
    apart.add(pair(idOf(a.l), idOf(b.l)))
  }
  const kept = listings.filter(l => !gone.has(l)), groups = new Map()
  for (const l of kept) { const n = normName(l.name); if (!groups.has(n)) groups.set(n, []); groups.get(n).push(l) }
  const conflicts = []
  for (const g of groups.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const w = witnessesOf(g[i], g[j], parcelOf)
    if (w.length && !apart.has(pair(idOf(g[i]), idOf(g[j])))) conflicts.push({ a: g[i], b: g[j], witnesses: w })
  }
  // report only: one building or parcel, two identities, one name inside the other ("Crown and Anchor" · "Crown and Anchor Inn")
  const nearMisses = [], byPlace = new Map()
  for (const l of kept) for (const p of [l.building_id && `b:${l.building_id}`, parcelOf.get(l.building_id) && `p:${addressKey(parcelOf.get(l.building_id).address) || l.building_id}`].filter(Boolean)) {
    if (!byPlace.has(p)) byPlace.set(p, []); byPlace.get(p).push(l) }
  const seenNear = new Set()
  for (const g of byPlace.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = normName(g[i].name), b = normName(g[j].name), key = pair(idOf(g[i]), idOf(g[j]))
    if (a === b || seenNear.has(key) || !(a.includes(b) || b.includes(a))) continue
    seenNear.add(key); nearMisses.push({ a: g[i], b: g[j] })
  }
  return { listings: kept, absorbed, conflicts, refusals, nearMisses }
}

/**
 * ⭐ THE ONE "ABSORBED → SURVIVOR" RESOLVER, read from an authored `places.merge` (Boz, 2026-10-30). Research keyed to a
 * listing a merge absorbed belongs to the place it was merged into: the bake's patch join (bake-content.js
 * #applyListingOverrides) and the research check (claims-research-is-keyed-to-the-place-it-describes) both resolve through
 * this, never a hand re-keying of the research.
 *   places  listings.overrides.json's `places`; ids  the town's id registry `ids` (source key → display id), {} where none
 *   → { ref(r): the survivor's ref for an absorbed ref, else r · id(d): the survivor's display id for an absorbed one, else d }
 * A ref is a source key or an authored id, as `places.merge` names them; a display id is what research files are keyed by.
 */
export function survivorOf(places = {}, ids = {}) {
  const byRef = new Map(), byId = new Map(), shown = (r) => ids[r] ?? r
  for (const [kept, list] of Object.entries(places?.merge || {})) for (const a of list || []) { byRef.set(a, kept); byId.set(shown(a), shown(kept)) }
  return { ref: (r) => byRef.get(r) ?? r, id: (d) => byId.get(d) ?? d }
}

// The per-field rule when an absorbed listing's research reaches its survivor (Boz, 2026-10-30): the same value → nothing;
// the survivor holds none → the research fills it; a different value → a CONFLICT, refused by name (the kit never picks;
// the operator deletes the field it does not want from the absorbed patch). → { fill: {field: value}, conflicts: [field] }
const emptyValue = (v) => v == null || v === '' || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length)
// one value, whatever order its keys were written in (an hours object authored twice is the same hours)
const canon = (v) => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x)
export function absorbedResearch(fields, survivor) {
  const fill = {}, conflicts = []
  for (const [f, v] of Object.entries(fields)) {
    if (canon(survivor[f]) === canon(v)) continue
    if (emptyValue(survivor[f])) fill[f] = v; else conflicts.push(f)
  }
  return { fill, conflicts }
}

/** A listing named by its own address: its house number and its address's street (or the start of it). → listings */
export function addressNamed(listings) {
  return listings.filter(l => {
    const m = /^(\d+[a-z]?)\s+(.+)$/i.exec(String(l.name || '').trim()); if (!m) return false
    const own = addressParts(l.address), said = streetKey(m[2])
    if (!own.house || !own.street || !said) return false
    return m[1].toUpperCase().replace(/[A-Z]$/, '') === own.house && (own.street === said || own.street.startsWith(said + ' '))
  })
}

/** The bake's verdict: throws naming every conflict, refusal and address-named listing; else prints the merges and near-misses */
export function refusePlaces(scene, r, named, { handCurated = false } = {}) {
  for (const x of r.absorbed) console.log(`    merged: ${label(x.absorbed)} → ${label(x.kept)} (its id stays reserved)`)
  if (r.nearMisses.length) {
    console.log(`    ${r.nearMisses.length} same-place pair(s) whose names differ, one inside the other (report only: two identities, never merged by the kit):`)
    for (const x of r.nearMisses.slice(0, 10)) console.log(`      ${label(x.a)} · ${label(x.b)}`)
  }
  const lines = [
    ...r.conflicts.map(c => `join conflict: ${label(c.a)} · ${label(c.b)} — one identity, the same ${c.witnesses.join(' + ')}`),
    ...r.refusals.map(x => `places: ${x}`),
    ...named.map(l => `named by its address: ${label(l)} — a visitor would read an address as a name`),
  ]
  if (!lines.length) return
  const how = handCurated
    ? 'this town keeps its listings by hand (meta.baseSource "hand-curated"): merge or rename them in content/listings.json itself.'
    : 'author each in content/listings.overrides.json — places.merge { "<kept>": ["<absorbed>"] } for one place\'s twins, places.apart [["<a>", "<b>"]] for two places, or a `name` patch for an address-named listing.'
  throw new Error(`[bake-content] ⛔ ${scene}: ${lines.length} listing(s) the kit will not ship as they are (one place per identity and building; never an address as a name):\n` +
    lines.map(x => `     ${x}`).join('\n') + `\n   ▶ ${how}`)
}
