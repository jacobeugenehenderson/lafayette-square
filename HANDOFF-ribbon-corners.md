# HANDOFF — Ribbon Corners (figure-ground via authored-strip union, curb caps it)

**Status:** draft for dispatch, 2026-05-28. Second rewrite after the 2026-05-27 revert (`ea0bed6`); supersedes the 2026-05-28 morning rewrite (uniform-W scaffold with visible scaffold polygon + ctrl-click fill toggle).
**Author:** Boz, 2026-05-28.
**Supersedes:** the prior `HANDOFF-ribbon-corners.md` (uniform-width arc, C0–C5 + 2 post-C5 attempts, reverted), the "per-vertex-perp on full `blockRounded` with `consumed[]`" path named in `RIBBONS.md §6.10`, AND the morning rewrite's `scaffold = inset(cw) − inset(cw + W_block)` construction. **Operator authoring surface is UNCHANGED in this brief** — same handles, same gestures, same `m.measure[side]` schema.

---

## §0 Pattern notes — read before §1

Three errors converged across the 2026-05-27 night and the 2026-05-28 rewrites; a fourth surfaced when Coping ran C0 twice and stopped at the wall both times. The brief that ran said *"emitted per-leg"* without specifying **material per-leg, not shape per-leg** — executor implemented shape-per-leg. The brief also invented vocabulary ("cream") for what is just concrete and grass. The morning rewrite invented a *visible* "scaffold" polygon and a new fill-toggle UX. The evening rewrite kept reaching for **per-vertex-perp on `fe.points`** (rectangle-shaped emission) when the doctrine ("concentric with the curb at every IX by construction") was asking for the actual concentric construction: inset rings of `blockRounded` itself, sliced by sector.

**Four tripwires for this brief:**

1. **First check when opening any emission rewrite: is the curve we need already computed elsewhere?** If yes, inset/intersect/difference from it. `blockRounded` already has Bezier-rounded corners. Stop reinventing.
2. **If you find yourself adding a new operator-facing UX surface, stop.** The operator already authors strips per side; the system handles uniformity invisibly. Operator UX is byte-identical to today.
3. **If you find yourself emitting a polygon that isn't a depth-band ring or a slice of one, stop.** The only polygons that emit are concentric inset rings of `blockRounded`, sliced into per-fe-sector and per-corner-zone arcs, plus the curb-stroke cap. `W_block` is a per-block *scalar*. There is no "scaffold" polygon, no "arcRegion" clip mask, no synthetic-strip rectangle.
4. **If you find yourself per-vertex-perping anything, stop.** The doctrine is "concentric with the curb at every IX by construction." Per-vertex-perp produces a band concentric with the POLYLINE you're perping, which is `fe.points` (chain-bendy), not `blockRounded` (rounded curb). On bendy fes per-vertex-perp self-intersects and `∩ insideCurb` wipes it to empty (Coping's C0 redo #2 finding, ~12 blocks).

Two materials in the band between curb and property line: **concrete** (sidewalk) and **grass / land-use** (landuse showing through where the parcel reaches). That is the vocabulary.

---

## §1 The win

The 13-month corner dragon was always the **variable** offset — per-side depths → asymmetric corners → wedges → per-vertex-perp ballooning. Keystone:

> **The ribbon (curb → property line) is one uniform width all the way around a block.** Per-side variation lives only in the *material* (concrete vs grass), not in the width. Where the operator authored a *shallower* side, the **deeper-depth ring slices belonging to that side's sector default to landuse** — invisible to the operator, who just sees grass auto-extending to the deepest line.

Construction: emit concentric inset rings of `blockRounded` at the sorted unique authored depths; slice each ring on `blockRounded` into per-fe-sector arcs (literal-vert runs) and per-corner-zone arcs (Bezier-vert spans); attribute material per a small table (§3 Step 2). **The doctrine "outer edge concentric with the curb at every IX by construction" is literally true** because every ring is an inward offset of `blockRounded`. No per-vertex-perp, no rectangle clipping, no self-intersection failure mode, no separately-built corner-pad emitter — corner pads are the per-corner-zone slices of the same rings.

**The curb plays a dual role** that makes this robust:
- **Source:** `blockRounded` is the rounded silhouette every ring is inset from. The construction is rooted in the curb.
- **Cap:** the curb stroke renders **last, on top of everything**, as one continuous Bézier-rounded line. With the concentric construction the cap is decorative polish (not load-bearing for hiding seams — there are none), and remains the operator-authored curb-width control.

