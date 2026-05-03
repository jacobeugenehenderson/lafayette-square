/**
 * TOD channel registry — covers both the Post card (camera/grade)
 * and the Sky & Light card (atmospheric/world). File name is legacy;
 * post-card channels live here too.
 *
 * Each entry defines the editor field schema (TodChannel `fields` prop)
 * and the flat defaults used by the store factory + runtime fallback.
 * Adding a channel = add its FIELDS + DEFAULTS here, wire its action
 * factory call in useCartographStore, and mount its <TodChannel> in
 * CartographPost.jsx (or CartographSkyLight.jsx for atmospherics).
 *
 * Slider ranges should reflect the operator's actual working zone
 * (mirrors LampGlow's tuning rationale in CartographSurfaces).
 */

export const BLOOM_FIELDS = [
  { key: 'intensity', label: 'Intensity',           min: 0,   max: 3, step: 0.05 },
  { key: 'threshold', label: 'Luminance threshold', min: 0.1, max: 1, step: 0.05 },
  { key: 'smoothing', label: 'Threshold smoothing', min: 0,   max: 1, step: 0.05 },
]
export const BLOOM_FLAT_DEFAULTS = { intensity: 0.5, threshold: 0.85, smoothing: 0.4 }
export const BLOOM_FIELD_KEYS = BLOOM_FIELDS.map(f => f.key)

// Lighting floor — operator-facing mood axes, not mechanical knobs.
// Sun + moon stay physics-driven (PrimaryOrb/SecondaryOrb in StageSky).
// These two channels bias the *atmosphere between bodies*: ambient color
// + ambient/hemi intensity. See HANDOFF-sky-and-light.md.

// Warmth: 0 = cool, 1 = warm, 0.5 = neutral. Biases ambient + hemi-sky
// color toward a warm or cool reference; physics baseline still drives
// most of the color. Max bias depth is bounded inside StageSky.
export const WARMTH_FIELDS = [
  { key: 'value', label: 'Warmth (cool ↔ warm)', min: 0, max: 1, step: 0.02 },
]
export const WARMTH_FLAT_DEFAULTS = { value: 0.5 }
export const WARMTH_FIELD_KEYS = ['value']

// Fill: shadow lift via FilmGrade's existing uToe. 0 = distinct (deep
// shadows), 1 = physics as-is (today's uToe = 0.28), 2 = soft (lifted
// shadows). Piecewise mapping to uToe inside the FilmGrade update.
export const FILL_FIELDS = [
  { key: 'value', label: 'Fill (distinct ↔ soft)', min: 0, max: 2, step: 0.05 },
]
export const FILL_FLAT_DEFAULTS = { value: 1.0 }
export const FILL_FIELD_KEYS = ['value']

// Exposure: drives FilmGrade's existing uExposure uniform directly.
// Default 0.95 matches the legacy envState.exposure so unauthored Looks
// are visually unchanged.
export const EXPOSURE_FIELDS = [
  { key: 'value', label: 'Exposure', min: 0, max: 2, step: 0.02 },
]
export const EXPOSURE_FLAT_DEFAULTS = { value: 0.95 }
export const EXPOSURE_FIELD_KEYS = ['value']

// AO: three knobs on the existing N8AO post effect. Defaults match the
// legacy Environment > Ambient Occlusion sliders.
export const AO_FIELDS = [
  { key: 'radius',         label: 'Radius',           min: 1, max: 30, step: 0.5  },
  { key: 'intensity',      label: 'Intensity',        min: 0, max: 5,  step: 0.1  },
  { key: 'distanceFalloff', label: 'Distance falloff', min: 0, max: 1,  step: 0.05 },
]
export const AO_FLAT_DEFAULTS = { radius: 15, intensity: 2.5, distanceFalloff: 0.3 }
export const AO_FIELD_KEYS = AO_FIELDS.map(f => f.key)

// Mist (Sky & Light card) — colorable distance fog. Density slider is
// normalized 0–1 for UX; runtime maps to FogExp2 density via × 0.005.
// Default density 0.03 → 0.00015 actual, matches the previous hardcoded
// FogExp2 baseline. Color is a literal hex (no auto/inherit yet);
// previously fog color tracked horizonColor — small regression for
// unauthored Looks, will revisit if operators miss it.
export const MIST_FIELDS = [
  { key: 'density', label: 'Density',           min: 0, max: 1, step: 0.01 },
  { key: 'color',   label: 'Color', type: 'color' },
]
export const MIST_FLAT_DEFAULTS = { density: 0.03, color: '#9dc5e0' }
export const MIST_FIELD_KEYS = MIST_FIELDS.map(f => f.key)
export const MIST_DENSITY_SCALE = 0.005

