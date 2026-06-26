# Arborist Architecture

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Load-bearing patterns specific to the tree helper. The kit-wide publish-loop pattern lives in `../cartograph/ARCHITECTURE.md`; this doc covers how it specializes for trees + the algorithms + the master-atlas innovation + the cartograph↔arborist boundary.

> 🌳 **The kit-matcher is the Arborist's architecture now (its front); these patterns are the KEPT spine it rides.** Front door + current state: **`README.md §⭐ START HERE`**; design rationale + staged plan: `scratch/FOREST-BUILDER-KIT-MATCHER.md`. The publish-loop / single master atlas / 2-bind material / decimation levers documented here are **KEPT and ridden unchanged** — no fork (`feedback_no_parallel_pipeline_for_scenes`); the front (rubric → dossiers → matcher → Coverage → Library → Salon, **built** 2026-06-18/20) sits **on top**. New front modules live beside this spine: `rubric.json` · `dossiers/` · `ingest.js`+`ingest-tagger.js`+`library-builder.js` (→ `part-index.json`, `public/library/`) · `matcher.js` · `readiness.js` (→ Coverage) · `salon-options.js` (→ the Salon pickers). Doctrine: **no-cull** — the hero-LOD / DoF arc is **parked** (dormant, not deleted); **Authored-only** active, **LiDAR + Procedural kept as equal peer tracks**.

---

## Publish-loop pattern, applied

Arborist is one of four kit helpers (Cartograph / Arborist / Meteorologist / Courier) per `project_kit_helpers_pattern`. Each publishes one artifact through a pipeline of pure stages. For Arborist:

```
Authoring (Scan or Procedural)
    │  writes operator state under arborist/state/<species>/
    ▼
generate-procedural.js   (Procedural mode)
bake-tree.py             (Scan mode)
    │  emits source GLBs to /tmp
    ▼
publish-glb.js
    │  variant detection (namesSuggestVariants / nodesSpatiallySeparated)
    │  Brief 6.2 stamp — stampAtlasKind on variantDoc (atlas-kind-classifier.js shared with survey-deleaf)
    │  Brief 6 Lever 3 — decimateLeafPrimitives (card-aware leaf reduction, in-line import from decimate-tree.mjs)
    │  Brief 6.2 Lever 5 — decimateBarkPrimitives (connected-mesh bark, MeshoptSimplifier.simplifyWithAttributes at higher error tolerance, Linden-class only)
    │  Brief 6.3 Lever 6 — decimateLeafPrimitivesConnectedMesh (connected-mesh leaf, same machinery, leaf-side tuning: uvWeight 1.0 / error 0.02, Linden-class only)
    │  Brief 6 Lever 4 — adaptive simplify-to-bracket per LoD tier (replaces fixed 0.85/0.40/0.10)
    │  manifest emission, helper-mesh filtering, normalizeScale
    ▼
public/trees/<species>/{skeleton-N-lod0/1/2.glb, tips-N.json, manifest.json}
public/trees/index.json
    │
    ▼
bake-look.js              (per-Look, called by Grove on roster change)
    │  unifyAtlases — sha1-dedupes bark + leaf tiles across the roster
    │  emits master color + normal PNGs
    │  surfaces barkBySpecies into trees-atlas.json
    ▼
public/baked/<look>/trees-atlas.json + master PNGs
    │
    ▼
bake-trees.js             (substitution + per-placement geometry)
    │  pickVariant: speciesMap.map?.[parkSpecies] wins first; category fallback
    │  emits per-Look placement-substituted GLBs
    ▼
public/baked/<look>/trees/<species>/...
    │
    ▼ (runtime — consumed unchanged by deployed runtime)
src/components/InstancedTrees.jsx
```

**Foundational stages stay untouched across the v1.5 arc.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js`, and the runtime `treeAtlasMaterial.js` did not fork in any phase — generator output adapts to what they expect. This is the no-parallel-pipeline rule (`feedback_no_parallel_pipeline_for_scenes`) applied to a helper: one publishing channel, one runtime consumer. **Brief 6 (Spindle, 2026-05-22) + Brief 6.2 (Adze, 2026-05-23) + Brief 6.3 (Gnomon, 2026-05-23) extend `publish-glb.js`** with tree-aware decimation: leaf-card reduction (Lever 3, importable from `decimate-tree.mjs`), connected-mesh bark decimation (Lever 5, ditto), connected-mesh leaf decimation (Lever 6, ditto), adaptive simplify-to-bracket (Lever 4 inside `emitLod`). The pipeline shape and the no-parallel rule are preserved — the publish step gets richer, but the publishing channel stays singular. **Topology discriminator across the leaf levers:** all three leaf-touching levers gate on `extras.atlasKind === 'leaf'`, then split on `max-vert-use`: Lever 3 owns card-based (`=== 1`, e.g. Robinia's 4-vert quads), Lever 6 owns connected-mesh (`> 1`, e.g. Linden's sculpted leaves). Disjoint by construction — a leaf prim is never touched by both. Lever 5 (bark) and Lever 6 (leaf) gate on disjoint `atlasKind`, so their order is irrelevant. **Decimation-arc floor finding (Gnomon, Brief 6.3):** with Levers 5+6 both firing, Linden's lod2 still misses bracket — but the floor-bearer is now provably the **bark** prim, whose attribute-aware (UV-locked) simplify floor is ~57.7K tris regardless of error budget; the post-Lever-6 leaf prim collapses freely to ~100 tris under emitLod and is no longer a floor-bearer at any LoD. Clearing lod2 on Linden-class connected-mesh chassis is a Lever-5/Lever-4/bracket problem, not a leaf problem — see `scratch/brief-6.3-leaf-decimation-survey-gnomon.md`. **`arborist/atlas-kind-classifier.js`** is the single source of truth for LEAF/WOOD/AMBIGUOUS keyword classification, imported by both `publish-glb.js` (stamps `extras.atlasKind` on raw vendor variantDocs so the decimation gates fire) and `survey-deleaf.js` (chassis emission). Per [[feedback_classifier_keyword_cross_check]] — one keyword set, two consumers.

**Botanical mature height ships through `publish-glb.js#normalizeScale` (2026-06-25, `393c3646`/`bac11a43`).** `normalizeScale` now targets each species' **dossier mature height** (`required["chassis.size"].target`) instead of a per-category `TARGET_HEIGHT` — so trees render relatively-correct in LS (a sugar maple ~21m towers over an ~8m dogwood), matching what the Salon preview shows. For roster species without a full dossier yet, `arborist/mature-heights.json` is an explicit **stopgap** (only `chassis.size` for `oak_bur`/`oak_white`/`blackgum`/`linden`) until real dossiers land (`project_dossier_annotation_is_first_class_ip`). ⚠️ **Flat-key gotcha:** dossier `required` uses rubric-axis-id keys (`required["chassis.size"]`), NOT nested (`required.chassis.size`) — the nested path silently no-op'd both the preview scale and the bake until corrected. A slab baked before this lands shows the old 12m-category trees → fix is a clean full `/grove/bake`.

**⭐ Weight vs. canopy-density are SEPARATE owners — do not conflate (2026-06-24).** The tree-**weight** win is the **bark smooth-weld** (`smoothWeldBark`, decimate-tree.mjs — recomputes smooth normals + welds the flat-shaded vendor soup so `simplify` can collapse bark by *topology*; **independent of the per-LOD `error`**). **Canopy density** is owned by each LOD's `error` in `publish-glb.js#LODS` (looser error → the bracket walk collapses more leaf CARDS). These are orthogonal: you can have light bark AND a full canopy. **`LODS` is the per-LOD policy, and lod1 is the HERO LOD** — both the Grove gallery (`serve.js#/grove` renders lod0/lod1) and the LS hero view render it, so **lod1 must keep a full canopy** (`error` 0.002). **lod2 is the far/overhead browse LOD** where leaf sparsity reads fine + DoF covers it, so it stays loose (`error` 0.05) for weight. ⛔ Regression bankrolled: `6c3ff5e5` loosened lod1 `error` 0.002→0.02 to shed weight via leaf-collapse — but that thinned the hero canopy ~90% (birch lod1 1,620 of 15,659 cards), surfacing as "Grove/hero trees are sparse specks" while the live Salon (no `publish-glb` decimation) looked correct. Reverted in `4f9c9a77`. The right place to shed lod1 weight is *not* the leaf `error` — and as of 2026-06-25 it's *not* the per-context cull arc either (see the tree-render reality below).

---

## Tree-render reality at LS (2026-06-25) — all-mesh ship; geometry by ROLE-at-bake; impostors PARKED

This is the load-bearing as-built of how Arborist trees actually render in production today, and the doctrine that governs how that changes. Forward plan: `BATON-tree-render-next.md`.

**Trees ship ALL-MESH.** `bake-trees.js#HERO_TIER.PROM_THRESHOLD = 0` ("⭐ DEMO / SHIP 2026-06-25: EVERY visible tree → full MESH") — the full-foliage forest (real lod1 mesh trees, per-tile frustum cull + occlusion cull) is what's live. There is no impostor or opaque-shell tier in the shipped render path. (An earlier aggressive `PROM_THRESHOLD = 0.06` Phase-A bake routed most trees to impostor; it was **reverted** to all-mesh.)

**Geometry representation = a per-placement ROLE decided at BAKE, not live camera distance.** The ladder is `lod0 / lod1 / lod2 / impostor`; which one a placement gets is decided once at bake by its role (park/focal → real lod; environment-fill + far/occluded → impostor), **never swapped at runtime by camera altitude/distance.** Consequences encoded in the renderer:
- `bake-trees.js#classifyHeroTiers` is the **role oracle** — it tags each placement `mesh | impostor | cull` against the known camera tracks (per-pose coverage×centrality prominence + occlusion by nearer botanically-sized canopy disks, `OCC_FRAC`). It writes `aHeroTier` per instance.
- `InstancedTrees.jsx` chooses geometry via a `lodForRole(inst)` hook keyed on the baked role — **not** a runtime tier driver. The old runtime altitude-swap **`GeoTierDriver` is RETIRED** (`InstancedTrees.jsx` comment, ~line 542). Today `lodForRole` returns `'lod1'` for every role (all-mesh); the hook is the seam where `impostor → billboard` / `cull → drop` will attach when the impostor arc un-parks.
- **Visual distance is owned by the depth gauges** (DoF CoC-by-depth + fog) — "DoF is the cover, not the cut." The far-field look is a depth-gauge concern, orthogonal to which geometry a tree is.

