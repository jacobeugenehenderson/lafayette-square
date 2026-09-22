# Novel classes — CIVIC/RECREATION photo slice (46 listings, 2026-09-22)

Only classes not already on the list. Every one is a **check**, not an observation.
Instances are named so nobody re-derives them.

---

## 1. ⛔⛔ The domain lapsed and something ELSE answers — and it answers 200

`riverviewlanes.com` (huro-lst-0237, Riverview Lanes and Cafe):

- `http://www.riverviewlanes.com/` → **522**, 16-byte body.
- `https://www.riverviewlanes.com/` → **200**, after redirecting to **`abutotomacau.com`**, a foreign gambling site.

Same host, two schemes, two completely different verdicts. This is **not link rot** — rot is a
listing whose URL goes quiet. Here the URL went *loud* and is now selling something else. A card
built on a green link check would connect a family bowling alley to a casino.

▶ **The check:** after following redirects, compare the **registrable domain of the final URL**
against the stored one. Fail **loudly** on any change. Status codes cannot see this and neither can
a human scanning a list of green ticks.

## 2. The 200 that is not a page — parked landers and swallowed paths

Three shapes, all returning 200, all invisible to a status check:

| Instance | Shape |
|---|---|
| `ohiocoupons.com/fsmhuronrentals.html` (0077, Sandpiper Cove) | **114-byte** body, no `<body>`; a `window.onload` JS redirect to `/lander`. No HTTP redirect, so a redirect-chain check sees nothing either. |
| `sawmillcreekresort.com/amenities/beach` (0078, Mariner Village Beach) | The redirect **swallows the path**. The deep link lands on the resort's site root. 200, big healthy page, subject gone. |
| `sawmillcreekresort.com` (0135, Mariner Village Yacht Club) | An **acquisition** rewrote the URL's subject without breaking it: now a Six Flags corporate page for a resort in *Sandusky*. |

▶ **The checks:** (a) a 200 whose body is under ~1 kB with no `<body>` is not a page; (b) compare the
final **path** as well as the host — a deep link that lands on `/` has lost its subject.

## 3. The stored value was never a URL

`http://www.joanneberardi/` (0220) — **no TLD**. `dig joanneberardi` → nothing. This never worked;
it is not rot, it is a malformed value that reached the store and sat there.

▶ **The check, and it is the cheapest one in the slice:** at **intake**, assert the website host has
a dot and a known public suffix. Nothing is running it.

## 4. ⛔ The bot wall — healthy for a human, opaque to the pass

Not an absence. **3 of 46**, and one of them is the only listing in the slice with a real licence:

- `firstpresbychurchhuron.org` (0101, Little Wonders Preschool) — **403**, Cloudflare `Just a moment...` interstitial. Retried with full desktop Chrome UA + Accept: same.
- `freedomboatclub.com/locations/lake-erie-huron-oh/` (0144) — **403**, edge block.
- ⭐ `usgs.gov` (0121, USGS Lake Erie Biological Station) — `/centers/great-lakes-science-center` **403**, search endpoint **403**. USGS photographs are **works of the U.S. Government, public domain** — the strongest rights position anywhere in these 46, every one of which otherwise came back "licence not stated". **The absence is ours, not the agency's.**

▶ **The rule:** a 403-with-challenge must be recorded as **BLOCKED**, never as "no photos". Blocked
listings are a re-run queue for a real browser, and 0121 should be first in it.

## 5. ⭐⭐ THE ALT TEXT LIES — the counter-example to the alt-text rule

`lakehouse-apartments-oh.hub.biz` (0221) serves **one** file, `hubbiz.net/images/business_logo.png`,
as **six different businesses' photographs**, each with its own confident alt:

> "Lakehouse Apartments in Huron, OH" · "West Rentals in Huron, OH" · "Villa on the Lake in Huron, OH" · "North Bay Management in Huron, OH" · "Bardshar Apartments in Huron, OH" · "Unfurnished Apartments in Huron, OH"

An aggregator writes a per-business alt onto a **shared placeholder**. An alt-text-driven harvester
takes this as six building photographs and every card shows the same grey logo.

▶ **The check:** alt text is evidence of *subject*, never of *identity*. **Deduplicate candidates by
URL before trusting alt.** One URL appearing under N different alts is a placeholder, and N is the
confidence that it is.

⭐ And the inversion, at Huron Helping Hands (0062): the alt text is **excellent** — every partner
logo named precisely, Second Harvest, Gordon Food Service, Humane Society of Erie County — and it is
excellent *because none of them is a photograph of the place*. **Good alt text is not evidence that a
usable image exists.**

## 6. ⭐ The credit is burned into the PIXELS, not the markup

Two instances, both invisible to every parse:

- `SlussCreditSized.jpg` (0207, Beachwood Villa) — "**Compliments of Sluss Realty**" burned bottom-left. An estate agent's photo reused by the HOA.
- St. Peter's church exterior (0176/0127) — "**Kerrie Lee Visuals**" signed bottom-right.

Nothing in the HTML names either party. **Provenance existed only in the picture.**

▶ **The consequence for method:** an image you cannot attribute from markup is not therefore
unattributed — **you have to open it.** Both of these were found only because the subject had to be
verified by eye anyway.

## 7. ⭐ Stock caught by the GEOGRAPHY, not the filename

`bikinibottomws.com` (0063) og:image, `sunset switch.jpg`, on the operator's own GoDaddy CDN with a
clean filename. It is a Sea-Doo factory shot — and the tell is that the background is a **forested
ridge line of hills**. Lake Erie at Huron has no hills on any shore. (Its siblings confess in the
filename: `2022-Sea-Doo-Switch-Feature-7721910.jpg`, `sea-doo-spark.jpeg`.)

▶ **The rule:** score the candidate against the town's **terrain, shoreline and vegetation**, not just
its filename. A flat-water town rejects a hill; the filename had already passed.

## 8. ⭐ Two positive instruments — a town test and an ownership test, both free

- **UTC offset as a town test.** Shopify embeds `__st = {..."offset":-25200...}`. `villagegallery.com`
  (0069) names no town, no state, no phone, and `/pages/contact-us` 404s — but −25200 is **UTC−7**,
  and Huron, Ohio is UTC−4/−5. Combined with its stock (Kinkade, Godard, Perez limited editions
  with an auction widget) the identity gate fails. **No address needed.**
- **Squarespace site-id as an ownership test.** The `content/v1/<site-id>/` segment separates the
  operator's own uploads from the theme's artwork. **Two ids on one page means two owners.**
  Firelands Montessori (0131): `63c30687…` = its classroom photographs; `624b503c…` = the template's
  boot/wand/spaceship illustrations.

▶ Both belong in the extractor, not in a human's eye.

## 9. Unreplaced TEMPLATE DEMO content, wearing the operator's CDN path

`gullharborsailing.com` (0192) — a correctly identified Huron marina — serves, from its **own**
Squarespace path, `6999613744_d33c3828ed_o.jpg` (a Flickr original-size export) alt-texted
"**Photo Credit: ms.akr**", alongside `ventotene.jpg` (an island off Italy) and
`designed_by_expanded_gallery2.jpg`. The operator replaced the banner and nothing else.

This is not stock-on-own-CDN in the reported sense — it is the **template's demo gallery**, never
touched. ▶ **The tell is a photo credit naming a stranger in the alt attribute**, and a filename
that is a Flickr or stock id.

Related, at Rippin' Lips (0157): an image hotlinked from **`box2513.temp.domains/~aofbpvmy/gobblercompany/`**
— a hosting provider's *temporary* domain, a cPanel user directory, belonging to **another brand's**
project. It dies the day that trial account lapses.

## 10. ⛔⛔ The civic slice's best photography is of IDENTIFIABLE CHILDREN

This slice is schools, preschools, a youth group and a Montessori academy. Their photography is the
best-lit and best-alt-texted in the directory — Huron Sports Academy's is the only genuine
descriptive alt on its page ("Smiling students on the school playground") — **and it is almost all
small children, faces clear and in focus.**

**4 instances:** Huron Sports Academy (0021) hero · St. Peter School (0176) `school-1920w.jpg` and
its og card · Firelands Montessori (0131) painting photo.

A school's consent to publish on **its own** homepage is not consent to appear on a **third-party
neighbourhood directory card**. All four went to `_photos_rights_unclear` rather than being silently
taken or silently dropped.

▶ **This needs a ruling, not a per-agent judgment** — it will recur in every town, and it is
systematically worst in the civic slice, which is where a kit most needs photographs.
⭐ The one that passed: Firelands Montessori's sand-tray shot shows **hands only, no face**. That is
the shape to prefer.

## 11. Two cheap mechanical defects worth a line each

- **Apex dies, `www` lives.** `https://stpetershuron.org/` (0127, stored) → curl exits **000** on both schemes, though DNS resolves to three A records. `https://www.stpetershuron.org/` → 200. A checker that silently tries `www` hides this; one that does not, reports a healthy parish as dead.
- **The 404 that is bigger than the page.** `cityofhuron.org` serves a **36 kB** styled 404; `kofchuron.org` serves **411 kB**. Three of this slice's stored city URLs are 404s (0035 fire, 0203 boat basin, 0228 parks — the whole hyphenated `/parks-and-recreation/` branch is dead; the live paths use underscores and `.php`). **Any body-size heuristic passes all of them.**
