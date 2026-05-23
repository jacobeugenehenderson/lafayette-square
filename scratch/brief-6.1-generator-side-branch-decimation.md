# Brief 6.1 — Generator-side branch decimation (pre-merge Levers 1+2)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Where you are — the Brief 6 lineage

Brief 6 (Spindle, shipped 2026-05-22 commit `3bd0a17`) added tree-aware bake-time decimation via `arborist/decimate-tree.mjs` imported by `arborist/publish-glb.js`. Two levers shipped (3: card-aware leaf reduction; 4: adaptive simplify-to-bracket). Two levers were dropped at Spindle's alignment-check because the brief assumed a walkable per-branch node graph on chassis GLBs — but chassis GLBs arrive flat-merged with 1-3 wood primitives total, no per-branch identity to walk.

Per [[feedback_geometry_briefs_need_artifact_inspection]] — that catch is the doctrine entry's first listed precedent.

**Your brief picks up the dropped levers and relocates them to where the branch identity actually exists**: inside the generators, PRE-MERGE. Two generator paths, two integration points.

## Mission

Add two pre-merge branch-decimation levers operating on the generators' INTERNAL branching graphs:

1. **Order-N twig pruning** — drop branches above order N (depth from root). At Browse distance, 4th-order+ twigs are sub-pixel; contribute nothing visible; pure tri-count cost.
2. **Parallel-branch collapse** — detect roughly-parallel adjacent branches within a small angular cone + close proximity; merge into one. Visual silhouette preserved; tri count drops.

Both levers operate on the in-memory branch graph BEFORE the generator merges it down to flat-mesh primitives. They are NOT post-merge operations.

## Two integration points

### Procedural path — `arborist/generate-procedural.js`

The SCA growth loop (`runGrowthLoop` in `arborist/spaceColonization.js`) produces a node graph where every node has `parent`, `children`, and a `pairDepth`/branching-order context. Per-node operations are tractable.

**Lever 1 (Order-N twig pruning)** sweeps the SCA result graph after `runSCA()` returns and before mesh emission: walk root-down, compute branching-order per node (root = 0; every branching event += 1), drop subtrees rooted at nodes whose order exceeds `maxOrder` AND whose subtree tri budget falls below a threshold (small-twig protection — never drop a long thin major branch).

**Lever 2 (Parallel-branch collapse)** runs on the same graph: at each branching node with ≥2 children, examine child pairs; if angle between direction vectors < `angleThresholdDeg` AND root endpoints within `distanceThresholdM`, merge the two child subtrees into one (sum-stat heuristics: union tri counts on parent, keep one chain).

### LiDAR path — `arborist/bake-tree.py`

The cylinder graph from `arborist/lidar_extract.py` returns `{nodes, edges}` with `parentIdx` per node. Order computation is the same tree-walk; the merge is identical (sum stats, drop sibling).

**Lever 1** sweeps the cylinder graph before `bake-tree.py` emits the GLB. Same heuristic.

**Lever 2** sweeps the cylinder graph for parallel-sibling collapse. Same merge logic.

## What you do NOT touch

- **`arborist/decimate-tree.mjs`** — that's Spindle's module, operating POST-merge. Your work is pre-merge in the generators. Different file, different abstraction.
- **`arborist/publish-glb.js`** — unchanged. Already invokes Spindle's post-merge module.
- **Salon-imported / vendor chassis** — Salon's `generate-salon.js` consumes flat-merged chassis from `public/trees/_chassis/<name>.glb`. No per-branch identity exists there to walk. Vendor stock decimation is Spindle's territory (post-merge) + Brief 6.2 territory (connected-mesh bark). NOT this brief.

## Files you'll touch

| File | Status | ~LOC |
|---|---|---|
| `arborist/spaceColonization.js` | edit — add `pruneByOrder(graph, maxOrder, smallTwigThreshold)` + `collapseParallelSiblings(graph, angleThreshold, distanceThreshold)` helpers operating on the SCA node graph | +180 |
| `arborist/generate-procedural.js` | edit — invoke the two helpers between `runSCA()` and mesh emission; thread config from `decimation-defaults.json` | +30 |
| `arborist/lidar_extract.py` | edit — sibling helpers for cylinder-graph: `prune_by_order(graph, max_order, threshold)` + `collapse_parallel_siblings(graph, angle, dist)`. Python implementation mirrors JS semantics. | +120 |
| `arborist/bake-tree.py` | edit — invoke the helpers after `extract_cylinders()` returns, before GLB write | +20 |
| `arborist/decimation-defaults.json` | edit — add `pruneByOrder` + `collapseParallelSiblings` sub-trees (per-generator config keys) | +20 |
| `arborist/FEATURES.md` | edit — mention pre-merge decimation in the procedural + LiDAR pipeline descriptions | +15 |
| `arborist/ARCHITECTURE.md` | edit — extend the publish-loop diagram (add pre-merge step in generators) + note Spindle's post-merge module still runs after | +20 |
| `arborist/BACKLOG.md` | edit — mark Brief 6.1 shipped | +5 |
| `arborist/NOTES.md` | edit — session entry | ~50 |

Total: ~460 LOC across JS + Python.

## Acceptance criteria

