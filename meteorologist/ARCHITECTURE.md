# Architecture

How Meteorologist fits into the kit and what it publishes. Read top to bottom; it builds.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `CANON.md` + `STAGE_MIGRATION.md` as topical addenda). Read at session start; flag contradictions during work; update at session end. Stale claims are worse than no claims — they actively mistrain readers.
>
> Sibling docs live in `../cartograph/` (the publish-loop pattern lives there) and `../arborist/` (the helper-app template Meteorologist borrows shape from, minus the separate app shell).

---

## 1. Place in the publish-loop pattern

Meteorologist is one of the kit's helper apps. Each helper authors a specific kind of content and publishes one or more canonical artifacts; the runtime composes them into the rendered scene. See [`../cartograph/ARCHITECTURE.md §1`](../cartograph/ARCHITECTURE.md) for the full pattern.

```
┌────────────────┐    publishes     ┌──────────────────────────────┐
│  Meteorologist │ ───────────────▶ │ public/clouds/presets.json   │ ──▶ Runtime
│  (in Stage)    │ ───────────────▶ │ public/clouds/almanac.json   │
└────────────────┘                  └──────────────────────────────┘
```

**Meteorologist's shape is unusual.** Unlike Cartograph and Arborist — which have their own app shells at `/cartograph.html` and `/arborist.html` — Meteorologist has **no separate app shell**. Its authoring UI lives inside Stage, triggered from the Sky and Light card's "launch meteorologist" button. The publish-loop properties still hold (one helper, canonical artifacts, decoupled runtime consumer); only the editor's housing differs.

Why no shell:
- The Teapot author needs to see clouds rendered against a real-world sun position + sky gradient + post-FX stack. That stack already exists inside Stage; reproducing it in a standalone shell would be duplication and a parity-drift risk.
- The toy 4-way-corner scene is the canary. Stage already knows how to mount the toy.
- The two artifacts are small JSON files validated against schemas — no atlas, no GLB pipeline, no bake server worth its own port (the optional `serve.js` notwithstanding).

**Decision-history pointer:** the rejected alternatives (separate `/meteorologist.html` shell, three-tier Designer/Stage/Preview split internal to the helper) are captured in `NOTES.md §"In-Stage editor housing"`.

---

## 2. The two artifacts

| Artifact | Contents | Schema |
|---|---|---|
| `public/clouds/presets.json` | **The Teapot.** Cloud preset library — WMO species × visually-distinct variants + practical fog/haze + v1.x precipitation stubs. 52 entries scaffolded. | `pipeline/schema/presets-file.schema.json` + per-entry `preset.schema.json` |
| `public/clouds/almanac.json` | **The Almanac.** Rule table: weather payload → atmospheric directive. 16 starter rules + a fallback directive. | `pipeline/schema/almanac.schema.json` |

Two additional schemas describe wire formats, not stored files:

| Schema | What it describes |
|---|---|
| `weather-payload.schema.json` | The normalized weather payload the runtime feeds the Almanac evaluator each frame |
| `directive.schema.json` | The atmospheric directive the Almanac produces (cloud blend, sun tint, halo, light dome, wind) |

Neither artifact is "baked" the way Cartograph bakes `ground.bin`. Saves write directly through validation. There's no draft/published split, no bake button, no ceremony — these are live-edited contracts the runtime reads at startup.

**Cross-schema invariants** (preset-id uniqueness, almanac→preset reference integrity, cloud-weight ≤1.0) are not expressible in JSON Schema; `pipeline/validate.js` layers them on top via `validateLibrary()`.

---

## 3. Composition order at runtime

```
Look's TOD-slot envelope (Sky & Light)
  → Almanac modulation (weather payload → directive)
    → per-Look override (visual styling only)
      → render
```

Per-Look overrides apply to dome visual-styling values (sun tint, halo, light dome) — **never to cloud-math drivers**, never to non-dome channels (Mist/Ambient/Neon are authored per-Look directly in Sky & Light, no Almanac involvement).

**Authored value flow per channel:**

