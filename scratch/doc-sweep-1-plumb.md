# doc-sweep-1 — CLUSTER 1 (Frame) — *Plumb*

`cartograph/SKELETON.md` · `OSM-FORENSICS.md` · `OSM-FORENSICS-EVAL.md` · `OSM2STREETS-GROUNDING.md` · `LOOP-STREETS.md`

**Extracted: 64 load-bearing claims. Verdicts: 24 CONFIRMED · 27 FALSE · 13 UNVERIFIABLE.**
Read-only. Nothing edited. No bake, no pour, no server.

**The one-line headline:** the frame's *doctrine* holds up almost everywhere; its *as-built description does not*. Three whole capabilities have landed in `skeleton.js` since these docs were written — the **curve-primitive (bezier) fit**, the **custom `survey.json` width tier**, and the **data-first carriageway gates** — and all three are still written up as "not yet / follow-on / open bug." Separately, the LS `skeleton.json` on disk **cannot be reproduced by the documented build command**, because it was minted with an env flag that is OFF by default and that no doc in this cluster mentions.

---

## A. The kit-critical one

### SKELETON.md §1 / §3 (whole build description) — FALSE
```
CLAIM:  "Built by cartograph/skeleton.js (osm.json → skeleton.json)" + the 15-step §3 list
        + "Two-step rebuild: run skeleton.js then pipeline.js."
ACTUAL: skeleton.js:843  `const CURVE_FIT = process.env.CURVE_FIT === '1'   // OFF by default`
        The curve-fit pass (skeleton.js:1933–1985) is the ONLY writer of `street.segments`
        (:1960, :1977, :1981) and it MUTATES `s.points`.
        The committed artifact carries it:
          git show HEAD:.../clean/skeleton.json → 217 streets, **52 with `segments`**, 976 verts.
        So the on-disk LS frame was produced with `CURVE_FIT=1`. Running the documented
        command (`node cartograph/skeleton.js`) reproduces a DIFFERENT, curve-less frame.
        `CURVE_FIT` appears nowhere in SKELETON.md (or any doc in this cluster). It is
        documented only in `ROADMAP.md` A4, `ACCORDANCE-REVIEW.md` PA-3, `BRIEF-hpdm-curve-fit.md`
        — all three of which say it is **OFF**, i.e. they too disagree with the artifact.
IMPACT: Kit-critical, and exactly the silent-substitution shape. An operator pouring town #2
        follows the documented two-step, gets faceted polylines instead of bezier chains, and
        nothing fails — the map just quietly comes out chunkier than LS. A regression hunt on
        LS that re-runs skeleton.js will also silently drop the curve primitives from the frame
        and blame the diff on something else.
```

---

## B. `cartograph/SKELETON.md`

### §3.5 "The frame is SPARSE by design … The skeleton is never densified or smoothed in place" — FALSE
```
CLAIM:  The curve-fit is a CONSUME-TIME map only; home "(b) baked at the source" is a
        FOLLOW-ON; the smooth "must never bake into the frozen artifact."
ACTUAL: It is baked at the source, as a curve PRIMITIVE rather than as densification:
        skeleton.js:1933–1985 rewrites `s.points` and stamps `s.segments` (bezier|line).
        Artifact: 52 of 217 LS streets carry `segments`.
        Consumers already branch on it — `derive.js:39-43` tessellates `street.segments`
        to a dense polyline (which is why `ribbons.json` has 0 streets with `segments`
        and 1168 dense verts), and both overlays read
        `st.segments ? st.points : smoothChain(...)` (SurveyorOverlay.jsx:501,
        MeasureOverlay.jsx:356).
IMPACT:  §3.5 is the doc people read to decide WHERE a curve fix belongs. It sends them to
        consume-time (`smoothChain`) for a problem now owned by the frame, and it warns them
        off the exact move that already shipped. It also states the ix-index blocker
        ("home (b) requires recomputing intersections.ix") that the primitive design avoids.
