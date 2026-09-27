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
// mid/far field melts beyond it (the LoD cover); `heroBlur` = softening at the
// point the camera aims at (dofDriver: the controls' target, in Hero and Street);
// `softness` folds the near feather + ramp into one gentleness dial.
// ⭐ NO On SWITCH: Blur 0 is off (Jacob, 2026-09-26). The old `enabled` only decided whether the pass was
// mounted — any key On mounted it, and then EVERY key's Blur applied, Off keys included. migrateDof folds it away.
// Default Blur 0 so an unauthored Look is unchanged (off).
// ⭐ RELATIVE, never metres (Jacob, 2026-09-27): Focus is × the distance to what the camera looks at (1 = sharp there),
// and blur grows in front and behind by relative distance — the same numbers frame any town (RomanceDoF.jsx).
export const DOF_FIELDS = [
  { key: 'blur',     label: 'Blur',              min: 0,    max: 1, step: 0.02 },
  { key: 'focus',    label: 'Focus (× distance to the focus point)', min: 0.25, max: 2, step: 0.01 },
  { key: 'heroBlur', label: 'Softness at focus', min: 0,    max: 1, step: 0.02 },
  { key: 'softness', label: 'Depth',             min: 0,    max: 1, step: 0.02 },
]
export const DOF_FLAT_DEFAULTS = { blur: 0, focus: 1, softness: 0.5, heroBlur: 0 }
/**
 * Fold a legacy `enabled` into Blur so every Look renders exactly as it did. What rendered before: the pass
 * mounted iff ANY key (or the flat value) had enabled > 0.5, and then every key's Blur applied regardless of its
 * own `enabled`. So: some key on → drop `enabled`, keep every Blur; none on → Blur 0 everywhere (it never showed).
 * Idempotent; a channel with no `enabled` anywhere is returned as is.
 */
export function migrateDof(ch) {
  if (!ch || typeof ch !== 'object' || !ch.values || typeof ch.values !== 'object') return ch
  const animated = ch.animated === 'tod'
  const keys = animated ? Object.values(ch.values) : [ch.values]
  if (!keys.some(v => v && 'enabled' in v)) return ch
  const anyOn = keys.some(v => (v?.enabled ?? 0) > 0.5)
  const fold = (v) => { const { enabled, ...rest } = v || {}; return anyOn ? rest : { ...rest, blur: 0 } }
  return animated
    ? { ...ch, values: Object.fromEntries(Object.entries(ch.values).map(([k, v]) => [k, fold(v)])) }
    : { ...ch, values: fold(ch.values) }
}
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
  // The white balance's second axis (Jacob, 2026-09-27: sunrise "similar but pinker" than dawn). 0.5 neutral.
  { key: 'tint',  label: 'Tint (green ↔ pink)',  min: 0, max: 1, step: 0.02 },
]
export const WARMTH_FLAT_DEFAULTS = { value: 0.5, tint: 0.5 }
export const WARMTH_FIELD_KEYS = WARMTH_FIELDS.map(f => f.key)

