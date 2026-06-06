# HANDOFF — E3.4: datum repair (frame-side, E1 round 3)

**Goal:** repair the width datums **frame-side** (scripted from the traces — the E1 precedent, NOT Survey-drag), so the smooth-but-misplaced curbs snap to correct width. Two parts: **(1) a systemic fix** (the `innerSign` vote-flip) and **(2) a scoped data repair** of the identified rows + the marked curbs.

> 🎯 **Scope discipline (Jacob, explicit):** *"there's only so much we can do, and there will always be things we miss."* Fix the **identified rows + the systemic cause**; **accept the long tail**; **report what's left** rather than chase every last mark. Do NOT build an exhaustive perfection pass — that's the wrong shape of effort.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Build-then-verify. **Push back** if the framing's wrong.

> ⚠️ **Data access (worktree trap).** Operator data (`overlay.json`, `skeleton.json`, `marker_strokes.json`) is **gitignored** — read from the **main tree's absolute paths**. `src/data/ribbons.json` is tracked. Harnesses: `scratch/voussoir-*.mjs` + `chamfer-*.mjs` (git-tracked). The E1 frame-side mechanism: `cartograph/rebase-overlay-measures.js`.

**Read first (to the section):** **`cartograph/JUNCTION-CURE-PLAN.md` §5** (the trace-implied width rows: laf-1 L→~11.0–11.4, laf-6 R→7.08, laf-5 R→6.52, laf-7 R→9.63, s-jeff per-segment) · the **8 marks** + the BACKLOG "post-E3.2 marks" mapping (#4/#6 Lafayette, #5 S-18th, #1 Missouri, #2 Hickory) · `HANDOFF-e1-custom-width-base.md` (the frame-side pattern: `survey.json`→seed→`rebase-overlay-measures`) · the **innerSign finding** (Alidade E3.1: the global `innerSign` vote flips on snaking corridors — s18-6 verified, physical outer = +x but the vote says inner = +x; the junction map already resolves outer-side **locally per end** against the mate's segment feet; **D1's measure canonicalization still uses the global vote** — fix it the same local way) · Chamfer's hand-forward (terminus/deg-6 corners auto-complete once widths are right — phantom-span gate is datum-blocked, not code). Code: `skeleton.js` (the `innerSign`/measure canon + `stampCustomWidths`), `derive.js` (measure), `tileGround.js` G9 perimFill (mark #2's perimeter width datum: max-side 10.56 vs authored 7.9).

**The build:**
1. **Systemic — the `innerSign` vote-flip.** Make the measure canonicalization resolve a carriageway's outer side **locally per end** (the junction-map method), not the global vote. This is the root of several scrambled divided datums (s18-6 family); fixing it should auto-correct rows *and* unblock the terminus/deg-6 corner construction (Chamfer's hand-forward — verify those corners complete with no further code).
2. **Frame-side data repair** of the identified rows (§5) + the marked curbs (#4/#6/#5/#1/#2) — scripted (the E1 way; pick the cleanest source: corrected `survey.json` rows, or a `rebase`-style trace-repair). Include the **G9 perimeter datum** for mark #2 (north Lafayette).
3. **Stop there.** Don't sweep for unmarked datums; the long tail is accepted.

**Verify:** the marked curbs land at trace width **on Jacob's eye**; marks p90 → sub-meter at the repaired rows; the terminus/deg-6 corners (Truman↔Lafayette, Chouteau×Truman, the deg-6 quadrants) now complete; **no regression** to E3.2/E3.3/E2/loops/the 84 cross-nodes. **Report the residual long tail** (the rows/marks you did NOT fix and why — that's expected, not failure).

**⚠️ Rebuild-drift:** if you regenerate `ribbons.json`, eyes on the render (the §5a class). The live Survey reads `ribbons.json` (bundled — a restart is needed to see it).

**Done:** `innerSign` resolved locally; the identified rows + marked curbs at trace width; terminus/deg-6 corners completed — **clean on Jacob's eye**, long tail reported. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** the loop role cross-sections (**L.3** — the marked Benton/Waverly) · E4 rip-out · D2 freeze · median refinement · any exhaustive/unmarked datum sweep (the long tail is accepted).
