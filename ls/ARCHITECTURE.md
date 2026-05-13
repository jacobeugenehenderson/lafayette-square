# Lafayette Square — Architecture

How the consumer app is organized at runtime: mount tree, slab boundary, live-data dependencies, backend touchpoints, build-time concerns.

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; flag contradictions during work; update at session end. The cartograph authoring toolkit has its own parallel trinity under `cartograph/`.

For the *publisher side* of the slab boundary (what cartograph emits, the bake chain, the Looks model) see `cartograph/ARCHITECTURE.md`. For the *formal boundary spec* between cartograph and LS (slab manifest schemas, binary layouts, producer/consumer contracts) see [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md). This doc covers only the *consumer side*.

**Pasteable references:** [`reference/INVENTORY-DATA.md`](reference/INVENTORY-DATA.md) (data inventory), [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md) (backend endpoints).

Last verified: 2026-05-13 (Phase B plans landed; staging URL live; BASE_URL invariant codified — see SLAB-CONTRACT §10.6).

---

## 1. Runtime composition

Mount tree as actually rendered today. Read top-down.

```
index.html
└── main.jsx
    └── App.jsx                            ← URL route switch, top-level modals, identity
        │
        ├── Splash                          (boot screen)
        ├── SceneBoundary
        │   └── Scene.jsx                   (R3F Canvas, post-FX, camera rig, time/sky tickers)
        │       ├── FrameLimiter
        │       ├── TimeTicker              (drives useTimeOfDay)
        │       ├── SkyStateTicker          (drives useSkyState)
        │       ├── WeatherPoller           → fetches open-meteo.com every N min
        │       ├── CelestialBodies         (sun/moon/stars; live, no data fetch beyond bright_stars.json + planetarium/*)
        │       ├── CloudDome               (procedural — does NOT consume meteorologist artifacts today)
        │       ├── Terrain                 ← terrain.json (live import)
        │       ├── BakedGround lookId="lafayette-square"
        │       │       ↑ fetches /baked/lafayette-square/{ground.json,ground.bin,scene.json,ground.lightmap.png}
        │       ├── LafayettePark
        │       │       ↑ park_water.json + park_paths.json (live imports)
        │       │       ↑ fetches /baked/<look>/scene.json (for bake-aware lift/offsets)
        │       ├── UserDot                 (geolocation)
        │       ├── CourierDots             ← supabase realtime
        │       ├── LafayetteScene          (the building scene + neon + place state)
        │       │   ├── ClickCatcher
        │       │   ├── Foundations         ← buildings (lazy import of buildings.json)
        │       │   ├── Building × N
        │       │   │   ├── NeonBand        (per-building, gated by listing hours)
        │       │   │   └── SelectionRing
        │       │   ├── StreetLabel × N     ← streetsData (streets.json)
        │       │   ├── MapPin × N          (mobile-deferred)
        │       │   └── LandmarkMarkers
        │       ├── StreetLights            ← street_lamps.json (live)
        │       ├── GatewayArch             (procedural catenary, no data file)
        │       ├── CameraRig
        │       ├── PostProcessing          (EffectComposer: Bloom / N8AO desktop / DOF / FilmGrade / FilmGrain)
        │       └── DeferredStreetLights    (mobile fallback)
        │
        ├── Controls / CompassRose / BrowseHeader / SidePanel / EventTicker
        ├── Modals: PlaceCard / BulletinModal / ContactModal / CodeDeskModal
        │           SmsInbox / ChatModal / InfoModal / AdminPrompt
        ├── CourierDashboard / CourierOnboarding (Cary surface)
        ├── AvatarEditor
        └── URL-routed pages: CheckinPage / ClaimPage / LinkPage / PrivacyPage
                              / CourierTermsPage / RestaurantTermsPage / CaryStandalone
                              / PlaceOpener / BulletinOpener
```

**Mobile staging** (`LafayetteScene` line ~1275): on `navigator.userAgent` match, mounts of SDF labels and map pins are staggered across 2-3.5s after `viewMode !== 'hero'`. Desktop mounts everything immediately.

**Boundary-crossing imports** (LS runtime → cartograph store): `BakedGround`, `BakedLamps`, `InstancedTrees`, `LafayetteScene`, `LafayettePark`, `StreetLights` all import `useCartographStore` from `src/cartograph/stores/`. This is the seam where cartograph code reaches into production — visible as the 4.5MB `cartograph` chunk in the build output. Tree-shaking limits the cost but doesn't eliminate it; the store + its transitive deps survive.

**Production does NOT mount:** `BakedLamps` (Stage/Preview only), `BakedBuildings` (Preview only), `StreetRibbons` (file no longer exists), `MapLayers` (cartograph-internal), `PlanetariumOverlay` (Scene has the *viewMode* but the overlay component is not mounted in `Scene.jsx`/`LafayetteScene.jsx`/`App.jsx` — pending verification, may be dead UI infrastructure).

