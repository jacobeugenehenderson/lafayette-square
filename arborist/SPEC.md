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

Several decisions on top of the original plan, based on inventory analysis, asset audit, and design-conversation refinements. Each of these is now load-bearing — DO NOT re-litigate.

**(a) Bake ~10 specimens per species (configurable), not 1 or 3.** 61 Sugar Maples sharing one or three branching structures still read as clones at street-level zoom. **10 is the sweet spot:** ~6 instances per specimen (good `InstancedMesh` batching), broad silhouette diversity, ~30 min bake time per species. Above ~15 specimens, each adds noise and InstancedMesh batching weakens. Default: 10. Configurable per species (rare ornamentals like redbud may use fewer; sycamores might use more). Per-tree variant pick via `hash(treeId) % nSeedlings`.

**Vocabulary** — finalized 2026-04-27:

- **Specimen** — raw `.laz` from FOR-species20K. Immutable. Hundreds available per species.
- **Seedling** — a *picked* specimen, promoted to the species's curated library, with tune params attached. ~10 per species. Stored in `arborist/state/<species>/seedlings.json`.
- **Variant** — a *baked* seedling, runtime artifact (`skeleton-N.glb`). 1:1 with seedlings post-bake.
- **Pick** — the act of promoting a specimen to a seedling.
- **Tune** — adjusting QSM/leaf-tip params on a seedling before bake.
- **Bake** — committing the seedling library for a species into runtime variants.

**Per-instance shader jitter** — each rendered tree gets a stable per-tree random seed (`hash(treeId)`) that drives a vertex/fragment shader to add variation that no number of seedlings can fake:

- Branch-angle jitter (±15°)
- Branch-length jitter (±10%)
- Crown asymmetry weighting (one side fuller)
- Leaf-card position + rotation jitter
- Leaf tint micro-variation (±3–5% lightness/hue)
- Wind animation phase offset

Cost is negligible (vertex-shader ALU ops). Without this, even 10 seedlings would show repetition at street-level scrutiny. **With it, no two trees look identical.** Wired in `InstancedTrees.jsx` from day one — not a follow-on.

**(b) Leaves use the EXISTING shared morph library, not per-species atlases.** The repo already ships:

- `assets/botanical-reference-hires/` — CC0 4K PBR leaf reference (ambientCG), README documents species/morph mapping (e.g. `LeafSet010 — Sycamore/Maple (palmate lobed) → palmate`).
- `public/textures/leaves/<morph>.png` — 512×512 runtime billboards, one per morphology (`palmate`, `lobed`, `compound`, `heart`, `fan`, `narrow`, …).

The Arborist does NOT author species-specific `leaves.png` atlases. Instead, each species's `manifest.json` references **a morph** (e.g. `"leafMorph": "palmate"`) **and a per-season tint** (e.g. `{ "summer": "#3a7b30", "fall": "#d4801f", "spring": "#7eba5e" }`). The runtime composes: load `public/textures/leaves/<morph>.png` once, apply species tint as a shader uniform per `InstancedMesh`. Stage Surfaces.Trees keeps its existing morph-tab structure; per-species tint comes through `materialColors[<species-id>]` (already wired into Stage's per-Look design.json). This is dramatically less authoring work and aligns with how the runtime already organizes leaves.

**Sugar Maple's morph mapping is `palmate`** — confirmed by `assets/botanical-reference-hires/README.txt`. Default summer tint can start as `#3a7b30` (vibrant grass green); fall tint `#d4801f` (Sugar Maple's signature orange) — the operator iterates from there in Surfaces.

**(c) Bark is parallel to leaves.** Same shared-morph + per-species + per-Look-override pattern. Add `public/textures/bark/<morph>.png` (e.g. `furrowed`, `papery`, `peeling`, `smooth`, `flaky`). Per-species manifest declares `barkMorph`. Sugar Maple = `furrowed`, sycamore = `peeling`, birch = `papery`. For v1 we may ship a single `default_bark.png` until species-specific textures are sourced; the architecture works either way.

**(d) Seasonal variation is shader-driven, not bake-driven.** Six states (bare, buds, flowers, summer, fall, snowy) all come from the *same* baked artifact, modulated by Stage-driven shader uniforms:

