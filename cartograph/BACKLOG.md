# Cartograph Backlog

> Part of the **cartograph trinity** (`cartograph/FEATURES.md` / `cartograph/ARCHITECTURE.md` / `cartograph/BACKLOG.md`). Read at session start; check off completions during work; prune toward pristine. Resolved items belong out of this doc, not in a "Done" section. If an item is older than its context still being relevant, retire it. The LS consumer app has its own parallel trinity under `ls/` — see root `README.md` for the index.

## 2026-05-14 — Polygon-graph restructure (multi-session arc, LOAD-BEARING)

Multi-session migration to align V2's implementation with the FEATURES "ribbon doctrine — the stage wall" section. Today's `buildBlockGeometryV2` re-walks `chain.points` in the surface hot path on every Designer store update — doctrine-noncompliant tech debt. Migrating to a frozen polygon-graph artifact (`public/baked/<scene>/polygons.json`) that surface-stage code reads exclusively. Operator interaction moves from chain-edits (today) to polygon-attribute editing (couplers, lane offsets, drag widths) that retriggers a polygon-graph rebake.

**Read the maxi-brief in `cartograph/NOTES.md`** ("2026-05-14 PM — Polygon-graph restructure (multi-session arc) — MAXI BRIEF") before touching geometry code. Four phases (A: long-run tangent extraction; B: polygon-graph schema + producer; C: surface consumer migration; D: operator interaction layer). Each phase has its own commit + acceptance test; do not bundle.

Curved streets explicitly first-class — see the "Curved streets — first-class case, ground laid here" subsection in the brief.

## 2026-05-14 — Corner kit: per-IX center handle restored + per-IX revert (LANDED)

The IX center dot had been retired (`CornerEditHandles.jsx` carried a dead-comment to that effect), reducing the kit from the doctrinal 3 tiers (global slider → per-IX dot → per-corner dot) down to 2 — and forcing operators to choose between global Revert or per-corner cleanup with nothing in between. The dormant `cornerRadiusOverrides` map was still consumed in geometry; just unreachable from the UI.

- **Phase 1** — restored the big blue per-IX dot at every IX (drag math, snap-to-reset, origin marker, tap toggle all mirror the per-corner dot). Commit homogenizes the IX via the existing `setIxCornerRadius` action (clears per-corner overrides at the IX).
- **Phase 2** — right-click on the IX dot calls `setIxCornerRadius(point, null)` which already does the prefix-walk to drop per-corner entries at that IX. Browser context menu suppressed while corner-edit mode is active. Global Revert button untouched (still nukes everything).

FEATURES line 72–76 already described this kit accurately; the staleness has been corrected by making the code match.

## 2026-05-14 — Non-building landmarks need their own treatment

Three Society Pages landmarks describe **places that aren't buildings** and currently have no `building_id` and no rendering treatment in the slab:

- `lmk-121` Lafayette Park — the entire park (already renders as the park itself, but no landmark/PlaceCard linkage)
- `lmk-122` Lafayette Square Community Garden — Dolman St at Park Ave
- `lmk-123` Lafayette Square Pool & Tennis Club — 2224 Rutger St

Open question: how do non-building landmarks attach to the slab? Options to evaluate:
- A `place_id` field on landmarks that points into a separate `places.json` (parks/gardens/grounds), parallel to `building_id` → `buildings.json`
- A polygon-region landmark type that draws its own clickable footprint on the ground layer
- Something else (e.g., point-of-interest pins)

Surfaced during the 2026-05-14 Society Pages reconciliation pass (which linked 11 landmarks to buildings and added 14 new buildings). The other 4 unlinked landmarks at end of pass: these 3 + `lmk-070` Wildflowers STL (2754 Lafayette Rear — needs back-of-lot investigation, separate concern).

## 2026-05-14 — Terrain integration sweep (b24fce5 + V_EXAG tuning + foundation rule)

Big follow-up session on the b24fce5 clip-to-stencil terrain pipeline. The visible-terrain bug from 2026-05-13 ("insanely hilly, lamps lift 50 ft, ground swallows buildings") had multiple root causes; all addressed except the structural per-Look channel.

**Shipped (✅):**

- **V_EXAG 5 → 1.5** in `src/lib/terrainCommon.js`. The old value was sized for the EPQS bake's near-zero raw range; b24fce5's `local-min = 0` normalization brings real LS relief (~35 m) so V_EXAG amplifies a much larger signal. 1.5 keeps the LS-wide gradient dramatic without exaggerating per-footprint variance enough to make rigid foundations expose multi-story pedestals on slopes. Comment in `terrainShader.js:9` that said "V_EXAG (10)" — resolved (pointed at terrainCommon.js as the source of truth).
- **Foundation/wall anchor rule corrected.** `Foundations` + `Building` both now lift by `mean(getElevationRaw(footprint[i]))`, matching `cartograph/bake-buildings.js`'s canonical `centroidY` computation. Previously LafayetteScene Foundations used `getElevationRaw(building.position)` (single-point centroid sample) → diverged from the bake by the heightfield convexity across the footprint, baked extra exposure into every building. Helper `patchTerrainAtCentroidRaw(mat, centroidRaw)` added in `terrainShader.js` for materials whose anchor isn't the mesh origin.
- **`mergeBufferGeometries` preserves `aCentroidY`.** Custom merge in `src/lib/mergeGeometries.js` previously dropped per-vertex attributes other than position+index — Foundations was correctly stamping aCentroidY per-building before merge, then losing it. Now preserved when every input geometry has it.
- **`TERRAIN_DISPLACE_INSTANCED` divides by instance Y-scale.** Lamps at `LAMP_SCALE ≈ 1.38` were over-lifting ~38% (world result = `sample × uExag × instanceScale` instead of `sample × uExag`). The shared snippet now does `length(instanceMatrix[1].xyz)` and divides, so instanced consumers land at exactly `sample × uExag` meters regardless of authored scale.
- **Trees displaced.** `treeAtlasMaterial.js` was injecting foliage sway only; added `patchTerrainInstanced` chained after sway (instance matrix is T×R only, scale baked into GLB at Arborist publish, so the Y-scale divide is a no-op for trees; lift = `sample × uExag` meters).
- **Glow / halo billboards in `StreetLights.jsx`.** Custom ShaderMaterial billboards bypass three's standard project_vertex chain. Added world-space terrain lift directly inside `BILLBOARD_VS_INC` (`_bbCenter.y += texture × uExag`); glow/halo now track the lamp lantern up the hillside.
- **LafayetteScene Building mobile branch missing patchTerrain.** The `!hasTextures` branch returned the material before applying `patchTerrain` — buildings on mobile (or pre-texture-load) were stuck at world-Y=0. Now patches both branches.
- **Foundation + Building frustum culling disabled.** With GPU vertex displacement up to ~50 m, the geometry's cached `boundingSphere` is at the un-displaced Y; three's frustum culler popped buildings out as the camera moved past where the stale sphere sat. `frustumCulled={false}` on both meshes.
- **LafayettePark per-item terrain.** Dropped the whole-park rigid group lift (was using `getElevation(0,0) × terrainExag.value` — double V_EXAG via `getElevation` already pre-multiplying; corner mismatch was meters across 350 m extent under b24fce5's real raw). Now per-item: gravel paths per-vertex `patchTerrain`; fence posts + rails rigid `patchTerrain` (each mesh's own world origin); labels in `<ElevatedGroup>` (per-text `useFrame` lift); lake + grotto in `<PondGroup>` rigid lift sharing per-pond centroidRaw so bank + water + island Y separations stay locked.
- **Cache-key collisions on pathMat + waterMat in LafayetteScene.** `patchTerrain` wraps `customProgramCacheKey` as `terrain-{mode}-{prevKey ?? 'std'}`. Without a unique prev key, multiple patched materials collapse onto the same `terrain-vp-std` cached program. Path lost its gravel fragment + water lost its ripple shader — both rendered as flat default-color PBR. Now `pathMat` keys as `park-path-gravel-v1`, `waterMat` as `park-water-ripple-v1`, both BEFORE `patchTerrain` wraps.
- **MapLayers `ground` mesh hidden in shots.** `SHOT_SKIP` set in `MapLayers.jsx` now includes `'ground'`. The MapLayers full-LS-bbox ground plane (color `#2A2826` near-black, ~25 m segmentation) was painting on top of `BakedGround`'s grass face at Lafayette Park (terrain bulge interpolation differential ~14 m higher than face polygon's coarse triangulation) → grass invisible at Hero, filled in as terrain flattened on Browse. BakedGround owns the slab in shots.
- **MapLayers landscape + parking_lot per-vertex.** Dropped `rigidCentroid: true` from landscape (gardens/pools/playgrounds/etc.) + parking_lot. Each polygon now displaces per-vertex matching surrounding ground triangulation; eliminates the "curled paper" floating-edge artifact at polygon boundaries.
- **Bake-time face triangulation refinement.** `cartograph/bake-ground.js`'s new `triangulateAndRefine(outer, holes, maxEdge)` iteratively splits any triangle whose longest edge exceeds `maxEdge` into 4 children via midpoint subdivision (cache shared across adjacent triangles → no T-junctions; preserves the CCW→CW winding flip). Face groups + landscape overlays emit at `REFINE_MAX_EDGE_M = 15` (≈3× the terrain texture's 5 m spacing). Ribbon bands skip refinement. LS ground bin went from ~1 MB / ~50 k verts → ~12 MB / ~395 k verts; in exchange the per-fragment interpolation error caps at ~0.45 m raw / ~0.7 m visible at V_EXAG=1.5 (was 1–2 m raw / 3–5 m visible). This is what was producing "tall foundations on flat blocks" and "paths in midair" — the face polygon's block-corner-only triangulation interpolated linearly across non-linear terrain.

**Still pending — same items, re-confirmed:**

- **Per-instance terrain config** (carried forward from 2026-05-13). `M_PER_SAMPLE`, `STENCIL_BUFFER_M`, EPQS endpoint hardcoded in `bake-terrain.js`. Extract to `cartograph/data/<scene>/terrain-config.json`.
- **Elevation exaggeration as an authored channel** (slab-completeness). `V_EXAG = 1.5` is still a hardwire — per `[Hardwires come out when channels install]` it should become a Stage slider → `design.elevationExag` → `scene.elevationExag` → BakedGround / Terrain / building displacement consume from scene.json with the paletteOverride-shape carve-out for Stage live-wire. A flatter instance dials up; a hillier one dials down. Adds one slot to the SC matrix. **Doubly important now** that the value is well-tuned for LS — the next instance will want its own.
- **`REFINE_MAX_EDGE_M` tuning point.** Currently 15 m / 12 MB bin. Aggressive desktop GPU could afford 10 m for sharper terrain conformance (~25 MB bin); mobile may want 20 m (~6 MB) to save load + GPU memory. If we land a per-Look elevation channel, this could be authored too.

Last updated: 2026-05-14 night.

---

## 2026-05-14 — Meteorologist plan: spade work before standing up the studio

SC.6 (`4176340`) installed the coupler scaffolding — `scene.clouds` channel, the Almanac evaluator at `src/lib/almanac-eval.js`, the public/clouds/ artifacts shipped — without building the v3 `<Atmosphere />` volumetric raymarched runtime. v1 keeps procedural CloudDome. This section enumerates every other piece of spade work that can land BEFORE the Meteorologist studio (the operator-facing authoring UI for cloud presets + Almanac rules) is stood up, so when it lands, the studio plugs in mechanically.

The principle: every piece below is independently shippable today — no blockers, no v3 shader dependency. Each closes a structural gap or removes a future-friction point.

### Spade work inventory

1. **Schema-derived TypeScript / JSDoc types.** `meteorologist/pipeline/schema/{teapot,almanac,weather-payload}.schema.json` exist and validate. Generate (or hand-write parallel) JSDoc-typedef declarations in `src/lib/almanac-eval.js`'s docblock so callers (and a future Stage UI) get IDE autocomplete on rule shapes, directive fields, and weather payload keys. Trivial; cuts confusion when the studio author writes their first rule.

2. **Weather payload normalizer.** `useWeather.js` today exposes `cloudCover` + `storminess` (derived from `weather_code` + `precipitation`); the Almanac schema wants a richer payload (`{tempC, cloudCover, pressureMb, humidity, windKph, windDirDeg, precipMmHr, stormDistanceKm, sunElevationDeg, sunAzimuthDeg, tod, season, precipKind}`). Land a `src/lib/weather-payload.js` that takes raw open-meteo response + `useTimeOfDay` state + `INSTANCE.geography` and emits the schema-compliant payload. Atmosphere v3 reads this directly; Almanac validation passes; nothing else changes about the runtime today.

3. **Authoring-time validator wired into bake-scene + Stage save.** `meteorologist/pipeline/validate.js` validates Teapot + Almanac against schemas; today it runs only via `npm run validate -- ...`. Pre-bake hook: when `bake-scene.js` reads `design.clouds`, also validate the referenced preset id exists in the live `public/clouds/presets.json`. Fail-loud-don't-bake on schema violations. Pre-save hook in cartograph store: same check when operator picks a preset (won't matter until the UI lands, but the action gets it for free). Saves a class of "I shipped a Look with a stale preset id" bugs.

4. **Test fixtures for the Almanac evaluator.** `src/lib/almanac-eval.js`'s 12/12 self-test from SC.6's session lived in an ad-hoc node REPL. Move it into `src/lib/__tests__/almanac-eval.test.js` (or similar) with the canonical fixtures: clear day, golden-hour, thunderstorm-active, fog, etc. Lock the evaluator's behavior so future Almanac authoring can refactor rules with confidence.

5. **Teapot library audit pass.** 52 presets scaffolded; some are WMO-canonical (cumulus_humilis, stratocumulus_translucidus), some are placeholders. Walk the list, identify which are "definitely v1," which are "v1 if we have time," which are "v2 deferral." Document the verdict in `meteorologist/CANON.md`. Lets the studio author focus on real-world tuning instead of triage.

6. **Almanac rule library audit pass.** Same shape — 16 rules scaffolded; verify they cover the LS weather distribution at a reasonable resolution. Note coverage gaps; flag overlapping rules where ordering matters.

7. **Stage "Clouds" TodChannel scaffolding (hidden).** The `STAGE_MIGRATION.md` Clouds TodChannel can land as a hidden / commented-out / behind-feature-flag row in `CartographSkyLight.jsx`. When v3 ships, flip the feature flag and the UI surfaces. Wires the channel input to the existing `clouds.values.preset` store action — no functional change today.

8. **Atmosphere mount-site placeholders.** Per `STAGE_MIGRATION.md` four CloudDome mount sites need to flip to `<Atmosphere />` when v3 lands. Today they're three (Scene.jsx, CartographApp.jsx, PreviewApp.jsx) — no toy mount, no fork. Add a `// SWAP-IN: Atmosphere when v3 lands` comment at each site; the mount becomes a one-line edit.

9. **Almanac evaluator hot-mount in cartograph.** Even though v3 isn't shipped, drop a debug-only readout in cartograph (Designer Sky & Light panel, dev-only, behind `import.meta.env.DEV`): "current Almanac preset: cumulus_humilis." Reads `selectDirective(weather, almanac, presets, override)` each frame; surfaces what v3 will render before v3 renders it. Useful for authoring rules against current weather without the shader.

