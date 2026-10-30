# BRIEF — a town lists everything: every place, its hours, its pictures, and its history, each from a declared source

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-26 (planning agent for Boz; claims read against integration fc08a4c8)
evict-when: every source below has a registry row with terms quoted; PTown's listing and history wells are declared and baked through bake-content.js (no scratch builder); the MHC inventory feeds per-building facts on PTown's cards; the source-class check (§7) exists, fails on a mutant, and is green per town or names each gap; Jacob has seen the pitch landmarks on staging. Then this moves to cartograph/_archive/ dated.
-->

**Agent: FRESH, one at a time** (Jacob is conserving tokens). **Report to Boz.** **Instruction: confirm-then-build**; the
claims below were read on 2026-10-26 and are claims to you. **Owner's ask (Jacob, 2026-10-26):** *"list every single thing we
can in Provincetown … the chamber, the PBG, the Masonic lodge … hours and pics … the historical registry info … tons of info,
images, historical items in the placecards … We can list it in the inputs panel."* Pitch to the Pilgrim Monument in ~a month.
**Rulings folded in:** *"All sources need to be added to the kit check. If we found something useful in one place using one
resource, we should attempt that same success elsewhere."* (Jacob via Boz, 2026-10-26) · **historic is a BUILDING'S
PROPERTY, not organised around districts; membership is Extent authoring** (Jacob, 2026-10-21).

## 0. Where it stands (M = measured, with the command; I = inferred)

- **M** `content/listings.json` (PTown): 446 listings, 377 `osm` + 69 `research`; hours 56, description 179, photos 8,
  history 32, `opening_hours_raw` 24. ▶ `node -e` over `.listings`, counting each field non-empty.
- **M** `listings.overrides.json`: 69 adds, 116 patches, 0 drops (same `node -e`).
- **M** Pitch landmarks: Pilgrim Monument, Town Hall, PAAM, Public Library, Chamber of Commerce, FAWC each carry history +
  hours (all but the Chamber a photo). MacMillan Wharf has history only. **King Hiram's Lodge (2 Masonic Place) has no
  listing**, and OSM carries no 2 Masonic Place address (OSM has 5, 5½, 6, 7, 8). ▶ name regex over listings; addr scan of `raw/osm.json`.
- **M** OSM is thin on hours: 29 of 1,220 PTown POIs carry `opening_hours` (count over `raw/osm.json .pois`).
- **M ⚠ The "52 held places" premise is ROT.** `HELD.txt` has 53 drop lines naming 39 places (Wick and PBG list some twice).
  Commit `eda67ea1` (2026-09-25) landed them after the slab's buildings became the MSBF ∪ OSM union with merged-twin
  `joinRings` tested: 35 of 39 now match a listing by name. **Still held:** MacMillan Pier, Breakwater Hotel (716 Commercial),
  Flyer's Boats, and "7 Masonic Place Guest House" (it may be listed as "Guesthouse at 7 Masonic Place"; not confirmed).
- **M** The drop happened in **scratch builders**, not the kit: `scratch/provincetown-held-places/build.mjs` and `wick.mjs`
  require containment and drop before writing an add. The kit's own `bake-content.js#applyListingOverrides` re-anchors an
  add by address → parcel, then x/z ≤ 60 m, and records `add_dropped`. So the research ran on a parallel path (§2).
