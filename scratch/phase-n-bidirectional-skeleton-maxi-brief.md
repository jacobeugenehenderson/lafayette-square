# Phase N — Bidirectional Skeleton — Maxi Baby Brief

> Maxi brief. Five stages (N.0 → N.4). **Each stage stops at the boundary** — you report, operator validates visually in /arborist (LidarWorkstage), operator dispatches the next stage. Do NOT batch stages or auto-continue. If a stage takes more than 1.5× the budget, stop and surface the slippage.

---

## Context — why Phase N exists

Today (2026-05-19) was a heavy architecture day. Three pivots landed in sequence: procedural → LiDAR Option δ (LiDAR-runtime trunk + procedural canopy) → LiDAR-as-statistical-training (after QSM mesh read as "fragmented + abstract" in visual review of Stage 1 ship `12ef2a1`).

Tonight's session: coordinator pressure-tested that visual judgment and surfaced a confound — the QSM GLB was being exported in source forestry Z-up frame, no Z→Y rotation, so three.js loaded it sideways and half-submerged. Coordinator attempted a surgical fix to `bake-tree.py` (rotation block before `scene.export`); the fix compounded against a compensating rotation elsewhere in the workstage/BakedPreview stack. Net: tree still rendering sideways somewhere in operator's viewer. **Fix is committed-but-broken; N.0 explicitly resolves end-to-end.**

The orientation bug is NOT the load-bearing reason the pivot needed reshaping. The real reason: the operator's framing crystallized to **"skeleton is the bottleneck; leaves/bark/surface are already good"**, and the QSM extraction's known failure modes (fragmentation, branch-crossing merges, slab artifacts) are *topological* — statistical-scalar PRESETS-training can't fix them. Garbage QSM → garbage stats → garbage procedural defaults.

The new approach: **bidirectional growth** — multi-view tip detection + RANSAC trunk axis + bidirectional path growth meeting along the point-density gradient. Same algorithm extracts skeletons from real specimens AND generates skeletons from noise sampled from learned distributions. LiDAR library teaches the tip + density distributions; procedural generation samples from them. Extraction and generation collapse into one mechanism — the "Golden Key" framing the operator landed on. See N.1 for the algorithm spec.

If N.1's spike doesn't pop, fall back to the statistical-extraction Phase T as drafted in `arborist/BACKLOG.md`. The alignment oracle from N.0 is load-bearing either way and stays in either path.

---

## Standing requirements (apply to every stage)

