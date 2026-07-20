import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync, existsSync } from 'fs'
const B='public/baked/ksi-y-m-yn', CM=`${B}/citymodel`
const man=JSON.parse(readFileSync(`${B}/buildings.json`,'utf8'))
const bb=readFileSync(`${B}/${man.bin}`); const bin=bb.buffer.slice(bb.byteOffset,bb.byteOffset+bb.byteLength)
const fp=new Float32Array(bin,man.footprintByteOffset,man.footprintPointCount*2)
const boxes=man.buildings.map(b=>{const[s,c]=b.footprintRange
  let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9
  for(let i=0;i<c;i++){const x=fp[(s+i)*2],z=fp[(s+i)*2+1]
    if(x<x0)x0=x;if(x>x1)x1=x;if(z<z0)z0=z;if(z>z1)z1=z}
  return{id:b.id,x0,z0,x1,z1}})
let X0=1e9,X1=-1e9,Z0=1e9,Z1=-1e9
for(const q of boxes){X0=Math.min(X0,q.x0);X1=Math.max(X1,q.x1);Z0=Math.min(Z0,q.z0);Z1=Math.max(Z1,q.z1)}
const cm=JSON.parse(readFileSync(`${CM}/citymodel.json`,'utf8'))
const loader=new GLTFLoader()
let inT=0,inM=0,outT=0,miss=0
const carried=new Set()
for(const t of cm.tiles){
  const p=`${CM}/${t.asset}`; if(!existsSync(p))continue
  const ids=JSON.parse(readFileSync(`${CM}/${t.id}_buildings.ids.json`,'utf8')).ids
  const f=readFileSync(p); const ab=f.buffer.slice(f.byteOffset,f.byteOffset+f.byteLength)
  await new Promise(res=>loader.parse(ab,'',(gl)=>{
    gl.scene.updateMatrixWorld(true); const O=t.origin; let n=0
    gl.scene.traverse(o=>{
      if(!o.isMesh)return; n++
      const g=o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.computeBoundingBox()
      const b=g.boundingBox
      const x0=b.min.x+O.x,x1=b.max.x+O.x,z0=b.min.z+O.z,z1=b.max.z+O.z
      const cx=(x0+x1)/2, cz=(z0+z1)/2
      const name=o.name||`mesh_${n-1}`
      const id=ids[name]
      if(id) carried.add(id)
      const within=cx>=X0&&cx<=X1&&cz>=Z0&&cz<=Z1
      if(!within){outT++;return}
      inT++; if(id){inM++;return}
      const a=(x1-x0)*(z1-z0); let best=0
      for(const q of boxes){const ix=Math.min(x1,q.x1)-Math.max(x0,q.x0),iz=Math.min(z1,q.z1)-Math.max(z0,q.z0)
        if(ix>0&&iz>0)best=Math.max(best,(ix*iz)/a)}
      if(best>0.5)miss++
    })
    res()
  },()=>res()))
}
console.log(`  solids INSIDE our baked extent : ${inM}/${inT} matched (${(100*inM/inT).toFixed(1)}%)`)
console.log(`  solids OUTSIDE (tile overhang) : ${outT}  — correctly unmatched, our pour never covered them`)
console.log(`  GENUINE MISSES (>50% overlap)  : ${miss}`)
console.log(`  distinct osm buildings carrying LOD2 geometry: ${carried.size} of ${man.buildings.length}`)
for(const t of ['osm-155224392','osm-186401319','osm-103564102','osm-138948733','osm-206133483'])
  console.log(`     ${t.padEnd(18)} ${carried.has(t)?'✓':'✗'}`)
