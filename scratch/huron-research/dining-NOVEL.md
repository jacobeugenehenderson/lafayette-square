# Novel input kinds found while researching Huron dining (2026-09-21)

Eight dining listings researched. Everything below is a kind of real-world input the dining
research surfaced that the current place-card shape (`hours` / `description` / `amenities` /
`menu`) cannot hold. Each entry: what it is · where it was seen · machine-readable? · would
town #2 have it?

---

## 1. Meal-period windows inside opening hours ⭐ strongest finding

**What.** A restaurant is open 07:00–20:00, but *breakfast* is only served 07:00–11:00, and on
Sunday the whole restaurant is breakfast-only. A second, narrower service window nested inside the
open/close pair, and it is the one a visitor actually needs.

**Where.** Berardi's Restaurant (`huro-lst-0252`).
`https://berardisrestauranthuron.com/breakfast/`, verbatim: *"Breakfast hours are 7am-11am Tuesday
through Saturday. 7am – 1pm on Sundays."* And the footer: *"Sunday: 7:00am - 1:00pm (Serving
Breakfast Only)."*

**Machine-readable.** Yes — it is plain HTML prose, but it is prose, not a field. It parses with a
simple time-range regex; it does not survive into an `{open, close}` pair.

**Town #2.** Universal. Any restaurant with more than one daypart has this: breakfast until 11,
lunch menu until 4, dinner after 4. Berardi's own menu even encodes it per item — *"Baked Potato
(After 4pm)"* — an availability window attached to a single menu row.

**Shape it wants.** A `service_windows` list keyed by menu/daypart name, independent of the
open/close pair, plus an optional per-item availability window.

---

## 2. Two-tier hours: the kitchen closes before the room

Not observed directly here, but the near-miss is instructive: the Sand Bar's two third-party
sources disagree by exactly one hour on weeknights and by the midnight rollover on weekends — the
signature of one source recording bar close and the other kitchen close. Not recorded as a fact;
recorded as the reason no Sand Bar hours were written.

**Town #2.** Any town with a bar that serves food. This is the same structural need as §1
(a narrower window inside the open window), which argues for one mechanism covering both.

---

## 3. Seasonal hours — and the silent, dangerous case

**What.** A venue whose published hours are only true for part of the year, with nothing on the
page saying so.

**Where.** Viking's Den at Huron Lagoons Marina (`huro-lst-0266`). The marina's own copy is all
summer — *"Start Planning Your Summer of Family Fun"*, *"Our shade trees offer relief from the
summer sun"* — and a Lake Erie marina restaurant almost certainly does not keep Saturday 8am–9pm in
January. The hours available (Yahoo Local) carry **no season marker at all**.

**Machine-readable.** No. The seasonality is an inference from prose; nowhere is it a field.

**Town #2.** Any lake, coast, ski or festival town. This is the kit's own failure shape: a value
that is correct for the town you sampled and silently wrong elsewhere — here, wrong for the same
town six months later. An open/closed indicator driven off unmarked seasonal hours reports
"open" to a visitor standing in front of a shuttered building.

**Shape it wants.** Hours need an optional validity season, and an absent season must be loud,
not assumed year-round.

---

## 4. Dated daily specials

**What.** A block of dishes with prices that is explicitly stamped with a date and is *not* the
standing menu.

**Where.** Berardi's home page: *"Today's Specials — September 19th, 2026"* with Soup, Lunch (3
items, priced), Dinner (2 items, priced), Dessert, Wine and Beer lines. Marconi's home page has an
undated equivalent ("Dinner Specials", 5 items, priced) and a "Weekly Specials" nav entry implying
a weekly cadence.

**Machine-readable.** Yes, and Berardi's even carries its own as-of date — which is the useful part
and also the trap: the page was two days stale when read. Marconi's carries **no date at all**, so
there is no way to tell a fresh special from an abandoned one.

**Town #2.** Very common; the small independent restaurant's main content update.

**Shape it wants.** A specials collection separate from `menu`, carrying its own as-of date and an
expiry, so a card can decline to show a special it cannot prove is current.

---

## 5. Menus published only as PDFs

**What.** The standing menu exists but is a PDF, so nothing downstream can read items or prices.

**Where.** Marconi's (`huro-lst-0239`) publishes **five**: Dinner Menu, Wine List, Family Menu,
Special Events Menu, Catering Menu — all `.pdf` under `italianhuronohio.com/_files/ugd/`. Not
transcribed. Only the HTML specials block was captured.

**Machine-readable.** No, not without a PDF-extraction step. The *set* of menus is, though: five
labelled links is itself structured data.

