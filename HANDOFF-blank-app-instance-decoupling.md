# HANDOFF / BRIEF — Universal Reader (instance + content decoupling)

> **Status: DISPATCH-READY (2026-07-05, Boz).** The consumer-face arc of the two-faces frame (`plans/front-front-end-and-productization.md §The two faces`). Audit complete — the target list below is authoritative (reader-scope sweep, 2026-07-05). Producer-side content schema is ratified (`NEIGHBORHOOD-INPUTS §5.1.1`); a researcher is filling the HPDM payload in parallel.

## The goal
The public app is a **generic reader** of an installation payload; LS is just installation #1 (`?look=lafayette-square`). **"Lafayette Square" is the Product name; the LS neighborhood is installation #1, eponymous** — this is **de-installation-hardwiring, not de-branding.** Each installation supplies its own identity/branding/content/modules.

## ⛔ The gates (non-negotiable, prove at each cut)
1. **LS renders + reads byte-identical** — every LS value, once sourced from config/content, must equal today's literal. Additive before destructive.
2. **The townie app keeps working for LS** — place cards, listings, residences, search, bulletin, delivery all still function.
3. **The acceptance gate (Jacob, 2026-07-05):** the reader is universal — **grep the reader for *installation-specific* literals → zero.**

> ⭐ **Product-level constant vs installation-specific (Jacob, 2026-07-05).** The gate targets *installation-specific* literals only. **Product-level constants legitimately stay literal** — they're fixed across every installation. Two settled examples: **"Lafayette Square"** as the *Product* name (the neighborhood name that varies is a different thing); **"Cary"** = the delivery program's name/structure, a Product constant. Neighborhoods vary their *participants* (SMS number, couriers, **zone**) — **not** the program's name. So: **no INSTANCE field for the "Cary" name**; `modules.delivery.enabled` gates *presence* only, and per-installation participant data (`INSTANCE.cary.sms*`, `modules.delivery.zoneDescription`) carries the variation. In copy like "Cary at Lafayette Square" / "Cary is Lafayette Square's delivery service", **"Cary" stays literal; only the neighborhood name → `INSTANCE.name`.**

## The target list (audit, 2026-07-05 — reader scope: `App.jsx`, `components/`, `hooks/`, `lib/`, `pages/`, `preview/`, `index.html`)

**Already solved — `src/instance.js` carries** `lookId · skyMode · geography{lat,lon,tz,proj,bbox} · name · domain · cary{sms,email} · contact · mobileQuality`, cleanly read at ~40 geography/weather/planetarium/slab call sites. **Don't re-list those.** But some call sites still hardcode values INSTANCE already owns — those are offenders below.

**Bucket 1 — IDENTITY** (8): `CourierDots.jsx:22-23` idle lat/lon (offender → `INSTANCE.geography`) · `LafayettePark.jsx:9` hardcoded `cartograph/data/lafayette-square/…` import path · `LafayettePark.jsx:828` `EST. 1851 · ST. LOUIS, MO` · `LegalPage.jsx:124` city/state · `LegalPage/CourierOnboarding` "State of Missouri" governing law · `CourierOnboarding.jsx:189` `'MO'` · `PlaceCard.jsx:2951` `STL_TAX_RATE=0.08725` · `streetLabels.js:30` boundary-corridor names.

