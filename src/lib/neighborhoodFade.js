/**
 * neighborhoodFade — THE edge fade of the neighborhood, as ONE GLSL function every faded surface calls.
 *
 * ⭐ The fade SSoT (BRIEF-fade-ssot): one radius, one band, derived by boundaryRecords.mjs#deriveFade. The shader
 * side was written FIVE times (fadeGroundMaterial, grassMaterial, useSurfaceMaterial, MapLayers, AerialTiles),
 * each its own `smoothstep(uFadeInner, uFadeOuter, r)`. They are this one function now.
 *
 * ⭐ RUFFLE (Jacob, 2026-09-27: "I do like the ability to 'ruffle' the farthest away edge"). Noise pushes the fade
 * in and out along the rim, so the edge is scalloped rather than a perfect circle. 0 = a straight edge (every
 * town before this existed); 1 = the scallops swing a full band either side. Authored per town in Extent, beside
 * Fade band, stored as `fadeRuffle` in neighborhood_boundary.json.
 *
 * Use: put NEIGHBORHOOD_FADE_GLSL after `#include <common>` in the fragment shader, call
 * `neighborhoodFade(worldXZ)` for the alpha factor, bind with bindNeighborhoodFade, key with neighborhoodFadeKey.
 */
import * as THREE from 'three'

export const NEIGHBORHOOD_FADE_GLSL = /* glsl */`
uniform vec2 uFadeCenter;
uniform float uFadeInner;
uniform float uFadeOuter;
uniform float uFadeRuffle;
float nbFadeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nbFadeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nbFadeHash(i), nbFadeHash(i + vec2(1.0, 0.0)), u.x),
             mix(nbFadeHash(i + vec2(0.0, 1.0)), nbFadeHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// 1 inside the town, 0 past the edge; the ruffle scallops the edge at ~9 lobes per radius.
float neighborhoodFade(vec2 xz) {
  vec2 d = xz - uFadeCenter;
  float band = max(1.0, uFadeOuter - uFadeInner);
  float wobble = (nbFadeNoise(d / max(uFadeOuter, 1.0) * 9.0) - 0.5) * 2.0 * band * uFadeRuffle;
  return 1.0 - smoothstep(uFadeInner, uFadeOuter, length(d) + wobble);
}
`

/** Bind the four fade uniforms. `center` is [x, z]; `ruffle` absent means 0 (a straight edge). */
export function bindNeighborhoodFade(uniforms, { center, inner, outer, ruffle }) {
  uniforms.uFadeCenter = { value: new THREE.Vector2(center[0], center[1]) }
  uniforms.uFadeInner  = { value: inner }
  uniforms.uFadeOuter  = { value: outer }
  uniforms.uFadeRuffle = { value: Number.isFinite(ruffle) ? ruffle : 0 }
}

/** Program cache-key fragment for a fade (materials with different fades must not share a program by accident). */
export const neighborhoodFadeKey = (f) => `f${f.inner}-${f.outer}-r${Number.isFinite(f.ruffle) ? f.ruffle : 0}`
