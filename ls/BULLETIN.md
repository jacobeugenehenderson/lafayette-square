# LS — The Bulletin board

The neighborhood-wide public message board: posts (with rich markdown), threaded comments, and private DM threads — all townie-gated. For the pitch see [`FEATURES.md`](FEATURES.md); the trust gate is [`TOWNIES.md`](TOWNIES.md); endpoints in [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md).

> Not the **Lobby**. The bulletin is neighborhood-wide and Apps-Script-backed; the building **Lobby** is residents-only and is specced in [`RESIDENTS.md`](RESIDENTS.md). They share only the identity helper (`getDeviceHash`).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

A neighborhood board organized into **groups → sections**. Anyone can read; only **townies with a handle** can post, comment, or start a DM thread (all gated server-side via `isTownie`, see [`TOWNIES.md`](TOWNIES.md)). UI is `src/components/BulletinModal.jsx`; state in `src/hooks/useBulletin.js`; backend is Google Apps Script + Sheets.

---

## 2. Structure — groups & sections

Defined in `BulletinModal.jsx:11–55`:

| Group | Sections (id) | Anonymous by default |
|---|---|---|
| **Marketplace** | Buy Nothing (`buy-nothing`) · For Sale (`for-sale`) | no |
| **Services** | Professional (`professional-services`) · Domestic (`domestic-services`) · Concierge (`concierge`) | no |
| **Neighbors** | Square Notes (`square-notes`) · Missed Connections (`missed-connections`) · Emergency (`emergency-supplies`) | **yes** |
| **Cary** | Courier Board (`courier-board`) · Delivery & Errands (`delivery-errands`) | no |

The three **Neighbors** sections default to anonymous (`ANON_DEFAULT_SECTIONS`, `BulletinModal.jsx:52`).

---

## 3. Posting — the gate, the editor, anonymity

- **Townie gate** (`postBulletin`, `apps-script/Code.js`): `if (!isTownie(device_hash)) return errorResponse('Must be a verified local to post', 'unauthorized')`.
- **Markdown editor** `FormattedTextarea` (`BulletinModal.jsx:257`) with a 15+ tool toolbar and a live **Preview** toggle. Supports: bold `**` · italic `*` · strikethrough `~~` · links `[](url)` · H1/H2 · lists `-` · blockquote `>` · divider `---` · `{big}` / `{small}` · `{center}` / `{right}` · `{color:name}` (8 curated colors). Rendered by `renderMarkdown`.
- **Anonymity choice** — before posting, `IdentityPopup` offers "@handle" vs "Anonymous", defaulting per section; a "don't ask again" preference is stored in `localStorage` (`lsq_bulletin_identity_pref`). When anonymous, the server nulls `handle`/`avatar`/`vignette` in the response (`Code.js`).

**Bulletins sheet** (`Code.js`): `id, device_hash, handle, section, text, anonymous, created_at, expires_at, status`.

**Post shape** (`getBulletins`, `Code.js`):
```js
{ id, handle, avatar, vignette, section, text, anonymous, created_at, status, is_mine, comment_count }
// handle/avatar/vignette = null when anonymous
```

---

## 4. Comments

Threaded under a post (`CommentSection`, `BulletinModal.jsx:546`). Posting is townie-gated (`postComment`, `Code.js`, gate at); removal is **author-only** (`postRemoveComment`). Comment text is plain (no markdown).

**Comments sheet** (`Code.js`): `id, bulletin_id, device_hash, handle, anonymous, text, created_at`.
**Shape:** `{ id, bulletin_id, handle, avatar, vignette, anonymous, text, created_at, is_mine }`.

---

## 5. DM threads (private direct messages)

Any post can spin off a **1:1 private thread** between the poster and a reader. The "Message" action (`BulletinModal.jsx:799`) is available only when the post is **not your own**, **not anonymous**, and you're a **townie with a handle**.

- **Start** (`postStartThread`, `Code.js`, townie gate): party A = the bulletin poster, party B = the initiator; an existing thread for that pair+post is reused (no duplicates).
- **Send** (`postSendMessage`, `Code.js`): sender must be a party of an active thread.
- **Read** (`getThreadMessages`, `Code.js`): rejects non-parties.
- **Close** (`postCloseThread`, `Code.js`): party-only; deletes the thread and all its messages.

**Threads sheet** (`Code.js`): `id, bulletin_id, party_a_hash, party_b_hash, a_handle, b_handle, status, created_at, expires_at`.
**Messages sheet** (`Code.js`): `id, thread_id, sender_hash, text, created_at`.
**Thread shape** (`getThreads`): `{ id, bulletin_id, other_handle, last_message, last_message_at, message_count, created_at }`. **Message shape:** `{ id, text, is_mine, created_at }`.

---

## Source map
| Thing | Frontend | Hook | Backend (`apps-script/Code.js`) |
|---|---|---|---|
| Groups/sections | `BulletinModal.jsx:11–55` | — | — |
| Browse posts | `BulletinModal.jsx:636` | `useBulletin.js:22` | `getBulletins` 1220 |
| New post (+ editor) | `BulletinModal.jsx:862` (editor 257) | `useBulletin.js:41` | `postBulletin` 1261 (gate 1267) |
| Remove post | `BulletinModal.jsx:814` | `useBulletin.js:56` | `postRemoveBulletin` 1288 (author-only) |
| Comments | `BulletinModal.jsx:546` | `useBulletin.js:65–112` | `getComments` 1313 · `postComment` 1344 (gate 1354) · `postRemoveComment` 1374 |
| DM threads | `BulletinModal.jsx:977–1131` | `useBulletin.js:115–162` | `postStartThread` 1395 · `postSendMessage` 1443 · `getThreads` 1468 · `getThreadMessages` 1505 · `postCloseThread` 1532 |
| Sheets | — | — | Bulletins 1932 · Threads 1933 · Messages 1934 · Comments 1935 |
| Townie gate | — | — | `isTownie` 776; config 29–31 |
| API wrappers | `src/lib/api.js:310–356` | | |

*New doc, 2026-06-29. Reference-kind: when the section taxonomy, the markdown tools, or the thread model changes, update §2–§5 + the source map.*
