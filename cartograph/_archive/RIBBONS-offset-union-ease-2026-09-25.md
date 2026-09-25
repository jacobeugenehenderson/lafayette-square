# RIBBONS §1 — "OFFSET → UNION → EASE" (retired 2026-09-25)

Diary, retired for CURRENCY, not truth. This was ②'s construction from 2026-09-06 until `offsetRingByRects`
replaced it (Plumb, `BRIEF-junction-shape-where-the-offset-crosses`). What it measured stays true of the code it
measured; what it claimed about the union (that it "performs" the go-to-zero) was measured FALSE on 2026-09-24:
the self-union ran at `pftNonZero`, which keeps a winding −1 lobe. Live home: `RIBBONS.md §1`, the ② paragraph.

### ⭐⭐⭐ AND THE ORDER IS **OFFSET → UNION → EASE** — ruled and built 2026-09-06 (Jacob)
It was offset → ease → union, on the reasoning that only the raw polyline keeps the corner
correspondence exact. ⛔ **That order was producing the operator's "protrusions", and the mechanism
is `§1`'s own divergent function at a second site:** the raw offset carries near-REVERSAL vertices —
self-intersections the offset just made, not corners — and `easeContour` plans `R·tan(θ/2)` at each,
which **diverges as θ→180° (11× R at 170°, 57× R at 178°)**. `s = min(want, legBack/2, legFwd/2)`
bounds it only by HALF THE LEG, so on a long straight run the bound never bites. The oversized arc
overlaps the contour, the union cuts it, and the residue is a sub-half-metre stub turning 146°–161° —
**under `SPUR_COS`'s 165°, so nothing catches it.** ⭐⭐ **Same divergence as the miter apex
(`hw/sin(θ/2)`); one mechanism, two sites.**
⭐⭐⭐ **THE CURE IS NOT A BOUND ON THE SETBACK** — that is the clamp shape this § retires, and it is
how `easeRing` died. **Union FIRST and there is no reversal vertex left to ease**: *self-intersection
means the feature goes to ZERO, there*, and the union is what performs it. **No threshold anywhere.**
⛔ **The one condition: the middle union must be `unionRingLabelled`.** The ease resolves R through
the ① vertex index carried on the stamp, and the labelled union carries it THROUGH the boolean —
identity carried, never recovered. With plain `unionRings` every corner resolves to 0, which is most
of what the old *"687 of 893 corners died, survivors at 3.15 m against an authored 4.50 m"* was.
▶ **Measured, LS in-disc:** curb spikes >140° **33 → 10** · arcs planned at a near-reversal **77 → 12**
· the operator's marked circles carrying a surviving sharp turn **14 → 3** · achieved corner radius
median **4.50 m, unchanged** (the tripwire) · Survey↔Section still agree to **0 m²** · parallelism
gate **unchanged both sides**. ⛔ Re-run them, don't quote: `claims-marked-corners` ·
`claims-survey-and-section-agree` · `claims-proto-corner-is-authored-radius`.
⚠️ **COST, disclosed: 2 blocks moved into the no-curb class (119 → 117 tiles).** Their curbs meet, so
the drop is ruled correct — but see the absence disclosure below, which is the bigger half.
