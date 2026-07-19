# HANDOFF — Łódź / Księży Młyn (the first non-US pour)

**State + dispatch-ready record for the Łódź arc.** Started & largely built 2026-07-18/19.
Two things at once: (1) a **goodwill gift to Jacob's estranged developer, Pawel** (who lives in Łódź) — pour his home city, hand it over; (2) because Łódź is genuinely *foreign* to Jacob, **the honest test of the kit's "any town" claim** (LS/HPDM/Altadena all quietly leaned on US data regimes). Scene slug: **`ksi-y-m-yn`** (slugify strips Polish diacritics — a finding). Look id = scene id.

> **⭐ THE HEADLINE (proven, not asserted):** *Poland's free open data was RICHER than Lafayette Square's at every turn — buildings, trees, heritage, businesses. Every rough edge was our own **US-shaped plumbing**, each one fixed at the source.*

---

## What landed (eye-confirmed) — the full stack on a foreign city

The **labels → landmarks → listings → NEON** chain is complete and confirmed:

- **Streets** — 137 chains, skeleton built; **per-scene street labels** in Polish (Przędzalniana, Tymienieckiego…).
- **Buildings** — 1,819, each a **unique `osm-<id>`** (the id-namespace fix, below).
- **Ground** — baked flat (correct for the mill flats; no USGS terrain in Poland).
- **Lamps** — 13 real Łódź OSM lamps + regenerated glow pools (replaced LS's 80 procedural).
- **Trees** — City `Drzewa_LIDAR` census (6,522 in bbox) → roster → **1,246 placed, rendering, "beautiful."**
- **Landmarks** — 8 elaborated cards (Museum of Cinematography, Herbst Palace, Scheibler Mill, 2 Grohman villas, St Anne's, famuły, Źródliska Park), cited research, joined to real building ids.
- **Restaurants** (the "bread and butter") — **Overture Places** (open/ownable) → 79 eateries joined to buildings; **5 top cards fully elaborated** (Browar Księży Młyn = hero, Cesky Film, Soplicowo, Pierogarnia Palce Lizać, Cynamonowe Love).
- **NEON** — lights the listings at dusk. Capstone, eye-confirmed.

---

## The reusable how-to (patterns discovered — good for the NEXT town)

- **Fetch headless when the operator can't eye-frame a foreign town:** `POST localhost:3333/<scene>/fetch-extent {"bbox":{minLat,maxLat,minLon,maxLon}}` (Vite proxies `/api/cartograph`→:3333). Boz supplies the bbox from research; operator eye-gates the RESULT. (The excluder-pen intake ASSUMES local knowledge — see findings.)
- **Pour flags:** `pipeline.js --skip-elevation` (the pour endpoint already passes it) + skip the separate `bake-terrain.js` (hard-exits without a USGS tif). Flat ground.
- **Per-scene street labels:** `cartograph/bake-labels.js --scene=<s> --look=<l>` → `baked/<look>/labels.json`; wired into the bake (serve.js runIfDirty 'labels'); player reads via `useStreetLabels(lookId)` hook (`src/lib/streetLabels.js`). Retired the static LS-ribbons import.
- **Tree census → grove:** `scratch/lodz-tree-census.mjs` (Drzewa_LIDAR ArcGIS → project → species from palette split by conifer/deciduous → `clean/park_trees.json` as `{meta,trees:[...]}` — NOT a bare array). Roster = `data/<scene>/tree-species-map.json` (maps census species → authored comps + fallbacks). Bake: `bake-trees.js --scene <s> --placements … --species-map … --zone-shape … --boundary …` (CLI `--scene` alone does NOT resolve the census; pass the paths explicitly — only serve.js calls treeBakeInputsForScene).
- **Real lamps:** Overpass `node["highway"="street_lamp"](bbox)` → `raw/osm_street_lamps.json` → `bake-lamps.js` → re-bake `bake-ground-ao.js` (regenerates the glow pools from the real lamps).
- **Content / restaurants:** Overture Places via `python3 -m overturemaps download --bbox=… -f geojson --type=place` (SSL fix on macOS Py3.14: `SSL_CERT_FILE=$(python3 -c 'import certifi;print(certifi.where())')`). Filter to eateries → project → point-in-OSM-footprint join to `osm-<id>` → `content/listings.json`. Hand-authored cards = `content/listings.overrides.json` (`adds[]` + `patches{}`, merged into listings.json, categories mapped to `CATEGORY_HEX` keys).
- **Installation identity:** a real installation needs `src/instances/<look>.js` + registration in `src/instance.js` INSTANCES, AND a `loadInstanceData` MANIFESTS entry (like HPDM) pointing `landmarks` at the merged `content/listings.json`. Without the instance, the player boots LS's identity wholesale (the "LS labels/lamps" leaks).

---

## ⚠️ Kit findings — the US-shaped plumbing to fix (portability backlog)

Fixed this arc: **building id-namespace** (bake-buildings/pipeline now `osm-<id>` when no msbfId — was `msbf-undefined` on every OSM building, breaking content joins/neon/selection); **street labels** (per-scene baked, not LS-static); **lamps** (per-scene OSM, not LS procedural); **installation identity** (instance + manifest).

Still open (real kit-improvement items, not Łódź-only):
1. **`fetch-msbf.js` aborts off-continent** ("No US tiles") — OSM buildings cover it, but the MSBF path is US-only.
2. **`bake-terrain.js` hard-exits without a USGS tif** — no graceful flat fallback; skipped manually. (Global DEM e.g. Copernicus would fix it; Poland has GUGiK national LiDAR too.)
3. **`slugify` strips Polish diacritics** → `ksi-y-m-yn` mangled slug (cosmetic; i18n).
4. **Land-use mis-classification** — 2,919 trees dropped on `lu:median` in an *industrial* district; `derive.js` land-use mis-labels foreign OSM as median/commercial/unknown, eating ~half the grove (and likely mis-coloring the ground). **(task #9)**
5. **Player i18n** — US/English-hardwired: needs **Polish UI + 24h + Celsius**, installation-derived (locale block already in the instance). Approach = **localisation service** (message catalogs), NOT Google-anything. **(task #4)**
6. **Runtime lamp/label hardwires** — `StreetLights.jsx`/`MapLayers.jsx`/`lampLightmap.js` still `import` LS's lamp file (deferred-to-producer cleanup).
7. **Intake UX** — the excluder pen assumes the operator knows the hood; a name-the-boundary-streets affordance (retired) is exactly the foreign-operator case.
8. **ToD 'night' missing in Stage/Preview** — `DawnTimeline` filters SunCalc astronomical-night when invalid at Łódź's latitude; anchor 'night' to solar-midnight/nadir. **(task #14)**

**Data sources that BEAT the US equivalent (open, ownable):** GUGiK national 3D buildings (LOD1 nationwide; LOD2 NOT for Łódzkie) · City `Drzewa_LIDAR` tree canopy · **rejestr zabytków / Łódź gminna ewidencja** heritage register (open data — the completist historic fields that were Tier-③ luck in the US are a Tier-② FETCH in Poland) · Overture Places · Księży Młyn is a **Pomnik Historii** (top national designation).

---

## ▶ TOMORROW (Jacob set 2026-07-19), in order

1. **Hero the Scheibler mill — IN-SCENE staging, "NOT the arch!"** Hero camera shot (`bake-scene.js` heroSubject) on the mill building `osm-155224392` + uplights + red-brick Look. NOT `design.arch`/`design.landscape` (those are horizon backdrops). GUGiK LOD2 unavailable → staging is primary; bespoke GLB only if staging doesn't carry. **(task #6)**
2. **More cards** — elaborate more of the 79 Overture eateries + landmarks. **(task #13)**
3. **Polish player** — the i18n/localisation-service arc. **(task #4)**

---

## Git / files

Trunk `curb-offset-draw`, **UNCOMMITTED** (Jacob commits when happy). New: `src/instances/ksi-y-m-yn.js`, `cartograph/bake-labels.js`, `cartograph/data/ksi-y-m-yn/**` (geography, raw/clean, content/{profile,listings,listings.overrides}.json), `scratch/lodz-tree-census.mjs`, `scratch/lodz-overture-places.geojson`, `public/baked/ksi-y-m-yn/**`, `public/baked/{lafayette-square}/labels.json`. Edited: `src/instance.js`, `src/data/loadInstanceData.js`, `src/lib/streetLabels.js`, `src/components/LafayetteScene.jsx`, `src/cartograph/MapLayers.jsx`, `cartograph/serve.js`, `cartograph/bake-buildings.js`, `cartograph/pipeline.js`.

Full continuity: coordinator memory `project-lodz-ksiezy-mlyn-portability-test`.
