# Audit — LS App Pathologist (forensic campaign)

> **Pathologist: Lintel.** The load-bearing beam spanning the slab↔consumer opening.
> Read-only walk, no code changes. Domain: the production consumer app + the
> integration/emit seam (`Scene.jsx`, `LafayetteScene.jsx`, listings/place-cards,
> `ContactModal`, nav/UI, `index.html`, deploy, auth). Matrix format per `AUDIT-MATRIX.md`.
> Walked against branch `cartograph-looks-pass-ab` @ `4335009`.

---

## 0. Executive summary — the prize (slab-contract health)

The slab contract is **mostly honored and recently hardened**. The camera arc this
session closed the loudest violations: hero subject, browse bounds, hero keyframes,
arch placement, FOVs, and depth-mode all now resolve from `scene.json` (or the v2
buildings index) via shared pure modules. Buildings/ground/trees/neon-anchors render
off the slab. The remaining violations are **smaller and classifiable**:

- **Two dead camera literals** (`PRESETS.browse`, and `HERO_TARGET` as anything but a
  triple-fallback) survive in `Scene.jsx` — vestigial, safe to excise.
- **Pin/landmark placement still reads live `_allBuildings`** (`LafayetteScene.LandmarkMarkers`),
  not the slab index — the last building-geometry contract gap. Buildings render from
  the slab; their pins are positioned from a parallel source that can drift.
- **Two disagreeing hardcoded St-Louis-zoning→category maps** (`useListings` vs
  `SceneNeon`) — duct-tape, LS-specific, a triple-gap (future-setting + slab-field + 3rd-party barrier).
- **The shipping sky (`CloudDome`) ignores the slab `clouds` field entirely** and only
  renders in hero mode — the `clouds.preset` slab channel is dead in the cheap path.
- **`ContactModal` hardcodes the Cary SMS number** as a literal string, duplicating
  `INSTANCE.cary.smsNumberDisplay`.

No hull-punctures found (nothing classified `vestigial` is actually load-bearing). The
`INSTANCE` module (`src/instance.js`) is a clean, deliberate productization seam — the
fixed-truth identity (geography, lookId, contact endpoints, skyMode) the slab doesn't carry.

---

## 1. ⭐ SLAB-CONTRACT MAP — read-vs-hardcoded (the centerpiece)

For everything production renders: does it **read the slab**, or **secretly hardcode**?
`scene.json` top-level keys present: `version, look, bakedAt, palette, materialPhysics,
materialColors, layerColors, luColors, layerVis, lampGlow, neon, sky, ambient, hemi,
dirSun, dirMoon, constellations, milkyWay, bloom, ao, exposure, warmth, fill, mist, halo,
grade, grain, shadow, shots, browseHeading, heroSubject, heroKeyframes, heroMotion, arch,
horizon, clouds`. Buildings/ground/trees ship as sibling `.json`+`.bin` artifacts.

