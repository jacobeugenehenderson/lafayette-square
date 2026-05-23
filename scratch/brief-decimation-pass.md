# Brief 6 — Geometry-Aware Tree Decimation Pass

> **✓ SHIPPED 2026-05-22 (Spindle, commit `3bd0a17`) — reframed to A+B during execution.**
>
> **What actually shipped:** Lever 3 (card-aware leaf-card reduction) + Lever 4 (adaptive simplify-to-bracket replacing fixed 0.85/0.40/0.10 ratios). `arborist/decimate-tree.mjs` is IMPORTED by `arborist/publish-glb.js`, not a standalone CLI step between generators and publish-glb. CLI mode preserved for testing.
>
> **What was dropped (filed as Brief 6.1):** Lever 1 (Order-N twig pruning) + Lever 2 (parallel-branch collapse). These prescribed walking a per-branch node graph that doesn't exist on flat-merged chassis GLBs. Generator-side, pre-merge, separate brief: operating inside `generate-procedural.js`'s SCA graph + `bake-tree.py`'s LiDAR cylinder graph.
>
> **New follow-up (Brief 6.2 candidate):** connected-mesh bark decimation. Spindle surfaced that Linden bark is one 722K-tri single primitive — the dominant heaviness target across the chassis library, heavier than any leaf primitive. Lever 3 can't touch bark; needs different approach.
>
> **Numbers caught and corrected:** brief said `publish-glb.js` ran `MeshoptSimplifier` at LoD0=1.0; actual was 0.85. Brief example brackets (LoD0: 5K-15K) were tighter than the simplifier's topology floor; 13/15 tiers logged `✗bracket`. Defaults shipped tight on purpose so operator tuning has per-species signal; recommended retune: LoD0 15K-200K / LoD1 5K-60K / LoD2 1K-20K.
>
> **Doctrine encoded by Spindle's catch:** [[feedback_geometry_briefs_need_artifact_inspection]] — briefs prescribing geometry-shape operations must inspect actual artifacts BEFORE drafting required levers. Topology often collapses through merge/bake steps.
>
> Original brief text preserved below for history; future readers should treat the Lever 1+2 sections as Brief 6.1 scope, not Brief 6.

---

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Where you are in the Salon arc

You're joining an in-flight project — the **Salon arc** in the Arborist helper. Salon is the operator's compose-not-synthesize authoring surface for trees: operator picks chassis + bark + leaves from libraries, publishes a per-species composition, runtime renders it across LS placements. The arc is shipping v1.5 quality by composition (vs the procedural / LiDAR arcs that hit ceilings).

**Recent shipped briefs in the arc** (read commit bodies if you want full context):

| Brief | Baby | Shipped | What it did |
|---|---|---|---|
| Brief 0 | Whittle | 2026-05-21 | Vendor stock survey + chassis library (`public/trees/_chassis/`) |
| Brief 1 | Sequoia | 2026-05-21 | Salon workstage stand-up (4th top-level mode in Arborist) |
| Brief 1.5a-e | Sequoia / Quill / Riven / Fern | 2026-05-21 | Visible-quality completion, chassis curation, bundle-aware de-leaf, 10-leaf-pack library |
| Brief 2 | Holm | 2026-05-21 | Multi-stop gradient bark + LUT bake + atlas integration |
| Brief 2.1a | Cinder | 2026-05-22 | Bark detail-texturing Overlay composite |
| Brief 2.1c | Sorrel | 2026-05-22 | leafAttachmentTags world-space contract |
| Brief 5 | Tendril | 2026-05-22 | Vendor-leaf preservation + cousin-swap pivot (chassis keep leaf primitives, Salon binds picked pack texture) |
| Brief 2.1 | Birch | 2026-05-22 | Bark gradient luminance pivot (REPLACE semantics — gradient sample at `luminance(bark)` becomes the bark color) |

