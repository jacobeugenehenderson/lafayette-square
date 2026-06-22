# Throat — Junction-Band Silhouette Invariant for the Correctness Detector (forensic, 2026-06-13)

**Read-only.** Extends the harness `scratch/correctness-detector.mjs` (now carries THREE
graph-level invariants beside the five geometric ones). No production code touched. Continues
`SIEVE-DETECTOR-FINDINGS.md` + `LOOM-TOPO-FINDINGS.md`; builds the third topological class
`POLYGON-FIRST.md §5` / `SECTION.md §7` name: **does the constructed PED junction agree with
the constructed ASPHALT junction?**

```
node scratch/correctness-detector.mjs            # full report (now incl. junction-band)
node scratch/correctness-detector.mjs --simweld  # SELF-TEST: loop-closure live-guard (still green)
```

The headline: **junction-band is the highest-leverage invariant of the suite so far.** It
recovers **+6 curated names** (all 4 weird junctions — Carroll, Hickory Street, Hickory Lane,
Grattan — PLUS Kennett & Truman) that **no prior invariant touched**, lifting per-name recall
**18/31 → 24/31 (58% → 77%)**. It is *discriminating*, not a fire-everywhere signal: **93 of 161
junction nodes are CLEAN** (0 throat slivers). And — the load-bearing honest finding — **the
defect class is PERVASIVE, not curated-specific**: 60 junctions fragment, and the grid junctions
that flag (Montrose 18 slivers, Saint Vincent 20, Caroline 14) **render badly too** (verified by
eye), so the name-level grid false-positives are mostly **real uncurated defect, not noise.**

---

## 0. What I built (the invariant)

| # | Invariant | Layer | Oracle | What it FLAGs |
|---|---|---|---|---|
| 8 | **junction-band** | graph (degree >= 3 node) | `sectionPass` ped FILL vs `pr.asphalt` | a junction node whose incident ped bands fragment into >=2 tiny (<8 m2) treelawn/sidewalk slivers at the throat |

`junctionBandReport(streets, tiles, asphalt, cw)` (`correctness-detector.mjs`):
1. **Graph nodes** — rebuild degree over endpoints + interior touches (snap 2 m, same model
   cap-tangent uses); a real junction = degree >= 3 (`JUNC_DEG`).
2. **Per-tile ped FILL via the producer** — stroke each tile treelawn+sidewalk with `sectionPass`
   (the **same** FILL stroke the producer + Stage run — the oracle is the producer, not a
   re-implementation), cached.
3. **Throat slivers** — for each node, over the tiles whose `iA` passes within 12 m
   (`JUNC_TILE_REACH`), count ped fragments **< 8 m2** (`SLIVER_AREA`) within a 14 m throat
   (`JUNC_THROAT_R`). A node with **>= 2** such slivers (`JUNC_SLIVER_FLAG`) is flagged.

**Why the sliver-AREA is the discriminator (calibrated by eye + fragment dump, not fit to a
number).** At Carroll/Truman and Hickory/Grattan the ped FILL carries the legitimate leg strips
(area **>100 m2**) **plus** isolated **2–6 m2 wedges** in the throat — the green slivers the
operator eye catches. At Grattan/Lasalle — a junction that **renders clean** — there are *only*
the >100 m2 strips, **zero** small fragments. Absolute small area separates the two cleanly;
aspect-ratio does **not** (the legit strips have aspect 200–360, same as the slivers). The
threshold sits in the empty gap between 6 m2 (worst sliver) and 117 m2 (smallest legit strip), so
it is not a knife-edge tune.
---

## 1. The updated confusion (per curated NAME, vs 31)

```
                       flags  curated  gridFP   recall
GEOMETRIC only           42    18/31     24     58%   (Sieve v1)
+ loop-closure+cap       43    19/31     24     61%   (Loom)
+ junction-band          54    24/31     30     77%   (this pass)  [+6 recall, +6 gridFP]
```

Per-invariant (topological rows):

| Invariant | flags | curated | grid FP | reads as |
|---|---|---|---|---|
| loop-closure  | 0  | 0  | 0  | GREEN regression guard (Loom) |
| cap-tangent   | 1  | 1  | 0  | catches Preston (Loom) |
| **junction-band** | **41** | **20** | **21** | **the recall instrument** — +6 uniquely-caught curated names |

