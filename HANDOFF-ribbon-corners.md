# HANDOFF — Ribbon Corners (figure-ground via authored-strip union, curb caps it)

**Status:** draft for dispatch, 2026-05-28. Second rewrite after the 2026-05-27 revert (`ea0bed6`); supersedes the 2026-05-28 morning rewrite (uniform-W scaffold with visible scaffold polygon + ctrl-click fill toggle).
**Author:** Boz, 2026-05-28.
**Supersedes:** the prior `HANDOFF-ribbon-corners.md` (uniform-width arc, C0–C5 + 2 post-C5 attempts, reverted), the "per-vertex-perp on full `blockRounded` with `consumed[]`" path named in `RIBBONS.md §6.10`, AND the morning rewrite's `scaffold = inset(cw) − inset(cw + W_block)` construction. **Operator authoring surface is UNCHANGED in this brief** — same handles, same gestures, same `m.measure[side]` schema.

---

## §0 Pattern notes — read before §1

Two errors converged in the 2026-05-27 night, plus one more in the 2026-05-28 morning rewrite. The brief that ran said *"emitted per-leg"* without specifying **material per-leg, not shape per-leg** — the executor implemented shape-per-leg. The brief also invented vocabulary ("cream") for what is just concrete and grass. And the morning rewrite invented a *visible* "scaffold" polygon and a new fill-toggle UX, when in fact the scaffold is implicit (no polygon needs to exist) and the operator already authors the right thing today.

**Three tripwires for this brief:**

1. **First check when opening any emission rewrite: is the curve we need already computed elsewhere?** If yes, inset/intersect/difference from it. `blockRounded` already has Bezier-rounded corners. Stop reinventing.
2. **If you find yourself adding a new operator-facing UX surface, stop.** The operator already authors strips per side. The system reads the deepest one and fills the rest. The operator never sees the system's bookkeeping.
3. **If you find yourself emitting an intermediate "zone" or "scaffold" polygon as a render-tree object, stop.** The only polygons that emit are authored-or-synthetic strips, the corner-pad residual, and the curb stroke cap. `W_block` is a per-block *scalar*, not a polygon.

Two materials in the band between curb and property line: **concrete** (sidewalk) and **grass / land-use** (landuse showing through where the parcel reaches). That is the vocabulary.

---

## §1 The win

The 13-month corner dragon was always the **variable** offset — per-side depths → asymmetric corners → wedges → per-vertex-perp ballooning. Keystone:

> **The ribbon (curb → property line) is one uniform width all the way around a block.** Per-side variation lives only in the *material* (concrete vs grass), not in the width. Where the operator authored a *shallower* side, the **system synthesizes a landuse strip** to push that side's outer edge to the deepest authored line — invisible to the operator, who just sees grass.

With the inner ring uniform by construction, the corner is the figure-ground residual of (curb-side canvas − strip union) at the arc zones. No variable offset, no wedge, no per-corner joiner, no apex fillet, no per-vertex perp on Bezier samples, no `consumed[]` extension to `applyRoundCornersToRing`.

**The curb plays a dual role** that makes this robust:
- **Source:** `blockRounded` is the rounded silhouette we inset from to get the inside-of-curb canvas the strips live in.
- **Cap:** the curb stroke renders **last, on top of everything**, as one continuous Bézier-rounded line. Small seams between strips and the corner pad along the curb side are invisible because the cap covers them. The curb is the visible polish layer — its smoothness does not depend on the scaffolding logic underneath.

---

## §2 The polygon-only wall (sharpened)

`RIBBONS.md` §1 is canonical (its `FEATURES.md` cross-ref is stale): **chains end forever at bake; polygons are the surface.** Sharpened to two tripwires for this work:

> **(a)** After phase-1 polygon construction, if you are **reading or computing on a point or chain** during emission, you are doing the wrong thing.
>
> **(b)** If you are **emitting an intermediate polygon that is not** an authored-or-synthetic strip, the corner-pad residual, or the curb-stroke cap, you are doing the wrong thing.

Sanctioned exceptions to (a):
- Phase 1 itself (`blockSharp`, `blockRounded`, `frontageEdges`, corner records) — points/chains are the input here, by definition.
- The corner-radius authoring kit (`cornersAtIx`, `applyRoundCornersToRing`) — sealed, out of scope.
- Authoring-overlay handle lookup in `BlockGeometryV2Debug.jsx` (`chainSkelId`/`chainName`) — cross-reference for picking, not emitted geometry.

