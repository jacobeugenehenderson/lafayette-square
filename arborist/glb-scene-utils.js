/**
 * glb-scene-utils.js — shared glTF scene-graph repair used by the extractor
 * (survey-deleaf.js, at emit) and the one-off repair (repair-orphan-meshes.js).
 *
 * THE BUG it fixes: several vendor bundles carry "orphan-rooted" meshes — a mesh
 * hangs off a Node that is NOT a child of any Scene (survey-deleaf.js notes this
 * at the bundle-height pass). The decomposition isolated the target mesh but
 * never re-attached its node to a Scene before writing, so the emitted chassis
 * has geometry that no Scene points at. A browser's glTF loader only instantiates
 * SCENE-attached meshes — so the chassis renders blank in the gauntlet, the
 * Salon, AND invisibly in any bake. 47 of 241 chassis shipped this way.
 */

// Make every Mesh in the doc reachable from the (first) Scene. Two orphan shapes
// occur in the vendor bundles: (a) the mesh hangs off a Node that isn't a Scene
// child — attach that node's topmost orphan ancestor (preserving intermediate
// transforms); (b) the mesh has NO owning Node at all (stylized_willow) — create
// one and add it. Returns the number of meshes re-attached (0 = clean).
export function attachOrphansToScene(doc) {
  const scene = doc.getRoot().listScenes()[0]
  if (!scene) return 0
  const reachable = new Set()
  const mark = (n) => { if (reachable.has(n)) return; reachable.add(n); n.listChildren().forEach(mark) }
  scene.listChildren().forEach(mark)
  const reachedMeshes = new Set()
  for (const n of reachable) { const m = n.getMesh(); if (m) reachedMeshes.add(m) }
  const nodes = doc.getRoot().listNodes()
  let fixed = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    if (reachedMeshes.has(mesh)) continue
    const owner = nodes.find(n => n.getMesh() === mesh)
    if (owner) {
      let top = owner
      while (top.getParentNode && top.getParentNode()) top = top.getParentNode()
      if (!reachable.has(top)) { scene.addChild(top); mark(top) }
    } else {
      scene.addChild(doc.createNode(mesh.getName() || 'mesh').setMesh(mesh))
    }
    fixed++
  }
  return fixed
}
