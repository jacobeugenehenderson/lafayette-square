# Brief 1.5c — Bundle-aware re-de-leaf

You are the dispatched baby agent for **bundle-aware re-de-leaf**. Brief 0 (baby Whittle, 2026-05-21) walked the vendor tree stock and de-leafed 141 chassis cleanly. The operator subsequently discovered that several "species" in the vendor stock are actually **multi-object scene bundles** (`garden_mix`, `stylized_trees_1/2`, `candicands`, `tree_variation`, `generic_*`, etc.). Brief 0's walker treated each as a single tree, so each "variant" of a bundle is actually a different bundle-item — sometimes a tree, sometimes a rock/fence/shrub, sometimes a tree at a wildly-divergent position/rotation relative to the bundle origin. Net result: structural noise in the chassis library.

Your job: extend `arborist/survey-deleaf.js` to detect multi-object bundles, decompose them properly, and produce a cleaner chassis library. Brief 1.5b (parallel) addresses the operator-facing curation UX (rename + approved flag).

**Cold dispatch — fresh agent.** Whittle's session context is captured fully in `arborist/NOTES.md` and the script itself; no live file context to inherit. **Name yourself** in your publishing notes.

## Read first

- `arborist/survey-deleaf.js` end-to-end — the script you will extend
- `scratch/brief-0-vendor-tree-survey-whittle.md` — Whittle's survey report; the appendix table lists every walked GLB with primitive counts (useful for predicting which sources are bundles)
- `arborist/NOTES.md` — Whittle's session-end entry + Olmsted's mid-arc patch entry
- `scratch/brief-1.5b-salon-curation.md` — the parallel brief (you don't touch the curation surface, but you must produce output that 1.5b's curation file can reference stably)
- 3–4 representative bundle GLBs to understand structure — pick examples from `public/trees/garden_mix/`, `public/trees/stylized_trees_1/`, `public/trees/candicands/`
- Memory: `feedback_classifier_keyword_cross_check`, `feedback_baby_must_surface_scope_drift`, `feedback_orphan_audit_full_repo`, `project_writeifchanged_touches_mtime`

## Goal — and what this phase explicitly does NOT do

Extend `survey-deleaf.js` to:

1. **Detect bundles** — a GLB is a bundle if it has more than one top-level scene node containing geometry (configurable threshold; suggest > 1 as the conservative default)
2. **Decompose bundles** — emit one chassis per top-level node that classifies as a tree (has at least one WOOD primitive after Brief 0's classification heuristic). Each emitted chassis carries the source-traceable name `<source-species>_<variant>_<nodeName-or-nodeIdx>` (e.g., `garden_mix_1_node02`)
3. **Skip non-tree bundle items** — top-level nodes with no WOOD primitives don't get a chassis; log them in the survey report as bundle-debris
4. **Preserve transform-baking** — apply each top-level node's local transform (translation + rotation + scale relative to the bundle origin) to the decomposed chassis output, so the emitted GLB is centered + upright as if it were a standalone single-tree source. (This is what's making bundle-derived chassis "lean weirdly" today.)
5. **Stay additive** — do NOT rename or remove existing single-tree chassis. Bundle decomposition emits NEW chassis alongside any existing single-tree output. Brief 1.5b's curation file keys by chassis filename; renames would invalidate it.
6. **Update survey report** — section 2 (per-species table) flags bundle sources; section 4 (top hardest cases) gets a new sub-section for non-tree bundle debris; section 5 (roster recommendations) re-evaluates the 13 species Whittle previously flagged for removal in light of bundle decomposition

