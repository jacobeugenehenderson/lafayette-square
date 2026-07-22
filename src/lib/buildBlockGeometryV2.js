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
import { CURB_WIDTH, innerEdgeMeasure } from '../cartograph/streetProfiles.js'
import { readFeCustom } from './feCustomKey.js'
import { smoothChain } from './smoothCenterline.js'

const SCALE = 1000
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
export function pickLuFromHash(h) {
  const r = (h % 100 + 100) % 100
  for (const [name, c] of LU_CUM) { if (r < c) return name }
  return 'residential'
}
// xmur3-style deterministic 32-bit hash from a key string. Stable across
// runs; same key → same bucket.
export function hashKey(s) {
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
export function blockKeyFromRing(ring) {
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

// Polygon-edge-Q polyline depth. Each leg's facing-side offset
// polyline walks `CORNER_Q_POLY_DEPTH` chain.points vertices outward
// from the IX V. At LS scale the asphalt-union corner vertex is on
// segment 0 (rectilinear) or segment 1–2 (curved chains within ~16m
// of the IX); 6 gives generous slack. Larger depths add polyline-pair
// work without finding crossings polyline-cross would miss at 6.
const CORNER_Q_POLY_DEPTH = 6

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
const R_CLASS_DEFAULT = 4.5  // residential×residential AASHTO baseline

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

// Build one leg's "facing-side" offset polyline — the polyline that
// chainPavementRing / emitChain emits as that side's outer edge of
// the asphalt rectangle. Walks chain.points from `ixIdx` outward in
// `dir` for up to CORNER_Q_POLY_DEPTH vertices, perpendicular-offset
// at each vertex by `sideSign · hw · perps[k]`. perps is the chain's
// full bisector-perp array (same construction as computePerps used by
// emitChain) so the polyline tracks the actual asphalt-union vertex
// at the IX corner — not the far-field tangent extrapolation.
//
// `sideSign`: +1 for the leg's "right curb" side (offset toward
// +perp-LEFT, matching tangent-Q's `V + outerR · P` convention at
// `cornersAtIx`'s corner-pair math); -1 for the leg's "left curb"
// side. The corner-pair (A CCW-adjacent to B) reads polyA at +1 and
// polyB at -1 — the wedge between them lives between A's +perp side
// and B's -perp side.
function buildLegSidePolyline(chain, ixIdx, dir, sideSign, hw, depth = CORNER_Q_POLY_DEPTH) {
  if (hw <= 0) return null
  const pts = chain?.points
  if (!pts || pts.length < 2) return null
  if (!Number.isInteger(ixIdx) || ixIdx < 0 || ixIdx >= pts.length) return null
  const perps = computePerps(pts)
  // `perps` is chain-canonical (perp-LEFT of the chain's natural
  // forward direction at each vertex). The leg's tangent T points OUT
  // from V, so for dir=-1 legs T is anti-parallel to chain-forward —
  // perp-LEFT-of-T flips sign relative to chain-canonical perp. The
  // sideSign convention in `cornersAtIx` is keyed to perp-LEFT-of-T
  // (the prior tangent-Q math used `V + outerR · [-T_y, T_x]`), so
  // sign-flip `perps` for dir=-1 legs to align the polyline with the
  // same physical side. Diagnosed 2026-05-16 via "every other corner"
  // pattern on rectilinear LS IXs; verified by `dot(perps[V],
  // perp-LEFT-of-T) === -1` for every dir=-1 leg.
  const perpSign = dir === -1 ? -1 : +1
  const poly = []
  let k = ixIdx
  let steps = 0
  while (k >= 0 && k < pts.length && steps <= depth) {
    poly.push([
      pts[k][0] + sideSign * perpSign * perps[k][0] * hw,
      pts[k][1] + sideSign * perpSign * perps[k][1] * hw,
    ])
    k += dir
    steps++
  }
  return poly.length >= 2 ? poly : null
}

// First segment-segment intersection between two polylines, scanning
// in polyline order from the IX-adjacent end outward. Returns the
// crossing point closest to V (= the start of both polylines) or
// null if none within the polylines' extent. Standard 2D
// segment-segment with epsilon slop for vertex-coincidence cases at
// the polyline starts (both polylines begin at the offset of V,
// which can produce a near-coincident start segment).
function polylineSegSegCross(a1, a2, b1, b2) {
  const dax = a2[0] - a1[0], daz = a2[1] - a1[1]
  const dbx = b2[0] - b1[0], dbz = b2[1] - b1[1]
  const det = dax * (-dbz) - daz * (-dbx)
  if (Math.abs(det) < 1e-9) return null
  const dx = b1[0] - a1[0], dz = b1[1] - a1[1]
  const s = (dx * (-dbz) - dz * (-dbx)) / det
  const t = (dx * (-daz) - dz * (-dax)) / det
  const SLOP = 1e-3
  if (s < -SLOP || s > 1 + SLOP) return null
  if (t < -SLOP || t > 1 + SLOP) return null
  return [a1[0] + s * dax, a1[1] + s * daz]
}
// Returns { point, tangentA, tangentB } or null. Local tangents are the
// unit direction of the hit segments in each polyline's natural walk
// (both polylines walk away from V), so tangentA/tangentB point OUT
// from V along each leg at the corner — the local-polyline tangent at
// Vc, not the far-field tangent. Bezier consumes these for handle
// direction; buildCornerPadQuad consumes them for tA/tB anchoring.
function polylineCross(polyA, polyB) {
  for (let i = 0; i < polyA.length - 1; i++) {
    for (let j = 0; j < polyB.length - 1; j++) {
      const Q = polylineSegSegCross(polyA[i], polyA[i + 1], polyB[j], polyB[j + 1])
      if (Q) {
        const tA = unit([polyA[i + 1][0] - polyA[i][0], polyA[i + 1][1] - polyA[i][1]])
        const tB = unit([polyB[j + 1][0] - polyB[j][0], polyB[j + 1][1] - polyB[j][1]])
        return { point: Q, tangentA: tA, tangentB: tB }
      }
    }
  }
  return null
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
      // Local tangent at V along this leg = direction of the first
      // chain.points segment from V outward in `dir`. Under the Bezier
      // model the corner record's T_A / T_B come from polylineCross's
      // local segment tangents at the hit point Vc (not far-field);
      // here we only need a tangent direction for CCW leg sorting +
      // theta calculation at V, and the local-at-V direction is the
      // doctrine-correct value (a curved chain's two legs make their
      // real intersection angle here, not 16m down the road).
      const ni = ixIdx + dir
      if (ni < 0 || ni >= pts.length) return null
      const dx = pts[ni][0] - V[0], dz = pts[ni][1] - V[1]
      const L = Math.hypot(dx, dz)
      if (L < 1e-6) return null
      const isBack = dir === -1
      // Customs lookup: the leg's left/right physical sides each belong to
      // one block-edge (one frontage edge per side per segOrd). For each
      // side, find the fe in feLookup, then resolve its chain-anchored
      // custom (feCustomKey: skelId/side/segOrd) or fall back to
      // chain.measure[side]. Side orientation is in chain coordinates; the
      // leg-side flip for back legs happens below. (Ribbon-customs read —
      // NOT the corner-override maps; re-keyed in W1 so corner depths follow
      // the same stable key as the ribbon bands.)
      const segOrd = segmentForLeg(dir)
      const feL = (chainIdx != null && segOrd != null)
        ? feLookup?.[chainIdx]?.[segOrd]?.left : null
      const feR = (chainIdx != null && segOrd != null)
        ? feLookup?.[chainIdx]?.[segOrd]?.right : null
      const customL = readFeCustom(blockCustoms, feL)
      const customR = readFeCustom(blockCustoms, feR)
      const effL = customL || m.left
      const effR = customR || m.right
      // When walking BACK from V (dir=-1), the chain's "left" becomes
      // our right (we're facing the opposite direction along the chain).
      const left  = isBack ? effR : effL
      const right = isBack ? effL : effR
      // C1 flanking-fes stamp: persist the per-side fes that buildLeg
      // already resolved for customs lookup, with the same isBack flip.
      // Corner-build below picks A.rightFe + B.leftFe — the two fes
      // flanking the wedge between A and B. Read at C4 emit time via
      // arcMeta[k].corner.flankingFes (corner record already exposed
      // per-Bezier-sample by applyRoundCornersToRing). null when the
      // probe didn't find an fe (parcel-only edge, segOrd unresolved);
      // bakeFeScalars mirrors the customs-lookup precedence (fe?.measure
      // ?? chain.measure[side]) via the legRefs stamp below — chainSide
      // tracked separately because it remains well-defined even when the
      // fe lookup misses (STUB-N case: one side has a leg but no block-
      // polygon adjacency → no fe but chain.measure[side] still valid).
      const leftFe  = isBack ? feR : feL
      const rightFe = isBack ? feL : feR
      const leftFeChainSide  = isBack ? 'right' : 'left'
      const rightFeChainSide = isBack ? 'left'  : 'right'
      return {
        T: [dx / L, dz / L],
        outerL: left?.pavementHW || 0,
        outerR: right?.pavementHW || 0,
        leftDepth:  depthForSide(left),
        rightDepth: depthForSide(right),
        leftFe,
        rightFe,
        leftFeChainSide,
        rightFeChainSide,
        chainIdx,
        legKey: `${skel}:${dir === -1 ? 'b' : 'f'}`,
        skel,
        name: chain.name || null,
        // Used by polygon-edge-Q (`buildLegSidePolyline`) to build the
        // leg's facing-side offset polyline from the chain's actual
        // points + bisector-perps. T (above) is the local at-V tangent
        // (first chain segment from V outward) — consumed for CCW leg
        // sorting + θ at V. The corner record's T_A / T_B are then
        // overwritten with LOCAL tangents at the Vc hit point from
        // polylineCross.
        chain,
        ixIdx,
        dir,
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

    // Polygon-edge-Q: corner = first crossing of A's facing-side
    // offset polyline with B's facing-side offset polyline. The
    // polylines follow chain.points from V outward, perpendicular-
    // offset at each vertex via computePerps — same construction
    // emitChain uses for its per-segment asphalt rectangles. So the
    // crossing lands on the actual asphaltSharp union vertex at the
    // IX corner, not on the far-field tangent extrapolation. This is
    // doctrine-correct per FEATURES.md "the ribbon doctrine" line 89
    // (corner records computed off polygon edges, not extended chain
    // tangents).
    //
    // Side convention matches today's tangent-Q (preserved on this
    // line above the rewrite): A.outerR with `+perps` sign, B.outerL
    // with `-perps` sign. P_A = perp-LEFT of T_A = [-T_y, T_x]; the
    // rectangle's "right curb" is at +perps · outerR. With CCW-sorted
    // legs, the wedge between A and B sits on A's +perps side and
    // B's -perps side.
    //
    // On no-intersection (parallel polylines that never cross within
    // CORNER_Q_POLY_DEPTH segments): SKIP this corner record. This
    // occurs at divided-pair endpoint IXs (the median between two
    // paired carriageways converging at one IX) where there is no
    // real block corner — the median strip is its own block polygon
    // and doesn't need a corner plug between the two pair legs.
    // Falling back to tangent-Q here would reintroduce the
    // near-infinity degenerate Q that retired Phase A.5 was patching.
    // The theta<5°/>355° filter above handles the most parallel
    // cases; this skip handles wider parallel cases that pass the
    // angular gate.
    const polyA = buildLegSidePolyline(A.chain, A.ixIdx, A.dir, +1, A.outerR)
    const polyB = buildLegSidePolyline(B.chain, B.ixIdx, B.dir, -1, B.outerL)
    if (!polyA || !polyB) continue
    const hit = polylineCross(polyA, polyB)
    if (!hit) continue
    const Vc = hit.point
    // Local-polyline tangents at Vc (out from V along each leg). Override
    // the at-V tangents A.T / B.T for corner-record use — buildCornerPadQuad
    // and Bezier corners both want the tangent at the corner, not at V.
    const localT_A = hit.tangentA
    const localT_B = hit.tangentB

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
      // T_A / T_B are LOCAL-polyline tangents at Vc (not the at-V
      // tangents A.T / B.T). They point OUT from V along each leg at
      // the corner — the doctrine-correct tangent direction for
      // Bezier handle alignment + pad quad geometry on curved chains.
      // tA / tB are computed at corner-emission time in
      // applyRoundCornersToRing once the per-corner R is resolved
      // (since they're R-dependent via insetA = R/tan(θ/2)). The
      // corner record carries them post-emission for buildCornerPadQuad.
      T_A: localT_A, T_B: localT_B,
      outerR_A: A.outerR, outerL_B: B.outerL,
      rightDepth_A: A.rightDepth, leftDepth_B: B.leftDepth,
      // C1: the two fes flanking this corner's wedge. A's right side
      // and B's left side face the corner (matches d_A / d_B above).
      // Either may be null if the leg's segOrd didn't resolve an fe
      // (parcel-only edge etc.) — bakeFeScalars falls back via legRefs.
      flankingFes: { A: A.rightFe || null, B: B.leftFe || null },
      // C2: canonical (chainIdx, chain-side) per leg facing this corner,
      // well-defined whether or not the fe lookup resolved. The chain
      // side is what `chain.measure[side]` is keyed by — distinct from
      // the leg's facing-side because of the isBack flip handled in
      // buildLeg. bakeFeScalars uses these for the customs-precedence
      // fallback when flankingFes are null.
      legRefs: {
        A: { chainIdx: A.chainIdx, side: A.rightFeChainSide },
        B: { chainIdx: B.chainIdx, side: B.leftFeChainSide  },
      },
    })
  }
  return corners
}

