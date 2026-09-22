# The overnight beat: input kinds our `{open, close}` shape cannot hold

Researched on Huron, Ohio, 2026-09-22. **Everything below is stated as a kit problem, not a Huron
problem** — each one is a shape the intake will meet in town #2, #3 and #40, and none of them needs
an operator to have looked at this street to be caught.

The record shape is `hours[<weekday>] = {open, close}`, one slot per day, `"HH:MM"` local, day
omitted when closed. Nine distinct input kinds do not fit it. They are ordered by how badly they
misfire if nobody handles them.

---

## ⛔ 1. A CLOSING TIME AFTER MIDNIGHT. `close < open`. **This is the one that breaks the ticker.**

**Instance:** Knucklehead Saloon, `10:00 → 02:30`. 02:30 is Ohio's statutory last call, so **every
late bar in every Ohio town lands on exactly this value** — and most US states have an equivalent.
This is not a long tail, it is the single most common shape in the overnight set.

**Why it is worse than "unsupported":** a naive `open <= now <= close` comparator does not report
the record as broken. It reports the bar as **CLOSED all day** — or, if the comparator is a
half-open range or a string sort, as **OPEN from 02:30 to 10:00**, i.e. open precisely when the bar
is dark and shut precisely when it is full. ⭐ **The failure is silent and inverted.** A town whose
only overnight tenant is a 2am bar gets a ticker that is confidently wrong all night.

**The kit question:** is a day's slot a *clock window* or a *trading session*? A trading session
that starts Friday and ends Saturday belongs to Friday. Until that is decided, `close < open` must
at minimum be a **loud** validation failure at intake, never a value that flows through.

⚠ `overnight.json` records Knucklehead literally (`close: "02:30"`) with `_past_midnight: true`
so it cannot be consumed by accident. ⛔ Do not "fix" it to 23:59 — that erases the only genuinely
late venue found in the town.

## ⛔ 2. MIDNIGHT ITSELF — `24:00` vs `00:00`. The same bug, one notch quieter.

**Instances:** Mickey Mart and Sand Bar Fri/Sat, Domino's Fri/Sat, Main Street Tavern Fri/Sat. All
publish "12:00 AM". `00:00` sorts *before* the open and triggers §1; `24:00` is outside `HH:MM`.
This file records `23:59`, which loses 60 seconds and is safe — but it is a **workaround chosen by
a researcher**, not a rule the kit enforces, so the next town's researcher will choose differently.
⭐ That inconsistency is the real defect: three towns will disagree on what midnight is.

## ⛔ 3. ONE PLACE, TWO WINDOWS — and the second one is the one the visitor needs.

The shape assumes a place is a single open/shut thing. Repeatedly it is not, and **the sub-window is
narrower than the door**, so publishing the door's hours sends people to a counter that has shut:

| place | outer window | inner window |
|---|---|---|
| Huron Market | store 7a–10p | **liquor sales 9a–10p** (state-regulated, different every state) |
| Discount Drug Mart | store 8a–10p | **pharmacy counter Mon-Fri 9a–9p, Sat 9a–6p, Sun 10a–6p** |
| McDonald's | lobby 5:00–23:00 | **drive-thru 5:30–23:00** (here the drive-thru is *later*-opening; often it is the one that runs all night) |
| Harbor House | bar "12pm–Close" | **kitchen Mon-Thu to 9p, Fri-Sat to 10p, Sun to 8p** |
| hotels (all three) | **front desk 24h** | **check-in 15:00, check-out 11:00**; breakfast 6–10 |
| Sawmill-type resort venues | resort open | pub hours differ |

⭐ **The kit shape this asks for is not more fields — it is a named SERVICE per hours-set**:
`hours.default`, `hours.pharmacy`, `hours.kitchen`, `hours.pump`, `hours.frontdesk`. The ticker then
picks the service it means. Adding a one-off `pharmacy_hours` key solves Huron and nothing else.

⚠ **The hotel case is the sharpest, because it is the whole prize.** Three Huron hotels are the only
records that are honestly open at 3am, and what is open at 3am is the *staffed front desk* — not the
rooms, not check-in. A ticker that says "Comfort Inn River's Edge — open now" at 3am is true, and a
ticker that renders it as *"come on in"* is not. **The record cannot currently say which.**

## ⛔ 4. A 24-HOUR PUMP WITH A SHOP THAT CLOSES — looked for, and NOT FOUND in Huron.

