# Arborist Backlog

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Read at session start; check off completions during work; prune toward pristine. Resolved items belong out of this doc, not in a "Done" section. Migrated 2026-05-18 out of `cartograph/BACKLOG.md`. Tree work that intersects cartograph-side code (Couplers wiring, scene channels) still appears in `cartograph/BACKLOG.md`; tree-internal items live here.

---

## Trees — Procedural v1.5: in-Arborist authoring + skeleton-first redo (in flight 2026-05-15)

**Tomorrow's first move (parked 2026-05-19 EOD, third-shift session):** finish the LoD-preview + perf-gauge wiring in the workstage, then begin G.1 Sugar Maple. The server scaffolding is in place (`POST /procedural/generate` accepts a `lod` body field; runs `simplifyGlbBytes` via gltf-transform's `MeshoptSimplifier` at the same ratios `publish-glb.js` uses). The store has a `previewLod` field and it's plumbed into `SlotCard` as a prop. **What's missing**: SlotCard needs to (a) destructure `previewLod` + `onPreviewLodChange` from props, (b) include `lod: previewLod` in the body of the generate-fetch (~line 261), (c) re-fetch on previewLod change (add to the useEffect deps), and (d) render the LoD selector buttons (0 / 1 / 2) + a perf gauge overlay (tri count, leaf count, draw calls) — same floating-panel pattern as the Wind toggle. After that lands, the operator finishes G.1 (Sugar Maple) by dropping the PSD palmate-leaf cluster atlas into `public/textures/leaves/acer_saccharum_procedural/cluster.png` and tuning the hero PRESETS entry.

**Historical first move (parked 2026-05-15, completed 2026-05-19):** rewrite the `cartograph/NOTES.md` 2026-05-15 maxi-brief from "5 morphologies × ~3 variants each" to **"5 heroes on top of morphology fillers, all sharing the procedural bark shader; Phase G splits into 5 proving passes."** Doctrine clarifications to incorporate (from post-Phase-D conversation):
- Morphology buckets STAY as fillers; heroes sit on top via species-map.json preferred-species routing. Two-tier substitution already supported by `bake-trees.js:pickVariant` — heroes win their category's lottery via `quality: 4` vs filler `quality: 2`.
- The Grove's single master atlas (bake-look's `unifyAtlases`) is the load-bearing innovation that makes adding heroes nearly free (sha1 dedup) and makes shader bark unification possible (collapse tiles across the entire roster, not just procedurals).
- Phase B's brief expands from "procedural-trees-only" to "**roster-wide shader unification via per-species `extras.bark` + shader patches in `treeAtlasMaterial.js`**." Vendor and procedural trees both lose their bark color tiles to the same 4×4 placeholder; the shader picks pattern + colors from material extras. Vendor normal maps stay (preserve real bark-groove geometry); only the color tiles collapse. Pipeline survives SpeedTree migration unchanged.
- Phase F becomes per-species cluster atlases (not per-morph shared); honeylocust-style sparse-cluster mode is load-bearing from day one (density / occupancy-fraction parameter in PRESETS, not a follow-on).
- Leaf editor (was v1.6 deferred) pulls forward as Phase G's enabling tool. Probably lands as Phase F.5 — author Sugar Maple's leaves first, generalize the editor surface out of that.
- Phase G splits into G.1 (Sugar Maple — dominant inventory, canonical broadleaf, strictest visual bar) → G.2 (Ginkgo — proves the leaf editor + per-species hero path on the most leaf-defined species) → G.3 (Willow — weeping algorithm at hero quality) → G.4 (Honeylocust — sparse-cluster validation) → G.5 (TBD 5th hero: Spruce/Pine for conifer slot, OR Pin Oak for second-broadleaf-character, OR Sycamore to close the existing-hand-modeled-roster loop).
- Phase E (monopodial whorl conifer) priority drops — conifer is 7% of `park_trees.json` inventory. Ship the algorithm so those 55 placements don't fall back wrong, but per-conifer-species authoring follow-on defers to v1.6 unless visual review demands otherwise.

Project goal sharpens from "complete 7 phases" to **"ship 5 hero species at Hero quality."** Same machinery, sharper acceptance criteria.



v1 ships through the pipeline but is not visually sufficient by any metric. v1.5
rebuilds in 7 phases per `cartograph/NOTES.md` 2026-05-15 maxi-brief — READ THAT
ENTRY END-TO-END BEFORE TOUCHING CODE (load-bearing per
[[feedback_notes_md_holds_architecture]]). Phases land in order, each its own
commit + acceptance + visible-bug coverage. `generateTreeMesh()` params signature
is the cross-phase contract. Foundational pipeline
(publish-glb / bake-look / bake-trees / atlas-pack) stays unmodified across all
phases.

- [x] **Phase A — Procedural mode: dice + adopt** (shipped 2026-05-15, commits `2323a78` + `f6aaf61`).
  UI iteration surface in Arborist; generator algorithm unchanged.
  `src/arborist/ProceduralWorkstage.jsx` (new) + mode toggle in
  `ArboristApp.jsx`; per-species variant slots with 🎲 dice + ✓ adopt +
  live SpecimenViewport thumbnail per slot (blob-URL'd GLB from the
  generate endpoint). Endpoints `GET /procedural/species`,
  `GET/POST /procedural/:species/seedlings`,
  `POST /procedural/generate` (returns model/gltf-binary directly),
  `POST /procedural/:species/publish?look=<id>` (shells out to
  `node arborist/generate-procedural.js --species <id>` + fires per-Look
  atlas auto-bake fire-and-forget). Generator refactored to export
  `generateSingleVariantGLB`, `readEffectiveSeedlings`, `writeSeedlings`;
  `main()` now consumes the seedlings overlay (`arborist/state/<species>/seedlings.json`,
  gitignored) and falls back to the canonical PRESETS table on fresh
  checkouts. Determinism verified: same {species, slot, seed, params} →
  byte-identical GLB; CLI `node arborist/generate-procedural.js [--species <id>]`
  still works end-to-end. **Fixes:** operator iterates new variants in
  seconds via UI; no CLI round-trip. **Doesn't fix:** trees still look
  like v1 (algorithm unchanged — Phases D/E/C/B/F/G follow).

- [x] **Phase D — SCA + tropism** (broadleaf / weeping / columnar / ornamental
  skeletons) — shipped 2026-05-15, commit `06f903e`. New `arborist/spaceColonization.js`
  (Runions 2007 SCA + tropism + envelope-as-revolution-profile + Murray's-law
  radii). Generator's `else` branch in `generateTreeMesh()` swapped from
  free-growth `growBranch` to `runSCA(envelope, sca, seedN, trunkBase, tipRadius)`
  for the 4 SCA morphologies; conifer keeps its free-growth path untouched
  (Phase E owns that). UI gains per-slot Envelope (profile dropdown +
  width/height/asymmetry/offsetYFrac sliders) + Tropism (XYZ sliders) panel,
  hidden for conifer. Debounced via `DraftSlider` (150ms idle + pointer-up).
  Seedlings GET endpoint extended with an `effective` field per variant
  (PRESETS base merged with operator overlay) so the UI binds slider
  positions to resolved values; adopt still POSTs back the overlay-only
  `{slot, seed, params}` shape.
  **Tuning notes:** offset-Y-frac added to envelope schema (load-bearing for
  weeping — without it the willow curtain has nowhere to hang); broadleaf
  variants 2-3 + weeping variant 2 had `attractorCount` reduced and
  `killRadius`/`stepLength` raised vs the brief's starter defaults to land
  in a reasonable lod0 tri budget (1.8K–19K per variant; conifer unchanged
  at ~6K).
  **Fixes:** silhouettes diverge correctly — broadleaf W/H≈1.87 (rounded
  oval), weeping W/H≈2.29 with 3.2m of branches draping below trunk top
  (recurve emerges from envelope+tropism physics, not per-gen tilt hacks),
  columnar W/H≈0.29 (narrow vertical), ornamental W/H≈1.99 (broad-low).
  Determinism preserved (same seed → byte-identical GLB).
  **Doesn't fix:** conifers (Phase E); bark/leaf shaders (B/F); geometric
  polish — branches are still plain tapered cylinders (Phase C); per-species
  tuning (G).

- [x] **Phase D.1a — Staggered scaffold emergence** — **SHIPPED 2026-05-19** (third-shift session).
  Phase C.1 §2 parented all N initial children to a single `trunkTopNode`
  → "umbrella spider." New `sca.scaffoldZoneFrac` (default 0.5 broadleaf;
  force-pinned 0 for weeping) distributes the N azimuthal seeds across
  the top portion of the SCA axial chain. Azimuths still span TAU
  uniformly so the C.1 wedge-balancing rationale survives. **Fixes:** the
  umbrella-spider topology. **Doesn't fix:** the canopy still emerges
  from one shared parent direction (no opposite phyllotaxis — D.1 below).

- [x] **Phase D.1 — Opposite phyllotaxis (Path 2 pair-spawn) + scaffold emergence-angle decoupling** — **SHIPPED 2026-05-19**.
  Two structurally-coupled changes inside `runGrowthLoop`:
  - **Pair-spawn:** when `sca.phyllotaxisMode === 'opposite'`, the spawn
    step emits TWO children per pulled node at `pullDir ± sin(θ) × pairAxis`,
    where pairAxis lies in the plane perpendicular to the parent edge,
    rotated 0°/90° per `pairDepth` parity. `spawnIncrement = 2` tightens
    the C.1b per-node child cap so pair-spawns never exceed it. Pairs
    are atomic — no silent degradation to single-child near cap.
  - **Emergence-angle decoupling:** decaying +Y bias near scaffold base
    via `sca.scaffoldEmergenceBias × exp(-pathLenFromTrunk / 1.5m)`. New
    per-node `pathLenFromTrunk` tracks each scaffold's path length from
    its seed. Produces J-shaped lower scaffolds (curve up at base,
    arch outward over the first ~1.5m).
  Defaults: broadleaf opposite + lift 0.6; weeping alternate + lift 0;
  columnar/ornamental alternate + small lift. **Fixes:** the decussate
  fishbone signature; armpit-angle scaffold reading. **Doesn't fix:**
  primary scaffolds emerging from the trunk are NOT paired with the
  trunk (they spiral-stagger per D.1a) — only canopy ramification is
  paired. Refining primary scaffolds to also pair-at-internode is a
  future D.1c if visual review demands.

