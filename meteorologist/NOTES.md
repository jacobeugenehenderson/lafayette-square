# Meteorologist — Notes

Historical decisions + EOD records for the cloud + weather authoring track. Append-only; nothing here is current punchlist (see `BACKLOG.md` for that).

---

## 2026-05-21 — Preview Studio elevation (ADR — Phase 5b reshape)

**Decision:** Phase 5b promoted from "polish bundle" to substantive arc centered on a Preview Studio surface. Operator picks (Look, Fixture, TOD) → renders the full runtime composition against that scenario. Closes the "authoring blind to atmospheric edge cases until real weather happens" gap that Phase 6 + 7b/c/d's atmospheric machinery quietly surfaced.

**Context.** Jacob asked 2026-05-21 whether the operator could preview the deployed runtime's behavior under specific weather. Survey:

- Production `/` shows today's *actual* weather — uncontrollable
- Meteorologist's CanaryScene shows the active preset via `activePreset` path — bypasses directive composition (authoring mode, not preview mode)
- Cartograph Stage + Preview render `<Atmosphere />` against hardcoded fallback uniforms — no directive driver mounted there yet
- DevTools `useAtmosphere.setState({...})` forcing works but isn't operator UI

After Phase 6, the runtime composes a huge range of atmospheric scenarios from authored modulators + Almanac + presets. Tornado green, blizzards, severe wildfire haze are RARE events; the operator cannot verify their authoring works unless those events occur naturally. Preview Studio closes the iteration loop.

**The shape:**

```
Operator chooses          Runtime composes against              Studio renders
  Look + Fixture + TOD →  selectDirective(fixture, …)       →   live full-pipeline view
                          → modulator stack (signals from fixture)
                          → tween + Atmosphere uniforms
                          → opt-in materials respond
```

**Locked decisions:**

- **Fixtures** live at `public/clouds/fixtures/<id>.json` matching `weather-payload.schema.json`. Sibling `fixtures.defaults.json` per the immutable-defaults pattern. Operator-authored; starter set covers common scenarios (clear summer noon, overcast afternoon, thunderstorm late day, blizzard dawn, foggy dawn, wildfire haze summer, golden winter sunset, …).
- **Cartograph + Preview gain driver mounts** (5b.1) so they render directive-driven composition in their main viewports. Without this they're frozen at hardcoded fallback values, which makes the Preview Studio's framing inside Stage inconsistent.
- **Live readouts surface state operators can't see in DevTools.** Which Almanac rule matched, which modulators fire at what strength, the resolved directive's key values — same `useAtmosphere.activeStrengths` + `tweenedDirective` that already exist, just hoisted into operator-visible chrome.
- **Preview Studio's home** TBD between "Cartograph Stage Sky & Light card" (per-Look context belongs there) and "new third surface in Meteorologist" (atmospheric authoring already lives there). Lean Stage; revisit when 5b.3 dispatches.
- **Stretch:** save `(Look, Fixture, TOD)` scenarios as named regression checks. v1.x.

**Why this and not "leave it as polish":** a surface that lets the operator preview every scenario the runtime can render is not polish — it's the verification gate for everything Phase 6 + 7b/c/d shipped. Without it, every authored modulator is a hypothesis untested until the weather cooperates. Cost of skipping = months of weather-event-waiting to validate v1 atmospheric authoring. Cost of building = one substantial Phase 5b commit.

**Phasing.** 5b.1 (driver coverage) + 5b.2 (fixtures) ship together — they unblock 5b.3 (Preview Studio render surface) which lands as a separate substantive commit. 5b.4 (fallback editor) + 5b.5 (polish bundle) ride alongside or as small follow-ups.

**Cross-helper consequences:**

- Cartograph: gains the directive driver in its main viewport; Sky & Light card potentially hosts the Preview Studio chrome.
- Arborist: no direct touch. Trees still need to plumb into production (Phase 7a) before wind preview is meaningful.
- Future Audiologist: when audio lands, fixture-driven preview can audition rain/thunder/wind-muffle audio against any scenario.

---

## 2026-05-20 — Phase 7b/c/d shipped — visible precip + lightning (Tempest)

Three sub-phases of Phase 7 — Atmospheric Consumers — landed in one commit. The deployed LS no longer responds to weather only atmospherically; it responds *visibly*. Rain you can see. Snow piling up on roofs and ground. Lightning briefly washing the whole scene.

**Architectural shape** mirrors the Phase 5a/6 hook pattern: subscribe to `useAtmosphere.tweenedDirective` (one source), dispatch consumer components by `precip.kind` / `lightning.rate`. New files:

- `src/lib/weather-uniforms.js` — module-level `WEATHER_UNIFORMS = { uWetness, uSnowAccumulation, uLightningFlash }` IUniform singleton + `applyWeatherToShader(shader)` GLSL-injection helper for opt-in shaders. Pattern over zustand because materials read uniforms by reference from frame to frame with no React subscription overhead.
- `src/components/WeatherEffects.jsx` — top-level orchestrator. Mounted in `Scene.jsx` next to `<AtmosphereDirectiveDriver />`. Gates which particle systems run; always mounts the two integrator drivers (so wet/snow decay continues after rain/snow stops).
- `src/components/weather/RainParticles.jsx` — `InstancedBufferGeometry` of 6000 unit quads, per-instance speed/phase/active-cutoff. Vertex shader places each instance deterministically around the camera, computes fall + wind tilt, billboards the quad to face camera. Fragment is a vertical alpha gradient. Hail mode widens + blues + speeds particles via uniform.
- `src/components/weather/SnowParticles.jsx` — `THREE.Points` with size attenuation; vertex shader applies a cheap curl-noise approximation (two phase-offset sin lobes) for the meandering snow drift; wind dominates trajectory at 0.7 vs 0.3 fall.
- `src/components/weather/LightningDriver.jsx` — stochastic trigger (`rate * dt` probability per frame), 50ms attack / 200ms decay curve writes `uLightningFlash`. Path A scene-flash via the scene's primary `<ambientLight>` intensity multiplier (`1 + 4 * flash`). When kind=`cloud_to_ground`, renders a `CloudToGroundStreak` (12-segment jagged line, cloud base → ground) for the flash window.

**Edited files:**

- `src/components/atmosphere-materials.js` — added `uLightningFlash` uniform (bound by reference to the singleton, so LightningDriver writes propagate without prop plumbing) + a `vec3(1.2, 1.2, 1.45) * flash * 0.85 * accum.a` lit-from-above term in the cloud shader. Cache key bumped to `atmosphere-v4-lightning`.
- `src/components/AtmosphereDirectiveDriver.jsx` — `lerpDirective` extended to carry a `lightning` block (`rate`, `distance` lerped; `kind` last-wins). Forward-compat: today no rule or modulator emits the lightning block, but the driver passes it through whenever one does.
- `src/components/BakedGround.jsx` — `FadeMesh` calls `applyWeatherToShader(shader)` inside its existing `onBeforeCompile` (fade variant) and in a fresh one for the non-fade variant. Cache keys bumped to `*-wx1`.
- `src/components/grassMaterial.js` — `applyWeatherToShader(shader)` at the top of `onBeforeCompile`. Because three's `shader.fragmentShader.replace()` operates sequentially, the order ends up correct: grass's color_fragment replacement runs first, then the weather body modulates the final diffuseColor.
- `src/components/LafayetteScene.jsx` — same applyWeatherToShader call in both the mobile-no-texture branch and the desktop-textured branch of the building material. Cache keys `bldg-mobile-roof-wx1` and `bldg-textured-wx1` added (desktop branch had no cache key set previously — also fixes a latent program-cache-collision risk).
- `src/components/Scene.jsx` — `<WeatherEffects />` mounts inside the Canvas alongside the directive driver.

**Opt-in materials list** (full table in `FEATURES.md`): BakedGround FadeMesh (asphalt + sidewalks + LU fills, both fade + non-fade variants); BakedGround GrassMesh via grassMaterial.js (snow whitening is load-bearing here; wet contributes little but is preserved); LafayetteScene buildings (mobile + desktop branches — both walls and roofs). Skipped: GatewayArch (steel — wet barely visible), LafayettePark water (already wet), gravel paths (scope), trees (deferred with 7a). The doctrine: opt-in any surface that visibly responds to rain or snow in real life; skip surfaces where the modulation would be invisible or double-account.

**Integrator rates.**

| Uniform | Active rise | Inactive decay | Rationale |
|---|---|---|---|
| `uWetness` | ~50s to full | ~100s to fully dry | Asphalt darkens fast; pavement dries slow. Damp formula `1 - exp(-rate * dt * 60)` per frame. |
| `uSnowAccumulation` | ~3 min to full | ~10 min to clear | Snow accumulation is the photograph (NOTES 2026-05-20 consumers ADR — "snow ON things"). Slow build, slow melt. |
| `uLightningFlash` | 50 ms attack | 200 ms decay | Real lightning curve. Drives a brief ambient wash; coarse but reads correct at this duration. |

**Snow + wet conflict.** Resolved in shader: `wetMask = uWetness * topFacing * (1.0 - uSnowAccumulation)` — snow displaces wet (the snow is on top of the wet pavement; we see snow, not wet under). Snow whitens; wet doesn't fight for the same pixel.