```

### §2 `streets[]` schema table — FALSE (incomplete as the schema of record)
```
CLAIM:  The field table enumerates the street record.
ACTUAL: The artifact carries three fields the table never mentions:
          `segments` (52 streets) · `throughId` (217) · `through` (217; skeleton.js:2262-2263).
IMPACT: §2 is cited as the artifact reference. A consumer written against it will not know
        `points` may be bezier control points rather than a plain polyline — the single most
        consequential thing about the current frame.
```

### §2 `seed` row + §6 doctrine bullet ("Width sourcing") — FALSE
```
CLAIM:  "Today only the AASHTO tier lives in the skeleton; the custom survey.json tier is
        applied later (derive.js:679). ⭐ Kit move: bake the custom source into the skeleton."
        §6: "The skeleton SHOULD be born with the best-available base widths … see BACKLOG
        'Custom street data (kit)'."
ACTUAL: Landed. `skeleton.js:1280–1516` is a titled block `[E1] Custom width base —
        survey.json → per-side seed enrichment`; it reads `raw/survey.json` (`:1309`) and
        stamps per-side seed. Artifact: **139 of 217 streets (54 distinct names) carry
        `seed.widthSource === 'survey'`** with `seed.left/right.source = 'survey'`.
        e.g. mississippi-avenue: left.pavementHW 3.33 / right 4.74, both `source:"survey"`.
        `derive.js:2390` even documents it: "base (E1): skeleton.js bakes custom (survey.json)
        → OSM lanes → AASHTO".
IMPACT: The doc's flagship open "kit move" is done. Someone budgets and rebuilds it, or worse
        adds a second custom-width tier in derive and the frame carries two.
```

### §3.5 "⭐ THE ONE KNOB" — FALSE as implied
```
CLAIM:  Presented as landed and live ("✅ wired", "just needs the re-freeze/re-bake"), with
        the only mention of zero being historical: "(Before: smooth=0; …)".
ACTUAL: `smoothCenterline.js:150` → `export const STREET_SMOOTH = 0`, with an in-file
        ⚠️ "TEMPORARILY 0 (reverted 2026-06-14) … smooth>0 exposed map-wide fold-spikes …
        land the ROBUST curb offset FIRST". `smoothChain`'s own header (:99): "render-time
        smoothing is currently OFF — smooth=0 — so this whole path is dormant."
        `RIBBONS.md:175` and `:300` say "currently 0" correctly — SKELETON.md does not.
IMPACT: A reader concludes the smooth curve is shipping and hunts a rendering bug for why the
        curve isn't visible; the answer is that the knob is pinned to 0 pending D6a. §3.5's
        three "open follow-ons" (name-transition seam, part-b fillet, persist-past-the-Wall)
        are all moot at 0 and read as live work.
```

### §3.5 "West 18th↔Dolman ≈ 15.6°/vertex after the §5a name-transition fix" — FALSE
```
CLAIM:  15.6°/vertex is the honest raw turn the frame now carries there.
ACTUAL: Measured on the committed skeleton: `west-18th-street` = 4 points, max turn **27.2°**,
        3 bezier segments; `dolman-street-1` = 9 pts, 18.7°, 8 segments.
        The curve-fit replaced the polyline; the per-vertex angle no longer means what §3.5
        says it means (the curvature lives in the bezier, not between vertices).
IMPACT: 15.6° is the regression number for the canonical name-transition case. Anyone gating
        on it reads 27.2° as a regression when it is the curve primitive working as designed.
```

### §2 `junctions[]` — "≈103 dead-end / 141 T / 84 cross per the forensics" — FALSE
```
CLAIM:  the skeleton's typed-node breakdown.
ACTUAL: skeleton.json: **deadend 100 · T 136 · cross 83 · Y 10** (total 329 ✓; degrees
        {1:100, 3:136, 4:83, 5:8, 6:2}).
        103/141/84 are the RAW-OSM degree counts from OSM-FORENSICS Part 1.1 — a different
        population. `OSM-FORENSICS-EVAL.md` states the skeleton's numbers correctly.
IMPACT: Cross-doc contradiction where the *pre-fix source* counts are presented as the
        *post-fix output* counts. Any before/after on junction typing starts from the wrong
        baseline.
