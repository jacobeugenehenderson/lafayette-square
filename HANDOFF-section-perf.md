# HANDOFF — Section tool perf: the FILL re-strokes the whole map on every edit

**Status: ✅ #2 LANDED (`bb83f7b`) + ✅ #1 LANDED (`3ed1e6d`, 2026-06-17). Branch `curb-offset-draw`.** Both root causes addressed. #3 (dead per-tick overlays) remains as cheap cleanup; the sibling aerial-translucency bug (below) is untouched and still open. **Drag-fluidity eye-check pending on Jacob (the gate).**
> **#1 fix as landed:** `sectionPass` factored into a per-tile `sectionPassTile` (no cross-tile reads — proven); `sectionOpen` takes a caller-owned per-tile cache keyed on (cw, stripMat, the tile's own blockCustoms slice); `BlockGeometryV2Debug` holds it in a ref. A FILL drag now recomputes only the edited tile, not 101. Grid-safe — byte-identical output proven (cache==stateless, real-edit==fresh, re-bake ground.bin/ribbons identical to HEAD). The global union/stencil merge still runs per call (cheap; a follow-up if drag still isn't fluid on the eye).

**(Original forensic, retained below.)** Section ("measure" tool, the ped-FILL authoring) is **nearly unusable** under interaction. ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → this brief → `cartograph/SECTION.md §5/§7` (the FILL SSOT + the perf/D6d item) → `HANDOFF-freeze-the-curb-in-the-first-bake.md` (the SHAPE-layer sibling — Phase 2 block-local). **The eye is the gate** (Jacob on the lit Section).

**One line:** the **silhouette is frozen** (the idle-case win landed), but **the ped FILL has no "selected = live, rest = frozen" split** — every FILL drag re-runs `sectionOpen` over **all 101 tiles** (a multi-Clipper pass), *plus* a dead figure-ground pass re-fires ~250 ms later. The fix is the **FILL-layer analogue of freeze-the-curb Phase 2** (block-local), with one cheap one-line gate available first.

> **Jacob's hypothesis, adjudicated:** (a) **high-res aerial — REFUTED.** `AerialFocus` is already attention-gated *identically* in Section and Survey (`AerialTiles.jsx:263`, keyed on the selected handle, capped `MAX_FOCUS_TILES=64`, LOD-debounced). Not the leak. (b) **frozen/unfrozen — right instinct, wrong layer:** the frozen layer is the *silhouette* and it IS frozen (`sectionFrozen` → `sectionGeos`); what lacks the selected-vs-rest split is the **FILL**.

---

## Root causes (ranked, file:line)

### #1 — Every FILL edit re-runs `sectionOpen` over ALL 101 tiles, per drag frame (PRIMARY, the architectural one)
The render path is correct: Section consumes the frozen `shape.json` via `sectionGeos = useMemo(sectionOpen(frozenShape.tiles, …, blockCustoms), …)` (`BlockGeometryV2Debug.jsx:666–695`), and live `tileGeos` correctly returns null (`:703`). **But the `sectionGeos` dep array includes `blockCustoms` (`:695`),** and a Section depth-drag / material-swap writes a **new `blockCustoms` object every coalesced drag frame** (`MeasureOverlay.jsx:585–591 applyDrag` → `useCartographStore.js:613–628 writeBlockEdgeCustoms` → `set({blockCustoms: next})`). New reference → memo invalidates → **full `sectionOpen` over all 101 tiles every frame.** `sectionOpen` (`tileGround.js:1247`) is multiple Clipper passes: `sectionPass` per-tile inward offsets + leg slices + corner sectors over 581 runs, then `differenceRings`×2×101, then a global `unionRings` + per-LU + stencil `intersectRings`. All main-thread, per frame. **There is NO selected-vs-rest FILL split** — Survey has exactly this (`nonSelectedChainGeo` cached `:917` + `selectedChainGeo` per-tick `:951`); Section's FILL is one undivided whole-map memo. **Same family as freeze-the-curb Phase 2, on the FILL layer.**

### #2 — The dead figure-ground V2 pass re-runs ~250 ms after every Section edit (SECONDARY, large + cheap to kill)
`buildBlockGeometryV2` (`BlockGeometryV2Debug.jsx:415–426`) depends on `debouncedInputs`, which **includes `blockCustoms`** (`:388,398,413`, 250 ms debounce). So ~250 ms after every Section drag, **the entire figure-ground V2 pass re-runs over the whole map** — the canon calls it a **"~2.5 s full pass"** (`:803`). It is **dead for rendering in Section** (the frozen branch returns at `:1197–1240`, V2 meshes never mount) but **the memo still executes + its effects fire** (`_setV2Blocks`, `_setV2FrontageEdges`). This is the canon's **T4 "delete the dying figure-ground."** Pure waste on every edit.