// Shadow crush (`fill` channel): how far FilmGrade's toe pulls the darks toward black. 0 = none (the image as
// rendered), 1 = full (the darkest tones go to black); FilmGrade's `uToe` = 1 − crush. It only ever darkens, so it
// was a crush control running backwards under the name "Shadow lift" (0–2, 2 = none). migrateFill converts.
export const FILL_FIELDS = [
  { key: 'crush', label: 'Crush', min: 0, max: 1, step: 0.01 },
]
export const FILL_FLAT_DEFAULTS = { crush: 0.72 }
export const FILL_FIELD_KEYS = ['crush']
/** A group channel with `fold` applied to every stored value object that `test` accepts (each key, or the flat one). */
function foldValues(ch, test, fold) {
  if (!ch || typeof ch !== 'object' || !ch.values || typeof ch.values !== 'object') return ch
  const animated = ch.animated === 'tod'
  const keys = animated ? Object.values(ch.values) : [ch.values]
  if (!keys.some(v => v && typeof v === 'object' && test(v))) return ch
  const f = (v) => (v && typeof v === 'object' && test(v) ? fold(v) : v)
  return animated
    ? { ...ch, values: Object.fromEntries(Object.entries(ch.values).map(([k, v]) => [k, f(v)])) }
    : { ...ch, values: f(ch.values) }
}
/** Legacy Shadow lift `value` (0–2, piecewise onto uToe) → `crush` = 1 − that uToe, so every Look renders as it did. Idempotent. */
export function migrateFill(ch) {
  const toe = (v) => (v <= 1 ? v * 0.28 : 0.28 + (v - 1) * 0.72)
  return foldValues(ch, v => 'value' in v && !('crush' in v),
    ({ value, ...rest }) => ({ ...rest, crush: +(1 - toe(Number(value))).toFixed(3) }))
}

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
  // Min 0.05, not 0: N8AO divides by it in the denoiser, and at 0 it also switches AO off (Intensity 0 is the off).
  { key: 'distanceFalloff', label: 'Distance falloff', min: 0.05, max: 1,  step: 0.05 },
]
export const AO_FLAT_DEFAULTS = { radius: 15, intensity: 2.5, distanceFalloff: 0.3 }
export const AO_FIELD_KEYS = AO_FIELDS.map(f => f.key)

// Mist (Horizon card) — colorable distance fog (FogExp2).
// ⭐ AMOUNT IS SIZED TO THE TOWN: 1 = half the light lost over the town's disc radius, 2 = twice that density (the
// town all but gone), 0 = none — the same number reads the same in every town (Jacob, 2026-09-27: "this should go to 2").
// ⛔ It was a fixed density per metre (0.005 × amount³): the whole useful range sat below ~0.05 on Provincetown's
// hero shot and the slider ran far past a whiteout — a Class D constant (CLAUDE.md Layer 0), right only for a town
// of one size. A town whose size is unknown gets NO fog and a console error, never a guessed one.
export const MIST_FIELDS = [
  { key: 'amount', label: 'Amount', min: 0, max: 2, step: 0.01 },
  { key: 'color',  label: 'Color', type: 'color' },
  // How much of it lies on the water: 0 = clear water, 1 = the water mists like the land.
  { key: 'water',  label: 'Over water', min: 0, max: 1, step: 0.01 },
]
export const MIST_FLAT_DEFAULTS = { amount: 0.2, color: '#9dc5e0', water: 0.3 }
export const MIST_FIELD_KEYS = MIST_FIELDS.map(f => f.key)
/** FogExp2 density (1/m) for a Mist amount in a town of `radius` metres. The one mapping — every fog mount reads it.
 *  FogExp2 keeps exp(−(ρd)²) of the light at distance d; amount 1 is the ρ that keeps half at d = radius. */
export function mistFogDensity(amount, radius) {
  const a = Math.max(0, Number(amount) || 0)
  if (a === 0) return 0
  if (!(radius > 0)) return null
  return a * Math.sqrt(Math.LN2) / radius
}

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

// Constellations (Sky & Light, Night Sky) — on/off per time of day (the lerped value switches at 0.5).
// Mounts the overlay in Hero + Street, never Browse, at any hour the key is on. Default off.
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
// `screenFloor`/`screenCeil` (added 2026-07-16) are the SCREEN-RELATIVE size band
// (radius, device px). The tube is built in world meters, so past street level a
// 1 m tube goes sub-pixel — the neon vanishes exactly where the browse/overhead
// shot wants it. The NeonBands vertex shader clamps each tube's on-screen radius
// to [screenFloor, screenCeil]: never thinner than the floor (kills the sub-pixel
// strip far away), never fatter than the ceiling (thins the ~physical hero pipe up
// close), physical in between. Unlike `tubeRadius` these are pure shader uniforms
// (no merged-mesh rebuild). `screenCeil = 0` disables the ceiling.
export const NEON_FIELDS = [
  { key: 'core',        label: 'Hot core',          min: 0,   max: 1,   step: 0.02 },
  { key: 'tube',        label: 'Tube glow',         min: 0,   max: 1,   step: 0.02 },
  { key: 'bleed',       label: 'Atmospheric bleed', min: 0,   max: 1,   step: 0.02 },
  { key: 'emissive',    label: 'Emissive',          min: 0.5, max: 8,   step: 0.1  },
  { key: 'tubeRadius',  label: 'Tube radius',       min: 0.1, max: 3.0, step: 0.05 },
  { key: 'screenFloor', label: 'Screen floor (px)', min: 0,   max: 12,  step: 0.5  },
  { key: 'screenCeil',  label: 'Screen ceiling (px)', min: 0, max: 64,  step: 1    },
]
export const NEON_FLAT_DEFAULTS = { core: 1, tube: 1, bleed: 1, emissive: 4, tubeRadius: 1.0, screenFloor: 2.5, screenCeil: 0 }
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

