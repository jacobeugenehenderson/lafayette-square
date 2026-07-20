# Księży Młyn content assets — for the builder/reader agent

**Where the per-place images live and how to resolve their paths.** Self-contained installation (`NEIGHBORHOOD-INPUTS §5.1.2`): every asset lives *under this folder*, referenced **instance-relative**. Nothing here points at `public/photos/` — that is Lafayette Square's web root and is unknown to Łódź. Mirrors the HPDM convention (`cartograph/data/hipointe-demun/content/ASSETS.md`).

## Layout
```
cartograph/data/ksi-y-m-yn/content/
  logos/<slug>.<ext>          ← one brand mark per business
  logos/_alt/<slug>-alt.<ext> ← REJECTED / runner-up candidates, never referenced
  photos/<slug>/NN.jpg        ← 1..N place photos (01.jpg, 02.jpg…), web-sized ≤1600px
```
Paths in the data are relative with **NO leading slash**: `logo: "logos/browar-ksiezy-mlyn.png"`, `photos: [{url: "photos/tubajka/01.jpg", credit, credit_url}]`. Resolved by `assetUrl()` → `BASE + INSTANCE.contentRoot` (`content/ksi-y-m-yn/`), which a Vite dev middleware serves.

## Logos present (11)
`browar-ksiezy-mlyn` · `soplicowo` · `niewinni` · `fatamorgana` · `babci-helci` · `sartoria` · `noto-sushi` · `museum-kinematografii` · `palac-herbsta` (**SVG** — true vector, the best asset here) · `willa-henryka-grohmana` · `kosciol-sw-anny`

Formats vary (PNG with alpha, JPEG, one SVG) — render on any background, don't assume transparency. Several are wide wordmarks that letterbox in a square marker; where a squarer runner-up exists it is parked in `_alt/`.

## ⭐ `logo: null` means SEARCHED AND NONE EXISTS — it is a finding, not a gap
Eight elaborated cards carry an explicit `null`. Do not "fix" them by hunting again; the search is recorded:
- **Cynamonowe Love, T.25 Cafe** — their Facebook avatars **fetch as valid JPEGs but are Facebook's default grey silhouette** (md5 `3e8f62364b0f574a7d18a6c8b26730f1`, byte-identical to each other). ⚠️ **HTTP 200 + `image/jpeg` is NOT evidence a logo exists** — md5-check any FB avatar against that hash before shipping it.
- **U Fabrykanta** — the only candidate was a grey question-mark placeholder GIF; its official site appears dead.
- **Cesky Film** — their site logo is a **pure-white knockout** (zero dark pixels, 6.6% coverage): invisible on any light surface. Parked as `_alt/cesky-film-white-knockout.png`; usable only on a dark marker.
- **Przędzalnia Scheiblera, Willa Ludwika Grohmana, Famuły** — buildings/estates with no operating entity. Correctly null; several unrelated short-let operators trade inside the mill and using one of their marks would misrepresent it.
- **Park Źródliska** — the only mark available belongs to the **Ogród Botaniczny**, which runs the Palm House inside the park but is not the park. Parked in `_alt/`, deliberately not promoted.

A null logo renders the built-in colored **initials avatar** — a clean, correct default.

## Photos present
`browar-ksiezy-mlyn` · `cesky-film` · `soplicowo` · `pierogarnia-palce-lizac` · `cynamonowe-love` · `niewinni` · `fatamorgana` · `babci-helci` · `t25-cafe` · `sartoria` · `u-fabrykanta` · `tubajka` (2) · `spizarnia-rydzynska` · `fit-cake` (2) · `winoteka` · `t25-bistro` (2) · `museum-kinematografii` · `palac-herbsta` · `przedzalnia-scheiblera` · `willa-henryka-grohmana` · `willa-ludwika-grohmana` · `kosciol-sw-anny` · `famuly` · `park-zrodliska`

**Never hotlink.** Three entries previously held external *page* URLs — two Wikimedia **category** pages and a restaurantguru listing — which render broken and fail zip-and-send. All are now downloaded and self-hosted. Business photos credit the business's own domain; landmark photos use PD/CC Commons files credited `Author / Wikimedia Commons (licence)` with `credit_url` pointing at the file page.

**Without a photo, deliberately:** `coffeehood` and `dom-ogrodnika`. Their sources published none, and the only available image was a district-context shot that would have misrepresented the venue. An empty `photos: []` renders the architectural auto-card — correct. Do not substitute a generic district photo for a specific business.

*Written 2026-07-19 during the Księży Młyn courtyard-card pass. Same convention applies to any future installation.*
