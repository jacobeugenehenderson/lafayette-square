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

// Brackets attenuated to the realistic working zone + finer intervals (2026-06-21,
// slider-range principle — scratch/AUDIT-slider-ranges.md). Before, the useful
// range was squished into the extremes ("only shows at max/min"): intensity's
// realistic zone is ≤~2 (2–3 blows out), and threshold's top (>~0.9) is a dead
// "nothing blooms" plateau since the scene's bright pixels sit lower. Defaults
// kept in-range so baked Looks don't move. Intensity ceiling opened WIDE (→6,
// 2026-06-27, Jacob): at max-3 + threshold-0 the look was "nice" but still
// climbing, so the meaningful intensity/threshold zone sits higher than the old
// cap — open it up to FIND that zone by eye, then RE-CAP to the real working
// range (slider-range principle). Default 0.5 stays in-range; baked Looks unmoved. ⚠️ If out-of-box bloom reads as ~invisible, the lever is the
// THRESHOLD DEFAULT (0.85, near the dead zone) — lowering it changes baked Looks,
// so that's a separate eye call.
export const BLOOM_FIELDS = [
  { key: 'intensity', label: 'Intensity',           min: 0, max: 6,   step: 0.02 },
  { key: 'threshold', label: 'Luminance threshold', min: 0, max: 0.9, step: 0.01 },
  // Spread: tilt the glow tight↔broad across the pyramid rungs (energy-preserving,
  // so it doesn't change overall brightness — intensity stays independent). 0 =
  // tight crisp points/edges, 0.5 = the plain sum (today), 1 = wide soft halo.
  // (Replaces the old "Threshold smoothing" knee, which was near-dead on a
  // band-pass source — see CustomBloom.jsx.)
  { key: 'spread',    label: 'Spread',              min: 0, max: 1,   step: 0.02 },
  // Warm ↔ Cool tint of the glow (0 cool · 0.5 neutral · 1 warm). Default
  // neutral so existing Looks are unchanged; dial cool to recover the look the
  // blur→threshold mechanism warmed (CustomBloom.jsx, luminance-preserving).
  { key: 'warmCool',  label: 'Cool ↔ Warm',         min: 0, max: 1,   step: 0.02 },
]
export const BLOOM_FLAT_DEFAULTS = { intensity: 0.5, threshold: 0.85, spread: 0.5, warmCool: 0.5 }
export const BLOOM_FIELD_KEYS = BLOOM_FIELDS.map(f => f.key)

// DoF / Focus (Post card) — single-focal romance depth-of-field (RomanceDoF.jsx,
// HANDOFF-real-dof). Operator-facing INTUITIVE knobs: `focus` = how far the SHARP
// near zone extends from the camera (sharp out to here); `blur` = how much the
// mid/far field melts beyond it (the LoD cover); `heroBlur` = the Arch's own
// gentle softening (a little, like IRL — independent of the melt); `softness`
// folds the near feather + ramp into one gentleness dial. The hero's DISTANCE is
// not a knob — the consumer anchors the pocket to the baked Arch distance.
// `enabled` default 0 (off) so unauthored Looks are unchanged.
export const DOF_FIELDS = [
  { key: 'enabled',  label: 'On',             type: 'toggle' },
  { key: 'blur',     label: 'Blur',           min: 0, max: 1,   step: 0.02 },
  // focus = the near sharp distance (sharp from the camera out to here); the
  // mid/far melts beyond it. Pushing it OUT extends the sharp zone (not backwards).
  { key: 'focus',    label: 'Focus distance', min: 5, max: 600, step: 5    },
  { key: 'heroBlur', label: 'Hero softness',  min: 0, max: 1,   step: 0.02 },
  { key: 'softness', label: 'Softness',       min: 0, max: 1,   step: 0.02 },
]
export const DOF_FLAT_DEFAULTS = { enabled: 0, blur: 0.6, focus: 120, softness: 0.5, heroBlur: 0.15 }
export const DOF_FIELD_KEYS = DOF_FIELDS.map(f => f.key)

// Lighting floor — operator-facing mood axes, not mechanical knobs.
// Sun + moon stay physics-driven (PrimaryOrb/SecondaryOrb in CelestialBodies).
// These two channels bias the *atmosphere between bodies*: ambient color
// + ambient/hemi intensity. See HANDOFF-sky-and-light.md.

