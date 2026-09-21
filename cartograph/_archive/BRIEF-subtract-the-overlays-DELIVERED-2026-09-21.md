<!-- BRIEF-STATE
status: DELIVERED-AND-SUPERSEDED
retired: 2026-09-21
landed: d793e4d4 (eye-gated by Jacob: "That did it and it looks great") · superseded by 4c630ebc
-->

> # ✅ DELIVERED 2026-09-21 — and then SUPERSEDED the same night, which is the more useful half.
> The pairwise subtraction landed and was eye-gated — *"That did it and it looks
> great"* — face ∩ overlay went to **zero above 1%** on huron and the slab got
> **smaller** (1,593,373 → 1,420,545 tris, 29.6 → 26.5 MB), because the face gives up
> area it was never visibly painting.
>
> ⭐ **Then Jacob relocated the fix and it generalised past this brief:** *"In Stage
> it's a flattened 2D representation which is baked into the 3D ready one. This is
> where we should take advantage of the flatness and just paint order everything and
> then on the way out press it all down."* ⇒ `flattenPaintStack` walks the whole paint
> order top-down rather than one pair, and **the pairwise cut this brief specified was
> DELETED, not kept beside it** — two places deciding one thing is how they drift.
>
> **Where the live doctrine went:** **`cartograph/ARCHITECTURE.md §8`** (the flatten,
> the `keepOwnSlot`/`doesNotCut` split, and ⭐ this brief's own hard-won rule — *a key
> joins the shared plane only on a measurement comparing it against EVERYTHING already
> on the plane*) · **`cartograph/OPERATIONS.md §Bake`** (what it changes for the
> operator: toggling a layer off is now subtractive on re-bake).
>
> ⚠️ **The one thing this brief got wrong is worth keeping:** it said `stripe` "can be
> subtracted … if the measurement supports it." It cut, and **194 m² survived**.
> ⛔ Cause not established — `ROADMAP` H-10.

---

# BRIEF — Subtract the overlays so the whole painted ground is one partition

**Opened** 2026-09-20 (23:30) · **Owner** Boz, pushing on tonight
**Follows** `ef0ac55a` (LU faces → one plane) and `83328d12` (the general rule + its check)

---

## The state after tonight
✅ The 11 LU **faces** are a measured partition and now bake to **slot 0 — one plane**. Fixed.
⛔ The **overlays still fight the faces**, and that is the remaining hero-camera jank:

    overlay  pitch / wood / scrub   y = 0.030–0.034   median tri edge  8.5 m
    face     recreation             y = 0.000         median edge     22.0 m
    face     agricultural           y = 0.000         median edge     33.3 m

The overlay sits **30 mm** above the face, but the face's own terrain-chord error at 22–33 m
spans is **17–29 mm median / 473–730 mm p95**. The finely-tessellated overlay hugs the DEM; the
coarse face beneath cuts a chord and **bulges up through it**. Measured overlaps that make this
unavoidable: `wood ∩ agricultural` **100%**, `pitch ∩ institutional` **50%**, `pitch ∩
agricultural` **49%**, `stripe ∩ asphalt` **91%**.

## ⛔ WHY NOT "MAKE THEM ONE SHEET BY EQUALISING TESSELLATION" — MEASURED, REJECTED
Jacob's alternative was to give every ground layer the same refine criterion so they bend
identically. Sound reasoning; the cost kills it. Baking huron at successively tighter
`GROUND_REFINE_TOL_M`:

| tol | tris | slab |
|---|---|---|
| **0.50** (today) | 1,593,373 | 29.6 MB |
| **0.10** | **6,688,604** | **119.5 MB** |

**4.2× the geometry — and 0.10 m is still 3× looser than the 30 mm it must beat.** The tolerance
that would actually work is ~0.02, which was heading far worse when the run was killed.
⇒ Buying "one sheet" through tessellation costs four times the geometry *to not quite fix it*.

## ▶ THE FIX — subtract, don't stack
**Cut each overlay polygon out of the face beneath it.** Then they do not overlap, so they take
**slot 0 with the faces** and the category is gone — the same proof that already worked for the
eleven faces, extended to the whole painted ground.
· **Costs no triangles** — the face gets *smaller*, losing the area the overlay covered.
· **Nothing to tune.** No epsilon, no tolerance, no per-town number.
· **Semantically truer:** the ground under a wood *is* wood, not agricultural with trees over it.

### It is visually identical, and that was checked
The only `transparent` in `BakedGround` is the radial rim **fade**, applied to every group alike
(`BakedGround.jsx:314`). ⛔ No overlay is semi-transparent to let the layer below show through, so
wood *over* agricultural and wood *replacing* it render the same.

### The machinery is already here, and so is the house pattern
`clipper-lib` is a dependency and `derive.js:752` already runs it. Subtraction is the same call
with **`ClipType.ctDifference`** in place of `ctIntersection`.

## Scope
1. In `bake-ground`, before triangulating a `face` key: subtract every `LANDSCAPE_OVERLAY_KEYS`
   polygon that intersects it.
2. Move the overlay keys onto the ground plane (`onGroundPlane`) once they no longer overlap.
3. ⛔ **`water` is EXCLUDED** — genuinely transparent (Fathom's kit material depends on it) and
   must keep drawing after the opaque ground. `stripe` is opaque paint on tarmac and *can* be
   subtracted, but it is thin: subtract it only if the measurement supports it.
4. Re-bake huron + LS; `checks/claims-coplanar-groups-do-not-overlap.mjs` verifies per town.

## ⛔ The rule that governs widening the plane, learned the hard way tonight
A key joins slot 0 **only** on a measurement comparing it against **everything already on the
plane**. I widened it to asphalt/curb/sidewalk/treelawn on a measurement that compared faces to
faces and ribbons to ribbons and **never faces to ribbons** — the check then found
`treelawn:vacant-commercial ∩ vacant-commercial` at **84%**. Reverted within the hour.

## Eye gate
Huron, hero camera, over the ball diamonds and the wood east of the cul-de-sac — the two places
the tearing is visible in Jacob's 23:15 capture.
