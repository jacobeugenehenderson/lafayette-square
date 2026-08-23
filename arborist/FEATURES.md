# Arborist Features

**What this is.** The Arborist is the kit's tree factory. It turns a real tree species into one reusable, baked model — real geometry, photographed bark, a leaf model that tracks the season — and stamps that model across a neighborhood's canopy. You feed it the species a neighborhood actually has; it gives back the actual trees, at correct botanical heights, standing on the real ground.

**How you make one.** In the Salon you compose a species from parts you can see: a chassis (the woody geometry), a bark, a leaf pack. Publish, and the pipeline bakes three LOD tiers plus a per-Look master atlas that de-duplicates shared bark and leaf tiles — so the *second* hero species costs almost nothing to add. (Procedural and LiDAR authoring are kept as peer tracks; Scan is legacy.)

**What ships today, exactly.** Every tree in Lafayette Square paints — nothing is dropped. The **impostor is the foundation**: each placement renders as a captured canopy billboard, and the **tallest 15%** keep real `lod1` mesh geometry as anchors sprinkled through the scene, so articulated branch-motion and parallax read against a canopy sea that breathes with the same wind. Two impostor constructions are live, split by viewing hemisphere — the **overhead** 3-slice snapshot for browse (zoom out and the whole scene swaps), the **hero** azimuthal canopy bands for the low side-on pan. Both are render-to-texture captures of the actual tree through the shared atlas, so they match their mesh neighbours in colour and season. The geometry budget is a dial (`?heroGeom=`). **Not yet:** the load-streaming that orders GLBs along the pan, the Stage knob for the budget, and KTX2 compression — the hero pool is still ~70 MB of PNG, so this is a look claim, not yet a weight claim. → `ARCHITECTURE.md "Tree-render reality at LS"`.

**What it produces** (the contract the runtime consumes): per-species `skeleton-N.glb` at three LOD tiers + leaf-anchor `tips-N.json` + `manifest.json`, and per-Look atlas artifacts under `public/baked/<look>/`. The same inputs bake byte-identical output, every time.

---

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Operator-facing surface of the helper. Read at session start to know what's already shippable vs. what's still in flight. `BACKLOG.md` carries the in-flight items; `ARCHITECTURE.md` carries the load-bearing patterns; `NOTES.md` carries the dated decision record.

> 🌳 **The Arborist IS the Forest Builder kit-matcher now — not "being rebuilt."** Current contract + front door: **`README.md §⭐ START HERE`**; ratified architecture + staged plan: `scratch/FOREST-BUILDER-KIT-MATCHER.md`. **Built (2026-06-18/20):** the keystone (`rubric.json` 19 axes + `dossiers/` the 10 priority species), the spine (ingest+tagger → `part-index.json` + canonical `public/library/`, the matcher, readiness folded into the **Coverage** "Kit · C·B·L" column, the **Salon** wired to ranked **options** + a **reference panel**), and a **functional leaf model** (derived leaf-size · **Leaf Ways** arrangement · whole-crown fill · varied tile-atlases · an **Authored vs Synthesized** leaf-source toggle). *Open:* the leaf **season/color ramp** (§6); the **LS bake-proof** (Stage-2 gate). The operator surface below is the as-built the kit **rides** — the publish spine is **KEPT, not forked**; the leaf-colorer + bark fixes are now **rubric axes**. Doctrine: **no-cull** (hero-LOD/DoF **parked**, not deleted) · **Authored-only** active, **LiDAR + Procedural kept as equal peer tracks**.

---

## What the helper produces

Per-species runtime artifacts under `public/trees/<species>/`:

