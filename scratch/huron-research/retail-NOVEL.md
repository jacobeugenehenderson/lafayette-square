# Novel input kinds found researching Huron retail & services

**47 records researched, 2026-09-22.** The brief's cap was lifted mid-run and the slice narrowed to
`category === "services"`; §§1-12 were written from the first 11 (retail-leaning), §§13-21 from the
services pass that followed. Nothing in §§1-12 was contradicted by the deeper pass - several classes were
**sharpened by counterexample**, and where that happened the section says so and points forward.

Each entry: the shape · where it was seen · is it machine-readable · what it looks like in a town nobody
has looked at. Ordered by how much of a typical town's commercial fabric it touches, not by how
interesting it is.

⛔ Final coverage: **9 records with hours out of 47.** That ratio is the beat's single loudest finding and
§§3-6, 10 and 13-19 are the nine distinct structural reasons behind it. ⭐ **On a services roster, a weekly
open/close grid is the exception, not the norm** - and every one of our 38 misses would be recorded by a
naive pipeline as "no data", flattening nine different, individually addressable causes into one shrug.

The first pass found **7 of 11**. The four misses are not sloppiness — each is a
*different structural reason the weekly grid does not exist*, and those four reasons are §3, §4, §5 and §6
below. **On the retail beat, "no hours published" is the majority-adjacent case and it is not one class.**

---

## 1. DEPARTMENT HOURS UNDER ONE ROOF — and one of them is a LEGAL boundary

Confirmed on the civic beat as "concurrent day-parts". Retail sharpens it: **the inner schedule is often the
one the visitor actually needs**, and sometimes it is not the merchant's choice at all.

- **Cornell's Foods** (`cornellshuron.com/StoreLocator/`): store **7:00–21:00 daily**, **deli 7:00–19:00 daily**,
  **lunch served in the deli 11:00–14:00 Mon–Fri**. Three nested schedules, one address.
- **Huron Market** (`huronmarket.com`): store **Mon–Sat 7a–10p / Sun 8a–9p**, **LIQUOR SALES Mon–Sat 9a–10p /
  Sun 9a–9p**. The store opens **two hours before it may legally sell spirits.**

⭐ The Huron Market case is the important one: that inner window is set by **Ohio liquor licensing**, not by
staffing. A shopper who drives over at 7:30am for a bottle is turned away by a store that is open. Baking one
grid and dropping the other ships a *plausible-looking* wrong answer — the failure mode the project names.

**Machine-readable:** yes, both, plain HTML footers.

**Town #2 and every town after:** a grocery with a pharmacy counter · a market with a beer licence · a hardware
store with a rental desk that closes an hour early · a bar whose kitchen shuts at 10 · a garden centre's nursery
yard. ⭐ In a state with different alcohol/firearms/pharmacy hours-of-sale law, the inner window *changes shape
per state* — so this cannot be a per-town constant either.

**Shape needed:** `hours` as a **list of named schedules** — `[{label, days}]` with one designated primary —
rather than one grid. A `basis: "license" | "staffing"` flag would let the renderer say *why*.

---

## 2. A SERVICE MENU THAT IS NOT A FOOD MENU — and it carries DURATION as well as price

The dining beat's `menu_url` is a URL to a document. Personal-services businesses publish a **structured,
priced, timed catalogue**, and it is the primary content of their web presence.

- **Corner Cuts** (`cornercuts.glossgenius.com`): ~34 services. Each has a **price floor** (`$35+`) and a
  **duration** (`30+ min`). Women's Haircut $35+/30min · Bang Trim $15/10min · 2 Row Weft Install · Gel-X
  Extensions · Princess Party.
- **The Easy Speakin Barbershop** (`nicbabkaesb.booksy.com`): 8 services, same shape. Hot Towel Shave $35+/30min ·
  Scalp Massage $10/10min.

⭐ **Duration is the field food menus never have**, and it is the one that makes the listing useful: it tells the
visitor whether they can fit this in at lunch. It is also what the booking platform uses as its unit.
⭐ **The `+` is load-bearing** — "$35+" is a floor, not a price. Flattening it to 35 makes us quote a price the
shop did not.

**Machine-readable:** yes — both render the menu in static HTML, and both platforms (GlossGenius, Booksy) have
consistent markup, so **one adapter per platform covers thousands of towns**.

**Town #2:** every salon, barber, spa, massage therapist, nail bar, groomer, tattoo shop, physio, driving
instructor. On this beat alone the raw listings hold ~15 such businesses. ⭐ This is the **highest-count novel
class on the retail beat** and it has no schema home at all.

**Shape needed:** `services: [{name, price_from, price_unit, duration_min, category}]`, distinct from `menu_url`.

---

## 3. BY-APPOINTMENT AS A **THIRD STATE INSIDE THE WEEKLY GRID**

**Family Eye Care Centers** (`familyeyecarecenters-huron.com/contact-us/`) prints a seven-row grid where
**Friday = "Closed"** and **Saturday = "By Appointment."** — sitting in the same column as `8:30 am - 4:30 pm`.

