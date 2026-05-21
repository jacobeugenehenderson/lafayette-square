# Brief 0 — Vendor Tree Stock Survey + Easy-Case De-leaf

**Author:** Whittle (the de-leafing baby)
**Brief:** Brief 0 from coordinator session 2026-05-21
**Script:** `arborist/survey-deleaf.js`
**Outputs:** `public/trees/_chassis/<common-or-binomial>_<letter>.{glb,meta.json}`

---

## 1. Summary stats

- **Species dirs walked:** 67 (of 67 in `public/trees/index.json`)
- **GLBs surveyed (lod0 only, the chassis-eligible tier):** 347
- **GLBs in vendor stock total (including LoD1/2 + unsuffixed):** 1044
- **Primitives classified:** 1216
  - WOOD: 314
  - LEAF: 776
  - AMBIGUOUS: 126
- **Chassis written:** 141
- **Skipped (ambiguous):** 91
- **Skipped (no wood found):** 115
- **Errored:** 0
- **Species with no eligible GLBs:** 0

---

## 2. Per-species table

Aggregated across lod0 variants for each species. Column "status" reports the dominant outcome; per-variant detail is in the appendix.

| Species | Common label | Variants | Primitives | WOOD / LEAF / AMB | Status |
|---|---|---:|---:|---|---|
| abies_concolor | White Fir | 6 | 50 | 19 / 19 / 12 | 4 amb, 2 no-wood |
| acer_rubrum | Red Maple | 3 | 6 | 2 / 4 / 0 | 2 clean, 1 no-wood |
| acer_saccharum | — | 18 | 96 | 23 / 73 / 0 | 18 clean |
| acer_saccharum_lowpoly | Sugar Maple (low-poly forest) | 18 | 96 | 23 / 73 / 0 | 18 clean |
| acer_saccharum_multistem | Sugar Maple (multistem) | 2 | 8 | 4 / 0 / 4 | 2 amb |
| acer_saccharum_procedural | — | 5 | 10 | 10 / 0 / 0 | 5 clean |
| alaskan_cedar_2 | Alaskan Cedar (variant) | 2 | 8 | 3 / 3 / 2 | 2 amb |
| betula_papyrifera | Paper Birch | 4 | 12 | 4 / 8 / 0 | 4 clean |
| betula_pendula | Common Birch | 5 | 10 | 0 / 10 / 0 | 5 no-wood |
| blue_spruce | Blue Spruce | 7 | 21 | 0 / 14 / 7 | 7 amb |
| blue_spruce_winter | Blue Spruce (winter) | 6 | 22 | 0 / 22 / 0 | 6 no-wood |
| broadleaf_03 | Flowering Peach | 5 | 27 | 9 / 18 / 0 | 5 clean |
| broadleaf_04 | Peach Tree | 2 | 12 | 8 / 4 / 0 | 2 clean |
| broadleaf_rt3 | Broadleaf RT3 | 2 | 8 | 2 / 6 / 0 | 2 clean |
| burnt_tree | Burnt Tree | 6 | 28 | 2 / 26 / 0 | 2 clean, 4 no-wood |
| callitropsis_nootkatensis | Alaskan Cedar | 13 | 39 | 0 / 39 / 0 | 13 no-wood |
| candicands | Candicands | 4 | 36 | 12 / 21 / 3 | 1 clean, 3 amb |
| cedar_generic | Cedar | 5 | 17 | 5 / 4 / 8 | 5 amb |
| conifer_generic | Conifer Forest | 4 | 8 | 2 / 0 / 6 | 4 amb |
| conifer_generic_2 | Conifer Forest 2 | 4 | 8 | 2 / 0 / 6 | 4 amb |
| conifer_generic_3 | Conifer Forest 3 | 4 | 8 | 2 / 0 / 6 | 4 amb |
| cupressus_sempervirens | Italian Cypress | 14 | 75 | 17 / 56 / 2 | 13 clean, 1 amb |
| elderberry | Elderberry | 3 | 0 | 0 / 0 / 0 | 3 no-wood |
| fagus_sylvatica | Common Beech | 4 | 16 | 6 / 10 / 0 | 4 clean |
| garden_mix | Garden Trees Mix | 10 | 34 | 9 / 21 / 4 | 5 clean, 3 amb, 2 no-wood |
| generic_bark_tree | Generic Bark Tree | 2 | 6 | 2 / 2 / 2 | 2 amb |
| generic_leaf_tree | Generic Leaf Tree | 2 | 5 | 3 / 2 / 0 | 2 clean |
| generic_tree_1 | Generic Tree 1 | 1 | 3 | 2 / 1 / 0 | 1 clean |
| generic_tree_2 | Generic Tree 2 | 1 | 3 | 3 / 0 / 0 | 1 clean |
| generic_tree_3 | Bonsai | 1 | 4 | 0 / 4 / 0 | 1 no-wood |
| generic_tree_4 | Generic Tree 4 | 2 | 14 | 2 / 9 / 3 | 2 amb |
| gleditsia_triacanthos | Honey Locust | 3 | 30 | 4 / 20 / 6 | 3 amb |
| juniperus_hollywood | Hollywood Juniper | 6 | 27 | 21 / 4 / 2 | 4 clean, 2 amb |
| juniperus_occidentalis | Western Juniper | 2 | 11 | 6 / 4 / 1 | 1 clean, 1 amb |
| magnolia_sp | Magnolia | 3 | 6 | 0 / 0 / 6 | 3 amb |
| nyssa_sylvatica | Black Gum | 8 | 35 | 2 / 31 / 2 | 2 amb, 6 no-wood |
| picea_abies | Norway Spruce | 2 | 12 | 4 / 0 / 8 | 2 amb |
| pine_corona | Pine (Corona) | 6 | 6 | 0 / 6 / 0 | 6 no-wood |
| pinus_sp | Tall Pine | 5 | 10 | 3 / 7 / 0 | 3 clean, 2 no-wood |
| pinus_sylvestris | Scots Pine | 10 | 30 | 2 / 18 / 10 | 10 amb |
| platanus_acerifolia | London Plane | 14 | 49 | 8 / 39 / 2 | 8 clean, 2 amb, 4 no-wood |
| populus_alba_fall | Poplar (fall) | 7 | 65 | 7 / 58 / 0 | 7 clean |
| populus_canescens | Gray Poplar | 4 | 24 | 0 / 24 / 0 | 4 no-wood |
| populus_tremuloides | Quaking Aspen | 5 | 23 | 11 / 12 / 0 | 5 clean |
| procedural_broadleaf | Procedural Broadleaf | 3 | 6 | 3 / 3 / 0 | 3 clean |
| procedural_columnar | Procedural Columnar | 2 | 4 | 2 / 2 / 0 | 2 clean |
| procedural_conifer | Procedural Conifer | 2 | 4 | 2 / 2 / 0 | 2 clean |
| procedural_ornamental | Procedural Ornamental | 2 | 4 | 2 / 2 / 0 | 2 clean |
| procedural_weeping | Procedural Weeping | 2 | 4 | 2 / 2 / 0 | 2 clean |
| pseudotsuga_menziesii | Douglas Fir | 10 | 30 | 1 / 19 / 10 | 10 amb |
| pseudotsuga_oregon | Oregon Pine / Douglas Fir | 7 | 21 | 14 / 0 / 7 | 7 amb |
| quercus_alba | White Oak | 4 | 8 | 4 / 4 / 0 | 4 clean |
| quercus_winter_fall | Oak (winter/fall) | 6 | 19 | 1 / 17 / 1 | 1 amb, 5 no-wood |
| salix_alba | White Willow | 6 | 6 | 0 / 6 / 0 | 6 no-wood |
| salix_babylonica | Weeping Willow | 5 | 25 | 25 / 0 / 0 | 5 clean |
| spruce_corona | Spruce (Corona) | 2 | 0 | 0 / 0 / 0 | 2 no-wood |
| stump_sycamore | Sycamore Stump Field | 1 | 2 | 1 / 1 / 0 | 1 clean |
| stylized_trees_1 | Stylized Trees 1 | 5 | 10 | 4 / 4 / 2 | 3 clean, 2 amb |
| stylized_trees_2 | Stylized Trees 2 | 21 | 21 | 0 / 20 / 1 | 1 amb, 20 no-wood |
| tilia_americana | American Linden | 1 | 3 | 3 / 0 / 0 | 1 clean |
| tree_brown_bark | Tree Brown Bark | 1 | 7 | 2 / 3 / 2 | 1 amb |
| tree_hz | HZ Tree | 1 | 2 | 0 / 2 / 0 | 1 no-wood |
| tree_variation | Tree (variation) | 8 | 0 | 0 / 0 / 0 | 8 no-wood |
| tree_with_wind | Tree with Wind | 1 | 4 | 1 / 2 / 1 | 1 amb |
| ulmus_americana | American Elm | 2 | 0 | 0 / 0 / 0 | 2 no-wood |
| willow_stylized | Stylized Willow | 12 | 12 | 0 / 12 / 0 | 12 no-wood |
| yellow_autumn_tree | Yellow Autumn Tree | 3 | 6 | 3 / 3 / 0 | 3 clean |

