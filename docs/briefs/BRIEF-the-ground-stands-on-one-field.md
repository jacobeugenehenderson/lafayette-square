# BRIEF — the ground stands on one height field

<!-- BRIEF-STATE
status: OPEN
dispatched: Kerf (WARM), Boz, 2026-10-21 evening, on Jacob's direction
written: 2026-10-21
evict-when: LS and HPDM bake on integration with the ground sampling the town's one height field, no unowned refusal (the deformer is gone), the band triangles back on the lots' refine policy, and the build merged; then this moves to cartograph/_archive/ dated.
-->

**Premise pass: Zob, 2026-10-21 (his assessment, read in source + measured; folded in).** **Agent: WARM → Kerf.** **Report to Boz.**
**Instruction: confirm-then-build.** If the code contradicts this brief, stop and flag Boz.

## 0. Why (Jacob, 2026-10-21)
"Clip the full terrain gamut into ffffff and 000000 and create a single-channel … map … pretty fine steps." · "relative height
accuracy is important; literal point-in-space accuracy is not important." · "I'd rather the sidewalks be as close to level as
possible; they may gently slope … If this adds too much we can just get the sidewalks up and everything showing and add the
sidewalk tilt to the backlog."

Since 5255b311 (10-11) the GROUND left the town's one height field (`terrain.bin`, `terrainShader.js#makeTerrainTexture`, which
trees, buildings and lamps still sample) for per-vertex `aRaw`/`aGrad` from `groundDeformer.mjs`. That move is the root of: 16×
the ground triangles (89% band refinement against the deformer), unowned refusals, ownership-by-ray, and (measured 10-21) +60%
height steps at owner seams under ownership-once. A field is a function of (x, z): it cannot step at a seam.

## 1. The build (choice A: smoothed terrain; the easier one, Jacob's go)
1. The ground samples the town's field again (the shader's field path, `drawnGround.js`'s "MIGRATION PATH"); `aRaw`/`aGrad`
   are no longer written for the ground. The kerb lift `y` stays on top: drawn = field × uExag + y.
2. `groundDeformer.mjs` leaves the ground path entirely (stations, profiles, ownership, the ease, the unowned refusal), and so
   does everything that only fed it. Delete what nothing else reads; name in the commit what was removed and what still reads
   the deformer, if anything.
3. The ped bands and the stripe take the lots' refine policy (as the carriageway did in 4cee5e5c), refining against the field.
4. Single reader: `drawnGround.js#partsAt` reads field + y, so the set-piece seat, movers and the visitor's dot follow.
5. The field's encoding stays as today's Float32 raster unless a measured reason says otherwise (Zob: a 16-bit normalised raster
   halves it; WebGL float/norm16 filtering is a phone question, not established). The "ffffff/000000" normalisation is a
   manifest scale + offset if the encoding changes.

## 2. Gates (measured, LS then HPDM)
Triangles and ground time against the served slabs (LS 174,752 · HPDM 504,599) · no seam steps (Zob's steps probe) · the kerb
still stands and drops (kerb checks) · the walk's cross-slope measured on the bands (the backlog item below starts from it) ·
nothing new refusing.

## 3. Not this build (backlog)
- ⭐ Sidewalks closer to level (Jacob): a shaped field (B), solved once, or a gentler local smoothing under the bands. Starts from
  §2's cross-slope measurement.
- Paint coverage: the painter's paint vs pieces (one cut, (iii)) and tile 102's unnamed ground stay open; they are paint, not height.

## 4. Bounds
Branch off integration HEAD in a worktree under `.claude/worktrees/`; commit by pathspec; never push; Boz merges. No served
bake, Publish, Promote or Stage. Heavy runs: ask Boz. Measure before writing. Registers: OPERATIONS (the refine knob, the field)
and ARCHITECTURE's ground section, or say "reaches no register".