```

### §1 artifact table — overlay.json "operator intent … 108K" — FALSE
```
ACTUAL: clean/overlay.json is **5.3 KB**, `{version:1, streets:{…52}}` — no `loops`, no
        blockCustoms, no corner overrides. The operator's SHAPE intent lives in
        looks/<id>/design.json (30 KB: blockCustoms, cornerRadiusScale,
        cornerCornerRadiusOverrides, alleyCap, surveyDefault…), which the table sizes at 12K.
        (shape.json is 1.03 MB, not 64K — noted only because the table is a where-does-X-live
        surface, and the 20× overlay error reads as the file still holding the customs.)
IMPACT: Someone looking for the authoring SSoT opens overlay.json, finds 52 thin street
        records, and concludes the customs were lost.
```

### §5a "46 such through-junction kinks in LS" — UNVERIFIABLE (a)
```
CLAIM:  46; cited downstream as a closed population ("all 46", OSM2STREETS §3.3).
ACTUAL: No threshold is stated, so the number has no test. Measured on the committed frame
        (interior junction-vertex, off-chord vs its two neighbours): 267 candidate vertices;
        off-chord >1 m = 36, >2 m = 16, >3 m = 12, >4 m = 5. 46 does not fall out at any cut.
        The doc's three worked rows partially survive — **South Jefferson matches exactly
        (4.13 m / 19.3°)**, on `south-jefferson-avenue-7`.
IMPACT: A count treated as a bounded work item that cannot be re-measured or closed. Also the
        frame has moved under it (curve-fit), so the population is not the same population.
```

### CONFIRMED in SKELETON.md (checked, true)
- §3 steps 1–15 function names/order: `groupByName` · `analyzePhases` · `weldChains`+`splitAtFolds` · `weldLongitudinal` · `repairDividedPairs` · `makeStreet` · unnamed-vehicular · junction-protected RDP · canonical direction · phase endpoints · spine-link · `buildNodeGraph`+caps · `nameTransitions` · directional-corridor · `writeIfChanged(…,{touch:false})` — all present, in that order (`skeleton.js:2309` for the write).
- RDP constants: `RDP_EPS 1.0` · `RDP_EPS_LOOP 0.3` · `RDP_EPS_TRANSITION 0.3` · `isClosedLoop` <1 m (`:1808-1811`); `junctionKeys` = coords owned by ≥2 streets (`:1785-1787`).
- §3 step 14: `DIR_PREFIX = /^(North|South|East|West)\s+/i`, `OPPOSITE` map (`:2143-2159`); **0 corridors on LS** ✓.
- §2 top level `{streets, paths, junctions, nameTransitions}` ✓; junctions 329 ✓; nameTransitions **21** ✓; `continuesAs` on 32 chains; `phase.chainGap` on 38 divided chains; `phase.spineAtStart/End` on 27.
- §5b-bis "**35 of 113** named streets fragmented" ✓ exactly (113 distinct names, 35 with >1 chain).
- §3.5 render-path map: `sectionFrozen = !surveyActive && !!frozenShape` (BlockGeometryV2Debug.jsx:618) ✓; Survey navy = SurveyorOverlay, Section navy = MeasureOverlay ✓.
- §5e live locus: `filletRing` (tileGround.js:358), `extractFaces` (:656), `dedupeRing` (:342), `MIN_CORNER_LEG = 0.05` (:341) ✓. §5h `correctedTipChain` (derive.js:3433) ✓, 1 LS street carries `strokePoints` ✓ (doc says "LS: 1 tip").
- §4 UI: `CornerEditHandles` mounted (CartographApp.jsx:1112), `feCustomKey` module live ✓.

---

## C. `cartograph/LOOP-STREETS.md`

### §4 "⛔ DEAD — `derive.js LOOP_STREET_NAMES` (:1297) … all its loop-cut/median-creation paths are figure-ground-dead. **Delete**" — FALSE (and the instruction is destructive)
```
CLAIM:  Dead code, at :1297, safe to delete (L.6 ledger item).
ACTUAL: `derive.js:1416`, referenced at **:1426, :1611, :1716, :1740, :1942, :1997, :2118**
        — all inside `export function deriveLayers` (:1008), which `pipeline.js:130` calls on
        every pour and whose result is written out at `pipeline.js:309` (incl. `layers.ribbons`,
        read at :218). It is on the live pipeline path, not a dead figure-ground path.
