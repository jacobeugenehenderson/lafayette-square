# BRIEF — a chain end inside another street's roadway is a T

<!-- BRIEF-STATE
status: RETIRED 2026-10-28 (LANDED: kerf/chain-end-is-a-node 0cd45dac, merged 67849da9 on Zob's PASS; the join is built at mintInputs, cartograph/chainJoins.mjs#joinChainEnds, checked by checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs. The (b′) ends and the join's override home stay OPEN for Jacob, in BACKLOG's handoff)
written: 2026-10-27 night (Boz)
evict-when: the check below is GREEN on every poured town with its mutants seen RED, the join is built at mintInputs, merged on
Zob's PASS; then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH** (or WARM → Kerf if Jacob prefers: Kerf has built in the mint). **Report to Boz.** **Confirm-then-build:** every
site below is Zob's read at integration d4af8879. Confirm each. If the code disagrees, stop and flag Boz; the stop is the deliverable.

## 1. The ruling (Jacob, 2026-10-27; registry `r-a-chain-end-in-a-roadway-is-a-T`)
A chain end that is no node and lies inside another street's roadway becomes a T, joined by rule at **mintInputs**, judged by
**that street's own half-width**. The join is recorded and reported, and the operator can override it. No constant: the only
distances are the two streets' half-widths. Moving widths upstream to the skeleton was not chosen.
- ⛔ **ASPIRATION — the override: unbuilt, home unruled** (Boz, 2026-10-27). The join is built with its frozen record, printed
  by name, so nothing is silent; but the mint is blind to authoring (the Wall), so the override must be a POUR input, and which
  one is Jacob's design question. No override path is built until he rules.
- **(b′) is NOT joined** (Boz, 2026-10-27): the ruling covers an end INSIDE the other roadway. An end whose own roadway only
  reaches the other's is a question for Jacob, RED in its own question-check (`scratch/chain-ends/claims-a-chain-end-reaching-a-roadway-awaits-a-ruling.mjs`,
  split on Zob's read so the (a) check can gate GREEN after the join; out of the default run, Boz: it moves to checks/ as
  whatever Jacob rules). Grade-separated pairs are set aside by name (minted apart).
- **A join that would re-key authoring STOPS THE POUR, by name** (Boz, 2026-10-28, on Zob's read; it was a per-end skip,
  which let authoring shape ① and was not idempotent): an authored blockCustoms slot of the through street at or after the
  segOrd of the block the foot cuts (segOrd is topological, so a new crossing re-keys every block after it), or an authored
  cap on the joined end. Authoring is read only there, and it only throws (`claims-proto-wall` claim A′). The key's migration
  is filed under the open key (`EXTENT-DESIGN §4.1`) for Jacob. ⚠️ LS (27 authored streets) is not checked: its skeleton is
  stale, so its next pour may stop here if a joined street carries its authoring; that is Jacob's, and LS re-skeletons first.
- **A foot on the through street's own FREE END is not a T** (Boz, 2026-10-28; Altadena's west-pentagon-street ×
  krenz-avenue, each past the other's end): set aside by name as a question, the false-dead-end class. A join never puts one
  segment on two chains (pour-fatal).

## 2. What the code does today (Zob, by symbol)
- `skeleton.js#buildNodeGraph`: a node is a shared coordinate (`vKey`, 1 cm). Nothing splits a chain at a crossing, and nothing
  snaps an end. An in-roadway end stays degree-1 (drawn, inferred, as a round cap inside the other street).
- `tileGround.js#mintProtopolygon`: a node is a shared stroke vertex; street × street overlap is resolved by the union.
- Half-widths exist only at the mint's input (ribbons measure; per block through `tileGround.js#resolveProtoMeasure`).
- ⛔ **The Wall:** the pour is blind to authoring (`checks/claims-proto-wall.mjs` claim A). So the join is judged by the
  POUR's measure (`resolveProtoMeasure(run, null, …)`). Zob's census found no end changing bucket under authored widths. If the
  Wall makes that a gap for town #2, name it; don't cross it.
- Census and probes: `scratch/zob-2026-10-27/` (`xings.mjs`, `partoff.mjs`). Counts per town: run them, never quote them.

## 3. The work
1. **The check first:** `checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs`. It reads the skeleton, the mint's half-widths and
   the frame. It's RED on any end that is no node and lies within another chain's roadway (and on (b′): the end's own roadway
   reaches the other's). It names both streets with distance/half-width. Mutant: move one noded T end into the through street
   off its vertex → RED. Seen RED on today's towns before the fix.
2. **The join at mintInputs:** the end becomes a node on the through street. Each join is written to a record the operator sees
   (Survey) and can override. The pour reports the count by name.
3. Sibling, already built: `checks/claims-a-nodeless-crossing-is-grade-separated.mjs` (RED on HPDM's two frame-made crossings,
   delmar-boulevard-9 × st-louis-walk-of-fame; cause not established). Read it; don't duplicate it.

## 4. Bounds
Branch off integration/2026-10-20 in `.claude/worktrees/`. Commits by `git commit -- <paths>`. Canon is off-limits except
`SKELETON`'s dead-end paragraph if the join changes what it says. Heavy slot from Boz by name. Same-name pieces (99th-street,
putney-road) are the false-dead-end class: `claims-false-deadend-census` asks by name, and a hit there is a question, not a verdict.
