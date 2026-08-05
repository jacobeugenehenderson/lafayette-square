# BRIEF — doc sweep, TIER 2: evict the status layer from the reference docs

**Agent: FRESH.** *(Why, decisively: Tier 1 was done by a warm coordinator carrying two days of
context about which claims were already adjudicated. Tier 2 is the opposite job — a mechanical pass
over ~25 facts where the danger is **inheriting a judgement instead of checking it**. A fresh agent
with no stake in the prior verdicts is the right instrument. You are not Boz. **Name yourself** — one
word, your choice; it joins the name-trail.)*

> ⛔ **ROUTE FIRST.** `CLAUDE.md` (the gate — read **Layer 0** and mean it) → `ORIENTATION.md` →
> `README.md §⭐ START HERE`. Then `BOZ.md §2` (the three kinds of doc) and `§3` (trim-on-subsume +
> the accord sweep) — **those two sections are the specification for this entire task.** Do not
> start editing before you have read them; the rule below is meaningless without them.

---

## 0. Why this exists — read this or you will do the wrong job

Six agents independently swept the doc corpus, read-only (`scratch/doc-sweep-1..6-*.md`, committed
`d8cdeaad`). **~290 load-bearing claims: ~134 CONFIRMED, ~91 FALSE, ~59 UNVERIFIABLE.**

⭐⭐ **All six reached the same verdict without talking to each other: the DOCTRINE held. The STATUS
layer rotted.** Every single FALSE is a status claim, a count, or a known-open item that got fixed.
**Not one is a doctrine claim.**

**∴ This is not a rewrite, and the corpus is not a mess.** The thinking is sound. One layer running
through it — counts, "live/open/unfixed" lists, "next, not yet built" lines — went stale because work
landed and nobody struck it. Your job is to remove that layer, not to re-derive the corpus.

⚠️ **Why correcting these in place would be the wrong fix.** They rotted *because they were in the
wrong kind of document*. A status claim living in a reference doc has no maintainer — nobody updates
`SURVEY.md` when a ticket closes. Fix the number and it is stale again in a fortnight. **So the fix is
eviction, not correction.**

---

## 1. ⛔⛔ THE ONE RULE

> ### If it is a STATUS claim inside a REFERENCE doc — **DELETE it. Do not update it.**
>
> Status lives in `ROADMAP.md` / `cartograph/BACKLOG.md`. Nowhere else.
> **Reference docs come out carrying LIVE DOCTRINE ONLY.**

**Reference docs** (eternal-present — *how it works / what it is / why*): `README` · `ORIENTATION` ·
`FEATURES` · `OPERATIONS` · `ARCHITECTURE` · `PIPELINE` · `RIBBONS` · `SKELETON` · `SURVEY` ·
`SECTION` · `PREBAKE` · `WALL` · `POLYGON-FIRST` · `INTAKE` · `EXTENT-DESIGN` · `BAKE` · `LOOP-STREETS`.

