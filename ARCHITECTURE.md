# Architecture

How this codebase is organized and how its pieces fit together. Read top to bottom; it builds.

---

## 1. The publish-loop pattern

The codebase is a **public-facing runtime app** plus a small set of **standalone helper apps**. Each helper authors a specific kind of content and publishes one canonical artifact. The runtime composes those artifacts into the rendered scene.

```
┌────────────────┐    publishes     ┌──────────────────────────────┐
│  Cartograph    │ ───────────────▶ │ public/looks/<id>/ground.svg │ ──┐
└────────────────┘                  └──────────────────────────────┘   │
                                                                       │
┌────────────────┐    publishes     ┌──────────────────────────────┐   │   ┌──────────┐
│  Stage         │ ───────────────▶ │  stage-config.json (future)  │ ──┼──▶│ Runtime  │ ──▶ pixels
└────────────────┘                  └──────────────────────────────┘   │   └──────────┘
                                                                       │
┌────────────────┐    publishes     ┌──────────────────────────────┐   │
│  Arborist      │ ───────────────▶ │ public/trees/<species>/...   │ ──┘
│  (planned)     │                  └──────────────────────────────┘
└────────────────┘
```

**Properties of this pattern, used everywhere:**

- **Helpers are decoupled.** Cartograph never imports Arborist's code; the runtime never imports a helper's editor surfaces. They only know about each other through the artifacts.
- **Artifacts are pristine.** No helper-specific scaffolding gets baked in. An artifact is a clean handoff format that any consumer (this app, a future kiosk, an embedded preview) can read without owning the producer.
- **Helpers are dev-time tools.** They run locally. They're not deployed alongside the runtime.
- **One artifact per helper, per concern.** If you ever feel like a helper should publish two artifacts, that's usually two helpers.

When adding a new helper, follow this pattern verbatim: standalone editor app → one published artifact → runtime consumer that reads it. See `cartograph/README.md` for the established template.

---

## 2. Geometry vs. styling — the Designer / Stage split

Cartograph itself is internally split the same way the larger system is. Two roles, two tools, one app:

- **Designer = shape.** Survey, Measure, Plant *(future)*, centerlines, caps, anchors, boundary, tree positions. Geometry edits propagate to *every* Look.
- **Stage = look.** Color, visibility, materials, shaders, time-of-day. Per-Look styling.

This same split shows up in every helper that has both kinds of editing:

| Concern | Owner |
|---|---|
| Where the streets go | Cartograph Designer |
| What the asphalt is colored | Stage Surfaces (per Look) |
| Which trees stand at which positions | Cartograph Designer (Plant tool, v1.1) |
| What color sugar maples are | Stage Surfaces (per Look) |

**Looks vary styling, never shape.** That rule is what lets the runtime swap Looks at zero cost — just a different `design.json` + `ground.svg`, the geometry is identical.

---

## 3. The Looks model

A **Look** is a styling snapshot. Each Look is `{ design.json, ground.svg }` plus eventually shader params. The user always works in *some* Look.

Three layers, in order:

1. **Working draft (autosave, always on).** Every panel tweak hits the active Look's `design.json` within ~300ms. Survives reloads. No prompts.
2. **Looks (named saved configurations).** First-class names: `lafayette-square` (the project's 0-state, can't be deleted), `valentines`, `cardinals-win`, `winter`. User explicitly forks via "＋ Save as new Look…". Each carries its own autosaved working state.
3. **Stage shaders (runtime, no per-Look persistence).** Future. Lives in a stage-config layer; applies on top of whatever Look is active.

**The implicit bake.** Going Designer → Stage silently re-bakes the active Look (so the Stage SVG reflects current geometry). The user never explicitly "saves the bake" — that language is misleading. The deliberate save action is *forking* into a new named Look.

**Looks are material-keyed, never feature-keyed.** A Look's `design.json` says *"asphalt is pink"*, not *"the asphalt of street id chain-43A12 is pink"*. So adding geometry in Designer never invalidates a Look — new streets inherit the active Look's rules, re-bake just enlarges the SVG with consistent styling. **Designer → maintain → Stage is purely additive.**

See `memory/project_cartograph_looks_model.md` for the full decisions.

---

## 4. Per-helper directory layout

Helpers follow a consistent directory shape so a contributor (or agent) showing up cold can navigate any of them by analogy:

```
<helper>/                  # Build-side: CLIs, server, data sources
  serve.js                 # (optional) Node backend serving the helper's API
  bake-*.js                # CLI: produces the artifact
  data/                    # Inputs the bake reads (geometry, point clouds, etc.)
  README.md                # Contract: inputs, output, endpoints, commands

src/<helper>/              # Runtime-side: React UI for the helper
  *.jsx                    # Editor surfaces, panels, tools
  stores/use*Store.js      # Zustand state for that helper

public/<helper-output>/    # Where the helper's published artifacts live
  …                        # Served as static assets to the runtime
```

Cartograph is the canonical example today. Arborist will mirror this when it's built.

---

## 5. Runtime composition

The runtime is the public app at `/`. It mounts the rendered neighborhood, loads each helper's artifact, and composes them. The runtime never edits anything — it's read-only over the artifacts.

Key runtime entry points:

- `src/components/Scene.jsx` — main app scene tree
- `src/cartograph/SvgGround.jsx` — consumes a Look's `ground.svg`, renders as flat-shaded ground (lighting + shaders are Pass C work)
- `src/components/InstancedTrees.jsx` *(planned)* — consumes Arborist's species library + tree positions

The runtime also re-renders live edits in Designer/Stage during authoring sessions — color changes in Stage Surfaces show on screen *immediately*, not on next bake. The bake then captures a snapshot for handoff.

---

## 6. Data flow summary

```
Skeleton + OSM ─▶ ribbons.json ─▶ bake-svg.js ─▶ ground.svg ─▶ SvgGround
                                       ▲
                                       │ uses
                              looks/<id>/design.json
                                       ▲
                                       │ writes
                              Stage Surfaces (live)
                                       ▲
                                       │ autosaves
                              cartograph store

LiDAR (FOR-species20K) ─▶ tree-bake.py ─▶ trees/<species>/*.glb ─▶ InstancedTrees
                                                                          ▲
                                                                          │ positions
                                                                  park_trees.json
```

---

## 7. Conventions worth knowing

- **Look IDs are slugged user names.** `lafayette-square`, `valentines`, `cardinals-win`. Default Look = `lafayette-square`, can't be deleted.
- **`overlay.json` carries geometry only.** Centerlines, caps, couplers, segment measures. The design block was extracted into per-Look `design.json` files.
- **Materials, layers, land-use** all map through `BAND_TO_LAYER` in `src/cartograph/m3Colors.js`. The bake honors the active Look's `layerVis` to skip hidden materials.
- **Coordinate systems.** World-meters with origin at the neighborhood center. `park_trees.json` and `park_water.json` are park-local (rotated 9.2°). `park_paths.json` is world-aligned. (See `memory/feedback_park_data_frames.md`.)
- **Park trees are currently muted.** Re-enable by removing the `{false && <ParkTrees />}` guard in `src/components/LafayettePark.jsx`.

---

## 8. What this enables

- **A new Look = a new `design.json` + `ground.svg`.** No code changes, no migrations.
- **A new helper (Arborist, Park Composer, etc.) = a new directory + a published artifact.** No coupling to existing helpers.
- **A new neighborhood (someday) = new geometry + a new default Look.** The helpers and runtime stay the same.

This is a kit, not a bespoke build. The pattern is the value.
