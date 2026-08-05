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

> **The curb is a pure function of the frozen frame.** It is produced **once**, in prebake, as the parallel offset of the skeleton (`chain ⊕ halfWidth`, corners as offset-intersections), frozen beside the topology, and **consumed** — never re-derived — by every downstream stage. The only live re-derivation permitted is the **single element under the operator's hand**, which re-freezes on commit.

This mirrors the one enforcement that already works (`sectionPass` closure), moved to the **producer** side: a `buildCurb(frozenFrame) → curbPolygon` with no live chain-stroke union in scope.

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

> ⭐⭐ **THE MEASUREMENT, CORRECTED ON THE PORT (2026-07-30). Two different vertices, two different numbers —
> the old "46 of 49" conflated them.**
>
> | | measured | what it means |
> |---|---|---|
> | **TIP** — Checks 1–2 | **50 of 50** tips are zero-width slits | the freeze closes NO dead-end polygon, anywhere |
> | **MOUTH** — Check 5 | **9 of 50** spurs miss a mouth corner | the leg that runs through unbounded |
>
> **Why the old count was wrong:** the branch probe read the tip off a FILL run's span *end* rather than the
> frozen `cap.vertexIdx`. On `hickory-street-1`, `henrietta-place` and `south-22nd-street` that end is the FAR
> end of the block — 195 m, 154 m and 328 m from the cap — so it measured a gap there and called them
> "FACE=WIDTH". At the actual cap vertex all three are **0.0000 m**. It also dropped `waverly-place-1`, which
> caps twice in one tile, giving 49 instead of 50.
>
> ⭐ **And Check 5 is NOT universal — that is the substantive find.** Most spurs DO get a corner at every
> mouth pass, because their returning leg immediately meets a *different* chain. The failures are the ones
> whose **chain continues past the mouth**, so both sides of the second pass carry the same `skelId`
> (`south-18th-street-3`: `ring[4]` is `south-18th/left → south-18th/left`, and its returning leg runs on to
> `ring[5]` because no corner stops it). Scope the fix to the condition, not to "all dead ends".
>
> ⚠️⚠️ **"9 of 50" IS TWO DIFFERENT MEASUREMENTS WORN AS ONE — corrected 2026-07-30.** The figure is quoted
> in `README`, `ROADMAP`, `PIPELINE` and above. Re-measured with `scratch/stamp-mouth-audit.mjs`:
>
> | measurement | count | what it is |
> |---|---|---|
> | mouths where the ring cannot see a corner | **6 of 50** | the second pass reads same-chain — Check 5's actual failure |
> | folds with a leg **running through** the mouth | **9 of 50** | the *symptom*: no corner stops the returning leg's span |
> | fold chains with **no mouth disc** | **9 of 50** | a third, overlapping set — the FILL patch's coverage |
>
> Three sets of similar size, listed interchangeably. **The corner test fires on 6.** Quote the number with
> the probe that produced it, or don't quote it.

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

### ⛔⛔ REVERTED — the CORNER REGISTRY (`junctionMap.nodes[].corners.all`) is **NOT on trunk**

> **Read the whole section below as a DESIGN RECORD of an attempt, not as shipped behavior.** *(Corrected
> 2026-08-02; it was written and left standing as "⭐⭐ LANDED 2026-07-30, default-on".)*
>
> **Verified:** `corners.all` has **0 occurrences** repo-wide — code, artifacts, everything. It went out
> with the dead-end-spur work in **`7b5b87a3`** (`Revert "feat(prebake): assert the dead-end spur BEFORE
> polygonization; drive E3.3 from the corner registry"`). `cornersAdjacent` was therefore **never retired**,
> and `corners.{outer,apex,stub}` are still the only registry `tileGround.js` sees.
>
> ⚠️ **AND THE NUMBERS BELOW CANNOT BE REPRODUCED.** `7b5b87a3`'s own message says *"The probes, the debug
> dumps … are kept"* — **it deleted them**: `scratch/stamp-mouth-audit.mjs` (−51) and
> `scratch/stamp-predicts-fill.mjs` (−67) are in that commit's diffstat and absent from `scratch/` today.
> So *"6 of 6 blind mouth corners"*, *"50 of 50 caps"*, *"769 corners"* are **unreproducible by the very rule
> this section states** — do not cite them as measurements. They are the attempt's self-report.
>
> **What survives as doctrine** — and it does survive, this is why the section is kept — is §2's
> one-line test above: *does it create the second mouth corner?* The registry was one answer to it. It is
> not a shipped one.

