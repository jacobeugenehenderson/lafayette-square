import * as THREE from 'three'

// Thick ribbon mesh for a 2D polyline — real geometry so actual width is
// visible (LineBasicMaterial.linewidth is ignored by WebGL on most platforms).
// pts is an array of [x, z] pairs. halfWidth is the half-extent in meters.
export function polylineRibbon(pts, halfWidth, y = 0) {
  if (!pts || pts.length < 2) return null
  const positions = []
  const indices = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next[0] - prev[0], dz = next[1] - prev[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len, nz = dx / len
    positions.push(pts[i][0] + nx * halfWidth, y, pts[i][1] + nz * halfWidth)
    positions.push(pts[i][0] - nx * halfWidth, y, pts[i][1] - nz * halfWidth)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1)
    indices.push(a + 1, a + 2, a + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  return geo
}