| Rendered thing | Reads slab? | Source of truth | Hardcode / gap | Cruft-class | Productization |
|---|---|---|---|---|---|
| **Building geometry/material** | ✅ YES | `buildings.json`+`.bin` v2 via `SlabBuildings.jsx`; LafayetteScene live `Building`/`Foundations` hidden in prod (`hiddenLayers={{building:true}}`, `Scene.jsx:789`) | — | real | slab-field (done) |
| **Per-building identity (click/hover/neon/hero)** | ✅ YES | render-scoped index in `buildings.json`, published to `useSlabBuildingIndex` | — | real | slab-field (done) |
| **Hero camera subject** | ✅ YES | `resolveHeroSubject(scene.heroSubject, {slabIndex, archValues})` shared (`src/lib/heroSubject.js`) | `scene.heroSubject` is `null` for LS → resolves to arch default (correct, operator-confirmed). `FALLBACK_HERO_SUBJECT=[400,45,-100]` is a last-resort guard only | real (fallback documented) | slab-field (done) |
| **Hero camera animation (keyframes/motion)** | ✅ YES | `scene.heroKeyframes` + `scene.heroMotion` via `heroKeyframeAnim` (`Scene.jsx:232,640`) | `HERO_CENTER=[-400,55,230]` used only if `scene.heroKeyframes` empty | real (fallback) | slab-field (done) |
| **Browse overhead framing** | ✅ YES | `scene.shots.values.browse.bounds` (`cx:95,cz:-158`) + `browseAltitude()` shared (`src/lib/browseAltitude.js`) | `PRESETS.browse=[0,600,1]/[0,0,0]` (`Scene.jsx:67`) is now **unreachable** — every browse path reads the slab | **vestigial** | slab-field (done); cut the literal |
| **Camera FOVs (hero/browse/street) + eye height** | ✅ YES | `scene.shots.values.*.fov` / `street.eyeHeight`, `SHOTS_FLAT_DEFAULTS` first-paint only | — | real | slab-field (done) |
| **Browse screen heading** | ✅ YES | `scene.browseHeading.values.value` → `browseUpFromHeading` | — | real | slab-field (done) |
| **Gateway Arch placement/look** | ✅ YES | `scene.arch.values` (distance×bearing×scale/rotation/yOffset/uplights) `GatewayArch.jsx:332` | `LATITUDE/LONGITUDE` from `INSTANCE.geography` (deliberate fixed-truth, not slab) | real | slab-field (done) |
| **Depth mode (log vs linear)** | ⚙️ runtime | `Scene.jsx:724` `logarithmicDepthBuffer:!IS_MOBILE` (Vernier Phase 1) | mobile LINEAR is a deliberate device-profile decision, not slab | real | future-setting (device profile) |
| **Palette / materialPhysics / materialColors** | ✅ YES | `scene.palette` etc.; Stage passes live overrides, prod reads frozen-at-bake | — | real | slab-field (done) |
| **Ground / land-use fills / ribbons / lightmap** | ✅ YES | `ground.json`+`.bin`+`.lightmap.png` via `BakedGround.jsx`; `scene.layerColors`/`luColors`/`layerVis` | — | real | slab-field (done) |
| **Trees** | ✅ YES | `baked/<look>/trees/` + atlas via `InstancedTrees lookId` | — | real | slab-field (done) |
| **Street lamps** | ✅ YES | `lamps.json` via `BakedLamps`; `scene.lampGlow` drives glow | — | real | slab-field (done) |
| **Neon uniforms (core/tube/bleed/emissive/radius)** | ✅ YES | `scene.neon.values` via NeonBands | — | real | slab-field (done) |
| **Neon tube geometry/anchors** | ✅ YES (in prod) | slab index footprint/`roofOutline`/`baseY`/`centroidY` (`SceneNeon.jsx:123`); live `_allBuildings` fallback only when no index (Stage) | — | real | slab-field (done) |
| **Neon on/off + category color** | ⚠️ PARTIAL | listing hours/category from `useListings` (API content — correct); **default category from hardcoded `_NEON_ZONING_CATEGORY`** (`SceneNeon.jsx:57`) | St-Louis zoning A–J → category map is LS-specific & **disagrees with `useListings.ZONING_CAT`** | **duct-tape** | future-setting + slab-field + 3rd-party barrier (TRIPLE) |
| **Landmark/place pin POSITIONS** | ❌ NO | `LafayetteScene.LandmarkMarkers` builds `buildingMap` from live `_allBuildings` (`LafayetteScene.jsx:1135`); `MapPin` reads `building.position` | buildings render from slab, **pins positioned from a parallel live source** → drift risk | **duct-tape** | slab-field (pin anchors via index) |
| **Sky / clouds (shipping cheap path)** | ❌ NO | `CloudDome.jsx` reads `useSkyState` (weather), **ignores `scene.clouds`**; only renders in hero mode (`CloudDome.jsx:197`) | `scene.clouds.preset` channel is **dead in the shipping path**; consumed only by `Atmosphere` under `?sky=volumetric` | duct-tape (stopgap, documented `skyMode.js`) | slab-field (live once volumetric ships) |
| **Sky tint / celestial / horizon** | ✅ YES | `scene.ambient/hemi/dirSun/dirMoon/constellations/milkyWay/horizon` etc. | — | real | slab-field (done) |
| **Post FX (bloom/ao/exposure/grade/grain/mist/halo/shadow/warmth/fill)** | ✅ YES | corresponding `scene.*` channels via `PostProcessing.jsx` | — | real | slab-field (done) |
| **Splash screen sky gradient** | ❌ NO (by design) | `App.jsx:419 splashSkyColors()` hardcodes keyframes paralleling CelestialBodies; sun pos from `INSTANCE.geography` | pre-Scene paint; can't read slab before mount — acceptable, but a parallel palette to maintain | real (documented parallel) | none |