// Landscape (Hero Controls — the THIRD hero subject kind: a backdrop MESH, not a
// point-to-frame). The per-type controls of a `kind:'landscape'` hero: placement
// (seeded from the geo-anchor at bake, §0.0 overridable) + a snowline elevation
// ramp (knobs, never hardcoded) + a backdrop-only haze trim (independent of the
// hood fog). Non-TOD like the arch — the range doesn't drift; its per-TOD COLOR
// comes free from the light rig + the global `mist` channel. Placement frame:
// world = distance·[bearingX, _, bearingZ]; +x=EAST, +z=SOUTH → NORTH is −z
// (verified from ARCH_FLAT_DEFAULTS' real bearing, not the empty frame memo).
export const LANDSCAPE_FLAT_DEFAULTS = {
  // A. Placement — geo-anchor seeds these at bake (bake-landscape.js); overridable.
  bearingX: 0.18, bearingZ: -0.98, distance: 5400, scale: 1.0, rotation: 0, yOffset: -20,
  // B. Elevation shading / snowline — a KNOB ramp.
  snowline: 1500, snowSoftness: 180, snowColor: '#eef3f7', rockColor: '#6d655a', scrubColor: '#586348',
  // C. Atmosphere — backdrop-only haze trim (the hood fog rides the `mist` channel).
  haze: 0.35, hazeColor: '#bcd0e0',
}
export const LANDSCAPE_FIELD_KEYS = Object.keys(LANDSCAPE_FLAT_DEFAULTS)

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
  return kitDayChannel('archLight')
}


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
// `toe` is the literal FilmGrade uniform; the operator-facing Shadow crush
// channel (FILL_FIELDS) overrides it at apply time (uToe = 1 − crush).
// NB: `toe` is intentionally NOT a panel field — the Shadow crush (`fill`) channel
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


// Shadow (Post card) — SoftShadows parameters.
// ⭐⭐ `size` IS PENUMBRA IN METRES — a real-world width, not a kernel radius.
// It was texels until 2026-09-20, and drei's PCSS still consumes texels
// (softShadows.js: offset = texelSize * 2 * PENUMBRA_FILTER_SIZE), so
// StageShadows converts metres → texels using the ACTIVE SCENE's metres-per-
// texel. ⛔ The old unit only held still because the shadow frustum was
// hardcoded to ±900 for every town: one fixed 0.4395 m/texel. The moment the
// frustum was derived per town, the same authored number meant a different
// real-world softness in each — huron's 23 became an 83 m smear across a town
// whose buildings are 20 m wide, which reads as "no edges at all".
// Stored values were migrated ×(1800/4096) so every town kept its authored look.
export const SHADOW_FIELDS = [
  // Max = the widest penumbra the current Samples can render (townRange.js#penumbraBudgetTexels); above it
  // StageShadows clamps, so a fixed 60 m left most of the travel dead.
  { key: 'size',    label: 'Penumbra', unit: 'm', min: 1, max: 'render.penumbra', step: 0.5 },
  { key: 'samples', label: 'Samples',      min: 4, max: 32, step: 1 },
]
export const SHADOW_FLAT_DEFAULTS = { size: 22.85, samples: 16 }
export const SHADOW_FIELD_KEYS = SHADOW_FIELDS.map(f => f.key)

