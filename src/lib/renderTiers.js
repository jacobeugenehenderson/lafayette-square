/**
 * renderTiers — the per-environment pyramid DEGREE (the planned mobile ladder).
 *
 * ⛔⛔ UNFINISHED — THIS REACHES NOTHING THAT RENDERS (re-verified 2026-10-04, Phase 2 D). Three breaks, each its own:
 *   1. Preview's tuner edits a copy of RENDER_TIERS and hands it only to its sliders (the unused reader, pyramidDegreeFor, is gone).
 *   2. `DownsamplePyramid` accepts and IGNORES levels / radius (the dial was removed 2026-06-26, in 7d1bb238).
 * ⛔ The RESOLUTION rung is gone (2026-10-07): BRIEF-pyramid-ladder step 1 measured a lower rung — rung 0 at 1/4 and 1/8
 *   of the buffer — costing what the full ladder costs (huron and LS, Hero and Browse, desktop): the money is in the
 *   consumers' full-screen passes, not the downsample. A dial that buys nothing is not kept as config.
 *   3. The phone profile switches the pyramid off (qualityProfile.js `postFxOff`) — a phone, and Preview's phone tiers, never run it.
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
  desktop:    { pyramid: { levels: 8, radius: 0.85 } },
  'phone-hi': { pyramid: { levels: 6, radius: 0.85 } },
  'phone-lo': { pyramid: { levels: 4, radius: 0.85 } },
}
