# HANDOFF / BRIEF — Universal Reader (instance + content decoupling)

> **Status: CONSUMER-FACE LANDED on trunk (2026-07-05, Klein).** Phase 1 (INSTANCE config) + **Phase 2 (content seam `loadInstanceData` + A/B/C consumer fan-out)** + **instance-boot** (per-look INSTANCE by `?look=`, `src/instances/<look>.js` registry) + **§5.1.2 asset-root** (`INSTANCE.contentRoot` + a vite dev middleware) are all landed. **`?look=hipointe-demun` boots installation #2 LIVE** (map + content + profile + 8 logos through LS's exact path; LS byte-identical). **Phase 3 ✅ LANDED (2026-07-06, Boz)** — module-manifest mount-gating: `moduleOn(name)` in `src/instance.js`; `App.jsx` / `Scene.jsx` (CourierDots) / `SidePanel.jsx` (TABS) gate on `INSTANCE.modules.*`. HPDM `delivery:false` retires the whole Cary surface (`/cary` route + `CourierDashboard` + `CourierDots`); LS all-on → byte-identical (node-assertion verified, `vite build` green). Fact folded to `ls/ARCHITECTURE.md §2/§6` + `ORIENTATION`/`SLAB-CONTRACT`. `residences` deferred (isResidential-woven through PlaceCard, not a discrete mount). ▶ **STILL OPEN:** **Phase 4** — `branding.copy` bundle (InfoModal mission-prose + Legal prose) + build-time `index.html` inject. **Deferred-to-producer** (own arc, roster/render): the LS-guarded render geometry — `buildingOverrides` · `ribbons`/`streetLabels` · park geometry · `street_lamps`/`lampLightmap` — each needs a real ready-gate, not a path flip. **Deep residuals:** STL zoning taxonomy (HPDM neon color) · `lsq-*` localStorage namespace collision · ~~prod asset serving~~ ✅ **DONE (2026-07-06, Boz)** — `mirrorInstallationContent` build plugin (`vite.config.js`, `apply:'build'`) mirrors `cartograph/data/<look>/content/` → `dist/content/<look>/` on every build (staging + prod); the static-serve counterpart to the dev middleware. HPDM media verified served at the staging base via `vite preview`. · **prod-Publish per-scene guard** (disable prod-promote for non-LS looks + parameterize `STAGING_BRANCH`/`PROD_BRANCH`/pathspecs by scene — decided 2026-07-06, `PUBLISH.md §0.5`; guard not yet wired). *(The `## Phase 2 dispatch` section below is retained as the as-built record of how the seam/fan-out was scoped.)* The two-faces frame: `plans/front-front-end-and-productization.md §The two faces`; content schema `NEIGHBORHOOD-INPUTS §5.1.1`.

## The goal
The public app is a **generic reader** of an installation payload; LS is just installation #1 (`?look=lafayette-square`). **"Lafayette Square" is the Product name; the LS neighborhood is installation #1, eponymous** — this is **de-installation-hardwiring, not de-branding.** Each installation supplies its own identity/branding/content/modules.

## ⛔ The gates (non-negotiable, prove at each cut)
1. **LS renders + reads byte-identical** — every LS value, once sourced from config/content, must equal today's literal. Additive before destructive.
2. **The townie app keeps working for LS** — place cards, listings, residences, search, bulletin, delivery all still function.
3. **The acceptance gate (Jacob, 2026-07-05):** the reader is universal — **grep the reader for *installation-specific* literals → zero.**

> ⭐ **Product-level constant vs installation-specific (Jacob, 2026-07-05).** The gate targets *installation-specific* literals only. **Product-level constants legitimately stay literal** — they're fixed across every installation. Two settled examples: **"Lafayette Square"** as the *Product* name (the neighborhood name that varies is a different thing); **"Cary"** = the delivery program's name/structure, a Product constant. Neighborhoods vary their *participants* (SMS number, couriers, **zone**) — **not** the program's name. So: **no INSTANCE field for the "Cary" name**; `modules.delivery.enabled` gates *presence* only, and per-installation participant data (`INSTANCE.cary.sms*`, `modules.delivery.zoneDescription`) carries the variation. In copy like "Cary at Lafayette Square" / "Cary is Lafayette Square's delivery service", **"Cary" stays literal; only the neighborhood name → `INSTANCE.name`.**

