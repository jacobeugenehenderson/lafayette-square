# HANDOFF — Ribbon Corners (V1: corner construction, authoring unchanged)

**Status:** dispatch-ready, 2026-05-28 night. Final rewrite after four prior bounces. The construction below is the keystone from [[project_ribbon_corner_uniform_width]] applied to the existing pipeline; the surrounding machinery (data wall, polygon construction, per-LU routing, curb cap) is unchanged.

**Operator authoring is UNCHANGED in this brief.** `MeasureOverlay.jsx` not touched. `m.measure[side]` schema not touched.

**V1.5 (separate brief, deferred):** add a 3rd authored strip per leg + material assignment per strip. Out of scope here.

---

## §0 Read before §1

- `cartograph/RIBBONS.md §1` (the data wall — "chains end forever at bake; polygons are the surface") and `§6.10` (the actual bug + the mechanism that unblocks it).
- `/AGENT-VALIDATION-SURFACES.md` — **toy IS the spike surface.** The production code path runs on toy via `node cartograph/bake-ground.js` and renders live in Toy designer. Don't build scratch SVG / spike tooling; bake and look.
- `[[project_ribbon_corner_uniform_width]]` — the keystone memory. Read it; this brief restates it for the actual pipeline.

---

## §1 The goal

Fix the visible corner bug (§6.10): per-leg straight-only emission produces a square outer corner that overshoots `blockRounded`'s rounded silhouette, occluding any separate corner construction underneath. Replace it with a single per-vertex-perp walk of the full `blockRounded` ring (Bezier samples included) at region-aware depths, producing one sidewalk band + one LU band that wrap the curb cleanly through every corner.

No authoring change. No schema change. The visible result: ribbon hugs the curb all the way around; legs show their authored treelawn + sidewalk; corner zones show sidewalk material from curb to the deepest-adjacent-sidewalk depth, then LU material above up to the block's uniform outer extent.

---

## §2 The construction (walking the curb)

Walk `blockRounded` CCW. At each vertex, the ribbon extends perpendicular-inward from the curb. Two per-block scalars (computed once at fe-construction, baked onto `fe`):

```
W              = max over the block's legs of (cw + leg.treelawn + leg.sidewalk)
                 // uniform ribbon outer extent for this block

swCornerDepth  = per corner, max over the two flanking legs of (cw + leg.treelawn + leg.sidewalk)
                 // uniform sidewalk inner-edge depth for this corner
```

Both are scalars. Neither is a polygon. (The data wall: scalars cross the wall; chain pointers do not.)

**Per-vertex perp offset, region-aware:**

| Vertex type | Sidewalk inner-edge offset |
|---|---|
| Literal-vert in a leg | `cw + this leg's authored (treelawn + sidewalk)` |
| Bezier-vert in a corner span | `cw + this corner's swCornerDepth` |

Step transitions at tA/tB are honest polyline corners.

**Three polylines per block, two band polygons:**

- **Curb-edge polyline** — perp-offset by `cw` at every vertex.
- **Sidewalk inner-edge polyline** — perp-offset per the table above.
- **Ribbon outer-edge polyline** — perp-offset by `W` at every vertex.

- **Sidewalk-material band** = closed ring between curb-edge and sidewalk-inner-edge. Material = concrete.
- **LU-material band** = closed ring between sidewalk-inner-edge and ribbon outer-edge. Material = adjacent parcel's LU (per-LU routed via `bake-ground.js:349` probe).

**Per-leg treelawn** sits inside the sidewalk band on that leg's literal-vert run, between the curb edge and the leg's authored `cw + treelawn` boundary. It does NOT enter the corner zone — AASHTO doctrine: treelawn dissolves into sidewalk material at the corner ramp.

**The curb stroke cap** (`curbBands` @2349) renders last on top, unchanged. Decorative polish — the construction's ring outer edges are already concentric with the curb by being inset rings of `blockRounded`.

**Visible result by construction:**
- Outer edge of the ribbon is concentric with `blockRounded` at every corner.
- Where the per-leg authored stack is shallower than `W`: the LU band on that leg shows real width (LU material auto-fills up to `W`).
- Where two adjacent legs differ in sidewalk depth: the corner block's sidewalk extends to the max of the two; the shallower leg's sidewalk ends at its authored depth and abuts the corner block flush at tA/tB (no gap, no overshoot).
- No grass wraps a corner.

---

## §3 The §6.10 mechanism (the one load-bearing change)

For per-vertex-perp on Bezier samples to pick the right depth, each Bezier-sample vertex must know which corner span it belongs to and which two legs flank that span.

Today: `applyRoundCornersToRing` returns `{ring, arcMeta}` where `arcMeta[k]` is `{corner, R, arcPositionFrac}` for Bezier samples and `null` for literal verts. The `corner` identity is enough to pick the right `swCornerDepth` (computed per-corner from the two flanking legs).

