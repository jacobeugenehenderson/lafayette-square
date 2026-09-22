# Novel input kinds — dining beat 2, 2026-09-22

38 dining listings researched (the whole un-enriched dining slice). Below are input kinds the
place-card shape (`hours` / `description` / `amenities` / `menu` / `phone`) cannot hold, stated
**town-agnostically**. The previous dining beat already reported meal-period windows,
kitchen-closes-before-the-bar, unmarked seasonal hours, PDF-only menus, market-price items,
ordering integrations and rented web presences — none of those are repeated here.

Each entry: what it is · how it showed up · machine-detectable? · what shape it wants.

---

## A. The listed URL is alive and belongs to SOMEONE ELSE ⭐ strongest finding

**What.** A business's first-party URL expires and is re-registered. It does not 404 — it **200s
with a different company's real content**. Three of 38 records in one slice:

| listed URL | now resolves to |
|---|---|
| a restaurant's own domain | `expireddomains.com` (a domain-sales page) |
| a Mexican restaurant's domain | a completely unrelated restaurant in another state |
| a bowling-alley-with-cafe domain | an offshore gambling site |

Plus two weaker forms in the same slice: a URL pointing at a **neighbouring but different
business** (a donut shop listed with the caterer-next-door's domain), and a URL pointing at **an
entirely different national brand** (a Dunkin' record carrying `sonicdrivein.com`).

**Why it matters for the kit.** This is Layer 0 question 2 in its purest form: an enrichment pass
that fetches `listing.website` and believes what comes back will pour a **plausible-looking wrong
description** onto the map, and nobody will ever learn it is wrong. A 404 fails loudly; a resold
domain fails silently and confidently. ⛔ The status code is not the check.

**Machine-detectable.** Yes, cheaply, and this is the deliverable:
- **Cross-host 301** away from the registered name (all three here were 301s to a different host).
- **Name disagreement**: the fetched page's `<title>` / `og:site_name` / schema.org `name` shares
  no significant token with the listing's `name`.
- **Place disagreement**: the page's postal address or phone, when it has one, is not in this town.
- **Squat signatures**: domain-sale hosts, and pages whose only content is generic.

Any one of these should mark the URL **unusable and loud**, never "no description found".

**Town #2.** Universal and *worse* elsewhere. The decay rate is per-business-age, not per-town;
a town with older independents has more of it. Nothing about the check is town-specific.

---

## B. The site is live, reachable, and empty

A bakery's own domain returns HTTP 200 and renders exactly one word: `Home`. Not parked, not
expired, not redirected — a real site whose content never shipped, or which renders only under a
JS framework the fetcher does not run.

**Why separate from A.** It passes every check in A: right name, right registrant, no redirect. It
fails on *content*. A fetcher that scores "site reachable → trust it" records an absence of facts
as the facts.

**Detectable.** Extracted text below a floor (say < 200 chars) with no address, phone or hours
token ⇒ classify `site_empty`, distinct from `site_dead`. Both are loud; they need different
operator advice ("the URL is wrong" vs "the URL is right, the site is a shell — try their social").

---

## C. An opening time with no closing time

Two operators publish, verbatim, `Open Daily 4pm` and `Monday thru Thursday 4 p.m. / Friday 3 p.m.
to 11 p.m.` — a start with no end, sitting in the same sentence as fully-specified days.

**This breaks the schema in a way that silently lies.** `{open, close}` needs both. The instruction
"omit a day the place is closed" means an omitted Monday reads as **CLOSED**, which is the opposite
of the truth. There is no way to say *"open from 4pm, close not published"* — so the honest record
and the false record are the same record.

**Shape it wants.** `{"open": "16:00", "close": null}` with `null` rendering as "from 4pm" and
**never** as closed, plus an explicit `closed: true` marker so "closed" and "unknown" stop sharing
a representation. That distinction is the fix; the parser is the easy part.

**Town #2.** Very common in bars, drive-ins and kitchens that close when the room empties.

---

## D. Hours withheld ON PURPOSE, and stated as such

Distinct from the previous beat's *unmarked* seasonal hours. Here the operator publishes a
**deliberate non-answer**:

- `Open Daily` + `Hours subject to change at the discretion of the business` (a resort dining room)
- `Open Seasonally`, with no season and no times (two venues at the same resort)
- A national chain's own store page for a specific address that publishes **no hours field at all**,
  while three aggregators quoting that store disagree with each other by a full hour.

**Why it matters.** This is not missing data — it is **authored refusal**, and it is the operator's
decision (Layer 0 question 3). A pass that "fills the gap" from an aggregator is overriding a
statement the business made on purpose, and doing it invisibly.

**Shape it wants.** An `hours_policy` value the card can *print*: `varies` · `seasonal` ·
`call_ahead`, carrying the operator's own words. "Open seasonally — call ahead" is a better card
than seven invented rows, and it is the truth.

---

## E. The listing set contains LEGAL ENTITIES, not places ⭐

Five of 38 records are company registrations wearing restaurant clothes:

- `<Brand> <StreetNumber>, Llp` at the same address as the trading restaurant
- `<Name> Bar And Grill Llc.` at the same address as the bar that actually trades there
- `<Initials> Pizza Llc` at the same address as the pizzeria whose initials those are

Each has the same `building_id` as the real place, usually no phone and no website, and a name no
visitor would recognise. They come in from the source data as siblings of the real listing, and on
the map they would pour as **separate storefronts in one building**.

**Detectable, town-agnostically.** A trailing corporate suffix (`LLC`, `L.L.C.`, `LLP`, `Inc`,
`Co.`, and the local equivalents for a non-US pour) is a strong signal on its own; combined with
*same `building_id` as another dining record* + *no website* + *no phone*, it is close to decisive.
⛔ Not a skip list — a **suffix-plus-collocation predicate**, and it should surface as a **merge
candidate for the operator to confirm**, never a silent delete.

**Town #2.** Universal wherever the source is a business register or an Overture-style aggregate.

---

## F. One storefront, several generations of tenant, all still listed

`132 Main St` carries, in the record set or the search record: a closed restaurant, a second name,
a legal entity, and the bar that trades there today — four names, one door. `356 Main St` carries
three. The kit has no way to say *"this one replaced that one."*

**Detectable.** Same `building_id` + same `category` + more than one record, where only one has a
live website and only one appears on the town's own roster (see §I).

**Shape it wants.** A `succeeded_by` / `former_tenant` relation, so the map pours **one** storefront
and the history becomes content rather than clutter. The alternative — dropping the dead ones — throws
away exactly the local memory a neighborhood site is for.

---

## G. The food business INSIDE another business ⭐

Four distinct instances in one slice, three different host types:

- a sandwich-franchise counter inside a **fuel station** — its listed phone *is* the station's phone,
  and its hours *are* the station's hours
- a grill counter inside a **bowling alley** — listed twice, once under the counter's name and once
  under the venue's, neither with an address of its own
- a dining room, a pub, a market and a pool bar inside a **resort** — four dining records, one
  street address, one phone, and hours set by the host's season

**Why the current shape cannot hold it.** Address, phone, hours and even *open/closed* are inherited
from the host, not owned. The card shows a restaurant with a street address that is really a
building someone else runs.

**Shape it wants.** A `within: <listing id or venue name>` relation, and a rule that an inherited
field is **marked inherited** so an hours check does not flag the child as missing data. It also
gives the map something true to draw: several eateries at one polygon, which is what is there.

**Town #2.** Guaranteed. Gas-station QSRs, hotel restaurants, bowling-alley grills, stadium and
club food, food halls, department-store cafes.

---

## H. Consequences that propagate from the host down

The bowling alley in §G was reported **temporarily closed**; its cafe is therefore closed too, but
the cafe's record says nothing. Similarly the resort's seasonal calendar closes its pub.

**This is the reason §G's `within` relation earns its keep**: without it, a status change on the host
cannot reach the child, and the map keeps a door open that is locked. A closure that is *not*
inherited is the silent-plausible-success failure again.

---

## I. The municipality's own visitor page is a roster oracle — and absence from it is a signal

The town publishes a food-and-drink page naming 23 eateries with address, phone and a written
description. It was the **single highest-yield source in the beat**: first-party enough to quote,
maintained by someone with a reason to keep it current, and it carries *prose about the place*,
which is precisely what the ticker line needs and what no aggregator has.

Two uses, one safe and one sharp:
1. **Descriptions and phones** — a genuine first-party-ish source, better than any directory.
2. **A weak closure signal** — a business that is in the source data but *absent* from the town's own
   list, while 23 peers are present, is worth flagging for a human. In this slice, every record whose
   domain had died was also absent from that page. ⛔ **Absence is a lead, never a ruling** — a new
   business or one that never joined the chamber will also be absent.

**Town #2.** Most towns of any size have a DMO, chamber or "visit <town>" page. Finding it is one
search; it belongs in the intake checklist ahead of any aggregator. ⭐ This is an **input source**
finding, not a schema gap, and it may be the most reusable thing in this file.

---

## J. Smaller kinds, each real, each town-agnostic

1. **The bar day that crosses midnight.** `10:00–02:30` cannot be written as `{open, close}` on one
   calendar day. Any town with late licences has this; it silently truncates or inverts.
2. **A closure notice with no year.** An operator's own site says *"we are closing our doors at the
   end of February"* and gives no year anywhere on the page, and the site's `/hours` link is a 404.
   Undatable by construction — it cannot be determined whether the closure is upcoming or long past.
   A scraped closure notice needs a **captured date**, and with no year it must go to a human.
3. **A first-party page that contradicts itself.** One chain's own store page states the breakfast
   cut-off twice, as two different times, in two fields. First-party is not the same as consistent;
   an intake that trusts the first field it finds records a coin flip.
4. **Brand-name contamination of an independent's record.** An independent donut shop's phone number
   appears in a directory filed under a national donut *brand's* name. Category-to-brand bleed is how
   an aggregator manufactures a chain outlet that does not exist — and the corresponding record in
   this slice may be exactly that phantom. Detect by: a chain-branded record whose phone or address
   collides with a nearby independent's.
5. **No storefront at all.** A by-order home baker at a **residential** address: no hours by design,
   no walk-in, delivery for a stated fee. Two such records here. The card must be able to say
   *"by order only"* rather than leaving an hours-shaped hole — and ⛔ a residential address raises a
   question the kit should ask before pouring a pin onto someone's house.
6. **Wholesale/B2B miscategorised as dining.** One record is a frozen dough manufacturer selling to
   trade accounts, classified `bakery` by the source. No counter, no menu, no hours. Detectable by
   trade vocabulary on the site (*accounts*, *distribution*, *training*, *cases*) with no menu and no
   consumer prices.
7. **The name in the source is not the name on the sign.** Seen repeatedly: `Hq Barbecue` vs the
   storefront's `HQ Barbeque`; `I Fives` vs `I-5's`; a smoothie bar whose sign reads
   `<Name> Smoothie Bar & Café` and whose record reads `<Name>`. Title-casing in the source data also
   destroys real casing. This is upstream of the `_match_name` discipline and is the same failure the
   merge nearly lost five records to last round — worth a **display-name-vs-source-name** field rather
   than a choice between them.
