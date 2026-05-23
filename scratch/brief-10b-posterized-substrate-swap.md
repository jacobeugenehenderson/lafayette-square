# Brief 10B — Posterized bark substrate + tier-gated swap

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies in this project pattern-match heavily to names they see in NOTES.md / BACKLOG.md / code comments / commits and pick collisions; Jacob has had to redirect repeated misfires (Holm 2026-05-23 on a near-neighbor bark brief, Cambium same-day). Pattern-match risk on this brief is **very high** — it sits on top of Birch's Brief 2.1, Cinder's Brief 2.1a, Cork's Brief 10A, and Cambium's Brief 7. All four names will appear in adjacent code. **Do not reach for any of them.**

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel.** Anything — a word, a symbol, a string of sounds, something in another language, something invented, a non-plant noun, a mineral, a tool, a star name, a piece of weather, a body of water, an architectural term, a verb conjugation. The project has saturated the plant-adjacent namespace; reach further. State your name in your first message back; sign your commits with it.

---

## Why this brief exists

Brief 10A (Cork, post-review pivot 2026-05-23) shipped the **tier-selection seam** — `uBarkShaderTier` module-scope uniform, three tier values (0=aerial, 1=hero, 2=street), per-frame auto-binding from Salon's Ground/Overhead presets (Vantage's Brief 13). The architectural difference between aerial and hero today is one `step()` gate: aerial skips the Brief 2.1a detail Overlay composite; hero includes it. Both tiers sample the same vendor-color substrate as the substrate for Brief 2.1's luminance-driven gradient REPLACE.

**Operator-locked 2026-05-23: posterized is the substrate everywhere it doesn't hurt fidelity.** That means under tier ≤ 1 (aerial + hero, the v1.5 ship-path tiers), the substrate the Brief 2.1 luminance gradient REPLACE samples FROM should be a **posterized version of each bark ref's color texture**, not the photographic vendor color. Tier 2 (street, walking-distance v2 territory — 10C cooled) stays on vendor color for forward-compatibility with the future street-PBR work.

Why posterized:

1. **Style.** The kit's visual identity is posterized / illustrative, not photoreal. The current vendor PBR bark + Brief 2.1 gradient combination still reads as photographic at distance because the underlying substrate is photographic. Quantizing the substrate to N colors snaps the look toward the kit identity at Browse + Hero distance.
2. **File budget.** A posterized 256×256 tile is dramatically smaller than the 1024×1024 vendor color tile. Atlas grows ~1–2MB per bark ref vs current vendor-color path on disk; aerial's file-budget savings compound when paired with Brief 11's distance-driven tier swap (aerial-distance shots eventually sample ONLY the posterized tile, no vendor sample needed in that hot path).
3. **Gradient coherence.** Brief 2.1's gradient LUT samples at `lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))`. A posterized substrate has discrete luminance buckets → discrete gradient LUT positions → cleaner species-identity reads from the same N-stop ramp.

This brief is the substrate side. The shader pipeline downstream (gradient REPLACE, detail Overlay composite, tint, region-split, jitter) stays untouched — it operates on whatever `diffuseColor.rgb` arrives carrying, posterized or photographic.

## Read first

