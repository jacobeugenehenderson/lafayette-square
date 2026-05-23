# Brief 2.1 — Bark Gradient Pivot to Per-Pixel Luminance + Detail Texturing Composite

You are the dispatched baby agent for **Brief 2.1: bark sampling-axis pivot + Detail Texturing composite**. Brief 2 (Holm, commit `646180c`) shipped multi-stop gradient bark with **per-instance hash** as the sampling axis — every tree got one ramp position via `jh4` hash, producing across-tree color variation. That was the wrong runtime interpretation of the operator's vision (coordinator spec-compression failure, see [[feedback_spec_compression]]). Operator's actual vision: **one bark substrate × N contrasty gradients = N species visual identities** (Sugar Maple warm-brown / Norway Maple cool-grey / Pin Oak dark-furrowed from the same texture).

Brief 2.1 pivots the sampling axis from per-instance hash to **per-pixel luminance**, AND adds a **Detail Texturing composite** layer using the standard real-time graphics convention (Unreal "Detail Texture" / Unity HDRP "Detail Albedo" — Overlay blend, bake-time high-pass extraction from the existing bark color photo).

Result: gradient supplies species color identity (low-frequency); detail overlay preserves the bark's textural realism (high-frequency); composite reads as authored species character with photoreal bark texture intact.

**Cold dispatch — fresh agent.** Holm's Brief 2 commit (`646180c`) is your baseline; you're modifying the runtime sampling logic + adding a detail-map atlas channel, not the infrastructure. **Name yourself** in your publishing notes.

## Read first

- `scratch/brief-2-bark-gradient-maps.md` — Holm's original brief (your baseline)
- `arborist/NOTES.md` — Olmsted session-end entry covering the spec-compression failure + Brief 2.1 plan + atlas-page-count pre-verification (already done — Holm packed LUTs inside the master atlas PNG, safe)
- Holm's commit `646180c` — the actual shipped code (run `git show 646180c --stat`)
- `arborist/ARCHITECTURE.md` "Bark shader unification" section (line 153) — the doctrine you operate within
- `arborist/ARCHITECTURE.md` "Phase F leaf-color architecture" section (line 382) — Brief 2.1 mirrors this pattern (luminance from sample → gradient LUT → output) plus adds the detail composite
- `src/components/treeAtlasMaterial.js` — focus on the fragment chunk Holm added around line 220 for the LUT sample (`vec2 lutUV = vec2(jh4, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset`)
- `src/components/InstancedTrees.jsx#applyBarkUniforms` — how Holm reads `barkGradientByVariant` from the manifest
- `arborist/bake-look.js` — focus on `compileGradientLUT` / `bakeGradientAtlas` / `unifyAtlases` (Holm extended unifyAtlases to a third `barkGradient` sub-page inside the same master PNG — you extend it to a fourth `barkDetail` sub-page following the same pattern)
- Memory (load-bearing): `feedback_spec_compression`, `feedback_unique_program_cache_key_before_wrappers`, `feedback_baby_must_surface_scope_drift`, `feedback_classifier_keyword_cross_check`, `project_writeifchanged_touches_mtime`

## Goal — and what this phase explicitly does NOT do

Three changes, ordered by likely-difficulty (do them in this order):

1. **Sampling-axis pivot.** Change the gradient LUT `t` source in the fragment shader from `jh4` (per-instance hash) to per-pixel luminance derived from the existing bark color sample. Within one tree, dark crevices and light ridges now sample DIFFERENT positions along the gradient — per-pixel color variation, gradient supplies the species-color identity.

2. **Detail Texturing composite.** Add a fourth sub-atlas region (`barkDetail`) to `unifyAtlases`. Pre-bake step extracts a high-pass detail map from each bark's existing `color.jpg` via `sharp`'s Gaussian-blur-subtract pattern, written to `public/textures/bark/<ref>/detail.png` (greyscale, centered on 0.5 grey). Fragment shader samples the detail map and composites with the gradient-derived base color using the standard **Overlay blend** (per Unreal/Unity HDRP convention).

