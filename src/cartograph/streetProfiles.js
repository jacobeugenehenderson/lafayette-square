// Street cross-section model — shared between Measure, pipeline, and renderer.
//
// One street, two sides (left/right of centerline walking from points[0] onward;
// side=+1 is right, matching offsetPolyline convention).
//
// Per side:
//   {
//     pavementHW:  number  // meters, centerline → curb-inner edge
//     treelawn:    number  // meters, optional, 0 = absent
//     sidewalk:    number  // meters, optional, 0 = absent
//     terminal:   'sidewalk' | 'lawn' | 'none'
//   }
//
// Stripe order from centerline outward (always fixed):
//   asphalt (pavementHW) → curb (const CURB_WIDTH) → [treelawn] → [sidewalk | lawn]
//
// The last stripe's material is named by `terminal`. When terminal='none' the
// side stops at curb (alleys, footways).
//
// No per-stripe pulldowns: stripe position in the sequence determines material.
// Parking is authored as a separate overlay layer — not represented here.

const FT = 0.3048

export const CURB_WIDTH = 6 * 0.0254   // fixed constant — not editable
export const SV_TREELAWN = 4.5 * FT
export const SV_SIDEWALK = 5 * FT

// Default pavement half-widths per street type (no parking rolled in —
// parking is a separate overlay now).
const TYPE_PAVEMENT_HW = {
  residential: 2 * 10 * FT / 2 + 7 * FT,   // 2 lanes + 1 parking lane = half-width from curb
  secondary:   2 * 11 * FT / 2 + 7 * FT,
  primary:     4 * 11 * FT / 2 + 8 * FT,
  service:     7.5 * FT,
  footway:     3 * FT,
  cycleway:    5 * FT,
  pedestrian:  5 * FT,
  steps:       4 * FT,
}

// Types that get a default sidewalk-zone (treelawn + sidewalk, terminal='sidewalk').
const SIDEWALK_ELIGIBLE = new Set(['residential', 'secondary', 'primary'])

// ── Palettes ───────────────────────────────────────────
// BAND_COLORS = Material-3 defaults used by the rendered map. Design panel
// overrides via store.layerColors — see m3Colors.js for the BAND_TO_LAYER map.
export const BAND_COLORS = {
  asphalt:  '#3e3e3c',
  curb:     '#6b4a30',
  treelawn: '#5a6e42',
  sidewalk: '#a89e8e',
  lawn:     '#5a6e42',
  median:   '#4a6a32',   // center-strip grass (slightly deeper than treelawn)
}

// Loud caustic palette for Measure overlay (translucent fills + opaque strokes).
// MUST NOT leak into the map — render.js + StreetRibbons use BAND_COLORS.
export const CAUSTIC_BAND_COLORS = {
  asphalt:  '#ff8800',
  curb:     '#ffcc00',
  treelawn: '#44cc44',
  sidewalk: '#aaaacc',
  lawn:     '#336622',
}

export const BAND_LABELS = {
  asphalt:  'Asphalt',
  curb:     'Curb',
  treelawn: 'Treelawn',
  sidewalk: 'Sidewalk',
  lawn:     'Lawn',
  median:   'Median',
}

// Snap targets for drag-release on the property-line handle. See Phase 13.5.
export const SNAP_TARGETS = {
  treelawn: [3 * FT, 3.5 * FT, 4 * FT, 4.5 * FT, 5 * FT, 6 * FT],
  sidewalk: [4 * FT, 4.5 * FT, 5 * FT, 6 * FT, 8 * FT, 10 * FT, 12 * FT, 15 * FT],
}
export const SNAP_RADIUS = 0.25