This was the expected headline shape and it is worth reporting that **it did not occur here.** Both
Hy-Miler/Mobil stations publish a single hours block (6a–11p / 6a–10p) that does not distinguish the
forecourt from the store, and ExxonMobil's own station pages have no field for it. So for these
records **whether pay-at-pump runs after the store locks is simply not knowable from the source** —
it is not that the answer is "no", it is that the publisher does not carry the fact.
⭐ **That is the finding: the upstream data has no pump/store distinction at all**, so any kit that
wants it must get it from the operator, never from the brand feed. Treat an absent distinction as
absent, ⛔ never as "the pump follows the store".

## ⛔ 5. AN OPENING TIME WITH NO CLOSING TIME. "…to Close."

**Instances:** Old Fish House publishes "Monday thru Thursday **4 p.m.**" and stops. Harbor House
publishes "12:00pm–**Close**". Riverview Lanes publishes only opening times for all seven days.

The shape requires both ends, so these days had to be **dropped entirely** — Old Fish House is
recorded for Fri/Sat/Sun only, and is therefore rendered as *closed Monday through Thursday*, which
is false. ⭐ **Dropping a day is not neutral: it is an assertion of closure.** The kit needs a
distinct value for *open, end time unpublished* — a day that reads "open from 4pm" and never claims
to know when it stops. Small hospitality businesses write "till close" constantly; this will recur
in every town.

## ⛔ 6. SEASONAL HOURS — and no date telling you which season is live.

**Instance:** Sand Bar carries a summer set and an explicit "fall & winter" set (bar to 10pm
Sun-Thu instead of 11pm). Marinas, lake-town bars, patios, ice cream and mini-golf all do this, and
a lakefront town is *mostly* this. The published data almost never says when the switch happens.
⛔ Picking the longer set is the padding failure. This file picks the **shorter** set when the season
is unresolved, which under-reports but cannot send anyone to a shut door. ⭐ The kit needs
date-bounded hour sets (`effective_from` / `effective_to`), and an intake rule that a place with two
undated sets is flagged, not silently collapsed.

## ⛔ 7. MEMBER ACCESS IS NOT PUBLIC OPENNESS.

**Instance:** Huron Health Club is genuinely 24/7 — the operator's own page is titled "24/7 Gym" —
but that is **fob access for members**. A visitor at 3am cannot get in. The record says
`00:00–23:59` seven days, which is true and useless to a stranger. The same applies to yacht clubs,
private clubs, gated marinas and self-storage, all of which appear in this directory.
⭐ The kit needs an **access class** (`public` / `members` / `guests` / `appointment`) beside the
hours. Without it a 24-hour ticker will eventually promise someone a locked door — the exact failure
this beat exists to prevent, arriving through the front door rather than through a padded hour.

## 8. A WEEK THAT IS NOT SEVEN DAYS.

Several places close on a fixed weekday (Main Street Tavern: Tuesday; Pier Pub: Monday and
Wednesday). The shape handles this correctly by omission — ⭐ **noted here because omission is
overloaded**: it currently means both "closed that day" (§8, correct) and "we could not source that
day" (§5, wrong). Those two must not share a representation.

## 9. AN OPERATOR WHO PUBLISHES NOTHING.

