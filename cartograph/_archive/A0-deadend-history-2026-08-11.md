# A0 — the dead-end arc's working-out, retired from the board 2026-08-11

> **Diary.** Retired for CURRENCY, not truth — everything here happened and the measurements were
> real. It left `ROADMAP A0` because that ticket's entry had grown into a single ~9,000-character
> paragraph carrying its own retraction history three times over, which is the shape
> `CLAUDE.md §PRUNE AS YOU GO` exists to stop. **The live doctrine stayed on the board; this is the
> record behind it.** ⛔ Do not cite a figure from here as current — re-derive it.

---

## 1. The 2026-07-31 revert, and why its verdict does not count (`7b5b87a3`)

`SPUR_OUTLINE` was built, measured green on every gate, run past Jacob's eye, and reverted as
"worse". **The verdict is UNRELIABLE, not reversed**, and the mechanism was named 2026-08-06:

> **Jacob was looking at `lafayette-square` while the work was on `lafayette-square-staging`, and
> neither party knew for the whole day.** Not a camera angle — **a different map**: tiles 101 vs 116,
> carved 42 vs 47, and a wide margin in overlay-authored streets.

⛔ **Three variants of one failure**, all named in the revert commit body: **(1)** wrong SCENE ·
**(2)** a FLAG-OFF BAKE — the build on screen didn't contain the change · **(3)** a STALE BROWSER
CACHE. *"I verified the artifact I produced instead of the artifact the operator was looking at."*
Confirming the scene alone catches one of the three; the question is always **"is the thing on
Jacob's screen the thing I built?"**

⚠️ **The "52 vs 177 overlay-authored streets" figure is history** — LS was reverted to genuine
default 2026-08-06 (`2481ffad`), so its live number moved while staging's did not. Count, never
quote: `node -e "console.log(Object.keys(require('./cartograph/data/<scene>/clean/overlay.json').streets).length)"`.

⚠️ An older line read *"these probes do not predict the eye."* It **over-read a compromised
verdict** — the probes are neither vindicated nor discredited, because they were never tested
against a correct view.

**The transferable rules both live elsewhere now:** the eye-verdict rule at
`[[feedback_an_eye_verdict_must_record_the_scene]]`, and the deliverable it implies — *the live
scene identity must be unmissable in the tool* — on the board as its own item, because two people
looking at a map all day and being unable to tell which one it was is a **Layer 0 silent
substitution in the authoring surface itself.**

## 2. The counter history — retired because it kept being quoted at the wrong value

- **All 50 LS dead-end tips are zero-width slits** (corrected 2026-07-30 from an earlier reading).
- The missing-mouth-corner test fires on **9 of 50**, not all.
- ⛔ **The "6 vs 9" split is dead** (re-measured 2026-08-05): the missing-corner set and the
  legs-running-through set are **SET-IDENTICAL, 9 and 9**, from two independent predicates — which
  is *evidence for* the one-fault thesis, not against it. Of the 9, **5** are a genuine two-pass
  missing corner and **4** present only one mouth pass: a different condition sharing a counter.
- The old **6** is **unreproducible** — its probe was deleted by `7b5b87a3` — not merely wrong.
- The **40** that look right are held by the FILL-layer mouth-wrap snap.

*(`MEMORY.md` still warns that four different "nine"s get quoted interchangeably. That warning is
about this paragraph.)*

## 3. `SPUR_OUTLINE` as flown — 2026-07-30, half built, flag off

Assert the spur as an open U (curb · cap · curb) **before** polygonization rather than punching the
whole map. Measured: slit rings **50→9** · caps **50→7** · 41 notch faces · **blocks stay 101**
(whole-map punch-out moves 25 of 101). FILL half landed 2026-07-31 — `atCurb` ⇒ zero asphalt inset
on an edge already at the curb: spurs at full road width **43/52 → 45/52**, no losses, unclosed
spurs roll back rather than losing their road. Junction band **fixed and net better, 101 → 110
clean** (a datum change was being read as a street corner).

Remaining before default-on, as of the revert: Jacob's eye in Survey (never run; needs
`rebake-shape.mjs`), 2 marginal junctions still off-clean, the 9 one-sided-mouth tips.
`SPUR_OUTLINE` is gone from source; **the construction lives at `152e7734`.**

## 4. The one-day "false dead end" resize, closed the same day it opened (2026-08-11)

A same-name-fragment filter was proposed to shrink A0's population, on the reading that an unwelded
fragment renders as a false cul-de-sac. **Refuted by the operator on its own worked example:** Jacob
— *"Carroll is severed by Truman — cul de sac one side, butts up to Truman on the other"* and
*"it's already correct in the survey tool, so it's only the corner naming and the ribbons reading
the labels."*

⛔ **A same-name test cannot separate SEVERED from FRAGMENTED** — both keep the name on both sides.
⭐ `OSM-FORENSICS §1.3` had listed Carroll (26.9 m) among **genuine** severances since June, so two
live docs contradicted each other for two months and the untested half won.

Surviving: the probes are shortlists (`scratch/claims-false-deadend-census.mjs`,
`scratch/claims-curated-centerlines-unread.mjs`), and the one derivable half is **`A09`** —
`highway=turning_circle` typing, already measured onto `carroll-street-1` · `caroline-street-0` ·
`henrietta-street-0`, fetched at `fetch.js:97` and dropped at `:123`.
