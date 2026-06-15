# HALF B — Survey-based median (Cambour II, 2026-06-15) — SUPERSEDES the centerline-gap median

Implementation-ready. Supersedes the HALF-B spec's §2/§4 (centerline-to-centerline ring + inboard=0/full-gap reservation — REVERTED `21a1d2d`). The geometric inboard oracle (`tileGround.js inboardSideOf`) STAYS.

## The model (Jacob): median = what's left after the carriageway LANES
The bug: the median ring is built **centerline-to-centerline** (`derive.js:3312` `stamp`, `ring=[...ta,...tb.reverse()]`) = median + turn lanes + a middle lane = far too big (and a PHANTOM median where the lanes fill the gap, e.g. Lafayette).

## THE FORMULA (derived + numerically validated on all 5 roads)
> **`median = chainGap − pHW`** (floored at 0), where pHW = survey `pavementHalfWidth` (half the whole-road pavement, road-midline-relative); `chainGap` = the two carriageway centerlines' separation (`phase.chainGap`).

Geometry: each carriageway carries pavement of width `pHW` (half the total `2·pHW`), centered on its chain → extends `pHW/2` inboard; the two inner edges sit `chainGap − 2·(pHW/2) = chainGap − pHW` apart.

| Road | pHW | chainGap(s) | median = gap−pHW | verdict |
|---|---|---|---|---|
| **Lafayette** | 9.35 | 11.53/7.92/5.14 | 2.18 / −1.43 / −4.21 | ~0 → **NO median** ✓ (Jacob's eye) |
| **S Jefferson** | 9.16 | 14.03/12.61/10.4 | 4.87 / 3.45 / 1.24 | **real strip** ✓ (the image) |
| Park | 4.45 | 8.44 | 3.99 | small median ✓ |
| Chouteau | 10.02 | 6.05 | −3.97 → 0 | no median; jaggedness → HALF A ✓ |
| Geyer | 6.40 | 6.7 | 0.30 → ~0 | no median ✓ |

`gap − 2·pHW` REJECTED (negative everywhere → kills S-Jefferson's real median). ROW reconciliation (`2·pHW + median < rowWidth`) holds on every road.

## The fix (rebuild-gated, all in `derive.js`)
- **(3a) `innerEdgeAssign` (`:3427`):** each carriageway `inboard.pavementHW = outboard.pavementHW = pHW_survey/2` (was inboard 0 / outboard full). Inboard `treelawn=sidewalk=0, terminal:'none'`. Side via the **shared geometric oracle** (mirror `tileGround.js:666 inboardSideOf`, NOT `innerSign`). Authored overrides win.
- **(3b) `stamp` median ring (`:3312`):** build inner-edge-to-inner-edge — offset each chain inboard by `pHW/2`, `ring=[...ta_off,...tb_off.reverse()]`. Width = `chainGap − pHW` by construction (per-station). FLOOR: if it collapses / `area < 25 m²` → emit NO median (the carriageways' own asphalt fills it → `medClip=[]` → `isMedianTile=false` → normal road). Keep nose-trim/crossing-cut/merge logic.
- **(3c) survey lookup:** `pHW_survey = correctedSurvey[A.name].pavementHalfWidth` (operator name; the 5 surface roads resolve; both carriageways of a pair share the corridor pHW). 
- **Floor (no-median):** `median ≤ MIN_MEDIAN(1m)` → no ring → carriageways abut as a normal multi-lane road (two-carriageway frame preserved, NO merge).

## Fallback (LOCKED custom>OSM>AASHTO): authored → survey pHW → OSM lanes×3.0 (coarse, OSM lanes unreliable) → per-class default.

## Acceptance
1. Detector `divided-median` → 0 (reads source measures; after rebuild). Route the detector's `toMate` through the shared oracle.
2. Verge cover SANE (not 100%): no-median roads ~0% is CORRECT; S-Jefferson/Park a clean strip.
3. **Jacob's eye:** Lafayette = normal multi-lane road (no median); South Jefferson = real median strip. Re-render `scratch/verge-sites.mjs`.

## Rebuild-gated: re-run `derive.js` → `ribbons.json` → re-freeze `shape.json`. No frame-only half (the reverted clamp/reservation was the phantom-painter). Land 3a+3b together (coupled).

## ⚠️ One open verification (Boz/Jacob): the "Officer David Haynes Memorial Highway" (I-44 motorway) pair — `seed`-sourced pHW≈8.53 may be PER-CARRIAGEWAY not whole-road, so `median=chainGap−pHW` may need `−2·pHW` there. Grade-separated, genuine wide median (gap 20–36 m), outside the 5-case acceptance; the floor won't misfire but the exact width wants an eye check.

## Locks honored: two-carriageway no-merge · concentric FILL · custom>OSM>AASHTO · fix-at-source.
