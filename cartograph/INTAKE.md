# Intake — where our data comes from, and what we do to it

**The pipeline's first stage: external sources → a cleaned local frame.** This is the SSOT for *data provenance* — every source we pull, how we fetch it, what we transform it into, and (the load-bearing part) **which layer is authoritative vs. which is OSM-default.** Written because "how do we troubleshoot if we don't even know where the data comes from?" (Jacob, 2026-06-13) — provenance you can't see is provenance you can't debug.

> **Status: v0.1 (2026-06-13) — new.** Grounded in `scripts/`, `cartograph/fetch-msbf.js`, `config.py`, and the `data/lafayette-square/{raw,clean}` artifacts. Some source attributions are marked **⚠️ confirm**. The developer-reference home for the **intake** pipeline stage (`PIPELINE §intake`); FEATURES carries the one-line pitch.

---

## 0. What intake is

The neighborhood frame is **assembled from many open + measured sources**, not one. Intake fetches each, normalizes to the local metric frame (`config.py`: `CENTER 38.6160,-90.2161`; `x = (lon−CENTER_LON)·86774`, `z = (CENTER_LAT−lat)·111000`), and lands raw + merged artifacts that `skeleton.js` and `derive.js` consume. The neighborhood **extent is a center + radius** (`neighborhood_boundary.json`), **not a bounding box** — `config.py`'s `BBOX` is a legacy fetch convenience; clipping is to the radius/boundary. *"Lean on the industry/cartographer's data as the primary source — before getting creative"* (Jacob, 2026-06-13) is the governing doctrine: prefer authoritative data; invent geometry only where the sources genuinely have nothing.

---

## 1. The sources

| Source | Gives us | Fetch | Artifact | License |
|---|---|---|---|---|
| **OpenStreetMap** (Overpass) | **street centerlines (geometry)**, buildings, POIs, ground-plane features, park paths/water, street lamps | `scripts/02-fetch-osm.py` · `16-fetch-osm-ground.py` · `13/14-*` | `raw/osm.json`, `raw/osm_*.json` | ODbL |
| **Microsoft Global ML Building Footprints** | ML-derived building footprints (replaces OSM buildings) | `cartograph/fetch-msbf.js` (`minedbuildings.z5.web.core.windows.net`) | `raw/msbf.json` + `msbf-index.csv` | ODbL |
| **Overture Maps** (release `2026-01-21.0`) | buildings (incl. MSBF lineage) | `config.py` / merge | — | ODbL/CDLA ⚠️ confirm |
| **City of St. Louis Open Data** (ArcGIS Assessor) | **official parcels + assessor ROW** | `scripts/03-fetch-stl-parcels.py` → `maps8.stlouis-mo.gov/.../ASSESSOR/Assessor_Public_Parcels/MapServer/11` | `scripts/raw/stl_parcels.json` (2.8 MB) | public/open |
| **Mapillary** | street-level imagery (facade matching) | `scripts/10-fetch-mapillary.py` (token in `scripts/.env`) | `raw/mapillary_*.json` | CC-BY-SA |
| **USGS 3DEP LiDAR** | **building heights** (max_Z − ground_Z) **+** ground **terrain** DEM | `scripts/_archive/fetch-lidar-heights.py` (heights) · `bake-terrain.js` (GeoTIFF) | heights → `buildings.json` `size[1]`; DEM → `terrain.{json,bin}` | public (USGS) |
| **`survey.json`** (operator, 2026-04-11) | **custom street WIDTHS** — `pavementHalfWidth` (centerline→sidewalk-centerline), `rowWidth`, `lanes`, `type` | hand-built from *"OSM sidewalk distances + assessor ROW fallback"* | `raw/survey.json` | ours |
| **Park trees / NPS / Wikimedia** | tree inventory, building enrichment + facade imagery, historic narrative | `12-process-park-trees.py` · `enrich-*.mjs` · `download-wikimedia.*` | `raw/lafayette_park_trees.json`, `inventory/*` | mixed |

---

## 2. ⭐ The distinction that matters for troubleshooting — GEOMETRY vs. ATTRIBUTES

