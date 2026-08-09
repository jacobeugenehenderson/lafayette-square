# Phase G.1 — Sugar Maple Procedural Hero (Runway) — Maxi Baby Brief

> Maxi brief. Four stages. **Each stage stops at the boundary** — report, operator validates visually in /arborist or /cartograph, operator dispatches the next stage. Do NOT batch stages or auto-continue.

---

## Context — why this brief exists

Phase N's bidirectional-extraction spike (commit `c9bf5df`, Baby Hawthorn) shipped successfully but produced only a marginal cleanness delta over QSM on real LiDAR — and "cleaner topology" did not translate to "tree-like geometry." Both algorithms extract from real LiDAR, which is inherently a wire-frame mess (occlusion gaps, twig-scale dropout, partial coverage). Extraction is bounded by the data; constructive algorithms aren't.

The decision: **fall back to procedural for the v1.5 runway**, get a Sugar Maple hero on the ground, ship through bake. LiDAR informs by HAND statistical grounding (operator + baby eyeball a handful of specimens, hand-edit PRESETS) — not via automated stat extraction. Separately, a parallel micro-spike will test whether bidirectional GENERATION (clean synthesized noise, not real LiDAR) produces tree-like output; if that pops, the doctrine returns later. For now: runway.

This brief is the procedural-only Sugar Maple hero path. Reference `scratch/pre-stage-g1-sugar-maple-hero.md` for the 70% of G.1 framing that still applies (Promotion mechanism = Option B committed seedlings.json; Phase F leaf binding; PRESETS structure) — but ignore Sections referencing LiDAR-baked mixed roster or LiDAR statistical extraction. Those paths are out for v1.5.

Already shipped doctrine that you're building on:
- G.0 strong-leader SCA mode (commit `36d667c` and earlier) — Sugar Maple should use `architecture: 'strong-leader'`
- D.1a/b staggered scaffold emergence + leaf-cluster-along-shoot emission
- D.2 operator-tunable deformers (trunkWander, branchJitter, barkRelief)
- Phase A dice/adopt UI in `/arborist` ProceduralWorkstage
- `arborist/leaf-pack-bindings.json` — Phase F infrastructure, may or may not be wired into bake-look yet (G.1.1 verifies)

---

## Standing requirements (apply to every stage)

1. **Name yourself in publish notes.** First line of every commit body + status update head: e.g., "Baby Sycamore — Phase G.1.0 — hand-grounded PRESETS". Operator preference.
2. **Surface scope drift** per `[[feedback_baby_must_surface_scope_drift]]`. Disclose files touched outside brief, schema extensions, retuned defaults, new dependencies, deviations.
3. **Mandatory reads at session start:**
   - `arborist/NOTES.md` 2026-05-19 entries (evening + PM)
   - The Context section above
   - `scratch/pre-stage-g1-sugar-maple-hero.md` (note superseded LiDAR sections per head-note)
   - Memories: `[[feedback_procedural_trees_are_the_destination]]`, `[[feedback_leverage_vendor_pbr_before_authoring]]`, `[[project_park_is_the_gem]]`
   - Code: `arborist/generate-procedural.js` (PRESETS structure + main pipeline), `arborist/leaf-pack-bindings.json`, `src/arborist/ProceduralWorkstage.jsx` (dice/adopt UI)
4. **Stop at every stage boundary.** Status report → operator visual validation → operator dispatches next stage. Do not batch.
5. **Working tree is dirty** with operator's unrelated in-flight work. Edit only files this brief touches.
6. **Determinism preserved.** Same {species, slot, seed, params} → byte-identical GLB through Adopt → Publish.

---

## Stage G.1.0 — Hand-grounded PRESETS for `acer_saccharum_procedural`

**Budget:** ~half day.

### What

No script work. Operator + baby manually extract scalar statistics from 3–5 validated Sugar Maple LiDAR specimens and hand-edit the PRESETS row.

