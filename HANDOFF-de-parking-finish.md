# HANDOFF — Finish the De-Parking (option 2: shift the projection)

**Date:** 2026-05-04
**Branch:** `cartograph-looks-pass-ab` (continues from the merged `de-parking` work, commits `24950e8…35cba28`)
**Predecessor docs:** `HANDOFF-de-parking.md` (the original strategic memo)

---

## TL;DR

The de-parking refactor (2026-05-03) only finished half the job. `park_trees.json` and `park_water.json` were migrated into project world frame; **every other spatial dataset is still in compass frame**. Visible artifact: trees and water sit at correct project-world positions, but the cartograph map (Designer/Measure/Survey views) — buildings, streets, alleys, lamps, paths, parking, landscape, the boundary polygon — is rotated 9.2° relative to them. Stage and Preview have the same offset between trees/water and paths/lamps; it's just less obvious because trees occlude the scaffold.

Finish it by **option 2**: shift the projection function so "GPS to meters" produces project world by definition. Re-run every ETL. Drop the data-migration step entirely.

---

## Why this got missed the first pass

Read the project-memory entry `project_world_frame_is_park_aligned.md` and the new section in `ARCHITECTURE.md §7` before touching anything. The footgun is subtle:

- **Project world frame is park-aligned, NOT compass-aligned.** Project world XZ axes match the Lafayette Square street grid, which sits at -9.2° from compass-N.
- The Python ETLs (`scripts/12-process-park-trees.py`, `scripts/14-process-park-paths.py`, `scripts/13-fetch-street-lamps.py`, etc.) and `cartograph/derive.js` all project GPS via simple equirectangular about park center. That output is **compass-aligned**, not project world.
- `scripts/de-park-data.mjs` applies R(-9.2°) to convert ETL output → project world. It was only wired up for `park_trees.json` and `park_water.json`. Everything else slipped through.
- The original handoff (`HANDOFF-de-parking.md` step 1) asked the operator to inventory which datasets were in which frame. That inventory was incomplete — it caught the runtime `<group rotation>` wrappers (trees, paths, water, fence) but did not recognize that *everything* coming out of the GPS-to-meters projection was implicitly compass-aligned and therefore needed migration too.

I (Claude, on 2026-05-04) initially fell into the inverse trap: looked at the equirectangular projection in the Python ETL, decided "GPS-projected meters are world frame," and proposed un-rotating `park_trees.json`. The operator caught it visually in Stage/Preview within minutes (trees rotated CCW 9.2° from where they belonged). Reverted. Don't repeat this — verify against Stage AND Preview AND cartograph (Designer/Measure/Survey), not just one view, before declaring a frame fix.

---

## Inventory of datasets still in compass frame

Verified by code inspection of every file using `wgs84_to_local` / `wgs84ToLocal` (no rotation in either):

**Runtime data files:**
- `cartograph/data/clean/map.json` — every layer in `MapLayers.jsx` reads from this: buildings, streets, alleys, streetlamps, landscape, parking lots, centerlines, edge lines, bike lanes, stripes, barriers.
- `cartograph/data/neighborhood_boundary.json` — boundary stencil polygon (`src/cartograph/boundary.js`).
- `src/data/park_paths.json` — `LafayettePark.jsx` ParkPaths, `cartograph/bake-paths.js` consumers.
- `src/data/street_lamps.json` — Stage StreetLights and any lamp consumer.
- `src/data/ribbons.json` — needs verification but almost certainly compass since it's derived from map.json.

**Already in project world (from de-parking 2026-05-03):**
- `src/data/park_trees.json`
- `src/data/park_water.json`

**ETL/derive entry points to fix:**
- `scripts/config.py:wgs84_to_local` (Python ETLs)
- `cartograph/config.js:wgs84ToLocal` (Node cartograph derive)

---

## Recommended approach (option 2)

### Step 1 — shift the two projection functions

In both `scripts/config.py:wgs84_to_local` and `cartograph/config.js:wgs84ToLocal`, after the equirectangular projection, apply R(-9.2°). Use `PARK_GRID_ROTATION` from `src/lib/terrainCommon.js` (or hardcode `-9.2 * π / 180` and import the canonical constant if both languages can see it; otherwise the Python script can just inline the same number with a comment cross-referencing the JS constant — the value is fixed by physical geography).