10. **Cloud preset rating UI scaffold (mirrors arborist's Grove).** Arborist's Grove lets the operator rate tree variants visually. The Teapot's analog is a preset gallery showing each cloud type rendered statically (could be reference photos in v1, replaced by Atmosphere renders in v3). Lives at `/cartograph.html` → Stage → Sky & Light → "Open Teapot." Doesn't require Atmosphere; reference-photo gallery is fine for v1 spade work.

11. **Almanac rule editor scaffold.** Same shape — a `/cartograph.html` panel for editing the 16 (eventually more) rules. Reads/writes `public/clouds/almanac.json` via `meteorologist/serve.js` (port 3335 — needs adding to `npm run dev`). Validates on each save. No render dependency.

12. **`meteorologist/serve.js` wired into `npm run dev`.** Today it's not in the concurrently config. Add it as the fourth process (alongside web/carto/arb) so the Teapot/Almanac editors have a backend to talk to.

### Sequencing

Items 1–6 are pure-research / library work and can fan out in parallel — no UI dependency. Items 7–12 are UI scaffolding and benefit from doing 1–6 first (clearer schemas → cleaner UI components).

Pre-merge of LS marriage leap: 1, 2, 3 are quick wins worth landing as part of the closeout. The rest can ride concurrent tracks post-merge — Atmosphere v3 itself is the bigger lift and not gated on these.

### Cross-references

- `meteorologist/README.md` — the orientation card.
- `meteorologist/SPEC.md` — the full work order.
- `meteorologist/CANON.md` — Teapot inclusion principles.
- `meteorologist/STAGE_MIGRATION.md` — the cleanup commit spec (executes when v3 lands).
- `src/lib/almanac-eval.js` — the v3 evaluator's runtime interface, already shipped.

---

## 2026-05-13 — Terrain follow-ups (carried forward, closed above)

Last updated: 2026-05-13 night (Slab Completeness sweep nearly complete — SC.1 / SC.2 / SC.3 / SC.5 / **SC.7** all shipped; only SC.6 remains pending Jacob's strip-vs-wire decision on clouds. **Couplers §6 INSTANCE shipped** (`src/instance.js`; lat/lon + lookId + Cary SMS hardcodes retired across LS runtime; details in `ls/BACKLOG.md`). **b24fce5 build-break + elevation.js TDZ fixed** alongside §6 (vite target → es2022 + assetsInclude `**/*.bin`; terrainShader↔elevation cycle broken). Terrain magnitude now visibly too aggressive — terrain-operator follow-up filed above. SC.4 audited empty. Bake-button UX refactor flagged as post-merge cleanup. See "Slab completeness" section below.)

## 2026-05-13 — Slab completeness: ship the full authored product through the bake

**Principle (load-bearing — see FEATURES.md "The slab carries the operator's *full* authored product" + memory `slab-carries-full-authored-product`).** Everything an operator authors in cartograph must travel through the bake into `scene.json` (or another baked artifact). The deployed LS runtime trusts the slab unconditionally and cannot reach back into the cartograph store. Anything authored-but-not-baked is silently invisible to deployed users — the deployed product degrades to "operator-authored geometry + procedural-default optics," which isn't the product.

**State as of 2026-05-13 PM (mid-sweep snapshot).** Couplers §1 routed geometry-adjacent state through `scene.json` (palette, materialPhysics, materialColors, layerColors, luColors, layerVis, lampGlow, neon, bakedAt). The Slab Completeness sweep is mid-flight closing the rest. Current status per channel family:

- **Sky / lighting / celestial** ✅ shipped (SC.1, `c333e50`). `scene.{sky, ambient, hemi, dirSun, dirMoon, constellations, milkyWay}` reach production via the shared `CelestialBodies.jsx` consumer + override props. `src/stage/StageSky.jsx` retired.
- **Post-FX + grade + grain + shadow + exposure** ✅ shipped (SC.2 + SC.3, `015d8e0`). `scene.{bloom, ao, exposure, warmth, fill, mist, halo, grade, grain, shadow}` reach production via shared `src/components/PostProcessing.jsx`. envState DOM↔R3F bridge retired entirely; `src/stage/StageApp.jsx`'s PostProcessing / StageFog / StageShadows + effect-class exports retired; doubled PreviewPostFx mount removed; three Canvas `toneMappingExposure: 0.95` hardwires removed.
- **Per-shot camera + Hero motion + Browse heading** ✅ shipped (SC.5, `e8ba8d6`). `scene.{shots, browseHeading, heroSubject, heroKeyframes, heroMotion}` reach production. `browseHeading` migrated from localStorage to the store. SHOTS const semantically split into "authored knobs bake" (fov, padding, bounds, eye height) vs "runtime inputs don't bake" (Browse altitude from aspect, Street position from double-click). CameraRig fork documented as legitimate (entry-point-host divergence; not consumer drift).
- **Arch + horizon** ✅ shipped (SC.7, `a3952fe`). `scene.{arch, horizon}` reach production via the unified `src/components/GatewayArch.jsx` consumer + override props. `archState` module-scope bridge retired entirely (19 fields promoted to cartograph store; ArchHorizonControls rewired to store actions; reload-persistence finally works). `src/stage/StageArch.jsx` retired (574 LOC), `src/cartograph/DesignerArch.jsx` extracted for Designer plan-view silhouette. **Visible production change documented:** arch moves from prior hardcoded `[1470, -185, -490] @ 2.66` to operator-authored channel defaults `[~996, 0, -332] @ 1.3` — production was lying about what Stage shows; slab is now source of truth. **Last module-scope authoring bridge in the codebase, retired** per `project_authoring_is_live_production_is_static`.
- **Meteorologist clouds** ⏳ pending Jacob's decision. `public/clouds/{presets, almanac}.json` published, never consumed in production today; `CloudDome.jsx` is fully procedural. **Strip-or-wire call** per slab-completeness principle: if the Sky & Light clouds panel authors anything, the slab carries it (wire `<Atmosphere />` per `meteorologist/README.md`); if not, strip the panel — don't ship authored-but-unconsumed UI. Decision yet to come.
- **Time-of-day defaults & overrides** — SC.4 audited empty. `DawnTimeline.jsx` is a Stage-scrub UI only; no `design.time` field persists today. The field is forward-compatible in the bake (omitted, additive when added later). Revisit when DawnTimeline grows a "save default hour" or curve-override surface.

**Sequencing — four-step contract per channel.**

For each missing channel:
0. **Consumer-parity audit** (added 2026-05-13 after SC.1 surfaced the StageSky/CelestialBodies fork). Identify the production consumer in `src/components/`. Check whether Stage mounts the SAME file or has a forked `src/stage/Stage<X>.jsx` (or pump-fed sibling). If forked, the channel's work includes consolidating onto one consumer with override props — see memory `stage-consumer-parity`. Fork-by-fork as we find them; SC.1 retired `StageSky.jsx`, SC.7 expected to retire `StageArch.jsx`.
1. **Persist** in `design.json` (most are already there — Stage's autosave wires panel inputs to `useCartographStore.set...` actions that write `design.json`). Audit each channel's autosave path; close gaps.
2. **Bake** into `scene.json` (or a dedicated artifact for non-trivial structured data — e.g., clouds keep `public/clouds/{presets,almanac}.json`). Extend `cartograph/bake-scene.js` to read from `design` and emit the field. Forward-compatible per couplers plan CC.7 — existing consumers ignore unknown fields.
3. **Consume** in production via `useSceneJson(lookId)` per Couplers §1, with override props for Stage. The shared consumer reads `override ?? scene.<channel> ?? procedural-default`. Production passes no override → reads bake. Stage's mount in `CartographApp.StageEnvironment` threads `useCartographStore(s => s.<channel>)` as override → instant retint on slider drag.

**Tracking.** A channel-by-channel matrix lands here on first execution session. Suggested sub-phases:

- **SC.1 — Sky & atmosphere** ✅ shipped 2026-05-13 (commit `c333e50`). Baked: `scene.{sky, ambient, hemi, dirSun, dirMoon, constellations, milkyWay}`. Production consumer `CelestialBodies` consumes via `useSceneJson` + per-channel override props; `CartographApp.StageEnvironment` threads live store values as overrides. **Rolled in: StageSky/CelestialBodies consolidation** — `src/stage/StageSky.jsx` retired along with `SkyPump` / `LightingPump` / `preview/skyState.js` / `preview/lightingState.js`. Stage now mounts the production consumer with live overrides. Net −945 lines. Cosmetic adoption: opaque + depthTest:false sky material (Stage's was canonical); horizon band now extends past mesh edges where the production stencil portal had been clearing to `#1a1a18` (dead code — nothing was writing stencilRef).
- **SC.2 — Post-FX** ✅ shipped 2026-05-13 (commit `015d8e0`). Baked: `scene.{bloom, ao, warmth, fill, mist, halo, grade, grain, shadow}`. New shared consumer `src/components/PostProcessing.jsx` (exports PostProcessing + StageFog + StageShadows + ExposureTicker + FilmGrade + FilmGrain + AerialPerspective). Retired: `StageApp.jsx`'s PostProcessing/StageFog/StageShadows exports + effect classes (drift forks); Scene.jsx's local PostProcessing + useAdaptiveBloom + dead LensSoftness; Stage's doubled PreviewPostFx mount. **Rolled in beyond brief:** promoted `envState` (grade/grain/shadow) to full TOD channels with the standard `{values:{...}}` shape + `resolveGroupAtMinute` resolver — operator can TOD-keyframe via existing TodChannel panel UI. `src/stage/envState.js` retired. EnvironmentControls retired (passthrough wrapper); ArchHorizonControls promoted to top-level card renamed "Hero & Horizon" (kit-generic, instance-agnostic). Net −354 LOC.
- **SC.3 — Exposure / tonemapping** ✅ shipped 2026-05-13 (commit `015d8e0`, bundled with SC.2). Baked: `scene.exposure`. Consumed: Canvas `toneMappingExposure` driven from `scene.exposure` at all three Canvas mount sites via the shared `ExposureTicker` consumer; FilmGrade pass also applies `uExposure` from the same channel. Three hardcoded `toneMappingExposure: 0.95` literals removed.
- **SC.4 — Time defaults & overrides**. Audited empty as of c333e50 — `DawnTimeline.jsx` is a Stage-scrub UI only, doesn't persist anything. The field is forward-compatible in the bake (omitted). Revisit when DawnTimeline grows a "save default hour" or curve-override surface.
- **SC.5 — Per-shot camera + Hero motion + Browse heading** ✅ shipped 2026-05-13 (commit `e8ba8d6`). Baked: `scene.{shots, browseHeading, heroSubject, heroKeyframes, heroMotion}`. `browseHeading` migrated from localStorage to the cartograph store. SHOTS authored knobs (fov, padding, bounds, eye height) bake; runtime inputs (Browse altitude from aspect, Hero target from subject centroid, Street position from user double-click) explicitly do not. CameraRig audit decision: legitimate entry-point-host fork (Designer ortho + MapControls + view-toggle vs. production runtime interaction layer); ~7 split props required to consolidate, kept divergent per `project_stage_consumer_parity`'s entry-point-host exemption. Follow-up flagged: production Hero pan still rides on `HERO_CENTER`/`HERO_TARGET` literals (different animation model from cinematic keyframes); slab carries the data, production rewire is a separate sub-phase. Stage UI for per-shot fov / eye-height sliders not yet exposed; operator authors via direct design.json today.
- **SC.6 — Meteorologist clouds** ✅ shipped 2026-05-13 (commit `4176340`). Coupler scaffolding installed without building the v3 `<Atmosphere />` runtime: `scene.clouds: {preset, overrides}` channel + `src/lib/almanac-eval.js` evaluator (no production consumer yet — forward-compat for v3) + `public/clouds/{presets,almanac}.json` continues to ship (the cleanout plan's earlier strip verdict was reversed). v1 keeps procedural `CloudDome.jsx` as the actual production renderer; no operator UI in v1. Parity audit clean — CloudDome mounted identically across Scene.jsx / CartographApp.jsx / PreviewApp.jsx (no fork).
- **SC.7 — Arch + horizon tuning** ✅ shipped 2026-05-13 (commit `a3952fe`). `scene.{arch, horizon}` reach production via unified `src/components/GatewayArch.jsx` consumer + override props. `archState` module-scope bridge retired entirely (19 fields promoted to cartograph store; ArchHorizonControls rewired to store actions; reload-persistence works). `src/stage/StageArch.jsx` retired (574 LOC); `src/cartograph/DesignerArch.jsx` extracted for Designer plan-view silhouette. **Visible production change documented:** arch moved from prior hardcoded `[1470, -185, -490] @ 2.66` to operator-authored channel defaults `[~996, 0, -332] @ 1.3` — production was lying about what Stage shows; slab is now source of truth. **Last module-scope authoring bridge in the codebase, retired** per `project_authoring_is_live_production_is_static`.

Per-sub-phase verification gate: (1) operator authors a value in Stage, hits Bake (or ↻); (2) `scene.json` shows the value; (3) production staging URL renders with the authored value, defaults otherwise.

**Priority placement — LOCKED 2026-05-13: SC.1–SC.7 are all pre-merge.** Decided after the slab-completeness gap surfaced during the Couplers §1 staging verification. The seven sub-phases ship as one unit, not seven independent items: bloom + AO + grade + grain + exposure + sun curves + atmosphere all interact aesthetically, so shipping any subset would produce an inconsistent look — "operator-authored sky with default post-FX" reads no more right than "default sky with operator-authored post-FX." There is no SC.1 without SC.2–SC.7. The Phase C merge to `main` is gated on the full slab-completeness sweep landing.

**Suggested execution order (each sub-phase = three-step contract: persist → bake → consume):**

1. **SC.4 + SC.1 together** — time first (sky depends on TOD curves), then sky/atmosphere. Most visible authored layer; biggest "this looks like LS now" win.
2. **SC.3 + SC.2 together** — exposure first (post-FX thresholds depend on exposure), then bloom/AO/DOF/grade/grain.
3. **SC.5** — per-shot camera (Hero/Street positions; Browse heading slider already half-routed).
4. **SC.7** — arch tuning.
5. **SC.6** — clouds. Re-evaluate strip-vs-wire decision per the slab-completeness principle. If clouds are part of the authored product, wire `<Atmosphere />`; if not, strip the authoring panel (don't ship authored-but-unconsumed UI).

**Why not just keep live-wire from Stage to production?** Because the marriage leap explicitly severed that path (Couplers §1). The whole point of the slab is "production can't reach back into authoring." Live-wire across the seam would unravel §1 and the §1-shipped caching/perf wins with it. The correct path is bake-then-consume, with Stage's live preview retained via the per-channel override-prop pattern §1 established.

**Cross-references.**
- Memory: `slab-carries-full-authored-product` (the principle).
- `cartograph/FEATURES.md` "The Bake is the slab pour" + "The slab carries the operator's *full* authored product."
- `cartograph/bake-scene.js` header comment — has a partial gap list ("env (post-FX, exposure), arch (distance/scale), time...") that this section supersedes and formalizes.
- Couplers plan §1 — the pattern to follow per channel.
- `ls/BACKLOG.md` Phase C — the marriage-leap track this complements.

---

## v2+ — Hosted bake service with auth (post-marriage, post-v1)

**Premise.** v1 is single-operator (Jacob, local machine, git-write
access to the kit repo). The bake button runs on `localhost:3333`; the
"Publish" step is `git commit + git push` from the operator's terminal.
This is structurally safe — the deployed LS runtime has zero write
paths back to a helper, because helpers are localhost-only and the
slab is consumed read-only as static files.

The moment a *non-maintainer operator* wants to publish their own
neighborhood instance — a content partner editing `cary` or a future
`<otherhood>` — the localhost+git model breaks. They don't have git
write access, they shouldn't need it, and Jacob shouldn't be the
bottleneck on every external bake. So v2+ grows a hosted bake service.

**Shape (sketch — not specced).**

- **Service** runs the existing bake chain (`cartograph/serve.js`'s
  POST `/looks/:id/bake` route, scene-parametric) on a hosted runtime
  (Cloud Run / Lambda / similar). Same scripts as today; just deployed.
- **Per-operator auth.** Operators log in (Supabase OAuth / Clerk /
  whatever Cary settles on for its courier path — see CC.1 below).
  Each operator carries an instance scope: operator A can publish
  `lafayette-square`, operator B can publish `cary`, etc. Scope is
  enforced server-side on the bake endpoint; an operator never
  authenticates as "all instances."
- **Publish path.** Service writes the slab to a per-instance asset
  bucket (or to the kit repo's `public/baked/<look>/` on a scoped
  service-account branch + auto-merge). Either way the deployed LS app
  reads from the same URL pattern (`/baked/<look>/...`); no consumer
  change.
- **Service-account git, not operator git.** The service holds the
  write credential, not the operator. So an operator only ever needs
  a login, not a GitHub seat. Compromise of one operator account
  scopes blast radius to their instance.
- **No reverse access expansion.** The deployed LS runtime still
  doesn't call the bake service. Bake remains operator-initiated
  through the cartograph helper UI; the helper UI itself is hosted
  (so non-maintainer operators can reach it) but its API surface only
  accepts authenticated mutations within scope. Same publish-loop
  shape as v1; just with auth on the producer side.

**Why this is v2+, not v1.**

v1 ships LS as a single instance with Jacob as the one operator.
That's enough to prove the kit + slab pattern in production. A hosted
bake service is the structural move from "kit Jacob uses" → "kit
others use" — it's load-bearing for the multi-instance future
(`feedback_beautiful_first_lightweight_51`'s "be more clever" doctrine
applies: the right v2 move is hosting, not letting v1 sprawl into
multi-tenant complexity prematurely).

**Cross-cutting concerns to spec when this kicks off.**

1. **Auth shared with Cary.** Cary's hosted courier flow is the kit's
   first hosted-auth surface (Supabase phone-OTP per
   `ls/ARCHITECTURE.md §3`). The bake service's operator auth should
   reuse the same identity infra rather than introducing a parallel
   one. Couplers plan §4 (Courier) already accepts the kit-instance
   boundary; the bake service is the producer-side analog.
2. **Instance scope == coupler scope.** The set of things an operator
   can edit (their `INSTANCE.lookId`, their geography, their listings
   GAS, their courier Supabase project) is exactly the set of things
   their auth token gates. Couplers plan §6 (Place coupler) defines
   the bag; the bake service consumes it as auth scope.
3. **Service-account git vs. asset bucket.** Two viable publish
   targets. Git keeps everything in one repo (good for the kit-as-one-
   build deploy model); bucket decouples instances (good for scale).
   Decision pending demand.
4. **Audit trail.** Every published bake gets an attribution entry
   (operator id, timestamp, look id) baked into `scene.json.bakedAt`'s
   neighborhood (`scene.json.bakedBy`?). Forward-compatible per
   couplers plan CC.7's amendment pattern.
5. **Rollback.** Each operator's instance retains its last N bakes
   server-side; UI exposes "publish previous bake" without re-running
   the chain. Cheap insurance against bad bakes shipped to live.

**Not blocking anything in flight.** No work here until after the
marriage leap merges and v1 ships stable. Item lives at the top of
the BACKLOG as the v2+ northstar, not as queued execution.

---

## 2026-05-13 — Loop streets L.0 + L.1 shipped; L.2 emitter is next

L.0 spec lock (definition, three topologies, per-role cross-section,
`overlay.loops` + denormalized per-chain hint data shape, auto-detect +
operator-override semantics, smooth-preview bundled scope, ribbon-control
inner/outer scope) landed in `cartograph/NOTES.md` 2026-05-10 "Loop streets:
L.0 architecture lock". L.1 toy fixtures (Benton-toy teardrop + Waverly-toy
couplet) landed in `src/data/toy/toy-input.json` with re-derived
`toy-ribbons.json`; the two new chain sets render as ordinary residential
ribbons because the emitter is not yet loop-aware (visible-bug coverage
expected only after L.2).

**State entering L.2:**
- V1 `LOOP_STREET_NAMES = ['Benton Place', 'Mackay Place']` at
  `derive.js:1297` is wrong (Mackay is not a loop; Waverly is) and dead
  in production post-V2 (the loop-cut + median-creation paths land in
  `map.json` which `bake-ground.js` doesn't read for blocks).
- Toy carries one Type-A and one Type-B fixture for the emitter to
  validate against; loop role + oneway annotations are on the input
  chains but derive-toy.js doesn't propagate them — L.2 wires that and
  teaches `buildBlockGeometryV2` to honor `chain.loop.role`.
- Sequencing rule per `feedback_d3_bundling_failure_modes`: keep
  producer (V2 emitter) and consumer (renderer/UI) changes commit-able
  separately; do not bundle L.2 emitter work with L.3 UI.

**Open question for the L.2 author:** smooth bake-into-points
(BACKLOG Phase 7's open ½-hour task) bundled into L.2 or split? Per
L.0 spec it's bundled — loop bodies make the smoothness gap visible
fastest. Confirm at session start with Jacob if uncertain.

See "Loop streets (L.0 through L.6, in flight)" entry below for full
phasing + sequencing rules + LS migration plan (Benton + Waverly +
`*Place` audit sweep).

---

## 2026-05-13 evening — Neon LS-scale visibility (provisional fix landed, authoring pass queued)

Background: commit `20ef7b1` swapped LS production's per-Building inline
`NeonBand` (MeshStandardMaterial, `emissiveIntensity=4.0`, visible-but-ugly)
for the new shared `<NeonBands>` shader (ShaderMaterial + AdditiveBlending +
Gaussian core/tube/bleed masks, beautiful-but-thin). The new shader was only
validated in **toy** (~36m × 68m, camera ~70m away, log-depth + close
framing); at LS Browse/Hero/Street it was invisible.

**`6aef522` — Provisional shader constants pumped to guarantee LS-scale visibility:**
- `TUBE_RADIUS`: 0.06 → 0.20m (~8" — thinner went sub-pixel from Browse altitude)
- `ROOF_LIFT`: 0.05 → 0.30m (clears parapet + 24-bit z-noise; production Canvas does NOT have `logarithmicDepthBuffer` — only Cartograph + Preview do, per `4c53f19`)
- Frag-shader emissive `* 4.0` multiplier matching the OLD inline `emissiveIntensity`
- Reverts the magenta-bypass + `alpha=1` diag from `33dcbf0`; restores real Gaussian path
- `[neon-diag]` and `[neon-pump]` console logs intentionally left in place pending authoring pass

**Toy is not a proving ground for LS-scale visibility.** Same pattern as
[[feedback_preview_uses_production_pipeline]] but pointed at the *aesthetic*
side: toy's small scene + close camera made the shader look right while
hiding two LS-scale failure modes (sub-pixel tube coverage, 24-bit z-fight
against rooftops without log-depth). Next time a visual-quality shader
lands via toy, exercise it in Cartograph Stage on the **LS scene** at
Browse/Hero/Street before declaring it "looks good." Logged as
[[feedback_toy_not_proving_ground_for_ls_visibility]].

**Open question (deferred):** production `src/components/Scene.jsx`'s Canvas
does not set `logarithmicDepthBuffer`. `4c53f19` only enabled it on
Cartograph + Preview. With production at `near=1 / far=60000` and Browse
altitudes 200–600m, the same z-precision tax that motivated log-depth
elsewhere is still in play. Audit + decide whether to flip production on,
separately from neon.

### Tomorrow — Neon authoring controls

Replace the provisional hard-coded constants with Cartograph authoring
surfaces so visual tuning happens in-tool without redeploys:

1. **Cartograph store extension** — add `neonTube` channel (or extend
   `neon` itself) with three values: `radius`, `roofLift`, `emissive`.
   Defaults match the provisional values (0.20 / 0.30 / 4.0).
2. **`NeonBands.jsx`** — accept the three values via uniforms
   (`uTubeRadius`, `uRoofLift` are actually CPU-side — radius needs to
   rebuild geometry on change, lift can be uniform; emissive is pure
   uniform). Wire `uEmissive` through `_neonUniforms` alongside
   core/tube/bleed; geometry rebuild driven by `radius` + `roofLift`
   changes via `useMemo` deps.
3. **`NeonPump`** — write the three values per-frame (or the new ones
   that aren't already pumped).
4. **Sky & Light panel** — new section next to the existing Neon
   group-of-3 channel: three single-value sliders for tube physics.
5. **"Force Neon On (test)" toggle** — Designer/Stage authoring aid so
   neon shows regardless of TOD + business hours. Drives the existing
   `forceOn` prop path or a new test-only uniform. Off by default;
   never persisted.
6. **Strip diagnostics** — `[neon-diag]` (LafayetteScene openPlaces),
   `[neon-pump]` (NeonBands useEffect), and the PROVISIONAL inline
   comments in NeonBands.jsx come out once the authoring loop is
   verified at LS Stage Browse/Hero/Street.

Acceptance: operator can scrub the Force-On toggle, see neon appear
on all 14 LS places, drag the three sliders, see live shader response,
and Publish the look — bake captures the values into `scene.json.neon`
just like the existing core/tube/bleed triple.

## 2026-05-13 PM — Session-end pin (read first)

LHF pass off the 2026-05-13 v1 punchlist. Fourteen commits on
`cartograph-looks-pass-ab` covering bake speed, camera framing, park
rendering, treelawn-by-LU, and a project-wide depth-precision fix
with accompanying layering canon.

**Late-session arc** (after the eight initial commits below):

- **`cfa6b01` + `5dbf4b6`** — Treelawn matches adjacent parcel LU,
  bake + Designer V2 parity. Per-LU keys (`treelawn:residential`,
  `treelawn:park`, etc.); grass-LUs route through `GrassMesh`,
  others through `FadeMesh`; adjacent-block lookup is coordinate-
  based (ringInteriorProbe + point-in-polygon) since
  `fe.blockKey` (pass-1) drifts from `b.blockKey` (pass-2) when
  asphalt widens via Measure customs.
- **`bfff852`** — Trinity update capturing the dirty-skip + grass
  polygonOffset + park-bridge + treelawn architectural rules.
- **`f14a5af`** — Bake excludes park-LU blocks from path-eligible
  parcels. `LafayettePark.jsx`'s `ParkPaths` (gravel shader) is the
  sole park-path renderer; baked `footway`/`path` duplicates that
  were poking through water at certain camera heights are gone.
- **`052b9d3` (reverted by `e341cf6`)** — Naive per-material
  `patchTerrain` on park materials caused Browse depth-precision
  snap-off at high altitude even though `terrainExag=0` in Browse
  meant displacement was functionally zero. Wrapping per-vertex
  terrain shader code interacts with depth precision in subtle
  ways. Replaced with rigid uniform lift below.
- **`e341cf6`** — Park rides terrain as a rigid body via
  `group.position.y = getElevation(0, 0) * terrainExag.value` per
  frame. Hero/Street sinking fixed; Browse depth precision left
  alone.
- **`4c53f19`** — **`logarithmicDepthBuffer: true`** on Cartograph
  and Preview Canvases. The real fix for "water disappears at
  altitude" — redistributes 24-bit depth precision so sub-meter
  separations remain resolvable at any reasonable distance. ~5%
  perf cost, acceptable. Paired with a new
  **"Layering / coplanar stacking / depth precision" canon** in
  `cartograph/FEATURES.md` codifying the four mechanisms
  (geometric Y / polygonOffset / Designer Y-lift / renderOrder)
  plus the fifth axis (depth-buffer precision) and decision rules.

**Memory adds this arc:**

- `feedback_orphan_audit_full_repo` (user-authored) — orphan-data
  audits must grep arborist/ + meteorologist/ + apps-script/ and
  .mjs/.cjs/.py too. Got bit when `park_species_map.json` was
  quarantined in a docs-fortification pass and bake-trees ENOENT'd.
  Always quarantine before delete, audit the full repo first.

**Trinity housekeeping:**

- Trinity moved to `cartograph/FEATURES.md` / `cartograph/ARCHITECTURE.md` /
  `cartograph/BACKLOG.md` (user's docs-fortification pass). Memory
  paths updated; LS consumer trinity in `ls/` referenced via root
  README.
- FEATURES.md gained sections for: async bake handler, content-aware
  writes (dirty-skip), treelawn-by-LU, GrassMesh polygonOffset
  parity, park-path auto-bridge, and the layering canon.
- ARCHITECTURE.md gained a `writeIfChanged + patch-output-ordering`
  convention entry.

---

LHF pass off the 2026-05-13 v1 punchlist. Eight commits, all on
`cartograph-looks-pass-ab`:

**Shipped (in commit order):**

- **Async bake handler + per-look in-flight lock** (`61eea3f`) —
  `cartograph/serve.js`'s POST `/looks/:id/bake` swapped from
  `execSync` to a `runShell` Promise wrapper around `spawn`; the
  Node event loop keeps serving `/api/cartograph/*` requests during
  a bake. `_bakesInFlight` Set rejects concurrent bakes against the
  same Look with `409`.

- **Stage button respects `lastStageShot`; canonical post-bake
  framing** (`f45cda2`) — `Toolbar.jsx`'s Stage → button reads
  `lastStageShot` from the store (already persisted to localStorage)
  instead of hardcoded `'browse'`. `CartographApp.jsx`'s
  Designer→Stage camera transition drops the ortho-pan-preserve
  branch — all non-Designer entries land at canonical
  `SHOTS[shot].position` (was producing random off-center framing
  post-bake). Vestigial `StageCamera` import + stale comment
  cleaned up. Browse→Designer reverse pan-preserve is intentionally
  kept (different workflow: "I was just looking at this in Stage,
  drop me at the authoring view of THIS patch").

- **Content-aware writes for bake chain** (`7bbef54` + `766fe37`) —
  Two-commit fix. `cartograph/io.js` exports `writeIfChanged(path,
  content)`: skip the write on byte-identical content AND touch the
  output's mtime to "now" so `needsRebuild` sees the chain as stable
  after a no-op build. Without the mtime touch, editing a source
  script (`pipeline.js`, etc.) permanently invalidated downstream
  artifacts. Wired through `serve.js`, `pipeline.js`, `bake-ground`,
  `-buildings`, `-lamps`, `-scene`, `-ground-ao`, and
  `promote-ribbons.js`. Dead `generatedAt: Date.now()` fields
  stripped from cartograph bake outputs (nothing read them; they
  defeated byte-equality). `promote-ribbons.js` backup snapshots
  retired (39 .backup-* files on disk; gitignored; git is the
  source of truth). `bake-ground-ao.js` reorders patch-then-output
  so the manifest patch isn't strictly newer than the lightmap PNG.
  **Verified on LS: first bake ~50s (stamps the chain), subsequent
  no-op bake returns in 1ms with everything in `skipped`.**

- **Park paths: auto-bridge + polygonOffset** (`23cc128`) —
  `LafayettePark.jsx`'s `ParkPaths` partitions paths at mount time:
  for each path, sample segment midpoints; majority over water
  (lake.outer minus lake.island, or grotto) → bridge, render at
  `PATH_BRIDGE_Y` (0.5) above water and island top; otherwise
  `PATH_LAND_Y` (0.4). Path material gains `polygonOffset
  factor/units = -1` so the lake-perimeter path stops z-fighting
  with the bank. No `park_paths.json` authoring needed; manual
  override flag (`bridge: true`) could ride on top later.

- **BakedGround grass material gets per-group polygonOffset**
  (`c20b706`) — `GrassMesh` was missing the polygonOffset that
  `FadeMesh` had, so grass-shaded faces (residential, park,
  recreation; lawn, treelawn, median) z-fought with adjacent
  FadeMesh faces and rendered invisibly in Stage. One-block fix
  in BakedGround mirroring the FadeMesh material setup.

- **Treelawn matches adjacent parcel LU — bake side** (`cfa6b01`) +
  **Designer side** (`5dbf4b6`) — Bake emits treelawn under per-LU
  keys (`treelawn:residential`, `treelawn:park`, etc.); each
  variant inherits the parcel's authored `luColors[lu]`. Grass-LU
  variants (residential / park / recreation) route through
  `GrassMesh`; others through `FadeMesh`. Designer V2 does the
  same per-LU bucketing for parity. Adjacent-block lookup is
  **coordinate-based** (point-in-polygon on
  `ringInteriorProbe(fe.treelawnRings[0])` against `v2.blocks`)
  rather than a `blockKey` join — pass-1 fee keys drift from
  pass-2 block keys when asphalt widens via Measure customs (the
  key join missed ~80% of fees on LS; coordinate probe attributes
  ~70% on the first pass, remainder are legitimate caps/edges).

**Memories saved this session:**

- `project_doped_artifact_placecard_edit_pattern` — system-wide
  rule: cartograph seeds best-guess defaults (heuristic /
  source-data import); end-user refines per-entity via PlaceCard.
  Never propose bulk heuristic flatten or operator one-off authoring
  in cartograph dev tooling — duplicates PlaceCard infrastructure
  that already exists.
- `project_writeifchanged_touches_mtime` — content-aware writes
  MUST also `utimesSync` on the byte-identical branch, or every
  script edit cascades into permanent rebuilds. Plus the ordering
  rule: bake scripts that patch another step's output must write
  the patch FIRST, their own output LAST.

**Known follow-ups (not blocking LS):**

- **Roofs damaged-subset fix** tabled pending the PlaceCard
  elaboration + data-route session. Investigation found 0 authored
  `roof_shape` fields on any building; every roof shape today is
  heuristic output. Surgical one-offs rejected (grueling, per
  past sessions); heuristic-wide flatten rejected (kills correct
  mansards/hips). Correct route: dope the artifact with heuristic
  seed, end-user refines per-building via PlaceCard. Holds until
  the PlaceCard data route is stood up.
- **Heading slider on cartograph Browse** — `CartographApp.jsx`'s
  Designer→Browse transition uses static `SHOTS.browse.up = [0, 0,
  -1]` and ignores the Heading slider. StageCamera in /preview does
  honor it via `browseUpFromHeading(getBrowseHeading())`. Cartograph
  side wasn't observed broken this session (user had heading=null)
  but the gap is real; queue if heading authoring ever moves into
  cartograph.

**Next session direction.** Lane-spawn for divided traffic
(symmetric expansion despite `anchor: inner edge`), corner revert
two-tier, or bake-time arc smoothing (Phase 7's bake-propagation
TODO). All Tier-2 LHF.

---

## 2026-05-13 — Session-end pin (LS end-to-end pipeline, superseded by PM pin above)

LS is **up and running** end-to-end through the canonical pipeline. The
ground bake is scene-parametric, Stage and Preview consume the same
slab, the missing non-street ribbons are back in Designer (better than
before — shared geometry with the bake), and the operator has authoring
control over alley terminations. Toy bakes structurally clean but
renders empty because it has no dummy data authored yet — separate
session.

**Shipped (in commit order):**

- **bake-ground.js scene-parametric** — `loadSceneStencil(scene)`
  replaces the module-top `_stencil = JSON.parse(...lafayette-square...)`
  read; the scene's `neighborhood_boundary.json` drives clip polygon,
  AO bbox, and the manifest's `stencil` block. When no `fade` /
  `streetFade` fields are authored, `manifest.stencil = null` — BakedGround
  already handled null cleanly. Ribbons input also scene-keyed: LS
  keeps `src/data/ribbons.json`; other scenes read
  `src/data/<scene>/<scene>-ribbons.json`. LS regression-clean (35
  groups, 1.7MB, soft-circle preserved); toy bakes (9 groups, 184KB,
  rectangular silhouette, no fade).

- **`cartograph/data/toy/neighborhood_boundary.json` authored** —
  rectangular 360×360 boundary at origin, no `fade` / `streetFade`
  fields. Mirrors Designer-side `TOY_STENCIL` in `CartographApp.jsx`
  SCENE_REGISTRY (kept in sync; if you change one, change both).

- **BakedLamps promoted to `src/components/`** — was preview-only; now
  shared between Stage and Preview. Mirrors `InstancedTrees`' look
  resolution pattern (`look` prop → cartograph-store `activeLookId` →
  URL `?look=` → `'lafayette-square'`), re-fetches on store
  `bakeLastMs` change so Stage's "↻" propagates without hard reload.
  LS Stage now mounts `<BakedLamps />` instead of `<StreetLights />`.

- **Highway visibility flipped on** — `layerVis.highway` was `false`;
  bake correctly emitted the 806-tri highway group but BakedGround
  honored the layer flag and hid it. Flipped to `true`, re-baked
  scene.json.

- **Non-street ribbons live in Designer** — alleys + footways +
  cycleways + steps + dirt paths went missing in Designer when V2 took
  over (MapLayers retired its alley/footway render 2026-04-22 expecting
  StreetRibbons V1 to own them; V1 isn't mounted on LS anymore). Fixed
  via new `src/lib/buildPathRibbons.js` shared helper — bake-ground.js
  and `BlockGeometryV2Debug.jsx` both consume it, structurally
  impossible to drift. Uses Clipper's `ClipperOffset` with `jtRound`
  joints (no self-intersection at sharp bends) and `ArcTolerance=25`
  (= 2.5cm — smooth at typical viewing zooms). Five Stage Surfaces
  toggles for the individual kinds were already in the Paths panel;
  they now actually do something on the live render.

- **Paths clipped to parcel interiors** — `intersect: block.ring −
  curbBands − ped frontageBands` so paths terminate at the sidewalk's
  inner edge, no trespass on the ped zone or curb stroke. `differenceRings`
  + `intersectRings` exported from `buildBlockGeometryV2.js` for the
  helper to consume.

- **Universal alley end-cap dial** — Designer Panel → Paths section →
  Shape subsection. Three modes:
  - `square` (default) — `etOpenButt`, flush cut at endpoint
  - `rounded` — `etOpenSquare` + morphological-opening fillet by
    `halfWidth × 0.4` for a rounded-rectangle pad silhouette
  - `round` — `etOpenRound`, true semicircle
  Stored in `design.json` as `alleyCap`; hydrated + persisted via store
  alongside `curbWidth` / `cornerRadiusScale` / etc. Bake reads
  `design.alleyCap`. Other path kinds keep their per-kind defaults
  (`round` for footway/cycleway/steps/path).

**Architectural decision (logged for next reader):**

- **Buildings deferred from baked-on-Stage swap — side-burner until
  product port.** Stage's `LafayetteScene` reads live `_allBuildings`
  for per-building interactivity (place state, neon, click handlers).
  Neon specifically draws from active data, so the live-data path is
  load-bearing for the current authoring experience. The bake's
  `buildings.json` is a merged opaque mesh with no per-building IDs —
  built for Preview's GPU-perf proof. Both consume the same authored
  source (`src/data/buildings.json`); not divergent content, just two
  runtime shapes for two roles. **Timing:** revisit when porting the
  product (LS-app integration takes the wheel; decides whether place-
  state interactivity rides baked geometry or stays in live data). Until
  then, side-burner — don't touch.

**Memories saved this session:**

- `feedback_preview_uses_production_pipeline` — Preview/Stage MUST
  consume baked artifacts (arborist trees, bake-buildings, bake-lamps,
  water canonical source); scene-only placeholders like ToyTrees /
  ToyBuildings are Designer aids, NOT what Preview should see.
- `feedback_designer_ylift_stacking` — Designer stacks ground layers
  by tiny Y-lift (0.01m increments), NOT PRI / polygonOffset. PRI is
  for the bake's renderOrder; sibling Designer meshes at identical Y
  are coplanar regardless of PRI. New layer? Pick a Y slot above what
  you paint over. Got burned adding paths at yLift=0 (geometry built,
  invisible) — lifting to 0.05 fixed it instantly.
- `project_v2_block_ring_extends_to_asphalt` — V2's `blocks[].ring`
  extends to the rounded asphalt edge, NOT the sidewalk's inner edge.
  Bands (curb + treelawn + sidewalk) paint ON TOP. To clip something
  to "parcel interior", subtract `curbBands ∪ frontageBands.{treelawn,
  sidewalk}Rings` from `blocks[].ring`.

**Known follow-ups (not blocking LS):**

- `bake-buildings.js` and `bake-lamps.js` accept `--scene` but capture
  to `_scene` (unused) with `TODO(0e-followup)` markers. For the toy
  publish session, both need scene-keyed source paths.
- Toy publish needs dummy data authored first: elevation, labels,
  buildings, trees, street markings, possibly water. Toy is a
  constituent neighborhood, not a placeholder.
- Arborist's tree bake writes `public/baked/default.json` —
  scene-shared today. For multi-scene publish, arborist needs
  scene-keying or a parallel toy-trees bake step.

**Next session direction: Toy publish (data first).** With LS proving
the canonical pipeline works end-to-end, toy can be authored as a real
neighborhood dataset and routed through the same Bake button. Likely
sub-phases: (1) dummy elevation + buildings + trees + lamps fixtures
under `src/data/toy/`, (2) wire `bake-buildings` / `bake-lamps` /
arborist trees to read scene-keyed inputs, (3) replace toy's React
placeholders (`ToyBuildings`, `ToyTrees`) with the canonical
bake-consuming components, (4) Preview toy and prove the slab.

---

## 2026-05-12 EOD-2 — Session-end pin (superseded by 2026-05-13 on the Stage/Preview parity question; EOD-1 below also current on Measure)

Designer's "Design" view now renders the same soft-circle silhouette
Stage and Preview show, and V2 blockFill no longer drops faces that
straddle multiple blocks. Operator marker-tool gaps resolved.

**Shipped (in commit order):**

- **Soft-circle silhouette `3dddf39`** — `BlockGeometryV2Debug.jsx`
  routes per-material fade through module-level `FACE_FADE`
  (758..892, face band) and `BAND_FADE` (800..1000, street band)
  sourced from `boundary.js`. `useBoundary` prop gates per-scene —
  LS turns it on, toy stays rectangular. `CartographApp.jsx` passes
  `useBoundary={sceneCfg.useBoundary}` through. `boundary.js` gains
  `clipPolylineToBoundary(points)` — segment-level clip helper
  reused by `MapLayers.jsx` for the debug centerlines and barrier
  lines (LineBasicMaterial doesn't accept the radial-fade shader,
  so polygon-clip is the right tool).

- **V2 blockFill face-straddle fallback `af39cc8`** — in
  `buildBlockGeometryV2.js`, the `findOwningBlockRing` fast path
  assumed `face ⊂ ownBlockRing`. 85 of 178 ribbons.faces (48%) on
  LS violated that (faces spanning two blockRounded rings, corner
  slivers eaten by asphalt union, multi-block faces). Centroid
  attribution emitted only the owning ring's portion; the rest were
  silently dropped, leaving the transparent LU gaps the operator
  flagged with the marker tool. Added `faceStraddles` per-vertex
  check; falls back to global `differenceRings([face.ring], asphaltRounded)`
  when any vertex falls outside the centroid-owning ring.
  `out.blocks` count: 145 → 168 (+23 rings recovered). Fast path
  preserved for the common single-block-face case per the
  `feedback_clipper_narrow_the_mask` memory.

**Architectural rules saved as memories this session:**
- `feedback_stencil_work_needs_stronger_gates` — enumerate the
  alpha-composite stack across radially-faded layers before any
  agent dispatch near the silhouette; renderOrder analysis is the
  trap (transparency interactions don't follow PRI).
- `feedback_agent_handoff_must_carry_prior_decisions` — when
  follow-up agents chase a regression caused by an earlier agent in
  the same session, the brief MUST cite the prior changes + the
  user's hypothesis verbatim, not make the new agent re-derive from
  git.

**Next session direction: Stage + Preview baking.** Measure
authoring is in; soft circle is in; LU coverage is in. Ready to
hand the slab to Stage QA.

---

## 2026-05-12 EOD-1 — Session-end pin (also current)

Closes Measure end-to-end on LS. Walker + customs identity + UI all
read and write the same `[blockKey][edgeOrd]` shape; "band moved, plug
stayed" mismatches structurally impossible.

**Shipped (in commit order):**

- **D.7a `249e3cf`** — per-chain asphalt emission consumes
  `[blockKey][edgeOrd]` customs via a two-pass `emitChain` helper.
  Pass 1 with chain defaults builds the feLookup; pass 2 re-emits any
  chain whose fes have a custom and rebuilds asphalt + block + feLookup.
- **D.7c `1f6b7b5`** — `MeasurePanel.jsx` numeric input + reset paths
  migrated from `setBlockCustomMeasure` (legacy `[chainIdx][segOrd]`)
  to `setBlockEdgeCustom([blockKey][edgeOrd])`. New store action
  `clearBlockEdgeCustomsForChain` walks `_v2FrontageEdges` by chain
  identity to drop the right entries. `buildChainBandsLive` extended
  with treelawn/sidewalk edge polylines so the selected chain's
  colored edge strokes track live drag.
- **D.7d `7da1cb7`** — deleted `setBlockCustomMeasure`,
  `adjacentBlockId`, per-chain `byChain.{tl,sw}Rings + Edges` emission
  (replaced by frontageBands), and inlined `chainStripBandExt`.
  ribbonUnion's ped-zone coverage swapped to `frontageBands.flatMap`.
- **Identity match `8594b2f`** — `findFeForSide`,
  `hasAnyChainCustom`, and `clearBlockEdgeCustomsForChain` accept
  `st.skelId || st.id || null` (was: skelId only). Symptom this
  resolved: divided-style chains (LS Park Avenue) falling through to
  name-match and picking a fe on the wrong carriageway.
- **Walker `assignSegOrdsToFes` `9567664`** — single-pass per-chain
  segOrd assignment: every natural segment goes to its unique closest
  fe (clamped `t ∈ [0, 1]`, tie-break by edgeOrd). Eliminates both
  leakage and `segOrds:[]` gaps. Park Avenue's previously-bailing
  segOrd 2 now resolves cleanly.
- **CornerEditHandles `3b804c1`** — `resolveSrefChain` helper with
  nearest-vertex fallback when `sref.ix` is stale (~36% of LS IXs).
  Mirrors V2's `resolveIxRef` exactly. Restores LS corner dots that
  silently vanished on stale-ix chains.
- **Measure visualization `db0228e`** — three coupled UX changes:
  (a) default `measureMode` flipped to `'global'` (whole-chain);
  (b) `selectedAdjacentBlockKeys` rewritten as geometric proximity
  via chain SEGMENT MIDPOINTS (not chain.points) against block-edge
  perpendicular distance — robust to walker fe-coverage gaps and
  excludes end-on blocks across terminal IXs by construction;
  (c) per-block mode narrows translucency to the two blocks at the
  click anchor; asphalt-edge curb-colored stroke routes through
  `buildChainBandsLive.asphaltEdges` so the pavementHW handle has a
  visible boundary line while the curb mesh stays hidden.

**Architectural rules saved as memories this session:**
- `feedback_stale_opaque_overlay_worse_than_hidden` — during spatial
  authoring, hide elements that can't track the live drag rather than
  show stale geometry; stale opaque overlays compete with the
  translucency-on-aerial alignment workflow.

**Known follow-ups (not blocking):**

- `blockLandUse[blockKey]` shifts when customs widen asphalt (same
  root cause D.7a's pass-1 preservation papers over for fees). Symptom:
  block changes color after a wide custom because the new `blockKey`
  doesn't match the operator's stored entry. Same preservation pattern
  would fix it: carry pass-1 blockKey onto pass-2 block records.
- D.7b ("retire `selectedStreet == null` gates on curb + corner plugs")
  deliberately NOT shipped. Per `feedback_stale_opaque_overlay_worse_than_hidden`,
  retiring the gates without making curb/plugs track the live drag would
  show stale geometry during selection — worse than hidden. Real fix:
  extend `buildChainBandsLive` to also emit a live curb + corner plug
  for the selected chain. Queued.
- The diagnostic verbose bail log on `findFeForSide` miss (commit
  `f114a24`) lives on. Gated on `window.__customDebug`, no runtime
  cost. Strip in a release-prep cleanup pass.

**Next session: bake for Stage + Preview.** Measure authoring is in;
move to Stage QA + the slab pour.

---

## 2026-05-11 EOD-2 — Session-end pin (walker semantics — superseded by 2026-05-12 on Measure UI surface)

V2 walker corner detection swapped from purely-geometric (30° angle
threshold) to identity-driven (chain-ownership-per-segment). This was
the bug behind the HW3 saw-tooth seam in toy and — more critically —
the upstream blocker behind D.7a's observability gap. Once the walker
produced stable (chain, side, segOrd) identity, D.7a's customs flow
through to corner geometry and adjacent legs after release/deselect.

**Shipped:**

- **Walker: chain-ownership-per-segment corner detection**
  (`buildFrontageEdges` in `src/lib/buildBlockGeometryV2.js`).
  For each block-ring segment, probe outward for the owning chain.
  Vertex is a corner iff owning chain differs across it. Old 30°
  angle test retained ONLY as fallback for stencil/parcel-only
  vertices (both sides null-owned). Chain interior bends — HW3
  saw-tooth's 45° jogs, VW3's NE bend — now flow through as one
  continuous block-edge instead of splitting into per-bend frontage
  edges. The band seam at the bend goes away because `computePerps`
  miters cleanly inside one polyline.

- **`resolveChainSegmentation(streets)`** — exported helper, returns
  `Map<street, Set<pointIdx>>` of IX vertices identified by
  coordinate-match (≥2 chains share a point within 0.5m). Single
  source of truth for IX identity per chain. Used by `naturalSegments`,
  walker, `chainSegOrdsAlongEdge`, `cornersAtIx`, `buildChainBandsLive`,
  and `MeasureOverlay.naturalSegmentOrdinal`. All sites route through
  this resolver; stale `intersections[].ix` integers no longer trusted.

- **Index-translation fix: fees enriched with `chainSkelId` + `chainName`**
  in `BlockGeometryV2Debug.jsx` before stash. `MeasureOverlay`'s
  `findFeForSide` now matches by skelId (with name fallback), not by
  chainIdx — required because `centerlineData.streets` (skeleton
  order, N entries) ≠ `liveRibbons.streets` (ribbons order, M entries
  with divided carriageways). Toy hits this hard (M=15 vs N=9). The
  same translation (`selectedRibbonsChainIdx` memo) threads to every
  `byChain[selectedStreet]` consumer in `BlockGeometryV2Debug.jsx`.
  This was the upstream "every drag bails at findFeForSide" symptom
  the D.7a author noted.

- **segOrd uniqueness in `chainSegOrdsAlongEdge`** — probe by natural-
  segment MIDPOINT only (not by any point in segment); tolerance
  adaptive to chain's pavementHW (`max(12, hwMax + 25)`) so wide
  customs don't push the midpoint out of a fixed band; AND require
  projection `t ∈ [0, 1]` (no clamping) so adjacent natural segments
  don't leak in via clamped-endpoint distance. Each (chain, side,
  segOrd) now resolves to exactly ONE fe. Previously first-wins
  (`findFeForSide`) and last-wins (`buildChainBandsLive`'s
  `feBySegSide` overwrite loop) disagreed when multiple fees matched,
  so the operator wrote to one block and the live overlay read from
  another. Structurally impossible now.

- **D.7a customs identity preservation across pass-2 rebuild**
  (`buildBlockGeometryV2.js` main pass). After pass-2 widens chains
  with customs, the rebuilt `frontageEdges` have NEW polylines AND
  NEW `(blockKey, edgeOrd)` keys — block bbox center shifts as
  asphalt expands; `blockKeyFromRing` rounds to 0.5m so a 2m+
  pavementHW change flips the key. The operator wrote customs
  against pass-1 keys. Without preservation, `cornersAtIx` reads
  pass-2 feLookup and the lookup misses what the operator wrote;
  corners stay at defaults even after V2 rebuilds. Fix: after the
  pass-2 rebuild, match each pass-2 fe to its pass-1 counterpart by
  `(chainIdx, segOrds[0], side)` (stable triple) and copy
  `(blockKey, edgeOrd)` forward. cornersAtIx + the stashed
  `_v2FrontageEdges` both route through stable identity; render
  geometry tracks pass-2 positions.

**Verified:** VW2 mid-segment curb drag — band moves during drag,
corners + curb + side legs update after release/deselect, no key drift
across repeated drags (no orphan accumulation in `blockCustoms`).

**Known follow-ups (not blocking):**

- **`MeasurePanel.jsx:200` still writes legacy `blockCustoms[chainIdx][segOrd][side]`
  schema** — produces orphan-format entries that new (blockKey, edgeOrd)
  consumers ignore but don't break on. The D.7c migration to
  `setBlockEdgeCustom` should land before the panel is exercised
  heavily.
- **`blockLandUse[blockKey]` lookup also shifts when customs widen asphalt**
  — same root cause as the D.7a key drift the pass-1 preservation now
  papers over for fees. Symptom: a block changes color after a wide
  custom because `blockLandUse[old_key]` is set but the rebuild
  produces `new_key`, falls through to hash default. Same preservation
  pattern would fix it: carry pass-1 blockKey onto pass-2 block records.
- **HW3 saw-tooth visual eyeball check** in toy — the walker fix
  should make treelawn / sidewalk / curb continuous through both
  45° bends. Quick visual confirmation outstanding.
- **D.7b (retire `selectedStreet == null` gates on curb / cornerAsphalt /
  cornerSidewalkPads)** and **D.7c (migrate MeasurePanel.jsx to
  `setBlockEdgeCustom`)** — both originally queued behind walker fix.
  Walker is landed; those are unblocked.

**Memories saved this session:**
- `feedback_walker_corner_detection_is_identity_not_angle`
- `feedback_index_mismatch_centerline_vs_ribbons`
- `feedback_d7a_blockkey_drift`
- `feedback_segord_uniqueness_via_midpoint_test`

---

## 2026-05-11 EOD-1 — Session-end pin (perf pass — still current)

V2 build perf pass landed. Cartograph was unusable for tool work — every
click-to-select triggered a 50-70s V2 rebuild. Six wins, ~33× speedup
total. Doc trinity is current; Phase 2 of authoring-asphalt is the
follow-up.

**Shipped:**
- **Spatial index over chain segments** (`src/lib/buildBlockGeometryV2.js`
  `buildChainSegmentIndex` + threaded into `findAdjacentChainForBlockEdge`).
  30m uniform-grid; object-identity dedup. Drops the adjacency probe
  from O(streets × segs × probe-steps) to O(few candidates per probe
  cell). Memory `feedback_polygon_walking_needs_spatial_index` resolved.
- **`buildFrontageBands` clip narrowed** — instead of intersecting each
  band ring with the global `blockRounded` (~80 rings), look up the
  fe's owning block ring via `fe.blockKey` and intersect against that
  one ring only. **33s → ~30ms.**
- **`blockFill` clip narrowed** — for each OSM face, centroid-in-ring
  lookup picks its owning `blockRounded` ring; intersect against that
  instead of differencing against global `asphaltRounded`. Falls back
  to old path when no unique owning ring (toy's single envelope face).
  6.6s → 0.84s.
- **Phase 1: `perChainAsphaltClip` skipped behind `PHASE1_SKIP_PERCHAIN_CLIP
  = true`.** This clip is authoring-only (bake + Stage + Preview read
  `asphaltRounded` directly; only Designer's per-chain selection overlay
  consumed the clipped rings). 10s → 0ms. **Visible cost:** per-chain
  asphalt rectangles in Designer overshoot the rounded silhouette by
  1-2m at IX corners. Jacob confirmed acceptable for authoring; corners
  noted as "not broken, just rough."
- **Environment pumps gated `!inDesigner`** (`src/cartograph/CartographApp.jsx`
  lines 757-758, 893-896). LightingPump, SkyPump, NeonPump, LampGlowPump,
  TimeTicker, SkyStateTicker no longer tick per-frame in Designer (where
  the 3D environment is gated invisible already). Panel previews
  re-resolve locally; no functional change. Comment at line 488 ("shot-
  only") matched intent.
- **AerialTiles zoom + cull** (`src/cartograph/AerialTiles.jsx`,
  `CartographApp.jsx:851`). Default zoom 20 → 18 (~16× fewer tiles).
  Measure passes z=20 for cropped-in detail. `tileTouchesFade()` culls
  tiles fully outside the `FADE_OUTER` circle (~22% savings on top of
  zoom). LS at z=18: ~150 tiles, was ~3000.

**Net:** V2 cold start 50s → 1.5s. Click-to-select rebuild ~1.5s.

**Phase 2 — authoring asphalt rework** (deferred; resolves Phase 1 corner
overshoots cleanly):

`BlockGeometryV2Debug.jsx` currently renders asphalt as N per-chain
meshes (one per `byChain[i].asphaltRings`). Without the per-chain clip
those rectangles overshoot rounded corners. Phase 2 changes the
rendering, not the V2 build:

1. Add a single asphalt mesh in `BlockGeometryV2Debug.jsx` rendered
   from `asphaltRounded` directly. One smooth polygon, no overshoots
   possible.
2. Skip the per-chain asphalt mesh emission loop (currently around
   `BlockGeometryV2Debug.jsx:374-386`) for **unselected** chains.
3. Keep the existing live-overlay path for the **selected** chain
   (`liveSelectedRings`) — it already computes per-chain asphalt clipped
   to `asphaltRounded` on selection. That's the translucent highlight.
4. Leave `cornerAsphaltPlugs` computed + rendered. It becomes a subset
   of the new global mesh's coverage (harmless overlap), but pads are
   load-bearing per `feedback_load_bearing_corner_pads` — retire only
   under the corner-pad retirement protocol.

~30 LOC change. Selection semantics unchanged. Cold start stays ~1.5s.
Removes the IX-corner overshoot artifact Phase 1 leaves.

**Tooling still in place from this session:**
- `V2_PROFILE = false` flag in `buildBlockGeometryV2.js` — flip true to
  log per-step timings each build. Useful for future regressions.
- All `__mark()` instrumentation is inert when `V2_PROFILE = false`.

**Memories saved this session:**
- `feedback_clipper_narrow_the_mask` — when clipping N small polygons
  against a global Clipper mask, narrow per-item via owning-key /
  centroid lookup. Same pattern saved 39s across `buildFrontageBands`
  and `blockFill`. The cost of `intersectRings` scales with subject ×
  clip vertices, so per-item narrowing of the clip side is the lever.
- `project_v2_authoring_asphalt_phase2` — Phase 2 plan, pointer to
  this BACKLOG entry.

---

## 2026-05-10 EOD-3 — Session-end pin (superseded by 2026-05-11 on perf; otherwise current)

D.3c landed — but not via the originally-planned D.3b.3 + D.3b.4
extension/pullback path. Those were "stop pretending and walk
polygons" the wrong way: they patched a chain-driven approximation
to look like polygon-walking. The replacement IS polygon-walking,
straight off the spec.

Shipped (since EOD-2):
- **`5dfda2c` Phase D.3c** — polygon-walking `buildFrontageEdges` +
  `buildFrontageBands`. Walks `blockSharp` rings, finds block corners
  via per-vertex turn angle (>30° = corner), emits one fe per
  block-edge. Adjacent chain identified by spatial probe. Bands
  emitted by parallel-offsetting the block-edge polyline INWARD by
  cw / cw+tl / cw+tl+sw. ONE ring per band per fe — no internal
  seams at chain-IX vertices that don't change block direction.
  Mississippi-Kennett class of bugs structurally impossible.
  Supersedes D.3b.3 + D.3b.4 (extension + pullback + frontageCaps);
  the PM-2 strip-composition spec they encoded was correct, but
  cornerSidewalkPads already deliver that visual via the
  load-bearing pad geometry — no separate cap geometry needed.
  Net −54 LOC.
- **`43f8d47` Phase D.5a** — consumers read blockCustoms by
  `[blockKey][edgeOrd]` instead of `[chainIdx][segOrd][side]`.
  Reorder: blockSharp + buildFrontageEdges run BEFORE cornersAtIx
  so the corner pass can use a feLookup map (chainIdx → segOrd →
  side → fe). frontageEdges output now includes `segOrds: number[]`
  derived by projecting chain.points onto the block-edge polyline.
- **`f27d889` Phase D.5b** — store action `setBlockEdgeCustom(
  blockKey, edgeOrd, measure)` writes the new shape. Legacy
  `setBlockCustomMeasure([chainIdx][segOrd][side])` retained for
  one transition step (now unused). `_v2FrontageEdges` exposed via
  store so the Measure UI can resolve a clicked chain point →
  containing (blockKey, edgeOrd) per side.
- **`f13827a` Phase D.6** — Measure UI's per-block-mode drag handler
  writes to `setBlockEdgeCustom(blockKey, edgeOrd, ...)`. Resolution
  via `findFeForSide(streetIdx, segOrd, sideKey)`. Handle-positioning
  reads from the new shape live.
- **`5a62701` Phase D.5c** — `buildChainBandsLive` (drag-preview
  emitter) consumes `[blockKey][edgeOrd]` keying. Closes the loop:
  cornersAtIx, buildFrontageBands, buildChainBandsLive, and
  Measure UI all use the same customs identity. No more
  "band moved, plug stayed" mismatches possible.

**Architecturally complete.** PM-2 "block as positive space" spec is
the canonical implementation. Operator authors per block-edge;
bands and plugs render off the same identity; live drag preview
matches post-release V2 pass.

**Performance regression — RESOLVED 2026-05-11.** Was: `findAdjacentChainForBlockEdge`
probed outward and iterated every chain × every chain-segment per probe
step (~4M distance checks per V2 pass on LS). Designer was sticky on
click-to-select. Resolution: spatial index + clip-narrowing pattern.
See 2026-05-11 session-end pin above for the full perf pass — that
work also exposed and retired three other multi-second hotspots.

**D.7 cleanup** (deferred; not blocking — anything using the legacy
shape was already removed in this sprint):
- Remove dead `adjacentBlockId` helper (no callers).
- Remove dead `setBlockCustomMeasure` setter (no callers).
- Remove dead per-chain `byChain.{tl,sw}Rings` emission (rendered
  pre-D.3c; unused since). Per-chain asphalt + capRings still emit
  and are still consumed.
- Remove `chainStripBandExt`'s override params (no callers pass
  overrides).

**Memories saved this session:**
- `feedback_polygon_walking_needs_spatial_index` — adjacency probes
  over all chains scale O(N²); spatial bbox prefilter is mandatory
  before LS scale.
- `feedback_customs_identity_must_unify_across_consumers` — when
  migrating data shapes, audit ALL THREE visible-geometry
  consumers (cornersAtIx, bands, drag preview) in one commit or
  partial migrations produce regressions worse than the original
  problem.

---



## 2026-05-10 — Loop streets (L.0 through L.6, in flight)

L.0 spec locked in `cartograph/NOTES.md` 2026-05-10 "Loop streets: L.0
architecture lock" — read that BEFORE coding. Per
`feedback_notes_md_holds_architecture`, NOTES holds the algorithm; this
entry tracks status.

**The problem in one paragraph:** `LOOP_STREET_NAMES = ['Benton Place',
'Mackay Place']` in `cartograph/derive.js:1297` is hardcoded, wrong
(Mackay isn't a loop street — Waverly is), and dead in production
(post-V2 migration the V1 loop-cut/median-creation paths in derive.js
land in `map.json` which the V2 bake doesn't read for blocks). Result:
loop streets render with no special handling today — Benton's interior
falls through to the random-LU palette, Waverly has no median concept
at all. Three loop topologies need first-class support: Type A teardrop
(stem + closed body, Benton), Type B couplet (parallel one-way
carriageways enclosing a face, Waverly), Type C pure ring (none yet).

**Phases:**

1. **L.0 — Spec lock** ✅ (this commit). Definition, topologies A/B/C,
   per-role cross-section table, `overlay.loops` data shape (canonical
   list + denormalized per-chain hint), auto-detect + override semantics,
   smooth-preview bundled scope, ribbon-control inner/outer scope. See
   NOTES.md.
2. **L.1 — Toy fixtures.** ✅ landed in `src/data/toy/toy-input.json`
   (committed via `4319737` "Refresh slabs + authoring state after
   pipeline refactor"; re-derived `toy-ribbons.json` carries the new
   chains). Type A (Benton-toy teardrop): BENT-STEM off VW3 at (40,-80)
   → joint at (60,-80); BENT-BODY 12-pt closed circle centered (85,-80)
   r=25. Type B (Waverly-toy couplet): split HW4 at (-40,120) and
   (52,120) into HW4-W + HW4-E; insert WV-S (oneway east, bows south
   to z=125), WV-N (oneway west, bows north to z=115), WV-CUT (bare
   cross-thru at x=5). All 7 expected IXs detect cleanly in
   derive-toy.js. NOTE: don't be fooled by the second file at
   `cartograph/data/toy/raw/centerlines.json` — it's vestigial from
   TOY_AUTHORING_PLAN.md and nothing reads from it (see memory
   `project_toy_canonical_input_path`). Loop/oneway fields on the new
   chains are operator-intent annotations only at this stage —
   derive-toy.js doesn't propagate them yet (L.2 wires propagation).
   Visible-bug coverage: none yet; the new fixtures render as ordinary
   residential ribbons because the emitter is still loop-unaware.
3. **L.2 — V2 emitter + smooth bake-into-points.** Producer-only
   change; no UI. Toy is iteration surface; LS is verification target.
   Per `feedback_d3_bundling_failure_modes`, do NOT bundle with L.3.

   - **L.2a — Propagate `loop` + `oneway` through derive-toy + derive.**
     Files: `cartograph/derive-toy.js` (lines ~178-185 + ~230-247 — the
     `if (s.field) out.field = s.field` allowlists) and
     `cartograph/derive.js` (the per-street output map near
     "ribbonStreets.map(st => ({...}))" — currently whitelists
     `highway` + `type` per the 2026-05-09 fix). Add `loop`
     (object pass-through) + `oneway` (boolean pass-through) so
     `ribbons.json` carries them per chain.
     **Acceptance:** node REPL on `src/data/toy/toy-ribbons.json`
     confirms BENT-BODY.loop.role === 'body', WV-CUT.loop.role ===
     'cut-thru'. No visible change yet.

   - **L.2b — `chain.smooth` baked into `street.points`.** Closes
     BACKLOG "Phase 7 — Smooth, made real (Designer-side shipped
     2026-05-04)" open ½-hour task. Files: `cartograph/derive-toy.js`
     (after IX-splice, before the output map) + `cartograph/derive.js`
     (same point in pipeline). For each chain with `smooth > 0`, call
     `subdividePolyline(chain.points, chain.smooth)` from
     `src/cartograph/streetProfiles.js`. **Preserve** the IX vertex
     positions exactly (subdivide between IX-keyed points only, or
     re-snap IXs after subdivision; per memory
     `feedback_corner_pad_continuity_first` corners must stay derived
     from same source as legs).
     **Acceptance:** Benton-toy body renders as a smooth ellipse, not
     a faceted dodecagon, in Designer. Visible-bug coverage: Benton
     LS body smoothness (after L.5 marks it `smooth > 0`).

   - **L.2c — `buildBlockGeometryV2` loop-aware band emission.**
     File: `src/lib/buildBlockGeometryV2.js`. Today the per-segment
     asphalt emission, frontageBands, and `cornerSidewalkPads` all
     treat chains symmetrically. Loop-awareness changes:

     1. **Per-side measure resolution** consults `chain.loop?.role`:
        - `body` (Type A): inner side eff = `{ pavementHW,
          treelawn, sidewalk: 0, terminal: 'treelawn' }` regardless
          of authored measure. Outer side honors authored measure.
          The "inner side" is whichever side of the chain faces the
          loop centroid (compute once at chain entry as the cross
          product sign).
        - `outer` (Type B): both sides honor authored measure (no
          override). Couplets get normal residential cross-section.
        - `cut-thru` (Type B): both sides eff = `{ pavementHW,
          treelawn: 0, sidewalk: 0, terminal: 'none' }`. Asphalt-only
          bare strip per L.0 spec.
        - `stem` (Type A) and `connector`: no change (normal
          residential).
     2. **Median emergence is free** — `blockRounded = stencil −
        asphaltRounded` already produces the enclosed loop interior
        as a positive block. Add a `blockMeta[i].loopMedian = true`
        marker for blocks whose centroid lies inside a loop ring
        (point-in-polygon against `loop.body` chains' interior); the
        bake reads this to paint `lu='park'` instead of the random
        residential palette. Hint: build the lookup as a list of
        `{ loopId, interiorPolygon }` from the `loop.role==='body'`
        chains (Type A) and the planar cycles of `loop.role==='outer'`
        chains (Type B — needs a small face-finder).
     3. **Smooth/orientation:** loop body chains are typically
        oneway, so the "inner side" maps to `right` when traversal
        direction is CCW around the centroid and `left` when CW.
        Resolve this once at entry; don't re-derive per segment.

     **Acceptance:**
     - Benton-toy: outer ring renders with full ROW (treelawn +
       sidewalk); inner ring renders with treelawn only (no
       sidewalk strip); interior face paints as green park, not
       residential.
     - Waverly-toy: both carriageways render with normal residential
       ROW; the WV-CUT cross is a bare asphalt strip with no
       treelawn/sidewalk; the two interior faces between the
       carriageways paint as green park.
     - Existing toy chains (HW1-3, VW1-4, STUB-N, HW4-W/E) render
       unchanged.
     - LS Benton + Waverly: same after L.5 marks them.

   - **L.2d — Bake adapter.** File: `cartograph/bake-ground.js`. The
     `buildV2BakeShape` shim reads `v2.blocks[i].lu` to route into
     `byFaceUse`. Confirm the new `loopMedian` blocks emit with
     `lu='park'`. May need to add `loopMedian → park` mapping if V2
     doesn't already overload `lu` directly. Verify ground.json has
     the expected park face for Benton-toy's interior post-bake.

   **L.2 sub-phasing:** L.2a (propagation) and L.2b (smooth) are
   independent and can ship as one commit each. L.2c (emitter) is the
   big one — sub-phase further if it grows past ~200 LOC: (i) per-side
   eff resolution behind a `chain.loop` lookup, no median yet;
   (ii) loop-interior face-finder + `loopMedian` flag; (iii) cut-thru
   bare profile. Each sub-sub-phase its own commit. L.2d is glue,
   ships with whichever piece needs it.

4. **L.3 — Survey UI.** Consumer-side; depends on L.2 producer changes
   landing. Two pieces.

   - **L.3a — Smooth-preview overlay.** File:
     `src/cartograph/SurveyorOverlay.jsx`. For any selected chain with
     `chain.smooth > 0`, render the subdivided polyline (via
     `subdividePolyline` from streetProfiles) as a faint solid line at
     30% opacity, sitting *under* the existing dashed control
     polyline. No toggle — always on when smooth > 0. The smooth
     slider in SurveyorPanel already exists; this just makes its
     effect visible at author time. Per memory
     `project_overlay_meshes_must_be_transparent` use `transparent
     opacity={0.3}`. **Acceptance:** dragging the smooth slider in
     SurveyorPanel shows a live curving polyline overlay in the
     Designer canvas.

   - **L.3b — Loop-streets section in SurveyorPanel.** File:
     `src/cartograph/SurveyorPanel.jsx`. New section between Smooth
     and Caps. Contents per loop in `overlay.loops`: small thumbnail
     (top-down trace of the member chains), name, type label
     ("teardrop" | "couplet" | "ring"), member chain count, enable
     toggle (defaults on for auto-detected; operator can disable for
     false-positives). Plus a "Mark selected chains as loop" button
     that's active when ≥2 chains are selected via marquee. The
     marquee tool itself lives in `src/cartograph/SurveyorOverlay.jsx`
     and may need a small enhancement to multi-select (BACKLOG
     "Phase 3 — Marquee select" already plans this; coordinate with
     that effort or land it as a precondition). **Acceptance:** at
     LS the Benton + Waverly auto-detected loops appear as cards with
     correct member counts and thumbnails; toggle-off makes the loop
     render as ordinary residential.

   - **L.3c — `detectLoops` helper.** File:
     `cartograph/detectLoops.js` (new) or fold into `derive.js`
     post-IX-splice. Two passes per L.0 spec:
     - Type A: for each chain `c` where `points[0]==points[-1]` (or
       within IX_VERTEX_SNAP), find another chain with same `name`
       whose endpoint coincides with `c`'s closure point. Emit
       `{ id, name, type:'teardrop', members:[stem,body] }`.
     - Type B: build a same-name subgraph keyed by endpoint
       coincidence; find planar cycles; if all chains in the cycle
       are `oneway:true`, emit `{ id, name, type:'couplet', members:
       [...] }`. Any non-oneway in the cycle is a `connector`; any
       chain whose endpoints lie on the interior of two opposing
       sides is a `cut-thru`.
     Output writes to `overlay.loops` as auto-detected entries (with
     `_auto: true` so operator overrides can be distinguished). The
     auto-detect rerun-on-save semantics: re-run after any chain
     edit; if a member chain disappears, mark the loop `_stale: true`
     and surface in the Loop-streets section for review.

5. **L.4 — Measure inner/outer.** File: `src/cartograph/MeasurePanel.jsx`
   (and any wider Measure side-bar). When the selected chain has
   `loop.role ∈ {'body', 'outer'}`, swap the "Left" / "Right" labels
   for "Outer" / "Inner". Resolution: at chain entry, compute the
   centroid of the loop's `body` chain (Type A) or of the union of
   `outer` chains (Type B). For each chain segment, the inner side is
   whichever side's perpendicular vector points toward that centroid.
   Cache the inner-side mapping per `(skelId, loopId)` to avoid
   recomputing every render frame. Default profiles when the operator
   first edits an inner side preload the cross-section-table values
   (`pavementHW` kept, `treelawn` kept, `sidewalk: 0` for `body`).
   **Acceptance:** opening Measure on BENT-BODY shows "Outer" /
   "Inner" labels; the Inner side defaults to sidewalk=0; dragging
   Outer-side sidewalk changes only the outer-ring sidewalk width in
   Designer + bake. No effect on non-loop chains.

6. **L.5 — LS migration + `*Place` audit.** Two pieces.

   - **L.5a — Run `detectLoops` over LS overlay.** Output is a JSON
     report listing each candidate: `{ name, type, members, score }`.
     Confidence score: 1.0 for textbook teardrop (one closed chain
     + one open chain, same name); 0.7 for couplet (2+ oneway chains
     sharing endpoints, planar cycle); 0.3 for any same-name pair
     that's structurally suggestive but doesn't pass the strict
     rules. Operator confirms each candidate via terminal prompt or
     a Survey-panel checklist (no need to build full UI for the
     one-time migration; a JSON-edit pass is fine).
   - **L.5b — Commit `overlay.loops` entries** for confirmed Benton
     + Waverly + any others the audit surfaces. Per Jacob most
     `*Place` streets (Oregon, Henrietta, Vail, Preston, Simpson,
     Nicholson, Whittemore, Kennett, Albion, Park, Mackay) are
     "places by dint of alleys + walkways" not real loops — the
     audit is to *check, not assume*. Expected outcome: Benton +
     Waverly land as loops; Mackay confirmed normal; others
     confirmed normal.
   **Acceptance:** Benton's interior renders as green median in
   Stage/Preview with no sidewalk on the inner ring; Waverly's
   interior faces render as green medians with the cut-thru showing
   as a bare asphalt strip. Visible-bug coverage: the original
   "super bust" from session start (Benton's interior not green,
   Waverly's median nonexistent).

7. **L.6 — Cleanup.** Three pieces, separate commits.

   - **L.6a — Delete dead V1 paths.** File: `cartograph/derive.js`.
     Remove `LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay
     Place'])` + all 8 references (block-cut skip ~L1297-1320,
     dead-end skip ~L1492, frontage gap patch ~L1593-1665, median
     creation ~L1817-1839, SPIKE skip ~L1876, sidewalk skip ~L1941,
     alley/ROW skip ~L1997, plus the channel-area comment ~L1745).
     Per memory `feedback_load_bearing_corner_pads` + `feedback_
     no_speculative_cruft_lists`: visually verify in Designer/
     Stage/Preview before deletion that no LS surface still depends
     on the V1 path. The blockMeta `isMedian` flag goes too; check
     downstream consumers in `bake-ground.js` and `map.json` ingest.
   - **L.6b — Migrate spec from NOTES + BACKLOG to FEATURES +
     ARCHITECTURE.** New FEATURES section "Loop streets" with the
     L.0 spec body (definition, three topologies, per-role
     cross-section table, data shape). New ARCHITECTURE data-flow
     note for `overlay.loops` and the auto-detect → operator-
     override → emitter chain. The NOTES.md 2026-05-10 section + the
     BACKLOG L.0–L.6 entry get pruned to a short pointer per
     `feedback_features_md_is_a_working_doc` (NOTES is archival but
     load-bearing-for-in-flight sections retire when the work
     lands; BACKLOG entries retire entirely).
   - **L.6c — Update memory.** Save a `project_loop_streets.md`
     entry covering the three topologies + the role table so
     future sessions don't re-derive it. Retire any memory entries
     that referenced the V1 `LOOP_STREET_NAMES` pattern if they
     exist.

**Sequencing rules:**

- Toy is the iteration surface; LS is the verification target. Both ship
  in the same phase. Per `feedback_no_parallel_pipeline_for_scenes`, no
  scene-specific branches — toy and LS share the same emitter code path.
- Per `feedback_d3_bundling_failure_modes`, keep producer changes (V2
  emitter) separately commit-able from consumer changes (renderer, UI).
  Do not bundle L.2 producer work with L.3 UI work in one commit.
- Per `feedback_phase_scope_explicitness`, each phase's commit message
  states which user-visible symptoms it does and doesn't fix.

---

## 2026-05-10 EOD-2 — Session-end pin (read first; supersedes the EOD pin below for D.3 plan)

A second session today. Three clean shipped commits on
`cartograph-looks-pass-ab` for D.1/D.2/D.3a, then a bundled D.3b+D.3c
attempt was rolled back uncommitted after Jacob caught four stacked
failure modes. No code regression.

Shipped (since last EOD):
- **`059cc4c` Phase D.1** — `buildFrontageEdges` (~50 LOC, +
  comments). Per-block list of (chain, side, segment-run) →
  frontage-edge runs returned as `frontageEdges` on the geometry
  result. Additive; no consumer.
- **`d113f1f` Phase D.2** — `blockSharp = stencil − asphaltSharp`
  (~10 LOC). Sharp-corner figure-ground inverse, returned alongside
  `blockRounded`. Additive; no consumer.
- **`fa929d3` Phase D.3a** — `buildFrontageBands` (~70 LOC). Per-
  frontageEdge tl+sw rings spanning merged segment runs along chain
  centerline. Additive; no consumer. Caveat: collapses per-segment
  customs to the first segOrd's customs in a run.

Aborted (uncommitted, restored to `fa929d3`):
- A bundled D.3b geometry + D.3c production swap touching
  `buildBlockGeometryV2.js` (+293/−68), `bake-ground.js` (+16/−4),
  `BlockGeometryV2Debug.jsx` (+46/−5). HMR-loaded into Designer.
  Jacob caught four stacked symptoms: (1) lost dead-end round
  quarter caps (renderer dropped a `byChain` consumer that carried
  them); (2) cap mis-shape on asymmetric/oblique corners (orthogonal-
  basis approximation insufficient); (3) "parcel shape change → LU
  lost + bands hidden" — likely `blockKey` (bbox-center) staleness
  pre-existing; (4) variable hw within a frontage (D.3a caveat made
  visible). Rolled back via `git restore`. Lesson saved as
  `feedback_d3_bundling_failure_modes`.

**Next session — start with D.3b.1 (split `byChain` band/cap rings, ~30 LOC, no visual change).** Full re-planned sub-phasing is in the D.3 entry of the previous EOD pin (below). Per the new memory: do NOT bundle a renderer/consumer swap with new producer geometry in the same commit; sub-phase those layers separately.

Open carry-overs to investigate independently of D.3:
- `blockKey` staleness on parcel-shape edits (orphaned
  `blockLandUse` / `blockCustoms`). Diagnose with a small repro
  before D.3c lights it up.

---

## 2026-05-10 EOD — Session-end pin (read first if picking up Phase D)

Big day. The V1→V2 migration completed across every consumer; the
production runtime now reads the same per-Look slab Designer authors
against. Five clean commits on `cartograph-looks-pass-ab`:

- **`66e6969` Snapshot baseline** — operator authoring + fresh bake
  before the migration started.
- **`d5b055e` Phase 0** — `useV2Geometry` flag retired, V1 branch in
  `bake-ground.js` deleted; V2 unconditional in the bake.
- **`6f118e2` Phase A** — Stage shots (cartograph.html non-Designer)
  consume `BakedGround` for ALL scenes (Toy now has full Stage shot
  support). `BlockGeometryV2Debug` gated to Designer only.
- **`1fb456f` Phase B** — Production runtime (`Scene.jsx`) reads
  `BakedGround`; `VectorStreets` + `StreetRibbons` mounts removed.
  The marriage leap landed.
- **`053f13b` Phase C** — Excised V1 corpus: `StreetRibbons.jsx`
  (2110 lines), `VectorStreets.jsx` (447), `cartograph/render.js`
  (2368), `cartograph/smooth.js`, `cartograph/diagnose-corners.js`,
  `CORNER_DEBUG.md` + `CORNER_HANDOFF.md`. Trimmed
  `ribbonsGeometry.js` 706 → 140 lines (kept `clipAllToStencil` +
  `LAND_USE_COLORS` for the bake's overlay clip + face-color
  fallback). Net −5,951 lines.
- **`aaf74d5` D.2 partial rollback** — A first attempt at block-edge
  ownership using per-chain-segment merging via `adjacentBlockId`
  probing (the same shape as the 2026-05-09 reverted attempt).
  Wrong primitive — the polygons exist already in `blockRounded`;
  the spec is in `cartograph/NOTES.md` 2026-05-06 PM-2. Rolled
  back to clean Phase-C state.

**Next session — Phase D, spec-faithful, sub-phased:**

Read `cartograph/NOTES.md` 2026-05-06 PM-2 in full BEFORE coding —
the architecture is "block as positive space, asphalt as void;
bands run to the SHARP block corner; round-corner is a CLIP applied
to the block ring; corner geometry emerges from strip composition
rules." Resolutions 2026-05-07 + Default-R rule sit alongside.

1. **D.1 — `frontageEdges` per block** ✅ shipped `059cc4c`
   (`buildFrontageEdges` in `src/lib/buildBlockGeometryV2.js`,
   returned as `frontageEdges` on the geometry result). Inverse of
   `adjacentBlockId`: per (chain, segOrd, side) probe → group
   consecutive same-(blockId, side) runs per chain →
   `{points, chainIdx, segOrds, side, blockKey, edgeOrd}`. `points`
   is the chain centerline polyline over the merged span (D.3
   derives offsets); `edgeOrd` is encounter-order within `blockKey`
   (D.3/D.6 may re-order to ring-walk). Additive only — no
   consumer yet, no render change.
2. **D.2 — `blockSharp = stencil − asphaltSharp`** ✅ shipped
   (8 LOC in `buildBlockGeometryV2`, returned alongside
   `blockRounded`). The sharp-corner figure-ground inverse of the
   unioned per-segment asphalt rectangles, BEFORE round-corner.
   Bands will run to its corners in D.3; `blockRounded` stays the
   render-time clipping mask. Additive only — no consumer yet.
3. **D.3 — Per-block-edge band emission with strip composition
   rules** (the visible Mississippi/Park fix). Re-planned into
   five sub-phases after the 2026-05-10 EOD-2 attempt at bundled
   D.3b+D.3c surfaced four stacked failure modes (lost dead-end
   quarter caps, asymmetric-corner cap mis-shape, parcel-shape
   blockKey staleness, variable-hw within a frontage). Rolled
   back uncommitted; lesson logged as
   `feedback_d3_bundling_failure_modes`. New plan:
   - **D.3a ✅** (`fa929d3`) `buildFrontageBands` in
     `src/lib/buildBlockGeometryV2.js`, exposed as `frontageBands`
     on the geometry result. Per-frontageEdge tl+sw rings spanning
     the merged segment run along chain centerline. Additive only;
     not consumed by the renderer; bands DON'T yet extend to sharp
     block corners. Caveat: per-segment customs collapse to first
     segOrd's customs.
   - **D.3b.1 ✅ Split `byChain` band rings vs cap rings.**
     `emitQuarterCaps` now writes chain-endpoint round caps into
     dedicated `byChain.{treelawn,sidewalk}CapRings`. Bake
     (`bake-ground.js`) and Designer (`BlockGeometryV2Debug.jsx`)
     concatenate band + cap rings into the same material groups, so
     visual output is identical to pre-split. A later renderer swap
     (D.3c) can drop band consumption without taking caps.
     **Visible-bug coverage:** none (foundation).
   - **D.3b.2 ✅ Per-segment customs within a frontage.**
     Replaced D.3a's first-segOrd-customs caveat with a piecewise
     emitter: each segOrd in a run resolves its own eff from
     `blockCustoms[chainIdx][segOrd][side]`; the band's inner edge
     tracks variable hw across the run. Schema change (still
     unconsumed): `frontageBands[fe].{treelawnRing,sidewalkRing}`
     (singular) → `{treelawnRings,sidewalkRings}` (plural arrays
     of one ring per segOrd) + a `perSeg` array carrying the
     resolved eff and rings per segOrd for D.3b.3/4 to consume.
     **Visible-bug coverage:** would fix variable-column/row
     asymmetry (after D.3c).
   - **D.3b.3 ⚰️ Superseded by D.3c polygon-walking.** Shipped as
     `27760e6` but its mechanism (sharp-corner extension via
     line-line intersections on chain-driven bands) was patching
     a chain-driven approximation. Polygon-walking (D.3c) makes
     extension structural — the block-edge polyline IS the curb
     line, no extension needed. The `chainStripBandExt` helper
     remains in the codebase but its override parameters are
     unused (D.7 cleanup will inline).
   - **D.3b.4 ⚰️ Superseded by D.3c polygon-walking.** Shipped as
     `914eca0`. The PM-2 strip-composition spec it encoded
     (pullback + cap geometry at (tl+sw)↔(tl+sw) corners) is
     correct in principle, but `cornerSidewalkPads` (load-bearing
     per the pad memo) already deliver that visual through the
     pad's depth-aware quad construction. Emitting separate
     `frontageCaps` produced visible artifacts on LS asymmetric/
     oblique IXs (overlap with pads). The polygon-walking D.3c
     drops `frontageCaps` emission entirely; pads do the corner
     concrete.
   - **D.3c ✅ Production swap (polygon-walking).** Shipped as
     `5dfda2c`. Replaces chain-driven `buildFrontageEdges` +
     `buildFrontageBands` with polygon-walking versions per the
     PM-2 spec. Walks `blockSharp` rings, finds block corners via
     per-vertex turn angle, emits ONE fe per block-edge. Bands
     emit via parallel offset of the block-edge polyline. No
     internal seams at chain-IX vertices that don't change block
     direction. The Mississippi-Kennett-class bug is structurally
     impossible. `cornerSidewalkPads` + `cornerAsphaltPlugs`
     unchanged (load-bearing). `frontageCaps` always empty (pad
     handles corner concrete). Net −54 LOC.
     **Visible-bug coverage:** ✅ Mississippi/Park sidewalk runs
     continuous; pads handle corners as before.
   - **Open carry-over:** "parcel-shape change → land-use lost +
     bands hidden" surfaced during the failed bundle. Likely
     pre-existing `blockKey` (bbox-center) staleness — reshaping
     orphans `blockLandUse` / `blockCustoms` entries. Diagnose
     independently; not on the D.3 critical path.
4. **D.4 — Visual parity verification + corner pad retirement**
   per surface (Designer / Stage / Preview). Jacob signs off
   surface-by-surface before pads go.
5. **D.5 ✅ `blockCustoms` keying** `[chainIdx][segOrd][side]` →
   `[blockKey][edgeOrd]`. Shipped as `43f8d47` (D.5a consumers),
   `f27d889` (D.5b store + frontageEdges exposure), `5a62701`
   (D.5c live drag preview). Three visible-geometry consumers
   (cornersAtIx, buildFrontageBands, buildChainBandsLive) all read
   the new shape; Measure UI writes it (D.6). No legacy data
   migration needed — operator started fresh.
6. **D.6 ✅ Measure UI addresses by block-edge.** Shipped as
   `f13827a`. Drag handler resolves `(streetIdx, segOrd, sideKey)`
   → frontage edge → `(blockKey, edgeOrd)` and writes via
   `setBlockEdgeCustom`. Handle-positioning reads the new shape
   live.
7. **D.7 — Cleanup.** Pending. Specifically:
   - Remove dead `adjacentBlockId` helper (no callers post-D.3c).
   - Remove dead `setBlockCustomMeasure` setter (no callers post-D.6).
   - Remove dead per-chain `byChain.{tl,sw}Rings` emission (rendered
     pre-D.3c via Designer + bake; unused since D.3c routes through
     `frontageBands`). Per-chain asphalt + capRings still emit.
   - Inline `chainStripBandExt`'s override parameters (no callers).

Sized at 4–6 focused sessions. Each lands a clean intermediate
commit; at no point does the system regress.

**Mistake from this session, logged for next operator:** I
implemented a per-chain-segment merge approach based on inferring
the algorithm from current emitter code + a 4-bullet sketch in
BACKLOG. The full spec was sitting in NOTES.md PM-2 the whole
time, with strip composition rules, the Default-R formula, and an
explicit `frontageChains` Gap 1 description. Lesson logged in
memory `feedback_notes_md_holds_architecture`.

---

## 2026-05-09 EOD — Session-end pin (read first if picking up the migration)

Toy was stabilized at a clean baseline this session and the
block-edge-owned-ribbons migration is unblocked. Four commits on
`cartograph-looks-pass-ab` carry the prep work — read `git log -p
dc77068..HEAD` for the full story. In order:

1. **`88db3e0` Trinity-doc reality-check.** NOTES + BACKLOG + FEATURES
   updated to reflect that Phase 0 parallel-pipeline collapse landed
   via SCENE_REGISTRY, V2 prototype shipped, and Toy is the canonical
   pipeline test rig (with the three authored irregularities — VW3
   bend, HW3 saw-tooth jog, dead-end stub — explicitly called out as
   the failure modes the next emitter has to handle).
2. **`76e7aec` Remove in-line vertex smoothing from Measure.** The
   per-vertex `vertexSmoothing` store field, `filletChainVertex` /
   `applyChainSmoothing` / `computeSmoothLayout` / `setVertexSmoothing`,
   and the smoothing dots in `CornerEditHandles` are gone.
   Replacement is Survey-time arc smoothing (entry below); don't
   reintroduce a render-time fillet pass on the centerline.
3. **`38199ea` V2 round-cap CCW normalization.** `quarterCap` rings
   were emitted with mixed winding; Clipper's NonZero union was
   cancelling the cap against the matching asphalt rectangle and
   leaving a hole at dead-ends. Fix is the same shape as the
   per-segment-rectangle CCW guard.
4. **`460cc7c` V2 face emission: per-output-ring blockKey + hash-LU
   fallback.** Toy lost its mixed-LU parcel grid because
   toy-ribbons.json carries one envelope-shaped face for the entire
   ±180 stencil. Per-output-ring keying restores the 3×3 grid's
   varied palette via `pickLuFromHash`. LS face.use still dominates
   when set.

Toy currently renders cleanly: asphalt corridors with rounded
mouths, treelawn + sidewalk bands, curb stroke, concrete corner
pads at IXs, a clean half-disc round-cap on the HW3 dead-end stub,
mixed-LU parcels in the 3×3 grid, working corner-radius authoring
(global slider + per-corner cyan dots).

**Load-bearing context for the migration carrier:**

- The migration target is the block-edge entry below ("2026-05-09 —
  Block-edge-owned ribbons"). Toy is the right place to develop it;
  the `buildChainBandsLive` per-chain emitter at the bottom of
  `src/lib/buildBlockGeometryV2.js` proves per-chain stroking is
  ~ms-per-chain, so the rewrite isn't a perf risk.
- ⚠ **Concrete corner pads (`cornerSidewalkPads` / `buildCornerPadQuad`)
  AND asphalt corner plugs (`cornerAsphaltPlugs`) are PERMANENT
  LOAD-BEARING geometry. DO NOT REMOVE.** Both fill real geometric
  regions that exist in any emission strategy. The sidewalk pad
  fills the wedge between the rounded curb arc and the two straight
  ped-band inner edges at the block's corner — leg ribbons are
  straight strips and don't follow the arc, so the wedge is
  geometric, not derivation-dependent. The asphalt plug fills the
  rounded fillet at every IX mouth — a real visible region.
  **Principle: visible geometry is permanent; how it's *derived*
  can change with the emitter, but the visual region must always
  be filled.** Block-edge ownership doesn't erase either; it
  produces the same geometry through a cleaner derivation
  (e.g. `block_polygon's_corner_arc − (leg_ribbon_A ∪ leg_ribbon_B)`
  for the pad). Producing nothing in the corner zone is never a
  valid replacement. A corresponding ⚠ guard sits above
  `buildCornerPadQuad` in `src/lib/buildBlockGeometryV2.js`.
  Designer + bake + Preview + Stage all consume the same V2 output;
  any visible regression in Designer cascades straight to Preview.
  **Default = keep.** Removal is only correct if the new emitter
  visibly produces the same corner geometry AND Jacob has signed off.
- Smoothing has been removed from the geometry path entirely. If
  you reintroduce a smoothing pass anywhere downstream of Survey,
  reread the "Survey-time arc smoothing" entry and the commit
  message on `76e7aec` first.

---

## 2026-05-09 — Block-edge-owned ribbons (NEXT — load-bearing)

**See `cartograph/NOTES.md` 2026-05-06 PM-2: "Corner geometry retired
& rebuilt: rounded-block-clip plan."** That note is the architecture.
What's currently shipped is a centerline-driven approximation that
diverges from the documented model in measurable ways:

- **Documented model:** block is positive space. Each block's edge
  along an asphalt corridor owns ONE leg ribbon (treelawn / sidewalk
  composition), running corner-to-corner of the BLOCK — independent
  of how the chain on the other side is segmented.
- **Currently shipped:** chain-segment-owned ribbons. V2 emits per
  natural-segment of each chain; bands break at every chain IX. This
  causes the visible "Mississippi west sidewalk cuts off at Kennett"
  bug — Kennett T's into Mississippi from the east, splits Mississippi's
  chain mid-block, and V2 splits BOTH of Mississippi's sides instead of
  just the east. Park Avenue south side has the same failure between
  Mississippi and Missouri.

A first attempt today added per-side IX classification (`classifyIxSides`
+ `naturalSegmentsForSide` + `chainStripBandVarying`) to filter out
opposite-side IXs from a side's segmentation — reverted because it's
still centerline-driven, and per-block customs don't have a stable
identity in that model. The real fix is to migrate ribbon emission to
walk block edges, not chain segments.

**Migration shape (sketch):**
1. V2 already emits `blocks` with rings clipped against `asphaltRounded`.
   Each block ring is a polygon whose edges are either parcel-frontage
   (touches asphalt) or parcel-internal (between two parcels).
2. For each block, identify its asphalt-facing edges. Each such edge is
   a leg ribbon: emit treelawn / sidewalk strips spanning the edge from
   block-corner to block-corner.
3. blockCustoms migrates from `[chainIdx][segOrd][side]` to
   `[blockKey][edgeOrd]` — operator-edited measure attaches to a
   specific block's specific edge, stable across chain re-segmentation.
4. Asphalt rectangle stays per-chain-segment (asphalt always splits at
   every IX — that's correct). Bands move to per-block-edge.

**Why this is the right move:** beyond the visible-cutoff bug, it
collapses the centerline-driven recompute loop. Today every drag goes
chain.measure → centerline+perp → polygon → render. With block-edge
ownership, the polygon IS the data. Drag a handle → modify the polygon
vertex directly → render. No centerline references after initial
construction. Naturally per-edge customs.

**Estimate:** 1-2 focused sessions. Touches V2 emission, blockCustoms
data model, MeasureOverlay's segOrd → blockEdge lookup, and the bake
adapter (which reads V2 output unchanged — block-keyed customs flow
through cleanly).

Today's working-baseline state covers the simple use cases (Mississippi
drag works, perf is good with the live overlay) but won't scale until
this lands.



## 2026-05-09 — Designer panel restructure (LANDED)

Reclassified the Designer panel section structure, moved block-shape
controls into Blocks, relocated Hero into Survey, and added a
parametric label-style block. All inline `style={…}` props in
`Panel.jsx` / `SurveyorPanel.jsx` / `MeasurePanel.jsx` were
consolidated to CSS classes (`.carto-row--wrap`, `.carto-meta--value`,
`.carto-btn--grow`, `.carto-section-caret.is-open`,
`.carto-btn(-sm).is-active/:disabled`, `.carto-subsection*`); the
phantom `carto-button` className (referenced inline-styled, no CSS
rule) is gone. Stage's `CartographSurfaces` mirrored the same renames
so labels don't drift between Designer and Stage.

**Section roster (Designer + Stage Surfaces):**
Streets / Blocks / Paths / **Land Cover** (new) / **Furniture** (was
"Features") / Labels. "Block" → "Parcel" everywhere. Tree Rows merged
into Trees via a `LAYER_LINKS` map in `Panel.jsx` — the linear/point
data split is hidden from the operator; toggling Trees flips both
`tree` and `tree_row` visibility. Land Cover holds Water, Pools,
Pitches, Woods, Scrub (ground-material polygons that aren't
parcel-bound). Gardens / Playgrounds stay in Blocks because they're
identity-bearing — Lafayette Square has *specific* gardens and a
*specific* playground that may someday get bespoke treatment, same as
Buildings.

**Block-shape subsection.** Corners (slider + Edit corners + Revert)
and Curb-width moved out of Streets into a "Shape" subsection at the
top of Blocks, since both shape the rounded-block-clip — corner radius
shapes `asphaltRounded`, curb traces it. CSS class
`.carto-subsection` provides the visual nesting (subtle bottom rule +
small uppercase header).

**Hero → Survey.** `HeroSubjectPicker` moved from `Panel.jsx` into
`SurveyorPanel.jsx`. Picking the scene's hero subject is a survey act
(identifying a real-world building/landmark as the privileged
subject); Designer doesn't need to expose it. Renders unconditionally
at the top of the Survey panel — visible whether or not a street is
selected.

**Labels parametric.** New Look-level `labels` field on the store with
hydration in both load paths and persistence in `_buildDesign`. Setter
is `setLabelStyle(patch)`. ~~`MapLayers.LabelSprite` reads from store
and re-renders canvas~~ — **superseded 2026-05-14**: replaced by
`SceneLabel` (drei `<Text>` / SDF) consumed by both Cartograph and
Preview/LS via shared `src/lib/streetLabels.js`. Chip controls and
canvas-sprite renderer retired; current schema is `{ size, weight,
fill, halo, haloWidth, letterSpacing, opacity, case, fontFamily }`
with width-aware per-label sizing from `measure.pavementHW`. See NOTES
2026-05-14 "Labels consolidated".

### Deferred follow-ups

- **Label zoom-fade** — per-frame distance check or shader uniform.
- **Highway shader treatment** (Stage-side: distinct material so it
  reads as context, not eligible roadway). Designer-side it's already
  its own visibility row; this is a Stage Surfaces concern.
- **Highway tour/ground-cam ineligibility** — routing/tour-system
  concern. Highway should not be eligible for walking tours or ground
  camera action.
- **Stage `tree_row` color knob.** Removing the row from Stage's
  Surfaces panel means `tree_row`'s default color from
  `m3Colors.js` is no longer panel-editable. Decide: unify with
  `tree`'s color (full merge) or restore an admin-only knob.
- **Persisted `openSections` keyed on "Features"** won't auto-carry
  to "Furniture" — section starts closed on first reload after the
  rename. One-time UX blip, not a regression.



## Toy is the test rig for the next emitter

**What Toy demonstrates today (full V2 stack, structurally clean):**

- Routes through `SCENE_REGISTRY` in `src/cartograph/CartographApp.jsx` —
  same `buildBlockGeometryV2` emitter, same Survey/Measure tools, same
  Designer panel, same bake adapter, same per-block LU pipeline as LS.
  No `if (scene === 'toy')` branches in the rendering path.
- Has its own `StageEnvironment` (ToyTerrain/Buildings/Trees/StreetLights)
  and a `DesignerBackdrop` (procedural grid) registered as scene
  capabilities, not branched in components.
- Per-block LU via hash-fallback (LS reads `face.use` from OSM); corner
  authoring kit (per-IX + per-corner R, scale slider, smoothing); curb
  width control; vertex smoothing — all live in toy.
- Free of LS-only data-quality noise: no stale `ix.streets[].ix` indices,
  no divided-road continuation joints, no undefined highway tags. The
  shortest possible iter loop for emitter work.

**Authored irregularities in `src/data/toy/toy-ribbons.json`** (3×3 grid
of 9 fully-bounded blocks plus deliberate test cases — re-run
`cartograph/derive-toy.js` after editing the input):

- **VW3 bends NE** from (40,60) to (60,160) — top-right blocks become
  trapezoidal, exercises bent-chain regression on per-segment emission.
- **HW3 jogs up** from z=40 to z=60 between x=0 and x=20 — saw-tooth
  top edge on middle blocks; probes IX-on-one-side splitting (the
  Mississippi-Kennett bug class).
- **Dead-end stub** branches N off HW3 at (25,60), tip at (25,90) —
  exercises round/blunt cap modes and concave block edges.

**Why this matters for block-edge-owned ribbons.** The migration named
in "Block-edge-owned ribbons (NEXT — load-bearing)" above should land in
Toy first. The three irregularities are exactly the failure modes the
new emitter has to handle, and any visible regression in Toy is read
without LS's data-quality noise interfering. After Toy validates, LS
cuts over by changing one emitter call site.

**Phase 0e (small residual cleanup, not load-bearing).** Two static
references survive in `CartographApp.jsx`: `import toyRibbons from
'../data/toy/toy-ribbons.json'` and the hardcoded `TOY_STENCIL`
constant. Phase 0e of `TOY_AUTHORING_PLAN.md` would replace these
with scene-keyed routes (`/api/cartograph/:scene/ribbons`,
`/api/cartograph/:scene/stencil`). Worth tidying when convenient;
not blocking anything.

### Lesson logged (2026-05-07): no parallel pipelines for new scenes

The original violation that prompted the rule — a parallel toy data
pipeline (static `toy-ribbons.json` import in `_loadCenterlines`,
toy-only branch in `_saveOverlay`, sibling `ToyV2`/`NeighborhoodV2`
wrappers) — was resolved by the SCENE_REGISTRY pattern. The rule
itself stays load-bearing for **future** scenes:

- Don't write `if (scene === 'X')` in a store action / loader / render
  component. Register the scene's capability in `SCENE_REGISTRY`.
- Don't create `SceneX` / `NeighborhoodX` sibling wrappers because props
  differ. Make the canonical wrapper accept the difference as a prop.
- Don't import scene-specific JSON directly anywhere outside the
  scene-registry seed. Route through scene-keyed loaders.

Memory entry: `feedback_no_parallel_pipeline_for_scenes`.

## LS / Toy parity — three gaps (framed 2026-05-09)

Designer-side V2 already mounts in both scenes (CartographApp:768);
LS Designer goes through the same V2 path as toy. Per-block land use
just landed for both (LS reads `ribbons.faces[].use`, toy hashes
weighted-random). What's left to reach "Designer in LS feels like
Designer in toy AND Stage publishes what Designer shows":

### Gap 1 — Designer parity (~1 session)

- **Block↔chain relations.** Each block needs
  `frontageChains: [{ chainIdx, segOrd }]` so authoring can address
  "the block on Oak between 1st and 2nd" instead of an opaque
  blockKey. Computable from `byChain[i]` segment midpoints +
  point-in-polygon against each block ring (same shape as the
  existing `adjacentBlockId` helper, inverted). ~50 LOC in
  `buildBlockGeometryV2`.
- **LU authoring UI.** Right-click a block → menu of LU types →
  `setBlockLandUse(blockKey, lu)`. Setter + persistence already
  wired; needs a `<BlockEditMenu>` and a click handler on the
  per-LU block group meshes in `BlockGeometryV2Debug`.
- **OSM-tied block identity for LS.** Today bbox-key works for
  rendering. If `derive.js` could emit a stable `face.id`, LS
  authoring would survive geometry edits more cleanly. Optional
  polish — bbox-key is fine until it isn't.

### Gap 2 — Stage / Preview parity (LANDED 2026-05-09)

V2 bake adapter (`cartograph/bake-ground.js#buildV2BakeShape`) flattens
V2's per-chain output and named globals into the same
`{ byMaterial, byFaceUse }` shape the bake walks. Routed through a
`design.useV2Geometry` flag; `lafayette-square` is currently flipped
to V2 and validated visually. Adapter handles park face emission,
highway-class split, hole-aware partitioning of Clipper output.
`clipAllToStencil` taught to handle holed polygons in byMaterial.

Effluvium cleanup landed (commit `0286cb1`): `buildCornerPlug`,
`buildCurbAnnulus`, gated-false call-sites, `intersectionGeometry.js`
all deleted (−474 lines).

V1 face-clip path in `ribbonsGeometry.js` (~700 lines) and
`StreetRibbons.jsx` (~2100 lines, public-app live render) survive
behind `useV2Geometry: false` for revert-safety. Retire once
operator confirms V2 is stable across all Looks (separate sprint).

### Gap 3 — LS-only data-quality items (async, separate)

These bite when the *defaults* are wrong; V2 itself works fine on
whatever data it gets. All already in this BACKLOG under
"2026-05-06 — Data pipeline":

- ~~Highway class is `undefined` on all 242 LS chains.~~ **Resolved
  2026-05-09:** `derive.js` now carries `highway` (raw OSM tag) and
  `type` (mapped streetProfiles vocabulary) onto every emitted
  `ribbons.streets[]` entry. LS distribution: 143 residential, 23
  motorway (I-44 main), 32 motorway_link (ramps), 17 primary, 17
  secondary, plus assorted tertiary/service/unclassified.
- 190/252 IX entries in `ribbons.intersections` are
  divided-road continuation joints, not real corners. Mitigated
  client-side; better fix is in `derive.js`.
- `ix.streets[].ix` indices stale on ~36% of LS IX-refs.
  Workaround in place via `resolveIxRef`.
- Loop street designation hardcoded by name in `derive.js`.

### Honest framing

Gap 2 is the load-bearing item and it landed in one session — V2 bake
adapter behind a flag, design.useV2Geometry=true on lafayette-square,
visually verified against Designer (corner pads, ribbons, faces all
matching). Gap 1 polish remains. Gap 3 is fix-when-you-trip-on-it.

After today: full V2 stack — Designer authoring + bake → Stage/Preview
— rendering consistently on LS. Next sprint: V1 retirement, perf.

---

## Blunt / none cap geometry (queued 2026-05-09)

Round cap is done — per-side per-band quarter-discs wrap each band 90°
around the endpoint (`quarterCap` in `buildBlockGeometryV2.js`). Blunt
and none currently fall through to V2's default square segment end (no
extra geometry), which matches V1 but not the operator's intent. Three
explicit modes wanted:

- **Round** — per-side quarter-discs (existing, done).
- **Blunt** — perpendicular ped-zone band CROSSING the chain end. A
  rectangle of length = full chain width (asphalt + curb + ped on both
  sides), thickness = ped depth (treelawn + sidewalk), centered on the
  chain endpoint and oriented perpendicular to T. Reads as a "terminal
  concrete strip" — the visual cue for a real dead-end.
- **None** — square cut-off, no extra geometry. The chain just ends.
  Used at IX-handoff endpoints where another chain picks up.

Should fit alongside `quarterCap` as a sibling `perpEndBand` helper,
called from the same `if (capEnd === '...')` switch in the per-segment
loop. Per-segment effective widths apply (operator can author asymmetric
or per-side-different cap dimensions via `blockCustoms` at the endpoint
segment). Geometry must close as a polygon analogous to the round cap so
the `unionRings` / `intersectRings` / clip pipeline downstream works
unchanged.

---

## Concrete corner pad geometry — LANDED 2026-05-09

Per-corner parallelogram anchored at V, sides T_A·L_A and T_B·L_B, sized
flush to the **opposite** leg's band-outer perpendicular distance:
`L_A = outerL_B + cw + leftDepth_B`, `L_B = outerR_A + cw + rightDepth_A`.
Quads union'd (winding normalization), then intersected with the same
`blockRounded` mask the bands and block-fill use. Rendered at
`PRI.residential + 0.5` so chain treelawn/sidewalk paint over the pad
in their band-zones; pad shows only in the rounded wedge where neither
band reaches.

The clipping mask does the geometry; the pad is just a quad. No arc
math, no R lookup, no Boolean-subtract bands/curb. Files:
`src/lib/buildBlockGeometryV2.js` (`buildCornerPadQuad`),
`src/cartograph/BlockGeometryV2Debug.jsx` (renderOrder).

---

## Survey-time arc smoothing (replaces per-vertex Measure smoothing 2026-05-09)

In-line per-vertex smoothing in Measure (purple dots on non-IX
bends, drag-to-fillet R) was removed. The previous implementation —
`vertexSmoothing[chainIdx][vertexIdx]`, `filletChainVertex`,
`applyChainSmoothing`, `computeSmoothLayout`, `setVertexSmoothing`,
the smoothing dots in `CornerEditHandles` — applied a render-time
fillet to the centerline before per-segment ribbon emission. Wrong
layer: a smoothed centerline is a Survey-time *shape* concern, not
a Measure-time *width* concern.

The right place is Survey: when an operator authors a chain that
should be a smooth arc (a curving residential street, a roundabout
approach), the centerline should *be* a smooth arc — sampled to a
dense polyline at Survey time, persisted as `street.points`. After
that, every downstream pass (V2 emission, IX corner round-corners,
bake) gets correct geometry from the source data, no per-vertex
fillet pass needed.

Survey already has `street.smooth: 0..1` + `subdividePolyline`
(Catmull-Rom) wired through `streetProfiles.js`. Two things to
make this complete:

1. **Bake the smoothed sample into `street.points`** instead of
   sampling at render time — so the persisted shape is what every
   consumer sees.
2. **Per-vertex authoring on the Survey side** if the operator needs
   it (Illustrator pen tool model: drag a chain vertex into an arc
   handle). Optional polish; the per-chain `smooth` slider covers
   ~80% of intent.

When this lands, near-straight bends get smooth handling for free
(the auto-smooth-threshold proposal also retired with this entry —
a good Survey representation makes the threshold unnecessary).

---

## Lesson logged 2026-05-07: stop parallel-piping toy

While iterating V2 in toy this session, the next operator (me) added a
second data path for "scene === 'toy'" instead of treating toy as a
different *scene name* against the same path. Symptoms in the diff:

- `_loadCenterlines` has a toy branch that synthesizes from a static
  `toy-ribbons.json` import, bypassing `fetchCenterlines/Overlay`.
- `_saveOverlay` early-returns on toy because no toy overlay endpoint
  exists; toy edits are silently in-memory.
- `CartographApp` has sibling `ToyV2` and `NeighborhoodV2` wrappers,
  one passing a stencil literal, the other not.
- V2 reads `toyRibbons.intersections` (static) for toy and
  `ribbonsRaw.intersections` (static) for LS — both scenes work
  around the same gap (intersections aren't in the live store).

The right shape is what `cartograph/TOY_AUTHORING_PLAN.md` already
specified: scene-parametric server routes (`/api/cartograph/:scene/...`),
per-scene file layout (`src/data/<scene>/centerlines.json` +
`overlay.json` + `intersections.json`), one branch in the store, one
V2 wrapper. "Toy" then *is* cartograph, doped with a small persistent
Scene — not a parallel pipeline.

**Action**: do the refactor. See plan section "Phase 0 — Plumbing".
Net code goes down: collapse the toy branch in `_loadCenterlines`,
drop `ToyV2`/`NeighborhoodV2` distinction, drop the toy gate in
`_saveOverlay`. The static `toyRibbons` import retires.

## Data-pipeline truths surfaced 2026-05-06

Diagnosed during the IP-rule attempt + LS-rollout debugging session. These
hold regardless of which corner-architecture (rounded-block-clip is next)
the next operator picks — wire them into block-polygon derivation from
day one or the same hours of confusion repeat.

1. **`ix.streets[].ix` indices in `src/data/ribbons.json` are STALE on
   ~36% of LS IXs.** Chain points were re-coordinated upstream but IX
   references weren't updated. Symptom: `chain.points[sref.ix]` is
   either `undefined` or hundreds of meters from `ix.point`. Mitigated
   (2026-05-12): both V2's `resolveIxRef` and `CornerEditHandles`'s
   `resolveSrefChain` try `sref.ix` first then fall back to nearest-
   vertex scan within 0.5m of `V`. Also routed through
   `resolveChainSegmentation` (2026-05-11) which computes IX identity
   by coord-match across chains, so `naturalSegments` and the walker
   no longer trust the integer either. Walker fix removed this as a
   user-visible bug; index column kept as eventual-truth derive fix.

2. **Multiple chains share a street name.** Rutger Street has 5 entries
   (`rutger-street-0..4`), Park Avenue has 2, Hickory has 4, etc. A
   `Map(name → chain)` lookup (`streetByName.get(sref.name)`) returns
   only one entry — usually the wrong one. Iterate all entries with
   matching name and pick by nearest-point to V:
   ```js
   const streetsByName = new Map()
   for (const st of ribbons.streets) {
     if (!streetsByName.has(st.name)) streetsByName.set(st.name, [])
     streetsByName.get(st.name).push(st)
   }
   // for sref of ix.streets:
   for (const st of (streetsByName.get(sref.name) || [])) { /* nearest-point */ }
   ```

3. **(Retired 2026-05-08.)** segmentMeasures + couplers were the V1.5
   source of truth for per-segment per-side widths. They retire with the
   block-customs migration: `chain.measure` is the single chain-wide
   default; per-block divergence lives in `design.blockCustoms`. See
   `project_v2_measure_translucency_strokes.md` memory entry.

4. **Skip plug / corner emission when any incident chain is
   `motorway` / `motorway_link` / `trunk` / `trunk_link`.** Freeway-scale
   geometry doesn't follow urban-corner conventions — no curb returns,
   no sidewalks, no plug. This is a SEPARATE filter from the
   chains-per-vertex cap (which targets cloverleaf interchanges via
   chain-count). Both filters needed.



All three layers of the corner-radius authoring stack are live and tested
on the toy fixture:

- **Phase 1 — Look-level `cornerRadiusScale` slider.** Blocks > Shape
  in Panel (moved from Streets > Corners during the 2026-05-09
  Designer panel restructure). Range 0–11× (matches per-IX 50m cap). Persists to
  `design.json`. Threaded through `buildCornerPadClips` (bake + face
  clip) and `getR` in `StreetRibbons.jsx` (live render). rAF-throttled
  commit so the heavy useMemo doesn't choke the slider thumb.
- **Phase 2 — Per-IX center handles** with corner-edit toggle. Drag the
  big blue dot at any intersection center; world-space distance from
  cursor to IX sets the bulk radius for that IX. Persists to
  `design.json#cornerRadiusOverrides`.
- **Phase 3 — Per-corner handles, leg-pair-keyed.** Smaller cyan dots at
  each corner's Q point (outboard tangent corner of the leg curb-outer
  lines). Drag = that corner's radius only. Stable identity via
  `<pointKey>|<legKeyA>|<legKeyB>` where legKey = `<skelId>:<dir>` and
  the two leg keys are sorted alphabetically (invariant under A/B swap;
  only invalidates if one of the keyed legs is removed from the IX).
  Persists to `design.json#cornerRadiusOverrides` separately from per-IX.

Resolution priority (live + bake): per-corner override → per-IX override
→ data-file `ix.cornerRadius` → 4.5m AASHTO default, then
× `cornerRadiusScale`.

Geometry refactor under Phase 3: `buildSidewalkPads` (in
`StreetRibbons.jsx`) now emits per-corner asphalt-mouth fills + curb
annuli in addition to sidewalk pads, so the visible curb contour follows
per-corner R (not just the pad). Asphalt fill is split into THREE simple
polygons per corner (legA tail rect + legB tail rect + lens) so the
L-shape avoids self-intersection — earcut triangulates each cleanly,
they tile around Q_curb with no interior overlap. `buildCurbAnnulus`
(the legacy uniform-R Clipper-offset trick) is retained as dead code in
case of regression but no longer called.

UI handles live in `src/cartograph/CornerEditHandles.jsx`. Mounted in
Designer mode for both toy and neighborhood scenes. Revert button counts
both override maps.

**Lessons captured to memory:**
- `feedback_illustrator_handles_for_spatial_authoring` — per-feature
  spatial controls → in-scene draggable dots, never panel sliders.
- `project_overlay_meshes_must_be_transparent` — overlay meshes in
  cartograph's Canvas must use `transparent opacity={1}` to render at
  all (the post-FX / fade pipeline drops opaque meshes from the final
  framebuffer).

## 2026-05-06 — Effluvium cleanup: retired corner-management code paths (LANDED 2026-05-09)

Removed 474 lines of dead V1 corner geometry: `buildCornerPlug`,
`buildCurbAnnulus`, gated-false call-sites, `cornerBoundaries` array,
`corner_sw`/`corner_asph` material entries, dead import. Whole file
`src/lib/intersectionGeometry.js` deleted — all four exports
(`CORNER_RADIUS_M`, `cornerRadiusFor`, `offsetArcStrip`,
`buildIntersectionPolygon`) had zero importers. Commit `0286cb1`.

## 2026-05-06 — Data pipeline: classification gaps in `ribbons.json`

Surfaced during the neighborhood roll-out. Both fall outside the
corner-authoring kit itself (the kit handles whatever the data hands it)
but limit how well the kit lands on LS until they're addressed.

- ~~**`highway` field undefined on all 242 chains.**~~ **Resolved
  2026-05-09** — `derive.js` now carries `highway` (raw OSM tag) and
  `type` (mapped streetProfiles vocabulary) onto every emitted
  `ribbons.streets[]` entry. `cornerRadiusFor` and any other
  class-conditional logic can now consult per-class defaults instead
  of falling through to residential everywhere.

- **Divided-road continuation joints pollute the IX list.** 190 of the
  252 entries in `ribbons.intersections` only have 2 chain refs, and
  many of those are points where one corridor's two carriageways meet
  end-to-end (e.g., `Park Avenue@21` + `Park Avenue@0`) rather than a
  real corner. Mitigated 2026-05-06 by a `distinctNames >= 2` filter
  in three places (StreetRibbons.jsx#buildSidewalkPads,
  ribbonsGeometry.js#buildCornerPadClips, CornerEditHandles.jsx#
  computeIxLayout) — if a "intersection" has only one corridor name,
  we skip it. **Better long-term**: filter at derive.js so `ribbons.json`
  doesn't ship these as intersections in the first place.

- **Real intersections missing from the IX list.** Operator reports
  several visible intersections in LS where no corner handle appears.
  Likely a derive.js IX-detection gap (some endpoint-on-interior or
  segment-crossing case being missed). Concrete repro list TBD —
  needs a session with the operator pointing at specific marquee IXs
  (Park & 18th, Lafayette & Mississippi, etc.) and cross-checking
  against `ribbons.intersections`.

## 2026-05-06 — Roll the kit onto neighborhood data

The corner-authoring kit is currently exercised on the toy fixture only.
For real LS:

- Re-bake LS with a default `cornerRadiusScale = 1` and zero overrides;
  verify Stage/Preview render correctly (no regression vs. pre-kit
  baseline).
- Pick a sponsored-event Look (or fork `lafayette-square` to a new id)
  and dial `cornerRadiusScale` up for the bubbly variant; bake; eyeball
  in Preview at phone aspect.
- Spot-author a few corner overrides at marquee intersections (Park &
  18th, Lafayette & Mississippi, etc.) — confirm the per-IX center
  handles work at neighborhood density (~243 intersections; performance
  and visual clutter are the risks). Adjust `HANDLE_HIT_R` and dot/ring
  visual sizes if needed for the denser scene.

## 2026-05-06 — Corner-case corners (deferred from variant grid)

Split off so the kit can land for the common (right-angle / near-right)
case without blocking on the long tail. Each item below is its own pass.

- ~~**Per-corner-decoupled `minPed`.**~~ ✅ Re-attempted 2026-05-06.
  Switched to `min(A.leftPed, B.rightPed)` (corner-facing only) in both
  `StreetRibbons.jsx#buildSidewalkPads` and
  `ribbonsGeometry.js#buildCornerPadClips`. Each corner now stands on
  its own. Re-validate against the v1 toy on next refresh; the earlier
  attempt was reported as regressing the sw↔sw junction at NW
  (tl+sw/tl+sw, which is the corner that actually changes value with
  the swap, 1.5m → 3m). If a regression resurfaces it'll show on v1's
  NW corner specifically — drop back into this BACKLOG item with
  symptom notes.

- **Right-angle treelawn caps at oblique angles.** At non-90°
  intersections the per-leg treelawn carve box (leg-axis-aligned) meets
  the corner pad's annular sector at oblique angles, producing acute
  corners on the rendered treelawn region instead of clean right-angle
  cuts. At 90° everything is right-angle by construction, so this only
  bites at 45°/60°/30° variants. Likely fix: terminate the treelawn
  carve perpendicular to the leg with an explicit cap at the pad-arc
  side, rather than letting the leg-aligned rectangle run through.

- **5-way / acute-X sidewalk fragments.** v8 (5-way) and v3/v7 (45° /
  30° X) variants show stray sidewalk fragments outside the corner
  pads. Probably the same family — pad polygon Boolean against
  leg-aligned carves leaves disconnected sliver regions when leg angles
  are tight. Diagnose alongside the right-angle treelawn fix.

- **Use the global slider as a deformation probe.** Once the
  corner-plug fixes start landing, drag `cornerRadiusScale` across its
  full range while watching a non-90° toy variant. The construction's
  failure modes vary continuously with R (small R → degenerate Q,
  large R → carve overshoots), so the slider surfaces breakpoints a
  static R=4.5 screenshot can't. Useful for both diagnosis and
  regression-checking proposed fixes.

- **Stacking / overlapping architecture (ramps, frontage roads,
  freeway interchanges).** The kit's geometric model assumes coplanar
  legs meeting at a single planar vertex V — fine for residential
  grids, breaks down for multi-level interchanges where lanes cross
  in 3D, on/off ramps fan out at a single elevation, or frontage roads
  parallel a freeway with separate intersections sharing similar XZ
  coordinates. Lafayette Square has none of these; future
  neighborhoods that do (anywhere with an interstate cutting through)
  will need a separate authoring model layered on top of this one.
  Author Jacob flagged the constraint 2026-05-06 alongside the
  neighborhood roll-out.

## 2026-05-06 — Preview quality pass: arc smoothness

Curb / pad-inner / corner-arc polylines are currently sampled at
`~12/π` rad density (≈ 1 sample per 15°) plus a hardcoded `N=8` on the
corner-pad inner concentric arc. At zoom-in (Preview closeup) the
chord segmentation is visible. Bump points:

- `src/lib/intersectionGeometry.js` — `segs = Math.max(4, Math.ceil(theta * 12 / Math.PI))`
- `src/components/StreetRibbons.jsx#buildSidewalkPads` — `arcSegs` same formula + the inner-arc fixed `N = 8`
- `src/lib/ribbonsGeometry.js#buildCornerPadClips` — `arcSegs` same formula + the inner-arc fixed `8`

All three need bumping in lockstep so live render, face clip, and bake
agree on point density. Defer to the end-of-project quality pass; tune
density vs. tri-budget when Preview camera framing is locked.

## 2026-05-05 — Wire the Look picker (cosmetic-only today)

The Designer panel's top "Lafayette Square" section is currently chrome:
caret + label, with a "+ add look" button inside that no-ops. Real wiring
needs:

- Enumerate available Looks from `public/looks/index.json` (already fetched
  by `fetchLooks()` in `src/cartograph/api.js`) and render them as the
  picker body, with the active one marked.
- Selecting a Look sets `activeLookId` in the store; downstream pumps and
  the bake fetcher re-key off it (already supported — see
  `CartographApp.jsx:587`'s `useEffect` on `activeLookId`).
- "+ add look" should fork the active Look's `design.json` to a new id,
  add an entry to `looks/index.json`, then activate it. Bake stays stale
  until operator triggers it.
- Stage panel needs the matching picker so Designer ↔ Stage stay in sync
  on which Look is being edited.

Out of scope until there's a second Look worth authoring; the current UI
preserves operator muscle memory ("the picker is up there") without
committing to plumbing.

## 2026-05-05 — Designer toggles ↔ Stage Surfaces parity (LANDED)

Operator's contract: **everything toggleable in the Designer panel must be
hide-able in Stage/Preview, with its color/material authored from the Stage
Surfaces panel.** Full sweep landed 2026-05-05.

**Bake-side (`cartograph/bake-ground.js`):** now reads `map.json` directly
in addition to `ribbons.json` and emits a bake group for every Designer
toggle. New groups: `parking_lot`, `garden`, `playground`, `swimming_pool`,
`pitch`, `sports_centre`, `wood`, `scrub`, `tree_row` (polygon overlays);
`alley` (split out from asphalt — was previously folded in by
`ribbonsGeometry.js:489`); `stripe`, `edgeline`, `bikelane`, `fence`,
`wall`, `retaining_wall`, `hedge` (buffered polylines via new
`polylineToRing` helper, half-widths in `POLYLINE_HALF_WIDTHS` mirror
`MapLayers.jsx:stripeRibbonGeo`). `clipAllToStencil` exported from
`ribbonsGeometry.js` and re-run after injection so overlays don't leak past
the silhouette.

**Bake honors Look colors.** `bakeGround()` loads `public/looks/<look>/design.json`
and resolves color in priority order: `design.layerColors[BAND_TO_LAYER[key] || key]`
→ `DEFAULT_LAYER_COLORS` → `BAND_COLORS` → grey. Faces resolve via `design.luColors`.
Routing through `BAND_TO_LAYER` lets the operator's `street` color reach the
`asphalt` group. (Closes the 2026-05-04 separate item.)

**Stage Surfaces (`src/cartograph/CartographSurfaces.jsx`):** `parking_lot` row
added to Blocks tab. All other Designer-toggleable ids already had Surfaces rows.

**ParkWater visibility (`src/components/LafayettePark.jsx`):** ParkWater now
fetches `scene.json` and early-returns when `layerVis.water === false`.
Mirrors the BakedLamps / BakedBuildings pattern.

**Followups (not blocking):**
- The Designer `lot` toggle has no bake group of its own — `lot` is the generic
  block-interior color, but the bake's face fills (residential/commercial/etc.)
  paint that surface via LU instead. Consider either (a) wiring `lot` to
  collectively gate all LU faces, or (b) removing the toggle. Cosmetic for now.
- `parking_lot` bake group color may visually compete with the `parking` LU face
  color on blocks where amenity=parking dominates the whole block — both fire
  on the same footprint (LU face under, parking_lot overlay on top). Operator
  to tune in Stage Surfaces.
- Sharp-corner self-intersection in `polylineToRing` is theoretically possible
  for buffered polylines that turn ~180°. Not observed in current data; if
  bake artifacts develop visible glitches at barrier corners, swap to
  per-segment quads.
- `labels` Designer toggle still has no Stage/Preview rendering surface
  (intentional today — labels not in shot views). If labels-in-shots becomes
  a feature, wire through then.

## 2026-05-04 — Survey polish project (8 phases)

End-to-end polish pass on the Survey tool, designed in conversation with operator
2026-05-04. Phases are mostly independent; can be worked in parallel after Phase 0.
Whole-intersection plugs (separate plan, below) plug in alongside this — they replace
the legacy "Measure: fix corners" item and supersede corner-plug authoring entirely.

### Phase 0 — Baseline read (1 hr)
Confirm two unknowns before file-level work:
- Are path/alley features in `centerlineData.streets` selectable by `SurveyorOverlay`,
  or excluded by source/type filter?
- Does the skeleton mark T-junction vertices distinctly, or is every vertex a polyline
  point?

### Phase 1 — (RETIRED 2026-05-08)
Couplers retired entirely with the V2 block-customs migration. Per-block-edge
divergence is authored via right-click → "Adjust this block" in Measure mode;
the data lives in `design.blockCustoms`. See
`project_v2_measure_translucency_strokes.md` memory entry.

### Phase 2 — Cap stitching (cul-de-sac arcs that meet)
When two adjacent caps with mismatched arcs near-meet, generate a connector envelope.
- Detect adjacent `capEnd === 'round'` endpoints in `ribbonsGeometry.js` whose
  terminal disks overlap or near-meet.
- Add `capStitch` polygon: sweep connecting outer arcs as a single filled silhouette.
  Flows automatically into live render and bake (consolidation makes it free).
- Threshold: only stitch if gap < N meters (constant, not per-street).

Open: when constitutions differ (one cap has treelawn, one doesn't), absorb wider down
to narrower via linear taper, or render with a notch? Recommend: linear taper.
Estimate: 2 days stitch + 1 day taper.

### Phase 3 — Marquee select + continuity merge (SCOPE-REDUCED 2026-05-04)
Visual fix at Dolman/18th-style steps now absorbed by the whole-intersection-plug
project (transition-plug case = 2 chains with mismatched ribbon widths). What
remains here is *naming/styling* unification — declaring two skelIds are one street
for label/Look purposes — not the geometric stitching.
- Marquee tool in `SurveyorOverlay`: drag-rect selects vertices across multiple streets.
- Multi-select state in `useCartographStore`.
- New panel action when marquee spans 2+ streets: "Merge as continuous" → writes a
  `continuity` pair link to `overlay.json` keyed by skelIds.
- Ribbon assembly honors continuity at bake time: profiles linearly blend across the
  join.

Open: pair link vs. group. Recommend pair, transitive resolution at bake.
Estimate: 1.5 days marquee + 1.5 days render.

### Phase 4 — Highway hierarchy z-order (partially shipped 2026-05-04)
- ✅ `osmHierarchyScore(highway)` helper added to `streetProfiles.js`.
- ✅ Applied as `renderOrder` offset on path/alley/footway/cycleway meshes
  (`StreetRibbons.jsx:1797`). Higher-class paths now paint over lower-class on
  coplanar overlap.
- [ ] **Street stripes don't yet split per class.** Stripes (asphalt/sidewalk/treelawn)
  merge across all streets sharing a band, so per-street hierarchy never reaches
  `renderOrder`. To make motorway_link paint *under* motorway, the stripe emission
  needs to split bands by hierarchy class (motorway-asphalt vs residential-asphalt as
  separate meshes) OR Clipper-subtract lower-class outlines from higher-class ones.
  Helper is ready; structural change is the next step.
- [ ] **Per-street override** (auto/above/below tristate) — deferred until structural
  split lands.

### Phase 5 — Loop road designation
Lift hardcoded `LOOP_STREET_NAMES` (`cartograph/derive.js:1297`, 7 references) into
operator-facing flag.
- Add `isLoopStreet: bool` to overlay.json per-street.
- Survey panel checkbox: "Loop street (frontage stem + closed loop)."
- Replace all `LOOP_STREET_NAMES.has(name)` checks with `street.isLoopStreet`.
- Migrate Benton + Mackay at migration time; delete the constant.

Estimate: ½ day.

### Phase 6 — Bring alleys/paths into authoring layer (BLOCKED 2026-05-04)
Investigation found: `skeleton.json` has 1702 paths under a separate `paths` key
(positionally-keyed `path-N` IDs); `ribbons.json` has 145 alleys + 345 paths
(neighborhood-filtered, no stable IDs at all). `_loadCenterlines` only reads
`skel.streets`, which is why alleys/paths aren't surveyable today.

**Blocker:** neither source carries operator-stable IDs for paths. Surfacing them
into `centerlineData.streets` would let the operator click them but their authored
state (caps, smooth, etc.) couldn't survive a skeleton rebuild.

**Required prework (1 day):**
1. `cartograph/skeleton.js` — generate stable path IDs from canonical OSM way IDs +
   sources (mirror the pattern used for streets).
2. `cartograph/derive.js` / `promote-ribbons.js` — propagate path IDs through
   ribbons.json so the live render keys by the same ID the store uses.
3. Then merge paths into `centerlineData.streets` with a `kind: 'path'` flag (½ day).

Note: Measure-side alley work (trim to land-use boundary as defined by ribbons) is a
separate Measure-polish project.

### Phase 7 — Smooth, made real (Designer-side shipped 2026-05-04)
- ✅ Per-street `smooth: 0..1` field on overlay/store, persisted via `_saveOverlay`.
- ✅ `subdividePolyline(pts, smooth)` Catmull-Rom point sampler in `streetProfiles.js`.
- ✅ Smooth slider in `SurveyorPanel`.
- ✅ Live render applies subdivision in `StreetRibbons.jsx` merge step (`merged.points`).
  Authored vertex markers in `SurveyorOverlay` stay at original points (markers read
  `centerlineData.streets`, not the merged ribbons).
- [ ] **Bake propagation TODO.** `cartograph/derive.js` reads overlay but does not yet
  call `subdividePolyline` on `street.smooth`. Stage/Preview will look unsmoothed
  until derive subdivides at the same point ribbons.json's street.points are emitted.
  ~½ hour follow-up.
- [ ] **Preview overlay deferred.** Side-by-side original (dashed) vs smoothed (solid)
  visualization in SurveyorOverlay — defer until the wiring is field-tested.

Open: per-street vs per-segment (between couplers). Per-street is what shipped.

### Phase 8 — Saint Vincent + S. 21st blue wash
Investigate why these two streets don't get the blue stripe (likely missing `measure`
in overlay.json or missing measurements.json entry). Data fix.
Estimate: 30 min.

### Sequencing
```
Phase 0 (baseline)                         1 hr
  ├── Phase 1 (RETIRED — see block-customs)  —
  ├── Phase 5 (loop designation)           ½ day
  ├── Phase 4 (z-order)                    ½ day
  ├── Phase 6 (alleys in authoring)        1 day
  ├── Phase 8 (blue wash)                  ½ hr
  └── Phase 2 (cap stitching)              3 days
                ▼
        Phase 3 (marquee + continuity)     3 days
                ▼
        Phase 7 (smooth + preview)         2 days
```

## 2026-05-04 — Whole-intersection plugs (in design)

Replaces per-corner plug authoring entirely. Sibling project to Survey polish above;
no conflicts (Survey Phase 1 owns ribbon-side-of-centerline, this owns intersection
footprint geometry).

### Dataflow framing (load-bearing — don't lose this)

The intersection polygon is **derived live from ribbon outlines**, not from a stored
"setback" parameter. Same dataflow line as the ribbon outline itself: change a Measure
input → ribbon outline grows → intersection polygon's leg-mouth grows → marking
positions track. No setback concept exists in the data model. If you find yourself
adding a `setback` field to overlay.json, stop — you're solving the wrong problem.

### Geometry construction
1. Each incoming ribbon outline already self-computes via `ribbonsGeometry.js`.
2. At skeleton vertex V (≥2 chains), detect overlap among the N incoming ribbon outlines.
3. Intersection polygon = Clipper union of (incoming ribbon outlines near V) + corner
   connectors (arc or line) bridging the *gaps* between adjacent legs' outlines.
4. Ribbons render unchanged — they keep going to V; the intersection polygon overlays
   on top. Stripes inside ribbons that fall inside the intersection polygon get clipped
   at render time (the polygon owns its own painted markings).

Result: ribbons stay dumb and self-contained; intersection polygon is purely additive.
Oblique angles and 5+ way intersections work without special-casing — one algorithm.

### Auto-generate everywhere (decision 2026-05-04)
Every skeleton vertex with ≥2 chains gets a polygon by default. Operator opts out
per-intersection (`disabled: true`) for grade-separated crossings (overpasses).

### Three behaviors fall out of one algorithm
- **≥3 chains at vertex** → intersection plug (the headline case)
- **2 chains, ribbon widths differ** → transition plug (Dolman/18th continuity case)
- **2 chains, widths match** → no polygon needed (today's behavior)

This absorbs Survey Phase 3's continuity/stitching geometry for free — the visual fix
at Dolman/18th-style steps falls out of the same union+connector machinery. Phase 3's
marquee + "merge as continuous" remains useful for *naming/styling* unification but
is no longer load-bearing for the visual problem. Mark Phase 3 as scope-reduced.

### Corner radius from ADA + DOT guidelines (decision 2026-05-04)
Default corner radius derives from a lookup table keyed by (highway class pair, angle):

- AASHTO Green Book minimum corner radii by class pair:
  - residential ↔ residential: 4.5m (15ft)
  - residential ↔ collector (secondary): 7.5m (25ft)
  - collector ↔ arterial (primary): 9–15m (30–50ft)
  - arterial ↔ arterial: 12–15m (40–50ft)
  - any ↔ motorway/trunk: 15m+
- NACTO Urban Street Design Guide: smaller-is-better for pedestrian safety; 3–4.5m
  preferred in urban contexts. Lafayette Square is dense urban → bias toward NACTO low
  end (3–6m) for residential intersections, AASHTO mid-range for arterials.
- ADA curb-ramp rules: ramps align with pedestrian crossing path; smaller radius = shorter
  crossing distance = ADA-friendlier. Doesn't set radius directly but reinforces
  smaller-is-better.
- Angle factor: sharper angles between legs → slightly larger radius for drivability.

Implementation: lookup table `CORNER_RADIUS_M[classPair]` with angle multiplier
`f(angle) = clamp(1 + (90° − angle) / 90°, 1, 1.5)`. Operator override per-intersection
(`cornerRadius: auto | meters`).

### Pad geometry from NACTO/AASHTO/ADA convention (decision 2026-05-05) ★ IP

The corner pad's outer property line is the **concentric offset of the curb arc by the
WIDER of the two adjacent legs' full ped-zone widths** (treelawn + sidewalk per side).
This is the load-bearing geometric rule of the plug system — note it carefully because
it's the part of the procedural-cartography pipeline most worth claiming.

**Engineering basis (each guideline applied):**

1. **AASHTO Green Book**: the curb-return radius R is set by class pair + angle
   (already wired into `CORNER_RADIUS_M`).
2. **NACTO Urban Street Design Guide**: at urban corners, the property-line arc is
   the concentric offset of the curb arc — pedestrian zone wraps the corner at a
   constant outboard distance from curb.
3. **ADA PROWAG (§R304)**: the corner landing area must be paved sidewalk material,
   never grass / treelawn. → in our model: treelawn never paints inside the pad area.
4. **Wider-leg dominates**: when legs differ, the convention pegs the pad to the
   wider leg's natural property-line offset. The narrower leg's sidewalk effectively
   widens at the corner to match. Real-world corner parcels typically have setbacks
   sized to the wider street's ped zone, and pedestrians benefit from the larger
   landing area for crossings.

**Construction (procedural — no per-corner authoring required):**

Per vertex V with incident legs `legs[i]`:
1. R = `cornerRadiusFor(highwayA, highwayB, angleDeg, look.cornerRadiusScale)`.
2. **Asphalt polygon** = `buildIntersectionPolygon(V, legs_asphalt, { override: R })`,
   then Clipper-union(legShapes ∪ fillets). `legs_asphalt[i].outerL/outerR =
   pavementHW`. Corner arcs concentric with C, radius R.
3. **Curb-outer polygon** = `buildIntersectionPolygon(V, legs_curb,
   { override: R - CURB_WIDTH })` then Clipper-union. `legs_curb[i].outerL/outerR
   = pavementHW + CURB_WIDTH` per side. The R-shrink + leg-widen trick keeps C
   fixed (algebra: `C = Q + R/sin(θ/2) · bisector`; widening Q by Δ in perp and
   shrinking R by Δ leaves C invariant).
4. **Pad-outer polygon** = `buildIntersectionPolygon(V, legs_pad,
   { override: R - CURB_WIDTH - leg.outerPedΔ })` then Clipper-union. Per-leg-
   per-side widening: `legs_pad[i].outerL = pavementHW + CURB_WIDTH + leg.leftPed`,
   `outerR = pavementHW + CURB_WIDTH + leg.rightPed` (legPed = treelawn + sidewalk
   per side). Same C-preservation logic as curb.
5. **Curb annulus** = curb-outer ⊖ asphalt; emitted as `curb` material.
6. **Pad annulus** = pad-outer ⊖ curb-outer; emitted as `sidewalk` material.
7. Leg stripes (asphalt, curb, treelawn, sidewalk) Clipper-differenced against
   pad-outer polygon — leg ribbons butt against the plug perimeter cleanly.

All three stack levels share C as their common arc center, so corner arcs are
C¹-continuous and tangent-aligned with the leg edges by construction. Leg-rectangle
far ends align across the stack (the tangent point's projection onto T is constant
under the C-preserving widen+shrink), so annuli butt at flat radial caps.

⚠️ **Do NOT use `ClipperOffset` for curb-outer / pad-outer.** A previous attempt
(2026-05-06) used `ClipperOffset(asphalt, +CURB_WIDTH + padWidth, jtRound)` for
the stack and produced visible bulbs at every leg-rectangle far end (jtRound
rounding the asphalt's perpendicular cap). The bulbs were image-confirmed broken,
the approach reverted. The leg-widen + R-shrink construction above is the only
known way to keep all three arcs concentric without bulbs. See
`memory/project_intersection_plug_geometry.md` rules #2–4 for the full algebra.

**Continuity contract (run this BEFORE iterating on visual artifacts):**

The corner pad is not a free-floating polygon — it must be the exact extension of
the leg ribbon's three concentric edges into the intersection. Leg ribbons render
in a separate band-stripe pass that runs from chain-start to chain-end at known
perp positions; the corner pad is what closes the open ends of those bands at V.

For each leg L incident to V, sample any chain vertex P on L well away from V
(say, 5 m along the chain). At that sample:

- `asphalt-outer` polygon edge perp from chain centerline = `pavementHW(L)` per side
- `curb-outer` polygon edge perp from chain centerline = `pavementHW(L) + curbW` per side
- `pad-outer` polygon edge perp from chain centerline = `pavementHW(L) + curbW + ped(L, side)` per side
  (where `ped = treelawn + sidewalk` on that side of L)

If any of those three checks fail, the IP polygon is in the wrong coord space or
has the wrong inputs — fix that before staring at the corners. Do not iterate on
overshoot/trimming/fillet tuning until all three pass on a flat 4-way 90° toy IX
with symmetric ribbons (the simplest case). Then re-check on an asymmetric IX.

A console check + a screenshot showing leg-ribbon and corner-pad sharing a
single continuous outline is the acceptance test, not "looks roughly right."

**Why it's IP-worthy:** the pipeline procedurally derives ADA/AASHTO/NACTO-compliant
urban corner geometry from minimum data (centerlines + measure widths + OSM class +
optional `cornerRadiusScale` slider). Competing 3D map systems either author the
corner geometry by hand (Mapbox-style street-level rendering) or skip it entirely
(Google Maps' cartographic style is post-hoc, not engineering-grade). Cartograph's
deliverable is a slab whose corners would pass a plan-review desk-check.

**Operator dial (future Stage Surfaces slider):**
- `cornerRadiusScale` (default 1.0): multiplier on the AASHTO baseline. 0 = square,
  1 = baseline, 2 = chunky/freeway-ish.
- Per-vertex override `intersections[vertexId].cornerRadius: 'auto' | <meters>`
  (escape hatch).

**On asymmetric vertices (decision 2026-05-05):**
The per-leg-per-side widening in step 4 (`outerL = pavementHW + curbW + leftPed`,
`outerR = pavementHW + curbW + rightPed`) makes the pad polygon's outer edges
land EXACTLY on each leg ribbon's natural pad-outer perp per side. When leg-sides
differ across the vertex (asymmetric pavements or asymmetric peds), C is no
longer perfectly concentric with asphalt's C — but each per-corner arc still
passes through both adjacent legs' natural pad-outer endpoints with C¹-tangent
transitions. The continuity contract still holds; visual smoothness at the
corner arcs stays acceptable.

**Chain-count cap for freeway interchanges (decision 2026-05-05):**
Vertices with > 4 distinct chains skip plug emission. Real freeway interchanges
(cloverleafs, ramp merges at oblique angles) don't follow urban-corner geometry —
no sidewalk, no curb radii in the same sense, often topologically intricate.
Procedurally generating a plug there produces garbage; instead leg ribbons render
as-is at the interchange. Cap implemented as `MAX_PLUG_CHAINS = 4` in
`gatherPlugVertices`. Tradeoff is intentional: simpler authoring rules + sane
output for non-urban intersections, at the cost of "no corners" rendering for
freeway interchanges (which look messy IRL anyway).

### Markings deferred (decision 2026-05-04)
Phase A geometry only ships first. Crosswalks / stop bars / yield triangles / turn
arrows / curb ramps / painted islands all land in Phase C+ once geometry is stable.

### Per-intersection authoring data
Stored in `overlay.json` under `intersections: { [vertexId]: {...} }`. vertexId =
stable hash of skeleton coords so it survives skeleton rebuilds.
- `disabled: bool` (default false)
- `cornerRadius: 'auto' | meters` (default 'auto' — derive from class pair + angle)
- `cornerStyle: 'arc' | 'line'` (default 'arc')
- `style: 'standard' | 'painted' | 'brick' | 'cobblestone' | 'uncontrolled'` (Stage hooks)
- `legs: { [adjacentSkelId]: { ...future markings flags } }` (Phase C+)

### Upstream changes
- `src/lib/ribbonsGeometry.js` — `buildRibbonGeometry` adds `intersectionPolygons[]` to
  its output. Computed via Clipper union + corner-connector arcs.
- `src/components/StreetRibbons.jsx` — renders intersection polygons in the same pass
  as ribbon faces. Same default material; overridable per-Look.
- `cartograph/derive.js` — block/parcel cutting passes now use (ribbon outlines ∪
  intersection polygons) as the cutter. Structurally similar Clipper pass.
- Corner-plug code retired. `project_corner_plug_open_problem.md` open problem dissolves.

### Authoring UX
New **Intersection panel** in Survey, opens when operator clicks an intersection node
(same SurveyorOverlay handler that currently dispatches street/node selection adds an
intersection-vertex case). Click a non-street region near a vertex → panel opens.

### Phases
```
Phase A — Geometry foundation                 3 days
  Detect intersection nodes; compute polygons via union + corner connectors;
  retire corner-plug code. No authoring UI yet, no markings.

Phase B — Authoring panel                     2 days
  Intersection click target in SurveyorOverlay; Intersection panel;
  per-vertex overrides written to overlay.json `intersections: {}`.

Phase C — Crosswalks                          1 day  (deferred)
Phase D — Stop bars + turn arrows             2 days (deferred)
Phase E — Curb ramps + style presets          2 days (deferred)
```

MVP = A + B (~5 days). Markings (C–E) follow once A+B prove stable.

## 2026-05-04 — Camera + orientation followups

- [ ] **Restore compass rose to Browse.** Was crowded out by other on-screen elements; especially relevant now that the Heading slider lets the operator orient screen-up away from compass-N. Without it, users will assume screen-up = compass-N (and vice versa).
- [ ] **Persist Browse target/altitude/FOV** alongside Heading. Today only the heading is persisted to localStorage (`stage.browse.heading`); the rest of the Browse panel's sliders push live but reset to `SHOTS.browse` defaults on shot transition.
- [ ] **Fence corner authoring from real GPS** in `LafayettePark.jsx`. The `parkAxisToCompass(±a, ±a)` helper is concise but bakes a hardcoded -9.2° tilt; a kit version would pull the four real corner GPS points through `wgs84ToLocal` for an honest source-of-truth.

## 2026-05-13 — v1 punchlist (supersedes 2026-05-03)

The current blocker list for v1 of the visual stack. Once this clears, the
**LS base-map swap** (the marriage leap — see `project_ls_basemap_swap.md`)
is the last move before returning to the consumer app proper. Weather pack
and arborist continue evolving on their own tracks (see their sections
below) — not punchlist-gating.

### Clouds
- [ ] **Ship v1 clouds; Meteorologist runs as a separate track.** Old
  noise-based `CloudDome.jsx` (v1) is the v1 shipper — get it back to a
  working state. Meteorologist (volumetric raymarch, 52-preset Teapot,
  16-rule Almanac) continues evolving and lands when ready, not as a v1
  blocker. See `meteorologist/SPEC.md`.

### Roofs — TABLED pending PlaceCards data route
- [⏸] **Damaged roofs fix waits on PlaceCards user-edit route.**
  Investigation 2026-05-13: `src/data/buildings.json` has **0** authored
  `roof_shape` fields; `src/data/buildingOverrides.json` is empty. Every
  roof shape today is a heuristic output (`classifyRoof()` in
  `src/components/LafayetteScene.jsx` + `classifyRoofFor()` in
  `cartograph/bake-buildings.js` — both year/stories/footprint rules).
  The "damaged" roofs are the subset where that heuristic emits a
  non-flat shape that renders broken.
  - Per-building one-off overrides rejected: tried in past sessions,
    grueling and ineffective.
  - Heuristic-wide flat-default rejected: kills correct-looking mansards
    and hips along with the broken ones.
  - **Correct route:** match the rest of the system — dope the artifact
    with a best-guess seed (existing heuristic OR baked-into-data field)
    and let the end-user edit via PlaceCard. Roofs become one of the
    user-defined elements on the elaborated PlaceCard.
  - **Blocker:** dedicated session to plan the PlaceCard elaboration +
    stand up the data route from PlaceCard edits → building record →
    bake. Not load-bearing right now; fine to hold.
  - When unblocked: roofs becomes a Stage/Preview fix-up authored
    per-building in PlaceCard, not a cartograph-side bulk change.

### Designer Panel — IA pass (render stack order)
- [x] **Render stack order pass — addressed 2026-05-13 PM.** Re-interpreted
  as the *paint order* of overlapping surfaces (the original phrasing
  "logic order of everything therein" meant Z-order, not section
  ordering). Park-side stack audited and fixed: park paths now auto-detect
  bridges over water (raised to clear water + island), polygonOffset
  added to path material to stop lake-perimeter z-fight at the bank.
  Designer V2 / bake stacks confirmed coherent. Separate **Y-offset →
  polygonOffset coplanar sweep** remains open under Designer/Preview UX
  below.

### Trees — Procedural fallback v1 (shipped 2026-05-14, commit `dbbd1ed`)
- [x] **Resurrect `ParkTrees` algorithm as an Arborist generator.** Lifted
  `growBranch` / `addLeaf` / `makeBranch` + per-shape branching configs
  from `43c4aa3~1` into `arborist/generate-procedural.js` as a pure
  parameterized function
  `generateTreeMesh({preset, seed, dbh, canopyR, canopyH, branching, leafMorph}) → {barkGeo, leafGeo}`.
  Parameter-first discipline held: every variant in the PRESETS table is
  a plain `params` object, no hardcoded shortcuts. The eventual UI binds
  sliders to the same signature.
- [x] **Publish through the existing pipeline.** Generator emits a
  multi-node source GLB (one node per variant); shells out to
  `publish-glb.js` per species (5 invocations); variant detection splits
  via `namesSuggestVariants`; 3 LODs + manifest.json emitted unchanged.
  No fork of publish-glb / atlas-pack / bake-look / bake-trees.
- [x] **Species model: one species per morphology.** Five species
  published with 11 total variants:
  `procedural_broadleaf` ×3 / `_conifer` ×2 / `_ornamental` ×2 /
  `_columnar` ×2 / `_weeping` ×2. Each carries `qualityOverride: 2`
  (Fill tier — patched post-publish since publish-glb writes the
  Untouched sentinel `quality: 0` by default).
- [x] **Roster sync.** Generator appends 11 entries to
  `public/looks/lafayette-square/design.json#/trees`; bake-look atlases
  them into the unified LS atlas (all 22 procedural material refs land
  in `trees-atlas.json`). bake-trees substitutes ~140/745 park
  placements onto procedurals (conifer 52, columnar 31, broadleaf 30,
  ornamental 27; weeping 0 because no shape=weeping in `park_trees.json`).
- [x] **2-line stale residue.** `src/components/R3FErrorBoundary.jsx`
  comment + `arborist/SPEC.md:16` ParkTrees reference rewritten.
- [x] **Stash-isolated commit.** 23 unrelated dirty files (terrain
  doctrine, scene labels) left in working tree; `design.json` plumbed
  via `git hash-object` + `update-index` to stage only the procedural
  roster delta against HEAD without bundling Jacob's `layerVis`/`labels`
  edits. Per [[feedback_stash_isolate_per_file]].

#### Follow-ups — pick up post-Grove-curation

- [ ] **Operator prunes LS roster via Grove.** Open Arborist → set active
  Look = "Lafayette Square" → Grove → "In Look" scope → click the heavy
  `platanus_acerifolia` ×9 / `alaskan_cedar_2` / `broadleaf_rt3` /
  `cedar_generic` / `generic_*` tiles to remove. Per-Look atlas
  auto-rebakes; LS atlas size drops proportionally. Manual curation
  only — operator decides what stays.
- [ ] **Raise atlas `CONTENT_CAP` once roster shrinks.** `bake-look.js:39`
  caps tiles at `bark 512×1024 / leaf 512×512`. With ~10 trees in roster
  (vs 25 today) ~60% of atlas area frees — raise to
  `bark 1024×2048 / leaf 1024×1024` for material fidelity bump at no
  runtime cost. One-line knob; defer until operator finishes Grove
  curation so the actual roster size drives the cap.
- [ ] **Default-Look procedural placement gap.** `cartograph/serve.js`'s
  Bake-button chain runs `bake-trees.js --look default` (not the active
  Look's id). With procedurals at `quality=2` in
  `public/trees/index.json`, default's placements now substitute
  procedurals — but default's `design.json#/trees` doesn't list them
  and no per-Look atlas exists. Runtime fetches to
  `/baked/default/trees/procedural_*/...` will 404 if any view runs
  against `?look=` unset or `=default`. **Mitigation when relevant:**
  add procedurals to default's roster via Grove (one click each), atlas
  re-bakes automatically. Or gate the universal `public/trees/index.json`
  per-Look in `build-index.js` (out of scope for v1 stopgap).
- [ ] **Procedural authoring UI in Arborist** (deferred; designed in
  `NOTES.md` post-ship entry). Top-level `[Scan] | [Procedural]` mode
  toggle in ArboristApp; per-species panel exposes PRESETS-table params
  + "Re-generate + publish" button; `POST /procedural/generate` returns
  a GLB → SpecimenViewport renders before publish. `generateTreeMesh()`
  already exposes the exact params signature the UI will bind to. ~1
  day end-to-end. Worth doing once the v1 stopgap proves the visual bar.
- [ ] **Per-instance bark color** — current v1 lands one bark texture per
  species (5 distinct browns across the roster). The original ParkTrees
  palette drove per-tree bark via vertex colors; bake-look's atlas
  rewriter strips `COLOR_0`. SpeedTree restores per-instance bark via
  tinted baked-card atlas tiles — already in the SpeedTree migration
  plan, no new gap. No action required here.

- **Why now:** SpeedTree path has a learning curve; the pre-procedural
  138 MB baked-GLB roster is too heavy for the mobile target
  ([[feedback_beautiful_first_lightweight_51]]). Procedurals are the
  v1 stopgap per [[project_v1_no_trees]]. SpeedTree will replace them
  by raising roster quality ratings — zero code change at swap time.

### Trees — SpeedTree
- [ ] **Stand up the SpeedTree library.** Buy/grab `.spm` starter kits;
  tune a London Plane + generic deciduous + generic conifer; export
  glTF at 4–5 LODs + 1-click billboard bake from the same source.
  Replace hand-modeled trees in the arborist roster. The billboard
  impostor tier comes for free from SpeedTree's baker — solves the
  mobile triangle budget without a separate impostor pass. Open-source
  fallbacks (`proctree.js`, `tree-js`, `Arbaro`) if SpeedTree route
  doesn't pan out.
- [ ] **Per-shot tree-scale slider (Stage-side, camera-connected).** Hero
  defaults to ~2× for romance; Browse + Street stay 1.0. Lives on the
  Stage panel (camera-connected), not arborist.

### Windows + doors — parked, post-v1
- [→] Per-building facade detail. Likely surfaces in the **user manifest**
  at release. Not a v1 blocker; placeholder line for future work.

### Buildings — Designer ↔ Stage/Preview population parity
- [ ] **Designer must render the same building set Stage + Preview render.**
  Stage/Preview bake the correct, full population; Designer renders a
  subset. The canonical building data exists somewhere in the pipeline
  — find it, preserve it, do NOT overwrite, and wire Designer to read
  it. Pair with the cull logic Stage already runs so Designer doesn't
  pay the full-population cost everywhere.

### Treelawn color follows land-use
- [x] **Shipped 2026-05-13 PM** (`cfa6b01` bake, `5dbf4b6` Designer).
  Per-LU treelawn keys (`treelawn:residential`, `treelawn:park`, …);
  each variant inherits the parcel's authored `luColors[lu]`. Grass-LU
  variants route through `GrassMesh` (procedural green, visually merges
  with the parcel face); non-grass-LU variants render flat via
  `FadeMesh`. Adjacent-block lookup is point-in-polygon on the treelawn
  ring's interior probe (not `blockKey` join — pass-1/pass-2 drift).
  See FEATURES.md §"Treelawn matches adjacent parcel land-use".

### Bake-time arc smoothing
- [ ] **Curved streets must be smooth in the bake.** Benton Place and
  similar arcs render as visible segments in Designer — that's fine,
  Designer is a preview environment. The **bake** MUST produce smooth
  arcs across all curves. Likely the unfinished bake-propagation TODO
  from Phase 7 Smooth-made-real (`cartograph/derive.js` reads the
  smoothing overlay but doesn't yet propagate it through geometry
  build).

### Big park intersections
- [ ] **Author an answer for the big park intersections.** Multi-way
  intersections at the park corners are currently a mess with no
  canonical resolution. Needs a dedicated geometry + authoring pass.
  Pairs with the whole-intersection corner editor restore below.
  - [ ] **Phase A.5 — leg-formation at chain-endpoint IXs.** Polygon-graph
    Phase A (per-leg tangent walker, commit 47f2f0a, 2026-05-15) did NOT
    resolve the visible NW/SW/SE failure at Mississippi×Lafayette. Root
    cause is `cornersAtIx` degenerating on near-parallel adjacent legs
    from divided-pair carriageway endpoints — both `lafayette-avenue-5`
    and `lafayette-avenue-6` terminate at V with their first stable
    vertex ~east of V, producing a ~5° wedge whose corner Q is degenerate
    → corner records not produced → no plug + no control dot. Fix:
    deduplicate near-parallel legs OR detect them as a paired-carriageway
    side and synthesize a single corner against the opposing chain. Needs
    its own brief + Toy-first iteration; Waverly couplet endpoints
    (HW4 ↔ WV junctions) in Toy likely already exercise this failure mode.

### Labels on all surfaces
- [ ] **Close out label rendering + authoring across every surface kind**
  — street names, business labels, landmark labels, park labels.

### Aerial tile LOD — attention-driven
- [ ] **Memory-aware aerial tiling.** High-res aerial is expensive; the
  base map is large. New behavior: load **lo-res along the route of the
  selected street**. When zoomed in, only tiles **adjacent to the active
  handles** (the live editing/attention area) swap to full resolution.
  Attention-driven LOD, not blanket high-res.

### Corner revert UX — two-tier
- [ ] **Single tap = "revert this session"** (undo session-local
  overrides). **Second tap = "revert to factory"** (nuke all overrides,
  restore default geometry). Tap → tap → tap escalates. Replaces today's
  unreliable single-button revert.

### Whole-intersection corner editor — RESTORE
- [ ] **Bring back the whole-intersection editor** on top of today's
  rounded-block-clip geometry — NOT a regression to per-corner IP
  fillets. Single polygon per IX node, draggable as one unit. See
  `project_intersection_plug_geometry.md` for the rounded-block-clip
  rule that must be preserved.
  - [ ] **Sub-task — drill the primacy rules** (separate session):
    when whole-IX edits and per-corner edits coexist, who wins? Needs
    a decision before coding the editor.

### Bake Bounce + post-bake camera skew — RESOLVED 2026-05-13 PM
- [x] **Stage button** now navigates via `lastStageShot` from the store
  (was hardcoded `'browse'`); `runBake({ navigateTo: lastStageShot })`
  fires after the bake completes (`f45cda2`). Per-look in-flight lock
  in `serve.js` (`61eea3f`) rejects concurrent bakes with `409`, so a
  double-click can't race. With the async bake + fast no-op skip
  (`766fe37`) the "long bake then bounce" race condition surfaced
  briefly and resolved.
- [x] **Post-bake camera skew** — initial diagnosis (pan-preserve into
  ortho's x/z) landed in `f45cda2` and was correct framing-wise, but the
  user-perceived "skew" turned out to be missing green LU surfaces from
  a grass-shader z-fight against FadeMesh fragments. Fixed by mirroring
  FadeMesh's per-group `polygonOffset` onto `GrassMesh`'s material
  (`c20b706`). See FEATURES.md §"BakedGround.GrassMesh needs
  polygonOffset parity".

### Bake Bounce (historical, pre-resolution)
- (kept here as a tombstone — the original symptom description
  follows in case the route-transition race ever resurfaces.) Symptom:
  hit Stage (= Bake) → bake runs long → user is returned to the **Design**
  view instead of Stage. Second click opens Stage correctly. Likely
  the route transition fires before the bake completes, or the
  navigation gets popped on bake-complete. Tracks back through
  `cartograph/serve.js`'s POST `/looks/:id/bake` + the Stage-button
  click handler.

### Cartograph authoring carry-overs (still real)
- [ ] **Extract shared `resolveStreets()`** to unify Designer + bake
  operator-intent merge. Today Designer's
  `useCartographStore.js:_loadCenterlines` and the bake's `derive.js`
  overlay merge each implement their own version of "raw centerlines +
  overlay → resolved street list." One shared resolver eliminates a
  whole class of drift. Pair with the shared `buildRibbonGeometry`
  helper for end-to-end structural parity.
- [ ] **Measure: final for-real pass** across every measured street.
- [ ] **Measure: confirm file persistence** (save → reload → same state).
- [ ] **Measure: confirm Divided Traffic + emergent median end-to-end.**
  Broader confirm pass; the lane-anchor bug above is one specific
  symptom (`project_positive_carriageway_model.md`).
- [ ] **Re-measure the 8 inner-edge chain pairs** (Truman, S 14th, Park,
  S Jefferson — NOTES 1478–1480). Auto-survey populated wrong half-widths
  (Truman 2m vs reality ~10m, etc.). Newly relevant after the 2026-05-14 PM
  course-correction: inner-edge anchor now seeds inboard pavementHW = 0
  on flip, so the operator's authored outboard width IS the visible
  carriageway and the gap IS the median — wrong values are now obviously
  wrong rather than masked by symmetric mirroring.
- [ ] **Ribbon-to-ribbon profile stitching.** Phase 5 ribbon-knit /
  merge-plug; `corridors[].transitions[]` already marks the seams.
- [ ] **Fix final land uses** — close out remaining land-use polygon
  authoring gaps.

### Buildings + data integrity
- [ ] **Add buildings + businesses on W Lafayette** (bulk authoring in
  `buildings.json` + `landmarks.json`).
- [ ] **Audit other buildings for the `building_sqft` slip pattern.**
  Any entry whose `building_sqft` exceeds plausible footprint × stories
  likely has the same source-data error.

### Park (non-intersection)
- [ ] **Build park fence** as a first-class element.
- [ ] **Add community park** at the vacant lot at Dolman + Park.
- [ ] **Real water texture** — replace today's flat fill.

### Atmosphere + Sky & Light
- [ ] **QC Neon** — perfect on toy fixture + migrate to LS
  (`project_neon_bands_runtime.md`, `HANDOFF-neon.md`).
- [ ] **Sky & Light + Post card polish** — per-channel polish, promote
  single-channel emissives (`HANDOFF-sky-and-light.md`).
- [ ] **Hero pan QC** — verify swing cadence/amplitude/ease in the new
  `src/preview/heroAnim.js` against legacy
  `src/components/Scene.jsx:312` `heroPanSwing` side-by-side
  (`project_hero_pan_needs_qc.md`).
- [ ] **Add luminance to surfaces (off by default).** New surface-level
  luminance channel; operator opts in per material.
- [ ] **Per-event sky overrides** (events overlay layer; base sky
  gradient grid already shipped).
- [ ] **Milky Way re-enable** (parked; needs 16K+ equirect or cubemap-
  per-face source — `project_milkyway_parked.md`).
- [ ] **Floor wash reapproach** (Arch lighting follow-up; prior literal-
  pools attempt rejected 2026-05-03).

### Designer / Preview UX
- [ ] **Restyle "Look"** in Designer (visual restyle of selector/cards).
- [ ] **Update Preview interface** (small refresh).
- [ ] **Y-offset → polygonOffset coplanar-stacking sweep**
  (`project_backlog_y_offset_sweep.md`,
  `feedback_never_y_offsets.md`). Distinct from the Designer Panel IA
  pass above.

### Mobile
- [ ] **Full-functionality test on mobile via Preview.** Phone mode is
  the canary; budget = ~200 calls / 1M tris / 256 MB GPU
  (`feedback_mobile_first_preview.md`,
  `project_preview_phone_mode.md`).

### Post-punchlist
- [ ] **LS base-map swap (the marriage leap)** — final move before
  returning to the consumer app (`project_ls_basemap_swap.md`).
- [ ] **Pre-public cleanout + security audit** — whitelist build,
  sterilize bake, strip authoring code/data
  (`project_pre_public_cleanout_security_audit.md`).

---

## 2026-05-03 — Recently shipped (celebrate)

A pile of work landed across the visual stack between 2026-04-30 and 2026-05-03.
Memory entries are the source of truth; this is the index.

- ✅ **Bake pipeline + per-Look bundles** (2026-04-30). `BakedGround.jsx` + per-Look bake mounted in Stage and Preview. `SvgGround` retired. See `project_baked_ground_runtime.md`, `project_bake_pipeline_pure_threejs.md`.
- ✅ **Neighborhood stencil unification** (2026-04-30). One canonical boundary v2; bake clips ribbons+faces to `streetFade.outer`; `BakedGround` applies concentric radial fade per group kind; Terrain skirt retired. See `project_neighborhood_stencil_unification.md`.
- ✅ **Sky gradient grid editor** (2026-05-02). 2D color matrix (4 bands × 22 cols × sun-glow row), day-resolved preview in Sky & Light card, `SkyPump → skyState → GradientSky`. Replaces hardcoded altitude keyframes. *Awesome.* See `project_sky_gradient_grid.md`.
- ✅ **TOD parameterizer** (2026-05-02 → 2026-05-03). TodChannel primitive, Lamp Glow end-to-end (per-tree gaussian → instance attr → canopy-gated shader), Post + Sky & Light card split, lighting-unit channels (ambient/hemi/dirSun/dirMoon as TOD multipliers). See `project_tod_parameterizer_inflight.md`, `project_lamp_glow_runtime.md`, `project_lighting_unit_runtime.md`, `project_post_vs_skylight_split.md`.
- ✅ **Per-tile InstancedMesh tree culling + tighter atlas packing** (2026-05-02 → 2026-05-03). 4×4 spatial grid, skyline rect packer, `frustumCulled` on. See `project_per_look_tree_atlas.md`.
- ✅ **Library / runtime split** (2026-05-03). `public/trees/` moved to `.gitignore` — Arborist authoring library is multi-GB, regenerable, never read by runtime. Runtime consumes `public/baked/<look>/` only. The publish-loop seam is now also enforced by git.

## 2026-05-03 — In flight / Upcoming (consolidated 2026-05-13)

Neon Bands testing + LS migration, Hero pan QC, Sky & Light + Post polish,
LS base-map swap, Pre-public cleanout — all migrated to the 2026-05-13 v1
punchlist above. Cloud renderer upgrade retired in favor of v1
`CloudDome.jsx` (ship) + Meteorologist (separate track). Roofs parity gap
retired — superseded by flat-by-default + PlaceCards authoring.

## 2026-05-02 — Weather pack (own track, post-Meteorologist)

Ongoing track — not punchlist-gating. The product vision: Lafayette Square
as a living place, today's actual weather + scheduled event Looks. Real
weather data is already wired (`useWeather.js` → `useSkyState` → existing
shaders); what's missing is visual fidelity. Clouds for v1 ship via the
existing `CloudDome.jsx`; Meteorologist (volumetric raymarch) replaces it
when ready. See `project_weather_and_events_vision.md`,
`meteorologist/SPEC.md`.

- [ ] **Wind effects.** Tree sway shader uniform (affects all instanced
  trees), cloud movement direction + speed (CloudDome shader), audio
  (wind, leaves, distant thunder).
- [ ] **Precipitation effects.** Rain particles + wet-surface specular
  shader on streets. Snow particles + roof accumulation (white tint
  masked by surface normal). Drives off `useSkyState.storminess` +
  WMO weather codes.
- [ ] **Heat haze.** Full-screen shimmer distortion for hot summer days
  in the park / hero shot.
- [ ] **Autumn foliage.** Leaf-fall particles, color-shift in tree LODs.
- [ ] **Audio integration.** Wind/rain/birdsong/distant city sounds tied
  to weather + TOD.

## 2026-05-02 — Sky gradient events overlay + Milky Way (consolidated 2026-05-13)

Per-event sky overrides and Milky Way re-enable both migrated to the
2026-05-13 v1 punchlist (Atmosphere + Sky & Light section). Milky Way
context preserved in `project_milkyway_parked.md` (needs 16K+ equirect or
cubemap-per-face source).

## 2026-05-01 — open items

### Tree pipeline (just stabilized)
- [x] Roster fallback: out-of-roster placements substitute a same-category roster variant deterministically. 644/644 placements survive a partial roster.
- [x] Operator transforms (`scaleOverride` / `rotationOverride` / `positionOverride`) flow Arborist → manifest → index → bake → runtime.
- [x] Forbidden-surface filter at bake time (water / building / pavement / alley / sidewalk / footway / path).
- [x] Scale baked into the GLB at Arborist publish (`bake-look.js`). Runtime renders at scale=1; placement bake no longer carries a `scale` field.
- [x] Toy scene migrated from `<ParkTrees>` → `<InstancedTrees bakeUrl="/baked/toy.json" lookId="lafayette-square" />`. Real arborist pipeline drives the testing fixture.
- [x] `LafayettePark.jsx` cleaned (1293 → 700 lines): ParkTrees + helpers + leafTypesData removed.
- [x] Per-tile InstancedMesh culling (2026-05-02). `bake-trees.js` emits a 4×4 spatial grid (`tiles.instancesByTile`); runtime splits each species into one InstancedMesh per (url × tile) sharing the single atlas material; `frustumCulled` flipped on. Off-screen tiles cull naturally — biggest wins on Browse-corner / Street shots.
- [x] Tree-atlas tighter packing (2026-05-03). Skyline rect packer (`arborist/atlas-pack.js`) replaces uniform-grid + nextPow2; per-tile content rect at color-aspect with per-classification cap (bark 512×1024, leaf 512×512) + 4px clamp-extended mip gutter. `unifyAtlases` packs sub-atlases as two rects. Bark sub-atlas −30% on the LS roster; leaves already at cap so unchanged. Manifest UV contract preserved (runtime untouched).
- [x] Open-tab GLB cache-bust (2026-05-03). Rewritten GLB URLs in `InstancedTrees.jsx` carry `?v=<atlas.generatedAt>` so an open Preview/Stage tab picks up new UVs on rebake instead of trapping drei's `useGLTF` cache (was misreadable as a packing bug — Grove looks fine because it loads raw source GLBs).
- [ ] **Fill out `lafayette-square` tree roster.** 17 entries today; runtime substitutes by category until topped up. Common species missing: quercus_alba, acer_saccharum, betula_pendula, tilia_americana, nyssa_sylvatica.
- [ ] **Fix mismeasured `approxHeightM` in the Arborist** for variants whose authored size renders wrong (magnolias 4×, generic_tree_2 6.7×, garden_mix:3 7×, tilia_americana:1 0.39×, etc.). Either correct via `scaleOverride` in the Arborist UI or fix the publish-time `computeApproxHeight` measurement. The bake no longer clamps — wrong sizes ship until corrected.
- [ ] **Auto re-bake-look on `scaleOverride` change.** Today operators must trigger `POST /atlas/bake?look=<name>` (or run the CLI) for scale changes to propagate into per-Look GLBs. Wire `arborist/serve.js`'s overrides handler to dispatch a per-Look re-bake when scale changes (debounce).

### Data integrity
- [x] `bldg-0924 building_sqft` corrected (1,310,842 → 2,125; the park's 30-acre area was mis-assigned to the building entry).
- [x] `bldg-0924 / bldg-0985` tagged `parkInterior: true`.
- [x] Kern Pavilion (lmk-124) + Betsy Cook Pavilion (lmk-125) added to `landmarks.json` under `parks/pavilions`.
- [ ] **Audit other buildings for the same `building_sqft` slip pattern.** Any entry whose `building_sqft` exceeds plausible footprint × stories likely has the same source-data error.

### Architecture / longer arc (deferred)
- [x] **De-Parking session** (LANDED 2026-05-03 via `de-parking` branch off `cartograph-looks-pass-ab`). park_trees + park_water migrated to world frame; all 5 PARK_GRID_ROTATION render/bake callsites deleted; `src/lib/terrainCommon.js` extracted for V_EXAG + bilinear sampler shared by vite + node bake scripts. **Did NOT fix floating buildings** — inventory disproved the working hypothesis (buildings.json was always world-frame). Floating buildings is a foundation-extension bug, queued next. See `project_de_parking_inventory.md`.
- [ ] **Tree Y-position from elevation field.** Trees plant at y=0 today; should sample `getElevation(x, z) × V_EXAG` so they ride the terrain. See `memory/project_terrain_elevation_field.md`.
- [ ] **Already-on-file longer arcs:** Y-offset → polygonOffset sweep, intake procedure, pre-public cleanout/security audit. (Lamp-glow bake + Stage TOD parameterizer shipped 2026-05-02 → 2026-05-03 — see "Recently shipped" section above.)

### Historical sections below
The sections after this point document earlier skeleton/derive pipeline phases. Kept for historical context — Phases 1–4 landed; Phase 5 (knit) and Phase 6 (emergent grass median) remain open but are not the current focus.

## 2026-04-26 — Path B Phases 1+2+3+4 SHIPPED

| Phase | Status | Commits |
|---|---|---|
| 1. Skeleton phase analyzer | ✅ shipped | `613a6ff`, `6d7045c` (tuning) |
| 2. Phase-aware welding | ✅ shipped | `78f78bd` |
| 3. Skeleton emits phase metadata | ✅ shipped | `d6a3c42` |
| 4. Derive consumes phase info | ✅ shipped | (this session) |
| 5. Ribbon knitting | ⏳ next | — |
| 6. Emergent grass median | ⏳ | — |

**Phase 4 results:**
- 23 emergent medians (was 6 — old geometric `meanGap < 30m`
  threshold under-detected).
- 46 chains marked `anchor='inner-edge'` (was 0 — old buildCorridors
  pair-detection silently failed; oneway-edge node clustering rarely
  satisfied `sA===eB && eA===sB`).
- 23 carriageway-A + 23 carriageway-B chains (was 17+17 — pairKey
  gating in welder revealed pair structure that was silently fused).
- 18 pinch transitions across 69 corridors.
- 182 ribbon chains total (was 154); the +28 are pair-correctness.
  Phase 5 knit will close the visible seams.

**What changed structurally:**
- `analyzePhases` stamps stable `pairKey` per divided pair.
- `weldChains` gates on `(signature, pairKey)`. Different pairs in
  the same corridor (Lafayette has 4 A-pairs) can no longer fuse.
- Skeleton emits `phase.pairKey` per chain.
- Derive `ribbonStreets` carries `phase` through; pairing is now a
  pairKey slot-fill — no `meanPerpDistance`, no `tanDot`, no
  edge-key matching.
- Deleted from skeleton: `splitAtFolds`, `dropShadowedChains`,
  `nearestOnPolyline`.
- Deleted from derive: ~325 lines of geometric pair detection,
  `buildCorridors` edge-key logic, `offsetPolyline`/`avgTangent`/
  `meanPerpDistance` helpers, `medians[].meanGap` field.

## Operational notes worth remembering

- **`pipeline.js` does NOT run `skeleton.js`** — they're separate
  scripts. After editing skeleton, run `node skeleton.js` first,
  then `node pipeline.js`. Forgetting gives a stale skeleton.json
  and silent regressions in derive.
- If Survey/Measure go blank, check `lsof -i :3333` — `serve.js`
  may have died. `node serve.js &` to restart.

## Phase 5 pickup pointer

Phase 5 ("ribbon knitting") closes the 18 pinch transitions where a
single phase meets a divided phase. Each transition has a node coord
and an emergent wedge: median grass opens at single→divided, tapers
to zero at divided→single. Implementation candidates:
- "Merge plug" geometry analogous to corner plugs.
- Extend insert-coupler taper logic.

Start at `src/components/StreetRibbons.jsx` line ~703 (main fills
per-chain loop). The `corridors[].transitions[]` array in
`data/clean/map.json → layers.ribbons` already lists every seam
location — Phase 5 just renders them.

---

## 2026-04-26 PM — Path B chosen (phase-aware skeleton emission)

**Premise:** stripped back to OSM data and found skeleton over-welds
divided roads into single chains. Lafayette: 22 OSM ways → 1 chain
(should be ~5–8 phase-segmented chains). Jefferson: 19 OSM ways → 4
chains (only 2 of which were correctly tagged divided, by accident
when their welded super-chain folded).

The unified-centerline strategy isn't a bug — it exists because
ribbons emit per chain with no stitching, so chain == ribbon segment.
But the trade-off costs us divided-road fidelity.

**Path B chosen** (over Path A "stricter welder + visible breaks" and
Path C "manual operator override"): restructure skeleton to produce
chains per **phase**, where a phase is single-bidirectional or
divided-pair. Add ribbon-knitting at phase transition nodes.

Plan in `cartograph/NOTES.md` 2026-04-26 PM entry.
Memory: `project_phase_aware_skeleton_emission.md`.

### Phase-by-phase implementation

| Phase | Description | Effort |
|---|---|---|
| 1. Skeleton phase analyzer | Detect divided pairs + single fragments + transition nodes from OSM ways before welding | 1 session |
| 2. Phase-aware welding | Weld within phases only; output one chain per phase per direction | small |
| 3. Skeleton emits phase metadata | `phase: { kind, corridorName, role, transitions }` per chain | small |
| 4. Derive consumes phase info | Rewrite `buildCorridors`; delete `splitAtFolds` + `dropShadowedChains` + after-the-fact divided detection | medium |
| 5. Ribbon knitting | Geometry at phase transitions where ribbons merge/split | hardest, visual iteration |
| 6. Emergent grass median + merge points | Replaces `ribbons.medians`; falls naturally out of (5) | small after (5) |

### What carries forward from prior sessions

- `streetProfiles.innerEdgeMeasure` (zeros inboard treelawn/sidewalk).
- `StreetRibbons.inboardPedZoneless` wrapper.
- Ordinal-keyed `segmentMeasures` + couplers.
- Overlay file persistence + `setAnchor` operator override.
- Tool-scoped translucency.

### Inherited issues — still queued after Path B lands

- **Re-measure inner-edge chains** (auto-survey `pavementHW` is wrong
  for divided roads; will need re-measurement of all chains tagged by
  the new phase analyzer).
- **Royal-blue centerline visibility over asphalt** — Path B doesn't
  fix this directly. Top suspect: copy MapLayers' yellow-stripe
  pattern (`MeshStandardMaterial`, polygonOffset -14/-56).
- **Loop streets** (Benton, Mackay) — closed-polyline phase detection.
- **Corner plug at oblique IXes** — open from 2026-04-24.
- **12 legacy measure overrides** flipped by direction normalization.

---

## 2026-04-26 AM session — inner-edge anchor for divided carriageways (SUPERSEDED by Path B)

The Step A/B/C arc started this session is folded into Path B's plan.
What was shipped (still in code):
- `derive.js` auto-detect anchor (8 chains tagged from `kind: 'divided'`
  corridor phases). After Path B, this will be driven by skeleton's
  phase emission rather than derive's after-the-fact detection.
- Persistence (overlay file) + `setAnchor` action.
- `SurveyorPanel` Anchor dropdown.
- `streetProfiles.innerEdgeMeasure` + `StreetRibbons.inboardPedZoneless`
  (cross-section model: chain at carriageway center, zero out inboard
  treelawn/sidewalk).

Pivoted from earlier offset-polyline + synthetic pavement approach
during the AM session per operator feedback ("each roadway gets a
centerline, expand center out in both directions").

Open visibility issue (royal-blue centerlines occluded by asphalt's
polygonOffset) carries forward — Path B doesn't address it.

---

## 2026-04-26 session (in progress) — inner-edge anchor for divided carriageways

### Shipped this session

- **Step A — auto-detect anchor.** `derive.js` walks `corridors`, marks
  chains in `kind: 'divided'` phases with `anchor: 'inner-edge'`,
  `innerSign`, `pairId`. 8 chains tagged in current data.
- **Persistence.** Anchor override flows through overlay file via
  `setAnchor` action; `_autoAnchor` tracks default so save only writes
  when overridden.
- **`SurveyorPanel` Anchor row.** Center / Inner-edge dropdown, disabled
  when no paired chain detected.
- **Step B model PIVOT.** Initial offset-polyline + synthetic pavement
  approach scrapped per operator. Replaced with simpler:
  - Chain at carriageway center; visible centerline = chain.
  - Cross-section authored two-sided; inner-edge chains zero out
    inboard `treelawn`/`sidewalk`, keep pavement+curb on both sides.
  - `streetProfiles.innerEdgeMeasure` + `StreetRibbons.inboardPedZoneless`
    helpers; called in main fills, edge strokes, face-clip per-segment loops.

### OPEN BLOCKER — render visibility

Royal-blue authoring centerlines (`MeasureOverlay`) aren't visible over
asphalt — depth/renderOrder fight with asphalt's `polygonOffset`. Three
attempts this session, none resolved. Diagnostic in place; operator
testing morning of 2026-04-26.

### Still open (after blocker resolves)

- **Re-measure 8 inner-edge chains.** Auto-survey `pavementHW` values
  are wrong for divided roads (Truman 2m vs reality ~10m). Use Measure
  tool — drag both sides of carriageway pavement on each.
- **Step C — emergent grass median.** Replace `ribbons.medians` lens
  with runtime polygon between paired chains' inboard pavement edges.
  Close at `corridors[].transitions[].pinch === true`.
- **Loop streets** (Benton, Mackay) — extend inner-edge auto-detect to
  closed polylines (winding-derived `innerSign`) once divided pairs
  verify. Deferred; same model applies.

See `cartograph/NOTES.md` 2026-04-26 entry for full breakdown +
`project_inner_edge_anchor_in_flight.md` memory for next-session pickup.

---

## 2026-04-25 session — couplers shipped end-to-end

### Shipped this session (kept)

- **Canonical chain direction in `skeleton.js`.** Non-oneway chains
  oriented so dominant of `(last − first)` is positive (50/93 flipped).
  Closes the "left of A == right of B" twist for adjacent chains and
  stabilizes ribbon winding across rebuilds. Oneway chains untouched
  (their direction is direction of travel).
- **Coupler authoring in Survey.** Ctrl/⌘-click interior node → toggle.
  Orange diamond marker, panel coupler/segment count + hint.
- **`segmentMeasures` ordinal-keyed schema.** `"0", "1", "2"` instead
  of `"from-to"`. Stable across skeleton/ribbons coord systems.
  Couplers carry world coords for projection. Helpers
  `segmentRangesForCouplers(pts, couplers)` and
  `measureForSegment(street, ord)` are the single read points.
- **Per-segment Measure tool.** Click resolves segment via
  `resolveSegmentOrdinal`. Drag / dblclick-insert / right-click-delete /
  Reset all scope to the clicked segment. Empty-space click and Enter
  both accept (deselect); Esc still works.
- **`StreetRibbons` segment-aware fills.** Main fills, edge strokes,
  caps, corner plugs, face-clipping all walk segments per chain. Face
  clip emits one ring per (segment × side) instead of one per chain.
- **Live merge by `skelId`.** `derive.js` emits `skelId` on each ribbon
  street. All three merge sites in `StreetRibbons` (main fills, edge
  strokes, face-clip) prefer skelId-match over name-match. Mississippi
  carriageways no longer leak into each other.
- **Tool-scoped translucency.** Selected-corridor dim only applies
  while a tool is active. Unselected chains in Measure render opaque.
  No-tool view never dims a chain even if `selectedStreet` is set.

Closes B.1 (foundation) and ships C.1 (Couplers Phase 1B).

### Still open / next-session candidates

- **Persistence for couplers + segmentMeasures.** Currently in-memory
  only. Overlay file design (caps + couplers + segmentMeasures) is the
  unblock for shipping authoring durably.
- **Direction-normalize legacy measure overrides.** 12 streets in
  `centerlines.json` had pre-existing `measure` overrides; if their
  chain was among the 50 flipped, left/right is now swapped. Either
  manually re-measure or write a one-shot migration that detects flip
  by comparing the chain's pre/post first-point.
- **Corner plug at oblique IXes** — unchanged, still the priority
  picked up from 2026-04-24. See that section below.
- **Test split + insert coupler co-existing.** Code paths are
  independent but no current data exercises both on the same chain.

---

## 2026-04-24 evening session — corner plug deep dive, geometry still open

### Shipped this session (kept)

- **IX-lookup fix** in `StreetRibbons.jsx:647-678`. ~80 missing plugs at
  oblique IXes recovered. 99/183 → 183/183 cross-street pairs resolve.
  Root cause: `derive.js:2415` shifts `ix.streets[].ix` by name, breaking
  multi-chain same-name corridors. Runtime works around via point-proximity
  matching against `ix.point` rather than trusting the IX-level index.
- **R = treelawn + sidewalk** (`plugSwWidth` redefinition). ADA-corner-pad
  scale at oblique IXes. Operator picked option ii after seeing 1 m vs
  2.7 m radii at Mississippi × Park.

### OPEN — corner plug shape at oblique IXes

**Test case**: Mississippi × Park, IX at (229, −158.9), interior angle
~69°/111°. Right-angle IXes look fine; oblique IXes don't.

- Acute (~70°) sectors render as thin spike/tongue.
- Obtuse (~110°) sectors render with a "tooth" where plug curb meets
  leg curb. Re-measuring sidewalk widths in Measure mode produced
  noticeably different (also-broken) shapes — the geometry is fragile,
  not just imperfect.

Root cause (numerically traced): plug's leg-end cross-sections sit on
each leg's *parallel* offset line; leg arms terminate on the *perpendicular*
at IX. These lines coincide only at 90°.

**See `cartograph/NOTES.md` 2026-04-24 evening entry for the full list
of approaches tried this session that all reverted.** Do not re-try them
blindly.

### Operator's mental model (foundational, do not re-derive)

- Geometry comes from per-IX ribbon-overlap intersections, never from a
  global formula or centerline-derived rule.
- 4 corners + bezier arc per quadrant; arc bows toward IX.
- "If the shape is squashed, the arc gets squashed" — accept oblique
  shearing in principle.
- Outer corner of plug = property-line corner.
- Inner corner of plug = asph corner.
- No treelawn in the plug.
- Plug curb meets leg curb flush at the legs.

### Memories to update

- `project_corner_plug_open_problem.md` — narrow scope to "oblique IXes
  only" (right-angle works).
- New: `feedback_corner_geometry_attempts_to_avoid.md` documenting the
  6 reverted approaches.

---

## 2026-04-23/24 session — skeleton pipeline landed; three bugs left in selection-based aerial reveal

### Session outcomes (all NEW since last BACKLOG entry)

**Shipped and working:**
- **Phase-0 skeleton extractor** (`cartograph/skeleton.js`) — reads OSM,
  emits one clean chain per carriageway to `data/clean/skeleton.json`.
  Same-direction tangent-aware welding, fold-split at 180° reversals,
  shadow-drop of duplicate short parallels, angular-tolerance RDP.
- **`derive.js` routed through skeleton** — old same-name welding +
  direction-alignment dance deleted. Skeleton is sole street-geometry
  source. Intersection-finding splices on the nearest skeleton segment
  (not vertex) with descending (afterIdx, t) apply order; this
  eliminated the `cos=-1` crimp artifacts that were plaguing divided
  roads.
- **`ribbons.json` new fields:**
  - `medians[]` — emergent polygon between paired oneway carriageways;
    6 medians in Lafayette Square (Truman, S 14th, S 18th ×2, Park Ave,
    S Jefferson).
  - `corridors[]` — 69 corridors with ordered `phases` and pinch
    `transitions`. Park Ave = 3 phases with a pinch at (424, -89).
  - Face fills **clipped** to ribbon outer edge (MIN of left/right)
    so they don't bleed under road ribbons.
- **`StreetRibbons.jsx` cleanup** — deleted `resolveStreetSources`,
  `hasReversal`, `authoredIsSubstantive`, `hasAuthoredMedian`,
  `bboxDiag`, `SUBSTANTIVE_RATIO`. Added `medianMeshes` renderer.
- **Survey shrink** — `SurveyorOverlay` −60%, `SurveyorPanel` −50%.
  Geometry is read-only. Authoring surface = caps + name/type overrides.
  Store pruned (−~200 lines): undo stacks, nodeMenu state, old coupler
  setters, move/hide/disable/revert actions. `NodeContextMenu.jsx`
  deleted.
- **Corridor-level Survey selection** — click any chain, whole
  corridor's centerlines highlight yellow.
- `window.cs = useCartographStore` dev hook for browser-console
  debugging.

### Foundational decisions (do not re-derive)

See `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/`:

- `project_skeleton_architecture.md` (SHIPPED)
- `project_positive_carriageway_model.md` — divided roads = 2
  centerlines, emergent median polygon between them, never authored
- `feedback_couplers_are_segment_local.md` — medians are couplers on
  a single carriageway, NOT cross-section bands
- `project_cartograph_pipeline_shape.md` — full pipeline + "Frequent
  re-derivations to avoid" checklist

### OPEN — selection-based aerial reveal (must-have; three bugs)

Clicking a centerline should make that street's ribbon transparent
enough that the operator can align Measure handles to real curb edges
visible in the aerial photo underneath. **This is required for
authoring, not optional.** Partial implementation landed — three bugs
prevent it from being usable.

Root cause: the `groups` vs `groupsSelected` split added to
`meshes` useMemo in `StreetRibbons.jsx` is incomplete and its cache
dependencies are wrong.

- **E.A.1 Park Avenue (all 4 chains) not rendering ribbons** in any
  mode (Survey/Measure/Designer). Centerlines + handles show; ribbon
  bands are absent. Data in `ribbons.json` is correct (4 chains with
  valid measures). Likely: Park Ave routed into `groupsSelected` at
  initial render when no corridor should be selected, or cache
  staleness from missing deps.
- **E.A.2 Measure handle drags don't visibly update ribbons.**
  `st.measure` mutates, `centerlineData.streets` gets a new array
  ref, but the `meshes` useMemo does NOT list `selectedCorridorNames`
  as a dep — cached mesh data with stale `m.selected` flags can
  survive the drag.
- **E.A.3 Corner plugs disrupted on selected corridors.** Corner-plug
  geometry (around line 765 in `StreetRibbons.jsx`) pushes directly
  to `groups['corner_sw'|'corner_curb'|'corner_asph']` — not updated
  to use `activeGroups`. Corner plugs always land in the opaque
  bucket, visible inconsistency when the adjacent band is in the
  translucent selected bucket.

**Fix plan (ONE pass, in order):**

1. Add `selectedCorridorNames` to every relevant useMemo's deps array
   in `StreetRibbons.jsx` (`meshes`, `silhouetteMeshes`, `medianMeshes`,
   `edgeStrokes`, `pathRibbons`).
2. Route corner-plug pushes through `activeGroups` instead of `groups`
   directly.
3. Trace Park Ave end-to-end in console: hard-refresh, do NOT select
   anything; run:
   ```js
   cs.getState().selectedStreet                          // should be null
   cs.getState().corridorByIdx.size                      // should be >0
   ```
   Open Park Ave in the scene, confirm ribbon geometry renders.
   If not, instrument `buildMeshes` with a console.log of which
   streets ended up in each group. Park Ave should be in `groups`,
   not `groupsSelected`, when nothing is selected.
4. Verify handle drags: add a `console.log('[meshes memo]')` at the
   top of the `meshes` useMemo. Drag a handle — should log each time.
   If it logs but geometry doesn't change, the `measure` update isn't
   propagating through `mergedStreets` build.

**Fallback if the split keeps fighting back:** use three.js stencil
buffer. Render the selected corridor's ribbon silhouette to stencil
(colorWrite=false, stencilWrite=true, stencilRef=1,
stencilZPass=THREE.ReplaceStencilOp). Face fills and non-selected
ribbon bands render with stencilFunc=NotEqual, stencilRef=1 — pixels
where the selected silhouette wrote to stencil are rejected, revealing
aerial. No geometry-buildup split needed; one state guard.

### OPEN — architectural question to resolve before overlay file

**Is the reference line for a divided carriageway its centerline or its
inner curb?** Raised at end of 2026-04-24 session. Currently we use
centerline (two per divided road) with symmetric left/right bands. But
a carriageway around a median is inherently asymmetric — its inner
edge (median-facing curb) is the engineered boundary, and building
bands OUTWARD from that edge matches both construction reality and
aerial authoring workflow. Proposed unified model:

- Divided carriageway: reference line = inner curb; bands build
  outward (pavement → outer curb → treelawn → sidewalk → lot).
- Undivided street: reference line = centerline; bands build
  symmetrically (current behavior, asymmetric per-side override).

If we adopt this for divided roads:
- Skeleton output for divided carriageways emits inner-edge polyline
  (OSM centerline offset by inner pavementHW) OR keeps centerline
  with a "which side is inner" flag.
- Measure for divided carriageways becomes a single outward stack —
  simpler UX than symmetric handles.
- Emergent median polygon = space between two inner-edge polylines
  (cleaner than today's "between centerlines").
- Chicken-and-egg on the bootstrap (knowing inner pavementHW requires
  authored data) — no worse than today.

Resolve before finalizing overlay file schema, since measure's shape
differs between the two models.

### OPEN — pipeline-level followups

- **Park Ave median plausibility** — the auto-detected median for Park
  Ave's east divided section has 3 chains forming a pair, but some of
  the pair-endpoint matching is still loose. Verify the emergent
  median polygon for Park Ave actually pinches correctly at the
  Park × Grattan transition.
- **S 18th Street has 6 chains** — the street is divided in multiple
  short sections. Corridor walking may not emit clean phase sequences;
  test and adjust NODE_TOL in `derive.js`'s corridor builder if phases
  look wrong in Survey.
- **Measure persistence** — `_saveCenterlines()` is a no-op; drags
  evaporate on reload. Overlay file design still TBD (was intended as
  the milestone after skeleton). Draft schema:
  ```js
  // data/clean/overlay.json
  {
    streets: {
      "park-avenue-0": { measure: {...}, capStart: null, capEnd: 'round' },
      ...
    }
  }
  ```

### Files touched this session (full list)

- `cartograph/skeleton.js` — NEW
- `cartograph/derive.js` — consumes skeleton; medians, corridors,
  face fill clip added; old OSM welding removed
- `cartograph/serve.js` — `/skeleton` route
- `cartograph/NOTES.md`, `cartograph/BACKLOG.md` — session entries
- `src/components/StreetRibbons.jsx` — removed `resolveStreetSources`
  stack, added median render, added selected-vs-unselected split
  (source of E.A.1–E.A.3 bugs)
- `src/cartograph/SurveyorOverlay.jsx` — rewrite/shrink
- `src/cartograph/SurveyorPanel.jsx` — rewrite/shrink
- `src/cartograph/CartographApp.jsx` — corridor selection wiring,
  aerial-reveal hiding logic (reverted after it was too aggressive)
- `src/cartograph/api.js` — `fetchSkeleton` added, `saveCenterlines`
  removed
- `src/cartograph/stores/useCartographStore.js` — major prune,
  `corridorByIdx`, dev hook
- `src/cartograph/NodeContextMenu.jsx` — DELETED

---

## 2026-04-22 → 2026-04-23 session — Survey/Measure rework

Long session attempting to "fix Survey and Measure once and for all." Landed
a lot of infrastructure; hit the limits of the centerlines.json data; left
several visual states still off. Key takeaways at the top, detail below.

### Architectural discoveries (most important thing from this session)

1. **The pipeline's OSM-way stitching produces loop chains for divided
   roads.** Two parallel one-way OSM ways of a divided road (Park Avenue
   east of 18th, Truman Parkway, Chouteau, Lafayette, Russell, S. 12th,
   S. 14th, Gravois) get stitched into a single polyline that folds back
   on itself at its apex. Buffering a reversing polyline produces
   self-overlapping quads — the bowtie/chevron visible in Survey and the
   seam artifacts in Design. Detectable: adjacent-segment dot product
   `< -0.5` = reversal. `hasReversal()` helper in `StreetRibbons.jsx`.

2. **Single centerline per street + median as a band is the right model.**
   Not "split the loop into two lanes and render parallel." The authored
   centerline runs down the **spine of the ROW** (not a lane), and a
   median insert coupler carves a center slice that renders with a new
   `median` band material (grass/concrete). Band stack becomes
   `[median, asphalt, curb, treelawn, sidewalk]`. Data model + renderer
   now support this (see `resolveInserts` + the `hasMedian` branch in
   `meshes` useMemo + `streetProfiles.BAND_COLORS.median`). UI: right-click
   menu has **Median** entry.

3. **centerlines.json has mixed data quality.** Of 444 valid authored
   centerlines, only 73 match a pipeline street name; the other 371 are
   orphans (legacy / outside neighborhood). Of the 73 matched, many are
   stubs (authored bbox diagonal < 50% of pipeline chain diagonal —
   Benton Place is 47m authored vs 209m pipeline loop). Several streets
   have duplicate authored entries (Lasalle Street ×3, S. 18th Street ×2,
   Waverly Place ×2, Ann Avenue ×2). The "one centerline per street"
   architecture requires an operator pass through every street to
   re-author as a single clean spine line.

4. **Survey / Measure / Design / 3D must share the same street source.**
   Divergence between silhouette (old: liveCenterlines) and meshes
   (welded pipeline) causes visible mismatches. Current state:
   silhouette + meshes + edgeStrokes all iterate the same
   `renderRibbons.streets` output from `resolveStreetSources`.
   **SurveyorOverlay still reads centerlineData directly**, so the
   navy centerline spine can disagree with the silhouette for
   stub-authored streets. Unresolved.

### Locked (changes that stuck)

1. **Reroute coupler** (`feature: 'jog'`) — data model in `streetProfiles.js`
   (`resolveInserts` contributes signed `lateralOffset`), store actions
   `setRerouteCoupler` / `removeRerouteCoupler`, right-click menu entry,
   draggable yellow handle, live silhouette bending.
2. **Median coupler** (`feature: 'median'`) — new `median` band material
   (`BAND_COLORS.median = '#4a6a32'`), band stack shifts outward by
   `medianHW[i]` per point via `halfRingVarRaw`, median band renders
   grass fill. Store actions + right-click menu entry. UI for adjusting
   taper/hold/medianHW not yet built.
3. **Alleys + paths as first-class roadway ribbons.** `derive.js` emits
   `ribbons.alleys[]` (145) and `ribbons.paths[]` (345) as centerlines +
   `pavedWidth`. `StreetRibbons.jsx` renders them via `pathAsStreet`
   helper + `pathRibbons` useMemo. `MapLayers.jsx` no longer renders
   alley/footway polygons. Paths participate in Survey silhouette.
4. **Circle crop on aerial.** `AerialTiles.jsx` injects a radial alpha
   fade matching `FADE_CENTER (162,-127)` / `FADE_INNER 758` /
   `FADE_OUTER 892` — aerial silhouette matches the main-map circle.
5. **Design + Fills OFF = aerial only.** Distinct from Survey/Measure
   Fills-off behavior; both documented in NOTES.md Fills section.
6. **GroundMesh.jsx deleted.** Was disabled with `{false && ...}`.
7. **Centerline spine in Survey** = navy `#0a1a4a`, miter joints
   (`polylineRibbon` rewritten to compute miter offset
   `halfWidth / cos(θ/2)` with 6× clamp), transparent material
   (`transparent: true`) to force Three.js to draw it in the
   transparent pass — otherwise opaque centerlines get drawn in the
   opaque pass and subsequent transparent silhouettes paint over them.
   This was a tough root-cause debugging story.
8. **NodeContextMenu** is a DOM-level component portaled to `document.body`,
   driven by store state (`nodeMenu: {x, y, nodeIdx}`). Rendering DOM
   inside R3F Canvas crashes the WebGL context (reconciler confusion).
9. **Pipeline segment direction alignment** from earlier (2026-04-22
   morning) — `derive.js` reverses ribbon chains whose local tangent
   disagrees with the authored centerline's direction. Was 37/122
   reversed; now 0/122. Downstream orientation swaps deleted.

### Unlocked / still broken (punch list to pick up next)

| # | Issue | Notes |
|---|-------|-------|
| E.1 | **Aerial photo not reliably visible under streets in Survey/Measure + Fills ON.** Current attempt: hide `MapLayers.ground` when `toolActive`. Still not showing aerial consistently in user testing. Suspect: `StreetRibbons` face fills extending into road gaps, OR some other opaque layer between road ribbon and aerial. Need to diagnose which layer is occluding aerial in the road gap area. | Core fail. |
| E.2 | **"Two streets stacked" on divided roads** (Lafayette Avenue, Russell Boulevard, probably Chouteau). Pipeline has two parallel chains (divided OSM ways). When authored isn't substantive, both chains render as separate ribbons. Proper fix: author these streets as single spine centerlines, add median coupler. Or: detect divided pairs at pipeline time, merge into a single spine with median width derived from parallel gap. | Architectural. |
| E.3 | **Selection-driven translucency not implemented.** User's desire: "roadway becomes translucent when you select the street." Currently all Survey streets show translucent silhouette; all Measure streets show translucent per-stripe. Intended: unselected = opaque (Design-like) or simpler silhouette; selected = translucent edit surface. Requires splitting `meshes` useMemo output into selected vs. other groups for per-street materials. | UX. |
| E.4 | **SurveyorOverlay reads centerlineData directly** — doesn't pull from `renderRibbons`. So the navy centerline spine follows authored points even where `StreetRibbons` rendered pipeline geometry (Benton Place's loop is rendered, but SurveyorOverlay draws only the authored 8-pt stub). Unify: either (a) SurveyorOverlay iterates `renderRibbons.streets`, (b) `centerlineData` gets populated from pipeline for non-authored streets on load. | Source-of-truth consistency. |
| E.5 | **Dead-end endcap previews in Survey must show for all dead-ends,** not just the selected street. Currently cap preview is gated inside `selectedStreet !== null` block in `SurveyorOverlay.jsx`. Extract and render for every authored dead-end. | UX. |
| E.6 | **Right-side pan/drag dead zone.** User reported that pan/zoom doesn't work on the right side of the screen even when the panel isn't there. Investigate which overlay is capturing pointer events with full-width DOM. Candidates: `StagePanel`, `Panel`, `Toolbar`. Not yet investigated. | Bug. |
| E.7 | **Measure tool "no centerline to select"** after introducing renderRibbons routing. Measure needs to let the operator select a street to bring up its per-stripe handles. Currently mediated by `selectedStreet` from `centerlineData`, which requires the street to be in `centerlineData`. Pipeline-sourced streets aren't there, so they can't be selected in Measure. Fix: populate `centerlineData` fully on load, or teach Measure to select from `renderRibbons`. | Core feature regression. |
| E.8 | **Duplicate authored centerlines** (Lasalle Street ×3, S. 18th Street ×2, Waverly Place ×2, Ann Avenue ×2, Rutger Street ×2) render as multiple overlapping centerlines in SurveyorOverlay. Either dedupe at load, weld during load, or operator cleanup. | Data quality. |
| E.9 | **Orphan centerlines** (371 entries not in pipeline). Currently filtered out at render. Could also be deleted from centerlines.json as one-shot cleanup. | Data quality. |
| E.10 | **No corner plugs on authored streets.** The pipeline's intersections are indexed against pipeline points, which don't match authored points after we switch source. `resolveStreetSources` sets authored streets' `intersections: []`. Design-mode renders for Park Avenue etc. have flat intersections. Fix: spatial intersection detection at render time — find where two authored centerlines share a node and emit plug there. | Design rendering polish. |
| E.11 | **Median coupler UI is add/remove only.** No inspector for taper/hold/medianHW sliders. Defaults sized for residential (taperIn 8m, hold 30m, taperOut 8m, medianHW 3m). | UX completion. |
| E.12 | **Authored-vs-pipeline source heuristic is fragile.** Ratio of 0.5 between authored bbox diagonal and pipeline longest chain's diagonal. Breaks when authored is a closed loop (Truman — first=last, diagonal = 0 using endpoint-only) — internal span is actually wide but the heuristic can misjudge. Current heuristic uses full bbox diagonal which works for Truman; verify across full neighborhood. Long-term: operator flag per centerline ("this is the canonical one"). | Heuristic risk. |
| D.2 | **Chevron reads as dead-end in Measure.** Still queued from earlier session. Likely resolved incidentally if divided-road authoring lands (see E.2). | Related. |

### The real architectural fix — skeleton extraction as "Phase 0"

The premise of this whole session was wrong. Survey has been operating on
the pipeline's raw OSM-derived fragments (122 chains for ~68 logical
streets, plus tangled divided-road loops). That's why every data quality
problem surfaced as a rendering bug. The answer isn't more heuristics at
render time — it's a **skeleton extraction step** between raw OSM and
everything downstream.

**Phase 0 — Skeleton extraction** (new):
- Input: raw OSM highways (or whatever source a new neighborhood brings).
- Output: `skeleton.json` — one clean continuous polyline per logical
  street, with intersection topology and flags (divided, one-way,
  median width, type).
- Algorithm:
  1. Group OSM ways by name.
  2. Weld end-to-end within each group.
  3. Detect divided pairs (same name + parallel + opposite one-way):
     emit one synthetic spine line at the midpoint + a synthetic
     median insert coupler sized by the perpendicular gap.
  4. Unnamed fragments: attach to nearest named group by proximity +
     tangent alignment, or drop as "unclassified" for later triage.
  5. **Simplify to minimum nodes.** Ramer-Douglas-Peucker with ~0.5m
     tolerance + collinear-collapse + curvature-aware thinning. Most
     OSM polylines are over-subdivided; per-street node counts should
     drop from dozens to ~8-12 control points.
- Result: ~68 clean Street objects for Lafayette Square. Each with the
  minimum control-point set that describes its shape. No duplicates,
  no stubs, no orphans.

**Curve interpolation at render time** (renderer change, paired with
skeleton):
- Ribbon renderer samples the centerline as a C1-continuous spline
  (Catmull-Rom or cubic Bézier) to ~0.5m spacing BEFORE building quad
  geometry. Control points stay sparse and operator-editable; the mesh
  is always smooth.
- Benton Place (8 control points) renders as a perfect smooth loop.
  W 18th Street (5 control points) renders as a perfect arc. No "smooth
  slider" — smoothness is the default rendering behavior.
- Per-node `corner: true` flag breaks the spline for genuine sharp
  corners (e.g. at a T-intersection where the centerline abruptly turns).
  Default smooth; corners are opt-in.
- Kills the pointy-joint problem (miter math becomes unnecessary for
  smooth streets — adjacent segments are already tangent-continuous).

**Survey operates on the skeleton, not on raw pipeline fragments.** The
operator sees ~68 clean lines. Editing becomes tractable.

**centerlines.json becomes a thin overlay** on top of the skeleton —
just operator edits (moved nodes, couplers, measure overrides). Not the
source of geometry. The skeleton is regenerable from OSM; the overlay
is operator intent. Merging skeleton + overlay at render time is
deterministic and simple.

Downstream is almost untouched:
- StreetRibbons' rendering path: identical. Just consumes skeleton +
  overlay instead of ribbons + centerlines.
- Median coupler, reroute coupler, band system: unchanged.
- Measure tool: unchanged, just fewer streets to iterate.

**What Phase 0 replaces:**
- `resolveStreetSources` and its ratio heuristic — gone.
- End-to-end weld and reversal-split logic at render time — moved
  upstream into skeleton extraction; happens once per pipeline build.
- The authored-vs-pipeline question at every level — the skeleton is
  authoritative; the overlay adjusts it.

**What remains separate:**
- Face-fill vs. aerial (issue E.1) — geometric/rendering issue;
  separate from skeleton. Fix: clip `ribbons.faces` against street
  ribbon extent, or stencil-mask aerial-through-road area.
- Selection-driven translucency, dead-end-preview-always, right-side
  pan dead zone, Measure selection regression — all UI-level; easy
  once the skeleton exists.

### Sequenced plan for next session

1. **Write skeleton extractor** (`cartograph/skeleton.js`). Consumes
   `data/raw/osm.json`, emits `data/clean/skeleton.json`. Includes:
   group-by-name, end-to-end weld, divided-pair detection + synthetic
   spine emission, unnamed-fragment attachment, RDP simplification to
   minimum control-point set.
2. **Add spline interpolation to StreetRibbons.** Pre-sample centerline
   at ~0.5m via Catmull-Rom before extruding ribbon quads. Respect
   per-node `corner: true` breaks. Eliminate render-time node-count
   assumptions elsewhere.
3. **Route the renderer through skeleton.** StreetRibbons +
   SurveyorOverlay + MeasureOverlay all read from skeleton + overlay.
   Delete `resolveStreetSources` and its machinery. Delete the
   `polylineRibbon` miter math (unnecessary once curves are smooth).
4. **Decide overlay merge semantics.** Skeleton has stable slugified
   IDs (`park-avenue`, `south-18th-street`). Overlay keys by
   `{streetId, pointIdx}` for node overrides; by `{streetId}` for
   measure / couplers / caps. One-time migration script moves existing
   `centerlines.json` edits into the new overlay shape by name +
   spatial match.
5. **Face-fill vs. aerial** (E.1). Algorithmic clip of `ribbons.faces`
   polygons against street ribbon extent at pipeline time so there's a
   true road gap for aerial to show through in Fills-on tool mode.
6. **UI polish.** Selection-driven translucency (E.3), cap previews
   for all dead-ends (E.5), right-side pan dead zone (E.6), Measure
   selection regression (E.7). Small fixes once the base is solid.
7. **Median / reroute coupler inspector UI** (E.11). Sliders for
   taper / hold / medianHW / offset. Right-click menu already triggers
   the couplers.

---

## 2026-04-22 session — Survey/Measure split + segment direction fix

Two structural moves landed, plus data-model scaffolding for complex street
geometry (medians, jogs).

### Locked

1. **Survey vs. Measure division of labor.**
   - Survey owns longitudinal structure (centerline shape, nodes, couplers,
     caps, terminal, jog/median inserts). Renders as translucent blue
     silhouette envelope + centerline spine + outer property-line outline.
     No per-stripe strokes.
   - Measure owns cross-section (pavementHW/curb/treelawn/sidewalk per side,
     per coupler-segment). Renders as per-stripe translucent fills with
     per-material edge strokes. The color story.
   - Both write to `centerlines.json`; every surface (Survey overlay,
     Measure overlay, Designer ribbon, Stage shots) reads from the same
     live source.
   - "Fills" toggle unchanged — governs everything except the tool's
     subject matter (street-ways/paths).

2. **Silhouette renderer** (`StreetRibbons.jsx`, Survey-only).
   Iterates live centerlines (not `ribbons.streets` — that caused per-
   segment fragmentation on long multi-segment streets). One translucent
   blue envelope per street via `halfRingVarRaw` with per-point inner/outer
   radii, so insert couplers can carve the envelope.

3. **Insert-coupler data model** (`streetProfiles.js`).
   Couplers are now a mixed array of numbers (legacy split couplers) and
   objects. Object form:
   ```js
   { kind: 'insert', feature: 'median', pointIdx: 42,
     taperIn: 5, hold: 40, taperOut: 5, medianHW: 3 }
   ```
   `normalizeCoupler()` handles back-compat. `resolveInserts(street)`
   walks arc-length and returns per-point `{medianHW, lateralOffset}`
   with cosine-eased fairings. `segmentRangesForCouplers` updated to only
   pay attention to `kind: 'split'` (inserts don't segment the street).

   "Rock in the river" metaphor: one coupler carries taper-in / hold /
   taper-out as a composed object — not four loose keyframes the operator
   has to coordinate. Extends to jogs (`feature: 'jog'`), slip lanes,
   curb bulges without adding new primitives.

4. **Pipeline-level segment direction alignment.**
   `derive.js` now reverses ribbon chains whose local tangent disagrees
   with the authored centerline's direction over the span the chain
   covers. Was 37/122 reversed segments in `ribbons.json`, now 0/122.
   Consequence: `measure.left` is physical-left on every segment of every
   street. Downstream orientation-guard swaps in StreetRibbons
   (`meshes` + `edgeStrokes` useMemos) deleted — runtime stays simple.

   Root cause: OSM way-ordering is a drawing convention on two-way
   streets, not a directionality constraint. 23 of 25 direction-flipped
   streets were two-way (Park Ave, Rutger, Lafayette, Lasalle, Geyer,
   Jefferson, Truman Parkway…). Not a one-way-traffic issue.

   Why it matters: asymmetric Measure drags on long multi-segment streets
   were growing "both sides" because the guard's per-segment swap
   propagated the growth to inconsistent physical sides. Now consistent.

5. **Measure stripe-stroke reduction.** Per-stripe strokes in Measure
   now emit only at the pavement edge (asphalt outer) and the property
   line (outermost ring) — intermediate curb-outer / treelawn-outer
   strokes were visual noise on wide boulevards.

### Shelved / Partial

6. **Silhouette renderer doesn't handle medians yet.** The renderer
   consumes `resolveInserts` → per-point `medianHW` and carves the
   envelope correctly, but no Survey UI to author inserts. Test requires
   hand-editing `centerlines.json`:
   ```json
   "couplers": [{"kind":"insert","feature":"median","pointIdx":18,
     "taperIn":8,"hold":30,"taperOut":8,"medianHW":3}]
   ```

### Follow-ups

| # | Task | Notes |
|---|------|-------|
| D.1 | **Survey UI for insert couplers.** Right-click node → Split \| Median insert \| (future: Jog / Bulge). Inspector with taperIn/hold/taperOut/medianHW sliders + live silhouette feedback. Store action `setCouplerInsert(nodeIdx, props)`. | Queued; data model + renderer ready. |
| D.2 | **Chevron reads as dead-end in Measure.** Park Ave × 18th: pipeline segments Park Ave at the chevron; each segment ends flush with no continuation. Solutions: (a) don't segment at the chevron — it's an insert, not an intersection; (b) merge adjacent same-named segments seamlessly at render; (c) bake chevron from median/jog insert in derive. Likely (c) once D.1 lands. | Blocked on D.1. |
| D.3 | **Jog/lane-shift insert.** Same pattern as median, but modifies `lateralOffset` instead of `medianHW`. `resolveInserts` already reserves the field. Handles the Park Ave × 18th chevron geometry cleanly: coupler at the jog anchor, shift amount = Δy of the two halves, taper = chevron length. | Queued. |

## 2026-04-21 session — alley clipping landed

Long debugging cycle. Pointy-alley-end artifact at cross-street terminations
traced all the way to the alley ROW computation. Ribbons render the full
back-of-sidewalk at `pavementHW + CURB_WIDTH + treelawn + sidewalk`, but the
derive.js alley clip was subtracting two terms (curb, and survey data on
fallback streets) and over-halving divided streets. Result: alleys poked
through the sidewalk and terminated as knife-shaped wedges where the clip
polygon turned a corner.

### Locked

1. **Alley trim = polyline clip by per-street ROW, at sidewalkOuter.**
   `derive.js [7/8]` builds `streetROWUnion` by buffering each vehicular
   centerline by the full outer reach (pavement + curb + treelawn + sidewalk),
   then `Clipper.ctDifference` against each alley polyline via `PolyTree +
   OpenPathsFromPolyTree`. Flat caps (`EndType.etOpenButt`). 8m min-length
   filter drops sub-curb stubs. 113 alley polygons.

2. **Measure source preference:** `centerlines.json` per-side measure first,
   `defaultMeasure(type, correctedSurvey[name])` fallback — survey is now
   passed into the fallback so arterial streets (Chouteau, Jefferson,
   Dolman, S. 18th) that lack centerline data still get their surveyed
   `pavementHalfWidth` + sidewalk offsets instead of flat residential defaults.

3. **No divide-by-2 for divided streets in alley clip.** We want the buffer
   to reach the outer back-of-sidewalk regardless of whether the OSM
   centerline represents whole pavement or one half.

4. **CURB_WIDTH imported from `streetProfiles.js`** so `derive.js` uses the
   same constant as the ribbon renderer. Single source of truth.

### Shelved

5. **GroundMesh experiment** (`src/cartograph/GroundMesh.jsx`, ~270 lines)
   — planar subdivision + poly2tri Steiner grid to bake all ground layers
   into one z-fight-free mesh. Disabled via `{false &&}` in CartographApp.
   Was the wrong tool for this session's problem (alley ROW math, not
   z-fighting). Revisit if spillage becomes the top priority.

### Follow-ups

- Task #9: Debug remaining terminal-into-street cases. "One of these is
  fixed" after iter 15 — spot-check the full neighborhood for alleys still
  poking past sidewalkOuter. Likely candidates: streets where survey has
  no `pavementHalfWidth` at all (they'd still hit `TYPE_PAVEMENT_HW`
  defaults).
- Per-alley manual override JSON as an escape hatch if a specific
  terminal resists the algorithmic fix.

## 2026-04-20 session — locked decisions

Big day. Authoring loop went from "rough" to "passable." Toy fixture stood up.
Couplers Phase 1A (UI) shipped. Pipeline now clips paths to curb. Toolbar
redesigned and Fills semantics finally make sense.

### Architectural / strategic

1. **Stage IS the runtime scene.** Confirmed (after deep audit) that we don't
   need to "rebuild and copy over" — the runtime app already shares 90% of
   Stage's components (StreetRibbons, LafayetteScene, LafayettePark, etc.).
   The only forks are `StageSky` ↔ `CelestialBodies` (~1150 lines) and
   `StageArch` ↔ `GatewayArch`. Convergence path is well-defined: write
   `public/stage-config.json` schema → de-fork sky/arch with a `source` prop
   → wire cartograph "Publish" button → delete VectorStreets. Estimated
   ~3-4 focused days when ready.

2. **Toolbar redesigned, four orthogonal axes.** `tool` × `shot` × `scene` ×
   `Fills` are truly orthogonal — clicking through any combination lands in
   a coherent state.
   - Toolbar uses iOS-style segmented pills: `[Survey · Measure]`
     `[Fills]` `[Browse · Hero · Street]` `[Toy]` in Designer; shot mode
     swaps tools group for `[← Designer] [Publish]`.
   - Fills + Toy collapsed from 2-segment groups into single binary
     ToggleButtons. Aerial toggle dropped entirely (always on, redundant
     with Fills). New CSS tokens for the toolbar in cartograph.css.

3. **Toy scene operational.** Single 4-way intersection at origin with 4
   quadrant blocks, 12 houses (1878-1930 era → mansard / hip / flat roof
   variation + foundation pedestals via the real `Building` + `Foundations`
   components), 8 trees (real `ParkTrees`), 8 lamps on sidewalks (real
   `StreetLights`). Imports shared components, exports nothing. Lives in
   `src/toy/`. Hill terrain attempted then flattened pending elevation
   integration with `terrainShader` (task #9).

4. **Path/alley clipping is a pipeline rule, not a manual edit.** New
   `clipFeaturesOutsideCurb` helper in derive.js subtracts the union of
   `clippedStreets + CURB_WIDTH` from every footway/cycleway/steps/path/alley
   before emission. Paths now terminate at the curb everywhere. Z-fight
   killed by lifting MapLayers' path-family meshes to y=+0.06 (clears
   StreetRibbons face fills at y=+0.15 in shots).

5. **No destructive operations.** The old `splitAtNode` (turned one
   centerline into two separate entries with no rejoin) is gone. Replaced
   by **opt-in split couplers** — non-destructive markers on existing
   centerline nodes, fully reversible by toggling the same marker off. See
   `feedback_no_destructive_ops.md` (memory) for the principle. Wrote
   `cartograph/rejoin-splits.js` to remediate already-split centerlines (7
   pairs merged). Saved as a one-shot recovery utility.

6. **Couplers Phase 1A — UI + data only.** Right-click any interior node
   in Survey → toggles a split coupler at that node (renders as paired
   semicircles oriented along the street tangent — the "extension cord"
   visual). Persists as `centerlines.streets[i].couplers: [pointIdx]`.
   Pipeline doesn't yet split at coupler points — that's Phase 1B.

7. **Measure tool: real fixes shipped.**
   - Asymmetric drag bug fixed: pipeline reverses some ribbon segments
     relative to centerline orientation, causing left/right side mapping to
     flip. New orientation guard in StreetRibbons' merge step swaps
     `live.measure.left ↔ right` when ribbon tangent disagrees with live
     centerline tangent (dot product < 0).
   - Double-click-to-insert was being eaten by empty-pointerdown deselect.
     Removed the deselect; Esc remains the explicit deselect gesture.
   - Per-side reset removed (proved buggy). Replaced with **per-segment
     reset** (Phase 1B) — addressable once couplers split a street.
   - Min stripe width 1.0m enforced in `applyDrag` so handles can't visually
     collapse onto each other. Right/Ctrl-click remains the explicit "zero
     this stripe" gesture.
   - Handles **stagger along street tangent** when their `r` values are
     within `HANDLE_LONG + 0.5m` of each other — keeps them independently
     clickable on tight cross-sections (e.g. Park Avenue south side with
     8cm treelawn).

8. **Fills semantics finalized.** Fills is a comprehensive *overlay
   shortcut* layered on top of per-layer panel state.
   - **Fills ON** (default): full digital map renders. Per-layer toggles
     in Designer panel control individual layers granularly.
   - **Fills OFF**: hide everything except aerial photo + roadway
     composites (ribbons + corner plugs + stripes/edges/bike lanes + paths
     + lamps). Per-layer state preserved underneath — re-toggling Fills
     ON returns you to whatever per-layer state existed.
   - Same gesture, same effect, regardless of tool. Per-layer state
     persists across tool changes.

9. **Translucency belongs to the ribbons, not the rest.** Survey ribbons
   render translucent blue (0.28 opacity); Measure ribbons render translucent
   per-stripe (0.45 opacity). Face fills + buildings + paths stay **opaque**
   in every tool. The aerial-through-ribbon affordance is the tool's edit
   surface; everything else stays clean.

10. **Aerial bumped to z=19, then reverted to z=18.** z=19 was hitting
    tile-availability limits in some areas. Bump back when we have a
    fallback strategy (try z=19, fall back to z=18 on 404).

## 2026-04-20 — queued items

| # | Task | Notes |
|---|------|------|
| C.1 | ~~**Couplers Phase 1B.**~~ **SHIPPED 2026-04-25.** `segmentMeasures` keyed by ordinal (not `"from-to"` — stable across coord systems). Survey places couplers (Ctrl-click); Measure binds per-segment with reset; renderer walks segments end-to-end. Persistence still in-memory only — see new "overlay file" item. | Done. |
| C.2 | **Aerial z=19 with z=18 fallback.** TextureLoader can take an `onError` callback; on 404 retry the equivalent z=18 tile and stretch. | UX win — aerial detail at zoom-in. |
| C.3 | **Survey shows measured silhouette stroke.** Once Measure has been used, the Survey ribbon outer-stroke should reflect the actual measured ROW, not the default. Closes the Survey↔Measure feedback loop the operator needs. | High value. |
| C.4 | **Shadow post-pass (Approach D).** Per-frame post-processing effect that reads scene depth + shadow map, masks with material-ID stencil, multiplies onto flat-shaded ground pixels. Solves shadows on StreetRibbons without changing its flat shader. ~2-3 days. See `SHADOW_HANDOFF.md`. | Publishing polish blocker. |
| C.5 | **Fix dead-end caps (again).** Endcaps regressed somewhere — round/blunt cap rendering inconsistent across streets that have `capStart`/`capEnd` set. Need to re-verify the cap-match-by-terminal logic in StreetRibbons (added 2026-04-17 to prevent chain-split spurious caps) is still working with the orientation guard from 2026-04-20. | Recurrence. |
| C.6 | **Fix Survey "smooth" feature.** Catmull-Rom smoothing slider in SurveyorPanel — operator drags 0–100, expects centerline to interpolate through the same nodes with curve tension. Currently does not produce expected result; either slider not wired or smoothing not applied to displayed line. | Authoring tool bug. |
| C.7 | **Audit non-residential land-use classification.** Walk the neighborhood face fills and verify non-residential blocks (commercial, institutional, parking, park) are correctly classified. Park Avenue commercial strip, churches, school on Park Ave, the park itself, off-street parking lots — each should land in its right `face.use` value, otherwise face-fill colors mislead. Pipeline reads from parcel `land_use_code` dominant per face; misclassifications usually trace to a face whose dominant parcel is misleading. | Map correctness. |
| C.8 | **Path / face-fill z-fight unresolved.** Tried two passes of lift (+0.06m, then +0.15m) on alley/footway/stripe/edgeline/bikelane meshes. Operator still sees flicker at marked spots. Likely shot-mode-specific (terrain displacement amplifies coplanar issues) or the `polygonOffset` on these flat materials competing with face-fill's offset. Real fix probably requires either: (a) higher polygonOffsetFactor on path materials specifically, (b) a separate render pass with depthTest off, or (c) merging path geometry into the StreetRibbons face-fill mesh so they share the same draw. Investigate when shadow post-pass lands (related infrastructure). | Visual polish. |

## 2026-04-19 session — locked decisions

Captured end of day. Supersedes conflicting 2026-04-18 items.

1. **Measure model rewrite landed.** `measure: {left, right, symmetric}` per
   street; each side is `{pavementHW, treelawn, sidewalk, terminal}`. Hardwired
   stripe sequence asphalt → curb(fixed) → [treelawn] → [sidewalk|lawn].
   `_bands` removed from centerlines.json; pipeline + renderer + overlay +
   panel all rewritten. Old 8-material band stack retired. Parking is out of
   Measure entirely — becomes a separate overlay layer.

2. **Corner plug is universal + narrower-sidewalk rule.** One primitive per
   corner (bezier-rounded asphalt + curb + sidewalk arcs). Sized to the
   narrower sidewalk of the two meeting legs; wider surfaces butt. Skip the
   sidewalk arc only when neither leg has sidewalk. See memory
   `project_corner_plug_rules.md`.

3. **Royal blue = architectural color.** `#2250E8` for authoring overlays:
   centerlines in both Survey + Measure, Survey ribbon tint, outer property
   stroke. See memory `project_architectural_blue.md`. Reserved for tool
   context; ribbons never get this blue in production rendering.

4. **Measure UX: rectangular pills on strokes, anchored at click.** Handles
   are 5m × 1.2m pills oriented along the street, positioned at the click
   point's tangent frame (not midpoint). Drag to resize; right/ctrl-click
   to remove; double-click the sidewalk zone to insert a treelawn split.
   Symmetric by default; Asymmetrical unlock in panel.

5. **Ribbons tint in Measure + Survey.** `measureActive` → per-stripe
   translucent fills + per-material opaque strokes at every boundary.
   `surveyActive` → uniform blue tint + blue stroke at outermost boundary
   only. Aerial shows through fills in both modes.

6. **Residential land use gets the grass shader** in shots. Factored via
   `makeGrassMaterial({ color: luColors.residential })` — same noise shader
   as park. Treelawn ribbons adopt the residential grass material, lawn
   ribbons adopt the park grass material. Designer keeps flat face fills.

7. **Stage terrain coverage complete** for the obvious layers:
   - Lamps / glow / pool / base now instanced-terrain-displaced
     (`patchTerrainInstanced` in `terrainShader.js`).
   - Street markings (centerStripe / parkingLine / bikeLane) rebuilt as
     quad-strip ribbons (`stripeRibbonGeo`) that pick up terrain from
     `makeFlatMat`. No more 1-px lines buried under lifted ground.
   - Alley z-fighting fixed by reducing `makeFlatMat` polygonOffset to
     match StreetRibbons scale.

8. **Park-data coordinate systems clarified.** `park_trees.json` +
   `park_water.json` are park-local (axis-aligned in park frame), need
   `PARK_GRID_ROTATION` wrapper to sit in world. `park_paths.json` is
   world-aligned, counter-rotates inside LafayettePark. See NOTES.md's
   "RECURRING CONFUSER" section.

## 2026-04-18 — new items queued

| # | Task | Notes |
|---|------|------|
| A.1 | **Uplighting at the base of the Gateway Arch.** Ground-level warm lights that kick on at night (match streetlamp night-gate). | Visual accent; arch is the neighborhood's visual anchor. |
| A.2 | **Gradient editor for the skydome.** Operator-authored color gradient for the shot sky — enables branding looks (sports games, seasonal themes). | Future extension: fireworks particle system once the editor exists. |
| A.3 | **Fix Surveyor + Measure tool interfaces.** Currently usable but rough; needs UX pass (selection feedback, band add/remove flow, cap-marking clarity, keyboard shortcuts). | Direction set; execution pending. |
| A.4 | **Camera animations + controls for shots.** Browse/Hero/Street transitions, smooth tweens between shots, programmable camera paths. Current OrbitControls is serviceable but shot transitions are instant snaps. |
| A.5 | **Thicker barrier lines.** 707 barriers emit correctly (598 fence / 56 wall / 45 retaining_wall / 8 hedge, mostly property-line fencing; ~15 around the park). `LineBasicMaterial.linewidth` is ignored in WebGL on most platforms — lines render at 1 px. Upgrade to extruded line meshes (e.g. `meshline` or a custom ribbon strip) so fences read on the map at Browse zoom. |



Architecture: The cartograph IS the 3D scene viewed flat (orthographic top-down).
**Stage is embedded in cartograph** (not a separate app) — the same Canvas hosts
Designer (ortho) and Browse/Hero/Street shots (perspective) via a two-camera rig.

## 2026-04-17 session — locked decisions

Captured at end of day. Where these conflict with 2026-04-16, these win.

1. **Cartograph hosts Stage.** One `<Canvas>`, two cameras (ortho for Designer,
   perspective for shots). No more dual-Canvas architecture. `StageCanvas.jsx` is
   deleted; its children live inside `CartographApp.jsx` via a
   `<group visible={!inDesigner}>` wrapper for environment-only meshes. Fixes the
   long-standing WebGL context-loss skew bug that appeared when flipping between
   the two modes.

2. **Tool and Shot are orthogonal axes.** `tool: null | 'surveyor' | 'measure'`
   (null = neutral Design state, no `'design'` enum value). `shot: 'designer' |
   'browse' | 'hero' | 'street'`. Toolbar morphs on shot. Shot selector always
   visible. Supersedes the unified `mode` field. `Publish` button is a stub;
   implement when we're ready to publish.

3. **Stage is the scene authority, in progress.** `archState` in `StageApp.jsx`
   is the first slice — arch distance / scale / rotation / Y offset, plus
   horizon disc radius + fade live in one place and drive both Stage rendering
   and the Designer plan-view silhouette (`DesignerArch`). Eventually persists
   to `public/stage-config.json` and the main app reads from it. For now it's
   in-memory. See `project_stage_is_scene_authority.md` (memory).

4. **The palette is data, not constants.** `src/cartograph/m3Colors.js` is the
   single source of truth for default layer + land-use colors and for the
   `BAND_TO_LAYER` mapping between ribbon band materials and Designer-panel
   picker ids. `MapLayers` and `StreetRibbons` resolve every material color via
   `store.layerColors[id] || DEFAULT_LAYER_COLORS[id]`. Panel color pickers
   now drive rendering live. Palette is currently "vibrant graphic map" —
   muted M3 was too dark through ACES in shots.

5. **Tree / Lamp / Labels pickers are hidden** until they have real authoring
   sections. "Lamp color" isn't the right abstraction (light color + intensity
   is); "Tree color" isn't either (foliage material is); Labels needs
   typography + scale. A single color well was misleading.

6. **Park is a ribbon-rendered surface.** `StreetRibbons` face fills render the
   park face like any other block. The "Park" authored layer can later receive
   a swappable material (grass today; snow / autumn / drought / illuminated
   night are all Park-material variants, not separate layers). Paths + water
   are still owned by `LafayettePark` (shots) / `DesignerPark` (Designer), but
   their placement references the ribbon park face. See
   `project_park_as_ribbon_surface.md` (memory).

7. **Rotation is unlocked in shots** so the operator can orbit under the map
   (diagnostic). `minPolarAngle: 0, maxPolarAngle: π`. Leave unlocked.

## 2026-04-16 session — locked decisions

Captured before any interruption. These supersede earlier conflicting items:

1. **Defaults are Material-3 compliant until edited.** Every styleable property ships a
   sober, neutral default; the Designer is where users override. Measure-tool caustics
   stay loud but live in a separate palette (`CAUSTIC_BAND_COLORS`), never leaking into
   the rendered map. See `feedback_material3_defaults.md` (memory).

2. **Sidewalks are a default, not an operator-placed extra.** Every sidewalk-eligible
   street (residential / secondary / primary) gets a default sidewalk band filling the
   full curb-to-property-line gap. Tree lawns stay operator-placed; operator adds
   them by biting into the default sidewalk width. This supersedes
   `feedback_no_default_sidewalks.md`. **Not eligible:** service, footway, cycleway,
   pedestrian, steps — they're walking surfaces themselves. Alleys are pavement-only.

3. **Property line is survey-derivable.** `rowWidth/2 − pavementHalfWidth` from
   `survey.json` gives the authoritative per-street curb-to-property-line distance.
   Default band stacks are sized from this, not from a flat "5 ft" everywhere.

4. **Cross-section is asymmetric.** Schema: `bands: { left: [...], right: [...] }`
   on each street in ribbons.json. Up to 4 bands per half-width. Symmetric case =
   `left === right`. L/R is defined by traversing the centerline from `points[0]`
   onward; `side = +1` (matching existing `offsetPolyline`) is right.

5. **Gutter collapses into curb.** Visually indistinguishable at map scale. If the
   Designer wants to style it differently, it falls out as a stroke on the curb's
   inner edge via the layer-effects UI.

6. **Each mode has its own visual vernacular.** Subject matter (centerlines+nodes in
   Surveyor, bands in Measure, strokes in Marker) is visually dominant; aerial is
   context, not foreground. See `feedback_wysiwyg_authoring.md` (memory).

7. **One renderer.** SurveyorOverlay's private translucent `buildRibbonGeo()` is
   the two-renderer antipattern. Kill it; surveyor/measure overlays emit ONLY edit
   affordances (nodes, handles, labels). StreetRibbons renders the map beneath.

8. **Fills toggle.** Default: ribbons render at full opacity over aerial (the map is
   the subject). User can toggle fills off for aerial-only orientation.

---

## Phase X ✓ COMPLETE — Fills toggle + single-renderer detour

| # | Task | Status |
|---|------|--------|
| X.1 | Add `fillsVisible` store flag (default true) + toolbar toggle | done |
| X.2 | Show StreetRibbons + MapLayers in tool modes too (gated by fillsVisible) | done |
| X.3 | Delete SurveyorOverlay's private `buildRibbonGeo` + translucent ribbon meshes | done |
| X.4 | MeasureOverlay similarly — keep caustic + selected-street drag UI only | deferred (works as-is) |

---

## Phase 8 ✓ COMPLETE — Full 8-material band pipeline

Pipeline + renderer now consume `bands: {left, right}` per street. Corner bezier
preserved. Regression: a stale WebGL context was producing a "parallelogram"
render artifact after several crashes; a hard refresh / site-data clear resolved.

| # | Task | Status |
|---|------|--------|
| 8.1 | `streetProfiles.js`: Material-3 `BAND_COLORS`; caustic palette renamed `CAUSTIC_BAND_COLORS` | done |
| 8.2 | `getDefaultBandsFromSurvey(type, survey)` builds full stack incl. default sidewalk | done |
| 8.3 | `derive.js`: emit `bands: {left, right}` per ribbon street; keep `profile` for back-compat | done |
| 8.4 | Regenerate `ribbons.json` via pipeline | done |
| 8.5 | `StreetRibbons.jsx`: `sideBandsToRings()` → one ring per band; `refEdgesForSide()` (curb-inner, curb-outer, property-line) | done |
| 8.6 | Corner plug code: swap inputs to reference-edge helpers; bezier formula preserved verbatim | done |
| 8.7 | SurveyorOverlay hook-count bug from strip (moved early-return below all hooks) | done |
| 8.8 | Migrate existing `_bands` on Mississippi & Park Avenue from flat array to `{left, right}` symmetric in centerlines.json | pending — pipeline auto-symmetrizes for now |

---

## Phase 9 — Panel reorg + stroke feature + decoration split

| # | Task | Status |
|---|------|--------|
| 9.1 | Reorganize Panel into three sections: **Street Materials / Block Fills / Map Decoration** | pending |
| 9.2 | Wire `BAND_COLORS` overrides through store → StreetRibbons reads overrides | pending |
| 9.3 | Split MapLayers decoration: `alley`, `footway`, `path`, `cycleway`, `steps` each independently toggled + colored (none get sidewalks) | pending |
| 9.4 | Layer-effects collapsible row per layer (Photoshop-style): fill color + stroke color + stroke weight + revert; collapsed by default. **No fill-visibility toggle** — designers hide a layer by matching its neighbor's color (see `feedback_styling_vs_visibility.md`). | pending |
| ~~9.5a~~ | ~~Move Fills button into Measure mode~~ — **CANCELLED**: operator wants Fills as a global orientation toggle regardless of mode (off = aerial + strokes for reality-alignment). Stays in toolbar permanently. | cancelled |
| 9.5b | Replace the 3 flat toolbar buttons (Survey / Measure / Stage) with a **3-way segmented pill** — makes "one at a time" visually explicit. | pending |
| 9.5 | Apply stroke to appropriate layers (curb, sidewalk edge, block outlines, building outlines) | pending |
| 9.6 | Measure: L/R side picker with direction-of-travel arrow (**"Side A/Side B"** not Left/Right — user rejected L/R naming as "wrong 50% of the time") | pending |
| 9.7 | Per-band material dropdown in Measure panel (so click-to-insert's auto-assigned material can be relabeled) | pending |
| 9.8 | Parallel-vs-angled parking sub-selector in Measure panel band row | pending |

---

## Phase 11 — Fold park + water into the pipeline (ACTIVE — top of queue)

Park is authored as a **ribbon-rendered surface** (not a bespoke LafayettePark
component). "Park" is the layer; the material attached to it is grass today,
seasonally-swappable later. `LafayettePark`'s grass plane retires; its path
and water rendering moves to a shared layer consumed by both Designer and
shots. Only true 3D landmarks (GatewayArch etc.) stay as bespoke components.

**Today's state (end of 2026-04-17):**

- ✅ StreetRibbons face fills render park like any other block (filter removed).
- ✅ `DesignerPark.jsx` shell created, renders paths + water only.
- ❌ Paths + water still mis-placed (rotation unresolved — coords may be
  world-aligned and no rotation is needed; empirically test with 0 first).
- ❌ LafayettePark's grass plane still renders in shots, z-fighting with the
  ribbon park face. By design during transition.
- ❌ Grass shader not yet attached to the ribbon park face.

**Tomorrow's work (this phase, in order):**

| # | Task | Status |
|---|------|--------|
| 11.0 | Fix path + water placement in DesignerPark — empirically test `rotation = 0`, then `-GRID_ROTATION`, then `+GRID_ROTATION` and pick what aligns; may need a translation too | **NEXT** |
| 11.1 | Extract noise-based grass shader from `LafayettePark`'s `ParkGround` into a reusable material factory (`makeGrassMaterial`) | pending |
| 11.2 | Apply that material to the ribbon park face **in shots only** (Designer keeps flat face fill) — detect park face in StreetRibbons' `makeMaterial` and branch on layer id | pending |
| 11.3 | Remove LafayettePark's own grass plane (`ParkGround` component) — ribbon face owns that surface now | pending |
| 11.4 | Promote LafayettePark's path + water rendering to run in both Designer and shots; retire `DesignerPark` when parity reached | pending |
| 11.5 | Water polygons from `park_water.json` eventually become face-type entries in the ribbons pipeline (like `use: 'water'`); ribbons-time triangulation with outer/island holes | pending |
| 11.6 | Trees remain in `park_trees.json` (already decoration) — verify rendering parity after LafayettePark's grass plane is gone | pending |

**Future material variants for the Park layer (not in this phase):**

- Grass (default, current)
- Snow / frost (winter)
- Autumn foliage on fallen-leaf carpet
- Drought-brown
- Illuminated night (grass + lamppost light interaction)

These are Stage-authored material switches, selected per time/weather/season.
See `project_park_as_ribbon_surface.md`.

---

## Phase 12 — Material authoring: Design swatch → Stage editor

Every material (asphalt, grass, water, brick, parking, curb, sidewalk, treelawn…)
appears in the Design panel as a swatch with name + inline color picker. For deep
edits (shader, noise, tint map, texture tiling, procedural variation) the swatch
has an **"Edit in Stage →"** affordance that opens Stage pre-scoped to that material.

| # | Task | Status |
|---|------|--------|
| 12.1 | Material swatch component: name + color picker + "Edit in Stage" link | pending |
| 12.2 | Stage entry-point accepts a `?material=<id>` query param that jumps to that material in its gallery | pending |
| 12.3 | Migrate Stage's surface gallery (already built, per BACKLOG 6B.1) to be driven by the same material registry as cartograph | pending |
| 12.4 | Grass shader (already exists in LafayettePark) becomes the `grass` material's Stage view | pending |

---

## Phase 13 — Smart band populator + manual measurement snap + duplication

Note 2026-04-16: populator scope **narrowed**. Generic default is now minimal
(`asphalt + curb + sidewalk-for-eligible`, no default parking/treelawn) — the
operator captures irregular real-world cross-sections via the caustic ruler
(click-to-insert). 13.1–13.3 remain for optional smart augmentation but are
less urgent now that defaults are deliberately minimal.

| # | Task | Status |
|---|------|--------|
| 13.1 | `getDefaultBandsForStreet(tags, survey, parcels)` — consult OSM `sidewalk` tag first; fall back to street-class default | pending (optional) |
| 13.2 | Emit asymmetric `bands.left` / `bands.right` when OSM says `sidewalk=left`/`right` | pending (optional) |
| 13.3 | Parcel adjacency check — streets with no building/parcel frontage on a side (parks, rail, ramps) get no default sidewalk on that side | pending (optional) |
| 13.4 | Boundary-aware dead-end detection — endpoints near `neighborhood_boundary.json` are map exits, not cul-de-sacs. Combines with Phase 14 (divided oneways). | pending |
| 13.5 | **Snap-always on manual measurement drag-release.** | done |
| 13.6 | **Template duplication.** Measure panel "Apply this profile to…" action: operator selects a measured street, tool offers candidates (same type, similar ROW, same class) as multi-select, one click applies the band stack to all selected. | pending |

---

## Phase 14 — Divided one-ways + medians

Lafayette Square has divided one-way classes: Truman Parkway, the loop streets
(Benton Place, Mackay Place), possibly Russell and parts of Jefferson. In OSM
these are two separate `oneway=yes` ways sharing a `name`, running parallel with
a median gap. They currently break cross-section modeling and plug counts.
Update 2026-04-16: auto-detection of dead-ends was retired; caps are now
per-endpoint and operator-marked in Survey mode, so divided-road halves can be
correctly left uncapped by the operator. Phase 14 is still wanted for median
rendering and plug handling, but is no longer blocking cap re-enablement.

| # | Task | Status |
|---|------|--------|
| 14.1 | Detect divided pairs — same name + parallel + opposite `oneway` + within ~30m of each other over most of their length | pending |
| 14.2 | Emit asymmetric bands per half: outer side (toward property) = full stack; inner side (toward median) = narrow curb only, no parking, no sidewalk | pending |
| 14.3 | Median polygon emitted as its own face (`use: 'median'` or `'park'` for grass medians; `'paved'` for concrete) | pending |
| 14.4 | Suppress caps on inner-facing endpoints of each half — they're "rejoin-with-the-other-half" boundaries, not cul-de-sacs | pending |
| 14.5 | Plug logic at divided intersections: two halves meeting a cross-street = one logical intersection with 4 quadrants (not 8) | pending |
| 14.6 | ~~Re-enable cap rendering~~ — **DONE** (2026-04-16): caps are now operator-marked per endpoint; `StreetRibbons` `CAP_ENABLED = true`. | done |

---

## Phase 10 — Corner rounding, endcaps, polish

Corner plug *geometry* landed in 8.6 (proven bezier preserved, inputs rewired to
band-stack reference edges). Endcap assignment + rendering landed 2026-04-16.
Remaining work is visual validation + polish.

| # | Task | Status |
|---|------|--------|
| 10.1 | Propagate per-endpoint `capStart`/`capEnd` from `centerlines.json` through `derive.js` into `ribbons.json` | done |
| 10.2 | `StreetRibbons.jsx` renders round endcap geometry via `quarterCapRaw` per band per side. Blunt caps need no extra geometry. | done |
| 10.3 | Validate corner plugs visually across all 180 intersections — find any that look wrong with the new band-stack reference edges | pending |
| 10.4 | Verify the sidewalk×treelawn corner case: treelawn dead-ends, sidewalk fills through to form the corner curb ramp | pending |
| 10.5 | Polish the aesthetic curb stripe (`corner_curb` band) — color + width tuning via the Design panel | pending |
| 10.6 | Verify corners for streets with measured (asymmetric-capable) bands — Mississippi Avenue, Park Avenue — refs come from the correct side's band stack | pending |
| 10.7 | Corner plugs at dead-end intersections (T-intersections where one arm terminates) — special case handling | pending |

**Don't touch:** the bezier formula `ctrl = 2×mid(P0,P1) − oo`. It's proven across
all 4 quadrants with the oo↔ii distance-check swap. Only adjust *inputs* to it,
never the math itself. See `project_corner_rounding_progress.md`.

---

## Phase 0 — Cartograph as Three.js app ✓ COMPLETE

| # | Task | Status |
|---|------|--------|
| 0.1 | cartograph.html + src/cartograph/main.jsx entry point | done |
| 0.2 | vite.config.js multi-page: serve at /cartograph | done |
| 0.3 | CartographApp.jsx: Canvas + orthographic camera + MapControls | done |
| 0.4 | Mount StreetRibbons.jsx (renders all 122 streets + face fills) | done |
| 0.5 | Verify: pan/zoom, flat rendering, full neighborhood visible | done |
| 0.6 | Aerial imagery as ground-plane texture (always mounted, toggle) | done |
| 0.7 | Port surveyor tools as Three.js overlay | done |
| 0.8 | Port marker as window-level overlay, measure as Three.js overlay | done |
| 0.9 | Master CSS (cartograph.css with token system) | done |
| 0.10 | Neighborhood boundary clipping (convex hull of buildings + 100m) | done |
| 0.11 | Camera position persists to localStorage | done |
| 0.12 | Marker as independent toggle (works in any mode) | done |
| 0.13 | Scroll wheel zoom works in all modes | done |

---

## Phase 1 — Land-use face fills ✓ COMPLETE

| # | Task | Status |
|---|------|--------|
| 1.1 | Face-fill polygons in ribbons.json (ring + land_use per face) | done |
| 1.2 | Render face fills in StreetRibbons.jsx | done |
| 1.3 | Land-use color palette | done |
| 1.4 | Verify street layers fully cover face fill at edges | not started |

---

## Phase 2 — Default rendering: pavement + curb only (SUPERSEDED 2026-04-16)

~~The system does NOT guess at sidewalks or treelawns.~~ Superseded by the Material-3-
defaults principle: sidewalks ARE a default (reality, every block has one). Tree lawns
remain operator-placed. See the 2026-04-16 session notes above, and Phase 8.

---

## Phase 3 — Surveyor → pipeline → renderer loop

When the operator edits centerlines in Surveyor mode and exits, the pipeline
rebuilds ribbons.json and the cartograph reloads with updated geometry.

| # | Task | Status |
|---|------|--------|
| 3.1 | Pipeline reads centerlines.json as primary street source | done (render.js) |
| 3.2 | Pipeline reads centerlines.json in derive.js (for polygonization + ribbons) | not started |
| 3.3 | Exit surveyor → rebuild pipeline → reload cartograph | not started |
| 3.4 | Smooth slider applies Catmull-Rom to centerline before pipeline | done (UI exists) |
| 3.5 | Pipeline reads `capStyle` (round/blunt) from centerlines.json for dead-end streets | not started |
| 3.6 | ribbons.json carries `capStyle` per street for dead-end rendering | not started |
| 3.7 | StreetRibbons.jsx renders round or blunt endcap geometry from `capStyle` | not started |
| 3.8 | Pipeline reads `_bands` (measured band stack) from centerlines.json | not started |
| 3.9 | Band stack → flat profile conversion for ribbons.json | not started |

---

## Phase 4 — Measure mode → pipeline wiring

Band stack defines per-street cross-sections. Operator composes bands visually
in Measure mode; the result flows to the pipeline and renders in the map.

| # | Task | Status |
|---|------|--------|
| 4.1 | Band stack data model (ordered array of material + width per street) | done (in centerlines.json as `_bands`) |
| 4.2 | Measure overlay: filled ribbons + caustic cross-section + draggable nodes | done (needs polish) |
| 4.3 | Code-compliant snap (sidewalk 5ft, treelawn 4.5ft, etc.) | done |
| 4.4 | Copy/paste profile between streets | done (UI) |
| 4.5 | Right-click to add treelawn/sidewalk bands | done |
| 4.6 | Band reorder/remove in panel | done |
| 4.7 | Multiple caustic keyframes per street (width varies along length) | partially done (data model ready, UI has single midpoint) |
| 4.8 | Asymmetric left/right profiles | not started (symmetric flag exists) |
| 4.9 | Batch apply: select streets → paste measured profile | not started |
| 4.10 | Measure overlay visual polish (visibility, contrast, interaction feel) | needs work |

---

## Phase 5 — Corner bands

Arm rings work. Corner bands (sidewalk merge at intersections) are designed
and the bezier formula is proven. Implementation in StreetRibbons.jsx.

| # | Task | Status |
|---|------|--------|
| 5.1 | Implement corner band mesh (proven bezier: ctrl = 2×mid(P0,P1) − oo) | not started |
| 5.2 | All material cases (sidewalk×sidewalk, sidewalk×treelawn, grass×grass) | not started |
| 5.3 | Treelawn dead-end + sidewalk fill-through | not started |
| 5.4 | Aesthetic curb stripe at corners | not started |
| 5.5 | Validate across all 180 intersections | not started |

Architecture: rings not filled, polygonOffset (positive, pushes back), FrontSide.
Winding: CCW from above (indices flipped 2026-04-15). PBR lighting, not flat shader.
DO NOT change the bezier formula. It works.

---

## Phase 6 — Stage (3D art direction tool)

Stage IS the neighborhood app with creative tools instead of app UI. Same Canvas,
same components, different overlay. To be folded into the cartograph as a mode.

### 6A — Environment & cameras

| # | Task | Status |
|---|------|--------|
| 6A.1 | Stage entry point + vite config (stage.html, src/stage/) | done |
| 6A.2 | Shot selector (Hero / Browse / Street) | done |
| 6A.3 | Camera: keyframe timeline, Catmull-Rom, scrubber, speed, go-to | done |
| 6A.4 | Time of day: dawn-to-dawn SunCalc waypoints + slider | done |
| 6A.5–6A.10 | Environment controls (exposure, AO, bloom, grade, grain, haze) | done |
| 6A.11 | Shadow size/samples | done (UI) |
| 6A.12 | GPU budget meter with 30/60fps target | done |
| 6A.13 | StageSky: forked CelestialBodies, opaque sky dome | done |
| 6A.14 | StageArch: forked with thickened cross-section | done |
| 6A.15–6A.19 | Terrain, ribbons edge fade, building pedestals | done |
| 6A.20 | Per-component GPU profiling | not started |
| 6A.21 | **Stage as cartograph toolbar mode (not separate /stage URL)** | **NEXT** |

### 6B — Surfaces (~50 material classes)

| # | Task | Status |
|---|------|--------|
| 6B.1 | Surface gallery UI (tabbed: Streets, Land Use, Walls, Roofs, etc.) | done (UI only) |
| 6B.2 | Per-surface controls: color picker, roughness, emissive, texture | done (UI only) |
| 6B.3 | Surface config store + surfaces.json persistence | not started |
| 6B.4 | Wire StreetRibbons to read colors from surface store | not started |
| 6B.5 | Building wall palette (5 materials → color ranges, per-building seed) | not started |
| 6B.6–6B.9 | Neon palette, tree palette, texture maps, shader balls | not started |

### 6C — Persistence & export

| # | Task | Status |
|---|------|--------|
| 6C.1–6C.4 | shots.json, surfaces.json, environment.json persistence | not started |

---

## Phase 7 — Production migration

Migrate Stage's clean 3D ground to the production app. Replace all SVG/CSS3D hacks.

| # | Task | Status |
|---|------|--------|
| 7.1 | Retire VectorStreets/CSS3D SVG in Scene.jsx | not started |
| 7.2–7.6 | Port StageSky, StageArch, StreetRibbons, pedestals, shadows to production | not started |

---

## Surveyor tool improvements (from 2026-04-15 session)

| # | Task | Status |
|---|------|--------|
| S.1 | Per-street undo (Cmd+Z, 50 levels) | done |
| S.2 | Split at node (two segments, same street identity) | done |
| S.3 | Dead-end endcap preview (round/blunt toggle) | done |
| S.4 | Disabled streets visible as red lines (clickable to re-enable) | done |
| S.5 | Bold nodes with dark outlines | done (needs more contrast) |
| S.6 | Add node (insert point on segment) | not started |
| S.7 | Draw new street | not started |
| S.8 | Join streets at intersection | not started |
| S.9 | Visual weight pass (everything too subtle on aerial) | needs work |

---

## Neighborhood extent (from 2026-04-15 session)

| # | Task | Status |
|---|------|--------|
| N.1 | Convex hull boundary from building catalog | done |
| N.2 | Boundary clipping in StreetRibbons + MapLayers | done |
| N.3 | Refine boundary via marker tool (8 zones marked) | not started |
| N.4 | Fade/vignette at edges (blocks fade, streets fade further) | not started |
| N.5 | Create missing blocks for boundary zones | not started |
| N.6 | Camera default to neighborhood center | not started |

---

## Done (this session, 2026-04-15)

| Item | 
|------|
| Phase 0 complete — cartograph is a working Three.js app at /cartograph |
| Housekeeping: deleted 7 dead files, archived 2 docs, fixed derive.js duplicate key |
| Data contract verified: pipeline output byte-identical to ribbons.json |
| Identity architecture documented (geometry vs identity tracks) |
| Building catalog audited: 1056 buildings with wall/roof materials ready for Stage |
| Master CSS with token system for client theming |
| Marker QA: full round-trip, spatial analysis, overlay toggle |
| Neighborhood boundary: tight convex hull, clipping in all layers |
| Surveyor workspace: aerial + width ribbons, per-street undo, split, endcap preview |
| Measure workspace: band stack model, filled ribbons, caustic cross-sections, code snap |
| Scroll wheel fix, camera persistence, smart cursor hover detection |
