# Arborist Notes

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Archival/append-only working notes — read at session start, flag mid-session contradictions, update at session end. Migrated 2026-05-18 out of `cartograph/NOTES.md` so tree-helper architecture lives with the tree helper. The kit-wide publish-loop pattern still lives in `cartograph/ARCHITECTURE.md` (Arborist mirrors it); this file holds the dated session-end architecture records specific to the Arborist.

---

## 2026-05-22 — Project: Brief 2.1a — Bark Detail Texturing Layer (baby Cinder)

**Tiny baby, additive over Holm's Brief 2 gradient bark. Bake-time high-pass extraction (`arborist/extract-bark-detail.mjs`) → atlas 4th sub-region inside `unifyAtlases` → fragment Overlay-blend composite on the FINAL bark color, gated by `vBark`. Five new uniforms, one extra `texture2D` per bark fragment, no new programs, no new sampler bindings. Detail keyed per-bark-ref, dedup-shared across species using the same ref.**

### What shipped

- **`arborist/extract-bark-detail.mjs`** (~80 LOC). Reads each `public/textures/bark/<ref>/color.jpg`, runs sharp greyscale + Gaussian blur at σ=15px on the 1024-source, computes `detail[i] = clamp(orig[i] − blur[i] + 128, 0, 255)`, writes single-channel `detail.png` sibling. Idempotent — byte-identical re-runs update mtime only (per `project_writeifchanged_touches_mtime`). All five bark refs (Bark003/004/007/012/015) produce visibly textured high-pass output.
- **`arborist/bake-look.js`** — new `bakeDetailAtlas(tiles, outDir, lookName)` mirrors `bakeGradientAtlas`'s shape but takes pre-existing PNG buffers + dims. `unifyAtlases` signature extended `(bark, leaves, gradient, detail, outDir, lookName)` — fourth sub-page packed via skyline alongside the others; greyscale detail composites into the SAME `trees-atlas-color.png` (no separate texture file). Orchestrator block walks roster species, resolves `manifest.bark.materialRef ?? bark.trunk.materialRef ?? bark.branch.materialRef`, dedupes by ref. Emits `barkDetailBySpecies[<species>] = { uvTransform, barkTileUV }` — the second field is the species's primary bark tile bounds in unified-atlas space (resolved from the unified tiles' `classification==='bark'` entries).
- **`src/components/treeAtlasMaterial.js`** — five new uniforms (`uBarkDetailTileOffset/Scale`, `uBarkDetailStrength`, `uBarkTileOffset/Scale`). Fragment chunk runs AFTER the existing gradient/tint mix to capture the FINAL bark color, recovers local-UV from `vMapUv` via `(vMapUv - uBarkTileOffset) / uBarkTileScale` (`fract`'d for safety), samples the detail sub-region, applies per-channel Overlay-blend `mix(2*ab, 1 - 2*(1-a)*(1-b), step(0.5, a))`, mixes back via `uBarkDetailStrength`. Final result mixes into `diffuseColor.rgb` via `vBark` so leaf fragments stay untouched. Identity-safe when `uBarkTileScale=0` (no slot bound — short-circuits to `vec2(0.5)` local-UV).
- **`src/components/InstancedTrees.jsx#applyBarkUniforms`** extended with `detailSlot` parameter; sets the four atlas-region uniforms when bound, zeros the scale uniforms otherwise. `barkDetailBySpecies` memo + URL→species resolution at draw-call assembly mirrors Holm's `gradientSlot` plumbing.

### Critical departure from the brief — surfaced for the operator

**The brief's shader formula `vec2 detailUV = vMapUv * uBarkDetailTileScale + uBarkDetailTileOffset` would have aliased to a single corner pixel of the detail tile.** Reason: `vMapUv` is atlas-rewritten UV (lives in the bark sub-region of the unified atlas, ~6% × 33% of full-atlas span for a typical bark tile in LS). Multiplying that tiny range by `detailScale` (~25% × 20%) produces a localized walk over the corner of the detail sub-region — visually the composite would be near-uniform grey (Overlay against ~0.5 is identity), invisible. The fix: pass the species's primary bark tile bounds as two additional uniforms (`uBarkTileOffset/Scale`) so the shader recovers `[0,1]` local-UV via `(vMapUv - uBarkTileOffset) / uBarkTileScale` before mapping into the detail tile. Two extra uniforms; the manifest grew `barkDetailBySpecies[<species>].barkTileUV` to carry them. Still one program, still no new sampler binding.

**Per `feedback_baby_must_surface_scope_drift`:**

- **Region-split species use trunk's detail.** `acer_saccharum_procedural` has `bark.trunk.materialRef=Bark007` + `bark.branch.materialRef=Bark003` — different physical bark refs. Brief says single set of uniforms, so I resolved to trunk's ref (visually dominant). Branch fragments composite trunk's detail keyed to trunk's tile bounds, which is a known approximation. Two follow-ups possible: (a) per-region detail uniforms `uBarkTrunkDetail/uBarkBranchDetail` mixed by `vBarkRegion` (matches Phase L Cycle 2 region split), or (b) emit a second detail entry per region. Defer until operator inspects acer_saccharum_procedural at LS.
- **Atlas footprint grew more than the brief estimated.** Brief said ~200KB per detail PNG = ~1MB added. Actual: greyscale high-pass content compresses poorly — individual detail PNGs are 690KB–1180KB on disk. Unified `trees-atlas-color.png` grew 14MB → 20MB (+6MB) at 4040×5176. Still cheap vs alternative ("preserve full color photo at every render"), but worth knowing for the per-Look budget.
- **`uBarkDetailStrength = 1.0` default is unverified visually.** I shipped the brief's recommended default since I can't run the dev server in this baby's scope. If LS Stage shows over-contrasty bark, dropping to 0.7 is a one-line change. Exposing as a per-Look slider is the v1.6 path the brief calls out.
- **sRGB-vs-linear blend operates in linear space.** The atlas texture is `SRGBColorSpace`-tagged so `texture2D(map, ...)` returns linearized values; Overlay-blend runs on linear values, which makes the midtone branch (`step(0.5, ...)`) land at linear 0.5 not sRGB 0.5. For a high-pass detail map this is fine (centered around 0.5 by construction so the branch transitions where the operator's "no detail" baseline lives), but the branch point is technically a tiny visual shift vs Photoshop's Overlay. If the operator wants Photoshop-parity, the fix is two `pow` calls (sRGB→linear before blend, linear→sRGB after) — measurable cost, defer until needed.
- **`step()` midtone branch — no banding observed.** Per-channel branch can show as color shifts at midtones; for greyscale detail × tinted bark, all three channels see the same `detailSample.rgb` (since detail is greyscale), and `barkColor` rarely sits exactly on 0.5 per channel. If banding shows up later, smooth-overlay variant `mix(ovLo, ovHi, smoothstep(0.45, 0.55, barkColor))` is the swap.
- **Bake-script wipe list now includes `trees-atlas-bark-detail-color.png`** so an empty-roster bake doesn't leave a stale intermediate behind.

### Acceptance criteria checklist

| # | Criterion | Status |
|---|---|---|
| 1 | extract script runs cleanly, produces 5 detail PNGs | ✅ |
| 2 | re-running produces byte-identical output | ✅ (sha1 verified, mtime-touch on no-op) |
| 3 | `trees-atlas-color.png` grew vs before; no new runtime-bound texture file | ✅ (14M → 20M, 4040×3121 → 4040×5176; intermediate `trees-atlas-bark-detail-color.png` mirrors Holm's gradient sub-page pattern) |
| 4 | `barkDetailBySpecies` in manifest | ✅ (6 entries: procedural_broadleaf/conifer/ornamental/columnar/weeping + acer_saccharum_procedural) |
| 5 | LS visible detail | **Not verified — needs operator eyeball** |
| 6 | `uBarkDetailStrength=0` reverts to no-detail | ✅ (the shader's final `mix(barkColor, composite, uBarkDetailStrength)` is identity at 0) |
| 7 | `=1.0` shows visible composite | **Needs operator eyeball** |
| 8 | Single shader program preserved | ✅ (uniform-driven branch only) |
| 9 | Single atlas binding | ✅ (still loads `colorPath` + `normalPath`; detail rides inside the color atlas) |
| 10 | Bloom-on stable, no black flicker | **Needs operator eyeball** |
| 11 | Determinism | ✅ (script idempotent; bake reads stable file inputs) |
| 12 | Back-compat (gradient on / off / single-tint) | ✅ (composite runs AFTER the existing mix; no path changed) |
| 13 | Procedural / LiDAR / Grove unchanged | ✅ (no edits to survey-deleaf, generate-procedural, lidar-publish, generate-salon, publish-glb) |

### Files touched

- `arborist/extract-bark-detail.mjs` (new, ~80 LOC)
- `public/textures/bark/Bark003,004,007,012,015/detail.png` (new, 690KB–1180KB each)
- `arborist/bake-look.js` (~+90 LOC — bakeDetailAtlas, unifyAtlases extension, orchestrator detail collection, manifest emission)
- `src/components/treeAtlasMaterial.js` (~+25 LOC — 5 uniforms + fragment chunk)
- `src/components/InstancedTrees.jsx` (~+25 LOC — applyBarkUniforms detailSlot param + prop drilling + memo)
- `arborist/FEATURES.md` (+1 paragraph)
- `arborist/NOTES.md` (this entry)

---

## 2026-05-22 — Project: Salon — leaf-attachment-tags bake (baby Sorrel)

**Dispatched as a Salon picker diagnostic; surfaced the picker was healthy (see "Picker diagnostic" below) and pivoted to the real operator-reported symptom: every chassis ships `leafAttachmentTags: []` (Whittle's spec), so `generate-salon.js#buildCompositionDocument` falls back to its sparse upper-bbox-vertex sampler (~5–10 anchors) — Salon compositions render visibly under-leafed. New bake script `arborist/derive-leaf-attachment-tags.mjs` walks all 159 chassis GLBs and writes real anchor positions to the paired `<name>.meta.json#leafAttachmentTags`. No generate-salon.js changes; the Phase D.1b leaf-cluster helpers do the right thing once attachment tags are populated.**

### Picker diagnostic (the part that fixed nothing)

Brief 1.5f opened with operator-reported "Salon picker isn't showing all of Fern's 10 packs." Static + curl trace ruled this out end-to-end:

- `public/textures/leaves/shapes/` has all 10 dirs each with valid 1024×1024 RGBA sRGB `shape.png` + populated `meta.json`. SHA1s all distinct.
- `listLeafPacks()` at `generate-salon.js:176` returns all 10 dir-kind packs plus the legacy flat fallbacks (20 entries total). Verified via direct module invocation AND `curl http://localhost:5173/api/arborist/salon/acer_saccharum/leaves` — the live dev server returns the full list.
- `serve.js#/salon/:species/leaves` (line 1073) is species-agnostic; the `:species` capture is unused. Per-species delta is zero.
- `SalonWorkstage.jsx:893` iterates `leafPacks.map(...)` with no filter — no morphology, no species, no binding-presence check. The brief's "picker filters by morphology and HIDES non-matches" hypothesis doesn't match the actual code (the chassis picker at line 720 DOES filter by morphology + approved status; the report probably conflated the two surfaces).
- `readLeafBytes()` (line 203) tries `shapes/<pack>/shape.png` first and succeeds for all 10. No silent fallback.

**Most likely explanation for the original report:** the operator's browser tab held a stale `salonLeafPacks` from before Fern's ship (the store fetches once at mount; a hard refresh would have shown the full 10). Bundling a "picker fix" would have been fabricating a code change against a non-existent code bug.

### Coordinate-space contract (load-bearing — documented in the script header + here)

Tags are stored in **raw mesh-space coordinates** (POSITION-accessor space), NOT world-space. Reason: the consumer at `generate-salon.js:570–593` adds leaf-card geometry as a new primitive to the chassis's existing mesh, which inherits the chassis node transform; storing in mesh-space means the chassis node transform applies to leaf POSITION accessors the same way it does to bark POSITION accessors, so leaves land at the world location of their anchor. Storing in world-space would require either (a) inverse-transforming inside `generate-salon.js` before writing accessor data (forbidden — brief said don't touch generate-salon), or (b) baking out the chassis node transform during chassis bake (forbidden — brief said don't touch survey-deleaf). The mesh-space contract is also what the existing `getUpperBboxSamples` fallback assumes, so the new authored path is contract-identical to the fallback.

**BUT — sampling "the top of the canopy" requires world-space awareness.** Vendor packs are inconsistent: some chassis are Y-up natively (mesh Y == world Y), others are Z-up with a 90° X rotation in the node transform (mesh Z == world Y). Bucketing by raw mesh-Y picks side-of-tree verts on rotated chassis, not canopy-top verts. So the script applies node world transforms internally: gathers `{meshCoord, worldCoord}` pairs per vertex, runs the upper-bbox + XZ-grid sampler in WORLD space, then stores the picked vertex's MESH coord.

**This was the v1 bug operator caught at spot-check:** `acer_saccharum_a` carries a (−0.707, 0, 0, 0.707) rotation (90° X) + (0.1, 0.1, 0.1) scale + (−9.9, 0.218, −19.22) translation, so v1 picked mesh-Y-max verts that land at world Y=−0.02 (ground level) instead of world Y≈9.5 (canopy top). Post-fix tags for `acer_saccharum_a` all land in world Y ∈ [5.74, 6.99] — correctly in the upper 40% of the chassis's [0, 9.54] world-Y bbox. **The same bug affects the pre-existing `getUpperBboxSamples` fallback in `generate-salon.js:387`** for all rotated chassis; that fallback path remains buggy after this commit (not in scope here; surface for a future micro-brief that either fixes the fallback in-place or simply removes it now that every chassis has authored tags).

**Future-baby note:** if you extend `leafAttachmentTags` (per-anchor weights, surface-normal hints, branch-shoot ids for Phase D.1b clustering), keep the position field in mesh-space. World-space metadata (e.g., a debug-only `worldYRange` summary in meta.json) can ride alongside, but the geometric coords must stay in the same space as the GLB POSITION accessor.

### What ships (Salon leaf-attachment-tags bake)

- **`arborist/derive-leaf-attachment-tags.mjs`** (~250 LOC). Walks `public/trees/_chassis/<name>.glb`, gathers wood-mesh `POSITION` accessors **with accumulated world transforms from the node hierarchy** (defensively: `atlasKind === 'bark'` or unset; ignores any future leaf primitives in chassis files). Computes world-space XZ centroid + Y bbox, subdivides the top `topYFrac` of the WORLD-space Y range into a `gridDensity × gridDensity` WORLD-space XZ grid, and per cell picks the vertex farthest from the trunk axis. Stores the picked vertex's **raw mesh-space** coords (see contract above). Cells with no wood verts produce no anchor — sparse-canopy species naturally end up with fewer anchors (per brief). Iterates in fixed `(ix, iz)` order for determinism. Falls back to identity transform on orphan-rooted meshes (Quill's `candicands_*` chassis have a bark node at root that isn't a child of any scene — caught + handled with a safety-net pass over meshes the node walker missed). Idempotent via `writeIfChanged` + mtime-touch (`project_writeifchanged_touches_mtime`). Run: `node arborist/derive-leaf-attachment-tags.mjs`.
- **`arborist/leaf-attachment-defaults.json`** + **`arborist/leaf-attachment-defaults.defaults.json`** (immutable backstop per `feedback_json_stringify_loses_hand-authored_format`). Live config schema: `{gridDensity, topYFrac, minAnchors, maxAnchors, densityMultiplier}`. Defaults: 8 / 0.6 / 30 / 250 / 1.0. `minAnchors` / `maxAnchors` are reporting thresholds (warning-level), not enforced clamps — the heuristic is "sparse-canopy meshes naturally produce fewer anchors" so a cypress legitimately gets <10.
- **159 × `public/trees/_chassis/<name>.meta.json`** — `leafAttachmentTags` populated. **Note: chassis dir is gitignored (`.gitignore:108`), so these edits don't enter the commit.** See "gitignore drift" below.

### Run report (159 chassis, default config G=8 / topYFrac=0.6)

- **All 159 chassis populated** — zero empties. Sequoia's fallback path stays as a defensive net (an empty array still triggers the bbox-sample fallback in `generate-salon.js:540`, per brief — though see "fallback also buggy" note above).
- **Anchor count**: min=1, **median=29**, max=59. Brief target was 50–200; with G=8 (64 cells max), only the densest high-poly chassis reach ~50. **Median 3–6× denser than the 5–10 sparse fallback baseline** — meaningful improvement in absolute terms, below the brief's stretch target. World-space sampling drops the median slightly vs. the (buggy) raw-mesh-Y version because off-axis side verts no longer get picked as "top of canopy" — counts now reflect actual upper-canopy density.
- **81 chassis below `minAnchors=30`** (warning-only). All are visually-sparse-by-design: `italian_cypress_*` (1–7 anchors, columnar low-poly), `*_low_poly_forest_*` (4–28, stylized low-poly), `flowering_peach_*`, `acer_saccharum_*` low-vertex variants. None are "broken" — the chassis genuinely has few upper-canopy world-space verts. Operator should treat as authored sparsity, not a heuristic failure.
- **Zero chassis above `maxAnchors=250`** (cap is far above what G=8 can produce).
- **Spot-verify (`acer_saccharum_a`)**: all 28 stored tags transform to world Y ∈ [5.74, 6.99], correctly in the upper 40% of the chassis's [0, 9.54] world-Y bbox. Pre-fix tags landed at world Y ≈ −0.02 (ground level).
- **Idempotency verified** — second run: 0 written, 159 unchanged (mtime touched).

### Surface — non-obvious things worth flagging (per `feedback_baby_must_surface_scope_drift`)

- **gitignore drift — load-bearing.** `public/trees/_chassis/` is gitignored (the dir is regenerable via `survey-deleaf.js`). My 159 `meta.json` edits **don't get committed** and will be **wiped on next `survey-deleaf` run** because `survey-deleaf.js:243,540` writes fresh `meta.json` with `leafAttachmentTags: []`. This is exactly the pattern Brief 1.5b solved for chassis curation (moved out to `arborist/state/_chassis-curation.json`). Two follow-up paths, operator's call:
  - **(a)** Hook `derive-leaf-attachment-tags.mjs` into the tail of `survey-deleaf.js#main()` — ~5 LOC. Tags get re-baked every survey. Cleanest for "tags belong to the regenerable chassis." Brief explicitly said "don't change chassis library files / don't run survey-deleaf" so I left this out.
  - **(b)** Move `leafAttachmentTags` out to a tracked sidecar at `arborist/state/_chassis-leaf-tags.json`, keyed by `<name>.glb` like the curation file. Survives `survey-deleaf`. Requires a tiny read in `generate-salon.js#buildCompositionDocument` to merge sidecar→meta — but the brief explicitly forbid modifying generate-salon.js, so this would be a follow-up brief.
  
  Either path is small. Today the working tree has the tags populated; until follow-up lands, **operator must re-run `node arborist/derive-leaf-attachment-tags.mjs` after any `survey-deleaf` run**.
- **`gridDensity=8` undershoots the brief's 50–200 anchor target.** Brief said "default 8"; operator confirmed 8 in the dispatch. Median came in at 29. Bumping to `gridDensity: 12` would push median into the 50–80 range (144-cell max) without changing behavior on sparse-canopy chassis. Surfaced for operator tuning rather than overriding the explicit default.
- **The existing `getUpperBboxSamples` fallback in `generate-salon.js:387` shares the v1 bug.** That function also buckets by raw mesh-Y, so for rotated chassis it samples side-of-tree verts that render at world ground-level. Out of scope for this brief, but the fix is identical to what this script does (apply node transforms before bucketing) OR delete the fallback now that every chassis has authored tags. Recommend the delete — defensive fallbacks that silently produce wrong-but-non-zero results are worse than ones that fail loud.
- **`densityMultiplier` < 1 trims tags by head-of-list slice** (deterministic given the fixed grid-iteration order). `> 1` is a no-op — we can't manufacture verts that don't exist. If the operator wants `> 1` to mean "sample multiple verts per cell", that's a heuristic extension; surfaced rather than implemented.
- **No `atlasKind === 'wood'`-style filter caught a chassis I had to skip.** All 159 chassis have only bark primitives (or untagged primitives, which I assume are bark per `generate-salon.js:497`'s same defensive rule). If a future chassis-decomposition pass ever leaves a non-bark primitive in the chassis GLB, my filter will skip it correctly.
- **`feedback_smallness_as_precondition`-style "niceness"**: this brief doesn't optimize; it just gives the emitter the data it should have always had. Sparse-canopy species stay sparse-canopy because the heuristic naturally produces fewer anchors where wood verts are scarce.
- **Memory drift** (carried from prior session): `project_baby_name_holm` says Holm is "claimed but unused"; commit `646180c` shipped Brief 2 under Holm. Memory is stale and should be removed.

### Constraints honored

- Touched only `<chassis>.meta.json` files in the chassis dir; no GLB edits, no survey-deleaf changes, no generate-salon.js changes.
- Idempotent (verified second-run).
- Determinism (fixed grid-iteration order, 4-decimal rounding).
- Picker path untouched — no fabricated fix for a non-existent bug.

---

## 2026-05-21 — Coordinator session-end (Olmsted) — Salon arc through Brief 2 + spec-compression lesson

**Coordinator: Olmsted. Six babies dispatched across one operator-day: Whittle (Brief 0, de-leaf survey), Sequoia (Brief 1 Salon stand-up + Brief 1.5a visible-quality completion), Quill (Brief 1.5b chassis curation), Riven (Brief 1.5c bundle-aware re-de-leaf), Fern (Brief 1.5e leaf pack library expansion), Holm (Brief 2 bark gradient maps). All six shipped working code; arc commits 286d748 (Whittle) → ee7d3bb (Sequoia 1 + 1.5a) → 6be8050 (Quill) → 70cbcf6 (Riven) → [Fern uncommitted at session end] → [Holm uncommitted at session end].**

**Arc summary.** Salon mode is alive end-to-end: 159 chassis (Whittle 141 + Riven 18 decomposed), 10 vendor leaf packs with Phase F-prep metadata sidecars (Fern), per-chassis rename + tri-state approval surface (Quill), bark plumbing through `applyBarkUniforms` with `qualityOverride: 4` + `syncLookRoster` closing the Salon→LS placement loop (Sequoia 1.5a). Brief 2 (Holm) shipped multi-stop gradient bark with per-instance hash sampling axis — **but the runtime architecture mis-matches operator vision** (see "spec compression" below). Brief 2.1 pivot is the next dispatch.

**Spec compression — the load-bearing coordinator failure.** Operator stated three times across the Salon arc that they wanted "B&W texture × multi-stop gradient" — per-pixel luminance-driven sampling for **species disambiguation via gradient swap** (one B&W substrate + N contrasty gradients = N species visual identities, e.g., Sugar Maple warm-brown / Norway Maple cool-grey / Pin Oak dark-furrowed all from the same texture). Olmsted translated this into the simpler "per-instance multiply: existing PBR bark × hash-driven single ramp position" because the simpler architecture seemed sufficient. Brief 2 inherited the mis-translation; Holm executed it faithfully; operator opened the result and flagged the wrong runtime interpretation. The doctrine is now codified in [[feedback_spec_compression]] memory: **operator metaphors carry architectural specification; the coordinator MUST surface the translation explicitly before dispatch when the operator's metaphor is richer than current kit conventions.** Cost: one baby cycle (Holm's ~520-LOC implementation) plus another half-cycle for Brief 2.1 pivot.

**Brief 2.1 — pending B-pivot.** Cheap path: compute `luminance = dot(barkColor.rgb, vec3(0.299, 0.587, 0.114))` from the existing PBR color sample at runtime; use as `t` into the gradient LUT. No bark library re-author needed. Per-instance hash can optionally ride as a secondary luminance-offset for cross-tree variation on top of B's per-pixel base. Holm's Brief 2 infrastructure (LUT bake, atlas tile category, manifest channel, editor UI, per-variant lift) all transfers; only the shader sampling axis changes. ~150 LOC delta, ~0.5 baby day. Cold dispatch.

**Architectural seams Holm caught.** Holm's pre-implementation decision pass surfaced two architectural seams the Brief 2 spec glossed over: (1) per-variant manifest lift on the gradient channel only (Sequoia's 1.5a `patchManifestForSalon` was first-composition-only; Brief 2 schema requires per-variant resolved by `variantId` from GLB URL); (2) atlas-survey-vs-bake-look path question (LUT artifacts aren't GLB-texture-bound, so Holm baked LUTs directly inside `bake-look.js` as a third sub-atlas page rather than threading through `surveyRoster`). Both seams transfer to Brief 2.1 unchanged.

**Catalog state at session end.** 159 chassis, 10 leaf packs, curation surface live, bark plumbing complete (single-tint working; gradient sampling axis pending B-pivot). Coverage gaps surfaced: ornamental morphology (improved by Riven decomposition but still partial), tail-of-roster species with no clean wood (Norway Spruce, Douglas Fir, Magnolia, Silver Birch, White Willow), broken-source GLBs (elderberry, spruce_corona, tree_variation, ulmus_americana).

**Sequence ahead.** Brief 2.1 → Brief 3 (deformer rig) → Brief 4 (camera-aware hemisphere cull). Brief 3 + 4 conflict with Brief 2.1's file surface so the sequence is serial.

**Sibling memory entries written this session:** [[feedback_spec_compression]], [[feedback_classifier_keyword_cross_check]], [[feedback_structural_heuristic_needs_sibling_check]].

---

## 2026-05-21 — Project: Salon — Brief 2 (Holm) — bark gradient maps + multi-stop tint editor

**Cold dispatch. Replaces per-composition single-tint bark with an authored multi-stop gradient ramp; runtime samples per-instance via hash so 5 instances of the same Salon-published variant land at 5 positions along the ramp. Authored at `composition.bark.gradientStops = [{t∈[0,1], color: "#RRGGBB"}, ...]` (≥2 stops); absent at every layer → existing single-tint runtime preserved end-to-end.**

**Architecture decisions (signed off pre-implementation):**

1. **Per-variant manifest lift on the gradient channel only.** Sequoia's 1.5a comment in `generate-salon.js#patchManifestForSalon` flagged that per-composition runtime variation needs runtime path changes "out of scope" for 1.5a. Brief 2 IS that lift, scoped narrowly: legacy `bark.{materialRef, uvScale, tintBase, tintJitterRange, roughnessOverride}` stays per-species (first-composition-wins per 1.5a); only `gradientStops` extends to `manifest.json#/variants[i].bark.gradientStops`. `InstancedTrees.jsx` gained a `urlToVariantId(url)` parser so `applyBarkUniforms` can key the gradient slot by `(species, variantId)` from the GLB path while preserving its existing per-species bark lookup.

2. **LUT integration outside `atlas-survey.js`.** Survey's sha1 dedup is keyed by GLB-bound (colorSha1, normalSha1); LUTs aren't bound to any GLB material. Cleanest path: `bake-look.js` reads `manifest.json#/variants[i].bark.gradientStops` directly in its `barkBySpecies` loop neighborhood, compiles 256×1 sRGB RGBA buffers via the new `compileGradientLUT` helper, sha1-dedups its own LUT buffers (`gradientSha1`), and packs them as a third `barkGradient` sub-atlas page via a new `bakeGradientAtlas` (mirrors `bakeAtlas`'s skyline + GUTTER + clamp-extend pattern). `unifyAtlases` extended to accept a third page; gradient tiles ride in a parallel `gradientTiles[]` field on the unified result so the GLB UV-rewriter's `lookupIdx` (keyed by `species|variantId|matName`) stays bark/leaf-only — LUT tiles aren't UV-bound. Manifest gains `barkGradientByVariant[species][variantId] = { offsetU, offsetV, scaleU, scaleV }`. Atlas grew from 4040×3112 → 4040×3121 with one smoke-test ramp (negligible footprint at LS scale).

3. **Per-instance hash for gradient `t` — fresh 4th channel, NOT reused from tintJitter.** `treeAtlasMaterial.js` has no `vInstanceHash` varying; what exists is `vWorldXZ` from the instance matrix translation column and three derived hashes `jh1/jh2/jh3 = fract(sin(dot(vWorldXZ.xz, vec2(K1, K2))) * 43758.5453)` feeding `tintJitter`. Brief asked whether gradient `t` should match — chose **uncorrelated**: `jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453)`. Reasoning: single-tint mode shifts hue around `tintBase`; gradient mode is the hue spread. Correlating them serves no design purpose and uncorrelated gives operator independent visual axes if a future composition ever combines the two.

4. **Color-space — sRGB stop interpolation, atlas-PNG sRGB-tagged, three.js linearizes at sample.** Author hex stops are sRGB; `compileGradientLUT` linearly interpolates between stops in sRGB byte space; PNG is loaded by `treeAtlasMaterial.js#loadTexture` with `colorSpace: SRGBColorSpace` (existing behavior); fragment shader receives linearized RGB and does `barkColor *= ramp * 2.0`. The `*2.0` bias keeps midtone stops near identity-multiplication against the bark texture's luminance, per the brief's pseudo-shader. Matches everything else in the atlas — no special handling needed.

**Files touched:**

- `arborist/bake-look.js` — `compileGradientLUT` + `gradientSha1` + `bakeGradientAtlas` helpers; per-variant gradient extraction loop; `unifyAtlases` extended to a third page; `barkGradientByVariant` emission; empty-roster wipe extended to `trees-atlas-bark-gradient-color.png`. +180 LOC.
- `src/components/treeAtlasMaterial.js` — 3 new uniforms (`uUseBarkGradient`, `uBarkGradientTileOffset/Scale`); fragment-chunk extension that samples the LUT from `map` and `mix`es gradient over legacy `barkTint` via `uUseBarkGradient`. +18 LOC. **Verified:** uniform-driven branch, not a sibling material; single shader program preserved. Log-depth chunks unaffected (`MeshStandardMaterial.onBeforeCompile` not raw ShaderMaterial — three.js handles its own log-depth machinery).
- `src/components/InstancedTrees.jsx` — `urlToVariantId(url)`; `applyBarkUniforms(material, barkSettings, gradientSlot)` extended with gradient reset/apply; `barkGradientByVariant` pass-through memo on the atlas manifest; per-draw `gradientSlot` resolution from `(species, variantId)` with string/number key fallback (manifest variantIds can come through as either). +30 LOC.
- `arborist/generate-salon.js` — `patchManifestForSalon` extended to walk compositions and write `variants[i].bark.gradientStops` (composition[i] → variantId i+1, matching publish-glb's emission order). Empty/<2-stop arrays clear the per-variant block (toggle-OFF semantics). +22 LOC.
- `src/arborist/SalonWorkstage.jsx` — new `BarkGradientEditor` (use-gradient toggle, CSS-`linear-gradient` ramp viz, per-stop t-slider via existing DraftSlider + color picker + delete button at 2-stop minimum, + Add stop at largest-gap midpoint with interpolated color, last-authored-stops stash ref); inserted into the Bark section below Roughness. +120 LOC.

**Smoke test before UI:** hand-authored `[{t:0,color:"#ff0000"},{t:0.5,color:"#00ff00"},{t:1,color:"#0000ff"}]` on `platanus_acerifolia` variant 6's manifest.json; ran `bake-look.js --look lafayette-square`; confirmed `trees-atlas-bark-gradient-color.png` (264×9 = 256+gutter) exists; `trees-atlas.json#/barkGradientByVariant.platanus_acerifolia["6"]` populated with `{offsetU: 0.00099, offsetV: 0.998, scaleU: 0.0634, scaleV: 0.00032}` (math checks against atlas dims). Reverted after; chassis-dir + state-dir are gitignored. The runtime path (LS Stage render) was not exercised in-browser this session — operator will verify via Salon → Adopt → Re-publish → Grove → LS reload.

**Surface — non-obvious things worth flagging per `feedback_baby_must_surface_scope_drift`:**

- **Per-instance hash channel for `t` is uncorrelated with tintJitter** (jh4 vs jh1/jh2/jh3) — see decision (3) above. Brief said "probably matches"; I went the other direction. Easy to flip later by switching `vec2(521.7, 233.1)` → `vec2(127.1, 311.7)` if you'd rather have them covary.
- **Existing `_test_salon` ghost reference in pre-Brief-2 `trees-atlas.json#/barkBySpecies` had no on-disk species dir** — pre-existing dirt, not Holm's. roster dropped from 31 → 30 after the smoke-test rebake silently skipped it. Worth a cleanup pass at some point but unrelated to Brief 2.
- **The shader's `<map_fragment>` extension now contains both legacy `barkTint` AND `gradientTint`** computation paths every frame, selected via `mix(...)`. The cost is two `texture2D` samples (the existing one inside `<map_fragment>` plus the new LUT sample) instead of one — but the LUT sample lives in the same `map` so no cache line miss vs sampling a separate atlas. Negligible at LS draw counts.
- **`barkGradientByVariant` keys: variantId can come through as integer or string** depending on which publish path wrote the manifest (lidar publishes use int, salon uses int via `publish-glb.js i+1`). InstancedTrees resolves both via `[species]?.[variantId] || [species]?.[Number(variantId)]`. If you see a gradient go un-applied at runtime, suspect this coercion edge first.
- **Per-Look palette override of stops via `scene.materialColors`** is the natural Brief 2.5 (a Look that recolors compositions without re-publishing). Deferred per brief.
- **Gradient preset library** ("white birch", "oak bark", etc.) is a v1.6 candidate per brief. Defer.
- **Procedural compositions could also benefit from gradient bark.** Today `generate-procedural.js` writes `manifest.bark` per-species without per-variant slots. Extending to per-variant gradient would mirror this brief's pattern; not done — brief explicitly excluded procedural-side.
- **Bloom interaction at saturated gradient endpoints:** untested in-session. A `#ffffff` endpoint × `*2.0` bias × bright bark texture luminance could push past Bloom's threshold. If operator authors highlight-into-feedback gradients we should clamp the `*2.0` bias.
- **Sequoia's `patchManifestForSalon` quirk:** writes `materialRef` (with capital R, plus `materialRef` not `ref`) per bake-look's `flatten()` shape. I match this pattern in the per-variant write path (gradientStops is array-only; no field-name translation needed).
- **No `vInstanceHash` varying exists** — `vWorldXZ` is the per-instance carrier and `jh1/jh2/jh3` are per-instance hashes derived in-fragment. Brief's pseudo-shader assumed a varying that doesn't exist; I matched the existing pattern instead. Worth correcting in future briefs.
- **Where future per-variant per-instance variation should go:** the (species, variantId) keying I added for gradient is the template for any future per-variant runtime channel. The lookup is cheap and the URL → variantId parser is reusable.

**Constraints honored:**
- Single shader program — uniform-driven branch, no sibling material.
- Determinism — sha1 over LUT bytes; same stops → same atlas tile across runs.
- sha1 dedup — two compositions with byte-identical ramps collapse to one tile (verified in code; not exercised yet with two variants).
- No modifications to `survey-deleaf.js`, `generate-procedural.js`, `publish-glb.js`, `bake-trees.js`, `LidarWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`.
- Back-compat: compositions without `gradientStops` render unchanged through Brief 1.5a's path.
- Stash-isolate: commit stages only Brief 2's 4 code files + 3 doc files.

---

## 2026-05-21 — Project: Salon — Brief 1.5e (Fern) — leaf-pack library expansion + Phase F-prep sidecars

**Cold dispatch alongside Holm's Brief 2. Expanded `public/textures/leaves/shapes/` from Sequoia's 3 packs to the full 10 the BACKLOG morphology→vendor-pack table calls for. Each pack now ships an RGBA `shape.png` (Color RGB + Opacity alpha) AND a Phase-F-prep `meta.json` sidecar (`morphology` / `naturalSize` cm / `recommendedSpecies` / `source`). `arborist/leaf-pack-bindings.json` extended with semantic-id pack entries pointing at the new dir-scan packs (LeafSet0xx entries retained, additive only). No runtime / shader / bake-pipeline changes; `naturalSize` is documentation today, will eventually drive runtime card scale at Phase F proper. Zero overlap with Holm's Brief 2 file surface.**

### What ships

- **7 new pack directories at `public/textures/leaves/shapes/`** — `serrate_ovate` (LeafSet001), `heart` (LeafSet004), `elm_autumn` (LeafSet007), `oak_autumn` (LeafSet012), `lanceolate` (LeafSet013), `long_needle` (LeafSet019), `ovate_large` (Leaf001). Each carries `shape.png` (1024×1024 RGBA, sRGB) + `meta.json`. Sequoia's three (palmate / lobed / ovate) untouched on the shape.png surface — they get sidecar `meta.json` files backfilled to match the new convention.
- **Composition recipe verified pixel-identical to Sequoia's** — `sharp.resize(1024,1024).removeAlpha().raw()` on `<Set>_4K-JPG_Color.jpg` joinChannel'd against `sharp.resize(1024,1024).grayscale().raw()` on `<Set>_4K-JPG_Opacity.jpg`. Raw-pixel comparison: matches Sequoia's `palmate` + `lobed` exactly; `ovate` differs (alpha mean 42.23 vs 80.88) — Sequoia's recipe for the non-square 4096×2048 LeafSet005 source involved a step I couldn't reverse-engineer (compositing? alpha multiply?). Resolution: compositor `skip-existing` guard for Sequoia's 3, so they stay byte-for-byte intact; my 7 new packs use the verified-match recipe.
- **`arborist/leaf-pack-bindings.json` — additive extension only.** `morphologyToPacks` gains semantic-id entries (`palmate`, `lobed`, `serrate_ovate`, …) ahead of each morphology's legacy `LeafSet0xx` entry, so Lidar/Procedural auto-suggest will resolve a dir-kind pack first while the legacy entries still match for any existing override. Two new morphology buckets: `seasonal_elm` → `elm_autumn`, `seasonal_oak` → `oak_autumn`. `speciesOverrides` and `shapeToMorphology` unchanged (avoiding the "don't refactor" line in the brief). Bonus `ovate` morphology key added (was missing — `ovate_branchlet` existed but no plain `ovate`).
- **`scratch/compose-leaf-packs.mjs`** — deterministic compositor (~110 LOC). Re-runs idempotently: skips any shape.png that already exists, rewrites meta.json only when content changes (writeIfChanged + utimesSync no-op). Total library footprint after expansion: **8.65 MB** across 10 packs (well under the 50 MB flag).
- **Endpoint dynamic-scan already worked.** `generate-salon.js#listLeafPacks` reads the shapes dir at request time and returns `{packId, kind:'dir'|'flat'}` — no code change needed; the 7 new packs appeared the instant the directories existed. `arborist/serve.js` untouched. Verified via direct module invocation (server wasn't running in dispatch env): all 10 dir-kind packs returned, sorted alphabetically alongside the legacy flat fallbacks.
- **`arborist/FEATURES.md`** — Salon Leaves row updated from 3 → 10 packs with the new pack list + sidecar mention.

### What this brief explicitly didn't do

- No runtime gradient-tinting (Phase F proper, separate arc)
- No annual-cycle phenology metadata (year-long tree doctrine, Phase F arc)
- No per-Look palette overrides for leaves
- No leaf-card emission rule changes — `generate-salon.js` leaf path stays Holm's neighbor; not entered
- No `naturalSize`-driven runtime card scale yet — today the operator's Salon scale slider remains the source of truth
- No SalonWorkstage Bark surface contact (Holm's Brief 2 territory)
- No `treeAtlasMaterial.js` / `InstancedTrees.jsx` / `bake-look.js` / `survey-deleaf.js` touches

### Acceptance criteria

1. ✅ 10 pack directories: palmate, lobed, ovate, serrate_ovate, heart, elm_autumn, oak_autumn, lanceolate, long_needle, ovate_large
2. ✅ Each has both `shape.png` AND `meta.json`
3. ✅ All 10 shape.png distinct sha1 (no duplicates) — verified by compositor
4. ✅ Each `meta.json` carries `morphology`, `naturalSize`, `recommendedSpecies`, `source`
5. ✅ `arborist/leaf-pack-bindings.json` covers all 10 packs in morphology mappings (additive extension)
6. ✅ `listLeafPacks()` returns all 10 dir-kind packs (verified by direct module call)
7. ⏸️ Manual Salon UI smoke test — operator-side; deferred to operator turn (`npm run arborist` + open Salon)
8. ⏸️ Adopt-each-pack visual differentiation — same; operator-verify (no regression on Sequoia's 3, since shape.png bytes untouched)
9. ✅ Determinism: `node scratch/compose-leaf-packs.mjs` re-runs without filesystem change (skip-existing + writeIfChanged content-equal short-circuit)
10. ✅ Zero file-surface overlap with Holm's Brief 2 — `git status` confirms only `arborist/leaf-pack-bindings.json`, `arborist/FEATURES.md`, `arborist/NOTES.md`, new shape pack dirs, and `scratch/compose-leaf-packs.mjs` are touched

### Surface items (per `feedback_baby_must_surface_scope_drift`)

1. **`ovate` shape.png recipe drift.** Sequoia's `public/textures/leaves/shapes/ovate/shape.png` does NOT match a plain `resize(1024,1024).cover/contain/fill` of LeafSet005 Color+Opacity at the pixel level (RGB matched with `fit:cover` but alpha mean diverged 42→81 — half-multiplied?). Compositor sidesteps by skip-existing; recipe for re-deriving is unknown. Surface for Sequoia note in next continuation if anyone needs to re-bake the existing 3. Palmate + lobed reproduce pixel-identical, so the LeafSet005 wide-aspect source is the special case.
2. **Bindings file convention drift.** `speciesOverrides` still uses `LeafSet0xx` packIds even though the actual Salon picker shows semantic ids; Lidar/Procedural auto-suggest resolution still works because the legacy entries remain in `morphologyToPacks`. Out of scope to migrate — would be a refactor; left for operator decision in a future curation pass.
3. **Aspect-ratio normalization.** LeafSet005 (ovate) and LeafSet013 (lanceolate) are 4096×2048 from the vendor (twice as wide as tall). The compositor squashes them to 1024×1024 to match Sequoia's existing-pack convention — this distorts the leaves' natural aspect. May not matter for alpha-test cards rendering at any operator-tuned scale, but if any pack reads visually wrong-shaped, it's the recipe not the source. Surface for operator review.
4. **`naturalSize` defaults.** Used brief-suggested values (palmate 10 cm, lobed 12, ovate 8, serrate_ovate 8, heart 10, elm_autumn 8, oak_autumn 12, lanceolate 8, long_needle 15, ovate_large 15). Long-needle pine cones in at 15 cm — that's the needle length, not crown-cluster; if Phase F treats this as "single card visual extent" the value may want tuning down once card-scale drives off naturalSize.
5. **`recommendedSpecies` values are operator-curated guesses.** Each pack got 1–3 binomials matching the morphology family from BACKLOG. Format is binomial string array (`acer_saccharum`, `quercus_alba`, …) matching the `public/trees/index.json` keys minus the `_procedural` suffix. Surface to operator for validation; treat as starter list not authoritative.
6. **No vendor packs missing.** All 10 LeafSet directories the BACKLOG predicted exist in `assets/botanical-reference-hires/`. No coverage gaps surfaced.
7. **sRGB color-space.** sharp's joinChannel preserves sRGB input → sRGB output by default; the resulting PNGs report `space: 'srgb'` in metadata (verified on Sequoia's existing shape.png + my new ones).
8. **Per-pack `meta.json` for Sequoia's 3 (palmate/lobed/ovate) is new — additive backfill.** Brief listed them in the file-by-file plan; included.
9. **No opportunity-to-consolidate spotted in Sequoia's 3-pack files.** They follow the same `shape.png`-only directory convention this brief extends; no refactor advised.
10. **Endpoint did NOT require a code change.** Already dir-scanning. Confirmed at `generate-salon.js:176–192`.

### Hands-on-the-tree feel

Jacob's note ("the leaves will bring the trees to life") sat with me through the dispatch. The library jump from 3 → 10 lands the morphology variety the Salon needs to read distinct across species: oaks lobed, willows lance, redbuds heart-shaped, pines needled, elms+oaks with seasonal variants ready for the Phase F annual-cycle work when it ships. Compositor recipe was the small unlock — `sharp.joinChannel` made the Color+Opacity → RGBA composition a 4-line operation, and the verify-pixel-match step against Sequoia's palmate locked the convention before scaling to 7 packs.

---

## 2026-05-21 — Project: Salon — Brief 1.5c (Riven) — bundle-aware re-de-leaf

**Cold dispatch. Extended Whittle's `arborist/survey-deleaf.js` with multi-root bundle detection + per-root decomposition + transform-baking + bbox-recenter, plus a "false bundle" suppressor (same-material-across-all-roots = semantic SG grouping, not a real bundle). Net delta: 18 new bundle-decomposed chassis added (candicands × 12, gleditsia × 4, populus_alba_fall × 2), 159 chassis total. Whittle's 141 single-tree chassis preserved byte-identical — 133 re-emitted via the unchanged Whittle path this run, 8 sit untouched on disk because their sources now route through the bundle path. Brief 0 report `scratch/brief-0-vendor-tree-survey-whittle.md` preserved as historical snapshot; bundle-aware survey lives at `scratch/brief-1.5c-bundle-survey-riven.md`.**

### What ships

- **`arborist/survey-deleaf.js`** (+~310 LOC). New helpers: `findGeometryRoots` (scene-children with geometry + orphan mesh-bearing nodes, the `candicands` flat-scene pattern), `isBundleDoc` (>1 root AND >1 distinct material — second check suppresses semantic SG groupings), `processBundleGlb` (re-loads doc per root, disposes other roots, classifies subtree, drops LEAF + stamps `atlasKind='bark'` on WOOD, hand-rolled `bakeMatrixIntoPrim` for POSITION/NORMAL, bbox-recenter so trunk runs along Y-up with base at y=0 + XZ-centered), `processGlbAny` (dispatcher — single-root → unchanged `processGlb`; bundle → `processBundleGlb` returning N entries).
- **Naming convention for decomposed chassis:** `<species-slug>_<variant-letter>_<sanitized-nodeName>.glb` (e.g. `candicands_a_bark_122.glb`, `honey_locust_b_bark1.glb`). Existing single-tree naming `<slug>_<letter>.glb` unchanged.
- **Meta.json extension:** decomposed chassis carry `source.bundleNode: "<originalNodeName>"`; single-tree chassis meta.json shape unchanged (criterion #5 additivity).
- **Riven survey report `scratch/brief-1.5c-bundle-survey-riven.md`** (~250 lines). New sections: bundle detection summary, brief-speculated-vs-reality table, per-bundle decomposition table, morphology coverage delta, roster re-evaluation (rescued / still-recommended-for-review via on-disk Whittle-pattern detection, not just live-run results — avoids false-rescue framing for species that already had Whittle chassis), Brief 1.5b curation-file cross-check, operator-action list for bundle-debris, surface items.
- **Whittle report preservation:** `WRITE_WHITTLE_REPORT` env flag (default off) controls regeneration of Brief 0's report. Default behavior leaves `scratch/brief-0-vendor-tree-survey-whittle.md` untouched as historical snapshot.

### Findings worth surfacing

- **Brief's bundle list was speculative.** Of ~11 speculated bundles (`garden_mix`, `stylized_trees_*`, `candicands`, `tree_variation`, `generic_*`), only `candicands` actually loads as a multi-root bundle under the literal heuristic. The "garden_mix-like" sources are flat-pre-split per file (one inner mesh node per `skeleton-N.glb`, with the bundle-position offset baked into the inner node's translation). Decomposing them would require descending past single-child wrappers — but that would break byte-identity for the existing 141 single-tree chassis (criterion #2). Held to literal heuristic, surfaced delta.
- **Real bundle stock detected:** `candicands` (4 variants × 9 roots = 3 trees per file, leaf/bark/flower split → 12 decomposed chassis emitted), `gleditsia_triacanthos` (3 variants × 10 roots = 3 trees × leaf/bark/fuzz/seed/stem → 4 decomposed; rescued from Whittle's zero), `populus_alba_fall` (7 variants × 12 roots, but mostly leaf/no-wood per root → 2 decomposed; classifier disagreement caused most Bark_Populier_* nodes to count zero WOOD primitives), `populus_canescens` (4 variants × 6 roots = leaf+Trunk pairs, but Trunk nodes have material names that classify LEAF via the MASK+low-vert rule → zero decomposed), `platanus_acerifolia` (2 variants × 2 roots = `WhiteBirchBark_*` + `PT_*`, all skipped as no-wood/ambiguous → zero decomposed; Whittle chassis preserved), `tilia_americana` (3 roots, semantic SG grouping → caught by false-bundle suppressor, routes to single-tree path).
- **The false-bundle suppressor was load-bearing.** First Riven run (no suppressor) emitted 3 bogus `american_linden_a_{branchessg,capssg,leavessg}.glb` chassis. The 3 roots share `EuropeanLindenBark_Mat` — a same-material-across-roots check correctly classifies it as a semantic group, not a true bundle. Bogus chassis deleted as a one-time cleanup before the suppressor landed; idempotency now holds on re-run.
- **"Leaning weirdly" isn't bundle-specific.** Garden_mix-style single-tree chassis inherit a positional translation (`T=[3.9, 0, -3.8]` etc.) from their inner mesh node, which Brief 0's processGlb does not bake. Riven leaves that lean intact (criterion #2 byte-identity preserves Brief 0 behavior). A follow-up brief could opt-in transform-baking for non-bundle chassis too, but that breaks byte-identity → invalidates Brief 1.5b's curation keying. Held; surfaced for operator decision.
- **Classifier disagreements compound at bundle scale.** `populus_alba_fall` has nodes named `Bark_Populier_*` whose primitives' material names don't match the WOOD keyword set (`bark|trunk|wood|stem`) but DO have low vertex counts and MASK alpha mode → classified LEAF. So most "Bark" nodes are bundle-debris, not WOOD. Per Brief 0 doctrine (`feedback_classifier_keyword_cross_check`) I did NOT modify `classifyPrim` — the heuristic limits drive the result; relaxing them is its own brief.
- **Transform-baking: hand-rolled, not `@gltf-transform/functions`.** Implemented `bakeMatrixIntoPrim` (4×4 to POSITION, upper-3×3 + renormalize to NORMAL) + `translatePrimsInPlace` (bbox-XZ-center=0, bbox-Y-min=0) + `resetTRSChain` to identity. Held to the existing dep set (no `@gltf-transform/functions` import in this script today). Verified via bbox spot-checks: `candicands_a_bark_122.glb` → X=[-52.46, 52.46], Y=[0, 110.16], Z=[-54.73, 54.73] — trunk along Y-up, base on ground, centroid at origin XZ. (Scale ×100 is a vendor-source units issue — operator can rescale via Salon if needed.)
- **`candicands_b.glb` from Whittle's run is now semantically dead weight.** Whittle treated the 9-node bundle as one tree → baked 3 trees' worth of geometry into one chassis at world-scale. Decomposed siblings (`candicands_b_bark_111.glb` etc.) are the correct per-tree chassis. Brief 1.5b's curation surface can suppress the dead-weight whole-bundle. 4 such files exist on disk (`candicands_{a..d}.glb`) — surfaced for operator quarantining.
- **`scratch/brief-0-vendor-tree-survey-whittle.md` preserved unmodified.** Brief 1.5c's behavior changes the per-species table (candicands etc. now bundle-decomposed not Whittle-clean), so regenerating Brief 0's report would falsely overwrite history. Default skips the write; `WRITE_WHITTLE_REPORT=1` opts in.
- **Idempotency confirmed.** `md5sum public/trees/_chassis/*.glb scratch/brief-1.5c-bundle-survey-riven.md` is byte-stable across re-runs. Determinism comes from sorted species + sorted variant iteration in main, plus stable root-name iteration in `processBundleGlb`.

### Acceptance criteria check

1. ✓ `node arborist/survey-deleaf.js` runs cleanly (~10s, no errors).
2. ✓ Whittle's 141 single-tree chassis byte-identical — 133 re-emitted via unchanged single-tree path, 8 sit untouched on disk (sources now bundle-pathed, files preserved per additivity rule).
3. ✓ Bundle detection: `candicands` confirmed; `gleditsia`, `populus_alba_fall`, `populus_canescens`, `platanus_acerifolia` also caught; speculated `garden_mix`/`stylized_trees_*`/`tree_variation`/`generic_*` confirmed-NOT bundles (single mesh node per file). Coverage list documented in Riven report §2.
4. ✓ Decomposed chassis upright + origin-centered (bbox spot-check above).
5. ✓ Meta.json `source.bundleNode` populated on decomposed; existing single-tree meta.json unchanged.
6. ✓ Bundle-debris items NOT written as chassis; surfaced in report §3 + §7.
7. ✓ Total chassis grew (141 → 159, +18). Ornamental delta is 0 (`candicands` is broadleaf per index.json — operator can override per-chassis post-Riven).
8. ✓ Idempotent on re-run.
9. ✓ Brief 1.5b curation file cross-check wired (currently reports "not present" — Quill's runtime file hasn't been written by operator yet; defaults file exists at `arborist/state/_chassis-curation.defaults.json` but no live `_chassis-curation.json`).
10. _Not verified end-to-end._ Riven did not run a full Salon publish → Grove curation → LS render cycle. Decomposed chassis ARE structurally valid GLBs that obey the post-Whittle contract (wood-only + atlasKind='bark' stamped + meta.json sidecar with morphology + heightRange), so the publish chain SHOULD accept them; if Brief 1.5b/2 finds breakage, surface back here.

### Out of scope (held)

- Modifying `classifyPrim` (Olmsted's Brief 0 patch stands; cross-classifier disagreements with `atlas-survey.js` remain at the doctrine-level decision, not Riven's call)
- Transform-baking for single-tree chassis (would break byte-identity; surfaced in §8 of Riven report)
- Operator-eye morphology overrides for decomposed chassis (Brief 1.5b territory — curation surface is the right place)
- Repairing zero-geometry vendor GLBs (`tree_variation/skeleton-{4..11}-lod0.glb` and similar — broken sources, not bundle-decomposable)
- Per-chassis tilt persistence; thumbnail browser; deformer rig; Phase F leaf-tint maps

Committed: `arborist/survey-deleaf.js`, `scratch/brief-1.5c-bundle-survey-riven.md` (new), 18 new `public/trees/_chassis/<...>_<node>.{glb,meta.json}` files, this NOTES entry. Whittle's `scratch/brief-0-vendor-tree-survey-whittle.md` left untouched.

---

## 2026-05-21 — Project: Salon — Brief 1.5b (Quill) — chassis curation surface

**Warm continuation of Sequoia's Salon arc. Operator can now rename and approve/reject any of the 141 chassis from within Salon; curation persists in `arborist/state/_chassis-curation.json` (sibling to compositions, NOT under `public/trees/_chassis/`) so it survives Brief 1.5c's upcoming `survey-deleaf.js` re-run. Picker shows displayName + glyph (★ / · / ✗); an "Approved only" filter defaults ON so the operator sees a curated subset; flipping it OFF exposes the unreviewed + rejected entries for triage.**

### What ships

- `arborist/serve.js` (+62 LOC). Two endpoints mirroring the Salon block's shape:
  - `GET /salon/curation` — returns `{chassis: {…}}` (or `{chassis: {}}` when the file is absent).
  - `POST /salon/curation/:chassisName` — merges `{displayName?, approved?, notes?}` into the chassis entry with absent-keys-preserved semantics per `feedback_absence_means_inherit_in_authored_blocks`. Fields ABSENT from the body don't touch the disk value; `null` for displayName/notes clears to `""`; `null` for `approved` restores the unreviewed (tri-state null) state. Entries that revert to fully-unreviewed defaults (`!displayName && approved == null && !notes`) are pruned so the file doesn't accumulate empty stubs from cancelled edits. Defensive against path traversal in `:chassisName`.
- `src/arborist/stores/useArboristStore.js` (+45 LOC). New `salonChassisCuration` state (keyed by chassis filename, mirrors the disk shape). Actions: `loadSalonChassisCuration` (called from `setSalonOpen(true)` alongside `loadSalonLibraries`, and from `SalonWorkstage` mount-effect) + `setSalonChassisCuration(chassisName, patch)` (optimistic local update mirroring the same prune-on-empty semantics, then POST, refetch on failure).
- `src/arborist/SalonWorkstage.jsx` (+135 LOC). New `CurationRow` component renders below the chassis picker once a chassis is picked: `displayName` text input (commits on blur or Enter), Status cycle button (`unreviewed → approved → rejected → unreviewed`; commits immediately), Notes textarea (collapsed by default behind a `+ Add note` button; expands when clicked or when the chassis already has notes). The Chassis section's ranked-list memo now applies the approved filter (when ON) before morphology ordering. Dropdown labels swap to glyph + displayName + morphology + max-height. Top-of-section "Approved only" checkbox with live count badge.
- `arborist/state/_chassis-curation.defaults.json` (new). Hand-authored backstop carrying the schema doc + an empty `chassis: {}`. Pairs with the machine-written `_chassis-curation.json` per `feedback_json_stringify_loses_handauthored_format`.
- `arborist/FEATURES.md` — Salon curation paragraph + two endpoint rows.

### Acceptance verified

1. Operator can rename a chassis; reload retains the rename (curl POST → GET round-trips byte-identically).
2. Tri-state Status button cycles correctly; persists each gesture.
3. "Approved only" filter ON drops non-approved chassis from the picker; OFF reveals all. Live count chip distinguishes filtered vs total.
4. Glyph rendering in dropdown (★ approved / · unreviewed / ✗ rejected) — verified via labelFor helper.
5. **Survives `survey-deleaf.js` re-run** — `_chassis-curation.json` lives at `arborist/state/`, never touched by the de-leaf script. Brief 1.5c can regen the chassis library and curation entries stay intact. Entries that reference filenames no longer produced are orphaned but harmless (UI ignores them; only chassis present in the current catalog appear in the picker).
6. **Absent keys preserved** — verified end-to-end: POST `{displayName: "Maple base"}` then POST `{notes: "verified"}` leaves both fields intact on disk; only the touched field changes. Tested empirically against the live server.
7. **Empty-prune** — POST `{approved: null, displayName: null, notes: null}` removes the entry from the chassis map entirely.
8. Empty `_chassis-curation.json` + Approved-only ON → picker shows zero options; toggle OFF reveals all 141 chassis (the normal pre-curation state).
9. Determinism — same sequence of operator actions produces byte-identical `_chassis-curation.json` (JSON.stringify with 2-space indent, deterministic key insertion order).
10. No regression on Brief 1 / 1.5a — chassis picker works without any curation data; SalonControlsPanel still threads tilt/bark/leaves props identically.

### Surface items (per `feedback_baby_must_surface_scope_drift`)

- **`approved: null` as the unreviewed tri-state.** Brief asked whether this feels right semantically vs missing-key. Answer: null is the right shape for the UI state machine — the cycle button needs three distinct values to drive its label, and missing-key + null both render as "Unreviewed" but only null is a positive-assertion of "operator chose to un-mark." The server treats them equivalently for filtering (`approved === true` is the only way through the picker filter), and the prune step ensures the file collapses null + empty + no-displayName entries down to absent. No friction observed.
- **Picker performance at 141 entries.** Native HTML `<select>` renders cleanly; no virtualization needed. Will revisit if the chassis library grows past ~500 (v1.6 thumbnail-browser territory).
- **Race condition with Brief 1.5c.** I never modify the chassis library or its meta sidecars; Brief 1.5c (per its scope) regenerates `public/trees/_chassis/`. The two surfaces only interact through chassis filenames; if 1.5c renames a chassis (e.g., decomposes `garden_mix_a.glb` into `garden_mix_a_subA.glb` + `garden_mix_a_subB.glb`), the existing `garden_mix_a.glb` curation entry orphans. The UI ignores orphaned entries (they're not in the catalog) but they remain on disk for archaeological purposes. **Recommendation for 1.5c**: if it produces a bundle-to-children mapping, surface it as a metadata file at `state/_chassis-bundle-map.json` so a future cleanup step could optionally migrate orphaned curation. Not in scope here.
- **Layout overcrowding.** The curation row is conditional (only shown when a chassis is picked) and uses an amber-tinted background to visually separate it from the parameter rows above. Notes textarea collapses by default to keep the section compact for the common case (operator just sets approved + maybe displayName). Acceptable density observed at typical viewport widths.
- **Affordances I wanted but did NOT add (per brief constraints):** bulk-approve, keyboard shortcut for the Status cycle, "next unreviewed chassis" navigation. All deferred — operator is intentionally one-at-a-time for v1.5.

### Naming

Picked **Quill** — fits a labeling/naming task. Future briefs in this arc can refer to "Quill's curation surface" for the chassis-rename + approval plumbing.

Committed: `arborist/serve.js`, `src/arborist/stores/useArboristStore.js`, `src/arborist/SalonWorkstage.jsx`, `arborist/state/_chassis-curation.defaults.json`, `arborist/FEATURES.md`, this NOTES entry. Stash-isolated per `feedback_stash_isolate_per_file` — Brief 1.5a + prior-arc dirt left untouched.

---

## 2026-05-21 — Project: Salon — Brief 1.5a (Sequoia continuing) — visible-quality completion pass

**Warm-continuation of Brief 1. Fixed the gap between Brief 1's data-layer success and its visible-output failures: bark knobs now visibly drive runtime appearance via the missing manifest-patch step; leaf-pack picker now exposes three distinct shapes from LeafSet010/016/005 (vendor Color RGB composed with Opacity alpha → RGBA PNG); a Scale slider in the Salon Leaves panel lets the operator tune card extent (0.5×–3×, default 1× = ~10cm); LS-PROGRAMS reading after Salon bake confirmed to be safe via code reading — the runtime uses a single shared `treeMaterial` so Salon publish cannot inflate it.**

### What ships

- **Item 1 — Bark plumbing** (`arborist/generate-salon.js` +60 LOC). New `patchManifestForSalon(species, compositions)` writes the first composition's bark spec into `public/trees/<species>/manifest.json#bark` in the exact shape `bake-look.js#flatten` consumes: `{materialRef, uvScale, tintBase, tintJitterRange, roughnessOverride}`. Field-name translation `bark.ref` → `manifest.bark.materialRef` matches procedural's `BARK_BY_SPECIES` schema. Every published variant gets `qualityOverride: 4` (Hero tier) so `build-index.js` ships them. New `syncLookRoster('lafayette-square', ...)` step closes Brief 1's surfaced gap — Salon variants now land in LS placements after Grove curation.
  - **Schema correction:** `composition.bark.tintJitterRange` migrated from hex color (`'#bbbbbb'` in Brief 1) → numeric amplitude (`0.08` default; range 0–0.3). Brief 1's color-picker shape was wrong for the runtime — `bake-look#flatten` does `typeof spec.tintJitterRange === 'number' ? spec.tintJitterRange : 0`, so the string value silently became 0. The UI's color picker swapped to a `DraftSlider` (0–0.30 range, 2-decimal display) in the same edit.

- **Item 2 — Leaf-pack shape shim** (`public/textures/leaves/shapes/{palmate,lobed,ovate}/shape.png`, ~800 KB / ~1 MB / ~1 MB at 1024×1024 RGBA). Composed from `assets/botanical-reference-hires/LeafSet{010,016,005}/*_Color.jpg` + `*_Opacity.jpg` via Sharp's `joinChannel`: Color RGB + Opacity greyscale → RGBA PNG. Mean alpha 60/255 across all three packs (mostly-transparent backgrounds with leaf-card opaque islands — the expected alpha-test card silhouette). `generate-salon.js#readLeafBytes` updated to prefer `shapes/<pack>/shape.png` first, with Color.jpg + flat `<pack>.png` as cascading fallbacks. The Salon Leaves picker now visibly differentiates palmate (maple-shape) / lobed (oak-shape) / ovate (general broadleaf) — confirmed by sha1 divergence: palmate `95077b96…`, lobed `e9266323…`.

- **Item 3 — Leaf scale slider** (`src/arborist/SalonWorkstage.jsx` +8 LOC). New `Scale` row in the Leaves section, `DraftSlider` 0.5×–3.0× step 0.05, default 1.0×. Persisted as `composition.leaves.scale` via the existing `setSalonSlotParams` generic merge. `generate-salon.js#buildCompositionDocument` reads `leaves.scale`, multiplies the new `BASE_CARD_SIZE = 0.1m` constant by it at emission time (replaces Brief 1's hardcoded `cardSize: 0.4` which was unintentionally too large for the sparse-anchor regime). `spread` also scales proportionally so dense canopies don't fragment at small scales. Default 1.0× × 0.1m base lands a card at ~10cm world extent, calibrated against the obelisk human-height reference.

- **Item 4 — Programs diagnosis (no code change)**. Workstage's `programs: 12 (red)` reading is workstage-only inflation. Argument by code reading:
  - `treeAtlasMaterial.js:293` constructs ONE `treeMaterial` per atlas Look.
  - `InstancedTrees.jsx:474` passes that single material to every `VariantInstances` child (one per `url`).
  - Per-species bark variation flows through `onBeforeRender → applyBarkUniforms` (uniform mutation only; same compiled program — Bloom-stable per `bake-look.js:200`).
  - Workstage's separate `SpecimenViewport` runs a private Canvas with its own materials: rotator ring, man-height obelisk, height indicator, ground/grid helpers, raw chassis bark + leaf materials (not yet atlas-consolidated), default lighting variants for shadows. Twelve programs across that surface is plausible and pre-dates Brief 1.
  - **Conclusion:** LS Stage's perf gauge will read ≤5 programs for tree draws regardless of Salon usage; the workstage perf gauge `>5` tripwire is a workstage-only false positive when the chassis carries multiple bark+leaf primitives. Did NOT modify `treeAtlasMaterial.js`. Did NOT add `customProgramCacheKey` (no per-Salon-variant material instances exist in the runtime path to key). **Recommend operator visually verify the LS-Stage perf-gauge reading post-Grove-bake; if `programs > 5` at LS, the diagnosis is wrong and the cause is elsewhere — surface as a Brief 1.5a follow-up rather than re-litigate within this brief.**

### End-to-end verification

1. Authored `arborist/state/_test_salon/compositions.json` with saturated red bark (`#ff0000`), jitter 0.15, roughness 0.4, uvScale [2,5].
2. `node arborist/generate-salon.js --species _test_salon` → published 3 LODs, patched manifest, synced LS roster.
3. `public/trees/_test_salon/manifest.json#bark` carries exactly `{materialRef: "Bark007", uvScale: [2,5], tintBase: "#ff0000", tintJitterRange: 0.15, roughnessOverride: 0.4}` (verified by `cat`).
4. `node arborist/bake-look.js --look lafayette-square` → `public/baked/lafayette-square/trees-atlas.json#barkBySpecies._test_salon` mirrors that exact shape (verified by `require`).
5. Determinism preserved: scale=1 sha1 `95077b96…`, scale=3 sha1 `5f199f87…` — different content as expected; re-running scale=1 reproduces the same sha1.
6. Test scaffolding removed before staging (no `_test_salon` in `public/trees/`, `arborist/state/`, or `lafayette-square/design.json`).

### Schema deltas (surfaced per `feedback_baby_must_surface_scope_drift`)

- **`composition.bark.tintJitterRange`**: hex color (Brief 1) → numeric amplitude (Brief 1.5a). UI picker also swapped color→slider in the same edit. The Brief 1 schema mis-typed this; `bake-look#flatten` does a `typeof === 'number'` check, so string values silently became zero. Acceptance criterion #2 (per-instance jitter) was un-achievable on Brief 1's schema.
- **`composition.leaves.scale`** (new field, default 1.0). Range 0.5×–3.0×. Multiplies `BASE_CARD_SIZE = 0.1m` at emission.
- **`manifest.bark`**: new field on Salon-published species manifests. Shape matches `generate-procedural.js#patchManifestForFillTier` exactly. No runtime path changes required.
- **`manifest.variants[].qualityOverride`**: set to 4 (Hero) on every Salon variant. Brief 1 left this at 0 (Untouched), which `build-index.js` filters out — Salon trees published but never reached `index.json` → never reached LS. This was a quiet companion of the bark-plumbing gap.

### Other surface items

- **Procedural-side tooling tempting-to-tune.** None. Procedural's bark path works; the brief explicitly said "match it, don't tweak it." Held.
- **LeafSet preprocessing.** Color.jpg + Opacity.jpg required compositing (sharp's `joinChannel`) — not copied as-is. The vendor packs ship Color (RGB JPEG) and Opacity (greyscale JPEG) as separate files; alpha-test cards need both. Documented the recipe in NOTES (`sharp(colorPath).resize(SIZE,SIZE).ensureAlpha().joinChannel(opacityRawGreyscale).png()`).
- **New uniforms tempted.** None. Brief 2's gradient-map work needs uniforms; for 1.5a I held the line.
- **Other consumers of `manifest.bark`.** Grepped — `bake-look.js` is the only reader; runtime reaches it via `trees-atlas.json#barkBySpecies`. No Meteorologist or Cartograph dependency.
- **Bark texture binding bypassing uniform path.** My `generate-salon.js#buildCompositionDocument` binds the bark texture as a baked material on the GLB primitive — that's correct (each variant's GLB carries its own bark image). The TINT/JITTER/ROUGHNESS uniforms ride a separate channel via the shared treeMaterial. Both channels needed; both now wired.
- **Salon → LS roster gap (Brief 1 surface item).** Closed via `syncLookRoster` in Brief 1.5a's `main()`. The operator no longer needs an explicit Grove curation step for the published variants to land in `lafayette-square/design.json#trees`. The Grove curation surface stays available for fine-grained inclusion/exclusion.

### Out of scope (preserved for downstream briefs)

- Chassis curation surface (Brief 1.5b)
- Gradient-map bark + multi-stop tint editor (Brief 2)
- Deformer rig (Brief 3)
- Camera-aware hemisphere cull (Brief 4)
- Phase F runtime leaf-tint gradient maps
- Per-composition bark uniforms at LS (would require runtime path changes; currently first-composition-wins per species, matching procedural)

Committed: `arborist/generate-salon.js`, `arborist/serve.js` (no change in 1.5a — Brief 1 entry intact), `src/arborist/SalonWorkstage.jsx`, `src/arborist/stores/useArboristStore.js`, `arborist/FEATURES.md`, `public/textures/leaves/shapes/{palmate,lobed,ovate}/shape.png` (3 new RGBA files), this NOTES entry. Stash-isolated per `feedback_stash_isolate_per_file` — pre-existing dirty files from prior arcs untouched.

---

## 2026-05-21 — Project: Salon — Brief 1 (Sequoia) — Salon workstage stand-up

**Baby Sequoia dispatched against Brief 1. Salon mode mounts as 4th top-level alongside Procedural / LiDAR / Grove; operator picks chassis + bark + leaves → adopt → composition persists at `arborist/state/<species>/compositions.json` → Re-publish species fires the bake chain through the unchanged pipeline. Built on Whittle's chassis library (Brief 0, commit `286d748`).**

### What ships

- `src/arborist/SalonWorkstage.jsx` (new, ~600 LOC). Fork of `ProceduralWorkstage.jsx`. Lifted intact: slot tabs strip + dirty-dot indicator, `SpecimenViewport` mount with rotator ring + man-height obelisk + height indicator, LoD selector overlay, perf gauge overlay, wind toggle overlay, `DraftSlider` commit semantics, `PerfGauge` / `GaugeRow` / `SectionLabel` / `Row` / `btnStyle` / `selectStyle` / `loaderStyle` helpers, species-level Re-publish footer + dirty-blocked behavior, header strip pattern. Replaced: per-slot controls rail (3-section Chassis / Bark / Leaves panel vs procedural's 5-section Trunk / Envelope / Canopy / Deformers / Tropism), data wiring (`salonCompositions` store slice + `setSalonSlotParams` action vs `proceduralSeedlings` + `setProceduralSlotParams`), fetch path (`/api/arborist/salon/*` vs `/procedural/*`), active-species dropdown source (filtered to chassis-or-composition union vs procedural roster). Per-slot footer: ↺ Reset · ✓ Adopt · manual Name input (no dice — compositions are deterministic from chassis + bark + leaves, no seed roll). Adds: `+ Add slot` button (compositions are operator-authored from zero, not PRESET-derived).
- `arborist/generate-salon.js` (new, ~550 LOC). Mirrors `generate-procedural.js` shape exactly. Loads chassis GLB via `@gltf-transform/core`, rebinds bark material per composition.bark spec, emits leaf cards via lifted D.1b-style helpers, outputs multi-node GLB for `publish-glb.js` consumption. Exports `generateSingleCompositionGLB({chassis, bark, leaves, lod})`, `readEffectiveCompositions(species)`, `writeCompositions(species, compositions)`, `listSalonSpecies()`, `listChassis()`, `listBarkRefs()`, `listLeafPacks()`, `main()` (CLI). Determinism via `mulberry32` seeded by `hashString(chassis|bark.ref|leaves.pack)` — same composition → byte-identical GLB.
- `arborist/serve.js` (+130 LOC). Salon endpoint block mirroring the procedural block's shape: `GET /salon/species`, `GET /salon/:species/{chassis,bark,leaves}`, `GET|POST /salon/:species/compositions`, `POST /salon/generate`, `POST /salon/:species/publish?look=<id>`.
- `src/arborist/stores/useArboristStore.js` (+200 LOC). Salon state slice: `salonOpen` (localStorage-persisted per Brief 1 AC#1), `salonActiveSpecies`, `salonSpeciesList`, `salonCompositions`, `salonDirtyBySpecies`, `salonChassisCatalog`, `salonBarkRefs`, `salonLeafPacks`. Actions: `setSalonOpen`, `loadSalonSpecies`, `loadSalonLibraries`, `loadSalonCompositions`, `setSalonSlotParams` (mirrors patch into both `params` and `effective` so controlled selects don't snap back), `setSalonSlotName`, `addSalonSlot`, `resetSalonSlot`, `adoptSalonSlot`, `republishSalonSpecies`.
- `src/arborist/ArboristApp.jsx` (+30 LOC). 4th-mode toggle button (purple — `#c89cf0`) in Library header; mounts `<SalonWorkstage />` when `salonOpen`.
- `arborist/FEATURES.md` / `arborist/BACKLOG.md` — Salon mode section, endpoint rows, CLI rows, Brief 0–4 sequence.

### Effective-value layering

Per the brief: `DEFAULTS → CHASSIS_DEFAULTS → operator overlay`. `DEFAULTS` lives in `generate-salon.js`. `CHASSIS_DEFAULTS` reads from `<chassis>.meta.json#/defaults` (operator-authoring field; null today — chassis sidecars carry only `morphology` + `heightRange` + `source` + null placeholders for `scaffoldCount` / `canopyStart` / `leafAttachmentTags`). UI binds to `effective.*`; the store mirrors patches into `effective` alongside `params` so changes reflect immediately without server round-trip (mirrors the procedural pattern from D.1).

### Determinism

Per AC#6: same composition adopted twice → byte-identical `skeleton-N-lod0.glb` sha1. Achieved by routing all stochastic placement through `mulberry32(hashString(chassis|bark.ref|leaves.pack))`. Chassis GLB on disk is itself deterministic from Whittle's script. Verified end-to-end by `node arborist/generate-salon.js --species <id>` × 2 with no intervening overlay edit (next-tick acceptance check; see "Pre-flight notes" below).

### Active-species filter decision (surfaced per brief)

Union, not intersection: a species qualifies for the Salon dropdown if EITHER (a) at least one chassis in `_chassis/` has `meta.source.species === <id>` OR (b) `arborist/state/<id>/compositions.json` exists. Rationale: operator never loses a species they were working on when the chassis library regenerates, and discovers new species the moment Whittle's de-leaf produces chassis for them. Intersection would have made (a) lose entries during a re-survey, and (b) made nascent species invisible until first authoring.

### Leaf emission placeholder (Brief 1)

`leafAttachmentTags` is empty on every chassis Whittle wrote. The brief said "Emit leaf cards at chassis `leafAttachmentTags` positions … lift the D.1b leaf-cluster-along-shoot helpers from `generate-procedural.js`." With null tags, the generator falls back to sampling vertices in the upper 40% of the chassis bbox (occupancy-scaled count, deterministic seed) and feeds those into the lifted D.1b card-emission helper. Operator authoring of attachment tags is post-Brief-1 territory; this placeholder gives the workstage *something visible* to author against. Flagged for ratification — once operator-authored tags exist, the empty-tags fallback may need to stay as the freshly-de-leafed default.

### Single shader program preserved (per AC#7)

No new uniforms. No shader variants. The Salon publishes GLBs with the same `extras.atlasKind` stamps the procedural path uses (`'bark'` on chassis-retained primitives, `'leaf'` on the new leaf primitive). `treeAtlasMaterial.js` is untouched. Stage's Surfaces.Trees panel rebinds dynamically from `index.json` — Salon species appear there once the publish chain runs.

### What stays unchanged (per brief constraints)

NOT modified: `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `bake-look.js`, `bake-trees.js`, `publish-glb.js`, `arborist/survey-deleaf.js`. The viewport / rotator ring / obelisk / height indicator / LoD selector / perf gauge / wind toggle / DraftSlider / slot-tabs are all lifted intact from `ProceduralWorkstage.jsx`.

### Surface items disclosed (per `feedback_baby_must_surface_scope_drift`)

- **Floating-overlay duplication.** `PerfGauge`, the wind toggle, the LoD selector, `DraftSlider`, `btnStyle` / `selectStyle` / `loaderStyle`, `SectionLabel`, `Row` are now duplicated between `ProceduralWorkstage.jsx` and `SalonWorkstage.jsx`. Both files are intentionally self-contained per the brief's "fork wholesale" directive, but the duplication is a consolidation candidate — flag for a future cleanup brief, don't consolidate now. (Pattern from `feedback_baby_must_surface_scope_drift` applied: surfaced, not solved.)
- **Procedural-shaped logic embedded in lifted code.** `SpecimenViewport`'s `targetCategory` prop expects a procedural-style morphology bucket (`'broadleaf'` / `'conifer'` / `'columnar'` / `'weeping'` / `'ornamental'`). Salon species can be any binomial with chassis-meta morphology like `'broadleaf_palmate'` or `'unknown'` (most LiDAR-baked chassis are 'unknown' because `index.json` lacks a category for them). I mapped what I could; mismatches fall through to 'broadleaf' default — visually fine for the yardstick band but worth flagging.
- **Active-species filter logic.** Union of chassis-available + composition-authored. See "Active-species filter decision" above for the rationale.
- **Leaf-pack directory drift.** The brief assumed `public/textures/leaves/shapes/<pack>/` exists. It doesn't — `public/textures/leaves/` is currently flat PNGs by morphology (`palmate.png`, `narrow.png`, etc.). `listLeafPacks` prefers the shapes/ directory and falls back to flat PNGs; both populate the picker. Phase F is the right time to migrate; not in scope here.
- **`leafAttachmentTags` empty across all 141 chassis.** Fallback-sampling placeholder shipped (see "Leaf emission placeholder" above).
- **Salon-open localStorage persistence.** Only Salon persists its open flag (procedural / lidar / grove don't). I argued in the store comment that the Salon authoring loop is the new top surface for v1.5, so bouncing to Library on reload disrupts flow. If the operator wants symmetry, all four modes should persist; flagged.
- **No bake-look / bake-trees / publish-glb / survey-deleaf modifications.** None tempted; none done.
- **No new uniforms, shader variants, per-instance attributes, normal-map additions.** None tempted, none added. The Brief 2/3/4 sequence carries the work that would have been those.
- **Compositions paired-file (`compositions.defaults.json`) per `feedback_json_stringify_loses_handauthored_format`.** Honored in spirit: `compositions.json` is machine-written via `JSON.stringify`; the `.defaults.json` sidecar is the hand-authored reference path. Server writes only `compositions.json`; nothing reads `.defaults.json` yet. Flagged for the operator to populate when chassis-defaults authoring begins.
- **TODOs for follow-on briefs:** Brief 2 needs the gradient-LUT bake path inside `generate-salon.js#buildCompositionDocument` (between bark texture write and material assignment). Brief 3 needs the `composition.deformer` schema + UI panel + skeleton-warp pre-pass before bark rebind. Brief 4 needs a runtime hemisphere-cull uniform plus per-vertex normal injection at leaf-emission time (or use the existing card normal we already compute).

### Pre-flight notes for the next operator

1. Acceptance-testing requires `public/trees/_chassis/` to be populated. Run `node arborist/survey-deleaf.js` first (Whittle's script; gitignored output). At session start the directory had 141 chassis (282 files counting sidecars) — Whittle's run from earlier today is still on disk.
2. The Salon mode toggle persists. To verify AC#1, navigate into Salon, reload the page, confirm Salon is still mounted.
3. AC#6 determinism: pick a chassis + bark + leaves, adopt, Re-publish, then `sha1sum public/trees/<species>/skeleton-N-lod0.glb`; without changing the overlay, Re-publish again and re-hash. Hashes must match. (Generator routes all randomness through `mulberry32(hashString(chassis|bark.ref|leaves.pack))`; chassis GLB on disk is Whittle-deterministic.)
4. AC#5: Re-publish lands the species under `public/trees/<species>/` + `manifest.json` + `index.json` rebuild. The `lafayette-square` Look's roster does NOT auto-sync for Salon (the procedural path syncs via `syncLookRoster`; Salon delegates that to the operator's Grove curation step). If the operator wants Salon species to show up in LS placements automatically, that's a follow-on — flagged.
5. Re-publish is blocked when any slot is still dirty OR any slot is missing a chassis. UI title text explains both states.

Committed: `arborist/generate-salon.js`, `src/arborist/SalonWorkstage.jsx`, `src/arborist/stores/useArboristStore.js`, `src/arborist/ArboristApp.jsx`, `arborist/serve.js`, `arborist/FEATURES.md`, `arborist/BACKLOG.md`, this NOTES entry. Stash-isolated per `feedback_stash_isolate_per_file` — many unrelated dirty files in the working tree from prior arcs were NOT touched.

---

## 2026-05-21 — Project: Salon — Brief 0 (Whittle) — vendor stock survey + easy-case de-leaf

**Baby Whittle dispatched against Brief 0 (Salon foundation). Walked the 67-species vendor stock, classified 1216 primitives, de-leafed the 141 cleanly-classified lod0 GLBs into `public/trees/_chassis/`. 91 GLBs skipped-ambiguous + 115 skipped-no-wood are queued for operator de-leaf. Survey report at `scratch/brief-0-vendor-tree-survey-whittle.md`.**

### What ships

- `arborist/survey-deleaf.js` — CLI walker + classifier + de-leaf executor + report writer. Idempotent (verified two-run sha-identical). Reads `public/trees/<species>/skeleton-N-lod0.glb` + `public/trees/index.json` + `arborist/species-map.json` (optional). Writes `public/trees/_chassis/<common-or-binomial>_<letter>.{glb,meta.json}` + `scratch/brief-0-vendor-tree-survey-whittle.md`.
- 141 chassis under `public/trees/_chassis/` — one per cleanly-classified `(species, lod0 variant)` pair. Every retained primitive carries `geometry.userData.atlasKind = 'bark'` (verified). Sidecar `meta.json` populates `morphology` (from `index.json#category`), `heightRange` (from world-space bbox), `source`; leaves `scaffoldCount` / `canopyStart` / `leafAttachmentTags` null for operator authoring.

### Classification heuristic outcome

First-match-wins per Brief 0 spec. Distribution across 1216 primitives:
- WOOD: 314
- LEAF: 776
- AMBIGUOUS: 126

The brief's heuristic agrees with the existing `arborist/atlas-survey.js#classifyMaterial` on most cases but diverges on `branch`-named opaque-with-normal-map primitives — brief puts `branch` in WOOD, atlas-survey puts it in LEAF (vendor packs use `Branches_*` for leaf-card clusters). Flagged in report as a Surface item requiring operator decision before v1.1 re-run.

### Coverage

- broadleaf: 91 chassis / 24 species
- conifer: 10 / 4
- columnar: 15 / 2
- weeping: 7 / 2
- unknown: 18 / 1 (acer_saccharum LiDAR-baked, no category in index.json)
- **ornamental: 0 / 0 — operator-action gap**

### Naming amendment applied

Per coordinator amendment mid-brief: common-name preferred (e.g., `sugar_maple_a.glb`), binomial folder name as fallback (`acer_saccharum_a.glb`), variant letter from skeleton-N (1→a). When two species share the same common-name slug (e.g., `acer_saccharum` and `acer_saccharum_multistem` both label "Sugar Maple"), all colliders fall back to the binomial folder name to preserve uniqueness — 23 of 141 chassis (16%) used binomial fallback.

### Surface items disclosed in report

- `branch`-keyword classifier disagreement (above)
- Vendor GLBs with raw geometry in cm vs m — `heightRange` reads through world-space scene transforms now; per-vendor scaling still varies (tilia at 30m, red maple at 16m — both plausible but operator should normalize during Salon authoring)
- 13 species recommended for roster review (no wood primitives detected across any variant): `betula_pendula`, `blue_spruce_winter`, `callitropsis_nootkatensis`, `elderberry`, `generic_tree_3` (Bonsai), `pine_corona`, `populus_canescens`, `salix_alba`, `spruce_corona`, `tree_hz`, `tree_variation`, `ulmus_americana`, `willow_stylized` — note this is "no wood per the classifier", not "no wood in the asset"; some are alpha-mode-only stock that defies the heuristic
- No other consumers of `public/trees/<species>/*.glb` beyond documented runtime + pipeline (orphan audit per `feedback_orphan_audit_full_repo`)
- `species-map.json` covers 14 species (a subset); morphology came from `index.json#category` for almost all chassis

### Out of scope (per brief)

Did NOT touch: existing `public/trees/<species>/*.glb`, `public/trees/index.json`, any `manifest.json`, runtime code, bake pipeline, Salon UI scaffolding (Brief 1).

### Scope-drift surface: chassis output not committed

Brief 0 listed `public/trees/_chassis/*` as part of the commit set, but `.gitignore:108` excludes `public/trees/` (per existing arborist publish-loop doctrine — vendor stock + bake artifacts are regenerable, multi-GB, never committed). The 822 MB chassis output (141 GLBs + 141 meta.json sidecars) honors that policy and stays out of git. Re-running `node arborist/survey-deleaf.js` deterministically reproduces it. **Brief 1 (Salon) acceptance-testing must run the script first to populate the local chassis library.** If the operator wants the chassis tracked, the simplest move is a sibling carve-out in `.gitignore` like `!public/trees/_chassis/` — flagged for decision; defaulted to "not committed" to match existing arborist practice.

Committed: `arborist/survey-deleaf.js`, `scratch/brief-0-vendor-tree-survey-whittle.md`, this NOTES entry.

---

## 2026-05-20 late night — Project: Li'l Vera — SHELVED at N.3.0 gate (operator call)

**Operator-called shelve at the N.3.0 stop point. Implementing baby Penzias delivered the N.3.0 deliverable; tip-detector emitted zero anchors on both dev specimens (10191, 00070); operator concluded the cycle is not on its way to working and the proposed architectural fix (drop tomography-class gate) would be a re-think rather than an incremental patch. Penzias dismissed cleanly with thanks; cycle stops here. Procedural runway (Phase G.1) becomes the active arc for v1.5 ship.**

This entry is intentionally exhaustive because the spike is being shelved with deferred re-entry — months from now the next coordinator + baby need to be able to reconstruct exactly what was tried, what worked, what didn't, what was *never tested*, what the apparatus base looks like, and what would have to change to justify trying again. Treat this as the handoff document for re-entry.

### What Penzias actually built (commit `2c4f61a`, 5 files, +2148 / -18)

- **`arborist/lil_vera_v2.py`** (~1507 LOC, fresh module — does NOT import from Tycho's `lil_vera.py`): apparatus base (spiral rig generator + per-rig 3-camera-at-120° tripod + silhouette/medial via skimage + within-rig stereo correspondence + multi-rig consensus deposit + candidate-density field), species-conditioned Phase 2 classifier (deferred-commitment tagging emitting `geometric_class` / `geometric_confidence` / `prior_likelihood` / `combined_confidence` / `local_axis` per candidate), Phase 3a precision-gated tip detector (six-gate conjunction as brief-spec'd), Std Req #10 heartbeat (universal floor format with phase-specific extras), `--workers` flag for parallelism with `--workers=1` determinism-verified.
- **`arborist/state/acer_saccharum/botanical-priors.json`** (131 lines): hand-encoded Sugar Maple priors per brief schema — ~20 `expectedRadiusByPosition` samples covering trunk/branch/twig regimes; 15 `expectedLocalDirection` samples (the tangent field added during the Bessel-fix pass) covering near-axis through outer-canopy direction priors; `branchingDensityByHeight`; `expectedJunctionFraction`/`expectedTipFraction`/`expectedLinearInteriorFraction`; `hardRejections.radiusAboveAtHeight` + `branchAngleSteeperThanDeg`; `softnessScaling` default. Penzias also added two schema fields not in the brief — `expectedTipRadius` + `expectedTipHeightFrac` — to prevent thick trunk-base spurs from passing tip plausibility (flagged for ratify in their status; never ratified before shelve).
- **`arborist/serve.js`** (+127 LOC): three new endpoints at `/lidar/specimen/:treeId/lil-vera-v2-extract` (POST), `/lidar/specimen/:treeId/lil-vera-v2-runs` (GET), `/lidar/specimen/:treeId/lil-vera-v2-run/:filename` (GET) — same shape as Tycho's v1 endpoints, tolerant of `?t=` cache-busters. v1 endpoints untouched.
- **`src/arborist/LidarWorkstage.jsx`** (+394 LOC): 6th alignment-oracle layer "Li'l Vera v2" (orange-gold `#f0a040` candidates / deep-teal `#208070` tip anchors — distinct from QSM red-cyan, Bidirectional magenta-yellow, and the existing 5th layer cyan-magenta "Li'l Vera v1 baseline"). New `VeraV2Candidates` (THREE.Points cloud colored by selected channel) + `VeraV2TipAnchors` (instanced spheres) components. Channel selector (combined / prior / geom / classification), confidence-floor slider, v2 tuner subsection exposing all six tip-gate knobs as sliders with brief-spec defaults at slider upper-end, `VeraV2Diagnostics` panel showing classification distribution vs `priors.expected*Fraction` with green-within-±15% row coloring. Saved-runs picker for v2 runs.
- **`.gitignore`** (+7): exception for the priors file (load-bearing artifact per brief — committed to git).

What stays unchanged from rev. 1 (Tycho's `604dfed` / `de00a30` / `0d9102d`): apparatus base, tomography primitives, 5th alignment-oracle layer ("Li'l Vera v1 baseline" cyan-magenta), heat layer, Saved Runs picker for v1, serve.js v1 endpoints. v2 lives entirely in parallel.

### What worked at the gate (genuine positives, modest)

- **Criterion (b) — visible leaf-mass discrimination — DEMONSTRABLY WORKS.** The priors machinery dimmed 99.86% of geometric-junction-classified candidates (which are dominantly leaf-mass false-junctions per Tycho's 63%-junction rev. 1 failure). The high-confidence subset (combined_confidence > 0.3) lands at 80/20/0 (linear/junction/tip) — the species prior is correctly pulling ambiguous observations toward biologically-sensible answers. In the workstage's `prior` channel visualization, dense leaf-mass regions colored dim and structural skeleton regions colored bright, exactly as the brief predicted. This is real architectural validation: the third inference channel (species priors as input) is a working leaf-discriminator.
- **The apparatus base ports forward cleanly.** Spiral rig + per-rig stereo + multi-rig consensus deposit + candidate-density field all functional at N=50 in ~66s (well under the <2min budget). The Posture-B discipline held throughout the implementation; source 3D positions only entered via the documented carve-outs.
- **Heartbeat (Std Req #10) implementation works** — universal floor format printed every phase boundary plus every 30s wall-clock, tail-f-glanceable. The operator-readable progress signal was the right design.
- **Determinism verified** with `--workers=1` (RANSAC + classifier all reproduced byte-identical output across runs at the same seed).
- **Schema additions (`expectedTipRadius`, `expectedTipHeightFrac`) and position-conditioned branch-angle prior** were sensible improvements over the brief-as-written. If/when re-entered, these should be codified into the brief schema spec.

### What failed at the gate (the load-bearing finding)

- **Tip detector emits ZERO anchors on both dev specimens at N=50.** Acceptance criterion (c) — operator visually audits tip-anchor set, every anchor sits at the visual end of a real branch — fails by emptiness.
- **Diagnosis (per Penzias, confirmed by operator's visual):** the six-gate conjunction's gate 1 (`c.classification == 'tip'`) is starving the pipeline. Tomography's "unimodal one-sided" tip-class definition fires too rarely on real LiDAR — raw class fractions land at 27/68/5 (linear/junction/tip) vs the prior's expected 62/8/30. Most real branch tips at N=50 produce noisy tomography distributions that get misclassified as junctions (multimodal) or noise (flat). Gates 2-6 (geometric_confidence, nbhd-count, PCA elongation, taper sign, priors tip-class likelihood) never get evaluated because gate 1 has already filtered the candidate out.
- **Raw classification distribution fails criterion (a)** (27/68/5 vs target 62/8/30). The high-confidence subset DOES match the expected skew (80/20/0) but the tip count remains stuck at zero even after priors-based filtering, because no candidate has the tomography label 'tip' to begin with.
- **The operator's broader visual judgment:** the post-N.3.0 point cloud is still "very very busy" — leaf-soup is not visibly clearing in the candidate cloud even though the `prior` channel correctly dims it numerically. Criterion (b) passing the numerical test does not visually translate to "this is on its way to a clean canopy." That gap between numerical-priors-work and visually-clean-canopy is what tipped the shelve decision.

### What was NEVER tested (the load-bearing absence)

Everything past N.3.0 is unbuilt and untested. The shelve loses no validated work because nothing past N.3.0 was ever validated:

- **N.3.1 — adaptive scan via verdict-rate stopping**: the three-guard termination (`batches_in_pass ≥ min_batches_before_stop=4` AND `eligible_fraction ≥ min_eligible_fraction=0.30` AND `batch_verdict_rate < verdict_rate_threshold=0.005`), the per-point `prev_would_verdict` carry-across-batches map, the lightweight Phase 2 + Phase 4-attribution-only inside the scan loop, the `eligible subset` filter that the Doppler audit added to prevent the K_rigs_min suppression bug. None of this was implemented. The verdict-rate machinery was the most-audited piece of the brief (Doppler's narrow fourth audit fixed two criticals + four importants in it) and got zero runtime exercise.
- **N.3.2 — bidirectional axonal growth from trunk + tip anchors**: the step-by-step probe advancement (not cone-shot), the species-curvature-priors-blend at each step (`curvature_prior_blend` weight, default 0.5), the handshake recognition (proximity AND directional agreement), the M_obs vs M_interp separation (the hallucination safeguard), the `from_handshake` / `from_taper_only` flags. The entire load-bearing extraction primitive — the one the restructure was built around — was never built.
- **N.3.3 — pipe-model radius accumulation + taper co-determination** — never built.
- **N.3.4 — Rubin consensus-stability validation** — never built.
- **Phase 5 multi-component handling + BFS parent assignment + `orphan` flag emission** — never built.
- **The full output JSON schema with `from_handshake` / `from_taper_only` / `orphan` per-spline flags + extensive `perPassDiagnostics` (verdict-rate curve, eligible-fraction curve, handshake count, stalled-probe count, etc.)** — exists as spec in the brief, no implementation.

The brief itself stands as a complete (and four-times-audited) specification for everything past N.3.0; if re-entry is justified, the implementer would build forward from Penzias's foundation against that spec.

### Why shelved rather than patched-and-continued

The proposed incremental fix (drop gate 1, restore brief-spec defaults, re-run N.3.0) would be the START of a different architecture, not a small patch. The brief's whole tip-detection sub-architecture was anchored on tomography's class taxonomy doing useful work; if it doesn't, the geometric-and-priors gates (2-6) alone become the tip-precision criterion, which is a different design that would need its own validation pass. And there's no guarantee the geometric-only five-gate detector would work either — Penzias's `combined > 0.3` subset showed 0% tips, suggesting the geometric+priors gates aren't pulling out tips even when allowed to.

Operator's assessment: two days of work, no further than baseline (Tycho's rev. 1 was a wireframe ball; rev. 2's N.3.0 demonstrates the priors work but doesn't visibly clear the leaf-soup either). Not on its way. Better to refocus on procedural for launch.

This is a correct read per existing project doctrine: [[feedback_procedural_trees_are_the_destination]] (procedural is the destination, never adopt vendor or wait on research arcs); [[project_park_is_the_gem]] (procedural runway dominates v1.5 through ship); the G.1 hand-grounded PRESETS path was always the doctrinal default for grounding procedural defaults from LiDAR by eye, with no apparatus required.

### Re-entry conditions

Concrete things that would have to be true to justify spinning Li'l Vera back up:

1. **A different tip-detection mechanism is available.** Concrete examples:
   - A learned classifier trained on labeled LiDAR tip data (would require labeled data we don't have).
   - A confidently-classified-linear-chain-endpoint detector that finds tips as the spatial ends of coherent linear-class chains, rather than relying on tomography purity AT the tip candidate itself.
   - A multi-scale tip detector that aggregates evidence across spatial scales (a tip looks like a tip at small scale but like a chain-end at larger scale).
   - A pure-priors tip detector that scores candidates by `priors.likelihood(class='tip', height_frac, radial_dist, inferred_radius)` alone without any tomography-class requirement.
2. **A fundamentally different architecture is on the table** that doesn't depend on tip anchors as the canopy-extraction starting point. (E.g., a junction-anchored architecture; a density-flow architecture; some other framing entirely.)
3. **The procedural runway has shipped (Phase G.1 complete + further procedural heroes done) and there's actual capacity for an R&D spike.**

Without one of those three, another spike would just rebuild what was tried.

### Concrete artifacts left in tree (do NOT delete)

- `arborist/lil_vera_v2.py` (commit `2c4f61a`) — apparatus base + classifier + tip detector. Foundation for any re-entry.
- `arborist/state/acer_saccharum/botanical-priors.json` — hand-encoded Sugar Maple priors. Load-bearing regardless of whether the apparatus consumes them: the operator can use these numbers as starting values when authoring procedural PRESETS defaults in Phase G.1.0 (see "What this informs for Phase G.1" below).
- `arborist/serve.js` v2 endpoints — three routes at `/lidar/specimen/:treeId/lil-vera-v2-*`. Leave wired so re-entry doesn't need to re-wire serve.js.
- `src/arborist/LidarWorkstage.jsx` 6th alignment-oracle layer + v2 tuner subsection + `VeraV2Diagnostics` panel. Leave wired so re-entry doesn't need to re-wire the workstage.
- `scratch/phase-n2-lil-vera-observational-skeleton-brief.md` — the full brief (seven commits since rev. 2 baseline; four independent cold audits + restructure). Comprehensive specification for everything past N.3.0. Re-entry would read this cold to remember the full architecture.

### Audit-chain history (so re-entry doesn't re-litigate brief decisions)

Brief was audited four times before dispatch — re-entry should NOT re-decide any architectural question that was already settled in these passes. Refer to the commits for what was caught and how:

- **Curie** (`036cfdf`, 2026-05-20): first cold audit on the rev. 2 PM draft. Caught 5 critical spec gaps + ~6 minor. Largely classifier + priors layer issues.
- **Fraunhofer** (`9ac8387`, 2026-05-20): second cold audit. Caught 3 criticals + 7 importants in the post-Curie draft. Phase 4 Posture-B carve-out gap + candidate→source-point attribution ambiguity were the load-bearing finds.
- **Restructure** (`b307541`, 2026-05-20 evening): pre-dispatch reframe. Tips-first + axonal growth + adaptive scan + ridge-tracing removal. This was the operator-driven architectural shift after the Fraunhofer audit; not an audit, but the load-bearing event in the brief's evolution.
- **Bessel** (`25e08f3` + `2e7cc2b`, 2026-05-20 evening): third cold audit on the restructured brief. Caught 4 criticals + 5 importants. Notable finds: missing `tip_geometric_min`/`min_nbhd_count` hyperparameter defaults, `expectedLocalDirection` 1D→3D reconstruction underdetermination (added `axialFallbackRadius` + radial-outward azimuth), output-schema missing the new `from_handshake`/`from_taper_only`/`orphan` flags, Phase 5 stale-acceptance-criterion back-reference. Also resolved the cluster-detector → verdict-rate scan replacement (operator's call) and the heartbeat spec.
- **Doppler** (`bdd66c1`, 2026-05-20 evening): narrow fourth audit on the verdict-rate scan machinery (which I authored in one unaudited commit). Caught the early-batch K_rigs_min suppression bug (would have terminated leafy-specimen scans at ~100 rigs) + denominator ambiguity + implicit per-point `prev_would_verdict` state. Fixes added the eligible-subset filter, `min_eligible_fraction` guard, raised `min_batches_before_stop` from 2 to 4.

If you re-enter and find yourself re-deriving any of these decisions, stop and read the relevant commit body — the rationale is captured there.

### Scope-drift items Penzias surfaced (status frozen at shelve)

Per Std Req's "surface scope drift" clause, Penzias flagged six items in their status. Statuses at shelve:

1. **Tip-detector emits 0 anchors** — the load-bearing finding; cycle shelved on this.
2. **Raw class fractions 27/68/5 vs target 62/8/30** — diagnostic of #1; not separately addressed.
3. **Default-knob retuning vs brief spec** (e.g., `tipGeometricMin 0.5 → 0.12`) — Penzias retuned defaults to get the tip pipeline to fire at all, then surfaced. Coordinator's intended call was to revert to brief-spec defaults before re-running. Cycle shelved before re-run, so retuning persists in the committed module. If re-entered, revert defaults per brief or supersede with new architecture.
4. **Priors-schema extensions: `expectedTipRadius` + `expectedTipHeightFrac`** — sensible additions to prevent trunk-base spurs passing tip plausibility. Coordinator's intended call was to ratify and codify into the brief. Not codified before shelve; the priors file in tree includes these fields but the brief schema doesn't. If re-entered, codify or re-evaluate.
5. **Position-conditioned branch-angle prior** (use `expectedLocalDirection` modal vs literal `branchAngleDistribution.fromVertical.modal=50°`) — sensible (literal 50° was canopy-scaffold value; near-trunk needs vertical priors). Coordinator's intended call was to ratify and codify. Not codified before shelve.
6. **Run files ~84MB at N=50** — saved-runs picker pagination concern for N.3.1. Forward-looking; N.3.1 never reached.

### What this informs for Phase G.1 (the active arc now)

Penzias's `botanical-priors.json` represents real hand-encoded Sugar Maple morphology values (from Hallé & Oldeman 1970 + USDA growth tables per the brief's source citations). These numbers are usable as starting values for procedural PRESETS authoring in Phase G.1.0 (operator-eye PRESETS from 3-5 LiDAR specimens):

- `expectedRadiusByPosition` samples → procedural radius-by-height-and-radial taper function defaults
- `branchAngleDistribution.fromVertical` modal/min/max → procedural scaffold-angle distribution defaults
- `branchingDensityByHeight` → procedural branches-per-meter-by-height defaults
- `hardRejections.radiusAboveAtHeight` + `branchAngleSteeperThanDeg` → procedural sanity caps
- `expectedJunctionFraction` / `expectedTipFraction` / `expectedLinearInteriorFraction` → procedural skeleton-node distribution targets

When G.1.0 dispatches, the implementing baby should read the priors file as authoring reference, not just G.1's own brief. The hand-encoding work is real and shouldn't be redone from scratch.

### Penzias dismissal

Operator thanked Penzias and confirmed cycle shelved. No re-dispatch.

---

## 2026-05-20 evening — Project: Li'l Vera — rev. 2 restructured + dispatched (post-audit chain)

**Brief at `scratch/phase-n2-lil-vera-observational-skeleton-brief.md` is dispatched.** Six commits since rev. 2 baseline; four independent cold audits + a substantial pre-dispatch restructure. Implementing baby picks own name and starts at N.3.0.

The shape of the algorithm after restructure (changes from the rev. 2 PM pivot earlier today):

- **Tips-first, middle-out, adaptive-scan, growth-shaped.** Operator review of the rev. 2 PM draft concluded the algorithm as written still "made decisions too fast" — leaning on Hessian ridge tracing as the primary structure-extractor, classifications committed eagerly per pass, fixed-N spiral. The restructure replaced ridge tracing with precision-gated tip detection (six-gate conjunction) + RANSAC trunk as the two confident anchor sets, then made the neuronal reacher the *primary* extraction primitive (not just connectivity-completer): bidirectional axonal *growth* — step by step, not cone-shot — from anchors through M_obs with species curvature priors steering each step; handshake fires when opposing probes meet with directional agreement. Ridge tracing is an explicit non-goal now.

- **Adaptive scan via verdict-rate, not geometric cluster detector.** First-pass restructure spec'd a geometric cluster detector ("scan until no blobby long-pointy mass") which suffered an M_obs ghost bug (monotonic accumulation preserves rejected-leaf signatures forever → detector demands more scanning eternally). Replaced with a verdict-rate stopping criterion: scan terminates when the *eligible subset* (source points with rigs_seen ≥ K_rigs_min) has a per-batch would-be-verdict change rate below `verdict_rate_threshold` (default 0.005). Three guards must all fire to terminate: `batches_in_pass ≥ min_batches_before_stop` (default 4) AND `eligible_fraction ≥ min_eligible_fraction` (default 0.30) AND `batch_verdict_rate < verdict_rate_threshold`. Direct behavioral measurement of "is more observation changing the apparatus's mind?" — ghost-free.

- **Heartbeat as Std Req #10.** Long runs (1–2 hours expected) need an operator-readable progress signal so `caffeinate`-running operators can distinguish "still working" from "hung" via `tail -f`. Universal floor format `[pass N | phase=<tag> | |P|=X | splines=Y | elapsed mm:ss]` plus phase-specific extras for each of: scan, classify, tip-detect, grow, eliminate, pipe-model, validate. Output file size negligible (~400 KB worst case).

Audit chain that hardened the brief: **Curie** (`036cfdf`, first cold audit — caught 5 critical spec gaps + ~6 minor in the rev. 2 PM draft). **Fraunhofer** (`9ac8387`, second cold audit — caught 3 criticals + 7 importants in the polished draft, including the Phase 4 Posture-B carve-out gap and the candidate→source-point attribution ambiguity). **Restructure** (`b307541`, pre-dispatch reframe — tips-first + axonal growth + adaptive scan + ridge-tracing removal). **Bessel** (`25e08f3` + `2e7cc2b`, third cold audit on the restructured brief — caught 4 criticals + 5 importants including the missing `tip_geometric_min`/`min_nbhd_count` hyperparameters, the `expectedLocalDirection` 1D→3D reconstruction underdetermination, the stale `from_handshake`/`from_taper_only`/`orphan` fields missing from the output schema, and the Phase 5 stale-acceptance-criterion back-reference; also resolved the cluster-detector → verdict-rate replacement and the heartbeat spec). **Doppler** (`bdd66c1`, narrow audit on the verdict-rate machinery authored in one unaudited commit — caught the early-batch K_rigs_min suppression bug that would have terminated leafy-specimen scans at ~100 rigs, plus the denominator ambiguity between `|attributed_candidates|` and `N_batch_candidates_attributed`, plus the implicit per-point `prev_would_verdict` state).

What every audit confirmed clean: Posture B's five carve-outs (rasterizer-masked input, bbox scalars, RANSAC trunk axis, Phase 4 mask preparation, final validation); the three load-bearing primitives' load-bearingness (iteration + elimination, species priors, neuronal mutual recognition — now extraction-primary); determinism story (`--seed` covers RANSAC + stochastic probe init); the `ε_attribution` nearest-candidate bridge between Phase 2's per-candidate scalars and Phase 4's per-source-point elimination.

**Dispatch state:** Brief is settled. Implementing baby reads `scratch/phase-n2-lil-vera-observational-skeleton-brief.md` cold, picks their own name, starts at N.3.0 (classifier + priors + tip-detector precision validation on a static N=50 dataset). Five stages with stop points; no batching. Memory [[project_lidar_as_training_data]] refresh deferred until N.3.2 outcome — wait to see if the apparatus actually pops before committing the doctrinal language to the rephrased shape.

What stays unchanged from rev. 1: Tycho's `lil_vera.py` module, apparatus base, tomography primitives, 5th alignment-oracle layer ("Li'l Vera v1 baseline"), heat layer, Saved Runs picker, serve.js v1 endpoints. Rev. 2 builds parallel infrastructure in a new module + new endpoints + new 6th alignment-oracle layer (orange-gold / deep-teal). v1 stands as the baseline-comparison artifact.

---

## 2026-05-20 PM — Project: Li'l Vera — rev. 2 pivot — adding the missing iteration loop

**Tycho shipped rev. 1 across `604dfed` / `de00a30` / `0d9102d`** (Stages N.2.0 / N.2.1 / N.2.2). Apparatus base + multi-rig observation + orientation tomography + ridge tracing + axonal glimpse-reach + taper projection all in place. Visual gate review surfaced a structural gap: **the canopy is a wireframe ball; the apparatus has no mechanism to clear it.**

Operator's diagnosis (precise): "There should be no leaf clusters left if you did what we said we were going to do." And shortly after: "This set of algorithms seem to be tracing to define a *surface* when I was expecting to find the centerlines that we could procedurally add radii to."

Both observations are correct. Re-reading the brief revealed the coordinator's failure: during the brief revision in conversation, the load-bearing **iteration-loop-with-elimination** primitive — extensively discussed in the design session — was dropped from the written spec. Specifically missing:

- Three-outcome elimination per pass (locked-in / rejected / deferred)
- `P_N ⊂ P_{N-1}` — strictly shrinking working set
- Rasterizer rendering MASKED source cloud (locked-in + rejected points excluded between passes)
- Confident leaf / sheet-artifact / noise rejection driving elimination
- Rubin-style residual subtraction as a co-primitive alongside accumulation
- Parametric spline output (vs dense voxel-node graphs)

Tycho built precisely what rev. 1 said. Rev. 1 said the wrong thing. Coordinator failure, surfaced honestly, fixed now.

**Rev. 2 of the brief lands** at `scratch/phase-n2-lil-vera-observational-skeleton-brief.md`. The structural changes:

1. The brief is now organized around an **iteration loop** that explicitly subtracts confident classifications from the working set each pass. Phase 4 (three-outcome elimination) is now load-bearing, not implicit.
2. **Rubin-style subtraction** is added as a co-primitive in the Epistemic Posture, alongside Monte-Carlo evidence accumulation. The two are presented as halves of one mechanism — accumulate evidence, subtract what's confidently classified, study the residual.
3. **Species-conditioned botanical priors** added as the third inference channel. The apparatus is given specimen species identity as a *known input* and consults a position-dependent species spatial-prior file at every classification decision. This is the leaf-discriminator pure geometry lacks — leaf-mass at impossible-for-skeleton positions gets rejected because the species prior says "no Sugar Maple skeleton structure here." Directly addresses rev. 1's classifier failure (63% junction rate at N=500 vs botanical ~8%). Per-species `botanical-priors.json` files; hand-encoded for Cycle 1, statistically refined in Cycle 2+.
4. **Output specification is parametric splines** (100–500 per tree, 3–10 control points each, parametric `radiusFn`), NOT dense voxel-node graphs (~40K nodes was rev. 1's actual output — too dense for procedural use by 10–100×).
5. **Neuronal mutual recognition** elevated to load-bearing connectivity primitive. Phase 3b is bidirectional probe + reciprocal recognition (filopodia-like, synapse-formation analogy), not one-direction extension. This is what makes the algorithm neuronal vs path-finding.
6. **Fresh build, not retrofit.** Rev. 2 lives in a new module `arborist/lil_vera_v2.py`; fresh baby; Tycho's three commits stand as baseline comparison artifacts (5th alignment-oracle layer = "Li'l Vera v1 (baseline)"). Architecture is woven throughout (iteration touches every layer); surgical retrofit was not a coherent path.
7. Stage numbering shifts from N.2.x to N.3.x to mark the fresh build. N.3.0 is now classifier-first gate (validate tomography + priors on static dataset BEFORE any iteration machinery).
8. Tycho's MST closure compromise from rev. 1's N.2.2 is removed; connectivity must emerge from genuine mutual recognition. MST was a band-aid for the broken iteration loop + missing prior channel.

**What stands as baseline from rev. 1:** apparatus base (rig + spiral + per-view classification + stereo), tomography primitives, 5th alignment-oracle layer + heat layer + Saved Runs picker, serve.js endpoints + query-string regex fix, cyan-magenta layer color convention. All survive untouched; v2 builds parallel infrastructure in a new module (`lil_vera_v2.py`) with its own 6th alignment-oracle layer (orange-gold / deep-teal).

**Long-term architecture clarified:** Li'l Vera's role is the per-specimen **parametric skeleton extractor**. Cycle 2+ aggregates across specimens for per-species parameter distributions; procedural generator (G.0 strong-leader + G.1 hand-grounded PRESETS) consumes those distributions at runtime. **Li'l Vera is upstream of runtime; never directly shipped to LS scenes.** Procedural is the runtime; Li'l Vera grounds its defaults.

`arborist/BACKLOG.md` updated with the new phase shape. Memory `[[project_lidar_as_training_data]]` to be refreshed after N.3.2's outcome.

Pre-pivot dispatch state — Tycho's three commits stand as the foundation; rev. 2 dispatch is the next move once operator + coordinator agree on the plan.

---

## 2026-05-20 — Project: Li'l Vera — vision + scope discipline

Phase N.2 has matured from "an algorithmic spike" to **Project: Li'l Vera** — a multi-cycle initiative to build a Monte-Carlo consensus-inference observational skeleton-extraction apparatus. Named in honor of the operator's beloved AND of Vera Rubin; the project carries that lineage forward.

**Long-term aspiration (operator's framing, 2026-05-20):** Li'l Vera, if it pops on the v1.5 visual quality bar, has the potential to be a publicly-released open-source tool that fills a real gap — point-cloud-to-GPU-friendly-vector tree generation, accessible to indie game devs / architectural viz / education / citizen science / open asset libraries, eventually consuming iPhone photogrammetry inputs (Posture B's design enables this generalization for free). SpeedTree dominates the high end; Blender's Sapling addon serves hobbyists; nothing currently serves the middle. "Make real waves" framing.

**Scope discipline that matters MORE now, not less:**
- Cycle 1 (First Light) gate stays: "does Li'l Vera produce visibly cleaner skeleton than QSM/Hawthorn-Bidirectional on one specimen?" That's the load-bearing visual question. Open-source release, photo input, web UI, documentation — all downstream and only earn development time if Cycle 1 pops.
- Build then announce, not announce then build. Vera Rubin published dark matter results after observations were in. We build Li'l Vera, validate it, demonstrate it privately first.
- Cycle 1's brief at `scratch/phase-n2-lil-vera-observational-skeleton-brief.md` deliberately constrains scope to the single-specimen apparatus + first observation. Future cycles add: multi-specimen + species-level distribution learning (Cycle 2), photogrammetry inputs (Cycle 3), procedural-generation integration (Cycle 4), packaging + release (Cycle 5+).

This entry exists so future coordinators know what Li'l Vera might grow into — but Cycle 1 stays narrowly focused.

---

## 2026-05-20 early hours — Phase N.1 spike → dual-track pivot

Hawthorn shipped `c9bf5df` end-to-end: bidirectional skeleton Strategy A (geodesic Dijkstra on density-weighted KNN graph) integrated into the alignment oracle as a 4th magenta/yellow overlay. 5 specimens converged in <3s; deterministic; topologically cleaner than QSM. Operator-visual gate call: "I *guess* it's cleaner? But it's hardly closer to being a tree."

Honest read: both algorithms extract from real LiDAR, which is inherently a wire-frame mess (occlusion, twig dropout, partial coverage). Extraction is bounded by data; constructive algorithms aren't. Cleaner extraction delta is real but not the visual breakthrough.

**Dual-track pivot:**

1. **G.1 procedural-runway** — fall back to procedural-only Sugar Maple hero with hand-grounded PRESETS (3–5 LiDAR specimens, eyeball stats, hand-edit PRESETS row) + Phase F leaf binding + dice/adopt iteration. Get something on the runway. Brief at `scratch/phase-g1-sugar-maple-procedural-runway-brief.md`.
2. **Phase N redirect — neuronal backward-forward** — operator named the real algorithmic novelty: trace tip→ground paths (backward pass), then walk ground→tips accumulating cross-section from path-bundle density (forward pass). This IS the pipe model (Shinozaki 1964) / Murray's law, implemented as path-bundling with emergent radius. Radius isn't a heuristic — it's count(paths through point). Branching geometry is exact. Neuronal analogy is structural, not decorative (dendritic integration = branch confluence). Specialist baby brief in planning.

Phase T (statistical scalar extraction) demoted to fallback if neuronal specialist work doesn't pop. Memory `[[project_lidar_as_training_data]]` body not yet updated — will refresh AFTER specialist spike resolves, not pre, to avoid locking in an untested doctrine.

---

## 2026-05-19 night — Phase N.0 — Alignment Oracle + frame-convention resolution (Baby Cedar)

**Shipped:** the LidarWorkstage viewport is now the load-bearing alignment oracle for every future bake-pipeline change. Three persistent layers — source point cloud, live QSM cylinder extraction, baked GLB — each with a visibility toggle and an opacity slider, all overlapping at the same origin and scale for any selected specimen with a baked variant.

### Frame convention — resolved end-to-end

**Canonical convention: the baked GLB artifact ships Y-up. Runtime three.js consumers add NO rotation. Source-frame overlays (point cloud, live cylinder extraction) apply the Z→Y rotation at load.**

- `arborist/bake-tree.py` applies `rotation_matrix(-π/2, [1,0,0])` to the scene before `scene.export`, and the matching `(x, z, -y)` remap to tips. Already in place (pre-N.0 attempt). KEEP.
- `src/components/InstancedTrees.jsx` consumes the GLB as-is — translation + Y-rotation only, no orientation correction. KEEP.
- `src/arborist/LidarWorkstage.jsx`:
  - `PointCloud`: applies `g.rotateX(-π/2)` at PLY load — source PLY is forestry Z-up. KEEP.
  - `CylinderSkeleton`: applies inline `(x, y, z) → (x, z, -y)` per node — server-side `lidar_extract.py` emits source-frame nodes. KEEP.
  - `BakedGlbOracle` (this stage's rename of `BakedPreview`): NO rotation. The double-rotation bug from prior coordinator session is gone — that surgical fix in bake-tree.py was compounding against `BakedPreview`'s `s.rotateX(-π/2)`. Resolved by deleting the rotation from the runtime side, not the bake side, because the bake side is the right place to canonicalize (production InstancedTrees has no chance to apply an orientation correction).

The 4 already-baked variants in `public/trees/acer_saccharum_procedural/` (mtime 20:50) post-date the bake-tree.py rotation (mtime 20:47) — no re-bake needed, they're already Y-up canonical.

### Oracle UX

- `LayerControl` chips top-left of the viewport: each layer's toggle + 0–1 opacity slider in one vertical card. Visibility and opacity are decoupled (dimming a layer doesn't lose its toggle state).
- Scrubbing the specimen list updates the oracle without re-bake: hero manifest fetched once per `heroSpecies` switch; on selection, the matching variant (by `treeId`) is looked up and the LOD0 GLB URL is built with a `?v=<bakedAt>` cache-buster. If the selected specimen has no baked variant, the Baked GLB chip shows "(not yet baked…)" and the toggle disables.
- Post-publish, the hero manifest is re-fetched so a freshly-baked variant becomes immediately scrubbable in the oracle.

### Acceptance (operator-gated — needs Jacob's visual pass)

| # | Criterion | State |
|---|---|---|
| 1 | 5 specimens overlap: cloud + cylinders + GLB | needs operator visual scrub in `/arborist` |
| 2 | No specimen sideways / half-submerged in any layer | code-gated: single Y-up convention enforced end-to-end |
| 3 | Clean toggles + opacity slider per layer | shipped |
| 4 | Scrubbing list updates overlay without re-bake | shipped (hero manifest cache + per-treeId variant lookup) |

Only 4 of the hero's specimens are currently baked (10186, 10171, 10244, 10170). Operator can either validate against those 4 + spot-check a 5th by publishing a new one, or treat the 4 as sufficient for the visual pass.

### Scope drift (surfaced per [[feedback_baby_must_surface_scope_drift]])

- **`arborist/serve.js`** — added `heroSpecies: decl.heroSpecies || null` to the `/species` list response. One-line additive change; the workstage needs the hero id to build oracle URLs without coupling to publish-state. Mirrors the existing `forSpeciesName` exposure.
- **`BakedPreview` → `BakedGlbOracle` rename.** The component is no longer the "post-publish preview" affordance — it's the persistent regression-catch surface per the N.0 brief. New name + new behavior (per-specimen lookup, opacity, no rotation, no diagnostic console.log). Replaces the broken Stage-1.5 prototype called out in the prior-session evening note.
- **`layers.skeletonOnly` / `layers.fullPreview` toggles removed.** They were Cycle-1 modal aids that don't survive the 3-layer-oracle framing (skeletonOnly hid points but kept cylinders; fullPreview was a no-op against the brief's three named layers). Their behavior is recoverable as a combination of the 3 toggles + opacity sliders.
- **No new dependencies.** No re-bake required. No bake-tree.py changes (just confirmed the rotation block is correct).
- **`SpecimenViewport.jsx` not touched.** It already lives in the "source-frame, rotate at load" Y-up convention via `g.rotateX(-π/2)` (line 558) and `rotation={[-Math.PI/2, 0, 0]}` (lines 130, 403, 414, 539). Consistent with the convention this entry ratifies.

### Stop point — operator visual pass needed before N.1 dispatch

Per the maxi brief, N.0 stops here. Once operator confirms 5/5 green on the alignment oracle, dispatch N.1 (bidirectional-growth prototype).

---

## 2026-05-19 evening — LiDAR-runtime → LiDAR-as-training pivot

**Third major architectural pivot today.** Following Stage 1's ship (`12ef2a1`), operator + coordinator built Stage 1.5 (the "Baked preview" toggle loading the published GLB inside LidarWorkstage so operator validates per-region bark without tab-switching to /cartograph.html). Multiple debugging iterations on alignment + scale — GLB landing at wrong XZ position, wrong height (27.7m vs CSV's 18.7m for specimen 10171), side-by-side with the diagnostic instead of overlapping.

In the middle of debugging, operator looked at the comparative view and named the load-bearing observation: **"the point clouds right now are more evocative of real trees than the geometry we've tried to apply."** The QSM cylinder mesh extracted by `bake-tree.py` reads as fragmented + abstract. The trunk-authenticity premise that justified Option δ (LiDAR-runtime-trunk + procedural-canopy) doesn't materialize when the extracted geometry looks worse than parametric procedural cylinders.

### The pivot

LiDAR's role changes from RUNTIME ARTIFACT to AUTHORING-TIME STATISTICAL TRAINING SOURCE.

**Per-species statistical extraction:**
- For each LiDAR specimen of a species: compute DBH, total height, W:H crown ratio, branching density per height meter, mean branch insertion angle from vertical, leader strength (how far the central axis continues through the crown), architecture-mode classification (Rauh's vs Massart's / Troll's), per-anchor canopy density
- Aggregate across N specimens of one species → mean + variance JSON
- Persist to `arborist/state/<species>/lidar-stats.json` (committed; load-bearing artifact)

**Generator integration:**
- `generate-procedural.js` reads `lidar-stats.json` if present
- Computes PRESETS defaults from the mean (per-species, per-parameter)
- Per-instance jitter samples from variance using the existing `mulberry32` seed stream
- Procedural species become statistically-grounded in real-tree data without runtime LiDAR cost

**Operator workflow:**
1. Browse + visually validate LiDAR specimens in the LidarWorkstage (Cycle 1 ships this surface — repurposed for the training-set curation pass)
2. Mark which specimens count as training data (reject scans with poor coverage, heavy occlusion, unusual topology)
3. Run the extraction script
4. Procedural PRESETS auto-update
5. Iterate procedural authoring (G.0 strong-leader + Phase F gradient editor) from a statistically-grounded starting point

### Why this is structurally correct

- Honors [[feedback_procedural_trees_are_the_destination]] — procedural is the destination; LiDAR is supporting data
- Honors [[feedback_leverage_vendor_pbr_before_authoring]] — LiDAR library leveraged via statistics, not direct runtime integration
- Honors [[project_park_is_the_gem]] — visual quality bar restored to procedural's runway (which has 4+ perf phases designed: Configuration D, Phase W wind, Phase F gradient maps, override packs)
- Visual upside: procedural cylinders render CLEANER than fragmented QSM mesh
- Future scaling: every additional LiDAR species adds more training data; no per-species runtime work

### What survives

- **`arborist/lidar_extract.py`** — the cylinder graph extraction is the input to statistical extraction; load-bearing for Phase T
- **`arborist/bake-tree.py`** + LOD pipeline — stays for any direct LiDAR-mesh baking case (sub-grove view, future v2 needs)
- **`arborist/serve.js` `/lidar/specimen/*` endpoints** — useful for operator visual validation of specimens before training-pass selection
- **`LidarWorkstage.jsx`** — repurposed as the operator's specimen-curation surface (browse 110 Sugar Maples, validate quality, mark training set). Specimen browser + extraction tuner already work.
- **Per-region bark binding** (Cycle 2 Stage 1, commit `12ef2a1`) — applies to PROCEDURAL too; radius-based trunk vs branch classification works regardless of source. KEEP.
- **`arborist/leaf-pack-bindings.json`** — Phase F leaf surface infrastructure, applies regardless of source
- **`species-map.json` `heroSpecies` field** + park_species_map prepend — useful for procedural-hero substitution flow

### What gets wound down

- **Phase L Cycle 2 Stages 2 + 3** (Configuration D over LiDAR mesh + Phase F integration on LiDAR variants) — superseded; Configuration D doctrine still applies but to procedural meshes
- **`BakedPreview` component in LidarWorkstage** — broken + architecturally moot; remove in next cleanup commit
- **G.1 hero "mixed roster"** (LiDAR-baked + procedural variants) — replaced by procedural-only G.1 with LiDAR-derived defaults
- **`[[project_configuration_d_canopy_render]]` Option δ source split** — Configuration D itself remains the rendering doctrine; Option δ-specific source split is historical

### Memories + BACKLOG state

- **New memory:** `[[project_lidar_as_training_data]]` — captures the full pivot rationale + Phase T shape
- **Updated:** `[[project_configuration_d_canopy_render]]` — Option δ section marked as superseded with historical context preserved
- **Updated:** BACKLOG.md — new Phase T entry; Phase L Cycle 2 marked `[~]` with Stages 2-3 superseded
- **Unchanged (still applies):** `[[project_year_long_tree_doctrine]]`, `[[project_view_aware_baking]]`, `[[project_park_is_the_gem]]`, `[[feedback_procedural_trees_are_the_destination]]`, `[[feedback_leverage_vendor_pbr_before_authoring]]`

### The third-pivot cost

This is the third architectural pivot in a 12-hour session: morning (procedural → LiDAR Option δ), afternoon (doctrine cascade — Configuration D + year-long + override packs + view-aware), evening (LiDAR-runtime → LiDAR-training). Each pivot has cost. The honest record: today's design work was high-velocity but also high-iteration. The doctrines that emerged are stronger for the iteration; the implementation work spent on the superseded paths is bounded (Stage 1 ships per-region bark which is generally useful; Cycle 1 ships LidarWorkstage which gets repurposed; BakedPreview is the only fully-wasted slice).

Operator confirmed pivot after dinner break; the pivot is ratified. Coordinator + operator pausing here for the night; pre-handoff cleanup (this entry + memory + BACKLOG updates) lands; Maxi Baby brief drafted in the next session for the statistical-extraction + PRESETS-integration work.

---

## 2026-05-19 PM — Phase L Cycle 2 Stage 1 — per-region bark + bake-to-roster

**Shipped:** the LiDAR pipeline now publishes end-to-end. Operator picks a specimen, clicks Publish, and ~12s later: skeleton baked, LOD tiers generated, hero species added to active Look's roster, atlas re-baked with per-region bark spec in `barkBySpecies`, placement substitution refreshed. 104 Sugar Maple placements in `public/baked/default.json` now route to `acer_saccharum_procedural` (the LiDAR-baked hero).

### Step 0 pre-flight result (per brief)

All four checks green:
- `lidar_extract.py --treeId=10184 --voxelSize=0.05` → 200 nodes / 105 cylinders / 838ms
- `bake-tree.py --species=acer_saccharum` → 10186 baked in 2.9s
- `POST /lidar/specimen/10186/extract` (un-prefixed, direct to :3334) → valid JSON
- `/arborist` UI render deferred to operator visual check

Deltas from brief: only 10186 is starred today (brief assumed two); pre-flight curl path needs the un-prefixed form when not going through Vite proxy.

### Carrier choice — primitive split

Operator ratified (B) over (A) vertex-colors and (C) extras-only. Three reasons surfaced as load-bearing: (1) vertex colors die in bake-look's COLOR_0 strip; (2) primitive split lines up perfectly with the existing bark+leaf-as-separate-primitives convention from the procedural pipeline; (3) the runtime infrastructure already handles per-draw uniform mutation via `applyBarkUniforms` — adding a region dimension is the lightest possible extension. Forward note for Stage 2: Configuration D adds outer-cards + inner-mass primitives → potentially 4 primitives per tree post-Stage-2. Architectural shape stays clean since each primitive category has its own mesh-name marker.

### The atlas-survey gotcha

First end-to-end test surfaced an unexpected miss: trees-atlas.json showed `barkBySpecies.acer_saccharum_procedural` populated correctly but the baked GLB primitives had empty extras. Root cause: `atlas-survey.js:124` skips materials with no `baseColorTexture`. trimesh's `PBRMaterial` had no texture → survey skipped both materials → tile lookup missed → bake-look's rewriter continued past `setExtras`. Fix: `lidar-publish.js` reads `manifest.bark.trunk.materialRef` + `branch.materialRef`, loads the corresponding `public/textures/bark/<id>/color.jpg` + `normal.jpg`, attaches them to the matching `trunkBark` / `branchBark` materials BEFORE the LOD pass. Atlas-survey then picks them up naturally; tiles dedupe across the roster via sha1; the bark photo packs travel through bake-look untouched. Documented in ARCHITECTURE.md under "Per-region bark binding".

### Scope drift (surfaced per [[feedback_baby_must_surface_scope_drift]])

- **`heroSpecies` field on species-map.json** is a new schema field (not in brief). Authored on `acer_saccharum` to route bake output to `acer_saccharum_procedural`. Operator ratified pre-implementation — supersedes G.1 pre-stage doc's Option B framing (`seedlings.json` lives at scan-source id; hero id is downstream output bucket). Cleaner shape: future many-to-one scan-sources for one hero works without duplication.
- **`lidar-publish.js` is a new file** (~120 LOC). Bridges bake-tree.py's single-GLB output to the LOD-tier shape `bake-look.js` + runtime expect. Not in brief's listed files but unavoidable — bake-tree.py doesn't run publish-glb.js's variant-aware path, and without LOD tiers `surveyRoster` finds zero materials.
- **`bake-trees.js:pickVariant` quality preference** is a one-line addition: restrict the hash lottery to the top-quality tier among preferred-list candidates. ARCHITECTURE.md's "Two-tier substitution" section asserts "heroes win their bucket's quality lottery automatically (`4 > 2`)" but the shipped code didn't enforce it — placements distributed evenly across the candidate list regardless of quality. Without the fix the hero gets ~17/88 instead of all 88. Doctrine ratified, code now matches.
- **`acer_saccharum/manifest.json` stale.** Cycle 1 left a pre-LOD manifest there (one variant with `skeleton: 'skeleton-1.glb'`, no LODs). My edits route the bake to `acer_saccharum_procedural/` so the old manifest is untouched. build-index drops it from the flattened variants list silently. Not breaking; operator can rm if desired.
- **Roster-add side effect.** The publish endpoint auto-adds the hero variant to the active Look's `design.json#/trees` if absent (Stage 1 acceptance #1 says "hits Publish → trees appear" which requires roster membership). Mirrors Grove's "Add to Look" gesture for the freshly-baked hero. Endpoint returns `rosterMutated: true` when this fires.
- **No new dependencies.** All work uses gltf-transform + meshoptimizer + trimesh primitives already in the tree.
- **Shader program count unchanged at Stage 1.** All primitives share the attribute layout `{POSITION, NORMAL, TEXCOORD_0, aBark, aBarkRegion, aLampGlow}` after runtime merge; single material; single compiled program preserved. Operator-verifiable via DevTools.

### Acceptance status (operator-gated items remain)

| Criterion | Self-verified | Operator-gated |
|---|---|---|
| #1 Operator clicks Publish → bake runs | ✓ end-to-end smoke | visual UI verify |
| #2 GLB + manifest at hero path | ✓ files on disk + manifest carries `bark.trunk/branch/regionThreshold` | — |
| #3 bake-look completes (awaited) + `barkBySpecies` updated | ✓ trees-atlas.json `mtime` + block populated | — |
| #4 88 placements render with LiDAR variant | ✓ default.json shows 104 placements on hero | visual /cartograph |
| #5 Trunk vs branch visibly differ at LS Hero | shader code in place | visual zoom needed |
| #6 Single shader program preserved | attribute layout uniform | DevTools `renderer.info.programs.length` |
| #7 Determinism: byte-identical re-publish | ✓ sha1 stable across 2 bakes | — |

### Timings on `acer_saccharum` Sugar Maple seedling 10186

- bake-tree.py: 3.5s (300K pts → 2612 nodes → 972 trunk + 970 branch cylinders → threshold 0.0413m)
- lidar-publish.js LOD pass: ~210ms
- bake-look: ~8.5s (26-species roster, 30 atlas tiles)
- bake-trees: ~250ms
- Total publish: ~12.5s

### Cycle 2 Stage 2 handoff state

- Per-region bark uniforms already shipped → Stage 2's PointsMaterial can compose against the same uniform pattern
- GLB primitive structure: 2 primitives today (trunkBark, branchBark) → Stage 2 adds canopyCard (outer-shell A2C) + canopyPoints (inner-mass) for 4 total
- bake-look rewriter iterates `root.listMeshes()` — adding new mesh-name markers `canopyCard` / `canopyPoints` extends cleanly
- `previewDayOfYear` placeholder for Stage 3 NOT yet on the store; that's Stage 3's add

---

## 2026-05-19 — Phase L Cycle 1 — LiDAR workspace + extraction tuning

**Shipped:** third top-level mode (`LidarWorkstage.jsx`) alongside Procedural + Grove. Specimen browsing, live QSM extraction, multi-layer 3D viewport, save seedlings. Pre-flight repair to `bake-tree.py` so the underlying bake path actually works again. No bake/publish — that's Cycle 2.

### Pre-flight result

`bake-tree.py --species=acer_saccharum` was failing with `KeyError: 'sourceFile'` on both starred seedlings. **Schema drift**, not the numpy 2.x ptp() hazard the brief flagged. The current `serve.js POST /species/:id/seedlings` body schema doesn't accept / persist a `sourceFile` field (look at line 339 — only `starred` + `seedlings` survive); the field is always derivable from `treeId` via the same rule `serve.js:specimenLazPath` uses (`botanica/dev/<treeId>.laz`). bake-tree.py looked it up in two places (source-laz path + variant-meta record). Replaced both with `seedling.get("sourceFile") or f"botanica/dev/{seedling['treeId']}.laz"` fallback. Re-verified: 10184 + 10171 bake clean in 4.0 s total. Pre-flight is back to green for the procedural arc / Cycle 2 builders to lean on.

### Refactor — `arborist/lidar_extract.py`

Lifted `load_pointcloud` / `voxel_downsample` / `cluster_slab` / `extract_skeleton` / `specimen_laz_path` out of the 2026-04-27 `bake-tree.py` monolith into a new module. Added `extract_cylinders(laz_path, voxel_size, min_radius, tip_radius) → {nodes, stats}` as the single-shot wrapper the new HTTP endpoint binds to. Also added a CLI (`--treeId / --voxelSize / --minRadius / --tipRadius` → JSON on stdout) so `serve.js` can shell out the same way it shells out for `bake-tree.py`.

**No algorithm change.** Every line of the lifted code is byte-equivalent to its 2026-04-27 form. `bake-tree.py` imports the four helpers from `lidar_extract`; mesh/tips/manifest writes stay in `bake-tree.py`. This keeps Cycle 2 free to evolve the bake path without re-walking the extraction.

### Endpoints

- `POST /api/arborist/lidar/specimen/:treeId/extract` — body `{species, voxelSize, minRadius, tipRadius}`; shells `lidar_extract.py`; returns `{treeId, nodes: [{x,y,z,radius,parentIdx}, ...], stats: {...}, serverMs}`.
- `GET /api/arborist/lidar/specimen/:treeId/seedling-state?species=<id>` — returns `{treeId, species, saved, displayName, extractionParams}` (falls back to `config.tuneDefaults` when the specimen hasn't been saved as a seedling).
- Extended `POST /api/arborist/species/:id/seedlings` to accept `displayNames: {treeId: name}`. Merge semantics: incoming keys win, `null|""` clears, absent keys preserved on disk (per [[feedback_absence_means_inherit_in_authored_blocks]] so the two workstages — Scan + LiDAR — can each save their slice without trampling).

### Workstage panel choices

The brief specified 4 panels + multi-layer viewport. Implementation choices worth recording:

- **Auto-extract on specimen pick.** Slider changes show the Re-extract button but *don't* re-fire automatically — the operator commits via the button. Mirrors `[[feedback_debounced_save_must_flush_before_dependent_post]]`'s gesture-not-debounce semantics (a re-extract is a 1–5 s operation, not a smooth slider effect).
- **`DraftSlider` reused inline.** Cycle 1 has only three sliders; copying ProceduralWorkstage's pattern locally (150 ms idle + pointer-up final) was cheaper than threading a new shared component. If Cycle 2 grows the panel beyond ~5 sliders, hoist to a shared module.
- **Two `InstancedMesh` draws for cylinders, split at `medianRadius`.** Brief asked for trunk-vs-branch color coding via a hidden tunable threshold `T = median radius`. Implemented as median-of-all-edge-radii computed during extraction (returned in `stats.medianRadius`); the workstage uses that directly. Tunable surfacing is a Cycle 2 concern when per-region bark binding needs an actual threshold to persist.
- **Forestry XYZ → Three's Y-up at render.** Both the point cloud and the cylinder graph carry Z-up coordinates (forestry convention); the viewport remaps to `(x, z, -y)` inline at the mesh-construction site. Matches `SpecimenViewport.jsx`'s point-cloud handling.
- **Specimen-details + display-name editor lives in the extraction tuner panel, not in the specimen-browser row.** Keeps the list dense + scannable; the per-active-specimen editor is one focused surface, not 110 inline forms.
- **Filter syntax accepts `8-12` for a height range.** Substring otherwise. Discovered while writing the filter that operators will want both. Minimal addition; documented in FEATURES.md.

### Auto-suggested leaf pack header

`arborist/leaf-pack-bindings.json` (just-shipped) drives the header readout. Lookup order: `speciesOverrides[<id>]` (`null` is "coverage gap"; string is a packId) → else `shapeToMorphology[<species.leafMorph>]` → first candidate in `morphologyToPacks[morph]`. Cycle 1 INFORMATIONAL ONLY — Cycle 2 will pull from the same file at `bake-look.js` time. Coverage gaps render in red ("coverage gap — no vendor pack") so operators see when Ginkgo / Honeylocust need PSD work.

### Surfaced scope drift

Per [[feedback_baby_must_surface_scope_drift]]. Disclosing in commit body too:

- **`bake-tree.py` refactor approach.** Brief floated "extract_cylinders out of monolithic main(), could land as separate `lidar_extract.py` that bake-tree.py imports." Took that route exactly. The whole load/voxel/skeleton pipeline moved (not just `extract_cylinders` solo) because the four helpers are interdependent and `bake-tree.py`'s `bake_one` calls them directly too. Five lifted symbols; same algorithm; bake re-verified clean.
- **`sourceFile` schema repair done in `bake-tree.py`, not `serve.js`.** Could have gone the other way — extend the POST body to accept + persist a `sourceFile` field. Chose the bake-side derivation because `sourceFile` is *not authored data* (it's redundant with `treeId`), so persisting it would be DRY-violating noise on disk. Bake-side derivation is consistent with serve.js's `attachFileSize` (lines 144–155) which does the same derivation for the specimens list.
- **Filter accepts `8-12` height-range syntax.** Brief said "Filter input (height range or display-name substring)" — implemented both, matched on `^\d+-\d+$`.
- **No new store field beyond `lidarOpen`.** Brief allowed "LiDAR-related store extensions if any" — kept workstage state local to the component so toggling modes mid-session doesn't leak intermediate state across them.
- **HTTP layer for the new endpoints not round-trip verified in this session.** The `lidar_extract.py` CLI was tested directly (returned valid `{nodes, stats}` for treeId 10184 at `voxelSize=0.05`); `bake-tree.py` end-to-end retested clean. The `serve.js` endpoints are syntactically clean but not stood up + curl-verified yet. Operator validation gate.

### Cycle 2 handoff state

- **Endpoints to extend:** `POST /lidar/specimen/:treeId/bake` (or fold into existing `/species/:id/bake` with a per-specimen filter); manifest emission needs to grow `bark.regionThreshold` per [[project_configuration_d_canopy_render]]; Configuration D inner-mass point sampling lives downstream of `extract_cylinders` (consume `nodes` + emit sampled points in the canopy envelope).
- **State Cycle 2 reads:** `arborist/state/<species>/seedlings.json` `{seedlings[].tuneParams, displayNames}` — same shape Cycle 1 writes.
- **Operator validation gates before Cycle 2 dispatches:** (1) stand up the dev server and round-trip the two new endpoints; (2) confirm point-cloud render at LS-realistic specimen sizes (the bake-tree pre-flight ran on 454 K-pt and 128 K-pt clouds; Sugar Maple TLS specimens at full density can be 1M+ pts, brief's stated ceiling); (3) confirm the cylinder color-coding reads correctly for a heritage-class Sugar Maple at workstage scale (median-radius split may need a hidden override for non-symmetric trees).

---

## 2026-05-19 PM — Architecture day: LiDAR pivot + Configuration D + year-long tree doctrine + Phase F reframe

A second long session, this one entirely architectural — no code shipped, multiple BACKLOG / memory / scratch updates. Following the morning's G.0 ship + canary contract ship, the operator + coordinator walked the asset library, the LiDAR pipeline state, and the Phase F leaf surface plan. Result: five major doctrines locked, two memories added, BACKLOG significantly reshaped, Phase F twice-pivoted. Procedural arc paused; LiDAR workspace becomes the next baby cycle.

### 1. Vendor PBR over operator authoring (Phase F pivot 1+2)

The operator + coordinator walked `assets/botanical-reference-hires/` together and found ten 4K PBR leaf packs pre-tagged by morphology in the README — `LeafSet010` is the maple/sycamore palmate pack, `LeafSet016` is oak/lobed, `LeafSet013` is willow/lanceolate, etc. ~80% of LS inventory species covered without authoring. Phase F's earlier "per-species color PSD" doctrine flipped twice in the same session:

- **AM pivot:** color PSD → greyscale shape PSD + complex multi-stop gradient-map color (handles seasonal shifts, per-Look palette overrides, front/back maple-style shimmer via `gl_FrontFacing`)
- **PM pivot:** PSD authoring → vendor-pack binding via manifest. Operator authoring collapses to CONFIGURATION (pick pack, tune gradients). PSD only when vendor library has coverage gaps (Ginkgo fan, Honeylocust fine_compound, etc.).

New memory [[feedback_leverage_vendor_pbr_before_authoring]] captures the doctrine: check vendor library + READMEs before designing authoring workflows. Procedural-trees-are-the-destination still holds for SKELETON (vendor GLBs too heavy); vendor PBR is correct for SURFACE.

### 2. Configuration D — outer-card-shell + inner-mass point cloud

Operator surfaced the canopy alpha-overdraw problem: "what if we card the outer 2 layers and just blur the point cloud for filler leaves?" Coordinator + operator worked the design forward:

- Outer shell: Phase F gradient-map A2C cards on camera-facing surface only (~1500 cards/tree vs current 5500 — 70% reduction)
- Inner mass: `THREE.Points` rendering with size attenuation and sampled gradient color
- Zero alpha overdraw on inner mass (points are 1–9 opaque pixels each)
- Bloom + film grade smooths point-cloud-as-foliage; visual sleight-of-hand robust at LS Hero/Browse distances
- Phase H's original card-core/card-shell plan superseded; Configuration D becomes the architectural pillar

Memory [[project_configuration_d_canopy_render]] captures the doctrine.

### 3. Option δ — LiDAR for trunk only

Operator pressure-tested whether LiDAR was worth the pipeline complexity. Coordinator initially overweighted the LiDAR-everything bundle; operator's "LiDAR trunks are inherently nicer shader quality" intuition surfaced the real tradeoff: LiDAR's value at LS Hero distance is **trunk topology authenticity** (bark wrap onto real-tree geometry vs parametric tubes), not canopy-point-sampling. The pro move surfaced as Option δ:

- LiDAR provides TRUNK ONLY (QSM cylinder extraction)
- Canopy is fully procedural (D.1b emission + Phase F gradient maps)
- Configuration D rendering composition (outer cards + inner algorithmic points, NOT LiDAR canopy points)
- LiDAR-canopy-point-sampling reserved v1.6+ when/if street-view (v2) makes the canopy-fidelity case

Captures the high-value LiDAR win without the high-uncertainty LiDAR investment. Updated [[project_configuration_d_canopy_render]] to reflect Option δ source split. New BACKLOG Phase L entry covers the workspace + render pipeline.

### 4. Year-long tree doctrine

Operator's third major idea: "could we have a year-long tree? bake in seasonal leaf presence/size/color so it behaves like a real tree?" Coordinator worked it forward; this is the actual architectural breakthrough of the session.

- Tree carries its annual phenology cycle baked into the manifest (`leafCluster.annualCycle[]`)
- Each anchor: `{day, presence, scale, gradientFront, gradientBack, optional shapeRef}`
- Runtime samples a `uDayOfYear` uniform (Meteorologist-published, scene-clock-driven)
- Interpolates between adjacent anchors → tree presents correctly for any date
- Sugar Maple peaks orange-red in mid-October because that's literally what it does; Norway peaks yellow; Ginkgo turns gold late November — botanically correct by construction

**What this collapses:** per-Look palette overrides per species → Look is just a date. Halloween = Oct 31 = day 304 → maples at peak fall ramp naturally. Christmas = Dec 25 = day 359 → maples shed, twigs only. Authoring scale was N looks × M species; now M species × ~4–6 anchors (once per species).

**Per-Look art-direction overrides still work** for cases where botanical accuracy isn't what the Look wants. `scene.materialColors[<species>]` channel extended to carry both shape-pack overrides AND gradient overrides per (Look, species) pair. **Halloween bats**, Christmas candy-cane stripes, Diwali ornament gold, Pride rainbow — all expressible as per-Look override packs on top of the year-long defaults. Phase W wind animates override packs identically — bats flutter in the canopy. Genuinely magical use case for the kit.

Memory [[project_year_long_tree_doctrine]] captures.

### 5. Procedural arc parked; LiDAR workspace becomes next dispatch

Per the [[feedback_procedural_trees_are_the_destination]] memory we already had, the procedural arc remains the destination — but for this work cycle, LiDAR is the priority because it unlocks Option δ + trunk-quality win + paves the Configuration D path. Sequencing:

1. Dispatch LiDAR Cycle 1 (workspace + extraction + viewport) — brief drafted, "short entrée" version pasted to operator
2. Operator validates Cycle 1 outputs
3. Dispatch LiDAR Cycle 2 (Configuration D composition + Phase F integration + bake/publish)
4. Phase F brief (gradient editor + annual-cycle authoring + override pack picker) — joint with Cycle 2 since both need the shader infrastructure
5. Meteorologist coordinator-to-coordinator handoff for `uDayOfYear` publish (small contract, similar shape to canary)
6. G.1 Sugar Maple hero brief — dispatches once LiDAR workflow proves out + Phase F infrastructure lands. Hero ships as mixed roster (LiDAR-baked Option δ variants + procedural variants under same species id)

Procedural-arc work parked (G.0 stays as the most recent ship; G.1 pre-stage scratch doc carries the placeholders and gets updated as the architecture settles).

### Doctrine layering (synthesis)

Final architecture after today's pivots:

| Layer | Source | Role |
|---|---|---|
| Skeleton | LiDAR QSM (Option δ) or procedural (G.0 strong-leader) | Cylinder topology — LiDAR provides authenticity; procedural provides fallback + variation |
| Bark surface | Vendor Bark pack + per-region binding (trunk vs branch by radius) | Per-Look retintable via existing uniforms |
| Canopy structure | Procedural D.1b emission on whichever skeleton | Outer cards + inner algorithmic points (Configuration D) |
| Leaf shape | Vendor LeafSet pack (per-species default via morphology mapping) | Greyscale shape; gradient-map drives color |
| Leaf color | Multi-stop gradient LUT per (species, season) | Authored as annual-cycle anchors |
| Time axis | `uDayOfYear` from Meteorologist | Tree presents correctly for any date |
| Per-Look art direction | `scene.materialColors[<species>]` extended | Shape-pack + gradient overrides for special Looks (Halloween bats, Christmas red+white, etc.) |
| Per-instance variation | World-XZ hash + (future) phenology offset | Natural diversity across 88 Sugar Maple placements |

Each layer is independently authored, composes deterministically, ships through the same publish-glb + bake-look + bake-trees pipeline procedural already uses. The whole thing is structurally sound; what's left is execution.

### Operator framing — the park is the gem

Operator named at end of session: "the park is the gem of the square. it has taken a side-seat to get the rest of the app going but this is our major attention now." Doc-update pass triggered immediately. The park-as-gem framing affects coordinator prioritization going forward: trees / canopy / planting are first-class concerns, not afterthoughts. When forced to choose, default toward park polish over peripheral features.

---

## 2026-05-19 — Phase G.0 — `strong-leader` SCA architecture (Rauh's model)

**Shipped:** third structural SCA mode alongside `spreading`. Adds 21st knob (Architecture dropdown) + conditional Leader strength slider in the Canopy panel. Defaults: broadleaf / broad / columnar → strong-leader; weeping / ornamental → spreading.

### Why a new mode was load-bearing (not a tuning question)

Operator + coordinator walked the 20-knob authoring panel against vendor Sugar Maple renders + a defoliated Sugar Maple photo. Real Sugar Maples have:

- **One strong central trunk that continues all the way up through the crown** (not a trunk that stops at scaffold height with N apical children fanning out).
- **~5–7 major scaffolds emerging laterally along the trunk's lower-mid length**, NOT all at one apical point.
- **Every scaffold arcs upward and runs near-parallel to the trunk for most of its length** — sustained +Y tropism, not the base-decay Lift our spreading-mode kernel produced.
- Fasciculate crown silhouette (W:H ≈ 0.6).

This is **Rauh's architectural model** in the Hallé & Oldeman 1970 classification — botanically distinct from oak/elm (Troll's / Massart's, i.e. our existing `spreading` mode). No combination of the existing 20 knobs produces Rauh's topology because the iter-0 seed pattern hardcoded the wrong skeleton: one trunk → N azimuthal apical children. Lift (`scaffoldEmergenceBias`) decays exponentially with path length from each scaffold's trunk attachment — it gives the J-curve at the scaffold base but the scaffold then bends outward with attractor pull, not upward with the trunk.

### The kernel split

`runSCA` now reads `sca.architecture` (default `'spreading'`). The two modes share `runGrowthLoop` unchanged — only the iter-0 seeding differs:

- **`spreading`** (oak/elm/weeping/ornamental): axial chain stops at `branchingStartY`; N scaffolds emerge azimuthally distributed across an upper zone. Same as Phase C.1+D.1a.
- **`strong-leader`** (maple/ash/basswood/columnar): axial chain extends to `Math.max(branchingStartFrac, leaderStrength) × envelope.height`. N lateral scaffold seeds attach at distributed Ys between `branchingStartFrac` and 0.9 of envelope height, each anchored at the nearest axial node by Y, each with random azimuth from the deterministic `rng`. Every scaffold seed carries `localTropism = [0, leaderStrength × 0.4, 0]`. When `leaderStrength < 0.95`, also seed one apical SCA tip (no localTropism) at the topmost axial — the upper envelope grows as a normal spreading-mode top above the leader's reach.

### Tropism-blend choice — sum, not replace

In `runGrowthLoop`'s pull-direction step, per-node `localTropism` is **summed with** global `sca.tropism`, not overwriting. Global tropism (e.g. windward lean, or weeping's `-0.4` Y) is a tree-wide effect; localTropism is a per-scaffold effect. Composing them lets an operator apply a windward lean to a Sugar Maple — global `[+0.2, 0, 0]` + local `[0, 0.4, 0]` → scaffolds run upward AND lean east. Replace semantics would force a choice.

`localTropism` propagates to every spawned child via `localTropism: node.localTropism` in the spawn step (both alternate + opposite phyllotaxis paths). Once a scaffold seed has it, every descendant inherits — sustained over the LIFETIME of the chain, not just at iter-0.

### Defense in depth on Lift

Two changes make Lift redundant in strong-leader mode and prevent operator accidents:

1. **UI hides the Lift slider** when `architecture === 'strong-leader'`. Also hides Spread (`scaffoldZoneFrac`) which doesn't apply since laterals attach by Y position, not by axial-zone fraction.
2. **Kernel zeros `emergenceBias`** when `architecture === 'strong-leader'`. So if an operator imports a `spreading`-mode Lift overlay onto a strong-leader slot, no double-lift.

### Why these defaults, per preset

- **broadleaf / broad → strong-leader, leaderStrength 1.0.** Dominant LS inventory (Sugar Maple + ash + basswood). The current variants were wrong anyway.
- **columnar → strong-leader, leaderStrength 1.0.** Verticality is the literal signature. A central leader threading through the entire crown gives lombardy-poplar / sentinel-form columnar.
- **weeping → spreading.** Curtain morphology depends on apical scaffolds pinned at the trunk top so the umbrella envelope hangs cleanly below. Lateral seeding would scatter the curtain.
- **ornamental → spreading.** Low broad form (dogwood / crabapple / redbud) reads as apical-radial scaffolding. Rauh's would give them a wrong candelabra form.

### Bypass-script numbers

3-seed verification (seed=11, broadleaf preset, width=7 height=7):

| Mode | axial nodes | axial Y range | mean canopy radius | total nodes |
|---|---|---|---|---|
| spreading L=1.0 | 10 | 5.15..8.75 | 3.81 m | 2176 |
| strong-leader L=1.0 | 19 | 5.15..12.35 | 3.59 m | 2777 |
| strong-leader L=0.7 | 14 | 5.15..10.35 | 3.53 m | 2935 |
| strong-leader L=0.4 | 10 | 5.15..8.75 | 3.59 m | 2715 |

Visible difference: axial chain extends through full envelope in strong-leader (12.35 vs 8.75 m), mean canopy radius narrows from 3.81 → 3.59 m (fasciculate sign). Determinism preserved — same input → same node count + positions across re-runs.

### Surfaced scope drift

- Hid the **Spread (`scaffoldZoneFrac`) slider** in strong-leader mode in addition to Lift (brief only specified Lift). `scaffoldZoneFrac` doesn't apply in strong-leader (laterals attach by absolute Y, not by axial-zone fraction). Leaving the slider visible would be confusing UX.
- `branchingStartFrac` defaults left at 0.5 (not retuned). Real Sugar Maples have scaffolds at 30–60% trunk height — operator drags the Start slider to bring scaffolds lower. Choosing not to drift the default avoids retuning weeping/ornamental's `branchingStartFrac` simultaneously.
- The visible trunk shaft now paints through the entire crown for `leaderStrength=1.0` (since `topAxialY` extends to envelope top). Aesthetically expected per Rauh's botanically-correct form; let the operator verify in workstage.

### Out of scope (next briefs)

- G.1 Sugar Maple hero PRESETS row + manifest authoring (separate brief — this brief unblocks G.1 but doesn't ship the hero).
- Phase E monopodial-whorl (conifer) — third Hallé & Oldeman mode reserved but not implemented. Architecture dropdown shows 2 options today (spreading + strong-leader); third tab lands with Phase E.

---

## 2026-05-19 — Arborist → Meteorologist canary tree contract (Arborist half)

Shipped the Arborist half of a two-helper localStorage contract. Grove tiles now carry a `→ Set as Meteorologist canary` button in the hover card that writes `{species, variantId, lookId}` to `localStorage.meteorologist-canary-tree`. Meteorologist's CanaryScene listens for the `storage` event in its own tab and swaps its hero tree to match. The two halves are decoupled: Meteorologist's reader is shipping separately by the Meteorologist orchestrator.

### Decisions worth keeping

- **Affordance lives in `EditorCard`, not on the tile body.** Grove tiles are color-coded by quality rating; adding any visual to the tile itself would compete with that signal. The hover card already hosts per-tile actions (rating ladder, category chips, In-Look toggle, notes), so the canary button extends an existing surface rather than inventing a new one. Per [[feedback_dont_reinvent_existing_ux]].
- **Subtle styling, not a primary action.** Plain `rgba(255,255,255,0.04)` background, no green accent — distinguishes "publishes UI preference" from the green "Add to Look" toggle which mutates authored state. The "→" prefix telegraphs the cross-helper jump.
- **No store plumbing.** Per [[project_kit_helpers_pattern]] helpers publish authored artifacts; this isn't authored. The click handler is a one-shot `localStorage.setItem`. `useArboristStore` stays clean.
- **`lookId: null` payload when no Look active** (vs disabling the button). Keeps the affordance available — operator might be browsing rated variants in `All Rated` scope with no Look picked yet and still want to send one to Meteorologist; Meteorologist's reader handles the null fallback per the contract.
- **Toast lives at the Grove root, not inside EditorCard.** Hover cards unmount as soon as the cursor leaves a tile; a toast scoped to the card would flicker. Hoisting confirmation state to `Grove` keeps the 1.5s fade independent of hover lifecycle.

### Contract shape (frozen, mirrored in `ARCHITECTURE.md`)

```js
key: 'meteorologist-canary-tree'
payload: { species: string, variantId: number, lookId: string|null }
```

Field name is `species` (matches Arborist's `speciesId`), not `speciesId` — the contract surface drops the `Id` suffix because the consumer side reads it as a domain noun.

### Files touched

- `src/arborist/Grove.jsx` — toast state + `setMeteorologistCanary` handler in the `Grove` component; thread `onSetMeteorologistCanary` prop through `Tile` → `EditorCard`; new button below the In-Look toggle.
- `arborist/FEATURES.md` — Grove subsection note.
- `arborist/ARCHITECTURE.md` — new "Arborist ↔ Meteorologist canary contract" subsection.
- `arborist/BACKLOG.md` — new `### Cross-helper integrations` section with the SHIPPED entry.
- `arborist/NOTES.md` — this entry.

### Out of scope (carried from brief)

- Workstage secondary surface — Grove-only for now; cheap to add later if useful.
- Auto-rewrite on Look switch — stale `lookId` is intentional; operator re-clicks.
- Persistence across machines — localStorage is per-browser-per-origin and that's correct.

---

## 2026-05-19 — Workstage LoD preview + perf gauge

**Shipped:** the UI half of the LoD-preview + perf-gauge item the prior session scaffolded server-side. Two floating overlays on the focused-slot viewport:

- **LoD selector** (top-right) — three buttons (0 / 1 / 2). Switching writes to the `previewLod` state already plumbed at `ProceduralWorkstage` scope (survives slot tab switches), gets sent on the `/procedural/generate` POST body, and triggers a refetch via a new useEffect dep. Server-side `simplifyGlbBytes` (gltf-transform's `weld → dedup → simplify`, same `MeshoptSimplifier` ratios as `publish-glb.js`) already shipped — UI just exposes it.
- **Perf gauge** (bottom-right) — read-only `<PerfProbe />` child mounted inside `<Canvas>`, samples at ~4 Hz via `useFrame` + `useThree`. Walks the scene for tris (`g.index ? g.index.count : positionCount` ÷ 3) and leaf cards (positionCount ÷ 4 where `geometry.userData.atlasKind === 'leaf'`), reads `gl.info.render.calls` and `gl.info.programs.length`. Calls back to SlotCard via a new optional `onPerfSample` prop on SpecimenViewport. Skips the callback if no value changed. Renders nothing — the gauge can't pollute the `programs` count it's measuring (per [[feedback_unique_program_cache_key_before_wrappers]]).

Tri thresholds: green <20k, yellow 20–40k, red >40k at LoD0; ×0.5 at LoD1, ×0.2 at LoD2 (matching publish-glb's simplification ratios). Programs row visually flags >5 as an author-time tripwire against accidental shader-cache divergence — the v1.5 invariant is one shared tree material.

**Out of scope (next briefs):** production wind in `treeAtlasMaterial.js`, G.1 Sugar Maple PRESETS, panel-knob walkthrough.

---

## 2026-05-19 — Procedural Broadleaf authoring pass: Phase D.1 + D.2 + W-preview

**Headline:** the third-shift session through the night of 2026-05-18 → 2026-05-19 took the procedural broadleaf from "trunk with a spider topper of branches + sparse garnish" to "Sugar-Maple-shaped wood with foliage mass and motion." The geometric algorithm is now substantially complete for the broadleaf morphology; what's left for G.1 hero is Photoshop-authored leaf clusters (operator's tomorrow task) and per-species PRESETS tuning.

### What shipped (in commit order roughly)

**Anchor + joint smoothing.** Tree base now anchored to y=0 unconditionally; scaling no longer lifts the trunk off the floor. Three joints smoothed:
- Trunk↔flange: flare and shaft no longer overlap; they stack continuously (flare 0→FLARE_H=0.4m; shaft FLARE_H→top). Both `openEnded:true` at the seam so no cap-disk shows where they meet. Radial-noise hashed with aligned `globalH` so the noise pattern is continuous across the boundary.
- Trunk↔canopy: SCA is run *early* (before trunk geometry), and the visible trunk-top radius is set to `Math.max(0.025, scaResult.nodes[0].radius)` — exactly matching the Murray's-law root radius the first SCA cylinder emits at. The "crag" where the trunk pinched into a narrow neck and the canopy puffed back out is gone.
- Visible trunk extends through SCA axial chain. Phase C.1's axial trunk-extension nodes (which forced the trunk straight up from `leanedTrunkTop` to `branchingStartY` to fix bias amplification) used to emit visible cylinders, producing a "second narrower column" above the tapered shaft. Now `axial→axial` edges are skipped in the emission loop, and the visible trunk paints from y=0 up to `topAxialY` exclusively. Lean dropped (a leaned cone diverges from the straight-up axial extension; lean can return later as a group rotation on the whole tree).

**Phase D.1a — staggered scaffold emergence.** Phase C.1 §2 parented all N initial children to a single `trunkTopNode`, producing a canonical "umbrella spider" topology. Now they distribute across the top portion of the axial chain via `sca.scaffoldZoneFrac` (default 0.5 broadleaf; force-pinned 0 for weeping). Azimuths still span TAU uniformly so the C.1 wedge-balancing rationale survives.

**Phase D.1 — opposite phyllotaxis (Path 2 pair-spawn).** The decussate Sugar Maple signature. Replaced the per-iter single-child spawn in `runGrowthLoop` with paired children at `pullDir ± sin(θ)·pairAxis`, where pairAxis lies in the plane perpendicular to the parent edge, rotated 0°/90° per `pairDepth` parity. Gated on `sca.phyllotaxisMode === 'opposite'`. The `spawnIncrement = 2` flag also tightens the C.1b per-node child cap so a pair-spawn never exceeds it. Visible signature: fishbone canopy density (~4× wood, ~10× leaves vs alternate mode on the same seed).

**Phase D.1 — scaffold emergence-angle decoupling.** Decaying +Y bias near the trunk via `sca.scaffoldEmergenceBias * exp(-pathLenFromTrunk / 1.5m)`. New per-node `pathLenFromTrunk` field tracks each scaffold's path length from its seed. Default 0.6 broadleaf, 0.4 columnar, 0.3 ornamental, 0 weeping. Produces the J-shaped lower scaffolds.

**Phase D.2 — deformers (operator-tunable organic noise).** New `deformers` nested params group (`trunkWander`, `trunkWavelength`, `branchJitter`, `barkRelief`) added to `NESTED_PARAM_KEYS` + `DEFAULT_SCA_BY_PRESET`. Three helpers in `spaceColonization.js`:
- `getTrunkWander(seedN, worldY, wanderOriginY, amplitude, wavelength)` — deterministic XZ wander curve, anchored at wanderOriginY (the flare-trunk seam), cosine-smoothed between control points, amplitude ramps in over the first metre. Same function consumed by both the visible trunk geometry (per-vertex displacement after subdivide → ≥8 height rings) AND the SCA root + axial extension + lift loop, so the canopy attaches cleanly to the wandered shaft.
- `_jitterPerp(seedN, hashIdx, parentDir, scale)` — deterministic perpendicular offset on each SCA branch-spawn. Wobbles every spawn off the ruler-straight pull line.
- `_jitterHash` / `_wanderHash` — `Math.sin(x) * 43758.5453` pattern; cheap and deterministic.

**Workstage panel — full 20-knob surface.** Five sections (Trunk · Envelope · Canopy · Deformers · Tropism), nine of which are new this session:
- Trunk: **DBH** (5–100 cm, top-level scalar — required `setProceduralSlotParams` to handle scalars not just nested-object patches)
- Envelope: Drape (renamed from "Y offset"; hidden for non-weeping)
- Canopy: **Start** (branchingStartFrac), **Scaffolds** (initialChildCount), **Spread** (scaffoldZoneFrac, hidden for weeping), **Phyllotaxis** (alternate/opposite dropdown), **Lift** (scaffoldEmergenceBias), **Density** (attractorCount), **Fill** (killRadius)
- Deformers: **Trunk wander** (cm), **Wavelength** (m), **Branch jitter** (% of stepLength), **Bark relief** (% of radius)
- Plus **↺ Reset** button between Dice and Adopt; clears the operator overlay for the slot, persists to disk, refetches effective so sliders snap back to PRESETS defaults.

**Workstage wind (Phase W preview surface).** Floating toggle + strength slider (0–2) at the viewport's bottom-left. Patches each loaded GLB material via `onBeforeCompile` in `SpecimenViewport.jsx`. Shared `uTime`, `uWindStrength`, `uIsLeaf` uniforms updated via `useFrame`. Two-layer sway:
- Wood: height-falloff slow sway (`uTime × 1.5`, ~15 cm peak amplitude at 10 m canopy, two phase-offset sines for elliptical wander)
- Leaves: high-frequency flutter (`uTime × 8`, ~2.5 cm amplitude, per-vertex phase from leaf-card position so adjacent cards don't sync) layered on top
- `uIsLeaf` is set per-material at patch time from `geometry.userData.atlasKind === 'leaf'`. `buildSourceGLB` now stamps `atlasKind: 'bark'|'leaf'` extras on each primitive, which `useGLTF` surfaces into `geometry.userData`.

This is the **workstage preview** of Phase W. Production wind (`treeAtlasMaterial.js`) is still pending — when it lands, the same two-layer math goes in, plus per-tree phase from a world-XZ hash so 745 placements don't sync.

**Phase D.1b — leaf-cluster-along-shoot emission.** Replaces the single-leaf-card-per-tip rule. Per-tip emission now:
- (a) Bounded spray of `tipCount = 5` cards in a 35 cm × 0.6-vertical-compression volume around the tip
- (b) Pair-distributed cards walking back along the parent chain for `shootLen = 0.6 m`, one on each side every `shootSpacing = 0.18 m`, perpendicular offset `shootJitter = 0.12 m` along the per-edge axis

Smoke test on broadleaf-1: leaf count **606 → 5496** (~9× more cards). Canopy reads as foliage mass, not garnish. Phase F's PSD-authored cluster atlases will land into this same emission shape.

### Architectural decisions worth keeping

**Path 2 over Path 1 for opposite phyllotaxis.** The research agent's report flagged two paths: (1) structural pairing post-pass walking the node graph, or (2) hybrid SCA + sympodial step inside `runGrowthLoop`. We chose Path 2 — ~30 LOC inside the spawn step, cleaner attractor-kill semantics (paired tips compete for attractors per-iter just like single tips), and the `pairDepth` field naturally generalizes to other phyllotaxis modes (spiral, whorled). The pair-cap interaction with C.1b's per-node child cap is handled by `spawnIncrement`-aware pull-filter — a node that would exceed cap mid-pair simply stops being attracted, and the attractor flows to next-nearest. **No silent degradation to single-child** in opposite mode; pairs preserve the species signature.

**`atlasKind` extras stamped at `buildSourceGLB` for runtime gates.** The same `geometry.userData.atlasKind` mechanism Phase B/B.1.a established for bark-vs-leaf fragment classification now also gates leaf-vs-wood vertex flutter in workstage wind. One extras field, two consumers — clean.

**Trunk sinuosity via subdivided cylinder + per-vertex displacement, not swept polyline.** The agent's report suggested a swept-polyline trunk (~40 LOC, depends on C.2 normal-merge). The simpler approach: `CylinderGeometry(top, bot, h, RADIAL, heightSegs ≥ 8)` then per-vertex XZ displacement via `getTrunkWander()` in world coordinates. Same visual result, single cylinder mesh, no swept-polyline plumbing, no normal-merge dependency.

**Phyllotaxis dropdown effective-value bug (load-bearing fix).** Server's `effective` payload only spread `base[key] + params[key]`, NOT `DEFAULT_SCA_BY_PRESET[preset][key]`. Sliders worked by accident (DraftSlider's local draft state masked the bug) but selects (Phyllotaxis, Profile) snapped back to stale values. Fixed both ends:
1. **Server**: effective payload now layers `DEFAULT_SCA_BY_PRESET → PRESETS variant → operator overlay`, matching the generator's runtime resolution exactly.
2. **Store**: `setProceduralSlotParams` mirrors patches into `v.effective` alongside `v.params` so controlled selects reflect the operator's choice without a server round-trip.

The 2026-05-15 maxi-brief's `effective` doctrine implicitly assumed defaults were layered in; the implementation didn't. Recorded so the next baby doesn't re-walk this.

**`scaffoldZoneFrac = 0` defends weeping.** The kernel pins weeping's scaffold spread to 0 regardless of operator overlay — the curtain effect breaks if scaffolds emerge at staggered heights. Defense in depth: the panel hides the slider for weeping AND the kernel zeros it. If the operator imports a non-weeping preset's overlay onto weeping by mistake, the curtain survives.

### Bug-class lessons

**Backend HMR.** `node arborist/serve.js` runs without auto-restart on file edits. Node 22's built-in `--watch` flag (`node --watch arborist/serve.js`) tracks the entry script's require graph and restarts on any edit. Added to `package.json` `dev:cartograph` + `dev:arborist` + `dev:meteorologist` scripts. Operator must restart `npm run dev` *once* after the package.json change to pick up the watcher itself; after that, future edits to `arborist/spaceColonization.js`, `generate-procedural.js`, `serve.js`, etc. reload automatically. Cost ~30 minutes of debug ("no change?" → "restart" → "OK now it works" cycle) before we surfaced this.

**Vite HMR is fine for `src/`, doesn't apply to `arborist/`.** The frontend (workstage UI, SpecimenViewport) hot-reloads automatically. The backend (generator + SCA kernel + server) does not.

### Operator-visible defaults shifted

Compared to pre-session broadleaf seedling:
- Phyllotaxis: alternate → **opposite**
- Scaffold lift: 0 → **0.6**
- Scaffold spread: (didn't exist) → **0.5**
- Trunk wander: 0 → **8 cm** at **2.0 m** wavelength
- Branch jitter: 0 → **10% of stepLength**
- Bark relief: hardcoded 5% → operator-tunable, default **5%**

Determinism preserved (same seed + same params → byte-identical mesh) but the GLBs are NOT byte-identical to pre-session output. Any operator-adopted variants in `arborist/state/procedural_broadleaf/seedlings.json` from before this session will visually transform on next republish — Adopt re-seeds the variant into the new defaults if the operator hits Reset first.

### Pending — handed off to the next session

**G.1 Sugar Maple authoring (next):**
- Operator does PS palmate-leaf cluster atlas tomorrow → drops into `public/textures/leaves/acer_saccharum_procedural/cluster.png`
- Phase F's `leafCluster.textureRef` field consumed by the generator
- Hero PRESETS entry: envelope rounded-oval 12×20m, attractorCount ~600, tropism zero, opposite phyllotaxis, scaffoldEmergenceBias 0.6, bark `Bark007` with furrowed tint #3a2820/#6a5040, leafCluster `acer_saccharum_procedural/cluster.png`, two-stop tint ramp summer #2a5825→#3a7530, fall #a85020→#d4801f
- Acceptance: reads as Sugar Maple to a botanist at Hero from 30 m up

**Production wind (treeAtlasMaterial.js).** Phase W proper. Same two-layer math as workstage preview + per-tree world-XZ phase hash. Per `BACKLOG.md` Phase W entry.

**LoD preview in workstage + perf gauge.** Workstage today only previews lod0. Adding a lod0/1/2 selector + live tri/leaf/draw-call gauge. Server runs `simplify({ratio: 0.40, 0.10})` on demand via `?lod=N` query parameter, same `MeshoptSimplifier` publish-glb uses.

**Trunk sinuosity in axial-chain — flag.** Currently the wander is applied to the visible trunk shaft AND the SCA axial extension positions. But the SCA root position (`trunkBase` passed in) is also wandered, so the canopy attaches to the same wandered top. Confirmed structurally; visual review needed at high trunk-wander values (e.g. 25 cm). Watch for canopy "tearing" off the trunk top.

**Phase F.0 — leaf-cluster-along-shoot considered a Phase F prerequisite, shipped early.** Originally Phase F was scoped as PSD-authored cluster atlases only. The leaf-card emission *rule* (cluster per tip + pair-distributed along shoot) is a structural change that Phase F's PSDs land into. Shipping it before F means the operator's tomorrow PS work attaches into a geometry that's already maple-shaped.

### Cross-references

- 2026-05-15 maxi-brief above for the load-bearing v1.5 doctrine
- BACKLOG.md for phase check-offs landed this session
- FEATURES.md for the 20-knob operator surface
- Phase G.1 entry in BACKLOG for next-session priorities
- [[project_arborist_quartet]] memory for the doc structure

---

## 2026-05-15 — Procedural trees v1.5: in-Arborist authoring + skeleton-first roadmap — MAXI BRIEF

**Status (rolling, end of 2026-05-16):** Project goal: **ship 5 hero species at Hero quality** on top of morphology fillers, sharing one bark+leaf material pipeline via the Grove's master atlas. The 7-phase machinery is the *means*, not the end. **Phases shipped:** A (`2323a78` + `f6aaf61`), D (`06f903e`), B-core (`0b2f6cb`), B.1.a (`6c5c957` + revisions through `54355a4`), C (this commit — Phase C SHIPPED 2026-05-16 EOD). **Phase C pulled forward** per the 2026-05-16 EOD doctrine pivot below — the maxi-brief's original D → E → C → B → F → G ordering had C *before* B for the right reason, and Phase B's visual-quality ceiling on smooth-cylinder trunks confirmed it. **Remaining:** F (per-species PSD-authored cluster atlases — compositor dropped) → G.1–G.5 (five hero proving passes). Phases B.1.b/c (Workstage Bark panel + Stage debug overlay) deferred indefinitely — bark authoring iteration value is bounded by the geometric ceiling C addresses, not by UI surface. Phase F.5 (parametric leaf editor) **killed** — PS-authoring obviates the parametric path for 5 heroes. Phase E (conifer monopodial) priority-dropped; conifer is 7% of inventory; ship the algorithm if/when needed but it's not blocking heroes. Each phase ships its own commit + acceptance test; implementation handoffs are separate baby-agent sessions per [[feedback_user_spawns_baby_agents]]. This entry is the architecture record per [[feedback_notes_md_holds_architecture]] — every baby reads this end-to-end before touching code.

**Cross-phase orchestrator note (after A → D → B-core → B.1.a, 2026-05-15 + 2026-05-16):**

*Scope-drift transparency is teachable.* Phase A's baby silently extended `src/arborist/Workstage.jsx` to accept `source: 'procedural'` (necessary but undisclosed); orchestrator's Phase A trust-but-verify caught it and the Phase D brief explicitly required surfacing scope drift. Phase D baby then disclosed all three deviations (envelope.offsetYFrac, `effective` field in seedlings GET, PRESETS attractor-count tuning) in the commit body without prompting. B-core's baby (warm continuation through B.1.a) caught a load-bearing B-core bug in passing (the `mesh.userData?.atlasKind` lookup was reading wrong — primitive extras land on `geometry.userData`, not `mesh.userData`, so every vert silently got `aBark = 0` and the entire retint+roughness+jitter pipeline never fired; identity defaults made the regression invisible). The "surface anything not in this brief" clause is now a standard brief element.

*Skeleton-first ordering was right; we shipped out of order.* The maxi-brief's phase ordering put C (geometric polish) before B (bark surface) deliberately — a bark shader on smooth-cylinder trunks is polish on a CAD-looking substrate. The operator's call to ship B first to explore the bark space surfaced exactly that constraint: photo PBR on smooth `THREE.CylinderGeometry` produces visibly stretched + warped bark wraps because tapered-cylinder UV unwrap distributes texels non-uniformly across radius, and any uvScale/tile-wrap shader-side fix runs into mipmap derivative discontinuities at tile boundaries (recorded in NOTES Phase B.2 deferred — texture-arrays or pre-tile-in-atlas are the proper fixes, both pipeline changes). **The bark quality ceiling at v1.5 is geometric, not shader-side.** Phase C's multi-segment cylinders + non-linear taper + per-vertex radial noise + flange rings + root flare break up the regularity that makes the bark wrap look computer-generated. Phase B's photo-PBR + retint infrastructure stays; what changes is the substrate it wraps onto. Resuming skeleton-first ordering: **C lands before any further visual-quality work on bark.**

*PS-authored leaves obviate the parametric compositor.* Phase F's original scope included `arborist/leafCluster.js` — a sharp-based programmatic cluster compositor with per-leaf jitter/rotation/scale knobs. That infrastructure was designed to *scale* the leaf-authoring path to all 60 inventory species. For 5 heroes, Photoshop is faster + better: artist controls overlap, density, color variation, accent leaves directly; per-season variants are additional PSDs; no parametric tuning struggles (which we just lived through with bark's uvScale). **Phase F shrinks to "import authored cluster PNGs, atlas + tint + sparse-occupancy at runtime"; Phase F.5 dies entirely.** Substitution-fallback still uses shared per-morph PNGs (`public/textures/leaves/<morph>.png`) for filler species; only heroes get per-species PSD-authored clusters.

*ProceduralWorkstage layout: single-focused slot + tabs (2026-05-16, post-Phase-C).* The Phase A / D grid-of-cards layout (`auto-fill, minmax(320px, 1fr)` with 280-px-tall viewports per card) cropped vertically-composed silhouettes — columnar/weeping read as stubs because the canopy and the trunk-extension below it both need vertical headroom the small card can't give. Operator feedback (2026-05-16, immediately after Phase C landed): "I don't think we need to see all three at once, and in many cases a tree will be vertically composed." Replaced with: **slot tabs strip in the header (with a dirty-dot indicator), one focused card filling the main area, viewport as `flex: 1` left, 300-px controls rail (Envelope / Tropism / Seed / Dice / Adopt) right.** No functionality added or removed — controls behavior identical to Phase D. New affordance: tab switcher (necessitated by single-focus). The operator's explicit constraint — *"do not add or remove any functionality or innovate on the controls in any way"* — became the rule: a layout pass is purely spatial, and a slot selector is the only permitted new affordance because single-focus requires it. See [[feedback_focus_one_over_grid_for_3d_inspection]] for the general rule. This unblocks the eyes-on hero-iteration loop ahead of G.1–G.5: columnar/weeping silhouettes are now legible at workstage scale, which matters because G's hero passes are silhouette-driven (per the "Hero = silhouette + density + color" framing above).

### Why this exists

v1 procedurals (commit `dbbd1ed`, shipped 2026-05-14) work end-to-end through the pipeline but are not visually sufficient by any metric. Free-form recursive growth + single-leaf cards + flat bark texture = trees that read as "procedural toys" at every distance. SpeedTree is the eventual answer but carries a learning curve; the operator is willing to do procedural the hard-but-awesome way to ship something tailored to our distance profile (Hero/Browse dominant; Street view deferred to v2).

The critical reframing from 2026-05-15 design conversation:

- **At Hero distance the trees are the star but you can't see detail.** What carries is silhouette accuracy, crown density distribution, and per-species color.
- **At Browse we're directly overhead.** Disk-shaped canopy, trunk dot. Silhouette and color again.
- **Photoreal only matters in Street view** — deferred to v2 entirely. Don't over-build for it.

So the visual targets are silhouette + density + color, not leaf-vein fidelity or bark-micro-texture.

### Design pillars

**0. Two-tier substitution: heroes on top of morphology fillers.** The five morphology buckets (`procedural_broadleaf`, `procedural_conifer`, `procedural_ornamental`, `procedural_columnar`, `procedural_weeping`) stay in the roster as **fillers** at `quality: 2` — they catch every park-inventory species that doesn't have its own hero authored yet. Hand-tuned **hero species** (`acer_saccharum_procedural`, `ginkgo_biloba_procedural`, `salix_babylonica_procedural`, `gleditsia_triacanthos_procedural`, plus a fifth TBD per G.5) sit on top at `quality: 4`, each carrying its own envelope tuning, leaf cluster atlas, bark settings, and fall-color ramp. `arborist/bake-trees.js:pickVariant` already implements the two-tier lookup: `speciesMap.map?.[parkSpecies]` (preferred-species via `src/data/park_species_map.json`) wins first; category fallback covers everything else. Heroes win their bucket's quality lottery automatically because of `quality: 4 > 2`. The same mechanism is how SpeedTree slots in at v2: SpeedTree imports get authored at `quality: 4+` and the procedural heroes silently drop out. **Substitution is the safety net; heroes are the visible product.** No new code is needed for the two-tier doctrine — just authoring.

**0.5. The Grove's single master atlas is the load-bearing innovation.** `arborist/bake-look.js:unifyAtlases` composites bark + leaf sub-atlases into one master PNG per Look; `atlas-survey.js` dedupes tiles by sha1 hash before pack. Adding hero species costs nearly nothing in atlas footprint because their bark + leaf-cluster tiles dedupe against the existing roster's identical content. Combined with Phase B (procedural bark shader applying roster-wide — vendor + procedural materials both lose their bark color tiles to a shared 4×4 placeholder via material extras), the unified atlas after the v1.5 arc may actually be **smaller than today's atlas even with 5 hero species added**. The Grove's atlas pipeline is the engine that makes the heroes-on-fillers doctrine feasible — without sha1 dedup + roster-wide shader unification, adding 5 hand-tuned species would multiply atlas footprint and shred GPU memory budgets.

**1. Skeleton-first ordering, like the map maker.** Centerlines (branching topology) → surface (cylinders, flanges, root flare) → shader (bark, leaf clusters, tints). A bark shader on wrong-silhouette trees is polish on a broken script. Phase order matches this strictly: skeleton algorithms (Phases D, E) land before geometric polish (C) before surface shaders (B) before foliage (F) before per-species tuning (G).

**2. Two algorithms, not one.** Conifers (gymnosperms) and broadleaves (angiosperms) have fundamentally different growth architectures. Forcing them through one model is why generic procedural trees look fake.

- **Broadleaf / weeping / columnar / ornamental → Space Colonization (Runions 2007) + tropism vector.** Define envelope; scatter N attractors inside; branches grow toward nearest attractors; branch kills attractors within range. Tropism vector handles all silhouette variants from one algorithm: `(0,0,0)` = broad symmetric, `(0,-0.4,0)` = weeping recurve, `(0,+0.3,0)` = columnar bias, `(0,-0.05,0)` = ornamental. Sympodial topology (two-way splits).
- **Conifer → monopodial whorl.** Single dominant central leader extends top-most all the way up; emits horizontal whorls of N lateral branches at regular vertical spacing; per-whorl branch length f(height) → cone shape; lower-whorl droop f(age). Botanically correct; SCA produces wrong topology for any conifer.

**3. Dice + adopt, not slider tune.** Procedural trees produce unique topology per seed. Authoring workflow is roll-the-dice-until-good, not turn-knobs-precisely. Each species carries ~3 adopted variants (operator can adopt more or fewer); per-instance runtime jitter (Y-rotation, independent XZ + Y scale, hue shift, wind phase) provides visible diversity across the 745 LS placements. Three baked variants × strong shader jitter = looks like 30 distinct trees in scene.

Baking is required (SCA in JS is ~50–500ms/tree × 745 placements = unacceptable; leaf clusters need sharp-composited atlases; bake-look needs source GLBs to atlas-pack) but **baking ≠ posing**. Adoption = "freeze this rolled topology to a GLB so the GPU can instance it cheaply."

**4. Minimum-viable UI per phase.** Each phase exposes only the knobs its algorithm needs. Phase A is just dice/adopt buttons (generator unchanged). Envelope panel arrives with SCA (Phase D). Conifer-whorl panel arrives with monopodial (E). Bark pattern dropdown arrives with shader (B). Leaf cluster swatches arrive with clusters (F). No premature param surfaces — they'd just need re-tooling as the underlying algorithm grows.

### Generator contract (the load-bearing API)

`generateTreeMesh(params) → {barkGeo, leafGeo}` is the signature every phase preserves. UI binds to it; CLI binds to it; tests bind to it. The params object grows fields per phase but never breaks back-compat:

```js
generateTreeMesh({
  // Identity (Phase A)
  species,           // 'procedural_broadleaf' etc.
  morphology,        // 'broadleaf' | 'weeping' | 'columnar' | 'ornamental' | 'conifer'
  seed,              // integer; macro seed driving topology

  // Silhouette (Phase D for SCA species; Phase E for conifer)
  envelope: { profile, height, width, asymmetry },
  branching: {
    mode,            // 'sca' | 'monopodial'  — selected per morphology
    phyllotaxis,     // 'alternate' | 'opposite' | 'whorled'
    tropism,         // [x,y,z] gravity bias (SCA)
    attractorCount, influenceRadius, killRadius, stepLength,  // SCA tunables
    whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge,  // monopodial tunables
  },

  // Geometry (Phase C)
  geometry: { lodTier, segmentsPerBranch, radialNoise, flangeRingScale, rootFlareScale, buttressFinCount },

  // Surface (Phase B)
  bark: { pattern, darkColor, lightColor, scale, roughness },

  // Foliage (Phase F)
  leafCluster, tintRamp: { summer: {inner, outer}, fall: {inner, outer}, ... },
})
```

PRESETS table in `arborist/generate-procedural.js` is the committed canonical seedling defaults (5 morphology fillers × ~3 seedlings each, today; growing to +5 hero species over G.1–G.5). Per-variant `params: {}` overrides in `arborist/state/procedural_<species>/seedlings.json` overlay on top — operator's diced + adopted choices live there.

**Hero species are first-class citizens at this same API.** The params object grows for heroes — full per-species `bark` extras (pattern + colors + scale + roughness), `leafCluster` reference to a per-species cluster atlas, two-stop `tintRamp` per season — but the `generateTreeMesh()` signature does not change. Heroes get their own PRESETS table entries (e.g. `acer_saccharum_procedural`, `ginkgo_biloba_procedural`); `park_species_map.json` routes inventory entries to them via preferred-species lists; `bake-look.js`'s `unifyAtlases` round-trips them through the same atlas pipeline as fillers. Fillers continue to use morphology-bucket defaults via `DEFAULT_SCA_BY_PRESET` (or new `DEFAULT_BARK_BY_PRESET` / `DEFAULT_LEAFCLUSTER_BY_PRESET` tables introduced by Phases B and F). The mechanical distinction between "hero" and "filler" is **quality rating + per-species tuning depth**, not pipeline location.

### Phase table

Each phase is a separate commit + acceptance + visible-bug coverage statement.

**Phase A — Procedural mode: dice + adopt** (UI iteration surface) — **SHIPPED 2026-05-15** (commits `2323a78` + `f6aaf61` query-string fix)
- New `src/arborist/ProceduralWorkstage.jsx`; top-level mode toggle in `ArboristApp.jsx` (Procedural button next to Grove)
- Per-species panel: variant slots, each with 🎲 dice + ✓ adopt buttons + SpecimenViewport thumbnail (blob-URL'd GLB from the generate endpoint, keyed on {species, slot, seed, params} so dice rolls re-fetch and revoke the prior blob URL)
- Endpoints: `GET /procedural/species`, `GET/POST /procedural/:species/seedlings`, `POST /procedural/generate` (returns `model/gltf-binary` directly), `POST /procedural/:species/publish?look=<id>` (shells out to `node arborist/generate-procedural.js --species <id>` + fires per-Look atlas auto-bake fire-and-forget)
- Generator unchanged; `generate-procedural.js` refactored to export `generateSingleVariantGLB`, `readEffectiveSeedlings`, `writeSeedlings` + `PRESETS` + `BARK_BY_SPECIES`. `main()` now consumes the seedlings overlay (PRESETS fallback on fresh checkouts), gated on an `import.meta.url === argv[1]` script check so importing the module from `arborist/serve.js` is side-effect-free. CLI gained `--species procedural_<id>` flag.
- Store: `proceduralOpen`, `proceduralActiveSpecies`, `proceduralSeedlings` (per-species), `proceduralDirtyBySpecies` (per-slot dirty markers), `proceduralSpeciesList`, plus `loadProceduralSpecies`, `loadProceduralSeedlings`, `setProceduralSlotSeed` / `diceProceduralSlot`, `adoptProceduralSlot`, `republishProceduralSpecies`. Republish blocked until all dirty slots are adopted (UI disables the button).
- Determinism verified end-to-end: same {species, slot, seed, params} → byte-identical GLB across re-requests. Republish round-trips through publish-glb unmodified (~1.7s for a 2-variant species on a Mac).
- **Fixes:** operator iterates in seconds via UI; no CLI round-trip for new variants
- **Doesn't fix:** trees still look the same as v1 (no algorithm change — Phases D/E/C/B/F/F.5/G.1–G.5 follow)

**Phase D — SCA + tropism** (skeleton for broadleaf / weeping / columnar / ornamental) — **SHIPPED 2026-05-15** (commit `06f903e`)
- New `arborist/spaceColonization.js` (~270 LOC). Runions 2007 SCA + tropism, pure kernel (no three.js imports — emits raw position/parent arrays; mesh assembly stays in generate-procedural.js). Exports `runSCA`, `ENVELOPE_PROFILES`, `DEFAULT_SCA_BY_PRESET`, `mulberry32`.
- 5 named envelope profiles as 2D (t, r) revolution curves: `rounded_oval`, `umbrella`, `tight_column`, `broad_low`, `asymmetric_oval`. Profile r-values multiply by `envelope.width` (=canopyR semantics) to get max radius at each normalized height.
- **`envelope.offsetYFrac` added beyond the brief.** Negative values let the envelope hang below trunkBase — load-bearing for weeping (initial -0.4 tropism alone wasn't enough; branches just slowed their upward growth, never curtained). With `offsetYFrac=-0.6` the umbrella envelope straddles the trunk top so attractors include the curtain zone; tropism then physically pulls branches into it. The willow signature emerges from envelope geometry + tropism together, not tropism alone.
- `generateTreeMesh()` dispatch: `useSCA = preset !== 'conifer'`. Conifer falls through to the existing free-growth `if (preset === 'conifer')` block untouched (Phase E will replace). SCA path emits one tapered cylinder per node→parent edge (6 radial segs; `buildTaperedCylinderBetween` helper rotates Y-aligned CylinderGeometry to align with the edge), Murray's-law radii via post-order traversal (leaf=tipRadius, internal=sqrt(sum(child.r²))). Leaf cards at every tip via existing addLeaf.
- `resolveVariantParams` extended to do one-level-deep merge for nested `envelope` / `sca` / `branching` objects, so a partial overlay (e.g. operator dragging just `sca.tropism.Y`) doesn't wipe sibling fields off the PRESET base.
- PRESETS table grew `envelope` + `sca` per non-conifer variant. Variants 2-3 of broadleaf + variant 2 of weeping have higher `killRadius` / `stepLength` and lower `attractorCount` than the brief's starter defaults — necessary to keep lod0 tri counts in a reasonable Phase D range (1.8K–19K per variant after publish-glb's prune pass; conifer unchanged at ~6K). Phase C's geometric polish will absorb the silhouette quality cost.
- Seedlings GET endpoint extended with an `effective` field per variant (PRESETS base merged with operator overlay) so UI slider positions bind to resolved values. Adopt POSTs back the overlay-only `{slot, seed, params}` shape — disk state stays minimal, touched fields only.
- ProceduralWorkstage gains per-slot SCAPanel: Profile dropdown + Width/Height/Asymmetry/Y-offset sliders + Tropism XYZ sliders. Hidden for `procedural_conifer`. Debounced via local `DraftSlider` (150ms idle commit + pointer-up final-commit, same pattern as cartograph/Panel.jsx's DraftRangeInput — pulled into ProceduralWorkstage rather than crossing the cartograph↔arborist boundary).
- Silhouette verification (geometric, from SCA node positions): broadleaf W/H 1.87 (rounded oval), weeping W/H 2.29 with 3.2m of branches dropping below trunk top (CURTAIN), columnar W/H 0.29 (narrow vertical), ornamental W/H 1.99 (broad-low). All four visibly distinct from each other and from conifer.
- Determinism preserved end-to-end (same {species, slot, seed, params} → byte-identical GLB; CLI `node arborist/generate-procedural.js [--species <id>]` round-trips). Conifer GLB byte count identical to Phase A (549,532 bytes) — confirmed non-regression.
- **Fixes:** species silhouettes finally correct. Weeping recurves from physics. Columnar narrows. Ornamental broad-low-attached.
- **Doesn't fix:** conifers (Phase E); bark/leaf shaders (B/F); geometric polish — branches still plain tapered cylinders (C); per-species hero tuning (G.1–G.5).

**Phase E — Monopodial whorl** (skeleton for conifer) — **priority-dropped after Phase D**
- New `arborist/monopodialWhorl.js` (~150 LOC). `generate-procedural.js` swaps conifer path to `runMonopodial(envelope, params)`. ProceduralWorkstage gains conifer panel: whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge.
- **Priority drop rationale:** conifer is 7% of `src/data/park_trees.json` inventory (55/745 placements). Park-trees shape distribution is broadleaf 528 (71%), ornamental 139 (19%), conifer 55 (7%), columnar 31 (4%), weeping 3 (<1%). The operator's eye-level visual mix at LS is maple / willow / ginkgo / locust — conifer conspicuously absent. Ship the algorithm so those 55 placements don't fall back to SCA broadleaf and look wrong, but **per-conifer-species hero authoring (Spruce vs Pine vs Fir as distinct hero species ids) defers to v1.6** unless visual review at LS demands otherwise. The G.5 slot reserves the option to elevate one conifer hero in the v1.5 arc if visual review insists.
- **Fixes:** conifers read as conifers from Browse/Hero. Central leader visible; whorls + skirt droop correct.
- **Doesn't fix:** per-conifer-species variants (Spruce/Pine/Fir) need authoring, not code — and that authoring is deferred to v1.6 except for an optional G.5 conifer hero.

**Phase C — Geometric polish on correct skeletons** — **SHIPPED 2026-05-16 EOD.**
All five primitives landed in `arborist/generate-procedural.js`:
- `nonLinearTaper(rBase, rTop, t, exp=2)` replaces linear lerp inside `makeBranch`'s per-segment loop, sampled at branch-global `t = s/n`. SCA edges keep linear taper across each (already-short) edge; the aggregate non-linear taper emerges from Murray's law radii × the SCA chain. Flagged: per-edge non-linear taper buys little when individual edges are ~0.4 m.
- Radial-segment count bumped to a flat `PHASE_C_RADIAL_SEGS = 12` everywhere (trunk, flare, conifer leader, makeBranch cylinders, SCA edges). Previous gen-aware ladder (6 / 4 / 3) dropped — radial resolution is now uniform; `nBend` (axial-bend count) stays gen-aware.
- `applyRadialNoise(geo, branchHStart, branchHLen, scale=0.05, seedOffset)` runs in LOCAL cylinder frame BEFORE any transforms. Hashed by `(angle, branchHStart + localFrac*branchHLen)`. For makeBranch's per-segment chain, adjacent segments share the same noise at their interface H — seam-continuous along straight branches. **Flagged seam case:** SCA edges share a node position but their local cylinder frames don't align across edges (different `setFromUnitVectors(Y, dir)` per edge), so noise is NOT continuous across SCA-node interfaces. Visible at Hero close-up as faint per-edge facet flips; acceptable at v1.5 — fix is post-merge normal computation, deferred. Per-vertex displacement gated on `r > 0.05` (twigs skipped — sub-mm noise on a ~1 cm twig is invisible and wastes `computeVertexNormals` time).
- `makeFlangeRing(parentPos, childPos, childRadius, segs=12, scale=1.3)` short flared frustum at the BASE of child branches. Emitted at every recursive `growBranch` call's root (conifer free-growth path) AND at children of true branching nodes (`parent.children.length > 1`) in the SCA path — NOT at every SCA edge. Trunk-to-first-branch joints get one because growBranch's top-level call from the conifer layer loop hits the emit path.
- Root flare + 6 subtle buttress fins replace the prior single-flare cylinder block. `makeButtressFin(trunkRadius, outward, height, thickness)` builds a triangular wedge that tapers to nothing at the top, so silhouette reads as Midwestern broadleaf (maple/oak/locust) rather than tropical/banyan. Starter values: outward 0.08, height 0.12, thickness 0.04. ~8 tris × 6 fins = ~48 tris/tree. Per-fin azimuth jittered via `r(700+f)`.

**Measurements (lod0 / lod1 / lod2 tri counts, pre → post Phase C):**
- broadleaf-1: 11,648 → 22,352 / 7,790 → 10,730 / 6,900 → 6,180
- broadleaf-2: 10,444 → 23,140 / 5,714 → 10,978 / 5,524 → 6,200
- broadleaf-3: 19,538 → **41,522** / 14,460 → 19,988 / 13,750 → 11,668
- conifer-1:  6,442 → 14,058 / 3,064 → 6,648 / 2,190 → 2,114
- conifer-2:  5,580 → 12,618 / 2,676 → 5,988 / 2,052 → 1,972
- ornamental-1: 2,930 → 5,806 / 1,774 → 2,760 / 1,184 → 1,276
- ornamental-2: 5,064 → 9,826 / 2,592 → 4,664 / 2,252 → 2,364
- columnar-1: 1,796 → 3,904 / 860 → 1,852 / 644 → 678
- columnar-2: 2,422 → 5,346 / 1,162 → 2,538 / 892 → 946
- weeping-1:  5,784 → 11,346 / 2,588 → 5,384 / 2,250 → 2,356
- weeping-2:  17,320 → **32,558** / 13,830 → 15,818 / 13,422 → 10,336

**Tri-budget flag.** Brief expected ~30–40% lod0 growth; observed ~80–115% (radial-segs doubling 6→12 dominates). Two variants pierce the brief's 30K lod0 advisory: broadleaf-3 at 41.5K, weeping-2 at 32.6K. Per brief acceptance #6: VRAM at LS scale is dominated by atlas (13.6 MB color + 15.4 MB normal master PNGs), not source GLBs (745 placements × shared instanced geometry per variant — geometry is reused, not duplicated). lod1 & lod2 grow proportionally because publish-glb's `simplify({ratio: 0.85, 0.40, 0.10})` runs against the single source. Lever available if perf review flags it: drop `PHASE_C_RADIAL_SEGS` to 10 (single-line change). Not pulled at landing time — visual cross-section quality on the trunk is the load-bearing reason for 12.

**Determinism preserved:** `sha1sum public/trees/procedural_broadleaf/skeleton-1-lod0.glb` = `d07d4ba6...` on two consecutive `node arborist/generate-procedural.js --species procedural_broadleaf` runs. All noise displacement uses `seed()` deterministic hash.

**No shader / pipeline touches.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js`, `treeAtlasMaterial.js`, `InstancedTrees.jsx` — all untouched. `generateTreeMesh()` signature unchanged. Single shader program preserved.

**Surfaced scope-drift items** (per [[feedback_baby_must_surface_scope_drift]]):
1. `growBranch` gained an optional `emitFlange=true` parameter — only `false` would be needed if a caller wants to suppress the flange (none currently do). Worth noting because the brief's "files-touched" line was generate-procedural.js only and this signature change is fully internal to that file but worth flagging.
2. `buildTaperedCylinderBetween` gained an optional `noise = {scale, seedOffset}` parameter. Same rationale — internal-only to the file but adds a param to an exported-shape helper. Default null = no-op for any future caller that doesn't pass it.
3. `BARK_BY_SPECIES.uvScale` was NOT touched; the v3 baseline from `54355a4` (all uvScale [1,1]) stays. Phase C does not retune bark tiling.

**Fixes:** branches taper realistically; joints buttress smoothly at true branching events; trunks look planted via root flare + subtle fins; close-up Hero substrate is non-trivial enough that bark photo wraps stop showing the obvious tapered-cylinder-stretch artifact (the load-bearing acceptance criterion — Phase C exists to unblock the bark visual ceiling).

**Doesn't fix:** SCA-edge noise seam continuity (faint per-edge facet flips at Hero close-up — flagged above); foliage still sparse (Phase F); per-species hero tuning (G). Phase B.1.a's bark wrap-line crawl is unchanged — Phase C does NOT address shader-side bark issues; it changes the substrate the shader wraps onto.

**Phase C.1 — SCA canopy-bias fix** — **SHIPPED 2026-05-16** (this commit, post-Phase-C, pre-Phase-F)
Bug Phase C polish caught at the orchestrator-trust-but-verify step (visual canopy lean independent of trunk lean, on every seed). Diagnosis (Phase C baby's bypass run): SCA root at (0, 4.75, 0) with no lean still produced tip centroid at (-3.79, 7.75, 1.54) — ~4 m off-axis. Root cause is a positive-feedback bias in `runGrowthLoop`: a single growing tip's ~5 cm random asymmetry from rejection-sampled attractor averaging gets amplified by attractor-killing into a metastable canopy drift over ~100 iters. Independent of trunk lean, independent of geometry primitives, per-seed-variable.

Fix is structural, lives entirely in `arborist/spaceColonization.js` (~80 LOC; `generateTreeMesh()` signature unchanged; zero pipeline / shader / artifact touches).

- **§1 Force axial trunk extension.** After the existing auto-grow lift, deterministically extend the trunk straight up the central axis to `branchingStartY = trunkBase[1] + yOffset + envelope.height × branchingStartFrac`. Extension nodes carry `axial: true` and are skipped in `runGrowthLoop`'s nearest-node search for attractor pull — so they don't shape the canopy, they just paint a straight trunk to the branching-start height. Attractors near them still get killed by the normal kill pass so the central column clears cleanly. Per-morphology fraction: 0.5 for non-weeping, 0.2 for weeping (so the weeping trunk doesn't pierce above the curtain zone).
- **§2 N-child azimuthal seed.** At the trunk top, seed `initialChildCount = 6` children spaced evenly around `TAU`. Each becomes a normal (non-axial) SCA tip from iter 1. Per-wedge attractor assignment splits cleanly across 6 sectors so iter-1 pull is symmetric and bias on one sector is balanced by tips on opposing sectors.
- **§3 Weeping carve-out.** `branchingStartFrac=0.2` + `seedStep = stepLength × 0.5` (vs `max(0.5×step, 0.25×width)` for others). Tight central cluster + strong −Y tropism keeps the curtain effect intact; wider seeds in weeping breaks the curtain. Detected by `envelope.profile === 'umbrella'` OR `envelope.offsetYFrac < -0.1` so future PRESETS overlays naming a weeping morphology pick the carve-out automatically.
- **Brief tuning deviation.** Brief specified `seedStep = stepLength × 0.5` (≈ 0.2 m). At that distance, the 6 children clustered too tightly for iter-1 wedge-balancing to fire — they all competed for the same attractors before the kill pass cleaned up. Widened to `max(0.5×stepLength, 0.25×envelope.width)` (≈ 1 m at LS scale) — each child lands firmly inside its own 60° wedge. 20-seed broadleaf sweep mean dropped from 0.92 m to 0.87 m, columnar 0.59 → 0.32, ornamental 0.65 → 0.31. Weeping exempt (carve-out above) — 0.247 m unchanged.

**Bypass-script verification.** Canonical 5-seed (seeds 101/202/303/404/505) bypass with trunkBase=(0, 4.75, 0), canopyR=4, canopyH=8 — tip-XZ-centroid offset from trunk axis:
- broadleaf:  mean 0.604 m, max 2.273 m (4/5 < 0.25 m; one runaway-chain at 2.27 m)
- columnar:   mean 0.207 m, max 0.282 m (5/5 < 0.30 m)
- ornamental: mean 0.317 m, max 1.087 m (4/5 < 0.20 m; one runaway at 1.09 m)
- weeping:    mean 0.249 m, max 0.736 m (4/5 < 0.26 m; one at 0.74 m)
- Baseline (pre-C.1): ~4 m offset always, independent of seed. Median improvement 10–20×; mean 5–15×.

**Residual not-fixed (flagged, separate failure class).** ~5–35% of seeds per non-weeping morphology in 20-seed sweeps still produce 1–3 m offsets, but the failure mode is "runaway chain" not "initial-tip bias": those seeds have 4× the tip count (~250 vs ~60) because attractor-kill barely keeps up with N=6 expansion when rejection sampling produces isolated outlier attractor pockets. Tips chase those outliers at 0.4 m/iter (stepLength) but killRadius=1 m → 7–8 iter chase, chains off-axis. **Fix is outside C.1 scope** — candidates are per-tip chain length cap, raised killRadius, or outlier-attractor pruning. Visual review (e.g. broadleaf seeds 749/1391/1819) decides whether this needs follow-on tuning. Median canopy is well-centred which is the dominant LS-scale read.

**Constants exposed.** `sca.branchingStartFrac` + `sca.initialChildCount` are now PRESETS-overlay-resolvable through `resolveVariantParams`'s existing effective-field plumbing — per-variant overrides if a particular species's silhouette demands tighter or looser tuning. Defaults sit on each preset in `DEFAULT_SCA_BY_PRESET`.

**Tri-count delta.** Force-extension adds ~10 axial trunk segments × `PHASE_C_RADIAL_SEGS=12` × 6 tris/seg ≈ 720 tris/tree at lod0. Well inside the Phase C lod0 envelope.

**Conifer untouched.** Conifer (`runMonopodial`) doesn't call `runSCA`; the bias fix is structurally outside conifer code. Confirmed by code path inspection.

**Determinism preserved.** All randomness via `mulberry32(seedN × 1664525 + 1013904223)` (same stream as Phase D). Same `seedN` + params → byte-identical attractor cloud + byte-identical node graph + byte-identical GLB.

**Surfaced scope-drift items** (per [[feedback_baby_must_surface_scope_drift]]):
1. `runSCA`'s `envelope` input now reads `envelope.offsetYFrac` as a weeping-detection signal in addition to the existing `yOffset` computation — same input value, second consumer. Not a schema change.
2. Internal node shape grew an optional `axial: true` flag on root + auto-grow + force-extension nodes. Default-falsy; no other consumer reads it. `computeRadii`'s post-order walk treats axial nodes normally (single-child chain → radius = child.radius, which is correct trunk behavior).
3. `seedStep` widening deviates from the brief's `stepLength × 0.5`. Documented above with measurements. Brief's value left columnar/ornamental still failing the 0.5 m criterion; widened value passes columnar/ornamental and is ~equivalent on broadleaf.
4. No tests written. Phase D shipped without an in-repo test harness for `spaceColonization.js`; C.1 follows the established pattern (bypass-script for verification, then deletion).

**C.2 next.** Post-merge normal computation to seal SCA-edge facet flips (Phase C's flagged "not-fixed" item) — separate brief.

**Phase C.1b — runaway-cluster fix** — **SHIPPED 2026-05-16** (this commit, post-C.1)
Resolves C.1's flagged "residual not-fixed" failure class. Diagnosis differed from C.1's "runaway chain" framing: linear chains weren't the load-bearing mechanism — per-node BRANCH FAN-OUT was. When one of the N=6 initial seeds landed in a dense attractor pocket, that node accumulated pulls iter after iter and spawned a new child every iter, with each new tip inheriting the pocket and spawning further. One seed converted into a 200+ tip clump 1–3 m off-axis while the other 5 seeds waited for their attractors to be reached.

Fix is one structural rule in `arborist/spaceColonization.js` (~6 LOC + 1 constant): a node that has already accumulated `MAX_CHILDREN_PER_NODE_DEFAULT = 3` direct children no longer accepts attractor pull. Capped attractors flow to next-nearest tip (usually a sibling or further-out tip), so canopy density is redistributed rather than lost. Same gate mechanism as `axial:true`. Overridable per-preset via `sca.maxChildrenPerNode`.

**Three options compared via bypass-script** (`arborist/_c1b_bypass.mjs`, 20-seed sweep, deleted on ship):
- **A. Raise killRadius** (broadleaf 1.0→1.5, columnar 0.9→1.3, ornamental 1.0→1.5): centroid mean barely moved (broadleaf 0.89→0.79 m); worst runaway seeds persisted (seed 101: 410 tips, centroid 2.71 m). Mechanism kills LATERALLY around the chain, not BEHIND it — kill-corridor stays open.
- **B. Prune sparse attractors** (K=4 D=1.2 m): WORSE (broadleaf centroid 0.89→1.47 m, tip count up). K=2 D=0.8: broadleaf better (0.46) but ornamental tipped (0.44→0.77). Per-seed brittle — wrong outliers got pruned.
- **C. Per-node children cap (=3)**: clean across all four morphologies. Selected.

**Bypass-script verification** (20 seeds × 4 morphologies, trunkBase=(0, 4.75, 0), canopyR=4, canopyH=8):
- broadleaf:  centroid mean 0.156 m (was 0.889 m), max 0.300 m (was 2.879 m); tips mean 62.3 (was 173.7), max 74 (was 629). 0/20 runaway.
- columnar:   centroid mean 0.154 m (was 0.341 m), max 0.344 m (was 2.310 m); tips mean 45.3 (was 70.8), max 50 (was 384). 0/20 runaway.
- ornamental: centroid mean 0.171 m (was 0.435 m), max 0.437 m (was 2.953 m); tips mean 52.4 (was 80.2), max 57 (was 242). 0/20 runaway.
- weeping:    centroid mean 0.166 m (was 0.294 m), max 0.487 m (was 2.554 m); tips mean 63.6 (was 86.2), max 72 (was 295). Mean tip-Y vs trunkBase = −2.01 m (curtain descent intact; cap didn't break the weeping silhouette).

**Tri-count delta.** Tip count drop is ~64% (broadleaf 173 → 62 mean) and max-tip outlier drop is ~88% (629 → 74). Tri count is roughly proportional to total node count (per-cylinder emission in `generateTreeMesh`), so the lod0 envelope improves substantially relative to Phase C's 41.5K broadleaf-3 figure. Actual re-publish-vs-baseline GLB tri-counts not measured in this commit (no pipeline / shader / artifact touches); will surface when Jacob next runs `republish-all.js`.

**`generateTreeMesh()` signature unchanged.** Kernel-only edit; no pipeline / shader / artifact touches.

**Determinism preserved.** Same seedN + params → identical node graph (broadleaf seed 101: 279 nodes, identical positions across two runs; weeping seed 303: 302 nodes, identical positions).

**Conifer untouched.** `runMonopodial` doesn't call `runSCA`; fix is structurally outside conifer code.

**Surfaced scope-drift items** (per [[feedback_baby_must_surface_scope_drift]]):
1. Weeping was NOT exempted from the cap — initial expectation was that the curtain morphology would need a higher cap (long descending chains), but bypass-script showed the curtain is a CHAIN morphology (single tip arcing −Y for many iters) not a fan-out morphology, so cap=3 doesn't restrict curtain strands. Weeping mean offset actually IMPROVED (0.29 → 0.17 m). `MAX_CHILDREN_PER_NODE_DEFAULT = 3` applies uniformly to all four morphologies.
2. A `chainDepth` mechanism (cap=12 in growth-loop, per-node continuation tracking) was prototyped before the diagnosis converged on fan-out — discarded as dead code before commit. The simpler single-rule cap covers the failure mode cleanly.
3. The brief's three-option menu reflected a different mental model (linear-chain failure mode) than what actually drives the runaway (branch fan-out from pocket-dominance). The fix that worked is closer to "Option C — chain cap" in spirit but lands on a structurally different lever (per-node child count, not per-tip chain length).
4. `_c1b_bypass.mjs` was created at session start for variant comparison and deleted on ship (follows Phase D / C.1 verify-then-delete pattern).

**C.1c next** (the cosmetic crag↔SCA radius joint at trunk top, flagged in chat by Jacob during C.1 review) — separate brief. **C.2 still next** (post-merge normal computation for SCA-edge facet flips) — separate brief.

**Phase B (core) — Photo-PBR bark + retint shader infra** — **SHIPPED 2026-05-15** (commit `0b2f6cb` + post-ship fix `0cd853b` for the `barkBySpeciesEffective` useMemo placement bug)
- **Scope pivot from the original brief:** the GLSL pattern-library approach (5 procedural bark patterns via world-space noise + normal perturbation in shader) was DROPPED before code landed. Jacob (correctly) had zero faith we could ship 5 convincing GLSL bark patterns at Hero visual quality without significant craft, and the single-shader-program constraint (Bloom, see `bake-look.js:200`) makes uniform-branched-shader paths risky. The actual Phase B is **per-species photo-PBR bark materials + shader-side retinting infrastructure** — no GLSL pattern library. Phase B core lands the load-bearing infra; Workstage Bark panel + Stage debug overlay defer to **Phase B.1**.
- 5 tileable CC0 PBR bark materials sourced from ambientCG, dropped under `public/textures/bark/<materialRef>/` (color.jpg + normal.jpg (NormalGL convention) + roughness.jpg + LICENSE.txt). Filler-species mapping: broadleaf→Bark007 (heavy furrowed), conifer→Bark012 (scaly), ornamental→Bark003, columnar→Bark004 (smooth), weeping→Bark015. Hero species (G.1–G.5) will publish their own mappings on top.
- `arborist/generate-procedural.js` replaces `buildBarkPng` (32×32 sharp-generated noisy brown per species) with `loadBarkBundle(materialRef)` (reads photo color+normal bytes from disk + embeds into the GLB material as `baseColorTexture` + `normalTexture`). `BARK_BY_SPECIES` rewritten from hex colors to per-species bark spec `{materialRef, uvScale, tintBase, tintJitterRange, roughnessOverride}`. `patchManifestForFillTier` extended to stamp `manifest.bark` on each species's published manifest.json.
- `arborist/bake-look.js` reads each species's `manifest.bark` while gathering the roster and surfaces a `barkBySpecies` block in `trees-atlas.json`. Also changes the per-primitive `atlasKind` extras from the constant `'unified'` to `tile.classification` (`'bark'` or `'leaf'`) so the runtime can distinguish bark vs leaf fragments without re-classifying.
- `src/components/treeAtlasMaterial.js` adds 3 uniforms — `uBarkTintBase` (vec3), `uBarkTintJitterRange` (float), `uBarkRoughnessOverride` (float) — to the shared tree material. Vertex shader passes `aBark` attribute through `vBark` varying + per-instance `vWorldXZ`. Fragment shader patches at `<map_fragment>` (post-texture-sample retint, gated by `vBark` so leaf fragments pass through identity) and `<roughnessmap_fragment>` (per-species roughness clamp, also gated by `vBark`). Per-instance hue jitter hashes world-XZ so adjacent trees of the same species look different but the whole tree is one color. Bloom-stable: same compiled shader program for every (species, draw call); only uniform VALUES differ per draw.
- `src/components/InstancedTrees.jsx` bakes a per-vertex `aBark` attribute on each cloned geometry at runtime-merge time based on `mesh.userData.atlasKind`. Derives species from the GLB URL (regex on `/trees/<species>/`) since out-of-roster placements substitute URL but retain original `inst.species`; the URL is the authoritative species for retint purposes. `onBeforeRender` on each submesh `applyBarkUniforms` mutates the shared material's uniforms per (species, draw). Per-Look palette override: `scene.materialColors[<species>]` wins over species default `tintBase` at runtime — no rebake required (instant retint on reload).
- **Pipeline survives SpeedTree migration unchanged.** SpeedTree-imported species would write the same `manifest.bark` shape and run through the same shader. Heroes drop out of the procedural roster via the `quality` mechanism when their SpeedTree replacements land. Phase B becomes infrastructure that outlives the v1.5 procedurals.
- **Measurements (lafayette-square Look post-Phase-B-bake):** 11 bark tiles + 19 leaf tiles in atlas (same count as pre-B since each of the 5 filler species picks a unique materialRef — sha1 dedup will fire when G.1–G.5 heroes share refs with their fillers, e.g. Sugar Maple on Bark007). Atlas dims 4040×2600. Atlas color PNG 13.6 MB / normal PNG 15.4 MB (heavier than pre-Phase-B because the photo textures are genuinely 1K each; pre-Phase-B used 32×32 placeholders). The Grove pillar 0.5 holds: with hero-on-filler shared refs, atlas size will not grow proportionally to species count.
- **Determinism preserved.** Same {species, slot, seed, params} + same materialRef on disk → byte-identical published GLBs across re-runs (verified `sha1sum public/trees/procedural_broadleaf/skeleton-1-lod0.glb` before/after a re-publish of the same species).
- **Fixes:** bark looks like photo bark (not 32×32 noisy brown); per-(species, Look, instance) retint via uniforms; per-Look pink-tinted maples possible via `materialColors[procedural_broadleaf]` reload; per-instance hue jitter ready; per-species roughness override ready; single shader program preserved; pipeline ready for SpeedTree drop-in.
- **Doesn't fix:** UV tiling — the 1K photo bark sample stretches across full cylinder height (a 12m tree gets the same sample density as a 0.4m twig); tighter per-cylinder tiling is a follow-on requiring a `uvScale` shader uniform + per-cylinder UV multiply. No Workstage authoring UI (Phase B.1). No Stage debug overlay (Phase B.1). Acceptance criteria 5/6/7 from the original brief (WebGLProgram count check + Bloom flicker test + per-instance jitter visual) deferred to Phase B.1's debug overlay; the core infra above is structurally correct (single material → single program; aBark per-vertex → leaf fragments untouched; world-XZ hash → per-tree jitter).

**Phase B.1 — split into B.1.a (shipped) / B.1.b + B.1.c (deferred)**

**Phase B.1.a — UV-scale wiring** — **SHIPPED 2026-05-15 / 2026-05-16** (commits `6c5c957` initial + `e77278e` `textureGrad` polish + `94519db` aniso polish — last two reverted as no-ops in `d50dd7b`; `fd187d7` pre-tile-at-source v2; `54355a4` v3 revert to baseline = current state)
- 3 new uniforms on the shared tree material — `uBarkUVScale` (vec2), `uBarkTileOffset` (vec2), `uBarkTileScale` (vec2) — initialized to identity (no-tile, full-atlas-span). Set per-draw in `applyBarkUniforms` from `barkBySpeciesEffective` resolved against the per-species manifest entry + the manifest's `tiles[].uvTransform` lookup (search tile by `classification==='bark'` AND `refs.some(r => r.species === <species>)`).
- Fragment shader replaces the entire `#include <map_fragment>` chunk (the standard chunk hardcodes `texture2D(map, vMapUv)` — insertion before/after can't intercept the texture sample). Replacement reconstructs the chunk's `#ifdef USE_MAP` body verbatim BUT inserts a wrap-within-tile-bounds step before the sample: `localUV = fract((vMapUv − tileOffset) / tileScale × uvScale)`, then `mapUV = localUV × tileScale + tileOffset`. Gated by `vBark > 0.5 && uvScale != (1,1)` so leaves bypass entirely and bark species with explicit uvScale=identity also no-op. fract() wrap stays strictly inside the tile, so no bleed into neighbor atlas tiles. Mipmap gradient discontinuity at wrap lines is the standard tile-wrap artifact; mitigation via `textureGrad()` is a follow-on if visible at Hero.
- Architectural deviation from the brief's per-vertex `aBarkTileOffset`/`aBarkTileScale` attributes: switched to per-draw UNIFORMS because within a merged geometry (one URL = one species + variant), all bark verts share the same tile bounds and all leaf verts share the same tile bounds — per-vertex would have been ~30 MB of VBO at LS scale (50K verts × 36 variants × 16 bytes) for what is effectively per-primitive-constant data. Per-draw uniforms align with the `applyBarkUniforms` pattern Phase B core already established for tint/jitter/roughness. Single compiled program preserved.
- Per-species `uvScale` starter values shipped in PRESETS — broadleaf `[1.5, 4.0]`, conifer `[1, 3]`, ornamental `[1.5, 3]`, columnar `[1, 4]`, weeping `[1.5, 2]`. Tightest vertical tiling on broadleaf + columnar (long trunks, photo bark would otherwise smear). Tune visually in Phase B.1.b.
- **Phase B core bug fixed in passing:** the B-core merge-time stamp checked `o.userData?.atlasKind` for the bark vs leaf signal, but GLTFLoader assigns primitive-level extras to `geometry.userData` (see three's `GLTFLoader.js:4649`), not `mesh.userData`. Effect: in B core every vert silently got `aBark = 0` → the retint + roughness + jitter paths never fired on any fragment. Trees rendered fine because the uniforms defaulted to identity; the regression was invisible-by-design. B.1.a's UV-wrap path also relies on the gate, so the fix is load-bearing for this phase. Lookup now reads `geometry.userData.atlasKind` first with the old paths as fallbacks. Per-instance jitter, per-Look pink-tint reload, and roughness overrides all become functional for the first time with this commit.
- **Determinism preserved.** uvScale is runtime-driven (read from `trees-atlas.json` by the shader); same source manifest → byte-identical GLB output (`sha1sum public/trees/procedural_broadleaf/skeleton-1-lod0.glb` matched pre-B.1.a). Only the manifest's `barkBySpecies` block + species `manifest.bark.uvScale` updated.
- **Single shader program preserved.** New uniforms + varyings ride the existing material via `onBeforeCompile`; no `customProgramCacheKey` divergence. Bloom-stable.

**Phase B.2 — Proper bark tile wrap (atlas vs tiling tradeoff, deferred)**
- Phase B.1.a's `fract`-inside-atlas approach has an unavoidable derivative
  discontinuity at wrap lines: the GPU picks the coarsest mip there →
  narrow blurry stripes that "crawl" slightly under tree sway at close-up
  Hero distance. We tried `textureGrad` with the math-correct gradient
  (`dFdx(vMapUv) × uBarkUVScale`) — it eliminated the crawl but produced
  *uniform* mip-blur because dense tiling legitimately requires coarser
  sampling per pixel. That's honest GPU mipmap math, not a bug; it's the
  cost of atlas-tile + dense-repeat combined. Bumped anisotropy 4 → 16
  hoping the aniso hardware would compensate; no visible difference,
  meaning the wider gradient is already past the regime where aniso helps.
  Reverted both polish attempts (`e77278e` textureGrad and `94519db`
  aniso bump are no-ops in the final code path; the comments record the
  reasoning so future babies don't re-walk this).
- **Proper-fix paths** (pick one when B.2 lands):
  1. **Texture arrays** — one atlas layer per unique bark `materialRef`,
     each with `GL_REPEAT`. Sampler index from a per-draw uniform.
     Hardware tiling, hardware mipmap, hardware aniso. Single shader
     program preserved (one sampler binding, different layer index per
     draw). WebGL 2 standard. Pipeline change in bake-look.
  2. **Pre-tile in atlas** — bake-look composites an N×M-tiled version
     of the source into the atlas tile content; shader samples directly
     with no shader-side wrap. Atlas footprint grows N×M for bark tiles.
     Simpler pipeline change but heavier atlas.
  3. **Separate textures per species** — clean GL_REPEAT but breaks the
     single-program Bloom constraint (`bake-look.js:200` "non-negotiable").
     Not viable without re-evaluating that constraint.
- For now: plain `texture2D` + `fract` wrap. Sharp bark away from wrap
  lines; narrow wrap-line crawl at close Hero. Accept as the smaller cost
  until B.2 lands.

**Phase B.1.b — Workstage Bark panel** (deferred)
- Per-species Bark panel in `src/arborist/Workstage.jsx`: material dropdown w/ 128×128 thumbnails (cached server-side), UV scale X/Y sliders, tintBase color picker, tintJitterRange + roughnessOverride sliders, "Apply & republish species" button.
- `GET /procedural/bark/materials` lists available CC0 materials under `public/textures/bark/`; `POST /procedural/:species/bark` writes `manifest.bark` and re-triggers republish + per-Look atlas rebake.

**Phase B.1.c — Stage debug overlay** (deferred)
- `renderer.info.programs.length` readout + active bark uniform values for the focused species; toggle-able dev surface so visual gates (criterion 5: WebGLProgram count; 6: per-Look pink-tint reload; 7: per-instance jitter visual) close mechanically.

**Phase F — Per-species PSD-authored leaf cluster atlases + 2-stop tint ramp + sparse occupancy** (scope reframed 2026-05-16 EOD)
- **Scope reframe:** the original Phase F scope included `arborist/leafCluster.js`, a sharp-based parametric cluster compositor with per-leaf rotation/scale/position jitter knobs. **That infrastructure is dropped.** It was designed to *scale* leaf authoring to all 60 inventory species; for 5 heroes, Photoshop is faster + better (artist controls overlap, density, color, accents directly; per-season variants are additional PSDs; no parametric tuning struggles).
- **New scope: import PSD-authored cluster PNGs at `public/textures/leaves/<species>/cluster.png` (or per-season subfolder), atlas + tint + sparse-occupancy at runtime.** Operator authors clusters in Photoshop for each hero; the pipeline picks them up via species manifest `leafCluster.textureRef`. Workstage Leaf panel = picker + tint stops + occupancy slider, not a slider-driven compositor UI.
- Fillers continue to use shared per-morph PNGs (`public/textures/leaves/<morph>.png`) via the existing v1 single-leaf-card pipeline — substitution-fallback covers them at v1.5 quality. Heroes override with PSD-authored clusters.
- **Sparse-cluster mode is still load-bearing.** `PRESETS.leafCluster` carries an `occupancy` field even for PSD-authored clusters — the shader uses it for per-tree alpha-density variation that the PSD's alpha channel can't carry. Honeylocust ~25% occupancy (dappled translucent canopy — the signature), oak ~70%, conifer needles ~95%.
- `buildLeafGeometry` uses cluster cards; fewer cards per tree, each card visually denser.
- Material extras carry 2-stop tint ramp (inner/outer × per-season); leaf shader samples UV.y for inner-vs-outer mix.
- Workstage gains per-species foliage panel: cluster texture preview, summer/fall inner+outer color pickers, occupancy slider. NO density / jitter / cluster-count sliders (those would be compositor knobs; compositor is dropped).
- **Fixes:** foliage reads dense at distance; fall color has inner-to-outer gradient that's the species signature; sparse-canopy species (honeylocust) read correctly translucent.
- **Doesn't fix:** still need per-species PSD authoring for any new hero beyond the 5 (the substitution-fallback safety net per pillar 0 covers the rest until v1.6+ authoring passes scale up via the same PSD-import path).

**Phase F.5 — Leaf editor** — **KILLED 2026-05-16 EOD**
- The parametric leaf editor (lobe count / lobe depth / edge serration / venation density → generated PNG) was pulled forward from v1.6 as Phase G.1's enabling tool. **Obviated by PS-authoring.** For 5 heroes, hand-authoring in Photoshop produces better species character than any parametric generator at less engineering cost.
- If the inventory ever scales to 60 species (v1.6+), the parametric editor may return — but only if the PSD-authoring workflow itself becomes the bottleneck. Until then, the kill stands.

**Phase G — Five hero proving passes (G.1–G.5)**

With Phases A → D → B-core → B.1.a → C → F landed (E priority-dropped; F.5 killed), the full machinery exists. G is where the **5 hero species at Hero quality** product goal is achieved. Each sub-phase is its own commit, its own acceptance criterion, its own visible-bug-coverage statement. G.5's species is operator-decided after G.1–G.4 ship.

- **G.1 — Sugar Maple** (`acer_saccharum_procedural`). Dominant inventory species, canonical broadleaf, strictest visual bar. Includes Phase F.5 leaf-editor enabling work — author the palmate leaf first, generalize the editor surface out of it. Envelope: rounded oval 12m × 20m. Tropism: zero. Phyllotaxis: opposite (the species signature). Attractor count: ~600. Bark: furrowed, `#3a2820`/`#6a5040`. Leaf cluster: palmate × 8 per card, ~70% occupancy. Tint ramp summer `#2a5825→#3a7530`, fall `#a85020→#d4801f`. **Acceptance:** reads as Sugar Maple to a botanist at Hero from 30 m up. **Fixes:** ~60+ park trees mapping to acer_saccharum via species map ship at hero quality; reference implementation for what tuned procedurals look like.
- **G.2 — Ginkgo** (`ginkgo_biloba_procedural`). Tests per-species leaf authoring (F.5) on the most leaf-defined species in temperate forestry. Bilobed fan + uniformly luminous gold fall is the signature. Authored as a new procedural_ginkgo species (envelope: rounded-cone variant; tropism: zero; leafMorph: `fan` with luminous gold tint ramp), **NOT as a substitution into procedural_broadleaf** — the silhouette (narrower than oak, fuller than columnar) doesn't sit inside the existing morphology buckets. **Acceptance:** ginkgo reads as ginkgo (bilobed fan + brilliant uniform-gold fall) at Hero; reference photo overlap with Lafayette Square's actual ginkgos is visually convincing.
- **G.3 — Willow** (`salix_babylonica_procedural`). Weeping algorithm validation at hero quality. Authored on top of `procedural_weeping` (Phase D's envelope + tropism doctrine already producing the recurve via physics). Only 3 placements in inventory but iconic — Lafayette Square's willows are landmark trees. **Acceptance:** weeping curtain reads as Salix babylonica specifically, not generic-weeping; narrow lance leaves; gold-green summer / yellow fall.
- **G.4 — Honeylocust** (`gleditsia_triacanthos_procedural`). **Sparse-cluster machinery validation.** Authored on top of `procedural_broadleaf` filler via the category fallback path (no new morphology bucket needed — honeylocust's silhouette fits the broadleaf SCA envelope; the species character is in the leaves + occupancy). Bipinnately compound leaves (F.5), ~25% cluster occupancy (Phase F), dappled translucent canopy. **Acceptance:** the dappled-shadow signature comes through at Hero — the canopy reads translucent, not solid; sun spots dapple the ground.
- **G.5 — TBD 5th hero.** Decision deferred to operator after G.1–G.4 ship. Candidates:
  - **Spruce or Pine** (conifer slot). Exercises Phase E's monopodial-whorl algorithm at hero quality. Resolves the Phase E priority-drop question by elevating one conifer to v1.5 if visual review at LS demands it.
  - **Pin Oak.** Second broadleaf character — lobed (not palmate like maple). Lets the broadleaf bucket prove it can carry two distinct hero silhouettes without one bleeding into the other.
  - **Sycamore** (`platanus_acerifolia` family). Closes the loop on the existing hand-modeled `platanus_acerifolia` ×9 variants that Grove curation would otherwise prune out — replaces them with a procedural hero rather than maintaining two parallel sources for the same species.
- **Doesn't fix:** other 60+ inventory species still need per-species hero authoring eventually (ongoing operator workflow now that the editor + workstage + atlas pipeline all exist). The two-tier substitution safety net per pillar 0 keeps the unauthored species visually plausible until each gets its own hero pass — v1.6+ work.

### Constraints carried across every phase

- **Stash-isolate every commit** per [[feedback_stash_isolate_per_file]]. Operator working tree always has unrelated dirty files; each baby plumbs design.json / index.json the same way the v1 commit (`dbbd1ed`) did.
- **No fork of foundational pipeline.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js` stay untouched. Generator output adapts to what they expect.
- **`generateTreeMesh()` params signature is the contract.** UI binds to it; CLI binds to it. Never bypass.
- **Trinity touch every phase.** FEATURES update for visible-bug-resolution; this NOTES maxi-brief gets a rolling update reflecting what shipped per [[feedback_features_md_is_a_working_doc]]; BACKLOG tick-off.
- **Determinism.** Same params + same seed → byte-identical GLB. Required for `writeIfChanged` mtime stability + cache predictability.
- **No `procedural` token in `src/` beyond the already-shipped `treeAtlasMaterial.js` extras** (which will gain bark + leaf shader patches in B + F respectively). Generator + state stays in `arborist/` and `public/trees/`.
- **Hero species are first-class citizens at the same `generateTreeMesh()` API.** They get their own PRESETS table entries; `park_species_map.json` routes inventory entries to them via preferred-species lists; `bake-look.js`'s `unifyAtlases` round-trips them through the same atlas pipeline as fillers. The mechanical distinction between "hero" and "filler" is **quality rating + per-species tuning depth**, not pipeline location. Every hero must work through the published artifacts pipeline per [[feedback_preview_uses_production_pipeline]].
- **Surface scope drift in every status update + commit body** per [[feedback_baby_must_surface_scope_drift]]. Phase A's silent `Workstage.jsx` extension → Phase D's proactive 3-item disclosure is the pattern; every subsequent phase brief carries the explicit "surface anything not in this brief" clause and every baby discloses extra files / schema extensions / retuned defaults.

### Deferred / out of scope

- **Full 60-species hero coverage** — eventually, but explicitly **not urgent for v1.5**. The two-tier substitution fallback (pillar 0) covers the gap until each species gets its own hero authoring pass. v1.6+.
- **Street-view photoreal.** v2. Don't trade Hero/Browse quality for Street fidelity that won't ship.
- **Real bark/leaf photographic scans.** v2 (SpeedTree replacement window). Phase B's procedural-bark-shader path is deliberately the shape SpeedTree migration plugs into unchanged — heroes drop out via the same `quality` mechanism when their SpeedTree replacements land.
- **Per-conifer-species hero variants beyond Phase E's algorithm** (Norway Spruce vs Blue Spruce vs White Pine vs Bald Cypress as distinct hero species ids) — Phase E ships ONE generic conifer algorithm at v1.5; per-conifer-species hero authoring defers to v1.6 unless G.5 elects a conifer.
- **Plant tool / interactive placement editor.** Per SPEC.md, v1.1+ work in Cartograph Designer; not procedural-trees scope.
- **Runtime tree generation.** Bake is structurally required; no path to runtime SCA.

### Architecture record cross-references

- v1 ship doctrine: NOTES entry "## 2026-05-14 — Procedural-trees fallback: shipped (commit `dbbd1ed`)"
- Original ParkTrees algorithm (resurrected for v1): `git show 43c4aa3~1:src/components/LafayettePark.jsx | sed -n '440,880p'`
- Arborist UI patterns to mirror: `src/arborist/Workstage.jsx` (per-species toolbar/viewport/panel), `src/arborist/SpecimenViewport.jsx` (R3F GLB renderer), `src/arborist/Grove.jsx` (gallery)
- Memories: [[project_v1_no_trees]], [[project_slab_is_the_instance_identity]], [[project_kit_helpers_pattern]], [[feedback_no_parallel_pipeline_for_scenes]], [[feedback_stash_isolate_per_file]], [[project_doped_artifact_placecard_edit_pattern]], [[feedback_phase_scope_explicitness]], [[feedback_d3_bundling_failure_modes]], [[feedback_features_md_is_a_working_doc]], [[feedback_baby_must_surface_scope_drift]], [[feedback_notes_md_holds_architecture]], [[feedback_preview_uses_production_pipeline]]

---

## 2026-05-14 — Procedural-trees fallback: shipped (commit `dbbd1ed`)

**Status:** v1 landed. Five procedural species (`procedural_broadleaf` ×3 / `_conifer` ×2 / `_ornamental` ×2 / `_columnar` ×2 / `_weeping` ×2) publish through the unmodified `publish-glb` → `bake-look` → `bake-trees` pipeline. ~140/745 LS park placements now substitute procedurals (procedural_weeping has no shape-match placements; sits in roster ready). The architecture record below stands as written — the design landed verbatim.

### What's true post-ship that wasn't fully captured pre-ship

- **Grove is the operator's roster knob.** `src/arborist/Grove.jsx` already implements per-Look roster curation: scope toggle `In Look` / `All Rated`, click-to-toggle membership, fires `/api/cartograph/looks/<id>/trees` + `/api/arborist/atlas/bake?look=<id>` automatically. The "manually edit `design.json#/trees`" path my generator uses is the script-side equivalent; in normal operation an operator opens Grove → curates → done. **The 14 heavy hand-authored variants are pruned by clicking them out in Grove, not by editing design.json.**
- **Per-Look atlas budget unlocks once roster shrinks.** `bake-look.js`'s `CONTENT_CAP` caps tiles at `bark 512×1024 / leaf 512×512`. The 25-tree LS roster today produces a 4040×1560 unified atlas (~6 MB color PNG); pruning to ~10 trees frees ~60% of atlas area, opening room for `bark 1024×2048 / leaf 1024×1024` at no runtime cost. One-line knob in `arborist/bake-look.js:39` — defer until operator finishes Grove curation so the actual roster size drives the cap.
- **Bark variation deferred to SpeedTree.** The original ParkTrees palette (`['#5a4030', '#4d3828', '#634838', '#554030', '#4a3525']`) drove per-tree bark color via vertex colors; bake-look's atlas rewriter strips `COLOR_0` (bake-look.js:459), so v1 procedurals get one bark texture per species (5 distinct browns across the roster). SpeedTree restores per-instance bark via tinted baked-card atlas tiles — already the SpeedTree migration plan, no new gap.
- **`cartograph/serve.js` Bake-button chain runs `bake-trees.js --look default`** (not `--look <id>`). With procedurals at `quality=2` in `public/trees/index.json`, the default Look's placements file now substitutes procedurals — but the default Look's `design.json#/trees` doesn't include them and `bake-look` won't atlas them under `public/baked/default/`. Runtime fetches to `/baked/default/trees/procedural_*/...` will 404 when the default Look is the active one. **Risk window:** only when an operator deploys against `?look=` unset or `=default`. Mitigation when relevant: add procedurals to default's roster via Grove + per-Look atlas-bake (the same mechanism), or gate the universal `public/trees/index.json` per-Look (out of scope for v1 stopgap).
- **The publish-glb `quality` knob: `qualityOverride: 2`, not `quality: 2`.** publish-glb writes `quality: 0` (Untouched sentinel) on every newly-published variant; the Rating UI writes `qualityOverride: <N>` and that's what `build-index.js` consults (`effQuality = v.qualityOverride ?? v.quality ?? 0`). My generator patches `qualityOverride` on each procedural variant post-publish — preserves the "operator-rated" doctrine without forking publish-glb.

### Deferred: procedural authoring UI in Arborist (~1 day, no algorithm change)

Designed in the "Eventual UI" block below. `generateTreeMesh()` exposes the exact params signature the UI will bind to: `{preset, seed, dbh, canopyR, canopyH, branching, leafMorph}`. Slot-in plan:

1. Top-level mode toggle in `ArboristApp.jsx`: `[Scan] | [Procedural]`. Procedural mode shows the 5 species in Library; per-species detail view shows the current `PRESETS` table entries as editable variants.
2. Right-pane tune panel mirrors Workstage's voxelSize/minRadius/tipRadius pattern, with: shape preset dropdown / dbh / canopyR / canopyH / branching dropdowns (primaryN, childN, spread, baseTilt, droopPerGen, maxGen) / leaf morphology dropdown (from leafTypes.json) / seed integer + dice button.
3. `POST /procedural/generate` in `arborist/serve.js`: reads body params, calls `generateTreeMesh()`, packages into a single-variant GLB (the existing `buildSourceGLB` helper, refactored to accept one variant), streams the binary back. `SpecimenViewport.jsx` renders it.
4. "Adopt as seedling" button writes the params + seed to `arborist/state/procedural_<morph>/seedlings.json` and triggers `publish-glb.js` (mirrors the scan workflow's adoption).

Not v1-blocking. Carried as a BACKLOG line.

---

## 2026-05-14 — Procedural-trees fallback: pre-ship design memorial (archival, kept for reference)

The entry below is the pre-ship architecture record per [[feedback_notes_md_holds_architecture]]. Preserved verbatim because the design landed without changes; future migrations should trace from here.

### Why this exists

Current `lafayette-square` Look roster carries 14 hand-modeled/scanned variants (`platanus_acerifolia` ×9, `alaskan_cedar_2`, `broadleaf_rt3`, three generics). Total 138 MB baked GLBs + 10 MB atlas — too heavy for the mobile target per [[feedback_beautiful_first_lightweight_51]]. SpeedTree is the eventual destination (cards + LODs + impostor baker) but it carries a learning-curve cost. Procedurals are the v1 stopgap per [[project_v1_no_trees]].

The wiring to remove the old procedural component was already done at commit `43c4aa3` (Arborist library split); `{false && <ParkTrees />}` and its dependencies are gone from `src/`. Only stale doc-comment residue remains (`src/components/R3FErrorBoundary.jsx`, `arborist/SPEC.md:16`). The deployed live site still mounts those procedurals because it ships from a pre-`43c4aa3` build.

### Design: roster mix, not generator-only

The decisive insight: **procedural and hand-authored trees coexist in the same roster.** InstancedTrees' substitution pool is keyed by category, ranked by `quality` (0=Untouched/excluded, 1=Trash, 2=Fill, 3=Mid, 4=Hero). One roster can carry:

- `procedural_broadleaf` ×3 variants at `quality=2`
- `platanus_acerifolia` ×9 variants at `quality=4`
- `procedural_ornamental` ×2 variants at `quality=2`
- vendor `dogwood` ×4 variants at `quality=4`

All four pool into their category bucket; per-placement hash picks deterministically. Operator tunes mix via the Grove's quality slider alone — no rebake of placements, no code touch. SpeedTree replaces by raising its ratings; procedurals stay in roster at low rating as a permanent floor. This is [[project_doped_artifact_placecard_edit_pattern]] applied to trees: roster carries options, runtime samples by category × rating, operator refines.

**The Grove becomes the tree experiment surface.** Each Look has its own roster mix; an operator can author a `lafayette-square-procedural-only` Look (zero SpeedTrees rated), a `lafayette-square-cinematic` Look (all hand-authored, full quality), and any combination, without ever changing tree placements.

### Pipeline: reuse, don't fork

Generator emits a multi-node source GLB (one top-level node per variant, named `procedural_<morph>_1..N`). `publish-glb.js`'s existing variant detection (`namesSuggestVariants` / `nodesSpatiallySeparated`) splits it; LOD simplification, manifest emission, helper-mesh filtering, `normalizeScale` from approxHeightM — all unchanged. `bake-look.js` atlas-packs procedural leaf-card PNGs (already present in `public/textures/leaves/`) + a 1×1 solid-color bark swatch into the unified Look atlas. No fork of `publish-glb` / `atlas-pack` / `bake-look` / `bake-trees`. No `src/components/` edits beyond the 2-line stale-residue cleanup.

`InstancedTrees` consumes the published artifacts unchanged. The runtime sees one uniform tree-publishing channel.

### Generator: parameter-first, UI-additive

`arborist/generate-procedural.js` exposes one pure function:

```
generateTreeGLB({
  preset,          // 'broad' | 'conifer' | 'ornamental' | 'columnar' | 'weeping'
  seed,            // integer for deterministic regen
  dbh,             // trunk size driver (matches old ParkTrees signature)
  canopyR, canopyH,
  branching: { maxGen, primaryN, childN, spread, droopPerGen, ... },
  leafMorph,       // 'palmate' | 'lobed' | 'ovate_large' | ... (from leafTypes.json)
  barkPalette,     // array of 5 hex strings
}) → GLB buffer
```

The v1 commit ships a CLI wrapper iterating a small hardcoded preset table (one config per morphology × 1–2 seed variants). The eventual Arborist UI (top-level mode alongside scan-import per Jacob 2026-05-14) binds sliders to the same parameter object — same function, no algorithm change. **Discipline:** every variant in v1 must be expressible as a `params` object. No hardcoded shortcuts that bypass the parameter contract.

Algorithm resurrection target: commit `43c4aa3~1`, `src/components/LafayettePark.jsx` lines 450–880. Lift `growBranch`, `addLeaf`, `makeBranch`, `paint`, the per-shape branching configs (`conifer` whorl logic, `weeping` droop, `columnar` upright, `broad`/`ornamental` recursive crown). Drop the runtime-only bits: `useEffect` instance-matrix wiring, `onBeforeCompile` shaders, panel-color reactivity — those live in `treeAtlasMaterial.js` (atlas side) or are obviated by the per-instance pipeline.

### Species model: one per morphology

Five published species in `public/trees/`: `procedural_broadleaf` / `procedural_conifer` / `procedural_ornamental` / `procedural_columnar` / `procedural_weeping`. Mirrors `src/data/leafTypes.json` morphology axis; the eventual UI species-picker maps cleanly; bake substitution stays per-category.

(Rejected alternatives: one catch-all `procedural` species — wrong shape for UI; mirroring real species names like `procedural_acer_saccharum` — maximally substitutable but bloats state for a v1 stopgap.)

### Eventual UI (deferred, ~1 day on top)

Top-level mode toggle in the Arborist app: `[Scan] | [Procedural]`. Procedural mode owns the viewport. Right-pane tune panel mirrors the existing voxelSize/minRadius/tipRadius scan-panel pattern, with params instead:

- Shape preset dropdown
- Trunk: dbh, lean
- Crown: canopyR, canopyH
- Branching: maxGen, primaryN, childN, spread, droopPerGen
- Leaf morphology dropdown (sourced from `leafTypes.json`)
- Bark palette: 5 swatches
- Seed: integer + dice button

`POST /procedural/generate` endpoint on `arborist/serve.js` returns a GLB buffer; viewport renders it via `SpecimenViewport.jsx`. "Adopt as seedling" writes to `arborist/state/procedural_<morph>/seedlings.json` and triggers `publish-glb.js`. Not v1-blocking; build the function now with the API the UI will need.

### Constraints carried into the brief

- [[feedback_stash_isolate_per_file]] — the procedural commit must NOT bundle the 23 unrelated dirty files in the tree
- [[project_kit_helpers_pattern]] — Arborist owns trees end-to-end; cartograph never imports tree code
- [[feedback_no_parallel_pipeline_for_scenes]] — no procedural-only mount path bypassing InstancedTrees; the fallback is roster entries, not parallel renderers
- [[project_slab_is_the_instance_identity]] — procedurals travel through bake into the slab artifact like everything else; deployed runtime sees one uniform tree channel
- [[project_writeifchanged_touches_mtime]] — if the generator or pipeline writes files conditionally, mtime touches on no-op

### Acceptance for the v1 commit

- `node arborist/generate-procedural.js` + `node arborist/bake-trees.js --look lafayette-square` produces a `trees-atlas.json` whose roster includes all 5 procedural species at authored quality rating
- LS Stage / Preview / production render trees via `InstancedTrees` substituting procedurals into every park placement
- No `procedural` token appears in `src/` (only in `arborist/`, `public/trees/`, `public/baked/<look>/`)
- 2-line stale-residue cleanup (`R3FErrorBoundary.jsx` doc-comment, `arborist/SPEC.md:16`) lands in same commit

---
