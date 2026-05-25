# Brief 6.2 — Connected-mesh bark decimation (Linden-class targets)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies in this project pattern-match heavily to names they see in NOTES.md / BACKLOG.md / code comments and pick collisions; Jacob has had to redirect repeated misfires (Holm 2026-05-23, Cambium same-day). Pattern-match risk is especially high on bark/atlas briefs — Holm shipped Brief 2 (bark gradients), Cambium shipped Brief 7 (Salon preview atlas), both will appear near your code.

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel.** Anything — a word, a symbol, a string of sounds, something in another language, something invented, a non-plant noun, a mineral, a tool, a star name, a piece of weather, a body of water, an architectural term, a verb conjugation. The project has saturated the plant-adjacent namespace; reach further. State your name in your first message back; sign your commits with it.

## Why this brief exists

The Arborist's mission is to deliver beautiful GPU-manageable assets at hundreds of simultaneous tree placements in the slab. Linden bark is the single largest obstacle to that mission today.

Brief 6 (Spindle, shipped 2026-05-22 commit `3bd0a17`) added card-aware leaf-card reduction (Lever 3) + adaptive simplify-to-bracket (Lever 4). Spindle's survey surfaced a finding that neither Olmsted's nor Boz's brief drafting anticipated:

> *"Linden's bark is one 722K-tri single primitive — the heaviest single target across the chassis library, dwarfing Robinia's 193K leaf primitive. Brief 6 was framed around leaf budgets ballooning post-Brief-5, but on real per-tree numbers the bark side dominates on connected-mesh species. Lever 3 can't touch bark; that target needs generic simplifier or future Brief 6.1."*

— Spindle, ship report 2026-05-22

Brief 6.1 (already drafted) picks up the pre-merge branch-decimation levers for the procedural + LiDAR paths. **This brief — 6.2 — picks up the connected-mesh bark side specifically.** Salon-imported chassis (vendor stock) with connected-mesh bark primitives need targeted decimation that the generic `MeshoptSimplifier` may handle adequately at the right error tolerances, or may need a richer approach.

The headline target: **Linden's `american_linden_a` chassis, 722K-tri single bark primitive**. LS has ~30+ Linden placements; at 722K × 30 = 21M+ bake-time bark tris from one species alone. This is the dominant park-wide bark budget. Getting Linden into Browse-distance budget at LoD2 is mission-critical for v1.5.

## Doctrine: this is the LoD pyramid working as designed — NOT a parallel lite chassis

The operator has explicitly ruled out authoring a `american_linden_lite` parallel chassis as the answer to Linden's weight. The doctrine for handling heavy species (per 2026-05-23 conversation) is that **one chassis publishes a parameterized family of reads, composed from existing tunable types**:

- **Geometry LoD bracket** (Brief 6 Lever 4 — shipped) — adaptive simplify produces LoD0/1/2 tiers
- **Leaf-card silhouette cull** (Brief 6 Lever 3 — shipped) — Robinia-class card-based leaf reduction
- **Bark mesh decimation** (this brief, Lever 5)
- **Bark substrate tier** (Brief 10B — in flight) — posterized + no-detail-composite at aerial tier
- **Bark tier driver** (Brief 11 lightweight — queued) — distance-driven tier swap in InstancedTrees
- **Generator pre-merge prune** (Brief 6.1 — cooled to v1.6+) — generator-side only
- **Hemisphere cull** (Brief 4 — queued) — back-facing leaf alpha = 0

Your work is the *geometry* axis of that family. The Browse-distance "lite Linden" emerges from composing your aggressively-decimated LoD2 bark mesh + Brief 10B's posterized substrate + (eventually) Brief 11's distance-driven tier swap. Browse-distance Linden should land at LoD2 + tier 0 — small geometry, small substrate, no detail composite. Hero-distance Linden stays at LoD0 + tier 1. **One chassis, multiple compositional reads.** Your job is to push LoD2 Linden bark through MeshoptSimplifier's topology floor so the LoD pyramid actually has a usable bottom rung.

This framing matters because it tells you what "good enough" looks like: LoD2 bark visible at LS Browse distance (parallax-small) reads coherently; LoD0 bark visible at LS Hero distance retains silhouette + surface continuity. The two operate under different visual budgets.

## What's currently broken

`MeshoptSimplifier` is generic. It applies the same error budget across all primitives within a chassis. Spindle's Brief 6 Lever 4 made the ratio adaptive per-LoD via tri-count brackets, but the underlying simplifier doesn't differentiate "I'm decimating a leaf card mesh" (where alpha-test edges are silhouette-load-bearing) from "I'm decimating a bark mesh" (where surface continuity matters more than UV edge preservation).

