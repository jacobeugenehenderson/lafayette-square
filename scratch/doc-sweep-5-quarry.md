# DOC SWEEP — CLUSTER 5 (Intake & extent) — agent **Quarry**

Docs: `cartograph/INTAKE.md` · `INTAKE-CATALOGUE.md` · `EXTENT-DESIGN.md` · `EXTENT-EXCAVATION.md` · `NEIGHBORHOOD-INPUTS.md`
Read-only. Nothing fixed. Findings only.

**62 load-bearing claims extracted** → **39 CONFIRMED · 14 FALSE · 5 PARTIAL (was-true-now-stale) · 4 UNVERIFIABLE**

**The shape of the result, in one line:** the *doctrine* in this cluster is in excellent condition — the
inclusion-polygon model, the two centers, the tier model, the acquisition catalogue all check out, and
`INTAKE-CATALOGUE`'s measured tag tables reproduce to the digit. **Every failure is a status claim**:
a known-open defect list that has been fixed, a procedure that describes a code path that was deleted,
and a count that predates a re-pour. Two of them are *dangerous* — a doc that tells you the commit path
re-centers your frame when it no longer does, and a machine gate that reports a fixed defect as open.

---

## ⛔ THE FIVE THAT MATTER

### `cartograph/INTAKE.md` §0.5 step 8 + "Frame-then-fetch" — **FALSE**
CLAIM: "Bake (`onBuild`) folds Commit + Pour: `commitExtent` … **re-centers `geography.json` to the boundary centroid** → `reproject-raw.js` → `skeleton.js`"; and "On **Commit**, `geography.json` is re-centered again to the boundary **centroid**: `reproject-raw.js` recomputes the x/z of **every frame-dependent raw file**."
ACTUAL: `cartograph/serve.js:1417-1435` — commit-extent **never re-centers and never runs reproject-raw**. In-code: *"⭐ NEVER MOVE THE FRAME ORIGIN (EXTENT-DESIGN §3.3) … the hood center is stored OFF-ORIGIN on the disc instead of re-centering the frame — **no reproject, ever**"* and *"No reproject-raw — the origin didn't move."* Only `skeleton.js` runs. The only surviving `reproject-raw` call is in `/rollback-extent` (`serve.js:1555`).
IMPACT: This is the *most-followed procedure in the cluster*. An operator or agent reading it believes a commit is a destructive frame move, will plan around a reprojection that does not happen, and will carry the now-dead "verify parcel↔building frame alignment after any re-pour" gate as a live requirement. It also makes §0.5 contradict `EXTENT-DESIGN §3.3`, which is the doc that *caused* the change.

### `cartograph/INTAKE.md` §0.5 "The re-center guard (2026-07-15)" — **FALSE**
CLAIM: "`commit-extent` **refuses** to re-center a committed hood by >5 m without `allowRecenter:true` (409 `recenter-blocked`)."
ACTUAL: `serve.js:1398-1405` — *"(Re-center guard **REMOVED** 2026-07-23 — EXTENT-DESIGN §3.3) … `allowRecenter` is now unused; kept in the destructure for payload compatibility."* Zero occurrences of `recenter-blocked` in the tree.
IMPACT: The doc presents a safety mechanism that no longer exists as the thing protecting committed hoods. Anyone auditing the destruction surface (or writing the seal gate `EXTENT-DESIGN §4` calls for) will count a guard that isn't there. Note this is a *three-way* disagreement: `INTAKE` says >5 m, `EXTENT-EXCAVATION §A2` says ">100 m", the code says no re-center at all.

### `EXTENT-DESIGN.md` §0/§3.3/§4/§6-step-2 + `EXTENT-EXCAVATION.md` §0.8② — **FALSE (the fix landed)**
CLAIM: "Building identity is `msbfId: i` = the fetch **array index**; a re-fetch renumbers every building and every listing/logo/card silently re-points." And §6 worklist step 2: "**HPDM identity lock** … **the single thing between HPDM and 'safe to hand a customer'**."
ACTUAL: `cartograph/fetch-msbf.js:179-190` — *"── IDENTITY LOCK (EXTENT-DESIGN §4) ── Consult the per-scene registry: an existing footprint keeps its PERMANENT msbfId; an unseen one appends at highWater+1; **nothing is renumbered**."* `assignIds(...)` + `loadRegistry`/`saveRegistry`, with a coincident-centroid collision warning. `msbfId: ids[i]`, not `i`.
IMPACT: The worklist's #2 priority — named as the customer blocker — is **done**, and three documents still describe it as the subsystem's structural root. A pass picking up this design would rebuild an allocator that exists.

