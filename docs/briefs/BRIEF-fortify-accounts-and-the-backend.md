# BRIEF — fortify accounts and the backend: hosts are scanning codes now

<!-- BRIEF-STATE
status: OPEN
dispatched: Plumb (2026-10-30, Boz)
evict-when: every OPEN finding in SECURITY.md that touches the Ward's backend (the Apps Script, its sheets, the codes and links people
scan) is CLOSED with its proving command, or deliberately deferred by Jacob by name; each fix deployed by Jacob and verified live.
-->

**Report to Boz. Zob reviews every change.** Confirm-then-build: read SECURITY.md and the code it names before any plan.

## 0. Why (Jacob, 2026-10-30)
*"The canonical ID issue is that we've been in development and the records have come and gone and we're finally a bit more
stabilized. In fact: we should move to fortifying accounts and the back-end now; we have hosts and others who might be scanning
codes now."*

## 1. Where it stands (read; re-confirm)
- IN FLIGHT, not yours: the hotfix (F-24 formula injection, F-25 staff keys, F-26 savedesign, F-27 device keys served publicly,
  F-29 unknown tenants) + Jacob's recovery link (F-31), Ward building on theward wip/backend-hotfix, Zob reviewing. Live v71 has
  none of it (`scratch/apps-script-live/Code.js` = integration's apps-script/Code.js in code, measured 2026-10-30).
- OPEN on the Ward's backend, per SECURITY.md §3 headings: F-19 (bulletin server gaps) · F-20 (admin token in a URL) · F-21 (a
  Guardian sets their own rating) · F-22 (a 6-char link code; Ward reads it as fixed to push-only: confirm on live) · F-23 (any device
  makes itself a verified resident; the Ward prints /home/<id> with no per-building secret, against the ruling) · F-30 (a thread on an
  anonymous post reveals its author).
- The model: no accounts by design; identity = a device key (a bearer credential) per browser origin; handles are global.

## 2. The work, in order
1. **Rank, read-only:** for each open Ward-backend finding, re-measure on the LIVE code (v71) and the hotfix tip: still open? its
   real exposure now that hosts scan codes? the smallest fix that closes the class for any town? Bring one ranked table to Boz.
2. **The rulings owed to Jacob, named with options:** F-23's home code (a per-building secret, or the neighbour verification), and any
   other where intent decides.
3. **Fix in ranked order** on top of the hotfix branch (one backend deploy per sitting, not a stream), each with a source-reading check
   and mutants, plus a live probe for after the deploy. SECURITY.md rows move to CLOSED only with the proving command.
4. **Cary (Supabase commerce) is OUT of scope** unless Boz says so: it's undeployed (BACKLOG: commerce blocked on deployment).

## 3. Bounds
Branch off the hotfix branch's tip once Ward lands B (ask Ward for the sha), in `.claude/worktrees/`; `git commit -- <paths>`. ⛔ No
deploy, no live write, no secret in any message: deploys and secrets are Jacob's, given as exact steps. Live probes are read-only
and only after Jacob's deploy.
