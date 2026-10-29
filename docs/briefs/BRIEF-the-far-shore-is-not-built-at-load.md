# BRIEF — the far shore is not built at load: no camera-independent geometry stalls a visitor's page

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-29, Boz, at Jacob's "yes, brief it", after Ward's load profile)
evict-when: no load-time main-thread task over 200 ms comes from geometry that does not depend on the camera (the revetment's far
layer first; the ground and terrain assembly measured and ruled); a check that reads the source catches the class; PTown's and
Huron's cold loads re-measured with the same probe, before vs after; checks green with mutants seen RED; merged on Zob's PASS.
Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** **Report to Boz.** **Confirm-then-build:** every premise below is a claim. Confirm each against the code by symbol and
say what you found. If the code disagrees, stop and flag Boz. Zob reads your plan before you build. ⛔ The means (§3.1) comes back to
Boz as a measured comparison before anything is built.

## 0. Why (Jacob, 2026-10-29)
- *"I am really noticing the long load time for PTown."* PTown is the town shared outside.
- Jacob suspected the coast and geographic enclosure. The profile says the cost is the coast's STONE, built in the browser.

## 1. What was measured (Ward, `scratch/browse-perf/load.mjs --profile`, committed 2784ccb4; numbers, not re-measured)
- Cold production loads, headless Chrome with a real GPU, 3 runs: PTown reveals at 14.7–15.7 s, HPDM at 4.6–5.1 s. Huron (staging,
  the newer player) 14–15 s.
- PTown spends ~6.8 s between "ground, buildings and trees prepared" and the reveal (HPDM ~1.1 s). In it, every run, one ~3.2 s task.
- The profile names it: R3F's frame loop → `SlabRevetment.jsx`'s far-layer `useFrame` → `revetmentDrape.js#revetmentDrape`
  (3130 ms inclusive) → its `groundAt` → `elevation.js#partsAt` → `drawnGround.js#makeDrawnGround`'s `partsAt` → the barycentric
  `sample` (2147 ms) → `ulp32` (630 ms); value noise (`hash3`) ~360 ms. Two more PTown tasks on the same path (1.3 s, 0.9 s). Huron's two
  largest are the same drape (1.6 s, 2.2 s).
- Also on PTown's main thread: `BakedGround.jsx` → `makeDrawnGround` ~1.1 s; `Terrain.jsx`'s PlaneGeometry + `computeVertexNormals`
  ~1.2 s. Ground triangles: PTown 3.07 M on 10.7 km (26,879/km²), Huron 0.88 M on 7.2 km (17,027/km²).
- Not established: whether the reveal WAITS on the far layer or is only blocked by it.

## 2. What the code does today (Boz's read; confirm by symbol)
- `SlabRevetment.jsx`, THE FAR LAYER: *"Built ONCE per face, coarse, and never rebuilt: it does not depend on the camera, which is the
  entire point."* Sliced across frames by `FAR_BUILD_MS_PER_FRAME = 4`, but *"at least one per frame even if the budget is already
  blown"*, and a face is indivisible, so a long face is one long frame (its comment names "the 10 km one").
- `FAR_OCTAVES = 1`: *"builds the WHOLE armoured shore of huron for ~23.5k triangles"* (`scratch/boulder-farfield-cost.mjs`, retired 2026-10-29: it built without the drawn ground, which the player never did; with it, 183,662 on huron and 60,860 on provincetown, ▶ `scratch/far-shore/far-cost.mjs`).
- ⛔ A DECISION ALREADY STANDS, and this brief does not reopen it: `cartograph/bake-revetment.js` *"SHIPS AN INSTRUCTION, NOT A MESH…
  Baking the mesh would put ~47 MB of drape and ~33 MB of stone transforms into the slab."* That reasoning is about the NEAR layer and
  the stones (camera-dependent, mostly never seen). The far layer's ~23.5k triangles are a different size class. Confirm both numbers.
- The drape is GROUND-RELATIVE (`SlabRevetment.jsx#groundRelative`, Argon 2026-10-07): each vertex carries its drawn-ground pin
  (`aDrawnRaw`) so the stone rides the live terrain exaggeration. Any answer keeps that.
- Readers: `revetment.json` (the instruction), the bake step `revetment` in `serve.js`, `claims-*revetment*` checks (list them),
  Stage (authoring) and the Ward (production) both mount `SlabRevetment` through Town.

