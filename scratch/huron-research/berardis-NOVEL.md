# Berardis card — what the schema could not hold

Written town-agnostically. Each item is a CLASS the kit will hit in a town nobody has looked at;
Berardi's is just where it surfaced first.

## 1. A missing menu is a FINDING, and the schema has nowhere to put it

The brief asked for two menus that a prior beat had recorded as existing. They do not exist. The
catering page is a service blurb plus an inquiry form; the dessert menu is a footer tile that links
nowhere. Both were proven absent — not assumed — by reading the site's own page list.

The schema can express *"here is a dessert menu"*. It cannot express **"we looked, exhaustively, and
this operator publishes no dessert menu"**, which is a different and more useful state than an empty
field. Right now that distinction lives in a `_`-prefixed note, i.e. it does not ship and the next
beat will re-do the same work.

⭐ **The kit consequence:** the gap between *not yet researched* and *researched, confirmed absent* is
the single most re-done piece of work in a directory pour. It wants a machine-readable
**negative result** — per field, with the date and the method — not prose.

⭐ **And the method that found it generalises, which is the actual prize here.** Three checks, none
of which needed anyone to have seen Huron:
- **The CMS's own page index.** `/wp-json/wp/v2/pages?per_page=100` returned exactly 8 pages. That is
  a complete, authoritative answer to *"does a dessert page exist?"* WordPress is the majority of
  small-business sites in any town; the same holds for `/wp-json/wp/v2/media` (which gave the full
  33-item image library, including three files linked from no page at all).
- **A nav label is not a link.** The footer tiles read Breakfast · Lunch & Dinner · **Dessert** ·
  Catering, and a text-only scrape reads that as four menus. In the markup, three carry the theme's
  clickable class and a url; **Dessert carries neither.** A scraper that reads rendered text will
  manufacture a menu that was never published. ⛔ **Check that a label resolves to a target before
  recording the thing it names.**
- **Visual inspection of every image before recording it.** `…-FamilyMenu.jpg` is a photo of a fish
  fillet. `…-Dessert.jpg` is chocolate chip cookies. Filenames are captions written by whoever
  uploaded the file and are wrong often enough that a card built from them would ship mislabelled
  food. ⛔ **A filename is not alt text.**

## 2. A dated specials board is real content with a shelf life the schema does not model

The operator publishes a daily specials board — soup, lunch, dinner, dessert, beer — with real prices,
stamped `September 19th, 2026` and carrying its own disclaimer, *"Subject to availability to promote
freshness."* Fetched three days later it was already the stalest thing on the site.

A `menu.sections` entry has no expiry. Filing this there ships a card that quietly asserts today's
specials are Blueberry Pie and Panko Crusted Haddock, forever. So it is held in a `_`-prefixed key
and ships nowhere — which means **the richest, most current content on the operator's site is the one
thing the card cannot show.**

⛔ This is Layer 0 question 2 in content form: filing perishable data in an evergreen field converts
a stale fact into a plausible-looking success. ⭐ The fix is not a skip rule for specials pages; it is
a **validity window** on a content block (`_valid_on` / `_valid_until`), after which the block
self-suppresses rather than going quietly wrong. Every town has at least one operator with a specials
board, a seasonal menu or a holiday-hours notice.

Related, same class: the media library holds a *"Thanksgiving Pies — pickup Wednesday, November 26th"*
promo from 2025. Seasonal promo art sits in a CMS long after it expires. Anything harvesting an
operator's whole image library will pick it up as evergreen unless dates are respected.

## 3. History belongs to the BUSINESS, not the building — and it predates the address

`listings.json` hangs `history` off a listing that is bound to `building_id: msbf-1673`. But this
history starts in **1942, at Cedar Point**, seventeen years and several miles before the Huron
building existed. The family sold french fries on a park midway until 1978; the restaurant opened in
1979.

So a `history` string on a place card is silently carrying two different kinds of fact — *what
happened at this location* and *what this family did before this location* — with no way to tell them
apart. A town with a business that moved, was founded elsewhere, or occupies a building older than
its current tenant (i.e. every town) has this ambiguity in every populated `history` field.

