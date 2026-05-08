/**
 * buildBlockGeometryV2 — prototype of the rounded-block-clip model.
 *
 * Inverts the figure-ground vs. the legacy ribbon emitter:
 *   block = positive space, asphalt = void around blocks.
 *   Round-corners is applied to the BLOCK polygon's convex vertices
 *   (which are concave vertices of the asphalt void).
 *
 * v0 scope (toy v1): compute the asphalt union, identify IX corners,
 * apply default-R rule with k=0.5 pinch, return both sharp and rounded
 * asphalt rings for visual debug. Strip bands, corner caps, curb stroke,
 * and authoring-kit overrides land in later passes.
 *
 * Coord space: ribbons.json [x, z] in meters, origin at neighborhood
 * center.
 */
import clipperLib from 'clipper-lib'
import { CURB_WIDTH } from '../cartograph/streetProfiles.js'

const SCALE = 1000
const ARC_N = 16
const RAD = Math.PI / 180

const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]

function unit(v) {
  const l = Math.hypot(v[0], v[1])
  return l > 1e-9 ? [v[0] / l, v[1] / l] : [1, 0]
}

// Per-vertex bisector perpendicular. Mirror of computePerps in
// ribbonsGeometry.js so chain pavement rings here align with the
// existing ribbon stripes.
function computePerps(pts) {
  const n = pts.length
  return pts.map((_, i) => {
    let nx = 0, nz = 0
    if (i < n - 1) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    const l = Math.hypot(nx, nz)
    if (l < 1e-9) return [0, 1]
    return [nx / l, nz / l]
  })
}

// Pavement ring = closed polygon at perp ±pavementHW from centerline.
// Caps:
//   'round'             → half-disk around the endpoint (cul-de-sac)
//   'blunt' / 'none' /  → straight closure (current default; relies on the
//   null / undefined      asphalt union covering the endpoint when it joins
//                         another chain at an IX)
// Cap fields read both `street.capStart`/`street.capEnd` (live store shape,
// from SurveyorPanel) and `street.capEnds.start`/`.end` (baked ribbons.json
// shape, from derive-toy.js) — so the same helper serves live + bake.
function chainPavementRing(street) {
  const pts = street.points
  const m = street.measure
  if (!pts || pts.length < 2 || !m) return null
  const hwL = m.left?.pavementHW ?? 0
  const hwR = m.right?.pavementHW ?? 0
  if (hwL <= 0 && hwR <= 0) return null
  const perps = computePerps(pts)
  // Sign convention matches V1's MeasureOverlay: 'left' is at -perp from
  // the centerline (north of an east-bound chain), 'right' is at +perp
  // (south). Operator drags 'right' handle → m.right.pavementHW grows →
  // visible right band grows. Inverting either side here breaks that
  // contract and the asphalt expands on the wrong side of the screen.
  const leftSide  = pts.map((p, i) => [p[0] - perps[i][0] * hwL, p[1] - perps[i][1] * hwL])
  const rightSide = pts.map((p, i) => [p[0] + perps[i][0] * hwR, p[1] + perps[i][1] * hwR])

  const n = pts.length
  const capStart = street.capStart || street.capEnds?.start
  const capEnd   = street.capEnd   || street.capEnds?.end
  const ARC_SEGS = 16

  // Build a half-circle arc of (ARC_SEGS - 1) interior points sweeping CCW
  // from `fromPt` to `toPt`, both on a circle of radius `r` centered at `c`.
  // Endpoints are NOT included (they're already in rightSide / leftSide).
  const halfArc = (c, r, fromPt, toPt) => {
    const a0 = Math.atan2(fromPt[1] - c[1], fromPt[0] - c[0])
    const a1 = Math.atan2(toPt[1] - c[1], toPt[0] - c[0])
    let delta = a1 - a0
    while (delta < 0) delta += 2 * Math.PI
    const out = []
    for (let k = 1; k < ARC_SEGS; k++) {
      const a = a0 + delta * (k / ARC_SEGS)
      out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])
    }
    return out
  }

  // End cap: bridge leftSide[last] → rightSide[last] going OUTWARD past
  // the chain's last vertex. With the V1-aligned sign convention
  // (leftSide at -perp, rightSide at +perp), CCW from leftSide to
  // rightSide travels through +tangent (= outward past the chain end).
  // Polygon walks leftSide forward then rightSide reversed.
  const endArc = capEnd === 'round'
    ? halfArc(pts[n - 1], Math.max(hwL, hwR), leftSide[n - 1], rightSide[n - 1])
    : []
  // Start cap: bridge rightSide[0] → leftSide[0] going OUTWARD past the
  // chain's first vertex. CCW from rightSide to leftSide travels through
  // -tangent (outward past the chain start).
  const startArc = capStart === 'round'
    ? halfArc(pts[0], Math.max(hwL, hwR), rightSide[0], leftSide[0])
    : []

  return [...leftSide, ...endArc, ...rightSide.slice().reverse(), ...startArc]
}