IMPACT: The highest-risk finding in this cluster. "Delete this dead set" is written as a
        ready-to-execute cleanup; executing it edits the live prebake's block-cutting and
        loop-cut behaviour. Whether the OUTPUT still matters is a separate question I could
        not settle read-only — but "dead, delete" is not a safe description of code the
        pipeline executes.
```

### §4 "loop interior … inset pavement+curb+sidewalk ≈ **5.6 m** to the inner-sidewalk grass edge" — FALSE
```
ACTUAL: derive.js:3676  `const inset = hw + STANDARDS.curb.width`  — pavement half-width +
        curb only (≈ hw + 0.15 m), with the code comment citing LOOP-STREETS §2 as the reason
        NOT to inset past a sidewalk.
        The same doc's §6 L.5 describes it correctly ("insets to the CURB's inner edge
        (hw + curb, not past a sidewalk)"). Two contradictory descriptions of one constant,
        two sections apart.
IMPACT: 5.6 m vs ~hw+0.15 is the difference between a grass ring that covers the interior
        face (so `isMedianTile` fires) and one that doesn't. It is the mechanism of the whole
        §2 body cross-section.
```

### §4 "`isMedianTile`, >40% median-facing boundary → ped zeroed" — FALSE
```
ACTUAL: tileGround.js:3241-3242
          const isLoopInterior = runs.length === 1
          const isMedianTile   = isDividedMedian || (isLoopInterior && medArea > 0.5)
        No boundary-fraction test at all; `medArea > 0.5` is an absolute m² floor.
        (§6 L.5's "independent of the >50% area ratio" is also not the code — the doc carries
        40% in one place and 50% in another, and neither exists.)
IMPACT: Anyone tuning why a loop interior did/didn't zero its ped band will look for a
        boundary-fraction threshold that does not exist.
```

### §3 "Data shape: `overlay.loops[]` … denormalized per chain as `chain.loop = {loopId, role}`" — split verdict
```
CONFIRMED: the override IS wired — derive.js:2514 `overlayLoops = overlay.loops || {}`;
           :3669 `overlayLoops[loopId]?.interior || 'median'`, keyed by body `skelId`.
FALSE/UNVERIFIABLE(a): `chain.loop = {loopId, role}` exists nowhere in skeleton.js, derive.js
           or tileGround.js; LS's overlay.json has no `loops` key at all. §6 concedes L.3 isn't
           built, but §3 is written as the as-built data shape.
IMPACT: minor — but §3 is the only "data shape" section, so it reads as current.
```

### CONFIRMED in LOOP-STREETS.md
- **§4's own 2026-07-31 re-measure is right and the 2026-06-11 numbers are indeed stale**: measured on the committed skeleton, `benton-place-1`, `saint-vincent-avenue-2` and `park-place-2` all close at **gap 0.0000**. The `ENDPOINT_SNAP` weld currently fires on nothing in LS, exactly as the doc's warning says. (Good example of a doc that self-corrected properly.)
- `ENDPOINT_SNAP = 0.15` (tileGround.js:696) ✓; `thinTile = 2·bandArea/bandPerim < cw+tl+sw` → `bandJoin='round'` (:3471-3472) ✓ verbatim; `LOOP_MIN_MED = 20` m² (derive.js:3661) ✓; `isClosedLoop`/`RDP_EPS_LOOP 0.3` ✓.
- §5 fix-direction 1 (sanity-guard the custom-width tier) **landed**: `plausibleSwDist` / `plausibleRowHalf` + a `rejected[]` log live in skeleton.js's E1 block (~:1445-1455), with the comment "[Benton guard]".
- §0's 18th banner (18th is not a loop; the divided mis-detection was un-fabricated data-first) — corroborated independently, see D below.

---

## D. `cartograph/OSM2STREETS-GROUNDING.md`

### §3.1 "The 18th mis-pair" presented as a live bug — FALSE
```
CLAIM:  "the pair 28522831-166624144 = south-18th-street-1 + -4, stamped kind:'divided',
        chainGap: 3.21, rendered anchor: inner-edge, innerSign: -1, pairId pointing at each
        other" — and "makeStreet (skeleton.js:1452) then stamped both highway:'residential'".
