# Project: Li'l Vera — Cycle 1 — First Light (rev. 2)

> **Project: Li'l Vera** is an ongoing initiative within the Arborist to build a Monte-Carlo consensus-inference observational skeleton-extraction system — named in honor of the operator's beloved AND of Vera Rubin (the astronomer whose observational posture the apparatus channels; the Vera C. Rubin Observatory carries her name forward in the same lineage). The project is anticipated to span multiple cycles; this brief defines **Cycle 1 — First Light** — the foundational apparatus + its first single-specimen observation. Future cycles refine algorithm choices, generalize beyond LiDAR sources, integrate with procedural generation, and tune the apparatus from the lessons of First Light.
>
> The implementing baby self-names per Standing Requirement #1. Li'l Vera is the project; the baby is its first builder.
>
> **REV. 2 NOTE (2026-05-20):** rev. 1 of this brief shipped to Baby Tycho across commits `604dfed` / `de00a30` / `0d9102d` (Stages N.2.0 / N.2.1 / N.2.2). Tycho built precisely what rev. 1 specified — but rev. 1 was missing a load-bearing architectural primitive: **the working set never shrinks; leaf-mass and noise never get rejected; the canopy never clears.** What rev. 1 produced was a ridge-tracer through a dense static memory field, which makes the canopy interior a wireframe ball regardless of how many rigs observe it. Rev. 2's first draft added Rubin-style residual subtraction with three-outcome elimination + species priors + parametric-spline output. **Then, during pre-dispatch coordinator review (2026-05-20 evening, after the Fraunhofer audit), the operator concluded the rev. 2 draft as written still "made decisions too fast" — leaning on Hessian ridge tracing as the primary structure-extractor and committing classifications eagerly per pass. A stereodetective point-cluster analyzer is nothing new and was unlikely to clear the visual gate.** Rev. 2 was restructured in place to **defer commitment** and lean on the neuronal reacher as the load-bearing extraction primitive (not just a connectivity-completer): (1) high-precision tip detection + RANSAC trunk give two confident *anchor sets*; (2) the rig **scans adaptively** in batches and stops when its verdicts stabilize — when adding more rigs produces near-zero new lock-ins and near-zero new rejections (no fixed N, no geometric cluster detector — the apparatus stops when more observation stops changing its mind); (3) bidirectional axonal *growth* — step by step, not cone-shot — builds connectivity middle-out from trunk + tips, with species curvature priors steering each step. Ridge tracing is removed entirely. The three load-bearing primitives (iteration + elimination, species priors, neuronal mutual recognition) survive, but the algorithm's temporal structure is now **tips-first, middle-out, adaptive-scan, growth-shaped**. **See "What's new in rev. 2" section below.**
>
> **REV. 2 IS A FRESH BUILD, NOT A RETROFIT.** Rev. 2 lives in a new module `arborist/lil_vera_v2.py` with a fresh baby reading this brief cold (no inherited rev. 1 mental model). Tycho's three commits survive as **baseline comparison artifacts** — the cyan-magenta Li'l Vera layer becomes "Li'l Vera v1 (baseline)" in the alignment oracle alongside QSM and Hawthorn's Bidirectional; v2 publishes a **6th alignment-oracle layer** for direct visual comparison. Rev. 1 primitives (apparatus base, tomography functions) are mandatory reads for context but ARE NOT IMPORTED — v2 builds them coherently in one module to preserve architectural integrity. The architecture is woven throughout (iteration loop touches every layer); surgical retrofit was not a coherent path.
>
> Specialist baby brief. ~7 day budget. Five stages with stop points. **Each stage stops at the boundary** — report, operator validates, next stage dispatched. Do NOT batch.

---

## For the human reader (intuition pumps; not in the brief body)

Seven pictures to keep in your head while you build:

1. **A spiral dolly with a 3-camera rig** at 120° around the tree. Each rig position takes a triple snapshot. The dolly **doesn't stop at a fixed N** — it keeps looping, adding rigs in batches, and stops when the apparatus's verdicts stabilize: when a fresh batch of rigs produces near-zero new lock-ins and near-zero new rejections, the apparatus has nothing more to learn from observation alone. A real measurement apparatus scans until the data stops surprising it, not until a stopwatch fires. (Hard safety cap N_max=2000 in case priors or thresholds are off; hitting it is a diagnostic.)
2. **Dragging a stick through jelly** at every candidate point, in hundreds of directions per point. The directions that produce a clean channel reveal the local structural axis. The shape of the channel-score distribution classifies the point (linear interior, branching junction, tip, noise, sheet artifact) — but classification is *tagged*, not *committed*. Hard commits come later, only when an anchor (trunk or tip) or a growing axon needs to consume the tag.
3. **A scalar memory field in 3D space.** Every observation deposits evidence at points the apparatus has seen as silhouette, medial, structurally-coherent. The tree is what gets *repeatedly covered* — the high-evidence region of this field.
4. **Vera Rubin subtracting known signals to find dark matter.** Per pass, the apparatus subtracts confidently-classified points — both **confirmed-skeleton (locked-in on a trunk↔tip path)** AND **confirmed-noise (rejected: leaf-mass at botanically-impossible position, scan sheet artifact)** — from the working set. Next pass renders the *residual*. The tree emerges progressively as leaves and noise dissolve out of the data the apparatus sees. **THE WORKING SET MONOTONICALLY SHRINKS.**
5. **A botanist checking the apparatus's homework.** Real Sugar Maples have bounded DBH, bounded heights, continuous taper, branch angles between ~30° and ~70° from vertical, strong-leader topology, children thinner than parents at every joint. The apparatus consults a **species botanical-priors file** at every classification decision *and* at every axonal growth step (to steer curvature). Geometrically-plausible candidates that are botanically impossible get rejected outright (hard constraints); botanically-unlikely candidates get deferred or down-weighted (soft constraints). This is the third inference channel alongside parallax + tomography — Bayesian priors that pull ambiguous observations toward biologically-correct answers.
6. **A forensics team marking the obvious evidence first.** Before trying to figure out anything in the middle, the apparatus identifies the two *easy* feature classes with high precision: the **trunk** (RANSAC vertical fit, trivially confident) and the **branch tips** (a precision-gated detector — long, thin, monotonically tapering, terminating in space, AND the species priors agree this is a plausible tip at this position). Tip detection is deliberately conservative — false-positive tips at leaf-cluster positions get rejected by the priors before they're allowed to anchor anything. The output is two **anchor sets** that the next primitive grows between. Tips first, middle later.
7. **Neurons growing axons toward synaptic partners — middle-out from trunk + tips.** The load-bearing extraction primitive (not just connectivity-completer). Every anchor in {trunk endpoints, tip anchors, prior-pass locked-in spline endpoints} spawns growing probes — like filopodia in a developing nervous system — in BOTH mother-direction (toward trunk) AND child-direction(s) (toward canopy; multiple if branching). Probes **grow step by step**, not as one-shot cones: at each step the probe (a) confirms a glimpse exists in M_obs ahead AND the species priors at that glimpse's position agree it's plausible skeleton, (b) re-derives its local direction by blending what it just saw with what the species's curvature priors expect at this height, (c) advances. Two growing probes from opposite-end anchors **handshake** when their tips meet AND their advancing directions agree — symmetric mutual recognition, no one-direction shortcuts, no MST closure fallback. The probes reach INTO low-evidence territory (leaf-occluded canopy interior) where direct observation can't see through the leaves but priors say "the branch keeps going" — picking up *glimpses* through leaf gaps that nothing else could. **Skip this primitive and the algorithm collapses to a stereodetective point-cluster analyzer; we already know that doesn't clear the visual gate — that's the failure mode the restructure was built to escape.** The algorithmic analog to filopodia + synapse formation is exact.

These metaphors live here. The brief body describes the algorithm in invariants — math doesn't care which dolly trajectory, only that the viewpoint set covers until verdicts stabilize across batches, the memory accumulates correctly, the working set shrinks each pass via dual classification (lock-in + rejection), every classification respects species-specific botanical constraints, AND skeleton is *grown* between trunk and tip anchors via step-by-step bidirectional axonal probes that handshake through low-evidence canopy interior.

---

## Epistemic posture (load-bearing)

You are an **observational scientist**, not an algorithm implementer. The deliverable is a *measurement apparatus*. Channel Vera Rubin: many independent observations, iterative model refinement, structure inferred from where evidence accumulates **AND from what gets confidently subtracted as known signal or known noise**.

**Posture B — vision-only stereo recovery.** The apparatus treats source 3D positions as **unobserved structure** and recovers them purely from rendered views via stereo correspondence. Cameras are real cameras. The algorithm's input is the **rendered pixel data** of the point cloud, NOT the raw 3D coordinates as labels feeding classifier inference. Source positions enter only as:

(a) **the rasterizer's input** (filtered through the working-set mask each pass);
(b) **bbox-scalar derivations** (`ground`, `tree_height`) — single scalars from the source bbox, used to compute `height_frac` for prior queries; not per-point labels;
(c) **RANSAC trunk-axis derivation** — a single 3D line (origin + direction) computed from the densest Z-column of P₀; used to compute `radial_dist` for prior queries; not per-point labels;
(d) **mask preparation in Phase 4** — per-source-point distance checks against extracted splines (`distance(P₀[p], spline) < ε_lock`) and consultation of candidate-derived classifier verdicts attributed to each source point via the explicit Phase 4 attribution step (see §Algorithm Phase 4). These reads decide which source points are excluded from NEXT pass's rasterizer input. They DO NOT feed classifier inference; they are mask-preparation, semantically equivalent to the rasterizer's masked input but applied at the *boundary between passes* rather than at render time. The classifier scalars Phase 4 consults are derived in Phase 2 from rendered observations of candidates (stereo-recovered), then attributed by spatial proximity to source points; no source 3D label ever crosses into the inference path.
(e) **final ground-truth validation** at end of Cycle 1.

These five carve-outs are documented exhaustively to prevent baby-time confusion; the rest of the algorithm holds the discipline. (Cycle 2+ may tighten (b)-(c) to fully vision-only derivations via per-rig silhouette-centroid regression; for Cycle 1 the carve-out is honest and pragmatic.) This discipline forces parsimony, makes the apparatus noise-tolerant, and generalizes the code to consume iPhone photographs in future cycles.

**The unifying primitive — Monte-Carlo evidence accumulation + Rubin-style residual subtraction.** Two halves of one mechanism:

1. **ACCUMULATE evidence per point** across many observations (silhouette appearance, medial classification, orientation-tomography channel score). Confidence emerges from accumulated depth across channels and passes.
2. **SUBTRACT confidently-classified points from the working set** at the end of each pass. Two distinct removals:
   - **Locked-in** — point lies inside a confidently-extracted skeleton chain. Removed. Spline persists in output.
   - **Rejected** — point classified as noise / sheet-artifact / leaf-mass / botanically-impossible with high confidence. Removed. Nothing persists.
3. **Next pass renders only the residual** — the points still uncertain (deferred). Locked-in regions don't re-classify; rejected leaves don't generate medial-axis pixels; the working set is monotonically smaller.

This is structurally how Rubin found dark matter: fit and subtract the known visible-mass rotation model, study the residual where the new physics lives. Same primitive here: subtract confident skeleton + confident leaves; study what remains; iterate until residual is exhausted. **Without subtraction, the canopy never clears — leaves persist as competing structure in the memory field, ridge tracing finds them, output is chaos.**

**The third inference channel — species-conditioned botanical priors (INPUT, not validation).** The apparatus is given the specimen's species identity as a *known input*. It is observing **a Sugar Maple**, not a generic tree. That identity conditions every classification decision via a position-dependent species spatial-prior file at `arborist/state/<species>/botanical-priors.json`. Priors encode:

- **Position-dependent expected radius envelope** — at height-fraction h and radial-distance-from-trunk-axis r, what radius range is biologically plausible? (Sugar Maple at 1m height near axis: 0.15-0.45m trunk; at 12m height 4m radially out: 1-3cm twigs; at 18m height 5m radially out: leaves only)
- **Position-dependent expected branch angle distribution** — Sugar Maple's strong-leader / Rauh's-model topology means scaffolds emerge 30-70° from vertical, NEVER horizontal or steeper than 80°.
- **Murray's law joint constraint** — at every branching point, parent radius² ≈ Σ child radii²; children must be thinner than parents.
- **Topology constraint** — strong-leader (one continuous trunk through canopy), NOT vase / NOT decurrent.
- **Hard rejections** (definite no-gos): DBH > species_max, branches at impossible heights, etc.
- **Soft priors** (down-weights, not hard rejections): unusual but possible (e.g., wind-damaged asymmetric crowns).

In Bayesian form: `P(skeleton_class | observation, species) ∝ P(observation | skeleton_class, species) × P(skeleton_class | species)`. The species conditions everything. The classifier isn't "is this thing structural?" — it's **"is this consistent with Sugar Maple skeleton at *this position in the tree*?"**

This directly addresses rev. 1's classifier failure mode. Tycho's 63% junction classification at N=500 was geometrically defensible (dense leaf-mass has many high-density orientation peaks) but botanically impossible (real Sugar Maples have <10% skeleton-node junctions). A position-conditioned Sugar Maple prior immediately rejects the leaf-mass candidates as "no Sugar Maple skeleton structure at this radial extent at this height" — they become leaves, not junctions. **The species prior is the leaf-discriminator pure geometry lacks.**

**Disciplines as tools:** computer vision (multi-view geometry, image-space skeletonization, stereo correspondence — OpenCV is allowed), neural-development biology (filopodia-style growth-cone navigation + synaptic mutual-recognition primitives — directly informs Phase 3b axonal growth), parametric spline fitting (Catmull-Rom or B-spline through handshake-recovered control points; SciPy's `scipy.interpolate.splprep`), pipe-model botany (Shinozaki 1964, Murray's law — for Phase 4 radius accumulation AND for taper-projected tip extrapolation, two co-determined views of the same biological relationship), forestry literature (species-specific morphology + allometric equations for hand-encoding initial priors). Reach for whichever the apparatus needs. **NOT a tool here:** 3D Hessian ridge-following / vessel-tracing-style scalar-field extraction — the restructure removed it; see Non-goals.

---

## Standing requirements

