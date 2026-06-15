# TRUMAN-FORENSICS — the divided-parkway knot, mapped once

> 🗄️ **ARCHIVED 2026-06-14 (doc cleanup).** Closed forensic — the divided cures landed; kept as the dated deep-dive record. **Live home: `RIBBONS.md §3.1` + `FEATURES.md §367–387`.** (Was `cartograph/TRUMAN-FORENSICS.md`.)

**Agent:** Galen (read-only forensic specialist — Vesalius/Stratum lineage). **Date:** 2026-06-03.
**Scope:** Truman Parkway, LS. **Mode:** READ-ONLY; only write = this doc.
**Sources re-derived from:** `src/data/ribbons.json`, `public/baked/lafayette-square/shape.json` (the live bake of 2026-06-03 01:02), `skeleton.js`, `derive.js`, `tileGround.js`, `useCartographStore.js`, `SurveyorPanel.jsx`. The seed findings in `HANDOFF-truman-forensics.md` were treated as leads; **two of them point at code that no longer drives the render** (see §2).

---

## Executive summary

Truman is one physical road — two carriageways, each running the full ~748m corridor between a motorway ramp (north) and South 18th Street (south). The app sees it as **8 disconnected chains**, and the median the operator wants to grab **does not exist as a single object anywhere** in the live pipeline.

The knot has **one root cause and one decoy:**

- **Root (real):** the two carriageways are each shattered into 4 fragments, and the fragments' cut-points on the two sides are **offset ~80m longitudinally**. Everything downstream — pairing gaps, lopsided medians, the island sliver, the un-grabbable median — is a *consequence* of this fragmentation+stagger, which originates in `weldChains`'s `(signature, pairKey)` gate refusing to fuse a carriageway's own colinear pieces.
- **Decoy:** the brief's "malformed `A + B.reversed` median ring" (`derive.js:2994-3010`) is **real but inert** — nothing in the live tile render consumes `ribbons.medians`. The median you actually see is an **emergent tile** built in `tileGround.js` (§2). Fixing the ring math would change nothing on screen. This is the palimpsest trap.

**8 defects** below. **6 systemic** (recur on every divided road), **2 Truman-specific manifestations** of systemic classes.

---

## §1 Topology — the 8 chains

All 8 chains are `name="Truman Parkway"`, `type=secondary`. `oneway` is **`undefined` on every one** (defect D6 — derive drops it). Lengths/points from `ribbons.json`:

| chain | pts | len | anchor | innerSign | pairId | role (re-derived) |
|------|----:|----:|--------|----:|--------|-------------------|
| `truman-parkway-0` | 4 | 230m | inner-edge | −1 | `…-4` | **carriageway-A, north paired seg** |
| `truman-parkway-6` | 2 | 74m | center | 0 | null | carriageway-A, mid spine |
| `truman-parkway-3` | 4 | 363m | inner-edge | −1 | `…-2` | **carriageway-A, south paired seg** |
| `truman-parkway-1` | 8 | 80m | center | 0 | null | carriageway-A, south spine |
| `truman-parkway-2` | 10 | 361m | inner-edge | +1 | `…-3` | **carriageway-B, south paired seg** |
| `truman-parkway-5` | 2 | 71m | center | 0 | null | carriageway-B, mid spine |
| `truman-parkway-4` | 6 | 241m | inner-edge | −1 | `…-0` | **carriageway-B, north paired seg** |
| `truman-parkway-7` | 2 | 76m | center | 0 | null | carriageway-B, north spine |

**Shared endpoint nodes** (exact 0.00m coincidences, from endpoint scan):

```
#0.T = #6.H  [589, 55]      #1.H = #3.T  [701,-367]
#2.T = #5.H  [616,-100]      #3.H = #6.T  [607, -16]
#4.H = #5.T  [598, -31]      #4.T = #7.H  [549, 205]
```

These weld the fragments into **two continuous geometric strands**:

- **Strand A (east):** `#0 → #6 → #3 → #1`  →  [550,282] … [705,−447], ~747m, end-to-end, all tail-to-head, all same heading.
- **Strand B (west):** `#2 → #5 → #4 → #7`  →  [691,−450] … [536,280], ~749m, end-to-end.

So the geometry already says "two continuous carriageways." The pipeline does not, because:

### Why the carriageways are fragmented — `weldChains` (`skeleton.js:321-385`)

