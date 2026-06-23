# HANDOFF — per-context visibility-cull LODs (the real tree-weight fix)

> **Status: SCOPED, not built. 2026-06-23 EOD.** This is the dispatch-ready capture of a long design session. Start here next session. The arc it replaces (#5 "LoD swap") is built-but-moot — see "What's in the tree" below.

---

## THE WALL we hit (the problem this arc fixes)

Tree GLBs are **enormous and the decimation does not reduce them**:

```
ash_green     lod0=16M  lod1=16M  lod2=16M     ← all three byte-identical
oak_bur       lod0=16M  lod1=16M  lod2=10M
linden        lod0=16M  lod1=13M  lod2=8.6M
```

- **Root cause (confirmed, not a bug):** the connected-mesh **bark** is **UV-locked** for the atlas. `gltf-transform simplify` is attribute-aware (preserves UV seams so texturing survives), so it **cannot collapse the bark below ~127K tris** even at `ratio 0.010` (1%). The emit log shows `ratio 0.010 ✗bracket → still 127,155 tris`. lod0 and lod1 come out *identical* — both pinned at the floor. (This is the long-flagged **Brief 6.3-followup** gate — "the actual mobile-critical gate," deferred until now.)
- **Composition of a ~127K-tri tree:** bark ~82K (the heavy, un-simplifiable floor) + leaves ~44K (these *do* decimate fine).
- **Consequences:** the published `lod1` set is **1.7 GB**; the **Grove context-losses** (GPU OOM) loading ~10–50 of these 16MB / 127K-tri meshes → it shows a **stale frozen frame**, which is why Salon edits "don't show in the Grove"; the slab is huge; LS would struggle.
- **`simplifySloppy`** *can* get past the floor (crushes to ~1%) but **obliterates the atlas UVs** → only acceptable where you can't see the texture (far/overhead).

**Operator is skeptical of impostors (billboards). Hold them.** The strategy below uses *real geometry we'll never see deleted* — no fakes, no broken UVs.

---

## THE STRATEGY — bake-time, per-context VISIBILITY CULLING

**The cameras are on known/predetermined tracks, so at bake time we can compute the surfaces the camera will *never* see across the whole track, and delete them.** Classic fixed-camera PVS (potentially-visible-set) culling.

Why it's the right cut:
- **Sidesteps the UV-floor entirely** — we *delete* never-seen geometry instead of *simplifying* it. Kept geometry keeps its UVs and looks identical.
- **Lossless to the eye** — by definition you only cut what's never on screen. Beats impostors (no fakes) and sloppy (no broken textures).
- **The visibility oracle already exists**: `bake-trees.js#classifyHeroTiers` runs the **hero pan** (24 poses, fov 26°) for heroTier. Same poses = the visibility test.

### The three contexts (= the LsoD), each culled for its known camera

| Context | Camera | Geometry strategy |
|---|---|---|
| **Street** | free / walk-around | **ONE full-sized tree** (lod0 — the focal/near tree you stand beside) **+ the rest Hero-sized (lod1) + DoF-blurred in the background.** DoF hides that the background trees aren't full. So street loads 1 full + N hero + blur — NOT 50 full (that's what would OOM). *Per-instance: focal=full, background=hero.* |
| **Hero** | predetermined pan track | **Hero-sized (lod1) + PVS-cull against the hero pan** (delete back-faces / far-side / canopy-occluded trunk never seen across the 24 poses) **+ DoF.** "Size-managed" = managed against the known camera. |
| **Browse** | overhead / top-down | **Geometric trunk-cut**: the canopy occludes the trunk from above, so delete bark/wood prims below the canopy base; keep + aggressively decimate the leaf canopy (+ a stub for any branches poking past the canopy edge). No raycasting needed — pure geometric. The most aggressive context. |

**Magnitude:** a hero *pan* (not a full orbit) sees a limited arc → plausibly **40–60% cullable** (far side, back-faces, occluded trunk), on top of leaf decimation. Browse trunk-cut: ~127K→~15K tris (~8×), 16MB→~2MB.

