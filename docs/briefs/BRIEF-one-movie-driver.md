<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-28
evict-when: node checks/claims-one-movie-driver.mjs
-->
# BRIEF — One movie driver: the authored camera path is played by one component

**For:** Mortise (who wrote it), after Warden reads it. **Sibling of** `BRIEF-one-town-assembly.md`: that brief
gave every app one `<Town>`; this gives them one player of the town's movie.
**Why now:** Quire's Ward needs the movie shot, and Warden ruled (2026-09-28) that the movie is the kit's authored
path, *played and never steered*, so the kit owns it. Today there are three players, and The Ward would be a fourth.

## 1. The problem

The movie shot plays the slab's `heroKeyframes` through `heroKeyframeAnim` (`src/preview/heroAnim.js`). Three apps
each wrap that call in their own driver, and each owns the clock, the start phase, the fov write, the near plane
and the controls' target on its own:

| App | Driver | Clock | Start |
|---|---|---|---|
| production | `Scene.jsx` `CameraRig`, its `vm === 'hero'` branch | `clock.elapsedTime` | `randomizeHeroStart` (module state in heroAnim.js) |
| Preview | `PreviewApp.jsx` `ShotCamera`, its hero branch | `clock.elapsedTime` + `heroPhase` ref | its own `Math.random() * heroCycleSec` |
| Stage | `StageApp.jsx` `HeroPreview` | its own accumulator × `motion.speed` | the playhead (`heroScrub.t`) |

**Measured divergence (parity census, Provincetown, 2026-09-28):** `camera.near` is **10** in production's movie
shot (CameraRig: "Adjust near plane for depth precision") and **1** in Preview and Stage. Every app frames the same
shot through different optics, and `claims-stage-preview-parity` reports it.

## 2. Premises — claims, not facts. Confirm each against the code first, and send Warden what you found.

1. All three drivers call `heroKeyframeAnim` with the same keyframes and motion, resolved through
   `resolveHeroKeyframes` (production and Preview) or the live store (Stage). ▶ `grep -rn "heroKeyframeAnim(" src`
2. Nothing but the three drivers writes the camera pose during the movie shot.
3. The near-plane difference is the only optics divergence. ▶ re-take the three-sided parity census.

## 3. The target

**`src/camera/MovieCamera.jsx`**, mounted by an app as `<Town>`'s sibling while `shot === 'movie'`. It plays the
path and nothing else:
- **Inputs:** `lookId` (keyframes + motion from the slab), or `keyframes` + `motion` (Stage's live store) ·
  `start` (`'random'` = a random phase of one cycle, chosen once when the path arrives, or a playhead time) ·
  `playing` (Stage's Play button; default true) · `speed` · `onTime` (Stage's scrub readout).
- **Owns:** the clock, the phase, the pose + aim + fov write every frame, the controls' target, and the movie
  shot's near plane (one value, per §5).
- **Does not own:** entering or leaving the movie. Production's chase-into-the-path, Preview's tween, the
  drag/wheel that exits to plan, idle → movie, and Stage's scrub pushes stay the app's.

## 4. Checks — write each first and watch it fail

1. **`claims-one-movie-driver`:** no file under `src/` calls `heroKeyframeAnim` except `MovieCamera.jsx` (and
   heroAnim.js itself). Every app that mounts `<Town>` mounts `<MovieCamera>`. Read from the sources, never listed.
2. **Parity:** `claims-stage-preview-parity` shows the same `camera.near` / `far` / `fov` in the movie shot in all three.

## 5. Rulings needed (Jacob, through Warden)

- **The movie shot's near plane: 10 or 1?** Production chose 10 "for depth precision"; Preview and Stage render
  at 1 under log depth, which is what the operator judges. A phone profile renders linear depth
  (`qualityProfile.js`), and that is where 10 may be needed. It could be a quality-profile field, not a
  constant.
- **Random start in Stage?** Stage plays from the playhead today; keeping that is my default.

## 6. Out of scope

The plan and street cameras (RegimeControls, browse framing, the street eye), transitions between shots, and
gestures.

## 7. Done means

- One driver. The three hero branches are **deleted**; the commit names what was removed.
- Both checks in §4 pass, and each was seen to fail.
- `ls/ARCHITECTURE.md §1` names `MovieCamera` beside `<Town>`, and the commit names that register.
