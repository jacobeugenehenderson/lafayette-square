# Brief 26 — Salon picker: Look-only toggle + browse-all + chassis species reassignment

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — a name NOT already used in this project.** Babies pattern-match to names in the code/notes and pick collisions; Jacob has had to redirect repeated misfires.

**Names already claimed — do NOT reuse:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Cant, Boz.

**Collision note:** Brief 24 (Grove coverage view) may be running concurrently and is steered toward the *ledger / cartography* domain; Brief 3A just shipped as *Cant*. Pick a name **outside** those spaces — go somewhere genuinely novel. State it in your first message; sign your commits with it.

---

## Why this brief exists

The operator authors the LS tree library in the Salon, walking species one-by-one. Two problems block that today:

1. **The picker hides what needs labeling.** The Chassis picker defaults to an `Approved only` filter (Brief 1.5b) that drops every un-approved chassis — which is *all* of the unlabeled singles that were decomposed out of group packs (Riven's Brief 1.5c bundle-splits: `honey_locust_*`, `gray_poplar_*`, `poplar_fall_*`, `candicands`, `london_plane_*`, each carrying `meta.source.bundleNode`). The operator can't reach them to label them.
2. **Mislabeled chassis can't be re-homed.** Some chassis are filed under generic/vendor species (`garden_mix`, `generic_leaf_tree`, `broadleaf_03`) but are *actually* a recognizable species — e.g. a "Generic Garden Tree" that is really a **Weeping Willow**. The operator needs to **reassign the chassis to its true species** so it groups correctly and counts toward that species' roster coverage.

This brief restructures the Salon picker around the operator's real workflow: **browse the whole library, fix mislabels by reassigning species, and narrow to the active Look when polishing.**

## Decisions already locked (do not re-litigate)

- **Retire the `Approved only` filter; replace it with a `Look only` toggle.** Approval/reject stays as a *label* in the curation row — it just stops *hiding* chassis.
- **No group shots in the picker.** The three merged-forest chassis (`acer_saccharum` forest, `sugar_maple_low_poly_forest`, `burnt_tree`) stay **suppressed** (Brief 23 / `_chassis-forests.json`). Brief 23a (splitting them into singles) stays **dormant** — operator confirmed they're redundant (18 Sugar Maple singles already exist) / niche. Do NOT split forests.
- **"Relabel" = species reassignment**, not just a display name. "Generic Garden Tree" → "Weeping Willow" must re-home the chassis into the Weeping Willow species bucket.
- **Procedural / LiDAR species stay excluded** from the Salon picker (Brief 15) — they're *sources* with their own workspaces (18A/18B doctrine), not vendor chassis composed here.

## Read first

- `src/arborist/SalonWorkstage.jsx` — the Chassis section: the `Approved only` checkbox, the species dropdown, the chassis picker, and the Brief 1.5b **curation row** (displayName input / tri-state Status button / notes). **NOTE: Brief 3A (Cant) just edited this file — rebase onto its committed state; do not start until 3A is committed.**
- `arborist/serve.js` — `/salon/species` (`listSalonSpecies`), `/salon/:species/chassis` (catalog, `?morphology=` filter + forest suppression via `listForestChassis`), `/salon/curation` + `/salon/curation/:chassisName` (the curation read/merge endpoints).
- `arborist/generate-salon.js` — `listSalonSpecies` (the species union: chassis-available ∪ composition-authored, minus procedural/LiDAR per Brief 15), `listForestChassis` (Brief 23 suppression). **Also touched by 3A — rebase.**
- `arborist/state/_chassis-curation.json` + `_chassis-curation.defaults.json` — the curation schema you extend (`{chassis: {'<name>.glb': {displayName, approved, notes}}}`). Name-keyed, survives `survey-deleaf.js` regen.
- `public/trees/_chassis/*.meta.json` — `source.species` (the field reassignment overrides; NEVER edit meta — it's regenerated). `source.bundleNode` marks bundle-split origin.
- `arborist/ROSTER-COVERAGE.md` — the living roster doc; coverage depends on effective species (see Brief 24 coordination below).
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_load_bearing_files_serial_dispatch]]`, `[[feedback_d3_bundling_failure_modes]]`, `[[feedback_absence_means_inherit_in_authored_blocks]]`, `[[feedback_json_stringify_loses_handauthored_format]]`, `[[project_doped_artifact_placecard_edit_pattern]]`.

## Goal — two sub-phases (ship + verify each before the next, per `[[feedback_d3_bundling_failure_modes]]`)

### 26a — Chassis species reassignment (the load-bearing data change)

- Add `speciesOverride` (string species-id, or absent) to the per-chassis curation schema in `_chassis-curation.json` (+ the `.defaults.json` sibling doc). Absent = inherit `meta.source.species` (per `[[feedback_absence_means_inherit_in_authored_blocks]]`).
- The `/salon/curation/:chassisName` POST accepts `speciesOverride` with the same absent-keys-preserved / null-clears merge semantics already in place.
- **Effective species** = `curation[chassis].speciesOverride ?? meta.source.species`. Lift this into ONE helper and use it everywhere `source.species` currently drives grouping:
  - `listSalonSpecies` (the species union) — a chassis reassigned to `salix_babylonica` makes that species appear / gain an option.
  - `/salon/:species/chassis` catalog — the chassis lists under its effective species, not its vendor species.
- **Target-species options:** the reassignment control offers existing library species ids; allow assigning to a species not yet present (creates the bucket). Surface how you resolve common-name (“Weeping Willow”) vs species-id (`salix_babylonica`) — reuse `park_species_map.json` / displayName if helpful, but don't over-build; the override stores a species-id.
- Determinism + format: preserve hand-authored JSON formatting (`[[feedback_json_stringify_loses_handauthored_format]]`); the `.defaults.json` backstop documents the new field.

### 26b — Picker UI (Look-only toggle + browse-all + reassignment control)

- **Replace the `Approved only` checkbox with a `Look only` toggle.** ON = filter the species list / picker to the **active Look's roster** species. OFF = the **full vendor single-tree chassis library**, including un-approved bundle-splits (so they're reachable to label). Forests stay suppressed in both states; procedural/LiDAR stay excluded in both states.
- **Reassignment control** in the curation row: a target-species picker that writes `speciesOverride`. After reassignment, the chassis re-homes under the target species (verify it moves in the picker + species dropdown).
- **Keep** displayName / Status (approve-reject) / notes — approve no longer filters; it's a label.
- The active Look comes from the existing `LookPicker` in the header (no new Look-selection chrome — the toggle just reads `activeLookId`).

## What this explicitly does NOT do (scope walls)

- **Do NOT split or un-suppress the merged forests** (Brief 23a stays dormant). No group shots in the picker.
- **Do NOT edit `meta.json`** to reassign species — reassignment lives in the curation override only (meta is regenerated by `survey-deleaf.js`).
- **Do NOT touch the LS runtime, the shaders, or the slab** — no `treeAtlasMaterial.js` / `InstancedTrees.jsx` / `bake-look.js` / `bake-trees.js` / `trees-atlas.json`. This is an authoring-UI + curation-state change only.
- **Do NOT un-exclude procedural/LiDAR** from the Salon picker.
- **Do NOT bake provenance** (literal/composite) — that's the separate Brief 25.

## Coordinate with Brief 24 (Grove coverage view)

Brief 24 builds a read-only coverage join that reads each chassis's species. **The coverage join must read the *effective* species (`speciesOverride ?? source.species`), not raw `source.species`** — or a reassigned "Weeping Willow" won't count toward Weeping Willow's coverage. If Brief 24 has already shipped when you start, update its join helper to be override-aware. If it hasn't, leave a note in your commit body so 24's baby (or Boz) wires it. Lift the effective-species helper somewhere both can import.

## Inspection points (surface before building)

1. **How `listSalonSpecies` builds the union today** — where the effective-species helper slots in without breaking the "operator never loses a species they were working on" guarantee.
2. **How the chassis catalog filters** — morphology + forest suppression + (today) approved. Confirm the `Look only` toggle composes cleanly with the morphology filter that already exists.
3. **Common-name vs species-id** for the reassignment target — surface your resolution rule before building the control.

## Acceptance criteria

1. `Approved only` checkbox is gone; a working `Look only` toggle replaces it. OFF shows the full library (incl. un-approved bundle-splits); ON shows only the active Look's roster species.
2. Reassigning a chassis's species (e.g. a `garden_mix` variant → `salix_babylonica`) re-homes it: it appears under the target species in the picker + species dropdown, and disappears from its old vendor-species grouping.
3. `speciesOverride` persists in `_chassis-curation.json`, survives a `survey-deleaf.js` regen (name-keyed), and inherits `source.species` when absent.
4. Forests stay suppressed; procedural/LiDAR stay excluded — in both toggle states.
5. The curation row's displayName / Status / notes still work; approve no longer hides chassis.
6. Effective-species helper is the single source of truth, override-aware, and Brief 24's coverage join uses it (or a coordination note is left).
7. No runtime / shader / slab / bake touch. `serve.js` passes `node --check`; vite build clean.
8. Docs: `FEATURES.md` (Salon Chassis section + curation), `NOTES.md` dated entry, and a line in `ROSTER-COVERAGE.md` noting reassignment now drives coverage.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`: disclose any file/schema/default you touch beyond those named. If the common-name↔species-id resolution turns out to need real curation (no clean auto-map), stop at a clean wall and say so — Jacob owns that judgment. If 26a's effective-species lift turns out to ripple wider than `listSalonSpecies` + the catalog (e.g. into the manifest or bake path), surface it rather than chasing it.

## Dispatch posture

**Serializes AFTER Brief 3A commits** (shares `SalonWorkstage.jsx` + `generate-salon.js` — load-bearing multi-edit files per `[[feedback_load_bearing_files_serial_dispatch]]`). Coordinate with Brief 24 (effective-species helper). Sub-phase 26a (data) before 26b (UI). ~300–450 LOC across `SalonWorkstage.jsx` + `serve.js` + `generate-salon.js` + the curation schema. Authoring-only — no slab/runtime risk.
