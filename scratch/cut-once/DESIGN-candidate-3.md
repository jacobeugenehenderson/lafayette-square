# Candidate 3: the open/close with provenance (Plumb, 2026-10-28; for Boz and Zob BEFORE any build)

Status: **design, unbuilt.** Each claim is marked **[code]** (read at integration 9b9910bb, with the symbol named),
**[measured]** (a command in this directory), or **[unmeasured]** (to be measured first, in build step 0).

## The cause it attacks
Today, `open = off(off(P, −h), +h) ∩ P` (`structures.mjs#openCloseAtStep`). The second offset recomputes every edge it did
not change, from rounded intermediate points, so it hands the boolean a near-parallel copy of the source edge, and the
intersection between the two copies is ill-conditioned. **[measured]**: 109 copies on PTown's decks and 91,990 on Huron's
traced water (integer form); JSTS in doubles makes the same copy 0.14 u off at (276.4, 339.9), and its overlay cannot node it.
**The cure is to never recompute an edge: the offset carries each edge's SOURCE LINE, and the second offset emits that line,
not a re-offset of it.**

## The method
P is the source part (an integer ring plus its holes); edge i of a ring lies on line Lᵢ, through two integer source points.

1. **ERODE, with tags.** For each ring, each edge i gives the offset line Lᵢ(−h). Each join is the intersection of the two
   adjacent offset lines (as `structures.mjs#stripOf` does already **[code]**). Parity with ClipperOffset jtMiter, MiterLimit 2
   **[code: clipper-lib ClipperOffset, m_miterLim 0.5]**: a join with 1 + cos θ < 0.5 is SQUARED, and the square's cap edge is
   tagged `null` (a new line). ⛔ **The limit is clipper's CONSTANT, not ours** (Boz): kept for parity in step 0 so the
   comparison is fair, then derived or justified before the build ships, never inherited silently. ⛔ At a concave join, clipper's three-point detour back through the source vertex is NOT
   copied: the exact intersection of the two offset lines is used. Every raw edge carries its tag (i, or null).
   The eroded GEOMETRY is only an intermediate. What leaves this step is its TOPOLOGY: which source lines survive, in what
   order around each output ring, plus the null caps. So the raw curve may be rounded to the lattice here without that
   rounding reaching the output.
2. **RESOLVE the raw curve** (it self-intersects wherever a feature is narrower than 2h): node it with
   `latticeNode.js#nodeCrossings`, then take the region with clipper's union (nonzero, as today).
   - **RULED (Zob): a `self` option on nodeCrossings, default false, one home.** Under it a same-ring pair goes to
     `pairs(ri, ri)`. It is passed to verifyNoded too, so the verifier reads the same rule. ⛔ Not by dropping the hard skip:
     existing callers pass permissive `pairs` and would silently start self-noding. `tjoin && self` refuses by name. A
     noded self-crossing is a self-TOUCH, which the antenna pass already keeps.
   - The tags ride the noding (each output vertex's `edge` **[code]**). **A tag is (ring, i)** (Zob C4), and the map keys
     on the **directed SEGMENT (u, v)**, never a single vertex (Zob C3): a self-crossing pixel is one vertex visited twice
     under two tags. A (u, v) mapping to two tags refuses by name.
   - ⛔ **[measured] (step 0a): clipper's union is NOT a pure topology step on noded input.** PTown decks: 0 new vertices,
     501 of 501 edges mapped. Huron: **621 new vertices and 1,358 unmapped edges**, with PreserveCollinear on. Each sampled
     new vertex lies within 0.3 u of a noded segment, near its end. Cause not established. **OPEN, for Zob:** find why clipper
     emits them, or replace the union with our own face walk on the noded arrangement (windingOf per face). The second puts
     no third-party rounding in the path. Either way PreserveCollinear(true) on every union in the method (Zob C2), or the
     run map, with a refusal if a run carries more than one tag.
3. **DILATE, emitting the source's own lines.** Each eroded ring is now a cyclic sequence of tags. The dilated edge of
   tag i IS Lᵢ (−h then +h is the identity on a line), so no offset is computed for it. Its vertices:
   - consecutive tags i, i+1 (adjacent in the source ring): the **source vertex v₍ᵢ₊₁₎ itself**, integer, no arithmetic.
     **Every edge the open does not change is therefore the source's own, bit for bit.**
   - non-adjacent tags a, b (a feature was removed between them): Lₐ ∩ L_b, the CUT POINT, computed exactly in BigInt and
     rounded ONCE, half-up. This needs a LINE–LINE form of `crossOf`, because `crossOf` refuses a crossing outside both
     segments **[code]**, and a miter's crossing can lie past them. Proposed: `latticeNode.js#lineCrossOf`, sharing crossOf's
     BigInt and half-up code. **RULED (Zob):** crossOf's point tail becomes one internal function; crossOf = the inside test
     plus that function, lineCrossOf = that function alone.
   - ⛔ **D = 0 is the COMMON case (Zob C1).** A spike removed from a straight wall leaves Lₐ = L_b. **Same line** (exact,
     BigInt: the direction cross product and the offset cross product both 0) → no vertex: the edge runs straight through
     and one tag spans both. **Parallel and distinct** → refuse by name (the true error). **Near-parallel** → the crossing is
     far away, so the cut join takes the SAME miter limit as an erode join, and when squared its cap is a null line, born
     rounded.
   - A tag appearing twice in one eroded ring is NORMAL (a feature split one edge), and adjacency is cyclic per ring
     (last → 0; each hole its own cycle) (Zob C4). Nobody "fixes" it.
   - a null cap: its line is the cap's +h offset, a NEW line, computed in doubles and rounded once at birth (ORIENTATION's
     "the line is born rounded"). Same miter limit.
