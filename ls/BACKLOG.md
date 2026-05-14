# Lafayette Square — Backlog

The path from where we are (branch `cartograph-looks-pass-ab`) to where we're going (clean LS app deployed on the cartograph slab at `lafayette-square.com`).

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; check off completions during work; prune toward pristine. The cartograph trinity under `cartograph/` covers authoring; this is the consumer side.

Last updated: 2026-05-14 (Phase C foundation poured — **Slab Completeness sweep complete (7/7 shipped, SC.4 audited empty)**, **Couplers §6 INSTANCE shipped**, **Neon authoring controls shipped** (operator-tunable tube physics + Force-On QA toggle; defaults flipped to flat-on 1/1/1), **terrain pipeline fully integrated** (b24fce5 clip-to-stencil bake + 2026-05-14 consumer-parity + V_EXAG=1.5 tuning sweep — see cartograph/BACKLOG.md). Remaining pre-merge: **Cleanout plan**, **RUNTIME-DELTA §3 staging walk** (hard merge gate). Post-merge concurrent tracks queued: visual quality pass (MSAA in EffectComposer, production log-depth, DPR/anisotropy, post-FX tuning), bake-button UX refactor (Stage ↻ → "Preview" button per project_preview_equals_ls_literally), per-Look elevationExag channel (V_EXAG hardwire), Meteorologist v3 spade work (see cartograph/BACKLOG.md "Meteorologist plan"). See `cartograph/BACKLOG.md` "Slab completeness" for per-channel state.)

---

## Session-end pin (read first)

**The end state is one thing: LS app running stably on the cartograph slab at `lafayette-square.com`.** Mobile-stable, error-free, secure, beautiful, lightweight. Cartograph polish continues on its own track (`cartograph/BACKLOG.md`); we don't wait for it.

**The product doctrine** (see `feedback_beautiful_first_lightweight_51` memory): beautiful + stable are co-equal; stability wins forced tradeoffs 51/49; **never resolve a tradeoff by making the product look cheaper.** The fix to "we can't do both" is always to be more clever.

**Main is fully pre-slab.** Production today renders via `VectorStreets` + `StreetRibbons` (live) — no `public/baked/`, no `BakedGround.jsx`. The branch ships a complete rendering-architecture switchover, not an incremental migration. That's why this is a three-phase operation, not a flat punchlist.

**Three named operations** stand between here and merge-to-main:

### Phase A — Diagnostic ✅
Shipped 2026-05-13: [`reference/RUNTIME-DELTA.md`](reference/RUNTIME-DELTA.md). Three sub-catalogs: architecture diffs (old VectorStreets/StreetRibbons path vs. new slab path), what ships now that didn't (authoring surfaces + store seam + bundle deltas + asset volume, with keep/strip/gate/parametrize verdicts), and what stops working or changes for users (consumer-surface walk). Carry-overs RD.1–RD.10 feed Phase B + Phase C.

### Phase B — Plan ✅
Three canonical plans, all shipped 2026-05-13:

- [`plans/kit_couplers_parametrize.md`](../plans/kit_couplers_parametrize.md) — six kit↔instance couplers (Cartograph slab, Arborist trees, Meteorologist clouds, Courier/Cary, Listings/GAS, Place/identity). `src/instance.js` introduced; `useSceneJson` slab-side data hook replaces `useCartographStore` reach from runtime; `scene.json.bakedAt` amendment to SLAB-CONTRACT §4. CC.1–CC.8 cross-cutting rules; CC.8 codifies the BASE_URL invariant.
- [`plans/pre_public_cleanout.md`](../plans/pre_public_cleanout.md) — resolves every strip + gate verdict from RUNTIME-DELTA §2. Mode-conditional `rollupOptions.input` drops authoring HTML in prod; source trees stay (CC.8 "kit stays; production excludes"); `copyPublicDir: false` + whitelist plugin; two verified-orphan file deletions (`public/data/landmarks.json`, `public/cartograph-ground.svg`); CARY-BRIEF relocated not archived; five-place deployment-ID audit script + grep gate wired into `deploy.yml` as the only production-workflow modifications.
- [`plans/ls_basemap_swap.md`](../plans/ls_basemap_swap.md) — sequences the merge. Six phases: couplers exec → cleanout exec → pre-merge verification on staging → `git merge --no-ff` → post-merge stability watch → concurrent tracks resume. Nine CC rules; rollback command verbatim (`git push --force-with-lease origin v1-pre-cartograph-merge:main`).

