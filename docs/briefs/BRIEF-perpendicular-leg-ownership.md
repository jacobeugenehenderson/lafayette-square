# BRIEF — every piece of a perpendicular corner has an owner

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-20
evict-when: refusedPerp is 0 on every town with perpendicular corners (live norm), the six mutants below each go RED, and the build is merged to integration; then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds (`ListAgents`,
then `/rename`). **Agent: FRESH.** The design is settled and written here, and nobody's window carries the context.

**Premise pass: Zob, 2026-10-20 night, on d8e1396e; corrections folded in.**

**Instruction: confirm-then-build.** Read the canon and the code below and tell Boz what you found. If the code
contradicts this brief, **stop and flag**: the stop is the deliverable, not a failure.

## 0. What this is

A perpendicular corner (the kit default since cba287c4) draws each leg's walk band straight on past its cell to the
kerb, with a PROWAG cut (1.2192 × 0.6096 m). That extended ground is painted, but no span owns it: `bandPiecesOfTile`
refuses it and the pour warns `… perpendicular leg extension / cut outside every cell (leg ownership not built)`. Nothing
reads the pieces yet, so no wrong height ships today. But the band blend will, and an ownerless region then has no
depth to take. Jacob's goal for the ground (`project_what_improving_the_ground_means`) starts with "no splinters or
holes".

Measured 2026-10-20 on 44b3ab2f (`scratch/perp-own/`, Screed; the region counts include slivers, so trust the m²):
Huron refusedPerp 6,179 m² · LS 45 m² · HPDM 4,532 m² with the norm resolved live (0 with its stale frozen "none").

## 1. The ruling (Boz and Jacob, 2026-10-20), option A of Screed's note

