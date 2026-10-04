# Continuity map: Designer → Stage → Bake → Preview → Player (the Ward)

*Thread, for `cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`, delivered to Jacob in chat 2026-10-04. Read-only: nothing in
`src/`, `cartograph/`, `public/`, the docs or scene data was edited; no pours, bakes or servers.*

**What I measured against:** kit `a6efab65` and the Ward `cac0290`. The Ward is pinned to kit `c81f7bf6`, and
`git diff c81f7bf6 HEAD -- src/` is empty, so on 2026-10-04 the Ward and Preview drew with identical renderer source.
R2 and the live sites were read on 2026-10-04 with public requests. Probes: `scratch/runtime-continuity/*.mjs`.

**Class abbreviations used in the tables:**
- **AWT**: authored Ward truth
- **BWT**: baked world truth
- **DP**: deployment policy
- **RC**: runtime configuration
- **LD**: live data

> ⛔ **OUT OF SCOPE (Jacob via Boz, 2026-10-04):** the map switcher is not in Phase 2. It is operator navigation and
> tenancy, on a separate list. Two lines below are struck through and marked accordingly: §5's "Switching maps beside
> the Look" and §8's "Map switching beside the Look". **Stage by URL stays in.**

## 1. Per handoff

### Designer → Stage
| item | fate | authority | class | evidence |
|---|---|---|---|---|
| Entry | **Stage → runs a bake, then sets the Hero shot.** Extent never enters Stage: all three of its exits go to the Designer | `Toolbar.jsx` → `runBake({navigateTo:'hero'})`; `ExtentApp.jsx` calls `setShot('designer')` | RC | code |
| Entry without a bake | A reload whose saved shot was a Stage shot opens Hero on whatever slab is on disk | `useCartographStore#shot` initializer | RC | code |
| "Is this slab stale?" | **Not measured.** On load, `bakeStale = !entry.bakedAt`, which means "ever baked". The looks index carries both `updatedAt` and `bakedAt`, and nothing compares them | `useCartographStore#_loadLooks` | — | code |
| Designer view (ortho camera) | **Discarded.** It lives in localStorage `cartograph-camera` (no town in the key), and Browse takes its altitude once, in memory | `CartographApp#CameraRig` | RC | code |
| `layerStrokes`, `surveyDefault`, `openSections` | Survive into `design.json`; nothing in the bake reads them | `DESIGN_FIELDS` | RC sitting in an AWT file | grep |
| `activeStyles` | Persisted to localStorage; nothing outside the store reads it | store | dead | grep |

### Stage → Bake
| item | fate | authority | class | evidence |
|---|---|---|---|---|
| The 61 `DESIGN_FIELDS` | 47 go into `scene.json` by an explicit list, 11 go into ground, buildings, lamps and labels, and 3 have no bake reader | `bake-scene.js#bakeScene`, `serve.js` bake route | AWT → BWT | probe `design-vs-scene.mjs` |
| Bake input boundary | **Not a pure freeze.** A newer authoring input re-pours the town without asking; a code, geography, registry or data change asks first (428) | `serve.js` bake route, `runIfDirty('pipeline',…,judge:'mtime')` | — | code |
| Two design files | `DESIGN` (the Look's) and `SCENE_DESIGN` (the town's) are both read: `terrainExag`, trees, `groveThreshold`, `water` and the lamp zone tester come from the town's file. They are the same file only while look id = map id | `serve.js` bake route; `terrainLoad#authoredExag` | **duplicate authority** | code |
| Added at bake | `version`, `look`, `bakedAt`. The 24 kit-day channels plus `archLight` (no town authors any of them). `terrainExag→1`, `surfaces→{}`, `neonAuthored` | `bake-scene.js` | BWT (kit neutral) | disk |
| `shots.values.browse.bounds` | **LS's building footprint `{cx:95,cz:-158,w:1292,h:1025}` is in all six towns' `design.json` and `scene.json`.** It gets there because the hydrate merge fills it from `SHOTS_FLAT_DEFAULTS` and the autosave writes it back as if authored | `useCartographStore` `shots` hydrate; `skyLightChannels.js#SHOTS_FLAT_DEFAULTS` | an **LS constant posing as authored** | disk, all 6 towns |
| Huron's `parkTitlePos` | `[-22.48,-97.31]`, **identical to LS's**, and baked into `huron/labels.json` as `setPieceTitles['lafayette-park']` | `serve.js#SCENE_KEYED_DESIGN_FIELDS` doesn't strip it when a new town's design is seeded | **inheritance from another Ward** | disk. Whether it shows on screen is not established |
| Legacy `heroMotion` | `{period,easing}` is stripped to `{}`. This happens for HPDM, altadena and LS-staging | `bake-scene.js#stripTransientHeroMotion` | — | disk |
| Upload to R2 | Plain names. Excluded: `*-lod0.glb`, `*-viz.png`, and atlas-only files when no species is a model tree | `scripts/upload-baked-to-r2.mjs#EXCLUDE`; `treeGeometry.js#slabTreeGeometry` | DP | code + R2 |
| `manifest.json` | Written by `bake-manifest.mjs`, **not by any bake step**; uploaded as a plain file. It matched disk for 4 towns on 2026-10-04 | `cartograph/bake-manifest.mjs` | BWT | probe `manifest-vs-disk.mjs` |

