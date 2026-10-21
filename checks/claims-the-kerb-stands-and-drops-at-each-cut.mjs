#!/usr/bin/env node
// claims-the-kerb-stands-and-drops-at-each-cut.mjs — THE RAISED KERB, ON BLOCKS SMALL ENOUGH TO KNOW THE ANSWER.
//
// `BRIEF-corner-ramps-and-kerb §3` step 5. Four 10 m blocks in a field of asphalt, run through the REAL pieces the ground
// bake uses, in the bake's order (`bake-ground.js`, the ground partition): `kerbLift.mjs#kerbPlan` (sides, the curbless
// edges by their OWNER, stretches, mitred tapers) → `#cutCreases` (each crease cut once through every polygon on it) →
// `#splitAtCreases` → `groundConformity.js#conformAndRefine` (nothing cut into the mesh) → the T-junction refusal →
// `makeHeightField` + `liftBuffer` → `riserFromEdges`. Measured against what the ruling says must come out:
//   · block A (curb + walk, one cut on its south kerb): every asphalt vertex stays at 0 · the block stands at h away from
//     the cut · the cut's kerb face is flush and its ramp reaches h at its run, linearly · a flare rises along the kerb
//   · block B (land use; a curb on its WEST side only): its curbless edges slope flush, and stand at h past the taper
//   · block C (LS #39's M1): a curb leaving the south edge at 2.5°, a land-use wedge between it and the road — the wedge's
//     road edge is the land use's, so it tapers; no step is left without a face
//   · block D: a curbless block with a 5° REFLEX bend on its south side and, on its north side, a vertex within one
//     rounding of the chord — the two tapers at the bend share ONE crease and its wedge slopes; the vertex is no bend
//   · every taper's inward points into its lifted face · the crease split leaves every edge shared · a riser along the
//     kerb, and no step anywhere is left without one (`bareM` empty)
// ⭐ JUDGED ON THE DRAWN SURFACE, not on the vertices. A lifted vertex takes the field's height by construction, so a row
//   over vertices only proves the field — and with nothing cut, a cut whose ramp has no vertices on it is simply not on
//   screen. Each row samples the lifted mesh (barycentric, inside its triangles) against the field. A cut is DRAWN when
//   the surface is within HALF THE KERB of the field there: it either dropped on screen or it stands, and that is the
//   claim; how finely it follows is the walk's level-across question (`claims-the-walk-is-level-across`).
// ⭐ The fixture is NODED as the bake hands it over (two groups that meet share their vertices: `nodeAcrossGroups`,
//   `nodeThePlane`), and the block rings are noded with it — the owner read is by identity, never by distance.
// ⭐ The whole scene is ROTATED and set at a non-integer offset, which an axis-aligned integer scene can never show: the
// partition sits on Clipper's 1 mm grid.
// ⭐ MUTATION TEST: `--selftest` — the bake's path is GREEN; each of these is RED on the same rows:
//   with the groups not split at the creases (2c5560ca's bake) · the cut's ramp and flares dropped from the field · a road
//   sliver's side read off its centroid (the old rule) · the finder's old 1 mm-INBOARD sample (LS #39 M1) · every taper's
//   inward flipped · RECTANGLES for the tapers (no mitre) · a taper per partition EDGE (no stretch) · the crease split
//   without `cutCreases` (each polygon rounding its own crossing) · a side at an undrawable bend left perpendicular,
//   beside its neighbour's edge instead of on it (LS #39's 0.18 mm crack).
//   node checks/claims-the-kerb-stands-and-drops-at-each-cut.mjs [--selftest]
import { kerbPlan, makeHeightField, liftBuffer, riserFromEdges, kerbCells, cutCreases, splitAtCreases, withSide, ringsInside,
  curblessEdges, taperRegions, mitreBases, kerbRegions } from '../cartograph/kerbLift.mjs'
import { conformAndRefine, findTJunctions } from '../cartograph/groundConformity.js'

