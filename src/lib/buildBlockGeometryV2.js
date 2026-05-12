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
// terminal is the labelling field that distinguishes "this side has a
// sidewalk band" from "this side is curb-only / lawn-only". A permissive
// fallback (treat width-presence as terminal='sidewalk') was tried and
// rolled back 2026-05-10: it produced visible regressions where some IX
// legs had widths set without intending a sidewalk band, causing pads
// to emit at the wrong corners and visually invert (asphalt-color where
// concrete should be, alpha 0 where asphalt should be). The runtime
// canary just below catches the OPPOSITE regression (pads missing where
// they should be) and is the safer defense.
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
function cornersAtIx(ix, streetsByName, ixOverrides, cornerOverrides, blockCustoms, chainIdxByChain, feLookup, ixByChain) {
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
    const segments = naturalSegments(chain, ixByChain?.get(chain))
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
      // D.5 customs lookup: the leg's left/right physical sides each
      // belong to one block-edge (one frontage edge per side per
      // segOrd). For each side, find the fe in feLookup, then resolve
      // blockCustoms[fe.blockKey][fe.edgeOrd] (if present) or fall
      // back to chain.measure[side]. Side orientation is in chain
      // coordinates; the leg-side flip for back legs happens below.
      const segOrd = segmentForLeg(dir)
      const feL = (chainIdx != null && segOrd != null)
        ? feLookup?.[chainIdx]?.[segOrd]?.left : null
      const feR = (chainIdx != null && segOrd != null)
        ? feLookup?.[chainIdx]?.[segOrd]?.right : null
      const customL = feL ? blockCustoms?.[feL.blockKey]?.[feL.edgeOrd] : null
      const customR = feR ? blockCustoms?.[feR.blockKey]?.[feR.edgeOrd] : null
      const effL = customL || m.left
      const effR = customR || m.right
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
        skel,
        name: chain.name || null,
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
    // Skip the angular wedge between two legs of the same NAMED street
    // ONLY when the wedge is near-180° — the through-street at a
    // T-intersection where the chain continues straight. Real corners
    // along a same-named chain (skeleton.js splits at sharp folds, so
    // two halves of one named street can meet at e.g. 90°) have small
    // theta and MUST keep emitting a corner pad — those are real block
    // corners. Per the pad load-bearing memo: pad fills the wedge
    // between rounded curb arc and the two STRAIGHT ped-band inner
    // edges meeting at a corner; only the through-T phantom (theta≈180°)
    // has no two inner edges meeting.
    const theta_deg = theta * 180 / Math.PI
    // Skip the angular wedge between two legs of the same NAMED street
    // when the wedge is near-180° (the through-street at a T-intersection
    // where the chain continues straight). Per the pad memo: pad fills the
    // wedge between rounded curb arc and the two STRAIGHT ped-band inner
    // edges meeting at a corner; with one street wrapping both legs there
    // are no two inner edges meeting here. theta in (150°, 210°) bounds
    // the through-T case while preserving any real fold-corners (which
    // have theta well below 150°). Polygon-walking band emission makes
    // this filter redundant for bands, but it's still needed because
    // round-corners on asphalt and per-IX corner records also feed off
    // cornersAtIx output.
    if (A.name && B.name && A.name === B.name && theta_deg > 150 && theta_deg < 210) continue

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

// ⚠ PERMANENT FEATURE — DO NOT REMOVE.
//
// The concrete corner pad is a hard-won feature that has been removed
// twice on the false theory that "block-edge-owned ribbons will erase
// it structurally." That theory is wrong. The pad fills the wedge
// between the ROUNDED CURB ARC and the two STRAIGHT ped-band inner
// edges that meet at the block's corner. Leg ribbons are straight
// strips parallel to straight block edges; they don't follow the arc.
// The wedge between the arc and the leg-ribbon ends is therefore
// always present, regardless of emission strategy (chain-derived OR
// block-edge-derived). The pad maps to a real-world thing: an ADA
// corner landing / concrete corner apron.
//
// **Principle.** Visible geometry is permanent; how it's *derived*
// can change with the emitter, but the visual region must always be
// filled. A migration to block-edge ribbons should produce the same
// pad geometry through a cleaner derivation
// (`block_polygon's_corner_arc − (leg_ribbon_A ∪ leg_ribbon_B)`),
// not delete it. The same principle applies to `cornerAsphaltPlugs`
// just below: today they patch the rounded fillet that per-chain
// rectangles don't cover; under block-edge ownership the asphalt
// would be a single unioned shape and the plug becomes part of that
// shape — but the visual region (rounded asphalt mouth at every IX)
// must always be filled. Never remove either pre-emptively. Designer
// + bake + Preview + Stage all consume the same V2 output; any
// visible regression in Designer cascades straight to Preview.
//
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
  // closes tangentially.
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
//
// IX-identity source: when `ixSet` (Set<pointIdx>) is provided, those
// indices are the IX vertices. When omitted, falls back to trusting
// `street.intersections[].ix` integers — historical behavior, retained
// for safety but known to be stale (~36% on LS, and on toy when a chain
// has interior bends preceding an IX). The walker and emitter share
// `resolveChainSegmentation`-produced ixSets so segOrd↔edgeOrd
// mappings stay consistent.
function naturalSegments(street, ixSet) {
  const n = (street.points || []).length
  if (n < 2) return []
  let ixs
  if (ixSet) {
    ixs = [...ixSet].filter(i => Number.isInteger(i) && i > 0 && i < n - 1)
                    .sort((a, b) => a - b)
  } else {
    ixs = (street.intersections || [])
      .map(r => r.ix).filter(i => Number.isInteger(i) && i > 0 && i < n - 1)
      .sort((a, b) => a - b)
  }
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

// Resolve true IX identity per chain by COORDINATE-MATCH rather than
// trusting `street.intersections[].ix` integers (which are stale on LS
// ~36% and broken on toy where chain interior bends shift point indices).
//
// Returns: Map<street, Set<pointIdx>> — for each chain, the set of point
// indices whose coordinate is shared by ≥2 distinct chains within EPS.
// Coordinate-shared = real IX. Index-only matches without coord-sharing =
// chain interior bend (saw-tooth jog, gentle curve, etc) — NOT an IX.
//
// Consumed by:
//   - buildFrontageEdges (walker): demote interior-bend block-ring
//     vertices from corner-detection regardless of turn angle.
//   - naturalSegments: partition chains by true IXs, not stale indices.
//   - cornersAtIx (via chain lookups inside naturalSegments): leg→segOrd
//     resolution uses the same partition that emitChain uses.
//
// Single source of truth for "what is an IX on this chain" — the contract
// the D.7a coordination note named.
export function resolveChainSegmentation(streets) {
  const EPS = 0.5  // meters — same scale as resolveIxRef tolerance
  const posKey = (x, z) => `${Math.round(x / EPS)}|${Math.round(z / EPS)}`
  // First pass: bucket every chain.point coord → which chains own it.
  const ownersByPos = new Map()
  for (let ci = 0; ci < streets.length; ci++) {
    const s = streets[ci]
    if (!s?.points) continue
    for (const p of s.points) {
      const k = posKey(p[0], p[1])
      let owners = ownersByPos.get(k)
      if (!owners) { owners = new Set(); ownersByPos.set(k, owners) }
      owners.add(ci)
    }
  }
  // Second pass: for each chain, mark indices whose coord is shared by
  // ≥2 distinct chains. Endpoints are eligible (T-intersection where one
  // chain terminates into another's middle).
  const out = new Map()
  for (let ci = 0; ci < streets.length; ci++) {
    const s = streets[ci]
    if (!s?.points) { out.set(s, new Set()); continue }
    const ix = new Set()
    for (let pi = 0; pi < s.points.length; pi++) {
      const k = posKey(s.points[pi][0], s.points[pi][1])
      if ((ownersByPos.get(k)?.size ?? 0) >= 2) ix.add(pi)
    }
    out.set(s, ix)
  }
  return out
}

// D.1/D.3 — Block-edge frontages (polygon-walking, per PM-2 spec).
//
// **The architecture: block is positive space.** Each block ring in
// `blockSharp` (= stencil − asphaltSharp, sharp-cornered figure-ground
// inverse of asphalt) is walked; vertices whose local turn exceeds the
// corner threshold mark real block corners; vertices below the threshold
// are colinear interior points along a single block-edge (typically
// chain-IX vertices where the chain crosses but the BLOCK continues
// straight through). Each contiguous run of vertices between two
// consecutive corners is ONE block-edge — the spec's "leg ribbon
// running corner-to-corner of the BLOCK, independent of how the chain
// on the other side is segmented."
//
// For each block-edge, the adjacent chain is identified by probing
// outward (away from block interior) to find the closest chain
// centerline. That chain's `measure[side]` provides the band depths
// (treelawn / sidewalk). When operator-authored customs migrate to
// `[blockKey][edgeOrd]` keying (D.5), they override here; for now
// we use chain.measure default — per-segOrd customs aren't honored
// at the block-edge level (architectural correctness over operator
// convenience until D.5 lands).
//
// Output: [{ points, blockKey, edgeOrd, chainIdx, side }]
//   points    — block-edge polyline (slice of blockSharp ring vertices),
//                INCLUDING both block corners. At curb position
//                (perpendicular distance ≈hw from chain centerline).
//   chainIdx  — index of adjacent chain in `streets` (for measure lookup)
//   side      — 'left' | 'right' relative to chain's forward direction
//                (V1 sign convention preserved: 'left' → sideSign=-1)
//   blockKey  — bbox-center key of this block ring
//   edgeOrd   — sequential ordinal of this edge within its block ring
// Spatial index over chain segments. Cell size matches the adjacency
// probe radius so a point in cell (cx,cz) is within PROBE_MAX of any
// segment whose bbox touches cells (cx±1, cz±1). One-shot build per V2
// pass; queries inside findAdjacentChainForBlockEdge drop the inner
// scan from O(streets × segs) to O(few candidates per probe cell).
const CHAIN_INDEX_CELL = 30  // meters — must match PROBE_MAX below

function buildChainSegmentIndex(streets) {
  const cells = new Map()
  const cs = CHAIN_INDEX_CELL
  const push = (cx, cz, entry) => {
    const k = cx * 100000 + cz  // assumes |cx|,|cz| < 50000 cells (1500km)
    let bucket = cells.get(k)
    if (!bucket) { bucket = []; cells.set(k, bucket) }
    bucket.push(entry)
  }
  for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) {
    const s = streets[chainIdx]
    if (!s || s.disabled || !s.points || s.points.length < 2 || !s.measure) continue
    const cps = s.points
    for (let i = 0; i < cps.length - 1; i++) {
      const ca = cps[i], cb = cps[i + 1]
      const cdx = cb[0] - ca[0], cdz = cb[1] - ca[1]
      const cL2 = cdx * cdx + cdz * cdz
      if (cL2 < 1e-9) continue
      const minX = Math.min(ca[0], cb[0]), maxX = Math.max(ca[0], cb[0])
      const minZ = Math.min(ca[1], cb[1]), maxZ = Math.max(ca[1], cb[1])
      const cx0 = Math.floor(minX / cs), cx1 = Math.floor(maxX / cs)
      const cz0 = Math.floor(minZ / cs), cz1 = Math.floor(maxZ / cs)
      const entry = { chainIdx, ca, cb, cdx, cdz, cL2 }
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) push(cx, cz, entry)
      }
    }
  }
  return { cells, cellSize: cs }
}

function buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain) {
  if (!streets?.length || !blockSharp?.length) return []
  const out = []
  // ixByChain is threaded through here purely for downstream consumers
  // (segOrd assignment runs as a post-pass via assignSegOrdsToFes which
  // also takes ixByChain); corner detection here uses chain-ownership
  // probe and does not consult it.

  // Fallback angle threshold for stencil/parcel-boundary vertices where
  // neither adjacent segment has a chain owner. Chain-identity transitions
  // are the PRIMARY corner signal (below); this only fires when both sides
  // are non-asphalt and we still need to partition the ring sensibly.
  const FALLBACK_TURN_DEG = 30
  const FALLBACK_TURN_COS = Math.cos(FALLBACK_TURN_DEG * Math.PI / 180)

  for (const ring of blockSharp) {
    if (!ring || ring.length < 4) continue
    const N = ring.length
    const blockKey = blockKeyFromRing(ring)
    const ccw = ringSignedArea2D(ring) >= 0  // standard winding flag

    // Per-segment owning chain. Segment i = ring[i] → ring[(i+1) % N].
    // Probe outward (away from block interior) to find nearest chain
    // running alongside this segment. -1 means no chain in range (parcel-
    // internal or stencil-boundary segment).
    const ownerOf = new Array(N)
    for (let i = 0; i < N; i++) {
      const a = ring[i], b = ring[(i + 1) % N]
      const adj = findAdjacentChainForBlockEdge([a, b], ccw, streets, chainIndex)
      ownerOf[i] = adj ? adj.chainIdx : -1
    }

    // Corner detection: identity-driven. A vertex is a block corner iff
    // the owning chain changes between the segment BEFORE it and the
    // segment AFTER it. Two different chains meeting = real corner. Same
    // chain on both sides = chain interior bend (e.g. HW3 saw-tooth
    // 45° jog at (0,40)) — keep the polyline whole. Stencil/parcel-only
    // vertices (-1 → -1) fall back to a 30° angle test so the ring still
    // partitions at sharp parcel-side turns.
    const cornerIdxs = []
    for (let i = 0; i < N; i++) {
      const beforeOwner = ownerOf[(i - 1 + N) % N]
      const afterOwner  = ownerOf[i]
      if (beforeOwner !== afterOwner) { cornerIdxs.push(i); continue }
      if (beforeOwner === -1) {
        // Both sides non-asphalt → use geometric fallback.
        const prev = ring[(i - 1 + N) % N]
        const cur = ring[i]
        const next = ring[(i + 1) % N]
        const inX = cur[0] - prev[0], inZ = cur[1] - prev[1]
        const outX = next[0] - cur[0], outZ = next[1] - cur[1]
        const inLen = Math.hypot(inX, inZ), outLen = Math.hypot(outX, outZ)
        if (inLen < 1e-6 || outLen < 1e-6) continue
        const dot = (inX * outX + inZ * outZ) / (inLen * outLen)
        if (dot < FALLBACK_TURN_COS) cornerIdxs.push(i)
      }
    }
    if (cornerIdxs.length < 3) continue  // degenerate block

    // For each block-edge between two consecutive corners, slice out the
    // block-edge polyline (corner → ... → next corner), find the
    // adjacent chain, emit a frontage record.
    for (let k = 0; k < cornerIdxs.length; k++) {
      const c1 = cornerIdxs[k]
      const c2 = cornerIdxs[(k + 1) % cornerIdxs.length]
      const points = []
      let idx = c1
      while (true) {
        points.push(ring[idx])
        if (idx === c2) break
        idx = (idx + 1) % N
      }
      if (points.length < 2) continue
      const adj = findAdjacentChainForBlockEdge(points, ccw, streets, chainIndex)
      if (!adj) continue  // not asphalt-facing (parcel-internal edge)
      // segOrds left empty here; filled in a single post-pass by
      // assignSegOrdsToFes which attributes each natural segment to its
      // closest fe per (chainIdx, side). See comment block above
      // assignSegOrdsToFes for why this is post-passed rather than
      // computed per-fe.
      out.push({ points, blockKey, edgeOrd: k,
                 chainIdx: adj.chainIdx, side: adj.side, ringCcw: ccw,
                 segOrds: [] })
    }
  }
  return out
}

