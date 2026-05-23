# Brief 2.1a — Bark Detail Texturing Layer (tiny baby, ships tonight)

You are the dispatched baby agent for **bark detail texturing** — a focused scope cut from Brief 2.1. Brief 2 (Holm, commit `646180c`) shipped multi-stop gradient bark with per-instance hash sampling — visually it's losing the photographic detail from the existing bark PBR photos because Holm's per-instance tint multiply washes them out at LS render distances. Brief 2.1a fixes that by adding a **Detail Texturing composite layer** — the gaming-standard Overlay-blend technique used by Unreal's Detail Texture / Unity HDRP's Detail Albedo system. Extract high-pass detail from each existing `color.jpg` via `sharp`'s Gaussian-blur-subtract, pack as a 4th sub-region in the master atlas, fragment shader composites with the existing bark color path.

**Skips Brief 2.1's gradient sampling-axis pivot** (per-instance hash → per-pixel luminance). That can ship separately later if the operator wants it. Brief 2.1a is additive — it composites on top of WHATEVER the bark color path produces (single-tint, gradient-on, gradient-off all unaffected).

**Tiny baby, ~1.5 hours, cold dispatch.** Name yourself in your publishing notes.

## Read first

- `scratch/brief-2.1-bark-gradient-pivot-to-luminance.md` — the larger brief this scope-cuts from (you implement the detail-layer-only portion; ignore the gradient pivot sections)
- Holm's commit `646180c` — what's currently in the runtime
- `arborist/bake-look.js#unifyAtlases` (line ~328) — Holm extended this to 3 sub-pages (bark + leaves + barkGradient); you extend to 4 (+ barkDetail)
- `src/components/treeAtlasMaterial.js` — Holm's bark fragment chunk around line 220
- `src/components/InstancedTrees.jsx#applyBarkUniforms`
- Memory (LOAD-BEARING): `feedback_smallness_as_precondition`, `feedback_unique_program_cache_key_before_wrappers`, `feedback_baby_must_surface_scope_drift`, `project_writeifchanged_touches_mtime`, `feedback_spec_compression`

## Goal — and what this phase explicitly does NOT do

Add a bark Detail Texturing layer using the Overlay-blend technique. Three pieces:

1. **Bake-time extraction.** `arborist/extract-bark-detail.mjs` — one-shot script. For each bark dir in `public/textures/bark/<ref>/`, read `color.jpg`, apply `sharp`'s Gaussian blur (sigma ~15px for 1024-source bark), subtract blurred from original + center on 0.5 grey, write `detail.png` to the same dir. Greyscale single-channel output. Idempotent (re-run produces byte-identical output).

2. **Atlas packing.** Extend `bake-look.js#unifyAtlases` to a 4th sub-page: `barkDetail`. Pack each bark's `detail.png` into the same master `trees-atlas-color.png` (one new sub-region, NOT a new texture file). Emit `trees-atlas.json#/barkDetailBySpecies[<species>] = { uvTransform: { offsetU, offsetV, scaleU, scaleV } }` matching the `barkBySpecies` shape.

3. **Runtime composite.** Three new uniforms (`uBarkDetailTileOffset`, `uBarkDetailTileScale`, `uBarkDetailStrength`) on the shared `treeAtlasMaterial`. Fragment chunk samples the detail map and Overlay-blends with the existing bark color (whatever the current path produces). `applyBarkUniforms` reads `barkDetailBySpecies[species]` and sets the detail uniforms per-draw. `uBarkDetailStrength` hardcoded default 1.0.

