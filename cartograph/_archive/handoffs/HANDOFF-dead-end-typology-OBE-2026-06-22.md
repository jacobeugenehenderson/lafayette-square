# HANDOFF — Dead-end + Spike street typology (conversation starter)

**Status:** sketch, for Fresh Boz to expand.
**Author:** Boz, 2026-05-30.

## Goal

Explicit support for three chain endpoint cases:

1. **Spike** — chain ends INSIDE a parcel/face (penetrates polygon, T-junction one-sided)
2. **Stub-with-cap** — chain dead-ends; `capEnd: 'round'`; ribbon wraps the end as a welded continuous sidewalk
3. **Stub-no-cap** — chain just stops; sidewalks run to the end with no end-cap; **the external neighborhood-boundary stencil traces around the open mouth** to complete asphalt/curb continuity

The third case is the load-bearing new capability. Currently if a stub has no cap, the asphalt mouth has no closing boundary — visibly leaks. The external polygon (the stencil that defines the neighborhood's outer extent) gets traced as the closing boundary for those mouths.

## Scope hints

- Schema: `chain.capEnd` extends to support the three values cleanly (`'round'` exists; `'blunt'` semantics need clarification; possibly a new `'open-to-stencil'` value)
- Emitter: chain endpoint detection identifies which of the three cases applies; asphalt boundary construction routes accordingly
- Toy fixture: add one chain of each type for validation (STUB-N is the existing dead-end stub — repurpose / extend)
- Design doc likely needed first to lock the three values' semantics before code

## Memory cross-refs

- `[[project_ribbon_corner_uniform_width]]` (the geometry context)
- `[[feedback_toy_is_the_construction_spike_surface]]` (validation discipline)
- `[[project_skeleton_is_the_first_bake]]` + `[[project_two_bakes_two_walls]]` — **doctrinal destination:** chain-endpoint typology (Spike vs Stub-with-cap vs Stub-no-cap) is a **chain-consumer census** category. After the wall-move (Skeleton-as-First-Bake at Survey-exit), chain endpoints become polygon-authored shape — the typology question dissolves into "what Survey-side authoring affordances do these become?" Survey · Section · Stage renaming is DECIDED but NOT YET BUILT — do not rename code/UI labels yet. Doctrine sets WHERE; urgency sets WHEN. If needed before the wall-move arc, build it emit-side now knowing it migrates to Survey later.

## Adjacent

Brief 1 (asphalt-as-ribbon) overlaps — both touch how the asphalt boundary is constructed. The "external polygon for asphalt/curb trace" requirement in case 3 is essentially what Brief 1 also enables.