// Warmth: 0 = cool, 1 = warm, 0.5 = neutral. Biases ambient + hemi-sky
// color toward a warm or cool reference; physics baseline still drives
// most of the color. Max bias depth is bounded inside CelestialBodies.
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
// previous envState.hazeStrength baseline. (The hidden sun-altitude
// `dayFactor` gate was removed 2026-06-21 — strength now renders directly;
// author any day→night falloff via the Halo TOD curve.) Color
// default is a desaturated cool horizon tone — small regression from
// the previous "halo color follows sky horizonColor" behavior; operator
// now owns it. Same primitive shape as Mist (color + scalar).
// Strength max opened 0.5 → 1.0 (2026-06-21): at 1.0 the horizon band fully
// reaches the haze color where it peaks — "enough to really see it / overdo
// it on purpose for style," per the slider-range principle (scratch/AUDIT-slider-ranges.md).
// Default stays 0.12 (the legacy envState.hazeStrength baseline) so unauthored
// Looks are unchanged; the wider ceiling is headroom, not a behavior change.
export const HALO_FIELDS = [
  { key: 'strength', label: 'Strength', min: 0, max: 1.0, step: 0.01 },
  { key: 'color',    label: 'Color',    type: 'color' },
]
export const HALO_FLAT_DEFAULTS = { strength: 0.12, color: '#b8c8d8' }
export const HALO_FIELD_KEYS = HALO_FIELDS.map(f => f.key)

// Sky Layer Gain (Sky & Light, ATMOSPHERE group) — a single exposure/gain
// multiplier on the GradientSky dome's composed color (bands + sun/moon
// glow + horizon scatter). Think of it as exposure scoped to the sky layer
// only: global `exposure` dims the whole frame (buildings + ground + sky),
// this dims JUST the dome, so deep night can go dark while lamps + lit
// windows stay where you authored them. 1.0 = unchanged (the default, so
// unauthored Looks render identically). The canonical use is a TOD curve
// that holds 1.0 through the day and dips toward ~0.2 at Night — it owns
// "how dark is the night sky." Generalizes the planetarium `dimFactor`
// (0.4) already in CelestialBodies. Stars are a SEPARATE object (their own
// astronomyAlpha) and are intentionally NOT scaled here — dimming the dome
// makes them read better. Range allows >1 so an operator can also lift a
// flat/overcast dome. See HANDOFF-sky-and-light.md + the deep-night thread
// in cartograph/NOTES.md (2026-06-07).
export const SKY_GAIN_FIELDS = [
  { key: 'value', label: 'Sky layer gain', min: 0, max: 2, step: 0.02 },
]
export const SKY_GAIN_FLAT_DEFAULTS = { value: 1.0 }
export const SKY_GAIN_FIELD_KEYS = ['value']

// Constellations (Sky & Light, CELESTIAL group) — binary on/off; the
// resolver lerps between slots so animator-driven fade still works.
// Runtime also multiplies by nightFactor (no stars in daytime).
// Mounted in Hero + Street (not Browse). Default off.
export const CONSTELLATIONS_FIELDS = [
  { key: 'value', label: 'Render', type: 'toggle' },
]
export const CONSTELLATIONS_FLAT_DEFAULTS = { value: 0 }
export const CONSTELLATIONS_FIELD_KEYS = ['value']

// Stars (Sky & Light, CELESTIAL) — operator multiplier on STAR VISIBILITY, on top
// of the physical astronomyAlpha (the sun-altitude night fade). 1.0 = as-is; raise
// to make the night sky pop, author a TOD curve to bring stars up at night, or 0
// to hide them. Default 1.0 (no-op → unauthored Looks unchanged). The KIT way to
// tune stars — an authored knob, not a hardcoded ramp.
export const STARS_FIELDS = [
  { key: 'brightness', label: 'Star brightness', min: 0, max: 3, step: 0.02 },
]
export const STARS_FLAT_DEFAULTS = { brightness: 1.0 }
export const STARS_FIELD_KEYS = ['brightness']

