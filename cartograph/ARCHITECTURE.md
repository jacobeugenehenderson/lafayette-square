# Architecture

How this codebase is organized and how its pieces fit together. Read top to bottom; it builds.

> Part of the **cartograph quintet** (`cartograph/FEATURES.md` / `cartograph/ARCHITECTURE.md` / `cartograph/BACKLOG.md` / `cartograph/NOTES.md` / `cartograph/RIBBONS.md`). Read at session start; flag contradictions during work; update at session end. Goal: keep these docs pristine and current. Stale claims are worse than no claims — they actively mistrain readers. The LS consumer app has its own parallel trinity under `ls/` — see root `README.md` for the index.
>
> **`RIBBONS.md`** is the canonical reference for the ribbon + corner + curb + intersection + block-geometry system — the heart of the visible map. Read it before any geometry work. Living doc; evolves every session until the corner problem closes.

---

## 1. The publish-loop pattern

The codebase is a **public-facing runtime app** plus a small set of **standalone helper apps**. Each helper authors a specific kind of content and publishes one canonical artifact. The runtime composes those artifacts into the rendered scene.

```
┌────────────────┐    publishes     ┌──────────────────────────────┐
│  Cartograph    │ ───────────────▶ │ public/baked/<id>/ground.bin │ ──┐
└────────────────┘                  │ + ground.json + lightmap.png │   │
                                    └──────────────────────────────┘   │
                                                                       │
┌────────────────┐    publishes     ┌──────────────────────────────┐   │   ┌──────────┐
│  Stage         │ ───────────────▶ │  stage-config.json (future)  │ ──┼──▶│ Runtime  │ ──▶ pixels
└────────────────┘                  └──────────────────────────────┘   │   └──────────┘
                                                                       │
┌────────────────┐    publishes     ┌──────────────────────────────┐   │
│  Arborist      │ ───────────────▶ │ public/trees/<species>/...   │ ──┤
│  (scaffold)    │                  └──────────────────────────────┘   │
└────────────────┘                                                     │
                                                                       │
┌────────────────┐    publishes     ┌──────────────────────────────┐   │
│  Meteorologist │ ───────────────▶ │ public/clouds/{presets,      │ ──┘
│  (in Stage)    │                  │            almanac}.json     │
└────────────────┘                  └──────────────────────────────┘
```

**Note on Meteorologist's shape:** no separate app shell — its authoring UI lives inside Stage. The publish-loop pattern still holds; only the editor's housing differs. See [`../meteorologist/ARCHITECTURE.md`](../meteorologist/ARCHITECTURE.md).

**Properties of this pattern, used everywhere:**

- **Helpers are decoupled.** Cartograph never imports Arborist's code; the runtime never imports a helper's editor surfaces. They only know about each other through the artifacts.
- **Artifacts are pristine.** No helper-specific scaffolding gets baked in. An artifact is a clean handoff format that any consumer (this app, a future kiosk, an embedded preview) can read without owning the producer.
- **Helpers are dev-time tools (v1).** They run locally. They're not deployed alongside the runtime. The deployed LS app has zero write paths back to a helper — the slab is consumed read-only as static files. *v2+ direction:* a hosted bake service with per-operator auth so non-maintainer operators can publish their own instances without git write access to the kit repo. Tracked in `cartograph/BACKLOG.md` "Hosted bake service with auth (v2+)".
- **One artifact per helper, per concern.** If you ever feel like a helper should publish two artifacts, that's usually two helpers.

When adding a new helper, follow this pattern verbatim: standalone editor app → one published artifact → runtime consumer that reads it. See `cartograph/README.md` for the established template.

---

## 2. Geometry vs. styling — the Designer / Stage split

Cartograph itself is internally split the same way the larger system is. Two roles, two tools, one app:

- **Designer = shape.** Survey, Measure, Plant *(future)*, centerlines, caps, anchors, boundary, tree positions. Geometry edits propagate to *every* Look.
- **Stage = look.** Color, visibility, materials, shaders, time-of-day. Per-Look styling.

This same split shows up in every helper that has both kinds of editing:

| Concern | Owner |
|---|---|
| Where the streets go | Cartograph Designer |
| What the asphalt is colored | Stage Surfaces (per Look) |
| Which trees stand at which positions | Cartograph Designer (Plant tool, v1.1) |
| What color sugar maples are | Stage Surfaces (per Look) |

**Looks vary styling, never shape.** That rule is what lets the runtime swap Looks at zero cost — just a different `design.json` + `ground.svg`, the geometry is identical.

### ⭐ 2.1 The three tools (target architecture): Survey · Section · Stage

The "Designer = shape" role above is being **separated into two distinct tools**. The full target is **three tools** — each a genuinely different area with its own toolset, each freezing an artifact the next consumes:

| Tool | Authors | Its own tools | Freezes |
|---|---|---|---|
| **Survey** | the **polygon / corner SHAPE** — block silhouette, corner *geometry* (radius), curb. Strokes the centerline chains **outward** into hardscape. | outward stroke, per-corner radius, footprints | the **hardscape shape** — **wall #1, chains die** |
| **Section** | the **ribbons + the internal corners** — treelawn/sidewalk strips, the bent-rectangle corner *fills*, ADA pads, dead-end caps. Strokes **inward** off the frozen curb; LU is the remainder. | inward strokes off the frozen curb | the ped cross-section, authored *onto* Survey's frozen shape |
| **Stage** | the **look / slab** — materials, color, visibility, shaders, sky, post-FX, neon, camera. | (exists today; works on LS) | the **slab** — **wall #2, store dies** |

**The corner is TWO things, in TWO tools.** The corner *shape* (how round the curb silhouette is) is **Survey**. The corner *fill* (how the ped ribbons bend around it — the bent rectangles, the ADA pad) is **Section**. Conflating these two is the root of the corner mess: a fill cannot settle while the shape under it is still moving.

