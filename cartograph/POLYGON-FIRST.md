# Polygon-First — made enforceable

> **The doctrine, reduced to checks.** "Polygon-First," "chains die at the wall," "the curb is frozen" are *outcomes stated as nouns*. This doc replaces each with a **test that is red until the outcome is true** — so "done" can never again be claimed over a thing that isn't. If a Polygon-First claim anywhere in the corpus doesn't cite a check below, it is aspirational, not done.
>
> SSOT for the curb-geometry gap that motivated this: `PREBAKE.md §4.1`/`§5`, `SKELETON.md §5f`. This doc is the *enforcement* layer above them.

---

## 0. Why this doc exists (the reckoning, 2026-06-09)

The program built walls, sequenced bakes, and a whole vocabulary around freezing chaotic OSM chains *once* into rigid polygons that every downstream consumer trusts. It mostly worked. But the **street curb** — the most visible polygon on the map — was never actually frozen. It is still **re-stroked live from the chains every frame** by `buildTileGround` (`iA = filletRings(tile.ring − aFill)`, `src/lib/tileGround.js:1994`), and that union-carve bows it at divided transitions (the "d" bulge). Only **Section** reads a frozen curb; **Survey** — the surface the operator's eye is on — re-derives every frame (`src/cartograph/BlockGeometryV2Debug.jsx:669`).

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

## 2. The definition-of-done — three checks, not three adjectives

"Polygon-First is done for the curb" **means exactly** that all three pass. Nothing else counts as done.

