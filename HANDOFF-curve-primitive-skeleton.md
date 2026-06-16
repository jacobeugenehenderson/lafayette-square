# HANDOFF — The curve-primitive skeleton (curves as beziers, not dense polylines)

**Status: DESIGN, ready to dispatch (2026-06-15).** Branch `curb-offset-draw`. Agent: a geometry/pipeline specialist — **name yourself**. ⛔ **ROUTE FIRST** per `CLAUDE.md`: read this in full, then `RIBBONS.md §1` (the Derivation Chain), `SKELETON.md §3 step 8 + §3.5`, `HANDOFF-vector-curve-construction.md` (the two laws + what was tried/rejected), and `HANDOFF-concentric-curb-curved-streets.md` (the curb half). The EYE is the gate (`feedback_proxy_render_is_not_the_operator_eye`).

---

## ⭐ SESSION STATUS — end of 2026-06-15 (Mitre). READ THIS FIRST. The junction-curb BUMP is RESOLVED — eye-approved.

**LANDED (committed on `curb-offset-draw`):**
- **Phase 1 — centerline as bezier primitives** (`7c49349`). `skeleton.js` `curveFitSegments` emits sparse `points` + `segments[]` (`{type:'line'}` | `{type:'bezier',c1,c2}`); through-roads fit ACROSS the `continuesAs` seam as ONE curve, then **de Casteljau-split** back per chain (shared seam vertex + matched tangents → **no W18↔Dolman mid-curve split**, verified C1). `derive.js` carries SELF-CONTAINED segments into `ribbons.json` (both whitelists) + `tessellateStreet` (the ONE curve→points helper) + tessellates `points` BEFORE the IX pass (ix indexes the dense array; grid byte-identical). Store + overlays render the dense curve + sparse editor nodes. **West 18th = 4 control points `[B·line·B]`. Jacob: "centerline perfect."** Flag `CURVE_FIT` (env, OFF by default in code).
- **Phase 2.1 — robust curve curb** (`4273ce8`). `tileIsCurved` enables the existing `dropFoldSpurs` cleanup (near-180° only) on bezier'd tiles. Curve curb self-int 5→1, Check-A neutral, grid-safe. **Jacob: "curve curb is clean now."**

**ARTIFACTS:** regenerated with `CURVE_FIT=1` and **left UNCOMMITTED** (Jacob's call): `src/data/ribbons.json` + `cartograph/data/lafayette-square/clean/map.json` modified; `skeleton.json` is gitignored/regenerated (45 bezier'd chains). `shape.json` = Jacob's bake, untouched. To regenerate: `CURVE_FIT=1 node cartograph/skeleton.js && node cartograph/pipeline.js && node cartograph/promote-ribbons.js`.

**THE JUNCTION-CURB BUMP — RESOLVED (2026-06-15, Mitre; eye-approved by Jacob: "it's finally fixed").**

⭐ **THE HEADLINE.** The bump was **TWO stacked causes**, both at a `continuesAs` **name-transition seam** (which is ONE continuous road wearing two names — *the road is the line, the name a label*), NOT a curve-offset fold and NOT a corner to construct:
1. **A through-seam mis-read as a CORNER.** `cornerAt`/`sectionPass` keyed identity on raw `skelId`, so the South-18th↔West-18th (and West-18th↔Dolman) name-seam read as a corner → an unstable offset-line intersection between two near-tangent legs → the spike (`126°`) + a `filletRing` bump + a phantom ADA ramp. *(The brief's original "multi-vertex fold / constructed-corner" framing was wrong — proven: the legacy carve folds *harder* there, and merging the two chains' identity collapsed the spike 126°→32°.)*
2. **A width-step datum artifact.** The same continuous road carried a different curb half-width per name-fragment (South-18th `3.25` ↔ West-18th `5.49` ↔ Dolman `3.76`), so even as a through-node the offset jogged → the residual `32°` dimple. (`RIBBONS:178` — a per-fe width step at a through-node is a datum defect.)

