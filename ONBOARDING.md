# Onboarding a new installation — the intake→hydration playbook

**The followable procedure for pouring AND hydrating a new town, end to end — so nobody re-derives it from the code.** This is the operational HOW-TO; the deep *what-each-thing-is* references are `cartograph/INTAKE.md` (map provenance), `NEIGHBORHOOD-INPUTS.md` (per-input pour template + the content-layer schema §5.1.1), `SLAB-CONTRACT.md` (what a finished slab is), `ls/ARCHITECTURE.md` (the player/modules). Written 2026-07-19 after the Łódź pour, because the hydration stage had no playbook and every card/menu/merge got re-derived by hand.

> **Two stages.** **INTAKE** pours the *slab* (geometry the player stands on). **HYDRATION** fills the *content* (the identity, listings, cards, menus that make it a place, not a model). A slab with no hydration renders buildings with no names, cards, or neon.

---

## STAGE 1 — INTAKE (pour the slab)

Goal: `public/baked/<scene>/*` (the slab) + `cartograph/data/<scene>/{geography,neighborhood_boundary,clean/*}` from real open data.

1. **Frame + fetch.** Operator drives the `◎ Extent` tool (search a place → frame → *Fetch this view*). **Headless alternative when the operator doesn't know the area** (foreign town): `POST localhost:3333/<scene>/fetch-extent {"bbox":{minLat,maxLat,minLon,maxLon}}` (Vite proxies `/api/cartograph`→:3333). Boz supplies the bbox from research; the operator's eye gates the *result*, not the framing. → OSM streets + OSM buildings (global; MSBF is US-only and aborts off-continent — fine, OSM covers it).
2. **Pour + bake.** `--skip-elevation` (no USGS tile outside the US → flat ground) and skip the separate `bake-terrain.js`. Building ids are **source-agnostic**: `osm-<id>` when no `msbfId` (never `msbf-undefined`). Street labels bake per-scene (`bake-labels.js` → `baked/<look>/labels.json`).
3. **Per-scene isolation.** All scene data lives under `cartograph/data/<scene>/` and `public/baked/<scene>/`. ⭐ **A POUR ADDS NO `.gitignore` LINES (2026-09-13).** One scene-generic rule tracks every town's inputs — config/content/census in, heavy generated geometry (`clean/map|skeleton|ribbons|terrain`) out — so there is nothing to add and nothing to mirror. ⛔ *This step used to read "add the `.gitignore` un-ignore block (mirror the HPDM/`ksi-y-m-yn` blocks)". That hand-step is the thing being deleted: three towns were poured without anyone doing it, and their entire input set sat ignored — present on one disk, in no repository, with nothing reporting it.* Verify: ▶ `node checks/claims-a-pour-adds-no-gitignore-lines.mjs` (it fails loudly on a scene that tracks nothing). ⛔ **`public/baked/<scene>/` is ignored wholesale (2026-09-01) and needs no un-ignore rule** — the pour uploads it to R2 and that upload, not a commit, is what puts a new town in front of a visitor. Verify it landed: ▶ `node scripts/verify-baked-in-r2.mjs --look=<scene>`. Mechanics: `PUBLISH.md §6`.
   - **Retiring a town** is the same shape in reverse and also adds no rule: drop a `cartograph/data/<scene>/RETIRED.md` saying why, plus a `.gitignore` beside it (`*`, less those two), then `git rm --cached -r` the scene. Non-destructive — history keeps every version.

Deep refs: `cartograph/INTAKE.md §0.5` (the Extent tool), `NEIGHBORHOOD-INPUTS.md §1` (map inputs). *(The Łódź handoff this used to cite went with that scene, 2026-09-19 — the kit-gaps it recorded are what this document was written from, so they are here, not there.)*

---

## STAGE 2 — INSTANCE IDENTITY (make it a real installation)

**Without this, `?look=<scene>` boots the DEFAULT (Lafayette Square) instance — the player wears LS's labels, lamps, landmark name, geography.** Two files:

1. **`src/instances/<look>.js`** — self-contained identity: `lookId`, `geography` (lat/lon/timezone/bbox — timezone drives weather/sun/TOD), `locale` (`{language, units, clock}` — the i18n/localisation-service track), `name`, `branding`, `legal`, `profile` (Layer-0: name/population/founded/tagline/about/landmarkName), and `modules` (see Stage 4). Mirror `hipointe-demun.js`. **References NOTHING about any other installation.**
2. **Register** it in `src/instances/registry.js` `INSTANCES` (⛔ not `instance.js` — that one imports the looks index and the dev servers may not load it) + add a **`loadInstanceData` manifest entry**
   > ⭐⭐ **THE MANIFEST ENTRY IS EARNED, NOT ASSUMED — measure the roster first** *(2026-09-21)*. Add `buildings: () => import('../../cartograph/data/<scene>/content/roster.json')` only once that roster carries **`address`** (a building without one is DROPPED from the Society Pages — it cannot be listed with nothing to call it) and **`category`** (how it files there). ⛔ **An entry that reaches nothing is worse than none**: altadena's 15,397 buildings all carry a category and NONE carries an address, so wiring it would leave Society exactly as empty while looking wired. ⭐ **And the category comes from the TOWN, not from St. Louis** — `b.category` is preferred and the zoning letter is only the fallback, because LS is the one town that ships zoning and no category. ▶ the one-line measurement + the per-town figures live in `INTAKE-CATALOGUE.md §3.2`. (`src/data/loadInstanceData.js`) pointing `landmarks`→`content/listings.json`, `menus`→`content/menus.json` (the `normalizeEnvelope` unwraps `{meta,listings}`→`{landmarks}`).

---

## STAGE 3 — HYDRATION (the content layer)

The schema SSOT is `NEIGHBORHOOD-INPUTS.md §5.1.1`. Files live in `cartograph/data/<scene>/content/`:
- **`profile.json`** — Layer 0 (installation stats/copy the masthead + InfoModal show).
- **`listings.json`** — Layer 2, the GENERATED base (business POIs, `building_id`→slab id). **Source = Overture Places (open/ownable — NOT Google Places, whose ToS forbids owning/baking the data).** `python3 -m overturemaps download --bbox=… -f geojson --type=place` (macOS Py3.14 SSL fix: `SSL_CERT_FILE=$(python3 -c 'import certifi;print(certifi.where())')`) → filter to eateries → point-in-OSM-footprint join to `osm-<id>` → map `category` to a **`CATEGORY_HEX`** key (`dining`/`historic`/`arts`/`community`/`parks`/…) so neon has a color.
- **`listings.overrides.json`** — `{meta, patches:{id:{…}}, adds:[…]}`. **Hand-authored, wins over the generated base.** Restaurant elaborations = `patches` (by `km-eat-<id>`); landmarks not in the POI set = `adds`.
- **`menus.json`** — keyed by listing id → `{taglines?, schedule?, sections:[{name, menu, items:[{name, price?, description?}]}]}`. Attached to the listing at runtime by `useListings` (via the `menus` manifest entry). `menu` on a section = which tab (`dinner`/`drinks`/`dessert`…).

**Merge** overrides into `listings.json` (index by id → apply patches, replace/add adds, map categories). The reader loads the MERGED `listings.json`.

> ⚠️ **`bake-content.js` is NOT the merge for an OVERTURE-based pour.** It rebuilds the BASE from OSM POIs + parcels + NR survey, and knows nothing about Overture Places. Dry-run on Łódź (2026-07-19): `base listings (OSM): 0 · 0 patches applied · 2 adds DROPPED` — running it would have collapsed 87 listings to 6 and silently lost the Famuły and Źródliska Park cards. **Always `--dry-run` a merge before trusting it.**
>
> ⛔ **And there is no merge tool for this case.** The one that existed was hardcoded to a single scene and went with it (2026-09-19). `bake-content.js`'s external-base guard is generic — it reads `meta.baseSource` from the data, so the next town is protected from the destructive bake — but it can only stop you, not finish the job. **Folding an external base into `bake-content` as a first-class source is OPEN, unbuilt kit work.** Until it lands, author `content/listings.json` directly.

**`drops` — the third override block.** Alongside `patches`/`adds`, record ids the merge must DELETE from the generated base, with the reason: permanently-closed venues, and duplicate POIs (the same business landing twice — commonly once under its trading name and once under its sole-proprietorship legal name, or under an old name after a rebrand). Recording them in the overrides SSOT rather than hand-deleting is what stops a re-merge silently resurrecting a dead business.

### ⚠️ Verify the BUSINESS before authoring the card
Aggregator data is stale and duplicative in specific, repeatable ways. On Łódź, checking cost minutes and caught: a restaurant **closed since 2022** still live on Facebook/TripAdvisor (which is why Overture still carried it); **two duplicate pairs** sharing one `building_id`; a venue **renamed after a TV makeover** whose card was authored under the dead name; and **two near-miss lookalike businesses** in the same city (`Pierogarnia` vs `Pierrogarnia`; a `notosushi.pl` that is an unrelated chain in another city) whose published menus would have been attributed to the wrong pin. Cheap checks, in order: **group listings by `building_id`** — same building + same address is almost always one business twice; search the name plus "zamknięte"/"closed"; confirm the domain actually belongs to *this* location before taking prices from it. Put what you learned in a `_data_note` on the card so the next author doesn't re-derive it.

