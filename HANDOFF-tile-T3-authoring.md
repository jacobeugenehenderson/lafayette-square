# HANDOFF — Tile re-pour · T3: authoring → Survey (migrate the authoring channel onto tiles)

> **⭐ Absorbs (2026-06-22):** the design spine `survey-section-tool-design` (the Survey=SHAPE / Section=FILL tool split + the shared interaction grammar) and the corner slice `tile-T3-corner-handles` (source the corner-edit handles off the live tile corners, injective) folded here → `cartograph/_archive/handoffs/`.

**Agent: WARM → Tessera.** You built the tile construction (spike → T1 → T2 → T2-finish) and you know exactly where the authoring overlays still mount figure-ground. T3 is yours.

**This is T3 of the tile re-pour** (the umbrella `pipeline-reconception` brief retired to git; live state → `cartograph/BACKLOG.md` + `HANDOFF-tile-feature-ledger.md`). T2-finish landed the whole *construction* side on LS (the 🔜T2 rows). T3 does the *authoring* side. **Reads first:** `HANDOFF-tile-feature-ledger.md` (the 🔜T3 rows = the scope) · **`RIBBONS.md §5`** (the Measure-tool operator model + the translucency doctrine — load-bearing, see below) · `src/lib/tileGround.js` + the Designer authoring surfaces (`BlockGeometryV2Debug.jsx`, `MeasureOverlay.jsx`, `MeasurePanel.jsx`, `SurveyorPanel.jsx`, `CornerEditHandles.jsx`).

## ⭐ Design spine — build the DESIGNED tools, not relocated handles

**Read `cartograph/_archive/handoffs/HANDOFF-survey-section-tool-design-FOLDED-tileT3-2026-06-22.md` first — it is the design T3 implements** (decisions locked by Jacob 2026-06-01). The non-obvious bits: each tool shows **only its own** handles (asphalt-edge → Survey; ped → Section); smoothing is auto but a **selected** area renders **un-smoothed (raw), returning to smooth on `enter`**; **all curves béziér-fine** (P3 — the operator sees them up close); curb = **global width, editable, own material**; the **§5 Measure model carries as-is** (it's elegant when working — migrate, don't redesign). The tool split mirrors the construction split: Survey = outward stroke (shape), Section = inward stroke (profile).

## The frame (the one idea behind every T3 row)

**The Designer authoring layer still runs figure-ground, live.** The Measure/Corner overlays + handles mount `buildBlockGeometryV2`; its meshes early-return (tiles render) but **it's still computed every frame**, and the controls author against *it*, not the tiles. That single fact is the root of the whole cluster Jacob's been seeing:
- **A2 "no work"** — the Corners slider doesn't reshape tile corners (authors figure-ground).
- **strip-swap doesn't work** — the gesture's on the figure-ground overlay.
- **Measure translucency messed up** — the Measure render-side is on stale figure-ground geometry.
- **handles drag perf/reliability** — redundant figure-ground compute every frame.

**T3 = migrate the authoring channel OFF figure-ground ONTO tiles.** When the overlays + handles + controls operate on the tile construction, they *work live (WYSIWYG)*, the translucency reads right, and the perf drag lifts. (T3 makes the authoring no longer *depend* on figure-ground; **T4** then deletes figure-ground and the wall is clean.)

## The rows (the 🔜T3 ledger set)

| Row | What works after |
|---|---|
| **A1** drag handles (`pavementHW`/`treelawnOuter`/`propertyLine`) | dragging a handle re-strokes the tile widths live |
| **A2** 3-tier corner-R (global slider × per-IX × per-corner; gold=authored; right-click revert) | the Corners slider + dots reshape tile corners live (the "A2 no work" fix). Per-corner/per-IX needs the corner-identity map (global scale alone isn't enough). |
| **A3** R=0 authorable | square ADA ramps |
| **A4** cap selectors | Survey round/blunt/none drives the dead-end cap live (bake already honors `capEnds`; this is the *author* end reaching tiles) |
| **A9** Measure translucency | reads per RIBBONS §5 (see ⚠️) |
| **M3-gesture** strip-swap | ctrl-click flips a ped strip LU↔SW (M3 already made the data overridable — plug the gesture in) |
| **A5/A6** edit-row vs edit-block modes; symmetric mirror toggle | carry over; verify they drive tiles |

## ⚠️ The Measure translucency — read §5 BEFORE touching it

RIBBONS §5 documents the translucency-by-design: **selected chain translucent, non-selected OPAQUE, adjacent blocks translucent.** This has been **misdiagnosed as a bug before** (someone "fixed" it toward all-translucent and cost a cycle). So: **the rule isn't "make it all translucent" — it's the operator-focus model in §5.** Re-implement *that* model against the tile geometry; don't invent a new one.

## Suggested serial sub-sequence (land + Jacob's eye between)

1. **T3a — migrate the live authoring RENDER onto tiles.** The overlays render *tile* bands; handles position on *tile* geometry; the Measure translucency rebuilt per §5 against tiles. This alone lifts the perf drag (the figure-ground memo can stop driving the overlay) and fixes the translucency. *Gate: Designer authoring view shows tiles, translucency reads per §5, perf better.*
2. **T3b — wire the controls live.** Handle-drag → tile widths; Corners slider + per-IX/per-corner R + R=0 → tile corners (**fixes A2**); cap selectors → caps; strip-swap gesture. *Gate: each control reshapes the live tile + bakes identically (WYSIWYG).*
3. **T3c — modes + polish.** edit-row/edit-block, symmetric toggle; the ADA-tangent watch (G5 construction residual) can get a look here if it persisted.

## Boundaries

- ❌ **Do NOT delete figure-ground** — that's T4. T3's job is to make the authoring no longer *depend* on it; deletion comes after, once nothing reads it.
- ❌ No slab-content (alleys/overlays/highway-class — D-rows, separate).
- ❌ Don't invent a new translucency model — re-implement §5's.
- ✅ **Retrofit the UI** — the panels/handles/gestures barely move; what changes is the *construction they operate on* (figure-ground → tiles). Reuse `MeasureOverlay`/`SurveyorPanel`/`CornerEditHandles`.
- Don't touch `design.json` customs; don't edit canonical docs (Boz folds into the ledger).

## Gate

WYSIWYG on Jacob's eye, LS: author a width / a corner-R / a cap / a strip-swap in the Designer → see it change *live on the tiles* → bake matches. The Measure translucency reads per §5. The figure-ground perf drag is gone. When all 🔜T3 rows are green on his eye, T3 is done → **T4** (delete figure-ground, rewrite RIBBONS/PIPELINE, close §6.8–6.10) + the deferred **slab-content** D-rows.

## Report

Per row: what now works live + the WYSIWYG confirmation. Confirm the figure-ground overlay is no longer *computed* for authoring (the perf drag). Note whether A2's failure was construction (tile R not parameterized) or wire (slider didn't reach the live render). Flag the ADA-tangent if you looked.

*Provenance: Boz, 2026-06-01. T3 of the tile re-pour (umbrella `pipeline-reconception` retired to git); rows in `HANDOFF-tile-feature-ledger.md`. The authoring↔construction↔slab seam Jacob named = the wall / helper-app division.*
