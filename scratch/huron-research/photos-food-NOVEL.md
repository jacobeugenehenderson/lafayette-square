# Novel failure classes — Huron FOOD & DRINK photo beat, 2026-09-22

New classes only. Not repeated: relative "open today" strings, wrong-entity URLs, soft 404s,
stock-on-own-CDN, alt-text-as-subject-evidence, seasonal hours, PDF menus, meal-period windows,
and the site-builder data-channel / Wix-prefix classes from `prominent-photos-NOVEL.md`.

Each item ends with the check that catches its class in a town nobody has looked at.

---

## 1. ⛔ THE EXPIRED LOCAL DOMAIN, RE-POINTED AT AN OFFSHORE GAMBLING SITE — 3 of 28 in one slice

Three held restaurant/lodging URLs now serve gambling SEO, all at HTTP 200:

| listing | held URL | what it serves now |
|---|---|---|
| CUSH Cafe | `riverviewlanes.com` | **301 → `abutotomacau.com`** |
| Costa Azul Mexican | `CostaAzulMexican.com` | **→ `jalanamavi.com`**, "AMAVI5D — Situs Toto 4D Terpercaya" |
| Captain Montague's B&B | `captainmontagues.com` | WordPress blog of Indonesian promo articles, author `admin` |

⭐ **Captain Montague's is the one that would have shipped.** The site **still calls itself
`CaptainMontagues`** — the `<title>` is the business name. A name-match identity test passes. Only a
body test for the **town** catches it: zero occurrences of "Huron" in 87 KB.

⇒ This is a **turnover signal, not just a bad URL**: a small-town restaurant domain lapses when the
business closes or changes hands, and the lapsed name is bought within months. A directory that keeps
the URL is publishing a link to a casino under a neighbour's name.

⭐ **The check:** for every held website, require the town name OR the listing's phone OR the street
in the served body. Additionally flag a **redirect whose final host shares no token with the held
host** — `riverviewlanes` → `abutotomacau` scores zero, and that single rule catches all three
without knowing anything about the town. Both rules are content-free.

## 2. ⛔⛔ THE AI-GENERATED PLACEHOLDER SITE — AND THE ALT TEXT IS THE RAW IMAGE PROMPT

`mainsthuron.com`, held for **Main Street Tavern**, returns 200 and is an *aerospace manufacturer*:
"Elevating Aerospace Excellence", fabricated testimonials (Arthur Pendelton, Marcus Sterling),
every nav link an on-page anchor. Its three images are captioned with **literal Midjourney prompts**,
negative flags intact:

> `alt="A sleek, modern aircraft assembly line in a vast hangar … photorealistic aerospace facility
> engineering real environment sky clouds planes flying --no woman"`

A second instance, subtler: `golfsawmillcreek.com`, held for **Mulligan's Pub**, is an AI-written
"independent North Coast golf guide" — real-sounding, topically correct, **not the pub and not the
resort** — whose hero alt is `"Links-style golf fairway curving toward Lake Erie at golden hour"`.

### ⭐ AND IT DEFEATS THE TOWN-NAME TEST FROM CLASS 1
`mainsthuron.com` contains the string **"Huron" 21 times** — *every one of them inside the domain name
printed on the page*. The cheapest identity check we have **passes on a page about aircraft**.

⭐ **The checks, and the second is the one that matters:**
1. **Alt-text-is-a-prompt classifier** — `--no |--ar |photorealistic|ultra.?detailed|8k|cinematic
   lighting|hyperrealistic|wide angle,` in an `alt` attribute ⇒ AI-generated imagery, never a
   photograph of the business. Free, regex, no local knowledge.
2. ⭐⭐ **Count the town name OUTSIDE the domain string.** Strip every occurrence of the host (and of
   the host with separators removed) from the body before counting the town. `mainsthuron.com` then
   scores **0**, and so does Jim's Pizza Box's 404 page (class 4). A town-name test that counts the
   URL is measuring its own input.

## 3. ⭐ DEAD AT THE DNS LAYER — SIX LISTINGS, AND IT IS NOT A 404

`winkspizza.com` · `flavorfuel.menu` · `piedpiper.com` · `i5sbar.com` (two listings) ·
`matrixprovenpos.com` — **`curl: (6) Could not resolve host`**, apex and `www`, IPv4. No record at all.

This is distinct from every URL class filed so far, which were all *responses*. There is no page to
soft-404, no redirect to follow, no gallery to mis-attribute. **It is also the cheapest possible
check and the most certain result we can get** — one DNS lookup per listing, no HTTP, no rate limit,
and a `NXDOMAIN` is not a judgment call.

⭐ **The check:** resolve every held hostname before any fetch pass. `NXDOMAIN` ⇒ the field is dead,
report it loudly and skip the fetch. Run it first: it removed 6 of 49 from this beat's fetch queue in
under a second, and — per Layer 0 question 2 — it *fails loudly* instead of leaving a blank card.

## 4. ⛔ A 404 THAT PASSES THE TOWN TEST, BECAUSE THE NAV IS ON THE 404 PAGE

