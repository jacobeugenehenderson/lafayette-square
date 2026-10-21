// kerbLift.mjs — THE RAISED KERB, as geometry the ground bake applies (`BRIEF-corner-ramps-and-kerb §3` step 5).
//
// ⭐ RULED (2026-10-06): the WHOLE block inboard of the kerb face lifts by the town's authored height h (curb, walk, lawn,
// land use — alleys and paths painted inside it included); the road stays at 0. A RISER stands where the kerb is drawn;
// each curb cut slopes h → 0.
// ⭐ WHAT LIFTS is the painter's own block (`pr.block`, the partition Section paints into: every land use, lawn, walk and
// curb lies inside it and no road does — measured LS + Huron, 2026-10-07). One source; never a second list of groups.
// ⭐ h lives in the mesh's own y, UNEXAGGERATED: the runtime adds terrain × uExag on top (`terrainShader.js`), and a
// 15 cm kerb that grew with the town's exaggeration would be a Class D constant in disguise.
//
// The construction reads the mesh, never snaps to it, and NOTHING IS CUT (BRIEF-the-ground-knows-its-height §5):
//   · a cut is a RAMP (the cut's kerb-face span × the ramp run h/rampSlope, inward) and two FLARE triangles (run
//     h/flareSlope along the kerb) — regions of the height field, h → 0, CONTINUOUS inside the lifted block, evaluated
//     at every shared vertex. Their outlines are LINES OF THE PARTITION (`splitAtCreases`, before triangulation), so the
//     mesh has a vertex on every crease; cutting them into the finished mesh (`cutAlong`) left 287 T-junctions on LS.
//   · each triangle lifts by its group's class; a vertex both a lifted and an unlifted triangle use is split in two,
//     and a lifted vertex takes the height field (`liftBuffer`). The only step is the kerb face: a partition edge.
//   · the riser is every mesh edge with a lifted triangle on one side and an unlifted one on the other — built from
//     the conformed mesh itself, so it shares the ground's vertices and cannot crack (`riserFromEdges`).
// ⭐ This is the KERB part of the ground's height (the mesh's own y, unexaggerated); the TERRAIN part is the deformer's
//   (`groundDeformer.mjs`), and the runtime draws D × uExag + y.
// ⭐ WHERE NO CURB IS DRAWN, THE BLOCK SLOPES DOWN FLUSH (Jacob, 2026-10-06, Q1): a highway shoulder, an alley mouth, land
//   that just meets the road, and the drawing's edge (the rim). Every edge of the noded partition where a lifted face the
//   curb does not stand on meets the road, or nothing (`curblessEdges` — the riser's own read, `edgesAcross` +
//   `curbStands`, so the two cannot disagree), carries a TAPER `taperRun` deep (the town's value), 0 at the road to h at
//   the run. ⛔ A step left without a riser after that is a defect, counted.
// ⚠️ A region claims a point within `TOL` of it: the partition sits on Clipper's 1 mm grid, so a curbless edge's own
//   vertices can sit half a millimetre off the taper base drawn along it, and the clamp then puts them exactly on it.

import clipperLib from 'clipper-lib'
import { CLIP_SCALE, LATTICE_M } from '../src/lib/lattice.js'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1]

/** A point-in-rings test over many rings (even-odd), bucketed by z rows so a point costs one row. */
export function ringsInside(rings) {
  const ROW = 8, rows = new Map()
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j], b = r[i]; if (a[1] === b[1]) continue
    for (let k = Math.floor(Math.min(a[1], b[1]) / ROW); k <= Math.floor(Math.max(a[1], b[1]) / ROW); k++)
      (rows.get(k) || rows.set(k, []).get(k)).push([a, b])
  }
  return (P) => { let c = false
    for (const [a, b] of rows.get(Math.floor(P[1] / ROW)) || [])
      if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c
    return c }
}

// ── ONE OWNER PER EDGE (A10): WHO STANDS ON THE EDGE BETWEEN THE LIFTED BLOCK AND THE ROAD ───────────────────────────
// ⭐ The finder (before the mesh, on the noded partition) and the riser (after it, on the triangles) ask ONE question
//   through ONE reader: for every edge with a lifted face on one side and an unlifted face on the other — matched by its
//   EXACT ends, never by a distance — is the lifted face the curb? The curb (or a cut) stands a face there; anything else
//   slopes flush (a taper). So the two cannot disagree.
// ⛔ The finder used to read a point 1 mm INBOARD of the block edge ("is curb drawn there?"). Where a curb leaves the edge
//   at θ it saw the curb for 1 mm / tan θ past where the curb stops owning it, and the land-use wedge between got neither a
//   face nor a taper: LS #39, six steps of 0.15 m at θ 2.4°–11.4° (Plumb, 2026-10-21).
export const KERB_KEYS = new Set(['curb', 'curbCut'])

/** Every edge between a lifted face and an unlifted one, from `walk(visit)` — `ringEdges` (polygons) or `triangleEdges`
 *  (a mesh) — keyed by its exact (x, z) ends. Returns Map(key → { in, out, uses }): `in`/`out` the FIRST lifted / unlifted
 *  use, each { key, a, b, left } (a, b = [x, y, z]; `left` = the face lies left of a → b in (x, z), when the walk knows). */
export function edgesAcross(walk) {
  const edges = new Map()
  walk((key, side, a, b, left) => {
    const ka = `${a[0]},${a[2]}`, kb = `${b[0]},${b[2]}`, k = ka < kb ? ka + '|' + kb : kb + '|' + ka
    const rec = edges.get(k) || edges.set(k, { in: null, out: null, uses: 0 }).get(k)
    rec.uses++
    if (side) rec.in = rec.in || { key, a, b, left }; else rec.out = rec.out || { key, a, b, left }
  })
  return edges
}
/** THE ONE READER: on an edge with a lifted side and an unlifted side, does the curb stand it? */
export const curbStands = (rec, kerbKeys = KERB_KEYS) => kerbKeys.has(rec.in.key)

/** A walk over polygons: `groups` [{ key, items: [{ outer, holes, side }] }] (rings in metres). `left` from each ring's
 *  own winding: an outer's face lies on the side its winding turns to, a hole's on the other. */
