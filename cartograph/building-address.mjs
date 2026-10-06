/**
 * building-address.mjs — each building's street address, carried from what the town's inputs already say, by identity.
 *
 * WHY (Jacob, 2026-09-29: "I think we need addresses… that's barely private"; rulings by Boz the same day). The Ward's
 * building card and "This is my house" need the address; the bake used to drop it.
 *
 * WHERE AN ADDRESS COMES FROM — in this order (Jacob, 2026-09-29), and a lower source NEVER overwrites a higher one:
 *   1. `authored`                — the town's own record (its buildings ledger's `address`)
 *   1b. `address-point-by-id`    — a declared address point carrying the building's PERMANENT id (NYC: the BIN on both;
 *                                  BRIEF-nyc-adapter §3.2a). IDENTITY first; containment is then the CHECK — a point
 *                                  that names this building but stands outside it and its parcel, or one inside it
 *                                  that names another building, is returned in `idContainment` and PRINTED by name,
 *                                  never re-assigned.
 *   2. `address-point`           — a declared address point (county/state E-911 — cartograph/address-points.mjs) INSIDE
 *                                  the footprint or a twin ring
 *   3. `address-point-in-parcel` — the address points inside the PARCEL the building's centroid stands in (E-911 points
 *                                  sit toward the road, off the roof; the parcel is the containment that reaches them)
 *   4. `osm-building`            — the building's OWN OSM `addr:*` tags, then its OSM TWINS' (`twinOsmIds`: the OSM
 *                                  buildings building-union.mjs matched to this footprint by containment/coverage)
 *   5. `osm-poi-in-footprint`    — an OSM point carrying `addr:*` INSIDE the footprint or a twin ring
 * ⛔ Every join is containment — never the nearest point.
 * ⭐ E-911 points outrank OSM: field-verified and maintained for dispatch, where OSM is volunteer-drawn.
 * ⭐ An address point's units (2115 A / 2115 B) ride as `addressUnits`; the building's address has no unit.
 * ⛔ SEVERAL DIFFERENT ADDRESSES AT ONE LEVEL (a corner building, a duplex, two twins) → `address: null` and
 *    `addressCandidates: [...]` — never pick one. No address → null. Never guessed, never interpolated.
 * ⭐ The words are the source's: housenumber + street, whitespace collapsed, nothing expanded or re-cased (the Ward
 *    formats for display). A lower source that disagrees with the chosen address is counted, not applied.
 * Pure. ▶ node checks/claims-every-building-has-an-address.mjs
 */

/** Housenumber + street, the source's words, whitespace collapsed; null unless both are there. */
export function addressOfTags(tags) {
  const n = tags?.['addr:housenumber'], s = tags?.['addr:street']
  if (!n || !s) return null
  return tidy(`${n} ${s}`)
}
export const tidy = (s) => String(s).replace(/\s+/g, ' ').trim()

/** Is (x, z) inside `ring` ([{x,z}])? Even-odd. The one containment test every address join uses. */
export function inRing(x, z, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (((a.z > z) !== (b.z > z)) && (x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x)) c = !c
  }
  return c
}
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

/**
 * @param b    { authored?: string, ownTags?: object, twinTags?: object[], rings: [{x,z}][], keyKind?, permanentId? }
 * @param pois [{ address, x, z }] — the town's OSM points with an address
 * @param ctx  { addressPoints?: [{ address, unit, x, z }], parcelPoints?: (b) => [{ address, unit }] }
 * @returns    { address, addressSource, addressCandidates?, addressUnits?, disagrees: boolean }
 */
