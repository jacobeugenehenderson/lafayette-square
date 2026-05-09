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

// Weighted random LU palette for unauthored blocks. Distribution tuned to
// read as "a real neighborhood with anomalies" — residential dominant,
// commercial secondary, edge cases sparse. Sums to 100.
const LU_WEIGHTS = [
  ['residential',         50],
  ['commercial',          15],
  ['vacant',               8],
  ['vacant-commercial',    5],
  ['parking',              7],
  ['institutional',        5],
  ['recreation',           7],
  ['industrial',           3],
]
const LU_CUM = (() => {
  const out = []
  let acc = 0
  for (const [name, w] of LU_WEIGHTS) { acc += w; out.push([name, acc]) }
  return out
})()
function pickLuFromHash(h) {
  const r = (h % 100 + 100) % 100
  for (const [name, c] of LU_CUM) { if (r < c) return name }
  return 'residential'
}
// xmur3-style deterministic 32-bit hash from a key string. Stable across
// runs; same key → same bucket.
function hashKey(s) {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}
// Stable per-block key from a ring's bounding-box center, snapped to 0.5m.
// Bbox is more drift-tolerant than centroid when chain widths change —
// the visible bbox of a block barely moves when a sidewalk widens by 1m,
// whereas the centroid can shift several meters.
function blockKeyFromRing(ring) {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
  for (const p of ring) {
    if (p[0]<minX)minX=p[0]; if (p[0]>maxX)maxX=p[0]
    if (p[1]<minY)minY=p[1]; if (p[1]>maxY)maxY=p[1]
  }
  const cx = Math.round(((minX + maxX) / 2) * 2) / 2
  const cy = Math.round(((minY + maxY) / 2) * 2) / 2
  return `${cx.toFixed(1)},${cy.toFixed(1)}`
}

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
// `blockCustoms` + `chainIdxByChain` thread per-segment overrides into the
// leg width math: a leg coming OFF an IX uses the segment ENDING at the IX
// (BACK direction) or STARTING from it (FORWARD direction); whichever
// segment's per-side override applies.
function cornersAtIx(ix, streetsByName, ixOverrides, cornerOverrides, blockCustoms, chainIdxByChain) {
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
    const chainIdx = chainIdxByChain ? chainIdxByChain.get(chain) : null
    // Find which natural segment is adjacent to this IX in `dir`.
    const segments = naturalSegments(chain)
    const segmentForLeg = (dir) => {
      for (let k = 0; k < segments.length; k++) {
        const s = segments[k]
        if (dir === -1 && s.end === ixIdx) return k
        if (dir === +1 && s.start === ixIdx) return k
      }
      return null
    }
    const buildLeg = (dir) => {
      const ni = ixIdx + dir
      if (ni < 0 || ni >= pts.length) return null
      const dx = pts[ni][0] - V[0], dz = pts[ni][1] - V[1]
      const L = Math.hypot(dx, dz)
      if (L < 1e-6) return null
      const isBack = dir === -1
      // Per-segment override for this leg's adjacent segment, if any.
      const segOrd = segmentForLeg(dir)
      const segCustom = (chainIdx != null && segOrd != null)
        ? blockCustoms?.[chainIdx]?.[segOrd] : null
      const effL = segCustom?.left  || m.left
      const effR = segCustom?.right || m.right
      // When walking BACK from V (dir=-1), the chain's "left" becomes
      // our right (we're facing the opposite direction along the chain).
      const left  = isBack ? effR : effL
      const right = isBack ? effL : effR
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
      V,                       // IX vertex (same for all corners at this IX)
      theta,
      d_min,
      R_class: R_CLASS_DEFAULT,
      R_authored,
      // Leg data for downstream pad polygon construction. T_A/T_B point
      // OUT from V along each leg; outerR/outerL are the leg's pavementHW
      // facing this corner; rightDepth_A/leftDepth_B are the per-side
      // ped-zone depths (treelawn + sidewalk on a 'sidewalk' terminal,
      // 0 otherwise) facing this corner.
      T_A: A.T, T_B: B.T,
      outerR_A: A.outerR, outerL_B: B.outerL,
      rightDepth_A: A.rightDepth, leftDepth_B: B.leftDepth,
    })
  }
  return corners
}

