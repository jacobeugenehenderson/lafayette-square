# Brief 20 — Recenter all chassis to origin at the SOURCE

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name not already used in this project.** Babies here pattern-match to names in NOTES.md / commits and pick collisions (Holm, Cambium, and a two-Corbels incident already happened). **Avoid the architectural-element cluster (Lintel, Mullion, Corbel — all taken) AND minerals (Quartz, taken).** Reach to a clearly different domain — a star, a weather term, a body of water, a tool, an instrument, an invented word.

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

State your name in your first message; sign your commits with it.

---

## Why this brief exists — the root fix for three downstream symptoms

Many vendor chassis are extracted from group kits that were broken apart, so they arrive **off-origin**: trunk base not at `(0,0,0)`, trunk axis off-center (e.g. `broadleaf_rt3`: base Y≈−1.3, trunk centroid X≈−3.0, Z≈−0.7; `TREE_00` carries a baked node translation `T=[3.9,0,−3.8]`). Whittle's 141 single-tree chassis (Brief 0) were **never recentered** — a byte-identity constraint kept them as-extracted. Only the 18 decomposed *bundle* chassis got recentered (and via `bbox-center`, a *different* method than what runs downstream).

Because chassis ship off-origin, **everything downstream re-derives the center at runtime:**
- `SpecimenViewport.jsx#computeDominantTrunk` — the viewport auto-centers the dominant-trunk base to the bullseye for display
- `generate-salon.js#computeAutoCenterPivot` — a port of the above, used by Brief 19's transform-bake conjugation

