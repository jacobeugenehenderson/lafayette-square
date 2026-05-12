# Meteorologist — work order

> **Starting fresh?** Read [`README.md`](./README.md) first — it's the orientation card with current status and the morning's first task. This document is the full work order.

Build the **Meteorologist**: the project's atmospheric authoring system + runtime. Authors the cloud preset library ("the Teapot") and the weather-interpretation rules ("the Almanac"); renders volumetric raymarched clouds against a live weather feed.

Read first, in order:

1. [`./README.md`](./README.md) — orientation, current status, what's done vs. not yet
2. [`../cartograph/ARCHITECTURE.md`](../cartograph/ARCHITECTURE.md) — Designer / Stage split, Looks model
3. [`../arborist/SPEC.md`](../arborist/SPEC.md) — sibling helper this borrows shape from (the **runtime artifact** + **schema validation** pattern, not the helper-app shell — Meteorologist has no separate app shell, see below)
4. [`./CANON.md`](./CANON.md) — what's in the Teapot today, what's not, why
5. [`./STAGE_MIGRATION.md`](./STAGE_MIGRATION.md) — the precise list of file edits in the cleanup commit

---

## Mission

A meteorologist owns the sky. Given a live weather payload, it produces a complete atmospheric directive — which clouds to render, where the sun sits, how the light dome looks, how hard the wind blows trees — and the runtime renders accordingly. The directive smoothly tweens as conditions change. Authoring of the underlying preset library and rule table happens inside Stage; the runtime is loaded everywhere the world is rendered (Stage, Preview, production).

---

## Architecture

### Three apps, one runtime

| | URL | Role |
|---|---|---|
| **Stage** (the studio) | `/cartograph` | Authoring environment. Launch Meteorologist mode from inside the Sky and Light card to author the Teapot + Almanac against the toy canary scene. |
| **Preview** | `/preview` | "The real preview" — full neighborhood + live `WeatherPoller` running through the published Almanac → `<Atmosphere />`. No authoring. |
| **Production** | `/` | Same runtime as Preview, public-facing. |

### The two artifacts the Meteorologist publishes

- `public/clouds/presets.json` — **the Teapot.** WMO canon × visually-distinct species + practical fog/haze + v1.x precipitation stubs. Currently 52 entries, scaffolded against the schema. See [`CANON.md`](./CANON.md).
- `public/clouds/almanac.json` — **the Almanac.** Rule table mapping weather payloads to atmospheric directives. ~16 starter rules.

Neither is "baked" the way Cartograph bakes ground.svg. Saves write directly through validation. There's no draft/published split, no bake button, no ceremony — these are live-edited contracts the runtime reads at startup.

### Authoring entry point

- Stage's existing **Sky and Light** card gains one new TodChannel row: **Clouds**. Same primitive as the other rows (Sky gradient, Mist, Halo, etc.) — keyframeable per TOD slot. The slot value is `{ presetId }`: which Teapot preset is the Look's default at that TOD.
- Inside the Clouds row, a **"launch meteorologist"** button. Click →
  - Scene swaps to toy (4-way corner from `src/toy/Toy*.jsx`).
  - Right panel takes over with the Meteorologist authoring surfaces (see "UI" below).
  - Top-bar exit button restores normal Stage view.
- The existing Toy toggle in Cartograph's toolbar stays as-is — it's the developer's shader-R&D entrance, separate door, same room. Two affordances, two purposes.

### Composition order at runtime

```
Look's TOD-slot envelope (Sky and Light)
   → Almanac modulation (weather → directive)
      → per-Look override (visual styling only)
         → render
```

Per-Look overrides apply to dome visual-styling values (sun tint, halo, light dome) — never to cloud-math drivers, never to non-dome channels (Mist/Ambient/Neon are authored per-Look directly in Sky and Light, no Almanac involvement).

---

## Decisions locked — DO NOT re-litigate