### ⚠️ The one real design question — INSTANCING (decide before building Hero)
Visibility is **per-placement** (each tree sees the camera from its own angle), but LS instances by **(species, variant)** — one mesh, many positions. So:
- **Per-variant conservative cull** (union of visibility across that variant's placements) → preserves instancing, less aggressive. **Recommended default.**
- **Per-placement cull** → maximally aggressive, but each tree becomes a unique mesh → loses instancing → more draw calls + memory.

Browse's trunk-cut has NO instancing issue (pure geometric, per-variant). Street's focal-vs-background is per-instance by nature (only the focal tree is unique-full; the rest stay instanced hero).

---

## ROLE MODEL (operator, locked 2026-06-23)
- **Salon = the tweaking place.** Knobs live here. **Per-context knobs in ALL THREE views** (Street/Hero/Browse) — at minimum a **decimation/shrink/cull knob** per context, previewed live in that view. Browse can go hardest, but all three are tunable. The Salon authors *the tree AND its per-context weight.*
- **Grove = a cosmetic stop-off** to confirm everything looks good *together*. NOT an authoring surface → it does **not** need heavy Hero geometry; it can render a **light** LOD. (That's the real release: the Grove crash is fixed by rendering light, not by impostors.)

---

## BUILD ORDER (next session)
1. **Browse trunk-cut** — simple, geometric, biggest immediate win. Per-tree: find canopy base (leaf-prim bbox bottom), delete wood prims below it, keep+decimate the canopy. → light Browse LOD.
2. **Grove renders the light (Browse) LOD** + the quick partial: point the cosmetic Grove at `lod2` so it stops context-losing. → Grove finally shows edits.
3. **Hero PVS-cull** against the hero pan (the principled win) — **make the per-variant-vs-per-placement instancing call first.**
4. **Street** focal-full + background-hero + DoF-blur (per-instance focal selection + the DoF coupling).
5. **Per-context knobs** in the 3 Salon views, writing per-LOD cull/decimation targets into the composition → consumed by `publish-glb`.

---

## WHAT'S BUILT (committed)
- **Phase 1 (`15682e55`)** — `/grove/bake` regenerates-from-source (generate-salon all composed species) before bakeLook+bakeTrees. Closes the publish≠bake staleness gap. **Needs an arborist backend restart to be live.**
- **Doc correction (`f802cb95`)** — `ARCHITECTURE.md §Salon↔LS parity` reframed to as-built reality + the two daylight gaps + target; README/BACKLOG/NOTES in accord.

## WHAT'S IN THE TREE (uncommitted — HMR-live for frontend, per "don't fuss git yet")
- **Autosave (works, confirmed)** — `useArboristStore.js`: `_saveSalonDebounced` persists every Salon edit to compositions.json (no ✓ Adopt needed); flush-before-bake.
- **`salonUnpublished` tracking + `enterGrove`** — entering the Grove republishes edited species then loads (the "Publishing your Salon edits…" overlay in `Grove.jsx`). **Confirmed firing** (`[enterGrove] fired; pending=['ash_green']`) — but the Grove **context-losses on the heavy geometry before it can render the fresh result**, so edits still don't show. This is unblocked by the weight fix above, NOT by enterGrove.
- **Salon 3 context preset views** — `SpecimenViewport.jsx`: Street / Hero / Browse buttons (camera + bark tier per context). Default = Hero. *(Geometry-LOD in the preview still pending — couples to the cull work.)*
- **Bake carries lod0/1/2 per instance** — `bake-trees.js`: `instance.lods = {lod0,lod1,lod2}`. (Foundation; verified in slab.)
- **GeoTierDriver LOD-swap** — `InstancedTrees.jsx`: swaps geometry by camera context. ⚠️ **MOOT until LODs are actually light** (all LODs ≈ same weight today), and **risky** — street context would load heavy lod0 for every tree → same OOM. Don't lean on it until the cull lands; consider gating it off.
- **🧹 DEBUG console.logs** in `useArboristStore.js` (`[autosave] saved + marked unpublished…`, `[enterGrove] fired…`) — **REMOVE next session.**

## KNOWN ISSUES / NOT DONE
- **Grove context-loss on heavy geometry** = THE blocker. Fixed by the weight cut, not by enterGrove or DoF (DoF blurs the frame; geometry is still uploaded — it can't fix GPU OOM).
- Quick Grove→lod2 partial: **not done** (offered, deferred to do alongside the cut).
- Lazy-load: discussed, **rejected** in favor of light geometry (a cosmetic "forest at a glance" can't paginate; needs light trees).
- Night-emissive (parked): green-at-night = **hardcoded lights ignoring every knob** (`CelestialBodies.jsx:1219` white ambient 0.45 + `:1236` fill 0.06 + `:1203` hemi-floor 0.20 ≈ 0.51 un-zeroable). Fix = ramp those to 0 on `nightFactor`. Separate small arc.

---

## DON'T RE-DERIVE
- The decimation floor is **fundamental** (UV-lock), not a tuning problem. Don't burn time re-tuning brackets/ratios — `ratio 0.010` already fails. The answer is **cut (delete never-seen), not simplify.**
- **Impostors are held** (operator skeptical) — visibility-cull of real geometry is the chosen path.
- **DoF is the cover, not the cut** — it can't fix GPU memory; it lets you *ship* aggressively-cut far/background geometry whose reduction the blur hides. Cut first, blur second.
