<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: along every shore of every town, no point between the water and the land is bare; a check walks the shoreline and proves it; Provincetown and Huron pass; and Jacob has seen both at the water's edge.
-->

# The shore is closed: no bare space between the water and the land

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

*"The revetment still has never succeeded fully; there's just lots of space with no fill. It seems like we need a
more straightforward rule that there must be no bare space between the water and the land, no matter what
it's made of, no matter what distance or angle. This is PTown and Huron."*

## ⭐ The rule, and why it replaces a question

**The water and the land always meet.** What fills the meeting is a separate question: stone, sand, a wall, or
the ground running to the waterline. **"Bare" is never one of the answers**, at any distance or camera angle.

This is the kit's closed-shape doctrine applied to the shore: the neighborhood is one closed shape, and an edge
is **an edge of the drawing, never an absence** (`[[project_neighborhood_is_a_compound_shape]]`).

⛔ **What changes:** the revetment is one filler, not the thing that closes the shore.
- `BRIEF-boulder-revetment.md` §6 asks *"is every shoreline a wall?"*. That stays a real question about which
  **material**, but it no longer decides whether the shore is closed.
- The revetment bake prints on every run how much drawn shore it leaves **bare, and for which named
  reason**. Since 2026-09-26 the drawn water's edge IS the shoreline (Jacob), so nothing is declined as
  "not at the water" any more; on Provincetown most of the shore is now bare as **soft shore**. ▶
  `node checks/claims-every-metre-of-drawn-shore-is-named.mjs --code`. **A bare metre must still be filled
  by something.**

## What the bare space was, and the state now (Strand, 2026-09-26)

- **It was a void standing on its edge.** The water is a level sheet, the land is draped; nothing lay under the
  water, so wherever the land's edge stood above the sheet the sky showed through (seen on Provincetown's
  harbour). No plan-view holes, no unfilled strips. Closed by the **bed** (`bake-ground.js` `bed`, FLOOR_KEYS),
  held under its own water (per-body ceiling, `aClampY`) with a toe ring so the bank is a step at the mapped
  shore; the shore is bare of curb/sidewalk (`tileGround.js` `shoreAt`). ▶ `node checks/claims-the-shore-is-closed.mjs`
- **OPEN — Provincetown, land drawn over the drawn water.** Just inside the mapped shore, land-use faces stand
  above the water along 1.19 km (beach 1.15 · parking_lot 0.03; first at -4543.6, -1292.8, 3.18 m proud).
  ⛔ Cause not established — the faces and the water disagree about the edge there. The check prints it.
- **OPEN — the water's depth** is `BRIEF-bathymetry.md`. **Not walked:** Lafayette Square's pond (drawn outside the slab).

## Read first

- `docs/briefs/BRIEF-boulder-revetment.md` (all of it: the shore's rulings, what was measured false, and
  §6's 2026-09-26 ruling that the drawn water is the shore, which retired `r-coast-trust-the-lidar`).
- `docs/briefs/BRIEF-ground-cross-polygon-conformity.md` (the ground must stretch, not break; Huron's shore
  seam) and `BRIEF-water-shader.md` §6e (distance-to-shore; one of Huron's "shores" is the fetch envelope).
- The coast-distance channel (`cartograph/bake-coast-distance.js`, `context.coastDist.bin`) and the sand surface
  (`cartograph/surfaces.mjs#sand`: `beachBandM` is derived per town from the waterline).
- The tools already written: `scratch/huron-shore-transect/` (`negatives.mjs`, `predicate.mjs`, `profiles.mjs`).
  ⛔ Run them; don't rebuild them.

## Can the instrument see it?

⭐ **The check is the deliverable.** Walk every shoreline at a fixed step in metres (derive the step from the
terrain grid, not a constant). At each point, cast from the water side to the land side and record what the ray
hits first: water, a filler (named), ground with a surface, or **nothing**. Any "nothing" fails, with its
coordinate. Mutation-test it: remove one filler and watch it fail. Run it on every town with water (LS's pond
included, which must stay green and unchanged). Then Jacob's eye: Provincetown and Huron at the water's edge,
near and far.

## Bounds

- Measure and report first. The fix will likely touch the ground bake, the water mesh and the revetment; say
  which, and why, **before building**.
- No bake or pour without Jacob's go in your own window. LS is not re-poured.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared. ⚠️ Furrow holds
  `bake-ground.js`, and a revetment bake ran for Provincetown at 15:39. Coordinate through Boz before touching
  either.
- Canon: `cartograph/BAKE.md` (the shore rule), `OPERATIONS`, and the revetment brief's §6 updated to point
  here. Commit messages name the register reached.

**The instruction is confirm-then-build:** measure, tell Jacob what the bare space is and your proposal, then
build. If the code contradicts this brief, stop and flag him.
