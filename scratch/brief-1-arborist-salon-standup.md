# Brief 1 — Arborist Salon Stand-up

You are the dispatched baby agent for **Arborist Salon stand-up**. This is the first code-side brief of a multi-baby arc that pivots the Arborist from generation (Procedural / LiDAR) to composition (Salon — pick chassis + bark + leaves, adopt, publish). Two prior generation-focused arcs hit ceilings (Phase G.1 procedural hero progressing slowly; Li'l Vera LiDAR shelved 2026-05-20 at N.3.0 — see `arborist/NOTES.md`). The Salon arc is the operator's call to ship v1.5 by composing rather than synthesizing. The Arborist already has the publish pipeline, atlas system, and runtime contract — Salon is a parallel authoring surface that emits compatible output.

**Name yourself** in your publishing notes (commit body, status updates) so subsequent briefs in this arc can refer to your work.

## Session context

You inherit a foundation laid by baby **Whittle** earlier in this session. Whittle shipped Brief 0 (vendor stock survey + easy-case de-leaf) — commit `286d748`. Required reading before you touch this brief:

- **`scratch/brief-0-vendor-tree-survey-whittle.md`** — Whittle's survey report. Tells you what's in the chassis library, what's not, and why. Read sections 1 (summary), 3 (coverage), and the Surface items at minimum.
- **`arborist/NOTES.md`** — Whittle's dated session-end entry sits at the top.

**Chassis library state.** `public/trees/_chassis/` is populated with 141 chassis GLBs + `<name>.meta.json` sidecars. The directory is gitignored — regenerable via `node arborist/survey-deleaf.js` from the repo root. If you see an empty `_chassis/` on your machine, run the script once before you start.

**Mid-arc patch.** Whittle's classifier originally put `branch` in the WOOD regex; that disagreed with `arborist/atlas-survey.js:34` which puts it in LEAF. Coordinator (Olmsted) shipped a three-edit patch to `arborist/survey-deleaf.js`; chassis library on disk reflects the corrected classification. Memory entry `feedback_classifier_keyword_cross_check` is the doctrine note from that incident.

**Known coverage gaps you do NOT need to solve.**
- Ornamental morphology = 0 chassis (operator hand-pass post-Brief-1)
- Some tail-of-roster species fully skipped (Norway Spruce, Douglas Fir, Magnolia, Silver Birch, White Willow, etc.)
- Several vendor GLBs are likely broken-source (zero primitives detected) — `elderberry`, `spruce_corona`, `tree_variation`, `ulmus_americana`

Dominant LS species ARE covered (Sugar Maple, Italian Cypress, London Plane, White Oak, Weeping Willow, Poplar, Quaking Aspen, procedural fillers). That's enough for Brief 1 acceptance-testing. Do not chase the gaps.

**Your job is Salon stand-up, not chassis library expansion.** If you find yourself tempted to modify `arborist/survey-deleaf.js`, regenerate chassis, or hand-classify ambiguous cases — stop and surface. That's coordinator/operator territory.

## Read first

- `arborist/FEATURES.md` end-to-end (especially "Two authoring modes" + "API endpoints" + the recent Procedural mode section)
- `arborist/ARCHITECTURE.md` (publish-loop, generator contract, two-tier substitution)
- `arborist/BACKLOG.md` Salon section + "Trees — Procedural v1.5" arc (context for why Salon exists)
- `arborist/NOTES.md` 2026-05-20 late-night entry (Li'l Vera shelve — establishes the procedural-only-can't-ship doctrine) + Whittle's Brief 0 entry
- `src/arborist/ProceduralWorkstage.jsx` **end-to-end — this is the file you will fork wholesale**
- `src/arborist/SpecimenViewport.jsx` and `src/arborist/Workstage.jsx` — the rotator ring + man-height obelisk + height-indicator pattern. Per-vendor chassis unit-scale variation is solved authoring-side via this existing workflow; Salon inherits it as part of the lift.
- `arborist/generate-procedural.js` end-to-end — the publish-chain pattern Salon mirrors
- `arborist/serve.js` `/procedural/*` route block — the API pattern Salon mirrors
- Memory (load-bearing): `feedback_kit_helper_css_import_index_not_tokens`, `feedback_effective_payload_layering`, `feedback_absence_means_inherit_in_authored_blocks`, `feedback_unique_program_cache_key_before_wrappers`, `feedback_node_watch_for_backend_hmr`, `feedback_json_stringify_loses_handauthored_format`, `feedback_debounced_save_must_flush_before_dependent_post`, `feedback_classifier_keyword_cross_check`, `feedback_baby_must_surface_scope_drift`, `project_writeifchanged_touches_mtime`

## Goal — and what this phase explicitly does NOT do

Stand up the **Salon** as the fourth top-level mode in `ArboristApp.jsx` alongside Procedural / LiDAR / Grove. Operator picks chassis + bark + leaves → adopt → composition persists → Re-publish species fires the bake chain → tree appears in LS placements through the existing pipeline unchanged.

**Do NOT:**
- Add deformer rig (Brief 3)
- Add gradient-map bark + multi-stop tint editor (Brief 2)
- Add camera-aware hemisphere cull (Brief 4)
- Modify `treeAtlasMaterial.js` (no new uniforms, no shader variants)
- Modify `InstancedTrees.jsx`, `bake-look.js`, `bake-trees.js`, or `publish-glb.js`
- Strip leaves from vendor GLBs or populate `public/trees/_chassis/` yourself — Whittle did Brief 0
- Re-implement viewport / rotator ring / obelisk / height indicator / LoD selector / perf gauge / wind toggle / DraftSlider / slot-tabs — lift from `ProceduralWorkstage.jsx`
- Refactor or improve the leaf-emission rule — lift helpers from `generate-procedural.js` and reuse
- Migrate existing procedural Sugar Maple variants into Salon

## Architecture

### Hierarchy

`Arborist > Grove > Slab [Lafayette Square]`. No loose trees. Salon authors compositions per species; Grove curates which species ship in a Look; Slab bakes the Look. Salon output is one new tier in the existing chain.

### Composition data model

Per-species overlay at `arborist/state/<species>/compositions.json`. Schema:

```json
{
  "compositions": [
    {
      "slot": 0,
      "name": "<operator label>",
      "chassis": "<chassis-name from _chassis library>",
      "bark": {
        "ref": "Bark007",
        "uvScale": [1.5, 4],
        "tintBase": "#3a2820",
        "tintJitterRange": "#6a5040",
        "roughnessOverride": 0.8
      },
      "leaves": {
        "pack": "LeafSet010",
        "occupancy": 0.7,
        "tintFront": "#3a7530",
        "tintBack": "#a8b89a"
      },
      "deformer": {}
    }
  ]
}
```

`deformer` is reserved-but-empty in Brief 1 — Brief 3 fills it. Schema accommodates absent fields per `feedback_absence_means_inherit_in_authored_blocks`. Paired `compositions.defaults.json` per `feedback_json_stringify_loses_handauthored_format`.

### Effective-value layering

Per `feedback_effective_payload_layering`: server `GET /salon/:species/compositions` returns each composition with an `effective` block layered:
1. `DEFAULTS` (kit-wide, defined in `generate-salon.js`)
2. `CHASSIS_DEFAULTS` (from picked chassis's `<name>.meta.json` sidecar)
3. Operator overlay

UI controlled selects (chassis / bark / leaves pickers) bind to `effective.*`, not `params.*`. Store action `setSalonSlotParams` mirrors patches into `effective` alongside `params` so selects reflect operator changes immediately without server round-trip.

### Salon UI layout — fork ProceduralWorkstage wholesale

Copy `src/arborist/ProceduralWorkstage.jsx` to `src/arborist/SalonWorkstage.jsx`. Preserve everything except the per-slot controls rail and the data-model wiring:

**Keep as-is (lifted intact):**
- Slot tabs strip + dirty-dot indicator
- SpecimenViewport with rotator ring + man-height obelisk + height indicator
- Floating overlays (LoD selector, perf gauge, wind toggle)
- DraftSlider commit semantics
- Per-slot footer (↺ Reset, ✓ Adopt, manual name input)
- Species-level Re-publish in workstage footer + dirty-blocked behavior
- Header strip pattern (mode toggle, active-species dropdown, Library back-button)
- Empty-state rendering pattern

**Replace (the Salon-specific work):**
- Per-slot controls rail: swap the 5-section procedural panel (Trunk / Envelope / Canopy / Deformers / Tropism) for the 3-section Salon panel (Chassis / Bark / Leaves) per the spec below
- Data model: store reads `compositions` (not `seedlings`); action `setSalonSlotParams` (not `setProceduralSlotParams`); fetch from `/salon/*` endpoints (not `/procedural/*`)
- Active-species dropdown source: filter by species that have Salon entries OR have chassis available in `_chassis/`, not by procedural roster

The operator already knows this workspace cold. Salon should feel like the same room with different fittings, not a new room.

### Per-slot controls rail (Salon-specific replacement)

- **Chassis** — picker dropdown filtered by morphology suggestion (chassis whose `<name>.meta.json#/morphology` matches species's morphology tag rank first), thumbnail preview, height-range readout. Empty-state instruction if `_chassis/` empty: "Run `node arborist/survey-deleaf.js` to populate the local chassis library."
- **Bark** — picker dropdown, uvScale X/Y `DraftSlider`s, tintBase color picker, tintJitterRange color picker, roughnessOverride `DraftSlider`
- **Leaves** — picker dropdown filtered by morphology match, occupancy `DraftSlider` (0–1), tintFront + tintBack color pickers

### Chassis library (Whittle-populated)

`public/trees/_chassis/<name>.glb` + `<name>.meta.json`. Already populated; you read from it. Gitignored — regenerable via `node arborist/survey-deleaf.js`. `<name>.meta.json` carries:

```json
{
  "morphology": "broadleaf_palmate",
  "heightRange": [<bbox.min.y>, <bbox.max.y>],
  "source": {"species": "<binomial>", "variant": <N>},
  "scaffoldCount": null,
  "canopyStart": null,
  "leafAttachmentTags": []
}
```

`scaffoldCount` / `canopyStart` / `leafAttachmentTags` are operator-authoring fields populated later — Brief 1 renders chassis pickers using `morphology` + `heightRange` only.

### `generate-salon.js`

Mirrors `generate-procedural.js` structure exactly. Required exports:
- `generateSingleCompositionGLB({chassis, bark, leaves, ...}) → Uint8Array`
- `readEffectiveCompositions(species) → array`
- `writeCompositions(species, compositions)`
- `main()` — CLI entrypoint, walks compositions.json, generates each variant, shells out to `publish-glb.js`

Composition generation steps:
1. Load chassis GLB from `public/trees/_chassis/<name>.glb` (Node-side via `@gltf-transform/core`)
2. Apply bark material to wood primitives by reading `geometry.userData.atlasKind === 'bark'` (chassis stamps this per Whittle)
3. Emit leaf cards at chassis `leafAttachmentTags` positions using the leaves pack — **lift the D.1b leaf-cluster-along-shoot helpers from `generate-procedural.js`**; do not duplicate or modify
4. Bind material textures: bark from `public/textures/bark/<ref>/`, leaf shape from `public/textures/leaves/shapes/<pack>/`
5. Output multi-node GLB (one node per composition slot) for `publish-glb.js` consumption

**Determinism:** same `{composition + chassis + bark + leaves}` + same on-disk source files → byte-identical GLB. Use `mulberry32` seed stream lifted from `generate-procedural.js`. Required per `project_writeifchanged_touches_mtime`.

### API endpoints in `arborist/serve.js`

All under `/api/arborist`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/salon/species` | List species available in Salon (filter: species with chassis available in `_chassis/` OR with existing Salon entries) |
| `GET` | `/salon/:species/chassis` | List chassis from `public/trees/_chassis/`, optional `?morphology=` filter |
| `GET` | `/salon/:species/bark` | List bark refs from `public/textures/bark/` |
| `GET` | `/salon/:species/leaves` | List leaf packs from `public/textures/leaves/shapes/` |
| `GET\|POST` | `/salon/:species/compositions` | Overlay; GET returns `effective` per composition; POST merges with absent-keys-preserved |
| `POST` | `/salon/generate` | Body `{chassis, bark, leaves, ...}` returns `model/gltf-binary` for a single composition (used by viewport preview loop) |
| `POST` | `/salon/:species/publish?look=<id>` | Shells out to `node generate-salon.js --species <id>` + fires per-Look atlas auto-bake fire-and-forget |

Mirror the procedural endpoint block exactly for shape consistency.

### CLI

`node arborist/generate-salon.js [--species <id>]` — headless republish; reads compositions.json overlays + chassis-defaults fallback.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `src/arborist/SalonWorkstage.jsx` | new (forked from `ProceduralWorkstage.jsx`; controls panel + data wiring swapped; ~70% lifted intact) | ~400 |
| `src/arborist/ArboristApp.jsx` | edit (add Salon mode toggle) | +30 |
| `src/arborist/useArboristStore.js` | edit (compositions state + actions) | +80 |
| `arborist/generate-salon.js` | new | ~400 |
| `arborist/serve.js` | edit (Salon endpoint block) | +200 |
| `arborist/FEATURES.md` | edit (Salon mode section + endpoints + CLI rows) | +60 |
| `arborist/BACKLOG.md` | edit (mark Brief 1 shipped; sequence Brief 2/3/4 ahead) | +20 |
| `arborist/NOTES.md` | edit (dated session-end entry under your chosen name) | +40 |

Total: ~800 new LOC, 2 new files, 6 edited.

## Acceptance criteria

1. Salon mode mounts as 4th top-level mode alongside Procedural / LiDAR / Grove; toggle persists across page reload via existing localStorage pattern
2. Active-species dropdown lists species available in Salon mode (chassis-or-Salon-entry filter)
3. Operator can pick chassis + bark + leaves from libraries; selections persist as composition overlay on disk
4. Viewport renders live preview GLB on each composition change (blob-URL'd from `POST /salon/generate`); rotator ring + obelisk + height indicator visible and functional
5. Re-publish species shells out to `node generate-salon.js --species <id>` and the resulting GLB lands in `public/trees/<species>/` + manifest updates + appears in LS placements after Grove bake
6. Determinism verified: same composition adopted twice → byte-identical `skeleton-N-lod0.glb` sha1 across two runs
7. Single shader program preserved (verify via Stage perf gauge `programs` count unchanged before/after Salon publish)
8. Empty `public/trees/_chassis/` → empty-state instruction renders with "Run `node arborist/survey-deleaf.js`" guidance, no crash
9. Effective-value layering: `DEFAULTS → CHASSIS_DEFAULTS → operator overlay`; controlled selects bind to effective
10. Adopt POST flushes before Re-publish POST (per debounce-flush doctrine); Re-publish button disabled while any slot is dirty

## Constraints

- **Stash-isolate per `feedback_stash_isolate_per_file`** — there are many dirty files in the working tree from prior arcs; commit Brief 1 work only
- Per `project_writeifchanged_touches_mtime` — if you use `writeIfChanged` in `generate-salon.js`, MUST touch mtime on no-op branch
- Per `feedback_kit_helper_css_import_index_not_tokens` — Salon UI must inherit `index.css` (already loaded via `ArboristApp`); verify glass-panel + section-heading utility classes work
- Per `feedback_unique_program_cache_key_before_wrappers` — if you mutate any material in Salon publish path, set unique `customProgramCacheKey` BEFORE any wrappers
- Per `feedback_node_watch_for_backend_hmr` — serve.js endpoint additions reload automatically; no extra setup
- Per `feedback_json_stringify_loses_handauthored_format` — pair `compositions.json` with `compositions.defaults.json`
- **Do NOT re-implement viewport / rotator ring / obelisk / height indicator / LoD selector / perf gauge / wind toggle / DraftSlider / slot-tabs.** Lift from `ProceduralWorkstage.jsx`. Touching these is scope drift; if you find one you need to modify, surface and ask rather than fork.
- **The height-indicator workflow is the unit-normalization story.** Per-vendor chassis unit-scale variation is already solved authoring-side: operator centers chassis in the rotator ring, grows height-to-spec via the indicator, system bakes correction into the slab. Salon inherits this. Do not add a separate normalization step.
- Single shader program preserved
- No modifications to `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `bake-look.js`, `bake-trees.js`, `publish-glb.js`, or `arborist/survey-deleaf.js`

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`, disclose proactively in your status updates and commit body:

- Which components in `ProceduralWorkstage.jsx` you lifted intact vs adapted vs replaced — itemize
- Any floating-overlay drift you noticed between lifted Salon and existing Procedural (fork creates a consolidation candidate; flag for future cleanup brief, don't consolidate now)
- Any procedural-specific logic embedded in lifted code that surprised you (e.g., procedural-shaped fetches inside an otherwise-generic component) — note for later refactor
- Which species the active-species dropdown surfaces in Salon (filter logic decision: chassis-available vs Salon-entry-exists vs both — explain your choice)
- Any modifications you find tempting to `bake-look.js` / `bake-trees.js` / `publish-glb.js` (flag, don't do)
- Any new uniforms or shader variants you find tempting to add (flag, don't add)
- Any per-instance attribute additions (flag, don't add — Brief 3)
- Any normal-map handling additions (flag, don't add — Brief 2)
- Any TODOs for follow-on briefs (note in your publishing entry under "Surfaced for Brief 2/3/4")

## Out of scope

- Deformer rig (Brief 3)
- Gradient-map bark + multi-stop tint editor (Brief 2)
- Camera-aware hemisphere cull (Brief 4)
- Asset hygiene / chassis library expansion (Whittle did Brief 0; gaps are operator-side post-Brief-1)
- Leaf editor surface (Phase F, separate arc)
- Annual-cycle phenology (Phase F integration, post-Brief 2)
- Migration of existing Sugar Maple procedural variants into Salon
- Phase W production wind shader
- Any work in `meteorologist/` or `cartograph/`
