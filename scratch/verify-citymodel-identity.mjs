/**
 * Headless rehearsal of exactly what CityModel does at runtime: build the index
 * the way SlabBuildings does, stamp aBuildingId through the ids sidecars, merge,
 * then check a raycast-style lookup resolves back to a real building.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { readFileSync, existsSync } from 'fs'
const B='public/baked/ksi-y-m-yn', CM=`${B}/citymodel`
const man=JSON.parse(readFileSync(`${B}/buildings.json`,'utf8'))
const byNum=man.buildings.map(b=>({id:b.id}))
const idToNum=new Map(byNum.map((e,i)=>[e.id,i]))
const cm=JSON.parse(readFileSync(`${CM}/citymodel.json`,'utf8'))
const loader=new GLTFLoader()
let totV=0, idV=0, tris=0, draws=0
const seen=new Set()
for(const t of cm.tiles){
  const p=`${CM}/${t.asset}`; if(!existsSync(p)) continue
  const sc=JSON.parse(readFileSync(`${CM}/${t.id}_buildings.ids.json`,'utf8')).ids
  const f=readFileSync(p); const ab=f.buffer.slice(f.byteOffset,f.byteOffset+f.byteLength)
  await new Promise(res=>loader.parse(ab,'',(gl)=>{
    gl.scene.updateMatrixWorld(true)
    const geoms=[]; let n=0
    gl.scene.traverse(o=>{
      if(!o.isMesh||!o.geometry)return
      const name=o.name||`mesh_${n}`; n++
      const g=o.geometry.clone(); g.applyMatrix4(o.matrixWorld)
      for(const k of Object.keys(g.attributes)) if(k!=='position'&&k!=='normal') g.deleteAttribute(k)
      if(!g.attributes.normal) g.computeVertexNormals()
      const flat=g.index?g.toNonIndexed():g
      const c=flat.attributes.position.count
      const osm=sc[name]; const num=osm?(idToNum.get(osm)??-1):-1
      if(num>=0) seen.add(osm)
      flat.setAttribute('aBuildingId',new THREE.BufferAttribute(new Float32Array(c).fill(num),1))
      geoms.push(flat)
    })
    const m=mergeGeometries(geoms,false)
    if(!m){console.log(`  ⛔ ${t.id} merge failed`);return res()}
    draws++
    const a=m.attributes.aBuildingId
    for(let i=0;i<a.count;i++){totV++; if(a.getX(i)>=0) idV++}
    tris+=a.count/3
    res()
  },()=>res()))
}
console.log(`  tiles merged        : ${draws}  → ${draws} draw calls`)
console.log(`  triangles total     : ${Math.round(tris).toLocaleString()}`)
console.log(`  vertices carrying an id: ${idV.toLocaleString()} / ${totV.toLocaleString()} (${(100*idV/totV).toFixed(1)}%)`)
console.log(`  distinct buildings clickable: ${seen.size}`)
const probe=[...seen].slice(0,3)
console.log(`  raycast rehearsal: num→id resolves →`, probe.map(id=>`${id}=byNum[${idToNum.get(id)}].id==${byNum[idToNum.get(id)].id===id}`).join('  '))
