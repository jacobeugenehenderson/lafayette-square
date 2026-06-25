# Baton — tree render: next arc (impostor LOD + retire GeoTierDriver)

> **Pick-up handhold from the 2026-06-24 EOD session (Boz).** Route first: `ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → `HANDOFF-visibility-cull-lods.md` (**read its top "🧭 CONFIRMED DOCTRINE" callout first** — it's the frame for this whole arc). Branch `curb-offset-draw`.

## The doctrine to build to (settled 2026-06-24 with Jacob — do NOT re-litigate)
- **CAPSTONE: optical PARITY is the invariant; DETAIL is the only variable.** The optical pipeline (depth gauges / DoF / fog / post) is assumed ON and uniform everywhere; across contexts/devices/tiers only *how much detail* changes. **Never fork/disable the optics by context/device** (mobile≠desktop = a detail *bracket*, not an on/off fork — "tier ladder ≡ blur pyramid").
- **Trees:** geometry representation = a **per-placement ROLE decided at BAKE** (park/focal → real lod0/1/2; environment/neighborhood-fill + far/occluded park → **impostor**; ladder = lod0/1/2/impostor). **Depth gauges own visual distance** ("DoF is the cover, not the cut"). ⛔ **No runtime camera-distance/altitude geometry swap.**
- Memory: `[[project_tree_lod_role_at_bake_not_distance]]` (+ capstone), `[[preview-equals-pyramid-tier-ladder]]`, `[[feedback_worked_before_means_regression]]`.

## What LANDED tonight (committed, `curb-offset-draw`)
- **Leaf-decimation regression FIXED + eye-gated** (`4f9c9a77`): `6c3ff5e5` had loosened lod1 `error` 0.02 → collapsed the hero canopy ~90% (birch lod1 15.7K→1.6K cards). Reverted lod1 → 0.002 (full canopy); lod2 stays 0.05 (far/browse); Grove → lod0. **Weight ≠ canopy density are separate owners** (bark smooth-weld = weight/topology; per-LOD `error` = leaf density).
- **Preview Reload now invalidates the tree-atlas module cache** (`eb1dc38f`): `treeAtlasMaterial.js#_cache` only re-fetched on a full browser reload; `invalidateTreeAtlas` existed but was never called → "stale leaves in Preview after rebake." Wired into Preview's `onReload`.
- Doctrine captured (`5dbd7f49`, `b1036ca7`) in `arborist/NOTES.md` + `ARCHITECTURE.md` + the HANDOFF callout.
- (Earlier same session: Hero camera authoring/runtime modes `0141c60f`; bloom slab `2c7dded6`; Pip wiring `160f9a45`.)

## NEXT ARC — the impostor render (needs a standup with Jacob first; it's a new build)
The classifier + plumbing already exist; the **billboard render is the unbuilt piece**:
- `bake-trees.js#classifyHeroTiers` already tags each placement `mesh|impostor|cull` (561/184 on LS) from the known camera tracks — the role oracle.
- `InstancedTrees.jsx` already carries the per-instance `aHeroTier` attribute — but today it only drives a **read-only QC tint**, not a billboard.
- **Build:** (1) impostor billboard geometry/material (rides full optical parity — gets DoF'd/fogged like real geo); (2) consume the bake role to render impostor-tier placements as billboards; (3) **retire `GeoTierDriver`** (the runtime altitude-swap, already moot) — geometry by role, not distance. Then the future neighborhood/street-tree fill is cheap-by-construction.

## LOOSE THREAD to confirm first
- **Preview "sparse close up":** I verified the baked GLBs the runtime loads have FULL leaves (birch lod1 = 15,610) and Preview defaults to hero→lod1. The fix (`eb1dc38f`) + a true browser hard-reload of the Preview tab should show full. **If it's STILL sparse up-close after a genuine hard-reload**, it's not the cache — inspect the actual `.glb` network request (URL, `?v=`, served-from-cache) and the served file. (No service worker; `base:'/'`.)

## REPO STATE at handoff (`curb-offset-draw`, NOT pushed/deployed — branch deploys nothing)
- **Dirty tracked, = Jacob's 19:33 Grove rebake (post-fix, full leaves, CORRECT):** `public/baked/lafayette-square.json`, `trees-atlas.json`, baked GLBs for birch/blackgum/maple_silver/oak_bur. Commit-or-discard = Jacob's call (regenerable via `/grove/bake`).
- **Dirty tracked, NOT this work (leave / Jacob's):** `ground.bin`/`ground.json`/`ground.colormap.png`/`scene.json`, `public/looks/index.json`, `public/looks/lafayette-square/design.json` (dev-server timestamp/auto-bake noise).
- **131 untracked** = `scratch/` (Linden tree arc) + `PIP.md`-adjacent — leave as-is (Jacob's instruction earlier).

## CANONICAL RE-BAKE (when trees change)
`/grove/bake?look=lafayette-square` (POST to arborist :3334) = generate-salon → bakeLook → bakeTrees, the full regenerate-from-source chain (applies Salon leaf scale/bark, repacks atlas, writes slab). A partial CLI bake skips generate-salon → stale geometry.