- `skeleton-N.glb` — one published variant per `N`, baked at 3 LOD tiers (`skeleton-N-lod0.glb` / `lod1` / `lod2`)
- `tips-N.json` — leaf-anchor positions for per-instance jitter / wind
- `manifest.json` — per-species metadata: variant list, `quality` / `qualityOverride`, `bark` spec (photo-PBR material ref + tint defaults + uvScale), `leafCluster` ref (per-hero), `deformer.range`, and **botanical mature height in meters** (2026-06-25 — `publish-glb.js#normalizeScale` targets the species' dossier `chassis.size`, so a sugar maple ships ~21m and a dogwood ~8m; `mature-heights.json` is the stopgap for roster species without a full dossier yet — see ARCHITECTURE "Botanical mature height")
- `public/trees/index.json` — roster index aggregating all species

Plus per-Look atlas artifacts emitted by `bake-look.js`:

- `public/baked/<look>/trees-atlas.json` — master atlas tile map, `barkBySpecies` block, per-species overrides, `deformerBySpecies`, and (dormant) `impostorBySpecies` layer plans
- `public/baked/<look>/trees/<species>/...` — placement-substituted GLBs for the Look

These are the contract the deployed runtime (`InstancedTrees.jsx`) consumes. The helper's job is to keep them deterministic and pristine.

> 🌲 **What ships to LS today (tree-render reality, 2026-07-22):** the **impostor is the FOUNDATION** — every placement paints as a captured canopy billboard and the **tallest `heroGeomFraction`** (default 0.15, live via `?heroGeom=`) keeps real lod1 mesh as anchors. **Nothing is culled** in foundation mode: the old hero-pan prominence `cull` was dropping 69% of placements onto bare ground and is retired (it survives only for foundation-off looks). Two impostor systems, by viewing hemisphere — **overhead** 3-slice snapshot (`overheadBySpecies`, browse) and **hero** azimuthal canopy bands (`heroImpostorBySpecies`, the side-on pan) — both RTT captures of the real tree on the shared atlas material, both browser-GPU authored and carried by `bake-look`. ⛔ The whole-tree octahedral cross (`impostorBySpecies`) is **killed, not parked** — don't revive it. Visual distance is the **depth gauges'** job (DoF/fog — "DoF is the cover"). ⚠️ **Don't read the Preview GPU gauge as a perf signal** (count-vs-fake-budget, ignores frame-ms, red even with no trees) — gate tree perf on real device frame-ms + the operator's eye on the cinematic pan. Full as-built + doctrine + the open weight/streaming work: ARCHITECTURE "Tree-render reality at LS."

---

## Authoring surface: Salon is default; Procedural / LiDAR are kept peer tracks; Scan is legacy

> 🌳 **Doctrine (2026-06):** **Authored-only (Salon) is the active track; Procedural + LiDAR are kept as equal PEER tracks** (reachable, not retired). Only the **Scan** Workstage is genuinely legacy/deprecating. Where the prose below calls Procedural/LiDAR "legacy," read "peer track (kept), reachable via `?legacy=` dev-fallback URL."

**Post-Brief-18A (Mullion, 2026-05-23)**: the Arborist UI (`/arborist`) opens **directly into the Salon Workstage** — there is no Library landing, no mode-selector chrome at the top. The header reads `Arborist / Salon` (brand) + `LookPicker` + `Grove →` button. Procedural, LiDAR, and the legacy Scan Workstage stay reachable only via dev-fallback URL params (`?legacy=procedural`, `?legacy=lidar`, `?legacy=workstage&species=<id>`, `?legacy=grove`) during the transition to Brief 18B (source-picker — merges Procedural + LiDAR's authoring affordances into Salon's slot card; queued). All workspaces' `← Library` buttons now read `← Salon` and route home to the Salon Workstage.

The four authoring paths (Salon + the three legacy modes) all share the same publish pipeline and the same per-Look atlas pass. The chrome flattened; the publish contract did not change. Below, each path is documented; Salon is the operator's canonical surface as of 2026-05-23.

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

### Salon mode (`src/arborist/SalonWorkstage.jsx`, Brief 1 shipped 2026-05-21; roster-driven nav Brief 26; **rebuilt as the plate-rack 2026-06-25**)

> ⭐ **REBUILT 2026-06-25 — the Salon is now the rubric-forward "fashion-plates" rack.** The **current surface** is `SALON-INTERFACE.md` (root, §5/§7). What changed: **chassis · bark · leaf are visual PLATES** (chassis = live gray silhouettes, `ChassisPlate.jsx`; bark = swatches; leaf = cutouts) with per-plate **★ Approve** + `(Add +)`; edits **autosave**; a **3-variants** toggle eye-gates the deformer; the deformer is **automatic by morphology** (panel retired). **Retired:** the Deformer panel, the Bark gradient editor, Adopt, Re-publish, the Oubliette, Studio/Worm; Tilt/Y-up moved to an "advanced" drawer; the bio card moved to the tools rail (inline photos). The detail below describes the *pre-rebuild* knob surface — kept for the schema/publish mechanics it documents, but for the live UI read `SALON-INTERFACE.md`.

Fourth top-level mode. The Salon pivots from *generation* (Procedural / LiDAR — synthesize a tree) to *composition* — operator picks **chassis + bark + leaves** from existing libraries and the publish pipeline emits a compatible artifact unchanged.

**Why it exists:** the Salon arc is the operator's call to ship v1.5 by composing rather than synthesizing. Two prior generation-focused arcs hit ceilings (Phase G.1 procedural progressing slowly; Li'l Vera LiDAR shelved 2026-05-20 at N.3.0). The Arborist already has the publish pipeline, atlas system, and runtime contract — Salon is a parallel authoring surface that emits compatible output.

**Roster-driven navigation (Brief 26).** The Salon's authoring **unit is the ROSTER species** (what Lafayette Square needs), not the library species. The old "SPECIES" dropdown is gone; the top nav is a **roster navigator** (left column, `RosterNavigator`) listing every canonicalized park species from `GET /coverage` (Brief 24's join) — each row shows placement count, coverage badge (🟢 literal / 🟡 composite / 🔴 gap), and authoring state (composed / not-available / unauthored), filterable by name + state. Clicking a roster species opens the **inside authoring view**: the existing composition controls (chassis + bark + leaves + height/transform), re-parented under that species, plus a **recommended ↔ show-all** candidate toggle and a **Mark not-available** action.

**The keying spine — canonical-id-per-roster-species (settled 2026-05-25).** Every roster species resolves to exactly one **canonical library-species-id = a deterministic slug of its canonical roster name** (`Oak, Pin` → `oak_pin`, `Ash, Green` → `ash_green`; `roster-coverage.js#slugifyRoster`). Distinct per roster species (Pin Oak ≠ Willow Oak — no more "all oaks collapse to one"), no botanical auto-guess; the operator can hand-rename a slug to a botanical id in `park_species_map.json` later. Composing writes the composition under the canonical id (`state/<canonicalId>/compositions.json` → `public/trees/<canonicalId>`, via the **unchanged** publish path — `listSalonSpecies` auto-includes any id with a compositions file) **and** sets `park_species_map[rosterName] = [canonicalId]` (the routing source of truth read by `bake-trees.js#pickVariant`). The chassis is **free geometry** — picking any chassis (incl. an unlabeled split / generic via *show all*) IS the assignment; the chassis's own `source.species` keys nothing. The shared join + canonical resolution + candidate computation live in one module, **`arborist/roster-coverage.js`** (lifted from Brief 24's inline `/coverage` handler).

