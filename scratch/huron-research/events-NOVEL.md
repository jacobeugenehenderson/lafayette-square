# Huron, Ohio — what the `events.json` shape could not hold

Researched 2026-09-22. Companion to `events.json` in this directory.

Every item below is written as **the class**, not the Huron instance — the instance is the
receipt. The question each time is *"what does this input kind look like in a town nobody has
looked at?"*

---

## 1. Dates the schema cannot express

### 1a. The floating-holiday anchor
`start_date` is `YYYY-MM-DD`. Several real Huron dates are not calendar dates at all — they are
offsets from a holiday that moves.

- **Nickel Plate Beach red-flag warning system: "ACTIVE Memorial Day thru Oct. 1."** One end
  floats, the other does not.
  (`cityofhuron.org/.../parks/beach_safety.php`)
- **Dogs prohibited at Nickel Plate Park and Beach "from Memorial Day through Labor Day during
  the hours of 10am to 6pm."** Both ends float, and it is a daily time window inside a floating
  season.
- **The Lion's Club Pancake Breakfast & Egg Hunt** — 2026-03-28, an Easter-anchored Saturday.
  Easter moves 35 days; no fixed-date rule reproduces it, and no *nth-weekday* rule does either.

⭐ **Kit consequence:** a town's authored calendar needs an anchor expression, not just a date —
`memorial_day`, `easter - 8d`. Absent that, every one of these has to be re-authored by hand
each year, which is exactly the maintenance the kit exists to remove. ⛔ And the failure is
silent: last year's literal date just sits there, wrong by a week.

### 1b. "Dusk"
**Movies by the River** is published by the city as starting at **"Dusk"** — four Wednesdays in a
row, and the real start slides roughly half an hour across the season. `start_time` is `HH:MM`.
Recording `21:00` is an invention; recording nothing makes an evening film look like an all-day
event. There is no honest third option in the current shape.
⭐ The same word will appear in every town with an outdoor summer film series.

### 1c. A month with no day
The **Huron Yacht Club** publishes its annual calendar as *"Opening Day (May)"*, *"Regatta
Weekend (August)"*, *"Witches Luncheon (October)"*, *"Closing Day Celebration (November)"* — a
month and a name, no date, with "dates announced to members." Its only dated items are the 2026
Power Fleet cruises (Jun 5-7, Jun 26-28, Jul 24-26, Aug 21-23) — and those are to *other* towns.
⭐ Month-granularity is a common private-club and church-calendar shape. The schema cannot hold
"sometime in October" and I recorded none of it.

### 1d. No date at all — weather-dependent
The city's own notice for the **Fabens Park outdoor ice rink**: *"Mother Nature has graciously
provided us with a unique opportunity to have the Ice Rink at Fabens Park up and skate-able a
little earlier this year! Follow Huron Parks & Recreation on Facebook for more updates."*
It opens when the lake weather freezes it. A northern town will have several of these.

---

## 2. Recurrences the schema cannot express

The shape offers exactly one: `type: "recurring"`, `recurrence: "weekly"`, `day_of_week: <name>`,
bounded by a date range. Four real Huron patterns fall outside it.

| Pattern | Huron instance | Source |
|---|---|---|
| **nth weekday of the month** | Huron Farmers Market: *"every second and fourth Tuesday from 4 PM to 7 PM at Lake Front Park"*, "runs bi-weekly through August" | Huron Light Summer 2026 newsletter, p.43 |
| **monthly, first weekday** | Chamber Office Hours in Huron — Sep 1, Oct 6, Nov 3, Dec 1 2026, all first Tuesdays | Greater Sandusky Partnership calendar |
| **monthly, library-style** | LEGO Builders Club (1st Thursday), Take & Make Craft (2nd Monday), Socrates Cafe / Mystery Book Discussion / Teen Library Council (all monthly) | Huron Public Library LibCal |
| **biweekly** | the Farmers Market again — "bi-weekly" is the city's own word | as above |

