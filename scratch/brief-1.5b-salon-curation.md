# Brief 1.5b — Salon Curation Surface

You are the dispatched baby agent for **Salon curation surface** — a warm continuation of the Salon arc (Brief 1 → Brief 1.5a, shipped by Sequoia). Operator can compose chassis in Salon, but the 141-chassis library is full of structural noise (multi-object vendor bundles decomposed as if they were single trees by Brief 0). Many chassis variants are non-tree content (rocks, fences, shrubs) or wildly-misaligned scene-bundle items. Brief 1.5c (parallel) addresses the source-side de-leaf via bundle-aware decomposition. Brief 1.5b (this brief) addresses the consumer-side UX: let the operator mark which chassis are good and rename them to meaningful labels.

**Warm dispatch — continuation of Sequoia's Salon work.** Pick a name in your publishing notes; subsequent briefs will refer to your work by it.

## Session context

Brief 1 (`scratch/brief-1-arborist-salon-standup.md`) shipped Salon mode (Sequoia, commit pending). Brief 1.5a (`scratch/brief-1.5a-salon-completion.md`) shipped bark plumbing, leaf-pack shape shim, leaf scale slider, and operator-side fixes for mount-fetch + scale-leak + lean controls. Read both briefs for context.

The chassis library at `public/trees/_chassis/` is gitignored, regenerable via `node arborist/survey-deleaf.js`. Brief 1.5c (parallel) will re-run + extend the script; your work must survive that re-run.

## Read first

- `scratch/brief-1-arborist-salon-standup.md` and `scratch/brief-1.5a-salon-completion.md`
- `src/arborist/SalonWorkstage.jsx` end-to-end (you may modify it)
- `arborist/serve.js` Salon endpoint block (lines around the `/salon/*` routes)
- `src/arborist/stores/useArboristStore.js` Salon state slice
- `arborist/state/<species>/seedlings.json` shape (precedent for absent-keys-preserved POST semantics)
- Memory: `feedback_absence_means_inherit_in_authored_blocks`, `feedback_json_stringify_loses_handauthored_format`, `feedback_debounced_save_must_flush_before_dependent_post`, `feedback_baby_must_surface_scope_drift`

## Goal — and what this phase explicitly does NOT do

Stand up chassis curation: operator can rename any chassis to a meaningful label and mark it approved-or-not. Salon's chassis picker shows the operator's displayName + filters by approved-state. Curation persists through `survey-deleaf.js` re-runs by living outside `public/trees/_chassis/`.