**Doctrine you're operating within:**
- **Cousin swap thesis** — chassis is wood-only skeleton; bark and leaves come from species-agnostic libraries the operator picks. A "Sugar Maple" is a composition of chassis (any broadleaf shape) + bark (any library ref) + leaves (any pack).
- **Single shader program** — Bloom requires every tree-material variant to compile to the same WebGLProgram. Uniform-driven branching only, no sibling materials.
- **Single atlas binding** — every tile (bark color, bark normal, gradient LUT, bark detail, leaf shape) packs into one master `trees-atlas-color.png` + one `trees-atlas-normal.png`. Adding new sub-pages = larger PNG within the SAME binding.

**What's currently broken / unsatisfying** that motivates THIS brief:

Trees in LS are "lethally too big" at 745 placements. The Salon arc shipped authoring quality but didn't address bake-time geometry weight. `publish-glb.js` today runs `MeshoptSimplifier` to produce LoD0/1/2 tiers, but that simplifier is generic-mesh-aware — it doesn't know a tree from a teapot. Tree topology has STRUCTURED redundancy (high-order twigs invisible at Browse distance, parallel branches that collapse without silhouette loss, sparse leaf cards outside the canopy hull) that a tree-aware decimation step can exploit BEFORE the generic simplifier runs.

After Brief 5 (vendor-card preservation), the leaf tri budgets ballooned — Robinia bundle has ~800K leaf tris per tree; Linden has 470K. At LS Hero across 745 placements that's prohibitive. **Your brief is the bake-time half of the perf solution.** Configuration D (runtime Points + A2C) is the queued companion brief; both feed v1.5's "60fps mobile" ship target.

## Mission

Add a **tree-aware geometry decimation step** between the upstream generators (procedural, salon, LiDAR) and `publish-glb.js`'s `MeshoptSimplifier`. The new step operates on the structure of tree geometry — wood (skeleton cylinders) and leaf cards (alpha-test quads) — and reduces both intelligently before the generic simplifier ratios apply.

**Doctrine context (LOAD-BEARING):** read [[feedback_smallness_as_precondition]] before drafting any acceptance criterion. Smallness is the precondition; aesthetic quality is the product. The corner cut can never be visual. The way out of tradeoffs is cleverness — find techniques that reduce geometry weight WITHOUT visible quality loss at Hero/Browse distances.

## Read first

- [[feedback_smallness_as_precondition]] — the load-bearing doctrine
- [[feedback_beautiful_first_lightweight_51]] — the tiebreaker doctrine that grounds it
- [[feedback_baby_must_surface_scope_drift]] — anything you find that the brief didn't anticipate, surface in your status update AND commit body. Don't quietly extend scope.
- `arborist/FEATURES.md` — pipeline integration overview
- `arborist/ARCHITECTURE.md` — publish-loop pattern, two-tier substitution, vendor-leaf preservation (Brief 5)
- `arborist/NOTES.md` recent entries (Brief 2.1c Sorrel, Brief 2.1a Cinder, Brief 5 Tendril, Brief 2.1 Birch)
- `arborist/BACKLOG.md` — "Cycle 2 sub-item: quality-bracket LoD authoring" (~line 605, originally surfaced for Phase L; now generalized to all tree publish paths)
- `arborist/publish-glb.js` end-to-end — the bake-time LoD generation pipeline you'll extend
- `arborist/generate-procedural.js` + `arborist/generate-salon.js` — the upstream callers that produce source GLBs before publish-glb
- `arborist/survey-deleaf.js` — recent classifier work (node-name LEAF/WOOD rules + atlasKind extras stamping). Your decimation logic reads `atlasKind` to partition wood from leaf primitives.
- A 2–3 representative tree variant GLBs at `public/trees/<species>/skeleton-N-lod0.glb` — load via `gltf-transform inspect` to see actual tri counts, primitive structure, leaf-vs-wood split
- Memory: `feedback_smallness_as_precondition`, `feedback_beautiful_first_lightweight_51`, `feedback_unique_program_cache_key_before_wrappers`, `feedback_baby_must_surface_scope_drift`, `project_writeifchanged_touches_mtime`, `project_view_aware_baking`, `project_vendor_leaf_topologies` (two leaf-primitive topology classes: card-based vs connected-mesh — your leaf-card-reduction lever needs to handle both)

