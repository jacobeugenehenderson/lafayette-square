# Brief 6.2 — Connected-mesh bark decimation (Linden-class targets)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Why this brief exists

Brief 6 (Spindle, shipped 2026-05-22 commit `3bd0a17`) added card-aware leaf-card reduction (Lever 3) + adaptive simplify-to-bracket (Lever 4). Spindle's survey surfaced a finding that neither Olmsted's nor Boz's brief drafting anticipated:

> *"Linden's bark is one 722K-tri single primitive — the heaviest single target across the chassis library, dwarfing Robinia's 193K leaf primitive. Brief 6 was framed around leaf budgets ballooning post-Brief-5, but on real per-tree numbers the bark side dominates on connected-mesh species. Lever 3 can't touch bark; that target needs generic simplifier or future Brief 6.1."*

— Spindle, ship report 2026-05-22

Brief 6.1 (already drafted) picks up the pre-merge branch-decimation levers for the procedural + LiDAR paths. **This brief — 6.2 — picks up the connected-mesh bark side specifically.** Salon-imported chassis (vendor stock) with connected-mesh bark primitives need targeted decimation that the generic `MeshoptSimplifier` may handle adequately at the right error tolerances, or may need a richer approach.

The headline target: **Linden's `american_linden_a` chassis, 722K-tri single bark primitive**. This single primitive at scale across 745 LS placements is the dominant bake-time bark budget on connected-mesh species.

## What's currently broken

`MeshoptSimplifier` is generic. It applies the same error budget across all primitives within a chassis. Spindle's Brief 6 Lever 4 made the ratio adaptive per-LoD via tri-count brackets, but the underlying simplifier doesn't differentiate "I'm decimating a leaf card mesh" (where alpha-test edges are silhouette-load-bearing) from "I'm decimating a bark mesh" (where surface continuity matters more than UV edge preservation).

Result on Linden: the simplifier refuses to collapse the bark beyond its topology floor at default error. Lever 4's brackets log `✗bracket` because the simplifier can't compress further without breaking the mesh.

The architectural question this brief answers: **can we apply bark-specific error tolerances + targeted simplification to connected-mesh wood primitives to break through the topology floor**, without visible damage at LS Hero/Browse distance?

## Mission

Extend Spindle's `arborist/decimate-tree.mjs` with a **bark-aware Lever 5: connected-mesh bark decimation**. The lever operates ONLY on wood primitives stamped `atlasKind: 'bark'` whose vertex count exceeds a threshold (e.g., 100K verts) — i.e., the Linden-class heavyweights. Smaller bark primitives are untouched.

Two operations within Lever 5:

1. **Aggressive error budget for bark.** Pass a higher error tolerance to `MeshoptSimplifier` for the bark primitive specifically (e.g., `0.01` vs the default `0.0005` Spindle's bracket-aware path uses). Surface continuity matters more than micro-detail; bark fragments tens of meters across the canopy can afford coarser sampling.

2. **Optional decimation-via-quadric-edge-collapse** if MeshoptSimplifier's aggressive-error path still can't hit the bracket. Quadric-edge-collapse is a different mesh-decimation algorithm that may handle large connected meshes better than meshopt's edge-flip-based simplification. `meshoptimizer` includes `MeshoptSimplifier.simplify` (already used) and `MeshoptSimplifier.simplifyWithAttributes` (preserves attributes); a third option `MeshoptSimplifier.simplifyWithAttributes` with relaxed `error_target` parameters may suffice. Surface the algorithmic choice in the survey.

## Files you'll touch

| File | Status | ~LOC |
|---|---|---|
| `arborist/decimate-tree.mjs` | edit — add `decimateBarkPrimitives(doc, opts)` function alongside Spindle's `decimateLeafPrimitives`. Operates only on bark primitives with vertex count > threshold; passes aggressive-error budget to MeshoptSimplifier; falls back to alternate algorithm if first pass undershoots. | +150 |
| `arborist/publish-glb.js` | edit — call `decimateBarkPrimitives` after `decimateLeafPrimitives`, before Lever 4 (adaptive simplify-to-bracket). Spindle's Lever 4 then runs over the already-reduced bark mesh. | +20 |
| `arborist/decimation-defaults.json` | edit — add `barkDecimation` sub-tree: `vertexThreshold` (default 100000), `errorTolerance` (default 0.01), `algorithm` enum ('meshopt'/'quadric'/'auto') | +15 |
| `arborist/ARCHITECTURE.md` | edit — note Lever 5 in the publish-loop diagram + bark decimation discipline | +20 |
| `arborist/BACKLOG.md` | edit — mark Brief 6.2 shipped | +5 |
| `arborist/NOTES.md` | edit — session entry | ~50 |
| `scratch/brief-6.2-bark-decimation-survey-<your-name>.md` | new — per-species bark decimation report (before/after vert + tri counts + visual diff notes) | ~150 |

Total: ~410 LOC.

## Acceptance criteria

1. **Linden bark significantly reduced.** Run Brief 6.2 against `american_linden_a` (the headline target). Bark primitive vert count drops by ≥50% at LoD0 vs Spindle's post-Brief-6 baseline. Quantify per-LoD.
2. **Visual diff at LS Hero distance.** Linden trunk + branches retain visible silhouette continuity. No tearing, no holes, no obvious facet-flat regions. **Operator-eye verification required.** Baby provides before/after screenshots in the survey.
3. **Visual diff at LS Browse distance.** Same — at Browse distance the bark is small but parallax-visible; ensure simplification doesn't create silhouette artifacts.
4. **Naturally-light bark untouched.** Italian Cypress and procedural broadleaf bark primitives (well below 100K verts) no-op. Verify in survey.
5. **Lever 3 (Spindle's leaf reduction) still fires.** Run Robinia through the pipeline; leaf-card reduction count matches Spindle's reported numbers. No regression on Brief 6 acceptance.
6. **Lever 4 (Spindle's adaptive simplify-to-bracket) still fires after Lever 5.** The bark mesh entering Lever 4 is now smaller; Lever 4's adaptive ratios should produce LoD tiers that fit within budget better. Surface delta in `✗bracket` log count (target: fewer bracket misses on Linden-class chassis).
7. **Determinism.** Same input → byte-identical output across two runs. Sha1sum verify.
8. **Idempotency.** Re-running on already-decimated GLB produces byte-identical output.
9. **No regression on Salon → bake → LS.** `bake-look.js` runs unchanged; per-Look master atlas size shifts only by the reduced GLB content (smaller, not larger).
10. **Per [[feedback_smallness_as_precondition]].** Survey reports per-species tri + vert + texture-footprint deltas. Perf measured, not asserted.

## Approach guidance

- **Read [[feedback_geometry_briefs_need_artifact_inspection]] first.** Inspect Linden's bark primitive structure before writing the decimator: vertex count, index pattern, atlas-kind extras, UV distribution. Confirm assumptions match data.
- **Start with MeshoptSimplifier's aggressive-error pass.** Don't reach for an alternate algorithm before measuring what MeshoptSimplifier can do at `errorTolerance: 0.01` (vs default `0.0005`). The cost of switching algorithms is large; the cost of tuning error tolerance is small.
- **Atlas continuity matters.** Bark UVs are rewritten into atlas sub-regions at bake-look time. Aggressive simplification may not preserve UV continuity across simplified edges. If `MeshoptSimplifier.simplifyWithAttributes` with UV preservation works, prefer it.
- **Surface continuity is more important than micro-detail.** Bark photo wraps onto cylinder geometry. The eye reads "is the bark surface continuous and unbroken" before "is the bark surface micro-detailed." Aggressive simplification that preserves continuity reads fine; simplification that introduces faceting or tears reads broken.
- **Salon-imported chassis only.** Procedural + LiDAR chassis have their bark generated from cylinders that are NOT connected meshes (each cylinder is a separate small primitive). Lever 5 only applies to chassis with `vertexCount > vertexThreshold` AND `atlasKind === 'bark'`; everything else no-ops naturally.
- **Don't add per-vertex tagging.** The decimator reads atlasKind from primitive extras (set by `survey-deleaf.js` per Brief 5). Don't add new attributes; reuse what exists.
- **Quality bracket coordination with Lever 4.** Spindle's Lever 4 logs `✗bracket` when the simplifier can't compress below a minimum vert count. Your Lever 5 should report whether Lever 4's `✗bracket` count drops on connected-mesh-bark species after your work lands. That's the success signal.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- Linden's bark mesh has structure your algorithm can't handle cleanly (e.g., heavy degenerate triangles, disconnected components, internal seams) — surface BEFORE drafting the algorithm
- MeshoptSimplifier's aggressive-error pass produces visible artifacts at LS Hero — surface visually + propose alternative
- Alternate algorithms (quadric edge collapse) aren't tractable in JS land — surface and propose either Python-side or external tool
- Atlas UV continuity breaks under aggressive simplification — surface and propose recovery
- Spindle's Lever 4 brackets need re-tuning after Lever 5 lands — surface recommendation
- Bark decimation interacts with Brief 2.1's gradient REPLACE semantics (luminance per-pixel from a decimated bark sample may smear differently) — surface visual concern
- Bark decimation interacts with Brief 10's view-aware tier work (if Brief 10 has shipped at the time you pick this up) — coordinate
- Other connected-mesh-bark chassis show similar dominance to Linden's 722K — extend the threshold logic if needed

Surface in status update AND commit body.

## Out of scope

- **Leaf-side decimation** — Spindle's Lever 3 territory. Untouched here.
- **Generator-side pre-merge decimation** — Brief 6.1 territory.
- **Quality bracket re-tuning** — operator-tuned per chassis; out of decimation's scope.
- **Cardinal Configuration D runtime** (Points + A2C + LoD selection) — orthogonal.
- **Brief 10 (view-aware bark tiering)** — orthogonal; tier-selection is fragment-shader path; decimation is geometry-side.
- **Atlas-survey or bake-look changes** — `decimateBarkPrimitives` operates BEFORE bake-look; atlas pipeline downstream is unchanged.
- **Texture decimation / posterization** — that's Brief 10 sub-phase B territory.

## Memory refs

Read at session start:
- [[feedback_geometry_briefs_need_artifact_inspection]] (LOAD-BEARING; inspect Linden's bark primitive structure first)
- [[feedback_smallness_as_precondition]] (load-bearing doctrine)
- [[feedback_beautiful_first_lightweight_51]] (tiebreaker doctrine)
- [[feedback_baby_briefs_need_identity_framing]] (you are the baby)
- [[feedback_baby_must_surface_scope_drift]]
- `project_writeifchanged_touches_mtime`
- `project_view_aware_baking` — Brief 10 is the view-aware bark *rendering* brief; your work is decimation, separate concern but worth knowing the architecture
- Spindle's commit `3bd0a17` + survey + Brief 6 doc — context on what's already decimating

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 6.2 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the bake-time decimation triangle is closed:
- **Lever 3 (Spindle, Brief 6)** — card-aware leaf reduction (Robinia-class card-based leaf primitives)
- **Lever 5 (you, Brief 6.2)** — connected-mesh bark decimation (Linden-class heavy bark primitives)
- **Lever 4 (Spindle, Brief 6)** — adaptive simplify-to-bracket per-LoD per-chassis

Plus the pre-merge generator side (Brief 6.1 — Levers 1+2) when that lands.

Welcome to the decimation arc's closer.