3. **Output semantic change.** Holm's Brief 2 *multiplied* the PBR sample by the ramp color (modulation on top of photoreal color). Brief 2.1 *replaces* the bark color with the composite: `base = gradientSample(luminance(barkColor))`; `final = overlayBlend(base, detailSample)`. Normal + roughness PBR maps continue contributing per-pixel lighting; only the COLOR channel gets replaced. The photoreal-color path falls away when `uUseBarkGradient = 1`; legacy single-tint path stays intact when `uUseBarkGradient = 0`.

**Do NOT:**
- Redo the LUT bake pipeline (Holm shipped it; reuse intact — `compileGradientLUT` + `gradientSha1` + `bakeGradientAtlas` all stay)
- Redo the atlas tile packing for gradient LUTs (Holm's `unifyAtlases` extends — you ADD a fourth sub-page, don't rewrite the third)
- Redo the manifest schema (`barkGradientByVariant`) or the per-variant lift
- Redo the bark gradient editor UI (Holm shipped; reuse — minor label edits OK)
- Modify the LUT format
- Add a SEPARATE atlas texture / sampler binding for detail maps. The detail map packs into the SAME master `trees-atlas-color.png` as the 4th sub-page. Empirical fail mode if violated: **black squares flickering across screen with Bloom on** (operator-observed, 2026-05-21).
- Re-author the bark library to B&W (detail extracts from the existing `color.jpg` photos via bake-time high-pass)
- Add full PBR Street/TruHero view loading (Phase V territory, v1.6+)
- Add displacement-map sampling (related but deferred — Phase V Street/TruHero will use displacement)
- Add deformer rig (Brief 3) or camera-aware hemisphere cull (Brief 4)
- Modify `survey-deleaf.js`, `generate-procedural.js`, `LidarWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`
- Add per-Look gradient overrides via `scene.materialColors` (deferred Brief 2.5)

## Architecture

### Doctrine constraints — these are HARD

- **Single atlas, single bound texture.** Holm packed the gradient LUT into the existing master `trees-atlas-color.png` as a third sub-region inside the same PNG (Olmsted verified 2026-05-21 in `bake-look.js:328 unifyAtlases`). You extend to a fourth sub-region (`barkDetail`) inside the same master PNG. SAME texture binding. SAME `map` sampler. Empirical failure mode if violated: **black squares flickering across screen with Bloom on + multiple atlas pages bound** (operator-observed, 2026-05-21).
- **Single shader program.** Uniform-gated branches in the existing tree shader only — no sibling materials, no `customProgramCacheKey` divergence. Phase F leaf-color follows this pattern; you do too.
- **Bloom-stable.** Same uniform-driven branching constraint protects Bloom.

If your work would violate either, stop and surface — that's a redesign signal, not a tweak.

### Pre-bake step: detail map extraction

Per bark, generate `public/textures/bark/<ref>/detail.png` from `color.jpg` via `sharp` Gaussian-blur-subtract (standard high-pass extraction):

```js
// arborist/extract-bark-detail.mjs (new script, ~50 LOC)
import sharp from 'sharp'

async function extractDetail(colorPath, detailPath) {
  const color = sharp(colorPath).removeAlpha()
  const blurred = sharp(colorPath).removeAlpha().blur(15)  // sigma=15px for 1024-source bark; tune
  // High-pass = original - blur + 128 (centered on 0.5 grey)
  // Implement via composite with linear-burn-style blend, or pixel-math
  // See sharp.composite() with blend: 'difference' as a starting point
  await sharp({ /* 128 grey base */ })
    .composite([
      { input: await color.toBuffer(), blend: 'add' },
      { input: await blurred.toBuffer(), blend: 'subtract' },
    ])
    .greyscale()  // single-channel detail (high-freq content is luminance-only)
    .toFile(detailPath)
}
```

Run as a one-shot for the existing 5 barks during Brief 2.1 implementation. Idempotent (same color.jpg → same detail.png). The exact `sharp` API call to get clean high-pass output may require experimentation — try a few approaches; the right one produces a near-grey PNG with bark texture visible as light/dark deviations from 0.5 grey.

