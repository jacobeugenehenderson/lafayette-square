# Intake — where our data comes from, and what we do to it

**The pipeline's first stage: external sources → a cleaned local frame.** This is the SSOT for *data provenance* — every source we pull, how we fetch it, what we transform it into, and (the load-bearing part) **which layer is authoritative vs. which is OSM-default.** Written because "how do we troubleshoot if we don't even know where the data comes from?" (Jacob, 2026-06-13) — provenance you can't see is provenance you can't debug.

> **Status: v0.4 (2026-07-20) — intake is a UI, and boundary authoring is the INCLUSION POLYGON.** The **Extent tool** (`src/cartograph/ExtentApp.jsx`) is the realized front-end of this stage (§0.5) — intake is no longer "hand-edit two JSON files + CLI," and the boundary is an **inclusion polygon** — membership = `((polygon − exclusions) ∪ activate) − hide`; the disc RENDERS. *(v0.3 said the circle IS the boundary and the excluder was settled; retracted §0.5.)* Grounded in `scripts/`, `cartograph/fetch-msbf.js`, `config.py`, `serve.js`, and the `data/lafayette-square/{raw,clean}` artifacts. Some source attributions are marked **⚠️ confirm**. The developer-reference home for the **intake** pipeline stage (`PIPELINE §intake`); FEATURES carries the one-line pitch.

---

## 0. What intake is

The neighborhood frame is **assembled from many open + measured sources**, not one. Intake fetches each, normalizes to the local metric frame (`config.py`: `CENTER 38.6160,-90.2161`; `x = (lon−CENTER_LON)·86774`, `z = (CENTER_LAT−lat)·111000`), and lands raw + merged artifacts that `skeleton.js` and `derive.js` consume. The neighborhood **extent is a center + radius** (`neighborhood_boundary.json`), **not a bounding box** — `config.py`'s `BBOX` is a legacy fetch convenience; clipping is to the radius/boundary. *"Lean on the industry/cartographer's data as the primary source — before getting creative"* (Jacob, 2026-06-13) is the governing doctrine: prefer authoritative data; invent geometry only where the sources genuinely have nothing.

---

## 0.5 ⭐ The Extent tool — the INCLUSION POLYGON (LANDED 2026-07-14; boundary model corrected 2026-07-20)

> ⭐ **Design of record for this subsystem: [`EXTENT-DESIGN.md`](../EXTENT-DESIGN.md)** (ratified 2026-07-22) — what the Extent tool actually *makes* (the served skeleton = a labeled point cloud + node stamps), the hood<disc<bb size model, the two centers, the seal-as-identity-registry, and the ordered v1 worklist. `EXTENT-EXCAVATION.md` is its evidence layer. **This §0.5 is the as-built flow;** read EXTENT-DESIGN before changing the model.

**Intake used to be "hand-edit `geography.json` + `neighborhood_boundary.json`, then run the CLI." It is now a screen: the `◎ Extent` tool (`src/cartograph/ExtentApp.jsx`).** It is the intake/step-0 destination — the operator-driven onboarding of a *new* place, front-to-back, with no JSON hand-editing and no CLI. This IS the "intake — onboard a place" stage `PIPELINE.md` had marked deferred; it is no longer deferred.

**Nav:** `◎ Extent` button in `Toolbar.jsx` → `setShot('extent')` → `CartographApp` early-returns `<ExtentApp/>`. Fresh arrival = **no map** (nothing fetched yet); every overlay is gated on `located` — a blank global aerial until the operator locates.

