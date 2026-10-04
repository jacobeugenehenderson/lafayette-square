/**
 * renderTiers — the per-environment pyramid DEGREE (the planned mobile ladder).
 *
 * ⛔⛔ UNFINISHED — THIS REACHES NOTHING THAT RENDERS (re-verified 2026-10-04, Phase 2 D). Three breaks, each its own:
 *   1. Nothing imports `pyramidDegreeFor`; Preview's tuner edits a copy of RENDER_TIERS and hands it only to its sliders.
 *   2. `DownsamplePyramid` accepts and IGNORES levels / radius / resolutionScale (the dial was removed 2026-06-28).
 *   3. The pyramid is `platform: 'desktop'` (renderPipeline.jsx) — a phone, and Preview's phone tiers, never run it.
 * ⭐ KEPT ON PURPOSE (Jacob, 2026-10-04): it is ASPIRATION, not rot — the intent that a phone runs EVERY effect at a
 * lower rung of the one shared ladder instead of dropping passes (`plans/clean-for-handoff.md §W1`,
 * `_handoffs/HANDOFF-mobile-profile.md §2`, board row `ROADMAP.md H1`). Drop-vs-low-rung is Jacob's call, after the
 * phone measurement. Finishing it is ladder work: the degree goes into the quality profile (qualityProfile.js — the
 * device question's one home), the pyramid reads it, and the phone profile's pass set changes there. Until then
 * phone-hi and phone-lo render identically and a number read off these rungs is not a measurement of anything.
 *
 * Keyed by the SAME ids as deviceProfiles.js (desktop / phone-hi / phone-lo).
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