**Town #2.** Extremely common — arguably the majority case for independent restaurants.

**Shape it wants.** A `menu_documents` list (label + URL + format) that a card can link, distinct
from a transcribed `menu`. Also note the multiplicity: **a place can have several menus**, and
the current single `menu` object has no room for "which one".

---

## 6. Third-party online-ordering integrations

**What.** The "order" button leaves the restaurant's domain for a platform that holds the real,
priced, live menu.

**Where.** Berardi's → `https://order.toasttab.com/online/berardis-huron` (Toast).
Bruno's Pizzeria → an `/order-online` page.

**Machine-readable.** The link is. The menu behind it usually is too (Toast serves structured
data), and it is often *fresher and more complete* than the restaurant's own menu page — which
makes it a tempting and slightly hazardous source: it is the operator's data, but not on the
operator's site.

**Town #2.** Very common. Toast, ChowNow, Slice, Square, DoorDash-white-label.

**Shape it wants.** A typed `ordering` link (provider + URL), so a card can say "Order online" and
name the provider rather than pretending the restaurant hosts it.

---

## 7. Third-party *site* hosts — the whole web presence is rented

**What.** Stronger than §6: the restaurant has no site of its own, and a directory platform hosts
what looks like one.

**Where.** Sand Bar (`huro-lst-0198`) → `https://sandbar.netwaiter.com/`, footer *"Powered By
NetWaiter"*. It carries address, hours and a takeout/delivery flag. It looks authoritative and is
not.

**Machine-readable.** Yes, which is exactly the risk — it will pass any structural check while its
hours disagree with the other aggregator by an hour.

**Town #2.** Common in small towns. Also: Sand Bar posts its actual hours **on Facebook**, which is
the real primary source for a large share of small-town restaurants and is not fetchable.

**Shape it wants.** A source-tier on every fact — operator-owned domain · operator-controlled
platform page · aggregator — so a card can weight and display accordingly.

---

## 8. Reservation / waitlist systems

**What.** Not a menu and not hours: a live queue.

**Where.** Berardi's links a **Google waitlist** (`google.com/maps/reserve/v/waitlist?...`) with
the invitation to join it before you arrive.

**Machine-readable.** The link is; the queue state is not, without an API.

**Town #2.** Common — Google waitlist, OpenTable, Resy, Yelp Waitlist.

---

## 9. Market-price and multi-price menu items

**What.** Menu rows whose price is not a number.

**Where.** Berardi's: *"Perch Dinner … (Market Price)"* and *"Perch Sandwich … (Market Price)"* —
Lake Erie yellow perch, priced at the day's catch. Also **dual prices** on every soup
(`4.50/8.00` = cup/bowl) and **add-on price ladders** (`Fried Egg 1.50 Bacon 2.00 Avocado 3.00`,
`Gluten Free Bread … 1.00`, `Salmon … + Asian Glaze $1.00`).

**Machine-readable.** Yes, but not into a scalar `price`. In `dining.json` these items carry the
printed text in `description` and **no** `price` key — correct, but it means a card showing
"price unavailable" for a dish that is in fact for sale.

**Town #2.** Market price is near-universal for seafood; size tiers (cup/bowl, small/large,
10"/14" pizza) are near-universal everywhere.

**Shape it wants.** `price` as a small union: scalar · named tiers · "market" sentinel · modifier
list. ⛔ A default number here would be exactly the kit's worst failure — a plausible wrong price.

---

## 10. Successive tenants at one address

**What.** Not a dining field, but a *listing* input kind the dining pass exposed: two of the eight
targets resolve to the **same storefront at different times**.

**Where.** `huro-lst-0268` Wink's Pizza and `huro-lst-0214` Bruno's Pizzeria are both **414
Cleveland Rd E, Huron**, both phone **419-433-1500**, both flagged closed by Yelp — and the address
now trades as *Sir Munchies Pizza of Huron*. Separately, `huro-lst-0139` and `huro-lst-0042` look
like one Dairy Queen (428 Cleveland Rd E, store 12683) listed twice under two name stylings.

**Machine-readable.** Address + phone collision is trivially checkable and would catch the whole
class without anyone having looked at the street.

**Town #2.** Guaranteed. Restaurant turnover is high everywhere, and any OSM- or directory-derived
listing set carries dead tenants and name-variant duplicates.

**Shape it wants.** A closed/defunct state that is **loud** (a card that says "permanently closed"
beats a card that silently shows a dead restaurant's hours), and a duplicate check on
address+phone at intake.