// Lighting unit — 4 single-value channels that act as TOD-driven
// intensity multipliers on the existing scene lights in CelestialBodies.jsx.
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
// model — three coupled emissive layers". Defaults are flat-on (1/1/1)
// per HANDOFF-neon.md: at Night the canonical curve has all three full.
// Both shipped Looks (lafayette-square, toy) author exactly 1/1/1 flat
// and rely on LafayetteScene's `openPlaces` business-hours filter to
// gate visibility — neon shines all day in the shader, but only the
// open-this-minute places enter the merged mesh. Operator can still
// animate a slower warm-up via TOD slots; the flat default matches
// observed authoring intent rather than the earlier "ship dark" stance.
// Neon — Gaussian intensity masks (TOD-animatable) + emissive
// brightness multiplier + tube radius. The shader's three Gaussian
// widths (core/tube/bleed) paint the realistic neon look authored in
// the 2026-05-13 work session; `emissive` is the master brightness
// lever. `tubeRadius` (added 2026-05-18) is operator-authored geometry
// — animatable too, though each authored slot triggers a merged-mesh
// rebuild rather than a shader uniform write (see neonState.js + the
// NeonBands geometry useFrame). Wall offset and roof drop are still
// physically motivated and live as constants in NeonBands.jsx.
export const NEON_FIELDS = [
  { key: 'core',       label: 'Hot core',          min: 0,   max: 1,   step: 0.02 },
  { key: 'tube',       label: 'Tube glow',         min: 0,   max: 1,   step: 0.02 },
  { key: 'bleed',      label: 'Atmospheric bleed', min: 0,   max: 1,   step: 0.02 },
  { key: 'emissive',   label: 'Emissive',          min: 0.5, max: 8,   step: 0.1  },
  { key: 'tubeRadius', label: 'Tube radius',       min: 0.1, max: 3.0, step: 0.05 },
]
export const NEON_FLAT_DEFAULTS = { core: 1, tube: 1, bleed: 1, emissive: 4, tubeRadius: 1.0 }
export const NEON_FIELD_KEYS = NEON_FIELDS.map(f => f.key)

// Arch (Hero & Horizon card — SC.7) — Gateway Arch placement / transform.
// Single non-TOD channel (the landmark doesn't drift through the day).
// Field names drop the redundant `arch` prefix that lived on the legacy
// archState (e.g., archDistance → distance). The uplights moved to their
// own TOD-animatable `archLight` channel (2026-06-22) so the *lighting* can
// ride a day→night curve while placement stays put.
export const ARCH_FLAT_DEFAULTS = {
  distance: 1050,
  bearingX: 0.9487,
  bearingZ: -0.3163,
  scale: 1.3,
  rotation: 1.36,
  yOffset: 0,
  // Foot fade — meters below world y=0 at which the arch alpha reaches zero.
  footFade: 30,
}
export const ARCH_FIELD_KEYS = Object.keys(ARCH_FLAT_DEFAULTS)

// Arch Lighting (Hero & Horizon card) — the cross-aimed foot uplights that
// wash the arch from the feet up. TOD-animatable group channel so the wash
// can warm up at dusk and fade by day (rides the same TodChannel UX as
// Bloom/Neon). Operator-facing units: intensity (0 = off), color (hex),
// cone = full-bright half-angle in DEGREES (the consumer converts to cos),
// reach = metres the wash carries up the arch. L and R independent so the
// operator can desync. Default intensity 0 → unauthored Looks render with
// no uplight (byte-identical to the pre-split arch channel).
export const ARCHLIGHT_FIELDS = [
  { key: 'uplightL_intensity', label: 'Uplight L · intensity', min: 0, max: 4,   step: 0.05 },
  { key: 'uplightL_color',     label: 'Uplight L · color', type: 'color' },
  { key: 'uplightL_cone',      label: 'Uplight L · cone°',     min: 5, max: 80,  step: 1    },
  { key: 'uplightL_reach',     label: 'Uplight L · reach',     min: 50, max: 600, step: 5   },
  { key: 'uplightR_intensity', label: 'Uplight R · intensity', min: 0, max: 4,   step: 0.05 },
  { key: 'uplightR_color',     label: 'Uplight R · color', type: 'color' },
  { key: 'uplightR_cone',      label: 'Uplight R · cone°',     min: 5, max: 80,  step: 1    },
  { key: 'uplightR_reach',     label: 'Uplight R · reach',     min: 50, max: 600, step: 5   },
]
export const ARCHLIGHT_FLAT_DEFAULTS = {
  uplightL_intensity: 0, uplightL_color: '#ffd6a8', uplightL_cone: 35, uplightL_reach: 220,
  uplightR_intensity: 0, uplightR_color: '#ffd6a8', uplightR_cone: 35, uplightR_reach: 220,
}
export const ARCHLIGHT_FIELD_KEYS = ARCHLIGHT_FIELDS.map(f => f.key)

