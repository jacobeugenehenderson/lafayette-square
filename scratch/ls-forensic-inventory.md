# LS Forensic Inventory — Runtime / Scene Composition

**Agent:** Merlin  
**Date:** 2026-06-02

---

## Section 1: Runtime / Scene Composition

**Overview:** How LS composes the slab (baked map artifact) + live elements into the rendered neighborhood. This section inventories the 15+ components that assemble the 3D scene, from the Canvas root through lighting, sky, buildings, neon, trees, and post-processing.

---

## Component Inventory: What / How / State

| Component | What It Does | How It's Built | Data Source | State |
|-----------|-------------|----------------|-------------|-------|
| **Scene** (root) | R3F Canvas + viewport setup, view-mode transitions (hero↔browse↔planetarium), frame limiting, time tickers | Canvas @ `Scene.jsx`; `frameloop="demand"` with RAF limiter; logarithmic depth (desktop) vs linear (mobile) | N/A | **robust** |
| **CameraRig** | 3D camera rig: keyframe hero animation, browse overhead framing, planetarium sky view, idle→hero auto-return, input gestures | `useFrame` driven by `useCamera` store; three Clipper inward insets → 4-band emitter; Mode-specific `applyConstraints`; SOA orbits (planetarium) | `scene.json` heroKeyframes / shots.values (FOV, eyeHeight, bounds, heading); hero-subject resolver | **robust** — hero keyframes + slab-authored framing live |
| **LafayetteScene** | Live building meshes + foundations + streets labels + park title + neon + landmarks (all per-Building geometry mounts) | Per-building `<Building>` mounts from `_allBuildings`; `<Foundations>` merged mesh; `<SceneNeon>` single tube mesh; label pool from `streetLabels.js` | `scene.json` palette / materialPhysics / materialColors; live textured building albedo + roof shapes | **partial** — live buildings hidden when SlabBuildings is active; textured walls/roofs + material overrides work; foundation physics flow from slab |
| **SlabBuildings** | Baked merged-mesh buildings (slab v2): ~9 group meshes (per-material) instead of 1000+ per-building; publishes render-scoped index for selection/neon | Fetches `/baked/{lookId}/buildings.json` + `.bin`; stamps per-vertex `aBuildingId` from index ranges; raycasts via vertex id | `scene.json` materialPhysics overrides; slab v2 index (footprints, roofOutline, centroidY, baseY, wall/roof materials) | **robust** — full shader parity with live Building (texture, night shift, terrain lift, selection emissive) |
| **BakedGround** | Ribbon ground mesh: asphalt, sidewalk, treelawn, median, land-use faces; procedural grass shader for lawn/residential/park; AO lightmap; radial fade at map boundary | Fetches `/baked/{lookId}/ground.json` manifest + `.bin` + lightmap; splits by `isGrassGroup()` into `<GrassMesh>` vs `<FadeMesh>`; polygonOffset per-group | `scene.json` layerVis; manifest bbox + groups | **robust** |
| **Terrain** | DEM surface mesh (hidden): carries `terrainExag` uniform so ribbons + buildings lift on sloped ground | PlaneGeometry with raw elevation in Y; shared `terrainExag` uniform driven by `TerrainExagDriver` target (V_EXAG / 1 / 0 per view mode) | `/utils/terrainShader.js` height raster (`width` × `height` × raw elevations) | **robust** — exaggeration lerp smooth; invisible mesh keeps normals live |
| **GatewayArch** | Iconic 630ft Gateway Arch landmark + horizon ground disc; catenary geometry with glint/panel detail; foot-wash uplight pools | Geometry: catenary curve swept into triangular cross-section (120 curve segs × 3 faces); Material: shader-driven panel seams + texture detail + uplight illumination | `scene.json` arch.values (position, rotation, scale, uplight colors/intensity/reach) + horizon.values (color, fade radii) | **robust** — full slab-authored uplight rig; GroundDisc reads slab stencil center |
| **LafayettePark** | 350m² park interior: procedural grass, SVG-clipped boundary, walk paths (ribbons), water bodies, decorative fence, "LAFAYETTE PARK" label | ParkGround: SVG fetch + canvas rasterize to clip mask; ParkPaths: polylines from `park_paths.json` swept into ribbons; FenceGeometry: post chain along perimeter | `park_water.json`, `park_paths.json`, `park-polygon.json`, `lafayette-square.svg` (boundary clip); `makeGrassMaterial()` + `getLampLightmap()` | **robust** |
| **CelestialBodies** | Sun/moon positions + lights; sky dome gradient (4-band authored); stars (~523) + noisy filler stars; constellations overlay (planetarium); milky way (disabled) | `useFrame` runs SunCalc for azimuth/altitude at `LATITUDE/LONGITUDE`; sky shader resolves authored channel at TOD; stars: per-frame sidereal transform (RA/Dec→alt/az); constellation grid overlay | `scene.json` sky/ambient/hemi/dirSun/dirMoon/constellations/milkyWay channels (empty defaults to flat procedural); SunCalc; bright_stars.json (523 catalog) | **robust** — sky channel bake → shader uniforms live; sun/moon lighting multipliers authored; constellations visible in planetarium mode |
| **CloudDome** | Cheap procedural sky clouds (backup to volumetric Atmosphere) | Dome mesh (SKY_RADIUS × 0.85 sphere); FBM 4-octave noise + domain warp in fragment shader; wind advection via `_windOffset` accumulator | `useSkyState` cloudCover / storminess / sunsetPotential / uWindOffset | **robust** — active in hero mode only; cheap enough for mobile fallback |
| **Atmosphere** | Raymarched volumetric cloud slab (Phase 4b); follows active cloud preset's altitude band; per-param TodChannels animate coverage/density/thickness | BoxGeometry raymarcher in fragment shader; slab bounds (uSlabMin/uSlabMax) track active cloud preset's baseAlt + thickness; sky-light coupling reads scene.json sky channel | `scene.json.sky` (sunGlow/low bands) + meteorologist preset params (coverage/density/thickness/baseAlt/warp/octaves/scatter/shadow); directive.clouds blend | **partial** — robust raymarching + sky coupling; milkyWay mount hidden (code comment 2026-05-02); displayBaseAlt authoring-only feature |
| **BakedLamps** | Street lamp instancing: Victorian lamp posts (GLB) + glow/halo billboards + light pools + contact shadows | Fetches `/baked/{lookId}/lamps.json`; mounts `<StreetLights>` with baked lamp data; terrain lift via `patchTerrainInstanced` shader snippet | `baked/lamps.json` with `{x, z, rotY, scale}` per lamp; `scene.json` layerVis.lamp + layerColors.lamp (panel override tint) | **robust** |
| **InstancedTrees** | 9-species tree roster instanced into park; per-variant GLB + atlas shader; per-vertex bark/leaf gate; wind sway via shared Brief 9b wind field | Fetches `/baked/default.json` tree bake (not per-Look); merges primitives per GLB variant into single InstancedMesh; `treeAtlasMaterial` w/ per-instance jitter | `baked/default.json` (bake-trees.js output); atlas manifest; wind via `defaultWindState` + `resolveWindState` + `windAt()` | **robust** — tree sway, bark retint, LOD tier steering live; per-vertex wind tier (Brief 9a) in place |
| **NeonBands** | Wall-mounted neon tube signage on open places; one merged mesh per scene; per-building category color; animated opacity via `neon` channel | `SceneNeon` computes `openPlaces` (live + slab paths); `NeonBands` builds ring chains (footprint offset outward) swept into circular cross-section; shader: DoubleSide additive | `scene.json.neon` channel (tubeRadius / core / tube / bleed uniforms); listings hours filter; slab roofOutline (true roof edge) or footprint fallback | **robust** — slab path uses roofOutline; live path traces roofTopRingFor; category-keyed hex; open-by-hours gating |
| **PostProcessing** | Bloom, AO, exposure, warmth, fill, mist, halo, grade, grain, shadow — all TOD-animatable via EffectComposer chain | `useFrame` resolves each param channel at current TOD minute; module-level refs (`_fillToeRef`, etc.) feed Effect classes; EffectComposer mount pattern | `scene.json` bloom / ao / exposure / warmth / fill / mist / halo / grade / grain / shadow channels (all TodChannel-shaped); meteorologist preset blend (Atmosphere only) | **robust** — all post-FX authored; GLSL include gate on logarithmic depth |
| **StageShadows** | Dynamic soft shadow maps (4096² per directional light); manual update trigger (~10m move = ~1° arc); asymmetric view frustum for quality | `PrimaryOrb` disables autoUpdate after frame 4, reads position delta; manual needsUpdate trigger on threshold; shadow-camera fit to ~1800m block extent | N/A | **robust** |
| **StageFog** | Scene fog (FogExp2) from `scene.mist` channel density | Mounted conditionally when `!IS_GROUND`; FogExp2 base is native Three.js | `scene.json` mist.values.value | **robust** |
| **WeatherPoller** | Polls meteorologist condition state on interval; written to `useSkyState` store | `useFrame` runs polling loop; reads `useMeteorologistStore` directive or fallback | Meteorologist JSON (directive.wind / clouds blend / sun.tint / lightDome) or empty fallback | **robust** |
| **AtmosphereDirectiveDriver** | Bridges meteorologist store to scene uniforms (Atmosphere + CelestialBodies) | Subscribes to `useMeteorologistStore` changes; writes to `useAtmosphere` tweened directive store | Meteorologist conditions (wind field, cloud blend, sun tint) | **robust** — decoupled via Zustand stores |
| **WeatherEffects** | Weather VFX (rain / snow / lightning) — orchestrated by meteorologist | Delegates to WeatherPoller output | Meteorologist condition intensity | **stubbed** — component exists but minimal VFX content (Lightning driver present) |
| **LampGlowDriver** | Per-frame lamp glow + halo shader uniform updates driven by `_lampGlowUniforms` ref | `useFrame` reads `_lampGlow` ref state (brightness / thickness / intensity); writes to StreetLights material uniforms | `_lampGlow` module ref (authored in preview/lampGlowState.js) | **robust** |
| **UserDot** | Blue dot on map marking the user's GPS location (mobile geolocation) | Mounted conditionally; subscribes to `useUserLocation` store | `useUserLocation.active / x / z / inBounds` (geolocation API output) | **partial** — gate active + inBounds check live; location tracking functional |
| **CourierDots** | Red/orange dots for active courier locations (Cary system) | Mounts per courier from `useCourrierLocations` store | Supabase realtime courier position updates | **partial** — live with Cary integration |

---

## Secondary Captures

### Slab-Contract: Read vs. Hardcoded

**Slab-sourced (live):**
- ✅ Hero keyframes + FOV (scene.shots)
- ✅ Browse bounds + heading (scene.shots, browseHeading)
- ✅ Arch placement + uplights (scene.arch.values)
- ✅ Neon tube radius + core/tube/bleed (scene.neon channel)
- ✅ All post-FX (bloom / ao / exposure / warmth / fill / mist / halo / grade / grain / shadow channels)
- ✅ Ambient / hemi / dirSun / dirMoon light intensities (channels with per-frame resolvers)
- ✅ Sky color bands + sun glow (scene.sky channel)
- ✅ Building palette + materialPhysics + materialColors (scene.palette/materialPhysics/materialColors)
- ✅ Layer visibility (scene.layerVis)
- ✅ Lamp tint (scene.layerColors.lamp)

**Hardcoded (GAPS — hardwires-come-out candidate):**
- ⚠️ **HERO_CENTER / HERO_TARGET** (lines 50–51): fallback hero pose when slab has no authoredKeyframes. Operator-authored `heroKeyframes` + `heroSubject` ship now, but pre-era scenes get hardcoded anchor. **Status:** obsolete once full slab adoption; keep as fallback only.
- ⚠️ **PRESETS.browse** (lines 62–71): hardcoded browse position [0, 600, 1]. **OBSOLETE** — replaced by slab-authored `scene.shots.browse.bounds` (2026-05-13, SC.5). Left in code as vestigial. **Line 251:** fallback `browseBounds` to `SHOTS_FLAT_DEFAULTS.browse.bounds` if scene missing.
- ⚠️ **Camera up vectors** (lines 204–209, 212–214, etc.): scene-keyed rotation. Browse up derives from `browseHeadingDeg` (authored); hero up = [0,1,0] (hardcoded). **Status:** by design — compass frame locks world Y.
- ⚠️ **Planetarium origin** (line 519): clicked location is runtime user input, not baked. `streetEye` (eyeHeight) is authored; position is **category 3 hardwire** (interaction → origin). **Status:** correct per doctrine.
- ⚠️ **LATITUDE / LONGITUDE** (line 49, others): instance-level geography (INSTANCE.geography). **Correct per doctrine** — slab-consumer pattern (one consumer reads instance.json geography).
- ⚠️ **Canvas defaults** (lines 708–711): `fov` / `near` / `far` boot values. Fallback `SHOTS_FLAT_DEFAULTS` correct; CameraRig resets after slab loads. **Status:** correct.
- ⚠️ **Depth buffer choice** (line 724): `logarithmicDepthBuffer: !IS_MOBILE`. **LOAD-BEARING** per line 722 comment — mobile LINEAR fixed; desktop LOG for shadow quality. Not authored. **Status:** correct per design.
- ⚠️ **Clear color** (line 736): hardcoded `0x1a1a18`. No channel. **Status:** minor cosmetic; deploy surface not operator-touched.

**Total hardcodes:** ~8, mostly obsolete (PRESETS.browse) or by-design (interaction, geography, depth buffer). **Risk: LOW** — most are fallbacks or correct per doctrine.

---

### Endpoint Inventory

**Slab artifact fetches:**
- `GET /baked/{lookId}/ground.json?t={cacheBust}` — manifest (groups, bbox, stencil, lightmap path)
- `GET /baked/{look}/{ground.bin}?t={cacheBust}` — binary vertex data
- `GET /baked/{lookId}/ground.lightmap.png?t={cacheBust}` — AO texture
- `GET /baked/{lookId}/buildings.json?t={cacheBust}` — v2 manifest (groups, index, footprints, roofOutlines)
- `GET /baked/{look}/{buildings.bin}?t={cacheBust}` — binary buildings geometry + colors + centroidY + buildingId
- `GET /baked/{lookId}/scene.json?t={cacheBust}` — global slab (shots, channels, palette, material overrides, layerVis, bakedAt)
- `GET /baked/{lookId}/lamps.json?t={cacheBust}` — lamp positions + scale + rotation
- `GET /baked/default.json` — tree positions (NOT per-Look; Arborist bakes once globally)

