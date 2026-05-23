# Architecture

How Meteorologist fits into the kit and what it publishes. Read top to bottom; it builds.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `CANON.md` + `STAGE_MIGRATION.md` as topical addenda). Read at session start; flag contradictions during work; update at session end. Stale claims are worse than no claims — they actively mistrain readers.
>
> Sibling docs live in `../cartograph/` (the publish-loop pattern lives there) and `../arborist/` (the helper-app template Meteorologist borrows shape from).
>
> See [`INTERFACE.md`](./INTERFACE.md) for the operator-facing layout (Teapot/Conditions libraries, Teacup workstage, slot tabs, right-rail composition).

---

## 1. Place in the publish-loop pattern

Meteorologist is one of the kit's helper apps. Each helper authors a specific kind of content and publishes one or more canonical artifacts; the runtime composes them into the rendered scene. See [`../cartograph/ARCHITECTURE.md §1`](../cartograph/ARCHITECTURE.md) for the full pattern.

```
┌────────────────┐    publishes     ┌──────────────────────────────┐
│  Meteorologist │ ───────────────▶ │ public/clouds/presets.json   │ ──▶ Runtime
│                │ ───────────────▶ │ public/clouds/almanac.json   │
└────────────────┘                  └──────────────────────────────┘
```

**Meteorologist runs as a standalone app shell at `/meteorologist.html`** — same shape as Arborist and Cartograph. This reverses an earlier "in-Stage editor housing" decision (2026-05-19; full reversal context in `NOTES.md`). The reversal's rationale is in §2 below.

`INTERFACE.md` is the canonical reference for the operator-facing layout (top-bar mode toggle, Teapot/Conditions libraries, Teacup workstage shape, slot tabs, right-rail composition).

---

## 2. Consume-from-Stage pattern (the standalone-shell rationale)

The original "no app shell — live inside Stage" decision was driven by one concern: *the Teapot author needs clouds rendered against a real sun + real sky gradient + real post-FX, and reproducing that stack outside Stage would be duplication + parity-drift risk.* Valid concern; wrong solution.

The reversal: instead of *reproducing* Stage's rendering stack, Meteorologist **consumes** Stage's published artifacts at authoring time. The active Cartograph Look's `scene.json` (published by `cartograph/bake-scene.js`) carries the full sky envelope — `sky`, `dirSun`, `dirMoon`, `ambient`, `hemi`, `constellations`, `milkyWay` channels, with their per-TOD-slot keyframes. Meteorologist mounts the same `<CelestialBodies>` consumer Stage and Preview mount, fed by `useSceneJson(activeLookId)`. The sky is real, sourced from Cartograph; nothing is reproduced.

```
                      ┌─── Cartograph publishes ───┐
                      │ public/baked/<look>/        │
                      │   scene.json                │ ← sky + sun + lighting
                      │                             │   keyframes per TOD slot
Meteorologist         └─────────────┬───────────────┘
  authoring scene                   │
  composes:                         ▼
                      <CelestialBodies>  ──┐
                                           │
                      ┌─── Arborist publishes ─────┐
                      │ public/baked/<look>/trees/  │
                      │   <species-hero>.glb        │ ← one hero tree for scale
                      └─────────────┬───────────────┘
                                    │
                                    ▼
                      <InstancedTrees>  ──┐
                                          ├──▶ Meteorologist's canary viewport
                      ┌── Meteorologist ──┐
                      │   (own state)     │
                      │   active Teapot   │ ← what the operator is authoring
                      │   active Cond.    │
                      └─────────┬─────────┘
                                ▼
                          <Atmosphere>  ──┘
```

This dovetails with `feedback_preview_uses_production_pipeline` (which Preview already follows for trees + buildings + water): authoring tools that need to render against a real-world context should compose from the production pipeline's published artifacts, not maintain their own parallel rendering paths.

**Properties of the consume-from-Stage approach:**

