# Loom — Topological Invariants for the Correctness Detector (forensic, 2026-06-13)

**Read-only.** Extends Sieve's harness: `scratch/correctness-detector.mjs` (now carries two
graph-level invariants beside the five geometric ones). No production code touched. Continues
`SIEVE-DETECTOR-FINDINGS.md` and `POLYGON-FIRST.md §5` (the "two unbuilt topological invariants").

```
node scratch/correctness-detector.mjs            # full report (geometric + topological)
node scratch/correctness-detector.mjs --raw      # + the raw-OSM max-turn pass (Sieve's)
node scratch/correctness-detector.mjs --simweld  # SELF-TEST: prove loop-closure is a LIVE guard
```

The honest headline: **the two topological invariants are correct, but they barely move the
confusion matrix — and that is the finding, not a failure.** They recover **+1** curated name
(Preston) at **+0** grid false-positives. The reason is the same shape as Sieve's max-turn
discovery: **the topological defects the brief targeted (the loop "Places", the cul-de-sac
"Places") are mostly already fixed in the pipeline.** The endpoint-weld closes every loop; 5 of 6
cul-de-sac caps render perfectly. The invariants are **GREEN-today regression guards**, not
recovery detectors — which is exactly what a correctness suite should be once the bug is fixed.

---

## 0. What I built (the two invariants)

| # | Invariant | Layer | Oracle | What it FAILs on |
|---|---|---|---|---|
| 6 | **loop-closure** | graph (`extractFaces` + frozen medians) | the same face-walk + endpoint-weld the producer runs | a loop body whose endpoints don't meet within the weld tol → no emergent face → no median |
| 7 | **cul-de-sac-cap-tangent** | graph degree + shape tips | graph degree-1 tip + authored `capEnds` vs realized `roundTips`/`bluntTips` | an authored cap (round/blunt) on a true degree-1 tip with no tangent cap within 3 m |

**loop-closure** has two candidate detectors, both *answer-independent*:
- **(A) self-closing body** — a single chain whose `points[0]≈points[-1]` within `LOOP_GAP_CAND=8m`
  (Benton body 3.2 cm, Park Place 0.0, Saint Vincent 2.2 cm — the teardrop/bulb bodies). FAIL if
  the gap exceeds the weld tol (`WELD_TOL=0.15m` = `extractFaces` `ENDPOINT_SNAP`), OR no enclosed
  face sits at the interior, OR no median was emitted there.
