// Neighborhood stencil — single source of truth for the silhouette every
// consumer reads (point-in-poly clipping, face/street radial fades, bake
// bbox).
//
// v2 schema fields (with v1 fallbacks so older artifacts still load):
//   center        [x, z]   — shared center for everything below
//   radius        number   — nominal silhouette radius (the polygon hugs it)
//   polygon       [[x,z]]  — 256-pt closed boundary
//   fadeBand      number   — ⭐ THE ONE FADE KNOB: feather width in metres,
//                            measured INWARD from the rim. `fade` is DERIVED
//                            from it (radius − fadeBand → radius) and is never
//                            stored; `streetFade` was deleted 2026-09-20.
//                            ⛔ The radius CUTS the geometry — intended. More
//                            content at the edge is an Extent-tool gesture
//                            (pull the circle out), not a render change.
//
// The module-level named exports below are the DEFAULT installation (Lafayette
// Square), kept identical for every existing LS-context consumer. `makeBoundary(nb)`
// is the KIT factory: hand it ANY installation's neighborhood_boundary.json —
// loaded by id, never imported here — and it returns the same clip/fade bundle.
// No installation but the default is named in this module.
import boundaryData from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'
// ⭐ ONE formula, imported — not a second copy. This module used to carry its own
// `?? 134 / +42 / +108` defaults that disagreed with boundaryRecords' `200/140/160`,
// which is how one circle came to have three definitions.
import { deriveFade, DEFAULT_FADE_BAND } from '../../cartograph/boundaryRecords.mjs'

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
  // ⛔ The fade is DERIVED, never read from the artifact. `fade.inner`/`fade.outer`
  // and `streetFade` used to be stored and used to win over any derivation (every
  // field was `??`), so moving the radius left five numbers pointing at the old
  // circle. The only stored fade fact is the band WIDTH.
  const fadeBand = Number.isFinite(nb?.fadeBand) ? nb.fadeBand : DEFAULT_FADE_BAND
  const { inner: fadeInner, outer: fadeOuter } = deriveFade(radius, fadeBand)

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
  // ⭐⭐ CLIP A FILLED RING TO THE BOUNDARY — Sutherland–Hodgman, which is exact here because
  // the boundary is a CONVEX ring (the disc, 256-gon). Added for the pour's `water` and
  // `remainder` faces, whose outer ring is the whole bb rectangle: drawn raw they would paint a
  // 340 km² slab across the scene.
  // ⛔ CLIPPED AT RENDER, NEVER AT POUR. The radius is live-editable with no re-pour
  // (`EXTENT-DESIGN §3.3` R15, the living boundary), so baking the disc into map.json would
  // freeze one radius into the artifact and a later radius change would leave a hole.
  // ⛔⛔ HOLES MUST BE CLIPPED TOO, and the first version of this said otherwise. "A hole outside
  // the disc cannot affect what the disc shows" is false for a hole that STRADDLES it: the lake
  // is a 40.11 km² hole in a remainder whose clipped outer is the 39.34 km² disc, so left
  // unclipped it subtracts more than the whole face — net drawn came out at −40.20 km², and a
  // hole poking outside its outer contour is not something ShapeGeometry can be trusted with.
  function clipRingToBoundary(ring) {
    if (!boundary.length || !ring || ring.length < 3) return ring
    const xy = (p) => [p[0] ?? p.x, p[1] ?? p.z]
    let out = ring.map(xy)
    for (let i = 0; i < boundary.length && out.length; i++) {
      const a = boundary[i], b = boundary[(i + 1) % boundary.length]
      // inside = left of a→b; the boundary ring's winding decides the sign, so take it from
      // the centre, which is inside by construction.
      const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
      const want = Math.sign(side(center)) || 1
      const inside = (p) => Math.sign(side(p)) === want || side(p) === 0
      const next = []
      for (let k = 0; k < out.length; k++) {
        const P = out[k], Q = out[(k + 1) % out.length]
        const pi = inside(P), qi = inside(Q)
        if (pi) next.push(P)
        if (pi !== qi) {
          const sp = side(P), sq = side(Q), t = sp / (sp - sq)
          next.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t])
        }
      }
      out = next
    }
    return out.length >= 3 ? out.map(([x, z]) => ({ x, z })) : null
  }

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
    fadeInner, fadeOuter, fadeBand,
    boundaryPolygon: boundary,
    pointInBoundary, streetInBoundary, faceInBoundary,
    clipPolylineToBoundary,
    clipPolylineToRadius,
    clipRingToBoundary,
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
export const FADE_BAND = _ls.fadeBand
export const boundaryPolygon = _ls.boundaryPolygon
export const pointInBoundary = _ls.pointInBoundary
export const streetInBoundary = _ls.streetInBoundary
export const faceInBoundary = _ls.faceInBoundary
export const clipPolylineToBoundary = _ls.clipPolylineToBoundary