function unionRings(rings) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let added = 0
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    c.AddPath(ring.map(toClipper), PolyType.ptSubject, true)
    added++
  }
  if (!added) return []
  const out = []
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(path => path.map(fromClipper))
}

// Strip depth = treelawn + sidewalk (only when terminal=='sidewalk', else 0).
function depthForSide(s) {
  if (s?.terminal !== 'sidewalk') return 0
  return (s?.treelawn || 0) + (s?.sidewalk || 0)
}

// Default-R rule (k = 0.5 pinch tolerance). See NOTES.md 2026-05-07.
//   R = min(R_class, R_max(d_min, θ, k))
//   R_max = d × (1 - k·sin(θ/2)) / (1 - sin(θ/2))
const K_PINCH = 0.5
const R_CLASS_DEFAULT = 4.5  // residential×residential AASHTO baseline
function defaultR(R_class, d_min, theta) {
  if (theta < 5 * RAD || theta > 175 * RAD) return 0
  if (d_min <= 1e-6) return 0
  const sin = Math.sin(theta / 2)
  const denom = 1 - sin
  if (denom < 1e-6) return Math.min(R_class, d_min)  // near-collinear safety
  const Rmax = d_min * (1 - K_PINCH * sin) / denom
  return Math.max(0, Math.min(R_class, Rmax))
}

// Resolve an IX-street reference (name + sref.ix) to a specific chain and
// vertex index. Handles two real-world quirks of LS-baked ribbons.json:
//   1. Multiple chains share a name (35 LS names span 164 chain entries).
//   2. sref.ix is stale on ~36% of LS IX-refs (chain points were re-coord-
//      inated upstream without updating the IX index).
// Strategy:
//   - Iterate all chains matching sref.name (not just the first).
//   - On each candidate, prefer chain.points[sref.ix] if it lands within
//     tolerance of V; otherwise scan all vertices for the nearest to V.
//   - `claimed` set prevents double-assigning a chain when two srefs have
//     the same name (the dupe-named-pair-across-an-IX pattern).
// Returns { chain, vertexIdx } or null if no candidate is within tolerance.
function resolveIxRef(sref, V, streetsByName, claimed) {
  const TOL = 0.5
  const candidates = streetsByName.get(sref.name) || []
  let best = null
  for (const chain of candidates) {
    if (claimed.has(chain)) continue
    const pts = chain.points
    if (!pts || pts.length < 2) continue
    // Honor sref.ix if it points at V (within tol).
    const i = sref.ix
    if (i != null && i >= 0 && i < pts.length) {
      const d = Math.hypot(pts[i][0] - V[0], pts[i][1] - V[1])
      if (d < TOL && (!best || d < best.d)) best = { chain, vertexIdx: i, d }
    }
    if (best && best.d < 1e-3) continue  // Already a near-perfect match.
    // Fallback: nearest vertex on this chain.
    let bi = -1, bd = Infinity
    for (let k = 0; k < pts.length; k++) {
      const d = Math.hypot(pts[k][0] - V[0], pts[k][1] - V[1])
      if (d < bd) { bd = d; bi = k }
    }
    if (bd < TOL && (!best || bd < best.d)) best = { chain, vertexIdx: bi, d: bd }
  }
  return best
}

// Stable key for an intersection point — matches CornerEditHandles' ixKey
// so per-IX overrides keyed there are applied here.
function ixKey(p) { return `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}` }
function sortedCornerKey(V, legKeyA, legKeyB) {
  const [a, b] = (legKeyA <= legKeyB) ? [legKeyA, legKeyB] : [legKeyB, legKeyA]
  return `${ixKey(V)}|${a}|${b}`
}

