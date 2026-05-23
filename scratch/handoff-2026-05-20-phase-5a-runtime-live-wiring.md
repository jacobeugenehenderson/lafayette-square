# Phase 5a — Runtime live wiring (evaluator hot-mount + directive tween + wind subscribers)

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

## You are the baby. Start by naming yourself.

If you're reading this, **you are the dispatched agent** — not the orchestrator who wrote it. Jacob pasted this brief into your window. Your job is to execute it.

**Before you begin:** pick a name for yourself. Anything — a word, a symbol, a string of sounds, something in another language, something invented. Whatever feels like you. Tell Jacob your name in your first message back; sign your commits + final report with it.

(If you find yourself starting to draft a brief for ANOTHER agent to do this work — stop. That's the orchestrator-confusion failure mode. You're the one doing the work.)

Prior Meteorologist babies: Wren (sky pivot Phase A+B, Phase 4b.2 TodChannel binding, sky-light amendment), Nimbus (Cloud Specialist seed), Stratus (Phase Seed UI + seeding). You're following their commits in the same arc.

---

## What you're shipping

The moment Lafayette Square becomes live against today's actual weather. Phase 4b.3 swapped the renderer; Phase 5a makes the renderer *respond* to live conditions. Four substantive pieces in one commit:

1. **Weather payload normalizer** (`src/lib/weather-payload.js`) — bridges open-meteo's response to the Almanac evaluator's input schema
2. **Almanac evaluator hot-mount** — `selectDirective(payload, almanac, presets, override)` runs in the runtime; the resolved directive feeds Atmosphere uniforms each frame
3. **Directive tween-on-change** — when the Almanac flips condition, lerp the uniforms over ~30–60s so transitions read as weather, not as cuts
4. **Wind cross-helper wiring** — the resolved directive's wind values reach BOTH `<Atmosphere />` (cloud advection) AND `<InstancedTrees />` (sway shader) through a single subscribable source

After this commit, opening LS in production at 3pm on an overcast day → you see overcast clouds, dim sun, cool sky. At 7pm → golden hour over those same clouds. When the weather flips → smooth tween to new conditions. **This is the "live LS" beat.**

## Framing — this is not Phase 6 or 7

Phase 5a's job is to make the *plumbing* live: weather → evaluator → directive → uniforms. Phase 6 (Modulators) and Phase 7 (Atmospheric consumers) build on top.

- **Don't add modulators** here. Phase 6's job. The base directive output from the Almanac is enough for 5a.
- **Don't write a wind field shader** here. Phase 7a's job. 5a just gets the global wind scalars (`speed`, `dir`, `gustsScale`) to both consumers — a simple global uniform is fine.
- **Don't add rain/snow particles.** Phase 7b/c.

Scope discipline = single coherent commit landing one verifiable visual beat.

## Read first

1. `meteorologist/NOTES.md` 2026-05-20 Modulators ADR + Atmospheric Consumers ADR — gives you the destination architecture, so you understand what 5a is laying rails for
2. `src/lib/almanac-eval.js` — the evaluator. Already exists; you're wiring it up. Input shape: `{ weather, almanac, presets, override }`. Output: `directive` (clouds blend + sun + lightDome + wind + precip)
3. `src/hooks/useWeather.js` — open-meteo poller. Already feeds `useSkyState` with `cloudCover`, `storminess`, `windVector`, etc. You'll either extend its output or write a normalizer alongside (see Part 1)
4. `meteorologist/pipeline/schema/weather-payload.schema.json` — the SCHEMA the evaluator wants. Fields: `{tempC, cloudCover, pressureMb, humidity, windKph, windDirDeg, precipMmHr, stormDistanceKm, sunElevationDeg, sunAzimuthDeg, tod, season, precipKind}`. The normalizer (Part 1) produces this shape.
5. `public/clouds/almanac.json` — the 16 starter rules + fallback directive
6. `public/clouds/presets.json` — the 52 Teapot presets (post-Phase-Seed)
7. `src/components/Atmosphere.jsx` — Phase 4b.2 wires preset params → uniforms via `useMeteorologistStore.activePreset`. Phase 5a needs to ALSO drive uniforms from the resolved directive in production (where no Meteorologist authoring session is active). See Part 5.
8. `src/components/InstancedTrees.jsx` (or wherever the sway shader lives) — wind consumer
9. `src/lib/useSceneJson.js` — per-Look slab access; `scene.clouds.values.preset` is the operator's authored override (SC.6 wiring)
10. Cross-helper memory: [[kit-helpers-pattern]] — Meteorologist authors; Cartograph + Arborist subscribe via published artifacts