Welds are gated on **`signature` AND `pairKey` equality** (lines 340-341). That gate exists to stop cross-carriageway fusion (the Lafayette 22→1 / Park-Ave-bow bug) and it is correct *for that purpose*. But it also forbids fusing a carriageway's **own colinear continuation** when the continuation has a different signature — which is exactly Strand A: `#0` is `divided-A/pairKey-K1`, `#6` is `single-bidi/null`, `#3` is `divided-A/pairKey-K2`, `#1` is `single-bidi/null`. Three different `(signature,pairKey)` values along one straight strand ⇒ the welder leaves four pieces. `splitAtFolds` is **not** the cause here (no folds; these are clean tail-to-head joins).

**The fragmentation is structural, not accidental:** the strand's signature changes wherever pairing turns on/off, and pairing turns on/off because the two carriageways' junctions are staggered (§1.1).

### §1.1 Pairing is intermittent because the carriageways are staggered ~80m

`analyzePhases` (`skeleton.js:187-251`) pairs one-way fragments by 4 gates (anti-parallel, length-ratio, gap, **station-overlap ≥ 0.4**). Re-measured station overlap (project each side onto the corridor axis):

| candidate pair | station-overlap frac | mutual overlap | A overhang | B overhang | outcome |
|---|---:|---:|---:|---:|---|
| `#0` / `#4` (north) | **0.67** | 154m | 87m | 76m | paired ✔ |
| `#2` / `#3` (south) | **0.78** | 280m | 83m | 79m | paired ✔ |
| `#5` / `#6` (middle) | **0.00** | 0m | 86m | 83m | **dropped ✔ (correct)** |

Two facts jump out:

1. **`#5/#6` are fully staggered (frac 0.00)** — they sit beside each other but offset ~85m along the axis, so they share zero corridor. The station-overlap gate (Groma `8ffd795`) **correctly** rejects them. *This confirms the seed and `feedback_perp_side_convention`; do not re-chase `innerSign` or this gate.*
2. **Every overhang is ~80-87m.** This is not noise — it's the signature of the stagger. The two carriageways are cut at junctions whose stations differ by ~80m, so each paired sub-segment sticks ~80m past its mate at both ends, and that overhang region is where the *other* side has demoted to a `center` spine. The middle spines `#5`/`#6` *are* those overhangs meeting in a region too staggered to pair.

**Could/should they weld into one continuous carriageway?** Doctrine (`FEATURES §369`) keeps **two** centerlines — no collapse to a spine — but says nothing against each carriageway being *one continuous chain*. They should be. A direction-strict longitudinal weld (fuse tail-to-head, same heading, **never** flip — the oneway-flip-forbid at `skeleton.js:354-379` already blocks the dangerous cross-carriageway case) would fuse `#0→#6→#3→#1` into one chain and `#2→#5→#4→#7` into the other, **without** re-introducing the Lafayette fusion bug. That is the leverage fix (F1 below).

---

## §2 Median construction — TWO representations, only one renders

### 2a. The derive `medians[]` ring — REAL defect, INERT path (the decoy)

`derive.js:2994-3010` builds, per pair, `ring = A.points + B.points` (picking the larger-area of fwd/rev as a figure-eight guard) and pushes it to `medians[]`, which **is** serialized into `ribbons.json` (27 medians; 2 for Truman, 10- and 14-vert rings). Re-measured, these rings are exactly as lopsided as the seed warned:

- **South ring (`#2`/`#3`):** A has 10 pts, B has 4. Both chains are a dense vertex cluster at one junction end + **one ~300m straight shaft** (`#2`'s last segment = 286.8m; `#3`'s last = 310.0m — a skeleton-simplification artifact, fine for a centerline, fatal for vertex-to-vertex correspondence). The ring is a valid CW strip body (~22m wide) but with **two ~80m triangular tails** from the stagger and **no station correspondence** between sides.
- **North ring (`#0`/`#4`):** 4 vs 6 pts, same stagger-tail pattern, area ~3064m².

**But this ring drives nothing on screen.** Grep: `tileGround.js` never reads `.medians`; neither does `CartographSurfaces`, `SceneLabel`, nor `buildBlockGeometryV2`. `ribbons.medians` is **vestigial** — a parallel representation left from the figure-ground era (the palimpsest pattern, `project_the_palimpsest_code_path_multiplicity`). **Re-deriving or repairing the `A+B.reversed` math would change nothing the operator sees.** The seed's "fix the ring" lead is a dead end.

### 2b. The emergent median tile — the path that actually renders

