# Brief 5 — Vendor leaf preservation + cousin-swap pivot

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Use second person throughout. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Mission

Pivot Salon's leaf rendering from algorithmic spray-at-attachment-tags to **vendor-card-preservation with Salon-controlled textures**. The chassis ships with the vendor's leaf-card geometry intact (their placement was always better than ours). At composition time, Salon binds the operator-picked leaf pack's texture to the vendor's leaf material and rewrites per-card UVs to sample one tile per card from the pack's tile grid.

This preserves the **cousin-swap thesis** — the whole point of Salon — while capturing vendor-quality placement.

## Why this exists (operator-stated, 2026-05-22)

Salon's leaf emission (anchor-spray-with-inward-bias) hit a quality ceiling: floaters past the canopy silhouette + patches between anchor clusters. Vendor packs already solved placement — leaves attached at branch tips, scattered through canopy volume the way real leaves grow. We were stripping that information and trying to re-synthesize it algorithmically. The pivot recognizes that vendor placement is a one-time gift; we should keep it.

The diagnostic that surfaced this: in the Robinia pseudoacacia bundle, vendor cards use uniform UV [0,0]→[1,1] per card with two cleanly-named materials (`Bark_Robinia-pseudoacacia` + `Leaf_Robinia-pseudoacacia`). Swapping the leaf material's `baseColorTexture` rebinds every card to a new texture in one move. Cousin swap is preserved; Phase F (year-long manifest) and per-Look art direction continue to work via the same texture-swap mechanism.

## A note on cousin-swap species mapping (read before you start)

Salon's chassis-to-species mapping is decoupled from visual provenance. The Linden chassis you'll work with is filed under the LS-inventory species `tilia_americana` (American Linden) but the visual source is **European Linden** (likely *Tilia × europaea* or *T. cordata* per silhouette). The curation `displayName` reads "European Linden"; the species slot reads `tilia_americana`. **This is correct.** It's the cousin-swap pattern in action — an LS species gets its visual from a closely-related vendor source. Don't try to "fix" this naming mismatch; it's load-bearing architecture.

When you regenerate the chassis library, expect: file `american_linden_a.glb`, species slot `tilia_americana`, curation displayName "European Linden", source GLB at `botanica/trees/european-linden/`. All four are aligned with intent.

## Architecture comparison

| Layer | Current (status quo) | Pivot target |
|---|---|---|
| `survey-deleaf.js` | LEAF primitives **stripped**; `atlasKind: 'bark'` stamped on retained wood | LEAF primitives **kept**; `atlasKind: 'leaf'` stamped on them; vendor's leaf texture(s) disposed, material slot preserved as a placeholder for runtime binding |
| `generate-salon.js` | Spray N cards at each `leafAttachmentTags` anchor via `buildLeafGeometryFromAttachments` | Bind picked pack's texture to existing leaf material; rewrite per-card UVs (groups of 4 verts → 1 random tile per card from `tileGrid`) |
| `leafAttachmentTags` | Primary placement source | **Fallback only** — used when chassis has no native leaf primitives (LiDAR scans; future procedural) |
| `buildLeafGeometryFromAttachments` | Always runs | **Fallback only** — runs when chassis has no LEAF primitives |
| `bake-look.js` atlas pipeline | Unchanged | **Unchanged** — sha1 dedup absorbs the bound texture; master atlas pack continues identically |
| Per-composition `leaves.show` | Implicit (no toggle; leaves always emitted) | **Workstage-only toggle** — operator can hide leaves for bare-chassis inspection. Does NOT propagate to baked artifact (see "Out of scope") |

## Files you'll touch

1. **`arborist/survey-deleaf.js`** — modify the de-leaf loop. Currently lines ~199–205 strip LEAF primitives:
   ```js
   for (const p of primClassifications) {
     if (p.cls === 'LEAF') {
       p._mesh.removePrimitive(p._prim)
       p._prim.dispose()
     } else {
       p._prim.setExtras({ ...(p._prim.getExtras() || {}), atlasKind: 'bark' })
     }
   }
   ```
   Replace with: stamp LEAF primitives with `atlasKind: 'leaf'`, dispose their material's textures (so the chassis GLB doesn't ship a 50MB vendor leaf atlas), keep the material slot. Bundle path (line ~491 onward) gets the same treatment.

