# BRIEF — the Bake re-skeletons a stale town: a committed town is never stranded on old skeleton code

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-28 night, Boz, at Jacob's ask: "write A and B"; Zob's premise pass CO-SIGNED WITH CORRECTIONS, folded in)
evict-when: the Bake's plan names a stale skeleton and its run re-skeletons a committed town through the route; an authored skelId that
would vanish or change its ways refuses by name; HPDM and Huron take the area-highway rule through their next Bake; the gates below green
with mutants seen RED; merged on Zob's PASS. Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** **Report to Boz.** **Confirm-then-build:** every premise is a claim; confirm it against the code and say what you
found. If the code disagrees, stop and flag Boz.

## 0. Why (2026-10-28)
LS's Bake refused: *"⛔ derive: skeleton chain saint-ange-lane carries no class — re-pour the skeleton (streetClass.js)"*. Its skeleton
predated the street-class vocabulary, and NO BUTTON could re-skeleton it: Boz ran `CARTOGRAPH_SCENE=lafayettesquare node skeleton.js`
by hand (Jacob's go), the backdoor the ratchet forbids (*"the build is a ratchet… use the buttons' route"*, Jacob 2026-10-25). The same gap
keeps today's area-highway rule (`kerf/area-highway`, merged) from ever reaching HPDM and Huron: it lands only at a re-skeleton.

## 1. Read first
- BACKLOG: "NO BUTTON RE-SKELETONS A COMMITTED TOWN" (in `cartograph/_archive/HANDOFF-2026-10-28.md` if the live row has moved).
- `cartograph/OPERATIONS.md` Extent step 9 (Bake = commit on a first Bake, re-scope after), and the Bake's re-pour question.
- `EXTENT-DESIGN.md §4.1` (frozen identities: carry, never re-derive; the open key) and `SKELETON.md` on identity.
- Layer 0 q3 (`CLAUDE.md`): the operator's authoring is the product; `blockCustoms`/overlay are keyed by `skelId`.

## 2. What the code does today (confirm by symbol)
- `cartograph/serve.js` POST `/<scene>/commit-extent` runs `node skeleton.js` (first commit only). POST `/<scene>/rescope` deliberately
  does NOT ("no skeleton rebuild, no identity churn"). Extent's Bake on a committed town takes rescope.
- `cartograph/pourSteps.mjs` holds the Bake's one step table (coast, pipeline, promote-ribbons) and one recorder (`recordStep`,
  `stepReads`); there is no skeleton step, so a skeleton-code change never dirties anything, and the pour refuses downstream instead.
- Today's measured re-skeleton of LS: chains 321 → 330 (6 split into 9 more), all 27 authored skelIds kept, same names, ends within 0.5 m
  (Boz's one-off script); `checks/claims-authored-skelids-keep-their-ways.mjs` exists.

## 3. The work
1. A `skeleton` step in pourSteps' table, ahead of the pour. Its reads, exactly (Zob): raw/osm.json, raw/survey.json (loadSurveyStreets;
   a named-absent file) and skeleton.js's import closure (streetClass.js, the vocabulary). It does NOT read the extent or boundary. Its
   outputs: clean/skeleton.json AND clean/street-index.json (`--index`, also run at serve.js ~1733). Recorded through the one recorder.
   ONE RECORDER ON EVERY PATH: commit-extent (~2070) and the restore/re-seed path (~2138) run skeleton.js outside the table; route them
   through it (runPour-style) or record after them, or the next Bake judges the skeleton stale (the bug 9d96d4fe fixed for the pour).
2. **The authoring guard, before the new skeleton replaces the old.** Every key the town's authoring names must survive: blockCustoms
   (skelId · side · SEGORD), capEnds (skelId · end: a split chain moves which END is which), overlay (skelId), corner overrides (their
   key format is to be READ, not assumed). ⛔ SEGORD is topology (tileGround.js#mintSegOrdAt): a re-skeleton that adds or removes an
   interior intersection on an authored street re-keys its slots silently (LS's history: 12 pours changed an authored street's count, all
   kit changes). Until r-block-keys-are-minted-once-and-inserted-between is built, REFUSE by name when an authored street's segOrd
   structure changes, reusing chainJoins.mjs#refuseAuthoredReKey's rule (no second copy). Synthetic unnamed ids are positional
   (`<highway> <n>`), so a new unnamed way can renumber them: the guard catches that as "ways changed".
3. Extent's rescope keeps NOT re-skeletoning (its reason stands); the Bake does it when the skeleton is stale.
4. The re-pour question (428) names the skeleton among the files when it's the cause.

## 4. Gates
- A planted skeleton-code change makes the plan list `skeleton` (and everything downstream); the run re-skeletons; mutant (the step
  removed) → the pour refuses downstream as today → RED.
- The authoring guard: a planted authored skelId whose ways change → refused by name; mutant → silent → RED.
- Measured, offline with the slot: HPDM and Huron re-skeleton through the Bake, the area-highway rule lands (HPDM's st-louis-walk-of-fame,
  chapman-plaza, dr-huston-smith-meditation-garden, south-terrace and Huron's the-deering-family-terrace-0/-1, receiving-area-b leave the
  network), authored ids all kept (`claims-authored-skelids-keep-their-ways`), and HPDM's two frame-made nodeless crossings go 2 → 0.
- A planted re-skeleton adding an interior intersection on an authored street → refused by name; mutant (the segOrd guard removed) →
  silent re-key → RED.
- `claims-the-bake-watches-its-code`, `claims-the-pour-records-itself-once` green.

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`; serve.js changes restart :3333 by itself
(node --watch), so merge only on Boz's word. No real Bake on Jacob's towns without asking; offline runs with the heavy slot by name.