- `arborist/BACKLOG.md` — Brief 10 entry with sub-phases A/B/C/D + Brief 10A's shipped scope
- `arborist/NOTES.md` — Brief 10A entry (Cork's post-review pivot, the luminance-axis convergence) — load-bearing context for why tier ≤ 1 share substrate
- `arborist/ARCHITECTURE.md` — view-aware bark tiering subsection
- `arborist/extract-bark-detail.mjs` — the precedent. Brief 2.1a (Cinder) shipped per-bark-ref bake-time PNG preprocessing + atlas sub-page packing + per-species runtime uniform addressing. Your `extract-bark-posterized.mjs` mirrors this verbatim with one operation swap (Gaussian blur → palette quantization).
- `arborist/bake-look.js` — `unifyAtlases` (line ~397 signature) and `barkDetailBySpecies` precedent (lines ~958–981 + ~1006 export). Your fifth sub-page slots in alongside bark / leaves / gradient / detail.
- `arborist/salon-preview-atlas.js` — Salon preview's parallel atlas pipeline. Lines ~483–489 mirror `barkDetailBySpecies` for the preview-time per-composition atlas. **Per [[feedback_salon_preview_is_authoring_surface]] — load-bearing**: posterized must fire in Salon preview too, not just LS runtime. Otherwise operator iterates blind in the Salon and can't see what they'll get.
- `src/components/treeAtlasMaterial.js` — bark fragment chunk lines 378–457. Brief 10A's `step(0.5, uBarkShaderTier)` gate is the architectural shape your new gate follows. Brief 2.1's luminance computation is what samples FROM your new substrate.
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_salon_preview_is_authoring_surface]]`, `[[feedback_load_bearing_files_serial_dispatch]]`, `[[feedback_smallness_as_precondition]]`, `[[project_runtime_merge_vertex_attributes]]` (sibling pattern — uniform-driven, single program).

## Goal — and what this phase explicitly does NOT do

**Goal:** Under tier ≤ 1, the bark substrate that `<map_fragment>` produces is replaced (in the bark branch only, gated by `vBark`) with a posterized sample from a new atlas sub-page. Brief 2.1's luminance gradient REPLACE + Brief 2.1a's detail Overlay continue to work on the new substrate without modification. Tier 2 (street) reads vendor color via `<map_fragment>`'s default sample.

**Do NOT:**
- Touch Brief 2.1's gradient REPLACE math, Brief 2.1a's detail Overlay math, Brief 10A's tier-gating shape, or any tint / region-split / jitter logic. Your scope is the SUBSTRATE — what `diffuseColor.rgb` contains before the rest of the chain runs.
- Strip the vendor color tile from the atlas. 10C is cooled but not retired; vendor color stays packed for tier 2 + forward-compat. A future brief (call it 10E or "atlas-deadweight-strip") can prune it if Brief 11 confirms tier 2 is functionally never sampled.
- Modify leaf rendering. Posterization is bark-only. Leaves continue to read vendor color through `<map_fragment>` unchanged.
- Author per-species posterization parameters in the Salon UI. Posterization is a per-bark-ref bake-time preprocessing step; parameters live in a defaults JSON for now, no operator authoring UI in this brief. Operator-authoring is a follow-up if needed.
- Add new per-vertex attributes. Posterized substrate is a global-uniform + per-species-slot pattern (mirroring Brief 2.1a detail), not per-vertex.
- Touch `customProgramCacheKey`. Single shader program preserved per Bloom doctrine.

## Architecture

**Bake-time preprocessing (`arborist/extract-bark-posterized.mjs` — new, ~150 LOC):**

Mirrors `extract-bark-detail.mjs` byte-for-byte in shape:
- For each `public/textures/bark/<ref>/`, read `color.jpg`.
- Quantize to N colors via **median-cut palette reduction** with light dither (sharp supports this via `.png({ palette: true, colors: N, dither: ... })` — verify behavior in your inspection pass; if sharp's options don't expose dither strength cleanly, switch to a manual quantizer like `rgb-quant` and surface the choice).
- Write `posterized.png` alongside `color.jpg` + `normal.jpg` + `roughness.jpg` + `detail.png`.
- Same `writeIfChanged` + mtime-touch discipline per `[[project_writeifchanged_touches_mtime]]`.
- CLI: `node arborist/extract-bark-posterized.mjs` (no args; iterates all bark refs).
- **Library entry-point in addition to CLI**: export a `posterizeBarkRef(ref)` function so `bake-look.js` can call it during the auto-trigger flow (next paragraph).

**Auto-trigger as part of the invisible bake flow (operator-locked 2026-05-23):**

Don't make the extract a manual CLI prereq. `bake-look.js` (or wherever it walks the bark-ref roster — locate the right hook in your inspection) should, for each unique bark ref it encounters, check if `posterized.png` exists; if not, fire `posterizeBarkRef(ref)` before `unifyAtlases` runs. Idempotent — re-bakes don't re-quantize. First bake per new ref adds ~1-3s of preprocessing; subsequent bakes are zero-latency. Manual CLI remains useful for forcing re-quantization (e.g., after tuning `posterize-defaults.json#perBarkRef`), so keep both code paths live.

**Sibling pattern reminder**: `extract-bark-detail.mjs` (Brief 2.1a) is also manual-only today. We're not retroactively converting detail extraction in this brief — but surface in your commit body that detail could follow the same auto-trigger pattern in a tiny follow-up. Don't ship that change in 10B (scope wall).

**Parameters (defaults JSON, ~30 LOC):**

New file `arborist/posterize-defaults.json`:
```json
{
  "colors": 32,
  "tileSize": 256,
  "ditherStrength": 0.5,
  "perBarkRef": {}
}
```

