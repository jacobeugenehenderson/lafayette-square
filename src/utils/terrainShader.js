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
 *   hero:        sceneExag()  — the town's AUTHORED ceiling (default 1)
 *   browse:      0            — flat map
 *   planetarium: 1            — life-size street level
 *
 * ⛔ The ceiling is PER TOWN and authored (`design.json#terrainExag` → the slab's
 * scene.json), resolved by `sceneExag()` below. It was a single `V_EXAG = 1.5`
 * constant sized against St. Louis and applied to every town — site 15, ruled
 * 2026-09-20. Raw values are normalized to local-min = 0 by bake-terrain.
 *
 * ⭐ ONE BILINEAR, CPU AND GPU (BRIEF-the-ground-stands-on-one-field, Boz 2026-10-21): every shader reads the field
 * through `_terrainRaw`, a MANUAL 4-tap bilinear on the same grid index as the CPU sampler
 * (terrainCommon.makeElevationSampler), from a NEAREST-filtered texture. ⛔ Never the hardware's linear filter: a Float32
 * texture filters linearly only with OES_texture_float_linear, and a phone without it steps per grid cell (or reads an
 * incomplete texture). Device-proof by construction, not by a check.
 */

import * as THREE from 'three'
import { slabFetch, slabManifest } from '../lib/slabUrl.js'

export { DEFAULT_V_EXAG } from '../lib/terrainCommon.js'
import { DEFAULT_V_EXAG, terrainIdentity, assertHeightfield, sceneExagOf } from '../lib/terrainCommon.js'
import { DRAWN_RAW_GLSL, pinsMissingUnder } from '../lib/drawnGround.js'
import { Refusal, httpFailure } from '../lib/refusal.js'

// ── Per-installation terrain, loaded by lookId ───────────────────
//
// Terrain is a SLAB artifact now, not a bundled global. It travels with the
// installation (cartograph/data/<scene>/clean/terrain.*, copied into
// public/baked/<look>/terrain.* by the bake) and is fetched by the active
// lookId — the same by-lookId contract as ground.bin. No installation is
// privileged: production LS fetches its own slab terrain (byte-identical to the
// old bundled bake); Preview / any ?look= fetches that look's; the authoring
// Stage re-points live via reloadTerrain() on a scene switch. A look with no
// terrain is flat only when its slab says so (fetchTerrain); a missing one refuses.
// (feedback_installations_are_independent; multi-instance routing 2026-07-02.)

// A 2×2 zero heightfield → getElevation()==0 everywhere, exag lifts nothing.
// `datum` declared: a flat town (or none loaded yet) is zeroed on nothing and has no water level to ask for (waterLevel.mjs#waterLevelsIfWet)
const FLAT_TERRAIN = { width: 2, height: 2, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, data: new Float32Array([0, 0, 0, 0]), datum: 'flat (no terrain)' }

// ⭐ NO TOWN AT MODULE LOAD (BRIEF-one-town-assembly, Warden 2026-09-28). This used to fetch the page's boot
// Look at import (resolveLookId → instance.js, which falls back to town #1), so an app drawing a town the kit
// did not boot stood on the wrong ground until something reloaded it. The terrain is now loaded by whoever
// knows the town: <Town town> (TownBridge.jsx → reloadTerrain), and <Town> draws nothing until it has
// arrived (terrainLook() === its Look). Until then the module holds FLAT, which nothing draws on.

// ── THE TOWN'S AUTHORED VERTICAL EXAGGERATION — the CEILING the hero shot lerps toward.
//
// ⛔ It is read from the LOOK'S OWN SLAB (`baked/<look>/scene.json#terrainExag`), never from a
// constant. It used to be `V_EXAG = 1.5` in terrainCommon — a number chosen by looking at
// St. Louis's 35 m of relief and then applied to altadena's 1,480 m (site 15).
// ⭐ Resolved HERE because this module already owns the per-look async fetch and already
// re-points on reloadTerrain(), so the ceiling rides the channel the terrain already travels.
// A React hook could not serve elevation.js, which is not a component.
// ⚠️ ABSENT ⇒ 1, the kit-neutral value: a town nobody has authored draws its ground at the
// height the ground actually is. ⛔ Absent must never mean "inherit the first town's drama".
async function fetchSceneExag(lookId) {
  try {
    const r = await slabFetch(lookId, 'scene.json')
    if (!r.ok) throw new Error(`scene.json ${r.status}`)
    return sceneExagOf(await r.json())   // terrainCommon.js: the one rule (a sentinel is not a value)
  } catch (e) {
    console.warn(`[terrain] no scene.json terrainExag for look "${lookId}" — using the kit default ${DEFAULT_V_EXAG}`, e?.message || e)
    return DEFAULT_V_EXAG
  }
}