- **Single rendering codepath for sky.** `<CelestialBodies>` is mounted identically in Stage, Preview, Production, and now Meteorologist. No fork; parity is structural per `project_stage_consumer_parity`.
- **Look picker is meaningful.** Switching Looks in Meteorologist's app-bar Look picker re-fetches that Look's `scene.json`; the sky changes instantly because we're swapping a fetched artifact, not switching authoring stores.
- **Authoring against multiple Looks comes free.** Operator can tune a cloud preset under `lafayette-square`'s sky envelope, then switch to `valentines`'s and verify it still reads. Same Teapot edit, two visual contexts.
- **The Almanac evaluator works the same against any sky.** `selectDirective(weather, almanac, presets, override)` is pure — it doesn't care which sky the result will render against. The sky just colors what it renders.

**Composed-not-reproduced extends to trees.** The Ground slot mounts one tree from Arborist's per-Look bake (`public/baked/<look>/trees/<species>.glb`), again via the existing `<InstancedTrees>` consumer. Arborist's substitution pipeline + LOD tiers + bark/leaf atlas all apply unchanged.

**Composed-not-reproduced extends to time + calendar.** The kit clock + calendar primitives (`useTimeOfDay` + `useCalendar`, shipped 2026-05-20) are shared singletons under `src/hooks/`, bidirectionally synced. CanaryScene's `<CelestialBodies>` reads `useTimeOfDay.currentTime` for `SunCalc(currentTime, lat, lon)` — so scrubbing the year-strip in Meteorologist's unified time card moves the sun position seasonally (winter lower, summer higher) without any consumer-side changes. Same anchor, multiple consumers; the kit primitive does the routing. Sky color responds to TOD but not yet year — 4-anchor seasonal sky matrix is queued; see `NOTES.md` 2026-05-20 ADR + `BACKLOG.md`.

**Decision-history pointer:** the in-Stage decision's full rejection-of-alternatives is captured in `NOTES.md`'s pre-reversal entries (kept for posterity). The 2026-05-19 reversal entry there explains why the consume-from-Stage realization invalidated the original rationale.

---

## 3. The two artifacts

| Artifact | Contents | Schema |
|---|---|---|
| `public/clouds/presets.json` | **The Teapot.** Cloud preset library — WMO species × visually-distinct variants + practical fog/haze + v1.x precipitation stubs. 52 entries scaffolded. | `pipeline/schema/presets-file.schema.json` + per-entry `preset.schema.json` |
| `public/clouds/almanac.json` | **The Almanac.** Rule table: weather payload → atmospheric directive. 16 starter rules + a fallback directive. | `pipeline/schema/almanac.schema.json` |
| `public/clouds/modulators.json` | **The Modulators** (Halo, Phase 6, 2026-05-20). Continuous, signal-driven directive deltas that compose on top of the Almanac's base. 7 starter records (cold-front passage, tornado green, wildfire smoke, pre-storm gold, about-to-rain, fog burn-off, summer heat haze). Sibling `modulators.defaults.json` preserves hand-authoring per `feedback_json_stringify_loses_handauthored_format`. | `pipeline/schema/modulator.schema.json` |
| `meteorologist/data/specialist-seed.json` | **The Seed.** Calibrated initial params + operator-facing descriptions per preset, authored by Cloud Specialist agent (Nimbus, 2026-05-20). Immutable canon; operator edits in `presets.json` override per preset. Applied via `pipeline/seed-presets.js`. | (no schema; flat 52-entry list) |

Two additional schemas describe wire formats, not stored files:

| Schema | What it describes |
|---|---|
| `weather-payload.schema.json` | The normalized weather payload the runtime feeds the Almanac evaluator each frame |
| `directive.schema.json` | The atmospheric directive the Almanac produces (cloud blend, sun tint, halo, light dome, wind) |

Neither artifact is "baked" the way Cartograph bakes `ground.bin`. Saves write directly through validation. There's no draft/published split, no bake button, no ceremony — these are live-edited contracts the runtime reads at startup.

**Cross-schema invariants** (preset-id uniqueness, almanac→preset reference integrity, cloud-weight ≤1.0) are not expressible in JSON Schema; `pipeline/validate.js` layers them on top via `validateLibrary()`.

---

## 4. Composition order at runtime

```
Look's TOD-slot envelope (Sky & Light)
  → Almanac modulation (weather payload → directive)
    → per-Look override (visual styling only)
      → render
```

Per-Look overrides apply to dome visual-styling values (sun tint, halo, light dome) — **never to cloud-math drivers**, never to non-dome channels (Mist/Ambient/Neon are authored per-Look directly in Sky & Light, no Almanac involvement).

