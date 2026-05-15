import * as THREE from 'three'

export function mergeBufferGeometries(geometries) {
  if (geometries.length === 0) return null
  if (geometries.length === 1) return geometries[0].clone()

  let totalVertices = 0
  let totalIndices = 0

  geometries.forEach(geo => {
    totalVertices += geo.attributes.position.count
    // Non-indexed geometry: every 3 vertices = 1 triangle
    totalIndices += geo.index ? geo.index.count : geo.attributes.position.count
  })

  const positions = new Float32Array(totalVertices * 3)
  const indices = new Uint32Array(totalIndices)

  // Preserve `aCentroidY` (per-vertex scalar) if every input carries it.
  // Foundations uses this to lift each building's slab rigidly by its own
  // raw heightmap value at render time; without copying it through, every
  // slab ends up at the same world Y after merge.
  const hasCentroidY = geometries.every(g => g.attributes.aCentroidY)
  const centroidYs = hasCentroidY ? new Float32Array(totalVertices) : null

  let vertexOffset = 0
  let indexOffset = 0
  let vertexCount = 0

  geometries.forEach(geo => {
    const pos = geo.attributes.position.array
    positions.set(pos, vertexOffset * 3)
    if (hasCentroidY) {
      centroidYs.set(geo.attributes.aCentroidY.array, vertexOffset)
    }

    if (geo.index) {
      const idx = geo.index.array
      for (let i = 0; i < idx.length; i++) {
        indices[indexOffset + i] = idx[i] + vertexCount
      }
      indexOffset += idx.length
    } else {
      // Non-indexed: generate sequential indices
      const count = geo.attributes.position.count
      for (let i = 0; i < count; i++) {
        indices[indexOffset + i] = i + vertexCount
      }
      indexOffset += count
    }

    vertexCount += geo.attributes.position.count
    vertexOffset += geo.attributes.position.count
  })

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (hasCentroidY) {
    merged.setAttribute('aCentroidY', new THREE.BufferAttribute(centroidYs, 1))
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1))
  merged.computeVertexNormals()
  return merged
}
