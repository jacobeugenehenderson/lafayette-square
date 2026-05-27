# Handoff — Hero-Shot Tree Visibility-LOD + Pan-Arc Impostors

> Dispatch-ready brief. Makes the tree canopy **mobile-viable** by rendering only the trees
> the hero pan actually *sees well* at full mesh, and swapping occluded / peripheral trees to
> cheap multi-view impostors. This is `project_view_aware_baking` realized for trees, scoped
> to the **Hero shot only** (operator decision 2026-05-26 — Browse/Street are out of scope).

**You are the dispatched agent. Name yourself** — pick it independently from your own read of
the work; the only constraints are novel + NOT already used in this project (check the claimed
roster in `arborist/NOTES.md` / `cartograph/BACKLOG.md` / commits before choosing). No theme
suggestions; the name is yours. You own this end-to-end across the phases below.

This is a *load-bearing, multi-file* arc touching an authoring-time analysis, a new producer,
and the runtime tree consumer. It is **strictly sub-phased**. Do **not** bundle the analysis,
the impostor producer, and the runtime swap into one commit — that hides which layer broke
what (the D.3 bundling lesson). Recommended dispatch: someone fluent in `InstancedTrees.jsx`
+ `treeAtlasMaterial.js` + the `bake-look`/`bake-trees` atlas pipeline (arborist lineage).

---

## Why this exists (prior context — don't re-derive)

Audited 2026-05-26: the leaf canopy is the **dominant mobile GPU cost** (fill-rate / overdraw).
Of the four "performance" mechanisms, ganged atlases and shared bark are **done and shipped**
(one unified color+normal atlas per Look, one material, 2 binds — `bake-look.js#unifyAtlases`,
`treeAtlasMaterial.js`); this brief does NOT touch them beyond *reusing* them. The two that
were never wired: distance-LOD and overdraw reduction. They collapse into one lever — render
fewer/cheaper leaf fragments where the eye won't notice.

Two findings shaped this brief:
1. **We currently ship `lod2` (most-decimated tier) for every tree** (`bake-trees.js` default;
   `public/baked/default.json:4` `"lod":"lod2"`, every URL `*-lod2.glb`). The operator confirms
   it **looks great even at hero distance** — so lod2 is a fine *floor*, and `lod0`/`lod1` are
   produced-but-unreferenced **dead track** (candidate deletion in Phase F; verify first).
2. **The determinant is visibility, not distance.** The hero camera makes a known **180° pan**
   between the two authored `heroKeyframes`. A far tree standing alone against sky in frame
   center must stay crisp; a near-ish tree fully behind another can be flat. So tier is decided
   by *unoccluded screen prominence across the pan arc*, not raw distance.

## The shape of the fix

A bake-time analysis scores each tree's prominence across the hero pan and assigns a **2-tier**
classification — `mesh` (lod2 geometry) or `impostor` (multi-view billboard). The runtime splits
tree instances into the two buckets for the hero shot. Impostors are baked through the existing
unified atlas material so they match the mesh, and span only the ~180° arc the camera traverses
(never the backs). Net: far/occluded canopy stops paying full leaf-overdraw cost.

---

## Phase 0 — Inspect & baseline (mandatory first)

- **Pan path:** `heroKeyframeAnim` + `catmullRom` + `resolveHeroSubject` (`src/stage/StageApp.jsx`,
  `src/preview/heroAnim.js`, mirrored in `src/components/Scene.jsx`). Confirm exactly how the
  camera position + look-target sweep between the two `heroKeyframes` so you can sample the arc.
- **Runtime tree draw:** `src/components/InstancedTrees.jsx` — one `InstancedMesh` per variant,
  no tier/LOD selection today; the `stampTreeVertexAttrs` merge step; how placements + per-instance
  matrices are built. `src/arborist/SpecimenViewport.jsx` shares the material path (parity).