// Halo (Sky & Light card) — colorable horizon-band tint via the existing
// AerialPerspective post effect. Strength default 0.12 matches the
// previous envState.hazeStrength baseline; runtime scales by sun
// altitude (dayFactor) on top so halo doesn't fire at night. Color
// default is a desaturated cool horizon tone — small regression from
// the previous "halo color follows sky horizonColor" behavior; operator
// now owns it. Same primitive shape as Mist (color + scalar).
export const HALO_FIELDS = [
  { key: 'strength', label: 'Strength', min: 0, max: 0.5, step: 0.01 },
  { key: 'color',    label: 'Color',    type: 'color' },
]
export const HALO_FLAT_DEFAULTS = { strength: 0.12, color: '#b8c8d8' }
export const HALO_FIELD_KEYS = HALO_FIELDS.map(f => f.key)

// Constellations (Sky & Light, CELESTIAL group) — binary on/off; the
// resolver lerps between slots so animator-driven fade still works.
// Runtime also multiplies by nightFactor (no stars in daytime).
// Mounted in Hero + Street (not Browse). Default off.
export const CONSTELLATIONS_FIELDS = [
  { key: 'value', label: 'Render', type: 'toggle' },
]
export const CONSTELLATIONS_FLAT_DEFAULTS = { value: 0 }
export const CONSTELLATIONS_FIELD_KEYS = ['value']

// Lighting unit — 4 single-value channels that act as TOD-driven
// intensity multipliers on the existing scene lights in StageSky.jsx.
// Defaults = 1.0 (no modulation; current behavior preserved). Operator
// authors 0 at Night to drop world lighting; existing color physics
// (sun/moon temperature, hemi gradient) stay untouched.
export const AMBIENT_FIELDS  = [{ key: 'value', label: 'Ambient',     min: 0, max: 2, step: 0.02 }]
export const AMBIENT_FLAT_DEFAULTS  = { value: 1.0 }
export const AMBIENT_FIELD_KEYS  = ['value']
export const HEMI_FIELDS     = [{ key: 'value', label: 'Hemisphere',  min: 0, max: 2, step: 0.02 }]
export const HEMI_FLAT_DEFAULTS     = { value: 1.0 }
export const HEMI_FIELD_KEYS     = ['value']
export const DIRSUN_FIELDS   = [{ key: 'value', label: 'Sun light',   min: 0, max: 2, step: 0.02 }]
export const DIRSUN_FLAT_DEFAULTS   = { value: 1.0 }
export const DIRSUN_FIELD_KEYS   = ['value']
export const DIRMOON_FIELDS  = [{ key: 'value', label: 'Moon light',  min: 0, max: 2, step: 0.02 }]
export const DIRMOON_FLAT_DEFAULTS  = { value: 1.0 }
export const DIRMOON_FIELD_KEYS  = ['value']

// Neon glow (Sky & Light, ATMOSPHERE group) — group of 3 sharing one TOD
// timeline. Each is a 0–1 float multiplied into the corresponding mask in
// NeonBands' fragment shader. Hue per place comes from the category color
// (per-instance attribute, not animated). See HANDOFF-neon.md §"Render
// model — three coupled emissive layers". Defaults are off (flat 0) so an
// unauthored Look ships dark; operator dials warm-up across the day.
export const NEON_FIELDS = [
  { key: 'core',  label: 'Hot core',          min: 0, max: 1, step: 0.02 },
  { key: 'tube',  label: 'Tube glow',         min: 0, max: 1, step: 0.02 },
  { key: 'bleed', label: 'Atmospheric bleed', min: 0, max: 1, step: 0.02 },
]
export const NEON_FLAT_DEFAULTS = { core: 0, tube: 0, bleed: 0 }
export const NEON_FIELD_KEYS = NEON_FIELDS.map(f => f.key)

// Milky Way (Sky & Light, CELESTIAL group) — binary on/off. Cross-slot
// fade comes from the resolver's lerp between authored slots, not from
// dialing a slider. Runtime multiplies by nightFactor so it's hidden
// during daylight regardless. Default off (0). Mounted in all shots.
export const MILKYWAY_FIELDS = [
  { key: 'value', label: 'Render', type: 'toggle' },
]
export const MILKYWAY_FLAT_DEFAULTS = { value: 0 }
export const MILKYWAY_FIELD_KEYS = ['value']
