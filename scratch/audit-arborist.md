# Audit — Arborist / Tree Pipeline (forensic pathologist walk)

> **Pathologist: Increment.** (An increment borer cores a living tree to read its
> growth rings without felling it — a read-only read of an accreted pipeline.)
> Read-only walk, 2026-05-27. No code changed. Classifications carry evidence per
> `AUDIT-MATRIX.md`; deletions await Boz sign-off. The gated LOD/novelty brief is
> **deferred to the end** (§7) per `HANDOFF-audit-arborist.md` sequencing — inventory
> first, payoff last.

## Method / what I read directly

Core runtime + producer read in full myself (not delegated, for classification
evidence): `src/components/InstancedTrees.jsx`, `src/components/treeAtlasMaterial.js`,
`arborist/bake-trees.js`, `arborist/tree-bounds.js`, `arborist/build-index.js`,
`src/lib/heroSubject.js`, plus the on-disk bake artifacts (`public/baked/default.json`,
`public/baked/lafayette-square/{scene,trees-atlas}.json`, `public/baked/lafayette-square.json`).
Two Explore agents swept breadth (authoring surfaces; producer chain) — **I re-verified
every `remove`/`vestigial` claim before recording it**, and one agent over-fired (see §6).

---

## 1. The matrix (filled across the tree surfaces)

Environments: **Toy** · **Salon** (SpecimenViewport/SalonWorkstage) · **Grove** ·
**Stage** (CartographApp) · **Preview** (Desktop/Mobile) · **Production** (LS app /
Scene.jsx) · **Canary** (Meteorologist). Pipeline rows follow.

### 1a. Runtime tree-render surfaces

| Item / Location | Envs | What it is | Capability statement | Source(s) of truth | Cruft-class | Action | Productization |
|---|---|---|---|---|---|---|---|
| `InstancedTrees.jsx` consumer | Prod, Stage, Preview, Toy | Fetches a static bake, groups by (url×tile), one InstancedMesh per variant per tile; runtime-merges primitives → 1 submesh | "You can drop a whole authored park into any scene with 2 material binds." | `BAKE_URL = baked/default.json` (hardcoded); atlas via `useTreeAtlas(lookId)` | **real** | keep | slab-field (bake path per-Look) |
| `treeAtlasMaterial.js` shared material | all tree surfaces | One MeshStandardMaterial; per-draw uniform mutation for bark/gradient/detail/posterized/deformer; sway + lamp-glow + heroTier-QC shader injection | "You can ship 60+ species through 1 shader program (Bloom-safe)." | atlas manifest `trees-atlas.json`; module-scope uniform singletons | **real** | keep | none |
| `BAKE_URL` hardcoded to `baked/default.json` | Prod | Production always reads `default.json` regardless of active Look | — (the comment admits "Path stays at /baked/default.json **for now**") | `InstancedTrees.jsx:45` | **duct-tape** (hard-wire) | fix → resolve bake path from lookId like the atlas already does | slab-field (per-Look placement bake) |
| Runtime lib→roster substitution | Prod, Stage, Preview | 93% of placements are out-of-roster; substituted to a same-category roster variant by deterministic hash | "You can ship a partial roster and still populate all 644 placements." | `InstancedTrees.jsx#groups` (`fallbackFor`) | **real** | keep | none (but see §3 contract note) |
| `urlToSpecies` / `urlToVariantId` regex parse | Prod | Recovers species/variantId from the rewritten GLB URL because substitution rewrites `inst.species` away | "You can look up per-variant atlas slots after substitution." | URL string shape `…/trees/<sp>/skeleton-<vid>-lod#.glb` | **duct-tape** (URL-as-data) | keep (works; note fragility if URL shape changes) | none |
| `computeTier` bark-tier altitude bands | Prod | Camera `y` → aerial/hero/street bark shader tier (150 m / 5 m thresholds) | "You can auto-pick bark detail by camera altitude." | `InstancedTrees.jsx:389` constants; comment calibrated vs **stale pre-slab PRESETS** (browse y=600, hero y=55) | **duct-tape** (calibrated to retired camera consts) | fix → recalibrate vs slab camera framing | slab-field (camera altitudes) |
| `heroTier` per-instance attr → QC tint | Prod, Stage, Preview | Phase A: `mesh`/`impostor`/`cull` from bake; drives read-only QC overlay (`?heroTierQC=1`) | "You can eyeball the derived hero LOD split through the pan." | `default.json` instances `heroTier`; `treeHeroTierQC` uniform | **real** (but classification is stale — see §2 ⚠) | keep mechanism; **re-bake** to fix the target | slab-field (already is) |
| `ToyTrees.jsx` | Toy | `<InstancedTrees bakeUrl="/baked/toy.json" lookId="lafayette-square"/>` — production path on a test fixture | "You can smoke-test the real tree path in isolation." | `baked/toy.json`; shared LS atlas | **real** | keep | none |
| `CanaryScene.jsx` HeroTree | Canary | Meteorologist tree preview: **raw GLB materials, bypasses InstancedTrees + atlas entirely** (renders unlit white/grey) | ⚠ reads as nonsense — "preview the tree but not how it looks" | direct `useGLTF(baked/<look>/trees/<sp>/<variant>)`; NO manifest | **duct-tape** (documented known-gap, 2026-05-20 follow-up) | fix → mount shared atlas material (export path exists) | none |
| `Grove.jsx` gallery tiles | Grove | Curation gallery: `scene.clone()` of raw GLB, **no atlas material, no bark/sway/heroTier** | "You can review the whole library at a glance." (fidelity intentionally not production) | raw variant GLB URLs | **real** (intentional low-fi) — but a Stage↔Grove visual mismatch | keep; document the intentional divergence | future-setting ("show as baked" toggle) |
| `Grove.jsx` `hovered` state | Grove | Set but only feeds opacity/color ternaries; hover-preview was deferred | — | `Grove.jsx:41` | **vestigial** (low value) | remove (evidence: no consumer beyond cosmetic ternary) | none |
| `Workstage.jsx` (legacy) | Salon (legacy) | Pre-18A single-species surface; reachable only via `?legacy=workstage`; delegates to SpecimenViewport | — | `ArboristApp.jsx:58` gate | **vestigial** (sundown per Brief 18A) | remove after 18B confirmed; Boz sign-off | none |

