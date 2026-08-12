# Polygon-First — made enforceable

> **The doctrine, reduced to checks.** "Polygon-First," "chains die at the wall," "the curb is frozen" are *outcomes stated as nouns*. This doc replaces each with a **test that is red until the outcome is true** — so "done" can never again be claimed over a thing that isn't. If a Polygon-First claim anywhere in the corpus doesn't cite a check below, it is aspirational, not done.
>
> SSOT for the curb-geometry gap that motivated this: `PREBAKE.md §4.1`/`§5`, `SKELETON.md §5f`. This doc is the *enforcement* layer above them.

---

## 0. Why this doc exists (the reckoning, 2026-06-09)

The program built walls, sequenced bakes, and a whole vocabulary around freezing chaotic OSM chains *once* into rigid polygons that every downstream consumer trusts. It mostly worked. But the **street curb** — the most visible polygon on the map — was never actually frozen from the frame. *(2026-07 status update: two of the specifics below have since moved — see the ⤷ notes — but the core defect stands: the curb is minted by the live producer, not built once from the frozen frame.)* It is still **re-stroked live by `buildTileGround`** and snapshotted, so it is a photograph of a chain-stroke, not a function of the frozen frame.
> ⤷ **The construction changed (D6a landed):** `iA` is no longer the `tile.ring − aFill` union-carve — it is the **per-edge parallel offset** (`offsetRingVariable`, `chain ⊕ pavementHW`, `src/lib/tileGround.js:2728/2810`; the carve survives only as a degenerate fallback `legacyBlock`). So the "d"-bulge-from-the-carve framing is superseded (the divided-"d" instance was separately cured at the frame, `fd38c70`).
> ⤷ **The consumer/idle side froze (2026-07-15):** Survey/Design no longer "re-derives every frame" — it now **consumes the frozen `shape.json` via `sectionOpen`** for idle display; only the **element under the operator's hand** re-strokes live (`BlockGeometryV2Debug.jsx`, the load-forensic work). What remains RED is the **producer** minting the freeze from chains at bake/edit — Check C below.

**How it slipped through, precisely:**
1. **The curb geometry was *deliberately excluded* from the freeze**, on a wrong premise. The polygon-ization was cut into three layers (`PREBAKE-POLYGONIZATION-PLAN.md §1`): **L1** topology (= D2, done — `derive.js:3922`), **L2** corner identity (= D3, parked), and **L3 the stroked curb line** — *"NOT L3 … asphalt offsets + fillets stay in Survey's live reshape."* The premise was that the live reshape is a benign "offset by width, round by radius." It isn't — it's the `tile.ring − asphalt-union` carve, where the junction strokes leak the chains back in. **The freeze stopped one layer short of the layer that leaks.**
2. **The Section wall *masked* it.** A curb *was* frozen — the bake's `_shapeArtifact` carries `iA` per tile (`SURVEY.md:63`), and `sectionOpen` reads it chain-free (`WALL.md:51`). But that frozen curb is a **downstream snapshot of the live re-stroke** (same engine, baked later — bulge and all), and **Survey never consumes it.** "We have a frozen curb behind the wall" was true and false at once, and nothing made the contradiction visible.
3. **The doctrine was *described*, not *enforced*.** The one place it's structurally guaranteed is `sectionPass`/`sectionOpen` — they have **no chain in lexical scope**, so Section physically *cannot* re-derive (`tileGround.js:581`, `:825`). Everywhere else "chains die" was a principle you had to remember. The producer never had to. **Names that don't reduce to a test are how "done" got claimed over an unfrozen curb.**

We are not at zero. The gap is named, the mechanism is understood, and below it becomes a check.

---

## 1. The invariant

> **The curb is a pure function of the frozen frame.** It is produced **once**, in prebake, frozen beside the topology, and **consumed** — never re-derived — by every downstream stage. The only live re-derivation permitted is the **single element under the operator's hand**, which re-freezes on commit.

This mirrors the one enforcement that already works (`sectionPass` closure), moved to the **producer** side: a `buildCurb(frozenFrame) → curbPolygon` with no live chain-stroke union in scope.

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
>   it is reported **separately** so it can never be buried among the routine structural carves.
>
> **Measured live, all scenes, 2026-08-04** (`scratch/a07-producer-disclosure.mjs`):
>
> | scene | offset | carve | carved |
> |---|---|---|---|
> | lafayette-square | 59 / 101 | 42 | 42% |
> | lafayette-square-staging | 69 / 116 | 47 | 41% |
> | altadena | 643 / 694 | 51 | **7%** |
> | hipointe-demun | 106 / 196 | 90 | 46% |
> | centrum | 251 / 571 | 320 | 56% |
> | **ksi-y-m-yn** | **19 / 77** | **58** | **⛔ 75%** |
>
> ⛔⛔ **THAT SPREAD IS THE POINT — 7% to 75%, and LS is mid-range.** The invariant's truth is a
> property of *the town's block geometry*, not of the kit, so no single scene can tell you whether it
> holds. On the first non-US pour, **three quarters of the map is built by the producer the docs do
> not mention.** An operator there reads "concentric offset," sees a plausible curb, and has no way to
> learn otherwise — which is exactly the silent-substitution shape `CLAUDE.md` Layer 0 forbids.
>
> **∴ every tile now carries `producer` + `producerReason` in `shape.json`**, the bake prints the split
> once per pour, and the tool shows it in the status bar. ⭐ **Degeneracy count: 0 on every scene** —
> and that is a *measured* 0 for the first time; this table asserted it without ever running the branch.

---

> ⛔ **KIT READING (applies to every count and every street name in this document).** The numbers
> below — 50 dead ends, 9 of these, 6 of those, `south-18th-street-3` — are **the first town's
> sample**, not the work item. The work item is the **method that finds this class anywhere**, and
> the **check that fails the bake when it doesn't** (`ORIENTATION`: *"that checker is the real
> prize"*). ⛔ An enumerated list of the cases a method could not handle is **not** a result; it is
> the method admitting it isn't one. `CLAUDE.md` **Layer 0**.

## 2.1 ⭐⭐ POLYGONS ONLY at the Section tools — the content wall (2026-07-25, Jacob)

> **"An absolute datawall rule where we are *polygons only* by the time we get to the Section tools."**

The existing Wall is a **handle** rule (`sectionOpen` takes no chain reference) — it stops a consumer
*reaching back*, but not the artifact from **being** a chain. At a dead end it is one: the face freeze
walks the spur out and back over the same vertices, so the ring is the traversal
(`PIPELINE §Wall`). These are the **content** checks, run **at the freeze**, failing the **bake** — never
the eye:

| # | Check | Violation means |
|---|---|---|
| 1 | every tile ring is **simple**, **nonzero area**, no repeated vertex | the ring doubled back — it's a traversal, not a shape |
| 2 | **no ring vertex whose two adjacent edges carry the same chain on opposite sides** | the slit test — `detectTileCaps`' criterion inverted from a feature into a violation |
| 3 | every frontage edge has an **interior on exactly one side** | `side` is undefined there; every consumer keyed on it is guessing |
| 4 | **no real feature described by a patch** (synthetic negative-`segOrd` cap fe, mouth disc) | a polygon that didn't close, wearing a cover |
| 5 ⭐ | **every dead-end spur presents TWO mouth corners — one per side** — so each leg is bounded `corner → cap` | ⭐ **THE ONE THAT MATTERS.** One leg is bounded and the other runs through unbounded: you can *name* that leg but you cannot *bound* it |

> ⭐ **The checkable form of this whole class — `/PIPELINE-CLAIMS.md` (root).** The dead-end → corner →
> sidewalk chain as `[REQ]`/`[OUR]` claims, each with the method that produced its number and a re-run
> command. ⛔ **Read its `C4` before quoting the "6 of 50" vs "9 of 50" split below** — re-measured
> 2026-08-05, the two sets are **identical, 9 and 9**; the 6 came from a probe `7b5b87a3` deleted.

⚠️ **This is a gate to MAKE green, not a regression test that passes today: on the frozen LS face it fails
on ALL 50 dead-end tips.** And it is not free — it forces the punch-out construction (boundary − roads) or
an equivalent. Checks 1–2 are computed by `scratch/coupler-slit-universal.mjs`; **target 0**.

> ⭐ **THE PROBES RUN ON TRUNK (ported 2026-07-30, Boz).** `coupler-fold-legs.mjs` (the shared helper) +
> `coupler-slit-universal.mjs` · `coupler-slit-anatomy.mjs` · `coupler-fe-coverage.mjs` derive every dead-end
> fold from the **frozen face artifact alone** — `ribbons.tiles[].{ring, edges{skelId,side}, caps{vertexIdx}}`
> — walking run spans by INTEGER RING INDEX, never by position (position collapses at a zero-width spur).
> No Slice-1 fields, no src change. Just `node scratch/coupler-slit-universal.mjs`.
>
> ⛔ **The BRANCH originals (`polygon-asks-stamp`) still read `run.foldBranch` / `run.walkOrd` /
> `buildFoldWalkIndex`, and copying THOSE to trunk does not fail — it lies** (`coupler-slit-anatomy` prints
> nothing; `coupler-slit-universal` prints `0 slits`, which reads as *"no defect"*). The ported versions
> replaced them; don't re-copy from the branch.