### `scratch/served-parity.mjs` (the gate `EXTENT-DESIGN §2` names as *the* machine check) — **the gate is stale**
CLAIM (`EXTENT-DESIGN §2`): "**The gate is `scratch/served-parity.mjs`** — the machine check that asserts every scene is built and served the same way."
ACTUAL: run today, its Part-3 worklist prints `identity msbf- : UNSTABLE — id = fetch array index; a re-fetch renumbers every anchor` for **all five scenes**, which is false since the identity lock (above). It also prints **17** name-imports where §2.1 and §6-step-4 say **19**, and `cartograph/BACKLOG.md:119` says **13 static across 10 files**. And it enumerates 5 scenes, omitting `lafayette-square-staging`, which on disk **is** served from `clean/` (skeleton + ribbons + map + street-index).
IMPACT: Worst class in this repo's own terms — a checker that converts a fixed defect into a standing one, and a "sameness detector" blind to a sixth scene. Three docs give three different name-import counts, so nobody can tell how much of worklist step 4 is left.

### `NEIGHBORHOOD-INPUTS.md` §5.1.1 — **FALSE (counts)**
CLAIM: "HPDM's `content/roster.json` (Layer 1, **2089 buildings, ids matched 2089/2089**)"; "`content/listings.json` (Layer 2, **212 listings**, 30 mixed-use)"; "HPDM's Buildings will read **2,089** for free."
ACTUAL: on disk — roster **1281**, listings **192**. (`EXTENT-DESIGN §2` independently records HPDM as `msbf- (1281)` and §6-step-2 as "192 listings", so the newer docs already carry the right numbers.)
IMPACT: The 2089/2089 match is cited as *the ratification evidence* for the join-key invariant ("collect ids that match the slab, or nothing joins"). The evidence is 62% of the stated size and the exact-match proof has not been re-run against the current pour.

---

## FALSE / STALE — the rest

### `INTAKE-CATALOGUE.md` §0 "THE HEADLINE FINDING — eight verified sites" — **4 of 8 rows FIXED, 1 partially**
CLAIM: sites 1–4 bleed LS's lamps, park census, species map and lamp positions into any town.
ACTUAL: commit `b12627c8` *"fix(kit): absence must degrade to nothing, never to Lafayette Square"* + `4db5c07c`.
- **#1** `bake-lamps.js` `loadAuthoredLamps` now checks `data/<scene>/authored_lamps.json` first, then `if (scene === 'lafayette-square')`, then `return []`. No town without lamp data gets LS's. (An LS-only hardwire remains — a different, smaller defect.)
- **#2/#3** `bake-trees.js` has no LS census/species fallback; a missing map now emits `no tree-species-map.json — species routing is EMPTY` (`:496`).
- **#4** the module-level lamp constant is gone, with the fix documented in place at `bake-trees.js:69`: *"⭐ The lamp set is PER SCENE and loaded at bake time — never module-level."*
- **#5** `src/instance.js:47` still falls back, but **loudly** now (*"An UNKNOWN look must announce itself"*). The sub-claim "`altadena` and `toy` are still unregistered" is **CONFIRMED** — `src/instances/` holds 4 files for 5 registered looks.
- **#6, #8** — **CONFIRMED live** (below).
IMPACT: This is the doc's headline and it is the entry point for the excision brief. Half of it is a to-do list of completed work. Separately, "**Eight** verified sites" is superseded — the excision brief now carries sites 9–14 (`ec159bad`).

### `INTAKE-CATALOGUE.md` §2.0 "all **16 of 16** sky channels byte-identical" — **PARTIAL**
ACTUAL: comparing `public/baked/lafayette-square/scene.json` to `ksi-y-m-yn`'s today: **13 of 16** identical; `fill`, `mist`, `exposure` now differ. The substance (Łódź wears LS's authored sky) stands; the "byte-identical" proof does not.

### `INTAKE-CATALOGUE.md` §2.5 "`BACKLOG.md:235` asserts 'Meteorologist already owns per-Look climate fields'" — **FALSE (citation dead)**
ACTUAL: `cartograph/BACKLOG.md` contains **zero** occurrences of "climate". The parked idea the section calls "precisely this intake manifest" no longer exists at the cited home. The underlying point (no per-Look climate record exists) is unaffected.

