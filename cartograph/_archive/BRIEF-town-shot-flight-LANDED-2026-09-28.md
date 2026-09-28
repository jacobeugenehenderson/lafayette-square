<!-- BRIEF-STATE
status: LANDED
dispatched: yes (Mortise)
written: 2026-09-28
evict-when: node checks/claims-one-shot-flight.mjs
-->
# BRIEF — The flight between shots: `<Town>` animates a shot change

**For:** Mortise. **Built 2026-09-28 — §6.** **Why:** the old player flew
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

- **The old player keeps its own motion (Warden, 2026-09-28).** `Scene.jsx#CameraRig` is frozen to fixes and runs
  lafayette-square.com; it mounts `<Town flight={false}>` and keeps its beginTransition — THE ONE SANCTIONED SECOND
  TWEEN, exempt by name in the check, **retired at the cutover**. Its motion is the reference the one tween ports.

## 5. Out of scope
The old player's cutover. Gestures inside a shot (orbit, pan, street look). The Designer camera.

## 6. Built (2026-09-28)
- **One tween:** `src/camera/cameraTween.js` (Preview's, promoted; `src/preview/cameraTween.js` deleted) with production's
  chase (`chase` re-samples a moving destination each tick). **One easing:** `src/lib/ease.js#easeInOutCubic` (the
  weather fade imports it too).
- **`src/camera/ShotFlight.jsx`, mounted in `<Town>`:** a shot change flies to the town's destination — movie: the
  driver's pose, chased; plan: frameDensest over the lit places else every listed one, fitted to the free region under
  browseHeading, a true overhead on landing (no placed place → the Extent, said); street: the eye at `streetAt`.
  Controls held off while flying, handed back on landing. A pointerdown/wheel ends it where it is.
- **The app's links (agreed with Quire):** `flight` (true · 'cut' · false = hands off), `streetAt`, `viewInset`
  (a camera view offset; the movie full frame; eased on the flight), `flightRef` ({ from, to, t, eased, duration, at,
  landed, interrupted }, t = 0 set in a layout effect), `onFlightEnd` (once). A cut whose destination is not known yet
  reports landed only when placed, and never for a shot already left.
- **Preview** keeps only its hero-exit gesture and controls; **Stage**, the **old player** and the legibility harness
  pass `flight={false}` (they place their own camera).
- ▶ `node checks/claims-one-shot-flight.mjs` (static; red 18 → 0) · `node checks/claims-a-shot-change-flies.mjs`
  (runtime: movie → plan runs 2400 ms on the frame clock, position linear in easeInOutCubic to 0.0000 of the move, true
  overhead; plan → movie lands at the movie's pace; a wheel interrupts; with `?inset=320,0,0,0` the plan target sits at
  the free region's centre ±3 px and the offset rides the eased curve; mutations — linear ease, 1500 ms — both caught).
