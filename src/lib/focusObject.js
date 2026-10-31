/**
 * focusObject — what depth of field focuses on: an OBJECT, by identity, never a free point (Jacob, 2026-10-07: a free
 * focus point "makes a weird arbitrary-seeming depth of field that doesn't always align with anything; making it locked
 * to an OBJECT is what we want").
 *
 * A focus is one id:
 *   'arch'          the Gateway Arch;
 *   a building id   a slab building (`bldg-NNNN` / `msbf-N`); a set-piece is named by the building it stands on.
 * ⭐ FOCUS LIVES ONLY ON THE KEYFRAMES (Jacob, 2026-10-28: "retire the 'Hero' Object from the survey and *just* add them
 * to the keyframes"). A hero keyframe may carry `focus`; one without inherits the previous key's, and a first key without
 * one has none: no focus object, the town's blur (there is no town-wide hero to default to). Between
 * two keys with different objects the focus RACKS over the segment, on the camera's own timing (MovieCamera publishes
 * the segment's two ids and its eased path parameter here; usePostFxDriver resolves them; dofDriver racks).
 *
 * ⭐ THE BOX IS DERIVED, EVERY FRAME, NEVER STORED: a building's from the slab index (footprint, its ground to its roof,
 * through the one lift — buildingLift.js); a set-piece's and the Arch's from their own drawn object, found by name
 * (`focus:<id>`). Nothing is kept at pick time, so nothing can go stale.
 * ⭐ IN THE HERO VIEW THE FOCUS IS ALWAYS AN OBJECT, NEVER THE AIM (Jacob, 2026-10-28; registry
 * r-stage-focuses-the-object-and-captures-the-screen): playing, paused, orbited or scrubbed — the movie's object at the
 * playhead (#focusChoice, the one decision). Street focuses where the camera points; Browse has no depth of field.
 * ⛔ An id that names nothing is said once, loudly, naming it, and that end of the focus has NO PLANE: it weighs 0, so
 * the town's blur takes it there and the frame racks toward it (Zob's ruling). A town whose keys name no object has no
 * focus plane at all: its blur is the TOWN's — sharp at the disc's centre, the Amount at the rim, anchored to the town
 * not the camera (Jacob, 2026-10-28; RomanceDoF.jsx#townLaw). Amount 0: sharp.
 */
import * as THREE from 'three'
import { buildingLiftY } from './buildingLift.js'

/** The movie's focus this frame, published by MovieCamera: the segment's two focus ids and how far along it is. */
export const movieFocus = { on: false, from: null, to: null, lam: 0 }

const _ids = new WeakMap()
/** Each keyframe's focus id, with inheritance: a key without `focus` takes the previous key's; a first without one is null. */
export function keyframeFocusIds(keyframes) {
  let ids = _ids.get(keyframes)
  if (ids) return ids
  ids = []
  let cur = null
  for (const k of keyframes) { if (typeof k?.focus === 'string' && k.focus) cur = k.focus; ids.push(cur) }
  _ids.set(keyframes, ids)
  return ids
}

const _said = new Set()
const sayOnce = (key, msg, error = true) => { if (_said.has(key)) return; _said.add(key); (error ? console.error : console.info)(msg) }

// A drawn object found by name, held while it stays in the scene (a scene walk per frame would cost the whole town).
const _nodes = new Map()
function namedNode(scene, name) {
  let o = _nodes.get(name)
  if (o) { let c = o; while (c.parent) c = c.parent; if (c === scene) return o; _nodes.delete(name) }
  o = scene.getObjectByName(name)
  if (o) _nodes.set(name, o)
  return o || null
}

