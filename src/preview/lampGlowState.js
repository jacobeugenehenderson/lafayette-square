/**
 * lampGlowState — the shared lamp uniforms every lamp receiver binds once (ground via groundLamp.js,
 * walls via SlabBuildings, trees via treeAtlasMaterial). StreetLights writes them each frame from the
 * lamp's own output × the Lamp Glow shares, which the Stage pump / production driver write.
 */
import * as THREE from 'three'

// Module-scoped uniform objects so shaders can hold a stable reference.
export const lampGlow = {
  // Lamp output × the trees share — written by StreetLights each frame; 0 with no lamps.
  treesUniform: { value: 0 },
  // The authored shares of the lamp's output (the Lamp Glow card), written by LampGlowPump (Stage,
  // live) / LampGlowDriver (production, baked); StreetLights multiplies the lamp's output by them.
  share: { trees: 1, pool: 1, radius: 1, centre: 1.2, centreSoft: 0.1 },
  // The pool's SHAPE for the ground (lampPool.js POOL_SHAPE_GLSL): the Radius knob (0..1 of the reach) and the
  // authored dark centre (metres) and its edge's softness. Walls + trees still clip by canopyWipe (the knob as a threshold).
  poolRadiusUniform: { value: 1 },
  poolCentreUniform: { value: 1.2 },
  poolCentreSoftUniform: { value: 0.1 },
  canopyWipeUniform: { value: 0 },
  // Init 0, not the legacy default — the pool is driven live by StreetLights
  // (lantern output) from frame 1, so a non-zero init only causes a bright
  // flash before the first drive. (Was `initial.pool` = 1.0 → the flash.)
  poolUniform:  { value: 0 },
  // The lamp's light COLOUR — written each frame from the resolved `lantern`
  // channel (StreetLights) so the ground pool (and canopy glow) take on the
  // lantern's colour instead of a hardcoded warm. THREE.Color so shaders read
  // it as a vec3. Default = the legacy warm pool tint (sRGB-ish, baked into
  // the shaders before; no day-one change).
  colorUniform: { value: new THREE.Color(0.80, 0.62, 0.32) },
}

// ⭐ THE LAMPS, FOR BUILDING WALLS — a grid of the lamps StreetLights DRAWS (one lamp list; `buildLampGrid`,
// src/lib/lampPool.js). Stable uniform objects: SlabBuildings binds them once, StreetLights fills them.
// dims = (cols, rows, k); k = 0 ⇒ no lamps ⇒ no wall light.
export const lampGrid = {
  uLampGrid:     { value: null },
  uLampGridMin:  { value: new THREE.Vector2() },
  uLampGridDims: { value: new THREE.Vector3(0, 0, 0) },
  uLampGridCell: { value: 0 },
  uLampHeadY:    { value: 0 },
  uLampReach:    { value: 0 },   // lamps.json#reach — the town's derived pool reach
}
