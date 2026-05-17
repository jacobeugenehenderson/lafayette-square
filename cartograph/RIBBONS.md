# Ribbons & Corners — canonical reference

**Status: v0.2 (2026-05-17) — living doc.** This is the central reference for the ribbon + corner system. It evolves every session until the corner problem is closed.

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

### The model in one sentence

**Blocks are positive space; streets are the void around them; everything visible at street level — asphalt, curb, sidewalk, treelawn, corner mouths — is a property of the block polygons' silhouettes, not of the chain centerlines that derive them.**

### The ribbon as the entire object

The visible "street" is a Z-shaped cross-section running along the chain: asphalt, then curb, then treelawn, then sidewalk, terminating at the property line. The same cross-section persists from straight-spans into the corner. What we call "the corner" is the ribbon's WRAP around the IX — same materials, same depths, just bent around an arc instead of running straight.

The corner is NOT something we construct as a separate primitive to glue two ribbons together. The corner is what naturally happens when the ribbon's outer edge (the asphalt boundary) follows the rounded block silhouette around the IX. This is the load-bearing inversion from V1 (per `feedback_corner_pad_continuity_first`):

| V1 (retired in `0286cb1`) | V2 |
|---|---|
| Asphalt = union of per-chain rectangles | Asphalt = `stencil − blockRounded` |
| Corner asphalt fillet = constructed annular sector or `buildCornerPlug` | Corner asphalt mouth = back side of the block's rounded corner |
| Concrete corner pad = `buildCornerPadQuad` (tA-tB-anchored parallelogram clipped against blockRounded) | Concrete pad = arc-span band emitted by the same ribbon machinery as the straight-span band |
| Curb = per-side rectangle bands + per-corner curb annulus | Curb = single offset stroke of the entire rounded asphalt silhouette |

### The three structural moves

The new regime collapses to three operations. Everything else falls out:

**1. Round the block, derive asphalt as negative.**
- `applyRoundCornersToRing` runs Bezier (handle length `(4/3)·R·tan((π−θ)/4)`, 16 samples) at every block-convex matched vertex of each `blockSharp` ring.
- `asphaltRounded = stencil − blockRounded`. The rounded asphalt mouth at every IX is the back side of the rounded block corner. No separate `cornerAsphaltPlugs` math. The mouth IS the geometry, not a residual.

**2. The ribbon wraps the silhouette.**
- Bands inset inward from the block edge by `cw` (curb), `cw + tl` (treelawn outer), `cw + tl + sw` (sidewalk outer).
- On straight spans: parallel offsets. On arc spans: inset arcs.
- The three-regime arc emitter (ASYMMETRIC / SYMMETRIC-WITH-RAMP / SYMMETRIC-NO-RAMP) is what to do when the two flanking straight spans want different cross-sections at the corner. It is the arc's response to the cross-section discontinuity, not a constructed bridge.
- Each per-arc `frontageBand` entry carries ALL THREE materials of the corner wrap as one construct: `{ treelawnRings, sidewalkRings, asphaltRings, corner }`. `feedback_corner_pad_continuity_first` realized structurally (NOTES:620).

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
- The stage wall (chains end forever at bake; polygons are the surface — FEATURES §"The stage wall").
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

Concat of `straightBands` (from `buildFrontageBands`) + `arcBands` (from `buildFrontageBandsV2`).

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

### 3.9 Band emission — split helpers (lines 2186-2202)

**`buildFrontageBands(streets, frontageEdges, curbWidth, blockRounded, blockCustoms)` (line 1374; restored from ed29700, post-revert 2026-05-17):**

For each fe:
- Read `blockCustoms?.[fe.blockKey]?.[fe.edgeOrd] || streets[fe.chainIdx].measure[fe.side]`. Bail if `terminal !== 'sidewalk'` or both tl & sw ≤ 0.
- `inwardSign = fe.ringCcw ? +1 : -1`.
- Three offset polylines: `innerEdge = points + perps · inwardSign · cw`, `tlOuterEdge = +cw+tl`, `swOuterEdge = +cw+tl+sw`.
- `closeRing(outer, inner) = [...outer, ...inner.reverse()]`, CCW-normalized.
- Emit `tl = closeRing(tlOuterEdge, innerEdge)` if `tl > 0`; `sw = closeRing(swOuterEdge, tlOuterEdge)` if `sw > 0`.
- Per-block `intersectRings` clip against `ringByKey.get(fe.blockKey)` (single rounded block ring).

Output: `{ blockKey, edgeOrd, chainIdx, side, points, treelawnRings, sidewalkRings }` per emitting fe.

**`buildFrontageBandsV2(streets, blockRoundedWithMeta, frontageEdges, chainIndex, blockCustoms, curbWidth)` (line 1449):**