export const ringEdges = (groups) => (visit) => {
  for (const { key, items } of groups) for (const it of items) [it.outer, ...(it.holes || [])].forEach((r, ri) => {
    let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]
    const left = (s > 0) === (ri === 0)               // shoelace in (x, z): s > 0 winds counter-clockwise, its inside on the left
    // a vertex is its LATTICE point (the partition sits on it), so 3.8130000000000024 and 3.813 are one vertex
    const L = (v) => Math.round(v * CLIP_SCALE) / CLIP_SCALE
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], a = [L(p[0]), 0, L(p[1])], b = [L(q[0]), 0, L(q[1])]
      if (a[0] === b[0] && a[2] === b[2]) continue
      visit(key, it.side, a, b, left) } })
}
/** A walk over a mesh: `groups` [{ key, positions, indices, side }] (after `liftBuffer`; `side` one per triangle). */
export const triangleEdges = (groups) => (visit) => {
  for (const { key, positions: P, indices: I, side } of groups) for (let t = 0; t < side.length; t++) for (let e = 0; e < 3; e++) {
    const a = I[3 * t + e], b = I[3 * t + (e + 1) % 3]
    visit(key, side[t], [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]) }
}

/** The CURBLESS edges of the noded ground partition: a lifted face the curb does not stand on (`curbStands`, the riser's
 *  own read, on the polygons) with an unlifted face — the ROAD — across it. `groups` as `ringEdges` takes them, each item's
 *  `side` stamped by `withSide`.
 *  ⛔ AN EDGE WITH NOTHING ACROSS IS NEVER READ AS THE RIM. Q1 slopes the rim too (Boz, R1, 2026-10-21: the rim keeps its
 *  taper), but an edge only one face uses is also what two faces leave when they meet without sharing their vertices —
 *  on LS 3,068 m of lifted|lifted edges inside blocks, which a rim read would have trenched to grade. Such edges are
 *  returned `unpaired` (lifted, not the curb's) for the caller to refuse until the rim is named POSITIVELY.
 *  Returns { curbless: [{ A, B, inward }] (on the edge, `inward` toward the lifted face), roadM, unpaired: [{ A, B, key }],
 *  unpairedM, orphanRoadM (an unlifted face with nothing across) }. */
export function curblessEdges(groups, kerbKeys = KERB_KEYS) {
  const curbless = [], unpaired = []
  let roadM = 0, unpairedM = 0, orphanRoadM = 0
  for (const rec of edgesAcross(ringEdges(groups)).values()) {
    const f = rec.in || rec.out, L = Math.hypot(f.b[0] - f.a[0], f.b[2] - f.a[2])
    if (!rec.in) { if (rec.uses === 1) orphanRoadM += L; continue }
    if (kerbKeys.has(rec.in.key)) continue
    const { a, b, left } = rec.in
    if (!rec.out) { if (rec.uses === 1) { unpaired.push({ A: [a[0], a[2]], B: [b[0], b[2]], key: rec.in.key }); unpairedM += L } continue }
    const u = [(b[0] - a[0]) / L, (b[2] - a[2]) / L]
    curbless.push({ A: [a[0], a[2]], B: [b[0], b[2]], inward: left ? [-u[1], u[0]] : [u[1], -u[0]] })
    roadM += L
  }
  return { curbless, roadM, unpaired, unpairedM, orphanRoadM }
}

/** Everything the bake needs to lift its ground: `blockRings` (the painter's block — what lifts), `groups` (the NODED
 *  ground partition, [{ key, items }], key without its kind — the curb is `curb`/`curbCut`), the curb cuts' `ramps`, the
 *  town's `kerb`. Returns { inBlock, curbless, curblessM, unpaired, unpairedM, orphanRoadM, flushTol, regions }. Throws when the
 *  block has curbless edges and the town's kerb norm gives no taperRun. */
export function kerbPlan({ blockRings, groups, ramps, kerb }) {
  const inBlock = ringsInside(blockRings)
  const { curbless, roadM, unpaired, unpairedM, orphanRoadM } = curblessEdges(groups.map(({ key, items }) => ({ key, items: withSide(items, inBlock) })))
  const curblessM = roadM
  if (curbless.length && !(kerb.taperRun > 0))
    throw new Error(`[kerbLift] ⛔ the kerb stands ${kerb.height} m and ${curblessM.toFixed(0)} m of block edge has NO curb drawn (alleys, shoulders, land meeting the road), where the block slopes down flush — but the town's kerb norm gives no taperRun, the town's value, never the kit's (norms.json → kerb.taperRun, metres).`)
  // ⭐ FLUSH, TO THE LATTICE: a crease that ends on a block edge ends on a vertex Clipper rounded up to half a grid step off
  // it, which the field lifts by the kerb's rise over that distance. So "at grade" is the kerb's rise over ONE lattice
  // step at its steepest run — never a unitless epsilon (the riser read `1e-6` and called a 0.1 mm lift a step).
  const runs = [kerb.rampSlope > 0 ? kerb.height / kerb.rampSlope : null, kerb.flareSlope > 0 ? kerb.height / kerb.flareSlope : null, kerb.taperRun > 0 ? kerb.taperRun : null].filter(v => v != null)
  const flushTol = runs.length ? kerb.height * LATTICE_M / Math.min(...runs) : kerb.height * LATTICE_M
  // ⭐ A NARROW BLOCK (narrower than two runs) is the one place a taper reaches past the block: across ITS OWN ring, the far
  // side. The cells clip it to the block (`kerbCells`), as they have since 8bd2751f — counted, never silent (Boz,
  // 2026-10-21; the ridge rule is Jacob's). A crease reaching ANOTHER block's ring, or starting on no ring, is refused.
  const tapers = taperRegions(curbless, kerb.taperRun), crossed = mitresCrossing(tapers, blockRings)
  const narrow = crossed.filter(c => c.sameRing), foreign = crossed.filter(c => !c.sameRing)
  if (foreign.length) throw new Error(`[kerbLift] ⛔ ${foreign.length} mitred taper crease(s) cross ANOTHER block's edge (or start on no block ring) — a bend too sharp for the run ${kerb.taperRun} m: ${foreign.slice(0, 6).map(c => `from (${c.from.map(v => v.toFixed(3))}) reaching ${c.reach.toFixed(2)} m, across ring ${c.ring} (${c.edge[0].map(v => v.toFixed(3))})→(${c.edge[1].map(v => v.toFixed(3))})`).join(' · ')}`)
  const narrowBlock = narrow.map(c => ({ ring: c.ring, at: c.from, reachM: +c.reach.toFixed(3), pastFarEdgeM: +c.past.toFixed(3) }))
  return { inBlock, curbless, curblessM, unpaired, unpairedM, orphanRoadM, flushTol, narrowBlock, regions: [...kerbRegions(ramps, kerb), ...tapers] }
}

