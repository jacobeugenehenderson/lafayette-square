# BRIEF — The pyramid becomes a dial: every effect at a rung of the shared blur ladder, per surface

<!-- BRIEF-STATE
status: OPEN
dispatched: yes (Strobe, 2026-10-06, after BRIEF-hero-arrival-perf's post-FX split)
written: 2026-10-04
evict-when: Jacob's theory test is measured and reported (phone-hi: DoF + bloom at a low rung vs switched off, cost and look); the pyramid reads levels / resolution / radius from the surface's authored deployment policy through qualityProfile.js; a surface can run the pyramid-fed effects at a rung instead of dropping them; Preview's tuner becomes a live deployment control (no longer "unfinished"); checks green and mutation-tested; Jacob has eyed a phone tier with effects at a low rung
-->

**Boz drafted this 2026-10-04 at Jacob's request; Jacob dispatches.** Phase 2, the **"how much" dial**: one of the two centrepieces
of Preview as a first-class technical-director app (the other is the startup timeline, later). Jacob: *"It's the timeline + the
pyramid… even more/as much as the individual toggles (that theory may be wrong!)."* This package tests that theory first, then builds
the dial.

## Who you are, and the bounds

**Dispatched to Strobe (2026-10-06), as the fix for the cost `BRIEF-hero-arrival-perf` step 1 ranked first** (Huron: the post
stack is ~16 of ~36 ms; confirmed in code that no reduced rung runs anywhere). **Report to the session `Boz the Younger`.**
- The kit's post-FX and quality code. ⛔ No pours or bakes; confirm with Boz before saving anything the dev servers import.
- ⚠️ Live in the same checkout: **Argon** (`SlabBuildings.jsx`, neon), **Sill** (`tileGround.js`, the raised kerb's anchors/shaders).
  Agree before touching their files.
- A kit change reaches the Ward at the next pin move; publishing the kit bundle needs Jacob's go.
- **Three-part fix** (`CLAUDE.md`); registers `cartograph/PREVIEW.md`, `cartograph/OPERATIONS.md` § Preview, `cartograph/ARCHITECTURE.md
  §8`; the "unfinished" labels come off only when the thing they describe is true.

## Today, read in source (re-derive; don't trust)

- **`src/components/DownsamplePyramid.jsx`** builds the one shared blur ladder (8 mip rungs, `_pyramidRefs.levels`) that **DoF**
  (`RomanceDoF.jsx`, blur radius by depth) and **bloom** (`CustomBloom.jsx`, band-pass across rungs) both sample.
  `cartograph/ARCHITECTURE.md §8`: *"Post-FX shares a blur LADDER… the one expensive downsample, sampled many ways (gang intact → phone
  budget)"*, and the EffectComposer note: *"DoF + Bloom share the DownsamplePyramid BY DESIGN; do not un-share."*
- **`src/lib/renderTiers.js`** holds the per-surface rungs: desktop `{levels 8, radius 0.85, resolutionScale 0.5}`, phone-hi `{6, 0.85,
  0.35}`, phone-lo `{4, 0.85, 0.25}`. Its header says why they reach nothing: (1) nothing imports `pyramidDegreeFor`; (2)
  `DownsamplePyramid` **accepts and ignores** levels / radius / resolutionScale (*"the dial was removed 2026-06-28"*: find out why
  before restoring it; the Diary is `cartograph/_archive/`, `git log -S` on the file); (3) the phone profile switches the pyramid off.
- **`src/preview/PreviewApp.jsx#PyramidTuner`**: the sliders (Levels, Resolution, Radius), titled *"Pyramid · unfinished"*, kept on purpose
  (Jacob, 2026-10-04): unfinished, not dead.
- **`src/lib/qualityProfile.js`**: the one function per surface (`surfaceQuality`, `includesPass`, `postFxOff`), now fed by each town's
  `cartograph/data/<map>/deployment.json` through `manifest.deployment` (Phase 2 F, Plumb, `42009480`).
- **The prior design:** `plans/clean-for-handoff.md §W1`, which aimed to turn the platform on/off drop into a **resolution bracket**
  (mobile ships every effect at a low rung) and shipped everything except that.

## Rulings that bind you

- **One deployment authority** (F): the rungs are **authored per surface in `deployment.json`**, read through `qualityProfile.js`. ⛔ No
  second regime, and `renderTiers.js`'s table becomes the default the deployment file overrides, or it goes; not both.
- **Per-surface switches stay** (Jacob): *"we don't want to 'cancel bloom' because we can't get it going on a lo phone."* The rung is a
  second remedy beside on/off, not a replacement for it.
- **Every phone gets phone-lo's policy until a device classifier exists** (Jacob, option 1). Phone-hi stays authorable.
- **Rank by measurement** (F's rules): every ms is this desktop's GPU; the "phone-hi" buffer is this M1 at phone size, not a phone.
- **No manufactured knobs** (spec): the dial exists because it changes measured cost.

## The work, in order

1. **Jacob's theory test, before building anything permanent.** On the **desktop** surface (where Jacob feels it) and phone-hi, LS and Huron, Browse and Hero: measure **DoF + bloom
   at a low rung** (a temporary in-page override is fine for the test, in `scratch/`) against **both switched off** and against today's
   desktop rung. Cost with the frame-timeline recorder (`BRIEF-hero-arrival-perf` step 0; ⛔ not `frameCost.js#gpuWindow`, which is not GPU time on this M1), bracketed base/off/base, and the look as screenshot pairs at a pinned
   movie time and viewport. ⇒ **Report to Jacob before step 2**: if a low rung costs about what "off" costs, the dial wins and the rest is
   worth building; if not, say so plainly.
2. **The pyramid reads its rung:** `DownsamplePyramid` takes levels / resolution / radius again, from the surface's policy. Find why the
   dial was removed on 2026-06-28 and make sure restoring it doesn't bring that back. Consumers (DoF, bloom) must sample correctly at any
   rung count (today they "bind exactly this many" levels: check).
3. **A surface can run the pyramid-fed effects at a rung** instead of dropping them, when its policy says so; phone-lo's policy is chosen
   by Jacob from step 1's numbers. ⛔ Don't change what any surface ships without his go.
4. **The tuner becomes a live deployment control:** Preview's sliders author the rung into `deployment.json` for the selected surface,
   exactly like F's other controls (autosave; plainly distinct from inspection toggles). The "unfinished" title and note come off.
5. **Re-measure** with the same instruments, and the Ward reads the same policy through the same function (F's one reader).

## Can the instrument see it?

- `claims-the-pyramid-reads-its-rung`: `DownsamplePyramid` builds from the surface's policy; a changed rung changes the targets
  (mutation: ignore the input, red).
- `claims-a-rung-is-authored-once`: rungs come from `deployment.json` via `qualityProfile.js`; no other table feeds the renderer.
- Shader linking on every surface (`node checks/claims-shader-fragments-declare-what-they-use.mjs`), since consumers bind a variable
  number of levels.
- The eye: Jacob, a phone tier with effects at a low rung, before and after, on two towns.

## Deliverable

Step 1's measured table and screenshot pairs first (in chat to Jacob), then steps 2–5 on his go. **Read this and the code it cites,
tell Jacob what you found, then measure. If the code contradicts the brief, stop and flag him.**
