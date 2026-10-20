#!/usr/bin/env node
/**
 * claims-conformity-closes-what-the-detector-sees.mjs — DOES THE DETECTOR SEE THE MESH THE SLAB DRAWS?
 *
 * ⛔ The class (Huron 2026-10-12, Cairn's forensic of Swale's dump; HPDM 2026-10-18, Screed's): `conformAndRefine` hands
 *    back a mesh closed by exact vertex identity, but `findTJunctions` welded vertices on the 1 mm lattice. Two refinement
 *    midpoints under 1 mm apart (Huron's shore 0.61 mm; HPDM's asphalt on wydown-terrace-7's stripe, 0.698 mm) read as
 *    one, an edge each used read as used once, and the bake refused on a crack the slab never had: nothing between
 *    conformity and the screen welds or rounds a position (`emit` → `liftBuffer` → per-vertex `aRaw` → ground.bin →
 *    `BakedGround`). The weld was removed (Boz, 2026-10-18, option (b)).
 * ⭐ THE RULE: the detector names a vertex by its exact float32 position, the way the slab draws it — so conformity's own
 *    output passes it, and a real gap under 1 mm is still a crack. Shown on:
 *    - the smallest input that carries the class (three near-parallel strips mm apart, bisected, another group's edge
 *      ~4 mm off), through conformAndRefine;
 *    - P's case: the conformed triangles around HPDM's refused vertex (`fixtures/conformity-twin-hpdm.json`, a slice of
 *      the real mesh — its own cut edges are boundary, so only the verdict AT P is read);
 *    - a TRUE crack: below's chain bends 0.4 mm down from above's straight edge, which really is used once; above has
 *      its own vertex 0.7 mm from below's, in one 1 mm cell, not index-shared (interior: every edge of it shared). It
 *      must be found. (Welded, the pair read as one and the crack was hidden. A gap between two vertices 0.7 mm apart
 *      at both CHAIN ENDS is not a T-junction to either identity: the detector skips a vertex within ON_EDGE_M of an
 *      edge's end.)
 *    And from the source: findTJunctions calls no `weldKey`.
 * ⭐ MUTATION-TESTED EVERY RUN, on a copy of the source the check itself imports (written to the OS temp dir, its imports
 *    made absolute): (1) the weld put back must flag P, and must miss the true crack (claims 2 and 3 go RED under it);
 *    (2) a vertex planted 2 mm off a neighbour's edge must be found.
 *
 *   node checks/claims-conformity-closes-what-the-detector-sees.mjs
 * Read-only, milliseconds. Exit 1 on a failure.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { conformAndRefine, findTJunctions } from '../cartograph/groundConformity.js'
import { ROOT } from './_scenes.mjs'

const HOME = join(ROOT, 'cartograph/groundConformity.js')
const fails = []
const wk = (x, z) => `${Math.round(x * CLIP_SCALE)},${Math.round(z * CLIP_SCALE)}`
const at = (f, p) => f.x === p[0] && f.z === p[1]

// ── the mutant: the 1 mm weld put back into the detector (a copy in the OS temp dir, its imports made absolute) ──
const src = readFileSync(HOME, 'utf8')
const absolute = (spec) => spec.startsWith('.') ? new URL(spec, pathToFileURL(HOME)).href : import.meta.resolve(spec)
const mutant = () => { const vkeyAt = '  const vkey = (x, z) => {'
  if (src.split(vkeyAt).length !== 2) throw new Error('groundConformity.js: findTJunctions no longer defines `const vkey = (x, z) => {` — re-aim the weld mutant')
  const f = join(mkdtempSync(join(tmpdir(), 'conformity-weld-')), 'groundConformity.js')
  // every import specifier made absolute, so the copy resolves from the temp dir (relative to HOME; a package from here)
  writeFileSync(f, src.replace(vkeyAt, '  const vkey = (x, z) => weldKey(x, z), __exact = (x, z) => {').split("from '")
    .map((piece, i) => i ? absolute(piece.slice(0, piece.indexOf("'"))) + piece.slice(piece.indexOf("'")) : piece).join("from '"))
  return pathToFileURL(f).href }
const welded = (await import(mutant())).findTJunctions

// ── 1. the class, on the smallest input that carries it, through conformity ──
const S = [
  { outer: [[0.196, -0.981], [7.745, 0.528], [7.549, 1.509], [0, 0]] },
  { outer: [[0, 0], [7.549, 1.509], [7.548, 1.51], [0, 0.002]] },
  { outer: [[0, 0.002], [7.548, 1.51], [7.549, 1.509], [0, 0.001]] },
]
const U = [{ outer: [[1.421, 0.29], [5.638, 1.133], [5.443, 2.11], [1.226, 1.267]] }]
const out = conformAndRefine([{ polys: S, refine: { mode: 'uniform', maxEdge: 3.39 } }, { polys: U, refine: null }])
const strips = out.map((o, i) => ({ id: ['strips', 'neighbour'][i], ...o }))
const tj = findTJunctions(strips)
console.log(`   strips: ${out.reduce((s, o) => s + o.indices.length / 3, 0)} triangles after conformity · detector ${tj.total} T-junction(s) · the 1 mm weld ${welded(strips).total}`)
for (const f of tj.found) fails.push(`strips: a ${f.vertexGroup} vertex at (${f.x.toFixed(4)}, ${f.z.toFixed(4)}) lies on a ${f.edgeGroup} edge after conformity`)

// ── 2. P's case: HPDM's conformed mesh around the vertex the weld refused on ──
const fx = JSON.parse(readFileSync(new URL('./fixtures/conformity-twin-hpdm.json', import.meta.url), 'utf8'))
const fxGroups = fx.groups.map(g => { const P = new Float32Array(g.xz.length / 2 * 3); for (let i = 0; i < g.xz.length / 2; i++) { P[i * 3] = g.xz[i * 2]; P[i * 3 + 2] = g.xz[i * 2 + 1] }
  return { id: g.id, positions: P, indices: Uint32Array.from(g.indices) } })
// the fixture still carries the class: P and its twin are distinct float32 positions in one 1 mm cell
const twinOk = fx.twin && wk(...fx.P) === wk(...fx.twin) && (fx.twin[0] !== fx.P[0] || fx.twin[1] !== fx.P[1])
  && fxGroups.some(g => { for (let i = 0; i < g.positions.length; i += 3) if (g.positions[i] === fx.twin[0] && g.positions[i + 2] === fx.twin[1]) return true; return false })
if (!twinOk) fails.push('fixtures/conformity-twin-hpdm.json: P and its twin are no longer two positions in one 1 mm cell — the fixture no longer carries the class (NOT CHECKED)')
const atP = findTJunctions(fxGroups).found.filter(f => at(f, fx.P))
console.log(`   P's case (HPDM, ${fxGroups.reduce((n, g) => n + g.indices.length / 3, 0)} triangles; twin ${(Math.hypot(fx.P[0] - fx.twin[0], fx.P[1] - fx.twin[1]) * 1000).toFixed(3)} mm): detector at P ${atP.length}`)
if (atP.length) fails.push(`P's case: the detector finds the vertex at (${fx.P.join(', ')}) on a ${atP[0].edgeGroup} edge — a crack by a vertex identity the slab does not draw`)

// ── 3. a TRUE crack: below's chain (0,0)→(1,−0.4 mm)→(2,0) against above's straight edge (0,0)→(2,0), used once; above's
// own vertex (1, +0.3 mm) is interior to above (a sliver on the edge and two triangles to the apex share all its edges) ──
const tri = (pts, idx) => ({ positions: new Float32Array(pts.flatMap(([x, z]) => [x, 0, z])), indices: new Uint32Array(idx) })
const crack = [
  { id: 'above', ...tri([[0, 0], [2, 0], [1, 0.0003], [1, 1]], [0, 1, 2, 0, 2, 3, 2, 1, 3]) },
  { id: 'below', ...tri([[0, 0], [1, -0.0004], [2, 0], [1, -1]], [0, 3, 1, 1, 3, 2]) },
]
const crackFound = findTJunctions(crack).total
console.log(`   a true 0.7 mm crack (one 1 mm cell): detector ${crackFound} · the 1 mm weld ${welded(crack).total}`)
if (!crackFound) fails.push('a true crack 0.7 mm wide (two unshared chains in one 1 mm cell) is NOT found — the detector is blind to the thing it exists to catch')

// ── 4. one identity, read from the source the check imports ──
const det = src.match(/export function findTJunctions[\s\S]*?\n\}/)?.[0]
if (!det) fails.push('groundConformity.js: findTJunctions not found — the identity read is NOT CHECKED')
else if (/\bweldKey\(/.test(det)) fails.push('groundConformity.js: findTJunctions welds vertices on the 1 mm lattice (weldKey) — two vertex identities, the closer\'s and the detector\'s')

// ── mutations: each must be caught ──
const planted = findTJunctions([
  { id: 'a', positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]) },
  { id: 'b', positions: new Float32Array([0, 0, 0, 1, 0, -0.002, 2, 0, 0, 1, 0, -1]), indices: new Uint32Array([0, 3, 1, 1, 3, 2]) },
])
for (const [what, caught] of [
  ['the 1 mm weld put back flags P', welded(fxGroups).found.some(f => at(f, fx.P))],
  ['the 1 mm weld put back misses the true crack', welded(crack).total === 0],
  ['a vertex planted 2 mm off a neighbour\'s edge is found', planted.total > 0],
]) {
  console.log(`   mutation (${what}) ${caught ? 'caught ✓' : 'NOT caught'}`)
  if (!caught) fails.push(`MUTATION NOT CAUGHT: ${what}`)
}

if (fails.length) { for (const f of fails) console.log(`   ⛔ ${f}`); process.exit(1) }
console.log('   ✅ the detector names a vertex as the slab draws it: conformity\'s output passes, and a real sub-mm crack is still found')
