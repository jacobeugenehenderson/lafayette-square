# Handoff — Tree Builder & Articulated-Blank Doctrine

**Date:** 2026-05-21 (evening session)
**Status:** Doctrine landed + dry-swap proven + tomorrow's chunk scoped
**Re-entry:** read this file end-to-end; then `arborist/NOTES.md` for any cross-references; then start at "Tomorrow's chunk" below.

---

## ⚠️ LOAD-BEARING CONSTRAINT — single-page atlas

**Bloom postprocessing breaks with multiple atlas pages.** Whatever the bark library + leaf library + any other texture authoring produces tomorrow, the bake step MUST gang every tile into a **single atlas page**. This is exactly what `arborist/atlas-pack.js` + `arborist/atlas-survey.js` + `bake-look.js:unifyAtlases` were built for (the "Grove's master atlas" — see `arborist/FEATURES.md`).

**Implications for tomorrow's bark library work:**
- All 6 bark luminance maps + 6 bark normals + N gradient LUTs ride in the same atlas as the leaf cards
- atlas-survey.js dedupes by sha1 hash before pack — shared bark/leaf tiles collapse automatically
- Resolution budget per tile shrinks accordingly; verify the proposed 4K bark luminance survives the atlas pack OR drop to 2K luminance (still substantially higher detail than per-species PBR at the same atlas budget)
- Gradient LUTs are tiny (256×1) so basically free in the atlas

**Don't author tiles that bypass the gang tool.** Any path that ships a separate texture file at runtime breaks bloom.

## TL;DR

Tonight we landed the **articulated-blank doctrine** for trees and proved it works with a dry leaf-swap experiment. The Sugar Maple leaves from our `LeafSet010` pack dropped cleanly onto the vendor's existing card geometry — visually beautiful. The architecture for a full **Tree Builder** ("Fashion Plates for trees") is now clear:

> A tree is a *recipe* binding `{silhouette_blank, bark_primitive, bark_tint, leaf_species, jitter_seed, age, health}` — composed from finite kit-level libraries of platonics, baked into one scene-specific atlas, drawn in one instanced batch.

**Tomorrow's focus (scope-reset 2026-05-21 late evening):** get all 3 maple blanks **Grove Ready** — decimation + LoD + canopy-painting strategy proven on Sugar Maple, ready to drop into the Lafayette Square grove. Tree Builder UI + 5-hero roster slide to v1.6+. **Project's near-term "done for the time being" line:** representatives of every pack-covered species (6 broadleaf + 1 conifer — see Inventory) rendering with their proper leaves on appropriate blanks. Pack gaps (Ginkgo, Honey Locust) defer to v1.6.

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

## The 5 hero species (canonical — from BACKLOG.md, locked 2026-05-19)

Project sharpened to **"ship 5 hero species at Hero quality."** These are the trees that must look photographic; the other 60+ inventory species ride filler procedural defaults dressed with the same per-species leaf packs.

| # | Species | Doctrinal role | Leaf pack | Procurement status |
|---|---|---|---|---|
| **G.1** | **Sugar Maple** (`acer_saccharum`) | Dominant inventory (104 placements), canonical broadleaf, strictest visual bar | ✓ `LeafSet010` (palmate) | **3 maple blanks in hand** (maple-trees-pack) + existing `acer_saccharum_multistem` published + parallel G.1.0 procedural-runway arc using LiDAR-derived priors |
| **G.2** | **Ginkgo** (`ginkgo_biloba`) | Proves the leaf editor + per-species hero path on the most leaf-defined species (bilobed fan + autumn gold = the identity) | ✗ `fan` gap — **no vendor source** | Needs sourcing: CGTrader (~$5–30), or phone-camera shoot (May = full green, perfect season), or PSD authoring |
| **G.3** | **Willow** (`salix_babylonica` or similar) | Weeping algorithm at hero quality | ✓ `LeafSet013` (narrow) | Base model needed; check `public/trees/salix_alba/` (already in inventory directory) |
| **G.4** | **Honey Locust** (`gleditsia_triacanthos`) | Sparse-cluster validation (dappled canopy) | ✗ `fine_compound` gap — **no vendor source** | Needs sourcing same as G.2; base model already published at `public/trees/gleditsia_triacanthos/` |
| **G.5** | **TBD** (3 candidates) | Decision pending — see below | Depends on choice | First-thing-tomorrow decision |