- **Atlas material:** `src/components/treeAtlasMaterial.js` — `useTreeAtlas`, `buildMaterials`,
  `applyBarkUniforms`; this is what the impostor bake must render *through* so lighting matches.
- **Producer:** `arborist/bake-trees.js` (placement bake, ships one LOD), `arborist/bake-look.js`
  (atlas unify), `arborist/publish-glb.js` (the 3-LOD producer). Confirm `lod0`/`lod1` GLBs are
  unreferenced anywhere at runtime (dead-track candidate; do NOT delete yet).
- **Baseline:** measure current hero-shot tree overdraw + draw-calls in the **Preview GPU panel**.
  Record the numbers — they are the target to beat and the Phase-D success gate.

Write a 10-line findings note in this brief's status before Phase A. **Surface anything that
contradicts this brief.**

### Phase 0 — Findings (Azimuth, 2026-05-26)

1. **Inspection complete.** Runtime consumers: `InstancedTrees` is mounted by Scene (prod),
   PreviewApp, CartographApp (Stage), ToyTrees — all read `baked/default.json` (lod2). Material:
   `treeAtlasMaterial.js` (one shared `MeshStandardMaterial`, `injectFoliageSway` per-draw uniform
   mutation). Producer: `bake-trees.js` (placement only — loads NO geometry, just positions +
   variant URLs). GPU readout: `GpuMonitor` reads `renderer.info` (draws/tris/ms) + per-layer
   `measureToggle` on the `trees` layer.
2. **Hero pan is NOT a 180° pan.** Slab: 2 keyframes, pos `[-258,78,298]↔[-288,57,-54]`, sine
   ping-pong period 720, fov **22 (telephoto)**, target `HERO_TARGET=[400,45,-100]` (`heroSubject`
   null → fallback; Scene/Preview/Stage parity ✓). Camera **heading sweep ≈ 27°**, not 180°.
   ~60% of trees (448/745) fall in-frame at some pose; ~316 in-frame per pose.
3. **"180° arc" reinterpreted.** Per-tree viewing-azimuth span across the pan is *small* (median
   5°, p90 42°). The wide spread is the **union of view azimuths across all instances of a
   shared per-species impostor** (trees on the near/far side of the park are seen from opposite
   directions). So size K against the cross-instance azimuth union, NOT a camera pan that doesn't
   happen. ⚠️ Possible spec-compression: a *static* hero split + near-fixed per-tree azimuth may
   not need K=5–9 + runtime relight — revisit with Phase-B cost numbers.
4. **Draw baseline:** 745 instances, 39 variants, **≈377 `url×tile` InstancedMesh draw groups**
   (pre-roster-subst). Live frame-ms/tris baseline must be read off the running Preview GPU panel
   (toggle `trees` layer for attribution). ⚠️ GpuMonitor has **no overdraw field** — overdraw
   shows up only as frame-ms under a fill-bound mobile profile.
5. **⚠️ CONTRADICTION — lod0/lod1 are NOT dead track.** lod0 is the authoring anchor LOD: Salon
   `SpecimenViewport` (×2), Meteorologist `CanaryScene`, Workstage LOD picker, ProceduralWorkstage,
   `useArboristStore` default. Unreferenced only in the *LS production runtime* (ships lod2).
   **Phase F as written ("stop producing lod0/lod1 in publish-glb") would break the author tools.**
   Recommend re-scoping Phase F to "confirm lod2-only in the prod bake" and NOT touching publish-glb.
6. **Classifier feasibility:** proper frustum projection (not a cone approx) is non-degenerate;
   analytic occlusion via nearer-tree angular-disk overlap is ~12M ops at bake (fine). Gap:
   classifier needs a per-variant **canopy bbox (radius/height)** which `bake-trees.js` doesn't
   currently load. Threshold calibration is exactly what the Grove QC overlay + A→B seam exist
   to do.
   - **RESOLVED (Boz, 2026-05-26) — see Phase A prerequisite.** Don't scan geometry in
     `bake-trees`, don't bolt onto the atlas manifest. `publish-glb` already loads each mesh and
     persists per-variant `approxHeightM` + `normalizeScale` in `public/trees/<species>/manifest.json`.
     **`publish-glb` owns the canopy bbox**: add `canopyRadiusM` next to `approxHeightM` (same
     `Box3`, X/Z extent already in hand); the prominence pass *reads* both from the manifest.