Pier Pub, Knucklehead Saloon, Sand Bar (its listed domain is another state's business), Vega and
Riverview Cafe have no working site of their own. Everything about them comes from aggregators. ⭐ A
kit that accepts only first-party hours will have an empty ticker in a small town; a kit that accepts
aggregators will ship their staleness. The provenance field is the answer, and it only works if it
is **per-record and honest** — `_source` and `_confidence` here distinguish "read off the operator's
page" from "three aggregators agreed", and the second is not the first.

---

# Dead, wrong-entity and hijacked URLs found on this beat

⭐ **Every one of these is machine-checkable and none needed local knowledge.** A link checker over
`listings.json` — status code, redirect target, and *does the fetched page mention the listing's own
street or phone* — would have caught all six in any town, before a human looked at anything.

| listing | URL in the record | what it actually is |
|---|---|---|
| `huro-lst-0198` **Sand Bar** | `thesandbar.com` | ⛔ **WRONG ENTITY** — resolves to The Sandbar, 17 E 8th St, **Lawrence, Kansas**. Loads fine, 200 OK, looks legitimate, and would have shipped Kansas bar hours onto an Ohio map. **The most dangerous class in this table: a live page for the wrong business.** |
| `huro-lst-0237` **Riverview Lanes and Cafe** / `huro-lst-0193` **CUSH Cafe** | `riverviewlanes.com` | ⛔ **LAPSED AND RE-REGISTERED** — 301s to `abutotomacau.com`, an unrelated third party. Two listings point at it. A domain that outlives its business becomes someone else's. |
| `huro-lst-0173` **Hy-Miler** | `hy-miler.com` | 302 to `lostredirect.dnsmadeeasy.com` — DNS placeholder, business's domain gone. |
| `huro-lst-0182` **bp** | `map.bp.com/...62494404505024483900100000000000` | **404** — the brand's own station-locator URL is dead. ⭐ A chain's deep link is not more durable than a small operator's site; it is often less. |
| `huro-lst-0088` **Central Basin Bait Tackle and Carryout** | `tatteredwingswaterandfowl.com` | ⛔ **WRONG ENTITY** — a different business. |
| `huro-lst-0257` / `0114` / `0060` / `0282` | `exxon.com/en/find-station/...` | 301 → `exxonmobilfuels.com/en/find-gas-station/...`. Harmless, but **every ExxonMobil link in the corpus is on an old domain** and a fetcher that does not follow cross-host redirects gets nothing. |

⚠ Also: `choicehotels.com`, `motel6.com` and `yelp.com` all refused or timed out on automated fetch.
⭐ **A kit that sources hotel hours by fetching the brand site will get nothing in any town.** Plan
for it rather than discovering it per-town.

---

# Duplicate records — two or more listings, one real place

⭐ **All of these are findable by the same town-agnostic rule: group by normalised address, then by
phone.** No local knowledge, no skip list.

| one real place | records | note |
|---|---|---|
| 508 Berlin Rd — Mobil-branded Hy-Miler | `0257` HY-MILER #2235 · `0114` Mobil · `0013` Shell | **three records, one forecourt**, all phone 419-433-6204. `0013`'s *brand is wrong* — hours withheld rather than attach a Mobil site's hours to a Shell record. ⭐ A fuel site legitimately has a store name, a brand name and a chain's internal site number; intake treats all three as businesses. |
| 805 S. Main St — Mobil-branded Hy-Miler | `0282` HY-MILER #2234 · `0060` Mobil · `0126` Shell | same pattern; `0126` carries a *different* phone (419-433-2140), so whether it is a stale brand record or a separate site is **not established**. |
| 502 Main St | `0234` Mickey Mart · `0182` bp | store + fuel brand, same phone. Both carry the store's hours. |
| 601 Rye Beach Rd | `0016` Motel 6 · `0201` Microtel Inn Suites Huron | **a rebrand, not a neighbour.** Microtel is marked closed at this address and its own `website` field is a motel-6 booking domain — ⭐ **the record contains the evidence of its own supersession.** |
| 30 Main St | `0006` Old Fish House · `0183` The Old Fish House (Huron, Ohio) | same phone; the second is the OSM-style disambiguated name. ⭐ **A name suffixed with its own town is a near-certain duplicate marker** and is cheap to detect. |
| 125 Main St | `0237` Riverview Lanes and Cafe · `0196` Riverview Cafe Huron, Ohio · `0193` CUSH Cafe | venue + its in-house cafe + a third fragment with no address at all. |
| 356 Main St | `0080` I-5's Bar & Grill · `0235` Vega Bar And Grill Llc. | plus a third identity (Thee Fishermen's Wharf) in the wild, marked closed. ⛔ **Who trades there today is not established** — and it may be a 2am bar, which is the scarcest thing on this beat. Worth the operator's eye. |
| 812 Main St | `0014` Huron Pizza House · `0100` Hph Pizza Llc | ⭐ **the LLC name and the trading name as two records** — another cheap, general rule: an entry ending `Llc`/`Inc` sharing an address with a trading name is the same business. |

## ⛔ And one record that is not a place at all

`huro-lst-0011` **"Vermillion"** — no address, no phone, no website, categorised `convenience_store`.
**Vermilion** (one L) is the neighbouring *city*, 8 miles east. ⭐ **A listing with no address, no
phone and no URL cannot be validated by anything downstream and should fail at intake**, in any
town — it is pure cost from that point on. Its name being a misspelt nearby place-name suggests a
geocoding artifact, but ⛔ the cause is **not established**.