### Bake → Preview
| item | fate | authority | class | evidence |
|---|---|---|---|---|
| Choosing the town | `?look=` › `?scene=` › the stored Look › a TownChooser. **H-35 is closed for Preview**: the Look and the town come from the same parameter | `PreviewApp#resolvePreviewLookId` + `instance.js#readLookParam` (**two parsers of the same parameter**) | RC | code |
| Render tree | Preview mounts `<Town>`. It adds `ShotCamera`, `BasicLights`, `ForceDaytimeOnMount` and the measurement chrome | `PreviewApp.jsx` | — | code |
| **Phone profile** | **Preview runs the desktop pass set on the phone tiers.** `inspect` is always passed, so `included = POSTFX_PIPELINE` (9 passes). A production phone gets 3 (grade, smaa, grain). The comment on `TIER_QUALITY` says the opposite | `renderPipeline.jsx#RenderPipeline` | — | code, verified |
| phone-hi vs phone-lo / the pyramid tuner | **They change nothing that renders.** Nothing imports `pyramidDegreeFor` | `renderTiers.js` | — | grep, verified |
| `heroLadder` | Preview mounts it whenever its toggle is on, ignoring its gate; production mounts it only when DoF is on. So Preview's "all on" is not production's mount list | `renderPipeline.jsx#mountOn` | — | code |
| Inspection visibility | localStorage `preview.layers.v3`. It never writes `design.json` or `scene.json` ✅ | `PreviewApp#saveLayers` | RC | code |
| Deployment policy (the per-platform channel listing) | **Does not exist.** `OPERATIONS.md:324` describes it as present; the same doc's §Deployment policy says "not yet built" | — | DP | grep |
| Street position | `PREVIEW_STREET_AT = SHOTS.street` = LS's `[0,-50]`, used for every town | `PreviewApp.jsx` | an **LS constant** | code |
| OG capture | Writes **one global `public/photos/og-preview.jpg`**, whichever town it captures | `serve.js` `/og-image` | DP | code |

