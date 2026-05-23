# Brief 1.5e — Leaf Pack Library Expansion + Phase F Prep

You are the dispatched baby agent for **leaf pack library expansion** — a small parallel brief that runs alongside Holm's active Brief 2 (bark gradient maps). Brief 1.5a (Sequoia) shipped three vendor leaf packs as shape PNGs in `public/textures/leaves/shapes/` (palmate / lobed / ovate). Operator hit "leaves all look the same" — partly because only three packs exist. Brief 1.5e brings the rest of the vendor leaf-pack library into the kit so the Salon leaves picker has the full set, AND lays Phase-F-prep metadata sidecars (morphology + natural-size in cm) without bringing Phase F's runtime gradient-tinting path (which is its own arc).

**Cold dispatch — fresh agent.** Holm is mid-Brief-2; your work is independent (zero file-surface overlap). **Name yourself** in your publishing notes.

## Read first

- `arborist/FEATURES.md` Salon section + leaves library description
- `arborist/BACKLOG.md` — the "Morphology → vendor-pack mapping table" subsection (suggested mapping table is the spec input for your work)
- `arborist/leaf-pack-bindings.json` — the existing species → pack mapping (you'll extend it)
- `scratch/brief-1.5a-salon-completion.md` — Sequoia's leaf-pack-shim approach (your work is the additive expansion of theirs)
- `assets/botanical-reference-hires/` README + directory listing — the vendor trove you'll pull from
- `arborist/serve.js` — focus on `/salon/:species/leaves` route to confirm it reads from the filesystem dynamically (it should; if it hardcodes a list, that's a small edit)
- Sequoia's existing 3 shape PNGs at `public/textures/leaves/shapes/{palmate,lobed,ovate}/` — match their composition method (RGBA via sharp joinChannel of Color RGB + Opacity alpha)
- Memory: `feedback_baby_must_surface_scope_drift`, `feedback_classifier_keyword_cross_check`, `project_writeifchanged_touches_mtime`

## Goal — and what this phase explicitly does NOT do

Expand `public/textures/leaves/shapes/` from 3 packs to the full vendor library set. Each pack gets:

- `shape.png` — RGBA composite of vendor Color RGB + Opacity alpha (matching Sequoia's existing 3-pack format)
- `meta.json` — sidecar declaring `morphology`, `naturalSize` (in cm, operator-tunable), `recommendedSpecies` (list of binomials this pack suits well)

Plus extend `arborist/leaf-pack-bindings.json` to map the expanded packs against species/morphology categories per the BACKLOG mapping table.

**Do NOT:**
- Add runtime gradient-map tinting to leaves (that's Phase F proper, NOT this brief)
- Modify the leaf-emission logic in `generate-salon.js` (Holm may be touching adjacent code; stay out)
- Modify `treeAtlasMaterial.js` shader path
- Modify `InstancedTrees.jsx` runtime
- Touch `bake-look.js` (Holm's Brief 2 territory)
- Add per-pack annual-cycle phenology (Phase F arc)
- Author per-Look palette overrides for leaves
- Make `meta.json#naturalSize` drive runtime card scale (that's Phase F proper; today the operator slider in Salon stays the source of truth)
- Touch SalonWorkstage.jsx Bark section (Holm's surface)
- Modify chassis library or `survey-deleaf.js`

## Architecture

### Pack inventory (target state)

Per the BACKLOG morphology→vendor-pack mapping table, the full target set:

| Pack name | Vendor source | Morphology | Recommended species |
|---|---|---|---|
| palmate | LeafSet010 | palmate | maple, sycamore |
| lobed | LeafSet016 | lobed | oak |
| ovate | LeafSet005 | ovate | mulberry, dogwood, hydrangea, generic broadleaf |
| serrate_ovate | LeafSet001 | serrate_ovate | elm, hornbeam |
| heart | LeafSet004 | heart | redbud, lilac |
| elm_autumn | LeafSet007 | seasonal_elm | autumn elm |
| oak_autumn | LeafSet012 | seasonal_oak | autumn oak |
| lanceolate | LeafSet013 | lanceolate | willow |
| long_needle | LeafSet019 | long_needle | pine, larch |
| ovate_large | Leaf001 | ovate_large | broadleaf filler |

3 already shipped by Sequoia (palmate / lobed / ovate); your job is to add the remaining 7.

If the vendor trove doesn't actually contain a pack the BACKLOG predicts (e.g., LeafSet001 might be empty or differently-named on disk), surface the gap; don't synthesize a substitute.

### Pack composition

Match Sequoia's existing 3-pack format:
- `sharp.joinChannel`-style composite: vendor `<LeafSet>/Color/*.png` for RGB + vendor `<LeafSet>/Opacity/*.png` for alpha → `public/textures/leaves/shapes/<pack>/shape.png`
- Single PNG per pack; the alpha channel is the load-bearing data (alpha-test cards use it directly)
- Pixel dimensions: match vendor source resolution (likely 4K from the hi-res trove); don't downscale unless you measure file-size pain (e.g., > 5 MB per pack → consider 2K resize)
- sRGB-tagged

Verify visual differentiation before committing: each pack's shape.png should produce a sha1 distinct from every other pack's.

### Per-pack `meta.json` sidecar

```json
{
  "morphology": "lanceolate",
  "naturalSize": 8,
  "recommendedSpecies": [
    "salix_alba",
    "salix_babylonica"
  ],
  "source": {
    "vendor": "botanical-reference-hires",
    "pack": "LeafSet013"
  }
}
```

`naturalSize` is in cm; this is Phase F-prep metadata (will eventually drive runtime card scale; today it's documentation). Use operator-knowledge defaults:
- Palmate (maple): ~10 cm
- Lobed (oak): ~12 cm
- Ovate (general): ~8 cm
- Serrate ovate (elm): ~8 cm
- Heart (redbud): ~10 cm
- Elm autumn: ~8 cm
- Oak autumn: ~12 cm
- Lanceolate (willow): ~8 cm (long narrow)
- Long needle (pine): ~15 cm
- Ovate large: ~15 cm

These are rough; surface for operator validation if any feel wrong.

`recommendedSpecies` lists species the pack visually suits well — operator-curated guidance for future Salon UI affordances. Plain string array of species ids (matching `public/trees/index.json` keys where possible).

`source` documents the vendor origin for traceability.

### Salon UI surface

If `/salon/:species/leaves` endpoint dynamically scans `public/textures/leaves/shapes/` (it should per Sequoia's design), no endpoint change needed — new packs show up automatically once the directories exist.

If the endpoint hardcodes a list, extend it to dynamic scan. Small one-time edit.

Verify after your changes: open Salon, leaf picker shows all 10 packs.

### `arborist/leaf-pack-bindings.json` extension

This file already maps species → morphology → pack. Extend with the new mappings so the Salon picker's morphology-suggestion ranking surfaces appropriate packs first per species. Format follows Sequoia's existing schema; don't refactor — append.

## File-by-file plan

| File | Status | Notes |
|---|---|---|
| `public/textures/leaves/shapes/<pack>/shape.png` × 7 | new (data) | RGBA composite |
| `public/textures/leaves/shapes/<pack>/meta.json` × 7 | new (data) | sidecar metadata |
| `public/textures/leaves/shapes/{palmate,lobed,ovate}/meta.json` × 3 | new (backfill on Sequoia's existing 3) | sidecar metadata for the originals |
| `arborist/leaf-pack-bindings.json` | edit (extend mapping) | append new pack entries |
| `arborist/serve.js` | edit IF endpoint hardcodes pack list (otherwise skip) | dynamic scan if not already |
| `arborist/FEATURES.md` | edit (leaves library section: 3 → 10 packs) | +20 LOC |
| `arborist/NOTES.md` | edit (dated session-end entry under your name) | +30 LOC |

Total: ~20 new data files + 4 doc edits + maybe 1 small code edit.

## Acceptance criteria

1. `public/textures/leaves/shapes/` contains 10 pack directories: palmate, lobed, ovate (existing) + serrate_ovate, heart, elm_autumn, oak_autumn, lanceolate, long_needle, ovate_large (new)
2. Each pack has both `shape.png` AND `meta.json`
3. All 10 `shape.png` files have distinct sha1 (no duplicates)
4. Each `meta.json` has `morphology`, `naturalSize`, `recommendedSpecies`, `source` fields populated
5. `arborist/leaf-pack-bindings.json` extended to cover all 10 packs in morphology mappings
6. `/salon/:species/leaves` endpoint returns all 10 packs (verify via `curl`)
7. Salon UI leaves picker visibly lists all 10 (manual smoke test in browser)
8. Picking each new pack and adopting a composition produces a different visible leaf shape (no regression on existing 3 packs)
9. Determinism: re-running any pack-import logic (if you write one) produces byte-identical PNGs
10. No conflict with Holm's Brief 2 in `git status` — your work touches only the files in the file-by-file plan

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file` — commit ONLY Brief 1.5e work; Holm's Brief 2 changes will be in flight alongside yours, so stage by file
- Determinism: PNG composition deterministic across re-runs
- Single shader program preserved (you're not touching the shader path)
- No runtime / shader / bake-pipeline changes
- No modifications to `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `bake-look.js`, `generate-salon.js`, `survey-deleaf.js`, `SalonWorkstage.jsx`, `Workstage.jsx`, `ProceduralWorkstage.jsx`, `LidarWorkstage.jsx`, `useArboristStore.js` (unless the leaves endpoint truly hardcodes its list — then minimal edit to make it dynamic)
- Do NOT bring Phase F runtime gradient-tinting

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- Any vendor packs you couldn't locate (e.g., LeafSet0xx missing from the trove)
- Any packs that required preprocessing beyond joinChannel (channel-swap, resize, color-correct)
- Any morphology→pack mappings from the BACKLOG table that don't fit visually after you've seen the actual vendor textures
- Any `naturalSize` values that feel obviously wrong after you've examined the texture (e.g., the long_needle pack actually shows compound leaves, not needles)
- Whether the leaves endpoint required code changes vs ran dynamically
- Any pack you'd add OUTSIDE the BACKLOG-listed 10 because it's clearly useful (don't add; surface for operator)
- Any opportunity you spot to consolidate Sequoia's existing 3-pack files (don't refactor; surface only)
- File-size delta from full library (PNG sizes summed) — flag if > 50MB total
- Whether sharp's joinChannel handled vendor texture color-space correctly (sRGB sources → sRGB output)

## Out of scope

- Phase F runtime gradient-tinting (separate arc)
- Annual-cycle phenology metadata
- Per-Look palette overrides for leaves
- Leaf-card emission rule changes
- Salon UI Leaves panel enhancements (Holm may be adjacent in Bark; stay clear)
- Brief 2 (Holm's territory)
- Any work in `meteorologist/` or `cartograph/`
- Bulk-rename or curation of leaf packs
- Phase F naturalSize-driven runtime scale derivation (today's hardcoded BASE_CARD_SIZE + operator slider stays)
- Leaf gradient-LUT bake step