`jimspizzabox.com/Huron-OH` (held) returns **HTTP 404** — and its body contains "Huron" **ten times**,
because the site's 404 template renders the full nav, which lists Huron, Milan and Vermilion. A
content-only identity test passes on it. The real page is `/huron` — lower case, no state suffix.

⭐ **The check:** assert the **status code** before the content test, and when a per-location URL 404s,
try the same path case-folded and with the `-<STATE>` suffix stripped before declaring it dead. The
general form: *a content test is only meaningful on a 2xx*, and nav chrome is not content.

## 5. ⭐ `og:image` THAT IS A SCREENSHOT OF THE WEBSITE ITSELF

`lambslanding.com`'s only image URL in the served bytes is its `og:image`:
`storage.googleapis.com/wzsitethumbnails/site-48884311/800x500.jpg` — the **site builder's
auto-generated thumbnail of the page**. An `og:image` scraper files a picture of a web page as a
picture of a lakeside cottage. Adjacent to, but not the same as, the "og:image is a wordmark banner"
case already filed: this one is a *screenshot of the site*, produced by the host, not by the operator.

⭐ **The check:** blocklist builder-thumbnail paths (`wzsitethumbnails`, `/site-\d+/\d+x\d+\.jpg`,
`sitethumb`, `screenshot`) in the og:image reader, and treat an og:image whose aspect is exactly the
builder's preview size as suspect. Cheap table, no town knowledge.

## 6. ⭐ A WIXSTATIC MEDIA ID WITH **NO ACCOUNT PREFIX AT ALL** IS WIX'S OWN STOCK LIBRARY

Refinement of `prominent-photos-NOVEL.md §2`, which grouped Wix media ids **by** prefix. Annie's Closet
serves `static.wixstatic.com/media/f1fb3cd0eb5b4dcb89da5cf784e15f3e.jpg`, `alt="Pregnant Woman"` — a
32-hex id with **no `xxxxxx_` prefix**. That form is the Wix built-in stock library, not any account's
upload. The prefix-grouping rule as written has nothing to group and can let it through.

Same page, the other two shapes, for the table:
- `845cd7_…` on a `d0a6d8_` site ⇒ **a different account's** asset (template or third party).
- `d0a6d8_…/Hero_1400x1080_Jardin_Gset_1.webp`, sitting beside `Tea-Forte-Logo.png` ⇒ the operator
  **re-uploaded a supplier's product photography** to their own account. First-party id, not first-party
  picture — the filename (`Gset`, a product SKU-ish token) and the adjacent brand logo are the tells.

⭐ **The check:** three-way classify every `wixstatic.com/media/` id — *no prefix* ⇒ Wix stock;
*foreign prefix* ⇒ not this operator; *own prefix* ⇒ operator upload, **then** run the existing
filename-provenance classifier on it, because own-prefix is necessary and not sufficient.

## 7. ⭐ THE SINGLE-BATCH UPLOAD DATE IS A STOCK TELL WHEN THE FILENAME ISN'T

Huron Pizza House serves `pepperoni-pizza.jpg` ("A delicious pizza"), `spaghetti.jpg`, `cold-cuts.jpg`
— generic names, generic alts, **all four under `/wp-content/uploads/2022/07/`**, the same month as
the logo and the nav tiles. None of the existing filename tells fires: no `unsplash-`, no `FB_IMG_`,
no `Screenshot`. The signal is the **shape of the batch**: a designer's one-time drop, where an
operator's own pictures accumulate across months.

Contrast on the same beat: Gathering Grounds' `/1722000181569-…/` and `/1620396743078-…/` timestamps
span three years; Christina's `PXL_20220505` and `PXL_20220422` are two weeks apart.

⭐ **The check:** bucket a site's images by WordPress upload month (or CDN timestamp). If **every**
content image lands in one month and the filenames are dictionary words, score the set *low on
operator-authorship* and require a second signal before using any of it. Not a verdict — a score. ⛔ It
must not be a verdict: a small operator who built the site once and never updated it looks identical,
and calling that a defect is question 3.

## 8. ⭐ ONE PLACE, TWO LISTINGS, AND ONLY ONE OF THE TWO URLS IS ALIVE

`huro-lst-0006` "Old Fish House" holds `oldfishhousehuron.com` — **expired**, redirecting to a
domain-broker page. `huro-lst-0183` "The Old Fish House (Huron, Ohio)" holds
`oldnorthmaineats.com/old-fish-house/` — **live, WordPress.com, subtitled "Huron, Ohio"**, with the
business's picture on it. Same for `huro-lst-0080` / `huro-lst-0152` (I-5's Bar, both NXDOMAIN) and
`huro-lst-0042` / `huro-lst-0139` (Dairy Queen).

⭐ **The check, and it pays twice:** cluster listings by normalized name + address, then **let a live
URL in the cluster heal the dead one** rather than deduping to whichever record ranks higher. A
duplicate pair is usually two *different captures* of one business, and the union of their fields is
better than either. ⛔ The failure this prevents: deduping to the more "prominent" record and
inheriting its expired domain, which is how a card ends up linking to a domain broker.
