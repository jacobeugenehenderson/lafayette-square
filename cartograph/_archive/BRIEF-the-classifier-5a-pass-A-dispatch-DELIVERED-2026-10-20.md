# BRIEF-the-classifier §5a — the Pass A dispatch (DELIVERED, retired 2026-10-20)

*Retired from `docs/briefs/BRIEF-the-classifier.md` when its §5b (classifier step 7) was written. Pass A was delivered by Tally on branch `classifier` (6429ac08 … 748b8e92; merged into integration/2026-10-20). The live brief is `docs/briefs/BRIEF-the-classifier.md`.*

## 5a · This dispatch: Pass A, classification only (until §5 is ruled)

- **Read first:**
  1. `CLAUDE.md` Layer 0, `ORIENTATION.md`, `README.md §⭐ START HERE`;
  2. this brief;
  3. `scratch/style-guide/CLASSIFIER-SITES.md` and `AUDIT.md`;
  4. `STYLE-GUIDE.draft.md` §0, §1 and §4. This is the vocabulary; it is a draft and replaces nothing.
  5. `PIPELINE` step 3 and §6a.
- **Build:**
  - the one vocabulary table;
  - `class` · `classRung` · `classReason` on every chain, decided in `skeleton.js` before `groupByName` /
    `seedSection`; an unknown class refuses by name;
  - the check's Pass A part, mutation-tested.
- ⛔ **Change no paint.** The consumers keep their behaviour until §5 is ruled; say in each commit that the old sites
  still stand.
- **Then STOP and report:**
  - the class counts per town;
  - the rewiring plan per consumer (its symbol → the class column it reads → the old site it deletes);
  - the §5 ruling each step needs.
- **Where:** a worktree at `.claude/worktrees/classifier`, on a new branch `classifier` from
  `docs/conformance-2026-09-21`.
  - ⚠ `boz/hpdm-gate` has diverged from it (about 80 commits each way; `tileGround.js` differs by about 1,100 lines),
    so touch `tileGround.js` not at all without asking Boz.
  - ⛔ Not the legacy chain shape pass (a separate retirement).
  - ⛔ Not derive's `roadId`.
- **The house rules:** `CLAUDE.md`, plus the machine-wide heavy-job gate:
  - start at ≥70% free and load <8, abort <30%, explicit heap;
  - ask Boz before a heavy run;
  - a one-town skeleton + derive pour is heavy.

  ⛔ Never write `cartograph/data/lafayette-square/clean/`, nor any town's `clean/`, without Boz. No bake, Publish,
  Stage or Promote. Commit by pathspec, never push, and name the register in every commit.

