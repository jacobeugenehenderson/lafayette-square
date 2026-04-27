// Neighborhood boundary — single source of truth for the circle that
// defines what's "in scope" for the cartograph. All consumers (point-in-poly
// tests for clipping, fade shaders in AerialTiles / StreetRibbons / MapLayers)
// read from this file. To move the circle: edit
// `cartograph/data/neighborhood_boundary.json` and re-run the polygon
// regenerator (one-shot script). No code changes needed elsewhere.
import boundaryData from '../../cartograph/data/neighborhood_boundary.json'

const boundary = boundaryData.boundary || []

// Center + radius + fade band — exported as plain values and as a THREE
// Vector2 so consumers can use whichever shape they need without
// re-typing literals.
export const BOUNDARY_CENTER_XZ = boundaryData.center || [0, 0]
export const BOUNDARY_RADIUS = boundaryData.radius || 0
// Distance inside the radius where the fade starts. Default keeps the prior
// magic number (892 outer, 758 inner = 134m fade band) when not specified.
export const FADE_INNER_OFFSET = boundaryData.innerFadeOffset ?? 134
export const FADE_OUTER = BOUNDARY_RADIUS
export const FADE_INNER = Math.max(0, BOUNDARY_RADIUS - FADE_INNER_OFFSET)

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
