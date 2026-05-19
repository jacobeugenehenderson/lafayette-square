# Arborist Features

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Operator-facing surface of the helper. Read at session start to know what's already shippable vs. what's still in flight. `BACKLOG.md` carries the in-flight items; `ARCHITECTURE.md` carries the load-bearing patterns; `NOTES.md` carries the dated decision record.

---

## What the helper produces

Per-species runtime artifacts under `public/trees/<species>/`:

- `skeleton-N.glb` — one published variant per `N`, baked at 3 LOD tiers (`skeleton-N-lod0.glb` / `lod1` / `lod2`)
- `tips-N.json` — leaf-anchor positions for per-instance jitter / wind
- `manifest.json` — per-species metadata: variant list, `quality` / `qualityOverride`, `bark` spec (photo-PBR material ref + tint defaults + uvScale), `leafCluster` ref (per-hero), approximate height in meters
- `public/trees/index.json` — roster index aggregating all species

Plus per-Look atlas artifacts emitted by `bake-look.js`:

- `public/baked/<look>/trees-atlas.json` — master atlas tile map, `barkBySpecies` block, per-species overrides
- `public/baked/<look>/trees/<species>/...` — placement-substituted GLBs for the Look

These are the contract the deployed runtime (`InstancedTrees.jsx`) consumes. The helper's job is to keep them deterministic and pristine.

---

## Two authoring modes

The Arborist UI (`/arborist`) opens to a mode selector — **Scan** (LiDAR pipeline) and **Procedural** (in-Arborist authoring). They share the same publish pipeline and the same per-Look atlas pass.

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

**Per-slot controls rail — 20 knobs across 5 sections** (updated through 2026-05-19):

| Section | Knobs | Notes |
|---|---|---|
| **Trunk** | DBH (5–100 cm) | Trunk diameter at base. Top-level scalar param. |
| **Envelope** | Profile, Width, Height, Asymmetry, Drape | Drape (was "Y offset") hidden for non-weeping presets — it only has semantic meaning when the envelope hangs below the trunk top. |
| **Canopy** | Start, Scaffolds, Spread, Phyllotaxis, Lift, Density, Fill | Phyllotaxis dropdown (alternate / opposite for maple-style fishbone); Spread (scaffoldZoneFrac) hidden for weeping (curtain requires tip-pinned scaffolds); Lift (scaffoldEmergenceBias) drives J-curved lower scaffolds. |
| **Deformers** | Trunk wander (cm), Wavelength (m), Branch jitter (%), Bark relief (%) | Operator-tunable organic noise. Trunk wander is a deterministic XZ sinuosity applied to both the visible trunk shaft and the SCA axial extension so the canopy attaches cleanly. Branch jitter perturbs each SCA spawn perpendicular to the pull line. |
| **Tropism** | X / Y / Z | Per-axis gravity bias for SCA growth direction. |

**Per-slot actions** (footer row):

