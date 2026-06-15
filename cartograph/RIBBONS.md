# Ribbons & Corners — canonical reference

**Status: v0.9 (2026-05-31) — living doc.** This is the central reference for the ribbon + corner system. It evolves every session until the corner problem is closed. (v0.9: §5 measure-tool model updated for V2-Measure polygon-only authoring; §6.8 / §6.9 / §6.10 marked RESOLVED by V1 keystone with historical context preserved; §7 history table appended with V1 keystone, V1.5 swap, V2-Measure, V1.6 entries. v0.8: §3.9 reworked to document the live **dual-emitter** state — the mono-width ring-band keystone on toy + the legacy per-leg split on LS — and the §1 status note brought current with the post-revert rebuild.) **(2026-06-12: Diary winnowed — §6 RESOLVED modes 6.1/6.2/6.8/6.9/6.10 + the §7 History table migrated to `_archive/RIBBONS-history-2026-06-12.md`; live doctrine + open modes retained.)**

> Part of the cartograph quintet alongside `FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`. **Read this before any geometry / corner / curb / intersection / ribbon work.** Most regressions in this repo trace to someone re-deriving a points-and-chains framing for a problem this system already answers. The doctrine in §1 is load-bearing. The pipeline walkthrough in §3 is the implementation. The failure-mode inventory in §6 is the live front of the work.
>
> Pointed at from: FEATURES.md (doctrine section replaced by pointer), ARCHITECTURE.md (helper map), BACKLOG.md (every ribbon/corner phase), NOTES.md (recent sub-entries cite this doc for the doctrine, carry only iteration archeology themselves).

---

## §0. Scope + how to use this doc

**This doc covers:** the ribbon cross-section (asphalt / curb / treelawn / sidewalk), the corner wrap at every IX, the block polygon as authoring substrate, the bake's flattening to slab, and the Designer/Stage/Preview render side that consumes them. It covers V2 — the rounded-block-clip regime that supersedes V1's per-corner-primitive stack (retired in `0286cb1`).

**This doc does not cover:** survey/centerline derivation (`SKELETON.md` + skeleton.js), Stage look authoring (FEATURES §"The three operator environments" → Stage; knobs in OPERATIONS), Preview QA (`PREVIEW.md`), Arborist tree atlas, Meteorologist clouds.

**How to use it:**
- New session, touching ribbons or corners → read §1 (regime) + §6 (active failure modes) first. Skim §2-§5 as needed.
- Implementing a phase → read §3 for the relevant function, §6 for the failure mode it addresses, §7 for what was tried and didn't work.
- Closing an arc → update §6 (move from "live" to "closed"), update §7 (add the lesson), bump version line at top.

**Don't re-derive from code or memory.** Code drifts faster than doctrine; memory is point-in-time. If §3's pipeline narrative conflicts with the code, the code probably moved — flag it and update this doc.

---

## §1. The regime, in plain words

> ⚠️ **2026-06-01 — SUPERSEDED IN PROGRESS by the TILE model (the re-pour).** The figure-ground / mono-width regime this doc describes is being **replaced** by the tile construction: *tiles = faces of the centerline graph; the centerlines are the grout; strips are painted INWARD per tile; the corner is the inward-offset, never a figure-ground residual.* **LS now runs tiles, unflagged** (`src/lib/tileGround.js`); figure-ground (`buildBlockGeometryV2`) is **dead-in-place**, deleted at **T4**. **The live State is [`HANDOFF-tile-feature-ledger.md`](../HANDOFF-tile-feature-ledger.md)** (the dense point-cloud; the umbrella `pipeline-reconception` brief was retired to git, live state in `BACKLOG.md`). **This doc's full rewrite — §1 regime, §3 pipeline, §6.8/6.9/6.10 honest-close — lands at T4** (figure-ground deletion). Until then, the figure-ground prose below is historical-but-still-in-code; **read the ledger for the live construction.** (And note: **§6.8/6.9/6.10's "RESOLVED" is false** — resolved on toy's mono-width, *never true on LS*; superseded by tiles. The corner that "dogged figure-ground for 13 months" is solved by the tile model, not by the keystone those entries credit.)

> ⭐ **INVARIANTS THAT SURVIVE THE REWRITE (read before touching tile corners).** The *emitter mechanics* below are superseded; these *corner principles* are substrate-independent and **bind the tile construction too** — they are NOT figure-ground-only. Building against them is mandatory; if your construction can't honor one, stop and flag Boz rather than improvising a parallel mechanism:
> 1. **The corner is the band BENT around the arc** — a slice of the same continuous concentric offsets — **never a separately-constructed primitive** (no per-corner pad, no per-vertex fillet *as the corner*). §3.9a.
> 2. **Concentric ped-band offsets use `jtMiter`, never `jtRound`** — jtMiter inherits an already-rounded ring's arcs as concentric nested arcs AND passes operator-authored R=0 squares through sharp; jtRound re-rounds every corner by radius=depth (a second rounding mechanism) and corrupts squares. §3.9a step 7. *(This was the 2026-06-02 tile divergence: `tileGround.offsetRings` used `jtRound`; fixed to `jtMiter` — see `feedback_consult_ribbons_canon_before_constructing`. The curb silhouette is still rounded once by `filletRing`, which is the legit single rounding analogous to `applyRoundCornersToRing`; the bands now jtMiter-inherit it.)*
> 3. **The ADA corner pad is a band-slice**, not predicated on the arc — so it works square OR round.
> 4. **Mono-width** per block/run, not per-leg stitched.

