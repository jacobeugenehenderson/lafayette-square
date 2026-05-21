# Handoff — Tree Builder & Articulated-Blank Doctrine

**Date:** 2026-05-21 (evening session)
**Status:** Doctrine landed + dry-swap proven + tomorrow's chunk scoped
**Re-entry:** read this file end-to-end; then `arborist/NOTES.md` for any cross-references; then start at "Tomorrow's chunk" below.

---

## TL;DR

Tonight we landed the **articulated-blank doctrine** for trees and proved it works with a dry leaf-swap experiment. The Sugar Maple leaves from our `LeafSet010` pack dropped cleanly onto the vendor's existing card geometry — visually beautiful. The architecture for a full **Tree Builder** ("Fashion Plates for trees") is now clear:

> A tree is a *recipe* binding `{silhouette_blank, bark_primitive, bark_tint, leaf_species, jitter_seed, age, health}` — composed from finite kit-level libraries of platonics, baked into one scene-specific atlas, drawn in one instanced batch.

Tomorrow's chunk: **swap the whole grove + build out the Tree Builder UI**.

---

## The doctrine in one page

**Three independent libraries compose any tree:**

1. **Silhouette platonics** (~8–12 archetypes for an urban park kit)
   - columnar / fastigiate, pyramidal / conical, **oval / ovate**, rounded / globose,
     **vase**, **spreading / horizontal**, weeping, irregular / picturesque,
     multi-stem / clumping
   - 3 already in hand from the **maple-trees-pack** (different silhouettes — likely oval/spreading/young-oval; need visual confirmation)

2. **Bark platonics** (6 cover the urban-park set)
   - smooth (beech, young maples), furrowed (oak, mature maple, ash), plated (cherry, persimmon),
     scaly (pine, hickory), exfoliating (sycamore, birch), fibrous (juniper, redwood)
   - **One master shader** parameterized by `{groove_depth, plate_size, scale_frequency, exfoliation_density, tint, normal_intensity}` covers all six. Triplanar-projected for mobile — no per-tree UV authoring needed.

3. **Leaf species** (the asset library — see "Inventory" below)
   - First-class noun in the kit. Each species carries cards / atlas membership + phenology curves (year-long doctrine already exists) + cluster grammar.

**A species = a recipe binding ingredients from the three libraries.** Sugar Maple, Silver Maple, "Lafayette Square's signature street tree" are all just preset bindings. Operators author new species by composing new bindings against the same pantry.

**The arborist bakes one atlas per scene** (NOT kit-static): walks the scene's tree placements, collects the `(bark_id, leaf_species_id)` set actually used, packs only those slices at the LoD tiers the scene's views need (per [[project_view_aware_baking]]). One PNG/KTX2 + a slim `species_x → atlas_uv_rect` JSON. Runtime: every tree in the park is one `InstancedMesh` per blank, all sampling the same atlas — **one draw call, one texture bind, whole park**.

**Overdraw is solved structurally** by canopy-depth shading (see "Canopy-depth doctrine" below) — interior cards render opaque + dark + matte (early-Z culls them), only the outer 2 layers are translucent. O(canopy_thickness) instead of O(leaf_count).

---

## Tonight's wins

### 1. Maple-trees-pack inspected — perfect for articulated-blank

Location: `botanica/trees/forest-pack/maple-trees-pack/`