There are **no sanctioned exceptions to (b) inside this brief.** `W_block` exists only as a per-block scalar that drives synthetic-strip generation; the strips are polygons, the residual is a polygon, the curb cap is a polygon. Nothing else.

C4.5's wall enforcement was reverted with the 2026-05-27 arc. **C1 below re-lands it as the first commit.**

---

## §3 The construction — one inset, strip union, residual

Figure-ground is unchanged and load-bearing: **block = positive space**, `asphalt = stencil − blockRounded`, curb rounded via cubic Bézier on convex vertices. `blockRounded` is the curb silhouette (per-side curb position from `pavementHW`; rounded corners from the radius kit). **The curve we need already exists.** Everything below derives from it.

**Per block — one scalar, one offset, one union, one residual:**

```
W_block    = max over the four sides of (m.measure[side].treelawn + m.measure[side].sidewalk)
             // deepest authored outer edge, a scalar — NOT a polygon

insideCurb = inset(blockRounded, cw)
             // single inward offset; canvas the strips live in;
             // outer edge is concentric with the curb at every IX by construction
```

**Step 1 — per-fe strips: authored + synthetic.**

For each fe, build the authored strip rectangles at today's positions:

- treelawn rect at `[cw, cw + m.treelawn]`, fill = landuse (per-LU keying preserved)
- sidewalk rect at `[cw + m.treelawn, cw + m.treelawn + m.sidewalk]`, fill = concrete

Then, if `m.treelawn + m.sidewalk < W_block`, **synthesize one additional landuse strip** at `[cw + m.treelawn + m.sidewalk, cw + W_block]`, fill = landuse. It routes through the same per-LU keying as an authored landuse strip — the per-parcel grass probe at `bake-ground.js:349` does not need to distinguish authored from synthetic.

> **Honesty note:** when a fe has `treelawn = 0, sidewalk = W_side < W_block` (e.g. concrete sidewalk right against the curb), the synthetic landuse strip lands directly *outboard* of the concrete sidewalk — grass between sidewalk and property line. That's the right answer and matches shallow real-world blocks. The strip stack from curb outward becomes [concrete, grass]; perfectly legible. Do not second-guess and skip the synthesis.

Each strip is then intersected with `insideCurb` before emission. **This is the one-line §6.10 fix:** `intersectRings(rect, insideCurb)` clips any portion that would project past the rounded curb.

**Step 2 — the corner pad falls out as the figure-ground residual, clipped to the arc region.**

```
stripUnion     = unionRings([ all per-fe strip rects, each ∩ insideCurb ])
arcRegion      = the polygon covering only the corner zones, built from
                 blockRounded's arc spans (Bezier-sample runs in arcMeta)
                 extruded inward to depth (cw + W_block)
cornerPadRings = intersectRings(
                   differenceRings(insideCurb, stripUnion),
                   arcRegion
                 )
```

Per the operator-settled AASHTO/ADA doctrine (RIBBONS §6.9): the corner is **all-concrete (sidewalk material), uniform depth = W_block**. By construction, `cornerPadRings` is exactly the corner-region part of the canvas the strips did not cover. Its outer edge follows `blockRounded`'s Bezier-rounded arcs concentrically; its inner edge sits at `cw + W_block` because the synthetic landuse strips on shallow sides have already pushed every side's outer edge there. **No per-corner construction. No `consumed[]`. No per-vertex-perp on arc samples.** Material = concrete. Routed per-parcel via `cornerOrphanAsphalt`-style per-ring centroid probe.

**Why the arc-region clip matters:** straight-run portions of `insideCurb − stripUnion` are now empty by construction (synthetic strips filled them), but the `∩ arcRegion` clip stays as a safety belt against authored configurations the synthesis can't reach (e.g. degenerate fes). On the corners themselves, the residual is the pad. Straight-side land-use beyond the strip stack is handled, as today, by parcel construction at `bake-ground.js:381` (`parcelInteriors = block − curbBands − (treelawn ∪ sidewalk)` reaches to the property line, unchanged).

**Why grass never wraps a corner:** strip rectangles are stopped at the literal-vertex extent of each fe's straight run. The arc-region polygon excludes them by construction. Lopsided corners (grass-meets-concrete-only) render as material asymmetry approaching a still-symmetric concrete corner.