> **2026-05-30 status note (supersedes the 2026-05-27→28 revert note).** The uniform-width arc was first attempted (C0–C5 + two post-C5 buildPedBand attempts) and REVERTED (`ea0bed6`) after the operator visual gate failed at every IX corner. It was then **rebuilt cleaner** as the **mono-width ring-band emitter** (`emitBlockRingBands` → `emitOneBlockRingBands`) and **shipped on toy 2026-05-29** (Quoin's session): three uniform inward Clipper offsets of `blockRounded` (`cw` / `cw+TL` / `WB`) → 2 strips + sector slicing, with `jtMiter` (preserves operator R=0 squares), R=0 authorable, the per-block capacity guard, and the V1.5 per-leg material swap all landed. **The mono-width model now IS the doctrine below** — §3.9a documents it. **LS still runs the legacy per-leg split** (`silhouetteStraightEmitter` + `buildFrontageBandsV2`, §3.9b) until the **C5 cutover** flips `useRingBandEmitter` (`scene === 'toy'` today). The earlier "not implementable on a rounded silhouette" conclusion was wrong: the missing piece was *round the block first, offset the polygon* — exactly what the keystone does.

### The model in one sentence

**Blocks are positive space; streets are the void around them; everything visible at street level — asphalt, curb, sidewalk, treelawn, corner mouths — is a property of the block polygons' silhouettes, not of the chain centerlines that derive them.**

> ⭐ **THE DERIVATION CHAIN — the centerline is the root source (FUNDAMENTAL; 2026-06-14, Jacob).** Everything the operator sees is a **pure derivation of the centerline**, in strict order: **centerline → polygon (curb/tile) → ribbon (asphalt · curb · treelawn · sidewalk)**. The sentence above is correct that the ribbon reads off the *polygon* — but the polygon is *itself* nothing but the centerline's concentric offset, so the **centerline is the ROOT**; the polygon is the proximate substrate, not the origin. Two consequences bind every fix:
>
> 1. **The polygon is BOTH the geometry source AND the identity source.** The ribbon reads off the polygon not just *where the edges are* but *what they mean*: **"what is a straight leg?"** (a maximal run of same-street edges — `groupRuns`), **"what is a corner?"** (a run seam / sharp vertex — `vertR`/`filletRing`), and **"according to the data, is this treelawn or sidewalk?"** (the per-frontage material — `gleanTreelawn`). So a rough centerline corrupts not only the *shape* but the *identity*: facet vertices get misread as corners (each taking a fillet → lumps), one frontage shatters across facet-edges, the material assignment fragments. **A broken sidewalk at a faceted curve is an identity failure, not only a geometry one.**
> 2. **Fix at the centerline, FIRST, and at its source.** Because the polygon and the ribbon are *derivations*, any defect in either originates upstream. Patching the polygon — or the ribbon/sidewalk/treelawn — while the centerline is rough is **a confusing waste**: you are editing a shadow. ⛔ **Diagnostic corollary:** if you change something and the *polygon moves but the centerline does not*, you are at the wrong (downstream) layer — stop and go up. (2026-06-14: a render-time *polygon* smooth left the drawn centerline unchanged and the curb desynced + lumped — the textbook wrong-layer symptom.)
>
> The **concentric law** (`HANDOFF-vector-curve-construction.md` Law 1: the curb is *always* a concentric offset of the centerline) is the **geometry half** of this. The **identity half** — that leg/corner/material descend from the same root — is just as binding. Together: **get the centerline right and the entire ribbon, shape *and* identity, follows for free.** Cross-refs: `README §START HERE`, `SECTION.md §7.1` (the SHAPE/FILL which-layer frame), **`SKELETON.md §3.5`** (the concrete frame→render flow: where the centerline points live, the single `ribbons.json` source, and where the curve-fit consume-time map lives).

### The ribbon as the entire object

The visible "street" is a Z-shaped cross-section running along the chain: asphalt, then curb, then treelawn, then sidewalk, terminating at the property line. The same cross-section persists from straight-spans into the corner. What we call "the corner" is the ribbon's WRAP around the IX — same materials, same depths, just bent around an arc instead of running straight.

The corner is NOT something we construct as a separate primitive to glue two ribbons together. The corner is what naturally happens when the ribbon's outer edge (the asphalt boundary) follows the rounded block silhouette around the IX. This is the load-bearing inversion from V1 (per `feedback_corner_pad_continuity_first`):

| V1 (retired in `0286cb1`) | V2 cutover (current, post-HANDOFF C5) |
|---|---|
| Asphalt = union of per-chain rectangles | Asphalt = `stencil − blockRounded` |
| Corner asphalt fillet = constructed annular sector or `buildCornerPlug` | Corner asphalt mouth = back side of the block's rounded corner; residual at IXs → `cornerOrphanAsphalt` (renders as asphalt) |
| Concrete corner pad = `buildCornerPadQuad` (tA-tB-anchored parallelogram clipped against blockRounded) | Concrete pad = the figure-ground residual of `pedBand` (one inward Clipper offset by `cw + W`; concentric, self-clips when sharp). No per-corner construction. |
| Curb = per-side rectangle bands + per-corner curb annulus | Curb = single offset stroke of the entire rounded asphalt silhouette |
| Per-side ped band = `{treelawn, sidewalk}` fixed pair | Per-side ped band = `{strips: [{width, fill ∈ {concrete, landuse}}, ...]}`; fill-toggle composes any cross-section |

### The three structural moves

The new regime collapses to three operations. Everything else falls out:

**1. Round the block, derive asphalt as negative.**
- `applyRoundCornersToRing` runs Bezier (handle length `(4/3)·R·tan((π−θ)/4)`, 16 samples) at every block-convex matched vertex of each `blockSharp` ring.
- `asphaltRounded = stencil − blockRounded`. The rounded asphalt mouth at every IX is the back side of the rounded block corner. No separate `cornerAsphaltPlugs` math. The mouth IS the geometry, not a residual.

**2. The ribbon wraps the silhouette (uniform-width model — HANDOFF-ribbon-corners.md).**
- `pedBand = inset(blockRounded, cw) − inset(blockRounded, cw + W)` where `W = max` of per-leg authored strips-totals. Two uniform inward Clipper offsets + one difference. The corner falls out concentric for free: arc when `R > cw + W`, point at neutral, **self-clipped when sharp** — Clipper removes the crossing natively.
- Per-leg materials inside the band: each side's `strips: [{width, fill}]` lists sub-strips at authored widths. `fill='concrete'` → sidewalk; `fill='landuse'` → the parcel showing through ("treelawn" dissolved as a special material — it's just a landuse-filled strip).
- Grass (landuse) strips are emitted **per leg / per parcel** (load-bearing for the bake's per-LU routing at `bake-ground.js:349`), clipped to the straight run, cut off at corners.
- The corner is the strips ARCING around — never a constructed block. The sidewalk simply bends; where a grass strip exists it stops at the corner and the gap fills with concrete via the figure-ground residual.
- frontageBands entries: per-leg per-fe `{ treelawnRings, sidewalkRings, asphaltRings }` + ONE chainless entry carrying the uniform sidewalk ring + `cornerOrphanAsphalt` (the asphalt residual). The per-arc `corner` field is retired (C5).

**3. The curb is the silhouette stroke.**
- `curbBands = dilate(asphaltRounded, cw) − asphaltRounded`.
- ONE polygon per block, traces the entire silhouette including caps and wraps, painted OVER bands so the band-to-asphalt boundary stays hidden.
- The curb at the corner is just the curb's natural arc around the rounded block corner. Inherited from `asphaltRounded`; no separate corner-curb pass.

### What this gets away from

- Per-corner constructed primitives (V1's stack).
- Per-IX special-case math that extends chain segments to find where they meet.
- The corner-as-glue-between-two-rectangles framing.
- The fillet-wedge primitive pasted on top of the corner.

### What this keeps

- The polygon graph as substrate (blocks ARE the positive geometry from which everything emerges).
- The **stage wall**: chains end forever at bake; polygons are the surface. **This section is the canonical site of the doctrine** (the `FEATURES.md §"The stage wall"` cross-ref is stale — grep finds no such section today). Enforced structurally inside `buildBlockGeometryV2.js` since HANDOFF-ribbon-corners.md C4.5: `fe.measure` is baked once at fe-construction, and no emission function takes `streets` as a parameter (signature-level enforcement). Sanctioned exception: the corner-radius authoring kit (`cornersAtIx` + `applyRoundCornersToRing`) consults chains for radius authoring — separate concern.
- Block-customs keying by `(blockKey, edgeOrd)` for per-block-edge authoring.
- Inner-edge anchor mode for divided carriageways.
- The 3-tier corner-radius authoring kit (global × per-IX × per-corner).

### Anti-patterns this regime forbids

- ❌ Snapping or editing chain endpoints to "clean up" a corner. The corner comes from the polygon. Chain endpoints are descriptive, not prescriptive.
- ❌ Per-IX special-case extension math (extending a chain segment to find where it meets another extended segment).
- ❌ Authoring a fillet wedge primitive at a corner as a separate constructed polygon distinct from the corner-ribbon entry.
- ❌ Re-deriving "block polygon from chains" when an authored block polygon exists. The park is the canonical case.
- ❌ Splitting a chain at every slight bend to "respect topology." Slight bends are OSM noise; the polygon system already collapses them.

### Diagnostic order when something looks wrong

1. **What's the polygon at this location?** Inspect block ring vertex count and corner positions. A 4-corner block should have ~4 vertices at corners. A 41-vertex blob with 5 vertices clustered at each corner is the bug.
2. **Where does that polygon come from?** Authored, derived from chains, or imported from OSM?
3. **If the polygon is wrong: clean THE POLYGON, not the chains.** Author it directly, apply Douglas-Peucker, or change the source.
4. **Re-bake. Round-corners, curb, ribbons, asphalt mouth all reconcile automatically.**

There is no step "audit the chain endpoints near the corner." If a chain endpoint is materially off from the polygon corner, it is an unrelated authoring concern (label placement, perhaps), not a corner-geometry concern.

---

## §2. Data shapes

### Input: `ribbons` (from `src/data/ribbons.json` or per-scene equivalent)

```js
{
  streets: [
    {
      id,            // chain identity (legacy)
      skelId,        // chain identity (canonical post-skeleton.js)
      name,          // human label
      type,          // normalized street class: 'motorway' | 'residential' | ...
      highway,       // raw OSM tag
      points: [[x, z], ...],     // chain centerline polyline
      measure: {
        left:  { pavementHW, treelawn, sidewalk, terminal, curb? },
        right: { pavementHW, treelawn, sidewalk, terminal, curb? },
        symmetric: bool,
      },
      segmentMeasures: { [segOrd]: { left, right, symmetric } },  // legacy per-segment overrides
      capStart, capEnd, capEnds,    // 'round' | 'blunt' | 'none'
      anchor,                       // 'center' | 'inner-edge'
      innerSign,                    // ±1 — which perp side faces the median (inner-edge only)
      pairId,                       // mate's skelId (divided carriageways)
      couplers,                     // segment-range cross-section overrides
      intersections: [{ ix, ... }], // legacy IX-ref data; stale on LS, use ixByChain
      disabled,                     // boolean
    },
    ...
  ],
  intersections: [
    { point: [x, z], streets: [{ id, dir, ... }, ...] },
    ...
  ],
  faces: [
    { ring: [[x, z], ...], use: 'residential' | 'park' | ... },
    ...
  ],
}
```

**Field semantics:**
- `pavementHW` — perpendicular half-width from centerline to asphalt outer edge (meters).
- `terminal` — `'sidewalk'` (ped zone present) or `'none'` (no ped zone — bare median, etc.).
- `curb` — per-side curb override; today always falls back to `CURB_WIDTH` global.
- `anchor: 'inner-edge'` — flips `measure.symmetric → false`, zeros inboard ped zone for median rendering (NOTES:1057).
- `couplers` — segment-range overrides for cross-section variations within a chain.

### Derived: `chain.measure` post-`innerEdgeMeasure`

For chains with `anchor === 'inner-edge'`, `innerEdgeMeasure(measure, innerSign)` is applied at the top of `buildBlockGeometryV2` to BOTH `measure` and every entry of `segmentMeasures`. The inboard side's `treelawn`, `sidewalk`, and `terminal` are zeroed/'none'. Single source of truth — every downstream read sees post-transform measure.

### `ixByChain: Map<chain, Set<int>>`

Built by `resolveChainSegmentation(streets)`. For each chain, the set of vertex indices that are real IXs (coord-shared with ≥2 chains). This is THE partition — `naturalSegments`, `buildFrontageEdges`, `cornersAtIx`, MeasureOverlay's `naturalSegmentOrdinal`, MeasurePanel's segment lookup all consult it. Stale `intersections[].ix` integers are no longer trusted (`feedback_index_mismatch_centerline_vs_ribbons`).

### `chainIndex` (spatial index)

`buildChainSegmentIndex(streets)` → `{ cellSize, cells: Map<cellKey, entries> }`. Buckets chain segments into a grid for `findAdjacentChainForBlockEdge`'s outward probe. Cuts adjacency lookup from O(streets × segs) to O(few candidates per probe cell). Bbox cell size ~30m.

### `frontageEdges` (sharp fes)

Output of `buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain)`. One entry per block-edge polyline between two consecutive block-corner vertices.

```js
{
  points: [[x, z], ...],   // block-edge polyline, corner-to-corner
  blockKey,                 // bbox-stable identity of containing block ring
  edgeOrd,                  // 0..N-1, position around block ring (CCW from arbitrary start)
  chainIdx,                 // which chain owns the asphalt across this block edge
  side,                     // 'left' | 'right' (in chain coordinates)
  ringCcw,                  // boolean — block ring winding
  segOrds: [],              // filled by assignSegOrdsToFes — natural segs that map to this fe
}
```

**Corner detection is identity-driven, not angle-driven** (`feedback_walker_corner_detection_is_identity_not_angle`). A vertex is a block-corner iff the owning chain CHANGES across it. Same chain on both sides = chain interior bend (HW3 saw-tooth, VW3 NE bend), NOT a corner. Stencil-only vertices (-1 → -1) fall back to 30° angle test.

### `blockCustoms[blockKey][edgeOrd]`

Per-block-edge cross-section override (D.5/D.6). Same shape as `chain.measure[side]`:
```js
{ pavementHW, treelawn, sidewalk, terminal, pavementHW?, curb? }
```
Resolved at every measure-read site:
```
blockCustoms[fe.blockKey][fe.edgeOrd]
  ?? chain.segmentMeasures[segOrd][side]
  ?? chain.measure[side]
```

**`blockKey` is bbox-stable to width changes** (`blockKeyFromRing` rounds bbox center to 0.5m). But pass-2 asphalt expansion CAN shift the rounded-by-0.5m center by ≥0.5m — when that happens, pass-2's blockKeys flip and the per-block clip becomes a no-op for those fes (`feedback_d7a_blockkey_drift`). Pass-2 backfill carries pass-1 (blockKey, edgeOrd) forward via (chainIdx, segOrds[0], side) tuple to preserve customs identity.

### `corners` (from `cornersAtIx`)

One entry per CCW-adjacent leg pair at each IX:
```js
{
  point: [x, z],          // Vc — corner Q from polyline crossing
  V: [x, z],              // IX vertex (shared by all corners at this IX)
  theta,                  // block-interior angle, radians
  d_min,                  // min(leg.rightDepth_A, leg.leftDepth_B)
  R_class,                // AASHTO/NACTO baseline
  R_authored,             // per-corner or per-IX override (pre-scale)
  T_A: [tx, tz],          // LOCAL polyline tangent at Vc along leg A (out from V)
  T_B: [tx, tz],          // LOCAL polyline tangent at Vc along leg B (out from V)
  outerR_A, outerL_B,     // A's right pavementHW, B's left pavementHW
  rightDepth_A, leftDepth_B,
}
```

**Q point comes from polygon-edge crossing**, not far-field tangent extrapolation (FEATURES:91, `feedback_corner_pad_continuity_first` doctrine line). `polyA = buildLegSidePolyline(A.chain, A.ixIdx, A.dir, +1, A.outerR)` walks chain.points outward 6 vertices, perp-offset at each via bisector-perps. `polyB` symmetric. `polylineCross(polyA, polyB)` returns the first crossing + local tangents at the hit point.

No crossing → SKIP this corner entry. (Median wedge between paired carriageways converging at one IX. Tangent-Q fallback would reintroduce Phase A.5 degeneracy.)

### `arcMeta` sidecar

Output of `applyRoundCornersToRing(ring, corners, scale)` alongside the rounded ring. Per-emitted-vertex:
```js
arcMeta[i] = null
  | { corner, R, arcPositionFrac }
```
- `null` for literal (non-arc) vertices.
- Non-null for Bezier sample vertices; `arcPositionFrac` ∈ [0, 1] in WALK ORDER (0 at first-emitted arc vertex along block-CCW walk, 1 at last). Consumers read it to detect arc midpoint for ramp-window and asym-step regimes.

### `blockSharp`, `blockRounded`, `asphaltSharp`, `asphaltRounded`

```
asphaltSharp = unionRings(byChain.flatMap(c => c.asphaltRings))   // per-chain rectangles unioned
blockSharp   = differenceRings([stencil], asphaltSharp)           // figure-ground inversion (sharp corners)
blockRounded = blockSharp.map(applyRoundCornersToRing)            // Bezier corners on positive geometry
asphaltRounded = differenceRings([stencil], blockRounded)         // negative of the rounded block — rounded mouths inherent
```

`blockRoundedResults[i] = { ring, arcMeta }`. The arc-span band emitter consumes both.

### `frontageBands` (the ribbon's per-block-edge output)

Two shapes by emitter (see §3.9): **toy** — single `emitBlockRingBands` output (mono-width entries); **LS-legacy** — concat of `straightBands` (from `silhouetteStraightEmitter`) + `arcBands` (from `buildFrontageBandsV2`).

**Straight-span entry** (one per sharp fe with `terminal: 'sidewalk'` and some band depth):
```js
{
  blockKey, edgeOrd, chainIdx, side,
  points,                    // sharp fe polyline
  treelawnRings,             // 0..1 ring per side
  sidewalkRings,             // 0..1 ring per side
}
```

**Arc-span entry** (one per block-convex Bezier arc):
```js
{
  blockKey, edgeOrd, chainIdx, side,
  corner,                    // the corner record this arc wraps
  treelawnRings,             // 0..1 ring per ramp side (asym/sym-no-ramp emits 0)
  sidewalkRings,             // 1 ring (asym plug / sym ramp wedge / sym-no-ramp band)
  asphaltRings,              // [] at emit; filled by attributeFilletResidualToArcs
}
```

LS counts post-revert (2026-05-17): 506 straight + 219 arc = 725 entries. 464 treelawn rings, 722 sidewalk rings, 155 fillet asphalt rings.

### `curbBands`

`differenceRings(dilateRings(asphaltRounded, cw), asphaltRounded)`. One continuous stroke polygon per block.

### `blocks[]`

Per-block face geometry: `{ ring, blockKey, lu }`. From `ribbons.faces[]` clipped per-owning-blockRounded-ring (LS) or `stencil − ribbonUnion` (toy). `lu` reads from `blockLandUse[blockKey]` override, falls through to `face.use`, falls through to weighted hash (`pickLuFromHash(hashKey(blockKey))`).

---

## §3. The pipeline, function-by-function

`buildBlockGeometryV2(ribbons, opts)` in `src/lib/buildBlockGeometryV2.js`. ~530 LOC main body. Consumed by `cartograph/bake-ground.js` (offline) and `src/cartograph/BlockGeometryV2Debug.jsx` (Designer live, via Zustand store).

### 3.1 Inner-edge transform (line 1872)

`streets = ribbons.streets.map(s => s.anchor === 'inner-edge' ? { ...s, measure: innerEdgeMeasure(s.measure, s.innerSign), segmentMeasures: { ... } } : s)`. Inboard ped zone zeroed. Every downstream read sees post-transform measure. NOTES:1057.

**Divided-carriageway frame topology (upstream, `skeleton.js` — how paired carriageways reach this transform).** Three facts, all landed 2026-06-03 (`_archive/TRUMAN-FORENSICS.md` is the forensic record):
- **Longitudinal weld (D1, `5348fbc`).** `weldChains` fuses tail-to-head, same-heading fragments of *one* corridor into a single continuous chain — *regardless* of `(signature, pairKey)`, but **never flipping direction** (reuses the oneway-flip-forbid, so the existing gate's block on *lateral* cross-carriageway fusion stays intact). Before D1 a carriageway shattered into ~4 staggered fragments (Truman = 8 chains for one road, because the two carriageways' junctions stagger ~80m and pairing flips on/off along the run); after, each carriageway is one chain (Truman 8→2). All 11 LS divided corridors keep ≥2 carriageways; none fuse laterally. (D6, same commit: `oneway` now serialized into `ribbons.streets`.)
- **Pairing requires station-overlap (4th gate, `8392b3e`).** Antiparallel + length-ratio + perp-gap is *insufficient*: the perp helper clamps `t∈[0,1]`, so a longitudinally-*offset* stub measures a small gap to its mate's endpoint and false-pairs into a skewed wedge. `stationOverlapFracXZ` rejects candidate pairs that don't overlap when projected (unclamped) onto the corridor axis — Truman #5/#6 score 0 and fall through to `kind:'single-oneway'` (render as plain one-ways, no median — correct).
- **The median is an emergent GEOMETRIC face, NOT a chain-identity consequence** (Scarf's correction to Galen's prediction). D1 making carriageways continuous *improves* median coverage, but the live median is a face from `tileGround.extractFaces`, which walks **shared vertices**, not chain IDs — so the inter-carriageway median's tiling + LU/material tagging (leads D3/D8) is REAL downstream work, not free. The legacy `medians[]` `A.points + B.points.reversed` ring is a vestigial decoy. `innerSign` is per-chain-relative and correct (D7, `feedback_perp_side_convention`) — do not touch.

**⭐ Divided↔undivided transition — the outer-edge clamp (side-aware asphalt, 2026-06-04).** *(Doctrine + theory: `SKELETON.md §5d`, "the special sauce.")* At a transition (a divided pair meeting an undivided spine of the same corridor — e.g. the four park-corner IXs), the carriageways diverge from the node to open the median. The asphalt is a **symmetric** `strokeOpen` of each centerline, so the carriageway's **outer** edge inherits that divergence and bulges into the adjacent block — the visible "facet" on the Survey block silhouette. **The centerlines are square; this is a construction defect, not a skeleton one** (`SKELETON.md §5c`).
  - **Rule:** the outer curb runs **straight through**; the **median opens inward.** The outer edge holds to the **corridor's outer line** (the spine's outer-edge continuation), never the carriageway's divergence.
  - **The side knowledge already exists but was unused on geometry:** `isMedianFacing(street, side)` / `innerSign` were wired only to *ped* zeroing (`effectiveMeasure`), never to the asphalt stroke. The fix is to make the asphalt **side-aware**: on a carriageway's **outer** run (`!isMedianFacing`), clamp the stroke to the corridor outer line instead of free symmetric buffering.
  - **Reference line = a FROZEN FRAME FACT, not a build-time search.** `skeleton.js` stamps `phase.spineAtStart`/`phase.spineAtEnd` (the spine skelId at each carriageway endpoint, via shared endpoint node + `corridorName`), carried through `derive.js` into `ribbons.json` (Part 1, `61930d7`, geometry-neutral). `tileGround` reads it directly — **no node-matching at construction** (that re-coupling is the wall violation we're avoiding). Spine `id` == ribbons `skelId`.
  - **The clamp is LOCAL / bounded to the transition** — self-limiting (no-op where the carriageway has merged back to corridor width) and box-bounded near the transition node, so the **simple street + any curved carriageway elsewhere are untouched.** This bound is the operational form of the intersection(variable)/street(simple) distinction. Verify on render per-corner (`scratch/corner-*.mjs`), no `ribbons.json` rebuild needed.

### 3.2 IX identity (line 1890)

`ixByChain = resolveChainSegmentation(streets)`. Coord-match scan; for each chain a set of vertex indices that are shared with ≥2 chains. Threaded into every function that partitions by natural-segment.

### 3.3 Per-chain emission, pass 1 (`emitChain`, called at 2047)

For each natural-segment of each chain:
- Resolve `effL`, `effR` via `customsResolver` (null in pass 1, so falls through to `chain.measure[side]`).
- Build asphalt rectangle: `leftEdge = segPts − segPerps · hwL`, `rightEdge = segPts + segPerps · hwR`. Square ends at IX vertices.
- Concatenate `[leftEdge, ...rightEdge.reverse()]` → ring. CCW-normalize via `ringSignedArea2D`.
- Push to `byChain[chainIdx].asphaltRings`.

At round-capped chain endpoints (`capStart === 'round'` or `capEnd === 'round'`): per-side `quarterCap(endpoint, T_out, sideSign, innerR, outerR)`:
- Asphalt pie slice (innerR=0, outerR=hw) → `entry.asphaltRings`.
- Treelawn quarter-annulus (innerR=hw+cw, outerR=hw+cw+tl) → `entry.treelawnCapRings`.
- Sidewalk quarter-annulus (innerR=hw+cw+tl, outerR=hw+cw+tl+sw) → `entry.sidewalkCapRings`.

All cap rings CCW-normalized. Mixed-winding caps cancel against the matching segment-asphalt rectangle under NonZero union → dead-end hole. Normalization prevents this.

**Bands NOT emitted here.** Per-chain ped-zone band emission retired in D.7d; `frontageBands` is the sole source.

### 3.4 Build `asphaltSharp` / `blockSharp` / `frontageEdges` / `feLookup` (lines 2052-2105)

```js
asphaltSharp = unionRings(byChain.flatMap(c => c?.asphaltRings || []))
blockSharp = stencil ? differenceRings([stencil], asphaltSharp) : []
chainIndex = buildChainSegmentIndex(streets)
frontageEdges = buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain)
assignSegOrdsToFes(frontageEdges, streets, ixByChain)
feLookup = buildFeLookup(frontageEdges)
```

**`buildFrontageEdges`:** for each blockSharp ring, walk vertices, classify each segment by owning chain via outward probe (`findAdjacentChainForBlockEdge`, 30m max, spatial-indexed). Corner detection = identity change across vertex (chain → other chain, or chain → none). Slice between consecutive corners → emit one fe per slice with `{ chainIdx, side, points, blockKey, edgeOrd, ringCcw, segOrds: [] }`.

**`assignSegOrdsToFes`:** group fes by `(chainIdx, side)`. For each natural-segment of the chain, attribute to the ONE fe whose polyline midpoint is closest (clamped t-projection, ALONG_TOL = `max(12, hwMax + 25)`). Single-fe assignment eliminates leakage + corner-coverage gaps (`feedback_segord_uniqueness_via_midpoint_test`).

**`feLookup[chainIdx][segOrd][side] = fe`:** inverse index. Consumed by `cornersAtIx` for per-leg per-side customs resolution and by pass-2 customs resolver.

### 3.5 Per-chain emission, pass 2 (lines 2122-2154)

Fires only if any fe has `blockCustoms[fe.blockKey][fe.edgeOrd]`. For each affected chain, `emitChain` with `customsResolver = (chainIdx, segOrd, sideKey) => blockCustoms?.[pass1Lookup[chainIdx]?.[segOrd]?.[sideKey]?.blockKey]?.[pass1Lookup[chainIdx]?.[segOrd]?.[sideKey]?.edgeOrd] || null`.

Rebuild asphaltSharp + blockSharp + frontageEdges. **Carry pass-1 (blockKey, edgeOrd) onto pass-2 fes** via (chainIdx, segOrds[0], side) join (line 2145):
```js
for (const fe of frontageEdges) {
  const p1 = pass1Lookup[fe.chainIdx]?.[fe.segOrds[0]]?.[fe.side]
  if (p1) { fe.blockKey = p1.blockKey; fe.edgeOrd = p1.edgeOrd }
}
```
Per `feedback_d7a_blockkey_drift` — asphalt expansion shifts bbox centers ≥0.5m, flipping `blockKeyFromRing`'s rounding. Customs were written against pass-1 keys; pass-2 must preserve identity.

Rebuild `feLookup`.

### 3.6 Corner records (`cornersAtIx`, line 365; called at 2157)

For each IX, for each pair of CCW-adjacent legs (A, B):
- Each leg has `T` (local at-V tangent from chain.points[ixIdx ± dir]), `outerL/outerR` per-side pavementHW (from `feLookup[chainIdx][segOrd][side]` → `blockCustoms` override → `chain.measure[side]`), depths, `legKey = '${skel}:${b|f}'`.
- Skip if `theta < 5°` or `> 355°` (parallel).
- Skip same-name-T through-street: `A.name === B.name && theta_deg ∈ (150°, 210°)`.
- **Polygon-edge-Q:** `polyA = buildLegSidePolyline(A.chain, A.ixIdx, A.dir, +1, A.outerR)`, `polyB = buildLegSidePolyline(B.chain, B.ixIdx, B.dir, -1, B.outerL)`. Each walks chain.points 6 vertices outward, perp-offset at each via bisector-perps (same construction as emitChain's asphalt rectangles).
- `hit = polylineCross(polyA, polyB)`. No crossing → SKIP (median wedge, no real corner). With crossing → `Vc = hit.point`, `localT_A = hit.tangentA`, `localT_B = hit.tangentB`.
- Override resolution: `cornerKey = sortedCornerKey(V, A.legKey, B.legKey)` first; else `ixKey(V)`. Pre-scale meters.
- Emit `{ point: Vc, V, theta, d_min, R_class, R_authored, T_A: localT_A, T_B: localT_B, outerR_A, outerL_B, rightDepth_A, leftDepth_B }`.

Doctrine alignment per FEATURES line 91 ("compute corner records off polygon edges, not off extended chain tangents"). NOTES:474 (Phase A polygon-edge-Q).

### 3.7 Round-block swap (`applyRoundCornersToRing`, line 677)

Called per `blockSharp` ring (line 2172). NOT called on `asphaltSharp` — Phase 2 doctrine: round the positive geometry, derive negative.

**Pre-pass:** `matched[i] = corner record | null`. TOL = 0.5m vertex-to-corner-point match.

**Winding-aware convex test** (line 691): `ringSign = signedArea ≥ 0 ? +1 : -1`. Block-interior-convex = `cross * ringSign > 0` (independent of ring direction).

**Pass 1 — consume-spans (line 711):** per matched + block-convex vertex:
- `R = R_authored ?? defaultR(R_class, d_min, theta); R *= scale`. Skip if `R ≤ 0.05`.
- `inset = R / tan(θ/2)`. Skip if `tan(θ/2) ≤ 1e-6`.
- Walk backward from `i`, accumulating arc-length, until exceeding `inset` or hitting another `matched[k]`. `start = k+1`.
- Walk forward, symmetric. `end = k-1`.
- Push `{ start, end, cornerIdx: i, corner, R }` to `spans[]`. Mark `consumed[start..end] = spanIdx`.

**Pass 2 — emit (line 775):** rotate to non-consumed start index. Walk forward `n` steps from there:
- Non-consumed `i` → push literal `ring[i]`, `outMeta[i] = null`.
- Consumed `i` with `sIdx` not yet emitted: emit Bezier output for span.

**Bezier output (`bezierReplaceCorner`, line 614):**
- `tA = cornerVertex + inset · T_A`
- `tB = cornerVertex + inset · T_B`
- Handle length `(4/3) · R · tan((π − θ)/4)`. Arc angle is supplement of block-interior θ.
- `P1 = tA − handleLen · T_A`
- `P2 = tB − handleLen · T_B`
- Sample cubic Bezier at `t = 0..BEZIER_N`. BEZIER_N = 16.
- Returns `[tA, ...samples, tB]`.

**Reverse the arc + invert arcPositionFrac (lines 821-829):** block-CCW walk arrives FROM leg-B side and departs TOWARD leg-A side (opposite of asphalt-CCW walk). Natural-order Bezier emission would criss-cross. Reverse so walk reads `prev → tB → samples → tA → next` with `arcPositionFrac` going 0→1 in walk order.

Output: `{ ring: out, arcMeta: outMeta }`.

### 3.8 `asphaltRounded` (line 2178)

```js
asphaltRounded = stencil ? differenceRings([stencil], blockRounded) : asphaltSharp
```

The rounded mouth at every IX emerges as the back side of the block's rounded corner.

### 3.9 Band emission — DUAL EMITTER (toy mono-width · LS legacy)

Dispatch at **line 2884**: `if (useRingBandEmitter)`. The flag is `opts.useRingBandEmitter`, set `scene === 'toy'` in **both** consumers (`cartograph/bake-ground.js:594`, `src/cartograph/CartographApp.jsx:890`). Two complete, parallel band emitters coexist mid-cutover:

| | toy (V1 keystone, live) | LS (legacy, pre-C5) |
|---|---|---|
| Emitter | `emitBlockRingBands` → `emitOneBlockRingBands` | `silhouetteStraightEmitter` (straight) + `buildFrontageBandsV2` (arc pads) |
| Model | **mono-width ring band** | per-leg cross-section + per-corner pad |
| frontageBands | single emitter output | `[...straightBands, ...arcBands]` (line 2899) |
| frontageCaps | `[]` | from `buildFrontageBandsV2` |

**C5 cutover:** flip `useRingBandEmitter` for LS, eyeball, delete `silhouetteStraightEmitter` + `buildFrontageBandsV2` + the dead `buildFrontageBands`. Until then the two paths stay behaviorally parallel; the live-drag preview (`buildChainBandsLive`, line 3114) is a third path that must track whichever emitter its scene uses ([[feedback_live_drag_preview_migrates_with_main_emitter]]).

> ⚠️ **`buildFrontageBands` (line 1475) is DEAD in the bake path** — grep finds zero code call sites (only doc refs in RIBBONS/BACKLOG/NOTES). It was the post-revert straight emitter (restored from `ed29700`), then superseded by `silhouetteStraightEmitter`. Candidate for deletion in the C5 sweep. Flagged 2026-05-30.

---

#### 3.9a — Mono-width ring-band emitter (TOY · the V1 keystone)

`emitBlockRingBands` (line 2300, thin wrapper) → `emitOneBlockRingBands` (line 1974, the construction). **This is THE model** — "ribbon monowidth, strips variable" ([[project_ribbon_corner_uniform_width]]). One uniform-width band wraps the *entire* block silhouette; **the corner is that band BENT around the arc, sliced from the same continuous Clipper offsets — never a constructed primitive.** 8 linear regions (legs + corners) × 2 strips = the 16-fields model. The two facts that don't come naturally and keep getting violated: (1) mono-width, not per-leg stitched; (2) corner = band bent, not a built shape.

**`emitBlockRingBands` — block grouping by RING-INDEX PARITY, not blockKey.** Groups fes by `fe.blockRingIdx` (the `blockSharp` array index `buildFrontageEdges` stamped), because `blockRoundedResults[bi]` ↔ `blockSharp[bi]` are 1:1 by index. Recomputing `blockKeyFromRing` here would drift on two axes (rounded-vs-sharp Bezier bbox shift; pass-1-vs-pass-2 customs expansion) and silently drop every fe on a drifted block (162→42 fes on dense toy customs). [[feedback_block_key_rounded_vs_sharp_diverges]].

**`emitOneBlockRingBands` — per-block construction:**

1. **Span partition.** Walk the rounded ring; group consecutive verts by `arcMeta[i].corner` identity → arc spans (corners) + straight spans (legs). Wraparound merge.
2. **Kink sub-split** (>5°) of straight spans — catches non-corner IXs (divided-pair endpoints, θ-skipped) that pass through as straight verts but cross fe boundaries.
3. **Synthetic 2-vert straight spans** injected between adjacent arc spans. On a simple quad block, `applyRoundCornersToRing` consumes all 4 verts into Bezier spans, leaving NO literal straight span for leg emission; the synthetic span is the leg-edge between `tA`(corner N) and `tB`(corner N+1). Shares boundary verts with the flanking arcs (zero-area outer overlap); the inner seam to the corner pad is an honest polyline step.
4. **Per-block mono-width `W`.** `TL_block = max(treelawn)`, `SW_block = max(sidewalk)` over the block's sidewalk-terminal fes. `WB = cw + TL_block + SW_block`. ONE width for the whole block — this IS the mono-width.
5. **Capacity guard** (Boz 2026-05-30, [[feedback_render_guard_against_real_data_not_synthetic]]). When `WB` exceeds the block's inscribed reach the three inward offsets collapse past the medial axis → empty `ringWedge` → the difference fallback takes the WHOLE interior → an SW "flood" with an asphalt-colored hole on dense-customs small blocks. Bisect the largest non-empty inward offset (≤ bbox half-min), clamp `WB` to 90% of it. In-spec blocks untouched; over-capacity blocks degrade to a clean truncated ribbon. **Distinct from the retired corner-R clamp** — that was tight-R *corner* degeneracy Clipper handles natively; W-past-medial-axis is a different degeneracy Clipper does NOT handle. [[feedback_no_corner_radius_clamps_in_emit]].
6. `dividerDepth = min(cw + TL_block, WB)`, `outerDepth = min(cw, WB)`.
7. **Three Clipper inward insets, `jtMiter`** (line 2137): `ringOuter(−outerDepth)`, `ringDivider(−dividerDepth)`, `ringWedge(−WB)`. **jtMiter, not jtRound** — jtRound adds rounding of radius = depth at every sharp vertex, corrupting operator-authored R=0 squares (ADA ramps). Already-rounded Bezier samples produce concentric arcs naturally via dense-sample miters. Handles any topology incl. non-convex (per-vertex perp folds at re-entrant verts — the old L-shape defect).
8. **Two strips + full band** (lines 2146-2156):
   - `outerBand = ringOuter − ringDivider` — **outer strip** (default LU / parcel showing through).
   - `innerBand = ringDivider − ringWedge` — **inner strip** (default SW / concrete).
   - `fullBand = ringOuter − ringWedge` — the whole ribbon (cw→W), for single-polygon corner slicing.
   - (`ringWedge` may be empty when the block is too small for full `W`; the difference fallbacks treat it as zero.)
9. **fe-per-span resolution.** flankingFes sidecar (C1: `corner.flankingFes.{A,B}`) → `probeFeForRun` chain-adjacency fallback.
10. **Sector slicing** (lines 2199-2287). Per span, build a sector polygon = sub-path along the ring outer edge + per-vertex perp inward at `SECTOR_INNER_DEPTH = WB + 1` (curved inner side follows band curvature; straight inner-lines would sliver on small/non-convex blocks). Leg sectors extend to include adjacent Bezier endpoints so the boundary band edge is covered.
    - **Corner (arc span):** `fullBand ∩ sector` → ONE polygon, tagged SW (`sidewalkRings`). Single-polygon emission (Boz expedient (a)): V1 corners are all-SW, so emit the full band slice rather than outer+inner sub-polys that can independently return empty on tight curves (the partial-corner bug). **This is the "corner is the band, bent" made literal — a slice of the same `fullBand`.**
    - **Leg (straight span):** `outerBand ∩ sector` = outer sub-polys, `innerBand ∩ sector` = inner sub-polys. **V1.5 per-leg material swap:** `matOuter = fe.measure.materials.outer || 'LU'`, `matInner = … || 'SW'`; route each sub-poly to `treelawnRings` (LU) or `sidewalkRings` (SW). Geometry unchanged — only the routing slot flips. Skip if `fe.measure.terminal !== 'sidewalk'`.
11. **Output entry:** `{ blockKey, edgeOrd, chainIdx, side, points|corner, treelawnRings, sidewalkRings, asphaltRings: [] }`.

---

#### 3.9b — Legacy per-leg split (LS · pre-C5)

Straight bands: **`silhouetteStraightEmitter` (line 1568)** walks each block's rounded ring, partitions into straight-vertex runs, emits tl + sw rings by per-vertex perp offset (geometrically exact for straight verts; no Clipper-precision selfints). Arc pads + caps: **`buildFrontageBandsV2` (line 1714).** Concat at line 2899: `frontageBands = [...straightBands, ...arcBands]`.

**`buildFrontageBandsV2` arc-span emission** — the per-corner pad. (This is the part whose operator visual gate failed, motivating the mono-width rebuild; retained here as the live LS path until C5.) Per `{ ring, arcMeta }` of blockRoundedResults: partition into spans by `arcMeta[i]?.corner` identity (wraparound merge); `spanMeta[si]` built for every span (straight ones probe chain adjacency for flanking-meta scaffolding but do NOT push output — straight output comes from `silhouetteStraightEmitter`).

**Arc-span emission:**
- Read `prevMeta`, `nextMeta` (leg-B, leg-A by walk convention; see §3.7 reversal note).
- `tl_A, sw_A, tl_B, sw_B` from flanking metas (fall back across the gap if one side is `skip`).
- **Cusp guard:** if `max(cw + tl + sw)` for either leg > `0.9 · arcR`, scale all four tl/sw values by `k = (0.9·arcR − cw) / (totalMax − cw)`. cw preserved as min.
- Compute `d_A = cw + tl_A + sw_A`, `d_B = cw + tl_B + sw_B`, `diff = |d_A − d_B|`, `ratio = min/max`.
- **Three regimes:**
  - ASYM (`diff > PHASE2_ASYM_EPS_M=1.0` or `ratio < PHASE2_ASYM_RATIO=0.7`): single sw plug, `inner[k] = pts[k] + perps[k] · inwardSign · (fracOf(k) < PHASE2_STEP_FRAC=0.5 ? d_B : d_A)`. Angular step at midpoint.
  - SYM-WITH-RAMP (`!isAsym && tl_A > 0 && tl_B > 0`): ramp window centered at arc midpoint, length `rampLen = min(PHASE2_RAMP_MAX_M=2.0, PHASE2_RAMP_FRAC=0.4 × totalLen)`. Skip below `PHASE2_RAMP_MIN_M=0.5`. Outside window: concentric tl + sw bands. Inside window: single full-depth sidewalk wedge spanning the whole ped zone (inner-edge `inDepth = 0`).
  - SYM-NO-RAMP (else): single sw band at `cw + sw_avg`.
- Push `{ blockKey, edgeOrd, chainIdx, side, corner: span.corner, treelawnRings, sidewalkRings, asphaltRings: [] }`. **Always pushes**, even with empty bands, so the per-corner fillet attribution slot is available.

(Concat with the straight bands happens at the dispatch — line 2899, see §3.9 table.)

### 3.10 Per-corner fillet attribution (`attributeFilletResidualToArcs`, line 1691; called at 2213)

```js
allChainAsphaltForFillet = unionRings(byChain.flatMap(c => c?.asphaltRings || []))
filletPolys = differenceRings(asphaltRounded, allChainAsphaltForFillet)
```

`filletPolys` = rounded-asphalt silhouette minus union of per-chain rectangles. Captures the fillet wedges at every IX where rectangle-square-ends don't reach the rounded mouth.

For each fillet polygon (centroid `c`):
- Find nearest arc-span `frontageBands` entry by `Math.hypot(c.x - fb.corner.point.x, c.z - fb.corner.point.z)`.
- If within `FILLET_ATTRIB_MAX_M = 8m`, push polygon onto `fb.asphaltRings`.
- Else push to `cornerOrphanAsphalt[]`.

Both render as asphalt material; the per-arc plumbing keeps the fillet bound to its corner-ribbon entry.

### 3.11 Curb stroke (lines 2224-2225)

```js
curbDilated = dilateRings(asphaltRounded, curbWidth)    // ClipperOffset jtMiter etClosedPolygon
curbBands = differenceRings(curbDilated, asphaltRounded)
```

Single continuous polygon. Wraps every silhouette feature uniformly. Painted OVER bands; the band-to-asphalt boundary is hidden under the curb stroke.

### 3.12 Block fill (lines 2244-2346)

`ribbons.faces[]` path (LS):
- For each face, `findOwningBlockRing(face.ring)` = the one `blockRounded` ring whose `pointInRing` contains the face centroid.
- If found AND face doesn't straddle (every vertex inside owning): `intersectRings([face.ring], [owning])`.
- Else: `differenceRings([face.ring], asphaltRounded)` (global fallback).
- Each output ring: `blockKey = blockKeyFromRing(ring)`, `lu = blockLandUse[blockKey] || face.use || pickLuFromHash(hashKey(blockKey))`.
- Push to `blocks[]`.

`stencil`-only path (toy): `blockFill = differenceRings([stencil], ribbonUnion)`, LU falls through to weighted hash.

`ribbonUnion` is computed once:
```js
ribbonUnion = unionRings([
  ...asphaltRounded, ...curbBands,
  ...frontageBands.flatMap(fb => fb?.treelawnRings || []),
  ...frontageBands.flatMap(fb => fb?.sidewalkRings || []),
  ...byChain.flatMap(c => c?.treelawnCapRings || []),
  ...byChain.flatMap(c => c?.sidewalkCapRings || []),
])
```

### 3.13 Return shape (line 2355)

```js
{
  asphaltSharp, asphaltRounded,
  blockSharp, blockRounded, blockFill, blocks,
  curbBands,
  byChain,
  corners: allCorners,
  frontageEdges,
  frontageBands,
  frontageCaps,            // empty in Phase 2
  cornerOrphanAsphalt,
}
```

### 3.14 `buildChainBandsLive(chain, chainIdx, blockCustoms, frontageEdges, opts)` (line 2399)

Fast per-chain band emitter for the SELECTED chain during interactive drag. NO Clipper booleans. Mirrors `emitChain`'s per-segment asphalt loop + direct tl/sw ring emission per side. ~1ms vs the ~2.5s full V2 pass. Square ends at IXs (no rounded mouth — overshoots by 1-2m at corners, masked by the curb stroke and the full V2 pass on drag release).

Output shape matches `byChain[i]` + adds `treelawnEdges` / `sidewalkEdges` polylines for the Designer's selected-chain opaque edge strokes (treelawn-outer green, sidewalk-outer white).

---

## §4. The corner specifically — DEEP DIVE

> Scaffold for v0.1. Will fill across the coming sessions as we close arc-span residuals.

- **Bezier handle length derivation.** `(4/3)·R·tan((π−θ)/4)` — canonical cubic-Bezier approximation to a circular arc of central angle (π−θ). Note θ is block-interior angle (from `cornersAtIx`), not arc angle; arc angle is the supplement. Verified parity test: max deviation < 0.005m at any θ ∈ [60°, 170°], R ≤ 15m (NOTES around line 625).
- **T_A / T_B doctrine.** Local-polyline tangents at Vc (the polylineCross hit point), NOT at-V tangents from chain.points[ixIdx ± dir]. On curved chains these differ materially. At-V is consumed only for CCW leg sorting + θ at V; corner record's T_A/T_B for Bezier handle alignment come from the polyline crossing.
- **arcMeta walk-order reversal.** Why block-CCW walks arc as B→A (opposite of asphalt-CCW). See §3.7 lines 821-829.
- **The three regimes' triggering criteria.** `PHASE2_ASYM_EPS_M`, `PHASE2_ASYM_RATIO`, `PHASE2_RAMP_MAX_M`, `PHASE2_RAMP_FRAC`, `PHASE2_RAMP_MIN_M`, `PHASE2_STEP_FRAC` — the constants and what each was tuned against.
- **Cusp guard math.** `safeMax = max(cw + 0.05, arcR · 0.9)`. Scales tl/sw, preserves cw. Smallest-R corners can still produce sub-5m² cusps; the 0.9× factor isn't tight enough. Open question for §6.
- **Fillet attribution geometry.** `FILLET_ATTRIB_MAX_M = 8m` centroid-to-corner radius. Failure mode: tiny fillet whose centroid lands beyond 8m from any corner → orphan. Open question: should orphans be attributed to nearest corner regardless of distance, or do they signal a real geometric defect?

---

## §5. Designer render side

### Y-lift stacking + drag perf split + edge strokes

- **Y-lift stacking in Designer ortho** (`feedback_designer_ylift_stacking`): block 0.01, treelawn 0.02, sidewalk 0.03, curb 0.035, asphalt 0.04, corner-fillet 0.038, paths 0.05, edge strokes 0.06. Centerlines Y=0.5 + renderOrder 140 + depthTest false. NOT PRI/polygonOffset (that's bake's mechanism).
- **Drag perf split** (`BlockGeometryV2Debug.jsx` ~lines 540-650): `nonSelectedChainGeo` triangulates every chain except selected from frozen byChain snapshot (cache key = byChain alone). `selectedChainGeo` triangulates from `liveSelectedRings` (`buildChainBandsLive`, ~1ms). Two material variants per ribbon class: opaque + `selectedCorridor` (opacity 0.55).
- **Per-LU treelawn bucketing** (~line 583): non-selected chains' treelawn rings attributed to adjacent parcel LU via `ringInteriorProbe(fe.treelawnRings[0])` + `blockLuAtPoint(probe, blocks)`. Per-LU mesh outputs.
- **Selected-adjacent block translucency** (~line 399): per-segment-midpoint probe at `max(hw + tl + sw) + cw + 10m`. Per-block mode narrows to two blocks at anchor.
- **Edge strokes**: treelawn-outer (green) + sidewalk-outer (white) polylines drawn opaque at Y=0.06 only on selected chain. The curb stripe IS the asphalt|treelawn stroke.

### Measure tool — operator model (V2-Measure, 2026-05-30)

The Measure tool authors the ribbon's cross-section per block edge. **All writes are polygon-scope (per-fe) under V2-Measure** — Datum's polygon-only redesign (commit `72cd0a7`) retired chain-scope authoring. Two operator modes, both writing per-fe via `blockCustoms[blockKey][edgeOrd]`:

- **"Edit entire row" (global mode):** drag selects every fe along the chain and FANS the write per-fe. Chain becomes a *selection criterion*, never a write scope. Result: every block-edge along the chain materializes its own explicit `blockCustoms` entry with the new value (sparse → dense; the V0 "living chain default" is retired).
- **"Edit block" (per-block mode, default):** drag writes to the anchored fe only. Sibling blocks along the same chain are unaffected.

`chain.measure[side]` is now **read-only pipeline-derived input** — it provides the default a fe falls through to when no `blockCustoms` entry exists, and carries pipeline-side state like `innerEdgeMeasure` zeroing for divided carriageways. No operator-write path targets it. **Symmetric mirroring is a transient UI state** (`editSidesSeparately` in the store, not a persisted measure flag) — when OFF (default), drag writes mirror to the opposite-side fe; when ON, drag writes only the clicked side. The legacy persisted `chain.measure.symmetric` flag is vestigial pipeline state, never operator-authored after V2-Measure.

**Click semantics:**

1. Click a centerline (royal-blue line drawn opaque at Y=0.5 with depthTest false — the always-visible "every street is selectable" affordance).
2. `selectStreet(idx)` + `setMeasurePoint({x, z})` at the projected click point. The anchor sits at the CLICKDOWN position, not the chain midpoint.
3. The clickdown projects to `(segOrd, sideKey)` via `naturalSegmentOrdinal` + the perp sign relative to the chain's local tangent.
4. In per-block mode, that tuple resolves through `findFeForSide(streetIdx, segOrd, side)` to the live `(blockKey, edgeOrd)` — **THIS is the polygon being authored**. Drag handle writes go to `blockCustoms[blockKey][edgeOrd]`. Only that one block-edge changes; sibling blocks along the same chain stay at chain defaults.
5. Drag a handle perpendicular to the centerline → new boundary radius via `distToPolyline` → write goes to whichever scope the mode dictates. rAF-throttled (~60-120 Hz pointermove coalesced to one store write per frame).

**Translucency, by design:**

- The selected chain's ribbons (asphalt + treelawn + sidewalk via `liveSelectedRings`) render through `selectedCorridor` materials at opacity 0.55.
- Adjacent block fills (per `selectedAdjacentBlockKeys` probe) render through `selectedCorridor` at 0.55 — so the operator sees aerial through every layer of the block being edited.
- **Non-selected chains' ribbons stay OPAQUE.** This includes chains running along the same block edge as the selected chain (e.g. the other three sides of a park). Only the clicked chain translucifies.

This is the spec, not a defect. The operator authors one streetfront at a time; the opaque-vs-translucent visual contrast is the affordance. **If you find yourself hypothesizing "the non-selected ribbons should be translucent too" as a bug, stop — that's the operator model working correctly.** Past misdiagnoses of this pattern as a render bug (see §7's Stage 1 entry) cost a full diagnostic cycle.

**Right-click / Ctrl-click gestures (V1.5, covered in MeasureOverlay.jsx:674-773):**

The two strips (TL + SW) are STRUCTURALLY FIXED in V1.5 (16-fields construction). Width is operator-authored via drag handles; material is operator-authored via in-strip modifier-click.

- **In a strip's body** (the TL strip area between curb and `treelawnOuter`, or the SW strip area between `treelawnOuter` and `propertyLine`) → toggles that strip's material between LU and SW. Menu-free; binary toggle. Writes to `chain.measure[side].materials.<outer|inner>` (Edit-entire-row mode) or `blockCustoms[blockKey][edgeOrd].materials.<outer|inner>` (Edit-block mode), same scope rules as drag.
- **On a handle** → handle-drag-only (no modifier gesture). Drag adjusts width; click does nothing.

The dispatcher at `handleCtrlOrRight(e)` (lines 752-773) first tests for a handle-hit (no gesture); otherwise treats the click as in-strip and flips the material of the strip at the click radius.

Default materials per leg: `{outer: 'LU', inner: 'SW'}` — preserves the V1 visual (cream sidewalk on the property-side, treelawn-blending-with-parcel on the curb-side). Swapped: `{outer: 'SW', inner: 'LU'}` — cream sidewalk on the curb-side, parcel-blending on the property-side.

Corners are NOT operator-overridable in V1.5 (AASHTO doctrine: corners are structural, both sub-fields = SW always regardless of leg material assignment). V1.6+ may add per-corner overrides. **(Target, not yet built — `SECTION.md §6`: the corner material refinement is SW↔SW → concrete→LU; a bent-polygon attempt was reverted 2026-06-10.)**

Future affordance for >2 materials: same click target; opens a small material picker at the click location. V1.5 ships menu-free with the binary LU↔SW toggle.

**Other gestures:**
- Empty click on canvas → no action (operators pan a lot; silent deselect was too easy to trigger).
- Double-click → `deselectStreet()`. (Spec-divergent vs NOTES:3549-3551 which says double-click should insert a stripe split — see §6.5.)
- Escape / Enter → deselect.

### Handles, anti-overlap stagger

Up to 3 handles per side per click anchor: `pavementHW` (the asphalt edge — dragging this is also dragging the block-edge silhouette, since `block = stencil − asphalt`), `treelawnOuter`, `propertyLine`. Pill geometry 5m long × 1.2m wide, oriented with long axis along the street. White fill + black border, opacity 1, depthTest false, renderOrder 149/150 so they paint over the translucent ribbons.

Anti-overlap pass (MeasureOverlay.jsx:381-405): when two handles on the same side have similar `r` (within `HANDLE_LONG + 0.5`), the staggers shift them along the street tangent in alternating fore/aft offsets. The `r` value (perp distance from centerline) is preserved — only the visible along-street position changes; drag still resolves to the correct boundary radius.

### §5 archive — superseded pre-V1.5 gesture model

Before V1.5 (the 16-fields + per-leg material swap doctrine), the right-click / ctrl-click gestures handled **boundary add/subtract** semantics inside the Measure tool:

- **On a handle** → delete that boundary (collapse stripe). `treelawnOuter` collapsed treelawn into sidewalk; `propertyLine` removed ped zone entirely (`terminal: 'none'`).
- **In an empty band** → insert a boundary at click radius (split sidewalk into treelawn + sidewalk, or re-seed `terminal: 'sidewalk'` from `'none'`).

**Retired because:** V1.5's 16-fields construction has a FIXED two-strip layout (TL + SW always present, sized by drag). The add/subtract semantics are structurally unneeded — there's no "empty band" to insert into, and no "collapse to one stripe" state. Material flip replaces them as the in-band modifier-click action.

Implementation trace: `tryDeleteHandle(p)` + `tryInsertBoundary(p)` in `MeasureOverlay.jsx:684-751` formerly did the add/subtract; V1.5 retires both in favor of `tryFlipStripMaterial(p)` invoked from the same `handleCtrlOrRight(e)` dispatcher.

---

## §6. Active failure modes — LIVE

> **This is the front of the work.** Every session adds/updates/closes entries here.
> Closed failure modes (6.1, 6.2, 6.8, 6.9, 6.10) + the §7 History table are archived a layer deeper → [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md). Only LIVE/open modes remain below.

### 6.3 49 residual SELFINT band rings repo-wide — OPEN

Repo-wide scan: `scratch/all-band-selfint-scan.js`. Down from 70 post-revert. Remaining categories:
- Long curved per-fe polylines where the inward offset folds (chain 91 `382.5,114.5` with 64 verts; chain 143 `653.5,-236.5` with 26 verts). Pre-existing at `ed29700` baseline. SELFINT triangulates as opaque artifact.
- Arc-span sub-5m² cusps on smallest-R corners that survive the 0.9× cusp guard.

**Fix candidates:**
- Tighten cusp guard (0.9× → 0.85× or smaller) — narrows safe band depth at smallest-R corners; trade-off vs visible depth reduction.
- DP-simplify per-fe polyline before offset — collapse the curved-chain wiggle that's causing the inward offset to fold.
- Per-fe polyline-offset via `Clipper.OffsetPaths` with `jtRound` (same approach as the queued curb-stroke Path-b fix).

**Status:** surfaced, deferred. Likely contributing to §6.1.

### 6.4 Curb stroke gaps on long curves — OPEN

**Symptom:** the curb stroke (`dilate(asphaltRounded, cw) − asphaltRounded`) shows visible sliver gaps on long gentle curves where the dilate-difference boundary computation hits Clipper precision. Visible at LS on Mississippi-class curved chains.

**Failed fix (Phase 2.2, `c360fc2`, reverted `3a80549`):** morphological closing (`dilate(rawCurb, 0.08m) − erode(rawCurb, 0.08m)`). Structurally wrong — dilate-erode precision tax cascades into adjacent block geometry via shared boundary edges, producing black voids in block interiors AND still missing curb stroke on long curves.

**Queued fix (Path-b polyline offset):** `Clipper.OffsetPaths` with `EndType.etClosedLine` + `JoinType.jtRound` on the asphalt boundary directly. Bypasses polygon-vs-polygon Clipper ops at the stroke output entirely. ~50 LOC.

**Status:** queued for cold-baby dispatch.

### 6.5 Phantom park[0] from `classify.js:60` — OPEN

`classify.js:60` stamps `type='park'` on any face whose centroid falls inside an overlay tagged `leisure=park` OR `leisure=garden`. OSM has 245 `leisure=garden` features in LS (residential front yards, courtyards) + 3 real `leisure=park` (Lafayette, Buder, Eads). First-match-wins centroid test: a large polygonization face (470 × 420m on west of Lafayette Park where chain network couldn't subdivide) gets stamped 'park' because its centroid lands in a garden.

**Fix (~3 LOC):** narrow `'park'` overlay bucket in `classify.js:60` to actual parks only; drop `leisure=garden` (should fall through to `recreation` or the OSM_TO_LU vote).

**Status:** queued, independent of corner work.

### 6.6 MeasureOverlay `onDblClick → deselectStreet()` vs spec — COSMETIC

`MeasureOverlay.jsx:777-783` reads double-click as deselect. NOTES:3549-3551 spec says double-click should insert a stripe split (treelawn/sidewalk boundary). Surface-only divergence; cosmetic. **Status:** deferred.

### 6.7 Stale comments + PHASE 2 SUPERSEDED placeholder — HOUSEKEEPING

- `cornersAtIx` has 3 docblocks referencing retired `buildCornerPadQuad`.
- FEATURES corner-plugs subsection (was lines 76-104 pre-migration) carries `[PHASE 2 SUPERSEDED]` placeholder marker.

---

## §7. History — what we tried and what we learned

→ Migrated to [`_archive/RIBBONS-history-2026-06-12.md`](_archive/RIBBONS-history-2026-06-12.md) — the 13-month corner saga (what was tried, what failed, why). The load-bearing **invariants** it produced live in §1 ("INVARIANTS THAT SURVIVE THE REWRITE") + §3.9a.

## §8. Glossary

- **fe** — frontage edge. A polyline along one block-edge between two block-corner vertices. One emission unit for straight-span bands. Owns `chainIdx`, `side`, `blockKey`, `edgeOrd`.
- **edgeOrd** — 0..N-1 ordinal index of an fe around its containing block ring. Combined with blockKey forms the per-block-edge customs key.
- **blockKey** — bbox-stable identity of a block ring. `"${roundTo0.5(bboxCx)},${roundTo0.5(bboxCy)}"`. Stable under width changes IFF the changes don't shift the bbox center past a 0.5m grid line.
- **arcMeta** — sidecar produced by `applyRoundCornersToRing` alongside the rounded ring. Per-vertex `{ corner, R, arcPositionFrac } | null`.
- **cw / tl / sw** — curb width / treelawn / sidewalk. Cross-section depths in meters, measured perpendicular to chain from outboard inward.
- **terminal** — outer terminus of the ped zone. `'sidewalk'` (ped zone present, ends at property line) or `'none'` (no ped zone).
- **anchor** — `'center'` (default — chain runs at carriageway center) or `'inner-edge'` (divided carriageway authoring mode; inboard ped zone collapsed).
- **innerSign** — ±1, which perp side faces the median (inner-edge anchor only).
- **pairId** — for divided carriageways, the mate's skelId.
- **span** — a contiguous run of vertices in a rounded-block ring with the same `arcMeta` corner identity. `'arc'` (corner.identity non-null) or `'straight'` (null).
- **regime** — the arc-span band emission strategy: ASYMMETRIC / SYMMETRIC-WITH-RAMP / SYMMETRIC-NO-RAMP. Picked from flanking-meta depths.
- **Vc** — corner Q point. The first crossing of two adjacent legs' offset polylines (polygon-edge-Q).
- **PRI** — paint render index. Designer's per-material renderOrder slot. Different from polygonOffset and Y-lift; see `ARCHITECTURE.md §8` "Layering / coplanar stacking" decision table.
- **D.x** — phase tags from the 2026-05-10/11 migration sequence (D.3c = polygon-walking band emission, D.5/D.6 = block-edge customs, D.7 = walker identity-driven, D.7a = customs through corners, D.7d = ped-zone coverage from frontageBands only).

---

*Updated: 2026-05-31. Boz toy-reset session post the V1.6 close. §5 measure-tool model updated for V2-Measure polygon-only authoring (`72cd0a7`); §6.8/6.9/6.10 marked RESOLVED by V1 keystone (`025ee40`) with historical text preserved; §7 history table appended with V1 keystone, V1.5 swap, V2-Measure, V1.6 entries. **Next pickup:** C5 cutover (LS → mono-width ring-band emitter; flip `useRingBandEmitter` from `scene === 'toy'` default), then chain-consumer census, then the wall-move (corners + shape into Survey per `[[project_skeleton_is_the_first_bake]]`). See `HANDOFF-ls-migration.md` for the C5 brief.*
