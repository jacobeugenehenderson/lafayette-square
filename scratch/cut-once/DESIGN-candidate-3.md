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
   tagged `null` (a new line). ⛔ At a concave join, clipper's three-point detour back through the source vertex is NOT
   copied: the exact intersection of the two offset lines is used. Every raw edge carries its tag (i, or null).
   The eroded GEOMETRY is only an intermediate. What leaves this step is its TOPOLOGY: which source lines survive, in what
   order around each output ring, plus the null caps. So the raw curve may be rounded to the lattice here without that
   rounding reaching the output.
2. **RESOLVE the raw curve** (it self-intersects wherever a feature is narrower than 2h): node it with
   `latticeNode.js#nodeCrossings`, then take the region with clipper's union (nonzero, as today).
   - ⛔ **[code]**: nodeCrossings skips same-ring pairs (`s.ri === t.ri`), so a raw curve's self-crossings are not noded as
     it stands. Either each raw ring goes in as one open path per edge (open paths are supported **[code]**), or nodeCrossings
     takes a `self` option (an addition to a shared module: Zob's call).
   - The tags ride the noding: nodeCrossings returns each output vertex's `edge` (its input segment) **[code]**. After the
     union, each output edge u→v is mapped back to its noded segment by EXACT vertex identity, never by proximity.
     **[unmeasured]**: that clipper's union adds no vertex to an input that is already noded (step 0 checks it, and the
     build refuses by name if it does).
3. **DILATE, emitting the source's own lines.** Each eroded ring is now a cyclic sequence of tags. The dilated edge of
   tag i IS Lᵢ (−h then +h is the identity on a line), so no offset is computed for it. Its vertices:
   - consecutive tags i, i+1 (adjacent in the source ring): the **source vertex v₍ᵢ₊₁₎ itself**, integer, no arithmetic.
     **Every edge the open does not change is therefore the source's own, bit for bit.**
   - non-adjacent tags a, b (a feature was removed between them): Lₐ ∩ L_b, the CUT POINT, computed exactly in BigInt and
     rounded ONCE, half-up. This needs a LINE–LINE form of `crossOf`, because `crossOf` refuses a crossing outside both
     segments **[code]**, and a miter's crossing can lie past them. Proposed: `latticeNode.js#lineCrossOf`, sharing crossOf's
     BigInt and half-up code.
   - a null cap: its line is the cap's +h offset, a NEW line, computed in doubles and rounded once at birth (ORIENTATION's
     "the line is born rounded"). Same miter limit.
4. **RESOLVE again** (dilation merges what touches): nodeCrossings, then union, as in step 2.
5. **∩ P and the pieces, on one noded arrangement.** A cut point lies within NODE_BOUND of both its lines, not on them.
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

## Gates for the method (on top of the brief's §4)
- own-edge.mjs on the three fixtures: **copy = 0**, crossings = 0. The brief's ≤ 2 mm targets: PTown 0, Huron 3.
- Mutants, each RED: an integer re-offset restored at step 3 · the tags dropped (the dilation recomputes Lᵢ(+h) from step 1's
  rounded points) · lineCrossOf's BigInt replaced by doubles · a cut point not noded into P (step 5).
- Topology row: a planted part with a hole, a pinch and a split gives the same outer and hole counts as the integer form
  wherever the integer form is correct; a dropped hole is RED.
- The yardstick is itself seen to fail first: a planted 1-unit copy of one edge must read `copy = 1`.

## Build step 0 (measurements, before any of the above)
(a) Does clipper's union add vertices to a noded input? (b) nodeCrossings' time on Huron's raw eroded curve, 90k vertices,
as open paths per edge (it was built for rings, and per-edge open paths may cost more). (c) How the squared-miter parity
changes the features on the three fixtures (expected: identical, since today's call uses the same limit).

## Not established
Whether ①'s 4 mm offset (282.795 vs 282.791) is a further step after the take-out. Whether the Huron crossing (the debt) is
the near-parallel copies or something else in the cut/fill; the method removes the copies, and the fixture will show
whether the crossing goes with them.