### Phase C — Execute
Phase C is the entire marriage leap operation, sequenced by `plans/ls_basemap_swap.md`. Each commit lands on the branch, auto-deploys to the staging URL via `.github/workflows/staging.yml`, gets verified there before the next commit. Phase 3's exhaustive RUNTIME-DELTA §3 walk on real cellular is the hard gate before merge to `main`.

**Staging URL:** [`https://jacobeugenehenderson.github.io/lafayette-square-staging/`](https://jacobeugenehenderson.github.io/lafayette-square-staging/) — slab renders end-to-end as of `a1ebe1b`.

**Phase C — work in flight (2026-05-13 night):**

- ✅ Couplers plan CC.7 — `scene.json.bakedAt` field emitted by `cartograph/bake-scene.js`; SLAB-CONTRACT §4 amended (commit `c0406e6`).
- ✅ Couplers plan §1 — `src/lib/useSceneJson.js` landed (the "minimal slab-side data hook" the plan specified) (commit `24efb58`).
- ✅ Couplers plan §3 (Meteorologist) — partial: bake-scene emits `neon` from design.json. Cloud-artifacts strip stays queued for cleanout exec.
- ✅ Neon Path B swap (production-side first consumer of `useSceneJson`) — `LafayetteScene` retired inline `NeonBand`, mounted `<NeonBands>` (commit `20ef7b1`). Y-fix shipped (`a0a109a`).
- ✅ Couplers plan §1 remaining migrations — BakedGround / BakedLamps / LafayettePark / LafayetteScene / InstancedTrees / StreetLights (transitive leak) shipped (commit `bad6b72`). Cartograph store contained to cartograph chunk only; production bundles structurally clean.
- ✅ **Slab completeness SC.1–SC.7 — complete, 7/7 shipped, SC.4 audited empty.** SC.1 (sky/lighting/celestial, `c333e50`). SC.2 + SC.3 (post-FX + exposure + grade + grain + shadow + envState retirement, `015d8e0`). SC.5 (per-shot camera + Hero motion + Browse heading, `e8ba8d6`). SC.7 (arch + horizon + archState retirement + GatewayArch consolidation, `a3952fe`). SC.6 (Meteorologist coupler scaffolding — `scene.clouds` + almanac evaluator; CloudDome stays as v1 runtime, `4176340`). Cumulative through the sweep: 4 forked consumers retired (StageSky, StageApp PostProcessing/StageFog/StageShadows, StageArch), 3 module-scope authoring bridges retired (skyState, envState, archState), 27 authored channels now ship through the slab.
- ✅ **Neon authoring controls + defaults flip** (`fba7047` + `d483151`). Tube physics (radius/roofLift/emissive) promoted from the 6aef522 hardwires to the operator-tunable `neonTube` channel. Stage Sky & Light gains three sliders + a Stage-only "Force Neon On (test)" toggle (session-only, doesn't bake). NEON_FLAT_DEFAULTS flipped to `{core:1, tube:1, bleed:1}` so unauthored Looks ship lit (both shipped Looks already authored 1/1/1; visibility is gated by `openPlaces` business-hours filter, not the intensity envelope).
- ✅ Three diagnostic commits audited (`c6eea07`, `9906b58`, `33dcbf0`): `33dcbf0` was already reverted by `6aef522`; `c6eea07` ([neon-diag] in LafayetteScene) and `9906b58` ([neon-pump] in NeonBands + `window.__neon` global) were live and reverted in `fba7047`. All shader/runtime diagnostics stripped.
- ✅ Couplers plan §6 `INSTANCE` module — `src/instance.js` introduced (lookId / geography{lat,lon,timezone} / name / domain / cary{smsNumber, smsNumberDisplay, email} / contact{email}). Retired:
  - lat/lon hardcodes (38.6160, -90.2161) across 14 runtime files (CelestialBodies, GatewayArch, DawnTimeline, PlanetariumOverlay, SidePanel, useTimeOfDay, useWeather, useUserLocation, CourierDots, App, lib/dawnTimeline, cartograph/{AerialTiles, animatedParam, SkyGradientGrid}). useWeather's open-meteo URL is now a template reading INSTANCE.geography.{lat,lon,timezone}. CelestialBodies' LATITUDE/LONGITUDE exports retired; GatewayArch's importer flipped.
  - lookId="lafayette-square" hardcodes at Scene.jsx (CameraRig useSceneJson + BakedGround mount), LafayetteScene NeonBands mount, and the resolveLookId URL-fallback default across 10 consumer files (BakedGround, BakedLamps, InstancedTrees, CelestialBodies, LafayettePark, LafayetteScene, GatewayArch, PostProcessing, StreetLights, preview/BakedBuildings, preview/PreviewApp).
  - Cary SMS number (+18773351917) at PlaceCard (3 sites) + LegalPage (2 sites). LegalPage email/phone also flipped to INSTANCE.{contact.email, cary.{email, smsNumberDisplay}}.
  - **Out of scope (flagged):** UI flavor copy that uses "Lafayette Square" as crafted text (BulletinModal, InfoModal, CourierDashboard, PlaceCard SMS bodies, LegalPage legal-text, Scene.jsx aria-label, App.jsx splash alt) — templatization is future kit-readiness work when a second instance appears. Cartograph multi-scene scene-id routing (`SCENE_REGISTRY['lafayette-square']`, `DEFAULT_LOOK_ID` in cartograph store + Toolbar, `scene === 'lafayette-square'` comparisons in CartographApp) — left literal per "don't pull instance.js into cartograph-only logic that already handles its own per-look state." Toy fixture's `lookId="lafayette-square"` (`src/toy/ToyTrees.jsx`) — kept literal per `project_v1_no_trees` (toy shares LS's tree atlas; not a kit "instance"). Deploy-side LS references (CNAME, Worker, OG meta, vanity URLs in share-card strings) — cleanout plan territory.
- ✅ **b24fce5 terrain-pipeline build-break + runtime TDZ** — fixed alongside §6 INSTANCE: (1) `vite.config.js` now sets `build.target: 'es2022'` (top-level await support) + `assetsInclude: ['**/*.bin']` restored — both got reverted after SC.7. (2) Broke a circular import: `src/utils/terrainShader.js` was `export { V_EXAG } from './elevation'` while `elevation.js` imported `{width, height, bounds, data}` from terrainShader; with TLA in the loop, elevation.js:11 hit TDZ at production page-load. V_EXAG re-export now routes directly to `src/lib/terrainCommon.js` (canonical source). `npm run build` succeeds (998 modules, 23s); production runtime no longer white-screens. **Follow-up for terrain operator** (cartograph/BACKLOG.md): with the runtime unblocked, b24fce5's new clipped-GeoTIFF pipeline renders for the first time and V_EXAG=5 is visibly too aggressive (terrain "insanely" hilly, lamps lift ~50ft, ground swallows buildings — building displacement coverage may also be incomplete).
- ⏳ Cleanout plan execution — mode-conditional `rollupOptions.input` (drops 4.5 MB cartograph chunk from prod), `copyPublicDir: false` + allow-list, deployment-ID audit script in `deploy.yml`, two verified orphan deletions, CARY-BRIEF relocation.
- ⏳ RUNTIME-DELTA §3 exhaustive staging walk on real cellular — hard merge gate.

---

## Concurrent / non-blocking

These don't gate the marriage leap; they progress on their own tracks.

| Item | Notes |
|---|---|
| **Cartograph evergreen** | Visual stack refinements (`cartograph/BACKLOG.md`) continue. Each bake produces a fresher slab; the deployed site picks up new slab data as you ship. |
| **Arborist roster swap** | Trees library upgrade post-stability. Hot-swappable into `public/baked/<look>/trees/` + `default.json`; no LS app code changes needed. |
| **Cary v1 status decision** | Ship behind placeholder vs. wire up Supabase live. Affects bundle weight + secrets. Resolution lands in Phase B's parametrize plan (Cary's data layer is the kit-instance boundary). |
| **`ls/FEATURES.md` end-user experience writeup** | Browse / Hero / Street / PlaceCard / Bulletin / residence / handles. Doc work, lags execution opportunistically. |
| **`ls/reference/SECURITY.md`** | Device-hash identity, admin passphrase, Supabase RLS posture. Lands as part of Phase B's security audit doc. |

