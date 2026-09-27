<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: going Designer → Stage → Designer leaves the Designer exactly as a fresh load of it, on every town, a check proves it by comparing the two, and Jacob has used it without a hard refresh.
-->

# Stage → Designer: coming back must be a fresh Designer, not an undo

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

*"From Designer into Stage, the scene goes from 2D to 3D, and everything gets 'inflated' and filled and
enfleshed. We do not have a dependable* deflator *to go back into the 2D view. I can hard refresh but it would
be better if we just fixed this."*

**And the acceptance, sharpened (Jacob, 2026-09-27):** *"when I click the 'designer' button in STAGE the scene
MUST flatten and return to Browse camera."* ⇒ two requirements, both at the click with no refresh: **flat** (a
fresh Designer's 2D scene) and **the Browse camera** (the town's own Browse framing, not wherever Stage left it).

## ⭐ The frame: not a deflator

A deflator is an undo. It has to know everything Stage changed, and it breaks the next time Stage learns to
change something new. **The rule is: the Designer is a function of its own state.** Entering it produces what
a fresh load of the Designer produces, whatever ran before. So the work is to find **what Stage leaves
behind that the Designer reads**, and stop it leaking. Don't write code that reverses it.

⭐ A hard refresh fixes it, so the leaked state lives in memory: a module-level singleton, a shared material or
uniform patched in place, a cache keyed without the mode, or store fields the Designer doesn't reset. It is
not in the baked files. **Cause not established:** Boz has not reproduced it or seen what stays "inflated".

## Leads, not findings (confirm each in the code)

- `src/cartograph/CartographApp.jsx`: the shot switch (grep `if (shot === 'designer')`) resets only the
  **camera**. `reloadTerrain(activeLookId, …)` points a **terrain singleton** at the Look's heightfield, and
  the Designer shares that process. `effectiveLayerVis` swaps live ↔ baked layer visibility by shot.
- The terrain shader patches (`src/utils/terrainShader.js`: `patchTerrain*`, `uExag`) are applied in
  `onBeforeCompile`. A material or uniform shared between the Designer's layers and Stage's meshes would stay
  patched after the switch.
- ⭐ **Sibling class, parked:** `docs/briefs/BRIEF-scene-leak.md` (switching town in Extent leaves the old
  town on screen; a refresh fixes it). That's a *scene* switch rather than a *mode* switch, but it's the same
  invariant: **after a switch, the screen equals a fresh load.** Read its §4 (its candidates and the existing
  guard one layer down). If your check catches both, say so. Don't fix the parked one without Jacob's go.

## The steps

1. **Reproduce and inventory.** On Huron, and on one other town (not LS alone), go Designer → Stage (Hero) →
   Designer. List exactly what differs from a fresh Designer load of the same town and camera: buildings
   extruded? terrain relief? trees? ground fill? material look? layers shown? Screenshot both.
2. **For each difference, name its holder** (the singleton, uniform, cache or store field) and the code that
   sets it. Report the list to Jacob before changing anything.
3. **Fix at the holder:** key it by mode, or have the Designer derive it from its own state on entry.

## Can the instrument see it?

⭐ The check is the deliverable: **drive a switch, then compare against a fresh load.** Designer → Stage →
Designer and a fresh Designer load of the same town should produce the same scene-graph inventory (mesh
count, which layers draw, each material's defines and uniforms, the terrain source), with no differences
allowed. Mutation-test it: leave one holder unfixed and watch it fail. Run it on every registered town,
including `toy` as the controlled fixture. Then Jacob's eye.

## Bounds

- Write: `CartographApp.jsx`, the holders you name, and a check under `checks/`. No bake, no pour.
- ⛔ The camera controls (`RegimeControls.jsx`, `cameraRegimes.js`) are done; the Hero keyframe panel in
  `StageApp.jsx` belongs to the keyframe-timeline agent. Coordinate through Boz before touching either.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared.
- Canon: `ARCHITECTURE` (the mode-switch invariant) and `OPERATIONS` if the operator-visible behaviour
  changes. Commit messages name the register reached.

**The instruction is confirm-then-build:** reproduce, inventory, tell Jacob what you found, then build. If the
code contradicts this brief, stop and flag him.
