/**
 * Cartograph — Surface hierarchy and draw-order rules
 *
 * Defines what draws on top of what, and what "wins" when
 * two features meet. This always applies regardless of
 * neighborhood or style.
 *
 * Rules sourced from traffic engineering standards:
 *   - Higher-class streets are continuous over lower-class
 *   - Sidewalks continue over alleys and driveways
 *   - Curbs break at driveways, alleys, and ramps
 *   - Markings stop at intersection zones
 *   - Buildings on top of everything
 */

// ── Street class priority ────────────────────────────────────────────
// Higher number = higher priority = draws on top / continues through

export const STREET_CLASS = {
  'motorway':       90,
  'motorway_link':  85,
  'primary':        80,
  'primary_link':   75,
  'secondary':      70,
  'secondary_link': 65,
  'tertiary':       60,
  'tertiary_link':  55,
  'residential':    40,
  'unclassified':   40,
  'service':        20,  // generic service roads
  'alley':          15,  // service + service=alley
  'driveway':       10,  // service + service=driveway
  'parking_aisle':   5,
}

export function streetPriority(tags) {
  if (tags?.highway === 'service') {
    const sub = tags.service || ''
    if (sub === 'alley') return STREET_CLASS.alley
    if (sub === 'driveway') return STREET_CLASS.driveway
    if (sub === 'parking_aisle') return STREET_CLASS.parking_aisle
    return STREET_CLASS.service
  }
  return STREET_CLASS[tags?.highway] || 30
}

// ── Layer draw order ─────────────────────────────────────────────────
// Bottom to top. This is the SVG rendering order.
// Each entry: { layer, zIndex, description }

export const DRAW_ORDER = [
  // Ground plane
  { layer: 'lot',              z:  0 },
  { layer: 'block',            z:  5 },   // parcel-union boundary (between lot and sidewalk)

  // Sidewalk zone (continuous — draws over alleys/driveways)
  { layer: 'sidewalk',         z: 10 },
  { layer: 'footway',          z: 11 },
  { layer: 'treeLawn',         z: 12 },

  // Street surfaces (ordered by class — higher-class on top)
  // Within each class, individual features sorted by streetPriority
  { layer: 'pavement',         z: 20, sortByPriority: true },
  { layer: 'alley',            z: 21 },
  { layer: 'intersectionFill', z: 25 },

  // On-street features
  { layer: 'bikelane',         z: 30 },
  { layer: 'parking',          z: 31 },

  // Pedestrian crossings (on top of pavement)
  { layer: 'crossing',         z: 40 },
  { layer: 'path',             z: 41 },
  { layer: 'cycleway',         z: 42 },
  { layer: 'steps',            z: 43 },

  // Curbs and edges
  { layer: 'curb',             z: 50 },
  { layer: 'curbReturn',       z: 51 },

  // Painted markings (on top of pavement surface)
  { layer: 'centerStripe',     z: 60 },

  // Structures
  { layer: 'buildings',        z: 90 },
]

// ── Continuation rules ───────────────────────────────────────────────
// Encoded as: when featureA meets featureB, who wins?
// 'over' = A draws on top, 'under' = A draws under, 'break' = A is interrupted

export const CONTINUATION = {
  // Sidewalk is continuous over alleys and driveways
  sidewalk: {
    alley:    'over',
    driveway: 'over',
    street:   'stop',   // curb separates them
  },

  // Curb is continuous along streets except at breaks
  curb: {
    driveway:  'break',  // curb cut
    alley:     'break',  // curb cut
    curbRamp:  'break',  // ADA ramp replaces curb
    intersection: 'return', // curb follows fillet arc
  },

  // Center stripe stops at intersections
  centerStripe: {
    intersection: 'stop',
  },

  // Bike lane stops (or dashes) through intersections
  bikelane: {
    intersection: 'stop',
  },

  // Crosswalks overlay pavement
  crossing: {
    pavement: 'over',
    intersection: 'over',
  },
}

/**
 * Sort pavement features so higher-class streets draw on top.
 */
export function sortByStreetClass(features) {
  return [...features].sort((a, b) => {
    const pa = streetPriority(a.tags || { highway: a.highwayType })
    const pb = streetPriority(b.tags || { highway: b.highwayType })
    return pa - pb // lower priority drawn first (underneath)
  })
}