A defect in the *shape* of the map and a defect in the *width/class* of a street come from **different sources**. Know which before you debug.

- **Centerline GEOMETRY (the shapes / the points the whole frame is built from) = OSM** (411 of 446 chains) **+ 35 hand-`curated`** fixes (`centerlines.json` `source` field). **This is NOT an authoritative survey** — it is OSM's digitization, jags and all. *The West-18th "jagged arc" we round in the skeleton is an OSM-digitization artifact, not a width problem.*
- **WIDTHS / cross-section = `survey.json` (custom, authoritative), then OSM `lanes`, then NACTO** — applied at `derive.js`. This is measured; trust it.
- **Land-use / parcels / ROW = City of St. Louis assessor** (authoritative).

**So: we have custom *widths*, but OSM *geometry*.** The authoritative-geometry gap is real (§5).

---

## 3. What we do to it — the processing chain

```
scripts/0X-fetch-*  →  scripts/raw/  →  11-merge-all.py  →  src/data + cartograph/data/<id>/{raw,clean}
                                                              │
   OSM streets ─▶ skeleton.js (weld · longitudinal-weld · repair-pairs · makeStreet ·
                  junction-protected RDP · NACTO seed · corner-round) ─▶ clean/skeleton.json
                                                              │
                  pipeline.js ─▶ clean/map.json     promote-ribbons.js ─▶ src/data/ribbons.json
                  derive.js ─▶ clean/{block,park,island,parking,fragment,unknown}.json (land-use faces)
                                                              │
                  bake (bake-ground/buildings/…) ─▶ public/baked/<id>/*
```

- `centerlines.json` is the OSM-streets intermediate (411 OSM + 35 curated) the skeleton consumes.
- The `clean/` land-use files (`block/park/island/parking/…`) are OSM-ground + parcels, classified for colour.

---

## 4. The sourcing doctrine (in code)

**Width-sourcing priority — custom → OSM → standards** (`skeleton.js:976`, `seedSection`):
1. **custom** — `survey.json` measured widths (61/68 LS streets).
2. **OSM** — `lanes` / `width` tags (much *present-and-discarded* — `OSM-FORENSICS.md` "stop dropping it").
3. **NACTO-by-class** — pedestrian-scale defaults (`seedSection`). ⛔ **AASHTO truck radii deliberately deferred** (`skeleton.js:816`): *"pedestrian-scale radii are honest to LS."* LS is a dense residential neighborhood, not a highway — NACTO (free, urban) was chosen over AASHTO (truck-scale) **on purpose.** Buying AASHTO is unlikely to be the unlock; the geometry gap (§5) is.

---

## 5. ⭐ The authoritative-geometry gap — what we could lean on (free)

We use **OSM for street geometry** when **St. Louis publishes official street centerlines** (confirmed 2026-06-13):
- **City ArcGIS `STREETS` folder** (`maps8.stlouis-mo.gov`, the *same server we already hit for parcels*) — but it holds only *operational* layers (snow routes, sweeping, `Street_Volumes`, permitting), **no clean centerline geometry.**
- **Regional "Street Centerlines (with address ranges)"** — StLCoGIS / Regional Data Exchange (`data-stlcogis.opendata.arcgis.com` · `rdx.stldata.org` · ArcGIS Hub `7bdfd2d…`). **This is the authoritative centerline geometry**, downloadable (GeoJSON/shapefile/API), free.

### 5.1 PROBED 2026-06-13 — and it is NOT the unlock

Fetched the County `StreetsCenterlines/MapServer` (`maps.stlouisco.com` — covers the City; same ArcGIS pattern as our parcels) over the LS extent and inspected fields + geometry:

- **Geometry is COARSER than OSM, not finer.** It's an addressing layer — HICKORY returns as **15 block-segments of 2 vertices each** (straight chords between intersections, no curve points). On a curved street like West 18th that is *worse* than OSM; it would **increase** the geometry bugs, not reduce them. ✗
- **The attributes we wanted aren't there.** Fields: `STRNAME`/`ONEWAY`/`SPEED`/address-ranges (`LEFTADD1…`)/`HWYCLASS`/ramp-links (`RAMPFROM/TO`). **NO lanes, NO divided/median, NO width/ROW** — and `HWYCLASS` is **null on residential streets** (Hickory). ✗ nothing for divided-roads, nothing OSM doesn't already give.

