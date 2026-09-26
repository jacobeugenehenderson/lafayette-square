<!-- BRIEF-STATE
status: OPEN
dispatched: Cue, 2026-09-26 — built; awaiting the scene re-bake and Jacob's eye
written: 2026-09-26
evict-when: a Hero keyframe sits at a time the operator chose on a timeline, Key here / Delete / drag act on the playhead, every runtime plays the timing, every town's existing keys are reached at the same second as before, and Jacob has used it in Stage.
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

## The shape — RULED by Jacob, 2026-09-26

- **Fixed length, keys as fractions of it.** `heroMotion = { length (s), mode: 'bounce' | 'loop' }`; each key
  `{ position, target, fov, t }`, `t` ∈ [0,1]. Changing the length stretches every key.
- **The first key sits at 0 and is never deleted. One key is a static shot.** With one key, a new key goes to
  the end. **Bounce:** the last key is pinned at the end. **Loop:** the camera travels on from the last key to
  the first, which closes the loop at the end as a *linked* marker (never stored).
- **Key here** keys the view at the playhead (on a key it replaces it). **While playing it keys that exact
  moment and playback carries on** — *"pause is pause, keyframe is keyframe."* **Click a key** → the playhead
  goes there and pauses; **drag it** → retime it. **Delete** removes the key under the playhead.
- **Loop ⇄ Bounce redistributes:** ×(n−1)/n into a loop; back out by whatever puts the last key on the end.
  *(Jacob: the pace change is substantial — a whole return leg is added — "but that doesn't matter.")*
- **No whole-shot ease** (*"it feels like the camera is stalled … if it's a loop we'd not want any easing"*).
  Speed follows the operator's spacing and changes smoothly through each key; a bounce turns quickly at its ends.
- ⛔ **Acceptance changed, and why.** "Sample-identical" and "playback follows the operator's timing" cannot
  both hold: the retired sine wave is what made them differ. Ruled: **every key reached at the same second as
  before, and the path's shape unchanged**; between keys the pacing changes (▶ the migration prints it).
- **Migration:** 11 keys in 4 Looks, `node scratch/keyframe-timeline-migrate.mjs <old heroAnim.js>`.

## Can the instrument see it?

- Extend `claims-a-keyframe-carries-its-aim` to require a time on every key, strictly increasing. Mutation: drop
  one.
- Every key reached at its time, in both modes, for every Look with keys (in the same check).
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