⭐ **This is not a missing value; it is a value.** Our model has exactly two states — a day with `{open, close}`
and a day omitted. Both available encodings are **wrong and silently so**:
- omit Saturday ⇒ we publish **"closed Saturday"** ⇒ we turn away a customer the business wants.
- invent a window ⇒ we publish a walk-in promise the business will not honour.

There is no third option in the current schema, which is why I omitted it *and flagged it* rather than picking.

**Machine-readable:** yes, it is literally a table cell. The string set is small and repeats across the web
("By appointment", "By appointment only", "Call for hours", "Open by chance or appointment").

**Town #2:** dentists, opticians, lawyers, accountants, notaries, tattoo studios, antique dealers, farm stands,
spas. **Ruhe Haus** (`ruhehausllc.com/s/appointments`) in Huron is appointment-only for *all seven days* — the
same state, applied to the whole week, so the business has no hours at all in our sense yet is plainly open.

**Shape needed:** a day's value becomes a small union — `{open, close}` | `"by_appointment"` | `"call"` |
absent-means-closed. ⭐ And appointment-only must be expressible **at the place level**, not only per day.

---

## 4. THE ONLY WEB PRESENCE IS A BOOKING PLATFORM PROFILE — so hours are a CALENDAR, not a grid

**The Easy Speakin Barbershop** has no domain of its own; `nicbabkaesb.booksy.com` *is* the business online.
Same for **Corner Cuts** (GlossGenius), **Stephanie Vineyard** (Square Appointments), **Integrative
Massotherapy** (Vagaro), **Diva Lashes** and **June Aesthetics** (Linktree), all in the same listings file.

Two distinct consequences, and the second is the one that bites:

1. **`website` points at a third party.** Any check that scores "has a real web presence" by domain ownership
   marks these as absent. They are not absent; they are *platformed*. ⛔ A rule like "skip aggregator URLs"
   would delete the entire personal-services sector of a town.
2. ⭐⭐ **There is no weekly grid to scrape, because the platform does not model one.** Booksy renders
   **bookable availability from a calendar, client-side**. The shop's "hours" are an emergent property of slot
   openings, staff rosters and lead time. I could read the full priced menu out of the static HTML and **could
   not read a single opening time** — that asymmetry is structural, not a scraping failure.

**Machine-readable:** the menu yes, the hours no — not without the platform's API. Booksy, GlossGenius, Vagaro,
Square Appointments, Fresha and Schedulicity between them cover most US personal-services businesses, so
**a handful of adapters covers the class in every town.**

**Town #2:** identical. Any town's salon/barber/spa/massage row will be platform-hosted at roughly this rate.

---

## 5. A SERVICE WITH A **SEASON**, NOT A SCHEDULE

**RS Cycle and Service** (`rscycleandservice.com`) headlines three services, one of which is **off-season
storage**. A boat or bike goes in around October and comes out around April. The business publishes **no hours
at all** — because the thing it sells is not measured in hours.

Related on the waterfront/retail edge: **North Coast Propeller Repair** (`northcoastproptech.com`) advertises a
presence at the **Catawba Island Boat Show, April 24th–25th** — a dated, recurring, **off-site** appearance.

⭐ Both are *temporal facts about a business that the weekly grid cannot express*, and in a Great Lakes town the
seasonal one is the dominant rhythm of the whole commercial strip. **Watch for the sampling trap named in the
brief**: hours scraped in July from a marina, ice-cream stand or bait shop are **a summer artifact**, and the
model has no way to say "this grid is only true May–September". Nothing I recorded this round is seasonal, but
that is luck, not diligence.

**Machine-readable:** partially — "off season" appears as prose; show dates appear as prose.

**Town #2:** a ski town's lift-adjacent retail, a beach town's rental shops, a farm town's grain elevator, any
snow-plough/landscaping contractor that flips services twice a year.

**Shape needed:** the **validity window** the civic beat asked for (§2 there) — `hours` gains `valid_from` /
`valid_to` — plus a separate `seasonal_services` or event list. ⛔ Until then, **every seasonal grid we bake is
silently wrong for half the year**, and it is wrong in the direction of looking right.

---

## 6. PER-STAFF SCHEDULES — the place genuinely has no hours, and says so

**Hello Gorgeous Beauty Bar** (`hellogorgeousbeautybarllc.com`), verbatim:

> "Please note our team is in charge of their own schedules please reach out to the team member you wish to
> book your service with!"

⭐ This is not an omission and not laziness — it is **the operating model stated explicitly**. The salon rents
chairs; each stylist is an independent contractor with their own calendar and their own booking link. There is
no house schedule that could be written down, and **a scraper that "fixes" this by averaging the stylists'
calendars would invent a fact.**

