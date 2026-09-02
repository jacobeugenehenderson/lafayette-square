/**
 * renderTiers — the per-environment RENDER-KNOB home (device-regime, meta phase 1).
 *
 * The render-path knobs the canon reserves for INSTANCE.mobileQuality get their
 * first home here — starting with the one knob the device-regime workflow needs:
 * the DownsamplePyramid DEGREE per environment.
 *
 * ⛔⛔ THESE PHONE RUNGS CURRENTLY TUNE A PASS NO PHONE RUNS (verified 2026-09-02).
 * DownsamplePyramid is `platform: 'desktop'` in renderPipeline.jsx's manifest and is
 * filtered out for mobile at `:259`, along with ao / dof / bloom / aerial — a phone
 * renders grade + smaa + grain and nothing else. So `phone-hi`/`phone-lo` below are
 * real only inside PREVIEW, which installs the whole desktop pipeline regardless of
 * tier. ⭐ A number read off them is NOT a mobile number.
 * ▶ The finish is `plans/clean-for-handoff.md §W1` — that arc was justified on turning
 * `platform` from an on/off drop into a RESOLUTION BRACKET (mobile ships every effect
 * at a low rung) and shipped everything except that. Until it lands, this file is a
 * Preview knob, not a device profile.
 * ⚠️ The fuller design is `_handoffs/HANDOFF-mobile-profile.md §2` — but `_handoffs/`
 * is GITIGNORED, so that pointer resolves only on Jacob's machine. Tracked homes:
 * `ROADMAP.md H1` (the board row) · `plans/clean-for-handoff.md §W1` ·
 * `cartograph/PREVIEW.md §0.1` · `AUDIT-MATRIX.md`. Keyed by the SAME ids as deviceProfiles.js (desktop / phone-hi /
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
