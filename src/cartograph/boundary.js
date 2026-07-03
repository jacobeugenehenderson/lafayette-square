// Neighborhood stencil — single source of truth for the silhouette every
// consumer reads (point-in-poly clipping, face/street radial fades, bake
// bbox).
//
// v2 schema fields (with v1 fallbacks so older artifacts still load):
//   center        [x, z]   — shared center for everything below
//   radius        number   — nominal silhouette radius (the polygon hugs it)
//   polygon       [[x,z]]  — 256-pt closed boundary
//   fade          {inner, outer}  — face-fill radial fade band
//   streetFade    {inner, outer}  — wider band; streets trail past faces
//
// The module-level named exports below are the DEFAULT installation (Lafayette
// Square), kept identical for every existing LS-context consumer. `makeBoundary(nb)`
// is the KIT factory: hand it ANY installation's neighborhood_boundary.json —
// loaded by id, never imported here — and it returns the same clip/fade bundle.
// No installation but the default is named in this module.
import boundaryData from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'

// Clip a polyline to a CIRCLE (center + radius). Scene-agnostic (params only),
// so it lives at module scope and is shared by every boundary bundle.
export function clipPolylineToRadius(points, centerXZ, R) {
  if (!points || points.length < 2) return points ? [points] : []
  if (!(R > 0)) return [points]
  const cx = centerXZ[0], cz = centerXZ[1]
  const R2 = R * R
  const inside = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= R2
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
  const crossings = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az
    const A = dx * dx + dz * dz
    if (A < 1e-12) return []
    const fx = ax - cx, fz = az - cz
    const B = 2 * (fx * dx + fz * dz)
    const C = fx * fx + fz * fz - R2
    const disc = B * B - 4 * A * C
    if (disc <= 0) return []
    const sq = Math.sqrt(disc)
    const ts = []
    for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      if (t > 1e-9 && t < 1 - 1e-9) ts.push(t)
    }
    return ts
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const ax = a[0], az = a[1], bx = b[0], bz = b[1]
    const ts = crossings(ax, az, bx, bz).sort((x, y) => x - y)
    const stops = [0, ...ts, 1]
    for (let s = 0; s < stops.length - 1; s++) {
      const t0 = stops[s], t1 = stops[s + 1]
      if (t1 - t0 < 1e-9) continue
      const mt = (t0 + t1) / 2
      const mx = ax + (bx - ax) * mt
      const mz = az + (bz - az) * mt
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0]
      const p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1]
      if (inside(mx, mz)) { extend(p0); extend(p1) }
      else closePiece()
    }
  }
  closePiece()
  return pieces
}

// Build the full clip/fade bundle for one neighborhood_boundary.json.
export function makeBoundary(nb) {
  const boundary = nb?.boundary || []
  const center = nb?.center || [0, 0]
  const radius = nb?.radius || 0
  const v1Inner = Math.max(0, radius - (nb?.innerFadeOffset ?? 134))
  const fadeInner = nb?.fade?.inner ?? v1Inner
  const fadeOuter = nb?.fade?.outer ?? radius
  const streetFadeInner = nb?.streetFade?.inner ?? (fadeInner + 42)
  const streetFadeOuter = nb?.streetFade?.outer ?? (radius + 108)

  function pointInBoundary(x, z) {
    if (!boundary.length) return true // no boundary = show everything
    let inside = false
    for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
      const xi = boundary[i][0], zi = boundary[i][1]
      const xj = boundary[j][0], zj = boundary[j][1]
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
    }
    return inside
  }
  function streetInBoundary(points) {
    if (!boundary.length) return true
    const mid = points[Math.floor(points.length / 2)]
    return pointInBoundary(mid[0], mid[1])
  }
  function faceInBoundary(ring) {
    if (!boundary.length) return true
    let cx = 0, cz = 0
    for (const p of ring) { cx += (p[0] ?? p.x); cz += (p[1] ?? p.z) }
    cx /= ring.length; cz /= ring.length
    return pointInBoundary(cx, cz)
  }
  // Clip a polyline (array of [x,z]) to the boundary polygon — keep in-poly
  // runs, split at crossings. No-boundary fallback returns [points].
  function clipPolylineToBoundary(points) {
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

  return {
    boundary,
    center, radius,
    fadeInner, fadeOuter, fadeInnerOffset: radius - fadeInner,
    streetFadeInner, streetFadeOuter,
    boundaryPolygon: boundary,
    pointInBoundary, streetInBoundary, faceInBoundary,
    clipPolylineToBoundary,
    clipPolylineToRadius,
  }
}

// ── Default-installation (Lafayette Square) exports — identical to before ───
// Consumers that render a SPECIFIC other installation build their own bundle
// via makeBoundary(<that installation's boundary, loaded by id>).
const _ls = makeBoundary(boundaryData)
export const BOUNDARY_CENTER_XZ = _ls.center
export const BOUNDARY_RADIUS = _ls.radius
export const FADE_INNER = _ls.fadeInner
export const FADE_OUTER = _ls.fadeOuter
export const FADE_INNER_OFFSET = _ls.fadeInnerOffset
export const STREET_FADE_INNER = _ls.streetFadeInner
export const STREET_FADE_OUTER = _ls.streetFadeOuter
export const boundaryPolygon = _ls.boundaryPolygon
export const pointInBoundary = _ls.pointInBoundary
export const streetInBoundary = _ls.streetInBoundary
export const faceInBoundary = _ls.faceInBoundary
export const clipPolylineToBoundary = _ls.clipPolylineToBoundary
