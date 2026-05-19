# Arborist Architecture

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Load-bearing patterns specific to the tree helper. The kit-wide publish-loop pattern lives in `../cartograph/ARCHITECTURE.md`; this doc covers how it specializes for trees + the algorithms + the master-atlas innovation + the cartograph↔arborist boundary.

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
    │  LOD simplification (ratio 0.85 / 0.40 / 0.10 — three tiers)
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

**Foundational stages stay untouched across the v1.5 arc.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js`, and the runtime `treeAtlasMaterial.js` did not fork in any phase — generator output adapts to what they expect. This is the no-parallel-pipeline rule (`feedback_no_parallel_pipeline_for_scenes`) applied to a helper: one publishing channel, one runtime consumer.

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

**Pipeline survives SpeedTree migration unchanged.** SpeedTree-imported species would write the same `manifest.bark` shape and run through the same shader.

### Bark tile wrap is the open shader question (Phase B.2 — deferred)

The `fract`-inside-atlas wrap has unavoidable derivative discontinuity at wrap lines — narrow blurry stripes that "crawl" at close-up Hero. Proper fixes (one of):

1. **WebGL2 texture arrays** — one atlas layer per `materialRef`, `GL_REPEAT`, hardware tiling/mipmap/aniso. Single program preserved via layer-index uniform.
2. **Pre-tile in atlas at bake time** — bake-look composites N×M-tiled version into the atlas tile. Atlas footprint grows N×M for bark.
3. **Separate textures per species** — breaks Bloom's single-program constraint. Not viable.

Deferred until Phase C lands and bark-quality re-evaluation says the wrap-line crawl is the binding constraint. See `BACKLOG.md` Phase B.2.

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
- `BACKLOG.md` — in-flight phases + parked items
- `NOTES.md` — dated architecture record (2026-05-15 maxi-brief is load-bearing)
- `README.md` — runtime contract (slimmer)
- `SPEC.md` — original v1 build specification
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern
- Memories: `project_kit_helpers_pattern`, `project_kit_bin_pattern_for_bulk_numerics`, `project_kit_deploy_path_agnostic`, `project_slab_is_the_instance_identity`, `project_authoring_is_live_production_is_static`, `project_doped_artifact_placecard_edit_pattern`, `feedback_stash_isolate_per_file`, `feedback_no_parallel_pipeline_for_scenes`, `feedback_preview_uses_production_pipeline`