⭐ **The kit question: is `history` an attribute of the BUILDING or of the OPERATOR?** It is currently
both, undeclared. That is a decision, not a bug — but it is unmade, and it should be made before more
towns are poured with the field filled in.

## 4. An award badge with no year, and a licence nobody can state

The footer carries a **TripAdvisor Certificate of Excellence** badge. It is a genuine award and the
operator displays it themselves — but the badge image carries **no year**, no caption and no link, so
*when* it was awarded is unrecoverable from the source. An award with no year is halfway to an
invented fact.

And the badge cannot be reproduced: it is a third-party trademark. The operator's right to display it
on their own site is not our right to put it on a directory card. ⭐ **A rights class the kit will hit
constantly: third-party trust marks published by the operator — TripAdvisor, BBB, chamber of commerce,
health-department grades, franchise logos.** They are the most *credible-looking* images on a small
business site and the ones we have least claim to. They should be captured as **text with a source**,
never as an image.

Adjacent, and it took inspecting the file to notice: the gift-card promo graphic's filename is
`Flower-elegant-address-label-personal-card-2.jpg` — a **stock design-template name**. The operator
almost certainly licensed a template. ⛔ A filename can be the only evidence that an image on an
operator's own site is not the operator's own work.

## 5. Operator-declared profile links beat name matching — and this town proves it

The business is **"Berardi's Restaurant"** on its website and **"Berardi's Family Restaurant"** on
TripAdvisor, Indeed and its Facebook handle. A crawler matching directory profiles by business name
would have missed them or, worse, attached the profile of a *different* Berardi's — there are several
in Ohio, including a Berardi's Family Kitchen.

⭐ **The method that sidesteps the whole class: take the profile URLs from the operator's own
"Find Us On…" block.** Those are declared, not inferred, and they carry no disambiguation risk at all.
Any town's operator site that links its own Yelp/Facebook/TripAdvisor is handing us a verified
identity mapping for free. ⛔ Name-matching a third-party profile should be a last resort, and when it
is used it should be marked as inferred.

## 6. Contradictions with what we already hold

- **`dining.json` `_menu_note` is wrong on both counts.** It says a catering menu and a
  footer-linked dessert menu exist and were skipped. Neither exists. Detail and proof in
  `berardis.json` → `_menu_finding`. ⚠️ Worth noting *why* it went wrong: the note was written from
  rendered text, where four menu-shaped labels appear. The markup says three link somewhere and one
  does not.
- **`listings.json` `website` is the redirecting host** `berardisrestaurant.com`; canonical is
  `berardisrestauranthuron.com`.
- **The `Online ordering` amenity may be stale.** The operator's Toast page rendered
  *"Online ordering is currently unavailable"* on 2026-09-22. Cause not established — outage,
  out-of-hours, or discontinued. On the demo card this is worth a human check.
- **`dining.json` prices are dollar-shaped** (`13.5`); `listings.json` holds the corrected cents
  (`1350`). The research file was not back-filled. If any later beat re-reads `dining.json` as the
  source of truth, the $0 bug returns. ⭐ The general shape: **a fix applied to the derived artifact
  but not to the upstream research file is a bug with a timer on it.**

## 7. Not done, and why

- **Press, local "best of" wins, Sandusky Register, Huron Historical Society — NOT SEARCHED.** The
  session's web-search budget was exhausted before the first query. Everything in `berardis.json` came
  from the operator's own site, fetched directly. These fields read *"not established"*, which here
  means **unsearched, not absent** — the distinction matters and is recorded in the JSON.
- **The dessert menu itself.** It is not obtainable from published sources; desserts demonstrably
  exist (the specials board names two, the About page calls them "award winning", catering offers
  "fresh baked desserts"), but no prices are published anywhere. Getting it means asking the operator
  or photographing the in-house dessert case. ⛔ It was not invented.
- **The archival history photo is uncaptioned.** It shows a woman and a man among burlap potato
  sacks, and it sits inside the section about Eurosia and Albert Berardi — but the site never names
  them, so the caption was left unwritten rather than guessed.
