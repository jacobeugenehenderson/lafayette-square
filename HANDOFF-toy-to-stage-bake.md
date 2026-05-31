# HANDOFF — Toy doesn't bake through to Stage (conversation starter)

**Status:** sketch, for Fresh Boz to expand.
**Author:** Boz, 2026-05-30.

## Goal

Baking toy produces artifacts visible in Stage. Currently the Designer renders toy correctly (V1 keystone live render via `BlockGeometryV2Debug`), but the bake → Stage path either writes to the wrong location or Stage doesn't consume toy artifacts.

## Context

Toy is the validation spike surface per AGENT-VALIDATION-SURFACES doctrine. If Stage doesn't render toy, the validation loop is incomplete — geometry work that ships via toy can't be confirmed at Stage scale before LS cutover. Known-related issue: `--scene=toy` writes to `public/baked/default/`, clobbering LS (per `[[feedback_bake_ground_scene_clobbers_default_look]]`). May or may not be the same root cause.

## Scope hints

- Investigate the toy → Stage path end-to-end: where does the bake write, where does Stage read, what's the mismatch?
- Toy designer works (V1 keystone renders correctly via live `BlockGeometryV2Debug`); the bake path is the gap
- Likely a path config in `cartograph/bake-ground.js` + Stage's scene-keying
- Small investigation + small fix expected

## Memory cross-refs

- `[[feedback_bake_ground_scene_clobbers_default_look]]` (known-related)
- `[[feedback_toy_is_the_construction_spike_surface]]` (why this matters)
- `AGENT-VALIDATION-SURFACES.md` (the validation-loop doctrine)
- `[[project_reset_toy_button_queued]]` Stadia's Follow-up section — **partial diagnosis already done**: Stadia's Finding #2 in `HANDOFF-toy-reset-to-defaults-DESIGN.md` documented that `src/data/toy/toy-ribbons.json` is stale since 2026-05-16 and the bake path has no toy derive step. This brief's investigation has a head-start; read Stadia's design doc before tracing.

## Why this brief runs first (Boz recommendation)

Brief 4 (LS migration) depends on the validation loop being complete. If toy doesn't bake through to Stage, LS migration can't be visually validated against toy parity. This is the unblocker for everything else queued.

## Doctrinal frame (don't let it inflate the fix)

Per `[[project_two_bakes_two_walls]]`: Stage is **wall #2**; Preview INHERITS Stage (never reverse). The long-term architectural answer to Stage↔Preview↔Production parity is the render-conformance arc's **Phase 6** — that's where the Preview-inherits-Stage refactor lives, not in this brief.

**This brief stays tactical.** If the toy→Stage bake is broken and blocks the operator, fix the path tactically (config / scene-keying / output-directory). DO NOT let the doctrinal frame inflate a needed patch into an architectural refactor. *Decided-architecture ≠ do-it-now.* The two-walls frame tells you WHERE the long-term work lands; this brief's WHEN is "as soon as the operator is unblocked."
