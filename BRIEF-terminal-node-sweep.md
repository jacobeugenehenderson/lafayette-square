# BRIEF — The terminal-node sweep (the "universal solvent" for the false corner)

**Status:** DRAFT, dispatch-ready. Fresh-agent brief (identity + bounds below). Boz drafted 2026-07-21 from a long design session with Jacob; **Jacob dispatches.** Supersedes the *approach* in `HANDOFF-thrunode-gate-fix.md` / `scratch/THRUNODE-GATE-LANDING.md` (that cure landed on a proxy and was overturned on the eye the same day — see "Why the last cure died"). This is the reframe that dissolves that whole class.

> ⛔ **ROUTE FIRST (CLAUDE.md gate).** Read `ORIENTATION.md` → `README §⭐ START HERE` → **`SKELETON.md §5` + `RIBBONS.md §1/§4` + `PREBAKE.md §4/§5`** before touching code. This brief assumes that canon. The relevant memory: `[[project_skeleton_is_the_first_bake]]`, `[[feedback_read_canon_before_forensics]]`, `[[feedback_proxy_render_is_not_the_operator_eye]]`.

---

## Who you are + the bounds

You are a fresh specialist landing **one** change: give the frame an authoritative answer to *"is this node a real corner, or a road passing through?"* — a stamped identity fact — and then **remove the wiring that only existed because that answer was being guessed.** You are NOT reworking divided roads, curb geometry, the FILL, or the bake. Stamp identity; delete the guessers; prove it on the eye. If the scope pulls wider, **surface it to Jacob** rather than expanding silently (`[[feedback_baby_must_surface_scope_drift]]`).

**Hard rule from the canon (do not violate):** ⛔ this is an **identity stamp, not a geometry move.** You do not consolidate the skeleton, project nodes onto chords, weld chains, or move a vertex. `SKELETON §5c/§5e` reverted every geometry-moving attempt at these corners; the only axis the canon never rejected is *labeling*. Stay on it.

---

## The problem, in one picture

```
        A ───────●─────── B          A and B are the SAME road (identity), running straight through ●.
                 │                     C is a DIFFERENT road that terminates at ●.
                 │  C                  The system should: run A–B straight, corner belongs to C.
                 │                     The system DOES: sees "3 roads meet" → mints a false rounded corner on A–B.
```

The corner test today is pure local identity — `tileGround.js:3031`, `cornerAt(i) = streetAt(i-1) !== streetAt(i)` keyed on `roadId||skelId||name`. It has **no notion of "who terminates."** So at a T it fires correctly-but-uselessly (A≠C is true), and the corner machinery rounds A against C. When the through-road **doglegs** through the node, even the `roadId` union's angle gate (`DOT_CONTINUES=-0.6`, `derive.js ~:2444`) fails to recognize A and B as one road, and you get the false corner Jacob keeps marking.

**Scale (census, `scratch/terminal-node-census.mjs`):** the T/dogleg case is the *dominant* multi-road node type — **72 on LS, 202 on HPDM.** This is not a special case; it is the common case, currently handled by per-node guessing.

## Why the last cure died (read this before re-deriving it)

`thruNodeEnds`/`isThruNode` (`HANDOFF-thrunode-gate-fix.md`) tried to do exactly this, but **locally and by inference**, and it failed two ways (verified `scratch/thrunode-frozen-verify.mjs`):
1. It **inferred** the through-street as "the one with an interior vertex at the node" → picked the **side street** when the through-road was split into two skelIds at the node (Mackay).
2. It **coord-matched** the node → **missed Kennett** (node coord ≠ any frozen run endpoint).
3. It verified on a **live sliver-count proxy**, not the frozen render — so the eye never gated it (`proxy ≠ eye`).

This brief removes all three failure modes: the fact is **stamped at frame-build time when the full topology is in hand** (no inference, no coord-match), and acceptance is **the frozen render + Jacob's eye** (never a headless count).

---

## The fix — three beats

### Beat 1 — Identity (group, don't weld)
An identity is **one physical road**: `same name + near-continuous`. This is the existing `roadId` union (`derive.js ~:2401-2453`) with two changes:
- **Drop the angle gate** (`DOT_CONTINUES=-0.6`). It was excluding doglegs — a road that jogs >~53° at a node was read as two roads. For a pure *label* (no geometry moved) there is no reason to require near-straightness.
- **Let a roundabout-loop piece count as mid-road.** A closed-loop chain (start==end) in the middle of a road must not isolate the road into a ring (see St Vincent below).

**Deliberately OUT of scope — do NOT unify far-apart same-name pieces.** Two same-name stretches separated by a gap (e.g. either side of a park) never share a node, so unifying them changes *no* terminal classification — it's solving a problem we don't have, and it risks over-welding coincidentally-collinear unrelated streets (the canon's warning, `SKELETON §5b-bis`). Directional-prefix roads (East/West Sample) are already bridged by the `corridor` pass (`skeleton.js` step 14) and are an *input* to identity, not a new case. **Write this reasoning into the code comment so it isn't re-litigated.**

### Beat 2 — The terminal sweep (per node, over the identity graph)
Reconstruct each identity's full extent as a graph (its pieces' shared vertices). Then, at every node:

> **A node is a TERMINAL for identity X ⇔ the node is a degree-1 tip of X's own graph. Otherwise X is THROUGH there.**

