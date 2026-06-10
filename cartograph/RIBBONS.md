# Ribbons & Corners — canonical reference

**Status: v0.9 (2026-05-31) — living doc.** This is the central reference for the ribbon + corner system. It evolves every session until the corner problem is closed. (v0.9: §5 measure-tool model updated for V2-Measure polygon-only authoring; §6.8 / §6.9 / §6.10 marked RESOLVED by V1 keystone with historical context preserved; §7 history table appended with V1 keystone, V1.5 swap, V2-Measure, V1.6 entries. v0.8: §3.9 reworked to document the live **dual-emitter** state — the mono-width ring-band keystone on toy + the legacy per-leg split on LS — and the §1 status note brought current with the post-revert rebuild.)

> Part of the cartograph quintet alongside `FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`. **Read this before any geometry / corner / curb / intersection / ribbon work.** Most regressions in this repo trace to someone re-deriving a points-and-chains framing for a problem this system already answers. The doctrine in §1 is load-bearing. The pipeline walkthrough in §3 is the implementation. The failure-mode inventory in §6 is the live front of the work.
>
> Pointed at from: FEATURES.md (doctrine section replaced by pointer), ARCHITECTURE.md (helper map), BACKLOG.md (every ribbon/corner phase), NOTES.md (recent sub-entries cite this doc for the doctrine, carry only iteration archeology themselves).

---

## §0. Scope + how to use this doc

**This doc covers:** the ribbon cross-section (asphalt / curb / treelawn / sidewalk), the corner wrap at every IX, the block polygon as authoring substrate, the bake's flattening to slab, and the Designer/Stage/Preview render side that consumes them. It covers V2 — the rounded-block-clip regime that supersedes V1's per-corner-primitive stack (retired in `0286cb1`).

**This doc does not cover:** survey/centerline derivation (FEATURES §"Authoring is linear-but-concurrent" + skeleton.js), Stage look authoring (FEATURES §"Stage"), Preview QA (FEATURES §"Preview"), Arborist tree atlas, Meteorologist clouds.

**How to use it:**
- New session, touching ribbons or corners → read §1 (regime) + §6 (active failure modes) first. Skim §2-§5 as needed.
- Implementing a phase → read §3 for the relevant function, §6 for the failure mode it addresses, §7 for what was tried and didn't work.
- Closing an arc → update §6 (move from "live" to "closed"), update §7 (add the lesson), bump version line at top.

**Don't re-derive from code or memory.** Code drifts faster than doctrine; memory is point-in-time. If §3's pipeline narrative conflicts with the code, the code probably moved — flag it and update this doc.

---

## §1. The regime, in plain words

> ⚠️ **2026-06-01 — SUPERSEDED IN PROGRESS by the TILE model (the re-pour).** The figure-ground / mono-width regime this doc describes is being **replaced** by the tile construction: *tiles = faces of the centerline graph; the centerlines are the grout; strips are painted INWARD per tile; the corner is the inward-offset, never a figure-ground residual.* **LS now runs tiles, unflagged** (`src/lib/tileGround.js`); figure-ground (`buildBlockGeometryV2`) is **dead-in-place**, deleted at **T4**. **The live State is [`HANDOFF-tile-feature-ledger.md`](../HANDOFF-tile-feature-ledger.md)** (the dense point-cloud) + [`HANDOFF-pipeline-reconception.md`](../HANDOFF-pipeline-reconception.md). **This doc's full rewrite — §1 regime, §3 pipeline, §6.8/6.9/6.10 honest-close — lands at T4** (figure-ground deletion). Until then, the figure-ground prose below is historical-but-still-in-code; **read the ledger for the live construction.** (And note: **§6.8/6.9/6.10's "RESOLVED" is false** — resolved on toy's mono-width, *never true on LS*; superseded by tiles. The corner that "dogged figure-ground for 13 months" is solved by the tile model, not by the keystone those entries credit.)

> ⭐ **INVARIANTS THAT SURVIVE THE REWRITE (read before touching tile corners).** The *emitter mechanics* below are superseded; these *corner principles* are substrate-independent and **bind the tile construction too** — they are NOT figure-ground-only. Building against them is mandatory; if your construction can't honor one, stop and flag Boz rather than improvising a parallel mechanism:
> 1. **The corner is the band BENT around the arc** — a slice of the same continuous concentric offsets — **never a separately-constructed primitive** (no per-corner pad, no per-vertex fillet *as the corner*). §3.9a.
> 2. **Concentric ped-band offsets use `jtMiter`, never `jtRound`** — jtMiter inherits an already-rounded ring's arcs as concentric nested arcs AND passes operator-authored R=0 squares through sharp; jtRound re-rounds every corner by radius=depth (a second rounding mechanism) and corrupts squares. §3.9a step 7. *(This was the 2026-06-02 tile divergence: `tileGround.offsetRings` used `jtRound`; fixed to `jtMiter` — see `feedback_consult_ribbons_canon_before_constructing`. The curb silhouette is still rounded once by `filletRing`, which is the legit single rounding analogous to `applyRoundCornersToRing`; the bands now jtMiter-inherit it.)*
> 3. **The ADA corner pad is a band-slice**, not predicated on the arc — so it works square OR round.
> 4. **Mono-width** per block/run, not per-leg stitched.

