# BRIEF — the Intake Manifest: the last unbuilt step in the kit

**Agent: FRESH.** — the enumeration below replaces the discovery this needed, so there is no prior session-context worth inheriting; a fresh agent reads the canon and builds to a settled list. ⚠️ **Serialize against `BRIEF-boundary-partial-edges.md`** — both rewrite `cartograph/serve.js` and `src/cartograph/ExtentApp.jsx` (that brief touches `computeBoundaryFromSelection` + the Boundary panel; this one adds an Intake panel to the same component). Do not run them concurrently (`feedback_load_bearing_files_serial_dispatch`).

**You are building the stage that makes a pour reproducible by someone who is not Jacob.** Everything downstream of it — skeleton, survey, section, bake, slab — is built and works. Everything upstream of it is currently a collection of scripts, one-off fetches, and things that live in an agent's head for the length of one session. This is the seam.

> ⛔ **Before you write code, run the routing gate in `CLAUDE.md`** — `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon. At minimum read `cartograph/INTAKE.md` (the provenance SSOT), `NEIGHBORHOOD-INPUTS.md §0.1 and §5.1.1` (the three tiers + the ratified content schema), and `SLAB-CONTRACT.md §0/§C2` (what the slab is and what the player reads). **Do not rebuild the model from grep.** Cite what you read.

---

## 1. The problem, in Jacob's words

> *"There are a gajillion things that the agent has been collecting and associating and researching and collating; so far, each time we've had to do it one re-connection at a time."*

Every neighborhood poured so far has been assembled by an agent rediscovering, per session, which inputs exist, where they come from, what shape they're in, and which ones the pour actually needs. That knowledge has never been written down in a form the *machine* consumes. When it's written down at all, it's prose in `INTAKE.md` or a comment in a fetch script.

The consequence: a pour can complete "successfully" while missing trees, lamps, elevation or parcels, and nothing anywhere says so. Księży Młyn baked 1,640 buildings and four of its authored listings pointed at buildings that weren't in the slab — logged by an orphan check nobody read.

## 2. What to build

**A per-scene manifest that declares every input a pour needs, tracks whether it's present, records where it came from, and is fillable by hand.**

Three parts:

### 2.1 The manifest file
`cartograph/data/<scene>/intake.json` — declares each input: what it is, **what having it unlocks**, the path it must land at, and its provenance once acquired (source URL or description, date, and any format conventions that matter — projection, no-data sentinel, units).

⭐ **The manifest is ASPIRATIONAL — a catalogue of what this town *could* have, not a checklist it must satisfy.** Jacob, 2026-07-20: *"It's the full list of the materials the user could get; in instances where the user hasn't yet gotten the assets the system just doesn't show them."* So the per-input field is **not** `required: true|false`. It is **what you get if you have it, and what is simply absent if you don't.** A town with no lamp data has no lamps — that is a complete, correct pour, not a deficient one. Only the floor in §5.1 is genuinely non-negotiable, and it is short.

Model it on the existing artifacts, don't invent a schema in the abstract: read what `fetch.js`, `fetch-msbf.js`, `bake-terrain.js`, `bake-lamps.js` and the arborist bake actually *read*, and let the manifest describe exactly those.

### 2.1a ⭐ The acquisition field is TWO-VALUED — a source **or** a doc
Jacob, 2026-07-20: *"we should just put this in the manifest that there is a doc for this and a doc for that."*

This settles the hardest open question — what a row says when the LS artifact was hand-made and no net source exists. It does **not** say "unrepeatable," and it does **not** try to invent a dataset. Every row's `acquisition` resolves to exactly one of:

- **a SOURCE** — a URL/endpoint/portal, with licence and whether a permanent local copy is allowed (OSM, ambientCG, NLCD, Wikimedia, an assessor's ArcGIS server…); or
- **a DOC** — a pointer to the document that describes *how this gets made*, for the hand-authored and operator-judgment rows (the leaf-scanning procedure, dossier authoring, chassis curation, the species-collapse table, photo/logo sourcing).

Both are complete answers to *"where do I get this."* **Where no doc exists yet, writing it is the deliverable for that row** — that is what turns §5.5's "undocumented procedures" into acquirable ones.

⛔ **The manifest is an INDEX, not a manual.** It points at the doc; it never restates it (`BOZ.md §3`, one home per fact). A row carries a pointer + one line of what the doc is for. **Do not copy procedure text into `intake.json`.**

**Procedure docs that already exist** (verified on disk 2026-07-20 — point rows at these, don't rewrite them):

| Doc | Covers |
|---|---|
| `TREE-INTAKE.md` (162 ln) | the canonical per-town tree pipeline — the census wells, the Overpass UA gotcha, the MRLC WMS path, the real-only opt-out. *Cambium: treat as "the manifest's skeleton."* |
| `NEIGHBORHOOD-INPUTS.md` (329 ln) | the three tiers + the ratified content schema + the per-installation asset root |
| `arborist/dossiers/_SCHEMA.md` (73 ln) | how a species dossier is authored against the rubric |
| `arborist/SPEC.md` (620 ln) | leaf/bark pack provenance + the CC0 sources |
| `cartograph/data/<scene>/content/ASSETS.md` (Łódź + HPDM) | per-town photo/logo sourcing, incl. the **`verified-absent`** discipline (a documented `null` = *searched, none exists* — information, not a gap) |
| `arborist/references/<id>/sources.json` (×10) | Wikimedia plate manifests with per-species `identityNotes` |

**Docs still to write** (each is a row whose acquisition is currently unanswerable): the **street-survey procedure** (`raw/survey.json` — what an operator does instead of walking out with a tape) · **chassis acquisition + the tagging gauntlet** (purchase → `survey-deleaf` → habit-tagging, ~236 of 241 untagged) · **the species-collapse table** for a region with no municipal census · **leaf-scanning for a new region's morphologies**.

### 2.2 The panel
An **Intake** section in the Extent tool listing every declared input with its status.

Jacob: *"It needs to be human fillable."* An input that only a script can satisfy is one that stays empty for town #3.

#### 2.2a Three kinds of payload — the row's shape follows from this
Rows are not uniform, because what lands on disk isn't:

| Payload | Examples | Read by | The row needs |
|---|---|---|---|
| **DOC** | the procedures of §2.1a | a human (and an agent) | markdown, in-repo; the row is a **pointer** |
| **DATA** | `osm.json` · `elevation.tif` · parcels · GLB chassis | the pipeline | validation — projection, no-data sentinel, units, count |
| **ASSET** | place photos · logos · bark · leaf scans · reference plates | **a human eye** | a **thumbnail** — see below |

#### 2.2b ⭐ Two verbs — and the ONE-BUTTON RULE
> Jacob, 2026-07-20: *"we should write these access triggers into single buttons in the manifest."*

- **Fetch** — **the row's access trigger IS a single button.** Wherever a source has a programmatic endpoint, the operator does not read an instruction and go do it; they press one button and the file lands at its computed path with its provenance stamped. **The manifest is an action surface, not only a catalogue.**
- **Get** — the operator supplies the file (picker / drag-and-drop), for what no endpoint can deliver. The path is **computed**, never typed.

**This is what actually delivers the admin-person bar (§7)** — the difference between *"go to MRLC, discover the versioned layer name from GetCapabilities, request WMS GetMap as geotiff"* and **`[Fetch canopy]`**.

**The full button/doc split is `INTAKE-CATALOGUE.md §4.2`** — ~10 button-acquirable sources (Overpass, MSBF, MRLC/WorldCover, Open-Meteo ERA5, WorldClim, ambientCG/Poly Haven CC0 textures, Wikimedia plates, star/planet catalogues, Wikidata, per-jurisdiction assessors) against a short list that genuinely can't be automated (chassis purchase, leaf scanning, dossier authoring, the street survey, photo/logo research, NR OCR).

⭐ **Consequence for §2.1a: the doc backlog shrinks.** Several rows previously filed as "procedure to write" become buttons instead. **Write the doc only for what a button cannot do.**

⚠️ **Cheapest fix in the whole manifest:** the 10 `arborist/references/<id>/sources.json` plate manifests already hold real Wikimedia URLs with per-species `identityNotes`, sitting at `downloaded:false`. They are a standing violation of §4 (pointers, not local files) and want nothing but a Fetch button.

#### 2.2c ⭐ Image rows need a THUMBNAIL, not a checkmark
For an ASSET row, **a green status pill is a lie.** Łódź's `ASSETS.md` records the proof: a Facebook image URL returning **HTTP 200 with `content-type: image/jpeg`** was repeatedly the **default grey silhouette placeholder** — identical md5 every time. Right status, right MIME, right byte-size, worthless file. Every programmatic check passes.

So: *"how to tell a good file from a bad one"* (§2.2's own requirement) is **readable** for DATA — check the projection, the sentinel, the count — and **visual** for an ASSET. No validation code substitutes for looking. This is the intake instance of the standing doctrine: **the operator's eye is the gate, a proxy is not** (`feedback_proxy_render_is_not_the_operator_eye`).

**Build the thumbnail grid as the coverage map.** The arborist already proves the pattern: missing leaf packs render as *dimmed "needed" plates*, so the Salon grid doubles as its own manifest (`arborist/NOTES.md:68`). Copy that, don't reinvent it.

#### 2.2d Uploader requirements
- **Multi-file drag-and-drop.** Leaf scans run ~20 per species; place photos are `NN.jpg` per slug. One-at-a-time picking makes the row a chore nobody finishes.
- ⚠️ **Destination is DERIVED from instance + row, never free-typed, and anything outside the instance's asset root is refused.** `NEIGHBORHOOD-INPUTS §5.1.2`'s boundary is currently **convention enforced by nothing**, and it has already been breached once (2026-07-05, HPDM images written into LS's `public/photos/`). An uploader is precisely the tool that repeats that mistake at speed — make the boundary structural here.
- **Three states per row, not two:** filled · empty · **`verified-absent`** (checked, nothing exists). Łódź's documented `logo:null` entries prove the third is *information* — without it the next operator re-spends the hours rediscovering that a business has no logo.
- **The (?) is a short line + a link into the doc — never a parallel explanation.** Two independently-written texts about one input will drift; that is exactly the live `profile.json` ÷ `instances/<look>.js` duplication found 2026-07-20. One home (`BOZ.md §3`).

**A consequence worth noting:** an uploader plus a thumbnail grid is what makes the leaf-scanning procedure genuinely admin-executable. *"Go outside with a bag, scan 20 leaves on white, drag them into this row"* is an instruction a person can follow; *"run `compose-leaf-packs.mjs`"* is not.

### 2.3 Honest absence (this replaces the "gate")
An earlier draft of this brief said the pour should *refuse to run* when a required input is absent. **That was wrong and is retracted** — it contradicts §2.1. Absence is a normal, permanent state for most inputs; a pour that halts because a Polish neighbourhood has no county assessor is a pour that can never leave St. Louis.

What is actually wanted is **honest absence**: the feature the input feeds is simply not rendered, the manifest shows the row unfilled, and nothing silently substitutes. The floor (§5.1) is the only place a hard stop belongs.

⚠️ **This is a live defect, not a hypothetical.** Today three absent inputs do not degrade to nothing — they degrade to **Lafayette Square**:
- `bake-lamps.js:99` — no `raw/osm_street_lamps.json` → reads `src/data/street_lamps.json`, LS's lamps, into another town.
- `arborist/bake-trees.js:427` — no census → reads LS's `park_census.json`.
- `arborist/bake-trees.js:430` — no `tree-species-map.json` → reads LS's species map.

This is the already-known "Altadena has the wrong (LS) lamps" bug (`ROADMAP H2`), and the enumeration shows it is a *class*, not one incident. **Killing these three fallbacks is part of this work** — it is precisely the "system just doesn't show them" principle, enforced. `cartograph/tree-bake-inputs.mjs` already does it right (returns `null` = "an HONEST ZERO, not an error"); make the others match.

---

## 3. The distinction that shapes the whole design

**Render-side inputs must be complete before the pour. Content-side inputs must not be required by it.**

- **Render-side** (baked into the slab, so re-acquiring means re-pouring): street geometry, building footprints, land-use/parcels, street lamps, trees, elevation.
- **Content-side** (joined to the slab by building id, afterwards, forever): place cards, listings, menus, logos, photos, historic records.

This is not a guess. It was verified on 2026-07-20: Księży Młyn's 84 listings, 23 cards, menus, logos and photos survived a complete re-fetch, a wider bbox and a rebuilt skeleton **untouched**, because they key on `osm-<wayid>` — a stable upstream identifier, not a position and not anything the pour computes.

**So the manifest covers render-side inputs. Content gets its own intake, later, and must never become a pour dependency.**

⭐ **SCOPE CORRECTION (Jacob, 2026-07-20) — cataloguing is not depending.** The line above scopes the *dependency graph* correctly and the *catalogue* far too narrowly. Jacob: *"Every single thing we collected to make LS has to be a search/find-able value out on the net, up to and including arborist info and weather info."*

So hold both:
- **The CATALOGUE is total.** Every domain — cartograph render-side (§5), **arborist** (species, census, dossiers, library assets), **meteorologist** (climate, sky, seasonal timing), **content** (listings, cards, photos, historic records) — every one gets a row, a provenance, and an answer to *where on the net do I get this*.
- **The DEPENDENCY set stays minimal.** Only §5.1's floor gates a pour. Content still joins after, by building id, forever.

A row in the catalogue is a statement about **what this town could have and where to find it** — not a claim that the pour needs it. Conflating the two is what produced both the retracted "pour gate" and the too-narrow scope here.

✅ **The other three columns are DONE — `INTAKE-CATALOGUE.md` (repo root).** Arborist (*Cambium*), meteorologist (*Fathom*), content/player (*Ledger*), 2026-07-20. That file is deliverable #1 and the schema's ground truth; §5 below stays the cartograph render-side column and is not duplicated there (one home per fact). **Read the catalogue before designing the schema.**

⚠️ **The invariant this rests on deserves an explicit test.** Content survives re-pours *only* because building ids are stable. Skeleton `skelId`s are **not** stable — they are `slugify(name)` plus a chain index, so a wider fetch can renumber them (`milionowa` → `milionowa-0`/`-1`). If building ids ever acquire the same property, the entire content layer silently orphans. Write the test.

---

## 4. ⭐ The standing constraint: local files, no live dependencies

Jacob: *"I have tried to keep files local to the extent that I can so as to not rely on networks (which can go down) and corporate entities (with whom I have lighthearted enmity)."*

**Every input is a file on disk, and a pour must be reproducible with the network unplugged.** Fetching is how a file is *acquired*, once; it is never how the pipeline *reads*. Design the manifest so acquisition and consumption are separate steps, and so the record of where something came from survives independently of the ability to re-fetch it.

This is already how the good parts work — `bake-terrain.js` reads `raw/elevation.tif` and doesn't care that USGS is the documented way to get one — and it's a large part of why Łódź was pourable at all. Preserve it. Prefer sources that permit a permanent local copy; note licence per input.

---

## 5. ⭐ THE ENUMERATION — what the bakes actually read (done 2026-07-20, Boz)

> §2.1 said "model it on the existing artifacts, don't invent a schema in the abstract." **That discovery is done.** Every path below was read out of the source, not inferred; every presence mark was tested against the scene dirs on disk. Build the schema to *this*. Re-verify before trusting — code drifts — but do not re-derive it.
>
> **The precedent to copy: `cartograph/tree-bake-inputs.mjs`.** It is already exactly this idea for one input class — "ONE answer to *what does scene X's tree bake read and write* — not two that drift" — including honest-zero on absence. The manifest is that module generalised. Read it first; it is the shape of the answer.

### 5.1 The floor — no pour without these (4)
| Input | Produced by | If absent |
|---|---|---|
| `geography.json` | Extent commit | no frame/projection — nothing can be placed |
| `neighborhood.json` | Extent commit | no scene identity |
| `neighborhood_boundary.json` | Extent boundary pen/ring | no hood edge; buildings, lamps and trees all test membership against it |
| `raw/osm.json` | `fetch.js` (Overpass) | no streets, no land-use, no buildings |

**Centrum poured with exactly these four and nothing else.** That is the proof the floor is really this short — and the strongest evidence for the aspirational model.

### 5.2 Elective render-side — each unlocks a feature; absent = feature absent
| Input | Acquired by | Unlocks | Today, if absent |
|---|---|---|---|
| `raw/msbf.json` | `fetch-msbf.js` | ML building footprints — **best in the US, NOT universally** | falls back to OSM buildings ✅ (aborts off-continent — expected) ⛔ **but "fallback" is a US-shaped word: European OSM is hand/cadastre-mapped and measurably RICHER than MSBF** (Łódź median 7 verts vs LS's 5; Centrum 9). The footprint source is a **regional choice**, not a quality ladder — `INTAKE-CATALOGUE.md §5.1` |
| `raw/elevation.tif` | manual (USGS 3DEP for US; **any** GeoTIFF) | terrain relief | `bake-terrain.js:105` exits → flat ground ✅ |
| `raw/osm_street_lamps.json` | fetch | street lamps | ⚠️ **LS's lamps** (`bake-lamps.js:99`) |
| `raw/stl_parcels.json` | STL City/County assessor | land-use codes for the content classifier | no parcel signal ✅ (STL-only by nature) |
| `raw/survey.json` | operator hand-measurement | true street widths | OSM/AASHTO defaults ✅ (`derive.js:707`) |
| `raw/centerlines.json` | `seed-centerlines.js` + hand correction | corrected centerline geometry | derived from OSM ✅ |
| `raw/measurements.json` | operator | LS-specific measurements | skipped ✅ (`derive.js:2298`) |
| `buildings.json` | `derive-ls-render-ledger.js` | the render ledger | falls to `clean/map.json` ✅ |
| `building-overrides.json` | operator, per-building | height/kind corrections | none applied ✅ |
| `tree-species-map.json` | operator/arborist | census→library species routing | ⚠️ **LS's map** (`bake-trees.js:430`) |
| `clean/park_trees.json` | City Forestry census | real tree positions | — |
| `clean/forest_park_trees.json` | Forestry layer 4 (rich species) | better species prior | — |
| `clean/osm_trees.json` | OSM `natural=tree` | real tree floor | — |
| `clean/derived_trees.json` | NLCD canopy fill | synthetic fill (scenes may opt real-only) | — |
| *(all four census layers absent)* | | | `treeBakeInputsForScene` → `null`, no trees ✅ honest zero |
| `clean/park-polygon.json` | operator | park clip + water | no clip ✅ |

The four census layers are **spatially disjoint layers of one census, unioned** — not alternatives. ✅ = already degrades honestly; ⚠️ = the LS-bleed of §2.3.

### 5.3 NOT intake — derived bake outputs (must never appear as acquirable rows)
`clean/skeleton.json` · `clean/street-index.json` · `clean/map.json` · `clean/ribbons.json` · `clean/terrain.json`/`.bin` · `public/baked/<scene>/shape.json`.

⚠️ **One ordering trap the manifest should surface:** `shape.json` is a *ground-bake output* that the **tree** bake consumes as its "may a tree stand here" mask. Ground must bake before trees or trees scatter into the carriageway (`tree-bake-inputs.mjs` calls the fallback "known-wrong, loud on purpose"). Sibling of the standing footgun that `bake-ground-ao.js` must follow `bake-ground.js` or the slab goes flat-lit.

### 5.4 Content-side — never a pour dependency (§3)
`content/listings.json` · `roster.json` · `menus.json` · `profile.json` · `listings.overrides.json` · `ASSETS.md` · `county-land-use-codes.csv` (`bake-content.js:162`) · `nr-inventory.json` (`bake-content.js:188`).

### 5.5 The presence matrix — measured on disk, 2026-07-20
LS = 25/25 · HPDM ≈ 20 · Księży Młyn = 11 · Centrum = 6.

⭐ **Read this the right way round.** Jacob, 2026-07-20: **"LS is *the* final Boss version of the dataset."** It is the **complete aspirational target**, not an outlier to design away from. Centrum's six filled rows are a *progress bar toward LS*, not the spec. *(An earlier draft of this section argued the inverse — "design for the Centrum column" — and was wrong: designing for the minimum inverts the aspirational model and quietly gives up on everything LS proves is obtainable.)*

**The consequence for the panel:** every row is listed for every town, always. The **panel** is a complete collection checklist — it shows what this town *could* have, including what it doesn't have yet. The **render** shows only what has actually been acquired. Those are opposite behaviours and must not be conflated: "the system just doesn't show them" governs the *map*, never the *catalogue*.

**And the consequence for the work:** the seven inputs only LS has — hand-measured `survey.json`, seeded `centerlines.json`, `measurements.json` — are not "unrepeatable." They are **undocumented procedures**. Turning each into an acquirable, instructed item is the deliverable, not a caveat to note and move past.

## 5.6 Prior verified findings (2026-07-20)

- **`bake-terrain.js` is source-agnostic.** It reads `cartograph/data/<scene>/raw/elevation.tif` and samples any GeoTIFF against the scene's geography. USGS 3DEP appears only in comments and an error message. Non-US terrain is therefore an *acquisition* problem, not a code problem — but note the no-data sentinel at `bake-terrain.js:69` is USGS-specific and will need checking per source.
- **The pour does not run terrain.** `/pour` is `pipeline.js --skip-elevation` → `promote-ribbons` → Look → `bakeLook`. Elevation bakes separately, between the Design tools and Stage.
- **MSBF aborts off-continent** ("No US tiles found covering BBOX"), so non-US hoods fall back to OSM buildings. Expected degradation, but currently invisible in the manifest sense.
- **No parcel authority outside St. Louis City/County.** Also expected, also silent.
- **`raw/osm.json` is ways-only — no POI nodes.** Business density is therefore invisible to the fetched data; listings came from a separate pass. Worth declaring as its own input rather than assuming OSM covers it.
- **The area guard and the fetch buffer disagreed.** The server capped a fetch at 200 km² while `fetch.js` captured Overpass through a 50 MB pipe — a 33 km² fetch of Centrum returned 52.49 MB and threw with an unreadable error. Fixed (`2aa07e11`), but it is the pattern to watch for: two guards on the same thing, the tighter one invisible.

## 6. What to deliver

> ### ✅ STATUS 2026-07-21 (Tally) — items 1–3 landed, 4–7 open
> **Landed** (`f7c92582`, `35d6d9da`, `103d7224`, `3146e6aa`):
> · **#2 the schema** — `cartograph/intake-rows.mjs`. Row DEFINITIONS kit-global, PROVENANCE per-town (`data/<scene>/intake.json`); status computed from disk on every read, never stored. Departs from §2.1's letter deliberately — declaring rows per-scene is ~20 facts copied into six files, drifting.
> · **#3 the panel — ×2.** Extent→**Intake** (per-scene, every row, filled or not) and Stage→**Materials** (13 inputs, three tiers by WHO SUPPLIES IT: automatic / public records / local knowledge). Each tier copies as a delegatable brief; operator-added sources are shared by **jurisdiction** (`intake-jurisdiction.mjs`, keyed off lat/lon).
> · A **second row kind** the brief did not anticipate: `measure`. "How tall are the buildings" has no file of its own and its answer is COVERAGE (689/1640), not presence.
>
> **Open:** **#4 honest absence** — the three LS-bleed fallbacks are NOT yet killed (bleed #5 was, by registering `centrum`). **#5** the stable-building-id test. **#6** the FEATURES pass. **#7** the complete-intake writeup. **#1** verification of the catalogue's `[unverified]` externals.
>
> ⚠️ **Scope correction from the build:** §5.2 lists `raw/survey.json` as "operator hand-measurement" and `raw/centerlines.json` as hand-corrected. Neither is an operator errand — `survey.js` DERIVES widths (OSM sidewalk distance → assessor ROW/2 → default) and authoring happens in Survey/Section; centrelines are written only by `derive.js`/`skeleton.js`/`seed-centerlines.js` (the one editing UI is a stale `preview.html` prototype). Both are off the Materials list. Likewise the tree MATERIALS (models, bark, leaves, plates) are the platform's library, shipped — only regional KNOWLEDGE (dossiers, species routing) is the operator's.

> **The lens is THE UNIVERSAL PLAYER** (Jacob, 2026-07-20) — the blank-app / Universal Reader arc (`ROADMAP C1`). This is not a cartograph-authoring convenience; it is the intake half of *an app that can play any town*. Judge every decision by whether it moves town #3 closer to pouring without Jacob.

1. ✅ **The complete catalogue — DONE 2026-07-20: `INTAKE-CATALOGUE.md`.** All four domains, each row with what it is · what it unlocks · where it lands · **where on the open net to obtain it** · licence + local-copy rights. ⚠️ External URLs/licences are marked `[unverified]` there — **confirm before they ship on a panel.** Remaining work on this item is verification + writing the four missing procedure docs (§2.1a).
2. The manifest schema, built to that catalogue — cartograph's half is already enumerated in §5 (verify it, don't redo it).
3. The Intake panel — status, **Get**, **(?)** per row. **Every row shown for every town**, filled or not (§5.5): the panel is the collection checklist, the render is what you've collected.
4. **Honest absence** (§2.3) — kill the three LS-bleed fallbacks so an unacquired input renders nothing rather than Lafayette Square. The one behavioural change; fixes the Altadena wrong-lamps bug as a class.
5. The stable-building-id test (§3).
6. **The FEATURES pass** (§7.1) — the catalogue written outward as the pitch, not left as a schema.
7. A short writeup of what a *complete* intake looks like for one real scene — use `centrum` (Łódź) or `ksi-y-m-yn`, both non-US and therefore exposing the assumptions LS never did.

## 7. Audience, and how done is done

Jacob: *"Assume it's me for the time being, but developer-accompanied for future installations that aren't me, until we stabilize the process enough to truly automate all of it."*

So the **(?)** copy is **provenance writing, not tutorial writing.** It does not need to teach a layperson GIS. It needs to be precise enough that Jacob plus an accompanying developer never have to re-derive where a file came from, what convention it follows, or how to tell a good one from a bad one. Aim there and it will still be the right text when this is automated.

⭐ **REVISED FLOOR (Jacob, 2026-07-20): "even an admin person could theoretically collect the assets."** That is a lower bar than "developer-accompanied," and it is the one to build to. It does not mean teaching GIS — it means every row must resolve to *a place to go and a way to tell you got the right thing*, executable by a competent non-specialist. **The test: could a capable assistant, handed this panel and a town name, go and fetch these things?** If a row can only be satisfied by Jacob, it is not finished — it is a procedure still to be written down (§5.5).

### 7.1 ⭐ This catalogue is a FEATURES artifact, not just an ops table
Jacob, 2026-07-20: *"this is almost an oblique feature of the FEATURES doc."* He is right, and it changes what the writing is for.

The complete list of everything that goes into making a town — every dataset, census, survey, atlas and archive, each with its source — **is the pitch.** It is the most legible possible statement of what this system actually does and how much goes into one of these. Nobody who reads that list mistakes the product for a map with some trees on it.

So: write the catalogue in the **FEATURES voice** where it faces outward — *"this is what this is"* (`feedback_features_voice_this_is_what_this_is`) — and keep the operator detail in OPERATIONS. Same germane fact, each register in its own voice (`BOZ.md §0`). Route it to `cartograph/FEATURES.md` (or the cross-domain FEATURES home) in the same arc that builds the panel; **do not leave it living only as a schema.**

**Definition of done:** a second person, handed a town name and this panel, can acquire every render-side input and pour a slab without reading the source and without asking Jacob a question.

---

## 8. Standing rules

- **Confirm alignment with Jacob before writing code.** This is the last structural piece of the kit; get the shape agreed first (`CLAUDE.md §Standup before code`).
- **Everything lives inside `lafayette-square.nosync/`.** No stray folders, no new dev servers — reuse the running one.
- **Less UI text, always.** Jacob's standing preference. The **(?)** is where explanation belongs; the panel itself stays terse.
- **Excise, don't accrete.** If this subsumes an existing script or knob, remove it — knobs, wiring and docs together.
- Name yourself in the writeup.
