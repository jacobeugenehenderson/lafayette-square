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

> ### ⛔⛔ THE TWO POLISH SCENES ARE EXCISED — read every Łódź severity below through this
> **`centrum` and `ksi-y-m-yn` are gone** *(Jacob, 2026-08-13: "we made them for a pitch, we made the
> pitch, it is over"; escalated 2026-09-19 from chilled to EXCISED — out of the roster, the app and
> the git, and deleted from disk)*. Home for the ruling — and the only copy — is **`ROADMAP.md`'s
> scope ruling**; this is a pointer, not a restatement.
>
> ⛔ **There is no CHILLERED status left to report, and no list of these names anywhere in the code.**
> A town leaves scope by leaving `public/looks/index.json`; `checks/_scenes.mjs` enumerates DECLARED ∩
> MEASURABLE, so an absent town is excluded without being named. *(The old instruction — "a check
> reports CHILLERED, not a number" — spawned seven hardcoded name lists, three of which had grown
> `altadena`, a live town that then printed as unmeasurable by ruling. All seven are gone.)*
>
> ⭐⭐ **AND IT CHANGES WHAT SOME ROWS BELOW MEAN, WHICH IS WHY THIS BANNER IS HERE AND NOT JUST IN
> `ROADMAP`.** Several sites are rated on a Łódź deployment being LIVE — *"HIGH — live and wrong on
> Łódź today"*, *"State of Missouri governing law rendered on a Polish deployment"*. ⛔ **Those are no
> longer live harms.** ⭐ **The KIT defect is undiminished and the severity stands on that ground** —
> the bleed hits town #3 exactly as it hit town #2 (`CLAUDE.md` Layer 0: the subject is the kit, and
> LS-is-the-fallback is the systemic defect). ⇒ **re-read them as "what this does to the NEXT town",
> never as "what is broken in production today".** ⛔ Do not downgrade a row on the strength of the
> excision alone; the two claims are different and only one of them died.
>
> ⭐⭐ **AND THE MEASUREMENTS BELOW DO NOT EXPIRE WITH THE SCENES.** Every Łódź count here — 3,982
> OSM `addr:street`, 4,361 `building:levels`, the footprint-complexity table, the 65 landmarks — is a
> measurement of **what OSM carries outside the United States**, which is the only such evidence this
> catalogue has. It was measured from real data and it is still true of that data. ⛔ Do not sweep
> these out as dead-town residue; they are the answer to *"what does the kit meet in town #2 if town
> #2 is not American?"* and deleting them would leave that question unanswered and looking answered.

## 0. ⛔ THE HEADLINE FINDING — the LS-bleed is the kit's systemic defect

Every domain found it independently: **absence did not degrade to nothing, it degraded to Lafayette
Square**, so a town showed *someone else's* feature instead of a missing one. The nine sites this
catalogue found are all closed; the table and its history are in the Diary
(`cartograph/_archive/INTAKE-CATALOGUE-s0-bleed-sites-2026-09-25.md`). ▶ **What is still open, and every
site closed since, lives in `docs/briefs/BRIEF-ls-bleed-excision.md` §0/§3**: one home, not two.

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
| **Species routing map** | `tree-species-map.json` (+ `tree-mix.json` shares) | every placement resolving to a real library species | honest zero: routing is EMPTY, never LS's map (`bake-trees.js`, "Refusing to route through LS's map") | **DERIVED** from the census histogram by `scripts/15`. ⚠️ But the collapse table inside it is **hand-authored and St-Louis-flavored**; `TREE-INTAKE.md §5.4`: *"If no municipal census, the mix needs a hand-authored seed — audit the table per region."* **Procedure where none exists:** the city's approved street-tree planting list + USDA hardiness zone + a state extension urban-tree guide → hand-write a ~18-species mix with weights |

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