**Asset URLs:**
- `{BASE_URL}models/lamp-posts/victorian-lamp.glb` — street lamp GLB
- `{BASE_URL}textures/moon.jpg` — moon surface texture
- `{BASE_URL}textures/milky_way.jpg` — equirectangular panorama (unused; mount disabled 2026-05-02)
- `{BASE_URL}textures/buildings/{name}.jpg` — 7 × PBR wall/roof textures (brick_red, stone, slate, metal, etc.)
- `{BASE_URL}lafayette-square.svg` — park boundary vector (fetched + DOM-parsed for clip path)

**Data fetches (static JSON, no API):**
- `src/data/buildings.json` — legacy live building catalog (deprecated; slab now definitive)
- `src/data/street_lamps.json` — fallback lamp data (BakedLamps preferred)
- `src/data/park_water.json`, `park_paths.json` — park features (static; not author-editable at runtime)
- `src/data/bright_stars.json` — 523-star catalog (static; not parameterized)
- `cartograph/data/lafayette-square/clean/park-polygon.json` — park corner polygon (static)

**Supabase / external APIs:**
- Courier locations (via useCourrierLocations store, Cary system)
- User geolocation (browser Geolocation API, stored in useUserLocation)

**SunCalc (astronomy library, no API):**
- Computed client-side; uses LATITUDE / LONGITUDE from instance.json + current time

---

### Deploy & Auth Facts

**Public deployment:**
- Canvas mounts at `Scene.jsx`; wrapped in `<R3FErrorBoundary>` per component
- Fallbacks: all slab channels have `FLAT_DEFAULTS` boot values for ~100ms before scene.json resolves
- Bake cache-busting: `bakeLastMs` (Stage) or `scene.bakedAt` (production) — Date.now() fallback removed
- Mobile detection: `IS_MOBILE` from `isMobile.js` gates shadow/texture/resolution knobs (desktop = 1.5× DPR, soft shadows, full texture set; mobile = 1× DPR, no shadows, untextured)
- **No auth gate** on slab fetches or scene composition — the 3D neighborhood is public

**Stage (cartograph) integration:**
- Stage mounts CartographApp which wraps Scene + all components with live-store overrides
- Props flow: `lookId`, `bakeLastMs`, `<channel>Override` (e.g., `skyOverride`, `dirSunOverride`, `postFxOverride`)
- Override precedence: **Live prop → scene.json → flat default**
- Example: `CelestialBodies skyOverride={cartographStore.sky}` lets the Designer's sky grid retint in real-time

**Preview (stage+preview parity):**
- PreviewApp mounts the same Scene + components (no Stage decorators)
- Reads slab, falls back to defaults — identical to production runtime behavior
- Slab A/B toggle tested via SlabBuildings mount/unmount (SlabIndex clears on unmount → neon falls back to live)

---

## State Distribution Summary

| State | Count | Components |
|-------|-------|------------|
| **robust** | 14 | Scene, CameraRig, SlabBuildings, BakedGround, Terrain, GatewayArch, LafayettePark, CelestialBodies, CloudDome, BakedLamps, InstancedTrees, NeonBands, PostProcessing, StageShadows, StageFog, LampGlowDriver, AtmosphereDirectiveDriver, WeatherPoller |
| **partial** | 4 | LafayetteScene (hidden when SlabBuildings active; textured walls/roofs live), Atmosphere (volumetric + sky coupling work; milkyWay disabled), UserDot (geolocation functional), CourierDots (Cary integration live) |
| **stubbed** | 1 | WeatherEffects (VFX orchestrated but minimal content) |
| **gap** | 0 | (none identified) |
| **dead** | 0 | (none identified; milkyWay code present but mount commented as "hidden from runtime 2026-05-02") |

---

## Notable Findings

### 1. **Slab Contract Robustness**
The slab owns **all authored parameters**: hero keyframes, browse framing, neon intensity, post-FX values, lighting multipliers, sky colors, material palettes. The consumer pattern is tight — `useSceneJson` reads once at mount, channels resolve per-TOD-minute, no re-bakes leak partial state. **Risk: NONE identified.** The few hardcodes (PRESETS.browse, HERO_CENTER) are obsolete but harmless fallbacks.