### `EXTENT-EXCAVATION.md` §B4 "the retraction is incomplete in the CANON, and the gap is on the routing path" — **FALSE today**
CLAIM: `PREBAKE.md:56`, `ARCHITECTURE.md:168`, `INTAKE.md:26`, `OPERATIONS.md:20`, `NEIGHBORHOOD-INPUTS.md:318/327-329` still state the retracted excluder model — *"On this evidence that is still true today."*
ACTUAL: all swept. `PREBAKE.md` now leads with `(polygon ∪ activate) − (exclusions ∪ hide)` and closes *"(This file was the one the retraction commit `004a33e3` missed; fixed in the 2026-07-23 canon sweep.)"* `ARCHITECTURE.md` §disc, `OPERATIONS.md` step 6 and `NEIGHBORHOOD-INPUTS §11` step 3 each now state the corrected model with an explicit retraction note.
IMPACT: B4 is the section that tells the next agent *the canon will misinform you*. Left standing, it manufactures distrust of docs that are now correct — and it costs a re-sweep to discover that.

### `EXTENT-DESIGN.md` §3.3 "⛔ Blocked today by D4" / `EXTENT-EXCAVATION` D4 — **HALF FALSE**
CLAIM: "the code **forces disc center = origin** (`ExtentApp.jsx:~1138` + **`makeCircleBoundary` hardcodes `center:[0,0]`**)"; "**the first time LS is touched through the panel its disc silently recenters to the origin** and its hand-authored `innerFadeOffset: 134` is overwritten with 200."
ACTUAL: `serve.js:616` — `function makeCircleBoundary(radius, center = [0, 0])`; both the commit path (`:1459`) and the rescope path (`:1619`) pass a computed `discCenter`, with an in-code post-mortem at `:1588-1603` naming the exact bug the doc describes as *fixed*. LS's `neighborhood_boundary.json` still reads `center: [-15,-15]`, `innerFadeOffset: 134`. **Still true:** `ExtentApp.jsx:1145` `if (committed) return { x: 0, z: 0 }`, and rescope still regenerates the fade constants — so the `innerFadeOffset` half of the destruction claim holds and the recenter half does not.
IMPACT: "Fixing D4 is what enables the draggable centroid" is the stated unblocker for §3.3's whole model; most of D4 is already fixed and the doc points at the wrong remaining half.

### `NEIGHBORHOOD-INPUTS.md` §2 tree-census row — **FALSE (path)**
CLAIM: municipal tree census → `src/data/park_trees.json` (756).
ACTUAL: no such file. The 756-record artifact is `cartograph/data/lafayette-square/clean/park_census.json`; `clean/park_trees.json` is a different, larger well (2635). The union-of-wells doctrine (`BAKE §4.5`) turns on these being distinct layers, and this row merges them under a path that does not exist.

### `NEIGHBORHOOD-INPUTS.md` §5.1 "the render ledger … `bake-buildings.loadBuildings` reads it uniformly **for every scene**" — **MISLEADING**
ACTUAL: `cartograph/data/*/buildings.json` exists for **`lafayette-square` only**. Every other scene falls through to adapting `clean/map.json`. The *loader* is uniform; the *artifact* is LS-only — which is `EXTENT-EXCAVATION` D7, **CONFIRMED**, and inverts R19 ("one filtered source") for LS specifically.

### `EXTENT-EXCAVATION.md` §0.2 — `clean/street-index.json` "already built" — **PARTIAL**
ACTUAL: exists for **2 of 6 scenes** (`centrum` 2.0 MB, `lafayette-square-staging` 0.3 MB). Absent for `hipointe-demun`, `altadena`, `ksi-y-m-yn`, `lafayette-square`. The two-pass SOFT-fetch design (§0.2) and PART C's face-enumeration hinge both assume it is a per-scene given.

---

## CONFIRMED — checked, true, cite-able

