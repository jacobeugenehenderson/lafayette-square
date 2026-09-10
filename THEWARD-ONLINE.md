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
That one is real. **A second "finding" was mine and was wrong**, and is recorded
here because the mistake is the instructive part: a page asked the deployed site
for `/trees/<species>/…`, got a 404, and I wrote it up as the deploy silently
shipping incomplete. It is not. `public/trees/` is the **authoring source pool**
and is gitignored on purpose — `.gitignore:230` says so, and says what runtime
consumes instead. The published tree is `/baked/<look>/trees/…`, it is tracked,
and staging serves it today.

⭐ **The lesson worth keeping: I read a 404 as a defect without reading the
ignore rule that explains it.** The corpus had the answer written down and I
asserted a doctrine violation instead.

---

## ⛔ What it depends on, and what you must not break

The site does not screenshot this product; it **frames it**. Four modes and
three message types are now a public surface. **`INTEGRATION.md` is their
authority; `ls/FEATURES.md §Embedded` is the capability in the host's words.**

| | |
|---|---|
| modes | `?layer=slab\|player` · `?embed=society\|masthead\|card\|sky\|tree` |
| framing | **`?shot=hero\|browse\|street`** *(2026-08-29)* — the page names an AUTHORED shot and this product supplies the geometry |
| messages | `ward-layer` · `ward-time` · `ward-perf` · `ward-place` |
| code | `src/App.jsx` (routes + handlers) · `src/components/SkyEmbed.jsx` · `src/lib/framedPresence.js` · `src/index.css` (`.embed-*`) |

⚠️ **Three of these carry measurements, not preferences. Changing them silently
breaks something that was expensive to learn:**

- ⛔ **Switch layers by message, never by changing `src`.** A reload rebuilds the
  WebGL context and resets the camera.
- ⛔ **Never hide or pause a live canvas**, and never make `.embed-sheet` opaque.
  `src/index.css` carries the numbers: 5624 ms vs 224 ms. Its partner is
  `SheetGround` in `Scene.jsx` — the two move together or not at all.
- ⛔ **`ward-perf` idle is a lower frame rate, not a stop**, for the same reason.
- ⛔ **A framing belongs to the SLAB, never to the page.** `?shot=` exists so an
  embedding page can ask for a camera by NAME — the numbers live in
  `scene.json#shots.values`, authored per look in Stage's Camera/Shots card. A page
  that carried its own centre and zoom would fork the product it embeds, and would
  hard-code *this* neighbourhood's framing into every installation after it.
  ⚠️ **So re-framing Browse in Stage moves every page that frames it.** That is the
  intent, and it is worth knowing before you drag the Browse camera.

- ⛔ **FRAMED, THE HERO HOLDS ITS SHOT** *(2026-08-31, `Scene.jsx` → `CameraRig`)*.
  `onMove` and `onWheel` promote hero→browse only when UNFRAMED, and the hero's
  `OrbitControls` are `enabled={false}` while a framed shot is held. Double-tap
  into street was already gated on `viewMode === 'browse'`, so it cannot fire
  from a held hero. `update()` is unaffected — the hero keyframe path drives the
  camera itself, so the pan still runs.
  ⚠️ **A HOST PAGE NOW DEPENDS ON THIS.** theward.online deleted its "Click to
  browse" arm gate — a pill holding the frame at `pointer-events: none` — on the
  strength of it. Re-enable the promotion and that page becomes a camera a reader
  nudges by scrolling past, with nothing on the site's side to catch it.
  ⭐ **It is also the rule in miniature:** the site had built a gate because this
  product moved a camera it was not asked to move. The gate was a fork of the
  thing being embedded. The fix belonged here, where every installation inherits
  it, and the site got to delete code.
- ⛔ **The place card's hero photo SCROLLS** *(2026-08-31, `PlaceCard.jsx`)*. It
  sat outside the scroll container as a fixed `h-28` band — fine on a desktop
  card, half the visible card in a 4:3 frame on a phone, and it never moved. It
  is now the scroller's first child. ⚠️ **The close button did NOT come with it**:
  it was positioned against the hero, so moving it would have scrolled the only
  way out of the card off the top. It is a direct child of the dialog now, and
  deliberately its **FIRST** child — `.embed-card > [role="dialog"] > :last-child`
  in `index.css` hides the claim bar and would have hidden a button parked at the
  end. ⭐ Not a small-screen fork: one layout everywhere, which is what
  `.embed-card`'s whole approach already insists on.

⚠️ **`paper` / `plate` in `ward-layer` are the wire protocol.** They are retired
words in the site's own vocabulary and must not be "corrected" here.

---

## What else the site now takes from this product

- ⭐ **The contact QR is `sms:` to `INSTANCE.cary.smsNumber`** (`src/instances/<look>.js`).
  So the code on that page is **per-installation by construction** — town #2's QR reaches
  town #2. ⛔ It is NOT generated here: it is authored in the QR Studio, which is its own
  repo and has three deployed copies (`ls/QR-CODES.md §4` — read that before fixing one).
  ⚠️ US carriers do not permit an alphanumeric sender ID, so a recipient always sees a bare
  number; the **pre-filled body is the only text that identifies who is being texted.**