// Hydrate the archLight channel from a design.json, carrying the LEGACY
// shape where the uplights lived on the `arch` channel with the cone in
// RADIANS (pre-2026-06-22 split). Self-contained (no animatedParam dep) so
// both the store hydrate and the headless bake can share it. Returns the
// canonical { values } (or the animated channel verbatim if already split).
export function migrateArchLight(design) {
  const RAD2DEG = 180 / Math.PI
  const fill = (src) => {
    const out = {}
    for (const k of ARCHLIGHT_FIELD_KEYS) {
      const def = ARCHLIGHT_FLAT_DEFAULTS[k]
      const v = src?.[k]
      if (typeof def === 'string') out[k] = (typeof v === 'string' && v[0] === '#') ? v : def
      else out[k] = v == null ? def : Number(v)
    }
    return out
  }
  // Already split out (new shape).
  if (design?.archLight?.animated) return design.archLight
  if (design?.archLight?.values) return { values: fill(design.archLight.values) }
  // Legacy: uplights on the arch channel, cone in radians.
  const a = design?.arch?.values
  if (a && ('uplightL_intensity' in a || 'uplightR_intensity' in a)) {
    const carried = { ...a }
    if (a.uplightL_cone != null) carried.uplightL_cone = Number(a.uplightL_cone) * RAD2DEG
    if (a.uplightR_cone != null) carried.uplightR_cone = Number(a.uplightR_cone) * RAD2DEG
    return { values: fill(carried) }
  }
  return { values: { ...ARCHLIGHT_FLAT_DEFAULTS } }
}

// Horizon (Hero & Horizon card — SC.7) — ground disc radius + feathering.
// Conceptually distinct from the arch landmark itself, so a separate
// channel. 3 fields.
export const HORIZON_FLAT_DEFAULTS = {
  radius: 3750,
  fadeInner: 900,
  fadeOuter: 3750,
}
export const HORIZON_FIELD_KEYS = Object.keys(HORIZON_FLAT_DEFAULTS)

// Shots (Hero & Horizon — SC.5) — per-shot framing knobs that bake into
// the slab. Authored-only knobs: FOVs, Browse bounds + padding, Street
// eye height. Runtime inputs (Browse altitude, Hero target, Street
// position/target) explicitly NOT here — those come from
// computeBrowseAltitude(aspect) / Hero subject centroid / double-click
// handler respectively (hardwires-come-out doctrine, category 3).
// Single flat-value channel (not TOD-animated; FOV doesn't change
// through the day). Defaults match the legacy module-scope SHOTS const
// verbatim so unauthored Looks are byte-identical to pre-SC.5.
export const SHOTS_FLAT_DEFAULTS = {
  browse: { fov: 45, padding: 1.05, bounds: { cx: 95, cz: -158, w: 1292, h: 1025 } },
  hero:   { fov: 22 },
  street: { fov: 75, eyeHeight: 1.73 },
}
// Top-level keys for the factory's flat-tuple shape. Shots is hand-rolled
// (not factory-driven) because its values are nested per-shot objects,
// not the flat scalar tuples the factory assumes — flagging here for
// future readers.
export const SHOTS_FIELD_KEYS = ['browse', 'hero', 'street']

// browseHeading (Hero & Horizon — SC.5) — site-wide cosmetic
// screen-orientation for the overhead Browse shot. 0° = compass-N up.
// Single scalar; previously persisted via localStorage, promoted to the
// slab so the operator's preferred orientation transmits per-instance.
export const BROWSE_HEADING_FLAT_DEFAULTS = { value: 0 }
export const BROWSE_HEADING_FIELD_KEYS = ['value']

