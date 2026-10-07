#!/usr/bin/env node
// claims-the-kerb-stands-and-drops-at-each-cut.mjs — THE RAISED KERB, ON BLOCKS SMALL ENOUGH TO KNOW THE ANSWER.
//
// `BRIEF-corner-ramps-and-kerb §3` step 5. Two 10 m blocks in a field of asphalt, run through the REAL pieces the ground
// bake uses — `kerbLift.mjs#kerbPlan` (classes, curbless edges, regions), the slice, the field, the lift, the riser — and
// `groundConformity.js#conformAndRefine` + `#cutAlong`, measured against what the ruling says must come out:
//   · block A (curb + walk, one cut on its south kerb): every asphalt vertex stays at 0 · the block stands at h away from
//     the cut · the cut's kerb face is flush and its ramp reaches h at its run, linearly · a riser along the kerb
//   · block B (land use; a curb on its WEST side only): its curbless edges slope flush, and a taper meets the curb's end
//     without a crack
//   · no step anywhere is left without a riser (`bareM` empty)
// ⭐ The whole scene is ROTATED and set at a non-integer offset, which an axis-aligned integer scene can never show: the
// partition sits on Clipper's 1 mm grid, and the kerb's creases are cut into the conformed mesh (`cutAlong`), never into
// the paint (LS refused 17 km when they were, 2026-10-07).
//   node checks/claims-the-kerb-stands-and-drops-at-each-cut.mjs
import { kerbPlan, makeHeightField, liftBuffer, riserFromEdges } from '../cartograph/kerbLift.mjs'
import { conformAndRefine, cutAlong, findTJunctions } from '../cartograph/groundConformity.js'

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
const P = kerbPlan({ blockRings, curbRings: [block, rev(inner), bareCurb], ramps: [cut], kerb })
const regions = P.regions, curbless = P.curbless
// conform them as ONE mesh, then cut the creases into it — exactly as the bake does; the paint is never sliced
const cutStats = {}
const bufs = cutAlong(conformAndRefine(groupsIn.map(([, polys]) => ({ polys, refine: null, yLift: 0 }))),
  regions.flatMap(g => g.poly.map((p, i) => [p, g.poly[(i + 1) % g.poly.length]])), cutStats)
const tj = findTJunctions(bufs.map((b, i) => ({ id: groupsIn[i][0], ...b })))
const field = makeHeightField(regions, h)
const lifted = bufs.map((b, i) => ({ key: groupsIn[i][0].slice(groupsIn[i][0].indexOf(':') + 1), ...liftBuffer(b, field, P.inBlock) }))
const riser = riserFromEdges(lifted, new Set(['curb', 'curbCut']))

