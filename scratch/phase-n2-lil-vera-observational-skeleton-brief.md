# Project: Li'l Vera — Cycle 1 — First Light (rev. 2)

> **Project: Li'l Vera** is an ongoing initiative within the Arborist to build a Monte-Carlo consensus-inference observational skeleton-extraction system — named in honor of the operator's beloved AND of Vera Rubin (the astronomer whose observational posture the apparatus channels; the Vera C. Rubin Observatory carries her name forward in the same lineage). The project is anticipated to span multiple cycles; this brief defines **Cycle 1 — First Light** — the foundational apparatus + its first single-specimen observation. Future cycles refine algorithm choices, generalize beyond LiDAR sources, integrate with procedural generation, and tune the apparatus from the lessons of First Light.
>
> The implementing baby self-names per Standing Requirement #1. Li'l Vera is the project; the baby is its first builder.
>
> **REV. 2 NOTE (2026-05-20):** rev. 1 of this brief shipped to Baby Tycho across commits `604dfed` / `de00a30` / `0d9102d` (Stages N.2.0 / N.2.1 / N.2.2). Tycho built precisely what rev. 1 specified — but rev. 1 was missing a load-bearing architectural primitive: **the working set never shrinks; leaf-mass and noise never get rejected; the canopy never clears.** What rev. 1 produced was a ridge-tracer through a dense static memory field, which makes the canopy interior a wireframe ball regardless of how many rigs observe it. Rev. 2 adds the missing primitive (Rubin-style residual subtraction with three-outcome elimination per pass) and specifies parametric-spline output instead of dense voxel-node graphs. **See "What's new in rev. 2" section below.**
>
> **REV. 2 IS A FRESH BUILD, NOT A RETROFIT.** Rev. 2 lives in a new module `arborist/lil_vera_v2.py` with a fresh baby reading this brief cold (no inherited rev. 1 mental model). Tycho's three commits survive as **baseline comparison artifacts** — the cyan-magenta Li'l Vera layer becomes "Li'l Vera v1 (baseline)" in the alignment oracle alongside QSM and Hawthorn's Bidirectional; v2 publishes a **6th alignment-oracle layer** for direct visual comparison. Rev. 1 primitives (apparatus base, tomography functions) are mandatory reads for context but ARE NOT IMPORTED — v2 builds them coherently in one module to preserve architectural integrity. The architecture is woven throughout (iteration loop touches every layer); surgical retrofit was not a coherent path.
>
> Specialist baby brief. ~7 day budget. Five stages with stop points. **Each stage stops at the boundary** — report, operator validates, next stage dispatched. Do NOT batch.

---

## For the human reader (intuition pumps; not in the brief body)

Five pictures to keep in your head while you build:

1. **A spiral dolly with a 3-camera rig** at 120° around the tree, looping past hundreds of times. Each rig position takes a triple snapshot. Crank N=500 overnight; you get 1500 observations from carefully-distributed angles.
2. **Dragging a stick through jelly** at every candidate point, in hundreds of directions per point. The directions that produce a clean channel reveal the local structural axis. The shape of the channel-score distribution classifies the point (linear interior, branching junction, tip, noise, sheet artifact).
3. **A scalar memory field in 3D space.** Every observation deposits evidence at points the apparatus has seen as silhouette, medial, structurally-coherent. The tree is what gets *repeatedly covered* — the high-evidence region of this field.
4. **Vera Rubin subtracting known signals to find dark matter.** Per pass, the apparatus subtracts confidently-classified points — both **confident-skeleton (locked-in)** AND **confident-noise (rejected, e.g., leaf surface, scan artifact)** — from the working set. Next pass renders the *residual*. The tree emerges progressively as leaves and noise dissolve out of the data the apparatus sees. Termination = working set exhausted or stable. **THE WORKING SET MONOTONICALLY SHRINKS.**
5. **A botanist checking the apparatus's homework.** Real Sugar Maples have bounded DBH, bounded heights, continuous taper, branch angles between ~30° and ~70° from vertical, strong-leader topology, children thinner than parents at every joint. The apparatus consults a **species botanical-priors file** at each classification decision. Geometrically-plausible candidates that are botanically impossible get rejected outright (hard constraints); botanically-unlikely candidates get deferred or down-weighted (soft constraints). This is the third inference channel alongside parallax + tomography — Bayesian priors that pull ambiguous observations toward biologically-correct answers.

