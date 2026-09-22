<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-21
evict-when: node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs
-->

# The ground must stretch, not break

> **The ask, verbatim (Jacob, 2026-09-21):** *"the ground layer is stretched over terrain
> but it is visibly split in places. It really must stretch and not break; it is built the
> way it is for exactly this reason."*

⭐ **This is not an investigation.** The defect is already named, in the canon and in a code
comment, as a deliberately unbuilt gap. Read §1, confirm it, and build §3.

---

## 1 · THE DIAGNOSIS, AND IT IS ALREADY WRITTEN DOWN

`cartograph/bake-ground.js`:

```js
// Triangulate (and optionally refine) each polygon independently, then
// concatenate with vertex offsets.
const perPoly = polys.map(p => triangulateAndRefine(p.outer, p.holes, refine || maxEdge, yLift))
```

The refinement inside `triangulateAndRefine` **is** crack-free: adaptive red-green, an
edge-keyed midpoint cache so neighbours share a midpoint **index**, green 1-to-2 closures,
promotion to red at ≥2 bisected edges, iterated to a fixpoint. Its own comment explains that
a plain 1-to-4 split "left exactly those T-junctions … opening up-to-`tol` vertical cracks
along the contours — invisible from overhead, glaring at street level."

⛔ **But the midpoint cache lives inside ONE CALL.** Two polygons that share a boundary are
refined independently, so a vertex introduced on one side of the shared edge has no partner
on the other. That is a T-junction, and on a GPU-displaced mesh a T-junction is a hole.

`cartograph/ARCHITECTURE.md §8 "Ground conformance"` says it outright:

> *"Per-polygon triangulation is independent, so the conforming guarantee is **within** a
> polygon; **cross-polygon (group-boundary) conformity is not yet handled.**"*

⇒ Class: **ASPIRATION** — filed as a caveat, never built. ⛔ Do not "discover" it again.

## 2 · WHY IT IS VISIBLE NOW AND WAS NOT BEFORE

The crack height is bounded by how far the two sides disagree about the terrain between
their vertices — up to `GROUND_REFINE_TOL_M` (0.50 m) on gentle ground, more where it bends.
Flat blocks refine identically on both sides and show nothing.

⭐ **So this is the kit's signature shape: invisible on town #1, glaring on town #2.**
Lafayette Square has ~35 m of total relief. huron has a lake shore with **859 steps over 1 m
within 40 m of the water** (measured 2026-09-21, `scratch/huron-shore-transect/bake-gradient.mjs`).
⛔ Do not tune this against LS and call it fixed.

### ⚠️ A NEARBY DEFECT THAT WAS REAL AND IS NOW FIXED — read this before you measure anything
huron's draped terrain used to sit **1.13–4.77 m ABOVE** the level `water:lake` plane at
**100%** of 1,894 shore vertices (`scratch/huron-shore-transect/seam-arc.mjs`). That was a
systematic OFFSET between two surfaces, not a crack within one — a different root, and it has
been **fixed the same day** by deriving the terrain datum from the water surface
(`cdd41f6e`, "Derive the water datum: y = 0 is the lake, not the lowest hole in the county").
⛔ **Do not go looking for it, and do not attribute a split you see to it.**

⛔⛔ **BUT THAT FIX CHANGED A CONTRACT YOU DEPEND ON: `terrain.bin` NOW GOES NEGATIVE.**
y = 0 is the water surface, so ground below the waterline is below zero — verified on huron
2026-09-21: **814,882 of 2,064,969 samples (39.5%) are negative, min −1.20 m**, and
`terrain.json` gained `datum` + `datumShare`. ⭐ **TREAT 0 AS AN ORDINARY INTERIOR VALUE, NOT
A FLOOR** — any welding, quantisation, bounds or tolerance you write that assumes the
heightfield starts at 0, or clamps to it, is wrong on any town with water, and 70.1% of
huron's negatives are under the drawn lake. ▶ re-derive, never quote: read `terrain.json`,
and `node scratch/huron-shore-transect/negatives.mjs` gives the water/land split in one
command.

## 3 · THE JOB

Make the conformity guarantee span the whole group instead of one polygon.

- Share the edge-keyed midpoint map across every polygon in `perPoly`, and run the red-green
  fixpoint over the **union** before concatenating with vertex offsets.
- ⛔ **"Shared edge" must be established GEOMETRICALLY.** Polygons are triangulated
  independently and concatenated with offsets, so per-polygon vertex indices cannot identify
  a shared edge. Key on quantised world XZ. Pick the quantum deliberately and write down why.
- ⛔ **Honour the existing warning:** a split without conformity is worse than no split. If the
  union pass cannot reach a fixpoint, it must FAIL LOUDLY rather than emit a partial weld.
- ⚠️ The tri-budget is already a live constraint (`OPERATIONS.md §Ground tri-budget`; huron at
  tol 0.10 bakes 6.7 M tris and was rejected). Report the tri delta; a conformity pass that
  doubles the budget is a different conversation.

## 4 · ACCEPTANCE — a check, not a screenshot

**`checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs`** (to be written as part of
this job; it is the deliverable, not the evidence):

> For every baked slab on disk, no ground vertex may lie in the INTERIOR of another ground
> triangle's edge, within a tolerance well below the crack size.

⭐ It reads `ground.bin`/`ground.json`, so it runs over whatever towns exist and covers a town
nobody has opened. ⛔ Mutation-test it: it must FAIL on today's bake before it passes on yours.
⛔ It must report a COUNT and the worst offender's location, not a boolean — "3 T-junctions"
and "40,000 T-junctions" are different findings.

⛔ **AND AN EYE GATE AT STREET LEVEL.** The canon: these cracks are "invisible from overhead,
glaring at street level". An overhead screenshot proves nothing. The verdict must record its
scene (`A17`).

## 5 · PREMISES DELIBERATELY NOT ESTABLISHED

- Whether every visible split has this root. ⛔ Only the mechanism is confirmed; nobody has
  matched a specific on-screen seam to a specific T-junction. **Do that first** — one located
  crack, measured, before any code.
- Whether group boundaries and polygon boundaries coincide. The canon says "cross-polygon
  (group-boundary)"; the code loops polygons. Confirm which before choosing where the union runs.
- Cost. Uncosted on purpose.
