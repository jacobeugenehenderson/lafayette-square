# Meteorologist — Backlog

Punchlist for the cloud + weather authoring track. Items are independently shippable unless flagged.

> Excised from `../cartograph/BACKLOG.md` on 2026-05-18 when Meteorologist's doc structure was promoted to standalone. The cartograph BACKLOG retains a one-line pointer plus the SC.6 ship-line (load-bearing for the slab-completeness narrative); everything else lives here.

---

## v1 cut decision

- [ ] **Ship v1 clouds; Meteorologist runs as a separate track.** Old noise-based `CloudDome.jsx` (v1) is the v1 shipper — get it back to a working state. Meteorologist (volumetric raymarch, 52-preset Teapot, 16-rule Almanac) continues evolving and lands when ready, not as a v1 blocker. See `SPEC.md`.

---

## 2026-05-14 — Spade work before standing up the studio

SC.6 (`4176340`) installed the coupler scaffolding — `scene.clouds` channel, the Almanac evaluator at `src/lib/almanac-eval.js`, the `public/clouds/` artifacts shipped — without building the v3 `<Atmosphere />` volumetric raymarched runtime. v1 keeps procedural `CloudDome`. This section enumerates every other piece of spade work that can land BEFORE the Meteorologist studio (the operator-facing authoring UI for cloud presets + Almanac rules) is stood up, so when it lands, the studio plugs in mechanically.

The principle: every item below is independently shippable today — no blockers, no v3 shader dependency. Each closes a structural gap or removes a future-friction point.

### Spade work inventory

1. **Schema-derived TypeScript / JSDoc types.** `meteorologist/pipeline/schema/{teapot,almanac,weather-payload}.schema.json` exist and validate. Generate (or hand-write parallel) JSDoc-typedef declarations in `src/lib/almanac-eval.js`'s docblock so callers (and a future Stage UI) get IDE autocomplete on rule shapes, directive fields, and weather payload keys. Trivial; cuts confusion when the studio author writes their first rule.

2. **Weather payload normalizer.** `useWeather.js` today exposes `cloudCover` + `storminess` (derived from `weather_code` + `precipitation`); the Almanac schema wants a richer payload (`{tempC, cloudCover, pressureMb, humidity, windKph, windDirDeg, precipMmHr, stormDistanceKm, sunElevationDeg, sunAzimuthDeg, tod, season, precipKind}`). Land a `src/lib/weather-payload.js` that takes raw open-meteo response + `useTimeOfDay` state + `INSTANCE.geography` and emits the schema-compliant payload. Atmosphere v3 reads this directly; Almanac validation passes; nothing else changes about the runtime today.

3. **Authoring-time validator wired into bake-scene + Stage save.** `meteorologist/pipeline/validate.js` validates Teapot + Almanac against schemas; today it runs only via `npm run validate -- ...`. Pre-bake hook: when `bake-scene.js` reads `design.clouds`, also validate the referenced preset id exists in the live `public/clouds/presets.json`. Fail-loud-don't-bake on schema violations. Pre-save hook in cartograph store: same check when operator picks a preset (won't matter until the UI lands, but the action gets it for free). Saves a class of "I shipped a Look with a stale preset id" bugs.

4. **Test fixtures for the Almanac evaluator.** `src/lib/almanac-eval.js`'s 12/12 self-test from SC.6's session lived in an ad-hoc node REPL. Move it into `src/lib/__tests__/almanac-eval.test.js` (or similar) with the canonical fixtures: clear day, golden-hour, thunderstorm-active, fog, etc. Lock the evaluator's behavior so future Almanac authoring can refactor rules with confidence.

5. **Teapot library audit pass.** 52 presets scaffolded; some are WMO-canonical (cumulus_humilis, stratocumulus_translucidus), some are placeholders. Walk the list, identify which are "definitely v1," which are "v1 if we have time," which are "v2 deferral." Document the verdict in `CANON.md`. Lets the studio author focus on real-world tuning instead of triage.

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

- `README.md` — orientation card
- `SPEC.md` — full work order
- `CANON.md` — Teapot inclusion principles
- `STAGE_MIGRATION.md` — cleanup commit spec (executes when v3 lands)
- `src/lib/almanac-eval.js` — the v3 evaluator's runtime interface, shipped 2026-05-13

---

## 2026-05-02 — Weather pack (own track, post-Meteorologist)

Ongoing track — not punchlist-gating. The product vision: Lafayette Square as a living place, today's actual weather + scheduled event Looks. Real weather data is already wired (`useWeather.js` → `useSkyState` → existing shaders); what's missing is visual fidelity. Clouds for v1 ship via the existing `CloudDome.jsx`; Meteorologist (volumetric raymarch) replaces it when ready. See `project_weather_and_events_vision.md`, `SPEC.md`.

- [ ] **Wind effects.** Tree sway shader uniform (affects all instanced trees), cloud movement direction + speed (CloudDome shader), audio (wind, leaves, distant thunder). Wind direction + speed live in Meteorologist's published directive; consumers subscribe.
- [ ] **Precipitation effects.** Rain particles + wet-surface specular shader on streets. Snow particles + roof accumulation (white tint masked by surface normal). Drives off `useSkyState.storminess` + WMO weather codes.
- [ ] **Heat haze.** Full-screen shimmer distortion for hot summer days in the park / hero shot.
- [ ] **Autumn foliage.** Leaf-fall particles, color-shift in tree LODs.
- [ ] **Audio integration.** Wind/rain/birdsong/distant city sounds tied to weather + TOD.
