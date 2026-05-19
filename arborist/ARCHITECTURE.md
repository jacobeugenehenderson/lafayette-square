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

### Per-region bark binding (Phase L Cycle 2 — design)

LiDAR-baked trees (Option δ — see "LiDAR pipeline + Option δ scope" below) carry cylinder-radius metadata per segment. Sugar Maple bark looks different on trunk (heavy furrowed) vs branches (smoother, lighter); the manifest can carry per-region bark spec keyed by a radius threshold:

```json
"bark": {
  "trunk":  { "materialRef": "Bark007", "uvScale": [1.5, 4.0], "tintBase": "#3a2820", ... },
  "branch": { "materialRef": "Bark003", "uvScale": [1.0, 3.0], "tintBase": "#4a3424", ... },
  "regionThreshold": 0.08
}
```

Runtime classifies each cylinder by radius at bake time → assigns `aBark` attribute variant → fragment shader picks per-region uniforms. Single shader program preserved (uniforms-only branching, same Bloom constraint). When `bark` spec is single-value (current procedural pattern, no `trunk`/`branch` split), runtime treats all cylinders as one region — backwards-compatible.

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

- **Mechanism.** `localStorage` key `meteorologist-canary-tree`, origin-scoped (both helper apps run on the same Vite dev origin). Writing from Arborist (`Grove.jsx` hover-card affordance) fires the browser's `storage` event in every OTHER same-origin tab automatically. Meteorologist's CanaryScene subscribes and reacts.
- **Payload** (JSON-stringified): `{ species: string, variantId: number, lookId: string|null }`. `species` matches Arborist's `speciesId`; `lookId` is the active Look at write time (null if none).
- **Why localStorage, not a backend endpoint.** Per-operator UI preference — like Stage's debug-overlay toggle, not authored Look state. Wrong shape for `design.json` / `manifest.json` / serve.js (would survive across machines, leak into deploys, and demand a per-Look schema for a value that's just "what's the operator looking at right now"). Cross-tab via `storage` event is the lightest possible plumbing.
- **No store touches.** Arborist's `useArboristStore` doesn't track the canary; the write is a one-shot from the click handler. Meteorologist owns the read.
- **No auto-rewrite on Look switch.** Stale `lookId` is intentional — operator re-clicks to refresh. Auto-update is a future-design call per the Meteorologist contract.
- **Independent ship halves.** Arborist (writer) and Meteorologist (reader) land separately; the contract is the only coupling.

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
