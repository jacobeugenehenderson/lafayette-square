# BRIEF — the aimer: grab what you see and turn the camera in place

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-29, Boz, at Jacob's ask: "write the aimer brief")
evict-when: the orbit regime carries a GRAB-LOOK aimer: grabbing a point and dragging it turns the camera in place (position unchanged, up
kept vertical) so the point stays under the cursor; every existing gesture behaves exactly as before; one definition in cameraRegimes /
RegimeControls (claims-the-camera-has-one-definition green); a key captured after aiming plays back to the same view; checks green with
mutants seen RED; Jacob re-aims LS's keys with it. Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** **Report to Boz.** **Confirm-then-build:** every premise below is a claim. Confirm each against the code by symbol and
say what you found. If the code disagrees, stop and flag Boz. Zob reads your plan before you build. ⛔ The gesture is Jacob's to choose:
bring the options (§3.1) before building.

## 0. Why (Jacob, 2026-10-29)
- *"I drag the camera all the way to the left, and the arch goes out of frame… So I want to park the camera and rotate it to the arch."*
- *"It's like: plant it and point it"* · *"then: play it"*.
- *"I like the camera navigation controls as they are now; we just don't have a good 'aimer'."*
- *"I almost think it could be 'drag the exact object I am touching' so if it's the arch it drags the arch keeping you as the pivot."*
- LS's staging slab is a PLACEHOLDER until this lands: Jacob re-aims LS's keys with it, then LS re-bakes and its cutover follows.

## 1. The ruling (registry `r-plant-it-and-point-it`, read it in full)
- KEEP today's navigation EXACTLY: drag orbits, ⌥-drag grabs the ground, ⌘/⌃-drag pans, middle-drag dollies, wheel zooms.
- ADD an aimer, GRAB-LOOK: grab the point under the cursor and drag it; the camera turns IN PLACE (yaw and pitch about its own
  position, up kept vertical) so the grabbed point stays under the cursor. The 360° panorama / Street View drag; the rotational twin of
  ⌥-drag's grab-the-ground.
- One definition for every app. A key already stores position + target + fov, which is this model.
- Out of scope: moving up/down (the earlier draft's, narrowed out by 7bbf308e) and any change to playback.

## 2. What the code does today (Boz's read; confirm by symbol)
- `src/lib/cameraRegimes.js` is THE ONE HOME of how a camera is driven (`REGIMES`, `applyRegime`); `src/components/RegimeControls.jsx`
  is the React mount. `checks/claims-the-camera-has-one-definition.mjs` fails on any other controls mount. The aimer lives there.
- RegimeControls' orbit effect already owns a gesture of its own: the ⌥ grab (`onDown`/`onMove`, capture phase on window, the press
  swallowed before OrbitControls sees it: "⌥ IS A CLAMP", after a stylus "spiralled" the scene). The aimer is the same shape: a
  modifier-held press that OrbitControls never hears.
- `repivot(c)` runs on every primary press: the orbit target jumps to the ground under the screen centre (`groundUnderCentre`). So after
  an aim, the next orbit pivots where the camera now looks. Confirm that's what Jacob wants (it reads like yes).
- The pick: today's ⌥ grab intersects a ground PLANE at the target's height (`groundAt`), never the scene. Grab-look wants "the exact
  object I am touching" (the Arch's apex is 190 m up). Whether to raycast the scene or use a sphere/plane is yours to propose. Note: for a
  pure rotation, only the RAY DIRECTION under the cursor matters, not the depth of the hit, so a scene pick may not be needed at all.
  Say which, measured.
- Stage's key capture (`StageApp.jsx#HeroCamera`: `captureCameraSnapshot` → `{ position, target, fov }`) and its "on this key" match
  read the LOOK DIRECTION, not the target point. So an aimed view captures as a key unchanged. Confirm.
- The `street` regime already turns in place (orbit at a locked 0.5 m look-ahead, polar clamped). Don't reuse it as the aimer (it
  changes the regime and the limits); it's the reference for "turn about the camera".

## 3. The work, in order
1. **Propose the gesture to Jacob via Boz, before building.** At least: (a) a modifier-drag (which key: ⇧ is OrbitControls' own
   pan modifier; ⌘/⌃ and ⌥ are taken), (b) right-drag, (c) a held key (e.g. Space) + drag. For each: what it collides with today in
   RegimeControls and OrbitControls, and how it behaves on Jacob's STYLUS (a pen can arrive as touch, the ⌥ clamp's reason).
2. **Build it in RegimeControls' orbit regime** (and `playback`'s hand-back unchanged). Turn about the camera's position: yaw about
   world up, pitch about the camera's right axis, pitch clamped short of the zenith and nadir so up stays vertical (no roll, ever). The
   grabbed direction stays under the cursor: solve the rotation from the two rays (grab ray, current ray), not from pixel deltas.
   Move the target with the rotation, keeping its distance, so OrbitControls' state stays consistent.
3. **Every app that mounts the orbit regime gets it** (the one definition). List which apps those are, and flag any where an aimer
   is wrong (e.g. production viewers); that's Jacob's call, not a fork.
4. **Register:** OPERATIONS' camera line (the gestures, one line), FEATURES if it reads as a capability. The ruling's notes get the
   gesture chosen.

## 4. Gates
- PURE ROTATION: across an aim drag, the camera's position is unchanged (bitwise or < 1e-9) and its up stays world-up (roll 0).
  Mutant: the target dragged instead of rotated (an orbit) → RED.
- UNDER THE CURSOR: a planted drag from pixel A to pixel B leaves the grabbed direction at B within a pixel, for a near and a far
  point (a 190 m apex at 2 km). Mutant: delta-based rotation → RED at the far point.
- NOTHING ELSE MOVED: the existing gestures (orbit, ⌥ grab, ⌘/⌃ pan, middle dolly, wheel, `claims-a-lean-never-turns-the-map`) are
  unchanged; claims-the-camera-has-one-definition green.
- PLANT, POINT, PLAY: in Stage, aim, capture a key, play: the played frame matches the aimed one (position, look direction, fov).
- THE CLAMP: under the aimer's gesture OrbitControls hears nothing, including a pen arriving as touch.
- Jacob's eye: he re-aims LS's Arch shot in Stage.

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`. No server without Boz's word (Jacob's live stack
is :5173/:3333/:3334; a temporary :5190 from your worktree is the pattern, read-only against his). Browser checks run headless, never
in Jacob's browser. No change to playback, keys' storage or any regime's limits.