/** Every MITRED crease (k ≠ 0) of `tapers` that properly crosses a block-ring edge other than those at its own vertex:
 *  [{ from, reach, edge, ring, sameRing, past }] — `ring` the crossed edge's block ring, `sameRing` when the crease starts
 *  on that same ring (a vertex of it, by its lattice point: the block rings are noded with the paint), `past` how far the
 *  crease runs beyond the crossing. A perpendicular side is the rectangle's, as before; only the bisector's reach is new. */
export function mitresCrossing(tapers, blockRings) {
  const CELL = 8, cells = new Map(), out = [], seen = new Set(), lk = (p) => Math.round(p[0] / LATTICE_M) + ',' + Math.round(p[1] / LATTICE_M), ringsAt = new Map()
  blockRings.forEach((r, ri) => { for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]
    ;(ringsAt.get(lk(a)) || ringsAt.set(lk(a), new Set()).get(lk(a))).add(ri)
    for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
      for (let z = Math.floor(Math.min(a[1], b[1]) / CELL); z <= Math.floor(Math.max(a[1], b[1]) / CELL); z++) (cells.get(x + ',' + z) || cells.set(x + ',' + z, []).get(x + ',' + z)).push([a, b, ri]) } })
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  for (const g of tapers) for (const [k, P, Q] of [[g.kA, g.poly[0], g.poly[3]], [g.kB, g.poly[1], g.poly[2]]]) {
    if (!k) continue
    const key = P + '|' + Q; if (seen.has(key)) continue; seen.add(key)
    const hit = new Set()
    for (let x = Math.floor(Math.min(P[0], Q[0]) / CELL); x <= Math.floor(Math.max(P[0], Q[0]) / CELL); x++)
      for (let z = Math.floor(Math.min(P[1], Q[1]) / CELL); z <= Math.floor(Math.max(P[1], Q[1]) / CELL); z++)
        for (const e of cells.get(x + ',' + z) || []) { if (hit.has(e)) continue; hit.add(e)
          const [a, b, ri] = e; if ((a[0] === P[0] && a[1] === P[1]) || (b[0] === P[0] && b[1] === P[1])) continue
          const d1 = cr(a, b, P), d2 = cr(a, b, Q), d3 = cr(P, Q, a), d4 = cr(P, Q, b)
          if (Math.abs(d1) <= 1e-9 * Math.hypot(b[0] - a[0], b[1] - a[1])) continue      // the crease starts ON this edge
          if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            const reach = Math.hypot(Q[0] - P[0], Q[1] - P[1]), f = d1 / (d1 - d2)
            out.push({ from: P, reach, edge: [a, b], ring: ri, sameRing: !!ringsAt.get(lk(P))?.has(ri), past: reach * (1 - f) }) } } }
  return out
}

/** A TAPER per curbless STRETCH: the stretch × `taperRun` inward (toward the lifted group), 0 → h linearly.
 *  ⭐ THE STRETCH IS THE SUBJECT, NOT THE PARTITION EDGE (Boz, 2026-10-21): Q1 slopes a curbless stretch flush, and a
 *  millimetre-long edge between two lattice vertices is no bend of anything drawn. So the curbless edges are chained into
 *  stretches, and each stretch keeps only the vertices that lie more than ONE LATTICE ROUNDING (√2/2 step, the bound
 *  `nodeAcrossGroups` conforms to) off the chord between its neighbours: every vertex dropped lies within a rounding of its
 *  region's base, where the field lifts it by at most h·(√2/2 step)/run — under `flushTol` (h·step/run). The bases' ends
 *  are partition vertices. Then each base is a region of `mitred`. */
export function taperRegions(edges, taperRun) {
  return mitred(stretchLines(edges), taperRun)
}

/** The curbless edges as STRETCHES ([{ A, B, inward }], fewer and longer): chained where exactly two edges meet, each chain
 *  kept at the vertices more than one lattice rounding off its chord (Douglas–Peucker at that bound). */
export function stretchLines(edges) {
  const BOUND = Math.SQRT1_2 * LATTICE_M, k2 = (p) => Math.round(p[0] / LATTICE_M) + ',' + Math.round(p[1] / LATTICE_M), at = new Map()
  edges.forEach((e, i) => { for (const P of [e.A, e.B]) { const k = k2(P); (at.get(k) || at.set(k, []).get(k)).push(i) } })
  const used = new Uint8Array(edges.length), out = []
  const other = (i, P) => { const e = edges[i]; return k2(e.A) === k2(P) ? e.B : e.A }
  const walk = (i, P) => { const pts = [P], ids = []                      // from vertex P along edge i while degree is 2
    for (;;) { used[i] = 1; ids.push(i); const Q = other(i, P); pts.push(Q); const here = at.get(k2(Q))
      if (here.length !== 2) break; const j = here[0] === i ? here[1] : here[0]; if (used[j]) break; i = j; P = Q }
    return { pts, ids } }
  const chains = []
  edges.forEach((e, i) => { if (used[i]) return; for (const P of [e.A, e.B]) if (at.get(k2(P)).length !== 2) { chains.push(walk(i, P)); return } })
  edges.forEach((e, i) => { if (!used[i]) chains.push(walk(i, e.A)) })        // closed loops
  const off = (Q, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]); return L ? Math.abs((Q[0] - a[0]) * d[1] - (Q[1] - a[1]) * d[0]) / L : Math.hypot(Q[0] - a[0], Q[1] - a[1]) }
  for (const { pts, ids } of chains) {
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
    const dp = (a, b) => { let m = -1, mi = -1; for (let i = a + 1; i < b; i++) { const d = off(pts[i], pts[a], pts[b]); if (d > m) { m = d; mi = i } }
      if (m > BOUND) { keep[mi] = 1; dp(a, mi); dp(mi, b) } }
    dp(0, pts.length - 1)
    let a = 0
    for (let b = 1; b < pts.length; b++) { if (!keep[b]) continue
      const A = pts[a], B = pts[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
      const ref = edges[ids[a]].inward, n = [-u[1], u[0]], s = n[0] * ref[0] + n[1] * ref[1]
      out.push({ A, B, inward: s >= 0 ? n : [-n[0], -n[1]] }); a = b }
  }
  return out
}