These metaphors live here. The brief body describes the algorithm in invariants — math doesn't care which dolly trajectory, only that the viewpoint set has required coverage properties, the memory accumulates correctly, the working set shrinks each pass via dual classification (lock-in + rejection), AND every classification respects species-specific botanical constraints.

---

## Epistemic posture (load-bearing)

You are an **observational scientist**, not an algorithm implementer. The deliverable is a *measurement apparatus*. Channel Vera Rubin: many independent observations, iterative model refinement, structure inferred from where evidence accumulates **AND from what gets confidently subtracted as known signal or known noise**.

**Posture B — vision-only stereo recovery.** The apparatus treats source 3D positions as **unobserved structure** and recovers them purely from rendered views via stereo correspondence. Cameras are real cameras. The algorithm's input is the **rendered pixel data** of the point cloud, NOT the raw 3D coordinates as labels. Source positions enter only as a final ground-truth check at validation time, never as algorithm input. This discipline forces parsimony, makes the apparatus noise-tolerant, and generalizes the code to consume iPhone photographs in future cycles.

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

**Disciplines as tools:** computer vision (multi-view geometry, image-space skeletonization, stereo correspondence — OpenCV is allowed), 3D tubular structure extraction (Hessian ridge-following on scalar fields; vessel-tracing literature in MRI/CT is directly applicable), parametric spline fitting (Catmull-Rom or B-spline through ridge-traced nodes; SciPy's `scipy.interpolate.splprep`), pipe-model botany (Shinozaki 1964, Murray's law — for Phase 4 radius accumulation AND for taper-projected tip extrapolation, two co-determined views of the same biological relationship), forestry literature (species-specific morphology + allometric equations for hand-encoding initial priors). Reach for whichever the apparatus needs.

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
9. **Operator-tunable thresholds in the workstage UI.** Lock-in confidence threshold, rejection confidence threshold (for noise/sheet/leaf), glimpse-threshold for reach probes, max iteration passes (default 10), species-prior softness scaling (0 = ignore priors, 1 = hard priors, default 1). All exposed as sliders in the v2 tuner sub-section. Operator can dial during the visual gate.

---

## What's new in rev. 2 (load-bearing context)