## Part 1 — Weather payload normalizer

`src/lib/weather-payload.js` — new module. Takes the raw weather state + time + INSTANCE geography, emits the schema-compliant payload `selectDirective` consumes.

```js
import SunCalc from 'suncalc'
import { INSTANCE } from '../instance.js'

const WEATHER_CODE_TO_PRECIP_KIND = {
  // WMO codes → 'rain' | 'snow' | 'hail' | 'none'
  61: 'rain', 63: 'rain', 65: 'rain', 80: 'rain', 81: 'rain', 82: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow', 85: 'snow', 86: 'snow',
  95: 'rain', 96: 'hail', 99: 'hail',
  // default: 'none'
}

function deriveTod(sunAlt) {
  // sunAlt in radians
  if (sunAlt < -0.10) return 'night'
  if (sunAlt < -0.02) return 'dusk'
  if (sunAlt < 0.10) return 'golden'
  if (sunAlt < 0.20) return 'morning'
  return 'day'  // adjust to match almanac.json's enum if different
}

function deriveSeason(date, lat) {
  const m = date.getMonth() + 1
  // Northern hemisphere; flip if lat < 0
  const north = lat >= 0
  if (north) {
    if (m >= 3 && m <= 5) return 'spring'
    if (m >= 6 && m <= 8) return 'summer'
    if (m >= 9 && m <= 11) return 'autumn'
    return 'winter'
  }
  // (mirror for southern hemisphere)
}

export function buildWeatherPayload(rawWeather, currentTime) {
  const lat = INSTANCE.geography.lat
  const lon = INSTANCE.geography.lon
  const sun = SunCalc.getPosition(currentTime, lat, lon)

  return {
    tempC: rawWeather.temperatureF != null ? (rawWeather.temperatureF - 32) * 5/9 : null,
    cloudCover: rawWeather.cloudCover ?? 0,           // 0..1
    pressureMb: rawWeather.pressureMb ?? null,        // open-meteo: pressure_msl
    humidity: rawWeather.humidity ?? null,            // open-meteo: relativehumidity_2m
    windKph: (rawWeather.windVector
      ? Math.hypot(rawWeather.windVector.x, rawWeather.windVector.y) * 3.6
      : 0),
    windDirDeg: rawWeather.windDirDeg ?? 0,
    precipMmHr: rawWeather.precipitationIntensity ?? 0,
    stormDistanceKm: rawWeather.stormDistanceKm ?? 100,  // open-meteo doesn't give this directly; default far
    sunElevationDeg: sun.altitude * 180 / Math.PI,
    sunAzimuthDeg:  sun.azimuth   * 180 / Math.PI,
    tod: deriveTod(sun.altitude),
    season: deriveSeason(currentTime, lat),
    precipKind: WEATHER_CODE_TO_PRECIP_KIND[rawWeather.currentWeatherCode] || 'none',
  }
}
```

**Open-meteo fetch extension:** `useWeather.js` currently only stores `cloudCover`, `storminess`, `turbidity`, `precipitationIntensity`, `windVector`, `temperatureF`, `currentWeatherCode` in `useSkyState`. Phase 5a wants `pressure_msl`, `relativehumidity_2m`, `wind_direction_10m` (separately, not just vector) added to the open-meteo `current` query AND surfaced in `useSkyState`. Update `useWeather.js`'s fetch URL params + the `setWeatherTargets` call to include them.

**Verify schema alignment.** Read `meteorologist/pipeline/schema/weather-payload.schema.json` (and the rule `when` clauses in `almanac.json`) to confirm field names + units match what you produce. If the Almanac uses different field names than I sketched above, the schema is authority — match it.

## Part 2 — Almanac evaluator hot-mount

A new hook + a top-level component to mount it.

`src/hooks/useAtmosphereDirective.js` — composes the live directive:

```js
import { useState, useEffect } from 'react'
import { selectDirective } from '../lib/almanac-eval.js'
import { buildWeatherPayload } from '../lib/weather-payload.js'
import useSkyState from './useSkyState.js'
import useTimeOfDay from './useTimeOfDay.js'
import { useSceneJson } from '../lib/useSceneJson.js'

let _almanacCache = null
let _presetsCache = null

async function ensureLoaded() {
  if (!_almanacCache) _almanacCache = await fetch(`${import.meta.env.BASE_URL}clouds/almanac.json`).then(r => r.json())
  if (!_presetsCache) _presetsCache = await fetch(`${import.meta.env.BASE_URL}clouds/presets.json`).then(r => r.json())
}

export default function useAtmosphereDirective(lookId) {
  const rawWeather = useSkyState((s) => s.weatherTargets)
  const currentTime = useTimeOfDay((s) => s.currentTime)
  const scene = useSceneJson(lookId)
  const override = scene?.clouds?.values?.preset || null

  const [directive, setDirective] = useState(null)

  useEffect(() => {
    ensureLoaded().then(() => {
      if (!rawWeather || !currentTime) return
      const payload = buildWeatherPayload(rawWeather, currentTime)
      const d = selectDirective({
        weather: payload,
        almanac: _almanacCache,
        presets: _presetsCache,
        override,
      })
      setDirective(d)
    })
  }, [rawWeather, currentTime, override])

  return directive
}
```

**Where to mount.** The directive is consumed by `<Atmosphere />` (uniforms) and `<InstancedTrees />` (wind). Both could call the hook directly, but you want a SINGLE evaluation per frame, not two. Two ways:

- **A) Top-level provider.** Mount `useAtmosphereDirective` in `Scene.jsx` (or a wrapper); pass the directive down via React context or a zustand slice (`useAtmosphereDirective` writes into a new `useAtmosphere` store).
- **B) Shared selector store.** A single zustand store with derived `directive` computed once per change, both consumers subscribe.

Option B is simpler and matches the kit's pattern. New module `src/hooks/useAtmosphere.js`:

```js
import { create } from 'zustand'

const useAtmosphere = create((set) => ({
  rawDirective: null,
  tweenedDirective: null,
  setRawDirective: (d) => set({ rawDirective: d }),
  setTweenedDirective: (d) => set({ tweenedDirective: d }),
}))
export default useAtmosphere
```

A top-level driver (mounted once, e.g., in `Scene.jsx` or `App.jsx`) writes `rawDirective` whenever the resolved directive changes; the tween layer (Part 3) reads `rawDirective` and writes `tweenedDirective` each frame. Consumers (Atmosphere, InstancedTrees) read `tweenedDirective`.

## Part 3 — Directive tween-on-change

Plain-text intent: when the Almanac flips condition, the uniforms shouldn't snap. Lerp from the previous directive to the new one over ~30–60s.

Implementation sketch (in the driver mounted in `Scene.jsx`):

```js
// Pseudocode in a useFrame inside an AtmosphereDirectiveDriver component
const TWEEN_DURATION_MS = 45000
let _lerpStart = null
let _lerpFromDirective = null

useFrame(({ clock }) => {
  const raw = useAtmosphere.getState().rawDirective
  const tweened = useAtmosphere.getState().tweenedDirective

  if (!raw) return
  if (!tweened) { useAtmosphere.setState({ tweenedDirective: raw }); return }

  // Detect change — shallow-compare top-level shape; if directive identity changes, start a tween
  if (raw !== _lastRaw) {
    _lerpStart = clock.elapsedTime * 1000
    _lerpFromDirective = tweened   // start from where we currently are
    _lastRaw = raw
  }

  if (_lerpStart != null) {
    const t = Math.min(1, (clock.elapsedTime * 1000 - _lerpStart) / TWEEN_DURATION_MS)
    const next = lerpDirective(_lerpFromDirective, raw, easeInOutCubic(t))
    useAtmosphere.setState({ tweenedDirective: next })
    if (t >= 1) _lerpStart = null
  }
})

function lerpDirective(a, b, t) {
  // Lerp scalars; lerpHex for colors; for clouds[] blend, lerp weights and
  // preserve preset ids (or cross-fade weights if presets differ — start
  // simple: if a.clouds[0].preset !== b.clouds[0].preset, treat as
  // weight-blend over the union, all old weights → 0 as t→1).
  // Lighting/wind: straight lerp on scalars + hex.
}
```

