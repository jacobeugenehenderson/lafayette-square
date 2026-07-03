/**
 * Shared GPU terrain displacement.
 *
 * One DataTexture, one exaggeration uniform — every patched material
 * rises and falls together.  Update `terrainExag.value` once per frame
 * (StreetRibbons drives this) and all meshes follow.
 *
 * ⛔ CONTRACT: the lift is ADDITIVE — `transformed.y += sampledLift`, never
 * `transformed.y = sampledLift`. The baked ground encodes coplanar layer order
 * in tiny per-group Y offsets (`bake-ground.js GROUND_Y_EPS`); an additive lift
 * preserves those deltas (every group samples the same XZ → same lift → the
 * delta survives). Switching to assignment would collapse the stack and bring
 * back the ground z-fighting. (ARCHITECTURE §8, z-fight fix 2026-06-17.)
 *
 * View-mode targets:
 *   hero:        V_EXAG       — dramatic telephoto terrain
 *   browse:      0            — flat map
 *   planetarium: 1            — life-size street level
 *
 * V_EXAG itself lives in src/lib/terrainCommon.js (currently 1.5 — sized
 * for the b24fce5 clip-to-stencil bake whose raw values are normalized to
 * local-min = 0).
 *
 * CPU/GPU reconcile (2026-06-29): the GPU `texture2D` sample is remapped
 * through the `_terrainUV` helper so it lands on the SAME grid index as the
 * CPU bilinear sampler (terrainCommon.makeElevationSampler). They previously
 * diverged up to ~2 m at the domain edges (texel-center vs grid-corner
 * convention); CPU and GPU now return identical world-Y.
 */

import * as THREE from 'three'
import { INSTANCE } from '../instance.js'

export { V_EXAG } from '../lib/terrainCommon.js'

// ── Per-installation terrain, loaded by lookId ───────────────────
//
// Terrain is a SLAB artifact now, not a bundled global. It travels with the
// installation (cartograph/data/<scene>/clean/terrain.*, copied into
// public/baked/<look>/terrain.* by the bake) and is fetched by the active
// lookId — the same by-lookId contract as ground.bin. No installation is
// privileged: production LS fetches its own slab terrain (byte-identical to the
// old bundled bake); Preview / any ?look= fetches that look's; the authoring
// Stage re-points live via reloadTerrain() on a scene switch. A look with no
// terrain (toy, un-baked) falls back to FLAT — renders flat, never crashes.
// (feedback_installations_are_independent; multi-instance routing 2026-07-02.)

// A 2×2 zero heightfield → getElevation()==0 everywhere, exag lifts nothing.
const FLAT_TERRAIN = { width: 2, height: 2, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, data: new Float32Array([0, 0, 0, 0]) }

// The active look at module load: ?look= override (Preview / any deep-link),
// else the deployment's default installation. The authoring app drives live
// changes through reloadTerrain(), so it doesn't need cartograph internals here.
function resolveLookId() {
  try {
    const m = (typeof window !== 'undefined' ? window.location.search : '').match(/[?&]look=([^&]+)/)
    if (m) return decodeURIComponent(m[1])
  } catch { /* no window */ }
  return INSTANCE.lookId
}

async function fetchTerrain(lookId) {
  const base = import.meta.env.BASE_URL
  try {
    const meta = await fetch(`${base}baked/${lookId}/terrain.json`).then(r => { if (!r.ok) throw new Error(`terrain.json ${r.status}`); return r.json() })
    const buf  = await fetch(`${base}baked/${lookId}/terrain.bin`).then(r => { if (!r.ok) throw new Error(`terrain.bin ${r.status}`); return r.arrayBuffer() })
    return { ...meta, data: new Float32Array(buf) }
  } catch (e) {
    console.warn(`[terrain] no baked terrain for look "${lookId}" — rendering flat`, e?.message || e)
    return FLAT_TERRAIN
  }
}

// Live terrain state — reassigned by reloadTerrain(). Exported as `let` so late
// re-reads see fresh values; the heavy consumers (elevation.js CPU sampler)
// subscribe to onTerrainReload() to rebuild. Top-level await keeps first paint
// correct (elevation.js builds its sampler from valid initial data).
let _lookId = resolveLookId()
let _terrain = await fetchTerrain(_lookId)
export let width  = _terrain.width
export let height = _terrain.height
export let bounds = _terrain.bounds
export let data   = _terrain.data
let spanX = bounds.maxX - bounds.minX
let spanZ = bounds.maxZ - bounds.minZ