| State | Shader uniforms |
|---|---|
| **Bare** (deciduous winter) | `uLeafAlpha = 0` |
| **Buds** (early spring) | `uLeafScale = 0.3`, `uLeafTint = manifest.tints.buds` |
| **Flowers** (spring, species-dependent) | Swap leaf-card texture to `public/textures/flowers/<species>.png`. Per-species opt-in via `manifest.hasFlowers`. |
| **Summer** | Default. `uLeafAlpha = 1`, `uLeafTint = manifest.tints.summer`. |
| **Fall** | `uLeafTint = manifest.tints.fall`. Same density. |
| **Snowy** (winter weather) | `uSnowCover > 0` — branch shader adds white wherever `normal.y > 0.6`. Independent of leaf state. |

Manifest schema gains `deciduous: bool` and `hasFlowers: bool` per species. Conifers set `deciduous: false`. Showy-spring species (redbud, crabapple, magnolia) set `hasFlowers: true` and ship a flower texture; non-showy species don't.

**Authoring split for season:**

- **Arborist** authors per-species seasonal *defaults* (which states are supported, default tints per state, optional flower texture).
- **Stage Looks** author per-Look *active* season (`season: 'fall'`, `snow: 0.6`). A "Halloween Look" pins fall + zero snow. A "First Snow Look" pins winter + 0.6 snow. A "Cardinals Opening Day Look" pins spring + zero snow.
- **Runtime composes** active Look's season → shader uniforms → trees update instantly.

This gives the project a premier showcase axis (seasonal park) at zero extra bake cost. v1 implements all six states in shader; Looks that use them follow.

**(e) Shared materials, not shared panels.** The Arborist's preview viewport renders trees with the *same shaders + textures the runtime uses* via a shared `src/components/tree-materials.js` factory:

```
buildTreeMaterials({ leafMorph, leafTint, barkMorph, barkTint, season, snow })
  → { trunkMat, leafMat }
```

Both the Arborist's workstage canvas and the runtime's `InstancedTrees.jsx` import this factory. The Arborist supplies basic GL lighting (one directional light + ambient) for preview; the runtime composes Stage's full sky/sun/cloud pipeline. Same materials, two callers, no panel duplication. The Arborist exposes a "preview tint" knob in its tune panel for authoring-time experimentation only — doesn't touch any Look state.

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

public/textures/bark/            # NEW shared bark library, NOT produced by Arborist
  furrowed.png                   # maples, oaks
  peeling.png                    # sycamore
  papery.png                     # birch
  smooth.png                     # beech
  default_bark.png               # v1 fallback if species-specific source missing

public/textures/flowers/         # NEW per-species flower library, optional, NOT produced by Arborist
  cercis_canadensis.png          # redbud spring flowers
  malus.png                      # crabapple
  magnolia.png                   # magnolia
  # most species don't ship a flower texture; their manifest.hasFlowers = false

arborist/state/                  # GITIGNORED operator state (curated picks + tune params)
  <species-id>/
    seedlings.json               # picked specimens + per-seedling tune params

arborist/_cache/                 # GITIGNORED conversion cache (.laz → .ply for browser preview)
  preview/
    <treeId>.ply
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

### 1. Specimen selection (UI-driven, not config-file-driven)

Specimen picking happens **in the Arborist's Specimen Browser** (see "UI scope" below), not via hand-edited config files. The browser lists every specimen from `botanica/tree_metadata_dev.csv` filtered by species, surfaces three default recommendations from the height-bucket × density heuristic, lets the operator preview each as a 3D point cloud, and lets them confirm or swap variants.

Picked variants are persisted server-side at:

```
arborist/state/<species-id>/variants.json
```

Schema:

```json
{
  "species": "acer_saccharum",
  "variants": [
    { "id": 1, "label": "small mature", "sourceFile": "botanica/dev/10178.laz", "treeId": 10178, "treeH": 18.52 },
    { "id": 2, "label": "mid mature",   "sourceFile": "botanica/dev/10280.laz", "treeId": 10280, "treeH": 21.99 },
    { "id": 3, "label": "large mature", "sourceFile": "botanica/dev/10290.laz", "treeId": 10290, "treeH": 26.57 }
  ],
  "savedAt": 1714172400000
}
```

The bake CLI reads this file to drive its work. `arborist/config.json` carries only static defaults (tints, voxel size, dataset root) — never specimen filenames. The `arborist/state/` directory is gitignored.

**Tentative initial picks for Sugar Maple** (the values shown above) come from the height × density heuristic applied to `tree_metadata_dev.csv`. They're surfaced as the browser's defaults; the operator confirms or swaps via the UI before any bake runs.

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

Write `manifest.json` per species. With ~10 seedlings, morph+tint+bark, and the seasonal-state declarations, the schema is:

