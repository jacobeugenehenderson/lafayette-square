# HANDOFF — Unify the park footpaths onto the real path pipeline

**State / dispatch-ready brief.** Drafted by Boz 2026-06-27 (`curb-offset-draw`). Kill the park-path **fork**: route Lafayette Park's gravel footpaths through the same intake → prebake → `ribbons.json` → shared-lib → bake path that every other footway already rides, clip them to the park polygon, give the organic path kinds a gentle per-kind sweep-smoother, and promote the gravel to a Stage material. Reflect it in the Design + Stage panels.

---

## Agent: FRESH

**Name yourself** (one word, joins the name-trail). This is a clean new arc on a decoupled substrate — no warm agent holds prior context. *Why fresh:* the work is self-contained (footways carry none of the street coupling), and fresh eyes are exactly what the per-touch gate wants.

### First reads (every brief, in order)
1. **`ORIENTATION.md`** (root) — the mental model + settled doctrine.
2. **`README.md §⭐ START HERE`** — settled-state by topic + the cross-cutting feature index.
3. Then the topic canon cited per-phase below. **Read the cited section before you touch code** (hard gate — `CLAUDE.md`).

---

## The doctrine this serves (read first, don't re-derive)

- **Kit invariant — `INTAKE.md §6.1`:** SHAPE comes from real, fetchable sources through one automated pipeline; **a fork that hand-handles geometry is a defect.** The park footpaths are already **real OSM data** (`src/data/park_paths.json` meta = OpenStreetMap, 99 footway + 3 path) — the bug is that they bypass the pipeline via their own fetch, their own data file, and a **private** geometry function. We're not changing the *source*; we're deleting the *fork*.
- **One SSoT for path geometry — `src/lib/buildPathRibbons.js`:** the shared lib both `cartograph/bake-ground.js` and the live Designer (`BlockGeometryV2Debug.jsx`) consume, "so the bake and the live render cannot drift." The park paths currently use a **different function of the same name** (`src/components/LafayettePark.jsx:234`) — a naive averaged-normal miter (sharp elbows pinch, butt ends). Consolidating onto the lib **upgrades** them to rounded elbows + round ends for free.
- **Two smoothing layers (the framing Jacob settled 2026-06-27):**
  - **Layer A — joint rounding.** Already ON for all lib kinds: Clipper `JoinType.jtRound` at elbows + round/butt caps (`buildPathRibbons.js:96`, `ARC_TOLERANCE=25` → 2.5 cm drift). This is the **floor; every kind keeps it.** "smooth=0" is NOT "no rounding."
  - **Layer B — centerline sweep-smoothing.** The long curve *between* OSM vertices. Currently OFF (`STREET_SMOOTH=0`). This is the *only* thing the new path-smoother adds, and only for organic kinds.
- **⛔ HANDS OFF STREETS.** Do **not** touch `STREET_SMOOTH` (universal, pinned `0`), the curve-primitive `CURVE_FIT`, or the parked loop-street v2. Bumping the universal smoother is exactly what garbled the loop faces / shifted West 18th ~2.8 m across 52 tiles (`LOOP-STREETS.md §5`, the sunk-cost graveyard). The path-smoother is **path-kind-gated and physically cannot reach a street polygon** (footways carry no concentric curb, no emergent face, no junction). Keep it that way.

---

## The architecture (target end-state)

ONE data source (`ribbons.json` `.paths`), ONE geometry lib (`buildPathRibbons.js`), ONE smoothing regime — but **two clip regions**, partitioned by whether a path falls inside the park polygon:

| | Neighborhood paths | Park footpaths |
|---|---|---|
| Source | `ribbons.json` `.paths` | **same** (`ribbons.json` `.paths`) |
| Geometry | `buildPathRibbons.js` (shared lib) | **same** |
| Clip region | parcel interiors (`block − curb − treelawn − sidewalk`) | **park polygon interior** (`park-polygon.json`) |
| Smoothing | Layer A floor; Layer B per-kind | **same regime** |
| Material | layer color / footway material | **gravel Voronoi** (promoted to a Stage material on the layer) |

The `src/components/LafayettePark.jsx` component **keeps** water, island, bridges, fence, grass, labels — those have no neighborhood analog and are *not* vestigial. Only the **path** half of it is deleted.

---

## Phase 0 — Forensic & confirm (READ-ONLY, no code)