### Bake → Player (the Ward), and Preview → Player
| item | fate | authority | class | evidence |
|---|---|---|---|---|
| Town | The `ward-look` tag or the first path segment. An unknown town gets a `TownError` screen, with **no fallback** ✅ | `theward/src/town/page.js#readPage`, `manifest.js#loadManifest` | DP | code |
| Identity | **Baked**: `manifest.identity`, copied from `src/instances/<map>.js` by `bake-manifest`. The Ward never loads `instance.js` | `bake-manifest.mjs` | AWT → BWT | code + dist |
| `townId` (backend key) | `manifest.identity.townId`. **There are two `townTenant` implementations**: the Ward's `town.js` and the kit's `instance.js` | `cartograph/data/<map>/town-id.json` | AWT | code |
| Renderer code | Pinned `c81f7bf6` in every environment (staging and production confirm `c81f7bf6`) | `staging/ward/current.json` and the host records | DP | R2 |
| **Running locally (dev)** | **A mix.** The renderer code is pinned, but `node_modules`, the slab and every `kitUrl` file come from the **kit working tree** on :5173 | `theward/vite.config.js`, `.env` | — | code |
| Slab names | **Plain, mutable names everywhere.** No deployed manifest carries `names` | `slabUrl.js#townOf` | DP | R2 |
| `manifest.json` | **Fetched twice** per page, with separate caches | `theward/.../manifest.js` and kit `slabUrl.js#townOf` | duplicate | code |
| `ward-look` tag the Ward injects | **Nothing reads it.** Its only reader is `instance.js`, which isn't loaded. So README §7's "two loaders still reach the boot town" doesn't match the code at `c81f7bf6` | `theward/src/main.jsx#boot` | — | code + dist |
| Weather, sun, moon, tide, Apps Script, the listings overlay | Fetched live, keyed by `identity.geography` and `townId` ✅. This is the spec's "bake the ability to find live information, not the information" | various | LD | code |
| `cary`, `commerce`, `legal`, `contact`, `profile`, `modules` | Baked into the manifest; **the Ward reads none of them** (`bake-manifest` reads only `modules.delivery`) | — | baked, unused | code |

### The two other players (one row each)
| player | finding | evidence |
|---|---|---|
| Legacy `Scene.jsx` / `App.jsx` at HEAD | It mounts `<Town>`. **No R2 record names `legacy`**: all four staging records and both production host records say `ward`. It frames Browse from LS's bounds box and keeps its own "drag over 6 px → Browse" rule | R2 |
| lafayette-square.com | Serves the legacy build `main-DLxl3yuW.js` from `origin/main` `8c462ebe`, which is 1,216 commits behind and has no `Town.jsx`. It sits outside the `hosts/` system; `hosts/lafayette-square.com.json` returns 404. Retired by LS's cutover | live site + R2 |

## 2. Duplicate authorities, reconstructions, silent substitutions