**⭐ Survey and Section are NOT the same — different *data models*, not just different tools.** Survey works in **polygons**; Section works in **ribbons**. The system has deliberate, elaborate machinery to *leave the nodes and chains behind* at the wall and hand Survey clean polygons (faces of the centerline graph) — **separating polygons from ribbons**. *(⚠️ Aspirational for the CURB, 2026-06-09: the tile **topology** is frozen (D2), but the **curb geometry is still re-stroked live from chains** every frame — only Section consumes a frozen curb; Survey re-derives. The curb is the last unfrozen polygon — `PREBAKE.md §4.1`, `SKELETON.md §5f`, `BACKLOG` "Freeze the CURB geometry.")* So a Survey-stage defect (a block-silhouette dogleg, a corner SHAPE) must be diagnosed and fixed **in polygon terms** — *never* by reasoning back through chains, carriageway centerlines, `pavementHW`, or inner-edge measures, which are ribbon/Section concepts. Sliding from a Survey polygon problem into a chain/ribbon explanation is itself the recurring **bug-class**: it re-couples exactly what the wall exists to decouple. *(2026-06-04: Boz did this diagnosing the park-corner dogleg — explained a polygon step via carriageway `pavementHW` offsets; Jacob's correction: the chains are already gone — work the polygon. The polygon-level question "how should the block silhouette behave at a divided↔undivided transition" is answerable without ever naming a carriageway.)*

**Where we actually are (2026-06-02 — vital to hold):** all three tabs **already exist** in the Designer panel — the `ToolPill` in `Panel.jsx` is the 3-part **Survey | Measure | Design** selector (`SurveyorPanel.jsx` / `MeasurePanel.jsx` / default Look editing). **Survey** (`SurveyorPanel.jsx`) already owns: hero-subject pick, the **Smoothing** dial (the Phase-2 stroke-construction silhouette control — live==bake WYSIWYG), street metadata (name/type/oneway), anchor, and **Caps** (round/blunt/none). **Measure** owns the ped widths (treelawn/sidewalk) — it is the future **Section**. So the separation is **consolidation, not from-scratch**: the corner-SHAPE authoring (the on-canvas `CornerEditHandles` radius editor — today it floats outside the panel) + curb width move *into* the existing Survey tab next to smoothing+caps; Measure refits to Section (ped widths + the ribbon corner FILLS + ADA). Section can only be clean once it strokes onto a **frozen** Survey shape — so **corner/ribbon/cap polish in the conflated surface is throwaway** until SHAPE is consolidated into Survey and frozen. (Doc spec: FEATURES.md §"Toolbar=views, Panel=tools" + L458 "Survey + Measure author the silhouette; the corner editor refines it; the curb traces it.")

*(References: the bakes/walls model = memory `project_two_bakes_two_walls`; the outward/inward stroke construction = `project_stroke_construction_model`; the corner invariants that bind whatever builds the shape = `RIBBONS.md §3.9a` + its "invariants that survive the rewrite" block.)*

---

## 3. The Looks model

A **Look** is a styling snapshot. Each Look is `{ design.json, public/baked/<id>/* slab }` plus eventually shader params. The user always works in *some* Look.

Three layers, in order:

1. **Working draft (autosave, always on).** Every panel tweak hits the active Look's `design.json` within ~300ms. Survives reloads. No prompts.
2. **Looks (named saved configurations).** First-class names: `lafayette-square` (the project's 0-state, can't be deleted), `valentines`, `cardinals-win`, `winter`. User explicitly forks via "＋ Save as new Look…". Each carries its own autosaved working state.
3. **Stage shaders (runtime, no per-Look persistence).** Future. Lives in a stage-config layer; applies on top of whatever Look is active.

**The implicit bake.** Designer's "Stage →" navigates immediately and bakes async in the background, so the Stage view's slab refreshes via `bakeLastMs` cache-bust when the bake finishes. Stage's "↻" re-bakes in place. The user never explicitly "saves the bake" — that language is misleading. The deliberate save action is *forking* into a new named Look.

**Looks are material-keyed, never feature-keyed.** A Look's `design.json` says *"asphalt is pink"*, not *"the asphalt of street id chain-43A12 is pink"*. So adding geometry in Designer never invalidates a Look — new streets inherit the active Look's rules, re-bake just enlarges the slab with consistent styling. **Designer → maintain → Stage is purely additive.**

See `memory/project_cartograph_looks_model.md` for the full decisions.

---

## 4. Per-helper directory layout

Helpers follow a consistent directory shape so a contributor (or agent) showing up cold can navigate any of them by analogy:

```
<helper>/                  # Build-side: CLIs, server, data sources
  serve.js                 # (optional) Node backend serving the helper's API
  bake-*.js                # CLI: produces the artifact
  data/                    # Inputs the bake reads (geometry, point clouds, etc.)
  README.md                # Contract: inputs, output, endpoints, commands

src/<helper>/              # Runtime-side: React UI for the helper
  *.jsx                    # Editor surfaces, panels, tools
  stores/use*Store.js      # Zustand state for that helper

public/<helper-output>/    # Where the helper's published artifacts live
  …                        # Served as static assets to the runtime
```

Cartograph is the canonical example today. Arborist (scaffolded) is mirroring it; see [`arborist/SPEC.md`](arborist/SPEC.md) for the build plan.

---

## 5. Runtime composition

The runtime is the public app at `/`. It mounts the rendered neighborhood, loads each helper's artifact, and composes them. The runtime never edits anything — it's read-only over the artifacts.

Key runtime entry points:

- `src/components/Scene.jsx` — main app scene tree
- `src/components/BakedGround.jsx` — consumes a Look's slab (`public/baked/<id>/ground.{json,bin}` + `ground.lightmap.png`), renders as a single fortified mesh with baked AO. Honors `manifest.stencil = null` (toy / scenes without a soft-circle silhouette) by skipping the radial-fade shader.
- `src/cartograph/BlockGeometryV2Debug.jsx` — live-render path for Designer authoring (V2 block-edge-owned ribbons). The retired `src/components/StreetRibbons.jsx` is gone; the shared `src/lib/ribbonsGeometry.js:buildRibbonGeometry()` face-clip helper now has `cartograph/bake-ground.js` as its sole consumer
- `src/lib/buildPathRibbons.js` — shared helper for non-street ribbons (alleys, footways, cycleways, steps, dirt paths). Clipper-based polyline offset with `jtRound` joints and configurable end-cap mode (square / rounded / round). Consumed by both `BlockGeometryV2Debug.jsx` (Designer live render) and `cartograph/bake-ground.js` (slab emission); same input → same geometry, no drift possible.
- `src/components/InstancedTrees.jsx` — consumes Arborist's `public/baked/default.json` + GLB variant atlas. Look resolution: explicit `lookId` prop → `?look=` URL param → `INSTANCE.lookId` (post-Couplers §6).
- `src/components/BakedLamps.jsx` — consumes `public/baked/<look>/lamps.json` and wraps `StreetLights`. Shared between Stage and Preview (was preview-only before 2026-05-13). Same look-resolution pattern as `InstancedTrees`; re-fetches on store `bakeLastMs` change.
- `src/utils/terrainShader.js` — shared terrain-displacement helpers. Every ground-anchored consumer reads from the same `uExag` uniform (driven from `terrainExag.value`, lerped toward `V_EXAG` from `src/lib/terrainCommon.js` by `BakedGround.TerrainExagDriver`). Helpers:
  - `patchTerrain(mat, { perVertex, terrainNormals })` — rigid (sample at `modelMatrix[3].xz`) or per-vertex (sample at each vertex's world XZ). Used by ground, post/rail meshes, foundation paths.
  - `patchTerrainAtCentroidRaw(mat, centroidRaw)` — rigid lift by a precomputed raw value × uExag, via per-material `uCentroidRaw` uniform. Used by building walls where the anchor isn't the mesh origin but the mean-of-footprint-vertices raw (see FEATURES.md "Terrain doctrine").
  - `patchTerrainInstanced(mat)` — for InstancedMesh; samples at each instance's world origin and divides the lift by instance Y-scale so the world-space result is `sample × uExag` METERS regardless of per-instance scaling. Used by lamps, trees.
  - `BILLBOARD_VS_INC` snippet (in `src/components/StreetLights.jsx`) — lifts billboard quads directly in world space inside the custom ShaderMaterial vertex shader; bypasses three's standard project_vertex chain.
- `src/lib/terrainCommon.js` — `V_EXAG` constant + `makeElevationSampler` (bilinear). Currently `V_EXAG = 1.5`. Single dial for the whole scene; changing it rescales every consumer coherently.

The runtime also re-renders live edits in Designer/Stage during authoring sessions — color changes in Stage Surfaces show on screen *immediately*, not on next bake. The bake then captures a snapshot for handoff.

---

## 6. Data flow summary

See `FEATURES.md §"Data flow & the bake chain"` for the full canonical pipeline diagram (raw → clean → pipeline → promote-ribbons → per-concern bakes → slab). Keep that one in sync; this section is a pointer.

---

## 7. Conventions worth knowing

- **Look IDs are slugged user names.** `lafayette-square`, `valentines`, `cardinals-win`. Default Look = `lafayette-square`, can't be deleted.
- **`overlay.json` carries geometry only.** Per-chain `measure` and caps; nothing else. Couplers + segmentMeasures retired with the V2 block-customs migration (2026-05-08); per-block-edge overrides live in `design.blockCustoms` instead. The design block was extracted into per-Look `design.json` files.
- **Materials, layers, land-use** all map through `BAND_TO_LAYER` in `src/cartograph/m3Colors.js`. The bake honors the active Look's `layerVis` to skip hidden materials. As of 2026-05-05, every Designer-Panel toggle has a matching bake group, so what the operator hides in Designer is hidden everywhere downstream (Stage, Preview, production) after the next bake.
- **Leg ribbons and corner pads (historical, pre-V2).** This convention described the chain-rectangle ribbon decomposition that V2 (block-edge-owned ribbons) replaced. The two-pass edge-continuity contract held under that model. Under V2, corners are derived structurally from the same source as legs (rounded-block-clip — see memory `feedback_corner_pad_continuity_first`) and the two-pass framing no longer applies. Retained here as a pointer to the V2 migration rationale; the operational rule today is `feedback_corner_pad_continuity_first`. **Flagged for full rewrite at next cartograph session.**
- **The neighborhood silhouette — one SSOT (`src/cartograph/boundary.js`).** The disc is a **circle, always** (`[[project_neighborhood_disc]]`): center + nominal radius + a 256-pt polygon hugging it, plus two radial feather bands — `fade {inner,outer}` (face-fills) and the wider `streetFade {inner,outer}` (streets trail past faces). All of it loads from **one artifact**, `cartograph/data/<id>/neighborhood_boundary.json` (v2 schema, v1 fallbacks) — *to move or reshape the neighborhood, edit that JSON and re-bake; no code changes anywhere.* `boundary.js` is the **single source of truth every consumer reads** and it does a lot: membership tests `pointInBoundary` / `faceInBoundary` / `streetInBoundary` (bake-time stencil-cull + runtime clip, ~17 call-sites), the radial-fade constants (`FADE_INNER/OUTER`, `STREET_FADE_INNER/OUTER` — face + street shaders), the bake bbox, the raw `boundaryPolygon` outline, and two polyline clippers — `clipPolylineToBoundary` (exact 256-gon) and `clipPolylineToRadius` (cheap exact-circle, used by `MapLayers` to stop debug centerlines at the *visible* feathered edge). The disc is the **Intake-stage** artifact (the protoslab container's geography + boundary; `PIPELINE §intake`, `SKELETON.md §1`). The aerial layer reads the same disc — `AerialTiles.jsx` covers it with a low-res base + an on-demand hi-res **focus** layer (attention-driven, tile-capped, orphaned-fetch-aborting). Banked future payoff: clip-at-bake retires the runtime stencil entirely (wall-move ledger).
- **Coordinate systems.** World-meters with origin at the neighborhood center, in **compass frame** — equirectangular GPS→meters projection, no rotation applied. One frame, every dataset. The earlier "de-parking" episode (May 2026) briefly introduced a parallel park-aligned world frame at -9.2°; that duality was misdiagnosed and reverted. The screen-orientation desire is camera-only, lives on `SHOTS.browse.up` (the Heading slider). See FEATURES.md §"Frame discipline" for the canonical statement and `project_compass_only_camera_heading` memory entry for history.
- **Visible geometry is permanent; derivation can change.** A geometric region defined by the world model — the rounded asphalt mouth at every IX, the wedge between a rounded curb arc and the straight ped-band edges that meet at a block's corner, the half-disc at a cul-de-sac — must always be filled in V2's output, regardless of which emitter computes it. What changes when an emitter is rewritten (e.g., chain-rectangle decomposition → block-edge ownership) is *how* a region is derived, not whether it exists. Designer + bake + Preview + Stage all consume the same V2 output, so any visible regression in Designer cascades to Preview. The honest test for "is this code cruft" is **not** "does the new architecture's mental model exclude it" but "does the visual region this code fills still need to be filled." If yes, keep it; if a future emitter produces the same region cleaner, *replace* the derivation, don't delete and hope. The concrete corner pad (`buildCornerPadQuad` / `cornerSidewalkPads`) and asphalt corner plug (`cornerAsphaltPlugs`) in `src/lib/buildBlockGeometryV2.js` are the canonical examples — see the ⚠ guards there and the `feedback_load_bearing_corner_pads` / `feedback_no_speculative_cruft_lists` memory entries. Distinct from this: pure derivation patches (per-chain rectangles' winding-cancellation gaps, race-condition workarounds, debounce shims) are tied to the emitter and DO go away when emitter assumptions change.
- **Scenes route through one pipeline.** A scene (toy, lafayette-square, future neighborhoods) is a different *dataset*, not a different code path. Same server endpoints (scene-parametric), same store loaders, same render components, same Survey/Measure tools. If you find yourself writing `if (scene === 'X')` branches, parallel emitters, or hybrid mounts, the architecture is wrong; revert and make the canonical pipeline scene-parametric instead. See `cartograph/TOY_AUTHORING_PLAN.md` (Phase 0) for the per-scene file layout (`src/data/<scene>/centerlines.json` + `overlay.json`) and the scene-parametric route shape (`/api/cartograph/:scene/...`). Memory entry: `feedback_no_parallel_pipeline_for_scenes`.
- **All Canvas mounts opt into `logarithmicDepthBuffer: true`.** Both Cartograph Stage and Preview pass this on the Canvas's `gl` prop. Reason: the scene spans ~2km horizontally with sub-meter Y separations (water 0.35m above ground, paths 0.4m). With linear 24-bit depth + near=1/far=60000, 90%+ of precision lives in the first few meters and high-altitude Browse renders sub-meter Y gaps as unresolvable — water sorts into ground, treelawn snaps off, etc. Logarithmic redistribution makes sub-meter separations robust at any reasonable distance. See `cartograph/FEATURES.md §"Layering / coplanar stacking / depth precision"` for the full canon of which-mechanism-when. Any future Canvas in the project should match. **Corollary (2026-05-18):** `polygonOffset` is structurally inert under this Canvas — the `<logdepthbuf_fragment>` chunk writes `gl_FragDepth` explicitly, which per the GL spec bypasses `GL_POLYGON_OFFSET_FILL`. Coplanar resolution among transparent meshes uses `renderOrder` ordering; among opaque, Y separation. Raw `ShaderMaterial`s must additionally include the four `<logdepthbuf_*>` chunks manually (built-in materials chain them automatically). Memories: `feedback_raw_shadermaterial_needs_logdepth_chunks`, `feedback_polygonoffset_inert_under_logdepth`.
- **Stage / production gating via prop presence (2026-05-18).** Components that gate behavior differently between Stage authoring (where a panel toggle should be a master switch) and shipped production (where authored data — hours, schedule, etc. — should be the sole arbiter) take the toggle as an *optional prop*. Prop passed = Stage path, toggle is master. Prop omitted = production path, authored data is the sole gate. The canonical case is `<LafayetteScene forceNeonOn={…}>` (Stage, neon visibility) vs. `<LafayetteScene>` (production, neon visibility gated only by `_isWithinHours`). The pattern beats OR-chains of independent gates (which produce additive-override confusion and break the panel-toggle-as-master expectation). Memory: `feedback_panel_is_source_of_truth_for_authored_channels`.
- **Night darkness lives in the sky layer, not in scattered floors — the "Sky Layer Gain" channel (2026-06-07).** Deep-night sky read too bright because "night brightness" was the emergent sum of ~4 independent hardwired floors (linear sky bands lifted by ACES+sRGB; a bloom night `dk` boost; the `<ambientLight 0.45>` ground floor; an additive horizon glow) — turning any one down left the others holding the floor up. The cure: ONE owner. `skyGain` (Sky & Light card) is a single gain applied **last** in the GradientSky fragment shader (`finalColor *= uSkyGain`), scaling the entire composed dome (bands + sun/moon glow + horizon scatter + haze). It is **exposure scoped to the sky layer**, the key distinction from global `exposure`: `exposure` dims the whole frame (buildings + ground + sky); `skyGain` dims *only* the dome, so deep night goes dark while lamps + lit windows stay where authored. Generalizes the planetarium `dimFactor` already in `CelestialBodies`. **Stars are a separate object (own `astronomyAlpha`) and are deliberately NOT scaled** — dimming the dome makes them read better. Default `1.0` = no-op (unauthored Looks unchanged); the canonical use is a TOD curve holding `1.0` by day and dipping to ~`0.2` at Night. **Paired hardwire removal:** the bloom night `dk` boost was deleted from both `PostProcessing.jsx` and `PreviewPostFx.jsx` (it overrode the authored bloom channel and, with a low authored threshold, drove the luminance threshold negative → whole-frame bloom). Bloom is now operator-authored only; lamp glow (independent geometry in `StreetLights.jsx`, not bloom) carries night legibility. This is "hardwires-come-out" applied to the night look — and night now drops its single most expensive post pass. Wired the standard channel way (`skyLightChannels.js` → store → `CartographSkyLight` slider → `CelestialBodies` consumer → `CartographApp` override → `bake-scene` → `scene.json`). See `NOTES.md` 2026-06-07.
- **Shared clock + calendar anchor.** `src/hooks/useTimeOfDay` (current minute-of-day) and `src/hooks/useCalendar` (current date, day-of-year, season) are kit-level singletons. ANY helper that needs time or season consumes these — never mints its own. Each helper hosts its own scrub UI (DawnTimeline for TOD, DateScrubber for date) over the shared state. `<ClockCalendarPump mode="live">` mounted in a production scene ticks both from wall time; authoring tabs leave the pump off and let scrub UIs drive. Drift-prevention rationale in `meteorologist/NOTES.md` 2026-05-20 ADR.
- **Grade separation is a frame fact, carried per street; junctions never hold it (Groma 2026-06-02).** OSM `layer`/`bridge`/`tunnel` mark elevated/buried roadway. The frame (`skeleton.js#gradeFields`) summarizes them over *all* of a welded chain's `chain.sources` and emits per street: raw `layer`/`bridge`/`tunnel` + an operative `gradeSeparated = entirelyOffGrade || isLimitedAccess(highway)`. These survive `derive.js`'s serializer whitelist into `ribbons.streets`. **Why:** the visible degenerate polygons (interchange triangles, slivers, false blocks) are grade-separated centerlines that cross in 2D **without a shared vertex** — the planar face walk (`tileGround.extractFaces`, shared-vertex-only graph) has no node there, so the crossing edge bowties the faces. The fix is the consumer excluding `gradeSeparated` streets from the face graph (`streets.filter(s => !s.gradeSeparated)`), **not** patching faces downstream (§Wall). **Invariant:** `skeleton.junctions` is shared-vertex-only, so grade-separated crossings (which share no vertex) are **never** false-typed as junctions — don't hunt grade bugs in `junctions[]`. **Tag-free truth:** OSM has 0 same-layer crossings lacking a shared node, so any no-shared-vertex 2D crossing *is* a grade separation. Decision: `gradeSeparated` folds in limited-access class (motorway/trunk + links) because those corridors abut frontage roads and never bound neighborhood blocks; partly-bridge *surface* streets (Mississippi, Nebraska) stay `gradeSeparated:false` and keep bounding blocks. See `HANDOFF-onframe-faces.md`.
- **Bake writes go through `cartograph/io.js`'s `writeIfChanged`.** Two contracts: skip the disk write when bytes are byte-identical (cheap), AND touch the output's mtime to "now" on every successful call. The second contract is canonical-`make` behavior — without it, editing a source script (`pipeline.js`, `bake-ground.js`, etc.) permanently invalidates its downstream artifact, because the no-op write never bumps mtime and `needsRebuild` reruns every step on every bake. Any new bake step must use `writeIfChanged` for its outputs. If the step ALSO patches another step's output (e.g., AO patches the ground manifest), patch first, output last — otherwise the patch ends up strictly newer than the step's own output and `needsRebuild` reruns the step every bake. See `cartograph/FEATURES.md §"Bake-chain dirty-skip"` for the verified behavior on LS (1ms no-op bakes). **⚠️ Exception — input artifacts (`{touch:false}`):** the mtime-bump (contract 2) is for *outputs* inside the dirty graph. An artifact that is only a needsRebuild **input**, produced *outside* serve's graph by a manual run (e.g. `skeleton.json` from `node skeleton.js`), must pass `writeIfChanged(…, {touch:false})` — otherwise every no-op run bumps its mtime, looks like new input, and forces a full downstream rebuild (the `skeleton.js` drift gremlin; `e3ec84a`, ledger C10).

---

## 8. What this enables

- **A new Look = a new `design.json` + `ground.svg`.** No code changes, no migrations.
- **A new helper (Arborist, Park Composer, etc.) = a new directory + a published artifact.** No coupling to existing helpers.
- **A new neighborhood (someday) = new geometry + a new default Look.** The helpers and runtime stay the same.

This is a kit, not a bespoke build. The pattern is the value.
