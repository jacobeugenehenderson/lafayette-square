# HANDOFF — HiPointe-DeMun: the bake → 3D Stage phase

**Agent: FRESH.** Pick up neighborhood #2 (HiPointe-DeMun) where the last session stopped: the **2D Designer is done + Jacob-approved**; the **3D/bake half is LS-coupled and non-functional for a second installation.** This brief is the map of that half — the exact LS-hardcodes, the patterns to reuse, and the content gaps — so you don't re-discover what's already found. Written 2026-07-02 at checkpoint.

## Name yourself, then read (in order)
1. **`CLAUDE.md` route gate → `ORIENTATION.md` → `README §⭐ START HERE`** (the universal path).
2. **The project memory** (auto-loaded): `project_hipointe_demun_pour_step0_landed.md` (the whole #2 pour history + this checkpoint) and — load-bearing for this phase — **`feedback_installations_are_independent.md`**: *installations are separate properties; the kit is shared; NO kit module may name or import a specific installation. Adding a town = drop a data folder + a Look, zero kit edits.* Everything below MUST honor that law.
3. **`cartograph/BAKE.md`** (the bake chain SSOT) + `SLAB-CONTRACT.md` (what a slab is) + `cartograph/STAGE.md` (the Look/3D tool).
4. `cartograph/ARCHITECTURE.md §8` (ground conformance / terrain) — the terrain-sampler doctrine bites hard here.
5. Skim last session's commits `283676ed..e3cf65fa` (`git log --oneline`) — they establish the installation-agnostic patterns you'll extend.

## The state (what's true right now)
- **2D Designer: DONE.** HiPointe opens via the Looks pulldown (`/cartograph`), renders its frame + one-way chevrons + scene-aware aerial + buildings/land-use. All installation-agnostic. Jacob: *"very very solid start."* **Do not disturb the 2D path.**
- **The kit is installation-agnostic** (refactor commit `47e2ca81`): `CARTOGRAPH_SCENE` env seam (config.js/config.py), `makeBoundary(nb)` factory (not a registry), store fetch-by-id (`sceneGeography`/`sceneBoundary`/`sceneRibbons`/`sceneMap`), per-scene serve.js verbs (`skeleton|centerlines|overlay|ribbons|map|geography|boundary`), generic `sceneConfig`. **Follow these exact patterns for the bake side.**
- **HiPointe data on disk:** `cartograph/data/hipointe-demun/` — `geography.json`, `neighborhood_boundary.json` (center [0,0], r1350), `raw/` (osm.json, msbf.json, stl_parcels.json, stlco_parcels.json, admin_boundaries.json, elevation.tif→LS n39w091 symlink), `clean/` (skeleton.json, map.json, ribbons.json). Its Look: `public/looks/hipointe-demun/{design.json}` + index entry.
- **`public/baked/hipointe-demun/` was DELETED** — it was a Frankenstein slab (LS buildings/terrain/tree-shadows on HiPointe ground) from debugging. A correct one is what this phase produces.

## The problem, precisely (3 verified facets, one root)
The bake→Stage half consumes LS's enriched `src/data/*` + hardcodes LS. Baked ground EXTENT is the only correct part.

| Facet (Jacob saw) | Cause | File |
|---|---|---|
| "wrong area" (ground warped) | ground bakes FLAT; terrain lift is additive at RUNTIME via `makeElevationSampler` reading **`src/data/terrain.bin` = LS's terrain** (global, not scene-scoped). HiPointe ground lifted by LS's hills. | `src/lib/terrainCommon.js`; `bake-terrain.js` writes the global `src/data/terrain.{json,bin}` |
| buildings in 2D, none in 3D | (a) generic `sceneConfig` has **no `StageEnvironment`** → no 3D content mounts; (b) baked `buildings.json` is **LS's 1082** | `CartographApp.jsx` `genericSceneConfig` (~line where `StageEnvironment` is absent; consumed ~L1095); `bake-buildings.js` |
| vestigial LS tree contact-shadows in HiPointe center | `bake-ground-ao` bakes shadows from **LS's `src/data/park_trees.json` + `street_lamps.json`** | `bake-ground-ao.js` |

## The work (each item = installation-agnostic; the test is "Provincetown works too")

### A. Terrain — fixes "wrong area" (do FIRST; it's the sampler everything else sits on)
- `bake-terrain.js`: remove `const SCENE='lafayette-square'`; take `--scene`/`CARTOGRAPH_SCENE`; read `cartograph/data/<scene>/raw/elevation.tif` (HiPointe's is linked ✓). **⚠️ Output is currently the GLOBAL `src/data/terrain.{json,bin}` — that COLLIDES across installations.** Make terrain output **scene-scoped** (e.g. `public/baked/<look>/terrain.*` or `cartograph/data/<scene>/clean/terrain.*`).
- `src/lib/terrainCommon.js makeElevationSampler`: load the ACTIVE installation's terrain (by id / from the slab), not the global LS file. Both `bake-ground.js` (bake-time refine) and `BakedGround.jsx` (runtime lift) call it — thread the scene's terrain through both.
- HiPointe + LS share the **n39w091** USGS tile, but the CLIP differs (per-scene boundary) → each still bakes its own terrain artifact.

### B. Buildings + a generic StageEnvironment — fixes "no buildings in 3D"
- `bake-buildings.js`: line ~527 hardcodes `src/data/buildings.json` (LS, **`.footprint`** schema, richly enriched: wall/roof material, stories, elevation). HiPointe's buildings are in `cartograph/data/<scene>/clean/map.json` as **`.ring`** (MSBF, minimal). **This is an ADAPTER, not a path swap** — map a scene's `map.json` buildings into what bake-buildings needs (footprint from ring; height from MSBF/OSM or a default; materials → palette default). Also line ~35 reads LS `terrain.bin` for base heights → use the scene terrain from (A).
- **Generic `StageEnvironment`** in `CartographApp.jsx`: `genericSceneConfig` currently returns no `StageEnvironment`, so `{!inDesigner && sceneCfg.StageEnvironment && …}` mounts nothing 3D. Add one that mounts the **installation-agnostic slab consumers** (SlabBuildings, BakedGround already mounts separately, BakedLamps, baked trees) reading `lookId`. **⚠️ Verify which of LS's StageEnvironment children are generic vs LS-specific:** LS mounts `LafayettePark` (LS park), `InstancedTrees`, `LafayetteScene` (the slab renderer — likely generic despite the name; CONFIRM), `BakedLamps`, `GatewayArch` (LS hero prop — LS-specific, exclude). The generic env = slab-driven parts minus LS props.

### C. Trees + lamps — fixes the vestigial shadows + gives HiPointe its own
- **Intake gap (Tier-②, not yet fetched):** HiPointe has NO tree census / lamp data. It **straddles the City/County line**, so trees need BOTH **St. Louis City Forestry** (Hi-Pointe side, the endpoint LS uses) AND **St. Louis County** forestry (DeMun side) — mirror the parcels pattern (`scripts/03-fetch-stl-parcels.py` City + `scripts/03b-fetch-stlco-parcels.py` County, both scene-aware via config.py). Lamps: OSM lamps are already in HiPointe's `osm.json` (`map.json` has a `streetlamp` layer, ~641) — wire those instead of LS's `street_lamps.json`.
- `bake-ground-ao.js`, `bake-lamps.js`, `arborist/bake-trees.js`: scene-key the tree/lamp source (scene data, not LS `src/data/*`). **Until the intake lands, HiPointe legitimately has none → bake NONE, not LS's** (that alone kills the vestigial shadows). **⚠️ the bake handler runs `arborist/bake-trees.js --look default` (serve.js ~L682) — hardcoded `default`; fix.**

### D. The bake handler (serve.js ~L543-702)
Already skips pipeline/promote for non-default scenes and passes `--scene`/`--look`. Audit every step it runs (ground ✓, buildings, ground-ao, lamps, scene, trees) for LS-hardcoded inputs/paths; **⚠️ I did not read `bake-lamps.js` / `bake-scene.js` — check them.**

## Patterns to reuse (don't reinvent)
- Backend scripts: `CARTOGRAPH_SCENE` env → `config.js`/`config.py` resolve geography (`data/<scene>/geography.json`) + `RAW_DIR`/`CLEAN_DIR`. Add `--scene` parse where a script is invoked with it.
- Scene-scoped artifact paths: non-default reads/writes under `cartograph/data/<scene>/clean/` or `public/baked/<look>/`; the DEFAULT installation (`lafayette-square`) may keep its bundled/global fast-path — but that's the ONLY named installation allowed, and only as the default.
- Frontend: fetch-by-id into the store; kit components read the active installation's data from the store; **factories over registries**; NO component names a specific installation (only `lafayette-square` as default + `toy` as fixture).

## Boundaries
- **Do NOT touch the 2D Designer path** (it's done + approved) except where a shared artifact (terrain, buildings source) legitimately feeds both.
- **Do NOT reintroduce cross-installation coupling** — no `SCENE_GEO`/`SCENE_BOUNDARIES`-style registries, no importing HiPointe into a kit module. If you're tempted to hardcode #2 to move fast, that's the exact mistake from last session (`feedback_installations_are_independent`).
- LS must stay byte-identical: verify LS's bake + 3D Stage are unchanged after each step.
- Commit per logical step; keep LS's `src/data/*` intact.

## Suggested order
A (terrain) → B (buildings + generic StageEnvironment) → C (trees/lamps: fetch intake, then bake) → D (handler audit). A+B alone make HiPointe's 3D Stage show its **own buildings on its own terrain** — the big visible win; C removes the LS ghosts + adds its greenery.

## Done =
`CARTOGRAPH_SCENE=hipointe-demun` (via the Bake button on the HiPointe Look) pours a **correct** slab into `public/baked/hipointe-demun/` — HiPointe's own buildings on HiPointe's own terrain, its own (or honestly zero) trees/lamps, **no LS content** — and 3D Stage renders HiPointe (buildings visible, terrain correct, no vestigial LS shadows). LS's bake + 3D verified unchanged. Every fix installation-agnostic (a Provincetown drop-in would bake with zero kit edits).