// Concrete corner pad — a flat quadrilateral covering the wedge between
// two adjacent legs of an IX, anchored at V. NO arc math, no R lookup.
// The same blockRounded clipping mask that already shapes the green
// block and clips chain bands shapes this pad too — the rounded curb
// boundary falls out of the clip for free, identical to how the asphalt
// mouth carves block-fill. "Put a quad in the smart object, put the
// clipping mask over the whole thing." Render order under treelawn so
// bands paint over the pad in the band-zone, leaving pad visible only
// in the gap area near V.
function buildCornerPadQuad(corner, cw) {
  const { V, T_A, T_B, outerR_A, outerL_B, rightDepth_A, leftDepth_B } = corner
  if (rightDepth_A <= 0 || leftDepth_B <= 0) return null
  // The pad's edge along T_A sits perpendicular-distance L_A from chain B
  // (not chain A — T_A is parallel to chain A, so it's perpendicular to
  // T_B's chain when θ=90°). Size L_A off B's facing-side metadata so
  // the pad ends exactly at B's band outer edge; same for L_B/A. Flush,
  // no slack — the chain band paints over any pad pixel that sneaks
  // past, which would otherwise read as an "internal bump."
  const L_A = outerL_B + cw + leftDepth_B
  const L_B = outerR_A + cw + rightDepth_A
  return [
    [V[0], V[1]],
    [V[0] + T_A[0] * L_A, V[1] + T_A[1] * L_A],
    [V[0] + T_A[0] * L_A + T_B[0] * L_B, V[1] + T_A[1] * L_A + T_B[1] * L_B],
    [V[0] + T_B[0] * L_B, V[1] + T_B[1] * L_B],
  ]
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
  // Cap inset at 49% of the shorter adjacent segment so a too-large R
  // (e.g., from a maxed cornerRadiusScale slider) doesn't overshoot the
  // segment endpoints and produce a degenerate ring. When clamped,
  // recompute the effective R = clampedInset * tanH so the arc still
  // closes tangentially. Mirrors filletChainVertex's clamp.
  let inset = R / tanH
  const maxInset = Math.min(
    Math.hypot(cur[0] - prev[0], cur[1] - prev[1]),
    Math.hypot(next[0] - cur[0], next[1] - cur[1]),
  ) * 0.49
  let actualR = R
  if (inset > maxInset) { inset = maxInset; actualR = inset * tanH }
  const tA = [cur[0] - inset * inDir[0], cur[1] - inset * inDir[1]]
  const tB = [cur[0] + inset * outDir[0], cur[1] + inset * outDir[1]]
  // Right-turn convention: arc center is to the right of inDir.
  // Right-perp of inDir = (inDir.y, -inDir.x).
  const normalA = [inDir[1], -inDir[0]]
  const center = [tA[0] + actualR * normalA[0], tA[1] + actualR * normalA[1]]
  const a1 = Math.atan2(tA[1] - center[1], tA[0] - center[0])
  const a2 = Math.atan2(tB[1] - center[1], tB[0] - center[0])
  let da = a2 - a1
  // Walk the SHORT arc.
  if (da > Math.PI) da -= 2 * Math.PI
  if (da < -Math.PI) da += 2 * Math.PI
  const out = [tA]
  for (let k = 1; k < ARC_N; k++) {
    const a = a1 + (da * k / ARC_N)
    out.push([center[0] + actualR * Math.cos(a), center[1] + actualR * Math.sin(a)])
  }
  out.push(tB)
  return out
}

