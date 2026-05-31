# HANDOFF — LS migration (conversation starter)

**Status:** sketch, for Fresh Boz to expand.
**Author:** Boz, 2026-05-30.

## Goal

Flip the V1 keystone + V2-Measure + V1.5 doctrines on for LS (currently toy-only or toy-default-on). Bake LS, view in Designer + Stage. Document which corners remain bespoke — the "riff raff" Jacob anticipates needing helper code paths for.

Jacob's framing: *"if we have these 'somewhat' regular corners covered we're 97% there and we can just move to bespoke corner helpers for the riff raff."*

## Context

V1 keystone, V1.5 swap, V2-Measure all shipped on toy through the multi-day arc 2026-05-28 → 2026-05-30. LS hasn't been cut over. This is the final cutover.

## Scope hints

- Flip `useConcentricEmitter` (or the current name of the scene-routing flag) to default-on for LS
- Bake LS via `node cartograph/bake-ground.js`; view in Designer + Stage
- Catalog the bespoke-corner cases that don't render correctly under the new construction (Mississippi × Park is the §6.9 reference IX; there will be others)
- For each bespoke case, propose: per-block override authored via Measure tool (preferred — operator-side fix) OR a "corner helper" code path (if no operator-side fix works)
- Geometry doctrine fixed (V1 keystone); capacity guard fixed (Trammel's coda); authoring doctrine fixed (V2-Measure). Only operator-side fixes or narrow bespoke code paths are in scope.

## Memory cross-refs

- `[[project_ribbon_corner_uniform_width]]` (V1 keystone)
- `[[feedback_silhouette_straight_emitter_skipped_fes]]` (the 13-month foundation fault that V1 dissolved — verify it stays dissolved on LS)
- `[[project_per_block_lu_via_blockkey]]` (per-LU routing pattern at LS scale)
- `[[feedback_no_corner_radius_clamps_in_emit]]` (refined regime — applies to LS's wider variety of authored corners)
- `[[project_skeleton_is_the_first_bake]]` + `[[project_two_bakes_two_walls]]` — **this brief IS "C5 cutover" in the architecture-session framing**: LS → mono-width ring-band emitter (flip `useRingBandEmitter` from `scene === 'toy'` default). The sequence after this is **chain-consumer census → wall-move (corners + shape into Survey)**. C5 is the precondition for the wall-move; the standing chains-die-too-late debt cannot be paid until LS is off the legacy per-leg path. Survey · Section · Stage renaming is DECIDED but NOT YET BUILT — do not rename code/UI labels in this arc.

## Why this brief runs after Brief 3

Brief 3 (Toy → Stage) is the validation-loop unblocker. LS migration's visual gate is harder if Stage doesn't show the toy reference for comparison. Sequence: Brief 3 → Brief 4. Briefs 1 and 2 can run in parallel with either.