```json
{
  "species": "acer_saccharum",
  "label": "Sugar Maple",
  "scientific": "Acer saccharum",
  "tier": "exact",
  "leafMorph": "palmate",
  "barkMorph": "furrowed",
  "deciduous": true,
  "hasFlowers": false,
  "tints": {
    "buds":   "#a8c870",
    "spring": "#7eba5e",
    "summer": "#3a7b30",
    "fall":   "#d4801f",
    "winter": null
  },
  "variants": [
    {
      "id": 1,
      "sourceFile": "botanica/dev/10178.laz",
      "treeId": 10178,
      "treeH": 18.52,
      "skeleton": "skeleton-1.glb",
      "tips": "tips-1.json",
      "tuneParams": { "voxelSize": 0.02, "minRadius": 0.005, "tipRadius": 0.01 },
      "stats": { "cylinders": 312, "verts": 6210, "tipCount": 940 }
    },
    {
      "id": 2,
      "sourceFile": "botanica/dev/10280.laz",
      "treeId": 10280,
      "treeH": 21.99,
      "skeleton": "skeleton-2.glb",
      "tips": "tips-2.json",
      "tuneParams": { "voxelSize": 0.02, "minRadius": 0.005, "tipRadius": 0.01 },
      "stats": { "cylinders": 412, "verts": 8942, "tipCount": 1247 }
    }
    /* … up to ~10 variants. Default count configurable per species. */
  ],
  "bakedAt": 1714172400000
}
```

`tuneParams` is **per-variant** because different specimens have different scan densities and may want different fitting thresholds. The static `arborist/config.json` carries only defaults that seed the tune panel for new picks; never specimen filenames or per-variant overrides.

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
      "barkMorph": "furrowed",
      "deciduous": true,
      "hasFlowers": false,
      "variants": 10,
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
| `GET`    | `/species/:id/specimens` | List candidate specimens from `tree_metadata_dev.csv` filtered to this species. Each row: `{ treeId, treeH, dataset, dataType, fileSize, sourceFile, recommended? }`. The `recommended` flag is true for the height-bucket × density heuristic picks (small/mid/large). |
| `GET`    | `/species/:id/variants` | Read picked variants from `arborist/state/<id>/variants.json`. 404 if none picked yet. |
| `POST`   | `/species/:id/variants` | Save picked variants (body = the schema in "Specimen selection"). |
| `GET`    | `/specimens/:treeId/preview.ply` | Stream a `.laz`-derived point cloud as PLY for the 3D viewport. Backend converts on demand and caches results. |
| `POST`   | `/species/:id/bake` | Run `python bake-tree.py --species=<id>`, synchronous; returns `{ ok, ms, species, variants: [...] }`. Requires `variants.json` to exist for that species. |
| `DELETE` | `/species/:id` | Remove a species's published artifacts + `arborist/state/<id>/`. |
| `GET`    | `/inventory` | Compute the species histogram from `src/data/park_trees.json` (+ `street_trees.json` if present); useful for the Library view's "inventory count" column. |

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

The Arborist UI at `/arborist` has three core surfaces. Specimen picking happens in the tool, not in config files — the same authoring discipline as Cartograph (geometry edits live in tools, not JSON).

1. **Library** (`Library.jsx`) — left rail / overview
   - Lists every species from `species-map.json`: name, scientific name, tier (exact / cousin / fallback), `leafMorph`, inventory count (from `/inventory`), # variants picked, `bakedAt` if any.
   - Click a species → opens the Specimen Browser for that species.
   - Compact status indicators: "no variants picked", "3 picked, not baked", "baked", "stale (config changed since last bake)".

2. **Specimen Browser** (`SpecimenBrowser.jsx`) — main work surface, the specimen parade
   - For the active species, lists every available specimen from FOR-species20K (filtered from `tree_metadata_dev.csv` by genus/species match).
   - Columns: `treeID`, `treeH`, `dataset`, `data_type`, file size (point-density proxy).
   - Sortable + filterable. Default sort: height ascending. Default filter: TLS only (highest detail).
   - **3D viewport** showing the currently-hovered or selected specimen as a point cloud. The backend converts `.laz` → `.ply` on demand and the browser loads via Three.js `PLYLoader`. Cache `.ply` results next to the source.
   - Each specimen row has **variant slot buttons**: `1` / `2` / `3` (for small / mid / large). Click to assign. Visual indicator on assigned slots.
   - "Save selection" button → POSTs to `/species/:id/variants`, updating the per-species manifest with the picked variants. The Bake button activates only after variants are saved.
   - **Recommend defaults** at the top: when the browser opens for a species with no variants picked, it surfaces three suggested specimens via the height-bucket × density heuristic (small mature ≈ 18 m × densest, mid ≈ 22 m × densest, large ≈ 26 m × densest). User accepts (one click) or swaps individually.

