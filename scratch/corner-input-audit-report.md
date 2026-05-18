# Stage 10 — Corner-input-preparation audit (LS)

Diagnostic only. No production changes. Run `node scratch/corner-input-audit.js` to regenerate.

## TL;DR

**Dominant failure mode: `wrong_flanking` — one-sided flanking-meta resolution.** 170 corners (25.5%) get a non-null flanking meta on only one side (prev or next), and the emitter's `?? Ameta?.tl / ?? Bmeta?.sw` fallback produces SYMMETRIC depths from ONE-SIDED authoring. 163 of those 170 actually emit an arc-span entry in `v2.frontageBands`. **This is the visible-defect bucket** — pads that emit but with wrong size/shape because the flanking depth half they were sourced from doesn't match the half they didn't have.

**The §6.9 hypothesized taxonomy is incomplete in two ways:**

1. **`cusp_ramp_collision` (the hypothesized third bucket) does NOT fire — 0 of 666 corners.** `RAMP_MIN_M = 1.5` is never the limiting factor on LS: even the most cusp-scaled corner has `max(d_A_post, d_B_post) > 1.5` because `cw=0.45` already gives the floor a 1.05m headroom and at least one flank always provides ≥1.05m of `tl+sw`. Stage 11's fix design should NOT plan around RAMP_MIN/cusp collision — it doesn't exist on LS as authored today.

2. **`no_match` splits cleanly into two sub-modes** (the §6.9 hypothesis collapsed them):
   - **177 truly unmatched** (vertex distance ≥ TOL=0.5m). Distance distribution: p50=10.8m, p90=167m, max=299m. These are NOT "near-TOL" cases that tightening/loosening 0.5m would catch — these are corner records whose Vc lands FAR from any blockSharp vertex (divided-pair endpoints, park-perimeter outliers, etc.). Only 3 of 177 sit in (0.5m, 1.0m] — the tunable bucket.
   - **135 matched-but-no-arc-span** (vertex within TOL=0.5m but `applyRoundCornersToRing` skipped via `notConvex` or `R≤0.05`). These corner records DO have a nearby ring vertex; the Bezier just didn't insert.

So the failure-mode picture is:
- 25.5% `wrong_flanking` — **emits a defective pad** (visible)
- 1.2% `selfint` — **emits a defective pad** (visible)
- 7.5% `ok` — emits a correct pad (32 of these still had cusp guard fire)
- 18.9% `flanking_skip` — does NOT emit (production short-circuits at `if (!Bmeta && !Ameta) continue`)
- 20.3% `no_match` (matched-vertex-no-arc) — does NOT emit (no Bezier insertion → no arc-span in partition)
- 26.6% `no_match` (unmatched-vertex) — does NOT emit AND not even adjacent to any block

**Dominant visible defect: wrong_flanking + selfint = 178 corners producing defective pads.** Of those, `wrong_flanking` is 95% of the visible failure surface. **`selfint` is dominated by wrong_flanking with cusp_fired** (4 of 8 selfints have cusp fired AND wrong-flanking-shaped inputs).

## Failure-mode histogram (666 total corners)

| mode | count | % | emits arc-span? |
|---|---|---|---|
| ok | 50 | 7.5% | yes |
| no_match | 312 | 46.8% | no |
| └─ unmatched vertex (dist ≥ 0.5) | 177 | 26.6% | no |
| └─ matched but notConvex/smallR | 135 | 20.3% | no |
| flanking_skip | 126 | 18.9% | no |
| wrong_flanking | 170 | 25.5% | 163 yes / 7 no |
| selfint | 8 | 1.2% | yes |
| cusp_ramp_collision | 0 | 0% | n/a |
| other | 0 | 0% | n/a |

Cusp guard fired on 81 corners (12.2%) — vs Stage 6's 22.5% (Stage 6 scoped to arc-span ENTRIES, this audit scopes to corner RECORDS; the 12.2% renormalizes). RAMP_MIN floor fired on 0 corners (0%).

Cusp guard by mode: `ok`:32, `wrong_flanking`:45, `selfint`:4. So cusp guard fires equally on healthy and defective corners — it's not itself a defect predictor.

## Mississippi × Park deep-dump (V = (229, -158.9))

**IX identification:** programmatic name-substring scan returned 1 candidate. The IX has 1 Mississippi Avenue vertex + 1 Park Avenue vertex coinciding within 0.5m at (229, -158.9). Park Avenue chains with name "Truman Parkway" were explicitly excluded. **Assumption (surfaced):** the brief mentioned "5 legs" but this IX is a 4-leg X intersection (Mississippi±, Park±). It's the only Mississippi × Park IX on LS. Treating it as the named IX per the brief's "prefer highest leg count" rule.

