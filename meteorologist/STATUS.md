# Meteorologist — Status

The live wiring matrix: what is **wired** (drives pixels end-to-end), **scaffolded** (built but not connected), or a **gap** (designed/known, not built). The counterpart to `BACKLOG.md` (what's next) and `NOTES.md` (how we got here) — this answers "is feature X actually hooked up *right now*?"

> Reference/State doc, overwritten as wiring changes. Status as of **2026-06-08**. Mirrors `../ls/STATUS.md`'s section×state index. When a row flips, update it here in the same session — a stale STATUS mistrains worse than no STATUS.
>
> ⚠️ **Verification caveat:** the 2026-06-08 environment-wiring + degree-driven rows are **code-complete and build-verified** (clean `npm run build`; backend serves 16 Conditions / 52 presets), but **not yet eye-verified** in the running app — the "drives the render" claim is by-construction, not by-observation. The Condition editor now defaults to the Ground slot for that live look; confirm by eye before trusting the ✅s end-to-end. (The Tuner's capture primitive — `TUNER.md §5` — is the durable fix for "can't verify by eye.")

---

## Legend

- ✅ **Wired** — connected end-to-end, drives the render.
- 🟡 **Scaffolded** — code exists and is correct, but not mounted/connected in the surface that needs it.
- ⛔ **Gap** — known/designed, not built.
- 📦 **Artifact** — published data contract, consumed read-only.

---

## Authoring app (`/meteorologist.html`)

| Surface | State | Notes |
|---|---|---|
| App shell + top-bar `TEAPOT ⎮ CONDITIONS ⎮ MODULATORS` toggle + Look picker | ✅ | `MeteorologistApp.jsx` |
| Teapot library (flat list) + Teacup workstage | ✅ | 13 cloud-param TodChannels, autosave-on-edit |
| Conditions library + Condition editor (When / Directive / Clouds-in-cond / Revert) | ✅ | `ConditionEditor.jsx` + the three cards |
| Modulators editor (Phase 6) | ✅ | continuous signal-driven directive deltas |
| Unified time card (TOD + Year + Playback) | ✅ | `DawnTimeline.jsx`; year-scrub drives SunCalc → seasonal sun |
| Autosave → `serve.js` (port 3335) | ✅ | no Save button; Revert is the only explicit action |
| Validator (`pipeline/validate.js`) | ✅ | `ok: 52 presets, 16 rules, 7 modulators` |

## The canary viewport (`CanaryScene.jsx`)

This is the **staging area for the slab** — same stage/elements as the LS install, different audiences (see [[project_meteorologist_is_slab_staging_area]] / `ARCHITECTURE.md §2`). Status of each element:

| Element | State | Notes |
|---|---|---|
| Sky / sun / moon / stars (`<CelestialBodies>`) | ✅ | the real shared consumer, fed by the active Look's `scene.json` |
| Volumetric clouds (`<Atmosphere>`) | ✅ | raymarched slab; in the canary it binds the **active preset's** params (authoring path) |
| Hero tree — production atlas material (lit, bark/leaf, normal map) | ✅ | **fixed 2026-06-08** — was raw unlit GLB (`KNOWN-PENDING`); now `useTreeAtlas` like LS |
| Hero tree — foliage **wind sway** (shader, via `treeSwayUniforms`) | ✅ | **fixed 2026-06-08** — reads the directive; gentle breeze fallback until a Condition drives wind |
| Hero tree — sits still, weather animates around it | ✅ | leaves sway; no whole-tree translation/rotation (rigid-body fake removed) |
| Flat ground plane (lit `MeshStandardMaterial`) | ✅ | |
| Slot: first tab | 🟡 | code = **"Browse" / 90° overhead**; the canonical intent (`INTERFACE.md §7`) is **"Cloud Chamber" / isolated-cloud thumbnail**. Doc↔code drift — reconcile in code (deferred). |
| Slot: Ground (in situ) | ✅ | eye-level under the tree; camera auto-orbits (calm-static default is a queued tweak) |

## Environment wiring — Conditions → the canary (built 2026-06-08)

Selecting a Condition now drives the canary the way it drives the LS install, through the same shared stores (`ConditionEnvironmentDriver` in `CanaryScene.jsx`, mounted by `ConditionEditor`). Both "weather" stores are fed from the active Condition.

| Link | State | Notes |
|---|---|---|
| Active Condition's directive → `useAtmosphere` (clouds/wind/precip) | ✅ | driver pushes the **effective** directive (Condition × Degrees); clears stale active preset so `<Atmosphere>` uses the directive path |
| Condition → `useSkyState` (`cloudCover`/`storminess`) = scene **darkening** | ✅ | `deriveSkyScalars` from the effective directive; sets current+target (instant, no 90s drag) |
| `<WeatherEffects>` mounted in the canary (rain/snow/wetness/lightning) | ✅ | mounted in the Ground (in-situ) slot; lightning synthesized for stormy Conditions (almanac authors none) |
| Tree wind responds to the active Condition | ✅ | sway reads the now-condition-driven directive; breeze fallback only when no Condition wind |
| **Degree-driven** continuous response (precip/wind/cloud scrubber) | ✅ | `src/lib/condition-degrees.js#applyDegrees`; Degrees scrubber in the Condition editor previews drizzle→downpour. *v1 = multipliers on the authored full expression.* |
| Runtime (`almanac-eval`) feeds `applyDegrees` from the **live feed** | ⛔ | the slab should use the same function with normalized live `precipMmHr`/`windSpeedMs`/`cloudCover` (Phase 3b / `WEATHER-MODEL.md §7`) |
| Wet-surface look on canary ground/tree | ⛔ | `uWetness` integrates, but the canary GroundPlane + tree atlas material don't apply `applyWeatherToShader` yet — so "wet" doesn't show on surfaces (rain particles + darkening do) |

## Weather effects (`src/components/weather/`)

| Component | State | Notes |
|---|---|---|
| `RainParticles` | ✅ | **gravity fixed 2026-06-08** (fell upward — sign flip); opacity reduced (was white stripes) |
| `SnowParticles` | ✅ | **same gravity fix** (identical bug; never seen live) |
| `WetnessDriver` / `SnowAccumulationDriver` (`WEATHER_UNIFORMS`) | ✅ | integrators; opt-in materials patch via `applyWeatherToShader` |
| `LightningDriver` | 🟡 | consumes `directive.lightning.rate` — but **the almanac authors no `lightning` field**, so it never fires from a Condition. Synthesize from precip/storm, or add the field (Phase 3b). |

## Production (`Scene.jsx`) — the reference

| Link | State | Notes |
|---|---|---|
| `AtmosphereDirectiveDriver` → `useAtmosphere.tweenedDirective` (45s tween) | ✅ | sourced from live weather via `useAtmosphereDirective` |
| `<WeatherEffects>` (rain/snow/lightning/wetness) | ✅ | |
| `useSkyState` darkening (sun dim + sky desat) | ✅ | from the live weather poller |
| Trees + Atmosphere consume wind via `wind-field.js` | ✅ | |

## Artifacts (`public/clouds/`)

| File | State | Notes |
|---|---|---|
| `presets.json` (the Teapot, 52 entries) | 📦 ✅ | Nimbus-seeded params + descriptions |
| `almanac.json` (16 Conditions + fallback) | 📦 ✅ | carries `clouds`/`sun`/`lightDome`/`wind`/`precip`; **no `lightning`, no `storminess`/`cloudCover`** in directives |
| `modulators.json` (7 records) | 📦 ✅ | |
| `fixtures/` (fake-weather payloads) | ⛔ | not populated — Phase 5b Preview Studio |

## Known cross-cutting gaps (see `BACKLOG.md`)

- **Cloud realism** (⏸ tabled) — renderer is one isotropic FBM; can't express morphology (mammatus, fractus, towering). Career-level IP work, paused by operator.
- **Phase 3b** — promote directive numerics to TodChannels + add the `lightning` block to `directive.schema.json`.
- **Phase 5b** — Preview Studio + fixtures + driver coverage in Cartograph/Preview.