> **2026-05-30 status note (supersedes the 2026-05-27→28 revert note).** The uniform-width arc was first attempted (C0–C5 + two post-C5 buildPedBand attempts) and REVERTED (`ea0bed6`) after the operator visual gate failed at every IX corner. It was then **rebuilt cleaner** as the **mono-width ring-band emitter** (`emitBlockRingBands` → `emitOneBlockRingBands`) and **shipped on toy 2026-05-29** (Quoin's session): three uniform inward Clipper offsets of `blockRounded` (`cw` / `cw+TL` / `WB`) → 2 strips + sector slicing, with `jtMiter` (preserves operator R=0 squares), R=0 authorable, the per-block capacity guard, and the V1.5 per-leg material swap all landed. **The mono-width model now IS the doctrine below** — §3.9a documents it. **LS still runs the legacy per-leg split** (`silhouetteStraightEmitter` + `buildFrontageBandsV2`, §3.9b) until the **C5 cutover** flips `useRingBandEmitter` (`scene === 'toy'` today). The earlier "not implementable on a rounded silhouette" conclusion was wrong: the missing piece was *round the block first, offset the polygon* — exactly what the keystone does.

### The model in one sentence

**Blocks are positive space; streets are the void around them; everything visible at street level — asphalt, curb, sidewalk, treelawn, corner mouths — is a property of the block polygons' silhouettes, not of the chain centerlines that derive them.**

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

**Divided-carriageway frame topology (upstream, `skeleton.js` — how paired carriageways reach this transform).** Three facts, all landed 2026-06-03 (`TRUMAN-FORENSICS.md` is the forensic record):
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

### 6.1 Black ring around every block (the "L-strip") — RESOLVED 2026-05-17 (commit `9cf12c4`)

**Symptom:** a thick continuous dark band visible around every block's perimeter in Designer with Aerial OFF, sitting between the block face fill (e.g. park-green) and the asphalt edge. Most visually obvious at Lafayette Park because the authored polygon at `park-polygon.json` (halfWidth=175m, fence position) is materially smaller than the actual block silhouette extending to the asphalt edge (~±185m), exposing a ~4m wide strip of canvas-ground (`#2A2826` near-black). Same mechanism on every block where the polygonized face is smaller than the rounded block silhouette.

**Root cause (diagnosed via Jacob's hypothesis 2026-05-17, after Stage 1-3 chased the wrong target):** `buildBlockGeometryV2.js:2316` intersected each face's authored polygon with its owning blockRounded ring:

```js
const clipped = owning ? intersectRings([face.ring], [owning]) : ...
```

When `face ⊂ owning` (the common case: authored polygons represent block features like fences or polygonized parcels that don't reach the asphalt edge), the intersect returned the SMALLER face. blockFill shrank to the face's extent. The ped-zone strip between the face's outer edge and the band-property-line had no fill underneath → canvas-ground showed through.

**This was a doctrinal violation.** Per §1: ribbons define the void by expressing inward from chains; the block IS whatever they leave over (= `owning` = blockRounded ring). The authored face is a LU LABEL, not a geometry source. The intersect treated face as a geometry constraint, conflating LU-tag with extent.

**Fix (3 lines, commit `9cf12c4`):**

```js
const clipped = owning
  ? [owning]                                       // ← was: intersectRings([face.ring], [owning])
  : (asphaltRounded.length ? differenceRings([face.ring], asphaltRounded) : [face.ring])
```

The straddle-fallback (`differenceRings` against global `asphaltRounded`) is preserved for faces that span multiple blocks (rare on LS). `face.use` continues to flow into `lu` via line 2330; `blockKey = blockKeyFromRing(owning)` (same key the rest of V2's `ringByKey` builds were already using). Net effect: every blockFill extends to the rounded asphalt silhouette regardless of how small the authored face is.

**Why we burned a session chasing H1 first:** Stage 1's diagnostic narrowed on "drifted straight fes overshooting by up to 8.3m" (real defect, §6.2 below) and we anchored the L-strip symptom on it. H1 IS a real defect — but the *visible* L-strip wasn't from band overshoot, it was from missing blockFill underneath where bands themselves would render fine. The pivot point: Jacob's "the internal land-use geometry isn't firing... the polygon there isn't ribbon-derived" hypothesis, which pointed at the face-clip semantic the H1 framing had silently assumed away. Lesson: when a visible symptom looks like material trespass, also test for material absence (canvas-through). Aerial-toggle is the discriminator (canvas-gap shows aerial; opaque trespass stays opaque).

**Closes:** v0.4 commit `9cf12c4`. §6.2 (H1) remains a separate open defect; that work continues in Stage 5.

### 6.2 D.7a keying-system divergence: pass-2 `ringByKey` vs pass-1 `fe.blockKey` — RESOLVED 2026-05-17 (commit `48d8135`)

**Mechanism (exact):**

- `buildFrontageBands` (line 1374) builds `ringByKey` via `blockKeyFromRing(blockRoundedRing)` on each pass-2-derived rounded block ring. **These are pass-2 keys.**
- Each fe arriving at `buildFrontageBands` has `fe.blockKey` set to the **pass-1** value, because pass-2's `buildFrontageEdges` output is overwritten at line 2149: `fe.blockKey = p1.blockKey`. This was done so `blockCustoms[fe.blockKey][fe.edgeOrd]` resolves to the same customs entry the operator wrote against pass-1 keys.
- **The two keying systems disagree for 295 of 506 straight fes (58%).** When pass-2 asphalt expansion shifts a bbox center past a 0.5m grid line, `blockKeyFromRing` rounds the pass-2 ring to one key while `fe.blockKey` carries the pass-1 key. `ringByKey.get(fe.blockKey)` returns undefined → clip block at lines 1440-1462 silently `continue`s → band rings emit unclipped from the offset polyline.
- Unclipped offset polylines extend up to **8.306m** past the rounded silhouette into the corner mouth (Stage 2 worst-offender: Truman Parkway `653.5,-236.5` edgeOrd 0). 248 fes carry >0.5m overshoots repo-wide. **This is the L-strip black mechanism in §6.1.**

**Pre-existing back to ed29700:** `buildFrontageBands` body is comment-only-diff between ed29700 and HEAD. Latent defect from the D.7a customs migration. Never visible before because (a) opaque ribbons trespassing into the asphalt-color corner mouth blend with the asphalt at normal viewing, (b) Aerial-mode + the operator clicking park-adjacent chains is the specific condition where the overshoot reads against a non-asphalt backdrop.

**Fix shape (Stage 3, ~15 LOC):**

Per-fe containment resolution at clip time. Don't build a key→ring registry at all; for each fe, find the owning ring directly by interior probe + `pointInRing`. The registry indirection was the trap: registering rings under fe blockKeys collapses when multiple fes with DIFFERENT pass-1 blockKeys land in the same pass-2 ring (drift-collision case) — only the first wins, the others fall through unclipped.

```js
// In buildFrontageBands, replace the existing ringByKey build + per-fe lookup
// with per-fe containment resolution:
if (blockRounded?.length) {
  for (const fe of out) {
    const probe = fe.treelawnRings[0]?.[0] || fe.sidewalkRings[0]?.[0]
    if (!probe) continue
    let owningRing = null
    for (const ring of blockRounded) {
      if (pointInRing(probe[0], probe[1], ring)) { owningRing = ring; break }
    }
    if (!owningRing) continue
    const clip = [owningRing]
    if (fe.treelawnRings.length) fe.treelawnRings = intersectRings(fe.treelawnRings, clip)
    if (fe.sidewalkRings.length) fe.sidewalkRings = intersectRings(fe.sidewalkRings, clip)
  }
}
```

Same O(rings × fes) complexity as the keymap approach. No registry; no collision-loss. This matches what Stage 2's `scratch/h1-backfill-dryrun.js` simulated and validated: **257/295 drifted entries (87%) resolve to their true owner via containment, all real overshoots collapse to zero on lookup-OK fes.** The 38 unresolvable fes (band probe falls outside every rounded ring — degenerate band geometry, sub-1m² edge cases) are left unclipped and have no visible artifact today.

**An earlier sketch in v0.1 had this backwards** (registry-build keyed by first-owning-fe's blockKey, ring-outer iteration). That algorithm only resolves drift-collisions for the first fe-per-ring; subsequent fes sharing the ring but having different blockKeys fall through. Stage 3's first attempt implemented that sketch faithfully and resolved only 144/295 drifted fes (49%) — the L-strip stayed visible. Per-fe iteration is the correct shape. Lesson: when the diagnostic dry-run validated a containment join, port the dry-run's algorithm directly, don't translate it into a registry pattern.

**Why this over "thread pass-1 frontageEdges into the helper":** the containment resolution is local to `buildFrontageBands`, no signature change, no pass-1 lookup plumbing. Per `feedback_corner_pad_continuity_first`-adjacent logic, identity (which ring contains this fe's probe) beats geometric heuristic (find ring by key); per-fe direct resolution IS identity.

**Status:** RESOLVED 2026-05-17 (commit `48d8135`). Per-fe containment ring resolution shipped. Note: H1 closes the underlying geometric defect (248 fes >0.5m overshoot) but did NOT visibly close the L-strip (§6.1 was actually the face-clip doctrine violation, closed separately in `9cf12c4`). H1's overshoots had been masked visually by the asphalt + curb stroke painting on top of them; H1 is a latent structural fix, not the cause of the visible black-ring symptom. Lesson recorded in §7.

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

### 6.8 Corner-interior regime emitter deviates from concentric doctrine — RESOLVED 2026-05-29 (V1 keystone, `025ee40`)

**Closed by:** the V1 keystone construction (`emitOneBlockRingBands` per §3.9a) retired the three-regime (ASYM / SYM-WITH-RAMP / SYM-NO-RAMP) arc-span emitter entirely. The corner is no longer constructed as a separate primitive — it's a slice of the two continuous Clipper-offset bands. Concentric-with-the-curb is literally true by construction (the rings are inset polygons of `blockRounded`). The historical text below is preserved for context; the diagnosis stands as instructive but the failure mode no longer exists in the live emitter.

— Historical (pre-V1 keystone) record below —



**2026-05-28 status update.** The HANDOFF-ribbon-corners.md uniform-width-model attempt aimed to resolve §6.8 by retiring the three-regime emitter and treating the corner as a single inward Clipper offset of `blockRounded` (`cw + W`, W = max-leg width). The arc landed (C0–C5 + post-C5 buildPedBand attempts) but the operator visual gate failed: the per-leg emitter's STRAIGHT-only partition continued to produce square outer corners at the rounded silhouette regardless of how the corner-emitter was shaped (see §6.10). Entire code arc reverted; §6.8 remains OPEN.

— Pre-revert historical record below —


**Symptom:** at every IX corner the visible interior of the corner zone (the bands as they wrap the rounded silhouette) reads as a *constructed plug between two straight ribbons* rather than as *continuous concentric arcs wrapping the silhouette*. Doctrine (§1, "the ribbon wraps the silhouette"): each band depth (curb at cw, treelawn outer at cw+tl, sidewalk outer at cw+tl+sw) emerges as a nested inset arc around the same effective corner center — concentric, like a target. Implementation in `buildFrontageBandsV2`'s three-regime emitter does not produce this geometry on ANY corner today.

**Audit (Stage 6, 2026-05-17, `scratch/corner-regime-audit.{js,csv,report.md}` — 355 arc-span entries on LS):**

| regime | count | what it emits | concentric? |
|---|---|---|---|
| NEITHER-EMITTED | 128 (36%) | no band rings (both flanking spanMeta skip) | n/a — no emission |
| SYM-NO-RAMP | 104 (29%) | single sidewalk band | no — only one band, no nesting |
| SYM-WITH-RAMP | 98 (28%) | concentric tl + sw outside ramp; full-depth sw wedge inside ramp | partially — wedge breaks the concentric arc in the middle |
| ASYM | 25 (7%) | single sidewalk plug with angular step at midpoint | no — angular step, no nesting |
| **doctrine-correct** | **0 of 355** | | — |

**Doctrine violations:**
- **0 corners produce strictly doctrine-correct continuous-wraparound concentric.** Even the SYM-WITH-RAMP outside-ramp-window portion is concentric in pieces; the ramp wedge in the middle breaks it.
- **8 ASYM corners are visible "treelawn drop" cases** — operator authored tl > 0 + sw > 0 on both flanking sides, but the regime dropped the treelawn and emitted only a single sidewalk plug. e.g., Grattan × Lasalle, Truman × Lafayette.
- **18 of 25 ASYM corners sit at `diff ∈ [1.0, 1.5)m`** — the binary `PHASE2_ASYM_EPS_M = 1.0` threshold flips at marginal asymmetry. The threshold is too crisp; smooth-taper handles these cleanly.

**Surfaced anomalies (Stage 6 baby):**
- Cusp guard fires on 22.5% of corners (vs the 5% flag threshold) — `0.9·arcR` is too tight, OR authored R is too small for typical ped-zone depths, OR the depth-to-R ratio doctrine needs revisiting.
- One IX has exactly 3 arc-spans (symmetry expects 2 or 4) — surface for verification.
- One corner at θ=165.9° passes the 5°/355° through-T filter but is effectively collinear — filter threshold may need tightening.
- NEITHER-EMITTED dominates at 36% — bigger than expected; mostly park-perimeter + non-asphalt-facing block edges (block-to-block boundaries with no chain on one side). Verify these are all legitimate skips, not authoring oversights.
- 32 SELFINTs land inside arc-span emission (subset of §6.3's repo-wide 49). Most concentrate at smallest-R corners surviving the cusp guard.

**Fix shape (Stage 7, queued):** structural rewrite of `buildFrontageBandsV2`'s arc-span branch. Replace the three-regime branching with a single concentric tapered emission path:
- Emit two nested arc rings per arc-span entry: treelawn (outer at cw, inner at cw + tl) + sidewalk (outer at cw + tl, inner at cw + tl + sw).
- Asymmetric corners (d_A ≠ d_B): linear interpolation of tl + sw depths along the arc, from flanking-A values at one end to flanking-B values at the other. Smooth taper; no step.
- When tl = 0 on either flanking side: emit only the sidewalk ring at that taper segment. Single-band concentric is still concentric.
- Retire the SYM-WITH-RAMP ramp wedge entirely. Retire PHASE2_ASYM_EPS_M / PHASE2_ASYM_RATIO / PHASE2_RAMP_MAX_M / PHASE2_RAMP_FRAC / PHASE2_RAMP_MIN_M / PHASE2_STEP_FRAC constants.
- Keep the cusp guard. Re-evaluate its 0.9× threshold based on Stage 7's bake — may need tightening.
- NEITHER-EMITTED skip remains structurally (no flanking sidewalk on either side = nothing to emit) but add a probe-validity assertion since 36% is high enough to suspect operator authoring oversights worth surfacing.

**Status:** PARTIAL-RESOLVED 2026-05-18 (commit `3cafe7f`). Multi-stage arc landed: Stage 7 retired the three regimes in favor of concentric tapered emission (uncommitted); Stage 8 attempted to walk blockRounded for all band emission (uncommitted, reverted because the Bezier consume-span absorbed interior fe vertices, leaving ~30% of LS fes with no straight-span emission at all — visible as "scattered fragments" instead of continuous bands); Stage 9 landed single-polygon symmetric corner pad emission (`dCorner = max(d_A, d_B, RAMP_MIN_M=1.5)`) over the restored pre-Stage-8 per-sharp-fe leg emission. The corners now produce solid sidewalk-material pads spanning rounded silhouette to property line, with H1 per-fe-containment clip ensuring straight bands trim cleanly to within blockRounded. Visual outcome (Image 21): legs continuous along all block edges; corners produce real ADA-style pads at 3-of-4 IX corners; the 4th corner has no pad emission — see §6.9 for the residual.

**The shipped architecture in `3cafe7f`:** `buildFrontageBands` (per-sharp-fe with H1 clip) emits straight-side legs from sharp fe polylines + `buildFrontageBandsV2` (Stage 9 single-polygon symmetric corner pad over Stage 8's chainMeta scaffolding REVERTED back to pre-Stage-8) emits arc-span corner pads. Pipeline concats both. Straight bands and corner pads OVERLAP at the corner zone (different rings: blockSharp vs blockRounded); the corner pad's outer edge follows the rounded silhouette and its inner edge at depth `dCorner` covers the straight band's sharp angular inner edge underneath — no visible gap at clean inputs.

**What was retired in this arc:** the three-regime emitter (PHASE2_ASYM / SYM-WITH-RAMP / SYM-NO-RAMP) constants + branching from `buildFrontageBandsV2`. The blockRounded-walking spine architecture (Stage 8). The chainMeta sidecar, bridge fix, and customs-lookup refactor (all uncommitted work, reverted with the spine).

**Doctrinal note:** the figure-ground inversion (RIBBONS §1) is preserved because the visible CORNER geometry derives from blockRounded (corner pad's outer edge is the rounded silhouette arc). The legs' source-from-sharp-fe is a pragmatic implementation choice — the visible result is bounded by blockRounded via the H1 clip, so from the operator's POV the bands appear inset from the rounded silhouette regardless of which ring they were emitted from.

### 6.9 Corner-input-preparation produces non-uniform output across IX corners — RESOLVED 2026-05-29 (V1 keystone + V2-Measure)

**Closed by:** the V1 keystone's per-block scalar resolution (`bakeFeScalars` at fe-construction computes `blockScalars[blockKey].W` once per block from per-fe `fe.measure` resolved through `blockCustoms` precedence) replaced the four-corner-records-each-with-its-own-input-preparation path. Input variance across corners on the same IX no longer exists as a class — each block independently resolves its own scalars from its own fes. Datum's V2-Measure (`72cd0a7`) further hardened this by making `blockCustoms` the canonical per-fe authoring target (no chain.measure leakage). Historical text below preserved for context.

— Historical (pre-V1 keystone) record below —



**2026-05-28 status update.** The arc that aimed to retire §6.9 by structurally collapsing all per-corner construction to a single inward offset (HANDOFF §3) did land that machinery but was reverted along with §6.8's resolution attempt — the upstream per-leg straight-only partition is the actual blocker (§6.10). When the rewrite goes in, §6.9 should be re-evaluated: the input-preparation drift it documents may have already been structurally retired by C4.5's `fe.measure`-bake (which was the part of the arc that genuinely held; reverted with the rest, but the doctrinal insight is preserved).

— Pre-revert historical record below —


**Symptom:** at a single IX, the four corner records (one per CCW leg pair) produce four different qualities of arc-span emission, despite all flowing through the identical Stage 9 single-polygon symmetric emitter code. Image 21 evidence at Mississippi × Park: SW correctly empty (park-interior, both flanks terminal=none), SE wrong-size symmetric pad, NE self-intersecting pad, NW correct shape but scaled to 60% of authored depth.

**Diagnosis (Stage 10 audit, commit `79fcd9e`, `scratch/corner-input-audit.{js,csv,report.md}`, 666 corner records on LS):** the variance is in input-preparation upstream of the emitter. The four corners come from four separate `buildFrontageBandsV2` block-ring walks (one per block at the IX), each with its own flanking-meta resolution through `applyRoundCornersToRing` (TOL=0.5 vertex match), then `findAdjacentChainForBlockEdge` (outward probe to nearest chain in `ribbons.streets`), then per-flank `terminal` / `tl` / `sw` lookup. Threshold-based discontinuities at each layer produce qualitatively different emissions on superficially symmetric inputs.

**Failure-mode histogram (666 corners on LS):**

| mode | count | % | emits arc-span? | visible defect? |
|---|---|---|---|---|
| ok | 50 | 7.5% | yes | no (32 of 50 have cusp-fired-but-clean — see §6.9c) |
| no_match (unmatched vertex, dist ≥0.5m) | 177 | 26.6% | no | no — corner records whose Vc lands 5-300m from any block (divided-pair endpoints, park-perimeter outliers); only 3 sit at 0.5-1.0m where tightening TOL would help |
| no_match (matched but notConvex/smallR) | 135 | 20.3% | no | no — vertex matched but Bezier skipped (winding-aware convex test or R≤0.05 floor) |
| flanking_skip | 126 | 18.9% | no | NO — `if (!Bmeta && !Ameta) continue`, doctrine-correct skip for bilateral no-ped-zone (e.g. park interior) |
| **wrong_flanking** | **170** | **25.5%** | **163 yes / 7 no** | **YES — dominant defect bucket** |
| selfint | 8 | 1.2% | yes | yes — pad ring self-intersects (subset of wrong_flanking with cusp fired) |
| cusp_ramp_collision | 0 | 0% | n/a | n/a — `RAMP_MIN_M = 1.5` never fires on LS (`cw=0.45 + min(tl+sw) > 1.5` always); dead code under current authoring |

**Hypothesized taxonomy was wrong in three ways** (per Stage 10) and the post-Stage-10 `adj=null` hypothesis was wrong in a fourth way (per Stage 10.5):
1. `cusp_ramp_collision` doesn't exist on LS as authored — RAMP_MIN_M is inert.
2. `no_match` is not a tunable-TOL bucket — 174 of 177 unmatched-vertex cases sit >1m from any block; loosening TOL=0.5 fixes ≤3 corners.
3. The dominant visible defect (`wrong_flanking`) splits into multiple sub-modes:
   - **`terminal='none'` sub-case** — one flank authored `terminal='none'` (operator intent: no ped zone). The emitter's `?? Ameta?.tl ?? Bmeta?.tl` fallback mirrors the OTHER flank's depths, producing a symmetric pad where the operator authored asymmetry.
   - **`adj=null` sub-case** — `findAdjacentChainForBlockEdge` returned null for one flank's straight-span.
4. **Corrigendum (Stage 10.5, commit `0bc0cd9`):** the v0.8 framing of `adj=null` as alley-bordered authoring was REFUTED. Only 2.6% of `adj=null` flanks (10/388) border an OSM `service:alley`; another 2.6% are `truly_void`. The dominant 95% is structural — the probe never runs at all because the partition has no probeable flank:
   - **`adjacent_arc_span` (67.5%, 262/388)** — the partition span adjacent to this arc-span is itself another arc-span. Small-block IXs where two corners' Bezier consume-spans meet at the block's front edge with no straight between. `prevSpan?.type === 'straight'` is false → `{skip: true}` meta → effectively undefined flank depth.
   - **`degenerate_span` (27.3%, 106/388)** — the partition straight exists but has <2 vertices (Bezier consume ate everything but one). `findAdjacentChainForBlockEdge` returns null at `if (N<2) return null` before the probe loop runs.
   - The probe itself is NOT buggy. `something_unexpected = 0/388` — there are no cases of a real ribbon-street within 15m that the probe missed.

**Mississippi × Park reference IX (4 corners at V = (229, -158.9)):**

| corner | flanks | mode | k_cusp | dCorner | padArea | note |
|---|---|---|---|---|---|---|
| SW | both terminal=none | flanking_skip | n/a | n/a (no emission) | 0 | park-interior, doctrine-correct empty |
| SE | tl/sw + terminal=none | wrong_flanking | 0.799 | 4.05 | 27.02 | mirrors authored side onto no-ped-zone side |
| NE | adj=null + tl/sw | selfint(+wrong_flanking) | 0.745 | 4.05 | 11.76 | prev-flank probe returned null (alley?) |
| NW | both authored | ok | 0.598 | 4.05 | 25.25 | emits cleanly but at 60% of authored depth (cusp scaling) |

**Stage 11/12 arc — what shipped, what reverted, doctrine settled (2026-05-18 EOD):**

Five commits landed in this arc: `48d8135` (H1 per-fe ring resolution), `3cafe7f` (Stage 9 single-polygon pad), Stage 10 + 10.5 audits, Stage 11a meta-resolution ring-walk (`44ca974`), Stage 11a.1 partition-artifact vs authored-zero (`e710441`), Stage 12 sub-A silhouette-walking straight-span emitter (`e000b75`), Stage 12 sub-A.1 chain-tangent-coherence kink-split (`54d5e8b`). Stage 12 sub-B (concentric arc-span emission + Stage 9 pad retirement) shipped bundled into commit `a5c1844` but produced "worst failure yet" visually and was reverted to sub-A.1 state in `a7f2791`.

**Current architecture (HEAD = `a7f2791`):**
- `silhouetteStraightEmitter` (sub-A + sub-A.1) walks blockRounded, partitions into chain-tangent-coherent runs (split at >5° kinks to avoid non-corner IX vertices wrecking per-vertex perp offset), emits per-vertex perp-offset bands for straight runs.
- `buildFrontageBandsV2` (Stage 9 single-polygon pad emitter) still emits per-corner pads for arc-spans. **This is the compromise that sub-B is meant to retire.**
- `buildFrontageBands` (per-sharp-fe leg emitter) is dead code with a `// SUB-A retired` marker; sub-C deletes the function.
- Cusp guard + `RAMP_MIN_M = 1.5` still in `buildFrontageBandsV2`'s arc-span branch; sub-B retires these.

**Visual state at HEAD:** for IXs where the corner record DID match the block ring vertices, the visible result is "Stage-9-compromise corner" — sharp legs meeting at tA/tB with a separately-emitted plug filling the corner zone, visible seam between leg inner-edge and plug inner-edge. For IXs where the corner record DID NOT match (~50% of LS corners are `no_match`, mostly divided-pair endpoints + park-perimeter outliers), the silhouette walk's straight run wraps continuously through the corner zone with no separate plug emission — accidentally doctrine-correct concentric wrap. The two regimes co-exist in the same screenshot.

**Doctrine settled for sub-B redo (operator-confirmed 2026-05-18):**

The corner ribbon ships with an AASHTO/ADA-correct default and is operator-editable per-corner.

1. **The corner's cross-section is sidewalk material only.** No treelawn at the corner — the ADA curb ramp requires sidewalk material spanning from curb to property line at the bisector. Treelawn (where authored on flanks) ends at tA/tB on each flank; the corner ribbon does NOT continue treelawn through the arc.
2. **The corner ribbon's depth is `max(d_A, d_B)`** where `d_A = cw + tl_A + sw_A` and `d_B = cw + tl_B + sw_B` are the two flanks' total ped-zone depths. "Corner arc is the depth of the deeper arrangement" (operator).
3. **The corner ribbon is a uniform concentric annulus** across the entire arc from tA to tB. NO tapering ("nothing tapers" — operator). NO angular step. NO ramp-wedge sub-window.
4. **Both legs stop at tA/tB**; the corner ribbon takes over for the full arc; legs resume on the other side. "Both the deep and shallow sides stop and become corner ribbon and then become straight legs again" (operator).
5. **No cusp guard.** If `(R - max(d_A, d_B)) < 0`, the inner edge collapses or wraps — honest weird shape rather than silent scaling. "Self-intersection is signal, not error."
6. **`RAMP_MIN_M = 1.5` is inert on LS** (never fires under current authoring) and retired with the cusp guard. Future-narrow-authoring scenes may resurrect.
7. **Operator override is a future authoring channel.** Default doctrine ships per (1-6); operator-edit-per-corner is a separate phase (Stage 13 candidate) and out of sub-B's scope.

This doctrine resolves the asymmetric-flanks question without tapering, without separate wedge geometry, and without per-corner authored depth. The asymmetry is handled by the corner ribbon being its own thing with its own (max-of-flanks) depth, not by reconciling two different flank cross-sections within the arc.

**Sub-B redo brief surface (to draft tomorrow):**

- Extend `silhouetteStraightEmitter` to handle arc-runs (not just straight runs). For each arc-run: identify the corner record, resolve `d_A` and `d_B` via Stage 11a's `walkToFirstAuthoredMeta`, emit a single concentric annulus at depth `max(d_A, d_B)` from tA to tB. Sidewalk material only. Outer edge follows the blockRounded vertices in the arc-run; inner edge is the concentric arc at `R - max(d_A, d_B)`.
- Retire `buildFrontageBandsV2`'s call from the pipeline. Mark function as dead code (`// SUB-B retired`) for sub-C to delete.
- Retire the cusp guard and `RAMP_MIN_M` constant.
- Bilateral-zero short-circuit: if both flanks resolve to authoredZero, emit nothing for that arc-run.
- **CRITICAL: do NOT touch the straight-run partition.** Sub-B's earlier attempt (commit lost in `a5c1844`) broke straight-run emission while adding arc-run handling. The straight-run partition (sub-A.1's kink-split) must be byte-identical post-sub-B.
- `attributeFilletResidualToArcs` needs adjustment — the per-corner-pad slot retires. Either attribute fillet residuals to silhouette-walked arc-run entries directly, or maintain a parallel corner-identity index. Surface the choice.

**Sub-B failure-mode catalog (for the redo brief to avoid):**

- "Deeper side dominates whole arc" was directionally right (it IS β = max-depth concentric) but the implementation produced a non-concentric polygon — the prior sub-B emitted per-vertex perp offset, not true concentric arc emission. Per `feedback_per_vertex_perp_needs_chain_tangent_coherence`: per-vertex perp on arc-span vertices is a polyline approximation that breaks at depth ≈ R. The sub-B redo MUST use true concentric arc emission (`C + (pts[i] - C) * (R - d) / R`).
- The prior sub-B refactored the run-partition logic when adding arc-run handling. The new partition silently dropped or shifted some straight-runs, producing "sparsely populated arms/legs." Don't touch the partition; add arc-runs alongside as a separate emission path.
- "Asymmetric wedge with apex" (my original brief framing) was wrong doctrine. The operator's model has no wedge, no apex, no tapering — uniform concentric at max depth. Discard wedge thinking.
- The screenshot showing "left corners look right, right corners are Stage-9-compromise" is the diagnostic for sub-B: ALL corners should look like the LEFT corners (concentric wrap) after sub-B.

**Anomalies still to address (post-sub-B):**

- `selfint` count = 9 on arc-runs (Stage 9 pad) + 1 on straight-runs (sub-A.1 residual on chain 122). True concentric arc emission should eliminate the arc selfints; the straight residual is a separate §6.3 issue.
- 38 of 242 LS IXs (15.7%) have corner-count ≠ 4 — the single 5-corner IX deserves a sanity probe.
- Build time 4058ms at sub-A.1 (+64% vs sub-A's 2467ms). The 970-run partition × per-run probe is dominant. Sub-B may consolidate; sub-C should consider chain-identity caching.
- `attributeFilletResidualToArcs` orphan count was 111/290 in sub-B's run — high, but unverified because sub-B reverted. Re-measure post sub-B redo.

**Status:** PARTIAL-RESOLVED via Stages 11a + 11a.1 (meta-resolution) + 12-sub-A + 12-sub-A.1 (silhouette-walking straight emission); sub-B (concentric arc-span emission) REVERTED in `a7f2791`. Doctrine settled per above. Sub-B redo brief queued for next session.

### 6.7 Stale comments + PHASE 2 SUPERSEDED placeholder — HOUSEKEEPING

- `cornersAtIx` has 3 docblocks referencing retired `buildCornerPadQuad`.
- FEATURES corner-plugs subsection (was lines 76-104 pre-migration) carries `[PHASE 2 SUPERSEDED]` placeholder marker.

### 6.10 Per-leg straight-only emission produces square outer corners at the rounded silhouette — RESOLVED 2026-05-29 (V1 keystone, `025ee40`)

**Closed by:** the V1 keystone construction dissolves the per-leg-straight-only partition entirely. `emitOneBlockRingBands` (§3.9a) walks the FULL `blockRounded` ring (Bezier samples + literal verts treated uniformly) via Clipper offsets at three depths — there is no straight-only partition, no per-vertex-perp at the partition boundary, no square-overshoot failure mode by construction. The 13-month foundation fault is dissolved structurally. See `[[feedback_silhouette_straight_emitter_skipped_fes]]` for the lesson; the legacy `silhouetteStraightEmitter` lives on for LS until the C5 cutover, then retires. Historical text below preserved for context.

— Historical (pre-V1 keystone) record below —



**Symptom:** at every IX corner the visible cream sidewalk traces a SQUARE 90° outer corner instead of following `blockRounded`'s rounded silhouette concentrically. Operator zoomed-in screenshot (2026-05-28) shows the asphalt curb visibly rounded at IXs but the cream sidewalk strip terminating in a sharp rectangular outer edge that overshoots PAST the rounded curb. Small triangular slivers of cream are also visible in the asphalt area at IX corners where the per-leg's square edge sticks out beyond the rounded silhouette.

**Mechanism (discovered through the failed 2026-05-27 cutover attempt, HANDOFF-ribbon-corners.md C0–C5; reverted in `ea0bed6`):**

`silhouetteStraightEmitter` partitions `blockRounded`'s vertex sequence into STRAIGHT runs (Bezier corner samples excluded by `arcMeta.corner`) and emits per-vertex-perp strips on those straight verts only. When `applyRoundCornersToRing` smooths an IX corner, the LAST literal vertex before the consumed Bezier span sits BACK from the original sharp corner. The per-leg strip's outer edge extends perpendicular from that last vert at depth `cw + sw` — producing a SQUARE outer corner that overshoots PAST the rounded curb position.

Any separate corner-emitter (the original `buildFrontageBandsV2` per-vertex-perp pad in V2; the cutover's figure-ground residual at global W; the post-cutover per-arc emission at flanking-leg authored depth) sits INSIDE that square overshoot and gets occluded. No buildPedBand reshuffling fixes this because the bug is **in the partition strategy of the per-leg emitter, not in the corner emitter**.

**Correct path (spine of the restart brief):**

Per-vertex-perp on the FULL `blockRounded` ring (Bezier samples INCLUDED) at each vertex's authored depth. The strip wraps the rounded corner concentrically BY CONSTRUCTION. No separate corner emitter. No figure-ground residual. No global-W bulge.

For each vertex on `blockRounded`:
- If literal (sharp-vertex preserved) → owning fe = the fe whose `fe.points` includes this sharp-vertex idx. Strip depths come from `fe.measure`.
- If Bezier sample → owning fe = the fe of the consumed sharp-vertex range. Strip depths come from that fe's `fe.measure`.

The mechanism that unblocks per-vertex authoring lookup at Bezier samples:

**Extend `applyRoundCornersToRing` to expose `consumed[]`.** Currently the function returns `{ring, arcMeta}` where `arcMeta[k]` is `null` for literal verts and `{corner, R, arcPositionFrac}` for Bezier samples. Add a third return field: `consumed: Array<{sharpStartIdx, sharpEndIdx}>` per Bezier span, or — equivalently — extend `arcMeta[k].corner` (Bezier sample) to carry `sourceSpan: {start, end}` referencing the sharp-vertex range that the span replaced. Each Bezier sample then carries its owning sharp-vertex range → maps to the same fe as the flanking straight verts.

**Origin-fe per vertex falls out STRUCTURALLY** with this mechanism, no per-vertex coord-match required. The C4.5b first attempt used per-vertex coord-match (look up each rounded literal vert's coord in a global `coordToFe` map built from `fe.points`); this broke at shared corner verts (last-write-wins ambiguity) and stencil-clipped verts (not in any fe), tagging only ~25.6% of `blockRounded` verts and slicing partitions into length-1 fragments. Reverted.

**Why this fixes §6.10 (and §6.8 with it):**

When the per-leg strip wraps the rounded corner concentrically via per-vertex-perp on Bezier samples at authored depth, there is no square overshoot. The outer edge of the cream sidewalk follows the curb's rounded silhouette by construction. The "corner" is just the strip arcing around — exactly what the brief always promised but couldn't deliver while `silhouetteStraightEmitter` excluded the Bezier samples.

**What was tried and ruled out (don't re-explore in the rewrite):**

- **Wall (polygon-only barrier) enforcement (C4.5, `bebe7c3`):** signature-level wall held; NOT the bug.
- **T-junction handling:** chain IXs share coords exactly (verified at Miss × Ken); previously fixed class.
- **Skeleton precision:** chain centerlines meet cleanly; `resolveChainSegmentation` already coord-share-detects within EPS=0.5.
- **Asphalt-union sub-pixel gaps:** hypothesis tested via small morphological closing; rejected (the polygon architecture handles this by design).
- **Per-vertex coord-match for origin-fe tagging (C4.5b first attempt):** shared-corner ambiguity + stencil-clipped verts → only 25.6% tagging coverage; 75% emission drop.
- **Global-W pedBand + figure-ground residual (post-C5 `36d9ef2`):** invented surface area the operator never authored; produced wide uniform cream bands ignoring per-leg authoring handles.
- **Per-vertex-perp arc-span emission at flanking-leg authored depth (post-C5 `4509171`):** structurally cleaner but still inherits the per-leg square overshoot upstream.

**Status:** OPEN. Restart brief pending (Boz, 2026-05-28). Diagnostic carried in `memory/project_ribbon_corner_uniform_width.md` and the new `feedback_per_leg_straight_only_overshoot.md` memory.
- NOTES sub-entry consolidation: A.5 / A.6 / A.7 / Bezier-shipped / Phase 1 / Phase 2 / Phase 2.1 / 2.2-reverted / 2-arc cusp guard / 2-arc revert → single coherent "corner emission v2" entry.

**Status:** queued housekeeping commit after corner arc closes.

---

## §7. History — what we tried and what we learned

> Scaffold for v0.1. Will fill across coming sessions.

| Date | What | Status | Lesson |
|---|---|---|---|
| pre-2026-05-06 | V1 corner stack: `buildCornerPlug`, `buildCurbAnnulus`, `intersectionGeometry.js`, per-corner annular sectors | Retired in `0286cb1` | Per-corner constructed primitives don't generalize across IX shapes and width combinations |
| 2026-05-06 | Phase 1+2 corner-authoring kit (global × per-IX × per-corner) | SHIPPED | 3-tier authoring is the right shape; per-IX dot was the drift fixed 2026-05-14 (NOTES:1021) |
| 2026-05-06 PM | IP-rule switch attempt | Aborted (NOTES:1907) | Rounded-block-clip is the right model; IP-rule was a parallel path |
| 2026-05-10 | D.1/D.2/D.3a shipped; D.3b+D.3c bundled attempt rolled back | Replanned | Bundle-test-debug fails when sub-phase doesn't decompose; `feedback_d3_bundling_failure_modes` |
| 2026-05-10 EOD-3 | D.3c polygon-walking + D.5/D.6 customs migration | SHIPPED | Per-block-edge customs replaces per-chain-segment customs; identity by `(blockKey, edgeOrd)` |
| 2026-05-11 EOD-2 | D.7 walker identity-driven + D.7a customs flow through corners | SHIPPED | Corner detection by chain-identity-change, not turn angle (`feedback_walker_corner_detection_is_identity_not_angle`) |
| 2026-05-16 | Phase A: polygon-edge-Q replaces tangent-Q | SHIPPED (NOTES:474) | Corner records computed off polygon edges, not extended chain tangents (FEATURES:91 doctrine) |
| 2026-05-16 | Phase A.6: dir-sign perp flip in `buildLegSidePolyline` | SHIPPED (NOTES:503) | Bisector-perps must match emitChain's sign convention |
| 2026-05-16 | Phase A.7: Douglas-Peucker on asphalt rectangles | SHIPPED then RETIRED | Phase A.7 patched dense-corner→clamp-fires at the emitter; Bezier corners made this structurally unnecessary |
| 2026-05-16 | Bezier corners replace `arcReplaceVertex` circular arcs + 49% maxInset clamp | SHIPPED (NOTES:533, commit `7db2d32`) | Bezier is shape-agnostic about polygon-vertex density; the dense-corner problem dissolves |
| 2026-05-16 | Phase 1: multi-vertex Bezier consumption (consume-span walker) | SHIPPED (NOTES:553, commit `ed29700`) | Two-pass span-aware walker eliminates angular kinks adjacent to Bezier insertion |
| 2026-05-16 | Phase 2: round-block swap + three-regime emitter + chain-era plug retirement | SHIPPED (NOTES:575, commit `30f7c7e`) | The new regime structurally satisfies `feedback_corner_pad_continuity_first` — but bundled spine rewrite broke 70 SELFINTs |
| 2026-05-16 | Phase 2.1: per-corner asphalt-fillet attribution | SHIPPED (NOTES:614, commit `b9cb11c`) | Phase 2's deletion of `cornerAsphaltPlugs` was based on incomplete diagnosis — fillet residual against per-chain rectangles still needs attribution |
| 2026-05-16 | Phase 2.2: morphological closing on curb stroke | REVERTED (NOTES:675, commit `c360fc2` + `3a80549`) | Dilate-erode precision tax cascades; structurally wrong, not tunably wrong |
| 2026-05-17 | Phase 2-arc cusp guard: scale tl/sw when `cw+tl+sw > 0.9·arcR` | SHIPPED (NOTES:635, commit `8956ffa`) | Inward-offset arc cusps onto itself when offset depth ≈ arcR; 0.9× factor is a working but not tight enough threshold |
| 2026-05-17 | Phase 2-arc revert: restore per-sharp-fe straight-span emission alongside arc emitter | SHIPPED (NOTES:652) | The new regime's spine architectural intent ("everything flows from blockRounded") collided with Clipper precision on long offset polylines; the doctrine permits both halves (per-sharp-fe straight + blockRounded-walked arc) since each satisfies polygon-walking |
| 2026-05-17 | Stage 1 diagnostic — classify every frontageBand entry across H1-H4 hypotheses for the L-strip black symptom | DIAGNOSED | H1 (blockKey drift) dominant; H3 (per-LU translucency) was a misread of the operator model (non-selected chains stay opaque by design); H2/H4 minor. Stage 1 also produced a false 91.9% geometric-overshoot reading via `pointInRing` boundary noise — corrected at Stage 2. Lesson: use signed-distance with ≥0.01m epsilon, never strict `pointInRing` against clip-output boundaries |
| 2026-05-17 | Stage 2 diagnostic — drill-in / baseline comparison / backfill dry-run | DIAGNOSED | (a) Stage 1's 91.9% was probe artifact; lookup-OK fes have zero real overshoots. (b) Defect pre-existing back to ed29700 — `buildFrontageBands` body comment-only-diff; not a regression. (c) Mechanism pinned: `ringByKey` is pass-2 keyed, `fe.blockKey` is pass-1 keyed (backfilled at line 2149); 295 fes disagree, clip skipped, 248 overshoot >0.5m, max 8.306m on Truman Parkway. (d) Dry-run with identity-based ring registration resolves 257/295 cleanly; closes all real overshoots |
| 2026-05-17 | Stage 4: block face fill must use `owning` (blockRounded), not `intersectRings(face, owning)` — restores figure-ground inversion in face emission | SHIPPED (commit `9cf12c4`) | Three-line surgical fix to `buildBlockGeometryV2.js:2316`. Closed the visible "black ring around every block" Jacob had been reporting since the session start — turned out to be canvas-ground showing through the gap between small authored faces (e.g. park's ±175m fence polygon) and the band-property-line (~±179m), NOT band overshoot from H1. Lesson: visible-material-absence (canvas through gap) and visible-material-trespass (opaque overshoot) look similar with bands above; Aerial-toggle discriminates instantly. Stage 1-3 misframing because diagnostic anchored on overshoot before testing absence. `feedback_verify_diagnosis_with_user` extended: visible-symptom-discrimination should be a 30-second test, not a session arc |
| 2026-05-17 | Stage 5: H1 (per-fe containment ring resolution in buildFrontageBands) | SHIPPED (commit `48d8135`) | Closes the §6.2 D.7a keying-system divergence as a latent structural fix. 248 fes >0.5m overshoot trimmed; bake delta −0.4–0.5% verts per look. Did NOT visibly close any corner symptom — overshoots had been masked by overlying asphalt + curb stroke. The "corners are jacked" symptom Jacob continued to report after Stage 4 is corner-interior (sidewalks / treelawns / corner plugs at IXs) — a separate defect class living in `buildFrontageBandsV2` (arc-span emitter) and `attributeFilletResidualToArcs`, not in straight-fe band emission. Next dispatch addresses arc-span. Doctrinal note: H1 is a textbook D.7a-drift case — `feedback_d7a_blockkey_drift` says pass-1 (blockKey, edgeOrd) must be carried through pass-2 by `(chainIdx, segOrds[0], side)` join, and the same lesson reapplied here at the per-fe ring lookup |
| 2026-05-17 | Stage 6: corner-regime-emitter audit (355 arc-span entries across LS, regime classification + concentric measurement) | DIAGNOSED | 0 of 355 corners produce doctrine-correct concentric emission. Regime distribution: NEITHER-EMITTED 36%, SYM-NO-RAMP 29%, SYM-WITH-RAMP 28%, ASYM 7%. 8 visible "treelawn drops" (operator authored tl + sw both sides, emitter dropped tl). Cusp guard fires on 22.5% of corners (vs 5% expected). 18 of 25 ASYM corners sit at marginal `diff ∈ [1.0, 1.5)m` — binary threshold too crisp. The three-regime emitter is structurally wrong for the doctrine, not occasionally — never produces concentric. Stage 7 rewrite indicated, not tuning. Audit script + CSV in `scratch/corner-regime-audit.*` |
| 2026-05-17 | Stage 7: concentric tapered arc-span emission (replaces three-regime emitter) | SHIPPED-then-REVERTED-as-uncommitted-work | Two-ring concentric tapered (tl ring + sw ring, depths linearly interpolated between flanking d_A and d_B). Validated 220+ of 355 doctrine-correct concentric per Stage 6's audit re-run. Visually produced small fragmentary bands at corners; the concentric tapered geometry was correct but visually overlapped with the per-sharp-fe straight bands' sharp angular inner edges, producing the "vestigial chain offsets" complaint. Code worked but wrong architectural layer for the visible problem |
| 2026-05-17 | Stage 8: walk blockRounded for all band emission (retire per-sharp-fe spine) | SHIPPED-then-REVERTED-as-uncommitted-work | Restructured `buildFrontageBandsV2` to walk blockRounded vertices for both straight and arc spans, with chainMeta sidecar identifying per-vertex chain ownership. Goal: align straight-band emission with the rounded silhouette so corners read as concentric wraparound. Failed: the Bezier consume-span absorbed interior fe vertices into corner arcs; ~30% of LS fes (those with ≤3 points after consume) emitted nothing → most block edges had no straight-span bands. Multiple warm continuations (sharp-fe inheritance for chainMeta, bridge fix for tA/tB endpoints, per-span H1 clip, customs lookup refactor) addressed sub-issues but couldn't close the coverage gap. Bezier consume-span is structurally incompatible with per-fe-coverage straight emission |
| 2026-05-18 | Stage 9: single-polygon symmetric corner pad over restored pre-Stage-8 per-sharp-fe legs | SHIPPED (commit `3cafe7f`) | Revert Stage 8's spine restructure (back to per-sharp-fe `buildFrontageBands` with H1 clip — pre-Stage-8 architecture, validated). Replace Stage 7's concentric tapered arc-span emission with single sidewalk-material polygon at `dCorner = max(d_A, d_B, RAMP_MIN_M=1.5)`. Architecture: legs from sharp fe + H1 clip; corner pads from arc-span on blockRounded. Two emissions overlap geometrically at corner zone (different rings; no shared boundary vertex; no per-slice perp inconsistency). Visual: legs continuous on all 506 block edges; corners 3/4 produce doctrine-correct symmetric pads. Residual: §6.9 — 4th corner per IX has no pad emission from upstream input-preparation variance. Lesson: **doctrinal pivots ("walk blockRounded for everything") need empirical validation at each sub-step before bundling**. Stage 8's architectural ambition was correct in principle (RIBBONS §1) but lost to the Bezier-consume coverage gap that wasn't visible in numerical audits — only visual inspection caught it. Visual smoke test between sub-changes, not at session end |
| 2026-05-18 | Stage 10: corner-input-prep audit (666 corner records on LS, failure-mode classification + Mississippi × Park deep-dump) | SHIPPED (commit `79fcd9e`) | §6.9 hypothesized taxonomy was wrong in three ways: (1) `cusp_ramp_collision` fires 0/666 — `RAMP_MIN_M=1.5` is dead code under LS authoring; (2) `no_match` is not a tunable-TOL bucket (174 of 177 unmatched vertices sit >1m from any block); (3) `wrong_flanking` (25.5%, dominant defect bucket) splits into `terminal='none'` and `adj=null` sub-modes that look identical in the histogram but require different fixes. Mississippi × Park 4-corner deep-dump: NW `ok` but at 60% of authored depth (cusp k=0.598), SE `wrong_flanking` (terminal=none mirroring), NE `selfint`+`wrong_flanking` (adj=null prev flank), SW `flanking_skip` (bilateral terminal=none — doctrine-correct empty, NOT a defect). Cusp guard fires equally on `ok` (32) and `wrong_flanking` (45) — not itself a defect predictor but a pervasive authoring-fidelity tax. Stage 11 revised to 11a (unified meta semantics: adj=null ≡ terminal=none) + 11b (cusp guard removal: self-intersection IS the signal, not the error). Lesson: **hypothesized taxonomy needs audit validation BEFORE fix design**; the §6.9 cusp_ramp_collision bucket was framed from the Stage 9 emitter's code path without checking firing rates against actual authoring. Stage 10's diagnostic-only mandate caught this cheaply; designing 11a/11b from §6.9's hypothesis would have shipped a fix for an empty bucket |
| 2026-05-18 | Stage 10.5: alley-hypothesis diagnostic (extension of Stage 10) | SHIPPED (commit `0bc0cd9`) | Alley hypothesis REFUTED. Of 388 `adj=null` flanks: 2.6% alley-bordered, 2.6% truly-void, 0% probe-bug, **95% structural** — 67.5% `adjacent_arc_span` (back-to-back arcs, no straight flank between) + 27.3% `degenerate_span` (Bezier consume ate the straight to <2 vertices, probe never runs). Stage 11a's "unified meta semantics" plan collapses to one fix: walk past adj=null AND terminal=none alike at the spanMeta layer, treating both as zero-authored. Probe itself is not buggy and needs no change. Lesson: when a §6.x failure mode is hypothesized as "probe returns null because X," diagnose what the null actually means BEFORE designing the probe fix — sometimes the null is structural and the probe is fine |
| 2026-05-18 | Stage 11a: meta-resolution ring-walk past arc/skip spans | SHIPPED (commit `44ca974`) | Replaces immediate-adjacent flanking lookup (`spans[(si-1+N)%N]`) with ring-walk via `walkToFirstAuthoredMeta`. Unifies five sub-cases (adjacent_arc_span, degenerate_span, alley_present, truly_void, terminal=none) into one resolution path: skip spans where `type !== 'straight' || skip`, return first authored. Audit movement: wrong_flanking 170→0, ok 50→277, no_match 312 unchanged. SW Miss×Park flipped to ok via wraparound, SE Miss×Park to ok (walk_wraps_to_other_side=1). Visual smoke deferred to operator gate; baby's commit body explicitly flagged it as required-pre-Stage-11b. Lesson: numerical clean ≠ visually clean (`feedback_evolve_vs_revert_judgment`); baby agents without browser access must NAME the visual gate explicitly in commit body |
| 2026-05-18 | Stage 11a.1: distinguish partition-artifact skips from authored-zero flanks | SHIPPED (commit `e710441`) | Stage 11a's walk-past was too greedy: it walked through terminal=none and tl=sw=0 flanks (operator-intent zero) the same as partition artifacts (arc / degenerate / null-probe), inheriting depths from distant chains. Visual smoke at Mississippi × Park showed floating sidewalk tabs at corners where the operator authored "no ped zone here" but the walk imported a non-local chain's depths. Fix: split `skip:true` into `skip:true` (partition artifact, walk past) and `authoredZero:true` (operator intent, STOP and contribute zero); add bilateral-authoredZero short-circuit at arc-span branch. Audit: ok 277→244 (−33 correctly-classified-now-as-wrong), wrong_flanking 0→32 (unilateral-authoredZero surface = Stage 11b's job), selfint unchanged 9. SW Miss×Park back to flanking_skip (doctrine-correct empty). Lesson: `feedback_partition_artifact_vs_authored_zero` — unified "no flank meta" handlers conflate slot-doesn't-exist with operator-authored-zero; numerical audit can't catch the difference; floating geometry adjacent to bandless legs is the visible tell |
| 2026-05-18 | Live-render diagnostic — probe logs to confirm V2 → renderer chain | SHIPPED then-reverted | Two `console.log` probes at function entry + exit of `buildFrontageBandsV2`, plus a temporary `dCorner=100` hard-override. Result: V2 runs live, output flows to renderer, pads ballooned correctly at d=100m. Confirmed sub-A/A.1 numerical wins ARE being rendered. Also revealed the per-vertex-perp polyline approximation's breakdown at d > R (the balloon's convex-outward bulge through the arc center). Triggered the doctrinal pivot from Stage-9-compromise polishing to Stage-12-architectural-rewrite — operator framing: "should be like an inside-stroke, not a physical object bending around the corner" |
| 2026-05-18 | Stage 12 sub-A: silhouette-walking straight-span emitter | SHIPPED (commit `e000b75`) | New `silhouetteStraightEmitter` walks blockRounded's straight-vertex runs, emits tl + sw bands by per-vertex perp offset. Replaces `buildFrontageBands`'s per-sharp-fe leg emission (marked dead code, retired in sub-C). Stage 9's per-corner pad still emits arc-span pads alongside (unchanged). Numerical: straight bands 506→142 (4× merge across non-corner IXs), straight selfints 16→39 (longer offset polylines fold more). Block 2,0,0 verified: 4 straight bands, every vertex shared with blockRounded[78] — bands LITERALLY trace the silhouette. Visual smoke: "0 good ribbons" on LS — broader than the selfint increase predicted. Diagnosis next stage |
| 2026-05-18 | Stage 12 sub-A.1: kink-split runs for chain-tangent coherence | SHIPPED (commit `54d5e8b`) | The "0 good ribbons" cause: sub-A's runs merged sharp fes across non-corner IX vertices (through-T, divided-pair, theta-filter skips). At those merged IX vertices, blockRounded has a ~90° geometric kink; bisector-perp points 45° off-chain; per-vertex perp offset produces band geometry that breaks at every merge point. Fix: split runs at vertices where in/out direction differs by >5°. Audit movement: straight bands 142→970 (1.9× pre-sub-A 506; baby flagged "too aggressive" trip — mechanism is OSM chain-curvature vertices firing the 5° threshold + non-corner IX kinks combined; rectilinear blocks still emit cleanly). Straight selfints 39→1 (39× drop — kink-split's geometric correctness). Build time 2467→4058ms (+64%, per-run probe cost). Visual: ribbons RESTORED; "left corners look right" (accidentally doctrinal silhouette wrap at no_match corners) coexist with "right corners look Stage-9-compromise" (legs+plug at matched corners). Decision: ship sub-A.1 at 5°; the small chain-curvature seams are sub-pixel at LS render scale; threshold tuning deferred to sub-C if needed. Lesson: `feedback_per_vertex_perp_needs_chain_tangent_coherence` — partition emit-runs by chain-tangent coherence, not just arc-vs-straight. blockRounded's "straight" vertices include non-corner IX kinks that ARE bisector-perp-incoherent. Probably also doomed Stage 8 under a different surfaced framing |
| 2026-05-18 | Stage 12 sub-B: concentric arc-span emission + Stage 9 pad retirement | REVERTED (file edits bundled into `a5c1844`, reverted in `a7f2791`) | Intended to replace Stage 9's per-corner pad with concentric arc-span emission via the silhouette walk, applying a wedge-or-uniform geometry for asymmetric flanks. Baby's implementation diverged from the brief in two ways: (1) "deeper side dominates whole arc" simplified the asymmetric wedge to uniform max-depth concentric (which turned out to be doctrinally CORRECT per operator-settled doctrine, but for the wrong reason); (2) refactored arc-run partition inadvertently affected straight-run partition, producing "sparsely populated arms/legs." Compounded by the commit-attribution loss (changes bundled into Jacob's neon renderOrder commit `a5c1844`, sub-B's design surfaces never recorded in git log). Visual: "worst failure yet." Reverted `src/lib/buildBlockGeometryV2.js` to sub-A.1 state in `a7f2791`. Lessons: (1) when a sub-phase produces both an intended change AND an inadvertent change, the visual failure mode confounds — disambiguating which change broke what requires probe-instrumented diagnosis (per `feedback_d3_bundling_failure_modes`, but at a sub-phase scale). (2) Operator-authored AASHTO/ADA doctrine — max-of-flanks depth, sidewalk-material-only, uniform concentric across whole arc, no treelawn at corner — is now settled and recorded in §6.9 above. Sub-B redo brief queued for next session |
| 2026-05-18 | Doctrine pivot: corner ribbon = AASHTO/ADA ramp pad | DOCTRINE SHIPPED | After Stage 12 sub-B's revert, operator articulated the doctrine that resolves the asymmetric-corner question without tapering, without separate wedge geometry, and without per-corner authored depth in the default case: corner cross-section is sidewalk material only at depth `max(d_A, d_B)`, uniform concentric annulus across the entire arc from tA to tB. Treelawn ends at tA/tB on each flank; the corner ribbon is sidewalk-to-asphalt for the entire arc (real-world ADA curb ramp doctrine). Each leg stops at its tangent point; the corner ribbon takes over for the full arc; legs resume on the other side. Operator override (per-corner depth/material slider) is a future authoring channel (Stage 13 candidate), out of sub-B redo scope. Lesson: doctrinal questions can spiral when the answer is "real-world AASHTO/ADA standards" — anchoring on accessibility-engineering doctrine (rather than abstract geometric reasoning) shortcuts the question. The corner IS the curb ramp, and the curb ramp IS sidewalk-material-only at max-depth. Recorded for the sub-B redo dispatch |

---

| 2026-05-29 | V1 keystone — `emitOneBlockRingBands` ships on toy (Quoin) | SHIPPED (commits `012ea2a` C1 → `e8d9b44` jtMiter+R=0) | Three Clipper inward insets of `blockRounded` at `cw` / `cw + TL_block` / `WB`; two annular bands via `differenceRings`; per-span sectors slice them for material tags. Single-polygon corner emission. Per-block-LU lookup via `fe.blockKey` → `v2.blocks[k].lu` direct map (centroid probe fails because treelawn rings now sit OUTSIDE the parcel polygon). `jtMiter` preserves operator R=0 squares. R=0 authorable. Capacity guard (`WB = min(WB, ~0.9·inscribed_capacity)`) protects against W-past-medial-axis Clipper inversions. LS bake byte-identical until C5 cutover. The keystone phrase: *"ribbon monowidth, strips variable."* Lesson: the construction the keystone memory described from day one was right; Boz's three brief rewrites of imagined per-fe-asymmetry machinery were overengineering — banked permanently as `[[feedback_boz_overengineered_for_imagined_authoring_complexity]]` |
| 2026-05-29 | V1.5 per-leg material swap — ctrl-click flips strip material | SHIPPED (commits `404e949` emit + `1bfac2f` UX) | `m.measure[side].materials = {outer, inner}` per leg (defaults `{outer:'LU', inner:'SW'}` preserve V1). Emit routes leg sub-polygons by material tag; corners stay all-SW per AASHTO. UX: ctrl-click in a strip body flips material via `tryFlipStripMaterial`; the legacy collapse/insert gestures retired (V1.5's fixed 2-strip layout makes add/subtract structurally moot — see `§5 archive`). 16-fields geometry stays untouched; only material tags flip per sub-field. Toy bake byte-identical (additive emit, UX-only MeasureOverlay change). Doctrine: `[[project_corner_radius_is_design_control]]` (R as operator dial for visible LU-strip tab size + corner pad degeneracy threshold) |
| 2026-05-29 | V2-Measure polygon-only authoring (Datum) | SHIPPED (commit `72cd0a7`, net −193 LOC) | Retired all chain-scope authoring writes. `chain.measure` becomes read-only pipeline-derived input; all operator writes target `blockCustoms[blockKey][edgeOrd]` per-fe. Whole-chain mode (formerly "Edit entire row") fans the write per-fe across every fe along the chain — chain becomes a *selection criterion*, never a write scope. Symmetric/asymmetric becomes a transient UI mirror toggle (`editSidesSeparately`); the persisted `chain.measure.symmetric` flag is now vestigial pipeline state. ModeToggle silent-customs-wipe bug (data-loss disguised as view switch) fixed in the same arc. `innerEdgeMeasure` baked-in nuance preserved: divided carriageways seed the whole-chain fan from the innerEdge-resolved measure, identity at `innerSign=0`. Doctrine: `[[feedback_vestigial_ux_is_a_wall_violation]]` distinguishes retired-data-flag from kept-useful-transient-toggle |
| 2026-05-30 | V1.6 — pass-2 ring-index parity + per-block capacity guard + toy data cleanup + reset button (Trammel + Stadia) | SHIPPED (commits `2607763` ring+guard, `52d7f9e` data, `cf24cb7` button, `ea7c754` two-button) | Pass-2 customs re-emit grouped fes by `blockRingIdx` for per-block isolation. Per-block capacity guard clamps `WB ≤ 0.9·inscribed_capacity` to prevent W-past-medial-axis Clipper inversions (refined no-clamps doctrine distinguishes geometrically-meaningful degeneracy from geometrically-meaningless garbage — see `[[feedback_no_corner_radius_clamps_in_emit]]` refinement section). Toy `design.json.blockCustoms` cleared to `{}` directly (HEAD is now a real reset target). Reset toy button shipped (`setBlockEdgeCustoms({})` direct + re-bake; gated `scene==='toy'`). Lessons banked: `[[feedback_render_guard_against_real_data_not_synthetic]]`, `[[feedback_customs_resolver_wholesale_not_merge]]`, `[[feedback_verify_edits_applied_before_trusting_output]]`. The "ribbon monowidth, strips variable" keystone holds; `buildChainBandsLive` migrated to V1 keystone alignment (`67e02e0`) so live-drag preview matches post-release bake |

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
- **PRI** — paint render index. Designer's per-material renderOrder slot. Different from polygonOffset and Y-lift; see FEATURES "Layering / coplanar stacking" decision table.
- **D.x** — phase tags from the 2026-05-10/11 migration sequence (D.3c = polygon-walking band emission, D.5/D.6 = block-edge customs, D.7 = walker identity-driven, D.7a = customs through corners, D.7d = ped-zone coverage from frontageBands only).

---

*Updated: 2026-05-31. Boz toy-reset session post the V1.6 close. §5 measure-tool model updated for V2-Measure polygon-only authoring (`72cd0a7`); §6.8/6.9/6.10 marked RESOLVED by V1 keystone (`025ee40`) with historical text preserved; §7 history table appended with V1 keystone, V1.5 swap, V2-Measure, V1.6 entries. **Next pickup:** C5 cutover (LS → mono-width ring-band emitter; flip `useRingBandEmitter` from `scene === 'toy'` default), then chain-consumer census, then the wall-move (corners + shape into Survey per `[[project_skeleton_is_the_first_bake]]`). See `HANDOFF-ls-migration.md` for the C5 brief.*