For each `{ ring, arcMeta }` of blockRoundedResults:
- Partition into spans by `arcMeta[i]?.corner` identity (consecutive vertices same corner identity → one span). Wraparound merge.
- `spanMeta[si]` for each span: if straight, probe chain adjacency (`findAdjacentChainForBlockEdge` on span pts), grab measure, compute `tl/sw/edgeOrd`. If arc, deferred until flanking metas read.

**Straight-span emission**: `if (meta.type === 'straight') continue` post-revert. The straight `spanMeta` is still BUILT (provides flanking-meta scaffolding for arc spans) but does not push output. Output comes from `buildFrontageBands` instead.

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

**Concat (line 2202):** `frontageBands = [...straightBands, ...arcBands]`.

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

### Measure tool — operator model

The Measure tool lets the operator author the ribbon's cross-section per block edge. Two write modes, selected by a 3-segment toggle in MeasurePanel (`ModeToggle`):

- **"Edit entire row" (global mode):** drag writes to `chain.measure[side]`. If `measure.symmetric === true`, mirrors to opposite side. The whole streetfront along the chain moves in tandem.
- **"Edit block" (per-block mode, default):** drag writes to `blockCustoms[blockKey][edgeOrd]`. Only that one block edge of the chain's ribbon changes; the rest of the chain stays at its `chain.measure` default. **This decouples a single streetfront slice from the chain.**

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

**Right-click / Ctrl-click gestures (covered in MeasureOverlay.jsx:674-773):**
- On a handle → delete that boundary (collapse stripe). `treelawnOuter` collapses treelawn into sidewalk; `propertyLine` removes ped zone entirely (`terminal: 'none'`).
- In an empty band → insert a boundary at click radius (split sidewalk into treelawn + sidewalk, or re-seed `terminal: 'sidewalk'` from `'none'`).

**Other gestures:**
- Empty click on canvas → no action (operators pan a lot; silent deselect was too easy to trigger).
- Double-click → `deselectStreet()`. (Spec-divergent vs NOTES:3549-3551 which says double-click should insert a stripe split — see §6.5.)
- Escape / Enter → deselect.

### Handles, anti-overlap stagger

Up to 3 handles per side per click anchor: `pavementHW` (the asphalt edge — dragging this is also dragging the block-edge silhouette, since `block = stencil − asphalt`), `treelawnOuter`, `propertyLine`. Pill geometry 5m long × 1.2m wide, oriented with long axis along the street. White fill + black border, opacity 1, depthTest false, renderOrder 149/150 so they paint over the translucent ribbons.

Anti-overlap pass (MeasureOverlay.jsx:381-405): when two handles on the same side have similar `r` (within `HANDLE_LONG + 0.5`), the staggers shift them along the street tangent in alternating fore/aft offsets. The `r` value (perp distance from centerline) is preserved — only the visible along-street position changes; drag still resolves to the correct boundary radius.

---

## §6. Active failure modes — LIVE

> **This is the front of the work.** Every session adds/updates/closes entries here.

### 6.1 L-shape black at corner-adjacent ribbons — DIAGNOSED, FIX QUEUED (2026-05-17)

**Symptom:** in Designer with Measure tool active + Aerial toggle on, the operator selects a chain; the selected chain's ribbons translucify, but at *every IX corner along the chain*, an opaque-black region extends into the corner mouth where aerial-through-asphalt should read. The park's interior perimeter is the visually obvious case (aerial backdrop makes it stark) but the failure is uniform map-wide — every corner on every block exhibits the same overshoot pattern, just less visibly against face-fill backdrop than against aerial.

**Diagnosed (Stage 1 + Stage 2, 2026-05-17):**

The defect is **entirely §6.2** — drifted-key straight fes skip the per-block clip entirely, so their offset polylines extend up to **8.306m past** the rounded block silhouette (Truman Parkway `653.5,-236.5` edgeOrd 0; 248 fes have overshoots > 0.5m repo-wide). Opaque non-selected ribbons along the *other three sides* of the corner trespass into the corner mouth and paint over what should be aerial/asphalt.

**Hypotheses ruled out during diagnosis:**

