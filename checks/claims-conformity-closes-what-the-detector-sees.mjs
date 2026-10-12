#!/usr/bin/env node
/**
 * claims-conformity-closes-what-the-detector-sees.mjs — DOES CONFORMITY'S CLOSER SEE THE SAME VERTICES AS ITS DETECTOR?
 *
 * ⛔ Found 2026-10-12 (Huron's ground bake refused on HEAD, ROADMAP; Cairn's forensic of Swale's dump,
 *    `scratch/ground-height/huron-blocker-tj.json`): `conformAndRefine`'s closer tells vertices apart by ID, and a
 *    refinement midpoint (`midpointIndex`) is never welded; `findTJunctions` welds by the 1 mm lattice. At Huron's two
 *    sites a shore midpoint sat 0.61 mm from another shore midpoint: to the closer it was INTERIOR (every edge shared),
 *    so it was never tested; welded, one of its edges became used-once, and an underived edge 4.45 mm off made it a
 *    T-junction. The bake refused after ~70 min of conformity. Nothing about the town was needed to see it.
 * ⭐ THE RULE, read from the source, never restated: the mesh the closer hands back passes the detector, on any input
 *    of lattice-rounded rings. Shown here on the smallest input that carries the class (three near-parallel strips mm
 *    apart, bisected, and another group's edge ~4 mm off); and the closer and the detector name a vertex the same way
 *    (either `midpointIndex` goes through the weld, or the detector does not weld).
 * ⭐ MUTATION-TESTED EVERY RUN: a planted mid-edge vertex must be found by the detector, and the identity read must pass
 *    on a copy of the source whose `midpointIndex` welds.
 *
 *   node checks/claims-conformity-closes-what-the-detector-sees.mjs
 * Read-only, milliseconds. Exit 1 on a failure.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = new URL('..', import.meta.url).pathname
import { conformAndRefine, findTJunctions } from '../cartograph/groundConformity.js'

const fails = []

// ── The class, on the smallest input that carries it (found by search, lattice-rounded like every flattened ring) ──
// Three near-parallel strips 1–2 mm apart along a 7.7 m edge, the land under them, and a neighbour whose edge runs 4 mm
// off the top strip (Huron's sites: 0.6–5.6 mm stacks, 4.45 mm). Bisection to 3.39 m puts twin midpoints in one 1 mm cell.
const S = [
  { outer: [[0.196, -0.981], [7.745, 0.528], [7.549, 1.509], [0, 0]] },
  { outer: [[0, 0], [7.549, 1.509], [7.548, 1.51], [0, 0.002]] },
  { outer: [[0, 0.002], [7.548, 1.51], [7.549, 1.509], [0, 0.001]] },
]
const U = [{ outer: [[1.421, 0.29], [5.638, 1.133], [5.443, 2.11], [1.226, 1.267]] }]

function conformAndDetect(groups) {
  const out = conformAndRefine(groups.map(g => ({ polys: g.polys, refine: g.refine })))
  return { out, tj: findTJunctions(out.map((o, i) => ({ id: groups[i].id, ...o }))) }
}
const { out, tj } = conformAndDetect([
  { id: 'strips', polys: S, refine: { mode: 'uniform', maxEdge: 3.39 } },
  { id: 'neighbour', polys: U, refine: null },
])
console.log(`   synthetic: ${out.reduce((s, o) => s + o.indices.length / 3, 0)} triangles after conformity · detector: ${tj.total} T-junction(s) (${tj.cross} across groups)`)
if (tj.total) {
  // The mechanism at each finding: how many distinct positions share its 1 mm weld key.
  const wk = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`
  for (const f of tj.found) {
    const twins = new Set()
    for (const o of out) for (let i = 0; i < o.positions.length; i += 3) {
      if (wk(o.positions[i], o.positions[i + 2]) === wk(f.x, f.z)) twins.add(`${o.positions[i]},${o.positions[i + 2]}`)
    }
    fails.push(`a ${f.vertexGroup} vertex at (${f.x.toFixed(4)}, ${f.z.toFixed(4)}) lies on a ${f.edgeGroup} edge after conformity — ${twins.size} distinct position(s) share its 1 mm weld key`)
  }
}

// ── One vertex identity, read from the source ──
const src = readFileSync(join(ROOT, 'cartograph/groundConformity.js'), 'utf8')
function identityShared(text) {
  const mid = text.match(/const midpointIndex = \(a, b\) => \{[\s\S]*?\n {2}\}/)?.[0]
  const det = text.match(/export function findTJunctions[\s\S]*?\n\}/)?.[0]
  if (!mid || !det) return null
  return /\bvid\(|weldKey\(/.test(mid) || !/weldKey\(/.test(det)
}
const shared = identityShared(src)
if (shared === null) fails.push('groundConformity.js: midpointIndex or findTJunctions not found — the identity read is NOT CHECKED')
else if (!shared) fails.push('groundConformity.js: the closer never welds a refinement midpoint (midpointIndex) while the detector welds on the 1 mm lattice — two vertex identities')

// ── Mutations: each must be caught ──
const planted = findTJunctions([
  { id: 'a', positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]) },
  { id: 'b', positions: new Float32Array([0, 0, 0, 1, 0, -0.002, 2, 0, 0, 1, 0, -1]), indices: new Uint32Array([0, 3, 1, 1, 3, 2]) },
])
const welding = src.replace(/(const midpointIndex = \(a, b\) => \{[\s\S]*?)PX\.push\(/, '$1vid(0, 0); PX.push(')
for (const [what, caught] of [
  ['a vertex planted 2 mm off a neighbour\'s edge', planted.total > 0],
  ['a midpointIndex that welds reads as one identity', identityShared(welding) === true],
]) {
  console.log(`   mutation (${what}) ${caught ? 'caught ✓' : 'NOT caught'}`)
  if (!caught) fails.push(`MUTATION NOT CAUGHT: ${what}`)
}

if (fails.length) { for (const f of fails) console.log(`   ⛔ ${f}`); process.exit(1) }
console.log('   ✅ the closer and the detector see the same vertices')