// Phase 2 — buildCornerPadQuad retired. The constructed concrete corner
// pad (the tA-tB-anchored parallelogram clipped against blockRounded) is
// replaced structurally by the three-regime arc emitter in
// buildFrontageBandsV2 below. The arc emitter walks each block's rounded
// silhouette and emits sidewalk-material wedges (ramp / asym-plug) at
// every block corner directly from the band machinery; nothing is
// "constructed and then clipped" anymore. cornerAsphaltPlugs is likewise
// retired: blockRounded is now the rounded primitive, asphaltRounded
// derives as `stencil − blockRounded`, and the rounded asphalt mouth
// emerges from that subtraction without a residual fillet. See NOTES.md
// "Phase 2 shipped" for full doctrine.

// Evaluate cubic Bezier at parameter t ∈ [0,1].

// Cubic-Bezier corner replacement, doctrine-aligned. Replaces polygon
// vertex `cur` with a smooth Bezier arc whose endpoints (tA, tB) sit
// inset insetA / insetB along the local tangents (tangentA / tangentB)
// at the corner. Handles are aligned with the tangents and sized by
// handleLen = (4/3)·R·tan(θ/4) — the canonical cubic-Bezier circular
// approximation: error ≈ 0.027% at θ=90°, growing smoothly elsewhere
// (well under 0.1m for residential R=4.5m).
//
// `tangentA` points OUT from V along leg A; `tangentB` points OUT from
// V along leg B. The polygon walks CCW around the asphalt void, so it
// ARRIVES at cur along (-tangentA) and DEPARTS along (+tangentB) — sign
// convention matches a right-turn (block-convex / asphalt-concave)
// corner. tA = cur + insetA·tangentA, tB = cur + insetB·tangentB. Both
// handles point INTO the corner (toward V along their respective legs):
// P1 = tA - handleLen·tangentA, P2 = tB - handleLen·tangentB.
//
// At clean rectilinear IXs with R = R_class and θ = 90°, the sampled
// polyline is visually indistinguishable from a circular arc of radius
// R at the same tangent points (parity verified to < 0.001 m max
// vertex deviation; see commit body).
//
// Curved-chain handling: tangentA / tangentB are LOCAL-polyline
// tangents at the corner (from polylineCross's hit segments), so the
// Bezier follows leg-direction at the corner regardless of how many
// polygon vertices live between tA and tB. The intermediate vertices
// are overwritten by the sampled Bezier curve — no 49% inset clamp,
// no polygon-density coupling.

