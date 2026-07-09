# HANDOFF — the Altadena mountain backdrop (brought-GLB hero prop + its shading)

> **Dispatch-ready brief. Drafted by Boz 2026-07-09 with Jacob (who is excited about this one — build it beautiful).** The San Gabriel front range as Altadena's hero backdrop: a geo-anchored, atmospheric, TOD-lit mountain range. This is the first real exercise of the `§10` **brought-GLB hero** path — which is *specified but not yet built as a pipeline*, so you build that vehicle too.

## Who you are + the call

You are the agent dispatched to stand the San Gabriel mountains up behind Altadena. **Name yourself** (one word, your pick — joins the trail).

- **Agent: FRESH.** Why: self-contained new construction against a locked design + precise anchors; no warm context is load-bearing.
- **⚠️ SEQUENCING — dispatch only when `src/components` is FREE.** This touches `src/components` (a new backdrop renderer + `Scene.jsx` mount). The **thread-1 impostor agent owns `src/components` live**; do not run concurrently in that lane. Dispatch after thread-1 lands (or confirm with Jacob the lane is clear). Everything else (the bake step, the OBJ→GLB conversion, look authoring) is collision-free.
- **Route first (universal path):** `ORIENTATION.md` → `README.md §⭐ START HERE` → **`NEIGHBORHOOD-INPUTS.md §10`** (the hero-prop doctrine — read to the section) → `SLAB-CONTRACT.md` (how a GLB rides the slab: `:46, :393–414, :53`). Do not re-derive — it's written down.

## The vision (locked with Jacob)

The **San Gabriel front range** rises **due north of Altadena** — from the Arroyo (W, ~JPL) past Eaton Canyon (E), up over the crest (Mt Lowe / San Gabriel Peak / Mt Wilson, ~1880 m). It is Altadena's marquee backdrop. It must sit at its **true bearing, distance, and scale** (geo-anchored, not floated-for-framing like the Arch), **haze into the sky** with real atmospheric perspective, and **take the scene's time-of-day** — warm alpenglow raking the peaks at golden hour, cool blue at dusk, moonlit at night. Beautiful first.

## The asset (already downloaded)

`cartograph/data/altadena/terrain/` (untracked; built by `scratch/fetch-sangabriel-dem.mjs` from AWS Terrain Tiles / USGS 3DEP):
- **`sangabriel.obj`** — decimated DEM mesh, **real meters, Y-up, centered on its own grid**, ~640 cols (~23 MB), elev 285.8–1880.5 m.
- **`heights.f32`** — full-res Float32 grid (row-major, N→S rows, W→E cols, meters ASL) + **`meta.json`** (bbox, `metersPerPixel ~7.9`, `width/heightMeters ~13.4 km`, `minElevM/maxElevM`, `peak {lon,lat,elevM}`, `centerLatLon`).
- **`heightmap.png`** — normalized grayscale (displacement / quick-look).

## The shading approach — the exciting part, and most of it is FREE (scout-mapped 2026-07-09, verify each anchor)

**The core insight: a GLB with standard PBR materials receives the scene's full TOD light rig automatically — no custom shader, no per-frame wiring.** That is *exactly why* `§10` mandates native materials. Do **not** reuse the terrain shader (invisible, disc-clipped displacement, flat `#2a2a26` — gives a backdrop nothing) and do **not** imitate the Arch's bespoke `MeshBasicMaterial` faux-lighting (`GatewayArch.jsx:155–329`). Keep the mountain on ordinary PBR and let the rig do the work.

**1. TOD lighting — automatic.** The scene light rig is standard three.js lights in `CelestialBodies.jsx` (mounted `Scene.jsx:811`): a TOD-driven sun `directionalLight` + moon + **hemisphere fill driven by the live sky gradient** (`:1280–1285`, `color = lighting.sky.top`, `groundColor = lighting.sky.bottom`) + ambients. The TOD color ramp (`:1101–1191`) already gives you **golden-hour alpenglow** (sun `#ffaa55→#fff8e8`, intensity 0.7→2.2; `:1153–1173`), **twilight** warm-bottom sky, and **cool blue night** (`:1101–1131`). Any `MeshStandardMaterial` in the graph picks all of this up for free. **Note:** the sun shadow frustum is only ±900 m (`:152–155`), so a 13 km range casts/receives **no dynamic shadow** — it **self-shades** via its own normals + the directional term. That's correct for a backdrop; just ensure the GLB has good vertex normals.

