# Brief 28 (STUB — DEFERRED) — Streamline asset intake ("+ Add Model / + Add Leaves")

> **Status: deferred.** Operator flagged 2026-05-25 — *"not for right now, but we need to streamline the intake process."* **Pull forward when adding assets becomes a routine cadence** (rather than the one-time gap-fill of the §2 acquisition list). For the current gap-fill, route new assets through Boz/CLI (below) — zero new code.

## Why it matters (operator)

**Mix-and-match is central to the library** — one chassis × N bark refs × N leaf packs → many species reads. Every new *part* (chassis / bark / leaf pack) multiplies the compositional space, so smooth **part-intake is foundational to the library's value**, not peripheral. The intake friction below is the bottleneck on growing that space.

## The friction today (per asset type)

- **Bark** — closest to drop-in: source textures in `public/textures/bark/<ref>/`; `detail.png` + `posterized.png` auto-extract on the next bake (Cinder/Vellum). No manual step beyond the right folder shape.
- **Chassis (tree models)** — NOT drop-in. A raw GLB must (a) land in the vendor-stock layout `survey-deleaf.js` reads (`public/trees/<species>/skeleton-1-lod0.glb`), then (b) run **`survey-deleaf.js`** (de-leaf → classify `atlasKind` → recenter to trunk-origin → rescale → forest-check → write `meta.json`). **`survey-deleaf` is whole-library** (`readdir`s every species; no targeted single-asset mode).
- **Leaves** — NOT drop-in. Vendor Color + Opacity → composited to RGBA `shape.png` + `meta.json` via `compose-leaf-packs.mjs`.

## End-state (the operator's idea)

**"+ Add Model"** in the Salon chassis picker + **"+ Add Leaves"** in the leaves section → upload the asset → runs the correct targeted ingest → it appears in the picker. Fits `[[feedback_salon_preview_is_authoring_surface]]` (don't leave the Salon to grow the stock). Once a new chassis is ingested it automatically becomes a "show all" candidate for the matching roster species (Brief 26).

## The real prerequisite (the button is the thin layer)

1. **Single-asset / incremental ingest mode** — `survey-deleaf.js` gains a "de-leaf + emit just this one GLB" path (today it's whole-library regen, `--clean`-guarded); `compose-leaf-packs.mjs` exposed as a single-pack call.
2. **A `serve.js` upload/ingest endpoint** to receive the file, place it in the vendor-stock layout, and run the targeted ingest.
3. The two UI affordances on top.

## For now (stopgap, zero code)

Hand the procured asset to **Boz**, or drop it + run the CLI: `node arborist/survey-deleaf.js` (chassis — whole-library, `--clean`) / `compose-leaf-packs.mjs` (leaves) / drop bark source + bake. Fine for the handful of §2 acquisitions (Green Ash, Sweetgum, Bald Cypress, Tuliptree).

## Sizing

Medium — the single-asset ingest refactor is the bulk; upload endpoint + 2 UI affordances on top. Authoring-side; no runtime/slab risk.
