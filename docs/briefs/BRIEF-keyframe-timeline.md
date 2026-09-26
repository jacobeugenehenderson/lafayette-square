<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: a Hero keyframe sits at a time the operator chose on a timeline, Add / Delete / drag act on the playhead, every runtime plays the timing, LS's Arch shots and every town's existing keys play back sample-identical, and Jacob has used it in Stage.
-->

# The keyframe timeline: keys sit in time, where the operator puts them

**You are the dispatched agent. Name yourself: one word, not a name another RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-26)

Looking at Stage's Hero keyframe panel: *"such stupid controls"*, *"'After'? That's just stupid and not anything I
asked for. This needs to get fixed."* He chose, from two options, **a real timeline, like After Effects or Premiere**:
- the playhead goes anywhere;
- **Add key** drops the current view at the playhead;
- a key can be **dragged** to retime it;
- **Delete** removes the key under the playhead;
- playback follows the operator's timing.

The rejected option was the quick fix that kept evenly spaced keys. ⛔ Don't fall back to it.

## What Boz found (confirm it; don't inherit it)

- **Keys carry no time.** `keyframes` is an ordered list of `{position, target, fov}`. The Stage rail spaces them
  by index (`src/stage/StageApp.jsx#HeroCamera`, `fracOf(i) = i/(n-1)`). The only way to lengthen the path is
  `addKey`'s *"after the selected key"*, which is where **"+ After"** came from (Sill, `8fb25329`).
- **Playback retimes the path itself.** `src/preview/heroAnim.js#heroKeyframeAnim` uses an arc-length reparam
  (even speed between keys) plus a smoothstep **dwell** per key (`_kfDwell`), inside a ping-pong wave over
  `motion.period` (default 720 s) × `motion.speed`. `lerpFov` / `catmullRom` segment by index.
- **Readers of `keyframes`** (grep `keyframes` in `src/`, `arborist/`, `checks/`): Stage (`StageApp.jsx`),
  Cartograph (`CartographApp.jsx`, the store), Preview (`PreviewApp.jsx`), production (`Scene.jsx`),
  `arborist/bake-trees.js` (ranks tree tiers from the keyframes; a keyframe with no target throws), and the checks
  `claims-a-keyframe-carries-its-aim`, `claims-hero-degrade-static`, `claims-the-camera-has-one-definition`.
  Keyframes are authored in `design.json` and shipped in `scene.json#shots` by `cartograph/bake-scene.js`.

## The shape (confirm with Jacob, then build)

1. **A key carries its time.** Every key gets a time on the shot's timeline. The panel is a timeline: a playhead
   you drag, key markers at their times (draggable to retime), **Add key** at the playhead (it replaces the key
   if the playhead sits on one), **Delete** on the key under the playhead, and ‹ › to jump between keys. ⛔ No
   "+ After", no "Update" as a separate idea: adding at a key's time IS updating it. The FOV slider stays.
2. **One interpolation, driven by time.** Playback puts the camera at the playhead's time, in every runtime:
   Stage, Preview and production. ⛔ No runtime keeps the old index-spaced path.
3. **Migration, and the acceptance.** Existing keys get the times at which **today's playback** reaches them,
   i.e. after the arc-length reparam, not the index spacing. That way LS's Arch shots and every town's keys play
   **sample-identical** before and after. Name how many keys, in how many Looks.
4. **For Jacob to rule before you build** (don't guess): what the timeline's length is and how the loop behaves.
   Today it's a ping-pong over `period`, eased by `easing`, with a dwell at each key. Does the timeline show one
   forward pass that then plays back, does it loop, and does the dwell survive now that the operator places
   time? Put the options to him in plain words, with a recommendation.

## Can the instrument see it?

- Extend `claims-a-keyframe-carries-its-aim` to require a time on every key, strictly increasing. Mutation: drop
  one.
- A before/after sample check: the camera pose at fixed times, for every Look with keys, is identical across
  the migration.
- `claims-the-camera-has-one-definition` stays green.
- Jacob's eye: lay down, drag and delete keys in Stage on Huron, then the same shot in Preview.

## Bounds

- Write: `StageApp.jsx#HeroCamera`, `heroAnim.js`, the keyframe readers listed above, `bake-scene.js` if
  `scene.json#shots` changes shape, the store, a one-time migration of authored keys, and the checks.
- ⛔ The camera controls (`RegimeControls.jsx`, `cameraRegimes.js`) are done; don't touch them. Browse, Street and
  the Designer are out of scope.
- No bake or pour without Jacob's go in your own window; `bake-scene.js --look=<look>` re-emits `scene.json`.
- Commit only your own paths (`git commit -- <paths>`); the working tree is shared.
- Canon: `cartograph/OPERATIONS.md` (the Hero panel) and `ARCHITECTURE` (the keyframe shape). Commit messages
  name the register reached.

**The instruction is confirm-then-build:** read the code, tell Jacob what you found and your answer to item 4, and
if the code contradicts this brief, stop and flag him.
