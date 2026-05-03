// Neighborhood stencil — single source of truth for the silhouette every
// consumer reads (point-in-poly clipping, face/street radial fades, bake
// bbox). To move/reshape the neighborhood: edit
// `cartograph/data/neighborhood_boundary.json` and re-bake. No code
// changes elsewhere.
//
// v2 schema fields (with v1 fallbacks so older artifacts still load):
//   center        [x, z]   — shared center for everything below
//   radius        number   — nominal silhouette radius (the polygon hugs it)
//   polygon       [[x,z]]  — 256-pt closed boundary
//   fade          {inner, outer}  — face-fill radial fade band
//   streetFade    {inner, outer}  — wider band; streets trail past faces
import boundaryData from '../../cartograph/data/neighborhood_boundary.json'

const boundary = boundaryData.boundary || []

export const BOUNDARY_CENTER_XZ = boundaryData.center || [0, 0]
export const BOUNDARY_RADIUS = boundaryData.radius || 0

// Face fade — v2 `fade.inner/outer`, falling back to v1 innerFadeOffset.
const _v1Inner = Math.max(0, BOUNDARY_RADIUS - (boundaryData.innerFadeOffset ?? 134))
export const FADE_INNER = boundaryData.fade?.inner ?? _v1Inner
export const FADE_OUTER = boundaryData.fade?.outer ?? BOUNDARY_RADIUS
export const FADE_INNER_OFFSET = BOUNDARY_RADIUS - FADE_INNER

// Street fade — wider band, same center. v1 fallback reproduces the prior
// derived offsets in StreetRibbons (FADE_INNER + 42, BOUNDARY_RADIUS + 108)
// so loading an unmigrated artifact keeps the existing aesthetic.
export const STREET_FADE_INNER = boundaryData.streetFade?.inner ?? (FADE_INNER + 42)
export const STREET_FADE_OUTER = boundaryData.streetFade?.outer ?? (BOUNDARY_RADIUS + 108)

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