**Conclusion (proven, not inferred): no authoritative external street source closes our gaps.** OSM geometry + the operator's corrections is the best available; the 35 bugs and the SHAPE tasks are **skeleton-interpretation** problems, not data-acquisition ones. This **closes the "get more geometry data" thread** — the lever is `SKELETON.md`, per the kit invariant (§6.1). *(The buildings stack is the counter-example where stacking DID win — five complementary sources; streets have only competing geometry, and OSM's is the best of them.)*

---

## 6. The input audit — are we using everything to maximum effect? (2026-06-13)

A pass over every input — what it *carries* vs. what we *consume*. **(Corrected 2026-06-13 after a proper read — the pull-through is more thorough than a first grep suggested: building HEIGHTS are LiDAR-derived, not defaulted.)**

**Used to high effect.** **Buildings** are richly synthesized — MSBF/OSM footprints **+ USGS 3DEP LiDAR heights** (`_archive/fetch-lidar-heights.py` → `size[1]`) **+** STL parcel metadata (`year_built`/`zoning`/`building_sqft`/`historic_district`) **+** **Mapillary** facade matching (→ `wall_material`/`roof_material`) in one record. Parcels also drive land-use + ROW; `survey.json` drives widths; OSM `highway` class gates divided-detection; 3DEP also bakes the terrain. **The metadata/building side is well-used — not a gap.**

**The gaps — all on the SHAPE/geometry side** (where the remaining visible tasks live):

1. **Street *geometry* — the one real gap, and it is NOT closeable by external data.** The centerline *shape* is OSM-digitized + the 35 hand-fixes (§6.1). The regional Street Centerlines GIS was **probed (§5.1) and rejected** — coarser geometry, no divided/lanes/ROW. So this is a **skeleton-interpretation** problem (`SKELETON.md`), not a data-acquisition one.
2. **Divided-road *geometry* leans on inference** — detection is class-gated (good), but median/carriageway *geometry* isn't from data.
3. **Minor enrichment left on the table** (opportunities, not gaps): OSM `architect`/`heritage`/`start_date` extracted but not propagated to `buildings.json`; parcel building-counts + fine-grained historic flags simplified to booleans; Mapillary timestamps unused; the stories *count* (not the height) falls back to `building:levels`→`/3.5` where parcels lack it.
4. **Cleanup, not gaps:** `elevation.js` (EPQS point-query) is superseded by the GeoTIFF bake; `enrich-*.mjs` / `match-facades.py` invocation is unclear — confirm or archive. No curb/pavement-edge dataset exists locally (osm2streets notes the same) — not pursuable.

### ⭐ 6.1 The 35 curated centerlines are 35 BUGS — the kit invariant

`centerlines.json` carries **35 `source:'curated'`** chains — streets where the automated pipeline produced wrong geometry and a human hand-drew the correction. They are **not random**: they are the **problem streets**, mapping almost 1:1 to the remaining visible tasks —
- **loops + cul-de-sacs** — Benton · Waverly · Mackay · Vail · Albion · Whittemore · Nicholson · Simpson · Preston · Kennett Place (the LS "Places")
- **weird junctions** — Dolman · South 18th · Hickory · Carroll · Kennett
- **divided / perimeter** — Truman Pkwy · Lafayette · Park · Mississippi · Chouteau · S. Jefferson

> ⛔ **THE KIT INVARIANT (Jacob, 2026-06-13): the SHAPE layer must be 100% automated from fetchable sources. Hand-authoring SHAPE is a literal *bug*, not a fix.** Cartograph is a **kit** — it onboards *any* neighborhood — and a human drawing a centerline doesn't scale, so each curated chain is a place the pipeline **failed**: a logged **defect**. So `# curated streets` is a **defect count**, and the target is **0 by construction**, never by effort. The boundary: **SHAPE/data = automated** (geometry, widths, class, land-use, heights — the bug surface) vs. **LOOK/Stage = authored** (materials, sky, neon, camera — the *creative product*, not a bug). Fortification (a width/cap/corner-R nudge) must **default to automated**; if a neighborhood *requires* the nudge to be correct, that's still a bug. (`SKELETON.md §6`.)