- **M** The kit has an NR well: `content/nr-inventory.json` → `buildNrIndex` keyed `housenum|street` → roster `year_built`,
  `style`, `contributing`. HPDM has one (221 rows, OCR'd from its nomination); PTown has none; LS's came from
  `assets/lafayette-square-hd.pdf` → `inventory/*.csv`.
- **RULED (Boz, 2026-10-26, on Jacob's 2026-10-21 words: "We've never used the word District in our lives"):** the district
  machinery is agent-introduced intent that Jacob never ruled (162a084b, 266d3505), so it is ROT against a later ruling.
  `loadDeclaredDistrict`'s throw, `districtOf`'s derived membership and `historicDistricts` go when the MHC well lands, in the same
  commit, which names what was removed. A building carries its own listing facts (NR-listed or contributing, MHC id, date, style,
  architect) where its record supports them. Membership stays Extent's.
- **M** MHC is unread by the kit: `git grep -i 'mhc\|macris'` over cartograph/src/scripts/references/docs/checks: 0 files.
  GDAL is present (`/opt/homebrew/bin/ogr2ogr`, `ogrinfo`; OpenFileGDB driver opens the zip via `/vsizip/`). No fiona.
- **M** `references/registry.json` has 65 sources and **no row for** MassGIS (whose L3 parcels PTown already uses), MHC,
  NPGallery, LoC, the Chamber, or the PBG (lower-case substring counts). It does have `osm`, `wikipedia`, `us-census-geocoder`,
  `nps-night-skies` PERMITTED. ⚠ Its README scopes it to "standards and manuals"; using it for data sources widens it.
- **M The inputs panel** = `cartograph/intake-rows.mjs` (row definitions; status computed from disk) rendered by
  `src/cartograph/SourcesPanel.jsx` (the Extent app). There is one `content` row (`overture-places`). There are no rows for
  listings research, hours, photos or history. The operator-added, jurisdiction-keyed store `cartograph/intake-sources.json`
  is read by intake-rows.mjs but **absent on disk**.
- **M** PlaceCard has no season on hours: `git grep -ic season` in `PlaceCard.jsx` and `bake-content.js` gives 0.
  `hours` is `{weekday:{open,close}}`; `history` is `{year,event}[]`; `photos` is `{url,credit,credit_url}[]` (`ls/PLACE-CARDS.md §2`).

## 1. Sources (a CLASS, then PTown's instance). Terms "unchecked" = do not read (`references/README` rule 1)

| Class → PTown instance | Yields | PTown coverage | Terms | Route |
|---|---|---|---|---|
| National register nomination → NPGallery 89001148, Provincetown HD (1989) | per-building history, date, style, contributing; photos (often third-party) | 123 pp (M, `pdfinfo`); rows uncounted | unchecked (NPS federal works have a standing acceptance on `prowag-2023`; each photo credited to a third party is excluded) | in hand: `WARDSTUDY/MA/Provincetown_HD_NRHP_1989.pdf` |
| State SHPO inventory → MHC inventory GDB (MACRIS's data, June 2026) | per-resource name, date, style, maker, use, significance, designation, MHC id, point/poly | statewide 227,573 points, 7,168 polys (M, `ogrinfo -so`; layer metadata only); PTown count not taken | unchecked | in hand: `WARDSTUDY/MA/MHC_Inventory_GDB.zip` |
| SHPO per-building forms → MACRIS Form B scans (also hosted by the PHPP) | narrative history, photos | unmeasured | unchecked | fetch, after terms |
| Local historical archive → Provincetown History Preservation Project | Form B PDFs, archival photos, oral history | unmeasured | unchecked (archival photos are usually rights-reserved; I) | fetch text after terms; photos via permission |
| Business guild directory → PBG 2026 guide | name, address, phone, site, section | 244 entries (M, `pbg.json`) | Jacob's own copy; he worked there (consent stands, from the 2026-09-25 brief) | in hand |
| Chamber of commerce → Provincetown Chamber | member list, categories, hours, photos | unmeasured | unchecked; member data and photos are copyrighted (I) | Jacob's contact: an export with written permission |
| Institutions' own sites → King Hiram's Lodge, churches, library, FAWC, PAAM, Monument & Museum | hours, history, images | unmeasured | per site, unchecked | fetch facts after terms; images via permission |
| Open map → OSM | listings, `opening_hours` | 29 of 1,220 POIs with hours (M) | PERMITTED (`osm`) | already fetched |
| Open places → Overture | listings base | row exists (`overture-places`) | licence per record (intake-rows) | button |
| Assessor → MassGIS L3 parcels | address, `year_built`, use, `historic_district` | 4,955 parcels (M, `ma_parcels.json`) | **no registry row** (in use off-book) | already fetched |
| Free media → Wikimedia Commons | photos | 7 of 8 photos credit Commons or the USCG (M) | licence per file; `wikipedia` row covers text, not Commons media | fetch, credit per file |
| Federal images → LoC bird's-eye views (c.1877, c.1910) | historic images | unmeasured | unchecked (often "no known restrictions"; I) | fetch after terms |
| Denomination directories (e.g. the Episcopal Asset Map, `INTAKE-CATALOGUE §3.2b`) | service times | unmeasured | unchecked | fetch |

## 2. The kit method (town #2 inherits it; no parallel path)

1. **Every source is a registry row** (`references/registry.json`): a `class` (national-register · state-inventory ·
   state-forms · local-archive · business-guild · chamber · institution-site · open-map · free-media · federal-images),
   `jurisdiction`, terms quoted. A town's **instance** of a class is a second row naming the town (or a state row a town
   inherits). ⛔ No source is used off-book: MassGIS parcels get a row in step 1.
2. **A town declares its wells in `sources.json`**, beside `parcels`: `listings[]`, `history[]`, `photos[]`, each naming a
   registry id, or `*_absent_reason`. Validated in `cartograph/sources.js` like parcels (malformed throws; "none" is a finding).
3. **Each well becomes an `intake-rows.mjs` row** (domain `content`), status computed from disk, so it shows in
   SourcesPanel per town. Jurisdiction-wide classes (MHC for MA) go in `intake-sources.json`, which that file already reads.
4. **One producer: `bake-content.js`.** A well lands a raw artifact (`raw/<well>.json`); bake-content joins it. The scratch
   builders retire: research output becomes overrides through `applyListingOverrides`, never a script that drops first.
5. **Join by geometry and address, never a hand table:** point → containment in the baked footprint (`rings` +
   `joinRings`, as now); address → parcel → building as a second witness. ⛔ Where the two disagree, the bake REFUSES by
   name until the operator decides (merge or keep apart, in the town's overrides); never pick silently, and never ship the duplicate
   (Boz, 2026-10-30, with Zob: a shipped duplicate is the plausible-looking success Layer 0 forbids; it was "report"). A place with no footprint (a pier, a beach, a
   lighthouse off the slab) is a **class**: cause for Breakwater/Flyer's not established; the pier needs a non-building
   anchor, which today's orphan invariant (every `building_id` in the slab) forbids. Boz to rule whether a listing may
   anchor to a land-use or water feature.
6. **The operator's overrides win**, keyed by `_key`, as now. Every machine fact carries `_source` (registry id + page or
   record id) and `_fetched`; history entries carry their source per entry.

## 3. The MHC inventory join (per building; no area layer, per the 2026-10-21 ruling)

- **Read:** `ogr2ogr -f GeoJSON` from `/vsizip/…/MHC_Inventory.gdb MHCINV_PT` with `-where "TOWN_NAME='…'"`, reprojected to
  WGS84, into a new well reader (`fetch-mhc.mjs` or the state record `cartograph/states/ma.mjs`). GDAL is a system tool:
  ⛔ the pour must fail loudly if `ogr2ogr` is missing, never skip. MHCINV_POLY (areas, districts) is **not** a membership
  source under the ruling; read only to attach a district name as a fact if Boz says so.
- **Match:** point in baked footprint, then `ADDRESS` vs the parcel address (the existing `addressKey`/`streetKey`); both
  agreeing = joined; one = joined with `_confidence`; conflict = reported. `DEMOLISHED` set = no join, counted.
- **Map:** `HISTORIC_N` → card historic name (beside the business name) · `CONSTRUCTI` → `year_built` where the parcel's is
  empty, else both shown with sources · `ARCHITECTU` → `style` · `MAKER` → architect · `USE_TYPE`, `SIGNIFICAN` → history
  text · `DESIGNATIO`+`D_DATE` → a history entry `{year, event}` · `MHCN` → the link to the Form B (step 5).
- This replaces hand-OCR (`nr-inventory.json`) for MA towns; the nomination PDF stays the narrative and photo source.

## 4. Photos and hours

- **Hours:** OSM is thin (29 POIs). Realistic wells: the business's own site, the Chamber export, the PBG guide (address
  and phone; check whether it prints hours), LibCal for libraries, denomination maps for services. ⭐ **Seasonal rule
  (`INTAKE-CATALOGUE §3.2b`):** PTown is a seasonal town; hours carry the season they belong to or are not written. The
  model has no season field today (M), so step 6 is a schema extension of `menu.schedule`'s pattern (that section's ruling),
  not a new model.