- [x] **Phase D.1b — Leaf-cluster-along-shoot emission** — **SHIPPED 2026-05-19**.
  Replaces the single-leaf-card-per-tip rule with: (a) bounded spray of
  `tipCount = 5` cards in a 35 cm × 0.6-vertical-compression volume
  around each tip, plus (b) pair-distributed cards walking back along
  the parent chain for `shootLen = 0.6 m`, one on each side every
  `shootSpacing = 0.18 m`, perpendicular offset `shootJitter = 0.12 m`.
  Leaf count ~9× on broadleaf-1 (606 → 5496). Phase F's PSD-authored
  cluster atlases will land into this same emission shape — F's scope
  becomes "swap the morphology PNG" rather than "rethink the placement."
  **Fixes:** canopy reads as foliage mass, not garnish. **Doesn't fix:**
  per-species cluster authoring (Phase F); the cards are still generic
  `ovate_large` PNG for now.

- [x] **Phase D.2 — Operator-tunable deformers** — **SHIPPED 2026-05-19**.
  New `deformers` nested params group (added to `NESTED_PARAM_KEYS` +
  `DEFAULT_SCA_BY_PRESET`): `trunkWander`, `trunkWavelength`, `branchJitter`,
  `barkRelief`. Three helpers in `spaceColonization.js`:
  - `getTrunkWander(seedN, worldY, wanderOriginY, amplitude, wavelength)`
    — deterministic XZ wander curve, cosine-smoothed between control
    points, amplitude ramps in over the first metre. Consumed by both
    the visible trunk geometry (subdivide cylinder → per-vertex XZ
    displacement) AND the SCA root + axial extension + lift loop, so
    the canopy attaches to the wandered shaft cleanly.
  - `_jitterPerp` — deterministic perpendicular offset on each SCA
    branch-spawn. Wobbles spawns off the ruler-straight pull line.
  - `_jitterHash` / `_wanderHash` — `Math.sin(x) × 43758.5453` pattern,
    cheap + deterministic.
  Defaults broadleaf: 8 cm wander @ 2.0 m wavelength, 10% branch jitter,
  5% bark relief. Weeping: 10 cm @ 2.5 m, 15% jitter. **Fixes:** trunk
  reads sinuous; branches stop reading as ruler-straight. **Doesn't
  fix:** hierarchical flange scale (primary chunky, twig flush — Tier 2
  agent-report item, future polish).

- [x] **Workstage anchor + joint smoothing + extended trunk** — **SHIPPED 2026-05-19**.
  Base anchored to y=0 (was -0.25, lifting tree off floor on size
  changes). Trunk↔canopy joint: SCA runs early; trunk-top radius set
  to `Math.max(0.025, scaResult.nodes[0].radius)` matching Murray's-law
  root. Trunk↔flange joint: flare and shaft stack non-overlapping
  (flare 0→FLARE_H, shaft FLARE_H→top), both `openEnded:true` at the
  seam, noise hashed with aligned `globalH` for continuity. Visible
  trunk extends through SCA axial-extension region (`axial→axial`
  edges skipped in emission loop) — eliminates the "second narrower
  column" above the tapered shaft. Lean dropped (a leaned cone diverges
  from the straight-up axial extension; lean returns as a group
  rotation if/when desired).

- [x] **Workstage panel expansion to 20 knobs** — **SHIPPED 2026-05-19**.
  Five sections: Trunk · Envelope · Canopy · Deformers · Tropism. New
  knobs since the 7-knob Phase D baseline: DBH, Canopy Start, Scaffolds,
  Spread, Phyllotaxis, Lift, Density, Fill, Trunk wander, Wavelength,
  Branch jitter, Bark relief. Plus ↺ Reset button (clears overlay,
  persists, refetches effective). DBH required `setProceduralSlotParams`
  to handle scalar top-level patches alongside nested-object patches.

- [x] **Phyllotaxis dropdown effective-value bug fix** — **SHIPPED 2026-05-19**.
  Two-end fix:
  - Server `/procedural/:species/seedlings` `effective` payload now
    layers `DEFAULT_SCA_BY_PRESET[preset][key] → base[key] → params[key]`,
    matching the generator's runtime resolution exactly. Previously the
    DEFAULTS layer was missing → selects displayed undefined-fallback.
  - Store `setProceduralSlotParams` mirrors patches into `v.effective`
    alongside `v.params` so controlled selects reflect operator changes
    without a server round-trip. Sliders worked by accident (DraftSlider
    local draft state masked the bug); selects (Phyllotaxis, Profile)
    snapped back to stale values without this fix.

