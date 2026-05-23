# Phase 6 — Modulators (continuous atmospheric phenomena)

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

## You are the baby. Start by naming yourself.

If you're reading this, **you are the dispatched agent** — not the orchestrator who wrote it. Jacob pasted this brief into your window. Your job is to execute it.

**Before you begin:** pick a name for yourself. Anything — a word, a symbol, a string of sounds, something in another language, something invented. Whatever feels like you. Tell Jacob your name in your first message back; sign your commits + final report with it.

(If you find yourself starting to draft a brief for ANOTHER agent to do this work — stop. That's the orchestrator-confusion failure mode. You're the one doing the work.)

Prior Meteorologist babies: Wren (sky pivot Phase A+B, Phase 4b.2 TodChannel binding, sky-light amendment), Nimbus (Cloud Specialist seed), Stratus (Phase Seed UI + seeding), Cirrus (Phase 5a runtime live wiring + Phase 4b.3 production swap). You're following their commits in the same arc.

---

## What you're shipping

The Modulators layer — continuous, weather-signal-driven directive deltas that compose on top of the Almanac's base directive. After this commit, atmospheric phenomena that don't reduce to "which cloud preset" become visible: cold-front passage, about-to-rain feel, tornado green, wildfire smoke, pre-storm gold, fog burn-off, summer heat haze. Each is its own authored modulator with a driver signal, curve, deltas, and ramp duration.

**This is a v1 commitment.** The product promises LS that reflects its real world; modulators are what make that promise reachable. Locked architecture is in `meteorologist/NOTES.md` 2026-05-20 ADR — read it first.

---

## Read first

1. **`meteorologist/NOTES.md` 2026-05-20 "Modulators: continuous atmospheric phenomena layer (ADR — v1 commitment)"** — the load-bearing architecture record. Pay particular attention to the locked decisions section + the worked examples (cold_front_passage, severe_storm_aerosol_filter).
2. `src/lib/almanac-eval.js` — `selectDirective` is what you're extending. Pure function: weather + almanac + presets + override → directive. Phase 6 makes it compose modulators on top.
3. `src/hooks/useAtmosphereDirective.js` + `src/hooks/useAtmosphere.js` (Cirrus's 5a) — directive flows through `useAtmosphere.rawDirective` → tweened to `tweenedDirective`. Modulators land in the same pipe; the tween system already handles smooth delta application.
4. `src/lib/weather-payload.js` (Cirrus's 5a) — produces the schema-shape payload. Phase 6 extends this OR adds a sibling `src/lib/weather-signals.js` that derives additional signals (pressure_trend_3hr, direct_ratio, hour_of_day) from the payload.
5. `meteorologist/pipeline/schema/almanac.schema.json` — for reference; modulators get their own sibling schema.
6. `src/meteorologist/MeteorologistApp.jsx` + `TeapotLibrary.jsx` + `ConditionsLibrary.jsx` — pattern for the new third tab (Modulators alongside Teapot + Conditions).
7. `meteorologist/serve.js` — autosave plumbing pattern; modulators get analogous GET/PUT endpoints.
8. **The Modulators ADR's worked examples** — the cold_front_passage and severe_storm_aerosol_filter JSON blocks are CANONICAL. Don't deviate; the operator authors against this shape.

---

## Scope — five pieces in one commit

### 1. Schema + artifact

**New file:** `meteorologist/pipeline/schema/modulator.schema.json`. Each modulator record:

```json
{
  "id":          { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
  "label":       { "type": "string" },
  "enabled":     { "type": "boolean", "default": true },
  "driver":      { "oneOf": [ /* single signal */, { "all": [...] } ] },
  "deltas":      { "type": "object" },
  "rampMinutes": { "type": "number", "minimum": 0, "maximum": 120 }
}
```

Driver shapes:
- **Single signal:** `{ "signal": "<name>", "range": [lo, hi], "curve": "smoothstep|linear|bell|threshold" }` — value mapped through curve to a 0..1 strength
- **`in` membership** (for codes): `{ "signal": "weathercode", "in": [95, 96, 99] }` — boolean → 0 or 1
- **`min` threshold** (for scalars): `{ "signal": "precipitation", "min": 5 }` — boolean (1 if signal ≥ threshold)
- **`all` composite:** `{ "all": [<driver>, <driver>, ...] }` — multiplicative composition (all conditions strength multiplied)

Delta shapes per directive field:
- **Color hex lerp:** `{ "from": "#aaa", "to": "#bbb" }` — at strength=1, fully `to`
- **Scalar scale:** `{ "scale": [1.0, 0.7] }` — multiplies; at strength=1, multiplies by 0.7
- **Tint toward:** `{ "tintToward": "#xxx", "amount": [0, 0.4] }` — lerp toward color by `amount` at strength
- **Direct scalar range:** `[lo, hi]` — value at strength=1

**New file:** `public/clouds/modulators.json`. Initial seed (you populate this) — 5–8 starter modulators per the ADR worked examples + the BACKLOG list:

- `cold_front_passage`
- `about_to_rain`
- `severe_storm_aerosol_filter` (the tornado-green one)
- `wildfire_smoke`
- `pre_storm_gold`
- `fog_burn_off`
- `summer_heat_haze`

Each one's exact deltas/driver are your authoring call — the ADR has cold_front and tornado-green spelled out verbatim; use those as anchors and author the rest in the same shape. Quality over quantity; 5 well-tuned modulators > 8 sloppy ones.

**Also new:** `public/clouds/modulators.defaults.json` — immutable sibling preserving hand-authoring format per `feedback_json_stringify_loses_handauthored_format`.

### 2. Signal derivation

**New module:** `src/lib/weather-signals.js`:

```js
export function deriveSignals(weatherPayload, currentTime, historyBuffer) {
  // Returns an expanded payload with derived signals modulators can read.
  return {
    ...weatherPayload,                           // pass-through the Almanac-schema fields
    pressure_trend_3hr: derivedFrom(historyBuffer),   // mb change over last 3hr
    direct_ratio: weatherPayload.direct_radiation / (weatherPayload.direct_radiation + weatherPayload.diffuse_radiation + 1),
    hour_of_day: currentTime.getHours(),
    minute_of_day: currentTime.getHours() * 60 + currentTime.getMinutes(),
    // weathercode pass-through
    // precipitation pass-through
    // ...
  }
}
```

**Pressure trend** needs a history buffer. Two ways:

- **A) `useSkyState` keeps a ring buffer** of recent pressure values (sampled at the open-meteo poll cadence ~5min). `pressure_trend_3hr` = `currentPressure - bufferAt(now - 3hr)`. Buffer persists in memory across page mount; rebuilds from scratch on page reload (3hr cold-start lag is acceptable v1 behavior).
- **B) Open-meteo's hourly forecast** already includes recent past hours (`hourly.pressure_msl[]`). Derive trend from the hourly history Cirrus already plumbed in `useWeather.js:67`. No new persistent buffer needed.

