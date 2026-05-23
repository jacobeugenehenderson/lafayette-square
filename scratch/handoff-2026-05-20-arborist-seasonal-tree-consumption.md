# Cross-helper handoff: Arborist seasonal-tree consumption from kit calendar

**From:** Meteorologist orchestrator
**To:** Arborist coordinator
**Date:** 2026-05-20
**Scope:** Coordinator-to-coordinator handoff. You translate to your own baby brief. Arborist owns the seasonal-variant taxonomy; this brief establishes the *contract* — your baby owns the *integration*.

---

## Context

The kit clock + calendar primitive landed today: `src/hooks/useCalendar.js` exposes `useCalendar(s => s.season())` returning `'spring' | 'summer' | 'autumn' | 'winter'`, plus `dayOfYear()` and `currentDate`. ADR in `meteorologist/NOTES.md` 2026-05-20.

Anywhere Arborist's runtime or authoring picks a tree variant, it can now consult `useCalendar.season()` to pick the seasonal-appropriate one — sugar maple's full canopy in summer vs. red foliage in fall vs. bare branches in winter; conifer's snow-laden in winter vs. clean in summer; etc.

This pairs naturally with the year-round-trees work on your track. You probably have more context on the seasonal-variant machinery than I do — how the GLB substitution decision happens today, whether seasonal variants share an atlas or split, what the manifest carries — so the baby brief shape is yours to define.

## The ask (small)

Make Arborist's tree-variant selection **season-aware** by reading `useCalendar.season()` at the right consumption point. The specific touch points depend on your machinery — likely candidates:

- **InstancedTrees runtime variant pick** — when `bake-trees.js`'s placement-substitution selects which variant to use per placement, season is one of the inputs. Today the decision is `quality + category + species-map`; add season as a tiebreaker or filter.
- **Workstage authoring preview** — operator sees the right seasonal variant in Arborist's per-species Workstage viewport (matches what production will show today).
- **Grove authoring preview** — same; Grove tiles show the seasonal variant for the current `useCalendar.season()`.

Your baby picks the load-bearing one. If only one consumption site lands in this phase, prioritize the **authoring preview** (Workstage / Grove) — that's where the operator's eyes are during seasonal-variant authoring. Runtime substitution can come second.

---

## The contract (what both sides agree to)

| | |
|---|---|
| Anchor | `useCalendar` in `src/hooks/useCalendar.js` (shipped this morning) |
| Read for season | `useCalendar(s => s.season())` returns string from `{'spring','summer','autumn','winter'}` |
| Live vs scrub | Honored automatically. Operator scrubbing date in Cartograph (Step 2 of the phasing, coordinator brief pending) → all consumers see new season. |
| Cross-tab | Per-tab independent today. v2: BroadcastChannel sync. |

No new helper-side APIs. Arborist reads from the kit primitive; the kit primitive is the contract.

---

## What I'll do on the Meteorologist side (FYI)

`Condition.whenBlock.season` already exists in the Almanac schema as a constraint — "this condition fires when season is in [list]." I'll commit a Step 3 small change to highlight the live-matching season chip in the Condition editor's WhenCard (already drafted as a baby brief — `scratch/handoff-2026-05-20-meteorologist-step3-condition-editor-season-now.md`). When you ship seasonal-aware trees, the operator scrubs date in Cartograph and BOTH my Conditions chips AND your tree variants reflect the new season. All consuming the same kit anchor.

---

## Out of scope for this brief

- **No changes to `useCalendar`'s public API.** It just shipped; consume as-is.
- **No new schema in Arborist's manifests** unless your seasonal-variant taxonomy demands it. If it does, surface back so Jacob can route through both coordinators.
- **No date-scrub UI in Arborist.** Cartograph hosts the scrub affordance (separate coordinator brief queued). Arborist consumes the kit state; operator drives it from Cartograph.
- **No tree GLB regeneration on season change.** Variants are pre-baked; runtime picks among them. Don't trigger a re-bake when scrubbing dates.

---

## Coordination

- **Timing flexible.** No critical dependencies. Pairs with your year-round trees work — could land as part of that or as a standalone follow-up.
- **No signature negotiation needed with me.** Contract is `useCalendar`'s API. Your machinery + UX choices are yours.
- **Cross-tab implications.** If operator scrubs date in Cartograph Tab A while Arborist's Workstage is open in Tab B, Tab B won't auto-update (per-tab independent state in v1). Operator refresh to pick up. Note for v2 BroadcastChannel work.

---

## Memories to flag to your baby

- `feedback_stash_isolate_per_file` (amended 2026-05-19) — check both working-tree AND staged state before commit.
- `feedback_baby_must_surface_scope_drift` — disclose extensions to the brief in commit body.
- `project_kit_helpers_pattern` — Arborist owns trees; the kit owns shared time-anchor state. No cross-helper imports.

---

## Report shape

When your baby reports done:
- Commit hash + files changed
- Where the seasonal pick landed (Workstage / Grove / InstancedTrees / etc.)
- How season composes with the existing quality/category/species-map selection logic
- Scope-drift disclosures
- Thumbs-up

Jacob forwards; I close my end. Step 5 (production runtime `<ClockCalendarPump mode="live">` mount) lands after this + the Cartograph DateScrubber ship.
