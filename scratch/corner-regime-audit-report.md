# Stage 6 — Corner-interior regime audit (LS)

**Source of truth:** `src/lib/buildBlockGeometryV2.js` @ HEAD (commit 48d8135). No source edits.
**Probe:** `scratch/corner-regime-audit.js` — replays `applyRoundCornersToRing` + `buildFrontageBandsV2`'s span partition + regime predicates verbatim. Output CSV at `scratch/corner-regime-audit.csv` (355 rows).

## TL;DR

- **355 corner arc-spans** walked across all 126 blockRounded rings.
- **The doctrine-correct concentric-only regime fires for 0 of 355 corners.** Even the 14 corners that pass the brief's relaxed "concentric" gate (SYM-WITH-RAMP with both sides authored tl+sw and at least one tl ring + one sw ring emitted) only achieve concentric geometry *outside* the ramp window — the wedge interruption is in every case.
- **128 of 355 arc-spans (36 %)** push no fb entry at all (`NEITHER-EMITTED` — both flanking metas skip). This is by far the largest bucket and corresponds almost entirely to park-perimeter corners where the probed adjacent chain's facing side has `terminal !== 'sidewalk'`.
- **The visible "plug between two straight ribbons" defect maps to 25 ASYM-regime corners + 98 SYM-WITH-RAMP corners + 104 SYM-NO-RAMP corners** — all 227 emitting fb entries fail the wraparound test in some way.

## §1. Regime distribution

| Regime              | Count | Notes |
|---|---:|---|
| NEITHER-EMITTED     | 128 (36 %) | Both flanking sides skip (`!isSidewalk \|\| (tl<=0 && sw<=0)`). Almost all are park-perimeter or median-pair-endpoint corners. **Anomaly-flag below.** |
| SYM-NO-RAMP         | 104 (29 %) | `!isAsym && !(tl_A>0 && tl_B>0)` — both legs sidewalk-only (no treelawn). Emits a single sw band across the arc. |
| SYM-WITH-RAMP       |  98 (28 %) | `!isAsym && tl_A>0 && tl_B>0`. Concentric tl + sw outside ramp window; single sidewalk wedge inside. |
| ASYM                |  25 ( 7 %) | `diff > 1.0m \|\| ratio < 0.7`. Single sw plug with angular step at frac=0.5. |
| **Total**           | **355** | |

