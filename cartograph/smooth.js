/**
 * Cartograph — Bezier smoothing
 *
 * Converts polylines to smooth cubic bezier SVG paths using
 * Catmull-Rom → cubic bezier conversion. Every offset line
 * (curbs, sidewalk edges, pavement edges) becomes a smooth curve.
 *
 * Catmull-Rom splines pass through all original points (unlike
 * B-splines which only approximate), so the geometry stays accurate
 * while eliminating the faceted look of straight segments.
 */

/**
 * Convert a polyline [{x, z}, ...] to an SVG cubic bezier path string.
 * Uses Catmull-Rom interpolation with configurable tension.
 *
 * @param {Array} pts   — [{x, z}, ...]
 * @param {number} tension — 0 = sharp, 1 = smooth (default 0.5)
 * @param {boolean} closed — close the path?
 * @returns {string} SVG path d attribute
 */
export function smoothLine(pts, tension = 0.5, closed = false) {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    return `M${r(pts[0].x)},${r(pts[0].z)} L${r(pts[1].x)},${r(pts[1].z)}`
  }

  const alpha = tension

  // For Catmull-Rom, we need phantom points at each end
  // Mirror the first/last segment
  const p = closed
    ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
    : [
        { x: 2 * pts[0].x - pts[1].x, z: 2 * pts[0].z - pts[1].z },
        ...pts,
        { x: 2 * pts[pts.length - 1].x - pts[pts.length - 2].x,
          z: 2 * pts[pts.length - 1].z - pts[pts.length - 2].z },
      ]

  let d = `M${r(pts[0].x)},${r(pts[0].z)}`

  const n = closed ? pts.length : pts.length - 1

  for (let i = 0; i < n; i++) {
    const p0 = p[i]
    const p1 = p[i + 1]
    const p2 = p[i + 2]
    const p3 = p[i + 3]

    // Catmull-Rom to cubic bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / (6 / alpha)
    const cp1z = p1.z + (p2.z - p0.z) / (6 / alpha)
    const cp2x = p2.x - (p3.x - p1.x) / (6 / alpha)
    const cp2z = p2.z - (p3.z - p1.z) / (6 / alpha)

    d += ` C${r(cp1x)},${r(cp1z)} ${r(cp2x)},${r(cp2z)} ${r(p2.x)},${r(p2.z)}`
  }

  if (closed) d += ' Z'

  return d
}

/**
 * Convert a polygon ring (strip polygon) to a smooth closed bezier path.
 * A strip polygon has two "sides" — forward and reversed.
 * We smooth each side independently then join them.
 *
 * @param {Array} ring — [{x, z}, ...] closed polygon (forward side + reversed side)
 * @param {number} halfCount — number of points in the forward side
 * @param {number} tension
 * @returns {string} SVG path d attribute
 */
export function smoothRing(ring, halfCount, tension = 0.5) {
  if (!halfCount || ring.length < 4) {
    // Fall back to smoothing the whole ring as one path
    return smoothLine(ring, tension, true)
  }

  const side1 = ring.slice(0, halfCount)
  const side2 = ring.slice(halfCount)

  // Smooth each side, connect them with straight end caps
  const s1 = smoothLineSegment(side1, tension)
  const s2 = smoothLineSegment(side2.reverse(), tension)

  return `M${r(side1[0].x)},${r(side1[0].z)} ${s1} L${r(side2[0].x)},${r(side2[0].z)} ${s2} Z`
}

/**
 * Like smoothLine but returns just the curve commands (no M prefix).
 */
function smoothLineSegment(pts, tension = 0.5) {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    return `L${r(pts[1].x)},${r(pts[1].z)}`
  }

  const alpha = tension
  const p = [
    { x: 2 * pts[0].x - pts[1].x, z: 2 * pts[0].z - pts[1].z },
    ...pts,
    { x: 2 * pts[pts.length - 1].x - pts[pts.length - 2].x,
      z: 2 * pts[pts.length - 1].z - pts[pts.length - 2].z },
  ]

  let d = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = p[i]
    const p1 = p[i + 1]
    const p2 = p[i + 2]
    const p3 = p[i + 3]

    const cp1x = p1.x + (p2.x - p0.x) / (6 / alpha)
    const cp1z = p1.z + (p2.z - p0.z) / (6 / alpha)
    const cp2x = p2.x - (p3.x - p1.x) / (6 / alpha)
    const cp2z = p2.z - (p3.z - p1.z) / (6 / alpha)

    d += ` C${r(cp1x)},${r(cp1z)} ${r(cp2x)},${r(cp2z)} ${r(p2.x)},${r(p2.z)}`
  }

  return d
}

function r(v) { return (Math.round(v * 10) / 10).toFixed(1) }