/** A TAPER per base: the base × `taperRun` inward, 0 → h linearly.
 *  ⭐ MITRED (Boz, 2026-10-21, in the crease-split fix): where exactly two bases share a vertex, both tapers end
 *  on ONE crease, the bisector of their inward normals, reaching run / cos(θ/2) — a band of uniform depth along a
 *  polyline, drawn as Q1 asks. Rectangles left two creases leaving one vertex a bend's angle apart: overlapping at a
 *  convex bend (a sliver Clipper rounded crossings into — 191 on LS), and at a reflex bend a WEDGE no taper covered, which
 *  stood at h. At a convex bend each point keeps the lower plane, as before: a point is on the side of the bisector whose
 *  base is nearer. A stretch's free end (a curb starts there, or three edges meet) keeps the perpendicular side.
 *  Each region carries `kA`/`kB`: its end creases as s = t·kA and s = w + t·kB in its own frame (0 = perpendicular).
 *  ⛔ Two curbless edges folding back on each other (normals opposite) have no bisector: refused. */
function mitred(edges, taperRun) {
  const k2 = (p) => p[0] + ',' + p[1], at = new Map()
  edges.forEach((e, i) => { for (const end of ['A', 'B']) { const k = k2(e[end]); (at.get(k) || at.set(k, []).get(k)).push(i) } })
  const unit = (v) => { const L = Math.hypot(v[0], v[1]); return [v[0] / L, v[1] / L] }
  // the crease direction leaving vertex P of edge i: the bisector with the one other curbless edge there, else the normal
  const crease = (i, P) => { const n = edges[i].inward, here = at.get(k2(P))
    if (here.length !== 2) return n
    const o = edges[here[0] === i ? here[1] : here[0]].inward, s = [n[0] + o[0], n[1] + o[1]]
    if (n[0] === o[0] && n[1] === o[1]) return n
    if (Math.hypot(s[0], s[1]) < 1e-12) throw new Error(`[kerbLift] ⛔ taperRegions: two curbless edges fold back on each other at (${P}) — their tapers have no shared crease`)
    return unit(s) }
  // ⭐ A MITRE ONLY WHERE IT CAN BE DRAWN: a region's two creases must not cross inside its run (w + run·(kB − kA) ≥ 0), or
  // its trapezoid turns inside out and stops covering its own base — a short edge between two sharp bends, where the
  // bisector reaches run / cos(θ/2) (82 m at LS's 178.6° finger tip). Such a bend keeps both perpendicular sides, as the
  // rectangles had (the narrow-block class: `mitresCrossing`, counted by the caller). Resolved to a fixpoint, one bend
  // at a time, so a crease is always shared by both regions on it.
  const flat = new Set()                                     // bend vertices kept perpendicular
  const k = (i, P) => { if (flat.has(k2(P))) return 0
    const n = edges[i].inward, m = crease(i, P), u = unit([edges[i].B[0] - edges[i].A[0], edges[i].B[1] - edges[i].A[1]])
    return (m[0] * u[0] + m[1] * u[1]) / (m[0] * n[0] + m[1] * n[1]) }
  for (let changed = true; changed;) { changed = false
    edges.forEach((e, i) => { const w = Math.hypot(e.B[0] - e.A[0], e.B[1] - e.A[1])
      if (w + taperRun * (k(i, e.B) - k(i, e.A)) >= 0) return
      for (const P of [e.A, e.B]) if (!flat.has(k2(P)) && k(i, P) !== 0) { flat.add(k2(P)); changed = true } }) }
  // a shared crease's far end is computed ONCE, so both regions carry the identical point (computed in each region's own
  // frame it rounded a unit apart, and the split met two creases instead of one)
  const far = new Map()
  const farEnd = (i, P) => { const key = k2(P); if (far.has(key)) return far.get(key)
    const m = crease(i, P), n = edges[i].inward, L = taperRun / (m[0] * n[0] + m[1] * n[1]), Q = [P[0] + m[0] * L, P[1] + m[1] * L]
    far.set(key, Q); return Q }
  return edges.map(({ A, B, inward: n }, i) => {
    const w = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / w, (B[1] - A[1]) / w], kA = k(i, A), kB = k(i, B)
    const pt = (s, t) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t]
    return { kind: 'ramp', taper: true, A, u, inward: n, w, R: taperRun, F: null, kA, kB,
      poly: [A, B, kB ? farEnd(i, B) : pt(w, taperRun), kA ? farEnd(i, A) : pt(0, taperRun)] }   // the base on the edge's own ends
  })
}

/** Ramp + flare regions for every cut. Each: { kind, poly, A, u, inward, w, R, F }. */
export function kerbRegions(ramps, { height: h, rampSlope, flareSlope }) {
  const R = h / rampSlope, F = h / flareSlope, out = []
  for (const c of ramps) {
    const [A, B] = c.face, n = c.inward, w = Math.hypot(B[0] - A[0], B[1] - A[1])
    if (!(w > 1e-6)) continue
    const u = [(B[0] - A[0]) / w, (B[1] - A[1]) / w], at = (s, t) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t]
    const base = { A, u, inward: n, w, R, F }
    out.push({ ...base, kind: 'ramp', poly: [at(0, 0), at(w, 0), at(w, R), at(0, R)] })
    out.push({ ...base, kind: 'flareA', poly: [at(-F, 0), at(0, 0), at(0, R)] })
    out.push({ ...base, kind: 'flareB', poly: [at(w, 0), at(w + F, 0), at(w, R)] })
  }
  return out
}

