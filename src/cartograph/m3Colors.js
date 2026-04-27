/**
 * Material-3 muted initial palette for the Designer panel.
 *
 * Neutral + Neutral-Variant tonal values, low-chroma, photographically calm.
 * These are the *defaults* — users override via the panel color pickers, and
 * the reset button restores the entry from here. Rendering pulls from the
 * store's `layerColors` first and falls back to this map.
 */

// Layer defaults — vibrant M3-structured palette. The scene is a bright,
// hand-painted map, not a photograph; base tones push saturation/value so
// they read confidently through ACES tone-mapping + PBR lighting at midday.
export const DEFAULT_LAYER_COLORS = {
  // Ground / blocks / buildings
  ground:     '#2A2826',  // warm dark neutral (off-map)
  lot:        '#4E6A3E',  // living green — carries residential block tone
  building:   '#3A3A3A',  // generic dark gray until a shader is assigned
  park:       '#5E8A3A',  // vibrant grass
  water:      '#4A6A8E',  // lake + grotto (muted blue)

  // Streets / alleys / walks
  street:     '#4A4A48',  // midday asphalt (warmer, lighter than muted)
  highway:    '#2D2D2C',  // motorway/ramp asphalt — slightly darker, cooler
  alley:      '#3E3E3C',  // narrower/darker than streets but still open
  curb:       '#A8826A',  // warm tan — reads as poured concrete in sun
  sidewalk:   '#B8B2A4',  // light warm cream
  treelawn:   '#5E8A3A',  // grass between sidewalk and curb
  median:     '#4E7A32',  // center divider grass (divided roads)
  footway:    '#9A8E78',  // slightly cooler than sidewalk — trail
  cycleway:   '#6EA070',  // softer green (bike path)
  steps:      '#A0907E',  // stone tone
  path:       '#8E7E68',  // dirt/loose aggregate

  // Lines / paint (striping)
  stripe:     '#F2CE4A',  // saturated school-bus yellow
  edgeline:   '#E8E4DE',  // near-white paint
  bikelane:   '#5EA070',  // saturated green
  centerline: '#E8E4DE',  // white paint

  // Point features
  tree:       '#4E7A3E',  // foliage
  lamp:       '#F2D67A',  // warm amber glow
  labels:     '#2A2826',  // dark text on map

  // Landscape overlays (sub-block features, each its own swatch)
  garden:         '#7EB04A',
  playground:     '#D89A4E',
  swimming_pool:  '#4A7EB0',
  pitch:          '#5E9E4A',
  sports_centre:  '#6EA05E',
  wood:           '#3E5E2E',
  scrub:          '#6E7A4A',
  tree_row:       '#4E7A3E',

  // Barriers (linear features in the Features section)
  fence:          '#8A7E6E',
  wall:           '#9A8E7E',
  hedge:          '#4E6E3E',
  retaining_wall: '#7A6E5E',
}

// Default stroke configs per shape layer. Each: { color, width, enabled }.
// width is in world meters; enabled=false hides the outline entirely.
export const DEFAULT_LAYER_STROKES = {
  parking_lot: { color: '#1A1A18', width: 0.1, enabled: false },
}

// Land-use defaults — saturated, so each block fill pops as a neighborhood
// tile. Tuned to align with /stage's baseline: residential = grass-green.
export const DEFAULT_LU_COLORS = {
  residential:        '#5A8A3A',  // grass green
  commercial:         '#A87D3E',  // warm amber
  vacant:             '#7A8A4E',  // overgrown lot
  'vacant-commercial':'#8A7E5E',  // sun-bleached warm
  parking:            '#6A6A62',  // concrete lot
  institutional:      '#7E8AA8',  // cool slate
  recreation:         '#6EA03E',  // athletic-turf green
  industrial:         '#8E7060',  // warm rust
}

// OSM overlay defaults — one color per (category, subtype). Keys are
// `category:subtype`. Feeds the Overlays section of the Panel.
export const DEFAULT_OVERLAY_COLORS = {
  // landuse
  'landuse:retail':             '#A87D3E',
  'landuse:commercial':         '#A07050',
  'landuse:residential':        '#5A8A3A',
  'landuse:industrial':         '#8E7060',
  'landuse:religious':          '#8A7EA0',
  'landuse:grass':              '#6E9A3E',
  'landuse:recreation_ground':  '#6EA03E',
  'landuse:allotments':         '#7AA04E',
  'landuse:construction':       '#7A6A5A',
  // leisure
  'leisure:garden':             '#7EB04A',
  'leisure:playground':         '#D89A4E',
  'leisure:swimming_pool':      '#4A7EB0',
  'leisure:pitch':              '#5E9E4A',
  'leisure:sports_centre':      '#6EA05E',
  'leisure:outdoor_seating':    '#A0906A',
  // natural
  'natural:water':              '#4A6A8E',
  'natural:wood':               '#3E5E2E',
  'natural:scrub':              '#6E7A4A',
  'natural:cliff':              '#7A7066',
  'natural:bare_rock':          '#8A8076',
  'natural:tree_row':           '#4E7A3E',
  // institution (amenity polygons minus parking)
  'institution:school':         '#8A8AA8',
  'institution:place_of_worship':'#9A8EB0',
  'institution:fuel':           '#C8804A',
  'institution:fire_station':   '#B84E3E',
  'institution:library':        '#7E9AB0',
  'institution:university':     '#8A8AA8',
  'institution:cafe':           '#A8804A',
  'institution:bar':            '#8A6E5A',
  'institution:restaurant':     '#A88A5A',
  'institution:fast_food':      '#C89A5A',
  'institution:shelter':        '#7A6E5E',
  'institution:veterinary':     '#8A9AA8',
  'institution:charging_station':'#4E8E9E',
  'institution:waste_disposal': '#5E5A50',
  'institution:crematorium':    '#7A7066',
}

// Ribbon band → layer-picker mapping. Lets StreetRibbons look up a band's
// color via the single `layerColors` dict rather than maintaining a parallel
// BAND_COLORS map that drifts from the panel.
export const BAND_TO_LAYER = {
  asphalt:            'street',
  highway:            'highway',
  'parking-parallel': 'street',
  'parking-angled':   'street',
  gutter:             'curb',
  curb:               'curb',
  sidewalk:           'sidewalk',
  treelawn:           'treelawn',
  lawn:               'treelawn',
  median:             'median',
}
