// tileGround — the pure-ribbon TILE construction (T1 of the reconceived
// pipeline; spike-validated, HANDOFF-spike-pure-ribbon.md → HANDOFF-tile-T1-
// live-path.md). ONE module shared by the LIVE Designer (BlockGeometryV2Debug)
// and the bake (bake-ground) so live == bake by construction (WYSIWYG).
//
// ⚠️ TRANSITIONAL: wired for TOY only right now; LS stays on figure-ground
// until T2 (per-edge widths / median / boundary tagging). The toy=tiles /
// LS=figure-ground split is temporary transition scaffolding, retired at T4
// cleanup when LS adopts tiles and figure-ground is deleted. NOT a kept
// scene-flag.
//
// The construction:
//   1. TILES = bounded faces of the street centerline graph. Centerlines are
//      the grout (shared tile edges). Faces partition the plane by
//      construction — no gaps, no overlaps, no figure-ground complement.
//      Extracted by a half-edge (DCEL) planar face walk.
//   2. Each tile (a closed ring with SHARP corners at the centerline nodes)
//      is offset INWARD by cumulative band depths with a ROUND join:
//        asphalt (at grout) | curb | treelawn | sidewalk | land-use (center)
//      The inward offset's round join rounds the tile's CONVEX corners — so
//      the curb corner rounds for free (radius = inset depth). The tile stays
//      sharp; rounding lives on the strips. (This is the keystone's
//      "round the block, offset the polygon" applied to a robust graph face.)
//   3. asphalt = union of every tile's outer (grout-hugging) strip. The road
//      between two tiles = each tile's half, meeting at the shared grout;
//      asymmetric widths fall out (each tile offsets its own side's hw). The
//      intersection fills where the tiles meeting at a node each contribute
//      their asphalt — the IX is never constructed.
//   4. The perimeter beyond the outermost streets is the unbounded outer face
//      (not a tile); it fills as LU = stencil − union(tiles).
//
// Returns raw Clipper ring lists per material; bake-ground packs them.

import clipperLib from 'clipper-lib'
import { CURB_WIDTH } from '../cartograph/streetProfiles.js'
import { smoothChain } from './smoothCenterline.js'
import { pickLuFromHash, hashKey, blockKeyFromRing, resolveChainSegmentation } from './buildBlockGeometryV2.js'

const SCALE = 1000
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]