**Soft bleeds (authoring/UI only, do not reach the render):** `roster-coverage.js:48` (`DEFAULT_MAP` param) · `serve.js:1056` (`GET /inventory` reads LS's census unscoped) · `serve.js:959,1041` (Salon publish + variant-rating re-bake **LS**, unconditionally — so authoring from a Łódź Look re-bakes LS's placements) · `serve.js:1106`.

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
- **Assessor parcels** (the town's declared wells, `data/<scene>/sources.json` → `raw/<declared file>`) — ⭐ **the single richest content well**: address (the join spine for NR + the bare-listing gate), zoning (drives **both** neon colour and search category), sqft/units/value/year_built/vacant/historic. **US: reliably exists** — every county has an assessor, most publish ArcGIS FeatureServer or Socrata. ⚠️ **Outside the US this well often does not exist in this shape** — EU **INSPIRE Cadastral Parcels** gives geometry + parcel id but typically **not** valuation/zoning/year-built. **No Polish equivalent verified**; Łódź has 0 parcel matches.
  > ⭐ **CORRECTION (2026-07-20, later the same session).** The line above was read as "no assessor ⇒ no addresses," and that is **wrong**. Addresses do not require a parcel authority — outside the US they live in **OSM `addr:*`**. Measured in Łódź's own already-fetched `raw/osm.json`: **3,982 `addr:street`** + 3,973 `addr:housenumber` + 1,905 `addr:postcode` across 10,602 buildings. Address is the join spine for the bare-building atlas and the NR match, so this is load-bearing: **the well exists globally, it is just sourced differently.** What an assessor uniquely provides outside the US is *valuation · zoning · year_built · units* — not address. Split the row accordingly.
- **Land-use code table** (declared as `landUseCodes` in the town's `sources.json`) — decodes assessor codes. ⛔ **The filename used to be `county-land-use-codes.csv`, hardcoded, so every non-St-Louis town printed "missing" forever**; and the numeric-range heuristic behind it is **St. Louis city/county ranges** applied to whatever digits any town's code contained. ⭐ **That is not a missing feature, it is a confidently wrong one:** Ohio's statewide `500: Res-Vacant Land` strips to `500`, lands in `400 ≤ n < 700 ⇒ commercial, confidence HIGH`, and reports a residential vacant lot as a commercial building. A town now declares `land_use_code_format` — `stl-assessor-numeric` (ranges + the CSV) or `self-describing` (the code carries its meaning, no table to acquire) — and **an undeclared format yields `unknown`, never a guess.**
- **National Register inventory** (`content/nr-inventory.json`; LS's source is the OCR'd nomination in `inventory/`, 7 files) — style/contributing/architect/period/`nps_ref`. **Tier ③, US-only**: NPS **National Register** nomination PDFs are free at NPGallery, but the per-building "Exhibit 5" table must be **OCR'd and parsed**. State SHPO surveys are the wider net. ⚠️ *"does not exist for a normal town"* (`NEIGHBORHOOD-INPUTS §4.1`). **Non-US analogues differ in kind:** Poland **NID rejestr zabytków**, UK **Historic England Listed Buildings** (open, per-building, well-structured), France **Mérimée** **[unverified]**.
- **Render fields** (`wall_material`, `roof_material`, `stories`, `zoning`) — ✅ read back **out of the baked slab**; derived, never hand-collected. Correct architecture.
- **Overrides** — `content/roster.overrides.json`, AUTHORED.

> ### ⭐⭐ WHAT THE ROSTER MUST CARRY TO REACH THE SOCIETY PAGES — two fields, and they are the acceptance test for this layer *(2026-09-21)*
> A roster is only worth wiring into `src/data/loadInstanceData.js` when it has both:
> - **`address`** — `useListings._buildBareBuildingListings` **drops** a building without one. There is nothing to call it. The count of dropped buildings is reported, loudly, so "this town has no address spine" cannot look like a small town.
> - **`category`** — how the building files on the Society Pages.
>
> ⭐⭐ **THE CATEGORY COMES FROM THE TOWN. The building's OWN `category` is preferred, and the St. Louis zoning letter is only the FALLBACK** — `category: b.category || (zoned && zoned.category) || null`. **Lafayette Square is the outlier, not the pattern:** it ships zoning and *no* category; huron, hipointe-demun and altadena each ship a category and *no zoning at all*. ⇒ **a town does not need a St. Louis-shaped assessor to file its buildings.** It needs a category from any source; the zoning derivation exists for the one town that lacks one.
>
> ▶ **Measure before wiring, never quote** — the figures below are from 2026-09-21 and exist to show the SHAPE of the test, not to be trusted:
> ```
> node -e "const b=require('./cartograph/data/<scene>/content/roster.json').buildings; > const n=k=>b.filter(x=>x[k]&&String(x[k]).trim()).length; > console.log(b.length,'buildings ·',n('address'),'address ·',n('category'),'category')"
> ```
> | scene | buildings | address | category | wired? |
> |---|---|---|---|---|
> | huron | 3,678 | 3,573 (97%) | 3,340 (91%) | ✅ |
> | hipointe-demun | 1,281 | 1,133 (88%) | 1,281 (100%) | ✅ |
> | altadena | 15,397 | **0** | 15,397 | ⛔ **no** |
>
> ⛔ **altadena is the instructive one.** Every building has a category and none has an address, so wiring it would add 15,397 buildings that the address filter drops on the floor — Society exactly as empty as before, while *looking* wired to the next reader. **An entry that reaches nothing is worse than no entry**, because it stops anyone looking. Its address well is undeclared; wire it the day that changes.

### 3.2b ⭐ WHAT PLACE-CARD RESEARCH ACTUALLY TURNS UP — the input kinds, from the first live pass *(2026-09-22)*

Three research agents worked 24 of huron's 285 listings (civic · dining · waterfront). ⛔ These are **input KINDS**, catalogued because the next town will have the same ones — ▶ the evidence is in `scratch/huron-research/`, and the per-fact provenance (`_source`, `_fetched`, `_confidence`) lives in each town's `listings.overrides.json`, stripped before the slab by `bake-content.js#stripMeta`.

**⭐ A PLACE HAS SEVERAL SCHEDULES AT ONCE — and this is an EXTENSION OF `menu.schedule`, not a new model.** *(Jacob, 2026-09-22: "we already show 'active menus' so this is just an extension of that.")* `PLACE-CARDS §3` already carries `menu.schedule = { <menuType>: { <day>: { start, end } } }` — per-menu-type availability — so Berardi's breakfast 07:00–11:00 inside opening 07:00–20:00 is **already expressible**, and so is kitchen-closes-before-the-bar. ⛔ **THE GAP IS A PLACE WITH NO MENU TO HANG IT ON:** Huron High publishes office 06:30–15:30 *and* school day 07:30–14:50; Huron Sports Academy publishes building, classes and breakfast. Both are true at once and neither is a menu. ⇒ the same per-type shape wants to exist on the LISTING, not only inside `menu`. ⭐ Two agents on unrelated beats reached this independently, which is why it leads. It generalises far past schools: a pool inside a rec centre, a clerk's window inside a courthouse, a café inside a museum.

**⛔ UNMARKED SEASONAL HOURS — the kit's signature failure shape.** A Lake Erie marina restaurant is summer copy; hours scraped in September are correct for the month you sampled and silently wrong the rest of the year, and would tell a visitor a shuttered place is open. `{open, close}` has nowhere to put a validity window. ⚠️ BGSU publishes fall/spring *and* summer side by side; the library's real hours live in **LibCal**, which has a JSON/iCal API and is near-universal in academic libraries — a machine-readable well worth naming.

**Other kinds found, each with a town-agnostic equivalent:**
- **Service times as an INSTANT, not an interval** — a church has 08:00 and 10:30, not open/close. Sourced from the **Episcopal Asset Map**, a denomination-wide structured directory covering every US town.
- **Last entry ≠ close** — "arrive 30 minutes before closing" is a real 14:30 door time behind a 15:00 close.
- **Rule windows that are not opening hours** — an HOA's quiet hours 22:00–08:00; a pet ban bounded by **Memorial Day–Labor Day**, i.e. two FLOATING holidays, unstorable as a month range.
- **PDF-only menus, and a place with SEVERAL menus.** The single `menu` object has no room for Dinner + Wine + Family + Catering. ⛔ A menu in a PDF or an image is not machine-readable: record that it exists and where, never transcribe it by guessing.
- **Market-price and multi-price items** — "Perch … Market Price", "4.50/8.00" cup/bowl. ⛔ Keep the printed text; emit no `price`.
- **Ordering/reservation integrations** (Toast, ChowNow, Google waitlist) whose hosted menu is often fresher than the restaurant's own site.
- **Rented web presences** — NetWaiter pages, Facebook-as-primary-source, VRBO as a lodging listing's only home. An aggregator is not first-party and the record must say so.

**⛔ MONTH-BANDED WEEKLY SCHEDULES — worse than "seasonal", and producing wrong data TODAY.** Not "open May–October": Huron Lagoons Marina publishes **SIX different weekly grids across the year** and Holiday Harbor **three**, each with its own weekday/weekend split. Whichever band you scrape is right for the month you sampled and wrong for the other ten — ⭐ and it is invisible if you look at one business, which is the same shape as a constant that happens to be right for town #1. ⚠️ Two further shapes with nowhere to live: *"Memorial Day to Labor Day pool hours: 9 AM to sunset"* (floating-holiday range **and** a solar closing time) and *"December 19th at noon – January 5th"* (a closure beginning mid-day on a named date).

**⭐⭐ AND ONE THAT NO FIELD CAN HOLD — operation decided same-day, on external conditions.** A Lake Erie charter: *"The Captain's decision to cancel will be made the morning of the charter."* Whether the business runs today is **structurally unknowable in advance**. ⇒ the fix is not a better field but **a live external feed keyed to the town's geography** — NOAA marine forecasts are public, structured, and every waterfront town sits in a marine zone. The inland analogues (golf, ski, ferries, orchards, outdoor markets) make it a general class. **This is kit-level, not per-place data entry**, and it is the one finding that argues for a new INPUT rather than a new column.

**Also found: venue inside a venue** — hit TWICE in one 8-listing sample. The Viking's Den restaurant sits inside Huron Lagoons Marina with its own hours and phone; North Coast Boating occupies suite C-32 of the same street address. ⛔ Three distinct businesses at 100 Laguna Dr. This is LEGITIMATE and must not be mistaken for a duplicate — see `H-27`, where requiring address **AND** phone is what keeps the collision check from condemning it.

**⛔⛔ AND THE THREE WAYS OUR OWN DATA WAS WRONG, which cost more research time than the hours did:**
- **A URL that resolves to the wrong organisation.** `huro-lst-0119` Salvation Army points at the *Indiana Division*; Huron OH is Northeast Ohio. ⭐ **It returns 200 OK on a plausible page**, so any "are our links alive?" check passes it clean. Liveness is not identity.
- **A URL for a business in another state.** `huro-lst-0198` Sand Bar → `thesandbar.com`, a bar in Lawrence, Kansas.
- **Dead domains that look alive** — `christchurchhuron.com` is NXDOMAIN and `winkspizza.com` does not resolve, while search engines still index their old pages.
⛔⛔ **BUT A NAME/DOMAIN MISMATCH IS NOT EVIDENCE — the obvious check would break a working listing.** `huro-lst-0157` Rippin Lips Lake Erie Charters points at a *waterfowl* domain and **the URL is correct**: one operator runs both businesses from one site. ⚠️ And "broken link" is FOUR failure modes in one symptom — NXDOMAIN · a truncated string · TLS verification failure · 403 to some user-agents and 200 to others — so a boolean reachability test mislabels three of them.
⚠️ **An aggregator was actively wrong about what a business IS**, fluently: `slipstreamboating.com` describes North Coast Boating as a boat club with luxury memberships; its own site is a boating *school* and delivery service. Trusting the aggregator would have written a confident, wrong description.
⇒ ▶ `node checks/claims-two-listings-are-not-one-place.mjs` catches the duplicate half from two fields we already collect. The wrong-entity half has no check and is boarded as `ROADMAP` H-27; bulk human correction is `H-28`.

### 3.2c ⭐ THE TOWN CALENDAR — an input kind with no intake, and deliberately so *(2026-09-22)*

A town's own happenings — a festival, a fireworks night, a farmers market — are **not a property of
any listing**, so they have no home in Layer 2. They live in `content/events.json`, **fully
authored**: there is no acquisition step because no open well publishes "what this town does in
October" in a machine-readable form, and the honest answer is the operator typing it.

⭐ **The date model was already there and nobody had used it.** `isActiveEvent` gates its clock test
behind `if (timeStr && e.start_time && e.end_time)` — so an event with dates and **no times is
active all day, every day, across its range.** ⛔ The gap was never the model; it was that the
ticker keyed its entries by `listing_id`, and a town festival has no listing.

⚠️ **The neighbouring unsolved case, from the civic beat:** a school is closed on **~180 named days a
year**, which no weekly `hours` structure can express and which no town publishes as a feed we
found — Huron City Schools ships a **PDF** through ParentSquare. A closure calendar is the same
shape as a town calendar pointed the other way, and it is unbuilt.

▶ Operator instructions: `cartograph/OPERATIONS.md § The town calendar`.

### 3.3 Layer 2 — listings (JOINED base + AUTHORED override)
`content/listings.json` → the reader's `landmarks`. Drives place cards, search, Society tab, **neon colour + open-now**, Places stat.
**Two bases:** **OSM POIs** (`classifyPoi` maps ~45 amenity/shop/leisure/tourism/office tags → the Society taxonomy) and **Overture Places**, declared via `meta.baseSource:"overture"`.
⛔ **"Two PROVEN bases" overstated the second one for months and this is the correction (2026-09-20).** Łódź's 84 records proved the CONSUMPTION path only — they arrived by a route that was never in the tree, and it left with the scene. **There was no Overture fetch anywhere in this repo**, and the only merge tool was hardcoded to one scene's content dir. ⭐ Both halves are now built and town-agnostic: `cartograph/fetch-overture-places.js` (acquisition) and the `overture` base producer in `bake-content.js` (consumption).
⛔⛔ **AND ITS LICENCE IS NOT WHAT A SEARCH ANSWERS.** Overture **PLACES HAS NO THEME-LEVEL LICENCE** — read from the distribution's bytes 2026-09-20, the places STAC collection declares `"license": "other"`, and the attribution page it links gives Buildings, Divisions and Transportation a `License for theme:` line and gives Places **none**. Obligations are **per contributing dataset** (CDLA Permissive 2.0 · Apache 2.0 · CC0 1.0), so **what a town owes depends on which records that town got**. Derived per town from the artifact's own `sources[]` by `cartograph/overture-licence.mjs`; a dataset absent from its table is reported **owed, by name**, never inferred. ▶ `node checks/claims-overture-licence-table-is-current.mjs`
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
1. **The external-base guard** (`bake-content.js`, the `externalBase` block) — declared in *data* (`meta.baseSource`), not by scene name. **This is what saved Łódź's 84 listings**; without it the 2026-07-20 re-fetch took them to 5. Correctly generalized. ⛔ **This citation read `:730-747` until 2026-09-20 and had drifted by 30 lines** — cite the SYMBOL, not the line (`MEMORY §C`). ⭐ **The guard's REMEDY was unbuilt until 2026-09-20** and the code said so in its own comment: a protected town had nowhere to go. It now has one — `fetch-overture-places.js` acquires the base and `bake-content.js` folds it in as a first-class producer.
2. **Anchor re-resolution** (`applyListingOverrides`) — hand-added listings re-resolve `building_id` from a stored anchor on *every* run, dropped with a warning if it falls outside the baked set. This is what lets a re-poured skeleton keep its content.

**Threats:** T1 roster/listings incoherence (from the now-fixed join) · T2 the two Layer-0 homes (§3.1) · **T3 — LS is the one installation with NO `content/` dir at all**: render and content still fused in one 1.26 MB `src/data/buildings.json`, and `bake-content.js:693` refuses it without `--force`. **LS therefore cannot demonstrate the invariant it defines**; schema changes must be hand-migrated into it · **T4 — asset-root discipline is convention, not enforcement.** `NEIGHBORHOOD-INPUTS §5.1.2`'s litmus ("if removing every other installation would break this one, the boundary is violated") is prose only; **breached once already (2026-07-05, HPDM images into LS's `public/photos/`).**

### 3.6 The universal-player gate — what breaks town #3
Measured against `HANDOFF-blank-app-instance-decoupling.md`'s *"grep the reader for installation-specific literals → zero."*

- **🔴 G1 · `InfoModal.jsx` has ZERO `INSTANCE` reads** — 7 paragraphs of LS prose. Łódź runs `info` (modules default-ON), so **a Polish visitor reads about the Lafayette Square Conservancy**, including *"If you wouldn't say it to someone on the sidewalk in Lafayette Square, don't post it here."* The single most embarrassing surface.
- **🔴 G2 · `LegalPage.jsx` is LS/Missouri** — "within Lafayette Square, St. Louis" · the LS delivery zone by street name · **"State of Missouri" governing law** · `← lafayette-square.com`. Same in `CourierOnboarding.jsx` + a **US-state-only** dropdown. `INSTANCE.legal` exists and Łódź populates it (`governingState:'Łódzkie'`, `salesTaxRate:0.23`) — **nothing reads it for the prose.** Łódź opted *into* delivery, so this is **legal exposure, not cosmetics.** The instance file names it itself: *"a KIT bug to instance-derive, NOT a reason to opt out."*
- **✅ G3 · CLOSED 2026-09-20 — and the doc was wrong about it in three ways.** It said **four copies**; there were **five** (the fifth, `categories.js`'s `ZONING_TO_SUBCATEGORY`, was exported and imported by nobody). It said **two disagree**; all five did, on `D`, on five residential subcategories, and on the district labels. ⭐⭐ **And when the table was finally checked against the AUTHORITY rather than against the other copies, the MAJORITY WAS WRONG:** St. Louis Revised Code **Title 26** makes `D` a Multiple-Family Dwelling district (**residential**) and `H` the Area Commercial district (**commercial**) — the reverse of what four of the five said. `SceneNeon`, the copy this was filed as the outlier, was the only one right about `D`. ⛔ **Four agreeing copies are not evidence; they are copies of each other.**
  One home now — `src/tokens/categories.js#STL_ZONING` + `classifyZoning()` — carrying all twelve districts. ⭐ `SceneNeon` keeps its own table **by ruling (Jacob, 2026-09-20)**: it maps zoning → *neon colour*, a look decision, not zoning → *search category*. `§3.6` already called them *"two unrelated systems"* and they are; ⛔ do not unify them.
  The `|| 'residential'` fallback is gone from all three data paths. An unreadable zoning yields `category: null`, painted `UNKNOWN_HEX` slate on both neon paths so the gap is **visible on the eye-gate surface**, and browsable under an **Unclassified** section so killing the fallback did not replace it with a silent drop. ⛔ **The alphabet is St. Louis's**, so a town declares whether its assessor speaks it (`zoning_code_format: "stl-letter"`); undeclared means unreadable, never "assume St. Louis".
  ▶ `node checks/claims-intake-absence-is-loud.mjs` (and `--self-test`, which mutation-proves every assertion).
- **🟡 G5** unregistered look → LS (bleed #5) · **🟡 G6** `index.html` hardcodes LS favicon/title/OG/Twitter — needs the build-time inject (Phase 4, unwritten) · **🟡 G7** `lsq-*` localStorage namespace collides across installations on one origin · **🟡 G8** `PlaceCard.jsx:148` `FLEUR_BG = '#0055A4' // St. Louis flag blue` renders on Łódź.
- **🔴 G9 · ⛔ NOT correctly guarded — this row was wrong (corrected 2026-07-21).** It claimed `LafayettePark`, `StreetLights` + `lampLightmap`, `GatewayArch` and `buildingOverrides` "are all LS-gated and no-op elsewhere." Two faults. **(a)** Every one of those gates reads `INSTANCE.lookId`, so all six fail together the moment a look is unregistered — see the bleed #5 expansion in §0. **(b)** `GatewayArch` was **not gated in the component at all**: the only check lived at the `Scene.jsx:860` call site, while `PreviewApp.jsx:1176`, `StageApp.jsx` and `CartographApp.jsx` mounted it bare. A gate at one of four mount sites is a gate three callers can forget. Fixed by gating inside the component on the RESOLVED look (`3146e6aa`) — Stage, Preview and Cartograph can each mount a look that is not the booted installation, so `INSTANCE.lookId` is the wrong thing to test there. **These do still belong on the manifest as "not-yet-portable features."**

✅ **What holds:** Phase 1 (identity/branding/geography), Phase 2 (data seam), Phase 3 (module gating, default-ON opt-out), backend tenancy, `assetUrl` instance-rooting, and `bake-labels` — which **closed a real hardwire**: `streetLabels.js`'s four hardcoded LS boundary-corridor names are gone; every town now gets its street names free from OSM `name` tags.
**The gate fails on Phase 4 (prose) + the two deep residuals (zoning taxonomy, `lsq-*`)** — plus G4, the join bug, which postdates the HANDOFF entirely and is now fixed (`adc03f32`).

---

## 4. ⭐ PROMINENCE — the cheap signals, the one-button rule, and the effort model

*(Jacob, 2026-07-20, late session. Three connected ideas: take every cheap signal · make each access
trigger a single button · rank buildings so the operator can choose how much town to build.)*

### 4.1 The cheap-signal inventory — measured, already on disk, currently discarded

None of it costs anything to acquire — it was paid for when `fetch.js` ran. The only cost is reading
tags the pipeline currently throws away.

> ### ⛔ THE COUNTS THAT USED TO BE HERE ARE GONE ON PURPOSE — RUN THE COMMAND *(2026-09-20)*
> This table carried **Księży Młyn's** figures, and that town was excised on 2026-09-19. Nine numbers
> for a town that is not on disk read as authority and cannot be re-derived by anyone, which is the
> exact failure `CLAUDE.md`'s prune rule names. ⭐ **A count in prose is stale the moment it is
> written.** Per town, live:
> ```
> node -e "const j=require('./cartograph/data/'+process.argv[1]+'/raw/osm.json'),c={};for(const f of [...Object.values(j.ground||{}).flat(),...(j.pois||[]),...(j.buildings||[])])for(const k of Object.keys(f.tags||{}))c[k]=(c[k]||0)+1;for(const k of ['wikidata','wikipedia','heritage','historic','tourism','name','website','phone','opening_hours','brand','amenity','shop','office','craft','building:levels','addr:housenumber'])console.log(String(c[k]||0).padStart(6),k)" <scene>
> ```
> ⚠️ **Read it against that town's fetch vintage**: a `raw/osm.json` from before the node-tag intake
> (2026-09-20) has no `pois` array, so every node-mapped business is missing from the count. The
> prominence census in `bake-content.js` says which towns those are, per pour.

| Signal | Use |
|---|---|
| `wikidata` | ⭐ the strongest cheap prominence signal in existence — someone catalogued this building |
| `wikipedia` | an article exists about it |
| `name` | named ≫ unnamed, universally and language-independently |
| `tourism` · `historic` · `heritage` | designation |
| **`website` · `phone` · `opening_hours`** | ⭐⭐ **going concern — see below** *(added 2026-09-20, Jacob)* |
| `brand` | a chain, therefore a live business |
| `building:levels` | height/prominence, free |
| `amenity` · `shop` · `office` · `craft` | business presence |
| `addr:street` · `housenumber` · `postcode` | ⭐ **the address well** — see §3.2's correction |

> ### ⭐⭐ WHY `website` / `phone` / `opening_hours` EARN A ROW — AND IT IS NOT "MORE TAGS IS BETTER"
> **A `wikidata` hit says somebody CATALOGUED this building. An `opening_hours` says somebody is OPEN
> ON TUESDAY.** Those are different questions, and this table only had the first one.
> ⇒ The second is the one Jacob actually asked for at the start of this arc — ***"we need to know where
> the viable businesses (restaurants, etc) are."*** A neighborhood's catalogued landmarks and its
> living commerce are not the same set, and a rank built only on designation finds the church and
> misses the block everyone actually walks to. **These three are the cheapest going-concern proxy that
> exists, and they were free the whole time.**

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
| Building footprints | MSBF (`fetch-msbf.js`, in the Extent fetch) | CDLA Permissive 2.0 |
| Canopy raster | MRLC WMS GetMap · ESA WorldCover | public domain · CC BY |
| Weather year (offline fixture + cloud regime) | Open-Meteo ERA5 archive | **CC BY 4.0, redistributable** |
| Climate fingerprint | WorldClim v2.1 | ⚠️ licence unconfirmed |
| Bark + leaf textures | ambientCG · Poly Haven | **CC0** |
| Reference plates | Wikimedia (URLs **already recorded** in the 10 `sources.json`) | per-image CC |
| Star catalogue · constellations · planets | HYG/BSC5 · Stellarium · JPL SSD | open · public domain |
| Wikidata/Wikipedia enrichment | Wikidata API | CC0 |
| Assessor parcels | per-jurisdiction ArcGIS/Socrata — ✅ **BUILT 2026-09-20**, `cartograph/fetch-parcels.mjs` | varies — the per-town endpoint field is `data/<scene>/sources.json` |

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
stops wherever they choose.

> ### ✅ **BUILT 2026-09-20** — `cartograph/prominence.mjs`, stamped by `bake-content.js`.
> The knobs, the override and what the census lines mean: **`cartograph/OPERATIONS.md`, "THE WORK
> QUEUE"**. ⛔ Don't re-describe the scorer here; the weights and their rationale are in the module
> and they move.
>
> ⭐ **The dial exists and it reads: "evidence runs out at rank K."** Huron: **153 of 3,678** buildings
> are noticed by any source; the rest are ordered by footprint area alone. A demo pour takes the top
> 20, a real install works down until it stops paying — and now it can see where paying stops.
>
> ⏳ **STILL UNBUILT, and it is a decision, not rot: the panel's progress semantic.** Not *"3% of
> 1,640"* (reads as failure) but *"your top 50 are complete"* (reads as done). The rank is what makes
> that sentence sayable, and nothing says it yet — the panel surface is unscoped
> (`BRIEF-roster-prominence-C §8`). ⛔ Do not delete this bullet as though it described the code.

- **Partial completion becomes graceful.** "The top 40 are done, and they are the 40 that matter" — rather than an arbitrary scatter.

**Vocabulary — use the existing word.** `useListings` already loads `'landmarks'`, and bare buildings
are the synthetic residue. So this is not a new concept: it is **deciding which buildings get promoted
from bare building to landmark, and in what order.** Do not introduce "importance" alongside
"landmark."

⚠️ **Two constraints that must hold:**

1. **The rank is a GUESS and every guess is overridable** (`NEIGHBORHOOD-INPUTS §0.0/§1.1`). A beloved corner bar scores near zero on every cheap signal — no Wikidata, no tags, small footprint. **The rank orders the work queue; it must never gate what can be filled.**
2. ⭐ **This is where "connect your neighborhood" earns its keep.** Residents know the ranking the data cannot see. Let them promote a building and you have captured a prominence signal **no dataset carries** — the single strongest argument for routing rows to the CLAIMED kind (§3.4) deliberately rather than by default.

   ⭐ **THE SEAM IS BUILT, THE PATH IS NOT.** A roster record carries `promoted: { by, note }` and
   sorts above every scored building; `by: 'resident'` needs no change to the scorer. ⛔ The resident
   path itself is unbuilt — this is a seam, not a feature.

> ### ⭐⭐ MEASURED 2026-09-20 — and constraint ① is not a caution, it is 43% of LS.
> ▶ `node checks/claims-prominence-recovers-ls-landmarks.mjs` — LS scored **blind**, then asked how
> many of its 87 hand-curated landmarks the rank recovers. ⛔ **Numbers live in the check, not here.**
> The shape of the answer: the rank beats chance by roughly an order of magnitude and still misses
> **over a third of the landmark buildings at top-63**, most of them carrying no signal beyond a
> parcel record. Park Avenue Coffee. Rhone Rum Bar. Polite Society. **The beloved corner bar was not
> a rhetorical example.**
>
> ⚠️⚠️ **AND THE CEILING IS A PROPERTY OF THE FETCH, NOT OF THE TOWN.** A town fetched before the
> node-tag intake landed (2026-09-20) has **no `pois` array at all**, so every business mapped as an
> OSM *node* is invisible to the score — and LS is one of them. ⛔ **So a "buildings noticed" count is
> not comparable across towns of different fetch vintage**, which is the two-numbers-different-
> predicates trap operating at the scale of whole towns. ⭐ **Don't carry that fact in prose — the bake
> prints it, per town, beside the number it qualifies** (`bake-content.js`, the prominence census).
> ⛔ How much a re-fetch would recover is **not established**; nobody has re-fetched and re-scored.
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