### Slab-contract findings (ranked)

1. **`PRESETS.browse` is dead** (`Scene.jsx:62-71`). The browse mode-change branches
   (`Scene.jsx:496,526`) and entry-from-planetarium branch all compute framing from
   `scene.shots.values.browse.bounds`. The `else if (PRESETS[entering])` branch
   (`:532`) only ever fires for `hero`. `PRESETS.browse` is referenced nowhere. → **remove**.
   `PRESETS.hero` is still load-bearing (Canvas init `:704`, `ctl.target` init `:452`,
   the hero transition entry pose `:541`) — keep.

2. **Pins read live data, buildings read slab** (`LafayetteScene.jsx:1133-1191`).
   `LandmarkMarkers` + `MapPin` position off `_allBuildings[building_id].position` and
   `getFoundationHeight/getRoofPeakHeight`. In production the buildings themselves are the
   slab mesh; if the slab footprint/height ever diverges from `src/data/buildings`, pins
   float off their building. **Fix:** resolve pin anchors from `useSlabBuildingIndex`
   (footprint centroid + `baseY`) when the index is published, exactly as `SceneNeon` and
   `resolveHeroSubject` already do. → **fix** (the resolver pattern already exists).

3. **Two disagreeing zoning→category maps.** `useListings.ZONING_CAT`
   (`useListings.js:26`: A→residential, **D/F/G→commercial**, H→residential, J→industrial)
   vs `SceneNeon._NEON_ZONING_CATEGORY` (`SceneNeon.jsx:57`: A–E→residential,
   **F–I→services**, J→community). A building with zoning `F` is "commercial" in the
   place-card/listing layer but glows "services" neon. Both are hardcoded St-Louis zoning
   semantics. → **fix** to one shared classifier; **productize** as a slab-field
   (zoning→category mapping is per-instance) + future-setting + the canonical 3rd-party-build barrier.

4. **`clouds` slab channel dead in shipping path.** `skyMode='cheap'` (default,
   `instance.js:26`) mounts `CloudDome` which never reads `scene.clouds`. This is a
   *documented stopgap* (`skyMode.js`) — the volumetric `Atmosphere` path consumes it.
   Not a bug, but the Bible should record that the authored cloud preset is **not visible
   in production today**. → **keep** (blocked-on: volumetric sky landing).

---

## 2. Endpoint inventory — the proto-API (seeds tier-4 API surface)

Two backends. Neither is a REST API in the conventional sense.

### A. Google Apps Script web app (`src/lib/api.js`) — the community/listings backend
Single endpoint (`VITE_API_URL`), dispatched by an `action` query/body param. GET uses
`?action=&_t=`; POST sends `{action, ...body}` as `text/plain` (CORS-simple). `credentials:'omit'`.
**Dev fallback:** when no `VITE_API_URL` + DEV, an in-memory `MOCKS` table answers every action.

Actions consumed (grouped):
- **Check-in / local status:** `checkin`, `checkin-status`
- **Guardian claim:** `claim`, `claim-secret`, `getDesign`
- **Reviews:** `review`, `reviews`, `reply`
- **Events:** `event`, `events`
- **Batch init:** `init` (listings + events + handle + residence in one call — fired by `useInit`)
- **Listings:** `listings`, `update-listing`, `accept-listing`, `remove-listing`
- **Staff:** `listing-staff`, `update-staff-perms`, `promote-staff`, `demote-staff`, `revoke-staff`
- **Handles:** `handle`, `check-handle`, `set-handle`, `update-avatar`
- **Photos:** `upload-photo`, `remove-photo`
- **Bulletins:** `bulletins`, `bulletin`, `remove-bulletin`
- **Comments:** `comments`, `comment`, `remove-comment`
- **Threads/messages:** `threads`, `start-thread`, `send-message`, `thread-messages`, `close-thread`
- **Device linking:** `create-link-token`, `claim-link-token`, `check-link-token`, `linked-devices`
- **Residents/lobby:** `residence-status`, `resident-count`, `claim-residence`, `verify-resident`,
  `lobby-posts`, `lobby-post`, `remove-lobby-post`, `leave-residence`