// ── Default measure per side, using survey data when available.
//
// Survey fields (per street):
//   pavementHalfWidth   — centerline → curb-inner, shared both sides
//   sidewalkLeft/Right  — centerline → *sidewalk centerline* on that side
//                         (OSM footway distance). Present only where
//                         cartograph/survey.js found a sidewalk.
//
// Per-side derivation:
//   - Sidewalk-ineligible type (alley/footway/etc.) → terminal='none', no stripes outside curb.
//   - Survey has sidewalkX for this side → terminal='sidewalk',
//     treelawn fills gap between curb-outer and (sidewalkDist − SV_SIDEWALK/2),
//     sidewalk width = SV_SIDEWALK.
//   - Sidewalk-eligible but no sidewalk data on this side:
//     - If the other side has sidewalk (asymmetric street — e.g. park-edge) →
//       terminal='lawn' with a modest grass strip (no measured data).
//     - If neither side has sidewalk data → terminal='sidewalk' with a sane
//       default so the default rendering still reads as a residential block.
export function defaultSideMeasure(type, survey, sideKey = 'left') {
  const hw = survey?.pavementHalfWidth || TYPE_PAVEMENT_HW[type] || TYPE_PAVEMENT_HW.residential
  if (!SIDEWALK_ELIGIBLE.has(type)) {
    return { pavementHW: hw, treelawn: 0, sidewalk: 0, terminal: 'none' }
  }
  const swDist = sideKey === 'right'
    ? survey?.sidewalkRight
    : survey?.sidewalkLeft
  if (swDist && Number.isFinite(swDist)) {
    const curbOuter = hw + CURB_WIDTH
    const swInner = swDist - SV_SIDEWALK / 2
    const treelawn = Math.max(0, swInner - curbOuter)
    return {
      pavementHW: hw,
      treelawn,
      sidewalk: SV_SIDEWALK,
      terminal: 'sidewalk',
    }
  }
  // No per-side sidewalk data.
  const otherSw = sideKey === 'right' ? survey?.sidewalkLeft : survey?.sidewalkRight
  if (otherSw && Number.isFinite(otherSw)) {
    // Other side has a sidewalk; this side likely faces open space / park.
    return { pavementHW: hw, treelawn: 0, sidewalk: 3 * FT, terminal: 'lawn' }
  }
  // Neither side surveyed — fall back to residential treelawn + sidewalk default.
  return { pavementHW: hw, treelawn: SV_TREELAWN, sidewalk: SV_SIDEWALK, terminal: 'sidewalk' }
}

// Per-street default measure: {left, right, symmetric}.
// `symmetric: true` means dragging one side's handles mirrors to the other.
// Operator unlocks via the panel "Asymmetrical" toggle. Most streets are
// symmetric; park-edge streets typically need asymmetrical.
export function defaultMeasure(type, survey) {
  const left = defaultSideMeasure(type, survey, 'left')
  const right = defaultSideMeasure(type, survey, 'right')
  // If survey produced different terminals L vs R (park-edge case), start
  // asymmetric so the operator doesn't accidentally overwrite one side.
  const symmetric = left.terminal === right.terminal
    && Math.abs(left.treelawn - right.treelawn) < 0.01
    && Math.abs(left.sidewalk - right.sidewalk) < 0.01
  return { left, right, symmetric }
}

// Convert one side's measure into an ordered list of rings: one per stripe,
// innerR → outerR from centerline outward. Materials are implied by position.
export function sideToStripes(side) {
  if (!side) return []
  const out = []
  let r = 0
  // asphalt
  if (side.pavementHW > 0) {
    out.push({ material: 'asphalt', innerR: r, outerR: r + side.pavementHW })
    r += side.pavementHW
  }
  // curb — always present unless pavement is zero
  if (side.pavementHW > 0 && side.terminal !== undefined) {
    out.push({ material: 'curb', innerR: r, outerR: r + CURB_WIDTH })
    r += CURB_WIDTH
  }
  if (side.terminal === 'none') return out
  // treelawn (optional)
  if (side.treelawn > 0) {
    out.push({ material: 'treelawn', innerR: r, outerR: r + side.treelawn })
    r += side.treelawn
  }
  // terminal stripe: sidewalk or lawn
  if (side.terminal === 'sidewalk' && side.sidewalk > 0) {
    out.push({ material: 'sidewalk', innerR: r, outerR: r + side.sidewalk })
    r += side.sidewalk
  } else if (side.terminal === 'lawn' && side.sidewalk > 0) {
    out.push({ material: 'lawn', innerR: r, outerR: r + side.sidewalk })
    r += side.sidewalk
  }
  return out
}

// Reference edges for corner-plug logic. Everything the plug math needs.
export function refEdges(side) {
  const stripes = sideToStripes(side)
  const find = (mat) => stripes.find(s => s.material === mat)
  const asphalt = find('asphalt')
  const curb = find('curb')
  const sw = stripes.find(s => s.material === 'sidewalk' || s.material === 'lawn')
  const outer = stripes.length ? stripes[stripes.length - 1].outerR : 0
  return {
    propertyLine: outer,
    asphaltOuter: asphalt ? asphalt.outerR : 0,
    curbInner:  curb ? curb.innerR : outer,
    curbOuter:  curb ? curb.outerR : outer,
    sidewalkInner: sw ? sw.innerR : outer,
    sidewalkOuter: sw ? sw.outerR : outer,
    hasSidewalk: sw?.material === 'sidewalk',
    terminal: side?.terminal || 'none',
  }
}

