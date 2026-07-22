/**
 * tree-bake-inputs.mjs — the SCENE-side inputs of the tree bake, in one place.
 *
 * `arborist/bake-trees.js` is the JOIN: a neighbourhood's census × the Arborist's
 * grove. Everything on the census side of that join — which placements, which
 * species routing, which hardscape mask, and where the result lands — is a
 * NEIGHBOURHOOD fact, and the Cartograph owns neighbourhood facts
 * (`ORIENTATION.md` — "Cartograph intake owns *where* + *which*"). The Arborist
 * owns the other side (species → pristine asset) and does not get a vote here.
 *
 * TWO callers bake trees: the Cartograph pour (`cartograph/serve.js`) and the
 * Grove's ship-to-slab (`arborist/serve.js`). Both resolve through this module,
 * so there is ONE answer to "what does scene X's tree bake read and write" —
 * not two that drift. The Grove used to answer it differently (it passed the
 * Look name as the scene and had no census plumbing at all), which is how LS's
 * Grove bake spent months writing to a phantom nobody read.
 * (`feedback_no_parallel_pipeline_for_scenes`,
 *  `project_the_palimpsest_code_path_multiplicity` — collapse paths, never add one.)
 *
 * Returns `null` when a scene has no census on disk — an HONEST ZERO, not an
 * error: the caller skips the placement step rather than baking someone else's
 * trees under this scene's name.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sceneCleanDir } from './config.js'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const LOOKS_INDEX = join(REPO_ROOT, 'public', 'looks', 'index.json')

/**
 * The NEIGHBOURHOOD a Look is a Look OF. This is the axis split, in one function.
 *
 * Every Look's `scene` currently equals its `id` (`lafayette-square→lafayette-square`,
 * `toy→toy`, …), which is why passing a Look id where a scene was wanted has been
 * ACCIDENTALLY correct everywhere except the one path that used the fossil
 * `default`. That 1:1 is history, not a constraint — the day a second Look sits
 * over one neighbourhood (a winter Lafayette Square), the two would fight over one
 * census. Resolve through here rather than assuming the identity.
 *
 * @returns {string|null} the scene id, or null if the Look is unknown.
 */
export function sceneForLook(lookId) {
  let idx
  try { idx = JSON.parse(readFileSync(LOOKS_INDEX, 'utf8')) } catch { return null }
  const look = (idx.looks || []).find(l => l.id === lookId)
  if (!look) return null
  // A Look with no `scene` predates the field; the 1:1 above is the honest guess.
  return look.scene || look.id
}

/**
 * EVERY scene's placements land here: `public/baked/<scene>/trees.json`. One
 * rule, no exceptions — this is what `InstancedTrees.jsx` fetches.
 *
 * Lafayette Square used to be the exception, shipping as `public/baked/default.json`.
 * That name dated from when placements were believed cross-Look; they never were
 * — it was LS's mother map named after `public/looks/index.json`'s opening
 * `"default": "lafayette-square"` pointer, and nothing more. Retired 2026-07-15
 * (Phase 3), which is what makes LS an ordinary neighbourhood here.
 */
export const placementsPathForScene = (scene) => `public/baked/${scene}/trees.json`

/**
 * The toy fixture's census is hand-authored and lives outside the scene data
 * dirs (`project_toy_canonical_input_path`).
 */
const TOY_PLACEMENTS = 'src/data/toy/toy-trees.json'

/**
 * @param {string} scene — the NEIGHBOURHOOD id (a Look's `scene` field), never a Look id.
 * @returns {{scene, placements?, speciesMapPath?, forbiddenMapPath?, output, inputs}|null}
 *   Spread straight into `bakeTrees({ ...inputs, heroLook })`. `inputs` is the
 *   mtime-dirty list for the caller's rebuild check. `null` = no census on disk.
 */