**`EXTENT-EXCAVATION` PART B reproduces exactly.** I re-derived every number independently:
- **D1** `bbox ⊇ disc` violated in 2 of 5: LS tightest half-extent **666 m** vs radius **892** (226 m over); altadena **3180** vs **4161** (981 m over); hpdm 2484/1251 ✅, ksi 1941/1530 ✅, centrum 2762/2147 ✅. Still checked nowhere.
- **D2** ksi's 357-pt `polygonSource:"official"` ring is in `neighborhood.json`; `neighborhood_boundary.json` — the file every consumer reads — has **no** `polygon`. Unrepaired.
- **D3** `neighborhood-membership.mjs` matches the quoted snippet verbatim; a point outside the polygon but inside `radius − innerFadeOffset` returns density **1**.
- **D5** `.prebak-rescope` written at `serve.js:1670`, **one** occurrence tree-wide — nothing reads it. A real orphan exists on disk (`lafayette-square-staging/neighborhood_boundary.json.prebak-rescope`, Jul 23).
- **D6** stale `.prebak` on disk for `centrum`, `ksi-y-m-yn`, `lafayette-square-staging`. `centrum/geography.json.prebak` holds `"timezone": "America/Chicago"` against the live `"Europe/Warsaw"` — and `/rollback-extent` (`serve.js:1553-1557`) does restore it **and** re-run `reproject-raw` + `skeleton`. The loaded gun is loaded.
- **D7** `bake-buildings.js:141` "the hardwire retired" vs `:671` `if (scene !== 'lafayette-square' && existsSync(nbP))` — exact lines, unchanged.
- **D8** `pipeline.js:115` and `:256` return `true` on `activate` **before** the exclusion test at `:257`. The canon formula `(polygon ∪ activate) − (exclusions ∪ hide)` — stated in nine docs including `NEIGHBORHOOD-INPUTS §5.2` and `INTAKE §0.5` — is not what runs.
- **D10** ksi content join: **15 of 84** listings `building_id: null`; **5 of 1640** roster entries carry `listing_ids`; Galeria Łódzka `osm-39524935` carries exactly **22 of 84**.
- **§0.2 sizing**: osm.json 43.1 MB (hpdm) / 63.4 (ksi) / **121.0** (centrum); msbf 9.1 / 32.2. Exact.
- **PART C face table**: hpdm 302/196/300 · centrum 481/571/851 · ksi 32/77/137. Exact.

