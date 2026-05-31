# HANDOFF — Chain-consumer census (Phase B)

**Status: v1.0 (2026-05-31) — forensic, read-only. Author: Plumb.**
**Scope:** every site in Phase B (`buildBlockGeometryV2` + helpers · `cartograph/bake-ground.js` · `src/cartograph/BlockGeometryV2Debug.jsx` incl. `buildChainBandsLive`) that reads chain data. Line numbers verified against live code 2026-05-31 (`cartograph-looks-pass-ab`, file `src/lib/buildBlockGeometryV2.js` = 3304 lines).

This census is the linchpin named in `cartograph/BACKLOG.md §NOW.2` and `PIPELINE.md §Wall`. It scopes the wall-move ("the Skeleton is the First Bake") and tells the in-flight Toy-skeleton tooling which chain-reads to **preserve** (move into the First Bake at Survey-exit) vs **retire** (eliminate once the polygon is frozen). Read `PIPELINE.md §Wall` + `RIBBONS.md §1` first.

---

## How to read this

**The wall-move, restated precisely.** Today `buildBlockGeometryV2` is one monolith that reads chains from P4 (asphalt rects) through P8 (corner rounding), then *keeps* reaching back for chains in P10's fallback + bake-ground's material routing. The wall-move splits it: **the First Bake** (runs at Survey-exit, may run live inside the Survey tool) reads chains *once* and freezes `{blockRounded + arcMeta, per-edge fe records with baked measure, corner records, asphalt + caps with material tags, fillet residual}`. Everything downstream (Stage / Preview / production bake) consults that frozen artifact and reads **zero chains**.

So each read resolves to one of four fates:

- **MOVE-TO-FIRST-BAKE** — a legitimate chain read that *produces* (part of) the frozen artifact. It keeps reading chains, but only at Survey-exit. After the move it never runs downstream. (Chains are *allowed* to die here — this IS where they die.)
- **ELIMINATE** — the read exists only because the artifact isn't frozen yet. Once the polygon + baked attributes exist, it's pure re-derivation the frozen shape obviates. blockKey-drift faults live here.
- **SURVEY-TOOL-ONLY** — stays a chain consumer forever, but lives inside the Survey authoring tool (the live editor / corner-radius kit / preview), never in the downstream bake. The sanctioned exception.
- **⚠️ UNCLASSIFIED / HARD** — doesn't fit cleanly; this is where the wall-move's real difficulty lives.

**GEOMETRY vs METADATA is the load-bearing axis.** Metadata reads (per-edge `measure`, street `highway` class, cap type) are *nearly free to move* — bake them once as per-edge / per-ring attributes (the `bakeFeScalars` pattern already proves this). Geometry reads (chain `points` → asphalt rectangles, `points`+perps → corner `Vc` + tangents → the rounded polygon) are **the actual wall-move** — they irreducibly need the centerline and produce the frozen shape. The census flags each read's kind so the two efforts can be scoped separately: the metadata freeze is a weekend; the geometry freeze is the project.

**Headline finding up front:** the keeper emitter (`emitOneBlockRingBands`, P10) is **already 99% wall-clean** — it operates on the frozen rounded ring + baked `fe.measure` and reads chains in exactly **one** place: the `probeFeForRun` adjacency fallback (line 2074). P9 (asphalt mouths), P12 (curb), P13 (LU/faces) read **zero chains today.** The chain dependency is concentrated in P4–P8 (the producers) + two metadata leaks (bake-ground highway routing; the P10 fallback) + one genuinely hard residual (P11 fillet needs the per-chain asphalt rectangles, which `blockRounded` does not capture).

---

## PATH 1 — `src/lib/buildBlockGeometryV2.js` (the bake body + helpers)

### 1a. The producers (P4–P8) — MOVE-TO-FIRST-BAKE

