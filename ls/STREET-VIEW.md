# Street View — the eye-level mode (camera · sky · trees)

> **Reference (runtime / LS app), eternal-present.** The canonical home for the **street view**: the eye-level camera mode, the sky you see when you look up from it, and what the trees owe it. This is the *experiential* side of the slab — downstream of the bake, in the public app — and it had no single home before tonight; everything here was scattered across `ls/FEATURES.md`, `ls/ARCHITECTURE.md`, `cartograph/STAGE.md`, `meteorologist/`, and the code. **One kind per doc:** live doctrine + open state only; narrative → `ls/` NOTES / git.
>
> *Created 2026-06-17 (research+writing pass on the street view — camera + constellation work). Verified against the code, not memory; where a prior doc disagreed, the code won and the stale claim is flagged.*

---

## 0. The one thing to settle first: **street view == planetarium**

These are **two names for one camera mode.** The code calls it `planetarium` (`useCamera.js:6`, `viewMode: 'hero' | 'browse' | 'planetarium'`). The UI and `ls/FEATURES.md` call it **street view**. They are the same mode: the camera drops to **eye height (~1.73 m)** at a clicked ground point and you **orbit in place** — turning to look around and up.

| You'll see this name… | …here |
|---|---|
| `planetarium` | all code: `useCamera.js`, `Scene.jsx` `MODE_CONSTRAINTS`, store methods `enterPlanetarium`/`exitPlanetarium`, `IDLE_TIMEOUT_PLANET` |
| **street view / "Street"** | UI labels, `ls/FEATURES.md §Planetarium (sky) mode`, `scene.json#/shots/street`, arborist tier names |

