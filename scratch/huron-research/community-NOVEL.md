# Novel input kinds — community · parks · uncategorised beat (57 records)

Reported town-agnostically. The prior civic beat already covered simultaneous schedules,
academic-term hours, service times as instants, by-appointment state, last-entry times, rule
windows and plain link rot — those recurred here and are **not** re-argued. What follows is new.

---

## 1. ⭐ A DAY WITH A HOLE IN IT — the midday closure

`hours: {day: {open, close}}` has exactly one interval per day. A place that **closes for lunch**
cannot be expressed, and the only way to fit it is to overstate the opening.

> Instance: a title office publishes `Monday - Thursday: 9am - 12pm (lunch) 1pm- 4:30pm`.
> I recorded 09:00–16:30, which tells a visitor the office is open at 12:30. It is not.

This is not an edge case of one trade. Midday closure is the default for professional offices,
municipal clerks, rural post offices, pharmacies and — outside the US — most of the retail in a
southern European or Latin American town. **A kit whose hours model cannot hold a split day will
be quietly wrong on a large fraction of the businesses in whole categories of town, and wrong in
the direction that sends someone to a locked door.**

▶ The shape needed is `day -> [interval, ...]`, not `day -> interval`. Everything below that is a
lossy cast, and the loss is invisible: the record still looks complete.

## 2. ⭐ CONDITIONAL OPENING — "weather permitting"

A watersports rental publishes `OPEN DAILY 10AM - 7PM (WEATHER PERMITTING)`. The parenthesis is
not decoration; on this kind of business it is the operative clause, and a boat ramp, a beach
concession, a ski lift, a rooftop bar, an open-air market or a ferry all carry the same one.

The schema has nowhere to put a **precondition on an interval**, so the qualifier is dropped and
the page then asserts, flatly, that the place is open — which is Layer 0's question 2: a
plausible-looking success. The operator never learns the hours were conditional.

▶ Minimum viable: a per-place `hours_caveat` string that the renderer must show wherever it shows
the hours. Better: a `conditional: true` flag so a town can be swept for places whose hours
should never be stated bare.

## 3. ⭐⭐ TWO DIFFERENT HOURS ON THE SAME PAGE — the booking widget vs. the authored copy

The same watersports page states its hours **twice and differently**: hand-written banner copy
(`10AM - 7PM`) and, lower down, a booking-platform widget (`Open today 09:00 am – 06:00 pm`).
Both are first-party. Neither is marked as authoritative.

This is structural, not sloppy. A modern small business authors marketing copy once and then
installs a reservation platform (Square, Zenplanner, RecDesk, Calendly) that carries its own
schedule. The two drift, and **the widget is usually the live one while the banner is usually the
one a scraper reads**, because the banner is in the HTML and the widget is not.

▶ For a scraper this means: *finding hours on the page is not the same as finding the hours.*
A place with a booking platform embedded needs its scraped hours marked lower-confidence, and the
platform noted, or the kit will confidently ship the stale half.

## 4. ⭐ THE SCHEDULE IS NOT ON THE SITE AT ALL — it is inside a booking platform

Three places on this beat publish **no schedule anywhere in HTML**, by design:

| kind | where the schedule actually lives |
|---|---|
| barre/pilates studio | `…zenplanner.com` — link-out only |
| golf coach | `my.pga.com/coach/<name>/schedule` — the page rendered **completely empty** |
| city parks shelter rentals | `…recdesk.com` — facility list returns "No results found" without JS |

The golf-coach case is the sharpest: **the listing's `website` field points at the booking page,
so the record looks well-sourced while being unreadable.** A link-liveness check passes it (HTTP
200), a content check gets nothing.

▶ This is a distinct failure class from a dead link and needs its own loud state:
**`source_unreadable`** — the URL resolves, is first-party, and yields zero facts. Silently
producing an empty record from a 200 is the fallback Layer 0 forbids.

## 5. ⭐⭐ A URL MATCHED BY NAME, NOT BY PLACE — the wrong-entity link

Worse than a dead link, because it *works*.

> `All About Dance Productions`, 511 Cleveland Rd W, carries `allaboutdancenevada.com` — a real,
> live, well-maintained dance studio **in Minden, Nevada**, which says on its own site that it
> operates only in Carson Valley. Every automated check passes. A visitor gets a phone number
> 2,000 miles away.

And its mirror image, a listing pinned in the wrong town:

> `Just Hookin`, filed at 1299 Marina Dr, Huron. Its own site is titled *"Lake Erie Walleye &
> Steelhead Fishing Charters in **Conneaut, Ohio**"* and gives its departure point as 26 Naylor
> Dr, Conneaut — ~100 miles east. Nothing on the site mentions Huron.

▶ Both are the same root: **an identity resolved on the name string with no geographic
constraint.** The check writes itself and it is town-agnostic: *for every listing with a website,
extract every postal address / city name the site states about itself; if none of them is in this
town or its county, fail loudly.* That catches the Nevada studio, the Conneaut charter, and the
Sandusky-addressed watersports rental below, in a town nobody has looked at. **This is the
highest-value check on the beat.**

Softer sibling, same check catches it: a business whose site gives a **different address in a
neighbouring town** than the listing does (watersports rental: site says Sandusky, listing says
Huron) — 3 of 57 records here had an address the first-party site contradicts.

## 6. ⭐ THE BRAND URL ON A FRANCHISE — a link that leaves town

A fuel station listed only as `Shell` carries `shell.us`, the global corporate site. It is not
dead, not wrong-entity, and completely useless: it says nothing about this forecourt and sends the
visitor out of the neighborhood. Same pattern will hit every chain pin in every town —
pharmacies, banks, fast food, hotels.

▶ Rule: **a `website` whose domain is a national/global brand and whose path is not
location-specific is not a source for this listing.** It should be demoted, not shipped as the
place's link.

## 7. ⭐⭐ AN ACQUISITION COLLAPSES EVERY DEEP LINK TO THE BRAND ROOT

`sawmillcreekresort.com/amenities/beach` → **301** → `sixflags.com/<resort>`.

Not a 404, not a parked domain: a *successful* redirect, to a page about a **wider scope** than
the thing that was linked. The beach page is gone; the corporate landing page answers nothing.
Two of this beat's records (a beach and a yacht club) died this way in one acquisition.

▶ A redirect check that only asks "did we land on a 200?" is blind to this. The tell is
**path collapse**: a deep path redirecting to `/` or to a different registrable domain's root.
That is checkable mechanically and it is the same signature in any town where a local operator
gets bought.

## 8. ⭐ ONE ORGANISATION, SEVERAL PREMISES — and the listing holds one pin

The fire division is **two stations** (413 Main Street and 1830 Bogart Road). The record has one
address, and it is neither — it is the municipal building at 417 Main Street, where the
administration sits. A title company has two offices and the listing carries the *other town's*
phone. A school district's record points at a central office, not the building named.

▶ `address` and `phone` are single-valued, so a multi-site org is forced to pick one and the pick
is usually the administrative one. In a kit this is systematic for fire, police, schools, banks,
clinics and libraries — **the civic backbone of every town.** Either the schema holds
`locations: []`, or the intake must decide and record *which* premises the pin means.

## 9. ⭐ A LISTING THAT IS AN EVENT, NOT A PLACE — and it sits on top of another listing

`Huron Lake Front Market` is a pin at 310 Park St. So is `Lake Front Park and Beach`. They are the
same patch of grass: the market is a **recurring event series held inside another listing's
polygon**, Saturdays 9–3, in summer only.

`hours` cannot express it — the market does not run "every Saturday", it runs on an enumerated set
of dates in a season. Writing `saturday: 09:00–15:00` would assert it is on every Saturday in
February.

Two further traps this one place produced:
- **Confusable siblings.** The same organiser runs a *different* event in the *same park*: the
  Huron Farmers Market, 2nd and 4th Tuesdays, 4–7 PM, June–August. Two event series, one venue,
  near-identical names. A town-agnostic intake will merge them.
- **An organisation with no premises at all.** A Rotary club listed at a street address meets at
  a coffee shop on the first Tuesday and a banquet hall on the second and fourth. **Its "place"
  varies by ordinal week.** An EAA chapter, a book club, a running group, a farmers market and a
  parish youth group are all this shape: real, findable, worth listing, and not a building.

▶ These need a **lifecycle/kind distinction — VENUE vs EVENT SERIES vs ORGANISATION** — before
they need hours. Roughly 6 of 57 records on this beat are not venues.

## 10. ⭐ A SCHEDULE DEFINED BY REFERENCE TO A THIRD PARTY'S CALENDAR

A preschool's year is published as *"the day after Labor Day through the Wednesday before
Memorial Day, **following the Huron City School calendar**"*.

This is different from the term-hours case already reported. The dates are **not stated** — they
are *derived*, from (a) two US federal holidays, which move, and (b) **another organisation's
published calendar**, which the preschool does not control and which is not in our data. Every
church-run preschool, every after-school program, every school-bus-dependent service and every
university-adjacent business in the country resolves its year this way.