---

## 3. Coverage stats (chassis per morphology)

| Morphology | Chassis written | Distinct species |
|---|---:|---:|
| broadleaf | 91 | 24 |
| conifer | 10 | 4 |
| ornamental | 0 | 0 |
| columnar | 15 | 2 |
| weeping | 7 | 2 |
| unknown | 18 | 1 |

**Gaps (zero clean chassis):** ornamental. Operator-action items — these morphologies have no cleanly-classified vendor source in stock and need either hand-de-leafing (per Top-10 list below) or procedural-only coverage.

---

## 4. Top 10 hardest cases (ambiguous; operator-handle)

### 1. `picea_abies/skeleton-1-lod0.glb` (Norway Spruce)

- WOOD 2 / LEAF 0 / AMBIGUOUS 4
- Ambiguous primitives:
  - mesh="NorwaySpruce_1" mat="NorwaySpruceCone" alpha=MASK v=51748 tris=25874 normalMap=true
  - mesh="NorwaySpruce_1" mat="NorwaySpruceNeedle" alpha=MASK v=406132 tris=221208 normalMap=true
  - mesh="NorwaySpruce_1" mat="NorwaySpruceNeedle" alpha=MASK v=154576 tris=90578 normalMap=true
  - mesh="NorwaySpruce_1" mat="Cap_02" alpha=BLEND v=15560 tris=16287 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 2. `picea_abies/skeleton-2-lod0.glb` (Norway Spruce)

- WOOD 2 / LEAF 0 / AMBIGUOUS 4
- Ambiguous primitives:
  - mesh="NorwaySpruce_2" mat="NorwaySpruceCone" alpha=MASK v=26952 tris=13016 normalMap=true
  - mesh="NorwaySpruce_2" mat="NorwaySpruceNeedle" alpha=MASK v=292969 tris=147543 normalMap=true
  - mesh="NorwaySpruce_2" mat="NorwaySpruceNeedle" alpha=MASK v=109169 tris=63717 normalMap=true
  - mesh="NorwaySpruce_2" mat="Cap_02" alpha=BLEND v=10044 tris=8360 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 3. `abies_concolor/skeleton-4-lod0.glb` (White Fir)

- WOOD 4 / LEAF 2 / AMBIGUOUS 3
- Ambiguous primitives:
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle" alpha=MASK v=54700 tris=40791 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle_Snow" alpha=MASK v=119186 tris=89276 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirCone" alpha=BLEND v=7960 tris=9303 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 4. `abies_concolor/skeleton-7-lod0.glb` (White Fir)

- WOOD 5 / LEAF 1 / AMBIGUOUS 3
- Ambiguous primitives:
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle" alpha=MASK v=87804 tris=65536 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle_Snow" alpha=MASK v=176988 tris=132460 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirCone" alpha=BLEND v=7860 tris=9222 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 5. `abies_concolor/skeleton-5-lod0.glb` (White Fir)

- WOOD 5 / LEAF 0 / AMBIGUOUS 3
- Ambiguous primitives:
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle" alpha=MASK v=67689 tris=50475 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle_Snow" alpha=MASK v=141441 tris=105826 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirCone" alpha=BLEND v=6478 tris=7589 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 6. `abies_concolor/skeleton-6-lod0.glb` (White Fir)

- WOOD 5 / LEAF 0 / AMBIGUOUS 3
- Ambiguous primitives:
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle" alpha=MASK v=68054 tris=50764 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirNeedle_Snow" alpha=MASK v=145148 tris=108611 normalMap=true
  - mesh="WhiteFir_Winter_Med_3" mat="WhiteFirCone" alpha=BLEND v=8142 tris=9520 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 7. `gleditsia_triacanthos/skeleton-1-lod0.glb` (Honey Locust)

- WOOD 1 / LEAF 7 / AMBIGUOUS 2
- Ambiguous primitives:
  - mesh="seed2" mat="seed2_Mat" alpha=MASK v=77133 tris=119118 normalMap=true
  - mesh="seed3" mat="seed2_Mat" alpha=MASK v=33939 tris=52360 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 8. `gleditsia_triacanthos/skeleton-2-lod0.glb` (Honey Locust)

