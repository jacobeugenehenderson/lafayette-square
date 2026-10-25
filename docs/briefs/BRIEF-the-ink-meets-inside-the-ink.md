# BRIEF — the ink meets inside the ink: no sub-ink edge between two owners in ①

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-24 (Boz)
evict-when: `node checks/claims-no-sub-ink-edge-between-two-owners.mjs --mutants` and `node checks/claims-a-chain-cut-keeps-its-owner-change.mjs --mutants` are GREEN on every poured town and their mutants RED; offsetRingByRects' sub-ink fold is deleted in the same commit; the build is merged to integration. Then this moves to cartograph/_archive/ dated, and BACKLOG's ① seam entry goes with it.
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds. Check with `ListAgents`, then `/rename`.
**Agent: FRESH.** The mint has not been touched by any live seat; a warm seat would bring the corner/band context, and that context is the wrong layer here.
**Report to Boz.** **Instruction: confirm-then-build.** Read the canon and the code below, then tell Boz what you found. If the code contradicts this brief, **stop and flag Boz. The stop is the deliverable.**
**Premise pass: Zob, 2026-10-24, on dcfb098d; the builder's (Splice, on dd150173: the second fold, both booleans); corrections folded in.** Claim 2 FAILED as first written (below); the brief now carries the fix.

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
`place.mjs` sorts the class into four buckets, and the presence check adds a fifth symptom:
- **(a) A pure chain cut** (degree 2, both chains end). The largest bucket on every town, mostly 4.5–6.7 mm edges.
- **(b) A real node** (degree ≥ 3).
- **(c) A rim↔water join** (`__boundary__` → `__water__`; Huron, PTown).
- **(d) Unplaced chain edges.** A handful of named exhibits; **cause not established.**
- **(e) ⚠️ The ink is BROKEN at a chain cut (Zob, measured).** At some near-straight degree-2 cuts (bends of about 6°) the two
  strokes don't touch. One block ring wraps both chains' butt ends and runs through the street, so the blocks either side
  are one ring. Cause not established. Exhibits: LS `south-ewing-avenue-0|papin-street-5` (-713.034, -920.418); Huron
  `meeker-street|temper-avenue` (1281.696, 553.452). It's part 1's ground (join the cut), and the presence check catches it:
  ```
  node checks/claims-a-chain-cut-keeps-its-owner-change.mjs --mutants   # RED today on every town, mostly missing on BOTH sides
  ```

## 1. Read first (in full, these sections)

- `ORIENTATION.md §3`: ① the protopolygon, and the fe walk and stamp.
- `cartograph/SECTION.md`: the numbered rules, **5 and 6** (*a chain cut is not a corner* · *a corner is a vertex where ① TURNS*).
- `cartograph/SKELETON.md`: the block *"AND ITS HOME IS THE MINT"* + *"THE ONE ORDERING CONSTRAINT, AND IT IS THE AUTHORING KEY"*.
- `cartograph/RIBBONS.md §1`: the four invariants, and the anti-patterns (*"❌ Snapping or editing chain endpoints"*).
- `cartograph/SURVEY.md §3`: steps 1–2.

## 2. Premises: claims for Zob, then for you (by symbol)

1. **PARTLY (Zob, read).** `tileGround.js#mintProtopolygon` builds one ring per chain (a right pass and a left pass, with
   a butt at each end) and unions them all at once in `#booleanLabelled`. The coast arcs (`WATER_EDGE_SKEL`) go through
   the same stroke. The butt corners sit up to **`subInkLen`** outside the neighbour's ink, not just "one step": the
   class runs to 6.71 mm.
2. **FAILED as first written (Zob, measured + read).** Owners are per VERTEX in the mint: `stamp(side, i, segI)` gives
   each one skelId, side, segOrd = `segOrdAt(ci, segI)`, srcIdx, hard, tipEnd and cap/gradeEnd/water. `labels` are per
   edge (labs[k] names edge k→k+1). `iaEdge`/`tile.runs` are downstream readers. So a joined stroke CAN carry two skelIds,
   if each vertex keeps its original (ci, i). **But a zero-turn label vertex does not survive the union.**
   `booleanLabelled` builds `new Clipper()` with no init options, so PreserveCollinear is false, and Clipper drops any
   vertex that sits exactly on a straight line (fixture: a label vertex on a straight stroke, 4 vertices out; with
   `ioPreserveCollinear`, 6). Today's near-zero-turn label vertices survive only because grid rounding leaves them
   slightly off the line. Exactly-collinear ones are already dropped, leaving no trace in the output.
   ▶ the count of near-collinear survivors: Zob's file-only read (to be promoted with the presence check, §4).
   ⇒ Remove the butt poke without a carrier, and a chain cut's owner change silently disappears, merging two
   frontages. That fails Layer 0 q2.
3. `tileGround.js#offsetRingByRects` drops every ① edge shorter than `#subInkLen(eps)` and keeps a dead-end butt
   (exactly 2ε). `turnOf` and `protoRAt` do not drop them. So two readers of ① disagree about whether these edges
   exist (Zob, read in source).
4. Segmentation (`resolveChainSegmentation`) runs FIRST in the mint, on the uncorrected chain, and the `segOrd`s come from it.
   A geometry change made after it must not move an ordinal.
5. **The code follows SECTION; RIBBONS §3.2–3.3 is ROT (Zob, read).** `protoRAt` decides a corner by the turn
   (*"A CORNER IS WHERE THE CONTOUR TURNS. NO IDENTITY AT ALL"*); `classifyCornerLegs` only classes an existing ease as
   junction or bend. Boz evicts the RIBBONS line. ⚠️ A stale CODE comment above `rings2 = offsetRingByRects(…)` says
   *"On ①'s block ring the owner change IS the corner"*. **Excise it in your commit.**