7. **⚠️ BLOCKER (Azimuth, 2026-05-26) — `publish-glb`'s GLBs are NOT clean single trees; its
   bbox canopy radius is garbage.** Verified by reading the artifacts (per the inspect-first rule):
   `public/trees/<latin>/skeleton-*.glb` are `sourceName:"whole-scene"` exports with multiple
   wide primitives. `computeTreeBounds` on them gives **acer_saccharum r=42.8 m (h=10.4)**,
   **cupressus r=15.9 m (h=8.5)** — radii 4–8× the height. `approxHeightM` survived (Y extent
   happened to be tree-sized) but X/Z is contaminated, so "same Box3, X/Z extent" yields nonsense.
   - **The clean, real-world-meter single trees are the `bake-look` output**
     `public/baked/<look>/trees/<roster>/skeleton-*-lod2.glb` → **sane radii 1.6–6.9 m, h≈12 m**.
     This is also *what the runtime actually renders* (`InstancedTrees` fetches `baked/<look>/trees/…`,
     not `public/trees/…`).
   - **Keying mismatch too:** `default.json` instances carry **library** species
     (`quercus_alba`, `betula_pendula`, `acer_saccharum_procedural`…); the baked clean trees use
     **roster** names (`maple_sugar`, `birch`, `linden_american`…). Runtime substitutes lib→roster.
     So canopy dims keyed by `publish-glb`'s library manifest don't line up with the rendered tree.
   - **Recommendation:** **`bake-look` owns `canopyRadiusM`** (+ a real-meter `heightM`), computed
     from the clean composed tree it already produces, written into `trees-atlas.json` keyed by the
     SAME species/variant the runtime renders; the prominence pass reads it there. Alternative: a
     guarded dominant-tree extraction in `publish-glb` (fragile against whole-scene sources). The
     `publish-glb`→`build-index`→backfill plumbing is built but **HELD** pending this routing call.
   - **RESOLVED (Boz, 2026-05-26) — re-route to `bake-look`, recommendation accepted.** Verified
     structurally: runtime fetches `/baked/<look>/trees/…` (`InstancedTrees.jsx:48`), 9 clean
     roster-keyed species on disk, `bake-trees` already resolves instance→roster variant via
     `pickVariant`. **Discard** the held publish-glb/build-index/backfill plumbing (do NOT commit).
     **Keep `tree-bounds.js`** (shared helper; bake-look uses it). See the rewritten Phase A
     prerequisite. My original publish-glb call was wrong — it measured a dirty whole-scene source
     and keyed by library, not the rendered roster tree.

## Phase A — Bake-time visibility classification → per-tree `heroTier` (no render change)

**Prerequisite (discrete commit, lands first — `bake-look` owns canopy dims).** *Re-routed from
publish-glb (finding #7): publish-glb's source is dirty whole-scene GLBs keyed by library; the
RENDERED tree is bake-look's clean roster-keyed composed output.* The prominence pass needs a
per-variant canopy bbox, measured from **what the runtime actually renders**:
- **`bake-look` emits `canopyRadiusM` + real-meter `heightM`** per roster variant, computed from
  the clean composed tree it already produces (via the shared `tree-bounds.js`). Take BOTH from
  this clean source — do NOT reuse publish-glb's `approxHeightM` (it survived only by luck on the
  dirty source). Write into the manifest the runtime already loads (`trees-atlas.json` or a sibling
  bake-look writes), keyed by the rendered roster variant.
