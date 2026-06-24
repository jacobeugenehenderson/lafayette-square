/**
 * renderTiers — the per-environment RENDER-KNOB home (device-regime, meta phase 1).
 *
 * The render-path knobs the canon reserves for INSTANCE.mobileQuality
 * (HANDOFF-mobile-profile.md §2) get their first home here — starting with the
 * one knob the device-regime workflow needs: the DownsamplePyramid DEGREE per
 * environment. Keyed by the SAME ids as deviceProfiles.js (desktop / phone-hi /
 * phone-lo) so the gauge budget and the render degree speak one vocabulary.
 *
 * This is "Preview = Pyramid" made data: each environment is a BRACKET POSITION
 * on the pyramid (memory: preview-equals-pyramid-tier-ladder). Desktop = full
 * degree (mirrors DownsamplePyramid's PYRAMID_DESKTOP); the phone rungs dial it
 * down (cheaper, slightly softer bloom/DoF blur). The live tier selector
 * (Preview's mode toggle) picks the active one; the tuner (meta phase 2) edits
 * these values.
 *
 * ⚠️ Scope: render KNOBS, not budgets (those stay in deviceProfiles.js). Fold
 * into the full mobileQuality home (dpr / AA / logDepth / post-fx set) when it
 * lands; reconciling the two homes is the mobile-profile/render-conformance arc.
 */
export const RENDER_TIERS = {
  desktop:    { pyramid: { levels: 8, radius: 0.85, resolutionScale: 0.5  } },
  'phone-hi': { pyramid: { levels: 6, radius: 0.85, resolutionScale: 0.35 } },
  'phone-lo': { pyramid: { levels: 4, radius: 0.85, resolutionScale: 0.25 } },
}

export const DEFAULT_TIER_ID = 'desktop'

// The DownsamplePyramid degree for an environment id (falls back to desktop).
export function pyramidDegreeFor(tierId) {
  return (RENDER_TIERS[tierId] || RENDER_TIERS[DEFAULT_TIER_ID]).pyramid
}