**Building `arcRegion`.** The corner-radius kit already marks arc samples via `arcMeta` (Bezier-sample verts have non-null `arcMeta[k]`). For each contiguous Bezier-sample run, take the run's polyline + a small lateral fade on each end (one or two literal verts) → polygonize inward to `cw + W_block` against `blockRounded`. Union of these polygons = `arcRegion`. **One sanctioned use of `arcMeta` for region delineation**, not for per-vertex emission. Note this is a polygon that does emit — but only as an intermediate clip mask, not into the render tree. Treat it as a transient. C0 spike verifies the construction visually.

**The curb stroke cap.** The existing curb-stroke band (`curbBands` @2349) renders on top of the strip stack and the corner pad. Because it's a single continuous stroke derived from `blockRounded`, it guarantees the visible outer edge is smooth and Bézier-rounded regardless of how the strips and pad meet underneath. **Do not move this layer.** Verify in C0/C4 that it still renders last in the stack.

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

**REWRITE — partition out, signature wall, per-fe emission:** `silhouetteStraightEmitter` @1461 — **drop the arcMeta-based run-partition, the kink-split (`KINK_THRESHOLD_RAD = 5°`), and the `pts.length < 2` skip.** They were defenses against per-vertex-perp ballooning that `∩ insideCurb` now neutralizes. Emit one rect per fe-strip over the full `fe.points` polyline, then `intersectRings(rect, insideCurb)` to clip ballooning back to the rounded canvas. Add synthetic landuse strip emission when `treelawn + sidewalk < W_block`. Consume `fe.measure` + `fe.W_block` + `fe.syntheticLanduseDepth` (baked at fe-construction by C1a), not `streets[fe.chainIdx].measure[fe.side]`. Drop `streets` from signature. **Verify by band-entry count, not by area:** every sidewalk-terminal fe of a block must contribute ≥1 straight-band entry. Coping's C0 redo (2026-05-28 evening) found 2-of-4 fes contributing zero on mississippi-park under the current per-run partition — a production bug masked today by `buildFrontageBandsV2`'s corner pad. The partition rewrite fixes it as a side-effect.

**ADD:**
- `buildInsideCurb(blockRounded, cw)` @new — one inward inset; returns one ring per block.
- `cornerPadFromResidual(insideCurb, stripUnion, arcRegion)` @new — one Clipper difference + one intersect; per-LU probe per ring.

**REPLACE:** `buildFrontageBandsV2` @1607 (the per-vertex-perp pad — source of every §6.8/§6.9 defect) → replaced by `cornerPadFromResidual`. Retire three-regime constants, cusp guard, `RAMP_MIN_M`.

**RETIRE (delete in C5):** `buildFrontageBands` @1368 (already `// SUB-A retired`); `buildFrontageBandsV2`'s pad emission; `PHASE2_*` constants; cusp-guard block; `attributeFilletResidualToArcs` @1813 (the corner-pad-as-residual now handles attribution naturally — verify in C5).

---

## §6 Ordered, revertible commits

> The construction is *new*. C0 is a throwaway spike — *decide from a picture*.