// Fillet a chain bend at `cur` with radius R. Unlike arcReplaceVertex
// (which assumes block-convex right turns and is used for IX corners),
// this handles BOTH turn directions — the centerline can bend either way
// and the fillet should follow. Tangent inset is capped at 49% of the
// shorter adjacent segment so the arc never overshoots into the next
// vertex; if R is too large, the actual arc radius is reduced to fit.
// Returns an array of points that replace `cur`. Returns [cur] for
// near-collinear vertices (no usable fillet).
function filletChainVertex(prev, cur, next, R) {
  const inDir = unit([cur[0] - prev[0], cur[1] - prev[1]])
  const outDir = unit([next[0] - cur[0], next[1] - cur[1]])
  const cross = inDir[0] * outDir[1] - inDir[1] * outDir[0]
  if (Math.abs(cross) < 1e-4) return [cur]
  const dot = inDir[0] * outDir[0] + inDir[1] * outDir[1]
  const turn = Math.atan2(cross, dot)   // signed deflection ∈ (-π, π)
  const tanH = Math.tan(Math.abs(turn) / 2)
  if (tanH <= 1e-6) return [cur]
  let inset = R * tanH
  const maxInset = Math.min(
    Math.hypot(cur[0] - prev[0], cur[1] - prev[1]),
    Math.hypot(next[0] - cur[0], next[1] - cur[1]),
  ) * 0.49
  let actualR = R
  if (inset > maxInset) { inset = maxInset; actualR = inset / tanH }
  const T_in  = [cur[0] - inset * inDir[0],  cur[1] - inset * inDir[1]]
  const T_out = [cur[0] + inset * outDir[0], cur[1] + inset * outDir[1]]
  // Inside of the turn: left of inDir for left turns (cross > 0),
  // right of inDir for right turns (cross < 0).
  const sign = cross > 0 ? +1 : -1
  const normal = [-inDir[1] * sign, inDir[0] * sign]
  const center = [T_in[0] + actualR * normal[0], T_in[1] + actualR * normal[1]]
  const a1 = Math.atan2(T_in[1]  - center[1], T_in[0]  - center[0])
  const a2 = Math.atan2(T_out[1] - center[1], T_out[0] - center[0])
  let da = a2 - a1
  if (da > Math.PI) da -= 2 * Math.PI
  if (da < -Math.PI) da += 2 * Math.PI
  const out = [T_in]
  for (let k = 1; k < ARC_N; k++) {
    const a = a1 + (da * k / ARC_N)
    out.push([center[0] + actualR * Math.cos(a), center[1] + actualR * Math.sin(a)])
  }
  out.push(T_out)
  return out
}

