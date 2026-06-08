# SECTION FILL — Forensic report (the corners + the handles)

**Agent:** Plumb (fresh, cold eyes). **Read-only** — no code/doc/bake touched. Proxies labelled as proxies; the operator's eye is the gate.
**Date:** 2026-06-07. **Trunk:** `cartograph-looks-pass-ab`. **Artifact under test:** `public/baked/lafayette-square/shape.json` (101 tiles, current — carries `runs[]` with `skelId/side/segOrd/baseMeasure/measure`).

**TL;DR.** Both symptoms are real and **structural**, and neither is caused by the recent per-edge commits — they pre-date them, exactly as briefed.
- **Corners draw wrong** = the Section corner **fill** is a **disk cookie-cutter** centred on the centreline node (`sectionPass`), not the tangent-to-tangent bent slice the canon describes; it also **inherits** any disruption in the frozen `iA`, and **vanishes entirely on 36/101 tiles** the capacity-guard clamps to slivers.
- **Handles don't connect / respond** = the handles (and the selected-chain edge strokes) live in **centreline-ruler space** (`MeasureOverlay` → `sideToStripes` off `chainMeasure`), while the FILL is the **inward offset of the frozen `iA` polygon**. The "one depth truth" wire unified the depth **scalar** but **not the anchor**, so the handle sits on a different model than the strip it should ride. The "doesn't *move* it" half was the genuinely-unread depth override — **now wired in code** (commit `b5c7e98`) and pending render verification; the "doesn't *sit on* it" half is unaddressed.

---

## (a) The render-path map — what renders when

Gate is in `BlockGeometryV2Debug.jsx`:

| Condition | What draws the FILL | File·line |
|---|---|---|
| Measure tool active **and** `shape.json` fetched | **`sectionGeos`** = `sectionOpen(frozenShape, cw, {outer:'LU',inner:'SW'}, stencil, blockCustoms)` → `sectionPass` over the **frozen** tiles | `:635` `sectionFrozen`, `:645` |
| `sectionGeos` truthy | live `buildTileGround` is **skipped** (`if (sectionGeos) return null`) | `:666` |
| Measure tool, no frozen shape (toy / fetch fail) | falls through to live `tileGeos = buildTileGround(liveRibbons, …)` | `:660-668` |

So **in Measure mode the operator is editing against the FROZEN `shape.json`**, re-stroked live by `sectionPass` whenever `blockCustoms` changes (`sectionGeos` deps include `blockCustoms`, `:658`). The silhouette (`iA`) stays frozen; only the interior FILL re-strokes. **This is correct and matches the keystone.**

**But three more geometry models render on top of / alongside the FILL in Measure mode, and they do NOT share the FILL's frozen-`iA` anchor:**

1. **The FILL (model A)** — `sectionPass`, anchored to the **frozen rounded `iA` polygon** (inward offsets). The coloured treelawn/sidewalk/LU areas.
2. **The handles (model B)** — `MeasureOverlay.selection`, positioned at `centreline + perp·(pavementHW+cw+depth)` off `chainMeasure(st)`, along a **straight** normal (`:323-356`).
3. **The selected-chain edge strokes (model B′)** — `liveSelectedRings = buildChainBandsLive(...)` (`:718-749`); at rest, silhouette-relative; **during a drag (`measureDragging`) it emits silhouette-INDEPENDENT rect bands offset from the centreline** (`:740-746`). Centreline-anchored, like the handles.

Models B/B′ agree with each other (both centreline) but **diverge from model A** (frozen `iA`). That divergence *is* the visual "handles aren't on the ribbon."

**Currency (Q5):** `frozenShape` refetches only when `bakeLastMs` bumps, i.e. on a **re-bake** (`:616-634`). A depth/material **override does not need a re-bake** — it flows through `blockCustoms` into `sectionGeos` and re-strokes live off the same frozen `iA`. Only the **silhouette** (`iA`, the asphalt/curb) is re-bake-gated, which is by design. **Not a currency bug.** The operator is *not* staring at a stale fill; they are staring at a fill drawn off a frozen curb while the handles are drawn off the centreline.

---

## (b) The handle loop, end-to-end — and the exact break