// Grade (Post card) — FilmGrade's grade-side knobs that ride on top of
// the time-of-day color physics. Promoted from envState 2026-05-13
// (SC.2 follow-up) so the operator's grade authoring rounds-trips
// through bake → scene.json into production. Defaults match the legacy
// envState.grade* values verbatim, so unauthored Looks are unchanged.
// `toe` is the literal FilmGrade uniform; the operator-facing Fill
// channel (FILL_FIELDS) is a separate piecewise mapping that overrides
// toe at apply time for the "distinct ↔ soft shadows" axis.
// NB: `toe` is intentionally NOT a panel field — the Fill (Shadow lift) channel
// owns the FilmGrade `uToe` uniform and overrides it at apply time, so a Grade
// Toe slider would be DEAD (does nothing). Kept in FLAT_DEFAULTS for data
// back-compat + as a future explicit-override surface; not shown. (Phase A
// taxonomy cleanup, 2026-06-30 — "kill the control that lies.")
export const GRADE_FIELDS = [
  { key: 'contrast',   label: 'Contrast',   min: 0,   max: 1,   step: 0.02 },
  { key: 'saturation', label: 'Saturation', min: 0.5, max: 1.5, step: 0.05 },
  // Brightness = the B of HSB (Saturation above is the S). A LIFT, not a gain:
  // raises the black floor (c += B·(1−c)) so crushed dark surfaces read while
  // the white point stays put. Exposure is the multiplicative gain; this is the
  // additive lift exposure can't do (Jacob 2026-06-30). Default 0 = neutral.
  { key: 'brightness', label: 'Brightness', min: 0,   max: 0.6, step: 0.01 },
  { key: 'vignette',   label: 'Vignette',   min: 0,   max: 2,   step: 0.1  },
]
export const GRADE_FLAT_DEFAULTS = { contrast: 0.42, toe: 0.28, saturation: 1.1, brightness: 0, vignette: 1.0 }
export const GRADE_FIELD_KEYS = GRADE_FIELDS.map(f => f.key)

// Grain (Post card) — single-value scale multiplier on the FilmGrain
// noise. Default 1.0 matches the legacy envState.grainScale.
export const GRAIN_FIELDS = [
  { key: 'scale', label: 'Scale', min: 0, max: 3, step: 0.1 },
]
export const GRAIN_FLAT_DEFAULTS = { scale: 1.0 }
export const GRAIN_FIELD_KEYS = ['scale']

// SMAA antialiasing (Post card) — binary on/off. Mounts the SMAA post pass on
// both render tiers (it is mobile's ONLY AA — Canvas MSAA is off there). A
// static per-Look toggle; `value > 0.5` = on. Default ON.
export const SMAA_FIELDS = [
  { key: 'value', label: 'On', type: 'toggle' },
]
export const SMAA_FLAT_DEFAULTS = { value: 1 }
export const SMAA_FIELD_KEYS = ['value']

// Shadow (Post card) — SoftShadows parameters. Promoted from envState.
// Size is the kernel radius; samples is the per-pixel sample count.
// Defaults match the legacy envState.shadowSize / shadowSamples.
export const SHADOW_FIELDS = [
  { key: 'size',    label: 'Size',    min: 10, max: 100, step: 1 },
  { key: 'samples', label: 'Samples', min: 4,  max: 32,  step: 1 },
]
export const SHADOW_FLAT_DEFAULTS = { size: 52, samples: 16 }
export const SHADOW_FIELD_KEYS = SHADOW_FIELDS.map(f => f.key)

// Clouds (Sky & Light, ATMOSPHERE group — SC.6) — atmospheric state
// channel for the future <Atmosphere /> volumetric runtime
// (Meteorologist v3). v1 keeps the procedural CloudDome as the actual
// renderer; this channel is forward-compat scaffolding so v3 swaps in
// mechanically. `preset: 'auto'` means "let the Almanac decide based on
// live weather + time-of-day" (the Meteorologist default workflow);
// any other value pins a specific Teapot preset id from
// public/clouds/presets.json. `overrides` is a future hook for
// per-Look shader-level overrides on top of the chosen preset; null
// today. No Stage UI for v1 (the Clouds TodChannel is v3-dependent
// per meteorologist/STAGE_MIGRATION.md). Doctrine:
// slab-carries-full-authored-product, hardwires-come-out (category 3:
// live weather is runtime adaptation, preset selection is authored).
export const CLOUDS_FLAT_DEFAULTS = {
  preset: 'auto',
  overrides: null,
}
export const CLOUDS_FIELD_KEYS = Object.keys(CLOUDS_FLAT_DEFAULTS)

