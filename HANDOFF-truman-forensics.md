# HANDOFF — Truman forensic census (the divided-parkway knot)

**State:** dispatch-ready. **Agent: FRESH** (read-only forensic specialist — the Vesalius/Stratum/Plumb playbook). **Domain:** cross-cutting — frame/skeleton · derive/median-emission · tileGround/faces · Survey authoring.
**Drafted:** 2026-06-03 (Boz). **Mode:** READ-ONLY. Only write = the output doc.

---

## Why Truman, why a census

Truman Parkway has "always been messed up" (Jacob) — which is exactly why it's the right forensic subject: it's the **worst-case exemplar** that touches every divided-road concern at once (carriageway pairing, median construction, sub-chain fragmentation, a dead-end, and the inner-edge authoring path). Boz has been combing it symptom-by-symptom across a day and mislabeling features; this stops that. **Map the whole knot once → each defect to its root → owner → fix sketch → flag what's SYSTEMIC vs Truman-specific.** Output is the fix docket, not a fix.

**Deliverable: `cartograph/TRUMAN-FORENSICS.md`** + a final-message exec summary (defect count, root/owner map, ordered fix list, which defects recur mapwide).

## The operator's goal (the gate the fix list serves)

Jacob needs Truman's median to be **a clean, continuous, straight strip** so he can **grab its sides and widen it in one piece** — and to set how the cross-section originates (one-way / split / center vs median-edge). Per doctrine that's the **`anchor` = `inner-edge`** authoring mode (widen the median by pulling each carriageway's *inboard pavement* in; pair-aware). Today he can't, because the median geometry is fragmented/malformed. The census explains *why* and what it takes to make that authoring work.

## Read first (doctrine — trod ground, do NOT re-derive)

1. **`FEATURES.md §367-385`** — the divided-road inner-edge model: two centerlines kept (no collapse to a spine); **median EMERGES** as the gap between carriageways minus each one's inboard pavement; `anchor:'inner-edge'` is an *authoring mode* (seeds inboard `pavementHW=0`, zeroes inboard ped, pair-aware via `setAnchor`/`pairId`); widen the median by narrowing inboard pavement.
2. **`RIBBONS.md §3.1`** — `anchor`/`innerSign`/`pairId` data shape + the `innerEdgeMeasure` transform.
3. **`skeleton.js:150-300`** — carriageway pairing (the 3-gate + station-overlap heuristic) + `weldChains` (gated on `(signature, pairKey)`) + `splitAtFolds`. This is where carriageways fragment.
4. **`derive.js` ~2918-3030** — divided-pair matching (`byPairKey`) + **median emission** (`ring = A.points + B.points.reversed`, larger-area orientation) + `innerSideSign`.
5. **`HANDOFF-divided-pair-station-overlap.md`** (Groma `8ffd795`, landed) + **memory `feedback_perp_side_convention`** — `innerSign` is **per-chain-relative and CORRECT; do NOT re-chase it.** The station-overlap gate already dropped the bad #5/#6 pair.
6. **`SurveyorPanel.jsx:296-313`** + `setAnchor` in the store — the actual `oneway` + `Anchor` controls.

## Seed findings (LEADS to verify — Boz's quick checks have MISFIRED; trust nothing here without re-deriving)

- **Carriageways are fragmented.** Truman = 8 chains: two strands (A: `#0,#6,#3`; B: `#2,#5,#4`) split into staggered sub-chains, plus spines `#1,#7`. Three OSM way-pairs → 3 `pairKey`s → `weldChains` (pairKey-gated) does NOT fuse them into one continuous carriageway. After Groma's fix, 2 median pairs (`#0/#4`, `#2/#3`) + a pinch gap where `#5/#6` was dropped.
- **Median rings are malformed.** `A.points + B.points.reversed` produces lopsided slivers, not clean parallel strips: median 1 (`#2/#3`) jumps **~280m between consecutive ring vertices** (`[690,-377]→[616,-100]`); A and B sides have mismatched node counts/lengths. (Boz's "clean strip" turn-metric wrongly passed it — re-measure honestly.)
- **The "big triangle" near Truman is a DEAD-END** (Jacob), NOT a median — covered by `HANDOFF-dead-end-spike-prune`. Confirm it's a separate class and out of this census's median scope.
- **Authoring blocked:** the operator can't widen the median "in one piece" because it's fragmented + malformed → the `inner-edge` anchor + inboard-drag has no clean continuous median to act on.

## Census tasks

1. **Topology** — every Truman chain: role (carriageway-A/B / spine / stub), `pairKey`, `anchor`, `innerSign`, `pairId`, continuity. **Why are the carriageways fragmented** — `weldChains` pairKey-gating? `splitAtFolds`? multiple OSM ways? Could/should they weld into one continuous chain per strand (and does doctrine allow it — "no collapse to a spine" keeps TWO centerlines, but each *should* be continuous)?
2. **Median construction** — per pair, characterize the `A+B.reversed` ring: malformed? why (mismatched A/B geometry, staggered stations, the orientation pick)? Is Truman's median one piece or fragmented-with-gaps? What would make it ONE clean continuous strip?
3. **Dead-end** — confirm the big triangle is the pendant-spur class (defer to `HANDOFF-dead-end-spike-prune`); note any interaction with the median.
4. **Authoring path** — trace `SurveyorPanel` `Anchor` → `setAnchor` → `pairId` mirror → `innerEdgeMeasure` → render. Can the operator TODAY achieve "straight median, grab sides, widen in one piece"? Exactly what blocks it (fragmentation / malformed rings / handle availability / the inboard-drag handles)?
5. **Defect map** — each Truman defect → **root** → **owner** (frame/skeleton | derive/median-emission | tileGround/faces | authoring) → fix sketch. **Flag SYSTEMIC (recurs on other divided roads — Officer David Haynes, Park, S Jefferson, Lafayette…) vs Truman-specific.**

## The one seam (scope guard)

The divided-pair pipeline is still settling (the station-overlap gate just landed). Don't over-specify any frozen schema; mark schema-dependent findings `TBD-with-Survey` and move on.

## Write / commit boundaries

- **READ-ONLY.** No code/canon edits. Single write: `cartograph/TRUMAN-FORENSICS.md`. Name yourself (one word). `git add` only your file (parallel in-flight edits in the tree). `Co-Authored-By` trailer.
- Final message = exec summary: defect count, root/owner map, ordered fix list, systemic-vs-specific split.

## On landing (Boz)

- The fix list becomes the Truman docket; dispatch fixes by owner (likely: frame-welding for continuity, derive median-emission for clean rings — coordinate with the divided-pair arc / Groma).
- Fold confirmed doctrine into `RIBBONS §3.1` / `FEATURES §367`; retire this HANDOFF to NOTES.