---

## Doc work already done (this session)

| Item | Where |
|---|---|
| LS trinity scaffolded | `ls/{FEATURES,ARCHITECTURE,BACKLOG}.md` |
| Cartograph trinity moved | `cartograph/{FEATURES,ARCHITECTURE,BACKLOG}.md` |
| Two-trinity index | Root `README.md` |
| Live-data inventory | `ls/ARCHITECTURE.md §2` + `ls/reference/INVENTORY-DATA.md` |
| Runtime composition map | `ls/ARCHITECTURE.md §1` |
| API reference (50+ GAS endpoints + Supabase + Worker + open-meteo) | `ls/reference/INVENTORY-API.md` |
| Slab boundary spec | `SLAB-CONTRACT.md` (root) |
| Rollback floor | Tag `v1-pre-cartograph-merge` on `origin/main @ 20866ef` |
| Spring cleaning | 400 MB facade-decor + 40 ribbons backups + ARCH.md archived |
| L1.1 BakedLamps swap | Shipped (production parity with Stage/Preview) |

---

## Mid-session contradictions (carry-overs)

Items the inventory + slab-contract walks flagged. None affect runtime; all should be resolved at next touch of the relevant trinity.

| ID | Item | Where | Owner |
|---|---|---|---|
| K.1 | `cartograph/FEATURES.md:286,300` + `cartograph/ARCHITECTURE.md:116,136` reference `src/components/StreetRibbons.jsx` which no longer exists. Partially addressed 2026-05-13 (FEATURES.md L286 corrected); ARCHITECTURE.md L116 + L136 still need rewriting (the latter is a longer convention essay tied to retired chain-rectangle architecture). | Cartograph trinity | Next cartograph session |
| K.2 | ~~`CloudDome` procedural — `public/clouds/{presets,almanac}.json` published but unconsumed~~ | RESOLVED | Cleanout plan §3 strips the artifacts in v1; wire-or-rewrite deferred to v1.1 concurrent track |
| K.3 | `PlanetariumOverlay` has `viewMode === 'planetarium'` infrastructure in `Scene.jsx` but the component isn't imported anywhere in production. | LS runtime | Phase C — RUNTIME-DELTA §3 walk will confirm; strip if confirmed dead |
| K.4 | `SLAB-CONTRACT.md §3` claims ground lightmap UVs are bbox-derived; not verified in `BakedGround.jsx`. | Doc accuracy | Future slab-contract touch |
| K.5 | `SLAB-CONTRACT.md §4` calls `scene.json` `layerVis` "redundant" — not verified against `bake-ground.js`. | Doc accuracy | Future slab-contract touch |
| K.6 | Vite default `copyPublicDir: true` ships all of `public/` to `dist/` today (verified — 4.9 GB `public/trees`, 255 MB `public/models`, etc., all ship). Resolved by cleanout plan §S3 allow-list. | Build hygiene | Phase C cleanout exec |
| K.7 | `BASE_URL` invariant codified 2026-05-13 across couplers plan CC.8, SLAB-CONTRACT §10.6, and memory `project_kit_deploy_path_agnostic`. All slab consumers migrated to `${import.meta.env.BASE_URL}` routing (commit `f871a9d`). | Reference | Closed |

