# DIARY — "the bake contains no wall at all" was measured wrong, and it founded two briefs

*Excised from `BRIEF-terrain-resolution.md` and `BRIEF-boulder-revetment.md` on 2026-09-21, the day
after they were written. Kept because **a wrong measurement is a lesson**, and because this one was
not a stale doc — it was fresh, specific, numerate, and load-bearing for two open briefs within
twenty-four hours.*

---

## The text, verbatim, as it stood

`BRIEF-terrain-resolution.md`, the block that provoked the brief:

> **The elevation we baked does not contain it.** Measured across huron's 2,064,969 samples, mean
> elevation walking inland from the waterline:
> ```
>  5 m inland   0.9 ft        30 m inland   1.5 ft        60 m inland   2.3 ft
> ```
> ⛔ **A 2 ft rise over 200 feet.** Not a smeared wall — **no wall at all.**

`BRIEF-boulder-revetment.md` §②:

> **MEASURED — huron's terrain, acquired and baked today (USGS 3DEP `n42w083`, 5 m grid, ~10 m
> source), all 2,064,969 samples:**
> ```
> waterline samples with a >1 m rise adjacent :  0
> steepest single-step rise from water        :  0.0 m
> ```
> ⇒ ⛔ **A near-vertical 15–20 ft bank is SMEARED INTO A GENTLE RAMP by the sampling. The real shore
> edge is absent from the heightfield and NO RE-BAKE RECOVERS IT.**
>
> ⇒ ⭐⭐ **THE REVETMENT IS NOT DECORATION. IT IS THE ONLY THING THAT CAN PUT THE SHORE EDGE BACK.**

The same numbers were carried into `intake-elevation-source-agnostic-FALSE-2026-09-20.md` as that
entry's statement of cost (*"the seawall is not smeared — it is absent"*). **That file's own lesson —
a doc overstating the code — stands; only its cost paragraph is affected.**

## Why it is false

Re-derived from the very same shipped artifact, `cartograph/data/huron/clean/terrain.bin`:

▶ `node scratch/huron-shore-transect/bake-gradient.mjs`

The bake carries hundreds of shoreline steps over 1 m and a steepest step of several metres. The
claim of **zero** was not a marginal miss; it was the opposite of the artifact's contents.

⚠️ **Cause not established.** The probe that produced the original figures was not kept, so how it
reached zero cannot be shown. What *can* be shown is that the same class of error is easy to commit
here and was committed again on 2026-09-21 by the seat writing this file: the 1 m DEM is
**hydro-flattened** — Lake Erie is a constant plane in the data, not a void — so a transect that
identifies the landward side by "where the data stops" walks half its samples out into the lake and
measures a flat surface. That is a hypothesis about the original, not a finding.

## ⭐⭐ What was actually wrong, which is worth more than the correction

▶ `node checks/claims-a-level-body-has-one-surface.mjs`
▶ `node scratch/huron-shore-transect/two-lakes.mjs` (the bed histogram)
▶ `node scratch/huron-shore-transect/lu-and-osm.mjs` (what the map already says the shore is)

The relief is in the bake. What is wrong is the **water datum**: `bake-terrain.js` normalizes the
heightfield to local-min = 0 and `BakedGround.jsx` reasons that *"on a lakeshore town the local
minimum IS the lake"*. On huron the 10 m source carries Lake Erie hydro-flattened at **more than one
elevation**, so the global minimum lands on the lower patch and the drawn lake sits below the bed
across most of its own area. ⇒ The 1 m lidar confirms which patch is right.

⭐ **So the shore edge is not missing; it is mis-seated.** That inverts both briefs:
`BRIEF-terrain-resolution` gains a correct justification (the waterline is wrong, not the bank), and
`BRIEF-boulder-revetment` loses its claim to be *"the only thing that can put the shore edge back"* —
it is decoration on an edge that exists, which was that brief's own other branch.

## ⭐⭐ The lesson, which is why this file exists

**A fresh measurement is not more trustworthy than an old doc — it is less, because nothing has had
time to contradict it.** These numbers were a day old, carried units, cited a sample count, and were
quoted in three places by the following morning. Age was doing all the work that verification should
have done.

⇒ ⛔ **Two briefs were founded on a number nobody re-derived.** `CLAUDE.md`'s gate already says a
brief's premises are CLAIMS, not facts, and that the first act is to confirm them against the source.
That gate fired correctly here — but only because someone was asked to go and measure the shore for
an unrelated reason. **Nothing in the corpus would have caught it otherwise**, which is why the
replacement is a check and not a corrected paragraph.

⇒ ⭐ **And the eviction rule earns its keep:** the false numbers are gone from the live briefs rather
than banner-corrected beside the sentence they contradict. A false claim outlives its correction
because it is shorter and reached first.