- 3 trees with **noticeably different silhouettes** (Tree_01 is 38% denser than Tree_02 — likely different platonics, not jitter variants)
- Two materials only: `Bark_Maple-Tree` (diffuse + normal) + `Leaf_Maple-Tree` (diffuse + diffuse2 + normal)
- Each tree is one mesh with two primitives (one per material) → **leaf strip is `delete primitive 0` — 3-line script, no DCC**
- Source authored in Blender (path leak: `D:\sSs\Blender\projects\ForSell\Maple Trees\Files\`) — `.blend` available for fidelity-preserving authoring
- Polycounts: 166k–208k bark tris (very dense — 10–40× decimation headroom for LoDs), 111k–177k leaf tris

**Caveat: the vendor's "Maple" pack is really Japanese Maple (Acer palmatum) — deep lobes, pointy serrations.** Our `LeafSet010` is the actual Sugar Maple shape. Swapping leaves isn't just upgrading resolution — it's a **species correction**.

### 2. Vendor UV layout = ideal case

Every leaf card has `du=1.0, dv=1.0` (UV-spans the entire texture). The 8×8 histogram shows only 2–4 of 64 bins used (corners). Conclusion: **each quad card displays the whole leaf texture**. So texture swap is geometric drop-in: replace the diffuse, every card now shows our atlas.

### 3. Dry leaf-swap wired

**Files touched:**
- `public/textures/leaves/sugar_maple_single.png` (new — 1024² Sugar Maple from LeafSet010, alpha-tight, centered)
- `src/arborist/SpecimenViewport.jsx`:
  - Module-level texture loader (`SUGAR_MAPLE_LEAF_URL` via `BASE_URL`, lazy `getSugarMapleLeafTex()`)
  - Material traversal detects leaf side via `atlasKind === 'leaf'` OR `/leaf/i` material-name fallback
  - Swaps `m.map` + sets `transparent + alphaTest 0.5 + DoubleSide`, idempotent via `userData.__leafSwapped`

**Current scope: GLOBAL.** Fires on every leaf-tagged material in every species. Fine for dry test; needs scoping via species recipe before production (see "Tomorrow" below).

**Visually:** "so pretty. Dang." (operator quote)

### 4. Inventory of what we have vs what's missing

#### Leaf packs in hand (`assets/botanical-reference-hires/`)

| Pack | Morphology | Species | PBR set |
|---|---|---|---|
| LeafSet001 | serrate ovate | Elm, Hornbeam | Color + Opacity + Normal + Roughness + Displacement @ 4K |
| LeafSet004 | heart | Redbud, Lilac | same |
| LeafSet005 | ovate small | branchlet broadleaves | same |
| LeafSet007 | serrate ovate (autumn) | Elm autumn variant | same |
| **LeafSet010** | **palmate** | **Sycamore, Sugar Maple, Red Maple** ✓ tonight | same |
| LeafSet012 | lobed (autumn) | Oak autumn variant | same |
| LeafSet013 | narrow | Willow | same |
| LeafSet016 | lobed | White Oak | same |
| LeafSet019 | long needle | Pine | same |
| Leaf001 | ovate large | Mulberry, Hydrangea | same |

**That's 10 packs covering ~7 broadleaf species + 1 conifer at 4K PBR-grade.** This is the resource the user means by "we have so much."

#### Coverage gaps (explicit in `arborist/leaf-pack-bindings.json` → `coverageGaps`)

| Gap | Species blocked |
|---|---|
| `fan` | **Ginkgo** — known DC park species, likely load-bearing for Lafayette Square |
| `fine_compound` | Honey Locust |
| `palmate_compound` | Buckeye |
| `tulip` | Tuliptree |
| `compound` | Ash, Walnut |
| `short_needle` | Spruce, Holly |
| `scale` | Juniper, Cypress, Bald Cypress |

**`public/textures/leaves/*.png` placeholders exist** (fan.png, compound.png, etc.) but they're sparse procedural stand-ins — NOT real botanical assets. Visible in the screenshot inspection tonight.

#### Tree blank candidates

- **3 articulated blanks ready** from `maple-trees-pack` (after publish through `publish-glb.js`)
- Existing `public/trees/acer_saccharum_multistem/` is a DIFFERENT vendor model (`sugar-maple/2190776-gltf-extended.glb`) — already published with 2 variants × 3 LoDs. Probably becomes an additional oval blank or gets retired in favor of the new pack.

---

## Canopy-depth doctrine (the overdraw solution)

The user proposed it; it's the right architecture. Capturing here so it ships into the design properly.

**The problem:** Today every leaf card draws alpha-blended → 100 overlapping cards = 100× fragment cost. This is the actual mobile killer.

**The solution:** Bake a per-vertex `aCanopyDepth ∈ [0,1]` attribute at publish time. Runtime shader uses it to:

- **Interior cards (depth > ~0.2):** opaque, alpha-test (A2C), darkened toward an interior color, roughness scaled up to matte. **Early-Z culls** subsequent interior overdraw. Overdraw collapses to O(canopy_thickness).
- **Outer 2 layers (depth ≈ 0–0.2):** true translucency, alpha-blend. Only ~10–20% of total cards. Overdraw budget shrinks 5–10×.

**Bonus:** the dark-matte interior visually *hides* the lower-quality alpha-test cards. No one notices the rendering trick — they just see a canopy with real depth.

**Implementation sequence:**

| Step | Where | What |
|---|---|---|
| 1 | `arborist/publish-glb.js` | After loading leaf prim positions, compute convex hull (or bounding ellipsoid) of card centers. Per card vertex: `aCanopyDepth = inward distance / max_inward`. Stamp as vertex attribute. ~50 LOC. |
| 2 | `src/arborist/SpecimenViewport.jsx` leaf shader patch | Read `aCanopyDepth`, varying to fragment. `color = mix(leafColor, interiorColor, depth)`; `roughness = mix(0.4, 0.9, depth)`; outer-shell alpha = `1.0 - smoothstep(0.0, 0.15, depth) * 0.6`. |
| 3 | Two-pass render | Interior pass first (opaque, depth-write, A2C); outer-shell pass second (depth-test only, alpha-blend). Three.js: `renderOrder` + `depthWrite` per material. |
| 4 | Tunable knobs | Depth threshold for outer band (0.10–0.20), interior color (per-species — new `canopy.interior` field in `species-map.json`), matte rolloff curve. Operator-facing in tune panel. |

**Proof-of-concept shortcut** (for tomorrow's first visual): fake `aCanopyDepth` at runtime from `y` normalized to canopy bounds, before doing the real bake. Lets you see whether the shader math reads right before committing to the bake-time pass.

---

## Bones vs no-bones (decided)

The maple pack has **no bones, no skins, no animations** — just static meshes with position/normal/UV/color.

**We don't need bones.** Two cheap per-vertex attributes do everything we need:

| Attribute | What | Used for |
|---|---|---|
| `aBranchId` (uint8) | Flood-fill label of which branch this vertex belongs to | Per-instance branch pruning (hash `branchId + instanceSeed` → degenerate triangle) |
| `aHierarchyDepth` (float ∈ [0,1]) | Geodesic distance from trunk base, normalized | Branch-aware wind sway (depth → amplitude), free-form lattice deformation that respects topology, canopy-depth attribute inheritance for leaf cards |

**Repurpose `lil_vera_v2.py` / `bidirectional_skeleton.py`** — these already implement mean-curvature contraction + branch-endpoint detection for LiDAR point clouds. Same algorithms work on mesh input (vertex positions instead of point cloud). Days of adaptation, not weeks. Per [[project_lidar_as_training_data]] this also reactivates the shelved Li'l Vera work in a new direction.

**Skipping bones saves:** the artist commission for rigging, the runtime skinning cost, and the per-vertex bone-weight storage. Wins all around.

---

## Tomorrow's chunk

### Goal
1. Publish the 3 maple-pack blanks into the species pipeline (`acer_saccharum_blank_01/02/03` or similar)
2. Bark lighten (the deferred half of "photo-real Sugar Maple")
3. Swap the whole grove — wire per-species leaf-pack binding so each species pulls its correct pack instead of the hardcoded Sugar Maple global
4. Begin Tree Builder UI — at minimum a recipe editor that composes `{blank, bark, leaf}` and previews in `SpecimenViewport`
5. Plan view of all species (`Grove.jsx` top-down) — the "kit inventory" check

### Recommended sequence

| Step | Effort | Why this order |
|---|---|---|
| **A. Bark lighten** | ~30 min | Trivial extension of tonight's shader patch. `uBarkTint` uniform on non-leaf materials, reads `species.bark.trunk.tintBase` from `species-map.json` (the field already exists, just unwired). Completes the "photo-real Sugar Maple" experiment from tonight. |
| **B. Per-species leaf-pack binding** | ~1 hr | Replace tonight's global `getSugarMapleLeafTex()` with a `getLeafTexForSpecies(speciesId)` that consults `leaf-pack-bindings.json` → `speciesOverrides` + `morphologyToPacks`. Caches per-species. Pre-extract a single-leaf variant from each pack into `public/textures/leaves/<packId>_single.png` (or compose a small cluster — see "Open question" below). |
| **C. Publish maple-pack** | ~1–2 hr | Extend `arborist/publish-glb.js` to handle the 3-tree multi-node case (one source GLB → three specimens). Each becomes its own blank with its own LoD chain. May need to add an "articulated blank" concept to the species schema (a blank is not a species — it's a recipe ingredient). |
| **D. Grove swap visual check** | ~30 min | Open `Grove.jsx`, configure top-down camera, verify every species shows correct leaves + reasonable bark tint. Catch any regressions. |
| **E. Tree Builder UI v0** | ~2–3 hr | New workstage (peer to `LidarWorkstage`, `ProceduralWorkstage`). Three dropdowns: silhouette, bark, leaf species. Live preview. "Save as new species" button writes to `species-map.json`. Live preview reuses `SpecimenViewport`. |
| **F. Canopy-depth proof-of-concept** | ~1 hr | Fake `aCanopyDepth` from `y`-normalized in shader, demo the depth-attenuated dark-interior look. NOT the real bake yet — just visual proof to commit to the architecture. |

**Order rationale:** A unblocks the "photo-real Sugar Maple" reveal that justifies the whole thing. B–D land the grove swap visibly. E is the conceptual chunk the user named as the day's headline. F is gravy if there's time.

### What to defer (BACKLOG candidates)

- Real canopy-depth bake-time pass (after F proves shader is right)
- Per-vertex `aBranchId` + `aHierarchyDepth` (mesh analysis pass; reuses `lil_vera_v2.py` algorithms)
- Bark-shader procedural (one master shader, 6 platonics by parameter)
- Sourcing ginkgo + honeylocust + tuliptree leaf assets (3 separate $5–30 purchases on CGTrader or 30-min phone-camera shoots — current season is right for both)
- LoD pipeline via `meshoptimizer` (the bark prim's 200k-tri source has 10–40× headroom)
- Scene atlas baker (walks scene's species bindings, packs scene-tight atlas)
- Per-instance jitter stack (lean / prune mask / non-uniform scale / phenology offset / bark hue jitter)

### Open question to resolve before B

**Does the "single leaf per card" pattern hold up at canopy density, or do we need cluster cards?** Tonight's single-leaf swap means each vendor card shows ONE Sugar Maple leaf. The vendor authored ~22k cards per tree — so we get a 22k-leaf canopy, which is fine if leaf shape reads at distance. If it looks sparse or "polka-dotted," the next iteration is composing a 3–5 leaf cluster atlas per species (a sprig per card) to match real-foliage density patterns. **Visual inspection tomorrow tells us which way to go.** Cluster atlas adds ~30 min of compositing per species.

---

## Files & artifacts

**Tonight's actual changes** (uncommitted as of this writing):

- ✏️ `src/arborist/SpecimenViewport.jsx` — module-level leaf texture + in-loop swap (~25 LOC added)
- 📄 `public/textures/leaves/sugar_maple_single.png` (new, 1024²)
- 📄 this file

**Read-only inspection** (no changes):

- `botanica/trees/forest-pack/maple-trees-pack/_unpacked/` — extracted GLB + textures (gitignored or quarantineable; keep for tomorrow)
- `assets/botanical-reference-hires/README.txt` — pack→morphology inventory (10 packs)
- `arborist/leaf-pack-bindings.json` — morphology→pack table + coverage gaps
- `arborist/species-map.json` — species roster (3 maples already declared; bark tint fields exist but unwired)

**Pointers to existing doctrine** (don't re-read in full unless needed):

- `arborist/NOTES.md` — load-bearing arborist architecture record (Phase F, G, year-long manifest)
- `arborist/BACKLOG.md` — current backlog
- `arborist/ARCHITECTURE.md` — file/data-flow contracts
- `arborist/FEATURES.md` — product role definitions

---

## Re-entry checklist

When picking this up tomorrow morning:

1. Read this file end-to-end (~10 min)
2. Skim `arborist/NOTES.md` headings for any in-flight phase that overlaps
3. Open Arborist locally, click into an existing Sugar Maple specimen — confirm tonight's leaf swap is rendering as remembered ("pretty. dang.")
4. Decide first move: A (bark lighten) is the right warm-up; finishes the photo-real Sugar Maple proof
5. Add a BACKLOG.md entry pointing back at this handoff so the doctrine doesn't get lost when the file ages out
