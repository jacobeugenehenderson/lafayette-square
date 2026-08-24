# FEATURES — Scan / Procedural / LiDAR operator surfaces (RETIRED 2026-08-23)

> Excised from `arborist/FEATURES.md` on Jacob's ruling that procedural and LiDAR are rot.
> **History, not canon.** ⛔ Do not build to any of it.

### Scan mode (`src/arborist/Workstage.jsx`)

The original LiDAR-based authoring flow: pick a species, filter candidate specimens from `tree_metadata_dev.csv`, tune voxel size / min radius / tip radius in the SpecimenViewport, save the seedling library, run `python bake-tree.py --species=<id>`. The single workstage has:

| Region | Purpose |
|---|---|
| Top pickers | Active species, specimen (filtered table), variant slot |
| Center | 3D viewport — point cloud → QSM overlay → leaf preview |
| Side | Tune panel (voxel size, min radius, tip radius), preview-tint knob, label override |
| Bottom | Save (commits seedling), Bake (runs `bake-tree.py`) |

Workflow: `pick → tune → save seedling → repeat ~10 times → bake species`.

### Procedural mode (`src/arborist/ProceduralWorkstage.jsx`, shipped 2026-05-15)

In-Arborist authoring for the five procedural morphology fillers + the five Phase G hero species. **Dice-and-adopt, not slider-tune** — procedural trees produce unique topology per seed, so the workflow is roll-the-dice-until-good. Each species carries ~3 adopted variants; per-instance runtime jitter (Y-rotation, independent XZ + Y scale, hue shift, wind phase) provides visible diversity across LS's 745 placements.

**Layout (post-Phase-C, 2026-05-16):** single-focused viewport + slot tabs. Slot tabs strip in the header (with a dirty-dot indicator); one focused card filling the main area; viewport as `flex: 1` left; 300-px controls rail right. This replaced the earlier Phase A/D grid-of-cards layout, which cropped vertically-composed silhouettes (columnar / weeping). Tab switcher is the only new affordance — the controls themselves are identical to the Phase D set.

**Per-slot controls rail — 21 knobs across 5 sections** (updated through 2026-05-19):