1. **Name yourself in publish notes.** First line of every commit body + status update.
2. **Surface scope drift** per `[[feedback_baby_must_surface_scope_drift]]`.
3. **Mandatory reads at session start:**
   - The Preamble + Posture sections above
   - The "What's new in rev. 2" section below — explains why rev. 1's work survives as a baseline comparison artifact rather than a foundation
   - `arborist/NOTES.md` 2026-05-19 evening + 2026-05-20 entries (esp. Project: Li'l Vera + the rev. 2 pivot note)
   - `arborist/lil_vera.py` (Tycho's rev. 1 implementation — **read for context only, DO NOT import or modify.** Rev. 2 builds a fresh module to preserve architectural coherence. Tycho's commits stand as baseline comparison artifacts; rev. 2 publishes its own 6th alignment-oracle layer alongside Tycho's 5th.)
   - `arborist/bidirectional_skeleton.py` (Hawthorn's Phase N.1 prior art; do not modify)
   - `arborist/lidar_extract.py` (QSM baseline, untouched)
4. **Stop at every stage boundary.** Status report → operator visual validation in /arborist alignment oracle → operator dispatches next stage.
5. **Working tree is dirty** with operator's unrelated in-flight work + the coordinator's LidarWorkstage layout fix (32+/22- on `src/arborist/LidarWorkstage.jsx`, see Tycho's prior scope-drift notes). Continue the selective-commit dance per Tycho's pattern in `604dfed` / `de00a30` / `0d9102d` — checkout HEAD → re-apply edits → stage → restore.
6. **Determinism.** Same specimen + same seed + same hyperparameters → byte-identical output JSON.
7. **Performance.** Per-rig + per-orientation + per-voxel processing is embarrassingly parallel. Use numpy vectorization or multiprocessing so 500-rig overnight runs scale ≤ linearly with core count.
8. **Operational mode — standalone CLI app + disk-persistent results.** Primary interface is CLI (`python arborist/lil_vera_v2.py --treeId=... --species=acer_saccharum --N=... --out=...`). Note `--species` is now a required arg — the apparatus is conditioned on species identity from the start. HTTP endpoint is quick-iteration convenience. Result JSON persists to `arborist/state/lil-vera-v2/<treeId>/run-<ISO-timestamp>-N<N>.json` (note v2-suffixed directory so v1 and v2 runs coexist for comparison). Result JSON includes: full **parametric spline output** (see Output specification below), hyperparameters, species identity + priors-file hash, per-pass diagnostics (working-set size curve, lock-in count, rejection count broken down by source [tomography vs botanical-prior vs both], deferred count, classification histograms vs species expected distribution), source-3D-validation residuals.
9. **Operator-tunable thresholds in the workstage UI.** Lock-in confidence threshold, rejection confidence threshold (for noise/sheet/leaf), glimpse-threshold for reach probes, max iteration passes (default 20 — see Inputs), species-prior softness scaling (0 = ignore priors, 1 = hard priors, default 1). All exposed as sliders in the v2 tuner sub-section. Operator can dial during the visual gate.
10. **CLI heartbeat (operator-readable progress signal).** Long runs (multi-pass × N=500+ × step-by-step axonal growth) may take 1–2 hours. The CLI MUST print a heartbeat line on stdout at every batch boundary (every time Phase 1 adds N_batch rigs OR every time Phase 3b completes a step-loop iteration) AND at minimum every 30 seconds even mid-batch. Format example: `[pass 2 | scan-batch 4 | rigs 350/2000 | |P|=8123 | splines=42 (new handshakes this batch: 18) | elapsed 14m32s]`. Glance-readable from a `tail -f` in another terminal so the operator can distinguish "still working" from "hung" without instrumenting anything else. (Operator runs `caffeinate` for the duration; the heartbeat is the only signal that the process hasn't silently wedged.) Output file size is negligible (~100–500 KB worst case) so logging volume is not a concern.

---

## What's new in rev. 2 (load-bearing context)

Rev. 1 (Tycho's `604dfed` / `de00a30` / `0d9102d`) produced a working apparatus base + tomography classification + heat layer + a ridge tracer. But rev. 1's brief was missing the iteration-with-elimination architecture that the operator and coordinator extensively discussed during design, and the species-conditioned prior framing only crystallized in conversation after rev. 1 shipped. Specifically rev. 1 was missing:

- ✗ The **working set never shrank**. M_obs accumulated monotonically (correct) but rasterizer always rendered P₀; rejected leaves still contributed pixels every pass.
- ✗ No three-outcome (locked-in / rejected / deferred) classification per pass.
- ✗ No confident rejection of leaf mass, sheet artifacts, or scan noise; tomography "sheet artifact" classification existed but had no behavioral consequence.
- ✗ **No species-conditioned prior** to discriminate "geometrically-plausible-but-botanically-impossible" candidates (leaf mass at impossible structural positions misclassified as junction; 63% junction rate at N=500 vs botanical ~8%).
- ✗ Produced dense voxel-node graphs (40K nodes, 132K cylinders for one tree) rather than sparse parametric splines (target: 100–500 splines per tree, for use as procedural-generator training data downstream).

**Rev. 2's first draft fixed those five gaps by:** (1) adding the iteration loop with three-outcome elimination + masked rasterization as the structural primitive (gaps 1+2+3); (2) introducing the species-conditioned botanical-priors file as a third inference channel that fundamentally conditions classification (input, not validation) (gap 4); (3) specifying parametric splines as the output shape (gap 5); (4) elevating neuronal mutual recognition to a load-bearing primitive (vs ridge tracing alone or MST closure shortcut). All five gaps addressed via four mechanisms.

**Then the 2026-05-20 evening pre-dispatch restructure surfaced two more gaps that the first draft still carried over from rev. 1's geometric-first DNA:**

- ✗ **Ridge tracing as the primary structure-extractor commits classifications too eagerly.** Hessian eigenvector ridge-following on a smoothed memory field will trace through any density ridge — including dense leaf-mass canopy interiors — and lock in those traces as splines before the elimination pass has a chance to clear the field. The structural primitive has to *defer* commitment until anchor evidence is overwhelming, not race to extract.
- ✗ **A fixed-N scan and a one-shot cone reach both treat "enough observation" as a hyperparameter rather than a measured property of the data.** A real measurement apparatus scans *until the residual is explained*; a real synapse-forming neuron *grows* its axon stepwise toward a partner, re-aiming as it goes.

**The restructure addresses these by:** (5) **removing ridge tracing entirely** and elevating neuronal mutual recognition from "connectivity-completer for ridge fragments" to **primary structure-builder**; (6) **anchoring extraction on two high-precision sources** — RANSAC trunk (already specified) plus a new precision-gated tip detector (geometric long-pointy-shape test AND species-prior tip-class consistency); (7) **replacing fixed-N scan with adaptive batched scanning** terminated by a *verdict-rate* stopping criterion (scan until the apparatus's per-batch new-lock-ins + new-rejections fall below threshold — i.e., until more observation stops changing its mind); (8) **replacing one-shot cone reach with step-by-step axonal growth** — each probe step confirms a glimpse exists, blends its local direction with species curvature priors, advances, and only handshakes when two opposing-anchor probes meet AND agree on direction.

Net: seven gaps → eight mechanisms. The three named load-bearing primitives (iteration + elimination, species priors, neuronal mutual recognition) are unchanged in identity; the neuronal one is now structurally larger because it owns extraction, not just connectivity.

**Rev. 2 is a fresh build in a new module — `arborist/lil_vera_v2.py`.** The architecture is woven throughout (iteration loop touches Phase 1 rasterization, Phase 2 classification, Phase 3 extraction, Phase 4 elimination, Phase 5 radii, output emission); surgical retrofit was not a coherent path. Tycho's rev. 1 commits stand as **baseline comparison artifacts**:

- Rev. 1's 5th alignment-oracle layer (cyan-magenta) becomes "Li'l Vera v1 (baseline)" alongside QSM and Hawthorn's Bidirectional.
- Rev. 2 publishes a **6th alignment-oracle layer** (orange-gold / deep-teal) for direct visual comparison.
- The v2 baby reads `lil_vera.py` for context (and the tomography primitive logic is a useful starting point for v2's own re-implementation), but DOES NOT import from it. Coherent single-module rebuild.

What gets read for context (mandatory reads) but not imported:
- `arborist/lil_vera.py` apparatus base, tomography primitives, output structure — useful reference; v2 builds its own version.
- `arborist/bidirectional_skeleton.py` — Hawthorn's prior art; baseline layer.
- `arborist/lidar_extract.py` — QSM baseline; load_pointcloud is referenced but the cylinder graph extraction is baseline-only.

What stays unchanged in the codebase:
- `arborist/serve.js` v1 endpoints (`/lidar/specimen/:treeId/lil-vera-extract`, `/lidar/specimen/:treeId/lil-vera-runs`, `/lidar/specimen/:treeId/lil-vera-run/:filename`) — Tycho's. v2 adds parallel routes at `/lidar/specimen/:treeId/lil-vera-v2-extract` (+ matching `-v2-runs` and `-v2-run/:filename`); see Files section for canonical path forms.
- `src/arborist/LidarWorkstage.jsx` v1 5th layer + tuner sub-section + heat layer — Tycho's. v2 adds a 6th layer + its own tuner sub-section alongside.
- All the rev. 1 commits' visualization infrastructure (frame conventions, alignment oracle, Saved Runs picker pattern) is the design language v2 builds in.

What gets newly authored:
- `arborist/lil_vera_v2.py` — entire module (apparatus base + iteration loop + classification + extraction + spline fitting + output, all coherent).
- `arborist/state/<species>/botanical-priors.json` — hand-encoded for Sugar Maple for Cycle 1; Cycle 2+ statistical refinement.
- `arborist/serve.js` v2 endpoints (3 of them, full canonical mount paths): `/lidar/specimen/:treeId/lil-vera-v2-extract` (POST), `/lidar/specimen/:treeId/lil-vera-v2-runs` (GET), `/lidar/specimen/:treeId/lil-vera-v2-run/:filename` (GET) — same pattern as v1, all tolerating `?t=` cache-buster.
- `src/arborist/LidarWorkstage.jsx` 6th layer + `SplineSkeleton` component (THREE.TubeGeometry from Catmull-Rom) + v2 tuner sub-section + per-pass diagnostics panel.

---

## Algorithm — invariants only

### Inputs

- Point cloud P₀ (source frame; pulled via `lidar_extract.py`'s `load_pointcloud`)
- **Species identity** (required, e.g., `acer_saccharum`) — conditions every classification decision
- **Species priors file** at `arborist/state/<species>/botanical-priors.json` (see "Species priors file specification" section below)
- Hyperparameters (grouped):

  **Observation:** K_orient (tomography sample count, default 200), pitch ratio (spiral geometry).

  **Adaptive scan:** N_batch (rigs added per scan iteration, default 50), N_max (hard safety cap on total rigs, default 2000; hitting it is a "did-not-converge" diagnostic, not a routine outcome), **verdict-rate stopping**: `verdict_rate_threshold` (default 0.005 = 0.5%) — the scan loop terminates when the last batch's `(new_lock_ins + new_rejections) / N_batch_candidates_attributed` falls below this threshold; i.e., the apparatus stops scanning when adding rigs stops materially changing its verdicts. `min_batches_before_stop` (default 2 — require at least two batches before allowing termination, so the apparatus can't stop on a pathologically-quiet first batch). No cluster detector; no geometric long-pointy-shape proxy. (Earlier drafts specified a cluster detector — it suffered from M_obs ghost effects: monotonically-accumulating M_obs preserves the visual signature of already-rejected leaf clusters indefinitely, making the detector demand more scanning forever. Verdict-rate is a direct measurement of "is more observation changing anything?" — cleaner and ghost-free.)

  **Tip-precision detector:** `tip_geometric_min` (minimum `c.geometric_confidence` for the candidate to enter the tip pipeline at all; default 0.5 — tomography must be confident in its 'tip' verdict before geometric tests are even attempted), `min_nbhd_count` (minimum candidate-count in the local-PCA spherical neighborhood; default 8 — fewer points than this gives an unreliable PCA), `tip_elongation_min` (local-PCA λ1/λ2 in a spherical neighborhood; default ~5.0 — tips are decidedly elongated), `tip_taper_sign` (must be negative — radius monotonically shrinks toward the candidate; flat or growing rules out tip), `tip_neighborhood_radius` (PCA window, default ~0.15m), `τ_tip_prior` (minimum `priors.likelihood(class='tip', ...)` for the tip to anchor; default 0.5 — half-prior or better). Anchor admission is conjunction of all six gates (geometric_confidence + nbhd-count + elongation + taper sign + neighborhood radius window + priors). Two-of-six being optional or lax breaks the precision premise of N.3.0's "stop-the-cycle" tip gate; keep all six strict.

  **Axonal growth:** `step_length` (probe advance per step, default ~0.05m — fine enough to follow real branch curvature), `probe_max_steps` (per-probe cap before stalling, default 200 — bounds runaway growth), `glimpse_threshold` (minimum M_obs ahead of probe tip to count as a confirmed glimpse), `cone_half_angle` (forward search cone half-angle at each step, default ~20° — tight, since priors are steering), `curvature_prior_blend` (weight ∈ [0,1] for blending last-segment direction vs species-priors expected local direction at this height; default 0.5), `handshake_distance` (probes within this Euclidean distance are candidates for handshake; default 2 × step_length), `directional_agreement_threshold` (cos-angle between A's forward direction and -B's forward direction must exceed this for handshake; default 0.7 ≈ 45°). Handshake requires BOTH proximity AND directional agreement.

  **Elimination:** ε_lock (point-to-confirmed-trunk↔tip-path distance for Phase 4 lock-in), **ε_attribution** (point-to-candidate distance for the Phase 4 attribution step — bridges candidate-derived classifier scalars to source points; suggested default ~0.05m, sized to typical inter-candidate spacing — adjust empirically if "deferred-for-no-candidate" count is high (too small) or rejection is over-eager (too large)), ε_prior (per-candidate `prior_likelihood` cutoff below which the candidate is hard-rejected; also gates whether a glimpse counts during axonal growth), rejection thresholds (sheet-classification confidence cutoff, flat-distribution cutoff, prior-violation confidence cutoff), K_rigs_min (minimum `rigs_seen` observational confidence before a point can be marked rejected; default ~5 — prevents over-eager rejection of points seen by too few rigs).

  **Loop control:** termination criterion (ε_residual = fraction of P₀ remaining below threshold OR no-progress passes), **max_passes (safety-cap default 20** — well above the expected ~10-pass convergence so the algorithm reaches "stable residual" or "working set exhausted" naturally rather than tripping the cap as a routine outcome), --seed (RNG seed for determinism — RANSAC + any stochastic probe initializations derive from this).

  **REMOVED from rev. 2 draft:** Hessian ridge thresholds + ridge-trace seed config. Ridge tracing is gone; the reacher does extraction.

### Rig — 3 cameras at 120° (unchanged from rev. 1)

Each rig captures three cameras at 120° around its vertical axis, looking inward. Properties by construction: complete silhouette coverage per rig; universal within-rig stereo; triple-consensus per rig.

### Spiral — adaptive scan, no fixed N

Spiral around the tree's vertical symmetry axis with pitch ratio as the spatial-distribution knob. **Total rig count is NOT fixed in advance** — it's whatever the adaptive-scan loop in Phase 1 below determines is needed for the apparatus's verdicts to stabilize (per-batch new-lock-ins + new-rejections fall below `verdict_rate_threshold`). Operational guidance: development runs typically converge at N ≈ 50–150; production runs at N ≈ 300–800; complex specimens may legitimately need more. Hard safety cap N_max=2000. The spiral generator is deterministic from `--seed` so adding a batch of N_batch rigs always extends the same sequence — no re-randomization mid-run.

### THE structural primitive — iteration loop with working-set subtraction

```
Initialize:
  P ← indices into P₀ (the working set — all source points start uncertain)
  splines ← []  (parametric output, monotonically grows)
  M_obs ← empty 3D field  (observational memory; passive evidence; pure)
  M_interp ← empty 3D field  (interpretation memory; extraction commitments)
  priors ← load(arborist/state/<species>/botanical-priors.json)
                (FAIL-FAST schema validation at load time: required keys present,
                 sample arrays non-empty, numerical fields within plausible
                 ranges. If validation fails: print error, exit non-zero. Silent
                 degradation to "softnessScaling=0 ignore-priors mode" would
                 mask the bug and break acceptance criterion 8 — refuse to run.)
  ground ← min y of P₀ (bottom of source cloud bbox)
  tree_height ← (max y of P₀) - ground
                (Posture-B carve-out (b): bbox scalars, not per-point labels.)
  trunk_axis ← RANSAC vertical fit through densest Z-column of P₀
                (Posture-B carve-out (c): single 3D line scalar (origin +
                 direction). RANSAC SEEDED from --seed CLI arg for determinism
                 per Std. Req. #6. SANITY CHECK: if trunk_axis verticality angle
                 from world-up > 15°, surface diagnostic + halt — tilted /
                 multi-stem / mis-classified-axis specimens silently miscalibrate
                 every prior query downstream. Better to halt early than to
                 produce a quiet wrong skeleton.)
  pass_count ← 0
  N_scanned ← 0
  rig_seed_cursor ← 0  # deterministic position in the spiral sequence

Loop until terminated:
  pass_count += 1
  pts_active ← P₀[P]  # the masked source cloud — ONLY uncertain points

  # ── Phase 1: ADAPTIVE SCAN — add rigs until verdicts stabilize ──
  #
  # No fixed N. No cluster detector. The scan extends in batches of N_batch
  # rigs and stops when the apparatus's verdicts stabilize: a fresh batch
  # of rigs produces near-zero new lock-ins AND near-zero new rejections,
  # so adding more rigs is not changing the apparatus's mind. Safety cap
  # at N_max (a meaningful failure signal — never routine).
  #
  # Why verdict-rate instead of a geometric cluster detector: M_obs
  # accumulates monotonically (hallucination safeguard), so an earlier
  # leaf-cluster's deposit ghost persists in M_obs even after its source
  # points were rejected. A geometric cluster detector would keep
  # demanding more scanning forever to "explain" that ghost. Verdict-rate
  # measures the apparatus's behavior directly — has more observation
  # changed any verdict? — and is ghost-free.
  #
  batches_in_pass ← 0
  prior_batch_verdict_count ← infinity  # forces at least one batch
  Scan-loop:
    Generate next N_batch spiral rig positions starting from rig_seed_cursor.
    For each new rig r:
      Render pts_active from r's 3 cameras (silhouette + medial via skimage).
      Within-rig stereo correspondence: triangulate to 3D candidates.
      Deposit into M_obs at candidate positions (silhouette_count,
      medial_count, body_count, rigs_seen).
      (Crucially: rejected leaves from prior passes are GONE from pts_active
       and do not contribute medial-axis pixels in this pass's renders.)
    N_scanned += N_batch
    rig_seed_cursor += N_batch
    batches_in_pass += 1

    # ── Verdict-rate check ──
    # Classify the newly-deposited candidates (lightweight Phase 2: tomography
    # + priors per new candidate; SAME formulas as full Phase 2 below). Then
    # do a lightweight Phase 4 attribution-only pass over the working set P:
    # for each source point p, find its nearest candidate within ε_attribution
    # (may now be a brand-new candidate from this batch), and check whether
    # p's would-be verdict has CHANGED since the prior batch's check:
    #   - WAS DEFERRED, NOW would lock-in against any spline ∈ accumulated
    #     splines (prior-pass output) → counts as a new lock-in.
    #   - WAS DEFERRED, NOW would reject (combined_confidence drop AND
    #     rigs_seen ≥ K_rigs_min) → counts as a new rejection.
    #   - VERDICT UNCHANGED (still deferred, or still locked-in, or still
    #     rejected) → does not contribute to verdict-rate.
    # This is a "would" check — the actual Phase 4 commitment still happens
    # later in this pass, after Phase 3 produces new splines. We're measuring
    # the apparatus's *willingness* to change its mind based on more rigs.
    batch_verdict_count ← (new_would-be_lock_ins + new_would-be_rejections)
    batch_verdict_rate ← batch_verdict_count / max(|attributed_candidates|, 1)

    If batches_in_pass >= min_batches_before_stop AND
       batch_verdict_rate < verdict_rate_threshold:
      break  # scan-complete: verdicts have stabilized.
    If N_scanned >= N_max:
      break with DID-NOT-CONVERGE diagnostic.
    prior_batch_verdict_count ← batch_verdict_count
    (Otherwise loop and add another N_batch rigs.)

  # ── Phase 2: SPECIES-CONDITIONED CLASSIFY candidates (TAG, don't commit) ──
  #
  # Classification is deferred-commitment: candidates get tagged with
  # geometric_class + combined_confidence; the tags are CONSUMED later by
  # (a) the tip detector in Phase 3a, (b) axonal growth glimpse checks in
  # Phase 3b, (c) elimination in Phase 4. No tag is acted on here.
  #
  For each candidate c (within ε of a point in pts_active):
    Orientation tomography: sample K_orient directions, compute channel scores.
    geometric_class ← classify by tomography distribution shape:
      Sharp unimodal peak       → candidate-linear-interior (peak dir = axis)
      Bimodal / multimodal      → candidate-junction
      Unimodal one-sided        → candidate-tip
      Flat                      → candidate-noise
      Distributed on great circle → candidate-sheet
    geometric_confidence ← measure of how cleanly the distribution shape
      fits the class (e.g., normalized peak sharpness for unimodal classes;
      top2_ratio for bimodal/multimodal; inverse-variance for flat).
      ∈ [0, 1]. Exact formula is implementation choice as long as
      deterministic + monotonic in classification quality.
    height_frac ← (c.y - ground) / tree_height
    radial_dist ← distance from c to trunk_axis
    inferred_radius ← perpendicular spread of M_obs around c
    prior_likelihood ← priors.likelihood(geometric_class, height_frac,
                                          radial_dist, inferred_radius,
                                          local_axis=peak_direction)
      # ∈ [0, 1]: 1 = perfectly consistent with species at this position;
      # 0 = botanically impossible; soft values for unlikely-but-possible.
      # EXAMPLE: Sugar Maple at height_frac=0.5, radial_dist=4m,
      # inferred_radius=1.5m → likelihood ≈ 0 (no thick branch 4m radially-
      # out at mid-height; it's a leaf cluster, not skeleton).
    c.classification ← geometric_class
    c.prior_likelihood ← prior_likelihood
    c.combined_confidence ← geometric_confidence × prior_likelihood
    c.local_axis ← peak direction from tomography (used by Phase 3b for
                   probe direction seeding).

  # ── Phase 3: EXTRACT STRUCTURE via anchored axonal growth ──
  #
  # NOT ridge tracing. NOT seed-and-grow from any density peak. The
  # extraction primitive is: identify two high-precision anchor sets
  # (trunk + tips), then GROW axons from anchors until they handshake
  # with each other. Everything in between is built, not traced.
  #

  # 3a: PRECISION-GATED TIP DETECTION
  #
  # Branch tips are the only feature class besides the trunk that can
  # be identified with high confidence from local geometry + priors
  # alone. Anchor admission requires conjunction of four tests; this
  # is deliberately conservative — false-positive tips at leaf-cluster
  # positions would poison axonal growth.
  #
  tip_anchors ← []
  For each candidate c with c.classification == 'tip':
    If c.geometric_confidence < tip_geometric_min: skip.
    # Local-PCA in tip_neighborhood_radius spherical window around c:
    nbhd ← candidates within tip_neighborhood_radius of c
    If |nbhd| < min_nbhd_count: skip.  # not enough local evidence
    Run PCA on nbhd positions → λ1, λ2, λ3 (descending).
    elongation ← λ1 / max(λ2, ε)
    If elongation < tip_elongation_min: skip.  # not long enough
    # Taper-sign check: M_obs spread along λ1 axis, sampled at several
    # arc-length offsets, must decrease monotonically toward c.
    taper_slope ← linear_fit(M_obs_perp_spread, arclength_from_c)
    If taper_slope >= 0: skip.  # flat or thickening → not a tip
    # Priors gate:
    If priors.likelihood(class='tip', height_frac, radial_dist,
                          inferred_radius, local_axis=λ1) < τ_tip_prior:
      skip.  # botanically implausible tip
    # All four gates pass → admit as tip anchor.
    tip_anchors.append({position: c, direction: -λ1 toward trunk,
                        observed_radius: inferred_radius})

  # 3a-cold-start: if pass 1 finds zero tip anchors (leaf-saturated specimen),
  # that is acceptable. Phase 4 may still produce rejections via Phase 2's
  # tags; the working set shrinks; tips emerge in later passes once leaves
  # clear. Empty Phase 3a in any pass is NOT a bug as long as Phase 4
  # makes progress (lock-ins or rejections). The loop terminates on
  # "no new progress" — silence on extraction + silence on elimination
  # = converged.

  # 3b: BIDIRECTIONAL AXONAL GROWTH from trunk + tip anchors
  #     ── THE load-bearing extraction primitive ──
  #
  # Anchor set A = trunk endpoints (top and bottom of the trunk_axis line
  # within tree_height, with direction = trunk_axis direction) ∪
  # tip_anchors (with direction toward trunk) ∪ prior-pass locked-in
  # spline endpoints (with their last-segment direction).
  #
  # Every anchor spawns growing probes in BOTH mother-direction (away
  # from canopy, toward trunk for tips; downward for trunk-top; etc.)
  # AND child-direction(s) (multiple if at a branching position;
  # initially one, but can spawn additional children at branch
  # detection events during growth).
  #
  # Probes grow STEP BY STEP — not one-shot cones. At each step they
  # confirm a glimpse exists ahead, re-derive their local direction
  # from observation + species curvature priors, and advance.
  #
  active_probes ← []
  For each anchor a ∈ A:
    For each direction d ∈ {a.mother_direction, *a.child_directions}:
      active_probes.append(Probe(origin=a.position, direction=d,
                                  trail=[a.position], stalled=False,
                                  steps_taken=0, parent_anchor=a))

  Step-loop (until all probes stalled, connected, or step-cap hit):
    For each probe p in active_probes (not stalled, not connected):
      # Forward search cone at p's tip:
      search_pos ← p.tip + p.direction × step_length
      glimpses ← candidates within cone(search_pos, p.direction,
                                         cone_half_angle, step_length)
                  filtered by (M_obs > glimpse_threshold AND
                               prior_likelihood > ε_prior AND
                               dot(c.local_axis, ±p.direction) > 0.5)
      # KNOWN-WEAK-SPOT: the local_axis dot-product gate uses tomography's
      # peak direction, which is unreliable for multimodal-junction and
      # degraded-one-sided-tip candidates. Genuine branch-bifurcation
      # glimpses near junctions may be wrongly filtered here. Tracked as
      # a Bessel audit Important (deferred to baby per operator call):
      # SURFACE if it bites at N.3.2 — symptoms would be probes stalling
      # near visible-but-non-handshaking branch joints, or low
      # branch-detection event count in per-pass diagnostics. Fix path
      # if surfaced: relax this filter for non-linear-interior classes
      # (junction / tip) or expose as a per-class operator knob. Do NOT
      # silently retune the threshold at dispatch time.
      If glimpses is empty:
        p.stalled ← True
        Continue.
      # Advance to weighted centroid of glimpses:
      next_tip ← M_obs-weighted centroid of glimpses
      # Re-derive local direction by blending observation + curvature prior:
      obs_direction ← normalize(next_tip - p.tip)
      prior_direction ← priors.expected_local_direction(
                          height_frac, radial_dist, current_direction=p.direction)
        # priors.expected_local_direction returns the species's expected
        # tangent at this tree-frame position (e.g., Sugar Maple scaffolds
        # bend toward vertical near trunk, more horizontal in outer canopy).
        # See botanical-priors.json schema below.
      p.direction ← normalize(
                      curvature_prior_blend × prior_direction +
                      (1 - curvature_prior_blend) × obs_direction)
      p.trail.append(next_tip)
      p.steps_taken += 1
      Deposit absorption_count into M_interp at next_tip. (M_obs NEVER
      modified by growth — observational evidence stays pure; extraction
      commitments accumulate separately. Hallucination safeguard: an
      "absorbed" glimpse doesn't artificially boost its observational
      confidence on subsequent passes.)
      # Branch detection at this step:
      If glimpses partition into >1 spatially-distinct sub-cluster:
        For each additional sub-cluster s:
          spawn new probe from next_tip in direction(s) → active_probes.

      If p.steps_taken >= probe_max_steps:
        p.stalled ← True  # bounded — runaway growth flagged for diagnostics

    # ── Handshake check — every active probe pair ──
    For each (p_a, p_b) pair of non-connected active probes:
      If distance(p_a.tip, p_b.tip) < handshake_distance AND
         dot(p_a.direction, -p_b.direction) > directional_agreement_threshold:
        # MUTUAL RECOGNITION — probes are advancing toward each other,
        # both ends independently signal directional agreement. Symmetric.
        new_chain ← concat(p_a.trail, reversed(p_b.trail))
        new_chains.append(new_chain)
        p_a.connected ← p_b.connected ← True

    If all probes stalled or connected: break Step-loop.

  # Note: a probe that stalls without handshaking represents a partial
  # observation — the apparatus reached into low-evidence territory and
  # found no continuation OR no partner. These partial trails are NOT
  # committed to splines. They are surfaced as per-pass diagnostics
  # (`stalled_probe_count`) so the operator can watch for systematic
  # failure modes (e.g., glimpse_threshold too high → all probes stall;
  # cone_half_angle too narrow → probes miss real continuations).

  # 3c: TAPER EXTRAPOLATION — fallback for unconnected tip anchors
  #
  # A tip anchor whose probes all stalled without handshaking remains
  # disconnected. Taper-projection extrapolates a short distal segment
  # from the tip toward the trunk based on observed local taper, so
  # the unconnected anchor still contributes a tagged-as-uncertain
  # spline tail to the output. This is DEGRADED-MODE recovery, not
  # primary extraction.
  #
  For each tip_anchor t with no successful handshake:
    Estimate observed taper rate τ from M_obs perpendicular spread along
    the partial probe trail (use the longest stalled probe from t).
    If τ consistent: append a short taper-projected segment to t's trail
      (arc-length r/τ beyond last observed point, along t's last direction).
      Mark `tipExtrapolated: true` on the resulting endpoint.
    If τ inconsistent: leave t as a bare anchor; defer to next pass's
      growth attempt (more rigs may give it a partner).
    NOTE: Phase 5's pipe-model radius accumulation and Phase 3c's
    taper-projection are TWO VIEWS of the same Murray's-law relationship.
    They must agree per spline endpoint at validation time; disagreement
    is a diagnostic to surface, not silently commit.

  # Spline fitting
  #
  # new_chains contains both handshake-formed chains (Phase 3b) and
  # taper-extended chains (Phase 3c). Dedup by proximity. Fit splines.
  #
  new_chains ← dedup_by_proximity(new_chains)
  new_splines ← fit parametric splines through new_chains
                (Catmull-Rom or scipy.interpolate.splprep; 3-10 control
                 points per spline based on arc-length / curvature).
  For each new spline s:
    Compute s.prior_likelihood = mean(priors.likelihood at each control point
                                       given inferred radius + position).
    s.from_handshake ← (s was produced by a Phase 3b handshake)
    s.from_taper_only ← (s was produced solely from a Phase 3c extrapolation)
    Splines whose control points fall in low-prior regions, OR whose taper
    doesn't match priors at their height range, score lower. Low-likelihood
    splines stay in "candidate" status; don't lock-in until prior agrees.

  # ── Phase 4: THREE-OUTCOME ELIMINATION (Rubin subtraction) ──
  #
  # Attribution bridge — Phase 2 computes classifier scalars per CANDIDATE
  # (stereo-recovered 3D positions); Phase 4 needs them per SOURCE POINT.
  # The bridge is explicit nearest-candidate inheritance: for each source
  # point p ∈ P, find the candidate c nearest p within ε_attribution radius
  # in 3D space. If found: attribute (p.classification, p.combined_confidence,
  # p.prior_likelihood, p.rigs_seen) ← (c.classification, c.combined_confidence,
  # c.prior_likelihood, c.rigs_seen). If no candidate within ε_attribution:
  # mark p as INVISIBLE-THIS-PASS — too far from any stereo-recovered
  # observation to classify confidently → p stays DEFERRED. The attribution
  # uses the candidate's spatial position to look up its scalars; the source
  # point's 3D position is only consulted as a kNN-style spatial query for
  # mask preparation, never as a label feeding inference (Posture-B carve-
  # out (d)).
  #
  For each point p ∈ P:
    Attribution: find nearest candidate c within ε_attribution radius of p.
    If no candidate within ε: MARK DEFERRED (no observation this pass).
    Else inherit: p.classification, p.combined_confidence, p.prior_likelihood,
                  p.rigs_seen ← c's values.

    If p lies within ε_lock of any spline s ∈ (splines ∪ new_splines) with
       s.from_handshake AND s.prior_likelihood > lock_in_threshold:
      MARK LOCKED-IN  → remove p from P. Spline s persists in output.
      # Check accumulated `splines` (prior-pass lock-ins) AND `new_splines`
      # (this pass's growth output): a deferred point whose attribution
      # this pass moves it within ε_lock of a previously-committed spline
      # must lock in now, not wait for that spline to be re-emitted (which
      # it never will be). Only `from_handshake` splines lock in;
      # `from_taper_only` degraded-fallback splines do NOT lock in by
      # default (their evidence is weaker — observation may yet refine).
    Elif p.combined_confidence < rejection_threshold (geometric AND prior
         BOTH agree this isn't Sugar-Maple-structure here) AND
         p.rigs_seen ≥ K_rigs_min (enough observational evidence to commit):
      MARK REJECTED  → remove p from P. Track in diagnostics whether
                       tomography drove the rejection, the prior drove it,
                       or both did. (This is the leaf-discriminator path:
                       leaf-mass candidates at impossible-for-skeleton
                       positions get rejected here.)
    Elif p.classification ∈ {noise, sheet} with high geometric confidence
         AND p.rigs_seen ≥ K_rigs_min:
      MARK REJECTED  → remove p from P.
    Else:
      MARK DEFERRED  → keep p in P for next pass.

  splines ← splines ∪ {s ∈ new_splines : s.prior_likelihood > lock_in_threshold}

  # ── Termination ──
  If |P| == 0:
    Terminated (working set fully exhausted; every source point is either
                locked-in or rejected).
  Elif (no new lock-ins this pass) AND (no new rejections):
    Terminated (stable residual — apparatus has nothing more to say).
  Elif |P| / |P₀| < ε_residual:
    Terminated (working set exhausted below threshold).
  Elif pass_count >= max_passes (default 20; expected convergence ~10):
    Terminated (safety cap; flag as "did not converge"; surface in
                diagnostics so operator can investigate threshold tuning.
                Hitting the cap is a meaningful failure signal — the
                acceptance criteria require "stable residual" or "working
                set exhausted" termination, not cap-hit.).

return splines  # parametric centerlines, ready for Phase 5 radius pass
```

### Phase 5 — pipe-model radius accumulation + parent-direction assignment (operates on splines)

After the loop terminates, splines is the sparse parametric skeleton (target: ~hundreds, never tens of thousands; see acceptance for guidance). Phase 5 operates on this graph:

- **Parent-direction assignment** (writes the spline graph's `parentSplineId` + `parentAttachT` fields): mutual recognition in Phase 3b produces symmetric edges (a, b) with no inherent direction. Phase 5 traverses from the trunk-base spline outward via BFS (or any tree-rooting traversal), assigning each non-root spline a parent + parametric attach position on its parent. Edges become directed parent→child. The trunk-base spline has `parentSplineId=null`.
- **Multi-component handling.** If mutual recognition fails to connect every spline (possible at aggressive rejection thresholds or low N), BFS from trunk reaches only one component. **Disconnected splines are flagged but NOT dropped.** They appear in output with `parentSplineId=null` AND `"orphan": true` so downstream consumers + the operator can see them; the orphan count is surfaced in `stats.orphanCount` per-pass diagnostic. **N.3.2 acceptance criterion 9 (`stats.orphanCount == 0`) is the formal connectivity gate** — if orphans remain at the cycle gate, that's a flag the apparatus didn't converge cleanly, not a silent commit. (Future cycles may attempt a one-shot reach-extension pass to reconnect orphans before output; Cycle 1 surfaces them honestly.)
- **Backward pass:** for each terminal-tip spline, trace its path through the now-directed graph back to the ground (trunk-base spline). Each tip = one "pipe."
- **Forward pass:** walk ground→tips. At each spline cross-section, count overlapping pipes. **Radius² ∝ pipe count.** Murray's law emerges; no heuristic radius function.
- **Output radius function per spline:** parametric — `radius(t) = baseRadius × (1 - t)^taperExponent` fit to the per-cross-section pipe counts, OR per-control-point radii if the curve doesn't fit cleanly.
- **Co-determination diagnostic:** per-spline radii from Phase 5 pipe-counting should agree (within tolerance) with Phase 3c's taper-projected tip predictions. They're two views of the same Murray's-law relationship. Disagreement is surfaced as a diagnostic and may flag a chain for re-extraction rather than silent commitment.

### Phase 6 — Rubin consensus-stability validation

Run the full apparatus 4× with randomly subsampled rig sets (drop K% of rigs per run, K ∈ {10, 25, 40}). Quantify stability under subsampling:
- Spline count variance
- Per-spline-endpoint position variance across runs
- Branching-topology agreement (do the same splines connect to the same parents?)
- Tip-set agreement

The Rubin test: dark matter doesn't vanish when one telescope goes offline.

---

## Species priors file specification

`arborist/state/<species>/botanical-priors.json` is the species-conditioned spatial-prior file consulted at every classification decision. For Cycle 1, hand-encoded for Sugar Maple from forestry references (Hallé & Oldeman 1970 architectural model; USDA growth tables; published DBH-height-age relationships). Cycle 2+ statistical aggregation refines these from real LiDAR specimens.

```json
{
  "speciesId": "acer_saccharum",
  "architectureMode": "rauh",                  // Hallé & Oldeman; strong-leader
  "matureHeightRange": [12.0, 35.0],           // meters; outside → impossible
  "dbhRange": [0.05, 1.00],                    // meters — TRUNK RADIUS at breast height (despite the conventional "DBH" name being diameter; the field is named for forestry recognition but values are radius for consistency with the rest of the priors schema. Botanically-literate readers: yes, this is intentional naming-vs-physics drift kept for grep-ability across forestry data sources.)
  "crownWHRatio": [0.5, 0.9],                  // width/height ratio of crown bbox
  "expectedRadiusByPosition": {
    // Position-dependent expected radius envelope.
    // Lookup: given (height_frac ∈ [0,1], radial_dist_from_axis_m),
    // returns {radiusMin, radiusMax, radiusModal}.
    // INTERPOLATION: Delaunay-triangulated linear interpolation via
    // scipy.interpolate.LinearNDInterpolator on the scattered (height_frac,
    // radial_dist) samples below. CLAMP IMPLEMENTATION (load-bearing —
    // LinearNDInterpolator natively returns NaN outside the convex hull,
    // not the nearest sample's value): wrap the linear interp with a
    // scipy.interpolate.NearestNDInterpolator fallback that fires when the
    // linear interp returns NaN. Pattern:
    //   linear = LinearNDInterpolator(samples, values)
    //   nearest = NearestNDInterpolator(samples, values)
    //   def lookup(query): v = linear(query); return nearest(query) if isnan(v) else v
    // Without the fallback, off-hull queries (common for early-pass leaf-mass
    // candidates at high height_frac × large radial_dist) propagate NaN into
    // combined_confidence and silently break rejection thresholds.
    "type": "piecewise2d-delaunay",
    "samples": [
      {"heightFrac": 0.0, "radialDist": 0.0,  "rMin": 0.15, "rMax": 0.50, "rMode": 0.30},
      {"heightFrac": 0.1, "radialDist": 0.0,  "rMin": 0.13, "rMax": 0.45, "rMode": 0.28},
      {"heightFrac": 0.3, "radialDist": 0.0,  "rMin": 0.10, "rMax": 0.35, "rMode": 0.22},
      {"heightFrac": 0.3, "radialDist": 2.0,  "rMin": 0.03, "rMax": 0.12, "rMode": 0.06},
      {"heightFrac": 0.5, "radialDist": 4.0,  "rMin": 0.005,"rMax": 0.04, "rMode": 0.015},
      {"heightFrac": 0.8, "radialDist": 3.0,  "rMin": 0.001,"rMax": 0.01, "rMode": 0.003},
      {"heightFrac": 1.0, "radialDist": 5.0,  "rMin": 0.0,  "rMax": 0.005,"rMode": 0.0}
      // ... ~12-20 samples covering position space; Delaunay-linear interpolated per spec above
    ]
  },
  "branchAngleDistribution": {
    "fromVertical": {"min": 25.0, "max": 75.0, "modal": 50.0, "stdDeg": 10.0}
    // Sugar Maple scaffolds emerge 30-70° from vertical; never horizontal.
  },
  "expectedLocalDirection": {
    // Position-dependent expected branch tangent — consumed by Phase 3b
    // axonal growth to steer the prior_direction component of each step.
    // Lookup: given (height_frac, radial_dist_from_axis, current_direction,
    // probe_position_world), returns a unit 3D vector — the species's
    // expected local tangent at that tree-frame position.
    //
    // RECONSTRUCTION (deterministic, no hidden geometry):
    //   1. Polar angle θ from vertical: interp angleFromVertical at the
    //      (heightFrac, radialDist) query via the same Delaunay+nearest-
    //      fallback pattern as expectedRadiusByPosition.
    //   2. Azimuthal direction: choose the **radial-outward azimuth** in
    //      the horizontal plane — the horizontal unit vector pointing from
    //      trunk_axis (projected to ground plane at probe_position's
    //      height) toward probe_position_world (also projected). This is
    //      well-defined for any probe not exactly on the trunk axis;
    //      species expectation is that Sugar Maple scaffolds flare radially
    //      outward, so radial-outward is the right azimuthal prior.
    //   3. NEAR-AXIS FALLBACK: when the probe is within `radialDist <
    //      axialFallbackRadius` (default 0.05m — basically on the trunk
    //      axis), radial azimuth is undefined. In that regime,
    //      prior_direction collapses to a pure polar steer (vertical, with
    //      polar angle θ from vertical) and the azimuth is inherited from
    //      `current_direction`'s horizontal component. Document that this
    //      regime produces a single-degree-of-freedom prior; the
    //      observation component of Phase 3b's blend supplies the
    //      remaining freedom.
    //   4. Construct: tangent = (sin θ · cos φ_radial,
    //                            cos θ,
    //                            sin θ · sin φ_radial)
    //      where φ_radial is the radial-outward azimuth from step 2 (or
    //      the inherited azimuth in the near-axis case).
    //
    // Sugar Maple's strong-leader topology: near the trunk axis branches
    // lean toward vertical (small θ); outer canopy, branches flare outward
    // and gradually horizontal (large θ, but never past 80°).
    "type": "piecewise2d-delaunay",  // same interp scheme as expectedRadiusByPosition
    "axialFallbackRadius": 0.05,     // meters; near-axis azimuth fallback (see RECONSTRUCTION step 3)
    "samples": [
      {"heightFrac": 0.0, "radialDist": 0.0,  "angleFromVertical": 0.0,  "stdDeg": 5.0},
      {"heightFrac": 0.3, "radialDist": 0.0,  "angleFromVertical": 5.0,  "stdDeg": 8.0},
      {"heightFrac": 0.5, "radialDist": 1.0,  "angleFromVertical": 35.0, "stdDeg": 12.0},
      {"heightFrac": 0.5, "radialDist": 3.0,  "angleFromVertical": 60.0, "stdDeg": 15.0},
      {"heightFrac": 0.8, "radialDist": 2.0,  "angleFromVertical": 55.0, "stdDeg": 15.0},
      {"heightFrac": 0.8, "radialDist": 4.0,  "angleFromVertical": 70.0, "stdDeg": 12.0}
      // ... ~10-15 samples; same Delaunay+nearest-fallback interp scheme as expectedRadiusByPosition
    ]
  },
  "murraysLawJointTolerance": 0.15,            // parent_r² vs Σ(child_r²) within ±15%
  "junctionMinBranchingDensity": 0.1,          // branches/m below this = no junction possible at this height
  "branchingDensityByHeight": {
    // Expected branches-per-meter at each height range
    "type": "piecewise1d",
    "samples": [
      {"heightFrac": 0.0, "branchesPerMeter": 0.0},
      {"heightFrac": 0.2, "branchesPerMeter": 0.5},
      {"heightFrac": 0.5, "branchesPerMeter": 3.0},
      {"heightFrac": 0.8, "branchesPerMeter": 8.0},
      {"heightFrac": 1.0, "branchesPerMeter": 12.0}
    ]
  },
  "expectedJunctionFraction": 0.08,            // ~8% of skeleton nodes are junctions
                                               // (calibration target for tomography
                                               // classifier; Tycho's rev. 1 had 63%
                                               // → classifier was misclassifying
                                               // leaf-mass as junction)
  "expectedTipFraction": 0.30,
  "expectedLinearInteriorFraction": 0.62,
  "hardRejections": {
    "radiusAboveAtHeight": [
      // Hard impossibility: thick branches at high positions
      {"heightFrac": 0.7, "radialDistAbove": 3.0, "radiusAbove": 0.05}
      // "If a candidate at height_frac > 0.7 and radial > 3m has radius > 5cm,
      //  it's botanically impossible for Sugar Maple — REJECT."
    ],
    "branchAngleSteeperThanDeg": 85.0          // No near-horizontal branches
  },
  "softnessScaling": 1.0                       // Operator-tunable: 0 = ignore priors,
                                               // 1 = hard priors (default).
}
```

**The likelihood function:**

```
priors.likelihood(geometric_class, height_frac, radial_dist,
                  inferred_radius, local_axis) → ∈ [0, 1]

  Define: gaussian_bell(x, mode, sigma) = exp(-0.5 × ((x - mode) / sigma)²)
          (peak-1 bell, smooth shoulders, no hard cuts. Returns 1.0 at
           x=mode, decays smoothly to 0 as |x - mode| grows. NEVER
           normalized PDF — always peak-1.)

  1. Lookup expected radius envelope at (height_frac, radial_dist) via
     Delaunay LinearNDInterpolator → {rMin, rMax, rMode}.
     If outside convex hull of priors samples: clamp to nearest sample.
     sigma_r = max(0.001, (rMax - rMin) / 4)   # 4σ ≈ ±[rMin,rMax] width
     likelihood_radius = gaussian_bell(inferred_radius, rMode, sigma_r)
     # No hard cut at rMin/rMax — the bell smoothly decays through and
     # beyond the envelope edges. A candidate at rMax + ε scores ~0.135
     # (gaussian at 2σ), not 0. Soft shoulders prevent discontinuities
     # at envelope boundaries that would jitter the rejection_threshold.

  2. If geometric_class implies branching context (linear-interior, junction,
     tip) AND local_axis is provided:
     angle_from_vertical = arccos(|local_axis · [0,1,0]|) in degrees
     {modal, stdDeg} = priors.branchAngleDistribution.fromVertical
     likelihood_angle = gaussian_bell(angle_from_vertical, modal, stdDeg)
     If angle_from_vertical > priors.hardRejections.branchAngleSteeperThanDeg:
       likelihood_angle = 0   # only HARD-zero case (operator-tunable)

  3. If geometric_class == 'junction':
     bd = priors.branchingDensityByHeight at height_frac (1D linear interp)
     If bd < priors.junctionMinBranchingDensity (default 0.1 branches/m):
       likelihood_branching = 0   # no junction possible where no branching
     Else:
       likelihood_branching = 1.0
     Else (non-junction class): likelihood_branching = 1.0

  4. Combine + apply softnessScaling:
     raw = likelihood_radius × likelihood_angle × likelihood_branching
     # softnessScaling ∈ [0, 1]: 1 = full priors; 0 = ignore priors.
     # Smooth linear blend: softnessScaling=0 → likelihood=1.0 (priors
     # disabled); softnessScaling=1 → likelihood=raw (full priors).
     likelihood = raw × priors.softnessScaling
                  + (1.0 - priors.softnessScaling) × 1.0

  return clip(likelihood, 0.0, 1.0)
```

**Cycle 2+ aggregation pipeline (out of scope for Cycle 1 but worth noting):** after multiple specimens are extracted, aggregate per-specimen `expectedRadiusByPosition` samples to produce species-level distribution-with-variance refining the hand-encoded starter values. The hand-encoded starter is *enough* for Cycle 1's classifier to work; Cycle 2 sharpens it.

---

## Output specification

```json
{
  "treeId": "10191",
  "speciesId": "acer_saccharum",
  "splines": [
    {
      "id": 0,
      "controlPoints": [[x,y,z], [x,y,z], ...],   // 3-10 points
      "radiusFn": {
        "type": "taper",
        "baseRadius": 0.18,                       // meters
        "tipRadius": 0.003,
        "taperExponent": 1.5
      },
      "parentSplineId": null,                     // null for trunk OR orphan
      "parentAttachT": null,                      // 0-1 parametric position on parent
      "tipExtrapolated": false,                   // true if Phase 3c projected the tip
      "from_handshake": true,                     // true if Phase 3b mutual-recognition produced this spline
      "from_taper_only": false,                   // true if spline came solely from Phase 3c degraded-mode fallback (no handshake)
      "orphan": false                             // true if Phase 5 BFS from trunk-base couldn't reach this spline (disconnected component)
    },
    {
      "id": 1,
      "controlPoints": [...],
      "radiusFn": {...},
      "parentSplineId": 0,                        // child of spline 0
      "parentAttachT": 0.72,                      // attaches 72% along parent
      "tipExtrapolated": true,
      "from_handshake": true,
      "from_taper_only": false,
      "orphan": false
    },
    // Example of a degraded-mode orphan that survived to output:
    {
      "id": 42,
      "controlPoints": [...],
      "radiusFn": {...},
      "parentSplineId": null,                     // can't reach trunk
      "parentAttachT": null,
      "tipExtrapolated": true,                    // single tip anchor + taper projection
      "from_handshake": false,
      "from_taper_only": true,
      "orphan": true                              // BFS from trunk-base didn't reach this component
    },
    ...
  ],
  "hyperparams": {...},
  "perPassDiagnostics": [
    {
      "pass": 1,
      "rigsScannedThisPass": 250,
      "workingSetSize": 14045,
      "lockedIn": 1820,
      "rejected": 4500,
      "deferred": 7725,
      "newSplines": 12,
      "tipAnchorCount": 87,
      "activeProbes": 174,
      "handshakeCount": 11,
      "stalledProbeCount": 152,
      "meanProbeStepsToHandshake": 38,
      "orphanCount": 1
    },
    {
      "pass": 2,
      "rigsScannedThisPass": 100,
      "workingSetSize": 7725,
      "lockedIn": 1300,
      "rejected": 2100,
      "deferred": 4325,
      "newSplines": 28,
      "tipAnchorCount": 124,
      "activeProbes": 248,
      "handshakeCount": 27,
      "stalledProbeCount": 194,
      "meanProbeStepsToHandshake": 42,
      "orphanCount": 1
    },
    ...
  ],
  "stats": {
    "totalSplines": 287,
    "totalControlPoints": 1450,
    "fromHandshakeCount": 281,                    // majority must be true at the cycle gate
    "fromTaperOnlyCount": 6,                      // small minority expected
    "orphanCount": 1,                             // ideally 0; surfaced honestly if non-zero
    "totalRigsScanned": 612,                      // adaptive scan converged here
    "scanTerminatedBy": "verdictRateBelowThreshold",  // or "nMaxHit" (did-not-converge)
    "passes": 4,
    "terminatedBy": "stableResidual",
    "elapsedMs": 42000
  }
}
```

**Total spline count target: ~hundreds per tree** (soft range 100–800; small/young specimens may legitimately have ~80). Not 40K nodes. Parametric centerlines that a procedural generator can consume directly.

---

## Stage map

| Stage | Days | Wall-clock budget | Output | Operator gate |
|---|---|---|---|---|
| **N.3.0 — Classifier + priors + tip-detector validation on static dataset** | ~1.5 | <2min CLI at N=50 fixed (Phase 1 adaptive scan disabled for this stage) | Hand-encoded `botanical-priors.json` for Sugar Maple (including `expectedLocalDirection` field for Phase 3b growth steering). Per-candidate tomography classifier producing `geometric_class` AND `prior_likelihood` AND `combined_confidence`. **Phase 3a precision-gated tip detector** runs and emits a `tip_anchors` set. **No iteration, no adaptive scan, no axonal growth yet.** Diagnostics: classification distribution histogram vs `priors.expected*Fraction`; tip-anchor count + visualization (anchors rendered as colored dots in alignment oracle). | **The classifier+tip-precision gate.** (a) Does the classifier visibly distinguish leaf-mass (low combined_confidence) from real branching joints (high combined_confidence)? Classification fractions within priors tolerance? (b) Does the tip detector emit a SPARSE, HIGH-PRECISION anchor set? Operator visually verifies that every emitted tip anchor sits at the visual end of a real branch — false-positive anchors at leaf-cluster positions are a stop-the-cycle failure. **Both classifier AND tip detector must clear this gate before adaptive scan and growth are built on top.** |
| **N.3.1 — Adaptive scan + verdict-rate stop + masked rasterization** | ~1.5 | <10min CLI on dev specimen; expected to converge to scan-complete in ≤300 rigs | Phase 1 adaptive-scan loop wired: spiral generator emits rigs in batches of N_batch; verdict-rate check after each batch (would-be lock-ins + would-be rejections vs the prior batch's attribution); loop terminates when `batch_verdict_rate < verdict_rate_threshold` (after `min_batches_before_stop`) OR N_max hit. Phase 4 three-outcome elimination wired (lock-in disabled for this stage since no splines exist yet — only rejection + deferred active). Per-pass diagnostics: rigs-added curve, working-set size curve, per-batch verdict-rate curve (must trend downward as scanning saturates), rejection count broken down by source (tomography vs prior vs both). | **The leaf-clearing + adaptive-stop visual gate.** Per-pass animation in the workstage: working set shrinks as rejections accumulate; verdict-rate curve falls toward `verdict_rate_threshold`; scan loop terminates *itself* on a real specimen (not by hitting N_max). Trunk + branches survive in M_obs; leaf mass dissolves. Working-set curve falls monotonically. If N_max trips on a representative specimen, threshold-tuning is required before N.3.2 (likely `verdict_rate_threshold` set too low). |
| **N.3.2 — Precision-gated tip anchoring + axonal growth + handshake recognition** | ~2 | <45min CLI on dev specimen (adaptive scan typically settles ~300–800 rigs; multi-pass; growth is the new cost center) | Phase 3a tip anchors (from N.3.0) + Phase 3b axonal growth (step-by-step probes from trunk + tips, glimpse-confirm + priors-blend each step) + Phase 3c degraded-mode taper fallback for un-handshaken tips. Chains fit to parametric splines (3–10 control points each); spline `prior_likelihood` scored; lock-in only for `from_handshake` splines above `lock_in_threshold`. **NO MST closure.** **NO ridge tracing.** Output JSON in parametric-spline format with `from_handshake` / `from_taper_only` / `tipExtrapolated` flags per spline. New per-pass diagnostics: `tip_anchor_count`, `active_probes_per_pass`, `handshake_count`, `stalled_probe_count`, `mean_probe_steps_to_handshake`. | **THE cycle gate.** Multi-pass on adaptive-N. Does the apparatus produce ~100–500 parametric splines (NOT 40K voxel nodes)? Does the canopy contain continuous SPLINE branches built by handshakes through low-evidence regions (not chaos, not isolated fragments)? Are stalled-probe counts diagnostically reasonable (not all probes stalling = priors/growth bug; not all probes handshaking = thresholds too loose)? Visibly cleaner than QSM AND Hawthorn's Bidirectional AND Tycho's rev. 1 v1 baseline (6th alignment-oracle layer comparison). |
| **N.3.3 — Pipe-model radii + taper co-determination** | ~0.5 | <5min CLI | Phase 5 backward-forward pipe-model counts on the connected spline graph. Per-spline parametric `radiusFn` populated. Co-determination diagnostic: per-spline radii (pipe-counting) vs Phase 3c taper-projection agreement for the splines that *have* taper-projected endpoints. | Visual: trunks taper sensibly; Murray's law sanity at joints (parent radius² ≈ Σ child radii²); taper-vs-pipe agreement within tolerance where applicable. |
| **N.3.4 — Rubin consensus-stability validation** | ~0.5 | ~2 hours for 4 subsampled runs (rig dropout reduces Phase-1 scan cost ~linearly but doesn't touch Phase 3/4/5; 4 runs at ~25min each) | Run apparatus 4× with 10/25/40% rig dropout from the adaptive-converged rig set. Spline count variance, position variance, topology agreement (do same tip anchors emerge? do same handshakes form?), tip-set agreement quantified. | Numerical gate: per-spline-endpoint variance < threshold across all dropout rates; tip-anchor set agreement > 80% across dropout runs. |

**Total ~6 days work + ~1.5 days operator validation cycles = ~7.5 days end-to-end.** N.3.2 grew by ~0.5 days because growth-shaped reach + tip-precision anchoring is more substantial work than the cone-shot reach of the rev. 2 draft. Stages numbered N.3.x mark the rev. 2 fresh build while preserving Tycho's N.2.0/2.1/2.2 commits as baseline comparison artifacts (the 5th alignment-oracle layer, "Li'l Vera v1 (baseline)").

**Wall-clock budgets are advisory** — if a stage materially exceeds budget, surface as scope drift; some stages may need optimization (numpy vectorization, Cython for inner loops) before being usable at N=500. Per Standing Requirement #7, the v2 baby builds parallelism in from day one.

---

## Acceptance — observation-shaped

At the N.3.0 gate (classifier + priors + tip-precision gate):

a. **Botanical-prior consistency.** Classification distribution at N=50 single-pass falls within tolerance of priors' expected fractions. Specifically: junction count <15% (not 63%), tip count 25–35%, linear-interior count 55–70%. The noise + sheet buckets are pre-elimination categories — their counts are diagnostic-only at this gate (no expected fraction), but together with linear/junction/tip should sum to 100% of classified candidates. If the distribution wildly diverges from priors' expected fractions, classifier thresholds need tuning **before any iteration machinery is built on top.**

b. **Visible leaf-mass discrimination.** In the M_obs heat layer with `prior_likelihood` as the colormap channel: dense leaf-mass regions should color dim (low likelihood — botanically impossible at this position) while real structural skeleton regions color bright. Pure tomography couldn't make this distinction; species-conditioned classification can.

c. **Tip-detector precision.** Tip anchor count is in the dozens-to-low-hundreds (NOT thousands; NOT zero on a leafed specimen). Every emitted tip anchor sits at the visual end of a real branch when overlaid on the point cloud in the alignment oracle. **Operator visually audits the full anchor set**; any leaf-cluster false positive is a stop-the-cycle failure → re-tune `tip_elongation_min` / `τ_tip_prior` / `tip_neighborhood_radius`. Precision matters far more than recall at this stage — a missed real tip will get picked up in a later pass once leaves clear; a phantom tip poisons every axon that tries to grow from it.

At the N.3.1 gate (adaptive scan + elimination gate):

d. **Adaptive scan self-terminates via verdict-rate.** On the development specimen, scan-loop terminates via `batch_verdict_rate < verdict_rate_threshold` rather than via N_max safety cap. Total rigs scanned reported in diagnostics; per-batch verdict-rate curve trends monotonically downward across batches within each pass. If N_max trips, `verdict_rate_threshold` is likely set too low (apparatus is asking for impossible verdict-rate stability) and needs tuning upward before N.3.2.

e. **Working set shrinks monotonically.** Per-pass elimination curve falls cleanly; rejection-count broken down by source shows both tomography AND prior contributing (not one dominating). Pass-N rendered residual is visibly cleaner than pass-1.

At the N.3.2 gate (THE cycle gate):

1. **Sparse parametric output.** Total spline count in the hundreds — soft target ~100–800; small/young specimens may legitimately have ~80 and still pass; hard cap <1000. Per-spline control points are 3–10, not thousands. This is the structural sanity check that the output is *centerlines*, not a *surface mesh-cloud*. Tens of thousands of splines = fail.
2. **The canopy is no longer a wireframe ball.** Interior canopy contains continuous spline branches grown by step-by-step axonal handshakes through low-M_obs regions, but those branches are SPLINES (parametric curves) not chaos. Visual inspection: branches curve naturally (priors-steered growth), not as straight cone-shots.
3. **Connectivity emerges from genuine handshakes, NOT MST closure, NOT ridge tracing.** The `from_handshake` flag is true on the majority of splines; `from_taper_only` is a small minority (degraded-mode fallback for unconnected tips). If `from_taper_only` dominates, axonal growth isn't working and the cycle hasn't popped. If MST-style closure is needed as a safety net, that's a stop-the-cycle failure — surface the gap, do not silently add MST.
4. **Axonal-growth diagnostics are sane.** `mean_probe_steps_to_handshake` is in a reasonable range (not 1 = priors are dragging probes directly to partners regardless of evidence; not at `probe_max_steps` = probes runaway-grow until they cap). `stalled_probe_count` / `handshake_count` ratio reflects the apparatus working hard but mostly succeeding. `tip_anchor_count` agrees with N.3.0's operator-validated anchor count (within ±10% — tips don't materially appear or disappear once classifier is stable).
5. **Visible improvement over baselines.** N.3.2 skeleton sits visibly cleaner than QSM (red-cyan), Hawthorn's Bidirectional (magenta-yellow), AND Tycho's rev. 1 v1 baseline (5th alignment-oracle layer cyan-magenta dense voxel mesh) — both in branch continuity AND in canopy interior reach.
6. **Self-terminating iteration.** Per-pass elimination curve flattens cleanly; algorithm reports "stable residual" or "working set exhausted" rather than "max passes hit."
7. **Tips inferred via taper extrapolation; pipe-model co-determination passes** (where applicable — i.e., on splines that have taper-projected endpoints; splines built entirely from handshake chains don't need this check). Per-chain observed radii (Phase 5 pipe-counting) ≈ taper-extrapolation predictions (Phase 3c) within tolerance per such spline endpoint.
8. **Botanical conformance at the spline level.** Output splines pass priors validation: every spline's control points lie in their expected radius-by-position envelope; every joint passes Murray's law (parent_r² ≈ Σ child_r² within 15%); no spline angles violate the species's expected range; spline curvatures match `priors.expected_local_direction` profiles within tolerance (growth was actually steered by priors, not just nominally).
9. **Single connected component (orphan-free output).** `stats.orphanCount == 0` at the cycle gate. Every spline reachable from the trunk-base via BFS through the directed parent→child graph. Phase 5 surfaces orphans honestly (does not drop them) so the operator can see them; a non-zero orphan count flags that mutual recognition didn't fully bridge the canopy and the apparatus has not converged. Cycle 1 requires orphan-free output; future cycles may add one-shot reach-extension to recover orphans before output, but Cycle 1 surfaces the gap rather than papering over it.

If N.3.2 gate doesn't pop visibly: spike concluded honestly. Phase T fallback (per-species statistical extraction over Tycho's rev. 1 output OR over Hawthorn's Bidirectional / QSM baselines) is the next move.

---

## Files

- `arborist/lil_vera_v2.py` — **NEW MODULE**, fresh build. Apparatus base + iteration loop + species-conditioned classification + parametric spline output all in one coherent module. Do NOT import from `lil_vera.py`; read it for context only.
- `arborist/state/<species>/botanical-priors.json` — **NEW FILE**, hand-encoded for Sugar Maple in Cycle 1 (literature values; ~12-20 sample points covering position space). Committed to git. Cycle 2+ refines from real specimens.
- `arborist/serve.js` — gains a new endpoint `/lidar/specimen/:treeId/lil-vera-v2-extract` (and the matching `runs` + `run/:filename` GET endpoints, all tolerating the `?t=` cache-buster). Existing v1 endpoints untouched.
- `src/arborist/LidarWorkstage.jsx` — **6th alignment-oracle layer** "Li'l Vera v2" (color: orange-gold #f0a040 / deep-teal #208070 — visually distinct from QSM red-cyan, Bidirectional magenta-yellow, **and the existing 5th layer cyan-magenta which becomes "Li'l Vera v1 (baseline)"**). New `SplineSkeleton` component that renders parametric splines via tube geometry (`THREE.TubeGeometry` from Catmull-Rom curves, one InstancedMesh per spline radius class). New v2 tuner sub-section with sliders for N, K_orient, pitch, max_passes, rejection_threshold, lock_in_threshold, priors_softness. Live per-pass diagnostics panel (working-set size curve, rejection-count-by-source histogram, classification distribution vs prior-expected).
- Optional new dependency: `scipy.interpolate.splprep` (already in scipy; no new install).

---

## Non-goals (do NOT do)

- Do NOT modify `lidar_extract.py`, `bidirectional_skeleton.py`, OR `lil_vera.py`. The first two stay as comparison baselines in the alignment oracle (layers 2 and 3); the third stays as Tycho's rev. 1 v1 baseline (layer 5). Rev. 2 publishes its own layer 6.
- Do NOT integrate into `generate-procedural.js`. Cycle 1 produces the *measurement apparatus*; procedural integration is a future cycle conditioned on N.3.2 passing.
- Do NOT consume source 3D positions as per-point algorithm input outside the five documented Posture-B carve-outs (see Posture section). Species identity IS allowed as input — that's the third inference channel.
- Do NOT extend to multiple specimens beyond N.3.4's subsampling-robustness test. One specimen for development.
- Do NOT touch other species or Phase G.1 procedural-runway work. Parallel cycle.
- Do NOT add iPhone-photo support, web UI, or open-source release scaffolding.
- Do NOT optimize prematurely.
- **Do NOT introduce Hessian ridge tracing as a primary structure-extractor.** The rev. 2 first draft specified ridge tracing in Phase 3a; the operator's pre-dispatch restructure removed it. Extraction is now anchored on trunk + tips with bidirectional axonal growth between them. Re-introducing ridge tracing as primary defeats the whole architectural point of the restructure. (Ridge tracing as a *diagnostic visualization* in the workstage to inspect the M_obs field is allowed and useful; as algorithmic input to Phase 3+ it is forbidden.)
- **Do NOT use a fixed-N scan.** Phase 1 is adaptive — scan until the per-batch verdict-rate (would-be lock-ins + would-be rejections per attributed candidate) falls below `verdict_rate_threshold`, OR hit the N_max safety cap. A baby that hard-codes `for r in range(500)` has misread the brief.
- **Do NOT re-introduce a geometric cluster detector** for adaptive-scan termination. An earlier brief draft specified one; it was removed because M_obs's monotonic accumulation produces ghost clusters from rejected leaves that the detector cannot distinguish from genuine unexplained mass. Verdict-rate is ghost-free; do not regress.
- **Do NOT use one-shot cone reach.** Axonal growth advances step-by-step (`step_length` per step), confirming a glimpse at each step and re-blending its direction with species curvature priors. A baby that shoots a single cone from each anchor and absorbs everything inside has rebuilt the cone-shot reacher the restructure explicitly removed. Step-by-step is the load-bearing primitive; without it, the algorithm can't follow real branch curvature.
- Do NOT use MST closure as a connectivity guarantee. Connectivity must emerge from genuine mutual-recognition handshakes (Phase 3b). If you can't get to one connected component without MST, surface the gap and ratify it OR diagnose what's failing.
- Do NOT re-introduce dense voxel-node output. Output is parametric splines (`controlPoints` + `radiusFn`).
- Do NOT statistically aggregate priors from observations in Cycle 1. The priors are hand-encoded for now; refinement from real specimens is Cycle 2's job.
- Do NOT softness-scale priors to 0 (ignore-priors mode) and treat that as a fallback — if priors hurt instead of help, surface as scope drift and re-tune the priors file rather than disabling them.

---

## Post-cycle cleanup (if N.3.4 ratifies the apparatus)

1. `arborist/NOTES.md` — Project: Li'l Vera Cycle 1 rev. 2 entry capturing apparatus architecture + per-pass elimination dynamics + species-conditioned classification calibration + comparison to baselines + comparison to rev. 1.
2. `arborist/BACKLOG.md` — Phase N.3 marked `[x]`; new Phase N.4 entry for "Cycle 2: multi-specimen run + per-species priors-file refinement from statistical aggregation + parameter distributions for procedural-generator integration."
3. Memory `[[project_lidar_as_training_data]]` — body updated to reflect the apparatus's actual role: per-specimen parametric skeleton extractor conditioned on species priors, whose output feeds procedural-generator parameter extraction in future cycles. Procedural generation is the v1.5 runtime; Li'l Vera is upstream training infrastructure; species priors close the loop between LiDAR data and procedural runtime parameters.
4. Commit + push the Cycle 1 priors files (`arborist/state/acer_saccharum/botanical-priors.json`) — the hand-encoded values are load-bearing artifacts; future species onboarding follows the same hand-encode → run → refine cycle.

---

End of brief (rev. 2).