// Couplers split a street into addressable segments. With couplers at
// indices [3, 7] on a 10-point street, segments are [0,3], [3,7], [7,9].
// Each segment is half-open at the end (the coupler index is shared with
// the next segment so the ribbon edges meet cleanly at the coupler point).
//
// Couplers carry world coords (x, z) so they can be re-projected onto a
// different polyline (skeleton vs. ribbons polylines have different point
// counts because derive splices intersection vertices into the latter). When
// a coupler has world coords, the index is computed by nearest-vertex
// projection onto the supplied `pts`. Falls back to `pointIdx` if world
// coords are missing (legacy data).
export function segmentRangesForCouplers(pts, couplers = []) {
  // Back-compat: original signature took (pointCount, couplers). Detect it.
  if (typeof pts === 'number') {
    const n = pts
    if (n < 2) return []
    const sorted = [...new Set((couplers || [])
      .map(normalizeCoupler).filter(c => c.kind === 'split').map(c => c.pointIdx)
      .filter(i => Number.isFinite(i) && i > 0 && i < n - 1))]
      .sort((a, b) => a - b)
    const ranges = []; let start = 0
    for (const c of sorted) { ranges.push([start, c]); start = c }
    ranges.push([start, n - 1])
    return ranges
  }
  const n = pts.length
  if (n < 2) return []
  const splitIdxs = (couplers || [])
    .map(normalizeCoupler)
    .filter(c => c.kind === 'split')
    .map(c => {
      if (Number.isFinite(c.x) && Number.isFinite(c.z)) {
        // Nearest interior vertex projection. Excludes endpoints — couplers
        // can't sit on chain endpoints since those are already boundaries.
        let best = -1, bd = Infinity
        for (let i = 1; i < n - 1; i++) {
          const d = (pts[i][0] - c.x) ** 2 + (pts[i][1] - c.z) ** 2
          if (d < bd) { bd = d; best = i }
        }
        return best
      }
      return c.pointIdx
    })
    .filter(i => Number.isFinite(i) && i > 0 && i < n - 1)
  const sorted = [...new Set(splitIdxs)].sort((a, b) => a - b)
  const ranges = []; let start = 0
  for (const c of sorted) { ranges.push([start, c]); start = c }
  ranges.push([start, n - 1])
  return ranges
}

// Couplers are stored as a mixed array of numbers (legacy split couplers) and
// objects (insert couplers carrying a feature like a median, or split
// couplers carrying world coords). Normalize to the object form for consumers
// that need to branch on kind.
export function normalizeCoupler(c) {
  if (typeof c === 'number') return { kind: 'split', pointIdx: c }
  return c
}

// Cumulative arc-length at each centerline point. pts[i] sits at arcLen[i]
// meters from pts[0]. Used by insert-coupler resolution to express taper /
// hold / taper-out lengths in real meters instead of node counts.
export function arcLengthsAt(pts) {
  const out = new Float64Array(pts.length)
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dz = pts[i][1] - pts[i - 1][1]
    out[i] = out[i - 1] + Math.hypot(dx, dz)
  }
  return out
}

// Smooth fairing curve used by insert couplers. Cosine-ease from 0 → 1 over
// t ∈ [0, 1]. Produces the rounded nose a real-world median has, not a
// triangular point. Linear lerp is the fallback if we ever want sharper.
function smoothEase(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 0.5 - 0.5 * Math.cos(Math.PI * t)
}

