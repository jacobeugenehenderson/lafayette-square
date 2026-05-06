# Handoff — whole-intersection corner plugs

Status as of 2026-05-06 (end of day): **all 4 toy corners render with uniform concentric carve. SW back-flip bug closed. ✅**

## Goal

At every street intersection, render a clean corner plug whose outer (parcel-side) edge is a concentric arc around the curb-fillet center C. The arc bows past the parcel's natural Q_prop into the parcel — visually a uniform-width sidewalk band wrapping the corner. The same arc is used to carve the parcel face so the parcel's natural sharp L corner is replaced by the same concentric curve.

## What works

- **Concentric outer arc.** `R_pad = R_curb − minPed` around the curb-fillet center C. Pad polygon CCW: `TA_curb → TA_padarc → arc → TB_padarc → TB_curb → curb arc → close`. Lives at `src/components/StreetRibbons.jsx:buildSidewalkPads`.
- **Uniform R_pad across all corners.** `minPed = min(A.leftPed, A.rightPed, B.leftPed, B.rightPed)` — scans all four leg-side ped values, not just the two corner-facing ones. Picks up the smallest sidewalk width across the intersection so every corner gets the same `R_pad`. Treelawn carves still use the corner-facing `leftTreelawn` / `rightTreelawn` (back-flip-correct), so carve placement is unaffected.
- **Face-clip parity (trinity rule).** `src/lib/ribbonsGeometry.js#buildCornerPadClips` mirrors the construction; `buildRibbonGeometry(ribbons, ...)` consumes `ribbons.intersections` and threads it into `buildRibbonUnion`. Designer + Stage stay in lockstep.
- **Toy fixture at the pre-pipeline level.** `cartograph/derive-toy.js` reads `src/data/toy/toy-input.json` (hand-authored chains with measures), auto-detects intersections, splices IX vertices, emits `src/data/toy/toy-ribbons.json`. Per-IX `cornerRadius` overrides flow through.

## The bug that's now closed

For each leg, `buildLeg`'s back-flip (`isBack ? m.right : m.left`) maps the leg's "left/right" ped to the geometric corner-facing side per code's `perpLeft` semantic. The toy data's author convention is inconsistent across chains (NS labels match code, EW labels are inverted), so for the SW pair both legs landed on their wider-ped (=3) side and `minPed = 3` collapsed `R_pad` to 1.35 (visibly wider arc than the other three corners at 2.85).

**Tried and reverted:**
1. `swSafe` only (sidewalk width, no treelawn) — uniformly forced `min_ped = 1.5` but lossy on real data with treelawn-only ped values.
2. Re-shape pad to "sidewalk strip per leg" annulus (inner = `R_curb − treelawn`, outer = `R_curb − ped`). Broke the three already-correct corners.
3. Remove back-flip entirely. Made `R_pad` uniform but shifted treelawn carves to the wrong side at NW and NE.

**The fix that landed (2026-05-06 EOD):** keep the back-flip (carves stay correct) and change `minPed` to scan all four leg-side ped values. SW now matches the other three at `R_pad = 2.85`; treelawn carves at NW/NE/SW are unchanged.

## Algorithmic conclusions (do not regress)

1. **Pad outer = concentric arc around C** at `R_pad = R_curb − minPed`. Bows past Q_prop into parcel. The IP claim.
2. **`minPed = min` across all four leg-side ped values.** Picks the narrowest sidewalk width in the intersection. Uniform `R_pad` across corners regardless of how the back-flip lands per pair.
3. **Concentric stack via shared C.** Curb arc and pad arc share C, separated radially by `minPed`. No `ClipperOffset` global shrink (it bulbs leg-rectangle ends).
4. **Treelawn carves are Clipper-difference**, applied AFTER the pad polygon is built, using the corner-facing `leftTreelawn`/`rightTreelawn` from buildLeg's back-flip.
5. **Face-clip mirror.** `ribbonsGeometry.js:buildCornerPadClips` MUST stay in sync with `StreetRibbons.jsx:buildSidewalkPads`. Cross-reference comments in both.
6. **Per-IX `cornerRadius` override** flows through `derive-toy.js` and `derive.js` from `intersections[].cornerRadius`. Defaults to `DEFAULT_CORNER_R = 4.5`.
7. **Toy at pre-pipeline level.** Reproduces real-data IX-vertex splicing and chain processing.

## Open work

1. **Lawn gap on 3/4 corners.** Visible gap between leg sidewalk band's outer edge and parcel face boundary. Toy parcel inner corners sit at perp 7m; leg prop tangents at perp 6.65m. Either author parcel face inner corners at the prop tangent, or have the bake snap parcel face boundaries to leg-prop tangents. Cosmetic, deferred.
2. **Vary intersection angles in the toy.** The 4-way orthogonal X is the easy case. Author T, Y, oblique, sharp-bend, 5-leg variants in `toy-input.json` and verify the construction holds across them. Fortify the algorithm before parameterizing.
3. **Parameterize and place on real LS data.** Once the construction is robust across toy cases, re-bake LS and verify Stage/Preview render correctly. Build the operator UI for per-IX `cornerRadius` (Survey-tool slider; default 4.5m; bulk operations).

## Files this session

- `src/components/StreetRibbons.jsx` — `buildSidewalkPads` switched chamfer → concentric arc; `minPed` uses 4-side scan; `clippedFaces` passes intersections through to `buildRibbonGeometry`.
- `src/lib/ribbonsGeometry.js` — added `buildCornerPadClips`; extended `buildRibbonUnion(streets, intersections)`; threaded intersections through `buildRibbonGeometry`; `minPed` uses 4-side scan.
- `cartograph/derive-toy.js` (NEW) — pre-pipeline toy fixture script.
- `src/data/toy/toy-input.json` (NEW) — hand-authored 4-way fixture.
- `src/data/toy/toy-ribbons.json` — derive-toy output.
- `src/cartograph/CartographApp.jsx` — toy + Designer camera fix.
- `FEATURES.md`, `cartograph/BACKLOG.md` — trinity sweep recording the corner-pad ↔ face-clip parity rule.
