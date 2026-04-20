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
export function segmentRangesForCouplers(pointCount, couplers = []) {
  if (pointCount < 2) return []
  const sorted = [...new Set(couplers)]
    .filter(i => i > 0 && i < pointCount - 1)
    .sort((a, b) => a - b)
  const ranges = []
  let start = 0
  for (const c of sorted) {
    ranges.push([start, c])
    start = c
  }
  ranges.push([start, pointCount - 1])
  return ranges
}

// Resolve the effective measure for a given segment range. Falls back to the
// street's overall measure when no per-segment override exists. Returns null
// if neither is set (caller should use defaults).
export function measureForSegment(street, range) {
  const key = `${range[0]}-${range[1]}`
  if (street.segmentMeasures && street.segmentMeasures[key]) {
    return street.segmentMeasures[key]
  }
  return street.measure || null
}

// Total half-width (for back-compat callers like surveyor ribbon preview).
export function getHalfWidth(type) {
  const side = defaultSideMeasure(type)
  return side.pavementHW + (side.terminal !== 'none' ? CURB_WIDTH : 0) + side.treelawn + side.sidewalk
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