// Assign chain natural-segment ordinals to the frontage edges (fes)
// that own them. SINGLE-PASS, per (chainIdx, sideKey) group: every
// natural segment is attributed to EXACTLY ONE fe — the fe whose
// polyline midpoint is closest to the segment's midpoint (within a
// generous radius). This eliminates both:
//
//   (a) Adjacent-block leakage: each segment goes to its unique
//       closest fe, so no two fes share a segOrd.
//
//   (b) The corner-coverage gap that the prior t∈[0,1] guard caused:
//       when a segment's midpoint sat just past an fe's polyline end
//       (across a corner), both neighbouring fes rejected it and the
//       segOrd ended up in nobody's list, breaking findFeForSide /
//       feBySegSide back-resolution. With single-fe assignment and a
//       clamped perpendicular metric, the segment naturally lands in
//       whichever neighbour is structurally closer.
//
// Writes fe.segOrds in place. Ties broken by edgeOrd ascending so
// behaviour is deterministic.
function assignSegOrdsToFes(fes, streets, ixByChain) {
  // Group fes by (chainIdx, sideKey).
  const groups = new Map()  // chainIdx → side → fe[]
  for (const fe of fes) {
    fe.segOrds = []
    if (fe.chainIdx == null) continue
    let bySide = groups.get(fe.chainIdx)
    if (!bySide) { bySide = new Map(); groups.set(fe.chainIdx, bySide) }
    let arr = bySide.get(fe.side)
    if (!arr) { arr = []; bySide.set(fe.side, arr) }
    arr.push(fe)
  }
  // Perpendicular distance² from p to fe.points, with t CLAMPED to
  // [0, 1]. Clamping is safe under single-fe assignment: a point past
  // the polyline's extent is only credited to a fe if no other fe has
  // a closer in-range projection, so no leakage. Without clamping a
  // chain segment whose midpoint sits across a corner has no in-range
  // projection on any fe and ends up unassigned (the bug).
  const distToFe2 = (fe, p) => {
    let best = Infinity
    const pts = fe.points
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1]
      const dx = b[0] - a[0], dz = b[1] - a[1]
      const L2 = dx * dx + dz * dz
      if (L2 < 1e-9) continue
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const qx = a[0] + t * dx, qz = a[1] + t * dz
      const d2 = (p[0] - qx) ** 2 + (p[1] - qz) ** 2
      if (d2 < best) best = d2
    }
    return best
  }
  for (const [chainIdx, bySide] of groups) {
    const chain = streets[chainIdx]
    if (!chain?.points || chain.points.length < 2) continue
    const cps = chain.points
    const segments = naturalSegments(chain, ixByChain?.get(chain))
    // Threshold off chain's max possible perpendicular distance, same
    // rationale as the prior code: pavement can be much wider than the
    // default measure under per-block-edge customs. 30m matches the
    // PROBE_MAX in findAdjacentChainForBlockEdge.
    const hwMax = Math.max(
      chain.measure?.left?.pavementHW || 0,
      chain.measure?.right?.pavementHW || 0,
      0,
    )
    const ALONG_TOL = Math.max(12, hwMax + 25)
    const ALONG_TOL2 = ALONG_TOL * ALONG_TOL
    for (const [, feArr] of bySide) {
      if (feArr.length === 0) continue
      for (let segOrd = 0; segOrd < segments.length; segOrd++) {
        const s = segments[segOrd]
        if (s.end <= s.start) continue
        // Probe by segment MIDPOINT (well inside segment interior, far
        // from IX corners where multiple fe polylines coincide).
        const midI = (s.start + s.end) / 2
        const lo = Math.floor(midI), hi = Math.ceil(midI)
        const mp = (lo === hi)
          ? cps[lo]
          : [(cps[lo][0] + cps[hi][0]) * 0.5, (cps[lo][1] + cps[hi][1]) * 0.5]
        let bestFe = null
        let bestD2 = ALONG_TOL2
        for (const fe of feArr) {
          const d2 = distToFe2(fe, mp)
          if (d2 < bestD2) {
            bestD2 = d2
            bestFe = fe
          } else if (d2 === bestD2 && bestFe && fe.edgeOrd < bestFe.edgeOrd) {
            // Deterministic tie-break: lower edgeOrd wins.
            bestFe = fe
          }
        }
        if (bestFe) bestFe.segOrds.push(segOrd)
      }
    }
  }
  // Sort+dedup each fe's segOrds (push order is segOrd-ascending already,
  // but be defensive).
  for (const fe of fes) {
    if (fe.segOrds.length > 1) {
      fe.segOrds = [...new Set(fe.segOrds)].sort((a, b) => a - b)
    }
  }
}