// ⭐ WHAT DRAWS a focus object, for the hero ladder's coverage mask (HeroLadder.jsx): the meshes and the index range of
// each to draw — a set-piece's own meshes whole, a slab building's range of each slab geometry, found by the per-vertex
// aBuildingId (SlabBuildings.jsx) once per geometry and kept. Drawn with their OWN materials, so the mask sits exactly
// where the object is drawn (terrain lift included). ⛔ null when nothing can be drawn: never a box, never a guess.
const _slab = new WeakMap()   // scene → the slab's meshes (those carrying aBuildingId)
const _spans = new WeakMap()  // geometry → Map(building number → [index start, count] | null)
function slabMeshes(scene) {
  let list = _slab.get(scene)
  if (list && list.length && list.every(m => { let c = m; while (c.parent) c = c.parent; return c === scene })) return list
  list = []; scene.traverse(o => { if (o.isMesh && o.geometry?.attributes?.aBuildingId && o.geometry.index) list.push(o) })
  _slab.set(scene, list); return list
}
function buildingSpan(geom, num) {
  let m = _spans.get(geom); if (!m) { m = new Map(); _spans.set(geom, m) }
  if (m.has(num)) return m.get(num)
  const ids = geom.attributes.aBuildingId.array, idx = geom.index.array
  let v0 = -1, v1 = -1
  for (let v = 0; v < ids.length; v++) if (ids[v] === num) { if (v0 < 0) v0 = v; v1 = v }
  let span = null
  if (v0 >= 0) {
    let i0 = -1, i1 = -1, n = 0
    for (let i = 0; i < idx.length; i++) if (idx[i] >= v0 && idx[i] <= v1) { if (i0 < 0) i0 = i; i1 = i; n++ }
    // the slab appends each building's triangles in one run; a building whose run is broken is refused, not approximated
    if (i0 >= 0 && n === i1 - i0 + 1) span = [i0, n]
    else if (i0 >= 0) sayOnce(`span:${num}`, `[focus] ⛔ building #${num}'s triangles are not one run of its slab geometry — its coverage mask is not drawn`)
  }
  m.set(num, span); return span
}
export function focusMeshes(id, { scene, index }) {
  if (!scene) return null
  const node = namedNode(scene, `focus:${id}`)
  if (node) { const out = []; node.traverse(o => { if (o.isMesh) out.push({ mesh: o, start: 0, count: Infinity }) }); return out.length ? out : null }
  const num = index?.idToNum?.get(id)
  if (num == null) return null
  const out = []
  for (const mesh of slabMeshes(scene)) { const s = buildingSpan(mesh.geometry, num); if (s) out.push({ mesh, start: s[0], count: s[1] }) }
  return out.length ? out : null
}

/**
 * ⭐ WHAT DEPTH OF FIELD FOCUSES ON THIS FRAME — the one decision (Jacob, 2026-10-28). By the VIEW:
 *   'browse' → { off }: Browse has no depth of field.
 *   'hero'   → the focus OBJECTS: the movie's two ends at the playhead while MovieCamera publishes them; with none, no
 *              focus object. ⛔ Never the aim. `weight` is how much of a focus plane there is, 1 per end that resolves,
 *              lerped by `lam`: 0 = none, the town's law (RomanceDoF.jsx#townLaw).
 *   else     → { aim }: Street (and a view with no shot) focuses where the camera points.
 * `designLoaded` false (neither Stage's live design nor the baked scene in hand yet) is { off }: not yet, said nothing.
 * @param ctx { scene, index, exag } as for focusBox · @returns { off } | { aim } | { a, b, lam, weight, heroMeshes }
 */
export function focusChoice({ viewMode, movieFocus: mf, designLoaded, ctx }) {
  if (viewMode === 'browse') return { off: true }
  if (viewMode !== 'hero') return { aim: true }
  if (!designLoaded) return { off: true }
  const from = mf?.on ? mf.from : null, to = mf?.on ? mf.to : null, lam = mf?.on ? Math.min(1, Math.max(0, mf.lam || 0)) : 0
  const box = (id) => (id ? focusBox(id, ctx) : null)
  const a = box(from), b = to === from ? a : box(to), wa = a ? 1 : 0, wb = b ? 1 : 0
  const near = lam < 0.5 ? from : to
  return { a, b, lam, weight: wa + (wb - wa) * lam, heroMeshes: near ? focusMeshes(near, ctx) : null }
}