| Decision | Choice |
|---|---|
| Cloud representation | Procedural parametric raymarch. Math, not bakes. No KTX2, no GLB, no texture memory cost. |
| Volume geometry | Bounded slab at cloud altitude (y ∈ [800m, 2200m] world space). |
| Phone LoD | One shader, three quality tiers via `uQualityTier`. Half-res raymarch + bilateral upsample on phone. |
| Stylization | Schema reserves a post-pass uniform block; UI deferred to v1.x. |
| Save model | Saves write directly to `public/clouds/*.json` via `serve.js` after validation. No bake ceremony, no drafts. |
| Authoring location | Inside Stage, triggered from Sky and Light → Clouds row → "launch meteorologist." NOT a separate `/meteorologist` app. |
| Authoring scene | Toy 4-way corner (`src/toy/Toy*.jsx`). Mounted via the same `StageCamera` rig as production. |
| Fog | Rolls into the Clouds row — fog presets (`fog_ground`, `fog_valley`, `haze_*`) are low-altitude cloud presets in the Teapot, rendered by the same shader. No separate Fog channel in v1. |
| Wind ownership | Almanac directive's `wind.scale` / `wind.dir` published via `useWindState` zustand slice. Trees (Arborist's `uWindPhase`), pennants, future precip read from this single source. |
| Sun + light dome ownership | Almanac drives defaults; per-Look overrides win. |
| Per-Look override scope | Only dome visual-styling values. Never cloud-math drivers. Never Almanac rules. |
| Transition timing | Default `transitionMs: 60_000` (1 min lerp), tied to 5-min `POLL_INTERVAL` in `WeatherPoller.jsx`. Per-rule overrides allowed. |
| Future weather phenomena | Rain, snow, lightning stubbed in schema (`enabled: false` presets) from day one; rendering deferred to v1.x. |
| Shared shader factory | `src/components/atmosphere-materials.js` — single source for the volume material, used by `<Atmosphere />` runtime; same shader everywhere it mounts. |
| Frontend dir | NONE. Meteorologist's authoring cards live in `src/cartograph/`, conditionally rendered when `scene === 'meteorologist'`. The `meteorologist/` dir holds backend only. |

---

## The Teapot (preset library)

Authored as a JSON parameter set per entry. Each preset is `{ id, label, kind, wmo, params, ... }`. Cloud presets carry 13 numeric params (noiseSeed, octaves, coverage, density, baseAlt, thickness, warpFreq, warpAmp, sunScatter, ambientFloor, edgeSilver, shadowStrength, drift) consumed as shader uniforms.

Currently scaffolded at `public/clouds/presets.json`: **52 entries** — 38 cloud morphologies (10 WMO genera × visually-distinct species), 4 fog/haze, 1 `clear_sky` marker, 9 v1.x stubs. See [`CANON.md`](./CANON.md) for what's in / what's out.

Schema: `pipeline/schema/preset.schema.json`. Modifiers (incus, mamma, virga, asperitas, etc.) are flags layered by the shader, not standalone presets.

---

## The Almanac

Rule table mapping weather-payload ranges to atmospheric directives. Evaluated in order; first match wins. Boundary smoothing per rule via `softness`. Per-rule `transitionMs` overrides the global default.

Schema: `pipeline/schema/almanac.schema.json`. Currently scaffolded at `public/clouds/almanac.json` with ~16 rules covering the realistic weather space (clear, fair cumulus, building convection, mackerel sky, halo cirrostratus, overcast pre-rain, steady rain, thunderstorm, post-storm mammatus, snow, blizzard, morning fog, summer haze, etc.) plus a fallback.

Evaluator: `src/lib/almanac-eval.js`. Pure function. Imported by both `serve.js` (for fixture roundtrip validation) and the runtime (for live evaluation).

---

## Runtime

### `src/components/Atmosphere.jsx` (new)

Single component, mounted everywhere `<CloudDome />` was. Reads from a small zustand slice driven by:

```
WeatherPoller → useSkyState → almanac-eval → directive → Atmosphere uniforms
```

- BoxGeometry slab at cloud altitude. Raymarched in fragment shader.
- For multi-preset blends (transitioning weather), the shader samples each preset's params and weights the contribution per ray sample. Cap at 3 to keep the shader bounded.
- Reads `uQualityTier` from a new `useDeviceTier` hook (UA + WebGL renderer + first-frame perf sample).

### `src/components/atmosphere-materials.js` (new)

The shader factory. Single source for the volume material; takes a directive and a quality tier, returns a configured material. The five photoreal levers from `HANDOFF-clouds-day3-clouddome-v2.md` are all present:

1. **Three-tier lighting** (sun-side cap warm-bright, body neutral, shadow-side cool-dark) — biggest lever
2. **Silver lining** (Mie forward-scatter on thin sun-facing edges)
3. **Self-shadowing** (4–8 step shadow march toward sun, exp falloff)
4. **Domain warping** (cauliflower lobing — `worldPos + warp × noise(worldPos × freq)`)
5. **Vertical density gradient** (full middle, taper top + bottom — flat cumulus bases for free)

### Wind / sun / light dome cross-talk

- `directive.wind.scale` / `wind.dir` → published via `useWindState`. Arborist trees + pennants + future precip read it.
- `directive.sun` and `directive.lightDome` → consumed by `StageSky.jsx` (which already reads channel state; just composes the Almanac modulation in).
- Per-Look override precedence: explicit override > Almanac directive > runtime fallback. Implemented in a small composer at `src/lib/atmosphere-compose.js` that everyone reads from.

