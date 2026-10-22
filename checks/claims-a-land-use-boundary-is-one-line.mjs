// claims-a-land-use-boundary-is-one-line.mjs — WHERE TWO LAND-USE CLASSES TOUCH, THEIR SHARED BOUNDARY IS ONE POLYLINE.
//
// ⭐ WHY (Boz's ruling, 2026-10-21, on HPDM's stamp refusal; RIBBONS: one line, one producer): `derive.js#layerLandEvidence`
//   cuts each class's evidence by its OWN boolean, so where an OSM polygon meets a parcel class the boundary leaves as two
//   independently rounded polylines. Measured on HPDM (Kerf's stamp dump, 2026-10-21): recreation's OSM edge and vacant's
//   copy of it, 0.369 mm apart at vacant's rounded crossing. ② crossed both within a grid unit, and the stamp's crossing
//   pass (tileGround#stampCrossings) could not settle: "did not settle in 8 rounds". The stamp was right to refuse; the
//   INPUT draws one line twice.
// ⭐ THE PREDICATE, read, never restated: for every vertex of one region that lies within the paint's own noding bound
//   (src/lib/latticeNode.js#NODE_BOUND, imported; in Clipper units, so ÷ CLIP_SCALE metres) of another region's edge, that vertex
//   is ON the edge (distance 0) or IS one of its endpoints. A vertex 0 < d ≤ bound off another class's edge is a DOUBLED
//   line: two copies of one boundary, closer than the lattice can tell apart. Farther than the bound is a separate line
//   and is not this check's business. ⛔ No tolerance of its own: the bound is the paint's.
// ⭐ AND NO REGION PINCHES (Boz's ruling, 2026-10-21, on the 11 HPDM sites the noding left): a ring that comes back within the
//   same bound of one of its OWN edges, or touches itself, is a PINCH: one region narrowing below the lattice. The noder rightly
//   never inserts a point a ring already carries, so a site where the other ring already has the point is named HERE, in that
//   ring, never as a doubled line. The remedy is the paint's splitAtPinches, before the noding. RED where true.
// ROWS: per town, its frozen evidence (the ribbons' `landEvidence`, the map the painter reads): the doubled vertices, by
//   class pair, with the first sites. RED where true. A town whose ribbons carry no evidence is NOT CHECKED, said.
//   node checks/claims-a-land-use-boundary-is-one-line.mjs [--scene=<id>] [--selftest]
// ⭐ MUTATION TEST (`--selftest`, synthetic, in memory): an exact shared boundary → one line (GREEN) · the HPDM shape, one
//   copy's end 0.369 mm off the other's line → DOUBLED (RED) · a vertex exactly on the other's edge → GREEN · 5 mm off (a
//   separate line) → GREEN · and the PRODUCER itself, layerLandEvidence on an OSM polygon and a parcel cut by it, is run and
//   must leave one partition (GREEN), and the same with derive.js's noding pass removed must not (RED: the mutant).
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ROOT, ribbonsPath, declaredScenes, requestedScenes } from './_scenes.mjs'
import { NODE_BOUND } from '../src/lib/latticeNode.js'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { layerLandEvidence } from '../cartograph/derive.js'

const BOUND = NODE_BOUND / CLIP_SCALE   // metres

/** The doubled vertices among `regions` ([{ lu, rings }]): [{ at, mm, a, b }], each a vertex of region a lying 0 < d ≤ bound
 *  off an edge of region b (a different region) without being on it or one of its endpoints. */
export function doubled(regions, bound = BOUND) {
  const K = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
  const G = 4, grid = new Map(), out = []
  const edges = []
  regions.forEach((R, ri) => { for (const r of R.rings || []) { const has = new Set(r.map(v => K(v).join(',')))
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]
    const e = { ri, p, q, has }; edges.push(e)
    for (let x = Math.floor((Math.min(p[0], q[0]) - bound) / G); x <= Math.floor((Math.max(p[0], q[0]) + bound) / G); x++)
      for (let z = Math.floor((Math.min(p[1], q[1]) - bound) / G); z <= Math.floor((Math.max(p[1], q[1]) + bound) / G); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(e) } } } })
  regions.forEach((R, ri) => { for (const r of R.rings || []) for (const v of r) {
    for (const e of grid.get(Math.floor(v[0] / G) + ',' + Math.floor(v[1] / G)) || []) {
      if (e.ri === ri) continue
      // ⭐ the other ring already carries this point as a vertex ELSEWHERE: not a second copy of a line, a PINCH in that ring
      // (`pinches`, below, names it there), which the noder rightly does not insert twice
      if (e.has.has(K(v).join(','))) continue
      // ON the lattice, in Clipper's integer units, so "on the edge" is an exact zero cross product (stampCrossings' own test)
      const V = K(v), P = K(e.p), Q = K(e.q), dx = Q[0] - P[0], dz = Q[1] - P[1], L2 = dx * dx + dz * dz; if (!L2) continue
      if ((V[0] === P[0] && V[1] === P[1]) || (V[0] === Q[0] && V[1] === Q[1])) continue
      const u = ((V[0] - P[0]) * dx + (V[1] - P[1]) * dz) / L2; if (u <= 0 || u >= 1) continue
      const cross = (V[0] - P[0]) * dz - (V[1] - P[1]) * dx, d = Math.abs(cross) / Math.sqrt(L2) / CLIP_SCALE
      if (cross !== 0 && d <= bound) { out.push({ at: v, mm: +(d * 1000).toFixed(4), a: R.lu, b: regions[e.ri].lu }); break } } } })
  return out
}

