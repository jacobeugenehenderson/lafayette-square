# Neighborhood Inputs — the pour template

**What every input to a neighborhood is, where Lafayette Square got it, and whether that well transfers to the next town.** This is the intake SSOT *across all four domains* (Map · Trees · Weather · Content) — the checklist an operator opens on day one of pouring a new slab. It answers Jacob's question directly: *the infrastructure exists; how do we fill it?*

> **Status: v0.1 (2026-07-02) — new, Boz.** Grounded in `cartograph/INTAKE.md` (the map layer's deep provenance home — this doc cites it, does not restate it) + a four-domain provenance sweep of the live code. Some content-layer attributions are first-pass — marked **⚠️ confirm**. Not yet wired into `README` doc-map / `ORIENTATION` — do that on ratification (§8).
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

Both are real holes between "LS was bulk-seeded once" and "an operator hand-builds a town." Named here as workstreams; neither is specced yet.

### 5.1 Per-building authoring — the "Building Ledger"
LS's building metadata (historic status, style, architect, year) was **bulk-authored once** from completist records, with **no per-building update UI**. A town without those records needs a **building-by-building surface** to fill this in by hand or LLM-assist — the content-side analog of the Cartograph authoring tools. The townie app has *guardian listing* edits but nothing for *core building* fields. **New tool.**

### 5.2 Pre-bake feature add/remove
Today's area control is the center+radius clip (`neighborhood_boundary.json`) — coarse, all-or-nothing. There's no **hands-on way to add or remove individual features** (a stray tree, a phantom path, a missing lamp, a wrong building) before they bake into the slab. Precedent exists but is file-level (the 35 curated centerlines; the cap selector) — not a hands-on editor. Likely an **extension of the existing Cartograph pipeline**, not a new app. **New capability.** Per §1.1 this editor is the *graduation* of the curated-centerline mechanism: it makes idiosyncratic SHAPE authoring first-class craft instead of a `centerlines.json` file-hack — so §1.1 and §5.2 are one arc, not two.

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

> The named-street edges **describe where the neighborhood sits; the polygon they bound fits comfortably inside a center+radius circle** — the same clip LS uses, with the soft stencil (`SLAB-CONTRACT §2.1`) fading the rim. Not a corner case; no polygon boundary control needed. The "possibly Skinker" / "some include DeMun" fuzz is just margin the radius already swallows. **Next concrete step when we start:** geocode these edges → pick a center + radius that contains them → seed `instance.js` geography (which also lights up weather, §3, for free).

---

## 10. The Hero shot — the kit stages it, the operator brings the prop (2026-07-02)

The **Hero** is the marquee shot (base shot; `SLAB-CONTRACT §4`). It follows §0.0 — a working default, fully overridable — but the *prop* is **idiosyncratic per Place, not from a library** (Jacob: "Places will be idiosyncratic"). The kit provides the **stage; the operator brings the model.**

**Two subject classes:**
- **In-map object** — any building (already selectable; camera centers on its centroid — `resolveHeroSubject` / `src/lib/heroSubject.js`). A 360° orbit around the park is this class with a different *move*. No new machinery.
- **Decorative prop** — an object *not in the neighborhood*, inserted + scaled/rotated/positioned purely for framing. **The arch is this** — a stage prop authored via `Hero Distance/Scale/Rotation/Y-Offset` sliders (default `~[996,0,-332] @1.3`), **not** its real geography (`src/components/GatewayArch.jsx`). Today it's a bespoke procedural component (NPS catenary + simple custom shaders + uplights + ground disc); every *future* prop is a **brought GLB**.

**The brought-GLB path (the workstream):** *accept a GLB → place it with the existing Hero sliders → render it with its own materials → bake it into the slab.* Constraints that bite during "accepted and placed correctly":
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
> - **Commit** re-centers `geography.json` to the centroid → reprojects the raw OSM (`reproject-raw.js`, the §11 "living boundary" recenter lever) → re-derives the skeleton → writes `neighborhood_boundary.json` (center always `[0,0]`, radius) + `neighborhood.json`.
> - **Re-editing / re-pouring against a changed extent works** via the **one-click Pour** (pipeline → promote-ribbons → bake, scene-generic), satisfying the §11 "acquisition + bake must be re-runnable against a changed extent" requirement.
>
> Deep home: **`cartograph/INTAKE.md`** (+ `HANDOFF-neighborhood-perimeter-builder.md`). This graduates §5.2's "curated-centerline file-hack → first-class gesture" for the *extent* layer. ⚠️ **One open bug:** poured-scene **3D browse camera framing** is off-center ("too high & left") — the Extent/Pour arc is not fully done.
