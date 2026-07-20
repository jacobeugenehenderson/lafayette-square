import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync } from 'fs'
const BAKED='public/baked/ksi-y-m-yn'
const manifest=JSON.parse(readFileSync(`${BAKED}/buildings.json`,'utf8'))
const bb=readFileSync(`${BAKED}/${manifest.bin}`)
const bin=bb.buffer.slice(bb.byteOffset,bb.byteOffset+bb.byteLength)
const fp=new Float32Array(bin,manifest.footprintByteOffset,manifest.footprintPointCount*2)
const bl=manifest.buildings.map(b=>{const[s,c]=b.footprintRange;let sx=0,sz=0
  for(let i=0;i<c;i++){sx+=fp[(s+i)*2];sz+=fp[(s+i)*2+1]}
  return {id:b.id,cx:sx/c,cz:sz/c}})
const g=readFileSync(`${BAKED}/citymodel/O53_buildings.glb`)
const ab=g.buffer.slice(g.byteOffset,g.byteOffset+g.byteLength)
const ids=JSON.parse(readFileSync(`${BAKED}/citymodel/O53_buildings.ids.json`,'utf8')).ids
new GLTFLoader().parse(ab,'',(gl)=>{
  gl.scene.updateMatrixWorld(true)
  const O={x:-350,z:346}
  const rows=[]; let n=0
  const byName={}
  gl.scene.traverse(o=>{
    if(!o.isMesh) return
    n++
    const gg=o.geometry.clone(); gg.applyMatrix4(o.matrixWorld); gg.computeBoundingBox()
    const b=gg.boundingBox
    const cx=(b.min.x+b.max.x)/2+O.x, cz=(b.min.z+b.max.z)/2+O.z
    const name=o.name||`mesh_${n-1}`
    byName[name]=(byName[name]||0)+1
    if(ids[name]) return
    let best=1e9,bid=null
    for(const p of bl){const d=Math.hypot(p.cx-cx,p.cz-cz); if(d<best){best=d;bid=p.id}}
    rows.push({name,cx:Math.round(cx),cz:Math.round(cz),near:Math.round(best),bid,
               fw:Math.round(b.max.x-b.min.x),fd:Math.round(b.max.z-b.min.z),h:+(b.max.y-b.min.y).toFixed(1)})
  })
  console.log(`  meshes: ${n}   duplicate names: ${Object.values(byName).filter(v=>v>1).length}`)
  rows.sort((a,b)=>a.near-b.near)
  const buckets={'<2m':0,'2-8m':0,'8-25m':0,'>25m':0}
  for(const r of rows) buckets[r.near<2?'<2m':r.near<8?'2-8m':r.near<25?'8-25m':'>25m']++
  console.log('  UNMATCHED, distance to nearest baked footprint centroid:')
  for(const[k,v]of Object.entries(buckets)) console.log(`     ${k.padEnd(6)} ${v}`)
  console.log('  smallest-footprint unmatched (are these tiny sheds?):')
  const bysize=[...rows].sort((a,b)=>a.fw*a.fd-b.fw*b.fd)
  for(const r of bysize.slice(0,6)) console.log(`     ${r.name.padEnd(20)} ${r.fw}x${r.fd}m h=${r.h}  nearest ${r.near}m`)
  const tiny=rows.filter(r=>r.fw*r.fd<25).length
  console.log(`  unmatched with footprint <25 m²: ${tiny} of ${rows.length}`)
},e=>console.log('ERR',e))
