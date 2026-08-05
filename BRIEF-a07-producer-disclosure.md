# BRIEF — A07: the SHAPE producer must disclose which producer built each curb

**Agent: WARM → Wren.** *(Decisively, and this is not the usual call. Wren re-measured A07's floor on
2026-08-04 — deriving 41-of-101 from the artifact and reconciling it with `POLYGON-FIRST §3`'s
long-standing 42 — and separately found the "prebake is authoring-blind" claim false, which is what
puts A06's scope in question below. Both are load-bearing here and both are expensive to rebuild.
A fresh agent would re-derive the count and re-litigate the sibling framing before starting.)*

> ⛔ **ROUTE FIRST** (`CLAUDE.md` gate → `ORIENTATION` → `README §⭐ START HERE`), then the canon to
> the section: **`POLYGON-FIRST.md §1`** (the invariant this ticket is about) and **`§3`** (the
> 30/3/9 decomposition), **`ROADMAP` A06 + A07**, **`WALL.md §1`** (why freezing wrong data is
> odious — the same logic applies to freezing *undisclosed* data).

---

## 1. The defect, in one line

**The docs state one curb producer. The code has two and picks silently.**

`ORIENTATION` and `POLYGON-FIRST §1` state the kit's most-quoted invariant: *the curb is the
centerline stepped outward, parallel everywhere.* But `tileGround.js:3326` gates the offset on
`opts.iaOffset !== false && !isMedianTile && ringArea > 1500`; everything failing that takes the
legacy boolean carve `differenceRings([tile.ring], aFill)` at `:3347` — **41 of LS's 101 tiles** —
and an offset that passes the gate but comes out degenerate is swapped for the carve at `:3345`
**with no signal at all**. The comment at `:3309` states it aloud: *"Falling back to legacy is never
a regression."*

---

## 2. ⭐⭐ THE TWO THINGS THIS TICKET MUST NOT CONFLATE

This is the whole design, and getting it wrong produces either a false alarm or a new silence.

| | **The LEGITIMATE class** | **The genuine FAILURE** |
|---|---|---|
| what | medians, dead-end disks, slivers — they genuinely **are not** edge-offsets | `:3345` — an offset passed the gate and came back **degenerate** (vanished, or larger than its tile) |
| how many | 41 of 101 on LS (30 `ringArea ≤ 1500` · 30 `isMedian` · 19 both) | **unknown — nobody has counted it.** The artifact cannot tell you; only the running code can |
| is it wrong? | **NO.** `ROADMAP A06`: *"the 42 tiles are correct today and byte-identical."* The carve is the RIGHT answer for them | **YES.** Something was expected to work and didn't |
| the cure | **RECORD it** — per tile, in the artifact, with the reason | **BE LOUD** — this is a defect, not a shape class |

⛔ **Do not "fix" this by deleting the carve.** It is correct for its class. ⛔ And do not make the
legitimate class *warn* — 41 warnings per pour is a new silence, because nobody reads it.

**∴ the deliverable is DISCLOSURE, not a geometry change.** No curb should move. Prove that.

---

## 3. ⭐ SEQUENCING — A07 BEFORE A06, and the ticket currently says the opposite

`ROADMAP` A07 calls itself *"sibling of A06 … do these together."* **That is the weakest of the
three readings and you should rule on it in your first hour.** The case for A07 **first**:

1. **A07 is what TRAVELS; A06 is this town's coverage.** A06 makes LS's 41 tiles offset-built. On
   town #2 a *different* set fails the gate, with nobody who has ever looked at it. Layer 0: the
   deliverable is the check that catches the class in a town nobody has inspected.
2. ⭐⭐ **A07 IS A06'S TEST INSTRUMENT.** A06's definition of done is "these tiles now take the
   offset path." **You cannot measure that without a per-tile producer stamp** — which is exactly
   what A07 builds. Doing A06 first means verifying it by hand, once, on LS.
3. **A06's scope may have moved.** It was scoped when "prebake is authoring-blind — zero reads" was
   believed true. **Wren proved that false on 2026-08-04**: `derive.js` reads `clean/overlay.json`
   (52 authored LS streets); only `design.json`/`blockCustoms` is unread. A03/A06 were both scoped
   off the overgeneralised version. **Re-check A06 against the corrected claim before estimating it**
   — and note A06 already has one retracted framing on its record ("freeze `aFill`", wrong twice).

