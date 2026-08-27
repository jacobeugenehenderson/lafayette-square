// Budget → cutoff curve for the hero band. Reads the slab + the baked lod1 GLBs.
// ▶ node scratch/hero-band-budget-curve.mjs
import fs from 'fs'
const SLAB='public/baked/lafayette-square'
const t=JSON.parse(fs.readFileSync(`${SLAB}/trees.json`,'utf8'))

function trisOfGlb(p){
  if(!fs.existsSync(p)) return null
  const b=fs.readFileSync(p)
  if(b.readUInt32LE(0)!==0x46546C67) return null
  const jsonLen=b.readUInt32LE(12)
  const json=JSON.parse(b.slice(20,20+jsonLen).toString('utf8'))
  let tris=0
  for(const m of json.meshes||[]) for(const pr of m.primitives||[])
    if(pr.indices!=null) tris+=Math.floor(json.accessors[pr.indices].count/3)
  return tris
}
const cache=new Map()
const trisFor=(i)=>{
  const u=i.lods?.lod1; if(!u) return null
  if(!cache.has(u)) cache.set(u, trisOfGlb(SLAB+u))
  return cache.get(u)
}
const inst=t.instances.slice().sort((a,b)=>a.panDist-b.panDist)
let spent=0, mesh=0, unmeasurable=0
const marks=[5e6,15e6,30e6,50e6,86e6,150e6,1e12]
let mi=0
const rows=[]
for(const i of inst){
  const tr=trisFor(i)
  if(tr==null){ unmeasurable++; continue }
  spent+=tr; mesh++
  while(mi<marks.length && spent>marks[mi]){
    rows.push({budget:marks[mi], mesh, cutoff:i.panDist}); mi++
  }
}
console.log('unmeasurable (no lod1 on disk):',unmeasurable,'of',inst.length)
console.log('total tris if ALL mesh:',(spent/1e6).toFixed(1)+'M','over',mesh,'measurable placements')
console.log()
console.log('budget'.padStart(8),'mesh'.padStart(6),'cutoff m'.padStart(9),'  impostors')
for(const r of rows) console.log(((r.budget/1e6).toFixed(0)+'M').padStart(8),String(r.mesh).padStart(6),r.cutoff.toFixed(0).padStart(9),'  '+(inst.length-r.mesh))
// what does "everything within X metres" cost?
console.log()
for(const D of [50,100,150,181,250,400]){
  let s=0,n=0
  for(const i of inst){ if(i.panDist>D) break; const tr=trisFor(i); if(tr==null) continue; s+=tr; n++ }
  console.log(`all mesh within ${String(D).padStart(3)}m → ${String(n).padStart(4)} placements, ${(s/1e6).toFixed(1)}M tris`)
}
