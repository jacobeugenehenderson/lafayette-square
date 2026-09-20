<!-- BRIEF-STATE
status: OPEN
dispatched: 2026-09-20 (Thane)
written: 2026-09-20
evict-when: RULING: its gate (A landed, B landed or ruled out) is now MET — both landed 2026-09-20. It leaves the roster when Jacob dispatches it and a ranked list has been seen on two towns.
-->

# BRIEF C — PROMINENCE: WHICH BUILDINGS GET PROMOTED, AND IN WHAT ORDER

*Written 2026-09-20 by the coordinator seat.*

> ## ✅ GATE MET, DISPATCHED 2026-09-20. The scorer is built; what remains is Jacob's eye.
> The park was real and it held: A landed (`3,576/3,678` parcel-matched, addresses 98%→3% missing)
> and B landed (the Overture base), so the rank is computed on data rather than on gaps.
> ▶ **Built:** `cartograph/prominence.mjs` · `checks/claims-prominence-recovers-ls-landmarks.mjs` ·
> operator knobs in `cartograph/OPERATIONS.md` "THE WORK QUEUE".
> ⏳ **Owed before it leaves the roster:** the `§4.1` signal-list addition needs Jacob's yes (§8), and
> the panel's progress semantic is proposed, not built (§8 — out of bounds by design).

---

> ### ⭐ THE PROBLEM IT SOLVES — `INTAKE-CATALOGUE §4.3`, Jacob's own framing, 2026-07-20
> *"Content hand-work is the one genuinely **unbounded** cost in this catalogue — ~100–150 operator
> hours per town, with no principled stopping point. **You cannot do 1,640 buildings and there is no
> honest way to pick 60.**"*
>
> ⇒ This is not a feature. **It is the thing that makes a town finishable.**

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

⚠️ Unless A's agent is still live and idle when this is dispatched — it will hold the roster's shape
in context and that is worth more here than freshness. **Ask Boz; do not assume either way.**

## 3. Read this canon, by section

- **`INTAKE-CATALOGUE §4.3`** — the effort model **in full**. It is short and it is the design.
- **`INTAKE-CATALOGUE §4.1`** — the cheap-signal inventory. ⚠️ Its table is **Łódź's**, a town that no
  longer exists on disk. **The METHOD is what you take from it; re-derive every number.**
- **`NEIGHBORHOOD-INPUTS §0.0 / §1.1`** — **the override is first-class.** This is the constraint that
  shapes the whole brief; see §5.
- **`CLAUDE.md` Layer 0 q3** — ⛔ **am I calling the operator's AUTHORING a defect?** A rank that
  disagrees with what the operator promoted is **the rank being wrong**, never the operator.

## 4. ⭐ VOCABULARY — USE THE WORD THAT EXISTS. This is a hard constraint, not style.

`§4.3`, verbatim: *"`useListings` already loads `'landmarks'`, and bare buildings are the synthetic
residue. So this is not a new concept: it is **deciding which buildings get promoted from bare
building to landmark, and in what order.** ⛔ **Do not introduce "importance" alongside "landmark."**"*

**Verified in the code 2026-09-20 — the distinction is already built and named:**
- `src/hooks/useListings.js:96` — `loadInstanceData(INSTANCE.lookId, 'landmarks')`
- `:103` — `_landmarkBids = new Set(landmarksWithMenus.map(l => l.building_id)…)`
- `:55` — `_buildBareBuildingListings(buildings)`, and `:89` stamps **`_bare: true`**

⇒ ⭐ **The ladder you are ordering is `_bare: true` → landmark.** A promoted building is one that
**leaves** the bare set. ⛔ If your design needs a third state or a new noun, **that is a signal you
have drifted — come back before you build it.**

## 5. ⛔⛔ THE TWO CONSTRAINTS THAT MUST HOLD — `§4.3`, and they are not negotiable

**① THE RANK IS A GUESS, AND EVERY GUESS IS OVERRIDABLE.**
> *"A beloved corner bar scores near zero on every cheap signal — no Wikidata, no tags, small
> footprint. **The rank orders the work queue; it must never gate what can be filled.**"*

⛔ **So: no thresholds that hide a building, no "top N" that makes N+1 unreachable, no score that
suppresses a card.** The rank is a **sort**, never a filter. ⭐ **Design the override before you design
the score** — if promotion-by-hand is bolted on afterwards it will be a second system.

**② THE SIGNAL NO DATASET CARRIES.**
> *"Residents know the ranking the data cannot see. **Let them promote a building and you have
> captured a prominence signal no dataset carries** — the single strongest argument for routing rows
> to the CLAIMED kind (`§3.4`) deliberately rather than by default."*

⭐ **This is the one place "connect your neighborhood" earns its keep.** ⛔ Do not build the resident
path in this brief — but **do not design a score that cannot accept it later.** Leave the seam.

## 6. The signals — ⚠️ and one of `§4.1`'s "free" four is NOT available to town #2