const TOL = 2e-3                                    // a region claims a point within 2 mm of it (Clipper's 1 mm slices)

// whether P lies on region g, in g's own frame (s along the face, t inward), and the height g asks for there
function regionAt(g, P, h) {
  const d = sub(P, g.A), s = dot(d, g.u), t = dot(d, g.inward)
  if (t < -TOL || t > g.R + TOL) return null
  const tc = Math.max(0, Math.min(g.R, t))
  if (g.kind === 'ramp') return s < (g.kA || 0) * tc - TOL || s > g.w + (g.kB || 0) * tc + TOL ? null : h * tc / g.R
  const ds = g.kind === 'flareA' ? -s : s - g.w                      // distance past the ramp's end, along the kerb
  if (ds < -TOL || ds > g.F * (1 - tc / g.R) + TOL) return null
  return Math.min(h, h * (tc / g.R + Math.max(0, ds) / g.F))
}

const bboxOf = (rings) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of rings) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }

/** The height field: `y(P)` = h, or less on a cut's ramp/flares or a curbless taper (the lowest region wins). */
export function makeHeightField(regions, h) {
  const CELL = 16, cells = new Map()
  regions.forEach((g, gi) => { const [a, b, c, d] = bboxOf([g.poly])
    for (let x = Math.floor((a - TOL) / CELL); x <= Math.floor((c + TOL) / CELL); x++) for (let z = Math.floor((b - TOL) / CELL); z <= Math.floor((d + TOL) / CELL); z++)
      (cells.get(`${x},${z}`) || cells.set(`${x},${z}`, []).get(`${x},${z}`)).push(gi) })
  const y = (P) => { let v = h
    for (const gi of cells.get(`${Math.floor(P[0] / CELL)},${Math.floor(P[1] / CELL)}`) || []) {
      const r = regionAt(regions[gi], P, h); if (r != null) v = Math.min(v, r) }
    return v }
  return { y }
}

/** Lift one group's buffer: each triangle whose CARRIED side is the block (`side`, one per triangle — the side of the
 *  polygon it was triangulated from, `withSide` → `groundConformity.js#emit`) takes the field's height at its vertices
 *  (added to the y it already has); a vertex used by a lifted AND an unlifted triangle is split. Returns new buffers +
 *  the per-triangle side.
 *  ⛔ NEVER A CENTROID TEST. Reading each triangle's side off its centroid recovered identity from geometry (A15) and
 *  misread every zero-area sliver ALONG the block edge — LS raised 395 road slivers that way, and their long edges were
 *  the bare `asphalt|asphalt` steps. A buffer that carries no side throws. */
export function liftBuffer({ positions, indices, side: carried }, field) {
  const nt = indices.length / 3
  if (!carried || carried.length !== nt) throw new Error(`[kerbLift] liftBuffer: the buffer carries no side per triangle (${carried ? carried.length : 'none'} for ${nt}) — stamp its polygons with withSide() before conformAndRefine`)
  const side = Uint8Array.from(carried)
  const nv = positions.length / 3, usedIn = new Uint8Array(nv), usedOut = new Uint8Array(nv)
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) (side[t] ? usedIn : usedOut)[indices[3 * t + k]] = 1
  const extra = []                       // vertices both sides use: the inside triangles get a copy
  const copyOf = new Int32Array(nv).fill(-1)
  for (let v = 0; v < nv; v++) if (usedIn[v] && usedOut[v]) { copyOf[v] = nv + extra.length; extra.push(v) }
  const P = new Float32Array((nv + extra.length) * 3); P.set(positions)
  extra.forEach((v, i) => { P[(nv + i) * 3] = positions[v * 3]; P[(nv + i) * 3 + 1] = positions[v * 3 + 1]; P[(nv + i) * 3 + 2] = positions[v * 3 + 2] })
  const I = new Uint32Array(indices)
  for (let t = 0; t < nt; t++) if (side[t]) for (let k = 0; k < 3; k++) { const v = I[3 * t + k]; if (copyOf[v] >= 0) I[3 * t + k] = copyOf[v] }
  const lifted = new Uint8Array(nv + extra.length)
  for (let t = 0; t < nt; t++) if (side[t]) for (let k = 0; k < 3; k++) lifted[I[3 * t + k]] = 1
  for (let v = 0; v < lifted.length; v++) if (lifted[v]) P[v * 3 + 1] += field.y([P[v * 3], P[v * 3 + 2]])
  return { positions: P, indices: I, side, split: extra.length }
}

/** The riser: every mesh edge between a LIFTED triangle and an UNLIFTED one, across all partition groups. Kerb where
 *  the lifted side is one of `kerbKeys`; anywhere else it is a step with no riser, counted by the pair of groups.
 *  `groups`: [{ key, positions, indices, side }] (after `liftBuffer`); `flushTol` = `kerbPlan().flushTol`, the height
 *  below which a lifted vertex is at grade. Returns { positions, indices, kerbM, bareM }. */