### #3 — Per-tick dead live overlays (MINOR, cleanup)
`liveSelectedRings` (`:811`) + `selectedChainGeo` (`:951`) + `*EdgeGeo` (`:992–1009`) recompute per drag tick (deps include `blockCustoms`) but **never render** in Section (the frozen branch returns before the JSX that mounts them). Cheap (~1 ms) but dead.

## The fix (smallest-leverage first)
1. **⚡ Gate the figure-ground pass off `blockCustoms` in non-Survey (kills #2 — the cheapest, highest-leverage first cut).** Drop `blockCustoms` from `debouncedInputs` when `!surveyActive`, or skip the `buildBlockGeometryV2` memo body when `sectionFrozen`. **A one-line gate removes a ~2.5 s whole-map pass that fires on every Section edit and renders nothing.** `BlockGeometryV2Debug.jsx:387–426`.
2. **⭐ Block-local `sectionGeos` (the real fix — #1).** Cache `sectionOpen` output per-tile keyed on each tile's own `blockCustoms` slice; on a `blockCustoms` change, re-run `sectionPass`/`sectionOpen` **only for the affected tile(s)** (the fe's `skelId` → its tile, directly derivable since `shape.json` is per-tile and `blockCustoms` is keyed `skelId→side→segOrd`), union the rest from cache. The per-tile loop already exists (`tileGround.js:1250`); factor a per-tile entry point. **This is the FILL-layer Phase 2** (sibling of `freeze-the-curb` Phase 2).
3. **Gate the dead live overlays on `!sectionFrozen` (kills #3).** Early-return `liveSelectedRings`/`selectedChainGeo`/`*EdgeGeo` when `sectionFrozen`. `:811,951,992`.

## Acceptance
- Section depth/material drag is **fluid** on Jacob's eye (no sticky-drag); the dragged tile updates live, the rest stays frozen.
- No whole-map pass fires on a Section edit (verify #2's pass is gone; `sectionOpen` runs on ≤ a few tiles, not 101).
- Grid-safe: the rendered FILL is identical to today's (only the *recompute scope* changes), curated/correctness suite unchanged.

## ✅ Sibling Section-tool bug — FIXED 2026-06-17 (was: aerial not revealed on select)
**On select in Section, the aerial map wasn't revealed / the translucification was disrupted** (Jacob, 2026-06-17). **ROOT:** when Section moved to the frozen `sectionGeos` render (the 2026-06-16 perf gate), it dropped the selected-corridor translucency — a **live-path** feature (`selectedCorridor` material variant) — and rendered every fill **opaque** (`BlockGeometryV2Debug.jsx` frozen branch), so the aerial couldn't read through. **FIX:** `sectionOpen` now partitions the FILL into REST (opaque) + SELECTED-corridor (the `*Selected` 0.55 materials); the corridor = frozen tiles whose runs front the selected street's `skelId` (identity-only — chain-free, does NOT touch the dead figure-ground). Curb stays solid. **To spec** (`HANDOFF-survey-section-tool-design.md:56` / RIBBONS §5 — selected-corridor translucent + context opaque, NOT all-translucent) and consistent with the live Survey instantiation (same material + 0.55). This is a down-payment on **T3's A9** (translucency rebuilt against tiles). Grid-safe (un-selected path byte-identical). ⚠️ **AerialFocus** (`AerialTiles.jsx:263`, hi-res around the selection) was a red herring — it's keyed on the handle and was working; the opaque fills were the sole blocker. **Eye-confirm the translucency scope on Jacob.**

## Coordination
- **Same family as `freeze-the-curb` Phase 2** (block-local edit loop) but on the FILL layer — and it overlaps **T4 (delete figure-ground)**. #2 ⊂ T4; landing T4 subsumes #2.
- Touches `BlockGeometryV2Debug.jsx` + `tileGround.js sectionOpen` + the store — distinct from the SHAPE briefs (A/F/B/C, landed). Independent.

*Forensic 2026-06-17 (read-only specialist pass): aerial refuted, silhouette-freeze confirmed done, the FILL whole-map recompute pinned as the root with exact file:line. The cheap #2 gate is the immediate relief; #1 is the architectural fix.*
