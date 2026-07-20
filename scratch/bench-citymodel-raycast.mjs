/**
 * R3F raycasts every mesh carrying a pointer handler on EVERY pointermove.
 * CityModel attaches onPointerMove/onClick to full-scene merged meshes with
 * frustumCulled={false} and no BVH — so each mouse move brute-forces the whole
 * tile set. Measure what that actually costs against the real geometry.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { readFileSync, existsSync } from 'fs'
const CM='public/baked/ksi-y-m-yn/citymodel'
const cm=JSON.parse(readFileSync(`${CM}/citymodel.json`,'utf8'))
const loader=new GLTFLoader()
const meshes=[]
for(const t of cm.tiles){
  const p=`${CM}/${t.asset}`; if(!existsSync(p))continue
  const f=readFileSync(p); const ab=f.buffer.slice(f.byteOffset,f.byteOffset+f.byteLength)
  await new Promise(res=>loader.parse(ab,'',(gl)=>{
    gl.scene.updateMatrixWorld(true); const gs=[]
    gl.scene.traverse(o=>{
      if(!o.isMesh||!o.geometry)return
      const g=o.geometry.clone(); g.applyMatrix4(o.matrixWorld)
      for(const k of Object.keys(g.attributes)) if(k!=='position'&&k!=='normal') g.deleteAttribute(k)
      gs.push(g.index?g.toNonIndexed():g)
    })
    const m=mergeGeometries(gs,false)
    if(m){ m.computeBoundingSphere()
      const mesh=new THREE.Mesh(m,new THREE.MeshBasicMaterial())
      mesh.position.set(t.origin.x,t.origin.y||0,t.origin.z)
      mesh.frustumCulled=false; mesh.updateMatrixWorld(true)
      meshes.push(mesh) }
    res()
  },()=>res()))
}
const tris=meshes.reduce((a,m)=>a+m.geometry.attributes.position.count/3,0)
console.log(`  meshes ${meshes.length}, ${Math.round(tris).toLocaleString()} triangles, frustumCulled=false, no BVH`)
const cam=new THREE.PerspectiveCamera(50,16/9,1,5000)
cam.position.set(-15,420,-14); cam.lookAt(-15,0,-15); cam.updateMatrixWorld(true)
const rc=new THREE.Raycaster()
const N=60, t0=performance.now()
for(let i=0;i<N;i++){
  rc.setFromCamera({x:(i%20)/10-1, y:(i%13)/6.5-1}, cam)
  rc.intersectObjects(meshes,false)
}
const per=(performance.now()-t0)/N
console.log(`  raycast cost: ${per.toFixed(1)} ms per pointer event`)
console.log(`  → at 60Hz pointermove that is ${(per*60).toFixed(0)} ms of CPU per second (${(per*60/10).toFixed(0)}% of one core)`)
console.log(per>16 ? '  ⛔ EXCEEDS a 16ms frame — dragging/gizmos will stutter or feel dead'
                   : per>4 ? '  ⚠️ significant, will be felt while dragging'
                   : '  ✓ negligible')
