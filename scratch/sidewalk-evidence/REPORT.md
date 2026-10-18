# Sidewalk / crossing / kerb evidence census: five towns (2026-10-18, read-only)

▶ `node --max-old-space-size=4000 scratch/sidewalk-evidence/census.mjs <scene>` writes `scratch/sidewalk-evidence/out/<scene>.json`.
Inputs: `cartograph/data/<scene>/{neighborhood_boundary.json, raw/osm.json, raw/osm_kerbs.json, clean/skeleton.json}`, plus Loess's
`scratch/ground-budget/corner-style/out/<scene>.json` (37c3201b, run 2026-10-17). Disc = `neighborhood_boundary.json` center + radius;
a segment counts if its midpoint is inside. "Road" = `curb-cut-evidence.mjs#ROAD`. "Non-service" excludes `highway=service` and still includes motorways and links.

## What existed already (reused, not rebuilt)
- **`cartograph/curb-cut-evidence.mjs`** has two functions. `buildCurbCutEvidence` binds `osm_kerbs.json` nodes to `footway=crossing` ways by node identity, and each crossing to its road by the one shared interior vertex. `buildCrosswalkEvidence` gives each crossing two rays from the road node. Both count unbound items by cause. `derive.js` prints these as `[curb cuts]` / `[crosswalks]`. No proximity is used. The header records Boz's ruling (2026-10-06): a crossing gives the crosswalk's **station, never the cut's style**.
- **`cartograph/curb-cut-norm.mjs`** is the ladder: operator → evidence → town `norms.json` → state → kit `none`. It **measures nothing**.
- **Loess's `corner-style/probe.mjs`** builds the kit's own landing (`buildProto`) with authoring loaded. For each junction corner it makes two reads:
  - KERB: `tileGround#styleFromEvidence` on the landed kerb drops (mid third only = diagonal; both outer thirds = perpendicular).
  - XWALK: crossing ends on the arc's mid third mean diagonal; ends on an outer third or `nearTangent` mean perpendicular.
  - `summary.mjs` crosses the two reads. **Question 3 is already answered there.** Below I only re-count those rows by number of crossings.
- `skeleton.js#chainSidewalkDistances`: centreline → parallel `footway=sidewalk` distance, consumed only by `stampCustomWidths` (survey, LS). It is not exported. Q4 below mirrors its gates.

## 1. Sidewalk coverage and road-way tags
| town | disc R (m) | non-service road CL, OSM (km) | same, skeleton (km) | footway=sidewalk (km, ways) | sidewalk ÷ (2 × road CL) |
|---|---|---|---|---|---|
| lafayette-square | 892 | 42.5 | 42.4 | 45.4 (552) | 53.4% |
| hipointedemun | 1389 | 68.9 | 68.9 | 67.0 (672) | 48.7% |
| provincetown | 5290 | 70.2 | 70.0 | 7.7 (115) | 5.5% |
| huron | 3539 | 118.6 | 117.9 | 15.4 (134) | 6.5% |
| jacksonheights | 1687 | 174.0 | 173.8 | 258.7 (2451) | 74.4% |

| town | non-service road ways | with any `sidewalk*` tag | share of road length | `sidewalk=` values | `sidewalk:<side>=` values | `kerb*` on road ways | `kerb*` on footways |
|---|---|---|---|---|---|---|---|
| lafayette-square | 294 | 18 (6.1%) | 3.9% | left 1, both 2 | left=no 12, right=separate 12, both=separate 3 | 0 | crossing:kerb=lowered 2 |
| hipointedemun | 426 | 76 (17.8%) | 16.4% | separate 4, both 2 (+ service:no 27) | both=separate 35, right=separate 24, left=no 19, left=separate 12, right=no 8 | 0 | crossing:kerb=lowered 6, sidewalk:kerb=lowered 1 |
| provincetown | 343 | 10 (2.9%) | 3.0% | no 7 | both=separate 3 | 0 | 0 |
| huron | 457 | 7 (1.5%) | 1.4% | — | both=separate 4, right=separate 3, left=no 2, left=separate 1, right=no 1 | 0 | 0 |
| jacksonheights | 1081 | 421 (38.9%) | 48.2% | both 42, right 3, no 1 | both=separate 269, right=separate 88, left=no 87, both=yes 9, both=no 6, (+surface 8, left=separate 3, right=no 2) | 0 | 0 |

