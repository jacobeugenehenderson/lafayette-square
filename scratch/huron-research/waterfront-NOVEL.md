# Novel input types — Huron OH waterfront & lodging (8 places, fetched 2026-09-22)

Every entry below is a **kind of input our place-card model has no slot for**, found while researching
real sources. Each says: what it is · where it lives · machine-readable? · would town #2 have it?

The last question is the one that matters. An input type that only Huron has is a curiosity; one that
every waterfront town has is a **field we are missing**.

---

## ⭐ #1 — MONTH-BANDED WEEKLY SCHEDULES (the big one)

**What it is.** Not "a season" and not "a weekly schedule" — **a weekly schedule per band of months**,
several bands per year, each with its own weekday/weekend split. This is the single most consequential
finding of the research and it defeats our model outright.

Huron Lagoons Marina publishes **six** bands. Verbatim from its contact page:

| Band | Schedule |
|---|---|
| Jan–Mar | Mon–Fri 8–5 |
| Apr–May | Mon–Sat 8–5 · Sun 10–3 |
| Jun–Aug | Mon–Thu 8–5 · **Fri–Sat 8–6** · Sun 10–3 |
| Sep–Oct | Mon–Sat 8–5 · Sun 10–3 |
| Nov | Mon–Fri 8–5 |
| Dec | Mon–Fri 8–5 |

Holiday Harbor Marina publishes **three** (May–Oct 7 days 8–5 · Nov–Mar Mon–Fri 8–5 · Apr Mon–Sat 8–5,
Sun 9–4).

**Why it breaks us.** Our model holds exactly one weekly grid. Anything we store is right for part of
the year and **wrong for the rest**, and the card gives the visitor no way to tell which. Note the shape
of the failure: the busy summer band is the one a visitor most often wants, but a scrape run in February
would capture the winter band and look perfectly plausible.

⛔ **The trap is that this is invisible if you only look at one place.** A single-band business scrapes
clean and nothing warns you the field is lossy. It is the same shape as a constant that happens to be
right for town #1.

**Where it lives.** Prose on the business's own contact page. Not in any structured markup.

**Machine-readable?** No. Free text, and each site words it differently ("In Season May - October",
"June-August", "September & October"). Extraction is an NLP problem, not a parse.

**Town #2?** **Yes — near-certain, and this is the general case, not a lake thing.** Any
seasonally-driven business publishes this: ski towns invert it, beach towns match it, and plenty of
inland businesses run reduced winter hours. This is not "marina seasonality", it is *hours are a
function of date*, which is true far more widely than our model assumes.

**Suggested shape.** `hours` becomes a list of `{ from: "MM-DD", to: "MM-DD", schedule: {...} }` bands,
with a single unbanded schedule as the degenerate case so existing data still validates.

---

## #2 — CLOSING TIMES THAT ARE NOT CLOCK TIMES

**What it is.** Holiday Harbor: *"Memorial Day to Labor Day pool hours: 9 AM to sunset."*

Two separate problems in nine words. The range is anchored to **floating public holidays** (Memorial
Day and Labor Day move every year), and the closing time is a **solar event** that varies by date and
by latitude. Neither end of this fact is a constant.

**Why it breaks us.** `close: "HH:MM"` cannot hold "sunset". Writing `"21:00"` would be a fabricated
constant that is roughly right in June and badly wrong in September — exactly the failure mode where a
plausible number ships as truth.

**Where it lives.** Prose on the amenity page.

**Machine-readable?** The words, no. But **"sunset" is computable** from the town's lat/long and the
date — arguably *more* precise than a clock time, if the model can express it.

**Town #2?** Yes for the holiday anchoring (US businesses lean on Memorial Day / Labor Day constantly);
likely yes for "sunset" anywhere with outdoor amenities — pools, beaches, gardens, patios, trailheads.

**Suggested shape.** Allow `close: "sunset"` / `"sunset-30m"` as a resolvable token, and allow band
endpoints to be named holidays rather than fixed dates.

---

## #3 — "BY RESERVATION ONLY", WITH THE MEETING POINT SET PER BOOKING

**What it is.** Rippin Lips Charters has **no hours and cannot have any**. Its page states:
*"Meeting location and time will be determined closer to reservation date."*

**Why it breaks us.** An empty `hours` field currently reads as *"we don't know the hours."* Here the
truth is *"there are no hours; that is the business model."* Those are opposite facts and our schema
renders them identically — a silent substitution of ignorance for a known property.

⭐ Note the second half: **even the LOCATION is per-booking.** The card pins a point on a map, but the
customer does not go to that point — they go somewhere agreed later. Our most basic assumption, that a
place has a fixed location you can visit, does not hold.

**Where it lives.** Prose in the booking terms.

**Machine-readable?** No, but the *flag* is cheap and high-value.

**Town #2?** Yes, and broadly: charters, guides, tour operators, private instructors, mobile services,
event venues, tasting rooms by appointment. Any town with a tourism economy has these.

