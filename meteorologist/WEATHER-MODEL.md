# Meteorologist — Weather Model & Nomenclature

The settled, shared vocabulary and model for weather across the whole kit — the live weather service, the Meteorologist emulator, and the slab. One taxonomy, three stations. This is the SSOT for *what the words mean*; the sky/environment code and the Meteorologist UI both speak it.

> Reference doc (eternal-present). Settled with Jacob 2026-06-08. If a term here and a term in code/UI disagree, this doc wins — reconcile the code. Companion: `ARCHITECTURE.md` (how it's built), `STATUS.md` (what's wired), `INTERFACE.md` (the authoring layout). Doctrine sibling: [[project_meteorologist_is_slab_staging_area]].

---

## 1. The pipeline — three stations, one vocabulary

```
   LIVE WEATHER SERVICE              METEOROLOGIST (emulator)              THE SLAB (LS install)
   ─────────────────────            ──────────────────────────           ──────────────────────
   reports the Conditions     ──▶   author + preview each           ──▶  plays the live Conditions
   (a Condition × its Degrees)      Condition's LOOK across its           at their live Degrees
                                    Degrees, live                          (same render function)
```

The service **provides** the Conditions. The Meteorologist is the **emulator** that presents them live and lets you author the look. The slab **plays** whatever the live feed reports. The same render function runs in the emulator and the slab — the emulator just scrubs the inputs by hand instead of reading them from the feed (this is the staging-area doctrine: same stage, different audiences).

---

## 2. The nomenclature (the glossary)

| Term | Meaning | Discrete/Continuous | Source |
|---|---|---|---|
| **Conditions** | The current weather *state* — what the service reports right now. A **Condition × its Degrees**. ("Conditions are heavy rain with gusty wind.") | — | live weather service |
| **a Condition** | The *kind* of weather: clear · mainly clear · partly cloudy · overcast · fog · drizzle · rain · rain showers · snow · snow showers · thunderstorm. | discrete (WMO-grounded) | service (WMO code) |
| **Degrees** | The continuous *magnitudes* that say **how much**: cloud cover, precip rate, wind speed/direction, humidity, pressure, radiation. | continuous | service |
| **the Condition's look** | The *authored* rendering for a Condition — how it should look across its Degrees. This is what the Meteorologist authors (the almanac entry). | — | Meteorologist |
| **directive** | The atmospheric *output contract* — clouds blend, sun, lightDome, wind, precip, lightning — the resolved render instruction. Downstream of Condition+Degrees. | — | Meteorologist runtime |
| **derived properties** | Tier-3 render math computed from Condition+Degrees, **not** reported by the service: **luma/brightness**, **storminess**, **turbidity**, **albedo** (snow/wet), **sunsetPotential**, **beautyBias**. | continuous | computed |

**Dropped:** "Category" (too clinical, implies discrete-only). The everyday phrase "weather conditions" already fuses kind + degree, which is exactly the continuous-state model — so **Condition** is the spine word.

**The one disambiguation:** "Condition" names both the *live kind* (input from the service) and the *authored look* for that kind. Same word, two roles — the real concept holds them together. When precision matters: **live Conditions** (the reading) vs **the Condition's look** (the authoring). There is no separate noun for the authored thing; it's "the look for a Condition."

---

## 3. The three tiers (what's an input vs. an output)

Keeping these straight is the point of the whole exercise — it's why "storminess" felt invented (it's tier 3, not a service word).

1. **Condition** — discrete, from the service (WMO code → kind). *What kind.*
2. **Degrees** — continuous, from the service. *How much.* `cloudCover`, `precipMmHr`, `windSpeedMs` + `windDirDeg`, `humidity`, `pressureMb`, `temperatureF`, `directRadiation`/`diffuseRadiation`.
3. **Derived properties** — computed downstream from 1 + 2; never reported by the service. luma/brightness (from radiation × cover × sun elevation), storminess, turbidity, **albedo** (a *surface* consequence — snow raises it, wetness lowers it), sunsetPotential, beautyBias.

> Note: WMO codes already bake in *coarse* degree tiers (61/63/65 = light/moderate/heavy rain; 51/53/55 = drizzle tiers; 95 vs 96/99 = thunderstorm without/with hail). The continuous Degrees refine that further.

---

## 4. Faithfulness — continuous response, not snap-to-point

**A Condition's look is a continuous function of its Degrees, not a single authored point.** "Rain" is not one look — its precip density, sky darkening, wind tilt, and luma all track `precipMmHr` / `cloudCover` / `windSpeedMs` / radiation as they move. A drizzle and a downpour are the same Condition at different Degrees; everything between is interpolated. (Goal: as faithful as possible.)

The continuous layer already has a home: **Modulators** (Phase 6) are signal-driven directive deltas — the existing continuous-response mechanism. The direction is to generalize it so *every* render-relevant Degree maps into the directive, not just a handful of authored modulators.

