# Forensic — the Section cap-wrap + capacity-clamp region

**A read-only study (2026-06-11, Boz) of the G8 dead-end cap-wrap + G12 capacity-clamp constructs in `sectionPass` / `buildTileGround` — what is coherent design vs confused/half-finished residue, with provenance and a keep-vs-revert map. Commissioned because the region produced the fat-pad round caps from a "confused and laden session that became untenable" (Jacob), and we wanted the lay of the land before anyone touches the clamp again. NO fix committed here beyond the two cap-wrap repairs already landed (`f908143`).**

> Grounded in code (`src/lib/tileGround.js`) + git archaeology, verified 2026-06-11 on the `curb-offset-draw` branch. Reference-kind. Cross-refs: `SECTION.md §7` (the FILL tail), `HANDOFF-tile-feature-ledger.md` row G12, `HANDOFF-band-fold-fix-RESULT.md`, `HANDOFF-band-fold-fix.md`.

---

## 0. Verdict up front

The region is **NOT a tangle of deranged code to rip out** — it is **mostly coherent, with one clean gap and some now-repaired residue.** Specifically:

- The **corner FILL** (the bent-sector / Idea A construction, `c9ddb08`) is **coherent landed work** and superseded the June-1 confused corner code. It is not the problem.
- The two **G8 cap-wrap defects** (round fat-pad, blunt circle-cut) were confused-session residue — **already repaired** today (`f908143`).
- The **G12 capacity clamp** is **half-finished, not wrong**: a `thinTile` partial-degeneracy *signal* is computed but never wired to the depth clamp, and the clamp itself only fires on **full collapse**. The clamp that *would* close the gap was **built then reverted** in the confused June-1 session.
- The **docs lie about G12**: a RESULT doc declared it DONE on a branch (`8e1e414`) that **never landed here**; the partial subclass (the Albion band-neck) was always open.

**So the path forward is "complete the half-wiring + correct the docs," not "untangle a mess."** The mess was already (mostly) reverted; what remains is an *incomplete* state, not a *deranged* one.

---

## 1. The confused session — the June 1–2 acute/cap/clamp thrash

A single laden session thrashed on acute-corner + cap + clamp handling, adding and reverting clamps within hours. The commit arc (all ancestors of HEAD — these LANDED, they were not cleanly reverted):

| commit | date | what it did | fate |
|---|---|---|---|
| `aea5748` / `059302e` | 06-01 | perimeter corners — concentric + ADA plug | superseded by `c9ddb08` |
| **`b464297`** | 06-01 | **acute-corner handling — R-clamp + trim-clamp + THIN-TILE guard** | **clamps reverted hours later** ↓ |
| **`7a2e2db`** | 06-01 | **"treelawn wraps acute end-caps (revert clamps)"** — removed the thin-tile/degenerate guard + trim-clamp | the revert |
| `f1307ed` | 06-01 | per-corner fillet engine (replaces uniform openRound) | superseded by `c9ddb08` |
| **`6aa1ad2`** | 06-01 | **"remove acute-wrap (weird shapes) + cap fixes; plumb per-corner resolver"** — introduced the **G8 round-tip fat-pad reclaim** | residue, fixed `f908143` |
| `d325c4b` | 06-02 | **"capacity guard on the tile bands"** — a *fresh, separate* clamp, **full-collapse only** | survives (line 2396) |

**Read the arc:** they tried a thin-tile depth clamp for acute corners (`b464297`), it caused other problems, so they **reverted the clamps** and switched to "treelawn wraps the acute end-caps" instead (`7a2e2db`), then **removed the acute-wrap** when *that* made weird shapes (`6aa1ad2`) — leaving the fat-pad reclaim as the cap treatment. The next day, a **separate** capacity guard (`d325c4b`) was bolted on, but only for full collapse. **Nothing in this arc ever converged on the partial-degeneracy case** (thin-but-not-empty), which is the Albion band-neck.

The corner half of this confusion was later **rebuilt clean** by `c9ddb08` (2026-06-10, the "I could cry" corner FILL). The **cap + clamp half was not** — it carried forward as-is.

---

## 2. Construct inventory — intent vs reality vs verdict

All in `src/lib/tileGround.js`. Line numbers as of `f908143`.

| Construct | Where | Intent | Reality | Verdict |
|---|---|---|---|---|
| **Corner FILL** (bent sector, Idea A) | `sectionPass` 944–1019 | the ADA corner pad as an annular slice of the band off the frozen fillet | coherent; the landed `c9ddb08` work | ✅ **KEEP** — not confused |
| **G8 round-tip reclaim** | 1034–1044 | remove the pendant-spur LU sliver poking up the cap | *was* reclaiming ALL beyond-band LU within the cap radius → fat pad (`6aa1ad2`). **Now clipped to `fullBand`** (`f908143`) → uniform wrap | ✅ **KEEP (repaired)** |
| **G8 blunt-tip handling** | 1025 | a blunt end has no ped wrap, LU abuts the flat end | *was* subtracting a full-width tip disk from the SIDE bands → pointy/short (`c4efae4`/`f6cef66`). **Removed** (`f908143`) → bands run to the end | ✅ **KEEP (repaired)** |
| **`thinTile` signal** | 2383 | detect a tile whose mean width < band depth (bands will collide) | computed, but wired **only** to `bandJoin` (round vs miter) — **NOT** to the depth clamp (`f6cef66`, predates both clamp attempts) | ⚠️ **ORPHANED** — the detection the clamp needs, left dangling |
| **`cap` capacity guard** | 2394–2400 (frozen) → 760, 826 (consumed) | clamp every ped offset depth to the tile's inscribed reach so thin tiles "degrade to a clean truncated ribbon" instead of thorning | fires **only on FULL collapse** (`!offsetRings(iA, −WBnom/0.9).length`); a thin-but-non-empty tile keeps `cap=WBnom` → offsets overrun the local neck → thorn (`d325c4b`) | ⚠️ **HALF-DONE** — correct for full collapse, blind to partial degeneracy |
| **reverted acute thin/trim clamp** | — | clamp depth + trim on acute/thin legs (the partial case) | **added `b464297`, reverted `7a2e2db`** — gone from the code | ⛑ **the missing piece** (do NOT resurrect verbatim — it caused issues; re-derive clean) |

