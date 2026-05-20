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

### Cross-helper: Sky architecture pivot (NEXT UP — Cartograph, single Wren brief)

The next piece of work consolidates several threads: procedural sky restoration, 24-hour uniform grid, per-cell override system with spatial + temporal envelope, 3 missing seasonal cards (procedural-seeded + artistic deviation).

ADR + full architecture in `NOTES.md` "Sky architecture pivot: procedural canon + per-cell overrides" 2026-05-20.

Architecture locked: procedural shader/function HYDRATES the editable mosaics; the resolved mosaic is what renders. See `NOTES.md` "Shader path" section. Brief drafting unblocked.

Once confirmed, the brief covers:
1. Extract `cartograph/proceduralSky.js` from the historical pre-`47c2760` `GradientSky` (pure JS function + GLSL template + keyframe data table)
2. Restore procedural shader path in `CelestialBodies.jsx` (or pivot to mosaic-driven per Q resolution)
3. Sample procedural at 24 hourly positions × winter/spring/autumn reference dates → raw seasonal cards
4. **Wren artistic deviation pass** on the 3 raw cards (winter cooler/desat, autumn golden-warmth, spring fresh)
5. Reshape `skyGrid.js`: `SKY_HOURS = 24`, 4 anchor cards exported, runtime `buildMosaicForDate(date, overrides)` resolver
6. Migrate existing summer 22-editorial-cols → 24-uniform-hourly (preserve artistry as overrides)
7. `scene.json` schema downgrade: 4-anchor matrix → sparse override list `{ overrides: [{ hour, band, hex }] }`
8. Override resolver implements Chebyshev spatial (d=0 full, d=1 50%, d≥2 none) + temporal envelope (full inside override hour, 15-min ramp on each side)
9. Sky Builder UI: 24 hour-labeled columns, CSS gradient cells (sample left/mid/right minute), per-cell override authoring, shift-click revert
10. Doc sweep

Unblocks: sky color responds to year-strip via canonical procedural physics; operator overrides as sparse hand-painted touches; "sell sky space" mental model becomes literal (hour-keyed cells); 4 seasonal cards exist as kit canon with Wren's artistic touch.

### Phase 4b.2 — TodChannel uniform binding

Wire active preset's `params` through `resolveGroupAtMinute(channel, minute)` to feed shader uniforms each frame. Slider scrubs in Teacup's right rail now visibly affect the viewport. Same wiring extends to `<Atmosphere />` in CanaryScene whether mounted from Teacup or ConditionEditor.

### Phase 4b.3 — CloudDome retirement

Per `STAGE_MIGRATION.md`: swap all `<CloudDome />` mounts (Scene.jsx, CartographApp.jsx, PreviewApp.jsx, CanaryScene.jsx) to `<Atmosphere />`. Delete `CloudDome.jsx` + `SpriteClouds.jsx` + dead CloudDomeV2/V3. The `CloudCoverSeed` Phase-4a expedient in CanaryScene comes out (no longer needed once Atmosphere reads from preset directly).

### Phase 3b — Directive TodChannel promotion + cloud capabilities + per-cloud expression

Three coupled additions:

1. **Schema promotion** of directive numeric fields: `directive.{sun.intensity, lightDome.ambientFloor, wind.scale, wind.dir, precip.intensity}` become `oneOf [number, animatableValue]` (same shape Phase 2 introduced for cloud params). Colors stay flat in v1. Migration script wraps existing scalars; `almanac.defaults.json` regenerated alongside.
2. **Cloud capabilities** on `preset.schema.json`: `precipKinds: ['rain'|'snow'|...]`, `electrified: bool`. Authored in Teacup (small new card). Pulldown filter in CloudsInConditionCard graduates from kind-only to capability-aware.
3. **Per-cloud-in-condition expression flags**: extend `directive.clouds[]` schema to allow `rainRate / snowRate / lightningRate` per cloud entry (each TodChannel-shaped, gated by the cloud's capabilities). New right-rail subsection inside CloudsInConditionCard.

Lands AFTER Phase 4b so the temporal modulation is visually validatable.

### Phase 5 — Fixtures + Almanac evaluator hot-mount + polish

- Fake-weather fixture management UI (load/save weather payloads from `public/clouds/fixtures/`).
- Almanac evaluator hot-mount in CanaryScene (or in Cartograph Stage's Sky&Light dev panel): reads `selectDirective(weather, almanac, presets, override)` each frame; surfaces "current condition" + "current cloud blend" while authoring.
- Fallback editor (the catch-all directive for when no rule matches).
- Cloud preset gallery / reference-photo thumbnails (BACKLOG item 10 from 2026-05-14 spade work).
- Camera orbit controls in viewport.
- `bakeLastMs` slice replaces Phase 4a's `Date.now()` stub (real cartograph fetch).

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

## 2026-05-02 — Weather pack (own track, post-Meteorologist)

Ongoing track — not punchlist-gating. The product vision: Lafayette Square as a living place, today's actual weather + scheduled event Looks. Real weather data is already wired (`useWeather.js` → `useSkyState` → existing shaders); what's missing is visual fidelity. Clouds for v1 ship via the existing `CloudDome.jsx`; Meteorologist (volumetric raymarch) replaces it when ready. See `project_weather_and_events_vision.md`, `SPEC.md`.

- [ ] **Wind effects.** Tree sway shader uniform (affects all instanced trees), cloud movement direction + speed (CloudDome shader), audio (wind, leaves, distant thunder). Wind direction + speed live in Meteorologist's published directive; consumers subscribe.
- [ ] **Precipitation effects.** Rain particles + wet-surface specular shader on streets. Snow particles + roof accumulation (white tint masked by surface normal). Drives off `useSkyState.storminess` + WMO weather codes.
- [ ] **Heat haze.** Full-screen shimmer distortion for hot summer days in the park / hero shot.
- [ ] **Autumn foliage.** Leaf-fall particles, color-shift in tree LODs.
- [ ] **Audio integration.** Wind/rain/birdsong/distant city sounds tied to weather + TOD.