function makeTerrainTexture(t) {
  const tex = new THREE.DataTexture(
    new Float32Array(t.data), t.width, t.height,
    THREE.RedFormat, THREE.FloatType,
  )
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

// ── Singleton terrain texture (identity stable across reloads) ────
export const terrainTexture = makeTerrainTexture(_terrain)

// ── Shared exaggeration uniform (mutate .value, all materials follow) ──

export const terrainExag = { value: 0 }

// ── Shared uniform objects ───────────────────────────────────────
// The wrapper objects here are Object.assign'd into every patched shader by
// reference (assignTerrainUniforms / patchTerrain*), so mutating a wrapper's
// .value propagates to ALL materials. reloadTerrain() MUST mutate .value on
// these existing wrappers, never replace the wrapper objects.
export const UNIFORMS = {
  uTerrainMap: { value: terrainTexture },
  uBMinX: { value: bounds.minX },
  uBMinZ: { value: bounds.minZ },
  uSpanX: { value: spanX },
  uSpanZ: { value: spanZ },
  uExag: terrainExag,
  uTexW: { value: width },
  uTexH: { value: height },
}

// ── Live re-point (authoring Stage: switch installation without reload) ──
const _reloadCbs = new Set()
/** Subscribe to terrain reloads (CPU-sampler consumers rebuild here). Returns an unsubscribe. */
export function onTerrainReload(cb) { _reloadCbs.add(cb); return () => _reloadCbs.delete(cb) }
/** The current heightfield payload — read fresh after a reload. */
export function currentTerrain() { return { width, height, bounds, data } }

/**
 * Re-point the terrain singleton at another look's baked heightfield, in place.
 * Skips when already on `lookId` unless `force` (a re-bake of the same look may
 * have changed the bytes — e.g. a look's first bake filling in previously-404
 * terrain).
 */
export async function reloadTerrain(lookId, { force = false } = {}) {
  if (!lookId || (lookId === _lookId && !force)) return
  const t = await fetchTerrain(lookId)
  _lookId = lookId
  width = t.width; height = t.height; bounds = t.bounds; data = t.data
  spanX = bounds.maxX - bounds.minX
  spanZ = bounds.maxZ - bounds.minZ
  const prevTex = UNIFORMS.uTerrainMap.value
  UNIFORMS.uTerrainMap.value = makeTerrainTexture(t)   // mutate .value, keep the wrapper
  if (prevTex?.dispose) prevTex.dispose()
  UNIFORMS.uBMinX.value = bounds.minX
  UNIFORMS.uBMinZ.value = bounds.minZ
  UNIFORMS.uSpanX.value = spanX
  UNIFORMS.uSpanZ.value = spanZ
  UNIFORMS.uTexW.value = width
  UNIFORMS.uTexH.value = height
  for (const cb of _reloadCbs) { try { cb() } catch (e) { console.warn('[terrain] reload cb failed', e) } }
}

/** Assign shared terrain uniforms to a compiled shader. */
export function assignTerrainUniforms(shader) {
  Object.assign(shader.uniforms, UNIFORMS)
}

// ── GLSL snippets ────────────────────────────────────────────────

/** Uniform declarations — inject after #include <common>. */
export const TERRAIN_DECL = `
uniform sampler2D uTerrainMap;
uniform float uBMinX, uBMinZ, uSpanX, uSpanZ, uExag;
uniform float uTexW, uTexH;
// Reconcile the GPU texture sample with the CPU sampler
// (terrainCommon.makeElevationSampler) so BOTH return the identical world-Y at
// the same XZ — one field, no float/sink between a CPU-placed object and the
// GPU-rendered ground. The CPU indexes the grid at u*(N-1); a raw texture2D
// samples at texel CENTERS (u*N-0.5), up to ±0.5 cell off, worst at the domain
// edges. Remap the normalized coord to land on the CPU grid index at the texel
// center: u_tex = (u*(N-1)+0.5)/N. (2026-06-29 — the "nothing sits on the
// ground" reconcile; buildings/foundations are baked off the CPU sampler and
// never sample this texture, so they are unaffected.)
vec2 _terrainUV(vec2 raw) {
  raw = clamp(raw, 0.0, 1.0);
  return vec2(
    (raw.x * (uTexW - 1.0) + 0.5) / uTexW,
    (raw.y * (uTexH - 1.0) + 0.5) / uTexH
  );
}`

/**
 * Vertex displacement — replaces #include <begin_vertex>.
 * Uses modelMatrix for world-space terrain sampling.
 * Good for materials with no other begin_vertex modifications.
 */
export const TERRAIN_DISPLACE = `
#include <begin_vertex>
{
  vec4 _tw = modelMatrix * vec4(transformed, 1.0);
  vec2 _tuv = _terrainUV(vec2(
    (_tw.x - uBMinX) / uSpanX,
    (_tw.z - uBMinZ) / uSpanZ
  ));
  transformed.y += texture2D(uTerrainMap, _tuv).r * uExag;
}`

/**
 * Centroid-based rigid displacement — replaces #include <begin_vertex>.
 * Samples terrain at a per-vertex `aCentroid.xz` attribute (world space)
 * instead of the vertex's own world position, so every vertex of a given
 * feature lifts by the same amount.  Use for path-family merged geometries
 * (alleys, footways, parking lots, stripes, edgelines, bikelanes) where each
 * feature needs to stay internally flat even when terrain ridges cross it.
 */
export const TERRAIN_DISPLACE_CENTROID = `
#include <begin_vertex>
{
  // aCentroidXZ is declared by the material as: attribute vec2 aCentroidXZ;
  // (x, z) in world space.
  vec2 _tuv = _terrainUV(vec2(
    (aCentroidXZ.x - uBMinX) / uSpanX,
    (aCentroidXZ.y - uBMinZ) / uSpanZ
  ));
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
  vec2 _tuv = _terrainUV(vec2(
    (modelMatrix[3].x - uBMinX) / uSpanX,
    (modelMatrix[3].z - uBMinZ) / uSpanZ
  ));
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
  vec2 _nuv = _terrainUV(vec2(
    (_nw.x - uBMinX) / uSpanX,
    (_nw.z - uBMinZ) / uSpanZ
  ));
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
  vec2 _tuv = _terrainUV(vec2(
    (_tw.x - uBMinX) / uSpanX,
    (_tw.z - uBMinZ) / uSpanZ
  ));
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
  vec2 _tuv = _terrainUV(vec2(
    (_iw.x - uBMinX) / uSpanX,
    (_iw.z - uBMinZ) / uSpanZ
  ));
  // Divide by the instance's Y-axis scale so the lift lands as
  // sample*uExag METERS in world space after instanceMatrix scaling
  // (otherwise a lamp with LAMP_SCALE=1.38 lifts about 38% too far,
  // and tree instances at authored scale amplify by their own factor).
  float _instYScale = length(instanceMatrix[1].xyz);
  transformed.y += texture2D(uTerrainMap, _tuv).r * uExag / max(_instYScale, 0.0001);
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

/**
 * INSTANCED rigid lift by a BAKED per-instance ground anchor — `groundSampler`'s
 * `groundRawAt`, the raw field where the DRAWN ground sits under the instance —
 * instead of a live texture sample. So the instance lands exactly on the
 * rendered ground (no coarse-mesh float); the buildings/foundations `aCentroidY`
 * regime generalized to point objects. The geometry must carry an `aGroundRaw`
 * InstancedBufferAttribute (raw, pre-uExag). Lift = aGroundRaw × uExag, divided
 * by the instance Y-scale so it lands as meters in world space (same as
 * patchTerrainInstanced). Replaces #include <begin_vertex>.
 */
export const TERRAIN_DISPLACE_INSTANCED_BAKED = `
#include <begin_vertex>
{
  float _instYScale = length(instanceMatrix[1].xyz);
  transformed.y += aGroundRaw * uExag / max(_instYScale, 0.0001);
}`

export function patchTerrainInstancedBaked(mat) {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uExag = terrainExag
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n attribute float aGroundRaw;\n uniform float uExag;')
      .replace('#include <begin_vertex>', TERRAIN_DISPLACE_INSTANCED_BAKED)
    if (prev) prev(shader)
  }
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => `terrain-inst-baked-${prevKey ? prevKey() : 'std'}`
}

/**
 * Patch a material to lift rigidly by a PRECOMPUTED raw heightmap value
 * (no texture sampling). Use when the lift anchor isn't the mesh origin —
 * e.g. building walls anchored at the mean of footprint-vertex elevations
 * (the bake-buildings.js canonical "centroidY"). Each material carries its
 * own `uCentroidRaw` uniform; the shared `uExag` does the exaggeration.
 *
 * @param {THREE.Material} mat
 * @param {number} centroidRaw — raw heightmap value (meters above local-min)
 *                                this material lifts by × uExag at render time.
 */
export function patchTerrainAtCentroidRaw(mat, centroidRaw) {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCentroidRaw = { value: centroidRaw }
    shader.uniforms.uExag = terrainExag
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uCentroidRaw;
         uniform float uExag;`
      )
      .replace(
        '#include <project_vertex>',
        `{
           transformed.y += uCentroidRaw * uExag;
         }
         #include <project_vertex>`
      )
    if (prev) prev(shader)
  }
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.customProgramCacheKey = () => `terrain-centroid-${prevKey ? prevKey() : 'std'}`
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
