# Meteorologist — Backlog

Punchlist for the cloud + weather authoring track. Items are independently shippable unless flagged.

> Excised from `../cartograph/BACKLOG.md` on 2026-05-18 when Meteorologist's doc structure was promoted to standalone. The cartograph BACKLOG retains a one-line pointer plus the SC.6 ship-line (load-bearing for the slab-completeness narrative); everything else lives here.

---

## In flight — phase queue (next up first)

Updated 2026-05-20. Phases 1–4b.1 shipped (see `NOTES.md` for commits). Next:

### ✅ Phase 4b.1 — `<Atmosphere />` shader (shipped 2026-05-20, commit `d1c66fe`)

All five photoreal levers landed in one commit. Uniforms hardcoded to `cumulus_humilis` values; preset-driven binding queued for 4b.2. Visual verification (HANDOFF checklist 1–5 + 9) pending Jacob's eyes.

### Cross-helper: Kit clock + calendar anchor (mostly shipped 2026-05-20)

ADR + rationale in `NOTES.md` 2026-05-20 entries. Phasing:

1. ✅ Kit primitive + pump scaffold (Wren). useCalendar + ClockCalendarPump shipped.
2. ✅ **Replaced** by unified time card (Wren). DateScrubber subsumed into expanded DawnTimeline.
3. ✅ Meteorologist Condition editor — WhenCard live dots on TOD + season chips (commit `36d667c`).
4. ⏳ Arborist seasonal-tree consumption. Cross-helper coordinator brief at `scratch/handoff-2026-05-20-arborist-seasonal-tree-consumption.md`. Pairs with year-round trees track.
5. ⏳ Production runtime mounts `<ClockCalendarPump mode="live">`. Small direct commit after 4 ships.

Also shipped:
- Year-strip 12-month markers → 4 season-name anchors (commit `5e98533`)
- Bidirectional sync between useCalendar + useTimeOfDay so year-strip drives CelestialBodies' SunCalc → seasonal sun motion is visible

### ✅ Partially shipped + pivoted: 4-anchor seasonal sky matrix

Wren shipped sub-phases 1 + 3 in `bff87b5` (schema + Preetham composition + runtime interpolation). Subsequent architectural conversation surfaced that the entire model wanted simplification — see `NOTES.md` "Sky architecture pivot" 2026-05-20 ADR. Sub-phase 2 (edit-lock UX) was queued but is now superseded by the pivot. Preetham composition removed in `d6b861b`.

Maxibrief `scratch/handoff-2026-05-20-cartograph-4anchor-seasonal-sky.md` is partially obsolete — sub-phases 1+3 done; sub-phase 2 retired; new direction takes over below.

### ✅ Sky architecture pivot — Phase A shipped

Mechanism landed in a single Wren commit (2026-05-21). All 8 items in the original 10-item walk except the artistic deviation (item 4) and any further doc sweep beyond NOTES + BACKLOG. See `NOTES.md` 2026-05-21 entry "Sky pivot Phase A shipped" for the full breakdown of what's in.

**Done in Phase A:**
- `cartograph/proceduralSky.js` extracted (`KEYFRAMES` + `proceduralSkyAt`)
- `cartograph/pipeline/hydrate-anchor-cards.js` one-shot script
- Procedural-seeded winter / spring / autumn cards baked into `ANCHOR_CARDS_PROCEDURAL` constant
- `skyGrid.js` reshaped: `SKY_HOURS=24`, `ANCHOR_CARDS`, `buildMosaicForDate`, `flankingAnchors`, override envelope (`spatialWeight` × `temporalWeight`)
- `scene.json` schema migrated to sparse `{overrides:[]}`; legacy shapes resolve through tolerant migration
- Store: `addSkyOverride` / `removeSkyOverride` / `revertSky` clears
- Sky Builder UI rewritten: 24 hour-cols × 5 bands, CSS-gradient cells with left/mid/right-minute sampling, click-to-author, shift+click revert, solar-noon marker
- Shader callsite unchanged — `resolveSkyAtMinute` builds mosaic + applies overrides + minute-lerp adjacent hours

### ✅ Sky architecture pivot — Phase B shipped (rules-based seasonal derivation)

