# BRIEF — the ink meets inside the ink: no sub-ink edge between two owners in ①

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-24 (Boz)
evict-when: `node checks/claims-no-sub-ink-edge-between-two-owners.mjs --mutants` is GREEN on every poured town and its mutant RED; offsetRingByRects' sub-ink fold is deleted in the same commit; the build is merged to integration. Then this moves to cartograph/_archive/ dated, and BACKLOG's ① seam entry goes with it.
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds. Check with `ListAgents`, then `/rename`.
**Agent: FRESH.** The mint has not been touched by any live seat; a warm seat would bring the corner/band context, and that context is the wrong layer here.
**Report to Boz.** **Instruction: confirm-then-build.** Read the canon and the code below, then tell Boz what you found. If the code contradicts this brief, **stop and flag Boz. The stop is the deliverable.**
**Premise pass: Zob** (owed before dispatch; §2's claims are what Zob answers).

## 0. Why

PTown's deploy bake refuses at the flatten. The site is a **sub-ink edge**: a ring edge of ① shorter than the ink is wide,
lying between two owners. `turnOf` reads it as a turn (PTown Stable Path: a faked 121° corner), and `protoRAt` resolves a
radius there. The same class is on every town. Ruled (Boz, 2026-10-24, under *"① has no nodes"* and *"cut once"*; Jacob:
it didn't need to come to him): **fix it at the mint, never with a post-union snap.**

The class, today (the command is the number; never quote the count):
```
node checks/claims-no-sub-ink-edge-between-two-owners.mjs --mutants      # RED on every town today
node scratch/zob-2026-10-22/place.mjs cartograph/data/<town>/clean/ribbons.json …   # each edge placed by node, with coordinates
```
`place.mjs` sorts the class into four buckets:
- **(a) A pure chain cut** (degree 2, both chains end). The largest bucket on every town, mostly 4.5–6.7 mm edges.
- **(b) A real node** (degree ≥ 3).
- **(c) A rim↔water join** (`__boundary__` → `__water__`; Huron, PTown).
- **(d) Unplaced chain edges.** A handful of named exhibits; **cause not established.**

## 1. Read first (in full, these sections)

- `ORIENTATION.md §3`: ① the protopolygon, and the fe walk and stamp.
- `cartograph/SECTION.md`: the numbered rules, **5 and 6** (*a chain cut is not a corner* · *a corner is a vertex where ① TURNS*).
- `cartograph/SKELETON.md`: the block *"AND ITS HOME IS THE MINT"* + *"THE ONE ORDERING CONSTRAINT, AND IT IS THE AUTHORING KEY"*.
- `cartograph/RIBBONS.md §1`: the four invariants, and the anti-patterns (*"❌ Snapping or editing chain endpoints"*).
- `cartograph/SURVEY.md §3`: steps 1–2.

## 2. Premises: claims for Zob, then for you (by symbol)

1. `tileGround.js#mintProtopolygon` strokes each chain to ε **separately** and unions the strokes. A stroke ending at a
   node or a chain cut leaves its own butt corners, and these can sit less than one lattice step outside the neighbour's ink.
2. Every ① ring edge carries an owner (`skelId · side · segOrd`, via `iaEdge` / `tile.runs`), and **authoring is keyed to
   it**. ⇒ Joining two chains into one stroke must **not** merge their frontages. Where the owner changes along a
   straight run, ① still needs a boundary between owners there, a vertex with **zero turn**. That is a label, not a corner.
   How the mint assigns owners to ring edges today is the premise the whole fix rests on. **Confirm it first.**
3. `tileGround.js#offsetRingByRects` drops every ① edge shorter than `#subInkLen(eps)` and keeps a dead-end butt
   (exactly 2ε). `turnOf` and `protoRAt` do not drop them. So two readers of ① disagree about whether these edges
   exist (Zob, read in source).
4. Segmentation (`resolveChainSegmentation`) runs FIRST in the mint, on the uncorrected chain, and the `segOrd`s come from it.
   A geometry change made after it must not move an ordinal.
5. ⚠️ **Doc conflict, to resolve with Zob:** `RIBBONS §3.2–3.3` reads *"Under ① a corner is where an edge's owner
   changes"*. `SECTION` rule 6 says that wording is RETIRED: a corner is where ① turns. Say which one the code
   (`turnOf`, `classifyCornerLegs`) follows. If RIBBONS is ROT, Boz evicts it; don't edit it yourself.

## 3. The fix, at the source

**The rule, one sentence:** every ink stroke that meets another meets **inside** its ink. That covers chains, the boundary and water.
1. **Chain cuts (a):** join the chains at a degree-2 cut into one stroke **before stroking**. Carry the owner change as a
   zero-turn label vertex on the ring (claim 2). ⛔ Never snap or move a chain endpoint (RIBBONS anti-pattern), and never
   write `streets[].points`. Work on a copy inside the mint, after segmentation (claim 4).
2. **Real nodes (b):** build each node's outline once, from all its legs, or end each leg's stroke inside its neighbours'
   ink. Choose one and say why. ⛔ Never a union followed by a merge.
3. **Rim↔water (c):** the same rule, applied to the boundary and water strokes in the mint.
4. **Then delete the fold** in `offsetRingByRects` (`subInkLen`'s drop), **in the same commit**: the predecessor goes.
   ⚠️ Delete it only once the check is 0, or ② will read the edges unfolded.
5. **Unplaced (d):** report what steps 1–3 leave of each exhibit. Don't chase them before 1–3 are built.

**Acceptance is 0 at `subInkLen`, on every town (Boz, 2026-10-24).** ⛔ If the fix can't reach 0, stop and flag. The
bar is not lowered: once the fold is gone, anything under it reaches ② unfolded.

## 4. Gates

- `node checks/claims-no-sub-ink-edge-between-two-owners.mjs --mutants`: GREEN on every poured town. Its mutant (today's
  mint) must go RED. Altadena has no protopolygon and counts RED loudly; that's correct, leave it.
- **Authoring survives:** `node checks/claims-simplify-preserves-authoring.mjs <scene>` (0 orphaned **and** 0 re-pointed)
  and `node checks/claims-an-authored-key-names-the-same-frontage-after-a-re-pour.mjs`, on every town.
- **Corners unchanged where ① didn't change:** `claims-every-corner-is-one-of-three` and `claims-proto-corner-is-authored-radius`.
  Explain any change by an edge this brief removed.
- **The flatten:** PTown's deploy pour + bake no longer refuses at the flatten (the heavy slot, from Boz, by name).
- The validation surface is **Survey on the production path**, the live ① and ②. ⛔ No parallel SVG or spike tooling.

## 5. Bounds

- Write: `src/lib/tileGround.js` (the mint, `offsetRingByRects`' fold) and its callers, if the signature moves.
  Promote checks to `checks/`. Canon is off-limits: surface conflicts (claim 5) to Boz.
- Commit on your own branch, off `integration/2026-10-20`, with `git commit -- <paths>`. ⛔ Never commit from the shared
  index. Boz merges, on Zob's PASS.
- **No re-pour of every town.** You pour what the gates need. The tranche re-pour is Boz's, once this and
  `kerf/leg-ends-at-ladder` + `kerf/caps-from-shape` are in.
- Overlap: `BRIEF-the-rim-is-cut-once` (Mitre) cuts the **disc**, after the mint. This brief is the **mint**. If your change
  reaches `cutOnce` or `clipAllToStencil`, stop and flag.
- Commit message names the register it reached, or says "reaches no register".
