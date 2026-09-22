# Shopping / arts / historic — input kinds the listing schema cannot hold

Written town-agnostically. Each item is a kind of input, with the Huron instance as the receipt.
Already reported by earlier beats and deliberately not repeated: meal-period windows, unmarked
seasonal hours, PDF-only menus, venue-inside-a-venue, rented web presences.

---

## 1. ⭐ A CATEGORY THAT IS AN ARTIFACT OF THE SOURCE TAXONOMY, NOT OF THE PLACE

**The kind.** An intake category can be populated entirely by one upstream tag firing on the wrong
kind of thing — and when it is, the category's records and the town's *actual* inventory of that
kind are **disjoint sets**. The operator opens the "historic" layer, sees five pins, and has no way
to learn that none of them is historic and that everything that is has no pin at all.

**The receipt.** All five `category: historic` records in Huron are Overture
`landmark_and_historical_building` hits on **private residential property**: two apartment
complexes, a condo-owners' association, a cottage subdivision and a lodging property. Not one is a
landmark. Meanwhile the town's real historic inventory — **twelve interpretive markers**, three
successive lighthouses, a National Register district, an 1859 farmhouse still standing — appears in
the roster **not at all**, because none of it is a *business* and the intake only ingests businesses.

**Why it matters to town #2.** This is the kit's signature failure shape: it is silent. Nothing is
missing-shaped; the layer is populated. ⛔ The fix is not a Huron skip list. Two checks fall out:
- **A category whose members all carry the same upstream tag at similar confidence is suspect** —
  that is a tag firing, not a town.