const h = 0.15, taperRun = 1.0, kerb = { height: h, rampSlope: 1 / 12, flareSlope: 1 / 10, taperRun }
// the scene in LOCAL metres, placed in the world by a rotation + a non-integer offset; every row reads local coordinates
const th = 0.37, C = Math.cos(th), S = Math.sin(th), O = [123.4567, 98.7654]
const W = ([x, z]) => [O[0] + C * x - S * z, O[1] + S * x + C * z], Lc = ([x, z]) => { const dx = x - O[0], dz = z - O[1]; return [C * dx + S * dz, -S * dx + C * dz] }
// the fixture's vertices are LATTICE points, as the bake's partition is (Clipper's 1 mm grid); samples use W
const Wl = (p) => W(p).map(v => Math.round(v * 1e3) / 1e3)
const ring = (pts) => pts.map(Wl), sq = (a, b, c, d) => ring([[a, b], [c, b], [c, d], [a, d]])
const rev = (r) => [...r].reverse()
const block = sq(0, 0, 10, 10), inner = sq(0.3, 0.3, 9.7, 9.7)
const bareCurb = sq(20, 0, 20.3, 10), bare = sq(20.3, 0, 30, 10), blockB = ring([[20, 0], [20.3, 0], [30, 0], [30, 10], [20.3, 10], [20, 10]])
// C: the curb leaves the south edge at (40, 0) at 2.5°; the vacant wedge under it owns the road edge
const tC = 10 * Math.tan(2.5 * Math.PI / 180)
const curbC = ring([[40, 0], [50, tC], [50, tC + 0.3], [40, 0.3]]), wedgeC = ring([[40, 0], [50, 0], [50, tC]]), restC = ring([[40, 0.3], [50, tC + 0.3], [50, 10], [40, 10]])
const blockC = ring([[40, 0], [50, 0], [50, tC], [50, tC + 0.3], [50, 10], [40, 10], [40, 0.3]])
// D: a 5° reflex bend at (65, 0) on the south side; on the north, a vertex at the lattice point nearest the side's middle —
// within one rounding of its chord, which is what noding leaves along a straight edge
const dD = 5 * Math.tan(5 * Math.PI / 180), blockD = ring([[60, 0], [65, 0], [70, -dD], [70, 10], [65, 10], [60, 10]])
// E: a FINGER 7 cm wide and 5 m long off a 10 m block, curbless all round; its 7 cm tip meets the south side at a bend
// 0.07° off square, convex at both ends, so no bisector can be drawn on it (w + run·(kB − kA) < 0) and its side there must
// be the south side's own line (LS #39, the finger at (−148.79, 318.64))
const aE = 0.07 * Math.PI / 180, qE = [90 + 0.07 * Math.sin(aE), 0.07 * Math.cos(aE)]
const blockE = ring([[80, 0], [90, 0], qE, [85, qE[1]], [85, 10], [80, 10]])
const cut = { face: [Wl([4, 0]), Wl([5.5, 0])], inward: (() => { const a = W([0, 0]), b = W([0, 1]); return [b[0] - a[0], b[1] - a[1]] })() }
// each group as the bake hands it over: polygons, outer + holes, never regrouped
const groupsIn = [
  ['mat:asphalt', [{ outer: sq(-5, -5, 95, 15), holes: [rev(block), rev(blockB), rev(blockC), rev(blockD), rev(blockE)] }]],
  ['mat:curb', [{ outer: block, holes: [rev(inner)] }, { outer: bareCurb, holes: [] }, { outer: curbC, holes: [] }]],
  ['mat:sidewalk', [{ outer: inner, holes: [] }]],
  ['face:vacant', [{ outer: bare, holes: [] }, { outer: wedgeC, holes: [] }, { outer: restC, holes: [] }, { outer: blockD, holes: [] }, { outer: blockE, holes: [] }]],
]
const keyOf = (k) => k.slice(k.indexOf(':') + 1)
// what lifts is the painter's block (`pr.block`), noded with the paint
const blockRings = [block, blockB, blockC, blockD, blockE]
const P0 = kerbPlan({ blockRings, groups: groupsIn.map(([k, items]) => ({ key: keyOf(k), items })), ramps: [cut], kerb })
const inBlock = P0.inBlock
const R = h / kerb.rampSlope, F = h / kerb.flareSlope
// heights are good to the mesh's own resolution: the partition sits on Clipper's 1 mm grid, so a vertex is up to ~1 mm off
// the line it lies on, which is h × 1 mm ÷ the shortest run in height
const e = h * 1e-3 / Math.min(R, F, taperRun)
const DRAWN = h / 2                       // a cut is on screen when the drawn surface is within half the kerb of the field