1. **Name yourself in publish notes.** First line of each stage's commit body, and at the head of every status update, e.g. "Baby Hazel — Phase N.0 — Alignment Oracle". Operator preference (2026-05-19). Use any name; consistency across the cycle.
2. **Surface scope drift** per `[[feedback_baby_must_surface_scope_drift]]`. Every stage's status update + commit body discloses: files touched not in this brief, schema extensions, retuned defaults, new dependencies, deviations from acceptance criteria. The "everything went smoothly" report is the failure mode.
3. **Read at session start (do not skip):**
   - The "Context" section at the top of this brief
   - `arborist/NOTES.md` 2026-05-19 evening entry + 2026-05-19 PM entry
   - Memory: `[[project_lidar_as_training_data]]` (note: partially superseded; doctrine of "LiDAR is authoring-time data" stands, statistical-scalar implementation is being replaced by Phase N)
   - Memory: `[[project_park_is_the_gem]]`, `[[feedback_procedural_trees_are_the_destination]]`, `[[project_configuration_d_canopy_render]]`
   - `arborist/lidar_extract.py` (the current QSM extraction — your baseline-for-comparison; do not modify in N.0–N.2)
   - `arborist/bake-tree.py` (current bake; N.3 modifies)
   - `src/arborist/LidarWorkstage.jsx` (the workstage you'll extend in N.0)
4. **Operator-gated stop points.** End every stage with a status report listing: what shipped, file diffs summary, acceptance status (per stage's criteria below), surfaced scope drift, suggested next-stage adjustments. Wait for operator dispatch before resuming.
5. **Working tree is dirty.** Operator's tree carries unrelated in-flight work per `[[feedback_stash_isolate_per_file]]`. Edit only files this brief touches; don't sweep stale-looking files. There may be a half-broken `BakedPreview` component in `LidarWorkstage.jsx` from a prior coordinator session — N.0 explicitly addresses it.
6. **Determinism where it matters.** Same specimen + same params → byte-identical extracted skeleton. Random sampling uses seeded RNG (mulberry32 pattern from `generate-procedural.js`).

---

## Stage N.0 — Alignment Oracle

**Budget:** ~1 day. **What:** A multi-layer viewport surface in LidarWorkstage that overlays, at the same origin and scale: (a) source point cloud, (b) live QSM cylinder extraction (current `lidar_extract.py` output), (c) the *baked GLB* (post-`lidar-publish.js`, the artifact runtime three.js actually loads). Operator scrubs through specimens, visually confirms all three overlap correctly. This is the persistent regression-catch surface for every future bake-pipeline change; treat as load-bearing infrastructure, not scaffolding.

### Files

- `src/arborist/LidarWorkstage.jsx` — extend the existing multi-layer viewport with a "Baked GLB" toggle. Mount the published GLB at origin via existing `<primitive>` + GLTFLoader pattern, no transform.
- Possibly `arborist/serve.js` — if the baked GLB at `public/trees/<heroSpecies>/skeleton-<id>-lod0.glb` isn't already served by the static middleware, add a static route. Check first — likely already works.
- Likely remove or repair the broken `BakedPreview` component (prior coordinator's prototype). If it's a wholly separate component, delete it. If its scaffolding can be re-purposed for the alignment oracle, refactor.
- The orientation fix attempted in `arborist/bake-tree.py` (Z→Y rotation block before `scene.export`) is currently committed-but-broken — produces sideways trees somewhere in operator's viewer stack. Likely the LidarWorkstage cylinder overlay or `SpecimenViewport.jsx` was already remapping `(x, z, -y)` inline (per `arborist/NOTES.md` 2026-05-19 Cycle 1 entry); the bake-tree fix double-rotates against that. **Resolve once and for all here in N.0.** Pick one frame convention end-to-end. Document the choice in `arborist/NOTES.md`.

### Acceptance (operator-gated)

1. Operator picks 5 random specimens. For each: source cloud + QSM extraction + baked GLB all overlap visibly in the viewport. Cylinders sit inside cloud envelope. Baked GLB matches cylinder skeleton (or visibly diverges only at the trunk-cylinder level expected from `build_region_meshes`).
2. The orientation bug is resolved end-to-end — no specimen renders sideways or half-submerged in any of the three layers.
3. The viewport has clean toggles for each layer + opacity slider per layer.
4. Operator can scrub the specimen list and the overlay updates without re-bake.

### Stop point

Report: which layer revealed which bug (if any), what the orientation fix looked like, where you put it, and which 5 specimens you tested with. Do NOT proceed to N.1 until operator confirms 5/5 green.

---

## Stage N.1 — Bidirectional growth prototype (single specimen)

**Budget:** ~3 days. The research-grade spike. **What:** A new Python module `arborist/bidirectional_skeleton.py` implementing the bidirectional growth algorithm on ONE specimen end-to-end. Side-by-side comparable in the alignment oracle against the QSM baseline.

### Algorithm

1. **Multi-view tip detection.**
   - Render the point cloud's silhouette from N=12 viewpoints around the vertical axis (each viewpoint: orthographic projection to a 2D image, point splatting or convex hull). Above-canopy + above-camera angle (~30° tilt down) catches canopy tips best.
   - From each silhouette: find boundary points + identify extremal points (local maxima in distance-from-center along the silhouette boundary).
   - Unproject extremal points back to 3D candidate-tip rays. A real tip is a candidate seen by ≥3 viewpoints with rays intersecting within a tolerance ball (~20 cm).
   - Output: tip set T = {(x, y, z)_i}.

2. **Trunk axis fit.**
   - Find the densest vertical column (RANSAC line fit through high-density Z-column points; or weighted PCA on the lower 30% of point cloud).
   - Output: trunk axis A (line in 3-space) and a trunk-base point P_0.

3. **Density field construction.**
   - Build a sparse 3D density field over the point cloud (voxelized counts, smoothed by 3D Gaussian kernel ~10 cm).
   - This is the cost field for growth — paths prefer high-density regions.

4. **Bidirectional growth.**
   - Two strategies; baby picks one based on prototype feasibility. Document choice.
     - **Strategy A — Geodesic shortest path per tip.** For each tip t ∈ T, run Dijkstra on a KNN-graph over the point cloud, with edge weights inversely proportional to local density, to find the shortest-cost path from t to A. The union of all paths is the skeleton.
     - **Strategy B — Iterative growing fronts.** Initialize one front at each tip and one front along the trunk axis. Each step: each front extends to the nearest unclaimed high-density neighbor. When two fronts meet (within ~5 cm), merge them with a parent-child relationship. Continues until all fronts terminate or merge.
   - Strategy A is simpler + better-understood; recommended unless density-field is too sparse to support Dijkstra connectivity (in which case Strategy B's local-greedy approach degrades more gracefully).

5. **Path → cylinder graph.**
   - Per resulting path: subdivide into ~10-cm segments. Per segment: fit a radius from local point-cloud distance-to-path (median distance, capped at branch-realistic max).
   - Output: nodes + edges in the same shape `lidar_extract.py` emits (`{x, y, z, radius, parentIdx}`).

### Files

- `arborist/bidirectional_skeleton.py` — new module + CLI (`--treeId=... --viewCount=12 --voxelSize=0.05 --kNearest=20`), JSON-on-stdout shape matching `lidar_extract.py`.
- `arborist/serve.js` — add `POST /lidar/specimen/:treeId/bidirectional-extract` endpoint (same shape as `/extract`, different module).
- `src/arborist/LidarWorkstage.jsx` — add a toggle to the extraction tuner: "Algorithm: QSM | Bidirectional". Same panel sliders work for both where applicable (voxelSize, minRadius); algorithm-specific knobs (`viewCount`, `kNearest`) appear conditionally.
- The alignment oracle (N.0) shows the bidirectional output as a 4th overlay layer (or replaces the QSM layer when toggled).

### Acceptance (operator-gated)

1. One specimen (operator picks one with visually-clean QSM output as the hardest comparison; e.g., 10186) processed end-to-end via bidirectional algorithm in <30s.
2. Tips detected match operator-visual ground truth (operator confirms count + distribution looks right).
3. Output skeleton overlaid on point cloud (alignment oracle layer 4) sits visibly cleaner than the QSM extraction overlay (layer 2). Specifically: fewer orphan fragments, branches track point density more faithfully, trunk continuity preserved through canopy.
4. Same specimen + same params → byte-identical output JSON (determinism check).

### Stop point — THE LOAD-BEARING GATE

This is THE call. Two outcomes:

- **Bidirectional visibly cleaner than QSM** → Phase N is the new direction. Proceed to N.2 multi-specimen run.
- **Bidirectional NOT visibly cleaner** → Phase N spike concluded. Recommend fall-back to statistical Phase T using existing QSM. Update `arborist/NOTES.md` with what you tried, what didn't converge, and why. Do NOT continue to N.2.

In either case, report what worked, what didn't, and what you'd try with another day. Operator gates the call.

---

## Stage N.2 — Multi-specimen extraction + per-species distribution learning

**Budget:** ~1.5 days. Conditional on N.1 ratification.

### What

- LidarWorkstage gets a "✓ in training set" affordance per specimen row (persists to `seedlings.json#trainingSet: [treeId, ...]`).
- New script `arborist/aggregate-skeleton-distributions.py` — reads the operator's training-set selection for one species, runs `bidirectional_skeleton.py` on each, aggregates the resulting skeletons into a per-species distribution descriptor: `arborist/state/<species>/skeleton-distribution.json`.
- Descriptor includes (mean + variance per field):
  - DBH (trunk base diameter)
  - Total height
  - Crown W:H ratio (canopy bbox)
  - Leader strength (axial-chain length / total height)
  - Scaffold count (number of order-1 branches off the trunk)
  - Mean branch insertion angle from vertical
  - Branching density per height meter (histogram with 10 bins)
  - Tip-spatial-distribution (3D KDE or voxelized density of tips within normalized envelope coords)

### Files

- `arborist/aggregate-skeleton-distributions.py` — new.
- `src/arborist/LidarWorkstage.jsx` — training-set checkbox + filter (show all / training-set only / rejected).
- `arborist/serve.js` — extend `POST /species/:id/seedlings` body to merge a `trainingSet` array. Same merge semantics as `displayNames` (incoming wins, absent keys preserved).
- `arborist/state/acer_saccharum_procedural/skeleton-distribution.json` — committed artifact (Sugar Maple first; the load-bearing one).

### Acceptance

1. Operator marks ≥20 Sugar Maple specimens as training-set in LidarWorkstage.
2. Aggregation script runs end-to-end in <2 minutes on 20 specimens.
3. `skeleton-distribution.json` exists, well-formed, every metric has reasonable mean + variance + N.
4. Operator can scrub the rejected list and see why each was excluded (visual quality, partial scan, etc.) — text-field note per specimen optional but useful.

### Stop point

Report: how many specimens curated in, how many rejected, summary stats of resulting distribution. Operator validates the distribution looks botanically plausible before N.3 consumes it.

---

## Stage N.3 — Procedural generation via bidirectional growth from learned distribution

**Budget:** ~2 days. The Golden Key stage.

### What

`generate-procedural.js` (or new module called from it) generates Sugar Maple instances by:
1. Sampling instance-specific params from `skeleton-distribution.json` (per-instance jitter via `mulberry32(seed)` on the existing seed stream).
2. Synthesizing a tip distribution by sampling N tip positions from the learned tip-spatial-KDE, scaled to the sampled envelope dimensions.
3. Synthesizing a noise-field envelope (proxy point cloud) using a procedural process tuned to match the learned density-field shape of training specimens. Could be: ellipsoidal envelope filled with low-density noise + denser concentration along scaffolds emanating from sampled scaffold-Y positions.
4. Running the bidirectional growth algorithm on this synthetic noise-field with the sampled tips as anchors and the synthetic trunk axis as the central chain. Output: skeleton.
5. Cylinder graph → mesh via existing `build_region_meshes` (yes, in Python — call out from Node via subprocess, OR port the relevant pieces). Recommended: subprocess the Python pass; mirrors existing `bake-tree.py` invocation pattern.

### Files

- `arborist/generate-procedural.js` — adds a new mode `'bidirectional'` to PRESETS. Sugar Maple's PRESETS row gains a `mode: 'bidirectional'` flag (other species default to legacy `'sca'` mode).
- `arborist/generate-bidirectional.py` — new module. Reads `skeleton-distribution.json` + a seed; emits a GLB (same shape `bake-tree.py` emits).
- `src/arborist/ProceduralWorkstage.jsx` — surfaces the algorithm choice in the workstage when active species' PRESETS specifies `mode: 'bidirectional'`. Sliders/knobs become "distribution offset" (shift mean) and "variance scale" (tighten/loosen jitter) on top of the learned distribution.

### Acceptance

1. Operator dice→adopt cycle works for Sugar Maple under the bidirectional mode (3 variants generated successfully).
2. Generated skeletons visibly resemble real Sugar Maples (alignment oracle: overlay a generated tree against a typical training specimen's point cloud at same scale — generated skeleton sits inside the envelope).
3. Determinism preserved: same seed + same distribution + same params → byte-identical GLB.
4. Performance: per-variant generation <10s (mobile-friendly target; this is a one-shot author-time cost so 30s is acceptable if the algorithm is otherwise sound).
5. Existing legacy 'sca' mode species (oak, willow, etc.) still generate correctly — no regression in `generate-procedural.js` main path.

### Stop point

Report: 3 generated Sugar Maple variants' visual quality vs current G.0 strong-leader baseline. Operator validates before N.4.

---

## Stage N.4 — Hero Sugar Maple publish + validation in /cartograph

**Budget:** ~0.5 day. Closes the loop.

### What

- Operator adopts 3 bidirectional-generated variants for `acer_saccharum_procedural`.
- Full publish pipeline: `bake-tree.py` (or bidirectional bake) → `lidar-publish.js` → `bake-look` → `bake-trees`.
- Result lands at `public/baked/lafayette-square/trees/acer_saccharum_procedural/` and 88+ Sugar Maple placements in default.json substitute to the new variants.
- Operator opens /cartograph LS Browse/Hero, looks. Compare to v1 procedural and current G.0 procedural.

### Acceptance

1. Sugar Maples render upright at correct heights in /cartograph (alignment oracle's frame convention propagates correctly through the full pipeline).
2. Visual quality bar — operator's judgment. The question: "Does this give me the trunk I've been chasing?" If yes, Phase N is shippable. If close-but-not-there, Phase N.5 follow-up brief.
3. Determinism + per-region bark binding + leaf cards from current state — all continue working unchanged.
4. `renderer.info.programs.length` unchanged at LS scene load (no new shader programs introduced by Phase N).

### Stop point

Report ships the cycle. Operator decides whether to dispatch the same baby for G.2 (Ginkgo / next hero) or if Phase N.5 polish is needed first.

---

## Post-cycle cleanup (baby's last commit if cycle completes)

1. Update `arborist/NOTES.md` with Phase N session notes — what shipped, what didn't, surfaced scope drift.
2. Update `arborist/BACKLOG.md` — Phase N entries marked `[x]` per stage; mark Phase T as `[~] superseded by Phase N` if N.1 ratified the new direction.
3. Update memory `[[project_lidar_as_training_data]]` if Phase N landed: body changes from "statistical scalar extraction" to "bidirectional growth algorithm trained on per-species tip + density distributions".
4. Update `arborist/FEATURES.md` if new operator-facing surfaces (alignment oracle, training-set curation) need user-facing documentation.

---

## Non-goals (do NOT do)

- Do not touch Phase F / leaf authoring / vendor pack bindings. Leaves are already good.
- Do not touch Phase W / wind. Out of scope.
- Do not touch Configuration D inner-mass POINTS canopy rendering. Future phase.
- Do not touch other species PRESETS (oak, willow, etc.) — bidirectional mode is opt-in via `mode: 'bidirectional'` on individual PRESETS rows. Sugar Maple first; other heroes follow in their own briefs.
- Do not refactor `lidar_extract.py`. Keep as baseline-for-comparison. Phase N's algorithm lives in `bidirectional_skeleton.py`.
- Do not add new dependencies without surfacing in scope-drift. The current stack (laspy, numpy, scipy, trimesh) is rich enough; if you need scikit-image for silhouette work, surface + justify before adding.

---

End of brief.
