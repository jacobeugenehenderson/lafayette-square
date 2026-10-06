/**
 * neighborhoodFade — THE edge fade of the neighborhood, as ONE GLSL function every faded surface calls.
 *
 * ⭐ The fade SSoT (BRIEF-fade-ssot): one radius, one band, derived by boundaryRecords.mjs#deriveFade. The shader
 * side was written FIVE times (fadeGroundMaterial, grassMaterial, useSurfaceMaterial, MapLayers, AerialTiles),
 * each its own `smoothstep(uFadeInner, uFadeOuter, r)`. They are this one function now.
 *
 * ⭐ RUFFLE (Jacob, 2026-09-27: "I do like the ability to 'ruffle' the farthest away edge"). Noise scallops the edge
 * rather than leaving a perfect circle. 0 = a straight edge; 1 = the scallops bite a full band deep.
 * ⛔ INWARD ONLY (`r + |wobble|`): the edge never passes the radius, so the clip at the radius is exact for every
 * ruffle and no Look decides how far geometry reaches. The same reason the fade itself went inward on 2026-09-20
 * (`boundaryRecords.mjs#deriveFade`: outward only works if geometry reaches past the edge). To fade further out,
 * pull the radius out in Extent.
 * ⭐ A Look channel (`edgeRuffle`, TOD-animatable), so it is ONE shared uniform (`EDGE_RUFFLE`) every faded material
 * binds and a per-frame driver sets — never a value baked into a program, and never part of its cache key.
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
  return 1.0 - smoothstep(uFadeInner, uFadeOuter, length(d) + abs(wobble));
}
`

/** THE ruffle, shared by every faded material on the page (one town per page), set each frame from the Look's
 *  `edgeRuffle` channel by the edge driver (`PostProcessing.jsx#EdgeRuffleDriver`). 0 until a driver runs. */
export const EDGE_RUFFLE = { value: 0 }

/** Bind the fade uniforms. `center` is [x, z]; the ruffle is the shared `EDGE_RUFFLE`. */
export function bindNeighborhoodFade(uniforms, { center, inner, outer }) {
  uniforms.uFadeCenter = { value: new THREE.Vector2(center[0], center[1]) }
  uniforms.uFadeInner  = { value: inner }
  uniforms.uFadeOuter  = { value: outer }
  uniforms.uFadeRuffle = EDGE_RUFFLE
}

/** Program cache-key fragment for a fade (materials with different fades must not share a program by accident). */
export const neighborhoodFadeKey = (f) => `f${f.inner}-${f.outer}`