`colors` is the dominant dial. **32 is the first-pass default** (operator-locked 2026-05-23). Reasoning: the kit's mission for posterization is **texture sharing across many tree species** — distinct color palettes per bark ref still compose cleanly with Brief 2.1's gradient LUT at 32 colors, while the substrate snaps perceptibly away from photographic toward illustrated. Going lower (16, 8) is available via `perBarkRef` overrides if specific refs read too soft. The "32 colors looks like JPEG compression" risk only fires without dithering — with median-cut + light dither at `ditherStrength: 0.5`, the quantization reads as intentional illustration, not noise. `tileSize` defaults 256 (matches detail; smaller than vendor's 1024). `perBarkRef` is an empty map for future per-ref overrides; honored if present, ignored otherwise. Hand-authored format preserved per `[[feedback_json_stringify_loses_handauthored_format]]` — ship an immutable `posterize-defaults.defaults.json` sibling.

**Atlas packing (`bake-look.js#unifyAtlases` extension):**

Signature grows from `unifyAtlases(bark, leaves, gradient, detail, outDir, lookName)` to `unifyAtlases(bark, leaves, gradient, detail, posterized, outDir, lookName)`. The 5th argument is a list of `{ref, tilePath}` mirroring `detail`'s shape.

Per-ref tile placement: append posterized tiles to the atlas row layout after detail. Atlas grows ~1–2MB worst-case (operator-locked acceptance) — quantify in your survey. Sha1-dedup across refs that produce identical posterized tiles (e.g., if two refs use the same source bark photo at the same quantization level).

Per-species index in the output `trees-atlas.json`: `barkPosterizedBySpecies[species] = { uvTransform, barkTileUV }` — same shape as `barkDetailBySpecies`, same key (species, not ref) since per-species → bark-ref mapping is one-to-one at this stage.

**Runtime uniforms (`treeAtlasMaterial.js`):**

New uniforms (mirroring `uBarkDetailTileScale` / `uBarkDetailTileOffset` from 2.1a):
- `uBarkPosterizedTileScale: { value: new Vector2(0, 0) }` — identity-safe default; 0,0 means "no posterized slot bound, fall back to vendor."
- `uBarkPosterizedTileOffset: { value: new Vector2(0, 0) }`

Bind via `applyBarkUniforms` in `InstancedTrees.jsx` AND `SpecimenViewport.jsx`'s preview path, mirroring how `barkDetailBySpecies` flows today.

**Fragment shader change (`treeAtlasMaterial.js`, in the bark branch right after `<map_fragment>` runs):**

```glsl
// Brief 10B (your-name) — posterized substrate swap under tier ≤ 1.
// `<map_fragment>` populates diffuseColor with the vendor-color sample.
// Under tier 0+1, resample from the posterized sub-region at the same
// tile-local UV and replace diffuseColor.rgb before Brief 2.1's luminance
// math runs. Tier 2 (street, forward-compat with 10C) keeps vendor.
// Identity-safe when uBarkPosterizedTileScale = 0 (no slot bound).
vec2 postUV = (uBarkPosterizedTileScale.x > 0.0 && uBarkPosterizedTileScale.y > 0.0)
  ? (localUV * uBarkPosterizedTileScale + uBarkPosterizedTileOffset)
  : vec2(0.5);
vec3 posterizedSample = texture2D(map, postUV).rgb;
float useVendor = step(1.5, uBarkShaderTier); // tier 0+1 → 0 (posterized), tier 2 → 1 (vendor)
float havePosterized = step(0.001, uBarkPosterizedTileScale.x * uBarkPosterizedTileScale.y);
vec3 substrate = mix(posterizedSample, diffuseColor.rgb, max(useVendor, 1.0 - havePosterized));
diffuseColor.rgb = mix(diffuseColor.rgb, substrate, vBark); // bark branch only; leaves untouched
```

This goes IMMEDIATELY AFTER `#include <map_fragment>` and BEFORE Brief 2.1's luminance computation. `localUV` is computed by Brief 2.1a (line ~425); you'll need it before its current declaration. Either lift `localUV` computation earlier, or compute it twice — your call, surface in commit.

Cost: one extra `texture2D` per bark fragment when posterized is bound. Identity behavior when unbound. Single shader program preserved (uniform-gated mix, no `customProgramCacheKey`).

**Salon preview parity (`arborist/salon-preview-atlas.js` — load-bearing per [[feedback_salon_preview_is_authoring_surface]]):**

Mirror the `barkDetailBySpecies` block at lines ~483–489. The preview atlas must also pack the posterized tile for the active composition's bark ref AND emit `barkPosterizedBySpecies[PREVIEW_SPECIES]` in the output. Auto-trigger the extract from `salon-preview-atlas.js` too — if `posterized.png` is missing for the composition's bark ref when the preview atlas builds, fire `posterizeBarkRef(ref)` inline. Same pattern as `bake-look.js`'s auto-trigger. This way Salon preview and LS runtime share substrate identity from the very first cold-boot operator interaction.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/extract-bark-posterized.mjs` | NEW | +150 |
| `arborist/posterize-defaults.json` + `posterize-defaults.defaults.json` | NEW | +40 |
| `arborist/bake-look.js` | edit — `unifyAtlases` signature grows; 5th sub-page packed; `barkPosterizedBySpecies` index emitted | +80 |
| `arborist/salon-preview-atlas.js` | edit — `barkPosterizedBySpecies` block mirroring detail | +35 |
| `src/components/treeAtlasMaterial.js` | edit — 2 new uniforms; ~10-line posterized substrate swap chunk inserted into bark fragment | +30 |
| `src/components/InstancedTrees.jsx` | edit — `applyBarkUniforms` reads `barkPosterizedBySpecies[species]` + sets uniforms per draw | +15 |
| `src/arborist/SpecimenViewport.jsx` | edit — same `applyBarkUniforms` call site for preview path | +10 |
| `arborist/ARCHITECTURE.md` | edit — view-aware bark tiering subsection extended | +20 |
| `arborist/BACKLOG.md` | edit — mark 10B shipped | +5 |
| `arborist/NOTES.md` | edit — session entry | ~80 |
| `scratch/brief-10b-posterization-survey-<your-name>.md` | NEW — per-ref posterization parameters + atlas footprint deltas + visual notes | ~120 |

Estimated total: ~580 LOC, of which ~150 is the new preprocessing script and ~120 is the survey.

## Acceptance criteria

1. **Extract script + auto-trigger both work.** (a) `node arborist/extract-bark-posterized.mjs` writes `posterized.png` next to every `color.jpg` under `public/textures/bark/<ref>/`. Idempotent (second run produces no byte-level changes). (b) Delete `posterized.png` for one ref; run a bake; verify the extraction fires automatically + `posterized.png` reappears. (c) Re-run the bake; verify the auto-trigger no-ops (zero-latency for already-extracted refs). Quantify per-ref tile size in survey.
2. **Atlas packs the 5th sub-page.** Re-bake a Look (`node arborist/bake-look.js --look <id>` or via the Salon Re-publish path). `trees-atlas.json` carries `barkPosterizedBySpecies` per published species. `trees-atlas-color.png` grows by the posterized region; quantify in survey.
3. **Runtime swap fires.** With a tree in LS Hero (tier 1), bark reads as posterized — distinct quantized color bands visible at close-up. Brief 2.1's gradient REPLACE + Brief 2.1a's detail Overlay layer over the posterized substrate correctly (no broken composite).
4. **Aerial tier reads posterized too.** Salon Overhead preset (tier 0 via Vantage's Brief 13 auto-bind) shows posterized substrate. Operator-locked: posterized everywhere it doesn't hurt fidelity.
5. **Tier 2 forward-compat.** With `window.__setBarkShaderTier(2)` pinned via Cork's debug setter, bark reads vendor color via `<map_fragment>`. Brief 11 / future 10C have a clean substrate to wire street-PBR onto.
6. **Identity-safe when posterized unbound.** A composition whose bark ref doesn't yet have `posterized.png` (e.g., fresh checkout, extract script not run) falls back cleanly to vendor color. No black bark, no checkerboard, no console errors.
7. **Salon preview parity.** Identical visual readout in Salon's `SpecimenViewport` and LS runtime for the same composition. Operator can author against the real result.
8. **Single shader program.** PerfGauge `programs` HUD count unchanged across tier values 0/1/2 and posterized-bound-vs-unbound states.
9. **No leaf regression.** Leaf rendering byte-identical pre-10B vs post-10B (visual diff via Salon's existing chassis renderings).
10. **Bake determinism.** Same input bark refs + same `posterize-defaults.json` → byte-identical `posterized.png` outputs across two runs. Sha1 verify in survey.
11. **Per [[feedback_smallness_as_precondition]].** Net atlas-byte delta + posterized-tile sha1 dedup count + per-ref color-budget compression ratio surfaced in survey. Perf measured, not asserted.

## Composition with in-flight work

- **Brief 6.2 (Adze)** — orthogonal. 6.2 touches `decimate-tree.mjs` + `publish-glb.js` + new `atlas-kind-classifier.js`. 10B touches different files at a different bake stage. **Serial dispatch**: 10B starts after Adze's commit lands per `[[feedback_load_bearing_files_serial_dispatch]]` (both write atlas output paths, even if file surfaces don't overlap). Confirm with Boz before commit if Adze hasn't shipped.
- **Brief 11 lightweight** (queued — distance-driven tier swap in `InstancedTrees.jsx`) — composes naturally with 10B. Once both ship, aerial-distance LS shots see posterized + no detail composite; close-up Hero shots see posterized + detail. Brief 11 has nothing to swap *into* if 10B doesn't land; 10B is the perf-payload Brief 11 activates.
- **Brief 3 (deformer rig, queued)** — orthogonal. Vertex-shader displacement; 10B is fragment-shader substrate. No file overlap.
- **Brief 17 (per-species bottom-cut, queued)** — orthogonal. Geometry crop; 10B is fragment-side.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`, watch for and disclose in your commit body:

- **Posterization algorithm behavior.** sharp's `.png({ palette: true, colors: N })` produces an indexed PNG. The atlas pipeline may not handle indexed PNGs — verify your output composites correctly with sharp's `.composite()` calls in `unifyAtlases`. If indexed mode breaks composite, switch to a manual quantizer (e.g., `rgb-quant` package) and surface the choice + library bump.
- **`localUV` computation order.** Brief 2.1a computes `localUV` mid-chunk; you need it earlier. Lift its declaration to the top of the shader-injected block, or compute it twice. Surface the choice.
- **Aerial-distance vendor-tile elision opportunity.** With Brief 11 lightweight planned to swap aerial → posterized at runtime, the vendor color tile becomes dead atlas weight for aerial shots. Don't strip it in 10B — but quantify the elision opportunity in the survey + flag for the future "atlas-deadweight-strip" brief.
- **Per-bark-ref color-count tuning.** Some bark refs (e.g., highly-detailed Sequoia ironbark) may need 32 colors; others (e.g., Birch white-bark) may look great at 8. Surface per-ref recommendations as `posterize-defaults.json#perBarkRef` overrides if you find them during inspection.
- **Detail composite over posterized substrate.** The detail Overlay (`step(vec3(0.5), barkColor)` branching) runs on `barkColor` which was sourced from posterized in tier 0+1. At low color counts, the detail Overlay may behave differently — surface visual anomalies.
- **Brief 10A's gradient hash amplitude `uBarkGradientHashAmp` interaction.** Gradient hash adds per-instance luminance offset; on a posterized substrate with discrete luminance buckets, the hash offset may push samples between buckets in a noisy way. Surface visual observations; may need a tier-aware hash-amp dial in a follow-up.
- **Auto-trigger latency on first publish.** First bake per new bark ref pays the posterization-extract cost (~1-3s). If aggregated across all ~10 bark refs on a cold-checkout's first bake, total added latency could be ~10-30s. Acceptable but worth measuring; surface actual numbers in the survey + flag if any single ref blows past 5s (would warrant a perf look at the quantizer config).
- **Atlas size guard.** Atlas grows ~1-2MB per bark ref. With ~10 bark refs, that's ~10-20MB atlas-byte growth. Worth a soft guard at `unifyAtlases` (warn-log if final atlas > 32MB). Surface the actual growth + recommend guard threshold.

## Out of scope

- **Street tier full PBR (10C)** — cooled to v2 walking-distance work. Tier 2 stays on vendor color (forward-compat); no roughness/displacement sub-pages added in 10B.
- **Salon preview tier selector overlay (10D)** — operator drives tier via Vantage's camera presets today; explicit selector deferred. If operator wants to test posterized substrate at tier 2 in Salon, they pin via `window.__setBarkShaderTier(2)`.
- **Operator-authored posterization parameters** — `posterize-defaults.json#perBarkRef` is empty for v1; values lived through your inspection survey only. Operator-authoring UI is a follow-up brief if useful.
- **LS runtime distance-driven tier swap (Brief 11 lightweight)** — separate brief, queued after 10B.
- **Per-Look palette override of posterized tiles** — out of scope; per-Look palette already overrides at the gradient LUT layer (`scene.materialColors`), substrate stays per-bark-ref.
- **Posterization for leaf textures** — bark-only. Leaves have their own authoring story (Brief 1.5e leaf pack library + Phase F gradient-tinting).
- **Backend serve.js / endpoint changes** — none. 10B is bake-time + runtime.

## Dispatch posture

Cold dispatch. Touches load-bearing files (`treeAtlasMaterial.js`, `bake-look.js#unifyAtlases`, `salon-preview-atlas.js`) — confirm Adze (Brief 6.2) has committed and pushed before you start, then stash-isolate. Single commit when AC 1-11 pass.

Per `[[feedback_salon_preview_is_authoring_surface]]`: do **not** ship 10B if Salon preview doesn't show posterized substrate. The operator iterates IN the Salon; effects invisible there are functionally undeployed. AC #7 is load-bearing.

— Boz
