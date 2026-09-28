<!-- BRIEF-STATE
status: HOLD
dispatched: yes (Mortise)
written: 2026-09-28
evict-when: node checks/claims-one-movie-driver.mjs
-->
# BRIEF — One movie driver: the authored camera path is played by one component

**State (2026-09-28):** built and landed (`2f2673fb`…`b488b4e1`). Held for the parity census re-take and the
operator's eye on the movie.

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

## 5. Rulings (Warden, 2026-09-28)

- **The near plane is a quality-profile field**, `movieNear` (desktop 1 under log depth, phone 10 under linear
  depth); MovieCamera sets it on entering the movie and restores it on leaving. No sniffing.
- **Stage keeps its playhead**: it plays from the scrub and writes it back; `<MovieCamera start>` takes it.
- **The entry tween samples the path through the driver** (`handle.current.pose()`), so production's chase and
  Preview's tween read the driver's clock — which closed Preview's land-then-jump (its tween sampled one phase,
  its frames played another).

## 6. Out of scope

The plan and street cameras (RegimeControls, browse framing, the street eye), transitions between shots, and
gestures.

## 7. Done means

- One driver. The three hero branches are **deleted**; the commit names what was removed.
- Both checks in §4 pass, and each was seen to fail.
- `ls/ARCHITECTURE.md §1` names `MovieCamera` beside `<Town>`, and the commit names that register.

## 8. Parity — where it stands, and what is parked (2026-09-28)
- **The driver's own divergence is closed:** `camera.near` is 1 in Stage, Preview and production (it was 10 vs 1).
- **`claims-stage-preview-parity` compares only what is comparable** (Warden's ruling, no product hook): each census
  records its view's clock (the time-of-day store's minute) and whether the camera moved; clock-shaped fields (fog,
  the lit rig and casters, Moon/Sun/Stars/CounterBody, neon) are compared only on the same minute, `fov` only on a
  still camera or an equal path phase. Otherwise the field is printed **NOT COMPARABLE** and the check cannot be
  green. ▶ `node checks/claims-stage-preview-parity.mjs [--self-test]`
- **Measured on huron** (harness-pinned start `Math.random = 0`, the store set to noon): 0 comparable divergences;
  **11 fields NOT COMPARABLE** — the clocks differ (each app drives its own: Stage's scrub, Preview's `<Town time>`,
  production live) and the movie camera's phase has no readout.
- ⛔ **PARKED — not solved:** a same-clock, same-phase census needs a way for the probe to set Preview's clock and a
  read of MovieCamera's phase. Production's player dies at cutover, so no door into it (Warden). Until then those
  fields are unproven, not passed.