**Do NOT:**
- Change the gradient sampling axis (Holm's `jh4` per-instance hash stays — Brief 2.1 pivot territory)
- Modify the bark gradient editor UI in Salon
- Modify the gradient LUT bake, atlas page packing for gradients (3rd sub-page), or manifest shape for gradients
- Add per-Look detail strength overrides via `scene.materialColors` (defer)
- Add a separate atlas texture / sampler binding for detail maps. Detail packs INSIDE the existing `trees-atlas-color.png` as the 4th sub-region. Empirical failure mode if violated: **black squares flickering across screen with Bloom on + multiple atlas pages bound** (operator-observed, 2026-05-21).
- Re-author the bark library (color.jpg files stay untouched — detail extracts from them, doesn't replace them)
- Touch leaf rendering, deformer rig, hemisphere cull, decimation, survey-deleaf, generate-procedural, LiDAR, Workstage modes
- Add UI exposure of `uBarkDetailStrength` (hardcoded uniform for tonight; UI exposure is v1.6)

## Architecture

### Doctrine constraints (per `feedback_smallness_as_precondition`)

- **Niceness pillar.** This brief is pure niceness — adds photographic bark detail to the current washed-out path. Acceptance criteria require visual diff (before/after at LS Hero distance).
- **Smallness pillar.** Atlas footprint grows by ~5 detail PNGs (~200KB each at greyscale single-channel) = ~1MB added to `trees-atlas-color.png`. ONE extra fragment sample per bark pixel. Cleverness payoff: photographic detail at near-zero perf cost. The trade is justified because the alternative (preserving the full color photo at every render) is much more expensive.
- **Single shader program preserved.** Uniform-gated additions to existing fragment chunk. No new program.
- **Single atlas binding preserved.** Detail packs into existing master PNG. Verify output PNG dimensions grow vs. new PNG files appearing.

### Pre-bake step: detail extraction

`arborist/extract-bark-detail.mjs`:

```js
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const BARK_DIR = 'public/textures/bark'
const SIGMA = 15  // tune by visual inspection; 15px on 1024 source is typical high-pass sigma

async function extractDetail(barkRef) {
  const colorPath = path.join(BARK_DIR, barkRef, 'color.jpg')
  const detailPath = path.join(BARK_DIR, barkRef, 'detail.png')

  // High-pass = original − blurred + 0.5 grey baseline
  // sharp's compose with blend modes: use 'difference' to get |orig − blur|;
  // OR pixel-math via raw buffers (clearer; recommend this path).
  const { data: origRaw, info } = await sharp(colorPath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: blurRaw } = await sharp(colorPath)
    .greyscale()
    .blur(SIGMA)
    .raw()
    .toBuffer({ resolveWithObject: true })

  // detail[i] = clamp(orig[i] − blur[i] + 128, 0, 255)
  const detailRaw = Buffer.alloc(origRaw.length)
  for (let i = 0; i < origRaw.length; i++) {
    detailRaw[i] = Math.max(0, Math.min(255, origRaw[i] - blurRaw[i] + 128))
  }

  await sharp(detailRaw, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toFile(detailPath)
}

async function main() {
  const refs = (await fs.readdir(BARK_DIR)).filter(d => d.startsWith('Bark'))
  for (const ref of refs) {
    await extractDetail(ref)
    console.log(`[detail] ${ref}/detail.png`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
```

CLI: `node arborist/extract-bark-detail.mjs`. Idempotent. Writes one `detail.png` per existing bark ref.

Per `project_writeifchanged_touches_mtime`: if you wrap in `writeIfChanged`, touch mtime on no-op.

### Atlas packing: 4th sub-region

In `bake-look.js#unifyAtlases`:

- Holm's signature: `unifyAtlases(bark, leaves, gradient, outDir, lookName)`
- New signature: `unifyAtlases(bark, leaves, gradient, detail, outDir, lookName)`
- Add `if (detail) pages.push({ kind: 'detail', src: detail, w: detail.width, h: detail.height })`
- After skyline pack: `placedDetail` carries its UV offset/scale
- Emit `barkDetailBySpecies[<species>] = { uvTransform: { offsetU, offsetV, scaleU, scaleV } }` from `placedDetail` info

Detail is per-bark-ref (not per-variant) — multiple species using the same bark ref share the detail map. Same dedup pattern as bark color/normal tiles.

Detail bakes into the SAME `trees-atlas-color.png` master PNG as bark + leaves + gradient. NO separate texture file. Confirm by checking the output: `trees-atlas-color.png` should grow in dimensions; no `trees-atlas-detail.png` should appear under `public/baked/<look>/`.

### Runtime: Overlay-blend composite

In `treeAtlasMaterial.js` (Holm's bark fragment chunk around line 220):

Locate where `barkColor` is currently set after Holm's gradient sample. Add this AFTER (so it composites on the FINAL bark color, whether gradient is on or off):

```glsl
// Detail Texturing composite — gaming-standard (Unreal Detail Texture /
// Unity HDRP Detail Albedo). Overlay blend on the existing bark color.
// Adds photographic high-frequency detail back over whatever the prior
// bark path produced (single-tint, gradient-on, or gradient-off all work).
vec2 detailUV = vMapUv * uBarkDetailTileScale + uBarkDetailTileOffset;
vec3 detailSample = texture2D(uMap, detailUV).rgb;

// Overlay blend: per-channel, energy-preserving, bidirectionally clamped.
vec3 lo = 2.0 * barkColor * detailSample;
vec3 hi = 1.0 - 2.0 * (1.0 - barkColor) * (1.0 - detailSample);
vec3 composite = mix(lo, hi, step(0.5, barkColor));

// Strength uniform lets operator tune (defaults to 1.0 = full detail)
barkColor = mix(barkColor, composite, uBarkDetailStrength);
```

Critical: this runs UNCONDITIONALLY when `uBarkDetailStrength > 0` and a detail uvTransform is bound. No `uUseBarkGradient`-style gate — detail is always-on, additive, layer over whatever else is happening. If you find yourself wanting a use-detail uniform gate, default it to 1.0 (always on); operator may tune off-per-Look later.

`vMapUv` already exists (Holm + earlier Phase B); use it as-is.

### New uniforms

| Uniform | Source | Purpose |
|---|---|---|
| `uBarkDetailTileOffset` (vec2) | `applyBarkUniforms` from `barkDetailBySpecies[species].uvTransform` | UV offset of detail sub-region in master atlas |
| `uBarkDetailTileScale` (vec2) | same | UV scale |
| `uBarkDetailStrength` (float) | hardcoded default `1.0`; per-Look override later | Detail composite intensity 0.0–1.5 |

In `InstancedTrees.jsx#applyBarkUniforms`, read the per-bark-ref slot from `barkDetailBySpecies` (resolved from the species's bark `ref` field — `Bark003` etc.) and set the offset/scale uniforms. `uBarkDetailStrength` ships at hardcoded default; no per-composition variation in 2.1a.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/extract-bark-detail.mjs` | new | ~50 |
| `public/textures/bark/<ref>/detail.png` × 5 | new (data, written by script) | ~200KB each |
| `arborist/bake-look.js` | edit — `unifyAtlases` extended to 4 sub-pages + `barkDetailBySpecies` emit | +50 |
| `src/components/treeAtlasMaterial.js` | edit — 3 new uniforms + Overlay composite fragment chunk | +30 |
| `src/components/InstancedTrees.jsx` | edit — `applyBarkUniforms` reads detail slot, sets uniforms | +15 |
| `arborist/FEATURES.md` | edit — Bark Detail Texturing layer mention | +15 |
| `arborist/NOTES.md` | edit — dated session-end entry under your name | +30 |

Total: ~190 new LOC + 5 detail PNGs. ~1.5 hours.

## Acceptance criteria

1. `node arborist/extract-bark-detail.mjs` runs cleanly; produces `detail.png` for all 5 existing barks
2. Re-running the script produces byte-identical detail PNGs (idempotent)
3. `node arborist/bake-look.js --look=lafayette-square` (or whichever the kit invokes) produces a `trees-atlas-color.png` that grew in dimensions vs. before; no new texture files appear in `public/baked/<look>/`
4. `trees-atlas.json` contains `barkDetailBySpecies` field with per-bark-ref uvTransforms
5. LS Stage renders trees with visibly more photographic bark detail than before — close-up screenshot shows crevice/ridge micro-detail visible on the bark surface
6. `uBarkDetailStrength = 0.0` (hardcoded test, revert before commit) reverts to no-detail look — verifies the strength uniform path works
7. `uBarkDetailStrength = 1.0` (default) shows visible detail composite
8. **Single shader program preserved** — verify via Stage perf-gauge `programs` count; must be unchanged
9. **Single atlas binding preserved** — only `trees-atlas-color.png` + `trees-atlas-normal.png` appear under `public/baked/<look>/` (the existing two files; not three or four)
10. Bloom-on rendering at LS Stage stable — NO black square flickering
11. Determinism: same color.jpg → same detail.png → same atlas PNG → same per-tree GLB sha1
12. Back-compat: compositions with Holm's gradient ON still work (detail composites on top of gradient color); compositions with gradient OFF still work (detail composites on top of single-tint color)
13. No regression on procedural / LiDAR / Grove flows

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file`
- Per `feedback_unique_program_cache_key_before_wrappers` — uniform-driven branch ONLY; no new programs
- **Single atlas binding** (the load-bearing doctrine — Bloom black-flicker if violated)
- **Single shader program** (the other load-bearing doctrine)
- Bloom stability preserved
- Determinism preserved
- Per `project_writeifchanged_touches_mtime` — touch mtime on no-op
- No modifications to gradient sampling axis, gradient editor UI, gradient LUT bake, gradient atlas packing, gradient manifest shape
- No modifications to `survey-deleaf.js`, `generate-procedural.js`, `generate-salon.js`, `publish-glb.js`, `bake-trees.js`, `LidarWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`, `SalonWorkstage.jsx`

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- The sharp high-pass technique you used (exact operation chain, sigma value, edge handling)
- Whether all 5 bark refs produce usable detail maps. If any bark photo is too flat-lit / smooth-scanned to give meaningful high-pass content, surface and suggest a sigma adjustment or note the bark needs operator replacement
- Whether `gl_FragColor`'s sRGB vs linear handling needed adjustment for the Overlay blend (sRGB space is standard for Overlay; flag if you observed otherwise)
- Whether the Overlay blend's `step(0.5, baseColor)` branch produced visible banding at the 0.5 transition (per-channel branch can show as color shifts at midtones; if so, suggest a smooth-overlay variant)
- Atlas footprint growth (quantified — actual MB delta on `trees-atlas-color.png`)
- Whether the `uBarkDetailStrength = 1.0` default produces visually-good baseline. If too strong, suggest a different default (0.7? 0.5?) with rationale
- Any Bloom interaction concern with saturated bark via Overlay-blend lift
- Whether `vMapUv` works directly for detail sampling, or whether the detail sub-region needs its own per-bark-ref UV transform (it shouldn't, but verify)

## Out of scope

- Gradient sampling-axis pivot (Brief 2.1 proper — defer)
- Per-Look detail strength overrides (defer)
- Gradient editor UI changes (defer)
- Camera-aware hemisphere cull (Brief 4)
- Deformer rig (Brief 3 → v1.5.5)
- Geometry decimation (separate brief)
- Phase V Street/TruHero (v1.6)
- Bark library size reduction (separate concern)
- Annual-cycle bark color shifts (Phase F)
- Any work in `meteorologist/` or `cartograph/`