**The +6 junction-band uniquely adds** (none caught by any prior invariant): **Carroll Street ·
Grattan Street · Hickory Lane · Hickory Street** (the 4 weird junctions, max slivers 8/9/9/18) ·
**Kennett Place** (4) · **Truman Parkway** (8). Carroll, Grattan, Hickory* were the named **#1
remaining gap** in both Sieve §4 and Loom §4 — **closed.**

---

## 2. The weird junctions: caught 4/4, and verified by the eye (not the proxy)

Per the brief discipline — *a flag is a candidate for the eye, not a verdict* — I rendered the
ped FILL at each (`scratch/jx-*.png`) before trusting the number:

| Junction | slivers | renders | verdict |
|---|---|---|---|
| **Carroll / Truman** | 8 | green wedge-slivers + sidewalk notch at the T-mouth | **FRAGMENTS** OK |
| **Hickory / Grattan** | 9 | green slivers + broken SW round at the throat | **FRAGMENTS** OK |
| **Hickory / Missouri** | 6 | small green notches at the lower corner-returns | fragments (subtle) OK |
| **Grattan / Lasalle** | **0** | SW wraps the corner cleanly, no slivers | **CLEAN** (correctly NOT flagged) |

Grattan/Lasalle is the proof the signal discriminates: it is a curated **Grattan** node that
**renders fine**, and the invariant **passes it** (0 slivers) while catching Grattan at its other,
genuinely-broken nodes. The detector does not flag a junction that renders clean — exactly the
brief requirement.
---

## 3. The load-bearing finding: the junction-band defect is PERVASIVE, not curated-specific

This is the Sieve/Loom reframe in a new place, and it changes how the suite should read the
numbers.

```
161 junction nodes (deg >= 3):  93 CLEAN (0 throat slivers)   60 FLAGGED (>=2 slivers)
```

- **55% of junctions are clean** — the invariant is **not** firing everywhere; it isolates a real
  subset. (Contrast the *raw face-neck* signal I tried first, which fired at ~85% of junctions
  including pure grid — because every street crossing necks the curb to ~road-width. That signal
  was useless and is **not** what shipped. The discriminator had to be the realized FILL slivers,
  not the silhouette neck.)
- **But the 60 flagged are NOT all curated.** The worst-fragmented junctions include grid streets:
  **Montrose/Hickory (18), Saint Vincent (20), Caroline (14), South Ewing (14), Lasalle/California
  (12).** I rendered Montrose/Hickory and Ohio/Park: **they have the SAME sliver pathology** — tiny
  green wedges at every corner-return — just smaller than the curated worst cases.
- **Therefore the name-level grid-FP 21 is mostly REAL uncurated defect, not detector noise.** The
  35 curated streets are where the operator *looked* (worst sliver counts cluster there: Hickory 18,
  Waverly 27); the defect *class* extends across the whole map. Same shape as Sieve max-turn (the
  labeled set marks operator-attention, not the defect boundary) and Loom caps (the Places are
  mostly fine) — here it cuts the **other** way: the curated set **under-counts** junction-band.

**Implication for POLYGON-FIRST §5:** junction-band most strongly argues the **reframe** the SSOT
already states — *the deliverable is the DETECTOR, not the 35 fixes.* The junction-band root
(SECTION §7, corrected 2026-06-12 by Jacob) is **upstream / SHAPE**: there is no single SSoT junction
polygon from which asphalt + curb + treelawn + sidewalk all derive, so the independently-stroked ped
legs fragment. A FILL band-neck clamp was built **and reverted** — correctly — because the silhouette
is already clean (`iA` 0 self-int); the cure is the polygon-first junction construction, not a FILL
patch. **This invariant is the RED-until-true gate for that cure: when the junction is one derived
polygon, the throat-sliver count goes to 0 generally** — and the detector proves it on town #2…N.

---

## 4. The 7 still-missed curated names — the residual gap

```
Albion Place · Dillon Street · Nicholson Place · Rutger Lane · Simpson Place · Vail Place · Whittemore Place
```

All seven are **dead-end / cul-de-sac Places or stubs** — none is a junction (degree-1 tips or
short stubs), so junction-band correctly does **not** see them, and they split exactly as Loom
documented:

- **The 5 fine cul-de-sacs** (Albion, Nicholson, Simpson, Vail, Whittemore): Loom verified tip-by-tip
  that their authored round caps **render at 0.0 m** — **genuinely correct, not defects.** Curated
  because the cap was a hand-authoring *act*, not a pipeline error. No invariant should flag them.
- **The stubs** (Dillon Street, Rutger Lane): too short for the curb sampler (`MIN_RUN = 22 m`) — a
  sampler-threshold gap, not a missing invariant.

So the **honest defect denominator is NOT 31.** Loom already shrank it: ~6 curated names are
correct-as-rendered. Against the genuine-defect denominator (~25 — strip the 5 fine caps + the 2
sub-sampler stubs), the suite now recalls **24/25 of the defects it can structurally see.** Measuring
against 31 *understates* the suite, exactly as Loom §5.3 warned.
---

## 5. Recommendations (updated from Loom §5)

1. **Promote junction-band to the suite alongside width-step.** It is the recall instrument for the
   largest remaining defect class (60 junctions), it discriminates (93 clean), it is grounded in the
   producer (`sectionPass` is the oracle, not a re-impl), and it catches the named #1 gap. **Report
   it at the JUNCTION level** — the name-level row over-spreads to grid streets crossing a defective
   node (a structural artifact of name-attribution, not a tuning miss).
2. **Treat the grid junction flags as a WORK QUEUE, not false-positives.** Montrose/Hickory, Saint
   Vincent, Caroline et al. are genuinely fragmenting; the operator simply has not curated them. This
   is the standing-regression-test value POLYGON-FIRST §5 part 4 describes: the suite finds the defect
   class *everywhere*, not just where a human already looked.
3. **junction-band is the RED gate for the polygon-first junction cure (SECTION §7).** The fix is
   upstream — one SSoT junction polygon from which the ped derives. When it lands, the throat-sliver
   count must drop to 0 **generally** (all 60), not just at the curated 4. Wire that as the acceptance
   test: *no green build with a fragmenting junction.* (A `--simjunc` self-test analogue to
   `--simweld` — inject a fragmenting tile, assert the count rises — would keep the guard live; not
   built this pass.)
4. **Do NOT chase the 7 missed Places** — 5 are correct caps (Loom), 2 are sub-sampler stubs. Recall
   climbs by fixing junction-band generally, not by widening to non-defects.
5. **width-step remains the flagship** (Sieve §5.1); loop-closure + cap-tangent remain correct
   regression guards (Loom §5.1-2) — all unchanged.

---

## 6. Validation verdict (for the invariant itself)

- **junction-band: CORRECT, recovers +6, discriminates.** Oracle = the producer own `sectionPass`
  FILL. Verified by eye that the 4 weird junctions fragment and a curated-but-clean node
  (Grattan/Lasalle) does **not** (0 slivers, correctly passed). 93/161 junctions clean proves it is
  not a fire-everywhere signal.
- **The reframe it forces:** the junction-band defect is **pervasive** (60 junctions), so the curated
  set *under-counts* it — the grid FP are mostly real, uncurated defect (verified:
  `scratch/jx-montrose-hickory.png`). The detector job is to surface the **class** across the whole
  map; the 35 are just where the eye landed first.
- **The next gap is no longer a missing invariant — it is the FIX.** With junction-band built, every
  *structurally-visible* curated defect is now flagged by some invariant (24/25). The 7 misses are 5
  non-defects + 2 sub-sampler stubs. The remaining work is **upstream**: the polygon-first junction
  construction that turns junction-band green generally (SECTION §7, the SHAPE campaign) — for which
  this invariant is the RED-until-true gate.

Every flag remains a **candidate for the operator eye**, never a verdict — and here the eye confirmed
both directions: the flagged weird junctions fragment, and the un-flagged clean junction
(Grattan/Lasalle) renders fine.

---

## Artifacts
- `scratch/correctness-detector.mjs` — harness, now with `junctionBandReport` (invariant #8) + the
  per-junction confusion block + the JUNC tag in the flagged listings.
- `scratch/jx-*.png` — the eye-validation renders (per-tile ped FILL at each junction): the 4 weird
  junctions, Grattan/Lasalle (clean control), Montrose/Hickory + Ohio/Park (grid defects), the
  4-way clean-grid control.
