/**
 * slab-publish-rule.mjs — WHICH OF A BAKED TOWN'S FILES ARE PUBLISHED. One rule, read by the uploader (what goes to R2)
 * and by bake-manifest (what `manifest.json#files` lists), so the manifest never names a file no player can fetch
 * (Phase 2 C row 6: it listed lod0 GLBs, viz sheets and an all-impostor town's atlas, none of them ever uploaded).
 * ⛔ The verifier (verify-baked-in-r2.mjs) keeps its own reading of the runtime rule on purpose, so the two can disagree.
 */
import { ATLAS_ONLY_FILE } from '../src/lib/treeGeometry.js'
import { treeGeometryOfTown } from './slab-tree-geometry.mjs'

/** Files the bake PRODUCES and deliberately does not publish. Each names why — do not add one without it. */
export const EXCLUDE = [
  {
    // `InstancedTrees#lodForRole` can return ONLY lod1/lod1far; the camera-distance LOD swap was retired under
    // role-at-bake, so lod0 is never requested. 353.3 MB on LS alone; at 100 towns, ~20 GB nobody fetches.
    test: (p) => /-lod0\.glb$/.test(p),
    why: 'lod0 is never requested by the runtime (.gitignore, "lod0")',
  },
  {
    // Diagnostic atlas contact sheets for the operator's eye.
    test: (p) => /\/trees-atlas-[^/]*-viz\.png$/.test(p),
    why: 'atlas viz sheets are a diagnostic, not payload (.gitignore, "-viz.png")',
  },
]

/**
 * For one baked town, `(rel) => why | null`: why a file under `baked/<look>/` is not published, or null if it is.
 * ⭐ Model-tree files only when a tree is a model (Jacob, 2026-09-28): the rule is the RUNTIME's
 * (src/lib/treeGeometry.js), so this can never withhold a file the player would ask for.
 */
export function notPublished(townDir, look) {
  const geom = treeGeometryOfTown(townDir, look)
  return (rel) => {
    const p = `/baked/${look}/${rel}`
    const ex = EXCLUDE.find((e) => e.test(p))
    if (ex) return ex.why
    if (!geom.needed && ATLAS_ONLY_FILE(p)) return `no model trees — ${geom.why}`
    return null
  }
}
