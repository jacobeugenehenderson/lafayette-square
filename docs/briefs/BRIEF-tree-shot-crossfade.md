<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: RULING: Jacob's eye gate on movie ↔ plan ↔ street, two towns
-->
# BRIEF — Trees cross-fade between shots; never swap during one

**For:** a fresh agent, in the kit. **Written:** 2026-09-27. **Depends on:**
`BRIEF-one-town-assembly.md` (the `shot` prop and its transition progress).
**Spec it serves:** The Ward's `README.md` §11, "Trees change drawing only between shots".

## The rule (Jacob, 2026-09-27)
The town has two tree drawings: **top-down** (overhead impostors, `OverheadTrees.jsx`) for plan
view, and **side-on** (hero impostor cards and meshes, `HeroImpostorTrees.jsx` and the mesh
instances in `InstancedTrees.jsx`) for the movie and Street. **The drawing changes only on a shot
change** (movie ↔ plan ↔ street), cross-faded over that move's own progress. It never changes
during a shot, and nothing reads camera height to decide it. This keeps the swap doctrine as
ruled: the comment on `useOverheadMode` — *"Selection = the CAMERA VIEW, not a height heuristic"*.

## Premises — confirm, and say what you found
1. **The player swaps instantly, at the start of the move.** `InstancedTrees.jsx` passes
   `visible={overheadMode}` / `visible={!overheadMode}` and no `opacity`; `useOverheadMode` flips
   when `viewMode` flips, which `useCamera.setMode` does before the camera travels. So on
   hero → browse the top-down discs appear while the camera is still low and angled. **Not yet
   confirmed by eye** — confirm in Preview before building.
2. **The fix already exists in the Grove.** `src/arborist/Grove.jsx` drives its Hero ↔ Browse
   toggle with `createCameraTween` (`src/preview/cameraTween.js`, the player's own tween) and
   cross-fades the tree forms by its eased progress (`arborist/ARCHITECTURE.md`, the Grove
   section). Both tree components already take an `opacity` prop (`OverheadSpecies`,
   `HeroImpostorSpecies`); the player never passes it.
3. **The mesh trees have no opacity path.** The tall "anchor" trees render as meshes; check
   whether they need one, or whether they may simply stay (they are side-on and correct in both).

## The work
**Restore the Grove's pattern; don't build a new one.** The town assembly receives `shot` and a
transition progress; both drawings are mounted only during a transition, each at its eased
opacity; outside a transition only one is. The Grove and the assembly should then share one
implementation, not two.

## Checks
- A check that no tree component reads camera height or `camera.position` to choose its drawing.
- A check that both drawings are never visible outside a transition.
- Eye-gate in Preview, on two towns, hero → plan and back, recorded with the scene named.

## Docs
- `arborist/ARCHITECTURE.md`'s tree-tier table says the overhead drawing is *"selected by camera
  height"*. The code says the opposite, emphatically. **Rewrite that cell** (rot), and rewrite the
  Grove/transition section to describe one shared cross-fade.
