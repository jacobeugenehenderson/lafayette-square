# HANDOFF — The Boundary Trio (circle-only · build-beyond-crop · systematic cull)

> ⛔ **RETRACTION BANNER — ARCHIVED 2026-07-21 (Boz).** This brief's governing idea — *"the circle is the real boundary; derive the bbox from it"* — is the **most quotable statement of a model that was retracted** (`a05fc129`). It is **superseded** by the Extent redesign; the live doctrinal home is `cartograph/ARCHITECTURE.md §"The Extent tool & the Pour"` and the audit `EXTENT-EXCAVATION.md` (which recommended this archival, §312/§390). The edge-of-map face-walk half **did land**; any remaining cull/SSOT residual is subsumed into the Extent redesign, not this brief. Kept for the record only — do **not** dispatch from it or cite it as required reading.

> **Status: REFRESHED 2026-06-01 for the tile re-pour + the LS-first decision** (Boz). **BUILD mode.** **Sequence: dispatch AFTER the tile arc closes (T3 authoring → T4 delete-figure-ground)** — builds on the tile-model LS + shares the bake. **Warm → Tessera** (holds the tile/LS pipeline). **LS-first, by decision (2026-06-01):** LS already *has* a circle, so this is a **retrofit** that makes it the SSOT + derives the bbox — and it **builds the shared circle-boundary kit that Provincetown's intake later inherits** (not ports; PTown is the first full-intake run, *after* this). **The FloorGizmo (center/radius editing UI) is NOT this brief** — that's the intake authoring layer, additive, rides with PTown; here the circle stays authored in `neighborhood_boundary.json`, just made the SSOT.

## You are the builder
**Name yourself** if fresh. You are not Boz. This is a focused boundary/extent/cull refactor — the fast-follow to the frame-enrichment.

## The one idea
Today there are **two** geographic descriptors that drift: a **rectangle** (`bbox` in `src/instance.js#geography`, re-exported by `cartograph/config.js`) that drives fetch + tile grid + the baked ground extent/UVs (`BakedGround.jsx:105 manifest.bbox`); and a **circle** (`cartograph/data/<scene>/neighborhood_boundary.json` → `src/cartograph/boundary.js`: center, radius, 256-gon polygon, `fade`, `streetFade`) that everything visually crops to. **The circle is the real boundary. The bbox should be *derived from it*, not authored alongside it.** Unify them, build past the crop, and crop systematically — in three parts.

## Part 1 — Circle as the SSOT; bbox becomes derived (retire the vestigial bbox)
- Make `neighborhood_boundary.json` (center + radius → polygon + fade bands) the **single authored boundary**.
- **Derive** the bbox as the **enclosing square of the *outer* feather** (`streetFade.outer` + a small margin) — so there's room for geometry to resolve *and* for the fade to fade into real data. `bbox` survives only as a *computed* value (for fetch, tiles, ground-plane extent/UVs), never an independently-authored one.
- Nuance: the boundary center is in **local meters** (`BOUNDARY_CENTER_XZ`, e.g. `[-15,-15]`) while geography center is lat/lon — convert via `localToWgs84` before deriving the lat/lon bbox. Don't assume they're the same point.
- **Kills the drift class** (bbox-vs-circle can no longer disagree).

## Part 2 — Build geometry on the full extent; crop to the circle LAST
- **The principle:** never truncate geometry early. Build the network/blocks/buildings on the **full derived-bbox extent** (which now extends past the soft crop), so **edge junctions and blocks resolve correctly**, *then* crop to the circle. This is the same disease as the frame-enrichment, at the boundary: truncate-before-building → broken edge junctions / half-blocks at the crop.
- **Audit where culling/truncation happens today** relative to the boundary. If anything culls *before* the geometry that needs the neighbors is built, move it to the end.
- This is what makes "the map keeps going off the edge" pay off — the visible edge is built from complete geometry, not stubs.
- **⭐ Tile-model connection:** this *is* the edge-of-map story the tile re-pour's **perimeter L/U corners (G9)** already started — "build geometry, then crop to the circle" = walk the ribbon around the open perimeter contour (L/U), resolve the edge junctions/corners on the *full* extent, *then* crop. **Align with / absorb that work; don't duplicate it.**

## Part 3 — Systematic stencil-cull replacing the manual toggles
- Find the **manual out-of-neighborhood building/block** culling (toggles / hand edits — Jacob turned these off by hand to avoid wasted geometry + showcasing outside buildings).
- Replace with a **systematic cull to the circle stencil at the end of the bake**: `faceInBoundary` (blocks), `pointInBoundary` (buildings), `clipPolylineToBoundary` (linear) — all already in `boundary.js`. Don't bake what's outside the circle.
- **Retire the manual toggles** (vestigial-UX cleanup — `memory: vestigial UX is a wall violation`). Result: smaller slab, no wasted geometry, no manual step, nothing outside the neighborhood shown.

## OUT of scope (flag, don't fold) — the runtime-stencil retirement
The banked payoff — *bake the crop in once and retire MapLayers' ~12 runtime `pointInBoundary` calls + the fade shaders* — is **tile-re-pour T4 / cleanup** territory (it changes the bake↔render contract). Do Parts 1–3 (data/extent/cull model); **flag the full runtime-stencil retirement for T4, don't attempt it here.**

## Validation gates
- **No bbox/circle drift** — bbox is provably the derived enclosing square of the outer feather; no second authored source.
- **Edge geometry correct** — junctions/blocks at the neighborhood edge resolve (not stubbed/half-built); eyeball the crop edge before/after.
- **Nothing outside the circle in the slab**; manual toggles gone; slab geometry count *down*.
- **Toy/no-boundary still works** — `manifest.stencil = null` → "show everything" fallback must survive (`BakedGround` skips the radial fade; `boundary.js` returns true when no polygon). Don't break the boundary-less scene.
- **Jacob's eye on the render = the verdict.**

## Guardrails
- **Load-bearing files** — `boundary.js`, `config.js`/`instance.js` (the geography SSOT), the bake siblings. Surgical edits; preserve the no-boundary fallback.
- **Dispatch after the tile arc (T3→T4)** — builds on the tile-model LS bake. (The bake-target ghost is fixed — unflagged `bake-ground.js` → `lafayette-square`; missing-look throws.)
- **A/B safety** — preserve the pre-refactor LS bake so the edge-geometry before/after is honest.
- **Do NOT edit canonical docs** (`FEATURES`/`ARCHITECTURE`/`PIPELINE`/`RIBBONS`/`BACKLOG`/`NOTES`). Findings → a new file + `scratch/`.
- **Commits:** Boz coordinates — leave changes staged/described.

## Deliverable
Circle-SSOT bbox derivation · build-on-full-extent + crop-last · systematic bake-time stencil-cull replacing the manual toggles · a short before/after writeup (edge-geometry observations + slab geometry-count delta + the runtime-stencil-retirement note for the wall-move). Name yourself in it.