The two flanking legs of a corner can be derived two ways — pick whichever costs less:
- **(a)** Walk `blockRounded` from the corner's Bezier span outward to find the next literal-vert runs in either direction; map those runs to their fes by literal-vert-coord proximity matching `fe.points` (NOT by `blockKey` — see [[feedback_block_key_rounded_vs_sharp_diverges]]).
- **(b)** Pre-compute per-Bezier-span flanking fes at fe-construction (in the same loop that bakes `fe.W`) and bake them onto a `cornerToFlankingFes` sidecar.

(b) is cleaner if it fits. The point: each Bezier sample needs to resolve to a `swCornerDepth` without coord-matching at emission time.

---

## §4 Code anchors

All file:line in `src/lib/buildBlockGeometryV2.js` unless noted.

**KEEP untouched:** figure-ground + curb rounding (`bezierReplaceCorner` @614, `applyRoundCornersToRing` @677, `blockSharp` @2197/2260, `blockRounded` @2294, `asphaltRounded` @2300); the 3-tier corner-radius authoring kit (`CornerEditHandles.jsx`); the block polygon itself; live drag (`buildChainBandsLive` @2537); land-use / block fill (the plug); `MeasureOverlay.jsx` (entire file); `m.measure[side]` schema; curb stroke (`dilateRings` @1853, `curbBands` @2349).

**GENERALIZE (no behavior change):** `dilateRings` — add inward + `jtRound` support if it doesn't already, so it can offset `blockRounded` inward for the ring construction. Default args preserve the curb call byte-identical.

**REPLACE (the actual work):**
- `silhouetteStraightEmitter` @1461 — replaced by the per-vertex-perp walk of the full `blockRounded` ring (literal AND Bezier verts).
- `buildFrontageBandsV2` @1607's arc-span pad path — replaced by the corner emission folded into the same walk (no separate emitter; same loop emits leg vertices and corner vertices, just with different depth picks).

**ADD:**
- `bakeFeScalars(streets, frontageEdges, ...)` @new — resolves `fe.measure` once, computes `fe.W` (per-block) and `fe.swCornerDepthAtTail` + `fe.swCornerDepthAtHead` (per-corner, from the two flanking-leg-of-this-corner fes). Drops `streets` from downstream emission signatures.
- `emitBlockRingBands(blockRoundedRing, arcMeta, frontageEdges, cw, fe-scalars)` @new — walks the ring, emits curb-edge / sidewalk-inner / ribbon-outer polylines, closes into two band polygons. Returns per-LU-keyed rings matching the existing `frontageBands` consumer shape (`bake-ground.js:349`).

**RETIRE (delete after C4 cutover):** `buildFrontageBands` @1368 (already `// SUB-A retired`); `buildFrontageBandsV2` entirely; `PHASE2_*` constants; `KINK_THRESHOLD_RAD`; cusp-guard block; `RAMP_MIN_M`; `attributeFilletResidualToArcs` @1813 (the new construction subsumes corner-pad-as-residual; verify in C5).

---

## §5 Commits

**C1 — Extend `applyRoundCornersToRing` to expose flanking-fes per corner span.** Pick (a) or (b) from §3. Returns the same `{ring, arcMeta}` plus the new sidecar. **Verify:** rounded ring byte-identical to pre-C1; sidecar populates per corner; cross-reference matches expected legs at known IXs (Mississippi × Park).

**C2 — Bake fe-scalars + signature wall.** New `bakeFeScalars` resolves `fe.measure = blockCustoms?.[fe.blockKey]?.[fe.edgeOrd] ?? streets[fe.chainIdx].measure[fe.side]` ONCE at fe-construction. Computes `fe.W`, `fe.swCornerDepthAtTail`, `fe.swCornerDepthAtHead`. Refactors `silhouetteStraightEmitter` and `buildFrontageBandsV2` signatures to consume `fe.*` only; drop `streets` from signatures. **Verify:** byte-identical visible output to pre-C2 (pure refactor); grep audit shows zero `streets` reads inside emission functions (radius kit is the sanctioned exception). Revertible in isolation.

**C3 — Generalize `dilateRings`** (inward + `jtRound`). Default args preserve curb byte-identical.

**C4 — New emitter behind flag, toy default on, LS default off.** `emitBlockRingBands` per §2 + §3 mechanism. Gate behind `opts.useRingBandEmitter` (or whatever the flag is named). For toy: pass `useRingBandEmitter: true` in `cartograph/bake-ground.js` scene-parametric path. For LS: leave off. **Bake toy. Open Toy designer.** Verify visually:
- Ribbon hugs the inside of `blockRounded`; outer edge concentric at every IX.
- Legs show authored treelawn + sidewalk widths cleanly along straight runs.
- Corner zones show sidewalk material from curb to the deepest-adjacent-sidewalk depth.
- Where adjacent legs differ in sidewalk depth: the corner block stays uniform at the deepest, the shallower leg's sidewalk meets it flush at tA/tB.
- No grass wraps a corner.
- Test on toy fixtures: 4+4 grid (symmetric baseline), HW3 saw-tooth (bendy chain), VW3 NE bend (gentle curve), Benton-toy teardrop, Waverly-toy couplet, dead-end stub.
- If any fixture renders wrong, **stop and surface** before C5. Don't tune around it.