**2. Atmospheric perspective = the global `FogExp2` (`mist` channel) — the single most important lever.** `StageFog` (`PostProcessing.jsx:202–233`, mounted `Scene.jsx:804`) sets `scene.fog = FogExp2(color, density)` from the authored **`mist` TOD channel**. It reaches the mountain with zero wiring — **but the neighborhood-tuned default will obliterate it:** `FogExp2` haze `= 1 − exp(−(density·dist)²)`; at the default effective density `0.00015`, a 13 km range is **~98% mist**. So the Altadena look must author a **much lower `mist.density`** for the peaks to read, plus a **per-TOD-slot `mist.color`** so haze tints **warm at golden hour, blue at dusk** (defaults `MIST_FLAT_DEFAULTS = {density:0.03, color:'#9dc5e0'}`, `MIST_DENSITY_SCALE=0.005`, `skyLightChannels.js:117–119`). Tuck the **base of the range just beyond the horizon disc** (`HORIZON_FLAT_DEFAULTS.radius: 3750`, `GatewayArch.jsx:449–548`) so it emerges from the ground-meets-sky band. **This fog authoring is a first-class part of the deliverable, not an afterthought** — it's what makes it read as a real distant range.

**3. Snowline / elevation banding — author it in (nothing reusable exists).** Give the range rock→scrub→snow banding by altitude (285→1880 m). Two options, in preference order:
   - **Preferred: a small `onBeforeCompile` patch on the stock PBR material** — add a world-Y `varying` + `smoothstep` snowline (the Arch's `onBeforeCompile` pattern, `GatewayArch.jsx:155`, but on `MeshStandardMaterial` so you *keep* the auto-lighting from §1). **This stays on the standard-material lighting path and sidesteps the log-depth problem entirely** (three injects + gates the depth chunks for patched stock materials).
   - **Fallback: bake vertex-color banding into the GLB** at conversion time (albedo keyed to elevation). Simplest, fully static.
   - **Avoid a raw `ShaderMaterial`** unless you must — it drags in the log-depth constraint (§Log-depth).

**4. Depth — safe if you stay on PBR.** The scene runs `near:1, far:60000` (`Scene.jsx:761–776`); 13 km fits. Desktop/Stage use `logarithmicDepthBuffer`, mobile is LINEAR (the "production LINEAR; conform→LOG" gap). With **standard/patched PBR materials, three injects and gates the `<logdepthbuf_*>` chunks for you — zero depth work.**

## Log-depth constraint (only if you hand-write raw GLSL)

If you write a **raw `ShaderMaterial`** (or raw-GLSL snowline), you MUST (canon `feedback_raw_shadermaterial_needs_logdepth_chunks`, `NEIGHBORHOOD-INPUTS.md:303`): include the four `#include <logdepthbuf_pars_vertex/fragment>` + `<logdepthbuf_vertex/fragment>` chunks, **gate** the `USE_LOGDEPTHBUF` define on `gl.capabilities.logarithmicDepthBuffer` (NOT force-on — forcing it in a LINEAR renderer collapses vertices to the near plane), and vary `customProgramCacheKey` by that flag. The proven pattern is `NeonBands.jsx:313–323, 405–440`. **The whole point of §10's native-materials rule is to not need this — prefer `onBeforeCompile` on a stock material.**

## Build plan (phased — checkpoint before the shading polish)

**Phase 0 — the asset + geo-anchor math.**
1. Convert `sangabriel.obj` → **GLB with a `MeshStandardMaterial`** (good normals; optionally further-decimate — it's a distant backdrop, it does not need 640 cols). A small conversion script under `cartograph/` (reuse `GLTFLoader`/exporter tooling; do NOT route through the tree atlas baker — native materials, `§10`).
2. **Geo-anchor** (default; `§0.0` overridable): from `meta.json` `centerLatLon` + `peak` and Altadena's committed hood center (`geography.json` / `neighborhood.json`), compute the ENU offset (meters) from hood-center → range, and place the GLB there in the **LS local frame (`+x = WEST, +z = NORTH`, `reference_ls_local_frame_axes`)** — the range lands **north (+z)** at its true ground distance. **Verify the scene's world-units-per-meter** and match scale (the mesh is real meters). Set the **Y offset** so the range base aligns with the hood ground plane at the correct *relative* elevation (mountain base ASL − hood `baseElev` ASL). Frustum-cull off (`frustumCulled={false}` — giant off-center bounds, like the Arch).

**Phase 1 — the brought-GLB hero pipeline (this vehicle does NOT exist yet — build it).**
3. There is **no `bake-hero.js` / `hero.json` manifest / loader today** (grep-confirmed — only §10 prose + the bespoke Arch channels). Build the minimal real thing: a **per-scene slab artifact** — the hero GLB copied under `public/baked/<look>/hero/…` (native materials, *copied not re-skinned*) + a small **hero-manifest entry** (asset path + placement values: distance/bearing/scale/rotation/yOffset) + a runtime **loader/renderer** (`GLTFLoader`, model placement resolution on `GatewayArch.jsx:338–347` + `useSceneJson`, `:141–153`). **Unbaked = unshipped** (`SLAB-CONTRACT`). New renderer file in `src/components` (e.g. `MountainBackdrop.jsx`), mounted in `Scene.jsx`.
4. **CHECKPOINT — flag Boz/Jacob:** the range stands at its true position/scale in Stage/runtime, lit by the rig (no shading polish yet). Eye-gate the *placement + scale + true-position feel* before investing in the atmospheric finish.

**Phase 2 — the shading finish (the beautiful part).**
5. Author the **Altadena look's `mist` channel**: low density (so the range reads) + per-TOD `mist.color` (warm golden-hour, blue dusk). Tuck the base beyond the horizon disc.
6. Add the **snowline/elevation banding** (`onBeforeCompile` world-Y snowline on the PBR material — §3).
7. **Eye-gate across the TOD cycle** — confirm alpenglow at golden hour, blue-hour dusk, moonlit night, and that the range hazes convincingly into the sky. **Measure on the operator's eye, not a proxy render** (`feedback_proxy_render_is_not_the_operator_eye`).

*(Stretch / likely a follow-on session: wire the generic brought-GLB path into the operator's Hero setup surface — the `§10` Survey step-4 sliders UI + the `§5.2` "adding a hero prop is adding a feature before the bake" surface. Focus THIS brief on getting the mountain in and gorgeous; surface to Boz if you think the generic UI must come first.)*

## Invariants that bind

- **Native materials, `§10`.** Render as-authored (standard PBR). **NOT** the tree/arborist atlas path (that strips materials). Reuse GLB *loading*, not re-skinning.
- **Per-scene slab artifact.** The GLB + manifest + placement live under the look's baked dir. **Unbaked = unshipped.**
- **Geo-anchored default, slider-overridable** (`§0.0`). True position/scale by default; Hero sliders adjust for framing.
- **Stay on PBR / patched-stock materials** to keep the free lighting + dodge log-depth. Raw ShaderMaterial only as a last resort, with the full log-depth ceremony.
- **The mountain is NOT in-hood terrain.** It does not route through `bake-terrain.js` / the disc-clipped displacement field (which the Pour skips anyway). It's a backdrop prop beyond the neighborhood disc.

## Traps

- **Default `mist.density` will erase the range** (98% haze at 13 km). Author it down — this is the #1 "why does it look wrong" cause.
- **Don't reuse the terrain shader or the Arch's faux-lighting** — both are dead ends for a backdrop (scout §1/§2).
- **No dynamic shadows on it** (outside the ±900 m sun frustum) — rely on self-shading via normals; make sure the GLB has them.
- **Don't over-tessellate** — a distant backdrop can be aggressively decimated; 640 cols is likely already more than needed.

## Boundaries + discipline

- **Work in a git worktree off `curb-offset-draw`** (branch e.g. `altadena-mountain-hero`). Commit per phase.
- **Canonical docs are OFF-LIMITS** (`NEIGHBORHOOD-INPUTS.md`, `SLAB-CONTRACT.md`, `README.md`, etc.) — **Boz folds the canon on trunk** when this lands (the brought-GLB pipeline becoming real is a `§10` + `SLAB-CONTRACT` update Boz owns). Keep your running notes in a **"Build log" appended to THIS file** or a `scratch/` co-journal.
- **Surface scope drift immediately** (`feedback_baby_must_surface_scope_drift`) — especially if Phase 1's hero-pipeline build turns out bigger than a focused artifact+loader (it's greenfield; flag if it balloons).

## Definition of done

The San Gabriel range stands **due north of Altadena at its true bearing/scale**, **hazes atmospherically into the sky** (authored `mist`, per-TOD color), **takes the full TOD cycle** (alpenglow / blue dusk / moonlit night) on **native PBR materials**, carries **snow on the high peaks**, is **baked into the Altadena slab** (survives reload, ships), and **Jacob's eye passes** it across the day cycle. The brought-GLB hero pipeline (artifact + manifest + loader) exists as reusable machinery, modeled for the next prop.