1. **Procedural species tri-count reduction.** Run `node arborist/generate-procedural.js --species acer_saccharum_procedural` before and after Brief 6.1. Source GLB tri count reduces by ≥20% averaged across the 5 procedural variants (target may need tuning; report per-variant).
2. **LiDAR species tri-count reduction.** Same test against a LiDAR-derived species (e.g. `acer_saccharum` if Sugar Maple LiDAR seedlings are baked). ≥20% target.
3. **Visual diff at LS Browse and Hero distance.** No perceptible silhouette difference per-species. Operator-eye verification; baby provides before/after screenshots in the survey report.
4. **Determinism.** Same source params → byte-identical published GLB across runs. Sha1sum verify.
5. **Idempotency.** Re-running generator on same input produces byte-identical output (no further reduction beyond first pass).
6. **Salon-imported chassis untouched.** Vendor stock + Salon compositions produce byte-identical published GLBs pre-/post-Brief 6.1. Verify against `american_linden_a` (a Salon-path chassis) — output must NOT change.
7. **Spindle's post-merge Brief 6 still fires.** `arborist/publish-glb.js`'s Lever 3 + Lever 4 invocations unchanged; Brief 6 acceptance unaffected.
8. **No regression on Salon → bake → LS pipeline.** `node arborist/bake-look.js --look lafayette-square` runs unchanged; `trees-atlas.json` byte-identical pre/post Brief 6.1 (Brief 6.1 only touches procedural + LiDAR publish paths; Salon-imported artifacts are stable).
9. **Per `feedback_smallness_as_precondition`:** survey report includes per-species tri-count delta + texture-footprint delta + draw-call delta. Perf measured, not asserted.

## Approach guidance

- **Read [[feedback_geometry_briefs_need_artifact_inspection]] first.** This brief exists because that doctrine entry caught Brief 6's premise mismatch; honor the lesson by inspecting actual SCA + cylinder graphs before drafting your helpers.
- **Inspect actual graphs.** Run `generate-procedural.js` once with logging on; print the SCA node graph structure (depth, children, branching events). Run `lidar_extract.py` on one specimen; print the cylinder graph. Verify your assumption about node-walking matches the actual data structure before writing helpers.
- **Order computation**: walk root-down DFS or BFS; assign `order` per node as `parent.order + (parent.children.length > 1 ? 1 : 0)`. Branching event = order++; straight-line continuation = same order.
- **Small-twig protection**: don't drop branches purely on order. A long thin order-4 branch on a sparse-canopy ornamental is visually load-bearing; a stubby order-4 twig on a dense maple is sub-pixel cruft. Use combined heuristic: order > maxOrder AND subtree tri count < threshold AND subtree projected-screen-size at LS Browse < 1px.
- **Parallel collapse safety**: don't collapse dichotomously-branching forks (one node into two diverging branches). The angle threshold protects this when set conservatively (~8° per Brief 6 sketch); verify visually on procedural variants before tuning.
- **Python mirror parity**: `arborist/lidar_extract.py` is Python; `arborist/spaceColonization.js` is JS. Your two helper implementations should produce IDENTICAL results given identical input graphs (for determinism + cross-pipeline consistency).
- **Salon path skip**: `arborist/generate-salon.js` consumes flat-merged chassis. There's no SCA or cylinder graph to walk. Don't add a Salon-side hook; verify nothing in your work touches that pipeline. Salon decimation is Spindle's (Lever 3) + Brief 6.2's (bark) territory.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- The SCA graph or cylinder graph doesn't carry the parent/child info you assumed (alignment-check fail, à la Spindle's catch — recommend a relocation or scope change BEFORE writing helpers)
- Order-N threshold default (4) reads too aggressive or too conservative — surface per-species behavior + propose alternative
- Parallel-collapse heuristic produces visibly-wrong merges on any variant — surface visually + propose safer threshold
- Procedural + LiDAR path divergence in how the graph is mutated (some operation works in JS but not cleanly in Python, or vice versa)
- Determinism breaks because Python's iteration order differs from JS — surface and reconcile
- Spindle's post-merge Lever 3 interaction (parallel-collapse may merge branches that Lever 3 then can't decimate cleanly)

Surface in status update AND commit body.

## Out of scope

- **Salon-imported / vendor chassis decimation** — vendor stock is flat-merged at chassis-survey time. Brief 6 (Spindle, post-merge Lever 3) handles the leaf side; Brief 6.2 (connected-mesh bark) handles the bark side. NOT this brief.
- **Configuration D runtime** (Points + A2C + LoD selection) — orthogonal future work.
- **`arborist/decimate-tree.mjs` extensions** — Spindle's module is post-merge; your work is pre-merge. Different files.
- **publish-glb.js changes** — unchanged.
- **bark-side decimation** — Brief 6.2.
- **Quality bracket tuning** — Spindle's Lever 4 already does adaptive bracketing post-merge. Your reduction feeds into a smaller source GLB, which Spindle's bracket-aware simplify then refines per-LoD. Composes orthogonally.

## Memory refs

Read at session start:
- [[feedback_geometry_briefs_need_artifact_inspection]] (LOAD-BEARING — the doctrine that filed this brief)
- [[feedback_smallness_as_precondition]]
- [[feedback_beautiful_first_lightweight_51]]
- [[feedback_baby_briefs_need_identity_framing]] (you are the baby)
- [[feedback_baby_must_surface_scope_drift]]
- `project_writeifchanged_touches_mtime`
- Spindle's commit body at `3bd0a17` + survey at `scratch/brief-decimation-survey-spindle.md` — context on what shipped vs what got deferred

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 6.1 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the procedural + LiDAR publish paths produce LIGHTER source GLBs (twig-pruned + parallel-collapsed) that Spindle's post-merge Lever 3 + Lever 4 then refine. End-to-end perf budget gets healthier per-species. Brief 6.2 (connected-mesh bark) is the remaining decimation lift; together with this brief, the bake-time tri budget is well-attacked.
