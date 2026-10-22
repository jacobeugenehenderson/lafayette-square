// claims-a-land-use-boundary-is-one-line.mjs — WHERE TWO LAND-USE CLASSES TOUCH, THEIR SHARED BOUNDARY IS ONE POLYLINE.
//
// ⭐ WHY (Boz's ruling, 2026-10-21, on HPDM's stamp refusal; RIBBONS: one line, one producer): `derive.js#layerLandEvidence`
//   cuts each class's evidence by its OWN boolean, so where an OSM polygon meets a parcel class the boundary leaves as two
//   independently rounded polylines. Measured on HPDM (Kerf's stamp dump, 2026-10-21): recreation's OSM edge and vacant's
//   copy of it, 0.369 mm apart at vacant's rounded crossing. ② crossed both within a grid unit, and the stamp's crossing
//   pass (tileGround#stampCrossings) could not settle: "did not settle in 8 rounds". The stamp was right to refuse; the
//   INPUT draws one line twice.
// ⭐ THE PREDICATE, read, never restated: for every vertex of one region that lies within the paint's own noding bound
//   (bake-ground.js#NODE_BOUND, imported; in Clipper units, so ÷ CLIP_SCALE metres) of another region's edge, that vertex
//   is ON the edge (distance 0) or IS one of its endpoints. A vertex 0 < d ≤ bound off another class's edge is a DOUBLED
//   line: two copies of one boundary, closer than the lattice can tell apart. Farther than the bound is a separate line
//   and is not this check's business. ⛔ No tolerance of its own: the bound is the paint's.
// ROWS: per town, its frozen evidence (the ribbons' `landEvidence`, the map the painter reads): the doubled vertices, by
//   class pair, with the first sites. RED where true. A town whose ribbons carry no evidence is NOT CHECKED, said.
//   node checks/claims-a-land-use-boundary-is-one-line.mjs [--scene=<id>] [--selftest]
// ⭐ MUTATION TEST (`--selftest`, synthetic, in memory): an exact shared boundary → one line (GREEN) · the HPDM shape, one
//   copy's end 0.369 mm off the other's line → DOUBLED (RED) · a vertex exactly on the other's edge → GREEN · 5 mm off (a
//   separate line) → GREEN · and the PRODUCER itself, layerLandEvidence on an OSM polygon and a parcel cut by it, is run and
//   its verdict printed (RED today; it turns GREEN when derive.js leaves the evidence as one partition).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, ribbonsPath, declaredScenes, requestedScenes } from './_scenes.mjs'
import { NODE_BOUND } from '../cartograph/bake-ground.js'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { layerLandEvidence } from '../cartograph/derive.js'

const BOUND = NODE_BOUND / CLIP_SCALE   // metres

/** The doubled vertices among `regions` ([{ lu, rings }]): [{ at, mm, a, b }], each a vertex of region a lying 0 < d ≤ bound
 *  off an edge of region b (a different region) without being on it or one of its endpoints. */
export function doubled(regions, bound = BOUND) {
  const K = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
  const G = 4, grid = new Map(), out = []
  const edges = []
  regions.forEach((R, ri) => { for (const r of R.rings || []) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]
    const e = { ri, p, q }; edges.push(e)
    for (let x = Math.floor((Math.min(p[0], q[0]) - bound) / G); x <= Math.floor((Math.max(p[0], q[0]) + bound) / G); x++)
      for (let z = Math.floor((Math.min(p[1], q[1]) - bound) / G); z <= Math.floor((Math.max(p[1], q[1]) + bound) / G); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(e) } } })
  regions.forEach((R, ri) => { for (const r of R.rings || []) for (const v of r) {
    for (const e of grid.get(Math.floor(v[0] / G) + ',' + Math.floor(v[1] / G)) || []) {
      if (e.ri === ri) continue
      // ON the lattice, in Clipper's integer units, so "on the edge" is an exact zero cross product (stampCrossings' own test)
      const V = K(v), P = K(e.p), Q = K(e.q), dx = Q[0] - P[0], dz = Q[1] - P[1], L2 = dx * dx + dz * dz; if (!L2) continue
      if ((V[0] === P[0] && V[1] === P[1]) || (V[0] === Q[0] && V[1] === Q[1])) continue
      const u = ((V[0] - P[0]) * dx + (V[1] - P[1]) * dz) / L2; if (u <= 0 || u >= 1) continue
      const cross = (V[0] - P[0]) * dz - (V[1] - P[1]) * dx, d = Math.abs(cross) / Math.sqrt(L2) / CLIP_SCALE
      if (cross !== 0 && d <= bound) { out.push({ at: v, mm: +(d * 1000).toFixed(4), a: R.lu, b: regions[e.ri].lu }); break } } } })
  return out
}