- **(B) oneway couplet** — ≥1 same-name **oneway** carriageway, **center-anchored** (NOT
  divided/`inner-edge`/`pairId`), the group forming a cycle (≥2 shared endpoint nodes), whose
  enclosed face is **median-sized** (`< COUPLET_FACE_MAX=2500 m²` — a thin gap between
  carriageways, not a city block). FAIL if that thin face has no median. (Waverly's open cut-thru.)

**cap-tangent** keys on the **graph degree** (rebuilt live from the chains, snap 2 m) so a
coincidental same-name endpoint elsewhere can't fire, **AND** the **authored** `capEnds`
(round/blunt) — the operator's intent, not the seed's loose `caps[].degree===1` default (which
stamps `cap:'round'` on every degree-1 end including chains that exit the rendered clip). It only
flags an authored cap on a true degree-1 tip inside the clip with no realized tip within 3 m.

A `--simweld` **self-test** opens the welded loop bodies 1.4 m (past the weld tol) and drops the
medians; loop-closure then fires on all three (`Benton / Park Place / Saint Vincent`), proving the
oracle is a **live guard** and not dead-green by construction.

---

## 1. The updated confusion (per curated NAME, vs 31)

```
                 flags  curated  gridFP
GEOMETRIC only     42    18/31     24      (Sieve v1)
+ TOPOLOGICAL      43    19/31     24      [+1 recall, +0 grid FP]

  recall    18/31 (58%) → 19/31 (61%)
  precision 18/42 (43%) → 19/43 (44%)
  grid FP   24/82       → 24/82
```

Per-invariant (topological rows):

| Invariant | flags | curated | grid FP | reads as |
|---|---|---|---|---|
| **loop-closure** | **0** | **0** | **0** | **GREEN today** — every LS loop closes; a live regression guard (proven by `--simweld`) |
| **cap-tangent** | **1** | **1** (Preston) | **0** | catches the one genuinely-missing cul-de-sac cap; passes the 5 that render fine |

**The only new true positive is Preston Place** — authored `round` end-cap on a degree-1 tip, but
the nearest rendered round-tip is **171.7 m away**: the cap does not materialize. (Preston is one
chain, in a rendered tile, `caps.end.degree:1` — a real defect, not an artifact.)

---

## 2. Why loop-closure recovers ZERO on the current frame (the load-bearing finding)

The brief expected loop-closure to recover ~7 loop "Places". It recovers none — **because the
loops already close.** Verified directly against `extractFaces`:

| Loop body | endpoint gap | enclosed face | median emitted | verdict |
|---|---|---|---|---|
| Benton Place (`benton-place-1`) | **3.2 cm** | face area 3192 m² @ 3.8 m | yes @ 3.6 m | ✅ closes |
| Park Place (`park-place-2`) | **0.0 cm** | face area 206 m² @ 0.4 m | yes @ 0.4 m | ✅ closes |
| Saint Vincent (`saint-vincent-avenue-2`) | **2.2 cm** | face area 211 m² @ 0.5 m | yes @ 0.3 m | ✅ closes |

All three sit **inside** the `ENDPOINT_SNAP=0.15 m` weld tol, so `extractFaces` welds them and the
interior face forms — exactly the fix the memory ledger records (`e8cc310`, the endpoint-weld). The
divided avenues (Chouteau, Lafayette, Park, Geyer) carry **constructed E2 medians** (anchor
`inner-edge` + `pairId`), so they are *not* the emergent-face case and are correctly excluded.
Waverly's couplet median sits within 25 m. **There is no open loop-closure defect in LS today.**

So loop-closure is a **regression guard that is correctly green** — its job is to go RED the day a
loop body drifts past the weld tol on a rebuild (a documented hazard: `LOOP-STREETS §5.3`, "loop
renders drift on pipeline rebuild even with byte-identical inputs — verify, don't trust"). The
`--simweld` self-test confirms it fires the instant a loop opens. This is the *correct* behaviour
for a correctness invariant once the class is fixed — but it means loop-closure does **not** lift
recall on the current labeled set.

⚠️ **A discarded earlier draft of Type B** flagged Chouteau/Lafayette/Park/S.Jefferson/Lasalle and
3 grid streets "couplet encloses no median" — but those are divided avenues (which have a
constructed median) and large city blocks bounded by same-name cycles (which correctly have *no*
median). That draft added **zero net recall** (all already caught geometrically) and was pure
noise. Tightening Type B to genuine couplets (oneway + center-anchored + thin enclosed face)
removed all of it. **Per Sieve's discipline: an invariant that only re-flags already-caught
streets and reads correct-streets as broken is not earning its place — I cut it rather than ship
it for the recall number.**

---

## 3. Why cap-tangent recovers only Preston, not the six cul-de-sac "Places"

The brief expected cap-tangent to recover Albion, Vail, Kennett, Nicholson, Simpson, Whittemore.
It recovers only Preston — **because the other caps render correctly.** Verified tip-by-tip:

```
CUL-DE-SAC PLACES — authored cap → nearest rendered tip:
  Albion Place/start     round deg1 → 0.0 m  ✓ RENDERS
  Vail Place/start       round deg1 → 0.0 m  ✓ RENDERS
  Nicholson Place/end    round deg1 → 0.0 m  ✓ RENDERS
  Simpson Place/end      round deg1 → 0.0 m  ✓ RENDERS
  Whittemore Place/start round deg1 → 0.0 m  ✓ RENDERS
  Preston Place/end      round deg1 → 171.7 m ✗ MISSING
  Kennett Place          (both ends degree-3, butt — no authored cap, no tip expected)
```

**Five of six cul-de-sac Places are genuinely fine** — their authored round bulbs materialize at
the tip exactly (0.0 m). Kennett has **no** degree-1 tip at all (both ends are degree-3 graph
junctions, `cap:'butt'`) — it is a through-loop in the graph, not a cul-de-sac, so there is no cap
to check. The pipeline gets these right; a correctness detector that flagged them would be wrong.

This is the **same correction Sieve made for max-turn, in a new place:** the "Places" are
`source:'curated'` because the **cap choice was hand-authored** (the end-selector None/Round/Blunt
is *a free per-dead-end authoring act* — memory's `[[round-vs-flat prune discriminator is wrong in
principle]]`, the cap is not a derived geometry the pipeline can get "wrong" by default). The
provenance label marks *"a human touched this"*, not *"the pipeline breaks this"*. **The detector
honestly cannot recover a "defect" that isn't one** — and the brief's "candidates for the
operator's eye, not verdicts" discipline says: if a Place renders fine, **say so.** They do.

The lone real cap defect is **Preston** — and cap-tangent catches it cleanly.

---

## 4. The 12 still-missed curated names — the next gap

```
Albion · Carroll · Dillon St · Grattan · Hickory Lane · Hickory St ·
Kennett · Nicholson · Rutger Lane · Simpson · Vail · Whittemore
```

These split into three classes, **none of which is a loop-closure or cap-tangent defect**:

- **The 5 fine cul-de-sacs + Kennett** (Albion, Vail, Nicholson, Simpson, Whittemore, Kennett):
  **genuinely correct** — caps render, or no cap is owed. **Not defects.** They are in the labeled
  set as *authoring acts*, not *pipeline errors*. No invariant should flag them. (This shrinks the
  honest defect denominator: of 31 curated names, ~6 are correct-as-rendered.)
- **The weird junctions** (Carroll, Hickory St, Hickory Lane, Grattan): junction-band fragmentation
  / per-edge width-steps that don't cross a clean same-name through-node — so width-step misses
  them and curb∥chain's corner-margin blinds it (Sieve's §4 finding, unchanged). This is the
  **PED-BAND JUNCTION-CONSTRUCTION FAMILY** the memory ledger names as ▶NEXT — and it is the **real
  #1 detector gap now**, not the loops. It needs a **junction-silhouette invariant** (does the
  constructed ped junction band match the asphalt junction silhouette?) — a *different* topological
  check than the two I built, and the highest-leverage unbuilt one.
- **Stubs** (Rutger Lane, Dillon St): too short for the curb sampler (`MIN_RUN=22 m`) — a sampler
  threshold gap, not a missing invariant.

---

## 5. Recommendations (updated from Sieve §5)

1. **Keep loop-closure as a CI regression guard, not a recall instrument.** It is correctly green;
   its value is firing the day a rebuild drifts a loop body past the weld tol (the documented
   `LOOP-STREETS §5.3` hazard). Wire the `--simweld` self-test into CI so the guard can't silently
   die. **Do not chase recall by loosening it** — there is no open loop defect to catch.
2. **Keep cap-tangent — it caught Preston, a real defect Sieve's five geometric checks all missed.**
   It is cheap, class-specific, and zero grid false-positives. But **scope expectations honestly**:
   it will catch ~1 cap defect, not 7, because most authored caps render fine.
3. **Reframe the labeled set: ~6 of the 31 curated names are correct-as-rendered** (the fine
   cul-de-sacs + Kennett). The honest recall ceiling for a *defect* detector is therefore **not
   31** — it is ~25. Measuring against 31 understates the suite. (This is the topological analogue
   of Sieve's max-turn correction: the labeled set conflates *authoring touches* with *pipeline
   defects*.)
4. **The real next invariant is the junction-band silhouette check** (Carroll/Hickory/Grattan — the
   PED-BAND JUNCTION-CONSTRUCTION FAMILY). That is where the remaining genuine misses live. It is a
   *third* topological class — "the constructed ped junction matches the asphalt junction" — and is
   higher-leverage than either invariant I built. Neither loop-closure nor cap-tangent touches it.
5. **width-step remains the flagship** (Sieve §5.1) — unchanged.

---

## 6. Validation verdict (for the two invariants themselves)

- **loop-closure: CORRECT, and correctly GREEN.** Oracle verified against `extractFaces` directly
  (all 3 loops close) and proven live by `--simweld` (all 3 fire when opened). It recovers 0
  curated because **the loop class is fixed** — the right kind of zero. It is a regression guard,
  doing a guard's job.
- **cap-tangent: CORRECT, recovers +1 (Preston).** Verified tip-by-tip that the 5 other cul-de-sac
  caps render at 0.0 m (genuinely fine) and Preston's at 171.7 m (genuinely missing). Zero grid
  false-positives. The honest +1 is real signal, not a tuning artifact.
- **The finding that reframes the topological half of the campaign:** the brief assumed the loop &
  cul-de-sac "Places" are *uncaught topological defects*. **They are mostly not defects at all** —
  the weld already closes the loops, and the caps mostly render. The curated label on the "Places"
  marks **hand-authoring of a free cap/loop choice**, not a pipeline error the suite must defeat.
  The genuine remaining topological gap is the **junction-band family** (Carroll/Hickory/Grattan),
  not the Places. Recall climbs by building **that** invariant, not by widening these two.

Every flag remains a **candidate for the operator's eye**, never a verdict (proxy renders mislead
on this map — and indeed, the proxy "the Places are broken" was wrong; the operator's eye, and the
tip-by-tip check, show 5 of 6 render fine).