### Check A — Tier-1 parallelism (runnable TODAY · RED)
`cartograph/litmus-curb-parallel.mjs` — runs against the live producer (`buildTileGround`) and asserts every straight-run curb is a parallel offset of its chain (raycast chain→curb, distance must equal the street's half-width).
- **Status today: ❌ RED — 38 straight-run stretches bow up to 5.8 m off-parallel**, in the run *middles*, away from any corner. That alone disproves "the curb is a parallel offset."
- **Its honest blind spot:** it is **deliberately blind in the ~9 m junction zone** where the famous "d" bulges live — a cheap heuristic cannot separate an artifact bulge from a legitimate corner fillet there (both deviate). Widening it to reach the bulge floods it with real-corner false positives. So Check A proves the *weaker, certain* claim; it does not certify which junction-zone bows are artifacts. **That is what Check B is for.** (This blind spot is itself a lesson: the defect hides exactly where the cheap proxy can't look.)

### Check B — Tier-2 identity (the real gate · writable only after the freeze)
> With no element active, **Survey's rendered curb == the prebake-frozen curb, byte-equal** — and the frozen curb is the clean offset (it passes Check A *including* the junction zone, because corners are constructed, not carved).

This is the un-fakeable test. It cannot be written today because there is **no upstream-frozen clean curb to compare against** (D2 froze topology, not geometry) — and *that inability is itself the proof the curb isn't frozen.* It extends the existing precedent harness `scratch/hadrian-wall-open-proof.mjs` (which machine-proved `sectionOpen` chain-free). Block-independence is already verified (`PREBAKE.md §5`, `SURVEY.md §4.1`), which is what makes "only the active element re-derives" achievable.

### Check C — no chain in the producer's scope (structural)
> `buildCurb` has **no chain / street / measure-chain in its lexical scope** — the curb is built from the frozen frame only. Enforced the way `sectionPass` already is (a signature with nothing to reach back through), greppable in CI.

Today the producer is `buildTileGround(liveRibbons, …)` — chains fully in scope, re-stroked every frame. Check C fails by construction until the curb construction is a closed function of the frozen frame.

**Done = A ∧ B ∧ C green.** Until then, "the curb is frozen / Polygon-First" is false, and the corpus must say so.

---

## 3. The way forward — give the curb an owner (D6a → d)

The curb-geometry freeze was nobody's deliverable (§0.1). These are the named, sequenced tickets that close it. Full brief: `HANDOFF-freeze-the-curb-in-the-first-bake.md`. **Rebuild-gated → PARKED** (Jacob, 2026-06-09: anything requiring a rebuild waits).

- **D6a — build `iA` as a parallel offset, not an asphalt-union carve.** Replace `iA = tile.ring − aFill` (`tileGround.js:1994`) with the per-edge offset (`chain ⊕ pavementHW`, corners = offset-intersections; at a divided transition, corner the corridor outer-edge legs via the frozen `phase.spineAt*`). Converges to today's curb everywhere except the bug sites. **Turns Check A green** (incl. the junction zone). Visible on Jacob's eye immediately — de-risks the geometry first.
- **D6b — freeze it in prebake (the D2 pattern, extended to geometry).** Factor D6a so `derive.js` emits `iA` **once** and freezes it into `ribbons.tiles[]` beside `{ring, edges}`, with its load-bearing companions (`ring, vertR, bandJoin, cap, runs[].measure, med, tips` — `PREBAKE.md §4.1`), in the **authored** state. Moves the wall to ~P3. **Makes Check B writable.**
- **D6c — Survey *consumes* the frozen curb.** Extend the chain-free consumer pattern (`sectionOpen`) to Survey's `tileGeos` (`BlockGeometryV2Debug.jsx:661`): inactive tiles read the frozen `iA`; only the active element re-strokes. **Turns Check C green.** This half has never existed.
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

1. **The invariant suite (the DETECTOR).** Grow the curb checks into a comprehensive set — **one runnable, RED-until-true invariant per bug-class:** curb ∥ chain (`litmus-curb-parallel`, exists) · `iA` no self-intersection (exists) · `corner-guard` byte-stability (exists) · **loops close · no width-step at a through-node · cul-de-sac cap tangent · no polygon overlap · divided median sane · no jagged-arc (max-turn) on a smooth curve.** The suite **flags the bad streets automatically** — the eye, mechanized.

2. **Validate against the 35 (the LABELED SET).** Run the suite on the **raw OSM geometry** of the 35 curated streets (pre-hand-fix). A correct suite **flags those 35** and **does not false-positive** on the clean grid. That tunes the detector to catch exactly what the operator caught — the **acceptance test for the suite itself**.

3. **Enforce (the kit invariant, made mechanical).** Every flag → a **general skeleton fix** (the *class*, never the street — `SKELETON §6`). The suite is a **CI gate:** no green build with an un-flagged defect; a fix must turn a RED invariant GREEN *generally*; a regression guard keeps a fixed class fixed across towns.

4. **The onboarding loop:** new town → run the suite → fix the flagged classes in the skeleton → green → ship. **Zero hand-fixing, by construction.**

**The reframe this forces:** the six SHAPE tasks aren't the deliverable — **the detector is.** Fixing the 6 classes makes LS's suite go green; the *suite* is what defeats the problem on town #2…N. "Remove the 35 and see what breaks" stops being a one-time forensic and becomes the **standing regression test.**

> **First detector pass — scope (read-only, no production change):** harness `scratch/correctness-detector.mjs`. **Inputs:** the 35 curated chains (names in `INTAKE §6.1`) + their **raw OSM geometry** (`centerlines.json` `source:'osm'` siblings, or re-fetch per chain). **Invariants v1:** the three that exist (`litmus-curb-parallel` · iA self-int · corner-guard) **+** cheap new ones — **max-turn-per-chain** (the jagged-arc detector — must flag West 18th), **width-step at through-nodes**, **face-closure**. **Output:** per-street pass/fail → the flagged set + a **confusion report vs the 35** (recall: flagged ⊇ the 35? precision: clean grid mostly passes?). **Acceptance:** high recall on the 35, low false-positive on the grid — *then* the thresholds are trusted. This is the seed of the suite; it converts the campaign from "fix 35 streets" to "make the detector green."

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
