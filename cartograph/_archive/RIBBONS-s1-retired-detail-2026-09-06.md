# RIBBONS §1 — retired detail, 2026-09-06

Moved out of `cartograph/RIBBONS.md §1` when the corner landed by the ruled method. Both blocks were
LIVE doctrine until then; they are kept here for the trail, not for currency. **Live home for both:
`RIBBONS.md §1`.**

---

## A — the `easeRing` corner pass, built and excised 2026-09-05

⭐ **Why it is retired as prose:** the corner is now BUILT, by the method this block was warning
against building the wrong version of — the node's own handle configuration, no threshold, no
budget, no decline, no revert. Its one live sentence survives in `§1` and in `easeContour`'s header.

> ### ⛔⛔ AND A CORNER PASS WAS THEN BUILT ANYWAY, AND EXCISED THE SAME DAY. READ THIS BEFORE BUILDING ONE.
> `easeRing` rounded ②'s corners after the offset — arc-length walk, setback `R/tan(θ/2)`, a budget
> against neighbouring corners, a decline when it did not fit, a revert when the result self-intersected.
> ⭐⭐ **IT WAS A CORNER CONSTRUCTOR, WHICH IS THE ONE THING THIS SECTION SAYS A CORNER IS NOT** — Jacob:
> *"the chains should be smooth, the corners should be native."* §1 had already retired
> `cornerAt`/`capAt`/`filletRing` for exactly this reason (*"a contour already IS its corners and caps"*),
> and this was those three under a new name. ⛔ Retiring machinery in a doc does not stop it being
> rebuilt; only naming the SHAPE of it does, which is what this block is for.
> **Its history is the whole argument, and every step is a guard propping up the last one:**
> 100 m chords across blocks (the setback diverges at shallow angles) → a budget to stop that, keyed on
> an invented ~7° turn threshold that ordinary curvature tripped, so REAL corners came back "too tight"
> → a cluster-collapse to fix that, which **silently zeroed every corner on every clean quadrilateral
> block**, because all four of a block's vertices are crossings → removing the collapse broke the rings
> outright. ⭐ **Each fix was aimed at the previous fix.** That pattern is the signal to stop.
> ⇒ ② is the PLAIN OFFSET of ①, and it renders correctly on a block. **The authored radius is still
> owed and still belongs in the node's bezier handles** — a property the contour CARRIES, not a shape
> built onto it afterwards. ⛔ What survives and is frozen: the crossing identity, so a corner is still
> known by construction as the place two chains crossed.
> ⚠️ **AND THE HARNESS WAS LYING WHILE ALL THIS WAS JUDGED.** `draw-*.mjs` emitted each ring as its own
> filled `<path>`, so an annulus painted its outer ring solid and then its HOLE solid on top — a 0.381 m
> curb strip rendering as a filled 19,816 m² block. Hours went into "band floods" and "black wedges" in
> geometry that was fine. ⭐ A band is a COMPOUND PATH: one `<path>` per band, `fill-rule="evenodd"`.
> The same class as four other errors that day, all of them a compound path handled as loose rings.
> ⭐ And it explains the collapse we already measure: ε is *"a PRESENCE with TWO nodes at every mouth"*
> while `coupler-slit-universal.mjs` prints `FACE=SLIT gap=0.000m` on every LS tip. **The two apexes are
> real in ① and collapsed in the freeze** — ⛔ cause of the collapse not established here.
> ⚠️ ⛔ **Denominator warning:** that probe counts every unshared chain endpoint (211 on LS), **not** the
> canonical 50 dead ends. Do not merge the two counts. 97 tips carry 3 contour vertices and 2 carry 4;
> cause not established.
> ▶ `_handoffs/HANDOFF-curve-primitive-skeleton.md` — its §72 (*"tangent directions = the bounding
> straight-leg directions"*) is the same law, written for mid-chain.
>

---

## B — grout gates A+B, measured 2026-09-04

⭐ **Why it is retired:** the gates asked whether the grout could be stroked, united and offset at
all. It is now the shipped producer for both Survey and Section, which is a stronger answer than the
gates gave. The two rules inside it that are still LIVE were kept in `§1`: ⛔ never copy GATE A's
`jtRound`+`etOpenRound` stroke into the protopolygon, and the fold class does not reproduce when a
CONTOUR is offset (blocks vanish rather than fold — loud and countable).

> #### ▶ STATE OF THE BUILD — gates A+B measured 2026-09-04; **the grout DRAWS** since `a82a6d8d`.
> ⛔ **Re-run; the directions are the doctrine, the digits are a snapshot — which is why the digits are
> NOT repeated here.** ▶ `scratch/gate-a-grout-holes.mjs` · `gate-b-grout-offset.mjs` · `?grout=1`
> - **GATE A — topology.** Stroke at ε, unite, subtract from the stencil (artifact-derived, so it
>   ports). **The grout INVENTS NOTHING** — every ring lands inside a frozen tile, three towns; where
>   it differs it SUBDIVIDES a tile the freeze merged. **`POLYGON-FIRST §2.1` checks 1–2 go to ZERO
>   from ε alone**, on a gate whose own text says it "fails on ALL 50 dead-end tips". **ε's value
>   carries no information — measured** across a wide sweep. ⛔ LS's count match is a NET (one tile
>   splits, one receives nothing), **not a bijection**. ⛔ **This gate strokes `jtRound`+`etOpenRound`
>   — it ROUNDS. Fine for a topology count; NEVER copy that call into the protopolygon.**
> - **GATE B — authored widths + the fold class.** **The LEGS LAND ON THE CURB** — deviation at the
>   millimetre, LS and HPDM. ⭐⭐ **AND THE FOLD CLASS DOES NOT REPRODUCE**: `POLYGON-FIRST D6a` marks
>   the chain-side offset NOT robust (~70% of crossings at the averaged-normal branch); offsetting a
>   CONTOUR gives zero repeated-vertex rings across both towns. **The predicted failure appeared
>   instead — blocks VANISH rather than fold**, which is loud and countable.


