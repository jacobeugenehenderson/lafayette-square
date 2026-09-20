# BRIEF — excise the LS-bleed: absence must degrade to NOTHING, never to Lafayette Square

<!-- BRIEF-STATE
status: OPEN
dispatched: Act 0 landed 2026-09-20 (Kiln)
written: 2026-07-20
evict-when: sites 6 · 8 · 12 · 15 · 17 · B2-boundary all closed (16/18/19 done) AND node checks/claims-writers-name-the-scene.mjs is green
-->

**Agent: FRESH.** ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README.md §⭐ START HERE` →
the topic canon for the domain you're in. `INTAKE-CATALOGUE.md §0` (repo root) has the findings.

> ### ✅ ACT 0 COMPLETE — 2026-09-20 (Kiln). Every site re-measured; the dead ones are gone from this file.
> The pre-clean 409-line version is `cartograph/_archive/BRIEF-ls-bleed-excision-preAct0-2026-09-20.md`.
> **17 of 24 sites are gone** — 13 measured dead, site 5 **ruled closed**, sites 16/18/19 **fixed 2026-09-20**. (24, not 22: the widened check found two new ones.) They are **deleted, not ticked** — the killing
> commits are in `§0` in one line each, and nowhere else. ⛔ **Do not re-open them.**

---

## 0. What Act 0 killed — one line, then never again

| sites | killed by |
|---|---|
| **1** lamps · **2** placements · **3** species-map · **4** module-level `_lamps` | `b12627c8` — each now reads its OWN scene and degrades to zero; LS's paths are read **only** under `scene === 'lafayette-square'`, which is a source, not a fallback |
| **7** MSBF-only join | `adc03f32` |
| **9** `measureModel.js` name-keyed seed · **11** `SCENE` default · **13** Look scene assign · **14** bake-over-LS | `08d61ce1` |
| **B1** `CartographApp` · **B2** `MapLayers` ribbons · **B3** `useCartographStore` | never a fallback — measured scene-gated 2026-09-19 (`EXTENT-DESIGN §2.1` has the gates) |
| **B4** `SurveyorPanel` landmarks | retired 2026-09-19 via the `loadInstanceData` seam |
| **5** `src/instance.js` unregistered look → LS identity | ⛔ **RULED CLOSED, NOT A DEFECT** — Jacob, 2026-09-20, **twice**: *"an alarm for a non-existent fire… if `?look` is unregistered that's basically tautological"* · *"When would/could this ever even happen? And who cares if it does?"* ⛔ **Do not re-open, and do not re-derive it from the general no-fallbacks doctrine** — the operator ruled this specific case. `ROADMAP A12` retired to match. |
| **16** `bake-trees.js` bakes over LS · **18** `pack-impostor-ktx2` · **19** `17-fill-canopy-trees` | `8e90eeb7` — 16 guarded at the CLI entry; 18's `\|\| '--look=lafayette-square'` and 19's **dead refusal** (`\|\| 'lafayette-square'` above an `if (!SCENE)` that could never fire) both now exit 2. ⭐ **18 and 19 were found BY the widened check, not by reading** — which is the argument for §4. |

⭐ **The argument for Act 0, kept because it recurs:** those thirteen dead ones were closed by **six different
agents, none of whom knew this brief existed.** The class is being closed incidentally and nobody was
keeping score. ▶ That is what `§4`'s check is for.

### ⭐⭐ AND TWO OF THE BRIEF'S OWN PREMISES WERE FALSE. Both would have caused damage.

- ⛔ **B6 said *"`StreetLights.jsx` is no longer mounted — confirm it is unmounted, then DELETE the
  file."*** **It is mounted, in three surfaces** — `BakedLamps.jsx:56` (Preview's lamp render),
  `CartographApp.jsx:875` (toy lamps), `StageApp.jsx:25`. **Following the brief would have broken the
  lamp render.** The `ls/ARCHITECTURE.md §1` line it rested on (*"no longer mounted by Scene"*) is
  true and narrow — `Scene.jsx` is one of four callers. ⭐ **A doc sentence scoped to one caller,
  quoted as a statement about the file.**
- ⛔ **Site 15 said the module-level singleton sampler in `src/utils/elevation.js` "has no scene in
  scope."** It does now: the sampler is **rebuilt per look** on terrain reload (`onTerrainReload`,
  `currentTerrain()`), so terrain is already per-look and **only `V_EXAG` is global.** Site 15 is
  *smaller* than briefed, not larger.

---

## 1. The defect, in one sentence

**When an input is absent, the kit does not render nothing — it renders Lafayette Square's data under
the other town's name.** It is not a bug, it is a **habit** the codebase acquired while LS was the
only installation.

A missing feature is honest and legible. A bleed is **plausible and wrong** — LS's sky, LS's legal
jurisdiction, rendered convincingly enough that nobody investigates. It costs more than an empty row
because it doesn't look like a problem.

⭐ **The correct pattern already exists in-repo — copy it, don't invent one:**
`cartograph/tree-bake-inputs.mjs` returns `null` when a scene has no census — *"an HONEST ZERO, not an
error: the caller skips the placement step rather than baking someone else's trees under this
scene's name."*

### The three classes
- **A — absence.** An input is missing, so LS's data stands in.
- **B — ALWAYS-ON cross-scene reads.** Not absence-triggered; LS's data is compiled into a shared
  module and consulted in **every** scene, even when the town has its own.
- **C — the BUILD direction.** The operator's action is silently redirected **onto** LS. Worse than
  A/B: those show a wrong map, **C overwrites a right one.**

## 2. What "fixed" means

Absence must produce **one** of these — never a silent substitution:
- **honest zero** — the feature does not render, no error. **Preferred.**
- **documented fallback** — a *generic* default belonging to no real town, logged loudly at bake time.
- **loud refusal** — only where proceeding would corrupt an artifact. **Mandatory for Class C:
  nothing that WRITES may fall back.**

⛔ **A fallback to another installation's data is never acceptable, however plausible it looks.**
⛔ **And a sentinel is not a value** — `0`/`null`/`''` must be distinguishable from *"not registered"*
by the consumer, or you have built the same defect wearing a different hat
(`project_a_sentinel_is_not_a_value`).

---

## 3. THE LIVE SITES — all re-verified 2026-09-20

| # | Site | Class | What bleeds | Sev |
|---|---|---|---|---|
| **6** | `cartograph/pipeline/hydrate-anchor-cards.js:28-30` | A | `LAT=38.6160 / LON=-90.2161 / TZ=-6` hardcoded. ⭐⭐ **Every town's sky is St. Louis's sky**, two months after filing. See `§3.1`. | **HIGH** |
| **15** | `src/lib/terrainCommon.js:18` | B | `V_EXAG = 1.5`, chosen against LS's relief and applied to every town. **Relief across the disc: LS 35.2 m · HPDM 43.1 m · altadena 1,480.3 m.** One multiplier for a river bluff, a lake plain and the San Gabriels. See `§3.2`. | **HIGH** |
| **8** | `InfoModal.jsx` (0 `INSTANCE` reads) · `src/pages/LegalPage.jsx` · `CourierOnboarding.jsx` | A | LS prose + **State of Missouri governing law** + the LS delivery zone, hardcoded. **`INSTANCE.legal` exists, LS and HPDM both populate it, and it has ZERO consumers** (`git grep 'INSTANCE.legal'` → nothing). ⭐ **Exposure is currently nil** — Łódź was excised 2026-09-19, and HPDM runs `cary:false`. So this is **structural, not urgent**; it becomes urgent the day a second delivery install exists. | MED — legal, latent |
| **12** | `cartograph/serve.js:1142` | C | `sceneRouteMatch[1] \|\| DEFAULT_MAP` — a scene-less request is served **LS's** artifacts. ⛔ **Deliberately deferred:** `api.js sceneUrl()` emits scene-less URLs for the default scene, so refusing breaks the running app. **Sequence with the client; do not cut it alone.** | MED — blocked |
| **17** ⭐ | `arborist/serve.js:1107` | C | **NEW, found in Act 0.** `routeScene = routeLook ? … : 'lafayette-square'` — a routing **write** with no `?look=` lands in **LS's species-map.** Soft (authoring only) but it is a write. | LOW |
| **B2b** ⭐ | `src/cartograph/MapLayers.jsx:507` | A | **NEW, found in Act 0.** `(isLS \|\| !sceneBoundaryRaw) ? _LS_BUNDLE : makeBoundary(…)` — a non-LS scene with **no boundary** gets **LS's boundary polygon** for clip + fade (`:515`, `:520` branch off it). ⚠️ **Latent today** — all 6 scenes have `neighborhood_boundary.json` — so it fires on a **fresh pour** and in the async fetch window. ⭐ The file's own comment at `:102` says this bundle is *"for scene==='lafayette-square'"*; the `\|\| !sceneBoundaryRaw` clause **exceeds its stated intent.** ⛔ The brief previously listed `MapLayers.jsx` under *"verified NOT bleeding"* — that verification covered `:503` (ribbons) and **not this line.** | MED |

**Soft, authoring-only** (fix opportunistically, don't gate on them): `arborist/serve.js:1056`
(`GET /inventory` reads LS's census unscoped) · `arborist/serve.js:959,1041` (Salon publish +
variant-rating re-bake LS unconditionally — now **declared LS-only by design** in their own source,
so read the comment before calling them defects).

### 3.1 ⚠️ Site 6 is NOT a constant swap — scope it honestly

The generator (`hydrate-anchor-cards.js`) builds the whole 4×24×5 sky table from `lat/lon/tz` +
SunCalc, so **no data need be acquired** — that half is genuinely easy and the file is re-runnable.

The hard half is **consumption**: `skyGrid.js:160` exports `ANCHOR_CARDS` as a **static module
constant**, read by pure functions (`buildMosaicForDate`, `resolveSkyAtMinute`, `flankingAnchors`)
across four files (`CelestialBodies.jsx`, `Atmosphere.jsx`, `SkyGradientGrid.jsx`, `proceduralSky.js`).
Per-Look means deciding **where per-Look cards live and how the render reaches them** — most likely
baked into `scene.json` with the consumers rewired to read the slab.

**This is a render-path change and the eye gates it across all seven TOD slots**
(`feedback_proxy_render_is_not_the_operator_eye`). ⛔ Do not land it on a proxy render. **M–L, not S.**

**Also fix while in there:** `skyGrid.js`'s `SKY_ANCHOR_DOY` / `flankingAnchors(doy)` take **no
latitude** and hardcode northern solstice/equinox day-numbers, while `useCalendar.js:26` correctly
inverts seasons for `lat < 0`. A southern-hemisphere town gets a summer calendar against a winter sky.
Latent; no install affected.

### 3.2 Site 15 — `terrainExag`, RULED by Jacob 2026-09-20

▶ **`terrainExag` becomes a per-town authored value in `design.json`, defaulting to 1.**

⛔⛔ **THE DEFAULT OF 1 IS THE POINT, NOT A DETAIL: LS's 1.5 becomes LS's AUTHORED DATA.** The kit
default is the neutral value. ⚠️ **This CHANGES LS's Hero terrain unless LS authors 1.5** — intended,
and it must be **a declared line in the commit**, not a surprise at the eye gate.

⭐ **Easier than first scoped** (see `§0`): terrain is already per-look. `BakedGround` already reads
`useSceneJson`, so `scene?.terrainExag ?? 1` is the React path; `makeElevationSampler(terrain)` is
already built per-terrain, so taking the exag as a parameter is the clean shape. ⚠️ **Enumerate its
callers before changing the signature** — `V_EXAG` is imported by ~12 runtime files **plus the bake**
(`bake-ground.js` reads the same SSoT), and `cartograph/BACKLOG.md:204` notes a hardcoded `1.5` still
sitting in `bake-ground.js`. **Bake and runtime must move together or the slab and the shader
disagree.**

### 3.3 ⭐⭐ Site 16 — and why the checker missed it. THIS IS THE REAL PRIZE.

`checks/claims-writers-name-the-scene.mjs` is excellent and it **passes** — 23 runnable writers
guarded, every exemption declared in its own source. **It is scoped to `cartograph/`.**

`arborist/bake-trees.js` writes `public/baked/<scene>/trees.json`, defaults its scene to LS, and calls
no guard. It is **outside the check's walls**, so the guard's green light is scoped narrower than the
sentence a reader takes from it.

⭐ **Per Layer 0 the fix is not the one edit — it is widening the detector.** Extend the check to
every writer in the repo (`arborist/`, `meteorologist/`, `scripts/`), or make its scope **loud** in
its own output. ⛔ A check that prints PASS while a bake-over-LS path sits one directory away is the
`POLYGON-FIRST §2.1` failure repeating: **a fallback inside the instrument.**

---

## 4. ⭐⭐ THE DELIVERABLE IS THE CHECK — this is the part that reaches town #2

Nine edits help nobody if the tenth bleed can still be written. Per `CLAUDE.md` **Layer 0**, the fix
is the **detector**; per the prune rule, a fact that can be checked by running something is a check,
not prose.

1. ✅ **DONE `8e90eeb7` — `claims-writers-name-the-scene.mjs` is repo-wide.** Roster discovered from
   `git ls-files`; domain decided by a scene-path predicate whose signals are parsed out of
   `scene.js`; the out-of-domain set is PRINTED with reasons; `scratch/`+`checks/` reported, never
   gating. ⭐ It immediately found two bleeds nobody had read (18, 19) — the class working as
   intended. ⚠️ Known limits, stated in its own footer: tracked files only, and the out-set is a
   source-text judgement, not a proof.
2. **`checks/claims-no-static-shared-data-imports.mjs`** — **PARSE** the source for static
   `import … from '…/data/<shared>.json'`; ⛔ never a hard-coded list of files, or it goes stale the
   day someone adds the next one. Derive the shared set by reading what sits at `src/data/*.json`
   versus `src/data/<look>/`. Exit 2 on any hit, naming file, line, and the per-scene path it should
   use. ⚠️ **Today all 7 remaining imports are scene-gated** (`§0`), so this check guards **coupling
   and bundle weight**, not an open bleed. ⛔ Do not sell it as bleed closure — that claim has been
   measured false twice.
3. **The Class-A regression:** stub a scene with no lamp data, no census, no species map, no instance
   file, no boundary; assert **nothing of LS appears in its outputs.** (The boundary case is B2b.)
4. **The Class-C regression:** run every write entry point with the scene omitted; assert it **fails**
   — and specifically that a bake cannot touch `lafayette-square` unless LS was named explicitly.
5. ⭐ **Mutation-test each one.** A passing check proves nothing until it has been seen to FAIL
   (`project_the_check_is_the_deliverable_mutation_test_it`). **Pin the runtime rule it models** and
   refuse to report green if that rule has moved.

## 5. Deliver

1. **Sites 6 · 15 · 16 · B2b** excised per `§2`. Independent — **land separately, smallest first**
   (16 is smallest; 6 is largest).
3. **Site 8** — instance-derive the prose. ⚠️ This is `ROADMAP C1` Phase 4
   (`_handoffs/HANDOFF-blank-app-instance-decoupling.md`), **not intake** — coordinate, don't duplicate.
4. **Site 12** — ⛔ blocked on the client. Sequence with `api.js sceneUrl()`.
5. **`§4`'s checks**, failing before and passing after.
6. A short writeup: what landed, what deferred and why, and whether any *new* bleed surfaced.

## 6. Rules

- ⛔ **Confirm alignment with Jacob before writing code** (`CLAUDE.md §Standup before code`).
- ⛔ **A PREMISE IN THIS FILE IS A CLAIM, NOT A FACT.** Two were false and one would have deleted a
  live render component (`§0`). **Read the branch, not the string** — a path naming LS is not a
  bleed; a **fallback** to LS is.
- ⛔ **HPDM is the test surface, not LS** (Jacob, 2026-07-22): *"I can't abide HPDM getting off on the
  wrong foot since it's the only actual commercially requested map."* LS is production
  `lafayette-square.com`, conformed **last**, ⛔ never the night before a demo.
- ⛔ **The eye-gate is the operator's, on a non-LS scene.** A proxy render does not settle it.
- ⛔ **A dead bleed is DELETED, not gated** (`feedback_dead_code_gets_excised_not_archived`). Every doc
  that DESCRIBES a bleed you kill loses the description **in the same commit** — not a banner beside
  it. Superseded text → `cartograph/_archive/`, dated, refs repointed in the same breath.
- Everything inside the project folder. ⛔ **Do not start a dev server** — one is running.
- ⚠️ **Do not `git restore public/baked/**`** — the working tree is more correct than `origin/main`.
- **Name yourself in the writeup.**

## 7. ⛔ NOT IN SCOPE

- **The repo/folder rename** (`dev.nosync/the-ward/`). Separate job, different risk profile, no
  standup and no ruling. Its only real coupling is the `lafayette-square-staging` external repo + its
  `--base=` in `.github/workflows/staging.yml`. ⛔ Do not fold it in.
- **`blockCustoms` / `design.json` / per-scene authoring behaviour** — except site 15, which Jacob
  ruled *into* `design.json` deliberately. This is otherwise a **storage** change: if the map moves,
  you changed something you were not asked to change — **stop and say so.**

**Tracked in `ROADMAP` as A00, and as `EXTENT-DESIGN §6` step 4.**