**Bucket 2 — BRANDING** (~18 literals + ~25 prose refs): `index.html:5,10,13,14,16,18,19` title/OG/favicon/domain (build-time inject — HTML can't read JS) · offenders reading a literal instead of existing `INSTANCE.name`/`.domain`: `App.jsx:553`, `Scene.jsx:749`, `ChatModal.jsx:182`, `PreviewApp.jsx:338`, `PlaceCard.jsx:2330,4187` (vanity domain ×2), `BulletinModal.jsx:1177`, `CourierDashboard.jsx:276,347`, `CaryAuth.jsx:82` · legal entity `Jacob Henderson LLC / DBA Lafayette Square Deliveries` (`LegalPage.jsx:123`, `CourierOnboarding.jsx:587`) · `LafayettePark.jsx:65` `lafayette-square.svg` asset name · **prose-copy density: `LegalPage.jsx`, `InfoModal.jsx:157-229`, `CheckinPage.jsx`** → a `branding.copy` bundle, not token swaps.

**Bucket 3 — CONTENT literal** (8): `SidePanel.jsx:750` `'2,164'` residents → `profile.population` · `InfoModal.jsx:170` "roughly 2,000 residents" + `:163` "~1,000 buildings" · `LafayettePark.jsx:811,828` `LAFAYETTE PARK`/`EST. 1851` → `profile.landmarkName`/`.founded` · `useListings.js:83` historic-district blurb → `profile.historicDistrictName` · `LegalPage.jsx:24` delivery-zone description → `modules.delivery.zoneDescription`.

**Bucket 4 — MODULE assumption** (11, all hard-mounted at `App.jsx:584-604`, no gate): bulletin · delivery(Cary) · contact · codedesk · sms · chat · info · events · society tab (`SidePanel.jsx:812`) · residences (`PlaceCard.jsx:2497`) · checkin/claim/link routes → `INSTANCE.modules.*`.

**Bucket 5 — ENDPOINT/SECRET** (6, already env-injected — inventory only): `VITE_API_URL`, `VITE_SUPABASE_*`; open-meteo + jsdelivr are universal (clean).

**⚠️ Surprises (deep/non-obvious coupling — own phases):**
- **St. Louis ZONING taxonomy as the categorization engine** — `useListings.js:16,42-45` (`ZONING_CAT/SUB/LABELS`) + `SceneNeon.jsx:51-63` (`_NEON_ZONING_CATEGORY`): the A–J single-letter STL zoning table drives **listing categorization AND neon color**. Not a string — a whole classification assumption. Deepest coupling.
- **`lsq-*` localStorage namespace** (`index.html:22`, `App.jsx:70,179,261`, `ChatModal`, `CodeDeskModal`, `PlaceCard:2323`) — two installations on one origin collide; derive prefix from `INSTANCE.lookId`.
- **`FLEUR_BG='#0055A4'` St. Louis-flag blue** + fleur-de-lis rating motif (`PlaceCard.jsx:147`) — cultural theming; structurally a color+emoji.
- **Reader → `src/data/` static imports** (the content-sidecar migration list, ~13): `LafayetteScene.jsx:5,85`, `SceneNeon.jsx:25`, `Controls.jsx:5`, `GlassSearch.jsx:7`, `SidePanel.jsx:10-11`, `useListings.js:3-5`, `useInit.js:9-10`, `useEvents.js:2`, `streetLabels.js:27`, `StreetLights.jsx:7`, `LafayettePark.jsx:7-19`, `PlaceCard.jsx:24`. Must load by `INSTANCE.lookId`, not `import`. **Exception (leave):** `CelestialBodies`/`PlanetariumOverlay` import universal astronomy data, not LS.

## INSTANCE schema — the target (extend `src/instance.js`)
```
INSTANCE = {
  lookId, skyMode,
  geography: { …present…, cityState:'St. Louis, MO', stateCode:'MO' },      // +2
  branding:  { name, title, domain, faviconUrl, ogImage, assetSlug,
               copy:{ about, guidelines, … } },                             // NEW (name/domain promote)
  legal:     { entityName, dba, governingState },                           // NEW
  commerce:  { salesTaxRate },                                              // NEW
  profile:   { population, buildingCount, founded, parkAcres,
               landmarkName, historicDistrictName },                        // NEW (= content L0)
  modules:   { bulletin, delivery:{enabled,zoneDescription},  // "Cary" name is a PRODUCT constant, NOT a field
               contact, codedesk, sms, chat, info, events, society, residences }, // NEW
  cary, contact, mobileQuality,                                            // present
}
```
Note: `profile.*` overlaps content **Layer 0** (`§5.1.1`) — decide whether it rides INSTANCE or a `content/profile.json` the loader merges (small; INSTANCE is fine for v1).

## Phasing (additive before destructive, each phase proves the gates)
- **Phase 1 — INSTANCE + literal migration (identity + branding offenders). ✅ LANDED 2026-07-05 (`207374bd`).** Extended `instance.js` (geography.cityState/stateCode · branding · legal · commerce · profile[=L0] · modules stub); migrated 12 reader files' identity/branding offenders to read INSTANCE. "Cary" kept literal (Product constant). **Gates verified:** `vite build` green + node assertion = every migrated value byte-identical to its former literal. Deferred (flagged in-code): CourierDots idle privacy-point coordinate; the Legal/Info/CourierOnboarding legal-copy → Phase 4.
- **Phase 2 — content sidecar.** The ~13 reader→`src/data/` static imports load by `INSTANCE.lookId` from the installation payload (LS mirrors byte-identical). The producer-side schema (`§5.1.1`) is the shape.
- **Phase 3 — module manifest.** `INSTANCE.modules.*` gates the `App.jsx:584-604` mounts (LS = all-on). Design the seam; delivery/backends stay single-tenant for now.
- **Phase 4 — branding copy + `index.html` templating.** The `branding.copy` bundle for Legal/Info prose; a build-time inject step for `index.html` title/OG (it can't read the JS module).
- **Deep residuals (own arcs):** the STL zoning taxonomy → config; `lsq-*` localStorage prefix; the fleur/flag theming.

## Boundaries & doctrine
- **Render/geometry hardwires belong to the roster arc** (done: `bake-buildings.js` render ledger) — don't cross streams.
- Worktree isolation; canon docs are **Boz's** (flag drift, don't edit canon). This HANDOFF + `NEIGHBORHOOD-INPUTS §5.1.1` + `plans/front-front-end… §The two faces` are the agent's first reads.
- Reader distribution to 3rd-party sites (cross-origin slab, injected config, backend multi-tenancy) is **out of scope** — the horizon beyond this arc.
