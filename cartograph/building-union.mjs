/**
 * building-union.mjs — A TOWN'S BUILDINGS ARE THE UNION OF ITS FOOTPRINT WELLS.
 *
 * ⛔ WHAT THIS REPLACES: when a town had Microsoft's ML footprints, pipeline.js used them
 * INSTEAD OF OSM's, so every building MSBF missed vanished. Provincetown lost the Crown &
 * Anchor, Whaler's Wharf, the Public Library, the Red Inn, the police station and more, all
 * mapped in OSM, and bake-content then called their listings "correctly absent".
 * ORIENTATION: "a census is the union of its wells — never let one source win and hide the others."
 *
 * ⭐ SAME BUILDING = TOPOLOGY, NOT A DISTANCE: an OSM footprint is the same building as an
 * MSBF footprint when either one's centroid lies inside the other, or when more than half of
 * the OSM footprint is already covered by MSBF. No metres to tune, so
 * nothing sized for one town. MSBF keeps the footprint where both exist (it is the kit's
 * geometry well); OSM adds what MSBF lacks. Provenance rides on the id: `msbf-<n>` · `osm-<id>`.
 */
const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p.x; z += p.z } return [x / r.length, z / r.length] }
function inRing(x, z, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j]
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}
const bbox = (r) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of r) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z } return { x0, x1, z0, z1 } }

function coveredShare(ring, bb, cands, N = 8) {
  let n = 0, hit = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = bb.x0 + ((i + 0.5) / N) * (bb.x1 - bb.x0), z = bb.z0 + ((j + 0.5) / N) * (bb.z1 - bb.z0)
    if (!inRing(x, z, ring)) continue
    n++; if (cands.some(m => inRing(x, z, m.b.coords))) hit++
  }
  return n ? hit / n : 0
}

/**
 * @param {Array} msbf  [{msbfId, coords:[{x,z,…}], tags}]
 * @param {Array} osm   [{osmId, coords:[{x,z,…}], tags}]  (only tagged `building` ways)
 * @returns {{ buildings, report: { msbf, osm, same, added } }}
 */
export function unionFootprints(msbf, osm) {
  const CELL = 64
  const grid = new Map()
  const key = (i, j) => i + ',' + j
  const M = msbf.filter(b => b.coords?.length >= 3).map(b => ({ b, c: centroid(b.coords), bb: bbox(b.coords) }))
  for (const m of M) {
    for (let i = Math.floor(m.bb.x0 / CELL); i <= Math.floor(m.bb.x1 / CELL); i++)
      for (let j = Math.floor(m.bb.z0 / CELL); j <= Math.floor(m.bb.z1 / CELL); j++) {
        const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(m)
      }
  }
  const out = msbf.slice()
  const msbfIndex = new Map(msbf.map((b, i) => [b, i]))
  let same = 0, added = 0, considered = 0
  for (const o of osm) {
    if (!o.coords || o.coords.length < 3 || !o.tags?.building) continue
    considered++
    const [cx, cz] = centroid(o.coords), bb = bbox(o.coords)
    const cands = new Set()
    for (let i = Math.floor(bb.x0 / CELL); i <= Math.floor(bb.x1 / CELL); i++)
      for (let j = Math.floor(bb.z0 / CELL); j <= Math.floor(bb.z1 / CELL); j++) for (const m of grid.get(key(i, j)) || []) cands.add(m)
    let dup = null
    for (const m of cands) if (inRing(cx, cz, m.b.coords) || inRing(m.c[0], m.c[1], o.coords)) { dup = m; break }
    // ⭐ And a footprint MOSTLY already drawn is the same building: OSM and MSBF of one building
    // can be offset (imagery registration) so neither centroid falls in the other. "Mostly" =
    // more than half its own area, sampled on its own bbox — a ratio, not a distance.
    if (!dup && cands.size && coveredShare(o.coords, bb, [...cands]) > 0.5) {
      // the MSBF footprint covering most of it is the twin
      dup = [...cands].sort((a, b) => coveredShare(o.coords, bb, [b]) - coveredShare(o.coords, bb, [a]))[0]
    }
    if (dup) {
      // ⭐ THE TWIN'S FOOTPRINT RIDES ALONG as a JOIN ring: MSBF's geometry is drawn, but a place
      // whose address point sits inside OSM's footprint (the datasets are offset by metres) still
      // joins THIS building. Identity carried, not a distance tolerance (provincetown, 2026-09-25:
      // the Black Dog, Ptown Blooms, Gallery 193, Enzo, the Masthead).
      const i = msbfIndex.get(dup.b)
      out[i] = { ...out[i], joinRings: [...(out[i].joinRings || []), o.coords], twinOsmIds: [...(out[i].twinOsmIds || []), o.osmId] }
      same++; continue
    }
    out.push({ osmId: o.osmId, coords: o.coords, isClosed: true, tags: { ...o.tags, source: 'osm' } })
    added++
  }
  return { buildings: out, report: { msbf: msbf.length, osm: considered, same, added } }
}