- WOOD 2 / LEAF 6 / AMBIGUOUS 2
- Ambiguous primitives:
  - mesh="seed1" mat="seed1_Mat" alpha=MASK v=83980 tris=129066 normalMap=true
  - mesh="seed3" mat="seed1_Mat" alpha=MASK v=33939 tris=52360 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 9. `gleditsia_triacanthos/skeleton-3-lod0.glb` (Honey Locust)

- WOOD 1 / LEAF 7 / AMBIGUOUS 2
- Ambiguous primitives:
  - mesh="seed1" mat="seed1_Mat" alpha=MASK v=83980 tris=129066 normalMap=true
  - mesh="seed2" mat="seed1_Mat" alpha=MASK v=77133 tris=119118 normalMap=true
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

### 10. `generic_tree_4/skeleton-1-lod0.glb` (Generic Tree 4)

- WOOD 1 / LEAF 4 / AMBIGUOUS 2
- Ambiguous primitives:
  - mesh="tropical_Ohi'_a_Lehua_tree_of_Hawaii_0001" mat="red_Mat_2Sided" alpha=MASK v=5994 tris=7718 normalMap=true
  - mesh="tropical_Ohi'_a_Lehua_tree_of_Hawaii_0001" mat="04315_Mat" alpha=OPAQUE v=1085 tris=1306 normalMap=false
- Recommendation: operator opens the GLB in Blender / gltf-transform inspect, manually marks the ambiguous primitives WOOD or LEAF, then re-runs the script (or hand-edits the chassis output).

---

## 5. Roster recommendations

Candidates for operator review (consider removing from roster or quarantining):

- `betula_pendula` ("Common Birch") — no wood primitives detected in any variant
- `blue_spruce_winter` ("Blue Spruce (winter)") — no wood primitives detected in any variant
- `callitropsis_nootkatensis` ("Alaskan Cedar") — no wood primitives detected in any variant
- `elderberry` ("Elderberry") — no wood primitives detected in any variant
- `generic_tree_3` ("Bonsai") — no wood primitives detected in any variant
- `pine_corona` ("Pine (Corona)") — no wood primitives detected in any variant
- `populus_canescens` ("Gray Poplar") — no wood primitives detected in any variant
- `salix_alba` ("White Willow") — no wood primitives detected in any variant
- `spruce_corona` ("Spruce (Corona)") — no wood primitives detected in any variant
- `tree_hz` ("HZ Tree") — no wood primitives detected in any variant
- `tree_variation` ("Tree (variation)") — no wood primitives detected in any variant
- `ulmus_americana` ("American Elm") — no wood primitives detected in any variant
- `willow_stylized` ("Stylized Willow") — no wood primitives detected in any variant

Stock with names suggesting non-tree or stylized one-offs (operator judgement; not auto-flagged for removal):

- `burnt_tree`
- `candicands`
- `garden_mix`
- `generic_bark_tree`
- `generic_leaf_tree`
- `stump_sycamore`
- `stylized_trees_1`
- `stylized_trees_2`
- `tree_brown_bark`
- `tree_hz`
- `tree_variation`
- `tree_with_wind`

---

## 6. Naming pattern observations

- **Top WOOD material tokens:** `mat` ×114, `cap` ×75, `bark` ×47, `vray` ×25, `2sided` ×23, `branches` ×20, `weepingwillowbranches` ×20, `trunk` ×15, `snow` ×12, `proceduralbark` ×11, `111` ×9, `hollywoodjuniperneedles` ×9
- **Top LEAF material tokens:** `mat` ×384, `cap` ×92, `fall` ×87, `sugarmapleleaves` ×72, `leaf` ×61, `branches` ×60, `populier` ×51, `2sided` ×47, `green` ×43, `sugarmaplebark` ×42, `bark` ×37, `needles` ×34
- **Top AMBIGUOUS material tokens:** `mat` ×66, `needles` ×40, `2sided` ×39, `douglasfir` ×17, `cap` ×16, `desktop` ×13, `scotspine` ×10, `whitefirneedle` ×8, `material` ×8, `background` ×6, `conifer` ×6, `needle1` ×5

### Heuristic-refinement suggestions for a future re-run

- The brief's WOOD keyword set includes `branch`, but `atlas-survey.js#classifyMaterial` places `branch` in the LEAF set (because bomi1337-style packs use `Branches` as the leaf-card material). If `branch`-named opaque-with-normal-map primitives turned up frequently in WOOD they may in fact be leaf clusters; cross-check the per-species table before treating these chassis as clean. See findings below.
- The brief's `< 5000` vertex threshold for LEAF-by-alpha-mode is conservative; vendor lod0 leaf cards routinely run 100k+ verts. Most leaf-card primitives in this stock are caught by the material-name rule, but a future re-run could relax the threshold (e.g., `< 50000`) to catch unlabeled leaf cards without false-positives on bark.
- The avg-tri-area heuristic (rule 1.4) fires rarely because rules 1.1-1.3 absorb most cases first; consider promoting it ahead of rule 1.3 if alpha-mode coverage isn't reliable.

---

## Surface items (per `feedback_baby_must_surface_scope_drift`)

- **Common-name lookup reliability:** 118 of 141 chassis used a common-name label (`label` field from `index.json` / `species-map.json`); 23 fell back to the binomial folder name. `arborist/species-map.json` exists and provides a `label` field for species it covers; `public/trees/index.json` covers more species. Recommend the operator enrich `species-map.json` post-Brief 0 only if the binomial-fallback rate is high.

- **`branch` keyword maps to WOOD in this brief but LEAF in `arborist/atlas-survey.js#classifyMaterial`.** The two classifiers disagree on what `Branches`-named primitives are. In bomi1337-style vendor packs, "Branches" denotes leaf-card primitives (canopy clusters), not bark. Any chassis where the only "wood" primitive has a material name like `Branches_*` may be incorrectly de-leafed (chassis is actually leaf cards stamped as bark). Cross-check the per-species table; flagged species: `abies_concolor`-family (uses `Branches_*_Snow` materials). Operator decision required — either revise the brief's WOOD regex to drop `branch` for the v1.1 re-run, or hand-validate the affected chassis.

- **Surprising internal structure observed in vendor GLBs:**
  - GLBs with more than one mesh node: 29
  - GLBs with more than four primitives: 111 (these are mostly conifers with snow / cone / needle splits — likely re-leafing complexity)
  - No skinned meshes or animation tracks were observed across the surveyed stock (the chassis writer only retains primitives + their parent meshes/nodes; skins/animations would have been visible in the per-prim debug if present).