Per `project_writeifchanged_touches_mtime` — if you use `writeIfChanged`, touch mtime on no-op.

### Atlas packing: 4th sub-region

`bake-look.js#unifyAtlases` currently composites three sub-pages: bark + leaves + gradient. Extend to four: bark + leaves + gradient + detail. Each bark's `detail.png` becomes a tile in the new `barkDetail` sub-atlas, packed via the same skyline algorithm Holm used for `barkGradient`.

Emit `trees-atlas.json#/barkDetailBySpecies[<species>] = { uvTransform: { offsetU, offsetV, scaleU, scaleV } }` — same shape as `barkBySpecies`'s entry. (Detail is per-bark-ref, not per-variant, since multiple species using the same bark ref share its detail map — same dedup logic as bark color/normal tiles.)

`InstancedTrees.jsx#applyBarkUniforms` extension reads the per-bark-ref slot and sets two new uniforms (`uBarkDetailTileOffset`, `uBarkDetailTileScale`) per-draw. Don't worry about per-variant uniqueness for detail — detail is a property of the bark ref, not the composition.

### Runtime: Detail Texturing composite (Overlay blend, gaming-standard)

In `treeAtlasMaterial.js`, locate Holm's fragment chunk (line ~220) that computes the LUT sample. Replace the `t` source AND add the Overlay blend with the detail sample:

**Holm's Brief 2 (current):**
```glsl
float jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453);
vec2 lutUV = vec2(jh4, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset;
vec3 ramp = texture2D(uMap, lutUV).rgb;
barkColor *= ramp * 2.0;  // multiplicative tint on PBR color
```

**Brief 2.1:**
```glsl
// Per-pixel luminance from existing PBR bark color sample
float lum = dot(barkColor.rgb, vec3(0.299, 0.587, 0.114));

// Gradient supplies species color identity (low-frequency)
vec2 lutUV = vec2(lum, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset;
vec3 baseColor = texture2D(uMap, lutUV).rgb;

// Detail map supplies high-frequency bark realism
vec2 detailUV = vMapUv * uBarkDetailTileScale + uBarkDetailTileOffset;
vec3 detailSample = texture2D(uMap, detailUV).rgb;

// Overlay blend — gaming-standard detail composite (Unreal Detail Texture /
// Unity HDRP Detail Albedo). Energy-preserving, bidirectionally clamped.
vec3 lo = 2.0 * baseColor * detailSample;
vec3 hi = 1.0 - 2.0 * (1.0 - baseColor) * (1.0 - detailSample);
vec3 composite = mix(lo, hi, step(0.5, baseColor));

// Detail-strength uniform lets operator tune the effect intensity per-Look
barkColor = mix(baseColor, composite, uBarkDetailStrength);
```

Critical semantic notes:
- Holm's `barkColor *= ramp * 2.0` (multiplicative) is REPLACED by the composite. Brief 2.1 outputs the composite directly.
- The Overlay blend operates per-channel; detail is greyscale so each RGB channel sees the same overlay multiplier.
- `uBarkDetailStrength` is a new uniform (float, default 1.0, range 0.0–1.5). Operator-tunable later via per-Look; ships with hardcoded default in Brief 2.1.
- Per-instance hash (`jh4`) is REMOVED from the gradient `t` path. If we want cross-tree variation later, it rides as a secondary luminance offset (Brief 2.2+ candidate); Brief 2.1 ships pure per-pixel.

### New uniforms in `treeAtlasMaterial.js`

