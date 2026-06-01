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
function circlePoly(cx, cy, r, seg = 24) {
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
      edges.push({ streetIdx: h.streetIdx, side: h.forward ? 'right' : 'left' })
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
  // A2 — corner R reads the authored controls: base 4.5 m (AASHTO residential
  // baseline, R_CLASS_DEFAULT) × the global Corners slider (cornerRadiusScale),
  // clamped ≥ 0. Per-corner/per-IX cornerRadiusOverrides (empty on LS today)
  // need the corner-identity mapping — folded in with the T3 UI migration.
  const baseR = Number.isFinite(opts.cornerR) ? opts.cornerR : 4.5
  const scale = Number.isFinite(opts.cornerRadiusScale) ? opts.cornerRadiusScale : 1
  const R = Math.max(0, baseR * scale)

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
    const aStads = []
    for (const run of runs) {
      const d = edgeDepth(measures[run.streetIdx], run.side, cw, 'A')
      if (d > 1e-6) aStads.push(...strokeOpen(run.poly, d))
    }
    const aFill = aStads.length ? intersectRings(unionRings(aStads), [tile.ring]) : []
    const iA = openRound(differenceRings([tile.ring], aFill), R)   // rounded asphalt-inner (curb line)
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
    for (const run of runs) {
      const td = edgeDepth(measures[run.streetIdx], run.side, cw, 'T')   // grout → treelawn-outer
      if (td <= 1e-6) continue
      const a = edgeDepth(measures[run.streetIdx], run.side, cw, 'A')
      // Pull the run back from its corner ends by (asphalt-hw + R) so the slab
      // ends at the tangent; closed-loop runs (no corners) aren't trimmed.
      const poly = runs.length > 1 ? trimPolyline(run.poly, a + R, a + R) : run.poly
      if (poly && poly.length >= 2) tlSlabs.push(...strokeOpen(poly, td))
    }
    const straightZone = runs.length > 1 ? (tlSlabs.length ? unionRings(tlSlabs) : []) : null
    const tlBand = differenceRings(iC, iT)
    const treelawn = straightZone ? intersectRings(tlBand, straightZone) : tlBand
    const sidewalk = differenceRings(differenceRings(iC, iW), treelawn)  // corner span = solid SW pad
    Aacc.push(...differenceRings([tile.ring], iA)) // asphalt = tile − rounded inner
    Cacc.push(...differenceRings(iA, iC))          // curb
    pushLu(tlByLu, lu, treelawn)                    // treelawn (straight legs only)
    Wacc.push(...sidewalk)                          // sidewalk (incl. the ADA corner annulus)
    pushLu(luByLu, lu, iW)                          // land-use remainder (per class)
  }

  // Perimeter (outer face, beyond the outermost streets) fills as LU, routed by
  // its own class probe. NOTE — placeholder: the outermost streets are
  // half-roaded on their outer side because the perimeter is not yet a per-edge-
  // tagged tile (G9). Combined with tile-center LU, every non-hardscape pixel
  // is land-use — no figure-ground, no block polygon.
  let asphalt = unionRings(Aacc)
  let curb    = unionRings(Cacc)
  let sidewalk = unionRings(Wacc)
  if (stencil) {
    const tileUnion = unionRings(tiles.map(t => t.ring))
    const perimeter = differenceRings([stencil], tileUnion)   // frame: outer(s) + tile-network holes
    if (perimeter.length) {
      // Class from the largest outer; push the WHOLE holed region (keep the CW
      // holes — dropping them turns the frame into the full stencil and paints
      // over every per-class block centre). One class for the edge-of-map land
      // is fine; proper per-edge perimeter tiles are G9.
      let big = null, bigA = 0
      for (const r of perimeter) { const a = signedArea(r); if (a > bigA) { bigA = a; big = r } }
      pushLu(luByLu, big ? luForRing(big) : 'unknown', perimeter)
    }
    asphalt  = intersectRings(asphalt,  [stencil])
    curb     = intersectRings(curb,     [stencil])
    sidewalk = intersectRings(sidewalk, [stencil])
  }
  const treelawnByLu = {}, luByClass = {}
  for (const k of Object.keys(tlByLu)) treelawnByLu[k] = stencil ? intersectRings(unionRings(tlByLu[k]), [stencil]) : unionRings(tlByLu[k])
  for (const k of Object.keys(luByLu)) luByClass[k]   = stencil ? intersectRings(unionRings(luByLu[k]), [stencil]) : unionRings(luByLu[k])

  return { asphalt, curb, sidewalk, treelawnByLu, luByClass, _tiles: tiles }
}