export function riserFromEdges(groups, kerbKeys, flushTol) {
  if (!(flushTol > 0)) throw new Error(`[kerbLift] riserFromEdges: no flush tolerance (got ${flushTol}) — pass kerbPlan().flushTol`)
  const pos = [], idx = [], bareM = {}, bareAt = {}
  let kerbM = 0
  // ⭐ the finder's own reader (`edgesAcross` + `curbStands`), on the triangles
  for (const rec of edgesAcross(triangleEdges(groups)).values()) {
    const { in: I, out: O } = rec
    if (!I || !O) continue
    const L = Math.hypot(I.b[0] - I.a[0], I.b[2] - I.a[2])
    if (!curbStands(rec, kerbKeys)) { if (I.a[1] > flushTol || I.b[1] > flushTol) { const k = `${I.key}|${O.key}`; bareM[k] = (bareM[k] || 0) + L
      const at = (bareAt[k] ||= []); if (at.length < 6) at.push([(I.a[0] + I.b[0]) / 2, (I.a[2] + I.b[2]) / 2]) } continue }
    // bottom = the unlifted side's own vertices at the same xz (their y), top = the lifted side's
    const bot = (p) => (Math.abs(O.a[0] - p[0]) + Math.abs(O.a[2] - p[2]) < 1e-9 ? O.a : O.b)
    const ta = I.a, tb = I.b, ba = bot(ta), bb = bot(tb)
    if (ta[1] - ba[1] <= flushTol && tb[1] - bb[1] <= flushTol) continue   // the cut's flush span: nothing stands
    const o = pos.length / 3
    pos.push(...ba, ...bb, ...tb, ...ta)
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
    kerbM += L
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), kerbM, bareM, bareAt }
}


// ── THE CREASES ARE LINES OF THE PARTITION ──────────────────────────────────────────────────────────────────────────
// ⭐ A cut's ramp and flares and a curbless taper are drawn exactly where the mesh has vertices on their outlines, so
//   every ground group is SPLIT along every kerb region's outline before it is triangulated: the same group, more
//   boundaries — never a cut into the mesh afterwards (`cutAlong`, 287 T-junctions on LS) and never a refinement to a
//   floor someone picked. The lift then reads the field at vertices that lie ON each crease, so the drawn kerb IS the
//   field (BRIEF-the-ground-knows-its-height §5; Boz's (B), 2026-10-12).
// ⛔⛔ THE PARTITION'S OWN STRUCTURE IS KEPT: each { outer, holes } goes into Clipper as itself (outer +, holes −) and
//   comes back from the POLYTREE, whose nesting is Clipper's — never a bag of rings re-holed by winding, which handed a
//   block's hole to the wrong outer and meshed 97,808 m² of asphalt over LS's blocks (5d465009, `sliceForKerb`).
const _C = clipperLib
const toPath = (ring, sign) => { const p = ring.map(([x, z]) => new _C.IntPoint(Math.round(x * CLIP_SCALE), Math.round(z * CLIP_SCALE)))
  return (_C.Clipper.Orientation(p) === (sign > 0)) ? p : p.reverse() }
const toRing = (path) => path.map(pt => [pt.X / CLIP_SCALE, pt.Y / CLIP_SCALE])
/** a Clipper PolyTree → [{ outer, holes }] in metres (islands inside holes become items of their own). The ONE home. */
export function polyTreeToItems(tree) {
  const items = []
  const walk = (node) => { for (const ch of node.Childs()) {
    const outer = toRing(ch.m_polygon)
    if (outer.length >= 3) items.push({ outer, holes: ch.Childs().map(h => toRing(h.m_polygon)).filter(r => r.length >= 3) })
    for (const h of ch.Childs()) walk(h) } }
  walk(tree)
  return items
}
const itemPaths = (it) => { const o = it.outer || it; return [toPath(o, +1), ...(it.holes || []).map(h => toPath(h, -1))] }
// ⚠️ CLIPPER'S OWN OUTPUT CAN CROSS ITSELF: an intersection rounded to the integer grid where a clip vertex lies on a
// subject edge leaves a bow-tie (measured on LS's curb: 55 of 3,342 split pieces, earcut then over-covering them by
// 50 m²), even under StrictlySimple. So each result is normalised by Clipper itself — `SimplifyPolygons` (a NonZero
// self-union: same area, no crossing) — and only then nested by a union into the polytree (`claims-every-group-meshes-
// its-own-area`).
const clipItems = (items, clipPaths, type) => {
  const c = new _C.Clipper(); c.StrictlySimple = true
  for (const it of items) c.AddPaths(itemPaths(it), _C.PolyType.ptSubject, true)
  c.AddPaths(clipPaths, _C.PolyType.ptClip, true)
  const raw = new _C.Paths(); c.Execute(type, raw, _C.PolyFillType.pftNonZero, _C.PolyFillType.pftNonZero)
  if (!raw.length) return []
  const u = new _C.Clipper(); u.StrictlySimple = true
  u.AddPaths(_C.Clipper.SimplifyPolygons(raw, _C.PolyFillType.pftNonZero), _C.PolyType.ptSubject, true)
  const t = new _C.PolyTree(); u.Execute(_C.ClipType.ctUnion, t, _C.PolyFillType.pftNonZero, _C.PolyFillType.pftNonZero)
  return polyTreeToItems(t)
}
const boxOf = (rings) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of rings) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
const meets = (A, B) => A[0] <= B[2] && B[0] <= A[2] && A[1] <= B[3] && B[1] <= A[3]

/** A region's polygon carried TOL past its base (the block edge), each base vertex moved along the region's OWN side line
 *  (the neighbour that leaves the base), so every crease keeps its line exactly and only the base moves out. Clipped to
 *  the block afterwards, the cell's base is then the block's own lattice edge, never the rounded copy of it. */
function pastBase(g) {
  const L = Math.hypot(g.inward[0], g.inward[1]), n = [g.inward[0] / L, g.inward[1] / L]
  const tc = (P) => (P[0] - g.A[0]) * n[0] + (P[1] - g.A[1]) * n[1]
  const P = g.poly, m = P.length
  return P.map((p, i) => { if (Math.abs(tc(p)) > 1e-9) return p
    const q = [P[(i + m - 1) % m], P[(i + 1) % m]].find(r => tc(r) > 1e-9)
    if (!q) return p
    const k = TOL / tc(q); return [p[0] + (p[0] - q[0]) * k, p[1] + (p[1] - q[1]) * k] })
}

/** The kerb regions' outlines as CELLS of the partition: each region clipped to the lifted block ON THE LATTICE, so a
 *  region's base that lies along the block edge IS the block edge (the base is computed from the edge, off the lattice,
 *  and would otherwise leave a sub-mm strip of road inside it, which the lift would raise). The block is read by the
 *  lift's own parity (`ringsInside`: even-odd). Computed once per bake: `kerbCells(plan.regions, blockRings)`. */