The same structure appears as a **venue-inside-a-venue**: **Emmie.Styled** (`huro-lst-0277`) and **Corner Cuts**
(`huro-lst-0134`) share an address, a phone and a URL. That is a chair renter inside a salon — **two real
businesses at one door, legitimately, not a duplicate to merge.** Ditto **Integrative Massotherapy**,
**Huron Massotherapy** and **Ruhe Haus**, all three at **103 Wall St**.

⛔ **Any dedupe rule keyed on (address + phone) will destroy this**, and it will destroy it *silently*, keeping
whichever record sorts first.

**Machine-readable:** the disclaimer is prose; the underlying per-stylist links are structured (Linktree,
GlossGenius, Booksy).

**Town #2:** salons, barbershops, tattoo studios, massage collectives, co-working suites, professional buildings,
medical office parks. ⭐ **Huron's 202 Cleveland Rd W and 304 Williams St each hold four or five listings** — it
is a suite building, not a data error.

**Shape needed:** a place-level `hours_model: "per_practitioner"` state, and an explicit `inside_of` /
`suite_of` relation so co-located records are **linked rather than collapsed**.

---

## 7. THE LISTING NAME IS NOT A NAME — junk, SEO text, or a stale trading name

Three separate failures of `name`, all in this beat's candidate pool:

| id | `name` we hold | what it actually is |
|---|---|---|
| `huro-lst-0049` | **"Review Phim Hay"** | Vietnamese SEO spam. Sits at 521 Main St with website `Hellogorgeousbeautybarllc.com` — it **is** Hello Gorgeous Beauty Bar, under fabricated text. |
| `huro-lst-0172` | **"Lucky Stone Gifts And Promotions"** | The site brands itself **"LUCKY STONE UNIFORMS"**, a public-safety uniform dealer. Rename, second trading name, or successive tenant — **not established**. |
| `huro-lst-0029` | **"Huron Iga"** | Same address *and same phone* as `huro-lst-0050` "Cornell's Foods". Cornell's **is** the IGA. One store, two records. |

⭐⭐ **The instrument note:** a name-keyed merge, a name-keyed dedupe, or a human skimming the list all fail
differently on these three, and **none of them fail loudly**. This is precisely why the brief demands
`_match_name` copied character-for-character — the id is the only trustworthy key, and I have held to it.

⛔ **Do not build a "junk name" detector from these three strings.** That is a town-#1 skip list. The
town-agnostic check is: **does the record's `website` host resolve to an entity whose name is a near-match of
`name`?** `huro-lst-0049` fails that loudly and correctly, in any town, in any language.

**Town #2:** Overture/OSM ingests carry this everywhere. Expect junk names, franchise-brand names where the
local DBA differs, and the previous tenant's name at a re-let address.

---

## 8. A SERVICE-AREA BUSINESS — hours that are not DOOR hours

**Custom Concrete & Design** (`custom-concrete-design.com`) prints, side by side:

> Hours — Mon–Fri 7:00 am – 6:00 pm · Saturday 7:00 am – 2:00 pm · Sunday Closed
> **Service Area — Northern Ohio**

There is no shopfront. Those are **phone/dispatch hours**; the crew is at somebody's driveway. We hold an address
(543 Berlin Rd) that the site never states, and **a visitor who follows our map arrives at a yard or a house.**

⭐ On this beat the service-area class is *large*: roofers, powerwashers, pet sitters, cleaners, caterers,
photographers, property managers, mobile detailers, auctioneers, freight carriers — ~25 of the 81 `services`
listings look like this.

⛔ **For a kit that pours a MAP, this is a correctness problem, not a cosmetic one.** A dispatch address rendered
identically to a storefront tells the operator the town has a shop where it has none. The current model has no
way to distinguish them, so **every such record is a confident wrong answer.**

**Machine-readable:** "Service Area" is a common, near-literal heading.

**Shape needed:** `premises: "storefront" | "by_appointment" | "dispatch" | "no_public_premises"`, plus
`service_area`. The renderer should be free to **not place a pin** for a dispatch business.

---

## 9. A TRADE CREDENTIAL AS A GRADED FACT

Retail and trades publish certifications that are third-party-granted and revocable, unlike an amenity:

- **North Coast Propeller Repair**: "**PROPSCAN Services – Authorized Facility**" — a manufacturer-granted
  authorisation, verifiable against the grantor's own list.
- **Custom Concrete & Design**: "a trusted member of the **Better Business Bureau**" — self-asserted, and the
  BBB publishes its own directory to check against.
- **Family Eye Care Centers**: operates as **"AEG Ohio Professional, P.C."** — a professional corporation, a
  state-registered form.
- **Huron Ace Hardware**: an **Ace co-op member**, which is why the co-op hosts its store page (§10).

⭐ These are **not amenities.** An amenity ("Wi-Fi") is self-evident and self-asserted; a credential has an
**issuer, a scope, and a state** (current/lapsed) and is **independently checkable**. Flattening them into
`amenities` — which is what I had to do — converts a checkable claim into a marketing bullet, and we then
**republish a lapsed licence as fact**.

