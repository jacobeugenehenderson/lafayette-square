# TREE-INTAKE.md — how a poured scene gets its trees, end to end

**The canonical doc for the neighborhood tree pipeline: from raw data → a baked, rendered canopy.** Generalizable per-town (Tier ①); Hi-Pointe/DeMun (`hipointe-demun`) is the reference build. Written 2026-07-05; revised 2026-07-16 (frozen-curb `makeZoneTester` mask + real-first doctrine; **Lafayette Square landed through this same pipeline** — normalized off its `DEFAULT_SCENE` special-case, no longer the park-only exception).

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

**Real-first — the hard precedence (Jacob, 2026-07-16).** Real placements (municipal inventory, park census, address) are laid **first** and are **never displaced** by a synthetic one; synthetic fill occupies **only** ground real data doesn't cover; on conflict the synthetic yields (relocate/drop), the real never does. A corollary the LS landing proved: **where a hood sits fully inside a municipal inventory, real coverage can be dense enough that synthetic fill is unnecessary and is dropped entirely** (LS baked City + OSM real-only, no NLCD — §7). Derived scatter is the gap-filler for hoods (like HPDM's County half) the inventory doesn't reach, not a default.

> **⚠️ Naming fossil.** `clean/park_trees.json` is a misnomer inherited from the reference build — it is the **City Forestry** layer (whole-hood, `scripts/13`), not a "park." A hood's genuine *park* census, where one exists, is separate authored data; **verify before assuming a "park census" is hand-authored** — LS's turned out to be City Forestry clipped to the park polygon (99.2% redundant with the whole-hood inventory), so it was folded in, not kept as a distinct well.

---

## 2. The data sources (all free, all re-pointable per town)

| Source | Gives | Access | Script | Coverage note |
|---|---|---|---|---|
| **City of St. Louis Forestry** (street) | Real per-tree species/DBH/condition | ArcGIS `maps9…/FORESTRY_TREES/MapServer/1` (layer `CITY_TREES`) | `13-fetch-city-trees.py` | **City limits only** (Hi-Pointe side); stops at the City/County line |
| **City of St. Louis Forestry** (Forest Park) | Rich: Scientific_Name/Genus/DBH/Condition/Height | ArcGIS same service, **layer `4`** (`FOREST_PARK_TREES`) | `18-fetch-forest-park-trees.py` | Forest Park + edge; clipped to the boundary disc. Deduped vs OSM/City at bake (richest survives). Free win on an endpoint we already trust. |
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
7. **`bake-trees --look <scene> --placements <layers> --species-map <scene map> --forbidden-map <scene>/clean/map.json --zone-shape baked/<scene>/shape.json --boundary <scene>/neighborhood_boundary.json --output baked/<scene>/trees.json`** — unions the census layers, routes each `COMMON` → library via the scene map, resolves to atlas variants, **masks off hardscape** with the frozen-curb zone tester, applies the hood dissolve, and emits per-tree `source` provenance (next).

### Hardscape mask — where a tree may stand (the frozen-curb zone model)
**Updated 2026-07-16.** The mask lives in **`cartograph/forbidden-surface.mjs`**, shared by `bake-trees.js` and the canopy fill so they never drift. Two constructions, one concept:

- **`makeZoneTester({ shapePath, mapPath })` — the poured-scene mask.** Reads the **frozen Section surfaces** from `public/baked/<scene>/shape.json` (the same construction that draws the ground, so the mask can't drift from what the operator sees — WYSIWYG). Stated **positively — where a tree IS allowed** (the useful axis): a tree may stand on exactly two surfaces — the **swappable treelawn strip** (curb-to-sidewalk) and **exposed interior Land Use** (yard / parcel / parkland), where *exposed* means nothing hard covers it. Everything else is disallowed by *not being* one of those two: the carriageway (outside the curb — no LU there), the sidewalk band, and any building / water / parking / path footprint on top of LU (those come from the scene's `clean/map.json`, passed as `--forbidden-map`, tested *inside* the zone tester). Key invariant (Jacob): **there is no LU outside tiles**, so the poured extent is the entire plantable universe — no un-poured annulus to chase.
- **`makeForbiddenTester({ mapPath })` — LEGACY, retired.** It asked the block-face *paint-stack* layers a physical question — a category error that forbade ~60% of yards while permitting the road (the street is the grout between tiles, so no layer covers it). It survived only for LS's old park-only census; **LS was migrated onto `makeZoneTester` 2026-07-16** and the legacy tester has no remaining tree caller.

**Mask selection (`bake-trees.js`):** `--zone-shape <baked/<scene>/shape.json>` present → `makeZoneTester`; absent → the legacy fallback. **⚠️ The one-button pour (`cartograph/serve.js`) must forward `--zone-shape` AND `--boundary`** — a flag-forwarding gap that silently kept scenes on the legacy mask was fixed 2026-07-16; it had affected every poured scene, not just LS.