// Probe outward from a block-edge midpoint and return the closest chain
// (and which side of that chain the block-edge sits on, in the V1 sign
// convention). Returns null if no chain is within range — that block
// edge is parcel-internal, not asphalt-facing.
function findAdjacentChainForBlockEdge(edgePoints, ringCcw, streets, chainIndex) {
  const N = edgePoints.length
  if (N < 2) return null
  // Use the vertex pair around the polyline midpoint to define the
  // local edge direction (avoids issues with corner-side endpoints).
  const mid = Math.floor(N / 2)
  const a = edgePoints[Math.max(0, mid - 1)]
  const b = edgePoints[Math.min(N - 1, mid)]
  const tx = b[0] - a[0], tz = b[1] - a[1]
  const tL = Math.hypot(tx, tz)
  if (tL < 1e-6) return null
  // Outward normal = right of walk direction for CCW (interior on left).
  // Right perp of (tx, tz) = (tz, -tx). For CW, flip.
  const sign = ringCcw ? +1 : -1
  const nx = sign * tz / tL, nz = sign * (-tx) / tL
  const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5

  const PROBE_MAX = 30  // meters — past any reasonable hw + cw
  let bestDist = Infinity
  let bestChainIdx = -1
  let bestSegA = null, bestSegB = null
  // Spatial-index path: query 3×3 cells around each probe point.
  // Falls back to full scan if no index supplied (preserves caller
  // contract).
  const cs = chainIndex?.cellSize
  const cellMap = chainIndex?.cells
  const seen = cellMap ? new Set() : null
  const checkEntry = (entry, px, pz) => {
    const { ca, cb, cdx, cdz, cL2 } = entry
    const t = Math.max(0, Math.min(1, ((px - ca[0]) * cdx + (pz - ca[1]) * cdz) / cL2))
    const qx = ca[0] + t * cdx, qz = ca[1] + t * cdz
    const dist = Math.hypot(px - qx, pz - qz)
    if (dist < bestDist) {
      bestDist = dist
      bestChainIdx = entry.chainIdx
      bestSegA = ca; bestSegB = cb
    }
  }
  for (let probe = 1; probe <= PROBE_MAX; probe += 2) {
    const px = mx + nx * probe, pz = mz + nz * probe
    if (cellMap) {
      const cx = Math.floor(px / cs), cz = Math.floor(pz / cs)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = cellMap.get((cx + dx) * 100000 + (cz + dz))
          if (!bucket) continue
          for (let k = 0; k < bucket.length; k++) {
            const entry = bucket[k]
            // Dedup: a segment that spans multiple cells appears in
            // each. Same entry reference is pushed into every cell it
            // covers, so object-identity dedup is exact.
            if (seen.has(entry)) continue
            seen.add(entry)
            checkEntry(entry, px, pz)
          }
        }
      }
      seen.clear()
    } else {
      for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) {
        const s = streets[chainIdx]
        if (!s || s.disabled || !s.points || s.points.length < 2 || !s.measure) continue
        const cps = s.points
        for (let i = 0; i < cps.length - 1; i++) {
          const ca = cps[i], cb = cps[i + 1]
          const cdx = cb[0] - ca[0], cdz = cb[1] - ca[1]
          const cL2 = cdx * cdx + cdz * cdz
          if (cL2 < 1e-9) continue
          checkEntry({ chainIdx, ca, cb, cdx, cdz, cL2 }, px, pz)
        }
      }
    }
    if (bestDist < 3) break  // close enough
  }
  if (bestChainIdx < 0 || bestDist > PROBE_MAX) return null

  // Determine side: project (mx - ca, mz - ca) onto chain's LEFT perp.
  // computePerps returns LEFT perp for forward T; per the existing V1
  // convention, sideKey='left' → sideSign=-1 → band emitted in -leftPerp
  // direction. So a block-edge in +leftPerp direction from the chain
  // corresponds to sideKey='right' (sideSign=+1), and -leftPerp → 'left'.
  const cdx = bestSegB[0] - bestSegA[0], cdz = bestSegB[1] - bestSegA[1]
  const leftPx = -cdz, leftPz = cdx
  const projL = (mx - bestSegA[0]) * leftPx + (mz - bestSegA[1]) * leftPz
  const side = projL > 0 ? 'right' : 'left'
  return { chainIdx: bestChainIdx, side }
}

