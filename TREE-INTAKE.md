# TREE-INTAKE.md — how a poured scene gets its trees, end to end

**The canonical doc for the neighborhood tree pipeline: from raw data → a baked, rendered canopy.** Generalizable per-town (Tier ①); Hi-Pointe/DeMun (`hipointe-demun`) is the reference build. Written 2026-07-05.

> **Read-order:** `CLAUDE.md` route gate → `ORIENTATION.md` → `README §⭐ START HERE`. Tree *library/atlas* internals live in the **arborist quartet** (`arborist/{README,FEATURES,ARCHITECTURE,BACKLOG,NOTES}.md`); the per-town *inputs* doctrine is `NEIGHBORHOOD-INPUTS.md §2`. **This doc is the join** — how the census + canopy data become placements the arborist atlas renders. The working ledger is `HANDOFF-hipointe-trees-lamps-fetch.md`.

---

## 1. The model (why it's built this way)

A neighborhood's trees are **two questions**, answered by **two kinds of data**:

| Question | Data | We do |
|---|---|---|
| **What grows here?** (species + proportions) | Municipal tree inventory (real species) | Derive a **MIX** — the empirical species distribution, collapsed to the renderable library palette |
| **Where are the trees?** (positions) | Point inventories + a **canopy raster** | **Honor real** points where we have them; **mix-sample** the rest; **fill** the gaps from % canopy |

**Doctrine (Jacob, 2026-07-05):** we do *not* need per-tree species truth everywhere. We determine a believable **mix** for the geography and **distribute it over whatever placement info we can find** — real species where a municipal inventory gives them, mix-sampled everywhere else, and **generically filled where a canopy raster says there are trees** (parks, campuses, private yards that no point inventory captures). Real where we have it; derived to read verdant.

This rides the existing arborist system unchanged (`feedback_no_parallel_pipeline_for_scenes`): the mix **is** the per-Look roster (`design.json#/trees`); `bake-look` packs its atlas; `bake-trees` places the census; the runtime substitutes any stragglers onto the roster. All the new work is **data prep** upstream of the bake.

---

## 2. The data sources (all free, all re-pointable per town)

| Source | Gives | Access | Script | Coverage note |
|---|---|---|---|---|
| **City of St. Louis Forestry** | Real per-tree species/DBH/condition | ArcGIS `maps9…/FORESTRY_TREES/MapServer/1` (layer `CITY_TREES`) | `13-fetch-city-trees.py` | **City limits only** (Hi-Pointe side); stops at the City/County line |
| **OpenStreetMap** `natural=tree` | Tree positions (species sparse) | Overpass API | `14-fetch-osm-trees.py` | Jurisdiction-blind — the **only** source covering the DeMun/County side |
| **NLCD Tree Canopy Cover** (USDA FS) | **% tree canopy per 30 m pixel** | MRLC WMS GetMap → GeoTIFF | `16-fetch-canopy.py` | CONUS, 2021. The areal "where + how dense" signal |

Analogous to the rest of the kit's intake: the **USGS DEM** (elevation, S3) and **assessor parcels** (ArcGIS) are fetched the same way. A new town **re-points the bbox** (`cartograph/data/<scene>/geography.json`) and re-runs — nothing here is Hi-Pointe-specific.

> **Honest limits.** Municipal inventories are *public/managed trees only* (no private yards). OSM is a volunteer subset. Neither reads "verdant" alone — that's what the canopy fill is for. The canopy raster is 30 m (coarse for exact placement, fine for *density*).

### Gotchas captured in the fetchers
- **Forestry endpoint moved** `maps6`→`maps9`; the old one 500s ("service not started").
- **Overpass 406s** the default `python-requests`/curl User-Agent — a real UA header is required.
- **MRLC WCS 404s GetCoverage** for CONUS TCC despite advertising it (geoserver bug) → we use **WMS GetMap with `format=image/geotiff`** (raw % values, not styled). The layer name carries a deployment suffix (`nlcd_tcc_conus_2021_v2021-4`), so `16` **discovers it from GetCapabilities** rather than hardcoding.

---

## 3. The pipeline (stage by stage)

```
DATA PREP (per scene, re-pointable)                         BAKE (existing arborist spine)        RENDER
─────────────────────────────────                          ──────────────────────────────       ──────
13 city-trees ─┐                                            bake-look   → per-Look atlas          InstancedTrees
14 osm-trees ──┤→ 15 derive-tree-mix ──→ roster+map+mix     (design.json#/trees → atlas)          (reads baked/<look>/
               │      │                    │                                                        trees.json + atlas;
16 fetch-canopy┘      └→ drapes OSM        └→ 17 fill-canopy → derived_trees.json                    substitutes any
                                              (mix ∝ % canopy)         │                             out-of-roster onto
                                                                       ▼                             a roster member)
                          park_trees + osm_trees + derived_trees ──→ bake-trees --placements <union>
                                                                     --species-map <scene map>
                                                                     → public/baked/<look>/trees.json
```

**Stage detail:**

