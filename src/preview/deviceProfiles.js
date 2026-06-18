/**
 * deviceProfiles — the Preview device-profile SSoT.
 *
 * ⭐ THIS IS THE PLACE TO SET PER-DEVICE BUDGETS. One home for the gauge budgets
 * that used to live (duplicated) in three places: GpuMonitor's SPIKE thresholds,
 * StripChart's BUDGET/CEILING_MS, and PreviewApp's BUDGET_MS per-layer bar anchor.
 * Every consumer reads the *active* profile from here instead of a local literal.
 * Operator-facing doc: `cartograph/OPERATIONS.md §Preview` (names the benchmark
 * devices + their specs and points back here).
 *
 * ── The benchmark devices (Jacob, 2026-06-18) ──────────────────────────────
 * We validate the slab against two real reference phones, not an abstract budget:
 *   • phone-hi = iPhone 16 Pro Max — Apple A18 Pro (6-core GPU), 8 GB RAM,
 *     6.9" 2868×1320 (~460 ppi). The best-case ceiling. (Also the device the
 *     PhoneFrame bezel is modeled on — 440×956 logical @3×.)
 *   • phone-lo = Samsung Galaxy A54/A55 — the floor we GUARANTEE. Anchor to the
 *     weaker A54 (Exynos 1380, Mali-G68 MP5, 8 GB, 6.4" 2340×1080); the A55
 *     (Exynos 1480, RDNA-based Xclipse 530) is the stronger sibling, so an
 *     A54-clean slab covers it. Specs sourced from gsmarena / Apple, not memory.
 * ⚠️ The device IDENTITY is set; the per-tier budget NUMBERS below are INTERIM
 * (today's 200/1M placeholder) until the Phase-3 virtual-device MEASUREMENT
 * locks them. A fake budget that reads "ships" is the false confidence the arc
 * forbids — trust the gauge only once the numbers are measured (keystone
 * §"Open decisions", the build-vs-trust gate).
 *
 * Phase 1 of the v0.2 measurement-regime arc seeded this module
 * (`HANDOFF-preview-measurement.md §1`): a pure refactor, zero behavior change
 * beyond the one frame-ms unification noted below. Phase 2 (Vernier, 2026-06-18)
 * then RE-AIMED the gauges to read against these budgets and WIRED the memory
 * ceiling (`memBudgetCounts`, see below). Phases 3–4 still populate the
 * remaining reserved fields (fill / true-byte memory / thermal) and build the
 * active-tier selector — the shape below is final so they only *consume* it.
 *
 * ── Memory ceiling: COUNTS, not bytes (Vernier Phase 2 decision) ───────────
 * The real OOM/VRAM failure mode is measured in BYTES, but three.js
 * `gl.info.memory` only exposes resident COUNTS (geometries / textures), and
 * `gl.info.programs.length` a program count — no byte totals. A true MB ceiling
 * would require estimating bytes per geometry (sum of attribute array sizes)
 * and per texture (w·h·channels·mip), which is a Phase-4 job alongside the
 * virtual device. v1 ships a pragmatic COUNT ceiling (`memBudgetCounts`) so the
 * geos/tex/progs rows stop rendering with no budget at all — a coarse proxy
 * (one 4K texture ≫ many small ones), but it catches runaway resident growth,
 * which is the never-crash blind spot. ⚠️ The count NUMBERS are INTERIM and
 * deliberately GENEROUS (a false OOM alarm erodes trust worse than a quiet
 * gauge); they are not a measured ceiling. `memBudgetMB` stays reserved for the
 * true-byte version.
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
 *   memBudgetCounts       — resident {geometries,textures,programs} COUNT ceiling [WIRED, Phase 2 — INTERIM, generous]
 *   fillBudgetPx          — overdraw/fill ceiling, px/frame  — RESERVED, populated Phase 4 (supersample fill-strain)
 *   memBudgetMB           — true-BYTE resident ceiling — RESERVED, Phase 4 (needs geo-attr + texture-format byte estimation; v1 uses memBudgetCounts)
 *   thermalSustainableMs  — sustained frame-ms before throttle  — RESERVED, populated Phase 4 (thermal gauge)
 *
 * `null` reserved fields are open Jacob decisions
 * (`HANDOFF-preview-measurement.md §"Open decisions"`); do not guess them. The
 * WIRED budgets carry INTERIM numbers until the Phase-3 measurement.
 */