Rev. 1 (Tycho's `604dfed` / `de00a30` / `0d9102d`) produced a working apparatus base + tomography classification + heat layer + a ridge tracer. But rev. 1's brief was missing the iteration-with-elimination architecture that the operator and coordinator extensively discussed during design, and the species-conditioned prior framing only crystallized in conversation after rev. 1 shipped. Specifically rev. 1 was missing:

- ✗ The **working set never shrank**. M_obs accumulated monotonically (correct) but rasterizer always rendered P₀; rejected leaves still contributed pixels every pass.
- ✗ No three-outcome (locked-in / rejected / deferred) classification per pass.
- ✗ No confident rejection of leaf mass, sheet artifacts, or scan noise; tomography "sheet artifact" classification existed but had no behavioral consequence.
- ✗ **No species-conditioned prior** to discriminate "geometrically-plausible-but-botanically-impossible" candidates (leaf mass at impossible structural positions misclassified as junction; 63% junction rate at N=500 vs botanical ~8%).
- ✗ Produced dense voxel-node graphs (40K nodes, 132K cylinders for one tree) rather than sparse parametric splines (target: 100–500 splines per tree, for use as procedural-generator training data downstream).

**Rev. 2 fixes those five gaps by:** (1) adding the iteration loop with three-outcome elimination + masked rasterization as the structural primitive; (2) introducing the species-conditioned botanical-priors file as a third inference channel that fundamentally conditions classification (input, not validation); (3) specifying parametric splines as the output shape; (4) elevating neuronal mutual recognition to the load-bearing connectivity primitive (vs ridge tracing alone or MST closure shortcut).

**Rev. 2 is a fresh build in a new module — `arborist/lil_vera_v2.py`.** The architecture is woven throughout (iteration loop touches Phase 1 rasterization, Phase 2 classification, Phase 3 extraction, Phase 4 elimination, Phase 5 radii, output emission); surgical retrofit was not a coherent path. Tycho's rev. 1 commits stand as **baseline comparison artifacts**:

- Rev. 1's 5th alignment-oracle layer (cyan-magenta) becomes "Li'l Vera v1 (baseline)" alongside QSM and Hawthorn's Bidirectional.
- Rev. 2 publishes a **6th alignment-oracle layer** (orange-gold / deep-teal) for direct visual comparison.
- The v2 baby reads `lil_vera.py` for context (and the tomography primitive logic is a useful starting point for v2's own re-implementation), but DOES NOT import from it. Coherent single-module rebuild.

What gets read for context (mandatory reads) but not imported:
- `arborist/lil_vera.py` apparatus base, tomography primitives, output structure — useful reference; v2 builds its own version.
- `arborist/bidirectional_skeleton.py` — Hawthorn's prior art; baseline layer.
- `arborist/lidar_extract.py` — QSM baseline; load_pointcloud is referenced but the cylinder graph extraction is baseline-only.

What stays unchanged in the codebase:
- `arborist/serve.js` v1 endpoints (`/lil-vera-extract`, `/lil-vera-runs`, `/lil-vera-run/:filename`) — Tycho's. v2 adds parallel `/lil-vera-v2-extract` etc.
- `src/arborist/LidarWorkstage.jsx` v1 5th layer + tuner sub-section + heat layer — Tycho's. v2 adds a 6th layer + its own tuner sub-section alongside.
- All the rev. 1 commits' visualization infrastructure (frame conventions, alignment oracle, Saved Runs picker pattern) is the design language v2 builds in.

What gets newly authored:
- `arborist/lil_vera_v2.py` — entire module (apparatus base + iteration loop + classification + extraction + spline fitting + output, all coherent).
- `arborist/state/<species>/botanical-priors.json` — hand-encoded for Sugar Maple for Cycle 1; Cycle 2+ statistical refinement.
- `arborist/serve.js` /lil-vera-v2-* endpoints (3 of them: extract, runs, run/:filename — same pattern as v1).
- `src/arborist/LidarWorkstage.jsx` 6th layer + `SplineSkeleton` component (THREE.TubeGeometry from Catmull-Rom) + v2 tuner sub-section + per-pass diagnostics panel.

---

## Algorithm — invariants only

### Inputs

- Point cloud P₀ (source frame; pulled via `lidar_extract.py`'s `load_pointcloud`)
- **Species identity** (required, e.g., `acer_saccharum`) — conditions every classification decision
- **Species priors file** at `arborist/state/<species>/botanical-priors.json` (see "Species priors file specification" section below)
- Hyperparameters: N (rig count), K_orient (tomography sample count, default 200), pitch ratio, ridge thresholds, glimpse threshold, rejection thresholds (sheet-classification confidence cutoff, flat-distribution cutoff, prior-violation confidence cutoff), termination criterion (ε_residual = fraction of P₀ remaining below threshold OR no-progress passes), max_passes (soft cap, default 10)

### Rig — 3 cameras at 120° (unchanged from rev. 1)

Each rig captures three cameras at 120° around its vertical axis, looking inward. Properties by construction: complete silhouette coverage per rig; universal within-rig stereo; triple-consensus per rig.

### Spiral — single N knob (unchanged from rev. 1)

Spiral around the tree's vertical symmetry axis, single primary knob N + pitch ratio. Operational mode: N=50 development; N=500 overnight load-bearing runs.

### THE structural primitive — iteration loop with working-set subtraction

```
Initialize:
  P ← indices into P₀ (the working set — all source points start uncertain)
  splines ← []  (parametric output, monotonically grows)
  M_obs ← empty 3D field  (observational memory; passive evidence; pure)
  M_interp ← empty 3D field  (interpretation memory; extraction commitments)
  priors ← load(arborist/state/<species>/botanical-priors.json)
  trunk_axis ← RANSAC vertical fit through densest Z-column of P₀
                (provides tree-frame coords for prior queries:
                 height_frac ∈ [0,1] above ground; radial_dist from axis)
  pass_count ← 0

Loop until terminated:
  pass_count += 1
  pts_active ← P₀[P]  # the masked source cloud — ONLY uncertain points

  # ── Phase 1: observe the current working set ──
  For each rig position r ∈ {1...N}:
    Render pts_active from the rig's 3 cameras (silhouette + medial via skimage)
    Within-rig stereo correspondence: triangulate to 3D candidates.
    (Crucially: rejected leaves from prior passes are GONE from pts_active and
     do not contribute medial-axis pixels in this pass's renders.)

  # ── Phase 2: deposit + SPECIES-CONDITIONED classify ──
  For each candidate c (within ε of a point in pts_active):
    Deposit into M_obs: silhouette_count, medial_count, body_count, rigs_seen.
    Orientation tomography: sample K_orient directions, compute channel scores.
    geometric_class ← classify by tomography distribution shape:
      Sharp unimodal peak       → candidate-linear-interior (peak dir = axis)
      Bimodal / multimodal      → candidate-junction
      Unimodal one-sided        → candidate-tip
      Flat                      → candidate-noise
      Distributed on great circle → candidate-sheet
    height_frac ← (c.y - ground) / tree_height
    radial_dist ← distance from c to trunk_axis
    inferred_radius ← perpendicular spread of M_obs around c
    prior_likelihood ← priors.likelihood(geometric_class, height_frac,
                                          radial_dist, inferred_radius,
                                          local_axis=peak_direction)
      # priors.likelihood ∈ [0, 1]: 1 = perfectly consistent with species at
      # this position; 0 = botanically impossible; soft values for
      # unlikely-but-possible. EXAMPLE: Sugar Maple at height_frac=0.5,
      # radial_dist=4m, inferred_radius=1.5m → likelihood ≈ 0 (no thick
      # branch exists 4m radially-out at mid-height; it's a leaf cluster,
      # not skeleton).
    c.classification ← geometric_class
    c.prior_likelihood ← prior_likelihood
    c.combined_confidence ← geometric_confidence × prior_likelihood

  # ── Phase 3: extract structure (three primitives, all prior-aware) ──

  # 3a: ridge extraction
  ridge_chains ← Hessian-eigenvector ridge trace on smoothed M_obs, seeded
                 from candidate-tip points whose combined_confidence exceeds
                 threshold. Ridges WILL NOT trace through regions whose
                 prior_likelihood < ε_prior — the species prior excludes
                 botanically-impossible structure from the start.

  # 3b: NEURONAL AXONAL REACH — bidirectional mutual recognition
  #     This is the load-bearing connectivity primitive. NOT one-direction
  #     extension. Every locked-in endpoint sends probes BOTH in
  #     mother-direction (toward parent / trunk) AND child-direction(s)
  #     (multiple, since real nodes can branch). A connection FORMS when
  #     a probe from A finds B AND B's reciprocal probe in the opposite
  #     direction would find A back. Symmetric recognition by construction.
  #     This is the synapse-formation primitive in neural development —
  #     filopodia probe outward; reciprocal recognition with a partner
  #     triggers connection. Skip this primitive and the algorithm is just
  #     path-finding through a memory field; geometric fragments emerge
  #     without enforced connectivity (the QSM failure mode).
  For each ridge endpoint e ∈ ridge_chains:
    Spawn confidence cones in mother-direction + child-direction(s) along
    e's local axial fit.
    Cone's working medium is M_obs (ALL of it, including LOW-M_obs regions
    ridge tracing skipped — that's how we reach into leaf-occluded canopy).
    For each candidate c in cone with M_obs > glimpse_threshold AND
                                  prior_likelihood > ε_prior AND
                                  tomography axis aligns with cone direction:
      Mark c as candidate-absorption.
    Commit absorption if absorbed candidates form a coherent axial chain.
    MUTUAL RECOGNITION: if e's probe reaches another locked-in endpoint f
    AND f's reciprocal probe in the opposite direction would reach e back,
    declare an edge (e, f). Recognition is symmetric by construction; both
    ends must independently signal toward each other.
    Deposit absorption_count into M_interp at absorbed locations.
    **M_obs is NEVER modified by extraction.** Observational evidence stays
    pure; extraction commitments accumulate separately in M_interp. This
    is the positive-feedback hallucination safeguard: a candidate that's
    been "absorbed" by an axon doesn't artificially boost its observational
    confidence on the next pass; the underlying observational evidence
    must still support continued growth.

  # 3c: taper-projected tip extrapolation
  For each unconnected chain endpoint (candidate tip):
    Estimate observed taper rate τ from M_obs perpendicular spread along
    chain's last segments.
    If τ consistent → project tip at arc-length r/τ beyond last-observed
                       segment along last-observed axial direction.
    If τ inconsistent → flag uncertain; conservative projection.
    NOTE: Phase 5's pipe-model pipe-counting and Phase 3c's taper-projection
    are TWO VIEWS of the same Murray's-law relationship. They must agree
    per chain endpoint at validation time; disagreement is a diagnostic to
    surface, not silently commit.

  # Spline fitting
  new_chains ← merge (ridge_chains + reached_chains), dedup by proximity.
  new_splines ← fit parametric splines through new_chains
                (Catmull-Rom or scipy.interpolate.splprep; 3-10 control
                 points per spline based on arc-length / curvature).
  For each new spline s:
    Compute s.prior_likelihood = mean(priors.likelihood at each control point
                                       given inferred radius + position).
    Splines whose control points fall in low-prior regions, OR whose taper
    doesn't match priors.taper_distribution at their height range, score
    lower. Low-likelihood splines stay in "candidate" status; don't lock-in
    until prior agrees.

  # ── Phase 4: THREE-OUTCOME ELIMINATION (Rubin subtraction) ──
  For each point p ∈ P:
    If p lies within ε_lock of any spline s ∈ new_splines with
       s.prior_likelihood > lock_in_threshold:
      MARK LOCKED-IN  → remove p from P. Spline s persists in output.
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
  If (no new lock-ins this pass) AND (no new rejections):
    Terminated (stable residual — apparatus has nothing more to say).
  Elif |P| / |P₀| < ε_residual:
    Terminated (working set exhausted).
  Elif pass_count >= max_passes (default 10):
    Terminated (safety cap; flag as "did not converge"; surface in
                diagnostics so operator can investigate threshold tuning).

return splines  # parametric centerlines, ready for Phase 5 radius pass
```

### Phase 5 — pipe-model radius accumulation (operates on splines)

After the loop terminates, splines is the sparse parametric skeleton (target: 100–500 splines per tree). On this graph:

- **Backward pass:** for each terminal-tip spline, trace its path through the spline graph back to the ground (trunk-base spline). Each tip = one "pipe."
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
  "dbhRange": [0.05, 1.00],                    // meters (radius, not diameter)
  "crownWHRatio": [0.5, 0.9],                  // width/height ratio of crown bbox
  "expectedRadiusByPosition": {
    // Position-dependent expected radius envelope.
    // Lookup: given (height_frac ∈ [0,1], radial_dist_from_axis_m),
    // returns {radiusMin, radiusMax, radiusModal}.
    // Used in priors.likelihood() to score whether an inferred radius is
    // consistent with the species at this position.
    "type": "piecewise2d",
    "samples": [
      {"heightFrac": 0.0, "radialDist": 0.0,  "rMin": 0.15, "rMax": 0.50, "rMode": 0.30},
      {"heightFrac": 0.1, "radialDist": 0.0,  "rMin": 0.13, "rMax": 0.45, "rMode": 0.28},
      {"heightFrac": 0.3, "radialDist": 0.0,  "rMin": 0.10, "rMax": 0.35, "rMode": 0.22},
      {"heightFrac": 0.3, "radialDist": 2.0,  "rMin": 0.03, "rMax": 0.12, "rMode": 0.06},
      {"heightFrac": 0.5, "radialDist": 4.0,  "rMin": 0.005,"rMax": 0.04, "rMode": 0.015},
      {"heightFrac": 0.8, "radialDist": 3.0,  "rMin": 0.001,"rMax": 0.01, "rMode": 0.003},
      {"heightFrac": 1.0, "radialDist": 5.0,  "rMin": 0.0,  "rMax": 0.005,"rMode": 0.0}
      // ... ~12-20 samples covering position space; bilinearly interpolated
    ]
  },
  "branchAngleDistribution": {
    "fromVertical": {"min": 25.0, "max": 75.0, "modal": 50.0, "stdDeg": 10.0}
    // Sugar Maple scaffolds emerge 30-70° from vertical; never horizontal.
  },
  "murraysLawJointTolerance": 0.15,            // parent_r² vs Σ(child_r²) within ±15%
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

  1. Lookup expected radius envelope at (height_frac, radial_dist).
     If inferred_radius outside [rMin, rMax] → likelihood = 0 (hard reject).
     Else likelihood_radius = gaussian(inferred_radius, rMode, (rMax-rMin)/4).

  2. If geometric_class implies branching context:
     Lookup expected branchAngleDistribution.
     likelihood_angle = gaussian(local_axis_angle_from_vertical, modal, stdDeg).
     If angle > hardRejections.branchAngleSteeperThanDeg → likelihood = 0.

  3. If geometric_class == 'junction':
     branching_density_at_height should be > 0 to support a junction here.
     If branchingDensity ≈ 0 at this height_frac → likelihood = 0 (no junction
     possible where no branching exists).

  4. Combine: likelihood = likelihood_radius × likelihood_angle × ...
              (apply softnessScaling: smoothly interpolate toward 1.0 as
               softnessScaling → 0.0)

  return likelihood
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
      "parentSplineId": null,                     // null for trunk
      "parentAttachT": null,                      // 0-1 parametric position on parent
      "tipExtrapolated": false                    // true if Phase 3c projected the tip
    },
    {
      "id": 1,
      "controlPoints": [...],
      "radiusFn": {...},
      "parentSplineId": 0,                        // child of spline 0
      "parentAttachT": 0.72,                      // attaches 72% along parent
      "tipExtrapolated": true
    },
    ...
  ],
  "hyperparams": {...},
  "perPassDiagnostics": [
    {"pass": 1, "workingSetSize": 14045, "lockedIn": 1820, "rejected": 4500, "deferred": 7725, "newSplines": 12},
    {"pass": 2, "workingSetSize": 7725, "lockedIn": 1300, "rejected": 2100, "deferred": 4325, "newSplines": 28},
    ...
  ],
  "stats": {
    "totalSplines": 287,
    "totalControlPoints": 1450,
    "passes": 4,
    "terminatedBy": "stableResidual",
    "elapsedMs": 42000
  }
}
```

**Total spline count target: 100–500 per tree.** Not 40K nodes. Parametric centerlines that a procedural generator can consume directly.

---

## Stage map

| Stage | Days | Wall-clock budget | Output | Operator gate |
|---|---|---|---|---|
| **N.3.0 — Classifier + priors validation on static dataset** | ~1.5 | <2min CLI at N=50 | Hand-encoded `botanical-priors.json` for Sugar Maple. Per-rig observation + tomography classifier producing `geometric_class` AND `prior_likelihood` AND `combined_confidence` per candidate. **No iteration yet, no elimination yet.** Single-pass apparatus runs on one specimen and produces a classified candidate set. Diagnostics: classification distribution histogram vs `priors.expected*Fraction`. | **The classifier-first gate.** Does the classifier visibly distinguish leaf-mass (low combined_confidence) from real branching joints (high combined_confidence)? Is the classification distribution within tolerance of priors' expected fractions (junction <15%, not 63%)? **If the classifier can't get this right on a static dataset, no iteration loop on top will save it. This is the foundational gate.** |
| **N.3.1 — Iteration loop + three-outcome elimination** | ~1.5 | <10min CLI at N=50, 4 passes | Working set state `P`, masked rasterization (rasterizer takes `pts_world[P]`), Phase 4 three-outcome elimination wired. Pass N renders the residual; canopy leaf-mass progressively dissolves as rejections accumulate. Per-pass diagnostics: working-set size curve, lock-in count, rejection count broken down by source (tomography vs prior vs both). | **The leaf-clearing visual gate.** Per-pass animation in the workstage: pass-1 candidate cloud → pass-2 residual (leaves rejected) → pass-3 residual (more rejected) → pass-4 stable. Trunk + branches survive; leaf mass dissolves. Working-set curve falls monotonically. |
| **N.3.2 — Spline fitting + lock-in + mutual recognition** | ~1.5 | <30min CLI at N=500, ~10 passes | Phase 3a/3b/3c (ridge + axonal mutual-recognition reach + taper-projection) extract chains per pass; chains fit to parametric splines (3–10 control points each); spline `prior_likelihood` scored; points within ε_lock of high-likelihood splines mark LOCKED-IN. **NO MST closure** — connectivity emerges from genuine mutual recognition. Output JSON in parametric-spline format. | **THE cycle gate.** N=500, multi-pass. Does the apparatus produce ~100–500 parametric splines (NOT 40K voxel nodes)? Does the canopy contain continuous SPLINE branches (not chaos)? Visibly cleaner than QSM AND Hawthorn's Bidirectional AND Tycho's rev. 1 v1 baseline (6th alignment-oracle layer comparison). |
| **N.3.3 — Pipe-model radii + taper co-determination** | ~0.5 | <5min CLI | Phase 5 backward-forward pipe-model counts on the spline graph. Per-spline parametric `radiusFn` populated. Co-determination diagnostic: per-spline radii (pipe-counting) vs Phase 3c taper-projection agreement. | Visual: trunks taper sensibly; Murray's law sanity at joints (parent radius² ≈ Σ child radii²); taper-vs-pipe agreement within tolerance. |
| **N.3.4 — Rubin consensus-stability validation** | ~0.5 | <30min for 4 subsampled runs | Run apparatus 4× with 10/25/40% rig dropout. Spline count variance, position variance, topology agreement, tip-set agreement quantified. | Numerical gate: per-spline-endpoint variance < threshold across all dropout rates. |

**Total ~5.5 days work + ~1.5 days operator validation cycles = ~7 days end-to-end.** Stages renumbered N.3.x (rather than N.2.x) to mark the rev. 2 fresh build while preserving Tycho's N.2.0/2.1/2.2 commits as baseline comparison artifacts (the 5th alignment-oracle layer, "Li'l Vera v1 (baseline)").

**Wall-clock budgets are advisory** — if a stage materially exceeds budget, surface as scope drift; some stages may need optimization (numpy vectorization, Cython for inner loops) before being usable at N=500. Per Standing Requirement #7, the v2 baby builds parallelism in from day one.

---

## Acceptance — observation-shaped

At the N.3.0 gate (the classifier-first gate):

a. **Botanical-prior consistency.** Classification distribution at N=50 single-pass falls within tolerance of priors' expected fractions (e.g., junction count <15% not 63%, tip count 25–35%, linear-interior count 55–70%). If the distribution wildly diverges from priors, classifier thresholds need tuning **before any iteration machinery is built on top.**

b. **Visible leaf-mass discrimination.** In the M_obs heat layer with `prior_likelihood` as the colormap channel: dense leaf-mass regions should color dim (low likelihood — botanically impossible at this position) while real structural skeleton regions color bright. Pure tomography couldn't make this distinction; species-conditioned classification can.

At the N.3.2 gate (the cycle gate):

1. **Sparse parametric output.** Total spline count 100–500 per tree, not 40K. Per-spline control points are 3–10, not thousands. This is the structural sanity check that the output is *centerlines*, not a *surface mesh-cloud*.
2. **The canopy is no longer a wireframe ball.** Interior canopy contains continuous spline branches (axonal mutual-recognition reach into low-M_obs regions did its job), but those branches are SPLINES (parametric curves) not chaos.
3. **Confident leaf rejection visible per pass.** Per-pass diagnostics show the working set monotonically shrinking; the rejected-count is meaningful (not zero); pass-N rendered point cloud progressively cleaner than pass-1. Rejection-by-source breakdown shows both tomography and prior contributing (not one dominating).
4. **Connected output via genuine mutual recognition, NOT MST closure.** Connectivity emerges from bidirectional probe + reciprocal recognition. If MST-style closure is needed as a safety net, it's a flag that the algorithm hasn't converged properly.
5. **Visible improvement over baselines.** N.3.2 skeleton sits visibly cleaner than QSM (red-cyan), Hawthorn's Bidirectional (magenta-yellow), AND Tycho's rev. 1 v1 baseline (5th alignment-oracle layer cyan-magenta dense voxel mesh).
6. **Self-terminating iteration.** Per-pass elimination curve flattens cleanly; algorithm reports "stable residual" or "working set exhausted" rather than "max passes hit."
7. **Tips inferred via taper extrapolation; pipe-model co-determination passes.** Per-chain observed radii (Phase 5 pipe-counting) ≈ taper-extrapolation predictions (Phase 3c) within tolerance per spline endpoint.
8. **Botanical conformance at the spline level.** Output splines pass priors validation: every spline's control points lie in their expected radius-by-position envelope; every joint passes Murray's law (parent_r² ≈ Σ child_r² within 15%); no spline angles violate the species's expected range.

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
- Do NOT consume source 3D positions as algorithm input (Posture B violation). Source positions feed only the rasterizer's MASKED renders (rasterizer takes `pts_world[P]`, not all of P₀). Species identity IS allowed as input — that's the third inference channel.
- Do NOT extend to multiple specimens beyond N.3.4's subsampling-robustness test. One specimen for development.
- Do NOT touch other species or Phase G.1 procedural-runway work. Parallel cycle.
- Do NOT add iPhone-photo support, web UI, or open-source release scaffolding.
- Do NOT optimize prematurely.
- Do NOT use MST closure as a connectivity guarantee. Connectivity must emerge from genuine mutual-recognition reach. If you can't get to one connected component without MST, surface the gap and ratify it OR diagnose what's failing.
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