### The flow (ZIP → Locate → frame → Fetch → exclude strays → Bake)
1. **ZIP → Locate** — `geocodeZip` (Zippopotam, keyless, client-side) **pans the camera** to the area on the global aerial. **No fetch, no frame change** — just navigation. (Search is the data bootstrap only; it never authors geometry.)
2. **Frame the neighborhood** on the global aerial (viewport-driven tiles, adaptive zoom `viewportTileZ` clamped 12–19). The operator composes the extent by eye.
3. **Fetch this view** (Phalanges) — read the ortho camera viewport → bbox via `localToWgs84` → `fetchExtent` → fetch OSM + buildings + skeleton over the framed bbox. **Frame-then-fetch:** *"if you can see it on screen, it's in the list."*
4. **The BOUNDARY — say what the neighborhood IS.** Three ways in, all producing one inclusion polygon (lon/lat, frame-independent): **(a)** a named place whose gazetteer entry carries a boundary seeds it free — the search keeps Nominatim's `official` ring (accepts `boundary=*` AND `place=neighbourhood|suburb|quarter|…`, since US neighborhoods are tagged the latter; ⛔ never any polygon — "DeMun" falls through to `leisure=park` "DeMun Park"); **(b)** click the boundary streets on the aerial in any order — the ring is rebuilt from the junctions they SHARE, and a street that doesn't meet two others is reported as a named gap (`computeBoundaryFromSelection`); **(c)** draw it. A gazetteer ring is a *starting hint*, not the boundary: they range from Lafayette Square's coarse 26-point contributor outline to Księży Młyn's 815-point cadastral trace that jogs around individual buildings — resolving onto street centerlines normalises both, and is what makes "a neighborhood doesn't cut a block in half" true by construction.
5. **The circle is what RENDERS — and *only* that.** An auto-fit **circle** (radius auto-fit to the kept set, adjustable via an in-scene draggable handle) is the **slab disc**: the ground plane, the world's horizon, the soft rim fade. It **hides** what falls outside it, but it does **not** decide membership — step 4's polygon does. ⛔ *This step previously read "the circle is both the neighborhood extent AND the slab disc; every building inside it is IN by default — no perimeter to trace" — the retracted excluder model (see the banner below).* ⚠️ Sizes nest **hood < disc < bb**, on **two independent centers**: the bb/frame origin is frozen at the pour and may grow or destructively shrink but **never move**; the disc centroid is a separate, freely-draggable value (`EXTENT-DESIGN §3.3`).
6. **Draw exclusion loops** *(correction, not the mechanism)* — the **bezier pen** (`BezierPen.jsx`, toggle "✎ Draw exclusions"): the operator loops the strays to carve them OUT (a commercial strip, the far side of an arterial, forest/mountain past the real edge). Membership = **`((polygon − exclusions) ∪ activate) − hide`** (2026-07-20); with no polygon it falls back to the circle, so every hood poured under the excluder model is byte-identical. Loops are fully editable (move/insert/delete anchors, corner↔smooth handles) and **persist as the first-class artifact** — `exclusions: [{closed, anchors:[{lon,lat,type,handleIn?,handleOut?}]}]` (lon/lat, frame-independent) in `neighborhood.json`, reloaded editable across sessions ("keep fixing forever"). `Space` suspends the pen for panning.
7. **Per-building override** — Jacob's *"Honorary Hood Residents"*: buildings that give the place its character by proximity (Galeria Łódzka carries 22 listings on one `activate`) — click a footprint to force one building IN/OUT for the idiosyncratic margin (`{activate, hide}` → `building-overrides.json`, §5.2). The second layer of forever-fixing.
8. **Bake** (`onBuild` → the single button) folds **Commit + Pour**: `commitExtent` (`POST /:scene/commit-extent`) ⛔ **does NOT re-center and does NOT run `reproject-raw`** — the frame origin is FROZEN at the fetch center and the hood center is stored **off-origin on the disc** as `discCenter` (`EXTENT-DESIGN §3.3`; in-code: *"NEVER MOVE THE FRAME ORIGIN … no reproject, ever"*). It updates `geo.timezone` from the hood location, then runs `skeleton.js` → writes `neighborhood_boundary.json` (the circle + flattened `exclusions`) + `neighborhood.json` (name/blurb/radius/timezone/exclusions/`committed:true`); then pour (`pipeline.js` clipped to circle − exclusions → promote-ribbons → Look → bake → Designer). A committed hood's Bake takes the light **rescope** path (radius/exclusion re-apply, no re-center). The whole intake→3D arc is ONE tool.

**Draft auto-save** is implicit: debounced 500 ms `saveNeighborhood` → `neighborhood.json` (name/blurb/radius/exclusions), restored on scene open. **Implicit auto-save for cheap edits, explicit Bake for the heavy re-pour.**

