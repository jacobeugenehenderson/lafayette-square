# Arborist — work order

Build the **Arborist**, a standalone helper app that authors per-species tree assets and publishes them as artifacts the runtime consumes. Modeled directly on the existing **Cartograph** helper. Read these first, in this order:

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — publish-loop pattern, Looks model, Designer/Stage split.
2. [`../cartograph/README.md`](../cartograph/README.md) — the canonical helper this Arborist mirrors.
3. [`../memory/project_tree_lidar_pipeline.md`](../memory/project_tree_lidar_pipeline.md) — tree-pipeline architecture, dataset notes, runtime memory budget, why this approach.
4. [`../memory/project_tree_model_sourcing.md`](../memory/project_tree_model_sourcing.md) — researched paid + free options; sets context for why we're building this rather than buying.

**This document is the work order. Build to it. Where it omits a detail, ask before inventing — see "Open questions" at the bottom.**

---

## Mission

Replace the procedural `ParkTrees` component (currently muted via `{false && <ParkTrees />}` in `src/components/LafayettePark.jsx`) with a real, species-accurate, GPU-stable tree pipeline.

The whole neighborhood — park trees + future street trees — gets "close enough" foliage for v1: per-species LiDAR-fitted skeletons + per-species leaf atlases. **No interactive editor in v1.** Tree positions come from existing data files (`src/data/park_trees.json`). Manual placement (Plant tool) and Skip's CSV ingest are v1.1 and v1.2; **out of scope here.**

**Tree #1 = Sugar Maple** (*Acer saccharum*). Most-common species in the inventory (61 of 644 park trees) and a direct-hit species in the FOR-species20K dataset (110 specimens). Ship the entire pipeline end-to-end against this one species before scaling to others.

### v1 architecture refinements (revised 2026-04-27)

Two material decisions on top of the original plan, based on inventory analysis and an audit of existing assets:

**(a) Bake ~3 specimen variants per species, not 1.** 61 Sugar Maples sharing one branching structure read as repetition no matter how much you jitter rotation. Three specimens spanning the height distribution (one each near 18 m / 22 m / 26 m, the small/mid/large mature range) give the park three distinct silhouettes per species at trivial extra cost (3 × ~600 KB GLBs, 3 × bake time, picked per-tree via `hash(treeId) % nVariants`). Acceptance: ≥3 variants for Tree #1.

**(b) Leaves use the EXISTING shared morph library, not per-species atlases.** The repo already ships:

- `assets/botanical-reference-hires/` — CC0 4K PBR leaf reference (ambientCG), README documents species/morph mapping (e.g. `LeafSet010 — Sycamore/Maple (palmate lobed) → palmate`).
- `public/textures/leaves/<morph>.png` — 512×512 runtime billboards, one per morphology (`palmate`, `lobed`, `compound`, `heart`, `fan`, `narrow`, …).

The Arborist does NOT author species-specific `leaves.png` atlases. Instead, each species's `manifest.json` references **a morph** (e.g. `"leafMorph": "palmate"`) **and a per-season tint** (e.g. `{ "summer": "#3a7b30", "fall": "#d4801f", "spring": "#7eba5e" }`). The runtime composes: load `public/textures/leaves/<morph>.png` once, apply species tint as a shader uniform per `InstancedMesh`. Stage Surfaces.Trees keeps its existing morph-tab structure; per-species tint comes through `materialColors[<species-id>]` (already wired into Stage's per-Look design.json). This is dramatically less authoring work and aligns with how the runtime already organizes leaves.

**Sugar Maple's morph mapping is `palmate`** — confirmed by `assets/botanical-reference-hires/README.txt`. Default summer tint can start as `#3a7b30` (vibrant grass green); fall tint `#d4801f` (Sugar Maple's signature orange) — the operator iterates from there in Surfaces.

---

## Architectural placement

Mirror Cartograph's directory shape exactly. Pattern from [`../ARCHITECTURE.md` § 4](../ARCHITECTURE.md):