**[ATTEMPT, REVERTED]** The second mouth corner is RECORDED at prebake, at all 6 mouths that need it. Not constructed —
*recorded*: the stamp is written from the chains, before the face walk exists, so it is not subject to the
ring's blindness. Additive only; **`cap-fill-hash.mjs` is byte-identical in both `plain` and `design` mode**,
and `correctness-detector.mjs` is line-identical but for its own tip-wrap skip counter (26 → 52).

**One list replaces two.** `cornersAdjacent` (degree-≥3 only, no consumer) is **retired**; `corners.all`
carries every corner at every node in one shape — `{ a, b, sameChain?, source }`, each side a
`{chain, end, half?, side}` measure key. `corners.{outer,apex,stub}` survive **only** as the
divided-transition construction bookkeeping `tileGround.js:2665` still consumes; they retire when `all`
gains a consumer (`HANDOFF-ask-the-stamp`). Three shapes, one list: degree ≥ 3 = the adjacency fan ·
degree 2 = one corner per side (the L-corner) · degree 1 = **the tip wrap**, the chain's own left curb
meeting its own right curb around the cap, always `sameChain`.

⭐ **`sameChain: true` IS the ring-blind class, marked explicitly** so no consumer has to rediscover that
`a.chain === b.chain` is the meaningful case. 160 of 769 corners carry it.

| | before | after |
|---|---|---|
| nodes | 228 | **261** |
| nodes carrying a corner | 200 (`cornersAdjacent`) / 24 (`corners.outer`) | **261 / 261** |
| corners recorded | 695 | **769** (160 `sameChain`) |
| dead-end caps with a `pendant-tip` | **15 of 50** | **50 of 50** |
| blind mouth corners recorded | 5 of 6 | **6 of 6** |

**Two root causes, both name-vs-function slips** (the `detectTileCaps` pattern again):
1. **Source 6 gated on `Math.abs(L - R) >= 0.5`** — it stamped a tip only where the chain's left/right
   pavement half-widths *differ*. A **width-step detector wearing the tip's name**: it covered 15 of 50 caps
   while stamping **14 boundary cuts that are not dead ends at all**. Gate dropped; the width step is still
   readable off `measure`, so nothing was lost.
2. **The real discriminator is topological: degree 1 AND inside the boundary.** LS has **94 degree-1
   endpoints but only 50 dead ends** — the other 44 are the ENVELOPE CUT (the network extends past the
   boundary). The inside-boundary test yields **52, containing all 50 caps with zero misses**; the 2 extra
   are `south-18th-street-4`'s two ends, a disconnected interior stub that bounds no face so it caps
   nowhere — a genuine tip all the same.

Also added: **Source 0b, degree-2 corner joins** (7 nodes). Sources 2+4 reach an end-to-end meeting only
when it *continues*; one that **turns** was explicitly dropped as "not junction-map material" — true for
construction bookkeeping, false for a corner registry, where an L-corner is the most ordinary corner there
is. Identity-only, like `plain`; no apron.

⚠️ **`src/data/ribbons.json` was STALE on trunk** — the committed bundle read 233 nodes / 29 tips where a
fresh `pipeline.js` gives 228 / 26, and its FILL fingerprint differed (75 vs 71 asphalt rings). Pre-existing
drift, unrelated to this change; measure against a **fresh** run, never the committed bundle.

⚠️ **Open findings — the stamp does NOT predict 8 constructed corners** (`scratch/stamp-predicts-fill.mjs`):
513 fillet corners, 455 predicted, 50 on the map edge (expected — the boundary is not a chain), **8 away
from it**. Four cluster on the `officer-david-haynes-memorial-highway` interchange, where `curbed()` filters
`gradeSeparated` out of the junction map by design; the rest sit on divided Lafayette. **None are in the
dead-end class.** Not addressed this pass.