// D.3 — Block-edge bands (polygon-walking, per PM-2 spec).
//
// For each frontage edge from `buildFrontageEdges` (= one block-edge of
// one block, with adjacent chain identified), emit treelawn + sidewalk
// rings by parallel-offsetting the block-edge polyline INWARD into the
// block. The block-edge polyline IS the curb edge (at perpendicular
// distance ≈hw from the chain's centerline, on the block side of the
// asphalt). Band depths come from chain.measure[side].
//
//   inner of treelawn (= curb-side) = block-edge offset inward by cw
//   outer of treelawn               = inward by cw + tl
//   outer of sidewalk               = inward by cw + tl + sw
//
// "Inward" = into block interior. For CCW block ring (interior on
// left of walking direction), inward = +leftPerp. For CW, inward =
// -leftPerp. computePerps returns the LEFT perp of forward direction,
// so the offset sign is +1 / −1 for CCW / CW respectively.
//
// One ring per band per frontage edge. NO internal seams at chain-IX
// vertices (those are interior to the block-edge polyline, not block
// corners). NO frontageCaps emitted — the existing `cornerSidewalkPads`
// + `cornerAsphaltPlugs` (cornersAtIx-derived, load-bearing per the
// pad memo) fill the corner concrete at block corners.
//
// Bands are clipped to blockRounded so they don't bleed past the
// rounded block silhouette at corners (where the round-corners op cut
// into the sharp polygon).
function buildFrontageBands(streets, frontageEdges, curbWidth, blockRounded, blockCustoms) {
  if (!frontageEdges?.length) return { frontageBands: [], frontageCaps: [] }
  const cw = curbWidth
  const out = []

  for (const fe of frontageEdges) {
    const street = streets[fe.chainIdx]
    if (!street?.measure) continue
    // D.5 customs: block-edge override wins, else chain default. The
    // override is keyed by (blockKey, edgeOrd) and shaped like a
    // chain.measure[side] entry: { terminal, treelawn, sidewalk,
    // pavementHW }. side is implicit in the block-edge identity.
    const blockOverride = blockCustoms?.[fe.blockKey]?.[fe.edgeOrd]
    const eff = blockOverride || street.measure[fe.side] || {}
    if (eff.terminal !== 'sidewalk') continue
    const tl = eff.treelawn || 0
    const sw = eff.sidewalk || 0
    if (tl <= 0 && sw <= 0) continue

    const points = fe.points
    if (!points || points.length < 2) continue
    const perps = computePerps(points)
    const inwardSign = fe.ringCcw ? +1 : -1

    const offsetPolyline = (r) =>
      points.map((p, i) => [
        p[0] + perps[i][0] * inwardSign * r,
        p[1] + perps[i][1] * inwardSign * r,
      ])

    // Three offset polylines bounding the two bands.
    const innerEdge = offsetPolyline(cw)              // band's curb-side
    const tlOuterEdge = offsetPolyline(cw + tl)       // tl outer = sw inner
    const swOuterEdge = offsetPolyline(cw + tl + sw)  // sw outer

    const closeRing = (outerEdge, innerEdge_) => {
      if (outerEdge.length < 2 || innerEdge_.length < 2) return null
      const ring = [...outerEdge, ...innerEdge_.slice().reverse()]
      return ringSignedArea2D(ring) >= 0 ? ring : ring.slice().reverse()
    }

    const treelawnRings = []
    const sidewalkRings = []
    if (tl > 0) {
      const r = closeRing(tlOuterEdge, innerEdge)
      if (r) treelawnRings.push(r)
    }
    if (sw > 0) {
      const r = closeRing(swOuterEdge, tlOuterEdge)
      if (r) sidewalkRings.push(r)
    }
    if (!treelawnRings.length && !sidewalkRings.length) continue

    out.push({
      blockKey: fe.blockKey,
      edgeOrd: fe.edgeOrd,
      chainIdx: fe.chainIdx,
      side: fe.side,
      points,
      treelawnRings,
      sidewalkRings,
    })
  }

  // Clip to blockRounded so bands don't bleed past the rounded block
  // silhouette at corners where round-corners cut into the sharp polygon.
  // Each fe lives entirely inside its OWN block (bands are inset inward
  // from the block edge), so we only need to clip against that one
  // block ring — not the global blockRounded (~80 rings on LS). Per-
  // block lookup turns ~500 Clipper ops × 80-ring clip into ~500 Clipper
  // ops × 1-ring clip. Dominant cost in the V2 build at LS scale.
  if (blockRounded?.length) {
    const ringByKey = new Map()
    for (const ring of blockRounded) {
      ringByKey.set(blockKeyFromRing(ring), ring)
    }
    for (const fe of out) {
      const ring = ringByKey.get(fe.blockKey)
      if (!ring) continue
      const clip = [ring]
      if (fe.treelawnRings.length) fe.treelawnRings = intersectRings(fe.treelawnRings, clip)
      if (fe.sidewalkRings.length) fe.sidewalkRings = intersectRings(fe.sidewalkRings, clip)
    }
  }
  return { frontageBands: out, frontageCaps: [] }
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

function ringSignedArea2D(r) {
  let a = 0
  for (let i = 0, n = r.length; i < n; i++) {
    const [x1, y1] = r[i]
    const [x2, y2] = r[(i + 1) % n]
    a += (x1 * y2 - x2 * y1)
  }
  return a / 2
}
// Closed band ring: outer edge forward, inner edge backward, then
// normalized to CCW. Walking outer-then-inner-reversed gives CCW for
// left-side and CW for right-side; if we leave it CW, downstream
// `intersectRings` with a NonZero subject fill rule cancels it against
// CCW rings of the same chain at IX overlaps and produces empty bands.
// Forcing CCW means every ring contributes positively to the union.
function chainStripBand(pts, perps, side, dInner, dOuter) {
  if (dOuter <= dInner) return null
  if (pts.length < 2) return null
  const inner = pts.map((p, i) => [p[0] + side * perps[i][0] * dInner, p[1] + side * perps[i][1] * dInner])
  const outer = pts.map((p, i) => [p[0] + side * perps[i][0] * dOuter, p[1] + side * perps[i][1] * dOuter])
  const ring = [...outer, ...inner.slice().reverse()]
  return ringSignedArea2D(ring) >= 0 ? ring : ring.slice().reverse()
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

// Set to true to log per-step timings each V2 build. Useful when chasing
// performance regressions; silent by default to avoid console spam.
const V2_PROFILE = false

export function buildBlockGeometryV2(ribbons, opts = {}) {
  const __t0 = V2_PROFILE ? performance.now() : 0
  const __times = V2_PROFILE ? {} : null
  const __mark = V2_PROFILE
    ? (label) => {
      const now = performance.now()
      __times[label] = now - (__times.__last || __t0)
      __times.__last = now
    }
    : () => {}
  const { cornerRadiusScale = 1, stencil = null,
    cornerRadiusOverrides = null, cornerCornerRadiusOverrides = null,
    curbWidth = CURB_WIDTH, blockCustoms = null,
    blockLandUse = null } = opts
  const streets = ribbons?.streets || []
  const intersections = ribbons?.intersections || []

  // Single source of truth for IX identity per chain (coord-shared with
  // ≥2 chains). Used by naturalSegments + buildFrontageEdges so emitter
  // and walker partition by the SAME boundaries. Stale `intersections.ix`
  // integers are no longer trusted.
  const ixByChain = resolveChainSegmentation(streets)

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
      // Chain-endpoint round quarter caps live in their own arrays.
      // Per-chain treelawn/sidewalk band emission retired in D.7d —
      // frontageBands (polygon-walking output, per-block-edge) is the
      // sole source of ped-zone band geometry. byChain still carries
      // asphalt rings (chain identity matters for the corner-plug diff)
      // and the round-cap rings (no fe equivalent — chain endpoints
      // don't belong to a block-edge polyline).
      treelawnCapRings: [],
      sidewalkCapRings: [],
    })
  }

  // ── Per-segment per-chain emission. Each natural segment of each
  // chain can have its own per-side measure (when a block-customs
  // override applies). The segment's ASPHALT rectangle uses eff.pavementHW
  // per side; ped-zone bands use eff.treelawn / eff.sidewalk. Asphalt
  // segments butt at IXs; clipper's union step merges them. Round caps
  // at chain endpoints get a half-disc arc baked into the segment ring.
  //
  // Customs are keyed by [blockKey][edgeOrd] (D.5/D.6). Resolving them
  // requires a (chainIdx, segOrd, sideKey) → (blockKey, edgeOrd) lookup,
  // which is itself derived from the block geometry (and therefore from
  // the asphalt emission output). To break this circular dependency we
  // emit twice: pass 1 uses chain defaults only (resolver = null) to
  // establish a frontage-edge lookup; pass 2 re-emits affected chains
  // with the resolver pointed at feLookup. blockKey is bbox-stable to
  // width changes (see blockKeyFromRing), so pass-1 keys remain valid.
  const cw = curbWidth   // global curb width; per-side curb overrides aren't supported in V2

  const emitChain = (chainIdx, customsResolver) => {
    const street = streets[chainIdx]
    const entry = byChain[chainIdx]
    if (!entry) return
    const pts = street.points
    const m = street.measure
    if (!pts || pts.length < 2 || !m) return

    // Reset (re-entry safe — pass 2 calls this again for chains touched
    // by customs).
    entry.asphaltRings.length = 0
    entry.treelawnCapRings.length = 0
    entry.sidewalkCapRings.length = 0

    const n = pts.length
    const perps = computePerps(pts)
    const segments = naturalSegments(street, ixByChain.get(street))
    const capStart = street.capStart || street.capEnds?.start
    const capEnd   = street.capEnd   || street.capEnds?.end

    const resolveSide = (segOrd, sideKey) =>
      (customsResolver && customsResolver(chainIdx, segOrd, sideKey)) || m[sideKey] || {}

    for (let segOrd = 0; segOrd < segments.length; segOrd++) {
      const seg = segments[segOrd]
      const segPts = pts.slice(seg.start, seg.end + 1)
      const segPerps = perps.slice(seg.start, seg.end + 1)
      const segLen = segPts.length
      if (segLen < 2) continue

      const effL = resolveSide(segOrd, 'left')
      const effR = resolveSide(segOrd, 'right')
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
        const ring = [...leftEdge, ...rightEdge.slice().reverse()]
        // Normalize to CCW. Without this the ring's winding flips with
        // chain direction, and unionRings (NonZero) cancels mixed-winding
        // overlaps at IXs — leaves gaps that the corner-asphalt plug is
        // sized to fill, but those gaps then leak ground through the
        // already-plugged area when the plug overlaps a CW asphalt ring.
        entry.asphaltRings.push(ringSignedArea2D(ring) >= 0 ? ring : ring.slice().reverse())
      }

      // Per-side ped-zone bands are emitted by buildFrontageBands from
      // the polygon-walked block-edge polylines (D.3c, D.7d). The
      // per-chain emission used to do this in parallel; that path has
      // been retired — frontageBands is now the sole source.
    }
    // V1-style per-side per-band quarter caps at round-cap endpoints.
    // Each side emits up to 3 quarter rings (asphalt pie + treelawn
    // annulus + sidewalk annulus). Per-segment custom widths apply:
    // start-cap reads the FIRST segment, end-cap reads the LAST.
    // `t` = +1 at the end (T_out = chain forward) or -1 at the start
    // (T_out = chain backward); flips chain.left/right → sideSign so
    // the radial bands sit on the visually correct side after the flip.
    const emitQuarterCaps = (endpoint, T_out, segIdx, t) => {
      const effL = resolveSide(segIdx, 'left')
      const effR = resolveSide(segIdx, 'right')
      const sides = [
        { eff: effL, sideSign: -t },
        { eff: effR, sideSign: +t },
      ]
      // Quarter-cap geometry is generated CCW on one side and CW on the
      // other depending on sideSign (the perp basis flips). Without
      // normalizing, Clipper's NonZero union cancels mixed-winding caps
      // against the matching asphalt rectangle and leaves a hole at the
      // dead-end. Normalize every emitted cap ring to CCW, same pattern
      // as the segment-asphalt emission above.
      const pushCcw = (arr, ring) => {
        if (!ring) return
        arr.push(ringSignedArea2D(ring) >= 0 ? ring : ring.slice().reverse())
      }
      for (const { eff, sideSign } of sides) {
        const hw = eff.pavementHW || 0
        if (hw <= 0) continue
        // Asphalt pie slice fills out from the chain endpoint to hw.
        pushCcw(entry.asphaltRings, quarterCap(endpoint, T_out, sideSign, 0, hw))
        if (eff.terminal !== 'sidewalk') continue
        const tl = eff.treelawn || 0
        const sw = eff.sidewalk || 0
        if (tl > 0) pushCcw(entry.treelawnCapRings, quarterCap(endpoint, T_out, sideSign, hw + cw, hw + cw + tl))
        if (sw > 0) pushCcw(entry.sidewalkCapRings, quarterCap(endpoint, T_out, sideSign, hw + cw + tl, hw + cw + tl + sw))
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

  // Pass 1: emit every chain with chain.measure defaults only. Customs
  // resolver is null here; the resulting asphaltSharp + blockSharp +
  // frontageEdges + feLookup are accurate enough that pass-1 blockKeys
  // match the (bbox-stable) blockKeys that customs are written against.
  for (let chainIdx = 0; chainIdx < streets.length; chainIdx++) emitChain(chainIdx, null)

  __mark('perChainEmit')
  // ── Now that every per-chain per-segment ring is in byChain, build
  // the global asphalt + corner + block + curb derivatives off them.
  let asphaltSharp = unionRings(byChain.flatMap(c => c?.asphaltRings || []))
  __mark('asphaltSharpUnion')

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
  // Reordered for D.5: compute blockSharp + frontageEdges BEFORE
  // cornersAtIx so the corner pass can resolve each leg's adjacent
  // block-edge for [blockKey][edgeOrd]-keyed customs lookup. This is
  // the bridge between chain-segment-keyed cornersAtIx legs and
  // block-edge-keyed customs.
  let blockSharp = []
  if (stencil && stencil.length >= 3) {
    blockSharp = differenceRings([stencil], asphaltSharp)
  }
  __mark('blockSharpDiff')
  // D.3 — Block-edge frontages (polygon-walking, per PM-2 spec).
  // For each block ring in blockSharp, walk vertices, find block corners
  // (sharp turns), and emit one frontage edge per (block, block-edge).
  // The adjacent chain is identified by spatial probe; its measure
  // provides band depths. ONE ring per band per frontage edge, no
  // internal seams. cornerSidewalkPads + cornerAsphaltPlugs fill the
  // corner concrete (unchanged from prior architecture).
  // Spatial index over chain segments. Drops the adjacency probe from
  // O(streets × segs × probe-steps) to O(few candidates per probe cell).
  const chainIndex = buildChainSegmentIndex(streets)
  __mark('chainIndexBuild')
  let frontageEdges = buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain)
  assignSegOrdsToFes(frontageEdges, streets, ixByChain)
  __mark('frontageEdges')
  // feLookup[chainIdx][segOrd][sideKey] → fe. Inverse of fe.segOrds.
  // Used by cornersAtIx to find each leg's block-edge for D.5 customs,
  // and (during pass 2 below) by the per-chain emission resolver to map
  // (chainIdx, segOrd, sideKey) → (blockKey, edgeOrd) custom.
  const buildFeLookup = (fes) => {
    const out = {}
    for (const fe of fes) {
      if (!fe.segOrds?.length) continue
      if (!out[fe.chainIdx]) out[fe.chainIdx] = {}
      for (const segOrd of fe.segOrds) {
        if (!out[fe.chainIdx][segOrd]) out[fe.chainIdx][segOrd] = {}
        out[fe.chainIdx][segOrd][fe.side] = fe
      }
    }
    return out
  }
  let feLookup = buildFeLookup(frontageEdges)

  // D.7a — pass 2. With pass-1's feLookup we can now resolve every
  // (chainIdx, segOrd, sideKey) → (blockKey, edgeOrd) and pull the
  // matching block-edge custom. Re-emit only chains that have any
  // custom applied; rebuild asphaltSharp + blockSharp + frontageEdges
  // off the corrected per-chain rings so bands track the new asphalt
  // silhouette. BUT preserve pass-1's (blockKey, edgeOrd) identity on
  // the rebuilt fees — those are the keys blockCustoms is indexed
  // against (operator wrote against the pass-1 keys via the previous
  // V2 output stashed in _v2FrontageEdges). Pass-2 polylines drift
  // (asphalt expansion shifts block bbox centers ≥0.5m, flipping
  // blockKey rounding) but the (chainIdx, segOrd, side) tuple is
  // stable, so we match pass-2 fees back to pass-1 fees on that tuple
  // and copy the keys forward. cornersAtIx (below) then reads
  // feLookup_2 and the lookup resolves to the same blockCustoms
  // entry the operator wrote against.
  const chainsWithCustoms = new Set()
  if (blockCustoms) {
    for (const fe of frontageEdges) {
      if (blockCustoms[fe.blockKey]?.[fe.edgeOrd]) chainsWithCustoms.add(fe.chainIdx)
    }
  }
  if (chainsWithCustoms.size > 0) {
    const pass1Lookup = feLookup
    const customsResolver = (chainIdx, segOrd, sideKey) => {
      const fe = pass1Lookup[chainIdx]?.[segOrd]?.[sideKey]
      if (!fe) return null
      return blockCustoms?.[fe.blockKey]?.[fe.edgeOrd] || null
    }
    for (const chainIdx of chainsWithCustoms) emitChain(chainIdx, customsResolver)
    asphaltSharp = unionRings(byChain.flatMap(c => c?.asphaltRings || []))
    blockSharp = (stencil && stencil.length >= 3)
      ? differenceRings([stencil], asphaltSharp)
      : []
    frontageEdges = buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain)
    assignSegOrdsToFes(frontageEdges, streets, ixByChain)
    // Carry pass-1 (blockKey, edgeOrd) onto pass-2 fees by matching on
    // (chainIdx, segOrds[0], side). segOrd is coord-match-stable (see
    // resolveChainSegmentation) so the join is reliable.
    for (const fe of frontageEdges) {
      if (!fe.segOrds?.length) continue
      const p1 = pass1Lookup[fe.chainIdx]?.[fe.segOrds[0]]?.[fe.side]
      if (p1) {
        fe.blockKey = p1.blockKey
        fe.edgeOrd  = p1.edgeOrd
      }
    }
    feLookup = buildFeLookup(frontageEdges)
  }
  __mark('pass2Reemit')

  const allCorners = []
  for (const ix of intersections) {
    allCorners.push(...cornersAtIx(
      ix, streetsByName, cornerRadiusOverrides, cornerCornerRadiusOverrides,
      blockCustoms, chainIdxByChain, feLookup, ixByChain,
    ))
  }
  __mark('cornersAtIx')
  const asphaltRounded = asphaltSharp.map(ring =>
    applyRoundCornersToRing(ring, allCorners, cornerRadiusScale)
  )
  __mark('applyRoundCorners')

  // D.2 — blockRounded = stencil − asphaltRounded. The render-time
  // clipping mask, with corner round-clip arcs applied. blockSharp
  // (computed above) feeds buildFrontageEdges; blockRounded clips the
  // emitted bands so they don't bleed past the rounded silhouette.
  let blockRounded = []
  if (stencil && stencil.length >= 3) {
    blockRounded = differenceRings([stencil], asphaltRounded)
  }
  __mark('blockRoundedDiff')
  const { frontageBands, frontageCaps } = buildFrontageBands(streets, frontageEdges, curbWidth, blockRounded, blockCustoms)
  __mark('frontageBands')
  const curbDilated = dilateRings(asphaltRounded, curbWidth)
  const curbBands   = differenceRings(curbDilated, asphaltRounded)
  __mark('curbBands')

  // Per-chain clipping. Asphalt clips to the rounded asphalt polygon so
  // the per-chain meshes inherit the corner smoothing. Treelawn/sidewalk
  // were previously clipped to blockRounded for boundary cleanup, but on
  // LS data that intersect drops valid bands for ~10 chains (Allen,
  // Montrose, Geyer, Pennsylvania, Accomac, Cardinal — residential, full
  // measure, no obvious data anomaly). Pre-clip each chain has 5–10
  // bands; post-clip 0. Cause is buried in a Clipper interaction with
  // blockRounded's specific topology that we haven't isolated yet.
  // Skip the blockRounded clip — bands already sit outside the asphalt
  // by curb width so they don't bleed into roadway area; the outer
  // stencil clip in clipAllToStencil still bounds them to the
  // neighborhood silhouette. Restore once V2 root cause is fixed.
  // Phase 1 perf: skip the per-chain asphalt clip in Designer. Each
  // chain's rectangle asphalt rings overshoot asphaltRounded by 1-2m at
  // IX corners (square ends vs rounded silhouette). The clip trimmed
  // those overshoots, costing ~10s per V2 build on LS. Bake / Stage /
  // Preview render from asphaltRounded directly so they're unaffected;
  // only Designer's authoring overlay sees the overshoots. If the
  // overshoot is visible enough to bother authoring, switch to
  // rendering asphalt from asphaltRounded as a single mesh and emit
  // per-chain rings only for the selected chain (Phase 2).
  const PHASE1_SKIP_PERCHAIN_CLIP = true
  if (!PHASE1_SKIP_PERCHAIN_CLIP) {
    for (const entry of byChain) {
      if (!entry) continue
      if (entry.asphaltRings.length && asphaltRounded.length) {
        entry.asphaltRings = intersectRings(entry.asphaltRings, asphaltRounded)
      }
    }
  }
  __mark('perChainAsphaltClip')

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
  __mark('cornerAsphaltPlugs')

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
  __mark('cornerSidewalkPads')
  // ⚠ PAD INVARIANT (load-bearing per the pad memo). Pads MUST emit at
  // real corners. If the corners list is non-trivial but pads come out
  // empty, something upstream silently dropped the width/terminal data
  // that depthForSide reads — Designer will lose its concrete corner
  // landings without warning. Loud one-line console.error so the
  // regression surfaces the moment it happens, instead of being noticed
  // visually a session later.
  if (allCorners.length > 0 && cornerSidewalkPads.length === 0 && blockRounded.length > 0) {
    console.error(
      '[V2] PAD INVARIANT TRIPPED — corners=' + allCorners.length +
      ' but cornerSidewalkPads=0. Likely cause: chain.measure[side].terminal ' +
      'or treelawn/sidewalk widths missing on the legs facing real corners. ' +
      'See feedback_load_bearing_corner_pads + feedback_corner_pad_continuity_first.'
    )
  }

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
  // D.7d: ped-zone coverage comes from frontageBands (per-block-edge,
  // polygon-walked) plus byChain's chain-endpoint caps. Pre-D.7d this
  // path used byChain.{treelawn,sidewalk}Rings, which duplicated
  // frontageBands geometrically; the duplicate emission has been retired.
  const ribbonUnion = unionRings([
    ...asphaltRounded,
    ...curbBands,
    ...frontageBands.flatMap(fb => fb?.treelawnRings || []),
    ...frontageBands.flatMap(fb => fb?.sidewalkRings || []),
    ...byChain.flatMap(c => c?.treelawnCapRings || []),
    ...byChain.flatMap(c => c?.sidewalkCapRings || []),
    ...cornerSidewalkPads,
  ])
  __mark('ribbonUnion')
  let blockFill = []
  let blocks = []
  const faces = ribbons?.faces || []
  // Map face → owning blockRounded ring via centroid-in-ring test.
  // (face ∩ ownBlockRing) ≡ (face − asphaltRounded) when face ⊂ stencil
  // and asphaltRounded ⊂ stencil — which holds for LS OSM faces. Lets
  // each face clip against ONE ring instead of the whole asphaltRounded
  // (the global asphalt network). Falls back to differenceRings if no
  // unique containing ring is found (handles toy's single envelope face).
  const findOwningBlockRing = (faceRing) => {
    let cx = 0, cy = 0
    for (const p of faceRing) { cx += p[0]; cy += p[1] }
    cx /= faceRing.length; cy /= faceRing.length
    let match = null
    for (const ring of blockRounded) {
      if (pointInRing(cx, cy, ring)) {
        if (match) return null  // ambiguous — face spans multiple blocks
        match = ring
      }
    }
    return match
  }
  if (faces.length) {
    for (const face of faces) {
      if (!face?.ring || face.ring.length < 3) continue
      // Clip faces against `asphaltRounded` only, NOT against bands. Bands
      // (treelawn, sidewalk, curb stroke) render ON TOP of the face fill,
      // so the face can extend all the way to the asphalt edge — bands
      // paint over the band-zone pixels, face shows in the lawn area
      // beyond. This is what makes the parcel/lawn boundary update LIVE
      // when an operator drags a sidewalk handle in Measure: V2's face
      // snapshot stays valid for the whole band zone instead of being
      // clipped at the band's previous outer edge.
      const owning = blockRounded.length ? findOwningBlockRing(face.ring) : null
      const clipped = owning
        ? intersectRings([face.ring], [owning])
        : (asphaltRounded.length ? differenceRings([face.ring], asphaltRounded) : [face.ring])
      for (const ring of clipped) {
        if (!ring || ring.length < 3) continue
        // blockKey from each OUTPUT ring (not the source face). For LS
        // each face is already one parcel, so face-ring and output-ring
        // bbox-centers coincide and the override key is stable. For toy
        // a single envelope-face is carved by the asphalt union into
        // many output rings (the 3×3 grid blocks), and per-output-ring
        // keying is what makes pickLuFromHash give the grid its varied
        // LU palette instead of one uniform face.use across all blocks.
        const blockKey = blockKeyFromRing(ring)
        const lu = (blockLandUse && blockLandUse[blockKey])
          || face.use
          || pickLuFromHash(hashKey(blockKey))
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
  __mark('blockFill')
  if (V2_PROFILE) {
    delete __times.__last
    const __total = performance.now() - __t0
    const __sorted = Object.entries(__times).sort((a, b) => b[1] - a[1])
    console.log(`[V2] total=${__total.toFixed(0)}ms — by step:`,
      Object.fromEntries(__sorted.map(([k, v]) => [k, +v.toFixed(0)])))
  }

  return {
    asphaltSharp,
    asphaltRounded,
    blockSharp,           // D.2: stencil − asphaltSharp; sharp-corner figure for D.3 band emission
    blockRounded,         // loose: stencil − asphalt; used for adjacency + band clipping
    blockFill,            // tight: stencil − all ribbons; rendered as the parcel fill
    blocks,               // per-block { ring, blockKey, lu } for LU-aware rendering
    curbBands,
    cornerAsphaltPlugs,   // asphalt fillet wedges at IX corners not covered by per-chain rects
    cornerSidewalkPads,   // concrete wedges between rounded curb and chain ped-zone outer edges
    byChain,
    corners: allCorners,
    frontageEdges,        // D.1: per-block-edge runs of chain segments (foundation; not yet consumed)
    frontageBands,        // D.3a/b.2/b.3/b.4: per-frontageEdge tl+sw rings, extended + pulled-back, clipped to blockRounded (foundation; not yet consumed)
    frontageCaps,         // D.3b.4: (tl+sw)↔(tl+sw) corner cap halves, clipped to blockRounded via cap.ringClipped (foundation; not yet consumed)
  }
}

// Fast per-chain band emitter — builds asphalt rectangles + treelawn /
// sidewalk strip bands for ONE chain with NO Clipper booleans. Mirrors
// buildBlockGeometryV2's per-segment loop, restricted to a single chain
// + minus the global union/intersect/round-corners/curb-stroke/face-clip
// passes. ~1ms instead of 2.5s.
//
// Returns { asphaltRings, treelawnRings, sidewalkRings } in the same
// shape buildBlockGeometryV2's `byChain[i]` carries — drop-in for the
// per-chain-render path.
//
// Tradeoffs: rectangles have square ends at IX vertices (no corner
// rounding), no curb stroke, no per-chain clip against asphaltRounded.
// Use this for the SELECTED chain during interactive drag, where the
// operator needs the bands to follow handles in real time. The full V2
// pass is still authoritative on release.
// D.5/D.6: blockCustoms is keyed by [blockKey][edgeOrd]. To resolve
// per-segOrd customs for this chain during drag preview, pass in the
// chain's index (so we can filter frontageEdges) and the full
// frontageEdges list (so we can map each segOrd-side → fe → customs
// entry). With empty blockCustoms or no matching fe, falls through
// to chain.measure[side].
export function buildChainBandsLive(chain, chainIdx, blockCustoms, frontageEdges, opts = {}) {
  const cw = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH
  const out = {
    asphaltRings: [], treelawnRings: [], sidewalkRings: [],
    // Outer-edge polylines for the live-drag overlay's colored edge
    // strokes (green = treelawn outer, white = sidewalk outer). Mirror
    // the per-chain emission's entry.{treelawn,sidewalk}Edges shape so
    // BlockGeometryV2Debug's polysToLineGeo can consume either source.
    treelawnEdges: [], sidewalkEdges: [],
    // Asphalt outer-edge polylines (perp ±hw from centerline) — added so
    // the live-drag overlay can render a curb-colored stroke at the
    // asphalt|curb boundary on the selected chain. While the curb mesh
    // is hidden during selection (it lies about the live asphalt extent),
    // this stroke gives the operator the precise asphalt boundary to
    // align against the aerial.
    asphaltEdges: [],
  }
  if (!chain || chain.disabled) return out
  const pts = chain.points
  const m = chain.measure
  if (!pts || pts.length < 2 || !m) return out
  // Build a per-segOrd-side lookup for THIS chain so we can resolve
  // each segment's customs without re-scanning frontageEdges per call.
  const feBySegSide = {}
  if (frontageEdges?.length && chainIdx != null) {
    for (const fe of frontageEdges) {
      if (fe.chainIdx !== chainIdx || !fe.segOrds?.length) continue
      for (const segOrd of fe.segOrds) {
        if (!feBySegSide[segOrd]) feBySegSide[segOrd] = {}
        feBySegSide[segOrd][fe.side] = fe
      }
    }
  }
  const customForSegSide = (segOrd, sideKey) => {
    const fe = feBySegSide[segOrd]?.[sideKey]
    if (!fe) return null
    return blockCustoms?.[fe.blockKey]?.[fe.edgeOrd] || null
  }
  const perps = computePerps(pts)
  // ixByChain (optional) lets the live-drag path use the same IX-by-
  // coord-match identity the full V2 pass uses. Falls through to stale
  // `intersections.ix` if caller doesn't supply it; the resulting
  // misalignment with the full-pass partition would show as drag-preview
  // bands snapping to different boundaries than the post-drag bake.
  const segments = naturalSegments(chain, opts.ixByChain?.get(chain))
  for (let segOrd = 0; segOrd < segments.length; segOrd++) {
    const seg = segments[segOrd]
    const segPts = pts.slice(seg.start, seg.end + 1)
    const segPerps = perps.slice(seg.start, seg.end + 1)
    if (segPts.length < 2) continue
    const effL = customForSegSide(segOrd, 'left')  || m.left  || {}
    const effR = customForSegSide(segOrd, 'right') || m.right || {}
    const hwL = effL.pavementHW || 0
    const hwR = effR.pavementHW || 0
    if (hwL > 0 || hwR > 0) {
      const leftEdge  = segPts.map((p, i) => [p[0] - segPerps[i][0] * hwL, p[1] - segPerps[i][1] * hwL])
      const rightEdge = segPts.map((p, i) => [p[0] + segPerps[i][0] * hwR, p[1] + segPerps[i][1] * hwR])
      const ring = [...leftEdge, ...rightEdge.slice().reverse()]
      out.asphaltRings.push(ringSignedArea2D(ring) >= 0 ? ring : ring.slice().reverse())
      // Emit per-side asphalt outer-edge polylines. Mirrors treelawnEdges/
      // sidewalkEdges shape (polyline per segment per side) so the
      // overlay's polysToLineGeo can consume them identically.
      if (hwL > 0) out.asphaltEdges.push(leftEdge)
      if (hwR > 0) out.asphaltEdges.push(rightEdge)
    }
    for (const sideKey of ['left', 'right']) {
      const sideSign = sideKey === 'left' ? -1 : +1
      const eff = sideKey === 'left' ? effL : effR
      if (!eff || eff.terminal !== 'sidewalk') continue
      const hw = eff.pavementHW || 0
      const tl = eff.treelawn || 0
      const sw = eff.sidewalk || 0
      if (tl > 0) {
        const ring = chainStripBand(segPts, segPerps, sideSign, hw + cw, hw + cw + tl)
        if (ring) out.treelawnRings.push(ring)
        out.treelawnEdges.push(
          segPts.map((p, i) => [p[0] + segPerps[i][0] * sideSign * (hw + cw + tl), p[1] + segPerps[i][1] * sideSign * (hw + cw + tl)])
        )
      }
      if (sw > 0) {
        const ring = chainStripBand(segPts, segPerps, sideSign, hw + cw + tl, hw + cw + tl + sw)
        if (ring) out.sidewalkRings.push(ring)
        out.sidewalkEdges.push(
          segPts.map((p, i) => [p[0] + segPerps[i][0] * sideSign * (hw + cw + tl + sw), p[1] + segPerps[i][1] * sideSign * (hw + cw + tl + sw)])
        )
      }
    }
  }
  return out
}
