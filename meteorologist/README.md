# Meteorologist

The project's atmospheric authoring system + runtime. Authors a cloud preset library ("the Teapot") and weather-interpretation rules ("the Almanac"); renders volumetric raymarched clouds against a live weather feed.

**This README is the orientation card.** Open this first when starting work; it points at the rest.

---

## Status (as of 2026-05-04)

**Architecture is locked. Schemas + scaffolds are on disk. No runtime, no UI, no shader yet.**

| Done | Not yet |
|---|---|
| Schemas (`pipeline/schema/*`) | `<Atmosphere />` runtime component |
| Validator + cross-schema checks (`pipeline/validate.js`) | `atmosphere-materials.js` shader factory |
| Teapot scaffold — 52 presets (`public/clouds/presets.json`) | Almanac evaluator (`src/lib/almanac-eval.js`) |
| Almanac scaffold — 16 rules (`public/clouds/almanac.json`) | `serve.js` backend |
| `meteorologist/package.json` + `node_modules` (ajv installed) | Stage's Clouds TodChannel row |
| SPEC.md, CANON.md, STAGE_MIGRATION.md | Meteorologist mode UI (Library / Almanac Editor / Fake-weather) |
|   | Cleanup commit (CloudDome retirement) |

**Validation passes:** `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → `ok: 52 presets, 16 rules`.

---

## Start here in the morning

**Build order step 1: the shader.** From `SPEC.md § Build order`:

> 1. **`atmosphere-materials.js` + raymarch shader.** Get a hardcoded `cumulus_humilis` rendering in the toy scene with three-tier lighting + silver lining + self-shadowing + domain warping + vertical density gradient. The visual core; everything else hangs off this.

The five photoreal levers are described in [`../HANDOFF-clouds-day3-clouddome-v2.md`](../HANDOFF-clouds-day3-clouddome-v2.md) under "Tune to principles, not to a reference image." That document is **still authoritative for shader tuning** until the working `<Atmosphere />` ships and supersedes it. Don't delete it before then.

The toy scene is the canary. Mount the shader against it directly in Cartograph (`scene === 'toy'` today; later renamed to `'meteorologist'` per `STAGE_MIGRATION.md`). Do NOT build a separate sandbox app — the toy IS the sandbox.

---

## Documents

In reading order:

1. **[`SPEC.md`](./SPEC.md)** — full work order. Three apps + one runtime, the Teapot + Almanac, decisions locked, acceptance criteria, build order.
2. **[`CANON.md`](./CANON.md)** — what's in the Teapot (52 entries), what's not, why. Inclusion principles. Sourced from WMO Cloud Atlas.
3. **[`STAGE_MIGRATION.md`](./STAGE_MIGRATION.md)** — exact list of file edits in the cleanup commit. Three additions to Stage (Clouds row, launch button, right-panel takeover) + four mount swaps + nine file deletions. No file moves out of Stage.

The conversational history that produced this architecture is captured in `~/.claude/projects/-Users-jacobhenderson/memory/project_meteorologist_helper.md` — including the architectural detours that were considered and rejected. **Do not re-litigate those rejections** unless circumstances have meaningfully changed.

---

## What lives where

```
meteorologist/                        # backend + docs (THIS DIR)
  README.md                           # this file
  SPEC.md                             # work order
  CANON.md                            # Teapot inclusion principles
  STAGE_MIGRATION.md                  # cleanup commit checklist
  package.json                        # ajv dep
  pipeline/
    validate.js                       # ajv validators + cross-schema checks
    schema/                           # 5 JSON schemas
  serve.js                            # NOT YET WRITTEN — backend service, port 3335
  state/                              # GITIGNORED — not used in v1 (no drafts)

public/clouds/                        # PUBLISHED ARTIFACTS — runtime contracts
  presets.json                        # the Teapot, 52 entries
  almanac.json                        # 16 starter rules
  fixtures/                           # NOT YET POPULATED — fake-weather payloads

src/components/
  Atmosphere.jsx                      # NOT YET WRITTEN — runtime component
  atmosphere-materials.js             # NOT YET WRITTEN — shader factory
  atmosphere-shaders/                 # NOT YET WRITTEN — frag/vert source
  CloudDome.jsx, CloudDomeV2/V3.jsx,  # TO DELETE in cleanup commit
    SpriteClouds.jsx, CloudsActive.jsx
  WeatherPoller.jsx                   # untouched; Meteorologist consumes its output

src/lib/
  almanac-eval.js                     # NOT YET WRITTEN — pure evaluator
  atmosphere-compose.js               # NOT YET WRITTEN — composition order resolver

src/cartograph/
  CartographSkyLight.jsx              # gains Clouds row (one new <StoreChannel>)
  TodChannel.jsx                      # gains ChannelPreset field type
  skyLightChannels.js                 # gains CLOUDS_FIELDS + CLOUDS_FLAT_DEFAULTS
  TeapotLibrary.jsx                   # NOT YET WRITTEN
  AlmanacEditor.jsx                   # NOT YET WRITTEN
  FakeWeatherPanel.jsx                # NOT YET WRITTEN
  stores/useCartographStore.js        # gains clouds channel state + rightPanelMode

src/toy/                              # the canary scene — already in place
  ToyBuildings.jsx, ToyTrees.jsx, ToyTerrain.jsx
src/data/toy/
  toy-ribbons.json, toy-lamps.json
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