Before any edit, establish exactly how park footways flow **today** and write a short findings note (`scratch/PARK-PATH-FORENSIC.md`). Resolve:

1. **Where do park footways enter?** The main OSM intake (`scripts/*-fetch-osm*`) → `skeleton.js` path extraction (`PATH_CLASSES`, `skeleton.js:1162`; "everything else stays in `paths`", `:1589`) → `ribbons.json` `.paths`. **Do the park's footways already arrive in `ribbons.json` `.paths`** (and merely get **subtracted at bake**, `bake-ground.js:419` — "exclude park… a baked duplicate pokes through"), or are they *only* in the separate `scripts/14-fetch-park-paths.*` → `park_paths.json`? **Strongly prefer reusing the existing intake** — if the park footways are already in `ribbons.json`, the separate fetch + `park_paths.json` retire outright and we never duplicate a fetch.
2. **The clip-region split.** Confirm the partition: a path is "park" iff (most/all of) its geometry lies inside `park-polygon.json`'s interior. Decide point-in-polygon vs. ring-intersection; the polygon is rotated −9.2° (axis-aligned ±175 m → compass via `tiltDegrees`).
3. **The gravel shader's dependencies.** Inventory what the Voronoi `pathMat` (`LafayettePark.jsx:~300-407`) needs to move (time-of-day, lamp lightmap, terrain patch) so Phase 3 is scoped, not surprised.
4. **⚠️ Rebuild risk.** Routing park paths means re-running `skeleton.js → pipeline.js → promote-ribbons.js`, which **regenerates all of `ribbons.json`**. Per `LOOP-STREETS.md §5`, loop renders **drift on rebuild even with byte-identical inputs.** Note this loud: every phase that rebuilds `ribbons.json` requires an eye-check that **Benton + Waverly + the neighborhood paths did not regress.**

**Stop and flag Boz** with the findings before Phase 1 — especially if (1) shows park footways are NOT already in `ribbons.json` (changes the scope from "unfork + reclip" to "merge a fetch").

---

## Phase 1 — Unify geometry + data + clip  *(eye-gate)*

Canon: `INTAKE.md §3` (the processing chain) · `cartograph/PIPELINE.md §prebake` · `buildPathRibbons.js` header (the SSoT contract).