⚠️ **Also reconcile the third reading:** your own Tier 2 report holds that **A07 is a prerequisite
for the "d" bulge diagnosis** — a different relationship to a different thing. Sibling-of-A06,
prerequisite-for-A06, and prerequisite-for-the-d-bulge are three claims; **at most some are true.**
Rule it, write the ruling into `ROADMAP`, and delete the losers. Nobody has done this.

---

## 4. ⛔ REUSE THE REPORTING IDIOM — DO NOT BUILD A THIRD

The kit now has **two** implementations of *"name what this town brought that we handled quietly"*,
and they are deliberately the same shape:

- **`cartograph/lu-policy.mjs`** → `resolveLuPolicy().report()` — the original (tree gate).
- **`cartograph/osm-vocabulary.mjs`** → `createVocabularyGate(stage, remedy)` — added 2026-08-04 for
  the ingest vocabulary, serving **two** callers (`classify.js` and `derive.js`'s `OSM_TO_LU`) so the
  operator gets **one account per pour, not two halves**.

**A07 is the third instance of the identical invariant** — *a sentinel is not a value; a silent
choice is not a disclosed one.* ⛔ **A third bespoke reporter is the wrong outcome.** Either reuse
`createVocabularyGate` (it takes a `stage` + `remedy` and aggregates by signature — the "signature"
here is the *reason* a tile took the carve), or, if geometry genuinely needs a different shape, **say
so explicitly in the commit and explain why**, so the next person doesn't build a fourth.

⭐ Read `osm-vocabulary.mjs`'s header before designing. Its invariant is stated there in full, with
the measured LS/HPDM/Altadena gradient that proves this class of defect is faintest in the town we
use to prove the kit travels.

---

## 5. The work

1. **Instrument first, decide second.** Stamp each tile in `_shapeArtifact` with
   `producer: 'offset' | 'carve'` **plus the reason** (`median` · `small` · `degenerate` ·
   `opt-out`). ⭐ **The reason is the load-bearing part** — `carve` alone cannot distinguish the
   legitimate class from the failure, which is the whole point of §2.
2. **Count the degeneracy branch (`:3345`).** This is the one number nobody has. It is invisible in
   the artifact — you must instrument the live producer. **Report it separately from the 41.**
3. **Make `:3345` loud**, per §2. A degenerate offset is a defect; it currently swaps silently.
4. **Surface the split in the tool** — the operator should be able to see which blocks were carved
   without reading a log.
5. **Correct the comment at `:3309`.** *"Falling back to legacy is never a regression"* is the
   defect stated aloud; it should say what is actually true — the carve is correct for its class,
   and a degenerate offset is a failure.
6. **Then update the docs to the true rule.** `ORIENTATION` and `POLYGON-FIRST §1` currently state
   an aspiration as an invariant. Say what the code does: *offset where the shape is an edge-offset,
   carve where it isn't, recorded per tile either way.*

---

## 6. Bounds + DoD

- ⛔ **NO POUR, NO BAKE without Jacob.** Instrument and measure; do not re-derive over a committed
  artifact. `promote-ribbons.js` refuses a material change without `--yes`; writers need `--scene=`.
- ⭐ **NO CURB MAY MOVE.** This ticket is disclosure only. **Prove it**: the geometry must be
  byte-identical before/after, on **both** the authored state and bare defaults — the harness
  pattern is `scratch/a03-curb-identity.mjs --against baseline`, which A03 used for exactly this.
  A03 is the precedent: *"verified BYTE-IDENTICAL on BOTH the authored state and bare defaults."*
- ⚠️ **`tileGround.js` is load-bearing and shared.** Check for other live sessions before writing
  (`feedback_load_bearing_files_serial_dispatch`). Land-use work is live in `derive.js`/`classify.js`
  — different files, but confirm.
- **DoD:** the byte-identical proof · the degeneracy count (the new number) · the sequencing ruling
  written into `ROADMAP` with the losing framings deleted · docs stating the true rule · and a
  one-paragraph plain-language verdict for Jacob.

---

*Drafted 2026-08-04 by Boz. A07's measurement is Wren's (`ROADMAP` A07, re-derived from
`shape.json`). The reporting idiom to reuse is `cartograph/osm-vocabulary.mjs`, landed the same day
in `8a29b784` for the same invariant one stage upstream.*
