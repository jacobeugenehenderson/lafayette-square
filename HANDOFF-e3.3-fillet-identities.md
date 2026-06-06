# HANDOFF — E3.3: fillet identities (round the outer legs, not the stubs)

**Goal:** make `filletRing` corner the **identified outer-edge legs only** at constructed nodes — never the carriageway stubs or cross legs. This is the original §5e fix ("the corner-builder corners the WRONG legs"), now **trivial**: E3.1 already stamped the corner identities (`outer` / `cross` / `stub` legs per node) into `ribbons.junctionMap`; E3.3 just teaches `filletRing` to read them. It completes the junction-corner cure (the divided-transition / park corners) that E3.2 set up.

**Root (settled, do not re-derive):** the false corner = `filletRing` rounding a carriageway *stub* against the cross-street instead of the corridor's clean outer-edge legs (`SKELETON.md §5e`). E3.2 de-tapered the strokes + built aprons; E3.3 fixes the **corner rounding** to use the right legs. The identities are already a frame fact (E3.1).

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Build-then-verify. **Push back** if the framing's wrong.

> ⚠️ **Data access (worktree trap).** Operator data (`overlay.json`, `skeleton.json`, `marker_strokes.json`) is **gitignored** — read from the **main tree's absolute paths**. `src/data/ribbons.json` is tracked (carries `junctionMap`). Harnesses: `scratch/voussoir-*.mjs` + `scratch/trammel-*.mjs` (git-tracked). The operator's correct-target legs: `scratch/correct-target-mississippi-lafayette.json`.

**Read first (to the section):** **`cartograph/JUNCTION-CURE-PLAN.md` §6 E3.3 + §3** · `SKELETON.md §5e` (round the corridor outer-edge legs, treat a divided corridor as ONE road at the corner) · the **`ribbons.junctionMap` corner identities** (each node's `outer` / `cross` / `stub` legs — E3.1's stamp; E3.2 consumed continuity/aprons, E3.3 consumes **corners**) · the 8 marks. Code: `tileGround.js` `filletRing` (L88 — the corner rounder to teach) + **how E3.2 consumes the junctionMap** (mirror that consume-by-identity pattern for corners).

**The build (build-then-verify):**
1. **`filletRing` reads the junctionMap corner identities** at constructed nodes: round the **identified outer-edge legs** together (the corridor treated as one road at the corner), **never the carriageway stubs**. Where a node has no junctionMap entry (the 84 plain cross-nodes), `filletRing` behaves exactly as today.
2. Keep it minimal — the identities are stamped; this is wiring `filletRing` to honor them, not re-deriving anything.

**Verify (all three):**
- **Park corners** (Mississippi×Lafayette etc.) land on the operator's correct-target legs — residual ≤ the datum bound (`scratch/correct-target-mississippi-lafayette.json`).
- **24-node sweep** — every constructed divided-transition corner rounds outer legs, no stub fillets.
- **No regression at the 84 plain cross-nodes** — the normal fillet is untouched there. E3.2 joints, E2 medians, and the loops stay clean.
- **Jacob's live eye** (the gate): the park corners + the divided-transition corners read clean (square, no false corner).

**⚠️ Rebuild-drift:** eyes on the render after rebuild (the §5a class). Don't regress E3.2/E2/loops.

**Done:** corners round the outer-edge legs at all constructed nodes — park corners ≤ datum, no stub fillets, no regression at the 84 cross-nodes — **clean on Jacob's eye**. Report residuals (→ E3.4 datum if width-bound). ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** datum repair (**E3.4** — the marked curbs #4/#6/#5/#1/#2 + the innerSign vote-flip; Jacob's method call) · loop role cross-sections (**L.3** — the marked Benton/Waverly) · E4 rip-out · D2 freeze · median refinement.