ACTUAL: Committed skeleton.json:
          south-18th-street-1  highway **motorway_link**  phase.kind "single"  pairKey null
          south-18th-street-4  highway **service**        phase.kind "single"  pairKey null
        Neither the pairing nor the class flattening survives. Class is now per-chain and
        correct across all eight 18th chains (residential / motorway_link / secondary / service).
        The gate is `carriagewayGates` (skeleton.js:280-291): eligible-class set, exact
        class-match, and a split/rejoin requirement for non-clip-scale classes — run
        data-first, with `scoreOnewayPair` demoted to geometric confirmation (:333-345).
        The GENUINE pair still pairs: -5/-6, both secondary, `phase.chainGap ≈ 11`
        — matching the doc's own "gap 11.0 m" ✓.
IMPACT: §3.1 is the doc's worked evidence for its central recommendation. Presented as live,
        it invites a re-forensic of a fixed defect.
```

### §4.2 recommendation 1 ("data-first divided detection … fix makeStreet's class flattening") — FALSE as open
```
ACTUAL: Substantially landed (see above). What genuinely remains open from that item is ONE
        sub-clause: "tighten 60 m toward a plausible median ceiling" —
        `DIVIDED_MAX_GAP = 60` (skeleton.js:104) is unchanged. CONFIRMED open.
IMPACT: A reader budgets the whole port; only the gap ceiling is left.
```

### §4.2 recommendation 2 ("intersection-everywhere") vs SKELETON §5e — CONTRADICTION, code sides against GROUNDING
```
GROUNDING:  "Promote E3.1's junction map from a censused exception list (~86 nodes) to the
            standard's invariant: every junction node gets an intersection record."
SKELETON §5e: "✅ FULLY RESOLVED 2026-06-07 — intersection-everywhere (9c275ce) … Corners now
            come from leg-adjacency at every node (junctionMap 86→238)."
ACTUAL:     ribbons.json `junctionMap = { nodes: 233, unpaired: 19 }` — generalized, not an
            ~86-node exception list. SKELETON is right; GROUNDING §3.2/§4.2 are stale.
IMPACT:     The port is presented as the big remaining architectural item. It largely isn't.
```

### §2 / §3.2 — the tileGround header quote — CONFIRMED, but now describes superseded behaviour
```
CLAIM:  "our tile model's header says, verbatim, 'the IX is never constructed'."
ACTUAL: CONFIRMED verbatim — src/lib/tileGround.js:26. But per SKELETON §5e (and junctionMap
        above) the IX now *is* constructed by leg-adjacency at every node. The comment is a
        code-level stale claim, and GROUNDING quotes it as evidence of a live divergence.
IMPACT: The doc's "defining divergence" verdict rests on a comment the code has outgrown.
```

### CONFIRMED in OSM2STREETS-GROUNDING.md
- §2's gate values: `DIVIDED_MIN_TAN_DOT = -0.6` · `DIVIDED_MIN_LEN_RATIO = 0.5` · `DIVIDED_MAX_GAP = 60` · `DIVIDED_MIN_STATION_OVERLAP = 0.4` (skeleton.js:104-112) ✓ exactly as quoted.
- §2's "loop street is not a standard concept" / §4.1 "don't adopt the library" — **UNVERIFIABLE (a)**: judgments about an external codebase and product fit, with no test in this repo. Reasonable, but not checkable here; the §1 description of osm2streets internals is likewise UNVERIFIABLE (b) — I did not fetch the upstream source.

---

## E. `cartograph/OSM-FORENSICS.md` + `OSM-FORENSICS-EVAL.md`

### The headline gate — CONFIRMED, live, re-measured
```
CLAIM:  "79/79 frame-invisible interior Ts had a raw OSM node at 0.00 m — we deleted every
        one" → EVAL: "79 → 0."
