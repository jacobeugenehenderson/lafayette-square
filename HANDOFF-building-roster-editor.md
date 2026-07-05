# HANDOFF — Building Roster Editor (per-building select → hide, the §5.2 first slice)

> **Agent: FRESH.** New builder, clean context — a focused UI + pipeline build, not a continuation. **Name yourself** (one word) and answer to it. You'll be supervised live (Jacob + Boz): propose the concrete UX in a short Phase 0 sketch for approval **before** building, then build in reviewable steps.
>
> **Work in a git worktree off `curb-offset-draw`** (`feedback_dispatch_agents_in_worktrees`). **Do NOT edit canonical docs** (`ORIENTATION`, `README`, `cartograph/*.md`, `NEIGHBORHOOD-INPUTS.md`) — Boz owns the doc-close; flag doc-worthy decisions in chat. Commit per reviewable step.

## Why this exists
The only building-inclusion control today is the coarse **center+radius clip** — all-or-nothing (`NEIGHBORHOOD-INPUTS §5.2`). The operator can't recover a stray building just outside the circle, or drop a wrong one just inside, without fighting the radius (which pulls a whole ring in/out). HiPointe's first pour exposed this exactly: a couple of SW buildings sit ~3–30 m past the rim and the strict cull drops rim-straddling buildings, leaving a bald edge. The fix is **explicit per-building curation** — show all buildings inside the circle, then hide the unwanted ones by clicking. This is the first concrete slice of the unbuilt **§5.2 "pre-bake feature add/remove"** and the graduation of the curated-file-hack into a first-class gesture.

## Route + canon (mandatory, in order)
1. `CLAUDE.md` (route gate) → `ORIENTATION.md` → `README.md §⭐ START HERE`.
2. **`NEIGHBORHOOD-INPUTS.md §5.1–5.2`** (the Building Ledger + pre-bake feature add/remove — this IS the spec) and **§0.0** (the governing law: every artifact is a best guess, everything overridable — hide is the SHAPE-layer instance).
3. `project_doped_artifact_placecard_edit_pattern` (the override-store pattern) and `project_v2_measure_translucency_strokes` (selection-highlight precedent).
4. `cartograph/BAKE.md` + `cartograph/PIPELINE.md §prebake/§pour` (where the clip + bake live).

## The interface (LOCKED — Jacob, 2026-07-04)
**Surface = the Extent tool's top-down aerial** (`src/cartograph/ExtentApp.jsx`). Curation is a *2D top-down* gesture (far easier to click individual buildings than in 3D), on an overlay of the buildings inside the circle. **The live footprint overlay and the roster editor are one surface** — build the overlay once; it serves both the "live 2D preview" and the curation.