1. Operator selects 3–5 specimens via LidarWorkstage that visually represent the "typical" Sugar Maple shape (browse the list, eye-check the cylinder skeleton overlay against the point cloud per the N.0 alignment oracle — reject partial scans / leaning trees / multi-stem).
2. Baby runs `lidar_extract.py` on each selected specimen via CLI (or pulls `seedlings.json` cached stats if available); records: total height, DBH (estimate from trunk-cylinder base radius × 2), crown width (max horizontal extent), crown W:H ratio, scaffold count (count cylinders branching off the trunk axis within lower 30%), first-scaffold height-fraction.
3. Baby computes simple means across the 3–5 specimens — no fancy aggregation, just averages with the count noted.
4. Baby hand-edits the `acer_saccharum_procedural` PRESETS row in `arborist/generate-procedural.js`:
   - `envelope.height` ← mean total height (probably ~18–25m)
   - `envelope.width` ← mean crown width (probably ~12–18m)
   - `envelope.profile` ← `'roundedOval'` (Sugar Maple silhouette per pre-stage doc)
   - `sca.architecture` ← `'strong-leader'` (G.0 mode)
   - `sca.leaderStrength` ← compute from observed leader-continuation; estimate visually (0.7–0.9 typical for Sugar Maple)
   - `sca.scaffolds` ← mean scaffold count
   - `sca.branchingStartFrac` ← mean first-scaffold-height-fraction (0.25–0.4 typical)
   - `trunk.baseRadius` ← mean DBH / 2
   - Other knobs left at G.0 defaults
5. Baby documents the source specimens (treeIds + their measurements) in a comment block at the top of the Sugar Maple PRESETS row.

### Files

- `arborist/generate-procedural.js` — PRESETS row edited
- `arborist/NOTES.md` — entry documenting which specimens were used, the measurements, and the derived means

### Acceptance

1. PRESETS row updated with statistically-grounded values (operator confirms via numerical review of the comment block).
2. `node arborist/generate-procedural.js --species acer_saccharum_procedural` regenerates 3 variants cleanly.
3. Variants visible in `/arborist` ProceduralWorkstage Sugar Maple slots with reasonable initial geometry (no obviously-wrong proportions; tree stands upright at sensible height).

### Stop point

Report: which 3–5 specimens were chosen, the measurements, the derived PRESETS values, link to the diff. Operator dispatches G.1.1 after numerical + initial-visual review.

---

## Stage G.1.1 — Phase F leaf pack binding for Sugar Maple

**Budget:** ~1 day.

### What

Wire the vendor leaf pack into `acer_saccharum_procedural`'s bake. Sugar Maple maps to `LeafSet010` (palmate, per `arborist/leaf-pack-bindings.json`'s morphology-to-pack table).

**First verify:** is the leaf-pack binding already consumed by `arborist/bake-look.js`? Per the Phase F memory, `leaf-pack-bindings.json` was shipped as INFORMATIONAL ONLY in LiDAR Cycle 1; runtime consumption may or may not have landed. Check:

- Does `bake-look.js` read `leaf-pack-bindings.json` and apply the resolved pack's textures to the procedural leaf-card atlas?
- If yes (Phase F runtime is live): just verify Sugar Maple resolves to `LeafSet010` and bake; visual check confirms palmate leaves appear.
- If no (Phase F runtime not yet implemented): **stop and report — this stage's scope expands and needs operator re-brief.** Do not silently expand.

If the binding is live, this stage is a confirmation pass + visual validation, not new implementation work.

### Files (if Phase F runtime is live)

- Possibly `arborist/species-map.json` — confirm `acer_saccharum_procedural` carries `leafMorph: 'palmate'`
- Bake re-run: `bake-look` for the active Look (`lafayette-square`)

### Acceptance

1. Sugar Maple variants in ProceduralWorkstage render with palmate leaf cards (not generic ovate_large default).
2. Leaf color reads appropriately for current season (summer green default).
3. `renderer.info.programs.length` unchanged at workstage scene load (no new shader programs).

### Stop point

Report: whether Phase F runtime was live or needs follow-on; if live, visual confirmation that LeafSet010 textures applied correctly. Operator visual validation in /arborist.

---

## Stage G.1.2 — Operator dice/adopt iteration

**Budget:** ~1 day.

### What

Operator-driven iteration in ProceduralWorkstage. Baby's role is supportive: be available for fixes (parameter snapping, UI bugs, weird-looking knobs), but the work is operator dicing through variant seeds until 3 Sugar Maple variants are adopted.