1. **Carry the owner from construction.** Each extension and each cut keeps the owner of the leg edge that built
   it: **`runs[stamps[p.si][i]]`**, where `i` is `c.before` (atEnd) or `c.after`, indexing `p.ring = st.iaFull[p.si]`.
   That is the run `iaJunction`'s legs already read (`stp[eb]`/`stp[ea]`). Carry `stamps[p.si][i]` at push time.
   Nothing is found by distance (A15: never by nearness).
   ⛔ **Not `spanOfSrc(p.si, i)`.** `iaArc` is per-VERTEX and `spanOfSrc` reads the edge's start vertex, so an
   `after` leg reads its own arc (`a<arc>`), and a `before` leg reads another arc's label where arcs abut. Mitre
   measured 2026-10-20: Huron 1,160 of 1,781 legs, LS 7 of 10. ⛔ Not `cuts[k].serves[0].leg` (the CROSSED street,
   no `segOrd`), not `junctions[j].legs` (drops `segOrd`). An arc edge's stamp carries `lIn` for its first half
   and `lOut` for its second, so the stamp says which half an edge is in, not that it is an arc.
   ⭐ **Verified against an independent oracle** (Mitre, `scratch/perp-own/run3.mjs` on `mitre/perp-leg-ownership`:
   a first-hit ray from the leg edge's midpoint to the ribbons' own centerlines, used only to judge): Huron 1,778 of
   1,781 right, 1 wrong (an `after` leg on a 0.0 m edge, where the midpoint ray itself may be what fails; cause not
   established), 2 unresolvable · LS 10 of 10. The side agrees with the centerline crossing on every right leg.
   ⚠️ **OPEN, Jacob's call before building:** the CELLS carry the same wrong key. Every source edge whose start vertex
   lies on an arc takes the arc's span in `bandPiecesOfTile` (LS 710 of 15,934 edges, Huron 1,651 of 55,175; on
   708 and 1,632 of them leg and arc share one span, so `o.depths` merges the arc's depths into the leg's). It reaches
   no pixel today: nothing outside `tileGround.js` reads `bandPieces`, and `groundDeformer.mjs` reads `iaArc` per
   vertex correctly. Spans are compared as STRINGS in `bandPiecesOfTile` (`runsOf`, the `align` LCS, `byRects`'
   `bands`), so the extension's 0.5 m `back` overlap with its own leg's arc-keyed first ② edge becomes a face marked
   'shared' whose two owners resolve (through `ownerOf`'s `/t` suffix) to the SAME `{skelId, side, segOrd}`: a
   duplicate owner, not a second one (Zob, read in source; the outcome inferred). Keying the cells by run
   (`'r'+stamp`) makes it one key, and nothing else in `bandPiecesOfTile` needs the `a` prefix on a leg edge
   (inferred). Either this build keys the cells by run too (one key for one leg), or it stays a separate defect and
   the check must accept a duplicate owner.
2. **The crossing square**, where the two legs' extensions overlap, is one piece owned by **both** legs [A, B].
3. **One-pad hull ground** that lies in neither leg's quad goes to the **corner's arc span** (Jacob).
4. **Ground inside another span's cell** (an extension running into the other leg's or a third span's cell) is
   **shared** by every span whose own rect holds it: the existing rule. ⭐ To get that, the extension must enter
   `bandPiecesOfTile`'s arrangement **as leg A's own rect, among the RECTS (`byRects`' `U`/`bands`)**, never as a
   cell: sharing is decided only in `byRects`, a cell keeps `own` and sends its overlap there, so an extension added
   to `raw` would lose that overlap (Zob, read in source). A separate pass after the cells would hand the overlap to
   the cell alone.

Rejected: giving the crossing to the arc (its walk is zero-width on a perpendicular arc); one leg by a tiebreak rule;
extending the cells (reopens ②); nearest cell or arc (forbidden).

## 2. Canon to read first, by section

- `cartograph/SECTION.md §6.1` (the perpendicular corner: "only each leg's own band, extended"; "no constructed primitive").
- `cartograph/RIBBONS.md §1` (the invariants, and the 2026-10-18 rider).
- `cartograph/SKELETON.md §0.1`.
- `cartograph/STYLE-GUIDE.md §6–§7` (corners, cuts).

## 3. Code sites (src/lib/tileGround.js on integration; cite symbols, not lines)

1. `sectionPassProtoTile`: `legExt(p, i, atEnd, …)` builds each extension from one leg edge. The owner is dropped at
   `walkX.push(w)` / `envX0.push(e2)`; `ramps` keeps `{c, p, A, B, quad}` and `perpPieces` `{c, p, quad}`, with no
   stamp, and the hull `H` merges two legs. Keep `{ ring, stamp: stamps[p.si][i], corner }` and resolve the owner as
   `runs[stamp]` (§1.1). The `ends` record already holds `{c, p, i, atEnd}`. ⛔ Two `continue`s in the extension loop
   (`bareAt(p, i)` and no densified sub-edge) drop a leg with no count: count them into the residue, never skip
   silently (Layer 0 q2).
2. The ramps loop and the one-pad block in the same function: each quad keeps its leg's span; the hull minus both quads
   is emitted with the arc span.
3. `bandPiecesOfTile`: the `for (const g of (perp || []))` branch and `sectors` are the dead 10-17 sector model
   (`perp` is always `[]` since 6c048fdf). Rewrite that branch in place for the extension records and **delete** the
   sector code and the header lines describing it (fix in three parts, `CLAUDE.md`). Dead with it: `census.landings`
   and `landingCross`, which only that loop increments.
4. `buildTileGround`'s census: the "(leg ownership not built)" clause in the `C.refused` warn, and the `landings … (the
   corner's arc owns the crossing)` text in the console.log after it (it prints the dead counters, so always 0), go. `perpGround`/`refusedPerp` stay only as the residue count.
5. `checks/claims-the-bands-are-held-by-their-owners.mjs`: a perpendicular clause.

## 4. The chain

- **Trusts:** ①'s edge stamp (`iaStamp` → `runs` → `{skelId, side, segOrd}`), read at construction (§1.1); `iaArc` only for the hull's arc span (§1.3).
- **Trusted by:** the band blend (not yet reading pieces) and the check above. Nothing else reads `bandPieces`.

## 5. Can the instrument see the change?

- ⛔ HPDM, PTown and JH hold a stale frozen `curbCutNorm: "none"` in `clean/ribbons.json` (frozen before cba287c4).
  A pour that reads the frozen ribbons draws no perpendicular corners there. Resolve the norm live the way derive does
  (`resolveCurbCutNorm`), or measure on Huron and LS, whose frozen norms are already perpendicular.
- The probe `scratch/perp-own/` (make.mjs anchors a copy of tileGround.js; `WT` is hardcoded to a removed worktree,
  so repoint it). Measure first, and report before building:
  (a) ✅ answered (§1.1): the stamp names the leg; `spanOfSrc` does not.
  (b) why Huron's extension ground in no cell (10,853 m²) exceeds refusedPerp (6,179 m²). Cause not established.

## 6. The check: six mutants, each must go RED

1. The legs swapped. 2. The crossing given to the arc. 3. The hull given to a leg. 4. A leg's span dropped (its ground
refused again). 5. Overlap ground given to one owner only. 6. An `after` leg labelled as its own arc (the owner read through
`spanOfSrc` instead of the stamp). Plus: refusedPerp = 0 on every town that builds
perpendicular corners.

## 7. Bounds

- Branch off `integration/2026-10-20` in a worktree under `.claude/worktrees/`; commit by pathspec
  (`git commit -- <paths>`); every commit names its register or says "reaches no register". Never push. Don't merge
  to integration: Boz does.
- ⛔ No bakes into `public/baked`, no Publish/Stage/Promote, and never write `cartograph/data/lafayette-square/clean/`.
- **Heavy jobs** (a pour is 1.5–3.4 GB): one at a time across the machine; start at ≥65% free memory and load <8,
  abort under 30%. Lath may hold the slot tonight for bakes; ask Boz before starting one.
- Measure before writing: a number without its command is not written down; an unmeasured mechanism is
  "cause not established".
- Surface scope drift; don't absorb it. Step 7 (`BRIEF-the-classifier.md §5b`) is a separate build.

## 8. Report to Boz

What you confirmed or contradicted · (a) and (b) measured · the commits · refusedPerp before and after per town · each
mutant RED · the registers reached (SECTION §6.1 at least, and FEATURES only if the capability changes).