Two implementations of one algorithm (+ survey-deleaf's third, bbox-center, on bundles). They must stay in sync or the bake silently stops matching the viewport. **This brief fixes the root cause:** recenter ALL chassis to origin at chassis-creation time, using the dominant-trunk method, so the geometry frame is consistent and downstream can assume origin.

**What this fixes:**
1. The long-standing **lean / decenter** of the 141 single-tree chassis.
2. **Sough's wind-frame assumption** (Brief 9a — `injectFoliageSway` assumes trunks sit at `X≈Z≈0, base≈0`) becomes *true*.
3. **3A's deformer pivot** (queued) becomes trivially-origin.
4. **Neutralizes the trunk-finder drift risk** — on already-centered chassis, both downstream finders return ~origin, so they agree by construction; the KEEP-IN-SYNC hazard goes quiet.

## Read first

- `arborist/BACKLOG.md` — the Brief 20 entry (full spec + the reframe rationale)
- `arborist/survey-deleaf.js`:
  - `translatePrimsInPlace` (~330) + the bundle recenter (~475-493) — the **existing** recenter (bbox-XZ-center + bbox-Y-min), applied to bundle chassis only
  - the single-tree path (`processGlb`, byte-identity preserved — `~527`, `~975`) — the 141 that are NOT recentered today
  - the `⚠ KEEP IN SYNC` note Quartz left + line ~1162 ("the leaning weirdly issue isn't bundle-specific")
- `src/arborist/SpecimenViewport.jsx#computeDominantTrunk` (~300, exported) — the canonical centering algorithm: bins the bottom-5% Y-slab, finds the densest trunk XZ centroid → trunk base. **This is the method to use** (NOT bbox-center).
- `arborist/generate-salon.js#computeAutoCenterPivot` (~828) — Quartz's port of the above (the `⚠ KEEP IN SYNC` comment at ~824). Reference for the algorithm + the data-shape adapter (gltf-transform doc).
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_geometry_briefs_need_artifact_inspection]]` (inspect the chassis frames + the centering methods BEFORE coding), `[[feedback_classifier_keyword_cross_check]]` (the shared-vs-port decision), `[[project_writeifchanged_touches_mtime]]`, `[[feedback_orphan_audit_full_repo]]`.

## Goal — and what this phase explicitly does NOT do

**Goal:** every chassis emitted by `survey-deleaf.js` ships with its dominant-trunk base at origin `(0,0,0)`, centered via the dominant-trunk method (not bbox-center). The 141 single-tree chassis get recentered (byte-identity carve-out dropped). Existing authored transforms produce a visually-identical result (the recenter does at the source what the viewport auto-center did at display). Roster re-baked.

**Do NOT:**
- Delete the downstream trunk-finders (`computeDominantTrunk` / `computeAutoCenterPivot`). They go *quiet* (return ~origin on centered chassis) but stay — deletion is a deferred post-verification cleanup, not this brief.
- Collapse Brief 19's conjugation. It becomes identity-wrapping-identity on centered chassis (harmless); simplifying it is the same deferred cleanup.
- Delete or change ANY Salon gizmo tool (tilt / scale / rotateY / posOffset / oubliette). **Operator decision 2026-05-25: keep all tools until the automation is proven in action.** Recentering fixes *position only* — it does NOT de-lean (a 3°-leaning chassis recentered still leans; the tilt tool handles that) and does NOT rescale (can't auto-size — multipacks hold arbitrary assets). The tools stay as the escape hatch.
- Build auto-orient (trunk-axis detection) or auto-scale. Out of scope; fuzzy/risky; explicitly not happening.
- Touch the deformer (Brief 3A — dispatches after this lands, onto the centered frame).

## Architecture

**The centering method:** use the **dominant-trunk** algorithm (`computeDominantTrunk`: bottom-5% Y-slab binning → densest XZ centroid → base point), NOT survey-deleaf's current bbox-center. Apply `translate(−base)` to every chassis's POSITION at creation so the trunk base lands at origin (X=0, Z=0, Y=0).

**Port vs shared-lift — your call, surface it:** the algorithm now needs to run in survey-deleaf (Node/gltf-transform). Either (a) **port** it a third time into survey-deleaf (minimal; survey-deleaf-only file surface; the two downstream copies go quiet), or (b) **lift the pure-math core** (position array → trunk base) into a runtime-agnostic helper imported by `survey-deleaf.js` + `SpecimenViewport.jsx` + `generate-salon.js` (cleaner end state, kills the drift across all three, but touches three files). 3A is serial-after-this so there's no collision either way. **Recommendation:** the shared-lift if it's clean (it's the right end state and removes the drift permanently); the port if the data-shape impedance is high. Document the choice.

**Apply to ALL chassis:** drop the single-tree byte-identity carve-out — the 141 get recentered too. Bundle chassis switch from bbox-center to dominant-trunk center (more correct; minor shift for asymmetric-canopy ones).

**Compose with Brief 19 (shipped `50f88ef`):** Brief 19 bakes the operator's authored orientation/scale correction; its conjugation uses `computeAutoCenterPivot`. On a centered chassis, that pivot = origin, so the conjugation = identity-wrapped = plain `R·S·T` about origin — it keeps working, just trivially. Existing authored `posOffset` values stay valid (the recenter does what the viewport auto-center did, so the frame the operator authored against is preserved).

**Re-bake:** chassis geometry changes → published artifacts change → the slab changes for affected species. Re-bake the roster (the full `bake-look` / `bake-trees` path) after regenerating chassis. This is the blast radius.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/survey-deleaf.js` | edit — recenter ALL chassis via dominant-trunk at creation; drop the single-tree byte-identity carve-out; replace bbox-center for bundles | +60 |
| `arborist/trunk-center.js` (new, IF shared-lift) | new — runtime-agnostic dominant-trunk core (position array → base) | +40 |
| `src/arborist/SpecimenViewport.jsx` + `arborist/generate-salon.js` | edit IF shared-lift — import the shared core (thin adapters); else untouched | +0-20 |
| regenerate chassis library | `node arborist/survey-deleaf.js` (gitignored output) | — |
| `arborist/{FEATURES,ARCHITECTURE,BACKLOG,NOTES}.md` | edit — document the source-recenter + the quiet-finders + deferred cleanup | +40 |

