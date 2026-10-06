# BRIEF — the NYC adapter: a city's measured record feeds the one pipeline

**You are the dispatched agent. Name yourself** — one word, yours, not one a RUNNING session holds
(`ListAgents`, then `/rename`). **Agent: FRESH** — this is a new subsystem on a new town; nothing an
existing window holds is load-bearing, and the state-adapter pattern you extend is fully in the code.

**Instruction: confirm-then-build.** Read the canon and the code sites below, tell Boz what you found (**report to the session `lafayette-square-nosync-d5`, NOT "Boz the Elder"** — two coordinator seats are running; the Elder runs a separate work group),
and if the code contradicts this brief — **stop and flag**. The stop is the deliverable, not a failure.

---

## 0. What this is (Jacob, 2026-10-05)

Jackson Heights (Queens Community District 3) is the next town, and NYC is the first **Ward Group**:
one shared adapter, many Wards (`The Ward Punchlist`, Jacob's dossier: *"one NYC building source is
better than forty downloads"* · *"replication without dilution"*). NYC publishes a record far richer
than OSM — measured curbs, medians, curb cuts, footprints with BIN and roof height, a tree inventory.
Jacob's concern: **do not throw away superior modeling.**

### ✅ RULED — how superior data enters (Jacob, 2026-10-05: "b")
The city's data enters the kit in **three ways only**, never as a second producer:
1. **As AUTHORING, pre-filled.** Measure the city's `CURB` against our centerline per block-side and
   write it as that frontage's width — as if an operator had surveyed every block. The kit then builds
   its curb exactly as it does for every town. The operator can override any of it.
2. **As EVIDENCE for checks.** The city's curb, median and curb-cut geometry become the ground truth a
   check measures our construction against. This is the first town where the kit can be graded.
3. **As SOURCES** in the existing union-of-wells sense — footprints, trees, parcels/land use.

⛔ **Never** draw a town's blocks from city polygons. That is a second construction path: NYC would be
built differently from every other town, and it would prove nothing about town #3 (`CLAUDE.md` Layer 0;
`ORIENTATION` "every scene routes through the same pipeline").

