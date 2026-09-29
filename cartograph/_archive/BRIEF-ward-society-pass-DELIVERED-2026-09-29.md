<!-- BRIEF-STATE
status: DELIVERED 2026-09-29
dispatched: no
written: 2026-09-29
evict-when: §A and §C are live on staging and eye-gated by Jacob, and §B has shipped against the approved v4 mock
-->

# BRIEF — The Ward, Society pass: Explore flies to Browse, the counter goes, one emoji per town

**Agent: Warden, FRESH on the consumer look** (this window did not build `b6d6ab1`; it holds the
migration, staging and kitUrl work). The look's record: `b6d6ab1`'s message, README §5, the v3 mock.

**Asked by Jacob, 2026-09-29**, reviewing Provincetown and Huron on the Ward on staging
(`staging.theward.online/{provincetown,huron}/`, Ward `18263ff`, kit `c8e6719b`).
**Confirm, then build:** read the code named, report what you found to Boz, and if it contradicts this
brief, **stop and flag it.** Three sections; **§B waits on the v4 mock** (`BRIEF-ward-after-dark-v4.md`).

---

## §A — now

**A1. Explore flies Hero → Browse, and Browse is all overhead impostors.** Jacob: pressing Explore is
*supposed to* run the transition from the movie to the plan, and on staging it doesn't do what he expects.
⛔ **Cause not established** — measure what happens first, on staging, and say which of these it is:
- the flight itself (`src/scene/Scene.jsx` `SHOTS`, `:88–108`: `shot` → `<Town shot>`; README §2 *"the camera
  flies from the movie down to the plan and the list rises on the same curve"*) — a **regression** if it doesn't fly;
- the trees: README §11 *"Trees change drawing only between shots… Restore the Grove's pattern; don't
  build a new one"* — listed **open**, so side-on cards in the plan shot are an **unbuilt** thing, not a bug.
  The swap is the kit's (`<Town>`); if it needs a kit change, that is **Lintel's**, and you say so.
- The view Jacob gets on arrival is A3's.

**A2. The counter goes.** `HAPPENING NOW · N` reads as an age. Remove the count from the ticker's kicker
(`src/app/Ticker.jsx:89`) and from the Happening now chip (`src/society/CategoryRows.jsx:74`,
`chip__count`). Keep the label until v4 decides whether it stays.

**A3. Society opens framed on what's happening now.** Today the plan opens on the town's densest places
(`d26039d`). Ruled: it opens framed on the places Happening now lights, **by the same move** a chosen
category makes (`Society.jsx` `frame()`, `:52–53`) — so README §3's *"the only camera move the app makes
for you"* gains one occasion, arrival, and you write that line. The user then zooms and drags. ⭐ Nothing
happening now is its own case — say what the plan frames then, loudly, not a silent fallback to densest.
Flattening the terrain on arrival is **not** wanted back (Jacob: he doesn't care now).

## §B — the v4–v30 design pass: build it (the mock is final, Jacob 2026-09-29, bar one open ruling)

**The source is the mock, "The Ward, After Dark", version 30** (https://claude.ai/artifact/4cp1o7pkZWaAd3BEiiAcSM,
read with the Artifact tool): its phones, and its section **"Notes for Boz and Warden"**, which lists every README
line superseded and every code site. ⛔ **Its code is illustration, not source** (Nocturne never saw a full render;
v9 shipped broken). ⛔ **Every sky, weather and tide figure in it is a hand-set sample.** Build from the kit's sky and
the town's feeds.

**Where the notes are stale, this brief wins** (rulings made after the notes were written):
- A full page's return is a **round 44 px ←** in the left zone, named for its destination ("Back to Society"), with
  that room lit. Not the notes' "‹". **◉'s sheet closes with ✕** (Jacob, 2026-09-29): it returns
  you to where you opened it. An about page opened from inside the sheet uses ←, back to the sheet (Boz's proposal;
  Jacob's eye on staging decides).
- There is no ring around the moon (the notes' "the ring around it is data" is from v10).
- The roof dot is a **selection mark, not a map pin** (Jacob: *"There is no map pin."*). §2's "map pins" line stands.

**The day strip's sky is IN PHASES** (Jacob, 2026-09-29): the 09-28 Day Strip's solid phase blocks, each sized to that phase's length today. Not the blended gradient.

**New work, not ports:**
- the next-full-moon date;
- the tide read at the scrubbed time (`tideExtrema(tide, from, …)` already takes it, kit `cartograph/tide.mjs:167`),
  and the tide chart is draggable: one time, two windows, one slider for keys and readers;
- "Their menu" (`menu_url`) shows only when the Ward holds no menu for the place (`src/place/Actions.jsx:49`);
- "DAY 272 OF 365": the 365 comes from the year (366 in a leap year).

**Check on a device, not in automation:**
- a horizontal drag on the tide chart must not close the swept-up back (its gesture is vertical);
- the red and blue high/low dots against every sky colour of the strip (the mock measured them as text, not as
  marks on the sky);
- the movie's capture-phase pointerdown (RegimeControls) lets a building tap through.

**README rot to evict with the build:** §11's *"Tide data: there is no prediction source yet"*. A tidal town's
manifest carries NOAA harmonic constituents, and the kit's `tidePhase` computes from them.

**Owed from §A:** a check on arrival framing (frameIds: framed = the happening-now set, lit = none). It also guards
kit `48c8f161`'s prop.

## §C — one emoji per town: its map ID **and** its rating (ruled, Jacob 2026-09-29)
*"Emojis are supposed to be the ratings and the map vis ID."* **One value, `look.mark`.**
- **Today there are two channels:** the kit's `src/lib/townIdentity.js:20` `IDENTITY_CHANNELS = ['mark',
  'accent', 'ratingMark', 'litTint']`, with `ratingMark` defaulting to ⭐; the Ward's
  `src/content/ratingMark.js:62` reads `look.ratingMark`, `src/you/townMark.js` reads `look.mark`.
  ⇒ **Ward half (yours):** ratings draw `look.mark`; an unauthored mark is reported, as `townMark.js` does
  now, ⛔ never a silent ⭐. **Kit half (Lintel's):** the operator already picks the emoji in the cartograph —
  **Stage toolbar → Identity** (`src/cartograph/IdentityPanel.jsx`, `ROWS` `:29–31`), which today has
  **two** emoji rows, *Mark* and *Rating mark*. Retire the *Rating mark* row and the `ratingMark` channel
  (`townIdentity`, `bake-manifest`) in the same change, and let *Mark*'s hint say it is also what places
  are rated in. ⛔ Nothing is hard-wired per town, and nothing may become so.
- ⚠️ **Why Provincetown shows no 🦞 today (measured):** its staged manifest was written
  **2026-09-28 06:20** and has **no `look` block at all** (`identity.branding.mark` = ⚓); the 🦞 was
  authored in `public/looks/provincetown/design.json` (`1dc1e553`) after it. Huron's, re-baked today,
  carries `look.mark ⚓, markAuthored: true`. **A manifest re-bake + Publish to Staging for Provincetown
  fixes the mark — Jacob's button, no code.**

## Chain
- **Trusts:** the kit's `<Town>` (shots, the tree swap, picks) at the pinned kit sha; the manifest's `look`.
- **Trusted by:** Promote — production copies exactly what staging serves (`30bcd111`), so nothing here
  reaches provincetown.online until Jacob promotes it.

## Bounds
Ward repo only; kit changes are named for Lintel, not made. No deploy, no Promote; publish to staging
only on Jacob's go. Registers: the Ward's `README` (the rulings above), `FEATURES`, `OPERATIONS`.
**Checks:** extend the Ward's `npm run check` where a rule can be checked (no counter in the kicker; one
mark source) — mutation-test each. **DoD: Jacob's eye on staging,** with the town and URL recorded.

## §D — after the Almanac: rulings of 2026-09-29, evening (the mock is final at **version 42**)
Jacob's go on all of it. One commit each, README lines in each:
- **Ticker as a departures board** (v31): vertical, one item at a time, hold = named product values (base · reading wpm · cap) replacing `TICKER_TURN_SECONDS`; **everything moves up** (Jacob, re-ruled): dot + name rise and stay → the description, wrapped to the rendered width, rolls up a line at a time, each held for its reading time → the time → the whole item rolls up. Never truncated, never a sideways slide; two lines, the name in **20px Fraunces** (the ruled §5 exception), **warm white with the category's dot** before it; live = the amber time alone (the category dot replaces the live dot).
- **The Bulletin: v31's restyle and no further.** Jacob: *"the bulletin is restyled enough."* CSS only; closing a private thread never uses ✕.
- **The rooms drawer** (v40–v42): hangs from the band; on Home at rest it slides up under the ticker; out everywhere else, place cards included; ◉'s sheet has none. ⌕ stays at rest, and its first tap only wakes.
- **Mark style** (v38/v39): `look.markStyle = 'regular' | 'engraved' | 'colored'`, **default `engraved`** (Lintel, replacing `c894a485`'s colour|white). ◉'s field is always `#141519`. It applies to `band__you--town` only; ratings and a person's emoji stay in colour. ⛔ No authored field colour, no cap (v35–v37 superseded).
- **The ticker's character budget** (Jacob): one named value, **80**, for every ticker line a lister writes (the Guardian's Headline and the automatic tagline alike). The Headline form counts down to it; an automatic tagline over it is left out and reported, never cut with "…". Names are never limited: a long one rolls. Server-side refusal goes to the **Apps Script batch** (Jacob's go).