## Acceptance criteria

1. **All chassis ship trunk-base at ~origin.** Re-run `survey-deleaf.js`; spot-check several chassis (incl. a single-tree one like the ones in the 141, a bundle one, `broadleaf_rt3`) — dominant-trunk base at `(0,0,0)` within tolerance.
2. **Centering uses dominant-trunk, not bbox-center.** Verify on an asymmetric-canopy chassis that the trunk (not the bbox) lands at origin.
3. **Downstream finders go quiet.** On the recentered chassis, `computeDominantTrunk` (viewport) and `computeAutoCenterPivot` (producer) both return ~origin → auto-center ≈ identity, Brief 19 conjugation ≈ identity. Confirm (log the pivot, or assert near-zero).
4. **Authored transforms visually unchanged.** A composition with an existing authored `posOffset`/tilt renders the same after recentering as before (the recenter is what the viewport auto-center was already doing at display). No surprise shift.
5. **Brief 19 bake still correct.** Author a 90° flip + recenter on a (now-centered) chassis, publish — baked geometry matches the viewport (conjugation degenerates to plain R·S·T about origin, still correct).
6. **Determinism.** Same source chassis → byte-identical recentered output across two `survey-deleaf.js` runs (per `[[project_writeifchanged_touches_mtime]]`).
7. **Curation survives.** `_chassis-curation.json` is name-keyed — verify it still resolves after the regen (no byte-refs broken).
8. **Roster re-bakes clean.** Full bake path completes; slab artifacts update for the recentered species.
9. **All gizmo tools intact.** Tilt/scale/rotateY/posOffset/oubliette all still present + functional. Nothing deleted.
10. **Nothing depends on the raw off-center frame** — grep the repo (per `[[feedback_orphan_audit_full_repo]]`); confirm no consumer relied on chassis being off-origin (none expected — it's a pure kit-extraction artifact).

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`:
- **Port vs shared-lift** — which you chose + why.
- **bbox-center → dominant-trunk shift on bundle chassis** — any visible difference for the 18 decomposed bundles (they were bbox-centered; now trunk-centered). Surface if notable.
- **Multi-stem / no-clear-trunk chassis** — the dominant-trunk binning assumes one dominant trunk. If a chassis has no clear trunk (shrub, multi-stem), what does the method return? Surface the degenerate behavior + whether it needs a fallback.
- **Authored transforms that compensated for off-center** — if any existing composition's `posOffset` was authored to *correct* the off-centeredness (rather than on top of the auto-center), recentering might double-correct. Inspect a few; surface if found.
- **Byte-identity downstream contracts** — what specifically breaks (baked slabs, any test fixtures, determinism snapshots). Surface the full list before the regen.

## Out of scope

- Deleting the quiet trunk-finders (deferred cleanup)
- Collapsing Brief 19's conjugation (deferred cleanup)
- Deleting/changing any gizmo tool (operator: keep all)
- Auto-orient, auto-scale
- Brief 3A deformer (serial, after)

## Dispatch posture

Cold dispatch, **solo** (NOT parallel with 3A — they collide on the chassis frame + `generate-salon`/`SpecimenViewport` + 3A's tuning baseline would shift under this regen). Single commit when AC 1-10 pass (the regenerated chassis are gitignored, so the commit is code + docs; the re-bake produces slab artifacts the operator commits/verifies separately). Title: `arborist: Brief 20 (<your-name>) — recenter all chassis to origin at source`.

Per `[[feedback_geometry_briefs_need_artifact_inspection]]`: inspect the actual chassis frames + survey-deleaf's current centering + the dominant-trunk method BEFORE coding. If the dominant-trunk method behaves unexpectedly on any chassis class (multi-stem, no-trunk), surface it in an alignment check before the full regen.

— Boz
