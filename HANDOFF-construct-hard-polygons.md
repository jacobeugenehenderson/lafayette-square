# HANDOFF — Construct the hard polygons (the intersection + the median), don't derive them

**Status: SCOPED, ready to design (2026-06-15, Mitre). Branch `curb-offset-draw`.** The campaign that closes the last open SHAPE bug family. ⛔ **ROUTE FIRST** (per `CLAUDE.md`): read `ORIENTATION.md` → `README §⭐ START HERE` → this in full → `RIBBONS.md §1` (the doctrine block at the top — this campaign's charter) → `cartograph/OSM2STREETS-GROUNDING.md` IN FULL (the standard method + §4 recommendations — this is the spine) → `POLYGON-FIRST.md` → `SKELETON.md §5b/§5e/§5f` → `BACKLOG.md` (E1–E3 state, task 4, item 2b). The EYE is the gate (`feedback_proxy_render_is_not_the_operator_eye`).

---

## ⭐ THE DOCTRINE (banked `RIBBONS.md §1`)

**Construct the hard polygons positively; derive only the simple block faces.** A tile bounded by ordinary street legs derives correctly (centerline → concentric offset → ribbon). The **junction** and the **divided median** do NOT — left to emerge from the face-walk they produce the whole open bug family. **Supersedes `"the IX is never constructed"`** (`tileGround.js:26`): that emergent posture *is* the bug.

**The unification (one root, three faces):**
| symptom (eye) | mechanism | half |
|---|---|---|
| junction-curb bumps · 4-way sliver corners · width-step scallops | emergent junction tile — no constructed intersection polygon | **A. Intersection** |
| median needles/slivers · the divided "d" bulge | emergent median face — eaten by carriageway asphalt overrun | **B. Median** |
| divided-transition jaggedness | tiles inheriting messy node geometry + divided never got curve-fit | both |

The concentric-ribbon FILL (`sectionPass`) is **sound** — it just needs **correct polygons to build against.** This campaign builds them.

---

## ⭐ STATUS (2026-06-15, end of the divided/median arc)
- **HALF B WIDTHS — LANDED `8fd3485` (pushed):** divided carriageways carry SYMMETRIC widths from the **raw survey** (`survey[name].pavementHalfWidth/2` per side; `correctedSurvey`'s lamp correction mis-fires on divided roads). The median **AREA** is correct — `median = chainGap − surveyHW`: Lafayette ~0 (no median, eye-confirmed), South Jefferson a real strip, Park ~4 m, Chouteau none. **Bonus: `iA` self-int 14→0.** The asphalt-edge handle stays the per-road override.
- **THE MEDIAN POLYGON → FOLDED INTO HALF A (Jacob's call, eye-driven).** Cambour III's **inset** (`stamp` ring inset inboard by `surveyHW/2` → the inner-edge "virtual tile") was **tried + REVERTED**: it makes the median *body* the right inner-edge width, but the **nose collapses to a teardrop at every junction** — the nose-trim ends the median at *centerline*-gap 2 m, then the inset (−4.6 m/side) collapses that to a point. The teardrop is the symptom of **the median and the intersection not being constructed together.** Specs preserved: `scratch/HALF-B-SPEC-survey-2026-06-15.md`, `scratch/MEDIAN-POLYGON-SPEC-2026-06-15.md`. **The median terminating cleanly at a constructed junction is a HALF A deliverable** (below) — not a HALF B nose patch.

## HALF A — Intersection-everywhere + the MEDIAN-AT-JUNCTION (construct the junction polygon at EVERY node)

**The goal (the `OSM2STREETS-GROUNDING §4` recommendation #2):** promote E3 from a *censused ~86 nodes* to the standard's invariant — **every junction node gets a constructed intersection polygon**; roads are **trimmed back** to it; corners assembled by **clockwise adjacency**. The node neighborhood is *replaced by construction*, so a butt-cap meeting a flank, a width-step scallop, a stub fillet **cannot be expressed** (`OSM2STREETS-GROUNDING §2`, "the defining divergence"; §3.2).

**What exists (reuse — "the standard algorithm in disguise"):** E3.1 junction map · E3.2 de-taper (= trim distance) · E3.3 corner identity (= corner-pair assembly) · intersection-everywhere `9c275ce` (corners by leg-adjacency). ⚠️ **code-landed, NOT eye-confirmed** (`BACKLOG:108`), and at ~86 nodes, not every node.

**The deltas to close (both in the standard's favor, `OSM2STREETS §3.2`):**
- **Coverage:** construct at *every* node (pre-empt the next artifact class, don't census it after it bites).
- **Trim derivation:** by **edge-collision** (any two legs, any angle — generalizes to plain Ts + skew crossings) instead of median-nose stations (divided-only). A leg fully consumed by trim is **absorbed into the node** (`internal_junction_road` — the general form of the §5e stub cure).
- **Port `innerSign` as face-adjacency** (which half-edge bounds the median face), not a perpendicular vote — kills the E3.4 foot-vote bug class by construction.
- **⭐ The MEDIAN-AT-JUNCTION (folded in from HALF B, 2026-06-15).** A divided median must **terminate at the constructed junction polygon with a clean blunt nose**, and the nose-to-node region is **merge asphalt** (the carriageways have merged) — built *together* with the intersection, not as a separate median nose-trim. The HALF B inset proved that patching the median nose alone collapses it to a teardrop, because the median end is trimmed for the centerline gap while the median body is the inner-edge width. The fix: the intersection construction owns the node neighborhood; the median (inner-edge width, `chainGap − surveyHW`, the validated `3a` widths) runs *into* it and is trimmed where the **inner-edge** gap (not the centerline gap) reaches the nose width. Specs: `scratch/MEDIAN-POLYGON-SPEC-2026-06-15.md` (the inset construction — reuse the body, fix the nose at the junction).
- **Lands in PREBAKE** (`PREBAKE.md §5`): the intersection records become frozen facts of the polygon substrate (the Wall moves earlier).

---

## HALF B — Constructed generic median (positive, symmetric, reliable)

**The decision (the median deep-research, 2026-06-15, verified — abandon real-shape fidelity):** no production system derives a faithful median; A/B Street calls it a known limitation; importing polygons is a **coverage trap** (~70% areal overlap, de-facto tags). So **construct a generic symmetric median positively** as the default; polygon import is opt-in-where-available only. *Forensic root: `Verge` (`scratch/verge-*.mjs`) — the needle is `pavementHW_A + pavementHW_B > chainGap` → the two carriageways' asphalt overruns and annihilates a HEALTHY median ring (all 39 frozen rings are fine; the render eats them).*

**The construction:**
- **Median width = the carriageway gap** (`chainGap`) minus the carriageway half-widths; **fixed per-road-class default** where the gap is degenerate/missing.
- **Clamp each carriageway's inboard `pavementHW` to the median edge** (`effectiveMeasure`, `tileGround.js:654-661` — today it zeros inboard treelawn/sidewalk but leaves `pavementHW` untouched) so it **can't overrun** — guaranteeing a minimum median width. *This is the needle fix.*
- **Paint the median POSITIVELY** from its own ring (a filled face), not the subtractive `luRemainder ∩ med` (`:1157`) that gets eaten — so a thin median can never be annihilated by asphalt rounding.
- **The width datum at the SOURCE:** the inboard carriageway must carry *its own* width, not the whole road's (Lafayette `lanes:1` is stamped at the full ~21 m road's 10.56 m half-width). Fix in the skeleton/prebake width model (split-the-survey-width or lanes×lane-width), **rebuild-gated**.

> ⭐ **IMPLEMENTATION SPEC (current): `scratch/HALF-B-SPEC-survey-2026-06-15.md` (Cambour II) — median = WHAT'S LEFT after the surveyed pavement.** The earlier frame-only spec (clamp + positive reservation) was **REVERTED `21a1d2d`** — it painted the full centerline-to-centerline gap → a too-big / PHANTOM median where the lanes fill the gap (Lafayette: ~6 lanes, no physical median — Jacob's eye). **THE FORMULA (derived + validated on all 5 roads): `median = chainGap − pHW`** (floored at 0), pHW = survey `pavementHalfWidth`. Lafayette 11.5−9.35 ≈ 0 → **no median** ✓; South Jefferson 14−9.16 ≈ 4.9 m → **real strip** ✓; Park ~4 m; Chouteau/Geyer ~0. **Rebuild-gated, all in `derive.js`:** (3a) `innerEdgeAssign:3427` — each carriageway `pavementHW = pHW/2` inboard + `pHW/2` outboard (side via the shared geometric oracle, NOT `innerSign`); (3b) `stamp:3312` — build the median ring **inner-edge-to-inner-edge** (offset each chain inboard by `pHW/2`), floored → emit NO median where it collapses (carriageways abut as a normal road). ⭐ **LOAD-BEARING:** the `innerSign` side-key is unreliable (zeros the OUTBOARD side) → the geometric `inboardSideOf` oracle (now in `tileGround.js:666`) is the SSoT, mirror it into `derive.js` + the detector. **Gate:** detector `divided-median`→0 + Jacob's eye (Lafayette = normal road / no median; S Jefferson = real strip). ⚠️ Verify the I-44 "Officer David Haynes" motorway pair's seed-pHW reference frame separately (may need `−2·pHW`; grade-separated, outside the 5-case set). Chouteau's residual jaggedness is HALF A.

---

## The scoreboard — detectors (RED-until-true, the kit invariant; `scratch/correctness-detector.mjs`)

- **`curb-bump`** (built) — >20° turn between <3 m curve-samples on `iA` (the junction symptom). 20 bumps / 9 tiles remain, all on divided/junction sites → drive to zero.
- **`through-width`** (built) — a `continuesAs` road carries one `pavementHW` per side.
- **median-health (`width-overrun`)** (Verge — to wire): `pavementHW_A + pavementHW_B > chainGap − minMedian` (flags exactly the 8 overrun pairs) + asphalt-coverage-of-median + chainGap sanity. **Pure frame arithmetic — no rebuild.** Wire FIRST as the Half-B scoreboard.
- **`junction-band`** (built) — throat slivers at degree≥3 nodes (the Half-A scoreboard).

Each fix must turn a RED invariant GREEN *generally* (the class, never the street — `SKELETON §6`).

---

## Scope & safety / what's LOCKED
- **LOCKED:** the two-carriageway model (NO merge-to-spine — osm2streets' merge is experimental/incomplete and we *want* two carriageways); the concentric-ribbon FILL (`sectionPass`); custom > OSM > AASHTO widths.
- **NOT this campaign (separate layers, future):** pedestrian refuge islands → a **footway layer** (`footway=traffic_island ×16` / `crossing:island=yes ×31`, already in our data on the highway ways); signal hardware → **instanced assets** (`highway=traffic_signals`/`crossing=traffic_signals ×49`). ⚠️ Placing signal assets by data needs **OSM node-tag ingestion** — our `osm.json` is **ways-only** today (also why data-derived dead-end caps aren't available → the cap selector stays). A node-tag intake pass is the prerequisite for both.
- **Grid-safe by construction:** a simple block face is unchanged (it already derives correctly); only junction + median tiles get constructed.
- **Rebuild-gated** (re-run `derive.js` → `ribbons.json` → re-freeze `shape.json`) — Jacob's go; the eye is the acceptance gate at every step.

## Dependency order
1. **Wire the median-health detector** (frame-only, no rebuild) — the Half-B scoreboard, immediately.
2. **Half-B median** — the inboard-width clamp + positive median paint + the source width datum fix. (Smaller, self-contained, clears the needle/`d`-bulge class.)
3. **Half-A intersection-everywhere** — trim-back + intersection polygon at every node + edge-collision trim + face-adjacency `innerSign`, frozen in prebake. (The larger lift; clears the junction-bump/sliver class.)
4. **Bring divided + loops into curve-fit v2** (paired/closed beziers, `HANDOFF-curve-primitive-skeleton.md`) — so divided junctions are smooth, not just correct. Gated on A+B being eye-stable.

Half B and Half A can proceed somewhat independently (different tiles), but the median-edge clamp (B) and the intersection trim-back (A) meet at divided-road junctions — design the divided-transition node as a case where both apply.

## Forensic basis (read these; do not re-derive)
- `cartograph/OSM2STREETS-GROUNDING.md` (Macadam) — the standard method + §4 recommendations. **The spine.**
- The median deep-research (2026-06-15) — construct-generic verdict; banked in `RIBBONS §1` + this brief.
- `Verge` median forensic (`scratch/verge-*.mjs`) — the width-overrun root, per-site, with numbers.
- `Theodolite` toolkit forensic — the anchor tool is already auto-derived (demote to override once detection is eye-trusted); the data-first divided detector landed (`870a1fd`).
- `cartograph/_archive/JUNCTION-CURE-PLAN.md` + `_archive/TRUMAN-FORENSICS.md` — the prior junction/divided forensics.
- The just-resolved junction-curb bump (`HANDOFF-curve-primitive-skeleton.md`) — the proof that fixing the polygon at the source clears the Section symptom downstream (the SHAPE-ahead-of-the-Wall doctrine, `SKELETON §3.5`).

---
*Drafted 2026-06-15 (Mitre) on Jacob's word — "make that the doctrine and scope the construction campaign." The realization: medians, junctions, and divided transitions are one root — emergent polygons where the standard constructs. Construct the hard polygons; derive only the simple faces.*