// For each IX, pair adjacent legs (sorted CCW around V) into corners.
// Each corner has metadata: position (Vc), interior angle θ, d_min, R_class.
// `ixOverrides` (map<ixKey, R>) and `cornerOverrides` (map<sortedCornerKey, R>)
// carry operator-authored radii from the active Look's design — applied with
// per-corner > per-IX > default-R-rule precedence, all × cornerRadiusScale.
function cornersAtIx(ix, streetsByName, ixOverrides, cornerOverrides) {
  const V = ix.point
  if (!ix.streets || ix.streets.length < 2) return []
  const legs = []
  const claimed = new Set()
  for (const sref of ix.streets) {
    const match = resolveIxRef(sref, V, streetsByName, claimed)
    if (!match) continue
    claimed.add(match.chain)
    const chain = match.chain
    const ixIdx = match.vertexIdx
    const pts = chain.points
    const m = chain.measure
    if (!m) continue
    const skel = chain.skelId || chain.name || '?'
    const buildLeg = (dir) => {
      const ni = ixIdx + dir
      if (ni < 0 || ni >= pts.length) return null
      const dx = pts[ni][0] - V[0], dz = pts[ni][1] - V[1]
      const L = Math.hypot(dx, dz)
      if (L < 1e-6) return null
      const isBack = dir === -1
      // When walking BACK from V (dir=-1), the chain's "left" becomes
      // our right (we're facing the opposite direction along the chain).
      const left  = isBack ? m.right : m.left
      const right = isBack ? m.left  : m.right
      return {
        T: [dx / L, dz / L],
        outerL: left?.pavementHW || 0,
        outerR: right?.pavementHW || 0,
        leftDepth:  depthForSide(left),
        rightDepth: depthForSide(right),
        legKey: `${skel}:${dir === -1 ? 'b' : 'f'}`,
      }
    }
    if (ixIdx > 0) { const l = buildLeg(-1); if (l) legs.push(l) }
    if (ixIdx < pts.length - 1) { const l = buildLeg(+1); if (l) legs.push(l) }
  }
  if (legs.length < 2) return []
  legs.sort((a, b) => Math.atan2(a.T[1], a.T[0]) - Math.atan2(b.T[1], b.T[0]))

  const corners = []
  const n = legs.length
  for (let i = 0; i < n; i++) {
    const A = legs[i], B = legs[(i + 1) % n]
    let theta = Math.atan2(B.T[1], B.T[0]) - Math.atan2(A.T[1], A.T[0])
    while (theta < 0) theta += 2 * Math.PI
    while (theta >= 2 * Math.PI) theta -= 2 * Math.PI
    if (theta < 5 * RAD || theta > 355 * RAD) continue

    // Block corner = intersection of A's RIGHT curb-outer and B's LEFT
    // curb-outer. Legs are sorted CCW; the wedge between two adjacent
    // legs (CCW from A to B) sits on A's right and B's left in the V2
    // chainPavementRing convention (left = -perp, right = +perp). The
    // OLD convention had this inverted (left = +perp); cornersAtIx was
    // written for that and used outerL on A and outerR on B. After the
    // 2026-05-08 chainPavementRing flip we use outerR on A + outerL on
    // B to match the same physical sides chainPavementRing emits the
    // polygon edges on. Symptom of getting this wrong: corners look
    // correct on chains with symmetric measure (point-symmetric polygon
    // hides the side mismatch) but break the moment the operator edits
    // one side asymmetrically. Perp-left of T = (-Ty, Tx).
    const P_A = [-A.T[1], A.T[0]]
    const P_B = [-B.T[1], B.T[0]]
    // A's RIGHT curb passes through V + A.outerR · P_A, along A.T.
    const A0 = [V[0] + A.outerR * P_A[0], V[1] + A.outerR * P_A[1]]
    // B's LEFT curb passes through V - B.outerL · P_B, along B.T.
    const B0 = [V[0] - B.outerL * P_B[0], V[1] - B.outerL * P_B[1]]
    // Intersect A0 + s·A.T = B0 + t·B.T.
    const det = A.T[0] * (-B.T[1]) - A.T[1] * (-B.T[0])
    if (Math.abs(det) < 1e-9) continue
    const dx = B0[0] - A0[0], dz = B0[1] - A0[1]
    const s = (dx * (-B.T[1]) - dz * (-B.T[0])) / det
    const Vc = [A0[0] + s * A.T[0], A0[1] + s * A.T[1]]

    const d_A = A.rightDepth   // A's RIGHT side faces this corner.
    const d_B = B.leftDepth    // B's LEFT side faces this corner.
    const d_min = Math.min(d_A, d_B)

    // Override lookup: per-corner key wins over per-IX key. Both are
    // pre-scale meters; the scale is applied later in applyRoundCornersToRing.
    const cornerKey = sortedCornerKey(V, A.legKey, B.legKey)
    let R_authored = null
    if (cornerOverrides && Number.isFinite(cornerOverrides[cornerKey])) {
      R_authored = cornerOverrides[cornerKey]
    } else if (ixOverrides && Number.isFinite(ixOverrides[ixKey(V)])) {
      R_authored = ixOverrides[ixKey(V)]
    }

    corners.push({
      point: Vc,
      theta,
      d_min,
      R_class: R_CLASS_DEFAULT,
      R_authored,
    })
  }
  return corners
}