// Offset CLOSED rings by `delta`. Negative = erode/inset. `join` selects the
// corner treatment:
//   • 'round' (default) — for morphological openRound + smooth clip zones.
//   • 'miter' — for the concentric ped bands. RIBBONS §3.9a step 7 (the V1
//     keystone) is explicit: the band offsets MUST be jtMiter, NOT jtRound.
//     The asphalt-inner ring (iA) is ALREADY rounded once (filletRing emits a
//     dense arc per corner); jtMiter inherits those arcs as concentric nested
//     arcs (r→r+d via dense-sample miters) AND passes operator-authored R=0
//     square corners through SHARP. jtRound would re-round every corner by
//     radius=d — a SECOND rounding stacked on the curb fillet, corrupting
//     squares. "The corner is the band bent, never a separately-built shape."
function offsetRings(rings, delta, join = 'round') {
  if (!rings.length) return []
  if (delta === 0) return rings.map(r => r.slice())
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)     // miterLimit 2 → 90° squares stay sharp; very-acute corners bevel
  const jt = join === 'miter' ? JoinType.jtMiter : JoinType.jtRound
  for (const r of rings) if (r && r.length >= 3) co.AddPath(r.map(toClipper), jt, EndType.etClosedPolygon)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromClipper))
}
// Morphological opening (erode R then dilate R, round join): rounds CONVEX
// corners sharper than R up to radius R, leaves gentler ones. Used to round the
// asphalt-inner region's sharp miter corners at the authored curb radius — the
// one place a corner is rounded, so the bands wrap it concentrically.
function openRound(rings, R) {
  if (!rings.length || !(R > 1e-6)) return rings
  const eroded = offsetRings(rings, -R)
  if (!eroded.length) return rings                  // too thin to open → keep as-is
  return offsetRings(eroded, R)
}
// ── Per-corner fillet ────────────────────────────────────────────────────
// The per-VERTEX analogue of openRound (which rounds every convex corner by one
// uniform radius). Replaces each SIGNIFICANT convex corner of a ring with a
// circular arc tangent to both legs, radius resolved PER-CORNER by
// `Rfn(point, interiorTheta) → metres` — so operator-authored per-corner /
// per-IX radii reshape individual corners. Self-contained (no figure-ground
// dependency); winding-aware so it rounds outer rings and holes correctly.
//   • near-straight vertices (turn < TURN_TOL) are curve samples, not corners
//     → passed through (keeps the rounding off the gentle smoothed runs).
//   • inset is clamped to 45% of the arc-length to each NEIGHBOUR corner so
//     adjacent fillets never overlap on a short leg.
const FILLET_TURN_TOL = 18 * Math.PI / 180
// `sink` (optional) collects the ACHIEVED fillet per corner — { apex, C, r, tA,
// tB } — so the authoring handle can draw the exact curb arc the construction
// produced (one corner truth; no independent re-derivation → no drift).
function filletRing(ring, Rfn, sink) {
  const n = ring.length
  if (n < 3) return ring.slice()
  const sign = signedArea(ring) >= 0 ? 1 : -1
  // Pass 1 — find corner vertices (convex relative to interior, turning > tol).
  const corners = []                                // { i, R, theta, inx,iny, outx,outy }
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let inx = V[0] - A[0], iny = V[1] - A[1], outx = B[0] - V[0], outy = B[1] - V[1]
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy)
    if (li < 1e-6 || lo < 1e-6) continue
    inx /= li; iny /= li; outx /= lo; outy /= lo
    if ((inx * outy - iny * outx) * sign <= 0) continue          // concave
    const turn = Math.acos(Math.max(-1, Math.min(1, inx * outx + iny * outy)))
    if (turn < FILLET_TURN_TOL) continue                          // curve sample
    const theta = Math.PI - turn
    const R = Rfn(V, theta)
    if (!(R > 0.01)) continue
    corners.push({ i, R, theta, inx, iny, outx, outy })
  }
  if (!corners.length) return ring.slice()
  // Arc-length to the previous / next corner (cyclic), to clamp the inset.
  const segLen = (a, b) => Math.hypot(ring[a][0] - ring[b][0], ring[a][1] - ring[b][1])
  const gapAfter = (ci) => {                                       // dist corner ci → ci+1
    const a = corners[ci].i, b = corners[(ci + 1) % corners.length].i
    let d = 0, k = a
    while (k !== b) { const nk = (k + 1) % n; d += segLen(k, nk); k = nk }
    return d
  }
  const drop = new Array(n).fill(false)               // intermediate verts inside a fillet
  const arcAt = new Map()                             // corner ring-index → arc points
  for (let ci = 0; ci < corners.length; ci++) {
    const c = corners[ci]
    const V = ring[c.i]
    const tanH = Math.tan(c.theta / 2)
    if (!(tanH > 1e-6)) continue
    const gPrev = corners.length > 1 ? gapAfter((ci - 1 + corners.length) % corners.length) : Infinity
    const gNext = corners.length > 1 ? gapAfter(ci) : Infinity
    const inset = Math.min(c.R / tanH, 0.45 * gPrev, 0.45 * gNext)
    if (!(inset > 1e-4)) continue
    const effR = inset * tanH
    const tA = [V[0] - c.inx * inset, V[1] - c.iny * inset]
    const tB = [V[0] + c.outx * inset, V[1] + c.outy * inset]
    const px = -c.iny * sign, py = c.inx * sign       // interior-perp of inDir
    const cx = tA[0] + px * effR, cy = tA[1] + py * effR
    let aA = Math.atan2(tA[1] - cy, tA[0] - cx)
    const aB = Math.atan2(tB[1] - cy, tB[0] - cx)
    let delta = aB - aA
    if (sign > 0) { while (delta <= 1e-9) delta += 2 * Math.PI } else { while (delta >= -1e-9) delta -= 2 * Math.PI }
    const segs = Math.max(2, Math.round(Math.abs(delta) / (Math.PI / 24)))   // fine arc
    const pts = []
    for (let k = 0; k <= segs; k++) { const a = aA + delta * (k / segs); pts.push([cx + effR * Math.cos(a), cy + effR * Math.sin(a)]) }
    arcAt.set(c.i, pts)
    if (sink) sink.push({ apex: [V[0], V[1]], C: [cx, cy], r: effR, tA: [tA[0], tA[1]], tB: [tB[0], tB[1]] })
    // mark intermediate vertices within the inset (back + forward) as dropped
    let w = 0, k = c.i
    while (true) { const p = (k - 1 + n) % n; const d = segLen(k, p); if (w + d > inset) break; w += d; drop[p] = true; k = p; if (k === c.i) break }
    w = 0; k = c.i
    while (true) { const q = (k + 1) % n; const d = segLen(k, q); if (w + d > inset) break; w += d; drop[q] = true; k = q; if (k === c.i) break }
  }
  // Pass 2 — rotate to a kept, non-corner start, then emit literals + arcs.
  let i0 = 0
  while (i0 < n && (drop[i0] || arcAt.has(i0))) i0++
  if (i0 >= n) i0 = 0
  const out = []
  for (let k = 0; k < n; k++) {
    const i = (i0 + k) % n
    if (arcAt.has(i)) { for (const p of arcAt.get(i)) out.push(p) }
    else if (!drop[i]) out.push(ring[i].slice())
  }
  return out
}
// Map filletRing over a ring SET (outer rings + holes), preserving the rest.
function filletRings(rings, Rfn, sink) {
  return rings.map(r => (r && r.length >= 3) ? filletRing(r, Rfn, sink) : r)
}
// Indices of a ring's SHARP convex corners — the centerline NODES (real
// intersections / authored bends), excluding the dense intermediate vertices
// smoothing inserts along curved runs (whose per-vertex turn is below the
// fillet tolerance). Mirrors filletRing's pass-1 corner test exactly. Used to
// map an achieved-fillet apex back to the node the fillet rounded: the apex
// sits inboard along the bisector, so a nearest-of-ALL-vertices search snaps it
// to whatever smoothed sample happens to lie nearest (frequently a sample on
// the leg, within ~2× the inset, not the node) — which mis-keys the corner and
// detaches the authoring handle. Restricting to sharp corners pins it to the
// node every time.
function sharpCornerIndices(ring) {
  const n = ring.length
  if (n < 3) return []
  const sign = signedArea(ring) >= 0 ? 1 : -1
  const out = []
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let inx = V[0] - A[0], iny = V[1] - A[1], outx = B[0] - V[0], outy = B[1] - V[1]
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy)
    if (li < 1e-6 || lo < 1e-6) continue
    inx /= li; iny /= li; outx /= lo; outy /= lo
    if ((inx * outy - iny * outx) * sign <= 0) continue          // concave
    const turn = Math.acos(Math.max(-1, Math.min(1, inx * outx + iny * outy)))
    if (turn < FILLET_TURN_TOL) continue                          // curve sample, not a node
    out.push(i)
  }
  return out
}
// Offset an OPEN polyline by `delta` with round JOIN (handles the run's own
// bends, no compounding) and BUTT caps (so a run ends square at the tile
// vertex — no round-cap-at-depth bulge, which distorted the corners). Robust
// on noisy 100-vertex LS runs where per-edge half-plane intersection collapses.
function strokeOpen(polyline, delta) {
  if (!(delta > 1e-9) || !polyline || polyline.length < 2) return []
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(polyline.map(toClipper), JoinType.jtRound, EndType.etOpenButt)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromClipper))
}
function unionRings(rings) {
  if (!rings.length) return []
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let n = 0
  for (const r of rings) if (r && r.length >= 3) { c.AddPath(r.map(toClipper), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}
function differenceRings(subjectRings, clipRings) {
  if (!subjectRings.length) return []
  if (!clipRings.length) return subjectRings.map(r => r.slice())
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let s = 0, cl = 0
  for (const r of subjectRings) if (r && r.length >= 3) { c.AddPath(r.map(toClipper), PolyType.ptSubject, true); s++ }
  for (const r of clipRings)    if (r && r.length >= 3) { c.AddPath(r.map(toClipper), PolyType.ptClip,    true); cl++ }
  if (!s) return []
  if (!cl) return subjectRings.map(r => r.slice())
  const out = []
  c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}
function intersectRings(subjectRings, clipRings) {
  if (!subjectRings.length || !clipRings.length) return []
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  for (const r of subjectRings) if (r && r.length >= 3) c.AddPath(r.map(toClipper), PolyType.ptSubject, true)
  for (const r of clipRings)    if (r && r.length >= 3) c.AddPath(r.map(toClipper), PolyType.ptClip,    true)
  const out = []
  c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}

function signedArea(r) {
  let a = 0
  for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 }
  return a / 2
}
// R-clamp (ported from figure-ground defaultR): a corner only has room for so
// much rounding. Clamp R by the corner angle θ and the available depth d_min so
// acute corners get a smaller R — past this the inward offsets self-intersect
// and openRound over-erodes the sharp tip (the acute-corner breakage).
function circlePoly(cx, cy, r, seg = 32) {
  const out = []
  for (let i = 0; i < seg; i++) { const a = (i / seg) * 2 * Math.PI; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return out
}
// Pure ring/key helpers shared by the shape pass AND the chain-free sectionPass
// (module scope so sectionPass can use them without closing over the chain).
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const pushLu = (map, lu, rings) => { if (rings.length) (map[lu] || (map[lu] = [])).push(...rings) }
const nearestVertexIndex = (pt, ring) => {
  let bi = 0, bd = Infinity
  for (let i = 0; i < ring.length; i++) { const dx = ring[i][0] - pt[0], dy = ring[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
  return bi
}
const nearestCornerVertexIndex = (pt, ring, idxs) => {
  let bi = idxs[0], bd = Infinity
  for (const i of idxs) { const dx = ring[i][0] - pt[0], dy = ring[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
  return bi
}
const nearestVertR = (pt, ring, vertR) => vertR[nearestVertexIndex(pt, ring)]
function pointInRing(px, py, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
// A robust interior point of a ring (midpoint nudged off the centroid toward
// the first edge — handles non-convex tiles where the centroid falls outside).
function ringInteriorPoint(r) {
  let cx = 0, cy = 0
  for (const p of r) { cx += p[0]; cy += p[1] }
  cx /= r.length; cy /= r.length
  if (pointInRing(cx, cy, r)) return [cx, cy]
  // fallback: a point just inside the first edge's midpoint
  const a = r[0], b = r[1 % r.length]
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  for (let i = 0; i < r.length; i++) {
    const t = i / r.length
    const px = mx + (cx - mx) * t, py = my + (cy - my) * t
    if (pointInRing(px, py, r)) return [px, py]
  }
  return [cx, cy]
}

// ── Planar face extraction (half-edge / DCEL face walk) ──────────────────
// Build the centerline graph (nodes = unique vertices, edges = polyline
// segments), then walk minimal cycles. next(he) at a node = the outgoing
// edge just CLOCKWISE of the incoming edge's reverse → traces the face on
// the left, yielding CCW bounded faces + one CW outer face.
export function extractFaces(streets, stubsOut, shouldPruneTip) {
  const Q = 1e4                                   // 0.1 mm quantization for node identity
  const key = (p) => Math.round(p[0] * Q) + ',' + Math.round(p[1] * Q)
  const nodes = new Map()
  const nodeOf = (p) => {
    const k = key(p)
    let n = nodes.get(k)
    if (!n) { n = { id: nodes.size, p: [p[0], p[1]], edges: [] }; nodes.set(k, n) }
    return n
  }
  const heList = []
  const edgeSet = new Set()
  // Each half-edge carries (streetIdx, forward) so a face edge can resolve
  // back to its street-side: the CCW face interior is on the LEFT of each
  // directed half-edge, so a FORWARD half-edge (matching the street's point
  // order) has the tile on the street's LEFT; a reversed one, the RIGHT.
  const addEdge = (a, b, streetIdx) => {
    const na = nodeOf(a), nb = nodeOf(b)
    if (na.id === nb.id) return
    const ek = na.id < nb.id ? na.id + '_' + nb.id : nb.id + '_' + na.id
    if (edgeSet.has(ek)) return
    edgeSet.add(ek)
    const h1 = { from: na, to: nb, used: false, streetIdx, forward: true }
    const h2 = { from: nb, to: na, used: false, streetIdx, forward: false }
    h1.twin = h2; h2.twin = h1
    h1.angle = Math.atan2(nb.p[1] - na.p[1], nb.p[0] - na.p[0])
    h2.angle = Math.atan2(na.p[1] - nb.p[1], na.p[0] - nb.p[0])
    heList.push(h1, h2)
    na.edges.push(h1); nb.edges.push(h2)
  }
  streets.forEach((s, si) => {
    const pts = s?.points
    if (!pts || pts.length < 2) return
    for (let i = 0; i < pts.length - 1; i++) addEdge(pts[i], pts[i + 1], si)
  })
  // ── Prune pendant (dead-end stub) edges before the face walk ──────────────────
  // A dead-end tip is a degree-1 node. Remove it + its single edge and repeat,
  // walking the chain back to the first junction (degree ≥ 3). WITHOUT this the
  // face walk detours out-and-back along the spur, and the inward band-join opens
  // that ~180° reversal into a slack TRIANGLE across the block — the old "collapses
  // on its own" assumption was empirically false (Jacob's image). Pruned chains are
  // returned as stub polylines (+ streetIdx) and stroked separately as flat asphalt
  // in buildTileGround — the grade-sep sibling, since asphalt is sourced from the
  // tiles (pruning alone would delete the dead-end's road). Cycle (block-bounding)
  // edges are never pruned: a cycle node keeps ≥ 2 cycle edges, so removing its stub
  // edges never drops it to degree 1.
  // SCOPE (b): only NON-round tips are pruned. `shouldPruneTip(point)` gates which
  // degree-1 tips seed the peel — round-cap cul-de-sacs are left WOVEN (their face
  // bands + wrap disks already render the bulb's ped wrap cleanly; pruning them would
  // strip that wrap → a bare asphalt bulb). The cascade, once started on a non-round
  // chain, walks the whole pendant to its junction; a round tip's own edges keep the
  // shared node alive so the cascade can't eat into a cul-de-sac.
  if (stubsOut) {
    const liveDeg = (n) => { let d = 0; for (const h of n.edges) if (!h.pruned) d++; return d }
    const prunable = (n) => liveDeg(n) === 1 && (!shouldPruneTip || shouldPruneTip(n.p))
    const q = []
    for (const n of nodes.values()) if (prunable(n)) q.push(n)
    while (q.length) {
      const tip = q.pop()
      if (!prunable(tip)) continue
      const poly = [tip.p]
      let cur = tip, streetIdx = -1
      while (liveDeg(cur) === 1) {
        const h = cur.edges.find(e => !e.pruned)
        if (!h) break
        if (streetIdx < 0) streetIdx = h.streetIdx
        h.pruned = true; h.twin.pruned = true
        cur = h.to; poly.push(cur.p)
      }
      if (poly.length >= 2) stubsOut.push({ points: poly, streetIdx })
    }
    for (const n of nodes.values()) n.edges = n.edges.filter(h => !h.pruned)
  }
  for (const n of nodes.values()) n.edges.sort((a, b) => a.angle - b.angle)
  const nextHE = (he) => {
    const out = he.to.edges
    const idx = out.indexOf(he.twin)
    return out[(idx - 1 + out.length) % out.length]
  }
  const faces = []
  for (const h0 of heList) {
    if (h0.used || h0.pruned) continue
    const ring = []
    const edges = []   // edges[i] = the directed half-edge ring[i] → ring[i+1]
    let h = h0, guard = 0
    do {
      h.used = true
      ring.push(h.from.p)
      // The CCW face interior is on the geometric LEFT of a forward half-edge,
      // but that geometric side is the measure's RIGHT (production computePerps
      // calls (-dz,dx) the "right-perp"). So a FORWARD half-edge's tile sits on
      // the street's measure-RIGHT side; reversed → measure-LEFT. Label in the
      // measure convention so edgeDepth / effectiveMeasure / median detection
      // read the correct side's widths.
      edges.push({ streetIdx: h.streetIdx, forward: h.forward, side: h.forward ? 'right' : 'left' })
      h = nextHE(h)
      if (++guard > 500000) break
    } while (h !== h0)
    faces.push({ ring, edges })
  }
  // Bounded faces = positive signed area (CCW). The single outer face is the
  // most-negative; drop everything with non-positive area. Pendant (dead-end) edges
  // were PRUNED above (degree-1 leaf removal, scope (b): non-round tips only) — they
  // do NOT collapse on their own (the inward band-join opens the spur into a
  // triangle); they're stroked as flat asphalt stubs instead. Round cul-de-sac
  // pendants stay woven here (left out of the prune) and round via the face bands.
  return faces.filter(f => signedArea(f.ring) > 1e-3)
}

// Inboard-side ped zeroing for divided carriageways (anchor='inner-edge'):
// the median-facing side keeps pavement but drops curb/treelawn/sidewalk, so
// the thin tile between the two carriageways floods to a bare median. Mirrors
// streetProfiles.innerEdgeMeasure — the median geometry falls out of honest
// per-side widths + this transform, with no median-construction code.
function effectiveMeasure(s) {
  const m = s?.measure
  if (!m || s.anchor !== 'inner-edge' || !s.innerSign) return m
  const inboard = s.innerSign === +1 ? 'right' : 'left'
  return { ...m, [inboard]: { ...(m[inboard] || {}), treelawn: 0, sidewalk: 0 } }
}
// Is this street-side the median-facing (inboard) side of a divided carriageway?
function isMedianFacing(s, side) {
  if (!s || s.anchor !== 'inner-edge' || !s.innerSign) return false
  return side === (s.innerSign === +1 ? 'right' : 'left')
}

// Cumulative INWARD depth of a tile edge at each band level, from its own
// street-side measure. level: 'A' asphalt | 'C' +curb | 'T' +treelawn |
// 'W' +sidewalk. Returns 0 for edges with no resolvable street (e.g. a future
// map-boundary edge → no road, LU floods to it).
function edgeDepth(measure, side, curbWidth, level) {
  const m = measure?.[side]
  const a = Math.max(0, Number.isFinite(m?.pavementHW) ? m.pavementHW : 0)
  if (level === 'A' || a <= 0) return a
  const c = a + curbWidth
  if (level === 'C') return c
  const t = c + Math.max(0, Number.isFinite(m?.treelawn) ? m.treelawn : 0)
  if (level === 'T') return t
  return t + Math.max(0, Number.isFinite(m?.sidewalk) ? m.sidewalk : 0)
}

// Group a tile's cyclic edges into maximal RUNS of the same (streetIdx, side).
// A run = a sub-polyline of the tile boundary that all carries the same
// street-side widths. Offsetting the run polyline (not each edge) is what
// keeps the variable-width inset robust: round join handles the run's internal
// bends with no compounding. Handles the cyclic seam (rotate to a boundary);
// a tile bounded entirely by one street-side (a loop interior) → one closed
// run (polyline closed back to its start).
// Remove `t0` arc-length from the start of a polyline and `t1` from the end.
// Used to pull each street-side run back from its corners so the treelawn slab
// ends at the tangent — the corner span then carries no treelawn and fills as
// one solid sidewalk pad. Returns null if nothing survives (short leg → all SW).
function trimPolyline(poly, t0, t1) {
  const dropStart = (pts, t) => {
    if (t <= 1e-6) return pts.slice()
    let acc = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      if (acc + seg <= t) { acc += seg; continue }
      const r = (t - acc) / seg
      const sx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r
      const sy = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r
      return [[sx, sy], ...pts.slice(i + 1)]
    }
    return null
  }
  let p = dropStart(poly, t0)
  if (!p || p.length < 2) return null
  p = dropStart(p.slice().reverse(), t1)
  if (!p || p.length < 2) return null
  return p.reverse()
}

// Split a street polyline at interior JUNCTION nodes (graph degree ≥ 3) into
// sub-segments between junctions — the perimeter analogue of a tile's runs, so
// the treelawn slab can be trimmed back from each corner.
function splitAtJunctions(pts, nodeDeg, key) {
  const segs = []
  let cur = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i])
    if (i < pts.length - 1 && nodeDeg.get(key(pts[i])) >= 3) { segs.push(cur); cur = [pts[i]] }
  }
  segs.push(cur)
  return segs
}

function groupRuns(tile) {
  const { ring, edges } = tile
  const n = edges.length
  const same = (a, b) => a.streetIdx === b.streetIdx && a.side === b.side
  // find a seam: an edge whose predecessor differs
  let seam = 0, found = false
  for (let i = 0; i < n; i++) {
    if (!same(edges[i], edges[(i - 1 + n) % n])) { seam = i; found = true; break }
  }
  if (!found) {
    // whole ring is one street-side → one closed run
    return [{ streetIdx: edges[0].streetIdx, side: edges[0].side, poly: [...ring, ring[0]] }]
  }
  const runs = []
  let start = seam
  for (let c = 0; c < n; ) {
    const i0 = (start) % n
    let len = 1
    while (len < n && same(edges[(start + len) % n], edges[i0])) len++
    // run covers edges i0 .. i0+len-1 → vertices ring[i0] .. ring[i0+len]
    const poly = []
    for (let k = 0; k <= len; k++) poly.push(ring[(i0 + k) % n])
    runs.push({ streetIdx: edges[i0].streetIdx, side: edges[i0].side, poly })
    start = (start + len) % n
    c += len
  }
  return runs
}

// ── THE WALL · sectionPass ─────────────────────────────────────────────────
// The FILL side of the wall: the interior authored ped strips (treelawn/sidewalk
// leg strips, the ADA all-SW corner pad, the LU flood) stroked off the FROZEN
// per-tile shape. Its parameters carry ONLY the artifact (shapeTiles) + design
// params (cw, stripMat) — there is NO lexical handle on the chain graph
// (streets / streetsOrig / measures / centerlineData / ribbons), so it CANNOT
// reach back. That impossibility is the wall: Section's shape input changes only
// when the shape pass re-runs. Every helper below is module-level + pure.
export function sectionPass(shapeTiles, cw, stripMat) {
  const Wacc = [], tlByLu = {}, luByLu = {}
  for (const st of shapeTiles) {
    const { ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, runs } = st
    // Tolerate the serialized artifact: roundTipKeys is a Set in-memory, an array
    // when loaded from shape.json (Phase D). Either way → a Set for `.has`.
    const roundTipKeys = st.roundTipKeys instanceof Set ? st.roundTipKeys : new Set(st.roundTipKeys)
    // Band join frozen by the shape pass: 'round' at dead-end / loop / thin tiles
    // so the ped strips cap cleanly instead of needling at the cap's ~180°
    // reversal; 'miter' on normal cornered tiles keeps authored R=0 squares sharp.
    const bandJoin = st.bandJoin || 'miter'
    // Capacity guard (RIBBONS §3.9a item 5): the shape pass froze cap = 90% of this
    // tile's inscribed reach. Clamp each offset depth to it so a thin tile (loop
    // interior, narrow median, sliver) can't drive the inward offsets past the
    // medial axis into thorns — it degrades to a clean truncated ribbon. On the
    // offset W, never the fillet radius.
    const cap = Number.isFinite(st.cap) ? st.cap : (cw + tl + sw)
    const iC = offsetRings(iA, -Math.min(cw, cap), bandJoin)             // curb/treelawn boundary  (R+cw)
    const iT = offsetRings(iA, -Math.min(cw + tl, cap), bandJoin)        // treelawn/sidewalk       (R+cw+tl)
    const iW = offsetRings(iA, -Math.min(cw + tl + sw, cap), bandJoin)   // sidewalk/LU             (R+cw+tl+sw)
    // G5 — ADA corner ramp (structural, RIBBONS §6.9): the corner IS the curb
    // ramp → the corner ped is a uniform concentric all-SW annulus from tangent
    // to tangent; treelawn lives only on the straight legs and ends at the
    // tangents. Define the straight-leg zone as the union of each run's
    // butt-capped slab (it ends square at the corner vertex, leaving the corner
    // wedge uncovered). Treelawn = the concentric tl annulus ∩ that zone →
    // clean tangent cuts; the uncovered corner wedge becomes sidewalk. Same
    // per-run butt-cap construction as the asphalt, so the cuts stay consistent.
    const tlSlabs = []
    const wrapDisks = []   // round dead-end zone disks (treelawn wraps the cap)
    for (const run of runs) {
      const td = edgeDepth(run.baseMeasure, run.side, cw, 'T')   // grout → treelawn-outer (BASE measure — matches pre-Wall td)
      if (td <= 1e-6) continue
      const a = edgeDepth(run.measure, run.side, cw, 'A')   // per-fe asphalt edge, frozen (trim follows it)
      // Pull the run back from each CORNER end by (asphalt-hw + that corner's
      // resolved R) so the slab ends at the tangent and the corner wedge becomes
      // the ADA all-SW pad. A ROUND dead-end is NOT trimmed (treelawn runs to the
      // tip + the wrap disk rounds it). Closed-loop runs aren't trimmed. Acute
      // corners just get a small fillet now (no special wrap — that made the
      // teardrop/notch artifacts).
      const last = run.poly[run.poly.length - 1]
      const k0 = tipKey(run.poly[0]), k1 = tipKey(last)
      const t0 = roundTipKeys.has(k0) ? 0 : a + nearestVertR(run.poly[0], ring, vertR)
      const t1 = roundTipKeys.has(k1) ? 0 : a + nearestVertR(last, ring, vertR)
      const poly = runs.length > 1 ? trimPolyline(run.poly, t0, t1) : run.poly
      if (poly && poly.length >= 2) tlSlabs.push(...strokeOpen(poly, td))
    }
    let zone = runs.length > 1 ? (tlSlabs.length ? unionRings(tlSlabs) : []) : null
    // A ROUND dead-end cap is NOT an ADA intersection corner: the treelawn
    // CONTINUES around the cap (Jacob). Add a wrap disk at each round tip to the
    // straight-leg zone so the treelawn annulus wraps the round end (the cap
    // becomes a normal bent road section, not an all-SW ramp). Blunt tips stay
    // out of the zone → still all-SW / no wrap.
    if (zone && roundTips.length) {
      for (const t of roundTips) wrapDisks.push(circlePoly(t.p[0], t.p[1], t.hw + cw + t.tl + t.sw + 2))
    }
    if (zone && wrapDisks.length) zone = unionRings([...zone, ...wrapDisks])
    const clipLeg = (rings) => zone ? intersectRings(rings, zone) : rings
    // The two ped LEG strips + the structural corner pad. Outer = the strip
    // nearer the curb (treelawn position); inner = the strip nearer the
    // property line (sidewalk position). The corner span is always SW (G5 ADA).
    let legOuter = clipLeg(differenceRings(iC, iT))   // R+cw .. R+cw+tl
    let legInner = clipLeg(differenceRings(iT, iW))   // R+cw+tl .. R+cw+tl+sw
    let cornerPad = zone ? differenceRings(differenceRings(iC, iW), zone) : []
    let luRemainder = iW                              // LU = innermost remainder (+ blunt-tip reclaim)
    // G8 — at a blunt/none dead-end the street just ends: no ped wrap. Subtract
    // a disk at the tip from the ped bands and reclaim that ped area as LU so it
    // abuts the flat asphalt end.
    if (bluntTips.length) {
      const disks = bluntTips.map(t => circlePoly(t.p[0], t.p[1], t.hw + cw + tl + sw + 1))
      luRemainder = unionRings([...iW, ...intersectRings(differenceRings(iC, iW), disks)])
      legOuter = differenceRings(legOuter, disks)
      legInner = differenceRings(legInner, disks)
      cornerPad = differenceRings(cornerPad, disks)
    }
    // G8 round-tip cleanup — a cul-de-sac cap is road + ped wrap, NEVER land use.
    // The zero-width pendant spur leaves a thin LU sliver up the stub centerline
    // that pokes into the cap; reclaim any LU inside the cap radius as sidewalk.
    if (roundTips.length) {
      const caps = roundTips.map(t => circlePoly(t.p[0], t.p[1], t.hw + cw + t.tl + t.sw + 1))
      const stray = intersectRings(luRemainder, caps)
      if (stray.length) {
        luRemainder = differenceRings(luRemainder, caps)
        cornerPad = unionRings([...cornerPad, ...stray])
      }
    }
    // M3 — the two leg strips carry DATA-DRIVEN materials from the overridable
    // materials model (default {outer:'LU', inner:'SW'}). Don't hard-code
    // treelawn=grass / sidewalk=concrete — route each strip through stripMat so
    // T3's per-fe LU↔SW swap plugs in with no geometry rework. 'LU' → the tile's
    // land-use colour (the treelawn look); 'SW' → the sidewalk material.
    const routeStrip = (matTag, rings) => {
      if (!rings.length) return
      if (matTag === 'SW') Wacc.push(...rings)
      else pushLu(tlByLu, lu, rings)
    }
    routeStrip(stripMat.outer, legOuter)           // outer ped strip (default LU)
    routeStrip(stripMat.inner, legInner)           // inner ped strip (default SW)
    Wacc.push(...cornerPad)                         // corner span — always SW (structural)
    pushLu(luByLu, lu, luRemainder)                 // land-use remainder (per class)
  }
  return { Wacc, tlByLu, luByLu }
}

export function buildTileGround(ribbons, opts = {}) {
  const curbWidth = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH
  const stencil = opts.stencil && opts.stencil.length >= 3 ? opts.stencil : null
  // Smooth centerlines BEFORE face extraction so the grout (shared tile edges)
  // → tiles → strips all come out smooth — loops/curves round. smoothChain is
  // INTERPOLATING (passes through every authored vertex), so intersection
  // nodes survive exactly and the graph stays noded for the face walk. Default
  // 0.5 matches the figure-ground path + the store default (WYSIWYG).
  const smooth = Number.isFinite(opts.smooth) ? opts.smooth : 0.5
  let streets = (ribbons?.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  // Grade-separated roads (freeway corridor + ramps; OSM bridge/tunnel/layer, flagged
  // on the frame at 6854122) are EXCLUDED from the face graph: they cross other
  // streets in 2D with no real junction, which bowties the DCEL face walk into the
  // degenerate interchange polygons. They're stroked as flat asphalt strips after the
  // union below (like alleys), so the highway/ramps still render. §HANDOFF-onframe-faces.
  const gradeSep = (ribbons?.streets || []).filter(s => s?.points?.length >= 2 && s.gradeSeparated)
  // Pre-smooth originals (same index order — smoothing maps in place). The
  // per-fe segment ordinals are defined on the ORIGINAL centerline (IX nodes
  // survive interpolating smoothing exactly), so per-block width resolution
  // reads segOrd off these, matching the authoring key.
  const streetsOrig = streets
  if (smooth > 0) {
    streets = streets.map(s => {
      const sm = smoothChain(s.points, smooth)
      return sm ? { ...s, points: sm } : s
    })
  }

  // Per-street effective measure (median-facing sides pre-zeroed), indexed by
  // the street index the DCEL tags each edge with.
  const measures = streets.map(effectiveMeasure)
  const cw = curbWidth
  // Per-fe (per-block) asphalt-width overrides. blockCustoms is keyed
  // (skelId → side → segOrd) — the SAME identity the Survey/Measure drag writes.
  // Resolved per tile RUN: asphalt is stroked per run (strokeOpen below), so a
  // per-block pavementHW steps the asphalt edge for that segment; the curb +
  // concentric ped bands (offsets of the asphalt-inner) follow. segOrd is
  // computed on the original chain so it matches the authoring key.
  const blockCustoms = (opts.blockCustoms && typeof opts.blockCustoms === 'object') ? opts.blockCustoms : null
  const ixIdxsByStreet = blockCustoms
    ? (() => {
        const seg = resolveChainSegmentation(streetsOrig)
        return streetsOrig.map(s => {
          const n = s?.points?.length || 0
          return [...(seg.get(s) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
        })
      })()
    : null
  // segOrd of a run = number of interior-IX vertices at/before the run's lower
  // original-index boundary. (A run spanning a single natural segment — the
  // common case — resolves exactly; on a through-junction's far side a run can
  // span two segments and takes the lower one's width.)
  const runSegOrd = (run) => {
    const op = streetsOrig[run.streetIdx]?.points
    const ixIdxs = ixIdxsByStreet?.[run.streetIdx]
    if (!op || !ixIdxs?.length) return 0
    const idxOf = (pt) => {
      let bi = 0, bd = Infinity
      for (let i = 0; i < op.length; i++) { const dx = op[i][0] - pt[0], dy = op[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
      return bi
    }
    const a = Math.min(idxOf(run.poly[0]), idxOf(run.poly[run.poly.length - 1]))
    let segOrd = 0
    for (const i of ixIdxs) if (i <= a) segOrd++
    return segOrd
  }
  // A run's effective side measure: per-fe pavementHW (if authored) over the
  // per-chain default. Only pavementHW is per-fe here (the asphalt silhouette is
  // Survey's concern); ped band depths stay the tile's representative value.
  const runMeasure = (run) => {
    const base = measures[run.streetIdx]
    if (!blockCustoms) return base
    const so = streetsOrig[run.streetIdx]
    const sk = (so && (so.skelId || so.name)) || null
    if (!sk) return base
    const c = blockCustoms[sk]?.[run.side]?.[runSegOrd(run)]
    if (!c || !Number.isFinite(c.pavementHW)) return base
    const baseSide = base?.[run.side] || {}
    return { ...base, [run.side]: { ...baseSide, pavementHW: c.pavementHW } }
  }
  // A2 / F3 — corner R reads the authored controls: base 4.5 m (AASHTO
  // residential baseline, R_CLASS_DEFAULT) × the global Corners slider
  // (cornerRadiusScale), with per-corner / per-IX overrides resolved per tile
  // vertex (the gold-dot authoring). Each tile vertex IS a centerline node = an
  // IX point; its two bounding tile edges are the corner's two legs.
  const baseR = Number.isFinite(opts.cornerR) ? opts.cornerR : 4.5
  const scale = Number.isFinite(opts.cornerRadiusScale) ? opts.cornerRadiusScale : 1
  const R = Math.max(0, baseR * scale)   // uniform fallback (perimeter pass)
  const ixOverrides = (opts.cornerRadiusOverrides && typeof opts.cornerRadiusOverrides === 'object') ? opts.cornerRadiusOverrides : null
  const cornerOverrides = (opts.cornerCornerRadiusOverrides && typeof opts.cornerCornerRadiusOverrides === 'object') ? opts.cornerCornerRadiusOverrides : null
  // Override-key helpers — MUST match CornerEditHandles / buildBlockGeometryV2
  // exactly (ixKey = 3-dp point; legKey = `${skelId}:${f|b}`; per-corner key =
  // ixKey|sorted(legA,legB); per-corner wins over per-IX; both pre-scale).
  const ixKeyOf = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
  const skelOf = (si) => { const s = streets[si]; return (s && (s.skelId || s.name)) || '?' }
  // The corner key for tile vertex i = (IX point, the two bounding tile edges as
  // legs) — MUST match CornerEditHandles exactly. The leg along the OUTGOING edge
  // runs +index iff that edge is forward → 'f'; the INCOMING leg runs +index iff
  // that edge is NOT forward → 'f'. Used for both override lookup AND tagging the
  // achieved fillet so the handle can find it.
  const cornerKeyAt = (V, edges, i) => {
    const n = edges.length
    const eOut = edges[i], eIn = edges[(i - 1 + n) % n]
    const legOut = `${skelOf(eOut.streetIdx)}:${eOut.forward ? 'f' : 'b'}`
    const legIn  = `${skelOf(eIn.streetIdx)}:${eIn.forward ? 'b' : 'f'}`
    const [a, b] = legOut <= legIn ? [legOut, legIn] : [legIn, legOut]
    return `${ixKeyOf(V)}|${a}|${b}`
  }
  const resolveVertR = (V, edges, i) => {
    const ixk = ixKeyOf(V)
    if (cornerOverrides) {
      const v = cornerOverrides[cornerKeyAt(V, edges, i)]
      if (Number.isFinite(+v)) return Math.max(0, +v)
    }
    if (ixOverrides && Number.isFinite(+ixOverrides[ixk])) return Math.max(0, +ixOverrides[ixk])
    return baseR
  }
  // (nearestVertexIndex / nearestCornerVertexIndex / nearestVertR are module-level
  // now — shared with the chain-free sectionPass.)
  // The ACHIEVED fillet per corner key — what the construction actually rounded
  // each corner to (after the geometric inset clamp). The authoring handle reads
  // this so its magenta arc IS the curb, never a re-derived approximation.
  const cornerFillets = {}
  // M3 — overridable ped-strip materials. Default {outer:'LU', inner:'SW'}
  // (V1.5 model). T3 makes this per-fe (the ctrl-click LU↔SW swap); for now a
  // single model proves the data path. 'LU' → land-use colour, 'SW' → sidewalk.
  const stripMat = {
    outer: opts.stripMaterials?.outer === 'SW' ? 'SW' : 'LU',
    inner: opts.stripMaterials?.inner === 'LU' ? 'LU' : 'SW',
  }

  // G8 — dead-end caps. A degree-1 street endpoint (caps.degree===1) is a real
  // dead-end tip. Cap = authored capEnds ?? the geometric caps.cap ?? round.
  //   round       → round the asphalt at the tip + the ped wraps it (cul-de-sac)
  //   blunt/none  → flat asphalt, NO ped wrap (the street just ends, LU abuts)
  // (tipKey is module-level now — shared with sectionPass.)
  // Dead-end DEGREE is computed GEOMETRICALLY (count segments incident to each
  // node), not from `caps.degree` — toy ribbons carry no `caps` field, so
  // gating on it skipped every toy dead-end. A street endpoint whose node has
  // exactly one incident segment is a real tip. The cap TYPE comes from the
  // authored capEnds / capStart|End (the Survey end-cap assigner mirrors its
  // capStart/capEnd into capEnds via mergeLiveRibbons) → caps.cap → round.
  const nodeDeg = new Map()
  for (const s of streets) {
    const pts = s.points
    if (!pts) continue
    for (let i = 0; i < pts.length; i++) {
      const inc = (i === 0 || i === pts.length - 1) ? 1 : 2
      const k = tipKey(pts[i])
      nodeDeg.set(k, (nodeDeg.get(k) || 0) + inc)
    }
  }
  const deadEndTips = new Map()
  for (const s of streets) {
    const caps = s.caps, ce = s.capEnds, pts = s.points
    if (!pts) continue
    for (const [k, idx] of [['start', 0], ['end', pts.length - 1]]) {
      if (nodeDeg.get(tipKey(pts[idx])) !== 1) continue   // not a real dead-end tip
      const authored = ce?.[k] || (k === 'start' ? s.capStart : s.capEnd)
      // 'none' / unspecified → the documented default 'round' cul-de-sac. (An
      // explicit 'none' was being treated as blunt → the blunt ped→LU reclaim
      // left a stray LU notch up the pendant centerline while the fillet still
      // rounded the end — a broken-looking cap. Only an explicit 'blunt' is blunt.)
      const cap = (authored && authored !== 'none') ? authored : (caps?.[k]?.cap || 'round')
      const m = s.measure
      const hw = Math.max(m?.left?.pavementHW || 0, m?.right?.pavementHW || 0)
      const tlw = Math.max(m?.left?.treelawn || 0, m?.right?.treelawn || 0)
      const sww = Math.max(m?.left?.sidewalk || 0, m?.right?.sidewalk || 0)
      // `authoredCap` = the operator's EXPLICIT end-cap (capEnds/capStart|End), or null
      // when unauthored. The pendant prune (scope b) gates on THIS, not the resolved
      // `cap`: the geometric `caps[].cap` default is 'butt' for some ramp/roundabout
      // stems that are NOT genuine flat dead-ends (Saint Vincent, Benton Place — their
      // acyclic tree structure cascades a 200–380 m leaf-peel that depaves the whole
      // gore). Only an operator-authored flat cap is a trustworthy "prune me" signal.
      deadEndTips.set(tipKey(pts[idx]), { cap, authoredCap: authored || null, hw, tl: tlw, sw: sww, px: pts[idx][0], py: pts[idx][1] })
    }
  }

  // Scope (b) prune set: degree-1 tips the operator AUTHORED as a flat (non-round,
  // non-none) cap — the spike-into-block offenders whose out-and-back spur opens a
  // slack triangle. Round cul-de-sacs (the documented default, authored OR geometric)
  // stay woven so the face bands keep rounding their bulb + ped wrap. We gate on the
  // AUTHORED cap, NOT the resolved one: the geometric 'butt' default mislabels some
  // ramp/roundabout stems whose acyclic structure cascades a destructive leaf-peel
  // (Saint Vincent 213 m, Benton 383 m — both depave on prune). An explicit operator
  // cap is the only trustworthy dead-end signal. (tipKey here is the SAME quantization
  // extractFaces' predicate reads off the node point.)
  const pruneTipKeys = new Set()
  for (const [k, t] of deadEndTips) {
    if (t.authoredCap && t.authoredCap !== 'none' && t.authoredCap !== 'round') pruneTipKeys.add(k)
  }
  const stubs = []   // pendant dead-end chains pruned from the face graph (stroked below)
  const tiles = extractFaces(streets, stubs, (p) => pruneTipKeys.has(tipKey(p)))

  // Per tile (CONCENTRIC corners):
  //  1. Asphalt = the union of per-street-side run stadiums (PER-EDGE widths,
  //     butt caps → sharp miter corners, no cap-at-depth bulge), clipped to
  //     the tile. The road between two tiles is each tile's half meeting at the
  //     shared grout; asymmetric widths + divided medians fall out.
  //  2. Round the asphalt-inner region's sharp corners ONCE at the authored
  //     curb R → the curb line wraps every block corner at radius R.
  //  3. The ped bands are CONCENTRIC inward offsets of that rounded region:
  //     curb (R→R+cw), treelawn (→+tl), sidewalk (→+sw). Eroding a radius-R
  //     corner by d gives radius R+d — the nested-arc wrap Jacob's eye wants.
  //     (Curb width is global so it's exact; treelawn/sidewalk use a per-tile
  //     representative — concentric corners trade per-edge ped width for the
  //     clean wrap. Per-edge ASPHALT width, the dominant asymmetry, is kept.)
  const repDepth = (runs, key) => {
    let sum = 0, n = 0
    for (const run of runs) {
      const m = measures[run.streetIdx]?.[run.side]
      const v = Math.max(0, Number.isFinite(m?.[key]) ? m[key] : 0)
      sum += v; n++
    }
    return n ? sum / n : 0
  }

  // M1 — each tile's land-use class. Reuse the figure-ground resolution:
  // blockLandUse override (by bbox blockKey) → the OSM parcel (face.use) the
  // tile's interior lands in → the deterministic hash palette. So a tile reads
  // its real class (commercial / park / institutional / …), not all-residential.
  const faceList = (ribbons?.faces || []).filter(f => f?.ring?.length >= 3 && f.use)
  const blockLandUse = (opts.blockLandUse && typeof opts.blockLandUse === 'object') ? opts.blockLandUse : null
  const luForRing = (ring) => {
    if (blockLandUse) { const bk = blockKeyFromRing(ring); if (blockLandUse[bk]) return blockLandUse[bk] }
    const [px, py] = ringInteriorPoint(ring)
    let best = null, bestArea = Infinity
    for (const f of faceList) {
      if (pointInRing(px, py, f.ring)) {
        const a = Math.abs(signedArea(f.ring))
        if (a < bestArea) { best = f.use; bestArea = a }   // smallest containing face wins (donut-safe)
      }
    }
    return best || pickLuFromHash(hashKey(blockKeyFromRing(ring)))
  }

  // Asphalt/curb/sidewalk are single-material (merged). Treelawn (M2) + the LU
  // remainder (M1) are grouped by the tile's class so they paint that class's
  // per-Look colour.
  const Aacc = [], Cacc = []   // shape strokes (asphalt, curb); ped accumulators come from sectionPass
  // ── THE WALL · Phase B · SHAPE pass (this loop) ────────────────────
  // The shape loop produces, per tile: the curb-line ring iA + cornerFillets
  // (the hardscape), emits the asphalt + curb strokes, and FREEZES everything a
  // later sectionPass needs into shapeTiles[] — the ring, iA, per-corner radii
  // (vertR), the representative ped depths (tl/sw), the land-use class, the
  // dead-end tips, and per-run { poly, side, measure } where `measure` is the
  // per-fe-resolved side measure (it carries segOrd's effect — the sole chain
  // reach-back, computed here where the chain is legitimately available). The
  // section pass then strokes the ped strips off ONLY this frozen data.
  // perTileMeta (= each tile's runMeta) is the freeze-receipt returned as
  // `_perRunMeta`. perTileMeta[i] / shapeTiles[i] align 1:1 with tiles[i].
  const perTileMeta = []
  const shapeTiles = []
  for (const tile of tiles) {
    const runs = groupRuns(tile)
    const runMeta = runs.map(run => {
      const so = streetsOrig[run.streetIdx]
      return {
        poly: run.poly,
        side: run.side,
        skelId: (so && (so.skelId || so.name)) || null,
        segOrd: runSegOrd(run),
        anchor: (so && so.anchor) || null,
        measure: runMeasure(run),               // per-fe-resolved side measure (override pavementHW) — for the asphalt edge `a`
        baseMeasure: measures[run.streetIdx],   // per-street base measure — for the treelawn slab depth `td` (uses base pavementHW)
      }
    })
    perTileMeta.push(runMeta)
    // G8 — dead-end tips on this tile (a run boundary vertex that is a degree-1
    // node). Round-capped tips get a round asphalt disk so the cul-de-sac rounds
    // (the butt-capped runs alone end flat); blunt/none tips stay flat and later
    // suppress the ped wrap so LU abuts the street's flat end.
    const roundTips = [], bluntTips = []
    const seenTip = new Set()
    if (runs.length > 1) {
      for (const run of runs) {
        for (const p of [run.poly[0], run.poly[run.poly.length - 1]]) {   // tip may sit at EITHER run end
          const tk = tipKey(p)
          if (seenTip.has(tk)) continue
          const t = deadEndTips.get(tk)
          if (t) { seenTip.add(tk); (t.cap === 'round' ? roundTips : bluntTips).push({ p, hw: t.hw, tl: t.tl, sw: t.sw }) }
        }
      }
    }
    const roundTipKeys = new Set(roundTips.map(t => tipKey(t.p)))
    const aStads = []
    for (const run of runs) {
      const d = edgeDepth(runMeasure(run), run.side, cw, 'A')   // per-fe asphalt half-width
      if (d > 1e-6) aStads.push(...strokeOpen(run.poly, d))
    }
    for (const t of roundTips) if (t.hw > 1e-6) aStads.push(circlePoly(t.p[0], t.p[1], t.hw))
    const aFill = aStads.length ? intersectRings(unionRings(aStads), [tile.ring]) : []
    // G3a — a divided-road MEDIAN tile (the thin tile between two carriageways)
    // drops ALL ped: its bounding edges are median-facing (inner-edge street,
    // inboard side). Detect by median-facing boundary fraction and zero the
    // tile's ped, so no treelawn/sidewalk sliver leaks into the median.
    let medLen = 0, totLen = 0
    for (const run of runs) {
      let L = 0
      for (let i = 0; i < run.poly.length - 1; i++) L += Math.hypot(run.poly[i + 1][0] - run.poly[i][0], run.poly[i + 1][1] - run.poly[i][1])
      totLen += L
      if (isMedianFacing(streets[run.streetIdx], run.side)) medLen += L
    }
    const isMedianTile = totLen > 0 && medLen / totLen > 0.4
    const tl = isMedianTile ? 0 : repDepth(runs, 'treelawn')
    const sw = isMedianTile ? 0 : repDepth(runs, 'sidewalk')
    // R-CLAMP: acute corners can't hold the full R — the inward offsets self-
    // intersect and openRound over-erodes the sharp tip. Clamp R per tile by its
    // tightest corner angle and the ped depth (d_min), so the rounding fits.
    // Per-corner fillet of the curb line. Each tile vertex resolves to its
    // authored radius (per-corner → per-IX → default 4.5) × the global scale —
    // NO clamp: the operator's R is the dial, and filletRing's own 45%-of-gap
    // inset bound handles overlap geometrically (doctrine: no corner-R clamps in
    // emit). The fillet operates on the inboard curb ring, so map each curb
    // corner back to its nearest centerline node for the radius.
    const vertR = tile.ring.map((V, i) => resolveVertR(V, tile.edges, i) * scale)
    // Round dead-end cap: the asphalt cap is ALREADY a clean round disk (circlePoly,
    // :849). Letting filletRing round the disk↔stadium seam corners there turns the
    // smooth cap into multi-lobe scallops (trace: a simple stub goes aFill 20 → iA 33
    // with 2 cap fillets; complex caps hit 5). Zero R at each round-tip node so the
    // cap stays the disk arc — the curb/ped offsets then wrap it cleanly, no lobes.
    for (const t of roundTips) { const ti = nearestVertexIndex(t.p, tile.ring); if (ti >= 0) vertR[ti] = 0 }
    const cornerRfn = (pt) => nearestVertR(pt, tile.ring, vertR)
    const fSink = []
    const iA = filletRings(differenceRings([tile.ring], aFill), cornerRfn, fSink)   // rounded asphalt-inner (curb line)
    // Tag each achieved fillet with its corner key (the centerline NODE it
    // rounded + that node's two tile-edge legs) so the authoring handle can read
    // the true curb arc — one corner truth, no drift. The apex sits inboard of
    // the node (the fillet rounds the curb ring, inset from the centerline), so
    // map it back to the nearest SHARP corner of the tile ring — never a nearby
    // smoothed curve sample, which would mis-key the corner (the handle-detach
    // bug: read side queries the node key, find nothing, falls back to the apex).
    const cornerIdxs = sharpCornerIndices(tile.ring)
    for (const f of fSink) {
      const vi = cornerIdxs.length
        ? nearestCornerVertexIndex(f.apex, tile.ring, cornerIdxs)
        : nearestVertexIndex(f.apex, tile.ring)
      cornerFillets[cornerKeyAt(tile.ring[vi], tile.edges, vi)] = { C: f.C, r: f.r, tA: f.tA, tB: f.tB, apex: f.apex }
    }
    const lu = luForRing(tile.ring)
    // Dead-end caps + loop reversals make iA turn ~180°; a jtMiter inward offset
    // SELF-INTERSECTS there → needle spikes in the ped strips (the asphalt cap
    // rounds clean, the strips spike). Round the band join on JUST those tiles —
    // a dead-end tip, a single-run loop, or one too thin to inset without the
    // offsets colliding — so the strips get a clean round cap like the asphalt.
    // Keep jtMiter on normal cornered tiles (authored R=0 squares stay sharp — NOT
    // a global revert). Curb (here) + ped bands (sectionPass) MUST share this
    // frozen join or their common iA-inset edge diverges, so it rides on the tile.
    let bandArea = 0, bandPerim = 0
    for (const r of iA) {
      bandArea += Math.abs(signedArea(r))
      for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; bandPerim += Math.hypot(r[j][0] - r[i][0], r[j][1] - r[i][1]) }
    }
    const thinTile = bandPerim > 1e-6 && (2 * bandArea / bandPerim) < (cw + tl + sw)   // mean width < deepest inset → bands collide
    const bandJoin = (roundTips.length || bluntTips.length || runs.length === 1 || thinTile) ? 'round' : 'miter'
    // Capacity guard (RIBBONS §3.9a item 5, ported from emitOneBlockRingBands): when a
    // tile's interior pinches below the band depth WB=cw+tl+sw, the inward offsets
    // collapse past the medial axis and filletRing rounds the degenerate geometry into
    // thorns (thin loops, narrow medians, slivers, tight wraps — ~the whole class).
    // Bisect iA's largest non-empty inward offset (its inscribed reach), freeze
    // cap = 90% of it; sectionPass + the curb clamp every depth to cap. Over-capacity
    // tiles degrade to a clean truncated ribbon; in-spec tiles (reach ≫ WB) keep WB
    // untouched. On the offset W, NOT the fillet radius [[feedback_no_corner_radius_clamps_in_emit]]
    // — that degeneracy Clipper handles natively; W-past-medial-axis it does not.
    const WBnom = cw + tl + sw
    let cap = WBnom
    if (WBnom > 1e-6 && !offsetRings(iA, -(WBnom / 0.9), bandJoin).length) {
      let lo = 0, hi = WBnom / 0.9
      for (let it = 0; it < 16; it++) { const mid = (lo + hi) / 2; if (offsetRings(iA, -mid, bandJoin).length) lo = mid; else hi = mid }
      cap = lo * 0.9
    }
    Aacc.push(...differenceRings([tile.ring], iA))   // asphalt = tile − rounded inner (the shape silhouette)
    Cacc.push(...differenceRings(iA, offsetRings(iA, -Math.min(cw, cap), bandJoin)))   // curb stroke = iA − iC (clamped, shares join)
    // Freeze everything the section pass needs off this tile's shape.
    shapeTiles.push({ ring: tile.ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, roundTipKeys, runs: runMeta, bandJoin, cap })
  }

  // ── THE WALL · Phase C · the cut ───────────────────────────────────
  // The interior authored ped comes from the module-level sectionPass, handed
  // ONLY the frozen shapeTiles + design params. It has no handle on the chain,
  // so it physically cannot reach back — Section's shape input changes only when
  // this shape pass re-runs. (The perimeter G9 below stays here on the shape
  // side, where reading the chain is legitimate — Jacob's Option 1.)
  const { Wacc, tlByLu, luByLu } = sectionPass(shapeTiles, cw, stripMat)

  // Grade-separated roads paint as flat strips — excluded from faces above, stroked
  // here off their own centerline at the frame's pavementHW half-width. One flat level
  // (no z-separation yet); stencil-clipped with the rest below. HIGHWAY-class ones
  // route to their OWN `highway` output (its own layer toggle + material, matching the
  // figure-ground `highway` group) so the freeway can be toggled/shaded apart from
  // local streets; local grade-sep bridges stay asphalt.
  const HIGHWAY_CLASSES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
  const Hacc = []
  for (const s of gradeSep) {
    // Dense arc sampling (16/seg vs the default 4): the highway stroke is wide (W≈17 m),
    // so coarse arcs facet and the offset gaps on tight ramp bends (RIBBONS §3.3).
    const sm = smooth > 0 ? (smoothChain(s.points, smooth, 16) || s.points) : s.points
    const hw = Math.max(s.measure?.left?.pavementHW || 0, s.measure?.right?.pavementHW || 0)
    if (hw <= 1e-6) continue
    ;(HIGHWAY_CLASSES.has(s.highway) ? Hacc : Aacc).push(...strokeOpen(sm, hw))
  }
  // Stroke the pruned dead-end stubs as flat asphalt (the grade-sep sibling).
  // extractFaces pruned the non-round pendant spurs so the surrounding blocks come
  // out as clean cycles; the stub's road comes back here. The block face is now clean
  // → its ped/LU covers that area, and the stub strokes on top with a BUTT cap (the
  // street just ends; blunt/none/butt all abut LU flat — no ped wrap, matching G8).
  // Points are already smoothed (extractFaces ran on the smoothed streets), so no
  // re-smooth. (A round-cap stub would need a cap disk, but scope (b) never prunes a
  // round tip — the branch is defensive only.)
  for (const stub of stubs) {
    if (!stub.points || stub.points.length < 2) continue
    const ti = deadEndTips.get(tipKey(stub.points[0]))
    const st = streets[stub.streetIdx]
    const hw = ti?.hw || Math.max(st?.measure?.left?.pavementHW || 0, st?.measure?.right?.pavementHW || 0)
    if (hw <= 1e-6) continue
    Aacc.push(...strokeOpen(stub.points, hw))
    if (ti?.cap === 'round') Aacc.push(circlePoly(stub.points[0][0], stub.points[0][1], hw))
  }
  let asphalt = unionRings(Aacc)
  let highway = unionRings(Hacc)
  let curb    = unionRings(Cacc)
  let sidewalk = unionRings(Wacc)
  if (stencil) {
    const tileUnion = unionRings(tiles.map(t => t.ring))
    const perimeter = differenceRings([stencil], tileUnion)   // frame: outer(s) + tile-network holes
    // G9 — road the EXTERIOR streets. A street segment whose outer side borders
    // the perimeter (no tile there) was un-roaded → "roads don't reach their
    // dead ends". Stroke every street at the four cumulative depths and clip to
    // the perimeter, so only each street's exterior-facing side fills there;
    // union with the per-tile interior bands gives the full-width road out to
    // the tip. The perimeter is the edge of the map, so the bands use the
    // street's max-side widths and the stroke's own (cap-at-depth) corners
    // rather than the interior concentric construction.
    const perimFill = (level) => {
      const stads = []
      for (let i = 0; i < streets.length; i++) {
        const m = measures[i]
        const a = Math.max(0, m?.left?.pavementHW || 0, m?.right?.pavementHW || 0)
        if (a <= 1e-6) continue
        const tlm = Math.max(0, m?.left?.treelawn || 0, m?.right?.treelawn || 0)
        const swm = Math.max(0, m?.left?.sidewalk || 0, m?.right?.sidewalk || 0)
        const d = level === 'A' ? a : level === 'C' ? a + cw : level === 'T' ? a + cw + tlm : a + cw + tlm + swm
        stads.push(...strokeOpen(streets[i].points, d))
      }
      // The perimeter strokes are butt-capped, so an exterior round cul-de-sac
      // would end flat. Add a concentric fill disk at each round tip at this
      // level's depth so the perimeter road rounds AND its ped bands wrap (the
      // level differences give asphalt + curb + treelawn + sidewalk rings).
      for (const [, t] of deadEndTips) {
        if (t.cap !== 'round' || t.hw <= 1e-6) continue
        const d = level === 'A' ? t.hw : level === 'C' ? t.hw + cw : level === 'T' ? t.hw + cw + t.tl : t.hw + cw + t.tl + t.sw
        stads.push(circlePoly(t.px, t.py, d))
      }
      return stads.length && perimeter.length ? intersectRings(unionRings(stads), perimeter) : []
    }
    const pA = perimFill('A')
    // CONCENTRIC perimeter corners that MATCH the interior (Jacob): a corner is
    // a property of the walk, so round it with the same G5 construction on the
    // open perimeter contour. openRound the region beyond the perimeter asphalt
    // at R (rounds the convex block-outer corners where two exterior runs meet);
    // the bands are concentric offsets of that rounded asphalt-inner. To keep
    // the ped on the STREET side (never on the stencil/map edge) WITHOUT
    // re-hardening the corners, clip to a SMOOTH zone (the asphalt dilated by
    // the full ped depth, round join) — not the hard network-buffer union.
    // Representative ped (mean) matches the interior's per-tile representative.
    let tlSum = 0, swSum = 0, nP = 0
    for (const m of measures) {
      if (!m) continue
      tlSum += Math.max(m.left?.treelawn || 0, m.right?.treelawn || 0)
      swSum += Math.max(m.left?.sidewalk || 0, m.right?.sidewalk || 0); nP++
    }
    const tlP = nP ? tlSum / nP : 0, swP = nP ? swSum / nP : 0
    const iAp = openRound(differenceRings(perimeter, pA), R)
    const iCp = offsetRings(iAp, -cw, 'miter')
    const iTp = offsetRings(iAp, -(cw + tlP), 'miter')
    const iWp = offsetRings(iAp, -(cw + tlP + swP), 'miter')
    const pedClip = offsetRings(pA, cw + tlP + swP + R + 3)        // smooth street-side zone
    const pAsphalt = differenceRings(perimeter, iAp)
    const pCurb    = intersectRings(differenceRings(iAp, iCp), pedClip)
    // ADA all-SW corner plug — the SAME slab-trim as the interior (NOT disks,
    // which curve backwards): the treelawn lives only on the straight legs and
    // ends at the tangent. Build the leg zone from each street's treelawn slab,
    // split at junctions (degree ≥ 3) and trimmed back from each junction/end by
    // (asphalt-hw + R). The corner span carries no treelawn → fills as sidewalk.
    const tlSlabsP = []
    streets.forEach((s, i) => {
      const m = measures[i]
      const a = Math.max(0, m?.left?.pavementHW || 0, m?.right?.pavementHW || 0)
      const td = a + cw + tlP
      if (td <= 1e-6 || !s.points) return
      for (const seg of splitAtJunctions(s.points, nodeDeg, tipKey)) {
        let segLen = 0
        for (let k = 0; k < seg.length - 1; k++) segLen += Math.hypot(seg[k + 1][0] - seg[k][0], seg[k + 1][1] - seg[k][1])
        const trim = a + R
        const poly = trimPolyline(seg, trim, trim)
        if (poly && poly.length >= 2) tlSlabsP.push(...strokeOpen(poly, td))
      }
    })
    const zoneP = tlSlabsP.length ? unionRings(tlSlabsP) : []
    const pPedZone = intersectRings(differenceRings(iCp, iWp), pedClip)   // curb-inner → LU, street side
    const pTree = zoneP.length ? intersectRings(intersectRings(differenceRings(iCp, iTp), pedClip), zoneP) : []
    const pSide = differenceRings(pPedZone, pTree)                        // sidewalk incl. the corner plug
    asphalt  = unionRings([...asphalt,  ...pAsphalt])
    curb     = unionRings([...curb,     ...pCurb])
    sidewalk = unionRings([...sidewalk, ...pSide])
    // Perimeter treelawn + the remaining perimeter LU route to one edge-of-map
    // class (probe the largest perimeter outer). Keep the frame's holes so it
    // doesn't paint over the per-class block centres.
    let big = null, bigA = 0
    for (const r of perimeter) { const a = signedArea(r); if (a > bigA) { bigA = a; big = r } }
    const perimClass = big ? luForRing(big) : 'unknown'
    pushLu(tlByLu, perimClass, pTree)
    pushLu(luByLu, perimClass, differenceRings(perimeter, unionRings([...pAsphalt, ...pCurb, ...pTree, ...pSide])))
    asphalt  = intersectRings(asphalt,  [stencil])
    highway  = intersectRings(highway,  [stencil])
    curb     = intersectRings(curb,     [stencil])
    sidewalk = intersectRings(sidewalk, [stencil])
  }
  const treelawnByLu = {}, luByClass = {}
  for (const k of Object.keys(tlByLu)) treelawnByLu[k] = stencil ? intersectRings(unionRings(tlByLu[k]), [stencil]) : unionRings(tlByLu[k])
  for (const k of Object.keys(luByLu)) luByClass[k]   = stencil ? intersectRings(unionRings(luByLu[k]), [stencil]) : unionRings(luByLu[k])

  // The BLOCK contours: each tile's asphalt-inner ring (iA) — the block polygon
  // to the curb edge, exactly the polygon this step bakes into the shape artifact.
  // No ped/LU subdivision (those are scalars here, geometry only in Section).
  // Collected from the per-tile shape (already computed) — no extra Clipper op, so
  // it stays free on the live corner-drag rebuild path. The Survey view shades
  // these to memorialize the block boundaries; the rest of the app ignores it.
  const blockRaw = shapeTiles.flatMap(st => st.iA || [])
  const block = stencil ? intersectRings(blockRaw, [stencil]) : blockRaw

  // ── THE WALL · Phase D · serialize the frozen artifact ─────────────
  // `_shapeArtifact` is the per-tile frozen shape sectionPass consumes — the
  // single source Section reads, no chain. JSON-safe (roundTipKeys Set→array).
  // Built ONLY when the bake asks (emitArtifact) so the live path pays nothing.
  const _shapeArtifact = opts.emitArtifact
    ? shapeTiles.map(st => ({ ...st, roundTipKeys: [...st.roundTipKeys] }))
    : undefined
  return { asphalt, highway, curb, sidewalk, treelawnByLu, luByClass, block, cornerFillets, _tiles: tiles, _perRunMeta: perTileMeta, _shapeArtifact }
}