1. **`13-fetch-city-trees.py`** → `<scene>/clean/park_trees.json` — City Forestry, clipped to the boundary disc, Dead/Stump dropped. Real `COMMON`/`DBH`/`CONDITION`.
2. **`14-fetch-osm-trees.py`** → `<scene>/clean/osm_trees.json` — OSM `natural=tree`, kept **West of the City/County divide** (`raw/admin_boundaries.json`) so it's spatially disjoint from the City census (no double-count).
3. **`15-derive-tree-mix.py`** → the heart of "what grows here":
   - Reads the City census → empirical `COMMON` histogram (231 species for HPDM).
   - **Collapses** to the renderable library palette via `EXACT` + `keyword_collapse()` (Tier-③ curation, data-informed) → ~18 species covering ~100% of the canopy.
   - Writes: **the roster** (`public/looks/<scene>/design.json#/trees`), **a per-scene species map** (`<scene>/tree-species-map.json`, `{COMMON: [libraryId]}`), **`<scene>/tree-mix.json`** (palette shares + `commonToLibrary` + `commonWeights`).
   - **Drapes** the OSM points: assigns each a mix-sampled `COMMON` (weighted by the empirical distribution, deterministic by position).
4. **`16-fetch-canopy.py`** → `<scene>/raw/canopy.tif` — NLCD TCC for the extent.
5. **`17-fill-canopy-trees.mjs`** (Node — reads the GeoTIFF with the kit's `geotiff` lib, like `bake-terrain.js`; Python here has no rasterio) → `<scene>/clean/derived_trees.json`:
   - Jittered grid over the disc; at each candidate, sample % canopy; **place with probability ∝ canopy fraction** (density follows real canopy).
   - **Skips candidates within `MIN_DIST` of an existing census point** — fills only the gaps (parks/yards/campuses), never doubles the streets.
   - Dresses each with the **same mix** (samples `tree-mix.json#/commonWeights`).
6. **`bake-look --look <scene>`** — packs the per-Look atlas from `design.json#/trees` (the roster the mix wrote). Its master-atlas sha1-dedup makes an ~18-species roster nearly free (`arborist/ARCHITECTURE.md §master atlas`).
7. **`bake-trees --look <scene> --placements <3 layers> --species-map <scene map> --forbidden-map <scene>/clean/map.json --output baked/<scene>/trees.json`** — unions the three census layers, routes each `COMMON` → library via the scene map, resolves to atlas variants, and **masks off hardscape** (next).

### Hardscape mask (a tree is never on pavement/water/building)
The mask lives in **`cartograph/forbidden-surface.mjs`** (`makeForbiddenTester`), shared by `bake-trees.js` and the canopy fill so they never drift. Scene-aware (`--forbidden-map <scene>/clean/map.json`); a poured scene forbids **building** (`map.buildings`), **water** (`layers.water`), **sidewalk / footway / path / steps**, and the **road surface + parking** (`block`, `pavement`, `alley`, `parking_lot`) — the last group added over LS's park-only set. Yards, parcels, parkland, and the **treelawn** (curb-to-sidewalk strip) are *allowed* — that's where street trees belong. A **bbox prefilter** (`polyWithBbox`) makes it ~O(1) per poly, so 8 k trees × ~4 k polys runs in <0.5 s (`feedback_polygon_walking_needs_spatial_index`). LS's tester is unchanged (same 7 checks, byte-identical results).

**Two behaviors:**
- **`bake-trees`** — *drops* any placement on a forbidden surface. Real census/OSM points that fall on hardscape are dropped (honest — they're real positions slightly off, or the poly is wide).
- **`17-fill-canopy-trees.mjs`** — *relocates* a synthetic canopy candidate: it spirals out (`RELOCATE_RINGS × RELOCATE_STEP` = 18 m) to the nearest allowed ground (treelawn/yard) rather than dropping, recovering density while keeping every trunk off hardscape. `register()` also spaces placed fill trees `MIN_DIST` apart so they don't pile onto the same strip.

**Wired into the one-button bake** (`cartograph/serve.js`, `POST /looks/<id>/bake`): the poured-scene tree branch unions whichever of `park_trees / osm_trees / derived_trees` exist and passes `--species-map <scene>/tree-species-map.json` when present. Ground-AO reads the scene's own `trees.json` for contact shadows. **`bake-look` is NOT in that handler** — the atlas is baked by the arborist ship-to-slab (`node arborist/bake-look.js --look <id>`); run it whenever the roster changes.

---

## 4. Render (existing, unchanged)

- `InstancedTrees.jsx` (mounted in `CartographApp.jsx#genericSceneConfig` with `bakeUrl=/baked/<look>/trees.json`) fetches the placement file.
- `treeAtlasMaterial.js` loads `/baked/<look>/trees-atlas.json` (**hard-requires it** — a missing atlas throws and renders nothing; always `bake-look` before expecting trees).
- **Runtime substitution** (`InstancedTrees.jsx:639`): any placement whose `species:variantId` isn't in the atlas roster is deterministically remapped to a **same-category roster member** — so partial rosters still render every placement. (This is why a scene renders even before the mix work; it just wears the wrong palette.)

---

## 5. Generalizing to a new town (the per-town checklist)

Everything below is **re-point-and-run** — nothing is Hi-Pointe-specific:

1. Pour the scene + create `public/looks/<scene>/design.json` (Extent → Pour).
2. `CARTOGRAPH_SCENE=<scene> python3 scripts/13-fetch-city-trees.py` — if the town has a City ArcGIS Forestry server (else skip; OSM + canopy still work).
3. `…14-fetch-osm-trees.py` — always available (OSM is global; the divide clip is optional — drop it if the town is single-jurisdiction).
4. `…15-derive-tree-mix.py` — derives the roster + map + mix from whatever census exists. **If no municipal census, the mix needs a hand-authored seed** (the `EXACT`/`keyword_collapse` table is STL-flavored — audit it per region).
5. `…16-fetch-canopy.py` + `node …17-fill-canopy-trees.mjs` — canopy fill (CONUS only; swap NLCD for **ESA WorldCover** S3 COGs outside the US).
6. `node arborist/bake-look.js --look <scene>` then the cartograph bake (or the one-button `POST /looks/<scene>/bake`).

**US-scoped today** (NLCD + USGS DEM + City Forestry are US federal/municipal). Global swap-ins are noted where relevant (ESA WorldCover for canopy).

---

## 6. Tunables & file map

**Density dials** (`17-fill-canopy-trees.mjs`): `GRID_SPACING` (10 m — ↓ = denser fill), `MIN_DIST` (7 m — min spacing between any two trees, believable urban spacing), `CANOPY_GAMMA` (1.0 — place-probability curve on canopy fraction; <1 boosts sparse-canopy areas), `RELOCATE_RINGS`/`RELOCATE_STEP` (6 × 3 m = 18 m spiral search off hardscape). **Palette size**: `PALETTE_TARGET` (18) in `15`.

**Files** (per scene under `cartograph/data/<scene>/`):
- `raw/` — `city_trees_raw.json`, `osm_trees_raw.json`, `canopy.tif`, `admin_boundaries.json`
- `clean/` — `park_trees.json`, `osm_trees.json`, `derived_trees.json` *(the three census layers)*
- scene root — `tree-mix.json`, `tree-species-map.json`, `geography.json`, `neighborhood_boundary.json`
- `public/looks/<scene>/design.json#/trees` — the roster · `public/baked/<scene>/{trees.json, trees-atlas*.png, trees-atlas.json}` — the slab

**Code:** `scripts/{13,14,16}-*.py` + `scripts/{15,17}-*.{py,mjs}` (intake/mix/canopy), `arborist/bake-trees.js` (`--placements` union, `--species-map`, `--forbidden-map`, `--output`), `arborist/bake-look.js` (atlas), `cartograph/forbidden-surface.mjs` (shared hardscape mask), `cartograph/serve.js` (poured-tree bake branch), `cartograph/bake-ground-ao.js` (contact shadows), `src/components/{InstancedTrees,treeAtlasMaterial}.jsx`, `src/cartograph/CartographApp.jsx#genericSceneConfig`.

---

## 7. State (2026-07-05) — built vs open

**Built + verified (hipointe-demun):** census (560 City + 870 OSM) · mix (17-species palette, empirical shares) · **NLCD canopy fill (relocate-off-hardscape)** · **hardscape mask** → **6,967 trees, 0 on any forbidden surface (verified), 99% atlas-covered, 0 unmatched** (2,317 canopy candidates relocated onto treelawn/yard). LS untouched throughout (`baked/default.json` byte-identical).

**Open / caveats:**
- **Library gaps → filler.** ~40% of the canopy renders as `generic_tree_2` / `procedural_*` (no dedicated chassis for sweetgum, tuliptree, pear, redbud, ginkgo, coffeetree…). **Proportionally honest, visually repetitive** until the arborist library grows real chassis. See `arborist/ROSTER-COVERAGE.md §2 GAPS`.
- **Roster authoring is LS-hardwired.** `syncLookRoster('lafayette-square')` is a literal constant (`generate-salon.js:1743`); `/coverage` reads LS's `park_trees.json` (`roster-coverage.js:40`). `15-derive-tree-mix.py` **bypasses** this by writing `design.json#/trees` directly — the Grove UI can't yet seed a non-LS roster. De-hardwiring is the productization arc (the instance-decoupling "producer/roster arc", `HANDOFF-blank-app-instance-decoupling.md`).
- **`bake-look` is a separate gesture** from the cartograph pour bake — run it on roster change or the atlas goes stale.
- **Perf:** 7,167 instanced trees (vs LS's ~756). Fine on desktop Stage via instancing + LOD + cull; watch mobile. `GRID_SPACING` is the throttle.
- **Private-yard nuance:** the canopy fill *does* now populate yards (NLCD sees them). Density is uniform-by-canopy, not lot-aware — a future refinement could bias street trees vs yard trees.