▶ There is no honest constant to write down. Either the kit models "closed when the school
district is closed" as a *reference*, or it must say **"term dates follow the local school
calendar"** in words and refuse to fabricate a date range.

## 11. ⭐ "BY APPOINTMENT" APPEARS AS A **DAY SET WITH NO TIMES** (a sharper form than reported)

The prior beat logged by-appointment as a state. The new shape is narrower and more common than
it looks: `Monday–Thursday (by appointment)` and `Saturday: By Appointment Only` are **days that
are neither open nor closed**. Omitting them (what I did) tells the visitor the place is shut
Saturday, which is false. Including them requires inventing times, which is forbidden.

▶ A day needs three states, not two: **open (with intervals) · closed · available by arrangement.**
Two of 57 records here hit this in a single week, on days that matter (Saturday).

## 12. ⭐ A PLACE WHOSE ONLY PUBLIC HOURS BELONG TO A DIFFERENT THING INSIDE IT

A private yacht club publishes hours — but they are its **restaurant's** hours (Tue–Sat 11–9,
Sun 12–6, closed Monday), inside a **May-through-December season**, and the bar outlives the
kitchen on the same evening. The *club* has no hours; membership governs access.

Same shape: a fire station open 24/7/365 (a **coverage** statement, not a counter), a school whose
office hours and bell schedule differ, a research station that is federal property and admits
nobody.

▶ **"What is this an hours-of?"** is an unasked question. A single `hours` field silently claims
*the place* is open, when what was measured is a tenant, a service window, a shift roster or a
season. In a kit this mislabels the most photogenic listings in every waterfront, campus and civic
town.

## 13. ⭐⭐ MEMBERS-ONLY AS A FIRST-CLASS STATE — three ways in one slice

- a yacht club: membership required, restaurant open to members *and their guests*
- a second marina: "privately owned and operated marina that shares **with its members**", 48 docks
- a fraternal order whose published address is a **PO Box**

All three are real, findable, and **not enterable**. A directory that renders them like a café is
telling the visitor something false, and the falsehood is not in any field — it is in the absence
of one.

▶ Needs an `access` axis orthogonal to hours: `public · members · residents · appointment ·
staff-only`. Note the residents case too: a beach in a lakefront subdivision is open to the
neighbourhood and nobody else. **This is where a kit most needs a loud "unknown": shipping a
private place as public is worse than shipping nothing.**

## 14. ⭐ A CATEGORY ASSIGNED BY STRING MATCH ON THE BUSINESS NAME

`Lake Erie Massotherapy` is filed under **`category: parks`, `overture_category: lake`.**

It is a massage practice. It was typed as a body of water because its name begins with the words
"Lake Erie". This is a machine-generated category that is not merely wrong but wrong *in a way
that put a business on the parks beat*, where nobody researching parks would think to question it.

Related garbage in the same slice, all of it `parks`/`lake`:
- **`Lake Erie`** ×2 — the Great Lake itself, twice, no address, no phone. A 25,000 km² lake
  spanning two countries, filed as a local listing.
- **`On Lake Erie`** — a **prepositional phrase** promoted to a business name, given the street
  address of the chamber of commerce. A fragment of marketing copy off that organisation's page.
- **`Rye Beach Rd/W`** — a **street name with a directional suffix**, typed as a beach.

▶ Four of 57 records (7%) are not places at all. The tell in every one is **no address AND no
phone AND no website** — three empty identity fields at once. That is a mechanical, town-agnostic
filter, and it should **quarantine loudly**, not delete silently: a record with no way to be
contacted or found has not been verified to exist.

## 15. ⭐ A SOURCED NEGATIVE IS A FINDING, AND WE HAVE NOWHERE TO PUT IT

Three beaches on this beat (`Beachwood Cove Beach`, `Chaska Beach`, `Rye Beach Rd/W`) are **absent
from the city's own published list of parks and beaches**, which names only two. That absence is
*evidence* — it establishes these are not municipal facilities — and it is the most useful thing I
learned about them. It fits in no field.

▶ The generalisation: **"I checked the authoritative register and it is not there"** is a
different, stronger state than "I could not find anything", and the kit currently collapses both
into a blank record. Every town has an authoritative register for some class of listing (city
parks, state liquor licences, the school district's building list, a diocese's parish list). A
`_checked_against` / `_absent_from` note would let a later pass distinguish *unverified* from
*verified-not-a-thing*.

