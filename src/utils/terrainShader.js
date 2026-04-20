/**
 * Shared GPU terrain displacement.
 *
 * One DataTexture, one exaggeration uniform — every patched material
 * rises and falls together.  Update `terrainExag.value` once per frame
 * (StreetRibbons drives this) and all meshes follow.
 *
 * View-mode targets:
 *   hero:        V_EXAG (10)  — dramatic telephoto terrain
 *   browse:      0            — flat map
 *   planetarium: 1            — life-size street level
 */

import * as THREE from 'three'
import terrainData from '../data/terrain.json'

export { V_EXAG } from './elevation'

const { width, height, bounds, data } = terrainData
const spanX = bounds.maxX - bounds.minX
const spanZ = bounds.maxZ - bounds.minZ

// ── Singleton terrain texture ────────────────────────────────────

export const terrainTexture = (() => {
  const tex = new THREE.DataTexture(
    new Float32Array(data), width, height,
    THREE.RedFormat, THREE.FloatType,
  )
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
})()

// ── Shared exaggeration uniform (mutate .value, all materials follow) ──

export const terrainExag = { value: 0 }

// ── Shared uniform objects ───────────────────────────────────────

export const UNIFORMS = {
  uTerrainMap: { value: terrainTexture },
  uBMinX: { value: bounds.minX },
  uBMinZ: { value: bounds.minZ },
  uSpanX: { value: spanX },
  uSpanZ: { value: spanZ },
  uExag: terrainExag,
}

/** Assign shared terrain uniforms to a compiled shader. */
export function assignTerrainUniforms(shader) {
  Object.assign(shader.uniforms, UNIFORMS)
}

// ── GLSL snippets ────────────────────────────────────────────────

/** Uniform declarations — inject after #include <common>. */
export const TERRAIN_DECL = `
uniform sampler2D uTerrainMap;
uniform float uBMinX, uBMinZ, uSpanX, uSpanZ, uExag;`

/**
 * Vertex displacement — replaces #include <begin_vertex>.
 * Uses modelMatrix for world-space terrain sampling.
 * Good for materials with no other begin_vertex modifications.
 */
export const TERRAIN_DISPLACE = `
#include <begin_vertex>
{
  vec4 _tw = modelMatrix * vec4(transformed, 1.0);
  vec2 _tuv = clamp(vec2(
    (_tw.x - uBMinX) / uSpanX,
    (_tw.z - uBMinZ) / uSpanZ
  ), 0.0, 1.0);
  transformed.y += texture2D(uTerrainMap, _tuv).r * uExag;
}`

/**
 * Rigid displacement — replaces #include <project_vertex>.
 * Samples terrain at the MESH ORIGIN (modelMatrix[3]), not per-vertex.
 * Every vertex gets the same Y offset → building moves as a solid body.
 * No tilted roofs, no warped walls.
 */
const TERRAIN_DISPLACE_RIGID = `
{
  vec2 _tuv = clamp(vec2(
    (modelMatrix[3].x - uBMinX) / uSpanX,
    (modelMatrix[3].z - uBMinZ) / uSpanZ
  ), 0.0, 1.0);
  transformed.y += texture2D(uTerrainMap, _tuv).r * uExag;
}
#include <project_vertex>`

/**
 * Terrain-derived normal — replaces #include <beginnormal_vertex>.
 * Only for ground surfaces (streets, blocks, park).
 * Do NOT use for buildings/trees/lamps — their normals are geometry-based.
 */
export const TERRAIN_NORMAL = `
#include <beginnormal_vertex>
if (uExag > 0.01) {
  vec4 _nw = modelMatrix * vec4(position, 1.0);
  vec2 _nuv = clamp(vec2(
    (_nw.x - uBMinX) / uSpanX,
    (_nw.z - uBMinZ) / uSpanZ
  ), 0.0, 1.0);
  float _eps = 5.0;
  float _du = _eps / uSpanX, _dv = _eps / uSpanZ;
  float _eL = texture2D(uTerrainMap, _nuv + vec2(-_du, 0.0)).r * uExag;
  float _eR = texture2D(uTerrainMap, _nuv + vec2( _du, 0.0)).r * uExag;
  float _eD = texture2D(uTerrainMap, _nuv + vec2(0.0, -_dv)).r * uExag;
  float _eU = texture2D(uTerrainMap, _nuv + vec2(0.0,  _dv)).r * uExag;
  objectNormal = normalize(vec3(_eL - _eR, 2.0 * _eps, _eD - _eU));
}`

/**
 * Per-vertex displacement — replaces #include <project_vertex>.
 * Samples terrain at each vertex's WORLD position (via modelMatrix).
 * Use for merged geometry (foundations) where modelMatrix[3] is origin.
 */
const TERRAIN_DISPLACE_PERVERTEX = `
{
  vec4 _tw = modelMatrix * vec4(transformed, 1.0);
  vec2 _tuv = clamp(vec2(
    (_tw.x - uBMinX) / uSpanX,
    (_tw.z - uBMinZ) / uSpanZ
  ), 0.0, 1.0);
  transformed.y += texture2D(uTerrainMap, _tuv).r * uExag;
}
#include <project_vertex>`

/**
 * Patch a material for GPU terrain displacement.
 * Chains safely with existing onBeforeCompile (buildings, etc.)
 * by injecting displacement at #include <project_vertex> — after
 * all other vertex modifications but before gl_Position.
 *
 * All patched materials share the same terrainExag uniform by reference,
 * so one .value update moves everything together.
 *
 * @param {THREE.Material} mat
 * @param {object} [opts]
 * @param {boolean} [opts.terrainNormals=false] — override normals with terrain gradient
 * @param {boolean} [opts.perVertex=false] — per-vertex sampling (for merged geometry like foundations)
 */
/**
 * Vertex displacement snippet for INSTANCED meshes — samples terrain at the
 * instance's world origin (modelMatrix * instanceMatrix * (0,0,0)) and lifts
 * every vertex of that instance uniformly. Preserves per-instance rotation
 * and scale. Replaces #include <begin_vertex>.
 */
export const TERRAIN_DISPLACE_INSTANCED = `
#include <begin_vertex>
{
  vec4 _iw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 _tuv = clamp(vec2(
    (_iw.x - uBMinX) / uSpanX,
    (_iw.z - uBMinZ) / uSpanZ
  ), 0.0, 1.0);
  transformed.y += texture2D(uTerrainMap, _tuv).r * uExag;
}`

/**
 * Patch a material for INSTANCED terrain displacement. Each instance is
 * lifted uniformly to its terrain height. Chains safely with existing
 * onBeforeCompile.
 */
export function patchTerrainInstanced(mat) {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader) => {
    assignTerrainUniforms(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL)
      .replace('#include <begin_vertex>', TERRAIN_DISPLACE_INSTANCED)
    if (prev) prev(shader)
  }
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => `terrain-inst-${prevKey ? prevKey() : 'std'}`
}

export function patchTerrain(mat, { terrainNormals = false, perVertex = false } = {}) {
  const displaceSnippet = perVertex ? TERRAIN_DISPLACE_PERVERTEX : TERRAIN_DISPLACE_RIGID
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader) => {
    assignTerrainUniforms(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL)
      .replace('#include <project_vertex>', displaceSnippet)
    if (terrainNormals) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', TERRAIN_NORMAL)
    }
    if (prev) prev(shader)
  }
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  const mode = perVertex ? 'v' : 'r'
  mat.customProgramCacheKey = () =>
    `terrain-${mode}${terrainNormals ? 'n' : 'p'}-${prevKey ? prevKey() : 'std'}`
}