2. **`arborist/generate-salon.js`** — significant additions in the composition builder:
   - Walk the chassis doc for primitives stamped `atlasKind: 'leaf'`.
   - If any exist: skip the entire `buildLeafGeometryFromAttachments` spray path. Instead, for each leaf primitive:
     - Replace its material's `baseColorTexture` with the picked pack's `shape.png` (already wrapped at `salon_leaf_<pack>` per current code).
     - Set `alphaMode='MASK'`, `alphaCutoff=0.5`, `doubleSided=true`, `roughnessFactor=0.85`, `metallicFactor=0` to match Salon's spray-mode material (Bloom stability).
     - Rewrite UVs per-card: detect quad-clean meshes (see "Quad detection" below) and per group-of-4-verts pick a random tile from `tileGrid`. Use `mulberry32(hashString(chassis|composition|seed))`-keyed RNG so the same composition produces byte-identical UV rewrites.
     - Non-quad meshes (triangle soup / strip): skip the UV rewrite, leave at vendor's UV [0,0]→[1,1]. Visual fallback is "all tiles in one card" which is still better than nothing on the placement side.
   - If NO leaf primitives present (LiDAR / wood-only chassis): fall back to the existing spray code path. `buildLeafGeometryFromAttachments` stays in the codebase as fallback.
   - Per-composition `leaves.show` field consumed at Workstage rendering layer only — see "Out of scope" for clarification on bake-time behavior.

3. **`src/arborist/SalonWorkstage.jsx`** — in `SalonControlsPanel`, the Leaves section gains a `show` checkbox (default `true`). When unchecked, the operator sees the bare chassis. This is **inspection-only**: the toggle gates whether the workstage's preview-fetch includes leaf-binding, NOT whether the published artifact has leaves. Persists through the existing `onParams` patch path; field lands at `composition.leaves.show`.