## The target list (audit, 2026-07-05 — reader scope: `App.jsx`, `components/`, `hooks/`, `lib/`, `pages/`, `preview/`, `index.html`)

**Already solved — `src/instance.js` carries** `lookId · skyMode · geography{lat,lon,tz,proj,bbox} · name · domain · cary{sms,email} · contact · mobileQuality`, cleanly read at ~40 geography/weather/planetarium/slab call sites. **Don't re-list those.** But some call sites still hardcode values INSTANCE already owns — those are offenders below.

**Bucket 1 — IDENTITY** (8): `CourierDots.jsx:22-23` idle lat/lon (offender → `INSTANCE.geography`) · `LafayettePark.jsx:9` hardcoded `cartograph/data/lafayette-square/…` import path · `LafayettePark.jsx:828` `EST. 1851 · ST. LOUIS, MO` · `LegalPage.jsx:124` city/state · `LegalPage/CourierOnboarding` "State of Missouri" governing law · `CourierOnboarding.jsx:189` `'MO'` · `PlaceCard.jsx:2951` `STL_TAX_RATE=0.08725` · `streetLabels.js:30` boundary-corridor names.

**Bucket 2 — BRANDING** (~18 literals + ~25 prose refs): `index.html:5,10,13,14,16,18,19` title/OG/favicon/domain (build-time inject — HTML can't read JS) · offenders reading a literal instead of existing `INSTANCE.name`/`.domain`: `App.jsx:553`, `Scene.jsx:749`, `ChatModal.jsx:182`, `PreviewApp.jsx:338`, `PlaceCard.jsx:2330,4187` (vanity domain ×2), `BulletinModal.jsx:1177`, `CourierDashboard.jsx:276,347`, `CaryAuth.jsx:82` · legal entity `Jacob Henderson LLC / DBA Lafayette Square Deliveries` (`LegalPage.jsx:123`, `CourierOnboarding.jsx:587`) · `LafayettePark.jsx:65` `lafayette-square.svg` asset name · **prose-copy density: `LegalPage.jsx`, `InfoModal.jsx:157-229`, `CheckinPage.jsx`** → a `branding.copy` bundle, not token swaps.

**Bucket 3 — CONTENT literal** (8): `SidePanel.jsx:750` `'2,164'` residents → `profile.population` · `InfoModal.jsx:170` "roughly 2,000 residents" + `:163` "~1,000 buildings" · `LafayettePark.jsx:811,828` `LAFAYETTE PARK`/`EST. 1851` → `profile.landmarkName`/`.founded` · `useListings.js:83` historic-district blurb → `profile.historicDistrictName` · `LegalPage.jsx:24` delivery-zone description → `modules.delivery.zoneDescription`.

**Bucket 4 — MODULE assumption** (11, all hard-mounted at `App.jsx:584-604`, no gate): bulletin · delivery(Cary) · contact · codedesk · sms · chat · info · events · society tab (`SidePanel.jsx:812`) · residences (`PlaceCard.jsx:2497`) · checkin/claim/link routes → `INSTANCE.modules.*`.

**Bucket 5 — ENDPOINT/SECRET** (6, already env-injected — inventory only): `VITE_API_URL`, `VITE_SUPABASE_*`; open-meteo + jsdelivr are universal (clean).

**⚠️ Surprises (deep/non-obvious coupling — own phases):**
- **St. Louis ZONING taxonomy as the categorization engine** — `useListings.js:16,42-45` (`ZONING_CAT/SUB/LABELS`) + `SceneNeon.jsx:51-63` (`_NEON_ZONING_CATEGORY`): the A–J single-letter STL zoning table drives **listing categorization AND neon color**. Not a string — a whole classification assumption. Deepest coupling.
- **`lsq-*` localStorage namespace** (`index.html:22`, `App.jsx:70,179,261`, `ChatModal`, `CodeDeskModal`, `PlaceCard:2323`) — two installations on one origin collide; derive prefix from `INSTANCE.lookId`.
- **`FLEUR_BG='#0055A4'` St. Louis-flag blue** + fleur-de-lis rating motif (`PlaceCard.jsx:147`) — cultural theming; structurally a color+emoji.
- **Reader → `src/data/` static imports** (the content-sidecar migration list, ~13): `LafayetteScene.jsx:5,85`, `SceneNeon.jsx:25`, `Controls.jsx:5`, `GlassSearch.jsx:7`, `SidePanel.jsx:10-11`, `useListings.js:3-5`, `useInit.js:9-10`, `useEvents.js:2`, `streetLabels.js:27`, `StreetLights.jsx:7`, `LafayettePark.jsx:7-19`, `PlaceCard.jsx:24`. Must load by `INSTANCE.lookId`, not `import`. **Exception (leave):** `CelestialBodies`/`PlanetariumOverlay` import universal astronomy data, not LS.

## INSTANCE schema — the target (extend `src/instance.js`)
```
INSTANCE = {
  lookId, skyMode,
  geography: { …present…, cityState:'St. Louis, MO', stateCode:'MO' },      // +2
  branding:  { name, title, domain, faviconUrl, ogImage, assetSlug,
               copy:{ about, guidelines, … } },                             // NEW (name/domain promote)
  legal:     { entityName, dba, governingState },                           // NEW
  commerce:  { salesTaxRate },                                              // NEW
  profile:   { population, buildingCount, founded, parkAcres,
               landmarkName, historicDistrictName },                        // NEW (= content L0)
  modules:   { bulletin, delivery:{enabled,zoneDescription},  // "Cary" name is a PRODUCT constant, NOT a field
               contact, codedesk, sms, chat, info, events, society, residences }, // NEW
  cary, contact, mobileQuality,                                            // present
}
```
Note: `profile.*` overlaps content **Layer 0** (`§5.1.1`) — decide whether it rides INSTANCE or a `content/profile.json` the loader merges (small; INSTANCE is fine for v1).

## Phasing (additive before destructive, each phase proves the gates)
- **Phase 1 — INSTANCE + literal migration (identity + branding offenders). ✅ LANDED 2026-07-05 (`207374bd`).** Extended `instance.js` (geography.cityState/stateCode · branding · legal · commerce · profile[=L0] · modules stub); migrated 12 reader files' identity/branding offenders to read INSTANCE. "Cary" kept literal (Product constant). **Gates verified:** `vite build` green + node assertion = every migrated value byte-identical to its former literal. Deferred (flagged in-code): CourierDots idle privacy-point coordinate; the Legal/Info/CourierOnboarding legal-copy → Phase 4.
- **Phase 2 — content sidecar. ⭐ DISPATCH-READY (2026-07-05) — see `## Phase 2 dispatch` below.** The ~13 reader→`src/data/` static imports load by `INSTANCE.lookId` from the installation payload (LS mirrors byte-identical). The producer-side schema (`§5.1.1`) is the shape.
- **Phase 3 — module manifest.** `INSTANCE.modules.*` gates the `App.jsx:584-604` mounts (LS = all-on). Design the seam; delivery/backends stay single-tenant for now.
- **Phase 4 — branding copy + `index.html` templating.** The `branding.copy` bundle for Legal/Info prose; a build-time inject step for `index.html` title/OG (it can't read the JS module).
- **Deep residuals (own arcs):** the STL zoning taxonomy → config; `lsq-*` localStorage prefix; the fleur/flag theming.

## Phase 2 dispatch (READY, 2026-07-05)

**Continuation** of the Phase 1 agent (`207374bd`) — via `SendMessage` if warm (keeps its INSTANCE context), else a fresh worktree agent reading this HANDOFF → `§5.1.1` → this section. Worktree isolation; **don't edit canon** (flag drift, Boz folds).

**Goal (one line):** every reader `import … from '../data/X'` for LS-specific data becomes a **load-by-`INSTANCE.lookId`** from the installation payload; LS (`?look=lafayette-square`) resolves byte-identical. After this phase the generic reader holds **zero static imports of installation-specific data**.

### ⛔ Decide the loader seam FIRST — standup before mass-migration
13 sites is 13× the cost if the seam is wrong. Before touching any consumer, inspect how the **slab is already fetched by `INSTANCE.lookId`** (the ~40 Phase-1 call sites) and **mirror that path** — do not invent a second hydration route (`project_kit_deploy_path_agnostic`: fetch via BASE_URL; `feedback_dual_hydration_paths_drift`). Propose the mechanism (one `loadInstanceData(lookId, name)` helper vs. per-file dynamic `import()`), align with Jacob, **then** migrate. This is the phase's one real architecture decision.

> **✅ RESOLVED (Jacob, 2026-07-05) — Option 1: generalize `buildings.js`, behind a swappable contract.** The seam's deliverable is the **contract `loadInstanceData(lookId, name) → { value, ready }`, not its guts.** The expensive, irreversible work (the async `ready.then(...)` refactor of the 5 module-scope consumers — LafayettePark/SidePanel/useListings/useInit/LafayetteScene) is **identical for `import()` (Opt 1) and `fetch()` (Opt 3)**; consumers bind to `{value, ready}`, blind to the internals. So reuse `buildings.js`'s **proven, documented** async lazy-loader (dynamic `import()` + ready promise + mutable exports; its 6 consumers already handle async) — lowest risk, fastest green — and refold `buildings.js` as `loadInstanceData`'s **first caller**, not a parallel bespoke loader. Swapping the guts to the slab's `fetch()` later (Opt 3, the served-payload destination) is then a **loader-internal change, invisible to all 13** — and that served-payload/no-rebuild property is this arc's explicit out-of-scope horizon (line 109), so don't pre-build it; the contract preserves it for free. **Rejected: Opt 2 (eager `import.meta.glob`)** — bundles every installation into LS's main bundle, dies at HPDM (installation #2), maximizes rework.

### The target list (13 sites, verified 2026-07-05)
| File | Import |
|---|---|
| `LafayetteScene.jsx:5,85` | `buildings`, `buildingOverrides.json` |
| `SceneNeon.jsx:25` | `buildings` |
| `Controls.jsx:5` | `buildings` |
| `GlassSearch.jsx:7` | `buildings` |
| `SidePanel.jsx:10,11` | `buildings`, `streets.json` |
| `useListings.js:3,4,5` | `landmarks.json`, `menus.json`, `buildings` |
| `useInit.js:9,10` | `landmarks.json`, `menus.json` |
| `useEvents.js:2` | `seedEvents.json` |
| `streetLabels.js:27` | `ribbons.json` |
| `StreetLights.jsx:7` | `street_lamps.json` |
| `LafayettePark.jsx:7,8,19` + `:9` | `park_water.json`, `ribbons.json`, `park-feature-elev.json` + hardcoded `cartograph/data/lafayette-square/…/park-polygon.json` |
| `PlaceCard.jsx:24` | `facade_mapping.json` |

**Exception — leave:** `CelestialBodies`/`PlanetariumOverlay` (universal astronomy, not LS).

### Carried decisions & guardrails (do NOT re-open)
- **`LafayettePark.jsx:9`** is the Bucket-1 identity offender (hardcoded `cartograph/data/lafayette-square/` path). Folding it into the lookId loader **closes that offender too** — do it here, not separately.
- **`profile.*` stays on INSTANCE for v1** (line 51). This phase is *data imports only* — do **not** move profile into `content/profile.json`; that churns Phase 1.
- **STL zoning taxonomy — LEAVE UNTOUCHED.** It lives in `useListings.js:16,42-45` and `SceneNeon.jsx:51-63`, right beside content imports you're editing → highest scope-creep risk. Its own deep-residual arc (line 58). Touch only the listed `import` lines in those files.
- **Render vs content — don't re-litigate the slab boundary.** Some targets are render geometry (`ribbons`, `park-polygon`, `street_lamps`, `park_water`), others content (`landmarks`, `menus`, `buildingOverrides`, `seedEvents`). Phase 2 is a **path de-hardcode, not a semantic split** — move the import to load-by-look without changing what flows or where the boundary sits (`slab-render-vs-content-boundary`). If a file genuinely straddles and can't move cleanly (`buildings.json` mixes baked geometry + content fields — §5.1 line 145), **surface it, don't guess** (`feedback_baby_must_surface_scope_drift`).

### ⛔ Gates (prove at each cut, additive before destructive)
1. **LS renders + reads byte-identical** — the look-keyed load returns the same object the static import did; prove with a node assertion (Phase-1 technique).
2. **Townie app keeps working** — place cards, listings, residences, search, bulletin, park all function in the **lit app**, verified by eye, not a proxy render (`feedback_proxy_render_is_not_the_operator_eye`).
3. **`vite build` green.**
4. **Phase gate:** grep the reader for static `from '../data/…'` on the 13 files → **zero**, save **two documented exceptions of distinct kinds** (see below): `CelestialBodies`/`PlanetariumOverlay` (*universal* — astronomy, permanently clean) and `buildingOverrides` (*deferred-to-producer* — installation-specific render data, generic-loading owed by the roster/render arc). Don't conflate the two: the first never moves; the second is deferred-with-an-owner and must not read as permanently-fine.

### ⚠️ Ownership-split finding (pre-move importer sweep, 2026-07-05) — the seam moves, the files mostly don't
The "relocate the 13 into `src/data/lafayette-square/`" directive assumed they were reader-owned data. **They're not: 10 of 12 are the producer's working source** the reader happens to `import` directly. Importer sweep:

| Camp | Files | Non-reader importers |
|---|---|---|
| **Reader-private ✓** | `menus.json`, `seedEvents.json` | none — safe to relocate now |
| **Shared w/ authoring + pipeline ⚠️** | `buildings`, `buildingOverrides`, `streets`, `landmarks`, `ribbons`, `street_lamps`, `park_water`, `park-feature-elev`, `facade_mapping`, `park-polygon` | `src/cartograph/*` (MapLayers, useCartographStore, SurveyorPanel, measureModel…), render libs (`parkPaths`, `buildBlockGeometryV2`, `mergeLiveRibbons…`), runtime components (InstancedTrees, SlabBuildings, lampLightmap), bake pipeline (`cartograph/*.js`, `scripts/*`). `ribbons.json` ~15 importers; `buildings.json` ~20. |

A flat `git mv` breaks the authoring app + bake pipeline, and repointing those importers **crosses the render/producer stream this handoff fences off** (line 107). This is the **two-faces boundary running through `src/data/`**: reader-face reads a payload; producer-face emits it. The direct `import` *is* the coupling Phase 2 severs — **on the reader side only.**

**Decision (Jacob, 2026-07-05) — split relocation by ownership; the seam contract is identical across all 13:**
- **Move now** (⟺ **zero** non-reader importers): `menus.json`, `seedEvents.json` → `src/data/lafayette-square/`. Prove the seam + `buildings.js` refold against these.
- **In-place, by-lookId** (any outside importer — incl. `landmarks`, whose authoring-panel + scripts touch keeps it here, and `buildings` at 20+ importers): loaded through the same `loadInstanceData(lookId, name)` contract; **files stay put.** The reader is lookId-generic today regardless of physical home.
- **Manifest keeps "deferred" from rotting:** `loadInstanceData` carries a **per-lookId path map**. LS entries for in-place files point at `src/data/X.json` today, marked `// in-place, pending producer emit`. The producer-emit arc flips them to the payload path in **one file** — no consumer, no seam change.

**→ Hand-off to the producer/render (roster) arc:** physical relocation of the in-place set (`landmarks` + `buildings` + the 9 render-geometry files) into the per-look emitted payload is **producer-stream work** — one coherent move + one repoint pass across `cartograph/*` + `scripts/*`, owned by the arc that can e2e the bake. The reader seam is already lookId-generic; this arc only flips the manifest paths when the emit lands. End-state extends "the slab is the contract" (`slab-render-vs-content-boundary`) to content: producer emits a per-look content payload; reader reads only that; the direct `src/data/*` import disappears.

### ⚠️ `buildingOverrides` — the 10th render file, a *stronger* exception (Jacob, 2026-07-05)
The other in-place render files load **by-lookId via the manifest** — lookId-generic in the reader today, only the physical file deferred. **`buildingOverrides` is different: it stays a *static LS import* in this phase** (hence the grep-gate exception above), because it feeds the **synchronous** Foundations geometry `useMemo` (`getFoundationHeight → periodPedestalFor(b, _overrides)`) and `<Foundations>` has **no existing ready-gate** to hang an async load on — LafayetteScene never imports buildings' `ready`; the building list appears via incidental re-render. Flipping it async would need either a fragile 234 B-beats-1.26 MB size race (rejected) or a **new ready-gate in the scene** (changes first-paint timing in the most complex component). That gate restructuring belongs to the producer/render arc, which owns the geometry pipeline and can e2e the bake.

- **Reader-phase decision:** leave it a static import; document it as the *deferred-to-producer* grep-gate exception (distinct from the universal astronomy one).
- **⛔ HPDM-safety check (must clear before Batch A closes):** with a static LS import, `?look=hipointe-demun` still applies **LS's** overrides. Confirm they no-op under a non-LS look (`periodPedestalFor` keys on LS-specific building ids → HPDM ids miss → no pedestal). If accidental id-collision misapply is possible, add a one-line **application guard** (`apply overrides only when lookId === 'lafayette-square'`) — cheap, doesn't touch the Foundations gate, makes leaving-it-static correct for installation #2 rather than a latent render bug.
- **→ Producer-arc work is path-flip *plus* a ready-gate**, not the trivial manifest-path-flip the other render files get: relocate to the emitted payload **and** install a proper Foundations/buildings ready-gate so overrides load by-lookId without the race. Flag so the roster arc doesn't treat it as a bare 10th entry.

### Commit boundaries
- One commit for the **loader seam** (the `loadInstanceData` contract + per-lookId manifest + `buildings.js` refold as first caller; LS pointed at it in-place).
- Then consumers in **coherent batches** (buildings-consumers, then landmarks, then the geometry files) — each batch its own commit, each proving gate 1. Additive first (load alongside), flip, then delete the static import.
- Physical relocation of `menus`/`seedEvents` rides the batch that migrates their consumers; the in-place set's physical move is **deferred to the producer-emit arc** (above), not this phase.

### The demun researcher
**Stays on standby.** HPDM `content/roster.json` + `listings.json` (§5.1.1, ids matched 2089/2089) only become *loadable* once this seam lands. When Phase 2 is green, the researcher's payload dropped at `?look=hipointe-demun` is the **live proof the reader is generic** — installation #2 through the exact path LS uses. Don't dispatch them until the seam is in.

## Boundaries & doctrine
- **Render/geometry hardwires belong to the roster arc** (done: `bake-buildings.js` render ledger) — don't cross streams.
- Worktree isolation; canon docs are **Boz's** (flag drift, don't edit canon). This HANDOFF + `NEIGHBORHOOD-INPUTS §5.1.1` + `plans/front-front-end… §The two faces` are the agent's first reads.
- Reader distribution to 3rd-party sites (cross-origin slab, injected config, backend multi-tenancy) is **out of scope** — the horizon beyond this arc.
