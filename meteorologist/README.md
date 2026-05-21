# Meteorologist

The project's atmospheric authoring system + runtime. Authors a cloud preset library ("the Teapot") and weather-interpretation rules ("the Almanac"); renders volumetric raymarched clouds against a live weather feed.

**This README is the orientation card.** Open this first when starting work; it points at the rest.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `CANON.md` + `STAGE_MIGRATION.md` as topical addenda). Read at session start; flag contradictions during work; update at session end. Stale claims actively mistrain readers.

---

## Status (as of 2026-05-20)

**Standalone app shell + authoring UI + v3 raymarched cloud shader ship. TodChannel uniform binding (4b.2) + Phase Seed library + Phase 5a runtime live wiring + Phase 4b.3 production swap + Phase 6 Modulators all shipped. Production LS now renders today's actual atmospheric directive smoothly tweened against live weather, with a continuous-phenomena modulator stack layered on top.**

| Done | Not yet |
|---|---|
| Schemas (`pipeline/schema/*`) | TodChannel promotion of directive numeric fields (Phase 3b) |
| **Phase 4b.3 — CloudDome retirement + production swap to `<Atmosphere />`** (2026-05-20) | |
| **Phase 5a — Almanac evaluator hot-mount + directive tween + wind cross-helper wiring** (2026-05-20) | |
| Validator + cross-schema checks (`pipeline/validate.js`) | TodChannel promotion of directive numeric fields (Phase 3b) |
| Teapot — 52 presets, params migrated to TodChannel shape | Cloud capabilities (`precipKinds`, `electrified`) on preset.schema (Phase 3b) |
| Almanac — 16 rules + immutable defaults sibling | Per-cloud-in-condition expression flags (Phase 3b) |
| `meteorologist/serve.js` backend (GET/PUT presets, GET/PUT/Revert almanac) | Driver mount in Cartograph/Preview (Phase 5b polish) |
| `src/lib/almanac-eval.js` (shipped 2026-05-13 via SC.6) | Fake-weather fixtures + fixture management UI (Phase 5b) |
| `/meteorologist.html` standalone app shell | Fallback editor (Phase 5b) |
| Top-bar TEAPOT ⎮ CONDITIONS ⎮ MODULATORS toggle + Look picker | Cross-helper wind feed to InstancedTrees + wind.gustsScale (Phase 7a) |
| **Phase 6 — Modulators (continuous atmospheric phenomena)** (Halo, 2026-05-20) — schema + 7 starter modulators + signal derivation + composition + editor | |
| Teapot library + Teacup workstage (13 cloud-param TodChannels, autosave) | Phase 7a — wind field + multi-scale tree response (deferred until trees mount) |
| **Phase 7b/c/d — Atmospheric consumers (rain + snow + lightning)** (Tempest, 2026-05-20) | Audio layers (rain / snow muffle / thunder) — future Audiologist helper |
| Conditions library + Condition editor (When + Directive + Clouds-in-cond + Revert) | Camera orbit controls in viewport (Phase 5b+) |
| CanaryScene viewport (sky-from-Look + hero tree + flat ground) | Mobile quality tier (`uQualityTier`) (Phase 5b+) |
| **Multi-preset blending via weighted clouds[] union — production renders directive blend (Phase 5a)** | |
| **Phase Seed — 52 reference photos + Nimbus seed tunings + editable descriptions** (2026-05-20) | |
| `<Atmosphere />` v3 raymarched cloud shader (5 photoreal levers) | |
| `atmosphere-materials.js` shader factory + inline GLSL | |
| **TodChannel uniform binding — active preset's params drive the cloud shader (Phase 4b.2)** | |
| `FEATURES.md` + `INTERFACE.md` (operator-facing surfaces) | |
| 5 memory entries from this arc | |

**Validation passes:** `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json ../public/clouds/modulators.json` → `ok: 52 presets, 16 rules, 7 modulators`.