/** Does this town focus an OBJECT at all — a keyframe naming one? For the panel's words: with none, the blur is the
 *  town's and Window softness means the share of its radius that ramps (Boz's ruling (a)). */
export function hasFocusObject(keyframes) {
  return (keyframes || []).some(k => typeof k?.focus === 'string' && k.focus)
}

const _b = new THREE.Box3(), _p = new THREE.Vector3(), _q = new THREE.Vector3()
/**
 * The boxes `[x0, y0, z0, x1, y1, z1]` of the object a (resolved) focus id names, or null — said once:
 *   `extent` the object's OWN box: its focal distance and what stands in front of it are judged from this;
 *   `reach`  the extent and EVERYTHING HUNG ON IT (r-the-focus-object-is-everything-hung-on-it; Jacob, 2026-10-31): the
 *            hero mask is drawn and scissored to this. Anything under a focus node that draws outside the extent declares
 *            `userData.focusReach = { radiusM, fromM, toM }` on its root, a cylinder about its own vertical axis in its own
 *            frame (a display's strands). ⛔ Collected by walking the subtree on EVERY call, never cached: a plugin mounts
 *            lazily (Displays' Suspense), and a cache taken before it resolved would hold the extent alone (Zob, 2026-10-31).
 *            ▶ node checks/claims-the-focus-object-is-everything-hung-on-it.mjs
 * @param ctx { scene: the three scene, index: the slab building index (useSlabBuildingIndex), exag: the live terrain
 *            exaggeration (terrainShader#terrainExag) }
 */
export function focusBox(id, { scene, index, exag }) {
  const node = scene && namedNode(scene, `focus:${id}`)
  if (node) {
    node.updateWorldMatrix(true, false)
    const ext = node.userData?.extent
    if (ext) {   // a set-piece: its root sits at its base centre; its own extent (SetPiece.jsx's renderer contract)
      node.getWorldPosition(_p)
      const extent = [_p.x - ext.halfWidthM, _p.y, _p.z - ext.halfWidthM, _p.x + ext.halfWidthM, _p.y + ext.topM, _p.z + ext.halfWidthM], reach = [...extent]
      node.traverse(o => {
        const r = o.userData?.focusReach; if (!r) return
        o.getWorldPosition(_q)
        reach[0] = Math.min(reach[0], _q.x - r.radiusM); reach[1] = Math.min(reach[1], _q.y + r.fromM); reach[2] = Math.min(reach[2], _q.z - r.radiusM)
        reach[3] = Math.max(reach[3], _q.x + r.radiusM); reach[4] = Math.max(reach[4], _q.y + r.toM); reach[5] = Math.max(reach[5], _q.z + r.radiusM)
      })
      return { extent, reach }
    }
    if (node.geometry) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox()
      _b.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld)
      const extent = [_b.min.x, _b.min.y, _b.min.z, _b.max.x, _b.max.y, _b.max.z]
      return { extent, reach: extent }
    }
  }
  const e = index?.byId?.get(id)
  if (e?.footprint?.length) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (const [x, z] of e.footprint) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    // Local y 0 is the building's ground; ⛔ `baseY` is its TOP (the eave — bake-buildings.js), not its base. The top is
    // the higher of the eave and the roof's peak.
    const g = e.groundY ?? 0, c = e.centroidY ?? 0
    const top = Math.max(e.baseY ?? 0, e.roofTopY ?? 0)
    const extent = [x0, buildingLiftY(0, c, exag, 0, false, g), z0, x1, buildingLiftY(top, c, exag, 0, false, g), z1]
    return { extent, reach: extent }
  }
  if (index) sayOnce(`id:${id}`, `[focus] ⛔ "${id}" names no object in this town (no set-piece, no slab building) — that end of the focus has no plane: the town's blur takes it`)
  return null
}
