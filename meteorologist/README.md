# Meteorologist

The project's atmospheric authoring system + runtime. Authors a cloud preset library ("the Teapot") and weather-interpretation rules ("the Almanac"); renders volumetric raymarched clouds against a live weather feed.

**This README is the orientation card.** Open this first when starting work; it points at the rest.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `CANON.md` + `STAGE_MIGRATION.md` as topical addenda). Read at session start; flag contradictions during work; update at session end. Stale claims actively mistrain readers.

---

## Status (as of 2026-05-20)

**Standalone app shell + authoring UI + v3 raymarched cloud shader ship. TodChannel uniform binding (4b.2) + Phase Seed library + Phase 5a runtime live wiring + Phase 4b.3 production swap all shipped. Production LS now renders today's actual atmospheric directive smoothly tweened against live weather.**

| Done | Not yet |
|---|---|
| Schemas (`pipeline/schema/*`) | TodChannel promotion of directive numeric fields (Phase 3b) |
| **Phase 4b.3 — CloudDome retirement + production swap to `<Atmosphere />`** (2026-05-20) | |
| **Phase 5a — Almanac evaluator hot-mount + directive tween + wind cross-helper wiring** (2026-05-20) | |
| Validator + cross-schema checks (`pipeline/validate.js`) | TodChannel promotion of directive numeric fields (Phase 3b) |
| Teapot — 52 presets, params migrated to TodChannel shape | Cloud capabilities (`precipKinds`, `electrified`) on preset.schema (Phase 3b) |
| Almanac — 16 rules + immutable defaults sibling | Per-cloud-in-condition expression flags (Phase 3b) |
| `meteorologist/serve.js` backend (GET/PUT presets, GET/PUT/Revert almanac) | Almanac evaluator hot-mount in Conductor preview (Phase 5) |
| `src/lib/almanac-eval.js` (shipped 2026-05-13 via SC.6) | Fake-weather fixtures + fixture management UI (Phase 5) |
| `/meteorologist.html` standalone app shell | Fallback editor (Phase 5) |
| Top-bar TEAPOT ⎮ CONDITIONS toggle + Look picker | Cloud preset gallery / thumbnails (Phase 5+) |
| Teapot library + Teacup workstage (13 cloud-param TodChannels, autosave) | Camera orbit controls in viewport (Phase 5+) |
| Conditions library + Condition editor (When + Directive + Clouds-in-cond + Revert) | Mobile quality tier (`uQualityTier`) (Phase 5+) |
| CanaryScene viewport (sky-from-Look + hero tree + flat ground) | Multi-preset blending (per `directive.clouds[]`) (Phase 5+) |
| **Phase Seed — 52 reference photos + Nimbus seed tunings + editable descriptions** (2026-05-20) | |
| `<Atmosphere />` v3 raymarched cloud shader (5 photoreal levers) | |
| `atmosphere-materials.js` shader factory + inline GLSL | |
| **TodChannel uniform binding — active preset's params drive the cloud shader (Phase 4b.2)** | |
| `FEATURES.md` + `INTERFACE.md` (operator-facing surfaces) | |
| 5 memory entries from this arc | |

**Validation passes:** `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → `ok: 52 presets, 16 rules`.

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
- Kit clock+calendar primitive — `useCalendar` + `ClockCalendarPump` (2026-05-20)
- Step 3 WhenCard live dots — TOD + season chip indicators (commit `36d667c`, 2026-05-20)
- Unified time card — TOD + ToY + playback in DawnTimeline (Wren, 2026-05-20)
- Year-strip seasons + clock/calendar bidirectional sync (commit `5e98533`, 2026-05-20)
- Cartograph 4-anchor seasonal sky scaffold + Preetham composition (Wren, commit `bff87b5`, 2026-05-20) — **partially superseded by pivot below**
- Preetham composition dropped — operator juice is the truth (commit `d6b861b`, 2026-05-20)
- Sky architecture pivot ADR — procedural canon + per-cell overrides + 24-hour grid (parked + queued; see `NOTES.md`, 2026-05-20)

---

## Start here in the morning

**Phase 5b polish + Phase 6 Modulators.** 4b.3 and 5a both shipped 2026-05-20; production runs Atmosphere with directive-driven uniforms against live weather. Open priorities:

- **5b polish** — mount the `AtmosphereDirectiveDriver` in CartographApp + PreviewApp (today only Scene.jsx mounts it). Surface a "current directive" debug readout in Sky & Light card. Fake-weather fixture management UI. Fallback editor. Cloud preset gallery.
- **3b** — Promote directive numerics to TodChannel + add cloud capabilities + per-cloud-in-condition expression flags.
- **6** — Modulators (continuous atmospheric phenomena). See `NOTES.md` 2026-05-20 ADR.
- **7** — Atmospheric consumers (wind field, rain particles, snow + accumulation, lightning). See `NOTES.md` 2026-05-20 ADR.

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
  Atmosphere.jsx                      # SHIPPED 4b.1 — v3 raymarched runtime (cumulus_humilis hardcoded)
  atmosphere-materials.js             # SHIPPED 4b.1 — shader factory + inline GLSL
  Atmosphere.jsx                      # production renderer (post-4b.3)
  SpriteClouds.jsx                    # retires in cleanup commit
  CelestialBodies.jsx                 # IMPORTED — same consumer Stage/Preview mount
  WeatherPoller.jsx                   # untouched; consumes its output downstream

src/lib/
  almanac-eval.js                     # SHIPPED 2026-05-13 (SC.6); no production consumer yet
  weather-payload.js                  # NOT YET WRITTEN — Phase 5

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