**Status docs** (now — *where we are / what's next*): `ROADMAP` · `BACKLOG` · the `_handoffs/` layer.

**How to tell a status claim from a doctrine claim** — the test is *tense and volatility*:

| It is STATUS (evict) | It is DOCTRINE (keep, fix if wrong) |
|---|---|
| "as of 2026-07-30 this is RED / open / unfixed" | "the curb is a concentric offset" |
| "101 tiles / 24 streets / 30 of 31" | "chains die at the wall" |
| "next, not yet built" · "landed `abc1234`" | "a fallback is worse than a failure" |
| "known open: the false corner" | "the override IS the product" |
| a line number (`serve.js:531`) | "freezing wrong data launders it into authority" |

**If evicting a status claim would lose something load-bearing, MOVE it — never drop it.** A one-line
entry in `ROADMAP`/`BACKLOG`, or a dated file in `cartograph/_archive/` for narrative. `BOZ.md §0`:
**additive/archiving, never destructive.** ⚠️ Confirm anything you put in `_archive/` is **tracked** —
that folder was gitignored until `f9bbee28`.

### 1a. Line numbers — cite the SYMBOL, not the line

Cluster 6 found `BAKE.md` citing `serve.js ~L461–623` for a handler now at **~L1860–2160**; `runIfDirty`
documented at `:531`, actually `:1945`. Anyone following those lands nowhere near the code.

**Do not update line numbers — replace them with symbol names.** `` `serve.js` `runIfDirty` `` beats
`serve.js:531`, and it survives every commit. Same eviction logic: a line number is a status claim
wearing a citation's clothes. Keep a line number only where nothing else identifies the site.

---

## 2. ⛔⛔ VERIFY EVERY FINDING BEFORE YOU ACT ON IT

**The sweep reports are agent output. They are claims, not facts.** On its own top-tier items the
sweep was **wrong 3 times out of 10** — and two of those would have caused damage:

- *"41–42 of 101 tiles take the legacy carve"* — **unreproducible.** The real floor is 30.
- *"`served-parity.mjs` reports UNSTABLE for all scenes"* — half true, and a first correction pass
  **over**-corrected into a *second* wrong answer, inventing maintenance work that did not exist
  (`426e01c1`). Both directions were wrong.
- *"the wall proof exits 0 while failing"* — a measurement error (`$?` read through a pipe).

⭐ **An over-correction is as costly as the rot** — deleting a true warning because an agent called it
stale looks exactly like diligence. **Check the code. Cite what you checked, in the commit.**

⛔ **If you cannot verify a claim in a few minutes, LEAVE IT AND LIST IT.** An unverified edit to canon
is worse than a stale line, because the staleness at least has a date on it. Unverifiable items go in
your report, not in the docs.

---

## 3. Scope

**Your input:** `scratch/doc-sweep-1..6-*.md` — six reports, ~26 docs, by cluster:

| # | Cluster | Docs |
|---|---|---|
| 1 | Frame | `SKELETON` · `OSM-FORENSICS(-EVAL)` · `OSM2STREETS-GROUNDING` · `LOOP-STREETS` |
| 2 | Polygon & Wall | `PREBAKE` · `POLYGON-FIRST` · `WALL` · `PREBAKE-POLYGONIZATION-PLAN` |
| 3 | The tools | `SURVEY` · `SECTION` · `RIBBONS` |
| 4 | Spine & entry | `ORIENTATION` · `README` · `CLAUDE.md` · `PIPELINE` · `ARCHITECTURE` |
| 5 | Intake & extent | `INTAKE` · `INTAKE-CATALOGUE` · `EXTENT-DESIGN` · `EXTENT-EXCAVATION` · `NEIGHBORHOOD-INPUTS` |
| 6 | State & bake | `ROADMAP` · `BACKLOG` · `BAKE` · `DOC-CODE-COHERENCE` |

**⛔ TIER 1 IS DONE — do not redo it.** Closed in `d8c4fee7`, `c6d36fa7`, `426e01c1`. The full list of
what was settled, *including the three findings that did not survive verification*, is at the top of
**`_handoffs/HANDOFF-doc-sweep-corrections.md`. Read that first** — it will stop you re-litigating
`LOOP_STREET_NAMES`, `medians[]`, `buildBlockGeometryV2`'s line count, `corners.all`, `ribbons.tiles`,
the Layer 0 receipt, and the wall proof's `blockCustoms` entry.

**⭐ Fix optimistically too — the sweep found things BETTER than documented.** At least: the
correctness detector's recall is **30/31, not the documented 24/31**, and **both checks it calls "next,
neither built" are built.** A doc that undersells shipped capability causes rebuilt work — same cost as
a doc that oversells. Sweep for these deliberately; they are easy to skip.

---

## 4. Bounds

- ⛔ **NO pours. NO bakes. NO dev server.** Re-deriving over a committed artifact destroyed the map
  three times on 2026-07-31. `promote-ribbons.js` refuses a material change without `--yes`; writers
  require `--scene=`. There is a dev server already running — **do not start another**
  (`feedback_do_not_spawn_new_dev_servers`).
- ⛔ **Docs and your report only.** Do not edit `src/` or `cartograph/*.js` **except** to correct a
  code *comment* that states something false (Tier 1 found one at `serve.js` in the bake handler:
  the comment claimed a fallback the code refuses). Behaviour changes are out of scope — if you find
  one that matters, write it up.
- ⚠️ **Check before writing `derive.js` / `tileGround.js`** — another session may be live in them.
- **Commit in coherent batches** (per cluster, or per fact-across-docs), not one giant commit. Each
  message says **what you verified and how**. Selective `git add` — only your own files.
- ⚠️ **Branch `land-use-derivation` is not pushed anywhere.** Do not push, do not merge, do not rebase.
- **`PIPELINE-CLAIMS.md`** (root, **untracked**) is a pre-sweep distillation that already inherited two
  errors. ⛔ Do not trust it and do not cite it. Flag it in your report — Jacob's call whether it is
  rebuilt or deleted. **Do not `git clean`; it is untracked and would be destroyed.**

---

## 5. The accord gate — you are not done when the edits are done

`BOZ.md §3`: **the unit of work is not "the doc you edited" — it is the corpus in accord.**

> **The accord test:** read any two docs side by side. Could they disagree about *what is current ·
> what is superseded · where the live home is*? If yes, you are not finished.

Specifically: when you evict a status claim, **grep the corpus for every other site repeating it** and
handle them in the same breath. Most of the ~91 findings are **the same ~25 facts repeated** — fixing
one site and leaving four is how a corpus ends up disagreeing with itself. **A half-update that leaves
a contradiction is worse than none.**

And: if a fact you settle has a plain-language line in **`ORIENTATION.md`** or a row in
**`README §⭐ START HERE`**, update it in the same pass. A stale first-read teaches agents to stop
trusting the first read — the adherence we can least afford to lose.

---

## 6. Deliverable

1. **The edits**, committed in coherent batches with verification cited.
2. **`scratch/doc-sweep-tier-2-report.md`** — for each fact: what the sweep claimed · what you found ·
   what you did (evicted / moved / corrected / **left, unverifiable**). ⭐ **Include a "could not
   verify" section and a "sweep was wrong" section.** Both are findings, not failures.
3. **A one-paragraph verdict for Jacob**, plain language: what shape the corpus is in now, and the one
   thing you would do next.

⚠️ **Surface scope drift immediately.** If Tier 2 turns out to be materially bigger than ~25 facts, or
you find a **behaviour** defect (not a doc defect), **stop and report** rather than expanding the job.
Tier 1 found an unticketed silent fallback in the SHAPE producer that way; it became `ROADMAP A07`.
That is the right move — surface it, do not absorb it.

---

*Drafted 2026-08-04 by Boz. Input: `scratch/doc-sweep-1..6-*.md` (`d8cdeaad`). Tier 1 closed in
`d8c4fee7` / `c6d36fa7` / `426e01c1`; its adjudications and its three failed findings are at the head
of `_handoffs/HANDOFF-doc-sweep-corrections.md`.*
