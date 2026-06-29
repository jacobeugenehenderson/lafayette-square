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
  // FX map (ground.poolmap.png): G = baked contact shadow, R = lamp pool — the
  // SAME map grassMaterial uses. The trunk blend applies it so the trunk base
  // takes the COMBINED EFFECTIVE ground colour (albedo darkened by its own
  // contact-shadow ring + lamp pool), not the bright raw albedo.
  fxMapUniform:  { value: null },
  fxMinUniform:  { value: new THREE.Vector2(0, 0) },
  fxSpanUniform: { value: new THREE.Vector2(1, 1) },
  fxScaleUniform:{ value: 1 },
}

export function setGroundColorMap(texture, min, span) {
  groundColor.mapUniform.value = texture || null
  if (min)  groundColor.minUniform.value.set(min[0], min[1])
  if (span) groundColor.spanUniform.value.set(span[0], span[1])
  groundColor.hasUniform.value = texture ? 1 : 0
}

export function setGroundFxMap(texture, min, span, scale) {
  groundColor.fxMapUniform.value = texture || null
  if (min)  groundColor.fxMinUniform.value.set(min[0], min[1])
  if (span) groundColor.fxSpanUniform.value.set(span[0], span[1])
  if (scale != null) groundColor.fxScaleUniform.value = scale
}