---

## 2. The slab boundary

What the LS app consumes from `public/baked/` vs. what it loads live.

### Consumed from slab (read-only, immutable per bake)

| Artifact | Consumer | Status |
|---|---|---|
| `/baked/<look>/ground.json` + `ground.bin` + `ground.lightmap.png` + `scene.json` | `BakedGround.jsx` | ✅ Production |
| `/baked/default.json` (arborist tree placements) + GLB variants in `/baked/<look>/trees/` + tree atlas textures | `InstancedTrees.jsx` | ✅ Production |
| `/baked/<look>/trees-atlas.json` | `treeAtlasMaterial.js` | ✅ Production |
| `/baked/<look>/scene.json` | `LafayettePark.jsx` (for bake-aware offsets/lifts) | ✅ Production |
| `/baked/<look>/lamps.json` | `BakedLamps.jsx` | ✅ Production + Stage + Preview (production switched 2026-05-12, L1.1) |
| `/baked/<look>/buildings.{json,bin}` | `src/preview/BakedBuildings.jsx` | ⚠ Preview-only — production `LafayetteScene` reads live `src/data/buildings.json` |

### Consumed live — load-bearing (won't bake; dynamic by nature)

| Source | Consumer | Why live |
|---|---|---|
| Google Apps Script `getInit` batch | `hooks/useInit.js` | End-user-mutable: listings + events + handle hydrated on boot |
| GAS individual endpoints (40+ in `lib/api.js`) | Various hooks + modals | Reviews, replies, claims, bulletins, comments, threads, qr designs, staff, residence, guardian, link tokens |
| Supabase | `useCary`, `ChatModal`, `SmsInbox`, `ContactModal`, `CourierDots`, `useInit` | Cary realtime sessions + auth + chat |
| open-meteo.com forecast | `hooks/useWeather.js` (called by `WeatherPoller`) | Live weather (St. Louis lat/lon hardcoded), 48-hour forecast |

### Consumed live — could/should bake or freeze (v1 BACKLOG candidates)

| Source | Consumer(s) | Status |
|---|---|---|
| `src/data/buildings.js` (lazy `buildings.json`) | `LafayetteScene`, `Controls`, `GlassSearch`, `SidePanel`, `useListings`, `CheckinPage` | Load-bearing for per-building interactivity; `bake-buildings` exists but produces a merged mesh, not the per-id catalog these consumers need. Decide: keep live + freeze, or hybrid (slab mesh + per-id index). |
| `src/data/streets.json` | `LafayetteScene` (street labels), `SidePanel` | Static label data; likely bake or freeze |
| `src/data/buildingOverrides.json` | `LafayetteScene` | Per-building overrides; static; freeze or bake into `buildings.json` |
| `src/data/facade_mapping.json` | `PlaceCard.jsx` | Per-building photo + description; static catalog; keep live (consumer-surface data, ~2600 lines) |
| `src/data/park_water.json` | `LafayettePark` | Already baked-into-ground for ground bake; still live for park render. Decide: retire live import. |
| `src/data/park_paths.json` | `LafayettePark` | Same as park_water |
| `src/data/street_lamps.json` | `StreetLights`, `lampLightmap.js` | Production hasn't switched to `BakedLamps`. Already addressed in Stage/Preview. |
| `src/data/terrain.json` | `Terrain.jsx`, `utils/elevation.js`, `utils/terrainShader.js` | Static elevation data; freeze or bake |
| `src/data/bright_stars.json` | `CelestialBodies` | Static catalog; freeze |
| `src/data/planetarium/{constellations,named_stars,planets}.json` | `PlanetariumOverlay` (unmounted today?), `CelestialBodies` | Static; freeze |
| `src/data/landmarks.json` + `src/data/menus.json` | `useInit`, `useListings` | Static catalog merged with GAS state; keep live |
| `src/data/seedEvents.json` | `useEvents` | Fallback when GAS events unavailable; keep live |

### Stripped / quarantined (this session)

| Item | Reason | Status |
|---|---|---|
| `src/components/FacadeElements.jsx` + `FacadeBillboards.jsx` | Dropped facade-decor system | Deleted 2026-05-12 |
| `src/data/facadeElements.json` + `public/models/facade/` (400 MB) + `public/model-viewer.html` + `decor`/`decor-icons` symlinks | Only consumed by FacadeElements | Deleted 2026-05-12 |
| ~~`src/data/{block_shapes,blocks,blocks_clean,ground_layers,landuse,nps-building-matches,park_species_map}.json`~~ | ~~Zero JS/JSON refs~~ — orphan classification was wrong (grep missed `arborist/`, `meteorologist/`, `.mjs`/`.cjs`/`.py`) | **RESTORED 2026-05-12.** Cleanup reframed: each L1.x migration retires its own input post-verification, no bulk pass. See `feedback_orphan_audit_full_repo`. |
| `src/data/ribbons.json.backup-*` (40 files) | Pipeline-snapshot backups, gitignored | Deleted 2026-05-12 |
| `ARCH.md` (Gateway Arch handoff) | No references anywhere | Moved to `_archive/handoffs/GATEWAY_ARCH.md` 2026-05-12 |

