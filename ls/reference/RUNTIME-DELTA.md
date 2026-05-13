# LS — Runtime Delta (main → `cartograph-looks-pass-ab`)

What changes for the live consumer app when this branch lands on `main`. The canonical reference for Phase B's two plans ([`project_ls_basemap_swap`](../BACKLOG.md#phase-b--plan) and [`project_pre_public_cleanout_security_audit`](../BACKLOG.md#phase-b--plan)).

Last verified: 2026-05-12 against `cartograph-looks-pass-ab @ b39834b` vs. `origin/main @ 20866ef` (the `v1-pre-cartograph-merge` rollback floor). 189 commits ahead, ~267 files changed.

> **What this doc is.** A three-part diff catalog: (1) the architecture swap inside the R3F mount tree, (2) what ships to production that didn't, (3) what consumer behavior shifts or breaks. **What this doc isn't.** A plan. No L1.x items, no migration sequencing, no code. Verdicts on §2 entries (`keep / strip / gate / parametrize`) are decision points feeding Phase B — not decisions taken.
>
> **Cross-links over duplication.** Producer-side spec at [`../../SLAB-CONTRACT.md`](../../SLAB-CONTRACT.md); the consumer's full mount tree at [`../ARCHITECTURE.md §1`](../ARCHITECTURE.md); current data/API inventory at [`INVENTORY-DATA.md`](INVENTORY-DATA.md) / [`INVENTORY-API.md`](INVENTORY-API.md). This doc points; it doesn't repeat.

---

## 1. Architecture diffs — what main renders today vs. what the branch renders

### 1.1. The mount tree, side by side

The whole runtime architecture changes. Main is procedural-from-source-data; the branch is slab-consuming with a thinner live overlay. Both pass through `src/components/Scene.jsx` — diff that file and you have the swap.