- **Cloud preset** (`{presetId}` per TOD slot) — authored in Stage's new Clouds TodChannel row → persisted in `design.json` under `clouds.values.<slot>.preset` → baked into `scene.clouds: {preset, overrides}` via `bake-scene.js` → consumed by the v3 `<Atmosphere />` runtime.
- **Sun tint / halo / light dome** — authored per Look, override-flavored — apply on top of the Almanac directive at render time.
- **Wind** — published per Look by Meteorologist (direction + speed uniforms). Trees subscribe via `InstancedTrees` shader uniforms; future precipitation + audio layers subscribe too.

Today (2026-05-18) only the channel scaffolding is shipped (SC.6 — see `NOTES.md`). The runtime renderer is still procedural `CloudDome.jsx`; v3 `<Atmosphere />` is unbuilt.

---

## 4. Directory layout

```
meteorologist/                        # THIS DIR — backend + docs
  README.md                           # orientation card
  ARCHITECTURE.md                     # this file
  SPEC.md                             # full work order (FEATURES-shaped)
  BACKLOG.md                          # punchlist (spade work + v1/v2 roadmap)
  NOTES.md                            # historical decisions
  CANON.md                            # Teapot inclusion principles
  STAGE_MIGRATION.md                  # cleanup commit spec (executes when v3 lands)
  package.json                        # ajv dep, validate/bake/serve scripts
  pipeline/
    validate.js                       # ajv validators + cross-schema invariants
    schema/                           # 5 JSON schemas
  serve.js                            # NOT YET WRITTEN — backend service, port 3335
  state/                              # GITIGNORED — not used in v1 (no drafts)

public/clouds/                        # PUBLISHED ARTIFACTS — runtime contracts
  presets.json                        # the Teapot, 52 entries
  almanac.json                        # 16 rules + fallback
  fixtures/                           # NOT YET POPULATED — fake-weather payloads

src/components/
  Atmosphere.jsx                      # NOT YET WRITTEN — v3 runtime component
  atmosphere-materials.js             # NOT YET WRITTEN — shader factory
  atmosphere-shaders/                 # NOT YET WRITTEN — frag/vert source
  CloudDome.jsx                       # v1 procedural shipper (retires when v3 lands)
  SpriteClouds.jsx                    # retires in cleanup commit

src/lib/
  almanac-eval.js                     # v3 evaluator interface — shipped 2026-05-13
                                      # (no production consumer yet; forward-compat)
  weather-payload.js                  # NOT YET WRITTEN — normalizes useWeather output
                                      # against weather-payload.schema.json
```

This shape mirrors `../arborist/` and `../cartograph/` so a contributor (or agent) showing up cold can navigate by analogy. The deviation: no `src/meteorologist/` UI tree, because the editor lives inside `src/cartograph/`'s Stage shell.

---

## 5. Runtime contract

The runtime — Stage shots, Preview, the deployed app — consumes both artifacts read-only at startup:

```js
const presets  = await fetch('/clouds/presets.json').then(r => r.json())
const almanac  = await fetch('/clouds/almanac.json').then(r => r.json())
const directive = selectDirective(weatherPayload, almanac, presets, override)
// directive → <Atmosphere /> uniforms
```

`src/lib/almanac-eval.js` exports `selectDirective(weather, almanac, presets, override)` — a pure function: same inputs → same directive. The evaluator is already shipped (SC.6); a debug-only readout in cartograph's Sky & Light panel can surface "current Almanac preset" before v3 renders it.

