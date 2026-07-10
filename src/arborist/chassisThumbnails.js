/**
 * chassisThumbnails — bake a flat-gray silhouette PNG for a chassis GLB using ONE
 * shared offscreen WebGL renderer, cached by url.
 *
 * WHY: the tagging gauntlet (Shelves surface) shows ALL 241 chassis at once.
 * ChassisPlate's per-plate `frameloop="demand"` Canvas is fine for the Salon's
 * top-N grid, but 241 live WebGL contexts blow the browser's ~16-context cap
 * (the "8 demand-canvases / render-once-to-image fallback" concern, arborist
 * BACKLOG). So we render each silhouette ONCE, to a data-URL <img>, off a single
 * hidden renderer — the robust render-once-to-image path. Loads + renders are
 * serialized (one GPU job at a time) and driven lazily by the plate's
 * IntersectionObserver, so only scrolled-into-view chassis ever bake.
 *
 * WHAT it renders — the WHOLE chassis, wood AND leaf geometry (2026-07-10, Jacob).
 * The gauntlet classifies CROWN SILHOUETTE (vase/oval/rounded/…), and the
 * silhouette is the OUTLINE of the leafed tree — a maple reads as a rounded gray
 * mass, a cedar as a cone. Stripping to bare wood (the Salon's "pure structure"
 * view) showed internal branching, not the crown outline, and rendered
 * inconsistently across the library (bare branches / blob / bare pole). So here
 * we keep every prim, gray + double-sided, and frame the full canopy. Wood-only
 * fragments (poplar trunk-splits, willow scaffolds) still read as bare structure
 * — honestly, because that's all they are.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE = 176               // thumbnail px (dpr baked in)
const CACHE = new Map()        // url -> dataURL
const INFLIGHT = new Map()     // url -> Promise<dataURL>

// One shared gray material. DoubleSide so single-sided leaf/needle cards fill the
// crown from any angle (else a leaves-on canopy renders half-missing).
const GRAY = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.85, metalness: 0, side: THREE.DoubleSide })

let _renderer, _scene, _camera, _loader
function ensure() {
  if (_renderer) return
  _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  _renderer.setPixelRatio(1.5)
  _renderer.setSize(SIZE, SIZE, false)
  _scene = new THREE.Scene()
  _camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  _camera.position.set(0, 0, 3.4)
  _scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(2, 4, 3)
  _scene.add(dir)
  _loader = new GLTFLoader()
}

// Dispose the geometries (materials are shared GRAY / vendor originals we drop).
function disposeRoot(root) {
  root.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.() })
}

async function renderOne(url) {
  ensure()
  let root
  try {
    const gltf = await _loader.loadAsync(url)
    root = gltf.scene
  } catch {
    return null
  }
  // Every prim gray — the whole chassis (wood + leaf), so the crown outline reads.
  root.traverse((o) => { if (o.isMesh) { o.material = GRAY; o.castShadow = false; o.receiveShadow = false } })
  // Fit into a ~1.85-unit frame, subject centered on all axes (ID thumbnail).
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3(); box.getSize(size)
  const center = new THREE.Vector3(); box.getCenter(center)
  const k = 1.85 / (Math.max(size.x, size.y, size.z) || 1)
  root.scale.setScalar(k)
  root.position.set(-center.x * k, -center.y * k, -center.z * k)
  _scene.add(root)
  _renderer.render(_scene, _camera)
  const dataURL = _renderer.domElement.toDataURL('image/png')
  _scene.remove(root)
  disposeRoot(root)
  CACHE.set(url, dataURL)
  return dataURL
}

// Serialize all GPU work — one load+render at a time (keeps memory + the single
// context calm even if 40 plates scroll into view at once).
let _queue = Promise.resolve()

export function chassisThumb(url) {
  if (CACHE.has(url)) return Promise.resolve(CACHE.get(url))
  if (INFLIGHT.has(url)) return INFLIGHT.get(url)
  const p = (_queue = _queue.then(() => renderOne(url)).catch(() => null))
  INFLIGHT.set(url, p)
  p.finally(() => INFLIGHT.delete(url))
  return p
}
