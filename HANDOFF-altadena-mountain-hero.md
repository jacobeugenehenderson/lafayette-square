# HANDOFF — the Altadena mountain backdrop (a THIRD hero kind: the landscape)

> **Dispatch-ready brief. Drafted by Boz 2026-07-09 with Jacob (excited — build it beautiful).** The San Gabriel front range as Altadena's hero backdrop: a geo-anchored, atmospheric, TOD-lit mountain range. This exercises the `§10` brought-GLB hero path — which is *specified but not built* — and adds a **new third hero subject kind** to it.

## The insight — a landscape is a THIRD hero subject kind

`§10` names two subject classes, both **a point to frame on**: *in-map object* (a building centroid) and *decorative prop* (the Arch, framed by sliders). A **backdrop mountain is neither** — it's not a point, it's a **mesh rendered behind everything**. So it earns its own **landscape subject kind** in `heroSubject.js`, with its **own per-type controls** (the knobs — placement + snowline + atmosphere). *This is a `§10` doctrine addition; Boz folds it into canon on land.*

## The three pieces (lane-separated — THIS is how it dispatches)

The build splits by lane; **2 of 3 can start immediately**. Contract-first: **1 defines the knobs · 2 produces the asset · 3 consumes both to render.**

| # | Piece | Lane | Timing / owner |
|---|---|---|---|
| **1** | **Landscape subject kind + per-type controls (the knob regime)** — defines the CONTRACT | `src/lib/heroSubject.js` · `src/stage` · `src/cartograph` | **NOW — the thread-2 selector agent's lane** (build after selector Phase 2; same agent, serial, no collision) |
| **2** | **Bake the mountain → geo-anchored slab artifact** (`sangabriel.obj` → slab mesh) — produces the ASSET | `serve.js` · a new `bake-landscape` script | **NOW — thread-2's lane** (same agent) |
| **3** | **Render the mesh in Browse/Hero** — CONSUMES 1+2 | `src/components/*` (new renderer + `Scene.jsx` mount) | **AFTER thread-1 frees `src/components`** — fresh agent, focused hand-off |

⚠️ **Pieces 1+2 are `src/cartograph` + `serve.js` — the live thread-2 lane.** They must be built by the **thread-2 agent itself** (after it lands selector Phase 2), NOT a concurrent second agent (that's the `feedback_load_bearing_files_serial_dispatch` collision). Piece 3 waits for thread-1.

## The vision (locked with Jacob)

The **San Gabriel front range** rises **due north of Altadena** — Arroyo (W, ~JPL) past Eaton Canyon (E), up over the crest (Mt Lowe / San Gabriel Peak / Mt Wilson, ~1880 m). Altadena's marquee backdrop. It sits at its **true bearing, distance, and scale** (geo-anchored — the knob *defaults*, not floated-for-framing like the Arch), **hazes into the sky** with real atmospheric perspective, and **takes the scene's time-of-day** — warm alpenglow on the peaks at golden hour, cool blue at dusk, moonlit at night. Beautiful first.

## The asset (already downloaded)

`cartograph/data/altadena/terrain/` (untracked; built by `scratch/fetch-sangabriel-dem.mjs` from AWS Terrain Tiles / USGS 3DEP):
- **`sangabriel.obj`** — decimated DEM mesh, **real meters, Y-up, centered on its own grid**, ~640 cols (~23 MB), elev 285.8–1880.5 m.
- **`heights.f32`** — full-res Float32 grid (row-major, N→S, W→E, meters ASL) + **`meta.json`** (bbox, `metersPerPixel ~7.9`, `width/heightMeters ~13.4 km`, `minElevM/maxElevM`, `peak {lon,lat,elevM}`, `centerLatLon`) + **`heightmap.png`**.

---

## PIECE 1 — the landscape subject kind + the knobs (in the Hero Controls section)

**A new subject kind** in `src/lib/heroSubject.js` — `landscape` — alongside the existing in-map-object resolution. It resolves not to a centroid to frame, but to **"render this backdrop mesh with these controls."**

**The knobs extend the EXISTING Hero Controls section — do NOT invent a new card.** The Arch's Hero controls already live at **`src/stage/StageApp.jsx:187–194`** (the `Hero Distance / Scale / Rotation / Y Offset` `SliderRow`s → `setArch`), with the arch's channel state defaulted in **`src/cartograph/skyLightChannels.js:234–243`**. **Formalize that block as a "Hero Controls" section and make it subject-kind-aware:** it renders the **per-type controls of the active hero subject** — the Arch's prop sliders when the hero is a decorative prop, the **landscape's placement + snowline + atmosphere** knobs when it's the landscape. New landscape channel state alongside the arch defaults (`skyLightChannels.js`) → a `scene.json` channel → resolved via `useSceneJson` (exactly how the Arch's `arch`/`horizon` + the `mist` channel work) → **baked into the slab** (unbaked = unshipped). Seeded on first pour, live-authorable after. No new authoring paradigm — it **adds to the Arch's controls**, riding the existing convention.

