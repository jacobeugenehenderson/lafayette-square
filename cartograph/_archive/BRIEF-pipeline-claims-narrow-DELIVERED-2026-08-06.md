# BRIEF — rebuild `PIPELINE-CLAIMS.md`, NARROW: the dead-end → corner → sidewalk chain

**Agent: FRESH.** *(Decisive; do not read this as "either works.")* Wren ran the Tier 2 sweep and knows
which claims were corrected — and **that knowledge is the contamination risk here, not an asset.** The
single failure this brief exists to prevent is distilling from *memory of the corpus* instead of from
the **corrected corpus on disk**. Every correction is committed and readable, and Wren's report is an
input document below — so a fresh agent gets Wren's findings without Wren's recall. Name yourself.

**Route first** (`CLAUDE.md` is the gate): `ORIENTATION.md` → `README §⭐ START HERE` → the sections
named in §3. Answer Layer 0's three questions out loud before you write a claim.

---

## 0. Why this exists, in one paragraph

Jacob diverted into a corpus-wide claims check because the **dead ends, the corners, and the sidewalk
swaps** had resisted fix after fix — *"we'll find an error in the code by finding an error in our
thinking."* The check paid out: six sweeps graded ~290 claims and found ~91 false, and Tier 2 promoted
**8 of them from rot to WRONG BELIEFS.** But the check was corpus-wide and the knot is still not fixed.
**This brief points the same method at the knot itself, and nothing else.**

⛔ **You are writing the instrument, not the fix.** Do not fix the dead ends, corners or sidewalks. Do
not touch geometry code. The deliverable is a short document of claims that **can be shown false**, so
that the next attempt on this defect family is reasoning about code that actually runs.

## 1. Scope — the chain, and only the chain

**Dead end → corner → sidewalk arrangement.** These are one topic, not three: `ROADMAP A0` rules that
the unresponsive legs, the mouth co-claim and the leg-flip are **one upstream fault — the missing
corner** — and that the polygon never closes at a degree-1 chain.

**IN scope:** how a dead-end tip is polygonized and closed · what a corner *is* (identity, not angle)
and when the ADA regime fires · how the pedestrian fill arranges along a frontage and why runs swap ·
the SHAPE/FILL boundary between them.

⛔ **OUT of scope, explicitly:** the whole-pipeline distillation (that is the archived baseline, §2) ·
land use · trees · the Polish pours and the `osm-` registry port (**demoted to last priority by Jacob,
2026-08-05**) · Stage / Preview / Bake / The Ward.

⭐ **If the chain pulls you upstream to the centreline, follow it and say so** — `R7` holds that the
centreline is the root and that patching a polygon while the centreline is rough is *editing a shadow*.
That is a legitimate finding, not scope drift. **Surface it; do not absorb it.**

## 2. The baseline you are replacing — read it, do not resurrect it

`cartograph/_archive/PIPELINE-CLAIMS-full-manifest-2026-08-02.md` — the **sterilized manifest**, frozen
2026-08-05 as a **drift baseline**. ⛔ Do not edit it and do not cite it as true; freezing it is what
makes it useful. Note especially its `3.3`/`3.4` pair, left standing **deliberately** as a specimen: a
false claim (*"prebake never reads operator authoring — zero reads, verified"*) wearing a ✅
**verified-in-code** stamp, with a second claim resting on it.

**Carry forward — these survive any rebuild and are the reason the file is worth having:**

1. **The `[REQ]`/`[OUR]` split.** `[REQ]` = what must be true, binding. `[OUR]` = the answer we happen
   to have chosen. ⛔ A fresh designer should NOT inherit `[OUR]`. Nothing else in the corpus makes this
   separation, and it is the whole point of the file.
2. **`R1`–`R8`** (cross-cutting requirements) and **`L1`–`L7`** (ratified, do-not-reopen). Three sit
   directly on this chain and you should expect to lean on them: **`L3`** the corner is the band *bent*
   around the arc, a slice of the same offsets, **never a separately-constructed primitive** · **`R7`**
   centreline → polygon → ribbon, in strict order · **`R8`** construction is the **last resort**, after
   the derivation is verified correct.
3. **The confidence marks, and they must be EARNED:** ✅ verified in code by you, this pass · 📄 from
   canon, not verified · ❓ low confidence. ⛔ Do not inherit a ✅ from the baseline — that is exactly
   how `3.3` survived.

## 3. Read these, to the section — this is the aiming, and it is my job not yours

**The governing rule first:** `SECTION.md` canon — one uninterrupted frontage chain, real-corner →
real-corner; the ADA transition slope fires ONLY on arrangement-**difference** (locked, `0f0a6473`).

| the link | read |
|---|---|
| **dead end** | `POLYGON-FIRST §2.1` — incl. *"Check 5 is the diagnosis — the missing piece is the CORNER"* **and** the ⛔ REVERTED corner-registry block (`corners.all` is **NOT on trunk**) · `PREBAKE §4` + `§4.1` (what is frozen: consumer done, producer open) · `RIBBONS §6.4` · `SECTION §6.3` (the cap is an end COUPLER) |
| **corner** | `SECTION §6` / `§6.1` / `§6.2` · `RIBBONS §1` (**the four invariants — read before touching corners**) + `§4` · `SURVEY §4` (the SHAPE controls) |
| **sidewalk** | `SECTION §3.1` / `§3.2` / `§3.3` (best-effort fill → override layer → per-edge FILL) · `§5` (the panel, the one-depth-truth rule) |
| **the boundary between them** | `SECTION §4` (freeze the *silhouette*, author the *FILL* live) · `WALL.md §2` · `PIPELINE §Wall` — **"is this chains again?"** is the layer test |
| **the open tickets** | `ROADMAP` **A0** (⛔ read the tried-and-reverted block **before** forming any view), **A1**, **A7**, **A8**, **A2b** |
| **what the sweep already found** | `scratch/doc-sweep-tier-2-report.md` — **§1 W3/W4** and **§4 cluster 3** |