// Lamp Glow (Lamps card) — the per-surface strength of the warm wash the
// street lamps cast at night, one TOD-animatable group sharing a timeline.
// `grass` = amber tint on lawn/treelawn/median, `trees` = canopy under-lamp
// emissive, `pool` = the radial light pool on the ground beneath each lamp.
// Ranges reflect the operator's working zone (slider-range principle).
// Consumed via the shared lamp-glow uniforms (LampGlowDriver / LampGlowPump)
// — see src/components/PostProcessing.jsx. Defaults match the legacy
// lampGlowState so unauthored Looks are unchanged.
// Consolidated 2026-06-22 to two knobs: one Pool (the warm light pool on ALL
// ground — grass/asphalt/sidewalk — from the baked pool map) + Canopy (tree
// under-glow). The old grass-only tint is folded into the pool. `grass` is
// kept in the defaults for back-compat with older design.json but is no
// longer a panel field nor consumed by any shader.
// The ground POOL intensity is no longer a field here — it's driven by the
// Lantern's output (StreetLights: pool = lantern Brightness × the dusk→night
// ramp), so the Lantern Brightness slider controls the pool. This channel now
// carries only the tree CANOPY under-glow. (`grass`/`pool` kept in defaults for
// back-compat with older design.json; unused as panel fields.)
export const LAMPGLOW_FIELDS = [
  { key: 'trees', label: 'Tree canopy under-glow', min: 0, max: 0.1, step: 0.005 },
]
export const LAMPGLOW_FLAT_DEFAULTS = { grass: 0, trees: 0, pool: 1.0 }
export const LAMPGLOW_FIELD_KEYS = LAMPGLOW_FIELDS.map(f => f.key)

// Lantern (Lamps card) — the lamp's LIGHT SOURCE itself (the lantern): the
// glass-panel emissive + the warm glow orb/halo + the bulb dot. TOD-animatable
// group channel so the lantern's brightness/colour can ride the day. The
// automatic dusk→night turn-on (the sunAlt ramp in StreetLights) STAYS as the
// base on/off; this channel is the operator's master Brightness × that ramp,
// the Glow (wide halo strength), and the Colour. Defaults reproduce today's
// hardwired look (brightness 1, glow 1, #fff2e0) so an unauthored Look is
// unchanged. Distinct from `lampGlow` (the GROUND pool + tree canopy) — this is
// the lantern's own emission. (hardwires-come-out; sibling of `archLight`.)
// Brightness + Glow only — the lamp's *colour* stays a single source
// (`layerColors.lamp`, the Surfaces lamp swatch), which also drives the ground
// pool's colour (the pool IS the lantern's light on the ground). Defaults
// reproduce today's hardwired output.
export const LANTERN_FIELDS = [
  { key: 'intensity', label: 'Brightness',  min: 0, max: 2, step: 0.02 },
  { key: 'glow',      label: 'Glow (halo)', min: 0, max: 2, step: 0.02 },
]
export const LANTERN_FLAT_DEFAULTS = { intensity: 1.0, glow: 1.0 }
export const LANTERN_FIELD_KEYS = LANTERN_FIELDS.map(f => f.key)

// Milky Way (Sky & Light, CELESTIAL group) — binary on/off. Cross-slot
// fade comes from the resolver's lerp between authored slots, not from
// dialing a slider. Runtime multiplies by nightFactor so it's hidden
// during daylight regardless. Default off (0). Mounted in all shots.
export const MILKYWAY_FIELDS = [
  { key: 'value', label: 'Render', type: 'toggle' },
]
export const MILKYWAY_FLAT_DEFAULTS = { value: 0 }
export const MILKYWAY_FIELD_KEYS = ['value']
