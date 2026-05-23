# Handoff to Supervisor — Anchor fix + Stage layerVis + autosave race

**Session date:** 2026-05-18.
**Local branch:** `cartograph-looks-pass-ab`. **2 new commits ahead of the prior handoff (`e710441`), 20 commits total ahead of origin; not pushed.**
**Operator:** Jacob.
**Sibling work in flight (untouched this session):** the Phase 2-arc ribbon arc described in `scratch/handoff-to-coordinator.md` — `RIBBONS.md`, `data/lafayette-square/clean/map.json`, baked artifacts, `src/components/NeonBandsV2.jsx`, `src/lib/buildBlockGeometryV2.js`, `src/data/ribbons.json` are all dirty in the working tree but stash-isolated and **not** in either commit below.

---

## TL;DR

Three correctness fixes, two commits. All independent of the in-flight ribbon arc.

1. **`3e51641`** — landed the 2026-05-14 mean-of-footprint anchor fix that BACKLOG claimed was shipped but actually wasn't. Foundations were stamping single-point centroids into `aCentroidY`; walls were calling `patchTerrain(mat)` (mesh-origin GPU sample) instead of the documented `patchTerrainAtCentroidRaw`. The helper had zero call sites in `src/`. Bake-side (`bake-buildings.js:571–575`) and the FEATURES.md doctrine paragraph were always correct; only LS-live was drifting, by ~0.5 m of extra exposure per building on LS's concave-down hills (historical "cantilevering / hovering above ground" symptom).

2. **`29cf7de`** — two coupled fixes for the "I toggled all layers off, pressed Stage, got 409, retried, layers came back" symptom Jacob hit mid-session:
   - **Stage 3D mounts now honor `layerVis`.** `StageEnvironment` in `CartographApp.jsx:568` was mounting `<LafayettePark>`, `<LafayetteScene>`, and `<GatewayArch>` unconditionally; only trees and lamps were gated. `bakedLayerVis` was hydrated and projected correctly but the 3D path silently dropped it. Violates FEATURES.md §"Designer-toggle ↔ bake parity (2026-05-05)". Now park is gated on `!hiddenLayers.park`; LafayetteScene accepts `hiddenLayers` and gates Foundations + Building map on `!hide.building` (paired per the 2026-05-18 anchor doctrine) and street labels on `!hide.labels`.
   - **Autosave debounce now flushes before `/bake`.** `_saveDesignDebounced` is a 300 ms debounce on POST `/design`. `runBake` POSTed `/bake` immediately on click — no flush. A panel toggle + Stage click within 300 ms raced the two POSTs; bake child processes re-read `design.json` per step, so the timer firing mid-bake produced split-bakes. Added `.flush()` to the debounce; `runBake` awaits it before posting. NOTES.md updated with the new ordering doctrine.

