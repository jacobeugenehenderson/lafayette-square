# BRIEF — the pour fix: the land-use stamp lands on the lattice, and Huron's ground bakes again

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-16
evict-when: RULING: Huron's and HPDM's ground bake on this construction without refusing, Cairn's land-evidence check is green on all four towns after being seen red, and the change is committed on swale/flatten-paths-r1 with the code it replaces removed.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH** (Swale's
window is closed). **Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each one against the code and say what you
found. If the code contradicts this brief, stop and flag Boz before building.

## 1. Why this is first today

Nothing downstream bakes without it. On 2026-10-16 the current code on trunk **refused Huron's ground bake**: two
cross-group T-junctions at (-201.58, -991.51), tile 24, the `__water__` run 274, segment 119, where residential land
meets underived land. It took ~35 min and ~7.9 GB to get there. The same refusal came both on the true-mean terrain
and on the served terrain (the control), so the refusal belongs to the bake code, not to the terrain. ▶ 7e7730ab, and
`scratch/ground-budget/` job 3's logs. ⭐ Boz's inference, **not measured:** it is the class Swale found, where a land-use
crossing is rounded into the evidence part and never into iA. **Your first measurement says whether it is.**

Waiting on this: the true-mean terrain bake (eb5aa261), the shore band (`BRIEF-the-shore-keeps-its-lidar`), the
revetment as stamped ground, and the ground budget (`BRIEF-the-ground-stays-in-budget`).

## 2. Where Swale left it (read the record; ⛔ copy no number from it into this file)

- **The write-up is 02da626e's message.** Read it whole: where the crossings are born, the three constructions
  measured, the table per town, and "FOR THE MORNING" items 1–5.
- **The uncommitted work** is in `.claude/worktrees/rings-only` (branch `swale/flatten-paths-r1`): `src/lib/tileGround.js`,
  `cartograph/bake-ground.js`, and the untracked `checks/claims-the-stamp-keeps-its-owners.mjs`, at construction
  (A) + (i). Scripts and captures: `scratch/ground-budget/flatten-r1/` in that worktree (`run-A.sh`, `make-A.py`,
  `onesided*.mjs`, `raw-ev.mjs`, `rim-facts.mjs`). Open board items that are NOT this brief: `BOARD-next-commit.txt`.
- ⚠️ **The branch is behind trunk.** Since 02da626e, trunk gained eb5aa261 (the true-mean terrain read), a083af86 (a
  missing height refuses), and 7c47e8e7 (fetchTerrain). Bring them in before you bake, and say how you did it.
- **The disjointness measure is Cairn's** `checks/claims-the-land-is-painted-by-its-evidence.mjs` (5a368a04). It is
  the one measure; `stampTally` is deleted.

## 3. The work

1. **Confirm the next step against the code.** Swale's reading: in the ① producer, iA and iaFull are the same
   contour, and it is FLOAT until the circle cut (`intersectRings(t.iA, [r])`) puts it on the lattice. That one cut
   does two jobs. The construction to build is **round iA onto the lattice once → stamp the land use → cut with the
   circle.** Say whether the code agrees.
2. **Tie Huron's refusal to it, cheaply first.** The producer captures (`run-A.sh`, ~40 s per town) reach the end of
   the producer without a full bake. Find tile 24 by the ring that contains the point (⛔ never by tile index; the
   live pass and the frozen artifact number tiles differently), and say whether the vertex at the refusal is a
   one-side crossing.
3. **Build it.** Delete what it replaces in the same commit: the circle cut's double job, and any rounding or snap that
   only existed to cover it. Say in the message what was removed.
4. **Measure** on HPDM, Huron, JH and Provincetown: the one-side vertex counts (`onesided.mjs`) beside 02da626e's
   table, and Cairn's check. LS is not measured; its pour is HELD.
5. **Then the gate bakes** (§4 bounds): HPDM first, then Huron. Report refusals, time against
   `bake-timings.json`, and peak memory.
6. **Stop and bring Boz:** what the code said, the counts, the bakes. Items 2 and 3 of 02da626e's "FOR THE MORNING"
   (the shallow-angle Clipper residual and the dead chain-pass paint) are separate items; raise them, don't fold them in.

## 4. Bounds

- ⛔ **No served bake, Publish, Promote or Stage.** Scratch slabs only. LS is HELD.
- **The machine.** Jacob is giving a quiet window now; the full ground bakes belong in it. ⛔ One heavy job at a time.
  Before each bake check load < 8 and `memory_pressure` free ≥ 40%, pass `--max-old-space-size` explicitly, and abort
  under 30%. Huron last took ~35 min / ~7.9 GB. If the window closes, the Huron bake waits for the evening; the
  ~40 s captures do not.
- Work in the `rings-only` worktree. Don't edit `cartograph/groundDeformer.mjs` on main.
- No fallbacks: a crossing that won't land on the lattice refuses loudly. A tolerance that merely fits one town is a
  Class D constant (`CLAUDE.md` Layer 0); derive it from `lattice.js`.
- Commit by pathspec only. Write "cause not established" for anything you didn't measure. The commit names the
  register it reached, or says "reaches no register".

## 5. Done when

Huron's and HPDM's ground bake on this construction without refusing. Cairn's check is green on all four towns after
being seen red. The commit removes what it replaced.