// Resolve per-point insert-coupler modifiers for a street. Returns an array
// of { medianHW, lateralOffset } per centerline point. Currently supports
// feature: 'median' with taperIn / hold / taperOut; future features (jog,
// bulge, slip-lane) add their own modifier fields. Points outside every
// insert's active zone get 0 for everything — the normal cross-section
// applies unchanged.
export function resolveInserts(street) {
  const pts = street.points || []
  const n = pts.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = { medianHW: 0, lateralOffset: 0 }
  if (!street.couplers || !street.couplers.length || n < 2) return out

  const arc = arcLengthsAt(pts)
  const inserts = street.couplers
    .map(normalizeCoupler)
    .filter(c => c.kind === 'insert')

  for (const ins of inserts) {
    if (ins.pointIdx < 0 || ins.pointIdx >= n) continue
    const anchorArc = arc[ins.pointIdx]
    const taperIn = Math.max(0, ins.taperIn || 0)
    const hold = Math.max(0, ins.hold || 0)
    const taperOut = Math.max(0, ins.taperOut || 0)
    // Layout relative to anchor (which sits at the CENTER of the hold zone):
    //   [anchor - taperIn - hold/2 .. anchor - hold/2]   taper-in
    //   [anchor - hold/2 .. anchor + hold/2]             hold (full insert)
    //   [anchor + hold/2 .. anchor + hold/2 + taperOut]  taper-out
    const holdStart = anchorArc - hold / 2
    const holdEnd = anchorArc + hold / 2
    const inStart = holdStart - taperIn
    const outEnd = holdEnd + taperOut

    for (let i = 0; i < n; i++) {
      const s = arc[i]
      let envelope = 0   // 0 outside, 1 on full hold, ease between
      if (s < inStart || s > outEnd) continue
      if (s < holdStart) {
        envelope = taperIn > 0 ? smoothEase((s - inStart) / taperIn) : 1
      } else if (s <= holdEnd) {
        envelope = 1
      } else {
        envelope = taperOut > 0 ? smoothEase((outEnd - s) / taperOut) : 1
      }
      if (ins.feature === 'median') {
        const w = (ins.medianHW || 0) * envelope
        if (w > out[i].medianHW) out[i].medianHW = w
      } else if (ins.feature === 'jog') {
        // Signed lateral shift (meters). Cosine-eased in and out via
        // `envelope`; taper regions give the chevron fairing that real
        // jog/slip-lane transitions show on the ground.
        const o = (ins.offset || 0) * envelope
        if (Math.abs(o) > Math.abs(out[i].lateralOffset)) out[i].lateralOffset = o
      }
      // Future: feature === 'bulge' contributes to an outer-widen field, etc.
    }
  }
  return out
}

// Resolve the effective measure for a segment by ORDINAL index (0 = first
// segment, 1 = second, ...). Ordinal keys are stable across coord systems
// (skeleton vs. ribbons polylines), unlike point-index range keys. Falls
// back to the street's overall measure when no per-segment override exists.
// Returns null if neither is set (caller should use defaults).
export function measureForSegment(street, ordinal) {
  if (street.segmentMeasures && street.segmentMeasures[String(ordinal)]) {
    return street.segmentMeasures[String(ordinal)]
  }
  return street.measure || null
}

// Total half-width (for back-compat callers like surveyor ribbon preview).
export function getHalfWidth(type) {
  const side = defaultSideMeasure(type)
  return side.pavementHW + (side.terminal !== 'none' ? CURB_WIDTH : 0) + side.treelawn + side.sidewalk
}

// For inner-edge anchored chains, return the polyline offset to the inner
// edge of the carriageway pavement. `pts` is the original chain centerline,
// `innerSign` is +1 if the inner side is on the LEFT perpendicular of the
// tangent and -1 if on the RIGHT (set by derive's innerSideSign).
// `offsetPolyline(pts, dist, side)` adds `side * leftPerp * dist`, so
// side=+1 moves toward leftPerp and side=-1 moves toward rightPerp. To go
// toward the inner side, pass `side = innerSign` directly.
export function innerEdgeOffsetPolyline(pts, innerSign, pavementHW) {
  if (!innerSign || !pavementHW) return pts
  return offsetPolyline(pts, pavementHW, innerSign)
}

// Inner-edge anchor: chain stays at carriageway center; cross-section is
// authored symmetrically (pavement + curb on BOTH sides). The only thing
// inner-edge does is zero out the inboard ped zone — no treelawn, no
// sidewalk, no `terminal` — because there's no pedestrian zone along the
// median. The carriageway pavement spans both sides as usual; curb caps
// the inboard pavement at the median edge. Outboard side keeps its full
// cross-section. Operator authors per chain by dragging both pavement
// edges (inner + outer) and the outboard treelawn/sidewalk handles.
export function innerEdgeMeasure(baseMeasure, innerSign) {
  if (!innerSign) return baseMeasure
  const inboardKey = innerSign === +1 ? 'right' : 'left'
  const inboardSide = baseMeasure?.[inboardKey] || {}
  return {
    ...baseMeasure,
    [inboardKey]: {
      ...inboardSide,
      treelawn: 0,
      sidewalk: 0,
      terminal: 'none',
    },
  }
}

// Offset a polyline by `dist` along its normal; side=+1 right, -1 left.
export function offsetPolyline(pts, dist, side) {
  const result = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(n - 1, i + 1)]
    const dx = next[0] - prev[0], dz = next[1] - prev[1]
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    const nx = -dz / len, nz = dx / len
    result.push([pts[i][0] + side * nx * dist, pts[i][1] + side * nz * dist])
  }
  return result
}
