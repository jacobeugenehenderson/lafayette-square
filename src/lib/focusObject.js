/**
 * focusObject — what depth of field focuses on: an OBJECT, by identity, never a free point (Jacob, 2026-10-07: a free
 * focus point "makes a weird arbitrary-seeming depth of field that doesn't always align with anything; making it locked
 * to an OBJECT is what we want").
 *
 * A focus is one id:
 *   'hero'          the town's hero (its Survey `heroSubject`): the Arch, or a landmark building;
 *   'arch'          the Gateway Arch set-piece;
 *   a building id   a slab building (`bldg-NNNN` / `msbf-N`); a set-piece is named by the building it stands on.
 * A hero keyframe may carry `focus`; one without inherits the previous key's, and the first defaults to 'hero'. Between
 * two keys with different objects the focus RACKS over the segment, on the camera's own timing (MovieCamera publishes
 * the segment's two ids and its eased path parameter here; usePostFxDriver resolves them; dofDriver racks).
 *
 * ⭐ THE BOX IS DERIVED, EVERY FRAME, NEVER STORED: a building's from the slab index (footprint, its ground to its roof,
 * through the one lift — buildingLift.js); a set-piece's and the Arch's from their own drawn object, found by name
 * (`focus:<id>`). Nothing is kept at pick time, so nothing can go stale.
 * ⛔ An id that names nothing is said once, loudly, naming it, and that end of the focus is the camera's aim.
 * A hero that is not an object (the centroid, the landscape backdrop) is no focus object: the aim, said once.
 */
import * as THREE from 'three'
import { buildingLiftY } from './buildingLift.js'

/** The movie's focus this frame, published by MovieCamera: the segment's two focus ids and how far along it is. */
export const movieFocus = { on: false, from: null, to: null, lam: 0 }

const _ids = new WeakMap()
/** Each keyframe's focus id, with inheritance: a key without `focus` takes the previous key's; the first is 'hero'. */
export function keyframeFocusIds(keyframes) {
  let ids = _ids.get(keyframes)
  if (ids) return ids
  ids = []
  let cur = 'hero'
  for (const k of keyframes) { if (typeof k?.focus === 'string' && k.focus) cur = k.focus; ids.push(cur) }
  _ids.set(keyframes, ids)
  return ids
}

const _said = new Set()
const sayOnce = (key, msg, error = true) => { if (_said.has(key)) return; _said.add(key); (error ? console.error : console.info)(msg) }

/** 'hero' → the object the town's hero names, or null when the hero is not an object (or, `undefined`, not loaded yet).
 *  Any other id → itself. */
export function resolveFocusId(id, heroSubject) {
  if (id !== 'hero') return id
  if (heroSubject === undefined) return null   // the scene has not loaded yet: not yet, said nothing
  if (!heroSubject) { sayOnce('hero:none', '[focus] the town has no hero (Survey ▸ Hero) — depth of field focuses on the camera\'s aim', false); return null }
  if (heroSubject.kind === 'arch') return 'arch'
  if (heroSubject.kind === 'landmark' && heroSubject.id) return heroSubject.id
  sayOnce(`hero:${heroSubject.kind}`, `[focus] the town's hero is the ${heroSubject.kind}, not an object — depth of field focuses on the camera's aim`, false)
  return null
}

// A drawn object found by name, held while it stays in the scene (a scene walk per frame would cost the whole town).
const _nodes = new Map()
function namedNode(scene, name) {
  let o = _nodes.get(name)
  if (o) { let c = o; while (c.parent) c = c.parent; if (c === scene) return o; _nodes.delete(name) }
  o = scene.getObjectByName(name)
  if (o) _nodes.set(name, o)
  return o || null
}

const _b = new THREE.Box3(), _p = new THREE.Vector3()
/**
 * The world box `[x0, y0, z0, x1, y1, z1]` of the object a (resolved) focus id names, or null — said once.
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
      return [_p.x - ext.halfWidthM, _p.y, _p.z - ext.halfWidthM, _p.x + ext.halfWidthM, _p.y + ext.topM, _p.z + ext.halfWidthM]
    }
    if (node.geometry) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox()
      _b.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld)
      return [_b.min.x, _b.min.y, _b.min.z, _b.max.x, _b.max.y, _b.max.z]
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
    return [x0, buildingLiftY(0, c, exag, 0, false, g), z0, x1, buildingLiftY(top, c, exag, 0, false, g), z1]
  }
  if (index) sayOnce(`id:${id}`, `[focus] ⛔ "${id}" names no object in this town (no set-piece, no slab building) — depth of field focuses on the camera's aim`)
  return null
}