// Replace polygon vertex at `cur` with an arc of radius R tangent to
// the in/out edges. Caller has already verified this is a convex-block
// vertex (right turn when walking CCW around the asphalt void) and
// computed R via the default-R rule.
function arcReplaceVertex(prev, cur, next, R, theta) {
  const inDir = unit([cur[0] - prev[0], cur[1] - prev[1]])
  const outDir = unit([next[0] - cur[0], next[1] - cur[1]])
  const halfTheta = theta / 2
  const tanH = Math.tan(halfTheta)
  if (tanH <= 1e-6) return [cur]
  const inset = R / tanH
  const tA = [cur[0] - inset * inDir[0], cur[1] - inset * inDir[1]]
  const tB = [cur[0] + inset * outDir[0], cur[1] + inset * outDir[1]]
  // Right-turn convention: arc center is to the right of inDir.
  // Right-perp of inDir = (inDir.y, -inDir.x).
  const normalA = [inDir[1], -inDir[0]]
  const center = [tA[0] + R * normalA[0], tA[1] + R * normalA[1]]
  const a1 = Math.atan2(tA[1] - center[1], tA[0] - center[0])
  const a2 = Math.atan2(tB[1] - center[1], tB[0] - center[0])
  let da = a2 - a1
  // Walk the SHORT arc.
  if (da > Math.PI) da -= 2 * Math.PI
  if (da < -Math.PI) da += 2 * Math.PI
  const out = [tA]
  for (let k = 1; k < ARC_N; k++) {
    const a = a1 + (da * k / ARC_N)
    out.push([center[0] + R * Math.cos(a), center[1] + R * Math.sin(a)])
  }
  out.push(tB)
  return out
}

function applyRoundCornersToRing(ring, corners, scale = 1) {
  // Walk CCW around the asphalt void's outer ring. At each vertex check:
  //   1. Spatial match against precomputed IX corners (within tolerance).
  //   2. Cross product of in/out edges < 0 (right turn → block-convex).
  // If both pass, replace vertex with arc.
  const TOL = 0.5
  const n = ring.length
  const out = []
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]
    const cur = ring[i]
    const next = ring[(i + 1) % n]
    let matched = null
    for (const c of corners) {
      if (Math.hypot(cur[0] - c.point[0], cur[1] - c.point[1]) < TOL) { matched = c; break }
    }
    if (!matched) { out.push(cur); continue }
    const inDir = unit([cur[0] - prev[0], cur[1] - prev[1]])
    const outDir = unit([next[0] - cur[0], next[1] - cur[1]])
    const cross = inDir[0] * outDir[1] - inDir[1] * outDir[0]
    if (cross >= 0) { out.push(cur); continue }  // not block-convex
    // Authored override (per-corner or per-IX) bypasses the default-R cap —
    // operator's intent wins, even past the geometric pinch threshold.
    // Reverting an override (deleting the key) returns a non-finite value
    // here and falls through to the default-R rule.
    const baseR = Number.isFinite(matched.R_authored)
      ? matched.R_authored
      : defaultR(matched.R_class, matched.d_min, matched.theta)
    const R = baseR * scale
    if (R <= 0.05) { out.push(cur); continue }
    const arc = arcReplaceVertex(prev, cur, next, R, matched.theta)
    for (const p of arc) out.push(p)
  }
  return out
}