// ── MUTANTS' FINDER: the one M1 retired — a point 1 mm INBOARD of each block edge, "is curb drawn there?" (pre-03550411) ──
function inboardCurbless(blockRings, curbRings) {
  const inB = ringsInside(blockRings), inCurb = ringsInside(curbRings), E = 1e-3, out = []
  for (const r of blockRings) for (let i = 0; i < r.length; i++) {
    const A = r[i], B = r[(i + 1) % r.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1e-6) continue
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
    let n = [-u[1], u[0]]; if (!inB([M[0] + n[0] * E, M[1] + n[1] * E])) n = [-n[0], -n[1]]
    const P0_ = [A[0] + n[0] * E, A[1] + n[1] * E], d = [B[0] - A[0], B[1] - A[1]], ts = [0, 1]
    for (const cr of curbRings) for (let j = 0; j < cr.length; j++) { const c = cr[j], f = [cr[(j + 1) % cr.length][0] - c[0], cr[(j + 1) % cr.length][1] - c[1]], den = d[0] * f[1] - d[1] * f[0]; if (Math.abs(den) < 1e-12) continue
      const w = [c[0] - P0_[0], c[1] - P0_[1]], t = (w[0] * f[1] - w[1] * f[0]) / den, v = (w[0] * d[1] - w[1] * d[0]) / den; if (t > 0 && t < 1 && v >= 0 && v <= 1) ts.push(t) }
    ts.sort((a, b) => a - b)
    for (let k = 0; k + 1 < ts.length; k++) { const t0 = ts[k], t1 = ts[k + 1]; if ((t1 - t0) * L < 1e-6) continue
      if (inCurb([P0_[0] + d[0] * (t0 + t1) / 2, P0_[1] + d[1] * (t0 + t1) / 2])) continue
      const at = (t) => t === 0 ? A : t === 1 ? B : [A[0] + d[0] * t, A[1] + d[1] * t]
      out.push({ A: at(t0), B: at(t1), inward: n }) } }
  return out
}
const squared = (regions) => regions.map(g => { if (!g.edgeA && !g.edgeB) return g
  const pt = (s, t) => [g.A[0] + g.u[0] * s + g.inward[0] * t, g.A[1] + g.u[1] * s + g.inward[1] * t], poly = [...g.poly]
  if (g.edgeA) poly[3] = pt(0, taperRun); if (g.edgeB) poly[2] = pt(g.w, taperRun)
  return { ...g, kA: g.edgeA ? 0 : g.kA, kB: g.edgeB ? 0 : g.kB, edgeA: false, edgeB: false, poly } })
const rectangles = (edges) => edges.map(({ A, B, inward: n }) => { const w = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / w, (B[1] - A[1]) / w]
  const pt = (s, t) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t]
  return { kind: 'ramp', taper: true, A, u, inward: n, w, R: taperRun, F: null, kA: 0, kB: 0, poly: [pt(0, 0), pt(w, 0), pt(w, taperRun), pt(0, taperRun)] } })

/** run the bake's pieces on the scene. The default is the bake's own path (P0 = kerbPlan); a mutant swaps one piece:
 *  `split` (the crease split at all), `regionsOf` (drop regions from the FIELD), `finder` ('inboard'), `flip` (inward),
 *  `tapers` ('rect' | 'perEdge' | 'square': a side on its neighbour's line rebuilt perpendicular), `cutOnce` (cutCreases
 *  before the split). This scene has no terrain: nothing refines. */
