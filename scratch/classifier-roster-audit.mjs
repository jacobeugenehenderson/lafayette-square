import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { buildMeshAncestorNames, classifyPrim } from '../arborist/atlas-kind-classifier.js'
import fs from 'fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const bake = JSON.parse(fs.readFileSync('public/baked/hipointe-demun/trees.json','utf8'))
const insts = (bake.tiles?.instancesByTile||[]).flatMap(t=>t.instances)
const n = new Map()
for (const i of insts) { const k=(i.lods?.lod0)||i.url; n.set(k,(n.get(k)||0)+1) }
const rows=[]
for (const [url,count] of n) {
  const p = url.replace(/^\//,'').replace(/^trees\//,'public/trees/').replace(/-lod[12]\.glb$/,'-lod0.glb')
  try {
    const doc = await io.read(p)
    const anc = buildMeshAncestorNames(doc)
    let woodT=0, leafT=0, ambT=0, ambDetail=[]
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const c = classifyPrim(prim, anc.get(mesh)||[])
        const t = c.tcount||0
        if (c.cls==='LEAF') leafT+=t
        else if (c.cls==='WOOD') woodT+=t
        else { ambT+=t; ambDetail.push(`${c.matName}:${t}t`) }
      }
    }
    const tot=woodT+leafT+ambT
    rows.push({v:p.replace('public/trees/','').replace('-lod0.glb',''),count,woodT,leafT,ambT,tot,
      leafPct: tot? 100*leafT/tot : 0, ambPct: tot? 100*ambT/tot : 0, ambDetail})
  } catch(e){}
}
rows.sort((a,b)=>a.leafPct-b.leafPct)
console.log('variant                               inst    total   wood%   leaf%    amb%   VERDICT')
let bad=0
for(const r of rows){
  const woodPct=r.tot?100*r.woodT/r.tot:0
  let verdict=''
  if (r.ambPct>50) { verdict='UNCLASSIFIED — no atlas tile'; bad+=r.count }
  else if (r.leafPct<2 && r.tot>1000) { verdict='ALL WOOD — foliage tagged bark'; bad+=r.count }
  if(verdict) console.log(`${r.v.padEnd(36)} ${String(r.count).padStart(5)} ${String(r.tot).padStart(8)}  ${woodPct.toFixed(0).padStart(5)}  ${r.leafPct.toFixed(0).padStart(5)}  ${r.ambPct.toFixed(0).padStart(5)}   ${verdict}`)
}
console.log(`\nHEALTHY variants: ${rows.filter(r=>r.ambPct<=50 && !(r.leafPct<2 && r.tot>1000)).length} / ${rows.length}`)
console.log(`AFFECTED PLACEMENTS: ${bad} of ${insts.length} (${(100*bad/insts.length).toFixed(1)}%)`)