I recorded the Chamber office hours as **three separate dated events**, which is honest but
lossy: the operator authored one rule and the file carries N rows. When the series extends, the
rows do not.

### 2a. ⭐ A weekly rule OVER-GENERATES, and the schema has no exception list
**Senior Stretch** is every Friday 10:30-11:30 at the library — except it is **not** on 2026-10-09
or 2026-10-23. The second of those is explained by another record in the same feed: *"LIBRARY
CLOSED FOR STAFF DAY."* The first is unexplained.
⛔ A `weekly` rule with a range therefore *manufactures two events that will not happen*, and
nothing in the shape can suppress them. Every weekly series in every town will hit holidays.
I flagged this in that entry's `_confidence` rather than silently shipping the over-generation.

### 2b. ⭐⭐ A CLOSURE IS AN ANTI-EVENT
The library's feed carries `CLOSED FOR THANKSGIVING` (Nov 26, Nov 27), `CLOSING EARLY FOR
THANKSGIVING` (Nov 25), `LIBRARY CLOSED FOR STAFF DAY` (Oct 23), `CLOSED FOR CHRISTMAS EVE`,
`CLOSED FOR CHRISTMAS DAY`, `CLOSED FOR NEW YEARS EVE` — six records that are, structurally,
events. **They are the opposite of events: their job is to SUPPRESS other rows and to override a
listing's open-now state.** Poured naively, the ticker announces "CLOSED FOR CHRISTMAS DAY" as a
Christmas happening. I recorded none of them.
⭐ This is a general kind: a holiday-closure feed is the single most common thing a small-town
institution publishes, and it belongs on the *listing's hours*, not the calendar.

### 2c. One series name, N different headliners
**Boppin' on the Basin** is ten Saturdays, and on each one the thing a resident actually wants to
read is the **band**: *Swamps of Jersey* · *Ron Howard & The Band Cruisin'* · *Wayne's World
Band* · *New Frontiers* · *SuperBeatle*. Same for **Movies by the River** (a different film each
week: *The Land Before Time*, *Zootopia 2*, *Inside Out 2*, *The Lion King*) and **Art in the
Gallery** (a different local artist each month: Susan Shamhart in September, Clela Neale in
November).
⛔ The shape forces a choice: **one recurring row** that loses the headliner, or **N single rows**
that lose the series. I took the recurring row for the 2027 series and named the series, losing
the bands — and there is no field to put them back in.
⭐ What is missing is a *series* with per-occurrence titles.

### 2d. Two simultaneous sittings of one program
**Babies & Toddler Time** is published as two separate one-hour records on the same Wednesday
(10:00-11:00 and 11:00-12:00). **STEAM Team** and **STEAM Team 2.0** run the same hour in two
different rooms for two different age bands. I collapsed the first pair into a 10:00-12:00 block
— that is an editorial decision, not what the source says, and it is recorded as such.

---

## 3. Next year's date is not published — and that is the normal state

At the time of research **not one 2027 town event had a published date.** Verbatim:

- Huron River Fest: *"THANK YOU FOR A GREAT 2026. Hope to see you in 2027!"* — no date.
- Osborn Fall Fest (Erie MetroParks): *"Stay tuned for details on next year's Osborn Fall Fest."*
- The entire 2027 Boat Basin season: nothing posted.

Eight of my 28 entries are therefore **`_status: "PATTERN-INFERRED"`** — a date I derived from
two or three prior years, never a date anyone announced. Every one carries a `_confidence` that
opens with ⛔ and says so.

⭐⭐ **The kit needs this as a first-class state, not as prose in a provenance key.** A town
calendar poured in September is ~70% "this happens every year and next year's date is not out
yet." Three distinguishable things are being flattened into one `start_date`:
1. **CONFIRMED** — the organiser published this date.
2. **INFERRED** — a stable rule (first Saturday of December) plus ≥2 confirmed prior years.
3. **LAPSED** — it happened for years, and this year's edition is simply absent.

⛔ And the third is real here: the **Huron Pumpkin Festival** ran 2018-10-13 and 2025-10-11 (both
second Saturdays) and is **absent from every 2026 city source** — the city's Community Events page
jumps straight from Aug 16 to Dec 5. Absence of an announcement is not evidence of cancellation,
and it is not evidence of a date either. The kit has no way to say "this annual event has gone
quiet," so the choice is between inventing Oct 10 and dropping the town's fall festival. I
recorded it, loudly flagged, so a human decides.

---

## 4. `links_to` is only as good as the listing roster — and the roster misses civic venues

⛔ **The single busiest event venue in Huron has no listing id.** The **Huron Public Library**
(333 Williams St) published **181 events** in the twelve months from the fetch date. It is not in
`cartograph/data/huron/content/listings.json`. So every one of my twelve library entries carries
`links_to: null` and the ticker cannot send a visitor anywhere.

Also absent, also hosting real dated events: **Mulberry Creek Herb Farm** (Garlic Fest,
Christkindlmarkt), **Osborn MetroPark** (Fall Fest), **Nickel Plate Beach**, **First Presbyterian
Church** (the Lion's Club pancake breakfast), **Fabens Park** (the ice rink).

⭐ The pattern: the roster reads like a **business-POI** extract — 285 records heavy with
contractors, salons, insurance agents, three Blue Rhino propane cages and two Dairy Queens —
while the places a town *gathers* are thin. `huro-lst-0212 The Huron Historical Society` is in
the file at 333 Williams St, the **same building** as the library, because the society occupies
its lower level. ⛔ That near-miss is the dangerous shape: an id that is geographically right and
institutionally wrong. Linking there would have been a plausible-looking wrong answer, which is
the worst outcome in the kit.

⛔ **And the coupling is hard:** an id that does not resolve makes the bake refuse the whole
scene. So calendar research cannot be done before the listing roster is final, and the roster's
gaps become silent `null`s in the calendar rather than a reported defect. **A town-#2 check worth
having: for every event whose `links_to` is null, name the venue string the source gave and
report it as an unmatched-venue list.** That turns a silent null into a loud roster gap.

### 4a. "Offsite"
The library feed's own location field says literally `Offsite` for **Pizza & Pages (Grade 7/8)**
(actually at the middle school) and **Coffee Crew with Gathering Grounds** (almost certainly
`huro-lst-0187 Gathering Grounds Coffee House`, 404 Main St). ⛔ *Almost certainly* is not a
source. Both are null.

### 4b. Audience scope has nowhere to go
Every library record is tagged `Pre K` / `Children` / `Tween` / `Teen` / `Adult` / `All Ages`.
The event shape has no audience field, so *"Pizza & Pages (GRADE 8)"* — a 35-minute lunch club for
one grade at one school — renders in a town ticker identically to a fireworks festival.

---

## 5. "First-party" is not the same as "current"

⛔ Two of the best sources I used contradict themselves *within the same site*:

- **Mulberry Creek Herb Farm.** `/Events/index.html` is headed **"2026 Mulberry Creek Events"**
  and lists `Sat./Sun., Dec. 5-6th CHRISTKINDLMARKT`. The dedicated sub-page
  `/Events/CHRISTKINDLMARKT/index.html` is headed **"2025 CHRISTKINDLMARKT"** and gives
  *"Saturday, December 6 ... Sunday, December 7"* — **last year's days, still live.** A scraper
  that prefers the more specific page gets the wrong year. I took the dates from the index and
  dropped the hours entirely.
- **The city marina page** carries "2027 Transient Dockage" rates alongside "Reservations are
  accepted until the Wednesday prior to River Fest weekend, **July 8, 2026**."

⭐ **The checkable rule:** a page is only a date source if the page states the year. "It's on the
official domain" is not freshness. ⛔ Neither is a recent-looking copyright line.

## 5a. Aggregators that print a confident date for everything

`ohiofestivals.net`'s Ohio guide prints a day for every festival in the state, marking provisional
ones with a `*`. For Huron it gives `10/10* Pumpkin Festival`, `12/5* Huron Winter Fest`,
`7/9-7/10* Huron River Fest`, `9/18* Erie Metroparks Osborn Fall Fest`.
**Two of those four I could falsify independently:** River Fest actually ran 7/10-7/11 and Osborn
Fall Fest 9/19. ⭐ So: *before trusting an aggregator for the date you cannot check, check it on
the entries you can.* That is a runnable rule for any town, and it is the reason I did **not**
promote Pumpkin Fest to DATE-CONFIRMED.

---

## 6. ⛔⛔ The wrong-entity trap is the biggest single hazard, and it is town-agnostic

"Huron" resolves to at least six different places, and general search returns them
interchangeably for queries that already say "Ohio". Confirmed wrong-entity hits during this
research:

| URL I hit | What it actually is |
|---|---|
| `huronschools.com`, `hhs.huronschools.org` | Huron **South Dakota** school district |
| `huron.k12.sd.us` | Huron **South Dakota** |
| `huron-sd.whofi.com` | Huron **South Dakota** public library |
| `huronsd.com/chamber-of-commerce/chamber-calendar`, `chamber.huronsd.com` | Huron **SD** chamber |
| `huronvcc.com` | Huron **Valley**, Michigan chamber |
| `huroncountyohio.com` | Huron **County** OH (Norwalk) — a different county entirely |
| `huron-co-oh.whofi.com` | Huron **County** OH library |
| `canr.msu.edu/.../huron_community_fair` | Huron County **Michigan** |
| `getoutgarage.com/.../mi/port-huron` | Port Huron, **Michigan** |
| `harborbeachlighthouse.org`, `lakehuronyachts.com` | Lake Huron, **Michigan** |

The real ones are `cityofhuron.org`, `huronk12.org`, `huronlibrary.org`, `huron.net`.
⭐ **What disambiguated reliably was the ZIP (44839) and the county (Erie County, Ohio) — never
the town name, and not even "Huron Ohio".** Note the near-homograph: `huronk12.org` is the Ohio
district; `huronschools.com` is South Dakota. Nothing in either name says which.
⛔ **A kit intake should carry the ZIP and the county as the search key from the first query, and
should treat a source whose footer address does not match as a hard reject, not a soft signal.**

---

## 7. Dead, blocked and JS-only sources (all hit 2026-09-22)

| Source | What happened |
|---|---|
| `huron.net` — **the Huron Chamber of Commerce** | **HTTP 522 on every attempt**, root and `/events/` alike. The town's chamber calendar was simply unreachable; search results still link into it. |
| `huronlakefrontmarket.com` | **DNS NXDOMAIN.** Still the top organic result for the market. |
| `cityofhuron.org/news_detail_T3_R21.php` | **404.** This was the "Farmers Market Returns to Lake Front Park" release; still indexed and still linked from search. |
| `events.bgsu.edu` (BGSU Firelands, a Huron campus) | **503** on the page, the Localist `/api/2/events` and the JSON feed. |
| `greatersandusky.com/community-events/` | **Cloudflare 403** — bot-blocked. The sibling `business.greatersandusky.com` served fine. |
| `mulberrycreek.com/Events/` | **403** on the directory, **200** on `/Events/index.html`. |
| `cityofhuron.org/calendar.php` | **JS-only** — renders zero events to a fetcher. |
| `huronlibrary.libcal.com/calendar/programs` | **JS-only** — same. |
| `shoresandislands.com/events/` (the regional tourism bureau) | Served, but returns category tiles only; no event rows reachable without JS. |

### 7a. ⭐⭐ The finding that generalises: municipal calendars live behind four or five CMS vendors

The two richest feeds in this town were both invisible to HTML fetching and both reachable
through a **vendor-standard endpoint**, not a Huron-specific one:

- **Revize** (the City of Huron's CMS, used by a great many US municipalities):
  `/_assets_/plugins/revizeCalendar/calendar_data_handler.php?webspace=<slug>&relative_revize_url=//cms2.revize.com&protocol=https:`
  → **95 events as JSON**, each stamped with `primary_calendar_name`.
  (Found by reading `//development.revize.com/revize/plugins/revize_calendar/index.v2.js`. The
  handler also supports a Google Calendar feed via `gFeed`/`gKey` — Huron does not use it, other
  Revize towns will.)
