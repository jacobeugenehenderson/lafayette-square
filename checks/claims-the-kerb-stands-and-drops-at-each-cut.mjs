#!/usr/bin/env node
// claims-the-kerb-stands-and-drops-at-each-cut.mjs — THE RAISED KERB, ON BLOCKS SMALL ENOUGH TO KNOW THE ANSWER.
//
// `BRIEF-corner-ramps-and-kerb §3` step 5. Two 10 m blocks in a field of asphalt, run through the REAL pieces the ground
// bake uses, in the bake's order (`bake-ground.js`, the ground partition): `kerbLift.mjs#kerbPlan` (classes, curbless
// edges, regions) → `#splitAtCreases` (every group split along the regions' outlines) → `groundConformity.js
// #conformAndRefine` (nothing cut into the mesh) → the T-junction refusal → `makeHeightField` + `liftBuffer` →
// `riserFromEdges`. Measured against what the ruling says must come out:
//   · block A (curb + walk, one cut on its south kerb): every asphalt vertex stays at 0 · the block stands at h away from
//     the cut · the cut's kerb face is flush and its ramp reaches h at its run, linearly · a flare rises along the kerb
//   · block B (land use; a curb on its WEST side only): its curbless edges slope flush, and stand at h past the taper
//   · a riser along the kerb, and no step anywhere is left without one (`bareM` empty)
// ⭐ JUDGED ON THE DRAWN SURFACE, not on the vertices. A lifted vertex takes the field's height by construction, so a row
//   over vertices only proves the field — and with nothing cut, a cut whose ramp has no vertices on it is simply not on
//   screen. Each row samples the lifted mesh (barycentric, inside its triangles) against the field. A cut is DRAWN when
//   the surface is within HALF THE KERB of the field there: it either dropped on screen or it stands, and that is the
//   claim; how finely it follows is the walk's level-across question (`claims-the-walk-is-level-across`).
// ⭐ The groups are SPLIT AT THE KERB'S CREASES as the bake splits them (`kerbLift.mjs#splitAtCreases`, imported, never
//   restated) and refined by the bake's policy, which on this scene (no terrain) is none.
// ⭐ The whole scene is ROTATED and set at a non-integer offset, which an axis-aligned integer scene can never show: the
// partition sits on Clipper's 1 mm grid.
// ⭐ MUTATION TEST: `--selftest` — the bake's path is GREEN; with the groups not split at the creases (2c5560ca's bake) it
//   is RED; split as the bake does but with the cut's ramp and flares dropped from the field it is RED. Same rows.
//   node checks/claims-the-kerb-stands-and-drops-at-each-cut.mjs [--selftest]
import { kerbPlan, makeHeightField, liftBuffer, riserFromEdges, kerbCells, splitAtCreases } from '../cartograph/kerbLift.mjs'
import { conformAndRefine, findTJunctions } from '../cartograph/groundConformity.js'

const h = 0.15, taperRun = 1.0, kerb = { height: h, rampSlope: 1 / 12, flareSlope: 1 / 10, taperRun }
// the scene in LOCAL metres, placed in the world by a rotation + a non-integer offset; every row reads local coordinates
const th = 0.37, C = Math.cos(th), S = Math.sin(th), O = [123.4567, 98.7654]
const W = ([x, z]) => [O[0] + C * x - S * z, O[1] + S * x + C * z], Lc = ([x, z]) => { const dx = x - O[0], dz = z - O[1]; return [C * dx + S * dz, -S * dx + C * dz] }
const sq = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d]].map(W)
const rev = (r) => [...r].reverse()
const block = sq(0, 0, 10, 10), inner = sq(0.3, 0.3, 9.7, 9.7)
const bareCurb = sq(20, 0, 20.3, 10), bare = sq(20.3, 0, 30, 10)
const cut = { face: [W([4, 0]), W([5.5, 0])], inward: (() => { const a = W([0, 0]), b = W([0, 1]); return [b[0] - a[0], b[1] - a[1]] })() }
// each group as the bake hands it over: polygons, outer + holes, never regrouped
const groupsIn = [
  ['mat:asphalt', [{ outer: sq(-5, -5, 35, 15), holes: [rev(block), rev(sq(20, 0, 30, 10))] }]],
  ['mat:curb', [{ outer: block, holes: [rev(inner)] }]],
  ['mat:sidewalk', [{ outer: inner, holes: [] }]],
  ['mat:curb', [{ outer: bareCurb, holes: [] }]],
  ['face:vacant', [{ outer: bare, holes: [] }]],
]
// what lifts is the painter's block (`pr.block`); the curbless edges are read off the drawn curb
const blockRings = [block, sq(20, 0, 30, 10)]
const P0 = kerbPlan({ blockRings, curbRings: [block, rev(inner), bareCurb], ramps: [cut], kerb })
const cells = kerbCells(P0.regions, blockRings)
const R = h / kerb.rampSlope, F = h / kerb.flareSlope
// heights are good to the mesh's own resolution: the partition sits on Clipper's 1 mm grid, so a vertex is up to ~1 mm off
// the line it lies on, which is h × 1 mm ÷ the shortest run in height
const e = h * 1e-3 / Math.min(R, F, taperRun)
const DRAWN = h / 2                       // a cut is on screen when the drawn surface is within half the kerb of the field

