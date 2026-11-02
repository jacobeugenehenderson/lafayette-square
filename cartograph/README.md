# Cartograph

The neighborhood-ground helper app. Authors the cartograph (streets, blocks, paths, sidewalks, treelawn, lawn, land-use faces) and runs the Foundry to make one canonical bundle per Look, the Slab, that the runtime renders as the city's ground plane. The Cartograph has three functions, Stage, Preview and Publish, and the twelve steps sit inside them: Stage holds 01 Extent · 02 Intake · 03 Skeleton · 04 Survey · 05 Seal · 06 Section · 07 Foundry · 08 Slab · 09 Look; Preview is 10; Publish holds 11 Publish · 12 Promote.

Read [`./ARCHITECTURE.md`](./ARCHITECTURE.md) first for the publish-loop pattern, Plan/Stage split, and the Looks model. This README is the contract specific to Cartograph.

---

## Contract

| | |
|---|---|
| **Inputs**         | `cartograph/data/clean/skeleton.json`, `cartograph/data/clean/overlay.json`, `cartograph/data/neighborhood_boundary.json`, `src/data/ribbons.json`, `public/looks/<id>/design.json` |
| **Output (the bundle)** | `public/baked/<id>/{ground.json, ground.bin, ground.lightmap.png, buildings.json, buildings.bin, lamps.json, scene.json}` |
| **Backend**        | `cartograph/serve.js` on port 3333 |
| **Foundry CLI**    | `node cartograph/bake-ground.js --look=<id>` (and the AO + buildings + lamps + scene siblings) |
| **UI route**       | `/cartograph` |

The bundle is **deterministic, byte-for-byte reproducible** from the inputs (modulo the AO lightmap, which carries a fixed RNG seed). It carries fills (colors as of the Foundry run) and the AO lightmap the Foundry made; live shaders, lighting environment, and time-of-day are runtime concerns layered on top.

The runtime — Look's shots, Preview, the deployed app — all mount `src/components/BakedGround.jsx` against this bundle. **Same component, same artifact, every link in the canary chain.** See `memory/project_baked_ground_runtime.md`.

---

## Editor

Cartograph is a single-canvas app with two modes:

| Mode | Owns | Tools |
|---|---|---|
| **Plan** | Geometry: centerlines, measures, caps, couplers, anchors, boundary, eventually tree positions | Survey, Section, Marker; ephemeral per-layer visibility for working clarity |
| **Look**     | Styling per look preset: colors, visibility, materials, future shaders | Surfaces (color + visibility per material), camera shots, time-of-day, environment |

Plan's "Look →" button only opens Look; if the Slab is older than what the Foundry reads, Look says so and offers the **Foundry** run. Look's "＋ Save as new look preset…" is the only deliberate save-as action — it forks the working draft into a new named look preset (`valentines`, `cardinals-win`, etc.).

---

## API endpoints (`cartograph/serve.js`, port 3333)

Mounted under `/api/cartograph` from the web app's perspective (vite proxies). ⛔ Every town's data route names its town (`/<scene>/<verb>`); a scene-less `/<verb>` is refused (400), and an unrouted path is a 404 — there is no default town.

### Geometry

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/<scene>/markers` | Marker strokes (annotation overlay) |
| `POST` | `/<scene>/markers` | Save marker strokes |
| `GET`  | `/<scene>/analyze` | Spatial analysis of that town's marker strokes (parcels/blocks intersected) |
| `GET`  | `/<scene>/measurements` | Read raw measurements |
| `POST` | `/<scene>/measurements` | Save raw measurements |
| `GET`  | `/<scene>/skeleton` | Read derived skeleton (geometry source of truth) |
| `GET`  | `/<scene>/centerlines` | Read legacy centerlines.json |
| `POST` | `/<scene>/centerlines` | Save centerlines |
| `GET`  | `/<scene>/overlay` | Read operator-intent overlay (caps, couplers, measures, segmentMeasures) |
| `POST` | `/<scene>/overlay` | Save overlay |

### Looks

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/looks` | List `{ default, looks: [{id, name, createdAt, updatedAt, bakedAt}] }` |
| `GET`    | `/looks/:id/design` | Read a Look's `design.json` |
| `POST`   | `/looks/:id/design` | Autosave a Look's design block |
| `POST`   | `/looks/:id/bake` | Run the Foundry for the Look's bundle from its `design.json` (runs the full pipeline: ground geometry → buildings → lamps → scene → AO lightmap) |
| `POST`   | `/looks` | Create a new Look from current state. Body: `{ name, fromLookId? }` |
| `DELETE` | `/looks/:id` | Delete a Look. The kit's 0-state Look (`kit-default`) cannot be deleted |

---

## CLI