- **Photos:** Commons (credit per file) and LoC/NPS federal images can be fetched after terms. Business photos, Chamber
  images, PHPP archival photos and the nomination's third-party photos need **written permission**; until then, none.

## 5. What surfaces where

- **Place cards:** history timeline, historic name, style, architect, year, photos with credits, seasonal hours.
- **Inputs panel (SourcesPanel):** one row per declared well per town, with its status and terms.
- **Pitch first:** Pilgrim Monument (+ the dossier and the Internet Archive copy of *The Pilgrims and their Monument*, both in hand),
  Town Hall, MacMillan Wharf (needs a photo and hours), PAAM, King Hiram's Lodge (no listing: add by parcel address),
  the Library, the PBG businesses.

## 6. Replicate elsewhere (class × town). known = in use · candidate = exists, unchecked · none = not looked for

| Class | LS (MO) | HPDM (St. Louis, MO) | Huron (OH) | Altadena (CA) | Jackson Heights (NY) | PTown (MA) |
|---|---|---|---|---|---|---|
| National register nomination | known (`lafayette-square-hd.pdf`) | known (`nr-inventory.json`) | candidate | candidate | candidate | in hand |
| State SHPO inventory | candidate: Missouri SHPO survey | candidate: Missouri SHPO | candidate: Ohio Historic Inventory | candidate: CHRIS (restricted access, I) | candidate: NY CRIS | in hand: MHC |
| City landmark body | candidate: St. Louis Cultural Resources Office | same | none | candidate: LA County | candidate: NYC LPC reports | none |
| Local archive / society | none | none | candidate: local historical society | candidate: Altadena Historical Society | candidate: Queens/JH societies | candidate: PHPP |
| Business guild / directory | none | none | none | none | none | in hand: PBG |
| Chamber of commerce | candidate | candidate | candidate | candidate | candidate | candidate (Jacob's contact) |

All "candidate" names are inferred from general knowledge; none has been fetched or had terms read.

## 7. Proposed check (not built): `checks/claims-a-town-declares-its-source-classes.mjs`

Reads the registry's classes and their jurisdictions, and each town's `jurisdiction.json` + `sources.json`; **fails** when a
class has an instance row for the town's jurisdiction (national, its state, its city) and the town neither declares it nor
gives `*_absent_reason`. Also fails when a declared well names a registry id whose `terms.aiUse` is not `permitted`.
Mutation tests: delete PTown's MHC declaration → red; set MHC's terms to `unchecked` → red. Reads the source, restates nothing.

## 8. Work list (one agent at a time; S ≈ an hour, M ≈ half a day, L ≈ a day+)

1. **S** Terms pass (no content reads): registry rows + quoted terms for NPS/NPGallery, MHC/MassGIS (incl. parcels), PHPP,
   Commons, LoC; the class field. Run `claims-references-are-sound`.
2. **S** ~~the district throw~~ (removed with the MHC well, 55e721bb). Open: non-building anchors (Jacob).
   **FOR JACOB'S EDIT BUILDINGS — footprint-authoring defects (Boz, 2026-10-26; don't code around them):** one MSBF
   footprint covers two recorded buildings, so the MHC join writes no facts for either. **msbf-955** = the Atlantic House
   (Union Hotel, 6 Masonic Pl, MHC PRO.272) + King Hiram's Lodge (222 Commercial St / 2 Masonic Place, PRO.273; the Lodge's
   listing prov-lst-0450 sits on it). **msbf-474** = Provincetown Town Hall (260 Commercial St, PRO.289) + the Congregational
   Church of the Pilgrims (258 Commercial St, PRO.288), with PRO.281 and PRO.287. The whole class, by name, every bake:
   ▶ `node -e 'r=require("./cartograph/data/provincetown/content/roster.json");console.log(r.meta.history.fact_conflicts.filter(x=>/footprint/.test(x)).join("\n"))'`.
