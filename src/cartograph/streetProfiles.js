// Street profile computation — shared between surveyor, measure, and pipeline
const FT = 0.3048

const PROFILES = {
  residential: { lanes: 2, laneW: 10 * FT, parkW: 7 * FT, parkType: 'parallel', gutterW: 1.5 * FT },
  secondary:   { lanes: 2, laneW: 11 * FT, parkW: 7 * FT, parkType: 'parallel', gutterW: 1.5 * FT },
  primary:     { lanes: 4, laneW: 11 * FT, parkW: 8 * FT, parkType: 'parallel', gutterW: 1.5 * FT },
  service:     { lanes: 2, laneW: 7.5 * FT, parkW: 0, parkType: null, gutterW: 0 },
  footway:     { lanes: 1, laneW: 3 * FT, parkW: 0, parkType: null, gutterW: 0 },
  cycleway:    { lanes: 1, laneW: 5 * FT, parkW: 0, parkType: null, gutterW: 0 },
  pedestrian:  { lanes: 1, laneW: 5 * FT, parkW: 0, parkType: null, gutterW: 0 },
  steps:       { lanes: 1, laneW: 4 * FT, parkW: 0, parkType: null, gutterW: 0 },
}

const SV_CURB = 6 * 0.0254
const SV_TREELAWN = 4.5 * FT
const SV_SIDEWALK = 5 * FT

// Sidewalk-eligible street types: these get a default sidewalk band sized to
// fill the curb-to-property-line gap (from survey.rowWidth) or a conservative
// 5 ft default when no survey data is available. See feedback_no_default_sidewalks.md
// (SUPERSEDED) and the 2026-04-16 session notes in BACKLOG.md.
const SIDEWALK_ELIGIBLE = new Set(['residential', 'secondary', 'primary'])

// Snap targets for dragging (incremental widths, not cumulative)
export const SNAP_TARGETS = {
  'parking-parallel': [7 * FT, 8 * FT],
  'parking-angled':   [16 * FT, 18 * FT, 20 * FT],
  treelawn:           [3 * FT, 3.5 * FT, 4 * FT, 4.5 * FT, 5 * FT, 6 * FT],
  sidewalk:           [4 * FT, 4.5 * FT, 5 * FT, 6 * FT, 8 * FT, 10 * FT],
}
export const SNAP_RADIUS = 0.25 // meters

// ── Band palettes ───────────────────────────────────────────
// BAND_COLORS = Material-3 compliant defaults, used by the rendered map.
// CAUSTIC_BAND_COLORS = loud authoring colors, used by the Measure caustic overlay.
// Keep these palettes distinct — caustic colors must never leak into the map.
// See feedback_material3_defaults.md.
export const BAND_COLORS = {
  asphalt:            '#3e3e3c',  // dark neutral
  'parking-parallel': '#464642',  // slightly distinguishable stripe
  'parking-angled':   '#464642',
  gutter:             '#6e6a62',  // transition between asphalt and curb
  curb:               '#6b4a30',  // warm brown — high contrast against asphalt and sidewalk for visibility
  treelawn:           '#5a6e42',  // muted green
  sidewalk:           '#a89e8e',  // light warm concrete
  lawn:               '#5a6e42',  // muted green (same as treelawn by default)
}

export const CAUSTIC_BAND_COLORS = {
  asphalt:            '#ff8800',
  'parking-parallel': '#cc6600',
  'parking-angled':   '#cc4400',
  curb:               '#ffcc00',
  gutter:             '#998866',
  treelawn:           '#44cc44',
  sidewalk:           '#aaaacc',
  lawn:               '#336622',
}

export const BAND_LABELS = {
  asphalt:            'Travel Lanes',
  'parking-parallel': 'Parallel Parking',
  'parking-angled':   'Angled Parking',
  curb:               'Curb',
  gutter:             'Gutter',
  treelawn:           'Treelawn',
  sidewalk:           'Sidewalk',
  lawn:               'Lawn',
}

// Combined half-width for surveyor ribbon preview (backwards compat)
export function getHalfWidth(type) {
  const p = PROFILES[type] || PROFILES.residential
  return (p.lanes / 2) * p.laneW + p.parkW + p.gutterW
}

// Minimal default bands for a street type. The operator adds specific details
// (parking, treelawn, wider sidewalk, etc.) via the caustic ruler — defaults
// are deliberately the "certain" basics.
//
// Generic street → asphalt + curb
// Sidewalk-eligible → asphalt + curb + sidewalk
//
// `asphalt` width sums the full pavement half-width from survey (or type
// default), so roadway + any implicit parking is all one `asphalt` band.
// Operator re-classifies via Measure when they want to distinguish parking.
function buildDefaultPavementBand(type, pavementHW) {
  return [{ material: 'asphalt', width: pavementHW }]
}

export function getDefaultBands(type) {
  const p = PROFILES[type] || PROFILES.residential
  // Full pavement half-width (travel + any expected parking + gutter)
  const pavementHW = (p.lanes / 2) * p.laneW + (p.parkW || 0) + (p.gutterW || 0)
  const bands = buildDefaultPavementBand(type, pavementHW)
  bands.push({ material: 'curb', width: SV_CURB })
  if (SIDEWALK_ELIGIBLE.has(type)) {
    bands.push({ material: 'sidewalk', width: SV_SIDEWALK })
  }
  return bands
}

