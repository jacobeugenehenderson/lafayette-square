# HANDOFF — Asphalt as ribbon-construction surface (conversation starter)

**Status:** sketch, for Fresh Boz to expand.
**Author:** Boz, 2026-05-30.

## Goal

Treat the asphalt layer with the same three-Clipper-offset construction the ribbon uses. Give asphalt an authored outer extent so sidewalks/customs at the boundary visibly cut off — signaling "the road continues beyond what's authored" rather than fading into ambient gray.

## Context

Asphalt today is `stencil − blockRounded` — the negative space defined by the block silhouettes and the neighborhood-boundary stencil. The ribbon got the V1 keystone treatment (three Clipper offsets + sliced bands); asphalt didn't. The result: ribbons render with a defined edge; asphalt's outer boundary is wherever the stencil happens to be drawn, with no per-construction control.

## Scope hints

- Construction-side: asphalt becomes a closed authored surface with a curb-width inset; potentially the same "outer / divider / inner" three-ring pattern adapted for road material
- Visual rule: sidewalks/customs that meet the asphalt's outer boundary cut off cleanly; the absence reads as continuation
- Geometry doctrine fixed (V1 keystone for ribbons; this brief extends the same shape to asphalt)
- Toy is the validation surface per AGENT-VALIDATION-SURFACES

## Memory cross-refs

- `[[project_ribbon_corner_uniform_width]]` (the construction this brief mirrors)
- `[[feedback_no_corner_radius_clamps_in_emit]]` (refined regime distinguishes meaningful vs meaningless degeneracy — applies here)
- `[[feedback_archive_dont_delete_ask_before_big_edits]]` (cleanup as we go)
- `[[project_two_bakes_two_walls]]` + `[[project_skeleton_is_the_first_bake]]` — **doctrinal destination:** the asphalt's authored outer extent is **Survey-side hardscape SHAPE** territory after the wall-move (Survey · Section · Stage renaming is DECIDED but NOT YET BUILT — do not rename code/UI labels yet; wait for the C5/wall-move arc). Doctrine sets WHERE; urgency sets WHEN. If this brief is needed before the wall-move arc lands, build it emit-side now knowing it migrates to Survey later — don't gate delivery on the architectural arc.

## Adjacent

Brief 2 (dead-end typology) overlaps — both touch how the asphalt boundary is constructed at chain endpoints. Sequencing matters; possibly fold these together when Fresh Boz drafts the full briefs.
