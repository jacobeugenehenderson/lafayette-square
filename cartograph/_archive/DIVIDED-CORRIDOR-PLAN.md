# Divided-corridor model — forensic scope + spike, grounded in the operator's traces

**Deliverable of `HANDOFF-divided-corridor-model-scope.md` (Alidade, 2026-06-05).** Resolves the chain-position contradiction (D9) with numbers, locates the fold-at-join, designs the constructed median + clean transitions, and lays the rip-out ledger. **Scope + spike only — no production change landed.** Spike: `scratch/alidade-spike.mjs`, proof render `scratch/alidade-spike-proof.svg`. Forensics: `scratch/alidade-{chain-position,corridor-map,fold-forensic,fold-blocks,transect,corner-5,join-census}.mjs`.

> **Verdict up front.** The brief's core hypothesis **holds with one correction**: the inner-edge *workflow* (knob + emit machinery) is obsolete scaffolding — but the inner-edge *data model* is not scaffolding at all, it is the **correct reading of where the chains physically sit**. (1) **D9 resolved: carriageway chains sit at the carriageway's INNER (median-facing) edge — `FEATURES §371` ("chain stays at carriageway center") is the corpse-lie.** D1's normalization was geometrically right. (2) The brief's suspicion that *"D1's inboard-zero offset the asphalt on center-chains"* is **refuted** — the "emits from the left of the lane" symptom is real but pre-dates D1 and has a different root (§3). (3) The fold-at-join and the false corner are **one defect in two contexts**: a carriageway's taper run serving as a face boundary. One cure covers all **47 transition ends at 24 nodes**.

---

## 0. D9 resolved — chain position, measured from the operator's traces

Method: every in-scope stroke projected perpendicularly onto candidate chains (`alidade-chain-position.mjs`); side reported in the measure convention (measure-RIGHT = `(-dz,dx)` of point-order-forward). Body values exclude the taper-inflated end bins (`alidade-corridor-map.mjs` station profiles).

| trace | chain (role) | ⊥d to true curb, body | chainGap | authored width | center-chain reading |
|---|---|---|---|---|---|
| #0 | `lafayette-avenue-6` (cw-B, park side) | **8.2–8.7 m** (med 8.65, IQR 8.24–9.40) | 7.92 | outer 6.70 | w=17.3 ⇒ median = 7.92−17.3 **< 0, impossible** |
| #6 | `lafayette-avenue-7` (cw-A) | **5.5–6.6 m** | 5.14 | outer 7.90 | w=13.1 ⇒ median **< 0, impossible** |
| #6 | `lafayette-avenue-3` (spine) | 9.8 ± 0.5 | — | L 10.59 | ✓ spine ≈ center-anchored, datum ≈ right |
| #1 | `lafayette-avenue-1` (spine) | **15.6** (15.4→17.3 westward) | — | L 10.56 | spine width datum ~5 m short (§3) |
| #5 leg | `south-18th-street-3` (spine) | ~5.3 | — | 2.00 (!) | datum: a 4 m-wide street |
| #5 leg | `park-avenue-1` (spine) | ~12.6 | — | R 10.31 | datum ~2.3 m short |

**Conclusions:**
- **Carriageway chains sit at (within ~1 m of) the carriageway's inner edge.** The body lies essentially entirely *outboard* of its chain; a center-chain reading produces negative medians on every measured pair. Cross-check: d(#0→cw-A across the median) = 17.2 ≈ 8.65 + 7.92 ✓ (the stack is collinear). OSM corroborates: `lanes=3`, seeded hw 7.01 — a ~8.4 m carriageway is plausible; a 17.3 m one is not.
- **It generalizes map-wide:** every LS pair's `chainGap` (3.21–11.53 m) is smaller than any plausible carriageway width doubled — center-chains would make the carriageways *overlap*. And `chainGap ≈ the median width` (the D1 rename is exact).
- **∴ the inner-edge measure model (outer = full carriageway width, inboard = 0) is the geometrically correct emit for these chains.** D1 stands. What FEATURES §371 documents ("chain stays at carriageway center, skeleton's OSM way center") describes neither the data nor — post-D1 — the behavior. → Boz: D9 ledger row closes as **inner edge**; `FEATURES §367–387` re-voice; same corpse-lie lives in code comments at `streetProfiles.js:392` and `derive.js:3061` ("render the visible centerline at the inner edge" — nothing does, see §7).
- **The remaining curb error at corners/curbs is the *width datum*, not the model:** trace says the park carriageway is ~8.4 m; authored 6.70. Where authoring is right (spine `-3`), the trace confirms it to <1 m.