// Survey-driven per-side builder.
//
// Per survey.json's own data model:
//   `sidewalkLeft` / `sidewalkRight` = distance from street centerline to the
//   CENTERLINE of the sidewalk on each side. Sidewalk is a standard 5 ft
//   concrete strip centered on that measurement. This is the authoritative
//   measurement for sidewalk position.
//
// The cross-section from centerline outward (per side):
//   [asphalt + parking] → [curb 6"] → [treelawn if present] → [sidewalk 5ft]
// Sidewalk outer edge = sidewalkDistance + SV_SIDEWALK/2.
// Curb outer edge    = sidewalkDistance - SV_SIDEWALK/2 (no default treelawn).
// Pavement half-width = curb outer - SV_CURB (asphalt/parking fills the rest).
//
// If sidewalkLeft/Right are absent (e.g. alleys, footways), fall back to
// pavementHalfWidth or type-default pavement.
export function getDefaultBandsFromSurvey(type, survey, side = 'left') {
  const p = PROFILES[type] || PROFILES.residential
  const isSidewalkEligible = SIDEWALK_ELIGIBLE.has(type)

  // Measured sidewalk-centerline distance for this side, if present.
  const swDist = side === 'right'
    ? survey?.sidewalkRight ?? survey?.sidewalkLeft
    : survey?.sidewalkLeft  ?? survey?.sidewalkRight

  // Resolve pavement half-width (all driveable surface — roadway + any
  // implicit parking + gutter, as one `asphalt` band; operator splits as needed)
  let pavementHW
  if (isSidewalkEligible && swDist) {
    pavementHW = swDist - SV_SIDEWALK / 2 - SV_CURB
  } else if (survey?.pavementHalfWidth && !isSidewalkEligible) {
    pavementHW = survey.pavementHalfWidth
  } else {
    pavementHW = (p.lanes / 2) * p.laneW + (p.parkW || 0) + (p.gutterW || 0)
  }
  if (pavementHW < 0.5) pavementHW = 0.5

  const bands = buildDefaultPavementBand(type, pavementHW)
  bands.push({ material: 'curb', width: SV_CURB })
  if (isSidewalkEligible) {
    bands.push({ material: 'sidewalk', width: SV_SIDEWALK })
  }
  return bands
}

// Symmetric {left, right} band profile. Defaults stay symmetric even when
// survey.sidewalkLeft ≠ sidewalkRight — those per-side differences are usually
// measurement noise, and asymmetric defaults produce visibly asymmetric corner
// plugs which the user has explicitly rejected ("adds unnecessary complexity,
// rounded square at the end of the sidewalk"). Asymmetric bands are still
// available for operator measurement or for Phase 14 divided-oneways — just
// not as a default. We use pavementHalfWidth (the survey's average) as the
// single sidewalk-centerline reference.
export function getDefaultBandProfile(type, survey) {
  // Build once using the average (pavementHalfWidth), then mirror to both sides.
  const symmetricSurvey = survey
    ? { ...survey, sidewalkLeft: survey.pavementHalfWidth, sidewalkRight: survey.pavementHalfWidth }
    : survey
  const bands = getDefaultBandsFromSurvey(type, symmetricSurvey, 'left')
  return {
    left: bands.map(b => ({ ...b })),
    right: bands.map(b => ({ ...b })),
  }
}

// (DEPRECATED — kept for any external callers) Symmetric-only version.
export function getDefaultBandProfileSymmetric(type, survey) {
  const bands = getDefaultBandsFromSurvey(type, survey, 'left')
  return {
    left: bands.map(b => ({ ...b })),
    right: bands.map(b => ({ ...b })),
  }
}

// Cumulative widths for a {left, right} band profile.
// Useful for deriving reference edges (curb inner/outer, property line).
export function bandProfileCumulative(bandProfile) {
  return {
    left: bandsToCumulative(bandProfile.left || []),
    right: bandsToCumulative(bandProfile.right || []),
  }
}

// Compute cumulative distances from a band stack (for caustic rendering)
// Returns array of { material, innerR, outerR }
export function bandsToCumulative(bands) {
  let r = 0
  return bands.map(b => {
    const inner = r
    r += b.width
    return { material: b.material, innerR: inner, outerR: r }
  })
}

// Convert a band stack to the flat profile format StreetRibbons expects
// (for pipeline compatibility)
export function bandsToProfile(bands) {
  const cum = bandsToCumulative(bands)
  const last = cum[cum.length - 1]
  const find = (mat) => {
    const b = cum.find(c => c.material === mat)
    return b ? b.outerR : 0
  }
  // Map to the existing profile format
  const parkOuter = find('parking-parallel') || find('parking-angled')
  const curbOuter = find('curb')
  const treelawnOuter = find('treelawn')
  const sidewalkOuter = find('sidewalk')
  return {
    asphalt: parkOuter || curbOuter || last.outerR,
    curb: curbOuter || last.outerR,
    treelawn: treelawnOuter,
    sidewalk: sidewalkOuter || treelawnOuter || curbOuter || last.outerR,
    source: 'measured',
  }
}

// Get the old-style full profile (for backwards compat with existing code)
export function getFullProfile(type) {
  const hw = getHalfWidth(type)
  return {
    asphalt: hw,
    curb: hw + SV_CURB,
    treelawn: 0,
    sidewalk: 0,
    symmetric: true,
  }
}

// Offset a polyline left or right by a distance
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