**Authored value flow per channel:**

- **Cloud preset** (`{presetId}` per TOD slot) — authored in Stage's new Clouds TodChannel row → persisted in `design.json` under `clouds.values.<slot>.preset` → baked into `scene.clouds: {preset, overrides}` via `bake-scene.js` → consumed by the v3 `<Atmosphere />` runtime.
- **Sun tint / halo / light dome** — authored per Look, override-flavored — apply on top of the Almanac directive at render time.
- **Wind** — published per Look by Meteorologist (direction + speed uniforms). Trees subscribe via `InstancedTrees` shader uniforms; future precipitation + audio layers subscribe too.

As of 2026-05-20 the runtime renderer everywhere is `<Atmosphere />` (Phase 4b.3); the procedural `CloudDome.jsx` is retired.

---

## 5. Directory layout

```
meteorologist/                        # THIS DIR — backend + docs
  README.md                           # orientation card
  ARCHITECTURE.md                     # this file
  INTERFACE.md                        # operator-facing layout model
  SPEC.md                             # full work order
  BACKLOG.md                          # punchlist (spade work + v1/v2 roadmap)
  NOTES.md                            # historical decisions
  CANON.md                            # Teapot inclusion principles
  STAGE_MIGRATION.md                  # cleanup commit spec (executes when v3 lands)
  package.json                        # ajv dep, validate/bake/serve scripts
  pipeline/
    validate.js                       # ajv validators + cross-schema invariants
    schema/                           # 5 JSON schemas
  serve.js                            # NOT YET WRITTEN — backend service, port 3335
  state/                              # GITIGNORED — not used in v1 (no drafts)

public/clouds/                        # PUBLISHED ARTIFACTS — runtime contracts
  presets.json                        # the Teapot, 52 entries
  almanac.json                        # 16 conditions + fallback (user-facing: "Conditions")
  fixtures/                           # NOT YET POPULATED — fake-weather payloads

meteorologist.html                    # NOT YET WRITTEN — standalone app shell

src/meteorologist/                    # NOT YET WRITTEN — UI tree (mirrors src/arborist/)
  main.jsx                            # imports ../tokens/design.css; renders <MeteorologistApp />
  MeteorologistApp.jsx                # top bar, mode toggle, library router
  TeapotLibrary.jsx                   # flat preset list
  Teacup.jsx                          # per-cloud workstage
  ConditionsLibrary.jsx               # flat conditions list
  ConditionEditor.jsx                 # per-condition workstage
  SlotTabs.jsx                        # shared CLOUD CHAMBER | GROUND
  CanaryScene.jsx                     # the toy scene (ground + hero tree + sky)
  stores/
    useMeteorologistStore.js          # zustand

src/components/
  Atmosphere.jsx                      # NOT YET WRITTEN — v3 runtime component
  atmosphere-materials.js             # NOT YET WRITTEN — shader factory
  atmosphere-shaders/                 # NOT YET WRITTEN — frag/vert source
  Atmosphere.jsx                      # production renderer (post-4b.3)
  SpriteClouds.jsx                    # retires in cleanup commit
  CelestialBodies.jsx                 # IMPORTED — Meteorologist mounts this unchanged
  InstancedTrees.jsx                  # IMPORTED — Meteorologist mounts in Ground slot

src/cartograph/
  TodChannel.jsx                      # IMPORTED — Meteorologist's right-rail rows reuse this
src/components/
  DawnTimeline.jsx                    # IMPORTED — unified time card (TOD + Year + Playback)
src/tokens/
  design.css                          # IMPORTED — shared design tokens

src/lib/
  almanac-eval.js                     # v3 evaluator interface — shipped 2026-05-13
                                      # (no production consumer yet; forward-compat)
  weather-payload.js                  # NOT YET WRITTEN — normalizes useWeather output
                                      # against weather-payload.schema.json
```

This shape mirrors `../arborist/` and `../cartograph/` so a contributor (or agent) showing up cold can navigate by analogy.

---

## 6. Runtime contract

The runtime — Stage shots, Preview, the deployed app — consumes both artifacts read-only at startup:

```js
const presets    = await fetch('/clouds/presets.json').then(r => r.json())
const almanac    = await fetch('/clouds/almanac.json').then(r => r.json())
const modulators = await fetch('/clouds/modulators.json').then(r => r.json())
const signals    = deriveSignals(weatherPayload, currentTime, extras)
const directive  = selectDirective({
  weather: weatherPayload, almanac, presets, override,
  modulators: modulators.modulators, signals,
})
// directive → <Atmosphere /> uniforms
```

`src/lib/almanac-eval.js` exports `selectDirective({ weather, almanac, presets, override, modulators, signals })` — pure function: same inputs → same directive. Phase 5a (Cirrus, 2026-05-20) hot-mounted the base path via `src/hooks/useAtmosphereDirective.js` + `src/hooks/useAtmosphere.js` + `src/components/AtmosphereDirectiveDriver.jsx`. **Phase 6** (Halo, 2026-05-20) extended the evaluator with modulator composition: each authored modulator independently evaluates a 0..1 strength from `signals` and applies its bundle of deltas on top of the Almanac's base directive. Composition is multiplicative for scalar scales, sum-and-clamp for tint-toward amounts, last-wins for `{from,to}` color overrides. A sibling `selectDirectiveWithStrengths` also returns the per-modulator strength map, published to `useAtmosphere.activeStrengths` so the Modulators editor's live indicator can show what's firing right now. Directive flips lerp over 45s via weight-union cloud crossfade — modulator strength changes ride the same tween, no driver-side changes.