**Two behaviors:**
- **`bake-trees`** — *drops* any placement on a forbidden surface — **except surveyed/real points are `nudge()`-ed** onto the nearest legal ground first (the strip widths are seeded ~1.5 m guesses; a recorded tree outranks a guess). Invented (derived) trees get no such courtesy — they're dropped.
- **`17-fill-canopy-trees.mjs`** — *relocates* a synthetic canopy candidate off hardscape (`RELOCATE_RINGS × RELOCATE_STEP` = 18 m spiral) rather than dropping. `register()` also spaces fill trees `MIN_DIST` apart.

A **bbox prefilter** (`polyWithBbox`) keeps it ~O(1) per poly (`feedback_polygon_walking_needs_spatial_index`).

### Hood-membership dissolve (`--boundary`)
When the scene's `neighborhood_boundary.json` is passed, invented (**derived**) trees outside the boundary are thinned and every emitted tree gains an `inHood` flag. **Real (census/inventory) trees are never dropped by the dissolve** — consistent with the real-first doctrine (§1).

### Provenance (`source`) + trunk size (`dbh`)
`bake-trees` emits two per-tree data-layer facts:
- **`source`** (`park` / `city-inventory` / `forest-park` / `osm` / `derived`) — where the placement came from, so literal-vs-statistical is permanent in the slab. Deliberately **no** runtime literal/statistical toggle (built the field, not the UI ahead of a need).
- **`dbh`** — trunk diameter, the standard forestry **size/age proxy**. **Measured** for real inventory (`REAL_DBH_SOURCES` = city-inventory / forest-park / park); **empirically sampled** for OSM/derived from the neighborhood's own real per-species DBH distribution (global fallback for thin species, deterministic by position seed). The same "derive from real, distribute over the rest" move as species draping — so every tree has a believable size, and `source` still marks measured vs estimated for an honest benchmark. Built in the bake (a pre-pass over the deduped real trees), NOT by re-running `scripts/15` (which would clobber the merged species map).

**Wired into the one-button bake** (`cartograph/serve.js`, `POST /looks/<id>/bake`): the poured-scene tree branch unions whichever of the census layers exist and forwards `--species-map`, `--forbidden-map`, `--zone-shape`, `--boundary`. Ground-AO reads the scene's own `trees.json` for contact shadows. **`bake-look` is NOT in that handler** — the atlas is baked by the arborist ship-to-slab (`node arborist/bake-look.js --look <id>`); run it whenever the roster changes.

---

## 4. Render (3D slab + the 2D Designer layer)

- `InstancedTrees.jsx` (mounted in `CartographApp.jsx#genericSceneConfig` with `bakeUrl=/baked/<look>/trees.json`) fetches the placement file.
- `treeAtlasMaterial.js` loads `/baked/<look>/trees-atlas.json` (**hard-requires it** — a missing atlas throws and renders nothing; always `bake-look` before expecting trees).
- **Runtime substitution** (`InstancedTrees.jsx:639`): any placement whose `species:variantId` isn't in the atlas roster is deterministically remapped to a **same-category roster member** — so partial rosters still render every placement. (This is why a scene renders even before the mix work; it just wears the wrong palette.)

### The 2D Designer tree layer (`DesignerTrees.jsx`, 2026-07-16)
The flat Designer reads the **same baked slab** (`baked/<scene>/trees.json`) as the 3D `InstancedTrees` — one source of truth, so 2D == 3D == bake by construction. Each tree is a flat instanced dot: **radius from `dbh`** (trunk-width proxy — not canopy-sized, to avoid a sea of circles) and **color from `source`** (provenance). **Scene-generic** (LS + every poured hood via one component), mounted in `CartographApp` for `inDesigner`; retired MapLayers' old LS-only `park_census` disc import (the data-flow split — Designer read a stale census while the bake read the union). **Data-gated** through the existing panel `tree` toggle (off → not fetched, not built). Provenance colors are CSS tokens (`cartograph.css` `--carto-tree-*`), not hardcoded.

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

## 7. State — built vs open

**⭐ lafayette-square LANDED (2026-07-16, eye-gated — "so much more stunning than anything we've done").** LS went **756 (park-only) → 5,768 trees, 100% REAL** — City Forestry whole-hood (2,486) + OSM (3,282), **real-only** (NLCD derived fill dropped — inside-city coverage made it unnecessary), on the frozen-curb `makeZoneTester` mask (0 illegal, median NN 6.9 m, park intact). LS was **normalized off the `DEFAULT_SCENE` special-case** — park/tree/water data relocated to the per-hood convention, the `tree-bake-inputs.mjs` short-circuit + `bake-ground.js` water ternary deleted, ~20 readers repointed; the one-button `--zone-shape`/`--boundary` flag gap fixed; per-tree `source` provenance baked. **Anti-regression:** the real census wells (`park_trees.json` + `osm_trees.json`) were moved OUT of gitignore — they'd been ignored, which let 6,866 real placements sit unbaked while LS rendered 756. Commits `b11d9f4f` + `7bcecfe1`. Full detail: memory `project_ls_tree_census_city_osm_real_only`. Open: a `scripts/15` re-run clobbers the merged `tree-species-map.json` (needs a tracked overrides file).