- **Admin:** `admin-auth`, `admin-verify`

### B. Supabase (`src/lib/supabase.js`) — Cary auth + edge functions
- **Auth:** phone OTP (`signInWithOtp`, `verifyOtp`, `getSession`, `onAuthStateChange`) — courier identity
- **Edge functions:** `functions.invoke('contact-sms', …)` (ContactModal "Text us"); Cary courier flow
- **Tables/realtime:** `from()`/`channel()` for courier dashboard/requests
- **Graceful degradation:** a `STUB` Proxy returns `{data:null}` for every call when
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are unset — the app runs without Supabase.

> The single-`action`-dispatch shape is the natural seed for a real tier-4 route table;
> the MOCKS object is a ready-made API contract spec (every action's response shape).

---

## 3. Deploy / auth facts (for the Show Bible — I'm the source)

### Deploy
- **Production:** `.github/workflows/deploy.yml` — push to `main` → `npm ci && npm run build`
  → GitHub Pages (`upload-pages-artifact` + `deploy-pages`). `concurrency: pages, cancel-in-progress`.
- **Custom domain:** `public/CNAME` = `lafayette-square.com` (apex; `BASE_URL=/`).
- **Staging:** `.github/workflows/staging.yml` — push to `cartograph-looks-pass-ab` →
  `npm run build -- --base=/lafayette-square-staging/` → pushes `dist/` to external repo
  `jacobeugenehenderson/lafayette-square-staging` (`force_orphan`). `BASE_URL=/lafayette-square-staging/`.
- **Path-agnostic:** all asset/slab/route reads go through `import.meta.env.BASE_URL` so the
  same build works on apex and subpath. SPA deep-links handled by `public/404.html` →
  `?__spa_path=` → restored in `index.html` head script.
- **Build-time secrets (GitHub secrets):** `VITE_API_URL`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. No secrets in the repo.
- **Caching:** `index.html` sends `no-cache/no-store` meta; slab fetched with `?t=` cache-bust.

### Auth surface — "what's behind a login/password"
**There are no passwords.** Four identity tiers, all passwordless:

| Gate | Mechanism | Unlocks |
|---|---|---|
| **Device hash** (everyone, automatic) | random 16-char id in `localStorage.lsq_device_hash` (`src/lib/device.js`); sent on every API call | reviews, bulletin posts/comments/threads, check-ins, handle |
| **Handle** (opt-in identity) | unique 3–20 char name + emoji avatar (`useHandle.js`; `set-handle`); transferable via link tokens | public `@handle` in posts; required for residents + before claiming a listing |
| **Guardian / keyholder** (business mgmt) | QR-encoded `{listingId, secret}` → `claim`; role in `localStorage.lsq_guardian_listings` (`useGuardianStatus.js`) | edit listing (hours/photos/tags/events), reply to reviews, manage staff, generate QRs, lobby |
| **Resident** (building) | building QR invite → `claim-residence` (auto-verify) or mutual `verify-resident` (`useResidence.js`) | private building **Lobby** posts; resident badge; must pick a handle |
| **Admin** (override) | passphrase via `?admin` → `AdminPrompt.jsx` → `admin-auth`; token in `localStorage.lsq_admin_token` | bypass guardian secret, claim/view any listing, QR generator, SMS inbox |
| **Cary courier** (the ONLY real auth) | **Supabase phone OTP** (`CaryAuth.jsx`, `CourierOnboarding.jsx`, `CourierDashboard.jsx`) | courier dashboard: live meter, GPS, request queue, onboarding (vehicle/background/insurance) |

- **"Cary"** = the on-demand neighborhood delivery/ride program. Requesters use device-hash;
  only couriers authenticate (phone OTP). Routes: `/cary`, `/cary/apply`, `/cary/deliver`, `/cary/drive`.
- **Local status / "Townie":** 3 distinct check-in days → `is_local` badge (`useLocalStatus.js`).
- **Client routes** (`App.jsx parseRoute`): `/checkin/:id`, `/claim/:listingId/:secret`,
  `/link/:token`, `/place/:id`, `/bulletin`, `/privacy`, `/terms/courier`, `/terms/restaurant`, `/cary*`.

---

## 4. Mobile regime (owned: the shipped `IS_MOBILE` render profile)

One source: `src/lib/isMobile.js` (UA `/iPhone|iPad|iPod|Android/i`, SSR-safe). **Confirmed:
no duplicate regex anywhere else in `src/`** (the 6+-file dup is fully consolidated — 6
importers, one definition). The shipped mobile DELTA off the desktop base:

| Lever | Desktop | Mobile | Where |
|---|---|---|---|
| Depth buffer | logarithmic | **linear** (early-Z preserved; canopy-fill budget) | `Scene.jsx:724` |
| Antialias | on | off | `Scene.jsx:714` |
| DPR | `[1,1.5]` | `1` | `Scene.jsx:746` |
| Shadows | `soft` | off | `Scene.jsx:747` |
| Street lamps (`BakedLamps`) | mount immediately | **deferred 4s** (`DeferredStreetLights`) | `Scene.jsx:683,791,796` |
| Gateway Arch | always | hero-only (`!IS_MOBILE || viewMode==='hero'`) | `Scene.jsx:792` |
| Building textures (7×1024² ≈ 28 MB) | lazy-load | **never load** (vertex colors only) | `LafayetteScene.jsx:58`, `SlabBuildings.jsx:45` |
| Hero pan frameloop | 60fps in hero | **30fps even in hero** (`!IS_MOBILE && …hero`) | `Scene.jsx:153` |
| Browse content stagger | immediate | labels +2s / markers +3.5s | `LafayetteScene.jsx:1237` |

**Productization:** this whole DELTA is the future device-profile setting (per `AUDIT-MATRIX`
mobile thread + conformance Phases 4-5). Today it's applied (`IS_MOBILE`), not authored.
The `?ground` debug flag (`IS_GROUND`, `Scene.jsx:678`) strips everything but ground — a dev
toggle that overlaps the mobile gates; note it for the conformance arc, not vestigial.

---

## 5. CSS / design tokens (owned: LS-side reconciliation — toward one source, not new design)

Three token systems, **disjoint namespaces — no shadowing**:

| File | Loaded by | Vars | Role |
|---|---|---|---|
| `src/tokens/design.css` (216 ln) | `@import` in `src/index.css` | **61** (`--surface-*`, `--on-surface-*`, `--type-*`, `--vic-*`, `--tod-*`, `--panel-*`, `--radius-*`, `--blur-*`, `--outline-*`) | the real LS app theme (dark, +light/+accessible variants) |
| `src/index.css` (265 ln) | `src/main.jsx` (app entry) | — | global resets + `.glass-*`/`.card`/`.section-heading` + Tailwind layers |
| `public/lsq-tokens.css` (50 ln) | **only** `public/codedesk/index.html` | **27** (`--lsq-*`) | CodeDesk QR tool palette |
| `public/codedesk/styles/theme.css` (2299 ln) | `public/codedesk/index.html` | redeclares `--lsq-*` inline + own `--ui-*` | CodeDesk standalone SPA chrome |
| `src/cartograph/cartograph.css` (1128 ln) | `CartographApp` (`.cartograph` scope) | `--carto-*` (+ uses `--vic-gold`) | operator tool (Cartograph Pathologist owns) |

**Key answers:**
- **`design.css` vs `lsq-tokens.css` are NOT duplicates** — zero variable-name overlap.
  `design.css` = the LS app (61 `--surface/on-surface/type/vic/tod/...`); `lsq-tokens.css`
  = the CodeDesk QR generator (27 `--lsq-*`). They serve different apps. The
  `AUDIT-MATRIX` "two token files → reconcile to one" premise is **only half-right**: they
  aren't redundant copies, they're two apps' token sets. Reconciliation target is narrower
  than assumed — see below.
- **`public/codedesk/styles/theme.css`** = the styling for the **CodeDesk QR-code generator**,
  a standalone SPA in `public/codedesk/` embedded as an `<iframe>` by `CodeDeskModal.jsx`
  (admin-only "QR Generator"). **NOT referenced from `src/`** — fully self-contained.
  **NOT vestigial** (active admin tool), but it **redeclares all 27 `--lsq-*` tokens inline**
  (theme.css lines 40-62), making the external `public/lsq-tokens.css` load redundant.
- **`public/lsq-tokens.css` is marginally vestigial** — loaded by CodeDesk's HTML but every
  value it defines is immediately overridden by theme.css's inline copy. → **fix** (lift the
  inline copy out / drop the redundant load) — a CodeDesk-internal cleanup, low value.

