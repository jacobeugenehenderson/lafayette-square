/**
 * ringsToFlatGeo — triangulate Clipper-output rings into a flat, ground-plane
 * BufferGeometry (positions on the XZ plane at a fixed Y, up-normals).
 *
 * Shared SSoT for "rings → flat mesh": the Designer (BlockGeometryV2Debug)
 * and the runtime park (LafayettePark's unified path render) both build flat
 * pavement meshes from `buildPathRibbons`'s ring output, so the triangulation
 * lives in one place. CCW outers + CW holes (Clipper non-zero output).
 *
 * NOTE (dedup follow-up): BlockGeometryV2Debug.jsx still carries its own
 * private copy of this function (plus the ring helpers, which it shares with
 * ~10 other call sites there). Repointing that consumer at this module is a
 * safe later cleanup — left for the per-touch accord sweep so the designer's
 * blast radius stays out of the park-path arc.
 */

import * as THREE from 'three'

export function ringSignedArea(ring) {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    a += (x1 * y2 - x2 * y1)
  }
  return a / 2
}

// Even-odd point-in-polygon (works for non-convex rings).
export function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi || 1e-12) + xi)) inside = !inside
  }
  return inside
}

// Interior probe for a hole ring (CW from Clipper): an edge midpoint nudged
// perpendicular-inward by epsilon, so point-in-polygon doesn't land on the
// shared boundary.
export function ringInteriorProbe(ring) {
  const ccw = ringSignedArea(ring) > 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-3) continue
    const px = ccw ? -dy / len : dy / len
    const py = ccw ?  dx / len : -dx / len
    const eps = 0.01
    return [(a[0] + b[0]) / 2 + px * eps, (a[1] + b[1]) / 2 + py * eps]
  }
  return ring[0]
}

/**
 * rings → flat BufferGeometry at y=yLift, up-normals.
 * When asPolygonWithHoles is set, holes pair with their smallest containing
 * outer (nested geometry); otherwise every ring triangulates standalone.
 */
export function ringsToFlatGeo(rings, yLift = 0, asPolygonWithHoles = false) {
  if (!rings || !rings.length) return null
  const outers = []
  const holes = []
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    if (ringSignedArea(ring) > 0) outers.push(ring)
    else holes.push(ring)
  }

  const allPos = [], allNrm = [], allIdx = []
  let vOffset = 0

  const buildShapeGeo = (outer, ringHoles) => {
    const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, z)))
    if (ringHoles) {
      for (const h of ringHoles) {
        const path = new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z)))
        shape.holes.push(path)
      }
    }
    return new THREE.ShapeGeometry(shape)
  }

  const append = (geo) => {
    const pos = geo.attributes.position.array
    const idx = geo.index ? geo.index.array : null
    for (let i = 0; i < pos.length; i += 3) {
      allPos.push(pos[i], yLift, pos[i + 1])
      allNrm.push(0, 1, 0)
    }
    if (idx) {
      for (let i = 0; i < idx.length; i += 3) {
        allIdx.push(idx[i] + vOffset, idx[i + 2] + vOffset, idx[i + 1] + vOffset)
      }
    }
    vOffset += pos.length / 3
    geo.dispose()
  }

  if (asPolygonWithHoles && outers.length) {
    // Pair each hole with the SMALLEST containing outer (point-in-polygon by
    // an interior probe). Handles nested geometry — a hole inside a block-
    // island attaches to that block, not the enclosing stencil.
    const outerArea = outers.map(o => Math.abs(ringSignedArea(o)))
    const holesByOuter = outers.map(() => [])
    for (const h of holes) {
      const probe = ringInteriorProbe(h)
      let bestIdx = -1, bestArea = Infinity
      for (let i = 0; i < outers.length; i++) {
        if (pointInRing(probe, outers[i]) && outerArea[i] < bestArea) {
          bestIdx = i; bestArea = outerArea[i]
        }
      }
      if (bestIdx >= 0) holesByOuter[bestIdx].push(h)
    }
    for (let i = 0; i < outers.length; i++) {
      append(buildShapeGeo(outers[i], holesByOuter[i]))
    }
  } else {
    for (const ring of [...outers, ...holes]) append(buildShapeGeo(ring, null))
  }

  if (!allPos.length) return null
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(allNrm, 3))
  if (allIdx.length) out.setIndex(allIdx)
  return out
}