⛔ **The operator runs Extent.** The adapter makes Extent's fetch NYC-aware; it never fetches beside it.
No hand-picked envelopes, no side downloads into a scene (Jacob: *"if you're doing extent work I should
just do it in extent"*).

---

## 1. Read first (canon, by section)

- `ORIENTATION.md` — whole; `CLAUDE.md` Layer 0 (all three questions).
- `cartograph/PIPELINE.md` steps 0–4 and §5 (the Wall).
- `EXTENT-DESIGN.md` §1, §3.3, §4 (the seal = the identity registry).
- `cartograph/SURVEY.md` §4 (the authoring panel — what a width write IS).
- `ROADMAP.md` **A23** (a machine value in the operator's authoring file must record its author) and
  **A09** (OSM node tags dropped at ingest).
- `cartograph/BAKE.md` §4.5 (a census is the union of its wells).
- ⭐ **The state adapters are new (2026-10-05, Sward) — read the commits whole before writing a line:**
  `git show 09e8ee84` (the state records: wells + vocabularies; a town's state is the one its OWN OSM
  `addr:state` votes; sub-state wells allowed) and `git show 301da475` (USDA Cropland Data Layer,
  `cartograph/cdl.mjs`). ⛔ **The NYC adapter is a NEW YORK state record with NYC wells inside it — not a
  parallel mechanism** (Boz the Elder, 2026-10-05). California is parked (`ROADMAP H2`); do not build it.

## 2. Code sites (cite symbols; line numbers drift)

| what | where |
|---|---|
| the state-adapter resolver — `resolveFromState`, `STATES`, `LAND_USE_READERS` | `cartograph/states/index.mjs` |
| a sub-state well (an independent city's assessor) — the precedent for NYC | `cartograph/states/mo.mjs` (`stl-city`) |
| where wells are resolved for a town | `cartograph/sources.js#readSources` (parcels), `#readAddressPoints…` (address points) |
| the footprint fetch + the identity lock | `cartograph/fetch-msbf.js`, `cartograph/msbf-identity.js` |
| Extent's fetch, run from the server | `cartograph/serve.js` (grep `fetch-msbf.js`) |
| tree census wells (two entry points — add to BOTH) | `cartograph/tree-bake-inputs.mjs`, `arborist/bake-trees.js` |
| the street-level authoring prebake reads | `cartograph/derive.js` (`overlayById` / `overlayLoops`) ← `clean/overlay.json` |
| the per-frontage width the curb is built from | `src/lib/tileGround.js` `edgeDepth`, `freezeCurbEdgeFacts`, `runMeasure` |

## 3. The shape

**3.1 The adapter is a state adapter with a sub-state city.** `cartograph/states/ny.mjs`, NYC as a
sub-state jurisdiction exactly as St. Louis City sits in `mo.mjs`. A Jackson Heights `sources.json`
declares `"state": "NY"` and takes its wells `{ "from": "state", "id": … }`. ⛔ The resolver's
no-fallback rules stand: unknown well / missing selector THROWS.

**3.2 New KINDS of well.** Today a state carries `parcels` and `addressPoints` only. NYC needs:
- **`buildings`** — NYC Building Footprints (NYC Open Data `5zhs-2jue`: `bin`, `base_bbl`,
  `height_roof`, `ground_elevation`, `construction_year`, `feature_code`). ⭐ **BIN is a municipal
  permanent id** — decide with Boz whether the identity lock keys on it (a stable id the city
  maintains) rather than on a centroid. MSBF stays the fallback the kit already uses elsewhere; on an
  NYC town the city's footprints are the well, and the pour must SAY which supplied each building.
- **`trees`** — NYC Forestry Tree Points (`hn5i-inap`, live: `genusspecies`, `dbh`, `tpcondition`)
  and the 2015 Street Tree Census (`uvpi-gqnh`). Union, dedupe by proximity, never one-wins.
- **`parcels` / land use** — MapPLUTO, through `LAND_USE_READERS` with an NYC vocabulary.
- **`surfaces`** — the planimetric layers: `CURB`, `CURB_CUT`, `MEDIAN`, `SIDEWALK`, `ROADBED`,
  `PAVEMENT_EDGE`, `PLAZA` (2022 planimetrics; layer list read from the geodatabase catalog).

⚠️ **Prefer fetching per envelope from NYC Open Data** over reading the 415 MB local geodatabase —
that is the kit shape (Extent fetches what the envelope needs, for any NYC town). Verify each layer's
Open Data id before relying on it. The local copies in `~/Desktop/dev.nosync/NYC_Ward/` are reference
and a fallback for inspection only. GDAL (`ogr2ogr`) is installed on this machine (2026-10-05).

⛔ **Units.** NYC data is EPSG:2263 (NY State Plane Long Island, **US feet**). Reproject at intake into
the kit's frame. A metre-assuming constant downstream is Layer 0's Class D trap.

**3.0 ✅ RULED (Jacob, 2026-10-05) — STEP 0: a town's WEB ADDRESS is its id, stated in Extent.**
Jackson Heights' id is **`jacksonheights`** (jacksonheights.online); its display name is "Jackson Heights".
Extent cannot produce that pair today: the scene id is `sceneIdForName(name)` (`src/lib/sceneSlug.js`)
and the Pour's Look id is `slugify(name)` (`serve.js` POST /looks) — "Jackson Heights" → `jackson-heights`.
- Add a **web-address field** beside Name in Extent (labelled as the address, e.g. `____.online`),
  defaulting to `slugifyName(Name)`, editable, validated by `sceneIdForName`'s rules (clean slug, not
  numeric, not taken) and **refused loudly** — never auto-suffixed. The Fetch rename targets it.
- The Pour passes it to `createLook`; POST /looks accepts an explicit id (refused if taken; ⛔ no `-2`).
- Check: extend `checks/claims-a-scene-is-named-not-numbered.mjs` with name ≠ id ⇒ scene id = Look id =
  the stated address. Mutation-tested.
- ⭐ **The address is OPERATIONS' (Jacob, 2026-10-05).** A town's name is the part of its Ward's Domain
  before the dot (`theward-operations` README "A town's name is its address"). The field asks Operations
  through the call Promote already makes — `cartograph/operations-domain.mjs` →
  `GET /api/production-domain/<name>` — and shows the answer beside it (Ward found · domain · owned ·
  zone status). No new Operations permission.
- ✅ **No Ward yet is NOT an error and NOT loud (Jacob):** the pour proceeds, and the field simply says
  no Ward has that address yet. Its only consequence is that Promote cannot ship to production without a
  production location — and Promote already refuses on that. ⛔ Do not add a warning, banner or block.
  ⚠️ Operations unreachable is different from "no Ward": say it could not be asked, never "none".
- ⛔ **Land before step 3, and before anyone runs Extent on Jackson Heights.**

**3.2a ✅ RULED (Jacob, 2026-10-05) — all three in this brief:**
- **BIN is the building identity** where a well supplies a permanent municipal id; the identity lock
  keys on it, and falls back to the centroid key only where no such id exists. ⭐ Kit-general: the
  WELL declares whether it carries a permanent id. Extent's unconditional `fetch-msbf.js` becomes
  conditional — MSBF only where the town's state lists no building well — and the pour prints which
  well supplied each building.
- **A Socrata (NYC Open Data / SoQL) fetcher.** A well declares its protocol; ArcGIS stays as it is.
  `select.where` becomes protocol-aware. ⛔ The no-fallback throws in `resolveFromState` apply to both.
- **Trees become a well kind** in the state record — Forestry Tree Points (live) ∪ the 2015 census,
  deduped by proximity, provenance per tree. It feeds BOTH tree entry points (`tree-bake-inputs.mjs`,
  `bake-trees.js#SOURCE_BY_BASENAME`). ⭐ St. Louis's one-off `scripts/13` fetch should become MO's
  tree well by the same mechanism — note it, do not fold it in unasked.
- **`addressPoints` — NYC AddressPoint (`uf93-f8nk`), the city's 911 dispatch layer** (*"some computer
  aided dispatch systems use address points as the primary source"*). It is the existing `addressPoints`
  kind, exactly as Ohio's LBRS is Huron's. Carries `bin`, `full_street_name`, `house_number`, and
  `sosindicator` (side of street). ⭐ Measured by Boz on a 358-point sample in 11372: **every point lies
  inside its own building's footprint, ~1.5 m in from a wall, and 355 of 358 in the half facing its
  address street (306 within the front 15% of the depth).** ⇒ it names each building's FRONT and the
  street it faces. ⛔ Whether its position ALONG the front marks the door: not established.
- **`buildingAttributes` — Building Elevation and Subgrade (`bsin-59hv`, DCP 2023)**, joined by BIN:
  `z_grade` (lowest adjacent grade), `z_floor` (lowest active floor), `subgrade` (Y/N), `notes2`
  (ground-floor use: commercial / garage / lobby), `notes3` (basement access: door or window ·
  walkway or driveway leading down). Acquire and join only — **no geometry in this brief.** It feeds the
  facade-family work (stoops over areaway stairs, steps up, shopfronts at grade). ⚠️ `z_grade` is the
  LOWEST adjacent grade — the bottom of an areaway, not the sidewalk; the dataset records no street
  level. Measured in CD3 (Boz): 14,536 buildings; 2,362 have a raised first floor (≥4 ft) AND a walkway
  down to the basement — the stoop-over-stairs rowhouse.
- ⭐ **Width evidence, not used as input here:** the city centerline (`inkn-q76z`) carries
  `streetwidth`, `number_travel_lanes`, `number_park_lanes`. The §3.3 rung is measured from `CURB`;
  these may serve a check.
- `CURB_CUT` is not on Open Data; it is a declared FILE well from the 2022 planimetrics geodatabase
  (GDAL is installed), acquired here, consumed by `BRIEF-corner-ramps-and-kerb.md`.

**3.3 The city's width enters NATIVELY, as one rung of the curb's own resolver — ✅ RULED (Jacob, 2026-10-05).**
*(Supersedes "pre-fill as authoring": Kerb's confirm-pass found no home that is per-block, per-scene and
off the open `segOrd` key — `overlay.json` is per chain-side, `blockCustoms` is per-Look and on the open
key. Jacob: build it native and choose our process "at the step when the curb ring stamps the street
fes".)*
- **The step:** under ① every curb edge takes its width from `protoMeasureOf(label)` in
  `src/lib/tileGround.js` — today *operator override (`bcOf`) ?? the frozen base (`protoBase`)*, per ①
  edge label (`protoOwners[label]` = skelId · side). ② is ① pushed in by that value per edge.
- **The rung:** *operator override ?? **the city's measured width for this ① edge** ?? the kit's base.*
  The operator still wins; the kit's base is unchanged where the city says nothing.
- **Native and two-sided by construction.** ① already splits every street into its two sides, each its
  own labelled edge. Measure the city's `CURB` **perpendicular from that ① edge**. ⛔ Not
  `outerHWProfile` (one-sided and carriageway-gated **on purpose**, because of ①), not a vertex-position
  profile, not `segOrd`, not `overlay.json`, not `blockCustoms`, and not `survey.json`'s name-keyed path.
- **Measured at the pour, frozen with ①.** Right after ① is minted in prebake (`derive.js`,
  `mintProtopolygon`), measure each edge against the city's curb and freeze the value beside ①'s
  labels in the artifact, with its source (`nyc-planimetrics-2022`). Nothing is written to any
  operator file, so `ROADMAP A23` does not arise.
- ⛔ **No silent fill.** An edge the city has no curb for, or whose measurement is degenerate, carries
  **no** measured value (never a 0, never the base copied in), and the pour **counts and prints** them
  per town. ⭐ The operator must be able to tell "measured" from "kit default" on every edge.
- ⚠️ **Confirm before building:** ①'s labels are indices into the frozen ①, so a re-pour re-measures
  every edge. Say whether that holds end to end (pour → Survey → Section → bake) and whether any
  consumer reads `protoMeasureOf` somewhere the measured rung must also reach.
- ⭐ Kit-general: any town whose city publishes a curb layer gets the same rung; NYC is the first.
- ✅ **Confirmed by Kerb (read-only, 2026-10-05): ①'s labels hold pour → Survey → Section → bake**
  (`protoOwners = MP.owners` from the frozen artifact; build-time labels only append). Three
  requirements follow, all already doctrine:
  1. **Every width reader takes the rung — one resolution everywhere (`SECTION §3.3` step 1).** Section
     does NOT call `protoMeasureOf`: frozen runs carry `baseMeasure: protoBase.get(skelId)` and Section
     resolves `stampMeasure` / `edgeDepth(run.baseMeasure…)` as override ?? base, skipping the city.
     ⇒ the measured value must reach Section's resolution too, so Survey and Section agree.
     ▶ Gate: `node checks/claims-survey-and-section-agree.mjs` must stay at 0 m² with the rung live.
  2. **A live re-mint of ① carries no measurement — disclose it.** If the frozen ① is missing / empty /
     ε-mismatched, tileGround re-mints ① live (`protoSource = 'live: …'`) and every edge falls to base.
     ⇒ print its own line, *"measured rung ABSENT: ① is live"*, so "no city width" never passes for
     "the city says base".
  3. **The Survey/Measure handles' miss fallback** (`SurveyorOverlay` `meas`, `MeasureOverlay` `pavHW`
     fall back to the chain base on a raycast miss) must fall back to the RESOLVED width, measured
     rung included — or say so where they cannot.

**3.4 The checks — the deliverable.** Each RED-until-true, mutation-tested:
- **curb vs city curb** — per ① edge, with authoring LOADED, the distance from our curb to the
  city's `CURB`. Reports which blocks disagree and by how much. ⛔ Never run with authoring off
  (`POLYGON-FIRST §5` Rule 1); an unmeasurable block is its own failing class (Rule 2).
- **median vs city median** — our median blocks against `MEDIAN`.
- **every building sourced** — each building names its well (city / MSBF / OSM).
⭐ These generalize: any town whose city publishes a curb layer gets graded the same way.

**3.5 Out of scope here.** Corner ramps / crosswalks / raised kerb → `BRIEF-corner-ramps-and-kerb.md`
(`CURB_CUT` is consumed THERE; this brief only acquires it). Elevated surfaces (the 7-train viaduct,
piers) → their own current item. Roofs from the 2014 3D model (`NYC_3DModel_QN03.3dm`, unjoined
LOD1.5/2 pieces) → later; heights come from footprints first. Transit / 311 / live feeds → the Ward.

## 4. The chain — what this trusts, what trusts this

- **Trusts:** the Extent seal (frame origin frozen — reprojection must land in THAT frame) · the
  skeleton's skelIds (the pre-fill is keyed on them) · the resolver's no-fallback contract.
- **Trusted by:** prebake (reads overlay) → the curb (`edgeDepth`) → Section → the bake. A wrong
  pre-fill freezes into every downstream artifact (`PIPELINE` Law 2). Hence the check in 3.4 runs
  BEFORE anyone trusts the pour.

## 5. Can the instrument see the change?

The curb check must read the curb the operator SEES — Survey renders live, Section renders the frozen
`shape.json`, and `shape.json` is written on Survey-exit (`PIPELINE §5`, "who writes the frozen
file"). State which artifact your check reads and confirm it carries the pre-filled widths.

## 6. Validation surface

The production path, through **Extent → Survey** on Jackson Heights. ⛔ No parallel SVG/scratch
renderer. Eye-gate: Jacob in Survey over the aerial, scene recorded.

## 7. Bounds

- Writes: `cartograph/states/ny.mjs`, the wells' fetch/ingest code, the checks under `checks/`.
- ⛔ Canon is off-limits except the registers your landing reaches (`OPERATIONS` "Declare the well",
  `FEATURES`) — name them in the commit, or say "reaches no register."
- ⛔ **Another work group is active (Boz the Elder).** Before saving anything under `cartograph/` or
  `src/`, confirm with Boz that their bake freeze is lifted — a save restarts `serve.js` under
  `--watch` and kills a running bake.
- Commit through explicit paths only (`git commit -- <paths>`), never the shared index (`BOZ §3.7`).
- Surface scope drift; don't absorb it.

## 8. Done when

`ny.mjs` resolves Jackson Heights' wells; Jacob runs Extent on Jackson Heights and the pour prints
what each well supplied; Survey opens with stamped, city-measured widths; the 3.4 checks run and are
mutation-tested; Jacob's eye in Survey.

## 9. STATE — 2026-10-06 (Kerb, end of night 1)

**Landed** (each commit carries its proof; ▶ the check named is the receipt):
- Step 0 web address `d9832ccf` · join-a-declared-folder fixes `ee16b44d` ▶ `claims-a-scene-is-named-not-numbered`
- Step 1 `states/ny.mjs` + well `protocol` `8c522747` ▶ `claims-a-state-gives-its-towns-their-wells`
- Step 2 Socrata reader + NYC AddressPoint `d50a1e66` ▶ `claims-socrata-reads-the-whole-envelope`
- Step 3a one id minter + one footprint resolver `d8cc66d1` ▶ `claims-one-building-id-minter`
- Step 3b NYC footprints by BIN, BES, by-BIN addresses, JH declared `fc490aaa` ▶ `claims-a-city-building-keeps-its-permanent-id`
- Extent fetches every declared well `00f4dcf1` ▶ `claims-extent-fetches-every-declared-well`
- Step 4 trees as a well kind + the supersession ruling `cd700124` ▶ `claims-a-tree-well-plants-only-standing-trees`
- Tide: a named station `dc985658` ▶ `claims-a-tide-station-is-in-the-water-or-named`
- A coast outside the drawing is no shore — terrain `b6dd1e17`, every shore step `a9221469` ▶ `claims-a-coast-outside-the-drawing-is-no-shore`

**Open:** step 5 surfaces (CURB `5xvt-8cbk`, MEDIAN `ees7-4ufv` on Socrata; CURB_CUT a FILE well from the 2022 gdb) ·
step 6 the §3.3 measured rung (incl. Section's own resolver, the live-mint disclosure, the handle fallbacks) · step 7
the curb/median checks (§3.4). Jackson Heights owes a re-bake (its `clean/map.json` is gone after the last rollback).
**Not this brief's, handed to Boz:** a JH tree-species-map (arborist; absent resolves EMPTY) · holed footprints
unsupported end to end, OSM's too (Jacob) · 598 BINs with several city addresses → null + candidates (Jacob) ·
`land_area` has no unit (ROADMAP) · huron's ArcGIS address `--dry-run` sample query 400s (pre-existing).

**Traps a fresh agent will hit:**
- A Socrata well's column list is `columns`, never `select` — `resolveFromState` strips `select` (the town selector).
- Declare an NYC town's `sources.json` BEFORE its first Extent fetch: the identity registry seals on that fetch.
- Saving anything `serve.js` imports (`sources.js`, `states/*`, `tree-bake-inputs.mjs`…) restarts it — mutation-test
  restores included. Mutate a COPY, or run `node scripts/bake-in-flight.mjs` and ask first.
- NYC BIN: normalise once (`permanent-id.mjs`); `x000000` placeholders are not ids; BES serves `4043753.0`.
- `bake-terrain.js` refuses to load without a scene — its pure helpers live in `coast-in-drawing.mjs`.
- `coastRings` closes against the FETCH bb; only `coastVerdict` / `ringsInDrawing` say what is in the town's drawing.
- Commit through a private index built from HEAD; when a file carries a peer's hunks, commit a blob of HEAD + yours.
