/**
 * condition-degrees.js — the continuous-response core (meteorologist/WEATHER-MODEL.md §4).
 *
 * A Condition's look is a CONTINUOUS function of its Degrees, not a snap to a
 * single authored point: a drizzle and a downpour are the same Condition at
 * different magnitudes, and everything between is interpolated. `applyDegrees`
 * is that function — it takes a base directive (the Condition authored at full
 * expression) and the live Degrees, and returns the effective directive.
 *
 * Degrees are normalized 0..1 multipliers on the authored full-expression
 * values (default 1 = the Condition as authored). In the Meteorologist
 * EMULATOR the operator scrubs them to preview the Condition across its range;
 * in the RUNTIME they come from the live feed (precipMmHr / windSpeedMs /
 * cloudCover, normalized). Same function, two input sources — see WEATHER-MODEL.md.
 *
 * v1 semantics: multipliers that preserve the Condition's authored balance.
 * Authoring the full RESPONSE curve (absolute degree → magnitude per field)
 * is the further Phase-3b step; this gives faithful continuous preview today.
 */

export const DEFAULT_DEGREES = { precip: 1, wind: 1, cover: 1 }

// Clear-day sun intensity the brightness lerps toward as cover → 0. Matches
// the "normal day" baseline deriveSkyScalars uses (WEATHER-MODEL.md §3).
const CLEAR_SUN_INTENSITY = 1.6

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/**
 * @param {object|null} directive  base directive (Condition at full expression)
 * @param {{precip?:number, wind?:number, cover?:number}} degrees  0..1 axes
 * @returns {object|null} effective directive at those Degrees
 */
export function applyDegrees(directive, degrees = DEFAULT_DEGREES) {
  if (!directive) return directive
  const d = { ...DEFAULT_DEGREES, ...(degrees || {}) }
  const out = { ...directive }

  // Precipitation magnitude — scales precip.intensity (drives particle
  // density + the synthesized lightning likelihood downstream).
  if (directive.precip) {
    out.precip = {
      ...directive.precip,
      intensity: clamp01((directive.precip.intensity ?? 0) * d.precip),
    }
  }

  // Wind magnitude — speed is the m/s authority; scale is the legacy fallback.
  if (directive.wind) {
    out.wind = { ...directive.wind }
    if (out.wind.speed != null) out.wind.speed = out.wind.speed * d.wind
    if (out.wind.scale != null) out.wind.scale = out.wind.scale * d.wind
  }

  // Cloud coverage — scale the blend weights (total weight ≈ coverage).
  if (Array.isArray(directive.clouds)) {
    out.clouds = directive.clouds.map((c) => ({
      ...c,
      weight: clamp01((c.weight ?? 0) * d.cover),
    }))
  }

  // Brightness — more cover ⇒ dimmer sun. Lerp the authored (full-expression)
  // sun intensity UP toward a clear-day value as cover drops, so scrubbing
  // cover toward 0 lifts the storm gloom toward clear. Tint (the storm grey)
  // stays authored — at low cover the bright intensity washes it out anyway.
  if (directive.sun) {
    const authoredI = directive.sun.intensity ?? CLEAR_SUN_INTENSITY
    out.sun = {
      ...directive.sun,
      intensity: authoredI + (CLEAR_SUN_INTENSITY - authoredI) * (1 - d.cover),
    }
  }

  return out
}
