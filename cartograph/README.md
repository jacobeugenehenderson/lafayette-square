# Cartograph

The neighborhood-ground helper app. Authors the cartograph (streets, blocks, paths, sidewalks, treelawn, lawn, land-use faces) and publishes one canonical artifact per Look that the runtime renders as the city's ground plane.

Read [`../ARCHITECTURE.md`](../ARCHITECTURE.md) first for the publish-loop pattern, the Designer/Stage split, and the Looks model. This README is the contract specific to Cartograph.

---

## Contract

| | |
|---|---|
| **Inputs**         | `cartograph/data/clean/skeleton.json`, `cartograph/data/clean/overlay.json`, `cartograph/data/neighborhood_boundary.json`, `src/data/ribbons.json`, `public/looks/<id>/design.json` |
| **Output (the artifact)** | `public/looks/<id>/ground.svg` |
| **Backend**        | `cartograph/serve.js` on port 3333 |
| **Bake CLI**       | `node cartograph/bake-svg.js --look=<id>` |
| **UI route**       | `/cartograph` |

The artifact is **deterministic, byte-for-byte reproducible** from the inputs. It carries fills (colors at bake time) but not shaders, lighting, or runtime experiments — those are runtime concerns layered on top. See `bake-svg.js`'s header for the spotlessness rules.

---

## Editor

Cartograph is a single-canvas app with two modes:

| Mode | Owns | Tools |
|---|---|---|
| **Designer** | Geometry: centerlines, measures, caps, couplers, anchors, boundary, eventually tree positions | Surveyor, Measure, Marker; ephemeral per-layer visibility for working clarity |
| **Stage**    | Per-Look styling: colors, visibility, materials, future shaders | Surfaces (color + visibility per material), camera shots, time-of-day, environment |

Going Designer → Stage silently re-bakes the active Look so the rendered SVG reflects the latest geometry. Stage's "＋ Save as new Look…" is the only deliberate save-as action — it forks the working draft into a new named Look (`valentines`, `cardinals-win`, etc.).

---

## API endpoints (`cartograph/serve.js`, port 3333)

Mounted under `/api/cartograph` from the web app's perspective (vite proxies).

### Geometry

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/markers` | Marker strokes (annotation overlay) |
| `POST` | `/markers` | Save marker strokes |
| `GET`  | `/analyze` | Spatial analysis of marker strokes (parcels/blocks intersected) |
| `GET`  | `/measurements` | Read raw measurements |
| `POST` | `/measurements` | Save raw measurements |
| `GET`  | `/skeleton` | Read derived skeleton (geometry source of truth) |
| `GET`  | `/centerlines` | Read legacy centerlines.json |
| `POST` | `/centerlines` | Save centerlines |
| `GET`  | `/overlay` | Read operator-intent overlay (caps, couplers, measures, segmentMeasures) |
| `POST` | `/overlay` | Save overlay |

### Looks

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/looks` | List `{ default, looks: [{id, name, createdAt, updatedAt, bakedAt}] }` |
| `GET`    | `/looks/:id/design` | Read a Look's `design.json` |
| `POST`   | `/looks/:id/design` | Autosave a Look's design block |
| `POST`   | `/looks/:id/bake` | Re-render a Look's `ground.svg` from its `design.json` |
| `POST`   | `/looks` | Create a new Look from current state. Body: `{ name, fromLookId? }` |
| `DELETE` | `/looks/:id` | Delete a Look. Default Look (`lafayette-square`) cannot be deleted |

### Bake

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/bake` *(legacy)* | Run `bake-svg.js` against the default Look. Prefer `/looks/:id/bake`. |
| `POST` | `/rebuild` | Re-run `render.js` (legacy debug script) |

---

## CLI

| Command | What it does |
|---|---|
| `node cartograph/serve.js`         | Start the backend on port 3333 (called automatically by `npm run dev`) |
| `node cartograph/bake-svg.js --look=<id>` | Bake one Look's SVG. `--look` defaults to `lafayette-square`. |
| `node cartograph/skeleton.js` *then* `node cartograph/pipeline.js` | Two-step skeleton → ribbons rebuild. The pipeline does NOT run the skeleton extractor; both steps are needed. (See `memory/feedback_skeleton_pipeline_two_step.md`.) |
| `node cartograph/render.js`        | Legacy preview renderer |
| `node cartograph/fetch.js`         | Fetch fresh OSM data (destructive — see `memory/feedback_never_refetch_data.md` before running) |

---

## Data files

```
cartograph/
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
    ground.svg                       # baked artifact
```

---

## How the runtime consumes Cartograph's output

`src/cartograph/SvgGround.jsx` fetches `public/looks/<activeLookId>/ground.svg` and renders its `<path>` rings as flat meshes in Stage shots. The bake's fill colors seed initial material colors; the runtime then **overrides them live from the active Look's store state** (`layerColors`, `luColors`) so Surfaces edits show without a re-bake. The bake artifact is the snapshot for handoff; the runtime is the live picture.

---

## Authoring loop

1. Open `/cartograph` (in Designer by default).
2. Edit geometry with Surveyor / Measure. Edits autosave to `overlay.json`.
3. Click **Stage** → silent re-bake → land in Hero.
4. Edit colors / visibility in Stage Surfaces. Edits autosave to `looks/<active>/design.json` and show *live* in the rendered scene.
5. **＋ Save as new Look…** to fork the current state into a named Look.
6. Switch Looks via the toolbar dropdown. The runtime swaps geometry + style atomically.

---

## Spotlessness rules (bake output)

- SVG 1.1, no comments, no metadata, no Inkscape/Illustrator residue.
- Paths grouped `<g id="<material|land-use>">` per material; explicit `fill="#hex"` on each path; no CSS classes.
- Same input → same output, byte-for-byte. Sort everything before emit.
- File is reviewable, diffable in git, parseable by any standard SVG renderer.

See `bake-svg.js`'s header comment for the full list.

---

## Cross-references

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — project-wide patterns (publish loop, Looks model, Designer/Stage split)
- `../memory/project_cartograph_bake_step.md` — bake step decisions and history
- `../memory/project_cartograph_looks_model.md` — Looks model decisions
- `../memory/feedback_cartograph_not_main_app_clone.md` — what *not* to port from the main app's ground-rendering pipeline
