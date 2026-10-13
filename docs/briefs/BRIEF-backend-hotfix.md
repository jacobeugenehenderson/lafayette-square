# BRIEF — the backend hotfix: close the holes that are live today

<!-- BRIEF-STATE
status: OPEN
dispatched: (Jacob, FRESH)
written: 2026-10-13
evict-when: RULING: Jacob has deployed the hotfix, the live script matches the reviewed patch, every exposed device key is rotated, and SECURITY.md F-24/F-25/F-26/F-27/F-29 each read CLOSED with the command that proves it.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>` in BOTH repos, then `/rename`). **Agent: FRESH.**
**Report to Boz.** Hinge, who drafted the hotfix on 10-07, is gone; everything Hinge did is committed.

**Instruction: confirm-then-build.** Every premise below is a claim. Check each one against the code and say what you
found. If the code contradicts this brief, stop and flag Boz.

## 1. Why (Jacob, 2026-10-13)

*"that editing/security issues are quite serious."* On 10-07 Jacob said security could wait, *"but not tonight"*, and
that it *"should be recorded carefully and we should do concerted work"*. The record is complete, and this brief is the
concerted work.

## 2. The state, as read by Boz on 2026-10-13

- **Live today, all unfixed:** the findings are in the kit's `SECURITY.md`. Read F-24 through F-29 in full.
  - **F-24 CRITICAL:** request values are written into the sheet as formulas.
  - **F-27 CRITICAL:** device keys are served publicly in events and reviews.
  - **F-25 HIGH:** `listing-staff` hands out staff keys.
  - **F-29 HIGH:** any well-formed unknown tenant id makes the backend create tabs, even on a read, and every town
    shares one spreadsheet.
  - **F-26 MEDIUM:** `savedesign` checks no caller.
- **The draft:** theward (`~/Desktop/dev.nosync/theward`), branch `wip/backend-hotfix` (1fdc673),
  `backend/apps-script-hotfix-2026-10-07.DRAFT.patch` against the kit's `apps-script/Code.js` @ d958cc79, with
  `backend/hotfix-harness.mjs`.
  - It covers F-24, F-27, F-25 and the look's format.
  - It is UNREVIEWED.
  - Its header records 20 assertions passing on the patched script, 15 failing on the live one, and 10 mutations caught.
- **The larger sign-in patch** (`backend/apps-script-2026-10-07.patch`, v3, on theward main) is NOT this job. It
  rebases on the hotfix afterwards, with the third review's N1–N6. Read its header for the plan; don't touch it.

## 3. The work

1. **Confirm** the draft still applies to the kit's `apps-script/Code.js` (it was last touched at d958cc79; check
   nothing has moved since). Re-run its harness and see the reds on the unpatched script.
2. **Add F-26:** `savedesign` requires the caller to be staff of that business, by the same per-action gate the other
   staff writes use. Add **F-29:** refuse any tenant id outside the one registered set, and never create a tab on a read.
   Each gets harness assertions that are seen red on the live script, plus a mutation of its fix.
3. **The old player's "you":** the kit one-liner `PlaceCard` isMe reads `s.is_me`, so the staff panel keeps its
   "you". It's a kit commit, by pathspec.
4. **The deploy steps for Jacob**, written into the patch header, in order:
   - the predeploy audit (read-only, in the editor, then deleted);
   - the apply;
   - the push;
   - a live smoke test that reads nothing private;
   - the key rotation owed after F-27.
5. **Then stop.** Boz dispatches a SECOND fresh agent to review the hotfix adversarially. Its findings come back to you
   through Boz.

## 4. Bounds

- ⛔ **No deploy, no `clasp push`, no request to the live backend.** The harness runs against in-memory Sheets only.
  The deploy is Jacob's hands, with his go.
- ⛔ **No exploit detail in any doc, commit or message:** no request shapes, no real tenant ids. SECURITY.md carries
  the finding and the fix shape only.
- **Writes:** theward branch `wip/backend-hotfix` (the patch, the harness, the header); the kit's `SECURITY.md` (status
  lines); the kit's `PlaceCard` one-liner. Nothing else in either repo.
- Commit by pathspec, and check each commit's name-status. Never commit to theward main.
- Swale and Cairn have the machine for ground bakes. The harness is light, but wait while load > 8.

## 5. Done when

The reviewer's findings are fixed and re-reviewed. Jacob has the deploy steps in the patch header and has deployed.
Each SECURITY entry reads CLOSED with its harness command, and the key rotation is done or scheduled by Jacob.
