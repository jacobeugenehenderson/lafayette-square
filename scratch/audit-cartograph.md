# Audit — Cartograph Pathologist (the factory)

> Pathologist: **Pantograph** (a drafting instrument that *copies* a drawing through a
> linkage — fitting, since the central finding here is copied sources of truth). Read-only
> walk, 2026-05-27. Domain: the authoring corpus — Designer (Survey/Measure/Design), Toy,
> Stage, Preview (Desktop+Mobile), the `cartograph/` backend + serve.js, the cartograph store.
> Instrument: `AUDIT-MATRIX.md`. Slab emit/bake is a shared seam (coordinated, not owned).

---

## Narrative — the biggest knots

The Cartograph is in good structural health. It is NOT a pile of dead code — almost everything
walked is `real` and load-bearing. The product-grade problem is **duplication of sources of
truth**, not rot. Four knots, in priority order:

### 1. The 33-field design block is hand-maintained in THREE places (the keyframe-clobber bug, structurally)
`useCartographStore.js` lists every per-Look design field three times: the `setActiveLook`
hydrate (1110–1176), the `_loadCenterlines` boot hydrate (1575–1642), and the
`_saveDesignDebounced` writer (1725–1769). They must stay byte-identical or a field that's
saved-but-not-hydrated gets clobbered by store-init defaults on the next autosave. This is
exactly [[feedback_dual_hydration_paths_drift]] — it already cost the operator 3 hero keyframes
→ 2. The fix landed for hero fields by *copying the lines into the third list*, which is the
duct-tape, not the weld. **Real fix:** one `DESIGN_FIELDS` descriptor (key → migrator → default)
that drives hydrate AND save from a single array. This is the single highest-leverage cleanup in
my domain — it's a latent data-loss bug on every future channel anyone adds. **Blocks:** safe
addition of any new Stage channel (clouds UI, mobile-delta channel, etc.) without re-risking the
clobber.

### 2. Geography has a declared SSOT (`src/instance.js`) that two consumers ignore
`INSTANCE.geography` (lat/lon/timezone) is the documented single source — and `animatedParam.js`
+ `SkyGradientGrid.jsx` correctly read it. But `cartograph/config.js` (backend) re-hardcodes the
same `CENTER`/`BBOX` with its own "to target a different neighborhood, change CENTER and BBOX"
doctrine, and `AerialTiles.jsx` re-hardcodes `BBOX` + the `LON_TO_METERS/LAT_TO_METERS`
projection constants. So the "change one file" promise is already broken across a frontend/backend
seam. **Real fix:** backend reads a shared `instance.json` (or config.js *is* the backend half of
INSTANCE and the frontend imports from it); AerialTiles reads INSTANCE. **Productization:** this
IS the geography intake setting — the cleanup writes the first settings-screen field.

### 3. Camera framing has three constant-homes even after the runtime resolver was unified
The 2026-05-27 camera arc correctly routed all three cameras (Stage/Preview/Production) through
ONE runtime `resolveHeroSubject`/`browseAltitude`. But the *constants* still triplicate:
`SHOTS`/`SHOTS_FLAT_DEFAULTS` in StageApp + skyLightChannels, and `PRESETS`/`HERO_CENTER`/
`HERO_TARGET`/`FALLBACK_HERO_SUBJECT` in production Scene.jsx. The stale `[400,45,-100]` /
`PRESETS.browse [0,600,1]` survive as fallback guards. They're `duct-tape` (load-bearing guards),
not dead — but they're LS-specific magic numbers that should resolve from the slab's
`shots.browse.bounds`, with a generic (non-LS) last-resort. **Blocks:** clean multi-instance
camera framing; folds into render-conformance Phase 6 parity.