- **A "historic" layer built only from a business directory is structurally incomplete**, in every
  town. Markers, plaques and listed buildings come from a different class of source
  (marker databases, National Register nominations, the local historical society's own site) and
  **there is currently no intake for them.** In Huron the historical society publishes a
  marker-by-marker index with full transcribed marker text — first-party, structured, free. That is
  a source *kind* available in most American towns and the roster has no door for it.

## 2. A HISTORY THAT BELONGS TO THE GROUND, NOT TO THE OCCUPANT

**The kind.** The `history` field hangs off a listing, so it can only describe the current business.
But the sourced history frequently belongs to the **site** — and the thing standing on it now is
unremarkable, private, or a different business entirely. The schema forces a choice between
attaching real history to the wrong owner and dropping it.

**The receipt.** "Breakwater Cottages" is today a private cottage subdivision with no phone and no
public access. The ground under it was Breakwater Camp, which rented cabins on railroad land by the
east pier through the 1930s and 40s and closed in 1947 when the railroad wanted the land back. That
is the only interesting fact in the record, and it is not a fact *about the listing*.

**Shape of a fix:** history wants to key on the **parcel or the building**, not the tenant. A place
record then *cites* the site history rather than owning it — and a site can carry history with no
listing on it at all (see §1).

## 3. A LISTING THAT IS A FACET OF ANOTHER LISTING — A PERSON, OR A DEPARTMENT

**The kind.** Directory intake produces records that are not places: an **individual employee**, and
a **single counter inside a business**. Both resolve to an address that another record already owns.
They are not duplicates to be deleted (the phone numbers are real and different) and they are not
places to be poured (there is one building). The schema has no way to say *facet of*.

**The receipt.** At one Huron address: `Chad at Valley Ford & Truck Center` (a salesperson) and
`Valley Ford of Huron, Inc. Parts` (the parts counter). Also `Goodwill Industries International,
Inc.` — the **national parent body**, in Maryland, recorded at a local store's address with the
local store's phone and the national website.

## 4. ONE ADDRESS, SEVERAL COUNTERS, SEVERAL SCHEDULES

**The kind.** `hours` is one weekly table per place, but a great many ordinary businesses run
**two or three published schedules under one roof**, and the difference is material to whether the
visit works. This is not the meal-period case already reported: these are **co-located departments**,
not windows within one service.

**The receipts, all from first-party pages:**
- Car dealer: **sales / service / parts** each with their own week (sales runs two hours later two
  nights a week; service and parts open an hour earlier).
- Boat dealer: **sales to 16:00 Saturday, service to 14:00.**
- Drugstore: **store 08:00–22:00, pharmacy counter 09:00–21:00** and shorter at weekends.
- Convenience store: **store hours and a separate, later liquor-sales window** — here a legal
  constraint, so this one recurs in every town with a state alcohol code.

Picking one and dropping the rest is what a single table forces. **Which one we pick is currently
the researcher's silent judgment** — that is the part to fix, whatever the schema ends up holding.

## 5. A DATE-RANGE CLOSURE PUBLISHED AS PART OF HOURS

**The kind.** A weekly table cannot express "closed 24 December to 3 January." Businesses publish
these *next to* their hours, as part of the same block, and in seasonal towns the block is long.

**The receipt.** The boat dealer's own contact page lists, under Hours: Labor Day closed;
Thanksgiving 11/26–11/28 closed; **Christmas & New Year 12/24–1/3 closed.** Ten days.

## 6. BUSINESSES WITH NO PREMISES, AND HOURS-SHAPED TEXT THAT IS NOT HOURS

**The kind.** A meaningful share of any small-town roster is businesses that have an **address but
no door**. They fall into recognisable sub-kinds, each of which the schema mis-serves:

| sub-kind | what it has instead of hours | receipt |
|---|---|---|
| online seller at a home address | a storefront URL | a miniatures maker; a vintage-collectibles eBay seller |
| contractor | a **service area** | a roofer whose record has no address at all |
| by-appointment trade | **event dates** | an auctioneer who works auction days |
| farm gate | **stock** — open when there are eggs | a Rye Beach Road homestead |
| membership club | **reservations** | a boat club: members only, no walk-in |
| event venue | **a season and a fixture list** | a high-school stadium |

⛔ And the specific trap: **a business will put marketing copy in the hours slot.** The contractor's
site reads, under Hours, *"Always Open — We Work Around Your Schedule."* A scraper takes that as
24/7. It is hours-shaped and it is not hours. Any automated hours intake needs to **refuse a string
it cannot parse into times, loudly**, rather than coerce it.

## 7. ONE PLACE, TWO TRUE NAMES (NOT A DUPLICATE TO RESOLVE)

**The kind.** A banner or franchise name and a local trading name are **both correct**, both in use
on the signage, and both appear as separate records. Merging discards a name the town actually uses;
keeping both puts two pins on one building.

**Receipts:** the grocery is `Huron Iga` **and** `Cornell's Foods` — same address, same phone, an
IGA-banner store trading under the family name. The parts store is `NAPA AUTO PARTS` **and**
`Huron Auto Parts` — a locally owned jobber under a national banner. A `name` + `also_known_as`
pair would hold this; a dedupe pass will not.

## 8. A DISPLAY NAME WITH AN EXPIRY DATE (NAMING RIGHTS)

**The kind.** Sponsored names carry a **term**. A name baked into a pour is correct until the deal
lapses, then silently wrong, and nothing in the record records the end date.

**Receipt:** Huron Memorial Stadium became "Mucci Field at Huron Memorial Stadium" under an
**eight-year** agreement starting 2020. Whether that name is current in 2026 could not be
established — which is exactly the point.

## 9. AN ORGANISATION INSIDE A PUBLIC BUILDING, WITH A SLIVER OF THE HOST'S HOURS

Sharpening the venue-inside-a-venue case already reported, because this variant changes **which
hours are wrong**: the Huron Historical Society occupies the **lower level of the public library**
and is open **Wednesdays 15:00–17:00** — two hours a week inside a building open perhaps sixty. A
map that shows the building's hours sends people to a locked room; a map that shows the society's
hours makes the library look shut. Both records are true and they are about the same door.

---

## Dead, wrong-entity and placeholder URLs found on this beat

Every one of these is a `website` field that currently ships a visitor somewhere wrong. In a town
nobody has looked at, **nothing catches these** — the field is populated, so it looks fine.
A reachability + same-entity check over `website` is cheap and belongs in the intake.

| listing | field value | what it actually is |
|---|---|---|
| `huro-lst-0242` Huron Ace Hardware | `huronacehardware.com` | **301s to `allisondrennan.com`** — an unrelated domain |
| `huro-lst-0069` Village Gallery & Framer | `villagegallery.com` | a gallery in **Laguna Beach, California** |
| `huro-lst-0088` Central Basin Bait… | `tatteredwingswaterandfowl.com` | a **guided waterfowl/walleye charter**, different business |
| `huro-lst-0003` Erie Supply House | `eriesupplyhouse.com` | **DNS does not resolve** |
| `huro-lst-0123` Bores Cycle | `borescycle.placeweb.site` | directory-generated placeholder |
| `huro-lst-0097` South Shore Marine | a **YouTube channel** | the real site is `southshoremarine.com` |
| `huro-lst-0018` NAPA | `napaonline.com/en/…/store/802182` | **502s**; live form is `/stores/oh/huron/525-cleveland-rd-w` |
| `huro-lst-0077` Sandpiper Cove | `ohiocoupons.com/…` | a coupon directory page |
| `huro-lst-0221` Lakehouse Apartments | `hub.biz` | a directory page |
| `huro-lst-0130` Firwood Collectibles | `stores.ebay.com/…` | retired eBay URL form |
| `huro-lst-0218` Goodwill | `goodwill.org` | the **national** body, no Huron presence |
| `huro-lst-0234` Mickey Mart | `mickeythemoose.com` | correct chain, but **no page for this store** |
| `huro-lst-0159` Huron Outdoor… | *(null)* | the real site, `huronoutdoorshop.com`, was never captured |

**Two listings that are one real place:** `0029` ≡ `0050` (grocery) · `0218` ≡ `0120` (Goodwill) ·
`0259` ≡ `0145` (car dealer, and one of them is a person).

**A listing that is not a business at all:** `huro-lst-0011` **"Vermillion"** — no address, no
phone, no website. It is the (misspelled) name of **Vermilion, the next town east**, ingested as a
convenience store. ⭐ Worth a check of its own: *a listing whose name matches a nearby
place-name and which carries no address, phone or website is probably a geography row, not a business.*

## A note on source quality, because it inverts the usual assumption

On this beat the **town's own visitor bureau** and the **historical society** were better, more
first-party and more fetchable sources than most of the businesses' own websites — several of which
404'd on their About page, refused the fetch, or had been let lapse. In a small town the *civic*
web is more durable than the *commercial* web. An intake that only looks for a business's own site
will do worst exactly where the shops are smallest — which is most of the towns this kit is for.

## Postscript — where the hours actually are, and why 23 of 35 records have none

Of the 35 records on this beat, **12 carry hours**. The other 23 do not, and the reason is almost
never that the business keeps no schedule. It is that on this beat the small independents publish
hours in exactly one place: **the structured hours block on a Facebook page**, which cannot be read
server-side. Their own websites (where they have one) carry an address and a product line and no
hours at all — this held for the framer, the knot shop, the bait shop, the consignment shop, the
resale shop, the butcher, the miniatures maker and the mobility dealer.

Directories fill the gap, badly: for the motorcycle salvage yard two directories gave hours that
did not overlap at all (09:00–18:00 daily vs Tue–Thu 10:00–14:00), and for the butcher they
disagreed on the weekday open. ⛔ I omitted hours in both cases rather than pick one.

**The kit consequence, town-agnostically:** an hours pipeline that reads business websites will come
back mostly empty in any small town, and an hours pipeline that reads directories will come back
mostly *populated and partly wrong* — which is worse, because it looks like success. Whatever we
build, **it needs a way to represent "this place has hours and we do not know them,"** distinct from
"this place has no hours," and it needs to **refuse to merge two sources that disagree** rather than
taking the first one.