**Suggested shape.** An explicit `by_appointment: true` that renders as "By reservation" rather than a
blank, plus an optional `location_varies: true`. The distinction between *no hours* and *unknown hours*
must be representable — an absent field should never have to carry a positive fact.

---

## #4 — SAME-DAY CANCELLATION ON WEATHER / LAKE CONDITIONS

**What it is.** Rippin Lips: *"Cancellations due to inclement weather will be solely at the discretion
of the Captain... The Captain's decision to cancel will be made the morning of the charter."*

Whether the business operates on any given day is decided **that morning**, by a human, based on
conditions. No amount of static data predicts it.

**Why it breaks us.** Our card asserts "open Saturday 8–5". For a charter this is not merely imprecise,
it is **structurally unknowable in advance** — the answer does not exist until the morning of.

**Where it lives.** Booking terms, in prose. The *upstream* data is real and public and structured:
NOAA/NWS marine forecasts and Lake Erie wave-height products cover this water.

**Machine-readable?** The policy, no. **The conditions, yes** — NOAA marine zone forecasts are a public
structured feed. A card could plausibly show live small-craft advisories for the town's water body.

**Town #2?** Yes for any coastal/lake/river town — and there is an **inland equivalent**, which is what
makes this a class rather than a marina quirk: golf courses, ski hills, outdoor rinks, ferries, hot-air
balloon rides, orchards. "Operation contingent on conditions" is a general category.

⭐ **This is the most interesting novel input of the set**, because it is the only one where the honest
answer is not a better field but **a live external feed keyed to the town's geography** — which is a
kit-level capability (every town has a weather zone), not a per-place data entry job.

---

## #5 — RENTAL PLATFORMS AS THE ONLY SOURCE (aggregator listings)

**What it is.** Three of our eight places (0213, 0052, and arguably 0220) are short-term rentals whose
only web presence is a **VRBO listing**, not a business site.

**Why it breaks us.** A platform listing is a fundamentally weaker fact than a business's own page:

- **It is not stable.** A VRBO ID can be retitled, delisted, or reassigned to a different owner with the
  URL unchanged. We observed this live: **0052's page does not contain the string "Old Homestead"
  anywhere** — its title is now a marketing line about Cedar Point.
- **It rate-limits and blocks.** 0213 returned HTTP 429 on every attempt. The fact was unobtainable, not
  absent.
- **`unitId` means a listing can be one unit inside a property** — so the ID→place mapping is
  many-to-one, which our one-card-one-URL model does not express.
- **It has no hours at all** — a rental has check-in/check-out, which is a different concept.

**Where it lives.** VRBO / Airbnb / Booking.com.

**Machine-readable?** Partly, and hostile to it. Heavy JS, aggressive bot defence.

⚠️ **Related, and a hazard in its own right:** an aggregator can be **actively wrong about what a
business is**. slipstreamboating.com describes North Coast Boating as a "boat club" with "luxury boat"
memberships. Its own site shows it is a **boating instruction school and vessel delivery service** —
nothing like a club. Had we trusted the aggregator, the card would have described the wrong business
entirely, fluently and plausibly.

**Town #2?** **Yes, and worse in tourist towns** — in a resort town a large share of lodging has no
independent web presence at all.

**Suggested shape.** A `source_type` on every fact (`official` · `aggregator` · `platform_listing`), and
`checkin`/`checkout` as their own fields distinct from `hours`.

---

## #6 — A VENUE INSIDE A VENUE, WITH ITS OWN HOURS

**What it is.** Huron Lagoons Marina contains the **Viking's Den restaurant**, which has its own phone
((419) 433-7649) and its own schedule (Tue–Thu 11–8, Fri 11–10, Sat 8–10, Sun 8–8, closed Mondays
except holidays) — entirely different from the marina office's.

So one map pin has **two different correct answers** to "what time does it close?"

**Why it breaks us.** One card, one hours field. Merging them is wrong either way round; picking one
silently discards the other. The restaurant's hours are the ones a visitor at 7pm actually wants.

⭐ A second instance of the same shape, from the same research: **North Coast Boating's address is
"100 Laguna Drive C-32" — a suite inside Huron Lagoons Marina, which is 100 Laguna Dr.** Two of our
eight listings resolve to the same street address. So the containment relationship shows up *twice* in
a sample of eight, once as co-located hours and once as co-located addresses.

**Where it lives.** A sub-section of the parent's own site; the tenant may have no separate site.

**Machine-readable?** No.

**Town #2?** Yes, everywhere and in many guises: hotel restaurants, mall and food-hall tenants, museum
cafés, marina fuel docks, campground stores, stadium concessions, market stalls.

**Suggested shape.** A `contained_by` / `contains` relation between places, so a tenant is its own card
with its own hours while still resolving to the parent's footprint.

---

## #7 — SLIP / DOCKAGE AVAILABILITY AS INVENTORY