**From tags, free** (▶ re-derive per town; huron's 2026-09-20 run is a witness, not a constant):
```
name 663 · amenity 128 · addr:postcode 49 · website 31 · brand 22 · phone 18
opening_hours 14 · wikidata 13 · wikipedia 12 · building:levels 12
shop 8 · office 7 · tourism 7 · craft 2 · historic 2 · heritage 2
```
⭐ **`wikidata` is the strongest cheap signal in existence — someone catalogued this building.**
⭐ **`website` / `phone` / `opening_hours` are not in `§4.1`'s table and should be** — they are close to
a *going-concern* signal, which is exactly what Jacob asked for (*"where the viable businesses are"*).
**Propose adding them; do not silently extend the canon's list.**

**Computed, free:** footprint area (`clean/map.json`) · POI count per building (falls out of the
listings join).

⛔⛔ **HERO-PATH VISIBILITY IS NOT AVAILABLE ON A POURED TOWN — verified today.**
`§4.1` calls it *"arguably THE prominence metric"* and *"no other product could compute this."* But
`CartographApp.jsx`'s `genericSceneConfig` sets **`hasHero: false`**; the hero path is LS-only.
⇒ ⚠️ **A ranking that leans on it is an LS-shaped ranking that degrades silently on every other town**
— Layer 0's signature failure. **Either it is out of scope, or the poured-town hero path is a
prerequisite. Say which, out loud, and do not quietly weight it to zero.**

**Parcel morphology** (lot area · coverage · frontage:depth · corner-vs-interior · abutment) —
`§4.1` credits this to Jacob's own parked idea in `cartograph/BACKLOG §LATER` (2026-07-07).
⚠️ **Depends entirely on brief A's assessor work** — it is zero-signal at 0% parcel match.
⛔ **Verify that BACKLOG entry still exists before citing it**; two catalogue citations have already
proved stale today.

## 7. ⛔ Can the instrument SEE the change?

⚠️⚠️ **THE HARD PROBLEM OF THIS BRIEF, AND IT IS NOT THE SCORE — IT IS KNOWING THE SCORE IS ANY GOOD.**
A ranking always produces a plausible ordered list. **It cannot fail visibly.** ⇒ This is
`CLAUDE.md` Layer 0 q2 at its most dangerous: the output *is* the plausible-looking success.

⭐⭐ **THE ONE HONEST INSTRUMENT WE ALREADY OWN: LS.** It has **87 hand-curated landmarks**, chosen by
people, over years. ▶ **Score LS's buildings with no knowledge of that list, then ask how many of the
87 the top-N recovers.** That is a **real, falsifiable** measurement of whether the cheap signals
predict human judgement — and it is the closest thing to ground truth in the repo.
⚠️ **And read the failures, not just the hit rate:** the 87 the score MISSES are the §5.① population —
the beloved corner bar — and **they tell you what the data cannot see.** ⛔ Do not tune the score until
it recovers all 87; that is overfitting to the mould the kit was cast around, and it is the exact
LS-bleed this catalogue's headline finding is about.

⛔⛔ **MUTATION-TEST ANY CHECK.** `MEMORY §C` — a passing check proves nothing until seen to FAIL.
A check in this repo **passed for the wrong reason** on 2026-09-20 (a lazy regex matched 3 of N and
reported green). Make yours go red on purpose, by name, first.

**Eye-gate surface:** the ranked list itself, in front of Jacob, on **two** towns — ⛔ never only LS.

## 8. Write/commit bounds

**In bounds:** the scoring path + its check · the operator-facing ordering · `INTAKE-CATALOGUE §4.1`'s
signal list (the `website`/`phone`/`opening_hours` addition, **if Jacob agrees**).

⛔ **OUT of bounds:** intake (**A**) · the external base (**B**) · the fade arc (**Quill**) · the
resident-promotion path (**leave the seam, build nothing**) · ⛔ **the panel's progress UI** — `§4.3`
describes the semantic (*"your top 50 are complete"* rather than *"3% of 1,640"*) and that is a
surface Jacob has not scoped. **Propose; do not build.**

⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** ⚠️ This brief's specific drift risk is **scope creep into
the content work itself** — ranking is not researching. **You produce an ORDER. You fill nothing.**

## 9. The validation surface that already exists

**LS is the reference consumer** (§7) — ⛔ never the subject. `bake-content.js` runs per scene in
seconds and prints a census; it is the harness. ⛔ **No parallel spike**
(`feedback_no_parallel_pipeline_for_scenes`).

---

## What "done" looks like

1. Every building carries a **score derived from re-derived signals**, per town, with the signal
   breakdown legible — ⛔ never a bare number.
2. The rank is a **sort and never a filter**; hand-promotion exists and outranks the score.
3. The **LS-recovery measurement** is run and reported — hit rate **and** the misses.
4. The hero-path question is **answered out loud**: in scope, or a prerequisite.
5. No new noun. `_bare: true` → landmark, and nothing else.
6. Jacob has seen a ranked list for **two** towns.