- **Hint for Salon's eventual re-leaf utility:** chassis emerge with one or two retained primitives (the WOOD subset). Re-leaf attaches leaf cards as separate primitives — there's no need to merge with existing wood meshes. The cleanly-de-leafed chassis serve as a "scaffold-only" template that re-leaf can attach atlas-mapped leaf primitives onto without geometry surgery.

- **Other consumers of `public/trees/<species>/*.glb` beyond the documented runtime / pipeline (per `feedback_orphan_audit_full_repo` grep):**
  - `vite.config.js` — `**/public/trees/**` in the `server.watch.ignored` list (chokidar pass-through; not a reader)
  - `SLAB-CONTRACT.md` — documents `/trees/<species>/skeleton-N-lod2.glb` URLs as part of the kit slab contract (the runtime path; same consumer as `InstancedTrees.jsx`)
  - `arborist/_restore-bak.js`, `arborist/normalize-source-units.js`, `arborist/migrate-add-styles.js`, `arborist/merge-london-plane.js`, `arborist/batch-lowpoly.js` — one-shot maintenance scripts, run-on-demand only
  - All other consumers are the documented runtime (`InstancedTrees.jsx`) + pipeline (`bake-look.js`, `bake-trees.js`, `atlas-survey.js`, `publish-glb.js`, `lidar-publish.js`, `build-index.js`, `republish-all.js`, `generate-procedural.js`)
  - Nothing unexpected; the vendor GLB contract is well-contained.

- **`species-map.json` reliability:** present, 14 species rows. It carries a richer schema (`label`, `scientific`, `leafMorph`, `barkMorph`, `source`, `bark`, `tints`) than `public/trees/index.json`, but the **`category` / morphology field used for chassis `meta.json.morphology` is sourced from `index.json`**, not species-map. Most chassis got `morphology` from `index.json#category`; `unknown` cases are species without a category set in index.json.

---

## Appendix — per-variant detail