---

# Dead / unusable URLs in this slice (do not ship)

| record | URL as listed | state |
|---|---|---|
| Riverview Lanes and Cafe | `riverviewlanes.com` | ⛔ **SQUATTED.** Every path 301s to `abutotomacau.com`, an unrelated offshore gambling site. Actively harmful. |
| Huron Rotary Club | `huronrotary.org` | DNS NXDOMAIN |
| Knights of Columbus | `kochuron.org` | Connection times out. **Real site is `kofchuron.org`** — one letter (`kOFc`), so it is a typo, not rot |
| Semper CrossFit | `sempercrossfit.com` | DNS NXDOMAIN (with and without `www`) |
| Marcellas Pizza Huron | `Marcellashuron.com` | DNS NXDOMAIN |
| Usgs Lake Erie Biological Station | `usgs.gov/newsroom/article.asp` | Generic dead stub. Live source: `usgs.gov/centers/great-lakes-science-center/connect/locations` |
| Mariner Village Beach | `sawmillcreekresort.com/amenities/beach` | 301 → `sixflags.com/<resort>`; target page gone (see §7) |
| All About Dance Productions | `allaboutdancenevada.com` | ⛔ Wrong entity, Nevada (see §5) |
| Shell | `shell.us` | Corporate brand root (see §6) |
| Lakeshore Golf Studio | `my.pga.com/coach/…/schedule` | 200 but renders empty (see §4) |
| Woodlands Elem. / McCormick | `huronhs.com` | Works, but 307s to `huronk12.org` — stale, and the name says "hs" for a K-5 and a middle school |
| BGSU Firelands Library | `firelands.bgsu.edu/library.html` | 301 → `bgsu.edu/firelands/library.html` |
| Pabodie Design Studios | `pabodie.com` | 301 → `pabodie.art` |
| Huron Lake Front Market | `huronlakefrontmarket.com` | DNS NXDOMAIN (the market itself is live; only its own domain is gone) |

**13 of 57 records (23%) carry a URL that is dead, redirected away, or pointing at the wrong
entity.** Two of the three sites I needed most (`kofchuron.org`, `huron.net`, the chamber
directory) were also down or erroring at the time of this pass — a reminder that *unreachable
right now* and *dead* are different states and a one-shot check cannot tell them apart.

# Duplicates — two listings, one real place

- `Lakefront Park` (huro-lst-0227) **=** `Lake Front Park and Beach` (huro-lst-0178) — same
  address, 310 Park St. Enriched both identically pending a merge.
- `Chaska Beach, Huron` (huro-lst-0031) **=** `Chaska Beach Lake Erie` (huro-lst-0008)
- `Lake Erie` (huro-lst-0067) **=** `Lake Erie` (huro-lst-0112) — and neither should exist

▶ Note the generative pattern: **the duplicate is the same name with a geographic qualifier
appended or a space inserted** ("Lake Front" / "Lakefront", "Chaska Beach" / "Chaska Beach Lake
Erie"). That is normalisable without local knowledge.

# Wrong / conflicting facts the source record carries

- **`McCormick Junior High School`** is now **McCormick Middle School**, grades **6–8** — the
  record's `subcategory` says `high_school`. Confirmed against the school's own site.
- **`Chapter 50`** is a name FRAGMENT. The organisation is **EAA Chapter 50**, based at Hinde
  Airfield (88D). A bare ordinal as a display name is unreadable in a directory.
- **`St. Peter Catholic School`** is filed under `subcategory: churches` /
  `overture_category: catholic_church`. It is a school, at a different address from the parish.
- **`Cedar Point Center`** — name collides with the Cedar Point amusement park in the next town.
  It is a building on the BGSU Firelands campus; a searcher lands in the wrong place.
- **Huron Fire Division** address is the municipal building, not either station (see §8).
- **Wolph Title** phone is the Fostoria office's, not the Huron one (see §8).
- **Parks & Recreation** — the department's *own page* gives the municipal building's address in
  its footer; the city's contact directory gives the real one, 110 Wall St. **The more specific
  page was the less accurate source.**

# One place probably gone

**Riverview Lanes and Cafe** — reported temporarily closed since a post dated 2025-10-13 (I could
not read the post itself, only a search engine's account of it), and its domain has since been
lost to a squatter. **Domain loss plus a closure notice is a compound signal worth more than
either alone** — a still-trading business rarely lets its domain go to a gambling redirect. Not
established as permanently closed; flagged for a phone check.