## 2. Crossings and kerb nodes
In-disc counts:
| town | footway=crossing ways | `crossing=` on those ways | highway=crossing nodes (`crossing=`) | kerb nodes | `kerb=` |
|---|---|---|---|---|---|
| lafayette-square | 332 | unmarked 215, uncontrolled 65, traffic_signals 39, marked 10, zebra 3 | **not in raw** (osm.json has no `pois`) | 454 | lowered 373, flush 45, raised 36 |
| hipointedemun | 345 | unmarked 133, uncontrolled 89, marked 67, traffic_signals 48, none 7, zebra 1 | **not in raw** | 434 | flush 240, lowered 163, raised 24, no 5, yes 2 |
| provincetown | 140 | uncontrolled 108, unmarked 15, none 10, signals 4, marked 2, zebra 1 | 201 (uncontrolled 120, unmarked 22, zebra 19, none 18, signals 10, marked 7, zebra;uncontrolled 5) | 23 | lowered 11, raised 6, flush 5, no 1 |
| huron | 92 | uncontrolled 74, unmarked 13, signals 5 | 106 (uncontrolled 69, none 17, marked 8, unmarked 8, signals 2, marked;uncontrolled 2) | 21 | flush 14, lowered 7 |
| jacksonheights | 1996 | signals 1233, marked 332, uncontrolled 322, unmarked 107, zebra 2 | 2198 (signals 1331, uncontrolled 509, marked 133, none 111, unmarked 110, zebra 4) | 3661 | **unspecified 2264**, lowered 1284, flush 86, yes 21, raised 6 |

The kit's own identity binding (`buildCurbCutEvidence` / `buildCrosswalkEvidence`), run here over the **whole fetch bbox**, not the disc:
| town | kerb nodes | → records | unbound: notOnCrossing / notOneRoadNode / positionNotRecorded / roadNotInSkeleton | crossings | → records | unbound: notOneRoadNode / roadNotInSkeleton |
|---|---|---|---|---|---|---|
| lafayette-square | 741 | 646 | 62 / 128 / 0 / 62 | 674 | 517 | 96 / 61 |
| hipointedemun | 1286 | 819 | 252 / 146 / 21 / 113 | 1962 | 1380 | 237 / 345 |
| provincetown | 23 | 11 | 6 / 0 / 6 / 0 | 141 | 103 | 13 / 25 |
| huron | 21 | 7 | 0 / 6 / 0 / 8 | 92 | 73 | 7 / 12 |
| jacksonheights | 7530 | 7113 | 133 / 292 / 17 / 15 | 4477 | 4251 | 201 / 25 |

