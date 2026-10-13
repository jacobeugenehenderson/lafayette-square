# BRIEF — the movie is continuous: nothing steps while the camera moves

<!-- BRIEF-STATE
status: OPEN
dispatched: Glide, 2026-10-11 (FRESH)
written: 2026-10-11
evict-when: RULING: Jacob calls every town's authored shots smooth from start to end (no notch, step, pop or hitch), with the town and shot recorded; the continuity check in §5 is green on every town after being seen red.
-->

## STATE — 2026-10-13 (Glide). Stopped at a checkpoint on Jacob's word; nothing in flight.
- **Landed:** the pace solved exactly + the fov a monotone cubic through each key + the lens written every frame
  (`efdcc0bd`, ▶ `node checks/claims-the-movie-is-continuous.mjs`) · one shadow-box size per shot, option C, switch
  `window.__shadowShotFit` (`630339b3`, ▶ `node checks/claims-a-shot-never-resizes-its-shadow-box.mjs`).
- **WIP, committed (`64d59ffd`):** (d) the clock steps by the presented frame (`MovieCamera#presentedClock`), unit-checked
  and mutation-tested. ⛔ **Owed before it is done:** the measured re-run in Jacob's visible Chrome on all four towns, LS
  included (`step_vs_presented` should fall to about the `vs now()` figures in `64d59ffd`'s message); then ARCHITECTURE.
- **Next, in order:** ① that re-run · ② `claims-the-shadow-box-has-no-cliff` imports the real fit (`shadowFit`,
  `shadowBucket`, and the centre clamp, still inline in `PrimaryOrb`'s `useFrame`) with source mutations for both
  cliffs — Boz's ruling · ③ the eye gates: Jacob on HPDM 148–256 s with the switch on and off; every shot at Hero, in
  Preview and the Ward · ④ §4b, the perf pass, and Boz's two queued items (the hero focus under the time-of-day slider;
  `PostProcessing`'s unused `weatherExposureScale` import), none started.
- **Instruments:** `scratch/movie-continuous/` (`pose-probe.mjs`, `pass-probe.mjs`; per-pass JSON). ⚠️ The frame-timeline
  recorder stops a scripted run at 1200 frames (`phoneBus.js#MAX_FRAMES`); headless runs at 7–18 fps and is not the
  operator's eye; LS's Preview reloads once ~8 s into a fresh headless profile.

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
5. ~~Tree cards switching view mid-shot.~~ **Not in the code (Glide, 2026-10-11):** `HeroImpostorTrees.jsx` gives each tree one fixed angle, picked by hash, and the card turns smoothly to face the camera. The distance swap (`GeoTierDriver`) was retired 2026-06-25. `BRIEF-tree-shot-crossfade` is about changes between shots, not within one.

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

## 4b. The perf pass (Jacob's go, 2026-10-11) — after §4 lands, Glide WARM

Measured by Glide in Jacob's own Chrome (desktop, DPR 2): HPDM 15.7 · Huron 14.3 · Provincetown 11.4 fps. That is frame
COST, which no camera fix touches. Build the three items Jacob approved on 2026-10-07 and nobody built (`ROADMAP`
"Perf (approved by Jacob 2026-10-07, not built)"), in this order, re-measuring with the frame-timeline recorder before and
after each, and with Jacob's eye on each before the next:
1. **Composer AA 2×**: multisampling named per surface (phones stay 0); eye-gate thin features. ▶ `node scratch/msaa/probe.mjs --tiers`
2. **Grass footprint LOD**: drop octaves past `fwidth`; retire "the GRASS chunk is the CONTROL" (`BRIEF-surface-lab §2`) in the same change. ▶ `node scratch/browse-perf/probe.mjs --surfaces`
3. **Bloom folded into the shared blur (pyramid) pass**: measure first; it has never been measured.
Writes for this pass: the post stack (`src/components/PostProcessing.jsx` and its passes), the grass/ground shader, `src/lib/qualityProfile.js`,
`checks/`. ⛔ No bake. ⛔ `frameCost.js#gpuWindow` is not GPU time on this M1: rank by the recorder's presented-frame
intervals, never by it. Strike each item from `ROADMAP` as it lands.

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