Add a docstring/comment at each entry point explaining: "Output is project world frame (park-aligned, -9.2° from compass-N). See `src/lib/terrainCommon.js` and ARCHITECTURE.md §7."

### Step 2 — re-run every ETL

- Python ETLs (`scripts/02-fetch-osm.py` → `11-merge-all.py` chain, `12-process-park-trees.py`, `13-fetch-street-lamps.py`, `14-process-park-paths.py`, `16-fetch-osm-ground.py`, `03-fetch-stl-parcels.py`, `10-fetch-mapillary.py`).
- Cartograph derivation: `cartograph/fetch.js` then `cartograph/derive.js` (regenerates `cartograph/data/clean/map.json`, ribbons, etc.).
- Re-bake whatever depends on the regenerated data: `cartograph/bake-ground.js`, `cartograph/bake-buildings.js`, `cartograph/bake-paths.js`, `cartograph/bake-lamps.js`, `arborist/bake-trees.js` (because the forbidden-surface tester reads from regenerated map.json).

### Step 3 — drop the data-migration step

`scripts/de-park-data.mjs` becomes obsolete: trees/water now come out of the ETL already in project world. Either:
- Delete the script entirely.
- Or keep the file but reduce it to a no-op with a header comment ("kept as a historical breadcrumb; ETL output is now project world by definition. Migration retired YYYY-MM-DD.").

Then update `meta.frame: "world"` markers on `park_trees.json` and `park_water.json` to remain accurate (they're now world-by-projection, not world-by-migration). Update their `coordinate_system` strings to match.

### Step 4 — verify

- Cartograph (`/cartograph.html` Designer/Measure/Survey): trees + water + cartograph map all align. The 9.2° tilt in tree-vs-park-edge that the operator originally flagged should be **gone**.
- Stage hero: tree-along-path arrangements should look tighter than they do today (trees currently sit ~5–25m off paths because trees are project-world but paths are compass).
- Preview hero: same as Stage.
- Bake stats: `bake-trees.js` will report a different forbidden-surface drop count than the current 8/644 (since the forbidden surfaces — water, streets — are now in the same frame as the trees being tested). Don't panic; verify the surviving tree population looks right against an aerial.

### Step 5 — code cleanup

After verification:
- Remove the `PARK_GRID_ROTATION` export from `src/lib/terrainCommon.js` if no consumer remains (the projection functions inline the rotation).
- Update `ARCHITECTURE.md §7` and the `terrainCommon.js` header to reflect that the rotation is now baked into the projection function and the standalone constant is gone.
- Update the project memory entry `project_world_frame_is_park_aligned.md` to match the post-finish state.

---

## What's safe to leave alone

- `src/components/LafayettePark.jsx` `_toWorld` helper for fence corners — that's authoring fence corners as park-axis-aligned ±a coordinates and rotating them into project world. Internally consistent and not derived from GPS, so unaffected. The helper still uses `_PARK_AXIS_RAD = -9.2°`; that's correct usage (it's the geometric authoring relationship between "park-local axis-aligned square" and "world", not a frame conversion shim).
- The forbidden-surface filter in `arborist/bake-trees.js` — it tests `tree.x, tree.z` against forbidden polygons. As long as both sides are in the same frame after step 2, the test is correct.

---

## What's already done on this handoff (commit alongside)

- `ARCHITECTURE.md §7` — corrected coordinate-systems note (was claiming park_trees/water were park-local; now explains the real convention).
- `src/lib/terrainCommon.js` — header expanded with the "project world is park-aligned, NOT compass-aligned" warning.
- `scripts/de-park-data.mjs` — header explains why park_trees needs rotation despite coming from a GPS→meters ETL.
- Project memory: `project_world_frame_is_park_aligned.md` saved with the trap I (Claude) fell into and how to avoid it.

---

## After this lands: Tree LoD

Per the operator's plan, Tree LoD work follows immediately. Don't start it before option 2 is verified — you don't want to be tuning LoD against a scene where the tree forbidden-surface filter is computing on the wrong (compass) cartograph polygons, or where trees and paths visually disagree.