// ⭐ A TOWN WITH NO TERRAIN IS A STATE THE SLAB NAMES, NEVER A MISS (Boz's ruling 2026-10-16). bake-ground records
// whether it draped a heightfield (`ground.json#groundShape.terrain`, F3), so a missing terrain.json is asked of THAT:
//   · terrain: false → flat by design (a town poured with no elevation input) — said once, as a state;
//   · terrain: true  → the terrain is MISSING from a slab baked on one — refused;
//   · no record      → an unknown state is not a flat one — refused.
// Any other failure (a network error, terrain.bin missing beside its terrain.json, a field that does not read) refuses, and
// so does a bed-only terrain under a ground with no pins (drawnGround.js#pinsMissingUnder).
// A refusal leaves the town on its splash: <Town> draws nothing until terrainLook() is its own Look.
// ▶ node checks/claims-a-missing-height-fails-loudly.mjs
async function fetchTerrain(lookId) {
  const r = await slabFetch(lookId, 'terrain.json')
  if (!r.ok) {
    const g = await slabFetch(lookId, 'ground.json')
    const said = g.ok ? (await g.json())?.groundShape?.terrain : undefined
    if (said === false) {
      console.log(`[terrain] look "${lookId}" has no terrain by intake (ground.json groundShape.terrain = false) — drawn flat`)
      return FLAT_TERRAIN
    }
    throw httpFailure(r, `[terrain] ⛔ look "${lookId}": terrain.json ${r.status}, and ${said === true ? 'its ground was baked ON a terrain (groundShape.terrain = true) — the terrain is missing from the slab'
      : g.ok ? 'its ground.json names no groundShape.terrain — an unknown state is not a flat one' : `its ground.json ${g.status} — no record of whether it has a terrain`}`)
  }
  const meta = await r.json()
  // ⛔ the one bad mix (drawnGround.js#pinsMissingUnder): a bed-only terrain under a ground with no pins is refused here, so
  // the town stays on its splash rather than draw its shore off ①'s line
  if (meta.stamp) { const g = await slabFetch(lookId, 'ground.json')
    if (!g.ok) throw httpFailure(g, `[terrain] ⛔ look "${lookId}": terrain.json carries a shore stamp and ground.json ${g.status} — whether the ground carries its pins is unknown`)
    const why = pinsMissingUnder(await g.json(), meta)
    if (why) throw new Refusal(`[terrain] ⛔ look "${lookId}": ${why}`) }
  const b = await slabFetch(lookId, 'terrain.bin')
  if (!b.ok) throw httpFailure(b, `[terrain] ⛔ look "${lookId}": terrain.json is there but terrain.bin ${b.status}`)
  const data = new Float32Array(await b.arrayBuffer())
  // The town's tide clock rides its manifest (bake-manifest `tide`, tidal towns only) — absent, never zero.
  const tide = meta.water?.tidal
    ? await slabManifest(lookId).then(m => m?.tide ?? null).catch(() => null)
    : null
  return { ...meta, data, tide }
}

// Live terrain state — reassigned by reloadTerrain(). Exported as `let` so late
// re-reads see fresh values; the heavy consumers (elevation.js CPU sampler)
// subscribe to onTerrainReload() to rebuild.
let _lookId = null
let _terrain = FLAT_TERRAIN
// The active town's authored ceiling. `let` + a getter, because reloadTerrain() re-points it
// and late readers (elevation.js's sampler rebuild) must see the fresh value, not a snapshot.
let _sceneExag = null
/** The ACTIVE look's authored vertical exaggeration (the hero ceiling). Re-points on reload. Throws before a town's terrain is loaded. */
export function sceneExag() {
  if (_sceneExag == null) throw new Refusal('[terrain] ⛔ no town\'s terrain is loaded yet — <Town> loads it (reloadTerrain) before it draws')
  return _sceneExag
}
/** The Look whose terrain is loaded, or null. <Town> draws once this is its own. */
export function terrainLook() { return _lookId }
/** The ACTIVE look's bed record (terrain.json `bed`: the profile and the visibility depth), or null. Re-points on reload. */
export function terrainBed() { return _terrain.bed || null }
/** The ACTIVE look's water levels record (terrain.json `water`: its low and high tide or lake level), or null. Re-points on reload. */
export function terrainWater() { return _terrain.water || null }
/** What the ACTIVE terrain is zeroed on: 'water' for a town with a coast (bake-terrain.js), 'local minimum' for an inland one,
 *  'flat (no terrain)' for none. ⛔ undefined for a terrain.json that declares none: waterLevelsIfWet refuses it by name. */