`src/lib/weather-signals.js` exports `deriveSignals(payload, currentTime, extras)` — produces the expanded signal payload modulators read against. Derived signals: `pressure_trend_3hr` (mb change over 3hr, walked off the hourly back-fill from open-meteo's `past_hours=4` + `pressure_msl` query), `direct_ratio` (direct/(direct+diffuse+ε); smoke + haze detection), `hour_of_day`, `minute_of_day`. Pass-throughs: all `weather-payload.schema.json` fields plus `weathercode` and `precipitation` aliases used by the ADR-style worked examples.

**Three production mount sites** for `<Atmosphere />` — `Scene.jsx` / `CartographApp.jsx` / `PreviewApp.jsx` — all identical, no fork. CanaryScene is the fourth mount (Meteorologist's authoring canary). Post-4b.3, no procedural fallback path exists.

**Atmosphere has two uniform-source paths** (both wired post-5a):

- **Authoring path** — `useMeteorologistStore.activePreset` (Phase 4b.2 binding). Used in Meteorologist sessions when an operator is tuning a preset.
- **Production path** — `useAtmosphere.tweenedDirective` → `bindUniformsFromDirective` does a weighted blend across the directive's `clouds[]`. Used everywhere else.

When a directive is active, its `sun.tint` + `lightDome.{horizon,ambientFloor}` override the sky-light coupling for cloud lighting; the sky channel still owns the dome.

---

## 7. Relationship to Cartograph Stage

Meteorologist consumes Stage's published artifacts (§2). The remaining integration surfaces in Stage itself are small:

| Stage surface | What Meteorologist adds |
|---|---|
| Sky & Light card | One new TodChannel row: **Clouds** (slot value = `{ presetId }`). Same primitive as Sky gradient / Mist / Halo. This is per-Look authoring — picks which Teapot preset that Look uses at each TOD slot. |
| Sky & Light card | A **"launch meteorologist →"** link — deep-link to `/meteorologist.html`. Open in new tab; the Look picker on arrival defaults to the Look the operator was just viewing. No scene swap, no right-panel takeover. |
| `bake-scene.js` | Reads `design.clouds` → emits `scene.clouds: {preset, overrides}`. Validates preset id against live `presets.json` (pre-bake hook — see BACKLOG item 3). |

**The slab carries the cloud preset.** Per `project_slab_carries_full_authored_product` — if Sky & Light's Clouds row authors anything, the slab must carry it. SC.6 wired this in May 2026; v3 `<Atmosphere />` will be the production consumer.

**Authoring direction is one-way.** Stage's Clouds row picks *which* preset to use (per-Look, per-TOD-slot). Editing the preset's intrinsic parameters happens only in Meteorologist's Teapot view. Conditions (the Almanac) are global, not per-Look; they're authored only in Meteorologist.

---

## 8. Relationship to v1 CloudDome (historical)

`src/components/CloudDome.jsx` WAS the noise-based procedural cloud shipper — the v1 production renderer through 2026-05-19. Retired 2026-05-20 in Phase 4b.3; `<Atmosphere />` is the production renderer now at all three mount sites (Scene.jsx / CartographApp.jsx / PreviewApp.jsx), with CanaryScene having used it since Phase 4b.1.

- The `CloudDome.jsx` + `SpriteClouds.jsx` files are deleted.
- `STAGE_MIGRATION.md` is now historical — see the header note in that file.

---

## 9. Wind contract (cross-helper)

Wind direction + speed live in the atmospheric directive Meteorologist publishes (Almanac + Phase 6 modulators). Phase 7a / Brief 9a (Sough, 2026-05-23) landed the cross-helper seam at `src/lib/wind-field.js` — ADR at `scratch/wind-contract-phase7a.md`.

**The seam.** Both helpers import `src/lib/wind-field.js`; neither helper imports the other (mirrors the canary contract discipline in `arborist/ARCHITECTURE.md`). Exports `windAt(t, pos, windState) → { force, intensity }` (pure, m/s) + `resolveWindState(directive)` + `defaultWindState()`.

**Three temporal scales composed inside `windAt`.** Drift (`baseDirection × baseSpeedMps`), gust envelope ([0,1] slow modulator-authored), gust spikes (smoothmax-shaped 1–2 s spikes phase-offset by `dot(pos, gustFrontVelocity)/|front|²` seconds — spatial advection makes fronts visibly travel across the scene).

**Directive fields (post-Brief 9b, see `pipeline/schema/directive.schema.json`):**
- `wind.scale` — legacy unitless multiplier. Post-Brief 9b, no live consumer reads it directly; `resolveWindState` only references it via the `baseSpeedMps = scale * 3` fallback for un-migrated look files lacking `wind.speed`. Safe to drop once those look files are migrated.
- `wind.dir` — bearing the wind blows TO (degrees). Note: the runtime treats it as FROM and flips internally; the schema-vs-code wording disagreement predates 9a.
- `wind.speed` — m/s, the m/s authority for `wind-field.js`.
- `wind.gustsScale` — m/s peak gust-spike amplitude. Modulators author it.
- `wind.gustEnvelope` — [0,1] slow modulator on spike amplitude.
- `wind.gustFrontVelocity` — `{x, z}` independent of base wind (default `baseDirection × 10 m/s`; modulators may override).

**Consumers.**
- **InstancedTrees + the shared `treeAtlasMaterial.js`** — drift + gust params flow into `treeSwayUniforms`; vertex shader synthesises per-tree spatially-advected spikes from `uGustFrontVelocity`. Multi-scale damping per runtime-merged `aWindTier` (trunk/branch/twig/leaf). Salon-preview parity preserved.
- **`<Atmosphere />`** — Brief 9b (Wisp, 2026-05-23) retargeted onto `windAt(clock.elapsedTime, camera.position, ws)`. `uWindScale = sample.intensity / 3.0` (the `/3` mirrors `resolveWindState`'s `baseSpeedMps = scale * 3` legacy heuristic so Phase 5a calm-weather cloud advection is byte-identical pre/post 9b). `uWindDir = normalize(sample.force)` — the FROM→TO flip lives inside `resolveWindState`, not at the consumer. Cloud advection now inherits gust spikes; far trees catch the spatial gust front later than the cloud canopy and the trees nearest the camera, in lockstep.
- **Future.** Rain particles (already wind-tilted; could subscribe), audio (gated on speed thresholds), heat-haze (low-wind gated).

Wind belongs to Meteorologist; consumers subscribe but don't author.

---

## 9.1. Atmospheric consumer layer (Phase 7b/c/d, Tempest 2026-05-20)

`<WeatherEffects />` mounts inside the production Canvas alongside `<AtmosphereDirectiveDriver />`. It reads `useAtmosphere.tweenedDirective` and dispatches:

- **Particle systems** — `RainParticles` (instanced billboard streaks) and `SnowParticles` (point sprites with curl-noise meander). Camera-following cylinder volume; one or the other renders based on `directive.precip.kind`.
- **Integrators** — `WetnessDriver` and `SnowAccumulationDriver` damp module-level scalar uniforms (`WEATHER_UNIFORMS.uWetness`, `uSnowAccumulation`) toward their target value. Always mounted (decay continues after rain/snow stops).
- **Lightning** — `LightningDriver` stochastically fires at `directive.lightning.rate` Hz, drives `uLightningFlash` through a 50ms attack / 200ms decay curve, multiplies the scene's primary `<ambientLight>` intensity, and (when `directive.lightning.kind === 'cloud_to_ground'`) renders a jagged vertical streak for the flash window.

**Singleton uniform pattern.** `src/lib/weather-uniforms.js` exports `WEATHER_UNIFORMS = { uWetness, uSnowAccumulation, uLightningFlash }` as THREE.IUniform-shaped objects. Drivers mutate `.value`; opt-in materials pass the same uniform by reference into their `shader.uniforms` map via `applyWeatherToShader(shader)`. No store subscription, no per-frame React tax — the materials see the next-frame value of the uniform automatically. The cloud shader (`atmosphere-materials.js`) also binds `uLightningFlash` by reference, so LightningDriver writes flow into the cloud lit-from-above pulse without any prop plumbing.

**Opt-in surfaces.** BakedGround FadeMesh (asphalt/sidewalks/LU fills, both fade + non-fade variants), BakedGround GrassMesh, LafayetteScene buildings (mobile + desktop branches). Skipped: water (already wet), GatewayArch (steel reads dry), vegetation (deferred with 7a). Full table in `FEATURES.md`.

**Doctrine.** Per `project_authoring_is_live_production_is_static` — modulators (and one day per-Look authoring) shape the directive's `precip.{kind, intensity}` and `lightning.{rate, kind, distance}`; the consumer layer composes the visible scene in real time. This commit ships the consumer; authoring of the lightning block (and any per-Look wet/snow tuning) belongs with Phase 3b / future Cartograph extension.

---

## 10. Conventions worth knowing

- **Schemas are versioned by `$id` filename.** `preset.schema.json` is registered both by `$id` and by filename so `$ref`s resolve regardless of authoring style.
- **The validator is strict.** `Ajv({ strict: true })` — unknown keywords throw. Schema authors must extend deliberately, not accidentally.
- **Cross-schema checks live in `validateLibrary()`.** Preset-id uniqueness, almanac→preset reference integrity (including disabled presets), cloud-blend weight ≤1.0. Run via `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json`.
- **The canary is `CanaryScene.jsx`.** A purpose-built sky-dominant scene (flat ground + one hero tree + imported Look sky) mounted inside the standalone Meteorologist shell. "Works in canary" advances to LS at Browse/Hero/Street for the visibility-at-scale check (memory `feedback_toy_not_proving_ground_for_ls_visibility`). The legacy 4-way-corner toy in `src/toy/` remains as the developer's shader-R&D entrance, separate door.
- **No draft/published split.** Saves write directly through validation. The decision is captured in `NOTES.md`.

---

## 11. Cross-references

- [`./README.md`](./README.md) — orientation, current status
- [`./INTERFACE.md`](./INTERFACE.md) — operator-facing layout model (Teapot/Conditions/Teacup, slot tabs, right-rail composition)
- [`./SPEC.md`](./SPEC.md) — full work order (Teapot + Almanac decisions, acceptance criteria, build order)
- [`./BACKLOG.md`](./BACKLOG.md) — spade work inventory + roadmap
- [`./NOTES.md`](./NOTES.md) — historical decisions (SC.6, strip-vs-wire, 2026-05-19 standalone-shell reversal)
- [`./CANON.md`](./CANON.md) — what's in the Teapot today, what's not, why
- [`./STAGE_MIGRATION.md`](./STAGE_MIGRATION.md) — the cleanup commit that retires CloudDome
- [`../cartograph/ARCHITECTURE.md`](../cartograph/ARCHITECTURE.md) — kit-wide publish-loop pattern
- [`../arborist/ARCHITECTURE.md`](../arborist/ARCHITECTURE.md) — sibling helper Meteorologist borrows shape from
- `src/cartograph/TodChannel.jsx` + `src/components/DawnTimeline.jsx` + `src/tokens/design.css` — imported by Meteorologist, not forked
- `src/lib/almanac-eval.js` — runtime evaluator, shipped 2026-05-13
- `~/.claude/.../memory/MEMORY.md` — running session memory