/** run the bake's pieces on the scene. `split` — the bake splits every group along the kerb regions' outlines
 *  (`splitAtCreases`, planGroup) before it triangulates; `regionsOf` may drop regions from the FIELD (mutant). This scene
 *  has no terrain, so nothing refines (the bake's policy). */
function judge({ regionsOf = (r) => r, split = true } = {}) {
  const regions = regionsOf(P0.regions), curbless = P0.curbless
  const field = makeHeightField(regions, h)
  const bufs = conformAndRefine(groupsIn.map(([, polys]) => ({ polys: split ? splitAtCreases(polys, cells, P0.inBlock) : polys, refine: null, yLift: 0 })))
  const tj = findTJunctions(bufs.map((b, i) => ({ id: groupsIn[i][0], ...b })))
  const lifted = bufs.map((b, i) => ({ key: groupsIn[i][0].slice(groupsIn[i][0].indexOf(':') + 1), ...liftBuffer(b, field, P0.inBlock) }))
  const riser = riserFromEdges(lifted, new Set(['curb', 'curbCut']), P0.flushTol)
  // THE DRAWN SURFACE at a local point: the lifted triangle that holds it (all groups), interpolated
  const tris = []
  lifted.forEach((g, gi) => { for (let t = 0; t < g.indices.length / 3; t++) tris.push([gi, t]) })
  const drawn = ([lx, lz]) => {
    const [x, z] = W([lx, lz])
    for (const [gi, t] of tris) { const g = lifted[gi], I = g.indices, Pp = g.positions
      const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3
      const x1 = Pp[a], z1 = Pp[a + 2], x2 = Pp[b], z2 = Pp[b + 2], x3 = Pp[c], z3 = Pp[c + 2]
      const den = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3); if (!den) continue
      const u = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / den, v = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / den, w = 1 - u - v
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue
      return u * Pp[a + 1] + v * Pp[b + 1] + w * Pp[c + 1] }
    return NaN
  }
  const verts = (g) => { const out = []; for (let v = 0; v < g.positions.length / 3; v++) { const [x, z] = Lc([g.positions[v * 3], g.positions[v * 3 + 2]]); out.push([x, g.positions[v * 3 + 1], z]) } return out }
  const asph = verts(lifted[0])
  const d = 1e-3                                                       // sample just inside a line, never on it
  const along = (x0, x1, z, n = 15) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * (i + 0.5) / n, z])
  const off = (pts, want) => pts.map(p => Math.abs(drawn(p) - want(p)))
  const near = (pts, want, tol) => { const o = off(pts, want); return o.every(v => v <= tol) }
  const nearCut = ([x, z]) => x > 4 - F - 1e-3 && x < 5.5 + F + 1e-3 && z < R + 1e-3
  const standPts = []; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const p = [0.05 + 9.9 * (i + 0.5) / 12, 0.05 + 9.9 * (j + 0.5) / 12]; if (!nearCut(p)) standPts.push(p) }
  const pastTaper = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) pastTaper.push([20.3 + 0.05 + (30 - taperRun - 20.35) * (i + 0.5) / 8, taperRun + (10 - 2 * taperRun) * (j + 0.5) / 8])
  const rampMid = []; for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) rampMid.push([4 + 1.5 * i / 10, R * j / 10])
  const riserH = []; for (let i = 0; i < riser.indices.length; i += 6) { const o = riser.indices[i]; riserH.push(riser.positions[(o + 3) * 3 + 1] - riser.positions[o * 3 + 1]) }
  const cL = curbless.map(({ A, B }) => [Lc(A), Lc(B)]), cLen = cL.reduce((n, [a, b]) => n + Math.hypot(b[0] - a[0], b[1] - a[1]), 0)
  const worst = (pts, want) => Math.max(...off(pts, want)).toFixed(3)
  const rows = [
    ['the asphalt stays at 0', asph.every(([, y]) => Math.abs(y) < e)],
    ['block A stands at h away from the cut (drawn)',  near(standPts, () => h, e)],
    ["the cut's kerb face is flush (drawn)",           near(along(4, 5.5, d), () => 0, DRAWN), worst(along(4, 5.5, d), () => 0)],
    ['the ramp reaches h at its run (drawn)',           near(along(4, 5.5, R - d), () => h, DRAWN), worst(along(4, 5.5, R - d), () => h)],
    ['the ramp is linear between (drawn)',              near(rampMid, ([, z]) => h * z / R, DRAWN), worst(rampMid, ([, z]) => h * z / R)],
    ['a flare rises along the kerb at its slope (drawn)', near([0.25, 0.5, 0.75].map(f => [4 - F * f, d]), ([x]) => h * (4 - x) / F, DRAWN)],
    ["block B's curbless edges are its three road sides", Math.abs(cLen - (9.7 + 10 + 9.7)) < 1e-2 && cL.every(([a, b]) => a[0] >= 20.3 - 1e-3 && b[0] >= 20.3 - 1e-3)],
    ['a curbless edge is flush at the road (drawn)',    near([...along(20.5, 29.5, d), ...along(20.5, 29.5, 10 - d)], () => 0, DRAWN)],
    ['…and stands at h past its taper (drawn)',         near(pastTaper, () => h, DRAWN), worst(pastTaper, () => h)],
    ['the riser stands along every kerb but the flush span', riser.kerbM > 40 - 1.5 && riserH.length > 0 && riserH.every(v => v <= h + e)],
    ['no step anywhere is left without a face',         Object.keys(riser.bareM).length === 0],
    ['the conformed ground has no crack',               tj.total === 0],
  ]
  return { rows, note: `riser ${riser.kerbM.toFixed(3)} m · ${riserH.length} quads · curbless ${cLen.toFixed(2)} m · T-junctions ${tj.total} · ramp run ${R.toFixed(2)} m · flare ${F.toFixed(2)} m · ${tris.length} tris${Object.keys(riser.bareM).length ? ' · BARE ' + JSON.stringify(riser.bareM) + ' at (local) ' + JSON.stringify(Object.fromEntries(Object.entries(riser.bareAt).map(([k, v]) => [k, v.map(p => Lc(p).map(x => +x.toFixed(3)))]))) : ''}` }
}
const show = (rows) => { for (const [name, ok, w] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${name}${w != null ? ` (worst ${w} m)` : ''}`) }

if (process.argv.includes('--selftest')) {
  const isCut = (g) => (g.kind === 'ramp' && !g.taper) || g.kind === 'flareA' || g.kind === 'flareB'
  const real = judge()
  const unsplit = judge({ split: false })                                                 // 2c5560ca's bake: no vertex on a crease
  const mut = judge({ regionsOf: (r) => r.filter(g => !isCut(g)) })                       // split as the bake does, the cut gone from the field
  const tests = [
    ["the bake's path is GREEN", real.rows.every(([, ok]) => ok)],
    ['with the groups not split at the creases (2c5560ca), it is RED', unsplit.rows.some(([, ok]) => !ok)],
    ["split as the bake does but the cut's ramp and flares dropped from the field, it is RED", mut.rows.some(([, ok]) => !ok)],
  ]
  console.log('  unsplit:'); show(unsplit.rows); console.log('  mutant (cut dropped):'); show(mut.rows)
  for (const [m, ok] of tests) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(tests.every(t => t[1]) ? 0 : 1)
}

const { rows, note } = judge()
show(rows)
console.log(`  (${note})`)
let bad = 0
for (const [, ok] of rows) if (!ok) bad++
console.log(bad ? `⛔ ${bad} wrong` : '✅ the kerb stands at h and drops flush at its cut; a riser closes every kerbed step, and a curbless edge slopes flush')
process.exit(bad ? 1 : 0)
