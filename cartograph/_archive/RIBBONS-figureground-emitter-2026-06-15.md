# RIBBONS — the figure-ground / `buildBlockGeometryV2` emitter (RETIRED, archived 2026-06-15)

> **Cool / Diary.** This is the **retired figure-ground reference** lifted out of the active `cartograph/RIBBONS.md` when that doc was rewritten to the **TILE model** (2026-06-15). The figure-ground emitter (`src/lib/buildBlockGeometryV2.js`) is **dead in the live render + bake** — its meshes early-return; the live geometry is `src/lib/tileGround.js`. The file persists only as (a) a **utility module** (`differenceRings` / `intersectRings` / `unionRings` / `blockKeyFromRing` / `pickLuFromHash` / `hashKey` / `resolveChainSegmentation`, still imported by `tileGround.js` + the overlays) and (b) the **Designer authoring-overlay compute** still mounted by `BlockGeometryV2Debug.jsx` / `bake-ground.js:351` (toy path), scheduled for deletion at **T4**.
>
> Read this only for a true archival deep-dive into how figure-ground worked. The **live canon is `RIBBONS.md` (tile model)** + `SKELETON.md` + `SECTION.md`. The **13-month corner saga** (what was tried/failed/why) is its sibling: [`RIBBONS-history-2026-06-12.md`](RIBBONS-history-2026-06-12.md). git holds the verbatim pre-rewrite `RIBBONS.md`.

---

## The figure-ground model, in one sentence

**Blocks are positive space; streets are the void around them; everything visible (asphalt, curb, sidewalk, treelawn, corner mouths) is a property of the block polygons' silhouettes.** Built by `buildBlockGeometryV2(ribbons, opts)` (~530 LOC, `src/lib/buildBlockGeometryV2.js`).

The three structural moves:
1. **Round the block, derive asphalt as negative.** `applyRoundCornersToRing` runs a Bezier (handle `(4/3)·R·tan((π−θ)/4)`, 16 samples) at every block-convex vertex of each `blockSharp` ring; `asphaltRounded = stencil − blockRounded` (the rounded street mouth is the back side of the rounded block corner — inherent, not constructed).
2. **The ribbon wraps the silhouette (mono-width).** `pedBand = inset(blockRounded, cw) − inset(blockRounded, cw + W)`. The corner falls out concentric for free.
3. **The curb is the silhouette stroke.** `curbBands = dilate(asphaltRounded, cw) − asphaltRounded`.

## The figure-ground data shapes (retired)

- `asphaltSharp = ∪ per-chain rectangles` → `blockSharp = stencil − asphaltSharp` (figure-ground inversion) → `blockRounded = blockSharp.map(applyRoundCornersToRing)` → `asphaltRounded = stencil − blockRounded`.
- `frontageEdges` — one entry per block-edge polyline corner-to-corner (`{points, blockKey, edgeOrd, chainIdx, side, ringCcw, segOrds}`), built by `buildFrontageEdges`; corner detection identity-driven (owning chain CHANGES across a vertex).
- `cornersAtIx` — per CCW-adjacent leg-pair at each IX, corner point `Vc` from **polygon-edge crossing** (`polylineCross(polyA, polyB)`), not far-field tangent extrapolation; no crossing → SKIP (median wedge — **this is the park-corner skip the tile path lost**, see `SKELETON.md §5e`).
- `arcMeta` — per-emitted-vertex `{corner, R, arcPositionFrac} | null` sidecar from `applyRoundCornersToRing`.
- `blockCustoms[blockKey][edgeOrd]` — per-block-edge cross-section override; `blockKey` bbox-stable to 0.5m (the `feedback_d7a_blockkey_drift` carry-forward).
- `frontageBands` — straight-span + arc-span entries (the per-leg ribbon output).

## The function-by-function pipeline (retired)

`buildBlockGeometryV2`: inner-edge transform → `resolveChainSegmentation` (ixByChain) → `emitChain` pass 1 (per-chain asphalt rects + caps) → build `asphaltSharp`/`blockSharp`/`frontageEdges` → `emitChain` pass 2 (customs) → `cornersAtIx` → `applyRoundCornersToRing` (consume-spans + Bezier emit + arc-reversal) → `asphaltRounded` → **dual band emitter** (`emitBlockRingBands` mono-width on toy · `silhouetteStraightEmitter` + `buildFrontageBandsV2` per-leg on LS) → `attributeFilletResidualToArcs` → curb stroke → block fill / LU.

**The dual emitter (`useRingBandEmitter`, `scene==='toy'`):**
- **toy (V1 keystone):** `emitBlockRingBands → emitOneBlockRingBands` — the mono-width ring band. Three inward Clipper offsets of `blockRounded` (`cw` / `cw+TL` / `WB`) with **`jtMiter`**, 2 strips + sector slicing; the corner is the `fullBand` slice (band bent). "Ribbon monowidth, strips variable."
- **LS (legacy):** `silhouetteStraightEmitter` (straight bands, per-vertex perp) + `buildFrontageBandsV2` (per-corner pad with ASYM / SYM-WITH-RAMP / SYM-NO-RAMP regimes — the per-corner pad whose operator-visual gate failed, motivating the mono-width rebuild).

**The corner Bezier:** `tA/tB = cornerVertex + inset·T`, handle `(4/3)·R·tan((π−θ)/4)`, 16 samples, arc reversed in block-CCW walk.

## What carried forward to the tile model (live invariants)

The **emitter mechanics above are dead**; these **corner principles survived the rewrite** and bind the tile construction (live home: `RIBBONS.md §1`):
1. The corner is the band **BENT around the arc** — a slice of the same continuous concentric offsets — never a separately-constructed primitive.
2. Concentric ped-band offsets use **`jtMiter`, never `jtRound`** (jtMiter passes operator-authored R=0 squares through sharp; jtRound re-rounds by radius=depth and corrupts squares).
3. The ADA corner pad is a **band-slice**, not predicated on the arc (works square OR round).
4. **Mono-width** per block/run, not per-leg stitched.

## Retired Designer gesture model (pre-V1.5)

Before the 16-fields + per-leg material swap, the Measure tool's right-/ctrl-click did **boundary add/subtract** (`tryDeleteHandle` / `tryInsertBoundary`); V1.5 retired both for the binary LU↔SW **material flip** (`tryFlipStripMaterial`). Live authoring is now `SECTION.md` + `SKELETON.md §4`.

## Retired failure modes (figure-ground-era)

- **49 residual SELFINT band rings** (`scratch/all-band-selfint-scan.js`) — inward-offset folds on long curved per-fe polylines; the live equivalent is the tile **G12 thorn** class (capacity guard; `HANDOFF-tile-feature-ledger.md` row G12).
- **Curb stroke gaps on long curves** — `dilate − difference` Clipper precision; failed morphological-closing fix (`c360fc2`→`3a80549`); queued Path-b polyline offset. (Live curb is now `offsetRingVariable` in `tileGround.js`.)
- **MeasureOverlay dblclick vs spec** — cosmetic.

*(The phantom-park `classify.js:60` mode is NOT figure-ground-specific — it's a live data/classification bug and stays in the active `RIBBONS.md`.)*