---

## 3. The clamp gap, precisely (the Albion band-neck = G12 partial-degeneracy)

The Albion cul-de-sac runs **close and nearly parallel** to a cross-street. The block face between them is a **thin tile** — `thinTile` (2383) would flag it `true`. But:

- The `cap` guard (2396) only clamps when the inward offset at `WBnom/0.9` goes **fully empty**. This thin tile is **not** empty (it returns rings), so `cap = WBnom` (no clamp).
- Both edges then stroke their full-depth ped bands inward; the offsets **overrun the tile's medial axis** and **overlap** → the jagged "lightning-bolt" notch (verified on render: the two sidewalk rings literally cross).

This is the G12 ledger row **verbatim**: *"a tile that collapses to a thin non-empty sliver keeps `cap=WBnom` → offsets run past the medial axis → thorn."*

**Why it's invisible until now:** the fat-pad round-cap reclaim used to *fill* this area with solid sidewalk, masking the overlap. Today's uniform-wrap repair (`f908143`) restored the full-width treelawn → deeper bands → the overlap shows. **The repair didn't create the bug; it un-masked a pre-existing one.**

**Fix DIRECTION (not implemented — study only):** wire the existing `thinTile` signal (or a local inscribed-reach test) into the `cap` clamp so it engages on **partial** degeneracy, not only full collapse — clamping the band depth where the *local* neck pinches, **without** over-clamping the in-spec rest of the block (the documented hard part: local, not per-tile — `HANDOFF-band-fold-fix.md`). This is the same target the reverted `b464297` clamp aimed at; re-derive it cleanly rather than restoring the reverted code.

---

## 4. G12 doc reconciliation — the "DONE vs PARTIAL" contradiction resolved

G12 has **two subclasses**, conflated in the docs:

1. **Self-intersecting blobs** (degenerate `iA` + union folds). The band-fold-fix (`HANDOFF-band-fold-fix-RESULT.md`, branch `band-fold-fix @ 8e1e414`) addressed THIS via `iA`-regularize + whole-layer `SimplifyPolygons`. **But `8e1e414` is NOT an ancestor of HEAD** — it never landed in `curb-offset-draw` (helpers `declumpLayer`/`simplifyRings`/`ringSelfIntersects` absent from the code). The RESULT's "what's left for Boz" (land it, flip the ledger, retire the HANDOFFs) was **never executed**.
2. **Band-neck / reversal thorns** (offsets past a thin tile's medial axis — the Albion case). The band-fold-fix **explicitly deferred** this (RESULT §"Distinct, NOT fixed", which names "**Albion 1**" among the residual reversal verts). It is the partial-degeneracy clamp gap of §3.

**∴ Both doc claims are half-right:** "G12 → DONE" (RESULT) referred only to subclass 1, on a branch that never landed; "G12 PARTIAL" (ledger) is the accurate state. **In the current code, BOTH subclasses are open** — subclass 1's fix is stranded, subclass 2 was never built (its clamp reverted).

---

## 5. Keep-vs-revert map

| Item | Action |
|---|---|
| Corner FILL (`c9ddb08`) | **KEEP** — coherent |
| G8 round/blunt cap-wrap (`f908143`) | **KEEP** — repaired today, verified uniform/run-to-end |
| `cap` full-collapse guard (`d325c4b`) | **KEEP + EXTEND** — correct as far as it goes; complete it for partial degeneracy |
| `thinTile` signal (`f6cef66`) | **KEEP + WIRE** — it's the orphaned input the clamp needs |
| reverted `b464297` thin/trim clamp | **STAYS REVERTED** — re-derive a clean local clamp; don't restore verbatim |
| stranded `8e1e414` boolean-hygiene | **DECIDE separately** — land it (subclass 1) or re-evaluate whether the self-int blobs still occur here |

**Nothing in the region needs ripping out.** The residue was already reverted or repaired; the remaining work is *completion* (wire the partial-degeneracy clamp) + a *decision* on the stranded hygiene branch.

---

## 6. Doc corrections this study mandates (not yet applied)

1. **`HANDOFF-tile-feature-ledger.md` row G12** — keep "PARTIAL/open"; add that subclass 1's fix (`8e1e414`) is **stranded, never landed**, and subclass 2's clamp was **reverted** (`7a2e2db`). The Albion band-neck is the live exemplar.
2. **`SECTION.md §7`** — G12 stays in the open tail; note the two subclasses + the orphaned `thinTile` wiring.
3. **`HANDOFF-band-fold-fix-RESULT.md`** — flag that its "DONE/flip the ledger/retire HANDOFFs" follow-ups were **never run** and `8e1e414` never merged; it is a *stranded* result, not a landed one.
4. **`BOZ.md` feature index** — the "Band-fold / thorns" row should point here for the cap/clamp half.

*(Corrections deferred to Jacob's go — this doc is the study; the edits are the follow-through.)*