**The impostor / opaque-shell / render-to-texture arc is PARKED, not deleted.** The plumbing is on disk but dormant: `arborist/bake-impostors.js` (analytic layer-card plans → `impostorBySpecies` in `trees-atlas.json`), `src/components/impostorGeometry.js#buildImpostorGeometry` (whole-tree stamped-2D layer cards on the shared atlas material), and `InstancedTrees.jsx#ImpostorSpecies`. Because `PROM_THRESHOLD=0` tags nothing impostor and `lodForRole` always returns lod1, none of it fires in the shipped render. The captured-impostor / RTT-capture path crashed the prod build (it was dev-only) and is kept out of the production renderer. The FUTURE plan — impostors baked **from the real lod0 + the same atlas** (color/season match), normal-mapped, octahedral (Hero) + cake-layer hula (Browse), season-parameterized (winter = bare branches), riding full optical parity — is `BATON-tree-render-next.md`. ⛔ Treat the aggressive per-device impostor-tiering guidance (Phase-A/B prominence bands) as **superseded/parked**, not current.

> ⚠️ **The GPU "gauge" is NOT a perf signal.** The Preview emulator gauge is a count-vs-**interim-fake-budget** verdict (draws/200, tris/1M) that **ignores frame-ms and reads red even with no trees on screen.** It drove a whole tree-degradation arc (the impostor-tiering "gauge is red → geometry must go" reasoning) that was then reverted. **Gate tree perf on real device frame-ms + the operator's eye on the cinematic pan** ([[feedback_instrument_verdict_then_fix]], `[[project_smooth_pan_is_the_only_perf_target]]`) — the pan's visible set is fixed/predictable, so it's the only surface that must be smooth. Fixing the gauge's fake budgets is a backlog item, not a render trigger.

---

## Two-tier substitution (heroes on top of fillers)

Five morphology fillers and ~5 hand-tuned heroes coexist in the same roster.

- **Fillers** at `quality: 2`: `procedural_broadleaf`, `procedural_conifer`, `procedural_ornamental`, `procedural_columnar`, `procedural_weeping`. Catch every park-inventory species that doesn't have its own hero authored yet.
- **Heroes** at `quality: 4`: `acer_saccharum_procedural` (G.1), `ginkgo_biloba_procedural` (G.2), `salix_babylonica_procedural` (G.3), `gleditsia_triacanthos_procedural` (G.4), plus a fifth TBD (G.5).

`bake-trees.js:pickVariant` already implements the lookup: `speciesMap.map?.[parkSpecies]` (preferred-species via `src/data/park_species_map.json`) wins first; category fallback covers everything else. Heroes win their bucket's quality lottery automatically (`4 > 2`).

**Same mechanism is how SpeedTree slots in at v2.** SpeedTree imports get authored at `quality: 4+` and the procedural heroes silently drop out. Substitution is the safety net; heroes are the visible product. No new code; just authoring.

**Hand-authored / vendor species** (e.g. `platanus_acerifolia` ×9) coexist at whatever quality the operator rates them in the Grove. The operator-rated `qualityOverride` field wins over `quality` per `build-index.js` (`effQuality = v.qualityOverride ?? v.quality ?? 0`).

---

## The Grove's single master atlas (load-bearing innovation)

`bake-look.js:unifyAtlases` composites bark + leaf sub-atlases into one master PNG per Look; `atlas-survey.js` dedupes tiles by sha1 hash before pack. Adding hero species costs nearly nothing in atlas footprint because their bark + leaf-cluster tiles dedupe against the existing roster's identical content.

Combined with the Phase B bark shader unification (below), the unified atlas after the v1.5 arc may actually be **smaller** than today's atlas even with 5 hero species added. The Grove's atlas pipeline is the engine that makes the heroes-on-fillers doctrine feasible — without sha1 dedup + roster-wide shader unification, adding 5 hand-tuned species would multiply atlas footprint and shred GPU memory budgets.

`bake-look.js:CONTENT_CAP` caps tiles at `bark 512×1024 / leaf 512×512` (line 39). With ~10 trees in roster (post-Grove curation), ~60% of atlas area frees — raise to `bark 1024×2048 / leaf 1024×1024` for material fidelity bump at no runtime cost. One-line knob; defer until operator finishes Grove curation so the actual roster size drives the cap.

---

## Two algorithms (skeleton-first ordering)

Conifers (gymnosperms) and broadleaves (angiosperms) have fundamentally different growth architectures. Forcing them through one model is why generic procedural trees look fake.

### Space Colonization (Runions 2007) + tropism — `arborist/spaceColonization.js`

For broadleaf / weeping / columnar / ornamental. Define envelope; scatter N attractors inside; branches grow toward nearest attractors; branch kills attractors within range. Tropism vector handles all silhouette variants from one algorithm:

| Morphology | Tropism | Notes |
|---|---|---|
| Broad / symmetric | `(0, 0, 0)` | |
| Weeping | `(0, -0.4, 0)` | needs `envelope.offsetYFrac < 0` so the envelope hangs below trunkBase |
| Columnar | `(0, +0.3, 0)` | upward bias |
| Ornamental | `(0, -0.05, 0)` | gentle droop |

Sympodial topology (two-way splits). Exports `runSCA`, `ENVELOPE_PROFILES`, `DEFAULT_SCA_BY_PRESET`, `mulberry32`.

**Five named envelope profiles** as 2D (t, r) revolution curves: `rounded_oval`, `umbrella`, `tight_column`, `broad_low`, `asymmetric_oval`. Profile r-values multiply by `envelope.width` (`canopyR` semantics) to get max radius at each normalized height. `envelope.offsetYFrac` shifts the envelope vertically against the trunk base — load-bearing for weeping (without it, the willow has nowhere to hang).

**Canonical SCA structural fixes (Phase C.1 / C.1b, 2026-05-16):**

- **Force axial trunk extension** to `envelope.heightStart + envelope.height × branchingStartFrac` (default 0.5; weeping 0.2). Axial nodes (`axial: true`) are skipped by attractor-pull — they just paint a straight trunk to the branching-start height.
- **N-child azimuthal seed** at trunk top: `initialChildCount = 6` children spaced evenly around `TAU`. Per-wedge attractor assignment splits cleanly; iter-1 pull is symmetric.
- **Per-node child cap** (`MAX_CHILDREN_PER_NODE_DEFAULT = 3`): a node that has accumulated 3 direct children stops accepting attractor pull. Capped attractors flow to next-nearest tip. Fixes the runaway-cluster mode where one seed in a dense attractor pocket spawned 200+ tip clumps.
- **Weeping carve-out**: `branchingStartFrac=0.2` + `seedStep = stepLength × 0.5`. Detected by `envelope.profile === 'umbrella'` OR `envelope.offsetYFrac < -0.1`. Future PRESETS overlays naming a weeping morphology pick the carve-out automatically.

These live in `spaceColonization.js`; `generateTreeMesh()` signature unchanged.

### Monopodial whorl — `arborist/monopodialWhorl.js` (Phase E, pending)

For conifer. Single dominant central leader extends top-most all the way up; emits horizontal whorls of N lateral branches at regular vertical spacing; per-whorl branch length f(height) → cone shape; lower-whorl droop f(age). Botanically correct; SCA produces wrong topology for any conifer. Conifer path in `generateTreeMesh()` swaps to `runMonopodial(envelope, params)` when shipped.

Phase E priority-dropped (conifer is 7% of inventory); per-conifer-species hero variants (Spruce / Pine / Fir) defer to v1.6 unless G.5 elects a conifer.

---

## `generateTreeMesh(params) → {barkGeo, leafGeo}` — the load-bearing API

Every phase preserves this signature. UI binds to it; CLI binds to it; tests bind to it. The params object grows fields per phase but never breaks back-compat.

```js
generateTreeMesh({
  // Identity (Phase A)
  species,           // 'procedural_broadleaf' etc. + hero ids
  morphology,        // 'broadleaf' | 'weeping' | 'columnar' | 'ornamental' | 'conifer'
  seed,              // integer; macro seed driving topology

  // Silhouette (Phase D for SCA species; Phase E for conifer)
  envelope: { profile, height, width, asymmetry, offsetYFrac },
  branching: {
    mode,            // 'sca' | 'monopodial'
    phyllotaxis,     // 'alternate' | 'opposite' | 'whorled'
    tropism,         // [x,y,z] gravity bias (SCA)
    attractorCount, influenceRadius, killRadius, stepLength,        // SCA tunables
    whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge,  // monopodial
  },
  sca: { branchingStartFrac, initialChildCount, maxChildrenPerNode },

  // Geometry (Phase C)
  geometry: { lodTier, segmentsPerBranch, radialNoise, flangeRingScale, rootFlareScale, buttressFinCount },

  // Surface (Phase B)
  bark: { materialRef, uvScale, tintBase, tintJitterRange, roughnessOverride },

  // Foliage (Phase F)
  leafCluster: { textureRef, occupancy },
  tintRamp: { summer: {inner, outer}, fall: {inner, outer}, ... },
})
```

**PRESETS** table in `arborist/generate-procedural.js` is the committed canonical seedling defaults. Per-variant `params: {}` overrides in `arborist/state/<species>/seedlings.json` overlay on top — operator's diced + adopted choices.

`resolveVariantParams` does a one-level-deep merge for nested `envelope` / `sca` / `branching` objects, so a partial overlay (e.g. operator dragging just `sca.tropism.Y`) doesn't wipe sibling fields off the PRESET base.

**Hero species are first-class at this same API.** Full per-species `bark` extras (pattern + colors + scale + roughness), `leafCluster` reference, two-stop `tintRamp` per season — signature does not change. Heroes get their own PRESETS entries; `park_species_map.json` routes inventory entries via preferred-species lists. The distinction between "hero" and "filler" is **quality rating + per-species tuning depth**, not pipeline location.

---

## Salon preview ↔ LS runtime material parity (mostly LANDED 2026-06-25)