`tileGround.js:373-376` is explicit: *"the median geometry falls out of honest per-side widths + this transform, with no median-construction code."* The live median is the **tile (face) between the two carriageways**, with its median-facing sides' curb+treelawn+sidewalk zeroed by `isMedianFacing` (`tileGround.js:383-387`: a side is median-facing iff `anchor==='inner-edge'` and the side matches `innerSign`). It exists **only where `extractFaces` forms a closed face bounded by two inner-edge carriageway sides.**

What that produces on Truman, read straight from the live bake (`shape.json`, corridor box x∈[520,720] y∈[−470,300]):

| region | tile | bbox | lu tag | verdict |
|---|---|---|---|---|
| **North pair (`#0`/`#4`)** | tile 98 `[573,109]` | **71 × 303** | `recreation` | one long strip — but 71m wide (stagger-bloated) and **tagged as land-use, not median** |
| **Middle (`#5`/`#6`)** | tile 99 `[602,−24]` | **15 × 15** | `island` | a tiny sliver where the staggered spines pinch — the median "gap" made visible |
| **South pair (`#2`/`#3`)** | *(none)* | — | — | **no median tile**; the inter-carriageway area is absorbed into large blocks 66/96/65 tagged `park`/`recreation`/`unknown` |

So the median the operator faces is: **one bloated strip + one 15m island + nothing** — three different failure modes across one road. It is fragmented because the *carriageways* are fragmented and staggered, so `extractFaces` cannot bound a clean, continuous inter-carriageway face. The median tiles are also mis-tagged as ordinary LU (recreation/park/island/unknown) rather than carved as median — `isMedianFacing` only zeroes ped where **both** bounding sides are properly paired inner-edge chains, which the stagger/spines break.

**What would make it ONE clean continuous strip:** fix the carriageways first (F1). With each carriageway one continuous inner-edge chain over the whole corridor, `extractFaces` bounds **one** continuous face between them, `isMedianFacing` zeroes both sides cleanly, and the median emerges as a single tile end-to-end. The median problem is **downstream of the fragmentation problem** — it is not separately fixable.

---

## §3 Dead-end — confirmed separate class, NOT in Truman

Truman has **no cul-de-sac of its own.** Its four "free" endpoints all junction with other streets (within scan tolerance):

```
#0.H [550,282] → motorway-link-36.T  (0.3m)     #7.T [536,280] → motorway-link-36  (13.8m)
#1.T [705,-447]→ South 18th Street    (0.7m)     #2.H [691,-450]→ South 18th Street (0.1m)
```

Truman is a through-corridor (motorway ramp ↔ South 18th St); both ends are junctions, not pendants. The **"big triangle"** Jacob flagged is the generic **pendant-spur / dead-end class** owned by `tileGround.extractFaces` + the `round` band-join (per `HANDOFF-dead-end-spike-prune`, which itself states the triangle is "NOT Truman; Truman's slim strip is a divided-carriageway median, a separate class"). **Confirmed: separate class, separate owner (tileGround face-walk vs derive/frame), out of median scope.**

⚠️ **Conflation hazard for the fixer:** the median's ~80m stagger overhangs (§2) *are themselves triangular slivers*, and tile 99 is a 15m island sliver. These look like dead-end triangles but are median/face artifacts (frame+stagger origin), not pendant spurs. When dispatching the dead-end prune, scope it to true degree-1 pendants so it doesn't "fix" Truman's median slivers (which the prune would wrongly delete as spurs).

---

## §4 Authoring path — why "grab the median, widen in one piece" is impossible today

Trace: `SurveyorPanel.jsx:306-316` Anchor `<select>` → `setAnchor(idx, 'inner-edge')` (`useCartographStore.js:1842-1903`) → pair-aware flip via `pairId` lookup → sets `symmetric=false`, seeds inboard `pavementHW=0` on both mates (and every `segmentMeasures` entry) → `innerEdgeMeasure` zeroes the inboard ped at render (`tileGround` / `MeasureOverlay`). To **widen** the median, the operator **narrows each carriageway's inboard `pavementHW`** (pulls inboard pavement in); the median grows into the freed gap. There is no median handle — the median is emergent, so authoring is **indirect and per-carriageway**.

**Five concrete blockers (today):**