- **A legal page** (`legal.html` on the site) and **a link preview** (`assets/og.png`,
  the band mark at 1200×630) landed 2026-08-29. Neither depends on this product — noted
  so nobody looks for them here.
- ⛔ **A privacy page on the site was written and CUT** *(2026-08-31)*, and the reason
  points back here: **this product already has one** — `PrivacyPage` in
  `src/pages/LegalPage.jsx`. Everything load-bearing in the site's draft described
  behaviour that lives in THIS repo — the `crypto.randomUUID()` device hash
  (`src/lib/device.js`), coordinates never leaving the browser
  (`useUserLocation` holds them; `postCheckin` sends the hash and a *place id*),
  and contributed content being public. ⚠️ **So a privacy statement on the site is a
  second copy of a statement that lives here, on a domain that collects nothing.**
  If any of those three behaviours change, `LegalPage.jsx` is the page to change.

## ⚠️ The site now DOCUMENTS this product, in public, in prose

*(2026-09-09/10.)* It has five publications: the front page, **`/guide` the Trail
Guide** (a seven-chapter manual for somebody using a Ward), **`/handbook` the Host
Handbook** (for whoever runs one), `/works` the technical prospectus, and
`legal.html`. ⛔ **Do not restate what they say here** — the site's `README.md`
owns them.

⭐ **Why it belongs in this doc:** two of them describe THIS product's behaviour
in the reader's words — the Ticker, Guardian and Keyholder permissions, claim
cards vs check-in cards, handles, linked devices, what a Ward can and cannot
know, moderation, and what a Host may see in aggregate. **That is a second copy
of behaviour that lives in this repo**, and the privacy-page entry above is the
same hazard caught early. The difference is that these copies shipped on purpose.
⛔ **So a behaviour change here can silently falsify a public manual.** If you
change what a Guardian may edit, what standing a device carries, what a review
reply shows, or what moderation can do, the pages that say so are on that site —
grep it before assuming nobody wrote it down.

⚠️ **The Host Handbook carries NO fee figure**, deliberately (`README §7d` there),
and it is indexed only because that is true. If the rate is ever printed on it,
that ruling is revisited in the same breath.

## Generated from this repo, so it cannot drift

**One** block is built from source in *this* repo:

| the page shows | built from |
|---|---|
| where a Ward's data comes from | `src/cartograph/SourcesPanel.jsx` → `GROUPS` |

⛔ **IT WAS TWO UNTIL 2026-09-10.** The sky band's colours were generated from
`skyGrid.js`'s `ANCHOR_CARDS_PROCEDURAL` — until the band came off the page
(2026-09-05) and the site **deleted `tools/build-sky.mjs` and `data/sky.json`
rather than leave a generator running against nothing.** Verified on disk today:
neither file exists. ⚠️ So this table told a reader that editing `skyGrid.js`
could change a public page. It cannot, and has not for five days.

⭐ **So editing that file can change a public page.** The generators fail loudly
on anything they have not been taught to classify — an unclassified source
breaks that build rather than publishing something unverified. If you add a row
or reshape the sky model, expect to classify it.

---

## Open, and where it is tracked

The site's own list is `BACKLOG.md`. **Nothing on it is blocked on this product.**

⚠️ **This slot listed a blocker twice and was wrong both times** — first that the
tree GLBs were undeployed, then that `?embed=sky` could not size. Both were
retracted the same day, the second by the agent the brief was written for.
✅ **`?embed=tree` — the diorama — SHIPPED, AND THEN CAME OFF THE PAGE**
*(2026-09-05, Jacob: "get rid of the diorama, time slider, light/dark maker,
everything")*. ⛔ **The route is UNPLACED, not retired** — it still works, and
`INTEGRATION.md` keeps the record; §03 describes what a Slab is instead of
demonstrating it. ⚠️ Grepped today: the only embeds on the page are the hero,
`?embed=society` and `?embed=card`. **This slot has now described the world as it
was rather than as it is four times** — twice as a blocker that did not exist,
once as open work that had shipped, and once as a live band that had gone.
`BRIEF-tree-and-sky-embed.md` §2 remains a record of the two traps.

⭐⭐ **ITS BIGGEST CATCH TO DATE, 2026-08-29 — CLOSED:** the embedded Ward was
killing a phone tab, and this was the only surface that showed it. **1,006 MB of
hero-impostor albedo, 78% of the texture budget**, in a pool whose encoder was
written and left off. ✅ Fixed by transcoding it — `arborist/FEATURES` ▸ the
impostor pool owns that story; Jacob confirmed on his own handset. ⭐ **Kept here
for one reason only,** which is the paragraph below.

⭐ **The lesson this doc should carry: a marketing page is an unusually good
detector, and an unusually good LIAR, about this product.** It found the real
half-dressed-GLB bug — and it also produced two blockers that did not exist,
because a page in a frame, in a background tab, on a cache, fails in ways that
look exactly like product defects. ⛔ **Certify the observation before reporting
the defect: which tab was painting, which build was served, and never with a
getter that mutates** (`canvas.getContext()` *creates* the context).

---

*New doc, 2026‑08‑22, at Jacob's request. Reference-kind: when the embed surface
changes, update the table and repoint — the facts live in `INTEGRATION.md`.*