**Three mount sites today** for the v1 procedural `CloudDome.jsx` — `Scene.jsx` / `CartographApp.jsx` / `PreviewApp.jsx` — all identical, no fork. When v3 lands, those flip to `<Atmosphere />` per `STAGE_MIGRATION.md`. The toy scene gets a fourth mount (Meteorologist's authoring canary).

---

## 6. Relationship to Cartograph Stage

Meteorologist consumes Stage as its editor host. The integration surfaces:

| Stage surface | What Meteorologist adds |
|---|---|
| Sky & Light card | One new TodChannel row: **Clouds** (slot value = `{ presetId }`). Same primitive as Sky gradient / Mist / Halo. |
| Sky & Light card | A **"launch meteorologist"** button — click swaps scene to toy and takes over the right panel for Teapot/Almanac authoring; top-bar exit restores normal Stage view. |
| Toy toggle (toolbar) | Stays as-is. Developer's shader-R&D entrance, separate door, same room. |
| `bake-scene.js` | Reads `design.clouds` → emits `scene.clouds: {preset, overrides}`. Validates preset id against live `presets.json` (pre-bake hook — see BACKLOG item 3). |

**The slab carries the cloud preset.** Per `project_slab_carries_full_authored_product` — if Sky & Light's Clouds row authors anything, the slab must carry it. SC.6 wired this in May 2026; v3 `<Atmosphere />` will be the production consumer.

---

## 7. Relationship to v1 CloudDome

`src/components/CloudDome.jsx` is the noise-based procedural cloud shipper. It is the **v1 production renderer** until v3 `<Atmosphere />` ships.

- v1 ships LS today with CloudDome doing all cloud rendering.
- Meteorologist is a **separate track**: not a v1 blocker. The Teapot + Almanac + `<Atmosphere />` continue evolving on their own pace; land when ready.
- `STAGE_MIGRATION.md` is the swap-in commit spec. Today three mount sites (Scene/CartographApp/PreviewApp) use CloudDome; the cleanup commit retires `CloudDome.jsx` + `SpriteClouds.jsx` + the dead `CloudDomeV2/V3.jsx` files and flips all sites to `<Atmosphere />`.

---

## 8. Wind contract (cross-helper)

Wind direction + speed are part of the atmospheric directive (Meteorologist publishes them per Look as part of the Almanac output). **Consumers:**

- **InstancedTrees** — subscribes to wind uniforms for sway shader. Trees today read a stub; Meteorologist will own the source-of-truth.
- **CloudDome / `<Atmosphere />`** — cloud movement direction + speed for shader advection.
- **Future:** rain particles (direction), audio (wind sounds gated on speed thresholds), heat-haze (gated on temp + low wind).

Wind belongs to Meteorologist (`/cartograph.html` Stage → Sky & Light), not to any individual consumer. Consumers subscribe; they don't author.

---

## 9. Conventions worth knowing

- **Schemas are versioned by `$id` filename.** `preset.schema.json` is registered both by `$id` and by filename so `$ref`s resolve regardless of authoring style.
- **The validator is strict.** `Ajv({ strict: true })` — unknown keywords throw. Schema authors must extend deliberately, not accidentally.
- **Cross-schema checks live in `validateLibrary()`.** Preset-id uniqueness, almanac→preset reference integrity (including disabled presets), cloud-blend weight ≤1.0. Run via `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json`.
- **The toy is the canary.** Don't build a separate sandbox app. The Atmosphere shader gets mounted against the toy 4-way-corner scene in Cartograph; "works in toy" advances to LS at Browse/Hero/Street for the visibility-at-scale check (memory `feedback_toy_not_proving_ground_for_ls_visibility`).
- **No draft/published split.** Saves write directly through validation. The decision is captured in `NOTES.md`.

---

## 10. Cross-references

- [`./README.md`](./README.md) — orientation, current status
- [`./SPEC.md`](./SPEC.md) — full work order (Teapot + Almanac decisions, acceptance criteria, build order)
- [`./BACKLOG.md`](./BACKLOG.md) — spade work inventory + roadmap
- [`./NOTES.md`](./NOTES.md) — historical decisions (SC.6, strip-vs-wire, editor housing)
- [`./CANON.md`](./CANON.md) — what's in the Teapot today, what's not, why
- [`./STAGE_MIGRATION.md`](./STAGE_MIGRATION.md) — the cleanup commit that retires CloudDome
- [`../cartograph/ARCHITECTURE.md`](../cartograph/ARCHITECTURE.md) — kit-wide publish-loop pattern
- [`../arborist/SPEC.md`](../arborist/SPEC.md) — sibling helper Meteorologist borrows shape from
- `src/lib/almanac-eval.js` — runtime evaluator, shipped 2026-05-13
- `~/.claude/.../memory/MEMORY.md` — running session memory
