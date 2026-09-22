# Novel input kinds found while researching 8 Huron civic places

Researched 2026-09-21. Each entry: what it is · where it lives · machine-readable? · which town has an equivalent.
Ordered by how much of the corpus it would touch, not by how interesting it is.

---

## 1. A PLACE WITH TWO (OR THREE) SIMULTANEOUS SCHEDULES

Not seasonal, not exceptions — genuinely concurrent day-parts for one address, each true, each meaning
something different to a different visitor.

- **Huron High School** (`hhs.huronk12.org`): **office hours 6:30 AM–3:30 PM** *and* **school day 7:30 AM–2:50 PM**.
- **Huron Sports Academy** (`huronsa.org/contact`): **building 7:15–3:15**, **classes 7:45–3:15**, **breakfast 7:20–7:45**.

Both are plain HTML, trivially scrapeable. `hours` as a single `{open, close}` per day forces a choice, and
whichever we pick is wrong for half of the visitors. This is not a school-only shape: a rec centre with pool
hours inside building hours, a museum with a café that shuts earlier, a courthouse with clerk-window hours
inside lobby hours are all the same structure.

**Equivalent in every town.** Any town with a school, a library with a separate archive desk, or a
municipal building. ⭐ This is the single highest-frequency gap found.

---

## 2. SEASONAL / ACADEMIC-TERM SCHEDULES — TWO SETS, ONE PLACE, SWITCHED BY DATE

**BGSU Firelands Library** (`bgsu.edu/firelands/library/about.html`) publishes both at once:
Fall/Spring Mon–Fri 08:00–17:00; Summer Mon–Thu 08:00–17:00, Fri 08:00–14:00. Plain HTML.

The model holds one set, so whichever we bake is wrong for a third of the year — and it is wrong **silently**,
which is the failure mode the project cares about. A schedule needs a **validity window**, not a single row.

**Equivalent in every town** with a college, a public pool, a park concession, a beach, or a seasonal
visitor centre.

### 2a. And the schedule is often behind a scheduling API, not in the HTML
BGSU's main library publishes hours via **LibCal** (`bgsu.libcal.com/hours/`), a hosted product with a
documented JSON hours API and iCal exports. Firelands' own page duplicates them in prose, which is exactly
how the two drift apart. **Machine-readable: yes, genuinely.** LibCal is near-universal in US academic and
many public libraries, so a LibCal adapter would pay off in most college towns.

---

## 3. SERVICE TIMES — AN INSTANT, NOT AN INTERVAL

**Christ Episcopal Church**: Sunday 10:00 Holy Eucharist (livestreamed to Facebook), Wednesday 09:00
Morning Prayer. A service has a **start time and a name**; it has no published close. Forcing it into
`{open, close}` requires inventing the close, and leaving it out drops the one fact a visitor wants.

Needs its own shape: `events: [{day, time, label}]`. The same shape covers a farmers' market's opening bell,
a council meeting, a mosque's prayer times, a bandstand concert.

**Where it lives** — and this is the second finding: the parish's own site is **gone** (see §7). The service
times came from the **Episcopal Asset Map** (`episcopalassetmap.org`), a denomination-wide, parish-maintained
directory of every congregation with address, worship times and ministries. It is a structured directory with
a public map/JSON layer — **a bulk, machine-readable source of civic-religious places for every town in the US.**
Caveat: no last-updated stamp per record, so it is a lead, not an authority.

**Equivalent in every town.** Most denominations run one (ELCA, UMC, Catholic diocesan directories).

---

## 4. "BY APPOINTMENT" / NO-PREMISES-HOURS AS A FIRST-CLASS STATE

**Salvation Army Huron** is a volunteer-run **Service Unit**, described by its own division as "located in a
community church building or other facility, run solely by volunteers." There is no counter and no shift; you
phone. Third-party directories render this as the string "Appointment Only" in an hours field, which is the
wrong answer dressed as the right one.

Absent hours today means "we didn't find any." It should be possible to state **"this place has no hours by
nature"** — a different, and more useful, fact. Same for a shared-premises tenant that only exists on someone
else's calendar.

**Equivalent in every town**: notaries, home-care agencies, legal aid, veterans' service officers, small
charities operating out of a host building.

---

## 5. LAST-ENTRY / CUT-OFF TIME DISTINCT FROM CLOSING TIME