---

## §2 The polygon-only wall (sharpened)

`RIBBONS.md` §1 is canonical (its `FEATURES.md` cross-ref is stale): **chains end forever at bake; polygons are the surface.** Sharpened to two tripwires for this work:

> **(a)** After phase-1 polygon construction, if you are **reading or computing on a point or chain** during emission, you are doing the wrong thing.
>
> **(b)** If you are **emitting a polygon that is not** a concentric depth-band ring (or a per-fe-sector / per-corner-zone arc-slice of one), or the curb-stroke cap, you are doing the wrong thing.

Sanctioned exceptions to (a):
- Phase 1 itself (`blockSharp`, `blockRounded`, `frontageEdges`, corner records) — points/chains are the input here, by definition.
- The corner-radius authoring kit (`cornersAtIx`, `applyRoundCornersToRing`) — sealed, out of scope.
- Authoring-overlay handle lookup in `BlockGeometryV2Debug.jsx` (`chainSkelId`/`chainName`) — cross-reference for picking, not emitted geometry.
- **Per-fe sector identification** — matching `fe.points` (sharp polygon verts) to literal verts on `blockRounded` by coord-proximity to determine which fe owns which sector. Reads `fe.points` for matching only; does NOT compute emission geometry from them.

There are **no sanctioned exceptions to (b) inside this brief.** `W_block` exists only as a per-block scalar driving the depth-band ring stack; emitted polygons are rings and slices of rings; the curb cap is a polygon. Nothing else.

C4.5's wall enforcement was reverted with the 2026-05-27 arc. **C1a below re-lands it as the first commit.**

---

## §3 The construction — concentric depth bands, per-fe sector attribution

Figure-ground is unchanged and load-bearing: **block = positive space**, `asphalt = stencil − blockRounded`, curb rounded via cubic Bézier on convex vertices. `blockRounded` is the curb silhouette (per-side curb position from `pavementHW`; rounded corners from the radius kit). **The curve we need already exists.** Everything below derives from it.

> **Doctrine literal-true:** the brief's "outer edge concentric with the curb at every IX by construction" is *literally* true in this construction because every emitted ring is an inward offset of `blockRounded`. There is no per-vertex-perp on `fe.points`; there is no rectangle clipped against a rounded canvas. Emission is concentric inset rings, sliced by sector. The curb cap remains as the visible polish layer, but it is no longer load-bearing for hiding geometry seams (there are none).

**Per block — one scalar, a depth-sorted list, a stack of concentric rings, per-fe-sector slicing:**

```
W_block      = max over the four sides of (m.measure[side].treelawn + m.measure[side].sidewalk)
               // deepest authored outer edge, a scalar — NOT a polygon

depths_block = sorted unique authored boundaries across all sides ∪ {0, W_block}
               // e.g. {0, 1.52, 2.0, 3.0, 5.91}

For each consecutive interval [d_i, d_{i+1}] in depths_block:
  ring_i   = inset(blockRounded, cw + d_i) − inset(blockRounded, cw + d_{i+1})
             // concentric depth band; outer edge is the curve at offset d_i,
             // inner edge is the curve at offset d_{i+1}
             // BOTH edges concentric with blockRounded by construction
```

`insideCurb = inset(blockRounded, cw)` remains as a useful reference (it equals the outer edge of `ring_0`), but is no longer used as a clip mask — there is nothing to clip.

**Step 1 — per-fe sector attribution on `blockRounded`.**

`blockRounded`'s vertices partition naturally into two kinds:
- **Literal-vert runs:** the original sharp-polygon vertices that survived corner rounding. Each contiguous literal-vert run belongs to exactly one fe — the fe whose side it lies on. Identification: the fe's `fe.points` are themselves the sharp-vert subset; literal verts on `blockRounded` that match a fe's `fe.points` (by coord, with tolerance) are the fe's sector.
- **Bezier-vert spans:** corner-rounding samples (`arcMeta[k]` non-null in the corner-radius kit). These belong to no fe; they are the **corner-pad zone**.

For each `ring_i`, slice it parametrically along `blockRounded` into per-fe-sector arcs (one arc per literal-vert run) and per-corner-zone arcs (one arc per Bezier-vert span). Each ring becomes a set of arc-shaped polygon pieces, each tagged with its origin (fe-id or corner-id).