ACTUAL: Re-ran the doc's own probe (`node scratch/vesalius-raw-vs-us.cjs`, read-only, no
        writes):
          raw OSM HAD a shared node there (WE removed it): **0**
          genuine OSM gap: **0**
        The gate holds on today's frame. The Dolman→18th trace also still resolves:
        Dolman osm661952868 endpoint == West-18th osm1350963412 endpoint, **gap 0.00 m**.
        The strongest surviving claim in the cluster.
```

### OSM-FORENSICS Part 3.5 / EVAL "simplification 48% → 37%, verts 1431 → 1588" — FALSE as current
```
ACTUAL: Same probe, today: "raw vehicular vertices: 2741 → skeleton vertices: **976 (64%
        removed)**." More aggressive than the pre-fix junction-blind 48% — but NOT a
        regression: 0 junctions lost. The reduction is the bezier curve-fit replacing
        polyline vertices, not RDP.
IMPACT: Read cold, 64% looks like the junction-blind simplify came back. It didn't. But
        neither doc can explain the number, because neither knows the curve-fit exists.
```

### OSM-FORENSICS Part 2 attribute-coverage table — partly FALSE / UNVERIFIABLE (b)
```
Measured against the current cartograph/data/lafayette-square/raw/osm.json:
  CONFIRMED: 2032 highway ways ✓ · max 71 verts / avg 5.40 ✓ (Part 1.2)
             lanes **242** ✓ · maxspeed **171** ✓ (vehicular subset) · width **0** ✓
             name 288 ✓ · kerb 2 ✓
  NOT REPRODUCIBLE: **surface "261/333"** — file-wide 1416, vehicular 436, vehicular-or-named
             443, vehicular-and-named 216. **oneway "250/333"** — file-wide 341, vehicular 303,
             oneway=yes 180. And the denominator itself, "vh = 333 vehicular/named LS ways",
             does not fall out of any subset I could construct (732 vehicular / 288 named /
             742 vehicular-or-named / 278 both).
IMPACT: The doc's closing line — "Every numeric claim here is reproducible by running them
        against raw/osm.json + clean/skeleton.json" — is FALSE as written. Two of the five
        "stop dropping it" tag counts, which are the quantitative case for the enrichment,
        cannot be re-derived. (raw/osm.json is a live input and may have been re-fetched since
        2026-06-01 — which is itself the point: a forensic pinned to a mutable input has no
        durable test.)
```

### OSM-FORENSICS-EVAL "median width recovered for 28 pairs (`phase.medianWidth`)" — FALSE
```
ACTUAL: The field is `phase.chainGap`, renamed in D1 (skeleton.js:715-722, :1673-1680:
        "Formerly `medianWidth` — renamed because it measures the chain-to-chain gap").
        Artifact: `phase.medianWidth` on **0** chains; `phase.chainGap` on **38** divided
        chains. SKELETON.md §2 has the rename correct.
IMPACT: EVAL is cited as the landed-state record; a consumer written to `phase.medianWidth`
        reads undefined and silently defaults.
```

### OSM-FORENSICS-EVAL "bake layer" table — FALSE as current
```
CLAIM:  ribbons intersections 252 → 252 · faces/medians 178/28 · street ribbon verts 1656.
ACTUAL: ribbons.json today: top-level `intersections` = **0** (the per-street
        `.intersections[{ix, withStreets}]` form is what exists, on 209/209 streets);
        **faces 173 · medians 52 · tiles 101 · street verts 1168**; `corridors` 0.
IMPACT: These are the doc's regression baselines. Every one of them is wrong now, and the
        `intersections: 252 → 0` shape change in particular would read as catastrophic.
