# The shore's stone built inside the frame — RETIRED 2026-10-14

Moved here when the revetment's build left the frame (`src/lib/revetmentBuild.js`, run by `src/workers/revetment.worker.js`;
▶ `node checks/claims-the-shore-builds-off-the-frame.mjs`). Kept for the record, not as live doctrine.

**Why it went:** on Provincetown the flight from the movie into the plan had a 3,150 ms frame (phone; Meridian's probe,
2026-10-14) — ~3 s of `revetmentDrape` inside SlabRevetment's near `useFrame`, which draped every 12 m chunk within 90 m in
one frame. The exaggeration was not the trigger (it reaches the stone only through the shader's lift since b881387a).

## `src/components/SlabRevetment.jsx`, its header (68f85d55)

> ⚠️ KNOWN AND NOT HIDDEN: chunk generation is on the critical path — roughly one
> new chunk per 12 m of camera travel — so fast flight along the shore can hitch.
> Prefetch is the obvious answer and is deliberately not built here; it was named
> as unbuilt in the spike (`bee17a58`) and it is still unbuilt.

## `src/components/SlabRevetment.jsx`, the far layer's per-frame ceiling (68f85d55)

> ⛔ The far build is sliced across frames: ~204 ms in one pass is a visible hitch,
> and it was ALREADY visible — the tab stopped answering while generating. This is
> a per-frame ceiling in milliseconds, not a face count, because faces differ in
> size by two orders of magnitude and a count would stall on the 10 km one.
> `const FAR_BUILD_MS_PER_FRAME = 4`

The far layer is now built in the worker, chunk by chunk, so the frame carries none of it and the ceiling is gone. It was
also hidden for the WHOLE face whenever any near chunk of that face was drawn, so the rest of a long face drew nothing; the
far layer now leaves out only the chunks the near layer draws.

## `docs/briefs/BRIEF-boulder-revetment.md` §5, its first precedent (ROT: the slab ships an instruction, not a mesh)

> - **Placement along a way:** `cartograph/bake-lamps.js` derives lamp positions along streets at bake
>   time and writes `baked/<look>/lamps.json`. ⭐ **A revetment is the same problem** — walk a polyline,
>   emit transforms. **Same bake-time shape, same artifact pattern.**