**`INTAKE.md` §§0–4 hold.** `config.py` CENTER `38.6160,-90.2161`, `LON_TO_METERS 86774` / `LAT_TO_METERS 111000`, projection as written · `centerlines.json` = **446 chains, 411 `osm` + 35 `curated`** · `survey.json` = 68 streets, 7 `source:'default'` → **61/68 measured** · `seedSection`/`STD_SECTION` is NACTO/PROWAG-seeded with the AASHTO-deferred comment in place · `◎ Extent` → `setShot('extent')` → `CartographApp.jsx:1012` early return · `geocodeZip` → `api.zippopotam.us/us/` · `viewportTileZ` · `computeBoundaryFromSelection` mounted (`serve.js:280`, endpoint `:1085`) · `computeExtentCorners`/`/extent-corners`/`fetchExtentCorners` gone from code (a **dead reference survives in `cartograph/ARCHITECTURE.md:393`**, cluster 4's doc).

**`EXTENT-DESIGN` §2's root claim.** `cartograph/data/lafayette-square/clean/` has **no `ribbons.json`** — LS is genuinely not poured; its render data is name-imported from `src/data/*`. Building counts 1082 (LS) / 1281 (hpdm) match.

**`INTAKE-CATALOGUE`'s measured tables are the best-verified material in the cluster.** Every count in §4.1, §5.2 and §5.3 reproduces exactly off `raw/osm.json`: ksi — wikidata 65, wikipedia 58, name 503, `building:levels` **4361**, `addr:street/housenumber/postcode` **3982/3973/1905**, amenity 238, shop 111, tourism 35, historic 32, heritage 8, `ref:nid` 8, `roof:shape` 130, `roof:levels` 184, `roof:material` 11, `roof:colour` 14, `building:material` 155, `height` 40, `start_date` 8; centrum — wikidata 120, historic 66, `ref:nid` 29, `roof:shape` 190, `roof:levels` 305, `height` **351**, `roof:colour` 54, `building:material` 162. Asset side likewise: **241 chassis** (482 files), `git ls-files public/trees botanica` = **0**, 9 bark refs / **52** tracked files, **18** leaf packs, **10** dossiers, **10** `references/*/sources.json`. §5.2's own correction is landed and documented in place (`bake-buildings.js` — `parseFloat(tags.height)` replacing the impossible `typeof === 'number'` guard, with the 40/351 figures cited in the code).

**Still-live bleeds.** `hydrate-anchor-cards.js:28-30` hardcodes `LAT 38.6160 / LON -90.2161 / TIMEZONE_OFFSET_HOURS -6` under *"Update both if a different instance is ever added"* — **unchanged**; `skyGrid.js:160` `ANCHOR_CARDS = ANCHOR_CARDS_PROCEDURAL`, no per-Look variant · `public/clouds/fixtures/` **does not exist** · `useWeather.js` `temperature_unit=fahrenheit` hardcoded, `?? -21600` CST fallback · `InfoModal.jsx` has **zero** `INSTANCE` reads and 7 paragraphs of LS prose · `LegalPage.jsx` carries the "State of Missouri" governing-law literal while importing `INSTANCE` for contact fields only · **G3 zoning, four copies, two disagreeing**: `useListings.js:47` `D:'commercial'` · `bake-content.js:360` `D:'commercial'` · `SceneNeon.jsx:78` `D:'residential'` · `PlaceCard.jsx:45` labels.

**`NEIGHBORHOOD-INPUTS` spot-checks.** `src/data/buildings.json` 1082 · `landmarks.json` 87 · `street_lamps.json` 80 · hpdm `raw/elevation.tif` is a symlink to LS's · `content/profile.json` is read by **no** reader code (bake-content + comments only) — §3.1's A4 duplication defect, CONFIRMED.

---

## UNVERIFIABLE

- **(b)** `EXTENT-DESIGN §3.3`: "the tight re-fetch shrank **13,427→8,460** footprints with **zero renumbers** — verified." Requires a re-fetch; brief forbids it. The mechanism that would make it true is now in the code (registry + high-water), so the claim is plausible, but I did not confirm the measurement.
- **(b)** `INTAKE §0.5`: "**hipointe-demun** and **altadena** were both onboarded, poured and baked this way" / "Altadena is the first truly *end-to-end* intake→pour product." Both scenes are served from `clean/`, consistent with the claim, but the *route* they took is not recoverable from artifacts without a re-pour.
- **(a)** `EXTENT-DESIGN §2`: "**done** = zero scene-name branches / one identity scheme / one membership decision / one served path." Three of the four are testable and the gate tests them; "one membership decision, recorded per building (not re-computed in nine places)" has **no test at all** — §5.2 states the record does not exist, so the definition of done is partly unfalsifiable today. Flagging per brief §3.
- **(a)** `INTAKE-CATALOGUE`'s "**[unverified]**"-marked external URLs and licences (opentrees.org, Warsaw API, WorldClim v2.1 terms, ESA WorldCover, Copernicus HRL, Mérimée…). The doc marks them honestly; I did not fetch them. Its own instruction — *"confirm before any of this ships on a panel"* — still stands.

---

## CONTRADICTIONS ACROSS DOCS (code decides where it can)

| # | Disagreement | The code |
|---|---|---|
| 1 | Re-center threshold: `INTAKE §0.5` **>5 m guard** · `EXTENT-EXCAVATION §A2` **>100 m** | **Neither** — commit-extent no longer re-centers at all (`serve.js:1398`) |
| 2 | `src/data/*` name-imports: `EXTENT-DESIGN §2.1/§6` **19** · `served-parity.mjs` **17** · `BACKLOG:119` **13 static / 10 files** | **17** import sites across 5 files, per the gate the design itself names |
| 3 | Building identity: `EXTENT-DESIGN §0/§4` + `EXCAVATION §0.8` **fetch-index, unstable** · `served-parity` **UNSTABLE** | **Locked** — per-scene registry + high-water allocator (`fetch-msbf.js:179`) |
| 4 | HPDM size: `NEIGHBORHOOD-INPUTS §5.1.1` **2089 buildings / 212 listings** · `EXTENT-DESIGN §2/§6` **1281 / 192** | **1281 / 192** |
| 5 | Bleed inventory: `INTAKE-CATALOGUE §0` **"eight verified sites"** · excision brief **sites 9–14** (`ec159bad`) | Brief is current; catalogue's table also carries 4 fixed rows |
| 6 | `sides` field: `INTAKE §0.5` "**it is the mechanism**" · `ARCHITECTURE:364` "vestigial" · Altadena persists `borderStreets:[]` | Unresolved — `EXCAVATION` B5#4 flagged it; nothing has changed |

---

## SCOPE NOTE

Five docs, ~1,730 lines, one pass — comfortably bounded. I did **not** re-verify: `INTAKE-CATALOGUE §5.1`'s
footprint-vertex complexity table (median/mean/p90 per scene), `§4.3`'s ~100–150 operator-hour estimate
(no test exists), the arborist acquisition procedures beyond file/licence presence, or any external URL.
No pours, no bakes, no writes outside this file.
