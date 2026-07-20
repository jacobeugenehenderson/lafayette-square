import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { readFileSync } from 'fs'

const ROOF_NORMAL_Y = 0.5
const buf = readFileSync('public/baked/ksi-y-m-yn/citymodel/O53_buildings.glb')
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

const loader = new GLTFLoader()
loader.parse(ab, '', (gltf) => {
  // ── exactly the component's flattenToOneGeometry ──
  const geoms = []
  gltf.scene.updateMatrixWorld(true)
  let meshCount = 0
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    meshCount++
    const g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld)
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    geoms.push(g.index ? g.toNonIndexed() : g)
  })
  console.log(`  meshes traversed : ${meshCount}`)
  const merged = mergeGeometries(geoms, false)
  if (!merged) { console.log('  ⛔ MERGE RETURNED NULL — attribute mismatch'); process.exit(1) }

  const nrm = merged.attributes.normal
  const count = nrm.count
  const col = new Float32Array(count)
  let roof = 0
  for (let i = 0; i < count; i++) { const r = nrm.getY(i) > ROOF_NORMAL_Y ? 1 : 0; col[i] = r; roof += r }
  merged.setAttribute('aRoof', new THREE.BufferAttribute(col, 1))
  merged.computeBoundingBox()

  const bb = merged.boundingBox
  console.log(`  merged vertices  : ${count.toLocaleString()}  (${(count/3).toLocaleString()} triangles)`)
  console.log(`  draw calls       : 1  (was ${meshCount})`)
  console.log(`  roof verts       : ${roof.toLocaleString()} (${(100*roof/count).toFixed(1)}%)  wall: ${(count-roof).toLocaleString()}`)
  console.log(`  bbox min         : ${['x','y','z'].map(k=>bb.min[k].toFixed(1)).join(', ')}`)
  console.log(`  bbox max         : ${['x','y','z'].map(k=>bb.max[k].toFixed(1)).join(', ')}`)
  const O = { x: -350, y: 0, z: 346 }
  console.log(`  placed spans     : x ${(bb.min.x+O.x).toFixed(0)}..${(bb.max.x+O.x).toFixed(0)}   z ${(bb.min.z+O.z).toFixed(0)}..${(bb.max.z+O.z).toFixed(0)}   y ${bb.min.y.toFixed(1)}..${bb.max.y.toFixed(1)}`)
  const ok = bb.min.y > -1 && bb.max.y < 80 && roof > 0 && roof < count
  console.log(ok ? '  ✅ geometry sane: sits on y=0, plausible heights, roof/wall split present'
                 : '  ⛔ geometry looks wrong')
}, (err) => { console.log('  ⛔ GLB PARSE FAILED:', err?.message || err); process.exit(1) })
