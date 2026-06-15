# HANDOFF — The concentric-CURVE curb for curved streets (the kit-class fix)

**Status: DESIGN, awaiting sign-off (2026-06-14).** Branch `curb-offset-draw`.
**One line:** a curving street is a **curve**, not a dense polyline. **Simplify** the centerline to its true control points, fit **arc/biarc curve segments** on the curving runs, and build the curb as the **concentric offset of those curves** (line→parallel line, arc→concentric arc) — smooth, continuous, concentric **by construction**, with **no facets**. Tessellate to points only at the very end.

Supersedes the earlier per-tile-offset framing of this file. Aligns with the two laws in **`HANDOFF-vector-curve-construction.md`** ("4 points joined by curves", THE PLAN §1–5) and the Derivation Chain (`RIBBONS.md §1`).

---

## Why we kept failing (the reflex to kill)

The whole pipeline is **polygon-based** (Clipper, `extractFaces`/DCEL, the bake, three.js) — there is **no curve primitive**, so a curve must become points, and the reflex was *densify* ("more points = smoother"). **It is a treadmill.** Offsetting **straight segments** mitres the **convex/outer** angle into a little facet at *every* vertex; densifying just makes **more, smaller facets** ("bumpy in the same places, inside and out" — Jacob). Tried this session and rejected: per-vertex offset (wiggle), Clipper run-stroke carve (junction thorns), continuous-frontage carve (horns), E3 carve (gate-red), and **skeleton corner-round densify (7→30 pts — wrong direction, reverted)**.

**The key geometric fact:** arc/line segments that meet **tangentially** have a concentric offset that is **also tangent → no angle, no facet.** Straight-segment polylines have an angle at every vertex → facets no matter how dense. So smoothness must come from the **curve representation**, not point density.

## The two laws (do not relearn — `HANDOFF-vector-curve-construction.md`)
1. **Concentric law** — the curb is a parallel offset of the centerline; clean it on the **FRAME** (`derive.js`/`skeleton.js`), never at the curb (`extractFaces`/curb desyncs from the drawn centerline = "the stink").
2. **Curves, not legs** — a curving road is a smooth curve fit *through* its control points; RDP-to-chords cuts across the road. **Simplification's output feeds a curve FIT, not a denser polyline.**

## The method (concrete)

On the **FRAME** (`derive.js`, behind a flag), per street, after the existing junction-protected RDP:
1. **Control points** — the street's true minimal points (RDP already gives these; junction + name-transition protected). Straight-with-corners ≈ 4 pts; a curve keeps what it needs.
2. **Classify each interior vertex:** **real corner** (a junction node / sharp ≥ ~35° at a shared node) → stays a **sharp control vertex**; **curve vertex** (a run of consecutive gentle same-direction turns, single-owner) → part of a **curve run**; **straight** → line.
3. **Fit curve runs** — fit a **circular arc (or biarc)** through each curve run's control points so the centerline **rides the road** (interpolating; arcs join the adjacent lines **tangentially**).
4. **Concentric offset = the curb** — line → parallel line at ±halfWidth; arc → **concentric arc** (same centre, radius ± halfWidth, same angular span). Tangent joins stay tangent → the curb is smooth and continuous with **zero facets**. **Tessellate the concentric curve finely only here**, for the polygon ops — smoothness already guaranteed by the curve.
5. **Real corners** stay sharp → the curb's `filletRing` rounds them into a vector arc (unchanged). Concentric offset of a smooth curve never self-intersects when halfWidth < the fit radius; where a curve is genuinely tighter than the road half-width, the arc fit caps radius so it can't.

## ⭐ Grid safety — scoped to curves, by construction AND verified (Jacob's standing question)
- **Straight street** → no curve run → control points = endpoints → curb = today's parallel line. **Identity.**
- **Real ~90° grid corner** → sharp control vertex → filleted curb, exactly as now. Arc-fit fires **only** on a run of consecutive gentle same-direction turns. **Identity.**
- Only a **genuinely curving** street (West 18th, Dolman, the Places) gets arc segments + concentric-arc curb.
- **Verify every change:** grid tiles **byte-identical** before/after; curb-degenerate gate GREEN; curated/correctness suite unchanged; **Jacob's eye on a grid corner**. If any grid tile moves, the transform isn't identity — fix before shipping. **Behind a flag** so it's reversible.

## Placement & realization
- **Frame, not curb** (Law 1): the fit + concentric offset live in `derive.js` so the frozen `ribbons.streets` (drawn centerline), `tiles[]`, and the curb all derive from the **one** curve → the navy and the curb are concentric by construction (no desync). The curb realization plugs into the existing `tileGround` curb path (the concentric arc segments tessellated into the tile/`iA` ring), or freezes the curb (D6b) — decide in build.
- **Companion: topological corners (the false ADA ramps).** With the curve as arcs (gentle vertices), the ped band's geometric corner test no longer fires mid-curve → the phantom ADA ramps go away. Make the ADA/fillet test read the **junction graph** (real nodes only) to guarantee it, not turn angle. (West 18th has `intersections: []` → any ADA/fillet on it is false by definition — the clean test.)

## Gates
- ⭐ **The EYE is the only real gate** (`feedback_proxy_render_is_not_the_operator_eye`) — proxy metrics misled all arc. Validate on the lit Survey view: West 18th smooth + concentric **both sides**, no facets, no mid-curve ADA; the grid unchanged.
- **Numeric sanity (necessary, not sufficient):** grid tiles byte-identical; `litmus-curb-parallel` (Check A) green on curves; curb-degenerate gate green; curated suite unchanged.

## Boundaries / lessons
- ⛔ **Do not densify.** Smoothness is the curve, not point count.
- ⛔ **Do not patch the curb live** (5 primitives thrashed by patching). Fit on the **frame**, behind a flag, from the start.
- **Scope:** `derive.js` (the fit + offset) + the curb consumer in `tileGround.js`. No `public/baked/**`, no `design.json`. Re-freeze (`skeleton.js`→`pipeline.js`→`promote-ribbons.js`) is reproducible (verified byte-identical) — checkpoint tag `checkpoint-before-skeleton-round` stands.
- **Phasing:** flag-gated; prove on **West 18th** first (canonical, `intersections:[]`), grid byte-identical, then the other curves/Places.

---
*Drafted 2026-06-14 after Jacob named the real fix: simplify (not densify) + concentric curves. The densify reflex (consume-time Catmull-Rom + skeleton corner-round) is reverted; the sparse frame is the checkpoint baseline.*