---

## 3. Backend touchpoints

| Backend | Purpose | Auth | Status |
|---|---|---|---|
| Google Apps Script (`apps-script/Code.js`) | Listings, reviews, events, check-ins, residence, guardian, handles, bulletins, comments, threads, QR designs, staff perms, link tokens, claim secrets (~40 endpoints in `lib/api.js`) | Device hash + admin passphrase (6h sessionStorage token) | Live |
| Supabase | Cary courier system (requests, sessions, phone OTP, profiles, courier_profiles, edge functions: `onboarding`, `dispatch`); also realtime channels for `CourierDots`, `ChatModal`, `SmsInbox`, `ContactModal` | Phone OTP | Hosted project live; LS UI behind "coming soon" placeholders |
| Cloudflare Worker (`worker.js`) | Per-place OG meta tags for social previews on `/place/*` | None | Live |
| open-meteo.com | 48-hour weather forecast for St. Louis | None (free) | Live |
| Cartograph backend (`cartograph/serve.js`) | Looks API, bake CLI runner, overlay I/O | None (local-only) | Dev-only; not deployed |

**Boot sequence** (`hooks/useInit.js`):
1. Compute device hash (`getDeviceHash`)
2. Single batched `getInit(deviceHash)` call to GAS → hydrates `useListings`, `useEvents`, `useHandle`
3. Merges static `landmarks.json` + `menus.json` into the listings store
4. Supabase session check (Cary auth state)

---

## 4. Build-time + deploy concerns

**Vite multi-entry** (`vite.config.js`):
```js
rollupOptions: { input: {
  main:        'index.html',
  cartograph:  'cartograph.html',
  arborist:    'arborist.html',
  preview:     'preview.html',
} }
```

All four HTML entries build into `dist/`. Authoring HTML files (`cartograph.html`, `arborist.html`, `preview.html`) are reachable at the live URL today; `vite.config.js`'s middleware does NOT mode-switch them out of production. The authoring chunk (`cartograph-*.js` ≈ 4.5 MB / 1.1 MB gz) is the single loudest thing on the wire.

**Bundle inventory** (2026-05-12 build, post-facade-rip):

| Chunk | Size (min) | Size (gzip) | Notes |
|---|---|---|---|
| `cartograph` | 4.5 MB | 1.1 MB | Authoring helper bundle |
| `main` | 1.2 MB | 288 KB | LS runtime |
| `index` | 966 KB | 233 KB | Entry / route switch |
| `vendor` | 739 KB | 193 KB | React + R3F + Three |
| `buildings` | 631 KB | 95 KB | Per-building data (lazy import) |
| `postfx` | 226 KB | 100 KB | Effect composer chain |
| `PreviewPostFx` | 88 KB | 28 KB | |
| `arborist` | 71 KB | 21 KB | |
| `preview` | 36 KB | 13 KB | |
| `Terrain` | 1.3 KB | 0.7 KB | |

**GitHub Pages deploy** (`.github/workflows/deploy.yml`): builds `dist/` from `main` branch; deploys via `actions/deploy-pages@v4`; `public/CNAME` binds `lafayette-square.com`.

**Cloudflare** owns DNS (proxied) + Worker (per-`/place/*` OG meta). See `PUBLISH.md §3-4`.

**`public/` weight at dev time** (after spring-cleaning):

