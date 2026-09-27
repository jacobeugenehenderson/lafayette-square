/**
 * sky-scalars.js — the ONE place the sky's weather numbers are produced.
 *
 * ⭐ THE DIRECTIVE IS THE WEATHER'S SINGLE SOURCE OF TRUTH. The Almanac (and, as it is
 * built out, the Meteorologist) turns the live feed into a directive; the rain, the
 * clouds, the lights, the dome and the exposure all read THAT. `cloudCover` /
 * `storminess` / `turbidity` on `useSkyState` are a projection of the directive through
 * this function — never a second reading of the feed.
 *
 * ⛔ What this replaced: the poller wrote `cloudCover`/`storminess` straight into the
 * store for the lights while the rain read the directive — two states for one sky, so
 * rain could fall in full sun (Jacob, 2026-09-26, Provincetown). Only the Meteorologist's
 * canary derived the scalars from the directive; now every mount does, through here.
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v))

// The sun intensity a directive means by "an ordinary day". A directive that authors no
// `sun` leaves the sun as it is, so it contributes no darkness — absence is meaningful
// here (most clear-weather rules author no sun), not a missing value.
export const NORMAL_SUN_INTENSITY = 1.2

/** How far the directive's sun sits below an ordinary day, 0..1. */
export function directiveDarkness(directive) {
  const sunI = directive?.sun?.intensity
  return sunI == null ? 0 : clamp01((NORMAL_SUN_INTENSITY - sunI) / NORMAL_SUN_INTENSITY)
}

/** A cloud preset's own coverage (params.coverage), from the preset library. */
export function presetCoverage(presets, id) {
  const list = Array.isArray(presets) ? presets : presets?.presets
  if (!list) throw new Error(`[sky-scalars] ⛔ no cloud preset library to read '${id}' coverage from`)
  const p = list.find((x) => x.id === id)
  if (!p) throw new Error(`[sky-scalars] ⛔ cloud preset '${id}' is not in the library`)
  const v = p.params?.coverage?.values?.value
  if (!Number.isFinite(v)) throw new Error(`[sky-scalars] ⛔ cloud preset '${id}' has no coverage`)
  return v
}

/**
 * @param {object|null} directive the effective (tweened) directive
 * @param {object|Array} presets the cloud preset library (public/clouds/presets.json)
 * @returns {{cloudCover:number, storminess:number, turbidity:number}}
 */
export function deriveSkyScalars(directive, presets) {
  const precipI = directive?.precip?.intensity ?? 0
  const darkness = directiveDarkness(directive)
  // Coverage = each blend weight × THAT preset's own authored coverage. ⛔ Not the raw
  // weight sum: "clear_sky" (coverage 0) at weight 0.97 read as 97% cloud, so a clear
  // noon drew as overcast (Jacob, 2026-09-26). No presets, or a preset not in them, throws.
  const cloudWeight = (directive?.clouds ?? [])
    .reduce((s, c) => s + (c.weight ?? 0) * presetCoverage(presets, c.preset), 0)
  return {
    cloudCover: clamp01(Math.max(cloudWeight, precipI, darkness)),
    storminess: clamp01(Math.max(precipI * 0.9, darkness)),
    turbidity:  clamp01(darkness * 0.3),
  }
}

// Jacob's neutral density filter: at full storminess the whole scene sits one stop
// down. A multiplier on the town's AUTHORED exposure, so the operator's grade survives.
const STORM_ND = 0.5

/** The weather's multiplier on exposure — 1 in clear weather, 0.5 at full storm. */
export function weatherExposureScale(storminess) {
  return 1 - STORM_ND * clamp01(storminess ?? 0)
}
