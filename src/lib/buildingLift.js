/**
 * buildingLift — THE ONE DEFINITION of how a slab building is lifted onto the terrain: the GLSL its shaders run and
 * the JS twin its pick copy runs, side by side so they cannot drift (Argon, 2026-10-06).
 *
 * WHY. The shader lifts every building vertex by the terrain; the raycast tested the UN-lifted CPU geometry. So what
 * you could click sat `aCentroidY × uExag` below what you saw — measured in the Ward on Huron (Hero, exag 1): a drawn
 * roof selected nothing, and empty ground under the building selected it. (The shadow pass had the same split once —
 * SlabBuildings' depth material.) Every consumer of a building's drawn position reads THIS: the material, the depth
 * material and the pick copy (SlabBuildings.jsx).
 * ⭐ Changing the lift is an edit HERE, both halves at once. ▶ node checks/claims-a-click-hits-what-is-drawn.mjs
 *    fails if what is clicked is not what is drawn.
 *
 * Reads: `aCentroidY` (the building's terrain anchor, raw), `uExag` (the shared exaggeration, terrainShader's
 * `terrainExag`), and for foundations `uRiserFloor` (terrainShader's `terrainFloorRaw`). The baked riser's below-grade
 * ring is the only geometry with y < 0; its baked depth is a MARKER, not a size — the ring is seated on the town's
 * floor, and the rest lifts rigidly with the anchor.
 */

/** The vertex-shader lift, after `#include <begin_vertex>` (operates on `transformed`). */
export function buildingLiftGLSL(isFoundation) {
  return isFoundation
    ? 'transformed.y = position.y < 0.0 ? uRiserFloor * uExag : transformed.y + aCentroidY * uExag;'
    : 'transformed.y += aCentroidY * uExag;'
}

/** The same lift on the CPU, for one vertex: its raw y, its anchor, the exaggeration, the floor (foundations only). */
export function buildingLiftY(y, centroidY, exag, riserFloor, isFoundation) {
  return isFoundation && y < 0 ? riserFloor * exag : y + centroidY * exag
}