- **Candidate scope:** *recommended* = chassis whose `source.species` is one of the roster species' covering library ids (the coverage join's literal/cousin candidates), intersected with the catalog so procedural/forest chassis stay excluded; *show all* = the full chassis catalog.
- **Not-available:** marks a deliberate gap — writes `park_species_map[rosterName] = []`. The roster species is recorded as not-available and shown as such; *bake honoring "→ no tree" is a deferred `bake-trees.js` follow-up* (out of Brief 26's scope walls — authoring/routing only).

**Workstage layout** — fork of `ProceduralWorkstage.jsx` with the per-slot controls rail and data wiring swapped (~70% lifted intact: slot tabs, viewport, LoD selector, perf gauge, wind toggle, DraftSlider, header/footer pattern). The replaced sections are:

| Section | Knobs | Notes |
|---|---|---|
| **Chassis** | Picker dropdown (filtered/ranked by species morphology), height-range readout | Reads `public/trees/_chassis/<name>.glb` + `<name>.meta.json` sidecar (Whittle, Brief 0). Chassis-library empty → workstage shows a regenerate instruction (`node arborist/survey-deleaf.js`). **Every chassis ships dominant-trunk-base at ~origin, Y-min at 0** (Brief 20, Sextant 2026-05-25 — recentered at source; `heightRange` is now `[~0, H]`). |
| **Bark** | Ref dropdown, uvScale X/Y `DraftSlider`s, tintBase + tintJitterRange color pickers, roughnessOverride `DraftSlider` | Lists `public/textures/bark/<ref>/`. |
| **Leaves** | Pack dropdown, occupancy + scale `DraftSlider`s, tintFront + tintBack color pickers | Lists `public/textures/leaves/shapes/<pack>/shape.png` — RGBA composites of vendor Color RGB + Opacity alpha. Brief 1.5a (Sequoia) shipped `palmate`/`lobed`/`ovate` (LeafSet010/016/005). Brief 1.5e (Fern, 2026-05-21) expanded the library to 10 packs: `+ serrate_ovate` (LeafSet001), `+ heart` (LeafSet004), `+ elm_autumn` (LeafSet007), `+ oak_autumn` (LeafSet012), `+ lanceolate` (LeafSet013), `+ long_needle` (LeafSet019), `+ ovate_large` (Leaf001). Each pack carries a `meta.json` sidecar (`morphology`, `naturalSize` in cm, `recommendedSpecies`, `source`) — Phase F-prep metadata; today documentation only, scale knob stays operator-driven. Falls back to flat `public/textures/leaves/*.png` when no shapes/ dir present. |

**Per-slot actions** (footer): ↺ Reset · → Set canary · manual Name input *(✓ Adopt retired 2026-06-25 — autosave persists every edit; the footer is now a slim "edits autosave; bake from the Grove" hint)* (no dice — compositions are deterministic from chassis + bark + leaves; no seed roll). The canary button (Brief 8, Linnet 2026-05-22) mirrors Grove's writer and is enabled only when the composition is not dirty, has been published (`variantId` exists in `public/trees/<species>/manifest.json#variants`), and a Look is active; tooltip surfaces the highest-precedence unmet condition. The slot tab carries a small `CANARY` chip when its composition is the active Meteorologist canary (subscribed via `storage` events — cross-tab + same-tab via the synthetic event the store action dispatches).

**Species set (`listSalonSpecies`):** union of (a) species with at least one chassis in `_chassis/` (via `meta.source.species`) AND (b) species with an existing `arborist/state/<species>/compositions.json`, minus procedural + LiDAR-Scan species. Post-Brief-26 the operator navigates by roster species (above) rather than this library-species set, but the set still gates the publish path (which includes any slug id once its compositions file is written).

**Persistence:** the Salon-open flag persists to `localStorage` so reloading inside Salon returns to Salon (mirrors the `activeLookId` pattern). The other modes (Procedural / LiDAR / Grove) intentionally don't persist.

**Effective-value layering** (server-side, surfaced in `effective` per composition): `DEFAULTS → CHASSIS_DEFAULTS → operator overlay`. UI controlled selects bind to `effective.*`. Store action `setSalonSlotParams` mirrors patches into both `params` and `effective` so changes reflect immediately without a server round-trip.

**Composition data model** — per-species overlay at `arborist/state/<species>/compositions.json`:

```json
{
  "compositions": [
    {
      "slot": 1,
      "name": "<operator label>",
      "chassis": "<chassis-name from _chassis library>",
      "bark":    { "ref": "Bark007", "uvScale": [1.5, 4], "tintBase": "#3a2820", "tintJitterRange": 0.12, "roughnessOverride": 0.8 },
      "leaves":  { "pack": "palmate", "occupancy": 0.7, "scale": 1.0, "tintFront": "#3a7530", "tintBack": "#a8b89a" },
      "deformer": {},
      "transform": { "posOffset": [0, 0, 0], "rotation": [0, 0, 0], "scale": 1 }
    }
  ]
}
```

`deformer` is filled by Brief 3A (Cant, 2026-05-25) — `deformer.range = { lean:[lo,hi], twist:[lo,hi], wander:[lo,hi] }` (lean/twist radians, wander metres); see "Per-instance deformer" below. Brief 4 adds camera-aware hemisphere cull. Brief 2 (Holm, 2026-05-21) shipped multi-stop gradient bark on top of this schema — see "Bark gradient maps" below. `transform` (Brief 19) is the authored gizmo correction — absent/identity renders byte-identical (back-compat).

**Authored chassis transform — persist + bake (Brief 19, Quartz 2026-05-25):** the Salon gnomon gizmo (rotateY / posOffset / scale / tiltX-Z drag handles + rotate ring + the "Y-up trunk 90°X" button) stands-up, centers, and scales mis-oriented vendor chassis (kit models often arrive Z-up / off-center / leaning). The authored value persists to `composition.transform` (`{posOffset, rotation:[tiltX,rotationY,tiltZ] radians XYZ, scale uniform}`) and **bakes into the published GLB geometry** so the chassis ships exactly as the operator saw it. *Was inspection-only* — local state reset on every slot/chassis switch, never written; the Z-up flip evaporated on publish. **The bake replicates the viewport composition exactly** (`[[project_preview_equals_ls_literally]]`): `SpecimenViewport.jsx`'s `<Skeleton>` composes `R · S · T_posOffset · T_autocenter` — it auto-centers the dominant-trunk base (`computeDominantTrunk`) to the bullseye BEFORE the authored transform, so rotation/scale pivot about the **trunk base, not the group origin**. `generate-salon.js#bakeAuthoredTransform` bakes the **conjugated** form `v' = T_autocenter⁻¹ · R · S · T_posOffset · T_autocenter · v` (in-place: correction about the trunk base, base stays put; identity → geometry untouched, byte-identical). Persist + hydrate is client-side (gizmo `onChange` → `onParams({transform})`, hydrate on slot/chassis switch); the bake runs **only on the publish path** (`writeMultiCompositionGLB`) — the live preview leaves the transform to the gizmo, so the published GLB carries it baked once with no runtime double-transform. Restores Brief 3A's premise (merge-time pivot now reads corrected geometry). The separate global off-origin lean / wind-frame bug is fixed by **Brief 20** (Sextant 2026-05-25 — chassis recentered to dominant-trunk origin at source; on a recentered chassis `T_autocenter ≈ I`, so this conjugation degenerates to plain `R·S·T` about origin and keeps working trivially — authored `posOffset` stays valid because the recenter does at source what the viewport auto-center did at display).

**Leaf emission stub (Brief 1):** chassis `leafAttachmentTags` are operator-authoring fields populated post-Brief-1. While the array is empty, the generator samples a deterministic placement set from the chassis's upper-bbox volume (mulberry32-seeded by `hash(chassis|bark.ref|leaves.pack)`) so the operator has visible leaves to author against. The lifted D.1b helpers consume that point set just as they consume terminal-tip positions in the procedural path.

**Chassis curation (Brief 1.5b, Quill 2026-05-21):** the Salon Chassis section gains a curation surface so the operator can rename and approve/reject chassis from the 141-entry library. Lives at `arborist/state/_chassis-curation.json` (sibling to compositions; never under `public/trees/_chassis/` so it survives Brief 1.5c's upcoming `survey-deleaf.js` re-run). Schema is `{chassis: {'<name>.glb': {displayName, approved, notes}}}` where `approved` is tri-state (`true` / `false` / `null = unreviewed`). The Chassis section now carries: (a) an **Approved only** filter checkbox (default ON) — when ON, the picker drops chassis whose `approved !== true`; (b) **dropdown labels** = glyph (★ approved / · unreviewed / ✗ rejected) + `displayName` (falling back to filename) + morphology + max-height; (c) a **curation row** below the picker — `displayName` text input (commits on blur or Enter), tri-state Status button (cycles unreviewed → approved → rejected → unreviewed), notes textarea (collapsed until the operator clicks "+ Add note"). Endpoints: `GET /salon/curation` and `POST /salon/curation/:chassisName`; POST merges with absent-keys-preserved (only fields present in the body touch the file; `null` for displayName/notes clears, `null` for approved restores unreviewed; empty entries are pruned). Paired `_chassis-curation.defaults.json` carries the schema doc + an empty `chassis: {}` backstop.

**Bark gradient maps (Brief 2, Holm 2026-05-21) — ⛔ EDITOR RETIRED 2026-06-25.** The multi-stop `BarkGradientEditor` UI is removed from the Salon — bark color is a rubric axis + the **posterize recolor** now (`SALON-INTERFACE.md §2`). The runtime LUT/atlas machinery below is **dormant, not deleted** (an authored `gradientStops` still renders). *Original:* above the legacy single-tint controls, each composition's Bark section gains a `BarkGradientEditor` block — **Use gradient** checkbox, CSS-`linear-gradient` ramp visualization, per-stop t-slider + color picker + delete (disabled at the 2-stop minimum), and a **+ Add stop** button that inserts at the largest-gap midpoint with interpolated color. Stops persist as `composition.bark.gradientStops = [{t, color}, ...]` via the existing overlay POST. Last-authored stops are stashed in a component ref so a toggle-OFF / toggle-ON round trip preserves the operator's work. Backwards-compat: compositions without `gradientStops` render through the Brief 1.5a single-tint runtime path unchanged. Toggle OFF clears stops on disk; toggle ON reapplies stash or seeds a sensible 2-stop ramp from `tintBase`. At publish time, `generate-salon.js#patchManifestForSalon` writes per-variant `manifest.json#/variants[i].bark.gradientStops` (composition[i] → variantId i+1, matching publish-glb's emission order). `bake-look.js` compiles each ramp to a 256×1 sRGB RGBA LUT (sha1-deduped — identical ramps across compositions/species collapse to one tile), packs the LUTs as a third `barkGradient` sub-atlas page inside `unifyAtlases`, and emits `trees-atlas.json#/barkGradientByVariant[species][variantId] = { offsetU, offsetV, scaleU, scaleV }`. Runtime: three uniforms on the shared `treeAtlasMaterial` (`uUseBarkGradient`, `uBarkGradientTileOffset`, `uBarkGradientTileScale`); the fragment chunk samples the LUT from the existing `map` sampler at `vec2(jh4, 0.5) * Scale + Offset` where `jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453)` — a fresh per-instance hash channel uncorrelated with `tintJitter`'s `jh1/jh2/jh3`. Gradient tint replaces the legacy single-spec/region tint via `mix(barkTint, gradientTint, uUseBarkGradient)`. Uniform-driven branch on the same compiled program — Bloom-stable single shader program preserved. `InstancedTrees.jsx#applyBarkUniforms(material, barkSettings, gradientSlot)` reads the per-variant slot keyed by `(urlToSpecies, urlToVariantId)`; absent slot → `uUseBarkGradient=0` → legacy path. Bake's atlas-survey path is untouched (LUT tiles aren't GLB-material-bound).

**Bark Detail Texturing (Brief 2.1a, Cinder 2026-05-21):** an additive composite layer over whatever bark color path produces — single-tint, gradient-on, gradient-off all unaffected. Gaming-standard Overlay-blend technique (Unreal Detail Texture / Unity HDRP Detail Albedo). Pre-bake: `arborist/extract-bark-detail.mjs` runs once per bark library refresh — for each `public/textures/bark/<ref>/color.jpg`, applies sharp's Gaussian blur (σ=15px on 1024 source), subtracts blurred from original + centers on 0.5 grey, writes `detail.png` (greyscale, single-channel, ~700KB–1.2MB per ref, idempotent with mtime-touch on no-op). At bake: `bake-look.js` collects each roster species's primary bark `materialRef` (trunk wins for region-split), reads the matching `detail.png`, packs as a fourth `barkDetail` sub-atlas page inside `unifyAtlases` (same master PNG — no new sampler binding, Bloom-stable). Emits `trees-atlas.json#/barkDetailBySpecies[<species>] = { uvTransform, barkTileUV }` — the second field carries the species's primary bark tile bounds in unified-atlas space so the runtime can recover local-UV from `vMapUv` (which spans only the bark sub-region) before mapping into the detail tile. Runtime: five new uniforms on `treeAtlasMaterial` (`uBarkDetailTileOffset/Scale`, `uBarkDetailStrength` default 1.0, `uBarkTileOffset/Scale`); the fragment chunk runs the Overlay-blend `mix(2*ab, 1-2*(1-a)*(1-b), step(0.5, a))` on the FINAL bark color and mixes the composite back via `uBarkDetailStrength`, gated by `vBark` so leaf fragments pass through identity. Uniform-driven, single compiled program. `applyBarkUniforms` reads the per-species slot via URL→species; absent slot → identity (no detail bound). For region-split species (trunk + branch ref different), only trunk's detail composites — branch fragments receive trunk's detail map keyed against trunk's bark tile bounds, which is a known visual approximation pending Phase G detail-per-region work.

**Per-instance deformer (Brief 3A, Cant 2026-05-25):** the compose-don't-synthesize capstone — one chassis renders ~100 visually-distinct instances via per-instance vertex-shader displacement, no extra baked variants. Three rigid ops applied to `transformed` in the shared `treeAtlasMaterial` vertex shader BEFORE Sough's wind sway (wind oscillates around the deformed rest pose): **lean** (tilt toward a per-instance compass azimuth, angle grows base→top so the base stays planted), **twist** (rotation about local Y, angle grows base→top), **wander** (sinusoidal-in-height XZ drift of the centerline). All pivot about the trunk base = **origin** (Brief 20 recenter — no per-chassis pivot). Each op's per-species `[lo,hi]` range is now **morphology-derived automatically** (A1, 2026-06-25 — `generate-salon.js#DEFORMER_BY_MORPHOLOGY` keyed on chassis morphology `broadleaf`/`conifer`/`columnar`/`weeping`, injected at `resolveEffective`; the Salon **Deformer panel is retired** — ⚙️ **operator knob = the `DEFORMER_BY_MORPHOLOGY` table**, tune magnitudes there, eye-gate pending), sampled per-instance by a world-XZ hash seeded from the **instance anchor** (`instanceMatrix[3].xz`, `modelMatrix[3]` fallback in the non-instanced Salon preview) so every vertex of one tree shares one signature and a fixed-XZ tree always deforms identically (deterministic). Fresh hash channels `dh5/dh6/dh7/dh8` (vertex-side, uncorrelated with the fragment `jh1-jh4`). **Normals stay correct without inverse-transpose:** the ops are rigid rotations, so the SAME lean∘twist `mat3` rotates `objectNormal` — but because three.js consumes the normal in `<beginnormal_vertex>` (before `<begin_vertex>`), the matrix is built and the normal rotated there, then the matrix + wander offset are reused on `transformed` in `<begin_vertex>` (cross-chunk `main()`-scope locals). Range uniforms (`uDeformLeanRange/uDeformTwistRange/uDeformWanderRange`, default `(0,0)` → identity, bit-exact regression-safe) are set per-draw via a sibling `applyDeformerUniforms` (NOT a widened `applyBarkUniforms`); a `uDeformSeed` perturbs the preview hash for re-roll (0 in LS). Single compiled shader program preserved (uniform+attribute branch, no `customProgramCacheKey`, no `#define`). The `aTreeHeightNorm` attribute (normalized trunk-base→top Y) is computed at **runtime-merge** time — chassis-wide Y-bbox scan shared across LS (`InstancedTrees#meshes`) and preview (`SpecimenViewport` → `stampTreeVertexAttrs`) — so GLB + atlas bytes are untouched (reintroduces Cork's retired scan; the scan was always sound, only 10A's camera-angle-dependent bark consumer was wrong). `generate-salon.js#patchManifestForSalon` writes `manifest.json#deformer.range`; `bake-look.js` passes it through to `trees-atlas.json#deformerBySpecies` (runtime-consumed, nothing atlas-baked). The deformer still fires in the Salon preview so the **automatic** per-type variation is visible (one representative hash sample; the operator no longer authors it — `uDeformSeed`/re-roll retired with the panel). **3B** (designed hero slots + PlaceCard binding) and **3C** (canopy asymmetry + branch jitter — those need inverse-transpose normals) are deferred.

**Bark plumbing (Brief 1.5a):** `generate-salon.js#patchManifestForSalon` writes the first composition's bark spec into `public/trees/<species>/manifest.json#bark` after `publish-glb.js` completes, in the exact shape `bake-look.js#flatten` expects (`materialRef`/`uvScale`/`tintBase`/`tintJitterRange`/`roughnessOverride`). Runtime `InstancedTrees.jsx#applyBarkUniforms` then drives per-draw uniforms — the operator's tintBase / uvScale / roughnessOverride / per-instance jitter visibly land at LS. Single bark spec per species (procedural's model); per-composition bark texture variation lives in each variant's GLB. `qualityOverride: 4` (Hero tier) so Salon variants win their bucket's quality lottery vs the procedural fillers. Salon's `main()` also calls `syncLookRoster('lafayette-square', ...)` so the published variants appear in LS placements after the next bake-look + bake-trees (Brief 1 deferred this; 1.5a closed the loop).

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

## Full monte (`?view=fullmonte` → `src/components/TreeDiorama.jsx`)

**The first view anywhere in the product that shows a FINISHED tree.** One
specimen from the Look's **bake**, wearing the shared tree atlas the map's trees
wear, mounted in the neighbourhood's real sky and lit by it, with the production
sway driver attached. Not a composition check — a *ship* check.

⭐ **Why it exists.** The Salon's cyclorama answers "is this composition right".
Nothing answered "is the thing we ship good", which is exactly how a publish
contract that paints leaves with bark reached production without anyone noticing
(`BACKLOG.md`, 2026-08-22). A view that shows the shipped artifact, dressed the
way the runtime dresses it, is the check for that whole class.

⛔ **It is the SAME component the marketing embed mounts** (`?embed=tree`) — one
method, two mounts. A second implementation here would drift, and the drift would
be invisible because both would look plausible.

- `?view=fullmonte` — read straight off the URL, not a store flag: it is a
  destination you link to, not a mode you can get stranded in.
- `&species=` / `&lod=` / `&variant=` — swap the specimen. Defaults to the Look's
  baked `linden_american` at lod0.
- Reads `public/baked/<look>/trees/…`, ⛔ **never** `public/trees/` (gitignored
  authoring pool, never read by runtime — see `.gitignore`). So what it shows is
  what deploys.
- The specimen's primitives are stamped with `stampTreeVertexAttrs` and drawn
  merged when their attribute sets agree, **unmerged when they do not** — the
  baked linden is 3 parts with divergent attrs, and an earlier cut that returned
  nothing in that case rendered an empty sky. One `[TreeDiorama]` console line
  reports parts / merge state / tris / height on every mount, so "loaded but drew
  nothing" cannot be silent.
- ◻ **Wind is mounted but still**: the sway driver reads the atmosphere
  directive, and the meteorologist does not yet author wind into it. See
  `ls/OPERATIONS.md §5`.

## Grove (`src/arborist/Grove.jsx`)

Per-Look roster curation. Reads `public/looks/<look>/design.json#/trees`; lets the operator scope `In Look` / `All Published`, click a tile to select it → toggle membership in the fixed editor panel, fires `/api/cartograph/looks/<id>/trees` + `/api/arborist/atlas/bake?look=<id>` automatically. **The Grove is how operators prune heavy hand-authored variants from a Look — not by editing design.json directly.**

**Population is roster-driven (Brief 27, Scion 2026-05-25).** The Grove is populated by **published Salon compositions**, not a "rate it, then add it" gallery. Compose a species in the Salon and **Re-publish** → `generate-salon.js#patchManifestForSalon` stamps the variant Hero (`qualityOverride: 4`) and `syncLookRoster` adds it to the active Look's `design.json#/trees` → it appears in the Grove **In Look**, no manual rating step. Visibility = **published-and-in-roster**, never a Fill/Mid/Hero rating the operator must set. The `GET /grove` gate (`serve.js`, `quality < 2` skip) survives only as a **published-not-raw-chassis** filter — raw ingested vendor chassis stay at quality 0 and are kept out; published compositions are always Hero so they pass. (The per-tile rating ladder in the editor panel stays — it still authors `qualityOverride`, which feeds `bake-trees.js#pickVariant`'s hero-lottery via `index.json` — but it no longer gates Grove visibility. Whether that lottery is still meaningful under one-composition-per-roster-species, and an explicit `v.published` marker to decouple the gate from the rating *value*, are deferred follow-ups.)

**Authoring/production gesture split (Brief 14, Lintel 2026-05-23; extended Brief 14.1, Corbel 2026-05-25):** the Grove bake is now the *explicit* ship-to-slab gesture. Both authoring Re-publish paths — **Salon** (Brief 14) and **Procedural** (Brief 14.1) — stage species artifacts to the library (authoring side) but no longer auto-bake; baking the master atlas / slab is a separate, intentional Grove action. **Updated 2026-06-25:** edits now **autosave** and the **Grove bake regenerates-from-source** (`generate-salon` → `bake-look` → `bake-trees`, `15682e55`), so the explicit per-species **Re-publish is retired** — the workflow is **author (autosaves) → Grove "Bake → Slab" (regenerates + ships).** This still keeps the operator's mental model clear about when LS actually changes (only on the bake). Per `project_authoring_is_live_production_is_static`. (The Vellum posterized-substrate auto-extract rides `bake-look.js`, so it now fires on the Grove bake — correct, extraction stays tied to the bake step.)

The Grove's master atlas (`bake-look.js:unifyAtlases`) is the load-bearing innovation that makes hero species nearly free to add: `atlas-survey.js` dedupes tiles by sha1 hash before pack, so hero bark + leaf-cluster tiles collapse against the filler roster's identical content. See `ARCHITECTURE.md` for the full story.

**Set as Meteorologist canary** (per-tile editor-panel affordance). Click `→ Set as Meteorologist canary` on any tile to publish `{species, variantId, lookId}` into `localStorage.meteorologist-canary-tree`. Meteorologist's CanaryScene listens for the `storage` event (cross-tab, same origin) and swaps its hero tree to match — useful for sanity-checking a freshly adopted variant under stormy weather conditions without leaving Arborist. Per-operator UI preference; not authored, not per-Look state. Contract lives in `ARCHITECTURE.md` "Arborist ↔ Meteorologist canary contract".

### Gallery ↔ Coverage view toggle (Brief 24, Cadastre 2026-05-25)

The Grove header carries a top-level view toggle:

- **Gallery** — the by-model 3D crop (per-Look `In Look` / `All Published` scope + click-to-select editor panel). All roster-curation behavior lives here. **Per-tile editing is click-to-select → a fixed right-rail `GroveEditorPanel` (Brief 31, Cleat 2026-05-25), retiring the camera-chasing `<Html>` hover-card.** (Brief 27 retired the Fill/Mid/Hero quality filter — every published composition is Hero, so the filter was inert.)
- **Coverage** (`src/arborist/CoverageView.jsx`) — a **read-only**, roster-anchored "have vs need" table. One row per *canonicalized* Lafayette Square park species (from `src/data/park_trees.json`), sorted by placement count descending, each tagged 🟢 **literal** / 🟡 **composite** / 🔴 **gap**, with the covering library species and the current `park_species_map.json` routing. It reproduces, live, the join hand-maintained in `arborist/ROSTER-COVERAGE.md`. Computed by `GET /coverage`; writes nothing.

**Coverage classification (derived on the fly, never persisted — slab provenance is the separate Brief 25):**
- 🔴 **gap** — the species has no `park_species_map` routing to any *existing* library species (no published manifest, no chassis, no composition). This is the roster-anchored shopping list.
- 🟢 **literal** vs 🟡 **composite** — a name-token heuristic: literal iff the park name's distinctive tokens (genus stopword removed; bare-genus names fall back to the genus token) all appear in a routed library id's `id` / `label` / `scientific` text. Imperfect on cultivars (e.g. honeylocust "thornless") and a stale/wrong map entry surfaces as composite (e.g. `black locust → gleditsia_triacanthos` mis-routing) — **the operator owns the final literal/composite call**; the routing column is shown so they can verify and hand-correct `park_species_map.json`.

**Map-refresh worktable.** Each row displays its current `park_species_map.json` routing and flags ⚠ missing (no map entry) / ⚠ dangling (routed at a library id nothing answers to) / thin (routed at a published-but-no-chassis species). The view *displays* routing only — it never writes `park_species_map.json` (curation is by hand). This is the surface for refreshing the stale (2026-04-29) map so `bake-trees.js#pickVariant` fans the park-names onto the right published species.

**Canonicalization** — `arborist/roster-name-canon.json` (`{ "<raw name>": "<canonical name>" }`) merges messy duplicate roster names (casing / word-order / cultivar) before counting, so the coverage list doesn't double-count. Operator-editable; seeded from the 5 merges in `ROSTER-COVERAGE.md` §intro (Oak Pin + restricted = 46, Bald Cypress + Baldcypress = 25, etc.). Unmerged raw names pass through as their own canonical name (visible, so a missing merge is spottable). Canonical counts sum to the full 756 placements.

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
| `GET` | `/coverage` | **Read-only (Brief 24, Cadastre):** roster-anchored have-vs-need join, computed by the shared `arborist/roster-coverage.js#computeCoverage` (lifted from inline in Brief 26). Canonicalized park species (`park_trees.json` merged via `roster-name-canon.json`) × library (`index.json` + `_chassis/*.meta.json` + `state/*/compositions.json`) × routing (`park_species_map.json`). Returns `{summary, species:[{species,count,mergedFrom,coverage,covering,routing,mapMissing,dangling, canonicalId,recommendedChassis,authoringState,publishedCanonical}]}`. Provenance derived on the fly. Powers the Grove Coverage view (Brief 24) + the Salon roster navigator (Brief 26). |
| `POST` | `/coverage/:rosterName/routing` | **Brief 26 (Cadastre 2026-05-25):** the ONE `park_species_map.json` write. Body `{canonicalId}` → `map[rosterName]=[canonicalId]` (composed); `{notAvailable:true}` → `map[rosterName]=[]` (deliberate gap). Mirrors the value onto the merge table's raw aliases so `bake-trees#pickVariant` routes every placement. Preserves `_doc`/`_libraryAt` + key order. |
| `GET` | `/procedural/species` | List of procedural species + hero entries |
| `GET\|POST` | `/procedural/:species/seedlings` | Procedural seedlings overlay (`arborist/state/<species>/seedlings.json`); GET returns `effective` field per variant (PRESETS base merged with operator overlay) |
| `POST` | `/procedural/generate` | Returns `model/gltf-binary` directly for a single (species, slot, seed, params) — used by the workstage dice/preview loop |
| `POST` | `/procedural/:species/publish?look=<id>` | **Authoring-only (Brief 14.1, Corbel 2026-05-25):** shells out to `node generate-procedural.js --species <id>` (which syncs the Look roster in its `main()`) + rebuilds the index. Stages species artifacts to the library; does **not** bake the slab atlas. `?look=` accepted + echoed but vestigial (no longer triggers a bake). Slab bake is the explicit Grove gesture (`/atlas/bake`). |
| `GET`  | `/salon/species` | Salon species: chassis-available OR composition-authored (union) |
| `GET`  | `/salon/:species/chassis` | Chassis catalog (`public/trees/_chassis/`); optional `?morphology=` filter |
| `GET`  | `/salon/:species/bark` | Bark refs under `public/textures/bark/` |
| `GET`  | `/salon/:species/leaves` | Leaf packs (shapes/ dir if present, else flat PNG fallback) |
| `GET\|POST` | `/salon/:species/compositions` | Overlay; GET returns `effective` per composition; POST merges with absent-keys-preserved |
| `POST` | `/salon/generate` | Body `{chassis, bark, leaves, lod}` — returns `model/gltf-binary` for live preview |
| `POST` | `/salon/:species/publish?look=<id>` | **Authoring-only (Brief 14, Lintel 2026-05-23):** shells out to `node generate-salon.js --species <id>` + rebuilds the index. Stages species artifacts to the library; does **not** bake the slab atlas. `?look=` accepted + echoed but vestigial (no longer triggers a bake). Slab bake is the explicit Grove gesture below. |
| `GET`  | `/salon/curation` | Salon chassis curation file (`arborist/state/_chassis-curation.json`) |
| `POST` | `/salon/curation/:chassisName` | Body `{displayName?, approved?, notes?}` — merges with absent-keys-preserved; `null` clears displayName/notes or restores unreviewed for approved |
| `POST` | `/atlas/bake?look=<id>` | Re-run `bake-look.js` for one Look (used by Grove on curation changes). **The explicit ship-to-slab gesture** — post-Brief-14 this is the *only* path that rebuilds the master atlas / slab artifact. |

---

## CLI

| Command | What it does |
|---|---|
| `node arborist/serve.js` | Start the backend (called automatically by `npm run dev`) |
| `node arborist/generate-procedural.js [--species procedural_<id>]` | Headless procedural republish; reads `arborist/state/<species>/seedlings.json` overlays + PRESETS fallback |
| `node arborist/generate-salon.js [--species <id>]` | Headless Salon republish; reads `arborist/state/<species>/compositions.json` overlays + chassis-defaults + kit DEFAULTS |
| `node arborist/survey-deleaf.js` | Regenerate the gitignored chassis library at `public/trees/_chassis/` (Whittle, Brief 0). Brief 1 acceptance-testing depends on this. |
| `node arborist/bake-look.js --look <id>` | Re-pack per-Look master atlas + emit `trees-atlas.json` |
| `node arborist/bake-trees.js --look <id>` | Substitute placements onto the Look's roster + emit `public/baked/<look>/trees/...` |
| `node arborist/republish-all.js` | Walk every species and re-emit through the full pipeline |
| `python arborist/bake-tree.py --species=<id>` | Bake one species's LiDAR seedling library (Scan mode) |

---

## Determinism

Same `{species, slot, seed, params}` + same on-disk materials → byte-identical GLB across re-publishes. Verified end-to-end on every procedural phase shipped (sha1sum of `public/trees/<species>/skeleton-N-lod0.glb` is stable). Required for `writeIfChanged` mtime stability and cache predictability — see `cartograph/ARCHITECTURE.md` and `project_writeifchanged_touches_mtime` memory.

---

## Decimation pipeline (Brief 6, Spindle 2026-05-22)

Inside `publish-glb.js`'s per-variant loop, after `loadVariantDocument` and before LoD emission, two tree-aware decimation levers run:

**Lever 3 — card-aware leaf-card reduction** (`arborist/decimate-tree.mjs`, importable). For each primitive with `extras.atlasKind === 'leaf'`:
- If `max-vert-use === 1` (Robinia-class card-based topology), compute per-triangle XZ centroid, build 2D convex hull of all centroids, drop interior triangles by deterministic Knuth-hash with `innerHullDropFactor` (default 0.6). Outer-silhouette triangles (within `outerHullToleranceFrac × bboxDiag` of hull boundary, default 0.05) are always kept.
- If `max-vert-use > 1` (Linden-class connected-mesh), skip — defers to MeshoptSimplifier.
- If `tcount < minTrisToFire` (default 1000), skip — chassis was already light.
- Stamps `prim.extras.spindleDecimated = true` for idempotency on re-runs.

**Lever 4 — adaptive simplify-to-bracket** (inside `publish-glb.js#emitLod`). Replaces the prior fixed `ratio: 0.85/0.40/0.10` with per-LoD `[minTris, maxTris]` brackets read from `arborist/decimation-defaults.json`. The simplifier ratio is seeded from `maxTris / startTris`, then iteratively tightened up to 3× on overshoot. Chassis whose pre-simplify tri count is already inside the bracket skip simplify entirely. Out-of-bracket results are logged with `✗bracket[min-max]`; MeshoptSimplifier's topology floor (controlled by `error`) bounds how aggressive Lever 4 can be without exceeding visual-quality budget — see `scratch/brief-decimation-survey-spindle.md` for observed per-species behavior.

**Levers 1 + 2 (Order-N twig pruning, parallel-branch collapse) were dropped before code** — vendor + procedural chassis arrive flat-merged with no walkable per-branch node graph. Filed as Brief 6.1 candidate (generator-side pre-merge inside `generate-procedural.js`'s SCA graph and `bake-tree.py`'s LiDAR cylinder graph). See `BACKLOG.md`.

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
- `BACKLOG.md` — the live kit-matcher arc + recent open state + the distilled carried-forward items (the May-2026 Procedural/Salon brief arcs are cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`)
- `NOTES.md` — dated decision record (live + recent; the May-2026 brief diary, incl. the load-bearing 2026-05-15 maxi-brief, is cooled to `_archive/NOTES-2026-05-diary.md`)
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern Arborist mirrors
- `../cartograph/README.md` — helper template
