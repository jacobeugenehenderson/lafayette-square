# HPDM content assets — for the builder/reader agent

**Where the per-place images live and how to resolve their paths.** This installation is self-contained (`NEIGHBORHOOD-INPUTS §5.1.2`): every asset lives *under this folder* and is referenced by an **instance-relative** path. Nothing here points at `public/photos/` — that's Lafayette Square's web root and is unknown to HPDM.

## Layout
```
cartograph/data/hipointe-demun/content/
  logos/<slug>.<ext>          ← one brand logo per business
  photos/<slug>/NN.jpg        ← 1..N place photos per business (01.jpg, 02.jpg…)
```

## How the paths appear in the data (listings.json)
- `logo:   "logos/barrio.jpg"`                       (string, or null)
- `photos: ["photos/barrio/01.jpg", "photos/barrio/02.jpg", …]`

**Both are relative, with NO leading slash.** Resolve them against this instance's content root — i.e. `loadInstanceData(lookId).contentRoot + "/" + path`. A leading-slash absolute (`/photos/...`) would be an LS-legacy web-root reference and must never appear here. Slugs are installation-local (HPDM's `clementines` ≠ LS's).

## Logos present (8)
`barrio.jpg` · `kaldis-coffee.jpg` · `clementines.png` · `louie.png` · `hi-pointe-theatre.png` · `cheshire.svg` · `hi-pointe-drive-in.png` · `stevensons-hi-pointe-amoco.jpg`

- Formats vary: mostly PNG (with alpha), one **SVG** (`cheshire.svg`), a few JPG. Render on any background; don't assume a transparent PNG.
- **Missing: Sasha's Wine Bar** — no clean mark exists to source (Wix text logo; IG avatar is a storefront photo). `logo` is `null`; expect guardian-upload on claim. Any other listing without a real logo also has `logo: null` — fall back to initials/monogram like the LS place card does.

## Photos present
`content/photos/<slug>/` for: `barrio` (3), `louie` (1), `sashas` (2), `clementines` (1), `hi-pointe-theatre` (3), `hi-pointe-drive-in` (3), `cheshire` (3), `stevensons-hi-pointe-amoco` (1), `kaldis-coffee` (2), `graham-chapel` (1). Web-sized (~≤1600px). Most listings have `photos: []` (a later hand-source pass) — render the architectural auto-card in that case.

*Written 2026-07-05 alongside the first fully-elaborated HPDM place cards. Same convention applies to any future installation: assets co-located in its own `content/`, referenced instance-relative.*
