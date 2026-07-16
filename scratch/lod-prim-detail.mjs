import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { buildMeshAncestorNames } from '../arborist/atlas-kind-classifier.js'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const v of ['acer_saccharum_multistem/skeleton-1','magnolia_sp/skeleton-1','pseudotsuga_menziesii/skeleton-1']) {
  const doc = await io.read(`public/trees/${v}-lod0.glb`)
  console.log('===', v)
  const anc = buildMeshAncestorNames(doc)
  for (const [mesh, names] of anc) {
    console.log('  mesh', JSON.stringify(mesh.getName()), 'ancestorNodeNames=', JSON.stringify(names))
    for (const n of names) {
      if (/branch(es)?|caps?|trunk|wood|bark|stem/i.test(n)) console.log('     ^^ MATCHES WOOD nodeName regex via', JSON.stringify(n))
      if (/leaf|leaves|foliage/i.test(n)) console.log('     ^^ matches LEAF nodeName regex via', JSON.stringify(n))
    }
  }
  console.log('  all node names:', JSON.stringify(doc.getRoot().listNodes().map(n=>n.getName())))
  console.log()
}