**Read (position).** `MeasureOverlay.selection` (`:294-383`):
1. anchor = click point projected onto the **centreline** (`frameAtPoint`, `:299`); `nx,nz` = straight centreline normal.
2. `chainM = chainMeasure(st)` — the **chain-level** measure (`measureModel.js:49`: `st.measure` → pipeline → type default). **NOT** the frozen per-run `baseMeasure`, **NOT** the frozen `iA`.
3. `resolveSide(custom, side)` = `resolvePedDepths(chainM, side, custom)` then merge → `{…chainM[side], …custom, treelawn:ped.tl, sidewalk:ped.sw}` (`:323-326`). **This is the one-depth-truth wire** — same `resolvePedDepths` (`tileGround.js:491`) the FILL uses.
4. handle radius `b.r` from `sideToStripes(measure[side])` = cumulative `pavementHW + cw + treelawn (+ sidewalk)` from the **centreline** (`streetProfiles.js:223-256`).
5. handle world pos = `cx + sign·nx·b.r` (`:350-351`).

**Write (drag).** `applyDrag` (`:403-462`) → `resolvePedDepths` seed (`:447`) → `writeBlockEdgeCustoms(entries)`, each entry keyed by `feCustomKey(fe) = [chainSkelId, side, min(segOrds)]` (`feCustomKey.js:38-46`).

**Re-read (FILL).** `sectionPass.runCustom(run) = blockCustoms[run.skelId][run.side][run.segOrd]` (`tileGround.js:587`); depth via `resolvePedDepths(run.baseMeasure, run.side, c)` (`:619-620`).

**THE EXACT BREAK — two distinct failures the canon fused into one:**

- **Break 2a — anchor mismatch (the unfixed one, "doesn't sit on the strip").** The handle is placed in **centreline space using `chainMeasure.pavementHW` and a straight normal**; the FILL strip edge is the **inward offset of the frozen rounded `iA` polygon**. `resolvePedDepths` makes them agree on the depth **scalar** (tl/sw) but the **base line they're measured from is different geometry**:
  - `chainMeasure.pavementHW` (chain default) ≠ the frozen per-run `measure.pavementHW` that actually positioned `iA` (the artifact carries e.g. `pavementHW 5.49` per run; the handle uses the chain default, which can differ).
  - Even when equal, a **straight** offset from the centreline ≠ the offset of a **rounded** `iA`; near every corner they part company (the `iA` pulls inward around `vertR`, the handle ruler does not).
  - The handle also gleans Y/N from `chainMeasure` while the FILL gleans from the frozen `baseMeasure` — **different measure objects** into the same `gleanTreelawn`, so at edges straddling the 0.6 m threshold they can disagree on whether a treelawn even exists.
  → **"One depth truth" is real but insufficient: it shares the scalar, not the anchor.** This is the root of "handles don't sit on the ribbon," and it is **not** addressed by the per-edge work.

- **Break 2b — the depth override read (the "doesn't move it" half, now wired).** Pre-`b5c7e98` the FILL drew standard depths and ignored `blockCustoms.treelawn/.sidewalk` — dragging genuinely moved nothing. **Current code reads it** (`:587`, `:619-620`) and `sectionGeos` re-renders on `blockCustoms`, so the divider/strip **should now move** on a depth drag. **Needs render verification** — the operator's report of "doesn't move" pre-dates this commit.

- **Break 2c — key alignment (edge-case, not the common-case culprit).** I verified `runSegOrd` (frozen FILL read, `tileGround.js:917-929`) and `assignSegOrdsToFes` (write key, `buildBlockGeometryV2.js:1188-1273`) **both count `resolveChainSegmentation` interior-IX nodes the same way**, so the override key **matches in the common case**. It can still diverge where (i) a frozen run **spans two natural segments** (`runSegOrd` "takes the lower one", comment `:913-916`) so its `segOrd` ≠ `min(fe.segOrds)`, or (ii) the bake-time IX set ≠ the session IX set. Those edges' overrides land in a slot the FILL never reads. **Secondary**, not the primary break.

---

## (c) Corner-construction characterization (what `sectionPass` actually builds)

The corner **fill** is built at `tileGround.js:742-785`:
```
cornerPad += intersectRings( shallow , [ circlePoly(c.p, c.trim + cw + c.T + 1) ] )
```
- `c.p` = the corner **vertex = a centreline node** (tile-ring vertex), which sits **outboard of `iA`** by ≈ asphalt-hw + cw.
- disk radius `c.trim + cw + c.T + 1`, where `c.trim = e.a + nearestVertR` (asphalt-hw + corner R) and `c.T` = **max-adjacent** ped total. For LS that's ≈ `5 + 4.5 + 0.15 + 3 + 1 ≈ 13.6 m`.
- `shallow` = the band region above depth `c.T` within `bandRem` (`bandRem` = `fullBand` minus the leg-claimed sectors; legs are trimmed back from the corner by `e.a + R`, `:699-701`).

