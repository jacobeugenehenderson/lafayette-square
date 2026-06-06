# HANDOFF — Divided-corridor model: forensic scope + spike (grounded in the operator's traces)

**Goal:** with a **clean skeleton**, design how a divided corridor *should* be constructed — and prove it against the operator's traced correct-curbs. The hypothesis (Jacob): the inner-edge / emergent-median workflow was **pre-clean-skeleton scaffolding**, now obsolete; a clean frame needs **much less**. Resolve the model, then produce the decomposition **and the rip-out ledger** (knobs + wiring + docs to excise). ⚠️ **Scope + spike only — NO production merge.**

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to the current trunk tip FIRST.** General-purpose, forensic-then-spike.

> **Push back if the framing is wrong.** Three prior agents caught wrong instructions in their briefs — that's the job. If the forensics contradict this brief (the inner-edge model is still needed, the chain-position is other than you find, etc.), **say so and flag Boz.**

## The ground truth — the operator's traces
`cartograph/data/lafayette-square/clean/marker_strokes.json` — 7 strokes. **In scope (divided family):** **#0** (starts on the true corner `174,208`, traces Lafayette's correct **outer curb** east), **#1** + **#6** (Lafayette curb, further east / west), **#5** (Park × S-18th — the remaining dysfunctional corner). These are *where the outer hardscape curb should sit.* **OUT of scope:** **#2/#3/#4** = T-intersection bumps (band-fold thorns → `HANDOFF-band-fold-fix.md`, a different class — do not chase).

> ⚠️ **Data access (worktree trap).** The operator data — `marker_strokes.json`, `overlay.json`, `skeleton.json` — is **gitignored**, so your fresh worktree won't contain it. Read it from the **main tree's absolute paths** (`/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/lafayette-square/clean/…`). `src/data/ribbons.json` **is** tracked (in your worktree). **Do NOT trust a worktree pipeline rebuild** — it lacks the operator overlay, so its output is wrong (Gunter's lesson); read the live artifacts, don't regenerate them.

## The facets to resolve (all one corridor problem)
1. **Chain-position — resolve the contradiction (`DOC-CODE-COHERENCE` D9).** FEATURES §371 says the chain sits at the carriageway **center**; the prebake plan + D1 assumed the **inner edge**. **Project each correct-curb trace (#0/#1/#6) perpendicularly onto the correct carriageway chain and measure** — that tells you where the chain actually sits relative to the real curb, per corridor. Then: is the current asphalt emitted on the right place, or offset off the lane ("emits from the left of the lane, not center")? This likely means D1's inboard-zero offset the asphalt on center-chains.
2. **The fold-at-join.** Where two split lanes **converge to a single lane** at a node (median closing), the geometry **folds back on itself instead of merging.** Same root as the false corner — the carriageway **stub/taper at the transition node**. Design the clean merge: outer curb continuous through, lanes join to one, no fold.
3. **The corner (Park × S-18th, #5).** The false-corner class — the clean corner is the two **corridor outer-edge legs** meeting (not the carriageway stub). Verify against the trace.
4. **The median — constructed, not emergent.** Today the median is a *residual* (the leftover face between two offset emits) — fragile/ugly (the figure-ground→tiles lesson: construct positively, don't leave a leftover). Design the median as a **clean constructed polygon** that handles the open AND close transitions.

## Read first (to the section)
`cartograph/PREBAKE-POLYGONIZATION-PLAN.md` (the freeze + D3 corner) · `cartograph/SURVEY.md §6` + `§5.1` (transition; polygon-first) · `cartograph/SKELETON.md §5` + `§2` (phase/innerSign/pairId/chainGap/spineAt*) · `cartograph/FEATURES.md §367-387` (the **locked** two-carriageway model + its rationale — you're testing whether the clean frame obsoletes the inner-edge *emit*, NOT necessarily the two-chain *data* model) · `cartograph/TRUMAN-FORENSICS.md` (median fragmentation) · memories **`[[feedback_geometry_bugs_may_be_data_bugs]]`**, **`[[feedback_remove_functionality_excise_knobs_wiring_docs]]`**, `[[project_special_sauce_intersection_street_distinction]]`. Code: `tileGround.js` `extractFaces`/`effectiveMeasure`/`isMedianFacing` + the per-tile emit; `derive.js innerEdgeAssign` (D1); `skeleton.js` phase.

## Deliverables (a report + a spike, NOT a merge)
- **Chain-position resolved** per corridor, from the traces (with numbers); the D9 contradiction settled.
- **A model recommendation:** what a clean-skeleton divided corridor needs — likely "keep two carriageways as DATA, construct the median + clean transitions at prebake, drop the inner-edge emit." Or, if forensics say otherwise, your alternative (flag it).
- **A spike** on Lafayette (curb tracks the traces #0/#1/#6, the join doesn't fold) + Park×S-18th (#5 clean corner). Harness/SVG fine; **final verdict is Jacob's eye on the live tool** (`[[feedback_proxy_render_is_not_the_operator_eye]]`).
- **The decomposition** into build-briefs (Boz turns these into dispatches).
- **⭐ The RIP-OUT LEDGER** (first-class): every inner-edge **knob** (Anchor dropdown), **wiring** (setAnchor/pair-mirror, the inner-edge seed transform, `innerEdgeMeasure`/`effectiveMeasure`/`isMedianFacing` inboard-zeroing, D1's `innerEdgeAssign` if superseded), and **docs** (FEATURES §367-387, SKELETON §4 anchor) to excise **on cutover**. ⚠️ Keep what the new construction still needs (corridor **detection**: `pairId`/`innerSign`/`phase`); rip only the abandoned emit. Clean cutover: new lands + blessed → *then* excise.

## Boundaries
Spike code in `scratch/`; design doc as `cartograph/DIVIDED-CORRIDOR-PLAN.md` (or append). ⛔ No production geometry merge, no `ribbons.json` rebuild into the live tree, no canonical-doc edits (Boz conforms). Sync to trunk, commit on the worktree, report refs.

## Out of scope
The 3 T-bump band-folds (#2/#3/#4) · building the cure · unlocking to a single spine (hold in reserve unless the forensics force it — flag, don't do).
