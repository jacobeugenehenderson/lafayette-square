<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: no lit strip at the foot of any building in any town (measured, then eye-gated by Jacob with the scene recorded), and every riser reaches from its floor to world y = 0 (Jacob's ruling).
-->

# The building's shadow must meet the ground (re-aimed from "include the riser")

**You are the dispatched agent. Name yourself — one word, yours, and NOT a name another RUNNING session already holds.** Check with `ListAgents` before taking it (reuse across days is fine; two live sessions with one name is not — Boz addresses you by it). Then ask Jacob to `/rename` the session to it (it is a user command), so the session list shows it.
**Agent: FRESH** — nothing in the current windows carries this; a clean read of the shadow path is the point.

## The ask

Jacob, 2026-09-26, on a screenshot of buildings over flat ground: *"The buildings must be seated on the
ground. We invented the whole building foundation platform scheme to address this; you can see even with
the foundation block we still have light looking like the building is hovering off the ground."*
Then, on the diagnosis: *"It's in different maps, and I think it has to do with the shadow being from the
building and not the building + the riser."*

⇒ **RE-AIMED 2026-09-26 — the riser hypothesis is REFUTED, by agent Plumb, verified by Boz.** Every group
casts, the riser included, on both the slab and Stage paths (`SlabBuildings.jsx` depth material;
`LafayetteScene.jsx` Foundations). ⭐ Jacob confirmed it from below Provincetown: **every building has its
riser block, reaching down into the ground** — that block is what guarantees a building never cantilevers
off contoured terrain, and it is doing its job. **So the defect is: a lit strip at the foot of every
building, in every town. Cause not established.**

**Candidates, neither measured:**
1. **The fixed shadow depth bias** — `CelestialBodies.jsx`, `light.shadow.bias = -(0.5 / (2 * depth))`, i.e.
   0.5 m of depth in every town: ground within ~0.5·cos(sun elevation) of a wall's shaded side is left lit.
   (Plumb's lead. Also a constant sized once — check it against Layer 0's Class D tell.)
2. **The shadow map read through a matrix it was not drawn with** — the box follows the camera
   (`CelestialBodies.jsx` fitted-frustum `useFrame`) and `H-16` already recorded this failure once. It predicts
   every shadow shifted by the same amount in the same direction, changing when the camera moves.

**First deliverable is the measurement, not a fix:** one building on flat ground, in Preview, the width of the
lit strip at its foot — at two sun elevations, two bias values, and before/after a small camera nudge. Candidate
1 predicts a strip that follows the bias and cos(elevation) and ignores the camera; candidate 2 predicts one that
jumps with the camera. Report, then stop for Jacob.

### ✅ Also ruled 2026-09-26 (Jacob) — do this AFTER the shadow, as its own commit
*"The riser reaches from the building's floor down to y0."* ⇒ **the riser's job is ground contact, and its
bottom is the world datum, y = 0 — not a fixed depth.**
- Today the riser runs `[-FOUNDATION_BELOW_GRADE_M, foundationY]` (8 m, sized from LS's worst slope — the
  Class D tell) in the building's local frame, which is then lifted by `aCentroidY × uExag`. ⇒ its bottom
  moves with the lift and the exaggeration. Under the ruling the bottom vertices land at **world y = 0 at every
  exaggeration** — so it must be expressed in the vertex shader (render AND depth material, slab AND Stage),
  not baked as a constant. ⛔ No fallback depth.
- ⚠️ Check the datum: confirm y = 0 is at or below the lowest ground in every town (coastal towns derive
  their datum from the water face — `BAKE.md`, "where zero is"). If any town's ground dips below 0, stop and
  ask Jacob.
- **The floor height (the visible pedestal) is NOT ruled.** Jacob: tying it to `year_built` is "stupid", and
  *"it works in LS"*. ⛔ Do not change what Lafayette Square draws above ground; if you touch
  `periodPedestalFor`, bring Jacob the options first.
- Consumers: `cartograph/bake-buildings.js`, `SlabBuildings.jsx`, `LafayetteScene.jsx`. A bake-side change
  needs a re-bake and Jacob's go.

## Read first (both, before a plan)

- `cartograph/ARCHITECTURE.md §8` — **"Cast shadows"** (all four decisions, especially 1: every in-shader-displaced caster needs a `customDepthMaterial`) and **"Terrain doctrine — one dial, corner-mean anchor"** (the riser exists because a rigid building on a slope floats).
- `ROADMAP.md` **H-14** (huron shadows, eye gate owed) and **H-16** (the flash — a map sampled through a matrix it was not rendered with). Not your defect, but they share the file.

## Code sites

- `cartograph/bake-buildings.js` `buildingGeometry` — walls `[foundationY .. wallTop]`, foundation `[-FOUNDATION_BELOW_GRADE_M .. foundationY]`; `periodPedestalFor` in `src/lib/foundationGeometry.js` sizes the riser.
- `src/components/SlabBuildings.jsx` — one mesh per group (`foundation` / `wall` / `roof`), `castShadow`, and the `customDepthMaterial` block (grep `THE SHADOW PASS MUST REPEAT THE VERTEX LIFT`). Check, per group: does the **foundation** mesh actually cast? does its depth pass discard it (`vCoveredD`, `aCovered`)? is its side/shadowSide such that the depth pass sees it?
- `src/components/LafayetteScene.jsx` — the live (Stage) building path also carries a `customDepthMaterial`; Stage and Preview/production must agree.
- `src/components/CelestialBodies.jsx` — the bias block (grep `normalBias`). Boz ruled bias out by arithmetic (0.5 m depth, one texel normal), not by measurement; don't reopen unless your evidence points there.

## The chain

Upstream you trust: the baked `buildings.json`/`.bin` groups and their `aCentroidY`. Downstream that
trusts you: every surface that draws the slab — Stage, Preview, production — through `SlabBuildings`
(and Stage through `LafayetteScene`). A fix in one surface only is a new disagreement between them.

## Can the instrument see it?

The gate is Jacob's eye, town and shot recorded — but only after a measurement that predicts it (above). Use
Preview (production's exact render tree); do not build a parallel harness.

## Bounds

- Write in `src/components/SlabBuildings.jsx`, `LafayetteScene.jsx`, and `bake-buildings.js` if the geometry itself is the cause. A bake-side change needs a re-bake and Jacob's go.
- Canon edits: `cartograph/ARCHITECTURE.md §8` "Cast shadows" gets the rule you establish, and `ROADMAP` gets a line. Nothing else.
- Commit message names the register it reached (`FEATURES`/`OPERATIONS`) or says "reaches no register".
- Anything you find that is not this — report it, don't absorb it.

**The instruction is confirm-then-build:** read both, tell Jacob what you found, and if the code
contradicts this brief — stop and flag him.
