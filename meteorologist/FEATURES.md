# Meteorologist Features

> Part of the **meteorologist doc suite** (`README` · `FEATURES` · `OPERATIONS` · `ARCHITECTURE` · `INTERFACE` · `WEATHER-MODEL` · `SPEC` · `CANON` · `STATUS` · `BACKLOG` · `NOTES`). This doc is the product-facing surface — *what the Meteorologist is, why it's special,* and what an operator can do today, organized by what's shippable now vs. queued. Mirrors `../cartograph/FEATURES.md` and `../arborist/FEATURES.md` in shape and intent. Read at session start; flag mid-session contradictions explicitly; update at session end. Stale claims actively mistrain readers.

---

## The idea — the neighborhood breathes with the real weather

Lafayette Square's sky is not a backdrop. It's the **actual sky over the actual place** — the installation reads a live weather feed for the real neighborhood and renders what's happening overhead *right now*: the overcast that rolled in this afternoon, golden hour at the true sunset minute, the season's first snow as it falls. The Meteorologist is the studio that makes that possible — and, just as importantly, the **emulator** that lets you author and preview it on the same stage the installation runs on.

**Author once, on the stage that ships.** Rehearsal and performance happen in the same place. The Meteorologist composes the *real* installation elements — the actual sky, sun, clouds, the hero tree, the weather effects — driven by the *real* runtime stores. What you tune in the studio is, to the pixel, what the slab plays; there's no separate "preview look" that can drift from production. (The formal statement is the staging-area doctrine; see `ARCHITECTURE.md §2`.)

**Continuous, not a slideshow.** Weather isn't a dozen fixed pictures. Every kind of weather — a **Condition** (clear, overcast, rain, thunderstorm…) — is authored as a *continuous look across its **Degrees*** (how much cloud, how hard the rain, how strong the wind, how bright the light). A drizzle and a downpour are the same Condition at different Degrees, and everything between is real and interpolated. The studio is a live scrubber over (Condition × Degrees); the slab is the same function fed by the live feed.

**It moves at the right speed.** The installation tracks the live weather at its true cadence — refreshing as the feed does, tweening smoothly so nothing snaps — while the fast, living detail (the sun climbing, gusts travelling through the canopy, clouds drifting) animates every frame. The result is a neighborhood that feels *weathered*: it dims under a building storm, warms at golden hour, glistens after rain — all on Lafayette Square's own clock.

> **The model in one line:** the live service reports the **Conditions** (a **Condition** × its **Degrees**) → the Meteorologist authors + previews each Condition's look, live → the slab plays the real Conditions, faithfully and continuously. Full nomenclature + model: [`WEATHER-MODEL.md`](./WEATHER-MODEL.md).

---

## What the helper produces

Two canonical JSON artifacts at `public/clouds/`:

- **`presets.json`** — *the Teapot.* The cloud preset library. 52 entries today: 38 cloud morphologies (10 WMO genera × visually-distinct species), 4 fog/haze, 1 `clear_sky` marker, 9 v1.x precipitation stubs (rain/snow/lightning, currently `enabled: false`). Each entry's 13 numeric shader params are stored in TodChannel shape (`{ values: { value: number } }` for flat; `{ animated: 'tod', values: { <slotId>: { value: number }, ... } }` for keyframed), so any parameter can be authored per-TOD-slot.
- **`almanac.json`** — *the Almanac* (user-facing name: **Conditions**). The rule table mapping weather-payload inputs to atmospheric directives. 16 starter rules + fallback. Each rule has `when` predicates (range constraints on `tempC`, `cloudCover`, `windKph`, etc.), `softness` (boundary smoothing), `transitionMs` (lerp duration into this rule's directive), and a `directive` block (cloud blend + sun + lightDome + wind + precip).

A third immutable file ships alongside:
- **`almanac.defaults.json`** — byte-identical copy of the as-shipped almanac, used by per-condition Revert. Operator-editable changes go to `almanac.json`; defaults file preserves hand-authored format forever.

Both editable artifacts are validated by `pipeline/validate.js` on every PUT; bad schemas return 400 with details. Cross-schema invariants (preset-id uniqueness, almanac → preset reference integrity, cloud-blend weight ≤ 1.0) enforced in `validateLibrary()`.

The runtime consumes both artifacts at startup. `src/lib/almanac-eval.js` is the published evaluator — pure function `selectDirective(weather, almanac, presets, override)` shipped 2026-05-13 (SC.6), forward-compatible for `<Atmosphere />`.

---

## App shell

Meteorologist runs at **`/meteorologist.html`** as a standalone app, mirroring Arborist's shape. Top bar:

```
METEOROLOGIST    [ TEAPOT | CONDITIONS ]    [Look ▾]
```

Three elements:

- **App name** on the left, plain uppercase typography.
- **Mode toggle** in the center — two co-equal libraries (Teapot and Conditions); not nested.
- **Look picker** on the right — selects which Cartograph Look's published `scene.json` is consumed as the sky backdrop in CanaryScene. Mirrors Arborist's LookPicker exactly.

No save action anywhere — autosave-on-edit throughout, same model as Stage's TodChannel primitive. Schema validation runs on every PUT; the operator never sees a save button.

Deep-link entry from Cartograph Stage's Sky & Light card via a "launch meteorologist →" link (per `STAGE_MIGRATION.md`; the deep-link itself lands when Stage's Clouds TodChannel row is wired).