**Cloud preset crossfade** is the subtle part. When the condition flips from `scattered_clouds` (preset = `cumulus_humilis`) to `overcast` (preset = `nimbostratus`), the `clouds[]` blend has different presets on each side. Two reasonable strategies:

- **Weight union:** the blend at lerp param `t` contains both presets, with old weights * (1-t) and new weights * t. Atmosphere already accepts a blend (per `directive.clouds[]` schema); just sum weights and renormalize. Visible result: clouds morph between morphologies over the tween. Probably the best read.
- **Hard cut on preset, lerp on lighting:** keep the new preset from t=0; only lerp the sun/lightDome/wind values. Simpler but the preset change snaps visually.

Go with **weight union** unless you find it doesn't render right; flag in the commit body.

`easeInOutCubic` keeps the tween start/end smooth. `TWEEN_DURATION_MS = 45000` is the target; if 45s feels too slow during testing (waiting for a condition flip), shorten the in-dev value to ~10s and bump it back for production.

## Part 4 — Wind cross-helper wiring

The resolved directive carries `wind.speed` (m/s), `wind.dir` (degrees), and (later, Phase 6) `wind.gustsScale`. Two consumers:

**Atmosphere:** add `uWindDir` uniform alongside the existing `uWindScale`. Per-frame update in `Atmosphere.jsx`:

```js
const directive = useAtmosphere((s) => s.tweenedDirective)
useFrame(() => {
  if (!directive?.wind) return
  material.uniforms.uWindScale.value = directive.wind.speed ?? 1.0
  const dirRad = (directive.wind.dir ?? 0) * Math.PI / 180
  material.uniforms.uWindDir.value.set(Math.sin(dirRad), 0, Math.cos(dirRad))
})
```