- **Springshare LibCal** (the library):
  `/ajax/calendar/list?c=-1&date=&perpage=100&page=<n>&inc=0` → **181 events as JSON**, fully
  structured (`startdt`, `enddt`, `all_day`, `recurring_event`, `location`, `audiences`).
  ⚠️ `date=<YYYY-MM-DD>` narrows to **that single day**; leaving `date` **empty** returns the
  whole upcoming set. That is the difference between 5 events and 181.
- **GrowthZone** (the chamber/partnership): `business.<domain>.com/events/Search?term=<town>`
  renders server-side and is fetchable as-is.
- **Localist** (`events.<school>.edu`, `/api/2/events`) — down today, but the shape is known.

⭐ **This is the real deliverable for town #2:** a calendar intake should be **four vendor probes,
not an HTML scraper.** Detect the vendor from the page (`revizeCalendar`, `libcal.com`,
`GrowthZone`, `/api/2/events`), then hit the documented endpoint. ⛔ A generic scraper returns
zero rows from Huron's two best sources and reports success.

---

## 8. Two things the calendar shape gets right, and one it should keep

- ⭐ **Dates with no times, running all day, is the correct default.** Confirmed by the data: the
  winter festival, the multi-day book sale (different hours *every* day), the puzzle swap and the
  election are all things a resident wants on the ticker at 11pm.
