# Weather: two states for one sky — superseded 2026-09-26

Retired from `meteorologist/STATUS.md` and `meteorologist/ARCHITECTURE.md` when the directive became
the weather's single source (`src/lib/sky-scalars.js`, `checks/claims-the-light-follows-the-weather.mjs`).

**Why retired.** Jacob saw rain falling in full sun in Provincetown. Rain read the Almanac directive;
the lights, dome and exposure read `cloudCover`/`storminess` that the poller wrote straight into
`useSkyState`. Only the canary projected the scalars from the directive. The STATUS row below marked
the darkening ✅ although its net effect was a paper ~14% (sun ×0.4 at full cover, ambient ×1.4 and
hemi ×1.5, exposure untouched) — the row was true of the code and false of the screen.

## STATUS.md rows as they stood

| Condition → `useSkyState` (`cloudCover`/`storminess`) = scene **darkening** | ✅ | `deriveSkyScalars` from the effective directive; sets current+target (instant, no 90s drag) |
| `AtmosphereDirectiveDriver` → `useAtmosphere.tweenedDirective` (45s tween) | ✅ | sourced from live weather via `useAtmosphereDirective`; feeds `<Atmosphere />` when it's the mounted renderer |
| `useSkyState` darkening (sun dim + sky desat) | ✅ | from the live weather poller |

## ARCHITECTURE.md paragraph as it stood

> **Canary gap (2026-06-08) — the active "environment wiring" build.** `<WeatherEffects>` mounts in **production** (`Scene.jsx`) but **not yet in `CanaryScene.jsx`**, and the canary does not push the active Condition's directive into `useAtmosphere` or derive `useSkyState` (`cloudCover`/`storminess`) from it. So selecting a thunderstorm Condition does not yet darken/wet/rain/flash the canary the way it does in production. Per the staging-area doctrine (§2), the fix is to mount the *same* `<WeatherEffects>` + bridge the Condition → the *same* stores — not to build canary-only effects. The two-store split is essential: `useAtmosphere` (directive) drives clouds/wind/precip/lightning; `useSkyState` (`cloudCover`/`storminess`) is what actually dims the sun (`×(1−cc·0.6)` in `CelestialBodies`) and desaturates the sky. The almanac authors no `lightning` field, so a stormy Condition's lightning rate must be synthesized (or added in Phase 3b). Tracked in `STATUS.md` → "Environment wiring" + `BACKLOG.md`.
