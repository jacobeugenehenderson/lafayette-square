You're the CLASSIFIER agent. Jacob is dispatching you; Boz (the coordinator session) is your report line. Send your reports to Boz by SendMessage.

**Read first, in order:**
1. CLAUDE.md, especially Layer 0. ORIENTATION.md. README.md §⭐ START HERE.
2. docs/briefs/BRIEF-the-classifier.md (ef13ced9). That is your brief.
3. scratch/style-guide/CLASSIFIER-SITES.md (Lath's code map) and scratch/style-guide/AUDIT.md.
4. scratch/style-guide/STYLE-GUIDE.draft.md §0, §1 and §4, plus §8 for later. It is the vocabulary. It is a DRAFT and replaces nothing.
5. cartograph/PIPELINE.md step 3 and §6a (the second wall).

**Scope: Pass A only, classification only.** Jacob hasn't ruled on the brief's §5 yet, so:
- Build the way-class vocabulary as ONE table, read by everything. It is the guide's §1 list.
- Classify every OSM way the pour admits in cartograph/skeleton.js, before groupByName and seedSection. Write `class`, `classRung` and `classReason` onto every chain in clean/skeleton.json's schema. A name may group ways of one class only; it never makes a class.
- An unknown tag combination refuses the pour by name. No fallback.
- Build the check: checks/claims-every-feature-is-classified.mjs (Pass A part).
  - Per town, it prints the counts per class and per rung, every unclassified way by place, and every contradiction.
  - It reads the table and the frozen record; it never copies them.
  - Mutation-test it: a residential fallback put back, and a name-made chain, must each read RED.
- ⛔ **Change no paint yet.** The consumers (seedSection's section, resolvePedDepths, the caps, the median paint) keep their current behaviour until Jacob rules §5. Wire nothing new to the class beyond the check.
  - This deliberately leaves the old sites standing. Say so in each commit message.
  - Then STOP and report: the class counts per town, the rewiring plan per consumer (site by symbol → which class column it will read → which old site it deletes), and which §5 ruling each step needs.
- Plazas (`area=yes`): classify them. Their pour change (an area fill, not a chain) waits for the ruling too.

**Where to work:**
- Create a worktree at .claude/worktrees/classifier on a new branch `classifier`, from docs/conformance-2026-09-21 (that branch holds the brief and the derive/skeleton work).
- ⚠ boz/hpdm-gate has diverged from that branch (about 80 commits each way; tileGround.js differs by about 1,100 lines). Pass A should touch tileGround.js not at all. If you find you must, stop and tell Boz first.
- ⛔ Don't touch the legacy chain shape pass in tileGround; its retirement is a separate item.
- ⛔ derive's `roadId` is live at ② (classifyCornerLegs → sameRoad). Don't delete or change it.

**House rules (non-negotiable):**
- One heavy job at a time, machine-wide: start only at ≥70% free memory (`memory_pressure | tail -1`) and load <8; abort <30%; explicit `--max-old-space-size`.
  - Other sessions (Lath, Screed, Loess) may hold the slot; ask Boz before a heavy run.
  - A pour of skeleton+derive for one town is heavy.
- ⛔ Never write, move or regenerate cartograph/data/lafayette-square/clean/. Never write any town's clean/ without Boz's say-so; build into scratch or memory for measurement.
- ⛔ Never remove .claude/worktrees/ward-kit.
- No bake, Publish, Stage or Promote. Commit by pathspec, never push. Every commit message names the register it reaches (OPERATIONS / FEATURES), or says "reaches no register".
- No fallbacks; fail loudly by name. Never a per-street list, and never a constant that happens to be right for one town.
- Check authoring (overlay.json, design.json, blockCustoms) before calling anything a defect. The override is the product.
- Write only numbers you measured, with the command beside them. Where a mechanism is unmeasured, write "cause not established".
- A brief's premises are claims. Confirm them against the code first, and stop and flag any mismatch.
- No new folders outside the project; no new dev servers. Pictures for Jacob go beside an HTML page, opened with `open -a Safari`.
- Use they/them for anyone whose pronouns you don't know.