// Block = stencil − asphalt. Each input is an array of rings (from
// Clipper-union output for asphalt, single-ring array for stencil).
function differenceRings(subjectRings, clipRings) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let added = 0
  for (const r of subjectRings) {
    if (!r || r.length < 3) continue
    c.AddPath(r.map(toClipper), PolyType.ptSubject, true)
    added++
  }
  for (const r of clipRings) {
    if (!r || r.length < 3) continue
    c.AddPath(r.map(toClipper), PolyType.ptClip, true)
  }
  if (!added) return []
  const out = []
  c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(path => path.map(fromClipper))
}

// Even-odd point-in-ring test. Used to find which block polygon contains
// a given world-point (chain-segment midpoint perp-offset by hw + 1 m, in
// the per-segment block-adjacency lookup).
function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// Walk a chain's vertex sequence and partition it into natural segments
// bounded by IX vertices. Returns [{ start, end }] inclusive ranges that
// together cover the full chain. A chain with no IXs returns one segment
// spanning the whole chain.
function naturalSegments(street) {
  const n = (street.points || []).length
  if (n < 2) return []
  const ixs = (street.intersections || [])
    .map(r => r.ix).filter(i => Number.isInteger(i) && i > 0 && i < n - 1)
    .sort((a, b) => a - b)
  if (!ixs.length) return [{ start: 0, end: n - 1 }]
  const segs = []
  let prev = 0
  for (const ix of ixs) {
    if (ix > prev) segs.push({ start: prev, end: ix })
    prev = ix
  }
  if (prev < n - 1) segs.push({ start: prev, end: n - 1 })
  return segs
}

// For a chain segment and a side (sideSign = +1 left, -1 right), return
// the index of the block in blockRounded that's adjacent on that side, or
// null if no block contains the perp-offset midpoint. Probe distance is
// hw + 1 m so the test point lands solidly inside the adjacent block
// (past the asphalt + curb).
function adjacentBlockId(pts, perps, segStart, segEnd, sideSign, hw, blockRounded) {
  if (!blockRounded?.length) return null
  const midI = Math.floor((segStart + segEnd) / 2)
  // Use the segment midpoint between two vertices for stability — perps at
  // an IX vertex can swing wildly when the chain bends sharply.
  const aI = midI, bI = Math.min(midI + 1, segEnd)
  const mx = (pts[aI][0] + pts[bI][0]) * 0.5
  const mz = (pts[aI][1] + pts[bI][1]) * 0.5
  const px = (perps[aI][0] + perps[bI][0]) * 0.5
  const pz = (perps[aI][1] + perps[bI][1]) * 0.5
  const probeR = hw + 1.0
  const tx = mx + px * sideSign * probeR
  const tz = mz + pz * sideSign * probeR
  for (let i = 0; i < blockRounded.length; i++) {
    if (pointInRing(tx, tz, blockRounded[i])) return i
  }
  return null
}

// Outward polygon offset (Minkowski sum with a disc of radius `delta`).
// Uses miter joins so the result preserves the vertex structure of the
// input — corners that are already smooth polyline arcs (asphaltRounded)
// stay smooth. The clipping rounding lives in the input geometry, not in
// the offset op.
function dilateRings(rings, delta) {
  if (delta <= 0 || !rings.length) return rings
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset()
  for (const r of rings) {
    if (!r || r.length < 3) continue
    co.AddPath(r.map(toClipper), JoinType.jtMiter, EndType.etClosedPolygon)
  }
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(path => path.map(fromClipper))
}

// Intersection of subject rings with clip rings.
function intersectRings(subjectRings, clipRings) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let addedS = 0, addedC = 0
  for (const r of subjectRings) {
    if (!r || r.length < 3) continue
    c.AddPath(r.map(toClipper), PolyType.ptSubject, true)
    addedS++
  }
  for (const r of clipRings) {
    if (!r || r.length < 3) continue
    c.AddPath(r.map(toClipper), PolyType.ptClip, true)
    addedC++
  }
  if (!addedS || !addedC) return []
  const out = []
  c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(path => path.map(fromClipper))
}

// Closed band ring: outer edge forward, inner edge backward.
//   `side` = +1 for left of chain tangent, -1 for right.
//   `dInner` = perp distance from centerline at the band's inner edge.
//   `dOuter` = perp distance from centerline at the band's outer edge.
// (Outer is FURTHER from centerline = deeper into the block.)
function chainStripBand(pts, perps, side, dInner, dOuter) {
  if (dOuter <= dInner) return null
  const inner = pts.map((p, i) => [p[0] + side * perps[i][0] * dInner, p[1] + side * perps[i][1] * dInner])
  const outer = pts.map((p, i) => [p[0] + side * perps[i][0] * dOuter, p[1] + side * perps[i][1] * dOuter])
  // Walk outer forward then inner backward → CCW for left-side bands,
  // CW for right-side bands (which is fine — Clipper non-zero handles both).
  return [...outer, ...inner.slice().reverse()]
}