**Doctrine:** the *mode* is `planetarium` in code (the astronomical reference frame it sets up); the *experience* is "street view" (you're standing on the street). Don't rename the code on a whim — the slab key is `shots.street`, the store key is `planetarium`, and both are load-bearing. When writing for humans, say **street view**; when pointing at code, say `planetarium`.

> ⚠️ **Today's street view is an in-place eye-level *orbit*, not a walk.** You click a point and turn your head; you don't move through space. (`ls/FEATURES.md:46` says this plainly.)
>
> ▶ **A true walk-around mode is planned — but sequenced *after* everything else** (Jacob, 2026-06-17): first-person pedestrian traversal at eye level. It's the eventual evolution of street view, not the imminent next task; the rest of the suite comes first. Captured now so the design is ready when its turn comes. It's net-new, but the substrate is more ready than expected (ground-follow already exists). Design notes: **§2.5**.

---

## 1. The shape of the topic — three layers

Street view is where three systems meet, each owned elsewhere, each exposed by the 1.73 m eye:

1. **Camera work** — how the eye-level rig behaves: entering, the in-place orbit, exiting. *(§2; owner: `Scene.jsx` CameraRig + `useCamera` store.)*
2. **Constellation work** — what you see looking *up*: the sky dome, sun/moon, stars, and the drawn constellation figures. *(§3; owner: `CelestialBodies.jsx` + `PlanetariumOverlay.jsx`, authored via Stage SC.1.)*
3. **The arborist at eye level** — trees are the one asset street view scrutinizes at human scale, and the bark/LOD path has a known soft spot exactly here. *(§4; owner: `InstancedTrees.jsx` + the arborist bake.)*

The unifying fact: **street view is the mode that exposes everything at human scale.** Browse forgives (you're 600 m up); street view does not.

---

## 2. Camera work — the eye-level rig

### 2.1 One controller, three modes
The runtime has a **single `OrbitControls` rig** (drei), constraint-swapped per mode. The three modes live in `useCamera.js`:

| Mode | What it is | Rig behavior |
|---|---|---|
| `hero` | The landing cinematic — Catmull-Rom bounce holding gaze on the Gateway Arch | rotate/pan/zoom all OFF; driven by `heroAnim.js` |
| `browse` | The everyday overhead explorer | pan + zoom; rotate OFF; `minDistance 50` / `maxDistance 4000` |
| `planetarium` | **Street view** — eye-level, orbit-in-place | rotate + pan ON, zoom OFF; **`minDistance == maxDistance == 0.5`** (locked orbit radius) |

Constraints are defined in `Scene.jsx:77-105` (`MODE_CONSTRAINTS`) and applied by `applyConstraints(ctl, mode)` (`:107`). Street view's profile (`:95-104`):

```js
planetarium: {
  enableRotate: true, enablePan: true, enableZoom: false,
  rotateSpeed: 0.35, panSpeed: 80,
  screenSpacePanning: false,            // pan on the XZ ground plane
  minDistance: 0.5, maxDistance: 0.5,   // locked — orbit in place
  minPolarAngle: Math.PI / 2,           // horizon (can't look below the ground)
  maxPolarAngle: Math.PI * 0.99,        // ~zenith (can't flip over)
  mouseButtons: { LEFT: 0, MIDDLE: 2, RIGHT: 2 }, // left=orbit, right/ctrl+click=pan
  touches:      { ONE: 0, TWO: 2 },               // one-finger orbit, pinch zoom
}
```

So the eye is pinned at a point and you **rotate the world around your head**, clamped from horizon to near-zenith — you can look around and up, never down through your feet. `up` is true `[0,1,0]` (no roll). The fixed 0.5 m radius is what makes it "orbit in place" rather than circle a target.

### 2.2 Entering and leaving
- **Enter:** Ctrl+click / right-click on the map in Browse (`Scene.jsx:369`), or **double-tap** on mobile (`:378`). The click **raycasts the ground plane** to get the origin, which is stored as `planetariumOrigin: [x, z]` (`useCamera.js:42`). `enterPlanetarium(x, z)` flips the mode.
- **The transition** (`Scene.jsx:513`): camera flies to `[originX, streetEye, originZ]` looking at `[originX, streetEye, originZ − 0.5]` (a hair north, so the orbit has a horizon to start from), FOV → `streetFov`, over **1500 ms**, `up → [0,1,0]`. Eased by `easeInOutCubic` through the shared tween (`src/preview/cameraTween.js`).
- **Exit:** **ESC** (`Scene.jsx:309`), or a **2-minute idle timeout** (`IDLE_TIMEOUT_PLANET = 120000`, `:192/:654`). `exitPlanetarium()` returns to Browse (`useCamera.js:46`).

### 2.3 What the slab authors vs. what's live
Only **FOV + eye height** transit the slab — `scene.json#/shots/street.{fov, eyeHeight}` (default `eyeHeight 1.73 m`, `SHOTS_FLAT_DEFAULTS` in `skyLightChannels.js`). The **origin is a runtime raycast** (wherever the visitor clicks), never authored. This matches the doctrine in `cartograph/STAGE.md §4`: browse altitude / hero target / **street position** are intentionally *live*; only the framing scalars bake. *(Per-shot position authoring is scaffolded but not the canonical path — `CartographApp.jsx` notes the `SHOTS` const remains the source of shot framing.)*

### 2.4 Entry discoverability (an open design question)
Today the **only** way in is Ctrl+click / double-tap on the Browse map. There is no button, no "drop to the street here" affordance in the UI chrome, and no entry from a selected place card. If street view is to be a headline experience, **how the visitor finds the door** is an open design question (camera work), not a code bug — and it merges with the walk-around entry below.

### 2.5 Walk-around mode (the planned evolution — sequenced last)
> Status: **designed-not-built**, and deliberately *after* the rest of the suite. The current orbit is the floor; the walk is the ceiling. Captured here so the design is ready when its turn comes. (Verified against the code 2026-06-17 — see the feasibility findings folded in below.)

A walk-around is **street view that translates**: same 1.73 m eye, same look-around, but the origin *moves* — forward/back/strafe + free look, the visitor on foot in the neighborhood.

**The substrate is more ready than it looks.** What already exists to build on:
- **Ground-follow is essentially free.** `getElevation(x, z)` / `getElevationRaw(x, z)` (`src/lib/terrainCommon.js`, shimmed via `src/utils/elevation.js`) is a production bilinear heightfield sampler already used by buildings/trees/ribbons. Keeping the eye at ground + 1.73 m as you move is a per-frame call. ⚠️ **Gotcha:** street view runs terrain at **life-size (exag 1)** while hero/browse exaggerate by `V_EXAG` (`BakedGround.jsx:259`, `terrainShader.js:16`); `getElevation` multiplies by the *live* exag, so the walker must sample at exag 1 (or use `getElevationRaw`) or it will float/sink as the exaggeration animates.
- **Continuous render is one branch away.** Canvas is `frameloop="demand"` with a `FrameLimiter` (`Scene.jsx:144-163`) that already runs Hero at 60 fps. Walk-around joins that branch (invalidate every frame while moving).
- **The mode system extends cleanly.** Add a `viewMode` (or reuse `planetarium` with a `walking` sub-flag) in `useCamera.js`; the constraint-swap + transition machinery in `Scene.jsx` already models enter/exit.

**The net-new work, in rough order of difficulty:**
1. **Input (none today).** No WASD, pointer-lock, gyroscope, or virtual joystick exists — only ESC + Ctrl + the click/double-tap handlers (`Scene.jsx:304-444`). Desktop = WASD + mouse-look (pointer-lock optional); **mobile = an on-screen joystick / tap-to-move, which must be built from scratch.** Mobile is the harder half.
2. **Collision (none today).** No collision, no scene-perimeter fence — the only bound is an 800 m *geolocation* radius (`useUserLocation.js`), not a 3D wall. Buildings are merged meshes with per-vertex `aBuildingId` + parsed footprints (`SlabBuildings.jsx`), so footprint point-in-polygon / AABB containment is the cheap v1; per-pixel raycast is overkill. **Decide the doctrine: hard walls, soft push-out, or walk-through-v1.**
3. **Bounds.** Keep the walker on the ~1.3 km × 1 km slab (a polygon/radius containment check), and ideally on streets rather than through blocks (no walkability layer exists yet).
4. **Movement feel.** Velocity/accel integration in `useFrame`, eye-bob, run/walk — all polish on top of the above.

**Smallest viable walk-around:** add the mode → WASD + mouse-look (desktop), ground-follow via `getElevationRaw`, exag pinned to 1, neighborhood containment check, collision deferred to v2. Mobile joystick and collision are the two real projects; everything else is wiring. **This is also the mode that promotes the arborist's tier-2 bark + LOD work (§4) from "nice" to "required"** — you'll be continuously among the trees at 1.7 m.

---

## 3. Constellation work — the sky from the street

### 3.1 What's live (verified)
`CelestialBodies.jsx` is **mounted in production** (`Scene.jsx:759`) and is real astronomy, per-frame, at St. Louis lat/lon and the current (or scrubbed) time:

- **Sun + moon** via SunCalc — true azimuth/altitude; moon phase + crescent shading.
- **~523 catalog stars** (`bright_stars.json`, mag ≤ 4.0) — per-frame RA/Dec → alt/az via GMST sidereal rotation. Stars that belong to a constellation are scaled up (constellation stars ~40×, others ~4× in street view) so the figures read.
- **A noise/filler star field** rotated as a rigid group for sky fill.
- **The sky dome** — a 4-band operator-authored gradient (`GradientSky`), weather-modified (cloud cover, turbidity, sunset potential), with `skyGain` darkening the *dome only* at night (lamps + lit windows hold their authored strength).

### 3.2 The drawn constellation figures — always-on, gold lines, spectral nodes ✅ LANDED
> ⚠️ **Corrects a stale claim.** `ls/reference/RUNTIME-DELTA.md` (K.3 / RD.3) once called `PlanetariumOverlay` "unmounted dead code." **It is not** — the mount is **one level down, inside `CelestialBodies`** (`Scene.jsx:759` mounts that). RD.3 is corrected/closed.

The overlay (`PlanetariumOverlay.jsx`) draws, for the 88 IAU constellations in `src/data/planetarium/constellations.json`: **graphic lines** + **vertex nodes** + **name labels**, plus named-star + planet labels. Mounted by `CelestialBodies.jsx:962` behind `constellationsVisible`.

**Visibility — always-on in street view** (LANDED 2026-06-17 `779aded`). The old gate (`viewMode!=browse && constellations × nightFactor > 0.05`, channel default 0 → never showed) is replaced by:

```js
const constellationsVisible =
  viewMode === 'planetarium'                                   // Street: ALWAYS
  || (viewMode === 'hero' && constellationsNightFactor > 0.05) // Hero: night only (clean landing)
  || (viewMode !== 'browse' && constellationsVal > 0.05)       // operator force-on override (future param)
```

So street view always shows the figures; Hero shows them at night; Browse never. The operator `constellations` channel is **retained as a force-on override** so a future deliberate parameterization needs no re-plumbing (Jacob 2026-06-17: "visible all the time … perhaps we will [parameterize]").

**The look — gold figures, real-temperature joints** (LANDED 2026-06-17, spectral-node pass):
- **Lines + name labels stay GOLD** (`#c4a265`) — deliberately, the **Grand Central Terminal ceiling** aesthetic (Jacob).
- **Nodes are colored by their real star's spectral color.** A constellation vertex *is* a real star, so `vertexStarColor()` matches it to the catalog (`bright_stars.json`, 1.5° tolerance) and tints the node by that star's **B–V color index** (`ci`) → hot blue-white / gold / cool red by temperature. White-hot core fading out to the true color; degree-≥3 junctions keep their 4-pointed rays. This makes the figure *informative* at its joints while the gold lines hold the look.
- **Shared SSoT:** the `ci → RGB` ladder lives once in **`src/lib/starColor.js`** (`bvToRGB`), used by both the main catalog field (`CelestialBodies`) and the overlay nodes — no forked copy, so every star recolors together if the ladder ever changes.

**Open follow-ups (not blocking):**
- **Smooth opacity fade** vs. today's **binary mount** — moot now that street view is always-on; revisit only if the gate is re-parameterized.
- **Milky Way** authored-but-disabled — the seam into the larger planetarium build-out (§3.4).

### 3.3 Where the sky is authored
The whole celestial envelope is **SC.1 channels** authored in Cartograph Stage (`CartographSkyLight.jsx`), keyframed across time-of-day, baked into `scene.json`, and consumed per-frame by `CelestialBodies` (the *same component* Stage and Meteorologist mount — one-consumer doctrine). Channels: `sky`, `ambient`, `hemi`, `dirSun`, `dirMoon`, `constellations`, `milkyWay`, `skyGain`. Home: `cartograph/STAGE.md §SC.1`.

### 3.4 The planetarium build-out (vision — not yet scheduled)
> Jacob, 2026-06-17: *"At some point we'll animate the Milky Way into the scene, so we'll really build out the planetarium features."*

The name `planetarium` is earned, not ironic — the sky is real astronomy already (SunCalc sun/moon, sidereal star transform). The build-out makes the looking-up experience a destination in its own right. Roughly in dependency order:

1. **Animate the Milky Way in** — the entry move. The `milkyWay` channel + texture exist (§3.2); the work is re-enabling it, animating its rise/arc with sidereal time, and weighing the ~17 MB mobile cost (stream/compress, or gate by tier).
2. **Planets** — `src/data/planetarium/planets.json` (orbital elements) already exists and `PlanetariumOverlay` has planet-marker scaffolding; the work is ephemeris → on-dome positioning at true place/time, rendered as bright wanderers (ideally distinguishable from stars).
3. **Meteors** — procedural streaks (Perseid/Geminid-style showers keyed to real dates, plus sporadics). Pure runtime effect; no data dependency. A natural "wow" that rewards lingering in the look-up view.
4. **Northern lights / aurora** — a rare, authored atmospheric effect (shader curtains low on the northern horizon). Off by default; a special-occasion / weather-tied flourish — couples naturally to the Meteorologist almanac.

All four extend the existing SC.1 / `CelestialBodies` / `PlanetariumOverlay` architecture — same consumer, new channels + render passes — so none of it forks the camera or sky stack. This is the "ceiling" for the *look-up* half of street view, the way walk-around (§2.5) is the ceiling for the *move-around* half.

---

## 4. The arborist at eye level

Street view is the **only** camera that looks at a tree from 1.73 m. Browse is 600 m up; Hero is ~55 m. So this mode is where every tree-fidelity decision gets cashed — and the path has a verified soft spot **exactly at street distance.**

### 4.1 The altitude-tier dispatch
Bark shading runs a **3-tier shader keyed to camera altitude** (`InstancedTrees.jsx:389-397`):

| Tier | Altitude gate | Fragment work |
|---|---|---|
| 0 — aerial | `y > 150` | luminance-gradient only |
| 1 — hero | `5 ≤ y ≤ 150` | gradient + detail-overlay composite |
| **2 — street** | **`y < 5`** | *intended:* full vendor PBR (color + normal + roughness + displacement) |

The street eye at 1.73 m sits firmly in tier 2. **But tier 2 currently falls back to tier 1** — the full close-up PBR path is **Brief 10C, queued, not landed** (`arborist/BACKLOG.md`; `treeAtlasMaterial.js` notes "falls back to tier 1 until 10C"). So today's street-view bark is hero-grade, not street-grade.

> ▶ **Decision (Jacob, 2026-06-17): fine for now — expected and understood.** Hero-grade bark at the current in-place orbit reads acceptably; the tier-2 / LOD gap is a known, accepted state, not a defect to chase. It graduates to *required* when **walk-around (§2.5)** lands, since that mode keeps the eye continuously among the trees.

### 4.2 Geometry LOD is published but not dispatched
The arborist bakes **three geometry LODs** (`skeleton-N-lod{0,1,2}.glb`), but the runtime **does not yet pick a LOD by camera distance** — the bake references one LOD per variant. Up close in street view you may be looking at a coarser-than-ideal mesh with hero bark. Distance-driven LOD selection + per-Look SHOT-driven tier authoring are both deferred (Brief 11 v2 / Configuration D).

### 4.3 What street view *demands* of the arborist (the open contract)
If street view becomes a headline experience, the arborist owes it, roughly in order:
1. **Tier-2 street bark (Brief 10C)** — the close-up PBR path, so bark holds up at 1.7 m.
2. **Distance-driven geometry LOD dispatch** — lod0 near, coarser far, chosen at runtime.
3. **Per-instance canopy variation** at street distance (leaf alpha/scale/occupancy) so neighboring trees don't read as clones up close — partially mitigated today by per-instance jitter (rotation/scale/hue/wind-phase, `SPEC.md`), but canopy composition is still one-per-species.
4. *(v1.6+, deferred)* **LiDAR canopy-point sampling** — real foliage placement — explicitly reserved for "when/if street-view makes the canopy-fidelity case" (`arborist/ARCHITECTURE.md`).

This is also why Survey cranks curve tessellation: `HANDOFF-survey-section-tool-design.md` notes the operator "sees the curves up close (street view)," so curves are authored to read as true béziers at this scale. Street view is the **acceptance test** for SHAPE fineness, not just trees.

---

## 5. Open threads (the work this topic implies)

State, not doctrine — these belong in `ls/BACKLOG.md` once we decide to act. Ordered by Jacob's 2026-06-17 sequencing:

| Thread | Layer | Status / decision |
|---|---|---|
| **Desktop double-click → drop to street** | camera | ✅ **LANDED** `779aded` — 450 ms detection window; animates down via CameraRig |
| **Constellations always-on + spectral nodes + gold lines** | sky | ✅ **LANDED** 2026-06-17 — always-on in street view; gold Grand-Central figures; nodes colored by real B–V spectral color (§3.2) |
| **Walk-around mode** (§2.5) | camera | the planned evolution of street view — **sequenced *after* everything else**; designed-not-built. Real work = mobile input + collision |
| **Planetarium build-out** (§3.4): Milky Way anim → planets → meteors → aurora | sky | the vision for the look-up half; **not yet scheduled**, dependency-ordered. Milky Way is the entry move |
| **Tier-2 street bark (Brief 10C) + LOD dispatch** | trees | **accepted as-is for now**; promotes to required when walk-around lands |
| **Smooth constellation opacity fade** | sky | follow-up; moot now street view is always-on; revisit only if re-parameterized |
| **Street-view entry discoverability** | camera | open design question; merges with walk-around entry |

---

## 6. Where it lives (the file map)

**Camera**
- `src/hooks/useCamera.js` — the mode store (`viewMode`, `planetariumOrigin`, `enter/exitPlanetarium`).
- `src/components/Scene.jsx` — `MODE_CONSTRAINTS` (`:77`), `applyConstraints` (`:107`), CameraRig transitions + entry/exit + idle (`:299-660`).
- `src/preview/cameraTween.js` — the shared transition state machine + `easeInOutCubic`.

**Sky / constellations**
- `src/components/CelestialBodies.jsx` — sky dome, sun, moon, stars; mounts `PlanetariumOverlay`; the `constellationsVisible` always-on gate.
- `src/components/PlanetariumOverlay.jsx` — constellation gold lines / spectral nodes (`vertexStarColor`) / gold labels + named stars (+ planet markers).
- `src/lib/starColor.js` — `bvToRGB`, the shared B–V→RGB spectral-color SSoT (main field + overlay nodes).
- `src/data/bright_stars.json` (ra/dec/mag/**ci**), `src/data/planetarium/{constellations,named_stars,planets}.json` — the catalogs.
- `src/components/Atmosphere.jsx` — volumetric clouds (couples to the sky's sun/sky color).
- Authoring: `src/cartograph/CartographSkyLight.jsx`, `src/cartograph/skyLightChannels.js`, `cartograph/bake-scene.js` → `scene.json` SC.1 channels.

**Trees**
- `src/components/InstancedTrees.jsx` — tier dispatch (`computeTier`, `:392`), instancing.
- `src/components/treeAtlasMaterial.js` — the shared bark/leaf material + tier shader.
- `arborist/` — the bake that publishes `public/trees/<species>/*` and `public/baked/<look>.json`.

**Authoritative cross-refs**
- `ls/FEATURES.md §Planetarium (sky) mode` — the user-facing pitch (the three camera modes).
- `ls/ARCHITECTURE.md` — runtime mount tree + scene.json channel inventory.
- `cartograph/STAGE.md` — SC.1 (sky/light/celestial) + SC.5 (camera/shots) authoring.
- `arborist/ARCHITECTURE.md`, `arborist/BACKLOG.md` — the tree-fidelity roadmap (Briefs 10C / 11 / Config D / Option δ).

---

> **Maintenance note:** this doc is reachable from `README.md` (Documentation map + cross-cutting feature index) and gets a plain-language line in `ORIENTATION.md`. When the camera/sky/tree code changes, update the *fact* here; route operator knobs to `cartograph/OPERATIONS.md`, the pitch to `ls/FEATURES.md`, and narrative to NOTES. The §3.2 correction means `RUNTIME-DELTA.md` K.3 needs repointing — accord sweep.