### 1b. Producer / pipeline rows

| Item / Location | What it is | Source(s) of truth | Cruft-class | Action | Notes |
|---|---|---|---|---|---|
| `bake-trees.js` | Resolves picker → `public/baked/<look>.json` placements; lamp-glow pre-sample; forbidden-surface filter; **heroTier classifier**; 4×4 tiling | `public/trees/index.json` + `park_trees.json` + `park_species_map.json` + slab hero pan/dims | **real** (core) — but see §2 stale target | fix (the hero-target literal); else keep | writes `default.json` (live) |
| `bake-look.js` | Atlas unify (bark+leaf+gradient+detail+posterized LUTs) → `trees-atlas.json` + UV-rewritten GLBs; **canopyByVariant dims emitter** (Phase A prereq) | `design.json` roster; published GLBs; imports `tree-bounds.js` | **real** (core) | keep | runs before `bake-trees` in serve.js (✓ ordering) |
| `publish-glb.js` | 3-LOD producer (lod0/lod1/lod2) → `public/trees/<sp>/`; `approxHeightM`, `normalizeScale`; calls `rebuildIndex` | vendor/procedural/lidar source GLBs | **real** (core) | keep | does **not** import tree-bounds (correct post-reroute) |
| `build-index.js` | Scans species manifests → `public/trees/index.json` pool (quality/exclusion gate) | `public/trees/<sp>/manifest.json` | **real** | keep; **fix header doc** (says "Used by InstancedTrees" — false; real consumer is `bake-trees` + `serve.js`) | doc-drift |
| `tree-bounds.js` | Shared world-AABB → `{heightM, canopyRadiusM}` | — | **real / LIVE** (sole consumer `bake-look.js:29`) | keep; **fix header doc** (names `publish-glb` + `backfill-canopy-radius.js` as consumers — first no longer imports it, second never existed/was discarded) | ⚠ agent mislabeled this "vestigial" — see §6 |
| `atlas-kind-classifier.js` | Single bark-vs-leaf classifier `classifyPrim` | — | **real** (one SSOT classifier) | keep | consumers: `publish-glb`, `survey-deleaf` |
| `decimate-tree.mjs` | LOD decimation (leaf/bark, card vs connected-mesh) | `decimation-defaults.json` | **real** | keep | consumer: `publish-glb` |
| `extract-bark-detail.mjs` / `extract-bark-posterized.mjs` | On-demand bark detail/posterized extraction during bake | — | **duct-tape** (lazy mid-bake, should be a publish-time artifact) | fix → pre-bake at publish; low priority | consumer: `bake-look` |
| `generate-salon.js` / `generate-procedural.js` | Composition + procedural generators → publish | salon/procedural state | **real** | keep | consumers: serve.js POST publish |
| `spaceColonization.js` | SCA kernel for procedural | — | **real** | keep | consumer: `generate-procedural` |
| `derive-leaf-attachment-tags.mjs` | Leaf placement-point tagging | — | **real** | keep | consumer: `generate-salon` |
| LiDAR track: `bake-tree.py`, `lidar_extract.py`, `lidar-publish.js`, `preview-laz.py` | Live LiDAR skeleton path | LAZ/PLY sources | **real** | keep | consumers: serve.js endpoints |
| Experimental skeleton spikes: `bidirectional_skeleton.py`, `lil_vera.py`, `lil_vera_v2.py` | Alt extraction algorithms, each behind its own serve.js endpoint | — | **real spike** (live endpoints, but parallel/unconverged) | keep; flag for convergence review (3 parallel skeleton extractors) | not in the default publish path |
| `public/baked/lafayette-square.json` | Stale 745-inst bake, `heroTier: none`, gen 2026-05-26 **05:27** (pre-classifier) | — | **vestigial** (no producer, no consumer — verified) | remove (Boz sign-off) | runtime reads `default.json` only; nothing reads this file |

