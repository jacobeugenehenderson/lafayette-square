// Neighborhood boundary — point-in-polygon test for clipping
import boundaryData from '../../cartograph/data/neighborhood_boundary.json'

const boundary = boundaryData.boundary || []

export function pointInBoundary(x, z) {
  if (!boundary.length) return true // no boundary = show everything
  let inside = false
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const xi = boundary[i][0], zi = boundary[i][1]
    const xj = boundary[j][0], zj = boundary[j][1]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// Test whether a polyline's midpoint is inside the boundary
export function streetInBoundary(points) {
  if (!boundary.length) return true
  const mid = points[Math.floor(points.length / 2)]
  return pointInBoundary(mid[0], mid[1])
}

// Test whether a face's centroid is inside the boundary
export function faceInBoundary(ring) {
  if (!boundary.length) return true
  let cx = 0, cz = 0
  for (const p of ring) { cx += (p[0] ?? p.x); cz += (p[1] ?? p.z) }
  cx /= ring.length; cz /= ring.length
  return pointInBoundary(cx, cz)
}

// The raw boundary polygon for rendering as an outline
export const boundaryPolygon = boundary
