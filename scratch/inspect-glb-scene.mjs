// scratch/inspect-glb-scene.mjs — dump a published tree GLB's top-level scene graph.
// Usage: node scratch/inspect-glb-scene.mjs <file.glb>...
// Written 2026-07-22 chasing the linden_american triple-ship (publish-glb keep-by-name collision).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const f of process.argv.slice(2)) {
  const d = await io.read(f)
  const s = d.getRoot().listScenes()[0]
  const kids = s.listChildren()
  let tris = 0
  for (const m of d.getRoot().listMeshes())
    for (const p of m.listPrimitives())
      tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  console.log(f)
  console.log('  topLevel=' + kids.length, kids.map(n => `${n.getName()}@${n.getTranslation().map(v => v.toFixed(1)).join(',')}`).join(' | '))
  console.log(`  meshes=${d.getRoot().listMeshes().length} nodes=${d.getRoot().listNodes().length} tris=${Math.round(tris)}`)
}
