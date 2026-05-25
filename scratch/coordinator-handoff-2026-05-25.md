# Coordinator Handoff — Arborist, 2026-05-25 (Boz → next coordinator)

You're New Boz, the new coordinator. This note hands you the seat for the next tranche: **Brief 3A (per-instance deformer) + Brief 6.3-followup (bark lod2 floor)**. Previous Boz held the chassis-quality + bark-pipeline tranche; it's closed and committed. Read this, then the load-bearing docs below, and you'll be productive in your first hour.

## You are the coordinator — the operating model

You draft briefs. **Jacob (the operator) dispatches them** by pasting your drafted brief into a fresh baby-agent window. You do NOT dispatch babies yourself. You also: trust-but-verify baby commits, propose plans, ask clarifying questions, write memory entries when lessons surface, and keep the quartet + auto-memory current.

The relationship triangle:
- **Jacob** has *visual authority* — he sees the Salon, judges what's right, drives decisions. The ONLY one who can confirm a visible result.
- **Babies** have *file context* — they read/write code, run bakes, hit compiler errors. They have hands.
- **You** have *architectural memory* — you hold the cross-arc plan, remember why earlier attempts failed, spot patterns. Bird's-eye view nobody else has.

## Read these FIRST (load-bearing, in order)

1. **Auto-memory** — `~/.claude/projects/.../memory/MEMORY.md` is the index, always loaded. Read the linked entries. This is where the doctrine lives.
2. **The arborist quartet** — `arborist/FEATURES.md` (what's shippable), `arborist/ARCHITECTURE.md` (load-bearing patterns), `arborist/BACKLOG.md` (in-flight + the brief history — read the top Salon-arc section), `arborist/NOTES.md` (dated decision record). Read at session start, update at session end, prune toward pristine.

## Current state (as of this handoff)

**The chassis library is correct** — the big achievement of the closing tranche. Every chassis is: split (58 multi-root + garden_mix multipack — Whittle/Riven + the 6.2-classifier-fix-on-regen), centered (Brief 20 dominant-trunk → origin), rescaled (Brief 23 unit-fixed the 900–1700m mis-scales), forests suppressed (≥3-trunk merged group-shots out of the Salon catalog), procedural/lidar filtered out of the catalog, and `--clean` is now idempotent-complete-guarded.

The library is correct in `_chassis/`. **No slab propagation is pending** — verified at handoff that there are zero *vendor* Salon compositions yet (a `generate-salon` run published nothing), so nothing currently in the slab derives from the corrected chassis. The fixes flow to the slab naturally when Jacob composes a vendor species in the Salon → publish → Grove bake (his normal prep loop, which he's about to ramp). So you develop 3A against a fully-correct in-source library; there's no propagation gesture to wait on.

**LiDAR is a dormant test path — ignore it.** The one composition on disk (`acer_saccharum`, a LiDAR-seedling species) is leftover test residue; Jacob confirmed 2026-05-25 that "we don't need any LiDAR pieces right now, that was only a test, it's irrelevant." Don't chase the LiDAR-species publish filter, the Scan-mode workspace, or `bake-tree.py` — the live v1.5 path is **vendor chassis → Salon composition**. (Procedural's status wasn't restated; treat it as-is unless Jacob says otherwise.)

## Your two live items

### Brief 3A — per-instance deformer engine (the v1.5 artistic-integrity capstone)
- **Drafted + dispatch-ready:** `scratch/brief-3a-per-instance-deformer-engine.md`. Just refreshed (2026-05-25) to the centered-library premise.
- **Design (locked with Jacob):** one chassis per species → ~100 visually-distinct reads via per-instance vertex-shader displacement. Operations: **lean + twist + wander only** (all rotational/translational → normals stay correct for free; canopy-asymmetry + branch-jitter are deferred to 3C because they need inverse-transpose normals). Procedural-fill ranges (per-species `composition.deformer.range`) sampled by a per-instance world-XZ hash (jh5/jh6). `aTreeHeightNorm` per-vertex attribute (revives Cork's retired stamping pattern). **Pivot is trivially origin** (Brief 20 centered everything). Designed-slots + PlaceCard binding = deferred 3B (post-integration).
- **Composes with shipped work:** deformer reshapes rest pose → wind (Brief 9a) oscillates around it; both vertex-shader terms, single program preserved.
- **Two inspection points for the baby** (the third, trunk-base pivot, is resolved): which normal var is live at `<begin_vertex>`, and the instance-anchor accessor.
- **Dispatch posture:** cold, solo (touches `treeAtlasMaterial.js` + `InstancedTrees.jsx` + both authoring surfaces — load-bearing extension points, serial-dispatch).
- **When 3A ships:** you owe Jacob the **Stratum-2 generation-arc prune** — formally cool the ~20 cooled Phase E/F/G/H/B/T items (the synthesize arc the Salon pivot superseded). Brief 3A is the capstone that validates compose-don't-synthesize; its ship is the trigger to archive the competing arc.

### Brief 6.3-followup — bark lod2 floor (the last mobile-gate mile)
- **Filed in BACKLOG, not yet a baby brief.** Your **first question to Jacob** is the path choice: (a) bracket-retune (accept ~40-58K lod2, defeats mobile budget), (b) impostor/billboard lod2 (true mobile win, new runtime+bake path), (c) sloppy-with-vertex-lock (needs prototyping). Boz's lean was (b). Once Jacob picks, draft the full brief.
- **Context:** connected-mesh bark (Linden-class) floors at ~57.7K tris under attribute-aware simplify — an *error-budget-independent topology floor* (see `[[meshopt-attribute-topology-floor]]`). Gnomon's Brief 6.3 cleared the leaf half; this is the bark half.

## Session doctrine you MUST internalize (the memory entries)

- **Forensic-first alignment-checks are the single most valuable discipline.** Babies surfacing a premise-check BEFORE writing code saved this arc FIVE times (Spindle topology, Adze silent-no-op, Gnomon bark floor, Corbel pivot, Mistral the-regression-that-wasn't). Write briefs that EXPECT and welcome it. `[[feedback_geometry_briefs_need_artifact_inspection]]`. **Corollary Boz learned the hard way:** verify your OWN premises (counts, grep patterns) before asserting a problem — Boz drafted a whole "restoration" brief around a regression that didn't exist (miscounted 18-vs-42, grepped vendor-vs-common names). Mistral's forensic caught it. Verify before you assert.
- **`--clean`/destructive regens must be idempotent-complete** — `[[clean-regen-must-be-idempotent-complete]]`. Re-create everything you delete from source, or you silently lose cross-producer/manual artifacts.
- **Salon is the ONLY review surface; LS is the deployment target** — `[[salon-preview-is-authoring-surface-and-only-review-surface]]`. Never frame an AC as "verify in LS at Hero distance." Jacob works in the Salon. Effects invisible there are functionally undeployed.
- **Parallel-dispatch name collisions** — `[[retired-baby-names]]`. The claimed-names list only prevents collisions with *shipped* babies; two concurrent babies can pick the same name (Corbel happened). When handing Jacob multiple briefs to dispatch at once, seed each with a different name-domain. Saturated domains now: plants, architectural elements (Lintel/Mullion/Corbel), minerals (Quartz), instruments (Sextant), weather (Mistral).
- **Load-bearing files → serial dispatch** — `[[feedback_load_bearing_files_serial_dispatch]]`. `treeAtlasMaterial.js`, `bake-look.js#unifyAtlases`, `InstancedTrees.jsx`, `survey-deleaf.js`, `SalonWorkstage.jsx` are multi-edit extension points; "mostly orthogonal" understates the rebase cost.
- **Smallness as precondition for niceness** — `[[feedback_smallness_as_precondition]]`. Every brief: "is this making things smaller, or only prettier?" AND never cut the visual bar to get smaller. Resolution is always cleverness.
- Plus the standing set: beautiful-49/lightweight-51, procedural-trees-are-the-destination, the kit-helper pattern, the slab-is-the-instance-identity doctrine. All in MEMORY.md.

## Baby roster (keep it collision-free)

Claimed (do NOT reuse): Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral. (Coordinators: Olmsted, Boz.) Update this + `[[retired-baby-names]]` as babies ship.

## Deferred / pending (don't lose these)

- **Brief-20/23 cleanup** — delete the now-quiet trunk-finders (`computeDominantTrunk`/`computeAutoCenterPivot`) + collapse Brief 19's conjugation to plain `R·S·T`. **Gated on Jacob's Salon verification** that Brief 20/23 render right (propagation's done; the gate is just his eye-confirm) — don't dispatch the cleanup until he's confirmed.
- **Operator-eye verifications Jacob owes himself:** Brief 19 AC#4/#5 (authored transforms render unchanged on recentered chassis), the gradient-tier 10B.1 test (does a contrasty gradient over-stylize the hero trunk? → maybe a tier-gated-gradient refinement).
- **Brief 23a (merged-forest 3D segmentation) is filed-but-dormant** — `scratch/brief-23a-merged-forest-segmentation.md`. Do NOT dispatch unless Jacob surfaces a concrete need for those specific vendor merged-forest trees as individuals (he won't — Sugar Maple singles come from LiDAR/procedural). It's the hard crown-interleave case for a handful of unused assets.
- **`_chassis-forests.json`** is now committed (small metadata driving Salon suppression; tracked like the curation file).

## How to operate with Jacob (what Boz learned)

- He's **decisive and pragmatic** — give him a clear recommendation + the one tradeoff, then his call. He redirects fast when you're wrong.
- He has **visual authority** — confirm visual-bug diagnoses with him before drafting briefs that assert which-side-has-the-bug (`[[feedback_verify_diagnosis_with_user]]`).
- He pulls threads hard — "why two trunk-centerers?" cascaded into mapping the entire chassis-quality problem space. When he asks a sharp question, it usually means there's a real architectural fault worth chasing.
- He prefers **one re-publish+bake after a batch of regen changes**, not one per brief — don't make him pay the slab-rebake blast radius repeatedly.
- He values **honest scope walls** and surfaced findings over silent work. The babies that shine here surface alignment-checks.
- **Fix the foundation before the capstone** — the chassis-quality detour (20/23) was unplanned but necessary; you genuinely can't ship a deformer onto an off-center/mis-scaled/un-split library. He understood that and took the detour deliberately.

Good seat. The library's correct, the doctrine's captured, 3A is dispatch-ready and 6.3-followup is one decision from drafting. Take it home.

— Boz
