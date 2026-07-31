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
- **Site 10** (`LafayettePark.jsx`) — needs the verify step the brief asks for (does it mount outside LS?). Not touched on a guess.
- **Site 12** (`serve.js:902`, scene-less route ⇒ LS) — `api.js sceneUrl()` deliberately emits scene-less URLs for the default scene, so refusing would break the running app. Needs the client changed first; **sequence it with the client, don't cut it alone.**
- **Sites 1–8** — the original absence-class sweep, untouched here.

⚠️ **`--scene=` is now required by the write paths.** `node cartograph/pipeline.js` alone exits(2) with the corrected command printed. This is the intended friction: the missing flag is exactly how a full day got spent building the wrong town.
