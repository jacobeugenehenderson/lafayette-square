import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const v of ['tilia_americana/skeleton-1','pseudotsuga_menziesii/skeleton-1','linden_american/skeleton-1']) {
  console.log('===', v)
  for (const lod of ['lod0','lod1','lod2']) {
    try{
      const d = await io.read(`public/trees/${v}-${lod}.glb`)
      for (const m of d.getRoot().listMeshes()) for (const pr of m.listPrimitives()) {
        if (pr.getExtras()?.atlasKind!=='bark') continue
        const a=pr.getAttribute('POSITION')
        const mn=a.getMin([]), mx=a.getMax([])
        const t=(pr.getIndices()?.getCount()||0)/3
        const span=[mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]]
        console.log(`  ${lod} bark tris=${String(Math.round(t)).padStart(6)}  bbox span X=${span[0].toFixed(1)} Y=${span[1].toFixed(1)} Z=${span[2].toFixed(1)} m   min=[${mn.map(n=>n.toFixed(1))}] max=[${mx.map(n=>n.toFixed(1))}]`)
      }
    }catch(e){console.log('  ',lod,'ERR',e.message.slice(0,50))}
  }
  console.log()
}
