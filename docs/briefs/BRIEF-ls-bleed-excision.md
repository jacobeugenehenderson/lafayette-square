# BRIEF — excise the LS-bleed: absence must degrade to NOTHING, never to Lafayette Square

**Agent: FRESH.** — this is a mechanical excision across four domains against a verified site list; there is no prior session-context worth inheriting. ⚠️ **Serialize against `BRIEF-intake-manifest.md`** where they touch the same bake scripts, and **do not dispatch into a worktree** until `cartograph/BACKLOG.md §NEXT`'s stale-worktree cleanup lands (25 stale trees; a 2026-07-20 dispatch silently landed on a months-old branch and did nothing).

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon for whichever domain you're in. The findings behind this brief are `INTAKE-CATALOGUE.md §0`; read it before touching anything.

---

> ⭐ **UPDATED 2026-07-31 — see APPENDIX A.** The sweep below found bleeds of ONE shape (*an input is
> absent → LS's data stands in*). Two further classes are now documented at the end of this file:
> **Class B**, always-on cross-scene reads that fire *even when the town has its own data* (site 9,
> `measureModel.js` — **24 Altadena streets inherit St. Louis measurements**), and **Class C**, the
> BUILD direction, where the operator's action is silently redirected *onto* LS (site 14 — a bake with
> no scene **bakes over Lafayette Square**). Sites 9–14 there. Read §1–§7 first; the principle is the
> same and Appendix A only extends the site list and the regression test.

## 1. The defect, in one sentence

**When an input is absent, the kit does not render nothing — it renders Lafayette Square's data under the other town's name.**

This is the systemic defect of the whole kit. It was found on 2026-07-20 by four independent passes (Boz + three specialists), none of which knew the others were looking. That convergence is the point: it is not a bug, it is a **habit** the codebase acquired while LS was the only installation.

## 2. Why it matters more than an ordinary bug

The manifest's governing promise (Jacob, 2026-07-20) is that the catalogue is **aspirational**: it lists everything a town *could* have, and *"in instances where the user hasn't yet gotten the assets the system just doesn't show them."*

A bleed breaks that promise in the worst available way. A missing feature is honest and legible — the operator sees a gap and knows to fill it. A bleed is **plausible and wrong**: LS's trees, LS's lamps, LS's sky, LS's legal jurisdiction, rendered convincingly enough that nobody investigates. It costs more than an empty row because it doesn't look like a problem.

⭐ **The correct pattern already exists in-repo, twice** — copy it, don't invent one:
- `cartograph/tree-bake-inputs.mjs` returns `null` when a scene has no census: *"an HONEST ZERO, not an error: the caller skips the placement step rather than baking someone else's trees under this scene's name."*
- `arborist/bake-trees.js:408` defaults `heroLook` to `null → sceneName`, commented: *"never a literal 'lafayette-square', which would tier a poured scene's trees against LS's camera in LS's coordinate frame (garbage)."*

Somebody already understood this class and fixed it in those two places. Site #4 below is the one they missed **in the same file**.

> ### ✅ LANDED 2026-07-31 — do not re-do these three
> | site | what landed | where |
> |---|---|---|
> | **1** — `bake-lamps.js` | a scene with no `raw/osm_street_lamps.json` now bakes **zero** lamps, not LS's 80 hand-placed ones. LS/toy keep reading their own file — for them it is the source, not a fallback. | branch **`lamp-scene-bleed`**, ⚠️ **not yet on trunk** |
> | **9** — `measureModel.js` (Class B) | the static LS `ribbons.json` import is gone; the store registers the **active scene's** fixture (`setSceneMeasureSource`). No registration ⇒ empty seed ⇒ generic type default. Kills the 24-Altadena-streets bleed. | trunk `08d61ce1` |
> | **11/14** — `config.js` (Class C) | `SCENE = env \|\| DEFAULT_SCENE` replaced by `SCENE_IS_EXPLICIT` + **`requireExplicitScene()`**, which **exits 2** on every writing entry point (`pipeline` · `skeleton` · `bake-terrain` · `promote-ribbons`). A scene with no `geography.json` now **refuses** rather than projecting the town at St. Louis's lat/lon. | trunk `08d61ce1` |
>
> Still open: sites **2, 3, 4** (`arborist/bake-trees.js`), **5** (`src/instance.js`), **6** (sky), **8** (legal prose), and §6.4 — **the regression test for the class**, which is the part that makes any of this hold for town #2.

