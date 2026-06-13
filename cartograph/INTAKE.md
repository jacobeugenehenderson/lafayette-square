# Intake — where our data comes from, and what we do to it

**The pipeline's first stage: external sources → a cleaned local frame.** This is the SSOT for *data provenance* — every source we pull, how we fetch it, what we transform it into, and (the load-bearing part) **which layer is authoritative vs. which is OSM-default.** Written because "how do we troubleshoot if we don't even know where the data comes from?" (Jacob, 2026-06-13) — provenance you can't see is provenance you can't debug.

> **Status: v0.1 (2026-06-13) — new.** Grounded in `scripts/`, `cartograph/fetch-msbf.js`, `config.py`, and the `data/lafayette-square/{raw,clean}` artifacts. Some source attributions are marked **⚠️ confirm**. The developer-reference home for the **intake** pipeline stage (`PIPELINE §intake`); FEATURES carries the one-line pitch.

---

## 0. What intake is

The neighborhood frame is **assembled from many open + measured sources**, not one. Intake fetches each, normalizes to the local metric frame (`config.py`: `CENTER 38.6160,-90.2161`; `x = (lon−CENTER_LON)·86774`, `z = (CENTER_LAT−lat)·111000`), and lands raw + merged artifacts that `skeleton.js` and `derive.js` consume. *"Lean on the industry/cartographer's data as the primary source — before getting creative"* (Jacob, 2026-06-13) is the governing doctrine: prefer authoritative data; invent geometry only where the sources genuinely have nothing.

---

## 1. The sources

| Source | Gives us | Fetch | Artifact | License |
|---|---|---|---|---|
| **OpenStreetMap** (Overpass) | **street centerlines (geometry)**, buildings, POIs, ground-plane features, park paths/water, street lamps | `scripts/02-fetch-osm.py` · `16-fetch-osm-ground.py` · `13/14-*` | `raw/osm.json`, `raw/osm_*.json` | ODbL |
| **Microsoft Global ML Building Footprints** | ML-derived building footprints (replaces OSM buildings) | `cartograph/fetch-msbf.js` (`minedbuildings.z5.web.core.windows.net`) | `raw/msbf.json` + `msbf-index.csv` | ODbL |
| **Overture Maps** (release `2026-01-21.0`) | buildings (incl. MSBF lineage) | `config.py` / merge | — | ODbL/CDLA ⚠️ confirm |
| **City of St. Louis Open Data** (ArcGIS Assessor) | **official parcels + assessor ROW** | `scripts/03-fetch-stl-parcels.py` → `maps8.stlouis-mo.gov/.../ASSESSOR/Assessor_Public_Parcels/MapServer/11` | `scripts/raw/stl_parcels.json` (2.8 MB) | public/open |
| **Mapillary** | street-level imagery (facade matching) | `scripts/10-fetch-mapillary.py` (token in `scripts/.env`) | `raw/mapillary_*.json` | CC-BY-SA |
| **Elevation DEM** | per-point ground elevation grid | ⚠️ confirm (rasterio in `requirements.txt` → a raster DEM; USGS/OpenTopography likely) | `raw/elevation.json` | ⚠️ confirm |
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

**The cheap experiment before any spend:** fetch the regional centerlines for the LS bbox, overlay on OSM. If the geometry is **cleaner** → it can obviate the corner-rounding at the source. If it carries **functional class / divided / lane** attributes → it lifts the highways/frontage + divided-roads tasks directly. (`Street_Volumes` may add AADT; address ranges suggest it's geocoding-oriented, so verify attribute richness.) This is the *"industry data as primary source"* doctrine, made actionable.

---

## Cross-references
- `SKELETON.md` — the frame built from this intake (`seedSection`, the RDP + corner-round, width-sourcing).
- `PIPELINE.md §intake` — the stage in the execution spine (this is its deep doc).
- `OSM-FORENSICS.md` — "OSM or us" (the frame was strictly poorer than raw OSM until we stopped dropping tags) + "stop dropping it."
- `OSM2STREETS-GROUNDING.md` — the reference algorithm to ground in (don't reinvent).
- `FEATURES.md` — the user/investor pitch line (*grounded in authoritative municipal + survey data, not guessed*) — **to add.**
- Code: `scripts/` (the fetch pipeline) · `cartograph/fetch-msbf.js` · `config.py` · `skeleton.js` · `derive.js`.