The expectation in the brief (SYM-WITH-RAMP dominates on LS's mostly-symmetric residential network) does NOT hold:
- **SYM-NO-RAMP (104) outweighs SYM-WITH-RAMP (98).** SYM-NO-RAMP fires when *neither* leg has authored treelawn (`tl_A <= 0` *or* `tl_B <= 0`, in the symmetric-depth case). On LS, a large share of residential ped-zones are authored as sidewalk-only (tl=0, sw≈1.9m) — the default `Saint Vincent Avenue` / `Hickory Street` / `Caroline Street` / `Park Place` / `Nebraska Avenue` etc. all show d_A = d_B = 1.91m, no treelawn.
- The 51 % SYM corners (104 + 98) are the bulk; ASYM is the smaller share, but the brief's diagnostic order singled out the asym branch as a deviation case — that bucket is real but not dominant.

## §2. Concentric vs non-concentric

| Bucket | Count |
|---|---:|
| Doctrine-correct concentric (brief def: both sides tl>0+sw>0 AND SYM-WITH-RAMP AND ≥1 tl ring AND ≥1 sw ring) | 14 |
| Non-concentric (everything else) | 341 |

**The brief's relaxed concentric definition over-counts.** Even those 14 corners only emit concentric tl + sw *outside* a ramp window — the wedge interruption replaces the concentric pair across the middle 30-40 % of arc length. Under the strict doctrine (the ribbon wraps the silhouette as a continuous inset-arc pair, end-to-end), the count is **0 / 355**.

## §3. Doctrine-violation buckets

| Violation | Count |
|---|---:|
| Both sides authored tl>0 + sw>0 BUT emitter dropped treelawn (`tlRings == 0`) | 8 |
| Ramp consumed > 80 % of arc length | 0 |
| ASYM despite `\|d_A − d_B\| < 1.5m` (asym threshold may be too aggressive) | 18 |

**The 8 doctrine-drops are all ASYM-regime corners** where one of the two flanking legs has a markedly deeper cross-section (Truman Parkway-style 4.05m vs Lafayette Avenue 2.10m, or Grattan Street 4.05m vs Lasalle Lane 1.62m). The ASYM branch emits a single sidewalk plug only — the treelawn is structurally dropped. Stage 7's concentric rewrite must decide whether asymmetric corners taper-smooth, min-depth-clamp, or max-depth-bulge (see §6 below).

**The 18 marginal-ASYM corners** sit in the diff∈[1.0, 1.5)m band — the current `PHASE2_ASYM_EPS_M = 1.0` is just under their diff. Raising the threshold to 1.5m moves these to SYM-WITH-RAMP (which would also be wrong — they have ≠ tl on the two legs). Stage 7 should treat the SYM vs ASYM split as a smooth blend, not a hard threshold.

**Ramp window never consumes >80 % of arc length** on LS — `PHASE2_RAMP_MAX_M = 2.0m` caps the ramp at 2m regardless of arc length, and `PHASE2_RAMP_FRAC = 0.4` ceilings to 40 % of total. So the largest ramp ratio observed is 0.40 — exactly at the cap. The visible "ramp ate the concentric portion" failure mode the brief was alert to does not materialize. The wedge IS interrupting the concentric pair, but it's bounded at 40 % of arc — the issue is structural (any wedge breaks concentricity), not a tuning failure.

## §4. Asymmetric-corner distribution

| Bucket (`\|d_A − d_B\|`) | Count |
|---|---:|
| > 1m | 22 |
| > 2m |  2 |
| > 3m |  0 |

The asymmetric tail is short. Only 2 corners (both Truman Parkway × residential, both `diff ≈ 2.4m`) sit above 2m of leg-asymmetry. Stage 7's choice of asymmetric-corner handling (smooth taper / min-depth / max-depth) impacts ~22 corners total; on most LS asymmetric corners the depth gap is < 1.5m, and any sane blend will read visually identical to the operator.

## §5. R / θ / arc-length / ratio distributions

**R histogram (1m bins):**
- R ∈ [1, 2): 3
- R ∈ [2, 3): 33
- R ∈ [3, 4): 220 ← bulk
- R ∈ [4, 5): 99

Median R sits at ~3.4m (the `R_class=4.5` default × `defaultR()` clamp by `d_min`). Tight R<2.5m corners (~10 total) are predominantly low-θ skews where the corner is squeezed (e.g. R=1.76 / θ=27° at South 14th × Lafayette).

**θ histogram (10° bins):**
- θ ∈ [80, 90): 124, θ ∈ [90, 100): 155 — together 79 % of all arc-spans are within ±10° of right-angle.
- θ < 30° (very acute): 4 corners — these are scattered residential skew-intersections; pass the 5° / 355° filter at cornersAtIx but produce very tight arcs.
- θ > 150° (near-180°, near-collinear): 1 corner at θ=165.9° (Park Place pass-through), arcLen=1.11m. Borderline; would have been filtered if 5° away.

**arcLen histogram:** clusters at 5-6m (249 spans) — corresponds to R≈3.4m × ~90° arcs. 17 corners arc < 4m; 11 corners arc > 8m. No giant arcs (the prior version-1 bug surfaced 549m arcs from broken partitioning — now resolved by inlining applyRoundCornersToRing's arcMeta).

**d_min/d_max ratio histogram:** 192 corners at ratio∈[1.00, 1.05) — perfectly symmetric. 27 corners < 0.7 → trigger ASYM by ratio. 20 corners between 0.7-0.95 → SYM despite visible asymmetry.

## §6. Worst-offender lists (for visual verification)

### Smallest R (tightest corners, top 10)
| R | θ | regime | blockKey | Vc | A | B | d_A | d_B |
|--:|--:|---|---|---|---|---|--:|--:|
| 1.76 | 27.0° | ASYM | 854.5,16.5 | (743.45, 298.10) | South 14th Street/left | Lafayette Avenue/left | 1.00 | 1.58 |
| 1.85 | 78.0° | NEITHER-EMITTED | -240.5,-301.5 | (-138.88, -323.92) | / | / | – | – |
| 1.91 | 39.0° | ASYM | -297.0,21.5 | (-406.55, 119.62) | Albion Place/right | Lafayette Avenue/left | 0.73 | 1.72 |
| 2.09 | 86.7° | SYM-NO-RAMP | -188.5,-453.5 | (-104.72, -427.12) | / | Hickory Street/left | 1.89 | 1.89 |
| 2.12 | 52.0° | ASYM | -592.5,-79.0 | (-369.32, -246.06) | South Jefferson Avenue/right | Park Avenue/right | 0.88 | 1.91 |
| 2.19 | 55.7° | NEITHER-EMITTED | -150.5,408.0 | (111.79, 513.05) | / | / | – | – |
| 2.20 | 55.9° | NEITHER-EMITTED | 14.0,548.0 | (108.55, 533.36) | / | / | – | – |
| 2.22 | 90.2° | NEITHER-EMITTED | -240.5,-301.5 | (-167.93, -234.50) | / | / | – | – |
| 2.35 | 29.7° | NEITHER-EMITTED | 677.5,-465.0 | (670.24, -464.12) | / | / | – | – |
| 2.50 | 68.2° | ASYM | -888.0,-141.5 | (-949.78, -347.76) | Park Avenue/right | Nebraska Avenue/left | 2.25 | 0.99 |

### Largest d-asymmetry (full list of `diff > 2m`, only 2)
| diff | d_A | d_B | regime | blockKey | Vc | A | B |
|--:|--:|--:|---|---|---|---|---|
| 2.43 | 4.05 | 1.62 | ASYM | 678.0,-469.0 | (703.57, -325.21) | Grattan Street/right | Lasalle Lane/left |
| 2.43 | 4.05 | 1.62 | ASYM | 700.5,-220.0 | (703.57, -325.21) | Grattan Street/right | Lasalle Lane/left |

(Both are the same Vc viewed from two adjacent blocks.)

### Largest ramp ratio (SYM-WITH-RAMP only, top 10)
All clustered at rampRatio=0.39-0.40 (= `PHASE2_RAMP_FRAC` cap of 40 %). No corner exceeds the cap. Visible defect at these corners is the wedge-breaks-concentricity geometry, not ramp overgrowth:

| rampRatio | arcLen | R | θ | blockKey | Vc |
|--:|--:|--:|--:|---|---|
| 0.40 | 5.05 | 2.88 | 79.7° | 118.0,744.0 | (-503.42, 666.02) |
| 0.40 | 5.04 | 2.86 | 79.1° | 203.0,617.0 | (129.30, 535.74) |
| 0.40 | 3.00 | 4.50 | 142.0° | -757.0,369.5 | (-552.97, 521.01) |
| 0.40 | 1.11 | 4.50 | 165.9° | 684.5,-98.0 | (622.86, -67.14) |
| 0.40 | 3.12 | 4.50 | 140.3° | 117.5,-299.0 | (56.58, -233.94) |

### Doctrine-drop: authored tl>0+sw>0 both sides BUT no tl emitted (top 8 — all rows)
All are ASYM corners where one side is materially deeper:

| regime | R | θ | d_A | d_B | diff | Vc | A | B |
|---|--:|--:|--:|--:|--:|---|---|---|
| ASYM | 4.50 | 89.2° | 4.05 | 1.62 | 2.43 | (703.57, -325.21) | Grattan Street/right | Lasalle Lane/left |
| ASYM | 3.32 | 89.2° | 2.99 | 1.75 | 1.23 | (-889.85, 463.80) | Oregon Avenue/left | California Avenue/right |
| ASYM | 4.50 | 91.7° | 4.05 | 2.10 | 1.95 | (536.21, 269.21) | Lafayette Avenue/left | Truman Parkway/right |
| ASYM | 4.50 | 89.6° | 2.88 | 4.05 | 1.17 | (-207.10, 152.20) | Missouri Avenue/left | Lafayette Avenue/left |
| ASYM | 1.91 | 39.0° | 0.73 | 1.72 | 0.99 | (-406.55, 119.62) | Albion Place/right | Lafayette Avenue/left |
| ASYM | 4.50 | 85.8° | 2.55 | 4.05 | 1.50 | (427.95, -94.20) | South 18th Street/left | Park Avenue/right |
| ASYM | 3.04 | 83.5° | 2.74 | 1.34 | 1.40 | (-346.48, -241.67) | Park Avenue/left | Albion Place/left |
| ASYM | 4.50 | 66.0° | 2.80 | 4.05 | 1.25 | (-359.33, -265.45) | Park Avenue/right | South Jefferson Avenue/left |

## §7. SELFINT + cusp guard + empty-emission

- **SELFINT in arc-span emission: 32.** These overlap §6.3's 49-SELFINT count in RIBBONS.md; the 32 in arc-spans + 17 in straight-spans ≈ 49 repo-wide.
- **Cusp guard fired: 80 / 355 (22.5 %).** Above the brief's 5 % flag threshold by 4.5×. The 0.9·arcR clamp is not tight enough at the lower-R / deeper-ped-zone corners; expect Stage 7 to revisit the safe-max factor. Most fired corners have R ∈ [2.5, 3.5)m + d_A/d_B ≈ 3m.
- **Empty arc-span (slot pushed, no tl + no sw): 0.** Every emitting fb has at least one ring.
- **Arc-span entries with no fillet asphaltRings: 64 / 355 (18 %).** These are corners where `attributeFilletResidualToArcs` (centroid-to-corner ≤ 8m) didn't find a matching fillet polygon. Most are NEITHER-EMITTED corners (no fb entry → no slot to fill) plus a tail of small-fillet corners whose centroid lands beyond 8m. Open question per §4 of RIBBONS.md.

## §8. Per-IX arc-span count (corner-record anomaly check)

| arc-spans per IX | IX count |
|---|---:|
| 1 |  34 |
| 2 |  77 |
| 3 |   1 |
| 4 |  41 |

- **4 per IX = 41 IXs** — standard 4-way intersections (4 block corners around the cross). Healthy.
- **2 per IX = 77 IXs** — T-intersections (only 2 block corners; the through-leg has none). Healthy.
- **1 per IX = 34 IXs** — one-corner IXs. Mix of (a) IX where 3 of 4 corners were filtered at the cornersAtIx polylineCross step (divided-pair endpoint), (b) corners where `cross*ringSign ≤ 0` skipped the round-corners pass for some quadrants.
- **3 per IX = 1 IX** — surprising; expected 2 or 4 from symmetry. Worth probing if Stage 7's rewrite still distinguishes per-quadrant.

## §9. NEITHER-EMITTED (128 corners) — the major doctrine surprise

These corners produce a corner record in `cornersAtIx`, get rounded into blockRounded with valid arcMeta, but the regime emitter's `if (!Bmeta && !Ameta) continue` at line 1549 drops them — both probed flanking chains return either `terminal !== 'sidewalk'` or `tl + sw <= 0`.

**Geographic distribution:** the 10 sampled NEITHER-EMITTED corners (all z > 600) cluster on the **northern park-perimeter blocks** (Lafayette Park north edge, Mississippi blocks, McNair / Ann blocks above z=600). These are corners between two chains where the chain's *facing side toward the block* is authored as non-sidewalk (park-perimeter chains with curb-only on the park side and full sidewalk on the residential side — the probe walks INTO the park edge and reads the curb-only side).

**Stage 7 implication:** if the concentric rewrite still depends on the regime emitter to know about flanking-side measures, these 128 corners stay un-emitted, which is correct for the park interior (no sidewalk wraps around the park-facing curb). But the visible defect Jacob is reporting may extend to corners on the OUTSIDE of park-perimeter blocks (where the residential ribbon DOES wrap) — verify against a specific corner before rewriting.

## §10. Recommendations for Stage 7's concentric rewrite

1. **The defect is structural, not tunable.** No parameter sweep of `PHASE2_ASYM_EPS_M / PHASE2_RAMP_*` makes 341 non-concentric corners concentric. The three-regime emitter is doing what it was designed to do; what it does is not what the doctrine asks for.
2. **The wedge interruption needs to go entirely** for SYM-WITH-RAMP. The current "single sidewalk-material wedge spanning the whole ped zone inside ramp window" is the source of the visible "plug between two ribbons" defect in symmetric corners — replace with continuous concentric arcs (curb at cw, tl outer at cw+tl, sw outer at cw+tl+sw) sweeping the full arc-span, full-stop. The ADA-ramp consideration belongs in Surveyor authoring, not in the geometry emitter.
3. **Asymmetric corners (25 ASYM-regime; 22 with diff > 1m; 2 with diff > 2m) need a continuous blend, not an angular step.** Three options to evaluate against the 8 doctrine-drop corners in §6:
   - **min-depth concentric:** clamp both legs to `min(d_A, d_B)` for the arc — under-emits ped zone on the deeper side. Visible as a "step in the straight band at the arc entry."
   - **max-depth concentric:** dilate both legs to `max(d_A, d_B)` — over-emits ped zone on the shallower side, intrudes the corresponding block.
   - **smooth taper concentric:** inner-edge depth interpolates between `d_B` and `d_A` along arc-frac. Smooth, no step, but each ring is no longer a circular arc — it's a generalized spiral. Doctrine-wise this is closest to "the ribbon wraps the silhouette adapting to its cross-section."
   The recommendation: **smooth taper** is doctrine-cleanest. The 2 diff>2m corners are the visual stress test.
4. **NEITHER-EMITTED stays an emit-skip,** but Stage 7 should add a logging path that asserts these are park-facing-curb-only corners rather than authoring oversights. The 128 number is high enough to suspect a probe-side issue at a handful of corners.
5. **Cusp guard at 22.5 % is too loose** — fold the rewrite around a more principled depth-vs-arc-radius relationship. If concentric arcs are mandatory, the cusp guard becomes "scale all four depths uniformly so the deepest concentric ring stays inside `0.9·arcR`" — same shape, fewer levers.
6. **The 32 arc-span SELFINTs** are a known §6.3 residual and orthogonal to the concentric rewrite; do not bundle.

## Anomaly flags (per brief's "surface anything not in this brief")

1. **NEITHER-EMITTED is the largest single bucket (36 %).** The brief expected SYM-WITH-RAMP to dominate; in practice the emit-skip branch fires more than any regime. The expectation needs revisiting in light of LS's park-perimeter density.
2. **Cusp guard fires on 22.5 % of corners**, far above the brief's 5 % flag threshold. Either the 0.9·arcR safe-max is too aggressive or LS's default ped-zone depths (cw=0.38, sw=1.5, tl=1.5) are too deep for the R≈3.4m median.
3. **One IX has exactly 3 arc-spans.** Symmetry expects 2 or 4; investigate before Stage 7 in case it surfaces a corner-record anomaly.
4. **One corner at θ=165.9° (R=4.50, arcLen=1.11m)** passes the 5° / 355° filter at cornersAtIx but is effectively collinear. Stage 7's concentric arcs degenerate as θ → 180°; consider tightening the filter to 10° / 350° or adding a min-arc-length skip.
5. **Margin-of-ASYM corners (18 of 25 ASYM have diff < 1.5m)** suggest the binary SYM-vs-ASYM split is too crisp. The Stage 7 smooth-taper recommendation removes the binary entirely.
6. **The brief's "1 of 4 arc-spans per IX is missing" check** does NOT correspond to a single-named scenario — 34 IXs have only one corner record, most of which are valid (divided-pair endpoint or 3-of-4 polylineCross skip).
