# Retired 2026-09-28 — the bark tier, the posterized substrate, the detail overlay

**Why:** every tree ships as an impostor, captured at authoring time, so the size-driven stand-ins
had nothing left to save; and they were the reason the trunk did not look like the chip (the
posterize halved its contrast; the detail overlay ran in linear space and multiplied albedo by
~0.43; the per-vertex UV fold drew most trunk triangles backwards). Jacob: *"this was designed for
smallness, and now we don't care because of the impostors"* · *"the trunks should have texture."*
Live replacement: `ARCHITECTURE.md §Bark is the photo, wrapped per fragment`.

Removed in code: `extract-bark-posterized.mjs`, `extract-bark-detail.mjs`, `posterize-defaults*.json`,
every `public/textures/bark/*/{posterized,detail}.png`, the `barkPosterizedBySpecies` /
`barkDetailBySpecies` records, `treeBarkTierUniform` + its drivers (`TierDriver`, the Salon
auto-bind, the Diorama pin, `window.__setBarkShaderTier`).

---

## From `arborist/ARCHITECTURE.md`

### View-aware bark tiering (Brief 10 — sub-phase A SHIPPED 2026-05-23 by Cork)

> ℹ️ **Disambiguation:** this is the **bark *shader* tier** (`uBarkShaderTier` / `TierDriver` / `computeTier`) — which fragment path a bark pixel takes, legitimately selected at runtime by camera. It is **NOT geometry-LOD.** Geometry is **role-at-bake** and never camera-swapped (the runtime `GeoTierDriver` is RETIRED — see §Tree-render reality at LS).

`project_view_aware_baking` applied to the bark surface. One uniform — `uBarkShaderTier` — selects the fragment path per bark fragment; same compiled program serves all tiers (Bloom-stable, single-program-doctrine preserved). Three tiers map to three view classes:

| Tier | Fragment work | Atlas inputs | Status |
|---|---|---|---|
| **0 — Aerial** | Brief 2.1 luminance gradient REPLACE; NO Brief 2.1a detail Overlay composite | gradient LUT + bark color | shipped (10A) |
| **1 — Hero** | Brief 2.1 luminance-gradient REPLACE + Brief 2.1a detail Overlay composite | gradient LUT + bark color + bark detail | shipped (10A — current default) |
| **2 — Street** | Full vendor PBR (color + normal + roughness + optional displacement) | gradient LUT + bark color + bark roughness/displacement | falls back to tier 1 until 10C |

**Tier uniform shape (locked sub-phase A).** `treeBarkTierUniform` lives at module scope in `treeAtlasMaterial.js` (mirrors `treeSwayUniforms`); every mounted tree material — LS runtime and Salon preview — shares the same `value`, so flipping it once propagates everywhere. Sub-phase A exposes a debug setter via `window.__setBarkShaderTier(n)`; sub-phase D adds the Salon tier-selector overlay; Brief 11 wires the cartograph SHOT driver. The uniform is the frozen seam.

