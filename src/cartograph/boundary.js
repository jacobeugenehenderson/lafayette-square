// Neighborhood stencil — single source of truth for the silhouette every
// consumer reads (point-in-poly clipping, the radius, bake
// bbox).
//
// v2 schema fields (read through boundaryRecords.mjs#discOf; a file missing one is refused, never defaulted):
//   center        [x, z]   — shared center for everything below
//   radius        number   — nominal silhouette radius (the polygon hugs it)
//   polygon       [[x,z]]  — 256-pt closed boundary
//   ⛔ NO FADE HERE. The edge's fade band + ruffle are a LOOK's (Stage › Horizon › Edge, 2026-10-06), read from the
//   store's design by each faded layer (`boundaryRecords.mjs#lookFade`). This module is the GEOMETRY of the disc: the
//   radius cuts it — intended; more content at the edge is an Extent gesture (pull the circle out).
//
// `makeBoundary(nb)` is the KIT factory: hand it ANY installation's neighborhood_boundary.json —
// loaded by id, never imported here — and it returns the clip bundle. No installation is named in this module
// (the default installation's singleton exports went with the default town, 2026-10-21).

import { discOf } from '../../cartograph/boundaryRecords.mjs'

// Build the clip bundle for one neighborhood_boundary.json, THROUGH THE ONE READER (boundaryRecords.mjs#discOf): the ring,
// the centre, the radius and the point test are the disc record's, never re-derived here.
// ⛔ null in → null out: the scene's boundary has not been fetched yet, and a caller draws nothing the disc gates until it
// has (BRIEF-the-disc-is-one-source §1b). It used to answer "no boundary = show everything" with `center || [0, 0]` and
// `radius || 0`, which drew a town unclipped, plausibly, whenever the file was late or absent.
export function makeBoundary(nb) {
  if (!nb) return null
  const D = discOf(nb, 'makeBoundary')
  const boundary = D.ring
  const center = [D.cx, D.cz]
  const radius = D.R
  const pointInBoundary = D.inDisc
  function streetInBoundary(points) {
    const mid = points[Math.floor(points.length / 2)]
    return pointInBoundary(mid[0], mid[1])
  }
  function faceInBoundary(ring) {
    let cx = 0, cz = 0
    for (const p of ring) { cx += (p[0] ?? p.x); cz += (p[1] ?? p.z) }
    cx /= ring.length; cz /= ring.length
    return pointInBoundary(cx, cz)
  }
  // Clip a polyline (array of [x,z]) to the boundary polygon — keep in-poly
  // runs, split at crossings.
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
    if (!ring || ring.length < 3) return ring
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
    boundaryPolygon: boundary,
    pointInBoundary, streetInBoundary, faceInBoundary,
    clipPolylineToBoundary,
    clipRingToBoundary,
  }
}