Result on Linden: the simplifier refuses to collapse the bark beyond its topology floor at default error. Lever 4's brackets log `✗bracket` because the simplifier can't compress further without breaking the mesh.

The architectural question this brief answers: **can we apply bark-specific error tolerances + targeted simplification to connected-mesh wood primitives to break through the topology floor**, without visible damage at LS Hero/Browse distance?

## Mission

Extend Spindle's `arborist/decimate-tree.mjs` with a **bark-aware Lever 5: connected-mesh bark decimation**. The lever operates ONLY on wood primitives stamped `atlasKind: 'bark'` whose vertex count exceeds a threshold (e.g., 100K verts) — i.e., the Linden-class heavyweights. Smaller bark primitives are untouched.

Two operations within Lever 5:

1. **Aggressive error budget for bark.** Pass a higher error tolerance to `MeshoptSimplifier` for the bark primitive specifically (e.g., `0.01` vs the default `0.0005` Spindle's bracket-aware path uses). Surface continuity matters more than micro-detail; bark fragments tens of meters across the canopy can afford coarser sampling.

2. **Algorithm escalation if aggressive error still can't hit the bracket.** `meshoptimizer` exposes `MeshoptSimplifier.simplify` (the default Spindle uses) and `MeshoptSimplifier.simplifyWithAttributes` (preserves vertex attributes including UVs across collapses — likely the right tool for bark since UVs carry atlas-region addressing). Try `simplifyWithAttributes` with a high `error_target` and explicit UV-stream weighting before reaching for anything more exotic. If even that hits a floor, surface the wall and the survey is the deliverable — don't blindly reach for a quadric-edge-collapse implementation that doesn't exist in the project's tool chain. The cost of switching to a non-JS algorithm (e.g., a Python preprocessing step) is large; surface it for operator decision rather than shipping it.

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

## Coordination

- **Brief 18A is dispatching in parallel** — pure UI pivot in `src/arborist/*.jsx` (retiring the Library landing page, defaulting Arborist into Salon). Zero file overlap with this brief. Confirm via `git status` before commit that you've touched only the files listed in the file-by-file plan; if you find yourself near `src/arborist/ArboristApp.jsx` or any workstage file, you've drifted.
- **Brief 10B is queued** (substrate-tier posterization + aerial/hero swap). Its commit may land before or after yours; both write to bake-time artifacts but at different stages (10B is `unifyAtlases` + atlas extraction; 6.2 is `decimate-tree.mjs` + `publish-glb.js`). Should not collide. Per `[[feedback_load_bearing_files_serial_dispatch]]`: if you find yourself editing `bake-look.js#unifyAtlases` or atlas-survey code, you've drifted out of decimation territory — surface and pause.

## Acceptance criteria

1. **Linden bark significantly reduced at LoD2.** This is the load-bearing target. LoD2 is the Browse-distance read; if LoD2 still misses bracket on Linden, the LoD pyramid is broken and Brief 11's distance-driven tier swap has nothing to swap *to*. Quantify Linden bark primitive vert + tri counts per-LoD pre- and post-6.2; LoD2 should clear `decimation-defaults.json`'s configured max (operator-tunable; today's default 20K, may need bumping per Spindle's "tight bracket" finding — survey it).
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

- **Authoring a parallel "lite" chassis** (e.g., `american_linden_lite`) — explicitly ruled out by operator 2026-05-23. The doctrine is one chassis publishes a parameterized family of reads via the LoD pyramid + tier system; your job is to make the existing pyramid's LoD2 floor *real* for Linden, not to invent a second chassis. If you find yourself reaching for a parallel-file approach, you've drifted.
- **Leaf-side decimation** — Spindle's Lever 3 territory. Untouched here.
- **Generator-side pre-merge decimation** — Brief 6.1 territory (cooled to v1.6+).
- **Quality bracket re-tuning** at the global level — operator-tuned per chassis; if you find Linden needs a per-species bracket override (e.g., `species-map.json#/<species>/decimation`), surface as a follow-up; don't ship the per-species override plumbing yourself.
- **Configuration D runtime** (Points + A2C + LoD selection) — orthogonal.
- **Brief 10B (substrate tier swap)** — orthogonal; tier-selection is fragment-shader path; decimation is geometry-side. They compose at runtime but don't share files.
- **Atlas-survey or bake-look changes** — `decimateBarkPrimitives` operates BEFORE bake-look; atlas pipeline downstream is unchanged.
- **Texture decimation / posterization** — Brief 10B territory.
- **Brief 11 distance-driven tier swap** — runtime, in InstancedTrees.jsx; orthogonal.

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