⭐⭐ The kit angle: for several of these, the *issuer* publishes a directory. **A credential we can verify against
the issuer is a check the machine can run in a town nobody has looked at** — state contractor licence boards,
health-department inspection scores, ODA pharmacy licences, BBB, franchise/co-op locators. That is the shape
Layer 0 asks for: not "we typed the badge in", but "the badge is re-derivable".

**Shape needed:** `credentials: [{issuer, name, verify_url, as_of}]` — with `as_of`, because a credential
without a date is exactly the expired receipt the gate doc warns about.

---

## 10. DEAD AND WRONG-ENTITY URLs — **liveness is not identity**, and the 301 is the sharp case

Five held URLs failed, in **four different ways**. Verified 2026-09-22.

| id | held URL | failure | class |
|---|---|---|---|
| `huro-lst-0242` Huron Ace Hardware | `huronacehardware.com` | **HTTP 301 → `allisondrennan.com`** | ⭐ **lapsed domain, re-registered**. Final response is **200**. A liveness check **passes**. |
| `huro-lst-0219` Oliver's Hair Salon | `oliverssalon.com` | 200, but it is **Oliver's Hair Salon of Overland Park, KANSAS** | ⭐⭐ **name collision**. 200, real salon, right *name*, wrong *town*. |
| `huro-lst-0003` Erie Supply House | `eriesupplyhouse.com` | **NXDOMAIN** | domain gone. Fails loudly — the easy case. |
| `huro-lst-0154` Gordon Lumber Co | `gordonlumber.com` | **`DEPLOYMENT_NOT_FOUND`** on every path, HTTP 200 body | ⭐ **hosting-platform placeholder**. A real company with a broken deploy — 200 + prose, no error status. |
| `huro-lst-0088` Central Basin Bait Tackle and Carryout | `tatteredwingswaterandfowl.com` | 200, a **guided waterfowl-hunt and charter-fishing outfitter** operating in *Arkansas and Ohio* | plausible adjacency (bait shop ↔ hunting guide) but **a different business**. Not established whether they are related. |

⭐⭐ **The lesson, town-agnostically: only ONE of these five fails an HTTP status check.** Four return 200.
A "dead link" sweep would report 80% of this damage as healthy — ⛔ exactly Layer 0 question 2, a plausible-looking
success. And #2 and #5 would *also* pass a "does the page mention the business name" check.

⚠️ **§10a-10d below were found AFTER this section was written, and each one DEFEATS one of the checks
proposed here.** Read them before implementing any of this.

**The check that catches the class in a town nobody looked at:**
1. follow redirects and **compare the final host to the original** — a cross-host 301 is a lapsed-domain signal
   **regardless of what the destination says**;
2. require the page to contain **the town name or the ZIP**, not just the business name (this alone catches
   Oliver's-Kansas and Tattered-Wings);
3. treat known hosting-error bodies (`DEPLOYMENT_NOT_FOUND`, `There isn't a GitHub Pages site here`, default
   nginx/Apache pages, parked-domain templates) as **failures despite 200**.

⛔ And when it fails: **report it, do not silently swap in an aggregator.** Our replacement for Ace is the
co-op's own store page — better than nothing, but it is *not* the merchant's voice, and `_url_finding` says so.

---

## 11. THE CHAIN/INDEPENDENT LINE IS NOT WHERE THE CATEGORY SAYS IT IS

Three cases in this pool that a naive chain filter gets backwards:

- **Huron Ace Hardware** — "Ace" is a **retailer-owned co-operative**; the store is independently owned. A
  brand-name blocklist deletes the best independent hardware store in town. ⭐ Meanwhile the co-op page is
  *genuinely* the store's data, per-store, structured — **more reliable than many small businesses' own sites.**
- **Cornell's Foods** — an **IGA** member: a local grocer under a shared banner. Same shape.
- **Family Eye Care Centers** — reads local (a 50-year North Coast name) but operates as **AEG Ohio
  Professional, P.C.**, part of **AEG Vision**, a multi-state roll-up. ⭐ **Locally named, corporately owned** —
  the inverse error, and much harder to see.

**Town #2:** co-ops and banners are how independent retail survives in small-town America (Ace, True Value,
Do It Best, IGA, Best Western, NAPA, Carquest, Ben Franklin). ⛔ A chain filter built from brand strings is a
town-#1 artifact twice over: it drops real independents and keeps roll-ups. If we need the distinction, the
question is **"who owns this location"**, and that is not answerable from the name.

---

## 12. SMALL THINGS WORTH A LINE

- **Address disagreements between our record and the merchant's own site**, twice in eleven:
  Corner Cuts **613 vs 615 Main St**, Hello Gorgeous **519 vs 521 Main St**. Neither resolved from first-party.
  ⭐ For a kit that **places a pin**, a two-door error is a real defect, and it is sitting in a field nobody
  checks. Same family as §7's duplicates — the ingest's own geometry is not corroborated.
