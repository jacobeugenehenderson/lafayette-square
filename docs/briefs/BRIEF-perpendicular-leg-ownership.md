# BRIEF — every piece of a perpendicular corner has an owner

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-20
evict-when: refusedPerp is 0 on every town with perpendicular corners (live norm), the five mutants below each go RED, and the build is merged to integration; then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds (`ListAgents`,
then `/rename`). **Agent: FRESH.** The design is settled and written here, and nobody's window carries the context.

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

1. **Carry the owner from construction.** Each extension and each cut keeps `spanOfSrc(p.si, i)` of the leg edge that
   built it. Nothing is found by distance (A15: never by nearness).
2. **The crossing square**, where the two legs' extensions overlap, is one piece owned by **both** legs [A, B].
3. **One-pad hull ground** that lies in neither leg's quad goes to the **corner's arc span** (Jacob).
4. **Ground inside another span's cell** (an extension running into the other leg's or a third span's cell) is
   **shared** by every span whose own rect holds it: the existing rule. ⭐ To get that, the extension must enter
   `bandPiecesOfTile`'s arrangement **as leg A's own rect, alongside the cells**. A separate pass after the cells would
   hand the overlap to the cell alone.

Rejected: giving the crossing to the arc (its walk is zero-width on a perpendicular arc); one leg by a tiebreak rule;
extending the cells (reopens ②); nearest cell or arc (forbidden).

## 2. Canon to read first, by section

- `cartograph/SECTION.md §6.1` (the perpendicular corner: "only each leg's own band, extended"; "no constructed primitive").
- `cartograph/RIBBONS.md §1` (the invariants, and the 2026-10-18 rider).
- `cartograph/SKELETON.md §0.1`.
- `cartograph/STYLE-GUIDE.md §6–§7` (corners, cuts).

## 3. Code sites (src/lib/tileGround.js on integration; cite symbols, not lines)

1. `sectionPassProtoTile`: `legExt(p, i, atEnd, …)` builds each extension from one leg edge. The owner is dropped at
   `walkX.push(w)` / `envX0.push(e2)`. Keep `{ ring, span: spanOfSrc(p.si, i), corner }`.
2. The ramps loop and the one-pad block in the same function: each quad keeps its leg's span; the hull minus both quads
   is emitted with the arc span.
3. `bandPiecesOfTile`: the `for (const g of (perp || []))` branch and `sectors` are the dead 10-17 sector model
   (`perp` is always `[]` since 6c048fdf). Rewrite that branch in place for the extension records and **delete** the
   sector code and the header lines describing it (fix in three parts, `CLAUDE.md`).
4. `buildTileGround`'s census and warn line: the "(leg ownership not built)" clause and the "(the corner's arc owns the
   crossing)" text go. `perpGround`/`refusedPerp` stay only as the residue count.
5. `checks/claims-the-bands-are-held-by-their-owners.mjs`: a perpendicular clause.

## 4. The chain

- **Trusts:** ①'s edge stamp (`iaStamp` → `runs` → `{skelId, side, segOrd}`, and `iaArc`), via `spanOfSrc`.
- **Trusted by:** the band blend (not yet reading pieces) and the check above. Nothing else reads `bandPieces`.

## 5. Can the instrument see the change?

- ⛔ HPDM, PTown and JH hold a stale frozen `curbCutNorm: "none"` in `clean/ribbons.json` (frozen before cba287c4).
  A pour that reads the frozen ribbons draws no perpendicular corners there. Resolve the norm live the way derive does
  (`resolveCurbCutNorm`), or measure on Huron and LS, whose frozen norms are already perpendicular.
- The probe `scratch/perp-own/` (make.mjs anchors a copy of tileGround.js; `WT` is hardcoded to a removed worktree,
  so repoint it). Measure first, and report before building:
  (a) how many legs' span is an ARC's label (Huron shows `a…` labels on legs);
  (b) why Huron's extension ground in no cell (10,853 m²) exceeds refusedPerp (6,179 m²). Cause not established.

## 6. The check: five mutants, each must go RED

1. The legs swapped. 2. The crossing given to the arc. 3. The hull given to a leg. 4. A leg's span dropped (its ground
refused again). 5. Overlap ground given to one owner only. Plus: refusedPerp = 0 on every town that builds
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
