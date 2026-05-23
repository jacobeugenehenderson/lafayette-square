# Brief 2 — Bark Gradient Maps + Multi-Stop Tint Editor

You are the dispatched baby agent for **Bark Gradient Maps (Brief 2)**, the next code-side brief in the Salon arc. Brief 1 (Sequoia) stood up the Salon authoring surface; Brief 1.5a (Sequoia again) wired bark uniforms through `applyBarkUniforms` so single-color tints visibly drive output; Brief 1.5b (Quill) added chassis curation; Brief 1.5c (Riven) extended the de-leaf script for vendor bundles. The Salon pipeline now works end-to-end with single-color bark tints + per-instance scalar jitter.

Brief 2 elevates bark authoring from single-color to **multi-stop gradient maps** — operator authors a 2+ stop color ramp per composition; runtime samples that ramp per-instance via hash for natural per-tree bark variation. Combined with the film grade + Bloom already in the LS pipeline, this gets us photoreal-looking bark variety from procedurally-thin authored data.

**Cold dispatch — fresh agent.** Sequoia / Quill / Riven contexts are captured in their briefs + commits + NOTES entries. **Name yourself** in your publishing notes.

## Read first

- `scratch/brief-1-arborist-salon-standup.md` and `scratch/brief-1.5a-salon-completion.md` — Salon's data model + bark-plumbing baseline
- `scratch/brief-1.5b-salon-curation.md` and `scratch/brief-1.5c-bundle-aware-deleaf.md` — parallel arc shipped between Brief 1 and Brief 2
- `arborist/FEATURES.md` end-to-end
- `arborist/ARCHITECTURE.md` (publish-loop, master atlas + sha1 dedup, two-tier substitution)
- `arborist/NOTES.md` recent entries (Sequoia, Quill, Riven)
- `arborist/generate-salon.js` end-to-end (Sequoia's bark-binding step + Brief 1.5a's `patchManifestForSalon`)
- `arborist/bake-look.js` — focus on how `barkBySpecies` is composed from species manifests + how atlas tiles are packed
- `src/components/treeAtlasMaterial.js` end-to-end — the shared tree material; you will extend it carefully
- `src/components/InstancedTrees.jsx` `applyBarkUniforms` — the runtime entry point you'll extend
- `src/arborist/SalonWorkstage.jsx` — the Salon UI; you'll add the gradient editor to the Bark section of `SalonControlsPanel`
- Memory (load-bearing): `feedback_unique_program_cache_key_before_wrappers`, `feedback_effective_payload_layering`, `feedback_classifier_keyword_cross_check`, `feedback_raw_shadermaterial_needs_logdepth_chunks`, `feedback_baby_must_surface_scope_drift`, `project_writeifchanged_touches_mtime`

## Goal — and what this phase explicitly does NOT do

Replace per-composition single-tint bark with an authored multi-stop gradient ramp; sample per-instance at runtime via hash.

Behavior per composition:
- Operator authors a 2+ stop gradient (e.g., `[{t: 0, color: "#3a2820"}, {t: 0.5, color: "#5a3a28"}, {t: 1, color: "#8a6a48"}]`)
- Bake step compiles the ramp into a 256×1 RGBA LUT texture, packed into the per-Look master atlas as a new tile category
- Runtime: `applyBarkUniforms` binds the LUT; fragment shader samples it with per-instance hash as `t` (different instance → different position along the ramp)
- Existing single-tint bark continues to work (back-compat); compositions without `gradientStops` fall back to current `tintBase + tintJitterRange` behavior

**Do NOT:**
- Add leaf gradient tinting (Phase F — separate arc)
- Add deformer rig (Brief 3)
- Add camera-aware hemisphere cull (Brief 4)
- Address the inner-mesh-translation "lean" issue on single-tree chassis (deferred post-v1.5)
- Bring annual-cycle phenology (Phase F)
- Build a chassis preview thumbnail browser
- Modify `arborist/survey-deleaf.js`, `generate-procedural.js`, `LidarWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`
- Migrate existing single-tint compositions to gradient form (let operators upgrade them by re-authoring; back-compat carries the rest)
- Replace `tintBase` + `tintJitterRange`; both stay supported as the back-compat path

## Architecture

### Composition schema extension

`composition.bark` gains an optional `gradientStops` array:

```json
{
  "ref": "Bark007",
  "uvScale": [1.5, 4],
  "tintBase": "#3a2820",
  "tintJitterRange": 0.08,
  "roughnessOverride": 0.85,
  "gradientStops": [
    {"t": 0,    "color": "#3a2820"},
    {"t": 0.5,  "color": "#5a3a28"},
    {"t": 1,    "color": "#8a6a48"}
  ]
}
```