---

## Two libraries

### Teapot (cloud preset library, 52 entries)

Flat row list. Each row carries the preset's `label` (operator-facing name) + `wmo` (genus tag like "Cu hum", "Cb cap", "Ci fib"). Click a row → opens that cloud's **Teacup** (the per-cloud workstage).

The Teapot is global — every cloud is part of the library always. No per-Look roster curation (clouds aren't trees; the runtime picks via the Almanac's directive, not a curated list).

### Conditions (weather situations, 16 entries)

Flat row list. Each row carries the rule's `label` (or `id` if no label). Click a row → opens the **Condition editor**.

Internally still named "Almanac" in the schema + file (`almanac.json`); the operator-facing word is "Conditions" throughout the UI. Same data, two viewpoints.

---

## Per-cloud workstage (Teacup)

Click a Teapot row → header reads `← TEAPOT  METEOROLOGIST  cloud authoring  CLOUD [<label> ▾]`. The CLOUD pulldown is **filtered by kind** (cloud↔cloud, fog↔fog): switching from `cumulus_humilis` to `fog_ground` requires going back to the library, since fog has different intrinsic params than cloud.

Below the header, two slot tabs: **CLOUD CHAMBER** | **GROUND**. Both render the same `<CanaryScene />` viewport in the main area; only camera framing differs (CLOUD CHAMBER = cloud-centric close framing, no ground; GROUND = eye-level, hero tree visible, sky fills upper viewport).

Right rail, top to bottom:

- **Time card** (top, persistent across all workstages). The unified `<DawnTimeline>` time card (`src/components/DawnTimeline.jsx`) — three rows:
  - **Time of Day strip** — 7 named TOD waypoints (dawn / sunrise / noon / golden / sunset / dusk / night), draggable thumb, click waypoint to jump.
  - **Time of Year strip** — 4 season-name anchors at solstices + equinoxes (Spring / Summer / Autumn / Winter), draggable thumb, click anchor to jump, season-band background tinting the track.
  - **Playback row** — Play/pause, speed selector (1× / 60× / 600× / 3600×), TOD-only vs TOD+Year scope toggle, Return-to-Live button.

  Reads/writes `useTimeOfDay` + `useCalendar` global stores (bidirectionally synced — scrubbing either dimension updates both). Scrubbing the year-strip moves the sun position via SunCalc (seasonal sun motion — winter sun lower, summer sun higher). Phase 4b.2+ also animates the cloud's TodChannel-bound params per TOD scrub. Sky color responds to TOD but NOT yet to year (4-anchor seasonal sky matrix is queued; see `BACKLOG.md`).
- **Cloud parameters card** — one `<TodChannel>` row per param, grouped by Shape (coverage, density, thickness, baseAlt, warpFreq, warpAmp, noiseSeed, octaves), Lighting (sunScatter, ambientFloor, edgeSilver, shadowStrength), and Motion (drift). 13 params total. Each TodChannel can be flat (one value) or animated (per-TOD-slot keyframes). Editability gating: parked-on-attached-slot = editable; off-slot = read-only at the interpolated value.