**Verification.** Build transforms 1038 modules cleanly (the only failure is the pre-existing `public/photos/lafayette-square/other` symlink that breaks Vite's copy-static phase, unrelated to this change). DevTools verification path: open the LS, `useAtmosphere.setState({ tweenedDirective: { ...current, precip: { kind: 'rain', intensity: 0.8 } } })`. Rain falls; ground darkens over ~30s; releasing back to a dry directive dries over ~100s. Same pattern for snow + lightning. Schema doesn't yet contain a `lightning` block — Tempest's consumer is ready and waits for Phase 3b's schema extension + a modulator that emits it; until then the DevTools force is how lightning is exercised.

**What this commit does NOT ship:**

- **Phase 7a (wind field + multi-scale tree response).** Cross-helper with Arborist; trees aren't mounted in production yet. The whole reason 7a was deferred from this commit.
- **Audio.** Rain layer, snow muffle, thunder delay — all deferred to a future Audiologist helper. Silent ship.
- **Snow accumulation persistence.** v1 rebuilds from 0 on reload. localStorage persistence is v1.x follow-up.
- **`directive.schema.json` lightning extension.** The runtime consumer is ready; schema + modulator authoring of the block belongs with 3b. Without that, lightning fires only when forced via DevTools.

— Tempest

---

## 2026-05-20 — Phase 6 shipped — Modulators (Halo)

The continuous-phenomena layer landed end-to-end: schema, artifact, signal derivation, evaluator composition, UI tab, backend endpoints, autosave wiring. The Almanac picks the base directive; the modulator stack independently evaluates each authored phenomenon against the live signals payload and applies its bundle of deltas on top. Output flows through the same `useAtmosphere.rawDirective → tweenedDirective` tween path Cirrus established in 5a — no driver changes, the tween's per-frame interpolation absorbs strength changes for free.

**Architectural decisions taken during ship:**

- **Approach B for pressure trend** — extended the open-meteo query with `past_hours=4` + `pressure_msl` in hourly. `deriveSignals` walks the resulting `hourlyForecast` ring for the entry closest to `now − 3hr` (rejects if > 90 min off). No persistent in-memory buffer; a fresh page sees correct `pressure_trend_3hr` immediately rather than waiting 3hr for a buffer to fill.
- **Radiation fields added to current query** — `direct_radiation` + `diffuse_radiation` plumbed through `useWeather → useSkyState → deriveSignals` as `direct_ratio = direct/(direct+diffuse+1)`. Smoke / haze modulators (`wildfire_smoke`, `summer_heat_haze`) read this. Cirrus had added pressure_msl + humidity + wind_direction; I added the radiation pair on the same pattern.
- **Driver `between` shape added** — the ADR's worked tornado example used `"in": [16, 21]` for an hour range, but the brief defines `in` as discrete-set membership. I introduced `between: [lo, hi]` (inclusive range, boolean output) as the natural shape for continuous-range membership; `in` retains its discrete-set semantics for WMO codes etc. The starter set uses `between` for hour ranges.
- **Delta paths track the actual `directive.schema.json`** — `sun.tint` (not the ADR sketch's `sun.color`), `lightDome.horizon` / `lightDome.top` (not `sky.tint` / `sky.low`), `wind.scale` (not `wind.gustsScale` — `gustsScale` is a Phase 7a addition per the consumer ADR; it's not in the directive schema yet so the starter set composes via `wind.scale`).
- **Color-override composition is last-wins** — the v1 starter set is designed so two `{from,to}` modulators don't target the same field at high strength simultaneously (tornado green and wildfire orange shouldn't both be at strength 1 — that'd be unusable weather). Tint-toward amounts and scalar scales compose commutatively (sum-and-clamp / multiplicative). Documented in the evaluator header.
- **`selectDirective` retains its old signature** — a new `selectDirectiveWithStrengths` sibling exposes the per-modulator strength map for the editor's live indicator. The 5a-compatible `selectDirective` just calls the new path and drops the strengths.
- **Strengths land on `useAtmosphere.activeStrengths`** — published every evaluator tick. ModulatorsLibrary + ModulatorEditor both read it for live indicators against today's actual weather.

**Starter modulators (7):**

| id | driver | what it does |
|---|---|---|
| `cold_front_passage` | `pressure_trend_3hr` smoothstep [-6, 0] | Warms sun, cools horizon, lifts wind scale over a 45-min ramp |
| `severe_storm_aerosol_filter` | `all`(weathercode∈{95,96,99}, hour 16-21, precipitation≥5) | Tornado green — sun & horizon shift yellow-green, intensity drops to 35% |
| `wildfire_smoke` | `direct_ratio` smoothstep [0.7, 0.35] (inverted) | Orange sun, brown-amber dome wash when smoke attenuates direct sun |
| `pre_storm_gold` | `all`(cloudCover bell [0.5, 0.85], sunElevation bell [3, 14]) | Deep gold rake under heavy clouds at low sun |
| `about_to_rain` | `all`(pressure_trend [-3,0], humidity [0.75,0.95], cloudCover≥0.6) | Muted, slightly-cooler, slightly-flatter light |
| `fog_burn_off` | `all`(cloudCover bell [0.3, 0.75], hour 7-11) | Warm hazy diffusion, pale-warm horizon |
| `summer_heat_haze` | `all`(tempC [28,38], direct_ratio [0.85,0.6], hour 11-17) | Neutral-cool dome with blanched sun; slows wind |

**Verified composition** with a synthetic supercell-day signal mix (pressure −3 mb/3hr, weathercode 95, hour 18, precip 8, cloudCover 0.8, humidity 0.85, direct_ratio 0.4): five of seven modulators fire simultaneously; `sun.intensity` multiplies through cleanly (1.2 × cold_front × tornado × wildfire × pre_storm = 0.25); `wind.scale` lifts from 1.0 → 1.3 (cold_front at 0.5 strength). Color overrides land last-wins as designed — tornado green wins on `sun.tint`; wildfire's brown wash wins on `lightDome.top`.

**What's deferred:** cross-helper wind feed to `InstancedTrees` (Phase 7a — modulators output `wind.scale`, but tree sway shader rewrite + `wind-field.js` are separate work). `wind.gustsScale` directive field will need adding to `directive.schema.json` when 7a lands.

— Halo

---

## 2026-05-20 — Phase 4b.3 shipped — production swap

Meteorologist's volumetric raymarched cloud renderer is now the runtime everywhere. Three mounts flipped (`Scene.jsx:683`, `CartographApp.jsx:956`, `PreviewApp.jsx:574`); orphan import dropped from `StageApp.jsx`; `CloudDome.jsx` + `SpriteClouds.jsx` deleted along with `HANDOFF-clouds-day3-clouddome-v2.md`.

Phase 5a (commit `e9936f8`) already wired the directive path into Atmosphere. With 4b.3 mounting Atmosphere at the three production sites, production now renders today's actual atmospheric directive smoothly tweened against live weather. The two consumer paths (authoring via `useMeteorologistStore.activePreset`, production via `useAtmosphere.tweenedDirective`) both exist in `Atmosphere.jsx`; this commit just gets the component mounted where users will see it.

Caveat — the `AtmosphereDirectiveDriver` is mounted only in `Scene.jsx` (per 5a stash-isolate). Cartograph Stage + Preview render Atmosphere but no driver runs there, so without an authored preset their `tweenedDirective` stays null and the uniforms hold their `createAtmosphereMaterial` defaults (hardcoded cumulus_humilis). Production (`/`) is fully directive-driven; Stage + Preview need their own driver mount as Phase 5b polish for the directive path to be visible there.

---

## 2026-05-20 — Phase 5a shipped — runtime live wiring (evaluator hot-mount + directive tween + wind subscribers)

The plumbing for "live LS" landed. open-meteo → `useWeather` → `useAtmosphereDirective` → `selectDirective(payload, almanac, presets, override)` → `useAtmosphere.rawDirective` → 45s ease-in-out tween (weight-union cloud crossfade) → `useAtmosphere.tweenedDirective` → Atmosphere uniforms + tree sway. The directive's `wind.dir` + `wind.scale` drive cloud advection and tree sway from the same source.

What's bound where:
- `<Atmosphere>` shape + lighting uniforms: production path runs `bindUniformsFromDirective` (weighted-blend across all presets in the directive's `clouds[]` at the current minute). When a Teacup preset is loaded the authoring path wins, unchanged from Phase 4b.2.
- `<Atmosphere>` sun/sky color: when no authoring preset is active, the directive's `sun.tint` overrides the sky-light coupling amendment's `sunGlow` write for cloud lighting (`directive.lightDome.horizon` → `uSkyColor`, `directive.lightDome.ambientFloor` → `uAmbientFloor`). Sky channel still drives the dome itself.
- `<InstancedTrees>` sway: existing `treeSwayUniforms.uTime` pump gains `uSwayWindSpeed` (scales oscillation rate) + `uSwayWindDir` (XZ unit vec biasing canopy lean). Phase 7a will replace these scalars with a multi-timescale gust envelope.

Weight-union crossfade is the load-bearing choice for the directive tween: when the Almanac flips condition the blend at lerp param t carries BOTH presets — old weights · (1-t), new weights · t — so cloud morphology morphs through the transition instead of snap-cutting. Renormalized only when the sum exceeds 1.

Open-meteo extension: useWeather's fetch grew `pressure_msl`, `relative_humidity_2m`, and separate `wind_direction_10m` fields. The schema's `humidity` is 0..1 so the parser divides by 100; pressure_mb passes through.

Production caveat: `Scene.jsx` still mounts `<CloudDome />` (Phase 4b.3 hasn't shipped) and trees are NOT mounted in production at all today. The driver writes into the store the moment Scene.jsx loads, and CanaryScene + PreviewApp + Stage are the proving surfaces today. The Phase 5a wiring is fully in place; the production-visible "live LS" beat lands on 4b.3 + the production tree mount.

Disclosure trail:
- `weather-payload.js` matched schema field names verbatim: `tempC, cloudCover, pressureMb, humidity, windKph, windDirDeg, precipMmHr, precipKind, stormDistanceKm, sunElevationDeg, sunAzimuthDeg, tod, season`. Schema's `season` enum uses `fall` (not `autumn`); the deriver matches. TOD enum is broader than what the Almanac uses; only the subset `dawn/morning/noon/afternoon/dusk/night` is emitted today.
- `bindUniformsFromDirective` does the full weighted blend across all presets in the directive's `clouds[]` (preferred path, not the top-weighted shortcut). Missing presets in the cache are skipped + their weight excluded from the normalization.
- Sun/sky uniform override: when the directive is active, its `sun.tint` overrides the sky-light coupling amendment's `sunGlow` write (matches the framing's "weather-coloured days override sky lighting"). Sky channel still owns dome rendering.
- Tree sway scalar contract for Phase 7a: speed scales the oscillation rate basis (`0.6 + 0.4*(speed-1)`) and adds a static lean proportional to `speed-1`. Phase 7a should replace this with a sampled wind field + multi-timescale envelope; the scalar pair is a placeholder, not the destination.
- Driver mounted in `Scene.jsx` only (per stash-isolate). CanaryScene + PreviewApp will need their own mount when their directive consumption matters (Phase 5b polish).

---

## 2026-05-20 — Phase Seed shipped

Library is no longer placeholder. Nimbus's 52-preset specialist seed + the photo-in-viewport authoring loop turn the Teapot from scaffolding into a real authoring surface. Schema gained an optional `description` field; UI surfaces it as read-only in the rail and editable in the expanded state. `specialist-seed.json` acts as the immutable canon — operator edits override it per preset, "Revert to seed" restores it.

Open the library now → every preset is its own thing.

Mechanism notes:
- `meteorologist/pipeline/seed-presets.js` is idempotent. `authored:true` (operator-touched OR previously-protected via `preserve_authored` flag in the seed) blocks param + description rewrites. Re-run anytime.
- Seeding is kind-aware. `cloud` + stub kinds (rain/snow/lightning) take all 12 cloud-shader params; `fog` takes only the 4 keys allowed by the fogParams schema (and preserves existing `tint`). Nimbus's full 12-key block for fog is preserved in the seed file for future use if fogParams ever relaxes.
- The seed is served via `GET /api/meteorologist/specialist-seed` (lives outside `public/` to keep one source of truth); the store fetches it on app mount and uses it for the Teacup "Revert to seed" affordance.

---

## 2026-05-20 — Modulators: continuous atmospheric phenomena layer (ADR — v1 commitment)

**Decision:** Add a Modulators layer on top of the Almanac. Almanac picks the base directive (which preset, baseline tints) from weather; Modulators stack continuous, weather-signal-driven deltas on top (cold front, about-to-rain, tornado green, wildfire smoke, pre-storm gold, fog burn-off). Composed result feeds Atmosphere uniforms. **This is v1, not v2.**

**Context.** Jacob asked whether a single neutral-density dial could simulate "a cold front coming" or "tornado green." Answer: no — real atmospheric phenomena are *selective*. Each touches a small bundle of dials with characteristic curves against quantifiable weather signals. A cold front warms the sun, cools the sky, drops contrast, spikes gusts — all simultaneously, all over ~45 min, all driven by pressure tendency. Tornado green is yellow-green sun + dropped intensity + cooler sky-low band, driven by severe-storm WMO codes + late-afternoon TOD + heavy precip. These have specific signatures in the open-meteo response, but the Almanac's discrete-rule model doesn't have a natural place to express continuous, signal-driven, *composable* modulations.

**The data is there.** Open-meteo (already wired via `useWeather.js`) returns: weathercode, cloudcover_low/mid/high, pressure_msl (we derive 3hr trend), temperature_2m, apparent_temperature, dewpoint_2m, relativehumidity_2m, visibility, shortwave_radiation, direct_radiation, diffuse_radiation, windspeed_10m, winddirection_10m, windgusts_10m, precipitation, rain, showers, snowfall, uv_index, is_day. `direct/(direct+diffuse)` ratio alone gives us measured sun-through-haze behavior for free.

**The architecture.**

```
Almanac          → base directive   (which preset, baseline sun/sky/light/wind)
Modulators[]     → directive deltas (each tied to a weather signal + curve)
Result           = base ⊕ stacked deltas → Atmosphere uniforms
```

A Modulator is an authored record:

```json
{
  "id": "cold_front_passage",
  "driver": { "signal": "pressure_trend_3hr", "range": [-6, 0], "curve": "smoothstep" },
  "deltas": {
    "sun.color":     { "from": "#ffe6c8", "to": "#fff0aa" },
    "sun.intensity": { "scale": [1.0, 0.7] },
    "sky.tint":      { "tintToward": "#7e9eb8", "amount": [0, 0.4] },
    "wind.gustsScale": [1.0, 1.8]
  },
  "rampMinutes": 45
}
```

The runtime evaluates each modulator's driver against the weather payload, computes its strength via the curve, applies its deltas to the base directive. Multiple modulators stack — a smoky summer day with an incoming cold front fires both, the shader sees one resolved uniform set. The 45-minute ramp prevents flicker on signal-boundary crossings.

**What "tornado green" looks like as a modulator** (operator-authored once, lives forever):

```json
{
  "id": "severe_storm_aerosol_filter",
  "driver": { "all": [
    { "signal": "weathercode",   "in": [95, 96, 99] },
    { "signal": "hour_of_day",   "in": [16, 21] },
    { "signal": "precipitation", "min": 5 }
  ]},
  "deltas": {
    "sun.color":     { "from": "#ffe6c8", "to": "#9aaa55" },
    "sun.intensity": { "scale": [1.0, 0.35] },
    "sky.low":       { "tintToward": "#9caa66", "amount": [0, 0.6] }
  },
  "rampMinutes": 5
}
```

When the trigger conditions hold → 5-minute ramp to the eerie yellow-green. When they unmatch → ramp back. Real atmospheric optics, captured once by the operator, runs forever against real weather.

**Why this and not "more rules in the Almanac":**

- Combinatorial explosion. Rules want discrete categories; phenomena are continuous and *compose*. Adding "cold front × wildfire smoke × tornado green × late afternoon" as discrete Almanac rules explodes; stacking them as modulators is multiplicative-free.
- The Almanac stays simple. Conditions remain "what kind of clouds is the sky." Modulators handle "what does the sky FEEL like."
- Authoring lives at the right grain. Each modulator is its own authoring unit, with its own driver and curve and ramp. Operator builds an atmospheric vocabulary once; the runtime applies it to whatever weather rolls in.

**Why this and not "shader-side atmospheric physics":** the operator loses control. Modulators preserve the painter's hand — operator decides exactly what "tornado green" looks like in this kit.

**Phasing.**

This lands as **Phase 6 — Modulators**, after Phase 5 (Almanac evaluator hot-mount). Walk before run: get the Almanac running live against real weather first, see the directive flowing through Atmosphere, then add the modulation layer on top. Modulators *need* the evaluator hot-mount to be visible at all.

**Locked decisions:**

- New `public/clouds/modulators.json` artifact (sibling to `almanac.json`); new `modulator.schema.json` in `pipeline/schema/`.
- Drivers reference open-meteo field names + derived signals (`pressure_trend_3hr`, `direct_ratio = direct/(direct+diffuse)`, `hour_of_day`, etc.). A small `deriveSignals(weatherPayload, time)` helper produces the expanded payload modulators read against.
- Curve types: `smoothstep` (default), `linear`, `bell`, `threshold`. Operator-pickable per driver.
- `deltas` paths address directive fields by dot-path (`sun.color`, `sky.tint`, etc.). Color deltas use hex lerps; scalar deltas use scale-or-add ranges.
- Composition: stack additively for additive fields (intensity scales multiply; tint-toward amounts sum and clamp); commutative-by-design so order doesn't matter.
- New "Modulators" tab in Meteorologist UI alongside Teapot + Conditions. Per-modulator editor with driver picker, curve picker, delta-rows, ramp slider.
- **Wind is part of the directive output** (`wind.speed`, `wind.dir`, `wind.gustsScale`) — sourced from open-meteo (windspeed_10m, winddirection_10m, windgusts_10m), modulated by modulators (cold_front_passage spikes gustsScale, summer_heat_haze drops speed, etc.). **Two consumers**, both subscribe to the same resolved wind output: `<Atmosphere>` (cloud advection via `uWindScale` + `uWindDir`) and `<InstancedTrees>` (sway shader uniforms). Cross-helper subscribes-not-authors per `project_kit_helpers_pattern` + ARCHITECTURE §9.

**Vision capture:** this is a v1 commitment, not a v2 deferral. Lafayette Square should be able to show its operator what a real cold front feels like — that's the level of liveness the product promises. Modulators are the architectural piece that makes that promise reachable.

---

## 2026-05-20 — Atmospheric consumers: wind, rain, snow, lightning (ADR — v1 commitment)

**Decision:** The directive (Almanac base + Modulators stack) outputs *what the atmosphere is doing*; this ADR locks the *consumer* layer that turns that output into visible scene state. Wind is a sampled field, not a global scalar. Trees, clouds, and particles all subscribe to the same field. Rain is motion-blurred streaks + wet-surface shader. Snow is points + accumulation (accumulation IS the snow). Lightning is a scene-level flash with delayed thunder. **This is v1, not v2.**

**Context.** Jacob raised the dawdle problem — most game weather uses a global sine-wave wind that everything bobs on uniformly. Real wind has at least three temporal scales (drift, gust envelope, gust spikes), is *coherent in space* (gusts travel through the scene as moving waves), and provokes multi-timescale response (leaves twitch, branches sway, trunks lean). Without these properties, even physically-accurate weather rendering reads as fake. Same applies to precip: rain without wet streets reads wrong; snow falling without accumulation reads wrong; lightning without delayed thunder reads wrong. Modulators (sibling ADR above) shape the directive's wind/precip/lightning *values*; this ADR locks how those values become visible scene behavior.

### Wind — sampled field, not scalar

Single source: `src/lib/wind-field.js` exporting

```js
windAt(timeSec, worldPos, windState) → { force: vec3, intensity: scalar }
```

`windState` carries the resolved directive's `wind.speed`, `wind.dir`, `wind.gustsScale`. Every consumer (Atmosphere, InstancedTrees, particle systems, audio) samples this same field at its own position. Cross-helper subscribes-not-authors per `project_kit_helpers_pattern`.

**Three temporal scales** (real wind):

```js
intensity(t, pos) = windState.speed * (
  1.0
  + perlin(t * 0.005) * 0.2                            // drift: minute-scale
  + perlin(t * 0.08) * 0.4                             // gust envelope: ~10-20s
  + smoothmax(perlin(t * 0.4), 0.65) * gustsScale      // gust spikes: 1-2s
)
```

The `smoothmax(...0.65)` threshold is load-bearing — what makes gusts feel sharp instead of oscillatory. Real gusts spike above a baseline and fall back; without the threshold, wind sine-waves and reads as dawdle.

**Spatial coherence — gusts travel.** A gust is a moving wave, not a global pulse:

```js
gustFrontPos = -windDir * (t * windSpeed)
localGust = perlin((pos.xz - gustFrontPos.xz) * 0.01)
```

Each sample point asks "where is the gust front relative to me?" Effect: a gust visibly travels through the scene over ~1–3s. Trees on the upwind side bend first; the disturbance ripples across. This is the singular property that breaks dawdle.

**Multi-scale consumer response.** Trees don't respond uniformly; different parts have different time-constants:

| Element | Frequency | Damping | Follows |
|---|---|---|---|
| Leaves | ~10 Hz | very low | every nuance |
| Twigs / small branches | ~2 Hz | moderate | gust envelope |
| Major branches | ~0.5 Hz | heavy | sustained wind |
| Trunk lean | ~0.1 Hz | very heavy | minute-average |

InstancedTrees' sway shader samples the wind field at different temporal frequencies per geometry level, with appropriate damping. Result: leaves flicker during gusts, branches sway with the envelope, the trunk leans only in sustained wind. This is the doctrine for "not video-game wind."

### Rain — streaks + wet surface

Bounded volume (~150–200m radius cylinder around camera) of ~5–10k particles. Locked details:

- **Streaks, not points.** Each particle is a thin billboarded quad with vertical alpha gradient. Points read as snow even when grey-tinted; the streak shape IS the percept.
- **Wind-tilted fall.** `velocity = down * 0.7 + windDir * 0.3`. In heavy wind the tilt is visible.
- **Per-particle speed variance.** ±30% randomness; heavy drops fall fast, small drops drift slowly. Gives depth.
- **Wet-surface pass** (load-bearing). Single uniform `uWetness ∈ [0,1]` from `directive.precip.intensity` through a slow integrator (puddles form over ~minute, persist ~minute after rain stops). Asphalt + concrete materials darken albedo + boost specular. Rain without this reads as "rain particles passing through a dry world" — wrong.
- **Audio.** Rain layer fades with intensity. Localized "on the umbrella" near camera; ambient distant rain at horizon.

### Snow — points + accumulation

Different physics, different visual emphasis. Locked details:

- **Particles are points** (small sprites), not streaks.
- **Curl-noise lateral motion.** Particles meander; `velocity = down * 0.3 + windDir * 0.7 + curl(pos, t) * 0.4`.
- **Wind dominates.** At the same wind speed, snow gets pushed sideways far more than rain.
- **Accumulation is the look** (the load-bearing thing). Single uniform `uSnowAccumulation ∈ [0,1]` whitens top-facing surfaces:

  ```glsl
  float topFacing = clamp(normal.y, 0.0, 1.0);
  vec3 snowAlbedo = mix(baseAlbedo, vec3(0.95), uSnowAccumulation * topFacing);
  ```

  Integrator rises while `directive.precip.kind === 'snow'`, decays slowly otherwise. Roofs cap white, branches frost, ground turns. Snow ON things is what reads as a snowy day; the falling particles add kinetic feel but the static look comes from accumulation.
- **Audio.** World goes muffled — ambient bed gets a low-pass filter; snow absorbs high frequencies in reality.

### Lightning — scene flash + delayed thunder

Cheap but high-impact. Locked details:

- **`uLightningFlash` uniform** at scene level. Runtime fires it when `directive.lightning.rate > 0`, stochastically per frame at the directive-defined rate.
- **Curve.** 50 ms hard spike, ~200 ms decay tail. Affects scene ambient multiplier (everything briefly washes out), the cloud shader's lit-from-above term, optional ground-albedo flash.
- **Audio.** Thunder layer delayed proportional to a `directive.lightning.distance` signal. Close storms = immediate crack; far storms = rumble several seconds later. Modulators can drive distance.
- **Intracloud vs cloud-to-ground.** Intracloud = cloud just glows briefly (cheap, common). Cloud-to-ground = bright vertical streak rendered as a particle line (rarer, more expensive). `directive.lightning.kind` distinguishes.

### Why these specifications and not alternatives

- **Wind field vs global scalar:** the dawdle break is structural, not parametric. You can't tune your way out of "every leaf reading the same wind value."
- **Streaks vs points for rain:** points read as snow at any color. The streak shape is the percept.
- **Snow accumulation vs more particles:** doubling particle count doesn't make snow look more snowy; whitening surfaces does. Falling particles are decoration; accumulation is the photograph.
- **Wet-surface pass vs none:** rain without darkened/specular wet streets is the single largest "uncanny weather" tell. Not optional.
- **Delayed thunder vs synced thunder:** instant thunder reads as a flash sound effect, not weather. The delay locates the storm in space.

### Phasing

Lands as **Phase 7 — Atmospheric consumers**, after Phase 6 Modulators. Split into reviewable sub-phases (each a verifiable visual beat):

- **Phase 7a — Wind field + multi-scale tree response.** Cross-helper with Arborist. The dawdle fix. Standalone visual win.
- **Phase 7b — Rain particles + wet-surface shader.** Cloud presets with `precipKinds: ['rain']` start producing visible rain.
- **Phase 7c — Snow particles + accumulation integrator.** Same for `precipKinds: ['snow']`. Accumulation persists across pause/resume.
- **Phase 7d — Lightning flash + delayed thunder.** `directive.lightning.*` consumers.

Sub-phasing keeps each layer independently reviewable; bundling would hide which layer broke what.

### Cross-helper consequences

- **Arborist** — InstancedTrees sway shader rewritten in Phase 7a to read the wind field at multi-scale frequencies. Cross-helper coordinator brief writes itself when Phase 7a is ready to dispatch.
- **Cartograph** — wet-surface materials authoring lives here (per-Look "this road darkens to X under rain"); bake-scene.js doesn't change shape, gains authored channels.
- **Sound layer** (not yet a helper) — rain/snow/wind/thunder audio layering. Future Audiologist helper or under Meteorologist's own runtime.

**Vision capture:** Modulators answer "what does today's atmosphere look like?" Atmospheric consumers answer "what does today's atmosphere FEEL like inside the scene?" Together they're the v1 promise. Each consumer here exists because skipping it produces the uncanny "video game weather" tell.

---

## 2026-05-21 — Phase 4b.2 amendment shipped — sky-light coupling

Follow-up to the same-day Phase 4b.2 commit. The cloud shader's three lighting uniforms stop being hardcoded; they now read from the Look's sky channel + SunCalc each frame:

| Uniform     | Was                              | Now (per frame)                                     |
|-------------|----------------------------------|-----------------------------------------------------|
| `uSunColor` | hardcoded `#ffe6c8` (warm)       | `sky.sunGlow` band (sun's color at this minute)     |
| `uSkyColor` | hardcoded `#9faab8` (grey-blue)  | `sky.low` band (horizon-ish ambient cloud undersides see) |
| `uSunDir`   | hardcoded `vec3(0, 0.7, 0.7)`    | SunCalc.getPosition at INSTANCE lat/lon, projected via the same `celestialToPosition` math CelestialBodies uses |

Sky channel reuses the post-pivot resolver: `useSceneJson(lookId)` → `scene.sky` → `resolveSkyAtMinute(skyChannel, minute, slotMinutes)` → 5-band RGB. First-paint fallback is `{ overrides: [] }` (pure procedural mosaic) so there's no flash before scene.json resolves.

**Visible result:** clouds warm at golden hour, deepen blue at twilight, dim at night — automatically, tracking the same sky the skydome renders. Year-strip scrubs propagate through the sky resolver's anchor lerp to the cloud lighting (winter's low sun → cloud lit-side reads warm-yellow earlier in the day; summer's high sun → noon clouds stay cool-lit). Operator overrides on `sunGlow` at a specific hour propagate to the cloud's lit side too — same authoring surface, two consumers.

**Surfaced decisions:**

- Scene shape is `scene.sky` (not `scene.skyLight.sky` as the brief sketched) — matches CelestialBodies' callsite. No nesting under a `skyLight` group exists in the post-pivot schema.
- Sun-direction math matches `celestialToPosition` in CelestialBodies exactly — `x = cos(alt)·sin(az)`, `y = sin(alt)`, `z = -cos(alt)·cos(az)`. No sign-flip needed.
- `lookId` prop now consumed (was an unused commented-out arg). Falls back to `INSTANCE.lookId` if omitted. CanaryScene already passes `activeLookId` so production wiring is correct.
- `useSceneJson` runs once per `(lookId, cacheBust)` via its module-level memo, so the per-frame cost is just the resolver math (already used by the skydome each frame).

**Not folded into the parent 4b.2 commit:** the parent was already committed + pushed when this amendment arrived. Shipped as a small follow-up rather than rewriting history.

---

## 2026-05-21 — Phase 4b.2 shipped — TodChannel uniform binding

Atmosphere's twelve shape + lighting uniforms now read from the active preset's per-param TodChannels each frame. Operator slider drags in Teacup land on the cloud synchronously — `_patchParam` mutates the in-memory `presets` array on the same tick, the next `useFrame` reads it, no debounce wait. Animated channels (operator-keyframed slots across `dawn → noon → dusk`) lerp via `resolveGroupAtMinute` as the time strip scrubs.

**Binding (`src/components/Atmosphere.jsx`):**

```js
const PARAM_TO_UNIFORM = {
  coverage: 'uCoverage', density: 'uDensity', thickness: 'uThickness',
  baseAlt: 'uBaseAlt', warpFreq: 'uWarpFreq', warpAmp: 'uWarpAmp',
  noiseSeed: 'uNoiseSeed', octaves: 'uOctaves',
  sunScatter: 'uSunScatter', ambientFloor: 'uAmbientFloor',
  edgeSilver: 'uEdgeSilver', shadowStrength: 'uShadowStrength',
}
// inside useFrame:
const preset = useMeteorologistStore.getState().getActivePreset()
const minute = tod.currentTime.getHours() * 60 + tod.currentTime.getMinutes()
const slotMinutes = getTodSlotMinutes(tod.currentTime)
for (const [k, u] of Object.entries(PARAM_TO_UNIFORM)) {
  const ch = preset?.params?.[k]
  if (!ch) continue
  const r = resolveGroupAtMinute(ch, minute, slotMinutes, ['value'], { value: material.uniforms[u].value })
  material.uniforms[u].value = r.value
}
```

`getActivePreset()` selector added to `useMeteorologistStore` (returns the preset object matching `activePresetId`).

**Surfaced decisions:**

- **Option A confirmed (store-direct).** `_patchParam` synchronously mutates `presets[i].params[k]` before scheduling the debounced PUT — verified by reading the store action source. No draft layer; Atmosphere reads the same object Teacup's sliders write to.
- **Minute-of-day inlined** as `currentTime.getHours() * 60 + currentTime.getMinutes()` rather than reusing `useTimeOfDay.getMinuteOfDay()`. Both produce identical values; the inline keeps Atmosphere's frame path tight and doesn't take a getter call.
- **noiseSeed + octaves pass as floats.** The shader's `atmosphere-materials.js` uniform table declares them as `{ value: number }` and the GLSL casts internally — no special handling needed in this binding.
- **uWindScale not bound.** Wind belongs to Conditions/directive (not in `CLOUD_PARAM_FIELDS`); left alone per brief.
- **Per-frame iteration cost.** Twelve `resolveGroupAtMinute` calls per frame, each a constant-time lookup on a 7-slot TodChannel. Trivial; not worth caching unless the per-frame minute hasn't changed (deferred — measure first).

**Closes the authoring loop:** what Teacup edits is what the canary viewport renders. Phase 4b.3 (CloudDome retirement + production swap) is the next gate.

---

## 2026-05-21 — Sky pivot Phase B shipped — rules-based seasonal derivation

Three HSV knobs per season instead of per-cell painting. `SEASON_TRANSFORMS` in `cartograph/proceduralSky.js` applies a `(hueDeg, sat, val)` transform to `KEYFRAMES` at sample time — the procedural lerp then walks through a palette-shifted copy of the canon per season. Summer is locked to identity (canon). Winter / spring / autumn deviate per the knobs:

| Season | hueDeg | sat  | val  | Intent |
|--------|--------|------|------|--------|
| summer |   0    | 1.00 | 1.00 | identity — the canon |
| winter |  -8°   | 0.78 | 0.93 | cool / pale / hazy / clear-air feel; desaturated; slight darken |
| spring |  +5°   | 0.95 | 1.02 | crisper noon; warm rose tinge on dawn/dusk; slight lift |
| autumn |  -6°   | 1.18 | 0.97 | sat push for harvest vividness; small red-shift on twilight peaks; slight darken |

Verification samples from the regenerated `ANCHOR_CARDS_PROCEDURAL` (LS lat/lon):

| Hour | winter | spring | summer | autumn |
|------|--------|--------|--------|--------|
| noon zenith | `#64a5d0` (pale cyan) | `#538be4` (saturated violet-blue) | `#4a90e0` (canon) | `#2e8fd9` (saturated deep blue) |
| 18:00 horizon | `#191722` (night — winter sun's already set) | `#cf7339` (warm orange) | `#bdb293` (still daylight) | `#782218` (deep harvest crimson) |

**Re-tuning workflow** (the operator's instrument):

1. Edit `SEASON_TRANSFORMS.<season>` in `cartograph/proceduralSky.js`.
2. `node cartograph/pipeline/hydrate-anchor-cards.js > /tmp/cards.js`.
3. Paste the new `ANCHOR_CARDS_PROCEDURAL` body into `src/cartograph/skyGrid.js`.
4. Reload Stage → eye-check → iterate.

The hydration is deterministic; the three numbers per season are the entire audit trail. "Autumn too aggressive" = one number, not 22 cells.

**Surfaced decisions:**

- `sunGlow` literal colors in `proceduralSkyAt` (`#dd4433`, `#ff3318`, `#ee7755`, etc.) NOT transformed — they sit outside `KEYFRAMES` and represent the sun-disc/halo glow rather than the sky bands. Kept canonical so the sun itself reads consistently across seasons. Easy to revisit if autumn's sunset glow needs deeper warmth.
- Identity short-circuit in `transformKeyframes` so summer pays zero conversion cost (and is byte-identical to the canon).
- Knob ranges chosen near the orchestrator's brief suggestions; I have no Stage eyes for visual verification — Jacob's first scrub may want re-tuning. The dial-edit-rehydrate loop is one command.

**Phase B closes the sky pivot.** Override authoring (Phase A) + rules-based season derivation (Phase B) compose: operator's sparse `{hour, band, hex}` overrides ride on top of the season-correct procedural mosaic.

---

## 2026-05-21 — Sky pivot Phase A shipped

Mechanism for the 2026-05-20 ADR ("procedural canon + per-cell overrides") landed in a single commit. Phase A scope: extract `cartograph/proceduralSky.js`, hydrate the 4 anchor cards (procedural-seeded only — Wren's artistic deviation is Phase B), reshape `skyGrid.js` to `SKY_HOURS=24` + `buildMosaicForDate` + override envelope, rewire store actions to `addSkyOverride/removeSkyOverride`, rewrite `SkyGradientGrid.jsx` to 24 hour-cols with CSS-gradient cells, migrate `scene.json` schema, defensive backward-compat reads on legacy shapes.

**What's new (kit canon):**

- `cartograph/proceduralSky.js` — `KEYFRAMES` table + `proceduralSkyAt(altitude, isDawn)`. Pure-JS hex (Node ESM portable). Lifted from `47c2760^:CelestialBodies.jsx:405-510`.
- `cartograph/pipeline/hydrate-anchor-cards.js` — one-shot script. SunCalc × `proceduralSkyAt` → 4 × 24 × 5 hex table. Re-run if `KEYFRAMES` ever change.
- `src/cartograph/skyGrid.js` — exports `ANCHOR_CARDS_PROCEDURAL` (static, generated) and `ANCHOR_CARDS` (active; Phase A = procedural; Phase B will deviate). `buildMosaicForDate(date, overrides)`, `flankingAnchors(doy)`, override envelope (`spatialWeight`, `temporalWeight`).
- Store: `addSkyOverride(hour, band, hex)`, `removeSkyOverride(hour, band)`, `revertSky()` clears all overrides.
- `scene.json` schema: `{ sky: { overrides: [...] } }`. Legacy 1-layer + 4-anchor shapes migrate to `{ overrides: [] }` (no operator deviations to salvage — the 1-layer summer IS the procedural seed).

**Resolver behavior (verified by smoke tests):**

- May 19 → mosaic lerps spring (Mar 20) → summer (Jun 21) at ~60%. Sample 7am horizon: `#b1bebd` (between spring's golden `#d4b07c` and summer's day-blue `#9dc5e0`). Winter 7am horizon: `#2d2030` (deep twilight). Summer 7am horizon: `#9dc5e0` (full day). All as expected.
- Override at `(hour=18, band='horizon', hex='#ff00ff')`: cell at h=18 reads full magenta inside [18:00, 19:00); neighbors h=17 and h=19 read 50% blend; h=16 / h=20 read pure base. Ramp-in over 15min before 18:00 and ramp-out 15min after 19:00 fade smoothly. Multi-override stacking applies sequentially (intentional — sum-and-normalize available if pathological clustering arises).

**Shader path (unchanged at callsite):** CelestialBodies' `useFrame` still calls `resolveSkyAtMinute(skyChannel, minute, slotMinutes)` and writes the resulting 5-band RGB to shader uniforms. The new resolver builds the 24×5 base mosaic + applies overrides + lerps adjacent hour cols for minute-of-day continuity. No new GPU work; CPU resolution is O(overrides × 24 × 5) per frame — trivial.

**Phase B (next):** Wren's artistic deviation pass on winter / spring / autumn (summer is already lovely; the procedural seed for summer matches the existing hand-painted look exactly). Edits `ANCHOR_CARDS` constant in `skyGrid.js` only — clean diff, easy to revert per season.

**Surfaced decisions:**

- Migration salvage of summer-card "deviations from procedural" not implemented. LS's current 1-layer summer card IS the procedural seed (sampled from the same `GradientSky` function `proceduralSky.js` extracts), so there are no operator deviations to preserve. If a future Look ships with operator-authored deviation cells, extend `migrateSkyChannel` to compare and emit overrides — left as a future affordance.
- `SKY_DEFAULTS`, `SKY_SLOT_COLUMNS`, `SKY_DEFAULTS_4ANCHOR`, `SKY_FLAT_DEFAULTS`, `getSkyColumnMinutes` removed from `skyGrid.js`. No external consumers grep'd — all changes contained in this commit.
- `scene.json` deliberately NOT re-baked into the commit (Jacob's working tree has unrelated `layerVis` / `design.json` edits that would have ridden along). Existing baked file's legacy `sky.values.{slots}` shape still reads correctly through the new resolver (which sees no `overrides` array → pure procedural mosaic) until a clean rebake.
- `resolveSkyAtMinute`'s `slotMinutes` argument kept in the signature for backward compatibility with the existing CelestialBodies call site, but is unused under the 24-hour grid.

---

## 2026-05-20 — Sky architecture pivot: procedural canon + per-cell overrides (ADR)

**Reverses + replaces** the "Sky Builder authors per-Look 4-anchor matrices" direction recorded in the next entry below ("4-anchor seasonal sky matrix"). After three iterations of architectural growth (4-anchor matrices in `bff87b5`; Preetham composition; per-anchor edit-lock UX), Jacob surfaced the underlying simplification: **the procedural sky shader that originally produced the project's lovely summer card IS the source of truth**, and the operator's authoring surface is per-cell overrides on top, not from-scratch matrix painting.

Concrete sequence of realizations this session:

1. Preetham composition (`final = preetham + juice × (1 - preethamLuma)`) actively fought the painter — operator's authored summer-noon-zenith was attenuated to ~30% strength by the Preetham layer that ostensibly was "supporting" it. Dropped in commit `d6b861b`.
2. The existing summer SKY_DEFAULTS isn't hand-painted from scratch — it's a 22-column-snapshot of the project's original procedural sky shader (the `GradientSky` function in `47c2760^:src/components/CelestialBodies.jsx`), sampled at summer's altitude trajectory through the day. The keyframes (`dawnDeep` / `dawnPeak` / `dawnGolden` / `day` / `duskGolden` / `duskPeak` / `duskDeep` / `night`) are project canon; the summer card is one materialization of them.
3. The other 3 seasons (winter / spring / autumn) follow inherently from the same procedural function, sampled at THEIR altitude trajectories. Winter noon's 28° sun-altitude produces colors that summer reaches at ~8am — automatically, because the procedural function captures the altitude→color relationship that's true year-round.
4. The whole "seasonal" concept is internal — operators never author 4 separate matrices; they paint per-cell overrides on top of the procedural canon, which renders today's-sky every day based on today's altitudes.
5. The grid should align to **24 uniform clock-hour columns** (not 22 editorial waypoints) because the override-buyer's mental model is clock time ("Sponsor the sky at 7pm"), not SunCalc waypoint subdivisions.
6. Overrides bleed both spatially (Chebyshev distance 1 → 50% blend; brand-halo) and temporally (15-min ramp on either side of the override hour; the override owns its full hour at full strength, fades to procedural before/after).

### The architecture this lands on

```
cartograph/proceduralSky.js  (NEW, kit-level)
  Pure function: f(sunAltitude, isDawn) → { horizon, low, mid, high, sunGlow }
  + GLSL fragment template string (same logic, shader form)
  + keyframe data table (the canonical dawn/dusk/day/night palettes)

cartograph SKY_ANCHOR_CARDS (kit canon, materialized at module-load or build-time)
  ├─ summer  = the existing hand-painted card, remapped from 22-editorial to
  │            24-hourly grid (preserved as Look-level overrides where the
  │            artistic deviation matters; procedural where it doesn't)
  ├─ winter  = procedural-seeded + Wren's artistic deviation
  ├─ spring  = procedural-seeded + Wren's artistic deviation
  └─ autumn  = procedural-seeded + Wren's artistic deviation

Per-day base mosaic
  lerp between flanking anchors by dayOfYear (e.g. May 19 is ~60% from
  spring toward summer). 24 hours × 5 bands = 120 cells of resolved base.

Per-Look override layer
  scene.json schema: `{ sky: { overrides: [{ hour, band, hex }] } }`
  Sparse list. Default Look = empty. Custom-event Looks add a few cells.

Spatial + temporal envelope (when overrides resolve)
  Chebyshev distance:
    d=0 → 100% override
    d=1 → 50% blend with base (vertical band-neighbors + horizontal hour-neighbors)
    d≥2 → no influence
  Temporal envelope:
    Inside override hour [hO*60, hO*60+60) → full strength
    Ramp-in [hO*60-15, hO*60)             → linear 0→1 over 15 min
    Ramp-out (hO*60+60, hO*60+75]         → linear 1→0 over 15 min
    Beyond → no influence
  Combined per-cell weight = spatial × temporal
  Hour distance wraps at midnight (sky has no discontinuity at 23↔0).
  Multi-override stacking: average all influences at a cell.

Sky Builder UI
  24 hour-labeled columns × 5 bands. Each cell either flat (no nearby
  override) or rendered as a horizontal CSS gradient sampling the
  resolver at left-edge / middle / right-edge minutes. Click cell to
  author override at that (hour, band); shift+click to revert to
  procedural. Year-strip drag scrubs the date; mosaic recalculates.
  No anchor-name navigation needed — operator thinks "today's sky"
  not "spring's matrix."
```

### What this collapses

- **`bff87b5`'s 4-anchor matrix schema in scene.json** — replaced with a sparse override list. The 4 anchor cards still exist as kit canon (one source of truth, one location), but they're not per-Look authored data.
- **Wren's queued sub-phase 2 (edit-lock UX)** — irrelevant. No anchor parking; per-cell override is the authoring affordance.
- **Preetham composition** — removed in `d6b861b`. The procedural function alone produces seasonally-correct sky.
- **The seasonal authoring concept in operator UX** — the user never sees "winter card vs summer card" tabs. They see "today's sky," scrubbable by date. The 4 cards are an implementation detail.
- **SKY_HOUR vs SKY_SLOT_COLUMNS** — 24 uniform hourly columns replaces the 22 editorial subdivisions. Better for "sell sky space" addressing (column 19 = sky at 7pm, independent of season).

### What stays

- The kit clock/calendar primitives (`useTimeOfDay` + `useCalendar` bidirectional sync).
- The unified time card / year-strip / 4 season-name click targets in DawnTimeline (now jump-to-date affordances).
- All non-Preetham CelestialBodies features (sun glow, halo, moon disc, constellations, weather modifiers).
- Almanac directive overrides at runtime (sun.tint, lightDome.\*, etc.) — these are weather modulations on top of the resolved sky, independent of the per-Look override system.

### Shader path: procedural hydrates the editable mosaics (locked 2026-05-20)

Decision: **the procedural shader/function HYDRATES the editable mosaics; the mosaic is what renders.** Per Jacob's call.

Concretely, the data hierarchy is:

1. **Procedural function** (`proceduralSky.js`) — math, keyframes, GLSL template. The math layer.
2. **4 anchor card data** (in `skyGrid.js` as kit canon) — hex tables, 24 hours × 5 bands per anchor. Summer = existing hand-painted card remapped to 24-hour grid. Winter / spring / autumn = generated by sampling the procedural function at each season's altitude trajectory, then artistically deviated by Wren. Committed as static hex data.
3. **Per-Look override list** (in `scene.json`) — sparse `{ hour, band, hex }` cells that override the anchor-lerp result.
4. **Per-day resolved mosaic** — runtime computation: identify flanking anchors by `dayOfYear`, lerp between them, apply overrides with spatial Chebyshev (d=0 100%, d=1 50%, d≥2 0%) + temporal envelope (full inside override hour, 15-min ramp on each side).
5. **Shader** consumes the resolved 24×5 mosaic per frame; lerps adjacent hour-cols for minute-of-day continuity. What you author = what renders.

Why this shape:

- **Operators see what they edit.** The Sky Builder grid displays cells that consume the same data the shader does. No "the shader's doing something procedural that I can't influence."
- **Artistic deviation has direct effect.** Wren's tuned winter card flows straight to pixels. The procedural function is the seed, not a competing render layer.
- **Operator overrides honor the spatial/temporal envelope visibly** in the Sky Builder UI (gradient cells) — same envelope the runtime applies.
- **Hydration is one-direction.** Procedural fills the cards at build time (offline / module-load); cards then are static authored data that operators override on top of. The procedural function isn't re-evaluated at runtime; the cards are the contract.

### Wren's next work

Single brief covering: extract `proceduralSky.js`, restore procedural shader path (or pivot to mosaic-driven per the open question), build the 24-hourly Sky Builder grid with CSS-gradient cells, implement the spatial+temporal override resolver, generate the 3 missing seasonal cards (procedural seed + Wren artistic deviation), migrate existing summer card to 24-hour grid, schema downgrade scene.json sky channel. Doc sweep alongside.

Brief drafting pending Jacob's confirm on the open architectural question.

---

## 2026-05-20 — Seasonal sun motion + 4-anchor seasonal sky matrix (ADR — SUPERSEDED 2026-05-20 by entry above)

**Background.** With kit calendar + bidirectional clock/calendar sync shipped (commit `5e98533`), scrubbing the year-strip in the unified time card now reaches CelestialBodies' SunCalc(currentTime, lat, lon) call (CelestialBodies.jsx:986). Sun position responds to year-position immediately — winter sun lower + southerly, summer sun higher, equinox sun on the celestial equator. Daylight duration also varies seasonally because `getDawnWindow(currentTime)` consumes the live Date for SunCalc waypoint computation.

**What still doesn't follow the season:** the sky COLOR. The Sky Builder's 5×22 swatch matrix (`scene.json` sky channel) is TOD-keyed but not date-keyed. December noon in Lafayette Square renders the sun lower in the sky (correct, physics) — but against the same summery sky colors authored for July noon. Visually odd until per-season authoring lands.

### 4-anchor seasonal sky matrix — the direction (parked)

Promote the sky matrix from a single 5×22 grid per Look to **4 layers per Look** — one at each cardinal year-anchor (Winter solstice, Spring equinox, Summer solstice, Autumn equinox). Runtime interpolates between the two flanking anchors based on `useCalendar.dayOfYear()`.

**Editor UX:** the year-strip determines which anchor's matrix is editable. Operator clicks "Spring" → year thumb snaps to Mar 20 → matrix shows + permits editing of Spring's swatches. Drag away from the anchor → matrix becomes read-only preview showing the interpolated tween toward the next anchor. Operator must park on an anchor to edit. Matches the TodChannel pattern (attached-slot = editable; off-slot = interpolated preview).

**Why 4 (not 12).** 4 = the canonical cardinal points of the year astronomically + the 4-season cognitive model + a 4x authoring burden (440 swatches/Look) that's tractable when paired with seed-from-physics. 12 monthly anchors would be 12x burden with most months sitting near their neighbors — not enough additional fidelity to justify the work. 8 anchors (adding cross-quarter days) is the next stop if 4 ever proves coarse, but unlikely.

**Pairs naturally with seed-from-physics.** Each anchor's initial matrix can regenerate from physical sky model + date + dramatize, so operators don't author all 4 from scratch — they regenerate, then deviate.

**Storage shape (proposed):**

```jsonc
// scene.json — sky channel becomes 4 layers
"sky": {
  "values": {
    "winter": { /* 5 bands × N TOD swatches */ },
    "spring": { /* ... */ },
    "summer": { /* ... */ },
    "autumn": { /* ... */ }
  }
}
```

Backward-compat: a 1-layer matrix (today's shape) is treated as one of the four (probably autumn, given LS's current authoring leans warm-cool-mixed) until the other three are authored.

**Where the work lives:** Cartograph. Schema + Sky Builder UI + runtime interpolation in CelestialBodies (or wherever the sky shader reads the matrix). Cartographer coordinator maxibrief drafted at `scratch/handoff-2026-05-20-cartograph-4anchor-seasonal-sky.md`.

**What this unlocks:** sky color responds to year-strip scrubbing. Combined with the already-shipped seasonal sun motion, "December noon" reads as cold winter light *with cold winter sky*. Custom-event Looks (Valentine's pink horizon, Cardinals red zenith) become deviations on their season's anchor, not from-scratch authoring.

---

## 2026-05-20 — Kit-level clock + calendar anchor (ADR, in flight)

**Decision direction (in flight, not yet shipped):** time-of-day AND date/season are kit-level primitives. ONE anchor, ONE pump, N consumer UIs. No per-helper anchors.

**Why this matters now.** The seed-from-physics sky direction (above-this-entry, parked) needs `dayOfYear` to drive seasonal sun-path. Arborist's seasonal tree variants (winter bare, fall colors, etc.) need the same. Meteorologist's `whenBlock.season` matching in the Almanac evaluator needs it. Three helpers, one piece of state — must be shared or it drifts.

**The shape:**

```
src/hooks/
  useTimeOfDay.js          (exists — kit primitive, owns current minute-of-day,
                            isLive flag, scrub semantics)
  useCalendar.js           (NEW — owns current date, day-of-year, season)

src/components/
  ClockCalendarPump.jsx    (NEW — when mounted in live mode, ticks both stores
                            from wall time. Production scenes mount; authoring
                            tabs skip + let scrub UIs drive instead.)

# Each helper hosts its own scrub UI over the shared state:
src/cartograph/   — DawnTimeline (exists, TOD scrub) + DateScrubber (NEW, date scrub)
src/meteorologist/— DawnTimeline mounted in Teacup; Condition editor honors season match
src/arborist/     — reads useCalendar.season to pick tree variant (future)
```

**The principle:**
- **Shared anchor:** one source of truth per concept (clock; calendar). Lives in `src/hooks/`.
- **Shared pump:** one driver component that ticks the anchor from wall time when in live mode.
- **Per-helper UI:** each helper renders its own scrub affordance over the shared state. UIs aren't shared; the state IS.
- **Live vs. scrub semantics:** anchor carries `isLive`. Production mounts the pump in live mode. Authoring tabs leave the pump off (or mount in scrub mode) — operator drives via scrub UI.

**Rejected alternative:** each helper mints its own clock/calendar store. Drifts the moment two tabs disagree; production would need to multicast to N stores; authoring across helpers becomes incoherent. The activeLookId pattern (one canonical Cartograph store, consumed by Arborist + Meteorologist) is the precedent.

**Phasing (orchestrated by Meteorologist for cross-helper coordination):**

1. **Land `useCalendar` + `ClockCalendarPump`** (kit-primitive baby brief, queued in `scratch/handoff-2026-05-20-kit-clock-calendar-primitive.md`). Document the doctrine.
2. **Cartograph adds `DateScrubber`** next to DawnTimeline. Cross-helper brief to Cartograph coordinator.
3. **Meteorologist consumes useCalendar** in the Condition editor (whenBlock.season eligibility); I do this directly post-step-1, no baby.
4. **Arborist consumes useCalendar** for seasonal tree variant selection. Cross-helper brief to Arborist coordinator. Pairs naturally with their year-round trees work.
5. **Production runtime mounts `<ClockCalendarPump mode="live">`** — Scene.jsx + LafayetteScene.jsx. After 1-4 land.

Cross-tab sync (BroadcastChannel) is a v2 nice-to-have; per-tab independence is fine for v1.

---

## 2026-05-20 — Phase 4b.1 shipped: `<Atmosphere />` raymarched cloud shader

The heaviest single piece of the project landed in one baby commit. `<Atmosphere />` replaces `<CloudDome />` in `CanaryScene` with a volumetric raymarched shader implementing all five photoreal levers per the HANDOFF principles. Uniforms hardcoded to `cumulus_humilis` values; preset-driven binding queued for Phase 4b.2.

**Commit:** `d1c66fe` on `cartograph-looks-pass-ab` (parent `6a3fd29` from Phase 4a).

**Shape:** 3 files. Created `src/components/Atmosphere.jsx` (mount + uniform plumbing + `useFrame` ticker), `src/components/atmosphere-materials.js` (shader factory with inline GLSL template literals). Modified `src/meteorologist/CanaryScene.jsx` to swap `<CloudDome />` for `<Atmosphere />`.

### Levers landed

All five, per the HANDOFF-clouds-day3-clouddome-v2.md "Tune to principles" checklist:

1. **Domain warping** — single-pass 3D FBM domain warp; cauliflower lobes emerge from `worldPos + warpAmp × noise(worldPos × warpFreq)`. CloudDome's 2D math adapted to 3D value-noise on a volumetric lattice.
2. **Vertical density gradient** — smoothstep profile `floor=smoothstep(0,0.1,h) * ceil=1-smoothstep(0.6,1,h)`; cumulus reads as flat-based, not spherical.
3. **Three-tier lighting** — density-gradient `cloudNormal()` via ε-separated samples; `dot(normal, sunDir)` lerps between three colors (sun-side warm, body neutral, shadow-side cool×ambientFloor).
4. **Self-shadowing** — 6-step toward-sun shadow march; `exp(-shadowDensity × shadowStrength)` falloff multiplies lit color.
5. **Silver lining** — Mie forward-scatter at thin sun-facing edges; `smoothstep(0.7, 1.0, vdotS) × edgeFactor × edgeSilver × sunScatter`.

### Notable disclosures

- **`frustumCulled={false}` on the slab mesh.** R3F's auto-cull would drop the slab when the camera is inside the volume at a tilt (e.g. CLOUD CHAMBER's `[0, 200, 300]` looking up to `[0, 600, 0]`). Catching this was real defensiveness; without it the cloud would blink out on certain orientations.
- **`SLAB_BASE_ALT / SLAB_THICKNESS / SLAB_HALF_XZ` exported** so `<boxGeometry args>` and `uSlabMin / uSlabMax` uniforms share a single source of truth. Good hygiene; saves the next phase from drift.
- **Inlined GLSL as template literals** in `atmosphere-materials.js` rather than separate `.glsl` files. Brief allowed either; inlining is lighter.
- **Option A for sun direction** — hardcoded warm-noon `(0, 0.7, 0.7).normalize()` + `#ffe6c8` / `#9faab8` sky base. `useSceneJson` not imported; `lookId` prop accepted on `<Atmosphere />` for Phase 4b.2 signature continuity but currently unused. Phase 4b.2 wires it.
- **`CloudCoverSeed` retained but neutered** — Atmosphere ignores `useSkyState`, so the Phase-4a seed does nothing. Comes out in Phase 4b.3 alongside the broader CloudDome retirement.

### Self-flagged debug pointer

The baby surfaced an unusually thoughtful potential failure mode in the commit body: **`eps = 30m` in `cloudNormal()` vs `uWarpFreq = 0.001` (1/m → ~1000m noise wavelength).** A 30m step is 3% of one wavelength; the gradient direction should still be right, but **at density edges** (where the FBM-vs-threshold clipping produces a sharp 0-density boundary) one ε-sample can land outside the cloud and read 0, giving a degenerate normal that manifests as flat-color patches. Easy retune if the visual review surfaces this; first place to check if "three-tier lighting" reads as "uniform gray."

### Debug-order primer (for when Jacob eyeballs)

If the cloud doesn't render as expected, debug in this order:

1. **Cloud invisible / empty box** → FBM doesn't cross the `density - (1 - coverage)` threshold. Check FBM range; raw value-noise FBM often returns `[-0.5, 0.5]` not `[0, 1]`, needing a `* 0.5 + 0.5` remap.
2. **Cloud fully opaque sphere** → alpha-accumulation multiplier (`0.005` placeholder) too high. Halve it.
3. **Cloud uniform gray blob** → three-tier blend collapsed. Temporary debug uniform that returns `normal * 0.5 + 0.5` as RGB; if NaN-purple or uniform, `cloudNormal` is broken (eps/wavelength is the candidate fix).
4. **Cloud renders wrong place / disappears at some angles** → slab intersection broken, OR logdepth chunks missing (Atmosphere included them; verify with `console.log` in shader compile).

### Phase 4b.1 verification status

Module compile + dev server + validator all clean. **Visual verification deferred to Jacob's eyes** (HANDOFF checklist items 1–5 + 9). Phase 4b.2 brief should NOT be drafted until this verification passes — TodChannel binding is meaningful only if the shader works.

### What's queued

- **Phase 4b.2 (next)** — TodChannel uniform binding. Replace hardcoded uniforms with per-frame `resolveGroupAtMinute(activePreset.params[paramKey], currentMinute)` reads. Slider scrubs in Teacup's right rail visibly affect the viewport. Animated channels lerp between keyframes.
- **Phase 4b.3** — Retire `CloudDome.jsx` + `SpriteClouds.jsx` per `STAGE_MIGRATION.md`. Swap production mount sites. CloudCoverSeed comes out. HANDOFF-clouds-day3-clouddome-v2.md retires.
- **Phase 3b** — Promote directive numerics to TodChannel + add cloud capabilities + per-cloud-in-condition expression flags. Lands after 4b so the temporal modulation is visually validatable.
- **Phase 5** — Fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery + mobile quality tier + multi-preset blending + camera orbit.

### Lessons that didn't make it to memory yet

- **Prescriptive briefs work for shader sprints.** Phase 4b.1's brief was significantly more prescriptive than Phases 1–4a — explicit uniform list, code-shape sketches per lever, fallback path if all five didn't land in one session, debug-order primer. Result: all five levers landed cleanly in one commit with no scope drift. Inverse-proportional: the more variance the work has, the more prescriptive the brief should be.
- **`frustumCulled={false}` is a class of fix.** Any time geometry is bigger than expected for its position OR the camera is inside the geometry, R3F's auto-cull will misbehave. Worth keeping in mind as a candidate when geometry "should be visible" but isn't.

---

## 2026-05-19 EOD — From zero to viewport in one day (Phases 1 → 4a)

A single planning + execution arc took Meteorologist from "five docs and a validator" to "standalone app with both authoring surfaces live + viewport rendering." Five commits, four baby agents, two architectural reversals, and five new memory entries. End-of-day state captured in `README.md`'s Status section.

### What shipped

| Commit | Phase | Scope |
|---|---|---|
| `0330a3e` | doc structure | Excised Meteorologist content from cartograph docs; introduced the quartet (ARCHITECTURE / BACKLOG / NOTES) |
| `b5accb3` | doc structure | `INTERFACE.md` + standalone-shell reversal (see entry below) |
| `47c5de0` | **Phase 1** | Scaffold + read-only library views (`/meteorologist.html` + serve.js port 3335) |
| `95bad99` | **Phase 2** | Teacup workstage + 13 cloud-param TodChannels (schema relaxed to `oneOf [number, animatableValue]`; existing presets migrated) |
| `5fd8f78` | Phase 2 chrome | Glass-panel + section-heading on the cards (fixed by importing `src/index.css` instead of tokens-only — see memory `feedback_kit_helper_css_import_index_not_tokens`) |
| `98f3781` | **Phase 3** | Condition editor (When + Directive + Clouds-in-condition + per-condition Revert via `almanac.defaults.json`) |
| `6a3fd29` | **Phase 4a** | CanaryScene viewport (sky-from-active-Look + hero tree + flat ground + placeholder CloudDome) |

### Architectural reversal: in-Stage → standalone shell

Earlier in the day the SPEC's locked decision *"Authoring location: Inside Stage … NOT a separate `/meteorologist` app"* was reversed. The original rationale (don't reproduce Stage's sky stack) collapsed once it became clear that Meteorologist could **consume** Stage's published `scene.json` artifacts via the existing `<CelestialBodies>` consumer, rather than reproduce them. The full reversal entry is the next section down (with the prior in-Stage entry preserved-and-marked-SUPERSEDED).

### Vocabulary landed

- **Teapot** (cloud preset library, 52 entries, primary unit of Teapot mode)
- **Teacup** (per-cloud workstage)
- **Conditions** (weather situations, 16 entries — internally still `almanac.json` for schema continuity)
- **Condition editor** (per-condition workstage)
- **CLOUD CHAMBER / GROUND** (two slot tabs for the viewport)

### Memory entries created today

All under `~/.claude/projects/.../memory/`:

1. `feedback_kit_helper_css_import_index_not_tokens.md` — new helpers must import `src/index.css`, not just `src/tokens/design.css`, to get utility classes.
2. `feedback_absence_means_inherit_in_authored_blocks.md` — UI needs engagement toggles + autosave needs empty-parent pruning when the schema has "absent → inherit" semantics.
3. `feedback_json_stringify_loses_handauthored_format.md` — `JSON.stringify(obj, null, 2)` reformats compact arrays on first PUT; mitigate via immutable `*.defaults.json` sibling.
4. `feedback_stash_isolate_per_file.md` (amended) — added "check `git status` for STAGED state before commit, not just working-tree diff" after Phase 4a baby caught a 10-file pre-staged index slip and self-recovered.

### Disclosure trail (load-bearing additions across the arc)

Each baby agent surfaced its scope-drift cleanly. Notable ones that became architecture:

- **Phase 2:** `_flushPendingSaves()` primitive (flush debounced autosave before any preset switch). Generalized in Phase 3 to drain both preset + rule timers.
- **Phase 2:** Cloud pulldown filtered by `kind` (cloud↔cloud, fog↔fog) — prevents nonsense cross-kind selection.
- **Phase 3:** Engage/off toggles on directive fields (absent vs zero distinction). Empty-parent pruning in `setRuleField`. Orphan preset ids render in red. All three → memory entry above.
- **Phase 4a:** `CloudCoverSeed` one-shot to make CloudDome visible (useSkyState defaults to 0 = empty sky); disappears in Phase 4b when `<Atmosphere />` reads from preset params directly.

### What's queued

Per `BACKLOG.md` and `README.md` Status:

- **Phase 4b.1** — `<Atmosphere />` v3 raymarched shader with 5 photoreal levers, statically bound to one test preset (`cumulus_humilis`). The biggest single piece of the project.
- **Phase 4b.2** — TodChannel uniform binding: scrubbing a slider visibly affects the viewport.
- **Phase 4b.3** — Retire `CloudDome.jsx` per `STAGE_MIGRATION.md`; production swap.
- **Phase 3b** — TodChannel promotion of directive numeric fields + cloud capabilities + per-cloud-in-condition expression flags. After 4b lands so the temporal modulation is visually validatable.
- **Phase 5** — Fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery + camera orbit controls.

Briefs for Phases 1-4a are in `scratch/handoff-2026-05-19-meteorologist-phase-{1,2,3,4a}-*.md`. Phase 4b.1 brief is not yet drafted; tomorrow's first orchestrator task.

### Lessons that didn't make it to memory

- **The right phasing emerged in conversation.** Phase 4 nearly became "one big Atmosphere phase"; splitting into 4a (architecture proof with CloudDome placeholder) + 4b.1/4b.2/4b.3 (shader / binding / retirement) only landed after thinking through what a baby's commit looks like at each step. The smaller the unit, the cleaner the verification — and shader work has the highest variance, so isolating it minimizes blast radius.
- **The standalone-shell reversal wasn't trivial.** What looked like "just change the housing" required patching SPEC.md's locked-decisions table, rewriting ARCHITECTURE.md §1 + adding §2 (consume-from-Stage), reframing INTERFACE.md, and documenting both the new direction and the SUPERSEDED prior direction in NOTES.md. Architectural reversals are cheap in conversation, expensive in docs — but doing the docs first paid off (every subsequent baby read the new state, not the old).

---

## 2026-05-19 — Reversal: in-Stage editor housing → standalone shell

**Reversed:** the prior locked decision *"Authoring location: Inside Stage, triggered from Sky and Light → Clouds row → 'launch meteorologist.' NOT a separate `/meteorologist` app"* (recorded below in the 2026-05-18 entry "In-Stage editor housing").

**New decision:** Meteorologist runs as a **standalone app at `/meteorologist.html`**, mirroring Arborist's shape. Stage retains a Clouds TodChannel row in Sky & Light (per-Look preset-id authoring) plus a "launch meteorologist →" deep-link, but the Meteorologist authoring shell is its own page.

**Why the prior rationale dissolved.** The in-Stage decision was driven by *"the Teapot author needs clouds rendered against a real sun + sky gradient + post-FX, and reproducing that stack outside Stage would be duplication + parity-drift risk."* That's a sharp concern about *reproducing* — but Meteorologist instead **consumes** Stage's published `scene.json` artifacts and mounts the same shared `<CelestialBodies>` consumer Stage and Preview already mount. There is no reproduction; the sky is real, sourced from Cartograph's bake, no fork. With consume-not-reproduce as the boundary, the original concern doesn't apply.

**What changed in the design surface during the planning session that produced this reversal.** A long planning conversation (2026-05-18 evening) iterated through layout questions and surfaced:

1. **Vocabulary lands as Teapot | Conditions.** Two co-equal top-level libraries, not nested. The per-cloud workstage is a "Teacup." Schemas keep internal names (Almanac stays Almanac in code); UI uses operator-facing vocabulary.
2. **Slot tabs are CLOUD CHAMBER | GROUND**, mirroring Arborist's slot tabs. Cloud Chamber for tuning shape; Ground for verifying scale against a hero tree.
3. **The TOD card is the right-rail topper in both modes.** Reuses `src/cartograph/TodChannel.jsx` unchanged; imports `src/tokens/design.css` for the shared palette. Same primitive, no copy.
4. **Every cloud-shader parameter is a TodChannel.** 13 params × 7 TOD slots per cloud = ~91 authored values per Teapot entry, sparsely filled. Autosave-on-edit; no Save button, anywhere.
5. **Rain / snow / lightning are modifier flags, not species or variants.** Capabilities live on the cloud preset; expression live on the per-cloud-in-condition config in the Condition editor.
6. **Conditions ship as editable + revertable presets** (same pattern Cartograph uses for material colors, TOD curves, etc.). Per-condition Revert restores ship defaults.
7. **The canary scene** swaps from the legacy 4-way-corner toy to a purpose-built `CanaryScene.jsx` (flat ground + one fancy hero tree + imported Look sky). The hero tree is intentionally a high-LOD asset we wouldn't ship in a populated scene — Meteorologist gets to spend GPU budget here because there's exactly one tree.
8. **The Look picker imports Stage's sky.** The active Look's published `scene.json` feeds `<CelestialBodies>` — switching Looks swaps the sky envelope. Same Teapot edit can be evaluated under multiple Looks.

`INTERFACE.md` (introduced this session) is the canonical layout reference; `ARCHITECTURE.md §2` documents the consume-from-Stage pattern; `SPEC.md`'s locked-decisions table was patched in this commit.

**What survives unchanged.** The schemas, the validator, the pipeline scripts, the runtime contract (`<Atmosphere />` is still the eventual v3 consumer of `presets.json` + `almanac.json`), the v1 CloudDome shipper, the SC.6 coupler scaffolding from 2026-05-13, the entire spade-work inventory in `BACKLOG.md`. The reversal is about the editor's housing, not about what gets built.

---

## 2026-05-18 — Doc structure promoted to standalone

Meteorologist's documentation was promoted to a standalone quartet (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, plus topical addenda `CANON.md` + `STAGE_MIGRATION.md`). Previously, the spade-work inventory, v1 cut decision, weather-pack roadmap, and SC.6 ship-history lived inside `cartograph/BACKLOG.md`. The cartograph BACKLOG retains a one-line pointer plus the SC.6 ship-line (load-bearing for the slab-completeness narrative); everything else moved here or to `BACKLOG.md`.

Rationale: Meteorologist is its own helper app per the publish-loop pattern. Treating it as a cartograph subsection blurred the helper boundary and made the cartograph BACKLOG harder to navigate. Standalone docs match Arborist's shape (and Cartograph's own).

---

## 2026-05-13 — SC.6: Meteorologist clouds shipped (coupler scaffolding)

**Shipped in commit `4176340`** as part of the Slab Completeness sweep.

Coupler scaffolding installed without building the v3 `<Atmosphere />` runtime:

- `scene.clouds: {preset, overrides}` channel baked by `bake-scene.js`
- `src/lib/almanac-eval.js` evaluator interface — pure function `selectDirective(weather, almanac, presets, override)`, no production consumer yet (forward-compat for v3)
- `public/clouds/{presets,almanac}.json` continues to ship — the earlier cleanout plan's "strip" verdict was reversed

v1 keeps procedural `CloudDome.jsx` as the actual production renderer; no operator UI in v1.

**Parity audit clean** — `CloudDome` mounted identically across `Scene.jsx` / `CartographApp.jsx` / `PreviewApp.jsx` (no fork).

The 12/12 self-test from the SC.6 session lived in an ad-hoc node REPL — see BACKLOG item 4 for the move into `src/lib/__tests__/`.

---

## 2026-05-13 — Strip-vs-wire decision (closed: wired)

**Question.** `public/clouds/{presets, almanac}.json` were published but never consumed in production; `CloudDome.jsx` was fully procedural. Per the slab-completeness principle (memory `project_slab_carries_full_authored_product`):

- If the Sky & Light clouds panel authors anything, the slab must carry it → wire `<Atmosphere />` per `README.md`.
- If not, strip the panel — don't ship authored-but-unconsumed UI.

**Resolution.** Wired. SC.6 installed the channel + evaluator + bake path; the artifacts continue to ship. The v3 `<Atmosphere />` runtime remains the eventual production consumer; until it lands, `CloudDome` does the rendering and the channel sits forward-compatible (consumers ignore unknown fields per the bake's additive contract).

This reversed the earlier (pre-2026-05-13) cleanout plan, which had a "strip" verdict in deliberation. Reasoning that flipped it: the Sky & Light card is shipping clouds-row authoring regardless; the operator's mental model already treats clouds as part of the authored product; the channel scaffolding is cheap; future Meteorologist work plugs in mechanically. The opposite path — strip now, re-add later — would have meant tearing out and re-installing the bake channel + evaluator twice.

---

## In-Stage editor housing (architectural decision — SUPERSEDED 2026-05-19, see top of file)

> ⚠ **Superseded.** This decision was reversed on 2026-05-19; Meteorologist now runs as a standalone app at `/meteorologist.html`. The entry below is kept for posterity — it documents the rejected alternatives that were considered when the in-Stage decision was first locked, and the reversal rationale at the top of this file explains why the consume-from-Stage realization invalidated it.

Meteorologist has **no separate app shell** at `/meteorologist.html`. Its authoring UI lives inside Cartograph Stage's Sky & Light card.

Rejected alternatives (do not re-litigate unless circumstances meaningfully change):

- **Standalone `/meteorologist.html` shell** with its own three-mode editor (Library / Almanac Editor / Fake-weather). Rejected because reproducing Stage's sun-position + sky-gradient + post-FX stack inside the shell would duplicate code and create parity-drift risk against the very rendering context the Teapot author needs to see clouds against.
- **Three-tier Designer/Stage/Preview split internal to Meteorologist**, mirroring Cartograph's. Rejected because there is no Designer-side concern: no spatial geometry, no per-Look styling distinction at the helper level. The "shape vs look" split that justifies Cartograph's two modes has no analog here.

The publish-loop pattern still holds (one helper, canonical artifacts, decoupled runtime consumer); only the editor's housing differs. See `ARCHITECTURE.md §1` for the current statement.

---

## Validator status (as of 2026-05-04)

`npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → `ok: 52 presets, 16 rules`. Last confirmed clean 2026-05-18 during doc-restructure work.

Schemas registered in `pipeline/validate.js`:

- `preset.schema.json` + `presets-file.schema.json`
- `almanac.schema.json`
- `weather-payload.schema.json`
- `directive.schema.json`

Cross-schema invariants enforced in `validateLibrary()`:

1. Preset id uniqueness within `presets.json`.
2. Every almanac directive references presets that exist + are enabled (`enabled !== false`).
3. Cloud-blend weights in any single directive sum to ≤ 1.0001.
