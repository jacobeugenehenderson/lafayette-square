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
import boundaryData from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'

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

// Clip a polyline (array of [x, z]) to the boundary polygon. Returns an
// array of polyline pieces — segments outside the boundary are dropped,
// segments crossing the boundary are split at the intersection. Used by
// overlay line-renderers (Measure + Survey royal-blue centerlines,
// MapLayers debug centerlines / barriers) so meshes stop at the soft-
// circle silhouette instead of trailing off the rectangular canvas.
// No-boundary fallback (toy / unmigrated): returns [points] unchanged.
export function clipPolylineToBoundary(points) {
  if (!points || points.length < 2) return points ? [points] : []
  if (!boundary.length) return [points]
  const pieces = []
  let current = null
  const closePiece = () => {
    if (current && current.length >= 2) pieces.push(current)
    current = null
  }
  const extend = (pt) => {
    if (!current) { current = [pt]; return }
    const last = current[current.length - 1]
    if (last[0] === pt[0] && last[1] === pt[1]) return
    current.push(pt)
  }
  const segIntersect = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const rX = bx - ax, rZ = bz - az
    const sX = dx - cx, sZ = dz - cz
    const denom = rX * sZ - rZ * sX
    if (Math.abs(denom) < 1e-12) return null
    const t = ((cx - ax) * sZ - (cz - az) * sX) / denom
    const u = ((cx - ax) * rZ - (cz - az) * rX) / denom
    if (t <= 1e-9 || t >= 1 - 1e-9) return null
    if (u <= 1e-9 || u >= 1 - 1e-9) return null
    return t
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const ax = a[0], az = a[1], bx = b[0], bz = b[1]
    const ts = []
    for (let j = 0, k = boundary.length - 1; j < boundary.length; k = j++) {
      const t = segIntersect(ax, az, bx, bz, boundary[k][0], boundary[k][1], boundary[j][0], boundary[j][1])
      if (t !== null) ts.push(t)
    }
    ts.sort((x, y) => x - y)
    const stops = [0, ...ts, 1]
    for (let s = 0; s < stops.length - 1; s++) {
      const t0 = stops[s], t1 = stops[s + 1]
      if (t1 - t0 < 1e-9) continue
      const mt = (t0 + t1) / 2
      const mx = ax + (bx - ax) * mt
      const mz = az + (bz - az) * mt
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0]
      const p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1]
      if (pointInBoundary(mx, mz)) { extend(p0); extend(p1) }
      else closePiece()
    }
  }
  closePiece()
  return pieces
}
