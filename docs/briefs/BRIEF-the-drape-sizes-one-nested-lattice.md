# BRIEF — the drape sizes ONE nested lattice from what it builds, and the near/far seam is one line with one producer

<!-- BRIEF-STATE
status: OPEN
dispatched: Groyne (written 2026-10-29 at Boz's ruling; a follow-up branch off groyne/far-shore)
evict-when: every near/far chunk boundary reads 0 offset along AND across (max, not median); PTown 1:left builds near and far;
Huron 97:right and 111:left still build; claims-the-armoured-shore-is-never-empty GREEN on every coastal town; the deviation probe
re-run; mutants seen RED; Zob's PASS; Jacob's eye. Then this moves to cartograph/_archive/ dated.
-->

**Agent: Groyne. Report to Boz. Confirm-then-build; Zob reads the plan (S1–S5, sent 2026-10-29) before anything is built.**
Supersedes the BACKLOG row "THE DRAPE SIZES ITS LATTICE FROM 201 SAMPLES" (one rewrite of `drapeGlobals`, not two: Boz, 2026-10-29).

## 0. Why (Jacob, 2026-10-29)
*"This seems like another 'line getting measured twice' issue where we should ditch one of them and we should call them from the same
place."* The far shore is baked (`BRIEF-the-far-shore-is-not-built-at-load`, 51173e95), and a near chunk now hides only its own far chunk.
Where they meet, today, the two layers each draw their own edge.

## 1. What was measured (groyne/far-shore, `scratch/far-shore/`; numbers, not re-measured here)
- **Line one, ALONG the shore** (`seam.mjs`): near and far boundaries miss each other. PTown 9,432 boundaries, median 0.15 m, max 0.58 m;
  Huron 7,484, p95 0.76 m, max 1.00 m. Half gaps, half overlaps. Cause, by reading: step3 = step1/4 exactly, but `drapeGlobals` rounds
  `nAlong` per lattice, so far stations do not fall on near stations.
- **Line two, ACROSS the face**: at a shared station the near row samples octaves 1–3 at its own `nAcross` u's, the far row octave 1 at fewer.
  Not yet measured. A zero along-offset alone would still crack.
- **The sizing** (`face-empty.mjs`, `hmax-ab.mjs`): `drapeGlobals` reads hMax/toeMax off 201 samples of t whatever the face's length.
  PTown 1:left (9.06 km, armoured runs ~23 m) reads hMax 0 and builds NOTHING, near or far. Station-sampling is not the fix: it empties
  Huron 97:right and 111:left (crestAt is not linear between stations). toeMax's berm term blows up as h → 0: Huron 35:right's near lattice
  is 7,377 vertices across (510k near tris for 98 far).

- **A lead to measure, not a cause:** the far bake now builds every near chunk for its bounds (Boz's ruling (a)), and 154 s of
  provincetown's 179 s is drawn-ground reads (`drawnGround.js#sample` + `ulp32`). The near/far bounds excess has a long tail (huron
  max 10.3 m, `near-vs-far-box.mjs`); a nested lattice may make the bounds derivable and the bake fast again.

## 2. The build
1. **ONE NESTED LATTICE, SIZED FROM WHAT IT BUILDS.** hMax and toeMax are the max over the stations the drape will actually build at its
   finest step, never a fixed sample count. The toe's berm term is bounded where h → 0 (a heap's end has no berm wider than the stone
   that makes it). The counts at octave o are derived from octave 1's: along, n_o − 1 = (n_1 − 1)·2^(o−1); across, a multiple of the far's
   (nAcross_far − 1). So every far vertex is a near vertex, exactly. ⛔ **C3 settles HERE, not after** (Zob): the far `drapeGlobals`
   omits toeAt/berm today, so its nAcross is sized from toeMax 1 while the near's includes the toe; the nesting fixes the far count first.
2. **`farRow`, THE ONE PRODUCER OF THE EDGE.** The far layer's vertex row at a far station (positions and normals), factored out of
   `revetmentDrape`'s per-vertex body. The far build calls it for its own rows. A near chunk's boundary row is `farRow`'s row: the shared
   u's copied exactly, the near-only u's lerped along its segments. (Zob: `fieldAt` is additive, so with the ramp at 0 on the boundary
   row the near already computes the SHARED vertices bit-identically; the one producer is still what places the in-between u's and the
   normals. Either way the gate asserts it.)
3. **CHUNKS CUT ON FAR STATIONS**, in the bake and in `SlabRevetment.jsx` alike: near range = far range × 2^(octaves−1).
4. **DETAIL INWARD**: octaves 2–3 ramp from 0 at the boundary row to full over one far step.
⛔ Byte-identity breaks by design: the near layer everywhere (the nesting moves its spacing by less than one step), the near layer at chunk
edges (conformed), and the far layer on every face the new sizing changes. All three are named in the commit; the far shore is re-baked
(the `revetment-far` step, ~7 s a town).

## 3. Gates
- The seam probe: **0 along-offset at EVERY boundary** (max). A cross-seam probe at every boundary: the near row's shared vertices
  bit-identical to `farRow`'s, the rest on its segments (the residue of a float32 lerp is reported as measured, never called a tolerance).
- **The trim** (Zob): the boundary row's KEPT extent (keep[] and the 3-of-4 rule at the near's finer u's) equals the far's, top and bottom.
- A planted row, a near chunk beside a far chunk on one face. Mutants → RED: the near computing its own boundary row; the far not through
  `farRow`; the inward ramp removed.
- **PTown 1:left non-empty**, near and far; **Huron 97:right and 111:left not emptied**; `claims-the-armoured-shore-is-never-empty` GREEN.
- The deviation probe (`scratch/boulder-lod-deviation.mjs`) re-run; the far bake equals the runtime's far build (`far-bake-vs-runtime.mjs`);
  `claims-a-bare-station-costs-nothing` and `claims-the-far-shore-is-not-built-at-load` green.
- **Jacob's eye**, at a grazing angle across a seam, after the re-bake.

## 4. Bounds
Branch off groyne/far-shore in `.claude/worktrees/`; `git commit -- <paths>`. Bakes and :5190 in Boz's slot; never integration's slab.
