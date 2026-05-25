# Brief 23 — Restore + make-durable the forest decomposition (regressed by Brief 20's --clean)

**You are the baby executing this brief.** Boz (coordinator) drafted it; Jacob (operator) dispatched it. Not the orchestrator — the work is yours.

**Name yourself — MUST be unused.** Avoid the architectural cluster (Lintel/Mullion/Corbel), minerals (Quartz), instruments (Sextant) — all taken. Reach elsewhere: a river, a wind, a knot, a constellation, an invented word.

**Claimed — do NOT reuse:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

---

## Why this brief exists — a data-integrity regression, NOT a missing feature

Multi-tree files (forests / group-shot kit assets) are supposed to live in the chassis library as **individual split-out single-tree chassis** — and they *used to be* (operator confirmed 2026-05-25). **Brief 20 (Sextant) ran a `--clean` regen of `survey-deleaf.js` and lost some of that decomposition** — forests reappeared as whole-group "group shots" in the Salon. This is a regression to repair, not a forest-hiding job. (Boz inlined a separate fix that filters *procedural + LiDAR-species* chassis out of the Salon catalog — commit `7eef6c5` — but that does NOT address the forest decomposition; that's this brief.)

**Confirmed partial scope (verify + extend in the forensic step):**
- Riven's Brief 1.5c decomposed **candicands ×12, gleditsia ×4, populus_alba_fall ×2** (18 total, multi-root bundles, via `processBundleGlb`). Post-Brief-20: **candicands ×12 survived; gleditsia + populus (6) appear GONE.**
- Single-mesh forests (`acer_saccharum_a/c` + maybe `garden_mix`/`generic_tree_*`) were **never** caught by Riven's *root-based* detector (`isBundleDoc` → `roots.length>1`) — so if they "used to be split," a *different* process did it. Determine what.
- Sextant's `--clean` deleted **17 "off-origin orphans"** it judged stale — **some may have been legitimate split chassis.** Check recoverability.

## Read first

- `arborist/BACKLOG.md` — Brief 20 (Sextant, `2a3114c`), Brief 22 (spatial forest decomposition — **tightly coupled, see below**), Brief 1.5c (Riven), Brief 0 (Whittle)
- `arborist/survey-deleaf.js` — `isBundleDoc`/`findGeometryRoots`/`processBundleGlb` (Riven's multi-root decomposition), the new `--clean`/regen path + `surveyTrunkClusters`/`computeDominantTrunkBase` (Sextant, Brief 20)
- `arborist/state/_chassis-curation.backup-2026-05-22.json` — **pre-Brief-20 curation, name-keyed → a record of what chassis names existed before.** Diff against current `_chassis/` to find split chassis that vanished.
- Sextant's Brief 20 NOTES entry + survey — the 17 "orphans" list, the `surveyTrunkClusters` forest worklist
- `git log` for `arborist/` (the chassis themselves are gitignored, but the curation backup + Riven's report give the pre-regen naming)
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_geometry_briefs_need_artifact_inspection]]`, `[[feedback_orphan_audit_full_repo]]`, `[[feedback_structural_heuristic_needs_sibling_check]]` (Riven's sibling-coherence suppressor — don't re-introduce false-bundle bugs)

## The forensic step is the brief's first deliverable (do this BEFORE any restoration code)

Produce a table: **every forest/multi-tree source → how it was decomposed pre-Brief-20 → its state now (split / un-split / missing) → the process that split it (Riven multi-root `processBundleGlb` / single-mesh ??? / manual).** Concretely:
1. Diff `_chassis-curation.backup-2026-05-22.json` chassis names vs current `_chassis/` — which split chassis names vanished?
2. Confirm gleditsia/populus regression: were they in the regen's bundle path? Why did candicands survive but not them (source change? detection drift? `--clean` ordering)?
3. For single-mesh forests (`acer_saccharum_a/c` etc.): were they EVER split, and by what? (If a separate script or manual pass — that's the lost process to reconstruct.)
4. The 17 orphans Sextant deleted: recoverable from source re-decomposition, or permanently lost (manual splits)?

**Surface this forensic table to Boz/operator as an alignment check before writing restoration code** — the fix differs sharply depending on what it finds (re-run a code path vs rebuild a lost process vs recover deleted data).

## Goal — and the durability requirement

**Goal:** every multi-tree source is decomposed into individual single-tree chassis again, AND `survey-deleaf.js`'s regen **re-creates the splits every time** so a future `--clean` can't re-regress. The regression's root lesson: **`--clean` must be idempotent-complete — anything it deletes, the regen must re-create.** Today it isn't (it deleted splits it couldn't regenerate).

**Two decomposition paths to make durable:**
- **Multi-root** (Riven's `processBundleGlb`) — repair why gleditsia/populus dropped; ensure all multi-root bundles re-decompose on regen.
- **Single-mesh** (the spatial method) — this is **Brief 22's territory** (spatial trunk-cluster decomposition, built on Sextant's `surveyTrunkClusters`). **Brief 22 and this brief are coupled** — the durable fix for single-mesh forests IS Brief 22's spatial decomposer, run inside the regen path. Either this brief absorbs Brief 22, or Brief 22 lands first and this brief integrates it into the regen. Coordinate with Boz on which; flag in your forensic alignment check.

## Do NOT
- Hide/exclude forests from the Salon (that was the wrong framing — they belong, as split singles).
- Delete or re-`--clean` anything before the forensic establishes what's recoverable. **No destructive ops until the regression is mapped.**
- Re-introduce Riven's false-bundle bug (the sibling-coherence suppressor exists for a reason — `[[feedback_structural_heuristic_needs_sibling_check]]`).
- Break the Brief 20 recenter (the dominant-trunk centering stays; decomposed sub-chassis each get recentered, same as Riven's path does).

## Acceptance criteria
1. **Forensic table delivered** (every forest source: pre-regen decomposition → current state → splitting process). Surfaced as an alignment check.
2. **Multi-root decomposition fully restored** — candicands + gleditsia + populus (Riven's 18) all present + split again; the gleditsia/populus regression repaired at its cause.
3. **Single-mesh forests decomposed** — `acer_saccharum_a/c` etc. split into individual trees (via Brief 22's spatial method, integrated here or sequenced).
4. **Durable across `--clean`** — run `survey-deleaf.js --clean` twice; all splits present + byte-identical both times. The regen re-creates every split; nothing relies on a manual/external step.
5. **Salon catalog correct** — the slot-card picker shows individual trees, no group shots. (Composes with Boz's `7eef6c5` species filter.)
6. **No data permanently lost** — either every prior split is re-created from source, or any genuinely-unrecoverable manual split is explicitly surfaced for operator decision.
7. **Curation reconciled** — stale curation entries pointing at now-renamed/removed chassis (e.g. `broadleaf_rt3` no-wood) cleaned or surfaced; name-keyed curation re-resolves.
8. **Determinism** — same source → byte-identical decomposed chassis across runs.

## Surface anything not in this brief
- The exact gleditsia/populus regression cause (source moved? detection drift? `--clean` deleted-then-didn't-recreate?).
- Whether single-mesh forests were previously split by a **lost script or manual work** (the scary case — surface immediately if data is unrecoverable).
- `--clean` safety as a general fortification concern — should it refuse to delete anything the regen won't re-create? Propose a guard.
- Brief 22 merge/sequence decision.

## Out of scope
- Brief 21 (extreme mis-scale normalize) — separate, though `acer_saccharum_a/c` are ALSO mis-scaled (decompose here, rescale there).
- The deferred Brief-20 cleanup (delete quiet trunk-finders, collapse Brief 19 conjugation).
- 3A deformer.

## Dispatch posture
Cold dispatch, **solo** (touches `survey-deleaf.js` — coordinate with Brief 22 if dispatched together; serialize per `[[feedback_load_bearing_files_serial_dispatch]]`). **Forensic alignment check BEFORE restoration code** per `[[feedback_geometry_briefs_need_artifact_inspection]]` — the fix shape depends entirely on what the regression map shows.

— Boz