**The knob set (the per-type controls):**

- **A. Placement** — the `§10` Hero surface, **seeded from geo-anchor** (piece 2 computes the defaults): **bearing · distance · scale · rotation · Y-offset**. Each defaulted from the real geography, each overridable. This is where "geo-anchor default + slider override" lives (`§0.0`).
- **B. Elevation shading / snowline** — a **KNOB ramp, never hardcoded** (`feedback-no-hardcoded-ramps-use-knobs`): **snowline elevation · blend softness · snow color · rock (low) color · scrub (mid) color**. Dial snow up for a winter look, down for summer.
- **C. Atmosphere** — **BOTH paths (Jacob's call):** (a) the shared **global `mist` channel** authored low (so the peaks read) + per-TOD color, AND (b) a **dedicated backdrop-only haze trim** knob (independent of the hood's fog). See the shading section for why both.

**Piece 1 is the CONTRACT** — it defines the knob schema + defaults + persistence + resolution. Piece 3's renderer *consumes* it. Build the schema so piece 3 can read `landscape.{placement,snowline,atmosphere}` off the resolved scene.

---

## PIECE 2 — bake the mountain into the slab (geo-anchor)

**Parse `sangabriel.obj` → a per-scene slab artifact:** a GLB (or slab mesh) with a **`MeshStandardMaterial`** (good normals; optionally further-decimate — a distant backdrop doesn't need 640 cols), copied under the look's baked dir (`public/baked/<look>/landscape/…`, native materials — *copied, not re-skinned*; NOT the tree atlas path) + a small **manifest entry**. A new **`bake-landscape` script** + `serve.js` wiring, modeled on how trees carry GLBs in the slab (`SLAB-CONTRACT.md:46, :393–414, :53` — `?t=<bakeLastMs>` cache-bust). **Unbaked = unshipped.**

**Geo-anchor math (computes piece-1's placement defaults):** from `meta.json` `centerLatLon` + `peak` and Altadena's committed hood center (`geography.json`/`neighborhood.json`), compute the ENU offset (meters) hood-center → range. ⚠️ **FRAME (corrected 2026-07-09, verified against `config.js`):** the local frame is **`+x = EAST, +z = SOUTH` → north = `−z`** — authoritative source is `cartograph/config.js` `wgs84ToLocal` (`x=(lon−CENTER.lon)·…` ⇒ +x=EAST; `z=(CENTER.lat−lat)·…` ⇒ +z=SOUTH), used flip-free by the whole pipeline (`derive.js`, buildings, render). The old `reference_ls_local_frame_axes` memo said `+x=WEST/+z=NORTH` but it **mislabeled a street** and concluded the sign backwards (now fixed). *(Do NOT cite the arch bearing as proof — the arch is framing-placed per `§10`, not geo-anchored.)* So the San Gabriels anchor at **`−z`** (the pieces-1+2 agent placed them at bearing ≈ `(0.18, −0.98)`, ~5.4 km out, `yOffset ≈ −428` from a real DEM hood sample). **Verify the scene's world-units-per-meter** and match scale (mesh is real meters). **Y-offset** = mountain base ASL − hood `baseElev` ASL, so the base meets the hood ground at the correct relative elevation. *(These defaults are already baked into the manifest — piece 3 consumes the manifest placement as-is; do NOT re-derive a `+z` north.)*

---

## PIECE 3 — render it (src/components — AFTER thread-1 frees the lane)

A new backdrop renderer (e.g. `MountainBackdrop.jsx`) mounted in `Scene.jsx`, **consuming piece-1's knobs + piece-2's baked asset.** Standard `GLTFLoader` (reuse GLB *loading*, model placement resolution on `GatewayArch.jsx:338–347` + `useSceneJson`, `:141–153`). `frustumCulled={false}` (giant off-center bounds). Applies the PBR material (→ auto TOD rig) + the `onBeforeCompile` snowline + backdrop-haze patches that **read the piece-1 knobs**.

**CHECKPOINT — flag Boz/Jacob:** first eye-gate the range standing at **true position + scale** (lit by the rig, no shading polish); then the **TOD shading** (alpenglow / blue dusk / moonlit night, convincing haze). **Measure on the operator's eye, not a proxy render** (`feedback_proxy_render_is_not_the_operator_eye`).

---

## The shading approach — the exciting part, and most of it is FREE (scout-mapped 2026-07-09; pieces 1+3)

**Core insight: a GLB with standard PBR materials receives the scene's full TOD light rig automatically — no custom shader, no per-frame wiring.** That's *why* `§10` mandates native materials. Do **not** reuse the terrain shader (invisible, disc-clipped displacement, flat `#2a2a26`) and do **not** imitate the Arch's bespoke `MeshBasicMaterial` faux-lighting (`GatewayArch.jsx:155–329`).

**1. TOD lighting — automatic.** The rig is standard three.js lights in `CelestialBodies.jsx` (mounted `Scene.jsx:811`): TOD-driven sun `directionalLight` + moon + **hemisphere fill from the live sky gradient** (`:1280–1285`, `color=lighting.sky.top`, `groundColor=lighting.sky.bottom`) + ambients. The TOD ramp (`:1101–1191`) already gives **golden-hour alpenglow** (sun `#ffaa55→#fff8e8`, intensity 0.7→2.2; `:1153–1173`), warm twilight, and **cool blue night** (`:1101–1131`). Any `MeshStandardMaterial` picks it all up free. **Note:** sun shadow frustum is only ±900 m (`:152–155`) → a 13 km range casts/receives **no dynamic shadow** — it **self-shades** via normals + the directional term (ensure good normals on the GLB).

**2. Atmospheric perspective — BOTH paths, both wired.** (a) The global **`FogExp2`** (`StageFog`, `PostProcessing.jsx:202–233`, mounted `Scene.jsx:804`) from the **`mist` TOD channel** reaches the mountain free — **but the default obliterates it** (`FogExp2` haze `= 1 − exp(−(density·dist)²)`; at default `0.00015`, 13 km ≈ **98% mist**). So the Altadena look authors **lower `mist.density`** + per-TOD `mist.color` (warm golden-hour, blue dusk; defaults `MIST_FLAT_DEFAULTS={density:0.03,color:'#9dc5e0'}`, `MIST_DENSITY_SCALE=0.005`, `skyLightChannels.js:117–119`). (b) **PLUS a dedicated backdrop-only haze trim** on the mountain material (`onBeforeCompile`, distance/height fade to the horizon color) so the range's atmospheric perspective is dialable **independently of the hood's fog**. Both are **piece-1 knobs**. Tuck the **base beyond the horizon disc** (`HORIZON_FLAT_DEFAULTS.radius: 3750`, `GatewayArch.jsx:449–548`).

**3. Snowline / elevation banding — a KNOB ramp** (`feedback-no-hardcoded-ramps-use-knobs`). A small **`onBeforeCompile` patch on the stock PBR material** — world-Y `varying` + `smoothstep` band driven by **piece-1's authorable uniforms** (snowline elevation, softness, snow/rock/scrub colors); the Arch's `onBeforeCompile` pattern (`GatewayArch.jsx:155`) but on `MeshStandardMaterial` so you **keep the auto-lighting and sidestep log-depth entirely** (three injects+gates the chunks for patched stock materials). *(Vertex-color banding baked into the GLB is the static fallback only — it loses the knobs, so last resort.)* **Avoid a raw `ShaderMaterial`** — it drags in log-depth for no gain.

## Log-depth constraint (only if you hand-write raw GLSL)

Raw `ShaderMaterial` (`feedback_raw_shadermaterial_needs_logdepth_chunks`, `NEIGHBORHOOD-INPUTS.md:303`) MUST: include the four `#include <logdepthbuf_*>` chunks, **gate** `USE_LOGDEPTHBUF` on `gl.capabilities.logarithmicDepthBuffer` (NOT force-on — forcing it in a LINEAR renderer collapses vertices to the near plane), and vary `customProgramCacheKey` by that flag (pattern: `NeonBands.jsx:313–323, 405–440`). Scene runs `near:1, far:60000` (`Scene.jsx:761–776`); 13 km fits; desktop/Stage LOG, mobile LINEAR. **The native-materials rule exists to not need this — prefer `onBeforeCompile` on a stock material.**

## Invariants that bind

- **Landscape is a new third subject kind** — not a point-to-frame; a mesh-behind-everything with its own per-type controls.
- **Contract-first:** piece 1 defines the knobs, piece 2 the asset, piece 3 consumes both. Build in that order; 1+2 can land before 3.
- **Native materials, `§10`** — standard PBR, render as-authored. NOT the tree/arborist atlas path. Reuse GLB *loading*, not re-skinning.
- **Per-scene slab artifact** — GLB + manifest + knobs under the look's baked dir. Unbaked = unshipped.
- **Geo-anchored default, knob-overridable** (`§0.0`).
- **Stay on PBR / patched-stock materials** — keeps the free lighting, dodges log-depth.
- **NOT in-hood terrain** — does not route through `bake-terrain.js` / the disc-clipped displacement (which the Pour skips anyway). A backdrop beyond the disc.

## Traps

- **Default `mist.density` erases the range** (98% at 13 km) — the #1 "why does it look wrong." Author it down; that's what the backdrop-haze-trim knob is for.
- **Don't reuse the terrain shader or the Arch's faux-lighting** — dead ends for a backdrop.
- **No dynamic shadows on it** (outside the ±900 m sun frustum) — self-shade via normals.
- **Don't over-tessellate** — a distant backdrop can be aggressively decimated.

## Boundaries + discipline

- **Pieces 1+2:** the **thread-2 selector agent** builds them **after** landing selector Phase 2 (its lane; serial; no collision). **Piece 3:** a **fresh agent** in a worktree off `curb-offset-draw` (branch e.g. `altadena-mountain-render`) once `src/components` is free.
- **Canonical docs OFF-LIMITS** (`NEIGHBORHOOD-INPUTS.md`, `SLAB-CONTRACT.md`, `README.md`, `heroSubject` doctrine) — **Boz folds the canon on trunk** when this lands (the `§10` third-subject-kind + the brought-GLB pipeline becoming real). Keep notes in a **"Build log" appended here** or a `scratch/` co-journal.
- **Surface scope drift immediately** (`feedback_baby_must_surface_scope_drift`) — flag if the greenfield hero-pipeline (piece 2) or the subject-kind wiring (piece 1) balloons.

---

## Build log (pieces 1+2 — thread-2 agent "Wren", 2026-07-09)

Branch `altadena-mountain` (worktree off `curb-offset-draw`). Pieces 1+2 landed; piece 3 (render, `src/components`) untouched — the sibling's lane.

### ⚠️ FRAME CORRECTION — the range sits NORTH = −z, not +z
Line 53 says "+x=WEST, +z=NORTH … range lands north (+z)", citing `reference_ls_local_frame_axes`. **That memo file is EMPTY, and the code disproves it:** `ARCH_FLAT_DEFAULTS.bearingX=0.9487, bearingZ=−0.3163` places the Gateway Arch at world `(+996, −332)`; the real Arch is **NE of Lafayette Square** → **+x=EAST, +z=SOUTH, so NORTH = −z** (same frame as `config.js`/`config.py` and the north-up Extent aerial). Piece 2 anchors the San Gabriels at **−z** (bearingZ ≈ −0.98). **Boz: fix/repopulate the `reference_ls_local_frame_axes` memo and correct §10/handoff line 53 when folding.** Piece 3 must place at −z for north.

### Piece 1 — the landscape subject kind + knob contract (DONE)
- **`heroSubject.js`**: `kind:'landscape'` resolves to `[0,40,0]` — a backdrop frames the HOOD (origin), not itself; its render controls live in the `landscape` scene channel.
- **`skyLightChannels.js`**: `LANDSCAPE_FLAT_DEFAULTS` / `LANDSCAPE_FIELD_KEYS` — a non-TOD channel (like the arch): **placement** (bearingX, bearingZ, distance, scale, rotation, yOffset) + **snowline** (snowline, snowSoftness, snowColor, rockColor, scrubColor) + **atmosphere** (haze, hazeColor). Colors are hex strings.
- **`useCartographStore.js`**: registered like `arch` — hydration `_grp('landscape',…)`, state init, `createGroupChannelActions` → `setLandscape`. Persists to design.json, hydrates on reload.
- **`bake-scene.js`**: `landscape` → scene.json (so it ships; unbaked = unshipped).
- **`StageApp.jsx` (`ArchHorizonControls`)**: now **subject-kind-aware** — when `heroSubject.kind==='landscape'` it renders the landscape placement/snowline/atmosphere knobs (SliderRows + a new `ColorRow`), else the Arch's prop sliders. Extends the existing Hero Controls, no new card (per the brief).
- **`SurveyorPanel.jsx`**: the hero picker offers **"San Gabriel Range" (landscape)** ONLY when the active look has a baked `landscape/landscape.json` (fetched per-look) — generic, no LS hardcode.

### Piece 2 — bake the mountain → slab (DONE)
- **`bake-landscape.js`** (new): parses `terrain/sangabriel.obj` (328,812 v / 655,332 f, no normals → computes smooth normals) → a **minimal glTF-2.0 GLB** (POSITION+NORMAL+u32 indices, one `MeshStandardMaterial` metallic 0 / rough 1, native PBR) at `public/baked/<look>/landscape/sangabriel.glb` + a **`landscape.json` manifest**. **Validated: loads via three's `GLTFLoader.parse` in node** (the exact piece-3 loader) — mesh, normals, indexed, bbox correct.
- **Geo-anchor** (the manifest `placement`): DEM center (meta `centerLatLon`) − hood center (`geography.json`) → ENU → world (`+x=E`, `−z=N`). Altadena: **947 m E, 5315 m N → world (947, −5315), distance 5398, bearing (0.176, −0.985), scale 1.0, yOffset −428** (from a `heights.f32` sample at the hood center = 428 m ASL, so the DEM at the hood sits at y≈0 — the seam for a future terrained margin).
- **`serve.js`**: a `runIfDirty('landscape', …)` bake step (after buildings) runs `bake-landscape.js` when the scene has `terrain/sangabriel.obj`; else skipped.
- **Mesh untouched (Jacob):** no decimation/clip in the bake — the full mesh ships; culling / LOD / "the camera never sees the back" are worked out in the **render regimes (piece 3)** — single-sided `MeshStandardMaterial` (FrontSide default) already culls back faces for free.

### The piece-3 resolution contract (how to consume 1+2)
Piece 3 fetches `/baked/<look>/landscape/landscape.json?t=<bakeLastMs>` (asset + geo-anchor `placement` + `bounds`) and reads the `landscape` channel off the resolved scene (`useSceneJson`). **Resolved placement = manifest.placement, with `scene.json.landscape.values` layered on top** (§0.0: geo-anchor default → operator override). Snowline + atmosphere come straight from the channel. Load the GLB with `GLTFLoader`, `frustumCulled={false}` (giant off-center bounds), apply `onBeforeCompile` snowline + backdrop-haze patches on the stock PBR material reading the channel uniforms (keeps auto-TOD lighting, dodges log-depth). Place at world `distance·[bearingX,_,bearingZ] + [0,yOffset,0]`, `scale`, `rotateY(rotation)`.

### Follow-on flagged (Jacob, 2026-07-09) — MARGIN TERRAIN (distinct thread)
"Keep elevation/terrain **in browse** in the space **between the neighborhood and the faded edge of the world-circle**." → the hood's own DEM-driven ground in the annulus (currently `--skip-elevation`, flat). This is **NOT** the backdrop mesh — it's re-enabling `bake-terrain` off the same `heights.f32` for the disc+margin (own thread, pour/terrain lane, not `src/components`). Piece 2's `yOffset` already targets y≈0 at the hood so the backdrop joins a terrained margin cleanly. Schedule as its own piece.

### Validation
`node bake-landscape.js --look=altadena --scene=altadena` → 15.0 MB GLB + manifest; GLB structurally valid (magic/chunks/accessor byteLengths) AND loads via `GLTFLoader`. All piece-1 files transform (esbuild) / parse (node). serve.js parses; the landscape asset path resolves. Not yet eye-gated (needs piece 3 to render).

## Build log (piece 3 — render, agent "Vantage", 2026-07-10)

Branch `altadena-mountain-render` (worktree off `curb-offset-draw`). **Piece 3 renders — Jacob's first sight of the range drew a gasp.** Parked at the checkpoint (placement/scale gated by eye) BEFORE shading polish, per the brief.

### What landed (3 source files)
- **`src/components/MountainBackdrop.jsx`** (new) — the §10 landscape renderer, modeled on GatewayArch's ONE-shared-consumer pattern (`lookId`/`bakeLastMs`/`landscapeOverride` props; override > baked `scene.landscape` > `LANDSCAPE_FLAT_DEFAULTS`). Fetches `/baked/<look>/landscape/landscape.json` (absent → renders nothing, generic no-LS rule) → loads the GLB with raw `GLTFLoader` (uncompressed, no decoder) → applies a **stock `MeshStandardMaterial`** (auto TOD rig, no bespoke lighting) with two `onBeforeCompile` patches: (a) **snowline band** — a KNOB ramp keyed off mesh-LOCAL `position.y` (= metres ASL; verified against manifest `bounds.y`/`elevM`), scrub→rock→snow, scrub-mid derived from the real elevation range so only the snow transition is an explicit knob; (b) **backdrop-haze trim** — distance (`length(vViewPosition)`) × height fade toward `hazeColor`, independent of the hood's `mist` fog, its tint leaning toward the live sky horizon each frame so it takes TOD for free. Placed at `distance·[bearingX,_,bearingZ] + [0,yOffset,0]`, `rotateY(rotation)`, `scale`, `frustumCulled={false}`.
- **`src/components/Scene.jsx`** — production mount (`!IS_GROUND`, no props → reads INSTANCE look + baked scene; no-op for LS).
- **`src/cartograph/CartographApp.jsx`** — mount in the **generic (poured-installation) StageEnvironment** with a live `landscapeOverride = activeChannel(s,'landscape')`. This is the **pulldown eye-gate** path: pick a poured look → the range shows + the Hero Controls sliders retint it live. (The LS registry StageEnvironment is untouched — LS has no landscape.)

### The placement resolution I settled (a §0.0 seam worth knowing)
Contract said "manifest.placement, channel layered on top." But an **unauthored** channel is all `LANDSCAPE_FLAT_DEFAULTS` — whose placement values (`yOffset −20`, etc.) would **clobber the manifest's true geo-anchor** (`yOffset −428`) the moment the channel exists. So the renderer overrides a placement key **only when it differs from the flat default** (operator moved it); otherwise the manifest geo-anchor wins. Snowline/atmosphere still come straight from the channel (flat defaults are their real defaults). **This is a piece-1↔piece-2 seam**: the Stage placement sliders are seeded from flat defaults, not the manifest — so dragging one snaps to the flat-default baseline, not the geo spot. Fold-worthy: **seed the landscape channel's placement fields FROM the manifest at authoring time** (Boz/piece-1 follow-up) so the sliders start at the true anchor.

### Eye-gate scaffolding (NOT committed — throwaway)
Altadena has no instance/full pour on trunk. To view the range I staged the in-flight Altadena pour into this worktree (all untracked/gitignored except one tracked edit): copied `cartograph/data/altadena/` + `public/looks/altadena/` + `public/baked/altadena/` (slab from the `selector-finish`/Extent thread) + `public/baked/altadena/landscape/` (GLB+manifest from the `altadena-mountain` piece-1+2 worktree), and added an `altadena` entry to `public/looks/index.json` (borrowed from the Extent branch; `GET /looks` reads that file, no dir-scan). **None of this is in the commit** — it's the Extent thread's to land. Ran the stack from this worktree on the default ports (`:5173` web / `:3333` carto; `meteorologist` fails to boot but the range doesn't need it). Eye-gate URL: `http://localhost:5173/cartograph?look=altadena`.

### Open for the shading pass (next, after the placement gate)
- **`mist`-density trap is LIVE on Altadena** — its `mist` channel is authored `density 0.05` (≈ full FogExp2 wash at range distance), and the **cartograph Stage applies `StageFog` too** (`CartographApp.jsx:1160`), so the range reads washed-out until the Altadena look authors `mist.density` **down** (a look-authoring knob, not a renderer change — the brief's #1 "why it looks wrong").
- **Altadena's baked `scene.json` has NO `landscape` channel** (poured pre-piece-1), so the range currently renders at the **manifest geo-anchor** with **default** snowline/haze. To ship authored snowline/atmosphere, re-bake Altadena's scene through piece-1's `bake-scene` (writes the channel), or author live in Stage.
- **Perf/LOD untouched** — the full 655k-tri mesh ships (Wren left decimation/culling to "the render regimes"). Single-sided FrontSide culls back faces for free; a distant backdrop can be aggressively decimated later. Mounted `!IS_GROUND` only (no mobile gate yet).
- **Boz canon folds still owed** (from the pieces-1+2 log): fix/repopulate `reference_ls_local_frame_axes` (north = −z) and the §10 third-subject-kind + brought-GLB pipeline.

## Definition of done

The San Gabriel range stands **due north of Altadena at its true bearing/scale**, **hazes atmospherically** (global mist + backdrop trim, per-TOD color), **takes the full TOD cycle** (alpenglow / blue dusk / moonlit night) on **native PBR**, carries **snow on the high peaks** (knob ramp), is **baked into the Altadena slab**, and its **placement + snowline + atmosphere are live knobs in the subject-kind-aware Hero Controls section** (extending the Arch's). Pieces 1+2 land first (thread-2 lane); piece 3 renders it once `src/components` frees. The landscape subject kind + brought-GLB pipeline exist as reusable machinery for the next prop. **Jacob's eye passes it across the day cycle.**