function judge({ regionsOf = (r) => r, split = true, finder = 'owner', flip = false, tapers = 'stretch', cutOnce = true } = {}) {
  let curbless = P0.curbless, regions0 = P0.regions
  if (finder !== 'owner' || flip || tapers !== 'stretch') {
    if (finder === 'inboard') curbless = inboardCurbless(blockRings, [block, rev(inner), bareCurb, curbC])
    if (flip) curbless = curbless.map(c => ({ ...c, inward: [-c.inward[0], -c.inward[1]] }))
    const t = tapers === 'rect' ? rectangles(curbless) : tapers === 'perEdge' ? mitreBases(curbless, taperRun) : tapers === 'square' ? squared(taperRegions(curbless, taperRun)) : taperRegions(curbless, taperRun)
    regions0 = [...kerbRegions([cut], kerb), ...t]
  }
  const regions = regionsOf(regions0)
  const field = makeHeightField(regions, h)
  let cells = kerbCells(regions0, blockRings), items = groupsIn.map(([, polys]) => polys)
  if (split && cutOnce) { const cc = cutCreases(groupsIn.map(([k, polys]) => ({ key: keyOf(k), items: polys })), cells); cells = cc.cells; items = cc.groups.map(g => g.items) }
  const polysOf = items.map(polys => withSide(split ? splitAtCreases(polys, cells, inBlock) : polys, inBlock))
  // the crease split leaves every edge shared: edges used by one face only, before the split and after (the drawing's own
  // outer edge is the same both times)
  const onceM = (gs) => { const E = new Map(), k = (p) => Math.round(p[0] * 1e3) + ',' + Math.round(p[1] * 1e3)
    for (const ps of gs) for (const p of ps) for (const r of [p.outer, ...(p.holes || [])]) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], x = k(a), y = k(b); if (x === y) continue
      const K = x < y ? x + '|' + y : y + '|' + x, v = E.get(K) || E.set(K, { n: 0, L: Math.hypot(b[0] - a[0], b[1] - a[1]) }).get(K); v.n++ }
    let m = 0; for (const v of E.values()) if (v.n === 1) m += v.L; return m }
  const onceBefore = onceM(items), onceAfter = onceM(polysOf)
  const bufs = conformAndRefine(polysOf.map(polys => ({ polys, refine: null, yLift: 0 })))
  const tj = findTJunctions(bufs.map((b, i) => ({ id: groupsIn[i][0], ...b })))
  const lifted = bufs.map((b, i) => ({ key: keyOf(groupsIn[i][0]), ...liftBuffer(b, field) }))
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
  const tapersNow = regions0.filter(g => g.taper)
  const cB = curbless.map(({ A, B }) => [Lc(A), Lc(B)]).filter(([a, b]) => a[0] > 19 && a[0] < 31 && b[0] > 19 && b[0] < 31), cLen = cB.reduce((n, [a, b]) => n + Math.hypot(b[0] - a[0], b[1] - a[1]), 0)
  const worst = (pts, want) => Math.max(...off(pts, want)).toFixed(3)
  // every taper's inward points into its lifted face: 1 mm off its base's middle, inward, is in the block
  const inwardOk = tapersNow.every(g => { const M = [g.A[0] + g.u[0] * g.w / 2 + g.inward[0] * 1e-3, g.A[1] + g.u[1] * g.w / 2 + g.inward[1] * 1e-3]; return inBlock(M) })
  // D's bend: the tapers whose base touches (65, 0) — two, each mitred there, ending on the SAME far point
  const bend = Wl([65, 0]), atBend = tapersNow.filter(g => [g.poly[0], g.poly[1]].some(p => Math.hypot(p[0] - bend[0], p[1] - bend[1]) < 1e-6))
  const farAt = (g) => Math.hypot(g.poly[0][0] - bend[0], g.poly[0][1] - bend[1]) < 1e-6 ? g.poly[3] : g.poly[2]
  const oneCrease = atBend.length === 2 && Math.hypot(farAt(atBend[0])[0] - farAt(atBend[1])[0], farAt(atBend[0])[1] - farAt(atBend[1])[1]) < 1e-9
  // D's north side, wiggle and all: the tapers whose base lies on it
  // E's bend: the short taper's side there ends ON the south side's line (no crease beside the block edge)
  const bendE = Wl([90, 0]), southE = [Wl([80, 0]), bendE], lineOff = (P, [a, b]) => Math.abs((b[0] - a[0]) * (P[1] - a[1]) - (b[1] - a[1]) * (P[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1])
  const shortE = tapersNow.filter(g => g.w < 0.1 && [g.poly[0], g.poly[1]].some(p => Math.hypot(p[0] - bendE[0], p[1] - bendE[1]) < 1e-6))
  const sideE = shortE.map(g => Math.hypot(g.poly[0][0] - bendE[0], g.poly[0][1] - bendE[1]) < 1e-6 ? g.poly[3] : g.poly[2])
  const north = tapersNow.filter(g => [g.poly[0], g.poly[1]].every(p => { const q = Lc(p); return q[0] > 59.9 && q[0] < 70.1 && Math.abs(q[1] - 10) < 1e-3 }))
  const rows = [
    ['the asphalt stays at 0', asph.every(([, y]) => Math.abs(y) < e)],
    ['block A stands at h away from the cut (drawn)',  near(standPts, () => h, e)],
    ["the cut's kerb face is flush (drawn)",           near(along(4, 5.5, d), () => 0, DRAWN), worst(along(4, 5.5, d), () => 0)],
    ['the ramp reaches h at its run (drawn)',           near(along(4, 5.5, R - d), () => h, DRAWN), worst(along(4, 5.5, R - d), () => h)],
    ['the ramp is linear between (drawn)',              near(rampMid, ([, z]) => h * z / R, DRAWN), worst(rampMid, ([, z]) => h * z / R)],
    ['a flare rises along the kerb at its slope (drawn)', near([0.25, 0.5, 0.75].map(f => [4 - F * f, d]), ([x]) => h * (4 - x) / F, DRAWN)],
    ["block B's curbless edges are its three road sides", Math.abs(cLen - (9.7 + 10 + 9.7)) < 1e-2 && cB.every(([a, b]) => a[0] >= 20.3 - 1e-3 && b[0] >= 20.3 - 1e-3)],
    ['a curbless edge is flush at the road (drawn)',    near([...along(20.5, 29.5, d), ...along(20.5, 29.5, 10 - d)], () => 0, DRAWN)],
    ['…and stands at h past its taper (drawn)',         near(pastTaper, () => h, DRAWN), worst(pastTaper, () => h)],
    ["C: the wedge under a curb leaving at 2.5° slopes flush at the road (drawn)", near(along(40.02, 41, d, 8), () => 0, DRAWN), worst(along(40.02, 41, d, 8), () => 0)],
    ["every taper's inward points into its lifted face", inwardOk],
    ["D: the two tapers at the 5° bend share ONE crease", oneCrease],
    ["D: the bend's wedge slopes, as its own base's taper (field)", field.y(W([65.03, 0.8])) <= h * 0.85],
    ['D: a vertex within one rounding of its chord is no bend (one taper on the north side)', north.length === 1],
    ["E: at a bend too sharp for its 7 cm stretch's bisector, that taper's side IS its neighbour's edge line", shortE.length === 1 && sideE.every(P => lineOff(P, southE) < 1e-9), sideE.map(P => lineOff(P, southE).toExponential(1)).join(',')],
    ['the crease split leaves every edge shared', Math.abs(onceAfter - onceBefore) < 1e-6, (onceAfter - onceBefore).toFixed(4)],
    ['the riser stands along every kerb but the flush span', riser.kerbM > 40 - 1.5 && riserH.length > 0 && riserH.every(v => v <= h + e)],
    ['no step anywhere is left without a face',         Object.keys(riser.bareM).length === 0],
    ['the conformed ground has no crack',               tj.total === 0],
    ['a road sliver along the block edge stays on the road (its side is carried)', sliver(carried)],
  ]
  return { rows, note: `riser ${riser.kerbM.toFixed(3)} m · ${riserH.length} quads · B curbless ${cLen.toFixed(2)} m · tapers ${tapersNow.length} · T-junctions ${tj.total} · ramp run ${R.toFixed(2)} m · flare ${F.toFixed(2)} m · ${tris.length} tris${Object.keys(riser.bareM).length ? ' · BARE ' + JSON.stringify(riser.bareM) + ' at (local) ' + JSON.stringify(Object.fromEntries(Object.entries(riser.bareAt).map(([k, v]) => [k, v.map(p => Lc(p).map(x => +x.toFixed(3)))]))) : ''}` }
}
// ⭐ THE SLIVER: a zero-area road triangle ALONG block A's south kerb, its centroid 0.3 mm INSIDE the block (what conformity
// leaves where a crease ends on the block edge on a vertex rounded off it). Its polygon is road, so its carried side is road.
// `sideOf` is how the triangle's side is decided — the carried one, or (mutant) the old centroid read.
const sliver = (sideOf) => {
  const tri = [W([2, 0]), W([8, 0]), W([5, 0.0009])], P = new Float32Array(tri.flatMap(([x, z]) => [x, 0, z]))
  const L = liftBuffer({ positions: P, indices: new Uint32Array([0, 1, 2]), side: Uint8Array.of(sideOf(tri)) }, makeHeightField(P0.regions, h))
  return !L.side[0] && [1, 4, 7].every(i => L.positions[i] === 0)
}
const carried = () => 0                                                                  // its polygon's side: the road
const byCentroid = (tri) => (P0.inBlock([(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3]) ? 1 : 0)
const show = (rows) => { for (const [name, ok, w] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${name}${w != null ? ` (worst ${w} m)` : ''}`) }

if (process.argv.includes('--selftest')) {
  const isCut = (g) => (g.kind === 'ramp' && !g.taper) || g.kind === 'flareA' || g.kind === 'flareB'
  const real = judge()
  const mutants = [
    ['with the groups not split at the creases (2c5560ca)', { split: false }],
    ["split as the bake does but the cut's ramp and flares dropped from the field", { regionsOf: (r) => r.filter(g => !isCut(g)) }],
    ['the finder reading a point 1 mm INBOARD (LS #39 M1)', { finder: 'inboard' }],
    ["every taper's inward flipped", { flip: true }],
    ['RECTANGLES for the tapers (no mitre)', { tapers: 'rect' }],
    ['a taper per partition EDGE (no stretch)', { tapers: 'perEdge' }],
    ['the crease split without cutCreases', { cutOnce: false }],
    ['a side at an undrawable bend left perpendicular, beside its neighbour (LS #39 crack)', { tapers: 'square' }],
  ].map(([name, o]) => [name, judge(o)])
  const tests = [["the bake's path is GREEN", real.rows.every(([, ok]) => ok)],
    ...mutants.map(([name, r]) => [`${name}: RED`, r.rows.some(([, ok]) => !ok)]),
    ['the same sliver with its side read off its centroid (the old rule) is lifted — RED', !sliver(byCentroid)]]
  for (const [name, r] of mutants) { console.log(`  ${name}:`); show(r.rows.filter(([, ok]) => !ok)) }
  for (const [m, ok] of tests) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(tests.every(t => t[1]) ? 0 : 1)
}

const { rows, note } = judge()
show(rows)
console.log(`  (${note})`)
let bad = 0
for (const [, ok] of rows) if (!ok) bad++
console.log(bad ? `⛔ ${bad} wrong` : '✅ the kerb stands at h and drops flush at its cut; a riser closes every kerbed step, and a curbless stretch slopes flush, mitred at its bends')
process.exit(bad ? 1 : 0)
