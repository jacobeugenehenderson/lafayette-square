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
  const leftSide = pts.map((p, i) => [p[0] + perps[i][0] * hwL, p[1] + perps[i][1] * hwL])
  const rightSide = pts.map((p, i) => [p[0] - perps[i][0] * hwR, p[1] - perps[i][1] * hwR])

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

  // End cap: bridge rightSide[last] → leftSide[last] going OUTWARD past
  // the chain's last vertex. Polygon walks rightSide forward then leftSide
  // reversed, so the cap arc sits between those two segments.
  const endArc = capEnd === 'round'
    ? halfArc(pts[n - 1], Math.max(hwL, hwR), rightSide[n - 1], leftSide[n - 1])
    : []
  // Start cap: bridge leftSide[0] → rightSide[0] going OUTWARD past the
  // chain's first vertex. Sits at the polygon's wrap-around closure.
  const startArc = capStart === 'round'
    ? halfArc(pts[0], Math.max(hwL, hwR), leftSide[0], rightSide[0])
    : []

  return [...rightSide, ...endArc, ...leftSide.slice().reverse(), ...startArc]
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

    // Block corner = intersection of A's LEFT curb-outer and B's RIGHT
    // curb-outer. Legs are sorted CCW; the wedge between two adjacent legs
    // (going CCW from A to B) sits on A's left side and B's right side.
    // (Earlier mis-derivation had this swapped, which only worked at 90°
    // IXs where the four corners are identical by symmetry — hidden the
    // bug at the bent T and the dead-end IX. Must match the same A0/B0
    // formula used in CornerEditHandles' Q computation, otherwise the
    // per-corner override key and the geometric corner disagree on which
    // wedge they refer to.) Perp-left of T = (-Ty, Tx).
    const P_A = [-A.T[1], A.T[0]]
    const P_B = [-B.T[1], B.T[0]]
    // A's LEFT curb passes through V + A.outerL · P_A, along A.T.
    const A0 = [V[0] + A.outerL * P_A[0], V[1] + A.outerL * P_A[1]]
    // B's RIGHT curb passes through V - B.outerR · P_B, along B.T.
    const B0 = [V[0] - B.outerR * P_B[0], V[1] - B.outerR * P_B[1]]
    // Intersect A0 + s·A.T = B0 + t·B.T.
    const det = A.T[0] * (-B.T[1]) - A.T[1] * (-B.T[0])
    if (Math.abs(det) < 1e-9) continue
    const dx = B0[0] - A0[0], dz = B0[1] - A0[1]
    const s = (dx * (-B.T[1]) - dz * (-B.T[0])) / det
    const Vc = [A0[0] + s * A.T[0], A0[1] + s * A.T[1]]

    const d_A = A.leftDepth    // A's LEFT side faces this corner.
    const d_B = B.rightDepth   // B's RIGHT side faces this corner.
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
    curbWidth = CURB_WIDTH } = opts
  const streets = ribbons?.streets || []
  const intersections = ribbons?.intersections || []

  const asphaltRings = []
  for (const street of streets) {
    const ring = chainPavementRing(street)
    if (ring) asphaltRings.push(ring)
  }
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
  // ── Stripe edges: per-chain offset polylines at every band transition
  // (hw, hw+cw, hw+cw+tl, hw+cw+tl+sw). Rendered as line meshes when the
  // Measure tool is active so the operator can see exactly where each
  // band edge sits; same source as the band rings, just sampled as a
  // single polyline rather than a closed ring.
  const treelawnBandsRaw = []
  const sidewalkBandsRaw = []
  const stripeEdges = []
  const offsetPoly = (pts, perps, sideSign, r) =>
    pts.map((p, i) => [p[0] + perps[i][0] * sideSign * r, p[1] + perps[i][1] * sideSign * r])
  for (const street of streets) {
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
    for (const sideKey of ['left', 'right']) {
      const sideSign = sideKey === 'left' ? +1 : -1
      const s = m[sideKey]
      if (!s) continue
      if (s.terminal !== 'sidewalk') continue
      const hw = s.pavementHW || 0
      const tl = s.treelawn || 0
      const sw = s.sidewalk || 0
      // Treelawn at perp ∈ [hw+cw, hw+cw+tl] (only if tl > 0).
      if (tl > 0) {
        const ring = chainStripBand(pts, perps, sideSign, hw + cw, hw + cw + tl)
        if (ring) treelawnBandsRaw.push(ring)
      }
      // Sidewalk at perp ∈ [hw+cw+tl, hw+cw+tl+sw].
      if (sw > 0) {
        const ring = chainStripBand(pts, perps, sideSign, hw + cw + tl, hw + cw + tl + sw)
        if (ring) sidewalkBandsRaw.push(ring)
      }
      // Stripe edges — emit one polyline per band transition. Hidden
      // from render at idle; line meshes for these surface in Measure.
      if (hw > 0) stripeEdges.push(offsetPoly(pts, perps, sideSign, hw))
      if (cw > 0) stripeEdges.push(offsetPoly(pts, perps, sideSign, hw + cw))
      if (tl > 0) stripeEdges.push(offsetPoly(pts, perps, sideSign, hw + cw + tl))
      if (sw > 0) stripeEdges.push(offsetPoly(pts, perps, sideSign, hw + cw + tl + sw))
    }
    // Round-cap band extensions for treelawn + sidewalk. Curb's cap is
    // already handled by the unified stroke (asphaltRounded includes the
    // round endpoint).
    const capStart = street.capStart || street.capEnds?.start
    const capEnd   = street.capEnd   || street.capEnds?.end
    const emitCapAnnuli = (center, T) => {
      if (maxTl > 0) {
        const ring = roundCapHalfAnnulus(center, T, maxHw + cw, maxHw + cw + maxTl)
        if (ring) treelawnBandsRaw.push(ring)
      }
      if (maxSw > 0) {
        const ring = roundCapHalfAnnulus(center, T, maxHw + cw + maxTl, maxHw + cw + maxTl + maxSw)
        if (ring) sidewalkBandsRaw.push(ring)
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

  // Clip strip bands to the rounded block (intersect with block polygon).
  // This trims them at chain endpoints (cap ends) and at corner arcs
  // where the rounded asphalt has bulged into the block. Curb is NOT
  // clipped this way — it's already constructed from the asphalt boundary
  // and lives in the band between asphalt and block.
  let treelawnBands = [], sidewalkBands = []
  if (blockRounded.length) {
    treelawnBands = intersectRings(treelawnBandsRaw, blockRounded)
    sidewalkBands = intersectRings(sidewalkBandsRaw, blockRounded)
  } else {
    treelawnBands = treelawnBandsRaw
    sidewalkBands = sidewalkBandsRaw
  }

  return {
    asphaltSharp,
    asphaltRounded,
    blockRounded,
    curbBands,
    treelawnBands,
    sidewalkBands,
    stripeEdges,
    corners: allCorners,
  }
}
