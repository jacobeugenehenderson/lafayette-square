import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync, writeFileSync } from 'fs'
const B='public/baked/ksi-y-m-yn'
const g=readFileSync(`${B}/citymodel/O53_buildings.glb`)
const ab=g.buffer.slice(g.byteOffset,g.byteOffset+g.byteLength)
const ids=JSON.parse(readFileSync(`${B}/citymodel/O53_buildings.ids.json`,'utf8')).ids
new GLTFLoader().parse(ab,'',(gl)=>{
  gl.scene.updateMatrixWorld(true)
  const O={x:-350,z:346}; let n=0; const out=[]
  gl.scene.traverse(o=>{
    if(!o.isMesh)return; n++
    const gg=o.geometry.clone(); gg.applyMatrix4(o.matrixWorld); gg.computeBoundingBox()
    const b=gg.boundingBox
    const name=o.name||`mesh_${n-1}`
    out.push({m:!!ids[name],
      x0:b.min.x+O.x,x1:b.max.x+O.x,z0:b.min.z+O.z,z1:b.max.z+O.z,
      h:+(b.max.y-b.min.y).toFixed(1)})
  })
  writeFileSync('/tmp/matchviz.json',JSON.stringify(out))
  const M=out.filter(o=>o.m), U=out.filter(o=>!o.m)
  const area=o=>(o.x1-o.x0)*(o.z1-o.z0)
  const med=a=>{const s=a.map(area).sort((x,y)=>x-y);return Math.round(s[Math.floor(s.length/2)])}
  const medh=a=>{const s=a.map(o=>o.h).sort((x,y)=>x-y);return s[Math.floor(s.length/2)]}
  console.log(`  matched  : ${M.length}  median footprint ${med(M)} m²  median height ${medh(M)} m`)
  console.log(`  unmatched: ${U.length}  median footprint ${med(U)} m²  median height ${medh(U)} m`)
},e=>console.log('ERR',e))
