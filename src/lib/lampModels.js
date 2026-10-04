/**
 * lampModels — the kit's library of lamp posts, keyed by id. A town's Look names one
 * (`design.json#lamps.model`, stamped into scene.json as `lampModel` by bake-scene);
 * absent ⇒ STANDARD_LAMP, and the runtime says so. ⛔ Never chosen by a town name.
 *
 * Every model declares what the lamp pipeline (StreetLights) reads from it:
 *   headY  — the lit head's height above its ground, m (glow · halo · bulb · wall light)
 *   load() — → Promise<{ geometry, txMap, material, nodeMatrix, scale }>, where `txMap` is the
 *            LIT-PART MASK (r = 1 glass, 0 iron) the Bulb knob drives. ⛔ A model without one
 *            does not glow, so load() throws rather than return it.
 *
 * The Victorian torchiere is Lafayette Square's authored choice; the standard post-top is the
 * kit's default (Jacob, 2026-10-04, BRIEF-lamps). The eventual authoring home is a "street
 * furniture salon" (recorded in the brief, not built).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { kitUrl } from './kitUrl.js'

export const STANDARD_LAMP = 'standard'

// ── Victorian torchiere (GLB) ───────────────────────────────────────────────────
const VICTORIAN_MODEL_HEIGHT = 2.65
const VICTORIAN_TARGET_HEIGHT = 3.66   // 12 ft real-world Victorian streetlamp

function loadVictorian() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(kitUrl('models/lamp-posts/victorian-lamp.glb'), (gltf) => {
      gltf.scene.updateMatrixWorld(true)
      let child = null
      gltf.scene.traverse(c => { if (c.isMesh && !child) child = c })
      if (!child) return reject(new Error('[lampModels] victorian-lamp.glb holds no mesh'))
      const mat = child.material
      // The transmission texture is the glass mask. Transmission itself is stripped (incompatible
      // with InstancedMesh); the mask becomes the emissive map the Bulb knob drives.
      const txMap = mat.transmissionMap
      if (!txMap) return reject(new Error('[lampModels] victorian-lamp.glb has no transmissionMap — no lit part, so no glow'))
      mat.transmission = 0
      mat.transmissionMap = null
      resolve({ geometry: child.geometry, txMap, material: mat, nodeMatrix: child.matrixWorld.clone(),
        scale: VICTORIAN_TARGET_HEIGHT / VICTORIAN_MODEL_HEIGHT })
    }, undefined, reject)
  })
}

// ── Standard post-top (procedural, low-poly) ────────────────────────────────────
// Base · pole · collar · lantern glass · cap, all 8-sided. The glass is the lit part: its UVs
// sample the mask's lit half. Head at 3.2–3.6 m, about the scale the pools were tuned for.
function lathe(parts) {
  const geos = parts.map(({ r0, r1, y0, y1, lit }) => {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 8, 1, false)
    g.translate(0, (y0 + y1) / 2, 0)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lit ? 0.75 : 0.25, 0.5)
    return g.toNonIndexed()
  })
  const n = geos.reduce((s, g) => s + g.attributes.position.count, 0)
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2)
  let o = 0
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uvs.set(g.attributes.uv.array, o * 2)
    o += g.attributes.position.count; g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  return out
}

function loadStandard() {
  const geometry = lathe([
    { r0: 0.13, r1: 0.11, y0: 0.00, y1: 0.45 },             // base
    { r0: 0.065, r1: 0.05, y0: 0.45, y1: 3.10 },            // pole
    { r0: 0.09, r1: 0.12, y0: 3.10, y1: 3.20 },             // collar
    { r0: 0.15, r1: 0.20, y0: 3.20, y1: 3.60, lit: true },  // lantern glass
    { r0: 0.24, r1: 0.02, y0: 3.60, y1: 3.78 },             // cap
  ])
  // Two-texel mask: left = iron, right = glass.
  const txMap = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat)
  txMap.minFilter = txMap.magFilter = THREE.NearestFilter
  txMap.needsUpdate = true
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: txMap, roughness: 0.55, metalness: 0.4 })
  return Promise.resolve({ geometry, txMap, material, nodeMatrix: new THREE.Matrix4(), scale: 1 })
}

export const LAMP_MODELS = Object.freeze({
  victorian: { headY: 3.3, load: loadVictorian },
  [STANDARD_LAMP]: { headY: 3.4, load: loadStandard },
})

/** The town's lamp model: its declared id, or the standard post when it declares none. Unknown id throws. */
export function lampModelOf(id, town) {
  if (id == null) {
    console.info(`[lampModels] "${town}" declares no lamp model (scene.json#lampModel) — drawing the kit's standard post.`)
    return { id: STANDARD_LAMP, ...LAMP_MODELS[STANDARD_LAMP] }
  }
  const m = LAMP_MODELS[id]
  if (!m) throw new Error(`[lampModels] "${town}" declares lamp model "${id}", which the library does not hold (${Object.keys(LAMP_MODELS).join(', ')})`)
  return { id, ...m }
}