// Canopy Light (Surfaces → Trees) — how the tree IMPOSTOR CARDS answer to the
// scene's key light. A card is MeshBasicMaterial by design: it cannot join
// three's light rig the way the mesh trees beside it do, so its light response
// is authored here rather than falling out of the rig.
//
// ⛔ `directional` DEFAULTS TO 0, and that is the whole safety property. 0 is the
// historical look — a flat weather dimmer, `ambient + sun·AO`, no direction at all
// — so an unauthored Look and every already-poured town render exactly as they did
// before this channel existed. It is a BLEND, not a toggle: intermediate values are
// meaningful, which is what makes it dialable by eye rather than a cliff.
//
// `gain` is CONTRAST, not brightness: the shader's directional term is
// mean-preserving, so gain redistributes light across a canopy without changing how
// bright the canopy is. `bulge` is how far the card's synthetic normal bends from
// the card plane — 0 is a flat plate, 1 a full hemisphere. It is the term a captured
// normal page would replace, so it is the dial to try before spending pages on one.
export const CANOPY_FIELDS = [
  { key: 'directional', label: 'Directional', min: 0, max: 1,   step: 0.05 },
  { key: 'gain',        label: 'Contrast',    min: 0, max: 2,   step: 0.05 },
  { key: 'bulge',       label: 'Roundness',   min: 0, max: 1.5, step: 0.05 },
]
export const CANOPY_FLAT_DEFAULTS = { directional: 0, gain: 0.85, bulge: 0.9 }
export const CANOPY_FIELD_KEYS = CANOPY_FIELDS.map(f => f.key)

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
// ⭐ BOTH ARE SHARES OF THE LAMP'S OWN OUTPUT (Jacob, 2026-09-26). StreetLights computes that output
// each frame — Lantern Brightness × the dusk→night ramp, exactly 0 by day — and multiplies it by these:
//   · trees — how much of it the canopy takes (× the leaf colour, × each tree's baked share, lampPool.js)
//   · pool  — how strong it lands on every ground surface (groundLamp.js) and on building walls
// So Brightness moves lamp, halo, pools, trees and walls together, and each slider scales one receiver.
// (`grass` stays in the defaults for back-compat with older design.json; no panel field, no reader.)
export const LAMPGLOW_FIELDS = [
  { key: 'pool',   label: 'Light pools', min: 0, max: 4,  step: 0.05 },
  { key: 'radius', label: 'Pool radius', min: 0, max: 1,  step: 0.01 },
  { key: 'centre', label: 'Pool centre (m)', min: 0, max: 4, step: 0.05, scale: 'fixture' },   // the dark circle under the lamp: lamp-sized, not town-sized
  { key: 'trees',  label: 'Trees',       min: 0, max: 20, step: 0.1 },
]
export const LAMPGLOW_FLAT_DEFAULTS = { grass: 0, trees: 1, pool: 1.0, radius: 1.0, centre: 1.2 }
// Pool radius's scale version (animatedParam.js#stampLampGlowRadius): 2 = 0 means off.
export const LAMPGLOW_RADIUS_V = 2
export const LAMPGLOW_FIELD_KEYS = LAMPGLOW_FIELDS.map(f => f.key)