**Geometric verdict:** the corner is a **disk cookie-cutter** intersected with the un-claimed band wedge — **not** the "tangent-to-tangent bent quad / slice of the offset band" the canon (§3 step 3, §3.3 step 4, §6) describes. `circlePoly` **is** a constructed primitive (a 64-gon circle); the canon's "never a constructed primitive" is contradicted by the code. The disk is grossly oversized relative to a city block (proxy below), so:
- its **bounding arc is a circle**, not the curb tangents → lumpy / round-cornered fills;
- on **short blocks adjacent corner disks overlap** (13.6 m radius vs sub-30 m block faces) and both reach the same wedge in `bandRem`; the `shallowByT` depth bound (`:749-760`) means the **deeper-T corner wins more area** → corners can cross-claim and draw at the wrong depth where two corners are close.

**Inherited disruption.** The pad is only as clean as the frozen `iA` it slices. Canon §7 itself concedes the "intersection-everywhere corner-silhouette residuals disrupt the FILL because the frozen `iA` is disrupted." Where `iA` is bad at a corner, **no `sectionPass` change fixes it** — it's a Survey/skeleton problem Section inherits.

**Capacity-guard collapse.** `ringAt(d)` clamps every offset to `Math.min(cw+d, cap)` (`:650-655`). Cap distribution across the 101 frozen tiles: **65 tiles cap ≈ 3.38 m (full ped band), but 31 tiles cap < 0.5 m and 5 more in 0.5–3 m → 36/101 tiles draw essentially NO ped band** (slivers, medians, loop interiors). At corners shared with those tiles the band vanishes — a real contributor to "corners look broken." (Expected behaviour per the guard, but worth naming as a symptom source.)

**Proxy** (`scratch/forensic-corner-proxy.svg` / `.png`, **PROXY — not a verdict**): tile 1, frozen `iA` in red, `vertR` disks dashed blue, the **approx corner-pad disks in orange**. The disks dwarf the block and overlap massively — illustrating the oversize / cross-claim risk. (Tile 1 is itself a sliver, cap 0.381, so its own FILL is clamped to nothing; the disk geometry generalises to full blocks.)

---

## (d) Canon-vs-reality divergences (code/render wins)

1. **§3.2 "🔜 Depth override … is not yet read" + §7 "the next build (dispatch-ready)".** **FALSE / stale.** Code reads the depth override now: `resolvePedDepths` (`tileGround.js:491`), `runCustom` (`:587`), `sectionPass` (`:619-620`). The doc lags commit `b5c7e98` ("land the per-edge FILL"). The per-edge build is **landed, not pending**.
2. **§3/§3.3/§6 "corner = bent quad slice, tangent-to-tangent, never a constructed primitive."** **Contradicted.** Code builds the corner as `intersectRings(shallow, [circlePoly disk])` (`:746-760`) — a disk primitive, circle-bounded, not tangent-bounded.
3. **§5 "one depth truth … point both at the one resolution and the handle sits on the strip and the drag moves it … one wire, not two bugs."** **Overstated — this is the most consequential divergence.** The shared `resolvePedDepths` unifies only the depth **scalar**. The handle is anchored to the **centreline + `chainMeasure` + straight normal** (`MeasureOverlay:323-356`); the FILL to the **frozen `iA` polygon**. Sharing the scalar does **not** put the handle on the strip. It is **two bugs** (anchor mismatch *and* the formerly-unread depth), not one wire.
4. **§3.1 (line 91) "today's code still collapses treelawn-N to all-SW".** **Stale.** Two-strips-always is implemented: N-ordering `defMat = {outer: stripMat.inner='SW', inner: stripMat.outer='LU'}` (`:623-625`).
5. **§0.2 / §4 "Grounded in code … verified against the live path 2026-06-07."** **Overstated** given the operator's eye says the render is broken. "Verified" reflects machine shape-proofs (byte-identity of SHAPE), not a visual pass — exactly the laundering the brief warned about.
6. **§5 "the handle … reads the SAME per-edge depth the FILL strokes."** Partially false: the handle feeds **`chainMeasure`** into `resolvePedDepths`; the FILL feeds the frozen **`baseMeasure`**. Same function, different inputs → divergent Y/N gleaning at threshold-straddling edges.