Three new uniforms added to the bark shader (in addition to Holm's three):

| Uniform | Source | Purpose |
|---|---|---|
| `uBarkDetailTileOffset` (vec2) | `applyBarkUniforms` from `barkDetailBySpecies[species].uvTransform` | UV offset of bark detail sub-region in master atlas |
| `uBarkDetailTileScale` (vec2) | same | UV scale of detail sub-region |
| `uBarkDetailStrength` (float) | hardcoded default `1.0`; per-Look in `scene.materialColors` later | Detail composite intensity 0–1.5 |

Holm's existing three (`uUseBarkGradient`, `uBarkGradientTileOffset`, `uBarkGradientTileScale`) stay. Same atlas, same `map` sampler — just more UV lookups into different regions of one texture.

### Editor UI label updates (small)

Holm's bark gradient editor copy says "per-instance variation." Update to reflect new semantic: gradient drives per-pixel species color, detail layer drives realism.

Suggested labels:
- "Use gradient" toggle (unchanged)
- Section heading: "Bark gradient (species character)"
- Helper text under ramp viz: "Crevices sample left side of ramp; ridges sample right side. Author contrasty gradients for distinct species identity."
- No structural UI changes; just copy edits.

### What does NOT change (reusing Holm's infrastructure)

- `composition.bark.gradientStops` schema
- `arborist/generate-salon.js#patchManifestForSalon` writing per-variant `gradientStops` into species manifest
- `bake-look.js` LUT bake + sha1 dedup + gradient atlas packing
- `trees-atlas.json#/barkGradientByVariant` shape
- Holm's three uniforms (`uUseBarkGradient`, `uBarkGradientTileOffset`, `uBarkGradientTileScale`)
- Gradient editor UI structure

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/extract-bark-detail.mjs` | new — one-shot high-pass detail extraction via `sharp` | ~60 |
| `public/textures/bark/<ref>/detail.png` × 5 | new (data, written by the script) | ~200KB each |
| `arborist/bake-look.js` | edit — `unifyAtlases` extension for 4th `barkDetail` sub-page + `barkDetailBySpecies` emit in `trees-atlas.json` | +60 |
| `src/components/treeAtlasMaterial.js` | edit — 3 new uniforms + fragment composite (Overlay blend) replacing Holm's multiplicative ramp | +40, -10 |
| `src/components/InstancedTrees.jsx` | edit — `applyBarkUniforms` reads `barkDetailBySpecies[species]` and sets the detail uniforms; `uBarkDetailStrength` hardcoded default | +20 |
| `src/arborist/SalonWorkstage.jsx` | edit — label copy update in BarkGradientEditor ("species character" framing) | +10, -5 |
| `arborist/FEATURES.md` | edit — Salon Bark section: per-pixel luminance + Detail Texturing semantics | +25 |
| `arborist/ARCHITECTURE.md` | edit — Bark shader unification section: add Detail Texturing composite to the doctrine | +15 |
| `arborist/BACKLOG.md` | edit — mark Brief 2.1 shipped; remove "operator-rejected" caveat from Brief 2 | +10, -5 |
| `arborist/NOTES.md` | edit — dated session-end entry under your name | +50 |

Total: ~270 new LOC, ~5 new data files (detail PNGs). ~0.5–1 baby day.

## Acceptance criteria

1. Same composition (chassis + bark + gradient) renders differently before vs after Brief 2.1: before = trees of one variant show across-tree tint variation; after = trees show per-pixel color variation within one tree (crevices read as bottom-of-ramp color, ridges read as top-of-ramp color)
2. Species disambiguation via gradient swap works: compose Sugar Maple with warm-brown gradient, compose Norway Maple with cool-grey gradient, compose Pin Oak with dark-furrowed gradient — all three use the same chassis + bark substrate, all three read as visually distinct species
3. Detail composite preserves bark realism: the high-frequency texture pattern of the bark photo is visible in the final render (close-up screenshot shows crevice/ridge micro-detail) even when the operator's gradient is a flat 2-stop wash
4. `uBarkDetailStrength = 0.0` produces pure gradient color (no detail overlay — verifies the strength uniform works)
5. `uBarkDetailStrength = 1.0` (default) produces visible detail overlay (verifies Overlay blend math is correct)
6. **Single shader program preserved** — verify via Stage perf-gauge `programs` count; must be unchanged vs before Brief 2.1
7. **Single atlas binding preserved** — `trees-atlas-color.png` contains all four sub-regions (bark + leaves + gradient + detail) in one PNG; no new texture files emitted under `public/baked/<look>/` for bark detail
8. Bloom-on rendering at LS Stage is stable — NO black square flickering (the empirical failure mode the single-atlas doctrine guards against; operator-observed 2026-05-21 with multiple atlas pages + Bloom)
9. Determinism: same composition + same gradient + same detail extraction → byte-identical published GLB sha1 + byte-identical `trees-atlas-color.png`
10. Back-compat: compositions without `gradientStops` render via legacy single-tint path unchanged
11. No regression on Brief 1 / 1.5a procedural / LiDAR / Grove flows (smoke-test each mode briefly)
12. Detail extraction is idempotent: re-running `extract-bark-detail.mjs` produces byte-identical detail PNGs

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file` — commit ONLY Brief 2.1 work
- Per `feedback_unique_program_cache_key_before_wrappers` — uniform-driven branch ONLY in existing shader; no new programs
- Single atlas binding preserved (THE load-bearing doctrine — Bloom black-flicker failure mode if violated). Detail map packs INSIDE the existing `trees-atlas-color.png`. Verify by inspecting the output PNG dimensions before vs after — they grow (= safe, more area inside one texture); no new texture files appear under `public/baked/<look>/`.
- Single shader program preserved (THE other load-bearing doctrine)
- Bloom stability preserved (single-program + single-atlas-binding implies single-program-per-Bloom-pass + single-texture-per-pass)
- Determinism preserved (same color.jpg → same detail.png; same composition → same final GLB sha1)
- Per `project_writeifchanged_touches_mtime` — touch mtime on no-op
- No modifications to LUT bake step, atlas packing for gradients (third sub-page), manifest schema, per-variant lift, editor UI structure — those are Holm's, reuse intact
- No modifications to `survey-deleaf.js`, `generate-procedural.js`, `publish-glb.js`, `bake-trees.js`, `LidarWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- **Sharp high-pass extraction technique** you used (operation chain, sigma value, output handling). Document in your NOTES entry so future babies don't re-derive.
- Whether all 5 existing bark refs produce usable detail maps. If any bark photo is too flat-lit / smooth-scanned to give meaningful high-pass content, surface — operator may want to substitute that bark or author B&W substrate later.
- Whether `gl_FragColor`'s sRGB vs linear handling needs adjustment given the new composite output semantic (Overlay blend in sRGB space vs linear — verify color path matches three.js expectations)
- Whether the Overlay blend's `step(0.5, baseColor)` branch produces visible banding artifacts at the 0.5 transition (per-channel branch can show as color shifts at midtones; if so, may want to use a smooth-overlay variant)
- Any visual regression on existing Brief 2 compositions you observe after the sampling-axis pivot (operator may want to re-author specific compositions)
- Atlas footprint growth from adding the detail sub-region — quantify (5 detail PNGs × ~200KB = ~1MB into the master atlas color PNG)
- Whether the `uBarkDetailStrength = 1.0` default produces good baseline visual; if not, suggest a different default (0.7? 0.5?) with rationale
- Any Bloom interaction concern at saturated gradient endpoints + detail overlay (could the Overlay's mid-saturation lift push bright stops into Bloom feedback?)

## Out of scope

- Per-Look gradient overrides via `scene.materialColors` (Brief 2.5)
- Per-Look detail-strength overrides (folds into Brief 2.5)
- Normal-derived luminance as alternative shape channel (Brief 2.2 if needed)
- B&W substrate re-author of bark library (deferred until needed)
- Per-instance hash as secondary luminance offset (Brief 2.2+ candidate)
- **Phase V — full PBR for Street/TruHero view** (v1.6 architectural addition; TruHero loads full PBR including displacement; background trees in Street view drop LoD + apply DoF blur. Brief 2.1's stylized output is the Hero/Browse path. Both architectures coexist via per-SHOT bake variants.)
- Displacement-map sampling
- Bokeh / DoF post-process (Cartograph-side rendering, not Arborist)
- Bark library size reduction (operator + coordinator parking)
- Bark gradient preset library
- Annual-cycle bark color shifts (Phase F)
- Deformer rig (Brief 3)
- Camera-aware hemisphere cull (Brief 4)
- Any work in `meteorologist/` or `cartograph/`