**Do NOT:**
- Modify `arborist/survey-deleaf.js` (that's Brief 1.5c)
- Modify `public/trees/_chassis/*.glb` or `*.meta.json` files (curation lives in a sibling file)
- Touch chassis library files in any way
- Add per-chassis tilt persistence (operator explicitly deprioritized)
- Build a thumbnail-based chassis browser (deferred to v1.6)
- Bring bundle-decomposition logic (Brief 1.5c)
- Modify Brief 1.5a's bark/leaf/scale work

## Architecture

### Curation data model

`arborist/state/_chassis-curation.json` — operator-authored sidecar, NOT regenerable. Lives in `state/` not `public/`. Schema:

```json
{
  "chassis": {
    "acer_saccharum_a.glb": {
      "displayName": "Maple base — good crotches",
      "approved": true,
      "notes": ""
    },
    "garden_mix_a.glb": {
      "displayName": "",
      "approved": false,
      "notes": "Bundle artifact — looks like a rock"
    }
  }
}
```

Key: chassis filename (matches `public/trees/_chassis/<name>.glb`). Value: `{displayName, approved, notes}`. Absent keys mean unconfigured (operator hasn't touched it yet) — defaults to `displayName: ""`, `approved: null`, `notes: ""`. Treat `approved: null` as "unreviewed" (distinct from explicitly `false`).

Paired `_chassis-curation.defaults.json` per `feedback_json_stringify_loses_handauthored_format` (immutable hand-authoring backstop; the live file accepts reformat).

Per `feedback_absence_means_inherit_in_authored_blocks`: POSTs MUST preserve absent keys. The autosave must prune empty parents to keep the file clean.

### API endpoints in `arborist/serve.js`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/salon/curation` | Returns the full `_chassis-curation.json` (or `{ chassis: {} }` if file absent) |
| `POST` | `/salon/curation/:chassisName` | Body `{displayName?, approved?, notes?}`. Merges into the chassis's curation entry; absent keys preserved on disk; passing `null` for displayName/notes clears the field; passing `null` for approved restores unreviewed state. |

Mounted under `/api/arborist`. Mirror the procedural seedlings POST pattern for absent-keys-preserved semantics.

### Salon UI: chassis picker enrichment

In the Chassis section of `SalonControlsPanel`:

1. **Filter toggle** — checkbox at the top of the Chassis section, "Approved only" (default: ON). Toggles whether the dropdown filters to `approved === true`. When OFF, shows all chassis including unreviewed and explicitly-rejected.
2. **Dropdown labels** — chassis with a `displayName` show that as primary label; chassis without one show the filename. Format: `<displayName> · <morphology>` or fallback `<filename> · <morphology>`.
3. **Approval status glyph** in the dropdown row:
   - `★` for approved
   - `·` for unreviewed (null)
   - `✗` for rejected
4. **Curation row** below the chassis picker (visible when a chassis is picked): displayName text input, approved tri-state toggle (Approved / Unreviewed / Rejected), notes textarea (collapsed by default, expands on click). All three persist via `POST /salon/curation/:chassisName` on commit (text inputs commit on blur; toggle commits immediately).

### Store wiring

New state slice in `useArboristStore.js`:
- `salonChassisCuration: {}` — same shape as the curation file's `chassis` field
- `loadSalonChassisCuration()` — fetches `GET /salon/curation`, sets state
- `setSalonChassisCuration(chassisName, patch)` — optimistic update + POST; on failure, refetch

Call `loadSalonChassisCuration()` alongside the existing `loadSalonLibraries()` on mount.

The chassis picker's `ranked` memo (currently `salonChassisCatalog` filtered/ordered by morphology) gets an additional pass: filter by `approved` state when the toggle is ON; merge in `displayName` for sort+display purposes.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `src/arborist/SalonWorkstage.jsx` | edit (filter toggle, dropdown enrichment, curation row in Chassis section) | +120 |
| `src/arborist/stores/useArboristStore.js` | edit (curation state + actions) | +50 |
| `arborist/serve.js` | edit (curation endpoints) | +60 |
| `arborist/state/_chassis-curation.defaults.json` | new (empty defaults backstop) | small |
| `arborist/FEATURES.md` | edit (Salon curation section) | +30 |
| `arborist/NOTES.md` | edit (dated session-end entry) | +30 |

Total: ~290 new LOC, 1 new data file, 5 edited.

## Acceptance criteria

1. Operator can rename any chassis from the chassis picker; rename persists across page reload via `_chassis-curation.json` on disk
2. Operator can mark chassis approved / unreviewed / rejected via tri-state toggle; persists
3. Chassis picker filters by approved-only when toggle is ON (default); shows all when OFF
4. Glyph next to each dropdown entry indicates approval state (★ / · / ✗)
5. Curation data survives a re-run of `node arborist/survey-deleaf.js` (because it lives outside `public/trees/_chassis/`)
6. Absent keys preserved on POST: setting just `displayName` doesn't clear `approved`; setting just `approved` doesn't clear `notes`
7. Chassis library regen + Brief 1.5c bundle-decomposition do not invalidate curation entries that point at chassis filenames still present
8. Empty `_chassis-curation.json` → all chassis show as unreviewed; "Approved only" filter shows nothing; toggle OFF reveals all
9. Determinism: same operator actions → same on-disk JSON
10. No regression on Brief 1 / 1.5a behavior (chassis picker still works without any curation entries)

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file` — commit ONLY Brief 1.5b work
- Per `feedback_json_stringify_loses_handauthored_format` — pair `_chassis-curation.json` with `_chassis-curation.defaults.json`
- Per `feedback_absence_means_inherit_in_authored_blocks` — POST merges with absent-keys-preserved
- Per `feedback_debounced_save_must_flush_before_dependent_post` — text-input commits flush before any dependent POST (e.g., switching chassis while editing displayName must commit the rename first)
- No modifications to `survey-deleaf.js`, `bake-look.js`, `bake-trees.js`, `publish-glb.js`, `generate-salon.js` core, `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`, `LidarWorkstage.jsx`
- Single shader program preserved (you're not touching the shader path)
- Curation data lives in `arborist/state/`, NEVER in `public/trees/_chassis/` or `public/trees/<species>/`

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- Whether `approved: null` (unreviewed) feels right semantically vs missing-key — if you find a friction with tri-state, surface
- Performance of the chassis picker dropdown at 141+ entries — flag if scrolling/render is choppy
- Any race condition you observe between Brief 1.5c's parallel work and your curation file (you shouldn't see it if 1.5c is additive, but flag if you do)
- Any operator-facing affordance you found yourself wanting to add beyond the spec (don't add, surface)
- Whether the curation row in the chassis section feels overcrowded — note layout decisions

## Out of scope

- Bundle-aware re-de-leaf (Brief 1.5c)
- Per-chassis tilt persistence (deprioritized by operator)
- Thumbnail-based chassis browser (v1.6)
- Gradient-map bark (Brief 2)
- Deformer rig (Brief 3)
- Camera-aware hemisphere cull (Brief 4)
- Any work in `meteorologist/` or `cartograph/`
- Bulk-approve / bulk-rename utilities (operator-side curation is one-at-a-time for v1.5)