The 409 itself is **not** fixed and will still fire if a previous bake is legitimately in flight (other tab, HMR-orphan, `createLook`'s auto-bake). The flush stops 409-then-retry from producing visibly-wrong output, which was the actual complaint.

---

## Commit history this session

```
29cf7de honor layerVis in Stage 3D mounts + flush autosave before /bake
3e51641 land 2026-05-14 mean-of-footprint anchor fix in LS-live code
e710441 [prior handoff baseline] Phase 2-arc Stage 11a.1: distinguish partition-artifact skips
```

---

## Files touched

**Commit `3e51641`:**
- `src/components/LafayetteScene.jsx` — imported `patchTerrainAtCentroidRaw`; Foundations stamps `aCentroidY` from `mean(getElevationRaw(footprint[i]))` (footprint-less fallback retained); Building component computes `meanCornerRaw` once via useMemo and walls call `patchTerrainAtCentroidRaw(mat, meanCornerRaw)`; comment at line 115 updated to cite doctrine.
- `cartograph/BACKLOG.md` — 2026-05-18 addendum prepended to the 2026-05-14 anchor-rule bullet.

**Commit `29cf7de`:**
- `src/cartograph/CartographApp.jsx` — `<LafayettePark>` gated on `!hiddenLayers.park`; `hiddenLayers` threaded into `<LafayetteScene>`.
- `src/components/LafayetteScene.jsx` — accepts `hiddenLayers` prop; gates Foundations + Building map on `!hide.building`; gates street labels on `!hide.labels`.
- `src/cartograph/stores/useCartographStore.js` — `_saveDesignDebounced` refactored into `runSave` + `fn.flush`; `runBake` awaits `_saveDesignDebounced.flush()` before posting `/bake`.
- `cartograph/NOTES.md` — new top entry §"Autosave debounce must flush before /bake, and Stage 3D mounts must honor `layerVis`".

---

## Doctrine consulted

For `29cf7de`, dispatched a baby Explore agent across the cartograph quintet (FEATURES, ARCHITECTURE, BACKLOG, NOTES, RIBBONS) to confirm the changes weren't fighting documented patterns. Findings:

- **Change A (layer gates) supported by doctrine:** FEATURES.md line 385 §"Designer-toggle ↔ bake parity (2026-05-05)" explicitly says "what the operator hides in Designer is what's hidden in Stage/Preview." The 3D-mount miss is a violation. Pattern was already in place for trees/lamps; my fix extends it to park/building/labels.
- **Change B (flush) has no doctrine collision:** No autosave-vs-bake race handling documented anywhere in the quintet. Doctrine added in NOTES.md as part of this commit per the agent's recommendation.
- **One agent claim was wrong** (it asserted `<LafayettePark>` was already gated — it isn't pre-this-commit; the agent mistook my in-progress edit for pre-existing state). Caught and disregarded.

---

## Verification (what was checked, what wasn't)

**Verified by grep / static check (pre-commit):**
- `patchTerrainAtCentroidRaw` is no longer orphaned: now imported in `LafayetteScene.jsx:18` and called at `:882`.
- `getElevationRaw(building.position…)` only remains in the explicit footprint-less fallback branches (Foundations line 376, Building meanCornerRaw line 622) — single-point centroid sampling is gone from the main paths.
- `BACKLOG.md` addendum prepended at the right bullet.
- `useCartographStore.js` parse-clean after the debounce refactor; `flush()` covers the `t === null` case.
- `cartograph/NOTES.md` entry chronologically ahead of the 2026-05-15 maxi-brief.

**NOT verified (heads-up for supervisor):**
- No browser dev-server smoke test was performed. The brief Jacob signed off was a "correctness commit, not a redesign" — typing/grep-level checks only. Recommend a quick Stage visual once-over on LS to confirm: (a) buildings sit flush with foundation slab on the sloped portion (anchor fix); (b) toggling Buildings/Park/Labels off in Designer actually hides them in Stage after a re-bake (layer-vis fix).
- The autosave flush change touches a hot path (every panel edit). Functionally equivalent in the no-pending-edits case (flush returns resolved Promise immediately), but worth a quick "drag a slider, click Stage, observe no regression" check.
- `<GatewayArch>` has no Panel layer key today, so it's still ungated. If Jacob wants it hideable, that needs both a Panel toggle and a `layerVis.arch` key — flagged in NOTES.md adjacencies.
- Toy's `StageEnvironment` doesn't accept `hiddenLayers` at all. Same flag.

---

## Stash discipline

Each commit was stash-isolated against `src/data/ribbons.json` per Jacob's standing rule (`feedback_stash_isolate_per_file.md`). Both stashes popped cleanly. Working tree at session end matches `git status` from start (minus the new untracked handoff file).

---

## Memory updates

One new feedback memory written:

- `feedback_debounced_save_must_flush_before_dependent_post.md` — "Any client action that depends on the server seeing the latest debounced-autosave state must await a flush of the debounce timer first." Indexed in `MEMORY.md`. Cross-references the new NOTES.md doctrine and `project_authoring_is_live_production_is_static`.

No other memories updated this session.

---

## Open questions for the supervisor

1. **Stage visual verification.** Should the supervisor schedule a brief Stage smoke test on LS to confirm both fixes land cleanly, or is the static-check confidence sufficient for now?
2. **GatewayArch + Toy follow-ups.** Both have layer-vis gaps flagged in NOTES.md. Cheap to address (~10 LOC each). Wait for explicit ask, or queue as a small cleanup commit?
3. **Backlog/RIBBONS reconciliation.** The Phase 2-arc ribbon arc has unstaged work in the tree (`RIBBONS.md`, `buildBlockGeometryV2.js`, `NeonBandsV2.jsx`, baked artifacts) — entirely orthogonal to this session's commits. Confirm with the prior handoff coordinator before resuming that arc; nothing here should affect it.
