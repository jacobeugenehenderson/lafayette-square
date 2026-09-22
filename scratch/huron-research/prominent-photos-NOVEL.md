# Novel failure classes — Huron photo beat, 2026-09-22

New kinds only. The hours/relative-string and URL-liveness classes earlier beats named are not
repeated; where an instance of those turned up it is recorded in `prominent-photos.json` and not here.

Every item below is a **class**, and each ends with the machine check that catches it in town #2.

---

## 1. A page that is "client-rendered and empty" can have its whole content model in the HTML

`bennettsdesigns.com` was written off by the retail beat as JS-only: 200, and nothing in the served
HTML but a `<title>`. It is a **Square Online** site, and Square Online embeds the entire page model —
copy, section headings, hours, address, phone and **every image path** — as a JSON blob in the served
document. The beat's `<img src=` scrape found nothing because there are no `<img>` tags; the fifteen
photographs are in `"original":"/uploads/b/<hash>/..."` fields.

The same is true of **Shopify** (`/products.json` is public and unauthenticated — it handed us Beagle
Bay's whole catalogue with image URLs) and of **Wix** (`data-image-info` carries the original
dimensions and media id even when the `<img src>` is a 147px blurred placeholder).

⭐ **The check:** a "no images" verdict is only valid after looking for the platform's data channel, not
just for `<img>`. Detect the generator (`<meta name="generator">`, `cdn.shopify.com`, `wixstatic.com`,
`squarespace-cdn.com`) and read that platform's own image field. A site-builder platform is a **known,
finite list** — this is a table, not a per-town judgment.

## 2. First-party is not the same as the operator's — the Wix/Squarespace media-prefix test

Hello Gorgeous's home page serves fifteen images from `static.wixstatic.com`. Ten of them are under the
media prefix `d7cb80_` and four under `823c34_`. A Wix media id's prefix is the **account** that uploaded
the file. `d7cb80_` is not this salon; those ten are template decorations that shipped with the theme.
They sit on the operator's own page, on a first-party-looking CDN, and are not the operator's pictures.

⭐ **The check:** group a Wix/Squarespace page's media ids by prefix, take the prefix that the page's own
uploads use (the one that also appears on its interior pages), and discard the rest. A prefix that
appears on *every* site built from the same template is a template asset. One rule, no town knowledge.

## 3. A chain's per-store URL that serves the corporate home page at HTTP 200 — byte for byte

`discount-drugmart.com/stores/ohio/huron/discount-drug-mart-huron-24` returns 200 and 82,426 bytes.
So does `discount-drugmart.com/`. **Same md5.** The store path has no store on it, and contains zero
occurrences of "Huron". A photo beat scraping that URL would have filed corporate product artwork and
the chain's social icons as pictures of the Huron store, with a per-store URL as its provenance —
a plausible-looking success of exactly the kind Layer 0 names.

This is a sharper thing than "liveness is not identity": the URL is *structurally correct*, it names
the right state, town, brand and store number, and it is still empty.

⭐ **The check:** for any per-instance URL under a chain domain, fetch the domain root as well and
compare hashes. Identical ⇒ the per-instance page does not exist. Also assert the instance's own town
name appears in the body. Both are content-free rules; neither needs anyone to know the town.

## 4. A fetcher gets the independents and misses the chains — and that is the RIGHT way round

Every independent on this beat gave up its pictures. **All three hotels gave up nothing** —
`choicehotels.com` resets the HTTP/2 stream, times out on HTTP/1.1 and times out in WebFetch;
`motel6.com` resets the stream.

### ⛔ CORRECTED 2026-09-22 (Jacob): *"Comfort Inn, Quality Inn and Motel 6 do not have photo
galleries Huron is going to be incomplete without."*

This section first called the hotels "the listings with the largest, best-lit, most professionally
shot galleries in the directory" and concluded the kit therefore needs **a different instrument** to
reach them. ⛔ **Both halves were wrong, and they were wrong in the same way: they measured the
photography and not the PLACE.** A chain hotel's gallery is branded room stock, interchangeable
between Huron and Sandusky and Toledo — it is the *least* town-specific imagery in the town. A
directory of Huron loses nothing by lacking it.

⭐ **So the gap is not inverted, and nothing needs budgeting as a category.** The fetcher succeeded on
exactly the places that make a town look like itself — a storefront, a rope wreath, a drone shot of a
marina, thirteen captioned historical markers — and failed on the ones a visitor could see anywhere.
⚠️ **The prominence rank is what made this look alarming**: three hotels rank high on footprint and
brand signals, so a "high prominence, no photos" query surfaces them first. That is a property of the
scorer, not evidence about what a card needs — and it is the same reason prominence was rejected as
the directory's primary sort, where it put six fast-food chains above a 1979 family restaurant.

⇒ The real photo queue is the **independents still without pictures**, and a browser-operator pass on
chain lodging is worth roughly what a stock room shot is worth.

## 5. Stock photography on the operator's own CDN — and it usually says so in the filename

The Barre Collective's home page serves
`.../dbcfbd68-.../unsplash-image-yKlzaQNb-QY.jpg` from its own Squarespace CDN. It passes every
first-party test we have: operator's domain, operator's CDN, operator's page. It is an Unsplash stock
photo, and Squarespace's stock-image picker wrote that provenance into the **filename**.

The same site's `og:image` is a social-share banner with a wordmark on it — the image a naive
`og:image` scraper takes first is artwork, not a picture of the place.

Adjacent, same shape, other filename tells found on this beat: `FB_IMG_1716862463704.jpg` (saved out of
Facebook, photographer unknown), `Screenshot_20240607_100825_Canva.jpg` (a screenshot of a Canva design),
`Screenshot_20241006_125606_Facebook.jpg` (a screenshot taken inside an app), `orafol_*.jpeg` (a vinyl
supplier's brand image on a sign shop's page).

⭐ **The check:** a filename-provenance classifier — `unsplash|pexels|shutterstock|istock|getty|adobestock`
⇒ stock; `^FB_IMG_|_Facebook\.|_Instagram\.` ⇒ re-uploaded from a social app; `^Screenshot` ⇒ not a
photograph; `^(IMG_|DJI_|DSC|PXL_|\d{8}_\d{6})` ⇒ an original camera capture, the good case. Filenames
survive re-upload far more often than EXIF does, and the classifier is a regex table with no local
knowledge in it.

## 6. Alt text is where the operator says what a picture is — and its absence is the finding

The one place on this beat where "what does it show" was **established** rather than inferred is where
operators labelled their own images:
- Upside Down Art Studio: `alt="adult studio.jpg"`, `alt="youth studio.jpg"` — the operator naming its
  own rooms.
- Huron Historical Society: twelve carousel images, each in an `<li>` with a caption `<p>` naming the
  marker and an `<a>` to that marker's page. Caption *and* link target, both machine-readable.

Everywhere else — South Shore Marine's drone shots (`alt="Contact page"`), Hello Gorgeous's two 2048px
home-page photographs (`alt=""`), Bennett's fifteen (`"altText":""` throughout) — the image is real and
first-party and **what it depicts is not recoverable from the page.**

⭐ **The check, and it is the one that matters most for a card:** score every candidate image for
*subject evidence* — caption, non-empty alt, a descriptive filename, or the heading of the block it
sits in — and refuse to auto-fill a card from an image that scores zero. A picture whose subject is
unknown is not a picture of the business; it is a picture. ⛔ The failure mode this prevents is the
quiet one: a card that looks finished and is showing the wrong room.