- **An area code that is not local**: Beagle Bay Knot Works carries **330** (Akron/Canton), not 419/567.
  A cheap, town-agnostic plausibility check — *does the area code serve this place's geography?* — flags it.
  Not necessarily wrong: a sole proprietor's mobile often follows them from another town.
- **A site whose own nav links to a 404** (Family Eye Care `/hours-location`; Beagle Bay `/contact`). ⭐ The
  hours were on `/contact-us/` instead. **Do not conclude "no hours published" from one path.**
- **WebFetch 403 where curl-with-a-UA succeeds** (`cornellshuron.com`). A fetcher that treats 403 as "dead"
  would have lost this record entirely — an instrument defect, not a data defect.
- **Wix/Squarespace/Shopify boilerplate** dominates the stripped text of small-business sites (a 90-entry
  currency dropdown on Beagle Bay's every page). Any keyword scoring over raw page text is scoring the CMS.


---

# Part two — the services pass (36 further records)

---

## 10a. ⭐⭐ THE PARKED PAGE THAT KEEPS THE BUSINESS'S OWN HOSTNAME — this defeats §10's check #1

**Angles Hair Design** (`angleshairdesign.placeweb.site`) returns **HTTP 200** after redirecting to
`ww16.angleshairdesign.placeweb.site/?sub1=<uuid>` and serving a domain-parking page:
*"placeweb.site - placeweb Resources and Information."*

⛔ **My own proposed fix in §10 would pass this.** The redirect is **same-registrable-domain**, so a
"did the host change?" test says no. And the business's name is *in the hostname*, so a
"does the page mention the business?" test also says yes. Two checks, both defeated, by a page with zero
salon content on it.

⭐ **What actually catches it, town-agnostically:** the `ww16.`/`ww25.` **host prefix** and the injected
`?sub1=`/`?dsl=` tracking parameter are signatures of a small number of parking networks — but relying on
those is a skip list waiting to happen. The durable check is the **content** one: *does the page contain
the street, the ZIP, a phone in the right area code, or any word from the business's category?* A page that
matches only the name and nothing else about the place is a parked page.

**Town #2:** `placeweb.site`, `business.site`, `godaddysites.com` and every "free website with your
listing" product. When the free tier lapses, the page parks **but the URL keeps working**. This will be the
single most common dead-URL shape in any small-town dataset.

## 10b. THE EMPTY WEBROOT — 200, a body, no error string

**Reiki and Counseling Center** (`centerforhealth.smithdocs.net`) serves a bare Apache/LiteSpeed directory
index: *"Index of / · cgi-bin · Proudly Served by LiteSpeed Web Server"*. The site was deleted; the server
still answers. Passes a status check, passes a non-empty-body check, contains no error word.
⭐ Catch it on **absence**, not presence: no `<title>`, under ~500 bytes of prose, no phone, no address.

## 10c. TLS FAILURES — and the fallback that makes them dangerous

- **Custom Marine Inc.** (`custommarine.biz`): **certificate name mismatch** — DNS resolves, the server
  answers, the cert covers someone else. ⛔⛔ **The hazard is our own remedy**: a scraper run with
  certificate verification disabled reads whatever that server sends and files it as this business. This is
  Layer 0 question 2 exactly — the fallback turns a loud failure into a quiet wrong answer.
- **Huron Cement Products Co.** (`huroncement.com`): over HTTP, Cloudflare `409 / error 1001`; over HTTPS,
  the **TLS handshake fails outright**. ⭐ **Reachability is a property of the CLIENT AND SCHEME, not of the
  site.** A single-probe health check reports something that is not a fact about the business.

## 10d. THE MALFORMED URL — catchable with no network call at all

**Touch Of My Own Llc/harmonic Egg Huron** holds `http://touchofmyown.com/harmonicegghuron.com` — a domain
with a **second domain glued on as a path**, mirroring the slash in the listing's own *name*. ⭐ A purely
**syntactic** check ("does the path component look like a hostname?") catches this in every town, for free,
before anything is fetched. Worth running first: the cheapest checks find real defects.

### The full URL taxonomy this beat produced
Sixteen defective URLs across 47 records — **roughly one in three** — in **nine** distinct modes:

| mode | examples | HTTP status | caught by a status check? |
|---|---|---|---|
| NXDOMAIN | Erie Supply House, Huron Recovery Specialists, Wray Property Mgmt, Shimer Construction, Touch Of My Own, Laguna Yacht Club | — | ✅ yes |
| cross-host 301 to a stranger | Huron Ace Hardware → allisondrennan.com; Huron Family Dental → **huronk12.org** (the school district) | **200** | ❌ no |
| name collision, wrong town | Oliver's Hair Salon → Overland Park **Kansas**; Lisa's Paws → the **Florida Keys** | **200** | ❌ no |
| adjacent but different business | Central Basin Bait & Tackle → a waterfowl-hunt outfitter | **200** | ❌ no |
| parked, own hostname kept | Angles Hair Design (§10a) | **200** | ❌ no |
| hosting-platform placeholder | Gordon Lumber → `DEPLOYMENT_NOT_FOUND` | **200** | ❌ no |
| empty webroot index | Reiki and Counseling Center (§10b) | **200** | ❌ no |
| TLS mismatch / handshake failure | Custom Marine, Huron Cement (§10c) | — / 409 | ⚠️ partly |
| bot-blocked but alive | Firelands Physician Group → Akamai 403 (§19) | 403 | ⚠️ **false positive** |

⭐⭐ **Eight of sixteen return HTTP 200.** A dead-link sweep would report half this damage as healthy — and
would *also* wrongly condemn the one site that is alive and merely refusing crawlers. ⛔ **Liveness is not
identity, and unreachability is not death.**

---

## 13. ON-CALL 24/7 — availability that is not a building being open

**Foster Funeral Home & Crematory**: *"You are welcome to call us at 1-419-433-5225 any time of the day, any
day of the week, for immediate assistance. Or, visit our funeral home in person at your convenience."*

Two facts, neither expressible. **Phone availability is 24/7; the building's hours are unstated.** Writing
`00:00-23:59` × 7 claims you can walk in at 3am. Omitting `hours` loses the one promise the business makes.

⭐ The generalisation: **the channel has hours, not the place.** Phone, walk-in, online booking and delivery
can each have their own window — the same structure as §1's department hours, rotated from *departments* to
*channels*.

**Town #2:** funeral homes, locksmiths, emergency plumbers, vets, towing, bail bonds, crisis lines,
24-hour pharmacies. Every town has several and they are the ones people search for at the worst moment.

**Shape needed:** `hours` keyed by channel — `{walk_in: {...}, phone: "24/7", delivery: {...}}`.

---

## 14. THE SERVICE-AREA LANDING PAGE — a business "in" a town that may not be there

**All American Roof Pros** carries a Huron address (2401 Sawmill Pkwy) and a site that is
**Mansfield-first**, listing Huron as item 6 of a 22-city "Service Area" menu with a Mansfield-exchange
phone in the header. Whether there is any Huron presence, or only an SEO landing page that an aggregator
converted into an address, is **not established**.

⭐ This is §8 (service-area business) with an extra turn: **the directory has manufactured a place.** The
regional contractor publishes a page per town; the scraper reads one and emits a local business.

⛔ **This is a KIT problem, not a Huron problem, and it scales with the town's obscurity**: the smaller the
town, the higher the share of its "businesses" that are one page of a regional operator's SEO farm.

**Check:** does the site's **primary** phone/address match the town, or is the town only on a list?
A town that appears **only inside an enumeration of towns** is a service-area mention, not a location.

---

## 15. HOME-BASED SOLE PROPRIETORS — the pin points at somebody's house

**Pam Johnston Photography** (914 Salem Dr), **RB's Services** (913 Salem Dr — literally across the street),
**Fixed Performance** (827 Superior Dr), **Custom Concrete** (543 Berlin Rd), **All Builds** (203 Forest
Hills Dr). In every case: a real business, a real registration address, a residential street, and **no
address published on the business's own site**.

⭐⭐ **That silence is the signal.** The operator deliberately does not publish it. We hold it anyway,
because the ingest took it from a registration or a directory.

⛔ **For a kit whose output is a 3D map this is a privacy and correctness defect, not a data-quality nit.**
We would render a labelled commercial pin on a private home, in a town nobody has inspected, at a scale
where the building is individually visible.

**Check:** the business's own site publishes no address ∧ the held address is on a residential street ⇒
mark `premises: "no_public_premises"` and **do not place a pin**. ⛔ This must fail *closed* — absent
confirmation, no pin — which is the opposite of how ingests usually behave.

---

## 16. ⭐⭐ THE MULTI-SITE PRACTICE — the wrong branch's hours, perfectly formatted

Three instances, and this is the class most likely to ship a confident wrong answer.

- **Professional Eye Care** (`peceyes.com`, our record `Dr. Eric Martin`): the home page renders the
  **Amherst** office block immediately before the **Huron** one, with an **identical Mon-Thu grid**. They
  differ only in the address and phone lines. A scraper taking the first `Hours of Operation` on the page
  gets Amherst — and gets a plausible, well-formed answer.
- **Erie Community FCU** (our record is named, unhelpfully, `Credit Union`): publishes a clean grid
  (Mon-Fri 9-5, Sat 9-12) for its **Sandusky** main office. **The Huron address we hold is not on their
  locations page at all.** Copying the grid would invent hours for a branch that may not exist. Recorded as
  not established, with no hours.
- **Family Eye Care Centers**: offices in Sandusky, Huron and Clyde under one site.
- **Lakefront Spa & Tanning**: "Two locations — Huron & Vermilion", with no per-location detail published.

⭐ **The trap is that the wrong answer is better-formed than the right one.** A missing grid looks like a
gap and gets chased; the neighbouring branch's grid looks like success and never gets checked.

**Check:** any hours harvested from a multi-location page must be **bound to an address or a phone found in
the same DOM subtree** as the grid. ⛔ Proximity in the rendered text is not binding — §16's first case has
two grids adjacent and identical.

---

## 17. ⭐⭐⭐ HOURS AS A RELATIVE STRING — *"Open today 08:00 am – 05:00 pm"*

**Dr. Mark A. Myers, DDS** (`markmyersdds.com/huron-office-location`, "Powered by 6AM Digital"). The entire
hours element on the page is:

> **Hours** — Open today 08:00 am – 05:00 pm

⭐ **This is not a weekly schedule. It is a client-evaluated statement about the day of the scrape.** The
full grid exists inside the widget's JavaScript; the HTML only ever says *today*.

⛔⛔ **Why this is the sharpest instrument trap on the beat:**
- Scrape Monday → `08:00-17:00`. Scrape Saturday → something else, or "Closed today".
- **Both look like a fact**, both parse cleanly, neither carries the day it referred to.
- Bake it and you have **written the scrape date into the data with nothing marking it** — a value that is
  right for one weekday and silently wrong for six, and which **re-baking on a different day would change
  without any source having changed.**
- ⭐ It is worse than no data, because no data gets chased and this does not.

I did **not** record these hours. That is the only safe answer with a single fetch.

**Machine-readable:** only by fetching the same page on seven different days, or by rendering the widget.

**Town #2:** GoDaddy Website Builder, Google Business Profile embeds, Squarespace/Wix hours blocks and
several agency templates all render this way. ⭐ **Expect it at a meaningful rate in every town**, and
expect it to be invisible in review, because the extracted value looks completely ordinary.

**Check:** ⛔ **reject any hours string containing a relative day word** — `today`, `now`, `open now`,
`closes in`, `tomorrow`. A trivial regex, and it must fail **loudly**, because the value it rejects is
exactly the one that would otherwise sail through.

---

## 18. ⭐⭐ THE HOLIDAY SCHEDULE — dated exceptions, already in a table

**Erie Community FCU** publishes a **"2026 Holiday Schedule"**: New Year's Day Thu Jan 1 · MLK Day Mon
Jan 19 · Presidents Day Mon Feb 16 · Memorial Day Mon May 25 · Juneteenth Fri Jun 19 · Independence Day
Sat Jul 4 · Labor Day Mon Sep 7 · Columbus Day Mon Oct 12 · Veterans Day Wed Nov 11 · Thanksgiving Thu
Nov 26 · and more.

⭐ **A dated exception list is a first-class input kind and the schema has no room for it.** It is not a
weekly pattern and not a season — it is a set of specific dates on which the weekly grid is **false**.

⭐⭐ **And it is the most machine-readable thing found on the entire beat**: an explicit HTML table, with a
year in its heading, republished annually. Banks, credit unions, government offices, libraries, post
offices, schools and clinics publish one in **every town in the country**, and the US federal holiday set
is itself derivable.

⛔ Without it, a "what's open today" feature is wrong on ~11 days a year, and wrong in the direction of
sending someone to a locked door. ⭐ Note it interacts with §17: a site that says *"Open today"* on a
holiday is reporting the widget's default, not the closure.

**Shape needed:** `hours_exceptions: [{date, closed | {open, close}, label}]` with a `valid_year`.

---

## 19. THE SITE IS ALIVE AND WILL NOT TALK TO US — bot-blocking and client-side rendering

Two different mechanisms, one consequence: **first-party data exists and our instrument cannot see it.**

- **Bot-blocked.** **Firelands Physician Group** (`firelands.com`) returns Akamai **403 "Access Denied"**.
  The site works in a browser. ⛔ Recording "no hours published" would be **false** — the absence is an
  artifact of our user agent. ⭐ Note it is the *opposite* error from §10: there, 200 meant nothing was
  there; here, 403 means something is.
- **Client-side only.** **Integrative Massotherapy** (Vagaro) returns Vagaro's marketing chrome and
  **nothing about the therapist** — ⛔ an extractor grabbing "the phone number on the page" would harvest
  **Vagaro's corporate sales line, (925) 718-0971**, and file it as a Huron massage therapist's number.
  **Bennett's Novelties** (`bennettsdesigns.com`) returns a `<title>` and an empty body.
  **Ruhe Haus** (`ruhehausllc.com`) returns only a title.
- **And the inverse:** `cornellshuron.com` returns **403 to WebFetch** but **200 to curl with a browser
  UA**. The record was nearly lost to the fetcher, not to the source.

⭐⭐ **Therefore "no hours published" is not a finding unless the fetch is known good.** Three distinct
states — *no data exists*, *data exists and is unreadable by this client*, *data exists and the client was
refused* — collapse into one empty field, and only the first is a fact about the town.

**Shape needed:** a `_fetch_status` on every record so a re-run can tell a genuine absence from a blocked
one, and a retry path (rendering fetch, browser UA, platform API) for the other two.

---

## 20. THE PLACE THAT DELIBERATELY HAS NO PUBLIC HOURS

**Laguna Yacht Club** (private association) · **West Bank Marina** (Overture: `private_association`) ·
**Mariner Village Condominiums** · **Huron Professional Building** · **Label Aid**, **Breckenridge**,
**Humanetics**, **n2y**, **Carmeuse** (B2B / industrial).

⭐ These are not missing data — **they are places whose hours are none of the public's business**, and a
pipeline that keeps them in a "needs enrichment" queue will chase them forever and never succeed. A
research agent (human or model) burns real time on them because nothing distinguishes them from a shop that
simply has a bad website.

**Shape needed:** `audience: "public" | "members" | "trade" | "private"` — cheap to infer from the
category, and it **retires a permanent false backlog** in every town.

---

## 21. WHAT THIS BEAT'S INSTRUMENT GOT WRONG — three defects in my own tooling

Recorded because on this project the instrument is where the defect lives.

1. ⛔⛔ **My fetch script leaked the PREVIOUS page into the NEXT record.** `curl -o file` does not truncate
   the output file when the request fails, so a `HTTP 000` on `wraypropertymanagementllc.com` re-read
   `slybailbonds.com`'s body and printed it under Wray's heading. **It looked completely plausible** — a
   full, well-formed page under the right heading — and had I been less careful it would have produced a
   confident, entirely fictional Wray Property Management record. ⭐ **Exactly the shape Layer 0 names: a
   silent substitution inside the instrument, converting a failure into a plausible-looking success.**
   Fixed mid-run by truncating the file first and printing `<<EMPTY BODY>>` explicitly. ⭐ Generalisation
   for the kit's own harnesses: **a fetch failure must destroy the buffer, not leave it.**
2. **I read hours off a 404 page.** `peceyes.com/huron-office` returns 404 but renders the site's full
   footer, complete with a formatted `Hours of Operation` block — *for the Amherst office* (§16). A 404
   that still serves a populated template is normal on modern site builders. ⛔ **Never harvest from a page
   whose status you did not check**, and never conclude "not published" from one path — Family Eye Care's
   hours were on `/contact-us/` after `/hours-location` 404'd.
3. **Search engines answer in aggregator voice.** Asking the web for "Huron Ace Hardware hours" returns ten
   directory sites echoing one grid, which reads as ten corroborating sources and is one. Every fact in
   `retail.json` is sourced to a first-party or co-op page, and where only aggregators existed
   (Oliver's Hair Salon) **no record was written.**

---

## 22. SMALL THINGS FROM THE SERVICES PASS

- **§7a — the dedupe shape that (address + phone) MISSES.** **Angles Hair Design** appears **twice**
  (`huro-lst-0174` 358 Main St, `huro-lst-0076` 816 Williams St) with the **same phone**. Same name + same
  phone + **different** address = one business captured **before and after a move**. ⛔ The obvious dedupe
  key (address + phone) misses it, while §6's booth renters are *destroyed* by that same key. **Two
  opposite errors from one rule** — colocation and relocation need opposite treatment, so the rule has to
  be a judgment, not a key.
- **Suite buildings are real and dense.** 103 Wall St → 3 listings · 202 Cleveland Rd W → 5 ·
  304 Williams St → 4 · 2401 Sawmill Pkwy → 4 · 902 Taylor Ave → 3 · 410 Main St → a funeral home **and** a
  paediatric clinic. ⛔ None of these are data errors.
- **Successive tenants under one roof:** `Admiral's Pointe Nursing and Rehabilitation` and
  `Huron Health Care Center` share 1920 Cleveland Rd W; the latter has no phone and no site. Almost
  certainly a rename — **not established**, so not merged.
- **Phone conflicts between our record and the business's own site:** Fixed Performance (419-433-8219 vs
  419-433-0282), All American Roof Pros (419.989.4480 vs 419-484-3326). Neither resolvable from
  first-party; both left unchanged and flagged.
- **Tracking parameters reveal provenance.** Several held URLs carry `?y_source=`, `utm_source=bing&
  utm_medium=distrib`, `?ppc=cmpyxt` — these came from **Yext/Bing syndication feeds**, not from the
  businesses. ⭐ A URL's *provenance* predicts its reliability, and it is sitting in the URL for free.
- **A name is not a name, continued:** `Credit Union` (a category), `Conceptan/07`, `Review Phim Hay`,
  `Dr. Eric Martin` (a practitioner, for a practice), `Bennett's Novelties` (site says *Designs*),
  `The Firelands` (a Huntington Bank branch record).
- **Curly apostrophes are load-bearing.** `Lulu’s Health Care Clinic` uses U+2019, not `'`. A merge keyed on
  a normalised name will drop it; the brief's character-for-character `_match_name` rule is why it did not.
