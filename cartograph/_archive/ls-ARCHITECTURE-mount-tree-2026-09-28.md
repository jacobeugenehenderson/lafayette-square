# ls/ARCHITECTURE.md §1 — the hand-assembled mount tree (retired 2026-09-28)

Retired by BRIEF-one-town-assembly: production, Preview and Stage stopped assembling the renderer by hand and mount
`<Town>` (src/components/Town.jsx). Live home: `ls/ARCHITECTURE.md §1`. Kept here verbatim for the record.

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


**Production does NOT mount** *(corrected 2026-06-30 — several prior entries were stale):* `StreetLights.jsx` (no longer imported by `Scene.jsx`; production lamps render via `BakedLamps`), `BakedBuildings` (deleted — production renders buildings via `SlabBuildings`), `StreetRibbons` (file no longer exists), `MapLayers` (cartograph-internal). *Note: `BakedLamps` **is** production (corrected from "Stage/Preview only"); `PlanetariumOverlay` **is** mounted in production — one level down via `CelestialBodies.jsx:962`, operator-gated + default-off (corrected from "not mounted / may be dead" — see RUNTIME-DELTA RD.3, `STREET-VIEW.md §3.2`).*



---

# cartograph/PREVIEW.md §2b — the shotOverride rule (retired 2026-09-28)

Superseded by `useCamera.townShot`, written by TownBridge.jsx. Live home: `cartograph/PREVIEW.md §2b`.

## 2b. ⛔ PARITY BREAK: the shot picker publishes `shotOverride`, and consumers must READ it

Preview owns its own camera and **deliberately does not drive `useCamera.viewMode`** — it publishes
`shotOverride`, scoped so it "can't perturb terrain-exag / clouds / frameloop" (`PreviewApp.jsx:932`).
That scoping is right, but **every legitimate shot consumer must be added to it**, and one never was:
`useOverheadMode` read `viewMode`, so in Preview it was pinned to `'hero'` forever ⇒ **Browse never
swapped: the hero cards and mesh trees never hid and the overhead discs NEVER RENDERED AT ALL.**
Fixed with the idiom `useSceneJson.js:87` already used — `s.shotOverride ?? s.viewMode` (production
sets no override, so it falls through byte-identically).
⛔ **Adding a shot consumer? Read `shotOverride ?? viewMode`, or Preview stops being a mirror** — and
parity is this stage's entire job.