> ⭐ **UPDATE 2026-06-25 — mostly closed.** **Gap 2 (publish ≠ bake) is CLOSED:** the Grove "Bake → Slab" regenerates-from-source (`generate-salon` → `bake-look` → `bake-trees`, `15682e55`) — published is always fresh; propagation byte-proven (`scratch/measure-leaf.mjs`). **Gap 1 (live-preview ≠ published) is ACCEPTED, not closed — piece-3 locked "good enough"** (`SALON-INTERFACE.md §6`): the Salon keeps its live preview-atlas (instant authoring), and since Brief 7 it renders through the **same `treeAtlasMaterial`** as runtime (**no shader daylight**); the residual is only that the preview's *artifact* (per-composition atlas) differs from the published one — theoretical, since the published path is proven faithful. Revisit only if a real divergence surfaces. The TARGET block at the end is now largely realized (the Salon UI is the **plate-rack** — `SALON-INTERFACE.md`). The AS-BUILT detail below stays as the troubleshooting reference.

> ⚠️ **AS-BUILT REALITY (corrected 2026-06-23 — read this before the doctrine below).** The doctrine in this section — *"the Salon preview IS the published artifact, no daylight"* — is the **goal we are building toward, not what the code does today.** Today there are **two daylight gaps**, and they are the direct cause of the recurring *"leaf/bark knobs work in the Salon but not in the Grove / LS / the bake"* symptom. Troubleshoot from the flow + gaps below, not from the aspirational doctrine.
>
> **The as-built data flow (file:line in `serve.js`):**
> ```
> compose in Salon  (arborist/state/<id>/compositions.json)
>   ├─►[LIVE PREVIEW]  POST /salon/generate → generateSingleCompositionGLB @ LOD0
>   │     = what the Salon shows. Instant. Reflects every knob.          ← "Salon truth"
>   └─►[PUBLISH — explicit, PER-SPECIES]  POST /salon/:id/publish  (serve.js:1389)
>         → node generate-salon.js --species <id>
>         → THE ONLY regenerate-from-source (leaf-size, bark, authored transform live here)
>         → public/trees/<id>/skeleton-{lod0,1,2}.glb + manifest          ← "published truth"
>               └─►[BAKE — explicit]  POST /grove/bake  (serve.js:1100)
>                     → bakeLook()   repacks the master atlas FROM published GLBs (:1108)
>                     → bakeTrees()  substitutes placements                        (:1111)
>                     → public/baked/<look>/…  = the slab            ← "Grove + LS truth"
> ```
>
> **Gap 1 — live-preview ≠ published.** The Salon preview is a *different artifact* (`generateSingleCompositionGLB` @ LOD0) than what `generate-salon` publishes (LOD0/1/2). They can diverge.
>
> **Gap 2 — publish ≠ bake.** `/grove/bake` calls **only** `bakeLook + bakeTrees` — it **never** calls `generate-salon`. It repacks whatever GLBs were *last published per species*. Edit a composition, skip the per-species republish, and the bake ships **stale geometry**. (This is the README's documented *"does not yet regenerate-from-source"* gap + the "May-25-vs-June-leaf trap.")
>
> **Symptom → cause → fix:**
> | Symptom | Cause | Fix (today) |
> |---|---|---|
> | Knob works in Salon, not Grove/LS | Gap 1 + 2 — Salon = live preview; Grove/LS = stale published-then-baked GLBs | `POST /salon/:id/publish` **each** edited species, *then* `/grove/bake` |
> | Hard-refresh doesn't fix it | Stale artifacts are **on disk**, not a browser cache | republish + rebake (above) |
> | A species shows pre-edit ("pre-leaf") after a bake | That species wasn't republished before the bake; or it has **no Salon composition** (raw vendor GLB, e.g. `platanus_acerifolia`) so the leaf knobs structurally can't reach it | republish composed species; vendor-only species need a composition or re-procurement |
>
> **The decided TARGET (operator, 2026-06-23) — NOT yet built:** **autosave** (no manual per-species publish) → **fold regenerate-from-source into the bake** so *published is always fresh* (closes Gap 2) → **all three surfaces render the published artifact**, retiring the separate live LOD0 preview (closes Gap 1) → a **green-light readiness gate** decides Grove/bake membership (*not all green = not ready = doesn't bake*) → **strip the Salon UI** toward "fashion plates." **LoD stays dormant-not-deleted** — dropping it rides on the *unproven* bet that DoF far-blur can replace LoD swaps (see the DoF eval; the far-field perf mechanism is orthogonal to this WYSIWYG parity). When this lands, the doctrine below becomes literally true and this AS-BUILT block retires to NOTES.

**The doctrine (the TARGET this section describes):** the Salon Workstage preview should BE the published artifact, rendered live — not "similar to," not "two consumers of the same material." The bake chain (compose → generate-salon → bake-look → bake-trees) is the slab boundary that publishes whatever the Salon authored; LS is where that published slab gets consumed. The aim is **no daylight** between Salon preview and LS render that the operator must step across to verify their work. *(Today: see the two gaps above.)*

**Sequencing (as-built — the explicit two-gesture model; the target collapses this to autosave + one bake):**

```
[operator iterates in the Salon]              ← AUTHORING (must be visually complete here)
       ↓ Adopt
[operator hits Re-publish species]            ← STAGE TO LIBRARY (authoring side)
       ↓ generate-salon → publish-glb
       ↓ rebuild index + syncLookRoster (metadata)
[species artifacts in public/trees/<species>] ← STAGED (library), slab untouched
       ↓
[operator opens Grove, hits Bake]             ← SHIP TO SLAB (production side, explicit)
       ↓ bake-look → bake-trees (+ Vellum posterized extract)
       ↓ ════════ SLAB BOUNDARY ════════
[scene.json + trees-atlas + per-Look GLBs]   ← FROZEN ARTIFACT
       ↓ load
[InstancedTrees.jsx renders in LS]            ← CONSUMPTION
```

**Gesture split (Brief 14, Lintel 2026-05-23):** Re-publish and the slab bake were a single fused gesture (Re-publish fired `bakeLook` fire-and-forget). They're now two intentional gestures — Re-publish *stages to the library*, Grove *ships to the slab*. This stops rapid Salon iteration from spam-baking the slab and keeps the operator's mental model honest about when LS changes. Per `project_authoring_is_live_production_is_static`. Note this does NOT relax the preview-equals-LS doctrine above: the Salon preview must still be visually complete: the split only changes *when the bake fires*, not *what the operator authors against*.

If a shader effect doesn't fire in the Salon preview, the operator can't author against it. Period. They have no iteration loop. Telling the operator to "verify in LS" routes them past the slab boundary into production — which IS the publishing step, not a verification step. That's the bug that triggered this doctrine (Brief 2.1, 2026-05-22).

**This is `project_preview_equals_ls_literally` applied to the Arborist helper.** Sibling enforcement of `project_stage_consumer_parity` (cartograph-side: Stage and production mount the same consumer file with override props). Forked consumers are drift; the only honest architecture is shared materials.

**The correct implementation shape — one path:**

The Salon preview path (`SpecimenViewport.jsx`) must render through `treeAtlasMaterial.js` directly, with the same `applyBarkUniforms` wiring the runtime uses (`InstancedTrees.jsx`). The preview supplies workstage-context overrides (live composition state, not baked manifest); the material logic is one implementation.

**Wrong shapes to avoid:**

- ❌ Preview renders raw GLB materials; runtime renders through `treeAtlasMaterial`. Two materials, two implementations, drift inevitable.
- ❌ Preview replicates fragment chunks via `onBeforeCompile` patches that mirror chunks living in `treeAtlasMaterial`. Two implementations of the same logic, must stay synchronized forever, drift on the first divergent edit.
- ⚠️ Preview uses `onBeforeCompile` patches for WORKSTAGE-ONLY effects (wind shader, debug overlays). Acceptable IF the chunk is truly workstage-only (never lands in published artifact). Today's wind patches are this case — and even they are drift-adjacent; consolidation candidate.

**The criterion every brief touching `treeAtlasMaterial.js` carries:** *Effect visible in Salon workstage preview at parameter authoring time, in the live composition state, without going through bake → reload LS.* The brief is unshipped until this is true. Per [[feedback_salon_preview_is_authoring_surface]] (2026-05-22, caught on Brief 2.1).

### Geometry-parity corollary: the authored transform bake (Brief 19, Quartz 2026-05-25)

The parity doctrine is not only about *materials* — it binds *geometry* too. The Salon gnomon gizmo authors a per-composition transform (stand-up / center / scale a mis-oriented chassis); that correction must ship in the published GLB **byte-faithfully to what the viewport displayed**, or the operator authored against a lie.

The load-bearing subtlety: the viewport does NOT render the chassis in a naïve `T·R·S`-about-origin frame. `SpecimenViewport.jsx`'s `<Skeleton>` composes (outer→inner)

```
display(v) = R · S · T_posOffset · T_autocenter · v
```

where `T_autocenter` (from `computeDominantTrunk` — bottom-5%-Y-slab densest-XZ-cell centroid) re-centers the dominant-trunk base on the bullseye **before** the authored transform. So rotation/scale pivot about the **trunk base**, and posOffset lives *inside* scale+rotation. Real chassis are off-origin ([[project_chassis_frame_not_origin_centered]]), so this is not academic — a flip baked about the group origin lands the tree metres from where the viewport showed it.

`generate-salon.js#bakeAuthoredTransform` therefore bakes the **conjugated** transform

```
v' = T_autocenter⁻¹ · R · S · T_posOffset · T_autocenter · v
```

(operator-chosen "in-place" semantics — the correction pivots about the trunk base, the base stays where it was; the viewport's centering is framing-only). Identity authoring → `T⁻¹·T = I` → geometry untouched (byte-identical, regression-safe). **The bake runs only on the publish path** (`writeMultiCompositionGLB` → `buildCompositionDocument`, after bark+leaf prims and after `bakeAllNodeTransforms` so POSITION == chassis-root-local); `generateSingleCompositionGLB` (live preview) leaves the transform null and the gizmo applies it for display — so the published GLB carries the transform baked **once**, never double-applied at runtime.

**Divergence hazard — defused at the source (Brief 20, Sextant 2026-05-25).** There are now THREE copies of the dominant-trunk algorithm: `computeDominantTrunk` (three.js, viewport), `computeAutoCenterPivot` (gltf-transform, Brief 19 producer), and `computeDominantTrunkBase` (gltf-transform, `survey-deleaf.js` chassis emission). They no longer need active sync-discipline: **`survey-deleaf.js` recenters every chassis to its dominant-trunk base at origin at creation time**, so on the chassis any consumer actually sees, all three return ~origin and **agree by construction** — the viewport's `T_autocenter` and the Brief 19 conjugation both degenerate to ≈ identity (the conjugation becomes plain `R·S·T` about origin). The KEEP-IN-SYNC hazard is "quiet," not removed: it re-arms only if someone RETUNES one copy's `GRID` / slab% / densest-cell rule without the others, which would shift the source frame and let the un-retuned downstream finders re-introduce a non-identity center. The recenter is **single-pass** — the grid estimator (0.5m XZ bins) has a period-2 limit cycle on boundary-straddle trunks, so the residual is sub-grid (≤~1.4m on ~10/241 chassis, <0.1m on 185), not bit-zero; "≈ identity," not "= identity." **Deferred cleanup** (post-verification, NOT done): delete the two now-quiet downstream finders, collapse Brief 19's conjugation to plain `R·S·T`, and lift a single shared dominant-trunk core (the shared-helper lift per [[feedback_classifier_keyword_cross_check]] — held back this brief because there is no precedent for `src/` importing executable `arborist/` JS, and lifting now then deleting two of three callers later is churn). **The chassis frame is now a contract: every chassis ships dominant-trunk-base at ~origin, Y-min at 0** — Sough's wind-frame assumption (Brief 9a `injectFoliageSway`: `X≈Z≈0, base≈0`) and Brief 3A's merge-time deformer pivot can both assume origin.

---

## Bark shader unification (Bloom-stable single program)

**Constraint:** Bloom requires every tree-material variant compile to the same WebGLProgram (`bake-look.js:200` — "non-negotiable"). Per-species GLSL pattern libraries → multiple programs → no Bloom. So bark variation lives in **uniforms**, not branched shaders.

`src/components/treeAtlasMaterial.js` carries (all per-draw, set in `applyBarkUniforms`):

| Uniform | Source | Purpose |
|---|---|---|
| `uBarkTintBase` (vec3) | `scene.materialColors[<species>]` or `manifest.bark.tintBase` | Per-(species, Look) base tint |
| `uBarkTintJitterRange` (float) | manifest | World-XZ hash → per-tree hue jitter range |
| `uBarkRoughnessOverride` (float) | manifest | Per-species roughness clamp |
| `uBarkUVScale` (vec2) | manifest | Tile repetition factor (broadleaf [1.5, 4], weeping [1.5, 2], etc.) |
| `uBarkTileOffset` / `uBarkTileScale` (vec2) | atlas `uvTransform` | Wrap-within-tile bounds |

**Per-vertex gate:** `aBark` attribute baked at runtime-merge time in `InstancedTrees.jsx` from `geometry.userData.atlasKind` (`'bark'` or `'leaf'`). Leaves bypass the retint path; bark fragments retint.

**Fragment shader patches** (via `onBeforeCompile`):
- `<map_fragment>` replaced verbatim with a fract-wrap-inside-tile step: `localUV = fract((vMapUv − tileOffset) / tileScale × uvScale); mapUV = localUV × tileScale + tileOffset`. Gated by `vBark > 0.5 && uvScale != (1,1)`.
- `<roughnessmap_fragment>` patched for per-species roughness clamp, also gated by `vBark`.

**Per-instance hue jitter:** vertex shader passes `vWorldXZ`; fragment hashes world-XZ so adjacent trees of the same species look different but the whole tree is one color. Adopt rotation, scale, and phase jitter all hash `treeId` for stability.

**Per-Look palette override is instant** — `scene.materialColors[<species>]` wins over species default `tintBase` at runtime, no rebake required.

**Per-instance deformer (Brief 3A, Cant 2026-05-25) — vertex-shader displacement.** ⭐ **A1 UPDATE (2026-06-25): the ranges are now MORPHOLOGY-DERIVED, not per-species authored.** The Salon Deformer panel is retired; the per-instance lean/twist/wander defaults come from `generate-salon.js#DEFORMER_BY_MORPHOLOGY` (keyed on chassis `morphology`: broadleaf/conifer/columnar/weeping), injected at `resolveEffective` → `manifest.deformer.range` (proven: an empty `composition.deformer` now emits the morphology range). The table is the single tuning knob (operator). The runtime engine + transport below are **unchanged** — only the *producer* of the range moved (Salon UI → rubric/morphology table), riding the invariant `effective.deformer.range` seam (`SALON-INTERFACE.md §4`; identity-safe). Instance #1 of the rubric-forward rule (author coordinates, resolve parts). The compose-don't-synthesize capstone: one chassis → ~100 distinct reads. Three rigid ops (lean ∘ twist rotation + wander XZ drift) reshape `transformed` BEFORE Sough's wind sway, pivoting about the trunk base = origin (the Brief 20 contract above). Per-species `[lo,hi]` ranges (`uDeformLeanRange`/`uDeformTwistRange`/`uDeformWanderRange`, default `(0,0)` → bit-exact identity) set per-draw via a **sibling** `applyDeformerUniforms` (not a widened `applyBarkUniforms`); per-instance value = `mix(lo,hi, hash(instanceAnchorXZ))`, deterministic, one signature per tree. **Normals stay exact without inverse-transpose** because the ops are rigid rotations — but three.js bakes the normal in `<beginnormal_vertex>` (before `<begin_vertex>`), so the lean∘twist `mat3` is built + `objectNormal` rotated THERE, then the matrix + wander reused on `transformed` in `<begin_vertex>` via `main()`-scope locals. Single compiled program preserved (uniform+attribute branch, no `customProgramCacheKey`). New per-vertex attribute `aTreeHeightNorm` (normalized base→top Y) is computed at **runtime-merge** time (chassis-wide Y-scan, shared LS↔preview via `stampTreeVertexAttrs`'s `fallback.chassisMinY/chassisYRange`) — this is the `project_runtime_merge_vertex_attributes` slot's second consumer (Sough's `aWindTier` was the first; it reintroduces Cork's retired bbox scan, which was always sound). GLB + atlas bytes untouched; `manifest.json#deformer.range` → `trees-atlas.json#deformerBySpecies` (bake-look pass-through) → uniforms. Fires in Salon preview per the authoring-surface criterion above. 3C (canopy asymmetry, branch jitter) is the future per-vertex-displacement consumer that WILL need inverse-transpose — deliberately out of 3A.

**Pipeline survives SpeedTree migration unchanged.** SpeedTree-imported species would write the same `manifest.bark` shape and run through the same shader.

### Per-region bark binding (Phase L Cycle 2 Stage 1 — SHIPPED 2026-05-19 PM)

LiDAR-baked trees (Option δ — see "LiDAR pipeline + Option δ scope" below) carry cylinder-radius metadata per segment. Sugar Maple bark looks different on trunk (heavy furrowed) vs branches (smoother, lighter); the manifest can carry per-region bark spec keyed by a radius threshold:

```json
"bark": {
  "trunk":  { "materialRef": "Bark007", "uvScale": [1.5, 4.0], "tintBase": "#3a2820", ... },
  "branch": { "materialRef": "Bark003", "uvScale": [1.0, 3.0], "tintBase": "#4a3424", ... },
  "regionThreshold": 0.08
}
```

Runtime classifies each cylinder by radius at bake time → assigns `aBark` attribute variant → fragment shader picks per-region uniforms. Single shader program preserved (uniforms-only branching, same Bloom constraint). When `bark` spec is single-value (current procedural pattern, no `trunk`/`branch` split), runtime treats all cylinders as one region — backwards-compatible.

**Carrier (locked Cycle 2 Stage 1):** primitive split. `bake-tree.py` emits a `trimesh.Scene` with two named geometries `trunkBark` + `branchBark` (radius ≥ median → trunk, sections=8; else branch, sections=6). `lidar-publish.js` attaches the per-region Bark photo packs as `baseColorTexture` + `normalTexture` on the matching materials so `atlas-survey.js` picks them up (without a `baseColorTexture` it'd skip the material entirely). `bake-look.js`'s atlas pass reads `mesh.getName()` to stamp `extras.barkRegion: 'trunk'|'branch'` alongside `extras.atlasKind: 'bark'`. `InstancedTrees.jsx` reads `geometry.userData.barkRegion` at runtime merge time, stamps a per-vertex `aBarkRegion` (1=trunk, 0=branch). The fragment shader gates region selection via `uBarkRegionSplit` (per-draw uniform: 1 enables region, 0 falls back to legacy single-spec). Stage 2's Configuration D will add a third+fourth primitive category (`canopyCard` outer-shell + inner-mass points) — the GLB structure inherits cleanly since each category is its own primitive with its own mesh-name marker.

### View-aware bark tiering (Brief 10 — sub-phase A SHIPPED 2026-05-23 by Cork)

`project_view_aware_baking` applied to the bark surface. One uniform — `uBarkShaderTier` — selects the fragment path per bark fragment; same compiled program serves all tiers (Bloom-stable, single-program-doctrine preserved). Three tiers map to three view classes:

| Tier | Fragment work | Atlas inputs | Status |
|---|---|---|---|
| **0 — Aerial** | Brief 2.1 luminance gradient REPLACE; NO Brief 2.1a detail Overlay composite | gradient LUT + bark color | shipped (10A) |
| **1 — Hero** | Brief 2.1 luminance-gradient REPLACE + Brief 2.1a detail Overlay composite | gradient LUT + bark color + bark detail | shipped (10A — current default) |
| **2 — Street** | Full vendor PBR (color + normal + roughness + optional displacement) | gradient LUT + bark color + bark roughness/displacement | falls back to tier 1 until 10C |

**Tier uniform shape (locked sub-phase A).** `treeBarkTierUniform` lives at module scope in `treeAtlasMaterial.js` (mirrors `treeSwayUniforms`); every mounted tree material — LS runtime and Salon preview — shares the same `value`, so flipping it once propagates everywhere. Sub-phase A exposes a debug setter via `window.__setBarkShaderTier(n)`; sub-phase D adds the Salon tier-selector overlay; Brief 11 wires the cartograph SHOT driver. The uniform is the frozen seam.

**Sampling axis (post-review pivot 2026-05-23).** Aerial and hero share the same Brief 2.1 luminance sampling axis (`lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))`) plus the existing `uBarkGradientHashAmp` per-tree modulation on `jh4`. The original draft used a per-vertex normalized chassis-Y axis (`aBarkWorldYNorm`), which read camera-angle-dependent — Overhead vs Ground saw different gradient distributions because different portions of bark surface were visible per framing. Pivoting to luminance gives camera-independent sampling and reduces aerial-vs-hero divergence to one knob: **aerial skips the detail Overlay composite; hero (and street, until 10C) include it.** Encoded in the shader as `barkColor = mix(barkColor, composite, uBarkDetailStrength * step(0.5, uBarkShaderTier))`. No new per-vertex attributes shipped — `aBarkWorldYNorm` retired. The `project_runtime_merge_vertex_attributes` slot (Sough's `aWindTier` precedent) stays load-bearing for any future per-vertex-only consumer (10C displacement is a candidate if vendor packs ship per-vertex displacement gates).

**Salon preset cameras (Brief 13 Vantage, 2026-05-23, refined same session).** Verifying tier work requires viewing the chassis at the camera distance the tier was designed for AND having the matching tier active. `SpecimenViewport.jsx` carries two preset framings (`presetFraming(preset, treeH)`): **Overhead** (`{distance: 0, height: treeH+20, lookAtY: 0, topDown: true}` — literal top-down plan view, camera directly above the trunk axis looking at origin) and **Ground** (`studioFraming` forwarded, `topDown: false`). The camera-state ref contract gained optional `lookAtY` and `topDown` fields; `DollyCam.useFrame` swaps `camera.up` to `(0,0,-1)` while topDown to avoid the +Y-look-direction gimbal singularity, then restores `(0,1,0)` for Ground. In topDown the wheel routes to `height` (altitude) instead of `distance` so wheel-zoom does the intuitive plan-view thing.

The tier auto-binds from the same `useFrame` loop: `topDown` → tier 0; else `distance < 20m` → tier 2 (street), `distance ≥ 20m` → tier 1 (hero). Threshold first-pass; tune by feel. The binding intentionally collapses what the original brief framed as separate Hero/Street preset buttons into a single Ground preset whose tier follows the operator's dolly — wheeling from 25m to 18m flips hero→street live. Cork's `window.__setBarkShaderTier(n)` now PINS the tier (sets `treeBarkTierPinned.value = true`, exported alongside `treeBarkTierUniform` from `treeAtlasMaterial.js`), suspending the auto-bind so the operator can verify cross-pairs like "street tier from the overhead camera"; `window.__releaseBarkShaderTier()` restores auto-bind.

**LS-runtime auto-bind (Brief 11 lightweight, Plumb 2026-05-23).** The same tier-write pattern is mounted in production as `TierDriver` in `src/components/InstancedTrees.jsx`, a sibling of `SwayDriver` inside `ParkPopulation`. Per-frame: `if (treeBarkTierPinned.value) return; const desired = computeTier(camera); if (treeBarkTierUniform.value !== desired) treeBarkTierUniform.value = desired`. Discriminating signal swapped from Salon's `distance-to-origin` to **camera altitude** (`camera.position.y`) because LS has no canonical origin — 745 placements scatter across a ~200m park. Thresholds calibrated against `Scene.jsx`'s `PRESETS`: `y > 150 → 0` (browse default y=600, range 50–4000), `y < 5 → 2` (street eyeHeight 1.73), else `1` (Hero y=55). Both surfaces share the same uniform + pin — pinning in Salon devtools sticks across LS frames and vice versa. The cartograph SHOT-driven per-Look tier authoring (operator authors "this SHOT uses tier X" in design.json) is the v2 follow-up; the lightweight runtime activation makes tier 0's per-fragment savings (skip detail Overlay sample) actually fire in production Browse views.

`H_MAX` 60→120 and `D_MAX` 150→300 stay even though Overhead no longer needs them (distance=0); Ground still benefits when the operator dollies out on a mature chassis. Generic studio-inspection distances; not cartograph SHOT imports — Salon stays helper-internal per `project_kit_helpers_pattern`.

**Identity-safe with no gradient bound.** When `uUseBarkGradient == 0`, both tiers use `legacyBark = diffuseColor.rgb * barkTint` as the substrate (Brief 2 fallback). Aerial just drops the detail composite on top of that substrate; hero keeps it. No black-bark failure mode.

**Posterized substrate swap (Brief 10B Vellum, 2026-05-23).** Under tier ≤ 1 (aerial + hero — v1.5 ship-path), `diffuseColor.rgb` is replaced with a sample from a fifth `barkPosterized` atlas sub-page BEFORE Brief 2.1's luminance math runs. Source: per-bark-ref median-cut palette-quantized PNG (`public/textures/bark/<ref>/posterized.png`, ~25 KB at 256² 16-color indexed; ~50× smaller than vendor `color.jpg`) produced by `arborist/extract-bark-posterized.mjs` — CLI + library entry-point with auto-trigger inside `bake-look.js` AND `salon-preview-atlas.js`, so a fresh checkout never needs a manual prereq. Posterized tile dedupes per-bark-ref (Brief 2.1a precedent); per-species emission rides on `barkPosterizedBySpecies[<species>] = { uvTransform, barkTileUV }` (same shape + species key as `barkDetailBySpecies`). Tier 2 (street) keeps vendor color via `step(1.5, uBarkShaderTier)`-gated mix — forward-compat with 10C street-PBR. Two new runtime uniforms `uBarkPosterizedTileOffset/Scale`; identity-safe when scale=0 (no slot bound, e.g. fresh-checkout fallback or species without `posterized.png`). `localUV` recovery from `vMapUv` lifted to the top of the bark fragment chunk so both the 10B substrate swap and Brief 2.1a's detail Overlay composite share one declaration. Why posterize: kit visual identity is illustrated not photoreal; gradient LUT indexing is sharper on discrete luminance buckets; aerial file-budget savings compound with Brief 11. Atlas growth at LS roster scale: +0.26 MB (5 bark refs after dedup at 7 species). Single shader program preserved (uniform-gated mix; no `customProgramCacheKey` change).

### Bark tile wrap is the open shader question (Phase B.2 — deferred)

The `fract`-inside-atlas wrap has unavoidable derivative discontinuity at wrap lines — narrow blurry stripes that "crawl" at close-up Hero. Proper fixes (one of):

1. **WebGL2 texture arrays** — one atlas layer per `materialRef`, `GL_REPEAT`, hardware tiling/mipmap/aniso. Single program preserved via layer-index uniform.
2. **Pre-tile in atlas at bake time** — bake-look composites N×M-tiled version into the atlas tile. Atlas footprint grows N×M for bark.
3. **Separate textures per species** — breaks Bloom's single-program constraint. Not viable.

Deferred until Phase C lands and bark-quality re-evaluation says the wrap-line crawl is the binding constraint. See `BACKLOG.md` Phase B.2.

---

## Three architecture modes (Rauh / spreading / monopodial)

Botanically, mature trees fall into one of ~23 architectural models in the **Hallé & Oldeman 1970** classification. Three of those are load-bearing for the Arborist's roster — they have **different topologies**, not just different proportions, and no amount of envelope or tropism tuning will produce one from another.

| Mode | Hallé & Oldeman model | Topology | Roster species |
|---|---|---|---|
| **spreading** | Troll's / Massart's (sympodial broadleaf) | Axial trunk stops at branching height. N scaffolds emerge azimuthally at the trunk apex (helically distributed across an upper zone). Scaffolds spread wide via attractor pull — no per-scaffold tropism overlay. | Oak, elm, dogwood, crabapple, willow (with `umbrella`+offsetYFrac for the curtain), most ornamentals |
| **strong-leader** | Rauh's (monopodial broadleaf) | Axial trunk threads through the canopy to `leaderStrength × envelope.height`. Lateral scaffolds attach at N distributed Ys along the chain (between `branchingStartFrac` and 0.9 of envelope height). Each scaffold seed carries a `localTropism` of `[0, leaderStrength × 0.4, 0]` that **propagates to every descendant** of the chain — scaffolds run upward near-parallel to the trunk instead of spreading wide. | Sugar maple, ash, basswood, columnar cultivars, most "central-leader" hardwoods |
| **monopodial** | Massart's whorled (gymnosperm) | Single dominant central leader extends top-most all the way up; regular whorls of N lateral branches at fixed vertical spacing; per-whorl length f(height); lower-whorl droop f(age). Runs through `monopodialWhorl.js` not `runSCA`. | Conifers — spruce, pine, fir (Phase E, pending) |

**Where the modes branch in code:** `runSCA` reads `sca.architecture` (default `'spreading'`). In `spreading` mode it follows the original Phase C.1+D.1a iter-0 path (axial extension to `branchingStartY`, N azimuthally-distributed scaffolds across an upper zone, no per-scaffold tropism). In `strong-leader` mode it extends the axial chain further (up to `leaderStrength × envelope.height`), seeds N laterals at distributed Ys along the chain with a random azimuth per scaffold + a `localTropism` payload, and — when `leaderStrength < 0.95` — also seeds a single apical SCA tip at the topmost axial so the upper envelope still gets growth as a normal spreading-mode top. `runGrowthLoop` reads each node's `localTropism` in the pull-direction step (summed with global `tropism`, not replacing) and propagates it onto each spawned child. Global tropism (e.g. windward lean) composes with localTropism — both apply.

**Why `spreading` is the default for weeping + ornamental:** the curtain morphology depends on apical scaffolds pinned at the trunk top (so the umbrella envelope hangs cleanly below); lateral seeding would scatter the curtain. Ornamentals (dogwood, crabapple, redbud) read as broad-low silhouettes with the spreading topology — Rauh's would give them a wrong "candelabra" form.

**Defense in depth on Lift:** in strong-leader mode the per-scaffold `localTropism` is the canopy's upward push; `scaffoldEmergenceBias` (the operator-facing "Lift" slider in spreading mode) becomes redundant. The UI hides Lift in strong-leader mode AND `runGrowthLoop` zeros `emergenceBias` when `architecture === 'strong-leader'` — so importing a spreading-mode Lift overlay onto a strong-leader slot can't double the upward bias.

`leaderStrength ∈ [0.3, 1.0]` is a single dial: at 1.0 the leader threads through the full envelope and the lateral tropism is `[0, 0.4, 0]`; at 0.5 the leader reaches halfway then becomes a regular SCA tip, and the laterals get only `[0, 0.2, 0]` upward bias (~50% as fasciculate). Operator default 1.0 for the central-leader heroes — drops to 0.5–0.7 to soften toward Massart's.

---

## LiDAR pipeline + Option δ scope (Phase L, 2026-05-19)

The Arborist carries TWO authoring pipelines that ultimately emit the same artifact shape (skeleton GLB + leaves + bark via the runtime atlas). The newer LiDAR pipeline lives alongside the procedural pipeline, not replacing it.

```
                 ┌─ Procedural pipeline ────────────────────────┐
                 │  src/arborist/ProceduralWorkstage.jsx        │
                 │  └─ arborist/generate-procedural.js          │
                 │     └─ runSCA / runMonopodial → skeleton GLB │
                 ▼                                              │
            publish-glb.js                                      │
                 ▲                                              │
                 │  ┌─ LiDAR pipeline ────────────────────────┐ │
                 │  │  src/arborist/LidarWorkstage.jsx        │ │
                 │  │  └─ arborist/serve.js POST /lidar/.../extract
                 │  │     └─ arborist/bake-tree.py            │ │
                 │  │        └─ QSM extraction → skeleton GLB │ │
                 └──┴─────────────────────────────────────────┘ │
                                                                ▼
                              bake-look.js (atlas), bake-trees.js (placement)
                                              ▼
                              public/baked/<look>/trees/<species>/...
                                              ▼
                              InstancedTrees.jsx (runtime, unchanged)
```

**bake-tree.py** is the Python QSM extractor (dated 2026-04-27 — predates the procedural arc). Reads `.laz` point clouds from `botanica/dev/train/`, voxel-downsamples, fits cylinders via slab DBSCAN clustering + parent linking, emits a tapered-cylinder skeleton GLB. Output artifact format is identical to procedural — same `publish-glb.js` consumer, same `bake-look.js` atlasing, same runtime path.

### Cycle 1 refactor — extract-only path (2026-05-19)

The load → voxel → slab-cluster → parent-link pipeline now lives in `arborist/lidar_extract.py` (Phase L Cycle 1) so the LidarWorkstage can drive interactive re-extraction without writing a GLB. Five exports:

| Symbol | Role |
|---|---|
| `load_pointcloud(laz_path)` | `.laz` → Nx3 numpy, XY median-centered + Z floored at 0 |
| `voxel_downsample(pts, voxel)` | hash-bucket voxel downsample (Nx3 → fewer-Nx3 centroids) |
| `cluster_slab(xy, eps, min_samples)` | 2D connected-components via `cKDTree.query_pairs` + `scipy.sparse.csgraph` |
| `extract_skeleton(pts, slab, eps, min_samples, link_max)` | Z-slab clustering + parent linking → `(nodes, edges)` |
| `extract_cylinders(laz_path, voxel_size, min_radius, tip_radius)` | One-shot wrapper — returns `{nodes: [{x,y,z,radius,parentIdx}, ...], stats: {pointsRaw, pointsDownsampled, nodes, edges, cylinders, tips, trunkLike, branchLike, medianRadius, elapsedMs}}` |

`bake-tree.py` imports the first four + `specimen_laz_path`; the cylinder-meshing / tip-extraction / trimesh GLB-export / manifest-emission code stays in `bake-tree.py` (Cycle 2 territory).

`lidar_extract.py` carries a CLI used by `serve.js`'s `POST /lidar/specimen/:treeId/extract`:

```
.venv/bin/python arborist/lidar_extract.py \
    --treeId=10184 --voxelSize=0.03 --minRadius=0.005 --tipRadius=0.02
```

Emits one JSON document on stdout (same shape `extract_cylinders` returns + `treeId` + `elapsedMs`). The HTTP endpoint just JSON-parses stdout and returns it.

**Pre-flight repair (2026-05-19):** `bake-tree.py`'s `KeyError: 'sourceFile'` on every seedling was a schema-drift bug, not a numpy / dependency drift. The serve.js POST `/species/:id/seedlings` body schema doesn't accept / persist a `sourceFile` field; it's always derivable from `treeId` via the same rule `serve.js:specimenLazPath` uses. Both `bake-tree.py` callsites now fall back to `botanica/dev/<treeId>.laz` derivation when `seedling.sourceFile` is absent. Re-verified: both starred `acer_saccharum` seedlings bake clean in 4 s total.

### Workspace render budget (Phase L Cycle 1)

Desktop-class. Single specimen at a time. Visible-cost ceilings:

| Layer | Mechanism | Ceiling (per specimen) |
|---|---|---|
| Raw point cloud | `THREE.Points` with `BufferGeometry` `position` + size-attenuated `PointsMaterial` | ≤1M pts; 60 fps trivially on integrated GPU at desktop res |
| Cylinder overlay | Two `InstancedMesh` draws (trunk + branch), translucent `MeshStandardMaterial` | typical Sugar Maple TLS specimen: ~200–500 cylinders; ~10 K instance-tris total |
| Cardinal helpers | `gridHelper` + ambient + one directional light | trivial |

Bake-step knockdown to LS mobile budget (`publish-glb.js` weld/dedup/simplify at lod1=0.40, lod2=0.10) lives in Cycle 2; Cycle 1's workspace is hi-res authoring, not runtime-budget validation.

**Per-region bark binding** rides the existing bark shader unification (see "Per-region bark binding" above). LiDAR cylinder radii feed directly into the trunk-vs-branch classification at bake time.

### Option δ scope split — locked 2026-05-19 PM

LiDAR provides **skeleton only** in v1.5. Canopy (leaves) stays fully procedural — D.1b leaf emission + Phase F gradient maps + Configuration D rendering (see below). The LiDAR canopy-point sampling alternative ("use real foliage points to place leaf cards") is reserved for v1.6+ when/if street-view (v2) makes the canopy-fidelity case worth the additional pipeline complexity.

**Why this split:** LiDAR's high-value win at LS Hero distance is **trunk topology authenticity** — bark photo wraps onto real-tree geometry instead of parametric tubes, so "the shaders can work harder for the same calories." Canopy-point sampling is a tempting expansion but its visual contribution at LS distances (where individual leaves are sub-pixel) is uncertain and the pipeline complexity is significant. The split captures the high-confidence win without the high-uncertainty investment.

**Mixed-roster heroes:** G.1 Sugar Maple ultimately ships as both LiDAR-baked variants AND procedural variants under the same `acer_saccharum_procedural` species id. Substitution lottery picks among them; per-instance jitter (rotation, scale, hue) diversifies across 88 LS placements. Each baked variant uploads to GPU once; instancing math is identical to procedural-only.

**Workspace separation:** `LidarWorkstage.jsx` is a new third top-level mode in `ArboristApp.jsx` alongside `ProceduralWorkstage.jsx` and `Grove.jsx`. Existing `Workstage.jsx` (legacy Scan-mode UI predating the new pipelines) deprecates after Phase L Cycle 2 ships. See `BACKLOG.md` Phase L for cycle breakdown.

See [[project_configuration_d_canopy_render]] for rendering doctrine + Option δ rationale.

---

## Opposite-phyllotaxis pair-spawn (Phase D.1, 2026-05-19)

The decussate Sugar Maple silhouette signature. `sca.phyllotaxisMode === 'opposite'` switches `runGrowthLoop`'s spawn step from one-child-per-pulled-node to **two children at `pullDir ± sin(θ)·pairAxis`**, where `pairAxis` lies in the plane perpendicular to the parent edge, rotated 0°/90° per generation depth (decussate plane flip).

Key invariants:

- Each non-axial node carries a `pairDepth` field. Scaffold seeds start at 0; each spawn increments. `azim = (pairDepth & 1) ? π/2 : 0` selects which perpendicular axis is the pair axis.
- `spawnIncrement = 2` in opposite mode tightens the C.1b per-node child cap so pair-spawns never exceed cap. **No degradation to single-child** near cap — pairs are atomic; the attractor flows to next-nearest non-capped tip instead.
- The pull vector still drives the *centre* of the pair (each child takes `pullDir × stepLength ± sa·u·stepLength`), so attractors continue to shape growth. The pair only adds the lateral split, not a wholesale departure from SCA.
- Path 2 (in-loop) was chosen over Path 1 (post-pass): cleaner attractor-kill semantics, ~30 LOC, and `pairDepth` generalizes to spiral / whorled phyllotaxis modes.

Trade-off: opposite mode produces ~4× wood and ~10× leaves vs alternate at the same seed (broadleaf-1 baseline). Operator-controllable via the Phyllotaxis dropdown in the Canopy panel section.

---

## Deformers (Phase D.2, 2026-05-19)

Three operator-tunable organic-noise primitives, threaded through SCA + generator + workstage via a new `deformers` nested params group (added to `NESTED_PARAM_KEYS` + `DEFAULT_SCA_BY_PRESET` + server effective payload).

**Trunk wander** (`deformers.trunkWander`, `deformers.trunkWavelength`).
Helper `getTrunkWander(seedN, worldY, wanderOriginY, amplitude, wavelength)` in `spaceColonization.js` returns a deterministic XZ offset at any world Y:

- Anchored at `wanderOriginY` (the flare-trunk seam = `FLARE_H` = 0.4 m by default). Returns (0, 0) for `worldY <= wanderOriginY`.
- Control points hashed deterministically every `wavelength` along Y via `Math.sin(x) * 43758.5453` — the same `seed()` pattern the rest of the generator uses.
- Cosine-smoothed interpolation between control points → tangent-continuous curve (linear-lerp would produce visible corners on a per-vertex displaced trunk).
- Amplitude ramps 0→1 linearly over the first metre above `wanderOriginY` so the trunk emerges smoothly from the planted flare instead of starting mid-amplitude one stepLength up.

The **same wander function** is consumed by **three sites** simultaneously so they stay in lock-step:

1. **Visible trunk geometry** (`generate-procedural.js`) — subdivide the trunk cylinder to ≥8 height rings (1 ring per ~0.3 m), then per-vertex XZ displacement after the cylinder is translated to world coordinates.
2. **SCA root position** — `runSCA`'s root.pos = trunkBase + wander(trunkBase.y).
3. **SCA axial extension** + lift loop — every axial node's XZ offset comes from wander() at its world Y.

Without all three using the same source, the canopy "tears" off the wandered shaft.

**Branch jitter** (`deformers.branchJitter`).
Helper `_jitterPerp(seedN, hashIdx, parentDir, scale)` returns a deterministic perpendicular offset to apply to each SCA branch-spawn. Magnitude = `branchJitter × stepLength` (10% = ~4 cm at default stepLength). Each pair-spawn child gets an independent jitter so the pair doesn't lean as a unit.

**Bark relief** (`deformers.barkRelief`).
Exposes the existing `applyRadialNoise` scale that was hardcoded to 0.05. Operator-tunable from 0–15%.

---

## `atlasKind` extras — stamped at bake, gates runtime shaders

`buildSourceGLB` writes `atlasKind: 'bark'|'leaf'` to each primitive's gltf-transform `extras`. After load (`useGLTF`), the value lands on `mesh.geometry.userData.atlasKind`. Two consumers:

1. **Bark retint shader** (`treeAtlasMaterial.js`, Phase B). Per-vertex `aBark` attribute baked at runtime-merge time from `geometry.userData.atlasKind`. Gates retint, roughness override, and UV-wrap to bark fragments only.
2. **Workstage wind shader** (`SpecimenViewport.jsx`, Phase W preview). Per-material `uIsLeaf` uniform set at patch time from `geometry.userData.atlasKind === 'leaf'`. Leaves layer high-frequency flutter on top of slow sway; bark gets only the sway.

One extras field, two consumers — clean. New consumers (e.g. per-leaf seasonal tint, leaf shadow lighting) drop into the same gate.

`bake-look.js` also writes `atlasKind` at atlas-pack time (with `tile.classification` driving 'bark' / 'leaf' / 'unified'). The `buildSourceGLB` stamp ensures the in-memory workstage preview path also carries the gate, even though it bypasses `bake-look`.

---

## Effective-payload layering (`effective` = DEFAULTS → PRESETS → overlay)

The `GET /procedural/:species/seedlings` endpoint returns each variant with an `effective` field — the FULL resolved params object the kernel will consume, with operator deltas merged onto PRESETS variant base, which is merged onto `DEFAULT_SCA_BY_PRESET[preset]`. **All three layers must be spread in this order**, matching the generator's runtime resolution exactly.

```js
merged[key] = {
  ...(DEFAULT_SCA_BY_PRESET[preset][key] || {}),   // lowest priority
  ...(PRESETS_variant[key] || {}),
  ...(operator_overlay[key] || {}),                 // highest priority
}
```

UI controls bind to `effective`. Without the DEFAULTS layer, controls that reference fields only defined in `DEFAULT_SCA_BY_PRESET` (e.g. `phyllotaxisMode`, `scaffoldEmergenceBias`, default `deformers`) would display `undefined`-fallbacks → snap-back bugs on controlled selects.

**Store-side mirror.** `setProceduralSlotParams` ALSO writes patches into `v.effective` alongside `v.params`. Sliders worked without this (DraftSlider keeps local draft state) but controlled selects (Phyllotaxis, Profile) snapped back to stale values without it. With the mirror, the next render of the panel sees the operator's choice in `effective.sca.phyllotaxisMode` immediately, no server round-trip needed.

---

## Phase F leaf-color architecture (design, 2026-05-19)

Phase F's leaf surface architecture went through three pivots on 2026-05-19. The final shape consolidates three doctrines: vendor-pack binding, year-long tree (annual cycle), and per-Look art-direction overrides. See `BACKLOG.md` Phase F for full pivot history; [[project_year_long_tree_doctrine]] for the year-long manifest schema in detail.

### Layer 1 — Leaf-pack library (greyscale shape + PBR)

Leaf shapes live as vendor or operator-authored PBR packs at `public/textures/leaves/shapes/<pack_id>/`:

- `Color.jpg` — desaturated → luminance value used as gradient-map t-coordinate
- `Opacity.jpg` — alpha mask (shape silhouette)
- `NormalGL.jpg` — per-leaf surface direction (real per-leaf lighting)
- `Displacement.jpg` — optional bevel/relief (defer use to v1.6 unless visible at Hero)

10 vendor packs live at `assets/botanical-reference-hires/LeafSet0xx/` covering ~80% of LS inventory by morphology (palmate via LeafSet010, oak/lobed via LeafSet016, willow/narrow via LeafSet013, redbud/heart via LeafSet004, pine needles via LeafSet019, etc.). README in that directory pre-tags each pack to morphology — canonical source.

**Morphology → pack mapping** lives in (planned) `arborist/leaf-pack-bindings.json` — drives auto-suggested defaults per species in the workspace UI. Coverage gaps (Ginkgo `fan`, Honeylocust `fine_compound`, etc.) are explicit; flagged for operator-authoring or future vendor sourcing.

Per [[feedback_leverage_vendor_pbr_before_authoring]]: operator authoring is for coverage gaps, not the default path. Configuration-by-binding before Photoshop.

### Layer 2 — Year-long tree (annual cycle in manifest)

Per [[project_year_long_tree_doctrine]] (locked 2026-05-19 PM): the species manifest carries its annual phenology cycle. Runtime samples a `uDayOfYear` uniform (Meteorologist-published) and interpolates between authored season anchors:

```json
"leafCluster": {
  "morphology": "palmate",
  "shapeRef": "LeafSet010",
  "annualCycle": [
    { "day":  15, "label": "winter",      "presence": 0.0, "scale": 0.0 },
    { "day": 105, "label": "spring buds", "presence": 0.6, "scale": 0.4,
      "shapeRef": "LeafSet010_spring_buds",
      "gradientFront": [{"t":0,"color":"#7eba5e"},{"t":1,"color":"#aece8a"}] },
    { "day": 196, "label": "summer peak", "presence": 1.0, "scale": 1.0,
      "gradientFront": [{"t":0,"color":"#2a5825"},{"t":0.5,"color":"#3a7530"},{"t":1,"color":"#5a9850"}] },
    { "day": 288, "label": "fall peak",   "presence": 1.0, "scale": 1.0,
      "gradientFront": [{"t":0,"color":"#882010"},{"t":0.3,"color":"#c84015"},{"t":0.6,"color":"#e87020"},{"t":1,"color":"#f8b830"}] },
    { "day": 320, "label": "late fall",   "presence": 0.4, "scale": 0.85 },
    { "day": 350, "label": "shed",        "presence": 0.0, "scale": 0.0 }
  ]
}
```

**Per-anchor fields:** `day` (1–365), `presence` (card alpha 0–1), `scale` (card size 0–1), optional `shapeRef` (per-season shape override — e.g., spring buds use smaller pack), `gradientFront` + `gradientBack` (multi-stop color ramps for front and back of leaf — front/back tinting drives maple-style wind shimmer via `gl_FrontFacing`).

**Sensible defaults per morphology class:** deciduous-broadleaf template carries ~6 anchors (winter / spring-buds / summer-peak / fall-peak / late-fall / shed); evergreen-conifer ~2 anchors (winter-darker / summer-lighter, presence always 1.0). Operators tweak per species from morphology defaults — keeps authoring effort to ~10 minutes per hero for a meaningful annual cycle.

**Runtime shader:** Phase F gradient LUT is per-anchor (256×1 RGBA texture baked at manifest-hash-keyed from gradient stops). Fragment shader samples luminance(`vColor`) → indexes the LUT for current bracket → `mix()` between adjacent anchors weighted by `uDayOfYear`. Per-card alpha multiplied by interpolated `presence`; per-card scale multiplied by interpolated `scale`. Single shader program preserved.

### Layer 3 — Per-Look art-direction overrides

The year-long manifest is the species's botanical TRUTH. Per-Look art-direction overrides ride the existing `scene.materialColors[<species>]` channel, extended to carry both shape-pack AND gradient overrides per (Look, species) pair:

```json
// in public/looks/halloween/design.json
"trees": {
  "speciesOverrides": {
    "acer_saccharum_procedural": {
      "shapeRef": "halloween_bats",
      "gradientFront": [{"t":0,"color":"#1a0008"},{"t":1,"color":"#4a0020"}]
    },
    "quercus_alba": { "shapeRef": "halloween_bats" }
  }
}
```

**Resolution order at runtime:** per-Look override (if present) wins → else year-long annual-cycle interpolation at current `uDayOfYear` → else species default.

Halloween bats, Christmas candy canes, Diwali ornament gold, Pride rainbow, Valentine's pink — all expressible as per-Look override packs on top of botanical defaults. Phase W wind animates override packs identically (bats flutter in canopy). New override packs live at `public/textures/leaves/shapes/<pack_id>/` alongside vendor LeafSet packs — same greyscale + opacity + normal pipeline.

---

## Configuration D canopy render (Phase L Cycle 2 + Phase H supersession, 2026-05-19)

Per [[project_configuration_d_canopy_render]] (locked 2026-05-19 PM): the canopy renders as **outer-shell A2C cards + inner-mass `THREE.Points` point cloud**.

| Layer | Geometry | Material | Cost |
|---|---|---|---|
| **Outer shell** | D.1b leaf cards on camera-facing surface only (~1500 cards/tree, 70% reduction from current 5500) | Phase F gradient-map alpha-blend | Alpha overdraw on ~1500 cards |
| **Inner mass** | `THREE.Points` rendering of canopy-volume samples (algorithmic), size-attenuated | Sampled gradient color + slight bloom | One-to-nine opaque pixels per point — zero alpha overdraw |
| **Skeleton** | Cylinders (LiDAR-baked via QSM or procedural via SCA) | Per-region bark shader | Standard cylinder cost |

**Why this is the architectural pillar of Phase L:** alpha-blend overdraw is the dominant GPU cost in foliage rendering. `THREE.Points` rendering bypasses alpha entirely — interior-mass cost collapses by ~10×. Outer-shell card count drops ~70% (silhouette + camera-facing only). Bloom + film grade in the LS post-FX stack smooths the point-cloud-as-foliage into "foliage volume" — the visual sleight-of-hand is robust at LS Hero/Browse distances.

**Source-split (Option δ):** in v1.5 the inner-mass points are **algorithmically sampled** from the canopy-volume envelope, not from real LiDAR canopy points. The LiDAR-canopy-point alternative is reserved for v1.6+ per the Option δ scope split (see "LiDAR pipeline + Option δ scope" above).

**Supersedes the original Phase H plan** (alpha-test cards for core + A2C cards for shell). Configuration D is strictly better because POINTS HAVE NO ALPHA — the original card-core approach still had alpha-test cost on interior; the new approach has zero. Procedural-only trees that don't (yet) ship through Configuration D fall back to the original Phase H plan; LiDAR-baked trees ship through Configuration D from Phase L Cycle 2.

**LoD progression:** lod0 = dense algorithmic points + cards-shell. lod1 = 30% point subsample + cards-shell. lod2 = alpha billboard or cards-only, no points.

**Single shader program constraint:** Configuration D's outer-shell uses the Phase F gradient-map material; inner-mass points use a sibling material (different draw call, may compile to a separate program — verify at Cycle 2; if true, accept the 2nd program as load-bearing for the architectural win).

---

## cartograph ↔ arborist boundary

Per `project_kit_helpers_pattern`:

- **Arborist owns trees end-to-end.** Cartograph never imports tree code; the runtime imports only the published artifacts and the shared material.
- **No `procedural` token in `src/`** beyond `treeAtlasMaterial.js` extras (which gain bark + leaf shader patches in Phases B + F). Generator + state stays in `arborist/` and `public/trees/`.
- **No fork of foundational pipeline.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js` stay untouched.
- **Per-Look material overrides ride `scene.materialColors`** — same channel cartograph uses for any other authored color override. No tree-specific channel.
- **Stage's Surfaces.Trees panel** rebinds dynamically to `index.json`. No hardcoded species lists in cartograph code.

Stash-isolate every Arborist commit per `feedback_stash_isolate_per_file` — operator's working tree always has unrelated dirty files; each baby plumbs `design.json` / `index.json` via `git hash-object` + `update-index` to stage only the Arborist delta.

---

## Arborist ↔ Meteorologist canary contract

Cross-helper seam for the Meteorologist's CanaryScene hero tree. Mirrors the helper-isolation discipline of the cartograph boundary: no direct imports across helpers, no shared store; the seam is a frozen data contract.

- **Mechanism.** `localStorage` key `meteorologist-canary-tree`, origin-scoped (both helper apps run on the same Vite dev origin). Writing from Arborist fires the browser's `storage` event in every OTHER same-origin tab automatically. Meteorologist's CanaryScene subscribes and reacts.
- **Payload** (JSON-stringified): `{ species: string, variantId: number, lookId: string|null }`. `species` matches Arborist's `speciesId`; `lookId` is the active Look at write time (null if none).
- **Writer call-sites.** Two affordances, identical payload shape: (1) Grove's per-tile hover-card "→ Set as Meteorologist canary" for roster curation; (2) Salon's per-slot footer "→ Set canary" (Brief 8, Linnet) for the Adopt→Republish→canary→storm-test iteration loop. Salon's slot N maps to `variantId N` (matches `generate-salon.js`'s emission order). Salon's button is enabled only when the composition is non-dirty, variantId exists in `public/trees/<species>/manifest.json#variants`, and a Look is active.
- **Why localStorage, not a backend endpoint.** Per-operator UI preference — like Stage's debug-overlay toggle, not authored Look state. Wrong shape for `design.json` / `manifest.json` / serve.js (would survive across machines, leak into deploys, and demand a per-Look schema for a value that's just "what's the operator looking at right now"). Cross-tab via `storage` event is the lightest possible plumbing.
- **Store posture.** `useArboristStore` doesn't hold canary state; it exposes one pure side-effect action `setSalonCanary(species, slot, lookId)` that writes localStorage and dispatches a synthetic `StorageEvent` so same-tab listeners (the Salon active-canary indicator) react too. Same-tab needs the synthetic event because browsers fire `storage` in OTHER tabs only. Meteorologist owns the read.
- **No auto-rewrite on Look switch.** Stale `lookId` is intentional — operator re-clicks to refresh. Auto-update is a future-design call per the Meteorologist contract.
- **Independent ship halves.** Arborist (writer) and Meteorologist (reader) land separately; the contract is the only coupling.

---

## Arborist ↔ Meteorologist wind contract (Phase 7a / Brief 9a, 2026-05-22)

Second frozen seam between the helpers (after the canary contract). Same discipline: no helper-to-helper imports; both helpers import `src/lib/wind-field.js`. ADR at `scratch/wind-contract-phase7a.md` records the design decisions (S1–S5).

- **The module.** `src/lib/wind-field.js` exports `windAt(t, pos, windState) → { force: Vector3 (m/s), intensity: number (m/s) }`, plus `resolveWindState(directive)` and `defaultWindState()`. Pure — identical inputs return identical outputs, no global state.
- **Three temporal scales composed inside `windAt`.** (1) DRIFT = `baseDirection × baseSpeedMps`, scene-uniform. (2) GUST ENVELOPE — a [0,1] slow modulator (~30s period) authored by Phase 6 modulators. (3) GUST SPIKES — `smoothmax`-shaped 1–2 s spikes whose phase is offset per `pos` by `dot(pos, gustFrontVelocity)/|front|²` seconds, so spikes visibly travel across the scene at `|gustFrontVelocity|`.
- **`windState` shape (publisher contract).** `{ baseSpeedMps, baseDirection: Vector3, gustsScale, gustEnvelope, gustFrontVelocity: Vector3 }`. Resolved from the existing tweened directive channel — no new store key, no new React context.
- **Independent gust-front velocity (ADR S2).** `gustFrontVelocity` is independent of base wind, default `baseDirection × 10 m/s`; modulators may author it. Real-world outflow boundaries can outrun ambient wind, and the richer model is the architectural extension (`feedback_spec_compression`).
- **Tree consumer (`InstancedTrees.jsx` + shared `treeAtlasMaterial.js`).** Per-frame `SwayDriver` calls `resolveWindState(tweenedDirective)`, writes drift force + gust parameters into `treeSwayUniforms`. The vertex shader synthesises its own per-tree spatially-advected gust spike from `uGustsScale` + `uGustEnvelope` + `uGustFrontVelocity` — the spatial advection (AC #5) lives in the shader, not the CPU sample point. Multi-scale damping per `aWindTier` (0=trunk, 1=branch, 2=twig, 3=leaf).
- **`aWindTier` is runtime-merged (ADR S4).** Classified per vertex in `InstancedTrees.jsx#meshes` (LS path) and `stampTreeVertexAttrs` (Salon preview path) from local radial distance + Y. Chassis GLBs and `trees-atlas.json` stay byte-identical — the attribute materializes at merge time, not bake time. The pattern's load-bearing slot stayed open through Brief 10A's review pivot — Cork's `aBarkWorldYNorm` was retired in favor of per-pixel luminance — so the next runtime-only per-vertex consumer (e.g. 10C displacement-gate, if vendor packs ship one) still has the precedent.
- **Rustle floor is `injectFoliageSway` (ADR S3).** Always-on, ~5 mm leaf-tip noise gated by `uRustleAmplitude`. Operator-stated 2026-05-22: "very subtle 'rustle' as the 'floor' for ambient 'life'." Wind sway composes additively on top. Calm-weather scene shows rustle floor only; storm swamps it.
- **Retired uniforms.** Phase 5a's `uSwayWindSpeed` + `uSwayWindDir` are removed from the tree side (replaced by `uWindForce`/`uWindIntensity`). Atmosphere still owns `uWindScale`/`uWindDir` for its own cloud advection — Brief 9b retargets Atmosphere onto `windAt` too.
- **Single shader program preserved.** All new logic is uniform-driven; no `#define` branches, no parallel materials. Bloom remains stable.
- **Salon preview parity (`feedback_salon_preview_is_authoring_surface`).** SpecimenViewport's former `userData.__workstageWindPatched` onBeforeCompile patch is RETIRED — the workstage drives the same shared `treeSwayUniforms` the LS runtime drives. One vertex path, two consumers.

---

## Determinism guarantees

- Same `{species, slot, seed, params}` + same on-disk materials → byte-identical published GLBs across re-runs. Verified `sha1sum public/trees/<species>/skeleton-N-lod0.glb` is stable on every phase ship.
- All randomness routes through `mulberry32(seedN × 1664525 + 1013904223)` — same seed stream across Phase D / C.1 / C.1b.
- `bake-look.js` + `bake-trees.js` are deterministic given the same source artifacts (sha1 dedup is content-hash-keyed; substitution is hash-keyed on placement `treeId`).
- `writeIfChanged` touches mtime on no-op (`project_writeifchanged_touches_mtime`) so byte-identical re-publishes don't cascade rebuilds.

---

## Slab pattern: arborist publishes static, cartograph consumes static

Per `project_authoring_is_live_production_is_static`:

- **Authoring (cartograph Stage → Arborist /arborist):** live. Sliders re-render meshes / shaders / atlases on every commit; `scene.materialColors[<species>]` retints in real time without a rebake.
- **Production (deployed LS, Preview):** static. Reads the per-Look master atlas + the published GLBs; everything is frozen at bake time.

The boundary lives at the **`bake-look.js` + `bake-trees.js` invocation** — every authored channel travels through into the per-Look artifact (`trees-atlas.json` carries the `barkBySpecies` block, manifest carries the `bark` spec, etc.). Anything authored-but-not-baked is silently invisible to deployed users (`project_slab_carries_full_authored_product`).

---

## Cross-references

- `FEATURES.md` — operator-facing surface
- `BACKLOG.md` — the live kit-matcher arc + carried-forward open items (May-2026 brief arcs cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`)
- `NOTES.md` — dated architecture record (live + recent; the May-2026 brief diary, incl. the load-bearing 2026-05-15 maxi-brief, is cooled to `_archive/NOTES-2026-05-diary.md`)
- `README.md` — runtime contract (slimmer)
- `SPEC.md` — original v1 build specification
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern
- Memories: `project_kit_helpers_pattern`, `project_kit_bin_pattern_for_bulk_numerics`, `project_kit_deploy_path_agnostic`, `project_slab_is_the_instance_identity`, `project_authoring_is_live_production_is_static`, `project_doped_artifact_placecard_edit_pattern`, `feedback_stash_isolate_per_file`, `feedback_no_parallel_pipeline_for_scenes`, `feedback_preview_uses_production_pipeline`