```
arborist/                        # build-side
  serve.js                       # Node backend (port 3334; see "Ports")
  bake-tree.py                   # Python CLI: produces one species' artifact
  pipeline/                      # Python pipeline modules (ingest, QSM, mesh, atlas)
  config.json                    # paths, species map, defaults
  README.md                      # contract — written by you, mirrors cartograph/README.md
  requirements.txt               # Python deps

src/arborist/                    # runtime-side React UI for the helper
  ArboristApp.jsx                # entry, route /arborist
  Library.jsx                    # species shelf (browse, select, bake, inspect)
  Inspector.jsx                  # per-species detail (skeleton preview, params, leaf atlas)
  stores/useArboristStore.js     # zustand state for the helper UI

public/trees/                    # PUBLISHED ARTIFACTS — the contract
  index.json                     # { species: [{ id, label, scientific, bakedAt, variants: N, ... }] }
  <species-id>/
    skeleton-1.glb               # branch-cylinder graph, variant 1 (small mature, ~18 m)
    skeleton-2.glb               # variant 2 (mid mature, ~22 m)
    skeleton-3.glb               # variant 3 (large mature, ~26 m)
    tips-1.json                  # branch-tip positions, per variant
    tips-2.json
    tips-3.json
    manifest.json                # { species, scientific, leafMorph, tints, variants[] }
                                 # leafMorph references public/textures/leaves/<morph>.png
                                 # No species-specific leaves.png — the morph library is shared.

public/textures/leaves/          # EXISTING leaf-card library, NOT produced by Arborist
  palmate.png                    # 512x512, used by maples, sycamore, etc.
  lobed.png                      # oaks
  compound.png                   # ash, walnut
  …                              # see assets/botanical-reference-hires/README.txt
```

**Conventions, must be honored:**

- **One artifact per concern.** `skeleton.glb` is geometry. `leaves.png` + atlas json is foliage. `tips.json` is leaf-attachment positions. `manifest.json` is meta. They are *separate files*, not bundled. Same way Cartograph's bake produces *one* SVG and nothing else.
- **Deterministic.** Same input + same params ⇒ byte-identical output. Use sorted iteration, fixed precision, no timestamps inside the files (`bakedAt` only in `manifest.json` / `index.json`, not in geometry).
- **Pristine.** No internal scaffolding. No "experiment" residue. The artifact is what the runtime renders.
- **Helpers are dev-time tools.** `arborist/serve.js` is local-only. Not deployed.

---

## Inputs

### Primary dataset

**FOR-species20K** — already downloaded by the operator to `botanica/` (relative to repo root). Layout observed at intake (verify before starting):

```
botanica/
  dev/                                # training partition
  dev.zip
  test/                               # test partition
  test.zip
  tree_metadata_dev.csv               # per-tree metadata: species, geometry source, scan params
```

The dataset is documented at https://zenodo.org/records/13255198. Files inside `dev/` and `test/` are individual-tree LAZ point clouds; `tree_metadata_dev.csv` keys them to species + capture metadata.

**Total ~51 GB.** Stays local; `.gitignore` excludes `botanica/`. Do NOT commit any of it.

### Tree positions

`src/data/park_trees.json` — 644 trees in the park, schema `{ x, z, species, shape, dbh, condition }`. Coordinates are **park-local meters** (the park grid is rotated 9.2° CW; see `src/components/LafayettePark.jsx` `GRID_ROTATION`). Species names are common-name format like `"Maple, Sugar"`, `"Oak, Pin"`.

