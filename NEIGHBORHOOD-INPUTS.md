# Neighborhood Inputs — the pour template

**What every input to a neighborhood is, where Lafayette Square got it, and whether that well transfers to the next town.** This is the intake SSOT *across all four domains* (Map · Trees · Weather · Content) — the checklist an operator opens on day one of pouring a new slab. It answers Jacob's question directly: *the infrastructure exists; how do we fill it?*

> **Status: v0.4 (2026-07-05) — Boz.** The roster editor + **polygon building-membership** landed (§5.1/§5.2); the **content-layer schema is ratified (§5.1.1)** — the canonical collection format (building ledger + listings, joined by slab building id). Grounded in `cartograph/INTAKE.md` (the map layer's deep provenance home — this doc cites it, does not restate it) + a four-domain provenance sweep of the live code. Some content-layer attributions are first-pass — marked **⚠️ confirm**. Not yet wired into `README` doc-map / `ORIENTATION` — do that on ratification (§8).
>
> **Scope note:** this is the *intake/authoring* companion to `SLAB-CONTRACT.md`. The contract says what a finished slab **is**; this says what you must **gather and author** to pour one.

---

## 0. The governing law, and the three tiers

### 0.0 ⭐ The governing law: everything is a best guess, and everything is overridable (Jacob, 2026-07-02)

**Every artifact the suite produces — every fetched geometry, derived height, placed tree, classified land-use, weather directive, seeded listing — is a *best guess/attempt*, and every one is *overridable* by the operator.** The kit is a first-draft generator, not an oracle. Automation's job is to make the *guess* as good as it can be; override is the universal, first-class complement at every layer — never an exception, never "debt." This **subsumes** the older "SHAPE is automated / LOOK is authored" binary (§1.1): the real axis isn't automated-vs-authored, it's *how good is the free guess (the tiers below) × always-overridable.*

### 0.1 The three tiers — how good the free guess is

Every input LS consumed falls into one of three tiers. The tier tells you *how much head-start the automated guess gives you* — and thus how much override/authoring the next operator must add on top. The whole per-town cost is the override effort on Tiers ② and ③.

| Tier | Meaning | What the next town does | Examples |
|---|---|---|---|
| **① GLOBAL / GENERIC** | National-or-global data, or a build-once reusable asset | **Nothing** — move the extent or inherit the asset | OSM, MS footprints, Overture, USGS LiDAR, Mapillary · tree chassis GLBs, CC0 bark, leaf packs, the rubric, the whole bake pipeline · the *entire* weather library |
| **② MUNICIPAL WELLS** | Real data that exists for most towns but at a **different provider/endpoint** | **Re-point the fetch** to the new town's portal | Assessor parcels (address/zoning/sqft/value/year) · municipal tree census · street-lamp positions |
| **③ COMPLETIST / AUTHORED WELLS** | Data LS had by luck of being a documented historic district, or hand-authored aesthetic + idiosyncrasy | **Hand-author / LLM-assist / measure** — the real work | National Register records (style/architect/period/contributing) · Wikimedia historic photos · per-landmark listings (names/hours/photos/menus/descriptions) · measured street widths · **idiosyncratic shape features (curated centerlines)** · the authored look (tree palette, Looks, cloud tuning) |

**The headline for your two candidates:**
- **HiPointe-DeMun** (St. Louis) — Tier ② wells are the *same St. Louis endpoints LS already hits* (assessor, forestry). Smallest new-data surface of any option; the truest first test of the kit.
- **Provincetown** (Massachusetts) — every Tier ② well moves to a new provider (MassGIS parcels, MA forestry/none), and Tier ③ shifts shape (maritime/resort, not Victorian historic-district). More commercial upside, more intake work.

**The acquisition-mode axis (Jacob's LLM → handmade → automated sequence)** maps onto the tiers:
- Tier ① and ② are **automated fetch** (② needs the endpoint re-pointed once).
- Tier ③ is where the sequence lives: **v1 LLM-assisted bootstrap → v2 handmade curation (guardian/operator) → v3 automated (Places API, POS sync, node-tag ingestion).**

---

## 1. MAP inputs (Cartograph)

Deep home: **`cartograph/INTAKE.md`** (provenance SSOT + the GEOMETRY-vs-ATTRIBUTES distinction + the authoritative-geometry gap). Summarized here for the cross-domain view.

| Input | Gives | LS source | File | Tier | Mode |
|---|---|---|---|---|---|
| OpenStreetMap (Overpass) | centerline **geometry**, buildings, POIs, park paths/water, lamps | `scripts/02-fetch-osm.py` → `raw/osm.json` | ① | automated |
| MS ML Building Footprints | building footprints | `fetch-msbf.js` → `raw/msbf.json` | ① | automated |
| Overture Maps | buildings (MSBF lineage) | `config.py` merge | ① | automated |
| USGS 3DEP LiDAR | building **heights** + terrain DEM | `fetch-lidar-heights.py`, `bake-terrain.js` → `terrain.bin` | ① (US) | automated |
| Mapillary | facade imagery → wall/roof material | `10-fetch-mapillary.py` | ① (coverage-dependent) | automated |
| **City of St. Louis Assessor** | **parcels + ROW + year/zoning/sqft/value** | `03-fetch-stl-parcels.py` | **②** | automated (re-point per town) |
| **`survey.json`** | measured street **widths** (61/68 streets) | operator, from "OSM sidewalk distances + assessor ROW fallback" | `raw/survey.json` | **③** | measured |
| **Curated centerlines** (35 in LS) | hand-authored street *shapes* the source data can't capture | operator hand-draw | `centerlines.json` `source:'curated'` | **③** | authored — **legitimate, not debt** (revised 2026-07-02; see §1.1) |

**Doctrine (revised 2026-07-02 — see §1.1):** the map has an **automated backbone** (geometry, widths, class, land-use, heights — all fetchable) *plus* a **legitimate authoring layer** for the idiosyncratic features a historical neighborhood carries that street data simply doesn't hold. The extent is a **center + radius** (`neighborhood_boundary.json`) — the neighborhood's named-street edges sit *inside* that circle, the soft stencil fading the rim (§9).

> **✅ Terrain/elevation is per-scene and already wired (2026-07-04) — don't re-investigate.** `bake-terrain.js` reads the installation's own USGS 3DEP GeoTIFF (`data/<scene>/raw/elevation.tif`), clips to that scene's geography+boundary, resamples to a 5 m grid → `clean/terrain.{json,bin}`, copied into the slab per-Look; `bake-buildings.js` (`loadSceneTerrain`) drapes buildings onto it. No installation is privileged — LS bakes through the exact same path. **HiPointe shares LS's exact tile** (`n39w091`), associated via a symlink (`hipointe-demun/raw/elevation.tif → lafayette-square/raw/elevation.tif`), and already renders on real relief (baseElev 143 m). The pour's `--skip-elevation` flag skips only the *legacy EPQS per-building* path (superseded by the GeoTIFF drape), **not** the terrain — so it is not a gap.

### 1.1 ⭐ Curated shape is authoring, not a bug (Jacob, 2026-07-02)

Prior canon (`cartograph/INTAKE.md §6.1`, `cartograph/SKELETON.md §6`) framed every hand-curated centerline as a *logged defect*, target 0 — a kit that onboards town #100 can't require hand-drawing. **Jacob revises this: a historical or idiosyncratic neighborhood has features simply not captured by the street data, so hand-authoring SHAPE is an expected, first-class capability — not debt to eliminate.** (This is the SHAPE-layer instance of the §0.0 governing law — best guess, always overridable.) The synthesis that keeps both truths:

- **Automation debt** — the pipeline *could* get it right but didn't (an OSM digitization artifact; a loop the skeleton should close). Still worth fixing; the pipeline should keep improving.
- **Idiosyncratic authoring** — the feature genuinely isn't in any fetchable source (LS's private gated "Places"; a contested neighborhood boundary). Hand-authoring is the *correct tool*, permanently.

`INTAKE §6.2` already conceded exactly this for the cap selector ("NOT data-derivable… STAYS a real authoring control") — §1.1 generalizes it. **Consequence:** the metric is no longer "curated → 0"; it's *distinguish debt from idiosyncrasy — automate the first, embrace the second.* The §5.2 feature editor is what turns idiosyncratic authoring from a `centerlines.json` file-hack (reads as debt) into a first-class gesture (reads as craft).

> ⚠️ **Canon conflict — needs reconciliation (pending greenlight, §8).** This contradicts the settled `INTAKE §6.1`, `SKELETON §6`, and `ORIENTATION`'s *"Shape is automatic; look is hand-made"* one-liner. Per the accord rule those must not silently disagree with this — a reconciliation pass repoints them to §1.1 once Jacob confirms the reframe.

---

## 2. TREE inputs (Arborist)

| Input | Gives | LS source | File | Tier | Mode |
|---|---|---|---|---|---|
| **Municipal tree census** | 745 real placements (species + DBH + condition) | **City of St. Louis Forestry** ArcGIS | `src/data/park_trees.json` (756) | **②** | automated (re-point per town) |
| Street-lamp positions | 80 lamps (drive tree glow + ground pools) | OSM interior + procedural perimeter ring | `src/data/street_lamps.json` | ②/① | automated + procedural |
| Species roster + dossiers | canonical IDs, botanical spec per species | authored (Hortus + operator, from botanical refs) | `arborist/species-map.json`, `arborist/dossiers/*` | ③ (schema ①) | authored / LLM-assistable |
| Rubric vocabulary | 19 botanical axes | authored, species-agnostic | `arborist/rubric.json` | ① | — (universal) |
| Chassis GLB library | 241 de-leafed skeletons | vendor (Whittle) + LiDAR + procedural (SCA) | `public/trees/_chassis/` | ① | reuse or commission |
| Bark textures | 8 PBR bark types | CC0 (ambientCG, Poly Haven) | `public/textures/bark/` | ① | reuse |
| Leaf-shape packs | ~25 silhouettes | authored + scanned packs | `public/textures/leaves/shapes/` | ① | reuse |
| Color / season tuning | per-species tints, fall ramps | authored (operator eye) | dossiers, `species-map.json` | ③ | authored |
| Bake pipeline | slab trees (placements, atlases, GLBs) | deterministic code | `arborist/bake-trees.js` etc. | ① | — |

**Per-town work = acquire the tree inventory (②) + author the species palette & color (③).** Everything geometric, textural, and mechanical transfers untouched. Note the census is a *second completist-shaped well*: if a town has no municipal inventory, trees fall back to LiDAR canopy or procedural placement (a known lever, lower polish).

---

## 3. WEATHER inputs (Meteorologist) — the free domain

| Input | Gives | LS source | Scope | Mode |
|---|---|---|---|---|
| Cloud presets ("Teapot") | 52 WMO morphologies | authored once (Nimbus, 2026-05-20) | **global — shared** | authored |
| Almanac rules | 16 weather→sky directives | authored (Conditions editor) | **global — shared** | authored |
| Modulators | 7 continuous phenomena (cold front, smoke, pre-storm gold…) | authored | **global — shared** | authored |
| Reference photos | 42 WMO/Wikimedia cloud refs | curated | **global — shared** | curated |
| **Instance geography** | lat/lon/timezone | `src/instance.js` | **per-town** | measured (1 line) |
| Real weather | live temp/cloud/precip/wind | **Open-Meteo API**, polled with instance coords | per-town (automatic) | real-world (zero authoring) |
| Sun position | solar altitude/azimuth | SunCalc from instance coords | per-town (automatic) | procedural |

**A new town authors nothing here.** It inherits the whole engine and gets real weather + correct sun path *for free* the moment `instance.js` has the right coordinates. This is the inverse of a per-town baked asset — the library is maximally portable. (`public/clouds/*.json` are live artifacts; `public/clouds/fixtures/` is orphaned — Phase-5b stub.)

---

## 4. CONTENT inputs (the townie layer) — where the mystery lives

This is the layer Jacob pointed at. LS's content was seeded from **unusually completist records** — and that's exactly what won't transfer.

### 4.1 Buildings — `src/data/buildings.json` (1,082)

| Field group | LS source | Tier | New-town reality |
|---|---|---|---|
| footprint / position / size | MS footprints + LiDAR (§1) | ① | automated |
| address / zoning / sqft / value / year | **STL assessor** | ② | re-point per town |
| stories | assessor `building:levels`, else `height/3.5` | ②/computed | mostly automated |
| wall/roof material, color | Mapillary facade match + overrides | ①/③ | coverage-dependent |
| **historic_status / contributing / architect / style / period** | **National Register nomination** (`inventory/` OCR) | **③** | 🔴 **does not exist for a normal town** — LLM-assist or omit |

### 4.2 Landmarks / listings — `src/data/landmarks.json` (87), tracked in `BUSINESS_LISTINGS.md`

Names, categories, phone, website, hours, photos, amenities, descriptions, history, tags, menus (`menus.json`, ~25% of listings). **All hand-compiled** by the operator over 3–6 months from Google/Yelp/business sites/site visits + historic records. No automated listing discovery; edits flow through the Apps Script → Sheets backend, not a per-place UI in the app (except guardian claims). **Tier ③ throughout.**

### 4.3 Photos

- `photos-wikimedia/` (~700, CC BY-SA, `download-wikimedia.*`) — **Tier ③, historic-district luck.** Sparse-to-absent for a new town.
- `public/photos/` (~300 business photos) — hand-sourced/photographed. **Tier ③.**

### 4.4 User-generated (fills over time, empty at launch)

Checkins · Reviews · Events · Guardians · Residents · LobbyPosts · Handles · QRDesigns — all seeded empty, populated by townies post-launch via `apps-script/Code.js`. **Tier ① by nature** (zero bootstrap; the app is the acquisition tool). The Listings sheet is the one seeded-then-live table (synced from `landmarks.json` on init).

**Content bootstrap estimate for a ~60–100 landmark town: ~100–150 operator hours**, ~60–70% hand-authored — vs. LS's 3–6 months riding the completist wells. This is the single biggest per-town cost, and the prime target for the LLM-assisted → handmade → automated sequence.

---

## 5. ⭐ The two capability gaps (Jacob, 2026-07-02)

Both are real holes between "LS was bulk-seeded once" and "an operator hand-builds a town."

> **⭐ BUILT (2026-07-05).** No longer "named": **§5.2's first slice — the roster editor — landed** (brief archived → `cartograph/_archive/handoffs/HANDOFF-building-roster-editor-2026-07-05.md`, Ward): per-building **membership curation** on the Extent tool's top-down footprint overlay. **§5.1's render half also landed** (the render ledger, below). Both ride the render/content boundary (`slab-render-vs-content-boundary`); §5.1's **per-instance content sidecar** remains the open **blank-app arc** (`HANDOFF-blank-app-instance-decoupling.md` — the app becomes a generic look-reader, LS just `?look=lafayette-square`) — but its **schema is now ratified (§5.1.1)**, so content collected today lands in the target format.

### 5.1 Per-building authoring — the "Building Ledger"
LS's building metadata (historic status, style, architect, year) was **bulk-authored once** from completist records, with **no per-building update UI**. A town without those records needs a **building-by-building surface** to fill this in by hand or LLM-assist — the content-side analog of the Cartograph authoring tools.

**Render half — DONE (2026-07-05).** The building record splits along the render/content boundary (`slab-render-vs-content-boundary`). The **render** fields (footprint · size · stories · wall/roof material · color · zoning) now load from a per-scene **render ledger** at `cartograph/data/<scene>/buildings.json` — `bake-buildings.loadBuildings` reads it uniformly for every scene, retiring the `scene === 'lafayette-square'` source hardwire (`bake-buildings.js:62`; keyed on data, not the proper noun). LS's ledger is the render-field projection of its authored `src/data/buildings.json` (`derive-ls-render-ledger.js`), so LS bakes **byte-identical**. LS is now "a look at the render level," not a code branch (`slab-is-the-instance-identity`).

**Content half — the blank-app arc (open).** The **content** fields (name · address · historic_status · listings) stay in `src/data/buildings.json`, still read by the ~10 townie imports — untouched. Decoupling those into a per-instance content sidecar is the separate `HANDOFF-blank-app-instance-decoupling.md`, NOT this arc. **The content sidecar's *schema* is now ratified — §5.1.1.**

### 5.1.1 ⭐ The content-layer schema — the canonical collection format (ratified 2026-07-05)

> Ratified by Jacob + Boz, **verified against the live app consumers** (`landmarks.json`/`buildings.json` field sets) **and HPDM's roster** (`content/roster.json`, ids matched to the baked slab 2089/2089). This is the format an operator collects building + business info **into**, and the format the blank-app content sidecar will **read**. Collecting in this shape now avoids re-migrating thousands of records later.

**⭐ The governing gate — the reader is universal; zero hardcodes (Jacob, 2026-07-05).** *Nothing* installation-specific may be a literal in the reader — no `2,164`, no "Lafayette Square", no lat/lon, no "roughly 2,000 residents" copy. Every such value is **supplied data** (instance config or content). This is the strong form of `slab-is-the-instance-identity` ("anything in the reader that hardcodes the instance's identity is drift"). The acceptance test for the blank-app arc: **grep the reader for LS literals → zero.** Every field below exists *because* its hardcoded twin must come out.

**⭐ The one invariant — the building id is the join key.** The slab carries each building's *spatial identity* (its `id`); the content layer carries **no geometry**, only `id → record`. A click resolves `raycast → building id` (slab); content resolves `id → display record`. **Every content record MUST key on the exact building id the slab assigns** — HPDM `msbf-*` (verified 2089/2089), LS `bldg-*`. Collect ids that match the slab, or nothing joins. (`slab-render-vs-content-boundary`: "slab owns identity, content owns display.")

**Three layers** — a singular installation profile, plus two building-grained layers joined by building id (not one merged file — a building hosts **0..N** businesses, so a single nested `listing_name` can't represent mixed-use or hold the rich fields):

**Layer 0 — Installation profile** (singular, one record per installation; rides the instance config / a small `content/profile.json`). The neighborhood-level facts the reader shows in the Bulletin masthead + InfoModal — **today all hardcoded, all must come out**:

| Field | Example (LS) | Notes |
|---|---|---|
| `name` | "Lafayette Square" | the installation's display name |
| `population` | `2164` | the masthead "Residents" stat (`SidePanel.jsx:750`) — a census figure; HPDM ≈ **~6,500** (Hi-Pointe 2,151 + DeMun ~4,500, 2020) |
| `founded` / `established` | — | if shown |
| `tagline` / `about` copy | "roughly 2,000 residents…" | the InfoModal blurb (`InfoModal.jsx:170`) — parameterized, not literal |

*(Buildings / Places / Streets in the same masthead already auto-derive from the slab + content — HPDM's Buildings will read **2,089** for free. Only `population` and the copy are hardcoded today.)*

**Layer 1 — Building ledger** (building-centric, one record per building; HPDM's `cartograph/data/<scene>/content/roster.json` is this). Each field classifies **render** (→ baked into the slab) vs **content** (→ the sidecar) per `slab-render-vs-content-boundary`; collect both, the split happens at bake/wire:

| Field(s) | Render / Content | Tier | Notes |
|---|---|---|---|
| `id` | **key** | — | must equal the slab building id |
| footprint · position · size · `stories` | RENDER | ①/② | automated (MSBF + assessor) — don't hand-collect |
| `wall_material` · `roof_material` · color | RENDER | ①/③ | facade match + overrides |
| `zoning` · `building_sqft` · `units` · `vacant` · `appraised_value` | RENDER-ledger | ② | assessor; re-point per town |
| `name`/label · `all_names` | CONTENT | ②/③ | display |
| `address` · `municipality` · `jurisdiction` | CONTENT | ② | assessor |
| `historic_status`/`historic_district` · `contributing` · `architect` · `style` · `period` · `year_built` | CONTENT | ③ | 🔴 completist-record luck — LLM-assist or omit for a normal town |

**Layer 2 — Listings** (business content, listing-centric, one record per business, `building_id` → the slab id, **0..N per building**). The rich, hand-compiled **Tier-③ long pole** the app's place cards / search / neon display — collect the FULL shape, never a `listing_name` stub. Companion file `cartograph/data/<scene>/content/listings.json` (sibling to `roster.json`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | listing id |
| `building_id` | string | → slab building id (the join) |
| `name` | string | |
| `category` · `subcategory` | string | drives search filtering + neon color |
| `phone` · `website` · `logo` | string | |
| **`hours`** | **object** `{ monday: {open,close}, … }` | ⚠️ **STRUCTURED, not free text** — the open-now / neon logic reads this; keep `opening_hours_raw` alongside for provenance |
| `photos` | string[] | **instance-relative** paths under the installation's own asset root — see §5.1.2 |
| `amenities` · `tags` | string[] | |
| `description` · `history` | string | |
| `menu_url` (or a `menus.json` entry) · `reservation_url` | string | menus optional (~25% of LS) |
| `status` | string | open / closed / seasonal |
| `address` | string | listing address (may differ from the building's) |

**Collection guidance (what to spend hand-hours on).** Render fields (footprint / materials / stories) arrive automatically from MSBF + parcels — **don't hand-collect them**. Spend the effort on the **content** fields and the **full listing schema** — especially **structured hours**, photos, description, menus — because that's the expensive Tier-③ work (`§4.2`, ~100–150 operator hours/town) you don't want to redo. LS predates this template (content buried in `src/data`); **HPDM is the first installation collected natively into it** — both layers now exist: `content/roster.json` (Layer 1, 2089 buildings, ids matched 2089/2089) + `content/listings.json` (Layer 2, 212 listings, 30 mixed-use buildings) + `content/nr-inventory.json` (the NR completist corpus) + `HIPOINTE-DEMUN-ROSTER.md` (the human directory). Seeded 2026-07-05 by joining OSM POIs + STL City/County assessor parcels + the Hi-Pointe–DeMun NR nomination (#05000370) onto the baked set. **The four datashape recognizers** (OSM POIs · assessor parcels + land-use decoders · NR "Exhibit 5" survey · LS-taxonomy classifier) are proven here but still live in scratch scripts — **the scene-generic content-intake stage that productionizes them is the open kit-wiring step**, sequenced *after* the blank-app arc settles the content home (so the stage writes to the right place once). See [[project_hipointe_content_roster_and_intake_datashapes]]. **Layer 0 (installation profile) BUILT 2026-07-05** — `content/profile.json` (name, population ~6,500 [Hi-Pointe 2,151 + DeMun/South-40 ~4,500, 2020 Census], platted 1917/1923, NR district, about-copy); each value has a hardcoded LS twin in the reader (`SidePanel.jsx:750` `2,164`, `InfoModal.jsx:170` copy) that the blank-app arc removes per the zero-hardcode gate. **Menus** live in `content/menus.json` (keyed by listing id, LS `menus.json` shape); **per-place assets** in `content/photos/<slug>/` (§5.1.2). Four fully-elaborated cards done (Barrio · Louie · Sasha's · Clementine's).

### 5.1.2 ⭐ The per-installation asset root — installations have no sense of each other (Jacob, 2026-07-05)

**An installation is a self-contained payload; it neither shares an asset root with, nor references the slugs of, any other installation.** This is the asset-layer form of `slab-is-the-instance-identity` + §5.1.1's zero-hardcode gate: LS is one look, HPDM another, and neither knows the other exists.

**Offensive — the convention every installation follows:**
- Photos (and any per-place assets) live under the installation's **own content payload**: `cartograph/data/<scene>/content/photos/<slug>/NN.jpg`.
- Listings store **instance-relative** paths — `photos/<slug>/NN.jpg`, **no leading slash** — and the reader roots them against the loaded instance's content root (`loadInstanceData(lookId,…)`). *Relative signals "resolve within this installation"; a leading-slash absolute path (`/photos/...`) is a web-root reference and is reserved for the LS-legacy layout.*
- Slugs are **installation-local**: HPDM's `barrio`, `louie`, `sashas`, `clementines` are HPDM's, full stop. `content/menus.json` is keyed by listing id and lives in the same payload.

**Defensive — the guardrails (a violation here means you've broken instance independence):**
- ⛔ **Never write an installation's assets into another installation's root.** `public/photos/` is **LS's** web-root (`/photos/<slug>/`). Writing HPDM images there is the mistake that manufactured a fake "collision" (2026-07-05): HPDM's `clementines` appeared to clash with LS's `clementines` *only because they were forced to share a namespace*. Under per-installation roots the clash cannot exist.
- ⛔ **Never disambiguate a slug against another installation** (no `clementines-demun` "to avoid LS"). If you feel the urge to suffix a slug because "another installation already uses it," stop — you're leaking cross-installation awareness. Same-brand businesses in different towns are simply different files under different roots.
- ⛔ **Never resize/overwrite files you didn't create.** (The same 2026-07-05 slip briefly re-compressed LS's tracked `public/photos/clementines/*`; reverted.) Confirm a path belongs to *your* installation before writing.
- **Litmus test:** if removing every other installation from the repo would break this installation's assets or paths, the boundary is violated.

*Realized for HPDM 2026-07-05: `content/photos/{barrio,louie,sashas,clementines}/`, listings use `photos/<slug>/…`. The reader/decoupling arc owns teaching the runtime to serve an instance's co-located assets.*

### 5.2 Pre-bake feature add/remove — the roster editor (BUILT, 2026-07-05)
Was a coarse center+radius clip — all-or-nothing. Now the operator curates **building membership** by hand before the bake. **⭐ The neighborhood is the area inside the boundary-STREET POLYGON** (the corners resolved from the named sides), *not* the circle — the circle stays the slab disc/fade (`project_neighborhood_disc` still holds for the *slab*; **membership** is the polygon). A building belongs if its **centroid is in the polygon**; the operator's overrides layer on top (`feedback_effective_payload_layering`): **`activate`** forces an outside building IN (recover a rim stray), **`hide`** forces an inside one OUT — persisted per scene as `{ activate, hide }` in `cartograph/data/<scene>/building-overrides.json` (robust to radius/polygon edits, never merged into the render-ledger seed).

- **UX** — the Extent tool's top-down footprint overlay (`ExtentApp`): **"Edit buildings"** enters curation; included buildings read solid, excluded read as faint ghosts; click a ghost to re-activate, an inside building to hide (**toggle-ghost**). Pan stays live (select is a click, pan a drag).
- **Applied in the PIPELINE** (`pipeline.js`, the boundary clip → `map.json`) so it's the **single source** both the 2D Designer (reads `map.json`) and the bake inherit — the curation persists through every downstream step. Commit re-resolves + persists the boundary polygon **in the re-centered frame** (`neighborhood_boundary.json.polygon`) so the bake-frame buildings align. `building-overrides.json` is **git-tracked** (`.gitignore` excepts it alongside `neighborhood_boundary.json`) so the curation is reproducible source, not just baked into the slab.
- **⚠️ Membership is a POUR/BAKE-time filter, not live.** The Extent builder shows the polygon + overrides live, but the 2D `map.json` and 3D slab only reflect them after a **re-pour + re-bake**. And the whole mechanism hangs on the **polygon being persisted**: `pipeline.js`/`bake-buildings.js` fall back to the circle when `nb.polygon` is absent, and `activate` only re-includes an *outside-polygon* building — so a scene committed **before** the polygon-persist landed shows the whole circle with inert activations until it's **re-Committed** (or the polygon written directly). *(HiPointe-DeMun hit exactly this 2026-07-05 — boundary file predated the feature by ~1.5h; 2112 → 1281 once the polygon was persisted + re-baked. Operator steps: `cartograph/OPERATIONS.md §7`.)*

Per §1.1 this graduates the curated-centerline mechanism into a first-class gesture. (Tree / path / lamp add-remove — the rest of §5.2 — remain to build; this slice is **buildings**.)

> Both gaps share a spine: the kit currently assumes *the data arrives complete and correct*; a real new town needs **operator override surfaces** at the building and feature grain. That's the authoring frontier this pour will expose.

---

## 6. Features you'll encounter next time — the growing checklist

Seeded from the LS build + the HiPointe/PTown contrast. **This section is meant to grow — Jacob adds; Boz weaves in.**

**LS had (dense-urban historic):** street grid · row houses · a central park (Lafayette Park) · historic district · churches/institutions · small-business corridor · alleys · the "Places" (gated cul-de-sac streets).

**Provincetown would add (coastal resort):**
- **Water & coastline** — harbor, beach, the bay edge (a real shoreline, not LS's park pond)
- **Piers / wharves / docks** (MacMillan Pier) — structures over water
- **Dunes & the Cape Cod National Seashore** — natural terrain, protected land
- **Seasonal population** — a resort town's listings swing hard by season (many businesses closed off-season)
- **Boats / moorings** as scene features
- **Beach vegetation** (dune grass, scrub pine) — a different tree/ground roster
- **A single commercial spine** (Commercial St) vs. LS's grid

**HiPointe-DeMun would add (LS-like, low delta):**
- **A commercial node** (the DeMun / Clayton-adjacent shops) — familiar
- **University/institutional edges** (near Wash U / Concordia) — larger footprints, campus land-use
- **Mostly the same well set as LS** — its value is precisely that it's *close* to LS

**Generic features not yet in LS to anticipate:** waterfront/rivers · rail lines & transit stops · highways/overpasses (grade-separated, §divided-road handling) · industrial/warehouse land-use · cemeteries · schools/campuses · large parking structures · elevation/hills (LS is flat-ish) · seasonal/temporary features (markets, festivals).

*(Add your own here.)*

---

## 7. The pour sequence (sketch — the eventual runbook)

Not yet a runbook; the honest skeleton of one, sequenced by Jacob's acquisition axis.

1. **Extent + geography** — pick center + radius; fill `src/instance.js` (weather goes live immediately, §3).
2. **Automated fetch (Tier ①)** — OSM, footprints, LiDAR, Mapillary → the map + building geometry. Same scripts, new extent.
3. **Re-point the municipal wells (Tier ②)** — the new town's assessor parcels + tree census. *The one engineering task per town* (new fetch adapter). HiPointe ≈ free; PTown = MassGIS adapter.
4. **Author SHAPE debt to zero** — survey widths; drive curated-centerline count toward 0 (kit invariant).
5. **Content bootstrap (Tier ③, the long pole)** — LLM-assisted listing compilation + description drafting; handmade verification; per-building ledger (§5.1) for building metadata. Photos: hand-source/shoot.
6. **Author the look** — tree palette + color, Looks/Stage, any cloud-condition tuning.
7. **Feature cleanup (§5.2)** — hands-on add/remove before the final bake.
8. **Bake → slab → deploy** — per `SLAB-CONTRACT.md` + `PUBLISH.md` (new deploy target: `jacobhenderson.studio/<hood>` subpath).

---

## 8. Ratification follow-ups (not done — draft doc)
- **Canon reconciliation for §0.0 + §1.1 — DONE 2026-07-02.** The governing law replaced each retired "curated = bug / target 0 / shape-automatic" assertion in `ORIENTATION` (first-read bullet), `SHOW-BIBLE`, `cartograph/INTAKE §6.1/§6.2`, `cartograph/SKELETON` (doctrine list), `cartograph/BACKLOG` (kit-correctness track), and `cartograph/FEATURES` — each now points here. Git holds the verbatim old text (no new `_archive/` copy, to avoid re-adding paper). **Residuals deliberately left as-is:** `POLYGON-FIRST §5` (the correctness *detector* is still valid — it catches automation-debt; only its "→ 0" telos softens to "shrink debt"), `HANDOFF-park-path-unify` (its "delete the code fork" point is unaffected — the law blesses operator override, not parallel code pipelines), and `NOTES`/forensics (Diary — history, left intact).
- Wire this into `README.md` doc-map + a one-line `ORIENTATION.md` pointer (reachable in ≤2 hops).
- Confirm the ⚠️ content-layer attributions (§4.1 historic fields) against `inventory/` + `apps-script/Code.js`.
- Promote §5.1/§5.2 to real workstream specs when we pick them up.
- When the neighborhood is chosen, fork the §7 sketch into a per-town runbook.

---

## 9. First pour: HiPointe-DeMun (extent capture, 2026-07-02)

Jacob's lead candidate — St. Louis, LS-scale, live customer interest, lowest Tier-② surface (same STL assessor + forestry endpoints LS already hits). Extent as described (verbatim; to geocode when we set `instance.js`):

- **West:** McCausland Avenue / the St. Louis city limit
- **North:** Forest Park Parkway / Oakland Avenue
- **East:** Big Bend Boulevard (possibly stretching slightly to Skinker, context-dependent)
- **South:** Clayton Road (some include the blocks down to Wydown Boulevard around DeMun)

> The named-street edges **describe where the neighborhood sits; the polygon they bound fits comfortably inside a center+radius circle** — the circle is the slab clip + soft stencil (`SLAB-CONTRACT §2.1`) fading the rim. *(⚠️ Update 2026-07-05, supersedes "no polygon boundary control needed": the polygon those streets bound is **not** merely descriptive — it is now the **building-membership** boundary, §5.2. The circle stays the slab disc; the **street polygon decides which buildings are in**, with per-building activate/hide handling the "possibly Skinker" / "some include DeMun" fuzz.)* **Next concrete step when we start:** geocode these edges → pick a center + radius that contains them → seed `instance.js` geography (which also lights up weather, §3, for free).

---

## 10. The Hero shot — the kit stages it, the operator brings the prop (2026-07-02)

The **Hero** is the marquee shot (base shot; `SLAB-CONTRACT §4`). It follows §0.0 — a working default, fully overridable — but the *prop* is **idiosyncratic per Place, not from a library** (Jacob: "Places will be idiosyncratic"). The kit provides the **stage; the operator brings the model.**

**Three subject classes** *(the third added 2026-07-10):*
- **In-map object** — any building (already selectable; camera centers on its centroid — `resolveHeroSubject` / `src/lib/heroSubject.js`). A 360° orbit around the park is this class with a different *move*. No new machinery.
- **Decorative prop** — an object *not in the neighborhood*, inserted + scaled/rotated/positioned purely for framing. **The arch is this** — a stage prop authored via `Hero Distance/Scale/Rotation/Y-Offset` sliders (default `~[996,0,-332] @1.3`), **not** its real geography (`src/components/GatewayArch.jsx`). Today it's a bespoke procedural component (NPS catenary + simple custom shaders + uplights + ground disc); every *future* prop is a **brought GLB**.
- **Landscape (backdrop mesh)** ⭐NEW — **not a point to frame on; a mesh rendered *behind everything***, geo-anchored (true bearing/scale by default, `§0.0`-overridable). The Altadena San Gabriel range is the first (`bake-landscape.js` → native-PBR GLB + geo-anchored manifest under `/baked/<look>/landscape/`; `MountainBackdrop.jsx` renders it; the **Hero Controls section is now subject-kind-aware** — placement/snowline/atmosphere knobs). Native PBR auto-takes the scene TOD rig. **Frame: north = −z** (`config.js wgs84ToLocal` authoritative; the arch bearing is NOT a frame proof — it's framing-placed). Detail: `HANDOFF-altadena-mountain-hero.md`, `cartograph/NOTES.md 2026-07-10`.

**The brought-GLB path (BUILT 2026-07-10 via the Landscape kind above; was spec-only, proven previously only by the bespoke Arch):** *accept a GLB → place it with the existing Hero sliders → render it with its own materials → bake it into the slab.* Constraints that bite during "accepted and placed correctly":
- **Keep native materials** — this is **NOT the tree/arborist path** (trees strip materials into the atlas); a hero renders as-authored. Reuse GLB *loading*, not re-skinning.
- **Slab home** — the hero GLB is a **per-scene slab artifact** (scene baked dir + a small hero-manifest entry + placement values), so it survives the bake like the arch channels do (`SLAB-CONTRACT`: unbaked = unshipped).
- **Log-depth gotcha** — standard-PBR GLBs are fine; a **raw-ShaderMaterial** hero needs the `<logdepthbuf_*>` chunks (canvas runs `logarithmicDepthBuffer`), else it writes on the wrong depth scale (`feedback_raw_shadermaterial_needs_logdepth_chunks`).

Hero = **{subject: manifest object or brought prop} × {move: center / pan / orbit}**, both chosen in the **Survey setup step** (§7 step 4), both defaulted (the "Reset" = north-facing E↔W pan is just the default move). The arch stays grandfathered; the general brought-GLB path is the new capability, and it **shares the §5.2 surface** — adding a hero prop *is* adding a feature before the bake.

---

## 11. The intake interface — Cartograph's step 0, on the aerial (2026-07-02)

Intake stops being a headless `scripts/` step and becomes the **mouth of Cartograph** — the same aerial-map work-shape the operator already uses to fortify shapes, extended *upstream*. (Don't reinvent the UX — `feedback_dont_reinvent_existing_ux`.) The pipeline order is unchanged (`intake → skeleton → …`); intake just gets a visual front.

**Setup flow, all on one aerial canvas:**
1. **Box** — the conceptual bounds. Seed by typing the border streets (machine resolves their **corner intersections** → a box, best-guess) *or* drawing it; then drag the corners on the aerial (§9 — the Skinker/DeMun fuzz gets nudged here).
2. **Circle** — the operational clip: center + radius that **contains** the box, the stencil fading the margin (`SLAB-CONTRACT §2.1`).
3. **Assign** — the acquisition rows: each input is `WHAT → WHERE → Go → Result(review)`, the **"Go" firing a brief templated from this doc's provenance tables** (the inventory *is* the brief library); fetched data lands **on the same aerial** so coverage/gaps read in place. Modes: fetch / find-then-fetch / author / bring (§0.1 tiers). Every "Go" returns a *best guess* to review, never a silent commit (§0.0).

**Connective navigation.** The intake front lives in the Cartograph server, but the operator crosses the local topology — **`:5173` web (main app) · `:3333` cartograph · `:3334` arborist · `:3335` meteorologist** (`PIP.md`). Intake needs nav links wiring Cartograph ↔ main app ↔ the authoring helpers (cartograph + arborist most of all) so the operator moves between extent/acquisition, tree authoring, and the lit app without losing neighborhood context.

**⭐ The boundary is living, not a one-time setup.** The operator can **always go back and edit the fundamental layout** — the box/circle re-draws anytime, so a neighborhood **grows or shrinks over time.** This is §0.0 applied to the extent itself: nothing about the pour is frozen. A re-edit re-scopes the fetch/clip and re-bakes — data entering the new extent is acquired, data leaving it is dropped. **Design consequence:** acquisition + bake must be **re-runnable against a changed extent**, never assume a fixed one.

---

> ✅ **BUILT (2026-07-04) — this §10/§11 Box/Circle spec is now the Extent tool.** `src/cartograph/ExtentApp.jsx` + the Extent flow (`◎ Extent` in the Toolbar) realizes it:
> - **Box** = the named-boundary-street polygon; its corners are resolved from **skeleton junctions** (where consecutive named sides meet), **not** from marks or raw-OSM crossings (`skeleton.json junctions[]`).
> - **Circle** = the geographic (shoelace) **centroid** + the **containing radius**.
> - **Commit** re-centers `geography.json` to the centroid → reprojects **all** frame-dependent raw (OSM **+ msbf + admin_boundaries + assessor parcels**) via `reproject-raw.js` (the §11 "living boundary" recenter lever) → re-derives the skeleton → writes `neighborhood_boundary.json` (center always `[0,0]`, radius) + `neighborhood.json`. ⚠️ Parcels were the layer left behind (2026-07-08, ~800 m address desync — see `cartograph/INTAKE.md`); **after any re-center, verify parcel↔building alignment.**
> - **Re-editing / re-pouring against a changed extent works** via the **one-click Pour** (pipeline → promote-ribbons → bake, scene-generic), satisfying the §11 "acquisition + bake must be re-runnable against a changed extent" requirement.
>
> Deep home: **`cartograph/INTAKE.md`** (+ `HANDOFF-neighborhood-perimeter-builder.md`). This graduates §5.2's "curated-centerline file-hack → first-class gesture" for the *extent* layer. ⚠️ **One open bug:** poured-scene **3D browse camera framing** is off-center ("too high & left") — the Extent/Pour arc is not fully done.