### Phone LoD

| Tier | Steps | Self-shadow steps | Render scale |
|---|---|---|---|
| `desktop_high` | 24 | 6 | 1.0 |
| `desktop_low` / `phone_high` | 12 | 3 | 0.75 |
| `phone_low` | 6 | 0 (analytic) | 0.5 |

Half-res raymarch + bilateral upsample is the default mobile path. No forked codebase.

---

## Authoring UI (Meteorologist mode in Stage)

Triggered from Sky and Light → Clouds row → "launch meteorologist." On entry: scene swaps to toy, right panel content swaps to the Meteorologist surfaces. Exit returns to normal Stage.

### Right-panel cards (in Meteorologist mode)

1. **Teapot Library** — gallery of all presets in `presets.json`. Filter by `kind`, by tag, by altitude. Click a preset → opens its parameter rows inline (Tuner is not a separate surface; it's just expansion within the Library card). Each parameter is a TodChannel-style row with the existing primitives (slider / color / toggle). Compare slot at the top so the operator can A/B against another preset live.
2. **Almanac Editor** — rule list (left), rule editor (center), fake-weather panel (right). Range sliders for each `when` field, multi-select preset weights for `directive.clouds`, optional sun/lightDome/wind/precip. Fixture management at top (load/save weather payloads from `public/clouds/fixtures/`). Coverage heatmap at the bottom flags rule gaps.
3. **Fake-weather panel** — sliders for every weather field; the toy preview reflects what the Almanac would direct. Sliders for the *primary* fields (cloudCover, precipMmHr, windKph, sunElevation) on page 1; secondary fields (humidity, pressure, temp, stormDistance) on page 2 to keep the panel narrow on mobile.
4. **Save** — writes to `public/clouds/presets.json` + `almanac.json` via `serve.js` after validation. No bake button. No drafts.

### What lives in Stage normally (NOT in Meteorologist mode)

- The **Clouds** TodChannel row in Sky and Light is normal Stage UX. Operator can scrub TOD slots, attach/detach slots, set ramp-in/out, and pick a Teapot preset id per slot — all without launching Meteorologist mode. The launch button is for editing the Teapot/Almanac themselves.

---

## Backend

### `meteorologist/serve.js`

Local Node service, port 3335, vite-proxied at `/api/meteorologist/*`.

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/presets` | Read `public/clouds/presets.json`. |
| `PUT`  | `/presets` | Validate full presets file via `pipeline/validate.js`, write to `public/clouds/presets.json`. |
| `GET`  | `/almanac` | Read `public/clouds/almanac.json`. |
| `PUT`  | `/almanac` | Validate via `pipeline/validate.js`, write to `public/clouds/almanac.json`. |
| `GET`  | `/fixtures` / `/fixtures/:name` | List / read weather fixtures. |
| `PUT`  | `/fixtures/:name` | Save a fake-weather fixture. |
| `POST` | `/evaluate` | Body: weather payload. Returns the directive `almanac-eval.js` would produce. Used by Conductor's preview. |

No `bake` endpoint. Saves are direct.

### Dev integration

```jsonc
"dev": "concurrently … \"npm:dev:meteorologist\"",
"dev:meteorologist": "node meteorologist/serve.js"
```

Vite proxy `/api/meteorologist/*` → `http://localhost:3335`.

### Schemas (already authored)

```
meteorologist/pipeline/schema/preset.schema.json
meteorologist/pipeline/schema/presets-file.schema.json
meteorologist/pipeline/schema/almanac.schema.json
meteorologist/pipeline/schema/weather-payload.schema.json
meteorologist/pipeline/schema/directive.schema.json
meteorologist/pipeline/validate.js   # ajv validators + cross-schema checks (preset id uniqueness, ref integrity, weight sum ≤ 1.0)
```

---

## Acceptance criteria

The build is complete for v1 when **all** of these are true:

1. `meteorologist/serve.js` runs on port 3335; vite proxy wired; dev script includes it.
2. PUT to `/presets` and `/almanac` validate via `pipeline/validate.js` and reject malformed input loudly. Round-tripped output is byte-stable.
3. Stage's Sky and Light card has a new **Clouds** TodChannel row. Per-TOD-slot value is a Teapot preset id (selectable via dropdown).
4. The Clouds row's **"launch meteorologist"** button swaps scene to toy + replaces right panel content with Meteorologist authoring surfaces.
5. **Teapot Library** card lists all 52 presets, filterable, with inline parameter editing and A/B compare.
6. **Almanac Editor** card edits rules, fake-weather sliders drive the live toy preview through `almanac-eval.js`, fixtures save/load.
7. **Save** writes `presets.json` + `almanac.json` directly; no bake step.
8. **`Atmosphere.jsx` mounted** in Stage, Preview, and Production runtime. Replaces every `CloudDome*` / `SpriteClouds` / `CloudsActive` mount. Legacy files deleted in same commit.
9. **Phone LoD verified** — Preview's phone slice maintains ≥ 30 fps with `phone_low` tier active.
10. **Desktop quality verified** — full Hero shot ≥ 50 fps with `desktop_high` tier active.
11. **Three-tier lighting visibly present** on `cumulus_humilis` and `cumulonimbus_capillatus`.
12. **Silver lining** visible on thin cloud edges with low backlit sun.
13. **Self-shadowing** visibly differentiates thick vs. thin cumulus regions.
14. **Domain warping** produces cauliflower lobing — `cumulus_humilis` reads as puffs, not noise.
15. **Tweening works** — fake-weather changes in the Almanac Editor smoothly transition the toy preview over `transitionMs`. Same in Preview when live weather updates.
16. **Wind cross-talk** — directive's `wind.scale` propagates through `useWindState` and visibly moves Arborist trees.
17. **Per-Look override** — a Look's `atmosphereOverrides.lightDome` overrides the Almanac in that Look only.
18. **Preview integration** — `/preview` renders the active Look + live weather payload through the published Almanac → `<Atmosphere />` end-to-end.

**Stretch (nice but not required):**
- Stylization post-pass UI exposed.
- Rain rendering (the simplest of the deferred phenomena).
- Cubemap snapshot per preset (operator-facing reference card).

---

## Out of scope (DO NOT BUILD)

- Rain / snow / lightning rendering — schema yes, render no. v1.x.
- Particle systems for precipitation. Even when v1.x ships rain, it'll be a screen-space pass on the Atmosphere shader, not a particle emitter.
- Live weather-service integration in the helper. Almanac Editor is fixture-driven; runtime owns the live feed.
- Authoring-tool exports (Houdini / Blender / etc.). Math-generated, full stop.
- 3D-texture baked volumes (KTX2). Decided against in favor of pure procedural.
- Per-instance / per-cell cloud editing.
- Multiple shots. Hero only (with phone slice).
- Replacement of `WeatherPoller`. Meteorologist consumes its output.

---

## Build order

1. **`atmosphere-materials.js` + raymarch shader.** Get a hardcoded `cumulus_humilis` rendering in the toy scene with three-tier lighting + silver lining + self-shadowing + domain warping + vertical density gradient. The visual core; everything else hangs off this.
2. **`Atmosphere.jsx`** — slab geometry, hardcoded directive. Mount in Stage. Verify it renders.
3. **`useDeviceTier` hook + quality-tier uniform** wiring. Verify phone LoD switches.
4. **`almanac-eval.js`** — pure function. Tested against fixtures.
5. **`serve.js` skeleton** with GET endpoints serving the existing `presets.json` / `almanac.json`.
6. **Clouds TodChannel row** in Stage's Sky and Light card. Authors per-Look TOD-slot preset selection. No "launch" button yet.
7. **Wire `Atmosphere.jsx` to live data** — replace hardcoded directive with `evaluate(useSkyState())` going through the Almanac. Tweening over `transitionMs`.
8. **"Launch meteorologist"** button + scene swap + right-panel takeover scaffold (no editing yet).
9. **Teapot Library card** — gallery, filters, inline parameter editing, A/B compare.
10. **Almanac Editor card** — rule list, rule editor, fake-weather panel, fixture management, coverage heatmap.
11. **PUT endpoints + Save** — validation, write, error-on-malformed.
12. **Wind / sun / lightDome cross-talk** — `useWindState`, override precedence in `StageSky.jsx`.
13. **Preview integration** — confirm `/preview` renders live atmosphere end-to-end.
14. **Cleanup commit** — see [`STAGE_MIGRATION.md`](./STAGE_MIGRATION.md).

---

## Cross-references

- [`./CANON.md`](./CANON.md) — Teapot inclusion principles and roster
- [`./STAGE_MIGRATION.md`](./STAGE_MIGRATION.md) — cleanup commit checklist
- [`../arborist/SPEC.md`](../arborist/SPEC.md) — sibling helper for the artifact + schema pattern
- [`../HANDOFF-sky-and-light.md`](../HANDOFF-sky-and-light.md) — current sky/light pipeline
- WMO Cloud Atlas: https://cloudatlas.wmo.int/en/clouds-genera.html