- 🎲 **Dice** — re-roll seed; viewport thumbnail updates from a fresh `POST /procedural/generate` (blob-URL'd GLB)
- ↺ **Reset** — clear the operator overlay for this slot; persists `{}` to disk, refetches `effective`; sliders snap back to PRESETS defaults
- ✓ **Adopt** — write `{slot, seed, params}` overlay to `arborist/state/procedural_<species>/seedlings.json`
- **Seed** input (manual integer entry)
- **Re-publish species** (species-level, in the workstage footer; blocked until all dirty slots adopted)

All sliders use a local `DraftSlider` (150ms idle commit + pointer-up final commit) — same pattern as cartograph's `DraftRangeInput`. Controlled selects (Phyllotaxis, Profile) read from the store-mirrored `effective` value so operator choices reflect immediately without a server round-trip.

**Floating viewport overlays** (viewing conditions, not tree properties):

- **Wind** toggle + strength slider (0–2): two-layer sway — wood gets a slow height-falloff sway, leaves layer a high-frequency flutter on top. Operator-tunable in the workstage; production wind in `treeAtlasMaterial.js` is Phase W proper (still pending).

**Conifer panel** (Phase E, pending): whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge. Hidden today.

**Bark panel** (Phase B.1.b, deferred): material dropdown w/ thumbnails, UV scale X/Y sliders, tintBase color picker, tintJitterRange + roughnessOverride sliders, "Apply & republish species" button. Indefinitely deferred per 2026-05-16 EOD doctrine — bark authoring iteration value is bounded by the geometric ceiling Phase C addresses, not by UI surface.

**Leaf panel** (Phase F, pending): cluster texture preview, summer/fall inner+outer color pickers, occupancy slider. NO density / jitter / cluster-count sliders — those would be compositor knobs; the compositor is dropped per the 2026-05-16 PS-authored reframe.

---

## Grove (`src/arborist/Grove.jsx`)

Per-Look roster curation. Reads `public/looks/<look>/design.json#/trees`; lets the operator scope `In Look` / `All Rated`, click-to-toggle tree membership, fires `/api/cartograph/looks/<id>/trees` + `/api/arborist/atlas/bake?look=<id>` automatically. **The Grove is how operators prune heavy hand-authored variants from a Look — not by editing design.json directly.**

The Grove's master atlas (`bake-look.js:unifyAtlases`) is the load-bearing innovation that makes hero species nearly free to add: `atlas-survey.js` dedupes tiles by sha1 hash before pack, so hero bark + leaf-cluster tiles collapse against the filler roster's identical content. See `ARCHITECTURE.md` for the full story.

**Set as Meteorologist canary** (per-tile hover-card affordance). Click `→ Set as Meteorologist canary` on any tile to publish `{species, variantId, lookId}` into `localStorage.meteorologist-canary-tree`. Meteorologist's CanaryScene listens for the `storage` event (cross-tab, same origin) and swaps its hero tree to match — useful for sanity-checking a freshly adopted variant under stormy weather conditions without leaving Arborist. Per-operator UI preference; not authored, not per-Look state. Contract lives in `ARCHITECTURE.md` "Arborist ↔ Meteorologist canary contract".

---

## API endpoints (`arborist/serve.js`, port 3334)

Mounted under `/api/arborist` from the web app via Vite proxy.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/species` | Read `public/trees/index.json` |
| `GET` | `/species/:id` | Read one species's `manifest.json` (404 until baked) |
| `GET` | `/species/:id/specimens` | Candidate specimens from `tree_metadata_dev.csv` with `recommended` flags |
| `GET` | `/species/:id/seedlings` | Picked seedlings + per-seedling tune params (Scan mode) |
| `POST` | `/species/:id/seedlings` | Save the seedling library for the species |
| `GET` | `/specimens/:treeId/preview.ply` | Stream a `.laz` as PLY for the viewport (cached) |
| `POST` | `/species/:id/bake` | Run `python bake-tree.py --species=<id>` |
| `DELETE` | `/species/:id` | Remove published artifacts + state |
| `GET` | `/inventory` | Species histogram from `src/data/park_trees.json` |
| `GET` | `/procedural/species` | List of procedural species + hero entries |
| `GET\|POST` | `/procedural/:species/seedlings` | Procedural seedlings overlay (`arborist/state/<species>/seedlings.json`); GET returns `effective` field per variant (PRESETS base merged with operator overlay) |
| `POST` | `/procedural/generate` | Returns `model/gltf-binary` directly for a single (species, slot, seed, params) — used by the workstage dice/preview loop |
| `POST` | `/procedural/:species/publish?look=<id>` | Shells out to `node generate-procedural.js --species <id>` + fires per-Look atlas auto-bake fire-and-forget |
| `POST` | `/atlas/bake?look=<id>` | Re-run `bake-look.js` for one Look (used by Grove on curation changes) |

---

## CLI

| Command | What it does |
|---|---|
| `node arborist/serve.js` | Start the backend (called automatically by `npm run dev`) |
| `node arborist/generate-procedural.js [--species procedural_<id>]` | Headless procedural republish; reads `arborist/state/<species>/seedlings.json` overlays + PRESETS fallback |
| `node arborist/bake-look.js --look <id>` | Re-pack per-Look master atlas + emit `trees-atlas.json` |
| `node arborist/bake-trees.js --look <id>` | Substitute placements onto the Look's roster + emit `public/baked/<look>/trees/...` |
| `node arborist/republish-all.js` | Walk every species and re-emit through the full pipeline |
| `python arborist/bake-tree.py --species=<id>` | Bake one species's LiDAR seedling library (Scan mode) |

---

## Determinism

Same `{species, slot, seed, params}` + same on-disk materials → byte-identical GLB across re-publishes. Verified end-to-end on every procedural phase shipped (sha1sum of `public/trees/<species>/skeleton-N-lod0.glb` is stable). Required for `writeIfChanged` mtime stability and cache predictability — see `cartograph/ARCHITECTURE.md` and `project_writeifchanged_touches_mtime` memory.

---

## Pipeline integration

The deployed runtime — `src/components/InstancedTrees.jsx` — consumes Arborist artifacts unchanged:

1. Fetch `public/trees/index.json`
2. Load each species's `skeleton-N.glb` + `tips-N.json` + `manifest.json`
3. Group `park_trees.json` placements by species + variant via `hash(treeId) % nVariants`
4. Render one `InstancedMesh` per `(species, variant)` pair
5. Per-instance shader jitter (branch angle, length, tint micro-variation, wind phase) breaks repetition

The shared material (`src/components/treeAtlasMaterial.js`) carries the bark retint uniforms (`uBarkTintBase`, `uBarkTintJitterRange`, `uBarkRoughnessOverride`, `uBarkUVScale`, `uBarkTileOffset`, `uBarkTileScale`) and the per-vertex `aBark` attribute gate. Single shader program preserved (Bloom-stable). Stage's Surfaces.Trees panel rebinds to the dynamic species list from `index.json`, with per-species tint overrides feeding the runtime uniforms via `scene.materialColors[<species>]`.

Per-Look palette override is instant — `scene.materialColors[<species>]` wins over species default `tintBase` at runtime, no rebake required.

---

## Cross-references

- `README.md` — runtime contract (the slimmer outward-facing version of this doc)
- `SPEC.md` — original v1 build specification (largely shipped; residual decisions folded into `BACKLOG.md`)
- `ARCHITECTURE.md` — load-bearing patterns: publish-loop, two-tier substitution, master atlas, generator contract, bark shader unification
- `BACKLOG.md` — in-flight phases (E, F, G.1–G.5) + parked items
- `NOTES.md` — dated decision record (2026-05-15 maxi-brief is load-bearing)
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern Arborist mirrors
- `../cartograph/README.md` — helper template