### ⭐ THE CARD-DEPTH STANDARD — "chock a block full" (match LS, don't stub)
A real card (see LS `Polite Society`, `cartograph/data/lafayette-square/content/listings.json`) is NOT a paragraph + one field. It carries:
- **`history` = a `{year, event}` TIMELINE ARRAY** (multiple dated entries) — rendered by `PlaceCard.HistoryTimeline`. **A history STRING renders flat and thin — always use the array.** (Dynasty/heritage dates make great timelines.)
- **`description`** (2–3 vivid sentences), **`signature_dishes`** (3–5), **`amenities`** (6–8 SPECIFIC items, not 2), **`hours`** (full 7-day structured `{monday:{open,close},…}` — drives the ticker + open-now neon; `null` a day = closed), **`opening_hours_raw`**, **`tags`** (6–8), **`website`/`phone`/`address`**, **`menu_url`/`reservation_url`**, **`photos`**.
- **`photos` — the built-in attribution scheme** (`PlaceCard` line ~1537, `PhotoCredit`): each entry is a plain string OR an object **`{url, credit, credit_url}`** — `credit` renders as a link to `credit_url`. **DOWNLOAD + SELF-HOST the real image FILE** under the install's own `content/photos/<slug>/01.jpg` (instance-relative `url`); **NEVER hotlink an external URL or a Wikimedia *category* page** — they render broken and fail zip-and-send. Credit = e.g. `"Author / Wikimedia Commons"`, `credit_url` = the source file page. Licensing is not a blocker for a listing showcase (a business's own photo representing that business is standard directory practice; landmarks use PD/CC Commons files).
- **`logo` — the business icon** (distinct from photos). Drives the **Browse-view marker thumbnail** (`LafayetteScene` — `listing.logo || initials`) AND the card header (`ListingLogo`). Self-host under the install's payload (LS uses `/logos/<slug>.png`); set `logo` to that path. **Missing `logo` → a colored INITIALS avatar (built-in fallback), never a broken icon** — so collect logos to enrich the Browse view, but a null logo is a clean, correct default, not a bug.
- Restaurants: `cuisine`, `price_range`. Landmarks: `category` = `arts`/`historic`/`community`/`parks`.

**Curation:** feature genuinely-LOCAL, well-regarded places (verify reputation/ratings) — NOT chains that are busy-by-default (McDonald's/KFC/Starbucks/mall food-court stay plain dots). Content is an English draft; **native-language authoring is the localisation-content track.**

---

## STAGE 4 — ACTIVATION & ISOLATION

- **Modules DEFAULT-ON (opt-OUT).** `moduleOn` (`src/instance.js`) returns true for an absent module. An installation declares a module `false` (or delivery `{enabled:false}`) ONLY as a deliberate opt-out. Toggling off silently cancels features — activate the whole player, let assets be empty. See [[feedback_full_activation_default_on_empty_assets]].
- **EMPTY-ASSET ROBUSTNESS (contract).** An activated feature with empty assets renders an empty state, **never crashes**. Guard null profile stats (`SidePanel`: `n != null ? n.toLocaleString() : '—'`); every overlay feature is wrapped in `FeatureBoundary` so a crash contains to a visible fallback, not a blank app.
- **ZERO CROSS-NEIGHBORHOOD CONTAMINATION (the zip-and-send test).** A `<scene>`-only slab must be zip-and-send-able with NO other hood's data. Set-pieces (Gateway Arch, LS park/lamps) must gate per-look; the reader must carry no LS literals; `derive.js`/loaders must read the install's own payload. Audit with a compliance pass before shipping. Deep: `NEIGHBORHOOD-INPUTS.md §5.1.2`, `project_slab_is_the_instance_identity`.

---

## The checklist (copy per new town)
- [ ] Intake: fetch → pour (`--skip-elevation`, skip terrain) → bake → per-scene `.gitignore` block
- [ ] Instance: `src/instances/<look>.js` + register + `loadInstanceData` manifest (landmarks + menus)
- [ ] Content: `profile.json` + Overture `listings.json` (joined, categories→CATEGORY_HEX) + `listings.overrides.json` (cards to the depth standard) + `menus.json`; merge
- [ ] Activation: modules default-on; verify no empty-asset crash (FeatureBoundary catches)
- [ ] Isolation: compliance audit → zip-and-send-able, zero contamination
- [ ] Ship: bake + commit the slab, push to staging, eye-gate, then prod
