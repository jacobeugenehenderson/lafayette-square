/**
 * building-address.mjs — each building's street address, carried from what the town's inputs already say, by identity.
 *
 * WHY (Jacob, 2026-09-29: "I think we need addresses… that's barely private"; rulings by Boz the same day). The Ward's
 * building card and "This is my house" need the address; the bake used to drop it.
 *
 * WHERE AN ADDRESS COMES FROM — in this order, and a lower source NEVER overwrites a higher one:
 *   1. `authored`             — the town's own record (its buildings ledger's `address`)
 *   2. `osm-building`         — the building's OWN OSM `addr:*` tags, then its OSM TWINS' (`twinOsmIds`: the OSM
 *                               buildings building-union.mjs matched to this footprint by containment/coverage)
 *   3. `osm-poi-in-footprint` — an OSM point carrying `addr:*` that lies INSIDE the footprint or one of its twin rings
 *                               (`joinRings`). ⛔ By containment only — never the nearest point.
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

function inRing(x, z, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (((a.z > z) !== (b.z > z)) && (x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x)) c = !c
  }
  return c
}
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

/**
 * @param b    { authored?: string, ownTags?: object, twinTags?: object[], rings: [{x,z}][] }
 * @param pois [{ address, x, z }] — the town's OSM points with an address
 * @returns    { address, addressSource, addressCandidates?, disagrees: boolean }
 */
export function resolveAddress(b, pois) {
  const poiAddrs = () => uniq(pois.filter((p) => b.rings.some((r) => r.length >= 3 && inRing(p.x, p.z, r))).map((p) => p.address))
  const pick = (source, cands) => {
    if (cands.length === 1) {
      const lower = source === 'osm-poi-in-footprint' ? [] : poiAddrs()
      return { address: cands[0], addressSource: source, disagrees: lower.some((a) => a !== cands[0]) }
    }
    return { address: null, addressSource: source, addressCandidates: cands, disagrees: false }
  }
  if (b.authored) return pick('authored', [tidy(b.authored)])
  const own = addressOfTags(b.ownTags)
  if (own) return pick('osm-building', [own])
  const twins = uniq((b.twinTags || []).map(addressOfTags))
  if (twins.length) return pick('osm-building', twins)
  const inside = poiAddrs()
  if (inside.length) return pick('osm-poi-in-footprint', inside)
  return { address: null, addressSource: null, disagrees: false }
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
