# HANDOFF — Ribbon Corners (the figure-ground corner-pad model)

**Status:** draft for dispatch, 2026-05-28. Post-revert (`ea0bed6`) rewrite of the 2026-05-27 HANDOFF.
**Author:** Boz, 2026-05-28.
**Supersedes:** `HANDOFF-ribbon-corners.md` (uniform-width arc, C0–C5 + 2 post-C5 attempts, reverted) AND the "per-vertex-perp on full blockRounded with `consumed[]`" path named in `RIBBONS.md §6.10`. The reframe replaces both. Authoring surface (handles, lines, schema slots) is **repurposed in place** — the geometry the operator authors today is exactly the geometry this brief needs; only the *meaning* of two field names shifts.

---

## §0 Pattern note — read before §1

Two errors converged in the 2026-05-27 night. The brief that ran said *"emitted per-leg"* without specifying **material per-leg, not shape per-leg** — the executor implemented shape-per-leg. That single ambiguity was the entire night. The brief also invented vocabulary ("cream") for what is just concrete and grass — abstractions hid the simple thing.

**First check when opening any emission rewrite: is the curve we need already computed elsewhere?** If yes, inset/intersect/difference from it. The curb already exists; `blockRounded` already has Bezier-rounded corners. Stop reinventing.

Two materials in the band between curb and property line: **concrete** (sidewalk) and **grass** (landuse showing through). That is the vocabulary. Per-side authoring picks which strip is which at what width — those handles already exist and stay exactly where they are.

---

## §1 The win

The 13-month corner dragon was always the **variable** offset — per-side depths → asymmetric corners → wedges → per-vertex-perp ballooning. Keystone:

> **The ribbon (curb → property line) is one uniform width all the way around a block.** Per-side variation lives only in the *material* (concrete vs grass), not in the width. **Land-use fill plugs the per-side scaffold remainder**, so the viewer never sees the scaffolding.