This is general over *any* tip count — no "find the two ends" disambiguation:
- **2 tips** = ordinary road.
- **1 tip** = lollipop (cul-de-sac bulb / Benton teardrop): the 1 tip is the join; the bulb is interior.
- **3+ tips** = a Y or a same-name tee (HPDM "Broadview Drive"): every tip is a terminal, the branch-point is through. **Works natively — this dissolves the entire "fork" worry.**
- **0 tips** = a ring → Beat 3.

### Beat 3 — The ring rule
A **0-tip identity is a ring** (roundabout-only: HPDM *Meditation Garden*, *South Terrace*; St Vincent's loop). A ring **mints no terminal and no corner** — it is a ring feature (the doctrine already exists for loop-body medians, `RIBBONS §3.5`). Roads terminate *into* a ring and *those* get the corner. (3 rings across both towns.)

**The corner rule that falls out:** mint a corner for identity X at a node **only if X is TERMINAL there.** A THROUGH identity runs straight — no corner on its frontage. At a T: the stem is terminal (gets the corner wrapping onto the through-road), the through-road is through (stays straight). Dogleg, roundabout, N-segment stem — same answer, because it's read off *who-terminates*, not off the turn angle.

---

## Where it lands (the layer)

- **Stamp it in `skeleton.js`** as a per-chain-endpoint fact, computed after welding when the full graph exists (near step 12 `buildNodeGraph`/cap-as-fact — the node typology is already computed there). It is the same *kind* of frozen identity stamp as `caps`, `phase.spineAt*`, `continuesAs`, `corridor`.
- **Freeze it into `ribbons.json`** (via the `derive.js` serializer whitelist + the frozen `runMeta`, the way `roadId`/`spineAt*` ride) so it survives the Wall and **Section reads it post-Wall without node-matching** (`PREBAKE §4/§5`).
- **Consumers READ the fact** instead of re-guessing: `tileGround.cornerAt`, `sectionPass`'s corner/ADA bid.

Split doctrine (already named in `PREBAKE §5`): **corner identity (topology) = frozen once, here; curb position (width/radius) = Survey, on top.** This is the realization of that target.

---

## The removal pass — excise the wiring the solvent subsumes

> ⭐ **This is half the deliverable, not a footnote** (`[[feedback_remove_functionality_excise_knobs_wiring_docs]]`). The solvent replaces the *guessing layer*: every place that currently infers "real corner vs pass-through" from local geometry. Remove them **one at a time, eye-checking each**, and require byte-identical-or-better where the old wiring was already correct. Do **not** pre-declare the whole demolition as done — each removal is a *consequence to verify*. This project has made "one root dissolves all" claims three times (intersection-everywhere, construct-the-median, thruNodeEnds) that each narrowed on contact; treat the list as hypotheses.

**Candidates to remove (verify each):**
1. **The entire `thruNodeEnds` / `isThruNode` cure** — the frozen per-node marker, `nodeStem.dir` window-sizing, the `sectionPass` through-node suppressor, the `opts.thruTNode` A/B knob. It *was* the terminal sweep, done wrong. (`HANDOFF-thrunode-gate-fix.md`, `THRUNODE-GATE-FINDINGS.md`.)
2. **The `DOT_CONTINUES=-0.6` angle gate** (`derive.js ~:2444`) — deleted in Beat 1.
3. **`isNameTransition` as a special case** in `sectionPass` — a name-transition is now just "same identity passes through," no longer special-cased.
4. **The local `isThrough` inference** in `sectionPass` — replaced by reading the stamped fact.

**Explicitly NOT removed (real needs, not corner-symptom patches):** the divided-carriageway model (`phase`/`pairKey`); width reconciliation (one road one width — it rides `roadId` but is a separate need); the `corridor` directional-prefix bridge (becomes an identity input); `filletRing`/offset geometry (it still draws — it just finally gets fed correct identity).

---

## Acceptance (the gate is the eye, never a count)

1. **Named archetypes clear on the FROZEN render + Jacob's eye:** Kennett×S18 `[386.3,149.1]`, Rutger×S18 `[453.6,-197]`, Mackay×Hickory, and **the exact node from Jacob's screenshot (image 11) — coord TBD, get it from Jacob first.** Render the frozen `shape.json`/`sectionOpen`, not the live path (`scratch/thrunode-frozen-verify.mjs` is the frozen reader to extend).
2. **No regression on the census guardrail** (`scratch/terminal-node-census.mjs`, run on LS **and** HPDM — both are validation targets): T/dogleg nodes classify 1-through+stem; clean crossings unchanged; the 3 rings mint no corner; the ambiguous buckets (LS 21 / HPDM 14) get **inspected and explained**, not silently accepted (`[[feedback_accept_the_long_tail]]` — triage ≠ abandon).
3. **The removal pass is byte-identical-or-better** where the removed wiring was already correct (A/B each removal).
4. **Detector:** add/extend a RED-until-true invariant in `scratch/correctness-detector.mjs` (the `terminal`/`through` classification) so town #3 can't regress it.

---

## Open before you start
- **Get the screenshot node from Jacob** (image 11) — we need one named, eye-confirmable target; the census harness is an *approximation* (its `THROUGH=Lagoon Drive` on HPDM is a known misread) so trust the real skeleton graph, not the harness numbers.
- **Correct the stale canon:** `SKELETON §5b-bis` says "St Vincent 88° → weld-seam to straighten" — wrong; it's a physical roundabout, welding it is a bug. Fix that line and cite this brief.
- Harnesses already written this session (scratch, git-tracked): `terminal-node-census.mjs`, `identity-extent-audit2.mjs`, `dogleg-roadid-audit2.mjs`, `sv-identity-test.mjs`, `stvincent-roundabout.mjs`, `terminal-sweep-check.mjs`.