| Section | Knobs | Notes |
|---|---|---|
| **Trunk** | DBH (5–100 cm) | Trunk diameter at base. Top-level scalar param. |
| **Envelope** | Profile, Width, Height, Asymmetry, Drape | Drape (was "Y offset") hidden for non-weeping presets — it only has semantic meaning when the envelope hangs below the trunk top. |
| **Canopy** | Start, Scaffolds, Spread, Phyllotaxis, Architecture, Leader strength, Lift, Density, Fill | Architecture dropdown (spreading / strong-leader) selects the iter-0 SCA seeding mode — spreading=apical N scaffolds (oak/elm/dogwood); strong-leader=lateral scaffolds at distributed Ys along an axial trunk that threads through the crown (maple/ash/basswood, Rauh's botanical model). Leader strength visible only in strong-leader (controls how far axial extends + the per-scaffold sustained +Y tropism magnitude). Spread + Lift hidden in strong-leader — the per-scaffold localTropism takes over. Phyllotaxis (alternate/opposite) is orthogonal to Architecture and composes. |
| **Deformers** | Trunk wander (cm), Wavelength (m), Branch jitter (%), Bark relief (%) | Operator-tunable organic noise. Trunk wander is a deterministic XZ sinuosity applied to both the visible trunk shaft and the SCA axial extension so the canopy attaches cleanly. Branch jitter perturbs each SCA spawn perpendicular to the pull line. |
| **Tropism** | X / Y / Z | Per-axis gravity bias for SCA growth direction. |

**Per-slot actions** (footer row):

- 🎲 **Dice** — re-roll seed; viewport thumbnail updates from a fresh `POST /procedural/generate` (blob-URL'd GLB)
- ↺ **Reset** — clear the operator overlay for this slot; persists `{}` to disk, refetches `effective`; sliders snap back to PRESETS defaults
- ✓ **Adopt** — write `{slot, seed, params}` overlay to `arborist/state/procedural_<species>/seedlings.json`
- **Seed** input (manual integer entry)
- **Re-publish species** (species-level, in the workstage footer; blocked until all dirty slots adopted)

All sliders use a local `DraftSlider` (150ms idle commit + pointer-up final commit) — same pattern as cartograph's `DraftRangeInput`. Controlled selects (Phyllotaxis, Profile) read from the store-mirrored `effective` value so operator choices reflect immediately without a server round-trip.

**Floating viewport overlays** — three corners, three categories: viewing conditions, preview fidelity, instrumentation. None of them mutate the tree; all are local to the workstage session.

- **Wind** (bottom-left). Toggle + strength slider (0–2). Two-layer sway — wood gets a slow height-falloff sway, leaves layer a high-frequency flutter on top. Operator-tunable in the workstage; production wind in `treeAtlasMaterial.js` is Phase W proper (still pending). Viewing condition.

- **Preset cameras** (top-left, second row — Brief 13 Vantage 2026-05-23, refined same session). Two buttons: **Overhead** (literal top-down plan view — camera directly above the trunk at `treeH+20`, looking at `(0,0,0)`; yardstick + canopy fan-out visible in plan) and **Ground** (existing studio framing, default). The bark-shader tier (Brief 10's `uBarkShaderTier`) is auto-bound from the active preset + camera distance per-frame inside `DollyCam`: Overhead → tier 0 (aerial); Ground with distance > 20m → tier 1 (hero); Ground with distance < 20m → tier 2 (street). Threshold tunable; first-pass 20m. The Ground mode preserves the existing Option+drag (crane + Y-rotate), wheel zoom (distance), shift+wheel (height), and arrow-key cranes — operator wheels in from 25m → 18m and watches the bark shift from hero to street live. Overhead routes non-shift wheel to altitude so wheel-zoom does the intuitive plan-view thing. `window.__setBarkShaderTier(n)` (Cork's debug setter) now PINS the tier, suspending auto-bind so the operator can verify cross-pairs ("what does street tier look like from overhead camera"); `window.__releaseBarkShaderTier()` restores auto-bind. **LS-runtime parity (Brief 11 lightweight, Plumb 2026-05-23)**: the same tier auto-bind fires in production via `TierDriver` in `InstancedTrees.jsx`, with the discriminating signal swapped to camera altitude (`y > 150 → 0`, `y < 5 → 2`, else 1, calibrated against `Scene.jsx` PRESETS). Pin/release works across both surfaces — pinning in Salon devtools sticks across LS frames.

- **LoD selector** (top-right, **Procedural-only** as of Brief 13 refinement 2026-05-23 — Salon retired it per the "Salon authors at raw fidelity, geometry LoD is a deploy concern" doctrine; Brief 6's adaptive bake pipeline owns LoD generation downstream). Three buttons (0 / 1 / 2) that re-fetch the preview at the corresponding simplification ratio. `POST /procedural/generate` carries the `lod` field; the server runs gltf-transform's `weld → dedup → simplify` with `MeshoptSimplifier` at the same ratios `publish-glb.js` uses (lod1 ratio 0.40 / err 0.002, lod2 ratio 0.10 / err 0.008). Active button gets the amber accent matching the Re-publish chrome; disabled while a preview is regenerating. State lives at `ProceduralWorkstage` scope so the choice survives slot-tab switches. Preview fidelity dial.

- **Perf gauge** (bottom-right). Four-row readout sampled ~4 Hz by a read-only `<PerfProbe />` r3f child mounted inside the viewport's `<Canvas>`.
  - `tris` — total triangle count across the loaded scene. Color zones at LoD0: green < 20k, yellow 20–40k, red > 40k. Zones scale × 0.5 at LoD1 and × 0.2 at LoD2 to mirror publish-glb's simplification ratios.
  - `leaf cards` — `geometry.userData.atlasKind === 'leaf'` vertex count divided by 4 (each card is a 4-vert quad).
  - `draw calls` — `gl.info.render.calls`.
  - `programs` — `gl.info.programs.length`. Author-time tripwire: flagged red if > 5 to catch accidental shader-program divergence (per [[feedback_unique_program_cache_key_before_wrappers]]); should stay at the shared-tree-material count regardless of slot or LoD.
  PerfProbe renders nothing — it can't pollute the count it measures. Instrumentation readout. ⚠️ **This (and the Preview GPU gauge) is a count-vs-interim-fake-budget readout, NOT a frame-ms perf signal** — the LS-side gauge reads red even with no trees and drove a reverted tree-degradation arc. Real tree perf is gated on device frame-ms + the operator's eye on the cinematic pan (2026-06-25; see ARCHITECTURE "Tree-render reality").

**Conifer panel** (Phase E, pending): whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge. Hidden today.

**Bark panel** (Phase B.1.b, deferred): material dropdown w/ thumbnails, UV scale X/Y sliders, tintBase color picker, tintJitterRange + roughnessOverride sliders, "Apply & republish species" button. Indefinitely deferred per 2026-05-16 EOD doctrine — bark authoring iteration value is bounded by the geometric ceiling Phase C addresses, not by UI surface.

**Leaf panel** (Phase F, pending — reframed 2026-05-19 to vendor-pack binding + year-long tree doctrine; see `ARCHITECTURE.md` "Phase F leaf-color architecture"). Operator authoring as configuration, not creation:
- **Shape pack picker** — dropdown of available leaf packs from `public/textures/leaves/shapes/`. Auto-suggested default from `arborist/leaf-pack-bindings.json` species→morphology→pack mapping (Sugar Maple defaults to LeafSet010; oak defaults to LeafSet016; etc.). Operator overrides if species has a specific authored pack.
- **Annual cycle anchor editor** — author 4–6 season anchors (winter / spring-buds / summer-peak / fall-peak / late-fall / shed). Each anchor carries: `day` (0–365), `presence` (card alpha 0–1), `scale` (card size 0–1), optional per-season shape override, multi-stop gradient for leaf front and leaf back. Runtime samples `uDayOfYear` and interpolates between anchors — Sugar Maple peaks orange-red in mid-October by construction; Look-switching is a date pick, not a per-tree palette swap.
- **Per-Look override packs** — for Looks that want art-direction (Halloween bats, Christmas candy canes, Diwali ornament gold), per-Look `scene.materialColors[<species>]` extension carries shape-pack + gradient overrides that pre-empt the year-long defaults.
- **Occupancy slider** — alpha-density modulator for sparse-canopy species (honeylocust ~25%, oak ~70%, conifer ~95%).
- **No** density/jitter/cluster-count sliders — those would be compositor knobs; the parametric compositor is dropped per the 2026-05-16 PS-authored reframe.


---

### LiDAR mode (`src/arborist/LidarWorkstage.jsx`, Phase L Cycle 1 shipped 2026-05-19; Cycle 2 Stage 1 shipped 2026-05-19 PM)

Third top-level mode alongside Procedural + Grove. Operator browses LiDAR specimens of the active species (110 Sugar Maples in `botanica/dev/train/` alone), extracts QSM cylinder skeleton via tunable parameters, previews multi-layer point cloud + cylinders, saves seedling. **Publish** action (Cycle 2 Stage 1) runs the awaited chain `bake-tree.py → lidar-publish.js (LOD + manifest promotion + index rebuild) → roster-add → bake-look → bake-trees` and surfaces timings on success. Cycle 1 shipped browsing + extraction tuning + diagnostic viewport. Cycle 2 Stage 2/3 will add Configuration D canopy composition + Phase F annual-cycle integration.

Per Option δ scope (locked 2026-05-19): LiDAR provides skeleton ONLY; the canopy is fully procedural. *(The scope split is what's locked — not the canopy renderer. This line named "Configuration D," a design retired 2026-06; trees ship **all-mesh** — see `ARCHITECTURE.md §Tree-render reality at LS`.)* Captures the trunk-shader-quality win (bark wraps onto authentic real-tree geometry) without LiDAR-canopy-point-sampling complexity. G.1 Sugar Maple hero ships as mixed roster (LiDAR-baked variants + procedural variants under `acer_saccharum_procedural`).

Operator workflow per specimen: pick from filtered list (sorted by height descending, height + scan type as primary label, optional operator-given display name persisted to seedlings.json) → preview loads as point cloud → tune voxel/min-radius/tip-radius extraction params → see cylinder overlay color-coded by trunk-vs-branch region → save seedling → (Cycle 2) bake variant → publish to roster.

Workspace render budget: desktop-class, single specimen at a time. Hi-res authoring; bake step handles knockdown to mobile LS runtime budget. See `ARCHITECTURE.md` "LiDAR pipeline + Option δ scope" for the full pipeline structure.

**Cycle 1 layout (shipped 2026-05-19):**

| Region | Purpose |
|---|---|
| Header | Active species dropdown (filtered to LiDAR-source species), auto-suggested leaf pack readout (`arborist/leaf-pack-bindings.json`-derived: species override wins → morphology fallback → first candidate; informational only — Cycle 2 binds via `bake-look.js`), `← Salon` (post-Brief-18A; was `← Library`). The Mode-toggle row retired — LiDAR reached via `?legacy=lidar` URL until Brief 18B merges its affordances into Salon's slot card. |
| Specimen browser (left top) | Filter (display name substring OR height range like `8-12`), sorted by `treeH` descending. Each row: `✦/◯ {height}m {scanType} {displayName-or-tree-treeId}`. ✦ = saved seedling. Active row tinted amber. |
| 3D viewport (right top) | Multi-layer composite: raw point cloud (`THREE.Points`, size-attenuated, cyan tint, ≤1M pts streamed from existing `/specimens/:treeId/preview.ply`), QSM cylinder overlay (two `InstancedMesh` draws split at median radius — trunk-like red, branch-like cyan, translucent). Layer toggle chips overlay top-left (Points / Cylinders / Skeleton only / Full preview) + Fit-to-specimen button. `OrbitControls`. |
| Skeleton extraction (left bottom) | Three `DraftSlider`s — Voxel (m), Min radius (m), Tip radius (m) — 150ms idle commit + pointer-up final (per [[feedback_heavy_render_sliders_need_draft]]). Re-extract + Save seedling buttons. Specimen details subsection (treeId, scan type, height) + inline `display name (optional)` input that saves into `seedlings.json#displayNames[treeId]`. |
| Statistics (right bottom) | Points loaded, cylinders, trunk/branch split, est. lod0 tris (trunk×16 + branch×12), tips, median radius, server ms, voxel-downsampled point count. |

Extraction loop:

1. Operator picks species + specimen → `GET /lidar/specimen/:treeId/seedling-state?species=<id>` pre-fills the tuner from saved `tuneParams` (else `config.tuneDefaults`) + the saved display name (else empty).
2. First load auto-fires `POST /lidar/specimen/:treeId/extract` → server shells out to `lidar_extract.py` → cylinder graph + stats returned as JSON. Workstage renders the graph immediately.
3. Operator drags voxel / min radius / tip radius sliders → on commit, Re-extract button glows; clicking it re-runs the extract. (Cycle 1 does not auto-re-extract on slider commit — explicit gesture per [[feedback_debounced_save_must_flush_before_dependent_post]] semantics.)
4. Save seedling persists `{tuneParams, displayName}` for this treeId into `arborist/state/<species>/seedlings.json` via the existing `POST /species/:id/seedlings` endpoint. `displayNames` map merges: incoming keys win, absent keys preserved on disk.

Cycle 1 endpoints used:
- `GET /api/arborist/species/:id/specimens` (existing)
- `GET /api/arborist/specimens/:treeId/preview.ply` (existing)
- `POST /api/arborist/lidar/specimen/:treeId/extract` (new)
- `GET /api/arborist/lidar/specimen/:treeId/seedling-state?species=<id>` (new)
- `POST /api/arborist/species/:id/seedlings` (existing, extended to accept `displayNames`)

---