export function kerbCells(regions, blockRings) {
  const blk = blockRings.filter(r => r.length >= 3).map(r => toPath(r, +1))
  return regions.flatMap(g => { const c = new _C.Clipper()
    c.AddPath(toPath(pastBase(g), +1), _C.PolyType.ptSubject, true); c.AddPaths(blk, _C.PolyType.ptClip, true)
    const out = new _C.Paths(); c.Execute(_C.ClipType.ctIntersection, out, _C.PolyFillType.pftNonZero, _C.PolyFillType.pftEvenOdd)
    return out.filter(p => p.length >= 3) })
}

/** ONE CUT PER CREASE, CARRIED BY EVERY POLYGON ON IT. The crease split (`splitAtCreases`) clips each LIFTED polygon by
 *  the cells on its own, so where a crease crosses an edge two faces share, each face's Clipper pass rounded its own
 *  crossing, and the ROAD, never split, never had one: on LS 6,365 crease vertices sat on the road's edge with no vertex
 *  across, and 1,449 on a lifted neighbour's (Plumb, 2026-10-21). So before the split, every crossing of a cell edge with
 *  an edge of the partition — road included — or with another cell's edge is computed ONCE, rounded to the lattice ONCE,
 *  and written into BOTH edges; a vertex of one within the rounding (√2/2 step) of the other's edge, projecting strictly
 *  inside it, enters that edge. A partition edge is keyed by its ends, so the faces on its two sides take the same points.
 *  The split then meets every crossing as a vertex both rings already carry, and makes no point of its own there.
 *  `groups` [{ items: [{ outer, holes }] }] (metres, on the lattice), `cells` Clipper paths (`kerbCells`). Returns
 *  { groups, cells, inserted, rounds } in the same shapes, nothing moved, only vertices added. The round cap is a guard:
 *  hitting it THROWS, never a partial cut. ⛔ Not a noding of the partition
 *  with itself: only crease × partition and crease × crease. */
export function cutCreases(groups, cells, { maxRounds = 16, onRound = null } = {}) {
  const S = CLIP_SCALE, BOUND = Math.SQRT1_2 * CLIP_SCALE * LATTICE_M, B2 = BOUND * BOUND
  const P = (x, z) => [Math.round(x * S), Math.round(z * S)]
  // every ring as integer points; `cell` rings and partition rings, the partition's edges keyed so both faces share them
  const rings = []
  groups.forEach((g, gi) => g.items.forEach((it, ii) => [it.outer, ...(it.holes || [])].forEach((r, ri) => rings.push({ cell: false, gi, ii, ri, p: r.map(([x, z]) => P(x, z)) }))))
  cells.forEach((c, ci) => rings.push({ cell: true, ci, p: c.map(q => [q.X, q.Y]) }))
  const ek = (a, b) => { const x = a[0] + ',' + a[1], y = b[0] + ',' + b[1]; return x < y ? x + '|' + y : y + '|' + x }
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  let inserted = 0, rounds = 0
  for (let round = 0; ; round++) {
    rounds = round + 1
    if (round === maxRounds) throw new Error(`[kerbLift] ⛔ cutCreases: the creases and the partition did not agree in ${maxRounds} rounds — an insertion keeps making another`)
    const E = []                                   // [ringIndex, i] per edge
    rings.forEach((r, ri) => r.p.forEach((_, i) => E.push([ri, i])))
    const CELL = 4 * S, grid = new Map()
    E.forEach((e, n) => { const r = rings[e[0]].p, a = r[e[1]], b = r[(e[1] + 1) % r.length]
      for (let x = Math.floor((Math.min(a[0], b[0]) - BOUND) / CELL); x <= Math.floor((Math.max(a[0], b[0]) + BOUND) / CELL); x++)
        for (let z = Math.floor((Math.min(a[1], b[1]) - BOUND) / CELL); z <= Math.floor((Math.max(a[1], b[1]) + BOUND) / CELL); z++) { const k = x + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(n) } })
    // insertions per EDGE KEY for the partition (both faces), per (ring, edge) for cells: point + t along the edge
    const addP = new Map(), addC = new Map(), has = rings.map(r => new Set(r.p.map(q => q[0] + ',' + q[1])))
    const put = (n, pt) => { const [ri, i] = E[n], r = rings[ri], a = r.p[i], b = r.p[(i + 1) % r.p.length], k = pt[0] + ',' + pt[1]
      if (has[ri].has(k)) return
      const d = [b[0] - a[0], b[1] - a[1]], t = ((pt[0] - a[0]) * d[0] + (pt[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])
      if (!(t > 0 && t < 1)) return
      const m = r.cell ? addC : addP, key = r.cell ? ri + ':' + i : ek(a, b), l = m.get(key) || m.set(key, new Map()).get(key)
      l.set(k, pt) }
    const seen = new Set()
    for (const list of grid.values()) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const n1 = list[x], n2 = list[y], r1 = rings[E[n1][0]], r2 = rings[E[n2][0]]
      if (!r1.cell && !r2.cell) continue                                    // partition × partition is not the crease's
      if (E[n1][0] === E[n2][0]) continue                                   // a ring's own edges
      const pk = n1 < n2 ? n1 + ',' + n2 : n2 + ',' + n1; if (seen.has(pk)) continue; seen.add(pk)
      const a = r1.p[E[n1][1]], b = r1.p[(E[n1][1] + 1) % r1.p.length], c = r2.p[E[n2][1]], d = r2.p[(E[n2][1] + 1) % r2.p.length]
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {     // a proper crossing
        const t = d3 / (d3 - d4), pt = [Math.round(c[0] + (d[0] - c[0]) * t), Math.round(c[1] + (d[1] - c[1]) * t)]
        put(n1, pt); put(n2, pt); continue }
      // a vertex of one within the rounding of the other's edge, strictly inside it
      for (const [q, n] of [[a, n2], [b, n2], [c, n1], [d, n1]]) { const [ri, i] = E[n], r = rings[ri].p, e0 = r[i], e1 = r[(i + 1) % r.length]
        const dx = e1[0] - e0[0], dz = e1[1] - e0[1], L2 = dx * dx + dz * dz; if (!L2) continue
        const dot = (q[0] - e0[0]) * dx + (q[1] - e0[1]) * dz, cr = (q[0] - e0[0]) * dz - (q[1] - e0[1]) * dx
        if (dot > 0 && dot < L2 && cr * cr <= B2 * L2) put(n, q) }
    }
    if (onRound) onRound(round, addP, addC, rings)
    if (!addP.size && !addC.size) break
    // rebuild every ring with its edges' new points in order along each edge
    for (const [ri, r] of rings.entries()) { const out = []
      for (let i = 0; i < r.p.length; i++) { const a = r.p[i], b = r.p[(i + 1) % r.p.length]; out.push(a)
        const l = (r.cell ? addC.get(ri + ':' + i) : addP.get(ek(a, b))); if (!l) continue
        const d = [b[0] - a[0], b[1] - a[1]], pts = [...l.values()].map(q => [((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]), q]).sort((u, v) => u[0] - v[0])
        for (const [, q] of pts) { out.push(q); inserted++ } }
      r.p = out }
  }
  const back = (p) => p.map(([X, Y]) => [X / S, Y / S])
  const outGroups = groups.map(g => ({ ...g, items: g.items.map(it => ({ ...it, outer: null, holes: [] })) }))
  for (const r of rings) { if (r.cell) continue; const it = outGroups[r.gi].items[r.ii]; if (r.ri === 0) it.outer = back(r.p); else it.holes[r.ri - 1] = back(r.p) }
  return { groups: outGroups, cells: rings.filter(r => r.cell).map(r => r.p.map(([X, Y]) => new _C.IntPoint(X, Y))), inserted, rounds }
}

