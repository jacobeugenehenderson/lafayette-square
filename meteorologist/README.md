# Meteorologist

The project's atmospheric authoring system + runtime. Authors a cloud preset library ("the Teapot") and weather-interpretation rules ("the Almanac"); renders volumetric raymarched clouds against a live weather feed.

**This README is the orientation card.** Open this first when starting work; it points at the rest.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `CANON.md` + `STAGE_MIGRATION.md` as topical addenda). Read at session start; flag contradictions during work; update at session end. Stale claims actively mistrain readers.

---

## Status (as of 2026-05-20)

**Standalone app shell + authoring UI + v3 raymarched cloud shader all ship. The cloud shader is hardcoded to `cumulus_humilis` values; TodChannel uniform binding (Phase 4b.2) is next.**

| Done | Not yet |
|---|---|
| Schemas (`pipeline/schema/*`) | TodChannel uniform binding to shader (Phase 4b.2) |
| Validator + cross-schema checks (`pipeline/validate.js`) | CloudDome retirement + production swap (Phase 4b.3) |
| Teapot — 52 presets, params migrated to TodChannel shape | TodChannel promotion of directive numeric fields (Phase 3b) |
| Almanac — 16 rules + immutable defaults sibling | Per-cloud-in-condition expression flags (Phase 3b) |
| `meteorologist/serve.js` backend (GET/PUT presets, GET/PUT/Revert almanac) | Cloud capabilities (`precipKinds`, `electrified`) on preset.schema (Phase 3b) |
| `src/lib/almanac-eval.js` (shipped 2026-05-13 via SC.6) | Almanac evaluator hot-mount in Conductor preview (Phase 5) |
| `/meteorologist.html` standalone app shell | Fake-weather fixtures + fixture management UI (Phase 5) |
| Top-bar TEAPOT ⎮ CONDITIONS toggle + Look picker | Fallback editor (Phase 5) |
| Teapot library + Teacup workstage (13 cloud-param TodChannels, autosave) | Cloud preset gallery / thumbnails (Phase 5+) |
| Conditions library + Condition editor (When + Directive + Clouds-in-cond + Revert) | Camera orbit controls in viewport (Phase 5+) |
| CanaryScene viewport (sky-from-Look + hero tree + flat ground) | Mobile quality tier (`uQualityTier`) (Phase 5+) |
| `<Atmosphere />` v3 raymarched cloud shader (5 photoreal levers, cumulus_humilis hardcoded) | Multi-preset blending (per `directive.clouds[]`) (Phase 5+) |
| `atmosphere-materials.js` shader factory + inline GLSL | |
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
- Kit clock+calendar primitive — `useCalendar` + `ClockCalendarPump` (2026-05-20)
- Step 3 WhenCard live dots — TOD + season chip indicators (commit `36d667c`, 2026-05-20)
- Unified time card — TOD + ToY + playback in DawnTimeline (Wren, 2026-05-20)
- Year-strip seasons + clock/calendar bidirectional sync (commit `5e98533`, 2026-05-20)

---

## Start here in the morning

**Phase 4b.2: TodChannel uniform binding.** Wire active preset's `params` through `resolveGroupAtMinute(channel, currentMinute)` to feed `<Atmosphere />`'s 13 shape + lighting uniforms each frame. Slider scrubs in Teacup's right rail will visibly affect the viewport. Animated channels (operator-keyframed slots) lerp between TOD waypoints as time scrubs.

The wiring touches:
- `src/components/Atmosphere.jsx` — replace hardcoded uniform initializers with per-frame reads from the active preset.
- `src/meteorologist/stores/useMeteorologistStore.js` — expose `activePreset` (or `activePresetId` consumers) for Atmosphere to subscribe to. The store's already shaped right; just one more selector.
- `src/cartograph/animatedParam.js` — `resolveGroupAtMinute(channel, minute)` is the resolver to call; it already handles both flat and animated channel shapes.

`useTimeOfDay` from `src/hooks/useTimeOfDay` provides the current minute; CelestialBodies + DawnTimeline already drive it.

**Phase 4b.1 verification** is still pending Jacob's eyes (HANDOFF checklist items 1–5 + 9). If the cloud reads as a uniform gray blob, the most likely culprit is the cloudNormal density-gradient step (`eps=30m` vs `uWarpFreq=0.001`'s ~1000m wavelength); the baby's commit body flags this debug pointer. Stable visual confirmation before launching Phase 4b.2 is the right gate.

**The phasing arc continues:**

- **4b.2 (next)** — TodChannel binding; the right-rail sliders affect the viewport.
- **4b.3** — Retire `CloudDome.jsx` / `SpriteClouds.jsx` per `STAGE_MIGRATION.md`; production swap. The `CloudCoverSeed` Phase-4a expedient comes out.
- **3b** — Promote directive numerics to TodChannel + add cloud capabilities + per-cloud-in-condition expression flags. After 4b lands so the temporal modulation is visually validatable.
- **5** — Fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery + mobile quality tier + multi-preset blending + camera orbit.

The five photoreal levers reference is in [`../HANDOFF-clouds-day3-clouddome-v2.md`](../HANDOFF-clouds-day3-clouddome-v2.md). **That doc is now superseded in working code** by `src/components/atmosphere-materials.js`; keep the HANDOFF alive only until Phase 4b.1 is visually verified, then it can retire alongside CloudDome in 4b.3.

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
8. **[`STAGE_MIGRATION.md`](./STAGE_MIGRATION.md)** — the cleanup commit spec (executes when v3 lands; Phase 4b.3).

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
  CloudDome.jsx                       # v1 procedural shipper (retires Phase 4b.3)
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