1. **No single median to grab.** The median is an emergent tile, not an object; widening = editing inboard pavement on the carriageways, not dragging a median edge. (Doctrine, but worth stating as the baseline.)
2. **Fragmentation defeats "one piece."** Only 4 of the 8 chains carry `anchor='inner-edge'` (the paired segs); the 4 spines (`#1/#5/#6/#7`) are `anchor='center'` with no median concept. The operator would have to author each paired segment separately, and the spine regions have no median at all. There is no continuous thing to act on.
3. **Stagger ⇒ no clean strip.** Even within a pair, the ~80m overhang tails mean inboard-pavement edits act on a lopsided face, not a parallel strip.
4. **`oneway` is lost.** `derive.js`'s serialize map (`ribbons.json` streets) does **not** include `oneway` (confirmed — fields are skelId/name/points/measure/capEnds/anchor/innerSign/pairId/highway/type/couplers/segmentMeasures/disabled). So `SurveyorPanel`'s **One-way checkbox renders unchecked** for divided carriageways, and there's no per-chain "this is a one-way carriageway" affordance — the operator can't see or set the cross-section origination the goal asks for.
5. **Median mis-tagged as LU.** Because the median renders as `recreation`/`park`/`island` tiles, the operator has no signal that these *are* the median; they read as land-use blocks.

**Verdict:** the operator cannot achieve the goal today. The gate is **F1 (continuous carriageways)** + **F2 (clean emergent median falls out)** + **F6 (carry oneway)**; only then does the inner-edge inboard-drag act on one clean strip.

---

## §5 Defect map → root → owner → fix → systemic?

| # | Defect | Root | Owner | Fix sketch | Systemic? |
|---|--------|------|-------|-----------|-----------|
| **D1** | Each carriageway is 4 disconnected chains | `weldChains` `(signature,pairKey)` gate forbids fusing a carriageway's own colinear continuation (`skeleton.js:340-341`) | **skeleton** | Add a direction-strict longitudinal weld pass: fuse tail-to-head, same-heading fragments of the same corridor regardless of signature/pairKey; **never flip** (reuse the existing oneway-flip-forbid logic so cross-carriageway fusion stays blocked). Re-assert one `inner-edge` chain per carriageway. | **SYSTEMIC** — every divided road fragments the same way (Park, S Jefferson, Officer David Haynes, Lafayette) |
| **D2** | Pairing intermittent → median gaps (the `#5/#6` middle) | Carriageway junctions staggered ~80m ⇒ middle region has 0.00 station overlap ⇒ correctly unpaired ⇒ no median there | skeleton (consequence of D1) | Dissolves once D1 makes each carriageway continuous: pairing becomes one A↔B match over the whole corridor, no mid gaps. Until then, **leave the gate alone** (it's right). | SYSTEMIC (manifestation: Truman's island tile) |
| **D3** | Median is lopsided / bloated / absent across the corridor (1 wide strip + 1 island + 0) | `extractFaces` can't bound a continuous inter-carriageway face over fragmented+staggered chains | **tileGround / frame** | Downstream of D1; with continuous carriageways the face is one clean strip. Secondary: tag the inter-carriageway face as **median**, not LU, so `isMedianFacing` carves both sides even at junction-adjacent tiles. | SYSTEMIC |
| **D4** | `medians[]` ring (`A+B.reversed`) is malformed (10-vs-4 verts, 80m tails) | `derive.js:2994-3010` takes full chain extent, no station-trim; vertex-count mismatch | derive | **It's vestigial — nobody renders it.** Either (a) delete `medians[]` from derive+serialize (palimpsest cleanup), or (b) if a future consumer needs it, trim to the mutual-overlap station window and resample both sides to matched stations. Do NOT spend fix-budget here before confirming a consumer. | SYSTEMIC (all 27 medians) — but **inert** |
| **D5** | "Big triangle" near Truman read as a dead-end | Pendant-spur out-and-back opened by `round` band-join | tileGround (`extractFaces`/band-join) | Covered by `HANDOFF-dead-end-spike-prune`; **scope the prune to true degree-1 pendants** so it doesn't eat Truman's median slivers. | SYSTEMIC (~195 dead-ends) — **not Truman** |
| **D6** | `oneway` flag dropped → One-way checkbox always unchecked on divided carriageways | `derive.js` serialize map omits `oneway` | derive | Add `oneway` (and ideally the `phase.role`/`pairKey`) to the serialized street fields so Survey can show/set it and downstream can trust it without re-deriving. | **SYSTEMIC** — all one-way streets |
| **D7** | `#0`/`#4` both report `innerSign=−1` (vs `#2`/`#3` = +1/−1) | `innerSideSign` is per-chain-relative to mate centroid (`derive.js:2849-2867`); for `#0`/`#4`'s orientations both mates fall on the same signed side | derive | **Likely correct per `feedback_perp_side_convention` — do NOT re-chase.** Flag `TBD-with-Survey`: sanity-check on real geometry once D1 lands and the corridor is one pair; if the median carves cleanly, it's fine. | TBD (do not touch now) |
| **D8** | Median renders as `lu=recreation/park/island/unknown`, not as median | `isMedianFacing` only zeroes ped where both bounding sides are paired inner-edge; stagger/spines break that ⇒ faces fall through to LU classification | tileGround | Downstream of D1+D3; also add an explicit median-face tag so Stage can style it as median regardless of the LU underneath. | SYSTEMIC |