- Park footpaths render from `ribbons.json` `.paths` via the **shared** `buildPathRibbons.js`, **clipped to the park polygon interior** (use the lib's existing `intersect` option, `buildPathRibbons.js:119-147`, with the park-polygon ring as the intersect region — the mirror of how neighborhood paths intersect parcel interiors at `bake-ground.js:422`).
- **Delete the fork:** the private `buildPathRibbons` + `ParkPaths` in `LafayettePark.jsx` (the import at `:8`, the function at `:234`, the component at `:275`), retire `src/data/park_paths.json` and `scripts/14-fetch-park-paths.*`. The land/bridge split (`classifyBridgePath`) and the fixed 2.8 m width must be **preserved as behavior** — carry the bridge-Y lift + width into the unified path (a per-kind or per-park-path width; don't regress the lake bridges clearing the water).
- **Stop subtracting the park** at `bake-ground.js:419` *only* for the park-path group — neighborhood paths still exclude the park; park paths now get their own park-polygon clip group. Don't double-render.
- Keep the gravel material applied to the unified geometry for now (stopgap is fine; Phase 3 promotes it properly).

**4A — CONFIRMED (Jacob, 2026-06-27): hide the perimeter-ring footway.** The footway that rings the park just inside the fence **IS the park's perimeter sidewalk** (OSM tags the perimeter sidewalk as `highway=footway`), and the **ribbon system owns that sidewalk** (drawn off the perimeter streets — Park/Lafayette/Mississippi/Kennett). So after the polygon clip, **also drop the perimeter-ring footway** so the park-path layer renders only the *interior* paths and we don't double the ribbon sidewalk. Detect the ring as the path segment(s) hugging the polygon boundary (within a small inset of the fence line); the genuinely-interior paths (around the lake/grotto/monuments) stay. Eye-gate this one carefully — it's easy to over-drop an interior path that happens to run near the edge.

**Eye-gate (Jacob, lit app — not a proxy; `feedback_proxy_render_is_not_the_operator_eye`):** park footpaths look the same-or-better, now with rounded elbows, clipped to the polygon, **no cross-street bleed**. AND Benton/Waverly/neighborhood paths un-regressed after the `ribbons.json` rebuild.

---

## Phase 2 — Per-kind `PATH_SMOOTH` (Layer B)  *(eye-gate)*

Canon: the two-layer framing above · `src/lib/smoothCenterline.js` (how `STREET_SMOOTH` is structured — mirror the **consume-time, applied-on-a-copy, never-baked** shape, do NOT reuse the street pin).

- Add a path-scoped per-kind sweep-smoother in `buildPathRibbons.js`, applied to the polyline **before** the Clipper offset, on a copy. A small Chaikin / Catmull-Rom pass.
- **Grouping (Jacob, 2026-06-27):**
  - **Organic — Layer A + Layer B:** `footway`, `cycleway`, `path` (→ the park footpaths inherit it automatically as `footway`/`path`).
  - **Built — Layer A only (floor, NOT crisp/faceted):** `alley`, `steps`. They keep rounded elbows/ends; they just don't bow between endpoints.
- Universal `STREET_SMOOTH` stays `0`. The smoother never sees a street kind.

**Eye-gate:** park footpaths + neighborhood footways/cycleways/dirt paths sweep gently around features; alleys + steps unchanged; **streets untouched** (verify a street tile is byte-stable).

---

## Phase 3 — Gravel as a Stage material from SSoT  *(eye-gate)*

Canon: `cartograph/STAGE.md` (material cards / SC.* ) · `SLAB-CONTRACT.md §3` (baked ground/material channels) · `cartograph/BAKE.md`.

- Relocate the Voronoi gravel shader out of `LafayettePark.jsx` into the **path material system**, keyed for the park-path (or `footway`) layer, driven from the look/`scene.json` — geometry from the SSoT, gravel from Stage. Today it's a lone `park_path` color swatch (`StageApp.jsx:~1285`) + `m3Colors.js:32`; make it a real material card.
- Preserve the look Jacob likes (pebble Voronoi, roughness, TOD, lamp lightmap). The eye is the gate for "still looks like the gravel."

**Eye-gate:** gravel reads as before, now sourced from the look, assignable in Stage.

---

## Phase 4 — Panels  *(eye-gate, light)*

Canon: `README.md` "the cartograph tools" · `cartograph/FEATURES.md §Toolbar`.

- **Design** (`src/cartograph/Panel.jsx` `PATHS_DEFS`, `:~37`): park footpaths get a **visibility toggle** (they have none today — always-on). Decide: ride the existing `footway` toggle, or a dedicated `park-path` row. Recommend a dedicated row so the park gravel can be toggled independently.
- **Stage** (`src/stage/StageApp.jsx` Surfaces, `:~1285`): the lone `park_path` swatch becomes the Phase-3 gravel **material card**.
- Wire `layerVis` so the park-path group gates downstream at PAINT_ORDER like every other group (`BakedGround.jsx:~36`).

---

## Boundaries (write/commit)

- **Code + the data pipeline + `scratch/`:** yours to edit. Commit your own files on `curb-offset-draw` with **selective `git add`** — do NOT sweep in Jacob's uncommitted slab edits (`public/baked/*`, `public/looks/*`) or unrelated dirty files; if a rebuild dirties the slab, surface it, don't commit it blind.
- **Canon docs are READ-ONLY for you** (`ORIENTATION` · `README` · `PIPELINE` · `INTAKE` · `RIBBONS` · `LOOP-STREETS` · `SECTION` · `STAGE` · `SKELETON`). Note doctrine deltas in your `scratch/` journal; **Boz folds them into canon** after the arc lands (per-touch gate + accord sweep).
- **⛔ Do not touch** `STREET_SMOOTH`, `CURVE_FIT`, loop-street v2, or any street/skeleton smoothing. If you believe a street change is required, **stop and flag Boz** — it isn't, by construction.
- **Every "done" is Jacob's eye in the lit app**, never a proxy render, never "we did it" off a metric. Re-bake = re-verify loops.

## Definition of done
Park footpaths are real-data, single-SSoT, polygon-clipped, gently swept (organic kinds), gravel-from-Stage, panel-controllable — and the `LafayettePark.jsx` path fork + `park_paths.json` + `scripts/14` are gone, with water/fence/island/labels untouched. 4A resolved per Jacob. No street/loop regression.
