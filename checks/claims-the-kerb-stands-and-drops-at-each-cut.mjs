#!/usr/bin/env node
// claims-the-kerb-stands-and-drops-at-each-cut.mjs — THE RAISED KERB, ON A BLOCK SMALL ENOUGH TO KNOW THE ANSWER.
//
// `BRIEF-corner-ramps-and-kerb §3` step 5. A 10 m square block (curb + walk) in a field of asphalt, one curb cut on its
// south kerb, run through the REAL pieces the ground bake uses — `kerbLift.mjs` (regions, slice, field, lift, riser) and
// `groundConformity.js#conformAndRefine` — and measured against what the ruling says must come out:
//   · every asphalt vertex stays at 0 · every block vertex away from the cut stands at h
//   · the cut's kerb face is FLUSH (0) and its ramp reaches h at its run, linearly
//   · the riser stands along the whole kerb except the flush span, and is h tall where it stands
//   · no step anywhere is left without a riser on this all-kerb block (`bareM` empty)
// Synthetic and light (no town, no bake) — it reads the code, it restates no geometry rule.
//   node checks/claims-the-kerb-stands-and-drops-at-each-cut.mjs
import { kerbRegions, sliceByRegions, makeHeightField, liftBuffer, riserFromEdges } from '../cartograph/kerbLift.mjs'
import { conformAndRefine } from '../cartograph/groundConformity.js'
import { intersectRings, differenceRings } from '../src/lib/buildBlockGeometryV2.js'

const h = 0.15, slopes = { height: h, rampSlope: 1 / 12, flareSlope: 1 / 10 }
const sq = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d]]
const block = sq(0, 0, 10, 10), inner = sq(0.3, 0.3, 9.7, 9.7)
const cut = { face: [[4, 0], [5.5, 0]], inward: [0, 1] }
const regions = kerbRegions([cut], slopes)
const ops = { intersect: intersectRings, difference: differenceRings }
const toPolys = (rings) => rings.map(r => ({ outer: r, holes: [] }))
// non-zero rings, as the bake hands them over (`ringsToHoledPolys`): an outer winds positive, a hole negative
const rev = (r) => [...r].reverse()
const bare = sq(20, 0, 30, 10)                        // a second block with NO kerb drawn (an alley-like edge)
const groupsIn = [
  ['asphalt', [sq(-5, -5, 35, 15), rev(block), rev(bare)]],
  ['curb', [block, rev(inner)]],
  ['sidewalk', [inner]],
  ['footway', [bare]],
]
// slice every group by the cut's regions, then conform them as ONE mesh, exactly as the bake does
const specs = groupsIn.map(([, rings]) => {
  const sliced = sliceByRegions(rings, regions, ops)
  // by winding, as the bake groups them: each hole to the smallest outer holding it
  const outers = sliced.filter(r => area(r) > 0), holes = sliced.filter(r => area(r) < 0)
  return { polys: outers.map(o => ({ outer: o, holes: holes.filter(hr => inRing(hr[0], o) && !outers.some(o2 => o2 !== o && Math.abs(area(o2)) < Math.abs(area(o)) && inRing(hr[0], o2))) })), refine: null, yLift: 0 }
})
function inRing(P, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > P[1]) !== (zj > P[1]) && P[0] < (xj - xi) * (P[1] - zi) / (zj - zi) + xi) c = !c } return c }
function area(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const bufs = conformAndRefine(specs)
const field = makeHeightField([block, bare], regions, h)
const lifted = bufs.map((b, i) => ({ key: groupsIn[i][0], ...liftBuffer(b, field) }))
const riser = riserFromEdges(lifted, new Set(['curb', 'curbCut']))

const verts = (g) => { const out = []; for (let v = 0; v < g.positions.length / 3; v++) out.push([g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]]); return out }
const asph = verts(lifted[0]), curb = verts(lifted[1]), walk = verts(lifted[2])
const R = h / slopes.rampSlope, F = h / slopes.flareSlope
const nearCut = ([x, , z]) => x > 4 - F - 1e-6 && x < 5.5 + F + 1e-6 && z < R + 1e-6
const usedBy = (g, side) => { const s = new Set(); for (let t = 0; t < g.side.length; t++) if (g.side[t] === side) for (let k = 0; k < 3; k++) s.add(g.indices[3 * t + k]); return s }
const curbIn = [...usedBy(lifted[1], 1)].map(v => curb[v])
const faceVerts = curbIn.filter(([x, , z]) => Math.abs(z) < 1e-9 && x >= 4 - 1e-9 && x <= 5.5 + 1e-9)
const rampTop = [...curbIn, ...walk].filter(([x, , z]) => Math.abs(z - R) < 1e-6 && x >= 4 - 1e-9 && x <= 5.5 + 1e-9)
// the field itself, sampled across the ramp and up a flare (the mesh is only as linear as the field it reads)
const rampMid = []; for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { const x = 4 + 1.5 * i / 10, z = R * j / 10; rampMid.push([x, field.y([x, z]), z]) }
const flareOk = [0.25, 0.5, 0.75].every(f => Math.abs(field.y([4 - F * f, 0]) - h * f) < 1e-9)
const riserH = []; for (let i = 0; i < riser.indices.length; i += 6) { const o = riser.indices[i]; riserH.push(riser.positions[(o + 3) * 3 + 1] - riser.positions[o * 3 + 1]) }
const rows = [
  ['the asphalt stays at 0',                   asph.every(([, y]) => Math.abs(y) < 1e-9)],
  ['the block stands at h away from the cut',  [...curbIn, ...walk].filter(p => !nearCut(p)).every(([, y]) => Math.abs(y - h) < 1e-6)],
  ["the cut's kerb face is flush",             faceVerts.length > 0 && faceVerts.every(([, y]) => Math.abs(y) < 1e-6)],
  ['the ramp reaches h at its run',            rampTop.length > 0 && rampTop.every(([, y]) => Math.abs(y - h) < 1e-6)],
  ['the ramp is linear between',               rampMid.every(([, y, z]) => Math.abs(y - h * z / R) < 1e-9)],
  ['a flare rises along the kerb at its slope', flareOk],
  ['the riser stands along the kerb but the flush span', Math.abs(riser.kerbM - (40 - 1.5)) < 1e-3],
  ['where it stands away from the cut it is h', riserH.length > 0 && riserH.filter(v => v > h - 1e-6).length > 0 && riserH.every(v => v <= h + 1e-6)],
  ['the kerbed block leaves no bare step',      !Object.keys(riser.bareM).some(k => k.startsWith('curb') || k.startsWith('sidewalk'))],
  ['a curbless edge is COUNTED, not risered',   Math.abs((riser.bareM['footway|asphalt'] || 0) - 40) < 1e-3],
]
let bad = 0
for (const [name, ok] of rows) { if (!ok) bad++; console.log(`  ${ok ? '✅' : '⛔'} ${name}`) }
console.log(`  (riser ${riser.kerbM.toFixed(3)} m · ${riserH.length} quads · ramp run ${R.toFixed(2)} m · flare ${F.toFixed(2)} m · ${faceVerts.length} face / ${rampTop.length} top / ${rampMid.length} mid vertices)`)
console.log(bad ? `⛔ ${bad} wrong` : '✅ the kerb stands at h and drops flush at its cut; a riser closes every kerbed step, and a curbless one is counted')
process.exit(bad ? 1 : 0)