## 4. Five corrections already on the board — start from these, verify each

The Tier 2 sweep moved these and they all land on your chain. **Re-verify every one in code; cite the
method, not just the number** (§6).

1. **⭐ The "d" bulge's named mechanism is the branch that tile never enters (W4).** `SURVEY §6` said the
   bulge is `iA = tile.ring − asphalt-union` swelling at the transition. **That is the legacy carve.** On
   a large non-median tile the **per-edge offset** builds it — so every fix reasoned from the union was
   reasoning about code that tile does not execute. `ROADMAP A07` now stamps `producer` +
   `producerReason` per tile, so **which producer built the bulging tile is now answerable from the
   artifact.** ⚠️ `shape.json` on disk is pre-A07 and reads "unstamped" until a re-bake — **that re-bake
   is Jacob's call, not yours.**
2. **The dead-end mouth rule fires on 9 of 50, not all 50** — sizing off "all 50" overstates ~**5×**.
   `POLYGON-FIRST §2.1` separates **three different sets** that have been conflated; keep them apart.
3. **`SECTION`'s corner construction is LANDED**, and the doc contradicted itself about that in §7/§8
   (corrected in Tier 2). Any plan for A7 drawn before that was drawn against a self-contradicting doc.
4. **The `n=951` treelawn distribution is unreproducible and was struck** — treelawn-Y is a **30%
   minority**, not the stated 53% majority. ⛔ **The DEFAULT-FILL front was sized off that number.**
5. **`RIBBONS`' spur-outline "both halves built, flag-off" was false** — reverted, no flag exists.

## 5. ⛔ Two hard cautions, both bought with lost days

- **A0 was built, measured GREEN on every gate, run past Jacob's eye on two scenes, and judged WORSE.**
  Reverted (`7b5b87a3`; the construction lives at `152e7734`). **The transferable lesson: these probes do
  not predict the eye.** So a claim in this file must be about **mechanism**, never about a probe
  passing. `R4`: the operator's eye is the gate; a passing check is evidence, not a verdict.
- **The override IS the product** (Layer 0 q3, `R1`/`R1a`). ⛔ **Any claim you check without the scene's
  authored state loaded is checking the wrong map** — it fails worst on the most heavily authored town
  and looks cleanest on a fresh pour. If you run anything, run it in **both** states and **record which
  state produced the result** (the dual-state pattern from `scratch/a03-curb-identity.mjs`).

## 6. ⭐⭐ Cite the METHOD, not just the number

**Three over/under-swings in this arc.** The sweep was wrong 3×, and Tier 1's *correction* of the
carve count was itself an under-correction — it said 30, the floor is **41**, and `POLYGON-FIRST §3` had
**42** right the whole time. 30 was the area term alone. **An over-correction costs as much as the rot**,
because it teaches everyone to stop trusting corrections. Every numeric claim you write carries **how it
was derived**, in enough detail to re-run. Where two docs disagree, say so and say **which the code
picked** — the cross-doc seam is the richest ground precisely because nobody ruled and the code chose
silently.

## 7. Deliverable

**`PIPELINE-CLAIMS.md` at repo root** — rebuilt narrow. Short by construction; if you cannot state
something as a checkable claim, it does not go in.

1. The chain as `[REQ]`/`[OUR]` claims with earned confidence marks.
2. A **known-open** list, so nobody re-reports these as discoveries.
3. **⭐ REACHABILITY — this is a real requirement, not bookkeeping.** The old file had **zero** live refs;
   nothing in `ORIENTATION` or `README` pointed at it, so it was an orphan and no one built on it.
   `BOZ.md §4` calls the orphan *the* failure. Wire the new one in: a line in `README §⭐ START HERE`
   and a pointer from the topic canon, so it is reachable from `ORIENTATION` in **≤2 hops**.
4. A short report to Jacob: **what you could not verify, left and listed** (an unverified edit to canon
   is worse than a stale line), and **anything you found that is a lead rather than a claim.**

## 8. Boundaries

- **WRITE:** `PIPELINE-CLAIMS.md` (root, new) · one pointer line each in `README §⭐ START HERE` and the
  topic canon, for reachability · `scratch/` freely.
- **⛔ DO NOT WRITE:** any other canon doc · any `src/` or `cartograph/` **code** · the archived baseline.
  ⛔ **No pours, no bakes, no dev server** (reuse the running one; do not spawn another).
- **Read-only harnesses in `scratch/` are encouraged** — reuse before you build (`scratch/` holds 200+;
  `a03-curb-identity.mjs`, `a07-producer-disclosure.mjs`, `correctness-detector.mjs` are live).
- **⭐ Surface scope drift, do not absorb it.** Tier 2 was scoped at ~25 facts and hit ~55; it said so.
  Do the same.
- **Commit your own files only.** Another session may be live in `derive.js` / `classify.js`.

---

*Drafted by Boz, 2026-08-05, from Jacob's call: narrow first, just that chain; keep the sterilized
manifest for drift comparison elsewhere.*