// Phase 1 (multi-vertex Bezier consumption): walk CCW around the
// asphalt void's outer ring, identify CONSUME-SPANS around each
// corner-matched vertex, then emit Bezier output replacing the entire
// span. The pre-Phase-1 walker replaced only the single TOL=0.5
// matched vertex per corner, leaving adjacent cluster vertices around
// the Bezier insertion as angular kinks immediately before tA and
// after tB. On curved chains (Mississippi class) the asphalt-union
// boundary carries 5–10 cluster vertices within 2m of the corner
// record's Q point — the result was a smooth Bezier surrounded by
// faceted polygon facets. Phase A.7's polygon-density simplification
// patched the symptom at the polygon emitter; this walker patches it
// structurally where it belongs — at the consumer. A.7's helpers
// retired with the Phase B Bezier ship; this rewrite is the matching
// structural fix on the ring-walker side.
//
// Two-pass:
//   Pass 1 — for each corner-matched ring vertex (block-convex turn,
//   R > 0.05), walk OUTWARD in both directions accumulating arc-length
//   distance until the accumulated walk exceeds the inset (R/tan(θ/2))
//   or the walk would consume another corner-matched vertex. Record
//   span = { start, end, cornerIdx } and mark consumed[] for those
//   indices.
//   Pass 2 — rotate to a non-consumed starting index so no span wraps
//   across the iteration boundary, then emit literals for non-consumed
//   indices and Bezier samples once per span when first entered.
//
// Boundary continuity: ring[(start-1) mod n] (last unconsumed before
// the span) joins bezier's first sample tA; ring[(end+1) mod n] (first
// unconsumed after) joins tB. tA / tB are at corner.point + inset *
// corner.T_{A,B}; they may not coincide with any pre-existing ring
// vertex — that's expected. The cluster vertices ring[start..end]
// (inclusive) are dropped from the output; the Bezier subsumes them.