**Do NOT:**
- Modify `public/trees/_chassis/` files outside of script-driven regeneration
- Modify the Salon UI, generate-salon.js, serve.js, treeAtlasMaterial.js, InstancedTrees.jsx, bake-look.js, bake-trees.js, publish-glb.js
- Build curation UI (Brief 1.5b)
- Build a thumbnail browser
- Change Brief 0's WOOD/LEAF classification heuristic (the Olmsted patch from 2026-05-21 is current; you inherit it)
- Try to repair vendor GLBs that have zero geometry entirely (the `WOOD=0 LEAF=0 AMB=0` cases from Whittle's report — broken sources, not bundle-decomposable)
- Rename existing single-tree chassis (Brief 1.5b's curation keys by filename)

## Architecture

### Bundle detection heuristic

A GLB is a bundle if, at the top scene level, it has more than one geometry-bearing node. Inside a bundle, each top-level node is a candidate chassis item.

Implementation sketch using `@gltf-transform/core`:

```js
function isBundle(doc) {
  const scene = doc.getRoot().getDefaultScene()
  const topNodes = scene.listChildren()
  const geometryNodes = topNodes.filter(n => hasMeshInSubtree(n))
  return geometryNodes.length > 1
}
```

`hasMeshInSubtree` walks the node's descendants and returns true if any node has a mesh.

### Decomposition

For each bundle GLB:
1. Walk top-level scene children
2. For each child node containing mesh geometry:
   - Collect all descendant primitives
   - Classify each via existing `classifyPrim` (no changes to that function)
   - Wood subset = primitives classified WOOD
   - Leaf subset = primitives classified LEAF
   - Ambiguous subset = primitives classified AMBIGUOUS
3. If wood-subset is empty: skip (bundle debris — log to report under "non-tree bundle items")
4. If ambiguous-subset is non-empty: skip per Brief 0's "no AMBIGUOUS allowed" rule, log under existing skipped-ambiguous section
5. Otherwise: emit a chassis containing only the wood subset, with the top-level node's local transform baked into the geometry so the output GLB is upright + centered

### Naming convention for decomposed chassis

`<source-species-or-common-name>_<source-variant-letter><underscore><nodeName-or-nodeIdx>.glb`

Examples:
- `garden_mix_a_node02.glb` (node has no name)
- `garden_mix_a_oak_specimen.glb` (node has name "oak_specimen")
- `stylized_trees_1_b_tree03.glb`

When the node has a meaningful name (heuristic: non-empty, alphanumeric, longer than 2 chars), use the node name; otherwise use `node<idx>` where idx is the top-level child index.

Existing single-tree chassis keep their Whittle-era names (`acer_saccharum_a.glb`, etc.).

### Transform-baking

Each decomposed chassis GLB must be emitted as if the node were the scene root, with its transform applied to its geometry. `@gltf-transform/core` doesn't bake transforms automatically. Use the transform helper or manually apply the node's local matrix to each primitive's POSITION (and NORMAL) accessors before writing.

Critical: the node's local matrix is the source of the "leaning" issue today. Baking it into the geometry produces an upright + origin-centered chassis. Verify visually: pick a known-bundle chassis (e.g., one from `garden_mix`), de-leaf with the new script, open the resulting GLB in macOS Quick Look or `gltf-transform inspect` — confirm the trunk is along Y-up and the base is near origin.

### Idempotency

Re-running `survey-deleaf.js` produces byte-identical outputs (same chassis files + same survey report content). This is Brief 0's existing contract; preserve it. The new bundle-decomposition pass must be deterministic — same input GLBs → same decomposed outputs in same order with same names.

### Meta.json shape (preserved from Brief 0)

Per-chassis `.meta.json` sidecar keeps Brief 0's schema. Add one optional field for decomposed-from-bundle chassis:

```json
{
  "morphology": "<lookup or 'unknown'>",
  "heightRange": [...],
  "source": {
    "species": "garden_mix",
    "variant": 1,
    "bundleNode": "node02"
  },
  "scaffoldCount": null,
  "canopyStart": null,
  "leafAttachmentTags": []
}
```

Existing single-tree chassis meta.json shape unchanged (no `bundleNode` field).

### Survey report extensions

Update `scratch/brief-0-vendor-tree-survey-whittle.md` in-place (this script writes the report; just update its sections). Or write `scratch/brief-1.5c-bundle-survey-<your-name>.md` as a separate document — your call, mention which in your status. I lean toward separate document to preserve Whittle's report as historical record.

New sections:
- **Bundle detection summary**: total bundles detected, total decomposed chassis emitted, total bundle-debris items skipped
- **Per-bundle table**: source species → top-level node count → tree-classified node count → emitted chassis names → skipped reasons for non-emitted nodes
- **Coverage delta**: morphology coverage before vs after bundle decomposition (especially ornamental category, which was previously zero)
- **Operator-action list**: bundle items the script skipped where the operator might still want to hand-de-leaf (long-name nodes that suggest meaningful content)

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `arborist/survey-deleaf.js` | edit (bundle detection + decomposition + transform-baking) | +300 |
| `public/trees/_chassis/<new chassis>.glb` + meta.json | new (data; emitted by script) | data |
| `scratch/brief-1.5c-bundle-survey-<your-name>.md` | new (extended survey report) | ~400 |
| `arborist/NOTES.md` | edit (dated session-end entry under your name) | +40 |

Total: ~340 new LOC + N new data files + 1 new doc.

## Acceptance criteria

1. `node arborist/survey-deleaf.js` runs cleanly with no errors on the full vendor stock
2. Existing 141 single-tree chassis from Whittle's run are byte-identical after re-run (idempotency + additive)
3. Bundle GLBs detected: at minimum `garden_mix`, `stylized_trees_1`, `stylized_trees_2`, `candicands`, `tree_variation` correctly flagged as bundles; specific list documented in the survey report
4. Decomposed chassis emerge upright and origin-centered: spot-check one bundle-derived chassis in Quick Look — trunk along Y-up, base near origin, geometry within sensible bounds for the height range
5. Decomposed chassis carry `meta.json.source.bundleNode` field; existing single-tree chassis meta.json unchanged
6. Bundle-debris items (top-level nodes with no WOOD) are NOT written as chassis; they appear in the survey report as actionable items
7. Total chassis count grows (some bundles will decompose into multiple usable items); ornamental morphology coverage should grow from Whittle's zero baseline (specifically, examine which bundle items land in ornamental — many "garden_mix" / "stylized" items will)
8. Re-running the script a second time produces byte-identical chassis files + textually-identical survey report (excepting any embedded timestamps)
9. Brief 1.5b's `_chassis-curation.json` (if it exists at re-run time) remains valid: any chassis filename present in 1.5b's curation file that maps to a chassis NOT re-emitted by 1.5c should be flagged in the survey report (not silently invalidated)
10. No regression on Brief 1's Salon publish: a chassis you decomposed should compose-publish-render correctly in LS after Grove curation

## Constraints

- **Stash-isolate** per `feedback_stash_isolate_per_file`
- Per `project_writeifchanged_touches_mtime` — `writeIfChanged` MUST touch mtime on no-op branch
- Idempotent: re-run produces same outputs
- No modifications to runtime code, bake pipeline, Salon UI, or any non-`survey-deleaf.js` arborist script
- Do NOT change `classifyPrim` (Olmsted's patch from 2026-05-21 stands; keyword cross-check doctrine per `feedback_classifier_keyword_cross_check`)
- Preserve Brief 0's source-traceable naming for single-tree chassis; decomposed chassis use the extended naming convention above
- Do NOT consume the `_chassis-curation.json` file (Brief 1.5b territory) — your output is INDEPENDENT of curation state
- Determinism: same input → same output

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- Bundles you detected that Whittle's report did NOT flag — the bundle list above is suggestive, not exhaustive
- Vendor sources where bundle decomposition produces > 10 chassis from one source (high-leverage; but also possibly low-quality if it's a forest scene with junk trees)
- Transform-baking edge cases: bundles where the local matrix contains shear, non-uniform scale, or extreme rotation that produces visually-wrong upright chassis after baking
- Whether `gltf-transform` has a built-in transform-bake helper you used (cite it if so)
- Any chassis Brief 1.5b's curation file might point at that you can no longer emit (e.g., if you renamed a chassis the operator had already approved — you shouldn't, per the additivity rule, but flag if you did)
- Any non-tree content you decomposed that's actually useful for the kit (rocks, planters, fences) — surface for the Cartograph team, do NOT add to the chassis library
- Whether morphology lookup via `species-map.json` works for bundle decomposition (most bundles probably don't have morphology entries; flag the gap)

## Out of scope

- Curation surface — rename, approved flag (Brief 1.5b)
- Per-chassis tilt persistence (deprioritized)
- Thumbnail browser (v1.6)
- Modifying the WOOD/LEAF classifier
- Repairing vendor GLBs with zero geometry
- Phase F leaf-pack work
- Gradient-map bark (Brief 2)
- Deformer rig (Brief 3)
- Camera-aware hemisphere cull (Brief 4)
- Any work in `meteorologist/` or `cartograph/`