**Duplicate authorities**
1. **The town's design file:** `DESIGN` vs `SCENE_DESIGN` in the bake. *Unbuilt intent*: the code comment flags it, and the brief is `BRIEF-dirty-graph`.
2. **"Which town is this page":** `instance.js#readLookParam` and the store's `scene`/`activeLookId` each answer it, and they're reconciled by a page reload (`CartographApp`, `setScene`). Preview parses `?look=` a third time. Cause not established.
3. **Browse framing has three sources that never meet:**
   - `browseFrame`: authored in Stage, baked (PT, Huron and LS carry one), and **read by no runtime**.
   - `shots.browse.bounds` (LS's box): read by the legacy player.
   - `framePlaces`/`frameDensest`: used by Preview and the Ward.

   I can't tell whether the runtime side regressed or was never built; cause not established.
4. **Three Browse-altitude formulas:** `browseAltitude`, `browseFitAltitude` (fixed 1.12 pad) and `planAltitude`. Also three implementations of "where does each shot put the camera" (`CameraRig`, `ShotFlight#destination`, the legacy `CameraRig`), and four shot vocabularies with five mapping tables. Drifted code.
5. **Weather at one instant:** a single fetch, read two ways. At a scrubbed time the label shows that hour's forecast (`theward almanac/reading.jsx#readingAt`), while the sky shows *current* conditions under that hour's sun (`useAtmosphereDirective`). There are also two forecast interpolators, the Ward's cubic and the kit's linear (`dawnTimeline.js#interpolateForecast`). Drifted code.
6. **Page title:** `staging/player/towns.json` vs `manifest.identity.branding.title`.
7. **The town's name in three places:** the instance module's `name`, `branding.title`, and the looks index's `name` ("HiPointe-DeMun" vs "Hi-Pointe–DeMun").
8. **Duplicated tables:** `SHOT_ADJACENCY` (in both `PreviewApp` and `TriggerBar`) and the tier tables (`RENDER_TIERS` / `DEVICE_PROFILES` / `TIER_QUALITY`).

**Reconstructions**
- A hero movie with no keyframes is derived from the disc (`cameraRegimes#derivedOpeningKeyframe`), **with no log line**. **HPDM's deployed slab has 0 keyframes**, so it plays this derived movie.
- `taxonomy` and `board` are rebuilt from kit defaults, marked `authored:false`. That one is declared.

**Silent substitutions (cause given per item)**
- **LS-mould constants:**
  - `SHOTS_FLAT_DEFAULTS.browse.bounds`
  - `StageApp#SHOTS`: hero `[-400,55,230]` and street `[0,-50]`, reused by `PREVIEW_STREET_AT` and Preview's initial Canvas pose
  - Stage's Browse branch gated on the town's name, `mapKey !== 'lafayette-square'`: a poured town with no boundary loaded falls through to LS's poses
  - Huron's copy of LS's `parkTitlePos`

  *Drifted code (Class D).*
- **Bake:**
  - `serve.js` `bakeDesign`: a missing or unreadable `design.json` silently becomes `{}`.
  - `bake-ground.js` does the same with a missing design.
  - `bake-buildings.js#loadSceneTerrain || flat` silently gives flat terrain.
  - *Drifted code.*
- **Stage:** `useCartographStore#setActiveLook` (a Look switch within the same map) sets the new id before the fetch, and on a failed fetch the previous Look's state autosaves under the new id. Possible by the code, not observed.
- **Ward:**
  - `readingAt`: a time outside the forecast silently shows "now".
  - `fetchWeather`: swallows errors.
  - `photos || {}`, the tide `.catch(()=>null)`.
  - `skyModeOf`: anything that isn't volumetric becomes cheap, and a `?sky=` override works in production.
- **Slab stamps:** `BakedGround` and `SlabBuildings` build file URLs from the stamped `m.look`, not from the Look that was requested, with no check. On 2026-10-04 every stamp matched its folder (probe `stamp-audit.mjs`), so nothing is wrong yet. The tree atlas path *does* refuse a mismatch loudly. Unbuilt intent.
- **A vacuous check:** `claims-baked-consumers-get-a-cache-bust` passes while checking **0 mount sites**. Cause not established.

**Rot (each is the doc's or comment's fault, not the code's)**
- `runBake`'s comment says `'browse'`; the code passes `'hero'`.
- `OPERATIONS.md`'s branch table lists `staging.yml`, which no longer exists.
- `PREVIEW.md` says "5 passes"; the code has 6 desktop-only passes. It also says "pyramid degree swap", which reaches nothing.
- The comment on `TIER_QUALITY`.
- Neon-force: removed in `55fdab64`, still in the docs.
- The `EXCLUDE` comments cite `.gitignore` line numbers that are now wrong.
- `arborist/bake-trees.js` header: says the hero Look defaults to LS.
- `BakedLamps.jsx` header: describes an LS fallback the code no longer has.
- The Ward's `RENDERER_ASSETS` proxy header: static analysis finds no reader of the proxy.
- `manifest.json#files` lists files that are never published.

## 3. Is `instance.js` still necessary?

**Only for the kit's own apps: Stage, Preview, the legacy player and lab.** The Ward doesn't load it; it reads the same
data baked into `manifest.identity`.

What it owns today:
1. **Resolving the page's town.** `readLookParam` picks the town from host tag › `?look=` › the authoring store's key/`?scene=` › path segment › LS. This duplicates the store's own resolver.
2. **`mapForLook`.**
3. **`townTenant`.** This duplicates the Ward's.
4. **`moduleOn`.** Absent means on.
5. **The loud fallback to LS** for an unregistered map.

The **content** of identity lives in `src/instances/<map>.js` plus `town-id.json`. That's the authored Ward truth, and
`bake-manifest` already bakes it.

Fields in the instance module that aren't identity:
- `skyMode` and `mobileQuality`: runtime configuration or deployment policy.
- `lookId`: overridden at resolve time.
- `branding.mark`: a declared copy.
- `domain: null`: says the domain lives in Operations.
- `faviconUrl`: HPDM's points at lafayette-square.com. Declared, but it's another Ward's host.

**The smallest remainder:** the kit apps read identity from the baked manifest, exactly as the Ward does. `instance.js`
then shrinks to "which town is this authoring page", and the store already owns that question.

## 4. Camera trace (summary)

**Where each framing value is authored, and who reads it:**
| value | Stage writes / reads | baked | Preview | Ward | absent → |
|---|---|---|---|---|---|
| `heroKeyframes`, `heroMotion` | ✅ / ✅ | ✅, refused loudly if a key has no aim | ✅ | ✅ | a movie derived from the disc, **unlogged** |
| `browseFrame` | ✅ / ✅ | ✅ | ❌ | ❌ | `framePlaces`; a `console.warn` only when nothing is placed |
| `shots` fov/padding/eye | **no UI writes it** (`setShots` has no caller) | defaults, with **LS's bounds** | ✅ fov/padding | ✅ fov/padding | `SHOTS_FLAT_DEFAULTS` |
| `browseHeading` | ✅ | ✅ | ✅ | ✅ | 0, north (neutral) |
| Street position | not authored | — | LS's `[0,-50]` | the Ward has no street shot | LS constant |

**Camera controls as data: unbuilt intent.** `cameraRegimes#REGIMES` is fixed in code, and no per-town or per-shot
controls key exists in any `design.json`, `scene.json` or instance module.

**What a touch or drag does today:**
- **Stage:** Hero orbits when stopped and takes no input while playing. Browse pans and zooms. Street looks around.
- **Preview:** the same, except **in Hero a drag over 6 px or any wheel drops to Browse**. This is the rule Jacob ruled out on 2026-10-03; it's still present.
- **Legacy player:** the same drop-to-Browse rule, plus a tap or double-click goes to street.
- **Ward:** the movie takes no input. The plan pans and zooms. A touch only interrupts a running flight. There's no street shot.

**Fallbacks to whole-neighborhood framing:**
- Stage's first Browse entry: LS's centroid, or `browseFitAltitude(R)` around `[0,0]`. Silent.
- The plan with nothing placed: loud.
- `fitInside` when the frame is larger than the town: silent, but it reports counts.
- The derived hero movie: silent.

## 5. Jacob's two new requirements, traced as spec

**A Stage URL that names map, Look and shot** (in scope: it is how the spec's *"standalone Stage and Stage inside
Cartograph operate against the same state/runtime"* becomes real):
- **Map** = the store's `scene`: `?scene=` › localStorage `cartograph-scene` › null.
- **Look** = `activeLookId`: `?look=` › `cartograph-active-look`. A Look that disagrees with `?scene=` is refused out loud ✅ (`checks/claims-a-look-link-opens-that-town.mjs`).
- **Shot:** localStorage `cartograph-shot` only. There's **no URL parameter**, and every Stage shot collapses to Hero.
- `instance.js#readLookParam` (its authoring branch, `meta ward-authoring`) resolves the same map/Look a second time for the page, and `CartographApp` reloads when the two disagree.
- **Stale-slab entry:** nothing compares the index's `updatedAt` with `bakedAt`, and `updatedAt` doesn't cover overlay or skeleton edits. Cause not established.
- **The one authority tranche 2 needs is the store's `scene`/`activeLookId`/`shot` triple.**

~~**Switching maps beside the Look:** `Toolbar#LooksMenu` filters to the active map, and `setScene` already changes the
map and its Look in one move (`lookForScene`), with an unsaved-edit guard. **Nothing reads operator scope** anywhere in
`src/cartograph` or `serve.js`.~~ ⛔ **OUT OF SCOPE**: the map switcher is not in Phase 2 (Jacob via Boz, 2026-10-04).

## 6. Corrections to the brief
- **Premise 1:** Extent never enters Stage, and a reload enters Stage without a bake.
- **Premise 3:** at HEAD the "old player" mounts `<Town>`. The separate renderer is lafayette-square.com from `origin/main`.
- **Exhibit 2 no longer holds for HPDM.** All 10,825 placements draw as impostors, so `InstancedTrees`' `needsMaterials` is false and the mesh atlas is never requested. R2 returns 404 for the atlas PNGs. The viz PNGs aren't uploaded either; they're local-only, with no reader. Where Stage's `coverage mips` log line came from is not established: candidates are the earlier state with no impostors, or the Grove, which loads the atlas on purpose.
- **What's left of exhibit 2:**
  - Stale viz PNGs stay on disk after a rebake.
  - `lafayette-square-staging` culls 37.9% of its trees (loud, already ROADMAP B4).
  - `lafayette-square-staging` isn't in the looks index, and its slab is 22 hours older than its design.

## 7. Proposed checks (names only; none built)
1. **`claims-authored-framing-reaches-the-player`:** every framing key `bake-scene` writes has a reader in the Ward's import graph. Today it fails on `browseFrame`.
2. **`claims-no-town-carries-the-mould`:** reads every `design.json` and `scene.json` and fails when a value equals LS's (`browse.bounds`, `parkTitlePos`, LS shot poses) in a non-LS town.
3. **`claims-preview-phone-runs-production-passes`:** Preview's included pass list for phone equals `RenderPipeline`'s production phone list.
4. **`claims-a-stage-entry-knows-its-slab-age`:** the Stage load path compares the Look's last authoring time with `bakedAt`.
5. **`claims-the-slab-addresses-files-by-where-it-was-fetched`:** no `slabFetch(m.look, …)` call where `m.look` isn't checked against the requested Look.
6. **`claims-one-weather-per-instant`:** the label and the sky read weather-at-time-t from one function.
7. **`claims-baked-consumers-get-a-cache-bust`:** fail when it checks 0 mount sites, i.e. a mutation test of the check itself.
8. **`claims-the-ward-reads-what-the-manifest-bakes`:** baked identity fields with no Ward reader are listed, so each is either consumed or dropped from the bake.
9. **`claims-the-camera-has-one-definition`:** extend it to scan `theward/src`; today it doesn't.

## 8. Proposed tranche-2 rows, by spec section
- **Stage:**
  - Stage reachable by URL (map, Look, shot).
  - Entry refuses to draw a stale slab without saying so.
  - ~~Map switching beside the Look.~~ ⛔ **OUT OF SCOPE**: not in Phase 2 (Jacob via Boz, 2026-10-04).
  - Remove the LS-name gate in `CameraRig`.
  - `shots` gets an authoring UI, or LS's bounds come out of the defaults.
- **Camera / Framing:**
  - One Browse-frame authority: `browseFrame` is read by `ShotFlight`, or retired.
  - Per-town, per-shot controls become data.
  - Remove Preview's drop-to-Browse gesture.
  - Log the derived hero movie (HPDM).
  - One altitude formula and one shot vocabulary.
- **Identity:**
  - Kit apps read `manifest.identity`, and `instance.js` shrinks to resolving the authoring page.
  - Strip LS's values from seeded designs (`SCENE_KEYED_DESIGN_FIELDS`).
  - One `townTenant`.
  - Reconcile the three town names.
- **Bake:**
  - A missing `design.json` refuses the bake instead of baking `{}`.
  - One design authority per town.
  - Drop the never-published entries from `manifest.json#files`.
  - The Ward has no reader for `cary`, `commerce`, `legal`, `contact`, `profile` or `modules` (only `bake-manifest` reads `modules.delivery`): decide per field whether the Ward should read it or the bake should stop carrying it.
- **Preview parity:**
  - Phone tiers run the production phone pass set.
  - Give `heroLadder` its gate.
  - Delete or wire the do-nothing tier tuner.
  - Build the deployment-policy file. It doesn't exist yet; fix the doc that says it does.
- **Live handoffs:** one weather-at-time-t, and one forecast interpolator.
- **Bake → Player:** slab files addressed by where the manifest was fetched, or a loud check on the stamp. Fetch the manifest once.
