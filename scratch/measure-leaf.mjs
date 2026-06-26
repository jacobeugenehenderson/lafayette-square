import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import fs from 'fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
function medianLeafEdge(prim){
  const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices()
  if(!pos) return null
  const P=pos.getArray(); const I = idx?idx.getArray():null
  const edges=[]; const n = I?I.length:(P.length/3)
  for(let t=0;t<n;t+=3){
    const a=I?I[t]:t, b=I?I[t+1]:t+1, c=I?I[t+2]:t+2
    const e=(i,j)=>Math.hypot(P[i*3]-P[j*3],P[i*3+1]-P[j*3+1],P[i*3+2]-P[j*3+2])
    edges.push(e(a,b),e(b,c),e(c,a))
  }
  edges.sort((x,y)=>x-y)
  return edges.length?edges[Math.floor(edges.length/2)]:null
}
async function measure(path){
  if(!fs.existsSync(path)) return `  (file not on disk: ${path})`
  let doc; try{ doc=await io.read(path) }catch(e){ return `  (read error: ${e.message})` }
  const out=[]
  for(const mesh of doc.getRoot().listMeshes()){
    for(const prim of mesh.listPrimitives()){
      const ex=prim.getExtras()||{}
      const isLeaf = ex.atlasKind==='leaf' || /leaf|leaves|foliage/i.test(mesh.getName()||'')
      if(isLeaf) out.push(`  leaf "${mesh.getName()}" kind=${ex.atlasKind||'?'} medianEdge=${medianLeafEdge(prim)?.toFixed(4)} verts=${prim.getAttribute('POSITION').getCount()}`)
    }
  }
  return out.length?out.join('\n'):'  (no leaf prim found; meshes: '+doc.getRoot().listMeshes().map(m=>m.getName()).join(',')+')'
}
const targets={
  'CHASSIS red_maple_b (x1 baseline)':'public/trees/_chassis/red_maple_b.glb',
  'PUBLISHED maple_sugar lod0 (expect ~x2)':'public/trees/maple_sugar/skeleton-1-lod0.glb',
  'SLAB maple_sugar lod0 (expect == published)':'public/baked/lafayette-square/trees/maple_sugar/skeleton-1-lod0.glb',
}
for(const [label,path] of Object.entries(targets)){ console.log(label+':'); console.log(await measure(path)) }
