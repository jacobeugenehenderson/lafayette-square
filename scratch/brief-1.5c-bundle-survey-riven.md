# Brief 1.5c — Bundle-aware Re-de-leaf Survey

**Author:** Riven (the bundle-splitting baby)
**Brief:** Brief 1.5c from coordinator session 2026-05-21 (cold dispatch)
**Script:** `arborist/survey-deleaf.js` (Whittle's script, extended)
**Outputs:** decomposed chassis at `public/trees/_chassis/<species>_<letter>_<nodeName>.{glb,meta.json}`
**Preserved:** Whittle's `scratch/brief-0-vendor-tree-survey-whittle.md` is left as the historical Brief 0 snapshot (set `WRITE_WHITTLE_REPORT=1` to regenerate).

---

## 1. Bundle detection summary

- **Bundle GLBs detected:** 21
- **Decomposed chassis emitted (new):** 46
- **Bundle-debris items skipped (no WOOD in subtree):** 125
- **Bundle items skipped (ambiguous in subtree):** 11
- **Single-tree chassis emitted via Whittle path (byte-identical to Brief 0):** 195
- **Single-tree skipped-ambiguous:** 81; **skipped-no-wood:** 51; **errored:** 0

**Bundle-detection heuristic:** a GLB is a bundle if it carries more than one geometry-bearing root node — counting both direct scene children with geometry in their subtree AND orphan nodes (mesh-bearing nodes that aren't a child of any other node, the flat-scene pattern seen in `candicands/`).

## 2. Brief's speculated bundles vs reality

| Speculated species | Bundle? | Reality |
|---|---|---|
| `garden_mix` | no | single-tree per file (10 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `stylized_trees_1` | no | single-tree per file (5 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `stylized_trees_2` | no | single-tree per file (21 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `candicands` | **YES** | 4 bundle GLB(s) detected; decomposed |
| `tree_variation` | no | single-tree per file (8 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `generic_tree_1` | no | single-tree per file (1 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `generic_tree_2` | no | single-tree per file (1 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `generic_tree_3` | no | single-tree per file (1 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `generic_tree_4` | no | single-tree per file (2 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `generic_bark_tree` | no | single-tree per file (2 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |
| `generic_leaf_tree` | no | single-tree per file (2 variant(s)); each file carries one mesh node — vendor pre-split the bundle into per-tree GLBs |

**Finding:** of the ~11 speculated bundle sources, only `candicands` actually loads as a multi-root bundle. The others (`garden_mix`, `stylized_trees_*`, `tree_variation`, `generic_*`) are flat-pre-split — each `skeleton-N-lod0.glb` carries one inner mesh node with the bundle-position offset baked into its translation. Those land cleanly in the Whittle (single-tree) path; their per-tree positional offset persists in the chassis but doesn't fragment the chassis library.

## 3. Per-bundle decomposition table

| Source | Top-level roots | Decomposed chassis | Bundle-debris (skipped no-WOOD) | Ambiguous (skipped) |
|---|---:|---|---|---|
| candicands/skeleton-1-lod0.glb | 9 | `candicands_a_bark_122`, `candicands_a_bark_133`, `candicands_a_bark_144` | `1_leaf22` (W0/L1/A0); `1_leaf33` (W0/L1/A0); `flower_133` (W0/L1/A0); `1_leaf44` (W0/L1/A0); `flower_144` (W0/L1/A0) | `flower_122` |
| candicands/skeleton-2-lod0.glb | 9 | `candicands_b_bark_111`, `candicands_b_bark_133`, `candicands_b_bark_144` | `1_leaf11` (W0/L1/A0); `flower_111` (W0/L1/A0); `1_leaf33` (W0/L1/A0); `flower_133` (W0/L1/A0); `1_leaf44` (W0/L1/A0); `flower_144` (W0/L1/A0) | — |
| candicands/skeleton-3-lod0.glb | 9 | `candicands_c_bark_111`, `candicands_c_bark_122`, `candicands_c_bark_144` | `1_leaf11` (W0/L1/A0); `flower_111` (W0/L1/A0); `1_leaf22` (W0/L1/A0); `1_leaf44` (W0/L1/A0); `flower_144` (W0/L1/A0) | `flower_122` |
| candicands/skeleton-4-lod0.glb | 9 | `candicands_d_bark_111`, `candicands_d_bark_122`, `candicands_d_bark_133` | `1_leaf11` (W0/L1/A0); `flower_111` (W0/L1/A0); `1_leaf22` (W0/L1/A0); `1_leaf33` (W0/L1/A0); `flower_133` (W0/L1/A0) | `flower_122` |
| gleditsia_triacanthos/skeleton-1-lod0.glb | 10 | `honey_locust_a_bark2`, `honey_locust_a_stem2`, `honey_locust_a_bark3`, `honey_locust_a_stem3` | `fuzz2` (W0/L1/A0); `leaff2` (W0/L1/A0); `fuzz3` (W0/L1/A0); `leaff3` (W0/L1/A0) | `seed2`; `seed3` |
| gleditsia_triacanthos/skeleton-2-lod0.glb | 10 | `honey_locust_b_bark1`, `honey_locust_b_stem1`, `honey_locust_b_bark3`, `honey_locust_b_stem3` | `fuzz1` (W0/L1/A0); `leaff1` (W0/L1/A0); `fuzz3` (W0/L1/A0); `leaff3` (W0/L1/A0) | `seed1`; `seed3` |
| gleditsia_triacanthos/skeleton-3-lod0.glb | 10 | `honey_locust_c_bark1`, `honey_locust_c_stem1`, `honey_locust_c_bark2`, `honey_locust_c_stem2` | `fuzz1` (W0/L1/A0); `leaff1` (W0/L1/A0); `fuzz2` (W0/L1/A0); `leaff2` (W0/L1/A0) | `seed1`; `seed2` |
| platanus_acerifolia/skeleton-13-lod0.glb | 2 | `london_plane_m_whitebirchbark_g2` | — | `PT_G2` |
| platanus_acerifolia/skeleton-14-lod0.glb | 2 | `london_plane_n_whitebirchbark_f2` | — | `PT_F2` |
| populus_alba_fall/skeleton-1-lod0.glb | 12 | `poplar_fall_a_bark_populier_fall_02_001` | `Bark_Populier_Green_02.001` (W0/L0/A0); `L_P_Populier_Green_02.001` (W0/L1/A0); `Bark_Populier_Green_02.002` (W0/L0/A0); `L_P_Populier_Green_02.002` (W0/L1/A0); `Bark_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02.001` (W0/L1/A0); `Bark_Populier_Fall_02.002` (W0/L0/A0); `L_P_Populier_Fall_02.002` (W0/L1/A0); `Bark_Populier_Fall_02.003` (W0/L0/A0); `L_P_Populier_Fall_02.003` (W0/L0/A0) | — |
| populus_alba_fall/skeleton-2-lod0.glb | 12 | `poplar_fall_b_bark_populier_fall_02_002` | `Bark_Populier_Green_02` (W0/L0/A0); `L_P_Populier_Green_02` (W0/L1/A0); `Bark_Populier_Green_02.002` (W0/L0/A0); `L_P_Populier_Green_02.002` (W0/L1/A0); `Bark_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02` (W0/L0/A0); `Bark_Populier_Fall_02.001` (W0/L0/A0); `L_P_Populier_Fall_02.001` (W0/L1/A0); `L_P_Populier_Fall_02.002` (W0/L1/A0); `Bark_Populier_Fall_02.003` (W0/L0/A0); `L_P_Populier_Fall_02.003` (W0/L0/A0) | — |
| populus_alba_fall/skeleton-3-lod0.glb | 12 | — | `Bark_Populier_Green_02` (W0/L0/A0); `L_P_Populier_Green_02` (W0/L1/A0); `Bark_Populier_Green_02.001` (W0/L0/A0); `L_P_Populier_Green_02.001` (W0/L1/A0); `Bark_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02` (W0/L0/A0); `Bark_Populier_Fall_02.001` (W0/L0/A0); `L_P_Populier_Fall_02.001` (W0/L1/A0); `Bark_Populier_Fall_02.002` (W0/L0/A0); `L_P_Populier_Fall_02.002` (W0/L1/A0); `Bark_Populier_Fall_02.003` (W0/L0/A0); `L_P_Populier_Fall_02.003` (W0/L0/A0) | — |
| populus_alba_fall/skeleton-4-lod0.glb | 12 | — | `Bark_Populier_Green_02` (W0/L0/A0); `L_P_Populier_Green_02` (W0/L1/A0); `Bark_Populier_Green_02.001` (W0/L0/A0); `L_P_Populier_Green_02.001` (W0/L1/A0); `Bark_Populier_Green_02.002` (W0/L0/A0); `L_P_Populier_Green_02.002` (W0/L1/A0); `Bark_Populier_Fall_02.001` (W0/L0/A0); `L_P_Populier_Fall_02.001` (W0/L1/A0); `Bark_Populier_Fall_02.002` (W0/L0/A0); `L_P_Populier_Fall_02.002` (W0/L1/A0); `Bark_Populier_Fall_02.003` (W0/L0/A0); `L_P_Populier_Fall_02.003` (W0/L1/A0) | — |
| populus_alba_fall/skeleton-5-lod0.glb | 12 | `poplar_fall_e_bark_populier_green_02` | `L_P_Populier_Green_02` (W0/L1/A0); `Bark_Populier_Green_02.001` (W0/L0/A0); `L_P_Populier_Green_02.001` (W0/L1/A0); `Bark_Populier_Green_02.002` (W0/L0/A0); `L_P_Populier_Green_02.002` (W0/L1/A0); `Bark_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02` (W0/L0/A0); `Bark_Populier_Fall_02.002` (W0/L0/A0); `L_P_Populier_Fall_02.002` (W0/L1/A0); `Bark_Populier_Fall_02.003` (W0/L0/A0); `L_P_Populier_Fall_02.003` (W0/L0/A0) | — |
| populus_alba_fall/skeleton-6-lod0.glb | 12 | `poplar_fall_f_bark_populier_green_02_001` | `Bark_Populier_Green_02` (W0/L0/A0); `L_P_Populier_Green_02` (W0/L1/A0); `L_P_Populier_Green_02.001` (W0/L1/A0); `Bark_Populier_Green_02.002` (W0/L0/A0); `L_P_Populier_Green_02.002` (W0/L1/A0); `Bark_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02` (W0/L0/A0); `Bark_Populier_Fall_02.001` (W0/L0/A0); `L_P_Populier_Fall_02.001` (W0/L1/A0); `Bark_Populier_Fall_02.003` (W0/L0/A0); `L_P_Populier_Fall_02.003` (W0/L0/A0) | — |
| populus_alba_fall/skeleton-7-lod0.glb | 12 | — | `Bark_Populier_Green_02` (W0/L0/A0); `L_P_Populier_Green_02` (W0/L1/A0); `Bark_Populier_Green_02.001` (W0/L0/A0); `L_P_Populier_Green_02.001` (W0/L1/A0); `Bark_Populier_Green_02.002` (W0/L0/A0); `L_P_Populier_Green_02.002` (W0/L1/A0); `Bark_Populier_Fall_02` (W0/L0/A0); `L_P_Populier_Fall_02` (W0/L1/A0); `Bark_Populier_Fall_02.001` (W0/L0/A0); `L_P_Populier_Fall_02.001` (W0/L1/A0); `Bark_Populier_Fall_02.002` (W0/L0/A0); `L_P_Populier_Fall_02.002` (W0/L1/A0) | — |
| populus_canescens/skeleton-1-lod0.glb | 6 | `gray_poplar_a_trunk22`, `gray_poplar_a_trunk33`, `gray_poplar_a_trunk44` | `leaf22` (W0/L1/A0); `leaf33` (W0/L1/A0); `leaf44` (W0/L1/A0) | — |
| populus_canescens/skeleton-2-lod0.glb | 6 | `gray_poplar_b_trunk11`, `gray_poplar_b_trunk33`, `gray_poplar_b_trunk44` | `leaf11` (W0/L1/A0); `leaf33` (W0/L1/A0); `leaf44` (W0/L1/A0) | — |
| populus_canescens/skeleton-3-lod0.glb | 6 | `gray_poplar_c_trunk11`, `gray_poplar_c_trunk22`, `gray_poplar_c_trunk44` | `leaf11` (W0/L1/A0); `leaf22` (W0/L1/A0); `leaf44` (W0/L1/A0) | — |
| populus_canescens/skeleton-4-lod0.glb | 6 | `gray_poplar_d_trunk11`, `gray_poplar_d_trunk22`, `gray_poplar_d_trunk33` | `leaf11` (W0/L1/A0); `leaf22` (W0/L1/A0); `leaf33` (W0/L1/A0) | — |
| robinia_pseudoacacia/skeleton-1-lod0.glb | 4 | `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_d`, `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_a`, `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_b`, `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_c` | — | — |

## 4. Coverage delta — morphology distribution

| Morphology | Whittle (single-tree) | After Riven (incl. decomposed) | Delta |
|---|---:|---:|---:|
| broadleaf | 116 | 158 | +42 |
| conifer | 33 | 33 | 0 |
| ornamental | 0 | 0 | 0 |
| columnar | 15 | 15 | 0 |
| weeping | 13 | 13 | 0 |
| unknown | 18 | 22 | +4 |

**Ornamental coverage:** unchanged. The decomposed bundles inherit their source species' morphology (`candicands` → whatever index.json declares), which may not be ornamental. Operator may want to override the morphology field on the decomposed chassis' meta.json post-Riven.

## 5. Roster re-evaluation — re-checking Whittle's skipped-for-removal list

**Species rescued by bundle decomposition** (had zero Whittle chassis, now have ≥1 bundle-decomposed chassis):

- `gleditsia_triacanthos` ("Honey Locust") — 12 bundle-decomposed chassis
- `populus_canescens` ("Gray Poplar") — 12 bundle-decomposed chassis

**Species still recommended for operator review** (no clean chassis even after bundle decomposition):

- `alaskan_cedar_2` ("Alaskan Cedar (variant)") — no clean output (mix of ambiguous / no-wood / errored)
- `cedar_generic` ("Cedar") — no clean output (mix of ambiguous / no-wood / errored)
- `conifer_generic` ("Conifer Forest") — no clean output (mix of ambiguous / no-wood / errored)
- `conifer_generic_2` ("Conifer Forest 2") — no clean output (mix of ambiguous / no-wood / errored)
- `conifer_generic_3` ("Conifer Forest 3") — no clean output (mix of ambiguous / no-wood / errored)
- `elderberry` ("Elderberry") — still no usable chassis (all variants no-wood or bundle-debris)
- `generic_bark_tree` ("Generic Bark Tree") — no clean output (mix of ambiguous / no-wood / errored)
- `generic_tree_4` ("Generic Tree 4") — no clean output (mix of ambiguous / no-wood / errored)
- `magnolia_sp` ("Magnolia") — no clean output (mix of ambiguous / no-wood / errored)
- `picea_abies` ("Norway Spruce") — no clean output (mix of ambiguous / no-wood / errored)
- `pinus_sylvestris` ("Scots Pine") — no clean output (mix of ambiguous / no-wood / errored)
- `pseudotsuga_menziesii` ("Douglas Fir") — no clean output (mix of ambiguous / no-wood / errored)
- `pseudotsuga_oregon` ("Oregon Pine / Douglas Fir") — no clean output (mix of ambiguous / no-wood / errored)
- `spruce_corona` ("Spruce (Corona)") — still no usable chassis (all variants no-wood or bundle-debris)
- `stylized_trees_2` ("Stylized Trees 2") — no clean output (mix of ambiguous / no-wood / errored)
- `tree_brown_bark` ("Tree Brown Bark") — no clean output (mix of ambiguous / no-wood / errored)
- `tree_variation` ("Tree (variation)") — still no usable chassis (all variants no-wood or bundle-debris)
- `tree_with_wind` ("Tree with Wind") — no clean output (mix of ambiguous / no-wood / errored)
- `ulmus_americana` ("American Elm") — still no usable chassis (all variants no-wood or bundle-debris)

## 6. Brief 1.5b curation-file cross-check

`_chassis-curation.json` is present. Checking that every chassis name in the curation file is still emitted by this re-run...

All curation-referenced chassis names are still emitted. ✓

## 7. Operator-action list — bundle-debris worth manual review

| Source GLB | Node name | Primitive count | Material names |
|---|---|---:|---|
| candicands/skeleton-1-lod0.glb | `1_leaf22` | 1 | 1_leaf22_Mat |
| candicands/skeleton-1-lod0.glb | `1_leaf33` | 1 | 1_leaf33_Mat |
| candicands/skeleton-1-lod0.glb | `flower_133` | 1 | flower_122_Mat |
| candicands/skeleton-1-lod0.glb | `1_leaf44` | 1 | 1_leaf44_Mat |
| candicands/skeleton-1-lod0.glb | `flower_144` | 1 | flower_122_Mat |
| candicands/skeleton-2-lod0.glb | `1_leaf11` | 1 | 1_leaf11_Mat |
| candicands/skeleton-2-lod0.glb | `flower_111` | 1 | flower_111_Mat |
| candicands/skeleton-2-lod0.glb | `1_leaf33` | 1 | 1_leaf33_Mat |
| candicands/skeleton-2-lod0.glb | `flower_133` | 1 | flower_111_Mat |
| candicands/skeleton-2-lod0.glb | `1_leaf44` | 1 | 1_leaf44_Mat |
| candicands/skeleton-2-lod0.glb | `flower_144` | 1 | flower_111_Mat |
| candicands/skeleton-3-lod0.glb | `1_leaf11` | 1 | 1_leaf11_Mat |
| candicands/skeleton-3-lod0.glb | `flower_111` | 1 | flower_111_Mat |
| candicands/skeleton-3-lod0.glb | `1_leaf22` | 1 | 1_leaf11_Mat |
| candicands/skeleton-3-lod0.glb | `1_leaf44` | 1 | 1_leaf44_Mat |
| candicands/skeleton-3-lod0.glb | `flower_144` | 1 | flower_111_Mat |
| candicands/skeleton-4-lod0.glb | `1_leaf11` | 1 | 1_leaf11_Mat |
| candicands/skeleton-4-lod0.glb | `flower_111` | 1 | flower_111_Mat |
| candicands/skeleton-4-lod0.glb | `1_leaf22` | 1 | 1_leaf11_Mat |
| candicands/skeleton-4-lod0.glb | `1_leaf33` | 1 | 1_leaf33_Mat |
| candicands/skeleton-4-lod0.glb | `flower_133` | 1 | flower_111_Mat |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `fuzz2` | 1 | fuzz2_Mat |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `leaff2` | 1 | leaff2_Mat |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `fuzz3` | 1 | fuzz2_Mat |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `leaff3` | 1 | leaff3_Mat |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `fuzz1` | 1 | fuzz1_Mat |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `leaff1` | 1 | leaff1_Mat |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `fuzz3` | 1 | fuzz1_Mat |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `leaff3` | 1 | leaff3_Mat |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `fuzz1` | 1 | fuzz1_Mat |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `leaff1` | 1 | leaff1_Mat |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `fuzz2` | 1 | fuzz1_Mat |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `leaff2` | 1 | leaff2_Mat |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Green_02.001` | 0 | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Green_02.001` | 1 | L_P_Populier_Green_02_Mat.001 |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Green_02.002` | 0 | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Green_02.002` | 1 | L_P_Populier_Green_02_Mat.001 |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02.001` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02.002` | 0 | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02.002` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Green_02` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Green_02` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Green_02.002` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Green_02.002` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02.001` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02.001` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02.002` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Green_02` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Green_02` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Green_02.001` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Green_02.001` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02.001` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02.001` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02.002` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02.002` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Green_02` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Green_02` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Green_02.001` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Green_02.001` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Green_02.002` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Green_02.002` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Fall_02.001` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Fall_02.001` | 1 | L_P_Populier_Fall_02_Mat.001 |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Fall_02.002` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Fall_02.002` | 1 | L_P_Populier_Fall_02_Mat.001 |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Fall_02.003` | 1 | L_P_Populier_Fall_02_Mat.001 |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Green_02` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Green_02.001` | 0 | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Green_02.001` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Green_02.002` | 0 | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Green_02.002` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Fall_02.002` | 0 | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Fall_02.002` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Green_02` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Green_02` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Green_02.001` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Green_02.002` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Green_02.002` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Fall_02.001` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Fall_02.001` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Fall_02.003` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Green_02` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Green_02` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Green_02.001` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Green_02.001` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Green_02.002` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Green_02.002` | 1 | L_P_Populier_Green_02_Mat |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Fall_02` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Fall_02` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Fall_02.001` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Fall_02.001` | 1 | L_P_Populier_Fall_02_Mat |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Fall_02.002` | 0 | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Fall_02.002` | 1 | L_P_Populier_Fall_02_Mat |
| populus_canescens/skeleton-1-lod0.glb | `leaf22` | 1 | leaf22_Mat |
| populus_canescens/skeleton-1-lod0.glb | `leaf33` | 1 | leaf22_Mat |
| populus_canescens/skeleton-1-lod0.glb | `leaf44` | 1 | leaf22_Mat |
| populus_canescens/skeleton-2-lod0.glb | `leaf11` | 1 | leaf11_Mat |
| populus_canescens/skeleton-2-lod0.glb | `leaf33` | 1 | leaf11_Mat |
| populus_canescens/skeleton-2-lod0.glb | `leaf44` | 1 | leaf11_Mat |
| populus_canescens/skeleton-3-lod0.glb | `leaf11` | 1 | leaf11_Mat |
| populus_canescens/skeleton-3-lod0.glb | `leaf22` | 1 | leaf11_Mat |
| populus_canescens/skeleton-3-lod0.glb | `leaf44` | 1 | leaf11_Mat |
| populus_canescens/skeleton-4-lod0.glb | `leaf11` | 1 | leaf11_Mat |
| populus_canescens/skeleton-4-lod0.glb | `leaf22` | 1 | leaf11_Mat |
| populus_canescens/skeleton-4-lod0.glb | `leaf33` | 1 | leaf11_Mat |

**For Cartograph team:** bundle-debris with material names containing `leaf`, `flower`, or alpha-mode MASK are leaf-card / flower-card primitives that the WOOD-only chassis discipline correctly skips. Items with names like `rock_*`, `planter_*`, `fence_*` would be candidates for kit-level prop libraries — none observed in current vendor stock (debris is all leaf+flower cards from `candicands`).

## 8. Surface items (per `feedback_baby_must_surface_scope_drift`)

- **Brief framing mismatch:** the brief listed ~11 species as bundle suspects. Only `candicands` actually classifies as a bundle under the brief's "multiple top-level geometry roots" heuristic. The other suspects are flat-pre-split per file (one mesh node per GLB, with a positional translation baked in). This was a knowable-from-inspection structural fact — Whittle's report appendix already shows e.g. `garden_mix/skeleton-N` cleanly de-leafing as single-tree chassis. Recommend: closing the brief with the bundle-detection heuristic's actual coverage rather than expanding it heuristically to catch the speculated set.

- **The "leaning weirdly" issue isn't bundle-specific.** Garden_mix-style chassis inherit a positional translation in their single inner mesh node (e.g. `TREE_00` at T=[3.9, 0, -3.8]). That offset is the visible cause of decentered chassis. Brief 1.5c does NOT touch those (criterion #2 requires byte-identity for Whittle's 141), so the lean persists for non-bundle chassis. A follow-up brief (1.5d?) could opt-in recenter all chassis — but that would invalidate 1.5b's curation file via byte changes. Surface for operator decision: accept lean for non-bundle chassis, or break byte-identity in a future pass to fix it?

- **Transform-baking implementation:** used a hand-rolled bake (apply 4×4 to POSITION, upper-3×3 to NORMAL with re-normalize, recenter to bbox-XZ-center + bbox-Y-min=0, reset root's TRS to identity). gltf-transform's `@gltf-transform/functions` package ships a `transformPrimitive(prim, matrix)` helper that does the same job, but I held to the existing dep set (`@gltf-transform/core` + `@gltf-transform/extensions` only — no `functions` import in this script today). If the operator wants to switch later, it's a 5-line swap.

- **Bundle internal structure (`candicands`):** each variant carries 9 orphan nodes encoding 3 trees: triplets of `1_leafNN` + `Bark_1NN` + `flower_1NN`. The leaf and flower nodes are MASK-alpha → LEAF-classified → skipped (bundle-debris); the Bark nodes are OPAQUE-with-normal-map → WOOD → emitted as chassis. Naming convention: `candicands_<a-d>_bark_111.glb` etc. Per acceptance criterion #4, decomposed chassis are recentered (bbox-XZ-center=0, bbox-Y-min=0) and the root's local translation (some have `T=[0,0,-90.2]`) is baked but then cancelled by the recenter — net effect: trunk along Y-up, base near origin, as required.

- **Whittle's existing chassis from now-detected-bundles are preserved on disk** (`candicands_b.glb` from Brief 0 was emitted by treating the whole 9-node bundle as one tree). Per criterion #5 (additive only), Riven does NOT remove or rename it; it now coexists with the decomposed siblings. The whole-bundle chassis is essentially dead weight (it bakes 3 trees into one mesh at world-scale) and Brief 1.5b's curation surface may be used to suppress it. Surfaced explicitly here so 1.5b knows: 4 pre-existing `candicands_*.glb` filenames may want operator quarantining.

  Decomposed candicands chassis emitted this run: **12**. Pre-Riven Whittle chassis touching candicands: see `public/trees/_chassis/candicands_*.glb`.

- **`species-map.json` morphology lookup for decomposed chassis:** decomposed chassis inherit `category` from the source species' `index.json` row. `candicands` has whatever category index.json declares (`broadleaf` per the Whittle report's per-species table). If those decomposed-chassis would more accurately classify as `ornamental` (flowering form), the operator should override `meta.json#morphology` per-chassis. Brief 1.5b's curation surface is the natural place to do this, not Riven.

- **Transform-baking edge cases observed:** `candicands` has variants with `T=[0,0,-90.2]` (skeleton-2, skeleton-3) — purely translational, cleanly cancelled by recenter. No shear or non-uniform scale observed in the bundle nodes; if they appeared, the upper-3×3 normal transform would degrade (would need inverse-transpose). Flagged in code comments adjacent to `bakeMatrixIntoPrim`.

## 9. Appendix — full bundle-decomposition results

| Source | Node | Status | WOOD / LEAF / AMB | Chassis | heightRange |
|---|---|---|---|---|---|
| candicands/skeleton-1-lod0.glb | `1_leaf22` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-1-lod0.glb | `Bark_122` | bundle-decomposed | 1 / 0 / 0 | `candicands_a_bark_122` | [0, 110.1614] |
| candicands/skeleton-1-lod0.glb | `flower_122` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| candicands/skeleton-1-lod0.glb | `1_leaf33` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-1-lod0.glb | `Bark_133` | bundle-decomposed | 1 / 0 / 0 | `candicands_a_bark_133` | [0, 86.6504] |
| candicands/skeleton-1-lod0.glb | `flower_133` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-1-lod0.glb | `1_leaf44` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-1-lod0.glb | `Bark_144` | bundle-decomposed | 1 / 0 / 0 | `candicands_a_bark_144` | [0, 55.5631] |
| candicands/skeleton-1-lod0.glb | `flower_144` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-2-lod0.glb | `1_leaf11` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-2-lod0.glb | `Bark_111` | bundle-decomposed | 1 / 0 / 0 | `candicands_b_bark_111` | [0, 110.1614] |
| candicands/skeleton-2-lod0.glb | `flower_111` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-2-lod0.glb | `1_leaf33` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-2-lod0.glb | `Bark_133` | bundle-decomposed | 1 / 0 / 0 | `candicands_b_bark_133` | [0, 86.6504] |
| candicands/skeleton-2-lod0.glb | `flower_133` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-2-lod0.glb | `1_leaf44` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-2-lod0.glb | `Bark_144` | bundle-decomposed | 1 / 0 / 0 | `candicands_b_bark_144` | [0, 55.5631] |
| candicands/skeleton-2-lod0.glb | `flower_144` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-3-lod0.glb | `1_leaf11` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-3-lod0.glb | `Bark_111` | bundle-decomposed | 1 / 0 / 0 | `candicands_c_bark_111` | [0, 110.1614] |
| candicands/skeleton-3-lod0.glb | `flower_111` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-3-lod0.glb | `1_leaf22` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-3-lod0.glb | `Bark_122` | bundle-decomposed | 1 / 0 / 0 | `candicands_c_bark_122` | [0, 110.1614] |
| candicands/skeleton-3-lod0.glb | `flower_122` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| candicands/skeleton-3-lod0.glb | `1_leaf44` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-3-lod0.glb | `Bark_144` | bundle-decomposed | 1 / 0 / 0 | `candicands_c_bark_144` | [0, 55.5631] |
| candicands/skeleton-3-lod0.glb | `flower_144` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-4-lod0.glb | `1_leaf11` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-4-lod0.glb | `Bark_111` | bundle-decomposed | 1 / 0 / 0 | `candicands_d_bark_111` | [0, 110.1614] |
| candicands/skeleton-4-lod0.glb | `flower_111` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-4-lod0.glb | `1_leaf22` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-4-lod0.glb | `Bark_122` | bundle-decomposed | 1 / 0 / 0 | `candicands_d_bark_122` | [0, 110.1614] |
| candicands/skeleton-4-lod0.glb | `flower_122` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| candicands/skeleton-4-lod0.glb | `1_leaf33` | bundle-debris | 0 / 1 / 0 | — | — |
| candicands/skeleton-4-lod0.glb | `Bark_133` | bundle-decomposed | 1 / 0 / 0 | `candicands_d_bark_133` | [0, 86.6504] |
| candicands/skeleton-4-lod0.glb | `flower_133` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `bark2` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_a_bark2` | [0, 1250.9213] |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `fuzz2` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `leaff2` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `seed2` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `stem2` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_a_stem2` | [0, 1311.5845] |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `bark3` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_a_bark3` | [0, 1624.6931] |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `fuzz3` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `leaff3` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `seed3` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| gleditsia_triacanthos/skeleton-1-lod0.glb | `stem3` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_a_stem3` | [0, 1328.701] |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `bark1` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_b_bark1` | [0, 1709.0269] |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `fuzz1` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `leaff1` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `seed1` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `stem1` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_b_stem1` | [0, 1628.224] |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `bark3` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_b_bark3` | [0, 1624.6931] |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `fuzz3` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `leaff3` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `seed3` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| gleditsia_triacanthos/skeleton-2-lod0.glb | `stem3` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_b_stem3` | [0, 1328.701] |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `bark1` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_c_bark1` | [0, 1709.0269] |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `fuzz1` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `leaff1` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `seed1` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `stem1` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_c_stem1` | [0, 1628.224] |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `bark2` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_c_bark2` | [0, 1250.9213] |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `fuzz2` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `leaff2` | bundle-debris | 0 / 1 / 0 | — | — |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `seed2` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| gleditsia_triacanthos/skeleton-3-lod0.glb | `stem2` | bundle-decomposed | 1 / 0 / 0 | `honey_locust_c_stem2` | [0, 1311.5845] |
| platanus_acerifolia/skeleton-13-lod0.glb | `PT_G2` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| platanus_acerifolia/skeleton-13-lod0.glb | `WhiteBirchBark_G2` | bundle-decomposed | 1 / 0 / 0 | `london_plane_m_whitebirchbark_g2` | [0, 16.8575] |
| platanus_acerifolia/skeleton-14-lod0.glb | `PT_F2` | bundle-skipped-ambiguous | 0 / 0 / 1 | — | — |
| platanus_acerifolia/skeleton-14-lod0.glb | `WhiteBirchBark_F2` | bundle-decomposed | 1 / 0 / 0 | `london_plane_n_whitebirchbark_f2` | [0, 16.8575] |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Green_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Green_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Green_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Green_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02.001` | bundle-decomposed | 1 / 0 / 0 | `poplar_fall_a_bark_populier_fall_02_001` | [0, 1250.7374] |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `Bark_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-1-lod0.glb | `L_P_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Green_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Green_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Green_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Green_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02.002` | bundle-decomposed | 1 / 0 / 0 | `poplar_fall_b_bark_populier_fall_02_002` | [0, 1379.7125] |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `Bark_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-2-lod0.glb | `L_P_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Green_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Green_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Green_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Green_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `Bark_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-3-lod0.glb | `L_P_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Green_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Green_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Green_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Green_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Green_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Green_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Fall_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Fall_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Fall_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Fall_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `Bark_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-4-lod0.glb | `L_P_Populier_Fall_02.003` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Green_02` | bundle-decomposed | 1 / 0 / 0 | `poplar_fall_e_bark_populier_green_02` | [0, 1250.7374] |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Green_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Green_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Green_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Green_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Green_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Fall_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Fall_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `Bark_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-5-lod0.glb | `L_P_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Green_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Green_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Green_02.001` | bundle-decomposed | 1 / 0 / 0 | `poplar_fall_f_bark_populier_green_02_001` | [0, 1379.7125] |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Green_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Green_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Green_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Fall_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Fall_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `Bark_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-6-lod0.glb | `L_P_Populier_Fall_02.003` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Green_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Green_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Green_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Green_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Green_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Green_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Fall_02` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Fall_02` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Fall_02.001` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Fall_02.001` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `Bark_Populier_Fall_02.002` | bundle-debris | 0 / 0 / 0 | — | — |
| populus_alba_fall/skeleton-7-lod0.glb | `L_P_Populier_Fall_02.002` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-1-lod0.glb | `leaf22` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-1-lod0.glb | `Trunk22` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_a_trunk22` | [0, 642.6094] |
| populus_canescens/skeleton-1-lod0.glb | `leaf33` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-1-lod0.glb | `Trunk33` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_a_trunk33` | [0, 982.7008] |
| populus_canescens/skeleton-1-lod0.glb | `leaf44` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-1-lod0.glb | `Trunk44` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_a_trunk44` | [0, 982.5243] |
| populus_canescens/skeleton-2-lod0.glb | `leaf11` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-2-lod0.glb | `Trunk11` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_b_trunk11` | [0, 683.6552] |
| populus_canescens/skeleton-2-lod0.glb | `leaf33` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-2-lod0.glb | `Trunk33` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_b_trunk33` | [0, 982.7008] |
| populus_canescens/skeleton-2-lod0.glb | `leaf44` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-2-lod0.glb | `Trunk44` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_b_trunk44` | [0, 982.5243] |
| populus_canescens/skeleton-3-lod0.glb | `leaf11` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-3-lod0.glb | `Trunk11` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_c_trunk11` | [0, 683.6552] |
| populus_canescens/skeleton-3-lod0.glb | `leaf22` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-3-lod0.glb | `Trunk22` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_c_trunk22` | [0, 642.6094] |
| populus_canescens/skeleton-3-lod0.glb | `leaf44` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-3-lod0.glb | `Trunk44` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_c_trunk44` | [0, 982.5243] |
| populus_canescens/skeleton-4-lod0.glb | `leaf11` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-4-lod0.glb | `Trunk11` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_d_trunk11` | [0, 683.6552] |
| populus_canescens/skeleton-4-lod0.glb | `leaf22` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-4-lod0.glb | `Trunk22` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_d_trunk22` | [0, 642.6094] |
| populus_canescens/skeleton-4-lod0.glb | `leaf33` | bundle-debris | 0 / 1 / 0 | — | — |
| populus_canescens/skeleton-4-lod0.glb | `Trunk33` | bundle-decomposed | 1 / 0 / 0 | `gray_poplar_d_trunk33` | [0, 982.7008] |
| robinia_pseudoacacia/skeleton-1-lod0.glb | `Tree_Robinia-pseudoacacia_D` | bundle-decomposed | 1 / 1 / 0 | `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_d` | [0, 9.9252] |
| robinia_pseudoacacia/skeleton-1-lod0.glb | `Tree_Robinia-pseudoacacia_A` | bundle-decomposed | 1 / 1 / 0 | `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_a` | [0, 6.5879] |
| robinia_pseudoacacia/skeleton-1-lod0.glb | `Tree_Robinia-pseudoacacia_B` | bundle-decomposed | 1 / 1 / 0 | `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_b` | [0, 8.509] |
| robinia_pseudoacacia/skeleton-1-lod0.glb | `Tree_Robinia-pseudoacacia_C` | bundle-decomposed | 1 / 1 / 0 | `robinia_pseudoacacia_a_tree_robinia_pseudoacacia_c` | [0, 6.6293] |