| corner | legA × legB | θ (°) | block | matchDist | prev flank | next flank | cusp k | dCorner | padArea | selfint | mode |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SW | Park × Miss | 112.6 | 117.0,-299.0 | 0.000 | terminal=none (skip) | adj=null (skip) | n/a | 1.500 (RAMP_MIN!) | 6.37* | no | `flanking_skip` |
| SE | Miss × Park | 67.8 | 341.5,-154.0 | 0.001 | tl=1.73 sw=2.87 | terminal=none (skip) | 0.799 | 4.05 | 27.02 | no | `wrong_flanking` |
| NE | Park × Miss | 109.2 | 306.0,-2.5 | 0.000 | adj=null (skip) | tl=3.19 sw=1.73 | 0.745 | 4.05 | 11.76 | **yes** | `selfint` |
| NW | Miss × Park | 70.4 | 2.0,0.0 | 0.001 | tl=3.19 sw=1.73 | tl=2.91 sw=3.22 | 0.598 | 4.05 | 25.25 | no | `ok` |

*SW pad area 6.37 is the AUDIT's emission (which doesn't short-circuit on flanking_skip). Production short-circuits on `if (!Bmeta && !Ameta) continue` → **SW emits no pad in production.**

**One-line per-corner diagnosis:**
- **SW** (`flanking_skip`): both flanks are park-interior / terminal=none. Production emits NOTHING. Any visible SW geometry comes from elsewhere (block fill or asphalt rounding).
- **SE** (`wrong_flanking`): prev flank authored, next flank `terminal=none`. The `?? Ameta?.tl ?? Bmeta?.tl` fallback ASSUMES symmetry; mirrors prev's `tl=1.73, sw=2.87` onto the next side, producing a 4.05m-deep symmetric pad even though the next-side reality is zero ped zone. Cusp fired k=0.799 narrows by 20%.
- **NE** (`selfint` over `wrong_flanking`): prev flank adj=null (couldn't resolve to any chain) — likely because the rounded-ring straight-span vertices probe outward into the void with no chain hit within 30m. Next flank authored at tl=3.19, sw=1.73. Cusp k=0.745. The one-sided meta plus cusp scaling produces a pad that self-intersects.
- **NW** (`ok`): both flanks authored properly. But cusp k=0.598 — the depths are SCALED DOWN 40% from author intent. The pad emits cleanly but at 60% of authored depth. By the brief's note ("§6.9 SE is doctrine-correct, NE has no pad, NW sized wrong"), this matches NW's "sized wrong" classification: ok-but-cusp-clamped.

**Side-by-side diff (NW = baseline; NW is the only `ok` corner here):**

| variable | NW (ok) | SW | SE | NE |
|---|---|---|---|---|
| θ° | 70.4 | 112.6 (+42.2) | 67.8 (−2.6) | 109.2 (+38.8) |
| R_used | 4.5 | 4.5 | 4.5 | 4.5 |
| prev.terminal | sidewalk | none | sidewalk | undef (adj=null) |
| next.terminal | sidewalk | undef | none | sidewalk |
| cusp k | 0.598 | n/a | 0.799 | 0.745 |
| dCorner | 4.05 | 1.5 | 4.05 | 4.05 |
| padArea | 25.25 | 6.37 | 27.02 | 11.76 |
| failure | ok | flanking_skip | wrong_flanking | selfint |

**The variance driver at this IX is overwhelmingly flanking-meta resolution**, not vertex matching (all 4 matchDist < 0.002m), not RAMP_MIN, and not the cusp guard (cusp fires on 3 of 4 but only one fails). The "flanking" column is the only one with heterogeneous values.

## Anomalies surfaced (beyond the §6.9 hypothesized taxonomy)

1. **`cusp_ramp_collision` is a phantom — 0 of 666 corners trigger it.** §6.9's hypothesized "wrong shape" mechanism (cusp scaling + RAMP_MIN floor combining destructively) does not manifest on LS. Stage 11 should retire this from the failure-mode catalog.

2. **Unmatched corner distance distribution is bimodal — and NOT near-TOL.** Of 177 unmatched corners, only **3** sit in the (0.5m, 1.0m] tunable bucket. The rest are 1m–299m from any blockSharp vertex. **Loosening TOL=0.5 will not help.** These corner records are emitted by `cornersAtIx` for leg pairs whose polylineCross hit point Vc lands in the asphalt void or outside the block network entirely — divided-pair endpoint IXs (median strip plug skipped), park-perimeter outliers, etc. Stage 11 should treat these as cornersAtIx oversupply, not as a tolerance problem.

3. **`wrong_flanking` is itself heterogeneous.** Of 170 wrong_flanking corners, the source of the asymmetry splits into at least two sub-cases:
   - **adj=null on one side** (next or prev meta `findAdjacentChainForBlockEdge` returned null). NE corner at Miss×Park is this case. Often the straight-span between two arc-spans is so SHORT (only 1-2 vertices) that midpoint probe finds nothing within PROBE_MAX=30m on that side, OR the span is curved such that the probe outward-normal misses the adjacent chain.
   - **`terminal === 'none'` on one side** (the chain is authored without a sidewalk on one face). SE corner at Miss×Park is this case — Park Avenue's east side is residential-driveway frontage with no ped zone.
   - Stage 11's fix likely needs to handle these differently: terminal=none is operator intent (don't mirror); adj=null is a probe failure (might want to mirror or might want a stronger probe).