### 1c. Stranded one-shot / migration scripts (all `vestigial` unless noted)

`merge-london-plane.js`, `migrate-add-styles.js`, `normalize-manifests.js`,
`backfill-quality-0.js`, `_restore-bak.js`, `batch-lowpoly.js`, `survey-low-poly.js`,
`_quarantine-empty.js` — completed migrations / recovery one-shots, no wired caller.
`normalize-source-units.js`, `republish-all.js`, `split-group-shots.js` — **duct-tape**
(on-demand operator tools, still occasionally useful; keep, don't dispatch). `atlas-pack.js`,
`atlas-survey.js`, `roster-coverage.js` — **real** (imported by bake-look / serve.js).
Only `dev:arborist` (`node --watch arborist/serve.js`) is wired in `package.json`; every
other script is invoked via serve.js endpoints or by hand. **Recommend a single
`arborist/_attic/` sweep** for the completed one-shots (separate Boz-signed brief; evidence
of completion per script before moving).

---

## 2. ⚠ HEADLINE CONFLICT — the heroTier classifier scores against the WRONG camera target

**This is the single most important finding, and it gates the LOD payoff (§7).**

- `bake-trees.js:247` hardcodes `const FALLBACK_HERO_TARGET = [400, 45, -100]`, with the
  comment *"Mirror of StageApp.FALLBACK_HERO_SUBJECT / Scene.HERO_TARGET (both [400,45,-100])."*
- `bake-trees.js:310`: `const target = Array.isArray(heroPan.subject) ? heroPan.subject : FALLBACK_HERO_TARGET`.
- The slab's `heroSubject` is **`null`** (`public/baked/lafayette-square/scene.json`), so the
  classifier uses `[400,45,-100]`. `default.json`'s `heroTierMeta.target` confirms it: `[400,45,-100]`.
- **But every runtime camera now aims at the ARCH.** `src/lib/heroSubject.js#resolveHeroSubject`
  resolves `null → archPoint(arch.values)` = **`[1584.3, 45.5, -528.2]`** (computed live from the
  slab's `arch.values`). Vernier's 2026-05-26/27 camera fix routed Production/Preview/Stage
  CameraRig through this resolver. The classifier never calls `resolveHeroSubject` and never reads
  `arch.values` — it tests `Array.isArray` + falls back to a literal. **This is the textbook
  `project_camera_framing_slab_contract` failure mode** (the memory's exact wording: "runtimes test
  `Array.isArray` + never re-run resolvers, so an unresolved designation silently falls back").

**Consequence:** the shipped `mesh`/`impostor`/`cull` split (361/362/22 in `default.json`) was
computed for a camera looking at a point **~1200 m away** from where the hero camera actually
points. Prominence, centrality, occlusion, and the cull frustum are all mis-aimed. The QC overlay
Jacob would eyeball at the A→B seam is showing a classification for the wrong shot.

**Compounding staleness:** `default.json` was baked 2026-05-26 **15:17** with `fovDeg 22` and the
old keyframes; the slab now carries **3** hero keyframes (Détente's rework + Jacob's authoring),
kf0 `[-339,107,371]`. `bake-trees` reads keyframes live from the slab, so a re-bake picks the new
pan up — but the target bug means a naive re-bake still mis-aims.

**Fix (for the gated brief, not now):** lift the hero-target resolution in `bake-trees` to the
shared `resolveHeroSubject` (pass `scene.arch.values` + the slab building index), exactly as the
three runtime cameras do. Then re-bake. Cross-ref: this is the same root cause class as the
deployed-camera bug Vernier already fixed for the cameras — the tree classifier is the one
remaining consumer that never got migrated to the shared resolver.

**Cross-domain note (LS App pathologist):** `src/components/Scene.jsx:51` still defines
`HERO_TARGET = [400,45,-100]` and uses it at `:65` (`target: HERO_TARGET`). Per the memory the
CameraRig resolves the arch via `resolveHeroSubject`, so this PRESETS literal is likely itself a
stale/over-ridden remnant. Out of my surface — flagged for the Scene.jsx owner.

---

## 3. Conflict / cruft narrative (everything else)

1. **Stale duplicate bake `lafayette-square.json`** (vestigial). Two parallel bakes exist:
   `default.json` (live, heroTier-classified, the only file the runtime fetches) and
   `lafayette-square.json` (745 inst, `heroTier: none`, no producer, no consumer). Almost certainly
   a remnant from when `bake-trees --look lafayette-square` was run by hand. Safe to remove with
   sign-off; the *directory* `baked/lafayette-square/` (atlas, scene, ground, buildings) is live and
   must stay — only the sibling `.json` file goes.

2. **Hard-wired bake path** (duct-tape). `BAKE_URL = baked/default.json` is hardcoded while the
   atlas already resolves per-`lookId`. Trees are "baked globally, not per-Look" *by current
   policy*, but the hard-wire blocks per-Look placement variants — a productization seam
   (slab-field). The in-file comment flags it ("for now").

3. **Two stale header-doc references** (doc-drift, not dead code):
   - `tree-bounds.js` header names `publish-glb` (no longer imports it) and
     `backfill-canopy-radius.js` (never existed / was the discarded Phase-A plumbing per Azimuth
     finding #7) as its consumers. Real consumer: `bake-look.js` only.
   - `build-index.js` header says *"Used by InstancedTrees to build the picker pool."* The live
     picker was removed long ago; `index.json` is consumed by `bake-trees` + `serve.js`. The
     `InstancedTrees.jsx` header even says "no index.json."
   Both are cheap fixes; both actively mislead a reader auditing dataflow (they cost me a
   verification pass — see §6).

4. **Raw-GLB parity gaps** (2): `CanaryScene` (duct-tape, documented known-gap) and `Grove`
   (intentional low-fi). Canary renders trees unlit/untinted because it bypasses the atlas material
   — the capability statement reads as nonsense, the matrix's dead-detector tell. The shared hooks
   (`stampTreeVertexAttrs`, `applyBarkUniforms`, `injectFoliageSway`) are already exported from
   `treeAtlasMaterial.js`; Canary just needs to mount them. Folds naturally into the
   Meteorologist's in-flight arc.

5. **`computeTier` bark-altitude bands calibrated to retired camera constants** (duct-tape). The
   thresholds (150 m aerial / 5 m street) are commented as calibrated against `Scene.jsx PRESETS`
   browse y=600 / hero y=55 — the *pre-slab* hardcoded presets the conformance arc is retiring.
   Functionally still plausible but should recalibrate against slab camera framing (same root issue
   as §2). Conformance-arc adjacent.

6. **Three parallel LiDAR skeleton extractors** (`lidar_extract.py`, `bidirectional_skeleton.py`,
   `lil_vera.py`, `lil_vera_v2.py`) each behind a live serve.js endpoint — real but unconverged.
   Not in the default publish path; flag for a "which skeleton extractor wins" convergence call
   when the LiDAR track resumes. No action this campaign.

7. **`--clean` idempotency:** only `survey-deleaf.js` has `--clean`; it already refuses to delete
   chassis from other producers (procedural/LiDAR) — i.e. it honors
   `feedback_clean_regen_must_be_idempotent_complete`. No new gap found. (The historical Brief-20
   `--clean` loss is already memorialized; not re-litigated here.)

8. **On-demand extract helpers** (`extract-bark-{detail,posterized}.mjs`) run lazily mid-`bake-look`
   instead of at publish time — minor duct-tape, an optimization not a correctness issue.

---

## 4. The bake → slab tree-content contract (coordinate w/ LS App pathologist)

What the slab carries vs. what `InstancedTrees` reconstructs at runtime:

**Slab carries (authored / measured at bake):**
- `default.json`: per-instance `{x,y,z,url,rotY,species,variantId,category,lampGlow,heroTier}` +
  `tiles` (4×4) + `heroTierMeta`. (Scale is baked **into the GLB**, not the slab — runtime renders 1:1.)
- `trees-atlas.json`: `atlas` (color/normal PNG paths, alphaTest, doubleSided), `barkBySpecies`,
  `barkGradientByVariant`, `barkDetailBySpecies`, `barkPosterizedBySpecies`, `deformerBySpecies`,
  `canopyByVariant` (heightM/canopyRadiusM), `tiles`/`tilesByKey`.

**Runtime reconstructs (NOT in the slab — the `stampTreeVertexAttrs` merge contract):**
- `aBark`, `aBarkRegion` (from GLB prim `extras.atlasKind`/`barkRegion`),
- `aWindTier` (radial-distance classifier, thresholds tuned to v1.5 chassis radii),
- `aTreeHeightNorm` (chassis-wide Y scan at merge time),
- `aLampGlow` (slab float → InstancedBufferAttribute),
- `aHeroTier` (slab string → 0/1/2 InstancedBufferAttribute),
- per-instance world matrices, primitive→single-submesh merge.

This split is deliberate and documented (`project_runtime_merge_vertex_attributes`,
`project_per_vertex_spatial_advection`): runtime-only effect attributes are computed at GLB-merge
time so the bake artifacts stay byte-stable. **Contract risk:** the `aWindTier` and substitution
classifiers assume the clean Brief-20 recentered coordinate frame (trunk at X≈Z≈0). Any chassis
that violates that (a `whole-scene` export — the exact dirty-source class Azimuth caught in finding
#7) silently mis-tiers. Worth a slab-completeness assertion (folds into the conformance Phase-6
parity inventory). The `heroTier` field is the newest slab-content addition and is the §2 conflict.

---

## 5. Blocked-work ledger (what releases when each knot is untied)

| Knot | Status | What's blocked behind it | Releases when |
|---|---|---|---|
| **heroTier target bug (§2)** | open, **newly found** | The entire hero-LOD/impostor payoff (Azimuth Phase B–E) — classification is mis-aimed, so any QC at the A→B seam judges the wrong shot | `bake-trees` adopts shared `resolveHeroSubject` + re-bake → QC becomes trustworthy → A→B seam can actually be judged |
| **Azimuth Phase A→B seam** | parked (per `HANDOFF-tree-hero-lod.md`) | Phases B (impostor producer), C (runtime impostor path), D (tier split), E (cutover) | Jacob QC of the (corrected) classification overlay + the DoF-pivot decision (the brief's "RESUME HERE") |
| **Azimuth Phase C/E rebase on post-conformance `Scene.jsx`** | blocked | Phase C impostor flag in `PreviewApp.jsx` (must adopt the measurement-arc non-destructive `.visible` gate) + Phase E tier render | Vernier's conformance work on `Scene.jsx`/`PreviewApp.jsx` settles; Azimuth rebases on top (Vernier lands first — already true for depth `ca3514f` + camera) |
| **CanaryScene raw-GLB** | open, documented | Meteorologist tree fidelity (trees render unlit in the canary) | Canary mounts the already-exported shared atlas material |
| **`BAKE_URL` hard-wire** | open | Per-Look placement variants | Resolve bake path from `lookId` (productization slab-field) |
| **DoF pivot** (Azimuth "RESUME HERE") | open | Whether the mesh↔impostor score becomes camera-distance bands vs prominence | Operator decision at the seam — note it interacts with §2 (distance bands also need the correct target/keyframes) |

**Note for Boz on sequencing:** §2 must be fixed **before** Azimuth's A→B seam can be meaningfully
QC'd — otherwise Jacob eyeballs a classification for a camera that no longer exists. This re-orders
the LOD arc: *fix the target → re-bake → QC → then* Phase B onward.

---

## 6. Audit-integrity note (where a delegated sweep over-fired)

Per matrix Rule 1 ("classify before cutting; the danger is mistaking duct-tape/load-bearing for
vestigial"): the producer-chain Explore agent labeled **`tree-bounds.js` "VESTIGIAL — caller None"**
in its summary table, *while its own Part 2 stated bake-look uses it*. Direct grep
(`grep -rln tree-bounds`) confirms **`bake-look.js:29` is a live importer** — `tree-bounds.js` is
**real/load-bearing**; only its *header comment* is stale. Recorded as `real` accordingly. This is
exactly the `frustumCulled-looked-vestigial` hull-punch the campaign guards against — flagging it so
the Documentation Officer doesn't propagate the agent's mislabel into the master matrix. (Lesson
echoes `feedback_geometry_briefs_need_artifact_inspection` — verify the artifact, don't trust the
summary.)

---

## 7. ⛔ GATED: LOD / novelty brief (DEFERRED — do not start until inventory reviewed)

Per `HANDOFF-audit-arborist.md`: *"LOD/novelty is the FINAL task… do NOT start solving it until the
audit is done and Boz/Jacob review."* I am **not** writing the full brief here. What the inventory
establishes that the brief must absorb, for the review:

1. **Precondition (blocking): fix §2 first.** The hero-LOD payoff is built on a classification that
   is currently mis-aimed by ~1200 m. The first commit of any LOD brief is "lift `bake-trees` hero
   target to the shared `resolveHeroSubject` + re-bake" — *then* the existing Phase-A machinery
   (which is sound) produces a trustworthy split.
2. **Build on what's live, not what's dead.** The Phase-A scaffolding (`heroTier` emission, the
   3-colour QC overlay, `aHeroTier` runtime attribute, `canopyByVariant` dims via the live
   `tree-bounds.js`, the keying) is all real and shipped — reuse it. The DoF-pivot decision
   (`HANDOFF-tree-hero-lod.md` "RESUME HERE": prominence → camera-distance bands) is still open and
   *also* depends on the corrected target/keyframes.
3. **"More novel" is the open creative question** Jacob flagged — out of scope for the inventory;
   it's the design conversation to have at the reviewed seam (lead lean, prose not question-tool, per
   `feedback_design_via_prose_discussion`).
4. **Don't touch** the shipped ganged-atlas / shared-bark / single-shader-program work beyond
   reusing it; don't fork the impostor producer off `bake-look`.

→ **Hand this inventory to Boz/Jacob. On their nod, I'll write the prioritized LOD/novelty brief
with §2's fix as commit 1.**

---

## Appendix — quick-reference classification tallies

- **real (keep):** InstancedTrees, treeAtlasMaterial, bake-trees, bake-look, publish-glb,
  build-index, tree-bounds, atlas-kind-classifier, decimate-tree, generators, SCA, leaf-attach,
  LiDAR live track, atlas-pack/survey, roster-coverage, ToyTrees, SpecimenViewport/SalonWorkstage/
  ProceduralWorkstage (full production parity).
- **duct-tape (fix, don't just remove):** `BAKE_URL` hard-wire, `computeTier` stale calibration,
  `urlTo*` URL-as-data, CanaryScene raw-GLB, extract-bark-{detail,posterized} lazy-bake,
  on-demand normalize/republish/split-group tools, **bake-trees hero-target literal (§2 — the big one)**.
- **vestigial (remove w/ sign-off):** `public/baked/lafayette-square.json`, Grove `hovered`,
  `Workstage.jsx` (post-18B), completed one-shots (merge-london-plane, migrate-add-styles,
  normalize-manifests, backfill-quality-0, _restore-bak, batch-lowpoly, survey-low-poly,
  _quarantine-empty) → `arborist/_attic/`.
- **doc-drift (fix comment only):** `tree-bounds.js` header, `build-index.js` header.
