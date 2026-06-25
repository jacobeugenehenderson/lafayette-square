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

## ⭐ ARC-2 STANDUP DECISIONS (2026-06-25, with Jacob) — build to these

**Interim LANDED this session (`0fc1e126`):** `GeoTierDriver` (the runtime camera-altitude LOD swap) is RETIRED. Geometry is now chosen by baked role via a `lodForRole(inst)` hook in `InstancedTrees.jsx` (keyed on `heroTier`); INTERIM every role → lod1 (full trunk). **That hook is the seam for this arc:** `impostor → billboard`, `cull → drop`. lod2 (cut-trunk browse tier) is no longer rendered; leave the cut as-is (moot once impostors land — Jacob: "if we get good impostors we definitely skip cutting off trunks"). Root-cause forensic: `TREE-GROUND-ELEVATION-FORENSIC.md`.

**Build TWO impostors together (they differ by viewing hemisphere):**
- **Hero impostor** — viewed ~horizontally at distance. Preserve silhouette from any azimuth → **octahedral / hemi-octahedral multi-view** atlas (sample nearest captured view as the camera orbits; wrong silhouette = the #1 tell).
- **Browse impostor** — viewed top-down. Jacob's **"cake layers":** N horizontal canopy slabs stacked → real vertical **motion parallax** from above (a flat card can't). Each layer **hulas** (low-freq rotation about the canopy's vertical axis, phase-offset per layer) **+ a higher-freq waveform jitter** on top (the "alive/shimmer" quality).

**The impostor is the WHOLE tree as stamped 2D layers, not a 3D-trunk/2D-canopy hybrid (Jacob, 2026-06-25).** Trunk card(s) + branch layers + canopy slabs are ALL stamped 2D, hula-ing together but **anchored at the base** (sway grows with height; base stays planted, like real wood). Mesh-role trees keep real 3D geometry; only impostor-role goes fully-stamped. One coherent technique.

**Season-aware capture — winter is the forcing function (Jacob, 2026-06-25).** A deciduous tree in winter drops its leaves → **bare branch structure**. A canopy-only impostor would vanish or ghost. So the impostor MUST carry the woody silhouette (this is *why* trunk/branches are stamped, above), and the capture is **season-parameterized**: min a **summer** state (full canopy layers) + a **winter** state (bare branch layers, no foliage); spring/fall = density + the recolor LUT between them. Browse-overhead in winter = the radial bare-branch pattern; Hero-octahedral = the bare silhouette per angle. Hooks into the existing `leaf.season` rubric + posterize/season recolor + the meteorologist season state (same wind drives the hula). ⚠️ **Winter is a whole-system concern** — the real 3D mesh trees also need to go bare (hide leaf cards, expose branches, recolor bark); design the impostor capture season-parameterized from the start so it can't paint that into a corner, even if summer ships first.

**Wind = the real weather, shared.** Impostor sway/hula/jitter is driven by the SAME uniforms as real trees — `treeSwayUniforms` (`uWindForce`/`uWindIntensity`/`uGust*`) fed by `resolveWindState(meteorologist directive)` in `SwayDriver`. The whole forest (mesh + impostor) moves as one weather system; amplitude scales with `uWindIntensity`. NO separate wind.

**Make impostors "as good as possible back there" (Jacob's 3A), prioritized for LS:**
1. **Bake the impostor FROM the real lod0 geometry + the same atlas leaves** — color/character/season match the near trees exactly; no separate art, no material pop.
2. **Normal map, not just color** (must-have for LS) — relights with the sun/moon/TOD (day→night planetarium) instead of going flat.
3. **Octahedral multi-view** (Hero) for azimuth-stable silhouette.
4. **Ride full optical parity** — same DoF/fog/bloom/grade as real geo (capstone invariant; "DoF is the cover").
5. **Season/posterize match** — same front/back/season LUT as near trees.
6. **Alpha-tested cutout, single shader program** — matches near-foliage edges, Bloom-stable.

**Browse gets its OWN role oracle.** `classifyHeroTiers` classifies from the HERO camera tracks; what's prominent *overhead* ≠ what's prominent in hero. Build a Browse oracle (an overhead/orbit pose set) so the browse view picks mesh-vs-impostor by what's actually seen from above — don't inherit hero's roles for browse.

**Occlusion is a first-class, DISTANCE-INDEPENDENT impostor/cull trigger (Jacob, 2026-06-25).** A tree hidden behind another tree's canopy wastes detail regardless of camera range — a *near* tree fully behind another near canopy is as much an impostor as a far one. This is now reliable *because trees are botanically sized* (`bac11a43`): a 25m oak genuinely occludes what's behind it; the old uniform-12m trees under-counted occlusion. **Already half-built:** `classifyHeroTiers` (`bake-trees.js:360-372`) computes per-pose occlusion by *nearer* canopy disks (`circleCoverFrac`, `OCC_FRAC=0.7`) → an occluded canopy stops accumulating prominence → tagged `impostor`. **The gap to close:** a tree occluded (≥OCC_FRAC) in **every** in-frustum pose should route to **`cull`** (drop), not `impostor` — that's the "specks behind specks in the back" Jacob flagged: the rear speck is always occluded by the front one, so it's pure clutter. Apply the same occlusion-→cull logic in the Browse oracle (overhead occlusion differs from hero).

**Dispatch:** fresh agent, **foreground** (background writes get denied — [[feedback_dispatched_subagents_cannot_write_in_background]]), or a dedicated next session. Boz did the interim (Option 1); this arc (Option 2) is the fresh build.

## CANONICAL RE-BAKE (when trees change)
`/grove/bake?look=lafayette-square` (POST to arborist :3334) = generate-salon → bakeLook → bakeTrees, the full regenerate-from-source chain (applies Salon leaf scale/bark, repacks atlas, writes slab). A partial CLI bake skips generate-salon → stale geometry.