- **The prominence pass reads dims via `bake-trees`'s existing `pickVariant` resolution** — it
  already resolves each placement to a roster variant, so it looks up that variant's dims. Keying
  is correct by construction; no separate lib→roster mirroring. Do NOT load geometry in `bake-trees`.
- **Ordering:** confirm `bake-look` runs before `bake-trees` so the dims exist when the prominence
  pass reads them (add the dependency if not).
- Keep this as its own commit, separate from the prominence pass (D.3). `tree-bounds.js` is the
  shared bbox helper; the discarded publish-glb plumbing does NOT get committed.

Add an **analytic** (CPU, no GPU/headless-GL) prominence pass to the tree placement bake. For N
sampled camera poses along the hero pan arc:
- Project each tree's bounding cylinder/sphere to screen.
- **Occlusion:** a tree is occluded at that angle if nearer trees' projected silhouettes cover
  more than a threshold fraction of it.
- **Prominence(tree, angle)** = f(unoccluded screen-coverage, centrality to frame, screen-size).
- **`heroTier`(tree)** = `mesh` if prominence exceeds threshold at **any** sampled angle, else
  `impostor`. (Max-over-arc ⇒ tier is constant through the pan ⇒ **no mid-pan popping**.)

Emit `heroTier` per tree into the slab (extend the placement artifact; bump its schema/version
if it carries one — and per the version-agnostic-trees doctrine, do NOT add version-refusal to
the tree path). **The tier is purely derived — NOT an authored channel.** No `design.json`
override map, no knobs.

Add a **read-only QC overlay in Grove**: tint trees by assigned tier at the current Stage camera
so the operator can eyeball "not terrible." Visualization only — no override dots, no edit UI.

- **Fixes:** slab carries the per-tree hero classification; operator can QC it.
- **Doesn't fix:** nothing renders differently yet.
- **Verify:** classification matches the operator's eye across the pan (this is the A→B seam);
  re-bake idempotent; analytic occlusion is adequate (escalate to a render-based ID pass only if
  it visibly misclassifies — flag as scope drift if so).

### Phase A — Status (Azimuth, 2026-05-26) — landed; PAUSED for the evening, mid design-pivot

Commits: dims-emitter `bfdbdca`, classifier+QC `fcdc1eb`, brief `98795f0`, **3-tier checkpoint
`592cba6`**. Idempotent ✓; runtime files compile ✓; render bit-identical when QC off ✓.

**▶️ RESUME HERE (next session) — the DoF pivot.** The operator reframed the classifier from
screen-prominence to a **two-focal depth-of-field**: foreground (the neighborhood) sharp, mid-
distance soft, the arch @infinity sharp. Applied to *trees*, the arch sits beyond every tree, so the
far-sharp peak is empty → the tree rule **collapses to camera-distance bands**: `near → mesh`,
`mid/far → impostor` (the impostor flatness *is* the DoF blur), `off-frame → cull`.
- **Action:** in `classifyHeroTiers` (`arborist/bake-trees.js`), replace the prominence score
  (coverage×centrality, occlusion) with **min-camera-distance-over-pan bands**. Keep a far-sharp
  band in the formula for generality (empty of trees today). Dial = **near-sharp radius** (~150 m;
  shot distances run ~67–480 m). Re-bake, QC via the overlay, tune the one distance.
- **Unblocks:** camera distance is known *now* — this does NOT wait on placing the Hero Object
  (unlike a hero-object gradient). Occlusion is dropped (fine for DoF). **Overrides finding #2**
  ("visibility, not distance") — operator-confirmed: far trees *should* go soft. Update finding #2
  + flag Boz when the pivot lands.
- **Survives the pivot:** the `cull` tier, the 3-colour QC overlay, `heroTier` emission, the
  bake-look dims emitter, the keying. Only the mesh↔impostor *scoring* changes.