Per `[[project_doped_artifact_placecard_edit_pattern]]`: G.1.0's grounded PRESETS are the "doped artifact" — best-guess defaults. Operator refines per-variant via the dice/adopt cycle. Each adopted variant captures `{slot, seed, params}` to `arborist/state/acer_saccharum_procedural/seedlings.json` (gitignored per existing convention).

Decide hero promotion mechanism per pre-stage doc Section 1 — Option B (gitignore exception so seedlings.json lives in source). Baby adds the `.gitignore` exception line and commits the operator's 3 final seedlings.

### Files

- `arborist/state/acer_saccharum_procedural/seedlings.json` — committed via gitignore exception
- `.gitignore` — exception line added
- Baby may need to fix UI surface bugs if operator surfaces them (ProceduralWorkstage)

### Acceptance

1. 3 Sugar Maple variants adopted; seedlings.json committed.
2. Each variant visually distinct (different scaffold counts / heights / canopy spreads from the variance jitter).
3. None obviously broken (no floating leaves, no exposed twig stubs, no obviously-wrong silhouette).
4. Operator approves visual quality.

### Stop point

Report adopted seeds + params + commit hash. Operator dispatches G.1.3 after visual approval.

---

## Stage G.1.3 — Full bake + /cartograph validation

**Budget:** ~half day.

### What

Run the full Sugar Maple pipeline through publish → bake-look → bake-trees → /cartograph LS. Operator visual validation at LS Browse, Hero, and Street SHOTS.

1. `node arborist/generate-procedural.js --species acer_saccharum_procedural` — regenerates the 3 committed variants
2. `node arborist/publish-glb.js --species acer_saccharum_procedural` — LOD pipeline (if not already part of generate path)
3. `bake-look` for `lafayette-square` (awaited)
4. `bake-trees` for park placement substitution
5. Operator opens /cartograph LS → confirms Sugar Maples in lafayette-square render upright at correct heights, with palmate leaves, and the silhouette reads as Sugar Maple from Browse + Hero distances

### Files

- `public/baked/lafayette-square/trees/acer_saccharum_procedural/skeleton-{1,2,3}-lod{0,1,2}.glb` (regenerated artifacts)
- `public/baked/default.json` (placement substitution; ~104 Sugar Maple placements should route to procedural variants)

### Acceptance

1. Sugar Maples render upright at sensible heights in /cartograph (alignment oracle's frame convention propagates correctly — Phase N.0's bake-tree.py Z→Y rotation doesn't affect procedural variants, but verify nothing else broke the convention).
2. Operator-visual: "does this read as a Sugar Maple at LS scale, Browse + Hero + Street?" Yes → ship.
3. `renderer.info.programs.length` unchanged at LS scene load.
4. Determinism: same seeds + params → byte-identical bake artifacts.

### Stop point

Report ships the cycle. Operator decides next: G.2 (Ginkgo), polish iteration on G.1, or move to other arborist work.

---

## Post-cycle cleanup (baby's last commit if cycle completes)

1. Update `arborist/NOTES.md` with Phase G.1 entry — what shipped, surfaced scope drift, the hand-grounded PRESETS source-of-truth specimens.
2. Update `arborist/BACKLOG.md` — Phase G.1 marked `[x]`.
3. Update `scratch/pre-stage-g1-sugar-maple-hero.md` head-note — mark as "G.1 SHIPPED via procedural runway path" and note which sections are now historical.
4. Update memory `the v1 tree-scope note (retired 2026-08-09 — trees are Column B; see `ROADMAP`)` if relevant — the assumption "trees in v1 but arborist roster behind launch" may need refining now that G.1 is shipping.

---

## Non-goals (do NOT do)

- Do NOT integrate bidirectional_skeleton.py output. That path is alive but separately spiking; this brief is procedural-runway only.
- Do NOT modify Phase N N.0 alignment-oracle code unless an orientation regression surfaces (and if it does, surface + fix narrowly).
- Do NOT touch other species PRESETS rows (Oak, Willow, etc.). Sugar Maple only.
- Do NOT extend the dice/adopt UI scope. If operator surfaces UX wishes during G.1.2, log them as a separate BACKLOG item; don't bundle.
- Do NOT add new dependencies. The current stack covers everything in this brief.

---

End of brief.