For v1, trust this file. (v1.2 ingests Skip's authoritative CSV.)

For street trees: a fetch script in `arborist/scripts/fetch-street-trees.js` (or extend `cartograph/fetch.js`) should query Overpass for `natural=tree` nodes within the neighborhood bbox and emit `src/data/street_trees.json` with the same schema (positions in **world** meters, no park rotation). Species often missing from OSM — assign a default mix; see "Species mapping & long-tail" below.

### Species mapping

A species mapping file `arborist/species-map.json`:

```json
{
  "Maple, Sugar":     { "speciesId": "acer_saccharum", "tier": "exact" },
  "Maple, Silver":    { "speciesId": "acer_pseudoplatanus", "tier": "cousin" },
  "Maple, Red":       { "speciesId": "acer_pseudoplatanus", "tier": "cousin" },
  "Ash, Green":       { "speciesId": "fallback_deciduous", "tier": "fallback" }
}
```

`tier` is `exact | cousin | fallback`. The runtime + Surfaces panel can show this for transparency. For v1, build out:

- **Exact:** `acer_saccharum` (Sugar Maple).
- **Fallback species:** one `fallback_deciduous` and one `fallback_conifer`. Anything not explicitly mapped uses these.
- (Other species are deferred to v1.x; the mapping just routes them to fallbacks for now.)

---

## Pipeline (Python)

Sequence per species. Implemented in `arborist/bake-tree.py` with helpers in `arborist/pipeline/`.

### 1. Specimen selection

For Tree #1 (Sugar Maple), the operator will manually pick the best specimen from `botanica/dev/<acer_saccharum>/...` after a visual sample. Default selection in `arborist/config.json` until then:

```json
{
  "species": {
    "acer_saccharum": {
      "sourceFile": "botanica/dev/acer_saccharum/<filename>.laz",
      "label": "Sugar Maple",
      "scientific": "Acer saccharum"
    }
  }
}
```

(Where `<filename>.laz` is filled in once the operator picks. Have the agent leave a clear placeholder + log a warning if config points at a non-existent file.)

### 2. Point-cloud ingest

Read the LAZ via `laspy` or `pdal`. Voxel-downsample to ~2 cm resolution to drop noise + accelerate fitting. Output: dense Open3D point cloud.

### 3. QSM fitting (cylinder graph)

**Recommendation: pure-Python QSM port.** Implementations to evaluate, in order of preference:

1. **`treetool`** or similar pure-Python QSM packages from the academic literature — try first; if they integrate cleanly, this is the right call.
2. **Direct implementation** of Raumonen et al. 2013 — bounded scope (RANSAC cylinder fits + branch-graph traversal). Use only if step 1 fails.
3. **MATLAB Engine for Python** with the official TreeQSM — fallback. Adds MATLAB Runtime as a dependency. Avoid unless 1 and 2 are both unworkable.

**Output:** an in-memory list of cylinders, each with `{ position, axis, length, radius, parent_id }`.

### 4. Skeleton mesh

Convert cylinder list → trimesh:

- Each cylinder = a tapered tube (start radius → end radius, since radii decrease with order).
- Weld at branch joints (vertices at parent-cylinder end ↔ child-cylinder start).
- Drop branches below a `minRadius` threshold (default 0.5 cm) to control poly count.
- UV-map for bark texture (cylindrical UV per cylinder is sufficient).

**Output:** GLTF binary (`.glb`) via `pygltflib` or `trimesh.export`.

### 5. Branch-tip extraction

Walk the cylinder graph, collect endpoints of leaf-bearing branches (those below a `tipRadius` threshold, default 1 cm). Emit as `tips.json`:

```json
{
  "species": "acer_saccharum",
  "count": 1247,
  "tips": [
    [x, y, z],
    [x, y, z],
    ...
  ]
}
```

These positions are in **species-local coordinates** (origin at trunk base, y = up). The runtime transforms them per-instance.

### 6. Leaf morph + tint (NOT a per-species atlas)

The Arborist does NOT author species-specific leaf atlases. The runtime uses the existing shared morph library at `public/textures/leaves/<morph>.png`. Each species's manifest specifies which morph it uses and what tints to apply per season. See "v1 architecture refinements (b)" at the top of this document for the rationale.

For Tree #1 (Sugar Maple), the manifest emits:

```json
"leafMorph": "palmate",
"tints": {
  "spring": "#7eba5e",
  "summer": "#3a7b30",
  "fall":   "#d4801f",
  "winter": null
}
```

These are seed values; operators tweak in Stage Surfaces. `null` for winter signals "deciduous, no leaves" — runtime renders the bare skeleton. The per-season tint table is stored in `manifest.json` and the runtime exposes the **active season's tint** as a shader uniform per `InstancedMesh`. Stage's `materialColors[acer_saccharum]` overrides the manifest's summer tint at render time (live, no re-bake).

Morph mapping for the species roster lives in `arborist/species-map.json` (extends the mapping introduced earlier with `leafMorph`):

```json
{
  "Maple, Sugar":     { "speciesId": "acer_saccharum", "tier": "exact",  "leafMorph": "palmate" },
  "Maple, Silver":    { "speciesId": "acer_pseudoplatanus", "tier": "cousin", "leafMorph": "palmate" },
  "Oak, Pin":         { "speciesId": "quercus_robur", "tier": "cousin", "leafMorph": "lobed"  },
  "Ash, Green":       { "speciesId": "fallback_deciduous", "tier": "fallback", "leafMorph": "compound" }
}
```

Authoritative morph reference: [`assets/botanical-reference-hires/README.txt`](../assets/botanical-reference-hires/README.txt).

### 7. Manifest + index update

Write `manifest.json` per species. With multiple specimen variants and the morph+tint model, the schema is:

```json
{
  "species": "acer_saccharum",
  "label": "Sugar Maple",
  "scientific": "Acer saccharum",
  "tier": "exact",
  "leafMorph": "palmate",
  "tints": {
    "spring": "#7eba5e",
    "summer": "#3a7b30",
    "fall":   "#d4801f",
    "winter": null
  },
  "variants": [
    {
      "id": 1,
      "sourceFile": "botanica/dev/<filename-small>.laz",
      "treeH": 18.1,
      "skeleton": "skeleton-1.glb",
      "tips": "tips-1.json",
      "stats": { "cylinders": 312, "verts": 6210, "tipCount": 940 }
    },
    {
      "id": 2,
      "sourceFile": "botanica/dev/<filename-mid>.laz",
      "treeH": 22.4,
      "skeleton": "skeleton-2.glb",
      "tips": "tips-2.json",
      "stats": { "cylinders": 412, "verts": 8942, "tipCount": 1247 }
    },
    {
      "id": 3,
      "sourceFile": "botanica/dev/<filename-large>.laz",
      "treeH": 26.0,
      "skeleton": "skeleton-3.glb",
      "tips": "tips-3.json",
      "stats": { "cylinders": 568, "verts": 12100, "tipCount": 1820 }
    }
  ],
  "bakedAt": 1714172400000,
  "params": { "voxelSize": 0.02, "minRadius": 0.005, "tipRadius": 0.01 }
}
```

Update `public/trees/index.json` to register the species:

```json
{
  "species": [
    {
      "id": "acer_saccharum",
      "label": "Sugar Maple",
      "scientific": "Acer saccharum",
      "tier": "exact",
      "leafMorph": "palmate",
      "variants": 3,
      "bakedAt": 1714172400000
    }
  ]
}
```

The Stage Surfaces panel reads this to populate its Trees tab dynamically (see "Runtime integration" below).

---

## Backend (`arborist/serve.js`)

Mirror Cartograph's serve.js patterns exactly. Local Node service, port 3334. Mounted under `/api/arborist` from the web app's perspective via vite proxy (extend `vite.config.js`).

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/species` | Read `public/trees/index.json` (species library state) |
| `GET`    | `/species/:id` | Read one species' `manifest.json` |
| `POST`   | `/species/:id/bake` | Run `python bake-tree.py --species=<id>`, synchronous; returns `{ ok, ms, species }` |
| `DELETE` | `/species/:id` | Remove a species directory + index entry |
| `GET`    | `/inventory` | Compute the species histogram from `src/data/park_trees.json` (+ `street_trees.json` if present); useful for UI |

The `bake` endpoint **shells out via `execSync`** like Cartograph does (`cartograph/serve.js` line ~290 in the bake handler). Bakes are infrequent and acceptable to be synchronous. If a future bake needs progress streaming, switch to spawn + SSE then; not now.

### Dev integration

Update root `package.json` `dev` script to include the arborist:

```json
"dev": "concurrently -n web,carto,arb -c cyan,magenta,green --kill-others-on-fail \"npm:dev:web\" \"npm:dev:cartograph\" \"npm:dev:arborist\"",
"dev:arborist": "node arborist/serve.js"
```

Update vite.config.js to proxy `/api/arborist/*` to `http://localhost:3334`. Pattern matches the existing cartograph proxy.

### Python

`requirements.txt` should list every Python dep. Suggested baseline (the agent should validate):

```
laspy
pdal           # may need system PDAL; alternative: laspy alone
open3d
numpy
trimesh
pygltflib
pillow         # for leaf-atlas packing
```

Document the Python venv setup in `arborist/README.md` once the agent settles on the actual deps.

---

## Runtime integration

### `src/components/InstancedTrees.jsx` (new)

Replace `ParkTrees` (currently muted in `src/components/LafayettePark.jsx`):

- On mount, fetch `public/trees/index.json` and each registered species's `manifest.json`. Load each variant's `skeleton-<n>.glb` and `tips-<n>.json` (use `useGLTF`).
- Load the shared morph textures from `public/textures/leaves/<morph>.png` (use `useTexture`). One load per morph, shared across every species using that morph.
- Read tree positions from `src/data/park_trees.json` (and eventually `src/data/street_trees.json`).
- Group positions by `(speciesId, variantId)` via `species-map.json` — variant chosen per tree by `hash(treeId) % manifest.variants.length`.
- Each `(speciesId, variantId)` renders as one `InstancedMesh` over that variant's GLB geometry.
- Per-instance attributes: position, Y-rotation (stable from `hash(treeId)`), scale (driven by `dbh`).
- A second `InstancedMesh` per `(speciesId, variantId)` for leaf cards: variant's tips × tree-instances product, sampling the morph texture.
- **Live tint binding.** Per species, look up the active Look's `materialColors[speciesId]` if set; else fall back to the manifest's `tints.<currentSeason>`. Push as a shader uniform on the leaf-card material so Surfaces edits show instantly without a re-bake (mirrors how `SvgGround` already binds live colors — see `src/cartograph/SvgGround.jsx`).

### Stage Surfaces.Trees tab — keep morph rows, add per-species tints

In `src/cartograph/CartographSurfaces.jsx`, the existing **Trees** tab is keyed by leaf morph (`leaf_palmate`, `leaf_lobed`, …). **Keep that.** It maps directly to the shared morph library and is the right axis for "all maple-like trees take this color treatment in this Look."

Add a **second tab** (or a sub-panel) called **Species** that lists every species in `public/trees/index.json`. For each species:

- **Tint** — overrides the manifest's seasonal tint, stored in `materialColors[speciesId]`. The store setter is already wired.
- **Visible** — per-species visibility, via `layerVis[speciesId]`. Store setter already wired.
- **Variants count** (read-only) — informational, e.g. `"3 specimens"`.
- (Density, fall-color override, wind-bias, season override — all v1.x. Pass C territory.)

The morph tab and the species tab compose at runtime — the species tint **wins** over the morph default, when present. If the operator wants `Sugar Maple` distinct from `Silver Maple`, they tint species; if they want all `palmate`-leafed trees to share a holiday theme, they tint the morph.

Other Surfaces tabs (Streets / Blocks / etc.) are unaffected.

### Re-enable LafayettePark trees

Once `InstancedTrees` works, replace the muted line in `src/components/LafayettePark.jsx`:

```jsx
{false && <ParkTrees />}
```

with a mount of `InstancedTrees`, OR delete the `ParkTrees` line entirely if `InstancedTrees` mounts at a higher level. **Don't leave both rendering.**

---

## UI scope (v1)

The Arborist UI at `/arborist` is intentionally minimal in v1. Core surfaces:

1. **Library** (`Library.jsx`)
   - Lists all species in `public/trees/index.json` (already-baked) + species in `species-map.json` not yet baked.
   - For each: name, scientific name, tier (exact / cousin / fallback), inventory count (from `/inventory`), `bakedAt` if any.
   - Click a species → opens Inspector.
   - "Bake" button per species → calls `POST /species/:id/bake`, shows progress modal (mirror `cartograph/BakeModal.jsx`).

2. **Inspector** (`Inspector.jsx`)
   - 3D preview of the species's `skeleton.glb` + leaves overlay (use the same shader the runtime will use).
   - Read-only manifest view (params, stats, sourceFile).
   - For v1: no editing of params, no specimen swapping. Operator edits `arborist/config.json` by hand and re-bakes.

3. **Toolbar** (top, like Cartograph's)
   - Active species selector (drives Inspector).
   - "Re-bake all" button (sequential bake of every mapped species — long, useful occasionally).

**No** plant tool, no positional editor, no density sliders, no per-instance UI in v1. Keep the Arborist surface narrow.

---

## Tree #1 acceptance criteria

The build is complete for v1 when **all** of these are true with `acer_saccharum` baked:

1. `python arborist/bake-tree.py --species=acer_saccharum` runs end-to-end in under ~10 minutes on the operator's Mac for all 3 variants.
2. `public/trees/acer_saccharum/` contains **3 valid skeleton-N.glb files** (one per height variant) and **3 matching tips-N.json files**, plus `manifest.json`.
3. Each `tips-N.json` contains ≥ 200 branch-tip positions.
4. `manifest.json` references `leafMorph: "palmate"` and seed tints for at least summer + fall.
5. `public/trees/index.json` lists `acer_saccharum` with `tier: "exact"`, `leafMorph: "palmate"`, `variants: 3`.
6. The runtime mounts `<InstancedTrees />` and renders **all 61** Sugar Maples from `park_trees.json` at their positions, with Y-rotation jitter, dbh-scale variation, and **variant assignment via `hash(treeId) % 3`** (so the park visibly shows the three skeleton silhouettes mixed in roughly equal proportion).
7. Leaf cards render at every variant's tip positions, sampling `public/textures/leaves/palmate.png`, tinted from the manifest's summer tint.
8. **GPU budget verified.** On the operator's Mac in Stage Hero shot, framerate stays above 50 fps with all 61 trees in view. (Worst-case mobile target is a follow-on; flag it but don't block on it.)
9. Stage Surfaces.Trees `Species` sub-panel lists `Sugar Maple` as a row; color picker edits the per-species tint live (no re-bake).
10. Stage Surfaces.Trees `Morphs` sub-panel still shows `palmate` and editing it still works (existing behavior preserved).
11. Switching Looks (e.g. to a Valentine's Look that tints maples pink) propagates to the trees instantly.
12. The `ParkTrees` line in `LafayettePark.jsx` is replaced (or `ParkTrees` removed entirely).

**Stretch (nice but not required for v1):**

- Wind animation via vertex shader (`uTime` + per-card noise).
- LOD: lower-poly skeleton at far camera distances.
- A second species baked end-to-end (proves the pipeline scales), e.g. Pin Oak via `quercus_robur` cousin → `lobed` morph.
- Seasonal tint preview in the Inspector (cycle through manifest seasons).

---

## Out of scope (DO NOT BUILD)

- **Plant tool / interactive placement editor.** v1.1 work in Cartograph Designer.
- **Skip CSV ingest.** v1.2; one-shot script when his data lands.
- **Per-tree visibility in Looks.** Per-*species* yes (already plumbed); per-tree no.
- **Multiple specimens per species.** One representative skeleton per species in v1.
- **Phone-LiDAR scanning of the actual park.** Deferred per `memory/project_tree_lidar_pipeline.md` — Phase 2, may or may not ever happen.
- **Real shaders for leaves** (subsurface scattering, dappled-light, season transitions). Pass C, after this lands.

---

## Decisions already made — DO NOT re-litigate

| Decision | Choice | Where decided |
|---|---|---|
| Helper directory pattern | Mirror Cartograph (`arborist/` + `src/arborist/` + `public/trees/`) | This document |
| Service shape | One-shot CLI invoked via `execSync`, not long-running Python service | This document |
| QSM implementation | Pure-Python first; MATLAB Engine fallback only if blocked | This document |
| Tree #1 species | `acer_saccharum` (Sugar Maple) | Inventory analysis: 61 in park, 110 in dataset |
| Specimen selection | Operator picks 3 for Tree #1 (small / mid / large mature); auto for species 2+ | This document |
| Variants per species | 3 (small / mid / large from height distribution); per-tree pick via `hash(treeId) % 3` | Inventory analysis 2026-04-27 |
| Leaf source | Shared morph library at `public/textures/leaves/<morph>.png`; per-species tint stored in manifest + materialColors. NOT per-species atlases. | Asset audit 2026-04-27 |
| Sugar Maple morph | `palmate` | `assets/botanical-reference-hires/README.txt` (LeafSet010) |
| Plaques in Street view | Future feature, not part of Arborist | `memory/project_tree_lidar_pipeline.md` |
| Per-Look tree composition | Out of scope; Looks vary styling, not which trees exist | `ARCHITECTURE.md` § 2 |
| Park-scanning fieldwork | Deferred indefinitely; not part of v1 | `memory/project_tree_lidar_pipeline.md` |
| Repo layout | Arborist lives inside `lafayette-square` repo, not separate | Conversation 2026-04-27 |

---

## Open questions — surface to operator, do NOT decide unilaterally

1. **Three Sugar Maple specimen filenames.** All 110 Sugar Maples are TLS scans from the `Xi_2020b` dataset (uniform capture method). Heights span 6.6–28 m, mean 20.8 m. Propose three candidates targeting **~18 m / ~22 m / ~26 m** for the small/mid/large mature trio. Surface filenames + treeIDs from `botanica/tree_metadata_dev.csv` and let the operator confirm before baking. Don't auto-pick.
2. **PDAL system dep.** If `pdal` Python bindings need PDAL installed at the OS level, that's a meaningful install. Surface this with the alternative (use `laspy` + numpy directly) before committing.
3. **Sugar Maple fall tint.** Seed value in this SPEC is `#d4801f` (signature orange). The operator may want to tune from photographs. Surface the seed + offer to swap before persisting in the manifest. Same applies to summer/spring seeds.
4. **Street tree species defaults.** OSM `natural=tree` rarely carries species. The agent should propose a realistic mix for St. Louis residential streets (e.g., 40% silver maple, 25% pin oak, 15% hackberry, 10% honeylocust, 10% sweetgum) and confirm before persisting.
5. **GPU budget on mobile.** v1 acceptance criteria target the operator's Mac. If the agent finds the per-tree leaf-card count blows mobile budget, surface options (LOD, reduced tip density, fewer variants per species) before committing.
6. **Surfaces split — sub-panels vs. unified.** SPEC proposes Stage Surfaces.Trees gets a `Morphs` and a `Species` sub-panel. If that's awkward in the existing UI, propose an alternative (single list with grouping, expandable rows, …) and confirm before building.

---

## Build order recommendation

The agent SHOULD follow this order to surface integration risks early:

1. `arborist/serve.js` skeleton (endpoints stubbed, returning fixtures). Wire `npm run dev`, vite proxy. Confirm reachable from browser.
2. `src/arborist/ArboristApp.jsx` skeleton at `/arborist`. Empty Library page reading `/api/arborist/species`. Confirm round-trip.
3. `arborist/bake-tree.py` — phase by phase: ingest → QSM → mesh → tips → atlas → manifest. Each phase emits an intermediate file under `arborist/_scratch/<species>/`. Ship phase 1 (ingest) end-to-end before starting phase 2.
4. Wire bake button in Library to `POST /species/:id/bake`. Verify it produces files under `public/trees/acer_saccharum/`.
5. `Inspector.jsx` — 3D preview of the baked GLB.
6. `src/components/InstancedTrees.jsx` — runtime consumer. Mount in `LafayettePark.jsx`, replacing `ParkTrees`.
7. Surfaces.Trees rebind to dynamic species list.
8. Acceptance-criteria checklist run-through.

Each step is a commit. Branch off the operator's current working branch.

---

## Cross-references

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — project-wide patterns
- [`../cartograph/README.md`](../cartograph/README.md) — the helper template
- [`../memory/project_tree_lidar_pipeline.md`](../memory/project_tree_lidar_pipeline.md) — full pipeline rationale + dataset notes
- [`../memory/project_tree_model_sourcing.md`](../memory/project_tree_model_sourcing.md) — research on alternatives
- [`../memory/feedback_mount_dont_hide_heavy_3d.md`](../memory/feedback_mount_dont_hide_heavy_3d.md) — heavy 3D children should not mount when invisible (current ParkTrees was muted because of this; InstancedTrees should respect it too)
- FOR-species20K dataset: https://zenodo.org/records/13255198