const verts = (g) => { const out = []; for (let v = 0; v < g.positions.length / 3; v++) { const [x, z] = Lc([g.positions[v * 3], g.positions[v * 3 + 2]]); out.push([x, g.positions[v * 3 + 1], z]) } return out }
const asph = verts(lifted[0]), curb = verts(lifted[1]), walk = verts(lifted[2]), curbB = verts(lifted[3]), foot = verts(lifted[4])
const R = h / kerb.rampSlope, F = h / kerb.flareSlope
// heights are good to the mesh's own resolution: the slices sit on Clipper's 1 mm grid, so a vertex is up to ~1 mm off
// the line it was cut on, which is h × 1 mm ÷ the shortest run in height
const e = h * 1e-3 / Math.min(R, F, taperRun)
const nearCut = ([x, , z]) => x > 4 - F - 1e-3 && x < 5.5 + F + 1e-3 && z < R + 1e-3
const usedBy = (g, side) => { const s2 = new Set(); for (let t = 0; t < g.side.length; t++) if (g.side[t] === side) for (let k = 0; k < 3; k++) s2.add(g.indices[3 * t + k]); return s2 }
const curbIn = [...usedBy(lifted[1], 1)].map(v => curb[v])
const faceVerts = curbIn.filter(([x, , z]) => Math.abs(z) < 1e-3 && x >= 4 - 1e-3 && x <= 5.5 + 1e-3)
const rampTop = [...curbIn, ...walk].filter(([x, , z]) => Math.abs(z - R) < 1e-3 && x >= 4 - 1e-3 && x <= 5.5 + 1e-3)
// the field itself, sampled across the ramp and up a flare (the mesh is only as linear as the field it reads)
const rampMid = []; for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { const x = 4 + 1.5 * i / 10, z = R * j / 10; rampMid.push([x, field.y(W([x, z])), z]) }
const flareOk = [0.25, 0.5, 0.75].every(f => Math.abs(field.y(W([4 - F * f, 0])) - h * f) < 1e-9)
const riserH = []; for (let i = 0; i < riser.indices.length; i += 6) { const o = riser.indices[i]; riserH.push(riser.positions[(o + 3) * 3 + 1] - riser.positions[o * 3 + 1]) }
const cL = curbless.map(({ A, B }) => [Lc(A), Lc(B)]), cLen = cL.reduce((n, [a, b]) => n + Math.hypot(b[0] - a[0], b[1] - a[1]), 0)
const rows = [
  ['the asphalt stays at 0', asph.every(([, y]) => Math.abs(y) < e)],
  ['block A stands at h away from the cut',    [...curbIn, ...walk].filter(p => !nearCut(p)).every(([, y]) => Math.abs(y - h) < e)],
  ["the cut's kerb face is flush",             faceVerts.length > 0 && faceVerts.every(([, y]) => Math.abs(y) < e)],
  ['the ramp reaches h at its run',            rampTop.length > 0 && rampTop.every(([, y]) => Math.abs(y - h) < e)],
  ['the ramp is linear between',               rampMid.every(([, y, z]) => Math.abs(y - h * z / R) < 1e-6)],
  ['a flare rises along the kerb at its slope', flareOk],
  ["block B's curbless edges are its three road sides", Math.abs(cLen - (9.7 + 10 + 9.7)) < 1e-2 && cL.every(([a, b]) => a[0] >= 20.3 - 1e-3 && b[0] >= 20.3 - 1e-3)],
  ['a curbless edge is flush at the road',     foot.filter(([x, , z]) => x >= 30 - 1e-3 || z <= 1e-3 || z >= 10 - 1e-3).every(([, y]) => Math.abs(y) < e)],
  ['…and stands at h past its taper',          foot.filter(([x, , z]) => Math.min(30 - x, z, 10 - z) >= taperRun - 1e-3).every(([, y]) => Math.abs(y - h) < e) && foot.some(([x, , z]) => Math.min(30 - x, z, 10 - z) >= taperRun - 1e-3)],
  ['the riser stands along every kerb but the flush span', riser.kerbM > 40 - 1.5 && riserH.length > 0 && riserH.every(v => v <= h + e)],
  ['no step anywhere is left without a face',  Object.keys(riser.bareM).length === 0],
  ['the cut leaves the ground without a crack', tj.total === 0 && cutStats.crossed > 0],
]
let bad = 0
for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? '✅' : '⛔'} ${name}`) }
console.log(`  (riser ${riser.kerbM.toFixed(3)} m · ${riserH.length} quads · curbless ${cLen.toFixed(2)} m · cut ${cutStats.crossed} tri(s) ${cutStats.trisBefore}→${cutStats.trisAfter} · T-junctions ${tj.total} · ramp run ${R.toFixed(2)} m · flare ${F.toFixed(2)} m · ${faceVerts.length} face / ${rampTop.length} top / ${rampMid.length} mid vertices${Object.keys(riser.bareM).length ? ' · BARE ' + JSON.stringify(riser.bareM) : ''})`)
console.log(bad ? `⛔ ${bad} wrong` : '✅ the kerb stands at h and drops flush at its cut; a riser closes every kerbed step, and a curbless edge slopes flush')
process.exit(bad ? 1 : 0)