/** Each polygon's SIDE of the kerb, stamped onto it: 1 when the lift raises it, else 0 — read at a point just inside it
 *  by the plan's `inBlock`. ⚠️ A REMAINING RECOVERY, at the polygon: the painter's items carry no owner (`pr.asphalt` is
 *  the union of every tile's road, and the paint stack's flatten re-clips it), so the side is read here once per polygon
 *  and then CARRIED to every triangle (`groundConformity.js#emit`) — never re-read per triangle. Board: the painter would
 *  stamp its block on each band it emits (`tileGround.js#sectionOpen`) and the flatten keep it. */
export function withSide(items, inBlock) {
  return items.map(it => { const o = Array.isArray(it) ? { outer: it, holes: [] } : it, at = pointInside(o)
    if (!at) throw new Error(`[kerbLift] withSide: a ground polygon of ${o.outer?.length} vertices has no interior point to read its side at`)
    return { ...o, side: inBlock(at) ? 1 : 0 } })
}

// a point just inside an { outer, holes } polygon: 1 mm off the middle of its first edge long enough to carry it
function pointInside(it) {
  const pip = (P, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[j], b = r[i]
    if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
  const r = it.outer, inside = (P) => pip(P, r) && !(it.holes || []).some(h => pip(P, h))
  // off an edge's middle, at 1 mm and then finer (a split piece can be thinner than a millimetre), then any ear's centroid
  for (const off of [1e-3, 1e-4, 1e-5]) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(L > 2 * off)) continue
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = [-(b[1] - a[1]) / L * off, (b[0] - a[0]) / L * off]
    for (const P of [[m[0] + n[0], m[1] + n[1]], [m[0] - n[0], m[1] - n[1]]]) if (inside(P)) return P }
  for (let i = 0; i < r.length; i++) { const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length], P = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; if (inside(P)) return P }
  return null
}

/** Split a ground group's items along every kerb cell's outline (`kerbCells`). Returns new { outer, holes } items covering
 *  exactly the same ground. ⭐ ONLY A POLYGON THE LIFT RAISES IS SPLIT — read at a point just inside it by the lift's own
 *  predicate (`inBlock`, the plan's): a road polygon is returned as it is, so a cell's rounded vertex a millimetre past
 *  the block edge never re-grids the road. Per block-side polygon: one Clipper pass against the cells' union (the outer
 *  outlines), then each piece inside it split by each cell it meets (the outlines between and across regions). */
export function splitAtCreases(items, cells, inBlock) {
  if (!cells.length || !items?.length) return items
  const norm = items.map(it => (Array.isArray(it) ? { outer: it, holes: [] } : it)).filter(it => it.outer?.length >= 3)
  const regionPaths = cells, regionBox = cells.map(p => boxOf([toRing(p)]))
  const regions = cells
  const u = new _C.Clipper(); u.AddPaths(regionPaths, _C.PolyType.ptSubject, true)
  const zone = new _C.Paths(); u.Execute(_C.ClipType.ctUnion, zone, _C.PolyFillType.pftNonZero, _C.PolyFillType.pftNonZero)
  // ⭐ A polygon no cell overlaps, or one the lift leaves on the road, is returned AS IT IS — never re-emitted through
  // Clipper, so nothing the kerb does not carry is re-gridded or re-triangulated by it
  const zoneBox = boxOf(zone.map(toRing)), out = [], inside = []
  for (const it of norm) {
    if (!meets(boxOf([it.outer]), zoneBox)) { out.push(it); continue }
    const at = pointInside(it)
    if (!at || !inBlock(at)) { out.push(it); continue }
    const inn = clipItems([it], zone, _C.ClipType.ctIntersection)
    if (!inn.length) { out.push(it); continue }
    out.push(...clipItems([it], zone, _C.ClipType.ctDifference)); inside.push(...inn)
  }
  for (const piece of inside) {
    let pcs = [piece]
    const pb = boxOf([piece.outer])
    regions.forEach((g, gi) => { if (!meets(pb, regionBox[gi])) return
      pcs = pcs.flatMap(p => { if (!meets(boxOf([p.outer]), regionBox[gi])) return [p]
        const a = clipItems([p], [regionPaths[gi]], _C.ClipType.ctIntersection)
        if (!a.length) return [p]
        return [...a, ...clipItems([p], [regionPaths[gi]], _C.ClipType.ctDifference)] }) })
    out.push(...pcs)
  }
  return out
}
