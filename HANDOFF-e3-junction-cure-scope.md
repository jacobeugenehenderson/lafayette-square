# HANDOFF — E3 (scope/spike): the junction cure — one root, or several?

**This is a SPIKE, not a build.** Deliver a plan doc (`JUNCTION-CURE-PLAN.md`) + a verdict. The question that gates everything: **do the divided fold-at-join, the (false) corner, and the perpendicular-join protrusion (T-bulges + Benton-stem) share a CODE root — i.e., will one cure land all of them — or are they distinct paths?** Jacob's eye unifies them visually (*a path meeting another perpendicularly → a spurious polygon protrusion opposite*); your job is to confirm or refute that in the **code**, then design the cure.

> ⚠️ **The false-corner discipline.** We KILLED a tileGround chain-patch for the false corner (`_archive/handoffs/HANDOFF-divided-false-corner-KILLED-2026-06-05.md`) — *patching chains deeper is forbidden.* The cure is **polygon-first: resolve the junction at prebake, on the constructed-median edge (E2)** — NOT a tileGround fillet hack. And: visually-same ≠ same-code-path until proven. Don't assume one fix; **prove** the shared root.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Read-only/forensic + a plan doc; **no production geometry change.** **Push back** if the unification is wrong (that's the deliverable's value).

> ⚠️ **Data access (worktree trap).** Operator data (`overlay.json`, `skeleton.json`, **`marker_strokes.json`** — the 8 ground-truth marks) is **gitignored**; read from the **main tree's absolute paths** (`/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/lafayette-square/clean/…`). `src/data/ribbons.json` is tracked.

**Read first (to the section):** the **8 marks** (`marker_strokes.json` — Lafayette / S-Jefferson / Geyer; the ground truth) · `cartograph/SKELETON.md §5e` (the false-corner root: *the corner-builder corners the WRONG legs — it should corner the two corridor outer-edge legs, not the carriageway stubs*) · `DIVIDED-CORRIDOR-PLAN.md` (the fold-at-join census: 47 transition ends / 24 nodes, 14 folding; worst = Park×Jefferson) · `cartograph/BACKLOG.md` (the "perpendicular-join protrusion" re-class entry) · `FEATURES.md` (E2 constructed median — the clean edge to resolve against) · `RIBBONS.md §3.1` (divided-transition doctrine) · `HANDOFF-junction-band-thorns-FINDINGS.md` (the band-fold class — rule it in or out). Code: `tileGround.js` `extractFaces` (the face-walk — does it emit the carriageway stub as a vertex?), `filletRing` (the corner rounder — which legs does it corner?), the band/`iW` fold; the constructed median (`medians[] kind:'median'/'merge'`).

**The spike:**
1. **Forensic, one instance each, traced to its code locus:** (a) a divided **fold-at-join** (S-Jefferson or Lafayette, from the marks); (b) the **false corner**; (c) a **perpendicular-join protrusion** (Benton-stem + one T-bulge). For each: what construction step manufactures the spurious geometry — `extractFaces` (a stub becomes a face vertex)? `filletRing` (wrong legs cornered)? the band fold? Pin file:line.
2. **The verdict (the whole point):** do (a)/(b)/(c) come from the **same** construction defect (→ one cure) or distinct ones (→ several)? State it with evidence. Rule the **band-fold thorn** class in or out (is the T-base bulge the same as the band-fold, or different?).
3. **Design the cure — polygon-first.** Generalize SKELETON §5e ("corner the corridor outer-edge legs, not the stubs") to **every perpendicular junction**, resolved at **prebake** against the E2 constructed-median edge. No tileGround chain-patch. Show how it lands each of (a)/(b)/(c).
4. **Foundation check:** does E2's constructed-median **transition edge** (the noses/merge regions) suffice as the cure's input, or does the median need a targeted touch-up first? (Jacob shipped the median imperfect — flag if any imperfection sits where E3 builds.)
5. **Validate against the 8 marks** — project the proposed junction geometry vs the traces; report the residual per mark.
6. **Decompose** into build steps (+ what E4 rip-out / D2 freeze each depends on).

**Deliverable:** `cartograph/JUNCTION-CURE-PLAN.md` (committed) — the per-artifact loci, the shared-root verdict, the polygon-first cure design, the foundation check, the mark-validation, the decomposition. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** building the cure (the build brief follows this spike) · the median refinement (parked) · D2 full face-freeze · E4 rip-out · brief F (north-void).