**⭐ RETRACTED 2026-07-20 — the inclusion polygon is the mechanism; the excluder is the correction.** This section previously read *"Why the excluder, not a traced boundary (settled 2026-07-14, do not re-open)"* and listed name-the-boundary-streets and draw-an-inclusion-polygon among dead models. **That was wrong, and it was load-bearing wrong** — two agent passes obeyed it and reached the wrong conclusion, because the routing gate sent them here. Jacob: *"I **settled** for the circle because we couldn't get this right… the polygon isn't gone; that's the sore spot."* Membership is now **`((polygon − exclusions) ∪ activate) − hide`** — the disc drops out of the predicate entirely and goes back to its one job, rendering. `pipeline.js:246-255` already implemented exactly this; what was missing was any way to AUTHOR or PERSIST a polygon, and two server paths that destroyed one if it appeared. The excluder pen is kept, demoted to correction. *(The street-selection machinery — `ExtentClickableStreets`, `computeBoundaryFromSelection`, the `sides` field — was flagged for excision as dead weight; it is NOT dead, it is the mechanism, and it is now mounted. `computeExtentCorners` + `/extent-corners` + `fetchExtentCorners` — the brittle order-dependent 4-cardinal-slot resolver — were EXCISED 2026-07-20, superseded by the order-independent shared-junction one.)*

### ⭐ Frame-then-fetch, and `geography.json` is written centered on the framed bbox
The load-bearing model: **the operator frames on the *global* aerial first, then fetches only what's framed.** `fetchExtent` writes `geography.json` centered on the framed bbox (`writeGeographyFromBbox` in `serve.js`), so the local metric frame is derived from the operator's composition rather than a hard-coded `config.py CENTER`. ⛔ **On Commit the frame does NOT move** (changed 2026-07-23, `EXTENT-DESIGN §3.3`): the origin stays the frozen fetch center and the hood centre is written **off-origin** as the disc's `discCenter`, so **`reproject-raw.js` never runs on the commit path**. Only the timezone is re-derived from the hood location (`tzLookup`), and `skeleton.js` re-bakes in the frozen frame. The extent is a **center + radius circle**, not a bbox (§0) — the bbox is only the fetch/frame convenience. ⚠️ **`neighborhood_boundary.json`'s center is therefore NOT `[0,0]` post-commit** on an off-centre hood; a correctly-isolated hood sits off-centre in its envelope by design (LS reads `center: [-15,-15]`). *(This paragraph described the commit as a destructive frame move and made the reprojection gate below read as a live requirement on every commit. Corrected 2026-08-04 against `serve.js`'s commit-extent handler.)* **The reprojection gate still applies to the one path that DOES reproject — `/rollback-extent`** — and to any change of `geography.json`: verify parcel↔building frame alignment (a street's parcels and its skeleton geometry should overlap, not sit hundreds of m apart — the twin msbf/parcel reprojection bugs that once left buildings ~557 m and parcels ~800 m behind; full history in `NOTES.md`).

