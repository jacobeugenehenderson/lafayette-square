# Project: Li'l Vera — Cycle 1 — First Light

> **Project: Li'l Vera** is an ongoing initiative within the Arborist to build a Monte-Carlo consensus-inference observational skeleton-extraction system — named in honor of the operator's beloved AND of Vera Rubin (the astronomer whose observational posture the apparatus channels; the Vera C. Rubin Observatory carries her name forward in the same lineage). The project is anticipated to span multiple cycles; this brief defines **Cycle 1 — First Light** — the foundational apparatus + its first single-specimen observation. Future cycles will refine algorithm choices, generalize beyond LiDAR sources, integrate with procedural generation, and tune the apparatus from the lessons of First Light.
>
> The implementing baby self-names per Standing Requirement #1. Li'l Vera is the project; the baby is its first builder.
>
> Specialist baby brief. ~3–4 day budget. Five stages with stop points. **Each stage stops at the boundary** — report, operator validates, next stage dispatched. Do NOT batch.

---

## For the human reader (intuition pumps; not in the brief body)

Imagine three cameras mounted as a rigid rig at 120° around a vertical axis, spiraling down past the tree. Each rig position takes a triple snapshot. Adjacent cameras within a rig see overlapping hemispheres — they do stereo. Across the spiral, every part of the tree gets observed from many rig positions, at multiple angular scales. Crank N=500 overnight; you get 1500 individual observations partitioned into 500 triples covering the tree exhaustively.

Within each pass, the apparatus does THREE things to every point in the working set: confirm it's part of a skeleton chain (lock it in as a spline), reject it as noise, or defer it for the next pass. Locked-in regions and rejected regions both get *masked out* of the point cloud before the next pass's renders — so each pass sees a cleaner residual. The algorithm progresses like Vera Rubin subtracting known-rotation models from galaxy curves to study what's left.

These metaphors live here, in the preamble. The brief body below describes the algorithm in **invariants** — the math doesn't care which spiral path the camera follows; it cares that the resulting viewpoint SET has the required coverage and stereo-overlap properties.

---

## Epistemic posture (load-bearing)

You are an **observational scientist**, not an algorithm implementer. The deliverable is a *measurement apparatus*. You're channeling Vera Rubin: many independent observations, iterative model refinement, structure inferred from the residual between observation and prior model, patience with noisy data.

**Posture B — vision-only stereo recovery.** The apparatus treats source 3D positions as **unobserved structure** and recovers them purely from rendered views via stereo correspondence. Cameras are real cameras. The algorithm's input is the **rendered pixel data** of the point cloud, NOT the raw 3D coordinates as labels. Source positions enter only as a final ground-truth check at validation time, never as algorithm input.