export function treeBakeInputsForScene(scene) {
  // Lafayette Square used to short-circuit here to `bake-trees.js`'s built-in
  // src/data/* defaults (its census, species map and hardscape mask predated
  // scenes). Retired 2026-07-16: its park census + species map moved into this
  // scene's data dir under the ordinary per-hood convention, so LS now falls
  // through to the poured branch below like every other neighbourhood — one
  // intake path, no special case. (`HANDOFF-ls-statistical-planting.md` Move 2.)

  if (scene === 'toy') {
    // Hand-authored centerlines with no hardscape polygons in this frame, so no
    // forbidden-surface mask — matching the documented toy re-bake command.
    return {
      scene,
      placements: [TOY_PLACEMENTS],
      output: placementsPathForScene(scene),
      inputs: [join(REPO_ROOT, TOY_PLACEMENTS)],
    }
  }

  // A poured installation: union whichever census layers exist. They are
  // spatially DISJOINT layers of one census, not alternatives — the City
  // Forestry census, the OSM county-side floor, and the NLCD canopy fill.
  // ⭐ EVERY canonical well, unioned. The list must stay in lockstep with
  // `arborist/bake-trees.js#SOURCE_BY_BASENAME` (the filename → provenance table)
  // — that is the one enumeration of what a census is made of.
  //
  // ⚠️ `park_census.json` was missing here until 2026-07-22, while bake-trees'
  // own no-placements DEFAULT read ONLY `park_census.json`. Two entry points,
  // two disjoint answers, each silently dropping what the other kept: a bake
  // through this resolver lost the hand-curated park census, and a bake through
  // the default lost the ENTIRE NEIGHBOURHOOD — which is what shipped, so LS
  // showed 729 park trees and no street trees at all. Add new wells to BOTH.
  const clean = sceneCleanDir(scene)
  const placements = [
    join(clean, 'park_census.json'),        // authored park census (hand-curated, real species)
    join(clean, 'park_trees.json'),         // City Forestry layer 1 (whole hood, real)
    join(clean, 'forest_park_trees.json'),  // City Forestry layer 4 (Forest Park, rich species)
    join(clean, 'osm_trees.json'),          // OSM floor (real positions)
    join(clean, 'derived_trees.json'),      // NLCD canopy fill (synthetic; absent when a scene opts real-only)
  ].filter(existsSync)
  if (!placements.length) return null

  // Per-scene species routing collapses the census onto the scene's library
  // palette; absent → bake-trees falls back to LS's global map.
  const sceneMap = join(clean, '..', 'tree-species-map.json')
  const speciesMapPath = existsSync(sceneMap) ? sceneMap : undefined
  const forbiddenMapPath = join(clean, 'map.json')

  // ⭐ The FROZEN Section surfaces — the ground bake's WALL artifact. This is
  // what answers "may a tree stand here": the frozen curb separates road from
  // land, and the ped strips locate the treelawn. map.json rides along for the
  // literal obstructions inside land-use (buildings/water/parking/paths) only.
  //
  // ⚠️ ORDERING: this is a BAKE OUTPUT, so the ground bake must have run for
  // this scene before its trees can be placed honestly. Absent → we fall back to
  // the legacy paint-layer mask, which cannot see the road and will scatter
  // trees into the carriageway. That fallback is a known-wrong last resort, not
  // a supported mode; it is loud on purpose.
  const shapePath = join(REPO_ROOT, 'public', 'baked', scene, 'shape.json')
  const zoneShapePath = existsSync(shapePath) ? shapePath : undefined

  // The hood's edge — the boundary-street polygon that separates "literal" from
  // "GPU-managed". The SAME file buildings and lamps already test membership
  // against (`NEIGHBORHOOD-INPUTS §5.2`); trees were the only object ignoring it.
  const bnd = join(clean, '..', 'neighborhood_boundary.json')
  const boundaryPath = existsSync(bnd) ? bnd : undefined

  // ⚠️ Scene-keyed output, but the RUNTIME fetches placements Look-keyed —
  // `InstancedTrees.jsx` builds `baked/<look>/trees.json`. The two paths
  // coincide only because every Look's scene equals its id today. Phase 3 is
  // what actually reconciles them; until then this must not be "fixed" to a
  // Look id — the census is the neighbourhood's, and that is the whole point.
  return {
    scene,
    placements,
    speciesMapPath,
    forbiddenMapPath,
    zoneShapePath,
    boundaryPath,
    output: `public/baked/${scene}/trees.json`,
    inputs: [...placements, speciesMapPath, forbiddenMapPath, zoneShapePath, boundaryPath].filter(Boolean),
  }
}
