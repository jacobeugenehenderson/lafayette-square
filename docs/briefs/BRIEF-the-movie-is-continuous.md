# BRIEF — the movie is continuous: nothing steps while the camera moves

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-11
evict-when: RULING: Jacob calls every town's authored shots smooth from start to end (no notch, step, pop or hitch), with the town and shot recorded; the continuity check in §5 is green on every town after being seen red.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.** Strobe
(who ran the arrival-perf arc) is gone, and everything Strobe built is committed with a check. **Report to Boz.**

**Instruction: measure, then confirm-then-build.** Every premise below is a claim. Check each against the code, record
the camera moving, and say which sources you actually see before changing anything. If the code contradicts this brief,
stop and flag Boz.

---

## 1. The complaint (Jacob, 2026-10-11)

*"We need to get rid of the quantization from the camera moves. We know the entire track so there's no reason to
average as we go, we only need to hit the keyframes. That + the sometimes slower framerate looks unfinished."* ·
*"Every shot has places where it's better/worse. It may be a perf issue on top of these other things; best to just
clean up everything."*

⇒ The deliverable is a shot that reads as finished: every authored shot, every town, start to end. Not one fix.

## 2. What Boz read in source (2026-10-11): the path is NOT averaged; it already hits every key

One driver plays every shot on every surface: `src/camera/MovieCamera.jsx`, mounted once in `src/components/Town.jsx`
(the Ward uses it through the kit). Each frame it advances a clock by `delta` and asks
`src/preview/heroAnim.js#heroKeyframeAnim` for the pose. The pose is closed-form: Catmull-Rom through the keys
(`_crSeg`), distance over time paced by a monotone cubic through every key (`buildShot`). Damping is bypassed during
playback. ⛔ So "averaging as it goes" is not in the code. What can still step, five candidates, **none measured**:

1. **The FOV moves in 0.1° notches.** `MovieCamera.jsx` writes the FOV only when it has moved more than 0.1°
   (`Math.abs(camera.fov - r.fov) > 0.1`). A slow zoom steps. Read in source; a real quantizer.
2. **The pace is a 64-sample table, interpolated linearly.** `buildShot` measures each segment's length at
   `SUB = 64` samples; `heroPoseAtTime` inverts it linearly, so the speed is piecewise constant with a kink at every
   sample. Whether it is visible is not measured.
3. **Frame pacing.** `clock += delta`: when a frame runs long, the next pose jumps further, which is correct in time
   but reads as a hitch. That is frame cost. Its cause per town and per stretch of the shot is not established.
4. **Shadow edges stepping.** `src/components/CelestialBodies.jsx`: the shadow box is camera-fitted and its focus
   quantised to whole texels (by design, against shimmer). As the camera moves, shadow edges may step.
5. **Tree cards switching view mid-shot.** The hero cards are baked at fixed azimuths
   (`src/components/HeroImpostorTrees.jsx`). As the camera orbits, a card may jump to its next view.
   `docs/briefs/BRIEF-tree-shot-crossfade.md` (undispatched) already rules *"trees cross-fade between shots; never swap
   during one"*: read it, and say whether its work is part of this one.

Anything else the recording shows (LOD pops, label pops, a texture page arriving mid-shot) is in scope too. Name it.

## 3. Read first

- `PREVIEW.md` (the frame-timeline recorder, its table row and its check).
- `docs/briefs/BRIEF-hero-arrival-perf.md` (Strobe's state: what was measured and ruled; the recorder is step 0).
- `ROADMAP` `H-9`, `H-16` (the shadow box's fit and its two cliffs; ⛔ never reintroduce either), `H-24` (the box's
  boundary), and the shelved `frameCost.js#gpuWindow` item (⛔ not GPU time on this M1; Jacob wants what the operator
  SEES in a transition, not a truer average).
- `src/lib/cameraRegimes.js` (who owns the camera when).

## 4. The work

1. **Measure first.** Record a full pass of every town's authored shots with the frame-timeline recorder
   (`phoneBus.js#frameTimeline`, ▶ `node checks/claims-frame-timeline-catches-a-stall.mjs`; `scratch/frame-timeline/`
   holds Strobe's probes, including `motion-probe.mjs`). For each hitch, the stretch of the shot and its marks. Also
   sample the pose itself at a fine fixed time step and report where position, speed, aim and FOV jump. Report to Boz
   which of the five you see, and where.
2. **Fix the path's two quantizers** (1, 2): the FOV written every frame; the pace solved exactly (or to a tolerance
   with no visible kink), not by a linear table. Every key still hit at its time.
3. **Frame pacing** (3): rank the hitches by measurement. Fix what is cheap, and bring the expensive ones to Boz with the
   cost and the remedy. Whether the clock should read the presented-frame time rather than r3f's `delta`: measure it.
4. **Shadows and trees** (4, 5): measure whether they step during a shot. ⛔ Bring any change to the shadow fit to Boz
   before building: it is anti-shimmer by design, and `H-16`'s cliffs came from that code.
5. Delete what each fix replaces in the same commit, and say what was removed.

## 5. Checks (see each FAIL first; mutation-test)

- **The pose is continuous:** for every town's shots, sampled at a fine fixed step, position, aim and FOV have no jump
  and the speed has no kink beyond a stated tolerance, and every key is hit at its time. Read the shots from the
  towns' Looks, never restate them. Mutations: the 0.1° threshold back → red; the linear table back → red.
- The frame-timeline check stays green; the hitch counts before and after are recorded in the commit, per town.

## 6. Bounds

- **Writes:** `src/camera/MovieCamera.jsx`, `src/preview/heroAnim.js`, `checks/`. Anything else (shadow fit, tree cards,
  load order) only after Boz clears it.
- ⛔ No bake, no Publish or Promote. Swale is baking the ground; one bake at a time on the machine, load-gated.
- ⛔ The authored keyframes are Jacob's: never edit a town's Look.
- Commit through explicit pathspecs only (`git commit -- <paths>`), checking each commit's name-status.
- **Registers:** `PREVIEW.md` (the instrument, if it changes) · `FEATURES` (the camera plays smoothly; say it in the
  operator's terms) · `ARCHITECTURE` if the shadow fit or the clock changes. Say in each commit which it reached.

## 7. Done when

On every town, every authored shot plays with no notch, step, pop or hitch the eye can see, at Hero and in Preview, and
the Ward on staging matches. The checks are green after being seen red. Jacob's eye, with the town and shot recorded.
