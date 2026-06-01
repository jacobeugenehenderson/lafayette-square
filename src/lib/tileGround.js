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

const SCALE = 1000
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]

function offsetRings(rings, delta, join = 'round') {
  if (delta === 0) return rings.map(r => r.slice())
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)   // arcTolerance for smooth round joins
  const jt = join === 'round' ? JoinType.jtRound : JoinType.jtMiter
  for (const r of rings) if (r && r.length >= 3) co.AddPath(r.map(toClipper), jt, EndType.etClosedPolygon)
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
  const addEdge = (a, b) => {
    const na = nodeOf(a), nb = nodeOf(b)
    if (na.id === nb.id) return
    const ek = na.id < nb.id ? na.id + '_' + nb.id : nb.id + '_' + na.id
    if (edgeSet.has(ek)) return
    edgeSet.add(ek)
    const h1 = { from: na, to: nb, used: false }
    const h2 = { from: nb, to: na, used: false }
    h1.twin = h2; h2.twin = h1
    h1.angle = Math.atan2(nb.p[1] - na.p[1], nb.p[0] - na.p[0])
    h2.angle = Math.atan2(na.p[1] - nb.p[1], na.p[0] - nb.p[0])
    heList.push(h1, h2)
    na.edges.push(h1); nb.edges.push(h2)
  }
  for (const s of streets) {
    const pts = s?.points
    if (!pts || pts.length < 2) continue
    for (let i = 0; i < pts.length - 1; i++) addEdge(pts[i], pts[i + 1])
  }
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
    let h = h0, guard = 0
    do { h.used = true; ring.push(h.from.p); h = nextHE(h); if (++guard > 200000) break } while (h !== h0)
    faces.push(ring)
  }
  // Bounded faces = positive signed area (CCW). The single outer face is the
  // most-negative; drop everything with non-positive area. Pendant (dead-end)
  // edges are walked out-and-back inside their surrounding face — they leave a
  // zero-width spur that the inward Clipper offset collapses on its own.
  return faces.filter(r => signedArea(r) > 1e-3)
}

// Cumulative INWARD band depths from the grout. Symmetric (max of left/right)
// — toy's measure is symmetric; per-side asymmetry is a real-build refinement.
function bandDepths(measure, curbWidth) {
  const side = (s) => ({
    pavementHW: Number.isFinite(s?.pavementHW) ? s.pavementHW : 0,
    treelawn:   Number.isFinite(s?.treelawn)   ? s.treelawn   : 0,
    sidewalk:   Number.isFinite(s?.sidewalk)   ? s.sidewalk   : 0,
  })
  const L = side(measure?.left), R = side(measure?.right)
  const pavementHW = Math.max(L.pavementHW, R.pavementHW)
  const treelawn   = Math.max(L.treelawn,   R.treelawn)
  const sidewalk   = Math.max(L.sidewalk,   R.sidewalk)
  return { pavementHW, curb: pavementHW > 0 ? curbWidth : 0, treelawn, sidewalk }
}

export function buildTileGround(ribbons, opts = {}) {
  const curbWidth = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH
  const stencil = opts.stencil && opts.stencil.length >= 3 ? opts.stencil : null
  const streets = (ribbons?.streets || []).filter(s => s?.points?.length >= 2)

  // One global band profile for the spike. Toy's streets are uniform; using a
  // single max profile keeps the tile insets consistent (per-tile-edge widths
  // are a real-build refinement — they need the fe/grout-edge tagging).
  let hwMax = 0, tlMax = 0, swMax = 0
  for (const s of streets) {
    const d = bandDepths(s.measure, curbWidth)
    hwMax = Math.max(hwMax, d.pavementHW)
    tlMax = Math.max(tlMax, d.treelawn)
    swMax = Math.max(swMax, d.sidewalk)
  }
  const dA = hwMax
  const dC = dA + curbWidth
  const dT = dC + tlMax
  const dW = dT + swMax

  const tiles = extractFaces(streets)

  // Per tile: inward offsets (round join → rounded convex curb corners), then
  // successive differences are the strips. Union across tiles per material.
  const Aacc = [], Cacc = [], Tacc = [], Wacc = [], Lacc = []
  for (const tile of tiles) {
    const ring = [tile]
    const insA = offsetRings(ring, -dA, 'round')
    const insC = offsetRings(ring, -dC, 'round')
    const insT = offsetRings(ring, -dT, 'round')
    const insW = offsetRings(ring, -dW, 'round')
    Aacc.push(...differenceRings(ring,  insA))   // asphalt  = tile − inset(hw)
    Cacc.push(...differenceRings(insA,  insC))   // curb
    Tacc.push(...differenceRings(insC,  insT))   // treelawn
    Wacc.push(...differenceRings(insT,  insW))   // sidewalk
    Lacc.push(...insW)                           // land-use = innermost remainder
  }
  let asphalt  = unionRings(Aacc)
  let curb     = unionRings(Cacc)
  let treelawn = unionRings(Tacc)
  let sidewalk = unionRings(Wacc)
  let luInner  = unionRings(Lacc)

  // Perimeter (outer face, beyond the outermost streets) fills as LU too:
  // stencil − union(all tiles). Combined with the tile-center LU remainder,
  // every non-hardscape pixel is land-use. No figure-ground, no block polygon.
  let lu = luInner
  if (stencil) {
    const tileUnion = unionRings(tiles)
    const perimeter = differenceRings([stencil], tileUnion)
    lu = unionRings([...luInner, ...perimeter])
    asphalt  = intersectRings(asphalt,  [stencil])
    curb     = intersectRings(curb,     [stencil])
    treelawn = intersectRings(treelawn, [stencil])
    sidewalk = intersectRings(sidewalk, [stencil])
    lu       = intersectRings(lu,       [stencil])
  }

  return { asphalt, curb, treelawn, sidewalk, lu, _tiles: tiles }
}
