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
  building:   '#5E3E2E',  // warm brick-brown (darker-than-roofs hint)
  park:       '#5E8A3A',  // vibrant grass

  // Streets / alleys / walks
  street:     '#4A4A48',  // midday asphalt (warmer, lighter than muted)
  alley:      '#3E3E3C',  // narrower/darker than streets but still open
  curb:       '#A8826A',  // warm tan — reads as poured concrete in sun
  sidewalk:   '#B8B2A4',  // light warm cream
  footway:    '#9A8E78',  // slightly cooler than sidewalk — trail

  // Lines / paint (striping)
  stripe:     '#F2CE4A',  // saturated school-bus yellow
  edgeline:   '#E8E4DE',  // near-white paint
  bikelane:   '#5EA070',  // saturated green
  centerline: '#E8E4DE',  // white paint

  // Point features
  tree:       '#4E7A3E',  // foliage
  lamp:       '#F2D67A',  // warm amber glow
  labels:     '#2A2826',  // dark text on map
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

// Ribbon band → layer-picker mapping. Lets StreetRibbons look up a band's
// color via the single `layerColors` dict rather than maintaining a parallel
// BAND_COLORS map that drifts from the panel.
export const BAND_TO_LAYER = {
  asphalt:            'street',
  'parking-parallel': 'street',
  'parking-angled':   'street',
  gutter:             'curb',
  curb:               'curb',
  sidewalk:           'sidewalk',
  treelawn:           'sidewalk',
  lawn:               'sidewalk',
}