### G.5 — first decision tomorrow

Per BACKLOG.md, three candidates with different doctrinal payoffs:

| Candidate | Why | Leaf-pack cost | Slot coverage |
|---|---|---|---|
| **Spruce / Pine** (likely `pinus_sp` or `picea_sp`) | Adds the conifer slot to hero roster (currently all-broadleaf) | ✗ `short_needle` gap (Spruce) or ✓ `LeafSet019` (Pine, long needle) | Fills conifer hero slot |
| **Pin Oak** (`quercus_palustris`) | Second broadleaf character (Pin Oak's strong pyramidal habit is visually distinct from Sugar Maple's oval) | ✓ `LeafSet016` (lobed) | Adds pyramidal/strong-leader silhouette platonic |
| **Sycamore** (`platanus_occidentalis`) | Closes the existing-hand-modeled-roster loop (we already have Sycamore-class assets via maple-trees-pack since it's same `palmate` morphology) | ✓ `LeafSet010` (palmate, shared with Sugar Maple) | Adds exfoliating-bark species + spreading silhouette |

**Recommendation if forced to pick now:** **Pin Oak.** Reasons: (a) leaf pack already in hand (LeafSet016, zero procurement); (b) adds a meaningfully different silhouette to the platonic library; (c) Pin Oak appears in DC park inventories; (d) doesn't compete with G.1 Sugar Maple for the broadleaf-default slot. Tradeoff: doesn't fix the all-broadleaf-roster problem (Spruce/Pine would). If conifer coverage matters for the v1.5 ship aesthetic, Pine wins (LeafSet019 already covers it).

**Honest meta:** picking G.5 is a 5-minute decision. Make it first, don't let it block.

## Park-scale numbers

- **Total placements at Lafayette Square: 745**
- **Sugar Maple alone: 104 placements** (per `NOTES.md`, routed to `acer_saccharum_procedural`)
- **Per-instance jitter axes** (already plumbed): Y rotation, independent XZ + Y scale, hue shift, wind phase — gives 745 placements visually unbounded diversity from a small base-model set
- **5 hero base models × 8 jitter axes** = more visual diversity than the eye can detect at park-scale. The 745 is the inventory ceiling, not a kit-capacity ceiling.

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

## Tomorrow's focus — get all 3 maples Grove Ready

**Reset 2026-05-21 late evening.** The "ship all 5 heroes in one day" framing was Claude's reach; operator pulled it back to a focused single-track day:

> **"If we can get all three of the maples Grove Ready I'll be happy."**

Three priorities, in order:

1. **Decimation** — the bark prim is 166–208k tris per maple. Mobile-untenable. Get it to ~5–20k for hero tier, lower for distant tiers, via `meshoptimizer` / `gltf-transform`.
2. **LoD** — produce the lod0 / lod1 / lod2 chain per blank (the existing `publish-glb.js` already emits `skeleton-N-lodX.glb` naming convention; extend to the maple pack).
3. **Canopy-painting strategy** — prove the depth-attenuated dark-interior / translucent-outer-shell approach visually. Probably ship the shader-side fake-depth POC for v1.5; bake-time `aCanopyDepth` follows as Phase-G.6-adjacent work (see below).

### Grove Ready — definition of done

All 3 maples (`acer_saccharum_blank_01/02/03`) published into `public/trees/` with:
- ✓ Bark decimated to mobile-acceptable triangle counts at lod0/1/2
- ✓ Leaves swapped to LeafSet010 Sugar Maple via the existing dry-swap path (now scoped to species, not global)
- ✓ Bark lightened via `uBarkTint` reading `species.bark.trunk.tintBase`
- ✓ Canopy painting visible — interior cards opaque + matte + dark, outer-shell translucent (even if depth is faked from y-coord in v1.5)
- ✓ Drops cleanly into Lafayette Square Stage view; visible in Grove plan-view if time permits

### Suggested ~6 hour sequence

| # | Step | Effort | Output |
|---|---|---|---|
| **A** | **Bark lighten** (warm-up) | 30 min | `uBarkTint` uniform path on non-leaf materials; species-map tint field unblocked |
| **B** | **Per-species leaf binding** (narrows tonight's global swap to Sugar Maple only) | 45 min | `getLeafTexForSpecies(speciesId)` consulting `leaf-pack-bindings.json`. Pre-extract single-leaf variants for ALL 10 LeafSets in one Python pass so the cousin species are unblocked for the "done for the time being" milestone. |
| **C** | **Decimation + LoD via gltf-transform** | 1.5 hr | meshoptimizer simplify chain in `publish-glb.js`; bark prim → lod0 (~15k tris) / lod1 (~5k) / lod2 (~1k); leaves handled separately (drop card count for distant tiers, don't decimate the cards themselves) |
| **D** | **Publish 3 maple blanks** | 1 hr | Extend `publish-glb.js` to split multi-node source GLB → N specimens. If rabbit-holes, fall back to manual Blender Python per-tree extraction (5 min each) → 3 separate publish runs. |
| **E** | **Canopy-painting POC (shader-side fake depth)** | 1 hr | Fake `aCanopyDepth` from canopy-bounds-normalized `y`. Interior cards: opaque, A2C, darkened toward interior color, roughness scaled to matte. Outer 2 layers: alpha-blend translucent. Two-pass render via `renderOrder` + `depthWrite`. |
| **F** | **Grove visual check + commit** | 30 min | Open Stage view, verify maples drop in cleanly. Bake `lafayette-square` Look. Commit. |

**Total: ~5–6 hours.** Achievable, leaves room for unexpected snags or stretch goals.

### Stretch goals (only if A–F land cleanly)

- Dress the cousin species (Oak via `LeafSet016`, Redbud via `LeafSet004`, Willow via `LeafSet013`, Mulberry via `Leaf001`, Pine via `LeafSet019`) with the per-species leaf binding from step B. Most are zero-code follow-on once B is in — just add the texture extraction. **Hitting this is the "done for the time being" milestone:** every pack-covered species has a representative tree rendering with its proper leaves.

- **Bark library v1** (architecture sketched 2026-05-21 evening): six grayscale bark luminance maps (one per platonic — smooth, furrowed, plated, scaly, exfoliating, fibrous) + N per-species gradient LUTs (256×1 each). Shader: `color = texture(barkGradient, texture(barkLum, uv).r).rgb`. Substance/Unreal master-material pattern. Source path: extract from existing PBR packs (desaturate diffuse → luminance) for fastest landing. **All tiles ride in the single-page master atlas via the gang tool** (atlas-pack.js + unifyAtlases) — see load-bearing constraint at top. Honest caveat: mottled species (Sycamore, Birch) need a second mask channel for spatial color variation — defer to v1.6. Start with the 4 species that fit single-gradient cleanly: Sugar Maple, Oak, Pine, Linden. Estimated ~2–3 hours additional work atop the core day.

### What's in scope for this handoff — and what's NOT

**IN scope (tomorrow's day):**
- 3 maples Grove Ready (decimation + LoD + canopy painting + leaves + bark)
- Per-species leaf binding (tonight's global swap → scoped)
- Bark lighten
- Cousin species dressed as stretch (6 broadleaf + 1 conifer rendering with proper leaves = "done for the time being")

**OUT of scope (now deferred to v1.6 or later):**
- All 5 hero species at hero quality (G.2 Ginkgo / G.4 Honey Locust still blocked on leaf-pack sourcing)
- Tree Builder UI (the workstage chunk — deferred until the underlying recipe surface settles)
- G.5 decision (decoupled from tomorrow's day)
- Real bake-time `aCanopyDepth` pass (today is shader-fake; real bake is Phase-G.6 territory)
- Per-vertex `aBranchId` + `aHierarchyDepth` (Phase G.6)
- Bones / auto-rigger (Phase G.6 — see new section below)
- Bark-shader procedural (one master shader, 6 platonics) — v1.6
- Per-instance jitter axes beyond what's plumbed — v1.6
- Scene atlas baker — v1.6

### The open visual question to settle first thing

**Single leaf per card vs cluster card.** Tonight's swap shows ONE Sugar Maple leaf per vendor card (~22k cards per tree → 22k visible leaves). Either:

- **Reads beautifully** → proceed; this is the architecture for all heroes
- **Reads sparse/"polka-dotted"** → compose 3–5 leaf clusters into a `<packId>_cluster.png` per species (one-time PSD/Pillow pass, ~30 min per pack)

**First-thing-tomorrow check:** open Arborist, look at a Sugar Maple specimen with tonight's swap. Decision lives in 5 minutes, gates the rest of the day.

---

## Phase G.6 — Auto-rigger via mesh-skeleton extraction (NEW, post-v1.5)

**Surfaced 2026-05-21 late evening** during conversation about whether deformers require bones.

**The realization:** the user's framing — *"we are literally trying to use 5 trees as 600"* — DOES require per-branch addressability with hierarchical inheritance (rotate parent → children follow), which `aBranchId` alone doesn't provide cleanly. The right long-term architecture is a **light skeletal rig (4–8 bones)** for big hierarchical motions + **`aBranchId`** (20–40 IDs) for fine-grained non-hierarchical ops. SpeedTree, Unreal foliage, Pixar's tree systems all use this hybrid.

**The maple pack has NO bones.** Three paths to add them:

| Path | Effort | Tradeoff |
|---|---|---|
| **Hand-rig in Blender** | ~1 hr/tree (with skill) — needs artist if not | One-off; doesn't scale to future blanks |
| **Auto-rig via mesh-skeleton extraction** | ~1 week one-time, then free for all future blanks | Kit-elegant; reactivates shelved `lil_vera_v2.py` investment |
| **Wrap Pinocchio (Baran & Popović 2007)** | ~1 day if it builds | 19-year-old research code; often a build nightmare |

**Phase G.6 is the auto-rig path.** Pipeline:

1. **Mesh → medial skeleton.** Laplacian/mean-curvature contraction (Au et al. 2008 / CGAL implementation). Mesh iteratively collapses to a 1D graph through trunk + branches. Solved territory.
2. **Skeleton → branch hierarchy.** Walk the graph: lowest endpoint = trunk root, depth-first traversal outward, vertices of degree ≥ 3 are junctions. Polylines between junctions = bones. Parent assignments fall out naturally because trees ARE hierarchies.
3. **Bone count tunable.** Threshold parameter merges tiny branches into parent — 5–8 bones for hero rig, 20–40 for fine rig. Same algorithm.
4. **Mesh → skinning weights.** Distance-based (cheap, works well at low bone counts) or heat-diffusion (Baran & Popović 2007, what Blender's auto-weight uses — smoother). Per-vertex weight to each bone.
5. **Repack as rigged glTF.** Add `skins` block, stamp `JOINTS_0` + `WEIGHTS_0`. Three.js GLTFLoader handles natively.
6. **`aBranchId` falls out for free.** Each vertex's dominant bone IS its branch ID — both layers come from one bake pass.

**Critical: `lil_vera_v2.py` and `bidirectional_skeleton.py` ALREADY implement steps 1–2** for LiDAR point clouds. Mesh input is *easier* than point cloud (explicit connectivity, no noise). The failure that shelved Li'l Vera was downstream (tip-detector gate) — the skeleton extraction itself worked. **Phase G.6 reactivates the shelved investment in a productive direction.** Per [[project_lidar_as_training_data]] this is exactly the re-entry condition we'd want: "different architecture on the table that doesn't depend on tip anchors."

**Implementation recommendation: pure-Python via adapted `lil_vera_v2.py`.** ~1 week. No external tool dependency. Becomes a first-class Arborist CLI invocable from `publish-glb.js` — every blank we already have AND every future blank gets bones automatically.

**Critical caveats:**
- Mesh quality matters — clean modeled trees auto-rig well; photogrammetry blobs don't. We screened the maple pack for this.
- Operator-in-the-loop preview is required — "did the auto-rig produce a sensible skeleton?" needs eyeballing. Build a Tree Builder panel that overlays the proposed skeleton on the mesh and gates adoption.
- Skinning weight quality degrades at high bone counts. Stick to 5–10 bones for hero rigs.

**Phase G.6 unlocks:**
- True per-instance per-branch articulation (the "5 trees as 600" feature)
- Hierarchical motion (lean trunk → branches follow)
- Branch-coherent operations at runtime (prune branch_3 + everything downstream)
- The Tree Builder UI's per-branch authoring controls (panel surface)

**Phase G.6 does NOT block v1.5 ship.** Tomorrow's no-bones approach (wind via height-falloff, prune via per-vertex hash, lean via per-instance uniform on whole tree, no hierarchical motion) ships visually-acceptable trees TODAY. G.6 is the architecture that takes us from "visually-acceptable 5 base models" to "5 base models truly serve as 600 distinct trees with per-instance branch-level variation."

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