3. **M** MHC well: the reader, declared in PTown's `sources.json`, an intake row, the join + report in bake-content. Dry-run counts.
4. **M** Pitch cards: the Lodge (add by parcel), MacMillan Wharf photo/hours, Monument from the dossier; history entries from the nomination.
5. **M** Nomination: extract per-building rows (text pages, federal) into the history well; photos only where not third-party.
6. **M** Seasonal hours: the schema extension + PlaceCard; then hours from sites/PBG/Chamber, season marked.
7. **L** Chamber export (after Jacob's permission): listing well, matched through `applyListingOverrides`.
8. **S** The §7 check, mutation-tested; then Jacob passes the cards on staging.

## 9. Jacob's rulings (2026-10-26), which replace the questions

1. **Use what we can get now.** The Chamber export is optional (Jacob can get it); coverage is already good for the demo.
2. **The PBG guide's images may be used.** Jacob takes responsibility and takes them down on any request.
3. **Gather what we can from public sources**, organisations' sites included: *"the pitch is that we can do all the stuff they're
   doing and we're not relying on the www for connections or content."* We cease and desist at the first request. ⇒ Every source
   still gets its registry row: terms read and QUOTED, plus `basis: "Jacob 2026-10-26: gathered publicly; removed on first
   request"` where the terms don't grant reuse, and a takedown path (per source, per item). Rule 1 still holds: no row, no read.
4. **Places with no building are real places and are listable** (MacMillan Pier, beaches, lighthouses). How they are SHOWN is
   open design. Jacob's idea, filed: a 360° pan from a lighthouse.
5. **The pitch is covered; everything from here is polish, but important polish.**
