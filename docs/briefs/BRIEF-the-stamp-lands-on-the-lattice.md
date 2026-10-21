# BRIEF — the pour fix: the land-use stamp lands on the lattice, and Huron's ground bakes again

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-16
evict-when: RULING: Huron's and HPDM's ground bake on this construction without refusing, and the change is committed on swale/flatten-paths-r1 with the code it replaces removed.
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

## 1a. Ruled 2026-10-17 (Jacob): ONE GRID

The kit cuts on `src/lib/lattice.js`'s 1 mm grid everywhere, the coast and the land use included. Lath found Huron's
refusal is a mat:shore edge on the 1 cm grid beside its own 1 mm twin, about 4 mm apart (23adbb41's report). The coast
moves in this brief. ⛔ UNBUILT for the land use (Zob, read in source and measured 2026-10-21): `derive.js` cuts every
evidence region on its own `SCALE = 100`, a 1 CENTIMETRE grid (all LS and HPDM evidence vertices sit on whole cm).
claims-the-lattice-has-one-home exempts derive's grid by its header, so it can't see this. Likely source of the parcel-vs-OSM
weld class (vertices 0–5 mm off, flat then cut off at 5 mm). CONFIRMED (Zob, HPDM scratch pours, SCALE 100 vs 1000): the 1–6 mm
weld class 2,179 → 11; streets, tiles, protopolygon byte-identical; only landEvidence, alleys and medians move, sub-cm. Being built
(Truss: derive on CLIP_SCALE; Zob: the check's exemption narrows, the codemap rows).
Measured input, NOT matched to this cause: Provincetown's served slab has 4,972 open holes that findTJunctions' end rule
passes. Their median gap is 4.59 mm, mostly shore↔beach/wetland/park (2026-10-18, on the served slab).
▶ `node scratch/ground-budget/tj-class/end-rule.mjs provincetown`

## 2. Where Swale left it (read the record; ⛔ copy no number from it into this file)

- **The write-up is 02da626e's message.** Read it whole: where the crossings are born, the three constructions
  measured, the table per town, and "FOR THE MORNING" items 1–5.
- **The uncommitted work** is in `.claude/worktrees/rings-only` (branch `swale/flatten-paths-r1`): `src/lib/tileGround.js`,
  `cartograph/bake-ground.js`, and the untracked `checks/claims-the-stamp-keeps-its-owners.mjs`, at construction
  (A) + (i). Scripts and captures: `scratch/ground-budget/flatten-r1/` in that worktree (`run-A.sh`, `make-A.py`,
  `onesided*.mjs`, `raw-ev.mjs`, `rim-facts.mjs`). Open board items that are NOT this brief: `BOARD-next-commit.txt`.
- ⚠️ **The branch is behind trunk.** Since 02da626e, trunk gained eb5aa261 (the true-mean terrain read), a083af86 (a
  missing height refuses), and 7c47e8e7 (fetchTerrain). Bring them in before you bake, and say how you did it.
- **Not this brief (Jacob, 2026-10-16):** Cairn's `checks/claims-the-land-is-painted-by-its-evidence.mjs` (5a368a04)
  measures the pour (`derive.js#layerLandEvidence`), upstream of this fix, so nothing here can turn it green. The
  pour-side half (02da626e MORNING item 4) is its own job after this one, poured into scratch.

## 3. The work

> **STATUS 2026-10-21 (Mitre, read in source at integration 70fcb922):** item 1's premise is ROT at HEAD. ② goes onto the
> lattice where it is born (23adbb41, Lath, 10-16, construction B + D: face trim → stampTile → circle), as §3b already notes
> from ce9f3b26. What remains is 02da626e's MORNING item 1 at its FIRST site: the circle cut writes its crossings into iA
> only, never into iaFull, so on rim tiles the bands and the asphalt sit on two copies of one line (LS: 4,202 m, all on rim
> tiles). Being built (Mitre). Items still unbuilt: MORNING 2 (the shallow-angle residual) and 4.1 (derive.js SCALE = 100).

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
   table. LS is not measured; its pour is HELD.
5. **Then the gate bakes** (§4 bounds): HPDM first, then Huron. Report refusals, time against
   `bake-timings.json`, and peak memory.
6. **Stop and bring Boz:** what the code said, the counts, the bakes. Items 2 and 3 of 02da626e's "FOR THE MORNING"
   (the shallow-angle Clipper residual and the dead chain-pass paint) are separate items; raise them, don't fold them in.

## 3b. Tonight's build: the rings agree before flatten (Jacob, 2026-10-20 night: "option 3, building option 1 tonight")

*Premise pass: Zob, on d6443b08; corrections folded in (the √2/2 bound, cross-group only, the placement, the check).*

**Why.** LS's and HPDM's ground bakes refuse at flatten (`bakeGround` → `flattenPaintStack` → `itemsByMembership`:
"a hole below the lattice … that no painted ring holds by its probe, yet a ring of N vertices meets it"). The cause,
measured by Zob at 70eba3f5 (probes in Zob's session scratchpad, `fl/`): a cross-group T-JUNCTION on the lattice. One
ring carries a lattice vertex less than half a step off another ring's straight edge, the edge doesn't carry it, and
`layer − above` emits a 3-vertex sub-lattice hole. HPDM: face:recreation × face:industrial/underived at
(−621.157, 81.411), made in `derive.js#layerLandEvidence`'s parcel difference (`ctDifference(u, [...claimed, ...others])`),
whose rounded crossing lies 0.49 units off the OSM recreation edge. LS: 4 holes on one line near (−703.3, −582.4),
face:recreation × mat:asphalt, 0.22–0.28 units apart, no land evidence within 15 m; the asphalt edge's producer is not
established. The refusal is right (the 10-14 sub-lattice ruling, `4bc6150e`); the inputs are wrong.

**The build (option 1).** NODE the stack before the first difference: every vertex of a ring of one GROUP that lies
within the bound of an edge of ANOTHER group is inserted into that edge, both directions.
- **The bound is (√2/2) · `LATTICE_STEP`** (bake-ground's `LATTICE_STEP = CLIP_SCALE * LATTICE_M`, from `lattice.js`).
  Each axis rounds independently (`_ringToPath`, Clipper's crossings), so a rounded point lies up to √2/2 of a unit off
  the line it traces, as `PROBE_CLEAR`'s own comment says. ⛔ Not ½ (Zob, read in source; the measured offsets 0.22–0.49
  are a sample, not the bound). ⛔ A literal at the call site is Class D.
- **Cross-group only.** ⛔ Never a ring's own edges (a needle narrower than the bound would pinch or self-intersect:
  exactly HPDM's industrial and LS's asphalt needles), nor an outer and its own hole. Same group, different rings is
  unneeded: `layerRegion` unions a group first.
- **Insert only where the vertex projects strictly inside the edge**, several insertions ordered by parameter, and iterate
  to a fixpoint with capped rounds that THROW if it doesn't settle (the `stampCrossings` pattern).
- **Where:** its own exported function on `stackEntries`, before `bakeGround`'s `stackOnly` return, so
  `checks/claims-no-edge-is-drawn-twice.mjs` (which reads `bakeGround({ stackOnly: true })`) sees the noded stack.
  Include DOES_NOT_CUT groups (water); KEEP_OWN_SLOT groups (stripe) change nothing drawn.
- Inserted vertices are existing lattice points (LS's stack: 0 of 149,318 vertices off the lattice, measured; HPDM's
  full stack not measured). ⛔ A vertex further than the bound is untouched and still refuses: this conforms rings,
  it never tolerates a hole. Proper edge–edge crossings stay Clipper's, as today.
- **Count it, loudly:** the bake prints how many vertices it inserted, per group pair. A town where the count is large is
  telling us a producer is wrong.
- **The two drops** in `itemsByMembership` (the orphan and the bow-tie, "a downstream tolerance for an upstream class"):
  measure them after noding on LS, HPDM, Huron and PTown. If both are 0 everywhere, delete them in the same commit
  (fix in three parts, `CLAUDE.md`); if not, report the counts and leave them.
- **LS's asphalt needle, measured (Plumb, ce9f3b26):** born in the rim-tile branch of tileGround's circle stamp,
  `const curb = inside ? (t.iA || []) : cut(t.iA)` with `cut = rings => intersectRings(rings, [MP.boundaryRing])`.
  California's curb edge crosses the rim chord, Clipper rounds the crossing onto the lattice 0.166 mm off the chord, and
  the tile ring gets no vertex there, so `ring − iA` leaves a 12.7 m, ≤ 0.166 mm needle. iA is 100/100 on the lattice
  BEFORE any cut on that tile, so §3 item 1's premise ("iA is FLOAT until the circle cut") does not hold at HEAD, and its
  order (trim → stamp → circle cut) is already built (23adbb41). What remains is the circle cut minting crossings the
  tile ring doesn't share. §3b noding clears the refusal there (inferred); the needle itself is a separate, later fix.
- **Parked (option 2), not this build:** noding the evidence against itself in `layerLandEvidence`, the pour-side
  cleanliness. And LS's asphalt producer, once found.

**The check, which must be written** (nothing in `checks/` runs `flattenPaintStack` and counts refusals per town;
Plumb's census lives in a session scratchpad and writes into the worktree): it runs flatten per town, writing only to
tmp, and carries synthetic rows. Mutants, each RED: (1) noding off → LS's 4 and HPDM's 1 refusals return · (2) a
vertex at ~0.75 step (past √2/2) → still refuses · (3) the bound as a literal → caught by a source-reading row (first
check whether `checks/claims-the-lattice-has-one-home.mjs` already forbids it) · (4) an inserted vertex off the lattice
→ refuses. `claims-no-edge-is-drawn-twice` should show its near-miss count fall.

**Gates, in order:** Plumb's flatten census harness (`flatten-all.mjs`, Plumb's session scratchpad; ~30–90 s per town)
shows LS and HPDM flatten with 0 refusals → scratch ground bakes of HPDM, then LS, reach the end with T-junctions 0
(`claims-the-ground-has-no-cross-polygon-t-junctions --dir=`) → report to Boz. The heavy slot: Kerf holds it for step 7
of `BRIEF-the-ground-stays-in-budget`; ask Boz before any full bake. The census runs are light.

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

Huron's and HPDM's ground bake on this construction without refusing. The commit removes what it replaced.
