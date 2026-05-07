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
// Blunt caps only for the prototype (round caps add a quarter-disk).
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
  return [...rightSide, ...leftSide.slice().reverse()]
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

// For each IX, pair adjacent legs (sorted CCW around V) into corners.
// Each corner has metadata: position (Vc), interior angle θ, d_min, R_class.
function cornersAtIx(ix, streetByName) {
  const V = ix.point
  if (!ix.streets || ix.streets.length < 2) return []
  const legs = []
  for (const sref of ix.streets) {
    const chain = streetByName.get(sref.name)
    if (!chain) continue
    const ixIdx = sref.ix
    const pts = chain.points
    if (!pts || ixIdx == null || ixIdx < 0 || ixIdx >= pts.length) continue
    const v = pts[ixIdx]
    if (Math.hypot(v[0] - V[0], v[1] - V[1]) > 0.5) continue
    const m = chain.measure
    if (!m) continue
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

    // Block corner = intersection of A's right curb-outer and B's left
    // curb-outer (the two ribbon edges that bound the block wedge between
    // adjacent CCW legs). Perp-left of T = (-Ty, Tx).
    const P_A = [-A.T[1], A.T[0]]
    const P_B = [-B.T[1], B.T[0]]
    // A's right curb passes through V - A.outerR · P_A, along A.T.
    const A0 = [V[0] - A.outerR * P_A[0], V[1] - A.outerR * P_A[1]]
    // B's left  curb passes through V + B.outerL · P_B, along B.T.
    const B0 = [V[0] + B.outerL * P_B[0], V[1] + B.outerL * P_B[1]]
    // Intersect A0 + s·A.T = B0 + t·B.T.
    const det = A.T[0] * (-B.T[1]) - A.T[1] * (-B.T[0])
    if (Math.abs(det) < 1e-9) continue
    const dx = B0[0] - A0[0], dz = B0[1] - A0[1]
    const s = (dx * (-B.T[1]) - dz * (-B.T[0])) / det
    const Vc = [A0[0] + s * A.T[0], A0[1] + s * A.T[1]]

    const d_A = A.rightDepth   // A's right side faces this corner.
    const d_B = B.leftDepth    // B's left  side faces this corner.
    const d_min = Math.min(d_A, d_B)

    corners.push({
      point: Vc,
      theta,
      d_min,
      R_class: R_CLASS_DEFAULT,
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
    const R = defaultR(matched.R_class, matched.d_min, matched.theta) * scale
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

export function buildBlockGeometryV2(ribbons, opts = {}) {
  const { cornerRadiusScale = 1, stencil = null } = opts
  const streets = ribbons?.streets || []
  const intersections = ribbons?.intersections || []

  const asphaltRings = []
  for (const street of streets) {
    const ring = chainPavementRing(street)
    if (ring) asphaltRings.push(ring)
  }
  const asphaltSharp = unionRings(asphaltRings)

  const streetByName = new Map(streets.map(s => [s.name, s]))
  const allCorners = []
  for (const ix of intersections) {
    allCorners.push(...cornersAtIx(ix, streetByName))
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
  const treelawnBandsRaw = []
  const sidewalkBandsRaw = []
  for (const street of streets) {
    const pts = street.points
    const m = street.measure
    if (!pts || pts.length < 2 || !m) continue
    const perps = computePerps(pts)
    for (const sideKey of ['left', 'right']) {
      const sideSign = sideKey === 'left' ? +1 : -1
      const s = m[sideKey]
      if (!s) continue
      if (s.terminal !== 'sidewalk') continue
      const hw = s.pavementHW || 0
      const tl = s.treelawn || 0
      const sw = s.sidewalk || 0
      // Treelawn at perp ∈ [hw, hw+tl] (only if tl > 0).
      if (tl > 0) {
        const ring = chainStripBand(pts, perps, sideSign, hw, hw + tl)
        if (ring) treelawnBandsRaw.push(ring)
      }
      // Sidewalk at perp ∈ [hw+tl, hw+tl+sw].
      if (sw > 0) {
        const ring = chainStripBand(pts, perps, sideSign, hw + tl, hw + tl + sw)
        if (ring) sidewalkBandsRaw.push(ring)
      }
    }
  }

  // Clip strip bands to the rounded block (intersect with block polygon).
  // This trims the bands at chain endpoints (cap ends) and at corner arcs
  // where the rounded asphalt has bulged into the block.
  let treelawnBands = []
  let sidewalkBands = []
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
    treelawnBands,
    sidewalkBands,
    corners: allCorners,
  }
}
