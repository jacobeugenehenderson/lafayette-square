# HANDOFF — HiPointe-DeMun: trees + lamps DATA intake (the deferred follow-up)

**Agent: FRESH.** The HiPointe **bake→3D phase landed** (commits `b0284080` terrain · `17784239` buildings+StageEnvironment · `29c0b4fd` ghost-removal). HiPointe now pours a correct, LS-free slab and renders in 3D: its own terrain + ground + 5230 buildings, **honest zero trees/lamps, no LS ghosts.** This brief is the ONE deferred piece: give HiPointe its **own** trees + lamps. It was split out because both data sources have real problems (below) that need investigation, not a blind grind. Written 2026-07-02.

## Read first
1. `CLAUDE.md` route gate → `ORIENTATION.md` → `README §⭐ START HERE`.
2. `feedback_installations_are_independent` (the law), `project_hipointe_demun_pour_step0_landed` (the pour history + this landing).
3. `cartograph/BAKE.md` (terrain is now a per-Look slab artifact — see the bake chain) + `SLAB-CONTRACT.md`.

## What already exists (the plumbing is done — this is DATA + two small wires)
- **The bake handler + all bake scripts are installation-agnostic** (A/B/C). `bake-ground-ao.js` is scene-gated: a poured scene reads its OWN `lamps.json` (else none) and does NOT read LS's global `baked/default.json` trees. So the moment HiPointe HAS its own tree/lamp data, the AO contact-shadows bake correctly with zero code change to AO.
- **The generic `StageEnvironment`** (`CartographApp.jsx genericSceneConfig`) mounts `SlabBuildings` + `BakedLamps` (look-keyed). `BakedLamps` already reads `/baked/<look>/lamps.json` — so wiring HiPointe lamps is purely a bake-source fix (below), no render change.
- **Trees are the only unmounted consumer:** `InstancedTrees` is deliberately excluded from the generic env because it reads the GLOBAL `baked/default.json` (LS placements). See the two wires below.

## The work

### 1. Lamps — fix the prebake coord bug, then flip the source gate
- **⚠️ BUG found (not yet fixed):** HiPointe's `clean/map.json` `streetlamp` layer has 641 entries, but **all 641 sit at x 6883–8228 / z 1038–2805 — ~7 km outside** the ±1560 neighborhood frame (buildings/ground are correctly centered at ±1500). So the streetlamp layer is in the WRONG coordinate space (raw un-centered OSM, or a projection miss for that layer in prebake). This is a **SKELETON/prebake** bug (`derive.js` / the layer projection), not a bake bug. Fix it there so the lamps land in-frame.
- Then **scene-key `bake-lamps.js`'s SOURCE:** today it reads LS's `src/data/street_lamps.json` (its terrain is already scene-aware). For a poured scene, read the scene's own lamps (the fixed `map.json` streetlamp layer → `{x,z}` points). Serve.js currently **gates lamps to the default scene** (`isDefaultScene`) precisely so HiPointe doesn't inherit LS's — **remove that gate** once the source is scene-keyed.

### 2. Trees — fetch a census (City + County), then two wires