export const DEVICE_PROFILES = {
  // Desktop = "real-but-generous" (Jacob, 2026-06-18): a 60fps target with
  // high-but-PRESENT draw/tri ceilings, so the gauge still trips on a pathological
  // scene or a weak laptop GPU — never a blank, untrippable gauge. These are a
  // generous engineering ceiling, not a measurement (desktop spans a huge range).
  // Not the active profile today, so they don't touch the current render.
  desktop: {
    id: 'desktop',
    label: 'Desktop',
    drawBudget: 2000,             // generous ceiling — trips only on pathological draw counts
    triBudget: 15_000_000,        // generous ceiling — modern desktop GPUs eat this; warns past it
    frameBudgetMs: FRAME_BUDGET_60FPS_MS,
    spikeMs: 33,
    warnMs: 22,
    // INTERIM count ceiling (generous — desktop spans a huge range). Counts, not
    // bytes (see header). Trips only on pathological resident growth.
    memBudgetCounts: { geometries: 4000, textures: 512, programs: 512 },
    fillBudgetPx: null,           // RESERVED — populated Phase 4
    memBudgetMB: null,            // RESERVED — true-byte ceiling, Phase 4
    thermalSustainableMs: null,   // RESERVED — populated Phase 4
  },

  // Both phone tiers carry TODAY'S literals (200 draws / 1M tris) — INTERIM.
  // The device identity is now set (16 Pro Max / A54), but the real per-tier
  // split — a measured A18-Pro ceiling for phone-hi, the measured A54 floor for
  // phone-lo — is the Phase-3 measurement's job. Identical-for-now keeps the
  // gauges pixel-identical until those numbers land. Edit the numbers HERE.
  'phone-hi': {
    id: 'phone-hi',
    label: 'iPhone 16 Pro Max',   // Apple A18 Pro · 6-core GPU · 8 GB · 2868×1320
    drawBudget: 200,              // INTERIM (today's literal) — set by Phase-3 measurement
    triBudget: 1_000_000,         // INTERIM (today's literal) — set by Phase-3 measurement
    frameBudgetMs: FRAME_BUDGET_60FPS_MS,
    spikeMs: 33,
    warnMs: 22,
    // INTERIM count ceiling. Counts, not bytes (see header). Generous enough to
    // not false-alarm on the clean all-on scene; set by Phase-3 measurement.
    memBudgetCounts: { geometries: 1200, textures: 192, programs: 192 },
    fillBudgetPx: null,           // RESERVED — populated Phase 4
    memBudgetMB: null,            // RESERVED — true-byte ceiling, Phase 4
    thermalSustainableMs: null,   // RESERVED — populated Phase 4
  },

  'phone-lo': {
    id: 'phone-lo',
    label: 'Galaxy A54/A55',      // the floor we guarantee — Exynos 1380 · Mali-G68 MP5 · 8 GB · 2340×1080
    drawBudget: 200,              // INTERIM (today's literal) — set by Phase-3 measurement (expect LOWER than hi)
    triBudget: 1_000_000,         // INTERIM (today's literal) — set by Phase-3 measurement (expect LOWER than hi)
    frameBudgetMs: FRAME_BUDGET_60FPS_MS,
    spikeMs: 33,
    warnMs: 22,
    // INTERIM count ceiling — the LOWEST tier (the floor we guarantee). Counts,
    // not bytes (see header). Set by Phase-3 measurement (expect LOWER than hi).
    memBudgetCounts: { geometries: 800, textures: 128, programs: 128 },
    fillBudgetPx: null,           // RESERVED — populated Phase 4
    memBudgetMB: null,            // RESERVED — true-byte ceiling, Phase 4
    thermalSustainableMs: null,   // RESERVED — populated Phase 4
  },
}

// The active tier. Today the Phone toggle is cosmetic — the gauges use the
// mobile numbers regardless of mode — so the default reproduces exactly that:
// a phone tier with the 200/1M budget. The real "which tier is active"
// selector is Phase 3; until then this constant IS the active profile.
export const DEFAULT_PROFILE_ID = 'phone-hi'

export const ACTIVE_PROFILE = DEVICE_PROFILES[DEFAULT_PROFILE_ID]