### Ordered fix list (by leverage — the dependency chain is real)

1. **D1 — longitudinal carriageway weld (skeleton).** The keystone. Unblocks D2, D3, D8 and the entire authoring goal. One change, biggest payoff, systemic across all divided roads. *(Branch the divided-pair arc / coordinate with Groma — same file family as the station-overlap gate.)*
2. **D6 — serialize `oneway` (derive).** Cheap, independent, needed for the cross-section-origination half of the goal.
3. **D3 / D8 — median-face tagging + clean carve (tileGround).** Verify these mostly dissolve after D1; apply the median-tag so the operator can see/style the median as a median.
4. **D4 — decide vestigial `medians[]`: delete or trim (derive).** Palimpsest cleanup; confirm-no-consumer first. Low render-value, real clarity-value.
5. **D5 — dead-end prune, scoped to true pendants (tileGround).** Already its own HANDOFF; just don't let it touch Truman's median slivers.
6. **D7 — `innerSign` sanity recheck (derive).** Deferred `TBD-with-Survey`; do not re-chase before D1.

### Systemic vs Truman-specific

- **Systemic (6):** D1, D2, D3, D4, D6, D8 — every one is a *class* defect that recurs on Officer David Haynes, Park Ave, S Jefferson, Lafayette and any future divided road. Truman is the worst-case *exemplar*, not a special case.
- **Truman-specific (manifestations only):** the particular **15m island tile (#5/#6)** and the **south-median-absorbed-into-park-blocks** outcome are this corridor's specific symptoms of the systemic stagger; D5's triangle is generic and explicitly not Truman.

**Bottom line for the operator's goal:** there is no Truman-local median fix. The clean, continuous, grabbable median falls out **for free** the moment each carriageway is one continuous `inner-edge` chain (D1). Everything else is consequence or cleanup. The day's symptom-by-symptom combing kept landing on D3/D4 (the visible median) and the vestigial ring — **one layer too late.** The wall is at D1, in `skeleton.js`.

---

## ADDENDUM — South-of-Park median fragmentation (Boz + Jacob, 2026-06-04, post-D1)

**Symptom (Jacob's eye, clean build):** Truman renders **correct north of Park Ave** but **wrong south of Park** — the median "drops off and gets picked back up in the wrong place." Localized, real on a clean restart (not a session ghost).

**Verified findings (read-only, on the post-D1 `ribbons.json`):**
- **Carriageway geometry is fine.** Both welded chains span the full corridor (z +282 → −447), consistently **~13m apart** the whole way (the apparent "43m gap" was a vertex-*sampling* artifact — B has no vertex opposite A's, the lines stay 13m). D1's weld + the skeleton centerlines are **sound** here.
- **The break is the emergent median FACE, fragmented by asymmetric cross-street junctions.** South of Park, **Grattan St (z−68)** and **secondary_link 29 (z−380)** T-junction **carriageway A only** (exact 0.1mm nodes); **carriageway B has no junction in that span.** The median is the face *between* A and B — where a cross-street meets one side's centerline but not the other, the strict face-walk fragments → drop-off + wrong-pickup. North of Park: no such asymmetry → continuous.
- **NOT a snap artifact / NOT "tolerance too high."** Checked: in **raw OSM, Grattan's nearest vertex to Truman = 0.00m** → a *genuine* OSM junction, not fused by derive's 3–5m snap. (`extractFaces` node identity is `Q=1e4` = 0.1mm — strict; it merges nothing.)

**Classification:** a **D3/D8 divided-road median-FORMATION** defect (the "median is a real geometric face, downstream work, not free" correction made concrete) — **systemic** (any divided road with one-sided cross-streets). **Fix = teach median-face formation to handle real one-sided cross-street T-junctions** — NOT snap-tightening, NOT the too-much-line/over-densification thread (which showed no change here). Its own brief.

*Addendum: Boz + Jacob, 2026-06-04. Read-only; no code touched.*

---

*Galen, 2026-06-03. Read-only census; no code touched.*