⭐ **HOW IT'S BUILT (the fix — all SHAPE-layer, ahead of the Wall, general by construction):**
- **Canonical through-road id (`roadId`).** `derive.js` unions chains over `continuesAs` (min-skelId representative) and freezes `roadId` on every street (both serializer whitelists) + the frozen `runMeta`. SSoT for "what is one road."
- **`cornerAt` reads `roadId`** (`tileGround.js` iA build ~`:2349`): a `continuesAs` seam → same `roadId` → a **through-node**, no corner. Grid byte-identical (no-`continuesAs` streets keep `roadId===skelId`).
- **`sectionPass` `isNameTransition`** (`tileGround.js` ~`:885`): a run-end meeting a **different-skelId, same-`roadId`** run-end is a continuation → **no corner bid, no leg trim, no ADA pad**. The section runs treelawn→sidewalk→LU unbroken across the seam.
- **Name-aware width reconciliation** (`derive.js`, after the build loop): each canonical road carries **one curb half-width PER SIDE** = the MAX across its chains (widen the narrow artifacts, never narrow a real width). Today reconciles exactly the 18th/Dolman left side; general for any town.
- **Per-fe SSoT datum edit** (`design.json` `blockCustoms[south-18th-street-3].left.pavementHW` `3.25→5.49`): the `blockCustoms` `pavementHW` is the Survey/SHAPE SSoT (`SURVEY.md:76`); the base reconcile fixes the seed but a per-fe override still wins, so the deviating override was corrected too. ⚠️ **This per-fe override is the residual curated hand-fix** — the kit-invariant gap (the reconciliation doesn't yet override deviating `blockCustoms` widths on a through-road).

⭐ **HOW TO GET TO IT (reproduce + verify):**
- **Canonical case = tile 16** (the stretch) + **tile 4** (the W18↔Dolman seam, inside the big 11-run junction). Both now report **zero** curb bumps.
- **The detector (the kit's "catch it automatically"):** `scratch/correctness-detector.mjs` — two new invariants: **`curb-bump`** (the symptom worklist: a >20° turn between <3 m curve-samples on `iA`; **20 bumps / 9 tiles remain on OTHER roads** = the to-zero family) and **`through-width`** (the datum regression guard, now GREEN/0; prove it live with `--simthruwidth`).
- **The gate (Jacob's, met):** the curb reads smooth + the section runs treelawn→sidewalk→LU unbroken along 18th/Dolman, judged on the **lit Survey app** (never a proxy render). Scratch harnesses: `scratch/mitre-*.mjs`.
- **Regenerate:** `CURVE_FIT=1 node cartograph/skeleton.js && node cartograph/pipeline.js && node cartograph/promote-ribbons.js`.

▶ **OPEN (the broader family, NOT this task):** the `curb-bump` detector flags **20 bumps on other roads** (Geyer, Russell, S Jefferson, S18-5/6, Waverly, Park Place…) — same two mechanisms, each its own per-road reconcile. And the **per-fe-override reconciliation gap** above (so the `design.json` edit goes to zero too). These are the kit worklist.

---

## The one-line goal (Jacob, distilled over a long arc)

A curving street must be stored as **curve primitives** — a curving stretch is **one cubic bezier (2 endpoints + 2 tangent handles = "2 points with tangents")**, a straight stretch is a **line**, real corners are sharp vertices. The skeleton stays **sparse** (the editor shows ~4 nodes for a street, not dozens), and the curb is the **concentric offset of the bezier** — smooth by construction. **Reduce, don't densify.**

## Why (the law we proved the hard way — do not relitigate)

**Offsetting straight segments facets the outer angles, no matter how small the segments** (Jacob, verified). Densifying a polyline (Catmull-Rom at consume, or arc-tessellation in the frame) just makes *more, smaller* facets and a desynced/lumpy curb — and it makes the skeleton "not 2 points," i.e. **not actually simplified**. The smoothness must come from the **curve representation**, tessellated to points **only** at the final polygon step. A bezier's parallel offset is a smooth curve; a polyline's is faceted. (Both prior attempts — consume-time `STREET_SMOOTH` Catmull-Rom and the frame arc/bezier *tessellation* — are reverted; the sparse frame is the current baseline. `CURVE_FIT` flag is OFF.)

The two durable laws (`HANDOFF-vector-curve-construction.md`): **(1) Concentric** — clean on the FRAME, curb = parallel offset, never patch the curb. **(2) Curves, not legs** — fit a curve *through* the control points; never straighten to chords, never bow a straight leg.

## What this replaces / current state

- Sparse `skeleton.json`/`ribbons.json` is the baseline (byte-identical to tag `checkpoint-before-skeleton-round`). West 18th = 7 points.
- The dormant tessellating fit lives in `skeleton.js` (`curveFitChain`/`fitClusterBezier`, behind `CURVE_FIT` off) — **reuse its cluster-detection insight** (short-segment clusters vs long legs; calibration below) but **its output model is wrong** (it tessellated). Replace it.
- Calibration (sparse frame seg lengths, m): West 18th `5 4 6 76 5 2` (curve clusters `5 4 6` + `5 2`, **76 is a straight leg**); Park/Mississippi all long legs (100–331); Benton loop 3–49 (a continuous curve). So: **short segment = tightly-packed curve; long segment (≳40 m) = straight leg, untouched.**

---

## The data model (the core change)

Keep `street.points` as the **sparse control vertices** (bezier endpoints + line endpoints + sharp corners — what the editor edits, what stays few). **Add** `street.segments[]`, one per consecutive point-pair `points[i]→points[i+1]`:
```
{ type: 'line' }                                   // straight — points[i]→points[i+1]
{ type: 'bezier', c1: {x,z}, c2: {x,z} }           // cubic — control handles off points[i], points[i+1]
```
- Backward-safe-ish but **all polygon consumers MUST tessellate** (a consumer that reads bare `points` would chord-cut a curve — Law 2). Provide ONE helper `tessellateStreet(street, spacing=1) → [{x,z}]` (lines pass through; beziers subdivide at ~`spacing` m). This is the *single* place curves become points.
- The **editor + navy** draw the beziers directly (or via `tessellateStreet`); the **stored skeleton stays sparse** → the editor shows few nodes ("2 points with tangents").
- Carry `segments` through `derive.js` into `ribbons.streets[]` verbatim.

## The fit (in `skeleton.js`, after RDP, flag-gated; frame placement = Law 1)

1. **Classify** each vertex/segment: **long segment (≥ `CURVE_SEG_MAX`≈40 m)** → a straight leg (line, kept verbatim); **sharp vertex (≥ ~35° or a junction/`continuesAs`-aware shared node)** → a corner (kept sharp); a **run of consecutive short segments that turns** → a curve cluster.
2. **Fit one cubic bezier per cluster** (least-squares): endpoints = cluster ends; **tangent directions = the bounding straight-leg directions** (so the bezier joins the legs *tangentially* — no hook); solve the 2 handle magnitudes to ride the cluster's real points within `CURVE_DEV_TOL`≈1 m. If a single cubic can't (S-curve), split into 2 (biarc-style). **Replace the cluster's interior points with the bezier segment** (store `c1,c2`); cluster endpoints stay control vertices.
3. **Across name-transitions (`continuesAs`)** — the showstopper from the eye (the West-18th↔Dolman **mid-curve split**): the bend spans two chains. **Fit the through-ROAD as one curve** across the seam (concatenate following `continuesAs`, fit, then split back by name at the seam — the §5a through-road pattern applied to the fit), so the two chains share the seam vertex **and matched tangents** → no gap. *Name is a label; the road is the line — fit the road, attribute names after.*
4. Straight grid streets (no short cluster) → all `line` segments = **byte-identical to today** (grid-safe; verify).

## The curb = concentric offset of the bezier (in `tileGround.js`)

This is the other half — the centerline being smooth is necessary but **not sufficient** (the current curb still facets/fragments because `offsetRingVariable` mitres the polyline at the curb-offset stage).
- **Line segment** → parallel line at ±half-width (today's behavior).
- **Bezier segment** → its **concentric offset**: offset the bezier's control points along the normals (offset of a cubic ≈ a cubic), or tessellate the bezier finely and offset along the **analytic curve normal** — either way the result is a **smooth concentric curve**, not a mitred polyline. Tessellate the *offset curve* for the polygon.
- **Corners (real junctions)** → sharp; trim the two curb lines to their intersection + fillet (the existing `filletRing` / osm2streets trim-back). The curve meets the junction **tangentially** so there's no gap (the current mid-curve fragments — the tiny 0.01–0.8 m curb rings — are this seam/offset failure).
- ADA pad / fillet decisions must be **topological** (real junction nodes only), never per-vertex turn — so curves get no false mid-curve ADA ramps.

## Scope & safety (Jacob's standing requirement — grid + medians + loops must not break)

- **Grid-safe by construction:** straight streets = all line segments = identity; sharp corners stay sharp. Only genuine curves get bezier segments. **Verify:** grid tiles byte-identical before/after.
- **Divided carriageways** (`phase.kind==='divided'`) and **closed loops**: **excluded in v1** (moving a carriageway desyncs its emergent median; a loop interior is an emergent face — the two-carriageway model is LOCKED). v2 handles them as **paired/closed beziers** that move so the emergent face stays correct. (Earlier global fit broke medians+loops — that's why.)
- **Flag-gated** (`CURVE_FIT`), reversible, frame placement from the start.
- **IX constraint** (`SKELETON §3.5`): `intersections.ix` index into points; with segments + tessellation, recompute `ix` in `derive.js` on the tessellation (the pipeline re-runs fresh — reproducible, verified byte-identical). Authoring keys `segOrd`/`cornerKeyAt` are densify-robust; verify handles still anchor.

## Pipeline integration (the touch list)

- `skeleton.js` — the fit; emit `segments[]`; through-transition fit. Re-freeze: `node cartograph/skeleton.js && node cartograph/pipeline.js && node cartograph/promote-ribbons.js` (reproducible; **checkpoint + Jacob's go** before re-freezing per `HANDOFF-round-skeleton-corners.md`).
- `derive.js` — carry `segments` into `ribbons.streets`; `tessellateStreet` for `extractFaces`/tiles; recompute `ix`.
- `tileGround.js` — the concentric bezier-offset curb + topological corners (`HANDOFF-concentric-curb-curved-streets.md`).
- the editor (`SurveyorOverlay.jsx`/`MeasureOverlay.jsx`) — draw beziers; edit control points/handles (a real UI piece; can phase: first render beziers read-only, then editable).

## Gates (RED-until-true; the EYE is final)

- West 18th: editor shows **few control points (≈2-with-tangents per curve), no mid-curve split** (seam closed), curb **smooth + concentric both sides, no gaps/fragments, no mid-curve ADA**.
- **Grid tiles byte-identical**; medians (94) + tiles (103) unchanged; divided/loops unchanged in v1.
- `litmus-curb-parallel` (Check A) green on curves; curb-degenerate gate green; curated/correctness suite unchanged.
- ⛔ Validate on the lit Survey app, never a proxy render.

## Phasing (dispatch order)

1. **Data model + tessellate helper + fit** (skeleton.js) → sparse skeleton with bezier segments; navy renders smooth from segments. Gate: editor shows few nodes, West 18th smooth navy, seam closed, grid byte-identical.
2. **Concentric bezier curb** (tileGround.js) → smooth concentric curb, no facets/gaps. Gate: Check A green, eye.
3. **Editor edits control points/handles**.
4. **v2: loops + divided** as closed/paired beziers (emergent face preserved).

## ⭐ v2 SCOPE (2026-06-16, Boz) — the GENERAL densification: loops + divided carriageways (Benton-gated)

**Why now (the probe, `scratch/sv-faceting-probe.mjs` + the curve census):** the cul-de-sac defect (Saint Vincent / Park Place turning circles rendering as faceted polygons with a notched ROW) is **not a loop bug — it's the v1 exclusion biting.** Phase 1 is LIVE (45 through-roads bezier-fit, `CURVE_FIT=1` in the committed pipeline), but every **loop body and divided carriageway is still a faceted polyline** (confirmed: `saint-vincent-avenue-2`/`park-place-2`/`benton-place-1`/`waverly-place-0` + `russell/geyer/south-jefferson` carriageways all carry `segments=none`). Worst-step census: **Waverly 47.6°, Russell 34°, Geyer 33°, Benton 30°, S-Jefferson 28°, Park Place 26°, Saint Vincent 24°.** The kit rule is *"no curved body renders faceted, in any town"* — so the signal is **"under-sampled curve" (general), never "self-closing loop" (instance-thinking).** This is the cul-de-sac fix done correctly, and it subsumes the median-nose smoothing from the 2026-06-16 walked-face median.

**The two excluded sub-cases + WHY they broke before (the core constraint):** v1 excluded these because *moving a centerline desyncs its emergent face*. v2 must fit the curve **without moving the face off its derivation.**

1. **Closed loop bodies → CLOSED bezier fit.** Self-closing chains (`gap < ENDPOINT_SNAP`): SV/Park Place (turning circles, ~8 m R), Benton (teardrop body, 48 m R), Waverly (couplet — fit each carriageway, see #2). Fit as a **periodic/closed bezier** so the body is smooth, tessellated densely → the **enclosed face is still the emergent face-walk** (`extractFaces` + the weld), just bounded by a smooth ring not a 19-gon. MUST preserve: the `ENDPOINT_SNAP` weld (true endpoints, `tessellateStreet` never moves `points[0]/[last]`), the `kind:'median'` island ring emit (`derive.js`), and `isLoopInterior` firing. The island/median **falls out unchanged** — only smoother.
2. **Divided carriageways → PAIRED bezier fit.** The median is now a **derived walked face** (`luRemainder` of the face between the two carriageways, face-read by `phase.pairKey` — `RIBBONS §3.5`, landed `2caf843`). Fit A and B **as a pair** (consistent tangents/parametrization) so the inner-edge gap that *is* the median stays clean — fit independently and the offsets diverge → the median breaks (the v1 failure). Bonus: S-Jefferson (28°) smooths and the median **nose** rounds with the curve.

**The detector (the kit prize — build it):** add `curve-faceting` to `scratch/correctness-detector.mjs` — flag any chain whose **tessellated `iA` has a worst-step > ~12°/segment between non-corner vertices**, map-wide, RED-until-true. Corner-protected (genuine sharp corners are exempt — reuse the fit's 35°/junction classification). This is what catches town #2/#3's curves by machine, with no human re-inspecting.

**⭐ The Benton gate (Jacob's hard constraint — "don't kill Benton"):** Benton is the canonical v2 risk (the emergent-face teardrop). Gate every change on the baseline (`scratch/benton-baseline.mjs`): **Benton = 2 asphalt rings, 1 median @ ~1799 m², 4 curb rings** — must hold or improve, never regress. Benton is *in the validation set*, not an exception: if a general rule can't keep Benton's emergent median intact, it's the wrong rule. Validate across the **whole curve census** (SV, Park Place, Waverly, Russell, Geyer, S-Jefferson, Park Ave + Benton) + the divided-median invariant (**30 `isMedian` tiles**, S-Jefferson rings 2269/46/695) + **grid byte-identity**. The EYE on the lit Survey is final.

**Build order (smallest-risk first):** (a) **closed-loop fit** for the turning circles (SV, Park Place) — most visible, simplest topology, no pairing; gate on Benton + the two circles. (b) **Benton/Waverly closed-body fit** — the emergent-median loops; gate hard on the median baseline. (c) **paired carriageway fit** — the divided roads; gate on the 30-tile median invariant. (d) the **detector** alongside (a). Each rides the existing `tessellateStreet` + concentric-bezier-curb path (Phase 2, `HANDOFF-concentric-curb-curved-streets.md`); `tileIsCurved`/`dropFoldSpurs` (Phase 2.1) extends to loop/divided tiles.

**Top v2 risks (carry forward):** offset-of-cubic is approximate at **high curvature·depth** — acute for the 8 m turning circles where `pavementHW (~5 m)` approaches the fit radius → self-intersection (use sampled-normal offset, cap radius, `dropFoldSpurs` guard). Paired-carriageway divergence breaking the median (gate on the 30-tile invariant). The whole-map rebuild perf (`derive → ribbons → re-freeze shape.json → bake`; checkpoint + Jacob's go before re-freezing). ⚠️ **Probe-gate per the derivation-first rule before building each sub-case** — confirm the fit is the lever (not a separate datum/weld issue) on the lit app first.

## ⛔ Do-not-repeat (this arc's lessons)
- Don't densify (tessellate-into-the-frame) — that's "not 2 points," not simplified.
- Don't patch the curb live per-primitive (7 tried). One designed concentric construction.
- Don't fit per-chain across a name-transition (mid-curve split). Fit the through-road.
- Don't touch divided carriageways / loops in v1 (breaks medians/loops).
- Subagents are write-blocked in this sandbox (read-only `node -e`); Boz implements, agents forensic/design.

---

## ⭐ Forensic findings folded in (Tessera = pipeline, Concur = curb; 2026-06-15)

### Data model — the chosen representation (resolves the "sparse vs tessellated" tension)
- **`skeleton.json`** stores **sparse `points` (control vertices) + `segments[]`** — the simplified frame, the source of truth, what makes the editor show "≈2 points with tangents."
- **`derive.js` serializes `ribbons.json` with BOTH**: `points` = the **tessellated** polyline (so `intersections.ix` indexes it and *every legacy consumer keeps working byte-identically*), AND `segments` = the **sparse** companion (for the editor's node display + the concentric curb). The editor reads `segments` (few nodes); polygon/ix consumers read `points` (tessellated). Backward-compat by construction.
- `tessellateStreet(street, spacing≈1m)` = the ONE helper (lines pass through endpoints EXACTLY — grid-safe; beziers subdivide). Must never move `points[0]`/`points[last]` (the `ENDPOINT_SNAP=0.15` loop-weld depends on true endpoints).

### Exact touch points (file:line — Tessera)
- **Two silent whitelists** — both must name `segments` or it vanishes with no error: `derive.js:2377` (build literal) + `derive.js:3868` (serializer). Pattern: `...(s.segments ? { segments: s.segments } : {})`.
- **IX recompute** — `derive.js:2480–2647` computes `intersections.ix` and **mutates `points` in place** (snap `:2515`, splice `:2567`, collapse `:2630`), each already remapping `ix`. ⛔ Do NOT index-sync `segments` through this. Instead run the IX pass against `tessellateStreet(street)` so `ix` indexes the tessellation; keep `segments` on the sparse authored points. `segOrd`/`cornerKeyAt` are coordinate/junction-based → survive (verified); `ix` is the only index-based key → recompute on the tessellation.
- **Faces** — `extractFaces` reads raw points at `tileGround.js:555` (endpoint pre-reg) + `:556–565` (edge walk = the chord-cut site). Swap to `tessellateStreet(s)`. Both callers inherit it: `derive.js:3970` (tile freeze, edges by `skelId` → robust) and `tileGround.js:1401` (live; `tilesFromFrozen` unaffected).
- **Store/editor** — `useCartographStore.js:1776` (the `rbPoints` block) must carry `segments` into `centerlineData`; navy renders at `SurveyorOverlay.jsx:486` + `MeasureOverlay.jsx:326` (tessellate beziers before `polylineRibbon`; once beziers carry the curve, `STREET_SMOOTH→0` for bezier'd chains — the consume-time Catmull-Rom is then redundant/distorting).
- **Third freeze path:** `cartograph/bake-ground.js:294` also calls `buildTileGround` — inherits the curb change.

### The curb construction (file:line — Concur)
- Provenance: `tile.edges[i] = {streetIdx, forward, side}` (`tileGround.js:595`); `cornerAt` is derived (different streets meet, `:2366`). **Thread the segment `kind` (line/bezier + `c1/c2`) through `addEdge` → `tile.edges[i].kind`**, and split `groupRuns` (`:767` `same()` test) at line↔bezier boundaries so each run has one primitive type.
- Offset **by kind**, inside `offsetRingVariable` (so `:2386` is unchanged): **line → parallel shift** (identity, grid-safe); **bezier → offset the cubic** (`c1/c2/endpoints ± normal·depth`) then tessellate the *offset curve* finely (default to the **sampled-normal offset** — exact at tangents, robust mid-curve); **corner → offset-line intersection + `filletRing`**. Because a bezier joins its legs **tangentially**, the offset cubic meets the leg's parallel offset tangentially → no facet, no graft. With a true offset cubic there are **no 37° facet vertices**, so `filletRing`'s 18° test stops false-firing by construction.
- **Junction fragments** (the tiny 0.01–0.8 m curb rings = your "gaps") are **band-difference degenerates** at dense junctions (`Cacc = differenceRings(iA, iA⊖cw)`, `:2484`) — a separate defect from curve-facets. Real fix = the **tangent trim-meeting** at the corner so adjacent legs share the vertex exactly (no slit born); a `>0.05 m²` floor at `:2484` only as a guarded fallback (band-side patches are forbidden, POLYGON-FIRST §3).
- **False ADA ramps:** `sectionPass` corner logic is **already topological at the run level** (`isThrough` `:884`, the `!tipped && !through` bid `:963`), BUT it pairs to the nearest **fillet apex**, and `filletRing` rounds any >18° vertex — so a curve facet → a stray fillet → a phantom mid-curve pad. Fixed two ways: the offset-cubic removes facets (no stray fillet); and **gate the corner bid on the junction graph** (freeze the `cornerAt` topological corner-set onto `shapeTiles[]`, require pads at real nodes). W18 (`intersections:[]`) → zero mid-run ADA by definition.

### ⭐ Name-awareness (Jacob, 2026-06-15) — distinguish blocks by NAME + chain links, not links alone
Use the street **NAME** alongside chain-link topology to decide what is "the same road" vs "a real corner":
- **Through-road curve fit across a seam** — West 18th and Dolman are **different names, one road** (linked by `continuesAs`). Fit the bend as ONE bezier across the seam, then **attribute the names back** (the §5a "fit the road, attribute names after"). This is what closes the **mid-curve split** you saw.
- **Corner detection (`cornerAt`)** — refine "different streets meet" to be **name + continuesAs aware**: a node where two chains of the **same name** (or `continuesAs`-linked) meet is a **through-node / name-transition → no corner, the curve flows through**; only a genuinely **different-named** street meeting is a **real corner** (sharp, filleted, ADA-eligible). This both prevents a false corner at the West-18th↔Dolman seam and is the clean signal for "which block is which."
- Carry this into both the **fit** (cluster/run boundaries respect name+continuesAs) and the **curb/ADA** corner test (`streetByEdge` should compare name+continuesAs, not just `streetIdx`).

### Dispatch sequence (hardened)
1. Skeleton fit → emit sparse `points` + `segments`, **fit through-roads across `continuesAs`** (name-aware), grid → all-line.
2. `derive.js` → propagate `segments` (both whitelists), `tessellateStreet`, recompute `ix` on the tessellation, serialize tessellated `points` + sparse `segments`.
3. `extractFaces` → tessellate + thread `kind` through edges/runs.
4. `tileGround` curb → offset-by-kind + tangent trim corners + topological ADA.
5. Editor → render beziers, then edit control points/handles.
6. v2 → loops + divided (closed/paired beziers).
**Top risks (carry forward):** offset-of-cubic is approximate at high curvature·depth (use sampled-normal; split tight Places); self-intersection when depth>fit-radius (cap radius + `dropFoldSpurs` guard); the two silent whitelists; grid byte-identity gate; `tilesFromFrozen` vs live-`extractFaces` must both tessellate (or Survey/Section desync).

---
*Drafted 2026-06-15 to dispatch the real fix after a long arc that proved densify-anything fails and the skeleton must store curves as primitives. Hardened with the Tessera (pipeline) + Concur (curb) forensics + Jacob's name-awareness. Sparse frame is the clean baseline; `checkpoint-before-skeleton-round` stands.*