// Round-cap band extension: a half-annulus around a chain endpoint that
// lets the strip bands wrap continuously around the cap (concentric arcs at
// dInner/dOuter, sweeping 180° through the FORWARD direction off the chain
// end). Returned as a closed polygon.
//   `center` = chain endpoint (pts[0] or pts[n-1])
//   `T_out`  = unit tangent pointing OFF the chain at this end
//              (= forward at end, = -forward at start)
function roundCapHalfAnnulus(center, T_out, dInner, dOuter) {
  if (dOuter <= dInner || dInner <= 0) return null
  const ARC = 16
  // perp_right of T_out is the "starting" angle of the cap arc; sweep CCW
  // 180° through T_out (forward) to perp_left of T_out.
  // perp_right(T) = (Ty, -Tx) → angle = atan2(-Tx, Ty)
  const startA = Math.atan2(-T_out[0], T_out[1])
  const endA   = startA + Math.PI
  const inner = []
  const outer = []
  for (let k = 0; k <= ARC; k++) {
    const a = startA + (endA - startA) * (k / ARC)
    inner.push([center[0] + dInner * Math.cos(a), center[1] + dInner * Math.sin(a)])
    outer.push([center[0] + dOuter * Math.cos(a), center[1] + dOuter * Math.sin(a)])
  }
  // Closed: outer forward + inner reverse. Connects flush to the straight
  // chain bands at both endpoints (perp_right and perp_left of T_out).
  return [...outer, ...inner.slice().reverse()]
}