export function terrainDatum() { return _terrain.datum }
/** The ACTIVE look's tide clock (its manifest's `tide`: NOAA's constituents), or null for a town with none. Re-points on reload. */
export function terrainTide() { return _terrain.tide || null }
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
  // ⛔ NEAREST, deliberately: the shaders interpolate themselves (`_terrainRaw`), so no device needs float linear filtering
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

// ── Singleton terrain texture (identity stable across reloads) ────
export const terrainTexture = makeTerrainTexture(_terrain)

// ── Shared exaggeration uniform (mutate .value, all materials follow) ──

export const terrainExag = { value: 0 }
// window.__terrainExag — console handle on the shared exaggeration uniform.
// Same convention as window.__bldgXray / window.__treeAlphaTest. Setting
// .value = 0 flattens every patched material at once, which is the A/B for
// "does the terrain displacement disagree with the shadow map?" — the shadow
// pass uses three's own MeshDepthMaterial and carries NONE of these patches.
if (typeof window !== 'undefined') window.__terrainExag = terrainExag

// ── The town's floor: the lowest ground it can draw, RAW (the shader multiplies by uExag) ──
// A building's foundation riser runs from its floor down to HERE (Jacob, 2026-09-26), so no
// footprint corner can ever sit below the riser's foot, at any exaggeration. ⛔ Derived from
// the loaded heightfield, never a constant: min(0, the lowest sample) — 0 is the datum, and a
// water-datum town's land can dip below it (provincetown −1.14 m, huron −0.11 m).
function lowestGround(d) { let m = 0; for (let i = 0; i < d.length; i++) if (d[i] < m) m = d[i]; return m }
export const terrainFloorRaw = { value: lowestGround(_terrain.data) }
// ── The town's ceiling: the highest ground it can draw, RAW — max(0, the highest sample), the floor's twin. The overhead
// camera's near plane stands above it × the live exag (cameraRegimes.js#overheadNear, Town.jsx#TownOptics).
function highestGround(d) { let m = 0; for (let i = 0; i < d.length; i++) if (d[i] > m) m = d[i]; return m }
export const terrainCeilingRaw = { value: highestGround(_terrain.data) }
// The floor a foundation's below-grade ring is seated on: src/lib/buildingLift.js (the one definition of the lift).

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
  // ⭐ 1 = the ground is lit by its terrain (the product); 0 = the flat geometry normal.
  // An EYE-GATE A/B, not a look knob: nothing authors it, and it ships at 1.
  uTerrainNormals: { value: 1 },
}
// window.__terrainNormals — console / lab handle for that A/B (same convention as
// window.__terrainExag). ⛔ Never a production control: an operator who sees the
// relief flat is looking at the defect this uniform exists to compare against.
if (typeof window !== 'undefined') window.__terrainNormals = UNIFORMS.uTerrainNormals

// ── Live re-point (authoring Stage: switch installation without reload) ──
const _reloadCbs = new Set()
/** Subscribe to terrain reloads (CPU-sampler consumers rebuild here). Returns an unsubscribe. */
export function onTerrainReload(cb) { _reloadCbs.add(cb); return () => _reloadCbs.delete(cb) }
/** The current heightfield payload — read fresh after a reload. */
export function currentTerrain() { return { width, height, bounds, data } }
let _idFor = null, _id = null
/** The loaded heightfield's identity (terrainCommon.terrainIdentity), computed once per load. */
export function currentTerrainIdentity() {
  if (_idFor !== data) { _idFor = data; _id = data === FLAT_TERRAIN.data ? 'none' : terrainIdentity({ width, height, bounds, data }) }
  return _id
}

/**
 * Re-point the terrain singleton at another look's baked heightfield, in place.
 * Skips when already on `lookId` unless `force` (a re-bake of the same look may
 * have changed the bytes — e.g. a look's first bake filling in previously-404
 * terrain).
 */
