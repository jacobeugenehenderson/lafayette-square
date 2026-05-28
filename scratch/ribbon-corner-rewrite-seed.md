# Ribbon-corner rewrite seed (2026-05-28, post-revert + reframe)

The C0–C5 arc shipped 2026-05-27 and was reverted (`ea0bed6`) because every IX corner came out **squared** instead of following the rounded curb. The local cause is real ([[feedback_per_leg_straight_only_overshoot]]). The deeper error was framing the band as a new emission system at all. **The curve we need already exists — the curb is it.** Tomorrow's brief uses it.

## Vocabulary

There is no "cream." There are exactly two materials in the band between the curb and the property line:

- **Concrete** (sidewalk).
- **Grass** (the parcel's land-use fill showing through).

Every part of the band is one or the other. Per-side authoring picks which strip is which.

## The actual architecture

Per block:

**Step 1 — Band shape, from the existing curve, in one Clipper op.**

The curb already exists: `curbBands = dilate(asphaltRounded, cw) − asphaltRounded`. One polygon per block, both edges already smooth-rounded.

The band between curb and property line is two insets of that already-smooth curve:

- Outer edge = `inset(asphaltRounded, cw)` (= curb's inner edge).
- Inner edge = `inset(asphaltRounded, cw + W)`, where W = uniform block depth (the keystone).
- `band = differenceRings(outer, inner)`.

The outer corner is concentric **because the source curve is already smooth.** No polygon-walking. No per-vertex perp. No Bezier-sample partition. No origin-fe tagging. No `applyRoundCornersToRing` extension. The curve is computed; we inset from it.

**Step 2 — Per-side material, as overlay on top of the band.**

The band from Step 1 is concrete by default. For each leg's straight portion (the run between corner arcs on `blockRounded`), if that side is authored to have a **grass strip**, emit a grass rectangle at the authored width, clipped against the band, **stopped before the arc span** so it does not enter the corner region. Corners stay all-concrete because grass never reaches them.

This is the **only** per-leg pass. It assigns material (grass over concrete-default); it does not construct band shape.

## What we are NOT doing

- ❌ Walking `blockRounded` vertex-by-vertex to emit band shape.
- ❌ Per-vertex perpendicular offset on straight runs vs arc spans.
- ❌ Separate corner emitter on Bezier samples.
- ❌ Extending `applyRoundCornersToRing` to expose `consumed[]`.
- ❌ Any partition of `blockRounded` into straight vs arc runs for shape emission.

These were symptoms of misreading Step 2 as if it had to produce Step 1. **Step 1 is one Clipper difference on a curve that already exists.**

## Why this works

The keystone — *uniform band width per block; per-side variation in material not width; land-use plugs the remainder* — is what makes Step 1 trivially `differenceRings` on uniform insets. Variable-distance inset never needed to enter the picture because band width is uniform per block by doctrine.

Per-side variation lives in material assignment (Step 2), which operates only on the straight runs and stops at arc spans, so it cannot affect corner shape.

## The stage wall

Chains are the polygon-construction-phase input. After polygon construction, emission operates on already-computed curves (`asphaltRounded`, the curb, `blockRounded`) and per-edge data (`frontageEdges`, `blockCustoms`). **No `streets` parameter in emission signatures.** Enforced at signature level from the first commit.

## What the brief must carry from page one

1. **Band shape = `differenceRings(inset(asphaltRounded, cw), inset(asphaltRounded, cw + W))`.** One sentence. Named explicitly as Step 1. The curve already exists; we inset from it.
2. **Per-leg pass is material overlay only.** Step 2. Operates on straight runs; stops at arc spans. Does not construct band shape. Two materials: concrete (default) and grass (overlay where authored).
3. **W = uniform per block** (the keystone). Per-side variation = material, not width. Validate on a real LS block before any production change.
4. **Stage wall** (`RIBBONS.md` §1, line 74) — emission signatures take no `streets`. Enforced from the first commit.
5. **Visible-result spec** — concentric outer edge at every IX, no square overshoot, lopsided corners (grass-meets-sidewalk-only) read as material asymmetry inside a still-symmetric band. C0 spike is the **corner picture** on a real IX.
6. **"Shipped"** = operator-eye confirmation on Mississippi × Park + one grass-grass IX + one sidewalk-sidewalk IX + one lopsided. Not commit count.

## Pattern note for Boz

Two errors converged in the C0–C5 night:

1. The brief wrote *"emitted per-leg"* without specifying it was **material per-leg, not shape per-leg**. Verge implemented shape-per-leg. That single ambiguity was the entire night.
2. The brief invented vocabulary ("cream") for what is just concrete and grass. Abstractions hide the simple thing — name materials by their real names.

**First check when opening any emission rewrite: "is the curve we need already computed elsewhere?"** If yes, inset/difference from it. The curb already exists. Stop reinventing.