> **✅ DATA SOURCES SCOUTED 2026-07-05 (supersedes the "uncertain / spotty" reads below).** All three probed live against the HPDM bbox (`geography.json`: lat 38.6199–38.66469, lon −90.34789 to −90.27148). Findings:
>
> | Source | Covers | Status | Notes |
> |---|---|---|---|
> | **City Forestry** `maps9.stlouis-mo.gov/arcgis/rest/services/FORESTRY/FORESTRY_TREES/MapServer` | Hi-Pointe (City) | ✅ live, rich | **The LS `maps6` endpoint is RETIRED** ("service not started") — it moved to **`maps9`** and is now the *full* inventory (layers: `0 CITY_TREES_ALL_SITES`, `1 CITY_TREES`, `4 FOREST_PARK_TREES`, `2 VACANT_PLANTING_SITES`, `3 CITY_ASH_TREES`, `5 PLANTING_PLANNING`), not park-clipped. **Layer 1 `CITY_TREES` = 6,146 trees in the bbox.** Fields `COMMON, DBH, STEMS, CONDITION` — **identical to LS's `park_trees.json` schema**, so `scripts/12-process-park-trees.py` nearly works as-is (point it at layer 1, clip to the HiPointe boundary polygon not the park). Bulk GeoJSON (whole city, 76 MB): `static.stlouis-mo.gov/open-data/FORESTRY/CITY_TREES.geojson`. |
> | **Clayton / St. Louis County** | DeMun (County) | 🟡 EXISTS (not a desert) | **Correction: DeMun is NOT a data gap.** Clayton ran a **Davey Resource Group inventory in 2022/23 — ~11,000 trees + planting sites, streets + parks.** Real and recent. **Catch:** no anonymously-discoverable public REST endpoint yet (web search conflates St. Louis's Clayton with *Clay County* near KC; `claytonmo.gov` forestry page 403s automated fetch). Reaching it = dig Clayton's ArcGIS org / open-data request — solvable, not a one-liner. County hub: `data-stlcogis.opendata.arcgis.com`. |
> | **OSM `natural=tree`** (Overpass) | **both sides, jurisdiction-blind** | ✅ live, ready NOW | **16,201 tree nodes in the bbox** — the *only* source that spans the City/County line uniformly, so it covers DeMun today. Positions reliable; **species partial** (some tagged e.g. `Aesculus pavia`, many bare `natural=tree`) — which is exactly where the Arborist's canonicalization + composite-cousin machinery renders a bare position as a plausible tree. |
>
> **Recommended path:** (1) **City side — go now**, mirror LS against `maps9` layer 1 clipped to the HiPointe boundary. (2) **County side — take OSM as the honest floor immediately**; file "obtain Clayton's Davey inventory" as a non-blocking follow-up. (3) **Verdancy is a SEPARATE arc** — see the caveat below.
>
> **▶ BUILT 2026-07-05 (both fetchers land; wiring is what's left).**
> - `scripts/13-fetch-city-trees.py` — City (maps9 layer 1) → `<scene>/clean/park_trees.json`. HiPointe: **560 trees** (clipped to the disc, Dead/Stump dropped). Same schema as LS `park_trees.json`.
> - `scripts/14-fetch-osm-trees.py` — OSM `natural=tree` (Overpass) → `<scene>/clean/osm_trees.json`. Kept **only the County/DeMun side** (WEST of the City/County divide in `raw/admin_boundaries.json`) so it's **spatially disjoint from the City census** (verified: min City↔OSM separation 11 m — no double-count). DeMun: **870 trees**, species-sparse (2/870 tagged) — honest positions, `shape` defaults broad, no DBH/condition. ⚠️ **Overpass 406s the default `python-requests`/curl UA — a real `User-Agent` header is required** (fixed in-script).
> - `scripts/tree_shape.py` — shared `COMMON→shape` taxonomy (12-process still has an inline copy; fold in when LS `clean/map.json` is regenerable).
> - **Combined scene census = 560 + 870 = 1,430 trees.** The two `clean/*.json` layers are DISJOINT by construction → **wire #1 (`bake-trees.js`) should UNION `park_trees.json` + `osm_trees.json`** (no dedup needed). Data artifacts are gitignored (regenerable by re-running the fetchers).
>
> ⚠️ **All three are public/managed trees only (or OSM's volunteer subset) — NONE include the private-yard canopy**, which in Hi-Pointe/DeMun is most of what reads as "verdant." A faithful-census layer will look *sparser* than the real neighborhood. To actually read green, a **derived canopy** (treelawn spacing + parcels + parks, modulated by a tree-canopy raster) is needed *on top* of the census — its own piece of work, do not couple it to the fetch.

- **⚠️ Data source is NOT in the repo.** LS's trees came from a **manual ArcGIS REST export** (`scripts/raw/lafayette_park_trees.json` → `scripts/12-process-park-trees.py`), and it's **PARK trees only** (point-in-park-polygon filtered), not a neighborhood street-tree census. So there is no captured endpoint to mirror for a whole neighborhood. *(2026-07-05: the endpoint is now known live — see the scouted table above.)*
- **HiPointe straddles the City/County line** (`admin_boundaries.json`, OSM rel 1180533): **Hi-Pointe = St. Louis City, DeMun = St. Louis County/Clayton.** So a full census needs BOTH:
  - **St. Louis City Forestry** — the live `maps9` FeatureServer above (Hi-Pointe side). ~~find the endpoint~~ **found: `maps9…/FORESTRY_TREES/MapServer/1`.**
  - **St. Louis County / Clayton** — the Davey 2022/23 inventory (DeMun side) **exists** (see table); OSM `natural=tree` is the ready fallback if the Clayton endpoint proves hard to reach.
  - Mirror the parcels City/County split pattern: `scripts/03-fetch-stl-parcels.py` (City) + `scripts/03b-fetch-stlco-parcels.py` (County), both scene-aware via `scripts/config.py`. Normalize both → one census schema, clip to the HiPointe boundary.
- **Then the two wires — ✅ DONE 2026-07-05:**
  1. ✅ **`arborist/bake-trees.js`** now accepts `placements` as an ARRAY (unions the disjoint City + OSM layers) and honors `--output` (was declared-but-unused). **`serve.js` bake handler:** poured scenes (`!isDefaultScene && layerOn('tree')`) union whichever of `<scene>/clean/{park_trees,osm_trees}.json` exist → **look-scoped `public/baked/<id>/trees.json`** (no census on disk → honest-zero skip; never LS's `default.json`). LS's `--look default` → `baked/default.json` path is logically unchanged.
  2. ✅ **`InstancedTrees.jsx` needed no change** — it already takes a `bakeUrl` prop. The generic `StageEnvironment` (`genericSceneConfig`) now **mounts `InstancedTrees` gated on `!hiddenLayers.tree`** with `bakeUrl={…baked/<lookId>/trees.json}` — the look-scoped path, so a poured scene never reads LS's global `default.json` (no ghost).
  - ✅ **`bake-ground-ao.js`** reads poured-scene trees from `lookDir/trees.json` (mirrors `lamps.json`) → correct contact-shadows; LS still reads `default.json`.
  - **Verified:** union bake of hipointe-demun = **1,430 placements (560 City + 870 OSM), 0 unmatched, 47 variants**; output shape matches LS `default.json` (minus LS-only per-instance `heroTier`, which `InstancedTrees` treats as optional). **Still to do:** run the real bake handler (`POST /bake?look=hipointe-demun`) to ship `baked/hipointe-demun/trees.json` into the slab + regen AO, and eyeball the render (bake-level verified; browser render not yet driven).

## Done =
HiPointe bakes + renders its **own** street lamps (in-frame) and its **own** trees (City + County census, or honest-zero where no data), with correct ground contact-shadows — no LS content, zero kit edits for the NEXT town. Every fix installation-agnostic.
**Trees: DONE at the code/bake level (2026-07-05).** Lamps: still the two prebake/source fixes in §1 (streetlamp coord bug + source gate).
