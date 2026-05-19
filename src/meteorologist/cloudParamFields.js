/**
 * Cloud-shader param metadata for the Teacup right rail.
 *
 * One row per param. The Teacup renders one <TodChannel> per row with a
 * single-field group ({ key: 'value', ... }) — the slider widget reads
 * its min/max/step from here, the on-disk channel shape from presets.json.
 *
 * Render order: shape first (what the cloud is), lighting middle (how it
 * picks up the sun), motion last (how it drifts). Group label is used to
 * insert a thin section divider between groups.
 */

export const CLOUD_PARAM_FIELDS = [
  { key: 'coverage',       label: 'Coverage',       min: 0,    max: 1,     step: 0.01,  group: 'shape' },
  { key: 'density',        label: 'Density',        min: 0,    max: 2,     step: 0.01,  group: 'shape' },
  { key: 'thickness',      label: 'Thickness (m)',  min: 0,    max: 18000, step: 50,    group: 'shape' },
  { key: 'baseAlt',        label: 'Base alt (m)',   min: 0,    max: 15000, step: 50,    group: 'shape' },
  { key: 'warpFreq',       label: 'Warp freq',      min: 0,    max: 0.01,  step: 0.0001,group: 'shape' },
  { key: 'warpAmp',        label: 'Warp amp (m)',   min: 0,    max: 2000,  step: 10,    group: 'shape' },
  { key: 'noiseSeed',      label: 'Noise seed',     min: 0,    max: 10000, step: 1,     group: 'shape' },
  { key: 'octaves',        label: 'Octaves',        min: 1,    max: 8,     step: 1,     group: 'shape' },
  { key: 'sunScatter',     label: 'Sun scatter',    min: 0,    max: 3,     step: 0.01,  group: 'lighting' },
  { key: 'ambientFloor',   label: 'Ambient floor',  min: 0,    max: 1,     step: 0.01,  group: 'lighting' },
  { key: 'edgeSilver',     label: 'Edge silver',    min: 0,    max: 2,     step: 0.01,  group: 'lighting' },
  { key: 'shadowStrength', label: 'Shadow str',     min: 0,    max: 2,     step: 0.01,  group: 'lighting' },
  { key: 'drift',          label: 'Drift',          min: 0,    max: 5,     step: 0.01,  group: 'motion' },
]
