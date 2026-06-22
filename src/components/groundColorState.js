import * as THREE from 'three'

/**
 * groundColorState — shared uniforms for the baked per-Look ground-color map
 * (`ground.colormap.png`, a raster of the ground albedo).
 *
 * BakedGround — which already loads the per-Look ground bundle, and is mounted
 * wherever the LS ground renders (production / Stage / Preview) — writes these
 * when the colormap loads. The tree trunk shader (treeAtlasMaterial) reads them
 * to blend each trunk base toward the ACTUAL ground beneath it (grass / sidewalk
 * / asphalt — "whatever it is").
 *
 * The Arborist Salon never mounts BakedGround, so `has` stays 0 there → the
 * trunk blend is OFF in the Salon by construction (LS-driven, default off).
 * Mirrors the lampGlowState pattern (shared module-scoped uniform objects).
 */
export const groundColor = {
  mapUniform:  { value: null },
  minUniform:  { value: new THREE.Vector2(0, 0) },
  spanUniform: { value: new THREE.Vector2(1, 1) },
  hasUniform:  { value: 0 },
}

export function setGroundColorMap(texture, min, span) {
  groundColor.mapUniform.value = texture || null
  if (min)  groundColor.minUniform.value.set(min[0], min[1])
  if (span) groundColor.spanUniform.value.set(span[0], span[1])
  groundColor.hasUniform.value = texture ? 1 : 0
}