## 3. The work, in order
1. **Choose the means, measured, read-only.** At least: (a) BAKE the far layer into the slab at the `revetment` step (bytes per town,
   build time per town, and how the ground-relative pins and exaggeration survive); (b) build it in a WORKER at load (main thread free;
   what it needs shipped to the worker, e.g. the drawn ground's sampler); (c) SPLIT a face into bounded pieces so the 4 ms ceiling
   holds (seams: the drape must stay one continuous sheet). For each: PTown's and Huron's main-thread time, bytes, seams, and what
   Stage does (⛔ ONE path: Stage and the Ward must draw the same far shore from the same producer, per
   `r-visual-look-values-are-live-in-stage`; if (a), say how an authored revetment value reaches Stage live). Jacob's lean is (a),
   "baked, not built at load", and Layer 0 asks the class question: anything the camera doesn't change belongs in the bake.
   **(d) THE MOVIE KNOWS WHAT IS SEEN** (Jacob, 2026-10-29: *"given we have the camera motion, we already know what revetment is
   showing at any moment, and what is coming and what we can drop. The entire back of Provincetown is never seen"*). The authored
   path is known at bake time (`heroAnim.js#heroPathPose`, the set of poses a shot visits). So each far face can be classed by WHEN it
   first enters the movie's view (and whether it ever does), and built or shipped in that order: what the opening frames see first,
   the rest after the reveal or never on the movie. ⭐ There's precedent: `arborist/bake-trees.js`'s `heroTier` classifies trees
   by the hero path, and `CelestialBodies.jsx` fits the shadow over `heroPathPose`; reuse that, don't build a second one. Combine (d)
   with any of (a)–(c). ⭐ JACOB RULED THE SCOPE (2026-10-29): *"never seen by the movie is the relevant thing because it's having to
   happen many times a second; street view is likely never going to be in the water or anywhere a large revetment will be; and I
   think loading the local elements for a street scene and the accompanying delay is manageable, when we get to it."* So: the MOVIE's
   visibility drives what is built and when. Street loads its local elements on entry, with a delay accepted, and that's a later
   brief, not this one. Browse (the overhead plan) is answered by (e): there the band is the shore's drawing. A face the movie never sees isn't built on the movie's path at all. Measure: per town, the share of far
   faces (and their build ms) the movie never sees.
   **(e) A THIRD, INSTANT TIER, THEN THE STONES ARRIVE** (Jacob, 2026-10-29: *"we could add a third further decimated version that's
   just basically stone colored, or speckled, that can load instantly and maybe, as in the elevation/terrain lift, the geometrical
   stones can appear over time with less urgency"*). A stone-coloured or speckled band on the revetment's footprint that is there at
   the reveal; the geometric far layer then grows in over time, the way the terrain lifts in (find that mechanism, the uExag ramp
   behind `buildingLift.js` and `patchTerrain`, and reuse its timing, not a second one). Candidate for the band: the drawn ground
   itself, as a ground group or material under the footprint, since `bake-revetment.js` notes every ground group is a flat XZ polygon,
   which is exactly a flat band. ⭐ THE BAND IS ALSO THE OVERHEAD TIER (Jacob's correction, 2026-10-29): *"the band could stand in for
   stones in the event the user immediately clicks the society button and the map shifts down to seeing the full shoreline at
   once."* So in Browse/Society (the overhead plan, the whole shore at once) the band is the shore's drawing by design, a distance
   tier like the near/far layers, and the geometric stones aren't needed there. This answers (d)'s Browse question: measure that the band reads as
   stone at overhead distance. ⭐ AND ZOOMING IN BRINGS THE STONES BACK (Jacob, 2026-10-29): *"We will though need to see stones when
   the user pinches/zooms in to the map; but only at the LoD for the elevation and for the area inside the camera view."* So in
   Browse the stones are built by camera DISTANCE, at the same level-of-detail rule the elevation uses (find it; don't invent a
   second threshold), and only for the faces or chunks inside the camera's view. The near layer already selects chunks by camera
   (`SlabRevetment.jsx`'s reselect `useFrame`, `RESELECT_M`); say whether that selection serves Browse as it is, or what it lacks
   (a frustum test: today the far layer has none, per the frustum census in `scratch/browse-perf/probe.mjs`). Gate: a planted
   Browse zoom onto one stretch builds only that stretch's stones, at the elevation's LoD; mutant: build every face → RED. ⛔ What stays loud: a face whose geometry fails where the movie needs it
   (the far layer's existing `console.error`). The band standing in for a FAILED build in the movie's view is the fallback this kit
   forbids; the band standing in at overhead distance is the design. Combine with (d): the band everywhere at once, the stones in
   the movie's order.
2. **Plan to Zob** (`docs/agents/ZOB.md §2`), with every reader that moves.
3. **Build** the chosen means; the superseded path is deleted in the same commit (three-part fix).
4. **The class, measured:** `makeDrawnGround` and Terrain's PlaneGeometry (~1.1–1.2 s each on PTown). Report whether each is
   camera-independent and what it would cost to move; don't build it here unless Boz says so.

## 4. Gates
- A CHECK THAT READS THE SOURCE: no camera-independent geometry build runs in a frame loop or at mount on the main thread (the far
  layer first); mutant: today's `useFrame` far build restored → RED. State in the check how it decides "camera-independent", from the
  code, never a list.
- Before vs after with `scratch/browse-perf/load.mjs --profile`: PTown (production slab copy) and Huron, cold, 3 runs: no task
  > 200 ms from the revetment; reveal time and bytes reported.
- The far shore is the same shape: a deviation measure against today's far build per town (`scratch/boulder-lod-deviation.mjs`), and
  the ground-relative pins at uExag ≠ 1 (the 2026-10-27 review's case).
- Existing revetment and coast checks unchanged or better; `claims-a-missing-revetment-is-not-a-shoreless-town` green.
- If (a): each coastal town re-bakes its `revetment` step (Huron; PTown's step can run on its current pour, like tonight's scene-only
  post, if the plan shows it reads nothing the 10-26 pour lacks).

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`. No server without Boz's word (Jacob's live stack
is :5173/:3333/:3334; a temporary :5190 from your worktree is the pattern, read-only against his). Headless only. Heavy runs: ask Boz
for the slot by name; Plumb's PTown coast work is running alongside, in `structures.mjs`/`bake-coast.mjs`, not in the revetment.
Nothing published; Publish and Promote are Jacob's.
