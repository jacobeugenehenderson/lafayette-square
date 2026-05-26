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

## Phase A — Bake-time visibility classification → per-tree `heroTier` (no render change)

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

- **Fixes:** Preview can render + measure impostors.
- **Doesn't fix:** tier-based splitting yet (everything still draws as mesh in production).
- **Verify:** impostors sample the correct view across the pan; **draw-call + overdraw drop
  visible in the Preview GPU panel** vs the Phase-0 baseline.

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

If `lod0`/`lod1` are confirmed unreferenced (Phase 0), stop producing them in `publish-glb.js`
(separate commit). Update `arborist/NOTES.md`, `cartograph/BACKLOG.md`, `cartograph/FEATURES.md`
(view-aware baking realized for hero trees), and `SLAB-CONTRACT.md` if the slab gained `heroTier`.

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
