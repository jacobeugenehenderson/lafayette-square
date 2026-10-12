#!/usr/bin/env node
// claims-every-group-meshes-its-own-area.mjs — A GROUND GROUP'S MESH COVERS EXACTLY ITS OWN POLYGONS.
//
// The class (5d465009, Sill, 2026-10-07): the kerb's first paint slicing threw each group's polygons into one bag of rings
// and rebuilt the holes by winding, handing a block's hole to the wrong outer — so on LS the asphalt MESHED 97,808 m² over
// the blocks (mesh 525,463 m² against polygon 427,655 m²) and the kerb lifted it. Nothing measured it; an area census
// found it. This is that census as a check, on what the bake does to a group between its paint and its mesh: the kerb's
// crease split (`kerbLift.mjs#splitAtCreases`, imported) and the conformity (`groundConformity.js#conformAndRefine`).
// ASSERTS, per group: |mesh area − polygon area| ≤ the lattice's own allowance (the group's perimeter × one grid step:
// every vertex the split makes is snapped to the 1 mm lattice, so an edge may move by up to a step along its length).
// The scene: two blocks as HOLES of one asphalt (the shape that fooled the winding), a curbed block with a curb cut, and a
// curbless block of land use whose three road sides taper — rotated and off-grid, like the kerb check's.
// ⭐ MUTATION TEST: `--selftest` — the split as the bake runs it is GREEN; the same split's output re-holed with one hole
//   handed to the WRONG outer (5d465009's defect, planted) is RED; the polygons with a hole DROPPED is RED.
//   node checks/claims-every-group-meshes-its-own-area.mjs [--selftest]
import { kerbPlan, kerbCells, splitAtCreases } from '../cartograph/kerbLift.mjs'
import { conformAndRefine } from '../cartograph/groundConformity.js'
import { LATTICE_M } from '../src/lib/lattice.js'

const h = 0.15, kerb = { height: h, rampSlope: 1 / 12, flareSlope: 1 / 10, taperRun: 1.0 }
const th = 0.37, C = Math.cos(th), S = Math.sin(th), O = [123.4567, 98.7654]
const W = ([x, z]) => [O[0] + C * x - S * z, O[1] + S * x + C * z]
const sq = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d]].map(W), rev = (r) => [...r].reverse()
const block = sq(0, 0, 10, 10), inner = sq(0.3, 0.3, 9.7, 9.7), blockB = sq(20, 0, 30, 10)
const cut = { face: [W([4, 0]), W([5.5, 0])], inward: (() => { const a = W([0, 0]), b = W([0, 1]); return [b[0] - a[0], b[1] - a[1]] })() }
const groupsIn = [
  ['mat:asphalt', [{ outer: sq(-5, -5, 35, 15), holes: [rev(block), rev(blockB)] }]],
  ['mat:curb', [{ outer: block, holes: [rev(inner)] }]],
  ['mat:sidewalk', [{ outer: inner, holes: [] }]],
  ['mat:curb', [{ outer: sq(20, 0, 20.3, 10), holes: [] }]],
  ['face:vacant', [{ outer: sq(20.3, 0, 30, 10), holes: [] }]],
]
const blockRings = [block, blockB]
const P = kerbPlan({ blockRings, curbRings: [block, rev(inner), sq(20, 0, 20.3, 10)], ramps: [cut], kerb })
const cells = kerbCells(P.regions, blockRings)

const A = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2) }
const polyArea = (its) => its.reduce((t, it) => t + A(it.outer) - (it.holes || []).reduce((u, x) => u + A(x), 0), 0)
const perim = (its) => its.reduce((t, it) => t + [it.outer, ...(it.holes || [])].reduce((u, r) => u + r.reduce((v, p, i) => v + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0), 0), 0)
const meshArea = (b) => { let a = 0; const P_ = b.positions, I = b.indices
  for (let t = 0; t < I.length; t += 3) { const p = I[t] * 3, q = I[t + 1] * 3, r = I[t + 2] * 3
    a += Math.abs((P_[q] - P_[p]) * (P_[r + 2] - P_[p + 2]) - (P_[r] - P_[p]) * (P_[q + 2] - P_[p + 2])) / 2 }
  return a }

/** the bake's path for each group: `prep` stands where the bake splits it (planGroup) */
function judge(prep = (polys) => splitAtCreases(polys, cells, P.inBlock)) {
  const prepped = groupsIn.map(([, polys]) => prep(polys))
  const bufs = conformAndRefine(prepped.map(polys => ({ polys, refine: null, yLift: 0 })))
  return groupsIn.map(([k, polys], i) => { const want = polyArea(polys), got = meshArea(bufs[i]), allow = perim(polys) * LATTICE_M
    return [`${k} meshes its own ${want.toFixed(2)} m²`, Math.abs(got - want) <= allow, `mesh ${got.toFixed(3)} m², allowance ±${allow.toFixed(3)}`] })
}
const show = (rows) => { for (const [n, ok, w] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${n} (${w})`) }

if (process.argv.includes('--selftest')) {
  // 5d465009's defect, planted: every ring of the split's output in one bag, and each hole handed to the FIRST outer
  // (not the one that contains it) — the asphalt's two block holes stay, but on the wrong piece once there are several
  const wrongOuter = (polys) => { const its = splitAtCreases(polys, cells, P.inBlock); if (its.length < 2 && !(its[0]?.holes?.length)) return its
    const holes = its.flatMap(it => it.holes || []), outers = its.map(it => ({ outer: it.outer, holes: [] }))
    if (outers.length === 1) return [{ outer: outers[0].outer, holes: holes.slice(1) }, { outer: holes[0], holes: [] }]
    outers[outers.length - 1].holes = holes; return outers }
  const dropHole = (polys) => splitAtCreases(polys, cells, P.inBlock).map(it => ({ outer: it.outer, holes: (it.holes || []).slice(1) }))
  const real = judge(), mutW = judge(wrongOuter), mutD = judge(dropHole)
  console.log('  wrong outer:'); show(mutW); console.log('  dropped hole:'); show(mutD)
  const tests = [
    ['the bake\'s split is GREEN', real.every(([, ok]) => ok)],
    ['a hole handed to the wrong outer (5d465009) is RED', mutW.some(([, ok]) => !ok)],
    ['a hole dropped is RED', mutD.some(([, ok]) => !ok)],
  ]
  for (const [m, ok] of tests) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(tests.every(t => t[1]) ? 0 : 1)
}

const rows = judge()
show(rows)
const bad = rows.filter(([, ok]) => !ok).length
console.log(bad ? `⛔ ${bad} group(s) mesh other than their own polygons` : '✅ every ground group meshes exactly its own polygons, through the kerb\'s crease split')
process.exit(bad ? 1 : 0)
