# theward.online — the marketing site, and what it asks of this product

**Kind: reference + pointer.** The site has its own repo and its own docs; this
page exists so that a reader of *this* corpus knows it exists, knows what it
changed here, and knows what they must not break.

> **Where it lives:** `~/Desktop/dev.nosync/theward-online` — beside the studio,
> Codedesk and Picture Wrap, not inside this repo. Static HTML/CSS/JS, no
> framework, GitHub Pages from `main`, `CNAME` at the apex.
>
> **Its own docs, which own their facts:**
> `README.md` (the argument, the rules, the traps) ·
> **`INTEGRATION.md`** (the seam — read this one) · `BACKLOG.md` (what is open).
> ⛔ Do not restate them here. Repoint.

---

## Why it matters to this repo

**It is the first consumer of the Ward from outside.** Everything before it —
Stage, Preview, the Designer — looks at the product from within, by people who
built it. A marketing page looks at it the way a licensee or a second
installation would, and that turned out to be the useful part:

- the **published tree GLB paints its leaves with bark** (`arborist/BACKLOG.md`,
  2026‑08‑22) — invisible inside the runtime, because the Look supplies what the
  file omits
- the **deployed build is incomplete and silent about it** (`PUBLISH.md`) — found
  by a page asking a deployed site for an asset and getting a 404 while the site
  rendered fine

Neither is a website bug. Both were found because something finally stood
outside and pulled.

---

## ⛔ What it depends on, and what you must not break

The site does not screenshot this product; it **frames it**. Four modes and
three message types are now a public surface. **`INTEGRATION.md` is their
authority; `ls/FEATURES.md §Embedded` is the capability in the host's words.**

| | |
|---|---|
| modes | `?layer=slab\|player` · `?embed=society\|masthead\|card\|sky` |
| messages | `ward-layer` · `ward-time` · `ward-perf` |
| code | `src/App.jsx` (routes + handlers) · `src/components/SkyEmbed.jsx` · `src/lib/framedPresence.js` · `src/index.css` (`.embed-*`) |

⚠️ **Three of these carry measurements, not preferences. Changing them silently
breaks something that was expensive to learn:**

- ⛔ **Switch layers by message, never by changing `src`.** A reload rebuilds the
  WebGL context and resets the camera.
- ⛔ **Never hide or pause a live canvas**, and never make `.embed-sheet` opaque.
  `src/index.css` carries the numbers: 5624 ms vs 224 ms. Its partner is
  `SheetGround` in `Scene.jsx` — the two move together or not at all.
- ⛔ **`ward-perf` idle is a lower frame rate, not a stop**, for the same reason.

⚠️ **`paper` / `plate` in `ward-layer` are the wire protocol.** They are retired
words in the site's own vocabulary and must not be "corrected" here.

---

## Generated from this repo, so it cannot drift

Two blocks on that page are built from source in *this* repo:

| the page shows | built from |
|---|---|
| where a Ward's data comes from | `src/cartograph/SourcesPanel.jsx` → `GROUPS` |
| the sky band's colours | `src/cartograph/skyGrid.js` → `ANCHOR_CARDS_PROCEDURAL` |

⭐ **So editing either file can change a public page.** The generators fail loudly
on anything they have not been taught to classify — an unclassified source
breaks that build rather than publishing something unverified. If you add a row
or reshape the sky model, expect to classify it.

---

## Open, and where it is tracked

The site's own list is `BACKLOG.md`. Two items are **this product's** work, not
the site's, and both block the same thing:

1. **`?embed=` with a Canvas does not size** — mounts, no errors, container
   correct, canvas stuck at R3F's default.
2. **Tree assets are not deployed** — see `PUBLISH.md`.

Both are briefed for a fresh agent in **`BRIEF-tree-and-sky-embed.md`**, with
what has already been ruled out so nobody re-tests it.

---

*New doc, 2026‑08‑22, at Jacob's request. Reference-kind: when the embed surface
changes, update the table and repoint — the facts live in `INTEGRATION.md`.*