---

## Stale handoff docs (kept, with explicit retire conditions)

These have live references — they retire when their successor lands.

| Item | Retire when |
|---|---|
| `HANDOFF-clouds-day3-clouddome-v2.md` | `<Atmosphere />` ships and supersedes the shader tuning rubric (per `meteorologist/README.md`) |
| `HANDOFF-neon.md` | NeonBands lifts decision history into `ls/FEATURES.md §"Neon"`; refs in source comments rewritten |
| `HANDOFF-sky-and-light.md` | Sky/light pipeline gets lifted into both trinities |
| `cartograph/SHADOW_HANDOFF.md` | Cartograph BACKLOG item C.4 (Shadow post-pass) lands; doc is ingested into ARCHITECTURE |

---

## Pointers

- [`ls/FEATURES.md`](FEATURES.md) — product orientation
- [`ls/ARCHITECTURE.md`](ARCHITECTURE.md) — runtime composition + live-data inventory
- [`ls/reference/INVENTORY-DATA.md`](reference/INVENTORY-DATA.md) — data catalog (partner-pasteable)
- [`ls/reference/INVENTORY-API.md`](reference/INVENTORY-API.md) — backend catalog (partner-pasteable)
- [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) — boundary spec between cartograph and LS
- [`../cartograph/BACKLOG.md`](../cartograph/BACKLOG.md) — authoring-side punchlist (the visual stack v1)
- Memory: `feedback_beautiful_first_lightweight_51` — product doctrine
- Memory: `feedback_orphan_audit_full_repo` — orphan-classification rule