---

## (e) Ranked root causes

### Symptom 1 — corners draw wrong
1. **R1a (Section-internal, primary):** corner pad = oversized **disk cookie-cutter** at the centreline node (`tileGround.js:746-760`), not a tangent-to-tangent bent slice → circle-bounded, lumpy corners; on short blocks adjacent disks overlap and cross-claim the band wedge at the wrong (`max-T`) depth.
2. **R1b (upstream, inherited):** the frozen `iA` corner silhouette is itself disrupted by the intersection-everywhere residuals (canon §7) → FILL inherits a bad curb. **Fix is in Survey/skeleton, not Section.**
3. **R1c (contributing):** capacity-guard clamps **36/101 tiles** to a sub-band; the FILL disappears at corners shared with those tiles.

### Symptom 2 — handles not connected / responsive
1. **R2a (primary, unaddressed):** **anchor-frame mismatch** — handles + selected-chain edges live in centreline-ruler space (`MeasureOverlay` / `sideToStripes` / `buildChainBandsLive`), the FILL in frozen-`iA` space. "One depth truth" shares the scalar, not the anchor. → "doesn't sit on the strip."
2. **R2b (likely fixed in code, verify on render):** the depth override is now read (`b5c7e98`) and `sectionGeos` re-renders → the strip should move on a depth drag. The operator's "doesn't move" pre-dates this; **confirm live**.
3. **R2c (edge-case):** `segOrd` key divergence on runs spanning two natural segments / bake-vs-session IX drift → those edges' overrides land in an unread slot.

---

## (f) Recommended fix locus (where, not how)

- **Symptom 2 (highest leverage): re-anchor the handle/edge model to the frozen `iA`.** The handle position and the selected-chain edge strokes should be derived by **offsetting the same frozen `iA` polygon inward** (the model the FILL strokes), **not** from `chainMeasure` + a straight centreline normal. Collapse models B and B′ into model A. Loci: `MeasureOverlay.jsx:294-356` (handle placement) and `BlockGeometryV2Debug.jsx:718-749` / `buildChainBandsLive` (the live edge/drag preview). The slogan must become **"one *geometry* truth"** (shared anchor), not just one depth scalar. — This single change makes the handles sit on the ribbon and removes the three-model seam. **Then** verify R2b on the live render (drag a depth handle, confirm the divider moves); only if it doesn't, chase R2c key alignment.
- **Symptom 1: the corner-pad construction in `sectionPass` (`tileGround.js:742-785`).** The disk cookie-cutter is the Section-side locus — bound the pad by the **leg tangents** (the bent-slice the canon already specifies) rather than a vertex-centred circle, and stop adjacent disks cross-claiming. **First, though, render the frozen `iA` alone** (Survey output) at the complained-about corners: if `iA` is already disrupted (R1b), fix it upstream in Survey/skeleton — the FILL cannot recover a bad curb. Note R1c separately (the 36 clamped tiles are expected, not a corner bug to chase).

**Single highest-leverage next move:** re-anchor the handles to the frozen `iA` (R2a). It is certain, structural, pre-dates every recent commit, and directly answers the operator's "the handles aren't on the ribbon."

---

### Evidence index (file·line)
- Render gate: `BlockGeometryV2Debug.jsx:635,645,658,666`; frozen fetch/currency `:616-634`; live edges/drag `:718-749`.
- FILL build: `tileGround.js` `sectionPass:581`, `runCustom:587`, depth read `:619-620`, `resolvePedDepths:491`, `ringAt`/cap `:650-655`, corner pad `:746-760`, blunt/round cleanup `:766-785`, `runSegOrd:917-929`, frozen run serialize `:1900-1905`.
- Handle loop: `MeasureOverlay.jsx` selection `:294-383`, `resolveSide:323-326`, world pos `:350-351`, `applyDrag:403-462`, strip hit `:607-636`.
- Centreline radii: `streetProfiles.js:223-256`; `chainMeasure` `measureModel.js:49`.
- Key: `feCustomKey.js:38-46`; `assignSegOrdsToFes` `buildBlockGeometryV2.js:1188-1273`; `naturalSegments:927-948`.
- Artifact: `public/baked/lafayette-square/shape.json` — 101 tiles, `runs[]` full identity; cap: 65 full / 36 clamped; `iA` = ring-array (`iA[0]` the polygon).