- [x] **Phase W preview (workstage wind)** — **SHIPPED 2026-05-19**, partial.
  Floating toggle + strength slider (0–2) at the viewport's bottom-left.
  `SpecimenViewport.jsx` patches each loaded GLB material via
  `onBeforeCompile`. Two-layer sway:
  - **Wood** vertices: height-falloff slow sway (`uTime × 1.5`,
    ~15 cm peak at 10 m canopy, two phase-offset sines for elliptical
    wander).
  - **Leaf** vertices: high-frequency flutter (`uTime × 8`, ~2.5 cm
    amplitude, per-vertex phase from leaf-card position so adjacent
    cards don't sync) layered on top.
  `uIsLeaf` is set per-material at patch time from
  `geometry.userData.atlasKind === 'leaf'`. `buildSourceGLB` now stamps
  `atlasKind: 'bark'|'leaf'` on each primitive's extras. Idempotent
  patch (`userData.__windPatched` gate) so re-renders don't compound.
  **Doesn't fix:** production wind (`treeAtlasMaterial.js`) — Phase W
  proper, queued as separate commit. Workstage shows wind today;
  LS Stage / Preview do not.

- [x] **Backend dev-server `--watch`** — **SHIPPED 2026-05-19**.
  `dev:cartograph`, `dev:arborist`, `dev:meteorologist` scripts now use
  `node --watch <serve>.js` (Node 22 built-in file watcher tracks the
  entry script's require graph). Generator / SCA / serve edits reload
  without manual server restart. One-time restart needed after the
  package.json change to pick up the watcher itself.

- [x] **Workstage LoD preview + perf gauge** — **SHIPPED 2026-05-19**.
  Operator's "is this tree lightweight?" question answered by a live
  meter showing what the canopy actually costs the GPU per LoD tier.
  - **Server (shipped)**: `POST /procedural/generate` accepts a `lod`
    body field (0 / 1 / 2). lod=0 returns the source GLB (current
    behaviour); lod=1 or 2 runs `simplifyGlbBytes` through
    gltf-transform's `weld → dedup → simplify` with `MeshoptSimplifier`
    at the same ratios + error tolerances `publish-glb.js` uses (lod1:
    ratio 0.40 / err 0.002, lod2: ratio 0.10 / err 0.008). Texture
    compress step skipped — preview keeps the 1K bark + leaf source so
    operator sees true geometry quality.
  - **Store (shipped)**: `previewLod` state in `ProceduralWorkstage`
    (survives slot switches); plumbed into SlotCard as
    `previewLod` + `onPreviewLodChange` props.
  - **UI (shipped 2026-05-19)**:
    - `SlotCard` destructures `previewLod` + `onPreviewLodChange`;
      `/procedural/generate` body carries `lod: previewLod`; useEffect
      deps include `previewLod` so the selector triggers a refetch.
    - LoD selector — three buttons (0 / 1 / 2) at top-right of the
      viewport, amber accent on active, disabled while loading.
    - Perf gauge — bottom-right floating panel showing tris / leaf cards
      / draw calls / programs. Read-only `<PerfProbe>` r3f child inside
      `<Canvas>` (uses `useThree()` + `useFrame()`, ~4 Hz sample) calls
      back to the parent. Tri zones green <20k / yellow 20–40k / red
      >40k at LoD0; thresholds scale ×0.5 / ×0.2 at LoD1 / LoD2 to
      mirror publish-glb's simplification ratios. Programs row turns
      red >5 as an author-time guard against shared-shader divergence.
  **Why now**: opposite-phyllotaxis + leaf-cluster-along-shoot
  combined push lod0 broadleaf-1 to ~50k tris (1600 wood cylinders
  × ~24 tris + 5500 leaf cards × 2 tris). At 745 LS placements (geom
  instanced), lod0 isn't the rendering cost — instance count drives
  the canopy fragment cost which Phase H (shell/core split + A2C)
  optimizes. But the operator needs the meter to know when their
  tuning blows past the budget.

- [x] **Phase F.0 — Leaf-cluster-along-shoot emission rule** — **SHIPPED 2026-05-19** as part of D.1b above.
  Originally the agent-recommended sequencing put this as a Phase F
  prerequisite (under "leaf-card placement geometry"), separable from
  Phase F's PSD-authored cluster atlases. Shipped early so the
  operator's tomorrow PS work attaches into a geometry that's already
  maple-shaped.

- [ ] **Phase E — Monopodial whorl** (conifer skeleton). New
  `arborist/monopodialWhorl.js`. Conifer path swaps to
  `runMonopodial(envelope, params)`. UI gains conifer panel
  (whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge).
  **Fixes:** conifers read as conifers from Browse/Hero; central leader +
  whorls + skirt droop correct. **Doesn't fix:** per-conifer-species variants
  (Spruce/Pine/Fir) need authoring, not code.

- [x] **Phase C.1b — runaway-cluster fix** — **SHIPPED 2026-05-16** (this commit, post-C.1). Resolves C.1's flagged "residual not-fixed" failure class. The failure mode was NOT a runaway chain (linear walking) as C.1's commit body framed it — it was per-node BRANCH FAN-OUT: one of the N=6 initial seeds lands in a dense attractor pocket, accumulates pulls every iter, spawns a new child every iter, each new tip inherits the pocket → 200+ tip clump 1–3 m off-axis. Three options compared via 20-seed bypass sweep (A=raise killRadius: didn't help; B=prune sparse attractors: per-seed brittle, ornamental worse; C=per-node children cap): cap-at-3 selected. Single-rule edit in `arborist/spaceColonization.js` (~6 LOC + 1 constant + ~12 lines of comment): a node with `≥ MAX_CHILDREN_PER_NODE_DEFAULT = 3` direct children stops accepting attractor pull → capped attractors flow to next-nearest tip. 20-seed sweep results: zero seeds with centroid offset > 0.5 m across all four morphologies; tip-count means collapse to single-modal (broadleaf 174 → 62, columnar 71 → 45, ornamental 80 → 52); weeping improved too (0.29 → 0.17 m centroid mean; curtain descent intact at tip-Y −2.01 m). Determinism preserved (broadleaf seed 101: 279 nodes, identical positions across two runs). `generateTreeMesh()` signature unchanged. Overridable per-preset via `sca.maxChildrenPerNode`. C.1c (cosmetic crag↔SCA radius joint at trunk top) is the next polish item.

- [x] **Phase C.1 — SCA canopy-bias fix** — **SHIPPED 2026-05-16** (this commit, post-Phase-C). Eliminates the positive-feedback bias in `runGrowthLoop` that produced per-seed asymmetric canopy lean (Phase C baby's diagnosis: tip centroid (-3.79, 7.75, 1.54) for root at (0, 4.75, 0) with no lean — ~4 m off-axis). Two structural interventions in `arborist/spaceColonization.js` only — `generateTreeMesh()` signature unchanged, no pipeline / shader / artifact touches.
  - **§1 Force axial trunk extension.** After auto-grow lift, deterministically extend the trunk straight up the central axis to `envelope.heightStart + envelope.height * branchingStartFrac` (default 0.5; weeping 0.2). Trunk-extension nodes carry `axial: true` and are skipped by attractor-pull in `runGrowthLoop` — they bear no responsibility for canopy shaping; they just paint a straight trunk into the envelope's lower-mid. Attractors near them are still killed normally so the central column clears.
  - **§2 N-child azimuthal seed.** At trunk top, seed `initialChildCount=6` children spaced evenly around `TAU`; each becomes a normal (non-axial) SCA tip from iter 1. Per-wedge attractor assignment splits cleanly. Bias on one sector is balanced by symmetric tips on opposing sectors.
  - **§3 Weeping carve-out.** `branchingStartFrac=0.2` (vs 0.5 default) keeps the trunk from piercing above the curtain zone; `seedStep = stepLength * 0.5` (vs `max(0.5*step, 0.25*width)` for others) keeps the curtain clustered for the -Y tropism to drape symmetrically. Detected by `envelope.profile==='umbrella'` OR `offsetYFrac < -0.1`.
  - **Tuning deviations from brief.** `seedStep` for non-weeping uses `max(0.5*stepLength, 0.25*envelope.width)` (≈ 1 m at LS scale) rather than the brief's fixed `0.5*stepLength` (≈ 0.2 m). At 0.2 m the 6 children clustered too tightly for iter-1 wedge-balancing to fire; the wider seed step puts each child firmly inside its 60° sector. Drops broadleaf 20-seed mean from 0.92 m to 0.87 m, columnar 0.59 → 0.32, ornamental 0.65 → 0.31 (weeping unaffected by carve-out at 0.25 m).
  - **Bypass-script verification.** 5-seed (101/202/303/404/505) bypass with trunkBase=(0, 4.75, 0), canopyR=4, canopyH=8:
    - broadleaf  mean 0.604 m, max 2.273 m (4/5 seeds < 0.25 m; one runaway-chain seed at 2.27 m)
    - columnar   mean 0.207 m, max 0.282 m (5/5 seeds < 0.30 m)
    - ornamental mean 0.317 m, max 1.087 m (4/5 seeds < 0.20 m; one runaway at 1.09 m)
    - weeping    mean 0.249 m, max 0.736 m (4/5 seeds < 0.26 m; one at 0.74 m — still drapes symmetrically per axial-y centroid)
    - vs baseline ~4 m always-asymmetric: median improvement ~10–20×, mean improvement ~5–15×.
  - **Residual not-fixed (flagged, separate failure class from the brief's original bias).** ~5–35% of seeds per non-weeping morphology in a 20-seed sweep still produce 1–3 m XZ offsets, but the failure mode is now "runaway chain" not "initial-tip bias": those seeds have tip counts 4× higher (~250 vs ~60) because attractor-kill barely keeps up with N=6 expansion when the rejection-sampled attractor cloud has isolated outlier pockets. The remaining tips chase those outliers 1 step per iter (stepLength=0.4 m vs killRadius=1 m → 7-8 iter chase) and chain off-axis. **Fix is not C.1 scope** — would require either capping per-tip chain length, raising killRadius, or pruning outlier attractors. Visual review (broadleaf seeds 749/1391/1819 etc) will decide whether to tune in a follow-on. Median seed canopy is well-centred which is the dominant visual.
  - **Tri-count delta.** Force-extension adds ~10 axial trunk segments (~0.5 × canopyH / stepLength) before SCA-cylinder emission. With `PHASE_C_RADIAL_SEGS=12` and 6 tris/seg, ≈ 720 tris/tree at lod0. Within the C-shipped lod0 envelope.
  - **Conifer untouched.** Conifer path (`runMonopodial`) doesn't call `runSCA`; bias-fix is structurally outside conifer code.
  - **Determinism preserved.** All randomness still via `mulberry32` seed stream; same seedN + params → byte-identical attractor cloud + byte-identical node graph + byte-identical GLB.
  - **C.2 next.** Post-merge normal computation to seal SCA-edge facet flips (Phase C's flagged "not-fixed" item).

- [x] **Phase C — Geometric polish on correct skeletons** — **SHIPPED 2026-05-16 EOD** (this commit). All five primitives landed in `arborist/generate-procedural.js`: `nonLinearTaper(exp=2)` for makeBranch per-segment radii; `PHASE_C_RADIAL_SEGS=12` flat across every cylinder emitter; `applyRadialNoise(scale=0.05)` in LOCAL frame, gated `r > 0.05`, branch-global-H parameterized so makeBranch's per-segment chain is seam-continuous; `makeFlangeRing` at every recursive growBranch root + at children of true SCA branching nodes (NOT every SCA edge); root flare cylinder + 6 subtle buttress fins (~8 tris each) replacing the prior flat-flare block. lod0 tri counts grew ~80–115% (broadleaf-3 41.5K, weeping-2 32.6K pierce the brief's 30K advisory — flagged in NOTES; VRAM at LS dominated by atlas not source GLBs). lod1/lod2 grow proportionally because publish-glb's `simplify` runs against the single source. Determinism preserved (sha1 stable across re-publish). Zero shader / pipeline touches; single shader program preserved. **SCA-edge noise seam continuity flagged** as not-fixed (faint per-edge facet flips at Hero close-up; fix is post-merge normal computation, deferred).
  **Fixes:** branches taper realistically; joints buttress smoothly at branching events; trunks look planted via root flare + subtle buttress fins; close-up Hero substrate is non-trivial enough that bark photo wraps stop showing the obvious tapered-cylinder-stretch artifact (the load-bearing acceptance — Phase C exists to unblock the bark visual ceiling per the 2026-05-16 skeleton-first reassertion).
  **Doesn't fix:** SCA-edge noise seam continuity (faint per-edge facet flips at Hero close-up); foliage still sparse (Phase F); per-species hero tuning (G). Phase B.1.a's bark wrap-line crawl is unchanged — Phase C changes the substrate the shader wraps onto, not the shader itself.

- [x] **Phase B (core) — Photo-PBR bark + retint shader infra** (shipped 2026-05-15).
  Scope pivoted post-orchestrator-conversation: the GLSL pattern-library
  approach was DROPPED (no faith we could ship 5 convincing procedural bark
  patterns at the visual bar). Phase B core lands as: 5 CC0 photo-PBR
  tileable bark materials under `public/textures/bark/<materialRef>/`
  (color + normal + roughness JPGs); `arborist/generate-procedural.js`
  binds each procedural species to a `materialRef` via PRESETS and embeds
  the photo bytes as `baseColorTexture` + `normalTexture` on the bark
  material; sha1 dedup in `atlas-survey.js` already collapses repeated
  refs to one tile (load-bearing for when G.1–G.5 heroes pile onto the
  same materialRefs as their fillers). Per-species `bark` spec stamps onto
  `manifest.json`; `bake-look.js` surfaces `barkBySpecies` into
  `trees-atlas.json`. Runtime: 3 new uniforms on the shared tree material
  (`uBarkTintBase`, `uBarkTintJitterRange`, `uBarkRoughnessOverride`);
  fragment shader patches at `<map_fragment>` + `<roughnessmap_fragment>`,
  gated by per-vertex `aBark` attribute baked at runtime merge time in
  `InstancedTrees` (from per-primitive `atlasKind: 'bark'/'leaf'` that
  `bake-look.js` now writes — was previously the constant `'unified'`).
  `onBeforeRender` per submesh mutates uniforms per-(species, draw call)
  so single shader program is preserved (Bloom-stable). Per-Look palette
  override: `scene.materialColors[<species>]` wins over species default
  `tintBase` at the manifest-effective level, no rebake required. Phase B
  pipeline survives SpeedTree migration unchanged.
  **Fixes:** bark looks like photo bark (not 32×32 noisy brown); per-(species,
  Look, instance) retint via uniforms; atlas dedup path proven (no firing
  on the 5 fillers since each picks a unique materialRef, but ready to
  collapse when hero species share refs with fillers per G.1–G.5).
  **Doesn't fix:** UV tiling on long branches (entire 1K tile stretches
  across a 12m tree; tighter tiling is a follow-on); Workstage Bark panel
  authoring (Phase B.1); Stage debug overlay (Phase B.1); UV-scale shader
  uniform (only the manifest spec field exists today).
- [x] **Phase B.1.a — UV-scale wiring** (shipped 2026-05-15). 3 new uniforms
  (`uBarkUVScale`, `uBarkTileOffset`, `uBarkTileScale`) on the shared tree
  material, set per-draw in `applyBarkUniforms` from each species's
  manifest bark spec + the atlas tile's `uvTransform`. Fragment shader
  replaces the entire `<map_fragment>` chunk to compute a wrap-within-
  tile-bounds UV before the texture sample: `localUV = fract((vMapUv -
  tileOffset) / tileScale * uvScale); mapUV = localUV * tileScale +
  tileOffset`. Gated by `vBark > 0.5 && uvScale != (1,1)` so leaves and
  species with identity uvScale pass through unchanged. Per-species
  uvScale starter values: broadleaf [1.5, 4], conifer [1, 3], ornamental
  [1.5, 3], columnar [1, 4], weeping [1.5, 2]. **B-core bug fixed in
  passing:** GLTFLoader assigns primitive extras to `geometry.userData`
  (not `mesh.userData` — see three's GLTFLoader.js:4649); B-core's
  `o.userData.atlasKind` lookup was silently always undefined, so every
  vert got `aBark = 0` and the entire retint path never fired. B.1.a's
  UV-wrap path also rides the gate, so the fix is load-bearing here.
  Lookup now prefers `geometry.userData.atlasKind` with legacy fallbacks.
  Single shader program preserved. Determinism preserved (uvScale is
  runtime, not baked). Deviation flagged: brief specified per-vertex
  attributes for tileOffset/Scale; switched to per-draw uniforms because
  per-vertex would have been ~30 MB of VBO at LS scale for effectively
  per-primitive-constant data, and uniforms align with the
  applyBarkUniforms pattern B-core established.
- [ ] **Phase B.1.b — Workstage Bark panel** (deferred from B.1, now
  indefinitely-deferred per 2026-05-16 EOD doctrine pivot). The bark
  visual-quality ceiling at v1.5 is geometric (Phase C unblocks it),
  not authoring-UI-bound. Bark authoring iteration via Workstage panel
  would just rearrange smooth-cylinder pain. Revisit after Phase C
  ships and per-species bark tuning becomes worthwhile.
- [ ] **Phase B.1.c — Stage debug overlay** (deferred from B.1, now
  indefinitely-deferred per same rationale as B.1.b). Acceptance criteria
  5/6/7 from the original Phase B brief (WebGLProgram count, Bloom
  flicker, per-instance jitter visual) close mechanically with a debug
  overlay; the infra is structurally correct (single material → single
  program per Bloom constraint; aBark per-vertex gates retint per
  B.1.a's load-bearing fix; world-XZ hash drives per-tree jitter). The
  overlay is operator-confidence tooling, not architectural validation.
  Revisit if a visual regression suspected.
- [ ] **Phase B.2 — Proper bark tile wrap** (deferred). Phase B.1.a's
  `fract`-inside-atlas approach has unavoidable derivative discontinuity
  at wrap lines → narrow blurry stripes that "crawl" at close-up Hero.
  Polish attempts via `textureGrad` (`e77278e`) and 4×→16× anisotropy
  bump (`94519db`) reverted as no-ops (`d50dd7b`); pre-tile-at-source
  v2 (`fd187d7`) reverted in v3 (`54355a4`). Proper fixes: (1) WebGL2
  texture arrays — one atlas layer per `materialRef` with `GL_REPEAT`;
  hardware tiling/mipmap/aniso; single shader program preserved via
  layer-index uniform. (2) Pre-tile in atlas at bake time — bake-look
  composites N×M-tiled version of source into atlas tile; shader samples
  directly. Atlas footprint grows N×M for bark. (3) Separate textures
  per species — breaks Bloom's single-program constraint, not viable.
  All three are pipeline changes; defer until Phase C lands and bark
  quality re-evaluation says the wrap-line crawl is the next constraint.

- [ ] **Phase F — Vendor-PBR leaf-pack binding + complex gradient-map tint + front/back shimmer + sparse occupancy** (scope reframed AGAIN 2026-05-19 — operator-authoring step DROPPED).

  **Architecture pivot 2 (2026-05-19 afternoon):** the per-species PSD-authoring step from earlier today is **DROPPED.** The `assets/botanical-reference-hires/` trove contains 10 vendor 4K PBR leaf packs (Color + Opacity + NormalGL + Displacement + Roughness + AO per pack), pre-tagged by morphology in the README — covers ~80%+ of LS inventory including 3 of the 5 planned heroes (G.1 Sugar Maple via LeafSet010, G.3 Willow via LeafSet013, plus oak coverage via LeafSet016). The vendor packs ARE the shape library. Operator authoring collapses to **configuration only**: pick a pack from the library, tune the gradient ramps, bind via manifest. No PSD round-trip unless a hero needs a morphology not in the vendor library (G.2 Ginkgo, G.4 Honeylocust — fan + fine_compound morphologies still need sourcing per README).

  **Architecture pivot 1 (2026-05-19 morning, kept):** the per-species color-PSD doctrine from 2026-05-16 EOD generalizes to the bark-shader-unification pattern (Phase B): leaf cluster atlas tiles are **shape-defining greyscale** (alpha + luminance + normal + optional displacement) — color is delivered at runtime via per-species per-season **complex N-stop gradient-map LUT textures** sampled by the leaf-luminance value in the fragment shader. Per-species shape granularity preserved (Sugar Maple, Red Maple, Norway Maple all carry their own shape pack via the vendor library — silhouette is how operators tell species apart). The atlas-savings claim from the initial pitch was overstated and corrected: heroes carry their own shape tiles; the win is in COLOR FLEXIBILITY (per-Look palette overrides, per-season ramp swaps, front/back tinting for maple-style shimmer), not atlas footprint.

  **Inputs (no operator authoring; configuration only):**
  - **Shape pack** — bind to one of the 10 vendor packs at `assets/botanical-reference-hires/LeafSet0xx/`. Pack provides: Color (desaturated → luminance, used as gradient-map t-value), Opacity (alpha gate), NormalGL (per-leaf surface lighting), Displacement (optional bevel — defer use to v1.6 unless visible at Hero). Bake-look reads vendor pack directly; no copy / no PSD step. Heroes that need a morphology not in the vendor library are the only PSD-authoring cases — currently G.2 Ginkgo (fan) and G.4 Honeylocust (fine_compound).
  - Per-species manifest carries `leafCluster.shapeRef` + per-season multi-stop gradient specs:
    ```json
    "leafCluster": {
      "shapeRef": "palmate_acer_saccharum",
      "occupancy": 0.7,
      "tintFront": {
        "summer": [{"t": 0, "color": "#2a5825"}, {"t": 0.5, "color": "#3a7530"}, {"t": 1, "color": "#5a9850"}],
        "fall":   [{"t": 0, "color": "#882010"}, {"t": 0.3, "color": "#c84015"}, {"t": 0.6, "color": "#e87020"}, {"t": 1, "color": "#f8b830"}]
      },
      "tintBack": {
        "summer": [{"t": 0, "color": "#a8b89a"}, {"t": 1, "color": "#c8d8c0"}],
        "fall":   [{"t": 0, "color": "#a85020"}, {"t": 1, "color": "#d8a060"}]
      }
    }
    ```
    Gradient stops support arbitrary count (Sugar Maple fall = green → yellow → orange → red on one leaf via 4-stop ramp; summer = simpler 2-stop). Tint complexity per Jacob 2026-05-19 — heavy film grade + Bloom in the LS render smooths any duotone-flatness that simpler ramps would show.

  **Runtime shader (extends Phase B bark-unification pattern):**
  - Greyscale shape tile sampled with normal three.js material chain (Color → luminance via `dot(color.rgb, vec3(0.299, 0.587, 0.114))` or just `color.r` if pre-desaturated at bake time).
  - Per-species manifest gradient specs baked at runtime into a 256×1 1D LUT RGBA texture per (species, season, side) — 4 LUTs per hero (front-summer / front-fall / back-summer / back-fall). Bake step lives in `bake-look.js` alongside atlas pack; cached by manifest hash so no per-frame cost.
  - Fragment shader: `vec3 leafTint = gl_FrontFacing ? texture(uLeafLutFront, vec2(luminance, 0.5)).rgb : texture(uLeafLutBack, vec2(luminance, 0.5)).rgb;` Single shader program preserved (Bloom-stable, [[feedback_unique_program_cache_key_before_wrappers]]). `gl_FrontFacing` is free for DoubleSide materials — front/back shimmer emerges from Phase W's card flutter without additional cost.
  - Per-Look palette override rides `scene.materialColors[<species>].leafTint*` channels — same retint-at-runtime mechanism Phase B established for bark. Halloween Look = orange-black gradient; Valentine's Look = pink; instant retint, no rebake.

  **Workstage Leaf panel:**
  - Shape picker (dropdown of available `shapes/*` entries; thumbnails).
  - Gradient-stop editor per side per season (drag-handles on a horizontal ramp UI; click to add stops, color-picker per stop).
  - Occupancy slider (alpha-density modulator).
  - Sparse-cluster mode still load-bearing for honeylocust ~25% / oak ~70% / conifer ~95%.

  **Fixes:** species silhouette preserved (per-species shape PSDs); maple shimmer achievable (front/back tint via `gl_FrontFacing`); fall color complexity authored as multi-stop gradients (Sugar Maple's green-yellow-orange-red on one leaf); per-Look palette overrides instant (no rebake); single shader program preserved.
  **Doesn't fix:** per-species shape PSD authoring still needed for each new hero (substitution-fallback covers the rest); displacement-map bevel relief deferred to v1.6 unless visible at LS Hero distance; gradient-editor UI is meaningful new surface in workstage (separate sub-brief candidate).

  **Why this is structurally right (vs the original color-PSD plan):**
  - Front/back shimmer is impossible with a single full-color leaf PSD (would require two textures + mirror-aware UVs). Trivial with gradient maps.
  - Per-Look color retinting becomes a runtime uniform swap, no rebake.
  - Per-season variants are gradient-spec JSON, not separate PNGs.
  - Reuses the LeafSet packs natively — they already ship Color + NormalGL + Opacity + Displacement, which is exactly the pipeline.
  - Standard high-end foliage material pattern (Unreal foliage, SpeedTree, Unity HDRP all use this); not a hack.

- [ ] **Phase F follow-up — Filler-tier vendor-pack binding** (surfaced 2026-05-19 with Phase F architecture pivot 2). Today's 5 procedural fillers (broadleaf / conifer / ornamental / columnar / weeping) reference stub `public/textures/leaves/<morph>.png` files; pointing them at the appropriate vendor packs from `assets/botanical-reference-hires/` gives **every filler tree in LS** vendor-quality 4K leaves overnight. One-line manifest change per filler. Massive visual upgrade on the bottom tier of two-tier substitution. Probably 5 lines of code total. Lands as follow-up after Phase F shader infrastructure ships and proves out on G.1 hero.

- [ ] **Morphology → vendor-pack mapping table** (surfaced 2026-05-19, BACKLOG/ARCHITECTURE-doc task). Canonical reference for which vendor pack covers which morphology + which LS inventory species. Lives in ARCHITECTURE.md (probably under a new "Leaf shape library" subsection) once Phase F lands. Pre-stage table from the 2026-05-19 walk-the-leaftrove conversation:

  | Vendor pack | Morphology | LS species coverage |
  |---|---|---|
  | LeafSet010 | palmate | all maples (178 placements) + sycamore |
  | LeafSet016 | lobed | all oaks (~80 placements estimated) |
  | LeafSet004 | heart | redbud, lilac |
  | LeafSet001 | serrate ovate | elm, hornbeam |
  | LeafSet005 | ovate composition | mulberry, dogwood, hydrangea, generic broadleaves |
  | LeafSet013 | lanceolate | willow (3 placements) |
  | LeafSet019 | long_needle | pine, larch |
  | Leaf001 | ovate_large single | broadleaf filler fallback |
  | LeafSet007 | elm autumn | seasonal elm |
  | LeafSet012 | oak autumn | seasonal oak |

  **Coverage gaps** (need new vendor sourcing or operator PSD authoring):
  fan (Ginkgo — G.2 blocker), fine_compound (Honeylocust — G.4 blocker),
  palmate_compound (Buckeye), tulip (Tuliptree), short_needle (Spruce/Holly),
  scale (Juniper/Cypress), compound (Ash/Walnut).

- [ ] ~~**Phase F.5 — Leaf editor** (parametric leaf generator)~~ — **KILLED 2026-05-16 EOD.**
  Parametric per-species leaf authoring (lobe count / depth / serration /
  venation density → generated PNG) was pulled forward from v1.6 as G.1's
  enabling tool. **Obviated by PS-authoring per the Phase F reframe above.**
  For 5 heroes, hand-authoring in Photoshop produces better species
  character at less engineering cost. May return at v1.6+ if the
  PSD-authoring workflow itself becomes the bottleneck for scaling to
  60 species; until then, the kill stands.

- [x] **Phase G.0 — Architecture dropdown + `strong-leader` SCA mode** — **SHIPPED 2026-05-19**. Third structural SCA mode alongside `spreading` (current) and `monopodial` (Phase E future). `strong-leader` produces Rauh's botanical architecture: axial trunk threads through the crown to `leaderStrength × envelope.height`; N lateral scaffolds attach at distributed Ys along the chain (between `branchingStartFrac` and 0.9 of envelope height); each scaffold seed carries a `localTropism = [0, leaderStrength × 0.4, 0]` that propagates to every descendant (sustained per-scaffold +Y bias, not the base-decay `scaffoldEmergenceBias`). When `leaderStrength < 0.95`, a single apical SCA tip seeds at the topmost axial node so the upper envelope still gets a normal spreading-mode top. `runGrowthLoop` sums `localTropism` with global `tropism` in the pull-direction step. 21st knob in the Canopy panel: Architecture dropdown + conditional Leader strength slider. Defaults broadleaf / broad / columnar → strong-leader; weeping / ornamental → spreading. Spread + Lift sliders hidden in strong-leader mode. Determinism preserved (same {species, slot, seed, params, architecture} → byte-identical GLB). See `ARCHITECTURE.md` "Three architecture modes" + `NOTES.md` 2026-05-19 G.0 entry. **Fixes:** Sugar Maple, ash, basswood, hornbeam, young pin oak now achievable. **Doesn't fix:** G.1 hero PRESETS row + leaf cluster authoring (separate brief; that's G.1 proper).

- [ ] **Phase G.1 — Sugar Maple proving pass.** With full stack landed (incl. Phase G.0 architecture mode), tune
  Sugar Maple specifically until it reads convincingly at Hero. Register as a new species id
  `acer_saccharum_procedural` (per [[feedback_procedural_trees_are_the_destination]] — heroes ship procedural,
  vendor `acer_saccharum` stays in the roster as untouched-quality-0 historical / fallback). Hero seedlings get
  **committed to source**, not gitignored — the working seedlings.json (or PRESETS table row, design call at
  landing time) IS the canonical truth for `acer_saccharum_procedural`. Three promotion-mechanism shapes to
  evaluate when this brief gets written: (1) PRESETS row in JS source with full per-variant param specs;
  (2) committed seedlings.json + `.gitignore` exception (`!arborist/state/acer_saccharum_procedural/`); (3) new
  `arborist/heroes/<hero_id>/` directory outside the existing state/ tree. Lean (2) since it minimizes pipeline
  divergence from the operator-iteration channel.
  Tuning targets (subject to revision once G.0 lands and we see strong-leader output):
  Architecture: strong-leader. Envelope: tall oval ~7m × 12m (W:H ≈ 0.6, NOT the original 12×20 spec — that
  was for an open-grown heritage tree; LS context is street-tree scale). Tropism: zero. Phyllotaxis: opposite.
  Attractor count: ~600. Leader strength: 0.9–1.0. Bark: Bark007, furrowed, tintBase `#3a2820`, tintJitter
  `#6a5040`. Leaf cluster: maple-shaped PSD (operator authoring, references one of the
  `assets/botanical-reference-hires/LeafSet0xx/` packs for venation + opacity reference). Tint ramp summer
  `#2a5825→#3a7530`, fall `#a85020→#d4801f`. Document tuned params in NOTES.
  **Fixes:** dominant inventory species (~61 park trees) ships at quality 4 (hero). Reference implementation
  for the procedural-hero workflow. Establishes the rhythm to template to G.2–G.5.
  **Doesn't fix:** other 60+ inventory species still need per-species tuning (G.2–G.5 + iteration cycles per
  species via the rhythm G.1 establishes).

**Variants strategy:** ~3 baked variants per species; runtime per-instance
jitter (Y-rotation, independent XZ + Y scale, hue shift, wind phase) does the
diversity work. 3 variants × strong jitter = looks like 30 distinct trees in
scene. Operator can adopt more or fewer per species as needed.

#### Perf phases surfaced 2026-05-15 EOD (parked for post-Phase-F sequencing)

- [ ] **Phase W — Wind animation shader** (load-bearing for Browse perceptual goal).
  Per-leaf-card vertex displacement via `noise(worldPos + uTime + treePhase)` in
  `src/components/treeAtlasMaterial.js`. Per-tree phase offset via `treeId` hash
  so trees don't sync; height-based falloff so leaf-anchor vertices stay put;
  noise frequency tuned so leaves flutter fast / branches sway slow. Single
  uniform feed (`uWindStrength`, possibly `uWindDirection`) per Look. Same
  shader program — uniform-driven, Bloom-stable. Lands alongside or after
  Phase F (same vertex pipeline; leaf cards are what get displaced).
  **Ownership question:** wind authoring (direction + speed per Look) probably
  belongs to Meteorologist (`/cartograph.html` Stage → Sky & Light), which
  already owns weather state. Phase W is then just the *consumer* side —
  trees subscribe to wind uniforms that Meteorologist publishes per Look.
  Defer ownership decision until W's brief gets written; the consumer-side
  vertex shader work is the same either way.
  **Why now in BACKLOG:** "trees must blow in Browse" is a hard requirement
  surfaced 2026-05-15 (little-alive-neighborhood perceptual goal). Without
  wind, the 600+ Browse trees read as a frozen model not a living place.
  This kills the imposter-primary perf path (static imposters can't be made
  to flutter convincingly at scale) — full mesh + vertex-displaced cards is
  the only path that preserves animated foliage from directly overhead.
  **Fixes:** Browse canopy reads alive. **Doesn't fix:** trunk lean / branch
  sway (canopy is the dominant Browse motion; that's enough for v1.5).

- [x] **Phase L Cycle 1 — LiDAR workspace + extraction tuning** — **SHIPPED 2026-05-19**.
  New `src/arborist/LidarWorkstage.jsx` mounted as a third top-level mode in
  `ArboristApp.jsx` alongside Procedural + Grove (toggle via library header
  `[LiDAR →]` button; store flag `lidarOpen`). Four panels: specimen
  browser (left top, filter + height-desc sort + display-name affordance),
  3D viewport (right top, multi-layer `THREE.Points` + per-region color-coded
  `InstancedMesh` cylinders + layer toggles + fit button), skeleton
  extraction (left bottom, three `DraftSlider`s + Re-extract + Save seedling),
  statistics (right bottom, points / cylinders / trunk-vs-branch / est lod0
  tris / tips / median radius / server-ms).
  - **Backend refactor:** `arborist/lidar_extract.py` lifts `load_pointcloud`
    / `voxel_downsample` / `cluster_slab` / `extract_skeleton` /
    `specimen_laz_path` out of `bake-tree.py` so the new
    `POST /lidar/specimen/:treeId/extract` endpoint can drive the same
    extraction without writing GLBs. `bake-tree.py` imports the four helpers.
    Algorithm unchanged from the 2026-04-27 monolith. CLI:
    `.venv/bin/python lidar_extract.py --treeId=<id> --voxelSize=... --minRadius=... --tipRadius=...`
    emits `{nodes: [{x,y,z,radius,parentIdx}, ...], stats: {...}}` on stdout.
  - **Pre-flight repair:** `bake-tree.py` `KeyError: 'sourceFile'` on both
    starred Sugar Maple seedlings; cause was schema drift (serve.js POST
    seedlings doesn't accept / persist `sourceFile`; bake-tree.py looked it
    up from the seedling dict in two places). Both callsites now fall back
    to `botanica/dev/<treeId>.laz` derivation — same rule serve.js's
    `specimenLazPath` uses. Re-verified: both seedlings bake clean in 4.0s
    on `acer_saccharum`.
  - **Endpoints:** `POST /lidar/specimen/:treeId/extract` (body
    `{species, voxelSize, minRadius, tipRadius}`); `GET
    /lidar/specimen/:treeId/seedling-state?species=<id>` (returns saved
    tune params + displayName, falls back to `config.tuneDefaults`);
    extended `POST /species/:id/seedlings` to merge a `displayNames` map
    onto disk preserving keys absent from the incoming body (per
    [[feedback_absence_means_inherit_in_authored_blocks]]).
  - **Header strip:** mode toggle + active-species dropdown (filtered to
    `source === 'lidar'` species) + auto-suggested leaf pack readout from
    `arborist/leaf-pack-bindings.json` (`speciesOverrides[id]` wins → else
    `shapeToMorphology[leafMorph]` → first candidate in `morphologyToPacks`).
    Cycle 1 INFORMATIONAL ONLY — bake-look.js binding lives in Cycle 2.
  - **Display-name affordance:** inline text input on the active specimen's
    details subsection in the extraction tuner. Save persists into
    `seedlings.json#displayNames[treeId]`. List rows show display name
    when set, fall back to `tree <treeId>`.
  - **Performance:** desktop-class workstage — single specimen at a time;
    raw point clouds rendered as `THREE.Points` with `BufferGeometry` +
    size-attenuated `PointsMaterial` (1M+ point clouds streamed via the
    existing cached `/specimens/:treeId/preview.ply` endpoint). Cylinder
    overlay via two `InstancedMesh` draws (trunk-like vs branch-like, split
    at `medianRadius`). Bake step still handles knockdown to mobile budget.
  **Fixes:** operator can iterate extraction params live; the same
  `seedlings.json` Cycle 2 bakes from is what the workstage edits; pre-flight
  baking-path repaired so Cycle 2 can build on a green bake.
  **Doesn't fix:** Cycle 2 owns per-region bark binding to manifest +
  Configuration D canopy composition + bake/publish to roster. Cycle 1
  cylinder color-coding is preview-only; it doesn't yet write a
  `bark.regionThreshold` into manifests.

- [x] **Phase N.0 — Alignment Oracle + frame convention** (SHIPPED 2026-05-19 night, commit `9a353fa`, Baby Cedar; follow-ups `182bd54` + `2b10513`). Three persistent overlay layers in LidarWorkstage (point cloud / QSM cylinders / baked GLB) + per-layer opacity + toggles. Frame convention ratified end-to-end: baked GLB ships Y-up at rest; runtime adds no rotation; source-frame overlays apply Z→Y at load. Load-bearing regression-catch surface for all future bake-pipeline work.

- [x] **Phase N.1 — Bidirectional Strategy A spike** (SHIPPED 2026-05-20 early hours, commit `c9bf5df`, Baby Hawthorn). `arborist/bidirectional_skeleton.py` — multi-view tip detection + weighted-PCA trunk axis + Gaussian-smoothed voxelized density field + density-weighted KNN graph + Dijkstra + predecessor walk. 5 specimens converged <3s, deterministic. Operator-visual gate: topologically cleaner than QSM, but "hardly closer to being a tree." Cleaner extraction from messy LiDAR doesn't produce tree-like geometry. Spike concluded at boundary; Phase N redirected (below).

- [ ] **Phase N.2 — Neuronal backward-forward pipe-model growth** (NEW 2026-05-20, redirect from Phase N.1). Specialist baby (neurobiology / point-cloud-generation domain framing). Trace tip→ground paths (backward), then walk ground→tips accumulating cross-section from path-bundle density (forward). Pipe-model / Murray's law emerges from path counting; no radius heuristic; branching geometry exact. Same algorithm extracts AND generates (LiDAR teaches per-species noise distributions; generation samples + grows). Brief in planning.

- [ ] **Phase G.1 — Sugar Maple procedural hero (runway)** (NEW 2026-05-20; brief at `scratch/phase-g1-sugar-maple-procedural-runway-brief.md`). Procedural-only Sugar Maple hero for v1.5 ship. 4 stages: G.1.0 hand-grounded PRESETS from 3–5 LiDAR specimens (no scripts); G.1.1 Phase F leaf pack binding verification; G.1.2 operator dice/adopt iteration; G.1.3 full bake + /cartograph validation. ~3 days. Independent of Phase N research arc.

- [ ] **Phase T — LiDAR statistical scalar training** (FALLBACK 2026-05-20; supersedes Phase L Cycle 2 Stages 2-3 per [[project_lidar_as_training_data]]; demoted to fallback if Phase N.2 neuronal-specialist work doesn't pop). Per-species statistical extraction from LiDAR specimens (DBH, height, W:H ratio, branching density, mean branch angles, leader strength, architecture classification, per-anchor canopy density). Aggregate across N specimens → mean + variance JSON at `arborist/state/<species>/lidar-stats.json` (committed). `generate-procedural.js` reads lidar-stats.json if present to compute PRESETS defaults; per-instance jitter samples from variance. Operator workflow: browse + validate specimens in LidarWorkstage (Cycle 1 ships this) → mark training set → run extraction script → procedural PRESETS auto-update. Result: botanically-accurate procedural species, statistically derived from real specimens, no runtime LiDAR cost. **Why this exists:** Phase L Cycle 2 Stage 1 (commit `12ef2a1`) shipped LiDAR-runtime per-region bark + bake-to-roster. On visual review the QSM cylinder mesh reads as fragmented + abstract — uglier than parametric procedural cylinders. The trunk-authenticity premise didn't materialize. Procedural is the destination; LiDAR data is leveraged as authoring-time training source instead. Held in reserve pending Phase N.2 outcome.

- [~] **Phase L Cycle 2 — bake/publish + Configuration D composition** (Stage 1 SHIPPED 2026-05-19 PM; Stages 2-3 SUPERSEDED 2026-05-19 evening per Phase T pivot, see above). Builds on Cycle 1 workspace.
  - **Stage 1 (SHIPPED 2026-05-19 PM):** per-region bark + bake-to-roster.
    Carrier: primitive split — `bake-tree.py` emits `trimesh.Scene` with
    `trunkBark` (cylinder radius ≥ regionThreshold, 8 radial sections) +
    `branchBark` (< threshold, 6 sections) named geometries; threshold
    defaults to median of all surviving cylinder radii, persisted to
    seedlings.json tuneParams for deterministic re-bake. Hero-species
    routing via `species-map.json#/<scan>.heroSpecies` → bake output lands
    at `public/trees/<heroSpecies>/`. New `arborist/lidar-publish.js`
    bridges to the LOD pipeline (weld → dedup → simplify at the same
    ratios as `publish-glb.js`), attaches per-region bark photo packs as
    baseColor + normal textures so `atlas-survey.js` doesn't skip the
    materials, promotes the manifest schema to procedural-compatible
    shape (skeletons block, qualityOverride, category), and rebuilds
    `public/trees/index.json` via `build-index.js#rebuildIndex`.
    `bake-look.js` reads `mesh.getName()` to stamp `extras.barkRegion`
    on each primitive. New runtime uniforms in `treeAtlasMaterial.js`:
    `uBarkRegionSplit` (0=legacy, 1=region) + per-region tint/jitter/
    roughness. `InstancedTrees.jsx` stamps per-vertex `aBarkRegion`
    from `geometry.userData.barkRegion`. `applyBarkUniforms` handles
    both region-split and legacy-single-spec shapes by sniffing
    `barkSettings.trunk||.branch`. New `POST /lidar/specimen/:treeId/publish`
    endpoint (awaited, not fire-and-forget): persists seedling → runs
    bake-tree.py → lidar-publish.js → adds hero to active Look's
    `design.json#/trees` → runs bake-look → runs bake-trees. New
    `lidarPublishing` flag + `publishLidarSpecimen` action on the
    store; new Publish button in the extraction tuner. Park species
    map prepended `acer_saccharum_procedural` to "Maple, Sugar". One
    scope-drift fix: `bake-trees.js:pickVariant` now restricts the
    hash lottery to the top-quality tier among preferred-list
    candidates (heroes win their bucket per ARCHITECTURE.md "Two-tier
    substitution" doctrine, which previously didn't match shipped
    behavior). Determinism: same `{treeId, tuneParams}` → byte-identical
    `skeleton-N-lod{0,1,2}.glb` sha1 across re-publishes. Operator-gated
    acceptance items 4/5/6 (placement count visible at /cartograph,
    trunk-vs-branch readable at Hero, renderer.info.programs.length
    unchanged) pending visual verification.
  - **Stage 2 (pending):** Configuration D canopy composition — outer-shell
    A2C cards on camera-facing surface (~1500/tree, ~70% reduction) +
    inner-mass `THREE.Points` algorithmic canopy-volume sampling, ≤2
    shader programs (second program is the inner-mass PointsMaterial,
    load-bearing per [[project_configuration_d_canopy_render]]).
  - **Stage 3 (pending):** Phase F integration — `leafCluster.annualCycle[]`
    in manifest, gradient-LUT bake, annual-cycle anchor editor in the
    workstage, per-Look shape-pack + gradient overrides,
    `useArboristStore.previewDayOfYear` placeholder that Meteorologist
    will eventually feed.
  - **Cycle 2 sub-item: quality-bracket LoD authoring** (surfaced 2026-05-19 standby). Instead of exposing voxelSize/detailLevel/tipRadius as three independent sliders, operator declares INTENT via a quality bracket widget: `[min acceptable cylinder count, max useful cylinder count]`. The bake pipeline distributes LoD tiers within that bracket (lod0 = max, lod2 = min, lod1 = midpoint). Underlying mechanism stays the same — graph pruning on the QSM cylinder graph (per-cylinder importance score: keep trunk + primary scaffolds; drop terminal twigs below order-N) followed by publish-glb's mesh simplification on top. Operator never has to know voxel sizes or cylinder thresholds; thinks in quality terms. Lives in the Phase L Cycle 2 bake/publish panel. Probably collapses voxelSize/minRadius/tipRadius into a single "extraction defaults" subsection (advanced) + the bracket widget as the primary surface.

- [ ] **Phase V — View-aware baking** (architectural addition, surfaced 2026-05-19, v1.6+ unless mobile perf forces sooner). **Different views need different artifacts.** Browse-overhead doesn't need cylinders for the trunk (invisible from above); Hero needs full silhouette + bark wraps + canopy mass; Street (v2) needs close-up bark + per-leaf detail. publish-glb today produces 3 LoD tiers from ONE source — view-aware baking produces N views × M LoD tiers, each view optimized differently BEFORE LoD is applied. Browse-baked Sugar Maple could be ~1% the tri count of Hero-baked (canopy disc + color only, no branches/trunk visible from above) — and that compounds across 745 LS placements.
  **Architectural pieces:**
  - **Manifest schema** gains `variants[].views[hero|browse|street].lodN` per-view artifact references (or convention-based path resolution from a base manifest)
  - **bake-trees.js view-awareness** — which placement uses which view artifact based on current Cartograph SHOT
  - **Runtime view-selection** — Cartograph's existing SHOTS framing (`SHOTS.browse.up` et al.) drives the swap; transitioning between SHOTS swaps baked variants
  - **Operator preview surface** — view-toggle in workspace ("how does this tree look in Browse?") before committing
  - **Bake pipeline** — per-view optimizer functions; Browse-overhead = canopy-projection rasterizer + color, no cylinders; Hero = current full bake; Street = future
  **Cross-helper:** Cartograph owns SHOTS definitions; Phase V is the kit-wide doctrine that those SHOTS become bake targets. Per [[project_slab_carries_full_authored_product]] the slab carries the full authored product → slab now carries N views per variant. See new memory [[project_view_aware_baking]].
  **Why parked v1.6:** large architectural addition; manifest schema migration + runtime view-selection logic + per-view bake optimizers is substantial work. v1.5 ships with single-view bakes (current behavior); v1.6 unlocks view-specific perf wins. Mobile-perf review at LS scale post-Phase L Cycle 2 ship will decide whether to pull forward.
  **Why this matters for [[project_park_is_the_gem]]:** 745 LS placements rendered overhead in Browse view is the dominant tree GPU cost in the dominant LS perceptual mode (the "little alive neighborhood" Browse experience). View-aware bake collapses that cost dramatically.

- [ ] **Phase H — Canopy overdraw architecture: outer-shell A2C cards + inner-mass point cloud** (post-Phase-F

- [ ] **Phase H — Canopy overdraw architecture: outer-shell A2C cards + inner-mass point cloud** (post-Phase-F
  perf phase, **superseded 2026-05-19** per [[project_configuration_d_canopy_render]]).
  **Architectural pivot 2026-05-19 PM:** the original Phase H plan (alpha-test cards for core
  + A2C cards for shell) is superseded by Configuration D: **inner mass renders as `THREE.Points`
  point cloud** (one-to-nine opaque pixels per point, zero alpha overdraw), outer shell renders
  as A2C cards on camera-facing surface only. This is dramatically better than the original card-core
  approach because POINTS HAVE NO ALPHA — mass-interior cost collapses by ~10× vs alpha-test cards.
  Outer-shell card count also drops ~70% (silhouette + camera-facing only ≈ 1500 cards/tree vs
  current 5500). Combined with bloom + film grade, the point-cloud-as-inner-foliage visual
  sleight-of-hand is robust at LS Hero/Browse distances.
  **LiDAR-pipeline-enabled.** Procedural can't do Configuration D — there's no real point cloud
  source for inner mass. LiDAR-baked variants enable this as the architectural pillar that
  justifies the LiDAR pipeline beyond just "real skeleton."
  **Hybrid roster.** Procedural variants continue to use the original Phase H plan if/when shipped
  (alpha-test core + A2C shell — fallback path for species without LiDAR sources). LiDAR-baked
  variants use Configuration D. Substitution lottery picks whichever quality tier wins per
  placement.
  **Single shader program preserved per [[feedback_unique_program_cache_key_before_wrappers]]:**
  outer-shell cards use Phase F gradient-map material; inner-mass points use a sibling material
  (different draw call, may compile to separate program — verify; if true, accept the 2nd program
  as load-bearing for Configuration D).
  **LoD progression:** lod0 = dense points + cards-shell. lod1 = 30% point subsample + cards-shell.
  lod2 = alpha billboard or cards-only, no points.
  **Fixes:** canopy fragment cost drops dramatically vs all-cards (the dominant LS mobile-GPU cost);
  mobile thermal headroom; renders volumetric foliage that procedural can't match.
  **Doesn't fix:** branch geometry overdraw (small pixel count vs leaf cards); trunk surface cost
  (Phase B handles); wind animation cost (Phase W handles); procedural-only species (those use the
  original Phase H fallback plan or stay all-cards).
  **Imposter-LOD-for-far-Hero** remains a separate possible optimization; demoted to "nice to have"
  once Configuration D ships and we see Browse/Hero perf in practice.

**Out of scope across the arc:** street-view photoreal (v2); real bark/leaf
photographic scans (v2 / SpeedTree replacement window); per-conifer-species
variants beyond the algorithm itself (Phase E ships one conifer correctly,
per-species authoring is its own follow-on); runtime tree generation (bake is
structurally required).

#### Roster-recalibration follow-ups (parked 2026-05-15)

Three items surfaced during the post-Phase-D design conversation. Not
v1.5-blocking; carried here so they don't fall off the radar between
Phase E and v1.6.

- [ ] **Phase E priority drop — conifer is 7% of inventory.**
  `src/data/park_trees.json` shape distribution: broad 528 (71%),
  ornamental 139 (19%), conifer 55 (7%), columnar 31 (4%), weeping 3 (<1%).
  Jacob's local visual mix is maple / willow / ginkgo / locust — conifer
  conspicuously absent from his eye-level read. With 55 placements
  representing the conifer category, Phase E's monopodial-whorl
  algorithm is still worth shipping (those 55 trees would otherwise
  fall back to SCA broadleaf and look wrong), but the per-conifer-
  species authoring follow-on (Spruce vs Pine vs Fir vs Cedar vs Bald
  Cypress as distinct species ids) drops priority — defer to v1.6
  unless visual review at LS reveals the generic monopodial-whorl
  conifer isn't enough.
- [ ] **Phase G.2 — Ginkgo as a second proving species after Sugar Maple.**
  Ginkgo is the species where the "shared morph vs per-species leaf
  authoring" question gets answered most decisively. Bilobed fan leaves
  + uniformly luminous gold fall = the most distinctive leaf-driven
  silhouette in temperate forestry. If a `procedural_ginkgo` species
  (envelope: rounded-cone variant; tropism: zero; leafMorph: `fan` with
  a luminous gold tint ramp) reads convincingly at Hero, the v1.6 leaf
  editor (below) moves to "nice to have." If it falls flat, ginkgo is
  the binding case study for v1.6 — the editor brief writes itself from
  what's missing. Ship as a separate `procedural_ginkgo` species rather
  than substituting through `procedural_broadleaf` because the
  silhouette (narrower than oak, fuller than columnar) doesn't sit
  inside the existing morphology buckets.
- [ ] **Honeylocust sparse-cluster mode for Phase F.** Bipinnately
  compound leaves = dappled, translucent canopy. Phase F's cluster
  compositor (`arborist/leafCluster.js`) needs a density / occupancy-
  fraction parameter from day one, not as a follow-on. Honeylocust ~25%
  occupancy (very sparse), oak ~70% (dense), conifer needles ~95%
  (packed). Per-species parameter that PRESETS.leafMorph doesn't carry
  today. Either Phase F lands with the knob, or Phase F.5 carves out
  honeylocust-style sparse authoring as a follow-on. The
  density-as-load-bearing-parameter belongs in the Phase F brief.

#### v1.6 deferred items (parked 2026-05-15)

- [ ] **Leaf editor + per-species cluster authoring.** Three escalating
  tiers: (1) per-species leaf design (parametric: base morphology +
  lobe count/depth + edge serration + venation density → PNG); (2)
  per-variant cluster authoring (density, transparency, hue jitter,
  autumn fraction); (3) per-Look palette overrides (already exists via
  `materialColors`; surface in editor). **Motivating local species
  (Jacob's eye-level mix at LS):** Maple (palmate, dominant inventory),
  Willow (narrow weeping, iconic even at 3 placements), Ginkgo (fan +
  fluorescent gold fall — generic green-fan billboard misses the
  point), Honeylocust (bipinnately compound + dappled translucent
  silhouette). Defer until Phase G + G.2 prove where shared morphs run
  out. The editor is structurally a different surface from the SCA /
  whorl panels — more like a per-species library entry than a bolt-on
  to ProceduralWorkstage. Dice-and-adopt doctrine doesn't fit leaves
  (you can't really dice a leaf; it's species-determined), so the UX
  is parametric-sliders + preview.
- [ ] **Per-species sub-grove view** (surfaced 2026-05-19 during G.1 pre-stage).
  Sub-page of the Grove showing all variants of a single species across all
  authoring sources side-by-side: procedural variants, vendor GLBs, LiDAR
  scans (currently unsurfaced), low-poly / multistem alternates. For Sugar
  Maple specifically this would surface `acer_saccharum_procedural` heroes +
  `acer_saccharum` 18-variant vendor roster + `acer_saccharum_lowpoly` +
  `acer_saccharum_multistem` + the **110 Sugar Maple LiDAR scans in
  `botanica/dev/train/`** (6.6m–28m height range, currently invisible from
  the UI). One screen, all the maples; same view per species.
  **Why this is good:** (a) surfaces LiDAR as a viable authoring source —
  today the 51GB FOR-species20K dataset is invisible from the operator's
  perspective, accessible only via CLI `bake-tree.py`; (b) gives the
  operator a single place to compare across sources when deciding which
  variants get curated into a Look; (c) natural launching point for "scan
  this LiDAR specimen → bake → publish" — the operator clicks a LiDAR
  thumbnail and the existing Scan-mode pipeline kicks off; (d) frames the
  hero authoring loop in context — operator can A/B their tuned procedural
  against the vendor hand-models AND a real laser-scanned specimen of the
  same species, side by side.
  **Structure:** route is `/arborist/species/<species_id>` (or similar);
  nav from a Grove tile's "open species" affordance. Tabs at top split
  procedural / vendor / LiDAR / variants. LiDAR tab queries
  `tree_metadata_dev.csv` for matching scientific binomial (already supported
  by `GET /species/:id/specimens` endpoint per FEATURES.md:99), renders
  thumbnails via the existing `.laz → .ply` cache + SpecimenViewport pipeline.
  Click on a LiDAR thumbnail kicks off Scan-mode authoring (existing
  `Workstage.jsx` flow); click on a procedural variant opens
  ProceduralWorkstage; click on a vendor variant... probably read-only for
  now, since vendor isn't operator-tunable.
  **Why deferred:** (a) not blocking heroes — G.1–G.5 ship without this; (b)
  meaningful UI surface (nav + new route + per-source rendering); (c) the
  hero workflow needs to settle first so we know what "compare across
  sources" actually means in practice. Revisit when G.2 is in flight or
  Jacob wants to start exploring LiDAR-baked heroes for species where
  procedural can't reach hero quality.
  **Coordinator note:** the spark for this entry was Jacob mentioning the
  LiDAR trees being "super cool" and wanting a place to see all the Sugar
  Maples. Per [[project_doped_artifact_placecard_edit_pattern]] this is
  squarely operator-aid surface, not an authoring-channel addition.

- [ ] **Decorative lights — Christmas / party / Halloween / etc.**
  Self-contained micro-arc (~2 days) that leverages existing infra:
  `src/components/lampLightmap.js` already bakes gaussian splats per
  lamp (a string light is just a tiny lamp); Bloom already in scene
  (bright emissive → halo automatic); `lamps.json` schema extension or
  new `decorative_lights.json`; time-of-day gating already exists via
  `uSunAltitude` (fade in at dusk). New work: (a) Stage authoring
  surface to click-place waypoints + spline interpolation (reuses
  `buildBlockGeometryV2.js` Catmull-Rom); (b) `<StringLights />`
  runtime component — `MeshBasicMaterial` tube for the cord +
  `InstancedMesh` of emissive bulbs with per-instance color/intensity;
  (c) Twinkle: per-bulb sine wave + per-bulb random phase, ~5 lines of
  GLSL; (d) Lightmap contribution: each bulb adds a tiny gaussian to
  the per-Look lamp lightmap at bake time → grass/bark beneath strings
  gets warm pools of light. Per-Look architecture handles seasonality
  trivially — a "Halloween Look" pins orange-bulb strings along
  Lafayette Avenue; "Christmas Look" pins white+warm around the gazebo;
  "Valentine's Look" pins red bulbs in the magnolias. Demonstrates the
  per-Look slab pattern beautifully. Doesn't block any other arc; can
  land alongside or between any tree phase.

---

### Trees — Procedural fallback v1 (shipped 2026-05-14, commit `dbbd1ed`)
- [x] **Resurrect `ParkTrees` algorithm as an Arborist generator.** Lifted
  `growBranch` / `addLeaf` / `makeBranch` + per-shape branching configs
  from `43c4aa3~1` into `arborist/generate-procedural.js` as a pure
  parameterized function
  `generateTreeMesh({preset, seed, dbh, canopyR, canopyH, branching, leafMorph}) → {barkGeo, leafGeo}`.
  Parameter-first discipline held: every variant in the PRESETS table is
  a plain `params` object, no hardcoded shortcuts. The eventual UI binds
  sliders to the same signature.
- [x] **Publish through the existing pipeline.** Generator emits a
  multi-node source GLB (one node per variant); shells out to
  `publish-glb.js` per species (5 invocations); variant detection splits
  via `namesSuggestVariants`; 3 LODs + manifest.json emitted unchanged.
  No fork of publish-glb / atlas-pack / bake-look / bake-trees.
- [x] **Species model: one species per morphology.** Five species
  published with 11 total variants:
  `procedural_broadleaf` ×3 / `_conifer` ×2 / `_ornamental` ×2 /
  `_columnar` ×2 / `_weeping` ×2. Each carries `qualityOverride: 2`
  (Fill tier — patched post-publish since publish-glb writes the
  Untouched sentinel `quality: 0` by default).
- [x] **Roster sync.** Generator appends 11 entries to
  `public/looks/lafayette-square/design.json#/trees`; bake-look atlases
  them into the unified LS atlas (all 22 procedural material refs land
  in `trees-atlas.json`). bake-trees substitutes ~140/745 park
  placements onto procedurals (conifer 52, columnar 31, broadleaf 30,
  ornamental 27; weeping 0 because no shape=weeping in `park_trees.json`).
- [x] **2-line stale residue.** `src/components/R3FErrorBoundary.jsx`
  comment + `arborist/SPEC.md:16` ParkTrees reference rewritten.
- [x] **Stash-isolated commit.** 23 unrelated dirty files (terrain
  doctrine, scene labels) left in working tree; `design.json` plumbed
  via `git hash-object` + `update-index` to stage only the procedural
  roster delta against HEAD without bundling Jacob's `layerVis`/`labels`
  edits. Per [[feedback_stash_isolate_per_file]].

#### Follow-ups — pick up post-Grove-curation

- [ ] **Operator prunes LS roster via Grove.** Open Arborist → set active
  Look = "Lafayette Square" → Grove → "In Look" scope → click the heavy
  `platanus_acerifolia` ×9 / `alaskan_cedar_2` / `broadleaf_rt3` /
  `cedar_generic` / `generic_*` tiles to remove. Per-Look atlas
  auto-rebakes; LS atlas size drops proportionally. Manual curation
  only — operator decides what stays.
- [ ] **Raise atlas `CONTENT_CAP` once roster shrinks.** `bake-look.js:39`
  caps tiles at `bark 512×1024 / leaf 512×512`. With ~10 trees in roster
  (vs 25 today) ~60% of atlas area frees — raise to
  `bark 1024×2048 / leaf 1024×1024` for material fidelity bump at no
  runtime cost. One-line knob; defer until operator finishes Grove
  curation so the actual roster size drives the cap.
- [ ] **Default-Look procedural placement gap.** `cartograph/serve.js`'s
  Bake-button chain runs `bake-trees.js --look default` (not the active
  Look's id). With procedurals at `quality=2` in
  `public/trees/index.json`, default's placements now substitute
  procedurals — but default's `design.json#/trees` doesn't list them
  and no per-Look atlas exists. Runtime fetches to
  `/baked/default/trees/procedural_*/...` will 404 if any view runs
  against `?look=` unset or `=default`. **Mitigation when relevant:**
  add procedurals to default's roster via Grove (one click each), atlas
  re-bakes automatically. Or gate the universal `public/trees/index.json`
  per-Look in `build-index.js` (out of scope for v1 stopgap).
- [ ] **Procedural authoring UI in Arborist** (deferred; designed in
  `NOTES.md` post-ship entry). Top-level `[Scan] | [Procedural]` mode
  toggle in ArboristApp; per-species panel exposes PRESETS-table params
  + "Re-generate + publish" button; `POST /procedural/generate` returns
  a GLB → SpecimenViewport renders before publish. `generateTreeMesh()`
  already exposes the exact params signature the UI will bind to. ~1
  day end-to-end. Worth doing once the v1 stopgap proves the visual bar.
- [ ] **Per-instance bark color** — current v1 lands one bark texture per
  species (5 distinct browns across the roster). The original ParkTrees
  palette drove per-tree bark via vertex colors; bake-look's atlas
  rewriter strips `COLOR_0`. SpeedTree restores per-instance bark via
  tinted baked-card atlas tiles — already in the SpeedTree migration
  plan, no new gap. No action required here.

- **Why now:** SpeedTree path has a learning curve; the pre-procedural
  138 MB baked-GLB roster is too heavy for the mobile target
  ([[feedback_beautiful_first_lightweight_51]]). Procedurals are the
  v1 stopgap per [[project_v1_no_trees]]. SpeedTree will replace them
  by raising roster quality ratings — zero code change at swap time.

### Cross-helper integrations

- [x] **Arborist → Meteorologist canary tree contract** — **SHIPPED 2026-05-19**. Per-tile hover-card affordance in Grove (`src/arborist/Grove.jsx` EditorCard) writes `{ species, variantId, lookId }` to `localStorage.meteorologist-canary-tree`; Meteorologist's CanaryScene reads it via the cross-tab `storage` event to swap its hero tree. No backend, no authored state — per-operator UI preference scoped to the Vite dev origin. Contract shape + rationale in `ARCHITECTURE.md` "Arborist ↔ Meteorologist canary contract"; operator surface noted in `FEATURES.md` Grove subsection. Arborist-half ships independently of the Meteorologist reader half (separate ship by the Meteorologist orchestrator); the contract is the only coupling.

### Trees — SpeedTree
- [ ] **Stand up the SpeedTree library.** Buy/grab `.spm` starter kits;
  tune a London Plane + generic deciduous + generic conifer; export
  glTF at 4–5 LODs + 1-click billboard bake from the same source.
  Replace hand-modeled trees in the arborist roster. The billboard
  impostor tier comes for free from SpeedTree's baker — solves the
  mobile triangle budget without a separate impostor pass. Open-source
  fallbacks (`proctree.js`, `tree-js`, `Arbaro`) if SpeedTree route
  doesn't pan out.
- [ ] **Per-shot tree-scale slider (Stage-side, camera-connected).** Hero
  defaults to ~2× for romance; Browse + Street stay 1.0. Lives on the
  Stage panel (camera-connected), not arborist.