**Current checkpoint state (prominence model, `592cba6`):** 361 mesh (48%) / 362 impostor (49%) /
22 cull (3%) at `PROM_THRESHOLD=0.02`, `CULL_FRUSTUM_GUARD=1.3`. QC: `?heroTierQC=1` (hard-reload
first — shader edit) → green=mesh / magenta=impostor / blue=cull. `heroTierMeta` carries a
`thresholdSweep` + `promHistogram` for calibration.

**Still-open seam decisions (carry forward):**
1. **Dims keying** — exact-when-in-roster else category-mean over roster variants (93% substitute at
   runtime; no lib→roster mirror). Adequate, or escalate to a shared exact-substitution fn?
2. **QC overlay home** — relocated Grove→Stage/Preview (Grove is a specimen gallery, no park/hero cam).
3. **`cull` is a scope addition** vs the 2-tier brief (operator-requested) — extends Phase D to a
   3-way render split (cull = don't emit). Boz to ratify.

## Phase B — Multi-view pan-arc impostor producer (Salon/arborist; no runtime consumption)

New bake step: per species/variant, render the **lod2 mesh through the unified atlas material**
(so albedo/bark/leaf lighting matches) from **K views (~5–9) spanning the ~180° pan arc** — not
360° (we never see the backs). Pack into an impostor atlas.

- **TOD parity (seam decision):** default to baking **color + normal + alpha** and **relighting
  at runtime** (sun-direction · baked normal) so impostors track TOD in step with mesh neighbors.
  Before committing, bake a quick frozen-vs-relit comparison and confirm with Jacob with real
  producer-cost numbers in hand. (Frozen-at-Look-TOD is the cheaper fallback if relight proves
  too heavy for v1.)
- Reuse `bake-look`/atlas infra; this is where the shipped ganged-atlas + shared-bark work pays
  off — build on it, don't fork it.

- **Fixes:** an impostor atlas that matches the mesh from every sampled arc angle.
- **Doesn't fix:** production; runtime still all-mesh.
- **Verify** in Salon (`SpecimenViewport`): impostor reads correctly across the arc; K views
  enough (no visible angular snapping); matches the lod2 mesh side-by-side. **Seam: operator
  confirms impostor visual quality + the TOD decision before Phase C.**

## Phase C — Runtime impostor render path (Preview-only, behind a flag)

Add an instanced, camera-facing **impostor quad** path to `InstancedTrees.jsx`: one instanced
draw per species, sampling the impostor atlas by current camera azimuth (+ runtime relight).
Mount behind a flag in Preview **beside** the all-mesh path for A/B comparison.

**⚠️ Preview-toggle convention (NEW — coordinate, don't freelance).** Your A/B flag lives in
`PreviewApp.jsx`, which a concurrent **Preview measurement-regime** arc (`HANDOFF-preview-measurement.md`)
is fixing — it's making toggles **non-destructive** (gate `.visible`, never conditional-mount/unmount,
so the GPU meter reads a clean per-frame delta) and establishing that **migration A/B flags are
TEMPORARY**. So your impostor flag must:
- **Gate `.visible`, not the mount** — do NOT `{flag && <Impostors/>}`. Mount both paths; flip
  visibility. Otherwise toggling churns the meter (re-upload/re-compile) and your Phase-D/Phase-C
  "overdraw drop" reading is contaminated — and that reading is your whole success gate.
- **Be explicitly temporary** — once the operator confirms the impostors (your end-of-Phase-D /
  cutover seam), it **collapses to a single "Trees" toggle**, not a permanent second toggle. Note this
  in the flag's comment.
- **Surface to Boz before editing `PreviewApp.jsx`** so it's sequenced with the measurement arc (that
  arc sets the canonical toggle pattern; adopt it rather than inventing a parallel one).