**⭐ DBH + 2D Designer trees (2026-07-16, eye-gated — "looking great").** Added per-tree `dbh` (measured + empirically sampled — see §Provenance) and the shared 2D **`DesignerTrees.jsx`** layer (see §4). Both scenes re-baked, all trees now carry `dbh` + `source`: **LS 5,641** (the honest bake — the committed 5,768 was stale vs its own wells) and **HPDM 10,352** (541 city + 1,092 forest-park + 1,505 osm + 7,214 derived). Uncommitted at time of writing.

**hipointe-demun RE-BAKED (2026-07-17, commit `93e59da9`):** added **Forest Park layer 4** (`scripts/18`, 1,319 real species-bearing trees inside the boundary — the conifers/columnars the DeMun side lacked), a **cross-well proximity dedup** (`bake-trees.js`: keep the richest source per 3 m trunk — real-species > OSM position > synthetic), and per-tree `source` provenance. Result: **10,352 trees — 30% REAL / 70% synthetic-position.** The 70% is the **County-side census gap** (no municipal inventory west of the city limit), NOT over-scatter: density **21.1 trees/ha vs LS's 23.1** — the higher count is just area (492 ha, ~2× LS). *(HPDM straddles the City/County line, so unlike LS it genuinely needs the OSM + NLCD-derived layers for its uninventoried County half — [[project_hpdm_tree_census_jurisdiction_gap]]; close it with Clayton's Davey inventory via a records request.)* Real wells (park/forest-park/osm) tracked out of gitignore, same anti-regression as LS.

> **Doctrine (Jacob, 2026-07-17): the census is real POSITIONS to match IRL density; per-tree species is the bonus, not the point.** So a scene fully inside a census jurisdiction (LS) goes real-only; a scene straddling one (HPDM) fills the uninventoried side with NLCD-derived *positions* to hit the same canopy density. Both match density — one with surveyed points, one with scattered ones. Perf is the impostor lane's job (`HANDOFF-hero-impostor-and-startup-weight.md`), not thinning trees.

**Open / caveats:**
- **Library gaps → filler.** ~40% of the canopy renders as `generic_tree_2` / `procedural_*` (no dedicated chassis for sweetgum, tuliptree, pear, redbud, ginkgo, coffeetree…). **Proportionally honest, visually repetitive** until the arborist library grows real chassis. See `arborist/ORIENTATION.md §2` (the join) — the live count is `GET /coverage`.
- **Roster authoring is LS-hardwired.** `syncLookRoster('lafayette-square')` is a literal constant (`generate-salon.js:1743`); `/coverage` reads LS's `park_trees.json` (`roster-coverage.js:40`). `15-derive-tree-mix.py` **bypasses** this by writing `design.json#/trees` directly — the Grove UI can't yet seed a non-LS roster. De-hardwiring is the productization arc (the instance-decoupling "producer/roster arc", `HANDOFF-blank-app-instance-decoupling.md`).
- **`bake-look` is a separate gesture** from the cartograph pour bake — run it on roster change or the atlas goes stale.
- **⭐ Perf / WEIGHT (the live frontier):** LS 5,768 + HPDM 10,352 instanced trees at real density. The cold-load audit (`?loadAudit`, `src/lib/loadAudit.js`) measured LS at **~73 MB of trees** hero-critical (`lod1` GLBs 39 MB + atlas 28 MB). The answer is NOT thinning trees (density is real) — it's the impostor foundation plus compression. ✅ **The impostor pool is transcoded as of 2026-08-29** and the pour encodes it, so the foundation now pays for itself rather than adding weight. ⛔ **The memory number is the one that matters, not the wire number:** PNG is a file format the GPU cannot read, so a page decompresses to raw RGBA on upload — which is why a pool that looked like ~70 MB was costing over a gigabyte resident. ⚠️ **Still open: the master ATLAS**, deliberately excluded because its coverage-preserving mip chain cannot survive an encoder that generates its own mips. ▶ re-derive both, never quote: `node scratch/claims-every-declared-page-ships.mjs` Render state + open weight work: `arborist/ARCHITECTURE.md §"Tree-render reality at LS"`.
- **Private-yard nuance:** the canopy fill *does* now populate yards (NLCD sees them). Density is uniform-by-canopy, not lot-aware — a future refinement could bias street trees vs yard trees.