**Step 2 — material attribution per slice.**

For each per-fe-sector arc of `ring_i` at depth `d_i`, the fill is determined by where `d_i` sits in the fe's authored stack:

| `d_i` range | material | rationale |
|---|---|---|
| `[0, fe.treelawn)` | **landuse** | the fe's authored grass strip; routed per-LU |
| `[fe.treelawn, fe.treelawn + fe.sidewalk)` | **concrete** | the fe's authored sidewalk strip |
| `[fe.treelawn + fe.sidewalk, W_block)` | **landuse** | system-synthesized: the fe is shallower than the block; landuse auto-fills to `W_block` |

For each per-corner-zone arc of `ring_i` at any depth in `[0, W_block)`:
- material = **concrete** (corner pad, per AASHTO/ADA doctrine RIBBONS §6.9).

> **Honesty note:** when a fe has `treelawn = 0, sidewalk = W_side < W_block`, the per-fe-sector at depth `[0, W_side)` is concrete; at depth `[W_side, W_block)` is landuse. The strip stack from curb outward reads [concrete, grass]; perfectly legible. The system-synthesized landuse falls out of the attribution rule — there is no special-case emission code for it, just "deeper rings near shallow fes default to landuse." Do not second-guess.

**Step 3 — render order.**

Bottom-up: per-fe landuse arcs (routed per-LU via `bake-ground.js:349` probe), per-fe concrete arcs (sidewalk-keyed), per-corner concrete arcs (corner pad, `cornerOrphanAsphalt`-style per-ring centroid probe). **Curb stroke cap renders LAST** as one continuous Bézier-rounded line on `blockRounded`. The cap is decorative polish, not load-bearing geometry repair: ring outer edges are already concentric with the curb by construction.

**What this kills, by construction:**
- **No per-vertex-perp** on `fe.points` or anything else. The §6.10 square-overshoot problem cannot occur because nothing emits at a perpendicular offset from a polyline.
- **No `∩ insideCurb` clip mask.** Rings are already inside-of-curb by definition.
- **No self-intersection failure mode** on bendy chain-bent fes. The construction never builds a polygon whose validity depends on the spine being non-self-intersecting.
- **No separately-built `arcRegion` polygon.** Corner zones are natively the Bezier-vert spans of `blockRounded`; identification is parametric on the ring itself.
- **No explicit synthetic-landuse-strip emission.** Synthesis falls out of the attribution rule.
- **No `consumed[]` extension to `applyRoundCornersToRing`.** No per-vertex authoring lookup at Bezier samples is needed because emission doesn't touch them as emission points — only as attribution boundaries.

**Why grass never wraps a corner:** corner-zone arcs always attribute to concrete by the rule. Lopsided corners (grass-flanked-by-concrete) render as material asymmetry in the per-fe-sector arcs *flanking* the corner; the corner itself stays concrete.

**Straight-side land-use beyond the strip stack** (i.e. beyond `cw + W_block` into the parcel interior) is handled, as today, by parcel construction at `bake-ground.js:381` — `parcelInteriors = block − curbBands − (treelawn ∪ sidewalk)` reaches to the property line, unchanged.

**The curb stroke cap** (`curbBands` @2349) renders last as one continuous Bézier-rounded stroke on `blockRounded`. **Do not move this layer.** With the new construction the cap is no longer load-bearing — every ring's outer edge is already concentric with the curb — but it remains the visible polish and the operator-authored curb-width control. Verify in C0/C4 that it still renders last in the stack.

---

## §4 Authoring — UNCHANGED in this brief

The operator already authors the right thing today. **Nothing in `MeasureOverlay.jsx` changes.** Same handles (`pavementHW`, `treelawnOuter`), same insert/collapse gesture (`@697`, `@734`), same `{pavementHW, treelawn, sidewalk, terminal}` schema, same drag wiring (`@491`/`@542`).

The system's new behavior is **entirely behind the operator** — `W_block` is computed at bake from existing schema, synthetic landuse strips are emitted into the same per-fe slot as authored strips and routed per-LU identically. The operator sees: drag a handle on the deepest side, and shallower sides' grass auto-extends to meet it. They never had to think about "the W zone."

**Future scope (NOT in this brief):** if you later want operator-authored material control (concrete medians, grass shoulders, more than two strips), that's an `innerFill`/`outerFill` schema reshape + UX gesture in a separate brief. Don't bundle it here.

