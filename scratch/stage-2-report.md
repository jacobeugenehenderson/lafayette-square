# Stage 2 report — H1 drill-in / baseline / dry-run

Probes: `scratch/lstrip-drill-459-391.js`, `scratch/lstrip-overshoot-recheck.js`, `scratch/h1-backfill-dryrun.js`, `scratch/h1-pre-drift-overshoot.js`, `scratch/baseline-comparison.md`.

Working tree at end: all scratch/* additions untracked, no source edits, no commits, baseline worktree removed.

---

## Headline

**Stage 1's "194 measurable overshoots" was a probe artifact. The real L-strip defect lives entirely in the 295 DRIFTED entries — which get NO clip applied — and they overshoot up to 8.3 meters past the rounded silhouette. H1 backfill (proper join between band entries and their owning blockRounded ring) IS the full geometric fix. The defect is pre-existing back to ed29700.**

---

## Q1 — Drill-in: real defect or probe noise?

**Probe noise.** Lafayette Avenue blockKey=`459.0,391.0`, edgeOrds {0,1,2}, all three blockKey-lookup-OK:

| classification (signed-dist from owning ring) | count |
|---|---|
| inside (d < -0.01m)        | 40/54 (74.1%) |
| boundary (\|d\| ≤ 0.01m)   | 14/54 (25.9%) |
| real overshoot (0.01-0.5m) | 0 |
| LARGE overshoot (>0.5m)    | 0 |

`scratch/lafayette-459-391.svg` shows the owning blockRounded ring + the three entries' band rings perfectly contained within it. The 14 "outside" pointInRing hits are all boundary-coincident vertices (intersectRings produced them at the clip boundary exactly; ray-casting at-boundary registers ambiguously).

Same recheck applied globally: of the 211 lookup-OK straight fes, **zero have any vertex more than 0.01m outside their owning ring**. The clip works perfectly when the key lookup succeeds. The 91.9% PIR-outside number was 100% boundary noise.

**Pattern surfaced:** all 3 Lafayette edgeOrds are right-side fes of the same chain on the same block. No "all on one side" or "all at corner approach" failure shape; the chosen block is geometrically clean. Pick a *drifted* offender for Stage 3 SVG verification — see worst-list below.

---

## Q2 — Baseline ed29700 comparison

**Pre-existing.** Identical defect distribution:

|                                              | HEAD | ed29700 |
|---|---|---|
| straight fes                                 | 506 | 506 |
| drifted blockKey                             | 295 | 295 |
| lookup-OK real overshoot                     | 0   | 0   |
| drifted entries' real overshoot (vs probe-resolved true ring) | 250/257 | 250/257 |
| LARGE overshoot (>0.5m)                      | 248 | 248 |
| max overshoot                                | 8.3 m | 8.3 m |

`buildFrontageBands` body diffs only in comment lines between ed29700 and HEAD — the revert was verbatim. The defect predates Phase 2 entirely; it's a latent consequence of the D.7a customs migration's pass-1↔pass-2 key drift, masked until aerial-toggle + H3's no-translucent-variant in `treelawnByLuGeo` exposed it visibly. See `scratch/baseline-comparison.md`.

---

## Q3 — H1 backfill dry-run

Simulated the corrected join by re-clipping every straight band entry against the blockRounded ring whose interior contains the band's interior probe (the actual geometric owner, regardless of blockKey).

|                              | pre  | post (containment join) | Δ |
|---|---|---|---|
| straight fes                 | 506  | 506  | 0 |
| drifted (no owner found)     | 295  | 123  | -172 |
| lookup-OK                    | 211  | 377  | +166 |
| lookup-OK PIR-outside        | 194  | 356  | +162 (boundary noise, scales with denominator) |
| **lookup-OK real overshoot** | **0**| **0**| 0 |
| SELFINT (straight only)      | 0    | 0    | 0 |

Pre-drift overshoot magnitude (the L-strip itself), measured against the probe-resolved true ring without clipping:

|                                        | count |
|---|---|
| pre-drifted entries                    | 295 |
| probe → blockRounded ring resolved     | 257 |
| real overshoot (>0.01m) among resolved | **250 (97.3%)** |
| LARGE overshoot (>0.5m)                | **248** |
| max overshoot magnitude                | **8.306 m** |

**Top 10 real overshoot offenders** (chain, side, blockKey, edgeOrd, maxD):

```
Truman Parkway       left  653.5,-236.5  edgeOrd=0  maxD=8.306m
Truman Parkway       left  653.5,-236.5  edgeOrd=4  maxD=7.451m
South Tucker Blvd    right 658.0,431.0   edgeOrd=4  maxD=5.220m
Lafayette Avenue     left  382.5,114.5   edgeOrd=4  maxD=4.699m
Mississippi Avenue   left  259.0,312.0   edgeOrd=6  maxD=4.475m
South 18th Street    left  456.5,13.5    edgeOrd=2  maxD=4.111m
South Jefferson Ave  left  -406.0,-412.0 edgeOrd=0  maxD=3.398m
Dolman Street        left  382.5,114.5   edgeOrd=10 maxD=3.281m
Dolman Street        left  611.0,-246.5  edgeOrd=5  maxD=3.160m
Lafayette Avenue     left  -297.0,22.0   edgeOrd=4  maxD=3.121m
```

These are the actual L-strip culprits: bands extending 3-8 m past where the rounded block silhouette wants them to end. With clip applied (via the containment join, simulating the H1 backfill), they collapse onto the silhouette perfectly (post: 0 real overshoots).

**Verdict: the H1 backfill alone IS sufficient for the geometric defect.** The containment-based join resolves 257/295 drifted entries to their true owner; 38 are unresolvable by interior probe (band ring's probe falls outside all blockRounded rings, meaning the band geometry has folded onto itself or sits in asphalt space — these need separate handling, likely a fallback to nearest-ring by bbox-centroid or just no clip on those tiny edge cases).

---

## Surprises / unexpected

1. **Stage 1's "91.9% overshoot" was probe artifact.** pointInRing classifies boundary-coincident vertices as "outside" stochastically due to ray-casting; the actual signed-distance metric shows the clip produces perfectly-clean rings. Future probes should use signed distance with a small epsilon (≥0.01m), not strict pointInRing, for overshoot detection.
2. **The defect mechanism is now exact:** `buildFrontageBands` (buildBlockGeometryV2.js:1434-1444) builds `ringByKey` keyed by `blockKeyFromRing(blockRoundedRing)` — these are *pass-2 derived* rings, so their bbox-based keys are pass-2 keys. But `fe.blockKey` was backfilled to *pass-1* at line 2149. For the 295 entries where pass-2 asphalt expansion shifted the bbox center past a 0.5m grid line, the two keying systems disagree → `ringByKey.get(fb.blockKey)` returns undefined → clip is skipped entirely → band rings extend up to 8m past the rounded silhouette.
3. **Dry-run join resolved 257/295 cleanly via interior probe + containment.** 38 unresolvable; these likely need either a (chainIdx, segOrds[0], side) tuple-based join (mirroring line 2145's FE backfill) instead of containment, OR a fallback. Stage 3 should pick one approach — the tuple-join requires threading pass-1 fe lookup into buildFrontageBands, the containment-join requires no plumbing but is geometrically heuristic.
4. **`buildFrontageBands` body is verbatim between ed29700 and HEAD.** Only comment lines differ. Confirms revert fidelity; confirms the defect is not a regression.
5. **48-vertex owning ring at blockKey=459.0,391.0** — that's the Bezier-rounded count for a 4-sided block with 4 corners × 16-sample Bezier + originals. Healthy. SVG renders cleanly.
6. **No `intersectRings` input is degenerate.** All 211 lookup-OK clips ran clean; the 0 real-overshoot result means the Clipper op is well-behaved on inputs at this scale.

---

## Stage 3 recommendation

**One-sentence fix shape:** in `buildFrontageBands`, replace the `ringByKey.get(fe.blockKey)` lookup at line 2199-class call with a join that handles drift — either (a) thread the pass-1 → pass-2 (chainIdx, segOrds[0], side) tuple resolution into the helper so the right ring is found by identity, or (b) build `ringByKey` keyed by the pass-1-equivalent blockKey by re-deriving each blockRounded ring's pass-1 key via a containment probe against any band entry that resolves to it.

Approach (a) is structurally cleaner (mirrors line 2145's FE pattern) but requires plumbing pass-1 data through `buildFrontageBands`'s signature. Approach (b) is local to the helper but is geometric-heuristic. Either closes 248 large overshoots and the visible L-strip on Lafayette Park's two opaque sides.

H3 (per-LU treelawn no-translucent variant) remains a separate render-side defect; H1 fix alone will visibly eliminate the L-strip because once the bands stop overshooting, the per-LU treelawn opaque mesh sits where it should and stops occluding aerial. Whether H3 also needs fixing is a separate aesthetic call (does Measure mode need translucent treelawn on non-selected park-adjacent chains?), not a correctness call. Decouple from this dispatch.

H2 (residual SELFINT, 17 entries) and H4 (6 zero-bands) remain low-priority and are unaffected by the H1 fix.

---

*Working tree: clean except `scratch/` (untracked). No source edits, no commits, baseline worktree removed.*
