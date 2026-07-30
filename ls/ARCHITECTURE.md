# Lafayette Square — Architecture

How the consumer app is organized at runtime: mount tree, slab boundary, live-data dependencies, backend touchpoints, build-time concerns.

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; flag contradictions during work; update at session end. The cartograph authoring toolkit has its own parallel trinity under `cartograph/`.

For the *publisher side* of the slab boundary (what cartograph emits, the bake chain, the Looks model) see `cartograph/ARCHITECTURE.md`. For the *formal boundary spec* between cartograph and LS (slab manifest schemas, binary layouts, producer/consumer contracts) see [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md). This doc covers only the *consumer side*.

**Pasteable references:** [`reference/INVENTORY-DATA.md`](reference/INVENTORY-DATA.md) (data inventory), [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md) (backend endpoints).

Last verified: 2026-06-02 (forensic inventory pass §§1–6 — `scratch/ls-forensic-inventory.md`; corrected the buildings source, the meteorologist consumer chain, and the endpoint count below). Prior: 2026-05-13 (Phase B plans landed; staging URL live; BASE_URL invariant codified — see SLAB-CONTRACT §10.6).

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
        │       ├── CloudDome               (cheap procedural sky-cloud system; the
        │       │                             DEFAULT production cloud render; does NOT
        │       │                             itself read meteorologist artifacts)
        │       ├── Atmosphere              (volumetric raymarched clouds; consumer IS
        │       │                             wired — reads /clouds/{almanac,presets,
        │       │                             modulators}.json + scene.json.sky via
        │       │                             useAtmosphereDirective + atmosphere-materials.
        │       │                             ⚠️ GATED OFF BY DEFAULT (skyMode stopgap):
        │       │                             prod ships CloudDome; Atmosphere only mounts
        │       │                             under ?sky=volumetric. "Wired, not the
        │       │                             default" — not "the live production clouds.")
        │       ├── AtmosphereDirectiveDriver (per-frame: lerps useAtmosphere.rawDirective →
        │       │                             tweenedDirective over 45s; the meteorologist
        │       │                             store→scene-uniform bridge)
        │       ├── Terrain                 ← src/data/terrain.{json,bin} (kit-baked
        │       │                             pair via cartograph/bake-terrain.js;
        │       │                             metadata static-imported, .bin fetched
        │       │                             via Vite `?url` import + top-level
        │       │                             await). Mesh `visible={false}` in
        │       │                             both Cartograph and production —
        │       │                             mount stays alive only so the
        │       │                             `terrainExag` shader uniform keeps
        │       │                             driving Y-displacement on ribbons +
        │       │                             buildings + lamps.
        │       ├── BakedGround lookId={INSTANCE.lookId}
        │       │       ↑ fetches /baked/<lookId>/{ground.json,ground.bin,scene.json,ground.lightmap.png}
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
        │       │   ├── SceneLabel × N      ← src/lib/streetLabels.js (shared with Cartograph; reads ribbons.json)
        │       │   ├── MapPin × N          (mobile-deferred)
        │       │   └── LandmarkMarkers
        │       ├── BakedLamps              ← /baked/<look>/lamps.json + scene.json
        │       │                             lampGlow (production lamp consumer since
        │       │                             L1.1, 2026-05-12; desktop direct, mobile
        │       │                             via DeferredStreetLights → <BakedLamps/>).
        │       │                             Shader glow DataTexture still reads live
        │       │                             street_lamps.json (lampLightmap.js).
        │       │                             [CORRECTED — was "StreetLights (live)";
        │       │                             StreetLights.jsx no longer mounted by Scene.]
        │       ├── GatewayArch             (procedural catenary; placement +
        │       │                             transform + uplights + horizon disc
        │       │                             authored, baked into scene.arch +
        │       │                             scene.horizon. Shared consumer at
        │       │                             src/components/GatewayArch.jsx —
        │       │                             cartograph Stage + production +
        │       │                             Preview all mount this same file
        │       │                             (SC.7 consolidation, 2026-05-13).
        │       │                             DesignerArch plan-view silhouette
        │       │                             lives in src/cartograph/.)
        │       ├── CameraRig
        │       ├── PostProcessing          (shared consumer at src/components/
        │       │                             PostProcessing.jsx. Operator-authored
        │       │                             channels: bloom, ao, exposure, warmth,
        │       │                             fill, mist, halo, grade, grain,
        │       │                             shadow — all baked into scene.json.
        │       │                             EffectComposer: N8AO + Bloom +
        │       │                             AerialPerspective + FilmGrade +
        │       │                             FilmGrain. Cartograph Stage + Preview
        │       │                             mount the same file with override
        │       │                             props.)
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

**Production does NOT mount** *(corrected 2026-06-30 — several prior entries were stale):* `StreetLights.jsx` (no longer imported by `Scene.jsx`; production lamps render via `BakedLamps`), `BakedBuildings` (deleted — production renders buildings via `SlabBuildings`), `StreetRibbons` (file no longer exists), `MapLayers` (cartograph-internal). *Note: `BakedLamps` **is** production (corrected from "Stage/Preview only"); `PlanetariumOverlay` **is** mounted in production — one level down via `CelestialBodies.jsx:962`, operator-gated + default-off (corrected from "not mounted / may be dead" — see RUNTIME-DELTA RD.3, `STREET-VIEW.md §3.2`).*

---

## 2. The slab boundary

**The player reads three payloads.** The app is a generic reader; LS is installation #1 (`?look=lafayette-square`). Three separate things feed it, and keeping them separate is what makes the app installation-generic:

1. **The slab** (`public/baked/<look>/`) — the *render*: ground, buildings' render-side, trees, lamps, the look's styling snapshot. Poured by the cartograph / arborist / meteorologist kit; consumed read-only (the tables below).
2. **The content** — names, history, listings, menus, roster, profile — a per-installation layer read *alongside* the slab, **not baked into it** (the render↔content line is the §6.3 "C2 boundary" in `SLAB-CONTRACT.md`; the reader loads it by `INSTANCE.lookId`).
3. **The installation config** (`src/instances/<look>.js`, selected by `?look=` → `src/instance.js`) — the fixed-truth identity the slab doesn't carry: geography, branding, legal, commerce, profile, contact, **and the module manifest** (§6). Neither slab nor content — the third payload.

The rest of this section is payload (1); payloads (2)–(3) are §6 + `SLAB-CONTRACT.md §0`.

### Consumed from slab (read-only, immutable per bake)

| Artifact | Consumer | Status |
|---|---|---|
| `/baked/<look>/ground.json` + `ground.bin` + `ground.lightmap.png` | `BakedGround.jsx` | ✅ Production |
| `/baked/<look>/scene.json` | `CelestialBodies` (sky/ambient/hemi/dirSun/dirMoon/constellations/milkyWay), `PostProcessing` (bloom/ao/exposure/warmth/fill/mist/halo/grade/grain/shadow), `GatewayArch` (arch/horizon), `CameraRig` (shots/browseHeading), `LafayettePark` (bake-aware lift/offsets), `BakedGround` (palette/materials/layerVis) | ✅ Production. Per-Look authoring snapshot — every cartograph-authored channel (SC.1 / SC.2 / SC.3 / SC.5 / SC.7) reaches the runtime through this file. |
| `/baked/<scene>/trees.json` (the neighborhood's own tree placements — no global fallback, `SLAB-CONTRACT §8`) + GLB variants in `/baked/<look>/trees/` + tree atlas textures | `InstancedTrees.jsx` | ✅ Production |
| `/baked/<look>/trees-atlas.json` | `treeAtlasMaterial.js` | ✅ Production |
| `/baked/<look>/lamps.json` | `BakedLamps.jsx` | ✅ Production + Stage + Preview (production switched 2026-05-12, L1.1) |
| `/baked/<look>/buildings.{json,bin}` (v2 merged-mesh + render index) | `SlabBuildings.jsx` | ✅ **Production** (L1.3, 2026-05-26). Production mounts `SlabBuildings` off the slab; the live per-`<Building>` path in `LafayetteScene` is hidden (`hiddenLayers.building`). The slab index resolves raycast→building-id for selection/neon/place-card; `SceneNeon` reads slab `roofOutline`. Stage keeps the live `LafayetteScene` mount for authoring retint. `BakedBuildings` (old Preview consumer) is deleted. |

### Consumed live — load-bearing (won't bake; dynamic by nature)

| Source | Consumer | Why live |
|---|---|---|
| Google Apps Script `getInit` batch | `hooks/useInit.js` | End-user-mutable: listings + events + handle hydrated on boot |
| GAS individual endpoints (**~54 actions / 57 routes** via `?action=` in `lib/api.js` → `Code.js`) | Various hooks + modals | Reviews, replies, claims, bulletins, comments, threads, qr designs, staff, residence, guardian, link tokens, check-ins, init batch (full table in `reference/INVENTORY-API.md` / inventory §6) |
| Supabase | `useCary`, `ChatModal`, `SmsInbox`, `ContactModal`, `CourierDots`, `useInit` | Cary realtime sessions + auth + chat |
| open-meteo.com forecast | `hooks/useWeather.js` (called by `WeatherPoller`) | Live weather, 48-hour forecast; lat/lon/timezone templated from `INSTANCE.geography` |

### Consumed live — could/should bake or freeze (v1 BACKLOG candidates)

| Source | Consumer(s) | Status |
|---|---|---|
| `src/data/buildings.js` (lazy `buildings.json`) | `LafayetteScene`, `Controls`, `GlassSearch`, `SidePanel`, `useListings`, `CheckinPage` | Load-bearing for per-building interactivity; `bake-buildings` exists but produces a merged mesh, not the per-id catalog these consumers need. Decide: keep live + freeze, or hybrid (slab mesh + per-id index). |
| `src/data/streets.json` | `SidePanel` (named-street count) | Static; labels migrated to `ribbons.json` via `src/lib/streetLabels.js` (2026-05-14). Likely bake or freeze. |
| `src/data/buildingOverrides.json` | `LafayetteScene` | Per-building overrides; static; freeze or bake into `buildings.json` |
| `src/data/facade_mapping.json` | `PlaceCard.jsx` | Per-building photo + description; static catalog; keep live (consumer-surface data, ~2600 lines) |
| `src/data/park_water.json` | `LafayettePark` | Already baked-into-ground for ground bake; still live for park render. Decide: retire live import. |
| `src/data/park_paths.json` | `LafayettePark` | Same as park_water |
| `src/data/street_lamps.json` | `lampLightmap.js` (shader-glow `DataTexture`) | **[CORRECTED]** Production **has** switched to `BakedLamps` for the lamp posts (L1.1, 2026-05-12); `StreetLights.jsx` is no longer mounted. Only the `lampLightmap.js` shader-glow source still reads this live (L1.1b follow-on to migrate it to `/baked/<look>/lamps.json`). |
| `src/data/terrain.{json,bin}` | `Terrain.jsx`, `utils/elevation.js`, `utils/terrainShader.js` | ✅ Baked via `cartograph/bake-terrain.js` (clipped to LS_STENCIL, 5 m/sample, paired metadata.json + Float32 .bin payload). Magnitude + consumer-parity sweep landed 2026-05-14: V_EXAG=1.5; foundation/wall anchor = mean of footprint vertex raw (matches `bake-buildings.js`); `mergeBufferGeometries` preserves per-vertex `aCentroidY`; `TERRAIN_DISPLACE_INSTANCED` divides lift by instance Y-scale (lamp/tree fix); trees + glow/halo billboards now patched; LafayettePark switched from rigid-park-group lift to per-item (gravel paths per-vertex, posts/rails rigid-at-mesh-origin, lake/grotto via shared `<PondGroup>` rigid lift, labels via `<ElevatedGroup>`); `bake-ground.js` ground refinement is now **adaptive** (conforming red-green to a `GROUND_REFINE_TOL_M = 0.50 m` tolerance, *not* the old uniform ≤15 m max-edge); ribbon groups skip refinement EXCEPT `park_path`, which gets a dense uniform contour refine (`PATH_CONTOUR_REFINE_MAX_EDGE_M = 6`, 2026-06-29). **2026-06-29 also reconciled CPU↔GPU sampling** (GPU `texture2D` remapped via `_terrainUV` to the CPU grid-corner convention → identical world-Y) and moved lamps/trees to a **baked per-object anchor** (`groundRaw × uExag` via `cartograph/groundSampler.js`, applied by `patchTerrainInstancedBaked`) — the buildings/foundations `aCentroidY` regime generalized to point objects. See `cartograph/ARCHITECTURE.md §8 "Terrain doctrine"` for the full live rule. Per-Look elevation-exag channel still pending. |
| `src/data/bright_stars.json` | `CelestialBodies` | Static catalog; freeze |
| `src/data/planetarium/{constellations,named_stars,planets}.json` | `PlanetariumOverlay` (**mounted via `CelestialBodies.jsx:962`, gated + default-off** — [CORRECTED], not unmounted), `CelestialBodies` | Static; freeze |
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
| Google Apps Script (`apps-script/Code.js`) | Listings, reviews, events, check-ins, residence, guardian, handles, bulletins, comments, threads, QR designs, staff perms, link tokens, claim secrets, init batch (**~54 actions / 57 GET+POST routes** — reconciled 2026-06-30 against `Code.js`; one shared 14-tab Google Sheet) | Device hash (forgeable naming anchor) + admin passphrase → 6h token (localStorage client-side, Script Cache server-side). **Privileged writes re-verify device_hash → Guardians/Residents/Checkins sheet server-side** (25+ endpoints). See `OPERATIONS.md` + `project_ls_security_arc` for the gating verdict + the admin-token hotspot. | Live |
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
| `public/clouds` | 28 KB | Meteorologist `presets.json` + `almanac.json` + `modulators.json`. Consumer (`<Atmosphere/>` via `useAtmosphereDirective` → `AtmosphereDirectiveDriver`) is **wired but gated OFF by default** — production ships the cheap `<CloudDome/>`; the volumetric `<Atmosphere/>` only mounts under `?sky=volumetric` (skyMode stopgap). `modulators.json` is optional (graceful 404 → empty). |

**Staging URL** (auto-deploys on push to the trunk `curb-offset-draw` via `.github/workflows/staging.yml`; repointed from the retired `cartograph-looks-pass-ab` 2026-07-08): [`https://jacobeugenehenderson.github.io/lafayette-square-staging/`](https://jacobeugenehenderson.github.io/lafayette-square-staging/). Slab renders end-to-end as of `a1ebe1b`. The staging build passes `--base=/lafayette-square-staging/` to Vite; all runtime asset fetches route through `import.meta.env.BASE_URL` (memory `project_kit_deploy_path_agnostic`, SLAB-CONTRACT §10.6, couplers plan CC.8). Production builds with default `BASE_URL='/'` for apex-domain deploy.

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

- **Admin access via `?admin`.** Passphrase prompt → 6h token in `localStorage` (`lsq_admin_token`), re-verified async on reload; server caches it 6h. `?logout` clears all identity keys. ⚠️ The token is passed in request bodies and trusted for the session — a known security hotspot (`project_ls_security_arc`; fix = signed/ephemeral JWT or per-action re-verify).
- **Device hash identity.** Every end-user action is keyed by `getDeviceHash()` (deterministic from browser fingerprint). Accounts are device-scoped, not email-scoped.
- **Time-of-day is live, frame-by-frame.** `useTimeOfDay` + `useSkyState` + `CelestialBodies` + `CloudDome` compute continuously from real time + `INSTANCE.geography.{lat,lon}`. No baked time-of-day data anywhere.
- **Per-building neon stays live.** `LafayetteScene` reads `buildings.json` lazily; per-building `NeonBand` mount is gated on listing hours from `useListings` and ticks every 60s. The merged-mesh `bake-buildings` artifact is a perf proof in Preview but doesn't replace this consumer.
- **Per-installation config via `src/instance.js` → `src/instances/<look>.js`.** `?look=` selects the installation config synchronously at boot (default `lafayette-square`; the URL param is available at module init, so no async boot). It carries the fixed-truth identity the slab doesn't: `lookId` (default Look the runtime loads), `geography.{lat,lon,timezone,bbox,cityState,stateCode}` (SunCalc / weather / planetarium / projection), `branding`, `legal`, `commerce`, `profile` (masthead / InfoModal facts), `cary`/`contact` endpoints, and `modules` (the manifest — next bullet). Extended across the Universal Reader arc (Phases 1–3, 2026-07-05/06); a second installation (`?look=hipointe-demun`) boots its own config through the same path. Authored *styling* identity (sky / materials / palette) still travels through the slab (`scene.json`), not here. **Still LS-literal by design:** Product-level constants (the "Cary" program name; "Lafayette Square" as the Product name) — installation-specific literals were migrated in Phase 1, prose copy is Phase 4.
- **Feature presence is gated by the module manifest — `INSTANCE.modules.*` (Phase 3, 2026-07-06).** `App.jsx` mount-gates each optional feature on its flag via `moduleOn(name)` (`src/instance.js`): bulletin, delivery (Cary — the `/cary` route + `CourierDashboard` overlay + map `CourierDots` in `Scene.jsx`), contact, codedesk, sms, chat, info, events, society (a SidePanel tab). `delivery` carries a nested `{enabled, zoneDescription}`; the rest are booleans; `moduleOn` normalizes both. **LS = all-on → byte-identical render**; HiPointe sets `delivery:false` → the whole Cary surface is retired. **Decision — presence-gating is leaky, so the switch is explicit.** "Hide it if the data's empty" fails: HiPointe had null `cary.*` data but the courier UI still mounted (the ungated-Cary bug). A declarative flag is the correct gate — an installation without a feature sets the flag false, rather than relying on absent data to hide it. (`residences` is listed in the manifest but **still ungated in code** — it's `isResidential`-woven through PlaceCard, not a discrete mount; deferred until an installation needs it off.)
- **All runtime asset paths route through `import.meta.env.BASE_URL`.** Slab fetches (`BakedGround`, `BakedLamps`, `InstancedTrees`, `LafayettePark`, `treeAtlasMaterial`, `BakedBuildings`, `GatewayArch`, `CartographApp`) — landed `f871a9d`. JSX asset paths (`PlaceCard.assetUrl()`, `GlassSearch.resolveLogoUrl()`, `LafayetteScene` MapPin) — already kit-portable from prior work. Same build deploys to root (production) or subpath (staging) without code changes. Memory: `project_kit_deploy_path_agnostic`. (Reference updated to `GatewayArch` 2026-05-13 — `StageArch` retired in SC.7's consolidation onto the shared consumer.)

---

## 7. Embedded — running inside someone else's page

`jacobhenderson.studio` frames LS as a live portfolio piece. Everything here is
additive: absent the params and the frame, the app is byte-identical.

### The two layer params

| Param | Renders | Mechanism |
|---|---|---|
| `?layer=slab` | the baked environment, no Player chrome | reuses `App.jsx`'s existing chrome gate |
| `?layer=player` | the commons, no slab beneath | `.embed-sheet` laid over the scene |
| *(absent)* | both — what the public sees | unchanged |

`layer` is **state**, not a read-once const: the URL param seeds it (and serves
direct links), and a `message` listener switches it live. Switching must not
change the frame's `src` — a reload rebuilds the WebGL context and resets the
camera, which turns three layers into three unrelated pictures. The listener
only binds when framed, and also carries `ground` (`paper` | `plate`) so the
sheet matches the embedding page's light/dark, which a cross-origin frame
cannot read for itself.

**`?layer=slab` is NOT `?ground`.** `Scene.jsx`'s own `IS_GROUND` reads the URL
independently and strips trees, buildings, lamps, arch and post-FX to leave bare
ground — a diagnostic, not the slab. `layer=slab` reuses App's chrome gate
*without* tripping it. Do not merge them.

### ⚠ Never hide the canvas — the switch-back stall

The obvious implementation of `layer=player` is to hide the slab. It is wrong,
expensively, and the reason is worth keeping:

| Approach | While showing | Switching back |
|---|---|---|
| `visibility:hidden` / `display:none` / `opacity:0` | idle | **5–12s frozen frame** |
| a fully opaque cover | idle (occlusion-culled) | **5.6s** |
| `[data-scene-pause]` — our own contract | idle | **4.4s** |
| a cover at `opacity: 0.95` | renders normally | **~185ms** |
| control: never switch | — | no stall at all |

Chrome drops the WebGL surface the moment the canvas stops being visibly
composited — **hidden or fully occluded makes no difference** — and restoring
context, shaders and textures lands as one blocked frame. Measured on the dev
build *and on production* (8.2s), so it is not a dev artifact.

So the slab stays mounted, visible and rendering, and `.embed-sheet` covers it
at 95% opacity. The remaining 5% is load-bearing: it keeps the canvas
composited. **Do not round it to 1**, and do not reintroduce
`data-scene-pause` here — pausing idles the canvas too, which is the same trap
wearing our own contract's clothes. The slab costs what the composite costs,
which is the price already being paid.

### Scrolled off screen, it stops

Worth knowing before anyone tries to add throttling: an embedded LS already
stops on its own when scrolled out of the host page's viewport. Chrome does not
composite an offscreen iframe, the canvas idles, and the host's own frame time
drops from ~211ms to ~17ms — measured through the portfolio page. Coming back
costs a single ~970ms frame and paints within 400ms, because scrolling away
does not tear the surface down the way hiding it does.

So a one-page host carrying several embeds pays for the one being looked at,
and no more. Nothing in this app arranges that; do not add machinery for it.

### Framed defaults

`useCamera`'s initial state reads `window.self !== window.top` once and starts
`panelState` at `collapsed` — the visitor came for the embedding page, so what
they should meet first is the place, with the panel down to its three-part bar.
The check is guarded (`window.top` can throw cross-origin; a throw means framed).

**Only the initial state.** `panelState` lives in the store, so the visitor's
own choice survives layer switches and component unmounts for the rest of the
session. Nothing re-imposes the default, and nothing should: overriding a
choice the visitor just made is worse than an imperfect first frame.

---

## 8. Pending verifications

Items the inventory walk surfaced. Status reflects Phase B resolution where applicable.

1. **`PlanetariumOverlay` mount** — ✅ **RESOLVED (RUNTIME-DELTA RD.3, 2026-06-17): live + operator-gated, default-off.** Mounted one level down via `CelestialBodies.jsx:962` (which `Scene.jsx` mounts), so the earlier "not imported by Scene/LafayetteScene/App → may be dead" grep missed it. Not dead; do **not** strip. Home: `STREET-VIEW.md §3.2`.
2. **Vite's `copyPublicDir` selectivity** — RESOLVED by cleanout plan §S3: production build moves to `copyPublicDir: false` + named allow-list plugin. Phase C executes.
3. **Meteorologist `clouds/{presets,almanac,modulators}.json` consumer** — ✅ **WIRED, not stripped — but gated OFF by default.** The old plan (strip in v1, defer wire to v1.1) is obsolete: the volumetric `<Atmosphere/>` consumer reads these artifacts (`useAtmosphereDirective` + `atmosphere-materials.js`). ⚠️ Correction to the 2026-06-02 reading: it is **not the default production cloud system** — production ships the cheap `<CloudDome/>`; `<Atmosphere/>` only mounts under `?sky=volumetric` (skyMode stopgap). Do not strip the artifacts (the consumer is real); but it is "wired-and-gated," not "live in prod."
4. **Cartograph trinity stale `StreetRibbons.jsx` claims** — partially addressed 2026-05-13 (`cartograph/FEATURES.md L286`). `cartograph/ARCHITECTURE.md L116, L136` still need rewriting; flagged for next cartograph session (ls/BACKLOG K.1).

---

## Pointers

- `ls/FEATURES.md` — product orientation
- `ls/BACKLOG.md` — punchlist (slab migrations, route strips, perf gates)
- `cartograph/ARCHITECTURE.md` — publisher / authoring side
- `PUBLISH.md` — deployment procedures
- `README.md` — dev setup + trinity index