---

## C — the 2026-08-06 punch-out evidence and cautions

⭐ **Why it is retired:** it collected what was known BEFORE `blocks = boundary − stroked roads` was
the render path — the `punchout-spike` numbers, the two commits that broke the rounded primitive,
and the `SPUR_OUTLINE` build-and-revert. The substrate has since shipped and is the producer for
Survey and Section, so these are the trail, not the state. **One rule from it stays live in `§1`:
⛔ read the punch-out's output as a COMPOUND PATH — boundary contour + holes + islands — never as a
flat block list.** That misread is exactly what the 2026-09-06 compound-face fix had to undo.

> ## ⭐⭐ 2026-08-06 — the evidence and cautions that survive the ruling. Read before building.
>
> ⛔ **The "tried and reverted" note below is about `SPUR_OUTLINE`, which `ROADMAP A0` describes as asserting
> the spur *"rather than punching the whole map."* It was the ALTERNATIVE to `blocks = boundary − stroked
> roads`, not that construction.** That construction has never been the render path and the eye has never
> seen it.
>
> **What is measured, with the commands (⛔ do not quote these numbers without re-running):**
> `node scratch/punchout-spike.mjs` — the punch-out already computes: `blockSharp = differenceRings([stencil],
> asphaltSharp)` (`buildBlockGeometryV2.js`), gated behind `__debugRings`, and **`frontageEdges` is already
> sliced from it.** ⛔ **Read its output as a COMPOUND PATH** — boundary contour + holes + islands, winding-
> encoded — never as a flat block list; that misread is recorded in the spike's own header.
>
> **What broke it, two commits a week apart, neither saying so:** `4044bca1` (7/15, *"perf(designer)!: T4"*)
> deleted the rounded primitive `applyRoundCornersToRing`/`blockRounded`; `cd062388` (7/22) emptied
> `ribbons.intersections` **258 → 0**, which is what `cornersAtIx` walks. ⚠️ The primitive was restored
> 2026-08-06 (`090a68cf`) and **reverted the same day on Jacob's call** — it rounded nothing anyway, because
> its input is that empty array. Recover it from `4044bca1^` if the substrate question rules that way.
>
> ⛔ **INVARIANT 2 governs any move here:** never two rounding mechanisms on the same object. Live form:
> `filletRing` rounds once, the inward bands `jtMiter`-inherit it (§3.3). *(This clause used to name
> `applyRoundCornersToRing` — deleted at T4; only comments in dead modules still mention it.)*
>
> ---
>
> ⛔⛔ **TRIED AND REVERTED, 2026-07-31 — but the verdict is UNRELIABLE, not reversed.** Asserting the spur as
> a closed two-sided outline before the walk (`spurOutline.js`, `SPUR_OUTLINE`) was built and then
> **reverted out of trunk** (`152e7734` built it, `7b5b87a3` reverted it, taking the corner registry and
> the probes with it). There is **no `spurOutline.js` in the tree and no `SPUR_OUTLINE` in any source
> file** — verified 2026-08-04. ⛔ **Do not go looking for the flag; there is nothing behind it.**
> ⭐⭐ **THE LESSON IS THE LOAD-BEARING PART, AND IT IS NOT "the probes don't predict the eye" — that
> over-read it.** Named 2026-08-06: **Jacob was looking at `lafayette-square` while the work was on
> `lafayette-square-staging`, and neither party knew all day.** Different maps (overlay-authored
> **52 vs 177**), so the verdict was taken on the scene the change was *not* on. ⛔ **Do not cite the
> revert as proof the construction fails, and do not read this as licence to re-land it** — the probes
> are neither vindicated nor discredited. ⭐ **An eye verdict must record the SCENE it was taken on**,
> as strictly as a measurement records its authoring state (`PREBAKE §4.0a`, `ROADMAP A0`).
> The dead-end substrate question was therefore **OPEN** on that evidence — ✅ **and is now RULED
> (2026-08-12, the block at the top of this section).** ⭐ **The revert still must not be cited as proof
> the construction fails**; the ruling does not rest on it either way.

> The tile model replaced the **figure-ground** regime (blocks-as-positive, streets-as-subtracted-void) in the ~2026-06-01 re-pour, and **T4 (2026-07-15) deleted figure-ground's geometry outright** — the tile construction is now the only one. The emitter reference is archived at [`_archive/RIBBONS-figureground-emitter-2026-06-15.md`](_archive/RIBBONS-figureground-emitter-2026-06-15.md); `silhouetteStraightEmitter` and the band emitters no longer exist in the tree. `buildBlockGeometryV2` survives as a **frontage-edge identity builder only** (§1's T3 note below).

> ## ⛔⛔ RETRACTED IN FULL, 2026-09-05 — "CONSTRUCT the hard polygons" is dead. **BOTH** hard polygons derive.
> ⭐ The median half was retracted 2026-06-15 (the update below). **The junction half is retracted now**, by
> Jacob's *"E3 is superseded; fold it in and close the campaign"* — the grout polygonizes the network and the
> junction falls out, so there is nothing left to construct positively. ▶ **LIVE: `§1`'s grout ruling.**
> ⭐⭐ **AND THE DOCTRINE PREDICTED ITS OWN DEATH** — its "deeper pattern (bank it)" below says every hard case
> so far dissolved by fixing the DERIVATION. It was three for three; this was the third.
> *(2026-06-15 text kept below for the record — ⛔ nothing in it is live.)*