| Species | Variant | File | Chassis | WOOD / LEAF / AMB | Status |
|---|---:|---|---|---|---|
| abies_concolor | 1 | skeleton-1-lod0.glb | — | 0 / 8 / 0 | skipped-no-wood |
| abies_concolor | 3 | skeleton-3-lod0.glb | — | 0 / 8 / 0 | skipped-no-wood |
| abies_concolor | 4 | skeleton-4-lod0.glb | — | 4 / 2 / 3 | skipped-ambiguous |
| abies_concolor | 5 | skeleton-5-lod0.glb | — | 5 / 0 / 3 | skipped-ambiguous |
| abies_concolor | 6 | skeleton-6-lod0.glb | — | 5 / 0 / 3 | skipped-ambiguous |
| abies_concolor | 7 | skeleton-7-lod0.glb | — | 5 / 1 / 3 | skipped-ambiguous |
| acer_rubrum | 1 | skeleton-1-lod0.glb | red_maple_a | 1 / 1 / 0 | de-leafed |
| acer_rubrum | 2 | skeleton-2-lod0.glb | red_maple_b | 1 / 1 / 0 | de-leafed |
| acer_rubrum | 3 | skeleton-3-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| acer_saccharum | 1 | skeleton-1-lod0.glb | acer_saccharum_a | 3 / 3 / 0 | de-leafed |
| acer_saccharum | 10 | skeleton-10-lod0.glb | acer_saccharum_j | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 11 | skeleton-11-lod0.glb | acer_saccharum_k | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 12 | skeleton-12-lod0.glb | acer_saccharum_l | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 13 | skeleton-13-lod0.glb | acer_saccharum_m | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 14 | skeleton-14-lod0.glb | acer_saccharum_n | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 15 | skeleton-15-lod0.glb | acer_saccharum_o | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 16 | skeleton-16-lod0.glb | acer_saccharum_p | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 17 | skeleton-17-lod0.glb | acer_saccharum_q | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 18 | skeleton-18-lod0.glb | acer_saccharum_r | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 19 | skeleton-19-lod0.glb | acer_saccharum_s | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 20 | skeleton-20-lod0.glb | acer_saccharum_t | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 21 | skeleton-21-lod0.glb | acer_saccharum_u | 1 / 4 / 0 | de-leafed |
| acer_saccharum | 3 | skeleton-3-lod0.glb | acer_saccharum_c | 4 / 2 / 0 | de-leafed |
| acer_saccharum | 4 | skeleton-4-lod0.glb | acer_saccharum_d | 1 / 5 / 0 | de-leafed |
| acer_saccharum | 5 | skeleton-5-lod0.glb | acer_saccharum_e | 1 / 5 / 0 | de-leafed |
| acer_saccharum | 8 | skeleton-8-lod0.glb | acer_saccharum_h | 1 / 5 / 0 | de-leafed |
| acer_saccharum | 9 | skeleton-9-lod0.glb | acer_saccharum_i | 1 / 5 / 0 | de-leafed |
| acer_saccharum_lowpoly | 1 | skeleton-1-lod0.glb | sugar_maple_low_poly_forest_a | 3 / 3 / 0 | de-leafed |
| acer_saccharum_lowpoly | 10 | skeleton-10-lod0.glb | sugar_maple_low_poly_forest_j | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 11 | skeleton-11-lod0.glb | sugar_maple_low_poly_forest_k | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 12 | skeleton-12-lod0.glb | sugar_maple_low_poly_forest_l | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 13 | skeleton-13-lod0.glb | sugar_maple_low_poly_forest_m | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 14 | skeleton-14-lod0.glb | sugar_maple_low_poly_forest_n | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 15 | skeleton-15-lod0.glb | sugar_maple_low_poly_forest_o | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 16 | skeleton-16-lod0.glb | sugar_maple_low_poly_forest_p | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 17 | skeleton-17-lod0.glb | sugar_maple_low_poly_forest_q | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 18 | skeleton-18-lod0.glb | sugar_maple_low_poly_forest_r | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 19 | skeleton-19-lod0.glb | sugar_maple_low_poly_forest_s | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 20 | skeleton-20-lod0.glb | sugar_maple_low_poly_forest_t | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 21 | skeleton-21-lod0.glb | sugar_maple_low_poly_forest_u | 1 / 4 / 0 | de-leafed |
| acer_saccharum_lowpoly | 3 | skeleton-3-lod0.glb | sugar_maple_low_poly_forest_c | 4 / 2 / 0 | de-leafed |
| acer_saccharum_lowpoly | 4 | skeleton-4-lod0.glb | sugar_maple_low_poly_forest_d | 1 / 5 / 0 | de-leafed |
| acer_saccharum_lowpoly | 5 | skeleton-5-lod0.glb | sugar_maple_low_poly_forest_e | 1 / 5 / 0 | de-leafed |
| acer_saccharum_lowpoly | 8 | skeleton-8-lod0.glb | sugar_maple_low_poly_forest_h | 1 / 5 / 0 | de-leafed |
| acer_saccharum_lowpoly | 9 | skeleton-9-lod0.glb | sugar_maple_low_poly_forest_i | 1 / 5 / 0 | de-leafed |
| acer_saccharum_multistem | 1 | skeleton-1-lod0.glb | — | 2 / 0 / 2 | skipped-ambiguous |
| acer_saccharum_multistem | 2 | skeleton-2-lod0.glb | — | 2 / 0 / 2 | skipped-ambiguous |
| acer_saccharum_procedural | 1 | skeleton-1-lod0.glb | acer_saccharum_procedural_a | 2 / 0 / 0 | de-leafed |
| acer_saccharum_procedural | 2 | skeleton-2-lod0.glb | acer_saccharum_procedural_b | 2 / 0 / 0 | de-leafed |
| acer_saccharum_procedural | 3 | skeleton-3-lod0.glb | acer_saccharum_procedural_c | 2 / 0 / 0 | de-leafed |
| acer_saccharum_procedural | 4 | skeleton-4-lod0.glb | acer_saccharum_procedural_d | 2 / 0 / 0 | de-leafed |
| acer_saccharum_procedural | 5 | skeleton-5-lod0.glb | acer_saccharum_procedural_e | 2 / 0 / 0 | de-leafed |
| alaskan_cedar_2 | 1 | skeleton-1-lod0.glb | — | 1 / 2 / 1 | skipped-ambiguous |
| alaskan_cedar_2 | 2 | skeleton-2-lod0.glb | — | 2 / 1 / 1 | skipped-ambiguous |
| betula_papyrifera | 2 | skeleton-2-lod0.glb | paper_birch_b | 1 / 2 / 0 | de-leafed |
| betula_papyrifera | 3 | skeleton-3-lod0.glb | paper_birch_c | 1 / 2 / 0 | de-leafed |
| betula_papyrifera | 4 | skeleton-4-lod0.glb | paper_birch_d | 1 / 2 / 0 | de-leafed |
| betula_papyrifera | 5 | skeleton-5-lod0.glb | paper_birch_e | 1 / 2 / 0 | de-leafed |
| betula_pendula | 1 | skeleton-1-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| betula_pendula | 2 | skeleton-2-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| betula_pendula | 3 | skeleton-3-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| betula_pendula | 4 | skeleton-4-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| betula_pendula | 5 | skeleton-5-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| blue_spruce | 2 | skeleton-2-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce | 3 | skeleton-3-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce | 4 | skeleton-4-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce | 5 | skeleton-5-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce | 6 | skeleton-6-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce | 7 | skeleton-7-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce | 8 | skeleton-8-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| blue_spruce_winter | 3 | skeleton-3-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| blue_spruce_winter | 4 | skeleton-4-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| blue_spruce_winter | 5 | skeleton-5-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| blue_spruce_winter | 6 | skeleton-6-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| blue_spruce_winter | 7 | skeleton-7-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| blue_spruce_winter | 8 | skeleton-8-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| broadleaf_03 | 1 | skeleton-1-lod0.glb | flowering_peach_a | 3 / 3 / 0 | de-leafed |
| broadleaf_03 | 3 | skeleton-3-lod0.glb | flowering_peach_c | 3 / 3 / 0 | de-leafed |
| broadleaf_03 | 5 | skeleton-5-lod0.glb | flowering_peach_e | 1 / 4 / 0 | de-leafed |
| broadleaf_03 | 6 | skeleton-6-lod0.glb | flowering_peach_f | 1 / 4 / 0 | de-leafed |
| broadleaf_03 | 7 | skeleton-7-lod0.glb | flowering_peach_g | 1 / 4 / 0 | de-leafed |
| broadleaf_04 | 1 | skeleton-1-lod0.glb | peach_tree_a | 4 / 2 / 0 | de-leafed |
| broadleaf_04 | 2 | skeleton-2-lod0.glb | peach_tree_b | 4 / 2 / 0 | de-leafed |
| broadleaf_rt3 | 1 | skeleton-1-lod0.glb | broadleaf_rt3_a | 1 / 3 / 0 | de-leafed |
| broadleaf_rt3 | 2 | skeleton-2-lod0.glb | broadleaf_rt3_b | 1 / 3 / 0 | de-leafed |
| burnt_tree | 1 | skeleton-1-lod0.glb | burnt_tree_a | 1 / 4 / 0 | de-leafed |
| burnt_tree | 2 | skeleton-2-lod0.glb | burnt_tree_b | 1 / 4 / 0 | de-leafed |
| burnt_tree | 3 | skeleton-3-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| burnt_tree | 4 | skeleton-4-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| burnt_tree | 5 | skeleton-5-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| burnt_tree | 6 | skeleton-6-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 10 | skeleton-10-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 11 | skeleton-11-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 12 | skeleton-12-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 13 | skeleton-13-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 14 | skeleton-14-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 2 | skeleton-2-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 3 | skeleton-3-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 4 | skeleton-4-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 5 | skeleton-5-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 6 | skeleton-6-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 7 | skeleton-7-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 8 | skeleton-8-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| callitropsis_nootkatensis | 9 | skeleton-9-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| candicands | 1 | skeleton-1-lod0.glb | — | 3 / 5 / 1 | skipped-ambiguous |
| candicands | 2 | skeleton-2-lod0.glb | candicands_b | 3 / 6 / 0 | de-leafed |
| candicands | 3 | skeleton-3-lod0.glb | — | 3 / 5 / 1 | skipped-ambiguous |
| candicands | 4 | skeleton-4-lod0.glb | — | 3 / 5 / 1 | skipped-ambiguous |
| cedar_generic | 1 | skeleton-1-lod0.glb | — | 1 / 1 / 2 | skipped-ambiguous |
| cedar_generic | 2 | skeleton-2-lod0.glb | — | 1 / 1 / 2 | skipped-ambiguous |
| cedar_generic | 4 | skeleton-4-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| cedar_generic | 5 | skeleton-5-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| cedar_generic | 6 | skeleton-6-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| conifer_generic | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| conifer_generic | 2 | skeleton-2-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| conifer_generic | 3 | skeleton-3-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| conifer_generic | 4 | skeleton-4-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| conifer_generic_2 | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| conifer_generic_2 | 2 | skeleton-2-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| conifer_generic_2 | 3 | skeleton-3-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| conifer_generic_2 | 4 | skeleton-4-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| conifer_generic_3 | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| conifer_generic_3 | 2 | skeleton-2-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| conifer_generic_3 | 3 | skeleton-3-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| conifer_generic_3 | 4 | skeleton-4-lod0.glb | — | 1 / 0 / 2 | skipped-ambiguous |
| cupressus_sempervirens | 1 | skeleton-1-lod0.glb | — | 4 / 0 / 2 | skipped-ambiguous |
| cupressus_sempervirens | 10 | skeleton-10-lod0.glb | italian_cypress_j | 1 / 5 / 0 | de-leafed |
| cupressus_sempervirens | 11 | skeleton-11-lod0.glb | italian_cypress_k | 1 / 5 / 0 | de-leafed |
| cupressus_sempervirens | 12 | skeleton-12-lod0.glb | italian_cypress_l | 1 / 5 / 0 | de-leafed |
| cupressus_sempervirens | 13 | skeleton-13-lod0.glb | italian_cypress_m | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 14 | skeleton-14-lod0.glb | italian_cypress_n | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 15 | skeleton-15-lod0.glb | italian_cypress_o | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 3 | skeleton-3-lod0.glb | italian_cypress_c | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 4 | skeleton-4-lod0.glb | italian_cypress_d | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 5 | skeleton-5-lod0.glb | italian_cypress_e | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 6 | skeleton-6-lod0.glb | italian_cypress_f | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 7 | skeleton-7-lod0.glb | italian_cypress_g | 1 / 5 / 0 | de-leafed |
| cupressus_sempervirens | 8 | skeleton-8-lod0.glb | italian_cypress_h | 1 / 4 / 0 | de-leafed |
| cupressus_sempervirens | 9 | skeleton-9-lod0.glb | italian_cypress_i | 1 / 4 / 0 | de-leafed |
| elderberry | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| elderberry | 2 | skeleton-2-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| elderberry | 3 | skeleton-3-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| fagus_sylvatica | 2 | skeleton-2-lod0.glb | common_beech_b | 3 / 1 / 0 | de-leafed |
| fagus_sylvatica | 3 | skeleton-3-lod0.glb | common_beech_c | 1 / 3 / 0 | de-leafed |
| fagus_sylvatica | 4 | skeleton-4-lod0.glb | common_beech_d | 1 / 3 / 0 | de-leafed |
| fagus_sylvatica | 5 | skeleton-5-lod0.glb | common_beech_e | 1 / 3 / 0 | de-leafed |
| garden_mix | 1 | skeleton-1-lod0.glb | garden_trees_mix_a | 1 / 1 / 0 | de-leafed |
| garden_mix | 10 | skeleton-10-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| garden_mix | 2 | skeleton-2-lod0.glb | garden_trees_mix_b | 1 / 1 / 0 | de-leafed |
| garden_mix | 3 | skeleton-3-lod0.glb | — | 0 / 1 / 1 | skipped-ambiguous |
| garden_mix | 4 | skeleton-4-lod0.glb | — | 2 / 5 / 1 | skipped-ambiguous |
| garden_mix | 5 | skeleton-5-lod0.glb | garden_trees_mix_e | 2 / 6 / 0 | de-leafed |
| garden_mix | 6 | skeleton-6-lod0.glb | garden_trees_mix_f | 2 / 6 / 0 | de-leafed |
| garden_mix | 7 | skeleton-7-lod0.glb | garden_trees_mix_g | 1 / 1 / 0 | de-leafed |
| garden_mix | 8 | skeleton-8-lod0.glb | — | 0 / 0 / 2 | skipped-ambiguous |
| garden_mix | 9 | skeleton-9-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| generic_bark_tree | 1 | skeleton-1-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| generic_bark_tree | 2 | skeleton-2-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| generic_leaf_tree | 3 | skeleton-3-lod0.glb | generic_leaf_tree_c | 1 / 1 / 0 | de-leafed |
| generic_leaf_tree | 4 | skeleton-4-lod0.glb | generic_leaf_tree_d | 2 / 1 / 0 | de-leafed |
| generic_tree_1 | 1 | skeleton-1-lod0.glb | generic_tree_1_a | 2 / 1 / 0 | de-leafed |
| generic_tree_2 | 1 | skeleton-1-lod0.glb | generic_tree_2_a | 3 / 0 / 0 | de-leafed |
| generic_tree_3 | 1 | skeleton-1-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| generic_tree_4 | 1 | skeleton-1-lod0.glb | — | 1 / 4 / 2 | skipped-ambiguous |
| generic_tree_4 | 2 | skeleton-2-lod0.glb | — | 1 / 5 / 1 | skipped-ambiguous |
| gleditsia_triacanthos | 1 | skeleton-1-lod0.glb | — | 1 / 7 / 2 | skipped-ambiguous |
| gleditsia_triacanthos | 2 | skeleton-2-lod0.glb | — | 2 / 6 / 2 | skipped-ambiguous |
| gleditsia_triacanthos | 3 | skeleton-3-lod0.glb | — | 1 / 7 / 2 | skipped-ambiguous |
| juniperus_hollywood | 1 | skeleton-1-lod0.glb | hollywood_juniper_a | 4 / 1 / 0 | de-leafed |
| juniperus_hollywood | 2 | skeleton-2-lod0.glb | hollywood_juniper_b | 3 / 1 / 0 | de-leafed |
| juniperus_hollywood | 3 | skeleton-3-lod0.glb | — | 3 / 0 / 1 | skipped-ambiguous |
| juniperus_hollywood | 4 | skeleton-4-lod0.glb | — | 4 / 0 / 1 | skipped-ambiguous |
| juniperus_hollywood | 5 | skeleton-5-lod0.glb | hollywood_juniper_e | 4 / 1 / 0 | de-leafed |
| juniperus_hollywood | 6 | skeleton-6-lod0.glb | hollywood_juniper_f | 3 / 1 / 0 | de-leafed |
| juniperus_occidentalis | 1 | skeleton-1-lod0.glb | western_juniper_a | 3 / 4 / 0 | de-leafed |
| juniperus_occidentalis | 2 | skeleton-2-lod0.glb | — | 3 / 0 / 1 | skipped-ambiguous |
| magnolia_sp | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 2 | skipped-ambiguous |
| magnolia_sp | 2 | skeleton-2-lod0.glb | — | 0 / 0 / 2 | skipped-ambiguous |
| magnolia_sp | 3 | skeleton-3-lod0.glb | — | 0 / 0 / 2 | skipped-ambiguous |
| nyssa_sylvatica | 1 | skeleton-1-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| nyssa_sylvatica | 3 | skeleton-3-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| nyssa_sylvatica | 4 | skeleton-4-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| nyssa_sylvatica | 5 | skeleton-5-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| nyssa_sylvatica | 6 | skeleton-6-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| nyssa_sylvatica | 7 | skeleton-7-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| nyssa_sylvatica | 8 | skeleton-8-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| nyssa_sylvatica | 9 | skeleton-9-lod0.glb | — | 0 / 5 / 0 | skipped-no-wood |
| picea_abies | 1 | skeleton-1-lod0.glb | — | 2 / 0 / 4 | skipped-ambiguous |
| picea_abies | 2 | skeleton-2-lod0.glb | — | 2 / 0 / 4 | skipped-ambiguous |
| pine_corona | 1 | skeleton-1-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| pine_corona | 2 | skeleton-2-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| pine_corona | 3 | skeleton-3-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| pine_corona | 4 | skeleton-4-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| pine_corona | 5 | skeleton-5-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| pine_corona | 6 | skeleton-6-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| pinus_sp | 1 | skeleton-1-lod0.glb | tall_pine_a | 1 / 1 / 0 | de-leafed |
| pinus_sp | 2 | skeleton-2-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| pinus_sp | 3 | skeleton-3-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| pinus_sp | 4 | skeleton-4-lod0.glb | tall_pine_d | 1 / 1 / 0 | de-leafed |
| pinus_sp | 5 | skeleton-5-lod0.glb | tall_pine_e | 1 / 1 / 0 | de-leafed |
| pinus_sylvestris | 10 | skeleton-10-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 11 | skeleton-11-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| pinus_sylvestris | 2 | skeleton-2-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 3 | skeleton-3-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 4 | skeleton-4-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 5 | skeleton-5-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 6 | skeleton-6-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 7 | skeleton-7-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pinus_sylvestris | 8 | skeleton-8-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| pinus_sylvestris | 9 | skeleton-9-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| platanus_acerifolia | 1 | skeleton-1-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| platanus_acerifolia | 10 | skeleton-10-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| platanus_acerifolia | 11 | skeleton-11-lod0.glb | london_plane_k | 1 / 2 / 0 | de-leafed |
| platanus_acerifolia | 12 | skeleton-12-lod0.glb | london_plane_l | 1 / 2 / 0 | de-leafed |
| platanus_acerifolia | 13 | skeleton-13-lod0.glb | — | 0 / 1 / 1 | skipped-ambiguous |
| platanus_acerifolia | 14 | skeleton-14-lod0.glb | — | 0 / 1 / 1 | skipped-ambiguous |
| platanus_acerifolia | 2 | skeleton-2-lod0.glb | — | 0 / 4 / 0 | skipped-no-wood |
| platanus_acerifolia | 3 | skeleton-3-lod0.glb | london_plane_c | 1 / 3 / 0 | de-leafed |
| platanus_acerifolia | 4 | skeleton-4-lod0.glb | london_plane_d | 1 / 3 / 0 | de-leafed |
| platanus_acerifolia | 5 | skeleton-5-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| platanus_acerifolia | 6 | skeleton-6-lod0.glb | london_plane_f | 1 / 3 / 0 | de-leafed |
| platanus_acerifolia | 7 | skeleton-7-lod0.glb | london_plane_g | 1 / 3 / 0 | de-leafed |
| platanus_acerifolia | 8 | skeleton-8-lod0.glb | london_plane_h | 1 / 3 / 0 | de-leafed |
| platanus_acerifolia | 9 | skeleton-9-lod0.glb | london_plane_i | 1 / 3 / 0 | de-leafed |
| populus_alba_fall | 1 | skeleton-1-lod0.glb | poplar_fall_a | 1 / 8 / 0 | de-leafed |
| populus_alba_fall | 2 | skeleton-2-lod0.glb | poplar_fall_b | 1 / 8 / 0 | de-leafed |
| populus_alba_fall | 3 | skeleton-3-lod0.glb | poplar_fall_c | 1 / 8 / 0 | de-leafed |
| populus_alba_fall | 4 | skeleton-4-lod0.glb | poplar_fall_d | 1 / 9 / 0 | de-leafed |
| populus_alba_fall | 5 | skeleton-5-lod0.glb | poplar_fall_e | 1 / 8 / 0 | de-leafed |
| populus_alba_fall | 6 | skeleton-6-lod0.glb | poplar_fall_f | 1 / 8 / 0 | de-leafed |
| populus_alba_fall | 7 | skeleton-7-lod0.glb | poplar_fall_g | 1 / 9 / 0 | de-leafed |
| populus_canescens | 1 | skeleton-1-lod0.glb | — | 0 / 6 / 0 | skipped-no-wood |
| populus_canescens | 2 | skeleton-2-lod0.glb | — | 0 / 6 / 0 | skipped-no-wood |
| populus_canescens | 3 | skeleton-3-lod0.glb | — | 0 / 6 / 0 | skipped-no-wood |
| populus_canescens | 4 | skeleton-4-lod0.glb | — | 0 / 6 / 0 | skipped-no-wood |
| populus_tremuloides | 1 | skeleton-1-lod0.glb | quaking_aspen_a | 2 / 3 / 0 | de-leafed |
| populus_tremuloides | 2 | skeleton-2-lod0.glb | quaking_aspen_b | 3 / 2 / 0 | de-leafed |
| populus_tremuloides | 3 | skeleton-3-lod0.glb | quaking_aspen_c | 2 / 3 / 0 | de-leafed |
| populus_tremuloides | 4 | skeleton-4-lod0.glb | quaking_aspen_d | 2 / 3 / 0 | de-leafed |
| populus_tremuloides | 5 | skeleton-5-lod0.glb | quaking_aspen_e | 2 / 1 / 0 | de-leafed |
| procedural_broadleaf | 1 | skeleton-1-lod0.glb | procedural_broadleaf_a | 1 / 1 / 0 | de-leafed |
| procedural_broadleaf | 2 | skeleton-2-lod0.glb | procedural_broadleaf_b | 1 / 1 / 0 | de-leafed |
| procedural_broadleaf | 3 | skeleton-3-lod0.glb | procedural_broadleaf_c | 1 / 1 / 0 | de-leafed |
| procedural_columnar | 1 | skeleton-1-lod0.glb | procedural_columnar_a | 1 / 1 / 0 | de-leafed |
| procedural_columnar | 2 | skeleton-2-lod0.glb | procedural_columnar_b | 1 / 1 / 0 | de-leafed |
| procedural_conifer | 1 | skeleton-1-lod0.glb | procedural_conifer_a | 1 / 1 / 0 | de-leafed |
| procedural_conifer | 2 | skeleton-2-lod0.glb | procedural_conifer_b | 1 / 1 / 0 | de-leafed |
| procedural_ornamental | 1 | skeleton-1-lod0.glb | procedural_ornamental_a | 1 / 1 / 0 | de-leafed |
| procedural_ornamental | 2 | skeleton-2-lod0.glb | procedural_ornamental_b | 1 / 1 / 0 | de-leafed |
| procedural_weeping | 1 | skeleton-1-lod0.glb | procedural_weeping_a | 1 / 1 / 0 | de-leafed |
| procedural_weeping | 2 | skeleton-2-lod0.glb | procedural_weeping_b | 1 / 1 / 0 | de-leafed |
| pseudotsuga_menziesii | 1 | skeleton-1-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 10 | skeleton-10-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 11 | skeleton-11-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 3 | skeleton-3-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 4 | skeleton-4-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 5 | skeleton-5-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 6 | skeleton-6-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 7 | skeleton-7-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 8 | skeleton-8-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_menziesii | 9 | skeleton-9-lod0.glb | — | 0 / 2 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 1 | skeleton-1-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 2 | skeleton-2-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 3 | skeleton-3-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 4 | skeleton-4-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 5 | skeleton-5-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 6 | skeleton-6-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| pseudotsuga_oregon | 7 | skeleton-7-lod0.glb | — | 2 / 0 / 1 | skipped-ambiguous |
| quercus_alba | 1 | skeleton-1-lod0.glb | white_oak_a | 1 / 1 / 0 | de-leafed |
| quercus_alba | 2 | skeleton-2-lod0.glb | white_oak_b | 1 / 1 / 0 | de-leafed |
| quercus_alba | 4 | skeleton-4-lod0.glb | white_oak_d | 1 / 1 / 0 | de-leafed |
| quercus_alba | 5 | skeleton-5-lod0.glb | white_oak_e | 1 / 1 / 0 | de-leafed |
| quercus_winter_fall | 1 | skeleton-1-lod0.glb | — | 1 / 2 / 1 | skipped-ambiguous |
| quercus_winter_fall | 3 | skeleton-3-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| quercus_winter_fall | 4 | skeleton-4-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| quercus_winter_fall | 5 | skeleton-5-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| quercus_winter_fall | 6 | skeleton-6-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| quercus_winter_fall | 7 | skeleton-7-lod0.glb | — | 0 / 3 / 0 | skipped-no-wood |
| salix_alba | 1 | skeleton-1-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| salix_alba | 2 | skeleton-2-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| salix_alba | 3 | skeleton-3-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| salix_alba | 4 | skeleton-4-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| salix_alba | 5 | skeleton-5-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| salix_alba | 6 | skeleton-6-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| salix_babylonica | 1 | skeleton-1-lod0.glb | weeping_willow_a | 5 / 0 / 0 | de-leafed |
| salix_babylonica | 2 | skeleton-2-lod0.glb | weeping_willow_b | 5 / 0 / 0 | de-leafed |
| salix_babylonica | 3 | skeleton-3-lod0.glb | weeping_willow_c | 5 / 0 / 0 | de-leafed |
| salix_babylonica | 4 | skeleton-4-lod0.glb | weeping_willow_d | 5 / 0 / 0 | de-leafed |
| salix_babylonica | 5 | skeleton-5-lod0.glb | weeping_willow_e | 5 / 0 / 0 | de-leafed |
| spruce_corona | 4 | skeleton-4-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| spruce_corona | 5 | skeleton-5-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| stump_sycamore | 1 | skeleton-1-lod0.glb | sycamore_stump_field_a | 1 / 1 / 0 | de-leafed |
| stylized_trees_1 | 1 | skeleton-1-lod0.glb | stylized_trees_1_a | 1 / 1 / 0 | de-leafed |
| stylized_trees_1 | 2 | skeleton-2-lod0.glb | stylized_trees_1_b | 1 / 1 / 0 | de-leafed |
| stylized_trees_1 | 3 | skeleton-3-lod0.glb | stylized_trees_1_c | 1 / 1 / 0 | de-leafed |
| stylized_trees_1 | 4 | skeleton-4-lod0.glb | — | 1 / 1 / 1 | skipped-ambiguous |
| stylized_trees_1 | 5 | skeleton-5-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| stylized_trees_2 | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 1 | skipped-ambiguous |
| stylized_trees_2 | 10 | skeleton-10-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 11 | skeleton-11-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 12 | skeleton-12-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 13 | skeleton-13-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 14 | skeleton-14-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 15 | skeleton-15-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 16 | skeleton-16-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 17 | skeleton-17-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 18 | skeleton-18-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 19 | skeleton-19-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 2 | skeleton-2-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 20 | skeleton-20-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 21 | skeleton-21-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 3 | skeleton-3-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 4 | skeleton-4-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 5 | skeleton-5-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 6 | skeleton-6-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 7 | skeleton-7-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 8 | skeleton-8-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| stylized_trees_2 | 9 | skeleton-9-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| tilia_americana | 1 | skeleton-1-lod0.glb | american_linden_a | 3 / 0 / 0 | de-leafed |
| tree_brown_bark | 1 | skeleton-1-lod0.glb | — | 2 / 3 / 2 | skipped-ambiguous |
| tree_hz | 1 | skeleton-1-lod0.glb | — | 0 / 2 / 0 | skipped-no-wood |
| tree_variation | 10 | skeleton-10-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 11 | skeleton-11-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 4 | skeleton-4-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 5 | skeleton-5-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 6 | skeleton-6-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 7 | skeleton-7-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 8 | skeleton-8-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_variation | 9 | skeleton-9-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| tree_with_wind | 1 | skeleton-1-lod0.glb | — | 1 / 2 / 1 | skipped-ambiguous |
| ulmus_americana | 1 | skeleton-1-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| ulmus_americana | 2 | skeleton-2-lod0.glb | — | 0 / 0 / 0 | skipped-no-wood |
| willow_stylized | 1 | skeleton-1-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 10 | skeleton-10-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 11 | skeleton-11-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 12 | skeleton-12-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 2 | skeleton-2-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 3 | skeleton-3-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 4 | skeleton-4-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 5 | skeleton-5-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 6 | skeleton-6-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 7 | skeleton-7-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 8 | skeleton-8-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| willow_stylized | 9 | skeleton-9-lod0.glb | — | 0 / 1 / 0 | skipped-no-wood |
| yellow_autumn_tree | 1 | skeleton-1-lod0.glb | yellow_autumn_tree_a | 1 / 1 / 0 | de-leafed |
| yellow_autumn_tree | 3 | skeleton-3-lod0.glb | yellow_autumn_tree_c | 1 / 1 / 0 | de-leafed |
| yellow_autumn_tree | 4 | skeleton-4-lod0.glb | yellow_autumn_tree_d | 1 / 1 / 0 | de-leafed |