| # | Location | Reads | Kind | Produces | Role | Class | Notes / risk |
|---|---|---|---|---|---|---|---|
| 1 | Inner-edge transform, `buildBlockGeometryV2` body L2546–2557 | `s.anchor`, `s.innerSign`, `s.measure`, `s.segmentMeasures` | METADATA | post-transform `streets[]` (inboard ped zeroed on divided carriageways) | primary | **MOVE** | Pure metadata rewrite. Freezes trivially as the *resolved* per-edge measure. ⚠️ The freeze must absorb `segmentMeasures` + `couplers` (segment-range overrides), not just `measure` — verify the per-edge `fe.measure` captures coupler variation (today `bakeFeScalars` reads only `streets[chainIdx].measure[side]`, see #13 risk). |
| 2 | `resolveChainSegmentation(streets)` L964; called L2564 | all `s.points` (coord-bucket match, EPS 0.5m) | GEOMETRY | `ixByChain: Map<chain, Set<vertexIdx>>` — the single source of IX identity | primary | **MOVE** (ephemeral scaffold) | Output is internal scaffolding for #3/#7/#10/#11 — does **not** itself freeze into the artifact. Replaces stale `intersections[].ix`. |
| 3 | `naturalSegments(street, ixSet)` L923 | `street.points.length`, `street.intersections` (fallback), `ixSet` | GEOMETRY/identity | per-chain segment partition `[{start,end}]` | primary | **MOVE** (ephemeral scaffold) | Consumed by emitChain (#14), cornersAtIx (#6), assignSegOrdsToFes (#11), buildChainBandsLive (#33). segOrd↔edgeOrd contract. |
| 4 | `buildChainSegmentIndex(streets)` L1034; called L2758 | `s.points`, `s.measure`, `s.disabled` | GEOMETRY | `chainIndex` spatial grid (30m cells) over chain segments | primary | **MOVE** (ephemeral scaffold) | Only an acceleration structure for the adjacency probe (#12). |
| 5 | `chainPavementRing(street)` L124 | `street.points`, `street.measure`, `street.capStart/capEnd/capEnds` | GEOMETRY+METADATA | closed pavement ring w/ round caps | — | **DEAD** | ⚠️ **Zero call sites** (grep-verified). Vestigial; superseded by emitChain's inline asphalt + `quarterCap`. Flag for C5/cleanup deletion — do not migrate. |
| 6 | `cornersAtIx(...)` L365; called L2832 → helpers `resolveIxRef` L236, `buildLegSidePolyline` L277, `polylineCross` L334 | `chain.points` (Q via offset-polyline crossing), `chain.measure` (depths), `chain.skelId`/`chain.name` (legKey, through-T skip), `ix.point`/`ix.streets`, `naturalSegments`, `feLookup`, `blockCustoms` | **GEOMETRY** (Vc + T_A/T_B from offsetting `points` & crossing) **+ METADATA** (depths, name) | corner records `{point Vc, V, theta, d_min, R_class, R_authored, T_A, T_B, outerR_A, outerL_B, rightDepth_A, leftDepth_B, flankingFes, legRefs}` | primary (P7) | **MOVE** | **The hard geometry core.** `Vc`/`T_A`/`T_B` come from perp-offsetting `chain.points` (`buildLegSidePolyline`, depth 6) and crossing leg A's +side vs leg B's −side (`polylineCross`). Irreducibly chain-geometry. `R_authored` override = SURVEY-TOOL input (see #c1). No-crossing → SKIP (median wedge). Must freeze corner records **by value**. |
| 7 | `emitChain` (closure) L2605; pass-1 loop L2721, pass-2 loop L2809 | `street.points`, `street.measure`, `naturalSegments`, `capStart/capEnd/capEnds` (via `quarterCap` L2477) | **GEOMETRY** (asphalt rects = `points ± perp·pavementHW`) **+ METADATA** (widths, caps) | `byChain[].asphaltRings` + `treelawnCapRings`/`sidewalkCapRings` (round dead-end caps) | primary (P4) | **MOVE** | The asphalt-from-points foundation → unions into `asphaltSharp` → figure-ground. ⚠️ Its output (`byChain.asphaltRings`, cap rings) **leaks past the wall** — consumed by P11 fillet (#19) + bake-ground highway routing (#22). See HARD §H1/H2. |
| 8 | `asphaltSharp` union + `blockSharp` figure-ground, body L2726/L2749 (+ pass-2 rebuild L2810–2813) | `byChain.asphaltRings` (chain-emitted) | GEOMETRY (derived) | `asphaltSharp`, `blockSharp` (the positive blocks) | primary (P5) | **MOVE** | `differenceRings([stencil], asphaltSharp)`. The figure-ground inversion. Once `blockSharp`/`blockRounded` freeze, this never re-runs. |
| 9 | `buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain)` L1065; called L2760/L2814 | `blockSharp` ring verts (polygon) + chain ownership via `findAdjacentChainForBlockEdge` (#12) | GEOMETRY (probe) | `fe[] {points, blockKey, blockRingIdx, edgeOrd, chainIdx, side, ringCcw, segOrds:[]}` | primary | **MOVE** | fes are the per-edge carriers that freeze. Corner detection = chain-**identity** change across vertex (via probe owner), not angle. `blockRingIdx` (L1146) is the drift-free join surface (see #18). |
| 10 | `assignSegOrdsToFes(fes, streets, ixByChain)` L1173 | `chain.points`, `chain.measure` (ALONG_TOL), `naturalSegments` | GEOMETRY (midpoint projection) | `fe.segOrds` (which natural segs map to each fe) | primary | **MOVE** (ephemeral scaffold) | Links fes↔chain segments for customs resolution *during* the bake. After freeze, fe carries its own `measure`; segOrds need not be in the artifact. |
| 11 | `findAdjacentChainForBlockEdge(edgePoints, ringCcw, streets, chainIndex)` L1335 — **fe-construction use** | `s.points`, `s.measure`, `s.disabled` (or `chainIndex` entries) | GEOMETRY (30m outward probe to nearest centerline) | `{chainIdx, side}` = block-edge owner | primary | **MOVE** | The chain↔block adjacency oracle. In fe-construction it stamps fe ownership → freezes. ⚠️ The *same function* is also the P10 fallback (#18) where it ELIMINATEs. |
| 12 | `bakeFeScalars(streets, frontageEdges, allCorners, blockCustoms, curbWidth)` L1295; called L2845 | `streets[fe.chainIdx].measure[fe.side]` (METADATA), `blockCustoms` | **METADATA** | `fe.measure` (resolved per-edge: pavementHW/treelawn/sidewalk/terminal/curb/materials), `blockScalars.W`, `corner.swCornerDepth` | primary | **MOVE** | ⭐ **This is the metadata-freeze prototype (the C2 work).** It already bakes per-edge measure as an attribute so the emitter "never reads `streets[*].measure`" (RIBBONS §1 wall enforcement). The whole metadata side of the wall-move is *this pattern, extended*. Cheapest part of the move. |
| 13 | `applyRoundCornersToRing(ring, corners, scale)` L713; called L2856 | `corners[]` records (`.point`, `.theta`, `.T_A/.T_B`, `.R_authored`, `.d_min`, `.R_class`) + `blockSharp` ring | GEOMETRY (consumes chain-derived corner geometry; Bezier on polygon) | `blockRounded` + `arcMeta` (per-vertex corner identity + `arcPositionFrac`) | primary (P8) | **MOVE** | Produces the **central frozen artifact** (`blockRounded`). Does **not** read `chain.points` directly — consumes the corner records (#6) + the polygon ring. `scale` = `cornerRadiusScale` (SURVEY input, #c1). "Last place chains are consulted" (transitively, via corner records). |

### 1b. The downstream consumers (P9–P13) — mostly already clean

| # | Location | Reads | Kind | Produces | Role | Class | Notes / risk |
|---|---|---|---|---|---|---|---|
| 14 | Pass-2 re-emit + blockKey carry-forward, body L2796–2828 | `blockCustoms[fe.blockKey][fe.edgeOrd]`; re-runs emitChain; matches pass-1↔pass-2 fes on `(chainIdx, segOrds[0], side)` | METADATA (customs) + identity join | corrected asphalt + carried `(blockKey, edgeOrd)` | primary | **ELIMINATE** | ⚠️ **The blockKey-drift fault class lives here** (`feedback_d7a_blockkey_drift`, `feedback_block_key_rounded_vs_sharp_diverges`). Pass-2 asphalt expansion shifts bbox centers ≥0.5m → `blockKeyFromRing` flips → customs mis-key. Once the polygon + per-edge measure freeze, **there is no re-emit and no drift** — the entire two-pass machine + carry-forward join evaporates. |
| 15 | `asphaltRounded = stencil − blockRounded`, body L2862–2867 (P9) | `blockRounded` (polygon) only | GEOMETRY (derived) | `asphaltRounded` (rounded street mouths) | primary | **clean today** | **Zero chain reads.** Negative of the frozen block. Mouths inherent. |
| 16 | `emitBlockRingBands` L2300 / `emitOneBlockRingBands` L1974 (P10, toy keeper) | rounded `ring`+`arcMeta` (polygon), `blockFes` (`fe.measure`, `fe.chainIdx/side/edgeOrd` — baked), `blockKeyFromRing(sharpRing)` L1984/L2317-grouping; **`streets`+`chainIndex` only for `probeFeForRun` L2074** | GEOMETRY (frozen ring) + baked METADATA | mono-width band entries (16-fields, SW/LU tags) | primary | **ELIMINATE** (the one chain read) | ⭐ **Already wall-clean except `probeFeForRun`.** Recomputes `TL_block`/`SW_block` from `blockFes` (so even `blockScalars` is optional). The lone chain dependency is the adjacency fallback for un-corner-bounded sub-runs → ELIMINATE by freezing fe-per-span. |
| 17 | `emitOneBlockRingBands` → `probeFeForRun(idxs)` L2071–2080 → `findAdjacentChainForBlockEdge` (#11) | `streets`, `chainIndex`, ring sub-path | GEOMETRY (probe) | owning fe for a straight sub-span lacking corner-flanking-fes | fallback | **ELIMINATE** | Fires only on kink-split / no-corner sub-runs. Frozen artifact must record **fe↔span** ownership so this fallback isn't needed. (Primary path already uses `corner.flankingFes` sidecar — no chain read there.) |
| 18 | `emitBlockRingBands` ring-index-parity grouping L2317–2334 | `fe.blockRingIdx` (stamped L1146) ↔ `blockRoundedWithMeta[bi]` index | identity join | fes grouped per block | primary | **MOVE / ELIMINATE** | Not a chain read per se, but the *workaround* for blockKey drift. Frozen artifact should carry an explicit stable block↔fe↔corner↔span id scheme so the parity gymnastics retire. See HARD §H4. |
| 19 | `attributeFilletResidualToArcs(asphaltRounded, perChainAsphalt, frontageBands, allCorners)` L2358; called ~L2910 | `perChainAsphalt = ∪ byChain.asphaltRings` (chain rects, #7), `corner.point` (#6), `asphaltRounded` | GEOMETRY (residual + centroid match) | per-corner fillet asphalt rings + `cornerOrphanAsphalt[]` (P11) | primary | **⚠️ HARD** | `filletPolys = asphaltRounded − ∪(per-chain rectangles)`. **Depends on the per-chain asphalt rectangles** — a pure chain artifact `blockRounded` does NOT capture (square rect ends vs rounded mouth). See HARD §H1. |
| 20 | Curb stroke, body ~L2920 (P12) | `asphaltRounded` (polygon), `curbWidth` | GEOMETRY (derived) | `curbBands = dilate(asphaltRounded, cw) − asphaltRounded` | primary | **clean today** | **Zero chain reads.** Single silhouette stroke. |
| 21 | Block fill / LU, body L2244–2346 (P13) | `ribbons.faces[]` (parcels, **not** chains), `blockLandUse`, `blockKeyFromRing` | — | `blocks[] {ring, blockKey, lu}` | primary | **clean today** | **Zero chain reads.** Faces are a parallel parcel dataset. LU via `blockKey` direct map (`project_per_block_lu_via_blockkey`). |

### 1c. Legacy LS emitters (dual-emitter §3.9b) — moot post-C5

| # | Location | Reads | Class | Notes |
|---|---|---|---|---|
| L1 | `silhouetteStraightEmitter(streets, …)` L1568 | `streets[adj.chainIdx].measure[adj.side]` via probe (#11) | **moot post-C5** | LS straight bands. Deleted at C5 cutover. Don't over-invest. |
| L2 | `buildFrontageBandsV2(streets, …)` L1714 | `streets[adj.chainIdx].measure[adj.side]` via probe (#11) | **moot post-C5** | LS arc pads (the per-corner construction whose visual gate failed → motivated the mono-width rebuild). Deleted at C5. |
| L3 | `buildFrontageBands(streets, …)` L1475 | `streets[fe.chainIdx].measure[fe.side]` | **DEAD** | ⚠️ Zero call sites (grep-verified; RIBBONS §3.9 already flags). Delete in C5 sweep. |

> Note: when C5 deletes L1/L2/L3, the legacy chain reads vanish with them — they are **not** part of the wall-move accounting. Only the toy keeper (P10, #16) carries forward.

---

## PATH 2 — `cartograph/bake-ground.js` (the bake driver)

| # | Location | Reads | Kind | Produces | Role | Class | Notes / risk |
|---|---|---|---|---|---|---|---|
| 22 | `buildBlockGeometryV2(ribbons, {...})` call, `buildV2BakeShape` L282 | passes `ribbons` (streets + intersections + faces) wholesale into Phase B | — | the v2 geometry bundle | primary | **MOVE** | The driver hands the entire chain dataset to Phase B. Post-wall, the driver loads the **frozen artifact** instead of invoking the chain-reading geometry. This call *is* the seam where the First Bake plugs in. |
| 23 | Highway-class asphalt routing L320–326 | `streets[c.chainIdx]?.highway` | **METADATA** | `asphaltKey = HIGHWAY_CLASSES.has(cls) ? 'highway' : 'asphalt'` — routes each chain's asphalt rings to the right material group | primary | **ELIMINATE / MOVE** | ⚠️ **A metadata leak past the wall.** Same shape as `bakeFeScalars`: bake the asphalt material class as a **per-ring attribute** at First-Bake time, then the downstream bake reads the tag, not `streets[chainIdx].highway`. Cheap to move (metadata). Couples to HARD §H2 (per-chain asphalt identity must survive the freeze). |
| 24 | ribbons load L573–579 | `ribbons.json` path (per-scene) | infra | parsed `ribbons` | — | **MOVE** | The First Bake would emit + the downstream bake would read a frozen `*-slab-shape.json` (or equivalent) instead of `ribbons.json`. |
| 25 | `useRingBandEmitter = scene === 'toy'` L594 | scene string | — | dispatch flag | — | n/a | Not a chain read; the C5 cutover lever. |

> `streets[c.chainIdx]?.highway` (#23) and the per-chain asphalt rings it routes (#7) are the **only** chain-derived data bake-ground touches outside the `buildBlockGeometryV2` call. Everything else it consumes (`byMaterial`, `byFaceUse`) is already polygon output.

---

## PATH 3 — `src/cartograph/BlockGeometryV2Debug.jsx` + `buildChainBandsLive` (Designer mirror — the third path)

**Framing:** the Designer *is* the Survey authoring tool. After the wall-move, the First Bake runs here (live, on edit) — so chain reads in this file are **legitimate and permanent**, classified SURVEY-TOOL-ONLY *except* where they're literally the same producers as Path 1 running live (those are MOVE — they're the live First Bake). The distinction that matters: none of these reads should ever appear in the **downstream** (Stage / Preview / production) consumers.

| # | Location | Reads | Kind | Produces | Role | Class | Notes / risk |
|---|---|---|---|---|---|---|---|
| 26 | `buildBlockGeometryV2(liveRibbons, …)` L333 | full `liveRibbons` (live store chains) | — | live geometry bundle | primary | **MOVE** (live First Bake) | The interactive First Bake. Same code as #22; runs on every debounced edit. This is *where* chains die at Survey-exit. |
| 27 | `isHighwayChain(chainIdx)` L240 | `liveRibbons?.streets?.[chainIdx]?.highway` | METADATA | render visibility gate (highway vs asphalt mesh) | primary | **SURVEY-TOOL-ONLY** | Mirror of #23 on the render side. Tool affordance. |
| 28 | `liveStreets` L245 + `selectedRibbonsChainIdx` mapping L285–292 | `centerlineData.streets`, `s.skelId` (identity translation centerlineData-order ↔ ribbons-order) | METADATA | selected-chain index translation | primary | **SURVEY-TOOL-ONLY** | Selection identity. ⚠️ The two arrays are different orders (derive.js inserts split chains) — `skelId` is the join. Authoring-only. |
| 29 | `liveIxByChain = resolveChainSegmentation(liveRibbons.streets)` L274 | `s.points` (all live chains) | GEOMETRY | live `ixByChain` for the drag path | primary | **SURVEY-TOOL-ONLY** | Memoized so the drag tick doesn't re-resolve. Feeds #32/#33. Mirror of #2 but tool-scoped. |
| 30 | frontageEdges stash L357–363 | `streets[fe.chainIdx].skelId`/`.name` | METADATA | MeasureOverlay click→fe resolution stash | primary | **SURVEY-TOOL-ONLY** | The measure-authoring kit (`findFeForSide`). Authoring-only. |
| 31 | `selectedAdjacentBlockKeys` probe L401–447 (+ block-mode L452+) | `chain.points`, `chain.measure` (probe radius) | GEOMETRY + METADATA | translucency block-key set (aerial reads through selected chain's neighborhood) | primary | **SURVEY-TOOL-ONLY** | Pure render affordance; never in slab. Reads `points` directly for proximity probe. |
| 32 | `liveSelectedRings = buildChainBandsLive(chain, …)` L529–553 | `liveRibbons.streets[idx]` (chain), `blockCustoms`, `frontageEdges`, `liveIxByChain`, `blockRoundedWithMeta`, `blockSharp`, `streets` | — | live-drag band preview for the selected chain | primary | **SURVEY-TOOL-ONLY** | The ~1ms drag-preview path. Must lockstep the keeper emitter (`feedback_live_drag_preview_migrates_with_main_emitter`). |
| 33 | `buildChainBandsLive(chain, chainIdx, blockCustoms, frontageEdges, opts)` L3114 | `chain.points`, `chain.measure`, `naturalSegments`, `computePerps` (GEOMETRY); `feBySegSide` customs (METADATA); calls `emitOneBlockRingBands` (→ needs `streets`+`chainIndex` for #17 probe + `blockKeyFromRing(sharpRing)` L3216) | GEOMETRY + METADATA | per-chain live rings + edge polylines | primary | **SURVEY-TOOL-ONLY** | The whole function is tool-scoped by definition. ⚠️ Uses `blockKeyFromRing(sharpRing)` (L3216) as a block-index join — the fragile key, acceptable here because it's per-selected-chain and re-runs each tick. |

---

## Synthesis

### 1. What must "The First Bake" PRODUCE so nothing downstream needs chains?

The frozen Survey-exit artifact (call it the *slab-shape*) must carry, **by value**:

1. **`blockRounded[]` + `arcMeta[]`** — the rounded block polygons (the positive geometry) and the per-vertex corner-identity / `arcPositionFrac` sidecar. (From #13.) This is the central artifact; `asphaltRounded` (#15), `curbBands` (#20) and LU clips (#21) all derive from it with **zero** further chain reads.
2. **Per-edge `fe` records, with `measure` baked in** — `{points, blockRingIdx (stable block id), edgeOrd, owner-id, side, measure:{pavementHW, treelawn, sidewalk, terminal, curb, materials:{outer,inner}}}`. (From #9 + #12.) The metadata freeze — the cheap, proven half (`bakeFeScalars` already does this internally; it just needs to *persist*). Must also absorb `segmentMeasures` + `couplers` (see §1 #1 risk).
3. **Corner records, by value** — `{point Vc, V, theta, d_min, R (resolved post-override & post-scale), T_A, T_B, swCornerDepth, flankingFes (as frozen fe-ids)}`. (From #6 + #12.) The hard geometry. `applyRoundCornersToRing` (#13) and `attributeFilletResidualToArcs` (#19) both consume these — freezing them by value is what lets P8/P11 stop touching chains.
4. **Per-span fe ownership** — which fe owns each straight/synthetic span of each rounded ring, so the P10 `probeFeForRun` fallback (#17) never runs. (The `corner.flankingFes` sidecar already covers corner-bounded spans; the residual is kink-split sub-runs.)
5. **Asphalt + caps with material tags** — the per-chain `asphaltRings` + round-cap rings (`treelawnCapRings`/`sidewalkCapRings`/asphalt pie), each tagged with its material class (`highway` vs `asphalt`) so bake-ground's `streets[chainIdx].highway` read (#23) retires. (From #7.) See HARD §H2.
6. **The fillet residual** — either the pre-attributed per-corner fillet polygons, or the `perChainAsphalt` union, frozen. (From #19.) See HARD §H1 — this is the one piece `blockRounded` alone cannot regenerate.
7. **A stable cross-reference id scheme** — block ↔ fe ↔ corner ↔ span linked by explicit ids, replacing the `blockKey` / ring-index-parity joins (#14, #18). (Design work, see HARD §H4.)

The `stencil` and `ribbons.faces[]` (parcels) are already non-chain and pass through unchanged.

### 2. What chain-reads ELIMINATE outright?

- **The entire pass-1/pass-2 two-pass emit machine + blockKey carry-forward** (#14). No re-emit once the polygon freezes ⇒ the whole `blockKeyFromRing` rounded-vs-sharp + pass1-vs-pass2 **drift fault class dies** (`feedback_d7a_blockkey_drift`, `feedback_block_key_rounded_vs_sharp_diverges`). This is the single biggest reliability win of the wall-move.
- **`probeFeForRun` adjacency fallback in P10** (#17) — replaced by frozen per-span fe ownership.
- **bake-ground highway re-lookup** (#23) — replaced by a frozen per-asphalt-ring material tag (this is technically a "move to First Bake as attribute" = eliminate the *downstream* read).
- **`resolveIxRef`'s stale-`ix` tolerance matching + the `intersections[].ix` fallback in `naturalSegments`** — corner records frozen by value ⇒ no IX-ref resolution downstream.
- **The ring-index-parity workaround** (#18) — once explicit ids exist (artifact §7).

### 3. What stays SURVEY-TOOL-ONLY?

- **The live First Bake + drag preview** — Designer's `buildBlockGeometryV2` (#26) and the entire `buildChainBandsLive` path (#32, #33). The Survey tool is the chain editor; it reads chains forever, but only to author + preview, never to feed the downstream slab.
- **The corner-radius authoring kit** — `R_authored` / `cornerRadiusScale` overrides feeding `cornersAtIx` (#6 §c1) + `applyRoundCornersToRing` (#13). The sanctioned exception named in `RIBBONS.md §1`. (Lives in `CornerEditHandles.jsx` / `MeasureOverlay.jsx`, outside the three census files but it's the upstream source of #6's `R_authored` / #13's `scale`.)
- **Measure-authoring affordances** — `selectedAdjacentBlockKeys` translucency probe (#31), the frontageEdges click-resolution stash (#30), `skelId` identity translation (#28), `isHighwayChain` render gate (#27), `liveIxByChain` (#29).

### 4. ⚠️ The UNCLASSIFIED / HARD residual — where the wall-move is genuinely difficult

**H1 — The fillet residual needs the per-chain asphalt rectangles, which `blockRounded` does not capture.** (#19, depends on #7.) `filletPolys = asphaltRounded − ∪(per-chain square-ended rectangles)`. The square rectangle ends vs the rounded mouth is *exactly* the geometric delta that creates the fillet wedge. `blockRounded` is the rounded shape — it has thrown away the square-end information. So freezing `blockRounded` alone is **insufficient**: the First Bake must additionally freeze either (a) the pre-attributed per-corner fillet polygons (cleanest — attribution already happens at bake time), or (b) the `perChainAsphalt` union. This is the clearest case where a *chain-derived intermediate that is not the block polygon* is load-bearing downstream. Recommend (a): freeze the attributed fillet rings + `cornerOrphanAsphalt` directly onto the corner/orphan records.

**H2 — `byChain.asphaltRings` carries chain *identity* past the wall, twice.** (#7 → #19 fillet + #23 highway routing.) The asphalt isn't just a shape — each chain's rings are routed by that chain's `highway` class, and the fillet diff needs them grouped per-chain. The freeze must tag asphalt geometry with (material-class, and enough grouping to compute the fillet). Tractable but it means the asphalt artifact is richer than "one merged `asphaltRounded` polygon."

**H3 — Chain-endpoint round caps have no fe (the Dead-end/Spike typology).** (#7 cap emission, L2676–2714.) `treelawnCapRings`/`sidewalkCapRings` + the asphalt pie at `cap==='round'` endpoints are emitted **per chain endpoint**, attributed to a chain, with no block-edge (fe) home. This is precisely the open `HANDOFF-dead-end-typology` / `BACKLOG §NEXT` question: *"what Survey-side authoring do chain-endpoints become?"* The First Bake must freeze cap rings as attributed geometry, and the Survey tool needs an authoring model for endpoint type (Spike / Stub-with-cap / Stub-no-cap) since the cap is an irreducibly chain-endpoint concept. **This is the corner of the artifact with the least-settled shape.**

**H4 — Identity: the frozen artifact needs a stable id scheme the current code lacks.** (#14, #18, plus `blockKeyFromRing(sharpRing)` at #16/#33.) Today block↔fe↔corner↔span links ride on `blockKey` (bbox-rounded, drifts on two axes) patched by ring-index parity (#18) and pass-1 carry-forward (#14). The frozen artifact can't lean on a *recomputed* key — it must assign explicit, stable ids at First-Bake time (block index, fe id, corner id, span id) and store the links by id. Designing that scheme — and migrating `blockCustoms` keying (currently `(blockKey, edgeOrd)`) onto it — is real work, not mechanical. Get this wrong and the artifact reintroduces the very drift class the wall-move exists to kill.

**H5 — The corner geometry is irreducible and R-coupled.** (#6 + #13.) `Vc`/`T_A`/`T_B` come from offsetting `chain.points` and crossing them — there is no polygon-only substitute (the block ring's sharp corner is *where two offset-polyline crossings would be*, but the tangents/inset that drive the Bezier need the centerline geometry). So this read **must** run in the First Bake (it cannot ELIMINATE). And it's coupled to an operator input (`R_authored`, `cornerRadiusScale`): change R and the rounded polygon must re-derive. This is internally consistent — the First Bake lives in Survey, R is a Survey input, so re-running on R-change is natural — but it means **the First Bake is not a one-shot "compile once and forget"; it re-runs on every shape/corner edit.** The artifact is frozen *relative to a given Survey state*, re-poured when Survey changes. (This matches `project_two_bakes_two_walls`: "re-bake is block-local" — block-independence is verified, so the re-pour is cheap, but it is a re-pour.)

**H6 — `segmentMeasures` / `couplers` coverage gap in the metadata freeze.** (#1 + #12 risk.) `bakeFeScalars` (#12) resolves `fe.measure` from `streets[fe.chainIdx].measure[fe.side]` (+ `blockCustoms`) — it does **not** read `segmentMeasures` or `couplers`. The inner-edge transform (#1) *does* transform `segmentMeasures`, and `emitChain`'s `resolveSide` honors per-segment customs, but the **per-fe baked measure may not capture coupler/segment variation within a chain.** Before freezing per-edge measure as the SSOT, verify (or close) whether any production data uses `segmentMeasures`/`couplers` in a way the per-fe freeze would silently drop. (Inert on toy; LS unknown — audit before C5/wall-move. Adjacent to `feedback_customs_resolver_wholesale_not_merge`.)

---

## Bugs / tempting fixes NOTED (not fixed — scope discipline)

- **N1 (dead code):** `chainPavementRing` (L124) — zero call sites, vestigial. Delete in C5 sweep. (#5)
- **N2 (dead code):** `buildFrontageBands` (L1475) — zero call sites; already flagged in `RIBBONS.md §3.9`. Delete in C5 sweep. (L3)
- **N3 (latent):** the `segmentMeasures`/`couplers` freeze gap (HARD §H6) — not a live bug (toy writes full measures) but a sharp edge for the wall-move's metadata freeze. Audit LS data before relying on per-fe measure as SSOT.
- **N4 (observation, not a bug):** `buildChainBandsLive` uses `blockKeyFromRing(sharpRing)` (L3216) as a block-index join — the exact key the bake-side deliberately avoids via ring-index parity (#18). Tolerable in the live path (per-selected-chain, re-runs each tick) but worth noting it's a parallel fragile join that would also benefit from H4's stable id scheme.

---

*Census complete. The metadata side of the wall-move (#1, #12, #23 — the `bakeFeScalars` pattern extended) is a small, low-risk effort. The geometry side (#6, #7, #13 producing the frozen shape; H1–H5) is the project. P9/P12/P13 are already wall-clean today, and the keeper emitter (P10) reads chains in exactly one fallback. The wall is closer than the monolith's size suggests — the work is concentrated, not diffuse.*