// Lantern (Lamps card) — the lamp's LIGHT SOURCE itself (the lantern): the
// glass-panel emissive + the warm glow orb/halo + the bulb dot. TOD-animatable
// group channel so the lantern's brightness/colour can ride the day. The
// automatic dusk→night turn-on (the sunAlt ramp in StreetLights) STAYS as the
// base on/off; this channel is the operator's master Brightness × that ramp,
// the Glow (wide halo strength), and the Colour — which also colours the ground pools, trees and walls (the pool
// IS the lantern's light on the ground). Distinct from `lampGlow` (how strong that light lands on each receiver).
// ⭐ Jacob, 2026-09-26 — each knob moves ONE thing, and none is a master over the others:
//   Bulb (`intensity`, key kept so authored Looks still load) — the light source: the glass panes EMIT in the
//   lamp colour (so bloom takes them), plus the bulb dot and tiny orb inside. Uncapped.
//   Glow + Glow size — a SMALL soft light hugging the lantern head (0.2–1.5 m), drawn just in front of it by the
//   lantern's own half-width. The wide halo is Bloom's (Image › Bloom): a flat card can't make one without washing
//   out everything near the lamp.
// The pools, trees and walls are the Lamp Glow card's. All of it × the automatic dusk→night turn-on.
export const LANTERN_FIELDS = [
  { key: 'intensity', label: 'Bulb',      min: 0,   max: 4,  step: 0.02 },
  { key: 'glow',      label: 'Glow',      min: 0,   max: 3,  step: 0.02 },
  { key: 'glowSize',  label: 'Glow size', min: 0.2, max: 1.5, step: 0.05 },  // metres, radius — small by design; the wide halo is Bloom's
  // The lamp's colour, keyed like everything else (Jacob, 2026-09-27: "at dusk they would be lovely little gaslamps …
  // the night lamps glittery and cold"). One colour for every lamp light: bulb, glow, pools, trees, walls.
  // ⛔ Replaces the flat `layerColors.lamp` swatch.
  { key: 'color',     label: 'Colour', type: 'color' },
]
export const LANTERN_FLAT_DEFAULTS = { intensity: 1.0, glow: 1.0, glowSize: 0.6, color: '#fff2e0' }
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE KIT'S DAY — the default every town starts from, keyed at all eight sun moments (Jacob, 2026-09-27;
// docs/briefs/BRIEF-tod-kit-default.md, the design page https://claude.ai/artifact/L4biBpFrgW1h3og4SK66XJ).
//
// ⭐ The keys are STYLE on top of physics. Sun and moon intensity and colour, the sky's colour, the stars'
// fade and the lamps' daylight ramp all run on the real sun and moon at the town's own latitude and date
// (celestialLights.js, proceduralSky.js, StreetLights), so a winter noon at 55°N is still a low weak sun.
// The keys only say how each moment is PICTURED — which is why one day serves every town.
// ⭐ Hyperreal: each moment is its own character. Dawn "lavender hush" · Sunrise first light · Noon the
// dollhouse (very bright, razor-sharp, almost no bloom) · Golden dazzle (drenched bloom, amber haze) ·
// Sunset embers · Dusk the blue hour (gaslamps and neon arrive against a blue sky) · Night stylish (deep
// blacks, cold glittering lamps, neon blazing) · Deep night the planetarium (the town subdued, the sky acts).
// ⭐ Man-made light is complete by Dusk; Night and Deep night deepen only the natural channels — so a town
// whose sun never reaches −18° (a white night) keeps its lamps and simply never gets astronomically dark.
// Values are design choices argued on the page above; none is copied from a town's Look.
// ▶ node checks/claims-look-default-has-no-town.mjs — every day channel keyed at every slot, no town values.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
export const KIT_DAY_SLOTS = ['dawn', 'sunrise', 'noon', 'golden', 'sunset', 'dusk', 'night', 'deep']
// Per channel: field → eight values in KIT_DAY_SLOTS order; `null` = a blank tile (the light is off there).
// `edges` = the ▲ fade-up / ▼ fade-down marks (animatedParam.js#todEdge).
const LAMP_EDGES = { sunset: { fade: 'up', minutes: 30 }, sunrise: { fade: 'down', minutes: 30 } }
const DAY = {
  dirSun:   { value: [0, 1.5, 1.2, 1.7, 0.9, 0, 0, 0] },
  dirMoon:  { value: [0.7, 0.3, 0.3, 0.3, 0.3, 0.8, 1.0, 1.3] },
  ambient:  { value: [1.6, 1.5, 1.1, 1.2, 0.85, 0.7, 0.6, 0.5] },
  hemi:     { value: [2.0, 1.8, 1.3, 1.8, 1.4, 1.6, 0.6, 0.6] },
  skyGain:  { value: [1.0, 1.05, 1.05, 1.15, 1.1, 0.95, 0.35, 0.3] },
  stars:    { brightness: [3, 1, 1, 1, 1, 0.6, 1.0, 2.2] },
  constellations: { value: [0, 0, 0, 0, 0, 0, 0, 1] },
  milkyWay: { value: [0, 0, 0, 0, 0, 0, 0, 1] },
  shadow:   { size: [3, 5, 1, 4, 5, 3, 2, 2], samples: [16, 16, 16, 16, 16, 16, 16, 16] },
  ao:       { radius: [15, 15, 15, 15, 15, 15, 15, 15], intensity: [2.0, 2.2, 3.2, 2.0, 2.2, 2.4, 2.8, 2.6],
              distanceFalloff: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] },
  fill:     { crush: [0.45, 0.4, 0.55, 0.3, 0.55, 0.7, 0.92, 0.85] },
  // Mist = the share of the town the fog hides across its width. Its colour sits near the sky's horizon at that hour,
  // or the fog paints a pale band against a darker sky (Dawn, first eye pass 2026-09-27).
  mist:     { amount: [1.25, 0.46, 0.28, 0.5, 0.46, 0.39, 0.28, 0.24],
              color: ['#9a86c0', '#e8b0c8', '#cfe2f0', '#f6cb8e', '#e89c7c', '#3e4f86', '#0b0f1c', '#080b16'],
              water: [0.5, 0.3, 0.2, 0.35, 0.35, 0.3, 0.25, 0.2] },
  // Halo is a SCREEN BAND, not distance haze (renderPipeline.jsx#AerialPerspectiveEffect): it washes the middle of the
  // frame whatever is there, so a Hero shot looking down on the town hazes near and far alike. Kept faint; Mist is
  // the distance haze (Jacob, Dawn pass 2026-09-27: "it's just very even all the way up to the camera").
  halo:     { strength: [0.25, 0.08, 0.03, 0.12, 0.1, 0.06, 0.02, 0.01],
              color: ['#dcbfd0', '#f2b0c6', '#bdd6ec', '#ffc27a', '#ff9868', '#5f6fb4', '#1a2040', '#10152a'] },
  exposure: { value: [1.7, 1.45, 1.18, 1.2, 1.0, 0.95, 0.85, 0.8] },
  warmth:   { value: [0.3, 0.62, 0.5, 0.88, 0.82, 0.3, 0.32, 0.25],
              tint:  [0.5, 0.7, 0.5, 0.55, 0.62, 0.55, 0.5, 0.5] },
  grade:    { contrast: [0.5, 0.4, 0.5, 0.32, 0.45, 0.5, 0.72, 0.55], toe: [0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28],
              saturation: [1.35, 1.3, 1.35, 1.4, 1.3, 1.1, 0.85, 0.75], brightness: [0, 0, 0, 0, 0, 0, 0, 0],
              vignette: [0.8, 0.8, 0.4, 1.2, 1.1, 1.0, 1.5, 1.3] },
  bloom:    { intensity: [1.2, 0.9, 1, 2.2, 1.5, 1.0, 1.1, 0.4], threshold: [0.45, 0.55, 0.05, 0.25, 0.4, 0.4, 0.35, 0.6],
              spread: [0.45, 0.6, 0.28, 0.95, 0.8, 0.5, 0.2, 0.3], warmCool: [0.35, 0.65, 0.5, 0.85, 0.8, 0.45, 0.5, 0.3] },
  // Depth of field, relative to what the camera looks at: a narrow sharp zone and a strong melt at Noon (the
  // tilt-shift dollhouse), dreamy at Golden, none at night so the lights and stars stay points.
  dof:      { blur: [0.2, 0.15, 0.1, 0.35, 0.25, 0.1, 0, 0], focus: [1, 1, 1, 1, 1, 1, 1, 1],
              heroBlur: [0, 0, 0.06, 0.1, 0, 0, 0, 0], softness: [0.5, 0.5, 0.3, 0.6, 0.5, 0.5, 0.5, 0.5] },
  grain:    { scale: [0.9, 0.7, 0.4, 0.7, 0.8, 1.0, 1.3, 1.1] },
  // Neon: which buildings light is their HOURS' business; this is how they read. At noon a solid colour band
  // (Emissive 1 is the colour itself, no bleed); at the blue hour it balances the sky; at night it blazes.
  neon:     { core: [0.3, 0.6, 0.3, 0.7, 0.9, 1, 1, 1], tube: [0.5, 1, 1, 1, 1, 1, 1, 1],
              bleed: [0.3, 0.15, 0, 0.35, 0.6, 0.85, 1, 0.8], emissive: [2, 1.4, 1.0, 2.5, 3.5, 5.0, 7.5, 5.0],
              tubeRadius: [0.5, 1, 1, 1, 1, 1, 1, 1], screenFloor: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
              screenCeil: [0, 0, 0, 0, 0, 0, 0, 0] },
  // Lamps × the daylight ramp: on before it is dark (▲ at Sunset), warm gaslamps at Dusk, cold glitter at Night.
  lantern:  { edges: LAMP_EDGES, intensity: [3, 1, null, null, 0.8, 1.6, 2.4, 1.3], glow: [2, 1, null, null, 0.5, 1.2, 0.9, 0.6],
              glowSize: [1, 1, null, null, 0.7, 0.8, 0.45, 0.45],
              color: ['#ffd9a8', '#fff2e0', null, null, '#ffb877', '#ffa95c', '#e4ecff', '#d6e2ff'] },
  // The tree cards' answer to the key light: flat across the day (0 = the historical dimmer), keyed so a Look can
  // move it by time of day like every other channel.
  canopy:   { directional: [0, 0, 0, 0, 0, 0, 0, 0], gain: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85],
              bulge: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9] },
  lampGlow: { edges: LAMP_EDGES, grass: [0, 0, null, null, 0, 0, 0, 0], pool: [0.5, 0.5, null, null, 0.6, 1.4, 2.2, 1.1],
              radius: [0.85, 0.75, null, null, 1, 1, 1, 1], centre: [1.2, 1.2, null, null, 1.2, 1.2, 1.2, 1.2],
              trees: [0.3, 0.3, null, null, 1.0, 2.5, 3.5, 1.6] },
}
// The uplights (a town's set-piece, and the Arch where a Look installs one): no daylight ramp, so the day is blank.
const UPLIGHT = { edges: LAMP_EDGES }
for (const s of ['L', 'R']) Object.assign(UPLIGHT, {
  [`uplight${s}_intensity`]: [s === 'L' ? 0.05 : 0.2, 0.2, null, null, 1.5, 2.8, 3.5, 1.2],
  [`uplight${s}_color`]:     ['#ffe2c0', '#ffd6a8', null, null, '#ffd6a8', '#ffc98f', '#f2ecff', '#e6e4ff'],
  [`uplight${s}_cone`]:      [s === 'L' ? 60 : 35, 35, null, null, 35, 35, 35, 35],
  [`uplight${s}_reach`]:     [s === 'L' ? 150 : 320, 220, null, null, 220, 220, 220, 220],
})
DAY.setPieceLight = UPLIGHT
DAY.archLight = UPLIGHT

function buildDayChannel(spec) {
  const { edges, ...fields } = spec
  const values = {}
  KIT_DAY_SLOTS.forEach((slot, i) => {
    const tuple = {}
    for (const [k, arr] of Object.entries(fields)) if (arr[i] != null) tuple[k] = arr[i]
    if (Object.keys(tuple).length) values[slot] = tuple
  })
  return { animated: 'tod', values, ...(edges ? { edges } : {}) }
}
const KIT_DAY = Object.fromEntries(Object.entries(DAY).map(([k, spec]) => [k, buildDayChannel(spec)]))
KIT_DAY.lampGlow.radiusV = LAMPGLOW_RADIUS_V
/** The channels the kit's day owns — the set a town's reset returns to the kit (cartograph/reset-town-day.mjs). */
export const KIT_DAY_CHANNELS = Object.keys(KIT_DAY)
/**
 * The kit's channel for `key`: the designed day where the day keys it, else null (the caller's flat defaults).
 * A fresh deep copy every call — the store mutates what it hydrates.
 */
export function kitDayChannel(key) {
  const ch = KIT_DAY[key]
  return ch ? JSON.parse(JSON.stringify(ch)) : null
}