**Interaction — the toggle-ghost model:**
- An **"Edit buildings"** button enters curation mode (buildings clickable; suppress `MapControls` pan while active, like `MarkerOverlay`/`markerActive`).
- **Click a visible building → it hides immediately, rendered as a faint ghost** (not gone). The map improves as you click — live feedback.
- **Click a ghost → it restores** (visible). This single toggle *is* "reveal hidden" — ghosts are always shown in edit mode, so restoring a cut (or a newly-fetched building you'd hidden before) is just clicking it.
- **Exit edit mode → ghosts vanish** (truly hidden in the build). Show a small **"N hidden"** count while editing.
- *Fallback the operator may still prefer (raise it in Phase 0 if you see a reason):* the explicit **batch** model — mark a set in a "selected" color, then one **"Hide from map"** button + a **"Reveal hidden"** toggle. Toggle-ghost is the locked default for speed + live feedback; batch is more deliberate. Do NOT build both.

**Naming:** button reads **"Edit buildings"** (not "roster" — jargon on a button). "Roster" is the internal concept.

## Architecture — what already exists (REUSE, do not rebuild)
*(Verified 2026-07-04 by scout; confirm against current code before leaning on a line number.)*
- **Buildings render as a merged mesh split into ~9 material-group meshes** (NOT instanced, NOT per-building) — `src/components/SlabBuildings.jsx:177-243`. Per-building identity fully survives via a per-vertex float attr **`aBuildingId`** (`:216-229`) + a manifest index published to `src/hooks/useSlabBuildingIndex.js` (`SlabBuildings.jsx:143-174`).
- **Click→building-id already ships** (townie app, not the measure tool): `idAtFace()` reads `aBuildingId` off the raycast face (`SlabBuildings.jsx:516-522`) → `useSelectedBuilding` store (`src/hooks/useSelectedBuilding.js`). In-shader highlight via `uSelectedId`/`uHoveredId` compared to `vBId` (`:500-508`); **x-ray `discard` at `:455-466` is the working precedent for a per-fragment hide.**
- **Overrides read-path exists**: `cartograph/bake-buildings.js:582-585` reads `src/data/buildingOverrides.json` (schema `{ "overrides": { "<id>": {...} } }`, currently `{}`), already consumed for color/roof/foundation (`:650-668`). **Poured-scene building ids are `msbf-<msbfId>`** (`bake-buildings.js:56`) — so a hidden key derived from `msbfId` in the Extent tool matches the baked id and the override key space. Tiling assert (`:828-866`) guarantees the range machinery any new per-building attribute leans on.
- **The strict poured-scene cull** (drops any building with ANY footprint vertex outside `nb.radius`) is `bake-buildings.js:562-573`; the LS clip is `pipeline.js:182-196` (centroid-in-circle).
- **The boundary alpha fade is ground/grass ONLY** — `BakedGround.jsx:249-276`, `grassMaterial.js:181-182`. Buildings have no alpha ramp; they're hard-clipped. "Show all buildings inside the pre-blurred circle" means *relax the clip*, not touch a shader.

## The build (propose in Phase 0, then in reviewable steps)
1. **Cull-relax — buildings fill to the full circle.** Change the poured-scene cull (`bake-buildings.js:562-573`) from "drop if ANY vertex outside `nb.radius`" to **keep if the building intersects the circle** (any vertex inside, or centroid-in-circle — pick and justify). This recovers the bald rim + HiPointe's SW buildings so "all buildings inside the pre-gradient circle" actually render. Keep LS byte-identical (the change is guarded to `scene !== 'lafayette-square'` today — preserve that).
2. **Live footprint overlay in the Extent tool** (top-down). Add a `serve.js` endpoint (e.g. `GET /:scene/building-footprints` → rings in current-frame x/z from the scene's `raw/msbf.json`, each tagged with its `msbf-<id>`), an `api.js` fetcher, and an `ExtentBuildings` overlay component rendering all footprints as **one merged geometry** (perf: potentially 10k+ buildings — a single `BufferGeometry`/`LineSegments`, NOT N drei `<Line>`s). Fetch on `seedToken`. Reflect the circle live (inside vs outside color), reusing the `ExtentDim`/`ExtentBoundary` radius state.
3. **Selection + toggle-hide.** In "Edit buildings" mode, raycast the overlay → building id → toggle hidden. Hidden → ghost; click ghost → restore. Suppress pan while active (`markerActive` pattern).
4. **Persist.** Hidden set keyed on `msbf-<id>` → a per-scene overrides store (extend `buildingOverrides.json` with a `hidden` list, or a sibling `hidden_buildings.json` — propose which). **Add the missing `serve.js` write route** (the read-path exists; no writer does — that's the persistence gap). Debounced autosave.
5. **Bake honors hidden.** `bake-buildings.js` filters the hidden set before the bucket loop (`~:560/:638`) so hidden buildings never enter the slab (*unbaked = unshipped*). Honored on the next Pour (the merged commit→pour→bake in `ExtentApp onBuild`).
6. **Live render hide (optional, nice-to-have):** a `uHiddenIds` uniform/data-texture + `discard` in `SlabBuildings.jsx` so a hide shows in the 3D Stage before a re-bake. Lower priority than the 2D curation loop.

## Acceptance
Operator opens the Extent tool on a poured scene, sees **all buildings inside the circle** rendered live (to the full radius). Clicks **"Edit buildings"**, clicks a stray building → it ghosts out; clicks a ghost → it returns. Exits, hits **"Pour → Designer"** — the baked slab excludes the hidden buildings and includes everything to the circle edge. Re-opening the scene restores the hidden set. **LS stays byte-identical; installation-agnostic** (no scene hardcode; keys on `msbfId`).

## Boundaries
- Worktree off `curb-offset-draw`; commit per step; **canonical docs off-limits** (Boz's doc-close).
- **Lafayette Square must stay byte-identical** — verify its pour/render unaffected (the cull-relax is guarded to poured scenes).
- Installation-agnostic — no HiPointe/LS names in shared code.
- Coordinate the shared branch with Boz. Flag scope drift (`feedback_baby_must_surface_scope_drift`).