- ~~Per-LU treelawn missing `selectedCorridor` variant~~ — confirmed in code, but it is **design intent, not a defect** (§5 "Translucency, by design"). Only the selected chain translucifies; non-selected chains stay opaque on purpose. The "two-vs-two" symptom shape is selected-chain vs three other chains, which is the operator model. Once §6.2 is fixed and the opaque non-selected bands stop trespassing, the corner-mouth aerial reads through correctly without any render-side change.
- ~~49 SELFINT band rings (§6.3)~~ — 17 of 725 entries (2.3%), 0 park-adjacent, not a contributor to the L-strip pattern.
- ~~Missing band emission (terminal !== 'sidewalk')~~ — 0 entries, not a factor.
- ~~91.9% geometric overshoot on lookup-OK fes (Stage 1 surprise #2)~~ — **probe artifact.** `pointInRing` ray-casting registered boundary-coincident vertices ambiguously; signed-distance recheck with 0.01m epsilon shows **zero real overshoots** on lookup-OK fes. The clip works perfectly when the key lookup succeeds.

**Fix shape:** §6.2's identity-based ringByKey rebuild. Stage 3 dispatch.

**Closes when:** Stage 3 visually verified by Jacob (L-strip aerial-visible at corners), §6.1 + §6.2 collapse into a "RESOLVED 2026-05-XX" §7 history row.

### 6.2 D.7a keying-system divergence: pass-2 `ringByKey` vs pass-1 `fe.blockKey` — DIAGNOSED, FIX QUEUED (2026-05-17)

**Mechanism (exact):**

- `buildFrontageBands` (line 1374) builds `ringByKey` via `blockKeyFromRing(blockRoundedRing)` on each pass-2-derived rounded block ring. **These are pass-2 keys.**
- Each fe arriving at `buildFrontageBands` has `fe.blockKey` set to the **pass-1** value, because pass-2's `buildFrontageEdges` output is overwritten at line 2149: `fe.blockKey = p1.blockKey`. This was done so `blockCustoms[fe.blockKey][fe.edgeOrd]` resolves to the same customs entry the operator wrote against pass-1 keys.
- **The two keying systems disagree for 295 of 506 straight fes (58%).** When pass-2 asphalt expansion shifts a bbox center past a 0.5m grid line, `blockKeyFromRing` rounds the pass-2 ring to one key while `fe.blockKey` carries the pass-1 key. `ringByKey.get(fe.blockKey)` returns undefined → clip block at lines 1440-1462 silently `continue`s → band rings emit unclipped from the offset polyline.
- Unclipped offset polylines extend up to **8.306m** past the rounded silhouette into the corner mouth (Stage 2 worst-offender: Truman Parkway `653.5,-236.5` edgeOrd 0). 248 fes carry >0.5m overshoots repo-wide. **This is the L-strip black mechanism in §6.1.**

**Pre-existing back to ed29700:** `buildFrontageBands` body is comment-only-diff between ed29700 and HEAD. Latent defect from the D.7a customs migration. Never visible before because (a) opaque ribbons trespassing into the asphalt-color corner mouth blend with the asphalt at normal viewing, (b) Aerial-mode + the operator clicking park-adjacent chains is the specific condition where the overshoot reads against a non-asphalt backdrop.

**Fix shape (Stage 3, ~15 LOC):**

Identity-based ringByKey construction. Don't rebuild keys from rings; **inherit them from the fes that own the rings.** For each blockRounded ring, find any fe whose interior probe lands in the ring (`pointInRing` against the ring); register the ring under that fe's `blockKey` (pass-1 backfilled, matches `fb.blockKey`). Now `ringByKey.get(fb.blockKey)` works correctly for both drifted and non-drifted fes.

```js
// In buildFrontageBands, replace the existing ringByKey build:
const ringByKey = new Map()
for (const ring of blockRounded) {
  for (const fe of out) {
    const probe = fe.treelawnRings[0]?.[0] || fe.sidewalkRings[0]?.[0]
    if (probe && pointInRing(probe[0], probe[1], ring)) {
      ringByKey.set(fe.blockKey, ring)
      break
    }
  }
}
// ... then existing per-fe intersectRings clip works unchanged.
```

Stage 2's dry-run validates: 257/295 drifted entries resolve to their true owner via containment, all real overshoots collapse to zero. The 38 unresolvable fes (band probe falls outside all rounded rings — degenerate band geometry) need a fallback or are left unclipped (acceptable; they're <0.01% of repo-wide ring vertex count).

**Why this over "thread pass-1 frontageEdges into the helper":** the containment-register-by-fe pattern is local to `buildFrontageBands`, no signature change, no pass-1 lookup plumbing. Per `feedback_corner_pad_continuity_first`-adjacent logic, identity (which fe owns this ring) beats geometric heuristic (find ring by key); inheriting the key FROM the fe IS identity, just routed through the ring instead of through a tuple.

**Status:** Stage 3 dispatch queued. ~15 LOC in `buildFrontageBands`. Re-bake both looks. Re-run probe; expect 0 real overshoots. Closes §6.1.

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

---

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

*Updated: 2026-05-17. Coordinator-Claude session, post Phase 2-arc revert.*
