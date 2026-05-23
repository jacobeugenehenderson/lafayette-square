# Update — Meteorologist Phase 4b.1 (Atmosphere raymarched shader)

**Branch:** `cartograph-looks-pass-ab`
**Commit:** `d1c66fe` — "meteorologist: Phase 4b.1 — Atmosphere raymarched shader (cumulus_humilis hardcoded)"
**Date:** 2026-05-20
**Status:** Code landed; visual verification in dev pending one camera retune (uncommitted).

## What shipped

`<Atmosphere />` v3 volumetric cloud shader replaces v1 `<CloudDome />` in `CanaryScene.jsx`. All five photoreal levers implemented per `HANDOFF-clouds-day3-clouddome-v2.md`:

1. Domain warping (3D FBM, single-pass warp, 4 octaves) → cauliflower lobes
2. Vertical density gradient (smoothstep floor/top) → flat-base cumulus
3. Three-tier lighting (density-gradient normal dotted with sun) → sun-side/body/shadow
4. Self-shadowing (6-step toward-sun march, exp falloff)
5. Silver lining (Mie forward-scatter, gated on view·sun + low local density)

All 13 authoring uniforms hardcoded to `cumulus_humilis` preset values. Sun direction + colors hardcoded to warm-noon default (Option A in brief). No preset binding yet — that's Phase 4b.2. `CloudDome.jsx` retained (Phase 4b.3 retires).

### Files

- **Created:** `src/components/Atmosphere.jsx`, `src/components/atmosphere-materials.js` (inline GLSL)
- **Modified:** `src/meteorologist/CanaryScene.jsx` (mount swap + header comment update; unused `CloudDome` import removed)

### Verification

- Vite dev clean (`/meteorologist` 200, Atmosphere module transforms without error)
- `npm run validate -- presets.json almanac.json` → `ok: 52 presets, 16 rules`
- Logdepth chunks + unique `customProgramCacheKey 'atmosphere-v3'` both in place
- Browser-side visual checklist (lever 1–5 + no popping) **awaits Jacob's eyeballs**

## Post-commit discovery

Phase 4a's `canaryCamera.js` framings **can't see the slab** at cumulus altitude (y=1200–1700m):
- Chamber tilts up ~53°; upper frustum edge ~70°; slab starts at ~73° → just above frame
- Ground is essentially horizontal → clouds nearly straight overhead, out of frame

**Retune drafted but uncommitted** (`src/meteorologist/canaryCamera.js`):
- Chamber: position `[0, 850, 1200]`, target `[0, 1450, 0]`, fov 50 — below-and-offset examiner view of the slab
- Ground: position `[-15, 1.7, 20]`, target `[0, 400, -100]`, fov 70 — eye-level upward gaze into the cumulus layer

### Surfaced tradeoff (in canaryCamera.js header comment)

**Tree + cloud cannot elegantly share one frame** at realistic cumulus altitude. An 8m hero tree at any normal camera distance subtends near-horizon elevation while a 1200m cumulus subtends ~85–89°. Fitting both requires fov > 110° (fisheye distortion).

Phase 4a's tree-anchored ground framing was designed before `<Atmosphere />` was wired to the real cumulus altitude. Two follow-up paths — neither in 4b.1's scope:
- **(a)** Lower the canary slab altitude for in-scene tuning (breaks physical accuracy, easier framing)
- **(b)** Replace Ground framing with a horizon-style view (camera elevated on a building) so tree + cloud compose naturally in a tilted forward gaze

Phase 4b.1's retuned Ground framing prioritizes cloud visibility; tree + ground plane mount but sit below the lower frame edge.

## Side-channel item (left alone)

Console warning seen during this session: `useCartographStore.js:1518 [skeleton] 17 legacy centerlines with operator intent have no skeleton match: ...`. Real data-drift diagnostic for 17 orphaned operator overrides; the warning is doing its job. Outside Phase 4b.1's scope. Recommended path: dedicated cartograph hygiene session — re-link, delete, or extend the matcher.

## Phase 4b.2 preview (per brief)

Replace the 13 hardcoded uniforms in `createAtmosphereMaterial()` with per-frame `resolveGroupAtMinute(activePreset.params[paramKey], currentMinute)` calls. Slider scrubs in Teacup's right rail visibly affect the viewport. Animated channels lerp between TOD keyframes as time scrubs. Atmosphere already accepts a `lookId` prop in anticipation.

## Memories consulted

- `feedback_raw_shadermaterial_needs_logdepth_chunks` (load-bearing — chunks included)
- `feedback_unique_program_cache_key_before_wrappers` (key set)
- `feedback_no_reference_image_hunting` (tuned by physics + verifiable checklist)
- `feedback_beautiful_first_lightweight_51` (24/6 step counts per brief; not cranked)
- `feedback_stash_isolate_per_file` (specific `git add` paths only; Jacob's other in-flight M files preserved)
- `feedback_baby_must_surface_scope_drift` (drifts disclosed in commit body + this note)
- `feedback_preview_uses_production_pipeline` (informed the mount-in-CanaryScene approach)