// Block = stencil − asphalt. Each input is an array of rings (from
// Clipper-union output for asphalt, single-ring array for stencil).
export function differenceRings(subjectRings, clipRings) {
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

// ── [DEAD-END FOLD] The tips a block ring can fold around ────────────────────
// A degree-1 chain endpoint: a coordinate carried by exactly ONE street vertex
// in the whole frame (a shared node carries ≥2). Mirrors the notion tileGround's
// chainEndpointKeys/detectTileCaps use for the same tips; kept local because
// tileGround imports FROM this module (importing back would cycle).
function deadEndTips(streets) {
  const key = (p) => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100)
  const count = new Map()
  for (const s of streets || []) for (const p of (s?.points || [])) {
    const k = key(p); count.set(k, (count.get(k) || 0) + 1)
  }
  const tips = []
  for (const s of streets || []) {
    const pts = s?.points
    if (!pts || pts.length < 2) continue
    for (const p of [pts[0], pts[pts.length - 1]]) if ((count.get(key(p)) || 0) === 1) tips.push(p)
  }
  return tips
}

// The ring span that WRAPS a dead-end tip — the fold. The block ring runs up one
// side of the finger, around the cap at the asphalt half-width, and back down,
// so the wrapping vertices all sit at that one radius while the leg vertices are
// far away. Grow outward from the nearest vertex, always taking the nearer of
// the two neighbours, and stop when both lie beyond any plausible cap radius;
// then accept only if the span actually TURNS around the tip (~180° of swept
// angle). The TURN is the signal — proximity alone is not enough, and there is
// no usable radius BAND to grow by, because a cap's two shoulders need not sit
// at the same radius at all: a road may be authored with different pavement
// half-widths per side (Nicholson Place is left 2.50 m, right 6.70 m), which is
// the same "the coupler's two ends can differ in width" fact the FILL has to
// honour. An earlier band-ratio rule missed exactly those.
// Returns [{ lo, hi }] — the two SHOULDER vertex indices, in traversal order.
const CAP_FOLD_MAX_R = 40        // m — beyond this the ring isn't capping anything
const CAP_FOLD_JUMP = 3          // × the span's own radius — a leg vertex is a big jump out
const CAP_FOLD_JUMP_MIN = 5      // m — but always allow at least this much growth
const CAP_FOLD_MIN_TURN = 140 * Math.PI / 180
const CAP_FOLD_MAX_TURN = 220 * Math.PI / 180
function capFoldSlices(ring, tips) {
  const N = ring.length
  const out = []
  if (N < 4) return out
  for (const T of tips) {
    const dAt = (i) => Math.hypot(ring[i][0] - T[0], ring[i][1] - T[1])
    let bi = -1, bd = Infinity
    for (let i = 0; i < N; i++) { const d = dAt(i); if (d < bd) { bd = d; bi = i } }
    if (bi < 0 || bd > CAP_FOLD_MAX_R || bd < 1e-6) continue
    // Grow while the next vertex is still ROUND THE CAP. The stop is a radius
    // JUMP, not a fixed band: the cap's vertices sit at whatever half-widths the
    // road was authored with (they need not match side to side), while the next
    // vertex down a leg is the mouth corner — a whole leg-length away.
    let lo = bi, hi = bi, spanMax = bd
    for (let guard = 0; guard < N; guard++) {
      const pi = (lo - 1 + N) % N, ni = (hi + 1) % N
      if (pi === hi || ni === lo) break
      const okAt = (i) => { const d = dAt(i); return d <= CAP_FOLD_MAX_R && d <= Math.max(spanMax * CAP_FOLD_JUMP, spanMax + CAP_FOLD_JUMP_MIN) }
      const cp = okAt(pi), cn = okAt(ni)
      if (!cp && !cn) break
      const takePrev = cp && (!cn || dAt(pi) <= dAt(ni))
      const cand = takePrev ? pi : ni
      spanMax = Math.max(spanMax, dAt(cand))
      if (takePrev) lo = cand; else hi = cand
    }
    if (lo === hi) continue
    // SIGNED swept angle about the tip — a fold sweeps ~180° consistently in one
    // direction. Using the ABSOLUTE sum would let a block edge that merely
    // meanders past a dead end accumulate its way to 180° and be mistaken for a
    // wrap; the signed sum stays near zero for those.
    const u = (i) => { const dx = ring[i][0] - T[0], dz = ring[i][1] - T[1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L] }
    let turn = 0
    for (let i = lo; i !== hi; i = (i + 1) % N) {
      const a = u(i), b = u((i + 1) % N)
      turn += Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])
    }
    turn = Math.abs(turn)
    if (turn < CAP_FOLD_MIN_TURN || turn > CAP_FOLD_MAX_TURN) continue
    out.push({ lo, hi })
  }
  return out
}

function buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain) {
  if (!streets?.length || !blockSharp?.length) return []
  const out = []
  // [DEAD-END FOLD → END COUPLER] A cul-de-sac's frontage is NOT one edge — it is
  // one fe FOLDED on itself (up one side of the finger, around the bulb, back
  // down the other). The identity-driven corner test below cannot see the fold,
  // because the owning chain never changes at the tip; so both sides came out as
  // a SINGLE fe under a SINGLE `side` token, and the returning leg had no customs
  // slot at all — 46 of LS's 50 caps, the root of "a dead-end leg flip renders
  // Δ=0.0". So: chop the fold at its two SHOULDERS. Each leg becomes its own fe
  // with its own side, and the arc between them is NOT emitted as a leg frontage
  // — it is the CAP, an end COUPLER that carries its own synthetic slot
  // (makeCapFe / CAP_SEGORD, kept out of frontageEdges by the same doctrine).
  // The two shoulders are corners in the LANE-SWITCH sense, not the bending one:
  // the arrangement may change across them, which is exactly where the cap↔leg
  // dip-in fires (HANDOFF-dead-end-cap-flip, the governing rule).
  const tips = deadEndTips(streets)
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

  for (let blockRingIdx = 0; blockRingIdx < blockSharp.length; blockRingIdx++) {
    const ring = blockSharp[blockRingIdx]
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
    // [DEAD-END FOLD] Cut the ribbon's fold: a shoulder is a corner in the
    // lane-switch sense, so each leg of the finger becomes its own fe (its own
    // side), and the slice BETWEEN the shoulders — the cap — is skipped below.
    const folds = capFoldSlices(ring, tips)
    const capSliceFrom = new Set()
    if (folds.length) {
      for (const f of folds) { cornerIdxs.push(f.lo, f.hi); capSliceFrom.add(f.lo) }
      cornerIdxs.splice(0, cornerIdxs.length, ...[...new Set(cornerIdxs)].sort((a, b) => a - b))
    }
    if (cornerIdxs.length < 3) continue  // degenerate block

    // For each block-edge between two consecutive corners, slice out the
    // block-edge polyline (corner → ... → next corner), find the
    // adjacent chain, emit a frontage record.
    for (let k = 0; k < cornerIdxs.length; k++) {
      const c1 = cornerIdxs[k]
      const c2 = cornerIdxs[(k + 1) % cornerIdxs.length]
      if (capSliceFrom.has(c1)) continue   // the cap arc — an end COUPLER, not a leg frontage
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
      //
      // chainSkelId/chainName: the STABLE chain identity, stamped HERE so the
      // chain-anchored customs key (feCustomKey) resolves identically on the
      // bake path and the Designer path. This is the single source of the
      // stamp — the Designer's enrichment defers to this same formula
      // (streets[idx].skelId || .name), it does not recompute it differently.
      // (HANDOFF-wall-W1-identity; the bake builds fes without the Designer,
      // so without this stamp bake-side customs resolution would silently miss.)
      const adjStreet = streets[adj.chainIdx]
      out.push({ points, blockKey, blockRingIdx, edgeOrd: k,
                 chainIdx: adj.chainIdx, side: adj.side, ringCcw: ccw,
                 chainSkelId: adjStreet?.skelId || adjStreet?.name || null,
                 chainName: adjStreet?.name || null,
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

// C2 — bake-time scalar resolution. Single sanctioned site for the
// customs ?? chain.measure precedence rule, so emission code never
// reads `streets[*].measure` (wall doctrine, RIBBONS §1). Three outputs:
//
//   fe.measure (per fe)              — readFeCustom(blockCustoms, fe)
//                                      [chain-anchored (skelId,side,segOrd)]
//                                      ?? streets[chainIdx].measure[side].
//   blockScalars[blockKey].W         — per-block ribbon outer extent =
//                                      cw + max-over-fes-on-block of
//                                      depthForSide(fe.measure). Blocks
//                                      with zero sidewalk-terminal fes
//                                      get W = 0; blocks with NO fes
//                                      get no entry (emitter checks for
//                                      undefined and no-ops).
//   corner.swCornerDepth (per corner) — cw + max(rightDepth_A, leftDepth_B).
//                                      d_A / d_B are already customs-
//                                      aware (depthForSide of A.right /
//                                      B.left, which buildLeg resolved
//                                      via customL/customR || m.left/m.right),
//                                      so swCornerDepth inherits the
//                                      customs-precedence transitively.
//                                      The null-flankingFe path (STUB-N
//                                      class topology) is also handled
//                                      transitively — when buildLeg's fe
//                                      lookup misses, customL/customR
//                                      fall through to m.left/m.right,
//                                      and depthForSide of that is what
//                                      lands in rightDepth_A/leftDepth_B.
//
// Sanctioned streets reads inside this function: fe.measure fallback
// (line below). bakeFeScalars runs ONCE at construction; emission code
// retired in C5 (silhouetteStraightEmitter + buildFrontageBandsV2)
// keeps its pre-wall signatures until deleted. The wall lands
// structurally in C4's new emitter via fe.measure + corner.swCornerDepth
// + blockScalars consumption.
function bakeFeScalars(streets, frontageEdges, allCorners, blockCustoms, curbWidth) {
  const cw = curbWidth
  // Step 1: resolve fe.measure once per fe (customs precedence).
  for (const fe of frontageEdges) {
    if (fe.chainIdx == null) { fe.measure = null; continue }
    const customs = readFeCustom(blockCustoms, fe)
    fe.measure = customs || streets[fe.chainIdx]?.measure?.[fe.side] || null
  }
  // Step 2: per-block W. Group fes by blockKey, take cw + max stack.
  const blockScalars = new Map()
  const fesByBlock = new Map()
  for (const fe of frontageEdges) {
    if (!fe.blockKey) continue
    let arr = fesByBlock.get(fe.blockKey)
    if (!arr) { arr = []; fesByBlock.set(fe.blockKey, arr) }
    arr.push(fe)
  }
  for (const [blockKey, fes] of fesByBlock) {
    let maxStack = 0
    for (const fe of fes) {
      const d = depthForSide(fe.measure)
      if (d > maxStack) maxStack = d
    }
    blockScalars.set(blockKey, { W: maxStack > 0 ? cw + maxStack : 0 })
  }
  // Step 3: per-corner swCornerDepth from existing rightDepth_A / leftDepth_B
  // (which are already customs-aware via buildLeg's m.left/m.right fallback).
  for (const corner of allCorners) {
    const dA = corner.rightDepth_A || 0
    const dB = corner.leftDepth_B  || 0
    const m = Math.max(dA, dB)
    corner.swCornerDepth = m > 0 ? cw + m : 0
  }
  return { blockScalars }
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

// Phase 2 — Path-B regime emitter. Walks each blockRounded ring end-
// to-end (with arcMeta sidecar from applyRoundCornersToRing) and emits
// treelawn / sidewalk bands per span:
//
//   STRAIGHT spans (arcMeta=null run) → concentric tl + sw rings.
//   ARC spans (consecutive vertices with same corner identity) →
//     regime-classified per-arc emission:
//       SYMMETRIC-NO-RAMP  (both legs sidewalk-only):
//         single sw band [0, cw+sw_avg] across the arc.
//       SYMMETRIC-WITH-RAMP (both legs tl+sw, depths ≈ match):
//         outside ramp window — concentric tl + sw bands.
//         inside ramp window — single sidewalk-material wedge spanning
//           [0, cw+tl_avg+sw_avg] (pedestrians cross the would-be
//           treelawn at the ADA ramp midpoint).
//       ASYMMETRIC (legs differ in depth by >1m or ratio <0.7):
//         single sidewalk-material plug across whole arc with sharp
//         angular step at arc midpoint (frac=0.5).
//
// Bands extend to the asphalt boundary (no cw inset on the outer edge).
// The normalized curb stroke (computed AFTER this returns, as
// `dilateRings(asphaltRounded, cw) − asphaltRounded`) paints over the
// inner cw of every band — visible treelawn/sidewalk widths equal the
// operator's authored tl/sw because the band geometry abuts the asphalt
// and the curb covers the would-be-tl portion that overlaps the curb.
//
// Phase 2 constants:
//   ASYM_EPS_M   = 1.0   — abs leg-depth difference threshold
//   ASYM_RATIO   = 0.7   — min(d)/max(d) threshold
//   RAMP_MAX_M   = 2.0   — arc-length cap for ramp wedge
//   RAMP_FRAC    = 0.4   — fraction of arc consumable by ramp
//   RAMP_MIN_M   = 0.5   — skip ramp emission below this floor
//   STEP_FRAC    = 0.5   — arc-position of asymmetric step


// SUB-A: retired by silhouetteStraightEmitter; remove in sub-C.
// Pre-Phase-2 per-sharp-fe straight-span band emission. Kept in place
// as dead code through sub-A so the sub-A diff stays bounded; sub-C
// deletes the function definition along with the H1 clip (which is
// structurally unnecessary for silhouette-walked bands since their
// outer edges already follow blockRounded).

// Stage 12 sub-A — silhouette-walking STRAIGHT-span band emitter.
// Replaces buildFrontageBands's per-sharp-fe leg emission with a walk
// over blockRounded's straight-span runs. Arc-span emission remains on
// buildFrontageBandsV2's per-corner-pad code path (sub-B retires that).
// Per-vertex perp offset is geometrically exact for straight vertices,
// so no Clipper-precision selfints (the failure mode that sent Phase 2's
// blockRounded-walking spine back to per-fe emission).
//
// Per Stage 11a.1 doctrine: probe + customs + chain.measure resolves the
// run's authored measure; if !isSidewalk || (tl<=0 && sw<=0) (authoredZero)
// or probe-null (partition artifact), emit nothing for the run. Arc-span
// flanking inheritance is sub-B's territory; sub-A only emits where the
// straight-run itself probes to authored sidewalk.

// Stage 11a: ring-walk for arc-span flanking-meta resolution.
// Walks PAST partition-artifact straights (skip:true — degenerate <2-
// vertex spans + adj=null probe failures) and PAST arc spans, but STOPS
// at authored-zero straights (authoredZero:true — terminal!=sidewalk or
// tl<=0 && sw<=0). That distinction is Stage 11a.1: a flank where the
// operator authored "no ped zone here" is real authored intent and must
// contribute its zero depths to the corner, not be walked past in favor
// of some distant chain's authoring. Doctrinal: walk past structural
// gaps in the ring partition, stop at operator-intent zero.


// T4 (2026-07-15): emitOneBlockRingBands — the V1 keystone ring-band emitter —
// deleted. Its only callers (emitBlockRingBands, buildChainBandsLive) went with
// the figure-ground geometry. The tile model strokes bands via tileGround.js.

// Phase 2.1 — per-corner outer-face emission. The regime emitter's
// arc-span branch handles INWARD geometry (bands + ramp + plug); this
// pass handles OUTWARD geometry — the fillet area between the rounded
// asphalt silhouette and the per-chain rectangles' square ends at each
// IX. Path (b) of Phase 2.1 brief: compute the residual globally
// (`asphaltRounded − union(per-chain asphalt)`), then attribute each
// output polygon to its nearest corner record by centroid match.
// Attributed rings are pushed onto the matching frontageBand entry's
// `asphaltRings` field; orphans (no corner within FILLET_ATTRIB_MAX_M
// or no matching frontageBand entry for the corner) accumulate in
// `cornerOrphanAsphalt` and render as asphalt anyway.



// Polygon offset (Minkowski sum with a disc of radius `delta`). Positive
// delta = outward, negative = inward (Clipper handles both natively via
// signed delta). Default `join: 'miter'` preserves vertex structure so
// inputs that are already smooth polyline arcs (asphaltRounded) stay
// smooth — the clipping rounding lives in the input geometry, not in
// the offset op. The C4 ring-band emitter needs inward + jtRound to
// inset `blockRounded` for the sidewalk-inner / ribbon-outer polylines
// while keeping the inset corner radii honest. Existing call site
// (curb stroke, dilateRings(asphaltRounded, cw)) passes positive delta
// and no opts → byte-identical pre/post-C3.

// Intersection of subject rings with clip rings.
export function intersectRings(subjectRings, clipRings) {
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
    blockLandUse = null,
    smooth = 0,
    useRingBandEmitter = false } = opts  // C4 flag — toy on, LS off until C5
  // Apply inner-edge anchor transform to all chains up front: every
  // downstream consumer (street.measure, segmentMeasures via
  // measureForSegment) sees the post-transform measure where inboard
  // pavement+curb+ped are zero on inner-edge chains. Single source of
  // truth — keeps Designer and bake in lockstep without auditing every
  // street.measure read site.
  // Phase 2 — interpolating Catmull-Rom smoothing of every chain's
  // mid-vertices, applied here at ingest so ALL downstream consumers
  // (segmentation, perp-offset stroke, frontage walk, corner rounding)
  // see the same smoothed polyline. Both the live render
  // (BlockGeometryV2Debug) and the bake (bake-ground) call this function
  // with the same persisted `smooth`, so the asphalt strokes identically
  // in Survey and in the bake — WYSIWYG by construction. subdividePolyline
  // is *interpolating*: it preserves every authored vertex (including the
  // shared chain-end vertices at junctions), so junction corners stay sharp
  // and keep their authored R via applyRoundCornersToRing; only the facets
  // between authored vertices round. Per-street `smooth` (centerlineData)
  // can raise the global for a specific chain. resolveIxRef's nearest-vertex
  // fallback tolerates the index shift the densification introduces — this
  // is exactly what the live `smooth` slider already relied on.
  // Centerline smoothing (centripetal Catmull-Rom, corner-preserving) moved
  // to ../lib/smoothCenterline.js so the figure-ground path, tileGround, and
  // the bake all smooth identically. Imported as `smoothChain` at top.
  const streets = (ribbons?.streets || []).map(s => {
    if (!s) return s
    const eff = Math.max(smooth || 0, s.smooth || 0)
    const smoothed = eff > 0 ? smoothChain(s.points, eff) : null
    const isInner = s.anchor === 'inner-edge' && s.innerSign
    if (!smoothed && !isInner) return s
    const out = { ...s }
    if (smoothed) out.points = smoothed
    if (isInner) {
      if (s.measure) out.measure = innerEdgeMeasure(s.measure, s.innerSign)
      if (s.segmentMeasures) {
        out.segmentMeasures = {}
        for (const k of Object.keys(s.segmentMeasures)) {
          out.segmentMeasures[k] = innerEdgeMeasure(s.segmentMeasures[k], s.innerSign)
        }
      }
    }
    return out
  })
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
        // Phase A.7 (Douglas-Peucker simplification of asphalt-rect
        // edges) retired with the Bezier corner rewrite: Bezier samples
        // overwrite all polygon vertices between tA and tB regardless
        // of density, so the dense-corner→clamp-fires failure mode A.7
        // patched no longer exists. Raw per-vertex offset edges feed
        // the union directly.
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
  // Block-edge frontages (sharp-ring walk). The Phase 2 regime emitter
  // consumes these sharp fes for edgeOrd/blockCustoms inheritance via a
  // (blockKey, chainIdx, side) lookup; cornersAtIx consumes them
  // (transitively via feLookup) for per-segment customs resolution.
  // Spatial index drops the adjacency probe from O(streets × segs) to
  // O(few candidates per probe cell).
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
      if (readFeCustom(blockCustoms, fe)) chainsWithCustoms.add(fe.chainIdx)
    }
  }
  if (chainsWithCustoms.size > 0) {
    const pass1Lookup = feLookup
    const customsResolver = (chainIdx, segOrd, sideKey) => {
      const fe = pass1Lookup[chainIdx]?.[segOrd]?.[sideKey]
      if (!fe) return null
      return readFeCustom(blockCustoms, fe)
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
    //
    // W1 NOTE: customs no longer depend on this carry — the chain-anchored
    // key (chainSkelId, side, segOrd) is re-derived natively on the pass-2
    // fees (buildFrontageEdges re-stamps chainSkelId; assignSegOrdsToFes
    // re-derives identical segOrds), so readFeCustom resolves on pass-2 fees
    // directly. The carry is kept only because blockKey still backs the
    // per-block W grouping in bakeFeScalars (and dies with the two-pass
    // machine in W4).
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

  // C2 — bake fe.measure / blockScalars.W / corner.swCornerDepth ONCE
  // at construction so the new C4 emitter can consume scalars without
  // reading streets at emit time. Existing emitters (silhouetteStraight
  // Emitter, buildFrontageBandsV2) retain their pre-wall signatures
  // until C5 deletion — wall enforcement lands structurally in C4.
  const { blockScalars } = bakeFeScalars(
    streets, frontageEdges, allCorners, blockCustoms, curbWidth,
  )
  __mark('bakeFeScalars')

  // ── T4 (2026-07-15) ──────────────────────────────────────────────────────
  // Everything past this point used to build the figure-ground GEOMETRY:
  // applyRoundCorners, asphaltRounded, frontageBands, filletAttribution,
  // curbBands, ribbonUnion, blockFill. All of it drew into a render branch
  // that `isTileScene` had short-circuited since the tile cutover, and on
  // Altadena it cost 285 s of the Designer's 320 s load (frontageBands alone
  // was ~cubic in street count: 77x LS's cost on 4.2x its streets).
  // DESIGNER-LOAD-FORENSIC.md has the budget.
  //
  // It is deleted. What survives is the ONE live output: `frontageEdges` —
  // the chain-anchored block-edge identity (feCustomKey = [chainSkelId, side,
  // min(segOrds)]) that Survey/Measure resolve customs against. This function
  // is now a frontage-edge builder, not an emitter; the name is vestigial and
  // dies with the fe migration onto the tile runs (RIBBONS.md §1).
  if (V2_PROFILE) {
    delete __times.__last
    const __total = performance.now() - __t0
    const __sorted = Object.entries(__times).sort((a, b) => b[1] - a[1])
    console.log(`[V2] total=${__total.toFixed(0)}ms — by step:`,
      Object.fromEntries(__sorted.map(([k, v]) => [k, +v.toFixed(0)])))
  }

  return {
    frontageEdges,   // the only live output — Survey/Measure customs identity
    blockScalars,    // per-block { W }; bakeFeScalars' sibling output, read via fe
    // Diagnosis-only, opt-in: the block rings the fes were sliced from. Off by
    // default so no consumer can start depending on it (scratch/cap-*.mjs).
    __blockRings: opts.__debugRings ? blockSharp : undefined,
  }
}

// T4 (2026-07-15): buildChainBandsLive — the figure-ground live-drag sidecar —
// deleted. It painted rect bands off the live centerline during a measure drag
// for the figure-ground overlay, which no longer exists. It was the "residual
// third representation" the render-path census flagged; the tile path renders
// selection natively via sectionGeos.selected. (SECTION.md §T4.)