The landing onto junction corners (Loess's run) is in §3. Crossing ends that land on a leg away from any arc: LS 56 · HPDM 154 · PT 25 · Huron 16 · JH 143.

## 3. Corner style from the data (Loess's run, re-counted)
These are Loess's per-corner reads (`tally`), with the kit's landing:
| town | junction corners | town norm | KERB coverage | perp | diag | none | unreadable | **KERB decides (perp+diag)** | XWALK perp / diag / mixed | both decided | agree / disagree | both-decided corners whose kerb drops lie on a crossing that also landed there |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lafayette-square | 558 | diagonal | 212 (38.0%) | 6 | 78 | 9 | 119 | **84 (15.1%)** | 185 / 101 / 47 | 73 | 73 / 0 | 71 / 73 |
| hipointedemun | 791 | none | 130 (16.4%) | 6 | 41 | 2 | 81 | **47 (5.9%)** | 223 / 75 / 29 | 41 | 41 / 0 | 41 / 41 |
| provincetown | 594 | none | 6 (1.0%) | 0 | 4 | 0 | 2 | **4 (0.7%)** | 19 / 31 / 4 | 3 | 3 / 0 | 3 / 3 |
| huron | 937 | perpendicular | 4 (0.4%) | 0 | 1 | 0 | 3 | **1 (0.1%)** | 103 / 6 / 0 | 1 | 1 / 0 | 1 / 1 |
| jacksonheights | 2640 | none | 1725 (65.3%) | 109 | 134 | 0 | 1482 | **243 (9.2%)** | 1399 / 313 / 535 | 190 | 190 / 0 | 186 / 190 |

From Loess's `summary.txt`: JH's 1482 kerb-unreadable corners include 1122 with a kind not on the list (`unspecified` 1661 nodes, `yes` 30). When the kerb read is decided, the crosswalk read never contradicts it in any town. When the kerb read is unreadable, the crosswalk read splits (JH 803 perp / 211 diag / 457 mixed).

The same rows re-counted by **number of distinct crossings landing on the corner**, which is the brief's "two on the legs vs one at the apex":
| town | corners | 0 crossings | ≥2, all outer/tangent | …of which ends on **both** outer thirds (two legs shown) | 1, mid-arc (apex) | 1, outer/tangent (one leg) | ≥2, all mid-arc | ≥2, mixed |
|---|---|---|---|---|---|---|---|---|
| lafayette-square | 558 | 225 (40.3%) | 35 (6.3%) | 12 (2.2%) | 71 (12.7%) | 150 | 30 | 47 |
| hipointedemun | 791 | 464 (58.7%) | 39 (4.9%) | 10 (1.3%) | 70 (8.8%) | 184 | 5 | 29 |
| provincetown | 594 | 540 (90.9%) | 1 (0.2%) | 0 | 30 (5.1%) | 18 | 1 | 4 |
| huron | 937 | 828 (88.4%) | 31 (3.3%) | 26 (2.8%) | 6 (0.6%) | 72 | 0 | 0 |
| jacksonheights | 2640 | 393 (14.9%) | 721 (27.3%) | 307 (11.6%) | 179 (6.8%) | 678 | 134 | 535 |

A `nearTangent` end carries no lo/hi third, so "two legs shown" is a lower bound on two-leg corners.

## 4. Treelawn vs sidewalk-at-kerb (⚠ CENSUS-ONLY proximity approximation)
Method:
- Taken per skeleton chain edge ≥ 10 m (non-service, not grade-separated, in disc), per side.
- The value is the nearest `footway=sidewalk` way passing `chainSidewalkDistances`' own gates: |cos| ≥ 0.85, along ≤ len/2 + 10, 2 < d < 20 m. It is kept per edge, not as a per-chain min.
- gap = d − (that side's poured `seed` pavementHW + curb). This is a distance to the OSM footway line, not to the back of the walk.

| town | edge-sides with a sidewalk found | pavementHW source | gap (m) histogram: <0 · 0–0.5 · 0.5–1 · 1–1.5 · 1.5–2 · 2–2.5 · 2.5–3 · 3–4 · 4–6 · ≥6 | gap quartiles (m) |
|---|---|---|---|---|
| lafayette-square | 377 / 926 (40.7%) | survey 353 · standard 21 · class seed 3 | 10 · 5 · 24 · 23 · 41 · 46 · 38 · 44 · 47 · 99 | 1.91 / 3.04 / 6.18 |
| hipointedemun | 392 / 2106 (18.6%) | class seed 392 | 37 · 10 · 10 · 24 · 29 · 27 · 35 · 39 · 61 · 120 | 1.82 / 3.44 / 6.61 |
| provincetown | 121 / 2356 (5.1%) | class seed 121 | 59 · 13 · 3 · 2 · 7 · 8 · 4 · 3 · 7 · 15 | −0.70 / 0.01 / 2.29 |
| huron | 115 / 2828 (4.1%) | class seed 115 | 4 · 3 · 0 · 2 · 1 · 7 · 12 · 51 · 18 · 17 | 3.00 / 3.58 / 4.37 |
| jacksonheights | 2504 / 3678 (68.1%) | class seed 2504 | 32 · 30 · 65 · 106 · 169 · 375 · 408 · 422 · 451 · 446 | 2.34 / 3.10 / 5.00 |

Outside LS the gap is measured against the class-seeded (lanes-guessed) pavement half-width, so it carries that guess's error.

## Measured vs not
**Measured:**
- Sidewalk-way length vs road length; road-way `sidewalk*` and `kerb*` tags. No road way in any town carries a `kerb*` tag.
- Crossing ways and nodes and their tags; kerb nodes by kind; the kit's identity-binding census.
- Loess's per-corner kerb and crosswalk reads, re-counted by crossings per corner.
- In the both-decided corners, the share whose kerb drops lie on a crossing that also landed on that corner: 71/73, 41/41, 3/3, 1/1, 186/190. These kerb nodes are vertices of the same crossing ways the crosswalk read lands, so the zero-disagreement figure is not two independent sources.
- The centreline → parallel sidewalk-way distance, net of poured pavement half-width (census-only proximity).
- LS and HPDM `osm.json` carry no `pois`, so their `highway=crossing` nodes are not in the raw data. Only kerb-tagged nodes reach `osm_kerbs.json`.

**Not measured:**
- Whether a gap value means treelawn or sidewalk-at-kerb on the ground. No thresholds are applied, and nothing was checked against imagery or the operator.
- Whether the crosswalk read's "outer third / nearTangent ⇒ perpendicular" holds at a diagonal corner. Boz ruled it does not decide style (`curb-cut-evidence.mjs` header). Not tested here.
- Which leg a `nearTangent` end is on.
- Whether "the sidewalk data would have told us months ago that the corners were perpendicular". The data decides style (KERB read) on 0.1%–15.1% of junction corners per town. On LS the decided reads are 78 diagonal and 6 perpendicular. The crosswalk-only read is 185 perp / 101 diag / 47 mixed, and that read's validity is the open item above. Cause not established.
- A disc-only binding census: the kit census covers the whole bbox. Loess's outputs date from 2026-10-17 and were not re-run here.
