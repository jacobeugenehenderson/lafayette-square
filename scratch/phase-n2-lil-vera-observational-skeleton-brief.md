# Project: Li'l Vera — Cycle 1 — First Light

> **Project: Li'l Vera** is an ongoing initiative within the Arborist to build a Monte-Carlo consensus-inference observational skeleton-extraction system — named in honor of the operator's beloved AND of Vera Rubin (the astronomer whose observational posture the apparatus channels; the Vera C. Rubin Observatory carries her name forward in the same lineage). The project is anticipated to span multiple cycles; this brief defines **Cycle 1 — First Light** — the foundational apparatus + its first single-specimen observation. Future cycles will refine algorithm choices, generalize beyond LiDAR sources, integrate with procedural generation, and tune the apparatus from the lessons of First Light.
>
> The implementing baby self-names per Standing Requirement #1. Li'l Vera is the project; the baby is its first builder.
>
> Specialist baby brief. ~5 day budget. Five stages with stop points. **Each stage stops at the boundary** — report, operator validates, next stage dispatched. Do NOT batch.

---

## For the human reader (intuition pumps; not in the brief body)

Three pictures to keep in your head while you build:

1. **A spiral dolly with a 3-camera rig** at 120° around the tree, looping past hundreds of times. Each rig position takes a triple snapshot. Crank N=500 overnight; you get 1500 observations from carefully-distributed angles.
2. **Dragging a stick through jelly** at every candidate point, in hundreds of directions per point. The directions that produce a clean channel reveal the local structural axis. The shape of the channel-score distribution classifies the point (linear interior, branching junction, tip, noise).
3. **A scalar memory field in 3D space.** Every observation deposits evidence at points the apparatus has seen as silhouette, medial, structurally-coherent. The tree is what gets *repeatedly covered* — the high-evidence region of this field. The skeleton is the ridge of that region. You don't construct the skeleton; you extract it from where the memory accumulated.

These metaphors live here. The brief body describes the algorithm in invariants — math doesn't care which dolly trajectory, only that the viewpoint set has required coverage properties and the memory accumulates correctly.

---

## Epistemic posture (load-bearing)

You are an **observational scientist**, not an algorithm implementer. The deliverable is a *measurement apparatus*. Channel Vera Rubin: many independent observations, iterative model refinement, structure inferred from where evidence accumulates, patience with noisy data.

**Posture B — vision-only stereo recovery.** The apparatus treats source 3D positions as **unobserved structure** and recovers them purely from rendered views via stereo correspondence. Cameras are real cameras. The algorithm's input is the **rendered pixel data** of the point cloud, NOT the raw 3D coordinates as labels. Source positions enter only as a final ground-truth check at validation time, never as algorithm input. This discipline forces parsimony, makes the apparatus noise-tolerant, and generalizes the code to consume iPhone photographs in future cycles.

**The unifying primitive — Monte-Carlo evidence accumulation.** The apparatus doesn't *compute* the skeleton, it *measures* it. Every observation (silhouette appearance, medial classification, orientation-tomography channel score, positional stability across passes) is a deposit into a per-point evidence memory. **Shape is what gets repeatedly covered.** Confidence emerges from accumulated depth across channels and passes. Classifications and lock-in decisions are thresholds read off the accumulator, never single-observation judgments. More passes always deepen memory; classifications only stabilize. There is no premature-convergence trap.