| Slot in `Scene.jsx` | Main (`20866ef`) | Branch (`b39834b`) | Same thing, different impl? |
|---|---|---|---|
| Ground surface | `<VectorStreets svgPortal={…} />` (CSS3D SVG portal **behind** transparent WebGL canvas) + `<StreetRibbons />` (in-canvas ribbon mesh) | `<BakedGround lookId="lafayette-square" />` (single merged mesh from `public/baked/<look>/ground.{json,bin}` + `ground.lightmap.png` + `scene.json`) | ❌ **Different thing.** Procedural-from-`ribbons.json` vs. slab-baked. The CSS3D portal layer is **gone** — `svgPortalEl` state and the `<div ref={setSvgPortalEl}>` wrapper deleted from `Scene.jsx`; the Canvas is no longer transparent over an SVG ground. |
| Lamps (desktop) | `<StreetLights />` (live, reads `src/data/street_lamps.json`) | `<BakedLamps />` (reads `public/baked/<look>/lamps.json` + `scene.json` lampGlow) | ✅ Different impl, same role. **But** `StreetLights.jsx` still exists on-branch (+232 lines) and is still mounted in **`<DeferredStreetLights>`** for mobile-fallback — no, actually re-check: mobile path was rewired to `<BakedLamps />` (see `Scene.jsx:893`). `StreetLights.jsx` itself is **no longer imported** by `Scene.jsx` on the branch. Live `street_lamps.json` is still read by `src/components/lampLightmap.js` for the shader-glow `DataTexture` — see [INVENTORY-DATA §B](INVENTORY-DATA.md#b-bundled-json-live-imports-from-srcdata). |
| Park | `<LafayettePark />` (heavy: water meshes, path meshes, banks, island, fence, grass, all per-vertex `patchTerrain`) | `<LafayettePark />` (much lighter: water + paths now in ground bake; component is **rigid-lifted** by `terrainExag` instead of per-vertex shader patching) | ⚠ Same name, mostly different. **-870 lines.** Still mounts live water/path/bank/island/fence/grass — park bake landed but live mounts not yet retired. See §3.2 carry-over. |
| Trees | None — production didn't mount `<InstancedTrees>` on main | `<InstancedTrees />` (via `LafayetteScene`, reads `public/baked/default.json` + GLB variants from `public/baked/<look>/trees/` + tree atlas) | ❌ **New mount.** This is net-new visual content on the branch. |
| Buildings | `<LafayetteScene>` reads live `src/data/buildings.json`, per-id `<Building>` mesh, per-building neon, per-id click handlers | Same code path — live `buildings.json`, per-id `<Building>`, NeonBands, clicks. **Plus** a Look-palette tint layer (`useCartographStore.buildingPalette`) + Surfaces-panel live wires for `materialPhysics` / `materialColors`. The merged-mesh `BakedBuildings` exists in Preview but is **not mounted in production.** | ✅ Same role; materials now palette-driven and live-tunable from the cartograph store. |
| Terrain | `<Terrain />` (43 lines diff; +/- mostly elevation helper consolidation into `src/lib/terrainCommon.js`) | `<Terrain />` | ✅ Behaviorally same; refactored. |
| Sky / TOD / weather | `CelestialBodies`, `CloudDome`, `WeatherPoller`, `useTimeOfDay`, `useSkyState`, all live | Same components, same hooks. `PlanetariumOverlay` gained one line (`fog: false` on constellation material). `CloudDome` still **procedural** — `public/clouds/{presets,almanac}.json` published but no consumer. | ✅ Same. See §3.4 carry-over (clouds publish-loop is half-wired). |
| Arch | `<GatewayArch />` (procedural catenary, gated by `!IS_GROUND && (!IS_MOBILE || viewMode === 'hero')`) | Same. | ✅ Same. |
| Post-FX | EffectComposer chain (Bloom + N8AO desktop + DOF + FilmGrade + FilmGrain) | Same chain. | ✅ Same. |

**Net component change in `src/components/`:**

| Added (branch) | Removed (branch) |
|---|---|
| `BakedGround.jsx` (314) | `VectorStreets.jsx` (-447) |
| `BakedLamps.jsx` (51) | `StreetRibbons.jsx` (-1939) |
| `InstancedTrees.jsx` (353) | `FacadeElements.jsx` (-363) |
| `NeonBands.jsx` (239) | `FacadeBillboards.jsx` (-195) |
| `DawnTimeline.jsx` (115) | `GroundExport.jsx` (-259) |
| `SpriteClouds.jsx` (159) | |
| `treeAtlasMaterial.js` (218) | |

Plus `src/lib/` additions: `buildBlockGeometryV2.js` (1917), `buildPathRibbons.js`, `mergeLiveRibbons.js`, `ribbonsGeometry.js`, `foundationGeometry.js`, `terrainCommon.js`, `useSurfaceMaterial.js`, `dawnTimeline.js` (edit). Most of these are used by the bake CLIs **and** the runtime; the runtime side only imports `foundationGeometry` + `terrainCommon` directly today.

### 1.2. Inputs each side reads

For the consumer half only (cartograph's own inputs are out of scope here — see [`../../cartograph/ARCHITECTURE.md`](../../cartograph/ARCHITECTURE.md)).

| Path | Main reads | Branch reads |
|---|---|---|
| `public/cartograph-ground.svg` + `public/lafayette-square.svg` | `VectorStreets` (CSS3D portal) + various | `LafayettePark` still reads `lafayette-square.svg`; `cartograph-ground.svg` is now an authoring output, no runtime consumer |
| `public/baked/lafayette-square/*` | ❌ none (slab doesn't exist on main) | `BakedGround`, `BakedLamps`, `LafayettePark` (scene.json only) |
| `public/baked/default.json` + `public/baked/<look>/trees/` | ❌ | `InstancedTrees` |
| `src/data/ribbons.json` | `StreetRibbons` (procedural ribbon mesh build) | No runtime consumer; **still bundled** (930 lines changed on branch). Read only by cartograph + bake CLIs. |
| `src/data/buildings.json` (lazy via `buildings.js`) | `LafayetteScene` per-id | Same — load-bearing for clicks + neon + place state |
| `src/data/street_lamps.json` | `StreetLights` + `lampLightmap.js` | `lampLightmap.js` only (production switched to `BakedLamps` for the lamp posts; shader glow still live) |
| `src/data/park_{water,paths}.json` | `LafayettePark` (heavy meshes) | `LafayettePark` (still mounts them live; park bake landed in `ground.json` but live mounts kept) |
| `useCartographStore` (in `src/cartograph/stores/`) | ❌ no production consumer | **Production runtime** reads `activeLookId`, `bakeLastMs`, `materialPhysics`, `materialColors`, `layerColors`, `buildingPalette`. See §2.2 (the seam). |

### 1.3. Behavioral assumption shifts (architecture-side only — user-facing in §3)

- **Coordinate frame is compass world meters everywhere.** Main's `VectorStreets` used a CSS3D SVG portal whose orientation lived in CSS transforms; branch slab is pure XZ-world-meters per [`SLAB-CONTRACT §0`](../../SLAB-CONTRACT.md#0-scope-and-version). Cosmetic Browse-screen tilt is now camera-only (`SHOTS.browse.up`). Memory ref: `project_compass_only_camera_heading`.
- **Bake-mtime cache-busting.** All slab consumers (`BakedGround`, `BakedLamps`, `InstancedTrees`, `treeAtlasMaterial`, `LafayettePark`'s `scene.json` read) request manifests with `?t=<bakeLastMs>` from the cartograph store. Production needs a `bakeLastMs` value at boot; without it the browser HTTP cache will serve stale artifacts. Today this is sourced from `useCartographStore` — Phase B needs to verify the production initial value is sane (does the store hydrate from disk in a non-authoring context?).
- **Look-keyed everything.** `Scene.jsx:942` is `<BakedGround lookId="lafayette-square">` — hardcoded. Look-keyed palette + lamp glow flow through `scene.json`. Switching looks at runtime is not wired today (no switcher UI); switching the hardcode is a one-line edit, but the slab for the new look has to exist.
- **Park is rigid, not patched.** Main's `LafayettePark` ran `patchTerrain` per vertex on water/path/bank/island/fence (heavy uniform plumbing per mesh). Branch lifts the whole group rigidly by `terrainExag`. Looks identical on the LS terrain (which is gentle); diverges visibly on steeper terrain — irrelevant for LS, relevant for Phase B parametrize.
- **Foundation geometry is shared with the bake.** `src/lib/foundationGeometry.js` exports `periodPedestalFor` + `FOUNDATION_BELOW_GRADE_M`; consumed by both `LafayetteScene` and `cartograph/bake-buildings.js`. Modern (fh=0) buildings now emit a sub-grade foundation block instead of being skipped — fixes terrain-corner exposure on slopes.

---

## 2. What ships now that didn't — the "sterilize" surface

Each row gets a `verdict` that names the *direction* of Phase B's decision. **Verdicts are not decisions.** They're the decision points Phase B will reach for. Verdict legend:

- **keep** — ships to prod as-is, no change needed
- **strip** — must not ship; remove from prod build
- **gate** — keep available but conditional on dev-mode / `?authoring` / auth / IP
- **parametrize** — keep, but the LS-as-place hardcode (`lafayette-square`, St. Louis lat/lon, etc.) must become scene-parametric

### 2.1. Authoring surfaces reachable on the live URL

`vite.config.js` has four HTML inputs at `build.rollupOptions.input`. All four bundle into `dist/`; the GH Pages deploy ships `dist/`; nothing in `vite.config.js`'s middleware mode-switches them out of production. The dev-server middleware (`serveHelperApps()`) is a dev-only convenience; the *built* HTML files travel regardless.

| Surface | Files shipped today | Verdict |
|---|---|---|
| `/cartograph.html` | `cartograph.html` + `src/cartograph/CartographApp.jsx` + all of `src/cartograph/` (Panel, MapLayers, Toolbar, Surfaces, BlockGeometryV2Debug, TodChannel, SkyGradientGrid, MeasureOverlay, CornerEditHandles, Aerial, BakeModal, SurveyorPanel, animatedParam, useCartographStore, …) + design assets in `public/looks/` | **strip** (or gate behind dev-only build flag). Authoring kit, not for end users. Bundle weight is the biggest single line (§2.3). |
| `/arborist.html` | `arborist.html` + `src/arborist/{ArboristApp, Grove, SpecimenViewport, Workstage, useArboristStore}` | **strip** (or gate). Tree authoring kit. |
| `/preview.html` | `preview.html` + `src/preview/{PreviewApp, GpuMonitor, PhoneFrame, StripChart, TriggerBar, PreviewPostFx, BakedBuildings, cameraTween, heroAnim, phoneBus, neonState, lightingState, lampGlowState, skyState}` | **strip** (or gate behind `?preview`). Perf-proving rig; not consumer-facing. |
| `/stage` (legacy) | `stage.html` was removed from `vite.config.js`'s `input` map on this branch — Stage is now cartograph-hosted. `src/stage/{StageApp, StageArch, StageSky, surfaceState}` still exist in source and are imported by cartograph. | **keep** — source path is now a cartograph subroute, not a public route. No standalone HTML in the build. |
| `public/model-viewer.html` | Already removed on this branch (verified — was deleted alongside facade rip on 2026-05-12 per [INVENTORY-DATA §E](INVENTORY-DATA.md#e-quarantined--removed-this-session)) | ✓ already gone |

### 2.2. Cross-imports from production into cartograph (the store seam)

`src/cartograph/stores/useCartographStore.js` is imported by **six production-runtime components**. This is the single largest reason the `cartograph` chunk is in the wire — tree-shaking helps but the store's transitive deps (boundary, classify, palette derivation, animatedParam, m3Colors, skyGrid, skyLightChannels) survive into the production graph.

| Consumer | What it reads | Verdict |
|---|---|---|
| `BakedGround.jsx` | `activeLookId`, `bakeLastMs`, `layerColors` (live retint), `materialPhysics` | **parametrize** — extract to a minimal `useLookState` shim that LS-prod consumes; cartograph store stays authoring-only. The runtime needs ~5 fields; it doesn't need the 1313-line store. |
| `BakedLamps.jsx` | `activeLookId`, `bakeLastMs`, `lampGlow`, `layerColors.lamp` | parametrize (same shim) |
| `InstancedTrees.jsx` | `activeLookId` | parametrize (same shim) |
| `LafayetteScene.jsx` | `buildingPalette`, `materialPhysics`, `materialColors` (foundation + per-wall + per-roof live wires inside `useFrame`) | **parametrize + keep palette pull**. Live-tuning shouldn't ship to prod; the palette pull itself is load-bearing and should come from `scene.json` directly, not the cartograph store. |
| `LafayettePark.jsx` | scene-side lifts/offsets | parametrize (same shim) |
| `StreetLights.jsx` | `layerColors.lamp` | (file still present; not mounted by `Scene.jsx` on the branch — see §1.1) — **strip** if file is truly unmounted post-merge |

The point: every runtime read of `useCartographStore` is structurally a read of `scene.json` or a near-equivalent published constant. The store is a dev-time convenience that leaked. Phase B's parametrize pass replaces these with reads of the slab + a tiny runtime state shim.

### 2.3. Bundle deltas

Comparing the current branch build inventory ([INVENTORY-DATA §G](INVENTORY-DATA.md#g-bundle-inventory-2026-05-12-build)) against what main produces today. Main's bundle wasn't re-measured for this doc — Phase B should re-measure to nail the deltas precisely. Direction is unambiguous either way:

| Chunk | On branch | Main expected | Verdict |
|---|---|---|---|
| `cartograph` | 4.5 MB min / 1.1 MB gz | not in main build (no `cartograph.html` entry on main? — TO VERIFY against `main:vite.config.js`) | **strip** |
| `arborist` | 71 KB / 21 KB gz | not in main | strip |
| `preview` | 36 KB / 13 KB gz | not in main | strip |
| `PreviewPostFx` | 88 KB / 28 KB gz | not in main | strip |
| `main` | 1.2 MB / 288 KB gz | main equiv ~similar | keep |
| `vendor` | 739 KB / 193 KB gz | similar | keep |
| `buildings` (lazy) | 631 KB / 95 KB gz | similar | keep |
| `postfx` | 226 KB / 100 KB gz | similar | keep |

**Loudest line on the wire on branch:** `cartograph` at 1.1 MB gz. Strip it and first-paint payload drops by roughly that much. Memory ref: `feedback_beautiful_first_lightweight_51` — this strip is pure stability win with zero visual cost; do it.

### 2.4. New live-data dependencies the branch added

| Dep | Consumer | Verdict |
|---|---|---|
| `src/data/planetarium/{constellations,named_stars,planets}.json` | `CelestialBodies`, `StageSky`, `PlanetariumOverlay` (overlay component itself unmounted in production — see §3 K.3) | **keep** (constellations + named stars are visible in night sky); **strip planets.json if PlanetariumOverlay stays unmounted** |
| `public/textures/milky_way.jpg` (17 MB) | `CelestialBodies` background star field (TO VERIFY consumer) | **keep + verify gzip/CDN behavior** — 17 MB raw, will be heavy on mobile cellular if not gated |
| `src/data/landmarks.json` (+31 lines) | `useInit`, `useListings`, cartograph `SurveyorPanel` | keep |
| `src/data/park_species_map.json` (+148) | `arborist/bake-trees.js`, scripts | **strip from prod build** — authoring input, not runtime |
| `public/clouds/{presets,almanac}.json` (611 lines new) | none in runtime | **strip** unless `CloudDome` is wired to consume in Phase B (K.2 carry-over) |
| Branch did **not** add open-meteo, GAS, or Supabase deps — those existed on main | — | — |

### 2.5. Asset volume — `public/` what actually ships

`public/` post-cleanup ([INVENTORY-DATA §F](INVENTORY-DATA.md#f-asset-weight-post-cleaning-dev-tree)):

| Path | Size | Vite `copyPublicDir` ships to `dist/`? | Verdict |
|---|---|---|---|
| `public/trees/` | 4.9 GB | **UNVERIFIED.** Default Vite behavior copies all of `public/`. If true, this is a deploy-killer. | **investigate + likely gate to a sub-tree** (only `public/baked/<look>/trees/` is consumer; `public/trees/` is arborist source) |
| `public/models/` | 255 MB | **UNVERIFIED.** | **investigate.** Whatever's not consumed by production = strip. The 400 MB facade-decor rip already landed; remaining 255 MB is "building / decoration GLBs" — audit per-file. |
| `public/baked/` | 201 MB | ✅ ships (by design) | keep (this is the slab) |
| `public/photos/` | 71 MB | ✅ ships | keep (PlaceCard photos) |
| `public/looks/` | 508 KB | ✅ ships | **strip from prod** unless runtime reads `design.json` (it doesn't today — `scene.json` in the slab carries the look-side colors) |
| `public/clouds/` | 28 KB | ✅ ships | strip (no consumer) |
| `public/lidar/` | (not measured) | likely ships | **investigate + strip if not consumed** |

The pattern: Vite's `copyPublicDir` is dumb; Phase B's sterilize step needs to whitelist what actually goes in the deployed bundle, not rely on a permissive default.

### 2.6. Aggregated keep/strip ledger (Phase B preview only)

| Direction | Items |
|---|---|
| **strip** | `cartograph.html` + `src/cartograph/` chunk; `arborist.html` + `src/arborist/`; `preview.html` + `src/preview/`; `public/clouds/`; `public/looks/`; `public/trees/` source (keep `public/baked/<look>/trees/` only); unverified slices of `public/models/` and `public/lidar/` |
| **gate** | (alternative to strip if any of the above need to remain reachable from a non-public URL — e.g., `?authoring` + auth check) |
| **parametrize** | every `useCartographStore` consumer (6 components); `Scene.jsx:942` lookId hardcode; `useWeather.js` St. Louis lat/lon; place-name hardcodes; identity-flow assumptions in `useInit` |
| **keep** | the slab itself; `buildings.json` + `facade_mapping.json` (consumer-surface); GAS endpoints + Supabase + open-meteo; `LafayetteScene` per-id mount; `NeonBands` per-building |

---

## 3. What stops working or changes for users — does the nerve still smile?

Walk the consumer surface against both runtimes. Categorized by feature area; verdict on each is *behavioral status*, not action.

### 3.1. Place cards (`PlaceCard.jsx`, listing flow)

| Surface | Main | Branch | Status |
|---|---|---|---|
| Open from building click | ✅ via `LafayetteScene` `<ClickCatcher>` + per-id `<Building>` | ✅ same code path | unchanged |
| Photo + description from `facade_mapping.json` | ✅ | ✅ | unchanged |
| Guardian edit, hours, menus, QR studio | ✅ via GAS endpoints | ✅ same | unchanged |
| `/place/<id>` route + `PlaceOpener` | ✅ | ✅ | unchanged |
| Cloudflare Worker OG meta tags | ✅ | ✅ | unchanged |

**Net:** PlaceCard is invariant under the slab swap. The system the user pinned ("dope the artifact, PlaceCard edits per-entity" — memory `project_doped_artifact_placecard_edit_pattern`) is preserved.

### 3.2. Neon (per-building, listing-hour-gated)

| Surface | Main | Branch |
|---|---|---|
| Per-building `NeonBand` mount | inline in `LafayetteScene` `<Building>` | now lifted into `src/components/NeonBands.jsx` (239 lines, new) but still mounted per-building from `LafayetteScene` |
| Listing-hour gate + 60s tick | ✅ | ✅ |
| Color from listing data + handle | ✅ | ✅ |

**Net:** mechanics unchanged. The NeonBands extract is a refactor, not a behavior change. Verify in Phase B browser smoke that hour-gating still fires correctly.

### 3.3. Click handling on buildings

`<ClickCatcher>` + per-id `<Building>` raycasts unchanged. Branch adds `Foundations` pedestal geometry below grade — verify in Phase B that the pedestal doesn't intercept clicks intended for the building shell above (mesh layers / renderOrder).

### 3.4. Mobile-specific behaviors

| Behavior | Main | Branch |
|---|---|---|
| Mobile UA detection + staggered mount of SDF labels + map pins (2-3.5s after `viewMode !== 'hero'`) | ✅ (`LafayetteScene:~1275`) | ✅ same |
| Desktop-only mounts: `StreetLights`, full `GatewayArch` | ✅ | branch swaps `StreetLights` → `BakedLamps`; same `!IS_MOBILE` gate. **Lamps shader-glow** (`lampLightmap.js` `DataTexture`) still uses live `street_lamps.json` data — verify Phase B that mobile path renders the warm glow correctly without the live `<StreetLights>` mount that previously seeded shader uniforms |
| `DeferredStreetLights` 4s timer | ✅ mounts `StreetLights` after delay | branch's `DeferredStreetLights` now mounts `<BakedLamps />` after 4s |
| GPU memory budget (first paint) | high for `StreetRibbons` (1939-line mesh build) | lower at scene compose; higher at single-frame mesh upload for `BakedGround` (one merged-buffer upload vs. many incremental ribbons) — verify Preview's GpuMonitor proves it ([cartograph/FEATURES.md §"Preview"](../../cartograph/FEATURES.md)) |

**Net:** mobile staging logic is intact. The shader-glow seam in `lampLightmap.js` is the highest-risk mobile regression — verify visually before merge.

### 3.5. Camera / view modes (Browse / Hero / Street / planetarium)

| Mode | Main | Branch | Notes |
|---|---|---|---|
| Hero | ✅ | ✅ | preset position unchanged |
| Browse | ✅ (tilt via `SHOTS.browse.up`) | ✅ | the compass-only-camera-heading canon (memory `project_compass_only_camera_heading`) is *more* load-bearing on branch since slab geometry is rigidly compass-framed |
| Street | ✅ | ✅ | |
| Planetarium | `viewMode === 'planetarium'` infrastructure exists in `Scene.jsx` (ESC, idle timeout, camera shots) | same | **`PlanetariumOverlay` is not imported by `Scene.jsx` / `LafayetteScene.jsx` / `App.jsx` on either side.** Carry-over K.3. Branch's only diff in the file is `fog: false` on constellation material — dead code edit if overlay is truly unmounted. Phase A flags; Phase B confirms + decides strip vs. wire. |

### 3.6. Time-of-day system

`useTimeOfDay` + `useSkyState` + `CelestialBodies` + `CloudDome` + `WeatherPoller` — same code paths on both sides. Branch's `DawnTimeline.jsx` (115 lines, new) is a debug/auth ring around dawn computation, currently only consumed by cartograph + preview. **No production behavioral change.**

`CloudDome` is procedural on both sides. The branch *publishes* `public/clouds/{presets,almanac}.json` but does not *consume* them — half-wired publish-loop. Carry-over K.2: Phase B either wires `CloudDome` to read the artifacts or strips them.

### 3.7. Identity flow (device hash, admin, Cary auth)

Unchanged. `getDeviceHash`, `?admin` passphrase + 6h sessionStorage token, Supabase phone OTP for Cary. The cartograph routes (`/cartograph.html`, etc.) ship **without auth gates** in the current branch — anyone with the URL can reach the authoring kit. Phase B's security audit is where this gets resolved (strip beats gate in this codebase, per the doctrine).

### 3.8. Park visual

Heavy diff (-870 lines in `LafayettePark.jsx`) but **the user-facing park looks like the park**. Water meshes, lake banks, grotto, island, fence, paths, grass all still mount; they just no longer per-vertex-patch the terrain (rigid lift instead). Park water + park paths are *also* baked into `ground.json` — the live mounts paint on top. Phase B carry-over (L1.2 in [SLAB-CONTRACT §11](../../SLAB-CONTRACT.md#11-pending-boundary-work-cross-listed-in-lsbacklogmd)): retire the live mounts now that the bake covers them. Until then, double-painting is the worst case (a visual no-op on top of a visual yes).

### 3.9. Trees

Net-new visual. Production didn't render street/yard trees on main; branch adds 745 instanced placements via `InstancedTrees`. This is a **visual win** consistent with the product doctrine (beautiful 49%). Risks:

- GPU memory cost on mobile (`InstancedMesh` per species/variant) — verify in Preview.
- LOD / frustum culling working as expected via `default.json`'s tile bins.
- Tree atlas textures (bark + leaves color + normal PNGs per look) — verify cache-busting works on first deploy.

### 3.10. Handles + avatars

Unchanged. GAS endpoints + sessionStorage; no slab dependency.

### 3.11. Check-in (townie QR), residence, bulletin, Cary

All GAS + Supabase. Slab swap does not touch them. Cary stays behind "coming soon" per `PUBLISH.md §5` — Phase B decides ship-live vs. ship-placeholder per [BACKLOG](../BACKLOG.md#concurrent--non-blocking).

### 3.12. The CSS3D portal removal (subtle visual)

Main's `Scene.jsx` rendered a `<div ref={setSvgPortalEl}>` *behind* the WebGL canvas, and the Canvas had `style={{ zIndex: 1 }}` + transparent background. `VectorStreets` then portaled an SVG ground into that div via CSS3D. On the branch this whole layer is **deleted** — the Canvas is just `style={{ position: 'relative' }}`, no portal div, no z-index stack. If anything elsewhere in the DOM relied on the SVG ground showing through transparency (unlikely but possible — e.g., a print stylesheet, a screenshot tool, an accessibility reader), it's gone. Phase A flags; Phase B verifies nothing in `App.jsx` / modals / `SceneBoundary` reaches for `svgPortalEl`.

---

## Carry-overs (doc-vs-code or sub-pass contradictions)

Items the read pass surfaced but cannot resolve in Phase A. These feed Phase B's plans or get fixed when the relevant trinity is next touched.

| ID | Item | Where | Owner |
|---|---|---|---|
| RD.1 | `cartograph/FEATURES.md:259,275` + `cartograph/ARCHITECTURE.md:116,136` reference `src/components/StreetRibbons.jsx` which no longer exists on the branch (file deleted, -1939 lines) | Cartograph trinity | Next cartograph session (already on `ls/BACKLOG K.1`) |
| RD.2 | `CloudDome` is procedural; `public/clouds/{presets,almanac}.json` ship but no runtime consumer reads them | LS runtime ↔ meteorologist | Phase B (`pre_public_cleanout` — decide wire-or-strip) |
| RD.3 | `PlanetariumOverlay` infrastructure exists in `Scene.jsx` (viewMode, camera shots) but the component is not imported anywhere in production. Branch's only diff: a `fog: false` material flag | LS runtime | Phase B — confirm dead, then strip overlay file + viewMode plumbing OR wire properly |
| RD.4 | `Vite copyPublicDir` actually ships **what** to `dist/`? `public/trees` 4.9 GB, `public/models` 255 MB, `public/lidar` unmeasured — direct inspection of post-build `dist/` is required, not inference | Build | Phase B (`pre_public_cleanout` first move) |
| RD.5 | `useCartographStore` is reached by 6 production components for ~5 fields' worth of need; the store itself is 1313 lines + transitive deps. The runtime needs `scene.json` reads, not the store | LS runtime ↔ cartograph | Phase B (`ls_basemap_swap` + parametrize pass) |
| RD.6 | `lampLightmap.js` shader-glow `DataTexture` still reads live `src/data/street_lamps.json` even though `BakedLamps` switched in production (L1.1 shipped). Half-migration | LS runtime | Phase B (close L1.1 with an `L1.1b` follow-on) or memorialize as deliberate |
| RD.7 | `LafayettePark` live mounts (water, paths, banks, island, fence, grass) double-paint over the same surfaces now also baked into `ground.json`. Park bake landed; live mounts not retired | LS runtime | Phase B (`ls_basemap_swap` L1.2) |
| RD.8 | `StreetLights.jsx` (+232 lines on branch) exists but is not imported by `Scene.jsx` on this branch. Verify no other consumer (`grep` says clean except `lampLightmap.js` doesn't import it). Probable orphan, but per `feedback_orphan_audit_full_repo` discipline: do not delete, do not assert orphan, until full-repo grep is run including non-`src/` paths | LS runtime | Phase B sterilize pass |
| RD.9 | `public/textures/milky_way.jpg` is 17 MB unminified. If `CelestialBodies` mounts it on first paint, mobile cellular will feel it. Verify mount + gate | LS runtime | Phase B perf gate |
| RD.10 | Branch's `dev` script depends on `concurrently` + runs three Node servers (`vite`, `cartograph/serve.js`, `arborist/serve.js`). Build step is just `vite build`, no server. **No prod concern**, flagged so Phase B doesn't re-discover it | Dev DX | n/a |

---

## Pointers

- [`ls/BACKLOG.md`](../BACKLOG.md) — Phase A/B/C structure this doc feeds
- [`ls/ARCHITECTURE.md`](../ARCHITECTURE.md) — runtime composition (consumer-side narrative)
- [`ls/reference/INVENTORY-DATA.md`](INVENTORY-DATA.md) — data inventory (peer to this doc)
- [`ls/reference/INVENTORY-API.md`](INVENTORY-API.md) — backend endpoints (peer)
- [`../../SLAB-CONTRACT.md`](../../SLAB-CONTRACT.md) — producer/consumer boundary spec
- [`../../cartograph/ARCHITECTURE.md`](../../cartograph/ARCHITECTURE.md) — publisher side (out of scope here)
- Memory: `feedback_beautiful_first_lightweight_51` — 51/49 doctrine
- Memory: `project_compass_only_camera_heading` — frame canon
- Memory: `feedback_orphan_audit_full_repo` — orphan discipline (applies to RD.8 and any "looks dead" finding)
- Rollback floor: tag `v1-pre-cartograph-merge` on `origin/main @ 20866ef`
