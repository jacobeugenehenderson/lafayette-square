/**
 * gravelPathMaterial — the pebble/Voronoi gravel shader for park footpaths,
 * extracted from LafayettePark so BOTH consumers share one material:
 *   - the baked `park-path` ground group (BakedGround → GravelMesh)
 *   - the lifted lake-bridge overlay (LafayettePark, until Phase 5)
 *
 * Procedural Voronoi pebbles + FBM grime, TOD day/night tint, and the lamp
 * light-pool (sampled from the shared lamp lightmap). Per-vertex terrain
 * displacement via patchTerrain so it rides the ground like every other
 * ground layer.
 *
 * Returns `{ material, shaderRef }`. The caller drives the time-of-day uniform
 * each frame: `shaderRef.current.uniforms.uSunAltitude.value = sunAltitude`.
 *
 * Phase 3 promotes the look-tunable bits (color/roughness/TOD curve) to a
 * scene.json-driven Stage material card; the shader body stays here.
 */
import * as THREE from 'three'
import { getLampLightmap } from './lampLightmap.js'
import { patchTerrain } from '../utils/terrainShader'

// The gravel's natural average tone — the tint reference. A park_path swatch
// equal to this is a NO-OP (tint = 1), so the dialed-in Voronoi palette is the
// default; shifting the swatch shifts the whole gravel hue proportionally.
const NEUTRAL_GRAVEL = [0x92 / 255, 0x8a / 255, 0x7c / 255]
function tintFromHex(hex) {
  if (!hex || typeof hex !== 'string') return new THREE.Vector3(1, 1, 1)
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  if ([r, g, b].some(v => Number.isNaN(v))) return new THREE.Vector3(1, 1, 1)
  return new THREE.Vector3(r / NEUTRAL_GRAVEL[0], g / NEUTRAL_GRAVEL[1], b / NEUTRAL_GRAVEL[2])
}

/**
 * @param {object} [look]  — look-driven params (Phase 3; the world-materials
 *   palette arc #6 will formalize the card). All optional; omitting any keeps
 *   the dialed-in default so the gravel is unchanged.
 *   - tintHex   : park_path swatch colour → proportional hue shift (default no-op)
 *   - roughness : surface roughness (default 0.95)
 *   - scale     : pebble-pattern scale, >1 = finer (default 1)
 */
export function makeGravelPathMaterial({ tintHex = null, roughness = 0.95, scale = 1 } = {}) {
  const shaderRef = { current: null }
  const mat = new THREE.MeshStandardMaterial({
    roughness,
    color: '#928a7c',
    // paths win over any coplanar surface they touch (lake island, banks).
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunAltitude = { value: 0.5 }
    shader.uniforms.uLampMap = { value: getLampLightmap() }
    shader.uniforms.uTint = { value: tintFromHex(tintHex) }
    shader.uniforms.uPathScale = { value: scale > 0 ? scale : 1 }
    shaderRef.current = shader

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vPathPos;`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vPathPos = (modelMatrix * vec4(position, 1.0)).xyz;`
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uSunAltitude;
       uniform sampler2D uLampMap;
       uniform vec3 uTint;        // look-driven hue shift (1,1,1 = no change)
       uniform float uPathScale;  // look-driven pebble-pattern scale (1 = default)
       varying vec3 vPathPos;

       float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
       vec2 pHash2(vec2 p) { return vec2(pHash(p), pHash(p + vec2(37.0, 91.0))); }

       float pNoise(vec2 p) {
         vec2 i = floor(p), f = fract(p);
         f = f * f * (3.0 - 2.0 * f);
         return mix(mix(pHash(i), pHash(i+vec2(1,0)), f.x),
                    mix(pHash(i+vec2(0,1)), pHash(i+vec2(1,1)), f.x), f.y);
       }

       float pFBM(vec2 p) {
         float v = 0.0, a = 0.5;
         for (int i = 0; i < 4; i++) { v += a * pNoise(p); p *= 2.05; a *= 0.48; }
         return v;
       }

       vec3 pVoronoi(vec2 p) {
         vec2 ig = floor(p);
         vec2 fg = fract(p);
         float minD = 1.0;
         vec2 bestCell = vec2(0.0);
         for (int y = -1; y <= 1; y++) {
           for (int x = -1; x <= 1; x++) {
             vec2 nb = vec2(float(x), float(y));
             vec2 pt = pHash2(ig + nb);
             vec2 diff = nb + pt - fg;
             float d = dot(diff, diff);
             if (d < minD) { minD = d; bestCell = ig + nb; }
           }
         }
         return vec3(sqrt(minD), bestCell);
       }`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       vec2 pp = vPathPos.xz;
       vec2 sp = pp * uPathScale;   // look-scaled pattern domain (lamp UV stays world)

       vec3 vr = pVoronoi(sp * 3.0);
       float vDist = vr.x;
       float stoneId = pHash(vr.yz);

       vec3 stoneCol = mix(vec3(0.28, 0.26, 0.23), vec3(0.32, 0.28, 0.22), step(0.3, stoneId));
       stoneCol = mix(stoneCol, vec3(0.35, 0.30, 0.24), step(0.6, stoneId));
       stoneCol = mix(stoneCol, vec3(0.18, 0.16, 0.13), step(0.85, stoneId));

       float gap = smoothstep(0.30, 0.38, vDist);
       vec3 gravelCol = mix(stoneCol, vec3(0.12, 0.10, 0.08), gap * 0.7);

       gravelCol *= 0.9 + pNoise(sp * 12.0 + vr.yz * 7.0) * 0.2;
       gravelCol = mix(gravelCol, gravelCol * 0.85, smoothstep(0.4, 0.65, pFBM(sp * 0.3)));

       // Look-driven hue shift (uTint = 1 by default → palette unchanged).
       gravelCol *= uTint;

       float dayBright = smoothstep(-0.12, 0.3, uSunAltitude);
       float brightness = mix(0.7, 1.0, dayBright);
       vec3 nightTint = vec3(0.6, 0.7, 1.0);
       gravelCol = mix(gravelCol * nightTint, gravelCol, dayBright) * brightness;

       vec2 pathLampUV = (pp + 200.0) / 400.0;
       float pathLampI = texture2D(uLampMap, pathLampUV).r;
       float pathLampOn = clamp((0.15 - uSunAltitude) / 0.45, 0.0, 1.0);
       gravelCol += vec3(0.50, 0.45, 0.28) * pathLampI * pathLampOn * 0.7;

       diffuseColor.rgb = pow(gravelCol, vec3(2.2));`
    )
  }
  // Unique cache key MUST be set before patchTerrain wraps the material —
  // otherwise three.js's program cache collapses this shader onto another
  // `terrain-vp-std` material and the gravel fragment never compiles.
  mat.customProgramCacheKey = () => 'park-path-gravel-v1'
  patchTerrain(mat, { perVertex: true })
  return { material: mat, shaderRef }
}
