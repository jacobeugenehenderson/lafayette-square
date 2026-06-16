# HANDOFF — Construct the JUNCTION; DERIVE the median (and the simple faces)

> ⭐⭐ **UPDATE 2026-06-16 — the MEDIAN half is RETRACTED. The median is DERIVED, not constructed.** The whole "construct a generic median polygon" thesis (the old title, the old §THE DOCTRINE, all of HALF B) is **superseded.** A divided median is the **walked face `extractFaces` already produces between the two carriageways**, painted by the Section open-field flooded remainder (`luRemainder` → `median` class via a frozen `isMedian` flag); it falls out for free once the carriageway widths are `surveyHW/2` per side (the landed `3a` widths). **LANDED + eye-confirmed in Section** (a clean continuous strip on South Jefferson; Lafayette correctly no median). Design + mechanics: **`RIBBONS §1` + §3.5.** What REMAINS open is **HALF A only — the JUNCTION / intersection-everywhere** (and the median's clean *termination at* that constructed junction). Read this doc for HALF A; treat all HALF B / median-construction content below as the historical record of the detour.

**Status: HALF B (median) DONE-by-derivation; HALF A (junction) SCOPED. Branch `curb-offset-draw`.** ⛔ **ROUTE FIRST** (per `CLAUDE.md`): read `ORIENTATION.md` → `README §⭐ START HERE` → this in full → `RIBBONS.md §1` (the doctrine block at the top — this campaign's charter) → `cartograph/OSM2STREETS-GROUNDING.md` IN FULL (the standard method + §4 recommendations — the spine for HALF A) → `POLYGON-FIRST.md` → `SKELETON.md §5b/§5e/§5f` → `BACKLOG.md`. The EYE is the gate (`feedback_proxy_render_is_not_the_operator_eye`).

---

## ⭐ THE DOCTRINE (banked `RIBBONS.md §1`, CORRECTED 2026-06-16)

**Construct the JUNCTION positively; DERIVE the simple block faces AND the divided median.** The original doctrine said "construct the hard polygons (junction + median)." The median half proved **wrong**: the median needle/`d`-bulge was a **WIDTHS** bug (carriageway asphalt overrunning the gap), not a missing polygon. Once each carriageway is `surveyHW/2` per side, the median is just the **walked face between the carriageways** — its grass the ordinary `luRemainder` (the same derivation as any simple block). **Construction is the last resort, after the derivation is verified correct** (both recent hard cases — the junction-curb bump and the median — dissolved by fixing the *derivation*, not by constructing). The **junction** alone is still an open construct question (HALF A).

**The unification (CORRECTED — the median was never a construct problem):**
| symptom (eye) | true mechanism | resolution |
|---|---|---|
| junction-curb bumps · 4-way sliver corners · width-step scallops | emergent junction tile — no constructed intersection polygon | **HALF A — construct (OPEN)** |
| ~~median needles/slivers · the divided "d" bulge~~ | **carriageway WIDTH overrun** (not a missing polygon) | **WIDTHS fix `3a` + walked-face median — DONE** |
| divided-transition jaggedness | messy node geometry the median runs into | **the median's clean termination at the constructed junction → HALF A** |

The concentric-ribbon FILL (`sectionPass`) is **sound** — and it already paints the median (open-field flood). HALF A builds the one remaining hard polygon: the junction.

---

## ⭐ STATUS (2026-06-16 — the median is DONE by derivation)
- **HALF B WIDTHS — LANDED `8fd3485` (pushed):** divided carriageways carry SYMMETRIC widths from the **raw survey** (`survey[name].pavementHalfWidth/2` per side; `correctedSurvey`'s lamp correction mis-fires on divided roads). `median = chainGap − surveyHW`: Lafayette ~0 (no median), South Jefferson a real strip, Park ~4 m, Chouteau none. **Bonus: `iA` self-int 14→0.**
- **THE MEDIAN — DONE as a WALKED FACE (not constructed; UNCOMMITTED, eye-confirmed in Section).** The median is the block face `extractFaces` produces between the two carriageways; `tileGround.js` face-reads `isMedianTile` (a tile bounded by BOTH carriageways of one pair) and paints its `luRemainder` to the `median` class via a frozen `isMedian` flag; `derive.js` **deleted** the chain-to-chain median stamp ring (kept `noseRecs` + corridor merge asphalt). Re-baked `shape.json`; Section shows a clean continuous strip on South Jefferson, no median on Lafayette. ⭐ **Both prior median constructions are dead ends, preserved only as the record:** Cambour III's **inset** collapsed the nose to a teardrop (`scratch/MEDIAN-POLYGON-SPEC-2026-06-15.md`, banner-superseded), and the survey-based stamp ring (HALF B below) was the detour the walked face replaced. **Mechanics: `RIBBONS §3.5`.** ⚠️ Open follow-ons: nose **rounding** (use the same cap/fillet strategy as every tile end); the merge-asphalt may be deletable if the carriageway strokes cover it; per-block authored widths for the truly-variable divided roads (Park, Mississippi, Missouri); the `shape.json` cache-buster bug (Section serves a stale file when `freezeTag=0` after a CLI bake — durable fix proposed, not done); commit the work.
- **The median's clean TERMINATION at the node is the only median concern left → HALF A** (built together with the constructed junction).

## HALF A — Intersection-everywhere + the MEDIAN-AT-JUNCTION (construct the junction polygon at EVERY node)

**The goal (the `OSM2STREETS-GROUNDING §4` recommendation #2):** promote E3 from a *censused ~86 nodes* to the standard's invariant — **every junction node gets a constructed intersection polygon**; roads are **trimmed back** to it; corners assembled by **clockwise adjacency**. The node neighborhood is *replaced by construction*, so a butt-cap meeting a flank, a width-step scallop, a stub fillet **cannot be expressed** (`OSM2STREETS-GROUNDING §2`, "the defining divergence"; §3.2).

**What exists (reuse — "the standard algorithm in disguise"):** E3.1 junction map · E3.2 de-taper (= trim distance) · E3.3 corner identity (= corner-pair assembly) · intersection-everywhere `9c275ce` (corners by leg-adjacency). ⚠️ **code-landed, NOT eye-confirmed** (`BACKLOG:108`), and at ~86 nodes, not every node.

**The deltas to close (both in the standard's favor, `OSM2STREETS §3.2`):**
- **Coverage:** construct at *every* node (pre-empt the next artifact class, don't census it after it bites).
- **Trim derivation:** by **edge-collision** (any two legs, any angle — generalizes to plain Ts + skew crossings) instead of median-nose stations (divided-only). A leg fully consumed by trim is **absorbed into the node** (`internal_junction_road` — the general form of the §5e stub cure).
- **Port `innerSign` as face-adjacency** (which half-edge bounds the median face), not a perpendicular vote — kills the E3.4 foot-vote bug class by construction.
- **⭐ The median's TERMINATION at the node (the one median concern HALF A still owns).** The median itself is now a **derived walked face** (done — §STATUS); what HALF A must give it is a **clean termination at the constructed junction**. Today the corridor **merge asphalt** (the kept `derive.js` patches: crossing windows + nose tapers) fills the nose-to-node region and the median's `luRemainder` simply ends where the carriageway asphalt closes the gap — which works, but the nose **tapers to a point** rather than rounding. The HALF A fix: the intersection construction owns the node neighborhood and the median's nose **rounds with the same cap/fillet strategy as every tile end** (no bespoke median nose-trim — that was the inset's teardrop trap). When HALF A lands, re-check whether the merge-asphalt patches are still needed or the constructed junction covers the nose-to-node directly.
- **Lands in PREBAKE** (`PREBAKE.md §5`): the intersection records become frozen facts of the polygon substrate (the Wall moves earlier).

---

## The scoreboard — detectors (RED-until-true, the kit invariant; `scratch/correctness-detector.mjs`)

- **`curb-bump`** (built) — >20° turn between <3 m curve-samples on `iA` (the junction symptom). The HALF-A scoreboard → drive to zero.
- **`through-width`** (built) — a `continuesAs` road carries one `pavementHW` per side.
- **`junction-band`** (built) — throat slivers at degree≥3 nodes (the HALF-A scoreboard).
- ⚠️ **`divided-median`** (built, MIS-FLAGGING) — it was the HALF-B width-overrun scoreboard, but with the median now a derived face it **false-flags correct no-median roads** (Russell, Lafayette) as defects. **Re-purpose or retire** — the width-overrun is no longer the failure mode (the median falls out of the widths).

Each fix must turn a RED invariant GREEN *generally* (the class, never the street — `SKELETON §6`).

---

## Scope & safety / what's LOCKED
- **LOCKED:** the two-carriageway model (NO merge-to-spine — osm2streets' merge is experimental/incomplete and we *want* two carriageways); the concentric-ribbon FILL (`sectionPass`); custom > OSM > AASHTO widths.
- **NOT this campaign (separate layers, future):** pedestrian refuge islands → a **footway layer** (`footway=traffic_island ×16` / `crossing:island=yes ×31`, already in our data on the highway ways); signal hardware → **instanced assets** (`highway=traffic_signals`/`crossing=traffic_signals ×49`). ⚠️ Placing signal assets by data needs **OSM node-tag ingestion** — our `osm.json` is **ways-only** today (also why data-derived dead-end caps aren't available → the cap selector stays). A node-tag intake pass is the prerequisite for both.
- **Grid-safe by construction:** a simple block face is unchanged (it already derives correctly); only junction tiles get constructed (the median is derived).
- **Rebuild-gated** (re-run `derive.js` → `ribbons.json` → re-freeze `shape.json`) — Jacob's go; the eye is the acceptance gate at every step.

## Dependency order (HALF A only — the median is done)
1. **Intersection-everywhere** — trim-back + intersection polygon at every node + edge-collision trim + face-adjacency `innerSign`, frozen in prebake. (Clears the junction-bump/sliver class.)
2. **The median's clean termination** at the constructed junction (nose rounds with the standard cap/fillet) — built *with* the junction, and re-check the merge-asphalt patches then.
3. **Bring divided + loops into curve-fit v2** (paired/closed beziers, `HANDOFF-curve-primitive-skeleton.md`) — so divided junctions are smooth, not just correct. Gated on A being eye-stable.

## Forensic basis (read these; do not re-derive)
- `cartograph/OSM2STREETS-GROUNDING.md` (Macadam) — the standard method + §4 recommendations. **The spine** for HALF A.
- The just-resolved junction-curb bump (`HANDOFF-curve-primitive-skeleton.md`) AND the divided median (`RIBBONS §1` + §3.5) — **both proofs that fixing the derivation at the source clears the symptom**, no construction needed (the lesson that narrowed this campaign).
- `cartograph/_archive/JUNCTION-CURE-PLAN.md` + `_archive/TRUMAN-FORENSICS.md` — the prior junction/divided forensics.

---
*Drafted 2026-06-15 (Mitre); CORRECTED 2026-06-16 (the median half retracted — derived, not constructed). The remaining realization holds for the JUNCTION: it is the one hard polygon the standard constructs and we still don't. Construct the junction; derive everything else.*
