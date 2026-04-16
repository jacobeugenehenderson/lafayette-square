/**
 * Cartograph — Street geometry standards
 *
 * Every dimension here is a knob. Values are in meters.
 * Based on City of St. Louis standards, AASHTO, MUTCD, ADA.
 *
 * To customize for a different city, swap this file.
 */

const FT = 0.3048 // feet to meters

export const STANDARDS = {

  // ── Street cross-section (from centerline outward) ────────────────

  streets: {
    // Travel lane half-widths (centerline to edge of travel lane)
    residential: {
      laneWidth:    10 * FT,     // 10 ft travel lane
      parkingWidth:  7 * FT,     // 7 ft parallel parking
      gutterWidth:   1.5 * FT,   // 18" gutter pan
      lanes: 2,                   // total travel lanes (1 each direction)
    },
    secondary: {
      laneWidth:    11 * FT,
      parkingWidth:  7 * FT,
      gutterWidth:   1.5 * FT,
      lanes: 2,
    },
    primary: {
      laneWidth:    11 * FT,
      parkingWidth:  8 * FT,
      gutterWidth:   1.5 * FT,
      lanes: 4,
    },
    service: {  // alleys
      laneWidth:     7.5 * FT,   // 15 ft full width / 2
      parkingWidth:  0,
      gutterWidth:   0,
      lanes: 2,
    },
  },

  // ── Curb ──────────────────────────────────────────────────────────
  curb: {
    width:    6 * 0.0254,    // 6" wide on top
    reveal:   6 * 0.0254,    // 6" face height
    // For 2D map purposes, curb is rendered as a line at the
    // pavement edge with a configurable stroke width
  },

  // ── Sidewalk zone ─────────────────────────────────────────────────
  treeLawn: {
    width:  4.5 * FT,         // 4–5 ft planting strip
  },

  sidewalk: {
    width:  5 * FT,            // 5 ft standard residential
  },

  // ── Intersection geometry ─────────────────────────────────────────
  intersection: {
    curbReturnRadius:  15 * FT, // curb fillet radius at corners
    curbRampWidth:      4 * FT, // ADA ramp width
    curbRampDepth:      4 * FT, // ADA ramp landing depth
    crosswalkWidth:     8 * FT, // between outer edges
    stopBarOffset:      4 * FT, // from crosswalk edge
    stopBarWidth:      18 * 0.0254, // 18" wide
  },

  // ── Pavement markings ────────────────────────────────────────────
  markings: {
    centerlineWidth:    4 * 0.0254,   // 4" yellow stripe
    centerlineDash:     3.048,         // 10 ft dash
    centerlineGap:      9.144,         // 30 ft gap
    edgeLineWidth:      4 * 0.0254,   // 4" white line
    crosswalkStripeWidth: 12 * 0.0254, // 12" continental stripes
    crosswalkStripeGap:   12 * 0.0254, // 12" gaps between stripes
  },

  // ── Building setback ─────────────────────────────────────────────
  setback: {
    residential:  17.5 * FT,   // 15–20 ft typical in Lafayette Sq
    commercial:    0,           // build-to-line in commercial
  },

  // ── Alleys ───────────────────────────────────────────────────────
  alley: {
    rowWidth:  15 * FT,         // 15 ft ROW
    pavedWidth: 15 * FT,        // typically full-width paved
  },

  // ── Pedestrian / paths ──────────────────────────────────────────
  footway: {
    width:       5 * FT,         // standard sidewalk width
    crossingWidth: 8 * FT,       // crosswalk width at intersections
  },

  path: {
    width:       4 * FT,         // informal path
  },

  cycleway: {
    width:       5 * FT,         // bike lane / cycle track
  },

  steps: {
    width:       5 * FT,         // stairway width
    treadDepth: 11 * 0.0254,    // 11" tread
  },
}

/**
 * Get the cross-section spec for a given OSM feature, reading its tags
 * for lane count, cycleway presence, etc.
 *
 * Returns a spec object like STANDARDS.streets.residential but customized
 * to the actual tags on this particular street segment.
 */
export function getStreetSpec(tags) {
  const highwayType = tags?.highway || 'residential'

  // Start from the base spec for this road class
  let base
  switch (highwayType) {
    case 'primary':
    case 'primary_link':
      base = STANDARDS.streets.primary; break
    case 'secondary':
    case 'secondary_link':
    case 'tertiary':
    case 'tertiary_link':
      base = STANDARDS.streets.secondary; break
    case 'service':
      return STANDARDS.streets.service // alleys don't vary
    default:
      base = STANDARDS.streets.residential
  }

  // Clone so we can customize per-segment
  const spec = { ...base }

  // Override lane count from OSM tags
  if (tags.lanes) {
    const n = parseInt(tags.lanes, 10)
    if (n > 0) spec.lanes = n
  }

  // Cycleway adds width
  const cyc = tags.cycleway || tags['cycleway:left'] || tags['cycleway:right'] || tags['cycleway:both']
  if (cyc === 'lane' || cyc === 'track') {
    spec.cyclewayWidth = 5 * FT   // 5 ft bike lane
  } else if (cyc === 'shared_lane') {
    spec.cyclewayWidth = 0         // sharrows don't add width, but we mark them
    spec.sharrows = true
  } else {
    spec.cyclewayWidth = 0
  }

  // Parking orientation — perpendicular/diagonal stalls are much wider than parallel
  const pLeft  = tags['parking:left:orientation']
  const pRight = tags['parking:right:orientation']
  if (pLeft === 'perpendicular' || pLeft === 'diagonal' ||
      pRight === 'perpendicular' || pRight === 'diagonal') {
    spec.parkingWidth = 18 * FT   // 18 ft nose-in stall
  }

  spec.oneway = tags.oneway === 'yes'

  return spec
}

/**
 * Compute total half-width from centerline to each edge.
 * Returns { pavement, curb, treeLawn, sidewalk, propertyLine }
 * Each value is the distance from centerline to that edge.
 */
export function crossSection(spec) {
  const halfLanes = (spec.lanes / 2) * spec.laneWidth
  const cycleWidth = spec.cyclewayWidth || 0
  const pavement = halfLanes + spec.parkingWidth + cycleWidth + spec.gutterWidth

  const curb = pavement // curb sits at pavement edge
  const treeLawnOuter = curb + STANDARDS.treeLawn.width
  const sidewalkOuter = treeLawnOuter + STANDARDS.sidewalk.width

  return {
    centerline: 0,
    laneEdge: halfLanes,
    cyclewayEdge: halfLanes + cycleWidth,
    parkingEdge: halfLanes + cycleWidth + spec.parkingWidth,
    pavement,                    // = curb face
    curb: pavement + STANDARDS.curb.width,
    treeLawnOuter,
    sidewalkOuter,               // = property line (approx)
    hasCycleway: cycleWidth > 0,
    hasSharrows: spec.sharrows || false,
  }
}