4. **RESOLVE again** (dilation merges what touches): nodeCrossings, then union, as in step 2.
5. **∩ P and the pieces, on one noded arrangement.** A cut point within both segments lies within NODE_BOUND of both
   its lines. ⛔ A far or squared join does NOT lie on P's segment (Zob C1): its cap edges are new lines inside or outside P,
   and the ∩ P on the noded arrangement trims what lies outside, its crossings with P being hot pixels of both.
   So P's rings and the open's rings are noded TOGETHER (`pairs`: P × open), which routes both through every cut point's hot
   pixel. P's edges and the open's edges are then the same integer segments wherever they coincide, and clipper's integer
   difference P − open (the taken pieces) is exact on them. Slivers: the existing `isRoundingSliver`. ⛔ It is itself an
   integer erode (`co.Execute(o, −NODE_BOUND)`), but it is only a PREDICATE: its output is discarded **[code]**, so no copy
   from it reaches the output.
6. **CLOSE**: the same machinery mirrored (dilate the open, erode back), with the open's tags (each a source line or a cut
   side). filled = closedK − open; then k = P − taken features ∪ filled features, all on the one noded arrangement.
7. **The water and the take-out.** The same function replaces the integer one for the decks, the embankments (not called
   today), the traced water (the `cutOnce: false` fork deleted), and `waterWithoutDecks`' open of `loc` and its half-cell close
   of `u0`. ⛔ Its grow masks (the 1- and 2-cell rings round D) are region SELECTORS: their boundary inside the water is a cut
   side, which is correct as new; the water's own edges inside a thin piece are now the water's own.

## Ruled 2026-10-29 (Zob), and built in cand3.mjs#emit
- **A cut whose crossing the next boolean trims emits that boolean's exact result: the region's own arc.** Open: X outside the
  region; close: X inside. Decided by the local loop's exact BigInt orientation (arc, then X).
- **The gap rule at ANY non-adjacent join** (clause 3, made general): every skipped source vertex within NODE_BOUND of the cut
  path → the source vertices, never X.
- **A squared join's cap ends are lineCross(L_cap, L_a) and lineCross(L_cap, L_b)**, each rounded once. An end past NODE_BOUND
  from its neighbour line refuses by name.
- **The miter limit (2, i.e. squared when 1 + cos θ < ½) is JUSTIFIED for the port, not derived** (Zob; Boz may rule against). It
  is a dimensionless ratio to h, bounding the tip at a multiple of the step, and h comes from the trace's own step. So it carries
  no town scale and is not Layer 0's Class D. Its value equals the shipping integer path's (clipper-lib's MiterLimit default),
  which keeps continuity with what the towns were authored against.
- **The bar:** copy = 0 against P AS NODED (the arrangement of the area books). Against raw P the residual is the noding's own
  rounding, each move ≤ NODE_BOUND, reported in one table.

## Gates for the method (on top of the brief's §4)
- own-edge.mjs on the three fixtures: **copy = 0**, crossings = 0. The brief's ≤ 2 mm targets: PTown 0, Huron 3.
- Mutants, each RED: an integer re-offset restored at step 3 · the tags dropped (the dilation recomputes Lᵢ(+h) from step 1's
  rounded points) · lineCrossOf's BigInt replaced by doubles · a cut point not noded into P (step 5).
- Topology row: a planted part with a hole, a pinch and a split gives the same outer and hole counts as the integer form
  wherever the integer form is correct; a dropped hole is RED.
- The yardstick is itself seen to fail first: a planted 1-unit copy of one edge must read `copy = 1`.
- Zob's rows: a collinear spike · a near-collinear spike (0.01° either side) · two exactly parallel distinct lines (refuses).
  Mutants: PreserveCollinear at its default (RED unless the run map catches it) · `self` reaching nodeCrossings but not
  verifyNoded (the verifier RED on a planted self-crossing).

## Build step 0: measured (`node scratch/cut-once/step0.mjs --fixture=decks|huron [--collinear=default]`)
Step 1's tagged erode, built as ClipperOffset point for point, resolved by nodeCrossings (one open path per edge, standing in
for `self`) plus clipper's union (pftPositive):
| | raw edges | self-crossings | noding | union | (a) new vertices / unmapped edges | (c) area, tagged vs clipper | outers/holes | XOR |
|---|---|---|---|---|---|---|---|---|
| PTown decks | 960 | 242 | 23 ms | 5 ms | 0 / 0 (same with collinear default) | 21,562.085 / 21,562.116 m² | 12/1, both | 0.20 m² |
| Huron traced | 167,833 | 52,518 | 1.5 s | 2.7 s | **621 / 1,358** | 41,761,068.6 / 41,761,067.9 m² | 9/58, both | 1.34 m² |
(b) cost is no obstacle. (c) topology matches; the area difference is 0.20 m² and 1.34 m², cause not established. (a) is
the open point (step 2). The PTown decks carry no collinear runs, so C2 needs its planted row.

## Not established
Whether ①'s 4 mm offset (282.795 vs 282.791) is a further step after the take-out. Whether the Huron crossing (the debt) is
the near-parallel copies or something else in the cut/fill; the method removes the copies, and the fixture will show
whether the crossing goes with them.
