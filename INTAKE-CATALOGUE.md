# INTAKE CATALOGUE — every input a town could have, and where you get it

> **What this is.** The cross-domain answer to *"what goes into pouring a town, and where does a
> person obtain it?"* — deliverable #1 of `BRIEF-intake-manifest.md`. Four domains: cartograph
> render-side · arborist · meteorologist · content/player.
>
> **The governing frame** (Jacob, 2026-07-20): **Lafayette Square is *the* final-Boss version of the
> dataset** — the complete aspirational target, not an outlier. A town's filled rows are a *progress
> bar toward LS*. The **panel** lists every row for every town; the **render** shows only what has
> actually been acquired. Where LS's artifact was hand-made, the row's acquisition is **a doc**
> (§2.1a of the brief), not a dataset — and where that doc doesn't exist yet, writing it is the work.
>
> **Standing constraint** (`BRIEF §4`): every input is a **local file**; a pour must be reproducible
> with the network unplugged. Fetching *acquires* a file once; it is never how the pipeline reads.
>
> ⚠️ **Verification status.** In-repo claims (paths, guards, licence files, on-disk counts) are
> **code-verified**. External URLs/licences are marked **[unverified]** where the specialist could not
> confirm them live — **confirm before any of this ships on a panel.**
>
> ⭐ **Two are now confirmed, because they ship on a PUBLIC surface** (the visitor attribution,
> 2026-09-01). They live as structured `licence` fields in `cartograph/intake-rows.mjs`, not as prose
> here — one home per fact, and the credit is generated from them:
> `node cartograph/bake-sources.js --look=<id> --scene=<id>`.
> ⛔ **One was WRONG in this repo and the correction is the lesson: Microsoft's ML footprints are
> CDLA Permissive 2.0, NOT ODbL.** `intake-rows.mjs` had said ODbL since it was written, and a web
> search still answers ODbL — the dataset's own `LICENSE` file does not. `fetch-msbf.js:27` pulls
> `GlobalMLBuildingFootprints`; the genuinely-ODbL Microsoft set is `USBuildingFootprints`, a
> different repo we never fetch. **Read the licence at the source, from the bytes, or do not state
> it** — a guessed licence on a public page is the one error that cannot be walked back quietly.
>
> *Produced 2026-07-20 by Boz + three dispatched specialists: **Cambium** (arborist), **Fathom**
> (meteorologist), **Ledger** (content/player). Cartograph render-side enumerated by Boz — it lives in
> `BRIEF-intake-manifest.md §5` and is not duplicated here (one home per fact).*

---

## 0. ⛔ THE HEADLINE FINDING — the LS-bleed is the kit's systemic defect

Every domain found it independently, without being told the others existed. **Absence does not degrade
to nothing — it degrades to Lafayette Square.** That is a direct violation of the aspirational model
("the system just doesn't show them"): a bleed doesn't show a *missing* feature, it shows *someone
else's*.

**Eight verified sites** — full detail + the excision plan in **`BRIEF-ls-bleed-excision.md`**.

| # | Site | What bleeds | Severity |
|---|---|---|---|
| 1 | `cartograph/bake-lamps.js:99` | LS's 80 lamps into any town with no lamp data | HIGH |
| 2 | `arborist/bake-trees.js:427` | LS's `park_census.json` — another town bakes LS's trees under its own name | HIGH |
| 3 | `arborist/bake-trees.js:430` | LS's species map — foreign species routed through a St-Louis collapse table | HIGH |
| 4 | `arborist/bake-trees.js:69,688` | **module-level, unconditional** — LS's lamp positions stamp `lampGlow` on **every tree of every scene**, evaluated in that scene's own frame. No override flag exists. Same file as #1, entering by a second independent door | MED (night-only, cosmetic) |
| 5 | `src/instance.js:47` | `INSTANCES[lookId] \|\| INSTANCES[DEFAULT_LOOK]` — an unregistered look silently wears LS's identity, geography, park label and tax rate. ⛔ **Worse than catalogued: it CASCADES INTO SIX RENDER SITES** (2026-07-21) | HIGH |

