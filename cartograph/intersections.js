/**
 * Cartograph — Intersection detection and curb return generation
 *
 * Finds where streets meet by clustering endpoints, then generates:
 *   - Curb return arcs (rounded corners at intersections)
 *   - Intersection pavement fills (the polygon where streets overlap)
 *   - Crosswalk placement hints
 *
 * The curb return radius comes from standards.js (15 ft for residential).
 */

import { STANDARDS } from './standards.js'

const SNAP_RADIUS = 3.0 // meters — endpoints within this are "same intersection"

/**
 * Detect intersections from street features.
 *
 * Groups street endpoints that are within SNAP_RADIUS of each other.
 * Each intersection has a center point and a list of street arms
 * (the direction each street enters the intersection).
 *
 * @param {Array} streets — features with .coords [{x,z},...] and .tags
 * @returns {Array} intersections — [{center, arms: [{angle, streetIdx, end}]}]
 */
export function detectIntersections(streets) {
  // Collect all endpoints
  const endpoints = []
  for (let i = 0; i < streets.length; i++) {
    const c = streets[i].coords
    if (c.length < 2) continue
    endpoints.push({ x: c[0].x, z: c[0].z, streetIdx: i, end: 'start' })
    endpoints.push({ x: c[c.length - 1].x, z: c[c.length - 1].z, streetIdx: i, end: 'end' })
  }

  // Cluster endpoints by proximity
  const used = new Set()
  const intersections = []

  for (let i = 0; i < endpoints.length; i++) {
    if (used.has(i)) continue

    const cluster = [i]
    used.add(i)

    // Find all endpoints near this one
    for (let j = i + 1; j < endpoints.length; j++) {
      if (used.has(j)) continue
      const dx = endpoints[j].x - endpoints[i].x
      const dz = endpoints[j].z - endpoints[i].z
      if (Math.sqrt(dx * dx + dz * dz) < SNAP_RADIUS) {
        cluster.push(j)
        used.add(j)
      }
    }

    // Only intersections (2+ streets meeting)
    if (cluster.length < 2) continue

    // Compute center
    let cx = 0, cz = 0
    for (const idx of cluster) {
      cx += endpoints[idx].x
      cz += endpoints[idx].z
    }
    cx /= cluster.length
    cz /= cluster.length

    // Compute arm angles (direction each street approaches from)
    const arms = cluster.map(idx => {
      const ep = endpoints[idx]
      const c = streets[ep.streetIdx].coords

      // Get the direction vector pointing AWAY from the intersection
      // (i.e., the direction the street goes)
      let dx, dz
      if (ep.end === 'start') {
        // Street starts here, so it goes toward coords[1]
        dx = c[1].x - c[0].x
        dz = c[1].z - c[0].z
      } else {
        // Street ends here, so it goes toward coords[n-2]
        dx = c[c.length - 2].x - c[c.length - 1].x
        dz = c[c.length - 2].z - c[c.length - 1].z
      }

      const angle = Math.atan2(dz, dx)

      return {
        angle,
        streetIdx: ep.streetIdx,
        end: ep.end,
        tags: streets[ep.streetIdx].tags,
      }
    })

    // Sort arms by angle (CCW)
    arms.sort((a, b) => a.angle - b.angle)

    intersections.push({ center: { x: cx, z: cz }, arms })
  }

  return intersections
}

/**
 * Generate curb return arcs for all intersections.
 *
 * For each pair of adjacent arms at an intersection, generates a
 * fillet arc that rounds the corner where their curb lines would meet.
 *
 * @param {Array} intersections — from detectIntersections()
 * @param {number} radius — curb return radius in meters
 * @returns {Array} arcs — [{center, startAngle, endAngle, radius, points}]
 */
export function generateCurbReturns(intersections, radius) {
  if (!radius) radius = STANDARDS.intersection.curbReturnRadius

  const arcs = []

  for (const ix of intersections) {
    const n = ix.arms.length
    if (n < 2) continue

    for (let i = 0; i < n; i++) {
      const arm1 = ix.arms[i]
      const arm2 = ix.arms[(i + 1) % n]

      // The curb return sits in the "gap" between two adjacent arms
      // Arc goes from arm1's right curb to arm2's left curb

      // Bisector angle between the two arms (pointing into the corner)
      let midAngle = (arm1.angle + arm2.angle) / 2
      // If the arms span more than PI, flip the bisector
      let span = arm2.angle - arm1.angle
      if (span < 0) span += 2 * Math.PI
      if (span > Math.PI) {
        midAngle += Math.PI
      }

      // Generate arc points
      // The arc sweeps from arm1.angle + PI/2 to arm2.angle - PI/2
      // (perpendicular to each arm's direction = along the curb)
      const startAng = arm1.angle + Math.PI / 2
      const endAng = arm2.angle - Math.PI / 2

      let sweep = endAng - startAng
      if (sweep < -Math.PI) sweep += 2 * Math.PI
      if (sweep > Math.PI) sweep -= 2 * Math.PI

      // Arc center is offset from intersection center
      const arcCx = ix.center.x + Math.cos(midAngle) * radius * 0.7
      const arcCz = ix.center.z + Math.sin(midAngle) * radius * 0.7

      // Generate arc as polyline (8 segments per quarter turn)
      const segments = Math.max(4, Math.round(Math.abs(sweep) / (Math.PI / 2) * 8))
      const points = []

      for (let s = 0; s <= segments; s++) {
        const t = s / segments
        const a = startAng + sweep * t
        points.push({
          x: Math.round((arcCx + Math.cos(a) * radius) * 100) / 100,
          z: Math.round((arcCz + Math.sin(a) * radius) * 100) / 100,
        })
      }

      arcs.push({
        center: { x: arcCx, z: arcCz },
        radius,
        points,
        armCount: n,
      })
    }
  }

  return arcs
}

/**
 * Generate intersection fill polygons.
 *
 * Creates a filled polygon at each intersection covering the area
 * where streets overlap — the irregular polygon bounded by the
 * curb returns.
 *
 * @param {Array} intersections
 * @param {Array} curbReturns — from generateCurbReturns()
 * @param {number} radius
 * @returns {Array} fills — [{ring: [{x,z},...]}]
 */
export function generateIntersectionFills(intersections, curbReturns, radius) {
  if (!radius) radius = STANDARDS.intersection.curbReturnRadius

  const fills = []
  let arcIdx = 0

  for (const ix of intersections) {
    const n = ix.arms.length
    if (n < 2) { arcIdx += n; continue }

    // Build the intersection polygon by connecting curb return arcs
    const ring = []

    for (let i = 0; i < n; i++) {
      const arc = curbReturns[arcIdx + i]
      if (arc?.points) {
        for (const p of arc.points) {
          ring.push(p)
        }
      }
    }

    arcIdx += n

    if (ring.length >= 3) {
      fills.push({ ring, center: ix.center, armCount: n })
    }
  }

  return fills
}