**Sampling axis (post-review pivot 2026-05-23).** Aerial and hero share the same Brief 2.1 luminance sampling axis (`lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))`) plus the existing `uBarkGradientHashAmp` per-tree modulation on `jh4`. The original draft used a per-vertex normalized chassis-Y axis (`aBarkWorldYNorm`), which read camera-angle-dependent — Overhead vs Ground saw different gradient distributions because different portions of bark surface were visible per framing. Pivoting to luminance gives camera-independent sampling and reduces aerial-vs-hero divergence to one knob: **aerial skips the detail Overlay composite; hero (and street, until 10C) include it.** Encoded in the shader as `barkColor = mix(barkColor, composite, uBarkDetailStrength * step(0.5, uBarkShaderTier))`. No new per-vertex attributes shipped — `aBarkWorldYNorm` retired. The `project_runtime_merge_vertex_attributes` slot (Sough's `aWindTier` precedent) stays load-bearing for any future per-vertex-only consumer (10C displacement is a candidate if vendor packs ship per-vertex displacement gates).

**Salon preset cameras (Brief 13 Vantage, 2026-05-23, refined same session).** Verifying tier work requires viewing the chassis at the camera distance the tier was designed for AND having the matching tier active. `SpecimenViewport.jsx` carries two preset framings (`presetFraming(preset, treeH)`): **Overhead** (`{distance: 0, height: treeH+20, lookAtY: 0, topDown: true}` — literal top-down plan view, camera directly above the trunk axis looking at origin) and **Ground** (`studioFraming` forwarded, `topDown: false`). The camera-state ref contract gained optional `lookAtY` and `topDown` fields; `DollyCam.useFrame` swaps `camera.up` to `(0,0,-1)` while topDown to avoid the +Y-look-direction gimbal singularity, then restores `(0,1,0)` for Ground. In topDown the wheel routes to `height` (altitude) instead of `distance` so wheel-zoom does the intuitive plan-view thing.

The tier auto-binds from the same `useFrame` loop: `topDown` → tier 0; else `distance < 20m` → tier 2 (street), `distance ≥ 20m` → tier 1 (hero). Threshold first-pass; tune by feel. The binding intentionally collapses what the original brief framed as separate Hero/Street preset buttons into a single Ground preset whose tier follows the operator's dolly — wheeling from 25m to 18m flips hero→street live. Cork's `window.__setBarkShaderTier(n)` now PINS the tier (sets `treeBarkTierPinned.value = true`, exported alongside `treeBarkTierUniform` from `treeAtlasMaterial.js`), suspending the auto-bind so the operator can verify cross-pairs like "street tier from the overhead camera"; `window.__releaseBarkShaderTier()` restores auto-bind.

**LS-runtime auto-bind (Brief 11 lightweight, Plumb 2026-05-23).** The same tier-write pattern is mounted in production as `TierDriver` in `src/components/InstancedTrees.jsx`, a sibling of `SwayDriver` inside `ParkPopulation`. Per-frame: `if (treeBarkTierPinned.value) return; const desired = computeTier(camera); if (treeBarkTierUniform.value !== desired) treeBarkTierUniform.value = desired`. Discriminating signal swapped from Salon's `distance-to-origin` to **camera altitude** (`camera.position.y`) because LS has no canonical origin — 745 placements scatter across a ~200m park. Thresholds calibrated against `Scene.jsx`'s `PRESETS`: `y > 150 → 0` (browse default y=600, range 50–4000), `y < 5 → 2` (street eyeHeight 1.73), else `1` (Hero y=55). Both surfaces share the same uniform + pin — pinning in Salon devtools sticks across LS frames and vice versa. The cartograph SHOT-driven per-Look tier authoring (operator authors "this SHOT uses tier X" in design.json) is the v2 follow-up; the lightweight runtime activation makes tier 0's per-fragment savings (skip detail Overlay sample) actually fire in production Browse views.

`H_MAX` 60→120 and `D_MAX` 150→300 stay even though Overhead no longer needs them (distance=0); Ground still benefits when the operator dollies out on a mature chassis. Generic studio-inspection distances; not cartograph SHOT imports — Salon stays helper-internal per `project_kit_helpers_pattern`.

**Identity-safe with no gradient bound.** When `uUseBarkGradient == 0`, both tiers use `legacyBark = diffuseColor.rgb * barkTint` as the substrate (Brief 2 fallback). Aerial just drops the detail composite on top of that substrate; hero keeps it. No black-bark failure mode.

**Posterized substrate swap (Brief 10B Vellum, 2026-05-23).** Under tier ≤ 1 (aerial + hero — v1.5 ship-path), `diffuseColor.rgb` is replaced with a sample from a fifth `barkPosterized` atlas sub-page BEFORE Brief 2.1's luminance math runs. Source: per-bark-ref median-cut palette-quantized PNG (`public/textures/bark/<ref>/posterized.png`, ~25 KB at 256² 16-color indexed; ~50× smaller than vendor `color.jpg`) produced by `arborist/extract-bark-posterized.mjs` — CLI + library entry-point with auto-trigger inside `bake-look.js` AND `salon-preview-atlas.js`, so a fresh checkout never needs a manual prereq. Posterized tile dedupes per-bark-ref (Brief 2.1a precedent); per-species emission rides on `barkPosterizedBySpecies[<species>] = { uvTransform, barkTileUV }` (same shape + species key as `barkDetailBySpecies`). Tier 2 (street) keeps vendor color via `step(1.5, uBarkShaderTier)`-gated mix — forward-compat with 10C street-PBR. Two new runtime uniforms `uBarkPosterizedTileOffset/Scale`; identity-safe when scale=0 (no slot bound, e.g. fresh-checkout fallback or species without `posterized.png`). `localUV` recovery from `vMapUv` lifted to the top of the bark fragment chunk so both the 10B substrate swap and Brief 2.1a's detail Overlay composite share one declaration. Why posterize: kit visual identity is illustrated not photoreal; gradient LUT indexing is sharper on discrete luminance buckets; aerial file-budget savings compound with Brief 11. Atlas growth at LS roster scale: +0.26 MB (5 bark refs after dedup at 7 species). Single shader program preserved (uniform-gated mix; no `customProgramCacheKey` change).

### Bark tile wrap is the open shader question (Phase B.2 — deferred)

The `fract`-inside-atlas wrap has unavoidable derivative discontinuity at wrap lines — narrow blurry stripes that "crawl" at close-up Hero. Proper fixes (one of):

1. **WebGL2 texture arrays** — one atlas layer per `materialRef`, `GL_REPEAT`, hardware tiling/mipmap/aniso. Single program preserved via layer-index uniform.
2. **Pre-tile in atlas at bake time** — bake-look composites N×M-tiled version into the atlas tile. Atlas footprint grows N×M for bark.
3. **Separate textures per species** — breaks Bloom's single-program constraint. Not viable.

Deferred until Phase C lands and bark-quality re-evaluation says the wrap-line crawl is the binding constraint. See `BACKLOG.md` Phase B.2.

---


---

## From `arborist/FEATURES.md`

**Bark Detail Texturing (Brief 2.1a, Cinder 2026-05-21):** an additive composite layer over whatever bark color path produces — single-tint, gradient-on, gradient-off all unaffected. Gaming-standard Overlay-blend technique (Unreal Detail Texture / Unity HDRP Detail Albedo). Pre-bake: `arborist/extract-bark-detail.mjs` runs once per bark library refresh — for each `public/textures/bark/<ref>/color.jpg`, applies sharp's Gaussian blur (σ=15px on 1024 source), subtracts blurred from original + centers on 0.5 grey, writes `detail.png` (greyscale, single-channel, ~700KB–1.2MB per ref, idempotent with mtime-touch on no-op). At bake: `bake-look.js` collects each roster species's primary bark `materialRef` (trunk wins for region-split), reads the matching `detail.png`, packs as a fourth `barkDetail` sub-atlas page inside `unifyAtlases` (same master PNG — no new sampler binding, Bloom-stable). Emits `trees-atlas.json#/barkDetailBySpecies[<species>] = { uvTransform, barkTileUV }` — the second field carries the species's primary bark tile bounds in unified-atlas space so the runtime can recover local-UV from `vMapUv` (which spans only the bark sub-region) before mapping into the detail tile. Runtime: five new uniforms on `treeAtlasMaterial` (`uBarkDetailTileOffset/Scale`, `uBarkDetailStrength` default 1.0, `uBarkTileOffset/Scale`); the fragment chunk runs the Overlay-blend `mix(2*ab, 1-2*(1-a)*(1-b), step(0.5, a))` on the FINAL bark color and mixes the composite back via `uBarkDetailStrength`, gated by `vBark` so leaf fragments pass through identity. Uniform-driven, single compiled program. `applyBarkUniforms` reads the per-species slot via URL→species; absent slot → identity (no detail bound). For region-split species (trunk + branch ref different), only trunk's detail composites — branch fragments receive trunk's detail map keyed against trunk's bark tile bounds, which is a known visual approximation pending Phase G detail-per-region work.

---

## From `arborist/BACKLOG.md` (the 2026-08-27 bark arc)

**1. TILING — `ARCHITECTURE §"Bark tile wrap is the open shader question (Phase B.2)"`, option 1:
WebGL2 texture arrays.** Everything here needs *"stitching to be a blasé operation"* and we do
not have it. The atlas is `ClampToEdge`; `RepeatWrapping` would wrap the whole sheet into
another species' tile; so `bake-look#transformUVs` folds tiling away with a per-vertex `frac()`.
⭐ **It also kills the tear for free** — most of a trunk's triangles straddle a repeat line and
run the texture backwards across the tile.
▶ `node checks/claims-atlas-uv-rect-survives-the-bake.mjs`
⛔ Option 3 (a texture per species) breaks Bloom's single-program constraint. Not viable.


**3. VECTOR COLOUR** — the new work. Today's posterize is an indexed PNG: quantised raster, not
resolution-independent. `extract-bark-posterized.mjs` is the producer to grow, not replace.
⚠️ **This inverts a LOOK decision, not just a budget.** Today `treeBarkTierUniform` sends
street (<20 m) → tier 2 → **vendor bitmap**, hero/browse → tiers 0/1 → **posterized**, and the
comment records that as deliberate: the kit illustrated look far, PBR realism near. Jacob's
order is the reverse — stylised near, photographic far — because a vector does not degrade as
you walk up to it and a bitmap is least useful when minified. **Confirm the look intent when
this step starts; it is an artistic call, not a perf one.**


### What is already built — do not rebuild it
- **Posterize**: `arborist/extract-bark-posterized.mjs` (Brief 10B), bound for every composed
  species, and far smaller than the vendor bitmap it stands in for.
- **View-aware tiering**: `treeBarkTierUniform` + the tier gate in `treeAtlasMaterial`.
- **A detail-overlay slot**: `barkDetailBySpecies` — the grain half of the near tier already
  has a home.
▶ `node -e "const a=require('./public/baked/lafayette-square/trees-atlas.json');for(const k of ['barkBySpecies','barkPosterizedBySpecies','barkDetailBySpecies'])console.log(k,Object.keys(a[k]||{}).length)"`