**C5 — Cutover + delete dead code.** Flip `useRingBandEmitter` default on for LS too. Bake LS via `node cartograph/bake-ground.js`; visual gate at operator's eye. If clean: delete `buildFrontageBands`, `buildFrontageBandsV2`, `PHASE2_*` constants, `KINK_THRESHOLD_RAD`, `RAMP_MIN_M`, cusp-guard block. Test whether `attributeFilletResidualToArcs` is still needed — corner-pad-as-residual is now native to the emitter; if no orphan asphalt slivers appear at IX mouths, retire it.

**C6 — Docs.** `RIBBONS.md` §6.8 / §6.9 / §6.10 → RESOLVED, point to V1 as the closure. `NOTES.md` sub-entry. **MEMORY.md** — flag this brief as SHIPPED in the STATE block; update [[project_ribbon_corner_uniform_width]] with the actual landed construction.

---

## §6 Critical files

- `src/lib/buildBlockGeometryV2.js` — the construction. `buildFrontageEdges` @1045 = C2 bake site; `applyRoundCornersToRing` @677 = C1 extension site; `silhouetteStraightEmitter` @1461 + `buildFrontageBandsV2` @1607 = replaced by `emitBlockRingBands`.
- `cartograph/bake-ground.js` — scene-parametric flag wiring; consumer for new band rings (per-LU probe @349 unchanged in shape).
- `src/cartograph/BlockGeometryV2Debug.jsx` — Designer consumer + verification surface.
- `src/cartograph/MeasureOverlay.jsx` — **unchanged this brief.**
- `cartograph/RIBBONS.md` — update §6.8/§6.9/§6.10 at C6.

---

## §7 What's been tried and ruled out

Four prior brief rewrites in one day (2026-05-28) bolted on per-fe sector attribution, depth-band ring stacks, `W_block`-as-max-over-sides scalar, synthetic landuse strip emission code, material-attribution tables, sector slicing, "scaffold" polygons, ctrl-click fill toggles, scratch SVG spike tooling, per-vertex-perp on `fe.points` ∩ `insideCurb` clips. **All of it was machinery for operator-authored per-fe asymmetry the Measure tool can't reach.** Banked: [[feedback_boz_overengineered_for_imagined_authoring_complexity]].

Also ruled out (from RIBBONS.md §6.10 + prior arcs):
- **Per-RUN partition emission** (current production: arcMeta-based + 5° kink-split + `pts.length<2` skip in `silhouetteStraightEmitter`). Silently drops fes; 2-of-4 on mississippi-park emit zero today. Banked: [[feedback_silhouette_straight_emitter_skipped_fes]].
- **Per-vertex-perp on `fe.points` ∩ `insideCurb`** (the path that fixed mississippi-park but failed on bendy chains because Clipper NonZero fill cancels self-intersecting band polys → empty intersect).
- **Per-vertex coord-match for origin-fe tagging** (C4.5b first attempt, 25.6% coverage — shared-corner ambiguity + stencil-clipped verts).
- **Global-W pedBand + figure-ground residual at global W** (post-C5 `36d9ef2`) — invented surface area the operator never authored.
- **Per-vertex-perp arc-span emission at flanking-leg authored depth** (post-C5 `4509171`) — inherits per-leg square overshoot.
- **`blockLuAtPoint` smallest-area-containing** — workaround for parcel ambiguity that shouldn't exist if polygons are correctly constructed. Not a fix; ignore.

**Don't re-import any of the above.** If a §3-style construction sketch starts growing per-fe sector attribution, a `depths_block` array, or anything that asks "which fe owns this slice of the ring," stop. You've drifted off the keystone.

---

## §8 Validation gate (what "shipped" means)

Operator eye-confirmation on the toy bake first, then LS:

- Mississippi × Park (the §6.9 reference IX) — all 4 corners concentric, no grass wrap, sidewalk reaches max-adjacent depth at each corner.
- HW3 saw-tooth toy fixture — the bendy-chain case that defeated prior per-vertex-perp paths; should render clean by construction here (no Clipper NonZero failure mode, no self-intersection).
- Default 4+4 grid toy fixture — symmetric residential, the baseline case.
- One sharp-radius IX, one lopsided IX (different sidewalk depths on adjacent legs), one shallow-leg IX.

The visual rule of thumb: if it looks like a picture-frame mat around each block, with the mat staying smooth around every corner, you're done.

---

## §9 V1.5 (deferred, not in this brief)

Adds:
- 3rd authored strip per leg in `m.measure[side]` (width + material).
- Material assignment per strip (defaults preserve V1 behavior).
- One new handle per leg in `MeasureOverlay.jsx`.
- W's computation extends naturally to `cw + treelawn + sidewalk + strip3`; same formula, one term longer. Pre-V1.5 data renders byte-identical (strip3 defaults width=0, material='lu').

Don't bundle V1.5 here. V1 is "fix the corners on the current authoring"; V1.5 is "expose the latent per-strip material slot." Independent value; independent dispatch.

---

*One page on purpose. Don't elaborate.*
