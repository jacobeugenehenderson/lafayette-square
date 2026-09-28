<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-28
evict-when: node checks/claims-one-shot-flight.mjs
-->
# BRIEF — The flight between shots: `<Town>` animates a shot change

**For:** Mortise, after Warden reads it. **Written, not built** (Warden, 2026-09-28). **Why:** the old player flew
hero → plan in one continuous move; the Ward **cuts**, because it mounts `<Town>` alone and `<Town>` does not own the
camera outside the movie. Now that the movie lives in `<Town>` (`80a1baa8`), the flight is the next thing the Ward
cannot get without importing the old player.

## 1. What exists today (read from the code, 2026-09-28)
- **Two tween implementations, one timing table.** `src/camera/transitions.js` (`SHOT_TRANSITION_MS`, keyed by the
  shot entered: hero 2500 · browse 2400 · street 1500) is shared. The motion itself is built twice: production's
  `Scene.jsx#CameraRig` hand-rolls `beginTransition` (lerp pos/target/fov/up, chase into the moving movie pose, snap
  to a true overhead on landing in plan); Preview uses `src/preview/cameraTween.js#createCameraTween` (the same lerps,
  no chase — it lands on a pose sampled at entry). Stage's `CartographApp#CameraRig` has a third, for its own shots.
- **Destinations are the app's.** Movie: the driver's `handle.pose()` (now Town's). Plan: production's
  `browseAltitude` over `shots.browse.bounds`/`browseHeading`; Preview's `resolveShotPose('browse')`. Street: the eye
  at a clicked point (`streetEyeY`). Each app answers "where does this shot put the camera" itself.
- **Controls:** every app's `RegimeControls` (one regime per shot, `cameraRegimes.js`); a flight disables them and
  re-applies the regime on landing (`applyRegime`).

## 2. What `<Town>` would need
1. **One tween**, in the kit: `createCameraTween` promoted to `src/camera/` with production's chase (land on the
   *moving* movie pose, not a sampled one) and the overhead snap. Scene's and Preview's hand-rolled motions are
   deleted; Stage's too, if its shots are the same shots.
2. **The destination of each shot, answered by the town, not the app:** movie = the driver's pose; plan = the plan
   framing — ⭐ the new `frameDensest` opening frame (the places), fitted to the viewport, under the town's
   `browseHeading`; street = needs a point, so a street entry stays an app input (`<Town streetAt={[x, z]}>`).
3. **Town sees the shot CHANGE** (it already receives `shot`): on a change it flies from the current pose to the new
   destination with the one tween, holds MovieCamera (`hold`) while flying, and hands the controls their regime on
   landing. The apps' own transition code and their `movie.hold`/`handle` links go.
4. **An app can still cut:** `<Town flight={false}>` (the Ward's choice to make, not the kit's).
5. **Interruption:** a gesture during a flight ends it where it is (today each app decides this differently — one rule).

## 3. Checks (write first, see red)
- `claims-one-shot-flight`: exactly one camera tween in `src/` (no `beginTransition`/hand-rolled lerp in an app);
  Town owns the destination per shot; the durations come from `transitions.js` only.
- Runtime: under a Town-only page, a shot change moves the camera over ≥ N frames (not one), and lands on the shot's
  destination (the movie pose on the driver's clock; the plan frame).

## 4. Rulings (Warden, 2026-09-28)
- **Stage does NOT join.** Stage is authoring: it cuts (`<Town flight={false}>`), and its Designer ↔ Browse framing
  hand-off stays its own.
- **Plan's destination is `frameDensest`'s frame** (the places), as ruled for the plan opening.

## 5. Out of scope
The old player's cutover. Gestures inside a shot (orbit, pan, street look). The Designer camera.
