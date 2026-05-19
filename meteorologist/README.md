# Meteorologist

The project's atmospheric authoring system + runtime. Authors a cloud preset library ("the Teapot") and weather-interpretation rules ("the Almanac"); renders volumetric raymarched clouds against a live weather feed.

**This README is the orientation card.** Open this first when starting work; it points at the rest.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `CANON.md` + `STAGE_MIGRATION.md` as topical addenda). Read at session start; flag contradictions during work; update at session end. Stale claims actively mistrain readers.

---

## Status (as of 2026-05-19)

**The standalone app shell ships. Authoring UI works end-to-end for both Teapot (per-cloud) and Conditions (per-rule). Viewport renders sky + tree + placeholder cloud. The v3 raymarched shader is the next sprint.**

| Done | Not yet |
|---|---|
| Schemas (`pipeline/schema/*`) | `<Atmosphere />` v3 raymarched runtime (Phase 4b.1) |
| Validator + cross-schema checks (`pipeline/validate.js`) | `atmosphere-materials.js` shader factory (Phase 4b.1) |
| Teapot — 52 presets, params migrated to TodChannel shape | TodChannel uniform binding to shader (Phase 4b.2) |
| Almanac — 16 rules + immutable defaults sibling | CloudDome retirement + production swap (Phase 4b.3) |
| `meteorologist/serve.js` backend (GET/PUT presets, GET/PUT/Revert almanac) | TodChannel promotion of directive numeric fields (Phase 3b) |
| `src/lib/almanac-eval.js` (shipped 2026-05-13 via SC.6) | Per-cloud-in-condition expression flags (Phase 3b) |
| `/meteorologist.html` standalone app shell | Cloud capabilities (`precipKinds`, `electrified`) on preset.schema (Phase 3b) |
| Top-bar TEAPOT ⎮ CONDITIONS toggle + Look picker | Almanac evaluator hot-mount in Conductor preview (Phase 5) |
| Teapot library + Teacup workstage (13 cloud-param TodChannels, autosave) | Fake-weather fixtures + fixture management UI (Phase 5) |
| Conditions library + Condition editor (When + Directive + Clouds-in-cond + Revert) | Fallback editor (Phase 5) |
| CanaryScene viewport (sky-from-Look + hero tree + flat ground + placeholder cloud) | Cloud preset gallery / thumbnails (Phase 5+) |
| `INTERFACE.md` (operator-facing layout spec) | Camera orbit controls in viewport (Phase 5+) |
| 5 memory entries from this arc | |

**Validation passes:** `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → `ok: 52 presets, 16 rules`.

**Shipped phases (2026-05-19):**
- Phase 1 — scaffold + library views (commit `47c5de0`)
- Phase 2 — Teacup workstage + cloud-param TodChannels (commit `95bad99`)
- Phase 2 chrome — Stage's glass-panel card setup (commit `5fd8f78`)
- Phase 3 — Condition editor (commit `98f3781`)
- Phase 4a — CanaryScene scaffold (commit `6a3fd29`)

---

## Start here in the morning

**Phase 4b.1: the shader.** The single biggest piece of the project. From `SPEC.md § Runtime`:

> `atmosphere-materials.js` shader factory + frag/vert shaders implementing the five photoreal levers: three-tier lighting, silver lining, self-shadowing, domain warping, vertical density gradient. BoxGeometry slab at cloud altitude. Mount in CanaryScene with hardcoded uniforms for `cumulus_humilis` first; dynamic preset binding lands in Phase 4b.2.

Brief for Phase 4b.1 is **not yet drafted.** Tomorrow's first orchestrator task. The phasing rationale (4b split into .1 shader / .2 binding / .3 retirement) is captured in the previous session's handoff conversation; recap:

- **4b.1** — the shader works visually against one hardcoded preset
- **4b.2** — preset params drive shader uniforms via `resolveGroupAtMinute`; slider scrubs affect the viewport
- **4b.3** — retire `CloudDome.jsx` / `SpriteClouds.jsx` per `STAGE_MIGRATION.md`; production swap

The five photoreal levers are described in [`../HANDOFF-clouds-day3-clouddome-v2.md`](../HANDOFF-clouds-day3-clouddome-v2.md) under "Tune to principles, not to a reference image." That document is **still authoritative for shader tuning** until the working `<Atmosphere />` ships and supersedes it. Don't delete it before then.

**The canary scene** for Phase 4b.1 is `src/meteorologist/CanaryScene.jsx` — already mounted and rendering sky+tree+placeholder. Swap CloudDome out for Atmosphere with hardcoded uniforms; the operator can now see what `cumulus_humilis` looks like against `lafayette-square`'s sky.

---

## Documents

In reading order:

1. **[`INTERFACE.md`](./INTERFACE.md)** — operator-facing layout. Teapot ⎮ Conditions, Teacup workstage, slot tabs, right-rail composition. The canonical reference for what the UI is. (Introduced 2026-05-19.)
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — publish-loop placement, consume-from-Stage pattern, directory layout, runtime contract. Where Meteorologist sits in the kit and what it composes from other helpers.
3. **[`SPEC.md`](./SPEC.md)** — full work order. Decisions locked, acceptance criteria. Some rows patched 2026-05-19 (standalone-shell reversal); patches noted in `NOTES.md`.
4. **[`BACKLOG.md`](./BACKLOG.md)** — punchlist + roadmap.
5. **[`NOTES.md`](./NOTES.md)** — historical decisions + EOD records. Read the top entry first; it has the latest context.
6. **[`CANON.md`](./CANON.md)** — what's in the Teapot, what's not, why. Inclusion principles.
7. **[`STAGE_MIGRATION.md`](./STAGE_MIGRATION.md)** — the cleanup commit spec (executes when v3 lands; Phase 4b.3).

---

## What lives where

```
meteorologist/                        # backend + docs (THIS DIR)
  README.md / INTERFACE.md / ARCHITECTURE.md / SPEC.md / BACKLOG.md / NOTES.md
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
  Atmosphere.jsx                      # NOT YET WRITTEN — v3 runtime (Phase 4b.1)
  atmosphere-materials.js             # NOT YET WRITTEN — shader factory (Phase 4b.1)
  atmosphere-shaders/                 # NOT YET WRITTEN — frag/vert source (Phase 4b.1)
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
