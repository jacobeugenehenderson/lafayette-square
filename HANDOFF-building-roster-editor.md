# HANDOFF — Building Roster Editor (per-building select → hide, the §5.2 first slice)

> **Agent: WARM → Ward** (in the `roster-editor` worktree). Supervised live (Jacob + Boz); build in reviewable steps.
>
> ## ⭐ RE-SCOPED (2026-07-04). Read this banner before the body below.
> Two decisions changed the shape of this arc — the body's *interface* + *build* sections are updated to match; the *architecture* section still holds.
> 1. **Surface moved: Extent tool → the Designer.** Curation is a **per-building override alongside color/roof** (all in `buildingOverrides.json`), reusing `SlabBuildings`' existing `idAtFace` + x-ray `discard` machinery — not reinvented on flat Extent footprints. To keep the easy **top-down** clicking, **mount `SlabBuildings` (interactive) in the Designer's ortho view for the curation mode** (straight-down camera → click roofs → `idAtFace`). Best of both: top-down + reuse + WYSIWYG. The Extent footprint overlay, if built, is **boundary-preview only**.
> 2. **Render-only scope.** This is a **RENDER** concern (does a building appear in the slab), NOT content. Do NOT unify LS's content ledger or touch the ~10 `src/data/buildings` content imports — that's the **separate blank-app arc** (`HANDOFF-blank-app-instance-decoupling.md`). The one render-side hardwire in-scope: `bake-buildings.js:62` (LS's render source → make it per-look like poured scenes; content stays the sidecar). `slab-render-vs-content-boundary` is the governing law.
>
> **Already landed by Ward (keep):** the **cull-relax** (`bake-buildings.js` strict `every`→`some`, keep-if-intersects — the rim-bald fix), the **overrides sidecar route + api + bake filter** (the placement-agnostic backend), and the **demo-scene removal**.
>
> **Work in the `roster-editor` worktree off `curb-offset-draw`** (`feedback_dispatch_agents_in_worktrees`). **Do NOT edit canonical docs** (`ORIENTATION`, `README`, `cartograph/*.md`, `NEIGHBORHOOD-INPUTS.md`) — Boz owns the doc-close; flag doc-worthy decisions in chat. Commit per reviewable step.

## Why this exists
The only building-inclusion control today is the coarse **center+radius clip** — all-or-nothing (`NEIGHBORHOOD-INPUTS §5.2`). The operator can't recover a stray building just outside the circle, or drop a wrong one just inside, without fighting the radius (which pulls a whole ring in/out). HiPointe's first pour exposed this exactly: a couple of SW buildings sit ~3–30 m past the rim and the strict cull drops rim-straddling buildings, leaving a bald edge. The fix is **explicit per-building curation** — show all buildings inside the circle, then hide the unwanted ones by clicking. This is the first concrete slice of the unbuilt **§5.2 "pre-bake feature add/remove"** and the graduation of the curated-file-hack into a first-class gesture.

## Route + canon (mandatory, in order)
1. `CLAUDE.md` (route gate) → `ORIENTATION.md` → `README.md §⭐ START HERE`.
2. **`NEIGHBORHOOD-INPUTS.md §5.1–5.2`** (the Building Ledger + pre-bake feature add/remove — this IS the spec) and **§0.0** (the governing law: every artifact is a best guess, everything overridable — hide is the SHAPE-layer instance).
3. `project_doped_artifact_placecard_edit_pattern` (the override-store pattern) and `project_v2_measure_translucency_strokes` (selection-highlight precedent).
4. `cartograph/BAKE.md` + `cartograph/PIPELINE.md §prebake/§pour` (where the clip + bake live).

## The interface (per the RE-SCOPED banner — Jacob, 2026-07-04)
**Surface = the Designer** (`src/cartograph/CartographApp.jsx`), **mounting `SlabBuildings` (interactive) in the ortho top-down view for the curation mode** — you get top-down clicking *and* the existing `idAtFace`/`discard` machinery *and* WYSIWYG (watch it vanish in the real scene). Curation is a per-building override alongside color/roof, unified in the ledger. *(This supersedes the original "Extent tool footprint overlay" surface — the Designer already ships the selection + discard machinery; reinventing it on flat Extent footprints was the waste Ward caught. Verified: the Designer's current 2D building layer `SceneMapLayers` draws flat footprints that are NOT clickable, and `idAtFace` lives on `SlabBuildings` — so mounting `SlabBuildings` in ortho is the bridge that gives top-down + machinery.)*

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

## The build — DONE vs REMAINING
**✅ Done (Ward, keep):** the **cull-relax** (`bake-buildings.js` strict `every`→`some`, keep-if-intersects — buildings fill to the full circle, recovers the rim + HiPointe's SW buildings; guarded to `scene !== 'lafayette-square'`); the **placement-agnostic backend** — overrides sidecar + `serve.js` write route + `api.js` fetcher + the bake filter; the **demo-scene removal**.

**REMAINING (the Designer curation UI + the one render hardwire):**
1. **Retire the render-source hardwire `bake-buildings.js:62`** — make LS's RENDER building record come from a per-look source like poured scenes so `loadBuildings` reads per-look uniformly. **LS's `src/data/buildings.json` CONTENT stays put** (townie sidecar — the ~10 imports are the *separate* blank-app arc). Gate: LS byte-identical.
2. **Designer curation mode.** An **"Edit buildings"** toggle mounts `SlabBuildings` (interactive) in the Designer ortho top-down; suppress pan while active (`markerActive` pattern). Reuse `idAtFace` → building id (already ships).
3. **Toggle-hide (ghost) — the locked UX.** Click a building → hidden, rendered as a faint **ghost** via a `uHiddenIds` uniform + `discard` (the x-ray `discard` at `SlabBuildings.jsx:455-466` is the precedent) — vanishes live, no re-bake needed. Click a ghost → restore (that toggle *is* "reveal hidden"). Exit → ghosts truly hidden. Small "N hidden" count. Wire the hidden set through Ward's backend sidecar. *(Fallback the operator may prefer: explicit batch — mark a set, one "Hide" button + "Reveal hidden" toggle. Toggle-ghost is the locked default; do NOT build both.)*
4. **Bake honors hidden** (Ward's filter already does) — verify on the next Pour: hidden buildings never enter the slab (*unbaked = unshipped*).

## Acceptance
Operator opens the **Designer** on a poured scene, clicks **"Edit buildings"** — buildings render **top-down and clickable**. Clicks a stray building → it ghosts out live; clicks a ghost → it returns. On the next **Pour**, the baked slab excludes the hidden buildings and includes everything to the full circle (cull-relax). Re-opening restores the hidden set. **LS stays byte-identical; installation-agnostic** (keys on the building id, no scene hardcode). Hide sits alongside color/roof as one more per-building override.

## Boundaries
- Worktree off `curb-offset-draw`; commit per step; **canonical docs off-limits** (Boz's doc-close).
- **Lafayette Square must stay byte-identical** — verify its pour/render unaffected (the cull-relax is guarded to poured scenes).
- Installation-agnostic — no HiPointe/LS names in shared code.
- Coordinate the shared branch with Boz. Flag scope drift (`feedback_baby_must_surface_scope_drift`).
