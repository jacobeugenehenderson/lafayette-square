> ## 🗄️ ARCHIVED 2026-06-25 — SUPERSEDED (kept for the doctrine + the cull-oracle).
> The "16MB wall / decimation floor" was fixed at the source — it was **flat normals**, not the UV-lock this doc assumed (the ⚡ CORRECTION banner below already flags it). The smooth-normals + weld + simplify fix landed + rolled out library-wide (`BATON-tree-weight-smooth-normals-2026-06-24.md`). The **per-context Street/Hero/Browse-LOD cull strategy + GeoTierDriver** are **SUPERSEDED** by role-at-bake (`BATON-tree-render-next.md`, root): geometry = a per-placement role decided at bake, depth gauges own visual distance, GeoTierDriver retired. Trees currently **ship ALL-MESH** (`PROM_THRESHOLD=0`); the impostor render is parked. **What survives:** the top "🧭 CONFIRMED DOCTRINE" callout (still the frame, also in `arborist/ARCHITECTURE.md`) + the cull-oracle (`classifyHeroTiers`, occlusion cull) which the future impostor arc reuses.

---

# HANDOFF — per-context visibility-cull LODs (the real tree-weight fix)

> ## 🧭 CONFIRMED DOCTRINE (2026-06-24, Jacob) — the two axes are SEPARATE
> **0. CAPSTONE: optical PARITY is the invariant; DETAIL is the only variable.** The setup assumes everything is on — the optical pipeline (depth gauges, DoF, fog, post) is uniform everywhere; across contexts/devices/tiers the only thing that changes is *how much detail*. ⛔ Never fork/disable the optics by context/device (mobile≠desktop is a detail *bracket*, not an on/off fork — "tier ladder ≡ blur pyramid"). Impostors are safe because they ride full parity (a billboard still gets DoF'd/fogged). The product is judged with everything ON (evaluating with blur off is off-parity). Points 1–3 are this principle applied to tree geometry:
> 1. **Geometry representation = a per-placement ROLE decided at BAKE** (park/focal → real-geometry LODs; environment/neighborhood-fill + far/occluded park → **impostor**). The 4-tier ladder is **lod0 / lod1 / lod2 / impostor**. Oracle exists: `bake-trees.js#classifyHeroTiers` (mesh|impostor|cull, against the known camera tracks).
> 2. **Visual distance = the DEPTH GAUGES, which already own it** — DoF (CoC by depth) + fog/mist fade by depth. "How far a tree *looks*" (recede/soften/blur) is already a wired runtime signal. **DoF is the cover, not the cut.**
> 3. ⛔ **Do NOT swap geometry by live camera distance/altitude** ("asking for trouble" — popping, crude proxy, unbakeable runtime state, and it re-litigates distance the depth gauges already own). **RETIRE the runtime `GeoTierDriver` altitude-swap** (`InstancedTrees.jsx`) rather than extend it. Decide geometry once (bake/role); let the gauges handle the look.
> 4. Unbuilt piece = the impostor **render** (billboard geo/material); the classifier + the per-instance `aHeroTier` attribute are already plumbed (today only a QC tint). Park focal trees stay real geometry — no fakes where you stand. *(This supersedes the old "operator skeptical of impostors / hold them" stance below.)*

> ## ⚡ CORRECTION — READ THIS BEFORE THE 30-SECOND VERSION (2026-06-24)
> **Cut A ("re-UV + re-bake + decimate") is SUPERSEDED — do NOT build it.** The
> bark wall is **NOT** UV-lock; it's **FLAT NORMALS** — per-face normals split the
> bark into a triangle-soup with no shared edges, so the texture-safe `simplify`
> no-ops (byte-identical output = the "127K floor"). **The real fix is far
> simpler: smooth-normals + weld + simplify** — no re-UV, no re-bake, no
> `xatlas`, no render-to-texture. Proven + measured: `82,822 → 20,130 → 1,001`
> tris; full tree **16.2 MB×3 → 5.5 / 2.2 / 1.1 MB** real LOD ladder. Repro:
> `scratch/LINDEN-*.mjs`. Memory: `tree-weight-wall-is-flat-normals`.
> **Cut B (visibility culling) is still valid — but as a LATER topping on the
> smooth-normals base, not the first move.** Everything below that calls Cut A
> "the universal base" or says "DO FIRST: prove the re-UV step" is the OLD
> (wrong) diagnosis — kept only for the cull-strategy half (Cut B + the
> three-context map). ▶ Start from `BATON-tree-weight-smooth-normals-2026-06-24.md`.

> ## ▶ NEW AGENT — START HERE (the 30-second version)
> **You're picking up the Arborist tree-weight fix.** Route first: `ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → this doc.
> - **The problem:** tree GLBs are **16MB and decimation can't shrink them** — the connected-mesh bark is UV-locked for the atlas, so `simplify` floors at ~127K tris (lod0=lod1 identical). The **Grove crashes the GPU (context lost)** loading them → that's why Salon edits "don't show in the Grove."
> - **The strategy (don't re-derive — operator-designed, locked): TWO complementary cuts.** (1) **Re-UV + re-bake + decimate** the bark — re-distribute the texture onto *fewer, larger UV islands* so the careful (texture-safe) simplifier can actually reduce it (today it's blocked by seam-walls; proof it's the seams not the geometry: `simplifySloppy` ignores UVs and crushes the same bark to ~1 tri). This makes the mesh light at **every** angle, incl. the free Street camera. (2) **Visibility culling** — delete the surfaces the *known* camera tracks (Browse overhead, the Hero pan) never see. **You need BOTH:** culling removes ~half (the never-seen back); re-UV+decimate shrinks the half that survives. **Impostors HELD** (operator skeptical). **DoF is the cover, not the cut.**
> - **DO FIRST — prove the re-UV step (the load-bearing unknown):** prototype on **`ash_green`** (a 16MB offender) — re-unwrap its bark with fewer seams (e.g. `xatlas`), **re-bake the bark texture into the new layout** (the catch: moving UVs invalidates the old atlas image), run the normal simplifier, and **measure two things: how few tris it reaches, and does the bark still look good (operator's eye).** If it works, it's the universal base; then layer the cuts. (After that: the **Browse trunk-cut** + point the cosmetic Grove at the light LOD so it stops crashing.) Build order + three-context map + instancing question below.
> - **Gotchas:** Phase 1 (`/grove/bake` regenerate) needs an **arborist backend restart** to be live. The `GeoTierDriver` in `InstancedTrees.jsx` is **moot + risky** until LODs are light (gate it off / supersede). **The operator's eye is the gate** — verify in the lit app, never a proxy.

> **Status: SCOPED, not built. 2026-06-23 EOD.** This is the dispatch-ready capture of a long design session. The arc it replaces (#5 "LoD swap") is built-but-moot — see "What's in the tree" below.

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

**⚡ DOCTRINE REFINED (2026-06-24, operator) — impostors are NOW sanctioned, scoped + by-role.** The old "operator skeptical of impostors, hold them" was a *scoping* answer, not a no: impostors are wrong for the **park / focal trees** (you orbit them up close — billboards would show), but **right for the environment / neighborhood-fill trees** (future street trees everywhere) + far/occluded park trees (never the subject, ~always distant). So the ladder becomes **lod0 / lod1 / lod2 / impostor**, impostor the final/cheapest tier for fill. ⛔ **Assign representation by PER-PLACEMENT ROLE at BAKE, against the known camera tracks — NOT by a live camera-distance/altitude swap** (operator: "doing it by camera distance is asking for trouble" — popping, crude altitude proxy, runtime state you can't bake-validate). The role oracle already exists: `bake-trees.js#classifyHeroTiers` tags each placement `mesh|impostor|cull` from the hero pan (561/184 today). **The runtime `GeoTierDriver` altitude-swap (`InstancedTrees.jsx`) is the thing to RETIRE, not extend** (already flagged moot). The impostor *render* (billboard geometry/material) is the unbuilt piece — the classifier + the per-instance `aHeroTier` attribute are already plumbed (today they only drive a QC tint). **Park focal trees stay real geometry — no fakes where you stand.**

*(Superseded note, kept for context:)* ~~Operator is skeptical of impostors (billboards). Hold them.~~ The real-geometry cull (Cut B) is still the path for the **park** trees; impostors are the path for the **environment** trees.

---

## THE STRATEGY — TWO complementary cuts (operator: "we need both")

Culling the *backs* of trees only removes ~50%; the front half you DO see is still the seam-locked heavy mesh. So:

### Cut A — RE-UV + RE-BAKE + DECIMATE (the universal base; makes the mesh light at EVERY angle)
The bark floors at ~127K because the *texture-safe* simplifier won't merge across UV seams, and the bark has seams everywhere. **Proof the seams (not the geometry) are the wall: `simplifySloppy` ignores UVs and crushes the same bark to ~1 tri.** So the fix is to **re-distribute the bark onto fewer, larger UV islands**, then the *careful* simplifier can reduce it hard *without* scrambling the texture:
1. **Re-unwrap** the bark mesh with fewer seams (`xatlas` or similar).
2. **Re-bake** the bark appearance from the old UVs into the new layout (the catch — moving UVs invalidates the old atlas image; this is a render-to-texture step, and where quality can slip).
3. **Decimate** with the normal (texture-safe) simplifier — now it can actually drop.
**Tradeoffs:** possible loss of bark *tiling* detail (fewer seams ⇒ less repeat; mitigate with higher bake res); re-UVing *into the shared master atlas* (load-bearing for Bloom's single program) is fiddly. **Helps the free Street camera — the one culling can't.** **Prototype on `ash_green` first** and measure tris + eyeball the bark before committing the pipeline.

### Cut B — VISIBILITY CULLING (the per-context topping; delete what the known cameras never see)

**The cameras are on known/predetermined tracks, so at bake time we can compute the surfaces the camera will *never* see across the whole track, and delete them.** Classic fixed-camera PVS (potentially-visible-set) culling. Layers *on top of* Cut A: 127K → re-UV+decimate to ~15–30K → cull never-seen → lower still.

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
0. **Re-UV PROTOTYPE on `ash_green`** (Cut A, the load-bearing unknown) — re-unwrap bark (fewer seams) → re-bake the bark texture into the new layout → normal simplify → **measure final tris + eyeball the bark.** This decides whether Cut A is the foundation. Don't build the pipeline until it's proven on one species.
1. **Re-UV pipeline pass** — if (0) works, apply it to the connected-mesh species in `publish-glb` so every LOD is genuinely light at all angles. This alone may get most of the way; it's the base the cuts sit on.
2. **Browse trunk-cut** (Cut B, simplest) — per-tree: find canopy base (leaf-prim bbox bottom), delete wood prims below it, keep+decimate the canopy. → light Browse LOD on top of the lighter base.
3. **Grove renders the light LOD** + the quick partial: point the cosmetic Grove at `lod2` so it stops context-losing. → Grove finally shows edits.
4. **Hero PVS-cull** against the hero pan (Cut B, principled) — **make the per-variant-vs-per-placement instancing call first.**
5. **Street** focal-full + background-hero + DoF-blur (per-instance focal selection + DoF coupling) — feasible because Cut A made the base mesh light.
6. **Per-context knobs** in the 3 Salon views, writing per-LOD cut/decimation targets into the composition → consumed by `publish-glb`.

---

## WHAT'S BUILT (committed)
- **Phase 1 (`15682e55`)** — `/grove/bake` regenerates-from-source (generate-salon all composed species) before bakeLook+bakeTrees. Closes the publish≠bake staleness gap. **Needs an arborist backend restart to be live.**
- **Doc correction (`f802cb95`)** — `ARCHITECTURE.md §Salon↔LS parity` reframed to as-built reality + the two daylight gaps + target; README/BACKLOG/NOTES in accord.

## WHAT'S BUILT (committed `19ff5c42` — WIP checkpoint, debug logs removed)
- **Autosave (works, confirmed)** — `useArboristStore.js`: `_saveSalonDebounced` persists every Salon edit to compositions.json (no ✓ Adopt needed); flush-before-bake.
- **`salonUnpublished` tracking + `enterGrove`** — entering the Grove republishes edited species then loads (the "Publishing your Salon edits…" overlay in `Grove.jsx`). **Confirmed firing** (`[enterGrove] fired; pending=['ash_green']`) — but the Grove **context-losses on the heavy geometry before it can render the fresh result**, so edits still don't show. This is unblocked by the weight fix above, NOT by enterGrove.
- **Salon 3 context preset views** — `SpecimenViewport.jsx`: Street / Hero / Browse buttons (camera + bark tier per context). Default = Hero. *(Geometry-LOD in the preview still pending — couples to the cull work.)*
- **Bake carries lod0/1/2 per instance** — `bake-trees.js`: `instance.lods = {lod0,lod1,lod2}`. (Foundation; verified in slab.)
- **GeoTierDriver LOD-swap** — `InstancedTrees.jsx`: swaps geometry by camera context. ⚠️ **MOOT until LODs are actually light** (all LODs ≈ same weight today), and **risky** — street context would load heavy lod0 for every tree → same OOM. Don't lean on it until the cull lands; consider gating it off.
- *(Debug console.logs removed before the `19ff5c42` commit.)*

## KNOWN ISSUES / NOT DONE
- **Grove context-loss on heavy geometry** = THE blocker. Fixed by the weight cut, not by enterGrove or DoF (DoF blurs the frame; geometry is still uploaded — it can't fix GPU OOM).
- Quick Grove→lod2 partial: **not done** (offered, deferred to do alongside the cut).
- Lazy-load: discussed, **rejected** in favor of light geometry (a cosmetic "forest at a glance" can't paginate; needs light trees).
- Night-emissive (parked): green-at-night = **hardcoded lights ignoring every knob** (`CelestialBodies.jsx:1219` white ambient 0.45 + `:1236` fill 0.06 + `:1203` hemi-floor 0.20 ≈ 0.51 un-zeroable). Fix = ramp those to 0 on `nightFactor`. Separate small arc.

---

## DON'T RE-DERIVE
- The decimation floor is **fundamental** (UV-lock), not a tuning problem. Don't burn time re-tuning brackets/ratios — `ratio 0.010` already fails. The answer is **(A) re-UV the bark so the simplifier *can* reduce + (B) cut what the camera never sees — BOTH, not bracket-tuning.** Culling alone leaves ~50%; re-UV alone misses the never-seen savings.
- **Impostors are held** (operator skeptical) — visibility-cull of real geometry is the chosen path.
- **DoF is the cover, not the cut** — it can't fix GPU memory; it lets you *ship* aggressively-cut far/background geometry whose reduction the blur hides. Cut first, blur second.
