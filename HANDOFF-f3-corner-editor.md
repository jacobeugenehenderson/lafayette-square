# HANDOFF → Boz: F3 corner editor (Tessera, 2026-06-02)

**TL;DR — the corner-controls slice of T3 (authoring→Survey) is done-for-now on tiles.** The corner editor is functional, *converged to one corner truth*, and now doubles as a geometry probe. Branch `cartograph-looks-pass-ab`, commits `f1307ed`→`4f6ea72`. Full durable state: memory `project_f3_corner_editor.md`.

## What got done
1. **Per-vertex fillet engine** (`tileGround.js`/`filletRing`) replaced the uniform `openRound`. Each curb corner rounds to its own resolved radius. Self-contained → survives the T4 figure-ground delete. LS bake came out *leaner* (1.36M→1.13M verts).
2. **Per-corner / per-IX / global resolver** wired live (`BlockGeometryV2Debug`) + bake (`buildTileBakeShape`). Keys (`ix|skel:f|skel:b`) match `CornerEditHandles` exactly. **No clamp** — the operator's R is the dial; `filletRing`'s 45%-gap inset bound is the only (geometric) limit. (Re-adding a depth/angle clamp was a bug — "changes to a point then the plug fills" — removed.)
3. **The corner IS the handle** (Jacob's design): each corner paints just its **curb arc** magenta (gold=authored, white=dragging). No dots, no circles, no IX handle. Right-click a corner = revert it; global slider = all; per-IX dropped (the runt). Grab window centers on the visible arc, 5 m.
4. **⭐ Convergence — "one corner truth."** The gold-vs-curb drift was the three-representations divergence (handle re-derived its own fillet). Now `tileGround` emits the **achieved** fillet per corner (`cornerFillets`); the handle reads it at rest → the magenta *is* the curb, can't drift. This is a real **wall down-payment** (collapses authoring/preview/bake for corners). Jacob's framing: *this is prebake, getting ready for the wall* — the correspondence IS the deliverable.

## State / definition-of-done
- ✅ Interaction model + convergence: on Jacob's eye, grabbable, magenta hugs the curb on the common grid.
- 🟡 Residual: on degenerate/short-leg/sliver tiles the magenta visibly *doesn't* hug the curb — but that's now a **feature**: it points the finger at exactly which geometry cases break.

## Open threads for you to coordinate (none urgent — Jacob may be wrapping)
1. **Geometry-quality pass** — the sliver / tight-U-wrap / degenerate corners the probe highlights (the "variously dysfunctional" complex). Own workstream; partly dissolves at the wall.
2. **Square corners R=0 (rides #1)** — TWO parts: (a) easy — swap the ped `offsetRings` to `jtMiter` (the figure-ground rule) so authored-square stays square; (b) **hard** — the ADA pad is a tangent-to-tangent annulus slice, *predicated on the arc*; a square corner needs a **new apex-ramp construction**. Jacob flagged (b) explicitly ("another ADA pad solution").
3. **T3 proper** — migrate the *rest* of the authoring channel (strip/material swap, dead-end cap selectors) onto tiles the same Survey/Section way corners just went.

— Tessera