**Disciplines as tools:** computer vision (multi-view geometry, image-space skeletonization, stereo correspondence — OpenCV is allowed), 3D tubular structure extraction (Hessian ridge-following on scalar fields; vessel-tracing literature in MRI/CT is directly applicable), pipe-model botany (Shinozaki 1964, Murray's law — for Phase 3c taper-projected tip extrapolation AND Phase 4 radius accumulation; the two are co-determined views of the same biological relationship). Reach for whichever the apparatus needs.

---

## Standing requirements

1. **Name yourself in publish notes.** First line of every commit body + status update.
2. **Surface scope drift** per `[[feedback_baby_must_surface_scope_drift]]`.
3. **Mandatory reads at session start:**
   - The Preamble + Posture sections above
   - `arborist/NOTES.md` 2026-05-19 evening + 2026-05-20 entries (esp. Project: Li'l Vera)
   - `arborist/bidirectional_skeleton.py` (Hawthorn's Phase N.1 prior art; do not modify)
   - `arborist/lidar_extract.py` (QSM baseline, untouched)
4. **Stop at every stage boundary.** Status report → operator visual validation in /arborist alignment oracle → operator dispatches next stage.
5. **Working tree is dirty** with operator's unrelated in-flight work. Edit only files this brief touches.
6. **Determinism.** Same specimen + same seed + same hyperparameters → byte-identical output skeleton JSON.
7. **Performance.** Per-rig + per-orientation + per-voxel processing is embarrassingly parallel. Use numpy vectorization or multiprocessing so 500-rig overnight runs scale ≤ linearly with core count.
8. **Operational mode — standalone CLI app + disk-persistent results.** The primary interface for overnight runs is a CLI (`python arborist/lil_vera.py --treeId=... --N=... --out=...`), NOT the HTTP endpoint. CLI writes result JSON to `arborist/state/lil-vera/<treeId>/run-<ISO-timestamp>-N<N>.json`. Result JSON includes: full skeleton output (chain graph + radii), hyperparameters used, per-pass diagnostics (memory accumulation curves, ridge extraction stats, info-gain trace), source-3D-validation residuals (for Rubin-test traceability). HTTP endpoint exists as quick-iteration convenience and shells out to the same CLI. LidarWorkstage gains a "Saved Runs" picker for the Li'l Vera layer — operator browses past runs by `<treeId>/run-*.json`, loads any one as the current overlay, compares N=100 vs N=500 vs varied hyperparameters side-by-side. Operator's overnight workflow: launch CLI, close laptop lid, sleep, open laptop, browse results in /arborist next morning.

---

## Algorithm — invariants only

### Inputs

- Point cloud P₀ (raw, source frame; pulled via `lidar_extract.py`'s `load_pointcloud`)
- Hyperparameters: N (total rig positions, single primary knob), K_orient (orientation tomography samples per point, suggested 200), pitch ratio (spiral parameter), ridge thresholds (eigenvalue ratio, memory minimum), patience parameters (M passes, ε memory-stability)

### Rig — 3 cameras at 120°

Each rig captures **three cameras at 120° around the rig's vertical axis, looking inward toward the tree's symmetry axis.** Properties by construction:

- **Complete silhouette coverage per rig** — every point in the tree's volume is on the front hemisphere of ≥ 2 of 3 cameras
- **Universal within-rig stereo** — every point is observable to ≥ 2 cameras whose visible hemispheres overlap; stereo correspondence is possible for every point at every rig position
- **Triple-consensus per rig** — independent classification opinions available even before multi-rig accumulation

### Spiral — single N knob

**Spiral around the tree's vertical symmetry axis**, single primary knob N (total rig count) + pitch ratio (vertical-rise-per-orbit / tree height). Two superimposed spirals at different pitches give mixed-baseline coverage (wide for global topology, narrow for local connectivity) without complicated mixed-distribution math.

Operational mode: N=50 for development spikes; **N=500 for the load-bearing overnight runs at Stages N.2.1 onward.**

### Phase 1 — Per-rig observation → 3D candidate points

For each rig position r ∈ {1...N}:
- Render the working point cloud from each of the 3 cameras (rgba splat, small radius). Three images per rig.
- Per image: image-space silhouette mask + medial-axis chains via scikit-image `skeletonize` or equivalent.
- Within-rig stereo correspondence between camera pairs (3 pairs per rig): match medial-axis chains using epipolar constraint; triangulate to 3D candidate points + chain identities.
- Per-candidate output: 3D position + classification (silhouette boundary | medial-axis interior | body interior) + per-rig confidence from stereo correspondence quality.

### Phase 2 — Per-point evidence accumulation (THE primitive)

Across all N rigs + multiple iteration passes, accumulate a per-point evidence vector for every candidate in 3D space.

**Critical distinction — two memory channels with different epistemic status:**

- **`M_obs(p)` — observational memory.** Deposits from passive observation: silhouette/medial classifications across rigs, orientation tomography channel scores, positional stability. This is *evidence*. Phase 2 contributes to M_obs only.
- **`M_interp(p)` — interpretation memory.** Deposits from active extraction decisions: which points were absorbed by axonal reach (3b), which were lock-in by ridge tracing (3a). This is *commitment*. Phase 3 contributes to M_interp only.

Ridge extraction (3a) and tomography-classification thresholds read primarily from **M_obs**. M_interp may be consulted as confirmation (a point both well-observed AND already committed by adjacent extraction is high-confidence). But M_interp alone never drives a fresh lock-in — that would risk positive-feedback misclassification (the algorithm convincing itself an interpretation is real because it's been "remembered" through prior interpretation).

This distinction is the safeguard against the apparatus hallucinating structure that isn't in the data.

#### 2a — Multi-rig consensus deposit
For each 3D candidate point: across rigs where this point appears, increment its memory channels:
- **silhouette_count**: how many rig-views classified this point as silhouette boundary
- **medial_count**: how many classified as medial-axis interior
- **body_count**: how many as body interior
- **rigs_seen**: total rig-views containing this point

#### 2b — Orientation tomography deposit (the "drag a stick through jelly" primitive)
For each candidate point p, sample K_orient orientations (deterministic Fibonacci-on-sphere over direction unit vectors). For each orientation u_k:
- Drag a small probe cone (length ~10cm, radius ~tip-radius) through p along u_k
- Compute **channel score(p, u_k)**: combines point-density along the drag direction, low perpendicular residual, monotonic density profile (penalize discontinuities), rotational symmetry around u_k
- Score distribution per point is a length-K_orient vector

The *shape* of this distribution classifies the point's structural role:
| Distribution shape | Classification | Local axis |
|---|---|---|
| Sharp unimodal peak | linear-interior | peak direction |
| Bimodal / multimodal | junction | each peak direction |
| Unimodal but one-sided | tip | direction pointing inward |
| Approximately flat | noise | none |
| Distributed along a great circle | sheet artifact | none |

Per-point tomography output: classification label + local axis direction(s) + confidence (sharpness of peak(s)) → deposited into the memory vector.

#### 2c — Patient iteration
Repeat Phases 1 + 2a + 2b across passes. **M_obs is monotonically additive.** Across passes, candidate positions stabilize (parallax + stereo are noisy single-pass, smooth across passes). Phase 2b tomography-classified tip candidates (one-sided distribution-shape) converge to ε_tip stability across the last M passes.

**Termination criterion:** when M_obs accumulation flattens — per-pass change in the dominant observational memory channels falls below ε_memory across all points, OR when ≥ 99% of tomography-classified tip candidates have positional stability under ε_tip for M consecutive passes. (Note: these are *tomography-classified candidate tips* from 2b, not Phase 3c's final taper-projected tips, which emerge later.)

NO ridge extraction during Phase 2 — only observational deposit. This is the discipline.

### Phase 3 — Skeleton extraction: ridge tracing + axonal glimpse-reach (interleaved)

The tree IS the ridge of the accumulated memory field — for the parts of the tree the apparatus can clearly observe. But **inside dense leaf clumps**, visibility is dominated by leaf surface; branch-signal evidence comes only from brief "glimpses" through occlusion gaps. Pure ridge extraction will miss interior canopy structure entirely. **Two primitives are required, running in interleaved passes:**

| Primitive | What it handles | Operates on |
|---|---|---|
| **3a — Ridge extraction** | Regions of strong memory accumulation (trunk, primary scaffolds, unoccluded segments) | High-M region of the field; reads global topology from where evidence is dense |
| **3b — Axonal glimpse-reach** | Regions of weak memory but strong axial prior (interior canopy, occluded segments, gaps between ridge fragments) | Extracts structure from weak evidence + strong priors — something ridge extraction structurally cannot do |

Together they partition the failure-mode space cleanly. Run them simultaneously on every iteration pass; each one's output feeds the next pass's memory and the other primitive's working set.

#### 3a — Ridge extraction

- Smooth the 3D observational memory field M_obs (Gaussian σ ~5cm) into a scalar density M(x,y,z).
- Per voxel, compute the 3D Hessian of M. Eigenvalue decomposition gives (λ₁ ≥ λ₂ ≥ λ₃) and eigenvectors (v₁, v₂, v₃).
- **Ridge condition:** |λ₂|, |λ₃| << |λ₁| AND M_obs above threshold. The local axis is v₁.
- **Trace ridges:** seed from high-M_obs points classified as tips (Phase 2b output); follow v₁ direction step by step until reaching ground OR meeting another ridge OR M_obs drops below threshold.
- Ridge intersections become **junction nodes** (where ridges merge — at points classified as junctions by Phase 2b's tomography distribution).
- Output: a set of ridge chain fragments. Connectivity is NOT yet enforced at this stage — gaps and orphaned fragments are expected and are 3b's job to handle.

#### 3b — Axonal glimpse-reach (the load-bearing connectivity + canopy-interior primitive)

For each ridge-fragment endpoint AND each chain identified as having an incomplete parent-or-child connection:

- **Spawn a confidence-cone probe** at the endpoint, oriented along the chain's local axial direction (extended forward for child-search, backward for mother-search).
- The cone's working medium is the FULL M_obs field, including the LOW-M_obs regions ridge extraction skipped.
- **Glimpse-capture criterion:** within the cone, sample M_obs at probe steps. A point with M_obs above a glimpse-threshold (lower than ridge-threshold) AND with a tomography-classification consistent with the cone's axial direction (i.e., the point's preferred orientation peak aligns with the cone's direction) becomes a candidate glimpse-absorption.
- **Commit:** if a sequence of glimpse-absorptions chains coherently along the cone direction, extend the ridge fragment through them. Deposit into **M_interp** at the absorbed locations (this strengthens those regions as confirmed-skeleton for next pass's extraction queries; does NOT add to M_obs and so does NOT risk positive-feedback hallucination — the underlying observational evidence still has to support continued growth on the next pass).
- **Mutual recognition:** when a probe from fragment A's endpoint encounters another locked-in fragment B (either directly or via a glimpse-chain), AND fragment B's reciprocal probe in the opposite direction would find A, declare a connection. Edge added to the chain graph.
- **Termination:** cone retracts when no glimpse-absorption succeeds for K consecutive steps (suggested K=5).

This is the primitive that extracts interior canopy skeleton. Without it, the apparatus produces clean trunk + scaffolds but blank interior canopy. With it, glimpses through leaf-gaps accumulate into committed interior structure over iterations.

#### 3c — Taper-projected tip extrapolation

**The principled tip-detection primitive.** Real LiDAR rarely directly observes the smallest twigs — point returns drop below scanner resolution. Trying to detect tips by "scan until points run out" inherits the visibility problem (QSM's failure mode). Instead: **infer tip location from observed taper.**

For each chain endpoint that has not connected to another chain (candidate tip):

1. Estimate observed taper rate τ = |dr/ds| from the chain's last several segments, where per-segment radius r is estimated from M_obs's perpendicular spread around the chain spline (the cross-section thickness of the observational memory tube the chain passes through).
2. **Confidence test:** is τ consistent (low variance) across the observed segments?
3. **Project tip:** if τ is consistent, the inferred tip is at arc-length r/τ beyond the last-observed segment, along the chain's last-observed axial direction (with optional minor curvature continuation if the chain has been curving).
4. **Flag uncertain:** if τ is inconsistent, mark the endpoint "uncertain termination." Conservative projection (use minimum observed τ) OR leave open for additional iteration passes to refine τ as more M_obs accumulates along the chain.

Tips emerging from 3c become Phase 4's pipe-model anchors.

**Co-determination with Phase 4:** taper-projection and pipe-counting are two views of the same biological relationship (Murray's law). Per-chain observed radii (from Phase 4) should be consistent with taper-extrapolated tip projections (from 3c). Disagreement is a diagnostic — surface for inspection rather than silently committing.

#### 3d — Interleaving across passes

All of 3a + 3b + 3c run on every iteration pass:
- 3a reads the current memory field, produces ridge fragments
- 3b takes ridge fragments + memory field as inputs, extends via glimpse-reach into low-M regions, deposits new memory at absorbed glimpses
- 3c examines unconnected endpoints, projects tips via taper extrapolation, flags uncertain terminations for next-pass attention
- Updated memory + extended fragments + projected tips → next pass's 3a sees stronger signal in formerly-low-M regions; next pass's 3b uses refined tip projections as growth targets
- Iteration terminates when no new fragments are added AND no new connections are formed AND no uncertain terminations remain flagged in a full pass

Output (final): connected skeleton chain graph in 3D space with taper-projected tips, same `{x, y, z, radius=null, parentIdx}` JSON shape as `lidar_extract.py` and `bidirectional_skeleton.py`. Connectivity enforced (no isolated fragments). Tips terminate at biologically-plausible inferred locations, not at memory-runout points. Radius filled in by Phase 4.

### Phase 4 — Pipe-model backward-forward radius accumulation

On the extracted ridge graph:
- **Backward pass:** for each terminal-tip ridge node, trace its path through the graph back to the ground (trunk base). Each tip = one "pipe."
- **Forward pass:** walk ground→tips through the graph. At each ridge node, count overlapping pipes. **Radius² ∝ pipe count.** Pipe-model / Murray's law emerges from counting; NO heuristic radius function.
- Final skeleton JSON: `{x, y, z, radius, parentIdx}`.

### Phase 5 — Consensus-stability validation (Rubin test)

Run the full apparatus 4× with randomly subsampled rig sets (drop K% of rigs per run, K ∈ {10, 25, 40}). Quantify skeleton stability:
- Node-position variance across runs
- Branching-topology agreement
- Total chain count variance
- Tip-set agreement

A robust apparatus produces near-identical skeletons under viewpoint subsampling. **Rubin's test:** dark matter doesn't vanish when one telescope goes offline.

---

## Stage map

| Stage | Days | Output | Operator gate |
|---|---|---|---|
| **N.2.0 — Apparatus base** | ~1 | Phase 1 end-to-end (rig + spiral + per-view classification + stereo correspondence → 3D candidates). 5th alignment-oracle layer wired. Per-point memory vector scaffold (no orientation tomography yet). Run at N=50 for development. | Visual: candidate 3D chains sit inside the point cloud; no obvious mis-registration; the apparatus *observes* |
| **N.2.1 — Evidence accumulation + tomography** | ~1.5 | Phases 2a + 2b. Multi-rig consensus + orientation tomography deposit into per-point memory. Patient iteration with memory-stability termination. Run at N=500 overnight; operator dispatches and walks away. Save runs to disk per Standing Requirement #8. | Visual: dump the memory field as a debug layer in the alignment oracle (per-point heat density); does it concentrate along tree-shaped regions? Are tips classifying correctly via tomography distribution? |
| **N.2.2 — Skeleton extraction (ridge + reach + taper)** | ~1.5 | Phase 3 end-to-end: 3a Hessian-eigenvector ridge-following from the smoothed M_obs field + 3b axonal glimpse-reach into low-M_obs regions for interior canopy + 3c taper-projected tip extrapolation. Interleaved across iteration passes per 3d. Output: connected skeleton chain graph with biologically-plausible tips. **THE gate.** | Visual: extracted skeleton sits visibly inside the point cloud AND visibly cleaner than QSM AND visibly cleaner than Hawthorn's Bidirectional output. Closer to "looks like a tree." Interior canopy skeleton present (not blank). |
| **N.2.3 — Pipe-model radii** | ~0.5 | Phase 4 backward-forward radius accumulation. | Visual: do trunks taper sensibly toward tips? Do scaffold cross-sections sum at branching joints (Murray's law sanity)? |
| **N.2.4 — Rubin consensus-stability** | ~0.5 | Phase 5. 4 runs at 10/25/40% rig dropout. | Numerical: node-position variance + topology agreement above operator-acceptable thresholds across all dropout rates. |

---

## Acceptance — observation-shaped

At the N.2.2 gate (the load-bearing call):

1. **The skeleton looks like a tree.** Operator's gate phrase. Visible improvement over QSM (red-cyan) and Hawthorn's Bidirectional (magenta-yellow) layers in the alignment oracle.
2. **Interior canopy connectivity present.** The skeleton extends INTO the canopy mass, not just trunk + bare primary scaffolds. Glimpse-reach is doing its job — interior branches captured from intermittent rig-angle visibility.
3. **Connected output.** No isolated chain fragments. Every node reachable from the trunk-base ridge node via parent/child edges.
4. **Memory accumulation actually flattened.** The patient iteration in Phase 2 self-terminated; no operator-tuned cutoff was needed.
5. **Convergence under sub-sampling** (formally validated at N.2.4): skeleton near-identical under 25% rig dropout. The Rubin test.
6. **No heuristic radii.** Phase 4's radii emerge from pipe counting, not from local point cloud thickness or hand-tuned taper. Verify pipe-model conformance at branching joints.
7. **Tips inferred via taper extrapolation, not memory-runout.** Per-chain observed radii (Phase 4) ≈ taper-extrapolation predictions (Phase 3c) within tolerance. Surface disagreements; do not silently truncate at observation boundaries. Verifiable numerically per chain.

If the N.2.2 gate doesn't pop visibly: spike concluded honestly. Phase T fallback (statistical scalar extraction over Hawthorn's bidirectional or QSM output) is the next move. An honest spike conclusion is worth as much as an honest pop.

---

## Files

- `arborist/lil_vera.py` — new module, all phases. CLI: `--treeId=... --N=... --kOrient=... --pitch=... --out=...` → JSON-on-stdout AND persisted to `arborist/state/lil-vera/<treeId>/run-<timestamp>-N<N>.json`.
- `arborist/serve.js` — new endpoint `POST /lidar/specimen/:treeId/lil-vera-extract` (HTTP convenience; shells out to CLI for short runs). New GET endpoint for listing saved runs.
- `src/arborist/LidarWorkstage.jsx` — **5th alignment-oracle layer** "Li'l Vera" with cyan-magenta color coding (visually distinct from QSM red-cyan and Bidirectional magenta-yellow). Toggle + opacity slider matching existing pattern. **Saved Runs picker** for browsing past runs. Optional debug view: memory-field heatmap as a 6th visualization layer (deferable to follow-on if scope tight).
- Tuner sub-section in LidarWorkstage matching the Bidirectional sub-section pattern: sliders for N, K_orient, pitch ratio, ε_memory, ε_tip. Explicit Re-extract button.
- New optional dependency: OpenCV (for stereo correspondence + Hessian primitives). Surface in scope-drift; baby decides whether to use it or implement primitives directly with numpy/scipy.

---

## Non-goals (do NOT do)

- Do NOT modify `lidar_extract.py` or `bidirectional_skeleton.py`. Both stay as comparison baselines in the alignment oracle.
- Do NOT integrate into `generate-procedural.js`. Cycle 1 produces the *measurement apparatus*; procedural integration is a future cycle conditioned on N.2.2 passing.
- Do NOT consume source 3D positions as algorithm input (Posture B violation). Source positions are for rendering input + final validation only.
- Do NOT extend to multiple specimens beyond N.2.4's subsampling-robustness test. One specimen for development.
- Do NOT touch other species or Phase G.1 procedural-runway work. Parallel cycle.
- Do NOT add iPhone-photo support, web UI, or open-source release scaffolding. Those are future cycles; Cycle 1 stays narrowly focused on the visual gate per the Project: Li'l Vera NOTES entry.
- Do NOT optimize prematurely. The apparatus is research-grade; performance comes after correctness.

---

## Post-cycle cleanup (if N.2.4 ratifies the apparatus)

1. `arborist/NOTES.md` — Project: Li'l Vera Cycle 1 entry capturing apparatus architecture + observation results + comparison-to-baselines + ridge-extraction lessons.
2. `arborist/BACKLOG.md` — Phase N.2 marked `[x]`; new Phase N.3 entry for "Cycle 2: multi-specimen + per-species distribution learning" pending future dispatch.
3. Memory `[[project_lidar_as_training_data]]` — body updated to reflect the new doctrine: apparatus accumulates per-point evidence; tree emerges as ridge of memory field; same apparatus on synthetic-noise inputs = procedural skeleton generation in future cycles.

---

End of brief.