> ⛔ **Bleed #5 is not only an identity bleed — expanded 2026-07-21.** Six render gates test
> `INSTANCE.lookId === 'lafayette-square'`, so an unregistered look flips **all six at once**:
> `Scene.jsx:860` (the Gateway Arch) · `LafayettePark.jsx:848` (park lake, grotto, bridge, fence) ·
> `LafayettePark.jsx:803` (park title) · `StreetLights.jsx:74` (LS's 80 lamps) · `lampLightmap.js:23`
> (their baked pools) · `LafayetteScene.jsx:106` (LS's per-building overrides). Jacob previewed Łódź
> and found **the St. Louis Gateway Arch standing in it, over Lafayette Park's water**. Every gate was
> correct; the identity beneath them was wrong. Fixed by registering `src/instances/centrum.js`
> (`103d7224`). ⚠️ **`altadena` and `toy` are still unregistered and still carry this.**
| 6 | `cartograph/pipeline/hydrate-anchor-cards.js:28` | **LS's latitude (38.616°N) → every town's sky.** See §3.0 | HIGH — **live and wrong on Łódź today** |
| 7 | `cartograph/bake-content.js:118` | *(FIXED `adc03f32`)* MSBF-only join → no OSM pour joined any geometry | — |
| 8 | `InfoModal.jsx` / `LegalPage.jsx` | LS prose + **State of Missouri governing law** rendered on a Polish deployment | HIGH — legal, not cosmetic |

**Recommended schema consequence** (Cambium): the manifest's absent-state column must be a hard
three-way — `honest-zero` / `documented-fallback` / **`⛔ LS-BLEED`**.

**The good pattern to copy**, already in-repo: `cartograph/tree-bake-inputs.mjs` returns `null` on a
missing census — *"an HONEST ZERO, not an error"* — and `bake-trees.js:408` defaults `heroLook` to
`null → sceneName` with the comment *"never a literal 'lafayette-square', which would tier a poured
scene's trees against LS's camera in LS's coordinate frame (garbage)."* Someone already fixed this
class here; #4 is the one they missed **in the same file**.

---

## 1. ARBORIST — *Cambium*

### 1.1 Census side (WHERE + WHICH trees)
Four wells, unioned by `bake-trees --placements` (`cartograph/tree-bake-inputs.mjs:100-105`). They are
**spatially disjoint layers of one census**, not alternatives.

| Input | Path | Unlocks | Absent | **Acquisition** |
|---|---|---|---|---|
| **Municipal tree inventory** — per-tree species, DBH, condition | `clean/park_trees.json` (layer 1) · `clean/forest_park_trees.json` (layer 4, richer species) | `source:'city-inventory'`; **measured `dbh`** → Designer sizing + size/age benchmark; the empirical mix that becomes the roster | drops out (honest) | **US:** city/county ArcGIS FeatureServers, free, no key (LS/HPDM use St. Louis `FORESTRY_TREES/MapServer/{1,4}`). Equivalents: NYC Street Tree Census, Chicago, SF, Seattle, Portland, LA, Boston, Philadelphia — typically ODC/public-domain, local copy fine. **Non-US:** Berlin *Baumkataster*, Amsterdam/Rotterdam bomen, Melbourne Urban Forest, Vancouver/Toronto, Warsaw `api.um.warszawa.pl` **[unverified]**. ⭐ **`opentrees.org` aggregates several hundred municipal inventories globally into one schema — best single starting point [unverified]**. ⚠️ **Many towns have none** — suburban/county land and most of Europe outside big cities. Then: a **public-records request** to the municipal forestry contractor *is* the procedure (HPDM's = Clayton's unpublished Davey inventory — `[[project_hpdm_tree_census_jurisdiction_gap]]`) |
| **OSM tree points** | `clean/osm_trees.json` | real positions where no municipal census reaches; species mix-*draped*, not read | drops out | **Overpass API**, global, **ODbL**, permanent copy w/ attribution. Useful tags: `species`, `species:wikidata`, `genus`, `leaf_type`, `leaf_cycle`, `circumference`, `diameter_crown`, `height`, `natural=tree_row`. ⚠️ **Overpass 406s the default python-requests/curl UA — send a real User-Agent** (`TREE-INTAKE.md §2`) |
| **Canopy raster** | `raw/canopy.tif` → `clean/derived_trees.json` | synthetic fill in parks/yards no point census covers; `source:'derived'`, no dbh | no fill — **a legitimate opt-out, not a defect** (LS ships real-only) | **US: NLCD Tree Canopy Cover (USDA FS / MRLC)**, 30 m, public domain. ⚠️ **WCS GetCoverage 404s for CONUS TCC — use WMS GetMap `format=image/geotiff`, and discover the versioned layer name from GetCapabilities** (handled in `scripts/16`). **Non-US: ESA WorldCover 10 m** (CC BY 4.0, S3 COGs — the intended swap-in per `TREE-INTAKE.md §5`) or **Hansen/UMD Global Forest Change** **[unverified]**; Copernicus HRL Tree Cover Density for Europe **[unverified]** |
| **Species routing map** | `tree-species-map.json` (+ `tree-mix.json` shares) | every placement resolving to a real library species | ⛔ **LS-BLEED #3** | **DERIVED** from the census histogram by `scripts/15`. ⚠️ But the collapse table inside it is **hand-authored and St-Louis-flavored**; `TREE-INTAKE.md §5.4`: *"If no municipal census, the mix needs a hand-authored seed — audit the table per region."* **Procedure where none exists:** the city's approved street-tree planting list + USDA hardiness zone + a state extension urban-tree guide → hand-write a ~18-species mix with weights |

*Also read but **derived**, not acquirable:* `neighborhood_boundary.json`, `public/baked/<scene>/shape.json`, `clean/map.json`. ⚠️ No `shape.json` → the bake falls back to the retired paint mask which *"cannot see the road and will scatter trees into the carriageway"* — loud-on-purpose, not a bleed.

### 1.2 Asset side (WHAT a tree looks like)

**⭐ B1 · Chassis — the manifest's cost centre, and it is OFF-DISK.**
Vendor tree GLBs. `arborist/ORIENTATION.md`: *"A tree's identity is mostly its branch structure — and that's the one thing you can't compose."* You pick from ~241; you never grow one.
- **Verified:** `.gitignore:188` ignores `botanica/`, `:209` ignores `public/trees/`. **`git ls-files` returns 0.** A fresh clone has **zero chassis and zero vendor stock** (80 dirs exist on this machine only). Deliberate policy — multi-GB, regenerable, non-redistributable.
- **Provenance** (code-verified from `manifest.json#sourceFile` + `low-poly-mapping.json`): **CGTrader "Low Poly Tree Collection"** (~21 product-ID folders), `forest-pack/`, `real-trees-pack/`, one-off buys (magnolia, european-linden, honey-locust, sugar-maple).
- **Licence:** standard marketplace terms permit use in a rendered product, **forbid redistributing source assets** — which is exactly why they're gitignored.
- **So a new operator must buy their own.** CC0 alternatives worth naming: **Quaternius** nature packs, **Poly Pizza**, Sketchfab CC0/CC-BY filter **[unverified]**. Open scanned source for the parked LiDAR track: **FOR-species20K, Zenodo record 13255198** (cited `arborist/README.md:139`).
- **Procedure:** buy/gather 20–40 GLBs covering the 9 habits (`vase · columnar · oval · spreading · weeping · multi-stem · pyramidal · rounded · irregular`) → drop under `botanica/trees/<pack>/` → `node arborist/survey-deleaf.js` → `node arborist/ingest.js` → **the tagging gauntlet**: assign 1-of-9 habit per chassis **by eye**, ~241 items, **~5 done** (`[[project_chassis_tagging_gauntlet]]`). That afternoon of human judgment is an unavoidable line item.

**B2 · Bark — the cheapest, most replicable row in the whole manifest.**
`public/textures/bark/<ref>/` — 9 refs, **tracked in git** (52 files). ✅ **Fully open, verified from in-repo LICENSE.txt:** **ambientCG** (`Bark003/004/007/012/015`) and **Poly Haven** (`bark_brown_01`, `bark_platanus`, `chinese_cedar_bark`, `chinese_hackberry_bark`) — all **CC0 1.0**, no attribution required, permanent copy explicit. ~9 downloads, zero cost, **globally applicable — bark doesn't vary by town.**
⚠️ Absent → the bark *knobs* (tint/UV/roughness/jitter) are uniforms keyed by a per-species manifest entry, so **no entry → they silently do nothing**. A dead-knob, not a bleed. Open: birch's salmon river-birch colour + 2nd mask channel unfilled.

**B3 · Leaf shape packs.** `public/textures/leaves/shapes/<pack>/` — 18 packs, **tracked**. Hi-res sources (`assets/botanical-reference-hires/`, `assets/leaf-packs-2026/`) are **gitignored**.
✅ **Absence is honest and visible — the good pattern:** missing packs render as **dimmed "needed" plates**, so the Salon grid doubles as its own coverage map (`arborist/NOTES.md:68`). ~6 bases empty: `fan, compound, fine_compound, palmate_compound, tulip, short_needle`.
**Acquisition, both verified in-repo:** (a) **ambientCG LeafSet001/004/005/007/010/012/013/016/019 + Leaf001**, CC0 (`arborist/SPEC.md:52`), README pre-tags each pack to a morphology. (b) **Hand-scanned by Jacob 2026-06-19** — `meta.json#source.vendor` confirms `american_sweetgum`, `bigleaf_maple`, `california_black_oak`, `eastern_black_oak`…: ~20 physical leaves flatbed-scanned per species, composited by `scratch/compose-leaf-packs.mjs`.
⭐ **Procedure for a new region — genuinely required, not optional:** a Łódź pour needs European leaf morphologies the STL packs don't carry. *Pick the ~10 morphologies your regional mix needs → pull what ambientCG covers → for the rest, go outside with a bag and a flatbed scanner, collect ~20 leaves of a species, scan on white, key out the background, run `compose-leaf-packs.mjs`.*

**B4 · Dossiers + rubric.** `arborist/rubric.json` (19 axes + similarity matrices) + `arborist/dossiers/*.json` — **only 10 species exist**; the LS roster is ~18–20. **HAND-AUTHORED; there is no downloadable dossier corpus.**
✅ Degrades gracefully — `mature-heights.json` is the explicit STOPGAP for `normalizeScale`, then per-category `TARGET_HEIGHT`. No bleed.
**Authoring inputs:** USDA PLANTS Database · USDA FS *Silvics of North America* · state extension urban-tree guides · **i-Tree Species** (USFS, free) · GBIF/Wikidata for binomials · non-US: Euforgen distribution maps, a national flora **[all unverified]**. **~20 min/species**, filling `_SCHEMA.md`'s axes from the rubric's closed vocabulary. ⭐ **`rubric.json` is region-neutral — only dossiers re-author per town, never the rubric.**

**B5 · Reference plates.** `arborist/references/<id>/sources.json` ×10 — **manifests only, `downloaded:false`, `ratified:false`.** ✅ Fully open: every one of the 30 URLs points at **Wikimedia Commons** category pages, each with a hand-written `identityNotes` distinguishing look-alike species. Per-image CC0/CC-BY/CC-BY-SA.
⚠️ **Standing-constraint violation** — pointers, not local files. Mark `acquired: pointer-only` and give the row a **Fetch** button (`BRIEF §2.2b`).

**B6 · Look roster** — `design.json#/trees`. **DERIVED** by `scripts/15`. ⚠️ `treeAtlasMaterial.js` **hard-requires** `trees-atlas.json` — a missing atlas **throws and renders nothing**. ⚠️ Roster authoring is LS-hardwired: `syncLookRoster('lafayette-square')` is a literal at `generate-salon.js:1751` and `generate-procedural.js:1220`, so **the Grove UI cannot seed a non-LS roster at all**; `scripts/15` bypasses it. (Writes *to* LS — not a bleed, a productization gap.)

**B7 · Curation state** — `_chassis-curation.json`, `state/<id>/compositions.json`, `part-index.json`, `roster-name-canon.json`, `low-poly-mapping.json`, `species-map.json`. All **tracked**. **Pure human judgment; no net source, ever.** Chassis curation + rubric carry over globally; compositions re-author per species.

**Soft bleeds (authoring/UI only, do not reach the render):** `roster-coverage.js:48` (`DEFAULT_SCENE` param) · `serve.js:1056` (`GET /inventory` reads LS's census unscoped) · `serve.js:959,1041` (Salon publish + variant-rating re-bake **LS**, unconditionally — so authoring from a Łódź Look re-bakes LS's placements) · `serve.js:1106`.

---

## 2. METEOROLOGIST — *Fathom*

### 2.0 ⛔ Bleed #6 — the canonical sky mosaic is baked at St. Louis's latitude
`cartograph/pipeline/hydrate-anchor-cards.js:28-30` hardcodes `LAT = 38.6160 / LON = -90.2161 /
TIMEZONE_OFFSET_HOURS = -6`, under a comment reading *"keeping this script self-contained… **Update
both if a different instance is ever added.**"* **Three instances have been added; it was never
updated.** `skyGrid.js:160` — `ANCHOR_CARDS = ANCHOR_CARDS_PROCEDURAL`, no per-Look variant exists.

**Verified live-wrong on Łódź (51.752°N — 13° north of LS):** `CelestialBodies` computes the *real*
sun from the instance's true lat/lon via SunCalc, but the dome is painted from the St. Louis table. So
**the sun sets while the sky is still mid-afternoon blue, and the dome goes black ~90 min after the sun
is already down.** A day-length error, not a tint. It grows with distance from 38.6°N; a
southern-hemisphere town would get inverted seasons in the sky (§2.3).

**And Bleed #2 (data):** all **16 of 16** sky/atmosphere channels in Łódź's baked `scene.json` are
**byte-identical** to LS's — `sky · skyGain · dirSun · dirMoon · ambient · hemi · warmth · fill · mist
· halo · stars · milkyWay · constellations · exposure · clouds · horizon`. Łódź even carries LS's
*authored* `skyGain` curve (0.65/0.9/1.0/1.0) where `bake-scene.js:110` says unauthored Looks emit flat
1.0. Same shape as the `landscape` bleed already fixed at `bake-scene.js:134` — *"the 'accidental
reading/load-in' the intake↔Stage separation exists to prevent."*

⭐ **The fix needs NO acquired data** — the generator already builds the whole 4×24×5 table from
`lat/lon/tz` + SunCalc. ⚠️ **But it is not a constant swap:** `ANCHOR_CARDS` is a static module export
consumed by pure functions (`buildMosaicForDate`, `resolveSkyAtMinute`, `flankingAnchors`) across 5
files. Per-Look means deciding **where the cards live and how the render reaches them** (most likely
baked into `scene.json` + rewired consumers) — a render-path change, **eye-gated across all 7 TOD
slots**. Scoped, not started, 2026-07-20.

**Bleed #3 (latent, hemisphere):** `useCalendar.js:20` correctly swaps seasons for `lat < 0`, but
`skyGrid.js`'s `SKY_ANCHOR_DOY` / `flankingAnchors(doy)` take **no latitude** — northern day-numbers
hardcoded. A trap laid for town #4.

### 2.1 COMPUTED — no acquisition at all (~60% of the domain)
⭐ **The strongest possible answer for an any-town kit, and worth stating loudly on the panel** — the
naive assumption is that sky data must be fetched. All of these already work correctly for an
arbitrary town because they read `INSTANCE.geography`:

**Sun position** (`SunCalc.getPosition`) · **sunrise/sunset/solar noon/twilight** (`SunCalc.getTimes`) ·
**moon phase/illumination/altitude** · **celestial-pole tilt** (`rotation-x = latRad − π/2` — southern
stars wheel correctly) · **local sidereal time** · **season from day-of-year + hemisphere** ·
**day-of-year → `uDayOfYear`** (drives arborist phenology) · **the sky mosaic itself** (once §2.0 is
fixed).

**Their only input:** `lat` / `lon` / IANA `timezone`, from `src/instances/<look>.js geography{}`,
transcribed from `cartograph/data/<scene>/geography.json`.
⚠️ Absent → falls through `DEFAULT_LOOK` to **LS's geography** (bleed #5). ⚠️ `useWeather.js:112`
hourly fallback hardcodes `-21600` = **CST**.

### 2.2 ACQUIRED — already local, and **kit-global** (acquire once, never per-town)
Mark these "kit-global, already acquired" so town #3 never sees them as work.

| Input | Path | Source |
|---|---|---|
| **Bright-star catalogue** (~523 stars, mag ≤ 4.0, RA/Dec/mag/B–V) | `src/data/bright_stars.json` | **Yale BSC5** via VizieR/CDS, or **HYG database** (CC BY-SA) — repo fields (`ra`,`dec`,`mag`,`ci`) match HYG's schema exactly |
| **Constellation figures** | `src/data/planetarium/constellations.json` | **Stellarium** `constellationship.fab` sky-cultures (GPL/CC) or **IAU** official data |
| **Named stars** | `src/data/planetarium/named_stars.json` | as above |
| **Planetary orbital elements** (Keplerian) | `src/data/planetarium/planets.json` | **JPL SSD "Approximate Positions of the Major Planets"** — US-gov public domain |

### 2.3 ⚠️ LIVE NETWORK — the kit's one hard doctrine violation
**Open-Meteo**, queried live at `src/hooks/useWeather.js:9`, polled by `WeatherPoller.jsx`. Supplies
WMO code, cloud cover, precip, temp, humidity, pressure, visibility, wind, radiation + 48 h forecast.
Drives **everything**: Condition selection, Degrees response, sky darkening, rain/snow/wetness/lightning,
cloud advection, **tree sway**.

- **The pour is clean** — no bake step touches it. **The player is not.**
- Absent → `catch (e) { /* Silently ignore */ }` + zeroed initial state = **a cloudless, windless, permanent-fair sky forever.** ✅ Degrades to *nothing*, which is the correct direction — not a bleed, but a different violation.
- `public/clouds/fixtures/` is specified in `ARCHITECTURE.md`, marked ⛔ not populated in `STATUS.md`, and **does not exist on disk.** There is no offline weather path at all.
- ⭐ **Cleanly closable:** Open-Meteo is **CC BY 4.0 — redistribution permitted, including commercially**, with attribution. Their **Historical Weather API** serves **ERA5 reanalysis 1940–present, gap-free, global**. So **one fetch per town** yields a local year of that town's real hourly weather → the player runs offline by loop or date-match. **One acquisition closes both the doctrine violation and the missing cloud-regime input.**

### 2.4 HAND-AUTHORED — and what could stand in
| Artifact | Per-town? |
|---|---|
| **The Teapot** — 52 cloud presets (`public/clouds/presets.json`) | **Global**, correctly — cumulus is cumulus everywhere |
| **The Almanac** — 16 Condition rules (`public/clouds/almanac.json`) | **Global.** ✅ Verified keyed on *physics*, not St. Louis — `{"cloudCover":[0.85,1],"precipMmHr":[0,0.5],…}`. Genuinely portable, no bleed |
| **The Modulators** — 7 continuous deltas | **Global.** "Tornado green" / "wildfire smoke" are *American idioms* — harmless (signal-gated, never fire in Łódź) but worth a note |
| **Sky & Light TOD channels** (14) | Per-Look in principle, **LS's in practice** — §2.0 bleed #2 |
| **Cloud preset per TOD slot** | Every Look carries `{"preset":"auto"}` → defers to the Almanac. No bleed |
| **Wind** | Live from Open-Meteo; authored values are the fallback |
| **Tree phenology anchors** (`annualCycle` day-numbers) | ⚠️ **Latent bleed** — authored northern-temperate on a Missouri calendar (`day:105` spring buds, `day:288` fall peak). Łódź/Lisbon/Brisbane leaf out on St. Louis's schedule |

**Substitutes, in increasing effort:**
1. ⭐ **Sky mosaic — no data needed**, just parameterise the generator (§2.0). *Highest-leverage item in the report: converts the largest hand-authored surface into a computed one at zero acquisition cost.*
2. **Climate character → WorldClim v2.1** — ~1 km global grids: monthly tmin/tmax/tavg, precip, **solar radiation, wind speed**, vapour pressure + 19 bioclim variables, plain GeoTIFF zips from `worldclim.org/data/worldclim21.html`. One pixel at the town's lat/lon = a 12-number-per-variable climate fingerprint → defensible defaults for turbidity, base wind, seasonal warmth, mist frequency. v1 is CC BY-SA 4.0; **v2.1's licence could not be confirmed — check the page [unverified]**.
3. **Cloud regime + offline fixture → ERA5**, via Open-Meteo's archive (CC BY 4.0, verified) or the **Copernicus CDS** directly (`total_cloud_cover`, `low/mid/high`, 1940–present). Łódź is overcast far more of the year than St. Louis, and that one statistic should visibly change the install's default mood. **Same file solves §2.3.**

**Supporting sources [unverified, confirm before shipping]:** NOAA NCEI 1991–2020 Climate Normals (US, public domain) · national met services for non-US — **IMGW (Poland)**, DWD, Met Office MIDAS, Météo-France · NOAA **GHCN-Daily** (global) · phenology: **USA-NPN** (CC0) + **PEP725** (Pan-European) — though the kit-shaped answer is to **derive it from growing-degree-days** off WorldClim/ERA5, converting another acquisition row into a computed one · aerosol/haze: Copernicus **CAMS** AOD or NASA **MERRA-2** · **light pollution: NOAA VIIRS night-lights** (public domain; Falchi's World Atlas is purpose-built but research-terms) — **not currently an input at all**, and a genuine aspirational row: it would make a rural town's sky properly spectacular and a city's properly washed out.

### 2.5 Domain gaps worth listing as aspirational-but-honest
**Locale** — `useWeather.js:9` hardcodes `temperature_unit=fahrenheit`; `useSkyState` stores `temperatureF`. Derivation source is `INSTANCE.geography` — computed, not acquired · **Lightning is unauthorable** — `LightningDriver` reads `directive.lightning.rate` but `almanac.json` authors no `lightning` field, so it never fires from a Condition · **Wet surfaces don't show in the canary** · **The volumetric renderer isn't what ships** (`SKY_MODE` defaults `'cheap'` → `CloudDome`; `Atmosphere` only under `?sky=volumetric`) · ⚠️ **`BACKLOG.md:235` asserts "Meteorologist already owns per-Look climate fields" — NOT TRUE today**; there is no per-Look climate record anywhere. That parked idea (`BACKLOG.md:228-255`) **is precisely this intake manifest**, and is the natural home for the WorldClim/ERA5 fingerprint.

---

## 3. CONTENT + PLAYER — *Ledger*

Rows carry a **kind** axis the manifest must preserve: **JOINED** (machine-derivable) · **AUTHORED**
(operator hand-work) · **CLAIMED** (only the neighborhood's own people can supply it) · **CONFIG**
(per-installation declaration).

### 3.1 Layer 0 — installation profile
`src/instances/<look>.js` (3 exist) — `lookId`/`name`/`domain`/`contentRoot`/`skyMode` · `geography{}`
(hand-transcribed from `geography.json`) · `locale{}` (⚠️ **declared, no consumer — grep confirms no
i18n service reads it**) · `profile{}` (population/founded/landmark/tagline/about).
✅ Profile degrades correctly — `fmtStat` renders `—` for null.
**Acquisition:** population → US Census ACS block-group; EU → Eurostat / national office (**Poland: GUS**). Founding/landmark/district → Wikipedia/Wikidata + the NR nomination. `about` → **AUTHORED prose**.
⚠️ **A4 is a live duplication defect:** `content/profile.json` is **never read by the reader** (grep: comments only); `bake-content.js:790` declines to regenerate it. Layer 0 exists twice and drifts — Łódź's `profile.json` carries `cityState`/`established` the instance file doesn't. (`feedback_dual_hydration_paths_drift`)

### 3.2 Layer 1 — roster (JOINED)
`content/roster.json` — one record per slab building; machine-joined by `bake-content.js`.
- **Assessor parcels** (`raw/stl_parcels.json`, `stlco_parcels.json`) — ⭐ **the single richest content well**: address (the join spine for NR + the bare-listing gate), zoning (drives **both** neon colour and search category), sqft/units/value/year_built/vacant/historic. **US: reliably exists** — every county has an assessor, most publish ArcGIS FeatureServer or Socrata. ⚠️ **Outside the US this well often does not exist in this shape** — EU **INSPIRE Cadastral Parcels** gives geometry + parcel id but typically **not** valuation/zoning/year-built. **No Polish equivalent verified**; Łódź has 0 parcel matches.
  > ⭐ **CORRECTION (2026-07-20, later the same session).** The line above was read as "no assessor ⇒ no addresses," and that is **wrong**. Addresses do not require a parcel authority — outside the US they live in **OSM `addr:*`**. Measured in Łódź's own already-fetched `raw/osm.json`: **3,982 `addr:street`** + 3,973 `addr:housenumber` + 1,905 `addr:postcode` across 10,602 buildings. Address is the join spine for the bare-building atlas and the NR match, so this is load-bearing: **the well exists globally, it is just sourced differently.** What an assessor uniquely provides outside the US is *valuation · zoning · year_built · units* — not address. Split the row accordingly.
- **Land-use code table** (`content/county-land-use-codes.csv`) — decodes assessor codes. Absent → a numeric-range heuristic **hardcoded to STL city/county ranges**. Published alongside the parcel layer; **per-jurisdiction, re-acquired every town.**
- **National Register inventory** (`content/nr-inventory.json`; LS's source is the OCR'd nomination in `inventory/`, 7 files) — style/contributing/architect/period/`nps_ref`. **Tier ③, US-only**: NPS **National Register** nomination PDFs are free at NPGallery, but the per-building "Exhibit 5" table must be **OCR'd and parsed**. State SHPO surveys are the wider net. ⚠️ *"does not exist for a normal town"* (`NEIGHBORHOOD-INPUTS §4.1`). **Non-US analogues differ in kind:** Poland **NID rejestr zabytków**, UK **Historic England Listed Buildings** (open, per-building, well-structured), France **Mérimée** **[unverified]**.
- **Render fields** (`wall_material`, `roof_material`, `stories`, `zoning`) — ✅ read back **out of the baked slab**; derived, never hand-collected. Correct architecture.
- **Overrides** — `content/roster.overrides.json`, AUTHORED.

### 3.3 Layer 2 — listings (JOINED base + AUTHORED override)
`content/listings.json` → the reader's `landmarks`. Drives place cards, search, Society tab, **neon colour + open-now**, Places stat.
**Two proven bases:** **OSM POIs** (`classifyPoi` maps ~45 amenity/shop/leisure/tourism/office tags → the Society taxonomy) and **Overture Places** (Łódź, 84 records, declared via `meta.baseSource:"overture"`).
**Hand-authoring** — `listings.overrides.json` (`adds`/`patches`/`drops`; Łódź: 8 adds, 19 patches): structured `hours`, `description`, `history`, `amenities`, `photos`, `menu_url`. Web research per business. ⚠️ **Menus** (`content/menus.json`) AUTHORED, ~25% coverage at LS.
⭐ **Photos** — `content/photos/<slug>/NN.jpg`, **instance-relative, no leading slash**, resolved by `assetUrl.js:22`. Business site/socials (credit their domain) · **Wikimedia Commons** for landmarks, credited with `credit_url` to the file page. ⛔ **Never hotlink** — external page-URLs render broken and fail zip-and-send; all self-hosted.
⚠️ **The verified-absent proof:** an HTTP **200 + `image/jpeg`** from Facebook is frequently the **default grey silhouette** (md5 `3e8f62364b0f574a7d18a6c8b26730f1`). Every programmatic check passes. **This is why image rows need a thumbnail, not a checkmark** (`BRIEF §2.2c`).
⭐ **Logos** — `content/logos/<slug>.<ext>`, rejects parked in `logos/_alt/`. **`null` is a FINDING, not a gap** — Łódź documents each null with the reason it was searched and rejected. **That distinction belongs in the schema.**
**Facade mapping** — `src/data/facade_mapping.json` (LS only), from **Mapillary** street-level imagery + a matching pass.

### 3.4 CLAIMED — no acquisition endpoint exists, by design
Guardian claims · residents/residence claims · check-ins/townie ladder · bulletin posts/comments/DMs · reviews/events/handles/QR designs. All live in the Apps Script → Sheets backend, **now per-look tenanted** (`api.js:154,169` set `look: INSTANCE.lookId`; `Handles` stays global).
⭐ **The manifest must show these as "opens empty, fills over time" — never as a gap.** The app *is* the acquisition tool.

### 3.5 ⭐ The join-key invariant — HOLDS, and is well-defended
Verified: Łódź's slab carries `osm-39524935`-style ids; its 84 listings key on `building_id:"osm-147534720"`. Content loads *alongside* the slab, never consumed by the bake. Two load-bearing defences worth naming in the manifest:
1. **The external-base guard** (`bake-content.js:730-747`) — declared in *data* (`meta.baseSource`), not by scene name. **This is what saved Łódź's 84 listings**; without it the 2026-07-20 re-fetch took them to 5. Correctly generalized.
2. **Anchor re-resolution** (`applyListingOverrides`) — hand-added listings re-resolve `building_id` from a stored anchor on *every* run, dropped with a warning if it falls outside the baked set. This is what lets a re-poured skeleton keep its content.

**Threats:** T1 roster/listings incoherence (from the now-fixed join) · T2 the two Layer-0 homes (§3.1) · **T3 — LS is the one installation with NO `content/` dir at all**: render and content still fused in one 1.26 MB `src/data/buildings.json`, and `bake-content.js:693` refuses it without `--force`. **LS therefore cannot demonstrate the invariant it defines**; schema changes must be hand-migrated into it · **T4 — asset-root discipline is convention, not enforcement.** `NEIGHBORHOOD-INPUTS §5.1.2`'s litmus ("if removing every other installation would break this one, the boundary is violated") is prose only; **breached once already (2026-07-05, HPDM images into LS's `public/photos/`).**

### 3.6 The universal-player gate — what breaks town #3
Measured against `HANDOFF-blank-app-instance-decoupling.md`'s *"grep the reader for installation-specific literals → zero."*

- **🔴 G1 · `InfoModal.jsx` has ZERO `INSTANCE` reads** — 7 paragraphs of LS prose. Łódź runs `info` (modules default-ON), so **a Polish visitor reads about the Lafayette Square Conservancy**, including *"If you wouldn't say it to someone on the sidewalk in Lafayette Square, don't post it here."* The single most embarrassing surface.
- **🔴 G2 · `LegalPage.jsx` is LS/Missouri** — "within Lafayette Square, St. Louis" · the LS delivery zone by street name · **"State of Missouri" governing law** · `← lafayette-square.com`. Same in `CourierOnboarding.jsx` + a **US-state-only** dropdown. `INSTANCE.legal` exists and Łódź populates it (`governingState:'Łódzkie'`, `salesTaxRate:0.23`) — **nothing reads it for the prose.** Łódź opted *into* delivery, so this is **legal exposure, not cosmetics.** The instance file names it itself: *"a KIT bug to instance-derive, NOT a reason to opt out."*
- **🔴 G3 · St. Louis zoning is the classification engine for two unrelated systems** — the STL A–J single-letter table exists in **four copies**: `useListings.js:47` (search category), `SceneNeon.jsx:77` (**neon colour**), `PlaceCard.jsx:45`, `bake-content.js:342`. ⚠️ **Two of them disagree** (`D`→residential vs `D`→commercial). Any town without STL zoning falls to `|| 'residential'`: every building residential, every tube sage.
- **🟡 G5** unregistered look → LS (bleed #5) · **🟡 G6** `index.html` hardcodes LS favicon/title/OG/Twitter — needs the build-time inject (Phase 4, unwritten) · **🟡 G7** `lsq-*` localStorage namespace collides across installations on one origin · **🟡 G8** `PlaceCard.jsx:148` `FLEUR_BG = '#0055A4' // St. Louis flag blue` renders on Łódź.
- **🔴 G9 · ⛔ NOT correctly guarded — this row was wrong (corrected 2026-07-21).** It claimed `LafayettePark`, `StreetLights` + `lampLightmap`, `GatewayArch` and `buildingOverrides` "are all LS-gated and no-op elsewhere." Two faults. **(a)** Every one of those gates reads `INSTANCE.lookId`, so all six fail together the moment a look is unregistered — see the bleed #5 expansion in §0. **(b)** `GatewayArch` was **not gated in the component at all**: the only check lived at the `Scene.jsx:860` call site, while `PreviewApp.jsx:1176`, `StageApp.jsx` and `CartographApp.jsx` mounted it bare. A gate at one of four mount sites is a gate three callers can forget. Fixed by gating inside the component on the RESOLVED look (`3146e6aa`) — Stage, Preview and Cartograph can each mount a look that is not the booted installation, so `INSTANCE.lookId` is the wrong thing to test there. **These do still belong on the manifest as "not-yet-portable features."**

✅ **What holds:** Phase 1 (identity/branding/geography), Phase 2 (data seam), Phase 3 (module gating, default-ON opt-out), backend tenancy, `assetUrl` instance-rooting, and `bake-labels` — which **closed a real hardwire**: `streetLabels.js`'s four hardcoded LS boundary-corridor names are gone; every town now gets its street names free from OSM `name` tags.
**The gate fails on Phase 4 (prose) + the two deep residuals (zoning taxonomy, `lsq-*`)** — plus G4, the join bug, which postdates the HANDOFF entirely and is now fixed (`adc03f32`).

---

## 4. ⭐ PROMINENCE — the cheap signals, the one-button rule, and the effort model

*(Jacob, 2026-07-20, late session. Three connected ideas: take every cheap signal · make each access
trigger a single button · rank buildings so the operator can choose how much town to build.)*

### 4.1 The cheap-signal inventory — measured, already on disk, currently discarded

Every count below is from **Księży Młyn's own already-fetched `raw/osm.json`** (10,602 buildings in the
wide fetch). None of it costs anything to acquire — it was paid for when `fetch.js` ran. The only cost
is reading tags the pipeline currently throws away.

| Signal | Count | Use |
|---|---|---|
| `wikidata` | **65** | ⭐ the strongest cheap prominence signal in existence — someone catalogued this building |
| `wikipedia` | **58** | an article exists about it |
| `name` | **503** | named ≫ unnamed, universally and language-independently |
| `tourism` | 35 | |
| `historic` | 32 | |
| `heritage` | 8 | |
| `building:levels` | **4,361** | height/prominence, free |
| `amenity` · `shop` | 238 · 111 | business presence |
| `addr:street` · `housenumber` · `postcode` | **3,982 · 3,973 · 1,905** | ⭐ **the address well** — see §3.2's correction |

**Sixty-five confirmed landmarks in Łódź that nobody had to research.** They are sitting in a file on
disk right now, unread.

**Four more that cost nothing beyond compute:**
- **Footprint area** — from `clean/map.json`.
- **POI count per building** — falls out of the listings join.
- ⭐ **Hero-path visibility** — which buildings the camera actually flies past. **No other product could compute this**, and for a first-time viewer it is arguably *the* prominence metric: it is what they will actually see.
- **Parcel morphology** — lot area · footprint:lot coverage · frontage:depth · corner-vs-interior · abutment. This is **Jacob's own parked idea** (`cartograph/BACKLOG §LATER`, 2026-07-07) — same machinery, second use.

### 4.2 ⭐ The one-button rule

> Jacob: *"we should write these access triggers into single buttons in the manifest."*

**Where a source has a programmatic endpoint, the row's acquisition is ONE BUTTON — not an
instruction.** The manifest is an *action surface*, not only a catalogue. This is what actually
delivers the admin-person bar (`BRIEF §7`): the difference between *"go to MRLC, discover the
versioned layer name from GetCapabilities, request WMS GetMap as geotiff"* and **`[Fetch canopy]`**.

**Button-acquirable** (endpoint exists — build the button, skip the doc):

| Button | Source | Licence |
|---|---|---|
| OSM landmarks / addresses / trees / lamps | Overpass (⚠️ real User-Agent) | ODbL |
| Building footprints | MSBF (`fetch-msbf.js` already exists) | ODbL |
| Canopy raster | MRLC WMS GetMap · ESA WorldCover | public domain · CC BY |
| Weather year (offline fixture + cloud regime) | Open-Meteo ERA5 archive | **CC BY 4.0, redistributable** |
| Climate fingerprint | WorldClim v2.1 | ⚠️ licence unconfirmed |
| Bark + leaf textures | ambientCG · Poly Haven | **CC0** |
| Reference plates | Wikimedia (URLs **already recorded** in the 10 `sources.json`) | per-image CC |
| Star catalogue · constellations · planets | HYG/BSC5 · Stellarium · JPL SSD | open · public domain |
| Wikidata/Wikipedia enrichment | Wikidata API | CC0 |
| Assessor parcels | per-jurisdiction ArcGIS/Socrata | varies — **needs a per-town endpoint field** |

**NOT button-acquirable** — these keep a doc (`BRIEF §2.1a`) or an uploader (`§2.2d`): chassis
purchase + the tagging gauntlet · leaf scanning for a new region · dossier authoring · the street
survey · photos + logos (research, then upload) · NR nomination OCR (*the PDF fetch is buttonable; the
Exhibit-5 parse is work*).

⭐ **Consequence:** the doc backlog shrinks. Several rows previously filed as "procedure to write"
become buttons instead. **Write the doc only for what a button cannot do.**

### 4.3 Prominence ranking — the effort model

**The problem it solves.** Content hand-work is the one genuinely *unbounded* cost in this catalogue —
~100–150 operator hours per town, with no principled stopping point. You cannot do 1,640 buildings and
there is no honest way to pick 60.

**The model.** Score every building from the §4.1 signals → rank → the operator works down the list and
stops wherever they choose. Effects:

- **Partial completion becomes graceful.** "The top 40 are done, and they are the 40 that matter" — rather than an arbitrary scatter.
- **The panel's progress semantic stops being demoralising.** Not *"3% of 1,640"* (reads as failure) but *"your top 50 are complete"* (reads as done).
- **The operator gets a dial they lack today: how much town do you want?** A demo pour takes the top 20; a real install works down until it stops paying.

**Vocabulary — use the existing word.** `useListings` already loads `'landmarks'`, and bare buildings
are the synthetic residue. So this is not a new concept: it is **deciding which buildings get promoted
from bare building to landmark, and in what order.** Do not introduce "importance" alongside
"landmark."

⚠️ **Two constraints that must hold:**

1. **The rank is a GUESS and every guess is overridable** (`NEIGHBORHOOD-INPUTS §0.0/§1.1`). A beloved corner bar scores near zero on every cheap signal — no Wikidata, no tags, small footprint. **The rank orders the work queue; it must never gate what can be filled.**
2. ⭐ **This is where "connect your neighborhood" earns its keep.** Residents know the ranking the data cannot see. Let them promote a building and you have captured a prominence signal **no dataset carries** — the single strongest argument for routing rows to the CLAIMED kind (§3.4) deliberately rather than by default.

## 5. ⭐ BUILDING FABRIC — the best source is REGIONAL, and we discard real data

*(Jacob, 2026-07-20 late: "the Księży Młyn neighborhood has more fulsome building scans." Verified —
he is right, and it inverts an assumption written into the pipeline.)*

### 5.1 ⛔ CORRECTION — "MSBF is better than OSM" is a US-shaped claim

`cartograph/fetch-msbf.js`'s header states MSBF is *"generally substantially more accurate than OSM's
older US imports — correct shape, correct scale, correct position."* **True for US OSM**, which is
largely a legacy TIGER-era mass import. **False for European OSM**, which is hand-mapped and often
cadastre-derived.

Measured footprint complexity (vertices per building ring, on disk 2026-07-20):

| Scene | Source | median | mean | p90 | max |
|---|---|---|---|---|---|
| `lafayette-square` | **MSBF** (ML-derived) | 5 | 6.1 | 10 | 59 |
| `ksi-y-m-yn` | **OSM** | **7** | **10.1** | 17 | 160 |
| `centrum` | **OSM** | **9** | **13.4** | 28 | 229 |

**Łódź's buildings carry roughly twice the geometric detail of Lafayette Square's**, and Centrum more
still. The pipeline prefers MSBF wherever it exists (`bake-buildings.js:60`, `msbf-*` else `osm-*`),
which is correct in St. Louis and would be **actively worse** in Łódź if MSBF's coverage reached it.

⭐ **Manifest consequence: the footprint row has NO single best source.** It is a **regional choice**,
and the current preference order encodes a US assumption. The row must expose the choice per town —
`buildingSource` already exists in the pour as a concept; make it an intake decision with the
provenance to justify it, not a silent coverage fallback.

*(This also corrects `BRIEF-intake-manifest.md §5.2`, which listed MSBF as the upgrade and OSM as the
degraded fallback — accurate for LS, wrong as a general rule.)*

### 5.2 ⭐ ROOFS — LS *guesses*; Łódź has real tags nobody reads

**Lafayette Square's roof shape is a heuristic.** `classifyRoofFor` (`cartograph/bake-buildings.js:165`)
infers `flat｜mansard｜hip` from `year_built` + `stories` alone — pre-1900 and 2–3 storeys → mansard;
pre-1920 and 1–3 → hip; else flat. A reasonable prior for a Second Empire district, and still a guess.
Its only override path is the manual `building-overrides.json`.

**The Polish hoods carry surveyed roof data in the OSM we ALREADY fetched, and nothing consumes it:**

| Tag | ksi-y-m-yn | centrum |
|---|---|---|
| `roof:shape` | **130** | **190** |
| `roof:levels` | **184** | **305** |
| `roof:material` | 11 | 20 |
| `roof:colour` | 14 | 54 |
| `building:material` | 155 | 162 |
| `height` (metres) | 40 | 351 |

⚠️ **The table above omits the biggest one: `building:levels` — 4,361 in ksi-y-m-yn, 1,736 of 2,954
in centrum.** Storey count is what makes a district read as a district, and it was being discarded
with the rest.

⭐ **This is close to free value** — no acquisition, the file is on disk, and the consumers already
exist. **Precedence: override → OSM tag → heuristic**, the same shape as the base-width chain
(custom → OSM → AASHTO), so it is the house pattern, not a new one.

⛔ **CORRECTION (2026-07-21, landed `35d6d9da`) — this section said the fix was that "`classifyRoofFor`
simply needs OSM `roof:shape` ahead of the heuristic." That is NECESSARY BUT NOT SUFFICIENT, and
anyone implementing it alone would patch the function and see nothing change.** The tags never reach
`classifyRoofFor`: `adaptMapBuildings` (`bake-buildings.js:39-65`), the sole path for every non-LS
scene, emitted `{id, footprint, size}` and dropped `tags` on the floor. Two further defects sat behind
it — the height guard tested `typeof tags.height === 'number'`, which can never be true of an OSM
string value (40 surveyed heights discarded in ksi, **351 in centrum**), and `bake-content.js:637`
back-solved roster storeys from `(centroidY − baseY)/3.5`, an inverted subtraction of two unrelated
quantities that pinned every poured building to 1.

⛔ **AND THE VISIBLE RESULT IS STILL NEARLY NIL, for a reason this section did not anticipate.** Of the
tagged roofs, most are literally `flat` (76 of 130 in ksi, 99 of 190 in centrum) — already the default,
so no change — and **`gabled`, the commonest pitched form in European housing (20 + 41), is not in the
renderer's vocabulary at all.** It falls through to a heuristic that returns flat, because poured
scenes have no `year_built` (no assessor outside the US). **Net visible change: 2 buildings in Księży
Młyn, 7 in centrum.** Teaching `buildingGeometry` a gable is the actual unlock — `HANDOFF-gabled-roofs.md`.
⚠️ `roof:shape` values are an open OSM vocabulary (`gabled`, `hipped`, `flat`, `mansard`, `gambrel`,
`pyramidal`, `skillion`, `round`…) and the renderer knows three. Map the vocabulary explicitly and
fall through to the heuristic on anything unrecognised — do not silently coerce.

### 5.3 ⭐ HERITAGE — `ref:nid` IS the Polish National Register, already in the fetch

§3.2 listed Poland's **NID rejestr zabytków** as an *unverified* analogue to the US National Register.
It is neither unverified nor remote — **it is tagged on buildings in data we have already pulled:**

| Tag | ksi-y-m-yn | centrum |
|---|---|---|
| `ref:nid` | 8 | **29** |
| `heritage` | 8 | 25 |
| `heritage:operator` | 8 | 29 |
| `historic` | 32 | **66** |
| `wikidata` | 65 | **120** |
| `start_date` | 8 | 22 |

So the historic layer that cost Lafayette Square a **136-page OCR'd nomination PDF** (`inventory/`,
7 derived files) arrives for Łódź as **ordinary OSM tags**. Not equivalent in depth — the NR nomination
carries per-building architect, style group and contributing status that `ref:nid` does not — but it
establishes *listed status* and gives a **`wikidata` join key** to fetch the rest programmatically.