| Command | What it does |
|---|---|
| `node cartograph/serve.js`              | Start the backend on port 3333 (called automatically by `npm run dev`) |
| `node cartograph/bake-ground.js --look=<id>`    | Make the ground geometry (positions + indices + manifest) into `public/baked/<id>/`. Reads `src/data/ribbons.json` (ribbon + path geometry), `cartograph/data/clean/map.json` (sub-block overlays + linear features), and `public/looks/<id>/design.json` (Look colors). Shared face-clip + ribbon helpers live in `src/lib/ribbonsGeometry.js`. |
| `node cartograph/bake-ground-ao.js --look=<id>` | Make the AO lightmap (1024² PNG, 24 cosine-weighted rays per texel). Depends on `ground.json` already existing. |
| `node cartograph/bake-buildings.js --look=<id>` | Make building geometry. |
| `node cartograph/bake-lamps.js --look=<id>`     | Make lamp instance data. |
| `node cartograph/bake-scene.js --look=<id>`     | Make the scene snapshot (palette, material physics, layerVis). |
| `node cartograph/skeleton.js` *then* `node cartograph/pipeline.js` | Two-step skeleton → ribbons run. The pipeline does NOT run the skeleton extractor; both steps are needed. (See `memory/feedback_skeleton_pipeline_two_step.md`.) |
| `node cartograph/fetch.js`              | Fetch fresh OSM data (destructive — see `memory/feedback_never_refetch_data.md` before running) |

---

## Data files

```
cartograph/
  bake-ground.js                     # writes public/baked/<id>/{ground.json, ground.bin}
                                     # (shared ribbon + face-clip geometry lives in src/lib/ribbonsGeometry.js)
  bake-ground-ao.js                  # writes public/baked/<id>/ground.lightmap.png
  bake-buildings.js                  # writes public/baked/<id>/{buildings.json, buildings.bin}
  bake-lamps.js                      # writes public/baked/<id>/lamps.json
  bake-scene.js                      # writes public/baked/<id>/scene.json
  data/
    clean/
      overlay.json                   # operator intent (caps, couplers, measures)
      skeleton.json                  # derived skeleton (geometry source of truth)
      marker_strokes.json            # annotation overlay
      map.json                       # neighborhood bbox + cleaned base data
    neighborhood_boundary.json       # 256-point circle defining the silhouette
    raw/
      centerlines.json               # legacy operator data
      measurements.json              # legacy raw measurements

src/data/
  ribbons.json                       # output of pipeline.js (skeleton + overlay → ribbons)

public/looks/
  index.json                         # { default, looks: [...] }
  <look-id>/
    design.json                      # autosaved per-Look styling

public/baked/
  <look-id>/                         # the runtime bundle
    ground.json                      # manifest (groups, bbox, lightmap pointer)
    ground.bin                       # Float32 positions + Uint32 indices
    ground.lightmap.png              # 1024² baked AO
    buildings.json + buildings.bin
    lamps.json
    scene.json
```

---

## How the runtime consumes Cartograph's output

`src/components/BakedGround.jsx` is the **shared** runtime ground component. It fetches `/baked/<lookId>/ground.json` (manifest), `ground.bin` (Float32 positions + Uint32 indices), and `ground.lightmap.png` (1024² AO), then mounts one mesh per group with `MeshStandardMaterial` (or the procedural grass material for lawn / treelawn / median).

Look and Preview mount the **same component** with the same artifact. The bundle's fill colors seed each group's material color; live styling from the active Look's store overrides where applicable. Holes (post-clip cutouts where ribbons carve through face fills) are honored at triangulation time via `THREE.ShapeUtils.triangulateShape(contour, holes)`.

---

## Authoring loop

1. Open `/cartograph` (in Plan by default).
2. Edit geometry with Survey / Section. Edits autosave to `overlay.json`.
3. Click **Look →** to open Look on Hero. If the Slab is older than what the Foundry reads, Look says so and offers the **Foundry** run.
4. Edit colors / visibility in Look's Surfaces. Edits autosave to `looks/<active>/design.json` and show *live* in the rendered scene.
5. **＋ Save as new look preset…** to fork the current state into a named look preset.
6. Switch Looks via the toolbar dropdown. The runtime swaps geometry + style atomically.

---

## Cross-references

- [`./ARCHITECTURE.md`](./ARCHITECTURE.md) — project-wide patterns (publish loop, Looks model, Plan/Stage split)
- `../memory/project_baked_ground_runtime.md` — runtime contract for BakedGround.jsx (parity rule)
- `../memory/project_bake_pipeline_pure_threejs.md` — Foundry bundle architecture
- `../memory/project_bake_face_clip.md` — face fills are clipped against ribbon footprint by the Foundry; outer + holes structure
- `../memory/feedback_svg_goblin_lesson.md` — why we retired the SVG runtime path
- `../memory/project_cartograph_looks_model.md` — Looks model decisions
- `../memory/feedback_cartograph_not_main_app_clone.md` — what *not* to port from the main app's ground-rendering pipeline
