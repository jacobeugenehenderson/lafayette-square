<!-- BRIEF-STATE
status: RETIRED 2026-11-01 (the kit copy is gone; evict-when fired)
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


## 5. Retired, 2026-11-01 (Fuse, for Boz)
**R1, the kit copy: DONE.** Jacob, 2026-11-01: *"retire it"*, and of the place card's guardian QR button, *"yes, remove the
guardian QR button too"*. Deleted: `public/codedesk/**`, `src/components/CodeDeskModal.jsx` and its mounts (App.jsx's mount and
admin-menu "QR Generator", PlaceCard's "Design in QR Studio" and its `lsq-saved` listener, BrowseHeader's and EventTicker's open
gates), the `codedesk` module flag in every instance and in scaffold-instance, vite.config's `serveCodedesk` dev middleware,
`public/lsq-tokens.css` and `public/data/landmarks.json` (CodeDesk's only readers). The replacement path for a printed code is the
Ward's QR Studio (§2.5). ▶ `node checks/claims-no-host-carries-a-codedesk-copy.mjs --mutants` now holds the line.
**Still open, and not the kit's:** §2b's standalone publish to the asset host and pinning the portfolio (Jacob's go, in
`dev.nosync/codedesk`); §2.5, the Ward's "design this card" hand-off; the standalone's `buildText()` fallback.
**Closed with the copy** (SECURITY F-26's "Open, UNRATED" items, both about the kit copy only): (a) CodeDesk named its town by
look (`qr_sync_pipeline.js#_lsqLookParam`), so off LS every call was refused as townless; (b) its claim-secret read the admin
token from `sessionStorage` while the app keeps it in `localStorage`.

### Excised from `ls/QR-CODES.md §4` and its file table
Printable cards are designed in the **QR Studio**, embedded as an iframe by `CodeDeskModal.jsx` and opened from a card's QR tab ("Design in QR Studio", `PlaceCard.jsx:2477`). It opens in **guardian mode** (locked to one listing) or **admin mode** (full place picker).

> ### ⛔⛔ THERE ARE THREE DEPLOYED CODEDESKS AND THEY ALL DIFFER *(measured 2026-08-29)*
> `public/codedesk/` in THIS repo is **an in-app copy**, not the tool Jacob authors in.
> A fix applied here reaches the LS place-card modal and nothing else.
>
> | build | source | who uses it |
> |---|---|---|
> | `github.io/**codedesk**/` | repo `jacobeugenehenderson/codedesk` | ⭐ **PRODUCTION** — framed by `jacobhenderson.studio` (`?mode=embed`) |
> | `<app>/codedesk/` | `public/codedesk/` here | the LS place-card QR tab |
> | `github.io/ascend-portal/…` · `ascend.jacobhenderson.studio/…` | repo `ascend-portal` | ⚰️ **dead siblings** — Jacob: *"I don't care about the ascend version"* |
>
> ⚠️ **They are not the same file and none matches another.** On 2026-08-29 they measured
> 95,884 / 80,350 / 77,586 bytes for `qr_sync_pipeline.js`, and the Cloudflare one matched
> **no commit in any checkout**. ⛔ **So "the live tool" is a question with three answers —
> certify which one before editing.** A whole fix was applied to the wrong copy that day
> because the repo that happened to be open was named `codedesk`.
> ▶ `curl -s <base>/codedesk/qr_sync_pipeline.js | md5` against your working copy.
> ⭐ The payload rules, the two-builder trap and how to check a code's scanning margin live
> in the PRODUCTION repo's own `README.md` — not here, and not in `public/codedesk/`.

- **Host ↔ studio** talk over `postMessage` (`CodeDeskModal.jsx:83–114`): `lsq-set-qr-type` (Townie/Resident/Guardian), `lsq-set-businesses`, `lsq-set-listing`, `lsq-set-claim-secret`, `lsq-save` → `lsq-saved`.
- **Engine files** (`public/codedesk/`): `qr_app-bootstrapper.js`, `qr_render_engine.js` (canvas), `qr_state_engine.js`, `qr_sync_pipeline.js` (persistence), `qr_ui_toolkit.js`, plus `qr_type_manifest.json` + `qr_templates.json`.

| QR Studio host | `src/components/CodeDeskModal.jsx` | store 6–21 · iframe 169 · postMessage 83–114 |

| QR Studio app — ⛔ **the in-app COPY, not production** (§4) | `public/codedesk/` | `qr_sync_pipeline.js` (design shape, persistence) + engine files |
