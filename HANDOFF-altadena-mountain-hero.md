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

**Geo-anchor math (computes piece-1's placement defaults):** from `meta.json` `centerLatLon` + `peak` and Altadena's committed hood center (`geography.json`/`neighborhood.json`), compute the ENU offset (meters) hood-center → range, placed in the **LS local frame (`+x = WEST, +z = NORTH`, `reference_ls_local_frame_axes`)** — the range lands **north (+z)** at true ground distance. **Verify the scene's world-units-per-meter** and match scale (mesh is real meters). **Y-offset** = mountain base ASL − hood `baseElev` ASL, so the base meets the hood ground at the correct relative elevation. Emit these as the seeded default knob values for piece 1.

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

## Definition of done

The San Gabriel range stands **due north of Altadena at its true bearing/scale**, **hazes atmospherically** (global mist + backdrop trim, per-TOD color), **takes the full TOD cycle** (alpenglow / blue dusk / moonlit night) on **native PBR**, carries **snow on the high peaks** (knob ramp), is **baked into the Altadena slab**, and its **placement + snowline + atmosphere are live knobs in the subject-kind-aware Hero Controls section** (extending the Arch's). Pieces 1+2 land first (thread-2 lane); piece 3 renders it once `src/components` frees. The landscape subject kind + brought-GLB pipeline exist as reusable machinery for the next prop. **Jacob's eye passes it across the day cycle.**