| Dir | Size | Note |
|---|---|---|
| `public/trees` | 4.9 GB | Arborist GLB atlas + textures; bulk not shipped to prod (Vite's `copyPublicDir` selectivity TO VERIFY) |
| `public/models` | 255 MB | (was 655 MB pre-rip) Remaining building / decoration GLBs |
| `public/baked` | 201 MB | The slab — by design |
| `public/photos` | 71 MB | Building photos served to PlaceCard |
| `public/looks` | 508 KB | Per-Look design.json files |
| `public/clouds` | 28 KB | Meteorologist `presets.json` + `almanac.json` — **published but not consumed by runtime today** |

**Staging URL** (auto-deploys on push to `cartograph-looks-pass-ab` via `.github/workflows/staging.yml`): [`https://jacobeugenehenderson.github.io/lafayette-square-staging/`](https://jacobeugenehenderson.github.io/lafayette-square-staging/). Slab renders end-to-end as of `a1ebe1b`. The staging build passes `--base=/lafayette-square-staging/` to Vite; all runtime asset fetches route through `import.meta.env.BASE_URL` (memory `project_kit_deploy_path_agnostic`, SLAB-CONTRACT §10.6, couplers plan CC.8). Production builds with default `BASE_URL='/'` for apex-domain deploy.

**Rollback floor:** `v1-pre-cartograph-merge` tags `origin/main` HEAD as of 2026-05-12 (`20866ef`). Push `git push --force-with-lease origin v1-pre-cartograph-merge:main` to restore the last-known-good live deploy.

---

## 5. Routing

`App.jsx` does URL-prefix-based routing (no React Router). Single-page client switches on `route.page`:

| Path | Component |
|---|---|
| `/checkin/<locationId>` | `CheckinPage` |
| `/claim/<listingId>?secret=…` | `ClaimPage` |
| `/link?token=…` | `LinkPage` |
| `/privacy` | `PrivacyPage` |
| `/terms/courier` | `CourierTermsPage` |
| `/terms/restaurant` | `RestaurantTermsPage` |
| `/cary` | `CaryStandalone` |
| `/place/<listingId>` | Triggers `PlaceOpener` over the main scene |
| `/bulletin` | Triggers `BulletinOpener` over the main scene |
| default | Main scene + UI chrome |

Cloudflare Worker injects per-`/place/*` OG meta tags for social previews.

Authoring HTMLs (`/cartograph.html`, `/arborist.html`, `/preview.html`) bypass `App.jsx` entirely — they're separate Vite entries with their own React roots.

---

## 6. Conventions worth knowing

- **Admin access via `?admin`.** Passphrase prompt → 6h `sessionStorage` token. `?logout` clears.
- **Device hash identity.** Every end-user action is keyed by `getDeviceHash()` (deterministic from browser fingerprint). Accounts are device-scoped, not email-scoped.
- **Time-of-day is live, frame-by-frame.** `useTimeOfDay` + `useSkyState` + `CelestialBodies` + `CloudDome` compute continuously from real time + St. Louis lat/lon. No baked time-of-day data anywhere.
- **Per-building neon stays live.** `LafayetteScene` reads `buildings.json` lazily; per-building `NeonBand` mount is gated on listing hours from `useListings` and ticks every 60s. The merged-mesh `bake-buildings` artifact is a perf proof in Preview but doesn't replace this consumer.
- **Hardcoded LS look ID at runtime.** `Scene.jsx:942` mounts `<BakedGround lookId="lafayette-square">`. Other Looks (`valentines`, etc.) exist in `public/looks/` but production doesn't expose a switcher today. **Phase C migrates this to `INSTANCE.lookId`** per couplers plan §1 + §6.
- **St. Louis lat/lon is hardcoded** in `useWeather.js`, `useTimeOfDay.js`, `CelestialBodies.jsx`, `SidePanel.jsx`. **Phase C migrates these to `INSTANCE.geography.{lat,lon}`** per couplers plan §6 (Place coupler).
- **All runtime asset paths route through `import.meta.env.BASE_URL`.** Slab fetches (`BakedGround`, `BakedLamps`, `InstancedTrees`, `LafayettePark`, `treeAtlasMaterial`, `BakedBuildings`, `StageArch`, `CartographApp`) — landed `f871a9d`. JSX asset paths (`PlaceCard.assetUrl()`, `GlassSearch.resolveLogoUrl()`, `LafayetteScene` MapPin) — already kit-portable from prior work. Same build deploys to root (production) or subpath (staging) without code changes. Memory: `project_kit_deploy_path_agnostic`.

---

## 7. Pending verifications

Items the inventory walk surfaced. Status reflects Phase B resolution where applicable.

1. **`PlanetariumOverlay` mount** — RUNTIME-DELTA K.3 / RD.3. Phase C's Phase 3 staging walk confirms dead-or-live; strip if confirmed dead.
2. **Vite's `copyPublicDir` selectivity** — RESOLVED by cleanout plan §S3: production build moves to `copyPublicDir: false` + named allow-list plugin. Phase C executes.
3. **Meteorologist `clouds/{presets,almanac}.json` consumer** — RESOLVED by couplers plan §3 (strip in v1, defer wire to v1.1 concurrent track). Phase C executes the strip via cleanout §S3.
4. **Cartograph trinity stale `StreetRibbons.jsx` claims** — partially addressed 2026-05-13 (`cartograph/FEATURES.md L286`). `cartograph/ARCHITECTURE.md L116, L136` still need rewriting; flagged for next cartograph session (ls/BACKLOG K.1).

---

## Pointers

- `ls/FEATURES.md` — product orientation
- `ls/BACKLOG.md` — punchlist (slab migrations, route strips, perf gates)
- `cartograph/ARCHITECTURE.md` — publisher / authoring side
- `PUBLISH.md` — deployment procedures
- `README.md` — dev setup + trinity index