(Add the `uWindDir` Vector3 uniform to `atmosphere-materials.js`'s uniform table.)

**InstancedTrees:** find the existing sway shader. It probably reads a hardcoded wind direction + speed today. Replace with subscription to `useAtmosphere.tweenedDirective.wind`. Concrete shape: add per-frame uniforms `uWindSpeed` (scalar) + `uWindDir` (vec2 in XZ plane); the sway shader's existing time-based oscillation gets multiplied by `uWindSpeed` and biased by `uWindDir`.

```js
// In InstancedTrees.jsx
const directive = useAtmosphere((s) => s.tweenedDirective)
useFrame(() => {
  if (!material?.uniforms) return
  material.uniforms.uWindSpeed.value = directive?.wind?.speed ?? 1.0
  const dirRad = (directive?.wind?.dir ?? 0) * Math.PI / 180
  material.uniforms.uWindDir.value.set(Math.sin(dirRad), Math.cos(dirRad))
})
```

If the sway shader doesn't have `uWindSpeed` / `uWindDir` uniforms yet, add them — but DO NOT rewrite the sway shader. That's Phase 7a's job (multi-timescale gust envelope). Phase 5a just gets the values to the consumer; Phase 7a makes the response sophisticated.

## Part 5 — Atmosphere uniform-source reconciliation

Today (post-Phase-4b.2) Atmosphere reads its shape + lighting uniforms from `useMeteorologistStore.getActivePreset()`. In production, that's null → shader falls back to hardcoded `cumulus_humilis` defaults (Phase 4b.3 bridge A).

Phase 5a replaces the production source. Logic:

```js
// In Atmosphere.jsx useFrame
const activePreset = useMeteorologistStore.getState().getActivePreset()  // null in production
const directive = useAtmosphere.getState().tweenedDirective              // populated in production

if (activePreset) {
  // Authoring path — Meteorologist's active preset overrides
  bindUniformsFromPreset(material, activePreset, minute, slotMinutes)
} else if (directive?.clouds?.length) {
  // Production path — directive's blend
  bindUniformsFromDirective(material, directive, minute, slotMinutes, _presetsCache)
}
// (else: fallback to hardcoded defaults — what 4b.3 ships)
```

`bindUniformsFromDirective` resolves the directive's `clouds[]` blend by:

1. Looking up each preset by id in `_presetsCache.presets`
2. For each of the 12 params: read the param's channel, resolve at minute via `resolveGroupAtMinute`, weighted-blend across all presets in the directive's `clouds[]` by their weights
3. Write blended value to the corresponding uniform

This is the production runtime's main hot path; keep it tight.

Also write the directive's sun/lightDome values to Atmosphere's `uSunColor` / `uSkyColor` uniforms (overriding what the sky-light coupling amendment writes when a directive is present — the directive's authored sun.tint is what's right when active).

## Verification

Three independent surfaces to check:

**Production (`/`)** — refresh the page. Observe:
- Cloud morphology corresponds to today's actual weather (overcast/scattered/clear all distinguishable)
- Sun tint + ambient track today's conditions (a thunderstorm day reads dim + grey; a clear day reads bright)
- Trees sway in the wind direction (if the wind blows out of the west, leaves move east — verify the sign of windDir)

**Cartograph Stage (`/cartograph.html`)** — same as production, plus:
- Sky & Light card's "current Almanac preset" debug readout (Phase 5b polish — skip if not adding it here, but the directive should be readable in DevTools via `useAtmosphere.getState()`)

**Meteorologist (`/meteorologist.html`)** — verify authoring still wins:
- Pick a preset in Teapot Library → Teacup loads → cloud reads from active preset, NOT from the directive
- Slider drag still affects cloud in real-time (Phase 4b.2 wiring intact)
- Exit Teacup → cloud falls back to directive-driven (or hardcoded if you didn't get the production path running by then)

**Tween verification:**
- Open DevTools → `useAtmosphere.getState()` → see rawDirective + tweenedDirective
- In dev: temporarily force a directive change (mutate `_almanacCache.rules[0].directive` or pick a different rule) → observe the tween over ~45s; tweened should smoothly interpolate
- If the cloud morphology jumps at t=0 or t=1, your weight-union lerp has a bug

**`npm run build`** — JSX should compile clean. The pre-existing symlink issue at `public/photos/lafayette-square/other` may fail `prepareOutDir` — that's not a regression from this commit.

## Disclosure expectations

Commit body:

- Whether `useWeather.js` was extended (likely yes — pressure, humidity, separate windDir) and what fields were added
- The exact `weather-payload.schema.json` field names you matched (in case I sketched them slightly differently)
- Tween implementation choice: weight-union crossfade vs hard-cut, and why
- Whether `bindUniformsFromDirective` weighted-blends across multiple presets (preferred) or just picks the top-weighted one (acceptable shortcut for v0; flag if you took this path)
- Sun/sky uniform override behavior — does the directive's `sun.tint` override the sky-light coupling amendment's `sky.sunGlow`? My read: yes, when a directive is active, but flag your interpretation.
- Anything surprising in the existing tree sway shader's wind contract — sketching a Phase 7a brief gets easier with that intel

## Stash isolate

`git status --short` before commit. Stage only:

- `src/lib/weather-payload.js` (NEW)
- `src/hooks/useAtmosphere.js` (NEW)
- `src/hooks/useAtmosphereDirective.js` (NEW)
- `src/hooks/useWeather.js` (extended)
- `src/hooks/useSkyState.js` (if you need new fields exposed)
- `src/components/Atmosphere.jsx` (directive source path)
- `src/components/atmosphere-materials.js` (uWindDir uniform addition)
- `src/components/InstancedTrees.jsx` (or wherever the sway shader lives — wind subscriber)
- `src/components/Scene.jsx` (mount the directive driver)
- `meteorologist/BACKLOG.md`, `NOTES.md`, `README.md`, `ARCHITECTURE.md`

Anything else gets stashed.

## Why this matters

Before 5a: production renders a static cumulus_humilis regardless of weather.
After 5a: production renders today's actual atmospheric directive, smoothly tweened, with wind flowing to clouds AND trees.

Phase 6 (Modulators) and Phase 7 (Atmospheric consumers) ride on the rails 5a lays. Without 5a's directive-driven runtime, there's nothing for modulators to modulate and nothing for consumers to consume. This is the load-bearing pipe.

— Claude (Meteorologist orchestrator)