⭐ **Manifest consequence:** the "historic inventory" row is **not US-only**, as §3.2 implied. It is
*differently sourced*: OCR'd nomination in the US, tag + Wikidata join in the EU. Both are rows; the
EU one is button-acquirable (§4.2) and the US one is not.

## 6. What this catalogue says about the kit

**The thesis holds, with three honest cost centres.**

✅ **Free / computed / already-acquired — the bulk of it:** ~60% of the meteorologist domain needs *two numbers, not a dataset* · bark and leaf reference are **CC0** · star catalogue, constellations, planetary elements are **public-domain and kit-global** (acquire once, forever) · OSM is **ODbL**, NLCD **public domain**, Open-Meteo/ERA5 **CC BY 4.0 with redistribution** · street labels now come free from OSM tags.

⚠️ **The three real costs:**
1. **Tree chassis** — purchased, non-redistributable, gitignored, **absent from a fresh clone**, and ~236 of 241 untagged. *A section of the manifest, not a row.*
2. **Hand-authored judgment** — dossiers (~20 min/species, no corpus exists), compositions, chassis curation, the species-collapse table.
3. **Content hand-work** — ~100–150 operator hours for a 60–100 landmark town, plus the CLAIMED rows that can never be acquired at all.

⚠️ **The two structural gaps:** the **LS-bleed class** (§0) and the **live Open-Meteo runtime dependency** (§2.3) — the only place a lit render depends on a corporate API being reachable, and cleanly closable.