/** The PINCHES among `regions`: a ring that comes back within the bound of itself, so one region's ground narrows below the
 *  lattice: [{ at, mm, lu }] — a vertex of a ring lying 0 < d ≤ bound off one of that ring's OWN edges not incident to it, or
 *  ON one (d = 0, the ring touching itself), or the same lattice point visited twice, non-consecutively. ⛔ The paint's
 *  `splitAtPinches` is the remedy (derive splits before it nodes, Boz 2026-10-21); this only names them. */
export function pinches(regions, bound = BOUND) {
  const K = (p) => [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)], G = 4, out = []
  for (const R of regions) for (const r of R.rings || []) {
    const n = r.length, k = r.map(K), grid = new Map(), seen = new Map()
    for (let i = 0; i < n; i++) { const s0 = k[i].join(','); if (seen.has(s0) && seen.get(s0) !== (i - 1 + n) % n) out.push({ at: r[i], mm: 0, lu: R.lu, kind: 'revisit' }); seen.set(s0, i)
      const p = r[i], q = r[(i + 1) % n]
      for (let x = Math.floor((Math.min(p[0], q[0]) - bound) / G); x <= Math.floor((Math.max(p[0], q[0]) + bound) / G); x++)
        for (let z = Math.floor((Math.min(p[1], q[1]) - bound) / G); z <= Math.floor((Math.max(p[1], q[1]) + bound) / G); z++) { const c = x + ',' + z; (grid.get(c) || grid.set(c, []).get(c)).push(i) } }
    for (let j = 0; j < n; j++) { const V = k[j]
      for (const i of grid.get(Math.floor(r[j][0] / G) + ',' + Math.floor(r[j][1] / G)) || []) {
        if (i === j || (i + 1) % n === j) continue                       // an edge incident to this vertex is not a return
        const P = k[i], Q = k[(i + 1) % n], dx = Q[0] - P[0], dz = Q[1] - P[1], L2 = dx * dx + dz * dz; if (!L2) continue
        if ((V[0] === P[0] && V[1] === P[1]) || (V[0] === Q[0] && V[1] === Q[1])) continue   // a revisit, counted above
        const u = ((V[0] - P[0]) * dx + (V[1] - P[1]) * dz) / L2; if (u <= 0 || u >= 1) continue
        const d = Math.abs((V[0] - P[0]) * dz - (V[1] - P[1]) * dx) / Math.sqrt(L2) / CLIP_SCALE
        if (d <= bound) { out.push({ at: r[j], mm: +(d * 1000).toFixed(4), lu: R.lu, kind: 'neck' }); break } } } }
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
    // a PINCH: B's ring comes back to within 0.4 mm of its own edge, at a point B also carries; A's vertex sits there
    ['a ring that comes back within the bound of its own edge is a PINCH', pinches([{ lu: 'b', rings: [[[0, 0], [10, 0], [10, 10], [5, 0.0004], [0, 10]]] }]).length > 0],
    ['a ring touching itself at one point (a revisit) is a PINCH', pinches([{ lu: 'b', rings: [[[0, 0], [5, 5], [10, 0], [10, 10], [5, 5], [0, 10]]] }]).length > 0],
    ['a plain ring has no pinch', pinches([{ lu: 'b', rings: [sq(0, 0, 10, 10)] }]).length === 0],
    ['a site where the other ring already carries the point is a pinch there, never a doubled line', doubled([{ lu: 'a', rings: [[[5, 0.0004], [5, -10], [-5, -10]]] }, { lu: 'b', rings: [[[0, 0], [10, 0], [10, 10], [5, 0.0004], [0, 10]]] }]).length === 0],
  ]
  let bad = 0
  for (const [what, ok] of rows) { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad++ }
  // the PRODUCER: an OSM polygon, and a parcel of another class that it cuts along an oblique edge
  const osm = [{ lu: 'recreation', tag: 'leisure:park', ring: [[0, 0], [7.003, 101.3], [60, 100], [60, 0]].map(([x, z]) => ({ x, z })) }]
  const parcels = [{ lu: 'vacant', rings: [[[-20, 30.1234], [20, 30.1234], [20, 70.4567], [-20, 70.4567]]] }]
  const producer = (fn) => { const log = console.log; console.log = () => {}; try { return doubled(fn(osm, parcels).evidence) } finally { console.log = log } }
  const P = producer(layerLandEvidence)
  console.log(`  ${P.length ? '⛔' : '✅'} the producer (layerLandEvidence: an OSM polygon and a parcel it cuts): ${P.length} doubled vertex(es)${P.length ? ` — e.g. ${P[0].a}|${P[0].b} at (${P[0].at}), ${P[0].mm} mm off (the boundary leaves as two lines)` : ' (one partition)'}`)
  if (P.length) bad++
  // MUTANT: derive.js with its noding pass removed (a copy in the OS temp dir, its imports made absolute) must turn that row RED
  const dSrc = readFileSync(join(ROOT, 'cartograph/derive.js'), 'utf8'), PASS = '  noded.forEach((n, i) => { evidence[i].rings = n.items })\n'
  if (dSrc.split(PASS).length !== 2) { console.log('  ⛔ mutant: derive.js no longer carries the noding pass this mutant removes — re-aim it'); bad++ }
  else {
    const abs = (rel, from) => pathToFileURL(join(from, rel)).href, D = join(ROOT, 'cartograph')
    const mSrc = dSrc.replace(PASS, '').replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from '${abs(r, D)}'`)
      .replace(/from 'clipper-lib'/g, `from '${pathToFileURL(createRequire(import.meta.url).resolve('clipper-lib')).href}'`)
    const f = join(mkdtempSync(join(tmpdir(), 'land-one-line-')), 'derive.js'); writeFileSync(f, mSrc)
    const M = producer((await import(pathToFileURL(f).href)).layerLandEvidence)
    console.log(`  ${M.length ? '✅' : '⛔'} mutant: derive.js without its noding pass → the producer row ${M.length ? `RED (${M.length} doubled), as it must be` : 'still GREEN — this row cannot see the pass'}`)
    if (!M.length) bad++
  }
  process.exit(bad ? 1 : 0)
}

const asked = requestedScenes(), towns = asked.length ? asked : declaredScenes()
let red = 0
for (const s of towns) {
  const p = join(ROOT, ribbonsPath(s))
  if (!existsSync(p)) { console.log(`   ⚠️ ${s}: NOT CHECKED (no ribbons at ${ribbonsPath(s)})`); continue }
  const j = JSON.parse(readFileSync(p, 'utf8')), ev = j.landEvidence ?? j.layers?.ribbons?.landEvidence
  if (!Array.isArray(ev)) { console.log(`   ⚠️ ${s}: NOT CHECKED (its ribbons carry no landEvidence)`); continue }
  const D = doubled(ev), N = pinches(ev), pairs = {}
  for (const d of D) { const k = [d.a, d.b].sort().join(' | '); pairs[k] = (pairs[k] || 0) + 1 }
  if (D.length || N.length) red++
  console.log(`${D.length ? '⛔' : '✅'} ${s}: ${ev.length} region(s) · ${D.length} doubled vertex(es) (0 < d ≤ ${(BOUND * 1000).toFixed(3)} mm off another class's edge)`
    + (D.length ? `\n     by pair: ${Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`).join(' · ')}\n     first: ${D.slice(0, 3).map(d => `(${d.at.join(', ')}) ${d.a}|${d.b} ${d.mm} mm`).join(' · ')}` : ''))
  console.log(`${N.length ? '⛔' : '✅'} ${s}: ${N.length} pinch(es) — a ring back within ${(BOUND * 1000).toFixed(3)} mm of its own edge, or touching itself`
    + (N.length ? `\n     first: ${N.slice(0, 3).map(d => `(${d.at.join(', ')}) ${d.lu} ${d.kind} ${d.mm} mm`).join(' · ')}` : ''))
}
console.log(red ? `\n⛔ ${red} town(s) draw a land-use boundary twice, or pinch a region below the lattice (derive.js#layerLandEvidence)` : '\n✅ every land-use boundary is one line, and no region pinches')
process.exit(red ? 1 : 0)