Probes: `scratch/stamp-mouth-audit.mjs` (does the registry record each ring-blind mouth?) ·
`scratch/stamp-predicts-fill.mjs` (acceptance #1).

⚠️ **Do not over-read this as "there is nothing to click."** `scratch/coupler-fe-coverage.mjs` on trunk:
**98 of 107 dead-end leg slots DO have a clickable frontage edge; 9 do not**, and all 9 have an fe on the
opposite side. (The branch original counted Slice-1 *walk* slots — 191 of 198 — same shape, different
denominator.) The 9 include `whittemore-place|right`, `rutger-street-0|right`, `st-vincent-court-1|left` —
exactly the legs the mouth brief §1 recorded as unresponsive, which is independent corroboration. The
dominant defect is **bounding, not existence** — aim at the missing corner, not at a missing surface.

⭐ Why the gate earns its cost: it would have failed at the freeze on 2026-07-24, *before* a coupler was
designed, a walk-ordinal key built, and an evening spent clicking dead-end legs that could be named but not
bounded. Live task: **`_handoffs/HANDOFF-deadend-face-resolution.md` §C0**.

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

> ⛔⛔ **D6b's LITERAL WORDING IS IMPOSSIBLE — corrected 2026-07-31 (verified in code).** Any phrasing
> here that says *"emit and freeze `iA` in prebake"* **cannot be built as written.** **Prebake is
> authoring-blind by construction:** `derive.js` / `pipeline.js` / `promote-ribbons.js` read
> `design.json` / `blockCustoms` **zero times** (every mention in `derive.js` is a comment), and
> `derive.js:3813` says so itself — *"widths resolve at shape time (`runMeasure`/`blockCustoms`)."*
> ⛔ So freezing `iA` there would freeze a curb built from **bare defaults** — precisely what
> `CLAUDE.md` **Layer 0 q3** forbids, baked into an artifact. *(Structurally, `looks` and `scenes` are
> also separate namespaces, though they are 1:1 for every installation today.)*
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
> | legacy carve — **small** tile | 9 | structural (`ringArea ≤ 1500`) |
> | legacy carve — degenerate | **0** | every tile that qualifies for the offset path succeeds on it |
>
> ⚠️ **Corrected 2026-07-31:** this table first read *"32 median · 10 small"*, which conflated the two
> median classes and mis-split the total. `isMedianTile` is `isDividedMedian || (isLoopInterior &&
> medArea > 0.5)` — two different tile kinds behind one flag. Total is unchanged at 42.
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

- **D6a — build `iA` as a parallel offset, not an asphalt-union carve. ✅ CONSTRUCTION LANDED** (`offsetRingVariable`, 2026-06-09; now the DEFAULT at `tileGround.js:2728/2810`, replacing the `tile.ring − aFill` carve — which survives only as the degenerate `legacyBlock` fallback). Per-edge offset (`chain ⊕ pavementHW`, corners = offset-intersections; at a divided transition, corner the corridor outer-edge legs via the frozen `phase.spineAt*`). Converges to today's curb everywhere except the bug sites. **Turns Check A green** (incl. the junction zone). ⚠️ **but NOT yet robust — un-parked 2026-06-14.** Live confirmation: the correctness detector's **CURVE-FIT gate is RED** — offsetting the *smoothed* centerline (smooth=1.5) produces **6 new needle/spur degenerates** vs smooth=0 (`scratch/correctness-detector.mjs`), which is exactly why `STREET_SMOOTH` is pinned at 0 and macro FRONT A3 (curves-on) is blocked on the robust offset. The **curve-fit / smooth centerline** (the one knob, `SKELETON §3.5`) is its forcing function: a smooth dense curve makes the curb's inward offset **self-intersect at tight bends** → a **172° needle** (W18 corner: tile.ring smooth at 16°, curb spikes to 172°). Root: the through-node/curve path (`offsetRingVariable` :122–124, the averaged-normal offset) has **no miter clamp** (the :128 clamp guards only *corner* vertices), so on a bend tighter than the offset depth the inner edge overshoots and `unionRings` (:136) leaves the needle. The faceted curve hid it; the smooth curve exposes it — *the litmus-RED non-parallelism, made visible*. **"Proper" = the robust clean offset** (tight-curve-safe), **authoring untouched** (only `iA` construction changes; handles still read the resulting rings — brief §"Authoring integration").
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
