# BRIEF — The overhead impostor, redesigned: drop the wiggle grid, wiggle on the wind sheet, deep core

<!-- BRIEF-STATE
status: OPEN
dispatched: no (agent: Grain, WARM, continuing from the tree-cost forensic)
written: 2026-10-04
evict-when: every overhead band draws as a 2-triangle quad (no vertex grid), wiggles by sampling Gale's wind API, and the lower bands carry a baked deep-canopy core; LS + Huron Browse re-measured with the forensic's own probe and the numbers in the verdict's table format; the checks are green and mutation-tested; Jacob has eyed the canopy's motion and look in Browse on two towns
-->

**Boz drafted this 2026-10-04 from Grain's verdict and Jacob's rulings; Jacob dispatches. Grain carries it, warm.** Jacob: *"I'm not
in a hurry as much as I want to get it done solidly."* No interim step.

## The evidence (Grain's verdict, `scratch/tree-cost/VERDICT.md`, commit e2ff2c15)

- **Browse cost = the overhead quads' wiggle grid, geometry not fill.** Each band is a full quad tessellated 28×28
  (`src/components/impostorGeometry.js#buildOverheadBandDisc`, `grid ?? 28`; the tessellation exists only for vertex wiggle) × 3
  bands = 4,704 tris per tree: LS 25.36M, Huron 86.68M. A quarter of the pixels leaves the trees' ms unchanged.
- **The grid sweep** (LS desktop / LS phone-hi-sized / Huron desktop): grid 28 → 89.7 / 43.5 / 255 ms; grid 8 → 57.5 / 18.5 / 167;
  grid 1 (2 tris) → 52.8 / 15.6 / at the floor. The win is real and sits at the floor by grid ≤ 8.
- No mesh tree draws in any shot; the hero/Street card cost is **not** this package's (cause not established, a separate measurement).
- ⚠️ "phone-hi" was this M1 at phone size, not a phone. Pixel cost at a real phone's full resolution is **unmeasured**.

## The design (Jacob's; `arborist/BACKLOG.md`, "THE OVERHEAD IMPOSTOR, REDESIGNED")

1. **Drop the wiggle grid.** Each band keeps its picture, its height and its place in the three-layer stack; only its square goes from
   a 28×28 grid to **2 triangles**. *(Was worded "flatten the bands"; the bands were always flat.)*
2. **Wiggle on the wind sheet**, through the **approved API** (Jacob, 2026-10-04; agreed by Grain and Gale): `windAt(xz)` (the field,
   one sampler, once per tree in the vertex shader for hula and lean) and `windDetail(xz)` (analytic, in Gale's module, no sampler, per
   fragment at the band's UV-mapped world XZ for the fine flutter). Consumer floors stay as multipliers (`browseWindFloor`). ⛔ No wind
   noise of your own: the wind's authority is Gale's module.
3. **The deep core.** At the Grove bake, inset the top band's silhouette (from its alpha; *"maybe a circle but also maybe an irregular
   offset shape made from the top shape"*) and, in the lower bands, replace that region with a **solid deeper canopy colour** (per
   species, from the capture). Sway or a slight tilt then shows dark canopy, never ground, and it's what makes mild Browse parallax
   affordable later. ⭐ **Draw the core as a flat colour within the same 2-triangle quad** (a baked mask/colour, or a channel), **not a
   triangulated ring**: your verdict says pixels aren't the cost, and a ring adds triangles back.
4. **Bake the answer.** The Grove capture emits what the runtime needs per species and band (the core mask/colour, and anything the
   flat quad's wiggle needs) beside `overheadBySpecies` in the atlas manifest; `OverheadTrees` draws what was baked. ⛔ The runtime
   doesn't reconstruct it.

## Then, as its own commit: the mesh-tree wind (Jacob, 2026-10-04)
After the overhead redesign lands, move the mesh-tree path's wind (`treeAtlasMaterial.js#injectFoliageSway`) onto Gale's API too, so `claims-the-wind-has-one-authority` goes green. Not urgent (no town draws mesh trees today; it runs in the Grove/Salon), but it's the last second wind in the code.

## Dependencies and bounds

- **Gale's wind sheet** (`docs/briefs/BRIEF-wind-sheet.md`) supplies `windAt`/`windDetail`. ⚠️ **Sequence with Gale:** build against
  its API as it lands; if its headroom measurement stops the package, stop and flag Jacob. Don't build a private wind meanwhile.
- **Your territory:** `impostorGeometry.js`, `OverheadTrees.jsx`, the overhead parts of `treeAtlasMaterial.js` (`OVERHEAD_WIND_BEGIN`
  and friends), the Grove's overhead capture (`src/arborist/OverheadBaker.jsx`, `Grove.jsx`), the atlas manifest's overhead records.
  Agree with Gale before touching its module; Plumb (Preview) and Lens (camera) are live too.
- A **Grove re-capture** is needed for every town (the capture format changes). ⭐ Bump the capture key (`src/arborist/captureKey.js`
  `CAPTURE_FORMAT`) so every record goes dirty by construction, and say so. The re-captures and re-bakes are Jacob's.
- ⛔ No pours. `node scripts/bake-in-flight.mjs` before saving anything the dev servers import. Commit only your own paths through a
  private index. A kit change reaches the Ward at the next pin move; batch it, and the push and bundle publish need Jacob's
  confirmation in your window.
- **Three-part fix:** `arborist/ARCHITECTURE.md` (the decision), `arborist/FEATURES.md` / `cartograph/OPERATIONS.md` (what an operator
  sees), and the old grid's prose moved to the Diary. The old 28×28 path is **gone** in the same commit, not left beside the new one.

## Can the instrument see it?

- **Your own probe is the gate:** `node scratch/tree-cost/probe.mjs --town=<town> --shot=browse --mode=<desktop|phone-hi>` on
  LS and Huron, before and after, in the verdict's table format.
- **Checks:** every overhead band is a 2-triangle quad (no `grid` path survives); overhead wiggle samples Gale's API and computes no
  noise of its own; the core is baked (absent ⇒ loud, never a silent full band). Mutation-test each.
- **Shader linking** on every surface (`node checks/claims-shader-fragments-declare-what-they-use.mjs` and a live `VALIDATE_STATUS`).
- **The eye:** Jacob, Browse, two towns, the canopy's motion and look, before and after. ⛔ Ship nothing on a green check alone.

## Deliverable

The redesign, the re-measured numbers, the checks, the registers. **Read this, your verdict and Gale's API, tell Jacob what you found,
then build. If the code contradicts the brief, stop and flag him.**
