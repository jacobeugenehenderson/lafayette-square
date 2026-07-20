import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync, existsSync } from 'fs'
const CM='public/baked/ksi-y-m-yn/citymodel'
const cm=JSON.parse(readFileSync(`${CM}/citymodel.json`,'utf8'))
const loader=new GLTFLoader()
console.log(`  ${'tile'.padEnd(6)}${'minY'.padStart(9)}${'maxY'.padStart(9)}   verdict`)
for(const t of cm.tiles){
  const p=`${CM}/${t.asset}`; if(!existsSync(p)) continue
  const f=readFileSync(p); const ab=f.buffer.slice(f.byteOffset,f.byteOffset+f.byteLength)
  await new Promise(res=>loader.parse(ab,'',(gl)=>{
    gl.scene.updateMatrixWorld(true)
    let mn=1e9,mx=-1e9
    gl.scene.traverse(o=>{
      if(!o.isMesh)return
      const g=o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.computeBoundingBox()
      mn=Math.min(mn,g.boundingBox.min.y); mx=Math.max(mx,g.boundingBox.max.y)
    })
    const oy=t.origin?.y||0
    const base=mn+oy
    const verdict = Math.abs(base)<1 ? 'ok — sits on y=0'
      : base < -1 ? `⛔ SUNK ${(-base).toFixed(0)}m BELOW ground`
      : `⚠️ floating ${base.toFixed(0)}m above ground`
    console.log(`  ${t.id.padEnd(6)}${mn.toFixed(1).padStart(9)}${mx.toFixed(1).padStart(9)}   ${verdict}`)
    res()
  },()=>res()))
}