## 1. The fold-at-join — located, and it is the false corner's twin

At a transition node the two carriageway chains taper into the shared spine endpoint. `extractFaces` makes those taper runs face boundaries; the median face ends in a **needle** (158–180° turns at the node), and the asphalt union folds back on itself: **exact ±180° fold-back spikes** in the visible asphalt boundary at the merge (`alidade-fold-blocks.mjs`; e.g. JOIN-E `(463.7,267.2)→(470.5,269.0)→(463.5,267.1)`). Where the carriageway's outer width ≠ the spine's same-side width (Lafayette: 6.70 vs 10.56), the curb additionally **steps ~3.9 m at the node** instead of transitioning.

**Census (`alidade-join-census.mjs`): 47 transition ends, 24 distinct nodes** (= Mercator's enumeration). **14 nodes currently carry fold spikes** within 20 m. Worst class: the **divided×divided** node `(-355,-253.9)` — Park Ave *and* South Jefferson both transition at one node — 5 folds. Tapers run ~8–100 m (the >150 m rows are heuristic noise on curved corridors — bound the isolator, see spike).

**This is the same defect as the false corner** (`SKELETON §5e`): a stub/taper run made a block-side boundary. With a cross-street through the node it fabricates a **false corner**; without one it fabricates the **fold + step**. A *join is a corner-less transition* — D3's taper-swap rule, applied at all 47 ends, cures both.

## 2. The corners — post-D1 status (verify-only now)

- **Mississippi×Lafayette:** production block ring lands **1.82 m** from the brief's true corner `(174.1,207.9)` — vs 40.7 m pre-D1. Jacob's live eye (2026-06-05): *"the park corners currently look good."* The corner class is **data-limited now, not construction-limited**.
- **Park×S-18th (#5):** production **6.60 m** off the trace-implied corner `(419.0,−78.1)` — and the residual is datums again: `s-18th-3` authored `pavementHW=2.0` (trace ⇒ ~5.3), `park-avenue-1` R 10.31 (trace ⇒ ~12.6). The spike's corridor-leg construction lands **1.55 m** off with *current* datums (§5).
- D3 (corner identity at prebake) remains right — its job is now the **last ~2 m + regression-proofing** (freeze the identity so the corner can't be re-born), not a 40 m wedge.

## 3. New findings (flag, mostly out of corridor scope)

1. **The north-void — "asphalt emits from the left of the lane, not center," found and refuted as a D1 effect.** Spine `-1` and cw-A `-5` emit asphalt **only southward** (transects: `[-10.5..0]`, nothing north). Cause: the face north of the Lafayette corridor is the **unbounded outer face** (the I-44 corridor; motorway+links are `gradeSeparated` ⇒ excluded from the face graph ⇒ no closed face ⇒ no tile ⇒ no per-tile emit). **Pre-dates D1** (verified on `scratch/gunter-ribbons-HEAD.json`). Structural: *any street edging the unbounded face emits nothing outboard.* **Own brief** — not divided-specific (candidate cures: a one-sided strip stroke for outer-face runs, or admit grade-sep corridors as face *boundaries* without junctions).
2. **Spine width holes (datum class, D1's sibling):** `lafayette-avenue-1` south needs ~15.6 (authored 10.56, the broadcast value); `s-18th-3` needs ~5.3 (authored 2.0); `park-avenue-1` north needs ~12.6 (authored 10.31). The traces are precise enough to repair against (leg-fit rms 0.24–0.33 m).
3. **MeasureOverlay corpses:** `innerEdgeOffsetPolyline` (`streetProfiles.js:385`) is **exported + imported and never called**; the comment at `MeasureOverlay.jsx:265` describes the offset render that doesn't happen; `chainPavementHW` (`:20`) exists only to feed it; a hardcoded `dividedNames` diagnostic list sits at `:270`. All center-chain-era scaffolding (§7 ledger).

## 4. The model — what a clean-skeleton divided corridor needs

**Keep the two-carriageway DATA model (locked) + the frame detection (`pairId`/`innerSign`/`phase`/`spineAt*`/`chainGap`). Drop the inner-edge *workflow*. Construct the corridor's polygon facts ONCE at prebake:**

1. **Chains are the median's edges** (D9). The corridor's cross-section hangs *outboard* off each chain: asphalt `[chain, chain ⊕ w_outer]`. D1's `innerEdgeAssign` survives as the prebake width-side normalizer — it is the data rule, no longer an "authoring mode."
2. **The median is a CONSTRUCTED polygon, not a residual face.** Per pair: the region between the two raw chains over the pair's window, **nose-trimmed** where the gap pinches below ~2 m, blunt nose. It carries identity (`{kind:'median', corridorName, pairKey}`) so material/LU tag directly (kills the Truman D8 mis-tagging and the G3a `medLen/totLen>0.4` heuristic), survives one-sided cross-street T's (the Truman addendum fragmentation), and becomes a grabbable object for polygon-first authoring later. Handles **open and close** symmetrically — a transition is just a nose.
3. **The taper run belongs to the merge interior — never to a block boundary.** At every transition end (47, known from `spineAt*`): drop the taper, swap the block-side boundary to the **straight-body leg** extended to the node's station. With a cross-street ⇒ the **corner identity** (D3 verbatim). Without ⇒ the **continuous outer curb** through the join, width transitioning over the merge window — no fold, no step.
4. **The merge region (node → median nose) is corridor asphalt** — lanes joining, constructed positively. The needle never enters the face graph.
5. **Freeze it** (the prebake polygon-ization, D2/D3 of `PREBAKE-POLYGONIZATION-PLAN`): the corridor facts above are topology/identity decisions made once; Survey reshapes (authored widths/radii) against them.

*Why not "much less than two chains"? — the single-spine unlock stays in reserve, untouched: the two chains are load-bearing as the median's two edges, and every construction above consumes them as-is.*

## 5. The spike (validated; final verdict = Jacob's eye on the live tool)

`scratch/alidade-spike.mjs` builds the Lafayette corridor's **south curb as one continuous polyline** (6 chains: `-2 → -1 → -6 → -3 → -7 → -0`, straight bodies, taper-swapped, joins intersected), the **three median polygons** (raw-chain lens, 2 m blunt noses), and the **Park×S-18th corner** from the two corridor legs:

| construction | vs trace #0 | vs #1 | vs #6 | folds |
|---|---|---|---|---|
| production asphalt boundary | — | — | — | ±180° spikes at 14 nodes |
| spike curb, **current** width datums | med 1.85 m | med 5.01 m | med 1.05 m | **none** (max turn 103°) |
| spike curb, **trace-implied** datums (8.4/15.6/9.8/6.0) | **med 0.40 m** | **med 0.36 m** | **med 0.56 m** | **none** (max turn 94°) |

- 666 trace points, sub-meter median residual end-to-end **through two joins and the Mississippi corner** — the structure is right; the residual is the width datum.
- Medians: park pair nose gaps 4.0/3.0 m, 95% body span; no needles.
- Park×S-18th corner: spike legs land **1.55 m** off the trace corner with current datums (production: 6.60 m).
- ⚠️ Numbers + SVG are proxy evidence (`[[feedback_proxy_render_is_not_the_operator_eye]]`); the side selections are grounded in the projection forensics (e.g. #5 sits on `s-18th-3` measure-RIGHT), not the eye — the axis trap bit once during the corner work and was caught by the data.

## 6. Decomposition → build-briefs (Boz dispatches; meshes with the PREBAKE plan's D-series)

| # | Brief | Depends | Risk | Eyeball gate |
|---|---|---|---|---|
| **E1** | **Width-datum hygiene, round 2 (spines + cross-streets).** Trace-driven repair where traces exist: `lafayette-avenue-1` L→~15.6, `s-18th-3`→~5.3/side, `park-avenue-1` R→~12.6, park pair outer 6.70/6.86→~8.4. Same class as D1 (frame-side, no controls) — or simply the operator dragging the curb in Survey; **Jacob's call which.** | — | L | Jacob live: Lafayette west of the park reaches the real curb; S-18th reads as a real street. |
| **E2** | **Constructed median at prebake** (§4.2). Stamp `medians[]`-successor polygons with identity into the artifact; retire the emergent-face reliance + G3a heuristic + LU mis-tag. (Replaces the vestigial `ribbons.medians` — C8 — with the real thing.) | D2 (face freeze) for the artifact home; logic is independent | M | Truman + Lafayette + Park Ave medians read as one object each, bare ground, correct noses; A/B everywhere else byte-identical. |
| **E3** | **Transition resolution at ALL 47 ends** (§4.3–4.4) — extends D3 from "corners" to "corners + joins": taper-swap, corner identities, continuous outer curb, merge asphalt. | D2 + E2 (+ E1 for the eye to read it as fixed) | M-H | Jacob live: the join at Lafayette×(park east end) merges clean — no fold, no step; sweep the 24 census nodes; the divided×divided Park×Jefferson node especially. |
| **E4** | **The rip-out** (§7) on cutover, after E2+E3 blessed. | E2+E3 | L | No behavior change (everything ripped is dead by then); Survey panel loses the Anchor row. |
| **F (flag)** | **The unbounded-face void** (§3.1) — own brief, not divided-specific. | — | M | North half of Lafayette `-1`/`-5` renders asphalt. |

## 7. ⭐ THE RIP-OUT LEDGER — excise on E4 cutover (keep = detection + data rule)

**KEEP (the new construction consumes these):** `phase` (`kind`/`role`/`pairKey`/`chainGap`/`spineAtStart`/`spineAtEnd`), `pairId`, `innerSign`, `derive.js innerEdgeAssign` (:3050 — survives as the prebake width-side normalizer; absorb into the corridor constructor), the authored-inboard>0 "eat into the median" datum (re-expressed as authoring the median polygon's edge once polygon-first).

| class | item | locus | why dead |
|---|---|---|---|
| KNOB | **Anchor dropdown** (Center / Inner-edge) + its comment block | `SurveyorPanel.jsx:281–296` | divided-ness is a frame fact; operator override re-couples chains. **overlay.json carries zero authored `anchor` entries** — nothing to migrate. |
| WIRING | **`setAnchor`** + pair-mirror + flip/un-flip transform | `stores/useCartographStore.js:1826–1903` | the knob's engine |
| WIRING | **`innerEdgeMeasure`** + its center-chain doctrine comment | `streetProfiles.js:392–416`; callers `MeasureOverlay.jsx:326,423,644`, `SurveyorOverlay.jsx:224` | superseded by `innerEdgeAssign` at prebake (D1 landed); the comment asserts the refuted center-chain model |
| WIRING | **`innerEdgeOffsetPolyline`** + `chainPavementHW` + the offset-render comment + `dividedNames` diagnostic | `streetProfiles.js:378–390`; `MeasureOverlay.jsx:5,20–26,263–288` | **already dead** — exported, imported, never called; comment describes behavior that doesn't exist. Can rip early (doesn't wait for E4). |
| WIRING | **`effectiveMeasure` inner-edge branch + `isMedianFacing` + G3a median-tile detect** | `tileGround.js:366–389, 881–894` | the emergent-median emit; dies when the median is a frozen identity-carrying polygon (E2/E3) |
| WIRING | inner-edge transform in the dead figure-ground path | `buildBlockGeometryV2.js:2557–2593` | rides out with C3/C4 (T4 deletion) — don't double-count |
| DATA | **vestigial `ribbons.medians[]`** (`A+B.reversed` rings) | `derive.js` serializer | C8 — zero consumers; E2 replaces with the constructed median |
| DOCS | `FEATURES §367–387` (inner-edge as *authoring mode*; "chain stays at carriageway center" §371) | FEATURES.md | re-voice: inner-edge is the frame's data model; chain = median edge; no knob. **Boz conforms** |
| DOCS | `SKELETON §4` "Anchor: Center vs Inner-edge" paragraph | SKELETON.md | same |
| DOCS | `derive.js:3060–3062` comment ("Runtime uses these to render the visible centerline at the inner edge…"); `RIBBONS §3.1` divided framing | derive.js / RIBBONS.md | corpse-comments of the center-chain era → DOC-CODE-COHERENCE rows |

**Cutover discipline (`[[feedback_remove_functionality_excise_knobs_wiring_docs]]`):** E2+E3 land + Jacob blesses → *then* E4 rips knob+wiring+docs in one pass. Exception: the never-called `innerEdgeOffsetPolyline` cluster is rippable any time.

## 8. Where this pushes back on the brief

1. **"D1's inboard-zero offset the asphalt on center-chains" — no.** The chains are inner-edge; D1's emit is correct. The visible "off the lane" symptom = the unbounded-face void (§3.1, pre-D1) + spine width holes (§3.2).
2. **"The inner-edge workflow was pre-clean-skeleton scaffolding" — half.** The *workflow* (knob, mirror, runtime zeroing, emergent-median emit) — yes, rip it (§7). The *data model* — no: it's the measured truth of the chains, and it stays as the prebake normalization rule.
3. **The corner facet arrived mostly cured:** D1 took Mississippi×Lafayette from 40.7 m to 1.82 m and Jacob blessed it live mid-scope. The remaining corner work is datum (E1) + freeze (D3/E3) — don't re-litigate the corner construction.

---
*Alidade, 2026-06-05. Read-only forensics + scratch spike; no production geometry touched. Operator data read from the main tree (gitignored); worktree `ribbons.json` = trunk post-D1.*
