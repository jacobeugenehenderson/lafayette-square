// tileGround — the pure-ribbon TILE construction (T1 of the reconceived
// pipeline; spike-validated, HANDOFF-spike-pure-ribbon.md → HANDOFF-tile-T1-
// live-path.md). ONE module shared by the LIVE Designer (BlockGeometryV2Debug)
// and the bake (bake-ground) so live == bake by construction (WYSIWYG).
//
// This is THE live ground construction for every scene: LS runs tiles
// unflagged (`isTileScene = true`), same as toy. Figure-ground
// (buildBlockGeometryV2) is the dead predecessor path, deleted at T4.
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
import { smoothChain, jKey } from './smoothCenterline.js'
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
// ── D6a · the per-edge variable offset (the curb, as a polygon) ────────────
// POLYGON-FIRST §3 / SKELETON §5f: the curb is `chain ⊕ pavementHW`, a PARALLEL
// OFFSET of the frozen frame, with corners as the INTERSECTION of adjacent
// offset lines — NOT carved from the asphalt union (which bows where junction
// windows swell it). Offset each ring edge inward by its own depth; each vertex
// is where its two neighbour offset lines cross. Acute spikes are miter-clamped
// to a bevel; the result is Clipper-cleaned of any self-intersection (pinched/
// non-convex tiles). depthAt(i) = inward depth for edge i (ring[i]→ring[i+1]).
// cornerAt(i) = whether vertex i is a REAL corner (two DIFFERENT streets meet).
// At a non-corner — a THROUGH-node where one street continues (a T's far side, a
// centerline dogleg) — the curb runs continuous, never an offset-intersection
// corner (osm2streets doctrine: corners come from leg adjacency; "T-sensitivity").
// capAt(i) = null | 'round' | 'blunt' — a dead-end TIP vertex; the cap is built
// INTO the polygon (a semicircle / flat butt spanning the two legs' offset
// endpoints), tangent to the legs by construction → no graft, and it matches the
// authored per-fe leg width automatically.
function capArc(PL, PR, bx, bz, N = 16) {
  const Cx = (PL[0] + PR[0]) / 2, Cy = (PL[1] + PR[1]) / 2
  const r = Math.hypot(PL[0] - PR[0], PL[1] - PR[1]) / 2
  if (!(r > 1e-6)) return [PL]
  const aL = Math.atan2(PL[1] - Cy, PL[0] - Cx)
  const target = Math.atan2(-bz, -bx)            // tip side = away from the street body
  const adiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) }
  const ccw = adiff(aL + Math.PI / 2, target) < adiff(aL - Math.PI / 2, target)   // sweep through the tip side
  const out = []
  for (let k = 0; k <= N; k++) { const a = aL + (ccw ? 1 : -1) * Math.PI * (k / N); out.push([Cx + r * Math.cos(a), Cy + r * Math.sin(a)]) }
  return out
}
function offsetRingVariable(ring, depthAt, cornerAt = () => true, capAt = () => null) {
  const n = ring.length
  if (n < 3) return []
  const ccw = signedArea(ring) > 0
  const seg = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx          // inward normal (winding-aware)
    const d = Math.max(0, depthAt(i) || 0)
    seg.push({ dir: [dx, dy], P: [a[0] + nx * d, a[1] + ny * d], nrm: [nx, ny], d })
  }
  const W = []
  for (let i = 0; i < n; i++) {
    const A = seg[(i - 1 + n) % n], B = seg[i]              // vertex i: between edge i-1 and edge i
    const capT = capAt(i)
    if (capT) {
      // DEAD-END cap built INTO the offset (no graft). PL/PR = the two legs'
      // offset endpoints at the tip (using the offset depths A.d/B.d, so the cap
      // matches the legs' authored width + is tangent). Round → a semicircle on
      // the tip side; blunt → a flat butt segment. bodyDir = −A.dir + B.dir.
      const PL = [ring[i][0] + A.nrm[0] * A.d, ring[i][1] + A.nrm[1] * A.d]
      const PR = [ring[i][0] + B.nrm[0] * B.d, ring[i][1] + B.nrm[1] * B.d]
      if (capT === 'blunt') W.push(PL, PR)
      else W.push(...capArc(PL, PR, -A.dir[0] + B.dir[0], -A.dir[1] + B.dir[1]))
      continue
    }
    const det = A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0]
    // Through-node (same street both sides) or collinear → offset the vertex by
    // the AVERAGED normal at the averaged depth: the curb runs straight/smooth
    // through, no spurious corner from an off-chord vertex or a per-fe width step.
    if (!cornerAt(i) || Math.abs(det) < 1e-9) {
      let mx = A.nrm[0] + B.nrm[0], my = A.nrm[1] + B.nrm[1]; const mL = Math.hypot(mx, my) || 1; mx /= mL; my /= mL
      W.push([ring[i][0] + mx * ((A.d + B.d) / 2), ring[i][1] + my * ((A.d + B.d) / 2)]); continue
    }
    const t = ((B.P[0] - A.P[0]) * A.dir[1] - (B.P[1] - A.P[1]) * A.dir[0]) / det
    const X = [B.P[0] + B.dir[0] * t, B.P[1] + B.dir[1] * t]
    const lim = 2.5 * Math.max(A.d, B.d, 0.5) + 1           // miter clamp (acute-corner spike → bevel)
    if (Math.hypot(X[0] - ring[i][0], X[1] - ring[i][1]) > lim) {
      const pA = (ring[i][0] - A.P[0]) * A.dir[0] + (ring[i][1] - A.P[1]) * A.dir[1]
      const pB = (ring[i][0] - B.P[0]) * B.dir[0] + (ring[i][1] - B.P[1]) * B.dir[1]
      W.push([A.P[0] + A.dir[0] * pA, A.P[1] + A.dir[1] * pA])
      W.push([B.P[0] + B.dir[0] * pB, B.P[1] + B.dir[1] * pB])
    } else W.push(X)
  }
  return unionRings([W]).filter(r => Math.abs(signedArea(r)) > 0.5)   // clean self-intersections
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
// A corner exists only where two REAL legs meet (the osm2streets doctrine:
// corners come from leg adjacency, never from whatever stroke geometry falls
// at a vertex). Clipper's union/difference leaves near-duplicate vertices
// (sub-cm micro-edges) exactly at junction stations — where a tile-ring chain
// vertex meets coincident stroke edges — and the micro-edge's direction is
// quantization NOISE. Reading that noise as a corner leg extrapolated a 4.5 m
// tangent into a multi-meter bite (the Lafayette-park 105 m diagonal at the
// Waverly station; θ→0 made the Mackay wedge unbounded) and minted a spurious
// magenta corner handle on a straight run — "the initial thing".
// Cure at the ring layer: collapse micro-edges BEFORE corner detection, and
// never corner-test a vertex whose leg is shorter than MIN_CORNER_LEG.
const RING_DUP_EPS = 0.02      // m — collapse consecutive verts closer than this
const MIN_CORNER_LEG = 0.05    // m — a leg shorter than this is residue, not a leg
function dedupeRing(ring) {
  const n = ring.length
  if (n < 3) return ring
  const out = []
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = out[out.length - 1]
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < RING_DUP_EPS) continue
    out.push(p)
  }
  // close-seam dup (last ≈ first)
  while (out.length >= 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < RING_DUP_EPS) out.pop()
  return out.length >= 3 ? out : ring
}
// `sink` (optional) collects the ACHIEVED fillet per corner — { apex, C, r, tA,
// tB } — so the authoring handle can draw the exact curb arc the construction
// produced (one corner truth; no independent re-derivation → no drift).
function filletRing(ring0, Rfn, sink) {
  const ring = dedupeRing(ring0)
  const n = ring.length
  if (n < 3) return ring.slice()
  const sign = signedArea(ring) >= 0 ? 1 : -1
  // Pass 1 — find corner vertices (convex relative to interior, turning > tol).
  const corners = []                                // { i, R, theta, inx,iny, outx,outy }
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let inx = V[0] - A[0], iny = V[1] - A[1], outx = B[0] - V[0], outy = B[1] - V[1]
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy)
    if (li < MIN_CORNER_LEG || lo < MIN_CORNER_LEG) continue   // residue, not a leg
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
    if (li < MIN_CORNER_LEG || lo < MIN_CORNER_LEG) continue   // mirror filletRing's leg guard
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
function circlePoly(cx, cy, r, seg = 32) {
  const out = []
  for (let i = 0; i < seg; i++) { const a = (i / seg) * 2 * Math.PI; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return out
}
// The bent-corner SECTOR (RIBBONS §3.9a step 10): the annular wedge swept from
// the frozen curb arc inward, bounded laterally by the two tangent radii — the
// band BENT around the arc, NEVER a disk. Built from the achieved fillet
// {C, r, tA, tB}: outer edge = the curb arc itself (radius r about C), inner
// edge = the concentric arc at radius r−depth (the band bottom), closed into
// one annular-sector polygon. `fullBand ∩ sector` (clipped to the corner depth)
// is the bent pad — a slice of the same continuous offsets, not a primitive.
// `margin` extends the sector straight OUTWARD along each leg's tangent beyond
// the arc, so it laps onto the leg slabs and the gap between them (the legs are
// pulled back by ~asphalt-hw+R) tiles seamlessly. The lap is harmless: bandRem
// already has the leg sectors subtracted, so the corner only reclaims leftover.
function arcSectorPoly(C, r, tA, tB, depth, margin = 0) {
  const [cx, cy] = C
  const aA = Math.atan2(tA[1] - cy, tA[0] - cx)
  const aB = Math.atan2(tB[1] - cy, tB[0] - cx)
  let delta = aB - aA
  while (delta > Math.PI) delta -= 2 * Math.PI        // a fillet corner is the MINOR arc (< π)
  while (delta < -Math.PI) delta += 2 * Math.PI
  const sgn = delta >= 0 ? 1 : -1
  const rin = Math.max(0.05, r - depth)
  const segs = Math.max(2, Math.round(Math.abs(delta) / (Math.PI / 24)))
  // radial (outward / curb-side) + tangent at each end; into-arc = +sgn·tangent,
  // so the leg continues OUTWARD = −sgn·tangent at A, +sgn·tangent at B.
  const uA = [Math.cos(aA), Math.sin(aA)], tgA = [-Math.sin(aA), Math.cos(aA)]
  const uB = [Math.cos(aB), Math.sin(aB)], tgB = [-Math.sin(aB), Math.cos(aB)]
  const oA = [cx + r * uA[0] - sgn * tgA[0] * margin, cy + r * uA[1] - sgn * tgA[1] * margin]
  const oB = [cx + r * uB[0] + sgn * tgB[0] * margin, cy + r * uB[1] + sgn * tgB[1] * margin]
  const iAx = [oA[0] - uA[0] * depth, oA[1] - uA[1] * depth]   // inner of the leg-A extension
  const iBx = [oB[0] - uB[0] * depth, oB[1] - uB[1] * depth]
  const out = [oA]
  for (let k = 0; k <= segs; k++) { const a = aA + delta * (k / segs); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  out.push(oB, iBx)
  for (let k = segs; k >= 0; k--) { const a = aA + delta * (k / segs); out.push([cx + rin * Math.cos(a), cy + rin * Math.sin(a)]) }
  out.push(iAx)
  return signedArea(out) >= 0 ? out : out.reverse()
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
export function extractFaces(streets) {
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
  // ⭐ WELD NEAR-COINCIDENT CHAIN ENDPOINTS. A loop body that closes within a few
  // cm — above the 0.1 mm node quantization (Benton 3.2 cm, Saint Vincent 2.2 cm)
  // — would otherwise read as an OPEN chain whose two endpoints are distinct nodes,
  // so its ring never closes and the enclosed interior face never forms.
  // LOOP-STREETS §0/§1: a loop median IS the emergent enclosed face — it only
  // exists if the ring closes. Park Place (gap 0.000) closes on its own and renders
  // right; this gives the near-closed loops the same footing. ENDPOINTS only
  // (mid-chain geometry untouched) within a tolerance well below junction
  // separation, so only true gap artifacts merge — general, so any near-miss
  // endpoint gap closes, not just the named loops.
  const ENDPOINT_SNAP = 0.15   // m
  const endReps = []
  const snapEnd = (p) => {
    for (const q of endReps) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < ENDPOINT_SNAP) return q
    endReps.push(p); return p
  }
  // Pre-register every endpoint so the chosen rep is stable before any edge reads it.
  streets.forEach((s) => { const pts = s?.points; if (pts && pts.length >= 2) { snapEnd(pts[0]); snapEnd(pts[pts.length - 1]) } })
  streets.forEach((s, si) => {
    const pts = s?.points
    if (!pts || pts.length < 2) return
    const last = pts.length - 1
    for (let i = 0; i < last; i++) {
      const A = i === 0 ? snapEnd(pts[0]) : pts[i]
      const B = i === last - 1 ? snapEnd(pts[last]) : pts[i + 1]
      addEdge(A, B, si)
    }
  })
  for (const n of nodes.values()) n.edges.sort((a, b) => a.angle - b.angle)
  // NOTE (2026-06-11): dead-end pendants are NOT pruned. A dead-ending street's
  // out-and-back spur reads as a degenerate (zero-width) face the inward Clipper
  // offset collapses on its own, so the street renders woven with its proper cap
  // (round bulb + ped wrap / flat abut) — verified clean map-wide on the render.
  // A prior pendant-prune (28f8856, now reverted) deleted the dead-ends' footprints
  // (asphalt is tile-sourced) to solve a slit pathology that the forensic + render
  // showed mostly isn't real (HANDOFF-dead-end-spike-prune, bollard). LOOPS are the
  // real enclosed-face case — handled above by the endpoint weld, not by pruning.
  const nextHE = (he) => {
    const out = he.to.edges
    const idx = out.indexOf(he.twin)
    return out[(idx - 1 + out.length) % out.length]
  }
  const faces = []
  for (const h0 of heList) {
    if (h0.used) continue
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
  // most-negative; drop everything with non-positive area. Pendant (dead-end)
  // edges are walked out-and-back inside their surrounding face — they leave a
  // zero-width spur that the inward Clipper offset collapses on its own.
  return faces.filter(f => signedArea(f.ring) > 1e-3)
}

// [D2 — THE PREBAKE FACE FREEZE] Rehydrate the frozen tile topology.
// ribbons.tiles is the prebake artifact (derive.js runs extractFaces once
// over the serialized skeleton chains and freezes per tile the ring +
// per-edge (skelId, side)). Here each frozen edge resolves skelId → the
// CURRENT streets index, so every downstream lookup (measures[streetIdx],
// groupRuns, cornerKeyAt) reads exactly what a live walk would have tagged;
// `forward` is recovered from `side` (forward ⇔ 'right' — the convention
// documented in the walk above, bijective). Rings are copied: the parsed
// artifact arrays live for the session and downstream must never alias them
// across rebuilds. Returns null (caller falls back to the live walk) when
// the artifact carries no tiles (toy / pre-D2 data) or a skelId no longer
// resolves (stale artifact — topology must then be re-frozen, not papered).
export function tilesFromFrozen(frozen, streets) {
  if (!Array.isArray(frozen) || !frozen.length) return null
  const idxBySkelId = new Map()
  streets.forEach((s, i) => {
    const k = s?.skelId || s?.name
    if (k != null && !idxBySkelId.has(k)) idxBySkelId.set(k, i)
  })
  const tiles = []
  for (const t of frozen) {
    const ring = t?.ring, fe = t?.edges
    if (!Array.isArray(ring) || !Array.isArray(fe) || ring.length !== fe.length || ring.length < 3) return null
    const edges = []
    for (const e of fe) {
      const si = idxBySkelId.get(e?.skelId)
      if (si === undefined) return null
      const forward = e.side === 'right'
      edges.push({ streetIdx: si, forward, side: forward ? 'right' : 'left' })
    }
    tiles.push({ ring: ring.map(p => [p[0], p[1]]), edges })
  }
  return tiles
}


// Inboard-side ped zeroing for divided carriageways (anchor='inner-edge'):
// the median-facing side keeps pavement but drops curb/treelawn/sidewalk, so
// the thin tile between the two carriageways floods to a bare median. Mirrors
// streetProfiles.innerEdgeMeasure — the median geometry falls out of honest
// per-side widths + this transform, with no median-construction code.
// RECLAIM guard (D1, mirrors innerEdgeMeasure): left/right keys are
// point-order-relative; a weld that reverses a chain swaps the physical sides
// under the persisted keys. Outer pavementHW 0 with inboard > 0 is an
// impossible road (zero-width carriageway) → the width is misfiled on the
// median key; swap the sides back. Fires only on that impossible state.
function effectiveMeasure(s) {
  const m = s?.measure
  if (!m || s.anchor !== 'inner-edge' || !s.innerSign) return m
  const inboard = s.innerSign === +1 ? 'right' : 'left'
  const outboard = inboard === 'left' ? 'right' : 'left'
  let inb = m[inboard] || {}, out = m[outboard] || {}
  if (!(out.pavementHW > 0) && inb.pavementHW > 0) { const t = out; out = inb; inb = t }
  return { ...m, [outboard]: out, [inboard]: { ...inb, treelawn: 0, sidewalk: 0 } }
}
// (isMedianFacing + the G3a >40%-median-facing tile heuristic retired at E2 —
// the median is now a CONSTRUCTED polygon frozen at prebake (ribbons.medians,
// kind:'median', DIVIDED-CORRIDOR-PLAN §4.2); median tiles are detected by
// IDENTITY against it in the shape loop below.)

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

// ── Best-effort first fill (SECTION.md §3.1) ───────────────────────────────
// The default ped cross-section before any authoring. The system needs only two
// things per edge: treelawn Y/N + strip depths (ADA). Treelawn Y/N is GLEANED,
// not guessed: `measure.treelawn` is the surveyed "natural gap" (centerline→
// sidewalk minus the asphalt+curb), and its LS distribution is cleanly bimodal
// (~391 edges ≈0 = N · ~508 ≥0.75m = Y · ~50 in the 0.25–0.75 valley). Threshold
// the gap → Y/N for ~95% of edges; the strips then default to ADA-standard depths
// (also the Revert state). This replaces the old per-tile AVERAGED measures, which
// drew noisy sub-meter treelawn slivers everywhere.
const TREELAWN_YN_THRESHOLD = 0.6   // natural gap below this → no treelawn (the bimodal valley)
const STD_TREELAWN = 1.5            // standard treelawn depth where present (m) — tunable
const ADA_SIDEWALK = 1.5            // ADA-standard sidewalk depth — the Revert default (m) — tunable
const gleanTreelawn = (measure, side) =>
  Math.max(0, Number.isFinite(measure?.[side]?.treelawn) ? measure[side].treelawn : 0) >= TREELAWN_YN_THRESHOLD

// ⭐ THE ONE PER-EDGE DEPTH RESOLUTION (SECTION.md §3.3 step 1 / §5 one-depth-truth).
// override (blockCustoms[skelId][side][segOrd].{treelawn,sidewalk}) else the
// best-effort default (gleaned-Y ? STD_TREELAWN : 0; ADA_SIDEWALK). Exported so
// the FILL stroke (sectionPass) and the authoring-handle placement (Measure
// overlay) read the SAME resolution — if they read different depths they
// diverge, which was the root of both handle symptoms (don't match + don't
// respond). Pure data-in/data-out: no chain handle, the wall holds.
// ⭐ MONO-WIDTH, STRIPS SWAP — NOT COLLAPSE (Jacob 2026-06-10). The ribbon is two
// strips of EQUAL width; the gleaned treelawn Y/N is a MATERIAL decision (which
// strip is grass vs walk), NOT a width. A sidewalk-only edge is "sidewalk then
// LU/lawn" — the strips swap materials, they never collapse one to zero. So BOTH
// widths default to the same standard (STD_TREELAWN == ADA_SIDEWALK), and the
// ribbon total is uniform whether the edge is Y or N. `hasTL` carries the
// surveyed Y/N to drive the strip ORDERING / default materials downstream.
export function resolvePedDepths(baseMeasure, side, custom = null) {
  const tl = Number.isFinite(custom?.treelawn) ? Math.max(0, custom.treelawn) : STD_TREELAWN
  const sw = Number.isFinite(custom?.sidewalk) ? Math.max(0, custom.sidewalk) : ADA_SIDEWALK
  return { tl, sw, hasTL: gleanTreelawn(baseMeasure, side) }
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
export function sectionPass(shapeTiles, cw, stripMat, blockCustoms = null) {
  // PROTOTYPE C (env-gated, off in the browser): slope the SW↔(TL|SW) corner
  // treelawn band. Keys on the RESOLVED outer material (e.mat.outer) so a flipped
  // strip moves the taper too; the FILL re-strokes on blockCustoms change.
  const Wacc = [], tlByLu = {}, luByLu = {}
  // Per-edge OVERRIDE read (SECTION.md §3.2/§3.3): blockCustoms[skelId][side][segOrd]
  // keyed by the FROZEN run identity — design intent, NOT chain geometry, so the
  // wall holds. Carries the depth override (.treelawn/.sidewalk → resolvePedDepths)
  // and the material override (.materials over the §3.1 ordering default).
  const runCustom = (run) => blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null
  for (const st of shapeTiles) {
    const { ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, runs } = st
    const fillets = st.fillets || []   // achieved curb arcs → the bent-corner sectors
    // Tolerate the serialized artifact: roundTipKeys is a Set in-memory, an array
    // when loaded from shape.json (Phase D). Either way → a Set for `.has`.
    const roundTipKeys = st.roundTipKeys instanceof Set ? st.roundTipKeys : new Set(st.roundTipKeys)
    const roundTipByKey = new Map(roundTips.map(t => [tipKey(t.p), t]))
    // Blunt dead-end tips: like round tips, they are NOT junction corners — the
    // curb caps flat at the tip node, so the leg must run TO the tip (no e.a+R
    // junction pullback) and bid NO corner pad. Without this the band squares off
    // ~e.a short of the cap ("the corner slides down the arm"). G8 (below) then
    // abuts LU to the flat end.
    const bluntTipKeys = new Set((bluntTips || []).map(t => tipKey(t.p)))
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
    // Median tile: the shape pass froze ped at zero (tl = sw = 0) — no per-edge
    // resolution can re-grow strips into the median.
    const pedOff = (tl + sw) <= 1e-6
    // ── §3.3 step 1 · per-edge resolution ──
    // One resolved depth pair per qualifying run (the one-depth-truth wire —
    // resolvePedDepths, shared with the handle placement), plus the §3.1 strip
    // ORDERING (two strips always): treelawn-Y reads TL→SW→LU off the curb;
    // treelawn-N reads SW→TL→LU (the walk hugs the curb; the TL slot is 0-deep
    // until authored). Materials default by that ordering through stripMat
    // ({outer:'LU', inner:'SW'} = TL-position LU / SW-position SW), then the
    // per-edge .materials override (§3.2) flips slots; both-LU = open field.
    const rr = []
    for (const run of runs) {
      const aBase = edgeDepth(run.baseMeasure, run.side, cw, 'A')   // base asphalt edge (grout)
      if (aBase <= 1e-6) continue                                   // median-facing / no street → no ped
      const c = runCustom(run)
      const ped = pedOff ? { tl: 0, sw: 0, hasTL: false } : resolvePedDepths(run.baseMeasure, run.side, c)
      const o = ped.hasTL ? ped.tl : ped.sw                         // outer (curb-side) strip depth
      const inn = ped.hasTL ? ped.sw : ped.tl                       // inner strip depth
      const defMat = ped.hasTL
        ? { outer: stripMat.outer, inner: stripMat.inner }          // TL→SW (Y ordering)
        : { outer: stripMat.inner, inner: stripMat.outer }          // SW→TL (N ordering)
      const cm = c?.materials
      const mat = cm
        ? { outer: cm.outer === 'SW' ? 'SW' : 'LU', inner: cm.inner === 'LU' ? 'LU' : 'SW' }
        : defMat
      const a = edgeDepth(run.measure, run.side, cw, 'A')   // per-fe asphalt edge, frozen (trim follows it)
      rr.push({ run, aBase, a, hasTL: ped.hasTL, tlD: ped.tl, swD: ped.sw, o, inn, total: o + inn, mat })
    }
    // Peel treelawn-Y runs first: where two legs' slabs graze near a corner the
    // treelawn claims the overlap (matching the old zone-union semantics — the
    // grass ends at its tangent, the walk yields).
    rr.sort((x, y) => (y.hasTL ? 1 : 0) - (x.hasTL ? 1 : 0))
    // THROUGH-NODE detection (the continuous side of a T must not split). The
    // [THRU] station split breaks one street's frontage into two runs that meet
    // at the node; both being trimmed back by e.a+R opens a gap in the band and
    // each bids a spurious corner. A vertex where two run-ENDS of the SAME
    // skelId+SIDE meet is exactly that continuation (a real corner joins
    // DIFFERENT streets; an authored bend stays one run; a dead-end tip is
    // same-skelId but DIFFERENT side, handled by `tipped`) — there, bid no
    // corner and don't trim.
    const endSkelCount = new Map()   // tipKey(end) → Map(skelId|side → #run-ends)
    for (const e of rr) {
      const last = e.run.poly[e.run.poly.length - 1]
      for (const p of [e.run.poly[0], last]) {
        const k = tipKey(p), key = `${e.run.skelId}|${e.run.side}`
        let m = endSkelCount.get(k); if (!m) { m = new Map(); endSkelCount.set(k, m) }
        m.set(key, (m.get(key) || 0) + 1)
      }
    }
    const isThrough = (p, run) => (endSkelCount.get(tipKey(p))?.get(`${run.skelId}|${run.side}`) || 0) >= 2
    // ── §3.3 step 2 · THE MONO-WIDTH BAND (sacrosanct — RIBBONS §3.9a) ──
    // ONE uniform outer depth per tile: WB = cw + max(TL) + max(SW) over the
    // tile's edges, floored at the frozen tile depths so an unauthored tile
    // reproduces the frozen geometry exactly. All per-edge variation below is
    // SLICING inside this band — the uniform offsets are never re-architected.
    let TLmax = tl, SWmax = sw
    for (const e of rr) { if (e.tlD > TLmax) TLmax = e.tlD; if (e.swD > SWmax) SWmax = e.swD }
    // Concentric ring at ped depth d off the frozen iA (cap-clamped, shared
    // join) — cached per distinct depth, so the default tile costs the same
    // three offsets as ever and an authored depth adds one. EVERY depth bound
    // below is one of these rings: the divider stays concentric to the frozen
    // curb (a slice of the band), never a centerline-datum slab edge.
    const offCache = new Map()
    const ringAt = (d) => {
      const key = Math.min(cw + d, cap)
      let r = offCache.get(key)
      if (!r) { r = offsetRings(iA, -key, bandJoin); offCache.set(key, r) }
      return r
    }
    const iC = ringAt(0)                  // curb inner (R+cw)
    const iW = ringAt(TLmax + SWmax)      // band inner (R+WB)
    const fullBand = differenceRings(iC, iW)   // the whole ribbon, cw → WB
    const SECTOR_D = TLmax + SWmax + 2    // sector slabs always out-reach the band
    // Single closed run (a loop interior): the strips are whole concentric
    // annuli at that one edge's depths — no corners, no slicing.
    const single = (runs.length === 1 && rr.length) ? rr[0] : null
    // G5 — ADA corner ramp (structural; live home SECTION §6, archeology _archive/RIBBONS-history §6.9): the corner IS the curb
    // ramp → an all-SW slice of the SAME fullBand from tangent to tangent;
    // treelawn lives only on the straight legs and ends at the tangents. Each
    // run is pulled back from its corner ends by (asphalt-hw + that corner's
    // resolved R) so its slabs end at the tangent; the uncovered corner wedge
    // becomes the bent pad below.
    const pieces = []        // leg strips: { mat, rings }
    const luExtra = []       // authored-shallower band residual along legs → LU
    const cornerT = new Map()   // corner vertex → { p, T: max-adjacent ped total, trim }
    let bandRem = fullBand
    if (single) {
      const iMid = ringAt(single.o)
      const iWrun = ringAt(single.total)
      pieces.push({ mat: single.mat.outer, rings: differenceRings(iC, iMid) })
      pieces.push({ mat: single.mat.inner, rings: differenceRings(iMid, iWrun) })
      bandRem = differenceRings(iWrun, iW)   // authored-shallower residual → LU
    } else {
      // Group legs by identical (depths, materials) and peel ONCE per group —
      // a default tile has 1-2 groups (Y, N), so the live re-stroke costs what
      // the old uniform construction did; an authored depth adds one group.
      const groups = new Map()
      for (const e of rr) {
        const { run } = e
        const last = run.poly[run.poly.length - 1]
        const ends = [[run.poly[0], tipKey(run.poly[0])], [last, tipKey(last)]]
        // round OR blunt — both are dead-end tips, not junction corners (no
        // corner bid, no junction trim); the round-cap circle below stays
        // round-only (guarded by roundTipByKey.get).
        const tipped = ends.map(([, k]) => roundTipKeys.has(k) || bluntTipKeys.has(k))
        // §3.3 step 3 — corner depth = cw + MAX-ADJACENT: each non-tip run end
        // bids its own ped total at its corner vertex; the bent pad takes the
        // deeper of the two adjacent legs (SW↔SW corner → sidewalk-deep).
        const through = ends.map(([p]) => isThrough(p, run))
        // Per-leg corner input: the treelawn-OUTER depth (0 if the outer strip is
        // SW), used as the slide distance on a set-back leg. Reads the RESOLVED
        // material so per-edge strip flips carry through.
        const tloThis = e.mat.outer === 'LU' ? e.o : 0
        const nP = run.poly.length
        const legDirAt = (i) => { const a = i === 0 ? run.poly[0] : run.poly[nP - 1]; const b = i === 0 ? run.poly[1] : run.poly[nP - 2]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] }
        // EXACT trim — the along-leg distance from the node to where the curb
        // fillet's TANGENT begins, so the leg strips end PRECISELY at the corner
        // arc (no cream step / green sliver). dot(tangent − node, legDir) reads the
        // frozen fillet directly; falls back to the e.a+R approximation only when
        // no fillet rounds this corner. Tips / through-continuations → 0.
        const tangentTrim = (p, dir) => {
          let best = null, bestD = Infinity
          for (const f of fillets) { const d = Math.hypot(f.apex[0] - p[0], f.apex[1] - p[1]); if (d < bestD) { bestD = d; best = f } }
          if (!best || bestD > best.r + e.a + 4) return e.a + nearestVertR(p, ring, vertR)
          const proj = (t) => (t[0] - p[0]) * dir[0] + (t[1] - p[1]) * dir[1]
          return Math.max(0, Math.max(proj(best.tA), proj(best.tB)))
        }
        const legTrim = ends.map(([p], i) => (tipped[i] || through[i]) ? 0 : tangentTrim(p, legDirAt(i)))
        ends.forEach(([p, k], i) => {
          if (tipped[i] || through[i]) return   // tip or T-continuation → no corner bid
          // conD = how deep the ramp CONCRETE runs before LU on this leg: a
          // set-back sidewalk (mat.inner === 'SW', a treelawn-Y leg) → the full
          // total; a curb-side sidewalk (SW leg) → its one strip width.
          const conD = e.mat.inner === 'SW' ? e.total : e.o
          const leg = { dir: legDirAt(i), tlo: tloThis, conD }
          const prev = cornerT.get(k)
          if (!prev) cornerT.set(k, { p, T: e.total, trim: legTrim[i], legs: [leg] })
          else { if (e.total > prev.T) prev.T = e.total; if (legTrim[i] > prev.trim) prev.trim = legTrim[i]; prev.legs.push(leg) }
        })
        const t0 = legTrim[0]
        const t1 = legTrim[1]
        const poly = trimPolyline(run.poly, t0, t1)
        if (!poly || poly.length < 2) continue
        // This leg's claim SECTOR: a constant-depth slab (butt-capped at the
        // tangents, same construction as the asphalt strokes) that out-reaches
        // the band. The depth split inside the claim uses the CONCENTRIC rings
        // (ringAt) — the divider is a slice of the band at cw + this edge's
        // outer depth, the §3.3 per-edge divider inside the mono-width.
        const sector = strokeOpen(poly, e.aBase + cw + SECTOR_D)
        // A ROUND dead-end cap is NOT an ADA corner: the ped wraps the cap (iA
        // is the cap disk there, so the concentric rings follow it). The disk
        // just extends this leg's claim around the cap; the depths stay rings.
        ends.forEach(([p, k], i) => {
          if (!tipped[i]) return
          const t = roundTipByKey.get(k)
          if (t) sector.push(circlePoly(p[0], p[1], t.hw + cw + SECTOR_D))
        })
        if (!sector.length) continue
        const gk = `${e.o.toFixed(4)}|${e.total.toFixed(4)}|${e.mat.outer}|${e.mat.inner}`
        let g = groups.get(gk)
        if (!g) { g = { o: e.o, inn: e.inn, total: e.total, mat: e.mat, hasTL: e.hasTL, sectors: [] }; groups.set(gk, g) }
        g.sectors.push(...sector)
      }
      // Peel treelawn-Y groups first (rr is Y-sorted, but make it explicit):
      // where two legs' sectors graze near a corner the treelawn claims the
      // overlap — the grass ends at its tangent, the walk yields.
      const ordered = [...groups.values()].sort((x, y) => (y.hasTL ? 1 : 0) - (x.hasTL ? 1 : 0) || y.total - x.total)
      for (const g of ordered) {
        const claim = intersectRings(bandRem, g.sectors)
        bandRem = differenceRings(bandRem, g.sectors)
        if (!claim.length) continue
        const oRing = ringAt(g.o)        // divider at this group's outer depth
        const wRing = ringAt(g.total)    // this group's band inner
        const outerStrip = g.o > 1e-6 ? differenceRings(claim, oRing) : []
        const innerStrip = g.inn > 1e-6 ? differenceRings(intersectRings(claim, oRing), wRing) : []
        if (outerStrip.length) pieces.push({ mat: g.mat.outer, rings: outerStrip })
        if (innerStrip.length) pieces.push({ mat: g.mat.inner, rings: innerStrip })
        // deeper-than-this-group's-total band within the claim → LU (the §3.1
        // remainder flows to the block center; no hard property line)
        if (g.total < TLmax + SWmax - 1e-9) luExtra.push(...intersectRings(claim, wRing))
      }
    }
    // ── §3.3 steps 3+4 · the bent corner = a SLICE of the fullBand ──
    // Never a constructed primitive: the pad is the un-zoned band, bent around
    // the curb arc as an annular SECTOR (RIBBONS §3.9a step 10) — outer edge the
    // curb arc, inner edge its concentric offset, sides the two tangent radii —
    // bounded inward at the deeper adjacent leg's total (cw + c.T), so an SW↔SW
    // corner comes out sidewalk-deep and a TL-adjacent corner full-depth. The
    // arc comes from the FROZEN fillet the curb actually rounded here; a corner
    // with no fillet (R=0 / sharp) has no arc to bend — the legs meet at a miter.
    const sectorDepth = cw + TLmax + SWmax + 2   // the sector inner clears the band bottom (iW)
    let cornerPad = []
    const cornerTreelawn = []   // corner LU strips (SW↔SW inner) + ramp wedges → tlByLu[lu]
    const swCarve = []          // Idea A — LU wedges to carve from the deep leg's SW strip
    if (bandRem.length && cornerT.size && fillets.length) {
      const shallowByT = new Map()   // distinct depth → band region above it (one offset per depth)
      for (const [, c] of cornerT) {
        if (c.T <= 1e-6) continue
        // Pair this corner with the arc the curb rounded here (nearest fillet
        // apex → the sharp node). No nearby fillet ⇒ a sharp R=0 corner: skip,
        // the legs already meet at the miter with no wedge to slice.
        let best = null, bestD = Infinity
        for (const f of fillets) { const d = Math.hypot(f.apex[0] - c.p[0], f.apex[1] - c.p[1]); if (d < bestD) { bestD = d; best = f } }
        if (!best || bestD > best.r + c.trim + 1) continue
        let shallow = shallowByT.get(c.T)
        if (!shallow) {
          shallow = (c.T >= TLmax + SWmax - 1e-9)
            ? bandRem
            : differenceRings(bandRem, ringAt(c.T))
          shallowByT.set(c.T, shallow)
        }
        // margin = c.trim (asphalt-hw + R) extends the sector up each leg to the
        // leg slab's pulled-back end, closing the leg↔corner seam (the LU notch).
        const sector = arcSectorPoly(best.C, best.r, best.tA, best.tB, sectorDepth, c.trim)
        const pad = intersectRings(shallow, [sector])
        if (!pad.length) continue
        // ── Idea A: CONCENTRIC arc at the shallow (ADA) depth; ramp the deep leg ──
        // The corner arc is a clean concentric ring at cMin = min(both legs'
        // concrete depths). The DEEPER leg's set-back sidewalk SLIDES to the curb
        // over a short ramp on its own straight leg (the treelawn tapering out, the
        // walk's deep tail becoming parcel) — so the arc reads concentric and the
        // transition lives on the leg, where a real curb ramp puts it.
        let concrete = pad, luInner = []
        if (c.legs?.length === 2) {
          const ap = best.apex
          const dot = (u, v) => u[0] * v[0] + u[1] * v[1]
          const aFirst = dot(c.legs[0].dir, [best.tA[0] - ap[0], best.tA[1] - ap[1]]) >= dot(c.legs[1].dir, [best.tA[0] - ap[0], best.tA[1] - ap[1]])
          const legA = aFirst ? c.legs[0] : c.legs[1]      // the tA leg
          const legB = aFirst ? c.legs[1] : c.legs[0]      // the tB leg
          const cMin = Math.min(legA.conD, legB.conD)
          // concentric ring at cMin → the arc is a constant-offset band
          if (cMin < c.T - 1e-6) {
            const ring = ringAt(cMin)
            concrete = differenceRings(pad, ring)
            luInner = intersectRings(pad, ring)
          }
          // slide the deeper leg's walk to the curb over a ramp on that leg
          const deep = legA.conD >= legB.conD ? legA : legB
          const T = legA.conD >= legB.conD ? best.tA : best.tB
          if (deep.conD > cMin + 1e-6) {
            const perp = (() => { const dx = best.C[0] - T[0], dy = best.C[1] - T[1]; const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] })()
            const dir = deep.dir
            const tloD = deep.tlo                           // treelawn width on the deep leg (the slide distance)
            const conMax = deep.conD
            const rampLen = Math.max(2, (conMax - cMin) * 2)
            const pt = (s, d) => [T[0] + dir[0] * s + perp[0] * (cw + d), T[1] + dir[1] * s + perp[1] * (cw + d)]
            // the slid walk: [0,cMin] at the tangent → [tloD,conMax] up the leg (concrete, covers the tapering treelawn)
            const slidQuad = [pt(0, 0), pt(rampLen, tloD), pt(rampLen, conMax), pt(0, cMin)]
            cornerPad.push(...intersectRings(fullBand, [slidQuad]))
            // the walk's deep tail near the tangent → LU (carved from the SW strip below)
            const luWedge = [pt(0, cMin), pt(0, conMax), pt(rampLen, conMax)]
            const w = intersectRings(fullBand, [luWedge])
            if (w.length) { cornerTreelawn.push(...w); swCarve.push(...w) }
          }
        }
        cornerPad.push(...concrete)
        if (luInner.length) cornerTreelawn.push(...luInner)   // inner LU → parcel-matched (tlByLu[lu])
      }
    }
    // Whatever the legs + pads didn't claim flows to LU — the remainder runs
    // curb → block-center (§3.3: no hard property line; both-strips-LU = open
    // field falls out for free).
    let luRemainder = unionRings([...iW, ...luExtra, ...differenceRings(bandRem, cornerPad)])
    // G8 — at a blunt/none dead-end the street just ends FLAT. The side
    // treelawn/sidewalk run TO the end (the concentric rings already follow the
    // blunt cap in iA), and the band caps flat across the end. The earlier
    // full-width tip-DISK subtraction was wrong (Jacob 2026-06-11): it scooped a
    // circular bite out of the SIDE bands, leaving them pointy + short of the end.
    // Nothing to subtract — the bands run to the end by construction.
    // G8 round-tip cleanup — a cul-de-sac cap is road + ped wrap, NEVER land use.
    // The zero-width pendant spur leaves a thin LU sliver up the stub centerline
    // that pokes into the cap; reclaim it. But reclaim ONLY the sliver INSIDE the
    // ped band (within iC), NOT the LU beyond the band — the old cap-radius reclaim
    // (hw+cw+tl+sw+1) swept the legitimate beyond-band LU into the sidewalk too,
    // ballooning the bulb into a fat all-sidewalk pad (Jacob 2026-06-11). Clipping
    // the reclaim to fullBand keeps the wrap at the regular treelawn+sidewalk width.
    if (roundTips.length) {
      const caps = roundTips.map(t => circlePoly(t.p[0], t.p[1], t.hw + cw + t.tl + t.sw + 1))
      const stray = intersectRings(intersectRings(luRemainder, caps), fullBand)
      if (stray.length) {
        luRemainder = differenceRings(luRemainder, stray)
        cornerPad = unionRings([...cornerPad, ...stray])
      }
    }
    // Route the leg strips by their per-edge materials ('LU' → the tile's
    // land-use colour, 'SW' → the sidewalk material); the corner pad is always
    // SW (the ADA ramp — structural, regardless of leg ordering/overrides).
    for (const pc of pieces) {
      if (!pc.rings.length) continue
      if (pc.mat === 'SW' && swCarve.length) pc.rings = differenceRings(pc.rings, swCarve)   // Idea A — the deep walk's tail slid to LU
      if (!pc.rings.length) continue
      if (pc.mat === 'SW') Wacc.push(...pc.rings)
      else pushLu(tlByLu, lu, pc.rings)
    }
    Wacc.push(...cornerPad)
    if (cornerTreelawn.length) pushLu(tlByLu, lu, cornerTreelawn)   // PROTOTYPE C — tapered corner treelawn
    // E2 — the constructed median paints positively: route this tile's frozen
    // median region (med, clipped at the shape pass) to the 'median' class and
    // keep it out of the parcel-LU remainder. Covers both the true median tile
    // (whole interior → bare median ground) and a block face that absorbed
    // median area through a one-sided junction (it stops mis-painting as the
    // block's parcel LU — the Truman drop-off/pill class).
    if (st.med?.length) {
      const medGround = intersectRings(luRemainder, st.med)
      if (medGround.length) {
        luRemainder = differenceRings(luRemainder, st.med)
        pushLu(luByLu, 'median', medGround)
      }
    }
    pushLu(luByLu, lu, luRemainder)                 // land-use remainder (per class)
  }
  return { Wacc, tlByLu, luByLu }
}

// ── THE WALL · Phase D · sectionOpen ───────────────────────────────────────
// Section OPENS the frozen artifact: compose the whole Section ground render
// off shapeTiles ALONE — block silhouette (the frozen iA), curb stroke
// (iA − iC), asphalt silhouette (ring − iA), and the ped FILL via sectionPass.
// Same chain-free contract as sectionPass: parameters carry only the artifact
// + design params (cw, stripMat, an optional boundary stencil polygon) — there
// is NO handle on streets / chains / measures / ribbons, so a Section surface
// rendering through here physically cannot re-derive the shape. The per-tile
// compositions mirror the shape loop's emit lines (Aacc / Cacc / blockRaw in
// buildTileGround) but read ONLY frozen fields — buildTileGround never runs.
// Accepts shapeTiles built in-memory OR loaded from shape.json (sectionPass
// already tolerates the serialized roundTipKeys array).
export function sectionOpen(shapeTiles, cw, stripMat = { outer: 'LU', inner: 'SW' }, stencil = null, blockCustoms = null) {
  const { Wacc, tlByLu, luByLu } = sectionPass(shapeTiles, cw, stripMat, blockCustoms)
  const Aacc = [], Cacc = [], blockRaw = []
  for (const st of shapeTiles) {
    const iA = st.iA || []
    const bandJoin = st.bandJoin || 'miter'
    const cap = Number.isFinite(st.cap) ? st.cap : (cw + (st.tl || 0) + (st.sw || 0))
    Aacc.push(...differenceRings([st.ring], iA))                                      // asphalt = tile − rounded inner
    Cacc.push(...differenceRings(iA, offsetRings(iA, -Math.min(cw, cap), bandJoin)))  // curb = iA − iC (frozen join + cap)
    blockRaw.push(...iA)                                                              // block silhouette = the frozen curb ring
  }
  const clip = (rings) => (stencil && stencil.length >= 3) ? intersectRings(rings, [stencil]) : rings
  const treelawnByLu = {}, luByClass = {}
  for (const k of Object.keys(tlByLu)) treelawnByLu[k] = clip(unionRings(tlByLu[k]))
  for (const k of Object.keys(luByLu)) luByClass[k]   = clip(unionRings(luByLu[k]))
  return {
    asphalt:  clip(unionRings(Aacc)),
    curb:     clip(unionRings(Cacc)),
    sidewalk: clip(unionRings(Wacc)),
    treelawnByLu, luByClass,
    block:    clip(blockRaw),
  }
}

export function buildTileGround(ribbons, opts = {}) {
  const curbWidth = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH
  const stencil = opts.stencil && opts.stencil.length >= 3 ? opts.stencil : null
  // Smooth centerlines BEFORE face extraction so the grout (shared tile edges)
  // → tiles → strips all come out smooth — loops/curves round. smoothChain is
  // INTERPOLATING (passes through every authored vertex), so intersection
  // nodes survive exactly and the graph stays noded for the face walk. Default
  // 0.5 matches the figure-ground path + the store default (WYSIWYG).
  const smooth = Number.isFinite(opts.smooth) ? opts.smooth : 0
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
  // Junction nodes = coords shared by ≥2 streets. The smoother must keep these
  // HARD (not round the centerline through an intersection) or the inward ped
  // band notches on the far side — the "thorn opposite a T" / complex-IX corner.
  // Built over ALL ribbon streets so a shared node is seen even if one incident
  // street is grade-separated; matched by jKey (0.01 m).
  const coordStreets = new Map()
  for (const s of (ribbons?.streets || [])) {
    if (!s?.points) continue
    for (const p of s.points) {
      const k = jKey(p[0], p[1])
      let set = coordStreets.get(k); if (!set) { set = new Set(); coordStreets.set(k, set) }
      set.add(s)
    }
  }
  const junctionKeys = new Set()
  for (const [k, set] of coordStreets) if (set.size >= 2) junctionKeys.add(k)
  if (smooth > 0) {
    streets = streets.map(s => {
      const sm = smoothChain(s.points, smooth, undefined, junctionKeys)
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
  // Per-fe width at a (chain, side, segOrd) — mirrors runMeasure (blockCustoms
  // pavementHW over the effective per-chain base). Shared by the E3.2 window
  // construction and the through-node construction below.
  const feWidthAt = (idx, side, segOrd) => {
    const base = Math.max(0, measures[idx]?.[side]?.pavementHW || 0)
    if (!blockCustoms) return base
    const so = streetsOrig[idx]
    const sk = (so && (so.skelId || so.name)) || null
    const c = sk ? blockCustoms[sk]?.[side]?.[segOrd] : null
    return (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
  }
  const segOrdAtEnd = (idx, end) => end === 'start' ? 0 : (ixIdxsByStreet?.[idx] || []).length
  const segOrdAtVertex = (idx, lower) => { let so = 0; for (const i of (ixIdxsByStreet?.[idx] || [])) if (i <= lower) so++; return so }
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
  // T3 — the authoritative, INJECTIVE corner set the Survey corner-handle rides
  // (one corner truth). One entry per SHARP tile-ring corner, keyed identically
  // to `cornerKeyAt` (= the write-path key `resolveVertR` reads overrides off),
  // each carrying its resolved radius + the fSink arc that rounds THIS corner
  // (or null when R=0 / unfilleted). Sourced here, not off `ribbons.intersections`
  // (the legacy raw-OSM list the render no longer matches) — so every drawn
  // corner gets a handle. See HANDOFF-tile-T3-corner-handles.md.
  const cornerSet = []
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
      // Best-effort fill (SECTION.md §3.1): the dead-end tip's ped wrap uses the
      // STANDARD model too (treelawn Y/N × ADA), so the cap wrap (sectionPass)
      // matches the straight-section bands. (The round-cap FILL bug — ② — is the
      // wrap geometry, separate from these depths.)
      const tlw = (gleanTreelawn(m, 'left') || gleanTreelawn(m, 'right')) ? STD_TREELAWN : 0
      const sww = ADA_SIDEWALK
      deadEndTips.set(tipKey(pts[idx]), { cap, hw, tl: tlw, sw: sww, px: pts[idx][0], py: pts[idx][1] })
    }
  }

  // [D2] Consume the FROZEN tile topology (prebake artifact) instead of
  // re-walking the chain graph per build; extractFaces stays as the fallback
  // for artifacts that carry no tiles (toy / pre-D2). SMOOTHING WRINKLE
  // (PREBAKE-POLYGONIZATION-PLAN §1, decided): the frozen topology is
  // UNSMOOTHED. Render-time smoothing is retired (smooth=0 everywhere since
  // 2026-06-04 — see streetSmooth above); if the dormant smooth>0 knob is
  // ever revived, smoothed geometry belongs at reshape over the frozen
  // rings' edge runs (the D5 reshape) — until then a smooth>0 call falls
  // back to the live walk over the smoothed streets, so the dormant knob's
  // semantics stay bit-for-bit what they were (rings AND strokes smoothed
  // together, never mixed).
  const tiles = (smooth > 0 ? null : tilesFromFrozen(ribbons?.tiles, streets)) || extractFaces(streets)

  // E2 — the CONSTRUCTED medians (prebake artifact: ribbons.medians[]; the
  // divided pair's inter-chain lens partitioned into kind:'median' segments +
  // kind:'merge' asphalt patches — transition tapers and crossing windows,
  // DIVIDED-CORRIDOR-PLAN §4.2/§4.4). Both are positive identity-carrying
  // objects, not leftover faces: merge patches fill as asphalt in WHATEVER
  // tile they land (the taper needle, the divided×divided crossing box — the
  // pill class — die here); median segments paint as median ground via
  // sectionPass, even in a block face that absorbed median area through a
  // one-sided junction (TRUMAN-FORENSICS addendum). bbox-prefiltered per tile.
  const ringBBox = (r) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
    return [x0, y0, x1, y1]
  }
  // [E3.2] When the junction map is consumed, a median fragment ABSORBED by a
  // node's apron (m.absorbedBy — the 69 m² S-18th nose piece) stops painting
  // as median: its ring rides the apron as junction asphalt instead (the trim
  // E3.1 specified). Without a junctionMap (toy / old data) nothing changes.
  const consumeJM = !!(ribbons?.junctionMap?.nodes?.length)
  const collectKind = (kind, excludeAbsorbed) => {
    const polys = (ribbons?.medians || [])
      .filter(m => m?.kind === kind && !(excludeAbsorbed && m.absorbedBy) && Array.isArray(m.ring) && m.ring.length >= 3)
      .map(m => m.ring)
    const boxes = polys.map(ringBBox)
    return (tileRing) => {
      if (!polys.length) return []
      const tb = ringBBox(tileRing)
      const cand = polys.filter((_, i) => {
        const mb = boxes[i]
        return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1]
      })
      return cand.length ? intersectRings(cand, [tileRing]) : []
    }
  }
  const medianClipFor = collectKind('median', consumeJM)
  const mergeClipFor = collectKind('merge', false)

  // ── [E3.2] THE JUNCTION CONSTRUCTION — consume ribbons.junctionMap by
  // identity (the E2 pattern; JUNCTION-CURE-PLAN §3/§6, SKELETON.md §5e).
  // The junction silhouette was never constructed: independent constant-width
  // butt-capped run strokes meet at the node, so every width discontinuity
  // manufactures spurious geometry (step / dip / scoop / tooth / spur). Per
  // CONTINUITY PAIR the prebake stamped, the curb is ONE physical curb through
  // the node; here the shape pass constructs it:
  //   1. The stroked run polyline is TRIMMED back by a window W from the node
  //      (the E3.1 de-taper nose for a tapering carriageway end — the straight
  //      body ends there; a short blend window for un-tapered joins).
  //   2. A WINDOW POLYGON replaces the emergent coverage in the window: chain
  //      seam (window-start → node) → node → X → the constructed curb back to
  //      the window-start curb point. X is the pair's SHARED curb point at the
  //      node, so the two halves weld — no step, the width transitions
  //      monotonically across the window (correct datums degenerate it to a
  //      straight line; datum repair itself is E3.4).
  //   3. ONE APRON per node (the junctionMap's apron spec): a fan of the legs'
  //      curb points around the node, positively asphalt — kills the deg-6
  //      inter-pair slivers and the zero-width chain-retrace spurs. A median
  //      fragment the apron absorbed (absorbsMedians) rides it as asphalt
  //      (the S-18th 69 m² trim).
  // Everything lands in aFill via the same bbox-filtered per-tile clip the E2
  // merge patches use. No junctionMap (toy / old data) → no-op by construction.
  const k3 = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
  const jPolys = []           // window polys + aprons + absorbed median rings
  const jTrims = new Map()    // `${skelId}|${side}|${k3(runEndpoint)}` → trim distance
  // The PERIMETER variant: streets outside the tile network are filled by the
  // G9 perimeter pass (max-side widths, whole-chain butt-capped strokes) — the
  // same emergent-junction defect at a second construction site (the north
  // Lafayette curb, mark #2, lives there). Same windows, but the constructed
  // curb uses the perimeter's width datum (max side): additive window polys +
  // per-chain keep-out cuts (a whole-chain stroke can't be run-trimmed). The
  // perimeter clip keeps these out of tile territory and vice versa.
  const jPerimPolys = []      // perimeter-datum window polys
  const jPerimCuts = new Map()// skelId → keep-out quads (cut from that chain's perimeter stroke only)
  // ── [E3.3] THE CORNER IDENTITIES — consume ribbons.junctionMap corners
  // (SKELETON.md §5e: the corner-builder cornered the WRONG LEGS — a
  // carriageway STUB rounded against the cross street instead of the
  // corridor's clean outer-edge legs). Per stamped stub with an identified
  // outer side, the corner is CONSTRUCTED from the identified curb LINES
  // (the as-built E3.2 window curb where one exists, else the de-tapered
  // body ⊕ per-fe width — the same probe the E3.2 windows use): the
  // keep-out quadrant beyond BOTH lines at their intersection P (the true
  // corner) is asserted BLOCK before the constructed coverage unions in, so
  // the stub's diagonal curl stroke can never invade the corner again (the
  // false-corner class). filletRing then rounds the corner that falls out
  // at P — both legs ARE the identified outer legs, so the fillet corners
  // the right legs by construction. A pairing whose P lies outside a line's
  // physically-valid span is a PHANTOM (the leg doesn't reach that
  // quadrant) and is skipped — those corners stay emergent, exactly as
  // today. Nodes without junctionMap stamps are untouched.
  const jCornerCuts = []
  if (consumeJM) {
    const jm = ribbons.junctionMap
    const idxBySkel = new Map(streets.map((s, i) => [(s.skelId || s.name), i]))
    const nrm = (x, z) => { const L = Math.hypot(x, z) || 1; return [x / L, z / L] }
    const sidePerp = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]   // measure convention: right = (-dz,dx) of point order
    const chainLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L }
    // Walk `dist` inward from the chain's `end` endpoint. Returns the seam
    // (endpoint → window-start, the chain's own vertices), the window-start
    // point ws, the inward unit tangent tIn there, and the achieved distance
    // (clamped early at an interior junction — a window never crosses another
    // intersection — or at the chain's far end).
    const walkIn = (pts, end, dist) => {
      const n = pts.length
      const at = (i) => end === 'start' ? pts[i] : pts[n - 1 - i]
      const seam = [[at(0)[0], at(0)[1]]]
      let acc = 0, t = null
      for (let i = 1; i < n; i++) {
        const a = at(i - 1), b = at(i)
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (L < 1e-9) continue
        t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
        if (acc + L >= dist) {
          const f = (dist - acc) / L
          const ws = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
          seam.push(ws)
          return { seam, ws, tIn: t, d: dist }
        }
        acc += L
        seam.push([b[0], b[1]])
        if (i < n - 1 && nodeDeg.get(tipKey(b)) >= 3) return { seam, ws: seam[seam.length - 1], tIn: t, d: acc }
      }
      return { seam, ws: seam[seam.length - 1], tIn: t || [1, 0], d: acc }
    }
    const viAt = (pts, at) => { for (let i = 1; i < pts.length - 1; i++) if (Math.abs(pts[i][0] - at[0]) < 5e-3 && Math.abs(pts[i][1] - at[1]) < 5e-3) return i; return -1 }
    const pushPoly = (ring) => { if (ring.length >= 3) jPolys.push(signedArea(ring) >= 0 ? ring : ring.slice().reverse()) }
    // Non-absorbed median rings (for the defensive apron subtract) with bboxes.
    const medRings = (ribbons?.medians || []).filter(m => m?.kind === 'median' && !m.absorbedBy && Array.isArray(m.ring) && m.ring.length >= 3).map(m => m.ring)
    const medBoxes = medRings.map(ringBBox)
    let nPairs = 0, nWindows = 0, nAprons = 0, nAbsorbed = 0, nTipSkip = 0, nSkip = 0, nCorners = 0
    for (const nd of jm.nodes) {
      const legByChain = new Map(nd.legs.map(l => [l.chain, l]))
      const noseOf = (chain, end) => { for (const w of (nd.deTaper || [])) if (w.chain === chain && w.end === end) return w.nose; return 0 }
      // Apron-fan anchors: each constructed pair contributes its X (ON the
      // constructed curb, pulled a hair inboard); leg-sides a constructed
      // pair covers are excluded from the width-based fan below (a w-based
      // vertex can poke through a miter-tightened curb — the needle class).
      const fanAnchors = []
      const pairedSides = new Set()
      const nodeCurbs = new Map()   // `${chain}|${side}` → the window's as-built curb (cp→X) for E3.3's corners
      // ── continuity pairs → window polys + stroke trims ──
      for (const pr of (nd.continuity || [])) {
        if (pr.source === 'tip-wrap') { nTipSkip++; continue }   // pendant tips stay G8's (round-cap canon)
        // Resolve both halves: geometry probe + curb extrapolation at the node.
        const halves = []
        let bad = false
        for (const half of [pr.a, pr.b]) {
          const leg = legByChain.get(half.chain)
          const idx = idxBySkel.get(half.chain)
          const s = idx != null ? streets[idx] : null
          if (!leg || !s || !s.points || s.points.length < 2) { bad = true; break }
          const pts = s.points, len = chainLen(pts)
          const wP = Math.max(0, measures[idx]?.left?.pavementHW || 0, measures[idx]?.right?.pavementHW || 0)
          if (leg.end === 'through') {
            const vi = viAt(pts, nd.at)
            if (vi < 0) { bad = true; break }
            const tPO = nrm(pts[vi + 1][0] - pts[vi - 1][0], pts[vi + 1][1] - pts[vi - 1][1])
            const nh = sidePerp(tPO, half.side)
            halves.push({ half, leg, idx, pts, len, through: true, vi, tPO, nh, w: 0, wP, axisAtNode: [nd.at[0], nd.at[1]], tDir: tPO })
          } else {
            // The E2 nose is where the MEDIAN starts; the taper RUN — the
            // chain segment angling into the node — ends at the first chain
            // VERTEX at/past the nose (SKELETON §5e: follow the straight
            // section, not the taper; chains carry sparse authored vertices,
            // so the node-side segment IS the taper). The window snaps there.
            const nose = noseOf(half.chain, leg.end)
            let W0 = 0
            if (nose > 0) {
              const n = pts.length
              const at = (i) => leg.end === 'start' ? pts[i] : pts[n - 1 - i]
              let acc = 0
              for (let i = 1; i < n - 1; i++) {
                acc += Math.hypot(at(i)[0] - at(i - 1)[0], at(i)[1] - at(i - 1)[1])
                if (acc >= nose) { W0 = acc; break }
              }
              if (!W0) W0 = nose
              W0 = Math.min(W0, 0.45 * len)
            }
            // Probe the BODY tangent just past the window (past the taper).
            const probe = walkIn(pts, leg.end, W0 > 0 ? W0 + 1.5 : Math.min(8, 0.4 * len))
            const tPO = leg.end === 'start' ? probe.tIn : [-probe.tIn[0], -probe.tIn[1]]
            const nh = sidePerp(tPO, half.side)
            const w = feWidthAt(idx, half.side, segOrdAtEnd(idx, leg.end))
            if (!(w > 0.01)) { bad = true; break }
            // Extrapolate the de-tapered straight-body curb to the node's
            // longitudinal station: E = (node projected onto the body axis) + w·n̂.
            const toNode = [-probe.tIn[0], -probe.tIn[1]]
            const Lp = (nd.at[0] - probe.ws[0]) * toNode[0] + (nd.at[1] - probe.ws[1]) * toNode[1]
            const axisAtNode = [probe.ws[0] + toNode[0] * Lp, probe.ws[1] + toNode[1] * Lp]
            const E = [axisAtNode[0] + nh[0] * w, axisAtNode[1] + nh[1] * w]
            // Alternate candidate: extrapolate along the nose-station tangent
            // (the chain's own node-side segment). When the first authored
            // vertex is FAR and the chain genuinely bends there, the snap
            // extrapolation can miss the mate's curb by meters — the
            // self-check below keeps whichever lands on the continuity.
            let alt = null
            if (nose > 0 && W0 > nose + 1) {
              const pl = walkIn(pts, leg.end, nose + 0.05)
              const tPOl = leg.end === 'start' ? pl.tIn : [-pl.tIn[0], -pl.tIn[1]]
              const nhl = sidePerp(tPOl, half.side)
              const toN = [-pl.tIn[0], -pl.tIn[1]]
              const Lpl = (nd.at[0] - pl.ws[0]) * toN[0] + (nd.at[1] - pl.ws[1]) * toN[1]
              const axl = [pl.ws[0] + toN[0] * Lpl, pl.ws[1] + toN[1] * Lpl]
              alt = { W0: Math.min(Math.max(nose, 2), 0.45 * len), nh: nhl, E: [axl[0] + nhl[0] * w, axl[1] + nhl[1] * w], axisAtNode: axl, tDir: pl.tIn }
            }
            halves.push({ half, leg, idx, pts, len, through: false, nh, w, wP, E, nose, W0, axisAtNode, tDir: probe.tIn, alt })
          }
        }
        if (bad) { nSkip++; continue }
        // Per-fe width for a through mate: the segment the curb continues onto
        // (the half beyond the node along the ender's axis).
        for (const h of halves) {
          if (!h.through) continue
          const mate = halves.find(o => o !== h)
          // The curb continues onto the through chain's segment AWAY from the
          // ender's body (tIn points node→body, so away = −tIn).
          let fwd = true
          if (mate && !mate.through) {
            const mProbe = walkIn(mate.pts, mate.leg.end, Math.min(8, 0.4 * mate.len))
            const away = [-mProbe.tIn[0], -mProbe.tIn[1]]
            fwd = (h.tPO[0] * away[0] + h.tPO[1] * away[1]) > 0
          }
          h.w = feWidthAt(h.idx, h.half.side, segOrdAtVertex(h.idx, fwd ? h.vi : h.vi - 1))
          if (!(h.w > 0.01)) { bad = true; break }
          // The blend lands on the CONTINUING segment's curb, not the chord
          // tangent — a bend at the through vertex would otherwise leave a
          // small jog where the blend tops out off the as-stroked curb.
          const tSeg = fwd
            ? nrm(h.pts[h.vi + 1][0] - h.pts[h.vi][0], h.pts[h.vi + 1][1] - h.pts[h.vi][1])
            : nrm(h.pts[h.vi][0] - h.pts[h.vi - 1][0], h.pts[h.vi][1] - h.pts[h.vi - 1][1])
          h.tDir = tSeg
          h.nh = sidePerp(tSeg, h.half.side)
          h.E = [nd.at[0] + h.nh[0] * h.w, nd.at[1] + h.nh[1] * h.w]
        }
        if (bad || halves.every(h => h.through)) { nSkip++; continue }
        // Extrapolation self-check: keep the candidate that lands nearer the
        // mate's curb (the continuity identity is the arbiter; 0.3 m
        // hysteresis keeps the snap default on ties).
        for (const h of halves) {
          if (!h.alt) continue
          const o = halves.find(x => x !== h)
          if (!o?.E) continue
          if (Math.hypot(h.alt.E[0] - o.E[0], h.alt.E[1] - o.E[1]) + 0.3 < Math.hypot(h.E[0] - o.E[0], h.E[1] - o.E[1])) Object.assign(h, h.alt)
        }
        // Sanity: the two halves' curbs must sit on the same world side.
        const [A, B] = halves
        if ((A.nh[0] * B.nh[0] + A.nh[1] * B.nh[1]) < 0.1) { nSkip++; continue }
        const dlt = Math.hypot(A.E[0] - B.E[0], A.E[1] - B.E[1])
        // Window length per ending half: the de-taper nose where the prebake
        // stamped one (the taper region IS the window), else a short blend
        // window scaled to the curb mismatch (nothing to do when it vanishes).
        for (const h of halves) {
          if (h.through) { h.W = 0; continue }
          h.W = h.W0 > 0 ? h.W0 : (dlt < 0.05 ? 0 : Math.min(8, Math.max(2, 2.5 * dlt)))
          h.W = Math.min(h.W, 0.45 * h.len)
        }
        const winHalves = halves.filter(h => h.W > 0.01)
        if (!winHalves.length) continue   // datums already perfect, no taper — nothing to construct
        // Final window-start geometry per windowed half. The curb point cp uses
        // the tangent just BODY-ward of ws (the trimmed stroke's butt cap is ⊥
        // to that segment — a window snapped to a vertex must not read the
        // taper segment's tangent).
        for (const h of winHalves) {
          const fin = walkIn(h.pts, h.leg.end, h.W)
          h.W = fin.d
          const tBody = walkIn(h.pts, h.leg.end, h.W + 0.05).tIn
          const tPO = h.leg.end === 'start' ? tBody : [-tBody[0], -tBody[1]]
          h.nhWs = sidePerp(tPO, h.half.side)
          // The poly seam runs ~0.6 m PAST the window start, into the trimmed
          // stroke: the closing edge (cp → seam end) then lies interior to the
          // stroke instead of edge-kissing its butt cap — an exact-coincident
          // seam leaves hairline retrace needles in the union boundary.
          h.seam = walkIn(h.pts, h.leg.end, h.W + 0.6).seam
          h.ws = fin.ws
          h.cp = [fin.ws[0] + h.nhWs[0] * h.w, fin.ws[1] + h.nhWs[1] * h.w]
        }
        // X — the pair's shared curb point at the node (per width datum: the
        // tile side resolves per-fe widths; the perimeter side max-side).
        // When the two legs genuinely CROSS (an angled join — the Papin stub
        // class), the shared curb point is the MITER intersection of the two
        // body curb lines; near-parallel legs (the common transition) fall
        // back to the through-curb / window-weighted blend point.
        const thr = halves.find(h => h.through)
        const other = halves.find(h => !h.through && h.W <= 0.01)
        for (const h of halves) h.EP = [h.axisAtNode[0] + h.nh[0] * h.wP, h.axisAtNode[1] + h.nh[1] * h.wP]
        for (const h of winHalves) h.cpP = [h.ws[0] + h.nhWs[0] * h.wP, h.ws[1] + h.nhWs[1] * h.wP]
        const [hA, hB] = halves
        const miter = (Ea, Eb) => {
          const det = hA.tDir[0] * hB.tDir[1] - hA.tDir[1] * hB.tDir[0]
          if (Math.abs(det) < 0.14) return null   // < ~8° — near-collinear legs, no stable miter
          const t = ((Eb[0] - Ea[0]) * hB.tDir[1] - (Eb[1] - Ea[1]) * hB.tDir[0]) / det
          const P = [Ea[0] + hA.tDir[0] * t, Ea[1] + hA.tDir[1] * t]
          const lim = 2.5 * Math.max(hA.w || hA.wP, hB.w || hB.wP) + 2
          return Math.hypot(P[0] - nd.at[0], P[1] - nd.at[1]) <= lim ? P : null
        }
        let X = miter(hA.E, hB.E), XP = miter(hA.EP, hB.EP)
        if (!X || !XP) {
          let fb, fbP
          if (thr) { fb = thr.E; fbP = thr.EP }
          else if (other) { fb = other.E; fbP = other.EP }
          else {
            const t = winHalves[0].W / (winHalves[0].W + winHalves[1].W)
            fb = [winHalves[0].cp[0] + (winHalves[1].cp[0] - winHalves[0].cp[0]) * t,
                  winHalves[0].cp[1] + (winHalves[1].cp[1] - winHalves[0].cp[1]) * t]
            fbP = [winHalves[0].cpP[0] + (winHalves[1].cpP[0] - winHalves[0].cpP[0]) * t,
                   winHalves[0].cpP[1] + (winHalves[1].cpP[1] - winHalves[0].cpP[1]) * t]
          }
          if (!X) X = fb
          if (!XP) XP = fbP
        }
        for (const h of winHalves) {
          // [node…ws] seam reversed → ws…node, then node→X→cp closes the window.
          const ring = h.seam.slice().reverse()
          ring.push([X[0], X[1]], [h.cp[0], h.cp[1]])
          pushPoly(ring)
          const sk = (streetsOrig[h.idx] && (streetsOrig[h.idx].skelId || streetsOrig[h.idx].name)) || h.half.chain
          jTrims.set(`${sk}|${h.half.side}|${k3(h.seam[0])}`, h.W)
          // [E3.3] the as-built constructed curb (cp→X) — the ONE curb truth
          // the corner pass must corner against (a straight-datum line would
          // disagree with the blend by |wA−wB| and tooth the boundary). The
          // line stays valid past cp along the trimmed stroke until the
          // chain's next bend — extend farPt there so a corner falling just
          // body-ward of a short window still constructs.
          {
            const dx = X[0] - h.cp[0], dz = X[1] - h.cp[1]
            const L = Math.hypot(dx, dz)
            if (L > 0.5) {
              let ext = 0
              {
                const pn = h.pts.length
                const at = (i) => h.leg.end === 'start' ? h.pts[i] : h.pts[pn - 1 - i]
                let acc = 0
                for (let i = 1; i < pn; i++) {
                  acc += Math.hypot(at(i)[0] - at(i - 1)[0], at(i)[1] - at(i - 1)[1])
                  if (acc > h.W + 0.05) { ext = Math.min(acc - h.W, 20); break }
                }
              }
              nodeCurbs.set(`${h.half.chain}|${h.half.side}`, { p0: [h.cp[0], h.cp[1]], u: [dx / L, dz / L], nb: [h.nhWs[0], h.nhWs[1]], w: h.w, farPt: [h.cp[0] - dx / L * ext, h.cp[1] - dz / L * ext] })
            }
          }
          // Perimeter variant: same window, the perimeter's width datum. The
          // keep-out quad (constructed curb → outward) cuts the chain's OWN
          // perimeter stroke so the wider butt cap can't tooth past the curb.
          const ringP = h.seam.slice().reverse()
          ringP.push([XP[0], XP[1]], [h.cpP[0], h.cpP[1]])
          if (ringP.length >= 3) jPerimPolys.push(signedArea(ringP) >= 0 ? ringP : ringP.slice().reverse())
          const K = h.wP + 4
          const cut = [
            [h.cpP[0], h.cpP[1]], [XP[0], XP[1]],
            [XP[0] + h.nhWs[0] * K, XP[1] + h.nhWs[1] * K],
            [h.cpP[0] + h.nhWs[0] * K, h.cpP[1] + h.nhWs[1] * K],
          ]
          if (!jPerimCuts.has(sk)) jPerimCuts.set(sk, [])
          jPerimCuts.get(sk).push(signedArea(cut) >= 0 ? cut : cut.slice().reverse())
          nWindows++
        }
        {
          const dX = Math.hypot(X[0] - nd.at[0], X[1] - nd.at[1]) || 1
          const s = Math.max(0, 1 - 0.25 / dX)
          fanAnchors.push([nd.at[0] + (X[0] - nd.at[0]) * s, nd.at[1] + (X[1] - nd.at[1]) * s])
        }
        for (const h of halves) pairedSides.add(`${h.half.chain}|${h.half.side}`)
        nPairs++
      }
      // ── the node apron ──
      if (nd.apron) {
        const fan = [...fanAnchors]
        for (const leg of nd.legs) {
          const idx = idxBySkel.get(leg.chain)
          const s = idx != null ? streets[idx] : null
          if (!s?.points || s.points.length < 2) continue
          const pts = s.points, len = chainLen(pts)
          let tPO = null, segL = 0, segR = 0
          if (leg.end === 'through') {
            const vi = viAt(pts, nd.at)
            if (vi < 0) continue
            tPO = nrm(pts[vi + 1][0] - pts[vi - 1][0], pts[vi + 1][1] - pts[vi - 1][1])
            segL = segR = segOrdAtVertex(idx, vi)
          } else {
            const probe = walkIn(pts, leg.end, Math.min(6, 0.4 * len))
            tPO = leg.end === 'start' ? probe.tIn : [-probe.tIn[0], -probe.tIn[1]]
            segL = segR = segOrdAtEnd(idx, leg.end)
          }
          for (const side of ['left', 'right']) {
            if (pairedSides.has(`${leg.chain}|${side}`)) continue   // covered by a constructed pair's X anchor
            const w = feWidthAt(idx, side, side === 'left' ? segL : segR)
            if (!(w > 0.01)) continue
            const nh = sidePerp(tPO, side)
            // A hair inboard of the curb — a fan vertex exactly ON the curb
            // makes a degenerate Clipper touch point (the spur-hygiene class).
            const r = Math.max(0.3, Math.min(w, 15) - 0.25)
            fan.push([nd.at[0] + nh[0] * r, nd.at[1] + nh[1] * r])
          }
        }
        if (fan.length >= 3) {
          fan.sort((p, q) => Math.atan2(p[1] - nd.at[1], p[0] - nd.at[0]) - Math.atan2(q[1] - nd.at[1], q[0] - nd.at[0]))
          // Defensive: never let the apron eat a real (non-absorbed) median tip.
          const fb = ringBBox(fan)
          const near = medRings.filter((_, i) => { const mb = medBoxes[i]; return mb[0] <= fb[2] && mb[2] >= fb[0] && mb[1] <= fb[3] && mb[3] >= fb[1] })
          for (const r of (near.length ? differenceRings([fan], near) : [fan])) pushPoly(r)
          nAprons++
        }
        for (const mi of (nd.apron.absorbsMedians || [])) {
          const m = (ribbons?.medians || [])[mi]
          if (m?.ring?.length >= 3) { pushPoly(m.ring.map(p => [p[0], p[1]])); nAbsorbed++ }
        }
      }
      // ── [E3.3] corner identities → the constructed corner (§5e at last).
      // Only nodes with stamped STUBS fire — a stub is the one leg that must
      // never corner; every corner here is built from identified curb lines.
      // Scope: DIVIDED-TRANSITION nodes (the 24-node sweep class, incl. the
      // park corners). Terminus/continuation/join stubs sit on the E3.4
      // datum-repair rows (Truman↔Lafayette w=2 scramble, Chouteau 6.70 m) —
      // constructing a corner from a scrambled width reshapes one artifact
      // into another; they pick this construction up once the datums hold.
      const stubRecs = nd.kinds?.includes('divided-transition') ? (nd.corners?.stub || []) : []
      if (stubRecs.length) {
        const stubChains = new Set(stubRecs.map(c => c.chain))
        // An identified curb LINE at this node: the leg's de-tapered body
        // tangent (the same window-snapped probe the E3.2 halves use) offset
        // by the per-fe width on the stamped side. nb = unit normal toward
        // the BLOCK side of the curb.
        const lineCache = new Map()
        const lineFor = (chain, side, halfDir) => {
          const ck0 = `${chain}|${side}`
          const ck = `${ck0}|${halfDir ? halfDir.map(v => v.toFixed(2)) : ''}`
          if (lineCache.has(ck)) return lineCache.get(ck)
          let out = null
          const leg = legByChain.get(chain)
          const idx = idxBySkel.get(chain)
          const s = idx != null ? streets[idx] : null
          if (leg && s?.points && s.points.length >= 2) {
            const pts = s.points, len = chainLen(pts)
            if (leg.end === 'through') {
              const vi = viAt(pts, nd.at)
              if (vi >= 0) {
                // The half of the through chain facing the corner — the one
                // pointing toward the stub's BLOCK side (halfDir = A.nb).
                // Segment tangent + per-fe segOrd resolved on that half
                // (point-order-forward keyed, the E3.2 convention).
                const fdir = nrm(pts[vi + 1][0] - pts[vi][0], pts[vi + 1][1] - pts[vi][1])
                const fwd = !halfDir || (fdir[0] * halfDir[0] + fdir[1] * halfDir[1]) >= 0
                const t = fwd ? fdir : nrm(pts[vi][0] - pts[vi - 1][0], pts[vi][1] - pts[vi - 1][1])
                const w = feWidthAt(idx, side, segOrdAtVertex(idx, fwd ? vi : vi - 1))
                if (w > 0.01) {
                  const nh = sidePerp(t, side)
                  // the straight-line model holds only to the half's far
                  // vertex — the chain may bend there
                  const fv = fwd ? pts[vi + 1] : pts[vi - 1]
                  out = { chain, side, u: t, nb: nh, p0: [nd.at[0] + nh[0] * w, nd.at[1] + nh[1] * w], w, farPt: [fv[0] + nh[0] * w, fv[1] + nh[1] * w] }
                }
              }
            } else if (nodeCurbs.has(ck0)) {
              // This curb was CONSTRUCTED by an E3.2 window — corner against
              // the as-built cp→X line (one curb truth; a fresh straight-
              // datum line would tooth against the blend).
              out = { ...nodeCurbs.get(ck0), chain, side, fromWindow: true }
            } else {
              const nose = noseOf(chain, leg.end)
              let W0 = 0
              if (nose > 0) {
                const np = pts.length
                const at = (i) => leg.end === 'start' ? pts[i] : pts[np - 1 - i]
                let acc = 0
                for (let i = 1; i < np - 1; i++) {
                  acc += Math.hypot(at(i)[0] - at(i - 1)[0], at(i)[1] - at(i - 1)[1])
                  if (acc >= nose) { W0 = acc; break }
                }
                if (!W0) W0 = nose
                W0 = Math.min(W0, 0.45 * len)
              }
              const probe = walkIn(pts, leg.end, W0 > 0 ? W0 + 1.5 : Math.min(8, 0.4 * len))
              const w = feWidthAt(idx, side, segOrdAtEnd(idx, leg.end))
              if (w > 0.01) {
                const tPO = leg.end === 'start' ? probe.tIn : [-probe.tIn[0], -probe.tIn[1]]
                const nh = sidePerp(tPO, side)
                // body line projected to the node's longitudinal station
                const toNode = [-probe.tIn[0], -probe.tIn[1]]
                const Lp = (nd.at[0] - probe.ws[0]) * toNode[0] + (nd.at[1] - probe.ws[1]) * toNode[1]
                const ax = [probe.ws[0] + toNode[0] * Lp, probe.ws[1] + toNode[1] * Lp]
                // curl magnitude — how far the pinned endpoint sits off the
                // body axis. ≈0 → the stub IS its body, nothing to construct.
                const latOff = Math.hypot(nd.at[0] - ax[0], nd.at[1] - ax[1])
                out = { chain, side, u: tPO, nb: nh, p0: [ax[0] + nh[0] * w, ax[1] + nh[1] * w], w, latOff, farPt: [probe.ws[0] + nh[0] * w, probe.ws[1] + nh[1] * w] }
              }
            }
          }
          lineCache.set(ck, out)
          return out
        }
        // Chains transitively linked by the node's continuity stamps are ONE
        // corridor — its curbs continue through the node and never corner
        // each other (a pure transition node constructs no corners at all).
        const grp = new Map()
        const find = (x) => { let r = x; while (grp.get(r) !== r) r = grp.get(r); grp.set(x, r); return r }
        for (const pr of (nd.continuity || [])) {
          for (const c of [pr.a.chain, pr.b.chain]) if (!grp.has(c)) grp.set(c, c)
          grp.set(find(pr.a.chain), find(pr.b.chain))
        }
        const grpOf = (c) => grp.has(c) ? find(c) : c
        // Continuity-linked sides are ONE physical curb — a corner pairs
        // against it ONCE (two stamped lines of one curb differ by the blend
        // kink at X and would stair-step the cut).
        const sameCurb = new Set()
        for (const pr of (nd.continuity || [])) {
          sameCurb.add(`${pr.a.chain}|${pr.a.side}~${pr.b.chain}|${pr.b.side}`)
          sameCurb.add(`${pr.b.chain}|${pr.b.side}~${pr.a.chain}|${pr.a.side}`)
        }
        const seenP = new Set()
        // The cut's two critical edges sit 1 cm BLOCK-ward of the exact curb
        // lines: where the emergent stroke edge already equals the line (the
        // no-op zones beyond the curl) an exact-coincident cut edge would
        // leave zero-width retrace needles in the difference boundary (the
        // spur-hygiene class) — the nudge keeps the stroke edge the boundary
        // there, invisibly.
        const NUDGE = 0.01
        const cornerAt = (A, B) => {
          const det = A.u[0] * B.u[1] - A.u[1] * B.u[0]
          if (Math.abs(det) < 0.34) return                  // near-parallel (<~20°): same curb, not a corner
          const pA = [A.p0[0] + A.nb[0] * NUDGE, A.p0[1] + A.nb[1] * NUDGE]
          const pB = [B.p0[0] + B.nb[0] * NUDGE, B.p0[1] + B.nb[1] * NUDGE]
          const t = ((pB[0] - pA[0]) * B.u[1] - (pB[1] - pA[1]) * B.u[0]) / det
          const P = [pA[0] + A.u[0] * t, pA[1] + A.u[1] * t]
          const lim = 2.5 * Math.max(A.w, B.w) + 4
          if (Math.hypot(P[0] - nd.at[0], P[1] - nd.at[1]) > lim) return
          const pk = Math.round(P[0] * 2) + ',' + Math.round(P[1] * 2)
          if (seenP.has(pk)) return
          seenP.add(pk)
          // e1 = along A toward the block side of B; e2 = along B toward the
          // block side of A → the quadrant beyond BOTH curbs from P = block.
          // Each extent is bounded by its line's REACH (where the chain may
          // bend, the straight-line model — and so the cut — must stop).
          const e1 = (A.u[0] * B.nb[0] + A.u[1] * B.nb[1]) > 0 ? A.u : [-A.u[0], -A.u[1]]
          const e2 = (B.u[0] * A.nb[0] + B.u[1] * A.nb[1]) > 0 ? B.u : [-B.u[0], -B.u[1]]
          // distance from P to the line's far valid point — past it the chain
          // may bend and the straight-line cut would bite the real curb. A
          // corner with no usable span (P at/beyond the far point) isn't one
          // this construction can build — skip, never emit a micro-cut.
          const spanTo = (L, e) => L.farPt ? (L.farPt[0] - P[0]) * e[0] + (L.farPt[1] - P[1]) * e[1] + 1 : lim + 8
          const S1 = Math.min(lim + 8, spanTo(A, e1))
          const S2 = Math.min(lim + 8, spanTo(B, e2))
          if (S1 < 3 || S2 < 3) return
          let cut = [
            [P[0], P[1]],
            [P[0] + e1[0] * S1, P[1] + e1[1] * S1],
            [P[0] + e1[0] * S1 + e2[0] * S2, P[1] + e1[1] * S1 + e2[1] * S2],
            [P[0] + e2[0] * S2, P[1] + e2[1] * S2],
          ]
          if (signedArea(cut) < 0) cut = cut.slice().reverse()
          jCornerCuts.push(cut)
          nCorners++
        }
        for (const oc of (nd.corners?.outer || [])) {
          if (!stubChains.has(oc.chain)) continue
          const A = lineFor(oc.chain, oc.side)
          // negligible curl → the stub IS its straight body; the emergent
          // corner already rides the identified legs (any residual is datum,
          // E3.4's) and a construction here would only manufacture
          // coincident-edge needles. Window-built curbs always corner.
          if (!A || (!A.fromWindow && (A.latOff || 0) < 0.4)) continue
          // partners: the node's other identified outer curbs OUTSIDE the
          // stub's own corridor group + the cross legs.
          const gA = grpOf(oc.chain)
          const cands = []
          for (const o2 of (nd.corners?.outer || [])) {
            if (o2.chain === oc.chain && o2.side === oc.side) continue
            if (grpOf(o2.chain) === gA) continue
            cands.push(o2)
          }
          for (const leg of nd.legs) if (leg.role === 'cross') for (const side of ['left', 'right']) cands.push({ chain: leg.chain, side })
          // resolve lines; sameCurb-linked cands collapse to ONE (prefer the
          // as-built window line over a straight-datum one)
          const lines = []
          for (const c2 of cands) {
            const B = lineFor(c2.chain, c2.side, A.nb)   // through partners: the half facing the stub's block side
            if (B) lines.push({ c2, B })
          }
          const drop = new Set()
          for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
            if (drop.has(i) || drop.has(j)) continue
            const a = lines[i], b = lines[j]
            if (!sameCurb.has(`${a.c2.chain}|${a.c2.side}~${b.c2.chain}|${b.c2.side}`)) continue
            drop.add(!a.B.fromWindow && b.B.fromWindow ? i : j)
          }
          lines.forEach(({ B }, i) => { if (!drop.has(i)) cornerAt(A, B) })
        }
        // branch apexes (the Grattan class): the stamped pair IS the corner
        for (const ap of (nd.corners?.apex || [])) {
          if (!stubChains.has(ap.legA.chain)) continue
          const A = lineFor(ap.legA.chain, ap.legA.side)
          if (!A || (!A.fromWindow && (A.latOff || 0) < 0.4)) continue
          const B = lineFor(ap.legB.chain, ap.legB.side, A.nb)
          if (B) cornerAt(A, B)
        }
      }
    }
    if (nPairs || nAprons) console.log(`    [E3.2] junction construction: ${nPairs} pairs (${nWindows} windows), ${nAprons} aprons, ${nAbsorbed} absorbed median ring(s)${nTipSkip ? `, ${nTipSkip} tip-wraps left to G8` : ''}${nSkip ? `, ${nSkip} pairs skipped (unresolvable)` : ''}`)
    if (nCorners) console.log(`    [E3.3] corner identities: ${nCorners} corners constructed`)
  }
  const jBoxes = jPolys.map(ringBBox)
  const junctionClipFor = (tileRing) => {
    if (!jPolys.length) return []
    const tb = ringBBox(tileRing)
    const cand = jPolys.filter((_, i) => { const mb = jBoxes[i]; return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1] })
    return cand.length ? intersectRings(cand, [tileRing]) : []
  }
  // [E3.3] per-tile corner-identity pieces. Cuts subtract from aFill (which
  // is already tile-clipped).
  const jcBoxes = jCornerCuts.map(ringBBox)
  const cornerCutFor = (tileRing) => {
    if (!jCornerCuts.length) return []
    const tb = ringBBox(tileRing)
    return jCornerCuts.filter((_, i) => { const mb = jcBoxes[i]; return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1] })
  }
  // Window-trimmed stroke source for a run: each run end sitting at a
  // constructed node pulls back by its window (the window poly supplies the
  // constructed coverage there). Null → the run is entirely inside windows.
  const jTrimmed = (run) => {
    if (!jTrims.size) return run.poly
    const so = streetsOrig[run.streetIdx]
    const sk = (so && (so.skelId || so.name)) || null
    if (!sk) return run.poly
    const p = run.poly
    const t0 = jTrims.get(`${sk}|${run.side}|${k3(p[0])}`) || 0
    const t1 = jTrims.get(`${sk}|${run.side}|${k3(p[p.length - 1])}`) || 0
    if (!t0 && !t1) return p
    return trimPolyline(p, t0, t1)
  }

  // ── THE THROUGH-NODE CONSTRUCTION — intersections at EVERY node ──────────
  // The osm2streets generalization (OSM2STREETS-GROUNDING §4.2 item 2 /
  // HANDOFF-intersection-everywhere): a Road runs between exactly two
  // intersections and is trimmed back at each; our chains run THROUGH
  // junction nodes, so a tile run can span several fe's — and it took ONE
  // width for the whole run ("takes the lower one's width", runSegOrd above):
  // the curb drew off the authored handle for every fe past the first, and the
  // discontinuity surfaced wherever the run ended. Likewise a centerline
  // dogleg at a through node (junction-protected RDP keeps the off-chord
  // OSM vertex, SKELETON §5a) kinked the stroked curb where the physical curb
  // runs straight. Both are DRAWING defects — the data (handles, node
  // positions) is right (Jacob, 2026-06-06).
  // Per junction node (degree ≥ 3), per chain THROUGH it, per side, this pass
  //   1. SPLITS the run at the node (the fe boundary) so each span strokes at
  //      its own per-fe width — the standard's road granularity, recovered;
  //   2. TRIMS each span back W from the node (trim_start/trim_end — the
  //      edge-collision trim, sized to the discontinuity + the cross width);
  //   3. CONSTRUCTS the window: seam along the chain, curb = the straight
  //      blend cpA→cpB (monotonic wA→wB; equal datums + straight chain
  //      degenerate to today's geometry — the construction self-gates).
  // W keeps the blend under the fillet turn-tol (atan(Δw/2W) < 18°), so no
  // spurious corner can be minted at a blend kink — corners only where real
  // legs meet. Toy data (no customs, straight chains) → zero stations → no-op.
  const thruWins = []                    // window polys (positive asphalt)
  const thruSplits = new Map()           // `${streetIdx}|${side}` → [{ vi, W }]
  {
    const sidePerpT = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]
    // Already-CONSTRUCTED nodes are the E3 machinery's domain (continuity
    // pairs, noses, aprons) — constructing here too would double-build with a
    // different curb model. The through-pass owns the rest. NOTE: since the
    // intersection-everywhere stamps, EVERY junction node has a junctionMap
    // record — the gate is whether the node carries E3 CONSTRUCTION, not
    // whether it is mapped ('plain' identity-only records stay ours).
    const jmNodeKeys = new Set(consumeJM
      ? ribbons.junctionMap.nodes.filter(n => (n.continuity?.length || n.deTaper?.length || n.apron)).map(n => tipKey(n.at))
      : [])
    for (let idx = 0; idx < streets.length; idx++) {
      const s = streets[idx]
      const pts = s?.points
      if (!pts || pts.length < 3) continue
      // Divided carriageways are the E2/E3 construction's domain end-to-end
      // (inner-edge anchored, median constructed at prebake, junctions
      // stamped) — a chord window on their snaking bodies reshapes the median.
      const role = streetsOrig[idx]?.phase?.role || s.phase?.role || ''
      if (s.anchor === 'inner-edge' || /^carriageway/.test(role)) continue
      // arc positions + junction stations on this chain
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      const stations = []
      for (let vi = 1; vi < pts.length - 1; vi++) {
        const k = tipKey(pts[vi])
        if ((nodeDeg.get(k) || 0) >= 3 && !jmNodeKeys.has(k)) stations.push(vi)
      }
      if (!stations.length) continue
      // point + unit tangent at arc position sPos
      const at = (sPos) => {
        let i = 1
        while (i < cum.length - 1 && cum[i] < sPos) i++
        const a = pts[i - 1], b = pts[i]
        const L = cum[i] - cum[i - 1] || 1
        const f = Math.min(1, Math.max(0, (sPos - cum[i - 1]) / L))
        return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
      }
      for (let si = 0; si < stations.length; si++) {
        const vi = stations[si]
        // off-chord kink of the node vertex against its chain neighbors
        const a = pts[vi - 1], v = pts[vi], b = pts[vi + 1]
        const cdx = b[0] - a[0], cdz = b[1] - a[1]
        const cL = Math.hypot(cdx, cdz) || 1
        const kink = Math.abs(((v[0] - a[0]) * cdz - (v[1] - a[1]) * cdx) / cL)
        // room to the neighboring stations / chain ends
        const sPrev = si > 0 ? cum[stations[si - 1]] : 0
        const sNext = si < stations.length - 1 ? cum[stations[si + 1]] : cum[cum.length - 1]
        const roomA = 0.45 * (cum[vi] - sPrev)
        const roomB = 0.45 * (sNext - cum[vi])
        for (const side of ['left', 'right']) {
          const wA = feWidthAt(idx, side, segOrdAtVertex(idx, vi - 1))
          const wB = feWidthAt(idx, side, segOrdAtVertex(idx, vi))
          const dw = Math.abs(wA - wB)
          if (dw < 0.02 && kink < 0.3) continue            // nothing to construct
          if (!(Math.min(wA, wB) > 0.01)) continue         // a zero side (inner-edge carriageway) carries no curb
          const Wn = Math.min(8, Math.max(2, 1.7 * dw, 2.5 * kink))
          const WA = Math.min(Wn, roomA), WB = Math.min(Wn, roomB)
          if (WA < 0.5 || WB < 0.5) continue               // no room — leave emergent
          const A = at(cum[vi] - WA), B = at(cum[vi] + WB)
          const nhA = sidePerpT(A.t, side), nhB = sidePerpT(B.t, side)
          const cpA = [A.p[0] + nhA[0] * wA, A.p[1] + nhA[1] * wA]
          const cpB = [B.p[0] + nhB[0] * wB, B.p[1] + nhB[1] * wB]
          // seam: 0.6 m past each window start, into the trimmed strokes (the
          // E3.2 hygiene — an exact-coincident seam leaves retrace needles)
          const s0 = Math.max(0, cum[vi] - WA - 0.6), s1 = Math.min(cum[cum.length - 1], cum[vi] + WB + 0.6)
          const seam = [at(s0).p]
          for (let i = 0; i < pts.length; i++) if (cum[i] > s0 && cum[i] < s1) seam.push(pts[i])
          seam.push(at(s1).p)
          let ring = [...seam, [cpB[0], cpB[1]], [cpA[0], cpA[1]]]
          if (ring.length >= 3) {
            if (signedArea(ring) < 0) ring = ring.slice().reverse()
            thruWins.push(ring)
          }
          const key = `${idx}|${side}`
          if (!thruSplits.has(key)) thruSplits.set(key, [])
          thruSplits.get(key).push({ vi, W: { A: WA, B: WB } })
        }
      }
    }
    if (thruWins.length) console.log(`    [THRU] through-node construction: ${thruWins.length} windows at ${new Set([...thruSplits.keys()].map(k => k.split('|')[0])).size} chains`)
  }
  const thruBoxes = thruWins.map(ringBBox)
  const thruClipFor = (tileRing) => {
    if (!thruWins.length) return []
    const tb = ringBBox(tileRing)
    const cand = thruWins.filter((_, i) => { const mb = thruBoxes[i]; return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1] })
    return cand.length ? intersectRings(cand, [tileRing]) : []
  }
  // Split a tile run at its through-construction stations; each span strokes
  // at its own per-fe width (runSegOrd resolves per span) and is trimmed back
  // by the station's window so the window poly supplies the node coverage.
  const splitRunAtStations = (run) => {
    const stations = thruSplits.get(`${run.streetIdx}|${run.side}`)
    if (!stations?.length) return [run]
    const op = streetsOrig[run.streetIdx]?.points
    if (!op) return [run]
    const p = run.poly
    // indices of run-poly interior vertices that are stations of this chain
    const cuts = []
    for (let k = 1; k < p.length - 1; k++) {
      for (const st of stations) {
        const q = op[st.vi]
        if (Math.abs(p[k][0] - q[0]) < 5e-3 && Math.abs(p[k][1] - q[1]) < 5e-3) { cuts.push({ k, st }); break }
      }
    }
    if (!cuts.length) return [run]
    // run direction vs chain order: does the run walk the chain forward?
    const idxOf = (pt) => { let bi = 0, bd = Infinity; for (let i = 0; i < op.length; i++) { const dx = op[i][0] - pt[0], dy = op[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } } return bi }
    const fwd = idxOf(p[0]) <= idxOf(p[p.length - 1])
    const out = []
    let lo = 0, tPrev = 0
    for (const { k, st } of cuts) {
      // trim at the cut: chain-side A is BEFORE the node in chain order — in
      // run order that's the incoming side iff the run walks forward
      const tCut = fwd ? st.W.A : st.W.B
      out.push({ ...run, poly: p.slice(lo, k + 1), _thruT0: tPrev, _thruT1: tCut })
      tPrev = fwd ? st.W.B : st.W.A
      lo = k
    }
    out.push({ ...run, poly: p.slice(lo), _thruT0: tPrev, _thruT1: 0 })
    return out.filter(r => r.poly.length >= 2)
  }

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
  //     (Curb width is global so it's exact; treelawn/sidewalk are now the
  //     STANDARD best-effort depths — SECTION.md §3.1 — replacing the old per-tile
  //     averaged measure. Per-edge ASPHALT width, the dominant asymmetry, is kept.)

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
    // [THRU] runs split at through-construction stations → per-fe spans
    const runs = thruSplits.size ? groupRuns(tile).flatMap(splitRunAtStations) : groupRuns(tile)
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
      if (d > 1e-6) {
        // [E3.2] a run end at a constructed junction node strokes only its
        // body — the window poly supplies the constructed coverage beyond.
        // [THRU] span ends at a through-construction station likewise.
        let sp = jTrimmed(run)
        if (sp && (run._thruT0 || run._thruT1)) sp = trimPolyline(sp, run._thruT0 || 0, run._thruT1 || 0)
        if (sp) aStads.push(...strokeOpen(sp, d))
      }
    }
    for (const t of roundTips) if (t.hw > 1e-6) aStads.push(circlePoly(t.p[0], t.p[1], t.hw))
    let aFill = aStads.length ? intersectRings(unionRings(aStads), [tile.ring]) : []
    // E2 — constructed-median consumption (replaces the G3a >40%-median-facing
    // heuristic). merge patches (transition tapers, crossing windows) are
    // corridor asphalt in whatever tile they land; a tile mostly covered by a
    // median segment IS the median tile — all ped zeroed so no treelawn/
    // sidewalk sliver leaks into the median. The median region itself paints
    // via sectionPass (med, frozen below). Authored inboard pavement ("eat
    // into the median") still wins — the per-run strokes union over it.
    const mergeClip = mergeClipFor(tile.ring)
    if (mergeClip.length) aFill = aFill.length ? unionRings([...aFill, ...mergeClip]) : mergeClip
    // [E3.3] corner identities — FIRST the corner quadrant beyond the two
    // identified curb lines is asserted BLOCK on the emergent strokes (the
    // stub's curl stroke can never corner); the constructed coverage below
    // (windows / aprons) then unions OVER the cut, so a window's wA→wB blend
    // curb survives where it legitimately tops the straight line.
    const cCut = cornerCutFor(tile.ring)
    if (cCut.length && aFill.length) aFill = differenceRings(aFill, cCut)
    // [E3.2] junction construction — window polys + node aprons land as
    // positive asphalt in whatever tile they fall, same as the merge patches.
    const jClip = junctionClipFor(tile.ring)
    if (jClip.length) aFill = aFill.length ? unionRings([...aFill, ...jClip]) : jClip
    // [THRU] through-node windows — the constructed blend coverage at every
    // split station (same positive-asphalt landing as the E3.2 windows).
    const tClip = thruClipFor(tile.ring)
    if (tClip.length) aFill = aFill.length ? unionRings([...aFill, ...tClip]) : tClip
    const medClip = medianClipFor(tile.ring)
    let medArea = 0
    for (const r of medClip) medArea += Math.abs(signedArea(r))
    // A single-run tile (groupRuns found no seam) is bounded entirely by ONE
    // street-side → a loop interior (LOOP-STREETS §2). When its emergent median
    // ring covers it, it IS the §2 body interior: ped-zero so the inner side is
    // curb + grass (no inner sidewalk ring), treelawn flowing into the median —
    // independent of the >50% area ratio the divided-median heuristic uses.
    const isLoopInterior = runs.length === 1
    const isMedianTile = (medArea > 0.5 && medArea > 0.5 * Math.abs(signedArea(tile.ring)))
      || (isLoopInterior && medArea > 0.5)
    // Best-effort fill (SECTION.md §3.1): per-tile band depths are STANDARD, not
    // the old per-edge averaged measures. The treelawn band is present iff any of
    // the tile's runs gleans treelawn-Y; the sidewalk band is always ADA.
    const tileHasTreelawn = runs.some(run => gleanTreelawn(measures[run.streetIdx], run.side))
    const tl = isMedianTile ? 0 : (tileHasTreelawn ? STD_TREELAWN : 0)
    const sw = isMedianTile ? 0 : ADA_SIDEWALK
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
    // [E3.2] drop degenerate (≈zero-area) rings before filleting: a coincident
    // fill seam can leave a zero-width needle ring in the difference, which
    // filletRing turns into an unbounded arc (θ→0 ⇒ inset→∞) and which poisons
    // the band ClipperOffsets downstream (erode returns empty → the whole
    // block paints as curb). No legitimate block fragment is < 0.5 m².
    // [D6a · POLYGON-FIRST §3 / SKELETON §5f] DEFAULT: iA = the per-edge parallel
    // OFFSET polygon (offsetRingVariable) — chain ⊕ pavementHW, corners as
    // offset-intersections — rounded at the authored radius by filletRing/vertR.
    // NOT carved from the junction-swelled asphalt (that bows the curb where the
    // windows pile in). Per-edge depth = the run covering that ring edge.
    // opts.iaCarveLegacy = today's swelled carve, kept for A/B on Jacob's eye.
    const edgeKey = (p, q) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}|${Math.round(q[0] * 50)},${Math.round(q[1] * 50)}`
    const depthByEdge = new Map(), streetByEdge = new Map()
    for (const run of runs) {
      const dd = edgeDepth(runMeasure(run), run.side, cw, 'A')
      const so = streetsOrig[run.streetIdx]
      const sk = (so && (so.skelId || so.name)) || run.streetIdx
      for (let i = 0; i < run.poly.length - 1; i++) {
        const k1 = edgeKey(run.poly[i], run.poly[i + 1]), k2 = edgeKey(run.poly[i + 1], run.poly[i])
        depthByEdge.set(k1, dd); depthByEdge.set(k2, dd)
        streetByEdge.set(k1, sk); streetByEdge.set(k2, sk)
      }
    }
    const nRing = tile.ring.length
    const depthAt = (i) => depthByEdge.get(edgeKey(tile.ring[i], tile.ring[(i + 1) % nRing])) || 0
    // A real corner = the two edges at this vertex belong to DIFFERENT streets.
    // Same street both sides = a through-node (T far-side / dogleg) → run straight
    // through, no corner (Jacob's T-intersection sensitivity; osm2streets doctrine).
    const streetAtEdge = (i) => streetByEdge.get(edgeKey(tile.ring[i], tile.ring[(i + 1) % nRing]))
    const cornerAt = (i) => { const a = streetAtEdge((i - 1 + nRing) % nRing), b = streetAtEdge(i); return a == null || b == null || a !== b }
    // opts.iaOffset = the per-edge parallel-offset curb (D6a). It owns the "street
    // simple" tiles (§5d); the "intersection variable" / degenerate tiles keep the
    // legacy carve that already handles them: MEDIAN tiles (offsetting both inner
    // edges collapses the thin gap), DEAD-END tiles (the round cap is a disk, not
    // an edge offset), and tiny/sliver tiles (the offset of a sub-block fragment
    // blows up past the tile). A post-check also rejects any offset that came out
    // degenerate (vanished or larger than its tile). The d-tile is a large clean
    // block → it takes the offset. Falling back to legacy is never a regression.
    const legacyBlock = () => differenceRings([tile.ring], aFill).filter(r => Math.abs(signedArea(r)) > 0.5)
    const ringArea = Math.abs(signedArea(tile.ring))
    let blockRings
    if (opts.iaOffset !== false && !isMedianTile && ringArea > 1500) {
      // Dead-end caps are built INTO the offset polygon (capArc), tangent to the
      // legs — no graft, so a tile that's both a d-block and a cul-de-sac (tile 11)
      // keeps its d AND gets a clean cap. Map each round/blunt tip to its ring
      // vertex so offsetRingVariable emits the semicircle / flat butt there.
      const capByVertex = new Map()
      for (const t of roundTips) { const vi = nearestVertexIndex(t.p, tile.ring); if (vi >= 0) capByVertex.set(vi, 'round') }
      for (const t of bluntTips) { const vi = nearestVertexIndex(t.p, tile.ring); if (vi >= 0) capByVertex.set(vi, 'blunt') }
      const off = offsetRingVariable(tile.ring, depthAt, cornerAt, (i) => capByVertex.get(i) || null)
      const offArea = off.reduce((s, r) => s + Math.abs(signedArea(r)), 0)
      blockRings = (off.length && offArea > 0.05 * ringArea && offArea <= 1.01 * ringArea) ? off : legacyBlock()
    } else {
      blockRings = legacyBlock()
    }
    const iA = filletRings(blockRings, cornerRfn, fSink)   // rounded asphalt-inner (curb line)
    // Tag each achieved fillet with its corner key (the centerline NODE it
    // rounded + that node's two tile-edge legs) so the authoring handle can read
    // the true curb arc — one corner truth, no drift. CORNER-DRIVEN injective
    // claim (was fillet-driven `nearestCornerVertexIndex`, which collided 93× and
    // orphaned 77× — Caliper's bucket-B; subsumed here): every SHARP tile-ring
    // corner is the unit of identity, and each claims at most ONE fSink arc by
    // nearest apex→corner distance, globally greedy so the matching doesn't depend
    // on corner order. The apex sits inboard of the node (the fillet rounds the
    // curb ring, inset from the centerline), so the apex→corner gap ≈ the inset.
    const cornerIdxs = sharpCornerIndices(tile.ring)
    const pairs = []
    for (let ci = 0; ci < cornerIdxs.length; ci++) {
      const V = tile.ring[cornerIdxs[ci]]
      for (let k = 0; k < fSink.length; k++) {
        const f = fSink[k]
        pairs.push({ ci, k, d: Math.hypot(f.apex[0] - V[0], f.apex[1] - V[1]) })
      }
    }
    pairs.sort((a, b) => a.d - b.d)
    const filletForCorner = new Array(cornerIdxs.length).fill(-1)
    const filletClaimed = new Array(fSink.length).fill(false)
    for (const p of pairs) {
      if (filletForCorner[p.ci] >= 0 || filletClaimed[p.k]) continue
      filletForCorner[p.ci] = p.k
      filletClaimed[p.k] = true
    }
    for (let ci = 0; ci < cornerIdxs.length; ci++) {
      const vi = cornerIdxs[ci]
      const V = tile.ring[vi]
      const key = cornerKeyAt(V, tile.edges, vi)
      // Split the key's two legs for the write path (legOut/legIn at this corner)
      // — same derivation as cornerKeyAt, so setCornerCornerRadius(V, legA, legB)
      // round-trips to exactly this key.
      const ne = tile.edges.length
      const eOut = tile.edges[vi], eIn = tile.edges[(vi - 1 + ne) % ne]
      const legA = `${skelOf(eOut.streetIdx)}:${eOut.forward ? 'f' : 'b'}`
      const legB = `${skelOf(eIn.streetIdx)}:${eIn.forward ? 'b' : 'f'}`
      const k = filletForCorner[ci]
      let fillet = null
      if (k >= 0) {
        const f = fSink[k]
        fillet = { C: f.C, r: f.r, tA: f.tA, tB: f.tB, apex: f.apex }
        cornerFillets[key] = fillet
      }
      cornerSet.push({ key, V, legA, legB, vertR: vertR[vi], fillet })
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
    // Freeze the achieved fillet arcs (the curb corners) so sectionPass can bend
    // the ped band around each one as an annular SECTOR (RIBBONS §3.9a step 10),
    // not mask it with a disk. Each = { apex, C, r, tA, tB } from filletRing.
    shapeTiles.push({ ring: tile.ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, roundTipKeys, runs: runMeta, bandJoin, cap, fillets: fSink, ...(medClip.length ? { med: medClip } : {}) })
  }

  // ── THE WALL · Phase C · the cut ───────────────────────────────────
  // The interior authored ped comes from the module-level sectionPass, handed
  // ONLY the frozen shapeTiles + design params. It has no handle on the chain,
  // so it physically cannot reach back — Section's shape input changes only when
  // this shape pass re-runs. (The perimeter G9 below stays here on the shape
  // side, where reading the chain is legitimate — Jacob's Option 1.)
  const { Wacc, tlByLu, luByLu } = sectionPass(shapeTiles, cw, stripMat, blockCustoms)

  // Grade-separated roads paint as flat strips — excluded from faces above, stroked
  // here off their own centerline at the frame's pavementHW half-width. One flat level
  // (no z-separation yet); stencil-clipped with the rest below. HIGHWAY-class ones
  // route to their OWN `highway` output (its own layer toggle + material, matching the
  // figure-ground `highway` group) so the freeway can be toggled/shaded apart from
  // local streets; local grade-sep bridges stay asphalt.
  const HIGHWAY_CLASSES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
  const Hacc = []
  for (const s of gradeSep) {
    // Tight arc-length sampling (1.5 m vs the ~6 m default): the highway stroke is
    // wide (W≈17 m), so coarse arcs facet and the offset gaps on tight ramp bends
    // (RIBBONS §3.3). The 3rd arg is now a spacing override (meters), not a sample
    // count — see smoothChain. 1.5 m keeps ramp bends kink-free post-RDP.
    const WIDE_SPACING = 1.5
    const sm = smooth > 0 ? (smoothChain(s.points, smooth, WIDE_SPACING, junctionKeys) || s.points) : s.points
    const hw = Math.max(s.measure?.left?.pavementHW || 0, s.measure?.right?.pavementHW || 0)
    if (hw <= 1e-6) continue
    ;(HIGHWAY_CLASSES.has(s.highway) ? Hacc : Aacc).push(...strokeOpen(sm, hw))
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
        let pieces = strokeOpen(streets[i].points, d)
        // [E3.2] junction keep-outs cut the chain's OWN stroke back to the
        // constructed curb within a window (the tooth class on the perimeter).
        if (level === 'A' && jPerimCuts.size) {
          const so = streetsOrig[i]
          const cuts = jPerimCuts.get((so && (so.skelId || so.name)) || '')
          if (cuts?.length) pieces = differenceRings(pieces, cuts)
        }
        stads.push(...pieces)
      }
      // [E3.2] perimeter-datum window polys — the constructed junction
      // coverage (dips, wedges, the de-tapered curb) for perimeter joins.
      if (level === 'A' && jPerimPolys.length) stads.push(...jPerimPolys)
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
  return { asphalt, highway, curb, sidewalk, treelawnByLu, luByClass, block, cornerFillets, cornerSet, _tiles: tiles, _perRunMeta: perTileMeta, _jPolys: jPolys, _jCornerCuts: jCornerCuts, _shapeArtifact }
}
