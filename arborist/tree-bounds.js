/**
 * tree-bounds.js — world-space AABB of a published tree document.
 *
 * Extracted from publish-glb.js so the one-time canopy-radius backfill can
 * share the EXACT same bbox logic without importing publish-glb (whose module
 * scope runs the CLI `main()`). Pure: operates on a gltf-transform Document via
 * its public API, no I/O, no extension deps. publish-glb (on every publish) and
 * backfill-canopy-radius.js (the migration) are the two consumers.
 */

function multiplyMat4(a, b) {
  const out = new Array(16)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]
    out[r * 4 + c] = s
  }
  return out
}
function transformPoint(m, p) {
  return [
    m[0]  * p[0] + m[1]  * p[1] + m[2]  * p[2] + m[3],
    m[4]  * p[0] + m[5]  * p[1] + m[6]  * p[2] + m[7],
    m[8]  * p[0] + m[9]  * p[1] + m[10] * p[2] + m[11],
  ]
}
function nodeWorldMatrix(node) {
  // Walk parents until we hit Scene/null. Scene has no getMatrix.
  let m = node.getMatrix()
  let p = node.getParentNode ? node.getParentNode() : null
  while (p && typeof p.getMatrix === 'function') {
    m = multiplyMat4(p.getMatrix(), m)
    p = p.getParentNode ? p.getParentNode() : null
  }
  return m
}

// World-space AABB of every mesh primitive (node transforms applied). Returns
// { heightM, canopyRadiusM } in the doc's SOURCE units — both pre-normalizeScale,
// so a consumer scales them together by normalizeScale to reach real meters.
//   heightM       — Y extent (drives normalizeScale; existing behavior).
//   canopyRadiusM — horizontal silhouette radius = mean of the X & Z half-
//                   extents, i.e. (xExtent + zExtent) / 4. The hero-tier
//                   prominence pass (bake-trees) reads it as the canopy
//                   bounding-sphere radius. Mean (not max) keeps a roughly-round
//                   canopy from over-occluding its neighbours.
export function computeTreeBounds(doc) {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const worldM = nodeWorldMatrix(node)
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const localMin = pos.getMin([])
      const localMax = pos.getMax([])
      // Transform all 8 corners of the local AABB to world space.
      for (let i = 0; i < 8; i++) {
        const corner = [
          (i & 1) ? localMax[0] : localMin[0],
          (i & 2) ? localMax[1] : localMin[1],
          (i & 4) ? localMax[2] : localMin[2],
        ]
        const w = transformPoint(worldM, corner)
        if (w[0] < minX) minX = w[0]; if (w[0] > maxX) maxX = w[0]
        if (w[1] < minY) minY = w[1]; if (w[1] > maxY) maxY = w[1]
        if (w[2] < minZ) minZ = w[2]; if (w[2] > maxZ) maxZ = w[2]
      }
    }
  }
  if (!isFinite(minY) || !isFinite(maxY)) return { heightM: null, canopyRadiusM: null }
  const heightM = Math.round((maxY - minY) * 10) / 10
  const canopyRadiusM = isFinite(minX) && isFinite(minZ)
    ? Math.round(((maxX - minX) + (maxZ - minZ)) / 4 * 10) / 10
    : null
  return { heightM, canopyRadiusM }
}
