# The legacy chain shape pass — retired 2026-10-20

*Diary. Passages excised from the live canon when the pre-① chain shape pass was deleted from `buildTileGround`
(`BRIEF-retire-the-legacy-shape-pass`, Lintel, Boz's rulings). ①②③ had been the producer since 2026-09-06; the legacy
pass still ran on every build and every output it fed was overwritten. Kept for the record — what was believed, and why
it stopped being true. Each section names where it was cut from and the reason.*

## POLYGON-FIRST §1 — "THE TRUE RULE — two producers" (A07)
*From `cartograph/POLYGON-FIRST.md`. Reason: the A07 offset/carve split was a property of the LEGACY chain shape pass, which is deleted; under ① every block's curb is ② (`offsetRingByRects`). The census measured the legacy chain curb, a map nobody draws.*

> ### ⭐⭐ THE TRUE RULE — two producers, and the choice is RECORDED (A07, 2026-08-04)
> ⛔ **"The curb is the parallel offset of the skeleton" describes MOST blocks, not the map** — and it is
> the kit's most-quoted sentence, so it gets reasoned from on tiles it does not describe. **Check
> `producer` on the tile before you reason from it.**
>
> **What the code does:**
> - **`offset`** — the per-edge parallel offset (`chain ⊕ halfWidth`, corners as offset-intersections),
>   taken when `opts.iaOffset !== false && !isMedianTile && ringArea > 1500`. This is the rule for an
>   ordinary block.
> - **`carve`** — the legacy boolean carve (`tile.ring − aFill`) otherwise. ⭐ **This is CORRECT, not a
>   fallback**: a divided median, a loop-body median and a sub-block sliver genuinely are not
>   edge-offsets, and offsetting them collapses or blows up the ring. ⛔ Do not "fix" it by deleting
>   the carve.
> - **`degenerate:*`** — an offset that *passed* the gate and came back unusable (empty · collapsed
>   below 5% of the tile · overflowed past it). **THAT is a failure**, it is now counted and LOUD, and
>   *(the 5% is the THRESHOLD ITSELF, not a measurement — it is set at `degenerate:collapsed` in
>   `src/lib/tileGround.js`: `offArea <= 0.05 * ringArea`. ▶ `grep -n "degenerate:collapsed" src/lib/tileGround.js`)*
>   it is reported **separately** so it can never be buried among the routine structural carves.
>
> **Measured live, per scene, by the offset/carve split it reports per tile:**
> ▶ `node scratch/a07-producer-disclosure.mjs`
>
> The carved share ranges from a small minority of tiles (altadena) upward, with lafayette-square,
> lafayette-square-staging and hipointedemun spread across that range — **LS sits mid-range, not at
> either extreme.** ⛔ Re-derive with the command; never quote a figure from here.
>
> ⚠️ **THE TOP OF THE RANGE WENT WITH THE POLISH SCENES (excised 2026-09-19), AND THAT COSTS THIS
> SECTION EVIDENCE, NOT DOCTRINE.** The widest spread ever measured spanned six scenes, and the
> majority-carve end of it was `ksi-y-m-yn` — a town that no longer exists. The surviving roster spans
> a **narrower** range, so a reader running the command today sees a weaker version of the very effect
> this section exists to teach. ⛔ Do not conclude from that run that the spread is small: it was
> measured wide, on real data. What survives is the observation that the split is a property of *the
> town's block geometry*; the dynamic range that made it obvious re-appears at the next non-US pour.
> ⛔ **No figure is quoted here on purpose** — the old one ("7%→75%") outlived the scenes it was
> measured on and became exactly the unreproducible number `CLAUDE.md`'s prune rule forbids. The
> command above is the only answer.
>
> ⛔⛔ **THAT SPREAD IS THE POINT.** The invariant's truth is a
> property of *the town's block geometry*, not of the kit, so no single scene can tell you whether it
> holds. On the first non-US pour, **the clear majority of the map was built by the producer the docs
> did not mention** *(measured 2026-08-04 on a scene since excised — ⛔ the figure is not requotable;
> run the command on the current roster)*. An operator there reads "concentric offset," sees a
> plausible curb, and has no way to learn otherwise — which is exactly the silent-substitution shape `CLAUDE.md` Layer 0 forbids.
>
> **∴ every tile now carries `producer` + `producerReason` in `shape.json`**, the bake prints the split
> once per pour, and the tool shows it in the status bar. ⭐ **Degeneracy count: 0 on every scene** —
> and that is a *measured* 0 for the first time; this table asserted it without ever running the branch.

## ORIENTATION — "The curb has TWO producers"
*From `ORIENTATION.md`. Reason: it described the legacy chain shape pass's offset/carve split (A07), deleted 2026-10-20; the drawn curb has one producer.*

- **The curb has TWO producers, and the choice is recorded.** Most of the time the curb is the centerline stepped outward a fixed distance, parallel everywhere — fix the line, the curb follows. But a **median, a sliver or a dead-end disk is not an edge-offset**, so it is built by a **boolean carve** instead, and that is the *right* answer for it. ⛔ So *"the curb is a concentric offset"* describes **most blocks, not the map** — the carved share varies widely by town (▶ `node scratch/a07-producer-disclosure.mjs`). Which producer built each block is stamped into the frozen shape, because a reader who believes the headline debugs a carved tile with reasoning that cannot apply to it. → `cartograph/POLYGON-FIRST.md §1`, `ROADMAP A07`

## RIBBONS §1 — the three "① IS THE PRODUCER … `protoProducer` + `protoArtifact`" subsections
*From `cartograph/RIBBONS.md`. Reason: the two flags are deleted (① is the only producer, 2026-10-20); the subsections narrated the switch between two producers.*

>   ### ⭐⭐⭐ ① IS THE PRODUCER, AND IT IS ON — 2026-09-06. `protoProducer` + `protoArtifact`.
>   ⛔ **A change of CONSUMER, not of construction** — the distinction `5560cf6a` turns on. ②③ already
>   offset the grout contour; the artifact freezes what they made. No geometry was written to land it.
>   **The tile carries `bands` AND `runs` AND `SECTION §4`'s freeze list** (`ring · iA · vertR ·
>   fillets · runs`, each run with its `baseMeasure`). ⚠️ Two earlier claims here are STRUCK:
>   *"the tile carries BANDS, not `runs`"* — `§4` freezes run identity by ruling, and `§3.2` calls it
>   design intent, not chain geometry; and *"OFF BY DEFAULT, proven twice"* — both flags are ON in the
>   Designer, so **`a03-curb-identity` no longer guards this path** and the byte-identity proof covers
>   only the legacy build.
>   ⛔ Shipping `bands` freezes the FILL, which `SECTION §4` names as the Phase-D over-reach. Open
>   there, with the measurement and the one-line flip.
>   ### ⭐⭐⭐ AND THE AXIS IS **CHAINS vs ①**, NOT "FROZEN vs LIVE" — corrected 2026-09-06 (Jacob)
>   > *"It may be mechanically impossible to not use the chains, but the EFFECT needs to be we work
>   > from the simplified protopolygon."*
>
>   `sectionFrozen = !surveyActive`, so with the Survey tool selected the Designer does not read
>   `shape.json` — it live-builds. ⛔ **That is NOT a reason Survey must draw the chain curb, and
>   stating it as one is a defect dressed as a constraint.** ① is frozen into `ribbons.json`, which the
>   live build ALREADY LOADS, so **the live build can build from ①** without touching the frozen-shape
>   boundary at all. `opts.protoProducer` does exactly that, and the console proves the source:
>   `[tileGround][①] source: frozen`.
>   ⇒ **The requirement is that the SHAPE comes from ① everywhere** — frozen or live, Survey or
>   Section. Where the code happens to touch a chain to get there is secondary; what may not happen is
>   a curb whose shape is a traced chain.
>   ### ⭐⭐⭐ SURVEY **AND** SECTION ARE ON ① — LANDED 2026-09-06. `protoProducer` + `protoArtifact`.
>   ⛔⛔ **SWAPPING THE `curb` SLOT ALONE WAS NOT A HALF-STEP, IT WAS A WRONG STEP.** It painted one
>   ①-built line on top of a chain-built map and the two did not agree — and the slot holds a **BAND**,
>   not a ring, so handing it ② (the block's inner polygon) filled every block solid: **2,125,205 m²
>   against the legacy curb's 25,202 m².**
>   ⭐⭐ **THE CONSUMER ALREADY EXISTED.** `sectionOpen` consumes a tile that CARRIES ITS BANDS as-is
>   (`if (st.bands)`) and unions them into asphalt / curb / sidewalk / treelawn / LU / block; ③ produces
>   exactly that tile. ⇒ **`protoProducer` now runs `sectionOpen(protoShapeTiles, …)` and takes every
>   layer from it** — a change of CONSUMER, not of construction, with no per-layer reimplementation.
>   ⛔ `highway` is deliberately NOT swapped: a grade-separated road is its own swept object (`H`, `BRIEF-highway-build`)
>   and ② builds no highway curb, so swapping it would invent a production never had.
>   ▶ `node checks/claims-survey-and-section-agree.mjs` — LS: 118 tiles, all `producer:'proto'`,
>   all carrying bands; **asphalt, curb, sidewalk and block agree to 0 m²** and the LU class sets are
>   identical. That gate is the definition of "the same thing".
>

## RIBBONS §1 OPEN item 2 — "GATE C IS REAL" (the leg-tail measurement)
*From `cartograph/RIBBONS.md`. Reason: its baseline was the legacy chain curb (`_shapeArtifact` without protoArtifact), a map nobody draws; claims-proto-leg-tail-is-corner-reach and claims-proto-legmiss-by-producer retired with the legacy pass. The finding stands as history, not as evidence about ②.*

>    ### ⛔⛔ MEASURED WHOLE-TOWN 2026-09-06 — **GATE C IS REAL. THE HANDLES ARE NECESSARY AND NOT SUFFICIENT.**
>    ▶ `node checks/claims-proto-leg-tail-is-corner-reach.mjs` — bins every non-highway ② vertex by
>    distance to the nearest node, because **12 m was an arbitrary cut and "leg" vs "corner" was one
>    population split at a guess.** The question it settles: does the miss DECAY away from nodes (⇒ it is
>    corner reach, and building the handles closes it) or PLATEAU (⇒ a mid-leg error handles cannot touch)?
>    **On LS it PLATEAUS in the far field (≥20 m from any node).** ⇒ ⛔ **Do not scope the handles as the
>    close of ②.** They remain owed — the corner zone's miss is still expected and still theirs.
>    - ⭐ **AND IT IS NOT A BASELINE ARTIFACT — checked before the claim shipped.** The baseline is this
>      run's own `iA`, and `A06` says 42 of LS's 101 tiles still build `iA` by the legacy carve, so the
>      obvious reading was *"② only disagrees with the half we know is chain-built."* **It does not** —
>      split by A07's producer stamp, ② misses `offset` and `carve` about equally, and carve is if anything
>      the closer of the two. ▶ `node checks/claims-proto-legmiss-by-producer.mjs`
>      *(`feedback_verify_the_baseline_before_comparing_to_it`, applied before the conclusion, not after.)*
>    - ⛔ **CAUSE NOT ESTABLISHED.** Nothing here says what the mid-leg error IS.
>    - ⛔ **HPDM CANNOT ANSWER THIS QUESTION TODAY** — a majority of its ② vertices find no baseline edge
>      at all and are reported `UNMEASURABLE` as their own class, so the scene gets **no verdict** rather
>      than a number. **That is its own open item, and a green LS is not evidence about it.**

## RIBBONS §1 — "Slice 1 — the degree-1 coupler" and the coupler-totality finding
*From `cartograph/RIBBONS.md`. Reason: its consumer, slice 2's substrate walk (`substrateWalk.js`), was never called and is deleted; the junctionMap has no reader left (its producer in derive.js is the named leftover); claims-coupler-totality retired.*

> ### ⚠️ Slice 1 — the degree-1 coupler — CODE LANDED `a2e0f6c4`; ⛔ REACHES NO ARTIFACT UNTIL A RE-POUR, AND THE RELATION IS NOT TOTAL (2026-08-12)
> The cap **is** a coupler: the CCW sweep's same-arm guard was dropping the one-arm case, so `via:'cap'`
> now wraps a tip's two side-chains around the spike. ⛔ **It reaches NO artifact until a pipeline
> re-pour** — `derive.js` is prebake. `src/data/ribbons.json` carries cap couplers; the five per-scene
> bundles carry none. ⭐⭐ **COUNT STRUCTURALLY, NEVER BY STRING: `grep '"via":"cap"'` returns 0 on a
> PRETTY-PRINTED file** (`"via": "cap"`) — a claim and its independent re-check were both made with that
> same brittle match, so they agreed and were both wrong.
> `node -e "const r=require('./src/data/ribbons.json');let n=0;for(const d of r.junctionMap.nodes)for(const c of (d.cornersAdjacent||[]))if(c.via==='cap')n++;console.log(n)"`
> ⛔ **Re-run the line above; never quote it.** Harmless today (`PREBAKE §2.5`), but **slice 2's walk
> consumes it ⇒ the re-pour is on the critical path.**
> ⛔ **AND THE RELATION IS NOT TOTAL, despite `derive.js:4373` claiming it is** — `dirs.length < 3`
> silently drops **degree-2** (continuation · same-corridor-join · divided-transition). LS 4 nodes /
> HPDM 18. No new coupler *kind* is needed: 100% of the hole is an end-to-end weld of two distinct
> chains, which the existing CCW sweep pairs correctly. ▶ `node checks/claims-coupler-totality.mjs`.
>

## RIBBONS data model — "The TILE (`extractFaces`)" and "The curb SHAPE — `iA`"
*From `cartograph/RIBBONS.md`. Reason: it documents the legacy chain shape pass (deleted 2026-10-20) as the live construction; ①②③ (`§1`) is the only producer.*

### The TILE — the block face (`extractFaces`)

`extractFaces(streets)` (`tileGround.js:508`) builds a planar graph from the **shared vertices** of `streets[].points` (grade-separated streets excluded) and walks its faces. Each enclosed face is a **tile** — a city block, bounded by the centerlines that surround it. The tile is the unit everything is painted onto.

- **The grout is the centerline**, not a drawn line. A tile's edges ARE segments of the bounding streets' centerlines.
- **Near-coincident endpoints are welded** before the walk (`ENDPOINT_SNAP`) so a loop body that closes within a few cm reads as a closed face, not an open pendant — this is what makes a loop's **median = the emergent enclosed face** (`LOOP-STREETS.md`).
- **Dead-ends** render woven with their authored cap; the pendant-prune was reverted (asphalt is tile-sourced — pruning deletes the road; `SECTION.md §6`).

### The curb SHAPE — `iA` (the frozen polygon)

The curb is the per-edge **parallel offset** of the centerline: `iA = chain ⊕ pavementHW` per side (`offsetRingVariable`; D6a — the curb is an offset, not an asphalt-union carve) — **for the tiles that qualify.** ⛔ **The offset is GATED:** `tileGround.js` takes it only when `opts.iaOffset !== false && !isMedianTile && ringArea > 1500`; everything else takes `legacyBlock()`, the asphalt-union carve, **as its primary path** — correctly, since a median or a sliver is not an edge-offset. ✅ **The choice is no longer silent — every tile carries `producer` + `producerReason` in `shape.json`** (A07, `0464c136`), and a qualifying offset that comes back degenerate is now a **loud, separately-counted failure** rather than a quiet swap. ⛔ So *"the curb is a concentric offset"* is true of the **majority, not of the map** — the carved share runs from single digits to three quarters depending on the town's block geometry — **and a defect on a median or a small tile will not respond to offset-side reasoning. Read the tile's `producer` before you reason about its curb** (`node scratch/a07-producer-disclosure.mjs`; ⛔ don't quote a share without re-running it). `ROADMAP A07`. Corners are rounded **once** by `filletRing` (`tileGround.js:262`) — the single legitimate rounding (analogous to figure-ground's `applyRoundCornersToRing`). The curb's render differs by tool:
- **Survey (live, pre-Wall):** re-stroked every frame by `buildTileGround` (`sectionFrozen=false` → `tileGeos`).
- **Section (frozen, post-Wall):** read from `shape.json` (`sectionOpen` off the frozen `_shapeArtifact`); the live stroke is gated OFF. (`SKELETON §3.5` — the render-path map.)

## RIBBONS §3.2 "Tiles — extractFaces" and §3.3 "The curb SHAPE — offsetRingVariable + filletRing" (incl. the 18th/Dolman tooth)
*From `cartograph/RIBBONS.md`. Reason: it documents the legacy chain shape pass (deleted 2026-10-20) as the live construction; ①②③ (`§1`) is the only producer. The 18th/Dolman tooth was a defect in the legacy `cornerAt` key; that construction is deleted.*

### 3.2 Tiles — `extractFaces` (`:508`)

Builds the planar graph from shared vertices of `streets[].points` (excludes `gradeSeparated`), welds near-coincident endpoints (`ENDPOINT_SNAP`), walks the enclosed faces. Output: the tiles, each carrying its bounding-street edges (skelId/side per edge). Loop interiors emerge as faces (→ median, `LOOP-STREETS.md`). ⛔ **CORRECTED 2026-08-12 — "the outer/perimeter face is INCLUDED so exterior streets get asphalt (G9)" is FALSE, and `PIPELINE §5 (the Wall)` carries the same false sentence.** `tileGround.js:984` drops **every** non-positive-area face, the outer face included (its only filter is `signedArea > 1e-3`). **What actually happens:** `derive.js:4632-4648` clips the face-streets to the boundary and **injects the boundary ring as closing edges** (`skelId: '__boundary__'`), so the perimeter faces close into real bounded tiles — **31 of the 101 carry a `__boundary__` edge.** ⭐ The mechanism matters: it is exactly what the punch-out reproduces for free against the raw boundary (§1's outer-polygon note).

### 3.3 The curb SHAPE — `offsetRingVariable` + `filletRing`

Per tile, per edge: stroke the centerline outward by `pavementHW` (per-side, per-run via `runMeasure`) → `iA`, the curb edge. `offsetRingVariable(ring, depthAt, cornerAt, capAt)` does the variable-depth parallel offset; `cornerAt` uses the run-seam test (real corner vs through-node) so a width step doesn't appear at a through-node — ⛔ **which key it reads is a live defect, see the block below.** `filletRing(ring, Rfn, sink)` rounds the curb corners **once** (radius from the authored corner-R kit: global scale × per-IX × per-corner). `strokeOpen(polyline, delta)` handles open/perimeter runs. **jtMiter throughout** (invariant 2). This is the SHAPE that freezes at the Wall. ⛔ **All three — `filletRing`, the jtMiter doctrine and the miter limit — retire under §1's 2026-09-04 grout ruling** (the node carries the intention; nothing rounds twice). *(Line numbers deleted 2026-08-13 — all three had drifted 2–3× over; grep the function name.)*

> ### ⛔⛔ THE 18th/DOLMAN TOOTH IS A **REGRESSION**. THE CURE EXISTS, EYE-APPROVED, AND IS OUTVOTED BY A LATER KEY. *(Measured 2026-08-13, agent Wend, `1cadbceb`; framing corrected by Jacob 2026-08-14.)*
>
> **Both of these are true and there is no tension between them:** Dolman, West 18th and South 18th **are different streets** — the name changes because the street changes — **and they join in a SMOOTH U**, which must carry no corner. ⭐ **`roadId` never claimed they were one street. It claimed the ROAD RUNS THROUGH**, which is exactly what a smooth U is. The 2026-06-15 cure did that and was eye-approved *("it's finally fixed")*.
>
> ⛔ **What broke it:** `cornerAt` keys on `streetKey = throughId || roadId || skelId || name` (`src/lib/tileGround.js`, grep `const streetKey =`) — **not `skelId`**, as four docs claimed — and **`throughId` is a street NAME** (`cartograph/skeleton.js`, grep `idKeyOf` → `corridor || name`). Added later by the terminal-node sweep and placed **ahead** of `roadId`, so at a name change the key differs and a corner fires. **`roadId` is computed, frozen, and never consulted at the one seam it exists for.**
> ⭐ **THE FIX IS RESTORATION, NOT INVENTION: a through-node if EITHER union agrees** — which keeps `throughId` doing its own job at a spine↔carriageway divided transition, the reason it was added (`derive.js`, grep `Distinct from roadId`).
> ⭐⭐ **BLAST RADIUS IS SMALL AND MEASURED — this is NOT a change to what a corner means everywhere.** The two keys can only disagree where `roadId` says *same road* and the name says *different*, i.e. at a name transition: **LS 6 stations, 3 sites.** Everywhere else both keys agree and the answer is identical.
> ⛔ *(Struck 2026-08-14, and it was Boz's, recorded as Jacob's: "identity is right to say different, so the fix is a GEOMETRY condition on `cornerAt`, and treating the union as one road is barred." That retracted a correct proposal by over-reading a remark, and filed a **regression** as a **missing feature** — the most expensive shape of error in a corpus where the cure is already written.)*
>
> **What actually renders the artifact, measured.** Identity alone is benign: 4 of LS's 6 flagged stations carry Δ`pavementHW` 0.0000 → displacement ≤6 mm. It becomes visible when a **width step rides it**. At West-18th↔Dolman a **1.4369 m unauthored step** across that 3.24° turn puts the two offset lines' intersection **26.15 m** out — past the **18.32 m miter limit — so a CLAMP fires and substitutes a bevel**, emitting two points instead of one: a 1.4786 m chord at 78°/102° to the road. Frozen `iA` runs 5.490 m, swings to 8.826 / 11.075 m across the fillet rounding that bevel, returns to 6.927 m — **excursion 3.34 / 5.59 m off a curb that should be parallel.** That is the tooth-and-chamfer on the U.
> ⭐⭐ **THE CLAMP IS THE TELL.** It is a guard covering for a construction that degenerates as the legs approach parallel — **a cleanup patch living inside the construction**, which the ruling below forbids. ⛔ **The fix is therefore not a better clamp and not a smoother: a near-tangent seam must not enter a line-intersection construction at all.** That is INVARIANT 1 already — *the corner is the band BENT around the arc.*
>
> **Two things left open, both unmeasured — do not close them by reasoning:**
> - **Why the side labels flip at this seam.** The flip and the width step co-occur here; the two non-flipping sites carry Δ 0. **Cause not established.**
> - **Whether `continuesAs` should join these three streets at all.** It builds `roadId`, and `roadId` is what the width reconcile uses to force ONE `pavementHW` per side across the union — plausibly the source of the 1.4369 m step. **Unmeasured.** (Next §, the width-step line: the reconcile compares by literal side label, and this seam joins a *left* run to a *right* run, so the two values that physically meet are never compared.)
>
> ⭐ **The class ports — the test names no street:** `roadId agrees ∧ throughId disagrees`. **LS: 6 stations, 3 sites.** ▶ `node checks/claims-uturn-outer-edge-walk.mjs`
> ⚠️ **`scratch/correctness-detector.mjs` already flagged this** (`West 18th Street: curb(1.45m) bump(97°)`) and it sat unjudged in the "grid false-positives" bucket. **The detector worked; nobody read it.**

## RIBBONS §3.5 — "Median (divided) — a WALKED FACE"
*From `cartograph/RIBBONS.md`. Reason: the walked face (`extractFaces`), `isMedianTile` and the universal carve were the legacy chain shape pass, deleted 2026-10-20.*

- **Median (divided) — a WALKED FACE (the as-built home; `§1`'s 2026-08-14 ruling is the doctrine).** The median is the block face `extractFaces` produces between the two carriageway chains. **Identity: RETIRING** — today `isMedianTile` reads `phase.role`/`phase.pairKey` (a tile bounded by both carriageways of one pair); `§1` replaces it with the polygon rule, and measured the chain flags to find nothing the polygon does not. ⛔ **A left/right side test was TRIED AND REVERTED** — the measure `side` is point-order-relative *per chain*, so a pair's two carriageways disagree on which side faces the median (Lafayette: A matches the inboard oracle, B does not). **Grass:** the tile's `luRemainder` (the open-field flood, `SECTION §3`) — no clip, no ring. ⛔ *(The "ped bands already zeroed" that used to qualify this is retired by `§1`: ped presence comes from `gleanTreelawn`'s ladder like any other block.)* **Curb:** the universal carve `differenceRings([tile.ring], aFill)`. **The nose, crossings, and no-median all fall out** once the carriageway widths are per-side: where the carriageways converge or a cross-street crosses, their asphalt closes the gap → `luRemainder` empty. `derive.js` keeps only `noseRecs` + corridor **merge asphalt**; the median STAMP RING is deleted. *(OPEN: nose rounds with the standard cap/fillet; the merge-asphalt may be removable once the junction lands — `HANDOFF-junction-construction.md`.)*

## PIPELINE step 3 — the two producer flags
*From `cartograph/PIPELINE.md`. Reason: `protoProducer`/`protoArtifact` and the bake's `--proto`/`--legacy` are deleted: ① is the only producer (2026-10-20).*

**Every layer either tool draws comes from ①②③.** Two flags, and the split between them is the whole
point: **`protoProducer` swaps what SURVEY DRAWS · `protoArtifact` swaps what SECTION OPENS.** Both are
ON in the Designer (`BlockGeometryV2Debug.jsx`, grep `protoProducer`), and the bake takes `--proto`
(argv, deliberately — this codebase gates on argv, not `process.env`).

## PIPELINE step 3 — "Both flags REFUSE" and the `--proto` CLI note
*From `cartograph/PIPELINE.md`. Reason: the flags are deleted; the refusals remain, unconditional.*

⛔ **Both flags REFUSE rather than fall back** — asking for ① and silently getting the chain artifact is
the plausible-looking success Law 2 forbids.

> ⚠️ **The `--proto` CLI bake is NOT how Section gets its artifact** — §5, *"who writes the frozen file."*

## PIPELINE step 3 — "`?grout=1` IS NOT ①"
*From `cartograph/PIPELINE.md`. Reason: the `?grout=1` overlay (buildTileGround's `opts.grout` branch and the Designer's `GROUT_ON`) is deleted; it drew nothing on any live path.*

> ⛔⛔ **`?grout=1` IS NOT ①, AND CONFUSING THE TWO WILL COST YOU A DAY.** The grout overlay strokes each
> chain at the **authored half-width** and unites them — offset-then-polygonize, the old order. It builds
> **the curb**, not the protopolygon; `RIBBONS §1` says so in as many words. Two different constructions
> that happen to share a block of code and a nearly-identical flag name (`grout: true` from the URL vs
> `grout: 'proto'` from the bake).
> ⚠️ **And the overlay shows nothing at idle anyway** — it is gated on the live build, which does not run
> while the frozen path renders. **An overlay gated on a live build is invisible in the state the
> operator actually sits in.**

## PIPELINE — "AND THE CURB HAS TWO PRODUCERS"
*From `cartograph/PIPELINE.md`. Reason: it described the legacy chain shape pass's A07 offset/carve split; the drawn curb (②) has one producer.*

> ### ⛔ AND THE CURB HAS **TWO** PRODUCERS — do not say "the curb is a concentric offset" and stop there
> Most of the time it is: the centerline stepped outward a fixed distance, parallel everywhere. **But a
> median, a sliver or a dead-end disc is not an edge-offset**, so it is built by a **boolean carve**
> instead — and that is the *right* answer for it, not a degradation. ⛔ *"The curb is a concentric
> offset"* therefore describes **most blocks, not the map**, and the carved share **varies by town** —
> ▶ `node scratch/a07-producer-disclosure.mjs` — so **no single scene reveals the split.**
> ⭐ Which producer built each block is **stamped into the frozen shape** (`producer` +
> `producerReason`), precisely because a reader who believes the headline will debug a carved block with
> reasoning that cannot apply to it. **Read the stamp before reasoning about a curb.**
>
> *(This bullet exists because the previous edition of this doc printed the headline as one of two
> "load-bearing facts" and never mentioned the carve. Filed as rot in the 2026-09-06 survey.)*

## PREBAKE §2.5 — "THE COUPLER RELATION IS PRODUCED HERE AND ITS CONSUMER IS SWITCHED OFF"
*From `cartograph/PREBAKE.md`. Reason: the consumer (`substrateWalk.js`) and the junctionMap's other reader (the legacy pass's E3.2/E3.3) are deleted; the producer is a named derive.js leftover.*

> ### ⭐ THE COUPLER RELATION IS PRODUCED HERE AND ITS CONSUMER IS SWITCHED OFF
> *(The consumer-status fact `RIBBONS §1` and `POLYGON-FIRST §2.1/§3` point at this section for —
> keep it here, do not restate it there.)*
> `junctionMap.nodes[].cornersAdjacent` is stamped at prebake (`derive.js:4353`/`:4358`, serialized
> `:4410`) and is complete at every T and cross. **Its only consumer is `src/lib/substrateWalk.js`,
> and the walk is DEFAULT-OFF STRUCTURALLY** — `tileGround.js:4709` gates it on `opts.substrateTiles`
> (passed by nothing) or `SUBSTRATE_TILES=1` (absent in the browser). ⇒ **production tiles are the
> frozen `shape.json`.** ⛔ **So a defect reasoned through `cornersAdjacent` explains nothing the
> operator is looking at**; it is a blocker on the walk becoming the producer, and scoped to that.
> ▶ `grep -rn "substrateTiles\|cornersAdjacent" src cartograph --include="*.js" --include="*.jsx"`

## POLYGON-FIRST §3 — "AS-BUILT — the producer split" (A03) and "CHECK C IS STILL RED"
*From `cartograph/POLYGON-FIRST.md`. Reason: `freezeCurbEdgeFacts`/`buildCurbRings`, the legacy carve and `aFill` were the legacy chain shape pass, deleted 2026-10-20. Under ① the curb is ② (`offsetRingByRects`).*

> ### ✅ AS-BUILT — the producer split LANDED 2026-07-31 (`4dd05303`, branch `a03-freeze-curb-prebake`)
>
> The producer is now two functions, split at the chain boundary (`src/lib/tileGround.js`):
>
> | | | |
> |---|---|---|
> | **`freezeCurbEdgeFacts()`** | chain-DERIVED | reduces runs/streets/measures to **one fact per RING EDGE** — `{skelId, side, segOrd, baseHW, prof, streetKey}`. The only half that touches a chain. |
> | **`buildCurbRings()`** | chain-FREE | `ring + facts + authoredHW → iA`. No `streets`, `runs`, `measures` or `ribbons` in lexical scope. |
>
> ⭐ **`baseHW` is frozen PRE-authoring; the override applies inside the builder.** That is what keeps
> the facts **look-agnostic** — one scene's facts serve every look bound to it — while the curb still
> honours the operator (Layer 0 q3). It is also the specific thing the impossible D6b wording got
> backwards.
>
> ⭐ **The flagged hard case REDUCED — the divided-transition outer profile IS a per-edge fact.**
> `outerHWProfile` is already a per-**vertex** frozen stamp, so the two lookups resolve at freeze time
> and store as a `[a|null, b|null]` pair per edge; the builder never needs the chain that carried it.
> This was called out as the case most likely to fail. It did not. **Whoever takes the carve (below)
> should expect the same to be possible there.**
>
> **Acceptance: `scratch/a03-curb-identity.mjs`** — byte-identical on **both** the authored state
> **and** bare defaults, across artifact / block / curb / asphalt / sidewalk / fillets, hashed per
> tile. ⭐ Both states are gated deliberately: a refactor identical on LS but not on a fresh pour would
> repeat exactly the Check A blindness (§2, Check A) it was written after.
>
> ### ⚠️ CHECK C IS STILL RED — and this is the honest scope of what landed
>
> The chain-free producer owns a majority of tiles, not all of them. The rest still route through the
> legacy carve (`tile.ring − aFill`), **and `aFill` is chain-derived**:
> ▶ `node scratch/a07-producer-disclosure.mjs` — reproduces the current offset/carve split, broken
> out by legacy-carve reason (divided median, loop-body median, small tile), and the degeneracy count.
>
> | path | reason |
> |---|---|
> | chain-FREE offset producer | Check C holds here |
> | legacy carve — **divided median** | structural (offsetting both inner edges collapses the thin gap) |
> | legacy carve — **loop-body median** | structural (`medArea > 0.5` on a single-run tile) |
> | legacy carve — **small** tile | structural (`ringArea ≤ 1500` **and not already median**) |
> | legacy carve — degenerate | every tile that qualifies for the offset path succeeds on it |
>
> ⚠️ **Corrected 2026-07-31:** this table first conflated the two median classes and mis-split the
> total. `isMedianTile` is `isDividedMedian || (isLoopInterior && medArea > 0.5)` — two different tile
> kinds behind one flag. ⚠️ **The "small" row is NOT the count of `ringArea ≤ 1500` tiles alone** — it
> is *small AND not already median* — and reading it as the raw small-tile count is what produced a
> "the table is wrong" report. And the artifact's `isMedian` is written from `isDividedMedian` **alone**
> (`tileGround.js:3627`), so any count taken off it is a **floor**.
> ⛔ **`D6a`'s comment above this gate also lists DEAD-END tiles as a legacy-carve class. It is stale** —
> the gate is `!isMedianTile && ringArea > 1500`, with **no dead-end condition**; dead-end tiles take the
> OFFSET path and their caps are built in via `capArc` twelve lines below.
>
> ⛔ **The chain was NOT passed into `buildCurbRings` to cover the legacy-carve tiles.** That is the
> quiet re-opening the signature exists to prevent, and declining it is why the gap is countable
> instead of hidden. **Do not claim Check C green — re-run the command above before quoting a share.**
>
> ⭐ **What this bought, stated plainly:** the producer defect went from *"the curb is traced from
> chains"* — unbounded and unmeasured — to **42 named tiles in two structural classes**. Bounded and
> countable beats green-by-redefinition.
>
> **Left open, deliberately unbundled:** freezing `aFill` so the legacy carve is chain-free too
> (**A06**) — a materially bigger change against a *different* class of tile; bundling it would put two
> risks behind one byte-identical proof. And moving `freezeCurbEdgeFacts` into `derive.js` is a
> **freeze-once optimization, not a Check C requirement** — same shape as `sectionPass`, which is
> chain-free at its signature while something upstream built its input from chains. Do it when there is
> a reason beyond tidiness; it touches prebake and the artifact, which is the one thing that could cost
> the byte-identical property.

## SURVEY §3 — "The SHAPE pass, in execution order" and "TWO chain reach-backs"
*From `cartograph/SURVEY.md`. Reason: it documented the legacy chain shape pass (extractFaces → strokeOpen → filletRing → capacity guard → freeze), deleted 2026-10-20; the live construction is ①②③.*

The SHAPE pass, in execution order:

1. **`extractFaces(streets)` (`:303`) → the Tiles.** A half-edge DCEL planar walk over the **shared-vertex graph** of `ribbons.streets[].points` (nodes keyed to 0.1 mm). Each bounded face = one tile, tagged per-edge with its owning `(street, side)`. **Grade-separated streets are filtered out first** (`:600`) so a 2D crossing with no shared vertex can't bowtie the faces; they're stroked separately as flat asphalt and rendered behind the local network.
2. **Outward stroke → the asphalt silhouette.** `groupRuns` (`:450`) collects each tile's boundary into maximal runs of one `(street, side)`; `strokeOpen` (`:198`) offsets each run **outward** by the asphalt half-width `edgeDepth(runMeasure(run), side, 'A')`. Dead-end **round** tips get a circle cap; **blunt/none** tips stay flat.
3. **`filletRing` (`:90`) rounds the convex corners ONCE → the curb line (`iA`).** Per-vertex radius via `resolveVertR` (`:715`), 3-tier: **per-corner** override → **per-IX** override → default (4.5 m AASHTO × `cornerRadiusScale`). The achieved arcs are tagged into **`cornerFillets`** (`:920`) — the *one* corner truth the magenta authoring handle reads (no re-derivation). `jtMiter`, never `jtRound` (jtRound re-rounds and corrupts operator R=0 squares).
4. **Capacity guard (`:951`).** Engages **only on FULL collapse** — `if (!offsetRings(iA, −(WB/0.9)).length)` then bisects to `cap = 0.9 × inscribed reach`. ⚠️ A tile that pinches to a thin *non-empty* sliver keeps `cap = WB` (no clamp) → the inward offsets still run past the medial axis and `filletRing` thorns them. So this catches *full* degeneracy, **not** the partial-degeneracy thorn class (the persistent ~100 thorns — `HANDOFF-band-fold-fix.md`).
5. **Asphalt = `tile.ring − iA` (`:958`); Block = `iA`** (the rounded inner region = `tile − aFill`, rounded). The `block` output is the union of per-tile `iA` (`:1101`) — the positive polygon to the curb edge (consistent with §1: *block = tile − asphalt*).
6. **Freeze → `shapeTiles[]` (`:961`).** Per tile: `{ ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, roundTipKeys, runs: runMeta[], bandJoin, cap }`. The JSON-safe `_shapeArtifact` (`:1108`, built **only** when `emitArtifact` — bake-side) is the frozen hand-off across the wall.

> ⚠️ **There are TWO chain reach-backs in the SHAPE pass, not one.**
> 1. `runMeasure`/`runSegOrd` resolve a run's authored `pavementHW` from `blockCustoms[skelId][side][segOrd]` — **authoring identity, not geometry**; it answers "which width did the operator type for this edge."
> 2. ⛔ **`freezeCurbEdgeFacts({ring, runs, streetsOrig, measures, …})` is a GEOMETRIC one.** It reads `streetsOrig[].outerHWProfile`, `phase.role`, `throughId`/`roadId` and per-run base half-widths to stamp one fact per ring edge — and those facts are exactly what the curb producer offsets from. The chain-freeness that IS structural sits one step later, at `buildCurbRings({ring, facts, authoredHW, capAtVertex, curved})`, whose signature is the guard (A03).
>
> **∴ "the SHAPE pass is nearly chain-free" overstates where the wall sits.** The wall is at the *producer*, not at the pass. *(Corrected 2026-08-04 — this paragraph is cited as evidence for where the Wall effectively is, and the argument is weaker than it read.)*


---

## The junctionMap producer leaves derive.js (integration merge, 2026-10-20, Lath for Boz)

`derive.js`'s E3.1 junction map, its `noseRecs` feed and `medians[].absorbedBy` are deleted; `ribbons.junctionMap` is no longer
written. ROADMAP's open item about its node positions is moot and moved here as it stood:

- **⛔ `junctionMap.nodes[].at` does not sit on `ribbons.streets`' vertices — 1–10 cm off on most nodes** *(Flare, 2026-10-06, measured)*. Exact-coordinate matches: LS 32 of ~650 · huron 59 · HPDM 260 · provincetown 144; most fall at 1–10 cm. JM is on a 1 mm grid (LS 543/550); ribbons points are not. ⇒ the two are built from slightly different geometry in one prebake, against `SKELETON §0.1`'s ruling that every consumer takes the ONE simplified skeleton. Cause not established. (The corner junction stamp sidesteps it by binding on chain identity, not position.) S–M · → `cartograph/derive.js` (junctionMap), `SKELETON §0.1`.