export function buildBlockGeometryV2(ribbons, opts = {}) {
  const { cornerRadiusScale = 1, stencil = null,
    cornerRadiusOverrides = null, cornerCornerRadiusOverrides = null,
    curbWidth = CURB_WIDTH, blockCustoms = null } = opts
  const streets = ribbons?.streets || []
  const intersections = ribbons?.intersections || []

  // Per-chain rendering data. Each entry holds the rings that belong to
  // a single chain (asphalt, treelawn, sidewalk). Block + curb stay
  // unified across the scene because they're block-level surfaces. The
  // per-chain split is what lets BlockGeometryV2Debug dim a single
  // chain's bands when the operator selects it in Measure mode.
  const byChain = []
  for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) {
    const street = streets[chainIdx]
    if (street?.disabled) { byChain.push(null); continue }
    const pavementRing = chainPavementRing(street)
    byChain.push({
      chainIdx,
      name: street.name,
      asphaltRings:  pavementRing ? [pavementRing] : [],
      treelawnRings: [],
      sidewalkRings: [],
    })
  }
  const asphaltRings = byChain.flatMap(c => (c?.asphaltRings) || [])
  const asphaltSharp = unionRings(asphaltRings)

  // Multi-value name map — LS has 35 names spanning 164 chain entries (a
  // single-valued Map silently picks the wrong chain ~68% of the time).
  const streetsByName = new Map()
  for (const s of streets) {
    if (!s.name) continue
    const list = streetsByName.get(s.name)
    if (list) list.push(s); else streetsByName.set(s.name, [s])
  }
  const allCorners = []
  for (const ix of intersections) {
    allCorners.push(...cornersAtIx(ix, streetsByName, cornerRadiusOverrides, cornerCornerRadiusOverrides))
  }

  const asphaltRounded = asphaltSharp.map(ring =>
    applyRoundCornersToRing(ring, allCorners, cornerRadiusScale)
  )

  // Block = stencil − asphaltRounded. Stencil is optional (debug overlays
  // can run asphalt-only). When provided, we get the rounded-block clipping
  // path with the asphalt's mouths inverted into the block as concave arcs.
  let blockRounded = []
  if (stencil && stencil.length >= 3) {
    blockRounded = differenceRings([stencil], asphaltRounded)
  }

  // ── Strip bands (treelawn, sidewalk) per chain side. v0 scope: emit raw
  // rectangles and let render order resolve overlaps (sidewalk on top of
  // treelawn implicitly satisfies the case-2 rule for sw/tl+sw corners).
  // The case-3 corner cap (concrete square at tl+sw/tl+sw) is a separate
  // pass — not implemented yet.
  // ── Curb: the unifying stroked boundary that ties every side + corner
  // into one contiguous polygon. NOT a per-side band — it's the rounded
  // asphalt boundary dilated outward by CURB_WIDTH, with the asphalt void
  // subtracted out. The result is a single closed ring per asphalt
  // component, riding the same rounded corners the block geometry uses.
  // This is the clipping-mask-as-stroke architecture: curb width is
  // global, so a single offset op produces a constant-width band that
  // wraps every block edge without seams. (Per-side curb overrides aren't
  // supported in this model — if a real cross-section needs them we'd
  // emit separate per-side bands and union them with the global stroke.)
  const curbDilated = dilateRings(asphaltRounded, curbWidth)
  const curbBands   = differenceRings(curbDilated, asphaltRounded)

  // ── Treelawn + sidewalk strip bands per chain side. v0 scope: emit raw
  // rectangles starting past the curb (perp distance hw+CURB_WIDTH from
  // centerline) and let render order resolve overlaps; the unified curb
  // covers the inner-edge seams where adjacent chains meet at an IX.
  //
  // Stripe edges: per-chain (per-segment) offset polylines at every band
  // transition. The Measure tool surfaces them as opaque strokes on the
  // SELECTED chain only — they mark where boundary handles attach.
  // Per-chain provenance keeps them in entry.stripeEdges so the renderer
  // picks the right one.
  const offsetPoly = (pts, perps, sideSign, r) =>
    pts.map((p, i) => [p[0] + perps[i][0] * sideSign * r, p[1] + perps[i][1] * sideSign * r])
  // Per-chain edges, split by which band's outer they mark — so the
  // renderer can color them after that band's color. The asphalt|curb
  // and curb|treelawn boundaries don't need strokes (the curb stripe
  // itself is the visible boundary stroke between asphalt and treelawn).
  for (const e of byChain) { if (e) { e.treelawnEdges = []; e.sidewalkEdges = [] } }
  for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) {
    const street = streets[chainIdx]
    const entry = byChain[chainIdx]
    if (!entry) continue
    const pts = street.points
    const m = street.measure
    if (!pts || pts.length < 2 || !m) continue
    const n = pts.length
    const perps = computePerps(pts)
    // Use max ped-zone of the two sides for cap-extension annulus widths.
    let maxHw = 0, maxTl = 0, maxSw = 0
    for (const sideKey of ['left', 'right']) {
      const s = m[sideKey]
      if (!s || s.terminal !== 'sidewalk') continue
      maxHw = Math.max(maxHw, s.pavementHW || 0)
      maxTl = Math.max(maxTl, s.treelawn || 0)
      maxSw = Math.max(maxSw, s.sidewalk || 0)
    }
    const cw = curbWidth   // global; per-side overrides defer to a future kit feature
    // Natural segments — IX-bounded vertex ranges. Each segment can have
    // its own per-side ped-zone measure if the adjacent block is custom.
    // Asphalt stays chain-wide (its width drives the curb stroke; varying
    // it per segment would make the unified curb impossible).
    const segments = naturalSegments(street)
    for (let segOrd = 0; segOrd < segments.length; segOrd++) {
      const seg = segments[segOrd]
      const segPts = pts.slice(seg.start, seg.end + 1)
      const segPerps = perps.slice(seg.start, seg.end + 1)
      for (const sideKey of ['left', 'right']) {
        // Sign convention matches V1: 'left' = -perp (north of an east-
        // bound chain), 'right' = +perp (south). See chainPavementRing
        // comment above. Drag 'right' handle → +perp band grows.
        const sideSign = sideKey === 'left' ? -1 : +1
        const chainSide = m[sideKey]
        if (!chainSide || chainSide.terminal !== 'sidewalk') continue
        const hw = chainSide.pavementHW || 0
        // Per-segment override lookup. Keyed by (chainIdx, segOrd, side):
        // each natural segment between IXs is one block edge.
        const eff = (blockCustoms?.[chainIdx]?.[segOrd]?.[sideKey]) || chainSide
        const tl = eff.treelawn || 0
        const sw = eff.sidewalk || 0
        if (tl > 0 && segPts.length >= 2) {
          const ring = chainStripBand(segPts, segPerps, sideSign, hw + cw, hw + cw + tl)
          if (ring) entry.treelawnRings.push(ring)
        }
        if (sw > 0 && segPts.length >= 2) {
          const ring = chainStripBand(segPts, segPerps, sideSign, hw + cw + tl, hw + cw + tl + sw)
          if (ring) entry.sidewalkRings.push(ring)
        }
        // Stripe edges per segment so the operator's edge-line overlay
        // reflects the per-block widths in Measure mode.
        // Treelawn outer edge — only when treelawn exists. Colored green
        // (= treelawn band's color) by the renderer.
        if (tl > 0) entry.treelawnEdges.push(offsetPoly(segPts, segPerps, sideSign, hw + cw + tl))
        // Sidewalk outer edge — the property line. Colored white
        // (= sidewalk band's color) by the renderer.
        if (sw > 0) entry.sidewalkEdges.push(offsetPoly(segPts, segPerps, sideSign, hw + cw + tl + sw))
      }
    }
    // Round-cap band extensions for treelawn + sidewalk. Curb's cap is
    // already handled by the unified stroke (asphaltRounded includes the
    // round endpoint).
    const capStart = street.capStart || street.capEnds?.start
    const capEnd   = street.capEnd   || street.capEnds?.end
    const emitCapAnnuli = (center, T) => {
      if (maxTl > 0) {
        const ring = roundCapHalfAnnulus(center, T, maxHw + cw, maxHw + cw + maxTl)
        if (ring) entry.treelawnRings.push(ring)
      }
      if (maxSw > 0) {
        const ring = roundCapHalfAnnulus(center, T, maxHw + cw + maxTl, maxHw + cw + maxTl + maxSw)
        if (ring) entry.sidewalkRings.push(ring)
      }
    }
    if (maxHw > 0) {
      if (capEnd === 'round' && n >= 2) {
        const dx = pts[n-1][0] - pts[n-2][0], dz = pts[n-1][1] - pts[n-2][1]
        const L = Math.hypot(dx, dz)
        if (L > 1e-6) emitCapAnnuli(pts[n-1], [dx/L, dz/L])
      }
      if (capStart === 'round' && n >= 2) {
        const dx = pts[1][0] - pts[0][0], dz = pts[1][1] - pts[0][1]
        const L = Math.hypot(dx, dz)
        if (L > 1e-6) emitCapAnnuli(pts[0], [-dx/L, -dz/L])
      }
    }
  }

  // Per-chain clipping. Asphalt clips to the rounded asphalt polygon so
  // the per-chain meshes inherit the corner smoothing without each chain
  // having to know about its IXs. Treelawn/sidewalk clip to blockRounded
  // (= stencil − asphalt), the loose "outside-of-asphalt" area. They
  // trim at chain endpoints and at corner arcs where the rounded asphalt
  // has bulged into the block. (Note: blockRounded is later refined into
  // a tighter `blockFill` below, but the LOOSE shape is what we clip
  // bands against — they need to extend through the parcel area before
  // the block-fill carve-out happens.)
  for (const entry of byChain) {
    if (!entry) continue
    if (entry.asphaltRings.length && asphaltRounded.length) {
      entry.asphaltRings = intersectRings(entry.asphaltRings, asphaltRounded)
    }
    if (blockRounded.length) {
      if (entry.treelawnRings.length) entry.treelawnRings = intersectRings(entry.treelawnRings, blockRounded)
      if (entry.sidewalkRings.length) entry.sidewalkRings = intersectRings(entry.sidewalkRings, blockRounded)
    }
  }

  // Block fill = stencil minus the union of every ribbon area (asphalt +
  // curb + treelawn + sidewalk). What's left is "land-use" — the parcel
  // proper, beyond the sidewalk's outer edge. Rendered opaque green so
  // the translucent ribbons read against the aerial photo / graph paper
  // backdrop instead of bleeding the block color through.
  let blockFill = []
  if (stencil && stencil.length >= 3) {
    const ribbonUnion = unionRings([
      ...asphaltRounded,
      ...curbBands,
      ...byChain.flatMap(c => c?.treelawnRings || []),
      ...byChain.flatMap(c => c?.sidewalkRings || []),
    ])
    blockFill = differenceRings([stencil], ribbonUnion)
  }

  return {
    asphaltSharp,
    asphaltRounded,
    blockRounded,    // loose: stencil − asphalt; used for adjacency + band clipping
    blockFill,       // tight: stencil − all ribbons; rendered as the parcel fill
    curbBands,
    byChain,
    corners: allCorners,
  }
}