### 4. The V1 measure-authoring path (couplers / segmentMeasures) is a half-retired limb
`toggleCoupler` (a 55-line store action with full segmentMeasures-migration logic) has **zero
callers** — only a comment marking it "retired with the block-customs feature." `setSegmentMeasure`
likewise has no panel/overlay caller. But the *read* side stays live: MeasureOverlay still resolves
measure through `segmentRangesForCouplers`, and `_loadCenterlines`/`_saveOverlay` round-trip
`couplers`+`segmentMeasures` to honor existing `overlay.json` data. **Classify carefully:** the
WRITE path (`toggleCoupler`, `setSegmentMeasure`) is `vestigial`; the READ path is `duct-tape`
(it's a back-compat shim for already-authored data). Cutting the read path without a data
migration would silently drop any coupler an operator authored pre-block-customs — exactly the
[[feedback_clean_regen_must_be_idempotent_complete]] failure mode. Remove the write actions; keep
or migrate the read path with evidence the overlay files no longer carry couplers.

**Lesser knots:** the `/rebuild` endpoint runs `node render.js` which doesn't exist (dead stub);
`DEFAULT_LOOK_ID='lafayette-square'` is hardcoded in 5 files; `cartograph.css` defines a parallel
`--carto-*` token system disjoint from `design.css` and carries ~10 raw hex values; the
Mobile|Desktop tab and mobile-profile Preview **do not exist yet** (planned, blocked on the
conformance cold-review).

**The generative headline:** the de-hardwiring scaffolding is *already half-built*. `INSTANCE`
(geography/identity SSOT), `SCENE_REGISTRY` (CartographApp:592 — "new scenes register here;
components should not branch on scene names"), the scene-aware backend routing (`data/<scene>/`,
`/<scene>/<verb>`), and the per-Look `design.json` channel system are the bones of the
front-front-end. Productization here is mostly *finishing patterns that exist*, not inventing new
ones. The `toy` scene is a live proof that a second instance already runs through the kit.

---

## Matrix

Columns per `AUDIT-MATRIX.md`. Cruft-class: `real` · `duct-tape` · `vestigial`.
Productization: `future-setting` (tier1) · `slab-field` (tier2) · `api-route` (tier4) · `none`.

### A. Designer — modes, tools, overlays

| Item / Location | Envs | What it is | Capability statement | Source(s) of truth | Cruft | Action | Blocked-on / releases | Productization | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Mode axes — `tool` × `shot` (`store:1247–1344`) | Designer/Stage | Two orthogonal selectors: tool (null/surveyor/measure) + shot (designer/browse/hero/street) | "Switch between drawing tools and camera shots independently." | store, localStorage | real | keep | — | none | Clean model. |
| Survey tool — `SurveyorPanel`/`SurveyorOverlay` | Designer | Click streets/nodes; edit name, type, oneway, anchor, caps, smoothing | "Inspect and edit any street's attributes." | store `centerlineData`, overlay.json | real | keep | — | none | — |
| Hero-subject picker (`SurveyorPanel:15–46`) | Designer→all | Designate the object the Hero camera frames | "Pick what the hero shot centers on." | store `heroSubject`, `design.json` | real | keep | Undesignated → resolves arch; explicit designation optional | slab-field (heroSubject) | Resolver unified 2026-05-27. |
| Measure tool — `MeasurePanel`/`MeasureOverlay` | Designer | Drag band handles to set street cross-sections; insert/delete boundaries | "Dial pavement/curb/treelawn/sidewalk widths per street, per side, per block." | store `blockCustoms`/`measure`, overlay.json | real | keep | — | none | Block-customs model. |
| Whole-chain↔per-block toggle (`MeasurePanel:315`, `store setMeasureMode`) | Designer | Switching TO global wipes per-block customs | "Edit a whole street uniformly, or opt into per-block variation." | store `measureMode` | real | keep | — | none | Destructive-on-toggle by design; document the gesture. |
| Coupler / segmentMeasures **write** — `store toggleCoupler:1901`, `setSegmentMeasure:1984` | Designer (none live) | V1 measure authoring superseded by block-customs | ⚠️ "Split a chain into measured segments" — no UI reaches it | store only | **vestigial** | **remove** (write only) — zero callers (`grep`) | — | none | Keep the READ path (next row). |
| Coupler / segmentMeasures **read** — `MeasureOverlay segmentRangesForCouplers`, `store _loadCenterlines`/`_saveOverlay` | Designer | Back-compat: renders + round-trips already-authored couplers | "Existing coupler data still resolves correctly." | overlay.json | **duct-tape** | **fix** — migrate overlay files off couplers, then drop | overlay.json containing couplers | none | Don't cut blind — [[feedback_clean_regen_must_be_idempotent_complete]]. |
| Corner editing — `CornerEditHandles`, `Panel CornersSubsection` | Designer | Per-IX + per-corner radius dots; global `cornerRadiusScale`; revert | "Smooth or sharpen any intersection corner, or scale them all." | store `cornerRadius*`, design.json | real | keep | — | slab-field (already in design) | `cornerEditMode` transient (not persisted) — correct. |
| Curb width / alley caps / labels (`Panel` subsections) | Designer | Global curb width, alley end-cap mode, street-label typography | "Set curb width, alley caps, and street-label style site-wide." | store, design.json | real | keep | — | future-setting (label brand) | Labels = brand/theme candidate. |
| Marker tool — `MarkerOverlay`/`MarkerFAB` | global | Freehand red annotation over the map | "Draw notes on the map." | store `markerStrokes`, marker_strokes.json | real | keep | — | none | — |
| Engineering visibility (`store engineeringHidden:1011`) | Designer | Session-only declutter (hide buildings to check footprints) | "Temporarily hide layers while surveying." | store (not persisted) | real | keep | — | none | Correctly NOT in design.json. |
| `DesignerArch` | Designer | Flat black Arch silhouette reference | "See the Arch outline from above." | store `arch` channel | real | keep | — | none | LS landmark; per-instance via arch channel. |
| `BlockGeometryV2Debug` | Designer | Live ground-geometry renderer (rAF-throttled V2 snapshot) | "See your street/corner/color edits update live." | ribbons.json + live store | real | keep (rename) | — | none | Name is historical (comment:19) — rename debt only. |
| `BakeModal` / `StatusBar` | Designer | Bake progress modal; transient drag-feedback bar | "See bake progress and live measurements." | store | real | keep | — | none | — |
| Aerial / fills toggles (`store aerialVisible`/`fillsVisible`) | Designer | Esri World Imagery underlay vs curated SVG | "Toggle between the aerial photo and the drawn map." | store; tile URL hardcoded | real | keep | — | future-setting (basemap source) | Tile URL → setting (see G). |

### B. Stage — look-authoring cards & the channel system

| Item / Location | Envs | What it is | Capability statement | Source(s) of truth | Cruft | Action | Blocked-on / releases | Productization | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Stage panel — 6 cards (`StageApp` StagePanel:1362) | Stage/Preview | Time-of-Day, Sky&Light, Hero&Horizon, Surfaces, Camera, Post | "Author the whole look: time, sky, lighting, materials, camera, post." | cartograph store → design.json | real | keep | — | slab-field | — |
| TOD channel system — `createGroupChannelActions` (`store:53`) + `TodChannel.jsx` + ~22 channels | Stage→Prod | One factory drives set/animate/un-animate/addSlot/removeSlot/transition for every channel | "Animate any channel (sky, neon, bloom, lighting, grade…) across the day with keyframes." | store channels, design.json, scene.json (baked) | real | keep | — | slab-field (per channel) | Excellent SSOT *of behavior*; the field *list* is the problem (knot #1). |
| Surfaces — `surfaceState.js` + Stage Surfaces card | Stage→Prod | Per-material color/roughness/metalness/texture/emissive | "Re-skin walls, roofs, foundations, neon, trees per Look." | `surfaceState` module + store `materialColors`/`materialPhysics` | duct-tape | fix | — | slab-field | TWO material registries: `surfaceState` (module-scope) AND store `materialColors/Physics`. Reconcile to one. |
| Camera card — Hero keyframes / Browse / Street (`StageApp:568–930`) | Stage→Prod | Capture hero poses; set browse center/altitude/heading; street eye height | "Author each shot's framing." | store `shots`/`heroKeyframes`/`browseHeading`, design.json | real | keep | — | slab-field | Resolvers unified; constants triplicated (knot #3). |
| Module-scope camera bridges — `cameraState`/`liveCamera`/`heroScrub` (`StageApp:205/232/547`) | Stage | R3F↔DOM mutable bridges for live capture | n/a (internal) | module-scope mutable | duct-tape | keep (documented) | — | none | Intentional (SC.7); flag as a pattern to not multiply. |
| `neonForceOn` (`store:369`) | Stage only | QA bypass of business-hours filter to preview neon | "Preview neon at any time of day." | store (session-only) | real | keep | — | none | Correctly NOT serialized — session ≠ authored product. |
| **Mobile\|Desktop tab** | Stage (planned) | Desktop base + Mobile delta/override | "Author a mobile-specific override of any Look." | — DOES NOT EXIST | vestigial (as capability claim) | **build** (when unblocked) | conformance cold-review (Phases 4–5) | slab-field (mobile profile) | Co-owned w/ LS App. [[project_mobile_profile_authored_channel]]. |

### C. Preview (Desktop + Mobile)

| Item / Location | Envs | What it is | Capability statement | Source(s) of truth | Cruft | Action | Blocked-on / releases | Productization | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `PreviewApp` | Preview | Production Scene replica reading the baked slab (no write-back) | "Preview the baked result exactly as production renders it." | scene.json/design.json (read) | real | keep | — | none | — |
| `PhoneFrame` + `phoneBus` | Preview-Mobile | iPhone bezel + flight-recorder profiler | "Preview on a virtual phone." | — | duct-tape | fix | conformance Phases 4–5 | none | ⚠️ Renders desktop-in-a-small-frame, NOT the mobile profile. Capability over-claims today. |
| `GpuMonitor` + `StripChart` + `TriggerBar` | Preview | Per-layer GPU cost attribution; recording triggers | "Measure what each layer costs." | runtime | real | keep | empirical meter-verify open | none | Vernier fixed the sampling dilution; numbers-vs-production unconfirmed. |
| `DEFAULT_LAYERS` + hardcoded neon/fog/bloom/AO (`PreviewApp:382`) | Preview | Temporary defaults pending profile slab | n/a | hardcoded (comment flags move) | duct-tape | fix → design.json#postFx | mobile profile schema | slab-field | Self-flagged scaffold. |

### D. Backend / proto-API (`cartograph/serve.js`, port 3333, mount `/api/cartograph`)

| Item / Location | Envs | What it is | Capability statement | Source(s) of truth | Cruft | Action | Blocked-on / releases | Productization | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Scene data routes — `GET/POST /<scene>/{markers,measurements,centerlines,overlay}`, `GET /<scene>/skeleton` | Designer | Read/write per-scene authoring inputs | "Save and load survey/measure/marker work." | `data/<scene>/{raw,clean}` | real | keep | — | api-route | Scene-aware = multi-instance seam already built. |
| Looks routes — `GET/POST /looks`, `/looks/<id>/design`, `/looks/<id>/trees`, `DELETE /looks/<id>` | Stage/Designer | CRUD Looks; design + tree roster merge-on-write | "Create, duplicate, style, and delete Looks." | `public/looks/<id>/design.json` + `index.json` | real | keep | — | api-route | Merge-on-write preserves `trees` (Arborist seam). |
| Bake route — `POST /looks/<id>/bake[?force=1]` | Stage | Runs the 8-step per-Look pipeline with mtime dirty-check | "Bake a Look into a portable slab." | design.json → `public/baked/<id>/` | real | keep | — | api-route | Per-Look lock; `?force` override. The slab-emit seam (shared w/ LS App). |
| Legacy default-scene aliases (`/<verb>` w/o scene prefix) | Designer | Back-compat for pre-scene routes → lafayette-square | n/a | serve.js | duct-tape | keep until callers migrated | — | none | Phase-0c migration tail. |
| `POST /rebuild` → `node render.js` (`serve.js:674`) | dev | Dev HMR rebuild trigger | ⚠️ "Rebuild the preview" — `render.js` **does not exist** | — | **vestigial** | **remove** (verify `rebuild()` caller dropped too — `api.js:63`) | — | none | Confirmed missing on disk; would throw "Command failed." |
| `GET /analyze` (`serve.js:264`) | dev | Parcel/block overlap diagnostic for marker strokes | "Analyze drawn strokes against parcels." | `data/lafayette-square/clean` + `scripts/raw/stl_parcels.json` | duct-tape | fix (LS-pathed) or remove | — | api-route? | Hardcoded LS parcel path; verify still used. |

### E. Persistence & store (the SSOT engine)

| Item / Location | Envs | What it is | Capability statement | Source(s) of truth | Cruft | Action | Blocked-on / releases | Productization | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 33-field design block ×3 (`store` hydrate@1110, hydrate@1575, save@1725) | Stage/Designer | Hand-maintained field list duplicated in 2 hydrates + 1 writer | n/a | store | **duct-tape** | **fix** → one `DESIGN_FIELDS` descriptor | every future channel; mobile-delta channel | none | **Knot #1.** [[feedback_dual_hydration_paths_drift]] in code form. |
| Autosave debounce + flush-before-bake (`store _saveDesignDebounced:1711`) | Stage/Designer | 300ms debounce; `flush()` drains before bake POST | "Edits autosave; baking always sees your latest." | store | real | keep | — | none | [[feedback_debounced_save_must_flush_before_dependent_post]] honored. |
| overlay.json save guards (`store _saveOverlay:1651`) | Designer | Refuse-to-write when uninitialized/un-hydrated (HMR + boot) | "Edits never clobber the file on reload." | overlay.json | real | keep | — | none | Good HMR resilience. |
| `updateStreetField` stale comment (`store:1863`) | Designer | Comment says "edits evaporate on reload" but body calls `_saveOverlay()` | n/a | code/comment mismatch | duct-tape | fix (correct the comment) | — | none | Stale doc → confuses the capability. |
| `_saveCenterlines` alias (`store:1785`) | — | Back-compat shim → `_saveOverlay` | n/a | store | vestigial | remove (verify no callers) | — | none | — |
| `window.cs` dev hook (`store:2095`) | dev | Store on window for inspection | n/a | — | real | keep | — | none | Harmless dev aid. |

### F. CSS / design tokens (co-owned with LS App Pathologist)

| Item / Location | Envs | What it is | Source(s) of truth | Cruft | Action | Productization | Notes |
|---|---|---|---|---|---|---|---|
| `src/cartograph/cartograph.css` (1128 lines) | Designer/Stage | Cartograph UI; defines its OWN `--carto-*` + `--toolbar-*` token set | self-contained; comments reference `design.css` but does NOT `@import` | duct-tape | fix — adopt `design.css` tokens; tokenize ~10 raw hex | future-setting (theme) | `#2250E8`×4, `#ff8c42`, `#88f`, `#c66/#c87b6e/#e2998a` (inconsistent danger), `#777`. |
| `src/tokens/design.css` ↔ `public/lsq-tokens.css` | app ↔ CodeDesk | Two token files (Material3 `--*` vs `--lsq-*`) | NO name collision (different prefixes); semantic dup (surface/text/radius) — `--radius-lg:12px` vs `--lsq-radius-lg:22px` | duct-tape | fix — reconcile to one source (design.css canonical) | future-setting (brand) | Primary cross-cutting dup. Reconcile WITH LS App; don't design new. |
| `public/codedesk/styles/theme.css` | CodeDesk | Redefines all `--lsq-*` locally (lines 40–60) | duplicates lsq-tokens.css | duct-tape | fix (CodeDesk-owned; flag to LS App) | none | Likely outside my domain; surfaced for the reconcile. |

### G. Hard-wiring → future-setting inventory (the de-hardwiring list)

| Hardcoded value | Location(s) | What it controls | Cruft | Productization |
|---|---|---|---|---|
| `lat 38.6160 / lon -90.2161` | `instance.js:31` (SSOT) **+ `config.js:9` + `pipeline/hydrate-anchor-cards.js:28`** | Geography / SunCalc anchor | duct-tape (dup) | future-setting (geography) — **knot #2** |
| `BBOX` + `LON/LAT_TO_METERS` | `config.js:12,19` **+ `AerialTiles.jsx:33,36`** | Bounding box + projection | duct-tape (dup) | future-setting (map extent) |
| `DEFAULT_LOOK_ID='lafayette-square'` | `store:42`, `Toolbar.jsx:22`, `serve.js:98`, `instance.js:19`, + `config DEFAULT_SCENE:52` | Default Look/scene | duct-tape (dup ×5) | future-setting (default Look) |
| `SHOTS` / `SHOTS_FLAT_DEFAULTS` / `PRESETS` / `HERO_CENTER` / `FALLBACK_HERO_SUBJECT [400,45,-100]` | `StageApp:183`, `skyLightChannels:160–215`, prod `Scene.jsx:50,62` | Camera framing constants | duct-tape (guards) | slab-field — **knot #3** |
| `ARCH_FLAT_DEFAULTS` (distance/bearing/scale/rotation) | `skyLightChannels:160` | Gateway Arch placement | real (per-Look authored) | slab-field (already) |
| Browse bounds `{cx:95,cz:-158,w:1292,h:1025}` | `skyLightChannels:201`, `StageApp:191` | Browse framing | duct-tape (dup) | slab-field |
| Esri World Imagery tile URL | `AerialTiles.jsx:87` | Aerial basemap source | real | future-setting (basemap) |
| Overpass / USGS EPQS / Fontsource URLs | `fetch.js:22`, `elevation.js:13`, `Panel.jsx:350` | External data ingest | real | future-setting (data sources) |
| Cary SMS/email, contact email, domain | `instance.js:42–55` | Per-instance contact | real (in SSOT) | future-setting (correctly placed) |
| `TOY_CAM` / `TOY_STENCIL` | `CartographApp:133,565` | Toy fixture framing | real | none (R&D fixture) |
| `buildingPalette` (12 hex) | `store:300` | Per-Look building tint palette | real (authored) | slab-field (already) |

> No API keys / Supabase URLs / auth secrets found hardcoded — clean security posture.

### H. Cross-domain seams (surfaced, not owned)

| Seam | Where | Note for the owning pathologist |
|---|---|---|
| Slab emit/bake | `serve.js bake` → `cartograph/bake-*.js` → `public/baked/<id>/` | Shared with LS App Pathologist. The 8-step pipeline + dirty-check is the tier-2 productization core. |
| `IS_MOBILE` ×6 regexes | `Scene/LafayetteScene/PostProcessing/StreetLights/SlabBuildings/.jsx` | Dedup → `src/lib/isMobile.js` exists; conformance Phase 3. LS App co-owns. |
| Mobile profile | Stage tab + Preview phone-mode (both absent) | Co-owned. Blocked on conformance cold-review. [[project_mobile_profile_authored_channel]]. |
| `SCENE_REGISTRY` (CartographApp:592) + scene-aware backend | the multi-instance pattern, half-built | Generative: this + INSTANCE + per-Look design.json ARE the front-front-end bones. |

---

## Defaults — Boz's leans (flag if I'd change)

- **Mobile authoring co-owned with LS App** — agree; the Stage tab is mine, the shipped regime is theirs.
- **CSS = reconcile existing, not design new** — agree; `design.css` is the clear canonical source, `cartograph.css` should adopt it rather than keep `--carto-*`. One caveat: the `--carto-*` set is genuinely scoped/intentional (operator-tool chrome vs app chrome), so "reconcile" may mean *map carto-tokens onto design.css primitives*, not delete them wholesale.

## Surprises outside the brief

- **`src/instance.js`** already exists as the geography/identity SSOT with explicit
  productization doctrine — the de-hardwiring isn't greenfield. Mostly in LS App's domain but it's
  the natural home several Cartograph hardcodes (config.js, AerialTiles) should defer to.
- **`toy` scene** is a working second instance through the kit — the strongest existing evidence
  the factory is genuinely multi-instance, not LS-welded.
- **Two material registries** (`surfaceState.js` module-scope + store `materialColors`/`materialPhysics`)
  — wasn't called out in the brief; worth a reconcile (minor knot, folded into B).
- The `cartograph/` doc corpus is large (FEATURES 84KB, BACKLOG 290KB, NOTES 273KB, RIBBONS 91KB,
  ARCHITECTURE 20KB, README, SHADOW_HANDOFF, TOY_AUTHORING_PLAN). FEATURES.md is the capability
  source for the Show Bible. Did not deep-read all; flagged none as nonsense from the code walk.