> ⭐⭐ **THE MEASUREMENT — two different vertices, two different numbers. Never conflate them.**
>
> | | measured | what it means |
> |---|---|---|
> | **TIP** — Checks 1–2 | **50 of 50** tips are zero-width slits | the freeze closes NO dead-end polygon, anywhere |
> | **MOUTH** — Check 5 | **9 of 50** spurs miss a mouth corner | the leg that runs through unbounded |
>
> ⛔ **READ THE TIP OFF THE FROZEN `cap.vertexIdx` — never off a FILL run's span end.** They are not the
> same vertex and on a long block they are hundreds of metres apart, so a span-end probe measures the gap at
> the *far* end of the block and reports a capped spur as open. ⚠️ **And a chain that caps TWICE in one tile
> must count twice** (`waverly-place-1`) — a per-chain denominator silently loses it. Both mistakes make the
> defect look *smaller*, which is why they survived: an under-count reads as progress.
>
> ⭐ **And Check 5 is NOT universal — that is the substantive find.** Most spurs DO get a corner at every
> mouth pass, because their returning leg immediately meets a *different* chain. The failures are the ones
> whose **chain continues past the mouth**, so both sides of the second pass carry the same `skelId`
> (`south-18th-street-3`: `ring[4]` is `south-18th/left → south-18th/left`, and its returning leg runs on to
> `ring[5]` because no corner stops it). Scope the fix to the condition, not to "all dead ends".
>
> ⛔⛔ **RE-MEASURED 2026-08-05 — THE "6 vs 9" SPLIT IS FALSE. The corner set and the run-through set are
> SET-IDENTICAL, member for member.** This block previously said they were two different measurements
> yielding **6** and **9**, and `README`, `ROADMAP A0` and `PIPELINE §Wall` all repeated it. They are the
> same nine folds:
>
> `allen-avenue-0[start] · carroll-street-0[end] · geyer-avenue-0[end] · mackay-place-1[start] ·
> park-avenue-3[end] · south-13th-street[end] · south-18th-street-3[end] · waverly-place-1[end] ·
> waverly-place-1[start]`
>
> | measurement | count | what it is |
> |---|---|---|
> | mouths where the ring cannot see a corner | **9 of 50** | the second pass reads same-chain — Check 5's failure |
> | folds with a leg **running through** the mouth | **9 of 50** | ⭐ **the SAME 9.** `A ∩ B = 9`; neither set has a member the other lacks |
> | fold chains with **no mouth disc** | **9 chains / 10 folds** | ⭐ genuinely a **third, different** set — 3 members belong to no other set |
>
> ⭐ **The two predicates are INDEPENDENT, which is what makes this evidence rather than a tautology.**
> `isCorner` is an **edge-identity** test at the mouth vertex (`inc.skelId !== out.skelId`); `runThrough` is
> a **leg-span** test (does a leg's endpoint land somewhere other than a mouth pass?). Two unrelated
> computations over `mouthInfo()` selecting the same nine members. *Method:
> `node scratch/claims-deadend-set-decomposition.mjs`; both sets off the frozen artifact, `C` run in **both**
> the authored and bare-defaults state (identical — this set is authoring-invariant).*
>
> ⭐⭐ **What this CONFIRMS — read it as support for `ROADMAP A0`, not just as a correction.** A0's thesis is
> that the missing corner, the unresponsive leg and the mouth co-claim are **one upstream fault**.
> Co-extensive sets from two independent predicates are exactly what that thesis predicts. ⛔ **But do NOT
> collapse the two into one concept:** cause and symptom can be 1:1 by mechanism and still be different
> things. What died is *"different measurements, different counts"* — **not** the distinction between the
> corner test and its symptom.
>
> ⚠️ **The decomposition of the 9 — and it is NOT 6 + 3.** **5** are a genuine missing corner with two mouth
> passes; **4** present only **ONE** mouth pass at all, which is a *different condition sharing a counter*
> (§5 Rule 3: split it before sizing work off "9"). **The historical 6 matches neither term** and is
> **unreproducible, not merely wrong** — `stamp-mouth-audit.mjs`, the probe that produced it, was deleted by
> `7b5b87a3` (whose message claimed *"the probes are kept"*). Nobody can now say what it measured. ⭐ That
> distinction is deliberate: this arc has **over-corrected three times**, and *"6 was wrong"* would be a
> fourth. The honest statement is **9 is reproducible; 6 is unknowable.**
>
> ⭐ **`SECTION §6.3` had this right the whole time** — "41/50 have a corner at every mouth pass; 9/50 miss at
> least one; **9/50** have a leg running through" — while four documents contradicted it. Same shape as §3's
> 42. **The cross-doc seam is where the code quietly picked a side; go there first.**
>
> **Quote the number with the probe that produced it, or don't quote it.**

### ⭐⭐⭐ Check 5 is the diagnosis — the missing piece is the CORNER (Jacob, 2026-07-30)

A corner is built where **two different streets meet** (`cornerAt(a,b)` = real corner iff `a !== b`,
`RIBBONS §1`). Walk a dead-end spur's mouth vertex — which the doubled-back ring visits **twice** — and
apply that rule (`south-18th-street-3`, `scratch/coupler-slit-anatomy.mjs`; `ring[2]` and `ring[4]` are
bit-identical):

| mouth vertex | incoming → outgoing | corner? |
|---|---|---|
| 1st pass | `kennett-place` → `south-18th-street-3` | ✅ different streets |
| 2nd pass | `south-18th-street-3` → `south-18th-street-3` | ❌ **same street both sides** |

⇒ **One mouth corner is built; the other is not.** The rule is not malfunctioning — at a doubled-back spur
the second mouth genuinely *is not* two streets meeting. But a leg is normally bounded **corner-to-corner**,
and that boundary is what makes "select this leg" a region, stops an edit at the leg's end, and tells the
cap/mouth machinery where they sit. With a corner on one side and none on the other, one leg is a bounded
piece and the other is an unbounded run-through — which is precisely the *edit lands on a segment, not the
leg* · *partner flips* · *neighbouring corner and cap move* triad (`SECTION §6.3`).

⭐ **Why the addressing fixes could not finish it:** the walk-ordinal coupler gave the two legs distinct,
correct names, fully gated — but **naming a thing does not give it edges.** It fixed *which leg you mean*;
it could not fix *where that leg starts and stops*, because there was no second mouth corner to couple to.

> ⭐ **The one-line test for any proposal: DOES IT CREATE THE SECOND MOUTH CORNER?** If not, it is another
> way of managing the absence, and it will fail on the eye exactly as the previous three passes did.

### ⛔⛔ TRIED AND REVERTED — the CORNER REGISTRY (`junctionMap.nodes[].corners.all`). Read before re-opening.

**The prohibition, forward-stated:**

⛔ **`corners.all` does not exist. Do not cite it, build on it, or assume a consumer reads it.** It has
**0 occurrences repo-wide** — code, artifacts, everything — having gone out with the dead-end-spur work in
**`7b5b87a3`** (`Revert "feat(prebake): assert the dead-end spur BEFORE polygonization; drive E3.3 from the
corner registry"`). `cornersAdjacent` was therefore **never retired**, and `corners.{outer,apex,stub}`
remain the only registry `tileGround.js` sees.

> ### ⭐⭐⭐ AND `cornersAdjacent` IS THE COUPLER RELATION — FROZEN, COMPLETE AT EVERY ORDINARY INTERSECTION, AND READ BY NOTHING (2026-08-12)
> *(Found while sizing Jacob's directed-side-chain proposal. This is not "another orphaned field" — it
> is the one this doc has been circling, and it moves the substrate question.)*
>
> Each record pairs **`(chain, end, side)` → `(chain, end, side)`** at a node — *which incoming side
> hands off to which outgoing side.* That is a **permutation on directed half-chains**, which is
> exactly what determines the face structure of an embedded graph. ⭐ **The identity a face walk would
> need is already stamped; what is missing is a consumer.**
> - **Produced** at prebake — `derive.js:4353` / `:4358`, serialized `:4410`.
> - ⛔ **Consumed by NOTHING.** Zero reads in `src/`:
>   `grep -rn "cornersAdjacent" --include="*.js" --include="*.jsx" src cartograph` → **three lines, all
>   in `derive.js`** (produce · push · serialize). ⛔ **The `--include` is load-bearing** — a bare grep
>   over `src` also walks `src/data/ribbons.json`, where the field appears in the artifact thousands of
>   times, and the noise reads as "plenty of consumers." ⭐ **`project_polygon_must_ask_the_stamp` in
>   its purest form: the stamp exists, is correct in shape, and the polygon never asks.**
> - **Coverage vs built geometry — re-derive, do not quote:**
>   `node -e "const N=require('./src/data/ribbons.json').junctionMap.nodes,d=n=>(n.legs||[]).reduce((a,l)=>a+(l.end==='through'?2:1),0),t={};for(const n of N){const k=d(n);t[k]=t[k]||[0,0,0];t[k][0]++;if((n.cornersAdjacent||[]).length)t[k][1]++;if(n.apron||(n.continuity||[]).some(c=>c.source!=='tip-wrap')||(n.deTaper||[]).length)t[k][2]++}console.table(t)"`
>   The shape it prints: **every degree-3 T and every degree-4 cross carries the relation; a small
>   minority carry built geometry; degree-1 carries the relation ZERO times.**
> - ⛔⛔ **`legs.length` IS NOT THE NODE DEGREE** — a leg with `end:'through'` is one chain passing
>   through, i.e. **two arms**. `tileGround.js:2787` computes the real degree (`nodeDeg`); the artifact
>   does not store it. **A census keyed on `legs.length` reports the opposite of the truth, and did**
>   (2026-08-12, Boz — it made the ordinary intersections look constructed when they are not).
>
> ⭐⭐ **WHY IT MATTERS FOR §2.1's ONE-LINE TEST.** The relation is present at 100% of ordinary
> intersections and **absent at every dead end** — and the dead end is the only place the ring
> retraces. So *"does it create the second mouth corner?"* has a structural answer for the first time:
> **at a T or a cross the pairing already exists and could bound the legs; at a spur there is nothing
> to couple to, which is precisely the missing corner this section diagnoses.** ⛔ This does **not**
> resurrect `corners.all` — that registry is dead and stays dead. `cornersAdjacent` is a *different,
> surviving* field, and the finding is about its **consumer**, not about re-landing the revert.
>
> ⚠️ **Unmeasured, deliberately:** whether `cornersAdjacent` is **correct**, not merely present. It has
> never had a consumer, so it has never been validated by anything. **Do not build on it without a
> check that reads it against the frozen ring** (`§5` Rule 1 — and note the artifact/fresh-run drift
> warned about four paragraphs up applies to any count taken here).
>
> ⛔ **AND THE DENOMINATOR IS CONTAMINATED — read this before reconciling two counts.** **32 of the 233
> stamps are UNLOCATABLE**: their `at` matches no vertex of any `ribbons.streets` entry, and they name
> chains absent from the scene (`accomac-street`, `montrose-avenue-1`), clustered at a clip edge.
> `node scratch/apron-node-at-match.mjs`. **They inflate every per-degree count taken off the artifact**,
> so the one-liner above (which counts all 233) and `scratch/apron-node-kinds.mjs` (which excludes them)
> legitimately disagree. ⭐ **Neither is wrong — say which denominator you used.** Cause not established;
> clip-leftover is a hypothesis, not a measurement, and it is its own ticket.

⛔ **Do not quote any number the attempt reported** — *"769 corners"*, *"261 nodes"*, *"50 of 50 caps"*,
*"6 of 6 blind mouth corners"*. `7b5b87a3`'s message claims *"The probes, the debug dumps … are kept"*;
it **deleted them** (`scratch/stamp-mouth-audit.mjs` −51, `scratch/stamp-predicts-fill.mjs` −67, both in
that commit's diffstat and absent from `scratch/` today). Those figures are the attempt's self-report and
are **unreproducible by the very rule this doc states**. ⭐ **A commit message is part of the corpus and
nothing audits it** — this one asserted the opposite of its own diff, and two later documents cited the
probes in good faith.

⛔ **Measure against a FRESH `pipeline.js` run, never the committed `src/data/ribbons.json`.** The two
disagree — the committed bundle read 233 nodes / 29 tips where a fresh run gave 228 / 26, with a different
FILL fingerprint (75 vs 71 asphalt rings). Drift predating that work and **still open**; it is the
pipeline-reproducibility fault, not an artifact of this attempt. → `PREBAKE §4.0a`,
`_handoffs/HANDOFF-pipeline-reproducibility.md`.

**What the attempt bought that is worth keeping — two name-vs-function slips, the `detectTileCaps` pattern
again.** Both are structural findings about the *tip stamp*, independent of the reverted registry:

1. ⛔ **A width-step test is not a tip test.** Source 6 gated the tip stamp on
   `Math.abs(L - R) >= 0.5` — the chain's left/right pavement half-widths *differing* — so it covered a
   minority of caps while stamping boundary cuts that are not dead ends at all. **A detector named for the
   thing it does not measure**, which is this doc's recurring failure shape (`detectTileCaps` is a slit
   detector wearing a cap detector's name, §2.1).
2. ⭐ **The real discriminator is topological: degree 1 AND inside the boundary.** LS has far more degree-1
   endpoints than dead ends — the surplus is the **ENVELOPE CUT**, where the network simply extends past
   the boundary. ⚠️ **Degree 1 alone will always over-count on any town**, and it over-counts *more* the
   tighter the hood is drawn — the kit-relevant form of this finding. The inside-boundary test also
   admits a genuine edge case: a disconnected interior stub bounds no face, so it caps nowhere and is
   still a real tip.

⚠️ **Do not over-read this as "there is nothing to click."** `node scratch/coupler-fe-coverage.mjs` (the
probe survives — re-run it rather than quoting): most dead-end leg slots **do** have a clickable frontage
edge, the ones that don't all have an fe on the opposite side, and they are the same legs the mouth brief
recorded as unresponsive — independent corroboration. **The dominant defect is BOUNDING, not existence** —
aim at the missing corner, not at a missing surface.

⭐ **What survives as doctrine is §2's one-line test:** *does it create the second mouth corner?* The
registry was one answer to it, and not a shipped one. Live task:
**`_handoffs/HANDOFF-deadend-face-resolution.md` §C0**.

---

## 2. The definition-of-done — three checks, not three adjectives

"Polygon-First is done for the curb" **means exactly** that all three pass. Nothing else counts as done.

### Check A — Tier-1 parallelism (runnable TODAY · ⛔ RED **and MIS-SPECIFIED — do not act on its number**)
`cartograph/litmus-curb-parallel.mjs` — runs against the live producer (`buildTileGround`) and asserts every straight-run curb is a parallel offset of its chain (raycast chain→curb, distance must equal the street's half-width).

> ## ⛔⛔ THE CHECK IS BROKEN IN TWO WAYS. MEASURED 2026-07-31. READ BEFORE QUOTING ANY NUMBER.
>
> **(1) It runs with AUTHORING SWITCHED OFF.** `litmus-curb-parallel.mjs:77` passes **`blockCustoms: null`** — bare defaults. So it compares an **authored** curb against the **un-authored** width and reports **the operator's own decision as a defect.** Mississippi Avenue: authored half-width **8.70 m**, curb sits at **8.70 m**, spread along the run **0.00 m** — dead straight, dead parallel — and the check called it a **3.13 m bow** because it was measuring against the corridor's 11.83 m instead. ⭐ **That is damage-vs-decision, committed by an instrument** (`feedback_dont_undo_a_decision_the_operator_made`). The brief already specified the right behaviour — *"parallel offset means parallel at the **authored** width"* (`HANDOFF-freeze-the-curb…` §5.1); the check never did it.
>
> ⭐⭐ **AND THIS IS A LAYER-0 DEFECT, NOT A BUG.** The check fails **worst on the most heavily authored town — LS, the mould.** On a fresh pour with no customs it would look clean. **The instrument is blind exactly where the map is most worked-on**, so it is *most wrong where an operator has done the most work* — the same shape as `measureModel`'s width bleed and the wall's silent fallback: **invisible in precisely the scene you'd reach for to prove it works.** ⛔ Any detector in the suite (§5) that runs with authoring off inherits this.
>
> **(2) It DRESSES A FAILURE AS A MODEST DEFECT.** `:86` — `if (!tile?.iA?.length) continue` — a tile with **no curb ring at all is skipped**, and samples that find no curb nearby are dropped. So *"this block has no curb"* prints as *"bows 3.9 m."* ⛔ **A silent substitution inside the detector**, which is the one place it must never happen (`CLAUDE.md` Layer 0).
>
> **What the numbers actually are** (2026-07-31; the canon's "38 … up to 5.8 m" was stale):
>
> | | |
> |---|---|
> | runs failing, authoring OFF | **78 of 151**, worst **4.45 m** |
> | runs failing, authoring ON | **79** — ⭐ **the count barely moves; the COMPOSITION does.** Honoring authored widths does not rescue the number, it changes which runs fail. |
>
> ⛔ **A follow-on "collapsed curb rings — 28 of 92 tiles" census was filed the same day and WITHDRAWN hours later. Do not resurrect it.** It measured **`iA` AREA** — but **`Block = iA = tile − the authored roadway`** (`SURVEY §3` step 5), and the asphalt-edge handle *"strokes the pavement half-width outward; **the block follows**"* (`SURVEY §4`). **It was measuring the operator's width edits.** Area cannot separate an authored wide street from a genuinely narrow historical block from a graph face that is legitimately all roadway — and not with a better threshold either: median ring-share climbs **1% → 34% → 45% → 86%** with block size alone, so the metric mostly encodes size. **The only honest test is DISTANCE — is the curb at the *authored* half-width from its centerline — run with authoring loaded** (`ROADMAP A05`).
>
> ⭐ **"Bow" is still MORE THAN ONE THING — never quote the aggregate:** **(a) shifted** — perfectly parallel at the wrong datum, which is largely the authoring artifact above and *not a defect*; **(b) wander** — the distance genuinely varies along the run. *Same street is a perfect offset on six tiles and wild on two, so where real wander exists it is **specific tiles**, not the offset math.*
>
> **Consequence — this killed a fork.** "Derive the curb *correctly*" (the old Option B of `HANDOFF-freeze-the-curb…`) has **no coherent meaning**: you cannot make Mississippi's curb more parallel, it already is — you would only be **picking a different width**, and the correct width is the authored one the curb already honors. **Option A (move the computation, output unchanged) is the only coherent fork.** ⛔ And B would not have fixed tile 37 anyway: a collapsed ring is a different bug on the same red light.
>
> **Owed:** fix the check to (i) run **with the scene's authored `blockCustoms`**, and (ii) **report an absent/degenerate curb ring as its own loud failure class**, never fold it into a parallelism number. Until then Check A's aggregate is not evidence of anything.

- **Its honest blind spot** (unchanged, and separate from the two faults above): it is **deliberately blind in the ~9 m junction zone** where the "d" bulges live — a cheap heuristic cannot separate an artifact bulge from a legitimate corner fillet there (both deviate). Widening it floods it with real-corner false positives. So Check A proves the *weaker, certain* claim; **that is what Check B is for.** (The blind spot is itself the lesson: the defect hides exactly where the cheap proxy can't look.)

### Check B — Tier-2 identity (the real gate · writable only after the freeze)
> With no element active, **Survey's rendered curb == the prebake-frozen curb, byte-equal** — and the frozen curb is the clean offset (it passes Check A *including* the junction zone, because corners are constructed, not carved).

This is the un-fakeable test. It cannot be written today because there is **no upstream-frozen clean curb to compare against** (D2 froze topology, not geometry) — and *that inability is itself the proof the curb is not **derived from the frame***. ⚠️ **Precision, 2026-07-31:** read every "the curb isn't frozen" phrase in this doc as a **PRODUCER** claim. A frozen curb artifact *does* exist and *is* consumed — every non-Survey view renders from `shape.json` (frozen `iA` on 93/101 tiles). What's missing is that it be **built from the frozen frame** rather than traced from chains and snapshotted (`WALL.md §31`). It extends the existing precedent harness `scratch/hadrian-wall-open-proof.mjs` (which machine-proved `sectionOpen` chain-free). Block-independence is already verified (`PREBAKE.md §5`, `SURVEY.md §4.1`), which is what makes "only the active element re-derives" achievable.

### Check C — no chain in the producer's scope (structural)
> `buildCurb` has **no chain / street / measure-chain in its lexical scope** — the curb is built from the frozen frame only. Enforced the way `sectionPass` already is (a signature with nothing to reach back through), greppable in CI.

Today the producer is `buildTileGround(liveRibbons, …)` — chains fully in scope, re-stroked every frame. Check C fails by construction until the curb construction is a closed function of the frozen frame.

**Done = A ∧ B ∧ C green.** Until then, "the curb is frozen / Polygon-First" is false, and the corpus must say so.

---

## 3. The way forward — give the curb an owner (D6a → d)

The curb-geometry freeze was nobody's deliverable (§0.1). These are the named, sequenced tickets that close it. Full brief: `HANDOFF-freeze-the-curb-in-the-first-bake.md`. **Rebuild-gated → PARKED** (Jacob, 2026-06-09: anything requiring a rebuild waits).

> ⛔⛔ **D6b's LITERAL WORDING IS IMPOSSIBLE.** Any phrasing here that says *"emit and freeze `iA` in
> prebake"* **cannot be built as written.** **Prebake is blind to the per-fe SHAPE channel:**
> `derive.js` / `pipeline.js` / `promote-ribbons.js` read `design.json` / `blockCustoms` **zero times**
> (every mention in `derive.js` is a comment), and `derive.js:3813` says so itself — *"widths resolve at
> shape time (`runMeasure`/`blockCustoms`)."* ⛔ So freezing `iA` there would freeze a curb built from
> **bare defaults for every per-frontage-edge width** — precisely what `CLAUDE.md` **Layer 0 q3** forbids,
> baked into an artifact. *(Structurally, `looks` and `scenes` are also separate namespaces, though they
> are 1:1 for every installation today.)*
>
> ⚠️ **Say "blind to `blockCustoms`", NOT "authoring-blind".** Prebake sees **one of the two authoring
> channels, not zero** — it **does** read `clean/overlay.json`, the skelId-keyed measures/caps/anchors
> Survey and Measure write (`derive.js`, the `overlayById`/`overlayLoops` load). ⛔ The broad phrasing is
> the overgeneralisation that **mis-scoped this very question** (`ORIENTATION §3`): it makes "freeze the
> curb in prebake" look categorically impossible when it is impossible only for per-fe SHAPE intent, and
> A03/A06 were scoped off that error.
>
> ⭐ **The goal was always CHAIN-FREEDOM, not prebake-location.** Check C asks for *"no chain in the
> producer's scope"* — prebake-freezing was the assumed mechanism, never the requirement. **The thing
> that has to die is the chain, not the authoring.**
>
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
> The chain-free producer owns **59 of 101 tiles (58%)**. The rest still route through the legacy carve
> (`tile.ring − aFill`), **and `aFill` is chain-derived**:
>
> | path | tiles | |
> |---|---|---|
> | chain-FREE offset producer | **59** | Check C holds here |
> | legacy carve — **divided median** | 30 | structural (offsetting both inner edges collapses the thin gap) |
> | legacy carve — **loop-body median** | 3 | structural (`medArea > 0.5` on a single-run tile) |
> | legacy carve — **small** tile | 9 | structural (`ringArea ≤ 1500` **and not already median**) |
> | legacy carve — degenerate | **0** | every tile that qualifies for the offset path succeeds on it |
>
> ⚠️ **Corrected 2026-07-31:** this table first read *"32 median · 10 small"*, which conflated the two
> median classes and mis-split the total. `isMedianTile` is `isDividedMedian || (isLoopInterior &&
> medArea > 0.5)` — two different tile kinds behind one flag. Total is unchanged at 42.
> ✅ **Independently reproduced 2026-08-04** off `public/baked/lafayette-square/shape.json`: **30 tiles
> `ringArea ≤ 1500` · 30 carrying `isMedian` · 19 both ⇒ 41 ineligible / 60 eligible.** That is the same
> split — the `9` row is *small AND not already median*, which is 30 − 19 − (the loop-body 3, whose flag
> the artifact does not carry). ⚠️ **The `9` is NOT the count of small tiles** (that is 30), and reading
> it as such is what produced a "the table is wrong" report. And the artifact's `isMedian` is written
> from `isDividedMedian` **alone** (`tileGround.js:3627`), so any count taken off it is a **floor**.
> ⛔ **`D6a`'s comment above this gate also lists DEAD-END tiles as a legacy-carve class. It is stale** —
> the gate is `!isMedianTile && ringArea > 1500`, with **no dead-end condition**; dead-end tiles take the
> OFFSET path and their caps are built in via `capArc` twelve lines below (21 tiles carry tips).
>
> ⛔ **The chain was NOT passed into `buildCurbRings` to cover those 42.** That is the quiet
> re-opening the signature exists to prevent, and declining it is why the gap is countable instead of
> hidden. **Do not claim Check C green at 58%.**
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

- **D6a — build `iA` as a parallel offset, not an asphalt-union carve. ✅ CONSTRUCTION LANDED** (`offsetRingVariable`, 2026-06-09; now the DEFAULT at `tileGround.js:2728/2810`, replacing the `tile.ring − aFill` carve — which survives only as the degenerate `legacyBlock` fallback). Per-edge offset (`chain ⊕ pavementHW`, corners = offset-intersections; at a divided transition, corner the corridor outer-edge legs via the frozen `phase.spineAt*`). Converges to today's curb everywhere except the bug sites. **Turns Check A green** (incl. the junction zone). ⚠️ **but NOT yet robust — un-parked 2026-06-14.** Live confirmation: the correctness detector's **CURVE-FIT gate is RED** — offsetting the *smoothed* centerline (smooth=1.5) produces **6 new needle/spur degenerates** vs smooth=0 (`scratch/correctness-detector.mjs`), which is exactly why `STREET_SMOOTH` is pinned at 0 and macro FRONT A3 (curves-on) is blocked on the robust offset. The **curve-fit / smooth centerline** (the one knob, `SKELETON §3.5`) is its forcing function: a smooth dense curve makes the curb's inward offset **self-intersect at tight bends** → a **172° needle** (W18 corner: tile.ring smooth at 16°, curb spikes to 172°). **SITE:** the through-node/curve path — the **averaged-normal** branch of `offsetRingVariable` (grep `!cornerAt(i) || Math.abs(det)`). ✅ **The site is CONFIRMED and quantified 2026-08-09** (agent Kerf, `scratch/fold-branch-forensic.mjs`): of 536 crossings on 193 minting tiles, **69.8% of crossing endpoints are averaged-normal vertices** (miter 16.0% · bevel 11.8% · cap 2.3%). The faceted curve hid it; the smooth curve exposes it — *the litmus-RED non-parallelism, made visible*.
  > ### ⛔⛔ THE PRESCRIPTION THAT STOOD HERE — *"it has **no miter clamp**; the clamp guards only corner vertices"* — IS **EXCISED. IT IS PROVABLY DEAD, AND IT COST A TASK.**
  > **The miter clamp measures distance from the apex, and in the averaged-normal branch that distance is BOUNDED BY CONSTRUCTION.** The branch emits at exactly `(A.d + B.d)/2` from `ring[i]`, while `lim = 2.5·max(A.d, B.d, 0.5) + 1`. Since `(A.d+B.d)/2 ≤ max(A.d,B.d) ≤ M < 2.5M + 1` for every `M ≥ 0`, **`dist < lim` ALWAYS — any town, any authored width, forever.** Measured to match: **0 of 27,241 averaged-normal vertices across 7 scenes; max `dist/lim` = 0.389.** ⇒ **it is not a missing call, it is the WRONG QUANTITY.** ⛔ **Adding it would have been dead code that LOOKS like a robustness fix, with `A3` then freezing on top of it — `WALL §1` committed while quoting `WALL §1`.** *(Boz briefed exactly that on 2026-08-09 off this sentence; the agent refused the edit and proved it dead instead. Keep the diagnosis, drop the prescription.)*
  > - ⭐⭐⭐ **AND THE REAL REASON "ADD A CLAMP" NEVER WORKED — 27.8% of crossing endpoints are MITER/BEVEL vertices, i.e. vertices that went THROUGH the existing clamp and still landed in a self-intersection.** ⇒ **both branches are PER-VERTEX LOCAL tests, and offset self-intersection is a GLOBAL property of the walk. No local test can decide it** — so no constant would have saved it either.
  > - ✅ **THE REVERSAL SIGN TEST IS BUILT (2026-08-11) — `node scratch/claims-offset-reversal.mjs`.** Does the emitted offset segment `W[i]→W[i+1]` run *against* the ring edge that produced it? **Pure sign, no epsilon, no tuned distance** — `RIBBONS §6.9.5`'s *"topological capacity guard, not a doctrine clamp"*. Fires before the union, because the union is what hides a fold by resolving it into a kept ring. **RED on 6 of 7 scenes; run it, don't quote it.** Detector only — it changes no geometry, and the repair waits on its population being known.
  >   - ⛔ **A GREEN SIGN TEST IS NOT "NO FOLDS"** — it means no segment *reversed*. Wide loops cross while every segment still runs forward; those need the self-intersection found directly. It must never retire the crossing measurement.
  >   - ⛔⛔ **AND IT DOES NOT COVER THE NOTCH CLASS — measured 0 overlap, both directions** (LS authored, 59 offset tiles: 12 reversal-no-notch · 0 both · 0 notch-no-reversal). LS's 8 notches sit on **`carve / median-divided`** tiles, which never run the offset. **The notch is A06's, not D6a's.** *(Routed here first and disproved by this check before a repair was written on it — the intended use.)*
- **D6b — split the producer at the chain boundary. ✅ LANDED 2026-07-31** (`4dd05303`) — see the as-built block above. ⛔ **The old text of this bullet said "`derive.js` emits `iA` once and freezes it into `ribbons.tiles[]` … in the authored state." That is impossible** (prebake is authoring-blind; `ribbons.json` is per-scene, `blockCustoms` per-look) and it is the wording that nearly baked a bare-defaults curb — full text moved to `_archive/POLYGON-FIRST-D6b-prebake-wording-2026-07-31.md`. What replaced it: `freezeCurbEdgeFacts` (chain-derived, per ring edge) → `buildCurbRings` (chain-free), authored width applied in the builder. **Byte-identical; Check C green on 59/101 tiles, RED overall.**
- **D6c — Survey *consumes* the frozen curb.** Extend the chain-free consumer pattern (`sectionOpen`) to Survey's `tileGeos` (`BlockGeometryV2Debug.jsx:661`): inactive tiles read the frozen `iA`; only the active element re-strokes. ⚠️ **Re-scoped by D6b's landing:** the *producer* is no longer the blocker it was written against — `buildCurbRings` is already chain-free at its signature. What remains here is the consume-once/perf half.
- **A06 — freeze `aFill` so the legacy carve is chain-free too.** The 42 median/small tiles D6b deliberately left. Separate ticket on purpose: a different tile class, and bundling it would put two risks behind one byte-identical proof.
- **D6d — the block-local edit / commit / re-freeze loop (= the D5 perf payoff).** Today one edit rebuilds the whole map (one whole-map `useMemo`; the junction builder reads every leg at a node; a final `unionRings` melts all tiles into one blob, `tileGround.js:2075`). Build the edit-key→tile index (`tiles[].edges[].skelId`), per-node junction construction, and a per-tile-addressable output; on commit, re-freeze only the touched junction's incident tiles (~3–4). The authoring loop the freeze was always missing.

**Sequencing:** D6a ships alone and visible. D6b+D6c are the architecture move, gated on D6a proving out on Jacob's eye. D6d is the large perf/authoring restructure. D3 (corner identity) folds into D6b — once the curb is a frozen offset cornered at offset-intersections, the divided-transition corner identity is frozen *as part of the curb*, dissolving the whole transition defect class.

> ⚠️ **No clean live stopgap exists** (verified 2026-06-09). The bulge is on the cross-street curb between the de-taper trim-back and the corner — the same construction as the `9c275ce` corner cure. Fill-the-bow *is* reconstruct-the-corner; they are one union. A patch can't straighten it without operating in the corner-cure machinery. The freeze is the only clean fix.

---

## 4. The doctrine rule going forward

So this can't rot the same way:

1. **Every "frozen / chains-die / polygon-first" claim names the check that proves it** — or it is marked TARGET, not stated in the present tense. A claim without a check is the failure mode that hid this gap.
2. **TARGET and CURRENT are separated, never blurred.** Tables and headings must not speak target-voice ("Freezes: wall #1, chains die") while the truth lives in a buried parenthetical. (Audit residue to clean: `ARCHITECTURE.md:73,79`, `README.md:107`, `WALL.md:11` — each now carries a pointer here.)
3. **The vocabulary compiles to tests, or it's removed.** Per `OSM2STREETS-GROUNDING.md`, the field already had the *constructive* concepts (intersection polygon, trim distance, corner pair) the project kept circling under homemade outcome-nouns. Prefer the construction that reduces to a check over the noun that asserts a state.
4. **One enforcement, both sides.** `sectionPass` closure guards the consumer; `buildCurb` closure (Check C) must guard the producer. A wall with only one side is a wall that leaks — which is exactly what happened.

---

## 5. ⭐⭐ The correctness suite — the system that defeats hand-fixing (2026-06-13, Jacob)

The 35 `source:'curated'` hand-fixes (`INTAKE §6.1`) are the kit's **central problem**: each is wasted operator time, and a tax the kit **re-pays on every neighborhood** unless defeated at the system level. *"We must build a system to defeat this problem"* (Jacob). The checks above (A/B/C) are the seed of the defeat — the principle is **automate what the operator's eye did.** Four parts:

1. **The invariant suite (the DETECTOR).** Grow the curb checks into a comprehensive set — **one runnable, RED-until-true invariant per bug-class:** curb ∥ chain (`litmus-curb-parallel`, exists) · `iA` no self-intersection (exists) · `corner-guard` byte-stability (exists) · loops close (`loop-closure`, exists) · cul-de-sac cap tangent (`cap-tangent`, exists) · junction-band silhouette (`junction-band`, exists) · name-transition smoothness (`name-transition`, exists) · **no width-step at a through-node** (`through-width` + `curb-bump`, **built 2026-06-15** — `HANDOFF-curve-primitive-skeleton.md`; a `continuesAs` through-road carries one `pavementHW` per side, and a `>20°` turn between short curve-samples on `iA` flags the seam bump) · **no polygon overlap · divided median sane · no jagged-arc (max-turn) on a smooth curve** (`max-turn`, exists). The suite **flags the bad streets automatically** — the eye, mechanized. Live home: `scratch/correctness-detector.mjs`.

2. **Validate against the 35 (the LABELED SET).** Run the suite on the **raw OSM geometry** of the 35 curated streets (pre-hand-fix). A correct suite **flags those 35** and **does not false-positive** on the clean grid. That tunes the detector to catch exactly what the operator caught — the **acceptance test for the suite itself**.

3. **Enforce (the kit invariant, made mechanical).** Every flag → a **general skeleton fix** (the *class*, never the street — `SKELETON §6`). The suite is a **CI gate:** no green build with an un-flagged defect; a fix must turn a RED invariant GREEN *generally*; a regression guard keeps a fixed class fixed across towns.

4. **The onboarding loop:** new town → run the suite → fix the flagged classes in the skeleton → green → ship. **Zero hand-fixing, by construction.**

> ## ⭐⭐ TWO RULES EVERY INVARIANT IN THIS SUITE MUST OBEY (learned the hard way, 2026-07-31)
>
> Check A violated both, and the cost was a full standup spent reasoning from numbers that meant
> nothing. **A detector that is wrong is worse than no detector** — it launders a false claim as a
> measurement, and it is the one artifact in the kit nobody thinks to doubt.
>
> **RULE 1 — RUN WITH THE SCENE'S AUTHORED STATE, NEVER BARE DEFAULTS.** Check A passed
> `blockCustoms: null`, so it measured against un-authored widths and **reported the operator's
> decisions as defects** (`§2` Check A). ⭐ **The kit consequence is the important half: a check that
> ignores authoring is WORST on the most authored town and CLEANEST on a fresh pour** — it is blind
> exactly where the map is most worked-on, so it looks healthiest where the least has been done.
> That is the same silent-substitution shape as the LS width bleed and the wall's fallback. ⛔ An
> invariant that has not been run against a heavily-authored scene has not been validated.
> *(Doctrine it enforces: **everything is a best guess and everything is overridable** — `SKELETON §6`,
> `ORIENTATION`, `CLAUDE.md` Layer 0 **q3**. The override IS the product; a detector that treats one
> as damage is measuring the wrong thing.)*
>
> **RULE 1b — MEASURE THE DEFINITION, NOT A PROXY THAT CORRELATES WITH IT.** A correct curb is a
> **distance** (`chain ⊕ authored halfWidth`). The withdrawn "collapsed rings" census measured an
> **area ratio** instead — and area is blind to the definition: a curb could be metres off on every
> edge and barely move it, while block *size* alone swings it 1% → 86%. ⭐ **The proxy is always the
> cheap thing to compute; that is exactly why it gets reached for.** Three times in one day the
> wrong quantity was measured (probes that didn't predict the eye · parallelism against un-authored
> widths · area standing in for distance). **If you cannot state the invariant as the definition of
> the thing, you are not ready to measure it.**
>
> **RULE 2 — AN UNMEASURABLE SAMPLE IS A LOUD FAILURE, NEVER A SKIPPED ONE.** Check A did
> `if (!tile?.iA?.length) continue`, so *"this block has no curb"* was reported as *"bows 3.9 m"* —
> **a catastrophic failure dressed as a modest defect.** ⛔ Skipping what you cannot measure is a
> fallback *inside the instrument*, and it hides the worst cases by construction (the biggest blocks
> collapse hardest — tile 37, a 2058 m² block with an 85 m² curb fragment). **Emit `UNMEASURABLE`
> as its own failing class with a count; never let it fall through into a magnitude.**
>
> **RULE 3 (the corollary) — ONE INVARIANT, ONE DEFECT.** "Bow" turned out to be three unrelated
> defects sharing a number (shifted datum · genuine wander · collapsed ring), which made the
> aggregate uninterpretable and sent the analysis at the wrong one. **If a check's failures need a
> taxonomy to explain, it is really N checks; split it.**

**The reframe this forces:** the six SHAPE tasks aren't the deliverable — **the detector is.** Fixing the 6 classes makes LS's suite go green; the *suite* is what defeats the problem on town #2…N. "Remove the 35 and see what breaks" stops being a one-time forensic and becomes the **standing regression test.**

> ⭐ **Two kinds of invariant — and the 35 lean TOPOLOGICAL (the key first-pass finding).** A **geometric** check reads one chain's *shape* (`max-turn` · `width-step` · `curb∥chain`). A **topological** check reads the *graph* — does a loop close into a face · does a cul-de-sac have a cap · does a **name-transition keep a road continuous** · do two chains that should meet share a node. **The 35 curated bugs are mostly topological** (the LS "Places" = loops/cul-de-sacs; the datum-steps live at seams), so the suite's **centre of gravity is graph-level, not chain-level** — which is *why* a per-chain `max-turn` check whiffs on them. The hardest cases fail **both at once**: **West 18th** is a geometric jag **and** a name-transition (it *becomes* Dolman), so its rounding must flow *through* the seam.

> **First detector pass — scope (read-only, no production change):** harness `scratch/correctness-detector.mjs`. **Inputs:** the 35 curated chains (names in `INTAKE §6.1`) + their **raw OSM geometry** (`centerlines.json` `source:'osm'` siblings, or re-fetch per chain). **Invariants v1:** the three that exist (`litmus-curb-parallel` · iA self-int · corner-guard) **+** cheap new ones — **max-turn-per-chain** (the jagged-arc detector — must flag West 18th), **width-step at through-nodes**, **face-closure**. **Output:** per-street pass/fail → the flagged set + a **confusion report vs the 35** (recall: flagged ⊇ the 35? precision: clean grid mostly passes?). **Acceptance:** high recall on the 35, low false-positive on the grid — *then* the thresholds are trusted. This is the seed of the suite; it converts the campaign from "fix 35 streets" to "make the detector green."
>
> **First-pass RESULT (Sieve, 2026-06-13 — `SIEVE-DETECTOR-FINDINGS.md`, harness `scratch/correctness-detector.mjs`):** **`width-step` is the flagship** (8 curated / 4 grid — the datum-step family; make it the **first CI gate**). Recall **18/31 names (58%)** with the geometric checks; precision 43%. **`max-turn` whiffs (0 curated)** — the 35 were never vertex-jagged; **curation fixed *topology/width*, not zigzags**, so a per-chain jag-detector is the wrong instrument. ⚠️ **Provenance fix: West 18th is `source:'osm'`, NOT one of the 35** (it was conflated with South 18th). The 13 misses are **the Places** — uncaught because their defect is *topological*. **Highest-leverage next (both named above, neither built): `loop-closure` (≈7) + `cul-de-sac-cap-tangent`.** Don't widen thresholds to chase 31 — add invariants for the missing *classes*.
>
> **Topological pass RESULT (Loom, 2026-06-13 — `LOOM-TOPO-FINDINGS.md`):** built both. **`loop-closure` flags 0 — correctly:** every LS loop already closes (Benton 3.2cm / Park Place 0.0 / Saint Vincent 2.2cm, all inside the `e8cc310` endpoint-weld tol), so the faces form and the medians emit. It's a **regression guard, correctly green** (proven live by a `--simweld` self-test that opens a loop 1.4m and watches it fire), not a recovery detector — keep it wired to CI. **`cap-tangent` flags 1 — Preston Place** (authored `round`, a true degree-1 tip, nearest rendered cap **171.7m** away): a genuine defect all five geometric checks missed. **+1 → 19/31.** ⚠️ **Loom proposed the ~6 perfect-rendering cap/loop "Places" (Albion/Vail/Nicholson/Simpson/Whittemore + Kennett) are authoring *choices*, not bugs → denominator ~25.** **Jacob CORRECTED this (2026-06-13): the cap is *data-derivable* (OSM `turning_circle`/`turning_loop` tags) — the cap-chooser was a STOPGAP for when we couldn't yet build the geometry, so those curations are *data*-defects to automate, NOT legitimate authoring.** Denominator stays **~31**; the cap-curations count. (Doctrine: *data-derivable → must be automatic, a manual override is a bug; only genuinely-creative LOOK is authored* — `SKELETON §6` kit invariant.) **The real remaining gap = the weird junctions (Carroll, Hickory, Grattan)** — caught by the **`junction-band` invariant** (Throat, 2026-06-13: recall → 24/31; the throat-sliver count; the defect is **pervasive — ~60 junctions, grid worse than curated**, so the curated set under-counts it). ⚠️ **The invariant is the RED-until-true GATE, but the FIX is UPSTREAM (skeleton), NOT a ped construction.** A *separate* ped-silhouette is the deletion target (`SECTION §7`, Jacob): one SSoT road-junction shape, the rest derives. The junction geometry is wrong at the *skeleton* — **the West 18th ↔ Dolman name-transition is the showstopper** — diagnosed by the skeleton forensic, fixed in `skeleton.js`, proven green by `junction-band`.

> ### ⭐ CURRENT RESULT — re-run 2026-08-04. **Recall 30/31 (97%), not 24/31.**
> `node scratch/correctness-detector.mjs` today: **recall 30/31 (97%) · precision 30/61 (49%)**, with
> **exactly one miss — Vail Place**. Per-invariant (single-check) recall is **19/31**; the 30/31 is the
> union across invariants. ⛔ **The two checks the Sieve quote above names as "highest-leverage next,
> neither built" — `loop-closure` and `cul-de-sac-cap-tangent` — are BOTH BUILT** (the Loom paragraph
> says so, without updating the headline). ⚠️ **The blockquotes above are a DATED RECORD of two passes,
> not the scoreboard.** They were read as current and had the scoreboard 6 points low while naming
> shipped checks as the next work — a doc that undersells shipped capability causes rebuilt work.
> ⚠️ Also in the same block: `[E3.3] corner identities` prints **6 corners constructed**. ⛔ **That is
> NOT "the pre-registry number left behind by the revert"** — corrected 2026-08-12 against the source.
> `tileGround.js:3265` gates the whole pass on `nd.kinds?.includes('divided-transition')` **and** a
> non-empty `corners.stub`, a scope its own comment states outright (*"the 24-node sweep class"*), with
> the terminus/continuation/join stubs deliberately deferred to the E3.4 datum repairs. **6 is what
> that scope yields, not residue.** The corner machinery is *narrow by design*, which is a different —
> and more actionable — fact than *broken by a revert*. → §2.1's `cornersAdjacent` block above.

---

## Cross-references
- `PREBAKE.md §4.1`/`§5` — the curb-is-the-unfrozen-half SSOT; the L1/L2/L3 split.
- `SKELETON.md §5f` — the skeleton-voiced statement of the same.
- `WALL.md` — the Data Wall (consumer-side closure, the model to mirror on the producer).
- `SURVEY.md §5.1` — "Survey is not yet polygon-first" (the honest body the target-voice tables contradicted).
- `BACKLOG.md` "(2b) Freeze the CURB geometry" — the parked program; D6a–d.
- `HANDOFF-freeze-the-curb-in-the-first-bake.md` — the implementation brief.
- `cartograph/litmus-curb-parallel.mjs` — Check A, runnable, red.
- `scratch/hadrian-wall-open-proof.mjs` — the closure-proof precedent to extend for Check B/C.
- Code: `tileGround.js:581,825` (the closure that works), `:1994` (the carve to replace), `:2075` (the whole-map melt); `BlockGeometryV2Debug.jsx:661,669` (Survey live-strokes); `derive.js:3922` (the D2 freeze pattern).