**⛔ The re-center guard was REMOVED 2026-07-23 — do not count it as a live protection.** It existed to refuse a committed hood whose `center` moved >5 m (409 `recenter-blocked`); under the never-move model there is **no frame move to guard**, so the guard was deleted and `allowRecenter` is now an unused destructured field kept for payload compatibility. `recenter-blocked` occurs **nowhere in the tree**. *(Three docs gave three thresholds — this one said >5 m, `EXTENT-EXCAVATION §A2` said >100 m, and the code re-centers not at all. Corrected 2026-08-04; anyone auditing the destruction surface was counting a guard that isn't there.)* The real protections are the frozen origin itself and the `.prebak` snapshots a failed commit rolls back through (`/rollback-extent` — which **does** still re-run `reproject-raw` + `skeleton`).

**Installation-agnostic (kit):** no St. Louis defaults in the flow — ZIP-driven geocode, OSM everywhere, timezone from center. **hipointe-demun** and **altadena** were both onboarded, poured and baked this way. ⭐ **Altadena is the first truly *end-to-end* intake→pour product** — LS and HPDM predate the intake regime and carry bolt-on protections (source hardwires, legacy-inclusion-polygon drops); a hood poured fresh through the intake regime needs none of those convolutions. ⚠️ **Frame tighter than feels natural** — an early wide (~5.4 km) test fetch produced large artifacts; a real ~3 km hood is ~10× smaller.

---

## 1. The sources

| Source | Gives us | Fetch | Artifact | License |
|---|---|---|---|---|
| **OpenStreetMap** (Overpass) | **street centerlines (geometry)**, buildings, POIs, ground-plane features, park paths/water, street lamps | `scripts/02-fetch-osm.py` · `16-fetch-osm-ground.py` · `13/14-*` | `raw/osm.json`, `raw/osm_*.json` | ODbL |
| **Microsoft Global ML Building Footprints** | ML-derived building footprints (replaces OSM buildings) | `cartograph/fetch-msbf.js` (`minedbuildings.z5.web.core.windows.net`) | `raw/msbf.json` + `msbf-index.csv` | ODbL |
| **Overture Maps** (release `2026-01-21.0`) | buildings (incl. MSBF lineage) | `config.py` / merge | — | ODbL/CDLA ⚠️ confirm |
| **City of St. Louis Open Data** (ArcGIS Assessor) | **official parcels + assessor ROW** | `scripts/03-fetch-stl-parcels.py` → `maps8.stlouis-mo.gov/.../ASSESSOR/Assessor_Public_Parcels/MapServer/11` | `cartograph/data/<scene>/raw/stl_parcels.json` (scene-homed; `derive.js` + `bake-content` read here — LS's copy moved out of the legacy `scripts/raw/` dump 2026-07-13, the last input still pinned there) | public/open |
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

### ⭐ 6.1 Curated centerlines — automation-debt vs. idiosyncratic authoring

`centerlines.json` carries **35 `source:'curated'`** chains — streets where the operator hand-drew the geometry. They are **not random**: they are the **problem streets**, mapping almost 1:1 to the remaining visible tasks —
- **loops + cul-de-sacs** — Benton · Waverly · Mackay · Vail · Albion · Whittemore · Nicholson · Simpson · Preston · Kennett Place (the LS "Places")
- **weird junctions** — Dolman · South 18th · Hickory · Carroll · Kennett
- **divided / perimeter** — Truman Pkwy · Lafayette · Park · Mississippi · Chouteau · S. Jefferson

> ⭐ **Curated shape splits two ways (revised 2026-07-02 — `NEIGHBORHOOD-INPUTS.md §0.0/§1.1`).** Everything the kit produces is a best guess, and everything is overridable — so a curated centerline is **not automatically a bug.** It is either **automation-debt** (the pipeline *could* derive it — keep improving the skeleton until the override is unnecessary) or **idiosyncratic authoring** (a feature no fetchable source holds — LS's private "Places", a contested edge — *kept*, first-class, never a defect). The metric is no longer "curated → 0"; it is *triage debt from idiosyncrasy — automate the first, embrace the second.* The pipeline should keep widening what it resolves on its own, but the SHAPE/LOOK split is **not** a bug-vs-authored wall. *(Prior doctrine here called all curated chains defects-to-zero; retired — git holds the verbatim.)*

The two levers that shrink the *automation-debt* share (never the idiosyncratic): **stack every free authoritative source** (§5) + a **more sophisticated skeleton** interpretation. That *is* the remaining SHAPE campaign — and approaches `Survey shows the perfected map straight from the skeleton` (`README §⭐ START HERE`).

### 6.2 The per-override worklist — triage as a finite checklist

`§6.1` is the *class-level* ledger; this is the **per-override worklist** — the bounded triage of the curated chains. For an **automation-debt** chain, *"close" = the pipeline produces the geometry → DELETE the override → verify on the eye*; an **idiosyncratic** chain is *kept*, not closed (§6.1). It is NOT "re-solve from scratch": where a mechanism has landed, closing is *verify + retire*.

> ⚠️ **Statuses below are FIRST-PASS and need a per-override forensic** (inspect each curated chain: what OSM shape it replaces · is the pipeline now able to produce it · which skeleton rule owns it). That forensic IS the live "where are we" map; until it runs, treat a row's status as a hypothesis, not a fact. **The EYE retires an override, never a metric** (`feedback_proxy_render_is_not_the_operator_eye`).

| Class | Chains (curated) | Landed mechanism (this arc) | Status hypothesis | Automation target (to retire the override) |
|---|---|---|---|---|
| **Loops / medians** | Benton · Waverly · Mackay | endpoint-weld (`e8cc310`) + median body (`ed250b3`) | ⚠️ render LANDED — likely **verify+retire-able** | skeleton emits the closed loop body; the curated hand-drawn body becomes unnecessary |
| **Cul-de-sacs** | Vail · Albion · Whittemore · Nicholson · Simpson · Preston · Kennett Pl | dead-ends woven (`dd4ddb6`); caps render | ⚠️ render LANDED — **verify**. ⛔⛔ **"THE TAGGING IS SPARSE" WAS NEVER MEASURED, AND IT IS FALSE — corrected 2026-08-06.** OSM carries **20 `turning_circle` nodes** in the LS bbox, and **13 of the 17 we can place land 0.0 m — exact vertex coincidence — on a skeleton degree-1 tip** (`waverly-place-1`, `rutger-street-0/2`, `albion-place`, `whittemore-place`, `hickory-street-1`, `st-vincent-court-1`, `carroll-street-1`, `caroline-street-0`, `henrietta-street-0`, …). ⭐ **The half that IS true is ours: `fetch.js` requests `node["highway"]`, then `ingestElements` reduces every node to `[lon, lat]` and drops `el.tags` — so we fetch the tag and throw it away.** `turning_circle` appears nowhere in the codebase. ⛔ **So "not data-derivable" describes our INGEST, not the data**, and it contradicted Jacob's ruling two days earlier (`POLYGON-FIRST §5`, 2026-06-13: the cap IS data-derivable, the chooser is a STOPGAP, the curations are data-defects to automate). Re-run: `node scratch/claims-cap-vs-skeleton.mjs`. | **Ingest the node tags** (`turning_circle`/`turning_loop`) and derive the cap DEFAULT from them. ⭐ **The selector still stays** — Jacob, 2026-08-06: asymmetric editing + sidewalk/treelawn swapping are *"a logical end-state of the tool"*, not needed for LS but intended. **It is the DEFAULT that must come from data, not 40 hand-stamps.** ⭐⭐ **AND IT IS NOW ALSO THE ARBITER FOR "SEVERED vs FRAGMENTED", PROVEN AGAINST THE OPERATOR (2026-08-11):** `carroll-street-1`, `caroline-street-0` and `henrietta-street-0` each carry a turning circle **and each is flagged by the same-name fragment test as a possible false dead end** — the tag calls all three REAL, which is exactly how Jacob ruled Carroll. ⛔ **A same-name test cannot separate a severed street from a fragmented one; this tag can.** → `ROADMAP A09`, `OSM-FORENSICS §1.3` ⑤. |
| **Name-transition / weird junctions** | Dolman · South 18th · Hickory · Carroll · Kennett | through-road RDP (`c4cb191`) fixes the *kink* | **PARTIAL** — kink fixed; ped-band junction + curve-render still OPEN | `HANDOFF-curve-primitive-skeleton.md` (curve render) + junction construction; then retire |
| **Divided / perimeter** | Truman · Lafayette · Park · Mississippi · Chouteau · S. Jefferson | park-perimeter datum repair (`c49a4e6`/`8452c31`) for some | **PARTIAL** — datum-step class addressed; divided-median geometry still inferred | constructed-median geometry from data, not inference (`§6.3`); then retire |

**Reading it:** the *render/construction* mechanisms for loops + dead-ends have largely landed — those rows are the **first candidates to verify and retire** (the quickest path to lowering the count). The junction + divided rows are the genuinely-open campaign. **Nothing here is a re-solve; it is an accounting of done-vs-open.**

## Cross-references
- `SKELETON.md` — the frame built from this intake (`seedSection`, the RDP + corner-round, width-sourcing).
- `PIPELINE.md §intake` — the stage in the execution spine (this is its deep doc).
- `OSM-FORENSICS.md` — "OSM or us" (the frame was strictly poorer than raw OSM until we stopped dropping tags) + "stop dropping it."
- `OSM2STREETS-GROUNDING.md` — the reference algorithm to ground in (don't reinvent).
- `FEATURES.md` — the user/investor pitch line (*grounded in authoritative municipal + survey data, not guessed*) — **to add.**
- Code: `scripts/` (the fetch pipeline) · `cartograph/fetch-msbf.js` · `config.py` · `skeleton.js` · `derive.js`.