## 3. The verified sites

All code-verified 2026-07-20. Paths/lines were accurate at that date — **re-verify before editing** (code drifts).

| # | Site | What bleeds | Sev |
|---|---|---|---|
| 1 | `cartograph/bake-lamps.js:99` | no `raw/osm_street_lamps.json` → reads `src/data/street_lamps.json` (LS's 80 lamps) | HIGH |
| 2 | `arborist/bake-trees.js:427` | no `--placements` → LS's `clean/park_census.json`. **Another town's bake silently plants LS's trees.** | HIGH |
| 3 | `arborist/bake-trees.js:430` | no `--species-map` → LS's `tree-species-map.json`. **Foreign species routed through a St-Louis collapse table.** | HIGH |
| 4 | `arborist/bake-trees.js:69-70` + `:688` | ⭐ **module-level, unconditional, no override flag** — `const _lamps = readFileSync('src/data/street_lamps.json')`, then `lampGlow: lampGlowAt(x,z)` stamped on **every instance of every scene**. LS's park-lamp positions evaluated in another town's coordinate frame = glow at geographically meaningless spots. Same file as #1, second independent door. | MED |
| 5 | `src/instance.js:47` | `INSTANCES[resolveLookId()] \|\| INSTANCES[DEFAULT_LOOK]` — an unregistered look wears **LS's identity, geography, park label and tax rate**, silently. Documented in `src/instances/ksi-y-m-yn.js`'s own header as the bug that motivated the file. | HIGH |
| 6 | `cartograph/pipeline/hydrate-anchor-cards.js:28-30` | `LAT=38.6160 / LON=-90.2161 / TZ=-6` hardcoded → **every town's sky is St. Louis's sky.** See §4. | HIGH |
| 7 | `cartograph/bake-content.js:118` | ✅ **FIXED `adc03f32`** — MSBF-only join meant no OSM pour joined any geometry | done |
| 8 | `InfoModal.jsx` (zero `INSTANCE` reads) · `LegalPage.jsx` · `CourierOnboarding.jsx` | LS prose + **State of Missouri governing law** + the LS delivery zone, on a Polish deployment that opted *into* delivery. `INSTANCE.legal` exists and Łódź populates it; **nothing reads it.** | HIGH — legal |

**Soft bleeds** (authoring/UI only, never reach the render — fix opportunistically, don't gate on them): `arborist/roster-coverage.js:48` · `arborist/serve.js:1056` (`GET /inventory` reads LS's census unscoped) · `arborist/serve.js:959,1041` (Salon publish + variant-rating re-bake **LS** unconditionally, so authoring from a Łódź Look re-bakes LS's placements) · `arborist/serve.js:1106`.

## 4. ⚠️ Site 6 is NOT a constant swap — scope it honestly

The generator (`hydrate-anchor-cards.js`, 87 ln) builds the whole 4×24×5 sky table from `lat/lon/tz` + SunCalc, so **no data need be acquired** — that part is genuinely easy, and its own header says it is re-runnable.

The hard half is consumption: `skyGrid.js:160` exports `ANCHOR_CARDS` as a **static module constant**, read by pure functions (`buildMosaicForDate`, `resolveSkyAtMinute`, `flankingAnchors`) across five files (`CelestialBodies.jsx`, `Atmosphere.jsx`, `SkyGradientGrid.jsx`, `useCartographStore.js`). Making it per-Look means deciding **where per-Look cards live and how the render reaches them** — most likely baked into `scene.json` and the consumers rewired to read from the slab.

**This is a render-path change and the eye gates it across all seven TOD slots** (`feedback_proxy_render_is_not_the_operator_eye`). Do not land it on a proxy render. Expect **M–L**, not S.

**Also fix while in there:** `skyGrid.js`'s `SKY_ANCHOR_DOY` / `flankingAnchors(doy)` take **no latitude** and hardcode northern solstice/equinox day-numbers, while `useCalendar.js:20` correctly inverts seasons for `lat < 0`. A southern-hemisphere town would get a summer calendar against a winter sky. Latent, no install affected yet.

**Evidence it is live:** Księży Młyn is at **51.752°N**, 13° north of LS. `CelestialBodies` computes the true sun from the instance's real lat/lon, so the sun sets ~90 min before the dome darkens in winter. Separately, **16 of 16 sky channels in Łódź's baked `scene.json` are byte-identical to LS's**, including an *authored* `skyGain` curve that `bake-scene.js:110` says an unauthored Look should not have.

## 5. What "fixed" means

For each site, absence must produce **one** of these — never a silent substitution:

- **honest zero** — the feature does not render, no error (the `tree-bake-inputs.mjs` pattern). Preferred.
- **documented fallback** — a *generic* default that is not any real town's data, logged loudly at bake time.
- **loud refusal** — only where proceeding would corrupt an artifact.

⛔ **A fallback to another installation's data is never acceptable, however plausible it looks.**

Add the three-way distinction to the manifest's absent-state column: `honest-zero` / `documented-fallback` / `⛔ LS-BLEED` (`INTAKE-CATALOGUE.md §0`).

## 6. Deliver

1. Sites 1–5 excised, each degrading per §5. These are independent of one another — land them separately, smallest first.
2. Site 6 scoped and landed **with Jacob's eye across the TOD slots**, or explicitly deferred with the scope written down.
3. Site 8 — instance-derive the prose. ⚠️ **This is `ROADMAP C1` Phase 4** (`HANDOFF-blank-app-instance-decoupling.md`), not intake; coordinate rather than duplicating it. The legal exposure argues for doing it early regardless.
4. **A regression test for the class**, not just the instances: pour or stub a scene with no lamp data, no census, no species map, no instance file, and assert **nothing of LS appears in its outputs**. Without this the habit returns — it already did, twice, in one file.
5. A short writeup: which sites landed, which deferred and why, and whether any *new* bleed surfaced while looking.

## 7. Rules

- **Confirm alignment with Jacob before writing code** (`CLAUDE.md §Standup before code`).
- Everything inside `lafayette-square.nosync/`. **Do not start a dev server** — one is running.
- ⚠️ **Do not `git restore public/baked/**`** — the working tree is more correct than `origin/main` there.
- Sites 2/3/4 share `arborist/bake-trees.js`; sites 1/4 share `src/data/street_lamps.json`. **Serialize within those groups** (`feedback_load_bearing_files_serial_dispatch`).
- Name yourself in the writeup.


---

# ⭐ APPENDIX A — TWO NEW CLASSES (added 2026-07-31)

**The 2026-07-20 sweep found bleeds of one shape: _an input is absent, so LS's data stands in._ Both
classes below are different, and neither is covered above.**

- **Class B — ALWAYS-ON cross-scene reads.** Not absence-triggered. LS's data is compiled into a
  shared module and consulted in **every** scene, so it fires *even when the town has its own data*.
  (Site 4 above is the same shape — module-level, unconditional — so this class was already present
  and un-named.)
- **Class C — the BUILD direction.** Not "the operator sees LS's data" but "the operator's action is
  silently redirected **onto** LS." These are worse: Class A/B show a wrong map, Class C **overwrites
  a right one**.

All line numbers verified 2026-07-31; re-verify before editing.

## A.1 The sites

| # | Site | Class | What bleeds | Sev |
|---|---|---|---|---|
| 9 ⭐ | `src/cartograph/measureModel.js:16` + `:36` | B | `import ribbonsRaw from '../data/ribbons.json'` → a measurement lookup **keyed by street NAME** (and skelId), used as the chain-level read-default for seeding + handle placement. **Zero scene checks in the file.** Read by `MeasurePanel.jsx`, `SurveyorOverlay.jsx`, `MeasureOverlay.jsx` — i.e. the whole Measure/Section authoring surface, in every scene. | **HIGH** |
| 10 | `src/components/LafayettePark.jsx:16` → `:234`, `:290` | B | LS ribbons used for park path rings, **zero scene checks in the file**. ⚠️ *Verify whether the component mounts outside LS before excising* — it may be gated by its caller, which would make this soft. | MED — verify |
| 11 ⭐⭐ | `cartograph/config.js:26` | **C** | `SCENE = process.env.CARTOGRAPH_SCENE \|\| DEFAULT_SCENE`. Forget the env var and **every build silently becomes Lafayette Square** — no error, no warning. Cost a full day on 2026-07-31: an agent rebuilt LS repeatedly while the operator was working in `lafayette-square-staging`, and the "no symptom change" that resulted was read as the fix failing. | **HIGH** |
| 12 | `cartograph/serve.js:902` | C | `const scene = sceneRouteMatch[1] \|\| DEFAULT_SCENE` — a request that omits the scene is served **LS's** artifacts under whatever the caller thought it asked for. | MED |
| 13 | `cartograph/serve.js:765` | C | `if (!entry.scene) { entry.scene = DEFAULT_SCENE }` — a Look with no scene is **assigned** LS. The wrong value is then persisted, so the bleed outlives the request. | MED |
| 14 ⭐⭐ | `cartograph/serve.js:1906` | **C** | `const bakeScene = bakeLookEntry?.scene \|\| DEFAULT_SCENE` — a bake whose Look carries no scene **bakes over Lafayette Square**. This is the destructive end of the class and the mechanism behind `ORIENTATION`'s palimpsest warning (*"pouring a second neighborhood can overwrite production LS"* — it did, 2026-07-23). | **HIGH** |

**Verified NOT bleeding** (they import LS's ribbons but gate correctly — leave them alone, and don't
"fix" them in a sweep): `MapLayers.jsx:14` (`isLS ? _lsRibbonsData : (sceneRibbons \|\| _EMPTY_RIBBONS)`
— a non-LS scene degrades to an honest empty, which is exactly §5's preferred pattern) ·
`useCartographStore.js:9` (`:2144` gates on `BUNDLED_SCENES.has(scene)`).

## A.2 ⭐ Site 9 measured — and why nobody caught it

`measureModel.js` keys on **street name**, so it fires wherever a poured town shares a name with LS:

| town | street names that silently inherit LS measurements |
|---|---|
| **Altadena** | **24** — incl. real ones: *Allen Avenue*, *Iowa Avenue* |
| Hi-Pointe–DeMun | 6 |
| Księży Młyn · Centrum | **0** |

⭐ **Both Polish pours collide on ZERO.** The defect is invisible in exactly the scenes reached for to
prove the kit travels, and only fires on a second *American* town — which is the case that matters and
the case nobody ran. Every town additionally collides on the auto-generated `motorway_link N` names,
**by construction**.

Reproduce: load LS's `streets[].name` into a set, intersect with each scene's
`cartograph/data/<scene>/clean/ribbons.json`.

## A.3 What "fixed" means for these two classes

§5's three outcomes still govern, with one addition per class:

- **Class B** — the lookup must be **scene-scoped**, not name-scoped. A default seeded from *another
  installation's survey* is never a "documented fallback"; it is site 9's whole defect. If no
  scene-local measurement exists, seed from the **standards/AASHTO** default (which is generic and
  belongs to no town) or degrade to honest-zero.
- **Class C** — an unresolved scene must be a **loud refusal**, never a default. `SCENE`, the route
  param, the Look's `scene`, and the bake's scene should each throw or exit non-zero with the missing
  value named. ⛔ Nothing that WRITES may fall back: site 14 can destroy production LS, and a default
  is not worth that.

## A.4 Add to the §6 regression test

The existing item 4 asserts *"nothing of LS appears in a stubbed scene's outputs."* Extend it to the
two new classes, because neither is triggered by absence and item 4 would not catch either:

- **Class B:** pour a scene that shares street NAMES with LS but has its own measurements; assert no
  LS measurement reaches it. (Name-collision is the trigger, not absence.)
- **Class C:** run each entry point with the scene omitted; assert it **fails** rather than defaulting
  — and specifically that a bake cannot touch `lafayette-square` unless LS was named explicitly.

## A.5 Why this belongs in this brief and not a new one

`ORIENTATION` and `CLAUDE.md` **Layer 0** now carry the principle (*"no fallbacks — a fallback turns a
failure into a plausible-looking success"*, Jacob 2026-07-31). This document is where the *sites* live,
so the sites go here. ⛔ Do not open a second brief for the same class — that is the palimpsest, and
the class already went un-named for eleven days because site 4 had no category to belong to.

**Tracked in `ROADMAP` as A00.**


---

## A.6 EXCISION LOG — landed 2026-07-31

| # | Site | What it does now |
|---|---|---|
| 9 | `measureModel.js` | **Scene-scoped.** The static LS import is gone; the active scene's fixture is registered by the store (`setSceneMeasureSource`, called where the store already resolves `ribbonsFixture` per scene). Unregistered ⇒ the seed is EMPTY and `chainMeasure` degrades to the generic type default, which belongs to no town. |
| 11 | `config.js:26` | `--scene=<id>` added; `SCENE_IS_EXPLICIT` tracks whether the operator named it; an unnamed run warns. **`requireExplicitScene()` added and called by every WRITE entry point** — `pipeline.js`, `promote-ribbons.js`, `skeleton.js`, `bake-terrain.js` — which now exit(2) with the fix printed. |
| — | `config.js` `_loadGeography` | ⭐ **Found while excising, not in the original sweep.** A non-default scene with no `geography.json` fell back to `INSTANCE.geography` — projecting another town at **St. Louis's lat/lon**, every derived metre wrong, with only a `console.warn`. Now exits(2). |
| 13 | `serve.js:765` | No longer **assigns** LS to a scene-less Look (the wrong value used to persist). Warns and leaves it unset. |
| 14 | `serve.js:1906` | A bake whose Look has no scene now **409s** instead of baking over Lafayette Square. |
| — | `promote-ribbons.js` | ⭐ **Found by re-committing the same crime while verifying.** The promote silently replaced the committed artifact with a materially different re-derivation — **three times on 2026-07-31, twice while merely "verifying" an unrelated change**. It now compares `{streets, tiles, faces, medians, nodes, caps}` and **refuses when any moved**, printing the delta; `--yes` to override. Verified firing on the real case (`nodes 233 → 228`). |

**Not done, deliberately:**
- **Site 10** (`LafayettePark.jsx`) — ▶ **now carried as `B7`/`B8` in Appendix B**, with the verify it was waiting on written up as **Act 0** (`§B.2`). Still not touched on a guess.
- **Site 12** (`serve.js:902`, scene-less route ⇒ LS) — `api.js sceneUrl()` deliberately emits scene-less URLs for the default scene, so refusing would break the running app. Needs the client changed first; **sequence it with the client, don't cut it alone.**
- **Sites 1–8** — the original absence-class sweep, untouched here.

⚠️ **`--scene=` is now required by the write paths.** `node cartograph/pipeline.js` alone exits(2) with the corrected command printed. This is the intended friction: the missing flag is exactly how a full day got spent building the wrong town.


---


# ⭐ APPENDIX B — THE STATIC `src/data/*` NAME-IMPORTS (added 2026-09-01)

**Agent: FRESH.** A bounded, mechanical excision against a measured site list. No prior session
context is worth inheriting — but ⛔ **read §1–§7 and Appendix A first**: this is the *same class* as
site 9, and §5's three-way "what fixed means" is the acceptance criterion here too.

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README.md §⭐ START HERE` → **`EXTENT-DESIGN.md`
> §2.1 and §6**. This appendix IS `EXTENT-DESIGN §6` **step 4**, written as sites. The design of record
> is that document; this is where the sites live (§A.5).

## B.0 ⛔ PREMISES ARE CLAIMS — here is what was measured, and when

Everything below was measured **2026-09-01**. ⛔ **Re-run before sizing anything on it.** The count for
this exact job has been quoted at **19** (`EXTENT-DESIGN §2.1`, stale), **13** (`cartograph/NOTES.md:22`,
re-measured 2026-08), **~90** (a loose filename grep, wrong — it counted doc mentions and runtime
fetches), and **8** (below). Four values. §2.1 carries a standing ⛔ *count them, don't quote a figure*
for precisely this reason.

```
grep -rn "data/\(ribbons\|buildings\|street_lamps\|landmarks\|park-feature-elev\)\.json" src cartograph \
  --include="*.js" --include="*.jsx" --include="*.mjs" | grep -v _archive
```
→ 43 hits / 25 files total; **8 of them are static `import` sites across 7 files.** The rest are runtime
fetches and comments and are **not** this ticket.

## B.1 The sites

| # | Site | Reads | Status / note |
|---|---|---|---|
| B1 | `src/cartograph/CartographApp.jsx:53` | `ribbons.json` | ⚠️ one of the three §2.1 names as **the live root**. Sits beside `:52`'s `toy/toy-ribbons.json` — the per-scene shape already exists next to it. |
| B2 | `src/cartograph/MapLayers.jsx:14` | `ribbons.json` | ⚠️ §2.1 root. Already named `_lsRibbonsData` — someone knew. |
| B3 | `src/cartograph/stores/useCartographStore.js:9` | `ribbons.json` | ⚠️ §2.1 root. **Land this one first** — site 9 (`measureModel.js`) was fixed by having *this store* register the active scene's fixture, so the pattern is already in this file's blast radius. |
| B4 | `src/cartograph/SurveyorPanel.jsx:3` | `landmarks.json` | authoring-side, independent. |
| B5 | `src/components/lampLightmap.js:5` | `street_lamps.json` | **LIVE in the player** — `ls/ARCHITECTURE.md §1`: *"Shader glow DataTexture still reads live `street_lamps.json`."* |
| B6 | `src/components/StreetLights.jsx:12` | `street_lamps.json` | ⭐ **Probably an EXCISION, not a migration** — `ls/ARCHITECTURE.md §1` records *"StreetLights.jsx no longer mounted by Scene."* **Confirm it is unmounted, then delete the file** rather than migrating dead code (`feedback_dead_code_gets_excised_not_archived`). |
| B7 | `src/components/LafayettePark.jsx:16` | `ribbons.json` | = **site 10**, logged in §A.6 as *"not done, deliberately — needs the verify step: does it mount outside LS?"* That verify is Act 0 below. |
| B8 | `src/components/LafayettePark.jsx:28` | `park-feature-elev.json` | same file, same gate as B7. |

⭐ `buildings.json` does **not** appear — it already loads dynamically through `src/data/buildings.js`.
That file is the reference caller of the `loadInstanceData` seam; **copy its shape, don't invent one.**

## B.2 ⛔ ACT 0 — THE MEASUREMENT THAT GATES THE WORK. Do this before touching a line.

`EXTENT-DESIGN §2.1` carries an open flag, verbatim:

> ⚠️ **UNMEASURED — establish before sizing step 4 on it:** whether those three imports are *live* with
> a non-LS scene open, or superseded at runtime. **Cause not established.**

**So Act 0 is: open the authoring app on HPDM and find out whether B1/B2/B3 reach anything.** Three
outcomes, and they mean different jobs:

- **Live** → HPDM is being authored against LS's ribbons. That is Class B, the site-9 defect, and it is
  a real bug to report before fixing.
- **Superseded at runtime** → the imports are inert ballast. Retiring them is cheap hygiene, not a cure,
  and this appendix should say so rather than keep claiming a root.
- **Mixed** → say which is which, per site.

⛔ **Write the answer into §2.1 and delete the UNMEASURED flag.** A flag that outlives its question is
the anti-pattern `CLAUDE.md` names. ⭐ And answer B7's twin question in the same sitting: **does
`LafayettePark` mount on a non-LS look?** Site 10 has waited on that one question since 2026-07-31.

## B.3 What "fixed" means here

§5's three-way rule applies unchanged, and **site 9 is the worked example** — copy it:

> the static LS import is gone; the store registers the **active scene's** fixture
> (`setSceneMeasureSource`). No registration ⇒ **empty seed** ⇒ the generic type default, *which belongs
> to no town*.

⛔ **"Empty" is the honest zero. Never `|| lafayetteSquare`.** And ⛔ **a sentinel is not a value** —
`0` / `null` / `''` must be distinguishable from *"not registered"* by the consumer, or you have built
the same defect wearing a different hat (`project_a_sentinel_is_not_a_value`).

⛔ **Not in scope: `blockCustoms` / `design.json` / per-scene authoring behaviour.** This is a *storage*
change. If the map moves, you have changed something you were not asked to change — stop and say so.

## B.4 ⭐⭐ THE DELIVERABLE IS THE CHECK — this is the part that reaches town #2

Eight edits help nobody unless the ninth import can't be written. Per `CLAUDE.md` **Layer 0**, the fix
is the **detector**, and per the prune rule a fact that can be checked by running something is a check,
not prose.

**Write `scratch/claims-no-static-shared-data-imports.mjs`:**
- **PARSE** the source for static `import … from '…/data/<shared>.json'` — ⛔ never a hard-coded list of
  the eight files, or it goes stale the day someone adds the ninth. Derive the shared-file set by
  reading what actually sits at `src/data/*.json` versus what lives under `src/data/<look>/`.
- **Exit 2** on any hit, naming file, line and the per-scene path it should use.
- ⭐ **Pin the runtime rule it models** and refuse to report green if that rule has moved — the standing
  pattern in `scratch/claims-*` (`HANDOFF-tree-render-2026-08-28`).
- Add it to `§A.4`'s regression list as the **Class B static-import** arm.

## B.5 Deliver

1. **Act 0 answered and written into `EXTENT-DESIGN §2.1`**, flag deleted. Nothing else starts first.
2. B1–B8 excised, **each landed separately, smallest first** (`EXTENT-DESIGN §6` step 4: *"Each import
   is independent"*). B3 first — the pattern is already in that file's neighbourhood.
3. B6 confirmed dead and **deleted**, or migrated if the confirmation fails.
4. **`scratch/claims-no-static-shared-data-imports.mjs`** written, failing before and passing after.
5. A short writeup: what landed, what Act 0 found, and whether any *new* bleed surfaced while looking.

## B.6 Rules

- ⛔ **Confirm alignment with Jacob before writing code** (`CLAUDE.md §Standup before code`).
- ⛔ **Step 4 is NOT gated on `EXTENT-DESIGN §6` step 3.** Only step 5 ("conform LS, last") carries that
  gate. Tomorrow is unblocked — do not wait on the two gate checks.
- ⛔ **HPDM is the test surface, not LS** (§6 priority ruling, Jacob 2026-07-22): *"I can't abide HPDM
  getting off on the wrong foot since it's the only actual commercially requested map."* LS is
  production `lafayette-square.com` and is conformed **last**, ⛔ **never the night before a demo.**
- ⛔ **The eye-gate is the operator's, on a non-LS scene.** A proxy render does not settle it
  (`feedback_proxy_render_is_not_the_operator_eye`).
- Everything inside the project folder. ⛔ **Do not start a dev server** — one is running.
- ⚠️ **Do not `git restore public/baked/**`.**
- B7/B8 share a file; B5/B6 share a data file. **Serialize within those pairs.**
- Name yourself in the writeup.

## B.7 ⛔ NOT IN SCOPE — the repo/folder rename

Moving the project to `dev.nosync/the-ward/` and renaming the GitHub repo is a **separate, undocumented
job** with a different risk profile (its only real coupling is the `lafayette-square-staging` external
repo + its `--base=` in `.github/workflows/staging.yml`; nothing in `src/`, `cartograph/`, `arborist/`
or `scripts/` references the folder name — only `scratch/*.mjs` absolute paths). ⛔ **Do not fold it in.**
It has had no standup and no ruling. **Tracked as: nothing yet — it needs one.**

**Tracked in `ROADMAP` as A00, and as `EXTENT-DESIGN §6` step 4.**