Autosave-on-edit. Drag a slider → `PUT /api/meteorologist/presets/<id>` fires ~500ms after the operator stops dragging. Animate-arm toggle promotes a flat param to keyframed; chip-strip below each slider attaches/detaches slot keyframes; per-channel Revert restores ship defaults (when Phase 3b lands; not present today for cloud params).

---

## Per-condition workstage (Condition editor)

Click a Conditions row → header reads `← CONDITIONS  METEOROLOGIST  weather authoring  CONDITION [<label> ▾]`. The CONDITION pulldown lists all 16 conditions; switching mid-edit flushes pending autosaves first.

Below: same CLOUD CHAMBER | GROUND slot tabs (different camera, same `<CanaryScene />`).

Right rail:

- **Time of Day card** (top, same as Teacup).
- **When card** — range sliders per `when`-block field (tempC, cloudCover, humidity, windKph, windDirDeg, precipMmHr, stormDistanceKm, sunElevationDeg, sunAzimuthDeg) + chip multi-select for `tod`, `season`, `precipKind`. Plus `softness` slider and `transitionMs` number input. Each field has an **engagement toggle** (per `feedback_absence_means_inherit_in_authored_blocks`): an unengaged field stays absent in the saved JSON, so this condition inherits that input from the wildcard / parent. Disengaging the last child of `when.tod` (etc.) removes the parent key entirely.
- **Directive card** — flat inputs for the condition's atmospheric output: `sun.intensity / sun.tint / sun.azimuth / sun.elevation`, `lightDome.{top, horizon, ambientFloor}`, `wind.{scale, dir}`, `precip.{kind, intensity}`. Sliders for numerics, color inputs for hex, dropdown for `precip.kind`. Engagement toggles per field. **Phase 3b** will promote the numeric fields to TodChannels so they vary across TOD; colors stay flat in v1.
- **Clouds in this condition** — list of the rule's `directive.clouds[]` entries. Each entry is a row with a preset pulldown (filtered to `kind: cloud | fog`) + a weight slider (`0 ≤ weight ≤ 1`). Max 3 entries (schema `maxItems: 3`); `+ Add cloud` button hidden at 3. Orphan preset ids (referencing a removed/disabled preset) render in red, not silently coerced — operator sees what's broken.
- **Revert to ship defaults** — bottom button, per-condition. Reads from `almanac.defaults.json` and restores this condition's values without touching the other 15. Confirmation dialog before write.

Same autosave model. `PUT /api/meteorologist/almanac/<id>` on a ~500ms idle debounce; `POST /api/meteorologist/almanac/<id>/revert` for the Revert action.

---

## CanaryScene viewport

The viewport in both workstages mounts `src/meteorologist/CanaryScene.jsx`. Composes:

- **Sky / sun / moon / celestials** via the shared `<CelestialBodies />` consumer reading `useSceneJson(activeLookId)`. Same consumer Stage and Preview mount; no fork. The active Look's published `scene.json` provides per-TOD-slot keyframes for sky gradient, sun direction, moon, ambient, hemi, constellations.
- **Flat ground plane** (GROUND slot only) — 200m × 200m mesh, neutral grey-tan, high roughness. No `BakedGround` import; this is the canary, not the production scene.
- **One hero tree** (GROUND slot only) — `platanus_acerifolia/skeleton-1-lod0.glb` loaded directly via `useGLTF` from Arborist's per-Look bake (`public/baked/<look>/trees/`), and rendered through the **shared production atlas material** (`useTreeAtlas`): lit by the scene sun, bark/leaf-textured, and swaying via the shared foliage-sway shader driven by the directive (2026-06-08; replaced the earlier raw-GLB placeholder that rendered unlit). The tree sits still and the weather animates around it — leaves sway, no whole-tree translation. Wrapped in `<Suspense fallback={null}>` so a missing bake falls back gracefully. It's intentionally a high-LOD asset we wouldn't ship in a populated LS scene — there's exactly one in the canary, so the GPU budget allows it.
- **`<Atmosphere />` cloud renderer** — Phase 4b.1's volumetric raymarched shader. BoxGeometry slab at cloud altitude (y ∈ [1200, 1700] for cumulus_humilis defaults), 8km × 8km × 500m, BackSide-rendered. Post-Phase 4b.2 + 5a, uniforms read from one of two sources per frame: the active Meteorologist preset (when authoring) or the resolved live directive (in production). Sky/sun coloring routes through `useSceneJson` (per Look) + the sky-light coupling amendment + directive overrides where applicable.

