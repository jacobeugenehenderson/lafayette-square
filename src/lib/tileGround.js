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
import { pickLuFromHash, hashKey, blockKeyFromRing } from './buildBlockGeometryV2.js'

const SCALE = 1000
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]

// Offset CLOSED rings by `delta` (round join). Negative = erode/inset. Used to
// build the concentric ped bands by uniform inward offset of the R-rounded
// asphalt-inner region — eroding a rounded corner of radius r by d gives a
// concentric corner of radius r+d, which is exactly the nested-arc curb wrap.
function offsetRings(rings, delta) {
  if (!rings.length) return []
  if (delta === 0) return rings.map(r => r.slice())
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  for (const r of rings) if (r && r.length >= 3) co.AddPath(r.map(toClipper), JoinType.jtRound, EndType.etClosedPolygon)
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
function filletRing(ring, Rfn) {
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
function filletRings(rings, Rfn) {
  return rings.map(r => (r && r.length >= 3) ? filletRing(r, Rfn) : r)
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
const K_PINCH = 0.5
// Clamp a target radius to what a corner of interior angle θ and depth d_min can
// actually hold (figure-ground defaultR) — acute corners get a smaller R so the
// fillet fits and the inward ped offsets don't self-intersect.
function clampR(Rclass, dMin, theta) {
  if (theta <= 0 || theta >= Math.PI - 1e-3) return 0
  if (dMin <= 1e-6) return 0
  const s = Math.sin(theta / 2)
  const denom = 1 - s
  if (denom < 1e-6) return Math.min(Rclass, dMin)
  const Rmax = dMin * (1 - K_PINCH * s) / denom
  return Math.max(0, Math.min(Rclass, Rmax))
}
function circlePoly(cx, cy, r, seg = 32) {
  const out = []
  for (let i = 0; i < seg; i++) { const a = (i / seg) * 2 * Math.PI; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return out
}
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
  streets.forEach((s, si) => {
    const pts = s?.points
    if (!pts || pts.length < 2) return
    for (let i = 0; i < pts.length - 1; i++) addEdge(pts[i], pts[i + 1], si)
  })
  for (const n of nodes.values()) n.edges.sort((a, b) => a.angle - b.angle)
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

export function buildTileGround(ribbons, opts = {}) {
  const curbWidth = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH
  const stencil = opts.stencil && opts.stencil.length >= 3 ? opts.stencil : null
  // Smooth centerlines BEFORE face extraction so the grout (shared tile edges)
  // → tiles → strips all come out smooth — loops/curves round. smoothChain is
  // INTERPOLATING (passes through every authored vertex), so intersection
  // nodes survive exactly and the graph stays noded for the face walk. Default
  // 0.5 matches the figure-ground path + the store default (WYSIWYG).
  const smooth = Number.isFinite(opts.smooth) ? opts.smooth : 0.5
  let streets = (ribbons?.streets || []).filter(s => s?.points?.length >= 2)
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
  // Resolve a tile vertex's authored corner radius (PRE-scale). The leg from V
  // along the OUTGOING edge runs in +index iff that edge is forward → 'f'; the
  // leg along the INCOMING edge runs +index iff that edge is NOT forward → 'f'.
  const resolveVertR = (V, edges, i) => {
    const n = edges.length
    const ixk = ixKeyOf(V)
    if (cornerOverrides) {
      const eOut = edges[i], eIn = edges[(i - 1 + n) % n]
      const legOut = `${skelOf(eOut.streetIdx)}:${eOut.forward ? 'f' : 'b'}`
      const legIn  = `${skelOf(eIn.streetIdx)}:${eIn.forward ? 'b' : 'f'}`
      const [a, b] = legOut <= legIn ? [legOut, legIn] : [legIn, legOut]
      const v = cornerOverrides[`${ixk}|${a}|${b}`]
      if (Number.isFinite(+v)) return Math.max(0, +v)
    }
    if (ixOverrides && Number.isFinite(+ixOverrides[ixk])) return Math.max(0, +ixOverrides[ixk])
    return baseR
  }
  // Nearest tile-vertex R for a curb-line corner point (the fillet operates on
  // the asphalt-inner ring, whose corners sit inboard of the centerline node).
  const nearestVertR = (pt, ring, vertR) => {
    let bi = 0, bd = Infinity
    for (let i = 0; i < ring.length; i++) { const dx = ring[i][0] - pt[0], dy = ring[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
    return vertR[bi]
  }
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
  const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
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
      deadEndTips.set(tipKey(pts[idx]), { cap, hw, tl: tlw, sw: sww, px: pts[idx][0], py: pts[idx][1] })
    }
  }

  const tiles = extractFaces(streets)

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
  const Aacc = [], Cacc = [], Wacc = []
  const tlByLu = {}, luByLu = {}
  const pushLu = (map, lu, rings) => { if (rings.length) (map[lu] || (map[lu] = [])).push(...rings) }
  for (const tile of tiles) {
    const runs = groupRuns(tile)
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
      const d = edgeDepth(measures[run.streetIdx], run.side, cw, 'A')
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
    // authored radius (per-corner → per-IX → default 4.5), × the global scale,
    // then clamped to that corner's own angle + ped depth (acute corners can't
    // hold the full R). The fillet operates on the inboard curb ring, so map
    // each curb corner back to its nearest centerline node for the radius.
    const depth = cw + tl + sw
    const vertR = tile.ring.map((V, i) => resolveVertR(V, tile.edges, i))
    const cornerRfn = (pt, theta) => clampR(nearestVertR(pt, tile.ring, vertR) * scale, depth, theta)
    const iA = filletRings(differenceRings([tile.ring], aFill), cornerRfn)   // rounded asphalt-inner (curb line)
    const iC = offsetRings(iA, -cw)               // curb/treelawn boundary  (R+cw)
    const iT = offsetRings(iA, -(cw + tl))        // treelawn/sidewalk       (R+cw+tl)
    const iW = offsetRings(iA, -(cw + tl + sw))   // sidewalk/LU             (R+cw+tl+sw)
    const lu = luForRing(tile.ring)
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
      const td = edgeDepth(measures[run.streetIdx], run.side, cw, 'T')   // grout → treelawn-outer
      if (td <= 1e-6) continue
      const a = edgeDepth(measures[run.streetIdx], run.side, cw, 'A')
      // Pull the run back from each CORNER end by (asphalt-hw + that corner's
      // resolved R) so the slab ends at the tangent and the corner wedge becomes
      // the ADA all-SW pad. A ROUND dead-end is NOT trimmed (treelawn runs to the
      // tip + the wrap disk rounds it). Closed-loop runs aren't trimmed. Acute
      // corners just get a small fillet now (no special wrap — that made the
      // teardrop/notch artifacts).
      const last = run.poly[run.poly.length - 1]
      const k0 = tipKey(run.poly[0]), k1 = tipKey(last)
      const t0 = roundTipKeys.has(k0) ? 0 : a + nearestVertR(run.poly[0], tile.ring, vertR) * scale
      const t1 = roundTipKeys.has(k1) ? 0 : a + nearestVertR(last, tile.ring, vertR) * scale
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
    Aacc.push(...differenceRings([tile.ring], iA)) // asphalt = tile − rounded inner
    Cacc.push(...differenceRings(iA, iC))          // curb
    routeStrip(stripMat.outer, legOuter)           // outer ped strip (default LU)
    routeStrip(stripMat.inner, legInner)           // inner ped strip (default SW)
    Wacc.push(...cornerPad)                         // corner span — always SW (structural)
    pushLu(luByLu, lu, luRemainder)                 // land-use remainder (per class)
  }

  let asphalt = unionRings(Aacc)
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
    const iCp = offsetRings(iAp, -cw)
    const iTp = offsetRings(iAp, -(cw + tlP))
    const iWp = offsetRings(iAp, -(cw + tlP + swP))
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
    curb     = intersectRings(curb,     [stencil])
    sidewalk = intersectRings(sidewalk, [stencil])
  }
  const treelawnByLu = {}, luByClass = {}
  for (const k of Object.keys(tlByLu)) treelawnByLu[k] = stencil ? intersectRings(unionRings(tlByLu[k]), [stencil]) : unionRings(tlByLu[k])
  for (const k of Object.keys(luByLu)) luByClass[k]   = stencil ? intersectRings(unionRings(luByLu[k]), [stencil]) : unionRings(luByLu[k])

  return { asphalt, curb, sidewalk, treelawnByLu, luByClass, _tiles: tiles }
}
