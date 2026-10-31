# BRIEF — an event names its host and opens at its venue (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-sign below). **Repo:** `~/Desktop/dev.nosync/theward` only.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.** No live window holds this work.

## The ruling (read it in full; it is the spec)

Kit `references/registry.json`, id `r-an-event-has-a-host-and-a-venue-and-opens-at-the-venue` (integration branch,
`.claude/worktrees/integration`, at `cfb6626b` or later). In short, and the registry wins where they differ:
- **host** (optional): `{ listing: "<id>" }` (links to its card) | `{ name: "<text>" }` (shown, opens nothing).
- **venue**, which every happening has: `{ listing }` | `{ building: "<building id>" }` | `{ name, point: { lat, lon } }` (a
  spot inside the radius) | `{ scene: true }` (a whole-town digital show, operator only). A `listing_id` row's venue is
  its own listing. `links_to` is retired.
- **opens: ALWAYS THE VENUE.** The camera, the clickable building, and the event's own card inside the venue's place
  card, carrying the event's action. No host fallback. A scene-venue event is in the ticker and NOT clickable.

The kit side (bake validation, the published `content/events.json` shape) is Tinsel's, via Boz. **The bake refuses bad
rows; the Ward still reports by name anything that slips through and doesn't show it** (today's `notShown` pattern).

## What exists (Zob's premise pass, 2026-10-31, read in source at theward `4334c64`)

- `src/content/happening.js#happenings` already treats `e.listing_id || e.links_to` as the venue. `#targetOf` opens
  `placePath(venue)?event=town:<id>`. `#notShown` drops a venue-less event, by name.
- `src/place/Happening.jsx#Featured` draws the event card at the top of the place card for `?event=<ref>` (`Place.jsx`).
  It has Share, and "Also here".
- `src/content/register.js#buildRegister` gives a roster building a bare row (`id = building id`) only when NO listing
  stands for it and it has a name or an address. A building WITH a listing is the listing's row (`id = listing id`). So
  resolve `{building}` through `building_id`, never by id lookup. A building with neither a name nor an address is
  refused at the bake (kit), and the Ward reports it by name if one slips through.
- `happenings({ events, listings, taxonomy })` takes no roster, and the roster loads on demand (`content.js`: `roster: null`).
- **No route exists for a `{name, point}` spot** (grep). ⛔ **The pinned kit can't fly the camera to a lone point**
  (`Town.jsx`: `frameIds` are building ids; `frameMover` is never framed alone; `movers` kinds are closed). The point
  frame is a KIT prop, briefed by Boz. A card route covers the map (`Place.jsx`: "the whole page, nothing behind it";
  `Scene.jsx#shotOf` gives no shot), so a mark drawn under a card is unseen (Usher's stop, 2026-10-31).
- **How a venue opens (Ward's reading of the ruling, 2026-10-31):** the ruling picks WHICH place the camera, the building and
  the card belong to (always the venue, never the host). The Ward's two-step stands: a tap opens the full-page card, and
  the card's map pin (`/society?show=<id>`) is the camera move.
- The ticker's click: `src/app/Ticker.jsx` (`ticker__link` buttons, `onChoose`).

## The work

1. **Model** (`happening.js`): read `host`, `venue` (four forms) and `action`. Delete the `links_to` read in the same
   commit, and say so in the message. ⛔ Don't read both shapes: a `links_to` row is reported by name and not shown.
   - `happening.js` stays pure; the roster comes in through `useHappening.js#useHappenings`, which calls `loadRoster` when
     a live `{building}` row exists. Until it answers, that row is PENDING, never reported as `notShown` (or every cold
     load files a false report).
   - `register.js#openNowLit` adds `buildingOf(placeId) ?? null` for every happening, and null means "couldn't place it".
     A placeless happening (`{scene}`, a spot) is skipped there, not counted as null.
   - `tickerItems` keys by `placeId`, so placeless happenings (`{scene}`, and a spot) would collapse into one. Key a
     placeless happening by its own id.
2. **Card** (`Happening.jsx#Featured`): "Hosted by …" (a link for a listing host, plain text for a name). The action as
   a button, `action: { kind, url }`: `kind` from a closed list the Ward words (`rsvp` → "RSVP", `tickets` → "Tickets",
   `invite` → "Invitation", `details` → "Details"); `url` must be `https:`. Anything else is reported by name and the
   button isn't drawn (the event still shows). ⛔ No URL text as a label.
3. **A spot venue:** a shareable address that names the event (your choice of path; record it in `src/routes.js` and the
   README). It opens a full-page card like `Place`, under the spot's name, with the event featured. **No map pin on a spot
   card yet:** its "show on map" step needs the kit's point-frame prop (ruled SPLIT by Boz; the kit item is queued for
   Tinsel after the calendar route). The pin and the spot's mark (the kit's `GroundPoint` lat/lon form) land together with
   that prop, as a named TODO in the code. ⛔ No dead pin, and never frame nearby buildings to stand in for the point
   (that's proximity recovery). A spot address that no longer resolves says so in its own words (not `Gone`'s "the place
   it was at"). ⛔ Never a silent home.
4. **A scene venue:** the ticker shows it as text, not a button, so it isn't focusable as a link. ⛔ No dead button.
5. **Checks** (`checks/`; `run.mjs` finds every check in the directory): extend `happening-has-a-place.mjs` (or one new check, and say which) over
   a fixture town with one row of each venue form, including a `{building}` WITH a listing and one with no name or
   address, two `{scene}` rows, a listing host, a name host, an action, a bad action, and a `links_to` row. Assert where
   each opens and what each card shows. **Mutation-test:** restore the `links_to` read, drop the scene case, accept an
   `http:` action, key placeless happenings by `placeId` (both scene rows must show); each must turn the check RED.
   Report the runs.

## Order and bounds

- **Release order is Boz's:** Tinsel's new `events.json` shape and this code reach a town together, so no town's
  published rows outrun its player. ⛔ No publish, no pin move.
- Write only in `theward`, on a branch `ward/event-at-its-venue` off `ward-pin/2026-10-30`; `git commit -- <paths>`.
  The commit names its register (`FEATURES`: hosts, spots and RSVPs are a capability a partner sells), or says
  "Reaches no register." README §3 "A happening" is conformed in the same commit.
- **Out of bounds, surface it:** a resident posting an event at their own home (there's no resident event-write path
  today; `postEvent` is staff-only), sponsor-bought scene shows (an ASPIRATION), and Huron's data sort (the kit's).

**Confirm, then build:** read the ruling and the code, tell Ward what you found, and if they contradict this brief, stop
and flag. The stop is the deliverable, not a failure of the brief.

## Zob's co-sign

Zob, 2026-10-31: co-signed. Split per Boz: the spot's camera move waits on a kit point-frame prop (pin 2a44e317 frames
building ids only), named as a TODO in the code; the spot's mark uses TownPoint lat/lon; no fallback to Browse. Changes 1
(roster into happenings, pending not notShown), 2 (placeless ticker key) and 3 (the {building} fixture) taken.
