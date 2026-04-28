# Arborist

The species-asset library producer. Authors per-species tree skeletons + leaf/bark configurations from public LiDAR data, publishes them as runtime-ready artifacts.

Read in order:

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — publish-loop pattern.
2. [`../cartograph/README.md`](../cartograph/README.md) — the helper template Arborist mirrors.
3. [`SPEC.md`](SPEC.md) — full v1 build specification, decisions, acceptance criteria.

This README is the **runtime contract** for the helper. SPEC.md is the build plan.

---

## Contract

| | |
|---|---|
| **Inputs** | `botanica/tree_metadata_dev.csv` + `.laz` files (FOR-species20K), `arborist/state/<species>/seedlings.json` (UI-curated picks) |
| **Outputs (artifacts)** | `public/trees/<species>/{skeleton-N.glb, tips-N.json, manifest.json}` + `public/trees/index.json` |
| **Backend** | `arborist/serve.js` on port 3334 |
| **Bake CLI** | `python arborist/bake-tree.py --species=<id>` |
| **UI route** | `/arborist` |

The artifacts are **deterministic** and **pristine** (per the publish-loop conventions). Specimen filenames and tune params live in operator state; the static `arborist/config.json` carries only defaults.

---

## Editor

Single workstage:

| Region | Purpose |
|---|---|
| Top pickers | Active species, specimen (filtered table), variant slot |
| Center | 3D viewport — point cloud → QSM overlay → leaf preview as the pipeline progresses |
| Side | Tune panel (voxel size, min radius, tip radius), preview-tint knob, label override |
| Bottom | Save (commits seedling), Bake (runs `bake-tree.py` for the species) |

Workflow: `pick → tune → save seedling → repeat ~10 times → bake species`.

---

## API endpoints (`arborist/serve.js`, port 3334)

Mounted under `/api/arborist` from the web app's perspective via vite proxy.

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/species` | Read `public/trees/index.json` |
| `GET`    | `/species/:id` | Read one species's `manifest.json` (404 until baked) |
| `GET`    | `/species/:id/specimens` | Candidate specimens from `tree_metadata_dev.csv` filtered to the species, with `recommended` flags from the height × density heuristic |
| `GET`    | `/species/:id/seedlings` | Picked seedlings + per-seedling tune params |
| `POST`   | `/species/:id/seedlings` | Save the seedling library for the species |
| `GET`    | `/specimens/:treeId/preview.ply` | Stream a `.laz` as a PLY for the 3D viewport (cached) |
| `POST`   | `/species/:id/bake` | Run `python bake-tree.py --species=<id>` |
| `DELETE` | `/species/:id` | Remove published artifacts + state |
| `GET`    | `/inventory` | Species histogram from `src/data/park_trees.json` |

---

## CLI

| Command | What it does |
|---|---|
| `node arborist/serve.js` | Start the backend (called automatically by `npm run dev`) |
| `python arborist/bake-tree.py --species=<id>` | Bake one species's seedling library into runtime variants |

---

## Data files

```
botanica/                          # FOR-species20K dataset (gitignored, ~51 GB)
  tree_metadata_dev.csv            # treeID, species, genus, dataset, data_type, tree_H, filename
  dev/<id>.laz                     # individual-tree TLS scans
  test/<id>.laz

assets/botanical-reference-hires/  # CC0 4K leaf textures (gitignored)
public/textures/leaves/<morph>.png # 512px runtime billboards (committed)
public/textures/bark/<morph>.png   # bark library (planned)
public/textures/flowers/<sp>.png   # per-species flower textures (planned, optional)

arborist/
  config.json                      # static defaults only
  serve.js                         # backend, port 3334
  bake-tree.py                     # Python CLI (planned)
  pipeline/                        # pipeline modules (planned)
  state/                           # operator state (gitignored)
    <species>/seedlings.json       # picked + tuned seedlings
  _cache/                          # conversion cache (gitignored)
    preview/<treeId>.ply

src/arborist/                      # React UI for the helper
  main.jsx
  ArboristApp.jsx
  …                                # workstage components, planned

public/trees/                      # PUBLISHED ARTIFACTS — the contract
  index.json
  <species>/
    skeleton-1.glb
    tips-1.json
    manifest.json
```

---

## How the runtime consumes Arborist's output

`src/components/InstancedTrees.jsx` (planned) fetches `public/trees/index.json`, loads each species's `skeleton-N.glb` + `tips-N.json` + manifest, groups `park_trees.json` positions by species + variant via `hash(treeId) % nVariants`, and renders one `InstancedMesh` per `(species, variant)` pair. Per-instance shader jitter (branch angle, length, tint micro-variation, wind phase) breaks repetition between instances of the same variant.

Stage's Surfaces.Trees panel rebinds to a dynamic species list from `index.json`, with per-species tint overrides feeding the runtime materials.

---

## Cross-references

- [`SPEC.md`](SPEC.md) — full build spec
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — project-wide patterns
- [`../cartograph/README.md`](../cartograph/README.md) — the helper template
- [`../memory/project_tree_lidar_pipeline.md`](../memory/project_tree_lidar_pipeline.md) — pipeline rationale, dataset notes
- FOR-species20K: https://zenodo.org/records/13255198
