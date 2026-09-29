<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-29
evict-when: every ticker item opens the card of the place it happens at, with that happening featured, on staging, and Jacob has eye-gated it on Provincetown and Huron
-->

# BRIEF — A happening opens on its place's card

**Agent: Warden, WARM.** You built the ticker (`31da7dc`, `a5552a6`) and the place card (`fb3d88d`).
If your window has been cleared, say so and read this as FRESH.

**Jacob's framing (2026-09-29):** *happening → ticker → card* is the fundamental workflow, and it has to be
robust. *"Without the ticker there is no reason to have a card; an inert card is just an invitation."* And:
*"There can just be a card for the place it happens; that's the real dichotomy anyway."*

**The design:** mock "The Ward, After Dark", **version 47 in the artifact's history** (the page calls it v46),
https://claude.ai/artifact/4cp1o7pkZWaAd3BEiiAcSM. Read its happening frames and notes with the Artifact tool:
33 Wine opened at Happy Hour, Lafayette Park at the festival, Sample House at a parlour tour, Sample
Acupuncture at its open house. ⛔ Its code is illustration, not source, and every address in it is fictional.

**Confirm, then build.** Read the code named below, tell Boz what you found, and if it contradicts this brief,
**stop and flag it.**

---

## The rulings (Jacob, 2026-09-29) — build to these, don't reopen them
1. **One ticker item, one card, both ways.** A ticker item opens **the card of the place where it happens**,
   with the happening **featured on top**: its date plate and hours (amber while it's on), its kind with the
   category dot, the serif title, its words, and for a menu, that menu's items. The place's own card follows,
   with **"Also here"** listing the place's other happenings.
2. **No separate Event card, no `/event` route, no new screen.** The address is the place's own, with the
   happening named: `/place/<id>/<name>?event=<source>:<id>`, where source is `menu:<menu>`, `post:<id>`
   or `town:<id>`. It can be linked and shared, and back returns where you came from.
3. **Every happening has a place** — *"There is nothing without places"* (Jacob). A town calendar event joins
   its venue's one ticker slot and competes by rank (announcement = calendar > serving > open, then the
   earlier start); the loser is listed under "Also here". A town calendar event names its venue. A happening with no place is
   **refused loudly when it is posted**, never shown as a dead end.
4. **No person is shown on a happening** ("Holiday open house at Sample Acupuncture"). The server records who
   posted it; the card never names them.
5. **Every card is public, with its full address.** A building-only happening (an office party, a residents'
   meeting) is **not** a happening: it's a post in that building's Lobby, with no card, no address and no
   ticker line.
6. ⛔ **Parked: a home as a place.** A home becomes a place when its residents list it (a historic house, a
   business run from home), and listing it publishes the address — *"that's the deal"* (Jacob). Listing a home
   and posting at it need a **verified resident**, so this waits on **SECURITY F-23** (*"Any device can make
   itself a verified resident of any building"*). Jacob's stance: no ID checks for ordinary people. **Build
   nothing for homes here.**

## What the code does today (read in source by Boz, 2026-09-29; confirm it)
- **`src/content/happening.js` `happeningNow()` (`:53–99`)** builds **one entry per place** in a `Map` keyed by
  the place id. Serving and open-now entries are keyed `l.id`, and an announcement **overwrites** its place's
  entry (`:79–84`). So a Guardian's event hides that place's happy hour, and there's nothing to list under
  "Also here".
- **No entry carries a source id.** A serving entry is keyed by the place, not by the menu (`serving.menu`
  exists at `:62` but isn't kept). An announcement's key is its `listing_id`, not its own id. Only calendar
  entries have one (`calendar:${e.id}`, `:89`).
- **An announcement for an unknown place gets an empty headline** (`headline: place?.name || ''`, `:84`) and
  `placeId: null`. A silent blank is the exact Layer 0 failure.
- **A calendar event with no `links_to`, or one naming an unknown place, gets `placeId: null`** (`:89`) and is
  drawn as a dead-end `<span>` (`src/app/Ticker.jsx:97–99`, `:136–138`).
- **A ticker tap selects the place** (`Ticker.jsx:98` `onChoose(item.placeId)` → `Band.jsx:112` `choosePlace`).
  README §3 says the same. It becomes **opening the place card at that happening**.
- **The place card** (`src/place/Place.jsx:102`) already takes its tab from the address (`?tab=`, `:136–137`).
  `?event=` sits beside it.
- **The routes** (`src/routes.js:13`) already have `/place/<id>/<name>`. No new route is needed.

## The build
1. **Split the model:** `happenings(…)`, every live happening with its own source id (`menu:<place>:<menu>`,
   `post:<id>`, `town:<id>`), and the ticker's selection, still one item per place by rank, taken from it. The
   card's "Also here" reads the first; the ticker reads the second. **One source of truth, two views**, never a
   second computation.
2. **Loud where it's silent today:** a happening whose place is unknown, or a calendar event with no venue, is
   **reported by name** (once per load, console + the operator's view) and **not shown**. No blank headline,
   no dead-end span. The ticker's `placeId`-less branches in `Ticker.jsx` go.
3. **The tap:** a ticker item opens `/place/<id>/<name>?event=<source>:<id>`. It's a named control, so the calm
   rule holds: *"Only controls take you places."* Write that into README §3's ticker line.
4. **The card:** `Place.jsx` reads `?event=`, features that happening on top (date plate, hours in amber while
   on, kind with its dot, serif title, words; a menu's items from the listing's menu), then the card as it is,
   with "Also here" for the rest. An `?event=` that no longer resolves (it ended, or was removed) says so
   plainly at the top of the card, **never a silent fall back to the plain card**.
5. **Refusal at posting — the backend's half:** the calendar's venue becomes **required**, and an announcement
   must name a known place. Both are refused by name. This lives in the Apps Script backend, so **write it into
   the Ward's OPERATIONS "Waiting on the backend (the Apps Script batch, Jacob's go)"** beside the character
   budget. Don't deploy it. The front end reports anything that slips through, per step 2.
6. **Share** on the featured happening shares the `?event=` address.

## Chain
- **Trusts:** the listings (their `menu.schedule` and `taglines`), the announcements from the backend, the
  town calendar, and `servingNow` / `openWindow` (`src/content/hours.js`).
- **Trusted by:** the ticker, the place card, Share, and the **arrival framing** (`9448be9`'s check reads the
  happening set — keep it green).

## Checks — mutation-test each
- Every ticker item resolves to a place and a source id, and opening it features that exact happening. A place
  with a menu serving **and** an announcement shows both, one on the ticker and both on the card.
- An unknown place and a venue-less calendar event are reported and not shown. **Mutant:** restore the `''`
  headline → red.
- `?event=` round-trips: tap → address → reload → the same happening is featured.

## Bounds
Ward repo only. A kit change is named for Lintel, not made. No deploy, no Promote; publish to staging only on
Jacob's go. **Registers:** README §3 (the ticker tap; the "happening" definition), FEATURES (the capability,
in a visitor's words), OPERATIONS (the backend items). **DoD:** Jacob's eye on staging, Provincetown and
Huron, with the town and URL recorded.