**C0 — Spike (throwaway).** In a scratch read-only probe, on one real `blockRounded` ring at Mississippi × Park: compute `W_block` from `m.measure[side]`; build `insideCurb` via one inward inset; emit authored + synthetic landuse strips per fe (each ∩ `insideCurb`); take `(insideCurb − stripUnion) ∩ arcRegion` for `cornerPadRings`. **Confirm by eye:**
- Outer edge concentric at every IX corner (curb cap covers any seam).
- Lopsided IX (grass+sidewalk meeting sidewalk-only) reads cleanly.
- Sharp-radius IX self-clips to a point without exploding (Clipper's native handling).
- Shallow-leg IX renders synthetic landuse outboard of the authored strips, reaching `cw + W_block`, with NO visible band of concrete projecting past the authored sidewalk.
- The `treelawn=0, sidewalk=W_side<W_block` configuration renders [concrete, grass] outward from the curb — confirm this is the desired look.

Test radii from neutral up to `R > cw + W_block`. **Gate:** the picture passes. No production edit; delete after.

**C1a — Re-land the stage wall + bake fe-side scalars.** Bake-only commit, no behavior change. At fe-construction in `buildFrontageEdges` @1045, resolve ONCE and bake onto each fe:
```
fe.measure = blockCustoms?.[fe.blockKey]?.[fe.edgeOrd]
          ?? streets[fe.chainIdx].measure[fe.side]
fe.W_block = max over the block's fes of (fe.measure.treelawn + fe.measure.sidewalk)
fe.syntheticLanduseDepth = max(0, fe.W_block − (fe.measure.treelawn + fe.measure.sidewalk))
```
Refactor `silhouetteStraightEmitter` signature to consume `fe.measure` + `fe.W_block` + `fe.syntheticLanduseDepth`; drop `streets` from signatures. **Verify:** byte-identical visible output to pre-C1a. Grep audit shows zero `streets` references inside ribbon/corner *emission* functions (radius kit is the sanctioned exception). Pure parameter-list refactor; revertible in isolation.

**C1b — Partition rewrite: per-fe emission over `fe.points`, `∩ insideCurb` clip.** Replace `silhouetteStraightEmitter`'s arcMeta-partitioned per-run emission with one rect per fe-strip over the full `fe.points` polyline. Drop the kink-split, drop the arcMeta exclusion, drop the `pts.length < 2` skip. Add `intersectRings(rect, insideCurb)` before every emit; this clip absorbs per-vertex-perp ballooning on chain bends. Add synthetic landuse strip emission for fes with `syntheticLanduseDepth > 0`. **Synthetic emission AND `∩ insideCurb` clip both gated behind the C4 flag** — C1b lands the partition shape, C4 turns on the new construction. **Verify by band-entry count:** every sidewalk-terminal fe of mississippi-park (and the §9 reference IXs) contributes ≥1 straight-band entry — South 18th and Mississippi Avenue join Park Avenue. Visible output may shift slightly on curved chain bends (per-fe vs per-run); should be cleaner not worse. If anything regresses visibly, surface before C2.

**C2 — Generalize the offset kernel.** Add inward + `jtRound` support to `dilateRings`; default args preserve the curb call exactly. **Verify:** curb byte-identical.

**C3 — New `insideCurb` + corner-pad emitters behind a flag.** `buildInsideCurb(blockRounded, cw)` returns the inside-curb ring. `cornerPadFromResidual(insideCurb, stripUnion, arcRegion)` returns `cornerPadRings`. Gate behind `opts.useResidualCorner`. Synthetic landuse strip emission in `silhouetteStraightEmitter` also gated behind the same flag. **Verify (flag off):** baseline. **Verify (flag on):** `insideCurb` + `cornerPadRings` populated; synthetic strips route correctly per-LU; per-LU probe routes correctly for both authored and synthetic landuse rings.

**C4 — Clip strip rectangles against `insideCurb`; cutover.** Inside `silhouetteStraightEmitter`'s per-fe rectangle emission, intersect each rectangle (authored + synthetic) against `insideCurb`. Flip `useResidualCorner` default on. Route `cornerPadRings` to the chainless `frontageBands` entry. Retire `buildFrontageBandsV2`'s pad path. **Verify curb cap still renders last in the stack.** **Verify (operator-gated, on the corrected render):** all 4 corners of every IX go uniform and concentric (§6.8/§6.9 closed); grass never wraps a corner; synthetic landuse plugs shallow-leg seamlessly. Test Mississippi × Park, one grass-grass IX, one sidewalk-sidewalk IX, one lopsided IX, one sharp-radius IX, one long curved chain, one shallow-leg IX.

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
- **Per-RUN partition emission** (current production design — arcMeta-based run-partition + `KINK_THRESHOLD_RAD = 5°` kink-split + `pts.length < 2` skip in `silhouetteStraightEmitter`): Coping's C0 redo (2026-05-28 evening) found this leaves 2-of-4 fes on mississippi-park contributing **zero** straight-band entries — a production bug masked today by `buildFrontageBandsV2`'s corner pad covering the corners and land-use parcels plugging the gaps. The partition's defenses were obsolete once `∩ insideCurb` is in play. C1b replaces it with per-fe emission over `fe.points` ∩ `insideCurb`. **The prior 13-month arc's subtle wrongness traces to here** — every prior emission strategy inherited this coverage gap and explained the residual symptoms differently.
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
