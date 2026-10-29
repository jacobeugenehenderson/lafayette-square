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
1. **ONE NESTED LATTICE, SIZED FROM WHAT IT BUILDS** (Boz ruled A and B, 2026-10-29; Zob's read).
   - **hMax exactly, no sampling.** Sampling stations is circular (the step comes from blk = d50For(hMax)). `crestAndEnds` is piecewise
     linear in s: a MAX of the wall lerp and the interior-end slumps, then a MIN with the tip cones. Its maximum lies on a breakpoint:
     the stations, each end's s and s ± run, and the crossings between pieces (a tip cone meets a rising wall between stations).
     Either enumerate every candidate, evaluated through `crestAt` itself, or use the bound max_i H(i) over armoured stations, which
     is exact except where a tip cone caps the tallest station. The code says which one it uses. Gate: a probe comparing hMax against
     1e6 dense samples on every face of both towns, with the max difference reported.
   - **toeMax over the built finest stations.** They depend only on blk and the arc, never on the toe, and the far's are a nested
     subset. **The berm is bounded by the bare predicate, with no new constant:** `d50For` floors at `MIN_ARMOUR_D50_M` and stations
     below it are skipped, so over built stations the berm term is ≤ stonesWide·TAN_REPOSE. Huron 35:right's 7,377 across came from
     samples with 0 < h < 0.5, which are never built. That bound goes in a comment beside it.
   - **Nested counts.** At octave o, along n_o − 1 = (n_1 − 1)·2^(o−1), and across nAcross_o − 1 = (nAcross_1 − 1)·2^(o−1). Every far
     vertex is a near vertex. One globals call returns every octave's lattice, so the far can't omit toeAt/berm. ⛔ **C3 settles HERE**
     (Zob): today the far `drapeGlobals` omits them.
2. **`farRow`, THE ONE PRODUCER OF THE EDGE.** The far layer's vertex row at a far station (positions and normals), factored out of
   `revetmentDrape`'s per-vertex body. The far build calls it for its own rows. A near chunk's boundary row is `farRow`'s row: the shared
   u's copied exactly, the near-only u's lerped along its segments, and the normals are `farRow`'s. The gate asserts it.
3. **CHUNKS CUT ON FAR STATIONS**, in the bake and in `SlabRevetment.jsx` alike: near range = far range × 2^(octaves−1).
4. **NO RAMP: THE BOUNDARY ROW IS `farRow`'s** (Boz ruled (iii), 2026-10-29, on `scratch/far-shore/edge-choice.mjs`). A near chunk
   can't know whether its neighbour is near or far, so every near chunk's edge rows are `farRow`'s, and its next row is full detail.
   The kink against the far triangle (median / p95): Huron 15.4° / 45.1°, PTown 18.5° / 53.8°. The rock's own near↔near angle:
   11.8° / 41.8° and 11.2° / 38.9°. So it falls inside the stone's own facets, with no runtime rebuild and no detail band, and the
   positions are closed. Not chosen: (i) ramp every edge (detail reduced on 11–33% of the near surface); (ii) rebuild the edges
   that face a far chunk (one strip median 10–11 ms; the worst movie reselect is 2 strips ≈ 21–22 ms, over one frame). (ii) is the
   measured fallback if Jacob's eye finds the row.
⛔ Byte-identity breaks by design: the near layer everywhere (the nesting moves its spacing by less than one step), the near layer at chunk
edges (conformed), and the far layer on every face the new sizing changes. All three are named in the commit; the far shore is re-baked
(the `revetment-far` step, ~7 s a town).

## 3. Gates
- The seam probe: **0 along-offset at EVERY boundary** (max). A cross-seam probe at every boundary: the near row's shared vertices
  bit-identical to `farRow`'s, the rest on its segments (the residue of a float32 lerp is reported as measured, never called a tolerance).
- **The trim** (Zob): the far's DRAW decides the seam, never keep[]. A far quad draws on 3 of 4 kept corners and draws both
  triangles, so its drawn edge along the boundary row isn't its kept extent. The near quads in the column touching the boundary row
  draw iff their boundary subsegment lies in a segment that is an edge of a drawn far triangle in the far-side column: the visible
  neighbour chunk's. ⛔ Never the hidden far quad that the near replaces, which says nothing about the seam (Zob). That overrides 3-of-4 for that
  column only. Gate: the near-drawn and far-drawn boundary segment sets are equal.
- A planted row, a near chunk beside a far chunk on one face. Mutants → RED: the near computing its own boundary row; the far not through
  `farRow`.
- A mutant sizing from 201 samples again → PTown 1:left empty, RED.
- **PTown 1:left non-empty**, near and far; **Huron 97:right and 111:left not emptied**; `claims-the-armoured-shore-is-never-empty` GREEN.
- The deviation probe (`scratch/boulder-lod-deviation.mjs`) re-run; the far bake equals the runtime's far build (`far-bake-vs-runtime.mjs`);
  `claims-a-bare-station-costs-nothing` and `claims-the-far-shore-is-not-built-at-load` green.
- **Jacob's eye**, at a grazing angle at a near/far boundary, PTown and Huron, after the re-bake. If it finds the row, (ii) above.

## 4. Bounds
Branch off groyne/far-shore in `.claude/worktrees/`; `git commit -- <paths>`. Bakes and :5190 in Boz's slot; never integration's slab.