- ⭐ **`links_to` refusing the bake on an unresolvable id is right** — it fails loudly, which is
  what Layer 0 asks for. The cost is only that a **missing** link is silent; see §4.
- ⛔ **What should not be kept is the implicit assumption that a town calendar is a list of
  festivals.** Of the 95 events on the City of Huron's own calendar, **the nine future ones are
  eight committee meetings and a council work session.** A naive pour of "the city calendar"
  yields a ticker of Utilities Committee meetings. The feed does carry the discriminator —
  `primary_calendar_name` is one of `Events` / `Parks & Recreation` / `City Council` /
  `Boards & Commissions` — so the filter exists; it just has to be used, and the category names
  are the vendor's, not Huron's.

---

## 9. Scope question the research kept running into

**Osborn MetroPark** (Fall Fest) and **Mulberry Creek Herb Farm** (Garlic Fest, Christkindlmarkt,
and the Historical Society's annual meeting) both carry **"Huron, OH 44839"** addresses on rural
roads, well outside the platted town the scene draws. **Sawmill Creek Resort** — which *is* in the
listings — is likewise out on the western edge.

⛔ Not ruled, and I recorded the Mulberry Creek events anyway because a resident would plainly
call them Huron events. But the kit needs an answer, because it decides what a town calendar *is*:
**events inside the rendered polygon, or events a resident would go to?** The second is the true
one and the first is the computable one. Whichever it is, it should be the same rule in every
town — ⛔ not a judgement made per-town by whoever did the research.

---

## 10. One unresolved contradiction, deliberately left in the file

`huron-library-election-day-2026` is a real all-day booking of Rooms A & B at the Huron Public
Library, published in the library's own feed, titled **"Election Day"**, dated **2026-11-10**.
Ohio's 2026 general election is **2026-11-03** — which the Greater Sandusky Partnership calendar
independently confirms, polls 6:30 AM to 7:30 PM. Both are in `events.json`.

Whether the library record is a typo, a differently-dated local ballot, or an unrelated booking
is **not established**. ⛔ It is flagged in its `_confidence` as DO-NOT-SHIP-without-a-human.
⭐ The class: *two first-party sources disagreeing about a date is a QUESTION, not something to
resolve by preferring the more specific one.*