4. **Public/textures/leaves/shapes/*/meta.json** — sweep all 10 packs. `heart` and `palmate` already have `tileGrid` set today. Add `tileGrid: [cols, rows]` to each based on a visual count of leaves in `shape.png`. The 8 unswept packs as of this writing: `serrate_ovate`, `lobed`, `ovate`, `elm_autumn`, `oak_autumn`, `lanceolate`, `long_needle`, `ovate_large`. Look at each `shape.png` directly to count tile dimensions.

## Quad detection — robust against winding variation

A "quad" in indexed glTF = two triangles sharing an edge, spanning 4 unique vertices. **Don't assume a specific winding pattern.** Real-world vendor exports use multiple conventions:

| Pattern | Layout |
|---|---|
| `[0,1,2, 0,2,3]` | Fan from vertex 0 |
| `[0,1,2, 2,3,0]` | Fan from vertex 0 (different order) |
| `[0,1,2, 2,1,3]` | Strip variation |

All three are valid quads. The robust test: **take indices in groups of 6, count unique values, require exactly 4.** That's it. Don't fingerprint specific winding orders.

Additional sanity: the 4 unique vertices should form a coherent quad in position-space (not crossed). For maximum robustness, also verify the 4 indices appear consecutively in the vertex buffer (i.e., the quad uses verts `[k, k+1, k+2, k+3]` for some `k`). If they're scattered across the vertex buffer, the mesh is likely not card-strip topology and the UV rewrite should skip that mesh.

## UV write happens in pack-texture-local space

Subtle but important per [[feedback_atlas_subregion_uv_recovery]]: the per-card UVs you write are in **pack-texture-local [0,1] space**. They reference sub-regions of the bound leaf material's texture (which is the Salon pack's `shape.png`).

`atlas-survey.js` + `bake-look.js#unifyAtlases` at bake time will:
1. Collapse the leaf material's bound texture into the master atlas.
2. Linearly remap your pack-local UVs onto the master atlas's leaf tile region via `vMapUv = baby_uv * pack_scale_in_atlas + pack_offset_in_atlas`.

**You write in pre-atlas-repack space; atlas-survey handles the next layer.** Don't pre-emptively address the master atlas's sub-region offsets — that's atlas-survey's job. The Cinder bug (`feedback_atlas_subregion_uv_recovery`) was the inverse situation: fragment-chunk consumers needed to *recover* [0,1] local-UV from `vMapUv`. Your job is the producer side; you stay in local UV space and let the pipeline remap.

Concretely: if `tileGrid = [3, 2]` (heart pack) and you pick tile (1,0) for a card, write UVs in the rectangle `u ∈ [1/3, 2/3], v ∈ [0, 1/2]`. That's pack-local. atlas-survey will scale this rectangle to wherever the pack lands in the master atlas.

## State at brief-write time

- `american_linden_a` chassis is currently stripped (no LEAF primitive). After your survey-deleaf change, regenerating it via `node arborist/survey-deleaf.js` should produce a chassis with the LeavesSG mesh restored, stamped `atlasKind: 'leaf'`.
- `public/trees/robinia_pseudoacacia/skeleton-1-lod0.glb` has been written from the vendor source (`.gltf` with multiple buffers consolidated to 1). It's a 4-tree bundle (A/B/C/D); survey-deleaf's bundle-decomposition path applies. Boz pre-checked the structure:
  - Materials: `Bark_Robinia-pseudoacacia` + `Leaf_Robinia-pseudoacacia` — clean naming, classifier hits via matName.
  - 2 of 4 trees are quad-clean (A: 580K verts/145K cards; B: 672K verts/168K cards). The other 2 (C, D) are non-quad — surface what topology they actually have.
- `arborist/leaf-attachment-defaults.json` is at `gridDensity: 30, topYFrac: 0.3, maxAnchors: 900` — current tuning from this session's spray-path work. Don't change these; they're the fallback-path tuning.
- `arborist/generate-salon.js` currently has `BASE_CARD_SIZE = 0.5`, `cardsPerAttachment: 35`, `spread: 0.7`, `yCompression: 0.7`, `inwardBias: 0.35` (this session's tuning). These live in the spray-path fallback after your changes.
- `arborist/state/_chassis-curation.json` has all 159 chassis marked rejected EXCEPT `american_linden_a` (approved, displayName "European Linden"). After your survey-deleaf run regenerates the library, the count will shift (new chassis from Robinia, possibly others). Update curation: mark new chassis rejected by default; preserve the existing approved entry.

## Acceptance criteria

1. **Survey-deleaf regen**: `node arborist/survey-deleaf.js` runs clean. New chassis library includes `american_linden_a` with both BARK and LEAF primitives (verify via `gltf-transform` inspect). Robinia bundle decomposes into `robinia_pseudoacacia_a_Tree_A.glb` through `_d_Tree_D.glb` (or similar — survey-deleaf naming).
2. **Linden Salon render**: hard-refresh Salon → pick `tilia_americana` species (displayed as "Tilia americana / American Linden") → see the European-Linden-sourced chassis with `heart` pack rendering at vendor placement quality. Six distinct heart-leaf images visible across canopy via per-card tile randomization.
3. **Pack swap is instant**: change leaf pack dropdown from `heart` → `palmate` → leaves re-render with palmate textures, same vendor placements.
4. **Leaves toggle**: unchecking the Leaves `show` checkbox renders the bare chassis with no leaves in the Workstage preview. Re-checking restores them. Persists through reload. Does NOT affect the published artifact (see Out of Scope).
5. **Robinia render**: pick one of the 4 Robinia chassis variants in Salon (under `robinia_pseudoacacia` species). Compound-leaf-shaped pack rendering at vendor's branch-tip placements.
6. **Non-quad mesh handling**: for the 2 non-quad Robinia trees (C and D), leaves render (don't crash); the per-card-tile randomization quietly skips. Surface what these meshes actually look like topologically.
7. **Bloom stability**: confirm via the workstage perf gauge that `programs` count stays at the expected shared-shader count (currently 11). No new programs introduced.
8. **Determinism**: same composition (chassis + bark + leaves) produces byte-identical GLB across re-runs. Sha1sum the salon-generate output twice; verify match.
9. **Fallback path intact**: an existing wood-only chassis (no LEAF primitive) still emits cards via `buildLeafGeometryFromAttachments` using `leafAttachmentTags`. Spot-check a LiDAR-derived chassis or a forced-empty-LeafSG case.
10. **Bake-look unchanged**: `node arborist/bake-look.js --look lafayette-square` runs clean without code changes. The bound vendor-leaf material's texture (now Salon's pack) gets absorbed by atlas-survey's sha1 dedup. The published artifact carries leaves regardless of `composition.leaves.show`.

## Approach guidance

- **Determinism**: use `mulberry32(hashString(chassis|bark.ref|leaves.pack))` — same hash key the spray path uses for its RNG. The per-card tile assignment must be deterministic so re-renders are byte-identical.
- **Quad detection**: see dedicated section above. Don't fingerprint winding; count unique indices in 6-index groups.
- **UV rewrite location**: positions/normals stay vendor; only TEXCOORD_0 gets rewritten. Allocate a fresh Float32Array of the same length, fill it per group-of-4-verts, swap via `accessor.setArray()`.
- **UV space**: pack-texture-local — see "UV write happens in pack-texture-local space" section above.
- **Material texture replacement**: don't dispose the leaf material itself — three.js / atlas-survey expects materials by name. Replace its `setBaseColorTexture()` binding with the Salon-loaded texture. Set the alphaMode/cutoff/etc. to match the spray-path material (above).
- **Vendor's leaf material may have other texture slots** (normal map, opacity, etc.) — dispose them at survey-deleaf time so the chassis GLB doesn't ship vendor textures. At generate-salon time, only the baseColorTexture gets rebound.
- **Edge case**: a vendor leaf primitive with no UVs. Detect, log, surface — should be very rare but possible. Fall back to spray-path for THAT chassis, not for all.
- **The 4-tree Robinia bundle**: survey-deleaf's bundle decomposition path already handles multi-tree-per-file. Confirm that path correctly preserves the LEAF primitive in each decomposed sub-chassis.
- **gltf-transform LEAF dispose pattern**: when disposing the vendor's leaf texture, walk via `material.getBaseColorTexture()?.dispose()` then `setBaseColorTexture(null)`. The material itself stays. Same for any other texture slots on the leaf material.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- Additional vendor materials/textures we're not handling
- Topology patterns the brief didn't anticipate (triangle strips, instanced meshes, etc.)
- Bloom or shader-program drift introduced by your changes
- Schema needs in `compositions.json` beyond `leaves.show`
- Anything Boz or Jacob would want to know that the brief missed

Surface it in your status update AND in the commit body. Don't quietly extend scope.

## Out of scope

- **`leaves.show=false` does NOT propagate to the baked artifact.** The toggle exists only to let the operator inspect the bare chassis structure in the Workstage preview. The published `public/trees/<species>/skeleton-*.glb` always carries leaves so `bake-look` + `atlas-survey` see them. Don't add show-gate logic to `generate-salon.js#main()` (the headless publish path) or to bake-look. If you find yourself plumbing show:false into the bake artifact, you've gone out of scope — back up and reconsider.
- **Bark architecture**: do not touch `treeAtlasMaterial.js`, `applyBarkUniforms`, gradient LUTs, or bark detail. The next brief is the bark luminance pivot (Brief 2.1) — leave bark alone here.
- **Phase F annual-cycle manifest**: that's a v1.6+ direction; you're just preserving the runway by keeping leaves uniform-swappable.
- **Procedural / LiDAR generators**: don't touch `generate-procedural.js` or `lidar-publish.js`. Their leaf paths are separate.
- **InstancedTrees.jsx / runtime**: no changes. The leaf material's binding lives in the per-chassis GLB; runtime just renders what's bound.
- **Performance optimization beyond LoD-passthrough**: don't add LOD branches or culling. publish-glb's existing simplify pass handles tri budget for lod1/lod2.

## Memory refs

Read at session start:
- `project_slab_carries_full_authored_product` — context for why the texture binding lands in the chassis GLB, not at runtime
- `project_authoring_is_live_production_is_static` — boundary discipline
- `feedback_baby_briefs_need_identity_framing` (you ARE the baby — identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- `feedback_atlas_subregion_uv_recovery` — the inverse direction of your UV-rewrite work; sets the architectural pattern
- `feedback_classifier_keyword_cross_check` — relevant if your survey-deleaf changes interact with atlas-survey.js classifier
- `feedback_spec_compression` — if you find a richer or simpler architectural shape than this brief, surface the translation before committing

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 5 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

Welcome to the Salon arc. Make leaves render at vendor placement quality, swap-able by pack, toggleable for chassis inspection. After this lands, the bark-luminance pivot (Brief 2.1) is next — that's the sophisticated bark manufacturer you've heard about.