- **Fixes:** Preview can render + measure impostors.
- **Doesn't fix:** tier-based splitting yet (everything still draws as mesh in production).
- **Verify:** impostors sample the correct view across the pan; **draw-call + overdraw drop
  visible in the Preview GPU panel** vs the Phase-0 baseline. (Trustworthy only once the measurement
  arc's non-destructive gating is in — coordinate timing.)

## Phase D — Wire `heroTier` → split instance buckets (the payoff)

Consume the baked `heroTier` for the hero shot: `mesh` trees → existing lod2 `InstancedMesh`;
`impostor` trees → the Phase-C impostor path. Static split for the hero shot (no per-frame
reclassification). Keep all-mesh for non-hero shots.

- **Fixes:** the overdraw win is realized; prominent/isolated trees stay crisp, occluded/peripheral
  go impostor.
- **Verify:** full 180° pan in Stage — no popping, no obviously-flat prominent tree, no seam where
  a mesh and impostor tree stand adjacent (49/51 gate: impostors must not read as flat next to
  mesh). GPU panel shows the target overdraw reduction. Stage ↔ Preview parity.

## Phase E — Production cutover

Hero shot renders tiered in production (`src/components/Scene.jsx`); drop the Phase-C flag in
Preview. **Browse / Street stay all-mesh — explicitly out of scope, do not touch.**

- **Verify:** hero renders identically across Stage / Preview / Production; overdraw win holds on
  a mobile-profile run. (This is the before-cutover check-in seam.)

## Phase F — Cleanup + docs

**REVISED 2026-05-26 (Phase 0 finding + operator confirm):** lod0/lod1 are NOT dead track — lod0
is the **authoring anchor LOD** (Salon `SpecimenViewport`, Meteorologist `CanaryScene`, Workstage
LOD picker, ProceduralWorkstage, arborist store default). **Do NOT touch `publish-glb.js`; keep
producing all three LODs.** This phase is docs-only: confirm the LS *production* bake stays lod2-only
(already true), and update `arborist/NOTES.md`, `cartograph/BACKLOG.md`, `cartograph/FEATURES.md`
(view-aware baking realized for hero trees), and `SLAB-CONTRACT.md` for the new `heroTier` field.

---

## Explicitly out of scope

Browse/Street tree tiers (hero-only for now); per-tree authoring/override knobs (tier is derived;
Grove gets QC-view only); the dormant Config-D / LiDAR canopy approach; touching the shipped
ganged-atlas or shared-bark code beyond *reusing* it; any 360° / full-octahedral impostor (the
180° pan never shows tree backs). The separate **confirm-#2/#4 + lod0/lod1 dead-track cleanup**
is its own small brief — don't fold it in here (D.3).

## Commit boundaries

One commit per phase, each independently revertible. Canonical off-limits unless the phase owns
them: `RIBBONS.md`, ground/terrain bake, the buildings bake (separate in-flight arc). **Check in
with Jacob at:** the **A→B seam** (QC the derived classification — does the eye agree?), the
**end of Phase B** (impostor visual quality + the TOD-relight decision with cost numbers), and
**before Phase E** (production cutover). **Aesthetics + perf are co-equal (49/51):** the canopy
must still read beautifully through the full pan — impostors earn their place by being invisible
as impostors, not just by measuring faster. Surface anything not in this brief in your status +
commit bodies.

**⚠️ Concurrent-arc convergence (`SLAB-CONTRACT.md` + `Scene.jsx`).** A second arc is in flight
in parallel — the hybrid buildings bake (`HANDOFF-buildings-bake.md`, agent Alidade). The two
arcs are on disjoint files **except** `SLAB-CONTRACT.md` (buildings bumps it to v2; you add a
`heroTier` field) and `src/components/Scene.jsx` (buildings' Phase E swaps `LafayetteScene`→
`SlabBuildings`; your Phase E wires the tier render). **The buildings arc is further along and
lands FIRST on both files — you rebase on top of its v2 contract, not the reverse.** Before you
touch either `SLAB-CONTRACT.md` or `Scene.jsx`, **stop and surface to Boz** to confirm the
buildings cutover has landed; then add `heroTier` to the *already-v2* contract and wire your tier
render into the *already-`SlabBuildings`* Scene. Do not race a second cutover into those files.
