# BRIEF — excise the LS-bleed: absence must degrade to NOTHING, never to Lafayette Square

**Agent: FRESH.** — this is a mechanical excision across four domains against a verified site list; there is no prior session-context worth inheriting. ⚠️ **Serialize against `BRIEF-intake-manifest.md`** where they touch the same bake scripts, and **do not dispatch into a worktree** until `cartograph/BACKLOG.md §NEXT`'s stale-worktree cleanup lands (25 stale trees; a 2026-07-20 dispatch silently landed on a months-old branch and did nothing).

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon for whichever domain you're in. The findings behind this brief are `INTAKE-CATALOGUE.md §0`; read it before touching anything.

---

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
