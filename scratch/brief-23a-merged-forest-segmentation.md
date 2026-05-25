# Brief 23a — Per-tree segmentation of MERGED single-mesh forests (the hard 3D case)

**Status: filed, NOT dispatched. Sub-phased out of Brief 23 (Mistral) by operator decision 2026-05-25.** May not be worth building — see "Is this worth doing at all?" below. Read that first.

**Scope is narrow and fixed (operator-bounded 2026-05-25):** ONLY the merged single-mesh forests — files where N trunks are baked into ONE primitive's shared index buffer. The *separable* decomposition is DONE and must NOT be re-touched:
- Whittle (Brief 0) — file-level multipacks (each `skeleton-N.glb` = one tree).
- Riven (Brief 1.5c) — multi-root bundles via `processBundleGlb` (candicands / honey_locust / gray_poplar / london_plane / poplar_fall, + black_locust as a single-root rename), extended to 58 splits when Brief 6.2's classifier fix rode Brief 20's regen.

Do NOT scope 23a to touch separable / multi-root / multipack files. They are correct individual trees and stay in the catalog.

## The worklist (produced by survey-deleaf.js, Brief 23)

`arborist/state/_chassis-forests.json` — regenerated every run. Current contents (7 chassis, ≥3 trunks-in-one-mesh):

| Chassis | Trunks in one mesh | Source species |
|---|---:|---|
| `acer_saccharum_a` | 17 | acer_saccharum (also LiDAR-species → already catalog-hidden) |
| `acer_saccharum_c` | 22 | acer_saccharum |
| `sugar_maple_low_poly_forest_a` | 17 | acer_saccharum_lowpoly |
| `sugar_maple_low_poly_forest_c` | 22 | acer_saccharum_lowpoly |
| `burnt_tree_a` | 7 | burnt_tree |
| `burnt_tree_d` | 4 | burnt_tree |
| `burnt_tree_f` | 8 | burnt_tree |

These are suppressed from the Salon catalog (serve.js `/salon/:species/chassis` reads `listForestChassis`). The threshold is **≥3 trunks** — 2-trunk readings (multi-STEM organisms like `sugar_maple_multistem`, forked-base single trees like `italian_cypress` / `blue_spruce` / `common_beech` / `western_juniper`) are deliberately NOT flagged (one legit tree, not a forest).

## Why it's the hard case (classification finding, Mistral 2026-05-25)

These forests' primitives are organized **by material** (bark / branches / cap / leaves), each spanning the whole forest footprint. A single bark primitive holds all the trunks:

| Chassis | Dominant prim | Trunks in that ONE prim |
|---|---|---:|
| `acer_saccharum_a` | salonBark, 25K verts | 17 |
| `acer_saccharum_c` | SugarMapleBark, 37K verts | 22 |
| `sugar_maple_low_poly_forest_a` | SugarMapleBark, 28K verts | 17 |
| `burnt_tree_a` | BurntWood, 16K verts | 45 raw (noisy; CC over-counts) |

So splitting is NOT "assign primitives to trees" (the easy case Whittle/Riven already cover). It's **per-triangle nearest-trunk assignment inside shared index buffers** — a 3D mesh-segmentation problem with crown interleave.

Two footholds:
- **Trunk detection is reliable.** Connected-components on the bottom-5% slab (the existing `surveyTrunkClusters` grid) cleanly separates the trunks (~N components ≈ N trees + 1 for the clean low-poly maples). So you get the N trunk XZ-centroids for free.
- **`burnt_tree` is noisy + low-value** (45 raw clusters, also ÷10 mis-scaled, uncurated, not in use). The clean low-poly maples (17/22 well-separated) are the tractable targets.

## Suggested approach (if dispatched)

1. Trunk centroids from `surveyTrunkClusters` connected-components (reuse Brief 20's binning).
2. Per triangle (across ALL prims of the chassis): compute XZ centroid, assign to nearest trunk centroid. (Crown interleave → some boundary misassignment; acceptable for well-separated forest trees, garbage for `burnt_tree` — skip it or gate on cluster-count cleanliness.)
3. Emit one sub-chassis per trunk carrying its assigned triangles across all materials; recenter each (Brief 20's dominant-trunk) + the mis-scale ÷ is already applied upstream by Brief 23.
4. Name `<species>_<letter>_tree<N>` (mirrors Riven's per-root naming). Remove from the forest worklist suppression (they become real singles); the old whole-forest chassis stops being emitted.
5. Determinism: fixed trunk-iteration order (sort by XZ), Knuth-style tie-breaks.

**Cluster-count denoising is the real work**, not the LOC — `burnt_tree`'s 45 raw clusters must collapse to ~7 real trunks before assignment, or the split is nonsense. Prototype the denoise + inspect the low-poly maples in the Salon before committing to `burnt_tree`.

## Is this worth doing at all?

**Maybe not.** Individual Sugar Maples already exist via the LiDAR/procedural hero (`acer_saccharum_procedural`) and the vendor singles. The merged forests are a handful of stylized low-poly + burnt assets, none in active use, all now suppressed (no longer leak as group shots) and unit-rescaled. The 3D segmentation is genuinely hard and the payoff is low. Recommend the operator confirm a concrete need for these specific trees-as-singles before dispatching. If not needed, leave them suppressed — Brief 23's fortifications already make the library correct + durable without them.

— filed by Mistral (Brief 23 baby), 2026-05-25