Two camera framings driven by the slot tab:

| Slot | Position | Target | FOV | Ground |
|---|---|---|---|---|
| `chamber` | `[0, 200, 300]` | `[0, 600, 0]` | 35° | hidden |
| `ground`  | `[-8, 1.7, 6]` | `[0, 8, 0]`   | 50° | shown |

No camera controls in v1 — orbiting is Phase 5+ polish.

Canvas opts into `logarithmicDepthBuffer: true` per kit convention. Raw `ShaderMaterial` (Atmosphere's) includes the four `<logdepthbuf_*>` chunks manually per memory `feedback_raw_shadermaterial_needs_logdepth_chunks`.

---

## What `<Atmosphere />` renders today

> ⚠️ **Where `<Atmosphere />` actually mounts:** in **CanaryScene** (the authoring viewport) always, and in the three production surfaces only under `?sky=volumetric`. Production defaults to the cheap `<CloudDome />` via the `skyMode` stopgap (volumetric per-genus work is TABLED). So "renders today" = renders in authoring + under the flag. See `ARCHITECTURE.md §4/§8` + `STATUS.md`.

Five photoreal levers (live home: `src/components/atmosphere-materials.js` + this section; the old `HANDOFF-clouds-day3-clouddome-v2.md` was deleted 2026-05-20), all five shipped in Phase 4b.1:

1. **Three-tier lighting** — every visible cloud point reads as one of sun-side cap (warm-bright), body (neutral mid-gray), or shadow-side / underside (cool-dark, picks up sky color). Driven by `dot(cloudNormal, sunDir)` lerping between three colors. Without this, clouds read as flat noise blobs.
2. **Silver lining** — Mie forward-scatter at thin sun-facing edges. `smoothstep(0.7, 1.0, dot(viewDir, sunDir)) × (1 - density) × edgeSilver × sunScatter`. Visible when the camera looks toward the sun through a cloud edge.
3. **Self-shadowing** — 6-step shadow march toward the sun from each raymarch sample; `exp(-shadowDensity × shadowStrength)` falloff multiplies lit color. Thick cloud cores read darker than thin peripheries.
4. **Domain warping** — two-pass 3D FBM with `worldPos + warpAmp × noise(worldPos × warpFreq)` reshaping the sample point before octave summing. Produces the cauliflower / lobe structure that makes cumulus look like cumulus, not blob-noise.
5. **Vertical density gradient** — `smoothstep(0, 0.1, h) × (1 - smoothstep(0.6, 1.0, h))` profile. Floor near `h ≈ 0` makes the cloud "sit on" a flat layer; ceiling near `h ≈ 1` tapers the top. Distinguishes flat-based cumulus from a vertically-uniform stratus slab.

As of 2026-05-20 (Phase 5a + 4b.3), uniforms read live: the 12 shape + lighting params come from either Meteorologist's active preset (authoring path) or `bindUniformsFromDirective(material, directive, ...)` doing a weighted blend across the Almanac directive's `clouds[]` (production path). Sun direction comes from `SunCalc.getPosition(currentTime, INSTANCE.lat, INSTANCE.lon)`; sky/sun colors come from the per-Look `scene.sky` channel (sky-light coupling amendment) with directive's `sun.tint` + `lightDome.{horizon,ambientFloor}` overriding cloud-lighting when a directive is active. Hardcoded fallbacks remain in `createAtmosphereMaterial` but are never reached when an `AtmosphereDirectiveDriver` is mounted.

---

## API endpoints (`meteorologist/serve.js`, port 3335)

> **SSOT for the endpoint contract.** SPEC's backend table is an older work-order sketch and diverges; this table is the closest-to-current one. Verify against `serve.js` if in doubt.

Mounted under `/api/meteorologist` via Vite proxy.

| Method | Path | Action |
|---|---|---|
| `GET`  | `/presets` | Read + return `public/clouds/presets.json` |
| `GET`  | `/presets/:id` | Read + return one preset's full object |
| `PUT`  | `/presets/:id` | Validate body against `preset.schema.json`; replace matching entry; write |
| `GET`  | `/almanac` | Read + return `public/clouds/almanac.json` |
| `GET`  | `/almanac/:id` | Read + return one rule's full object |
| `PUT`  | `/almanac/:id` | Validate body against rule sub-schema; replace `rules[idx]`; cross-check via `validateLibrary`; write |
| `POST` | `/almanac/:id/revert` | Read `almanac.defaults.json`; replace matching rule in live `almanac.json`; write |

Bad PUT (schema invalid, id mismatch, orphan preset ref, cap exceeded) → 400 with ajv details. Missing id → 404. Read errors → 500.

No `/bake` endpoint. Saves are direct.

---

## CLI

| Command | What it does |
|---|---|
| `node meteorologist/serve.js` | Start the backend on port 3335 (called by `npm run dev`'s `dev:meteorologist`) |
| `npm run validate -- public/clouds/presets.json public/clouds/almanac.json` | Validate schemas + cross-schema invariants. Expected: `ok: 52 presets, 16 rules`. |
| `node meteorologist/pipeline/migrate-params-to-channels.js public/clouds/presets.json` | One-shot migration from Phase 2 (numeric → TodChannel shape). Kept in the repo as a precedent for future migrations. |

---

## Vocabulary

**Single owner: `INTERFACE.md §2`** (Teapot / Teacup / Conditions / Condition editor / Cloud Chamber / Ground → schema names + files). Schemas and file names keep their internal names to avoid churn; the UI uses the operator-facing vocabulary throughout. *(The duplicate table that lived here was removed 2026-06-30 — see INTERFACE §2.)*

---

## What's NOT in v1 (and where each lands)

| Feature | Status | Phase |
|---|---|---|
| Cloud shader binds to active preset (sliders affect viewport) | ✅ Shipped 2026-05-21 | 4b.2 |
| CloudDome retirement; production swap to `<Atmosphere />` | ✅ Shipped 2026-05-20 | 4b.3 |
| Multi-preset weighted blending (per `directive.clouds[]`) | ✅ Shipped 2026-05-20 | 5a |
| Almanac evaluator hot-mount in production runtime + tween | ✅ Shipped 2026-05-20 | 5a |
| Wind cross-helper wiring (Atmosphere + InstancedTrees subscribe) | ✅ Shipped 2026-05-20 | 5a |
| Reference photos + Nimbus seeded library + editable descriptions | ✅ Shipped 2026-05-20 | Phase Seed |
| Driver mount in Cartograph/Preview | Queued | **5b.1** |
| Fake-weather fixtures (`public/clouds/fixtures/*.json`) + serve.js endpoints | Queued | **5b.2** |
| **Preview Studio** — Look + Fixture + TOD picker → full-pipeline live render with modulator strength + matched-rule readouts | Queued (elevated 2026-05-21; see `NOTES.md` ADR) | **5b.3** |
| Fallback editor (catch-all directive when no rule matches) | Queued | 5b.4 |
| Directive numeric fields as TodChannels (sky modulations animate per-TOD) | Queued | **3b** |
| Per-cloud-in-condition expression flags (rain rate, lightning rate per cloud entry) | Queued | 3b |
| Cloud capabilities (`precipKinds`, `electrified`) on preset.schema | Queued | 3b |
| Modulators — continuous atmospheric phenomena (cold front, tornado green, wildfire smoke, …) | ✅ Shipped 2026-05-20 (Halo) — 7 starter modulators | 6 |
| Atmospheric consumers — rain particles + wet-surface, snow particles + accumulation, lightning scene-flash + cloud pulse | ✅ Shipped 2026-05-20 (Tempest) | 7b/c/d |
| Atmospheric consumers — wind field + multi-scale tree response | Deferred until production trees mount (cross-helper) | **7a** |
| Audiologist helper — rain audio, snow muffle, thunder delay | Queued (post-Phase-7 v1.x) | future helper |
| Camera orbit controls in viewport | Queued | 5b+ |
| Mobile quality tier (`uQualityTier`-driven step counts) | Queued | 5b+ |
| Per-Look primary tree species (cross-helper setup with Arborist) | Parked | TBD |

See `BACKLOG.md` for the phase queue with scope summaries.

---

## How the runtime consumes Meteorologist's output

As of 2026-05-20 (Phase 6 — Modulators; building on 5a + 4b.3), every production `<Atmosphere />` mount is fed by the live directive composition path with a continuous-phenomena modulator stack on top. Each frame the shader reads:

1. **Live directive** — `useAtmosphere.tweenedDirective`, computed by `useAtmosphereDirective` in two stages:
   1. The Almanac evaluator selects a base directive: `selectBaseDirective(weatherPayload, almanac, presets, override)`.
   2. The Modulators stack composes on top: each authored modulator independently evaluates a 0..1 strength against `deriveSignals(payload, currentTime, extras)` (pressure_trend_3hr, direct_ratio, hour_of_day, plus payload pass-throughs); any non-zero strength applies its bundle of deltas (color hex lerp, scalar scale, tint-toward, direct range) to the directive. Composition is multiplicative for scales, sum-and-clamp for tints, last-wins for color overrides. Per-modulator strengths are published to `useAtmosphere.activeStrengths` for the editor's live indicator.
   3. Result tweens over 45s via `AtmosphereDirectiveDriver` — modulator strength changes ride the same tween for free. Override is sourced from the active Look's `scene.clouds.values.preset` per SC.6 wiring.
2. **Per-cloud preset params** — `bindUniformsFromDirective` reads each cloud in the directive's `clouds[]`, resolves each preset's 12 channel-shaped params via `resolveGroupAtMinute`, computes a weighted blend by `weight`, writes to shader uniforms.
3. **Sky / sun band coloring** — `useSceneJson(activeLookId).sky` channel resolved per minute → `sky.sunGlow` and `sky.low` feed `uSunColor` and `uSkyColor` (sky-light coupling amendment). When a directive is active, its `sun.tint` + `lightDome.{horizon,ambientFloor}` override cloud-lighting (sky channel still owns the dome itself).
4. **Sun direction** — `SunCalc.getPosition(currentTime, INSTANCE.lat, INSTANCE.lon)` projected to world space.
5. **Wind** — `directive.wind.{speed, dir}` feeds Atmosphere's `uWindScale` + `uWindDir` for cloud advection; same source feeds `InstancedTrees`' sway shader uniforms once trees are mounted in production.

All composition happens in the runtime, not in Meteorologist. Meteorologist authors; runtime composes.

### Phase 7b/c/d consumers (Tempest, 2026-05-20)

Beyond Atmosphere's cloud shader, the directive now drives a second consumer family — visible weather effects on the scene. `<WeatherEffects />` (mounted in `Scene.jsx`) subscribes to `useAtmosphere.tweenedDirective` and dispatches:

1. **Rain particles** (`src/components/weather/RainParticles.jsx`) — instanced billboarded streak quads in a 180m camera-following cylinder. ~6000-instance pool, intensity-gated active fraction (30%–100%), wind-tilted fall, per-particle ±30% speed variance. Active when `precip.kind === 'rain' | 'hail' | 'sleet'`. Hail kind doubles particle width + blues the tint.
2. **Snow particles** (`src/components/weather/SnowParticles.jsx`) — point sprites with curl-noise lateral meander; wind dominates trajectory (0.7 windDir vs 0.3 fall). ~4000-instance pool.
3. **`uWetness` integrator** — `WetnessDriver` damps `WEATHER_UNIFORMS.uWetness` toward `precip.intensity` at ~50s rise / 100s decay. Opt-in materials darken albedo (`*0.55`) on top-facing normals + boost specular (`roughness → 0.18`).
4. **`uSnowAccumulation` integrator** — `SnowAccumulationDriver` damps toward `min(1, intensity * 1.5)` at ~3 min rise / 10 min decay. Opt-in materials mix toward `vec3(0.95, 0.97, 1.00)` on top-facing normals. Snow wins over wet when both nonzero (multiplied mask).
5. **`uLightningFlash` curve** — `LightningDriver` stochastically fires (`Math.random() < rate * dt`) at the rate set by `directive.lightning.rate`, then drives the uniform through a 50ms attack / 200ms decay curve. While a flash is active:
   - The scene's primary `<ambientLight>` intensity multiplies by `1 + 4 * flash` (Path A in the brief — coarse but cheap; flash duration is short enough that coarse reads correctly).
   - Atmosphere's cloud shader adds a blue-white "lit-from-above" term proportional to `flash * accumulatedAlpha`.
   - Opt-in materials add a uniform `vec3(0.40, 0.42, 0.55) * flash` brightening term.
   - When `directive.lightning.kind === 'cloud_to_ground'`, a 12-segment jagged vertical line renders from 1200m cloud-base down to ground at a random visible XZ position.

**Opt-in materials.** Wet + snow modulation is patched onto materials whose surface reads as "wettable / accumulating" in real life:

| Material file | Branch | Wet | Snow | Why |
|---|---|---|---|---|
| `BakedGround.jsx` FadeMesh (fade variants — asphalt, sidewalk, concrete LU fills) | applyWeatherToShader inside existing onBeforeCompile | ✓ | ✓ | Streets / sidewalks visibly darken under rain; whiten under snow |
| `BakedGround.jsx` FadeMesh (non-fade variants) | new onBeforeCompile, fresh cache key | ✓ | ✓ | Same reason |
| `BakedGround.jsx` GrassMesh via `grassMaterial.js` | applyWeatherToShader before grass injection | (~) | ✓ | Wet contributes little (grass doesn't darken visibly); snow heavily whitens |
| `LafayetteScene.jsx` building material (mobile / no-texture branch) | applyWeatherToShader inside existing onBeforeCompile | ✓ | ✓ | Roofs accumulate snow heavily (top-facing); walls darken under rain |
| `LafayetteScene.jsx` building material (desktop / textured branch) | applyWeatherToShader inside existing onBeforeCompile | ✓ | ✓ | Same |
| `LafayettePark.jsx` water (fountain pond) | not patched | — | — | Already wet; would double-account |
| `LafayettePark.jsx` gravel path + park grass | not patched (gravel) / via grassMaterial (park grass) | — | (✓) | Gravel skipped to keep scope tight; park grass picks up snow whitening through the shared grass material |
| `GatewayArch.jsx` | not patched | — | — | Stainless steel — wet barely visible; snow on a curved sloped surface is a v1.x detail |
| Vegetation (`InstancedTrees`) | not patched | — | — | Tree atlas leaves don't yet have shared world-normal varying; deferred with Phase 7a tree work |

**Hail.** Rendered as rain-shape (RainParticles with `kind='hail'`) with doubled particle width + blue-grey tint. Drives the wet integrator like rain; no accumulation (hail bounces).

**Lightning flash sub-uniforms.** Inside opt-in materials, the flash term is applied uniformly (not gated by top-facing) so vertical walls also brighten — physically correct: lightning illuminates a hemisphere, not just the sky-facing surfaces.

---

## Cross-references

- [`README.md`](./README.md) — orientation + status table + start-here-in-morning
- [`INTERFACE.md`](./INTERFACE.md) — layout model in depth (right-rail composition, slot tabs, autosave model)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — publish-loop placement, consume-from-Stage pattern, directory layout
- [`SPEC.md`](./SPEC.md) — full work order, locked decisions, acceptance criteria
- [`BACKLOG.md`](./BACKLOG.md) — phase queue + spade work
- [`NOTES.md`](./NOTES.md) — historical decisions + EOD records
- [`CANON.md`](./CANON.md) — Teapot inclusion principles (WMO sourcing)
- [`STAGE_MIGRATION.md`](./STAGE_MIGRATION.md) — cleanup commit spec for Phase 4b.3
- [`../cartograph/FEATURES.md`](../cartograph/FEATURES.md) — kit-level features (Designer / Stage / Preview)
- [`../arborist/FEATURES.md`](../arborist/FEATURES.md) — sibling helper Meteorologist borrows shape from
- Five photoreal levers reference — live home is `src/components/atmosphere-materials.js` + this doc's "What `<Atmosphere />` renders today" section. *(The old `HANDOFF-clouds-day3-clouddome-v2.md` was deleted 2026-05-20.)*
