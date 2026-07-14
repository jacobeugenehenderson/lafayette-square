# LS — Data Inventory

> ⚠️ **PARTIALLY SUPERSEDED — slab-merge has shipped (L1.3, 2026-05-26) + 2026-06 spec cluster.** Buildings now render off the slab via `SlabBuildings` (**production**, not Preview-only) and the clouds artifacts are now **consumed** by the volumetric `<Atmosphere/>` consumer (wired, but gated off by default — production ships the cheap `<CloudDome/>`). Several §A/§F rows below describe the pre-merge world; inline corrections are marked **[CORRECTED]**. Live architecture home = [`../ARCHITECTURE.md §2`](../ARCHITECTURE.md) + the 2026-06-29 spec cluster ([`PLACE-CARDS`](../PLACE-CARDS.md)/[`GUARDIANS`](../GUARDIANS.md)/[`RESIDENTS`](../RESIDENTS.md)/[`TOWNIES`](../TOWNIES.md)/[`QR-CODES`](../QR-CODES.md)/[`BULLETIN`](../BULLETIN.md)). Kept as historical data-catalog snapshot.

Every data source the LS consumer app touches at runtime: bundled JSON, baked slab artifacts, live backends, external APIs. Catalog format, pasteable.

Last verified: 2026-05-12 against `cartograph-looks-pass-ab @ b39834b`. For narrative context see [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §2. For backend endpoint shapes see [`INVENTORY-API.md`](INVENTORY-API.md).

---

## A. Slab artifacts (consumed read-only, baked offline by cartograph)

| Artifact | Path | Consumer | Mounted in production? |
|---|---|---|---|
| Ground geometry | `public/baked/<look>/ground.json` + `ground.bin` | `src/components/BakedGround.jsx` | ✅ |
| Ground AO lightmap | `public/baked/<look>/ground.lightmap.png` | `BakedGround.jsx` | ✅ |
| Bake-scene metadata (origin, offsets, lifts) | `public/baked/<look>/scene.json` | `BakedGround.jsx`, `LafayettePark.jsx`, `BakedLamps.jsx`, `StageArch.jsx` | ✅ |
| Tree placements | `public/baked/<scene>/trees.json` | `src/components/InstancedTrees.jsx` | ✅ |
| Tree GLB variants | `public/baked/<look>/trees/*.glb` | `InstancedTrees.jsx` | ✅ |
| Tree atlas manifest + textures | `public/baked/<look>/trees-atlas.json` + atlas PNGs | `src/components/treeAtlasMaterial.js` | ✅ |
| Lamps | `public/baked/<look>/lamps.json` | `src/components/BakedLamps.jsx` | ✅ Production + Stage + Preview (production switched 2026-05-12, L1.1) |
| Buildings (merged mesh, v2 + render index) | `public/baked/<look>/buildings.json` + `buildings.bin` | `src/components/SlabBuildings.jsx` | ✅ **[CORRECTED 2026-05-26]** **Production** (L1.3) — `SlabBuildings` is the prod + Preview consumer; raycast→id resolves against the slab index. (Old `BakedBuildings` Preview consumer deleted; live per-`<Building>` path kept only for Stage authoring retint.) |
| Cloud presets + almanac + modulators | `public/clouds/presets.json` + `almanac.json` + `modulators.json` | `src/components/Atmosphere` via `useAtmosphereDirective.js` + `atmosphere-materials.js` | ⚠ **[CORRECTED]** Consumer **wired**, but **gated off by default** — production ships the cheap `<CloudDome/>`; `<Atmosphere/>` only mounts under `?sky=volumetric` (skyMode stopgap). Not "unconsumed." |

**Available Looks today:** `lafayette-square` (the v1 instance), `default` (arborist tree placements), `toy` (test rig). **[CORRECTED]** The runtime Look is **not** a hardcode — it resolves from `INSTANCE.lookId` (`src/instance.js`, Couplers §6) with a `?look=` URL override where wired (`Scene.jsx:243`). The old "`Scene.jsx:942` hardcodes `lookId`" claim is stale (INSTANCE module shipped).

---

## B. Bundled JSON (live imports from `src/data/`)

Imported at JS module load, bundled into the JS chunk. No HTTP fetch; immutable per deploy.

| File | Path | Consumer(s) | Bake/freeze candidate? |
|---|---|---|---|
| Buildings catalog | `src/data/buildings.json` (lazy via `buildings.js`) | `LafayetteScene`, `Controls`, `GlassSearch`, `SidePanel`, `useListings`, `CheckinPage` | Load-bearing for per-id; merged-mesh bake exists separately; **decide: hybrid (slab mesh + per-id index) or stay live + freeze** |
| Streets (label data) | `src/data/streets.json` | `LafayetteScene` (street labels), `SidePanel` | **Freeze** or bake |
| Building overrides | `src/data/buildingOverrides.json` | `LafayetteScene` | **Freeze** or fold into `buildings.json` |
| Facade mapping (photos + descriptions) | `src/data/facade_mapping.json` | `PlaceCard.jsx` | **Keep live** — consumer-surface catalog (~2600 lines), no perf benefit to baking |
| Park water polygons | `src/data/park_water.json` | `LafayettePark` | Already in ground bake; **retire live import** |
| Park paths | `src/data/park_paths.json` | `LafayettePark` | Already in ground bake (path ribbons); **retire live import** |
| Street lamps | `src/data/street_lamps.json` | `lampLightmap.js` (shader glow `DataTexture`) | Production `BakedLamps` no longer reads this (2026-05-12, L1.1). `lampLightmap.js` still imports live → **L1.1b** to migrate the shader-glow source to `/baked/<look>/lamps.json`. |
| Terrain elevation | `src/data/terrain.json` | `Terrain.jsx`, `utils/elevation.js`, `utils/terrainShader.js` | **Freeze** or bake into ground |
| Bright stars catalog | `src/data/bright_stars.json` | `CelestialBodies`, `src/stage/StageSky.jsx` | **Freeze** — astronomical constant |
| Constellations | `src/data/planetarium/constellations.json` | `CelestialBodies`, `PlanetariumOverlay`, `StageSky` | **Freeze** |
| Named stars | `src/data/planetarium/named_stars.json` | `PlanetariumOverlay` | **Freeze** |
| Planets | `src/data/planetarium/planets.json` | `PlanetariumOverlay` | **Freeze** |
| Landmarks catalog | `src/data/landmarks.json` | `useInit`, `useListings`, `src/cartograph/SurveyorPanel.jsx` | **Keep live** — merged with GAS state at boot |
| Menus | `src/data/menus.json` | `useInit`, `useListings` | **Keep live** — merged at boot (`useListings.js:22`), **overrides** GAS `menu_json` for the curated set. Shape + delivery model: [`../PLACE-CARDS.md`](../PLACE-CARDS.md) §3 |
| Seed events (GAS fallback) | `src/data/seedEvents.json` | `useEvents` | **Keep live** — fallback when GAS unavailable |

---

## C. Live backends (HTTP at runtime)

See [`INVENTORY-API.md`](INVENTORY-API.md) for endpoint-level detail.

| Backend | Purpose | Auth | Mounts |
|---|---|---|---|
| Google Apps Script (GAS) | Listings, reviews, events, check-ins, residence, guardian, handles, bulletins, comments, threads, QR designs, staff perms, link tokens, claim secrets | Device hash + admin passphrase token (6h, **`localStorage` `lsq_admin_token`** — **[CORRECTED]**, not sessionStorage) | All consumer modals; `useInit` boot fetch |
| Supabase | Cary courier (requests, sessions, profiles, edge functions); realtime channels for chat, SMS inbox, contact, courier dots | Phone OTP for Cary; anon key for realtime reads | `useCary`, `ChatModal`, `SmsInbox`, `ContactModal`, `CourierDots`, `useInit` |
| open-meteo.com | 48-hour weather forecast | None (free tier) | `WeatherPoller` → `useWeather.fetchWeather()` (St. Louis lat/lon hardcoded) |
| Cloudflare Worker | OG meta tags for `/place/<id>` social previews | None | Server-side only (not a runtime consumer) |

---

## D. Cartograph backend (dev-only, not in production)

Production never touches these — they're for authoring sessions.

| Service | URL | Purpose |
|---|---|---|
| `cartograph/serve.js` | `localhost:3333/api/cartograph/*` | Looks API, bake CLI runner, overlay I/O |
| `arborist/serve.js` | `localhost:3334/api/arborist/*` | Tree species library, bake-trees CLI runner |
| `meteorologist/serve.js` | `localhost:3335/api/meteorologist/*` | Cloud presets + almanac I/O |

---

## E. Quarantined / removed this session

| Item | Consumer (former) | Status |
|---|---|---|
| `src/components/FacadeElements.jsx` + `FacadeBillboards.jsx` | `LafayetteScene` (mounted; removed) | **Deleted 2026-05-12** |
| `src/data/facadeElements.json` | `FacadeElements` | **Deleted 2026-05-12** |
| `public/models/facade/` (400 MB FBX + textures) | `FacadeElements` via JSON catalog | **Deleted 2026-05-12** |
| `public/model-viewer.html` | (debug tool only) | **Deleted 2026-05-12** |
| `public/models/facade/{decor,decor-icons}` symlinks | broken — pointed at unmounted `/Volumes/Today/` | **Deleted 2026-05-12** (was breaking `npm run build`) |
| `src/data/ribbons.json.backup-*` (40 files) | none — pipeline snapshots, gitignored | **Deleted 2026-05-12** |
| ~~`src/data/{block_shapes,blocks,blocks_clean,ground_layers,landuse,nps-building-matches,park_species_map}.json`~~ | ~~Zero refs~~ (grep was wrong) | **RESTORED 2026-05-12.** `park_species_map.json` broke `arborist/bake-trees.js` first; user caught it. `blocks.json` + `landuse.json` are referenced by `src/cartograph/CartographSurfaces.jsx` (live Designer); `block_shapes.json` + `blocks_clean.json` by cartograph backend; others by helper bake CLIs + scripts. Cleanup reframed — each L1.x migration retires its own input. See `feedback_orphan_audit_full_repo`. |

**Reframe** (2026-05-12): bulk orphan classification was a false bucket. Migration is the only honest orphan test. Each L1.x slab migration retires the specific `src/data/X.json` it bypasses, in the same commit, after browser verification. No more bulk passes.

---

## F. Asset weight (post-cleaning, dev tree)

| Path | Size | What's there | Ships to prod? |
|---|---|---|---|
| `public/trees/` | 4.9 GB | Arborist source GLB atlas + species textures | ⚠ TO VERIFY — Vite's `copyPublicDir` may include all of it |
| `public/models/` | 255 MB | Building / decoration GLBs (was 655 MB pre-facade-rip) | ⚠ TO VERIFY |
| `public/baked/` | 201 MB | The slab (ground bin + lightmap + buildings bin + tree GLBs + atlases) | ✅ By design |
| `public/photos/` | 71 MB | Building photos served to PlaceCard | ✅ |
| `public/looks/` | 508 KB | Per-Look `design.json` files | ✅ |
| `public/clouds/` | 28 KB | Meteorologist presets + almanac + modulators | ⚠ **[CORRECTED]** Consumer wired (`<Atmosphere/>` via `useAtmosphereDirective`) but **gated off by default** (production ships `<CloudDome/>`; volumetric only under `?sky=volumetric`). Not "no consumer." |

---

## G. Bundle inventory (2026-05-12 build)

| Chunk | Size (min) | Size (gzip) | Source |
|---|---|---|---|
| `cartograph` | 4.5 MB | 1.1 MB | `cartograph.html` entry — authoring helper, ships to prod |
| `main` | 1.2 MB | 288 KB | `App.jsx` runtime |
| `index` | 966 KB | 233 KB | Entry / route switch |
| `vendor` | 739 KB | 193 KB | React + R3F + Three |
| `buildings` | 631 KB | 95 KB | Lazy `buildings.json` chunk |
| `postfx` | 226 KB | 100 KB | EffectComposer chain (Bloom, N8AO, etc.) |
| `PreviewPostFx` | 88 KB | 28 KB | Preview-only |
| `arborist` | 71 KB | 21 KB | `arborist.html` entry |
| `preview` | 36 KB | 13 KB | `preview.html` entry |
| `Terrain` | 1.3 KB | 0.7 KB | |

**Loudest production payload:** `cartograph` (1.1 MB gz). LS v1 punchlist L2.1 strips authoring entries from production build.