if (process.argv.includes('--selftest')) {
  const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
  const A = { lu: 'recreation', rings: [[[-1622.39, -2367.69], [-1620.99, -2381.87], [-1610, -2381.87], [-1610, -2367.69]]] }
  const rows = [
    ['an exact shared boundary is one line', doubled([{ lu: 'a', rings: [sq(0, 0, 10, 10)] }, { lu: 'b', rings: [sq(10, 0, 20, 10)] }]).length === 0],
    ['the HPDM shape (one copy\'s end 0.369 mm off the other\'s line) is DOUBLED', doubled([A, { lu: 'vacant', rings: [[[-1620.99, -2381.87], [-1621.657, -2375.118], [-1625, -2375.2], [-1625, -2381.6]]] }]).length > 0],
    ['a vertex exactly ON the other\'s edge is one line', doubled([{ lu: 'a', rings: [sq(0, 0, 10, 10)] }, { lu: 'b', rings: [[[10, 0], [10, 5], [20, 5], [20, 0]]] }]).length === 0],
    ['5 mm off is a separate line, not this check\'s', doubled([{ lu: 'a', rings: [sq(0, 0, 10, 10)] }, { lu: 'b', rings: [[[10.005, 2], [10.005, 8], [20, 8], [20, 2]]] }]).length === 0],
  ]
  let bad = 0
  for (const [what, ok] of rows) { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad++ }
  // the PRODUCER: an OSM polygon, and a parcel of another class that it cuts along an oblique edge
  const osm = [{ lu: 'recreation', tag: 'leisure:park', ring: [[0, 0], [7.003, 101.3], [60, 100], [60, 0]].map(([x, z]) => ({ x, z })) }]
  const parcels = [{ lu: 'vacant', rings: [[[-20, 30.1234], [20, 30.1234], [20, 70.4567], [-20, 70.4567]]] }]
  const ev = layerLandEvidence(osm, parcels).evidence, P = doubled(ev)
  console.log(`  ${P.length ? '⚠️ ' : '✅'} the producer (layerLandEvidence: an OSM polygon and a parcel it cuts): ${P.length} doubled vertex(es)${P.length ? ` — e.g. ${P[0].a}|${P[0].b} at (${P[0].at}), ${P[0].mm} mm off (the boundary leaves as two lines; RED until derive.js leaves one partition)` : ' (one partition)'}`)
  process.exit(bad ? 1 : 0)
}

const asked = requestedScenes(), towns = asked.length ? asked : declaredScenes()
let red = 0
for (const s of towns) {
  const p = join(ROOT, ribbonsPath(s))
  if (!existsSync(p)) { console.log(`   ⚠️ ${s}: NOT CHECKED (no ribbons at ${ribbonsPath(s)})`); continue }
  const j = JSON.parse(readFileSync(p, 'utf8')), ev = j.landEvidence ?? j.layers?.ribbons?.landEvidence
  if (!Array.isArray(ev)) { console.log(`   ⚠️ ${s}: NOT CHECKED (its ribbons carry no landEvidence)`); continue }
  const D = doubled(ev), pairs = {}
  for (const d of D) { const k = [d.a, d.b].sort().join(' | '); pairs[k] = (pairs[k] || 0) + 1 }
  if (D.length) red++
  console.log(`${D.length ? '⛔' : '✅'} ${s}: ${ev.length} region(s) · ${D.length} doubled vertex(es) (0 < d ≤ ${(BOUND * 1000).toFixed(3)} mm off another class's edge)`
    + (D.length ? `\n     by pair: ${Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`).join(' · ')}\n     first: ${D.slice(0, 3).map(d => `(${d.at.join(', ')}) ${d.a}|${d.b} ${d.mm} mm`).join(' · ')}` : ''))
}
console.log(red ? `\n⛔ ${red} town(s) draw a land-use boundary twice (derive.js#layerLandEvidence: each class its own boolean)` : '\n✅ every land-use boundary is one line')
process.exit(red ? 1 : 0)