// Apply per-vertex smoothing to a chain's points. Walks vertices 1..n-2
// and replaces any with a configured radius by an arc fillet. Endpoints
// (which are either chain ends or IX boundaries owned by the segment
// loop's caller) are NEVER touched. `vertexIndexAt(i)` maps a local
// segment-vertex index to the chain-vertex index used for the override
// lookup. Returns the (possibly resampled) points array; if no overrides
// applied, returns `pts` unchanged.
function applyChainSmoothing(pts, smoothingForVertex) {
  const n = pts.length
  if (n < 3) return pts
  let any = false
  const out = [pts[0]]
  for (let i = 1; i < n - 1; i++) {
    const R = smoothingForVertex(i)
    if (Number.isFinite(R) && R > 0.01) {
      const arc = filletChainVertex(pts[i - 1], pts[i], pts[i + 1], R)
      for (const p of arc) out.push(p)
      if (arc.length !== 1) any = true
    } else {
      out.push(pts[i])
    }
  }
  out.push(pts[n - 1])
  return any ? out : pts
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

// V1-style per-side per-band quarter cap around a chain endpoint. Sweeps
// 90° from `sideSign·perp(T_out)` (a=0) through `T_out` (a=π/2) at radii
// [innerR, outerR]. With innerR≤0 returns a pie slice (closed back to
// `center`) for the asphalt cap; otherwise returns a quarter-annulus for
// treelawn / sidewalk wrap-around.
//   `sideSign` follows V2's chain convention relative to T_out:
//     +1 = +perp(T_out) (south-of-east-bound), -1 = -perp(T_out)
//   At the END cap, T_out = chain forward, so chain.left→sideSign=-1,
//   chain.right→+1. At the START cap, T_out = chain backward, so the
//   mapping flips: chain.left→+1, chain.right→-1.
//
// V1's quarter-cap approach (vs. V2's prior 180° half-annulus) keeps each
// side's band radially independent, so asymmetric measures and per-segment
// custom widths produce a clean lemon-shaped cap instead of a circle that
// doesn't match either side's band.
function quarterCap(center, T_out, sideSign, innerR, outerR) {
  if (outerR <= Math.max(0, innerR) + 1e-9) return null
  // V2 perps come from computePerps which yields right-perp of forward T,
  // i.e. perp = (-Tz, Tx). We replicate that here so sideSign matches the
  // segment-rectangle sign convention.
  const px = -T_out[1] * sideSign
  const py =  T_out[0] * sideSign
  const ARC = 12
  const outer = []
  const inner = []
  for (let k = 0; k <= ARC; k++) {
    const a = (k / ARC) * (Math.PI / 2)
    const c = Math.cos(a), s = Math.sin(a)
    const dx = c * px + s * T_out[0]
    const dy = c * py + s * T_out[1]
    outer.push([center[0] + outerR * dx, center[1] + outerR * dy])
    if (innerR > 1e-9) inner.push([center[0] + innerR * dx, center[1] + innerR * dy])
  }
  if (innerR <= 1e-9) return [center, ...outer]
  return [...outer, ...inner.slice().reverse()]
}

// (Legacy 180° half-annulus retained as dead reference; superseded by
// quarterCap above.)
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
    curbWidth = CURB_WIDTH, blockCustoms = null, vertexSmoothing = null,
    blockLandUse = null } = opts
  const streets = ribbons?.streets || []
  const intersections = ribbons?.intersections || []

  // Per-chain rendering data, populated below. Each entry holds the
  // rings that belong to a single chain (asphalt, treelawn, sidewalk).
  const byChain = []
  for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) {
    const street = streets[chainIdx]
    if (street?.disabled) { byChain.push(null); continue }
    byChain.push({
      chainIdx,
      name: street.name,
      asphaltRings:  [],
      treelawnRings: [],
      sidewalkRings: [],
    })
  }

  // ── Per-segment per-chain emission. Each natural segment of each
  // chain can have its own per-side measure (when blockCustoms has an
  // entry for it). The segment's ASPHALT rectangle uses eff.pavementHW
  // per side; ped-zone bands use eff.treelawn / eff.sidewalk. Asphalt
  // segments butt at IXs; clipper's union step merges them. Round caps
  // at chain endpoints get a half-disc arc baked into the segment ring.
  const offsetPoly = (pts, perps, sideSign, r) =>
    pts.map((p, i) => [p[0] + perps[i][0] * sideSign * r, p[1] + perps[i][1] * sideSign * r])
  for (const e of byChain) { if (e) { e.treelawnEdges = []; e.sidewalkEdges = [] } }
  const cw = curbWidth   // global curb width; per-side curb overrides aren't supported in V2
  const ARC_SEGS = 16
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
  for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) {
    const street = streets[chainIdx]
    const entry = byChain[chainIdx]
    if (!entry) continue
    const pts = street.points
    const m = street.measure
    if (!pts || pts.length < 2 || !m) continue
    const n = pts.length
    const perps = computePerps(pts)
    const segments = naturalSegments(street)
    const capStart = street.capStart || street.capEnds?.start
    const capEnd   = street.capEnd   || street.capEnds?.end

    for (let segOrd = 0; segOrd < segments.length; segOrd++) {
      const seg = segments[segOrd]
      const rawSegPts = pts.slice(seg.start, seg.end + 1)
      // Per-vertex smoothing — fillet any non-IX interior bend with a
      // recorded radius. IX vertices (segment boundaries) are excluded
      // from the smoothing pass: smoothing ops there belong to
      // applyRoundCornersToRing on the asphalt void. After smoothing
      // we recompute perps because the resampled point set has new
      // tangent directions at the inserted arc points.
      const segChainMap = vertexSmoothing?.[chainIdx] || null
      const segPts = segChainMap
        ? applyChainSmoothing(rawSegPts, (i) => segChainMap[seg.start + i])
        : rawSegPts
      const segPerps = (segPts === rawSegPts) ? perps.slice(seg.start, seg.end + 1) : computePerps(segPts)
      const segLen = segPts.length
      if (segLen < 2) continue

      // Effective per-side measure for this segment (custom override
      // wins; otherwise chain default). Both sides resolved up-front so
      // the asphalt rectangle gets per-side pavementHW and the ped-zone
      // bands inherit the same hw used for their inner-edge perp.
      const effL = (blockCustoms?.[chainIdx]?.[segOrd]?.left)  || m.left  || {}
      const effR = (blockCustoms?.[chainIdx]?.[segOrd]?.right) || m.right || {}
      const hwL = effL.pavementHW || 0
      const hwR = effR.pavementHW || 0

      // Asphalt rectangle for this segment. Walks the centerline at
      // -perp*hwL on the left and +perp*hwR on the right (V1 sign
      // convention). Square ends — round caps are handled externally
      // by per-side quarter pie slices unioned with this rect (V1
      // approach), so asymmetric widths produce a lemon-shaped cap
      // that matches each side's band cleanly.
      if (hwL > 0 || hwR > 0) {
        const leftEdge  = segPts.map((p, i) => [p[0] - segPerps[i][0] * hwL, p[1] - segPerps[i][1] * hwL])
        const rightEdge = segPts.map((p, i) => [p[0] + segPerps[i][0] * hwR, p[1] + segPerps[i][1] * hwR])
        entry.asphaltRings.push([...leftEdge, ...rightEdge.slice().reverse()])
      }

      // Per-side ped-zone bands. Inner edge sits at the segment's own
      // hw + curb (matches the asphalt outer edge for THIS segment).
      for (const sideKey of ['left', 'right']) {
        const sideSign = sideKey === 'left' ? -1 : +1
        const eff = sideKey === 'left' ? effL : effR
        if (!eff || eff.terminal !== 'sidewalk') continue
        const hw = eff.pavementHW || 0
        const tl = eff.treelawn || 0
        const sw = eff.sidewalk || 0
        if (tl > 0) {
          const ring = chainStripBand(segPts, segPerps, sideSign, hw + cw, hw + cw + tl)
          if (ring) entry.treelawnRings.push(ring)
        }
        if (sw > 0) {
          const ring = chainStripBand(segPts, segPerps, sideSign, hw + cw + tl, hw + cw + tl + sw)
          if (ring) entry.sidewalkRings.push(ring)
        }
        if (tl > 0) entry.treelawnEdges.push(offsetPoly(segPts, segPerps, sideSign, hw + cw + tl))
        if (sw > 0) entry.sidewalkEdges.push(offsetPoly(segPts, segPerps, sideSign, hw + cw + tl + sw))
      }
    }
    // V1-style per-side per-band quarter caps at round-cap endpoints.
    // Each side emits up to 3 quarter rings (asphalt pie + treelawn
    // annulus + sidewalk annulus). Per-segment custom widths apply:
    // start-cap reads the FIRST segment, end-cap reads the LAST.
    // `t` = +1 at the end (T_out = chain forward) or -1 at the start
    // (T_out = chain backward); flips chain.left/right → sideSign so
    // the radial bands sit on the visually correct side after the flip.
    const emitQuarterCaps = (endpoint, T_out, segIdx, t) => {
      const segCustom = blockCustoms?.[chainIdx]?.[segIdx]
      const effL = segCustom?.left  || m.left  || {}
      const effR = segCustom?.right || m.right || {}
      const sides = [
        { eff: effL, sideSign: -t },
        { eff: effR, sideSign: +t },
      ]
      for (const { eff, sideSign } of sides) {
        const hw = eff.pavementHW || 0
        if (hw <= 0) continue
        // Asphalt pie slice fills out from the chain endpoint to hw.
        const aRing = quarterCap(endpoint, T_out, sideSign, 0, hw)
        if (aRing) entry.asphaltRings.push(aRing)
        if (eff.terminal !== 'sidewalk') continue
        const tl = eff.treelawn || 0
        const sw = eff.sidewalk || 0
        if (tl > 0) {
          const r = quarterCap(endpoint, T_out, sideSign, hw + cw, hw + cw + tl)
          if (r) entry.treelawnRings.push(r)
        }
        if (sw > 0) {
          const r = quarterCap(endpoint, T_out, sideSign, hw + cw + tl, hw + cw + tl + sw)
          if (r) entry.sidewalkRings.push(r)
        }
      }
    }
    if (capEnd === 'round' && n >= 2) {
      const dx = pts[n-1][0] - pts[n-2][0], dz = pts[n-1][1] - pts[n-2][1]
      const L = Math.hypot(dx, dz)
      if (L > 1e-6) emitQuarterCaps(pts[n-1], [dx/L, dz/L], segments.length - 1, +1)
    }
    if (capStart === 'round' && n >= 2) {
      const dx = pts[1][0] - pts[0][0], dz = pts[1][1] - pts[0][1]
      const L = Math.hypot(dx, dz)
      if (L > 1e-6) emitQuarterCaps(pts[0], [-dx/L, -dz/L], 0, -1)
    }
  }

  // ── Now that every per-chain per-segment ring is in byChain, build
  // the global asphalt + corner + block + curb derivatives off them.
  const allAsphaltRings = byChain.flatMap(c => c?.asphaltRings || [])
  const asphaltSharp = unionRings(allAsphaltRings)

  // Multi-value name map — LS has 35 names spanning 164 chain entries.
  // chainIdxByChain pairs each chain object with its index in `streets`
  // so cornersAtIx can resolve per-segment customs for each leg.
  const streetsByName = new Map()
  const chainIdxByChain = new Map()
  for (let i = 0; i < streets.length; i++) {
    const s = streets[i]
    if (!s) continue
    chainIdxByChain.set(s, i)
    if (!s.name) continue
    const list = streetsByName.get(s.name)
    if (list) list.push(s); else streetsByName.set(s.name, [s])
  }
  const allCorners = []
  for (const ix of intersections) {
    allCorners.push(...cornersAtIx(
      ix, streetsByName, cornerRadiusOverrides, cornerCornerRadiusOverrides,
      blockCustoms, chainIdxByChain,
    ))
  }
  const asphaltRounded = asphaltSharp.map(ring =>
    applyRoundCornersToRing(ring, allCorners, cornerRadiusScale)
  )

  let blockRounded = []
  if (stencil && stencil.length >= 3) {
    blockRounded = differenceRings([stencil], asphaltRounded)
  }
  const curbDilated = dilateRings(asphaltRounded, curbWidth)
  const curbBands   = differenceRings(curbDilated, asphaltRounded)

  // Per-chain clipping. Asphalt clips to the rounded asphalt polygon so
  // the per-chain meshes inherit the corner smoothing. Treelawn/sidewalk
  // clip to blockRounded (= stencil − asphalt), the loose "outside-of-
  // asphalt" area.
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

  // Asphalt corner plugs — `asphaltRounded − union(per-chain asphalt)`.
  // Each chain emits per-segment rectangles with square ends at IX
  // vertices; the round-corners op then ADDS a fillet wedge to the
  // unioned asphalt (asphaltRounded ⊃ per-chain rectangles at corners).
  // That extra fillet area is part of asphaltRounded but NOT covered
  // by any chain's asphaltRings, so it would render as ground/horizon
  // through the gap. Plug it explicitly with an asphalt-colored mesh,
  // shared between chains and always opaque (structural surface, no
  // per-chain translucency). Computed AFTER per-chain clipping above
  // so the union is final.
  const allChainAsphalt = unionRings(byChain.flatMap(c => c?.asphaltRings || []))
  const cornerAsphaltPlugs = differenceRings(asphaltRounded, allChainAsphalt)

  // Concrete corner pads — the wedge between the rounded curb-outer arc
  // (radius R+cw concentric with the asphalt fillet arc) and the two
  // band-inner half-planes that meet at the linear-curb-outer corner Q.
  // For 90°/symmetric this is "square minus quarter-disc"; the operator's
  // "basically a square" mental model. Built directly as a closed polygon
  // — no Boolean subtraction — because the arc tangent points coincide
  // with where the chain ped-bands' straight inner edges begin, so there
  // is no overlap with bands or curb to cancel out.
  const cornerPadQuads = []
  for (const corner of allCorners) {
    const q = buildCornerPadQuad(corner, curbWidth)
    if (q) cornerPadQuads.push(q)
  }
  // Union normalizes winding (parallelograms in different quadrants have
  // mixed CW/CCW orientation), then intersect with the same blockRounded
  // mask the bands and block-fill use.
  const cornerPadUnion = cornerPadQuads.length ? unionRings(cornerPadQuads) : []
  const cornerSidewalkPads = (cornerPadUnion.length && blockRounded.length)
    ? intersectRings(cornerPadUnion, blockRounded)
    : []

  // Block fill — two source paths feed the same per-block output.
  //   1. ribbons.faces[] (LS): each OSM-derived face has authentic
  //      `use` from derive.js. Clip each face against ribbonUnion so the
  //      parcel doesn't bleed under bands/curb/asphalt. blockLandUse can
  //      still override per-block; default LU comes from face.use.
  //   2. stencil (toy): derive blocks from stencil − ribbonUnion. No
  //      OSM data — LU falls through to weighted hash by centroid.
  // Each output block carries `{ ring, blockKey, lu }`. The renderer
  // groups by lu and colors from luColors[lu] || DEFAULT_LU_COLORS[lu].
  // `park` faces are skipped — LafayettePark renders that area separately.
  const ribbonUnion = unionRings([
    ...asphaltRounded,
    ...curbBands,
    ...byChain.flatMap(c => c?.treelawnRings || []),
    ...byChain.flatMap(c => c?.sidewalkRings || []),
    ...cornerSidewalkPads,
  ])
  let blockFill = []
  let blocks = []
  const faces = ribbons?.faces || []
  if (faces.length) {
    for (const face of faces) {
      if (!face?.ring || face.ring.length < 3) continue
      if (face.use === 'park') continue
      const clipped = ribbonUnion.length
        ? differenceRings([face.ring], ribbonUnion)
        : [face.ring]
      for (const ring of clipped) {
        if (!ring || ring.length < 3) continue
        const blockKey = blockKeyFromRing(ring)
        const lu = (blockLandUse && blockLandUse[blockKey]) || face.use || 'unknown'
        blocks.push({ ring, blockKey, lu })
        blockFill.push(ring)
      }
    }
  } else if (stencil && stencil.length >= 3) {
    blockFill = differenceRings([stencil], ribbonUnion)
    for (const ring of blockFill) {
      if (!ring || ring.length < 3) continue
      const blockKey = blockKeyFromRing(ring)
      const lu = (blockLandUse && blockLandUse[blockKey])
        || pickLuFromHash(hashKey(blockKey))
      blocks.push({ ring, blockKey, lu })
    }
  }

  return {
    asphaltSharp,
    asphaltRounded,
    blockRounded,         // loose: stencil − asphalt; used for adjacency + band clipping
    blockFill,            // tight: stencil − all ribbons; rendered as the parcel fill
    blocks,               // per-block { ring, blockKey, lu } for LU-aware rendering
    curbBands,
    cornerAsphaltPlugs,   // asphalt fillet wedges at IX corners not covered by per-chain rects
    cornerSidewalkPads,   // concrete wedges between rounded curb and chain ped-zone outer edges
    byChain,
    corners: allCorners,
  }
}