Semantics:
- `gradientStops` is OPTIONAL. Absent → use the existing single-tint path (`tintBase` × `tintJitterRange`).
- Present → ignore `tintBase` and `tintJitterRange` for runtime sampling; use the ramp instead.
- Minimum 2 stops if present. Operator UI enforces.
- `t` values in [0, 1]; stops need not be evenly spaced.
- Colors interpolate linearly in sRGB (matches three.js's `LinearToSRGB` path — verify against the existing `applyBarkUniforms` color space).

`effective` layering per `feedback_effective_payload_layering`:
- DEFAULTS → CHASSIS_DEFAULTS → operator overlay
- gradientStops absent at every layer = fallback to single-tint

### Bake-time: gradient → LUT texture

`arborist/generate-salon.js` extension (or its `patchManifestForSalon` helper):
- For each composition that carries `gradientStops`, compile a 256×1 RGBA buffer by sampling the ramp at 256 evenly-spaced positions in [0, 1]
- Linear interpolation between stops; values outside the authored range clamp to nearest stop
- Embed in the GLB OR write as a sidecar PNG that `bake-look.js` packs into the master atlas

**Recommended approach: master-atlas tile.** Extend `bake-look.js` to recognize a new tile category `barkGradient` alongside `bark` and `leaf`. Each composition with `gradientStops` contributes one 256×1 tile to the atlas. sha1 dedup collapses identical ramps across compositions/species (per the existing Phase B atlas-dedup pattern in `ARCHITECTURE.md`).

Per-Look `trees-atlas.json` gains `barkGradientBySpecies[<species>].<variant> = { uvOffset, uvScale }` pointing at the LUT tile in the master atlas.

### Runtime: extend `applyBarkUniforms`

Three new uniforms on the shared `treeAtlasMaterial`:
- `uBarkGradientLut` — sampler2D for the master atlas (same texture object as `uMap`; LUT tiles live in the atlas)
- `uBarkGradientTileOffset` (vec2) — atlas UV offset of the species's LUT tile
- `uBarkGradientTileScale` (vec2) — atlas UV scale of the species's LUT tile
- `uUseBarkGradient` (bool / float gate) — 1.0 if this composition uses gradient, 0.0 if single-tint fallback

`InstancedTrees.jsx#applyBarkUniforms` reads the manifest's `barkGradientBySpecies` entry and sets these uniforms per-draw.

### Runtime: shader extension

In `treeAtlasMaterial.js`'s fragment chunk (where the existing bark tint applies):

```glsl
if (vBark > 0.5) {
  vec3 barkColor = ...; // existing texture sample
  if (uUseBarkGradient > 0.5) {
    float t = fract(vInstanceHash * 7.123); // per-instance ramp position
    vec2 lutUV = vec2(t, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset;
    vec3 ramp = texture2D(uBarkGradientLut, lutUV).rgb;
    barkColor *= ramp * 2.0; // modulate; *2.0 keeps midtones near identity
  } else {
    // existing single-tint path: barkColor *= mix(tintBase, tintBase+jitter, hash)
  }
  diffuseColor.rgb = barkColor;
}
```

`vInstanceHash` is a per-instance varying derived from the existing per-instance hash plumbing (used by tintJitterRange today). Verify exact name in `treeAtlasMaterial.js`.

Per `feedback_unique_program_cache_key_before_wrappers`: this is a uniform-driven branch in an existing program, NOT a new shader variant. The `uUseBarkGradient` uniform gates the path. Single shader program preserved. **Verify by sampling Stage's perf-gauge programs count before/after a gradient publish — must be unchanged.**

### Salon UI: gradient editor

New section in `SalonControlsPanel`'s Bark section, BELOW the existing `Tint base` and `Tint jitter` rows:

- **Use gradient toggle** — checkbox. When OFF (default for new compositions), gradientStops cleared from disk on toggle-off; single-tint behavior. When ON, gradient editor shows + the existing single-tint rows go visually muted (still editable, but a hint says "Gradient overrides at runtime").
- **Gradient ramp visualization** — horizontal bar showing the current ramp (CSS linear-gradient from stops). ~32px tall, full row width.
- **Stop list** — vertical list below the ramp visualization. Each stop row: drag handle for `t` value (0–1 slider), color picker for `color`, delete button (disabled if only 2 stops remain).
- **+ Add stop** — button below the list. Inserts a new stop at the midpoint of the largest gap between existing stops, color interpolated from neighbors.
- All commits via `setSalonSlotParams({ bark: { gradientStops: [...] } })`. Pending text/color flushes on chassis switch per debounced-flush doctrine.

Persisted to `compositions.json` per the existing overlay-merge POST semantics.

### Back-compat

- Compositions without `gradientStops`: single-tint runtime path (current behavior, unchanged)
- Existing 1.5a-era compositions: continue to render as today; no migration needed
- Toggling gradient OFF in the UI on a composition that had gradientStops: clears the field on disk; back to single-tint
- Operator can toggle back ON; the UI preserves the most recently authored stops in component state (you author once, can disable/re-enable without re-authoring)

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/generate-salon.js` | edit (LUT compile + manifest emit) | +80 |
| `arborist/bake-look.js` | edit (new `barkGradient` tile category in master atlas) | +60 |
| `src/components/treeAtlasMaterial.js` | edit (new uniforms + fragment chunk extension; gate via `uUseBarkGradient`) | +50 |
| `src/components/InstancedTrees.jsx` | edit (`applyBarkUniforms` reads gradient slot from manifest, sets uniforms) | +30 |
| `src/arborist/SalonWorkstage.jsx` | edit (gradient editor block in Bark section of `SalonControlsPanel`) | +180 |
| `src/arborist/stores/useArboristStore.js` | edit (effective-layering accommodates gradientStops shape) | +20 |
| `arborist/FEATURES.md` | edit (gradient bark section + Bark panel description update) | +40 |
| `arborist/BACKLOG.md` | edit (mark Brief 2 shipped; sequence 3/4 ahead) | +20 |
| `arborist/NOTES.md` | edit (dated session-end entry under your name) | +40 |

Total: ~520 new LOC, 9 edited files. ~1.5 baby days.

## Acceptance criteria

1. Salon composition with authored 3-stop gradient (e.g., dark trunk → mid → light highlight) → tree renders that gradient visibly in Salon viewport AND in LS after Grove curation + bake
2. Per-instance variation: 5+ instances of the same Salon-published species in LS show visibly different bark positions along the ramp (hash-driven, deterministic)
3. Gradient stop editor: add stop, remove stop, drag t-value, change color — all persist to disk via overlay POST
4. Back-compat: existing 1.5a-era compositions (no gradientStops) render unchanged
5. Toggle gradient OFF → on-disk gradientStops cleared, runtime falls back to single-tint
6. Toggle gradient ON → reapplies most-recently-authored stops from local state OR loads from disk on mount
7. **Single shader program preserved** — verify via Stage perf-gauge programs count before/after gradient publish; must be unchanged (this is the load-bearing constraint per `feedback_unique_program_cache_key_before_wrappers`)
8. Determinism: same composition + same gradient → byte-identical published GLB sha1 across two runs
9. Master atlas sha1 dedup: two compositions with identical gradients pack to one LUT tile (verify via `trees-atlas.json` after publish)
10. No regression on Brief 1 / 1.5a procedural / LiDAR / Grove flows (smoke-test each mode briefly)

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file` — commit ONLY Brief 2 work
- Per `feedback_unique_program_cache_key_before_wrappers` — gradient path MUST be uniform-driven within the existing shader, NOT a sibling material variant. If you find yourself needing a new material clone, stop and surface — that's a redesign signal.
- Per `feedback_raw_shadermaterial_needs_logdepth_chunks` — if your shader extensions touch the depth path, preserve log-depth chunks
- Per `feedback_effective_payload_layering` — gradient field follows DEFAULTS → CHASSIS_DEFAULTS → overlay layering
- Per `feedback_classifier_keyword_cross_check` — if you add any new classification logic (e.g., "is this a gradient tile?"), grep for sibling classifiers before authoring keywords
- Per `project_writeifchanged_touches_mtime` — `writeIfChanged` MUST touch mtime on no-op branch
- Single shader program preserved (THE load-bearing constraint of this brief)
- Bloom stability preserved (single-program implies single-program-per-Bloom-pass)
- Determinism preserved
- No modifications to `survey-deleaf.js`, `generate-procedural.js`, `publish-glb.js`, `bake-trees.js`, `LidarWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`
- Back-compat: existing compositions render unchanged

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- Whether the per-instance hash you sampled for gradient `t` matches the hash already used for tintJitterRange (probably should; flag if it differs)
- Color-space handling — three.js gradient sampling can be subtle (sRGB vs linear); document which you used and why
- Master-atlas LUT tile packing: did you reuse `bake-look.js`'s existing tile-pack code path, or fork? Lean reuse.
- Atlas footprint growth from gradient LUT tiles (256×1 × N compositions); estimate at LS scale
- Any uniform-count concern on mobile GPUs (tree shader uniform count budget)
- Whether existing procedural compositions could also benefit from gradient bark (don't add; surface as future scope)
- Whether the gradient editor UX would benefit from preset ramps (e.g., "white birch" / "oak bark" / "maple bark") — don't add; surface as v1.6 candidate
- Sequoia's `applyBarkUniforms` plumbing — did you find any quirks you had to work around?
- Any Bloom interaction concern at saturated gradient endpoints (e.g., bright highlight ramping into Bloom-bloom feedback)

## Out of scope

- Leaf gradient tinting (Phase F)
- Per-instance bark UV scale jitter (single value today; v1.6 candidate)
- Per-Look palette override of gradient stops via `scene.materialColors` (would be the natural Brief 2.5; defer)
- Annual-cycle bark color shifts (Phase F annual-cycle architecture)
- Bark gradient presets library
- Deformer rig (Brief 3)
- Camera-aware hemisphere cull (Brief 4)
- Inner-mesh-translation lean fix (post-v1.5)
- Any work in `meteorologist/` or `cartograph/`
- Procedural-side gradient bark extension