Why this discipline matters: it forces parsimony (only structure that survives 2D→3D recovery is kept), it makes the algorithm noise-tolerant (positional source errors don't propagate as labels), and it generalizes the apparatus beyond LiDAR — same code could process iPhone photographs of a tree in a future cycle.

**Underlying engine — Monte-Carlo consensus inference.** The apparatus doesn't *compute* the skeleton; it *measures* it via large-N stochastic sampling. Stratified observation across cylindrical pose-space (spiral), consensus inference across the ensemble, bootstrap resampling for robustness (Phase 6), and stochastic neighborhood probing for connectivity (Phase 3b mutual recognition) are all Monte-Carlo-shaped primitives. There is no premature-convergence trap — cranking N just monotonically tightens the inference. Variance-reduction techniques (importance sampling, Latin hypercube, low-discrepancy sequences) are available upgrades for future cycles if naive uniform sampling proves wasteful; for this cycle, default to stratified Fibonacci-on-cylinder.

**Disciplines as tools:**
- Computer vision (multi-view geometry, image-space skeletonization, stereo correspondence — OpenCV is allowed as an explicit dependency)
- Local axis fitting (PCA, polynomial regression)
- Pipe-model botany (Shinozaki 1964, Murray's law) — only for Phase 4 radius accumulation
- Bayesian-style hypothesis refinement (information-gain stopping)

Reach for whichever discipline the apparatus needs. Don't over-commit to one literature.

---

## Standing requirements

1. **Name yourself in publish notes.** First line of every commit body + status update: e.g., "Baby Li'l Vera — Phase N.2.0 — apparatus construction".
2. **Surface scope drift** per `[[feedback_baby_must_surface_scope_drift]]`. Disclose: files touched outside brief, schema extensions, new dependencies, deviations.
3. **Mandatory reads at session start:**
   - The Preamble + Posture sections above
   - `arborist/NOTES.md` 2026-05-19 evening + 2026-05-20 early-hours entries
   - `arborist/bidirectional_skeleton.py` (Hawthorn's Phase N.1 prior art; do not modify)
   - `arborist/lidar_extract.py` (QSM baseline, untouched)
4. **Stop at every stage boundary.** Status report → operator visual validation in /arborist alignment oracle → operator dispatches next stage.
5. **Working tree is dirty** with operator's unrelated in-flight work. Edit only files this brief touches.
6. **Determinism.** Same specimen + same seed + same hyperparameters → byte-identical output skeleton JSON.
7. **Performance.** Per-rig processing is embarrassingly parallel. Use numpy vectorization or multiprocessing so 500-rig overnight runs scale ≤ linearly with core count. The "set N=500 and walk away" workflow is the recommended operational mode for Stages N.2.2+.
8. **Operational mode — standalone CLI app + disk-persistent results.** The primary interface for overnight runs is a standalone CLI (`python arborist/observational_skeleton.py --treeId=... --N=... --out=...`), NOT the HTTP endpoint. HTTP-driven runs are too fragile for multi-hour overnight workflows (require dev server + browser tab + fetch lifecycle). Architecture:
   - **CLI writes result JSON to `arborist/state/observational/<treeId>/run-<ISO-timestamp>-N<N>.json`** — durable artifact, survives process restarts, batch-friendly.
   - Result JSON includes: full skeleton output (chain graph + radii), hyperparameters used, per-pass diagnostics (point counts, info-gain curve, elimination rates), timestamps, source-3D-validation residuals (for Rubin-test traceability).
   - **`serve.js` endpoint remains as the quick-iteration convenience** for short runs (~30s) inside the workstage. Behind the scenes the endpoint shells out to the same CLI.
   - **LidarWorkstage gains a "Saved Runs" picker** for the Observational layer — operator browses past runs by `<treeId>/run-*.json`, loads any one as the current overlay, compares N=100 vs N=500 vs varied hyperparameters side-by-side. The alignment oracle generalizes from "one layer per algorithm" to "one layer per saved run."
   - Operator's overnight workflow: `python arborist/observational_skeleton.py --treeId=10186 --N=500 --out=...` (or batch script over multiple specimens), close laptop lid, sleep, open laptop, browse results in /arborist next morning.

---

## Algorithm — invariants only

### Inputs
- Point cloud P₀ (raw, source frame; pulled via `lidar_extract.py`'s `load_pointcloud`)
- Hyperparameters: N (total rig positions, single primary knob), K_rigs (multi-rig consensus minimum), r_max (axial fit residual ceiling), ε_info (per-pass information-gain stopping threshold), M (passes-without-claim before global noise rejection)

### Rig
**Three cameras at 120° around the rig's vertical axis, looking inward toward the tree's symmetry axis.** Each rig captures one triple snapshot. Properties this rig gives by construction:

- **Complete silhouette coverage per rig** — every point in the tree's volume is on the front hemisphere of at least 2 of 3 cameras
- **Universal within-rig stereo** — every point is observable to ≥2 cameras whose visible hemispheres overlap, so stereo correspondence is possible for every point at every rig position
- **Three independent observations per rig** — triple-consensus available even before multi-rig consensus

### Spiral
**Single sampling pattern: spiral around the tree's vertical symmetry axis**, single knob N (total rig count), pitch parameter p (vertical-rise-per-orbit / tree height). Two superimposed spirals at different pitches give mixed-baseline coverage (wide for global topology, narrow for local connectivity) without complicated mixed-distribution math.

Invariants the spiral satisfies by construction:
- Coverage: every point in the volume visible from ≥ K_rigs rig positions
- Mixed baselines: the two superimposed spirals provide angular separations across at least 2 orders of magnitude

**Operational mode:** N=50 for development spikes; N=500 for the load-bearing overnight runs at Stage N.2.2 onward.

### Phase 1 — Per-rig observation
For each rig position r (one of N):
- Render P from each of the 3 cameras (rgba splat with small radius). Three images per rig.
- Per image: image-space silhouette mask + medial-axis chains via scikit-image `skeletonize` (or equivalent).
- Within-rig stereo correspondence between camera pairs (3 pairs per rig at 120°): match medial-axis chains across paired views using epipolar constraint; triangulate to **3D candidate skeleton chains**.
- Output per rig: a list of 3D candidate chains, each with provenance (which rig, which camera pair) and per-chain confidence score from stereo correspondence quality.

### Phase 2 — Multi-rig consensus consolidation
Across all N rigs:
- Match candidate chains across rigs (chains within ε spatial distance and within ε angular orientation considered the same chain).
- A chain consolidates if it appears in ≥ K_rigs rigs with consistent topology.
- Output: a consolidated 3D chain set C with per-chain consensus score = (rigs-confirming × per-rig-confidence).

### Phase 3 — Multi-axon growth with neuronal mutual recognition
The apparatus operates on three primitives in concert: **parallax** (consensus score from multi-rig observation), **axial regression** (local axis fit residual), and **bidirectional mutual recognition** (neuronal probing for parent/child partners). All three must agree for high-confidence lock-in. Skip the third and the algorithm is just glorified path-finding; skeleton fragments emerge with no enforced connectivity, recapitulating the QSM failure mode.

The three primitives produce ORTHOGONAL evidence — parallax confirms existence, axial regression confirms local linearity, mutual recognition confirms global connectivity. None substitutes for the others.

#### 3a — Forward growth (coupled parallax + axial regression)

- **Bootstrap:** identify trunk-axis seed via RANSAC vertical line fit on the densest vertical cluster in P. Identify tip seeds via consolidated-chain terminal points (chains with one free end in the upper canopy region).
- **Grow N axons simultaneously.** Each axon has a head, an evolving axial fit, and a forward confidence cone.
- **Per growth step (all axons in parallel):**
  - Candidate pool for axon a = consolidated chains within a's confidence cone, not yet claimed by a
  - Acceptance test = (consensus score ≥ K_rigs) AND (axial fit residual when this candidate is included ≤ r_max)
  - **Pass** → absorb chain, extend head, recompute axial fit
  - **Fail** → locally disqualify FOR THIS AXON
- **Inter-axon competition:** chains claimable by multiple axons go to the lowest-residual claimant. Truly ambiguous claims defer to next pass.
- **Within-pass forward-growth termination:** when no axon can extend without exceeding r_max.

#### 3b — Neuronal mutual recognition (THE load-bearing connectivity primitive)

After forward growth saturates within a pass, every locked-in node reaches out:

- **Mother-search probe:** bounded-radius lookup in the direction of the axon's continuation toward the trunk. The probe seeks (a) another locked-in node in another axon, OR (b) a high-confidence consolidated chain with compatible axial orientation.
- **Child-search probes:** bounded-radius lookups in tip-direction(s). For each candidate child direction (multiple, since real nodes can have multiple children), probe for partners.
- **Mutual-recognition criterion:** a probe finds a partner if AND only if the partner's own probe in the reciprocal direction would find this node back. Recognition is symmetric by construction — both ends must independently signal toward each other.
- **Connection formation:** when mutual recognition succeeds, a connection edge is added to the chain graph. Both endpoints get a confidence bump; the (mother-child) hierarchy is established along the connection.
- **Confidence demotion:** locked-in nodes with no successful probes after `Q` mutual-recognition rounds (Q = 2 suggested) are demoted to deferred status — they exist geometrically but aren't connected to the global structure, so they're not yet trustworthy as skeleton.

This is the actual neuronal behavior — not a path-finding heuristic, but a topology-forming primitive where structure emerges from reciprocal probing rather than from one-direction extension. In real neurons, this is filopodia + chemotactic guidance + synaptic mutual recognition; in real trees, this is cambial connectivity between vascular bundles. We're recreating the structural primitive, not the chemistry.

#### 3c — Per-pass termination

The pass ends when forward-growth (3a) AND mutual-recognition (3b) both saturate — no axon extends, no probe finds new partners.

**Optional advanced mode (stretch goal, only if time permits):** instead of forward-growth-then-mutual-recognition as discrete phases, run them concurrently — every locked-in node probes in every direction continuously, with growth and recognition happening on every step. Closer to actual neural development. More complex; leave as Phase 3-prime for a future cycle unless baby has clear time within budget.

### Phase 4 — Three-outcome elimination on shrinking residual
Per pass, every chain in the consolidated set C ends in one of three states:

1. **Locked-in** — absorbed by an axon. Becomes a spline. Constituent point cloud region masked out for future passes.
2. **Rejected** — no axon claims after M passes without a claim. Confirmed noise. Constituent point cloud region also masked out.
3. **Deferred** — neither locked nor rejected. Stays in the uncertain set for the next pass.

**Critical invariant:** the next pass's renders use P_{N-1} (the residual after masking locked-in + rejected regions), NOT P₀. Each pass operates on a strictly smaller, strictly cleaner point cloud. Axons confidently identified on pass N are not re-classified on pass N+1; they're simply gone from the data the apparatus sees. The algorithm self-recovers from over-cautious early decisions because deferred points carry forward into next pass's classification.

**Termination:** per-pass information gain (e.g., reduction in entropy of the remaining set's chain-orientation distribution) drops below ε_info, OR |P_N| / |P₀| falls below threshold (suggested: 5%). Self-terminating; no operator-tuned cutoff in the loop.

### Phase 5 — Pipe-model backward-forward radius accumulation
On the final locked-in chain graph:
- **Backward pass:** for each terminal-tip chain, trace its path through the locked-in chain graph back to the ground (trunk base). Each tip = one "pipe."
- **Forward pass:** walk ground→tips through the chain graph. At each spline cross-section, count overlapping pipes. **Radius² ∝ pipe count.** Pipe-model / Murray's law emerges from path counting; NO heuristic radius function.
- **Emission:** spline + per-segment radius → cylinder graph JSON in the same `{x, y, z, radius, parentIdx}` shape `lidar_extract.py` and `bidirectional_skeleton.py` emit.

### Phase 6 — Consensus-stability validation (Rubin test)
Run the apparatus 4× with randomly subsampled rig sets (drop K% of rigs per run, K ∈ {10, 25, 40}). Quantify skeleton stability: node-position variance across runs, branching-topology agreement, total chain count variance.

A robust apparatus produces near-identical skeletons under viewpoint subsampling. **Rubin's test:** dark matter doesn't vanish when one telescope goes offline.

---

## Files

- `arborist/observational_skeleton.py` — new module. All phases. CLI: `--treeId=... --N=... --kRigs=... --rMax=... --epsInfo=... --M=...` → JSON-on-stdout, same shape as `bidirectional_skeleton.py`.
- `arborist/serve.js` — new endpoint `POST /lidar/specimen/:treeId/observational-extract`. Same shape as bidirectional endpoint.
- `src/arborist/LidarWorkstage.jsx` — **5th alignment-oracle layer** "Observational" with cyan-magenta color coding (visually distinct from QSM red-cyan and Bidirectional magenta-yellow). Toggle + opacity slider matching existing pattern. Per-pass diagnostic rendering option (show pass-N residual + pass-N's locked-in chains).
- Tuner sub-section in LidarWorkstage matching the Bidirectional sub-section pattern: sliders for N, K_rigs, r_max, ε_info, M, pitch ratio. Explicit Re-extract button.
- New optional dependency: OpenCV (for stereo correspondence primitives). Surface in scope-drift; baby decides whether to use it or implement primitives directly with numpy/scipy.

---

## Stage map

| Stage | Days | Output | Operator gate |
|---|---|---|---|
| **N.2.0 — Apparatus construction** | ~1 | Phase 1 + multi-rig consolidation (Phase 2). 3-camera-rig spiral renderer + per-view silhouette/medial extraction + within-rig stereo triangulation + multi-rig chain consensus. Run at N=50 for development. 5th alignment-oracle layer wired. Output: 3D candidate chains visible in workstage. No iteration yet. | Visual confirmation that the apparatus *observes* — candidate 3D chains sit inside the point cloud, look like skeleton fragments, no obvious mis-registration |
| **N.2.1 — Single-pass multi-axon growth** | ~0.5 | Phase 3 end-to-end. Single growth pass on consolidated chains. Three-outcome classification (lock / reject / defer) reported per pass. No mask-and-re-render yet. | Visual: do the single-pass locked-in chains form a coherent skeleton subset? Do rejected chains look like noise? |
| **N.2.2 — Iterative refinement with shrinking residual** | ~1 | Phase 4 full loop. Mask-and-re-render between passes. Information-gain termination. Run at N=500 (overnight); operator dispatches and walks away. | **THE gate.** Visual: terminal skeleton sits visibly inside point cloud AND visibly cleaner than QSM AND visibly cleaner than Hawthorn's Bidirectional output. Closer to "looks like a tree." |
| **N.2.3 — Pipe-model radii** | ~0.5 | Phase 5 backward-forward radius accumulation. Cylinder mesh emission. | Visual: do trunks taper sensibly? Do scaffold cross-sections sum at branching joints (Murray's law sanity)? |
| **N.2.4 — Consensus-stability validation (Rubin test)** | ~0.5 | Phase 6 robustness test. 4 runs at 10/25/40% rig dropout. | Numerical: node-position variance < operator-acceptable threshold across all dropout rates. |

---

## Acceptance — observation-shaped, not algorithm-shaped

At the N.2.2 gate (the load-bearing call):

1. **Convergence under sub-sampling** (formally validated at N.2.4): skeleton near-identical under 25% rig dropout. The Rubin test — inferred structure doesn't depend on a particular telescope.
2. **Visible improvement over baselines.** In the alignment oracle, the N.2.2 skeleton sits *visibly* cleaner than both QSM (red-cyan) and Hawthorn's Bidirectional (magenta-yellow). Operator's gate phrase: closer to "looks like a tree."
3. **Self-terminating iteration.** Per-pass elimination curve flattens cleanly; algorithm reports "no further meaningful inference available" without operator-tuned cutoffs.
4. **No heuristic radii.** Phase 5's radii emerge from path counting, not from local point cloud thickness or hand-tuned taper functions. Verify pipe-model conformance at branching joints.

If the N.2.2 gate doesn't pop visibly: spike concluded honestly. Phase T fallback (statistical scalar extraction over Hawthorn's bidirectional or QSM output) is the next move. An honest spike conclusion is worth as much as an honest pop.

---

## Non-goals (do NOT do)

- Do NOT modify `lidar_extract.py` or `bidirectional_skeleton.py`. Both stay as comparison baselines in the alignment oracle.
- Do NOT integrate into `generate-procedural.js`. This brief produces the *measurement apparatus*; procedural integration is a future cycle conditioned on N.2.2 passing.
- Do NOT consume source 3D positions as algorithm input (Posture B violation). Source positions are for rendering input + final validation only.
- Do NOT extend to multiple specimens beyond N.2.4's subsampling-robustness test. One specimen for development.
- Do NOT touch other species or Phase G.1 procedural-runway work. Parallel cycle.
- Do NOT optimize prematurely. The apparatus is research-grade; performance comes after correctness.

---

## Post-cycle cleanup (if N.2.4 ratifies the apparatus)

1. `arborist/NOTES.md` — Phase N.2 entry capturing apparatus architecture + observation results + comparison-to-baselines.
2. `arborist/BACKLOG.md` — Phase N.2 marked `[x]`; new Phase N.3 entry for "procedural integration via observational apparatus" pending future dispatch.
3. Memory `[[project_lidar_as_training_data]]` — body updated to reflect the new doctrine (LiDAR teaches noise distributions; observational apparatus extracts AND generates skeletons via the same primitive — apparatus running on synthetic noise = procedural skeleton generation).

---

End of brief.