export function resolveAddress(b, pois, ctx = {}) {
  const inside = (pts) => pts.filter((p) => b.rings.some((r) => r.length >= 3 && inRing(p.x, p.z, r)))
  const apIn = inside(ctx.addressPoints || [])
  const apParcel = ctx.parcelPoints ? ctx.parcelPoints(b) : []
  const k = b.permanentId != null ? b.keyKind : null
  const byId = k ? (ctx.addressPoints || []).filter((p) => p[k] === b.permanentId) : []
  const idContainment = k ? {
    outside: byId.filter((p) => !apIn.includes(p) && !apParcel.includes(p)).map((p) => p.address),
    foreignInside: apIn.filter((p) => p[k] != null && p[k] !== b.permanentId).map((p) => `${p.address} (${k} ${p[k]})`),
  } : null
  const own = addressOfTags(b.ownTags)
  // Each level: [source, its distinct addresses, the points it came from (for units)]. ⛔ Order is precedence.
  const levels = [
    ['authored', b.authored ? [tidy(b.authored)] : [], []],
    ['address-point-by-id', uniq(byId.map((p) => p.address)), byId],
    ['address-point', uniq(apIn.map((p) => p.address)), apIn],
    ['address-point-in-parcel', uniq(apParcel.map((p) => p.address)), apParcel],
    ['osm-building', own ? [own] : [], []],
    ['osm-building', uniq((b.twinTags || []).map(addressOfTags)), []],
    ['osm-poi-in-footprint', uniq(inside(pois).map((p) => p.address)), []],
  ]
  const idc = idContainment && (idContainment.outside.length || idContainment.foreignInside.length) ? { idContainment } : {}
  const at = levels.findIndex(([, cands]) => cands.length)
  if (at < 0) return { address: null, addressSource: null, disagrees: false, ...idc }
  const [source, cands, pts] = levels[at]
  if (cands.length > 1) return { address: null, addressSource: source, addressCandidates: cands, disagrees: false, ...idc }
  const address = cands[0]
  const units = uniq(pts.filter((p) => p.address === address).map((p) => p.unit)).sort()
  const disagrees = levels.slice(at + 1).some(([, lower]) => lower.some((a) => a !== address))
  return { address, addressSource: source, ...(units.length && { addressUnits: units }), disagrees, ...idc }
}

/**
 * What the INPUT OFFERS, measured by containment (Boz, 2026-09-29: coverage is judged against what the input has, not
 * only the building count): a building OFFERS an address when an addressed OSM building's centroid, or an address point,
 * lies inside its footprint or a twin ring. A building that is offered one and carries none was LOST by the join.
 * `points` = [{ x, z }]. Returns a predicate over rings. A grid keeps it linear on a 15,000-building town.
 */
export function offeredBy(points, cell = 50) {
  const grid = new Map(), key = (i, j) => `${i},${j}`
  for (const p of points) { const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p) }
  return (rings) => {
    for (const r of rings) {
      if (!r || r.length < 3) continue
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z) }
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
        for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++)
          for (const p of grid.get(key(i, j)) || []) if (inRing(p.x, p.z, r)) return true
    }
    return false
  }
}

/**
 * The parcel each building stands in, and the points each parcel holds — the containment that reaches E-911 points
 * sitting toward the road. `parcels` = [rings] ([[{x,z}]]), `points` = [{address, unit, x, z}]. Returns
 * (b) => the points inside the parcel containing b's footprint centroid (none when it stands in no parcel).
 */
export function parcelPointsOf(parcels, points, cell = 100) {
  const grid = new Map(), key = (i, j) => `${i},${j}`
  const bbox = parcels.map((rings) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z) }
    return { x0, x1, z0, z1 }
  })
  bbox.forEach((bb, i) => {
    for (let a = Math.floor(bb.x0 / cell); a <= Math.floor(bb.x1 / cell); a++)
      for (let c = Math.floor(bb.z0 / cell); c <= Math.floor(bb.z1 / cell); c++) { const k = key(a, c); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i) }
  })
  const parcelAt = (x, z) => (grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []).find((i) => parcels[i].some((r) => inRing(x, z, r)))
  const held = new Map()
  for (const p of points) { const i = parcelAt(p.x, p.z); if (i == null) continue; if (!held.has(i)) held.set(i, []); held.get(i).push(p) }
  return (b) => {
    const r = b.rings?.[0]
    if (!r?.length) return []
    const cx = r.reduce((a, q) => a + q.x, 0) / r.length, cz = r.reduce((a, q) => a + q.z, 0) / r.length
    const i = parcelAt(cx, cz)
    return i == null ? [] : (held.get(i) || [])
  }
}

/** The town's census of what was carried. `resolved[i].offered` / `.id` (optional) feed the LOST count. */
export function addressCensus(resolved, incomplete = null) {
  const c = { buildings: resolved.length, withAddress: 0, ambiguous: 0, none: 0, offered: 0, lost: 0, lostIds: [], disagreements: 0, bySource: {} }
  for (const r of resolved) {
    if (r.address) { c.withAddress++; c.bySource[r.addressSource] = (c.bySource[r.addressSource] || 0) + 1 }
    else if (r.addressCandidates) c.ambiguous++
    else c.none++
    if (r.disagrees) c.disagreements++
    if (r.offered) {
      c.offered++
      if (!r.address && !r.addressCandidates) { c.lost++; if (c.lostIds.length < 20) c.lostIds.push(r.id ?? null) }
    }
  }
  if (incomplete) c.incomplete = incomplete
  return c
}