**Untouched in this brief:** corner-radius authoring kit; curb stroke + curb width authoring; live drag (`buildChainBandsLive`); `blockCustoms[blockKey][edgeOrd]` keying; the block polygon itself; `MeasureOverlay.jsx` in its entirety.

---

## §5 Code anchors (verified)

All file:line in `src/lib/buildBlockGeometryV2.js` unless noted.

**KEEP untouched:** figure-ground + curb rounding (`bezierReplaceCorner` @614, `applyRoundCornersToRing` @677, `blockSharp` @2197/2260, `blockRounded` @2294, `asphaltRounded` @2300); **curb stroke cap** (`dilateRings` @1853, `curbBands` @2349 — renders last, on top); the 3-tier corner-radius authoring kit (`CornerEditHandles.jsx`); the block polygon itself; live drag (`buildChainBandsLive` @2537); land-use / block fill (the plug); `MeasureOverlay.jsx` (entire file); `m.measure[side]` schema.

**GENERALIZE (no behavior change):** `dilateRings` — add inward + `jtRound` support so it can do the inward `insideCurb` offset; default args preserve the curb call byte-identical.

**REWRITE — concentric-ring emission with per-fe sector attribution:** `silhouetteStraightEmitter` @1461 is **replaced**, not refactored. The new emitter:
1. Computes `depths_block` (sorted unique authored boundaries ∪ {0, W_block}) per block.
2. Builds one concentric `ring_i` per depth interval via `inset(blockRounded, cw + d_i) − inset(blockRounded, cw + d_{i+1})`.
3. Slices each ring parametrically on `blockRounded` into per-fe-sector arcs (literal-vert runs matched to fe.points) and per-corner-zone arcs (Bezier-vert spans, identified via `arcMeta`).
4. Attributes material to each arc per the §3 Step-2 table.

**Drops, by construction-not-defense:** the kink-split (`KINK_THRESHOLD_RAD = 5°`), the arcMeta-based per-run partition, the `pts.length < 2` skip. They were defenses against per-vertex-perp ballooning; we no longer per-vertex-perp anything. Also drops the `∩ insideCurb` clip mask (never built — rings are already inside-of-curb).

Consumes `fe.measure` + `fe.W_block` (baked at fe-construction by C1a), not `streets[fe.chainIdx].measure[fe.side]`. Drops `streets` from signature. The `fe.syntheticLanduseDepth` scalar baked in C1a is no longer consumed by the emitter (synthesis is implicit in the depth-band rule); leave it on `fe` as a debug-inspection convenience or drop in C5.

**Verify by band-entry count + corner-attribution + sector-coverage**, not by area:
- Every sidewalk-terminal fe contributes ≥1 ring slice per non-empty depth interval in its authored stack.
- Every corner-zone Bezier-span produces a concrete arc for every ring at depth `< W_block`.
- Per-fe sectors collectively cover every literal-vert run on `blockRounded`; no fe is skipped silently. Coping's two C0 stops (per-RUN partition skipping fes; per-vertex-perp self-intersecting on bendy fes) BOTH dissolve here because emission is not per-fe-polyline-shape-dependent.

**ADD:**
- `buildDepthBandRings(blockRounded, cw, depths_block)` @new — emits the stack of concentric `ring_i` polygons (one per depth interval). Uses the generalized `dilateRings` from C2.
- `sliceRingsByBlockRoundedSectors(rings, blockRounded, frontageEdges, arcMeta)` @new — for each ring, parametrically slices into per-fe-sector arcs + per-corner-zone arcs, returns tagged arc-polygons. Per-fe attribution joins by sharp-fe-vert proximity to `blockRounded` literal verts; **do NOT join by blockKey** ([[feedback_block_key_rounded_vs_sharp_diverges]]).
- `attributeMaterials(slicedArcs, fes)` @new — applies the §3 Step-2 attribution table; returns per-material per-LU keyed ring lists matching the existing consumer shape at `bake-ground.js:349`.

**REPLACE:** `buildFrontageBandsV2` @1607 (the per-vertex-perp pad — source of every §6.8/§6.9 defect) → replaced by per-corner-zone slices of the depth-band rings. The corner-pad emerges from the same construction; no separate emitter needed.

