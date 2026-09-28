<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-28
evict-when: test ! -e public/codedesk && echo "kit copy retired"
-->
# BRIEF — CodeDesk: one source, one contract, real procedures

**For:** a fresh agent. **Written:** 2026-09-28 (Warden). **Report to:** Warden.
**Jacob, 2026-09-28:** *"we were doing things very casually and we should probably straighten up and make
real procedures for things."*

## 1. What CodeDesk is, and the problem
CodeDesk is Jacob's QR-code design tool — the styled, printable cards. It is its own product: a static app
embedded live on **jacobhenderson.studio**, and used by the Ward for Guardians' printable cards.
**It exists in three places**, and nothing says which is true:

| Copy | Where | State (2026-09-28) |
|---|---|---|
| Original | `ascend-portal` repo, `codedesk/` | still serves the portal; untouched by the extraction |
| **Standalone** | `~/Desktop/dev.nosync/codedesk` | extracted with history (July 2026); README, payload rules, its own styles |
| **Kit copy** | the kit's `public/codedesk/` | a separate, older fork, mounted by the old player's `CodeDeskModal.jsx` as an iframe |

The kit copy has **drifted a long way**: of seven shared files, all seven differ — e.g. the sync pipeline
is ~13.5 KB in the kit against ~100 KB standalone, the type manifest 423 bytes against 6 KB.
▶ Re-measure: `for f in <files>; do cmp public/codedesk/$f ~/Desktop/dev.nosync/codedesk/$f; done`

**And the kit copy carries defects:**
- **It builds card URLs from `window.location.origin`** (`qr_app-bootstrapper.js`, `qr_ui_toolkit.js`), so a
  card printed on staging encodes the staging address. A printed card cannot be updated.
- **It ships one town's data**: `public/codedesk/landmarks.json` and `businesses.json` are Lafayette
  Square's places.
- It stores designs through `getDesign` / `saveDesign` — find which backend, keyed by what, and whether it
  names the town.

## 2. The work — premises first
Confirm each claim above against the code and say what you found. Then:
1. **One source of truth: `dev.nosync/codedesk`.** It is the most developed, has history and rules, and is
   what the portfolio embeds. The kit copy is **retired** — deleted, not left beside — once the Ward no
   longer needs it. ⛔ `ascend-portal` is another product: do not touch it; state its copy's status in the
   README and leave the decision to Jacob.
2. **A written contract between CodeDesk and its hosts** (the Ward, the portfolio): how it is mounted, what
   it is told (the ADDRESS to encode — computed by the host from the town's domain, never by CodeDesk from
   its own origin), what it returns (a design, an image), and how it reports its height. CodeDesk encodes the
   address it is given and nothing else; it holds no town's data.
3. **A release procedure.** How a change in the standalone repo reaches its hosts: a versioned build, where
   it is published (the asset host, like the slab), and how a host pins a version. Written in CodeDesk's
   README, with the command. No host serves a copy of its own.
4. **Design storage** named: which backend, keyed by town and place, who may write it.
5. **The Ward's QR Studio** (theward, `src/place/printable.js`) prints plain codes today. When CodeDesk's
   contract exists, the Studio offers "design this card" by handing CodeDesk one of `PRINTABLE`'s
   addresses — the Ward stays the only authority on what may be printed.

## 2b. Rulings and state (2026-09-28)
- **Contract and release: built** in `dev.nosync/codedesk` (`863022e`) — `codedesk-host.js`, README § "Hosts" and
  § "Releasing", `checks/host-contract.mjs`, `publish.sh`. ⏳ **Not run:** publishing to the asset host and pinning the
  portfolio are Jacob's go.
- **Storage: stateless (v1).** The host gets the PNG and the design JSON back and keeps them if it wants. CodeDesk
  stores nothing; the kit copy's LSQ Apps Script (`saveDesign`/`getDesign`) leaves CodeDesk's path.
- **The kit copy retires at cutover** with the frozen old player that mounts it (`CodeDeskModal.jsx`) — not before.
  ▶ `node checks/claims-no-host-carries-a-codedesk-copy.mjs` is red until then, saying so.
- **Findings.** The kit copy's `claim-secret` call puts an admin token in a URL query string (SECURITY F-20). The
  standalone's URL `buildText()` falls back to `https://jacobhenderson.studio` when the field is empty — a card
  encoding an address nobody gave it; host mode never reaches it (the host's address is returned first), but the
  standalone's own use still can.

## 3. Checks
- No host contains a CodeDesk copy (the kit's `public/codedesk/` gone; the Ward imports none).
- CodeDesk never reads `location.origin` to build a card address (grep the source).
- Every address CodeDesk is handed resolves (the Ward's step-6 check covers the Ward's side).

## 4. Out of scope
`ascend-portal`'s copy; the portfolio's page layout; restyling CodeDesk.