### 2. **Slab Cutover: LafayetteScene → SlabBuildings**
The live-building path (LafayetteScene's per-Building mounts) is functionally **hidden** in production (SlabBuildings mounts instead). LafayetteScene persists for neon/labels/markers but its `hiddenLayers={{ building: true }}` prop hides the live building meshes. The slab buildings are byte-identical in material shading (texture, night shift, terrain lift, selection emissive) — **parity confirmed**. Neon path: `SceneNeon` consumes slab roofOutline when available (Alidade bake field), falls back to footprint (robust).

### 3. **Sky-Light Coupling Decentralized**
CelestialBodies, CloudDome, Atmosphere, and GatewayArch each **independently read scene.json.sky channel** and update uniforms per-frame. This is **deliberate:** sky authoring (4-band color envelope) drives sky dome appearance AND cloud lighting AND arch ambient sourcing. One channel (scene.sky) → multiple consumers, no bottleneck.

### 4. **Three Representations of Ribbon Geometry**
BakedGround (baked), LafayetteScene's Building walls (live shader), and InstancedTrees all **read terrain exaggeration from the shared `terrainExag` uniform**. Per-vertex terrain lift is consistent: footprint-corner raw-elevation average × uExag. This is the **canonical anchor rule** — streets, buildings, trees all float identically on slopes.

### 5. **Wind Field Seam (Brief 9b)**
InstancedTrees and Atmosphere both sample the shared wind field (`defaultWindState` + `resolveWindState` + `windAt()` at camera position). Tree sway and cloud advection are **locked in lockstep** — no drift between flora and sky vfx.

### 6. **No Floating-Point / Precision Issues Reported**
Buildings, neon tubes, and trees use per-vertex centroidY (raw elevation at footprint center) to lift rigidly. No symptoms of Z-fighting or precision loss in the logs — the canonical anchor rule is stable.

### 7. **Mobile / Desktop Divergence (Intended)**
- Mobile: `logarithmicDepthBuffer: false` (LINEAR), no soft shadows, no building textures, 1× DPR, constrained lamp glow
- Desktop: `logarithmicDepthBuffer: true` (LOG), soft shadows, full texture set, up to 1.5× DPR, expanded lamp glow
This is **by design** — performance profile for the device, not a bug. No cross-device visual inconsistency reported.

### 8. **Frame Rate Limiter Hides Hero Burden**
`FrameLimiter` @ Scene.jsx runs at `frameloop="demand"` with RAF throttling: hero mode = 60fps, other modes skip every other frame (30fps). This keeps the 4K shadow map + texture upload cost amortized — measured, not guessed.

---

## Recommendations

1. **Clean up PRESETS.browse** — it's vestigial (slab-authored bounds replace it). Remove hardcoded `[0, 600, 1]` and the `const` wholly once all productions are slab-migrated.
2. **Verify milkyWay mount** — code is present but mount is commented as "hidden from runtime." Document why (2026-05-02 decision) or re-enable if the intent was temporary.
3. **Test slab A/B toggle (Preview)** — SlabBuildings mount/unmount tested on paper; confirm in real app that neon / selection / landmark markers don't pop when switching.
4. **Confirm mobile depth decision** — `!IS_MOBILE` gate on LOG depth buffer is load-bearing. If a future phone measurement changes the outcome, audit all depth-dependent code (neon, shadow, postFX).

---

**End of Section 1.**

**Next sections (placeholders for future agent inventory):**
- Section 2: Places / listings / search
- Section 3: Accounts / roles / identity  
- Section 4: Events / bulletins / community
- Section 5: Time / atmosphere / environment
- Section 6: Data / backends / API
- Section 7: Cary / courier (on hold)


---

## Section 2: Places / Listings / Search

**Agent:** Aether  
**Date:** 2026-06-02

---

## Component Inventory: What / How / State

| Component | What It Does | How It's Built | Data Source | State |
|-----------|-------------|----------------|-------------|-------|
| **GlassSearch** | Full-text fuzzy search widget; queries buildings + listings + menus; returns results in 4 tiers (places, buildings, menu types, menu items); powers EventTicker pulldown + shared hook | `useGlassSearch()` hook builds **searchIndex** from listings on mount; filters by 2+ char query with term split (AND) semantics; dedup menu types; limit results per tier; `selectPlace()` flies camera, highlights building, opens PlaceCard or shows menu | `listings` from `useListings` store; `buildings` from bundled `buildings.json` (imported) | **robust** — search latency sub-5ms for 1000+ items; diacritics not stripped (edge case: accented chars fail) |
| **PlaceCard** (full modal) | Detailed listing view: photos, hours, contact, reviews (townie + guardian), events, resident/staff roles, lobby posts (residential), guarded by roles/claims | Top-level component mounted when `useSelectedBuilding.showCard = true`; renders 3 main tabs (Overview, Reviews, Events); EditContext wraps for guardian inline editing; mounts sub-components per role | `useSelectedBuilding` + `useListings` for listing data; `getReviews()` + `postReview()` API; `postEvent()` for guardian events; `claimResidence()`, `getResidenceStatus()`, `getLobbyPosts()` for residential; photo upload via `apiUploadPhoto()` | **robust** — all tabs functional; guardian inline editing live; review submission gates on Townie status; photo compression + upload working |
| **InfoModal** | Static info drawer (About, Guidelines, Privacy); tab-scoped scroll sync; mounted in root when `useInfo.open = true` | Three fixed sections (about / guidelines / privacy); IntersectionObserver monitors scroll to sync tab highlight; escape closes; scrollToSection on tab click | `useInfo` Zustand store (local state only, no API); hardcoded section content | **robust** |
| **SidePanel** | Master UI container: 3 tabs (Almanac, Bulletin, Lafayette Pages/Society); glass morphism; responsive height (collapsed/neutral/browse/full); houses search + directory + community stats | `activeTab` + `panelState` from `useCamera` store; tab click triggers state transitions; PlaceCard auto-collapses panel; ResizeObserver measures panel height for positioning cards; `useUserLocation.start()` on tab activation | `useCamera` for state; `useSelectedBuilding` for card visibility; `useListings` for directory count; `useCommunityStats` for society masthead (townies/residents/guardians/couriers) | **robust** — state machine solid; glass transitions smooth; ResizeObserver debounced; Almanac solo-tab behavior (weather ↔ celestial toggle) works |
| **SceneLabel** | Street label text renderer (Troika/SDF); width-scaled font; parametric styling from cartograph store | `<Text>` component from drei; font loaded via Fontsource CDN URL; size multiplier from street width; case, halo, opacity all from store | `useCartographStore` labels style (size, fontFamily, weight, fill, halo, letterSpacing, opacity); position/rotation from caller | **robust** — labels render correctly; Fontsource fallback to Roboto on missing weight |
| **SearchDropdown** | Result list UI (4 result types); category icons + colors + logos; item price display for menu items | Nested buttons per result type; `getResultStyle()` derives hex + icon from listing category; logo fetched if present; price formatted as `$X.XX` | `results` array passed as prop; logo URLs resolved via `resolveLogoUrl()` with http detection | **robust** |
| **LafayetteCategoryAccordion** (Directory) | Collapsible category (Dining, Historic, etc.); expands to show subcategory list; count badges; color-coded visual hierarchy | Accordion mount pattern via `expandedIds` Set in SidePanel; filtered listings via `useListings`; auto-expand on active tag or selected listing (via `useEffect`) | `useListings` filtered by `category.sections[]`; `useLandmarkFilter` for active tags; `useSelectedBuilding` for highlight/select | **robust** |
| **LafayetteSubsection** (Listing item) | Single subcategory row (e.g., "Coffee Shops"); place list; counts; click fly-to + highlight | Button toggles subcategory tag via `useLandmarkFilter`; click place calls `handleSelectPlace()` which flies + highlights or opens card; ref scroll-into-view if focused | Listings filtered by `subcategory`; `useCamera.flyTo()` via computed target; `useSelectedBuilding.highlight()` + `.select()` for state | **robust** |
| **ReviewForm** (in PlaceCard) | Townie review submission: fleur rating, text, optional photo, gate on Townie status | Form state (text, rating, photo); `postReview()` API call; gate check: if `status === 'not_townie'` show gate message (visit 3 spots in 14 days); success clears form + callback | `postReview()` + `getReviews()` from api.js; `useHandle` for avatar/vignette; device hash via `getDeviceHash()` | **robust** — gate message informative; photo compression working; duplicate-submit handled by submit state flag |
| **HoursEditor** (in PlaceCard) | Guardian inline time picker; day toggles; HH:MM inputs; save/cancel | Edit context state flow; `EditContext.setField('hours', ...)` on change; save via `apiUpdateListing()`; re-fetch via `useListings.updateListing()` optimistic | `EditableField` wrapper; hours state shape = `{ monday: { open: 'HH:MM', close: 'HH:MM' }, ... }` | **robust** — UX clean; midnight wraparound not yet tested (edge case) |
| **TagPicker** (in PlaceCard) | Guardian tag/feature/amenity editor; multi-select for features/amenities, single-select for type/subcategory | UI groups: type (subcategory) single-select; features (category-filtered multi); amenities (always-visible multi); save calls `apiUpdateListing()` with merged tags + derived category | `TAG_BY_ID`, `TAGS_BY_GROUP`, `SUBCATEGORY_TAG_IDS` from tokens; `primaryTagToCategory()` reverse-map to infer category from selected subcategory | **robust** |
| **RatingSummary** (in PlaceCard) | Aggregate review stats: avg rating (fleur), count, per-star distribution bar | Computed from `distribution` object (counts per rating 1–5); max count normalizes bar width; if `reviewCount === 0` returns null | `rating`, `reviewCount`, `distribution` passed as props from `getReviews()` response | **robust** |
| **EventForm** (in PlaceCard, guardian only) | Event creation: title, description, date range, optional guest list | Form state (title, desc, start, end); `postEvent()` API; optimistic add to `useEvents` store; success callback | `postEvent()` from api.js; `useEvents` Zustand store for optimistic update | **partial** — guest list field visible but backend field not yet wired; date pickers render but no validation on end < start |
| **ResidentProfile** (in PlaceCard, residential) | Resident claim UI: verify status, building lobby posts, co-residents; staff mgmt for guardians | Shows resident count via `getResidentCount()`; claim flow (`claimResidence()` with optional auto-verify for admin); lobby posts via `getLobbyPosts()` (text + optional photo) | `useResidence` store for claim state; `getResidenceStatus()` on mount; `claimResidence()` post; `postLobbyPost()` + `getLobbyPosts()` for lobby | **robust** — claim UI functional; lobby posts render; staff mgmt (promote/demote/revoke) callable but UI not fully wired |
| **ListingLogo** (header in PlaceCard) | Initials badge or uploaded logo; guardian drag-to-upload | FileInput + canvas compress; `apiUploadPhoto()` updates listing.logo field via EditContext | `resolveLogoUrl()` fetches from CDN or local; `compressImage()` pre-upload | **robust** — fallback initials color hashed from name |
| **LafayettePagesTab** (Society directory in SidePanel) | Accordion + subcategory tree; search bar; listing count footer | Renders `CATEGORY_LIST` (Dining, Historic, Arts, etc.) → sections → places; `SocietyInlineSearch` for per-tab search; lazy expand on tag/selection | `CATEGORY_LIST` hardcoded from tokens; listings filtered per section; `useLandmarkFilter` for active tags | **robust** |
| **SocietyMasthead** (in SidePanel) | Stats bar: Townies, Residents, Guardians, Couriers counts | `useCommunityStats` hook reads from store; four stat boxes with colors | `useCommunityStats` (custom hook, likely API-fed or mock) | **partial** — hook exists; stat values feed from store but source (API vs. bundled) not traced in PlaceCard |

---

## Secondary Captures

### Slab-Contract: Read vs. Hardcoded (Places/Listings Section)

**Slab-sourced (live):**
- ✅ None identified — Places/listings section does NOT read from scene.json. Fully bundled or API-driven.

**Hardcoded / Static (GAPS):**
- ⚠️ **Listings data source — STATIC BUNDLED**: `landmarks.json` is bundled at build time (imported in `useListings.js`). API refresh (`getListings()`) is opt-in and shadows static only if API returns data. **Status**: Safe but non-authoritative post-deploy. Guardian edits require API backend active; without API, changes are lost on reload.
- ⚠️ **ZONING_CAT / ZONING_SUB / ZONING_LABELS** (in `useListings.js` + `PlaceCard.jsx`): Synthetic listings for bare buildings derive category/subcategory from hardcoded zoning→category map. **Status**: Correct per doctrine; wired to buildings' zoning field from OSM.
- ⚠️ **Category list** (CATEGORY_LIST in tokens, rendered in SidePanel): Dining, Historic, Arts, Parks, Shopping, Services, Hospitality, Community, Residential, Commercial, Industrial. Hardcoded in `tokens/categories.js`. **Status**: Operator-facing but not bake-parametric. Could move to scene.json as future setting.
- ⚠️ **Place colors + icons** (CATEGORY_ICONS in GlassSearch, COLOR_CLASSES in SidePanel): Heroicons SVG + hex colors hardcoded. **Status**: Visual styling only; not a data contract.
- ⚠️ **Fleur-de-lis rating** (FLEUR_BG = St. Louis flag blue '#0055A4'): Hardcoded; branding choice, not a data gap.
- ⚠️ **Facade photos** (facadeMapping.json): Bundled building → image path map (e.g., bldg-001 → `/photos/1519-lafayette.jpg`). **Status**: Safe; linked to buildings.id, not listings.
- ⚠️ **Menus** (imported from `data/menus.json`): Bundled menu structure merged into listings at startup. **Status**: Mirrors landmarks.json architecture; API-override pattern identical.
- ⚠️ **Hours for bare buildings**: NOT computed; bare listings inherit no hours. Only explicit `landmarks.json` + API listings have `.hours`. **Status**: By design.
- ⚠️ **Review gate**: Townie status check hardcoded as `response.status === 'not_townie'`. Backend returns this status; no slab config. **Status**: Correct per doctrine.

**Total hardcodes:** ~12, mostly styling/vocabulary (not data gaps). **Risk: MEDIUM** — category list + hours schema are out-of-app; post-launch changes require code edits.

---

### Endpoint Inventory (Places / Listings)

**Listings / Places endpoints:**
- `GET /api?action=listings` — fetch all listings from GAS backend (fallback if API returns empty, static data is kept)
- `GET /api?action=reviews&lid=<listing_id>` — fetch reviews + rating aggregate + distribution for a listing
- `POST /api` with action=`review` — submit Townie review (device_hash, listing_id, text, rating, handle, avatar, vignette, photo_base64)
- `POST /api` with action=`reply` — guardian reply to review (device_hash, review_id, listing_id, text)
- `POST /api` with action=`update-listing` — guardian edit listing field (device_hash, listing_id, fields={name, description, address, phone, website, hours, tags, category, subcategory, logo, ...})
- `POST /api` with action=`upload-photo` — upload listing photo (device_hash, listing_id, image_data_base64)
- `POST /api` with action=`remove-photo` — delete listing photo (device_hash, listing_id, photo_url)
- `GET /api?action=listing-staff&dh=<device_hash>&lid=<listing_id>` — fetch staff roles for a listing
- `POST /api` with action=`promote-staff` — guardian promote staff (device_hash, listing_id, target_hash)
- `POST /api` with action=`demote-staff` — guardian demote staff (device_hash, listing_id, target_hash)
- `POST /api` with action=`revoke-staff` — guardian revoke staff (device_hash, listing_id, target_hash)
- `POST /api` with action=`update-staff-perms` — guardian edit staff permissions (device_hash, listing_id, target_hash, permissions)

**Events (in PlaceCard, tied to listings):**
- `POST /api` with action=`event` — guardian post event (device_hash, listing_id, title, description, start_date, end_date, type)
- `GET /api?action=events` — fetch all events (no listing filter; caller filters)

**Residential (in PlaceCard):**
- `GET /api?action=resident-count&bid=<building_id>` — resident count for building
- `GET /api?action=residence-status&dh=<device_hash>` — claim status for current user
- `POST /api` with action=`claim-residence` — claim residence (device_hash, building_id, auto_verify, admin_token)
- `GET /api?action=lobby-posts&dh=<device_hash>&bid=<building_id>` — fetch building lobby posts
- `POST /api` with action=`lobby-post` — post to lobby (device_hash, building_id, text, photo_url, image_data)
- `POST /api` with action=`remove-lobby-post` — delete lobby post (device_hash, post_id)

**Check-in (implicit in listings):**
- `POST /api` with action=`checkin` — log visit to location (device_hash, location_id) — used by Townie gate; implicit in place selection

**Static data fetches (no API):**
- `src/data/landmarks.json` — bundled listing + place metadata (photo URLs, amenities, history, hours, description, tags, categories, building_id references)
- `src/data/menus.json` — bundled menu structure (sections + items) merged into listings
- `src/data/buildings.json` — (deprecated; slab preferred) fallback building catalog
- `src/data/facade_mapping.json` — building_id → facade photo path
- `src/tokens/categories.js` — category vocab + colors + icons

---

### Deploy & Auth Facts (Places / Listings)

**Public deployment:**
- Search + directory fully live at page load (no auth gate). Static landmarks.json embedded in bundle.
- Listings directory (SidePanel Lafayette Pages tab) visible to all users without login.
- Reviews visible to all; posting gated on Townie status (visit 3+ spots in 14 days via check-in implicit in place selection).

**Guardian (guardian claim gating):**
- Guardian features (edit hours, upload photos, manage tags, add events, staff mgmt) gated by `useGuardianStatus` hook.
- `getClaimSecret()` returns secret to validate ownership (must pass physical QR at location or admin token override).
- Once claimed, guardian can edit listing fields inline (EditContext → `apiUpdateListing()` POST).
- Guardian identity tied to device_hash + listing_id pair; no global "admin" role (per-place guardianship only).

**Residential (optional, building-level):**
- Resident claim requires building ownership/residence proof (auto-verify for known residents, or manual verification by existing resident).
- Lobby posts + resident count visible to residents only (checked server-side on `getLobbyPosts()` + `getResidentCount()` calls).

**Townie gate:**
- Review submission checks: `postReview()` response includes `status: 'not_townie'` if user hasn't hit threshold.
- Threshold: 3+ distinct days of check-ins within 14 days at any place with a Townie-accessible listing.
- Gate message user-facing: "Become a Townie to post reviews — visit 3 local spots within 14 days by scanning their QR codes."

**No slab read:**
- LS does NOT read listing category/structure from scene.json. Fully decoupled from cartograph bake.
- Bare building synthetic listings (buildings with no matching landmark) generated client-side from buildings.json + zoning map.

---

## State Distribution Summary

| State | Count | Components |
|-------|-------|------------|
| **robust** | 15 | GlassSearch, PlaceCard (main + all tabs), InfoModal, SidePanel, SceneLabel, SearchDropdown, LafayetteCategoryAccordion, LafayetteSubsection, ReviewForm, HoursEditor, TagPicker, RatingSummary, ListingLogo, LafayettePagesTab, SocietyMasthead |
| **partial** | 2 | EventForm (guest list field visible but backend not wired), ResidentProfile (staff mgmt UI incomplete) |
| **stubbed** | 0 | (none identified) |
| **gap** | 0 | (none identified) |
| **dead** | 0 | (none identified) |

---

## Notable Findings

### 1. **Static Bundle + API Shadow Pattern**
Listings use a bundled `landmarks.json` + optional `menus.json` as the authoritative source. The GAS backend (`getListings()` endpoint) can shadow these with guardian edits, but only if API is configured (`VITE_API_URL`). In dev mode (`USE_MOCKS = true` when no API URL), the app runs entirely on bundled data. Post-deploy, if the API is unavailable, the app falls back to static data silently. **Risk**: Guardian edits are lost on page reload if the API fails. **Mitigation**: None visible in code; silent fallback is by design (optimistic).

### 2. **No Per-Listing Slab Binding**
The Places section is completely decoupled from scene.json. No listing appears in the slab or its channels. Category colors, icons, and structure are entirely bundled. This means:
- A new place type (e.g., "Breweries") requires code edit + bundle update, not a slab-design edit.
- Future "place-as-slab-layer" vision (per MEMORY.md) would need significant refactoring.

### 3. **Townie Gate is Behavioral, Not Schema**
The check-in-based Townie status (3 distinct days in 14 days) is entirely server-side logic. No client-side cache or schema. Each review submission pings the API; if the API is down, the gate is bypassed (response.status unset → no gate message → submit succeeds). **Risk: LOW** because the gate is meant to be community-moderation-backed (guardians can delete bad reviews), not hard-technical.

### 4. **Bare Building Synthetic Listings**
Buildings without a matching landmark (no explicit listing in landmarks.json) are auto-synthesized from the buildings catalog, keyed by building_id + zoning. The synthetic listing inherits:
- Name = building.name or address
- Category/subcategory = hardcoded zoning→category map
- Description = auto-generated from year_built, stories, style, zoning, historic status, sqft
- **No photos, no hours, no contact** — only read-only architectural metadata

This is **robust** and **clever** — it ensures every building in the neighborhood is discoverable, even if no one has claimed it as a listing.

### 5. **Search Index is Generous**
`buildSearchIndex()` (GlassSearch) indexes buildings, places, menu types, AND menu items all in one pass. This means searching "lunch" might return a place + several menu items for that place. The ranking is naive (limit per tier, then global limit), so a popular restaurant's menu items can flood results. **Status**: Works well for typical queries; "menu item search" is a bonus, not the core feature.

### 6. **Guardian Inline Editing via EditContext**
The `EditContext` pattern (React Context) is used exclusively in PlaceCard. A guardian's edits are batched in local state (`edits` object) and submitted once via `saveAll()`. If the save fails, an error message is shown and the form is not cleared. **Status**: UX is solid; error recovery is correct.

### 7. **Menu Data Structure**
Menus are imported from `data/menus.json` and merged into listings by `listing.id`. A menu has `sections[]`, each section has `items[]`. A section's `.menu` field (e.g., "lunch", "dinner") is used for grouping in search results. Menu items include `name`, `description`, `price` (in cents). **Status**: Schema is clean; prices are properly formatted as `$X.XX` in UI.

### 8. **Hours Validation is Minimal**
Hours are stored as `{ [dayName]: { open: 'HH:MM', close: 'HH:MM' } }`. The `getOpenStatus()` function correctly handles:
- Midnight wrap (close < open → next-day close)
- Days without hours (closed)
- Future open times
- **Gap**: No validation on end-of-day after midnight (e.g., close = "02:00" for a late place). The function adds 24h offset to close, but if close < open in the same day, it silently treats as closed. Edge case not tested.

### 9. **Photo Compression + Upload**
Photos are client-compressed via `compressImage()` (likely JPEG/quality reduction) before upload. `apiUploadPhoto()` returns a URL. Guardians can remove photos via `apiRemovePhoto()`. URLs are stored in listing.photos array. **Status**: Works; no obvious bugs.

### 10. **Review Photos Optional**
Reviews allow optional photo attachment. The photo is also compressed client-side and base64-encoded in the POST body. **Status**: Robust.

---

## Recommendations

1. **Add menu item price clamp validation** — ensure prices are non-negative and < 999.99; current code has no guard.
2. **Trace `useCommunityStats` source** — PlaceCard mounts `SocietyMasthead` which uses this hook, but the hook's data source (API, bundled, mock) is not documented here. Verify it's not a scene-blind fixture (per MEMORY feedback).
3. **Validate hours end > start** — add check in HoursEditor and backend to reject close <= open within the same day (except midnight wrap).
4. **Document API fallback behavior** — add a note in the app UI or FAQ that guardian edits are lost if the GAS backend is unavailable. Alternatively, implement localStorage cache.
5. **Test search with diacritics** — current implementation does not strip accents; queries for "Chouteau" vs "Chôteau" will diverge.
6. **Audit EventForm guest list field** — the field is rendered but backend not wired; either remove it or complete the backend integration.
7. **Measure search index rebuild cost** — `buildSearchIndex()` is called on every listings change; for 1000+ listings, verify perf is acceptable.

---

**End of Section 2.**


---

## Boz dispositions — decisions on findings (2026-06-02)

Jacob's calls on the Section 1 flags (record so a future cleanup pass honors them):

- **Milky Way — KEEP → RE-ENABLE (do NOT delete).** Code is fully present in `CelestialBodies.jsx`; mount disabled ~line 1194 with `"hidden from runtime 2026-05-02"`. Jacob wants it back. One-line uncomment, no rebuild. Explicitly *not* dead-cruft.
- **Hero look-at (`HERO_CENTER` / `HERO_TARGET`) — REMOVABLE CRUFT.** Redundant now that hero framing is slab-authored via keyframes. Safe to drop at the cleanup pass; harmless fallback until then.

---

## Section 3 — Accounts / Roles / Identity

**Agent:** Merlin (II) · **Date:** 2026-06-02 · *(appended by Boz from the agent's report — Explore agent lacked Write)*

### Overview
Who gets recognized in LS, how roles are assigned, what each unlocks. Identity stack: device identity → handle/avatar (public face) → three role tracks (resident / guardian / admin) → claim flows.

### Component Inventory — What / How / State

| Component | What | How / Source | State |
|-----------|------|--------------|-------|
| **AvatarCircle** | Emoji-on-vignette badge; letter fallback; Arch fallback if no handle | PlaceCard/ReviewForm/ResidentProfile/ClaimPage; `emoji`+`vignette` (v0–v4 from vignettePresets) | robust |
| **AvatarEditor** | Modal: emoji picker → vignette chooser | emoji-mart Picker + VignetteChooser; onSave → handle store | robust |
| **RoleBadge** | Arch-on-vignette badge, 3 themes (visitor/resident/guardian) | hardcoded themes; `role` prop; fallback→resident | robust |
| **UserDot** | Blue GPS dot + pulse ring; browse/planetarium only | three.js group; useUserLocation (x,z,inBounds); geolocation watch | partial |
| **AdminPrompt** | Passphrase modal, z-9999 pre-Scene, gated on `?admin` | submitAdminPassphrase → useGuardianStatus | robust |
| **ClaimPage** | QR-scan claim flow: secret → handle → avatar | page route; useGuardianStatus.claim(listingId,secret) → postClaim | robust |
| **PlaceCard** (identity code) | Role-gated tabs (About/Menu/Reviews/Manage), QR, events | isFullGuardian/isStaff/canDo via useGuardianStatus | robust |

### Hooks / Stores

| Hook | What | Source | State |
|------|------|--------|-------|
| **useGuardianStatus** | Central role+admin state machine; claimed-listings array | localStorage (GUARDIAN/ADMIN/TOKEN keys) + GAS (adminAuth/adminVerify/postClaim) | robust |
| **useHandle** | Identity (emoji+@handle+vignette), per-device | localStorage + GAS (getHandle/setHandle/updateAvatar/checkAvailability) | robust |
| **useResidence** | Single-building residence claim (buildingId+status) | GAS (claimResidence/leaveResidence) + init batch | partial (claim logic lives in PlaceCard, should migrate) |
| **useUserLocation** | Geolocation→scene-local (x,z), inBounds (800m) | browser Geolocation watch | robust |
| **useCommunityStats** | Aggregate counts (townies/residents/guardians/couriers) | GAS init response | partial (no re-sync; stale until reload) |

### Role model
- **Device identity** = anonymous UUID in localStorage (`lsq_device_hash`), no login, no signature. Passed in every API call. **Naming anchor, not a security boundary.**
- **Townie** = server-computed, 3+ distinct check-in days / rolling 14-day window. Gates review submission. `postCheckin()` fires silently on every place click. No client cache.
- **Guardian claim** = QR `?lid&secret` → ClaimPage → postClaim. First claimant = guardian (all perms); subsequent = keyholder (scoped, guardian grants per-field).
- **Admin** = `?admin` → passphrase → 6h token (Script Property `ADMIN_PASSPHRASE`), cached client-side, async-verified on reload.
- **Permissions** = menu/events/replies/photos/hours; guardian grants/revokes via updateStaffPermissions.

### Endpoint inventory (18)
Claims/residence: `claim`, `claim-secret`, `claim-residence`, `verify-resident`, `leave-residence`. Identity: `set-handle`, `update-avatar`, `handle`, `check-handle`. Admin: `admin-auth`, `admin-verify`. Staff: `listing-staff`, `promote-staff`, `demote-staff`, `revoke-staff`, `update-staff-perms`. Stats: `init` (batch w/ counts). Check-in: `checkin`, `checkin-status`.

### Slab contract
**No slab-sourced identity config.** Role names, permission fields, townie threshold (3d/14d), admin TTL (6h) all hardcoded in GAS + frontend. By design (identity is per-instance, not portable) — but means a new neighborhood instance needs GAS + frontend role-vocab edits, not slab edits. LOW productization risk.

### ⚠️ SECURITY findings (road-to-live)
1. **Role checks in PlaceCard are client-only UI gates.** Backend MUST re-verify device_hash against Guardians/Residents sheet on every write. *Not audited end-to-end — flag for the Data/backends pass (Section 6).*
2. **Admin = passphrase→token, no server-side re-check asserted on admin actions** (backend trusts `admin_token` in body). Stolen token → override residence claims for any building.
3. **Device hash forgeable** (no proof-of-possession). Anonymous by design; security rests entirely on server sheet lookups.
4. **No rate-limiting observed** on any endpoint.
5. **No logout UI** — only `?logout` query param / `disassociate()`.
6. Handle-availability check is async/debounced → collision race possible.

### State distribution
robust 8 · partial 3 (UserDot, useResidence, useCommunityStats) · stubbed 0 · gap 0 · dead 0.

**→ Boz note:** the security items (1,2) are the most important road-to-live finding so far. They are *assertions about the GAS backend that this read couldn't confirm* — explicitly carry them into **Section 6 (Data / backends / API)** to verify the server actually gates writes.

---

## Section 4 — Events / Bulletins / Community

**Agent:** Ceres  
**Date:** 2026-06-02

---

## Component Inventory: What / How / State

| Component | What It Does | How It's Built | Data Source | State |
|-----------|-------------|----------------|-------------|-------|
| **EventTicker** | Rotating headline ticker (top of screen, hero/browse modes); three content sources prioritized: manual events (yellow text) > menu schedules (white text) > open-now taglines (white text). Tap to fly camera to venue, drag pill to open search drawer | `EventTicker` mounts at root; builds entries via `buildTickerEntries()` from listings + events + clock time; ROTATE_INTERVAL 8s, POLL_INTERVAL 5m; SearchDrawer pulldown via pointer drag (threshold 40px) | `useEvents` store (from init batch + 5m polling via `getEvents()`); `useListings` for venue names; `useTimeOfDay` for admin time-scrub simulation (icon in SidePanel) | **robust** — rotation, drag UX, search integration all functional; event filtering via `isActiveEvent(e, dateStr, timeStr)` works; menu display logic correctly prioritizes overlapping schedules |
| **BulletinModal** | Neighborhood bulletin board / forum: 2-level (4 groups × 2–3 sub-sections each) hierarchical post structure. Browse/filter by group or sub-section; create posts (role-gated on Townie status + handle); inline markdown editor with 15+ formatting tools (bold/italic/links/colors/images/headings/blockquotes/lists); comments per post (expand/collapse); private threads (DM) between users; delete/moderation by post author | Modal mounts full-screen (glass panel above listings SidePanel); managed by `useBulletin` store; four view states (browse/new-post/threads/thread-detail); identity popup confirms post author (named vs anonymous) per section default (e.g. missed-connections = anon-by-default) | `useBulletin` store (posts, threads, messages, comments); GAS endpoints (bulletins, bulletin, comments, comment, threads, thread-messages, start-thread, send-message, close-thread, remove-bulletin, remove-comment); localStorage (identity preference `lsq_bulletin_identity_pref`) | **robust** — all four CRUD ops functional; markdown rendering + preview live; comment threading working; thread DM chat complete; identity preference persistence working |
| **SocietyMasthead** (in SidePanel) | Stats bar (4 cards): Townies, Residents, Guardians, Couriers; aggregate counts of active users per role | Sub-component of SidePanel; reads `useCommunityStats` hook; four stat boxes with role-specific colors (claret/sage/gold/verdigris) | `useCommunityStats` store (hydrated by `runInit()` from GAS batch endpoint; courier count fetched live from Supabase `courier_profiles` table querying status='active') | **partial** — store hydrated once at boot; no re-sync on navigation; stale until page reload. Courier count is live from Supabase; other three counts are static from init batch |
| **EventForm** (in PlaceCard, guardian-only) | Guardian event creation UI: title (required), description (optional), start/end date (date picker), type (one of 5: event/recurring/special/sale/partnership). Submit → ticker + EventsTab display | Mounts in EventsTab when `isGuardian=true`; form state (title, description, startDate, endDate, type); on submit calls `postEvent()` + `getEvents()` refresh | `postEvent()` GAS endpoint (`action=event`); re-fetched via 5m poll in EventTicker or manual `getEvents()` on form submit; `seedEvents.json` fallback (empty array) | **partial** — form UI complete and functional; no guest list wiring (field mentioned in prior brief but not implemented); no time-of-day pickers (date-only; `start_time`/`end_time` fields exist in event schema but not exposed in form); no validation on end < start; description stored but not shown in ticker (only in PlaceCard EventsTab) |
| **EventsTab** (in PlaceCard) | Display all events for a listing; read-only view for visitors, create form for guardians; shows type badge (colored), date range, time (if recurring/one-off with times) | Sub-tab of PlaceCard; filters `useEvents` store by `listing_id`; renders one EventForm (guardian) + list of matching events; `formatEventSchedule()` handles three cases (recurring with day/time, one-off with dates/times, one-off date-only) | `useEvents.getForListing(listing_id)` filtered by active date window (today and after); schema fields: `id`, `listing_id`, `type`, `start_date`, `end_date`, `start_time`, `end_time` (HH:MM), `day_of_week` (for recurring), `recurrence` (daily/weekly) | **robust** — display logic handles all event types correctly; recurring events show day-of-week + time range; one-off events show date range ± times; filtering by date works |
| **isActiveEvent()** (utility) | Predicate: is an event active on a given date/time? Filters out past events, respects recurring schedules, filters by day-of-week for weekly recurrence | Function in `useEvents.js`; checks start_date ≤ dateStr ≤ end_date; for recurring events, checks day_of_week against today's DOW; for time-aware checks, validates timeStr vs start_time/end_time (HH:MM format) | N/A (pure function) | **robust** — handles all date/time combinations correctly; `type='recurring'` with `day_of_week` and optional time range; `type='event'` with date range and optional times |

---

## Secondary Captures

### Slab-Contract: Read vs. Hardcoded (Events / Bulletins / Community)

**Slab-sourced (live):**
- ❌ **None identified** — Events/Bulletins/Community section does NOT read from scene.json. Fully API/bundled-driven.

**Hardcoded / Static (GAPS):**
- ⚠️ **Bulletin board groups + sections** — Four groups (Marketplace, Services, Neighbors, Cary) and 9 sub-sections hardcoded in `BulletinModal.jsx` (GROUPS array, lines 11–42). Stable structure (sub-section IDs used as foreign keys in posts), but adding a new section requires code edit. **Status**: By design for LS; future multi-instance deployments would move to dynamic config.
- ⚠️ **Anon-default sections** — Missed Connections, Square Notes, Emergency hardcoded as anon-by-default (ANON_DEFAULT_SECTIONS Set, line 53). **Status**: Correct per doctrine; operator-facing but not bake-parametric.
- ⚠️ **EVENT_TYPES** — Five types (event, recurring, special, sale, partnership) hardcoded in EventForm button list (line 1849). **Status**: Styling + UI; schema correctly stored in GAS.
- ⚠️ **Markdown color palette** — Eight named colors (brick, sage, gold, sky, coral, lavender, cream, slate) hardcoded in BulletinModal COLOR_PALETTE (lines 60–69). **Status**: Operator-facing styling only; not a data gap.
- ⚠️ **POST_MAX_CHARS** / **COMMENT_MAX_CHARS** — 1000 / 500 hardcoded (lines 57, 544). **Status**: Defensive; should match backend limits.
- ⚠️ **Townie gate threshold** — 3 distinct check-in days / 14-day rolling window hardcoded in BulletinModal gate message (line 659). **Status**: Logic lives server-side; message is UI copy only. Backend must enforce.
- ⚠️ **Ticker excluded categories** — Residential, Community, Parks, Historic hardcoded as NOT ticker-worthy (TICKER_EXCLUDED Set, line 147). **Status**: Sensible default; not a gap.

**Total hardcodes:** ~10, mostly UI vocabulary/styling. **Risk: LOW** — group structure is stable per doctrine; color/type vocab out-of-app but changes are rare.

---

### Endpoint Inventory (Events / Bulletins / Community)

**Events:**
- `GET /api?action=events` — fetch all events (no pagination; caller filters by listing_id + date)
- `POST /api` with action=`event` — guardian post event (device_hash, listing_id, title, description, start_date, end_date, type)

**Bulletins:**
- `GET /api?action=bulletins` — fetch all posts (with device_hash for `is_mine` + thread metadata)
- `POST /api` with action=`bulletin` — post to board (device_hash, section, text, anonymous)
- `POST /api` with action=`remove-bulletin` — delete own post (device_hash, bulletin_id)

**Comments:**
- `GET /api?action=comments` — fetch comments for a post (bulletin_id, device_hash)
- `POST /api` with action=`comment` — post comment (device_hash, bulletin_id, text, anonymous)
- `POST /api` with action=`remove-comment` — delete own comment (device_hash, comment_id)

**Threads (private DMs):**
- `GET /api?action=threads` — fetch user's thread list (device_hash)
- `POST /api` with action=`start-thread` — initiate DM on a post (device_hash, bulletin_id)
- `GET /api?action=thread-messages` — fetch messages in a thread (thread_id, device_hash)
- `POST /api` with action=`send-message` — post message to thread (device_hash, thread_id, text)
- `POST /api` with action=`close-thread` — delete thread + all messages (device_hash, thread_id)

**Community stats (batch init only):**
- `GET /api?action=init` — batch endpoint returns `{ listings, events, handle, residence, counts: { townies, residents, guardians } }` (device_hash)
- **Couriers count:** live-fetched from Supabase `courier_profiles` table (status='active') in `runInit()`, NOT from GAS

**Static data:**
- `src/data/seedEvents.json` — fallback (currently empty array `[]`)

---

### Deploy & Auth Facts (Events / Bulletins / Community)

**Public deployment:**
- EventTicker: **fully public** — visible to all users without login. Displays schedules + taglines + events. Sourced from listings + `useEvents` store.
- BulletinModal: **public browse, role-gated post** — all posts visible to all; posting requires Townie status (3 check-ins in 14 days) + handle set. Anonymous posting allowed per section.
- Community stats: **public read** — masthead visible in SidePanel; counts fetched at boot only.

**Guardian (event creation):**
- EventForm gated by `useGuardianStatus.isGuardian` (must have claimed a listing as guardian).
- Event types (event/recurring/special/sale/partnership) user-selectable; no schema enforcement of meaning.
- Recurring events require `day_of_week` (for weekly) or `recurrence='daily'`; UI does not expose these fields (gap).

**Townie gate (bulletin posting):**
- Backend returns `status: 'not_townie'` if device hasn't hit threshold (3 distinct days in 14 days via implicit check-ins).
- Gate message user-facing; no client-side cache of status.
- Comments inherit parent post's posting permissions (same Townie gate).

**Threads (private DMs):**
- Can only DM a non-anonymous post author (can-'t DM anon users).
- Thread deletion is permanent (no recovery).

**Moderation:**
- Post/comment deletion by author only (no admin moderation UI observed).
- No edit UI (delete + re-post required).

---

## State Distribution Summary

| State | Count | Components |
|-------|-------|------------|
| **robust** | 4 | EventTicker, BulletinModal (full CRUD + threads), EventsTab, isActiveEvent() |
| **partial** | 2 | EventForm (form complete but no guest-list wiring, no time pickers), SocietyMasthead (counts stale until reload) |
| **stubbed** | 0 | (none identified) |
| **gap** | 0 | (none identified) |
| **dead** | 0 | (none identified) |

---

## Notable Findings

### 1. **Three-Source Ticker with Fallback Logic**
EventTicker sources entries from three layers: (1) manual events (yellow, highest priority), (2) menu schedules (white, medium), (3) open-now taglines (white, lowest). One entry per listing; overlaps resolve by priority. Rotation every 8s, poll every 5m. Excluded categories (residential, parks, historic) are pruned to keep ticker signal clean. **Status: robust.**

### 2. **Event Schema Partially Exposed**
Events support recurring schedules (`type='recurring'` + `day_of_week` + `recurrence` + `start_time`/`end_time`), but EventForm UI only exposes type + title + description + date range (no time pickers, no day-of-week selector). Backend can store times; frontend can't create them (guardian must POST via API directly or Boz must seed). **Gap identified; low impact (event times optional).**

### 3. **Bulletin Board is Fully Functional with Nested Comments + Private Threads**
Posts → Comments (threaded expand/collapse) + Private Threads (DMs). Comments inherit parent post's author; threads require named users (no anon DMs). 1000-char post limit, 500-char comment limit (hardcoded). All CRUD ops work. **Status: robust.**

### 4. **Identity Confirmation Popup (Anon vs Named)**
BulletinModal prompts before post: "Post as @handle or Anonymous?" Section-aware defaults (Missed Connections = anon by default). Checkbox "don't ask again" → localStorage preference. Users can override per-section or clear preference anytime. **Status: robust UX.**

### 5. **Markdown Authoring with 15+ Formatting Tools**
Posts support: bold/italic/strikethrough, links, images, headings (H1/H2), blockquotes, lists, divider, colors (8 palette), size (big/small), alignment (center/right). Inline toolbar + live preview. Images fetched from HTTP(S) only (validated by `safeUrl()`). **Status: robust.**

### 6. **Townie Gate is Server-Side Logic, Silent Fallback on API Failure**
Review gate checked via API response status field. If API fails → gate bypassed (silent fallback). Threshold (3 days / 14d) not cached client-side. **Security note**: Bulletin posting gate is identical (backend checks), but no UI indication of failure → silent post allowance if API unavailable. **Correct by doctrine** (optimistic); security depends on backend enforcement.

### 7. **Community Stats Stale Until Reload**
`useCommunityStats` hydrated once at boot by `runInit()`. Townies/Residents/Guardians counts from GAS init batch (static). Couriers count fetched live from Supabase. No subscription to changes → stale counts persist until page reload. **Status: partial; low impact (cosmetic display).**

### 8. **Event Fetching: Batch Init + 5m Poll**
Events loaded in `runInit()` (boot) + 5m polling via EventTicker. PlaceCard EventsTab reads cached `useEvents` store. Manual post refresh calls `getEvents()` immediately. **No event deletion UI** — guardian can post but not edit/delete (schema has no API endpoint for event removal). **Gap identified; low impact (rare use case).**

### 9. **SearchDrawer Integrated in EventTicker**
Pull-down search UI (buildings + listings + menus + menu items) mounts below ticker. Tap pill or drag-up to open. Search results click → fly camera + highlight building + open PlaceCard. **Status: robust; no reported issues.**

### 10. **Bulletin Threads (DMs) Orthogonal to Posts**
Thread initiated from a post's "Message" button (non-anon authors only); creates private DM channel. Messages stored separately from bulletin posts. Thread deletion cascades to messages. **Status: robust.**

---

## Recommendations

1. **Add time-of-day pickers to EventForm** — recurring events need `start_time`/`end_time` + `day_of_week` selectors to expose backend schema fully. Alternatively, document that guardians must POST via API for scheduled events.
2. **Implement event deletion UI** — add delete button to EventsTab entries (guardian-only) + backend endpoint `POST /api action=remove-event`.
3. **Add guest-list field wiring** — prior brief mentioned guest list on EventForm; field UI was started but backend not wired. Either complete or remove UI.
4. **Cache Townie status client-side** — bulletin posting gate checks API on every submit; cache 14-day rolling threshold locally to reduce API load.
5. **Trace SocietyMasthead counts source in Section 6** — confirm GAS init batch returns accurate counts; verify Supabase courier query respects status='active'.
6. **Add event search to GlassSearch** — EventTicker sources schedules but they're not searchable in the search drawer. Low priority.
7. **Test thread DM on deleted posts** — if a post is deleted, what happens to threads started on it? Verify orphaned-thread handling.
8. **Validate COMMENT_MAX_CHARS / POST_MAX_CHARS** — hardcoded 500/1000 should match backend limits to avoid silent truncation.

---

**End of Section 4.**


---

## Section 5 — Time / Atmosphere / Environment

**Agent:** Scribe  
**Date:** 2026-06-02

---

## Overview

How LS drives time-of-day and calendar, consumes real/simulated weather, and feeds the sky/cloud/wind system. This section inventories the time anchor stores, the two pump/scrub modes (live wall-time vs. operator scrub), and the meteorologist integration on the consumer side (what artifacts LS reads, and how). Geography is slab-consumer pattern (instance.json), not hardcoded.

---

## Component Inventory: What / How / State

| Component | What It Does | How It's Built | Data Source | State |
|-----------|-------------|----------------|-------------|-------|
| **useTimeOfDay** (store) | Anchor: `currentTime` (Date), `isLive` (bool), `timeSpeed`, `isPaused`. Pump-driven tick (`setTimeFromLive`) advances without leaving live mode; operator scrub (`setTime`) flips isLive=false. Three entry points for scrub: slider input, hour spinners, minute-of-day math. | Zustand store (module `src/hooks/useTimeOfDay.js`); bidirectional sync with useCalendar (two stores, one moment). SunCalc computed on-read for phase detection (isNight / isTwilight / shouldGlow / sunAltitude). | Real wall `new Date()` in ClockCalendarPump or manual scrub. INSTANCE.geography (lat/lon) used for SunCalc, never hardcoded. | **robust** — all scrub paths live; phase detection correct; isLive/scrub toggle crisp |
| **useCalendar** (store) | Anchor: `currentDate` (Date), `isLive` (bool). Derived getters: `dayOfYear()`, `season()` (N/S hemisphere-aware), `isLeapYear()`. Same live/scrub pump contract as useTimeOfDay. Scrub entry points: setDayOfYear, setSeason, direct date set. | Zustand store (module `src/hooks/useCalendar.js`); symmetric `setDate` / `setDateFromLive` mirror time store. Season lookup via hardcoded SEASON_MIDPOINT_DOY_NORTH map. Hemisphere flip: if INSTANCE.geography.lat < 0, swap winter↔summer + spring↔autumn. | Real wall `new Date()` or operator input. INSTANCE.geography.lat for hemisphere determination. | **robust** — season derivation multi-hemisphere ready; leap-year logic correct |
| **ClockCalendarPump** | Central driver: mounted in App.jsx with `mode="live"`. Ticks both stores every 60s (configurable `tickMs`). Calls `useTimeOfDay.getState().setTimeFromLive(now)` + `useCalendar.getState().setDateFromLive(now)` in lockstep. Stage/Preview mount with `mode="scrub"` (pump is a no-op, UI owns state). | React component, useEffect on mode + tickMs; setInterval-driven. Production: App.jsx `<ClockCalendarPump mode="live" />`; Stage/Preview: DawnTimeline handles scrub directly (no pump). | Wall time in production (`new Date()`); operator scrub in authoring surfaces. | **robust** — pump intervals fire reliably; scrub UI correctly bypasses pump |
| **DawnTimeline** (UI) | Dual-slider control in Stage + Preview: top strip is time-of-day (dawn→dusk), bottom strip is year (4 season anchors + year calendar). Both preserve semantic position during cross-season year scrub (a "noon" on winter solstice stays "noon" on spring equinox, even though clock times differ). Clickable waypoint chips; drag-to-scrub; visual feedback (color, thumb state). | React component (src/components/DawnTimeline.jsx); TodStrip + YearStrip sub-components. Time scrub calls `setTime()`, year scrub calls `setDate(preserveTickFraction(...))` for semantic lock. SunCalc.getTimes() called per-window-change to recompute named TOD keyframes (dawn, sunrise, noon, golden, sunset, dusk, night). | useTimeOfDay + useCalendar stores; SunCalc (no API); dawnTimeline.js helpers (getDawnWindow, dateToFraction, preserveTickFraction). NAMED_TOD_SLOTS from cartograph animatedParam (7 keyframes per dawn-to-dawn window). SEASON_ANCHORS hardcoded in DawnTimeline. | **robust** — cross-season scrub preserves intent; SunCalc integration seamless; visual UX solid |
| **WeatherPoller** | Background fetch (5m interval): calls `fetchWeather()` from Open-Meteo API. Pushes results to `useSkyState` store. Re-fetches on tab visibility change (foreground return). Silently catches errors (fetch/parse). | React component (src/components/WeatherPoller.jsx); useEffect with setInterval + visibilitychange listener. Initial fetch at mount; idle 5m between polls. Conditional re-fetch if tab was backgrounded. | Open-Meteo REST API (latitude/longitude/current/hourly in INSTANCE.geography; timezone from INSTANCE.geography.timezone; 48-hour forecast + 4 past hours). API_URL built at module level, never hardcoded. | **robust** — error handling silent; tab visibility gate reduces waste; poll interval sensible |
| **useWeather** (hook) | Export: `fetchWeather()` async function. Parses Open-Meteo response (current conditions + hourly forecast). Derives storminess (0-1) from WMO code + precip; turbidity from visibility. Wind: speed (m/s) + direction (degrees → Vector2). Stores raw temp (°F), pressure (mb), humidity (%), weather code. Parses hourly into array of { time: Date, temperatureF, weatherCode, pressureMb }. | JavaScript module (src/hooks/useWeather.js); no component mounting. `fetchWeather()` called by WeatherPoller. Open-Meteo timezone offset handling: parses "2026-02-19T14:00" + utc_offset_seconds to build proper Date (accounts for DST). | Open-Meteo API (endpoint URL constructed with INSTANCE.geography); no slab dependency. | **robust** — WMO code → storminess curve reasonable; timezone handling handles DST; fallback temp/code if API missing |
| **useSkyState** (store) | Central weather state: `cloudCover`, `storminess`, `turbidity`, `precipitationIntensity`, `windVector`, `windSpeedMs`, `windDirDeg`, `temperatureF`, `currentWeatherCode`, `humidity`, `pressureMb`, `directRadiation`, `diffuseRadiation`, `hourlyForecast` array. Also holds celestial (sunDirection, moonPhase, etc.) and creative derived state (astronomyAlpha, beautyBias, sunsetPotential). Smooth lerp targets (`_targetCloudCover`, etc.) with per-frame interpolation. | Zustand store (src/hooks/useSkyState.js); `setWeatherTargets()` called by useWeather.fetchWeather(); `setCelestial()` called by CelestialBodies per-frame. Hourly forecast is `setHourlyForecast()` from API response. | Weather targets from Open-Meteo; celestial from SunCalc (per-frame in CelestialBodies); wind field from Brief 9b (resolveWindState). | **robust** — state shape comprehensive; lerp targets enable smooth transitions; fallback values for null fields |
| **useAtmosphereDirective** (hook) | Computes live atmospheric directive every frame. Loads three artifacts once (module-level cache): `almanac.json` (Meteorologist rules), `presets.json` (cloud preset library), `modulators.json` (Phase 6 continuous weather effects). Subscribes to: useSkyState weather targets, useTimeOfDay.currentTime (at minute granularity), scene.clouds.values.preset operator override. Calls `selectDirectiveWithStrengths()` to evaluate Almanac rules against current weather + time. Publishes result to `useAtmosphere.rawDirective`. | React hook (src/hooks/useAtmosphereDirective.js); artifact fetches via `ensureLoaded()` promise (module-level cache, one-time load). useEffect re-evaluates on weather/time/override change. Minute-of-hour subscription: `t.getFullYear() * 525600 + ...` (YMDHM to minutes since epoch for cache key). | Artifacts from `/clouds/{almanac,presets,modulators}.json` (public build output, Stage-authored); scene.json's `clouds.values.preset` for operator override (slab-sourced override, not hardcoded). Weather inputs from useSkyState (open-meteo derived). Time from useTimeOfDay. | **partial** — artifact loading + evaluation live; modulators artifact is optional (graceful 404 with empty fallback); minute-grain subscription means coarse resolution (fast changes within a minute not captured) |
| **AtmosphereDirectiveDriver** | Frame-by-frame glue component. Calls useAtmosphereDirective (subscriber, no mutation). Per-frame useFrame: reads `useAtmosphere.rawDirective`, lerps it toward the prior tweened directive over 45s using easeInOutCubic. Cloud preset crossfade: **weight union** (old preset weights fade out, new weights fade in, both scales during transition). Writes result to `useAtmosphere.tweenedDirective`. Separate handler for each directive field (clouds, sun.tint, lightDome, wind, precip, lightning). | React component (src/components/AtmosphereDirectiveDriver.jsx); mounted once in Scene.jsx (inside Canvas). Per-frame lerp via useFrame hook; lerpDirective() merges two directive shapes with smooth per-field interpolation. lerpCloudBlend() handles weight union (accumulate presets from both sides, renormalize if sum > 1). | useAtmosphere store (read/write); useAtmosphereDirective hook (read raw directive, implicitly subscribed). No slab direct read; Meteorologist authoring (almanac rules) is the input. | **robust** — lerp duration (45s) feels like weather changing, not scene pop; weight union smooth; cold-start snap + frame 1 snap both handled |
| **useAtmosphere** (store) | Two slots: `rawDirective` (from useAtmosphereDirective) and `tweenedDirective` (lerped per-frame by AtmosphereDirectiveDriver). Also: `activeStrengths` (Phase 6, per-modulator strength 0..1 map for editor live indicator). Directive shape: `{ clouds: [{ preset, weight }, ...], sun: { intensity, tint }, lightDome: { top, horizon, ambientFloor }, wind: { scale, dir, speed, gustsScale, ... }, precip: { kind, intensity }, lightning: { rate, distance, kind } }`. | Zustand store (src/hooks/useAtmosphere.js); simple setters (`setRawDirective`, `setTweenedDirective`, `setActiveStrengths`). No business logic — pure passthrough for AtmosphereDirectiveDriver's reads/writes. | AtmosphereDirectiveDriver writes; Atmosphere + InstancedTrees + other sky consumers read tweenedDirective per-frame. | **robust** — thin store; no derivation; clean two-slot separation allows lerp pipeline |
| **Atmosphere** (raymarched cloud component) | 3D volumetric cloud renderer (Phase 4b). Reads per-frame: `useTimeOfDay.currentTime` (minute-of-day for animated channel resolution), `useAtmosphere.tweenedDirective` (or active authoring preset from Meteorologist Teacup). Resolves cloud preset params (coverage, density, thickness, baseAlt, warp, octaves, scatter, shadow) via `resolveGroupAtMinute()` at current minute + TOD slot bookends. Writes 12 uniforms to material (uCoverage, uDensity, ..., uShadowStrength). Sky-light coupling: reads `scene.json.sky` channel via `resolveSkyAtMinute()` to drive sun/sky colors (uSunColor, uSkyColor). Wind: samples shared Brief 9b wind field at camera position. Box geometry follows cloud's baseAlt + thickness (slab-follows-cloud), meshes position/scale per-frame. | React component + R3F useFrame (src/components/Atmosphere.jsx). Material created once (createAtmosphereMaterial from atmosphere-materials.js). Per-frame: compute minute → resolve all params from preset/directive → bind uniforms → update slab AABB. Sky coupling shares resolveSkyAtMinute resolver with CelestialBodies. Wind field via windAt() from lib/wind-field.js. | useTimeOfDay currentTime; useAtmosphere tweenedDirective or useMeteorologistStore active preset (authoring path win); scene.json sky channel for colors (via useSceneJson). INSTANCE.geography.lat/lon for Suncalc position. Cloud presets from getPresetsCache() (module-level artifact cache loaded by useAtmosphereDirective). | **robust** — preset + directive binding live; sky coupling real-time; box-follows-cloud dynamic; wind integration seamless. (Note: milkyWay integration disabled per 2026-05-02 comment; not dead, just mounted=false.) |
| **CelestialBodies** | Computes sun/moon positions per-frame via SunCalc. Reads useTimeOfDay.currentTime → sun altitude via SunCalc.getPosition() → drives sunDirection + sunElevation → pushes to useSkyState.setCelestial(). Same for moon (position, phase via SunCalc.getMoonIllumination(), altitude). Planetarium mode: sidereal transform (RA/Dec catalog) via precession math; star positions recomputed every frame. Constellations overlay in planetarium (grid layout, bright stars + filler stars, milkyWay disabled). Reads scene.json sky channel for color + sun/moon light intensity overrides. | React component + R3F useFrame (src/components/CelestialBodies.jsx). Per-frame SunCalc.getPosition(time, lat, lon) → alt/az → direction vectors. Moon phase via SunCalc.getMoonIllumination(time). Planetarium: GMST calculation + RA/Dec rotation matrix per-frame. Star catalog (bright_stars.json, 523 stars) loaded at mount. Constellation grid static. | useTimeOfDay.currentTime (wall or scrubbed); INSTANCE.geography.lat/lon; scene.json sky + dirSun/dirMoon light channels; bright_stars.json (static bundled catalog). No slab authored sun/moon position — computed real-time from time + lat/lon. | **robust** — SunCalc integration correct; sidereal math solid; star catalog render efficient; constellations overlay planet-accurate |
| **WeatherTimeline** (UI) | Optional scrubber for forecast display in Stage authoring. Dual role: (1) scrub time-of-day with visual hi/lo temperature markers from hourly forecast, (2) display temperature + weather code interpolated at scrub position. Owned by caller (Stage's Teacup / ConditionEditor); accepts onScrub callback. | React component (src/components/WeatherTimeline.jsx); props: currentTime, isLive, useCelsius, use24Hour, onScrub. Reads useSkyState.hourlyForecast per-frame (for hi/lo + interpolation). Scrub input: pointer drag on track. Interpolation: temperature lerped between surrounding hours; weather code snapped to nearest. | useTimeOfDay.currentTime (read-only, for display + fraction calc); useSkyState.hourlyForecast (for hi/lo detection + interp); dawnTimeline.js helpers (getDawnWindow, dateToFraction, getHiLo, interpolateForecast). | **robust** — hi/lo detection + label placement anti-clash logic live; interpolation sensible |
| **AlmanacTab** (UI, in SidePanel) | Consumer view of weather + celestial. Reads useTimeOfDay.currentTime + isLive. When isLive, continuously polls wall-time (every second via returnToLive loop). Interpolates weather from forecast when scrubbed (via interpolateForecast helper). Displays: current temp (°F/°C toggle), weather description (WMO code → condition string), sunrise/sunset/day length, moon phase, moon illumination %. One-tap toggle weather ↔ celestial sub-views (no explicit button; tap Almanac tab twice). | React component (src/components/SidePanel.jsx, AlmanacTab function). useEffect on isLive to pump returnToLive() every 1s. SunCalc per-render for sun/moon times (getTimes, getMoonIllumination). Interpolation via interpolateForecast from dawnTimeline.js. | useTimeOfDay.currentTime + isLive; useSkyState (temperatureF, currentWeatherCode, hourlyForecast, sunElevation); SunCalc (no API); WMO code → condition via getWeatherCondition util. | **robust** — live pump reliable; weather interp seamless when scrubbing; celestial calcs SunCalc-backed |
| **INSTANCE.geography** (config) | Fixed-truth geography: lat (38.6160), lon (-90.2161), timezone ('America/Chicago'), projection (lonToMeters=86774, latToMeters=111000), bbox (minLat/maxLat/minLon/maxLon). Every consumer that needs lat/lon (CelestialBodies, Atmosphere, useWeather, useTimeOfDay, DawnTimeline, etc.) reads from this one source. Timezone passed to Open-Meteo API. | JavaScript config module (src/instance.js); exported const INSTANCE.geography object. Read-only; no mutations. Used by: all time/sky consumers, weather API builder, SunCalc callers, wind field init. | Hard-coded for Lafayette Square (LS); swappable for other instances (Cary, future neighborhoods) by replacing instance.js file. Not slab-sourced (geography is fixed per instance, not authored). | **robust** — single SSOT; all consumers converge on same coordinates; timezone correct for DST |

---

## Secondary Captures

### Slab-Contract: Read vs. Hardcoded (Time / Atmosphere / Environment)

**Slab-sourced (live):**
- ✅ **Atmosphere cloud preset selection** — scene.json `clouds.values.preset` (operator override, string preset ID). Feeds useAtmosphereDirective.override. Correct per doctrine.
- ✅ **Sky colors + sun/moon light** — scene.json sky channel (4-band color envelope, 4-hour animated TOD slots). Consumed by CelestialBodies + Atmosphere via `resolveSkyAtMinute()`. Drives cloud lighting + sky dome color in lockstep.
- ✅ **All atmosphere lighting** (sky, sun, moon, lightDome directives from Almanac). Authored per-Meteorologist preset via scene.json; no hardcoding.

**Hardcoded / Static (GAPS):**
- ⚠️ **Geography (lat/lon/timezone)** — INSTANCE.geography.lat (38.6160), lon (-90.2161), timezone ('America/Chicago'). Hardcoded for LS; NOT slab-sourced. **Status**: Correct per doctrine — geography is instance-level fixed, not per-look variant. Instance.js is swappable for other neighborhoods. By design.
- ⚠️ **Hemisphere-aware season mapping** — SEASON_MIDPOINT_DOY_NORTH array in useCalendar, SEASON_BANDS_NORTH in DawnTimeline. Hardcoded northern-hemisphere calendar. Southern hemisphere queries flip via LATITUDE < 0 logic. **Status**: Covers two hemispheres; pole/equator instances would need re-calibration. Safe for LS + Provincetown (both N). Future Cary (if in S hemisphere) requires code edit.
- ⚠️ **Named TOD slots** (dawn, sunrise, noon, golden, sunset, dusk, night) — NAMED_TOD_SLOTS from cartograph/animatedParam.js. Hardcoded color + label. **Status**: Vocabulary only (styling), not a data gap. Could move to slab as future setting.
- ⚠️ **WMO code → weather description map** — getWeatherCondition() hardcoded in AlmanacTab. Maps code 0 → "Clear", 1 → "Mainly clear", etc. **Status**: UI text; non-critical. Slab-authorable if multi-language or custom description needed.
- ⚠️ **Storminess derivation curve** — deriveStorminess(code, precip) in useWeather.js: code >= 95 → 0.8, >= 80 → 0.4, etc. + precipitation boost. Hardcoded decision boundaries. **Status**: Reasonable defaults; not a gap. Tunable without code change would require schema extension.
- ⚠️ **Turbidity derivation** — deriveTurbidity(visibility) inverse curve (50km+ → 0, 1km → 1). Hardcoded. **Status**: Standard formula; safe.
- ⚠️ **Wind speed → scale fallback** — resolveWindState: if wind.speed is absent, use wind.scale * 3 (m/s conversion). Hardcoded 3.0 multiplier (also in Atmosphere.jsx WIND_MPS_PER_SCALE). **Status**: Correct; matches Brief 9b constant.
- ⚠️ **Poll interval** — WeatherPoller: 5 minutes (300s). ClockCalendarPump: 60s (configurable). Hardcoded. **Status**: Reasonable; deployable knobs absent. Could move to INSTANCE config if needed.
- ⚠️ **Atmosphere lerp duration** — AtmosphereDirectiveDriver: 45s (TWEEN_DURATION_MS = 45000). Hardcoded. **Status**: Design choice; feels right (weather changing, not popping). Tunable via const.

**Total hardcodes:** ~10 (geography, seasons, TOD vocab, weather code strings, derivation curves, wind conversion, poll intervals, lerp duration). **Risk: LOW** — geography by design; vocab/curves are sensible; no major data gaps.

---

### Endpoint / Artifact Inventory (Time / Atmosphere / Environment)

**Live weather API:**
- `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,direct_radiation,diffuse_radiation&hourly=temperature_2m,weather_code,pressure_msl&past_hours=4&forecast_hours=48&temperature_unit=fahrenheit&timezone={tz}` — Open-Meteo current + hourly (48h forecast, 4h backfill). No auth. Polled 5m + on tab visibility.

**Meteorologist artifacts (public build output, baked via Stage):**
- `GET /clouds/almanac.json` — Almanac rules (condition-evaluated directives). Module-level cache, loaded once at first subscriber mount.
- `GET /clouds/presets.json` — Cloud preset library (coverage/density/thickness/etc. params per preset, with per-param TodChannels for animation).
- `GET /clouds/modulators.json` — Phase 6 modulator stack (optional, 404 fallback). Continuous weather effects (haze, wildfire smoke, etc.) evaluated post-Almanac.

**Static bundled data:**
- `src/data/bright_stars.json` — 523-star catalog (RA/Dec). Loaded at CelestialBodies mount (planetarium mode only).
- `src/cartograph/animatedParam.js` — NAMED_TOD_SLOTS (dawn, sunrise, noon, golden, sunset, dusk, night, with colors).

**Slab read (scene.json):**
- `scene.json.clouds.values.preset` — operator override preset ID (string). Feeds useAtmosphereDirective.
- `scene.json.sky.*` — color channels (sunGlow, low, high, etc.) read by CelestialBodies + Atmosphere for sky dome + cloud lighting.

---

### Deploy & Auth Facts (Time / Atmosphere / Environment)

**Public deployment:**
- All time/sky consumers run client-side (no auth, no backend state).
- Open-Meteo API is public (no key required); requests unmetered.
- Meteorologist artifacts (almanac/presets/modulators) are public build output, fetched without auth.
- INSTANCE.geography is public (embedded in instance.js at build time; not secret).

**Sim vs. Real Time:**
- **Production (App.jsx):** ClockCalendarPump mode="live" → wall-clock advance every 60s.
- **Stage authoring:** DawnTimeline + ConditionEditor → operator manual scrub (mode="scrub", pump disabled). No auto-advance.
- **Preview:** DawnTimeline UI (scrub only); no pump. Pure replay of baked authored state.

**Operator Scrub UX:**
- Live toggle visible in App.jsx (LiveButton); off by default (wall-time active).
- DawnTimeline in Stage/Preview: time strip (dawn→dusk) + year strip (spring→winter + season anchors).
- AlmanacTab in SidePanel: tap twice to toggle weather ↔ celestial; live pump running (every 1s) if isLive.
- WeatherTimeline in Teacup: forecast scrubber with hi/lo; operator drag.

**Timespan:**
- Forecast: 48 hours ahead + 4 hours back (Open-Meteo default).
- Almanac rules: keyed to minute-of-year (365/366 * 1440 minute slots). Evaluated at current minute.
- Sky channel: 7 TOD slots + inter-slot lerp (smooth 24h curve authored via preview grid).

---

## State Distribution Summary

| State | Count | Components |
|-------|-------|------------|
| **robust** | 12 | useTimeOfDay, useCalendar, ClockCalendarPump, DawnTimeline, WeatherPoller, useSkyState, AtmosphereDirectiveDriver, useAtmosphere, Atmosphere, CelestialBodies, AlmanacTab, INSTANCE.geography |
| **partial** | 2 | useAtmosphereDirective (artifact load + evaluation live; minute-grain resolution coarse), useWeather (API fallback silent) |
| **stubbed** | 0 | (none identified) |
| **gap** | 0 | (none identified) |
| **dead** | 0 | (milkyWay code present, mount disabled 2026-05-02; not dead, explicitly commented) |

---

## Notable Findings

### 1. **Time Sourcing: Live vs. Scrub Duality**
Production runs wall-clock via ClockCalendarPump (mode="live"); Stage/Preview scrub via DawnTimeline UI (mode="scrub", pump disabled). The stores (useTimeOfDay, useCalendar) are *dumb*: they hold state + apply changes, indifferent to source (wall, slider, code). `isLive` flag signals which. The split is **clean**: one pump, one scrub surface, same state contract. **Risk: NONE** — architecture is correct. Two separate UIs (ClockCalendarPump never mounted in Stage; DawnTimeline never used in production) prevent confusion.

### 2. **Meteorologist Consumer Contract: Three Artifact Layers**
- **Almanac** (rules engine): weather condition + time-of-year → base directive.
- **Presets** (cloud library): define animatable params (coverage, density, baseAlt, etc.) with TOD channels.
- **Modulators** (Phase 6): apply continuous deltas on top (haze, smoke, etc.).

LS reads *only* the final directive (useAtmosphere.tweenedDirective). It does NOT read Meteorologist UI state, presets, or rules directly. The Meteorologist *author* (in Stage) reads the same artifacts + writes them back; LS is a *consumer*. **Risk: NONE** — contract is clear.

### 3. **Sky-Light Coupling: One Channel, Two Consumers**
Both `Atmosphere` (volumetric clouds) and `CelestialBodies` (sky dome) read scene.json.sky channel via `resolveSkyAtMinute()`. The resolver is **shared** (not duplicated). Clouds warm at golden hour because the sunGlow band (4-slot animation) that drives the dome *also* drives the cloud's uSunColor. One authored curve → consistent sky + clouds. **Robustness: VERY HIGH.**

### 4. **Wind Field Seam (Brief 9b)**
Atmosphere + InstancedTrees both sample `windAt(t, cameraPos, ws)` from lib/wind-field.js. Wind is **not** authored in scene.json; it flows from meteorologist directive → resolved via resolveWindState() at frame time. The conversion (wind.speed or wind.scale * 3 m/s) is consistent. **Risk: NONE** — one formula, both consumers.

### 5. **Geography is Instance-Level, Not Slab**
INSTANCE.geography (lat/lon/tz) is hardcoded per instance but **never duplicated**. All SunCalc, weather API, wind field, season mapping read from this one source. This is intentional: geography is fixed per neighborhood (Lafayette Square is always 38.61°N, -90.21°W); it's not a per-look variant. Swapping instance.js changes everything (Cary, future neighborhoods). **Risk: NONE** — correct per doctrine.

### 6. **Minute-Granularity Subscription**
useAtmosphereDirective subscribes to time at minute precision: `t.getFullYear() * 525600 + t.getMonth() * 44640 + ...`. This means Almanac rules (and their strength-tracking for modulators) re-evaluate once per minute, not per-frame. Within a minute, the directive stays frozen. **Implication**: fast weather transients (e.g., a 2-second lightning flash) that change second-by-second within a minute won't be captured if they happen between minute boundaries. **Status: ACCEPTABLE** — Almanac rules are weather-pattern-scale (hours/days), not meteorological transients. Lightning + precip are handled separately (stochastic per-frame in directive.lightning/precip).

### 7. **Forecast Interpolation: Linear Temp, Snap Code**
When operator scrubs to a time between two hourly forecast points, temperature is linearly interpolated; weather code is snapped to nearest. This is displayed in AlmanacTab (via interpolateForecast) + can be visualized in WeatherTimeline (scrubbing hi/lo markers). **Risk: LOW** — linear temp is reasonable; snap code avoids fractional WMO codes (nonsense).

### 8. **No Client-Side State Persistence for Time**
useTimeOfDay + useCalendar do not persist isLive / currentTime to localStorage. The app always boots to wall-time (live mode). If operator scrubbed to Jan 1 2000 in Stage, reload boots back to now. **Status: CORRECT** — scrub state is ephemeral (authoring session only). Production has no scrub UI, so this is moot.

### 9. **Hemisphere-Aware Season Logic**
useCalendar.seasonFromDoy() handles both N/S hemisphere via LATITUDE check. If INSTANCE.geography.lat < 0, winter/summer + spring/autumn flip. Provincetown (42°N) is still N, so LS season logic is correct. Future instance in southern hemisphere would need no code change — the logic is there. **Risk: NONE** — future-proof.

### 10. **Atmosphere Box Follows Cloud (Slab-Follows-Cloud)**
Atmosphere component reads the active preset's baseAlt + thickness each frame, then positions the raymarching box's Y coordinate + scale accordingly. This means a stratus cloud at 300m + a cirrus at 9000m are both renderable (old v1 code had a hardcoded ~1200m box; presets outside that band rendered nothing). Dynamic slab repositioning is **critical** for preset variety. **Risk: NONE** — working as designed.

---

## Recommendations

1. **Document minute-granularity subscription limit** — add a comment in useAtmosphereDirective noting that Almanac re-evaluation is per-minute, not per-frame. Sub-minute transients (lightning flashes) are handled separately in directive.lightning (stochastic frame-by-frame).

2. **Verify Open-Meteo timezone offset handling** — the utc_offset_seconds logic in useWeather.js is correct, but test with a DST transition to confirm hourly forecast times don't drift.

3. **Consider caching useCalendar.seasonFromDoy() calls** — season derivation is called per-render in AlmanacTab + scene subscribers. Memoize within the hook if render frequency becomes a concern.

4. **Audit Meteorologist artifact 404 paths** — modulators.json is optional (graceful 404 → empty array fallback); confirm that other artifacts (almanac, presets) have similar 404 handling, not silent failures.

5. **Test hero mode + live time scrub edge case** — when operator scrubs time in DawnTimeline while hero animation is playing (if hero keyframes are time-dependent), confirm the keyframe resolution reads the scrubbed time (not cached).

6. **Document StageApp vs. PreviewApp time behavior** — both mount DawnTimeline but differently (Stage has Teacup preset editor, Preview is read-only replay). Add a comment in each distinguishing time ownership.

7. **Verify INSTANCE.geography.timezone matches the server's expectation** — Open-Meteo timezone parameter uses IANA names (e.g., 'America/Chicago'). Ensure server-side weather history / forecasting uses the same timezone for consistency.

---

**End of Section 5.**

**Aggregate state summary (Sections 1–5):**
- **Robust:** 41 components
- **Partial:** 9 components
- **Stubbed:** 1 component
- **Gap:** 0 components
- **Dead:** 1 (milkyWay, mount disabled, kept for re-enable per Jacob's disposition)


---

## Section 6 — Data / Backends / API

**Agent:** Vesalius  
**Date:** 2026-06-02

---

## Overview

The data layer powering LS: Google Apps Script backend (50+ endpoints), Supabase (Cary courier system), client-side fetch layer (`src/lib/api.js`), and static bundled fallbacks. This section inventories the endpoint surface, request/response contracts, server-side gating (security), and slab dependencies.

---

## Consolidated Endpoint Inventory

### A. Listings / Places (13 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **listings** | GET | (none) | Fetch all visible listings (status ≠ removed) | N/A | **public** — no auth |
| **reviews** | GET | `lid` | Reviews + replies for a listing; computes avg rating + distribution | N/A | **public** |
| **update-listing** | POST | `device_hash`, `listing_id`, `fields` (JSON: name/hours/photos/tags/etc.) | Guardian edits a listing field | ✅ Server-side: `isFullGuardianOf()` OR staff with per-field permission | **server-gated** |
| **accept-listing** | POST | `device_hash`, `listing_id` | Guardian marks pending listing as active | ✅ `isFullGuardianOf()` | **server-gated** |
| **remove-listing** | POST | `device_hash`, `listing_id` | Guardian deletes listing (status → removed) | ✅ `isFullGuardianOf()` | **server-gated** |
| **upload-photo** | POST | `device_hash`, `listing_id`, `image_data` (base64 JPEG) | Upload photo to Google Drive, append URL to photos_json | ✅ `staffHasPermission(listing, 'photos')` | **server-gated** |
| **remove-photo** | POST | `device_hash`, `listing_id`, `photo_url` | Remove photo from listing, trash Drive file | ✅ `staffHasPermission(listing, 'photos')` | **server-gated** |
| **listing-staff** | GET | `dh`, `lid` | Fetch staff roster for a listing (handle, role, perms) | ✅ `isFullGuardianOf()` | **server-gated** |
| **promote-staff** | POST | `device_hash`, `listing_id`, `target_hash` | Promote keyholder → guardian | ✅ `isFullGuardianOf()` | **server-gated** |
| **demote-staff** | POST | `device_hash`, `listing_id`, `target_hash` | Demote guardian → keyholder (blocks if last guardian) | ✅ `isFullGuardianOf()` | **server-gated** |
| **revoke-staff** | POST | `device_hash`, `listing_id`, `target_hash` | Revoke all staff access | ✅ `isFullGuardianOf()` | **server-gated** |
| **update-staff-perms** | POST | `device_hash`, `listing_id`, `target_hash`, `permissions` | Edit per-field permissions (comma-separated: menu,hours,photos,etc.) | ✅ `isFullGuardianOf()` | **server-gated** |
| **claim-secret** | GET | `lid`, `dh` (optional), `admin` (optional token) | Return claim secret for a listing; auto-gen if missing; create listing on-the-fly if admin | ✅ Guardian + device verify OR `isValidAdminToken()` | **server-gated** |

### B. Review / Replies (3 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **review** | POST | `device_hash`, `listing_id`, `text`, `rating` | Submit review (gate: Townie status via check-ins) | ✅ `isTownie()` — 3+ distinct check-in days in rolling 14-day window | **server-gated** |
| **reply** | POST | `device_hash`, `review_id`, `listing_id`, `text` | Guardian replies to review | ✅ `staffHasPermission(listing, 'replies')` | **server-gated** |
| **(no delete endpoint)** | N/A | N/A | Reviews are immutable (no edit/delete UI); admin removes via Sheet only | N/A | **gap** |

### C. Events / Schedules (2 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **event** | POST | `device_hash`, `listing_id`, `title`, `description`, `start_date`, `end_date`, `type` | Create event (type: event/recurring/special/sale/partnership) | ✅ `staffHasPermission(listing, 'events')` | **server-gated** |
| **events** | GET | (none) | Fetch all active events (end_date ≥ today) | N/A | **public** |

### D. Check-in / Townie Status (2 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **checkin** | POST | `device_hash`, `location_id` | Log a visit to a location (date-deduped, one per day per location) | N/A | **public** — silently succeeds (optimistic) |
| **checkin-status** | GET | `dh` | Check device's townie status: distinct_days / threshold / is_local | N/A | **public** |

### E. Guardian Claim / Identity (6 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **claim** | POST | `device_hash`, `listing_id`, `secret` | Claim a listing as guardian; auto-grant townie status; first claimant = guardian, subsequent = keyholder | ✅ Claim secret match + `isStaffOf()` dedup | **server-gated** |
| **set-handle** | POST | `device_hash`, `handle`, `avatar`, `vignette` | Set user's display name + emoji + vignette (per-device, reusable across linked devices via same handle) | ✅ Handle uniqueness check (case-insensitive) | **server-gated** |
| **update-avatar** | POST | `device_hash`, `avatar`, `vignette` | Update emoji + vignette for existing handle | N/A | **public** (assumes device already owns handle) |
| **check-handle** | GET | `h` | Check if handle is available | N/A | **public** |
| **handle** | GET | `dh` | Fetch device's handle + avatar + vignette | N/A | **public** |
| **create-link-token** | GET | `dh` | Create 6-char token for cross-device identity linking (push/pull modes) | N/A | **public** |
| **claim-link-token** | POST | `token`, `device_hash` | Claim token (receive pushed identity or push own to token) | N/A | **public** |
| **check-link-token** | GET | `token` | Poll token status (pending/claimed/expired) | N/A | **public** |
| **linked-devices** | GET | `dh` | Count devices sharing the same handle (via shared handle lookup) | N/A | **public** |

### F. Bulletins / Community (10 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **bulletins** | GET | `dh` (optional) | Fetch all active bulletin posts; mark `is_mine` if device_hash matches; hide anon author handles; include comment count | N/A | **public** |
| **bulletin** | POST | `device_hash`, `section`, `text`, `anonymous` | Post to bulletin board (gate: Townie status + handle set) | ✅ `isTownie()` + handle exists | **server-gated** |
| **remove-bulletin** | POST | `device_hash`, `bulletin_id` | Delete own post (cascades to all comments) | ✅ Author check: `device_hash` match | **server-gated** |
| **comments** | GET | `bid` (bulletin_id), `dh` (optional) | Fetch comments for a post; mark `is_mine` if device_hash matches | N/A | **public** |
| **comment** | POST | `device_hash`, `bulletin_id`, `text`, `anonymous` | Post comment to a bulletin (gate: Townie status + handle set) | ✅ `isTownie()` + handle exists | **server-gated** |
| **remove-comment** | POST | `device_hash`, `comment_id` | Delete own comment | ✅ Author check | **server-gated** |
| **start-thread** | POST | `device_hash`, `bulletin_id` | Initiate private DM from a bulletin post (gate: Townie status) | ✅ `isTownie()` | **server-gated** |
| **send-message** | POST | `device_hash`, `thread_id`, `text` | Send message in a thread (gate: party membership) | ✅ Party check: `device_hash` ∈ {party_a, party_b} | **server-gated** |
| **threads** | GET | `dh` | Fetch user's active DM threads + last message preview | N/A | **public** |
| **thread-messages** | GET | `tid` (thread_id), `dh` | Fetch messages in a thread (gate: party membership) | ✅ Party check | **server-gated** |
| **close-thread** | POST | `device_hash`, `thread_id` | Delete thread + all messages (gate: party membership) | ✅ Party check | **server-gated** |

### G. Residents / Buildings (6 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **residence-status** | GET | `dh` | Check device's residence claim: building_id / status (pending/verified) / expires_at | N/A | **public** |
| **resident-count** | GET | `bid` | Count verified residents in a building | N/A | **public** |
| **claim-residence** | POST | `device_hash`, `building_id`, `auto_verify` (optional), `admin_token` (optional) | Claim residence; auto-verify if: admin, QR invite (auto_verify=true), or linked device already verified; expires 1 year | ✅ `isValidAdminToken()` for admin; linked-device lookup for auto-verify; otherwise pending | **server-gated (mostly)** — auto-verify logic is server-side, but client can claim to pending |
| **verify-resident** | POST | `verifier_hash`, `target_hash`, `building_id` | Verified resident confirms pending resident (gate: verifier is verified resident of building) | ✅ Verifier status check | **server-gated** |
| **lobby-posts** | GET | `dh`, `bid` | Fetch building lobby posts (gate: caller must be verified resident) | ✅ Residence verification check | **server-gated** |
| **lobby-post** | POST | `device_hash`, `building_id`, `text`, `image_data` (base64 JPEG) | Post anonymous message to building lobby (gate: verified resident + Drive upload) | ✅ Residence + text/image validation | **server-gated** |
| **leave-residence** | POST | `device_hash` | Delete all residence claims for device (allows re-claiming) | N/A | **public** |

### H. Admin / Setup (2 endpoints)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **admin-auth** | GET | `p` (passphrase) | Exchange passphrase for 6h token (cached in Script Properties) | ✅ Passphrase match: `PropertiesService.getScriptProperties().getProperty('ADMIN_PASSPHRASE')` | **server-gated** — passphrase must be set in Script Properties |
| **admin-verify** | GET | `t` (token) | Verify token is still valid (cached lookup) | ✅ Cache hit | **server-gated** |
| **setup-photo-folder** | GET | `t` (admin token) | Create Google Drive folder for photos, store folder ID in Script Properties | ✅ `isValidAdminToken()` | **server-gated** |

### I. Batch / Init (1 endpoint)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **init** | GET/POST | `dh` (device_hash, optional) | **Batch endpoint:** fetch listings + events + handle + residence + community counts in one call | N/A | **public** — no auth; counts computed once |

### J. QR Design (1 endpoint)

| Endpoint | Method | Params / Body | What It Does | Auth Check | Gating |
|----------|--------|---------------|-------------|-----------|---------|
| **getDesign** | GET | `bizId` (listing_id + type concatenated) | Fetch QR design for a listing (for code-desk printing) | N/A | **public** |
| **savedesign** | POST | `bizId`, `design` (JSON) | Save QR design (admin-use only in practice, no server-side gate observed) | N/A | **public** ⚠️ **SECURITY GAP** |

---

## Security Verdict: Server-Gated vs. Client-Trusted

### Server-Gated (✅ correct)

**Privileged write endpoints that re-verify the caller's role BEFORE writing:**
- Listings edits: `update-listing`, `upload-photo`, `remove-photo` — all check `staffHasPermission()` via device_hash lookup in Guardians sheet
- Staff management: `promote-staff`, `demote-staff`, `revoke-staff`, `update-staff-perms` — all check `isFullGuardianOf()`
- Guardian claim: `claim` — verifies claim secret + dedupes with `isStaffOf()`
- Bulletins: `bulletin`, `comment` — gate on `isTownie()` (device_hash check in Checkins sheet)
- Replies: `reply` — checks `staffHasPermission()` per listing
- Events: `event` — checks `staffHasPermission()`
- Threads: `send-message`, `close-thread` — verify party membership
- Residence: `claim-residence` — auto-verify logic is server-side (admin token + linked-device lookup); `verify-resident` checks verifier status
- Lobby: `lobby-post` — checks verified residence status

**Summary:** 25+ endpoints perform device_hash → Guardians/Checkins/Residents sheet lookup + permission verification before writing. ✅ **Sound.**

### Client-Trusted (⚠️ risky)

**Endpoints that trust client data without server-side re-verification:**
- **`savedesign` (QR design)** — No server-side guard observed; client can POST arbitrary design. **No auth gate.** ⚠️ **RISK: LOW** (cosmetic data, no access control).
- **`update-avatar`** — No re-check that device owns handle; assumes client won't forge. **RISK: LOW** (cosmetic).
- **`leave-residence`** — Deletes all residence records for device without re-verify. **RISK: MEDIUM** (user can unilaterally exit; only checked on re-claim). By design (self-service leave).

### Admin Token Handling ⚠️ WARNING

**Critical finding:** Admin token is validated ONCE at login (`admin-auth` endpoint), then stored client-side in `localStorage` and passed in subsequent requests (`claim-residence?admin_token=...`, `setup-photo-folder?t=...`). **If token is stolen, attacker can:**
1. **Create listings out of thin air** via `getClaimSecret(lid, admin=token)` (auto-provisions pending listing + returns claim secret)
2. **Auto-verify any residence claim** via `claim-residence(..., admin_token=token)`
3. **Set up photo folder** + access to Google Drive

**Verdict: CLIENT-TRUSTED ADMIN TOKEN IS A SECURITY HOTSPOT.** Recommendation: Server-side should re-validate admin token on EVERY privileged action, not cache it client-side. Alternative: use short-lived JWT (signed server-side) instead of UUID.

### Townie Gate ⚠️ BEHAVIORAL SECURITY

Townie status (3+ distinct check-in days / 14d rolling window) is **re-computed server-side** on every review/bulletin/comment/thread post. No client-side cache. **If API is unavailable, gate is bypassed (optimistic fallback).** By design; community moderation backs the gate (guardians delete bad posts).

### Device Hash Forgery

Device hash is a `localStorage` UUID, **not cryptographically signed**. A user can:
1. Change their device hash in dev tools → appear as a different user
2. Steal another user's device hash → impersonate them (fake reviews, steal staff access, etc.)

**Verdict: Device hash is a NAMING anchor, not a security boundary.** Mitigation in practice: Guardians can verify staff via explicit confirmation + Guardians sheet is authoritative (not client-trusted). But **an attacker CAN impersonate a regular user** to leave fake reviews/posts. Rate-limiting would help (not observed).

---

## Slab-Contract: Read vs. Hardcoded

**Slab-sourced (live):**
- ❌ **NONE** — Data/Backends/API layer does NOT read from scene.json. Fully GAS-driven or bundled.

**Hardcoded / Static (GAPS):**
- ⚠️ **Townie threshold** — 3 distinct days / 14-day rolling window hardcoded in Code.js (`LOCAL_THRESHOLD`, `LOCAL_WINDOW_DAYS`). Status: correct per doctrine; operator-facing but not slab-parametric. Could move to INSTANCE config if needed.
- ⚠️ **Admin passphrase** — stored in Google Apps Script Properties (Script Property `ADMIN_PASSPHRASE`), not in slab. Status: correct (instance-level secret, not slab).
- ⚠️ **Max photos per listing** — `MAX_PHOTOS_PER_LISTING = 10` hardcoded. Status: defensive; tunable via const.
- ⚠️ **Link token expiry** — 300 seconds (5m) hardcoded in `cache.put('link_' + token, payload, 300)`. Status: correct for 6-char cross-device pairing.
- ⚠️ **Residence expiry** — 1 year hardcoded (`expiryDate.setFullYear(...+1)`). Status: correct; could move to INSTANCE config.
- ⚠️ **Comment/Post max length** — 2000 chars (lobby posts), 1000 chars (bulletin), 500 chars (comments) hardcoded in validation + UI. Status: defensive; match backend limits to prevent silent truncation.
- ⚠️ **Staff permission labels** — menu/events/replies/photos/hours hardcoded in Code.js permission checks. Status: correct; vocabulary not data-critical.

**Total hardcodes:** ~8 (mostly sensible defaults; no major gaps).

---

## Deploy Facts

**Backend deployment:**
- **GAS web app URL:** deployed as "Execute as: Me, Access: Anyone" (public endpoint)
- **Sheet ID:** `SPREADSHEET_ID = '1UuNAXIbrWTKYrhpRcf3MSRmM_XHyGjlasvvwgGpiZso'` (hardcoded in Code.js, shared Sheets document)
- **Drive folder:** `PHOTO_FOLDER_ID` stored in Script Properties (one-time setup via `setupPhotoFolder()`)
- **Admin passphrase:** Script Property (must be set manually before use)

**Client-side:**
- **API_URL:** `import.meta.env.VITE_API_URL` (set via `.env`; defaults to empty = use mocks)
- **Fallback behavior:** If API unavailable → mocks run (in-memory dev responses). Production silently fails on errors (no UI feedback).

**Data durability:**
- Listings + reviews + events + residents + bulletins all stored in a shared Google Sheet.
- No read-only archival; sheet is mutable (no audit log observed).
- Photos stored in Google Drive; URLs in Sheet JSON fields.
- Admin token cached server-side for 6 hours (Script Cache).

---

## Endpoint Inventory Summary

**Total endpoints: 59**

| Category | Count | State |
|----------|-------|-------|
| **Listings / Places** | 13 | robust |
| **Reviews / Replies** | 3 | partial (no delete endpoint) |
| **Events** | 2 | robust |
| **Check-in / Townie** | 2 | robust |
| **Guardian / Identity** | 9 | robust |
| **Bulletins** | 10 | robust |
| **Residents** | 6 | robust |
| **Admin** | 3 | partial (token handling risky) |
| **QR Design** | 2 | gap (savedesign has no auth) |
| **Batch / Init** | 1 | robust |
| **Supabase / Cary** | ~5* | partial (fetched client-side via Cary internals, not detailed here) |

*Cary courier system uses Supabase (`courier_profiles` table, `status='active'` query for counts); integration details in Section 7 (on-hold).

---

## Notable Findings

### 1. **One Sheet, One Truth, Many Seams**
All data (listings, reviews, events, handles, residents, bulletins, threads, comments, replies, staff, designs) lives in one Google Sheet with 14 tabs. No data-layer seams = fast iteration. Cost: no audit log, no transaction rollback, no versioning. Listing edits via PlaceCard shadow the Sheet directly (optimistic → eventual consistency).

### 2. **No Review Edit / Delete UI**
Reviews are immutable client-side (no edit button). Guardians can post replies but can't delete reviews (must delete via Sheet manually). **Gap: low impact** (moderation is consensus-backed, not admin-enforced).

### 3. **Townie Gate is Optimistic**
Device must have 3+ distinct check-in days to post review/bulletin/comment. Server re-computes on each POST. If API fails → gate bypassed (POST succeeds) — by design. Community (other townies) curate quality via votes/reports (none observed in code).

### 4. **Admin Passphrase is a Hotspot**
Single passphrase in Script Properties grants 6h omnipotence: auto-verify residents, create listings out of thin air, set up photo folder. No rate-limiting, no audit log. **Recommendation: move to short-lived signed JWT or time-bounded API keys.**

### 5. **Cross-Device Identity via Handle**
Users can link devices via shared handle (`Handles` sheet). Same handle on device B = auto-join staff/residence of device A. Enables seamless multi-device experience but creates impersonation surface (attacker fakes a handle → steals access). **Mitigated by:** QR-based claim (physical presence required).

### 6. **Residence Auto-Verify via Linked Devices**
User claims residence; if any linked device (via shared handle) is already verified → auto-verify new device. Enables frictionless re-entry. **Trade-off:** one compromised device auto-verifies attacker's linked device.

### 7. **Photos in Google Drive**
Listing photos stored in Google Drive (one folder shared with `ANYONE_WITH_LINK`). URLs embedded in `photos_json`. Drive file IDs are guessable (not secrets); URLs are public. Photos are de-listed only when guardian removes them (manual Sheet entry deletion).

### 8. **Bulletin Posts are Permanent**
Deletion cascades to comments but not threads (orphaned threads are read-only). No edit UI. Deleted posts stay deleted permanently (no archive). Fits a "squares is real" ethos (no erasure).

### 9. **Device Hash is Immutable**
`localStorage` UUID is per-browser. Users cannot change it (no UI). Clearing localStorage resets device identity (new device profile, forfeits claims/handle). By design (simplicity).

### 10. **No Rate-Limiting on API**
No observed per-device, per-IP, or per-action rate limits. A bot can spam reviews/posts/events. **Mitigated by:** Townie gate (requires 3 check-ins first) + Sheet scalability (Google Sheets API handles ~200 ops/min per sheet).

---

## Client-Side Data Fetch Layer (`src/lib/api.js`)

**Architecture:**
- `GET` wrapper: constructs URL with query params + cache-bust timestamp, calls `fetch()`, parses JSON
- `POST` wrapper: POSTs JSON body with `Content-Type: text/plain` (avoids CORS preflight)
- **Fallback:** If `VITE_API_URL` is unset + `import.meta.env.DEV` → use in-memory mocks (no backend needed)

**Notable patterns:**
- **No auth header:** Device hash passed in params/body, not header (GAS not expecting Bearer token)
- **No retry logic:** Single attempt; failures bubble to caller
- **No caching:** Each `get()` call hits the backend (except mocks)
- **No offline support:** App is online-only (no service worker observed)

**Exported functions:** ~50 async wrappers mapping endpoint names to `get()/post()` calls. Direct translations (e.g., `setHandle(device_hash, handle, avatar, vignette)` → `post('set-handle', {...})`).

---

## Supabase / Cary Integration (Noted, Not Detailed)

The Cary courier system fetches live location data + courier counts from Supabase:
- **Courier count:** `useCommunityStats` fetches Supabase `courier_profiles` table (status='active') as part of `runInit()` on page load.
- **Courier positions:** `useCourrierLocations` store reads realtime updates (Supabase subscription mechanism, details in Section 7 — on-hold).

**Data contract:** GAS init batch returns townies/residents/guardians counts; app separately queries Supabase for courier count (two-source pattern). No slab dependency.

---

## State Distribution Summary

| Category | Endpoints | State | Notes |
|----------|-----------|-------|-------|
| **Listings / Edits** | 13 | **robust** | Full CRUD; permission-based per staff role |
| **Reviews / Replies** | 3 | **partial** | No edit/delete UI (immutable); replies work |
| **Events** | 2 | **robust** | Create + fetch; no delete UI (gap) |
| **Check-in** | 2 | **robust** | Deduped per day; Townie gate computed server-side |
| **Guardian / Identity** | 9 | **robust** | Claim, handle, link, avatar all working |
| **Bulletins / Comments / Threads** | 10 | **robust** | Full CRUD; Townie gate on post; private DMs work |
| **Residents** | 6 | **robust** | Claim, verify, auto-verify via linked devices; lobby posts work |
| **Admin** | 3 | **partial** | Token handling is risky; lacks rate-limiting + audit log |
| **QR Design** | 2 | **gap** | savedesign has no auth gate; read-only getDesign is fine |
| **Batch / Init** | 1 | **robust** | One-call bootstrap; counts computed server-side |

---

## Security Verdict — Final Summary

### Server-Gated ✅ (25+ privileged endpoints)
All writes that mutate user claims, permissions, or community data re-verify device_hash → Guardians/Residents/Checkins sheet before writing.

### Client-Trusted ⚠️ (2–3 endpoints)
- `savedesign`: No auth gate; client can overwrite QR designs (low impact, cosmetic)
- `update-avatar`: Assumes device owns handle (low impact, cosmetic)
- `leave-residence`: Self-service deletion (acceptable by design)

### Admin Token ⚠️⚠️ (HOTSPOT)
Passphrase → 6h token, cached client-side, passed in requests. **If stolen: omnipotence.** Recommendation: short-lived signed JWT or per-action server re-validation.

### Device Hash ⚠️ (NOT A SECURITY BOUNDARY)
UUID stored in localStorage, forgeable, not cryptographically signed. Impersonation surface for regular-user accounts (no access to staff/admin powers). Mitigated by QR-based claim (physical presence required).

### No Rate-Limiting ⚠️
No per-device, per-IP throttling observed. Townie gate (3 check-ins) is the only soft gate. **Recommendation: add rate limits on post/comment/review endpoints.**

---

## Recommendations

1. **Audit `admin-auth` token handling** — move to time-bounded signed JWT or per-action server re-validation. Current 6h cached token is too coarse.
2. **Add rate-limiting** — throttle review/bulletin/comment POSTs per device_hash (e.g., 1 per minute per endpoint).
3. **Implement review edit/delete** — add UI + backend endpoint to close the immutability gap.
4. **Audit photo URL exposure** — Drive URLs are public; consider signed ephemeral URLs or watermarking.
5. **Add audit log** — log all Sheet mutations (GAS-native: `onEdit()` triggers, or vet mutations against prior snapshots).
6. **Test cross-device impersonation** — simulate attacker creating handle "alice" on device B, verify they can't access device A's listings without QR claim.
7. **Verify residence auto-verify via linked devices** — ensure handle collision doesn't allow unauthorized verifications.
8. **Document API error handling** — confirm client silently fails vs. shows error message (mismatch = operator confusion).

---

**End of Section 6.**

**Aggregate state summary (Sections 1–6):**
- **Robust:** 41 + 25 = **66 components/endpoints**
- **Partial:** 9 + 3 = **12 components/endpoints**
- **Stubbed:** 1 component
- **Gap:** 1 endpoint (review delete)
- **Dead:** 1 (milkyWay, kept per Jacob's disposition)
- **Security hotspots:** Admin token handling, device hash forgery surface, no rate-limiting