**Reconciliation recommendation:** the *real* LS app token source is already singular
(`design.css`). The genuine duplication is **inside CodeDesk** (`lsq-tokens.css` ⟷ theme.css
inline), not between design.css and lsq-tokens.css. Don't merge `--lsq-*` into `--surface-*` —
they're different apps. Productization: `design.css`'s `--vic-*` Victorian palette + `--tod-*`
time-of-day set are the future "theme/brand" setting.

---

## 6. Other LS-specific hardwires (productization candidates)

| Item / Location | What | Cruft-class | Action | Productization |
|---|---|---|---|---|
| `ContactModal.jsx:58` SMS literal `"(877) 335-1917"` | error-fallback string duplicates `INSTANCE.cary.smsNumberDisplay` | duct-tape (dup) | fix → read `INSTANCE.cary.smsNumberDisplay` | future-setting (done in INSTANCE; just deref it) |
| `_RING_COLOR='#ff6644'` + ring math | duplicated verbatim in `LafayetteScene.jsx:547` and `SlabBuildings.jsx:283` | duct-tape (dup, parity-critical) | fix → shared const/helper | none (cosmetic) |
| `MapPin` gradient `#880e4f→#c2185b` | hardcoded pin-with-logo background (`LafayetteScene.jsx:1077`) | real (flavor) | keep | future-setting (brand) |
| Building texture name list `['brick_red',…]` | duplicated in `LafayetteScene.jsx:61` + `SlabBuildings` texture loader | duct-tape (dup) | fix → shared list | slab-field (material catalog) |
| `INSTANCE` geography/name/domain/contact (`instance.js`) | LS fixed-truth identity | **real** (deliberate seam) | keep | future-setting (the instance coupler — already designed) |
| `splashSkyColors` keyframes (`App.jsx:443`) | parallel sky palette for pre-mount splash | real (can't read slab pre-mount) | keep | none |

---

## 7. Conflicts / cross-cutting notes

- **Serialize on `Scene.jsx`/`PreviewApp.jsx`** with Azimuth (tree LOD, parked A→B) and
  Vernier (conformance owner) — same convergence the camera arc respected.
- **`scene.heroSubject` is `null`** for lafayette-square — resolves to the arch default
  correctly, but an explicit `{kind:'arch'}` designation (Stage SurveyorPanel) would make
  the contract self-documenting; needs a re-bake (Azimuth has `scene.json` in flight, so defer).
- The zoning→category disagreement (§1.3) is the cleanest example of the campaign's
  **triple-gap** thesis: one hardcoded LS-specific that is simultaneously a future-setting,
  a missing slab-field, and the exact thing that would block a third party building their
  own neighborhood on this slab format.
- Nothing here is a `remove`-with-risk: the two vestigial items (`PRESETS.browse`,
  `lsq-tokens.css` redundant load) are provably unreferenced / overridden. Boz signs the cuts.

---

*Filed by Lintel. Read-only walk — no code touched. Routes to the Documentation Officer for
the master matrix + Show Bible (deploy/auth §3 are Bible-ready).*
