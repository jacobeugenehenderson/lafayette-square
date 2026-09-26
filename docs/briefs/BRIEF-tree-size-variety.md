<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: every placed tree in every town carries its own size within its species' band, the near and far drawings agree on it, and Jacob has eye-gated Provincetown.
-->

# Tree size — every tree its own size, and one size per tree however it is drawn

**You are the dispatched agent. Name yourself — one word, yours, and NOT a name another RUNNING session
already holds.** Check with `ListAgents` before taking it. Then ask Jacob to `/rename` the session to it.
**Agent: FRESH.**

## The ask

Jacob, 2026-09-26: Provincetown's trees *"seem possibly too large."* On a single height per species:
*"The whole point of the arborist is to create a variety of trees; a single height on 2,000 trees would
literally not be that."* ⇒ **Two defects, one brief:**
1. **No variety.** Provincetown's and Huron's placements carry **no per-tree `scale`**, so every tree of a
   species draws at the same height. LS's all carry one.
2. **One tree, two sizes.** The same species is drawn at different heights by different impostor paths —
   `trees-atlas.json` `impostorBySpecies.<sp>.heightM` vs `heroImpostorBySpecies.<sp>.heightM`: Provincetown
   `pine_pitch` 10.3 vs 18.3 m, `pine_white` 12.3 vs 24.4 m; ratios 1.09–1.98. A tree can grow or shrink as the
   camera changes which path draws it. ⚠️ Which placements draw through which path is NOT established.

▶ Measured by Tally, `90d33ad3`: `node checks/claims-tree-drawn-height-by-window.mjs` — re-run it, don't quote.

## Why there is no size today (read in source)

`arborist/bake-trees.js`, the `bandFor` block and the per-instance `scale` (grep `PER-TREE SIZE FROM THE SPECIES
BAND`): a tree's size = its species' height **band** × where **its own measured DBH** sits in that species' DBH
distribution. `REAL_DBH_SOURCES` is city-inventory / forest-park / park. ⇒ **a town whose census is only OSM +
canopy fill has no trunk measurements, so it cannot size, however good its dossiers are** — and the bake says so
(grep `render at a FLAT 1:1`). Provincetown and Huron are exactly that town.

### ✅ RULED 2026-09-26 (Jacob): *"'nothing is invented' is the right spirit but wrong laxity."*
The rule was being read too strictly. **A size inside the band a source published is SOURCED, not invented** —
the band is the measurement. What stays forbidden is a size OUTSIDE any published band, a band borrowed from
another town, or a constant. ⇒ A tree with no measured trunk takes a size **within its species' published band**,
spread across it (deterministic per tree, e.g. by position seed), and is stamped as such (`H-17`'s provenance
contract: measured vs derived), so a real inventory still wins wherever one exists.
⚠️ Still yours to design and show Jacob before building: **how** sizes spread within the band (uniform, weighted
toward the middle, or shaped like the real DBH distributions we do have — say which and why), and which window
(street vs forest) the band is for a given town — see the "two size windows" item below. ⛔ No per-town constant,
no LS distribution applied to another town.
⛔ **Fix the code's comment in the same commit** — `bake-trees.js` "Nothing is invented: a tree is never scaled
outside what a source actually claimed" is right as written; the blocking reading was requiring a MEASURED DBH
too. Say plainly which part is the rule.

## Read first

- `arborist/ARCHITECTURE.md` — "Tree-render reality at LS" and the impostor section (`heroImpostorBySpecies`, the
  overhead/far path, how the runtime scales a card by `heightM`).
- `arborist/BACKLOG.md` — **"A SPECIES HAS TWO SIZE WINDOWS, AND THE TOWN PICKS ONE"** (street vs forest height,
  chosen per installation). ⚠️ It names `scratch/dossier-raw-observations-batch2.jsonl`; the real file is
  `scratch/dossier-raw-batch2.jsonl` (Tally) — fix that pointer. The window choice touches the rubric keystone and
  **needs a standup with Jacob before it is built**; it is related, not required, for this brief.
- `ROADMAP` **H-17** (the provenance contract) and **H-20** (withholding species).

## Code sites

- `arborist/bake-trees.js` — `bandFor`, the DBH percentile lookup, `REAL_DBH_SOURCES`, the instance `scale`.
- `arborist/bake-impostors.js` — `computeTreeBounds` → `heightM`; which variant is "representative".
- `arborist/bake-look.js` — where `impostorBySpecies` / `heroImpostorBySpecies` are written into `trees-atlas.json`.
- `src/components/InstancedTrees.jsx`, `src/components/HeroImpostorTrees.jsx` — how each path turns `heightM` and
  the instance `scale` into a drawn height. **Establish which placements use which path before changing either.**

## The chain

Upstream you trust: the dossiers and the census wells. Downstream: `trees.json` + `trees-atlas.json` → the three
tree paths → the phone budget (Column B). Changing size changes overdraw; report it.

## Can the instrument see it?

Tally's size check reads the artifacts. A bake change needs a re-bake per town to show — Jacob's go. The check
must be extended to assert **one drawn height per placement across paths**; mutation-test it. Eye gate: Jacob,
Provincetown in Preview, a near and a far shot of the same trees.

## Bounds

- Measurement and the proposal first; stop and report to Jacob before building.
- Then write in `arborist/` and the two tree components; no bake without Jacob's go.
- Canon: `arborist/ARCHITECTURE.md` gets the rule; `ROADMAP` a line. Commit messages name the register reached.

**The instruction is confirm-then-build:** read the canon and the code, tell Jacob what you found, and if the code
contradicts this brief — stop and flag him.
