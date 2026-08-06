# ⛔ ON HOLD — DO NOT DISPATCH (Jacob, 2026-08-06)

> **Held until the live work in `cartograph/POLYGON-FIRST.md` and `ROADMAP.md` is finished.** Those are the
> two densest targets in §2 *and* the two docs the substrate investigation is actively editing — dispatching
> into them now means an agent excising text while it is still being written. **`git status` cleanliness does
> not protect against this**; it only catches uncommitted collisions, not churn.
>
> **Release condition:** the polygon-substrate arc has settled what `POLYGON-FIRST §2.1` and `ROADMAP A0/A7`
> should say. Then this runs — and it should run *after*, because that arc will itself produce banners worth
> excising.
>
> ⭐ Everything below stands as drafted; only the timing is held.

---

# BRIEF — excise the correction-banners; the canon should not carry its own corpses

**Agent: FRESH.** Name yourself. *(Decisive. The Tier 2 sweep's author knows which items were bannered —
but bannering-in-place is the habit that produced this, and the report is available as an input document.
Fresh eyes, sweep's findings, none of the sweep's reflexes.)*

**Route first** (`CLAUDE.md` is the gate): `ORIENTATION.md` → `README §⭐ START HERE` → `BOZ.md §4`.

---

## 0. Why — and it is not tidiness

`CLAUDE.md §PRUNE AS YOU GO` / `BOZ.md §4` say **trim on subsume**: superseded content *migrates* to the dated `_archive/`;
*"'RESOLVED, kept for context' left in place is the anti-pattern."* The practice drifted — "archive, don't
delete" got read as **"annotate, don't remove"** — so the Tier 2 sweep corrected ~55 facts by **bannering**
them rather than **excising** them.

⛔ **The cost is measured, not hypothetical.** On 2026-08-06 Boz read `tileGround.js`'s header comment
*"the IX is never constructed"* — **which the Tier 2 sweep had already proved false and deliberately left in
the file** — and reported it to Jacob as a live finding. A false sentence competes with its own correction
and usually wins: it is shorter, more quotable, and reached first. **A banner only works on a reader who
reaches it.**

Jacob, 2026-08-06: *"Why are things marked 'Stale' instead of being moved to the archive or excised? This is
ridiculous."*

## 1. ⭐⭐ THE ONE JUDGMENT CALL — everything else is mechanical

Two things look identical on the page and must be treated **oppositely**:

| | | action |
|---|---|---|
| **A CORRECTION** — a banner sitting on a claim now known false (*"⛔ this count is wrong"*, *"corrected 2026-08-04"*, *"does not reproduce"*, *"STALE"*) | the sentence itself is the rot | ⭐ **EXCISE the false sentence.** Its record moves to dated `_archive/`. The banner disappears because its subject does. |
| **A PROHIBITION** — knowledge bought by a failed attempt (*"TRIED AND REVERTED — read before re-opening"*, *"do not re-derive this dead end"*, *"⛔ do not fan the write across the leg range"*) | **the most expensive knowledge in the repo** | ⛔ **KEEP IT.** Restate as a forward rule (*"X is the wrong move because Y"*), not as an annotation hanging off a corpse. Losing these re-buys them at full price. |

**The test:** *does this text stop someone doing the wrong thing tomorrow?* Yes → prohibition, keep and
sharpen. No, it only records that a sentence was once wrong → correction, excise.

⚠️ **When genuinely unsure, KEEP and flag it in your report.** An over-cut prohibition costs a repeated
week; an under-cut correction costs a re-read. The asymmetry is not close.

## 2. Scope

**In:** the ~40 in-place banners in **active** docs. Densest first — `cartograph/POLYGON-FIRST.md` (7),
`ROADMAP.md` (6), `README.md` (4), `meteorologist/NOTES.md` (4), `cartograph/NOTES.md` (3),
`cartograph/BACKLOG.md` (3), `arborist/ARCHITECTURE.md` (3), then `ORIENTATION.md`,
`NEIGHBORHOOD-INPUTS.md`, `SURVEY.md`, `RIBBONS.md`, `PREBAKE.md` (2 each). Find the rest with the grep in §5.