4. **45 of 170 `wrong_flanking` corners also have cusp_fired.** When one-sided flanking input feeds the cusp guard, the guard scales tl/sw down without knowing that the symmetry assumption it operates on is already broken. Compound defect.

5. **Per-IX corner-count anomalies (38 IXs out of 242 — 15.7%):**
   - **26 IXs with 1 corner record** (4-leg IX should produce 4; even a T should produce 2-3). These need a sanity check — sampling 5: `(-142.3, 304.9)`, `(-416.4, -164.2)`, `(-427.7, 181.0)`, `(-430.9, 157.5)`, `(-432.5, 219.3)`. These may be IXs where cornersAtIx's filters (theta<5°/>355°, through-T `same-name θ∈(150,210)` skip, polylineCross null on near-parallel legs) dropped legs. Worth eyeballing in Designer.
   - **11 IXs with 3 corner records** (Stage 6 saw 1; this audit's at corner-record level shows 11). Sample: `(-430.6, ?), (-501.0, ?), (-73.1, ?), (-78.0, ?), (424.4, ?)`.
   - **1 IX with 5 corner records.** That's a 5-leg IX where all leg pairs produced corners.

6. **NE corner at Miss×Park exhibits adj=null on the prev side.** The straight-span between SE-arc and NE-arc along the east-block ring is short (likely 2-3 vertices). `findAdjacentChainForBlockEdge`'s midpoint probe must be finding nothing within 30m. Worth investigating whether (a) the probe outward-normal is wrong-direction on short spans, or (b) Park Avenue is actually >30m away across the median, or (c) the rounded ring's straight-span endpoints are inside the rounded silhouette. (Reading the data: V=(229,-158.9), block 306.0,-2.5 is the NE block; Park Avenue runs east-west through this IX; its NE-block-side face should be reachable. **Likely root cause: rounded-ring straight-spans between consecutive arc-spans at the same IX are SHORTER than the asphalt half-width**, so probing outward from the span midpoint lands inside the asphalt void, not on the far chain.) Stage 11 should test this hypothesis explicitly.

7. **The SW corner at Miss×Park has matchDist=0 to blockKey=117.0,-299.0** — that block's bounding-box center is ~140m south of the IX. Cause: the SW-of-Miss×Park block extends far south (Lafayette Park's east face is several hundred meters tall). The matchDist=0 confirms the corner sits on the right block's ring; the blockKey is just a far-southern centroid label. Not a defect; surfaced for clarity (blockKey != "near the corner" for large blocks).

8. **No SELFINT outside wrong_flanking shape inputs.** All 8 selfint pads have wrong_flanking-style asymmetric inputs. Suggests Stage 11's wrong_flanking fix may incidentally close most of the selfint count too.

## Brief's hypothesized vs measured taxonomy

| §6.9 hypothesis | measured |
|---|---|
| no pad: TOL=0.5 vertex-match failure | YES, 177 of 312 no_match (no pad emits) — but distances are mostly 5–300m, NOT near-TOL |
| no pad: notConvex / R<0.05 — UNHYPOTHESIZED | 135 corners (20% of total) |
| wrong size: per-block customs differ | YES — terminal=none on one flank is the most common; per-block customs second |
| wrong shape: cusp + RAMP_MIN collision | NO — 0% on LS |
| **adj=null on one flank — UNHYPOTHESIZED** | New finding; meaningful subset of wrong_flanking |

