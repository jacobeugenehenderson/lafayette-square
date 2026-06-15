# HALF B — Constructed generic median: implementation spec (Cambour, 2026-06-15)

Implementation-ready spec for `HANDOFF-construct-hard-polygons.md` HALF B. Read-only design, verified against live code + a Verge re-run. Boz implements.

## ⭐ NEW LOAD-BEARING FINDING — the inner-edge zeroing zeros the WRONG side
`innerEdgeAssign` (`derive.js:3427-3435`) keys the inboard side off `innerSign===-1 ? 'left'`, but the **geometric median-facing side disagrees for every flagged pair**:
- **Lafayette:** both carriageways carry `left=10.56, right=7.9` — neither side zeroed; the whole-road half-width (~10.56 m) is **broadcast to both carriageways** (`correctedSurvey[name].pavementHalfWidth`, `derive.js:1558`-style), inboard never zeroed.
- **Geyer / Chouteau / S.Jefferson:** zeroing fired on `left` (innerSign=−1), but the physical median-facing side is geometrically **`right`**, which still carries the full half-width.
So the existing zeroing **zeros the outboard side, leaving the inboard at full width** → the overrun. **Root: `innerSign`'s side-key disagrees with the geometric `toMate` test** (`correctness-detector.mjs:203-205`). The convention has "bitten twice" (`derive.js:2987`).
**THE #1 MOVE:** lift the geometric `toMate` inboard-side test into ONE shared helper; route `effectiveMeasure`, `innerEdgeAssign`, and the detector through it — a single inboard-side oracle. Everything else composes once the side is resolved consistently.

## The three composed fixes
### (1) Render-time inboard clamp — the safety net (`tileGround.js:654-661`, `effectiveMeasure`)
Clamp each carriageway's inboard `pavementHW` to `(chainGap − MIN_MEDIAN)/2` (`MIN_MEDIAN=1.0`). **Self-contained** — needs only `chainGap` (`s.phase.chainGap`), not the mate. Worst case median = `MIN_MEDIAN`, wider otherwise. Resolve the inboard side **geometrically** (shared oracle), NOT `s.innerSign`. Keep permanently as the invariant guard. Frame-only, no rebuild.

### (2) Source width datum — the REAL fix (`derive.js:3427`, `innerEdgeAssign`), rebuild-gated
Split-the-survey-width: `inboard_hw = 0` (chain sits at the median edge, anchor=inner-edge), `outboard_hw = (surveyed_full_width − chainGap)/2`. Median = `chainGap` exactly (the frozen ring), un-eaten. Datum order (LOCKED custom>OSM>AASHTO): surveyed full width → `lanes×laneWidth` → per-class default. Guard: when `chainGap ≥ full`, fall to `lanes×laneWidth` (≥ ~3 m one lane), treat `chainGap` as the median. Preserve authored "eat into median" overrides but still clamp at render. Resolve inboard side via the shared oracle (geometry wins over `innerSign`; log divergence).

### (3) Positive median paint — un-eatable (`tileGround.js:~2326`, shape loop)
Reserve the median OUT of asphalt: after `medClip`/`isMedianTile` computed, before `legacyBlock`: `if (isMedianTile && medClip.length) aFill = differenceRings(aFill, medClip)`. Then `legacyBlock` includes the median region, `iA` non-empty, and `sectionPass`'s `intersectRings(luRemainder, st.med)` (`:1158`) recovers it positively — CANNOT be empty. Keeps the normal block→luRemainder→`pushLu('median')` flow + the curb wrap (`iA−iC`). Replaces the failing subtractive paint. **Must run LAST in `aFill` assembly** (after `jClip`/`tClip`/`mergeClip`), and **exclude `absorbedBy` median fragments** (the `excludeAbsorbed`/`consumeJM` flag) so HALF-A junction aprons that legitimately absorb a median stub still win. Frame-only, no rebuild.

## Median-width rule (§4)
Primary: `medianWidth = chainGap` where `MIN_MEDIAN ≤ chainGap ≤ MAX_CHAINGAP` (1–60 m) — the frozen ring already IS the gap (edges = the centerlines). Degenerate fallback: per-class default (arterial 3.0 / collector 2.0 / tertiary 1.5 / fallback 1.0 m) centered on the pair midline (`derive.js:3312` stamp branch). The 4 current sites all have sane gaps (5.1–14.0 m) → default is the forward guard, not needed now.

## HALF A handshake (§5)
**A absorbs at the node; B reserves on the legs.** The median terminates at the nose (already, `derive.js:3228-3243`); the merge/apron (HALF A) owns the node neighborhood. B's reservation excludes `absorbedBy` medians (the S-18th 69 m² absorb case) and runs after the junction clips. No double-reservation.

## Rebuild-gating + acceptance (§6)
- **Land (1)+(3) first** (frame-only, no rebuild) → the lit app + Verge cover ratio (57% → target ≥95%) verify immediately.
- **Then (2)+(4)** → re-run `derive.js` → regenerate `ribbons.json` → re-freeze `shape.json`. The detector `divided-median` gate (reads the source measures) → **0** only after this.
- **Gate:** detector `divided-median`=0 + Verge cover ≥95% + **Jacob's eye** on Lafayette / Park / South Jefferson (continuous green median, no needle, no flood).
- **Residual → HALF A:** Chouteau's gap is sane (6.05 m) but its jaggedness is junction-flood (82° bump, slivers, selfint) = HALF A's intersection construction. B drives Chouteau's `divided-median` flag to 0; leaves its `JUNC`/`bump`/`selfint` for A.

## Locks honored
Two-carriageway (no merge) · concentric FILL (median paints through `pushLu('median')`) · custom>OSM>AASHTO · fix-at-source (the source datum (2) is the real fix; the clamp (1) is the invariant guard).