With width uniform, the corner is a **single inward offset of the curb silhouette** — concentric, degenerating honestly with the authored radius. A point at neutral, an arc when radius opens past `cw + W`, self-clipped when sharp (Clipper's native self-intersection handling). No variable offset, no wedge, no per-corner joiner, no apex fillet, no per-vertex perp on Bezier samples, no `consumed[]` extension to `applyRoundCornersToRing`.

---

## §2 The polygon-only barrier (the stage-wall doctrine)

`RIBBONS.md` §1 is canonical (its `FEATURES.md` cross-ref is stale): **chains end forever at bake; polygons are the surface.** Inside `buildBlockGeometryV2.js`:

1. **Polygon construction is phase 1** — `blockSharp`, `blockRounded`, `frontageEdges`, corner records. Chains are consulted *only here*.
2. **After phase 1, emission consumes only polygon-side data.** `fe.measure` is baked at fe-construction; **no emission function takes `streets` as a parameter**.

**Sanctioned exceptions:** `cornersAtIx` + `applyRoundCornersToRing` (corner-radius authoring kit — out of scope, do not touch); authoring-overlay reads in `BlockGeometryV2Debug.jsx` (`chainSkelId`/`chainName` for handle lookup) — wall is about *emitted geometry*, not authoring cross-reference.

C4.5's wall enforcement was reverted with the 2026-05-27 arc. **C1 below re-lands it as the first commit**, not as an afterthought.

---

## §3 The construction — three Clipper ops, no vertex walking

Figure-ground is unchanged and load-bearing: **block = positive space**, `asphalt = stencil − blockRounded`, curb rounded via cubic Bézier on convex vertices. `blockRounded` is the curb silhouette (per-side curb position from `pavementHW`; rounded corners from the radius kit). **The curve we need already exists.** Everything below derives from it.

**Per block:**

```
W_side  = m.treelawn + m.sidewalk                      // per-side authored band depth
W_block = max(W_side) over the block's four sides       // the uniform scaffold depth

scaffold = differenceRings(
             inset(blockRounded, cw),                   // band's outer (curb-side) edge
             inset(blockRounded, cw + W_block)          // band's inner (property-line) edge
           )                                            // one ring per block; outer edge is rounded by construction
```

Two uniform inward Clipper offsets + one difference. **The outer edge of `scaffold` is concentric with the curb at every IX corner** because `blockRounded` was already rounded. No partition, no Bezier-sample emission.

**Step 1 — clip the per-side rectangles against `scaffold`.**

The existing per-side rectangle emission (currently `silhouetteStraightEmitter`) stays structurally as today: for each fe, build the treelawn rectangle at `[cw, cw + m.treelawn]` and the sidewalk rectangle at `[cw + m.treelawn, cw + m.treelawn + m.sidewalk]`, both running the length of the fe. The §6.10 square-overshoot is fixed in one line: **`intersectRings(rect, scaffold)` before emission**, so any portion that would project past the rounded curb is clipped off by the scaffold's rounded outer boundary.

Per-side authoring semantics preserved verbatim. Per-LU routing at `bake-ground.js:349` continues to probe per-fe `treelawnRings[0]` and key as `treelawn:<lu>` — unchanged.

**Step 2 — the corner pad falls out as the scaffold's figure-ground residual, clipped to the arc region.**

```
straightStripUnion = unionRings([ all per-side strip rects (both strips, both fills),
                                  each clipped to scaffold ])
arcRegion          = the polygon covering only the corner zones, built from
                     blockRounded's arc spans (Bezier-sample runs in arcMeta)
                     extruded inward to depth (cw + W_block)
cornerPadRings     = intersectRings(
                       differenceRings(scaffold, straightStripUnion),
                       arcRegion
                     )
```

Per the operator-settled AASHTO/ADA doctrine (RIBBONS §6.9): the corner is **all-concrete (sidewalk material), uniform depth = W_block**. By construction, `cornerPadRings` is exactly the corner-region part of the scaffold the per-side strips did not cover. Its outer edge follows `blockRounded`'s Bezier-rounded arcs concentrically; its inner edge sits at `cw + W_block`. **No per-corner construction. No `consumed[]`. No per-vertex-perp on arc samples.** Material = concrete. Routed per-parcel via `cornerOrphanAsphalt`-style per-ring centroid probe.

**Why the arc-region clip matters:** on a shallow leg (W_side < W_block), the per-side strips cover only to `cw + W_side`; the strip from `cw + W_side` to `cw + W_block` sits in `scaffold − straightStripUnion`. Without the `∩ arcRegion` clip, that residual would run the full length of the straight side and render as a visible concrete band. Clipping to `arcRegion` drops the straight-run residual; only the corner zone emits as pad. The straight-run portion between `cw + W_side` and `cw + W_block` is then handled by existing parcel construction (`bake-ground.js:381` `parcelInteriors = block − curbBands − (treelawn ∪ sidewalk)` reaches to the per-side authored boundary, unchanged) — the parcel polygon covers it as land-use, satisfying "land-use plugs the remainder."

**Why grass never enters the corner:** grass strips are independent rectangles, stopped at the literal-vertex extent of each fe's straight run. The arc-region polygon excludes them by construction. Lopsided corners (grass-meets-concrete-only) render as material asymmetry approaching a still-symmetric concrete corner.

**Building `arcRegion`.** The corner-radius kit already marks arc samples via `arcMeta` (Bezier-sample verts have non-null `arcMeta[k]`). For each contiguous Bezier-sample run, take the run's polyline + a small lateral fade on each end (one or two literal verts) → polygonize inward to `cw + W_block` against `blockRounded`. Union of these polygons = `arcRegion`. **One sanctioned use of `arcMeta` for region delineation**, not for per-vertex emission. C0 spike verifies the construction visually.

---

## §4 Authoring — repurposed in place

The existing per-side authoring already draws the right lines in the right places. The reshape is a **relabel + one new gesture**, NOT a new UX surface.

**The lines stay.** Two handles per side: `pavementHW` (curb edge) and `treelawnOuter` (the **divider** between the two ped-band strips). The outer edge of the second strip is the property line, implied by `pavementHW + strip1 + strip2`. These three positions are exactly the geometry the operator needs to author the cross-section. The handles' wiring (`MeasureOverlay.jsx` @491/542) stays byte-for-byte.

**The schema is relabeled.** `m.measure[side] = {pavementHW, treelawn, sidewalk, terminal}` is reinterpreted as:
- `treelawn` width → **inner strip width** (curb-adjacent slot).
- `sidewalk` width → **outer strip width** (property-adjacent slot).
- ADD: `innerFill ∈ {'concrete','landuse'}` (default `'landuse'`, matching legacy treelawn=grass behavior).
- ADD: `outerFill ∈ {'concrete','landuse'}` (default `'concrete'`, matching legacy sidewalk).

**Defaults reproduce today's behavior exactly.** Legacy `{treelawn, sidewalk}` reads back as `{innerStrip=grass, outerStrip=concrete}` — pre-reshape blocks render identically until an operator toggles a fill.

**The new gesture: ctrl-click toggles a strip's fill.** Click cycles between concrete and landuse. Implementation: one event handler addition in the strip-render path; no new chrome, no new panels. If event capture turns out to fight the existing drag handlers in C-Reshape, the fallback is a fill toggle next to the divider handle — still no new surface, just a marker.

**Per-LU routing follows the fill, not the slot.** `bake-ground.js:349` currently keys per-fe `treelawnRings` to `treelawn:<lu>`. The keying shifts to **per-strip per-fill**: strips with `fill='landuse'` → `treelawn:<lu>` (per-parcel grass routing preserved); strips with `fill='concrete'` → `sidewalk` (or `sidewalk:<lu>` if needed — verify in C0 against the Designer consumer). "Treelawn" as a special material dissolves: it's just a landuse-filled strip.

**Consumer contract preserved at the field level.** Per-leg per-fe output stays `{ stripRings: [...], asphaltRings }` where each strip ring carries its fill tag, plus `cornerOrphanAsphalt` + `cornerPadRings`. If touching the field names risks ripple, keep `treelawnRings` / `sidewalkRings` as the field names and let *fill* (carried alongside) drive routing — the name becomes legacy but harmless. **Pick the field-shape call in C0 by reading both consumers (`bake-ground.js:347–364`, `BlockGeometryV2Debug.jsx:512–592`) and noting which costs less to rename.**

**Untouched in this brief:** corner-radius authoring kit; curb stroke + curb width authoring; live drag (`buildChainBandsLive`); `blockCustoms[blockKey][edgeOrd]` keying; the block polygon itself.

---

## §5 Code anchors (verified)

All file:line in `src/lib/buildBlockGeometryV2.js` unless noted.

**KEEP untouched:** figure-ground + curb rounding (`bezierReplaceCorner` @614, `applyRoundCornersToRing` @677, `blockSharp` @2197/2260, `blockRounded` @2294, `asphaltRounded` @2300); curb stroke (`dilateRings` @1853, `curbBands` @2349); the 3-tier corner-radius authoring kit (`CornerEditHandles.jsx`); the block polygon itself; live drag (`buildChainBandsLive` @2537); land-use / block fill (the plug); `MeasureOverlay.jsx` handle wiring; `m.measure[side]` schema.

**GENERALIZE (no behavior change):** `dilateRings` — add inward + `jtRound` support so it can do the inward scaffold offsets; default args preserve the curb call byte-identical.

**REFACTOR — same algorithm, signature wall:** `silhouetteStraightEmitter` @1461 — keep its run-partition + per-side rectangle emission. **Add `intersectRings(rect, scaffold)` before emission** (the §6.10 fix). Consume `fe.measure` (baked at fe-construction by C1), not `streets[fe.chainIdx].measure[fe.side]`. Drop `streets` from signature.

**ADD:** `buildPedScaffold(blockRounded, cw, W_block)` @new — two inward insets + one difference; returns one scaffold ring per block. `cornerPadFromResidual(scaffold, straightSidewalkUnion)` @new — one Clipper difference; per-LU probe per ring.

**REPLACE:** `buildFrontageBandsV2` @1607 (the per-vertex-perp pad — source of every §6.8/§6.9 defect) → replaced by `cornerPadFromResidual`. Retire three-regime constants, cusp guard, `RAMP_MIN_M`.

**RETIRE (delete in C5):** `buildFrontageBands` @1368 (already `// SUB-A retired`); `buildFrontageBandsV2`'s pad emission; `PHASE2_*` constants; cusp-guard block; `attributeFilletResidualToArcs` @1813 (the corner-pad-as-residual now handles attribution naturally — verify in C5).

---

## §6 Ordered, revertible commits

> The construction is *new*. C0 is a throwaway spike — *decide from a picture*.

**C0 — Spike (throwaway).** In a scratch read-only probe, build `scaffold` via two inward insets + difference on one real `blockRounded` ring at Mississippi × Park. Build the per-side sidewalk rectangles (current emission) intersected with `scaffold`. Subtract their union from `scaffold` → `cornerPadRings`. **Confirm by eye:** outer edge concentric at every IX corner; lopsided IX (grass+sidewalk meeting sidewalk-only) reads cleanly; sharp-radius IX self-clips to a point without exploding. Test radii from neutral up to `R > cw + W_block`. **Gate:** the picture passes. No production edit; delete after.

**C1 — Re-land the stage wall (C4.5).** At fe-construction in `buildFrontageEdges` @1045, resolve ONCE and bake onto fe:
```
fe.measure = blockCustoms?.[fe.blockKey]?.[fe.edgeOrd]
          ?? streets[fe.chainIdx].measure[fe.side]
```
Refactor `silhouetteStraightEmitter` to consume `fe.measure` and drop `streets` from signatures. **Verify:** byte-identical visible output to pre-C1; grep audit shows zero `streets` references inside ribbon/corner *emission* functions (radius kit is the sanctioned exception). Pure parameter-list refactor; revertible.

**C2 — Generalize the offset kernel.** Add inward + `jtRound` support to `dilateRings`; default args preserve the curb call exactly. **Verify:** curb byte-identical.

**C3 — New scaffold + corner-pad emitters behind a flag.** `buildPedScaffold(blockRounded, cw, W_block)` returns the scaffold ring. `cornerPadFromResidual(scaffold, straightSidewalkUnion)` returns `cornerPadRings`. Gate behind `opts.useScaffoldCorner`. **Verify (flag off):** baseline. **Verify (flag on):** scaffold + cornerPadRings populated; per-LU probe routes correctly.

**C4 — Clip straight rectangles against scaffold; cutover.** Inside `silhouetteStraightEmitter`'s per-fe rectangle emission, intersect each rectangle against `scaffold`. Flip `useScaffoldCorner` default on. Route `cornerPadRings` to the chainless `frontageBands` entry. Retire `buildFrontageBandsV2`'s pad path. **Verify (operator-gated, on the corrected render):** all 4 corners of every IX go uniform and concentric (§6.8/§6.9 closed); grass never wraps a corner; land-use parcel polygons plug shallow-leg residual on straight runs cleanly. Test Mississippi × Park (the §6.9 reference IX), one grass-grass IX, one sidewalk-sidewalk IX, one lopsided IX, one sharp-radius IX, one long curved chain.

**C4.5 — Authoring reshape via repurposing (§4).** Add `innerFill`/`outerFill` to `m.measure[side]` with legacy-matching defaults. Add ctrl-click toggle in the strip-render path of `MeasureOverlay.jsx`. Route per-strip emission in `silhouetteStraightEmitter` by fill (concrete strips → sidewalk-keyed, landuse strips → treelawn-keyed for per-LU probe). **Verify:** pre-reshape blocks render byte-identical (defaults preserve legacy); ctrl-click on a strip flips its material in Designer + Stage; per-LU grass routing still picks up the adjacent parcel for landuse-filled strips. **If repurposing the existing handles fights the wiring** (e.g., ctrl-click capture conflict), fall back to a small fill marker beside the divider handle — note the fallback in commit body, do not invent a panel.

**C5 — Retire dead code + verify residual attribution.** Delete `buildFrontageBands`, the `PHASE2_*` constants, the cusp-guard block. **Test whether `attributeFilletResidualToArcs` is still needed** — the corner-pad-as-residual should naturally absorb asphalt-mouth noise; if visible asphalt orphan slivers remain at IX mouths, keep it; otherwise retire. **Verify:** asphalt mouths intact; build clean; no orphan refs.

**C6 — Re-validate authoring against the corrected render.** With geometry right, confirm tools work: (a) block-polygon / width edit re-derives scaffold + corner; (b) per-side `treelawn`/`sidewalk` handle drag re-emits at new widths; (c) radius drags re-shape the corner; (d) curb width + Stage color edit. **Then update docs:** `RIBBONS.md` §6.8/§6.9 → RESOLVED, §6.10 → SUPERSEDED (point to this brief), §1 → uniform-width scaffold + figure-ground corner pad. `NOTES.md` sub-entry. **MEMORY.md** — update `project_ribbon_corner_uniform_width.md` (drop the "per-vertex-perp + `consumed[]`" spine; replace with the figure-ground-residual spine). Update the STATE block.

---

## §7 Critical files
- `src/lib/buildBlockGeometryV2.js` — the construction. `buildFrontageEdges` @1045 = C1 bake site; `silhouetteStraightEmitter` @1461 = C4 clip site; `buildFrontageBandsV2` @1607 = C4 replacement target.
- `cartograph/bake-ground.js` — consumer; per-parcel treelawn probe @349 is load-bearing; parcel-interior subtraction @381 plugs shallow-leg residual unchanged.
- `src/cartograph/BlockGeometryV2Debug.jsx` — Designer consumer + verification surface.
- `src/cartograph/MeasureOverlay.jsx` — handles + `blockCustoms` writes (unchanged this brief; verified in C6).
- `cartograph/RIBBONS.md` §1 + §6.8/§6.9/§6.10 — update on close.

(z-fighting is unaffected by this work — `[[project_zfighting_known_cosmetic]]`.)

---

## §8 What was tried and ruled out (don't re-explore)

From the reverted 2026-05-27 arc and earlier stages:

- **Per-vertex coord-match for origin-fe tagging** (C4.5b first attempt): shared-corner ambiguity + stencil-clipped verts → 25.6% tagging coverage; 75% emission drop.
- **Global-W pedBand + figure-ground residual at global W** (post-C5 `36d9ef2`): invented surface area the operator never authored; produced wide uniform cream bands ignoring per-leg authoring. *Note: this brief's residual is restricted to the scaffold, NOT global — that is the difference.*
- **Per-vertex-perp arc-span emission at flanking-leg authored depth** (post-C5 `4509171`): structurally cleaner but inherits the per-leg square overshoot upstream.
- **Per-vertex-perp on full blockRounded with `consumed[]` extension** (§6.10's proposed path): correct in principle but unnecessary — the scaffold already provides the rounded curve without per-vertex authoring lookup at Bezier samples.
- **Walking `blockRounded` vertex-by-vertex to emit band shape** (Stage 8): Bezier consume-span absorbed interior fe vertices, ~30% of LS fes emitted nothing.
- **Stage 9 single-polygon symmetric corner pad** (`3cafe7f`): doctrine-correct shape but built per-arc not per-figure-ground; failed §6.9 input-prep variance.
- **Cusp guard / `RAMP_MIN_M = 1.5`** (Stage 10 audit): fires 0/666 — dead code under LS authoring; retire in C5.

---

## §9 Visible-result gate (what "shipped" means)

Not commit count. **Operator-eye confirmation on these IXs:**

1. Mississippi × Park (the §6.9 reference 4-corner IX).
2. One grass-grass IX (both flanking sides have authored landuse-inner).
3. One sidewalk-sidewalk IX (both flanking sides are concrete-only).
4. One lopsided IX (landuse-inner+concrete-outer meets concrete-only).
5. One sharp-radius IX (scaffold self-clips to a point cleanly).
6. One long curved chain (no straight-run regression).
7. One shallow-leg IX (W_side < W_block on at least one flanking side; verify no straight-run concrete band leaks between `cw + W_side` and `cw + W_block`).
8. After C4.5: ctrl-click toggles a strip's fill in Designer + Stage; per-LU grass routing follows the fill.

Concentric outer edge at every corner. No square overshoot. Per-side authored widths visible on straight runs. Land-use plugs shallow-leg residual without seams. Pre-reshape blocks (legacy data) render byte-identical until ctrl-click.