## 3. The fix, at the source

**The rule, one sentence:** every ink stroke that meets another meets **inside** its ink. That covers chains, the boundary and water.
0. **First, the carrier (Boz, 2026-10-24; Jacob may veto).** Build BOTH of the mint's booleans (the union R and the difference D against the frame; Clipper strips collinear vertices from
   clip paths too, Splice, read) with `ioPreserveCollinear`, opt-in through the same options object as `sameStroke`, so the
   other callers stay byte-identical, so an owner change on a straight run is a vertex by construction, never by
   rounding luck. Every ① changes bytes. The tranche re-pours every town anyway, so the frozen consumers re-baseline
   there. ⚠️ Preserved collinear vertices can also make short same-owner edges. Measure them against `subInkLen` before
   you delete the fold (step 4). If they reach ②, stop and flag. If PreserveCollinear proves unworkable, stop and flag:
   another carrier is a design call for Boz, not one to improvise.
1. **Chain cuts (a):** join the chains at a degree-2 cut into one stroke **before stroking**. Each joined vertex keeps its
   original (ci, i), so `segOrdAt` is asked in the chain's own indexing (claim 4). The owner change rides on the
   preserved label vertex (step 0). Inside a joined stroke, `sameStroke` keys on the STROKE, not on skelId equality, or
   containment re-owns across the join. Cap marks, `tipOf` and `gradeEndOf` stay on the true ends only. ⛔ Never snap or
   move a chain endpoint (RIBBONS anti-pattern), and never write `streets[].points`.
2. **Real nodes (b):** build each node's outline once, from all its legs, or end each leg's stroke inside its neighbours'
   ink. Choose one and say why. ⛔ Never a union followed by a merge.
3. **Rim↔water (c):** the same rule, applied to the boundary and water strokes in the mint.
4. **Then delete BOTH folds**, `offsetRingByRects`' and `taperWorkingCopy`'s first loop (it runs first, on the same ring;
   Splice, read), and `subInkLen` itself if nothing else reads it, **in the same commit**: the predecessor goes.
   ⚠️ Delete it only once the check is 0, or ② will read the edges unfolded.
3a. **One rule for the ink's width (Boz, 2026-10-25):** a true offset (miter) at EVERY bend of every stroke, so the ink is ε wide
   everywhere. Plain bends today leave it ε·cos(β/2) wide, and at sharp coast vertices that leaves water↔water sub-ink loops.
   A named refusal past a miter bound, counted and never clamped. Corner gates on LS first, with every change explained by a
   mitered bend.
3b. **The reversed-face label shift (pre-existing; a kit class, ruled 2026-10-25):** after D the mint reverses positive-area faces
   without rotating labels, so a street edge leaving a frame run is stamped `__boundary__` (a town whose disc reaches its bb would
   lose that curb). The fix is in `booleanLabelled`'s `segs` path only (the two sameStroke callers, R and D). A surviving vertex
   walked backward is labelled by the input edge it lies on. Set it in `res`, NEVER in `raw` (the minted fallbacks read raw[j] of
   the next surviving vertex). Rotate in both reversal branches (outer + hole). The other three callers stay byte-identical
   (Zob, read). Gate: off-bb `__boundary__` edges 0 on every town (Splice's rimoff.mjs, promoted with a mutant), keys identical.
5. **Unplaced (d):** report what steps 1–3 leave of each exhibit. Don't chase them before 1–3 are built.

**Acceptance is 0 at `subInkLen` for the construction class, on every town (Boz, 2026-10-24; narrowed by §5a, 2026-10-25).** ⛔ If the fix can't reach 0, stop and flag. The
bar is not lowered: once the fold is gone, anything under it reaches ② unfolded.

5a. **A crossing that lands within `subInkLen` of a stroke's vertex or end is TRUE GEOMETRY (Splice, measured; ruled Boz
   2026-10-25, vetoable by Jacob).** One mechanism (JH tertiary × motorway-link is a tessellated vertex 3.3 mm away). The exact ε
   inks' union really has that short edge, so removing it needs a mm "near enough" tolerance, which the rounding rule forbids. So:
   the sub-ink check's claim narrows to the CONSTRUCTION class. It allows a sub-ink edge only where two centrelines cross within
   `subInkLen` of a vertex or end of one stroke, by an exact predicate computed from the polylines (⛔ never a site list), printed on
   its own "true geometry" line (Zob changes the check; a planted butt beside a 5a site stays RED). **The folds go**, and ② must
   take a true short edge: the corner gates at the 5a sites (HPDM, JH) test it. A faked corner there is a ② defect, never a
   reason to restore the fold.
   *Not this brief's* (filed for their own briefs): `skeleton.js#gradeFacts` marks a chain off-grade only if EVERY source way is
   (a part-tunnel chain inks at grade) · `streetClass.js#isArea` reads only `area=yes`, so a highway multipolygon (JH Diversity
   Plaza, 21237405) is chained as a street.

## 4. Gates

- `node checks/claims-no-sub-ink-edge-between-two-owners.mjs --mutants`: GREEN on every poured town. Its mutant (today's
  mint) must go RED. Altadena has no protopolygon and counts RED loudly; that's correct, leave it.
- **Every chain cut's owner change is a ① vertex, on both sides:** `node checks/claims-a-chain-cut-keeps-its-owner-change.mjs --mutants`.
  It is RED today, and must be GREEN after your build. Report what happens to the (e) exhibits.
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
