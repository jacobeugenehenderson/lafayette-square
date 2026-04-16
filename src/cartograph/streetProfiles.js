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

// Snap targets for dragging (incremental widths, not cumulative)
export const SNAP_TARGETS = {
  'parking-parallel': [7 * FT, 8 * FT],
  'parking-angled':   [16 * FT, 18 * FT, 20 * FT],
  treelawn:           [3 * FT, 3.5 * FT, 4 * FT, 4.5 * FT, 5 * FT, 6 * FT],
  sidewalk:           [4 * FT, 4.5 * FT, 5 * FT, 6 * FT, 8 * FT, 10 * FT],
}
export const SNAP_RADIUS = 0.25 // meters

// Material colors for caustics and Stage preview
export const BAND_COLORS = {
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

// Default band stack for a street type — ordered array, inside → outside
export function getDefaultBands(type) {
  const p = PROFILES[type] || PROFILES.residential
  const travel = (p.lanes / 2) * p.laneW
  const bands = [
    { material: 'asphalt', width: travel },
  ]
  if (p.gutterW > 0) {
    bands.push({ material: 'gutter', width: p.gutterW })
  }
  if (p.parkW > 0) {
    bands.push({ material: p.parkType === 'angled' ? 'parking-angled' : 'parking-parallel', width: p.parkW })
  }
  bands.push({ material: 'curb', width: SV_CURB })
  // No treelawn or sidewalk by default — operator adds via measure
  return bands
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