export async function reloadTerrain(lookId, { force = false } = {}) {
  if (!lookId || (lookId === _lookId && !force)) return
  const t = await fetchTerrain(lookId)
  // ⛔ Refused HERE, before anything is swapped: the sampler rebuild below runs in a reload callback whose errors are
  // caught and warned, so a field refused only there would leave the last town's heights under this town's name.
  assertHeightfield(t, `look "${lookId}" terrain.json/terrain.bin`)
  // ⛔ BEFORE the callbacks: elevation.js rebuilds its CPU sampler in one of them and bakes the
  // exag into the closure, so a stale ceiling here would be captured for the whole session.
  _sceneExag = await fetchSceneExag(lookId)
  _lookId = lookId
  // ⛔ The RECORD too, not just the heights: terrainBed() and terrainWater() read it. It used to stay the page's boot
  // terrain, so after a Stage re-bake (or a town switch) the water kept the old visibility depth and levels until a
  // full reload — provincetown's margin read opaque at the old 2.44 m after secchi went to 3.95 (2026-09-27).
  _terrain = t
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
  terrainFloorRaw.value = lowestGround(data)
  terrainCeilingRaw.value = highestGround(data)
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
uniform float uTerrainNormals;
// THE FIELD'S RAW HEIGHT at a normalized domain coord (0..1 across the bounds) — the CPU sampler's own arithmetic
// (terrainCommon.makeElevationSampler: grid index u*(N-1), the cell's four corners, fractions clamped), as four
// NEAREST texel-centre fetches, so CPU and GPU return the identical height at the same XZ on any device. Scalar on
// purpose: claims-ground-normals-come-from-the-terrain transpiles it and runs it against the CPU sampler.
float _terrainRaw(vec2 raw) {
  float gx = raw.x * (uTexW - 1.0), gz = raw.y * (uTexH - 1.0);
  float ix = clamp(floor(gx), 0.0, uTexW - 2.0), iz = clamp(floor(gz), 0.0, uTexH - 2.0);
  float fx = clamp(gx - ix, 0.0, 1.0), fz = clamp(gz - iz, 0.0, 1.0);
  float u0 = (ix + 0.5) / uTexW, u1 = (ix + 1.5) / uTexW, v0 = (iz + 0.5) / uTexH, v1 = (iz + 1.5) / uTexH;
  float e00 = texture2D(uTerrainMap, vec2(u0, v0)).r, e10 = texture2D(uTerrainMap, vec2(u1, v0)).r;
  float e01 = texture2D(uTerrainMap, vec2(u0, v1)).r, e11 = texture2D(uTerrainMap, vec2(u1, v1)).r;
  return mix(mix(e00, e10, fx), mix(e01, e11, fx), fz);
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
  vec2 _tuv = vec2(
    (_tw.x - uBMinX) / uSpanX,
    (_tw.z - uBMinZ) / uSpanZ
  );
  transformed.y += _terrainRaw(_tuv) * uExag;
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
  vec2 _tuv = vec2(
    (aCentroidXZ.x - uBMinX) / uSpanX,
    (aCentroidXZ.y - uBMinZ) / uSpanZ
  );
  transformed.y += _terrainRaw(_tuv) * uExag;
}`

/**
 * Rigid displacement — replaces #include <project_vertex>.
 * Samples terrain at the MESH ORIGIN (modelMatrix[3]), not per-vertex.
 * Every vertex gets the same Y offset → building moves as a solid body.
 * No tilted roofs, no warped walls.
 */
const TERRAIN_DISPLACE_RIGID = `
{
  vec2 _tuv = vec2(
    (modelMatrix[3].x - uBMinX) / uSpanX,
    (modelMatrix[3].z - uBMinZ) / uSpanZ
  );
  transformed.y += _terrainRaw(_tuv) * uExag;
}
#include <project_vertex>`

/**
 * Terrain-derived normal — replaces #include <beginnormal_vertex>.
 * For GROUND surfaces only (every BakedGround group but water, the park gravel).
 * Do NOT use for buildings/trees/lamps/fences — their normals are geometry-based.
 *
 * ⭐⭐ WHY IT EXISTS (Jacob, 2026-09-24: "yes everywhere"). The baked ground is FLAT
 * (Y = 0) and lifted in the vertex shader, so its geometry normals all point UP: every
 * hill in every town was displaced and then LIT AS IF FLAT. Nothing called this until
 * then (Boz checked: no caller passed terrainNormals).
 *
 * ⛔ THE SAMPLE STEP IS ONE GRID STEP OF THIS TOWN'S HEIGHTFIELD, read from the
 * terrain's own span and sample count. It used to be `_eps = 5.0` metres — right only
 * because bake-terrain happens to write a 5 m grid today (Layer 0 Class D: a constant
 * whose unit is only stable because something ELSE is fixed). A finer lidar grid would
 * have been smoothed over, a coarser one sampled inside a single cell.
 * ▶ node checks/claims-ground-normals-come-from-the-terrain.mjs --mutants
 *
 * ⭐ COMPOSED, NOT REPLACED (BRIEF-the-ground-stands-on-one-field, Boz 2026-10-21). The drawn surface is the mesh moved
 * by y += h(x, z), h = field × uExag, so its normal is the mesh's own normal carried through that map — the inverse
 * transpose of its Jacobian: n' = (n.x − h_x·n.y, n.y, n.z − h_z·n.y). Exact for every face, with no division and no
 * guard: a flat face gets (−h_x, 1, −h_z), the kerb's slopes and ramps keep their own tilt on top of the hill, and a
 * vertical riser (n.y = 0) keeps its own normal. At uExag = 0 the gradient is 0 and the geometry normal stands.
 *
 * ⛔ A town with no terrain BY INTAKE (ground.json groundShape.terrain = false) gets a flat field from
 * `fetchTerrain`, so the gradient is 0 because nothing is there — a named state, never a default.
 */
export const TERRAIN_NORMAL = `
#include <beginnormal_vertex>
{
  vec4 _nw = modelMatrix * vec4(position, 1.0);
  float _sx = uSpanX / (uTexW - 1.0);
  float _sz = uSpanZ / (uTexH - 1.0);
  float _eL = _terrainRaw(vec2((_nw.x - _sx - uBMinX) / uSpanX, (_nw.z - uBMinZ) / uSpanZ)) * uExag;
  float _eR = _terrainRaw(vec2((_nw.x + _sx - uBMinX) / uSpanX, (_nw.z - uBMinZ) / uSpanZ)) * uExag;
  float _eD = _terrainRaw(vec2((_nw.x - uBMinX) / uSpanX, (_nw.z - _sz - uBMinZ) / uSpanZ)) * uExag;
  float _eU = _terrainRaw(vec2((_nw.x - uBMinX) / uSpanX, (_nw.z + _sz - uBMinZ) / uSpanZ)) * uExag;
  vec2 _h = vec2((_eR - _eL) / (2.0 * _sx), (_eU - _eD) / (2.0 * _sz));
  vec3 _tn = normalize(vec3(objectNormal.x - _h.x * objectNormal.y, objectNormal.y, objectNormal.z - _h.y * objectNormal.y));
  objectNormal = normalize(mix(objectNormal, _tn, uTerrainNormals));
}`

/**
 * Per-vertex displacement — replaces #include <project_vertex>.
 * Samples terrain at each vertex's WORLD position (via modelMatrix).
 * Use for merged geometry (foundations) where modelMatrix[3] is origin.
 */
const TERRAIN_DISPLACE_PERVERTEX = `
{
  vec4 _tw = modelMatrix * vec4(transformed, 1.0);
  vec2 _tuv = vec2(
    (_tw.x - uBMinX) / uSpanX,
    (_tw.z - uBMinZ) / uSpanZ
  );
  transformed.y += _terrainRaw(_tuv) * uExag;
}
#include <project_vertex>`

// ⭐ THE DRAWN GROUND'S VARIANT (Jacob, 2026-10-27: "yes pin the coast"): a ground group that carries pins (`aDrawnRaw`,
// drawnGround.js#drawnPinsOf) lifts each vertex by its own raw where it has one, else the field, and lights it by its own
// slope there. Made FROM the two snippets above, never a copy of them: each edit names the text it replaces and throws
// if that text is gone. ▶ node checks/claims-the-drawn-raw-is-one-function.mjs
const drawnFrom = (snippet, from, to, name) => {
  if (!snippet.includes(from)) throw new Refusal(`[terrainShader] ⛔ ${name} no longer contains \`${from}\` — the drawn variant cannot be made from it`)
  return snippet.replace(from, to)
}
export const TERRAIN_DISPLACE_PERVERTEX_DRAWN = drawnFrom(TERRAIN_DISPLACE_PERVERTEX,
  'transformed.y += _terrainRaw(_tuv) * uExag;', 'transformed.y += _drawnRaw(aDrawnRaw, _terrainRaw(_tuv)) * uExag;', 'TERRAIN_DISPLACE_PERVERTEX')
export const TERRAIN_NORMAL_DRAWN = drawnFrom(TERRAIN_NORMAL,
  '  vec3 _tn =', '  _h = _drawnSlope(aDrawnRaw, _h, uExag);\n  vec3 _tn =', 'TERRAIN_NORMAL')

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
 * @param {boolean} [opts.drawn=false] — a ground group with pins (`aDrawnRaw`): its own raw where it has one (per vertex only)
 */
/**
 * INSTANCED rigid lift by a BAKED per-instance ground anchor — `groundSampler`'s
 * `groundAt`, where the DRAWN ground sits under the instance —
 * instead of a live texture sample. So the instance lands exactly on the
 * rendered ground (no coarse-mesh float); the buildings/foundations `aCentroid`
 * regime generalized to point objects. The geometry must carry an `aGround`
 * InstancedBufferAttribute, itemSize 2: (raw, pre-uExag · the drawn mesh's own y, UNexaggerated — a raised kerb's
 * block, `kerbLift.mjs`). Lift L = aGround.x × uExag + aGround.y metres, straight UP in world space. One slot, not
 * two: the tree shaders sit at the attribute budget (`treeAtlasMaterial.js`, VALIDATE_STATUS). Pack it with
 * `elevation.js#groundPairs`. Replaces #include <begin_vertex>.
 * ⭐ WORLD-UP FOR ANY ROTATION (Argon, 2026-10-07): the lift is added in the instance's own frame BEFORE instanceMatrix
 * applies, so it is inverse(basis)·(0, L, 0) — column i of the basis contributes colᵢ.y / |colᵢ|². It was L / |col₁|
 * along local Y, which is world-up only for an instance turned about Y: the revetment's tumbled boulders would have been
 * lifted sideways. For every lamp and tree (Y rotation × uniform scale) the two are identical to float32 — 127,734
 * matrices on huron, provincetown and LS, max 1.8e-7 of the lift (▶ `node scratch/shore-jag/lift-proof.mjs`).
 * ⛔ Assumes the basis is ROTATION × SCALE (Matrix4.compose's T·R·S, or that times a node matrix of the same form):
 * a non-uniform scale multiplied in AFTER a rotation shears the columns and the lift goes silently wrong.
 */
export const TERRAIN_DISPLACE_INSTANCED_BAKED = `
#include <begin_vertex>
#ifdef USE_INSTANCING
{
  float _L = aGround.x * uExag + aGround.y;
  mat3 _ib = mat3(instanceMatrix);
  transformed += _L * vec3(_ib[0].y / max(dot(_ib[0], _ib[0]), 1e-8),
                           _ib[1].y / max(dot(_ib[1], _ib[1]), 1e-8),
                           _ib[2].y / max(dot(_ib[2], _ib[2]), 1e-8));
}
#endif`

export function patchTerrainInstancedBaked(mat) {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uExag = terrainExag
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n attribute vec2 aGround;\n uniform float uExag;')
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

export function patchTerrain(mat, { terrainNormals = false, perVertex = false, drawn = false } = {}) {
  if (drawn && !perVertex) throw new Refusal('[terrainShader] ⛔ patchTerrain: a drawn ground (pins) is lifted per vertex — a rigid lift has no vertex to pin')
  const displaceSnippet = drawn ? TERRAIN_DISPLACE_PERVERTEX_DRAWN : perVertex ? TERRAIN_DISPLACE_PERVERTEX : TERRAIN_DISPLACE_RIGID
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader) => {
    assignTerrainUniforms(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_DECL + (drawn ? DRAWN_RAW_GLSL : ''))
      .replace('#include <project_vertex>', displaceSnippet)
    if (prev) prev(shader)
    // ⛔ AFTER prev, deliberately. `applyWeatherToShader` (called inside prev) appends
    // its world-normal varying right after `#include <beginnormal_vertex>`; replacing
    // the include NOW puts the terrain override BETWEEN the include and that varying,
    // so snow and wet read the SLOPE. Done before prev, the varying captured the flat
    // geometry normal and the terrain override landed after it.
    if (terrainNormals) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', drawn ? TERRAIN_NORMAL_DRAWN : TERRAIN_NORMAL)
    }
  }
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  const mode = drawn ? 'd' : perVertex ? 'v' : 'r'
  mat.customProgramCacheKey = () =>
    `terrain-${mode}${terrainNormals ? 'n' : 'p'}-${prevKey ? prevKey() : 'std'}`
}
