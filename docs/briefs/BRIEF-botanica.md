<!-- BRIEF-STATE
status: PARKED
dispatched: no
written: 2026-09-26
evict-when: a specialized land-use class (farmland first) can be populated with plant impostors grown from a staged model, placed by the class's own planting rule, and Jacob has eyed it.
-->

> *State, as the header carried it until 2026-09-28:* FUTURE — not dispatchable yet


# Botanica — plants for the specialized land uses

**Status: a future brief, recorded so it is not lost.** Jacob, 2026-09-26: *"eventually (maybe soon) we'll ALSO
populate the specialized LU with impostors"* — and, to Furrow the same day: *"develop the Botanica: an
Arborist-like workspace, crop impostors eventually (bought staged model to sequenced impostors), and the ground
shader."* ⚠️ **The ground shader is NOT this brief** — it is `cartograph/_archive/BRIEF-field-shader-2026-10-04.md`, running now.

## What it is
An Arborist-like workspace for **non-tree planting**: take a bought, **staged** model (one per growth stage) and
turn it into **sequenced impostors** that grow with the season, then place them over a specialized land use by
that class's own rule — `cartograph/lu-policy.mjs#plantingOf` (`agricultural → { with: ['zea_mays'], pattern:
'rows' }`, `orchard → grid`, `wetland → phragmites scatter`). Crops first.

## What is known today (2026-09-26)
- The Arborist has **no crop species** (no `zea_mays` dossier, model or atlas region) — Furrow.
- The field ground already carries the season and row bearing per field (`cartograph/_archive/BRIEF-field-shader-2026-10-04.md`); plants must
  follow the same calendar and the same per-field row bearing.
- `lu-policy.mjs` declares `planted` classes whose generator does not exist; this is that generator.

## Before it is dispatchable — Jacob's to decide
- Its own workspace, or a mode of the Arborist? (Reuse the Arborist's capture/impostor path either way — no second impostor system.)
- Which specialized land uses, in what order, and the source of the staged models.
- The phone budget: plant cards over whole fields are a density question like the trees'.
