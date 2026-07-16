import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import fs from 'fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const bake = JSON.parse(fs.readFileSync('public/baked/hipointe-demun/trees.json','utf8'))
const insts = (bake.tiles?.instancesByTile||[]).flatMap(t=>t.instances)
const counts = new Map()
for (const i of insts) { const k=(i.lods?.lod1)||i.url; counts.set(k,(counts.get(k)||0)+1) }
async function tris(p){
  const doc = await io.read(p.replace(/^\//,'').replace(/^trees\//,'public/trees/'))
  let bark=0, leaf=0
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()){
    const k=pr.getExtras()?.atlasKind, idx=pr.getIndices(), pos=pr.getAttribute('POSITION')
    const nt=idx?idx.getCount()/3:(pos?pos.getCount()/3:0)
    if(k==='bark')bark+=nt; else if(k==='leaf')leaf+=nt
  }
  return {bark,leaf,tot:bark+leaf}
}
const rows=[]
for (const [url,n] of counts) {
  try {
    const l1=await tris(url), l0=await tris(url.replace('lod1','lod0'))
    rows.push({url:url.replace('/trees/','').replace('-lod1.glb',''),n,l0:l0.tot,l1:l1.tot,
      cut:100*(1-l1.tot/l0.tot), leafPct:l1.tot?100*l1.leaf/l1.tot:0, l1bark:l1.bark, l1leaf:l1.leaf})
  } catch(e){ rows.push({url,n,err:e.message.slice(0,40)}) }
}
rows.sort((a,b)=>(a.l1||1e9)-(b.l1||1e9))
console.log('variant                              inst   lod0tris  lod1tris   cut%  lod1leaf%  <-- Hero renders lod1')
for(const r of rows){
  if(r.err){console.log(r.url,'ERR',r.err);continue}
  const flag = r.l1 < 8000 ? '  <<< STARVED' : ''
  console.log(`${r.url.padEnd(36)} ${String(r.n).padStart(4)}  ${String(r.l0).padStart(8)}  ${String(r.l1).padStart(8)}  ${r.cut.toFixed(0).padStart(4)}   ${r.leafPct.toFixed(0).padStart(5)}${flag}`)
}