The two levers that take the defect count to 0: **stack every free authoritative source** (§5) + a **more sophisticated skeleton** interpretation. That *is* the remaining SHAPE campaign — and equals `Survey shows the perfected map straight from the skeleton` (`README §⭐ START HERE`).

### 6.2 The per-override worklist — the defect ledger as a finite checklist

`§6.1` is the *class-level* ledger; this is the **per-override worklist** — the bounded to-do that converts "make the map perfect" into a finite list. **"Close" = the automated pipeline produces the geometry → DELETE the curated chain → verify on the eye.** It is NOT "re-solve from scratch": where a mechanism has landed, closing is *verify + retire*.

> ⚠️ **Statuses below are FIRST-PASS and need a per-override forensic** (inspect each curated chain: what OSM shape it replaces · is the pipeline now able to produce it · which skeleton rule owns it). That forensic IS the live "where are we" map; until it runs, treat a row's status as a hypothesis, not a fact. **The EYE retires an override, never a metric** (`feedback_proxy_render_is_not_the_operator_eye`).

| Class | Chains (curated) | Landed mechanism (this arc) | Status hypothesis | Automation target (to retire the override) |
|---|---|---|---|---|
| **Loops / medians** | Benton · Waverly · Mackay | endpoint-weld (`e8cc310`) + median body (`ed250b3`) | ⚠️ render LANDED — likely **verify+retire-able** | skeleton emits the closed loop body; the curated hand-drawn body becomes unnecessary |
| **Cul-de-sacs** | Vail · Albion · Whittemore · Nicholson · Simpson · Preston · Kennett Pl | dead-ends woven (`dd4ddb6`); caps render | ⚠️ render LANDED — **verify**. ⛔ **Cap is NOT data-derivable for us (2026-06-15):** `osm.json` is WAYS-ONLY (no node tags ingested) + OSM `turning_circle`/`turning_loop` tagging is sparse → the cap selector STAYS a real authoring control. (Degree-based default `dStart===1 → round` is the auto-default; round/blunt/sidewalk is operator intent.) | auto-cap ONLY after OSM **node-tag ingestion** lands AND the tags prove reliable; until then keep the selector |
| **Name-transition / weird junctions** | Dolman · South 18th · Hickory · Carroll · Kennett | through-road RDP (`c4cb191`) fixes the *kink* | **PARTIAL** — kink fixed; ped-band junction + curve-render still OPEN | `HANDOFF-vector-curve-construction.md` (curve render) + junction construction; then retire |
| **Divided / perimeter** | Truman · Lafayette · Park · Mississippi · Chouteau · S. Jefferson | park-perimeter datum repair (`c49a4e6`/`8452c31`) for some | **PARTIAL** — datum-step class addressed; divided-median geometry still inferred | constructed-median geometry from data, not inference (`§6.3`); then retire |

**Reading it:** the *render/construction* mechanisms for loops + dead-ends have largely landed — those rows are the **first candidates to verify and retire** (the quickest path to lowering the count). The junction + divided rows are the genuinely-open campaign. **Nothing here is a re-solve; it is an accounting of done-vs-open.**

## Cross-references
- `SKELETON.md` — the frame built from this intake (`seedSection`, the RDP + corner-round, width-sourcing).
- `PIPELINE.md §intake` — the stage in the execution spine (this is its deep doc).
- `OSM-FORENSICS.md` — "OSM or us" (the frame was strictly poorer than raw OSM until we stopped dropping tags) + "stop dropping it."
- `OSM2STREETS-GROUNDING.md` — the reference algorithm to ground in (don't reinvent).
- `FEATURES.md` — the user/investor pitch line (*grounded in authoritative municipal + survey data, not guessed*) — **to add.**
- Code: `scripts/` (the fetch pipeline) · `cartograph/fetch-msbf.js` · `config.py` · `skeleton.js` · `derive.js`.