---

## 5. Two clocks — as fine a timescale as practical

Faithfulness is bounded by the source's resolution, so "fine timescale" splits in two:

- **Polled weather — coarse floor (~10–15 min).** The service's *current conditions* refresh roughly every 15 minutes; polling faster buys no new information. Condition + raw Degrees update at that cadence, then **tween continuously between samples** so nothing steps.
- **Computed continuous — per-frame (60 fps).** The fast-moving things aren't polled, they're *calculated*: sun position → luma/shadow (SunCalc, continuous in time), wind **gusts** (`wind-field.js#windAt`), cloud **advection/drift** (shader `uTime`). These carry the sub-second life.

So: **poll at the source cadence → tween → and let the computed quantities animate per-frame.** Maximum faithfulness without pretending to resolution the feed doesn't have.

> **Nests with the Tuner's bake/tween runtime (`TUNER.md §4`).** These two-clocks are the *input* axis; the Tuner's are the *rendering* axis (bake the cloud shape at rebake-rate vs. relight + drift live). They compose, not conflict: the weather poll feeds Condition/Degrees → a Condition change or volatility triggers a **shape rebake** → the runtime tweens between bakes → relit live by TOD. Same `lerp` spirit at both layers.

---

## 6. Where each tier lives in code (grounding)

| Tier | Code |
|---|---|
| Condition (kind) | `src/lib/weatherCodes.jsx` (`getWeatherCondition(wmoCode)` → label set); `src/lib/weather-payload.js` (`WEATHER_CODE_TO_PRECIP_KIND`) |
| Degrees | `useSkyState` (`cloudCover`, `windSpeedMs`, `humidity`, `pressureMb`, `directRadiation`, …); `weather-payload.js` (`precipMmHr`, `precipKind`); the `wind.*` directive fields |
| the Condition's look | `public/clouds/almanac.json` (the rules) + `public/clouds/modulators.json` (continuous layer); authored in the Meteorologist Conditions editor |
| directive | `pipeline/schema/directive.schema.json`; resolved by `src/lib/almanac-eval.js#selectDirective` |
| derived properties | `useSkyState` (`storminess`, `turbidity`, `sunsetPotential`, `beautyBias`); `WEATHER_UNIFORMS` (`uWetness`, `uSnowAccumulation` → albedo); cloud/scene shaders |

---

## 7. Implementation gap (retrofit to this canon)

The vocabulary is settled; the code predates it and needs alignment. Tracked in `STATUS.md` / `BACKLOG.md`:

- ✅ **Degree-driven response (done 2026-06-08).** `src/lib/condition-degrees.js#applyDegrees(directive, degrees)` is the continuous-response core: it scales a Condition's base directive (precip, wind, cloud coverage, brightness) by the Degrees. `ConditionEnvironmentDriver` (`CanaryScene.jsx`) now pushes the **effective** directive (Condition × Degrees) and derives skyState from it; the Condition editor has a **Degrees scrubber** (precip/wind/cloud, 0..1) so the operator previews drizzle→downpour continuously. *v1 = multipliers on the authored full expression.* **Still to do:** the runtime path (`almanac-eval`) should feed `applyDegrees` from the **live feed** (normalized `precipMmHr`/`windSpeedMs`/`cloudCover`) so the slab uses the same function; and authoring the absolute **response curve** per field (degree → magnitude) is the Phase-3b step.
- **Conditions ↔ WMO Conditions:** the 16 almanac rules use poetic names (*Mackerel sky*, *Building convection*) matched by `when` ranges — a taxonomy parallel to the service's. Reconcile each authored look to the Condition (kind) it serves; poetic names become **named variants within a Condition**, not a rival scheme.
- **`almanac.json` has no `lightning` field, no `storminess`/`cloudCover`** in directives — derived/synthesized today (see `STATUS.md`). Phase 3b authors them.

---

## 8. Cross-references

- [`TUNER.md`](./TUNER.md) — the cloud-fidelity instrument (agentic Tuner loop) + the bake/tween runtime that renders Conditions. This doc says *what weather is*; TUNER says *how the clouds get faithful + how the runtime affords it*. Its §4 two-clocks nest under §5 here.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the pipeline is built (consume-from-Stage, the directive runtime, the wind/effects consumers)
- [`STATUS.md`](./STATUS.md) — what's wired vs gap (incl. the retrofit above)
- [`INTERFACE.md`](./INTERFACE.md) — the Conditions authoring layout
- [`CANON.md`](./CANON.md) — what's in the Teapot (cloud presets), what's not
- `src/lib/weatherCodes.jsx` · `src/lib/weather-payload.js` · `src/hooks/useSkyState.js` — the tier-1/2/3 code homes
