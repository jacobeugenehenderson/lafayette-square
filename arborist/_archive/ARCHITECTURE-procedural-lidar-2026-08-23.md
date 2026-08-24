# ARCHITECTURE — procedural + LiDAR internals (RETIRED 2026-08-23)

> Excised from `arborist/ARCHITECTURE.md` on Jacob's ruling that procedural and LiDAR are rot.
> **History, not canon.** Kept because it is a real design record — the growth algorithms and the
> Option-δ scope split were reasoned decisions, not accidents. ⛔ Do not build to any of it.

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

### Monopodial whorl — ⛔ SPECCED, NEVER WRITTEN (retired 2026-08-23)

For conifer. Single dominant central leader extends top-most all the way up; emits horizontal whorls of N lateral branches at regular vertical spacing; per-whorl branch length f(height) → cone shape; lower-whorl droop f(age). Botanically correct; SCA produces wrong topology for any conifer. Conifer path in `generateTreeMesh()` swaps to `runMonopodial(envelope, params)` when shipped.

Phase E priority-dropped (conifer is 7% of inventory); per-conifer-species hero variants (Spruce / Pine / Fir) defer to v1.6 unless G.5 elects a conifer.

---


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

LiDAR provides **skeleton only** in v1.5. Canopy (leaves) stays fully procedural — D.1b leaf emission, rendered **all-mesh** per the live model (`§Tree-render reality at LS`). ⛔ *(This line used to name "Phase F gradient maps + Configuration D rendering"; both of those designs are retired — see the two stubs below. The scope split it describes is unaffected: what LiDAR contributes is the skeleton, whatever the canopy renderer is.)* The LiDAR canopy-point sampling alternative ("use real foliage points to place leaf cards") is reserved for v1.6+ when/if street-view (v2) makes the canopy-fidelity case worth the additional pipeline complexity.

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