Three HSV knobs per season (`hueDeg`, `sat`, `val`) in `cartograph/proceduralSky.js` `SEASON_TRANSFORMS`. Procedural function transforms `KEYFRAMES` at sample time before the altitude lerp. Summer = identity. `ANCHOR_CARDS_PROCEDURAL` in `skyGrid.js` regenerated via `node cartograph/pipeline/hydrate-anchor-cards.js`.

Re-tuning loop: edit the three numbers per season → re-run hydration → paste output → reload. Pivot complete; sky pipeline is the rules-based instrument the orchestrator described.

See `NOTES.md` 2026-05-21 "Sky pivot Phase B" entry for per-season values + intent.

### ✅ Phase 4b.2 — TodChannel uniform binding (shipped 2026-05-21)

Atmosphere's twelve shape + lighting uniforms now read from the active preset's per-param TodChannels each frame via `resolveGroupAtMinute`. Operator slider drags in Teacup land on the canary cloud synchronously (store's `_patchParam` mutates `presets` in-memory on the same tick). Animated channels lerp between TOD slot waypoints as time scrubs. `getActivePreset()` selector added to `useMeteorologistStore`. `uWindScale` deliberately not wired (lives in Conditions/directive). See `NOTES.md` 2026-05-21 entry.

### ✅ Phase Seed shipped (2026-05-20)

Reference photos surface in TeapotLibrary + Teacup; Nimbus's `specialist-seed.json` drove 51 preset tunings (cumulus_humilis preserved authored). Description field added to schema + autosave + UI; swap-into-viewport open state with editable text. Library is now visually distinct + operator-captioned end-to-end.

Follow-ups:
- Phase Seed.2 — operator hand-tune sweep against live render now that ref photos are visible
- Photo wishlist — 5 needs_photo presets per `public/clouds/photos/SOURCES.json`

### ✅ Phase 4b.3 — CloudDome retirement (shipped 2026-05-20)

Production LS, Cartograph Stage, and Preview all flipped from `<CloudDome />` to `<Atmosphere />`. CanaryScene unchanged (already on Atmosphere since 4b.1). Deleted `CloudDome.jsx`, `SpriteClouds.jsx`, `HANDOFF-clouds-day3-clouddome-v2.md`, and the orphan import in `StageApp.jsx`. With Phase 5a's directive path already live (commit `e9936f8`), production immediately renders today's actual atmospheric directive smoothly tweened — no bridge interval. The `AtmosphereDirectiveDriver` mount in `Scene.jsx` (shipped in 5a) makes the directive available to subscribers there; Cartograph + Preview will need their own driver mounts when their directive-driven visuals matter (Phase 5b polish).

### Phase 3b — Directive TodChannel promotion + cloud capabilities + per-cloud expression

Three coupled additions:

1. **Schema promotion** of directive numeric fields: `directive.{sun.intensity, lightDome.ambientFloor, wind.scale, wind.dir, precip.intensity}` become `oneOf [number, animatableValue]` (same shape Phase 2 introduced for cloud params). Colors stay flat in v1. Migration script wraps existing scalars; `almanac.defaults.json` regenerated alongside.
2. **Cloud capabilities** on `preset.schema.json`: `precipKinds: ['rain'|'snow'|...]`, `electrified: bool`. Authored in Teacup (small new card). Pulldown filter in CloudsInConditionCard graduates from kind-only to capability-aware.
3. **Per-cloud-in-condition expression flags**: extend `directive.clouds[]` schema to allow `rainRate / snowRate / lightningRate` per cloud entry (each TodChannel-shaped, gated by the cloud's capabilities). New right-rail subsection inside CloudsInConditionCard.

Lands AFTER Phase 4b so the temporal modulation is visually validatable.

### ✅ Phase 5a — Runtime live wiring (shipped 2026-05-20)

Almanac evaluator hot-mounted against live open-meteo state via:
- `src/lib/weather-payload.js` — bridges open-meteo + INSTANCE + SunCalc → schema-aligned payload.
- `src/hooks/useAtmosphere.js` + `useAtmosphereDirective.js` — shared zustand store holding the resolved directive; subscribers (Atmosphere + InstancedTrees) read from `tweenedDirective`.
- `src/components/AtmosphereDirectiveDriver.jsx` — mounted in `Scene.jsx`, runs `selectDirective` whenever weather / time / override changes, lerps `rawDirective` → `tweenedDirective` over 45s via weight-union cloud crossfade.
- `Atmosphere.jsx` — production directive path: `bindUniformsFromDirective` does a weighted blend of preset params across the directive's `clouds[]`, then directive's `sun.tint` + `lightDome.horizon/ambientFloor` overwrite the sky-light coupling for cloud lighting (sky channel still drives the dome).
- `atmosphere-materials.js` — new `uWindDir` Vector3 uniform; wind advection now respects directive direction.
- `InstancedTrees.jsx` + `treeAtlasMaterial.js` — sway shader picks up `uSwayWindSpeed` + `uSwayWindDir`; faster oscillation + static lean under stronger wind. Phase 7a replaces with multi-timescale gust envelope.

Caveat: production `Scene.jsx` still mounts `<CloudDome />` (Phase 4b.3 pending), so the directive's full visual effect — clouds tracking weather, lighting tracking weather, trees swaying with weather — is verifiable in CanaryScene + PreviewApp today, and becomes production-visible the moment 4b.3 lands. The plumbing itself is fully in place; only the consumer mount remains.

### Phase 5b — Polish

- Fake-weather fixture management UI (load/save weather payloads from `public/clouds/fixtures/`).
- Surface "current directive" debug readout in Sky & Light card (DevTools: `useAtmosphere.getState()` for now).
- Fallback editor (the catch-all directive for when no rule matches).
- Cloud preset gallery / reference-photo thumbnails (BACKLOG item 10 from 2026-05-14 spade work).
- Camera orbit controls in viewport.
- `bakeLastMs` slice replaces Phase 4a's `Date.now()` stub (real cartograph fetch).

### Phase 6 — Modulators (continuous atmospheric phenomena) — v1 commitment

ADR in `NOTES.md` 2026-05-20. Adds a Modulators layer on top of the Almanac: continuous, weather-signal-driven directive deltas that compose with the base directive. Captures atmospheric phenomena that don't reduce to "which cloud preset" — cold-front passage, about-to-rain feel, tornado green, wildfire smoke, pre-storm gold, fog burn-off — each as its own authored modulator with a driver signal, curve, deltas, and ramp duration. Runtime evaluates them against open-meteo's full payload (pressure trend, radiation ratios, etc.); stacks results onto base directive.

**Scope:**

- `public/clouds/modulators.json` artifact + `modulator.schema.json`
- `src/lib/weather-signals.js` — `deriveSignals(weatherPayload, time)` producing pressure_trend_3hr, direct_ratio, hour_of_day, etc.
- Evaluator extension: `selectDirective` returns base + composed modulator stack; commutative composition (intensity scales multiply; tints sum-and-clamp; ramps interpolate)
- "Modulators" tab in Meteorologist UI alongside Teapot + Conditions; per-modulator editor (driver picker, curve picker, delta rows, ramp slider)
- Seed library — 5–8 starter modulators (cold_front_passage, about_to_rain, severe_storm_aerosol_filter, wildfire_smoke, pre_storm_gold, fog_burn_off, summer_heat_haze)
- Cross-helper: wind modulator outputs feed `InstancedTrees` sway uniforms (already on the wind contract)

**Why v1 not v2:** the product promises an LS that reflects its real world. A LS that can't show "the cold front is here" or "the air today is smoke from Canada" misses the promise. Modulators are the architectural piece that makes the promise reachable. Land after Phase 5 (need evaluator hot-mount first).

### Phase 7 — Atmospheric consumers (wind, rain, snow, lightning) — v1 commitment

ADR in `NOTES.md` 2026-05-20. Turns the directive's wind/precip/lightning output into visible scene behavior. Wind as sampled field (not scalar) breaks the "dawdle." Rain via streaks + wet-surface pass. Snow via points + accumulation. Lightning via scene-flash + delayed thunder. Sub-phased for atomic review.

**Phase 7a — Wind field + multi-scale tree response.** Cross-helper with Arborist.

- `src/lib/wind-field.js` — `windAt(t, pos, windState) → { force, intensity }`. Three temporal scales (drift / gust envelope / gust spikes via `smoothmax`). Spatial gust-front advection so gusts visibly travel through the scene.
- InstancedTrees sway shader rewritten to sample the field at four time-constants (leaves / twigs / branches / trunk) with appropriate damping. Cross-helper coordinator brief at dispatch time.
- Atmosphere subscribes too — `uWindScale` + `uWindDir` populated from `windAt(t, cameraPos, ...)`. Cloud advection becomes gust-aware.
- The single dawdle-fix beat. Largest single visual upgrade in the atmospheric arc.

**Phase 7b — Rain particles + wet-surface shader.**

- ~5–10k motion-blurred streaks in a ~150–200m camera-following cylinder. Wind-tilted fall. Per-particle speed variance.
- `uWetness ∈ [0,1]` integrator from `directive.precip.intensity`; asphalt + concrete materials darken albedo + boost specular. Puddles take ~minute to form/decay.
- Rain audio layer fades with intensity.

**Phase 7c — Snow particles + accumulation integrator.**

- Point sprites (not streaks). Curl-noise lateral motion. Wind dominates trajectory.
- `uSnowAccumulation ∈ [0,1]` integrator whitens top-facing surfaces (`mix(base, white, accum * normal.y)`). Rises during `precip.kind === 'snow'`, decays slowly.
- World audio gets a low-pass filter under heavy snow.

**Phase 7d — Lightning flash + delayed thunder.**

- `uLightningFlash` scene uniform — 50ms spike, 200ms decay. Brief ambient-multiplier wash, cloud lit-from-above pulse.
- Thunder layer delayed proportional to `directive.lightning.distance`. Intracloud (glow only) vs cloud-to-ground (vertical streak particle line) via `directive.lightning.kind`.

**Cross-helper consequences:**

- Arborist: 7a rewrites InstancedTrees sway shader.
- Cartograph: 7b authors wet-surface response per-Look (optional per-Look road-darkening curves).
- Future Audiologist (or Meteorologist runtime): 7b/c/d audio layers.

**Why v1 not v2:** each consumer here exists because skipping it produces the uncanny "video game weather" tell. The dawdle (no real wind), the dry rain (no wet surface), the snowless snow (no accumulation), the instant thunder (no delay) — each is the singular property that breaks immersion in its category. Land after Phase 6 (need modulator-driven wind/precip/lightning values to consume).

---

- [ ] **Ship v1 clouds; Meteorologist runs as a separate track.** Old noise-based `CloudDome.jsx` (v1) is the v1 shipper — get it back to a working state. Meteorologist (volumetric raymarch, 52-preset Teapot, 16-rule Almanac) continues evolving and lands when ready, not as a v1 blocker. See `SPEC.md`.

---

## 2026-05-19 — Per-Look primary tree species (cross-helper setup)

**Idea (parked 2026-05-19 EOD by Jacob):** the operator's setup flow for a new Look — the place where they pick latitude / longitude / season / time-of-day — should also include **the primary tree species** for that map.

The bet: tree species is **climatic identity**, not just dressing. A Miami map's atmosphere is palm trees. Lafayette Square's is Sugar Maple. Chicago is honeylocust. The species choice anchors the visual character at the same scale-of-decision as "what does the sky look like."

**Where it lives:** Meteorologist's setup flow seems like the right home because:
- Meteorologist already owns per-Look climate fields (geography, weather code, almanac).
- A "primary tree" field is a climate-adjacent metadata field. Climate → species follows naturally (the Almanac could even suggest defaults: tropical → palm/banyan, temperate → maple/oak, arid → mesquite, etc.).
- Arborist already publishes `public/trees/index.json` of available species; the Meteorologist setup just renders a picker against it.

**What this would look like:**
1. New field on the Look config: `primarySpecies: 'acer_saccharum_procedural'` (or `palm`, `gleditsia`, etc.).
2. Meteorologist setup surface renders a species picker pulling from arborist's `index.json`. Could climate-filter the list (sees `geography.lat → suggest temperate set`).
3. The selection writes into the Look's design.json and gets surfaced into the bake.
4. `bake-trees.js`'s placement-selection biases toward the primary species (boost its `qualityOverride`?) or seeds the per-Look roster with it pre-curated.
5. Production runtime: primary-species placements get hero-quality bias; everything else fills in via the existing two-tier substitution (per `arborist/ARCHITECTURE.md`).

**Open design questions** (TBD when this lands):
- One primary species or N? (Lafayette Square is a Sugar Maple show but also has willows + ginkgoes + honeylocust. Maybe `primarySpecies` is plural, with the *first* getting the hero spot.)
- Does the operator's choice REPLACE the Grove curation surface, or COMPLEMENT it? (Grove is already the per-Look roster knob; primary-species is just the *first* knob, with Grove for fine-tuning.)
- Where does the picker live in the UI? Top of the Meteorologist setup screen, or its own panel alongside the Almanac rules? (Probably the former — it's a setup choice, not a tuning choice.)
- How does it interact with G.1–G.5 hero authoring? Heroes already win the species-map lottery; a primary-species pick just means "give this Look's placements every chance to land on this species."

**Cross-references:**
- `arborist/ARCHITECTURE.md` two-tier substitution + master atlas sections — the mechanism this would feed.
- `arborist/BACKLOG.md` G.1–G.5 hero authoring — primary-species selection assumes heroes exist for the popular species.
- `project_kit_helpers_pattern` — Meteorologist owns climate; Arborist owns species; this is the seam where they meet.

Not gating any current Phase. Land alongside the operator-facing Meteorologist setup screen.

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

## 2026-05-20 — Cloud altitude importer (small, post-pivot)

Add `meteorologist/pipeline/import-cloud-altitudes.js` — small script that pulls WMO + aviation cloud-altitude tables (hardcoded; they don't change) and populates `baseAlt` + `thickness` on existing Teapot presets by matching their `wmo` code to the authoritative range midpoint. Real-world physics values ship as defaults; everything else stays hand-tuned. ~50 LOC + a lookup table.

**Why:** kit-completeness. Future instances (Cary, Miami, etc.) get WMO-correct cloud altitudes for free instead of inheriting LS's hand-scaffolded numbers. The artistic shader-tune layer lives on top, unaffected.

**Not urgent:** existing 52 scaffolded entries are reasonable as-is. Land after the sky architecture pivot ships and the dust settles. Low priority.

**Mechanism:**
- Lookup table embedded in script: `{ 'Cu hum': { baseRange: [600, 2000], topRange: [...] }, ... }` for each WMO genus.
- For each preset where `kind === 'cloud'` and `wmo` is set: assign `baseAlt = midpoint(baseRange)`, `thickness = midpoint(topRange) - midpoint(baseRange)`.
- Re-runnable; idempotent.
- Operator can deviate post-import.

---

## 2026-05-02 — Weather pack (own track, post-Meteorologist)

Ongoing track — not punchlist-gating. The product vision: Lafayette Square as a living place, today's actual weather + scheduled event Looks. Real weather data is already wired (`useWeather.js` → `useSkyState` → existing shaders); what's missing is visual fidelity. Clouds for v1 ship via the existing `CloudDome.jsx`; Meteorologist (volumetric raymarch) replaces it when ready. See `project_weather_and_events_vision.md`, `SPEC.md`.

- [ ] **Wind effects.** Tree sway shader uniform (affects all instanced trees), cloud movement direction + speed (CloudDome shader), audio (wind, leaves, distant thunder). Wind direction + speed live in Meteorologist's published directive; consumers subscribe.
- [ ] **Precipitation effects.** Rain particles + wet-surface specular shader on streets. Snow particles + roof accumulation (white tint masked by surface normal). Drives off `useSkyState.storminess` + WMO weather codes.
- [ ] **Heat haze.** Full-screen shimmer distortion for hot summer days in the park / hero shot.
- [ ] **Autumn foliage.** Leaf-fall particles, color-shift in tree LODs.
- [ ] **Audio integration.** Wind/rain/birdsong/distant city sounds tied to weather + TOD.