**Shipped phases:**
- Phase 1 — scaffold + library views (commit `47c5de0`, 2026-05-19)
- Phase 2 — Teacup workstage + cloud-param TodChannels (commit `95bad99`, 2026-05-19)
- Phase 2 chrome — Stage's glass-panel card setup (commit `5fd8f78`, 2026-05-19)
- Phase 3 — Condition editor (commit `98f3781`, 2026-05-19)
- Phase 4a — CanaryScene scaffold (commit `6a3fd29`, 2026-05-19)
- Phase 4b.1 — `<Atmosphere />` raymarched shader (commit `d1c66fe`, 2026-05-20)
- Phase 4b.2 — TodChannel uniform binding; active preset drives shader uniforms each frame (Wren, 2026-05-21)
- Phase 5a — Runtime live wiring: evaluator hot-mount + directive tween + wind cross-helper (Cirrus, 2026-05-20, commit `e9936f8`)
- Phase 4b.3 — CloudDome retirement; production swap to `<Atmosphere />` (Cirrus, 2026-05-20)
- Phase Seed — Cloud Specialist seed applied (51/52 presets retuned by Nimbus); ref photos surface in TeapotLibrary + Teacup; description field added end-to-end (Stratus, 2026-05-20)
- Phase 6 — Modulators: schema + 7 starter records + `weather-signals.js` + evaluator composition + Modulators tab/editor + serve.js endpoints (Halo, 2026-05-20)
- Phase 7b/c/d — Atmospheric consumers: rain particles + wet-surface shader, snow particles + accumulation integrator, lightning scene-flash + cloud lit-from-above pulse + cloud-to-ground streak (Tempest, 2026-05-20)
- Kit clock+calendar primitive — `useCalendar` + `ClockCalendarPump` (2026-05-20)
- Step 3 WhenCard live dots — TOD + season chip indicators (commit `36d667c`, 2026-05-20)
- Unified time card — TOD + ToY + playback in DawnTimeline (Wren, 2026-05-20)
- Year-strip seasons + clock/calendar bidirectional sync (commit `5e98533`, 2026-05-20)
- Cartograph 4-anchor seasonal sky scaffold + Preetham composition (Wren, commit `bff87b5`, 2026-05-20) — **partially superseded by pivot below**
- Preetham composition dropped — operator juice is the truth (commit `d6b861b`, 2026-05-20)
- Sky architecture pivot ADR — procedural canon + per-cell overrides + 24-hour grid (parked + queued; see `NOTES.md`, 2026-05-20)

---

## Start here in the morning

**Phase 5b — Preview Studio + driver coverage + fixtures.** Phase 6 (Modulators, Halo, 2026-05-20) + Phase 7b/c/d (Tempest, 2026-05-20) shipped both the continuous-phenomena layer and the visible weather consumers. Production now responds to weather *visibly* — rain you can see, snow that accumulates on roofs and ground, lightning that briefly washes the scene, modulators composing atmospheric texture on top. The remaining v1 gap is *previewing* this machinery against any scenario without waiting for real weather to occur. See `NOTES.md` 2026-05-21 Preview Studio ADR.

Open priorities:

- **5b (next substantive dispatch)** — Preview Studio elevation from polish bundle. Five pieces: (5b.1) mount `AtmosphereDirectiveDriver` + `<WeatherEffects />` in CartographApp + PreviewApp; (5b.2) operator-authored `public/clouds/fixtures/*.json` + serve.js endpoints; (5b.3) Preview Studio render surface (Look + Fixture + TOD picker, full-pipeline live render, modulator strength + matched-rule readouts); (5b.4) fallback editor; (5b.5) polish (current-directive readout, preset gallery, camera orbit, real `bakeLastMs`). Sub-phasing: 5b.1 + 5b.2 ship together; 5b.3 follows; 5b.4/5b.5 ride alongside.
- **3b** — Promote directive numerics to TodChannel + cloud capabilities + per-cloud expression flags + extend `directive.schema.json` with the `lightning` block (Tempest's consumer is ready; the schema + at least one modulator authoring the block lights up lightning end-to-end).
- **7a** — `src/lib/wind-field.js` + `windAt(t, pos, windState)` sampled field; `InstancedTrees` sway shader at four time-constants; `<Atmosphere />` subscribes too. Requires `wind.gustsScale` on `directive.schema.json` so modulators can author gust spikes. **Gated on production trees being mounted.** Cross-helper with Arborist. See `NOTES.md` 2026-05-20 consumers ADR.
- **Audiologist (new helper)** — rain layer fading with intensity, snow ambient low-pass, thunder delay proportional to `directive.lightning.distance`. Phase 7's silent visible-only ship awaits.

---

## Documents

In reading order:

1. **[`FEATURES.md`](./FEATURES.md)** — operator-facing surface. What an operator can do with Meteorologist today, what's queued, what each card / pulldown / slot is for. (Introduced 2026-05-20.)
2. **[`INTERFACE.md`](./INTERFACE.md)** — layout model. Teapot ⎮ Conditions, Teacup workstage, slot tabs, right-rail composition. The canonical reference for what the UI is. (Introduced 2026-05-19.)
3. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — publish-loop placement, consume-from-Stage pattern, directory layout, runtime contract. Where Meteorologist sits in the kit and what it composes from other helpers.
4. **[`SPEC.md`](./SPEC.md)** — full work order. Decisions locked, acceptance criteria. Some rows patched 2026-05-19 (standalone-shell reversal); patches noted in `NOTES.md`.
5. **[`BACKLOG.md`](./BACKLOG.md)** — punchlist + roadmap.
6. **[`NOTES.md`](./NOTES.md)** — historical decisions + EOD records. Read the top entry first; it has the latest context.
7. **[`CANON.md`](./CANON.md)** — what's in the Teapot, what's not, why. Inclusion principles.
8. **[`STAGE_MIGRATION.md`](./STAGE_MIGRATION.md)** — historical, kept for archive. Phase 4b.3 (2026-05-20) executed it.

---

## What lives where

```
meteorologist/                        # backend + docs (THIS DIR)
  README.md / FEATURES.md / INTERFACE.md / ARCHITECTURE.md / SPEC.md / BACKLOG.md / NOTES.md
  CANON.md / STAGE_MIGRATION.md       # topical addenda
  package.json                        # ajv dep
  pipeline/
    validate.js                       # ajv validators + cross-schema checks
    schema/                           # 5 JSON schemas
    migrate-params-to-channels.js     # Phase 2 one-shot migration; kept as precedent
  serve.js                            # SHIPPED — port 3335, GET/PUT presets + almanac
  state/                              # GITIGNORED — not used in v1 (no drafts)

public/clouds/                        # PUBLISHED ARTIFACTS — runtime contracts
  presets.json                        # the Teapot, 52 entries (params in TodChannel shape post-Phase 2)
  almanac.json                        # 16 rules + fallback (live file; accepts operator edits)
  almanac.defaults.json               # IMMUTABLE — Revert source; preserves hand-authored format
  fixtures/                           # NOT YET POPULATED — fake-weather payloads (Phase 5)

meteorologist.html                    # SHIPPED — standalone app entry

src/meteorologist/                    # SHIPPED — UI tree mirroring src/arborist/
  main.jsx                            # imports ../index.css → MeteorologistApp
  MeteorologistApp.jsx                # top bar + mode toggle + library router
  TeapotLibrary.jsx                   # flat preset list
  Teacup.jsx                          # per-cloud workstage
  cloudParamFields.js                 # 13-param metadata
  ConditionsLibrary.jsx               # flat conditions list
  ConditionEditor.jsx                 # per-condition workstage
  WhenCard / DirectiveCard / CloudsInConditionCard.jsx
  conditionFields.js                  # when-block + directive-block metadata
  SlotTabs.jsx                        # CLOUD CHAMBER ⎮ GROUND
  CanaryScene.jsx                     # viewport: sky + tree + ground + cloud
  canaryCamera.js                     # per-slot camera config
  stores/useMeteorologistStore.js     # zustand: mode + active id + autosave plumbing

src/components/
  Atmosphere.jsx                      # SHIPPED 4b.1 + 4b.2 + 5a — directive-driven in production, active-preset-driven in Meteorologist
  atmosphere-materials.js             # SHIPPED 4b.1 — shader factory + inline GLSL
  Atmosphere.jsx                      # production renderer (post-4b.3)
  SpriteClouds.jsx                    # retires in cleanup commit
  CelestialBodies.jsx                 # IMPORTED — same consumer Stage/Preview mount
  WeatherPoller.jsx                   # untouched; consumes its output downstream

src/lib/
  almanac-eval.js                     # SHIPPED 2026-05-13 (SC.6); no production consumer yet
  weather-payload.js                  # SHIPPED 5a — open-meteo + INSTANCE + SunCalc → schema-aligned payload
  weather-signals.js                  # NOT YET WRITTEN — Phase 6 (Modulators)

src/cartograph/                       # IMPORTED by Meteorologist (no fork):
  TodChannel.jsx                      # the kit primitive
  animatedParam.js                    # NAMED_TOD_SLOTS + resolver

src/components/DawnTimeline.jsx       # IMPORTED — TOD scrub bar
src/tokens/design.css                 # transitively imported via src/index.css
```

---

## Convention reminders

- **Math, not bakes.** No KTX2, no GLB, no texture memory. Procedural raymarch using preset params as uniforms.
- **No bake ceremony.** Saves write directly to `public/clouds/*.json` after validation. No drafts/published split.
- **Mirror existing UX.** Stage's `TodChannel.jsx` slot system is the canonical TOD authoring primitive. Don't invent a new timeline; add the Clouds row using the existing chip-row UX.
- **Toy stays as developer's separate door.** The existing Cartograph toolbar's Toy toggle stays untouched. The Meteorologist mode entrance is the new "launch meteorologist" button inside the Clouds row.
- **Per-Look overrides** apply only to dome visual-styling (sun tint, halo, lightDome). Never to cloud-math drivers, never to Almanac rules.

---

## How to validate the canon mid-edit

```bash
cd meteorologist
npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json
```

Expected: `ok: 52 presets, 16 rules`. Schema violations or cross-reference failures (disabled-preset references, weight sums > 1.0, duplicate ids) print the offending path and exit 1.

---

## Cross-references

- [`../arborist/SPEC.md`](../arborist/SPEC.md) — sibling helper, similar artifact + schema pattern
- [`../HANDOFF-clouds-day3-clouddome-v2.md`](../HANDOFF-clouds-day3-clouddome-v2.md) — shader tuning rubric (still authoritative until `<Atmosphere />` ships)
- [`../HANDOFF-sky-and-light.md`](../HANDOFF-sky-and-light.md) — current sky/light pipeline
- WMO Cloud Atlas: https://cloudatlas.wmo.int/en/clouds-genera.html
