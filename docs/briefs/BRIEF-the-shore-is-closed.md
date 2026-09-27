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

## What the bare space was, and the state now (Strand, 2026-09-27)

- **It was a void standing on its edge.** The water is a level sheet, the land is draped; nothing lay under the
  water, so wherever the land's edge stood above the sheet the sky showed through (seen on Provincetown's harbour).
- **Closed by the bed, and the bed is in the terrain.** Jacob, 2026-09-26: *"water is always flat, and the edge of
  water is always where the flat plane meets any other plane."* `bake-terrain` writes the USACE beach profile under
  the mapped water down to the visibility depth (`BAKE.md`); the `bed` ground group drapes over it, and the water
  thins over the shallows. The shore is bare of curb/sidewalk (`tileGround.js` `shoreAt`); land no longer paints
  over the water (the flatten is strictly simple, `52cba914`). ▶ `node checks/claims-the-shore-is-closed.mjs`
- ✅ **EYE GATE — the water over the bed** (Jacob, 2026-09-27, Provincetown, relayed by Boz): *"OH MY GOD it looks
  so beautiful and real!"* Still owed: the revetment's heap ends, and both towns at the water's edge near and far.
- **STRUCTURES OVER WATER — ruled 2026-09-27, partly built.** Landed: `structures.mjs` (every OSM bucket, by tag),
  the rock kept under breakwaters/groynes (`cde379d0`), shore-armour reading every bucket (`e521e577`). A groyne also
  tagged `barrier=wall` is TWO structures (Jacob: "perhaps it's 2"). **Stone on every mapped breakwater/groyne**, the
  ones the drawing left inside the water included: `bake-revetment` walks each outline (▶
  `node checks/claims-every-mapped-stone-structure-is-stone.mjs`, red on the live artifacts until the re-bake below).
  Deck thickness is sourced (`f-fhwa-concrete-deck-min` 7 in, `f-usfs-timber-deck-min` 5½ in). ⛔ **Rulings owed before
  the decks are built:** (1) **floating docks** at land height, or 16–24 in above the WATER (UFC 4-152-07 §6-3.3.1);
  (2) **untagged pier material** (most piers in both towns): timber, concrete, or refuse; (3) **metal decks**: as
  concrete, or refuse. Breakwaters are sized against the LOW level (ruled 2026-09-27, 0962f27b), so the tide covers them.
- **OPEN — the revetment's bottom edge, "once and for all" (Jacob, 2026-09-27):** the contact of two materials, a
  blend both ways (the sand coloured where it meets stone, the stone where it meets sand), not more geometry. First
  read Furrow's ground-contact work and say whether that mechanism carries over. Proposed after the tide lands.
- **OPEN:** · each town's own water
  clarity (`references/` q-water-clarity-per-town) · real depth inside the visible band (`BRIEF-bathymetry.md`).
  **Not walked:** Lafayette Square's pond (drawn outside the slab).

## Read first

- `docs/briefs/BRIEF-boulder-revetment.md` (all of it: the shore's rulings, what was measured false, and
  §6's 2026-09-26 ruling that the drawn water is the shore, which retired `r-coast-trust-the-lidar`).
- `docs/briefs/BRIEF-ground-cross-polygon-conformity.md` (the ground must stretch, not break; Huron's shore
  seam) and `BRIEF-bathymetry.md` (the depth under the water; the old distance-to-shore path is in the Diary).
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

## ▶ READY TO RUN on Jacob's go (Strand's handoff, 2026-09-27 night; not run, since a peer can't give the go)
The terrain changed (the rock stays under breakwaters and groynes, cde379d0), so each town, **provincetown first, then huron**:
```
cd cartograph && node bake-terrain.js --scene=T && cp data/T/clean/terrain.json ../public/baked/T/ && cp data/T/clean/terrain.bin ../public/baked/T/ \
  && node bake-ground.js --look=T --scene=T && node bake-ground-ao.js --look=T --scene=T && node bake-lamps.js --look=T --scene=T
```
then the trees with the flags from `tree-bake-inputs.mjs#treeBakeInputsForMap(T)` (as serve.js builds them), then
`node bake-tree-anchors.js --look=T --scene=T`, then `node bake-revetment.js --scene=T` (every OSM bucket, the toe berm, and the
breakwater/groyne walks). Checks: `claims-the-shore-is-closed`, `claims-the-ground-has-no-cross-polygon-t-junctions`,
`claims-a-level-body-has-one-surface`, `claims-every-metre-of-drawn-shore-is-named`, `claims-every-mapped-stone-structure-is-stone`,
`claims-the-armoured-shore-is-never-empty`. LS: prove terrain.bin byte-identical (no coast, so the step never runs).
**Next:** solid decks after the rulings above, lifting what stands on them. **His eye:** the breakwaters, the revetment's heap ends,
and both towns at the water's edge near and far.