## Constraints / disclosures (per `feedback_baby_must_surface_scope_drift`)

- **Duplicated production code (must stay in sync if production drifts):**
  - `findAdjacentChainForBlockEdge` — src `buildBlockGeometryV2.js` lines 1228-1314. Audit uses the full-scan (no spatial-index) variant since `chainIndex` isn't built externally.
  - `applyRoundCornersToRing` — src 677-836. Audit's `applyRoundCornersToRingI` is byte-identical in walking-algorithm but adds instrumentation arrays.
  - `blockKeyFromRing` — src 65-72.
  - `ringSignedArea2D` — src 1715-1720.
  - `computePerps` — src 95-… (rewritten minimally).
  - `depthForSide` — src 204.
  - `defaultR` — src 214.
  - `bezierReplaceCorner`, `cubicBezierEval` — src 614-643 / 576-585.
  - Span-partition algorithm (`partitionRing`) — src 1480-1493.
  - Flanking-meta resolution (`resolveStraightMeta`) — src 1498-1519.
  - Cusp-guard and Stage 9 emission (cusp_safeMax/scaling, dCorner/RAMP_MIN, pad ring construction) — src 1556-1600.
  - **If production retunes any of these constants (TOL=0.5, RAMP_MIN_M=1.5, cusp 0.9× factor, PROBE_MAX=30m), the audit must be re-synced.**

- **Assumption: Mississippi × Park IX identification.** Programmatic substring scan matched 1 candidate at V=(229, -158.9), 4-leg X intersection (Miss±, Park±). The brief mentioned "5 legs" — there is no 5-leg Mississippi×Park on LS. Used the 4-leg candidate as the named IX. The audit also produces a roll-up of all 5-leg IXs (one exists; not identified to the user yet).

- **Stage 6 audit precedent (`scratch/corner-regime-audit.js`) was scoped to ARC-SPAN ENTRIES (355 on LS).** This audit is scoped to CORNER RECORDS (666 on LS — 355 produce arc-spans, the other 311 fall to no_match/flanking_skip and emit nothing). Stage 6's 22.5% cusp-fire rate vs this audit's 12.2% reflects the denominator change, not behavior drift.

- **`failure_mode` classification predicate order is opinionated.** Listed in priority: cusp_ramp_collision → selfint → wrong_flanking → ok. A corner that is BOTH wrong_flanking AND selfint counts as selfint. Re-querying the CSV directly by `cusp_fired`/`vertex_matched` columns gives finer cuts.

- **Cross-arc finding for Stage 11:** the dominant emitted-but-defective failure mode is `wrong_flanking`, not the cusp/RAMP collision from §6.9's hypothesis. **Stage 11's fix should center on flanking-meta resolution** — specifically distinguishing `terminal === 'none'` (operator intent, do not mirror) from `adj === null` (probe failure, might mirror or fix probe). The cusp guard works fine; the RAMP_MIN floor is dead code on LS today.

## CSV column quick-reference

`scratch/corner-input-audit.csv` (666 rows, sorted by `(ix_key, blockKey, theta_deg)`):

```
ix_key, V_x, V_y, blockKey, corner_legA_skel, corner_legB_skel,
theta_deg, R_authored, R_used, d_A, d_B,
vertex_match_dist, vertex_matched, bezier_consumed_span_len,
arc_span_present, prevMeta_skip, nextMeta_skip,
prevMeta_terminal, nextMeta_terminal, prevMeta_tl, prevMeta_sw,
nextMeta_tl, nextMeta_sw, prevMeta_edgeOrd, nextMeta_edgeOrd,
cw_plus_tl_sw_A, cw_plus_tl_sw_B, arc_R,
cusp_safeMax, cusp_totalMax, cusp_fired, cusp_scale_k,
dCorner, ramp_min_fired, pad_area_m2, pad_selfintersects,
pad_ring_vertex_count, failure_mode, notes
```

Filter examples:
- `failure_mode == "wrong_flanking" AND prevMeta_terminal == "none"` → terminal-none-on-prev cases.
- `failure_mode == "wrong_flanking" AND prevMeta_terminal == ""` → adj=null-on-prev cases.
- `failure_mode == "selfint"` → 8 rows, all with `cusp_fired == "1"` + asymmetric flanking.
- `vertex_match_dist > 30 AND failure_mode == "no_match"` → corner-records too-far-from-any-block (likely cornersAtIx oversupply).