**What it is.** Marina capacity is expressed as **dimensioned inventory with constraints**, not as
amenities. Huron Lagoons: *"Our 40-foot slips can handle boats up to 43×15 feet, and bridge clearance
averages 17-20 feet, depending on current lake levels."* Holiday Harbor: *"our docks can house 20' to
42' boats"*, in drive-up, jet ski, fixed and floating types.

**Why it breaks us.** We flattened these into amenity strings, which loses everything useful. The real
fact is a **fitness test**: *can MY boat go here?* — a function of length, beam and air draft. A string
list cannot answer it.

⭐ And note the tell: **"bridge clearance averages 17-20 feet, depending on current lake levels."** The
constraint is not even a constant — it is a function of a **live measurement** (Lake Erie water level,
which NOAA publishes). A hard number written into our data would be wrong whenever the lake moves, and
wrong invisibly.

**Where it lives.** Marina dockage pages, and separately on booking platforms (Dockwa carries real-time
slip availability for Huron Lagoons — a live feed we do not consume).

**Machine-readable?** The prose, no. **Dockwa-style availability, yes** — it is a real booking API.

**Town #2?** Every marina town. The general class — **"capacity with dimensional constraints"** — is far
wider: campground pad lengths, RV hookups, parking garage height bars, moorage, hangars.

---

## #8 — ENVIRONMENTAL / TRADE CERTIFICATIONS AS GRADED AWARDS

**What it is.** Holiday Harbor holds *"maintained Gold status from the Ohio Clean Marina Program"* and
carries the pledge text on its page.

**Why it breaks us.** We would flatten this to the amenity string `"Ohio Clean Marina - Gold"`, which
throws away that it is a **third-party-verified, graded, revocable, state-registry-backed** credential —
categorically different from "has a pool". It is also *checkable*: the issuing program publishes a
registry, so unlike most of our fields this one has an authority to verify against.

**Where it lives.** The business page; authoritatively, the certifying program's registry.

**Machine-readable?** Registries usually exist as web lists; sometimes downloadable.

**Town #2?** Yes, in local dress — Clean Marina programs exist in many US coastal states; inland
equivalents are Blue Flag beaches, Green Restaurant certification, health-inspection grades, LEED,
historic-register status. ⭐ The **class** is portable even though every specific program is local, which
is precisely the kit-shaped version of this input.

---

## Summary table

| # | Input type | Machine-readable? | In town #2? | Severity |
|---|---|---|---|---|
| 1 | Month-banded weekly schedules | No (prose) | Near-certain | ⭐ **Highest** — silently wrong data today |
| 2 | Sunset / floating-holiday times | Computable | Likely | High |
| 3 | By-reservation-only, floating meeting point | No | Yes | High — absence carries a positive fact |
| 4 | Same-day weather/conditions cancellation | Policy no, **feed yes** | Yes (+ inland analogues) | ⭐ **Most interesting** |
| 5 | Platform listings as sole source | Partly, hostile | Yes, worse in resort towns | High — identity drift observed live |
| 6 | Venue inside a venue | No | Yes, everywhere | Medium-high |
| 7 | Slip inventory + dimensional limits | Prose no, **Dockwa yes** | Every marina town | Medium |
| 8 | Graded third-party certifications | Registry-checkable | Yes, in local dress | Low-medium |

---

## Two cross-cutting notes for the catalogue

**A. A dead URL and a blocked URL are different facts, and we currently cannot tell them apart.**
This sample produced four distinct failure modes behind one symptom:

- **0220** — malformed, NXDOMAIN. *Genuinely dead.*
- **0103** — truncated, but the correct URL is recoverable with evidence (the stored string is a clean
  prefix of it). *Repairable.*
- **0243** — URL is **correct**, but https fails TLS verification and http returns 403 to some
  user-agents and 200 to others. *A link-checker will call this dead. It is not.*
- **0213 / 0103** — 429 and repeated timeouts. *Alive, defended, unreadable.*

⛔ A naive checker marks all four "broken" and a naive scraper marks all four "no data". Only one is
actually dead. **A `url_status` that distinguishes `dead` / `repairable` / `reachable-but-defended` /
`ok` is worth more than the scraped content**, because it tells an operator which listings need a human
and which need a better client.

**B. The suspicion flags in the task brief were right twice and wrong once — and the wrong one is the
instructive case.** 0220 and 0103 were genuinely bad. But **0157 was flagged because the domain is about
waterfowl, and the domain is correct**: one operator (Capt. Aric Rothlisberger) runs a waterfowl guide
service and a fishing charter under a single site, whose contact page is headed verbatim *"Tattered
Wings Waterfowl | Rippin Lips Lake Erie Charters"*.

⭐ The generalisable input type: **one operator, several trading names, one website.** A
domain-name-vs-business-name mismatch is a *reason to check*, never a finding on its own — and a checker
that auto-flagged it would have reported a working listing as broken. That is an instrument-side defect,
and it fails hardest on exactly the small owner-operator businesses a small town is made of.