**RETIRE (delete in C5):** `buildFrontageBands` @1368 (already `// SUB-A retired`); `buildFrontageBandsV2` entirely; `PHASE2_*` constants; `KINK_THRESHOLD_RAD`; cusp-guard block; `RAMP_MIN_M`; `attributeFilletResidualToArcs` @1813 (corner attribution is native to the construction now).

---

## §6 Ordered, revertible commits

> The construction is *new*. C0 is a throwaway spike — *decide from a picture*.

**C0 — Spike (throwaway).** In a scratch read-only probe, on real `blockRounded` rings across the §9 reference IXs: compute `W_block` from `m.measure[side]`; build `depths_block`; build concentric `ring_i` via `inset(blockRounded, cw + d_i) − inset(blockRounded, cw + d_{i+1})`; slice each ring on `blockRounded` into per-fe-sector arcs + per-corner-zone arcs (using literal-vs-Bezier classification); attribute material per §3 Step-2 table; render bottom-up with curb cap last. **Confirm by eye AND by per-fe coverage table:**
- Outer edge concentric at every IX corner **by construction** (no curb-cap concealment needed).
- Lopsided IX (grass+sidewalk meeting sidewalk-only) reads cleanly; corner pad is concrete on both sides.
- Sharp-radius IX self-clips to a point without exploding (Clipper's native handling).
- Shallow-leg IX renders system-synthesized landuse in the deeper ring slices for that fe, reaching `cw + W_block` flush with the adjacent deeper sides.
- The `treelawn=0, sidewalk=W_side<W_block` configuration renders [concrete, grass] outward from the curb.
- **Per-fe coverage table** (the second hard verify): every sidewalk-terminal fe of every block contributes ≥1 ring slice per non-empty depth interval in its authored stack. Aggregate `fes_with_zero_slices` across 126 blocks must equal **0**. If non-zero, stop and surface — do not tune the spike to make the picture look clean.
- **Per-corner-zone coverage**: every corner Bezier-vert span produces a concrete arc per ring at depth `< W_block`.

Test radii from neutral up to `R > cw + W_block`. **Gate:** the picture passes AND the coverage tables are clean. No production edit; delete after.

**C1a — Re-land the stage wall + bake fe-side scalars.** Bake-only commit, no behavior change. At fe-construction in `buildFrontageEdges` @1045, resolve ONCE and bake onto each fe:
```
fe.measure = blockCustoms?.[fe.blockKey]?.[fe.edgeOrd]
          ?? streets[fe.chainIdx].measure[fe.side]
fe.W_block = max over the block's fes of (fe.measure.treelawn + fe.measure.sidewalk)
fe.syntheticLanduseDepth = max(0, fe.W_block − (fe.measure.treelawn + fe.measure.sidewalk))
```
Refactor `silhouetteStraightEmitter` signature to consume `fe.measure` + `fe.W_block` + `fe.syntheticLanduseDepth`; drop `streets` from signatures. **Verify:** byte-identical visible output to pre-C1a. Grep audit shows zero `streets` references inside ribbon/corner *emission* functions (radius kit is the sanctioned exception). Pure parameter-list refactor; revertible in isolation.

**C1b — Concentric-ring emission with per-fe sector attribution.** Replace `silhouetteStraightEmitter`'s arcMeta-partitioned per-run per-vertex-perp emission with the §3 construction: concentric depth-band rings sliced on `blockRounded` into per-fe-sector and per-corner-zone arcs, attributed per the §3 Step-2 table. Drop the kink-split, drop the arcMeta exclusion, drop the `pts.length < 2` skip — these were defenses against a per-vertex-perp ballooning failure mode that no longer exists. The new emitter does NOT touch `fe.points` as a polyline-spine; `fe.points` is consulted only to match literal verts on `blockRounded` for sector attribution (and even that uses coord-proximity, not blockKey — see [[feedback_block_key_rounded_vs_sharp_diverges]]). **New construction gated behind the C4 flag** — C1b lands the new emitter alongside the old, C4 cuts over. **Verify by per-fe coverage table (the hard verify):** every sidewalk-terminal fe of every block contributes ≥1 ring slice per non-empty depth interval; `fes_with_zero_slices` across 126 blocks = 0. Coping's two C0 stops (per-RUN partition skipping fes; per-vertex-perp self-intersecting on bendy fes) BOTH dissolve here because emission is not per-fe-polyline-shape-dependent. If any fe still emits zero, **stop and surface before C2** — do not tune around it.

**C2 — Generalize the offset kernel.** Add inward + `jtRound` support to `dilateRings`; default args preserve the curb call exactly. **Verify:** curb byte-identical.

**C3 — Wire up the new emitter behind a flag.** `buildDepthBandRings` + `sliceRingsByBlockRoundedSectors` + `attributeMaterials` (per §5) populated and feeding the chainless `frontageBands` consumer shape that `bake-ground.js:349` expects. Gate behind `opts.useConcentricEmitter`. **Verify (flag off):** baseline. **Verify (flag on):** per-fe per-depth ring slices route to per-LU correctly (landuse arcs key as `treelawn:<lu>` per their fe's parcel; concrete arcs key as `sidewalk`); per-corner-zone concrete arcs route as `cornerOrphanAsphalt`-style; aggregate area sanity-check against pre-flag baseline (similar order of magnitude, not byte-identical).

**C4 — Cutover.** Flip `useConcentricEmitter` default on. Retire `buildFrontageBandsV2` entirely (corner pad emerges from the new construction; no separate pad path). **Verify curb cap still renders last in the stack.** **Verify (operator-gated, on the corrected render):** all 4 corners of every IX go uniform and concentric **by construction** (§6.8/§6.9 closed); grass never wraps a corner (corner-zone arcs always concrete); shallow-leg fes show landuse in the deeper ring slices reaching `cw + W_block`; `treelawn=0` fes show [concrete, grass] outward from curb. Test Mississippi × Park, one grass-grass IX, one sidewalk-sidewalk IX, one lopsided IX, one sharp-radius IX, one long curved chain, one shallow-leg IX, one heavily-bendy long block (the `worst-leak` family that defeated both prior C0 attempts).

**C5 — Retire dead code + verify residual attribution.** Delete `buildFrontageBands`, the `PHASE2_*` constants, the cusp-guard block. **Test whether `attributeFilletResidualToArcs` is still needed** — the corner-pad-as-residual should naturally absorb asphalt-mouth noise; if visible asphalt orphan slivers remain at IX mouths, keep it; otherwise retire. **Verify:** asphalt mouths intact; build clean; no orphan refs.

**C6 — Re-validate authoring against the corrected render + docs.** With geometry right, confirm tools work unchanged: (a) block-polygon / width edit re-derives `W_block` + corner; (b) per-side `treelawn`/`sidewalk` handle drag re-emits at new widths AND adjusts synthetic landuse on shallower sides; (c) collapsing/re-inserting the treelawn divider behaves as today; (d) radius drags re-shape the corner; (e) curb width + Stage color edit. **Then update docs:** `RIBBONS.md` §6.8/§6.9 → RESOLVED, §6.10 → SUPERSEDED (point to this brief), §1 → "uniform width by authoring + system landuse synthesis; figure-ground corner pad; curb stroke caps." `NOTES.md` sub-entry. **MEMORY.md** — update `project_ribbon_corner_uniform_width.md` (drop the "per-vertex-perp + `consumed[]`" spine AND the morning rewrite's visible-scaffold spine; replace with the residual-of-insideCurb-minus-stripUnion spine + curb-as-cap + system-synthesized landuse). Update the STATE block.

---

## §7 Critical files
- `src/lib/buildBlockGeometryV2.js` — the construction. `buildFrontageEdges` @1045 = C1 bake site (`fe.measure`, `fe.W_block`, `fe.syntheticLanduseDepth`); `silhouetteStraightEmitter` @1461 = C4 clip + synthetic-strip site; `buildFrontageBandsV2` @1607 = C4 replacement target; `curbBands` @2349 = the cap layer (verify renders last).
- `cartograph/bake-ground.js` — consumer; per-parcel treelawn probe @349 is load-bearing (synthetic landuse routes through it identically); parcel-interior subtraction @381 unchanged.
- `src/cartograph/BlockGeometryV2Debug.jsx` — Designer consumer + verification surface.
- `src/cartograph/MeasureOverlay.jsx` — **unchanged this brief.**
- `cartograph/RIBBONS.md` §1 + §6.8/§6.9/§6.10 — update on close.

(z-fighting is unaffected by this work — `[[project_zfighting_known_cosmetic]]`.)

---

## §8 What was tried and ruled out (don't re-explore)

From the reverted 2026-05-27 arc, the 2026-05-28 morning rewrite, and earlier stages:

- **Per-vertex coord-match for origin-fe tagging** (C4.5b first attempt): shared-corner ambiguity + stencil-clipped verts → 25.6% tagging coverage; 75% emission drop.
- **Global-W pedBand + figure-ground residual at global W** (post-C5 `36d9ef2`): invented surface area the operator never authored; produced wide uniform cream bands ignoring per-leg authoring. *Note: this brief's residual is restricted to the inside-of-curb canvas and the strips include per-fe synthetic landuse, NOT a global W band — that is the difference.*
- **Per-vertex-perp arc-span emission at flanking-leg authored depth** (post-C5 `4509171`): structurally cleaner but inherits the per-leg square overshoot upstream.
- **Per-vertex-perp on full `blockRounded` with `consumed[]` extension** (§6.10's proposed path): correct in principle but unnecessary — `insideCurb` already provides the rounded curve without per-vertex authoring lookup at Bezier samples.
- **Visible `scaffold` polygon via two insets + difference** (2026-05-28 morning rewrite): invented a render-tree object the operator never asked for; reintroduced the "what is this new zone?" confusion. The scalar `W_block` + synthetic landuse strips do the job without any new polygon.
- **`innerFill`/`outerFill` + ctrl-click toggle UX** (2026-05-28 morning rewrite): operator-facing surface area for a problem the system can solve invisibly. Future-scope, not this brief.
- **Per-RUN partition emission** (current production design — arcMeta-based run-partition + `KINK_THRESHOLD_RAD = 5°` kink-split + `pts.length < 2` skip in `silhouetteStraightEmitter`): Coping's C0 redo #1 (2026-05-28 evening) found this leaves 2-of-4 fes on mississippi-park contributing **zero** straight-band entries — a production bug masked today by `buildFrontageBandsV2`'s corner pad covering the corners and land-use parcels plugging the gaps. **The prior 13-month arc's subtle wrongness traces to here** — every prior emission strategy inherited this coverage gap and explained the residual symptoms differently. Banked as [[feedback_silhouette_straight_emitter_skipped_fes]].
- **Per-fe per-vertex-perp on `fe.points` with `∩ insideCurb` clip** (path #1 of the C0 redo #2 surface, 2026-05-28 late evening): fixed mississippi-park but failed on ~12 long/bendy blocks. Per-vertex-perp on a 100+ vertex chain-bent polyline self-intersects so badly that Clipper's NonZero fill rule cancels enough overlapping windings that `∩ insideCurb` returns the empty set — 0 fes emit on `worst-leak` and the rest of the bendy-block family. The brief's earlier "ballooning neutralized by `∩ insideCurb`" claim only held for moderate self-intersection. Same fault family as the per-RUN partition (audited by per-fe band-entry count); banked into the same memory. Superseded by the concentric-ring construction (§3), which never builds a polygon whose validity depends on the spine being non-self-intersecting.
- **Walking `blockRounded` vertex-by-vertex to emit band shape** (Stage 8): Bezier consume-span absorbed interior fe vertices, ~30% of LS fes emitted nothing.
- **Stage 9 single-polygon symmetric corner pad** (`3cafe7f`): doctrine-correct shape but built per-arc not per-figure-ground; failed §6.9 input-prep variance.
- **Cusp guard / `RAMP_MIN_M = 1.5`** (Stage 10 audit): fires 0/666 — dead code under LS authoring; retire in C5.

---

## §9 Visible-result gate (what "shipped" means)

Not commit count. **Operator-eye confirmation on these IXs:**

1. Mississippi × Park (the §6.9 reference 4-corner IX).
2. One grass-grass IX (both flanking sides have authored treelawn).
3. One sidewalk-sidewalk IX (both flanking sides are concrete-only / treelawn=0).
4. One lopsided IX (treelawn+sidewalk meets sidewalk-only).
5. One sharp-radius IX (`insideCurb` self-clips to a point cleanly).
6. One long curved chain (no straight-run regression).
7. One shallow-leg IX (`W_side < W_block` on at least one flanking side; verify synthetic landuse pads it out to `W_block` cleanly, no visible concrete band leaking).
8. One `treelawn=0, sidewalk<W_block` fe (verify [concrete-then-grass] outward from curb is acceptable).

Concentric outer edge at every corner (curb-cap-guaranteed). No square overshoot. Per-side authored widths visible on straight runs. Synthetic landuse plugs shallow-leg residual without seams. Operator UX byte-identical to today. Pre-reshape blocks (existing data) render with the new uniform corners on first bake — no migration step.
