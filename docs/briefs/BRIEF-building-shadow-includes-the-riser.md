<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: a building's shadow starts at the foot of its riser in every town, measured and eye-gated by Jacob with the scene recorded.
-->

# The building's shadow must include the riser

**You are the dispatched agent. Name yourself — one word, yours.**
**Agent: FRESH** — nothing in the current windows carries this; a clean read of the shadow path is the point.

## The ask

Jacob, 2026-09-26, on a screenshot of buildings over flat ground: *"The buildings must be seated on the
ground. We invented the whole building foundation platform scheme to address this; you can see even with
the foundation block we still have light looking like the building is hovering off the ground."*
Then, on the diagnosis: *"It's in different maps, and I think it has to do with the shadow being from the
building and not the building + the riser."*

⇒ **The working hypothesis is Jacob's: the shadow is cast by the walls/roof only, not by walls + roof +
foundation riser.** A shadow that begins at the wall's base, while the visible building begins at the
riser's foot, reads as a lit strip under the building — hovering. It is seen in more than one town.

⛔ **This is a claim to confirm, not a fact.** Your first deliverable is a yes/no with the evidence, before
any fix. If the code says otherwise — stop and tell Jacob what you found.

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

The defect is visual and view-dependent, so **the gate is Jacob's eye, with the town and shot recorded**.
Before you ask for it, give a measurement that predicts it: for one building on flat ground, the gap
between the footprint edge and the shadow's near edge, before and after. A riser of height *h* under a
sun at elevation *e* predicts a gap of about *h / tan(e)*, so it should vary with the riser's height and
the sun, and go to zero after the fix. Use Preview (production's exact render tree) as the surface; do
not build a parallel harness.

## Bounds

- Write in `src/components/SlabBuildings.jsx`, `LafayetteScene.jsx`, and `bake-buildings.js` if the geometry itself is the cause. A bake-side change needs a re-bake and Jacob's go.
- Canon edits: `cartograph/ARCHITECTURE.md §8` "Cast shadows" gets the rule you establish, and `ROADMAP` gets a line. Nothing else.
- Commit message names the register it reached (`FEATURES`/`OPERATIONS`) or says "reaches no register".
- Anything you find that is not this — report it, don't absorb it.

**The instruction is confirm-then-build:** read both, tell Jacob what you found, and if the code
contradicts this brief — stop and flag him.
