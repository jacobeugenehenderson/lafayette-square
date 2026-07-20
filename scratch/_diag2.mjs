import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync } from 'fs'
const B='public/baked/ksi-y-m-yn'
const man=JSON.parse(readFileSync(`${B}/buildings.json`,'utf8'))
const bb=readFileSync(`${B}/${man.bin}`); const bin=bb.buffer.slice(bb.byteOffset,bb.byteOffset+bb.byteLength)
const fp=new Float32Array(bin,man.footprintByteOffset,man.footprintPointCount*2)
let X0=1e9,X1=-1e9,Z0=1e9,Z1=-1e9
for(let i=0;i<man.footprintPointCount;i++){const x=fp[i*2],z=fp[i*2+1]
  if(x<X0)X0=x; if(x>X1)X1=x; if(z<Z0)Z0=z; if(z>Z1)Z1=z}
console.log(`  our BAKED building set spans: x ${X0.toFixed(0)}..${X1.toFixed(0)}   z ${Z0.toFixed(0)}..${Z1.toFixed(0)}`)
const g=readFileSync(`${B}/citymodel/O53_buildings.glb`)
const ab=g.buffer.slice(g.byteOffset,g.byteOffset+g.byteLength)
const ids=JSON.parse(readFileSync(`${B}/citymodel/O53_buildings.ids.json`,'utf8')).ids
new GLTFLoader().parse(ab,'',(gl)=>{
  gl.scene.updateMatrixWorld(true)
  const O={x:-350,z:346}; let n=0
  let inside={t:0,m:0}, outside={t:0,m:0}
  gl.scene.traverse(o=>{
    if(!o.isMesh)return; n++
    const gg=o.geometry.clone(); gg.applyMatrix4(o.matrixWorld); gg.computeBoundingBox()
    const b=gg.boundingBox
    const cx=(b.min.x+b.max.x)/2+O.x, cz=(b.min.z+b.max.z)/2+O.z
    const name=o.name||`mesh_${n-1}`
    const within = cx>=X0&&cx<=X1&&cz>=Z0&&cz<=Z1
    const tgt = within?inside:outside
    tgt.t++; if(ids[name]) tgt.m++
  })
  console.log(`\n  LOD2 solids INSIDE our baked extent : ${inside.m}/${inside.t} matched  (${(100*inside.m/inside.t).toFixed(1)}%)`)
  console.log(`  LOD2 solids OUTSIDE our baked extent: ${outside.m}/${outside.t} matched  (${outside.t} solids the city has and our pour never covered)`)
},e=>console.log('ERR',e))
