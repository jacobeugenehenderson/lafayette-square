# ARCHIVED — HANDOFF: A03, split the curb producer at the chain boundary (LANDED)

> **Archived 2026-07-31, the day it landed** (`4dd05303` + `aa40a7d5`, merged to trunk). Kept for the
> reasoning trail — the settled Option-A fork, the withdrawn "collapsed rings" census, and the
> authoring-blind-prebake correction that forced the design.
>
> **Outcome:** producer split into `freezeCurbEdgeFacts()` (chain-derived) → `buildCurbRings()`
> (chain-free). Byte-identical on authored **and** bare-defaults state. **Check C green for the
> offset path only — 42 of 101 tiles still carve.**
>
> ⛔ **Do not work from this file.** As-built record → `cartograph/POLYGON-FIRST.md §3`.
> The remainder → `ROADMAP A06` + `_handoffs/HANDOFF-A06-legacy-carve-chain-free.md`.

---

# HANDOFF — A03: derive the curb in prebake (make Check C green)

**Agent: FRESH.** ⭐ **Name yourself.** This touches a different subsystem than the A01 work (the wall + `buildTileGround`'s producer, not pipeline determinism), so there is no context worth inheriting — and the one genuinely reusable asset is a **committed file, not context**, so a pointer carries it:

> **Reuse, do not rebuild — `scratch/repro-a01-artifact-diff.mjs`** (Tally, commit `772fa3cf` on branch **`repro-a01`**, checked out at `.claude/worktrees/pipeline-repro`). ⚠️ **It is NOT on trunk.** A read-only structural artifact diff: it reports counts *and* the per-street content the `promote-ribbons` guard is blind to (on the A01 case it printed *1 count field moved* next to *23 of 209 streets with a different measure*). **This is your acceptance harness for §3** — cherry-pick it or run it from that worktree; do not write a second one.

⛔ **Long context is a hazard on this topic, not an asset.** On 2026-07-31 a saturated session asserted a seven-week-old doc as current and reported that working infrastructure did not exist. Read §1 below from the code if anything smells wrong, and prefer re-reading to remembering.

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` (the WALL row) → **`cartograph/WALL.md §2`** (the SSOT for what is and is not frozen — read this before any other wall claim) → `cartograph/PIPELINE.md §Wall` → `cartograph/POLYGON-FIRST.md §2` (Checks A/B/C) → `cartograph/RIBBONS.md §1`.

---

## ⛔⛔ LAYER 0 — answer these out loud first

**This is a KIT. LS is the first town off the line, not the subject.**

1. **What does this do for town #2?** This one passes cleanly: a curb *derived* from the frozen frame is correct by construction anywhere, while a curb *traced* from chains is only as good as the tracing on the town you happened to look at. No operator needs to have seen the street.
2. **What happens when it is wrong on an uninspected town?** It must **fail loudly**. ⛔ NO FALLBACKS.

⭐ **And the lesson that outranks the task:** on 2026-07-31 an arc in this same area had **every probe green** — slits 50→9, blocks 101→101, junction band 101→110 clean — and Jacob's eye said **WORSE** on both scenes; it was reverted (`7b5b87a3`). **These probes do not predict the eye.** Measure freely; conclude nothing about quality from a count.

---

## 1. The state of the wall — verified in code 2026-07-31

| | state | evidence |
|---|---|---|
| **Consumer boundary** | ✅ **DONE, wired, defended** | Every non-Survey view — Section/Measure **and** the neutral Design view — renders from the frozen `shape.json` (`BlockGeometryV2Debug.jsx:562`). Frozen `iA` on **93/101** LS tiles + per-run curb polylines with measures. `sectionOpen` has **no chain in lexical scope** (`tileGround.js:1812`) — it physically cannot re-derive. Race-guarded twice (`72bbc989`, `59e5f109`). |
| **Survey strokes live** | ✅ **BY DESIGN, not in scope** | Survey is the tool that *edits* the SHAPE. Not a leak. |
| **Producer boundary** | 🔴 **THE JOB** | `shape.json` is **minted** by `buildTileGround(liveRibbons, …)` and then snapshotted — so the frozen artifact is a **photograph of a chain-stroke, not a function of the frozen frame**. **Check C is RED.** |
| **Silent fallback** | ✅ fixed `b27ce690` | An absent/failed freeze now raises a red StatusBar banner. ⚠️ eye-gate owed (it cannot fire on a scene that has a freeze). |

**The job in one sentence: build the curb once in prebake from the frozen frame, so the artifact is DERIVED rather than TRACED.** That is D6b/c. Nothing else.

## 2. Why it matters beyond tidiness

A correct curb is, by definition, `chain ⊕ per-side halfWidth` — a parallel offset, with genuine corners as the intersection of two offsets. It is a pure function of the frozen frame. Because it is instead traced live and snapshotted, the tracing's errors are **frozen into the artifact at mint time** — which is why the divided-transition bow at Mississippi × Lafayette (~4 m off parallel on a dead-straight chain) has survived every downstream fix. You cannot cure it after the snapshot; it is already in the photograph.

## 3. ⭐ The acceptance test — byte-identical

**This changes WHERE and WHEN the curb is computed, not HOW it is drawn.** Same inputs must give the same rings, produced once upstream instead of traced downstream. **Nothing should move on screen.**

⛔ **If a proposal touches the geometry math, it is the wrong pattern wearing new words.** Six attempts in this area have been reverted or killed for exactly that (`SKELETON §5e` corner-patch KILLED; the band-fold clamp; the `thinTile` clamp; the through-junction straightener; the spur assert). Every one changed the drawing. This changes the location.

## 4. ✅ SETTLED 2026-07-31 — take Option A. Do not re-open this fork.

This section used to ask you to choose between freezing the curb *as-is* and deriving it *correctly*. **That fork is closed: measure first, and "correctly" turns out to have no meaning.** The measurement (`POLYGON-FIRST §2` Check A — **read it before this paragraph**):

- Check A is **RED and MIS-SPECIFIED**. It runs `blockCustoms: null` — authoring OFF — so it scored **the operator's own authored widths as defects**. Mississippi is parallel to the centimetre *at its authored 8.70 m*; the check measured against 11.83 m and called it a 3.13 m bow.
- ⛔ So **Option B is dead**: you cannot make that curb "more parallel" — it already is. You would only be **picking a different width**, and the correct width is the authored one the curb already honors.
- With authoring honored the count barely moves (**78 → 79**); the **composition** changes. What remains is genuine wander plus **collapsed curb rings**.

**→ Option A: move the computation into prebake, output unchanged, byte-identical, no eye-gate.** That is this ticket.

## 4b. ⛔⛔ THE "COLLAPSED CURB RINGS" TICKET WAS WITHDRAWN — do not chase it

An earlier draft of this brief sent you after *"28 of 92 tiles with a collapsed curb ring."* **That was retracted the same day. It was never a defect.**

It measured **`iA` AREA** — but **`Block = iA = tile − the authored roadway`** (`SURVEY §3` step 5), and the asphalt-edge handle *"strokes the pavement half-width outward; **the block follows**"* (`SURVEY §4`). **So it was measuring the operator's own width edits.** Area cannot separate an authored wide street from a genuinely narrow historical block from a graph face that is legitimately all roadway. Nor does a better threshold help: median ring-share climbs **1% → 34% → 45% → 86%** with block size alone.

⛔ **This is `CLAUDE.md` Layer 0, question 3 — and it caught three separate passes in one day.** Before you report *anything* as a defect: **load the scene's authored state and re-measure.** A check run on bare defaults is worst on the most authored town and cleanest on a fresh pour — blind exactly where the map is most worked-on.

**Nothing in A03 depends on any of this.** Your contract is byte-identical output; **while landing A03, if you find yourself measuring geometry quality at all, you have left the ticket.**

**On `ROADMAP A05` — it IS yours, but SEQUENCED AFTER A03 lands, never alongside it.** *(Reconciled 2026-07-31: an earlier draft of this line said "not yours" while the dispatch note said "stays yours." The agent flagged the contradiction rather than guessing — correct. This is the resolution.)* The distinction that keeps it clean:
- **A03 touches the geometry path** and must come out byte-identical. Land it and prove it first.
- **A05 touches only the probe** (`litmus-curb-parallel.mjs`) — run it with the scene's authored `blockCustoms`, emit `UNMEASURABLE` as its own failing class, update `POLYGON-FIRST §2`'s status. **It changes no geometry**, which is exactly why it cannot endanger A03's proof — *once A03 is already landed.*

⛔ **Do not interleave them.** Mixing a geometry move with a measurement change means a byte-difference has two possible causes and the acceptance test stops meaning anything.

## 5. The authoring constraint — non-negotiable

The live stroke is not only a perf wart; **it is how the tools work.** Handles anchor to the achieved curb rings (`setSectionCurbRings` — "one geometry truth": the handle reads the geometry, never re-derives). A freeze must be designed **around** that:

1. **The frozen curb is a function of the AUTHORED state, not bare defaults** — freeze with the current overlay applied (`blockCustoms`, corner radii). "Parallel offset" means parallel at the *authored* width.
2. **One geometry truth survives.** Frozen rings govern inactive elements; the live stroke governs the element under the operator's hand. Handle code must read whichever governs its element — never a second truth.
3. **Edit → commit → re-freeze.** During a drag, re-stroke only the active element and its neighbours (block-independence is verified — `PREBAKE §5`). On accept, persist *and* re-freeze the affected blocks so the frozen body stays the authored state.

⚠️ **If any step cannot be made block-local, surface it immediately** rather than absorbing it — that is the real risk in this program.

## 6. Deliver

1. ✅ **Check A measured — DONE 2026-07-31, do not re-run for a verdict.** It is mis-specified; its aggregate is not evidence (`POLYGON-FIRST §2`).
2. ✅ **The §4 fork — SETTLED: Option A.** Byte-identical, no eye-gate.
3. **The curb derived in prebake and consumed**, with the byte-identical proof.
4. **Check C green** — and say how you know, not that you believe it.
5. ⭐ **Fix Check A itself** *(small, and it unblocks everyone after you)*: run it **with the scene's authored `blockCustoms`**, and report an **absent/degenerate curb ring as its own loud failure class** instead of folding it into a parallelism magnitude. Update `POLYGON-FIRST §2` Check A's status when you land — it is stale by design until someone does. The three rules this forced are in **`POLYGON-FIRST §5`**; obey them for anything you add to the suite.
6. A short writeup: what landed, what you left, any new defect found.

## 7. Rules and bounds

- ⛔ **Standup with Jacob before writing code.** Bring §1 (confirm you read it right), the Check A number, and the §4 fork **as prose**.
- ⛔ **Do NOT re-promote over a committed artifact without Jacob's eye on the difference** — `ROADMAP A01`: the pipeline does not reproduce its own committed output, and re-deriving destroyed the map three times on 2026-07-31. The inputs are tracked as of `4e3dd70a`; `promote-ribbons.js` refuses a material change without `--yes`.
- **Writers require an explicit scene** — `node pipeline.js` alone exits 2. Pass `--scene=lafayette-square`.
- **Write bounds:** your branch/worktree + `scratch/` (tracked on purpose — reuse the 200+ probes before building one). ⛔ Canonical docs are off-limits **except** `ROADMAP A03` + `WALL.md §2` if you land it — and if you do, **move superseded text to `cartograph/_archive/` dated; never leave a correction stacked on top of what it corrects** (`CLAUDE.md` "Keep it trimmed", `BOZ.md §3`).
- **Everything inside `lafayette-square.nosync/`**; worktrees under `.claude/worktrees/` (cleaned 2026-07-31 — the tree is empty, dispatch is safe). ⛔ **Do not start a dev server** — one is running.
- ⭐ **The eye is the gate, and a proxy render is not the eye.**

---

*Rewritten by Boz 2026-07-31, replacing the 2026-06-17 brief whose "live, downstream, every frame" framing was false and cost a session. Full prior text (the five ruled-out approaches, the instrumented Lafayette × Mississippi findings): `cartograph/_archive/HANDOFF-freeze-the-curb-in-the-first-bake-RESCOPED-2026-07-31.md`.*