**Critical interaction with Brief 5 (vendor-leaf preservation)**: chassis now ship with vendor's leaf-card geometry intact (stamped `atlasKind='leaf'`). Vendor leaf primitives have two topology classes per `project_vendor_leaf_topologies`:
- **Card-based** (Robinia A/B style: 4 consecutive verts per card, max vert-use=1) — your silhouette-preserving leaf-card reduction lever applies directly; iterate cards-per-anchor or convex-hull-distance.
- **Connected-mesh** (Linden style: sculpted 3D leaves with shared verts) — card boundaries don't exist; standard `MeshoptSimplifier` on the connected mesh is the right tool. Your custom lever may not apply to these; let publish-glb's existing simplifier handle them. Surface what you find.

The leaf primitives can be VERY heavy post-Brief 5 (Robinia bundle ~800K leaf tris/tree, Linden ~470K). This is the headline reason this brief exists.

## Goal — and what this phase explicitly does NOT do

Add a **tree-aware geometry decimation step** between the upstream generators (procedural, salon, LiDAR) and `publish-glb.js`'s `MeshoptSimplifier`. The new step operates on the structure of tree geometry — wood (skeleton cylinders) and leaf cards (alpha-test quads) — and reduces both intelligently before the generic simplifier ratios apply.

Required levers (operator-tunable via per-bake config):

1. **Order-N twig pruning** — wood primitives in the skeleton have implicit branching depth; prune branches above order N (configurable; e.g., N=4 keeps trunk + primary + secondary + tertiary scaffolds, drops 4th-order+ twigs). At Browse distance, 4th-order twigs are sub-pixel and contribute nothing.
2. **Parallel-branch collapse** — detect roughly-parallel adjacent branches within a small angular cone and merge them into one geometry. Visual silhouette preserved; tri count drops.
3. **Silhouette-preserving leaf-card reduction** — leaf cards near the canopy hull (outer silhouette) are visible; leaf cards INSIDE the canopy hull are mostly overdraw. Reduce inner cards by an operator-tunable factor; preserve outer-silhouette cards intact.
4. **Quality bracket** — operator declares a target tri-count BRACKET per LoD tier (e.g., LoD0: 5K–15K tris; LoD1: 1.5K–5K tris; LoD2: 300–1.5K tris). Decimation tunes its levers within the bracket; chassis with naturally fewer tris stay where they are.

Behavior per tree:
- Source GLB enters decimation step → tree-aware reduction → reduced GLB enters `publish-glb.js`
- LoD0/1/2 emerge from publish-glb's existing `MeshoptSimplifier` on the reduced source
- Net result: every LoD tier is structurally smaller than today, with no visible silhouette/foliage loss at the intended viewing distance

