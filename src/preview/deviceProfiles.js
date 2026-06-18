/**
 * deviceProfiles — the Preview device-profile SSoT.
 *
 * One home for the gauge budgets that used to live (duplicated) in three
 * places: GpuMonitor's SPIKE thresholds, StripChart's BUDGET/CEILING_MS, and
 * PreviewApp's BUDGET_MS per-layer bar anchor. Every consumer now reads the
 * *active* profile from here instead of a local literal.
 *
 * This is Phase 1 of the v0.2 measurement-regime arc
 * (`HANDOFF-preview-measurement.md §1`): a pure refactor, zero intended
 * behavior change beyond the one frame-ms unification noted below. Phases 4–6
 * will populate the reserved fields (fill / memory / thermal) and build the
 * active-tier selector (Phase 3) — the shape below is final so they only
 * *consume* it, never reshape it.
 *
 * ⚠️ Scope guard (keystone §1): this module owns BUDGET NUMBERS only. The
 * render-path knobs (dpr / antialias / logDepth / post-fx tier) belong to
 * `INSTANCE.mobileQuality` (`HANDOFF-mobile-profile.md §2`) — do NOT fork a
 * parallel table for them here; reconciling the two homes is Phase 3.
 */

// True 60fps. Today the same concept was spelled `16` (GpuMonitor baseline +
// PreviewApp BUDGET_MS) in two files and `17` (StripChart CEILING_MS / BUDGET.ms)
// in a third — a pre-existing inconsistency. Unified here to the honest value
// (1000/60 = 16.67ms). This shifts StripChart's "60 fps" line and the per-layer
// bars by ~1ms-equiv: a deliberate de-duplication, NOT a behavior change. (See
// the Phase-1 report; seed this to `17` instead if byte-identical output is
// required.)
const FRAME_BUDGET_60FPS_MS = 1000 / 60

/**
 * Profile shape (every field present on every tier so consumers never branch):
 *   id                    — stable key for selection / persistence
 *   label                 — operator-facing name
 *   drawBudget            — draw-call ceiling (gauge denominator)        [WIRED]
 *   triBudget             — triangle ceiling                             [WIRED]
 *   frameBudgetMs         — 60fps frame target                          [WIRED]
 *   spikeMs               — frame-ms spike threshold (red / spike log)  [WIRED]
 *   warnMs                — frame-ms warn threshold (amber)             [WIRED]
 *   fillBudgetPx          — overdraw/fill ceiling, px/frame  — RESERVED, populated Phase 4 (supersample fill-strain)
 *   memBudgetMB           — resident geo/tex/prog memory ceiling — RESERVED, populated Phase 5 (memory gauge)
 *   thermalSustainableMs  — sustained frame-ms before throttle  — RESERVED, populated Phase 4 (thermal gauge)
 *
 * Reserved fields are `null` on purpose — the real values are open Jacob
 * decisions (`HANDOFF-preview-measurement.md §"Open decisions"`); do not guess.
 */

export const DEVICE_PROFILES = {
  // Desktop budgets are an OPEN doctrine decision (keystone §"Open decisions" —
  // the real desktop ceiling is unsettled). Left generous/null so nothing reads
  // an invented number; the 60fps frame target still applies. Not the active
  // profile today, so these values do not touch the current render.
  desktop: {
    id: 'desktop',
    label: 'Desktop',
    drawBudget: null,             // open decision — do not invent a desktop draw ceiling
    triBudget: null,              // open decision — do not invent a desktop tri ceiling
    frameBudgetMs: FRAME_BUDGET_60FPS_MS,
    spikeMs: 33,
    warnMs: 22,
    fillBudgetPx: null,           // RESERVED — populated Phase 4
    memBudgetMB: null,            // RESERVED — populated Phase 5
    thermalSustainableMs: null,   // RESERVED — populated Phase 4
  },

  // phone-hi / phone-lo carry TODAY'S literals (200 draws / 1M tris / 33 / 22).
  // They are identical for now — the real per-tier differentiation (a measured
  // iPhone-class budget for phone-hi, the weak-device gate for phone-lo) is an
  // open Jacob decision (keystone §"Device tiers"). Seeding both from today's
  // numbers keeps the gauges pixel-identical until those land.
  'phone-hi': {
    id: 'phone-hi',
    label: 'Phone (hi)',
    drawBudget: 200,
    triBudget: 1_000_000,
    frameBudgetMs: FRAME_BUDGET_60FPS_MS,
    spikeMs: 33,
    warnMs: 22,
    fillBudgetPx: null,           // RESERVED — populated Phase 4
    memBudgetMB: null,            // RESERVED — populated Phase 5
    thermalSustainableMs: null,   // RESERVED — populated Phase 4
  },

  'phone-lo': {
    id: 'phone-lo',
    label: 'Phone (lo)',
    drawBudget: 200,
    triBudget: 1_000_000,
    frameBudgetMs: FRAME_BUDGET_60FPS_MS,
    spikeMs: 33,
    warnMs: 22,
    fillBudgetPx: null,           // RESERVED — populated Phase 4
    memBudgetMB: null,            // RESERVED — populated Phase 5
    thermalSustainableMs: null,   // RESERVED — populated Phase 4
  },
}

// The active tier. Today the Phone toggle is cosmetic — the gauges use the
// mobile numbers regardless of mode — so the default reproduces exactly that:
// a phone tier with the 200/1M budget. The real "which tier is active"
// selector is Phase 3; until then this constant IS the active profile.
export const DEFAULT_PROFILE_ID = 'phone-hi'

export const ACTIVE_PROFILE = DEVICE_PROFILES[DEFAULT_PROFILE_ID]