3. **Inspector** (`Inspector.jsx`) — post-bake review
   - Once a species has been baked, switch from Browser to Inspector to see the resulting `skeleton-N.glb` files rendered in 3D, leaf overlay applied (using the morph + tint from manifest).
   - Read-only manifest view (params, stats, sourceFiles).
   - "Re-bake" button: re-runs the bake against the currently saved variants without changing the picks.

4. **Toolbar** (top, mirrors Cartograph's)
   - Active species selector.
   - View switcher: `Library` / `Browser` / `Inspector`.
   - "Bake species" button (active when variants are saved + the bake is stale or absent).

**Out of scope in v1:** plant tool, density sliders, per-vertex editing, batch-bake-all-species (one-at-a-time is fine). Keep the Arborist surface narrow.

---

## Tree #1 acceptance criteria

The build is complete for v1 when **all** of these are true with `acer_saccharum` baked:

1. `python arborist/bake-tree.py --species=acer_saccharum` runs end-to-end in ~30 minutes on the operator's Mac for all ~10 seedlings.
2. `public/trees/acer_saccharum/` contains **N valid `skeleton-N.glb` files** (where N = the species's saved seedling count, default 10) and N matching `tips-N.json` files, plus `manifest.json`.
3. Each `tips-N.json` contains ≥ 200 branch-tip positions.
4. `manifest.json` references `leafMorph: "palmate"`, `barkMorph: "furrowed"`, `deciduous: true`, `hasFlowers: false`, plus seed tints for at least summer + fall + buds.
5. `public/trees/index.json` lists `acer_saccharum` with `tier: "exact"`, `variants: N`, `barkMorph`, `deciduous`, `hasFlowers`.
6. The runtime mounts `<InstancedTrees />` and renders **all 61** Sugar Maples from `park_trees.json` at their positions, variant assignment via `hash(treeId) % N` so each silhouette appears proportionally.
7. **Per-instance shader jitter visibly active**: branch-angle, branch-length, crown asymmetry, leaf-card jitter, and tint micro-variation all wired and producing distinguishable variation between adjacent same-variant trees.
8. Leaf cards render at every variant's tip positions, sampling `public/textures/leaves/palmate.png`, tinted from the manifest's *currently active* season tint (summer by default in v1).
9. Trunk + branches sample `public/textures/bark/furrowed.png` (or `default_bark.png` if furrowed isn't yet sourced).
10. **Seasonal uniforms wired**: setting a Stage Look's `season: 'fall'` shifts leaves to fall tint; `season: 'winter'` makes deciduous trees bare; `snow: 0.6` adds snow on branches. Verified on at least three states (summer, fall, bare-winter).
11. **GPU budget verified.** On the operator's Mac in Stage Hero shot, framerate stays above 50 fps with all 61 trees in view. (Worst-case mobile target is a follow-on; flag it but don't block on it.)
12. Stage Surfaces.Trees `Species` sub-panel lists `Sugar Maple` as a row; color picker edits the per-species tint live (no re-bake).
13. Stage Surfaces.Trees `Morphs` sub-panel still shows `palmate` and editing it still works.
14. Switching Looks (e.g. to a Valentine's Look that tints maples pink, or a Halloween Look that pins season=fall) propagates to the trees instantly.
15. The `ParkTrees` line in `LafayettePark.jsx` is replaced (or `ParkTrees` removed entirely).

**Stretch (nice but not required for v1):**

- Wind animation phase-offset per-instance (`uTime + hash(treeId)`).
- LOD: lower-poly skeleton at far camera distances.
- A second species baked end-to-end (proves the pipeline scales), e.g. Pin Oak via `quercus_robur` cousin → `lobed` morph.
- Flower textures for the species that opt in (redbud, crabapple) — needs `public/textures/flowers/<species>.png`.
- Bark sourcing beyond `default_bark.png` — at minimum `furrowed.png` and `peeling.png`.

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
| Specimen selection | UI-driven via Specimen Browser (3D point-cloud preview + variant slot picker). Recommended defaults from height × density heuristic; operator confirms or swaps. NOT hand-edited config files. | Conversation 2026-04-27 |
| Variants per species | Default 10, configurable per species. ~6 instances per variant for 61 park trees = good `InstancedMesh` batching. | Conversation 2026-04-27 |
| Per-instance shader jitter | Wired in v1: branch-angle, length, crown asymmetry, leaf-card jitter, tint micro-variation, wind phase. | Conversation 2026-04-27 |
| Vocabulary | specimen (raw) → seedling (picked, with tune params) → variant (baked) | Conversation 2026-04-27 |
| Leaf source | Shared morph library at `public/textures/leaves/<morph>.png`; per-species tint stored in manifest + materialColors. NOT per-species atlases. | Asset audit 2026-04-27 |
| Bark source | Shared morph library at `public/textures/bark/<morph>.png`. Same pattern as leaves. v1 may use `default_bark.png` until species-specific textures land. | Conversation 2026-04-27 |
| Sugar Maple morph | leaves: `palmate`, bark: `furrowed` | Asset audit + conversation 2026-04-27 |
| Seasonal variation | Shader-driven (uniforms: `season`, `snow`); same baked artifact, no extra bake cost. Six states: bare, buds, flowers, summer, fall, snowy. Per-Look in Stage. | Conversation 2026-04-27 |
| Per-species seasonal flags | `deciduous: bool`, `hasFlowers: bool` in manifest. | Conversation 2026-04-27 |
| Preview material sharing | `src/components/tree-materials.js` factory used by both Arborist preview and runtime InstancedTrees. NOT a shared panel. | Conversation 2026-04-27 |
| Workstage shape | One workstage. Pickers at top (species / specimen / variant), 3D viewport center, tune panel side. Tune controls disabled until specimen is promoted to seedling. | Conversation 2026-04-27 |
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

The agent SHOULD follow this order to surface integration risks early. **Critical reordering vs. earlier drafts: the Specimen Browser comes before `bake-tree.py`.** Specimen picking is authoring (lives in the tool); the bake CLI is the consumer (reads what the user picked).

1. `arborist/serve.js` skeleton (endpoints stubbed, returning fixtures). Wire `npm run dev`, vite proxy. Confirm reachable from browser.
2. `src/arborist/ArboristApp.jsx` skeleton at `/arborist`. Empty Library page reading `/api/arborist/species`. Confirm round-trip.
3. **Backend pieces for the Specimen Browser:**
   - `GET /species/:id/specimens` — parse `tree_metadata_dev.csv`, filter to species, attach `fileSize` from disk, mark recommended flags via the height-bucket × density heuristic.
   - `GET /specimens/:treeId/preview.ply` — Python utility (or `pdal pipeline`) converts `.laz` → `.ply`, cached under `arborist/_cache/preview/`. Stream PLY back.
4. **Specimen Browser UI** (`SpecimenBrowser.jsx`): filterable table + 3D viewport via Three.js `PLYLoader`. Variant slot buttons. Save → `POST /species/:id/variants`.
5. **Now** `arborist/bake-tree.py` — phase by phase: ingest → QSM → mesh → tips → manifest. Each phase emits an intermediate under `arborist/_scratch/<species>/<variant-n>/`. Ship phase 1 (ingest) end-to-end before starting phase 2. Reads `arborist/state/<species>/variants.json` for which files to process.
6. Wire `POST /species/:id/bake` to invoke `python bake-tree.py --species=<id>` with all picked variants. Bake button in Library activates only when variants are saved + bake is stale.
7. `Inspector.jsx` — 3D preview of the baked GLBs (one viewport per variant, leaf overlay applied).
8. `src/components/InstancedTrees.jsx` — runtime consumer. Mount in `LafayettePark.jsx`, replacing `ParkTrees`. Variants picked per-tree via `hash(treeId) % nVariants`.
9. Stage Surfaces.Trees Species sub-panel — dynamic species list from `public/trees/index.json`, per-species tint binding.
10. Acceptance-criteria checklist run-through.

Each step is a commit. Branch off the operator's current working branch (`cartograph-looks-pass-ab` as of 2026-04-27).

---

## Cross-references

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — project-wide patterns
- [`../cartograph/README.md`](../cartograph/README.md) — the helper template
- [`../memory/project_tree_lidar_pipeline.md`](../memory/project_tree_lidar_pipeline.md) — full pipeline rationale + dataset notes
- [`../memory/project_tree_model_sourcing.md`](../memory/project_tree_model_sourcing.md) — research on alternatives
- [`../memory/feedback_mount_dont_hide_heavy_3d.md`](../memory/feedback_mount_dont_hide_heavy_3d.md) — heavy 3D children should not mount when invisible (current ParkTrees was muted because of this; InstancedTrees should respect it too)
- FOR-species20K dataset: https://zenodo.org/records/13255198