**Do NOT:**
- Modify the existing `MeshoptSimplifier` step in `publish-glb.js` — decimation runs BEFORE simplify, additively
- Touch runtime code (`treeAtlasMaterial.js`, `InstancedTrees.jsx`)
- Touch Brief 2 / 2.1's gradient + detail texturing path
- Touch Brief 4's hemisphere cull path
- Modify `survey-deleaf.js` (chassis library generation stays as-is)
- Modify the Salon UI (operator's perf-bracket dial lives in a config file, not a UI knob — defer UI exposure to v1.6)
- Add full LoD-per-SHOT bake variants (that's Phase V, separate brief)
- Drop visual quality at any target view distance — the silhouette + foliage density at LS Hero/Browse must remain intact (verify visually before acceptance)

## Architecture

### Doctrine constraints

- **Smallness pillar.** This entire brief IS smallness. Acceptance criteria measure tri-count delta concretely.
- **Niceness pillar.** Visible silhouette at LS Hero/Browse must remain intact. Acceptance includes visual diff (before/after screenshots at typical LS view distance). If decimation drops visible quality, the lever is too aggressive — back off the bracket.
- **Cleverness pillar.** Where smallness and niceness collide, find the technique that delivers both. E.g., inner-canopy leaf cards drop heavily (invisible from outside the canopy hull) while outer-silhouette cards stay (visible). The technique IS the resolution.
- Determinism: same source GLB → byte-identical decimated GLB across runs
- `writeIfChanged` mtime touched on no-op
- Per [[feedback_unique_program_cache_key_before_wrappers]]: decimation is bake-time only; no shader changes; doctrine inapplicable but worth flagging if you find yourself tempted to touch runtime.

### Pipeline integration

New script: `arborist/decimate-tree.mjs` (or `.js` matching existing convention).

```
[upstream generator: generate-procedural / generate-salon / bake-tree]
    │ writes source GLB to /tmp
    ▼
[NEW: decimate-tree.mjs] ─ tree-aware reduction
    │ writes decimated GLB to /tmp
    ▼
[publish-glb.js] ─ existing MeshoptSimplifier LoD generation
    │ emits LoD0/1/2 .glb
    ▼
public/trees/<species>/skeleton-N-lod0/1/2.glb
```

Upstream callers (`generate-procedural.js`, `generate-salon.js`, `bake-tree.py` wrapper) need a one-line addition: before invoking `publish-glb`, run the source through `decimate-tree`. The decimation step is otherwise transparent.

Configuration per generator: each generator passes a `decimationConfig` argument with quality bracket + per-lever toggles. Defaults live in `arborist/decimation-defaults.json` (operator-editable).

```json
{
  "qualityBracket": {
    "lod0": { "minTris": 5000,  "maxTris": 15000 },
    "lod1": { "minTris": 1500,  "maxTris":  5000 },
    "lod2": { "minTris":  300,  "maxTris":  1500 }
  },
  "twigPruning":          { "enabled": true, "maxOrder": 4 },
  "parallelBranchCollapse": { "enabled": true, "angleThresholdDeg": 8, "distanceThresholdM": 0.15 },
  "innerCanopyLeafReduction": { "enabled": true, "innerHullDropFactor": 0.6 }
}
```

Per-species override in `species-map.json#/<species>/decimation` if any species needs different tuning (e.g., conifers have different topology + different visible-detail needs).

### Lever 1: Order-N twig pruning

Tree skeleton GLBs have wood primitives organized in a parent-child branching hierarchy (`generate-procedural.js` builds this via SCA; `generate-salon.js` lifts it from chassis source; `bake-tree.py` from LiDAR cylinder graphs). Walk the node graph; tag each branch with its depth-from-root order; drop primitives whose order > `maxOrder` AND whose tri count is small (don't drop a long thin major branch even if technically high-order).

Heuristic for "small enough to safely drop":
- Tri count < 100 AND order > maxOrder → drop
- Tri count < 50 (regardless of order) → drop (sub-pixel at any LoD)
- Otherwise keep

Sub-pixel test at LS Browse view distance: a 2cm-wide cylinder 50m away spans <1px on mobile screens — invisible. Use the chassis `heightRange` to estimate "actual world size" of each branch primitive and drop if its projected screen size at LS Browse distance is <1px.

### Lever 2: Parallel-branch collapse

For each branching node with N > 1 children, examine pairs of children. If two children are roughly parallel (angle between direction vectors < `angleThresholdDeg`) AND their root endpoints are close (distance < `distanceThresholdM`), merge them into one. The merged geometry retains the cumulative tri count of both — but the merge keeps one cylinder primitive instead of two.

Watch for false positives: dichotomously-branching forks (one node into two diverging branches) should NOT be collapsed unless they're truly parallel. The angle threshold protects this.

### Lever 3: Silhouette-preserving leaf-card reduction

**Applies only to card-based leaf topology (Robinia A/B-style: max-vert-use=1 + vertCount %4==0).** Skip entirely for connected-mesh topology (Linden-style: sculpted 3D leaves with shared verts — per `project_vendor_leaf_topologies`). Connected-mesh leaves don't HAVE card boundaries; centroid computation produces nonsense. Use `MeshoptSimplifier`'s standard path for those.

Compute the canopy hull (convex hull of all leaf-card centroids in XZ, ignoring Y). Each leaf card's distance from the hull boundary determines whether it's "outer" (close to hull) or "inner" (far from hull). Reduce inner cards by `innerHullDropFactor` (e.g., 0.6 drops 60% of inner cards uniformly via hash-based selection — deterministic, idempotent).

Outer cards (within `~0.5m` of hull boundary) are NEVER dropped — they define the silhouette. Inner cards are mostly overdraw at any view angle (they're occluded by outer cards from most directions) so dropping them mainly reduces alpha overdraw + tri count without visible silhouette loss.

Verify visually: render before/after at LS Browse + Hero distance; the silhouette should be identical. If it changes, `innerHullDropFactor` is too aggressive.

### Lever 4: Quality bracket

After levers 1–3 fire, measure resulting tri count. If above `qualityBracket.lod0.maxTris`, tighten levers (drop maxOrder by 1, raise innerHullDropFactor). If below `minTris`, this chassis was already light; skip further work.

Iterate until tris land in the bracket OR levers max out. Surface in the report if a chassis cannot land in the bracket (operator may want to manually decimate or skip that chassis).

### LoD-specific behavior

`publish-glb.js`'s `MeshoptSimplifier` runs at three ratios (LoD0: 1.0, LoD1: 0.40, LoD2: 0.10) on the decimated source. Decimation runs ONCE on the source; the simplifier produces three tiers from that one decimated input.

Optionally: decimation could run THREE times (once per LoD target bracket), feeding three different source GLBs to `publish-glb`. This is more aggressive per-tier but more code. Lean toward single-pass decimation first; multi-pass is a v1.6 candidate if perf demands.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/decimate-tree.mjs` | new — the decimation script | ~400 |
| `arborist/decimation-defaults.json` | new — operator-tunable config | ~30 |
| `arborist/publish-glb.js` | edit — optional pre-decimation entry point | +10 |
| `arborist/generate-procedural.js` | edit — invoke decimation before publish-glb | +5 |
| `arborist/generate-salon.js` | edit — same | +5 |
| `arborist/bake-tree.py` (and/or `lidar-publish.js`) | edit — Python invokes Node decimator via `subprocess.run(['node', 'arborist/decimate-tree.mjs', '--input', tmp_in, '--output', tmp_out, '--config', config_json], check=True)`. Use `subprocess` (not `os.system`); capture stderr; check exit code. Pass `--config` as JSON-stringified arg OR write to a tmp config file. The decimator outputs the reduced GLB at `--output` path; bake-tree.py picks that up for the next pipeline stage. | +15 |
| `arborist/FEATURES.md` | edit — decimation pipeline section | +40 |
| `arborist/ARCHITECTURE.md` | edit — publish-loop pattern updated to include decimation step | +25 |
| `arborist/BACKLOG.md` | edit — mark this brief shipped; demote Brief 3 to v1.5.5 | +15 |
| `arborist/NOTES.md` | edit — dated session-end entry under your name | +50 |
| `scratch/brief-decimation-survey-<your-name>.md` | new — per-species decimation report (before/after tri counts + visual diff notes) | ~300 |

Total: ~580 new LOC + 2 new data files + 5 doc edits.

## Acceptance criteria

1. `node arborist/decimate-tree.mjs --species=<id>` runs cleanly on at least 5 representative species (Sugar Maple, Italian Cypress, London Plane, White Oak, procedural broadleaf)
2. Decimation produces a measurable tri-count reduction at LoD0 — target ≥30% reduction averaged across the test species AND **report per-species results** (averaging across 5 species can mask one species over-decimating; per-species numbers are the trustworthy signal)
3. Decimation produces matching reduction at LoD1 + LoD2 (since they cascade through publish-glb's simplifier from the decimated source)
4. Visual diff at LS Browse view distance: no perceptible silhouette difference between pre-decimation and post-decimation render (screenshot comparison required in survey report). **Operator-eye verification required — baby provides screenshots, Jacob signs off.**
5. Visual diff at LS Hero view distance: no perceptible silhouette difference at the typical Hero cinematic frame range (screenshot comparison required). **Operator-eye verification required.**
6. Determinism: same source GLB + same `decimationConfig` → byte-identical decimated GLB sha1 across two runs
7. Idempotency: re-running decimation on already-decimated output produces byte-identical output (no further reduction)
8. Quality bracket honored: every test species lands within `qualityBracket.lod0` tri range, OR is flagged in the survey report with rationale
9. No regression on Salon publish flow: a Brief-2-style gradient composition publishes through the decimation pipeline + bake-look + bake-trees unchanged in visible quality
10. No regression on procedural / LiDAR publish flows (smoke-test one variant each)
11. Per-species decimation config override works: e.g., set `acer_saccharum_procedural` to a tighter bracket and verify it lands there
12. Per `feedback_smallness_as_precondition`: brief includes tri-count delta + texture-footprint delta + draw-call delta in the survey report (perf is measured, not asserted)

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file`
- **No visual quality regression at LS view distances.** This is the niceness pillar of [[feedback_smallness_as_precondition]] — if your decimation drops visible quality, levers are too aggressive. Back off the bracket; surface the per-species tradeoff. The corner cut CANNOT be visual.
- **Single shader program preserved** (you're not touching runtime; doctrine inapplicable but doctrine-consistent)
- **Single atlas binding preserved** (same — bake-time only)
- Determinism: same input + same config → byte-identical output across runs
- Per `project_writeifchanged_touches_mtime` — touch mtime on no-op
- No modifications to `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `bake-look.js`, `bake-trees.js`, `survey-deleaf.js`
- Decimation runs BEFORE existing publish-glb's `MeshoptSimplifier`; the existing simplifier path stays intact and unchanged

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- Per-species decimation results — surface chassis where decimation produced visible quality loss (you backed off levers; document the resulting tri counts and what the conflict was)
- Lever interactions you found: did parallel-branch collapse change leaf-card visibility (since leaf cards reference branches)? did twig pruning leave orphan leaf cards at non-existent branch tips? Surface and explain how you handled.
- Whether any test species needs per-species config (e.g., conifers might have tighter angle thresholds than broadleaves)
- Any chassis that should be considered for removal from the roster entirely (visible quality already low at native; decimation doesn't help; operator may want to retire)
- Tri-count delta achievable beyond ~30% if levers stack aggressively without visible loss (operator may want to know the upper bound)
- Whether the `qualityBracket` defaults should be tightened or loosened based on what you observed
- Whether you found cleverness opportunities that the brief didn't anticipate (e.g., interior-leaf-card removal via canopy-hull SDF instead of simple inner/outer split)
- Whether LoD-specific multi-pass decimation seems worth it (you observed cases where single-pass gave bad LoD2 results)
- Any opportunity for Phase V coordination: per-SHOT decimation brackets (Street tight, Hero medium, Browse loose) for v1.6

## Out of scope

- Per-SHOT bake variants (Phase V — v1.6+)
- Runtime Configuration D (Points + A2C + LoD selection) — the companion runtime brief, queued after this one
- Camera-aware hemisphere cull (Brief 4)
- Bark gradient pivot (Brief 2.1 — shipped by Birch 2026-05-22; don't touch `treeAtlasMaterial.js`, `applyBarkUniforms`, gradient LUTs)
- Vendor-leaf material rebinding (Brief 5 — shipped by Tendril 2026-05-22; don't touch the salon-leaf material binding or per-card UV rewrite paths)
- Deformer rig (Brief 3 — deferred to v1.5.5)
- Bark library size reduction (separate concern; coordinator + operator parking)
- Salon UI exposure of decimation config (defer to v1.6 — for now, config-file-driven)
- Texture decimation / downscale (separate concern)
- Atlas dedup tuning (atlas-survey is fine as-is)
- Annual-cycle decimation (Phase F leaf integration concern)
- Any work in `meteorologist/` or `cartograph/`

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 6 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the queued companion brief is Configuration D runtime (Points + A2C + distance-based LoD selection) — which depends on having tunable bake-time decimation targets, which is what you're building. Welcome to the Salon arc's perf cluster.