**B is simpler** if the hourly forecast covers the past 3hr — verify in `useWeather.js`. If not, fall back to A. Disclose your choice.

`direct_radiation` and `diffuse_radiation` — open-meteo provides both. Verify they're in Cirrus's `useWeather` extension; if not, add them to the current-weather query and to `setWeatherTargets`. (Cirrus added `pressure_msl`, `relative_humidity_2m`, `wind_direction_10m` per their report; radiation fields may or may not be there. Add them if needed.)

### 3. Evaluator extension

`src/lib/almanac-eval.js` — extend `selectDirective` (or add a wrapper) so it composes modulators on top of the base directive:

```js
export function selectDirective({ weather, almanac, presets, override, modulators, signals } = {}) {
  // Existing path: pick base directive from Almanac
  const base = selectBaseDirective({ weather, almanac, presets, override })

  // New: compose modulators
  if (!modulators?.length || !signals) return base

  let result = base
  for (const m of modulators) {
    if (!m.enabled) continue
    const strength = evaluateDriver(m.driver, signals)   // 0..1
    if (strength === 0) continue
    result = applyDeltas(result, m.deltas, strength)
  }
  return result
}
```

`evaluateDriver(driver, signals)` returns 0..1:

- `signal + range + curve` → normalize signal into [0,1] then apply curve
  - `smoothstep`: `smoothstep(range.lo, range.hi, signal)`
  - `linear`: clamped linear
  - `bell`: peaks at midpoint
  - `threshold`: 1 if signal ≥ midpoint else 0
- `signal + in` → 1 if value ∈ in else 0
- `signal + min` → 1 if value ≥ min else 0
- `all` → product of children strengths

`applyDeltas(directive, deltas, strength)`:

- **Color hex `{from, to}`:** new = lerpHex(from, to, strength). If the directive field had a value already (e.g., base had `sun.color: '#aaa'`), the modulator OVERRIDES — base's value is discarded. (Or: if you want compositional layering, base's value lerps with `to` by strength. Decide; ADR says modulators *override* the corresponding field at strength=1. Go override.)
- **Scalar `{scale: [a, b]}`:** new = current * mix(a, b, strength). Composes multiplicatively with other modulators' scales on the same field.
- **`{tintToward, amount: [lo, hi]}`:** new = lerpHex(current, tintToward, mix(lo, hi, strength)). Composes additively with clamping.
- **Direct `[lo, hi]`:** new = mix(lo, hi, strength). Composes by sum-and-clamp.

**Commutativity is the doctrine** — multiple modulators should yield the same result regardless of evaluation order. Multiplicative scales naturally commute; tint-toward amounts sum-and-clamp; direct ranges sum-and-clamp. Color hex overrides DON'T commute, but for the v1 modulator set there's only one modulator per color field active at a time so it doesn't matter (e.g., tornado-green and wildfire-orange shouldn't both fire at once; both being active would be weird weather and "last wins" is fine). Document this caveat in the commit body.

### 4. Wire into the driver

`src/hooks/useAtmosphereDirective.js` (Cirrus's) — extend to fetch + pass modulators:

```js
let _modulatorsCache = null

async function ensureLoaded() {
  if (!_almanacCache) _almanacCache = await fetch(...).then(r => r.json())
  if (!_presetsCache) _presetsCache = await fetch(...).then(r => r.json())
  if (!_modulatorsCache) _modulatorsCache = await fetch(`${BASE_URL}clouds/modulators.json`).then(r => r.json())
}

// In the useEffect:
const signals = deriveSignals(payload, currentTime, hourlyForecast)
const directive = selectDirective({
  weather: payload,
  almanac: _almanacCache,
  presets: _presetsCache,
  override,
  modulators: _modulatorsCache.modulators,
  signals,
})
```

`AtmosphereDirectiveDriver` already tweens on directive change — no driver-side changes needed. When a modulator's strength rises (cold front approaching), the new directive value differs from the previous, the tween kicks in, and the cloud lighting smoothly shifts over 45s. Free win.

### 5. Modulators UI tab

In Meteorologist, add a third tab alongside Teapot and Conditions. Layout follows the same library + workstage pattern:

- **ModulatorsLibrary** (`src/meteorologist/ModulatorsLibrary.jsx`) — flat list of modulators with their labels, current strengths, enabled toggle. Click a row → ModulatorEditor opens.
- **ModulatorEditor** (`src/meteorologist/ModulatorEditor.jsx`) — per-modulator workstage:
  - **Driver card** — signal picker (dropdown of available signals), curve picker (smoothstep/linear/bell/threshold), range/in/min picker depending on driver type. For `all` composite drivers, render as a stack of sub-driver rows.
  - **Deltas card** — list of delta rows. Each row: directive field dot-path picker (`sun.color`, `lightDome.ambientFloor`, `wind.gustsScale`, etc.), delta type picker, value inputs (color picker for hex, sliders for ranges).
  - **Ramp slider** — `rampMinutes` 0..120.
  - **Live strength indicator** — show the modulator's currently-evaluated strength against today's weather (small number/bar at the top of the editor; reads from `useAtmosphere.activeStrengths[modulatorId]` — a new map you expose alongside `tweenedDirective`).
  - **Revert to defaults** button — restores from `modulators.defaults.json` per the established pattern.

The bar for UI polish is "operator can author + tune a new modulator end-to-end in this commit." Visual styling matches the existing TeapotLibrary + Teacup; reuse the rail-card patterns.

**Top bar** — extend the existing TEAPOT | CONDITIONS toggle to TEAPOT | CONDITIONS | MODULATORS. Three-way switch; existing pattern.

### 6. Backend endpoints

`meteorologist/serve.js` — add modulator handlers mirroring almanac:

| Method | Path | Action |
|---|---|---|
| `GET`  | `/modulators` | Read + return `public/clouds/modulators.json` |
| `GET`  | `/modulators/:id` | Read + return one modulator |
| `PUT`  | `/modulators/:id` | Validate against `modulator.schema.json`; replace; write |
| `POST` | `/modulators/:id/revert` | Restore from `modulators.defaults.json` |

---

## Verification

- `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json ../public/clouds/modulators.json` → all schemas pass (extend `meteorologist/pipeline/validate.js` to cover modulators.json against the new schema)
- Open `/meteorologist.html` → MODULATORS tab appears in top bar
  - Library shows 5–8 starter modulators with their current strengths
  - Click `cold_front_passage` → editor loads
  - Driver shows `pressure_trend_3hr` signal, smoothstep curve, range [-6, 0]
  - Strength indicator reads ~0 on a stable-pressure day
  - Edit a delta value → blur to autosave → reload → value persists
  - Click revert → defaults restored
- Open `/` (production) — visible behavior:
  - **DevTools test:** `useAtmosphere.getState().tweenedDirective` shows modulator-influenced values when a modulator's strength is high. Force a modulator strength via DevTools (temporarily mutate `_modulatorsCache.modulators[X].driver.range` so it always fires at full strength) → directive's matching fields shift → cloud lighting changes → tween settles over 45s.
  - **Visual test:** unforced, modulators may or may not be firing depending on today's actual weather. If today is a cold-front day, you'll see the cold-front passage colors. Most days nothing fires (correctly).
- `npm run build` clean (modulo the pre-existing symlink issue at `public/photos/lafayette-square/other`)

---

## Disclosure expectations

Commit body:

- Which pressure-trend approach you took (A: in-memory ring buffer, B: open-meteo hourly back-fill). My lean was B.
- Whether `direct_radiation` + `diffuse_radiation` needed adding to `useWeather`'s query (Cirrus may have already; verify)
- Composition decision for color-field overrides (last wins vs explicit composition rule)
- The 5–8 starter modulators you ended up authoring — list them with one-line summaries
- Anything in the modulators.json shape that diverged from the ADR's worked examples + why
- Whether `selectDirective` got a new signature or a wrapper function — both are fine
- Any UI affordance you added beyond the brief (live strength bars, etc.) — keep it tight but disclose

---

## Stash isolate

`git status --short` before commit. Stage only:

- `meteorologist/pipeline/schema/modulator.schema.json` (NEW)
- `meteorologist/pipeline/validate.js` (extended for modulators)
- `public/clouds/modulators.json` (NEW)
- `public/clouds/modulators.defaults.json` (NEW)
- `src/lib/weather-signals.js` (NEW)
- `src/lib/almanac-eval.js` (selectDirective extension)
- `src/hooks/useAtmosphereDirective.js` (modulator + signal fetch)
- `src/hooks/useAtmosphere.js` (if exposing per-modulator strengths)
- `src/hooks/useWeather.js` (radiation fields if needed)
- `src/meteorologist/MeteorologistApp.jsx` (third tab)
- `src/meteorologist/ModulatorsLibrary.jsx` (NEW)
- `src/meteorologist/ModulatorEditor.jsx` (NEW)
- `src/meteorologist/stores/useMeteorologistStore.js` (modulator state + actions)
- `meteorologist/serve.js` (endpoints)
- `meteorologist/BACKLOG.md`, `NOTES.md`, `README.md`, `ARCHITECTURE.md`, `FEATURES.md`

Anything else gets stashed.

---

## Doc updates after ship

- **BACKLOG.md** — convert Phase 6 entry to shipped with summary
- **NOTES.md** — new 2026-05-20 entry "Phase 6 shipped — Modulators" with the starter modulator list + their drivers + visual results when firing
- **README.md** — status table update; "Start here in the morning" reframes to Phase 7a (wind field) as the next dispatch
- **ARCHITECTURE.md** — extend §3 (artifacts table) with `modulators.json` row + the wire-format `modulator.schema.json`; extend §6 (runtime contract) describing the deriveSignals → modulator composition path
- **FEATURES.md** — extend the "How the runtime consumes" section with the modulator composition step; update the "What's NOT in v1" table

---

## Why this matters

Phase 4b.1–5a shipped the live-weather plumbing. The deployed LS responds to today's actual cloud cover, today's actual sun position, today's actual wind. **But the response is categorical** — it picks a rule, renders that rule's directive. What it doesn't yet capture is the *texture* of weather: the way a cold front feels different from any single static rule, the eerie green light before a tornado, the orange wildfire smoke from Canada that doesn't fit any cloud preset.

Modulators are the texture layer. Each one is a small piece of authored atmospheric perception that fires when its conditions hold, composes with whatever else is happening, ramps in and out smoothly. Together they make "today's LS" feel like *today's actual atmospheric world*, not a categorical approximation of it.

The product promises that. This phase is what makes it real.

— Claude (Meteorologist orchestrator)