```

### OSM-FORENSICS Part 1.1's cap evidence — CONFIRMED, but pointing at the dead path
```
CLAIM:  "src/lib/buildBlockGeometryV2.js:118-124 confirms: cap is 'round' only if the operator
        authored it; otherwise blunt-and-pray."
ACTUAL: CONFIRMED — the comment block is at :115-124 and says exactly that (it now also reads
        `street.capEnds.start/.end` from baked ribbons). BUT `buildBlockGeometryV2.js` is the
        DEAD figure-ground path per SKELETON §5e's ⚠️ locus note; the live curb is
        `buildTileGround`. `skeleton.json` carries `caps` on all 217 streets, and
        `ribbons.json` carries `capEnds` on all 209.
IMPACT: The "blunt-and-pray" evidence no longer describes the live renderer. EVAL's follow-on
        #2 ("consume `caps` in `chainPavementRing`/buildBlockGeometryV2") targets dead code.
```

### CONFIRMED elsewhere in the forensics pair
- Part 1.4 / EVAL scope 4: the two `derive.js` hardcodes are **gone** — `CURVE_STREETS` and the LaSalle magic-coordinate extend survive only as a historical comment at `derive.js:1213-1214` ✓.
- Part 3.2: `IX_SEG_SNAP = 3.0` still live (`derive.js:2692`, applied :2726) ✓ — i.e. the 3 m fuzzy re-projection the forensic wanted deleted is still there. **CONFIRMED open.**
- Part 5 north-star: `seedSection` (skeleton.js:1144-1162) yields residential 2-lane `pavementHW 5.49 · curb 0.15 · treelawn 1.52 · sidewalk 1.52 · rowHalf 8.69` ✓ (doc says 8.68 — rounding).
- EVAL scope 2: "329 typed junctions (T 136 · cross 83 · dead-end 100 · Y 10)" ✓ **exact**.
- EVAL's two "frame bypass" findings — **UNVERIFIABLE (b), and now mixed.** `deriveLayers` does still take raw `snapped.ground.highway` (pipeline.js:130) and `IX_SEG_SNAP` is still live, so bypass #1 partly stands; but tiles/faces now come from `extractFaces` over the frame, so "blocks are built from raw OSM" is at best half true. Settling it needs a pipeline run, which the brief forbids.
- Both docs' banner: "archive PENDING (2026-06-14)" and EVAL's "Changes are **staged in the working tree, not committed**" — ~7 weeks stale; the changes are long committed. Noted once, low impact.

---

## What I could not check, and why

1. **Anything requiring a re-derivation.** Per brief §5 I ran no bake/pour. So: whether re-running `skeleton.js` without `CURVE_FIT` actually produces a curve-less frame is inferred from code reading (`skeleton.js:843` is the sole gate; `:1960/:1977/:1981` are the sole writers of `segments`) — decisive, but not executed. Same for EVAL's frame-bypass claims. **UNVERIFIABLE (b).**
2. **Every "renders correctly / the eye approved it" claim.** LOOP-STREETS §5–§6 (Benton's inner sidewalk ring gone, Waverly's cut-thru still full ROW, the "never both at once" tension), SKELETON §3.5's eye-confirmations, §5h's eye gate. These have no headless test by design — the operator's eye is the gate. **UNVERIFIABLE (a).** Flagging per brief §3: L.1–L.4's own "status mostly unverified" is honest and should stay that way.
3. **OSM2STREETS-GROUNDING §1 in full** — the description of the upstream Rust implementation. I did not fetch osm2streets. **UNVERIFIABLE (b).** Its §2/§3 mappings *onto our code* I did check, and they are accurate about our side apart from the staleness noted above.
4. **`raw/osm.json` as a stable baseline.** It is a live, re-fetchable input; the 2026-06-01 counts may have been true of a different fetch. This makes every raw-OSM count in OSM-FORENSICS structurally unverifiable after the fact — worth saying out loud, since the doc claims full reproducibility.

## Scope note

The cluster was coverable in one pass. I did not chase drifted line numbers, prose, or formatting; the only line numbers reported are ones where the *referent moved to different code* or the citation points at a dead path.