**⭐ IN, and do it FIRST — false comments in SOURCE.** Code is not a Diary; a comment that states something
false gets **corrected or deleted**, never bannered. Start with the one that caused this brief:
`tileGround.js`'s *"the IX is never constructed"* — the intersection **is** constructed by leg-adjacency at
every node (`junctionMap` = 233). `OSM2STREETS-GROUNDING` rests a verdict on that comment; fix both.

**⛔ OUT:**
- `cartograph/_archive/**` — the Diary is *supposed* to hold superseded material. Do not tidy it.
- **`cartograph/_archive/PIPELINE-CLAIMS-full-manifest-2026-08-02.md`** — frozen drift baseline. Its false
  `3.3`/`3.4` pair is a **deliberately preserved specimen**. ⛔ Do not correct it; that destroys its purpose.
- Any doc another session is live in. **Check `git status` first**; if a target file is dirty, skip it and
  say so.
- Code changes beyond comment text. **No behaviour changes, none.**

## 3. How to excise (the archivist's procedure)

1. **Migrate, don't delete.** The excised passage goes to a dated Diary file —
   `cartograph/_archive/<TOPIC>-superseded-2026-08-06.md` — with one line of context: what it claimed, when
   it was falsified, and by what. One file per topic cluster, not forty files.
2. **⛔ REPOINT EVERY REF IN THE SAME BREATH.** The dead pointer is the archivist's one unforgivable error
   (`BOZ.md §4`). After moving anything, grep the whole repo for its name/section and repoint to the LIVE
   home — never to the archive.
3. **Consolidate the paragraph you touch**, don't leave a scar where the banner was (`BOZ.md §4`).
4. **Reachability:** anything still load-bearing stays reachable from `ORIENTATION.md` in ≤2 hops.

## 4. ⛔ Cautions

- **This touches canon broadly.** Commit **per doc cluster**, with a message stating what was excised and
  where it went, so any single step is revertable.
- **Do not "fix" numbers.** You are moving text, not re-measuring. If a banner's *correction* looks wrong to
  you, **leave the whole thing and report it** — this arc has over/under-swung four times and a fifth would
  be worse than the rot.
- **Do not touch `PIPELINE-CLAIMS.md`'s claims** — it is the live checkable-claims file, rebuilt 2026-08-06.
  Its `⛔`/`⚠️` marks are claim confidence, not banners.
- **Surface scope drift; do not absorb it.** Tier 2 was scoped at ~25 and hit ~55, and said so. Do the same.

## 5. Deliverable

1. The excisions, committed per cluster.
2. The dated `_archive/` files holding what was removed.
3. **A verification grep in your report** — re-run and paste:
   `grep -rc "STALE\|SUPERSEDED\|RETRACTED\|WITHDRAWN\|⛔⛔" --include="*.md" . | grep -v "_archive\|scratch/"`
   Near-zero in active docs, **with every survivor named and justified as a prohibition** (§1).
4. **A list of every ref you repointed**, so the dead-pointer check is auditable.
5. **What you kept and why** — the prohibitions. This is the most important section of your report; it is
   the record that we chose to keep them rather than missed them.

## 6. Boundaries

- **WRITE:** the active docs named in §2 · new dated files in `cartograph/_archive/` · **comment text only**
  in `src/` and `cartograph/*.js`.
- **⛔ DO NOT:** change any code behaviour · touch `_archive/` existing files (except adding new ones) ·
  touch the frozen manifest · pour, bake, or start a dev server.
- **Commit only your own files.**

---

*Drafted by Boz, 2026-08-06, on Jacob's instruction. The trigger: a sweep-flagged false comment, left in the
source, was read hours later and reported as a live finding.*
