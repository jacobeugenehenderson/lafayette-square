import * as THREE from 'three'

// Thick ribbon mesh for a 2D polyline — real geometry so actual width is
// visible (LineBasicMaterial.linewidth is ignored by WebGL on most platforms).
// pts is an array of [x, z] pairs. halfWidth is the half-extent in meters.
//
// Joints use proper miters so the ribbon's visual thickness stays constant
// through corners (no pinching). At very sharp angles the miter is clamped
// to avoid infinite spikes; beyond the clamp the joint degrades to a bevel.
export function polylineRibbon(pts, halfWidth, y = 0) {
  if (!pts || pts.length < 2) return null
  const MITER_LIMIT = 6   // clamp miter length to 6× halfWidth at sharp turns
  const positions = []
  const indices = []
  for (let i = 0; i < pts.length; i++) {
    // Segment tangents entering and leaving this node (unit vectors).
    let t1x = 0, t1z = 0, t2x = 0, t2z = 0
    if (i > 0) {
      const dx = pts[i][0] - pts[i-1][0], dz = pts[i][1] - pts[i-1][1]
      const L = Math.hypot(dx, dz) || 1
      t1x = dx / L; t1z = dz / L
    }
    if (i < pts.length - 1) {
      const dx = pts[i+1][0] - pts[i][0], dz = pts[i+1][1] - pts[i][1]
      const L = Math.hypot(dx, dz) || 1
      t2x = dx / L; t2z = dz / L
    }
    // Endpoints: duplicate the single-segment tangent so we get a
    // perpendicular extrusion (no miter needed).
    if (i === 0) { t1x = t2x; t1z = t2z }
    if (i === pts.length - 1) { t2x = t1x; t2z = t1z }
    // Left-perps of each incoming/outgoing segment.
    const p1x = -t1z, p1z = t1x
    const p2x = -t2z, p2z = t2x
    // Miter = sum of perps, rescaled so its projection onto each perp
    // equals halfWidth. Math: m = (p1 + p2) / (1 + p1·p2) works for the
    // inside of the joint; |m| blows up as p1 ≈ -p2 (near-reversal).
    // Miter limit caps that at MITER_LIMIT × halfWidth.
    let mx = p1x + p2x, mz = p1z + p2z
    const denom = 1 + (p1x * p2x + p1z * p2z)
    if (Math.abs(denom) < 1e-6) {
      // Near-reversal fallback: use one of the perps directly.
      mx = p1x; mz = p1z
    } else {
      mx /= denom; mz /= denom
    }
    const mLen = Math.hypot(mx, mz)
    if (mLen > MITER_LIMIT) {
      mx = (mx / mLen) * MITER_LIMIT
      mz = (mz / mLen) * MITER_LIMIT
    }
    const ox = mx * halfWidth, oz = mz * halfWidth
    positions.push(pts[i][0] + ox, y, pts[i][1] + oz)
    positions.push(pts[i][0] - ox, y, pts[i][1] - oz)
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