**Huron Helping Hands** publishes Wed 9–3 and Thu 10–2 **plus** "arrive at least 30 minutes before closing."
The effective door time is 14:30 / 13:30. A visitor who trusts the closing time is turned away.

Machine-readable: no — it is prose next to the hours, and that is exactly why it gets dropped.

**Equivalent in every town**: kitchens with a last-order time, DMV/BMV queue cut-offs, museums with last
admission, transfer stations, pools with a last-swim whistle.

---

## 6. RULE WINDOWS THAT ARE NOT OPENING HOURS

**Old Homestead on the Lake Association** publishes, in a board-issued PDF (`/docs/RR_Summary.pdf`):
**quiet hours 22:00–08:00** and **no pets on the beach or in the parks between Memorial Day and Labor Day**
(a *floating-holiday* season boundary — not a date).

These are intervals with a *constraint* attached, not an availability. They are the right thing to show a
visitor standing on that beach, and there is nowhere to put them. Note also the season is defined by two
US floating holidays, so it cannot be stored as a month range.

**Equivalent in every town**: park curfews, alternate-side street cleaning, snow-emergency parking bans,
noise ordinances, dog-off-leash windows, beach seasons.

### 6a. Related: an HOA is a place that is a POLYGON, not a pin
Old Homestead is a neighbourhood association — its "address" (509 Oneida View Pl) is a registered-agent
address, and the thing itself is the subdivision and its private beach and parks. Every town has HOAs,
BIDs, historic districts, and neighbourhood associations with this same pin-vs-polygon mismatch.

---

## 7. LINK ROT AS A FIRST-CLASS FINDING — AND A CHECK WE DO NOT RUN

Three of eight held URLs were wrong or dead, and none of them failed loudly:

| id | held URL | what it actually does |
|---|---|---|
| `huro-lst-0236` | `christchurchhuron.com` | **NXDOMAIN** — no A record, no NS, at 8.8.8.8 and 1.1.1.1. The alternate `christchurchhuron.org` resolves but **301s to the dead .com**, so the parish is unreachable by either name while still looking alive in search results. |
| `huro-lst-0119` | `centralusa.salvationarmy.org/indiana` | **Resolves fine, wrong state.** The Salvation Army *Indiana Division*. Huron OH is Northeast Ohio Division. A 200 OK on a plausible page for the wrong organisation is the worst case: a reachability check passes. |
| `huro-lst-0276` / `huro-lst-0132` | `huronhs.com` | 307s to `huronk12.org`; the school's real page is `hhs.huronk12.org`. |

⭐ **The general input kind: a URL-provenance check that verifies the page is about THIS place in THIS town,
not merely that it returns 200.** Domain resolution, redirect target, and a town/state token on the landing
page. This is a check, and it runs against any town.

---

## 8. A LISTING FOR A PLACE THAT NO LONGER EXISTS — LIFECYCLE STATE

**Shawnee Elementary** (`huro-lst-0132`) closed 2023-05-26 by unanimous board vote under a consolidation
plan; the building was auctioned for $1.6M and **is now occupied by Huron Sports Academy** (`huro-lst-0021`),
712 Cleveland Road E — i.e. **two listings in this set share one building, one defunct and one live.**
Shawnee survives on the district site only as the mailing address of the Title IX Coordinator, which is
exactly the kind of residue that makes a dead place look alive to a scraper.

The model has no way to say **closed**, no way to say **succeeded-by**, and no way to detect the
address collision. Every town poured from OSM or an old business list will carry dead places; the equivalent
exists everywhere.

---

## 9. SCHOOL-CALENDAR AND EVENT FEEDS (weaker lead, recorded for completeness)

Huron City Schools publishes a per-school calendar page plus a **printable academic-year PDF**
(`files.smartsites.parentsquare.com/.../2026-2027_district_calendar.pdf`) through **ParentSquare/SmartSites**,
a hosted school-CMS used by thousands of US districts. No iCal/RSS URL was exposed on the pages fetched, so
**machine-readability is unconfirmed** — the platform commonly offers feeds, but I did not find one, and that
is a claim I am not making. The interesting part is the **closure calendar**: a school is closed on
~180 named days a year, which no weekly `hours` structure can express.

**Equivalent in every town** with a school district.

---

## Not novel, but worth one line
- **Conflicting first-party phone numbers on the same site** (BGSU Firelands: 419-372-2531 vs 419-372-0739).
  There is no first-party tie-breaker, so the honest output is *no phone*. A "same site disagrees with itself"
  check would catch this class.
