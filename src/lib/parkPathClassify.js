/**
 * parkPathClassify — shared park-path predicates, consumed by BOTH the bake
 * (`cartograph/bake-ground.js`) and the runtime park (`LafayettePark.jsx`),
 * so the slab and the live render partition park footpaths identically.
 *
 * Park footpaths are the subset of `ribbons.json` `.paths` whose geometry
 * lies inside the park polygon. Of those, "bridge" paths cross water and are
 * handled specially (a lifted overlay today; first-class baked bridges in the
 * Phase-5 off-the-ground-paths arc — at which point classification moves to a
 * carried OSM `bridge`/`layer` tag and this water-overlap heuristic becomes a
 * fallback).
 */

// Even-odd ray-cast point-in-polygon (compass-frame [x, z]; non-convex safe).
export function pointInRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if (((zi > p[1]) !== (zj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - zi) / (zj - zi || 1e-12) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// Fraction of a polyline's vertices that fall inside a ring.
export function fracInRing(pts, ring) {
  if (!pts || !pts.length) return 0
  let nin = 0
  for (const p of pts) if (pointInRing(p, ring)) nin++
  return nin / pts.length
}

// Water = lake.outer minus lake.island (island is land), plus grotto.
export function pointInWater(p, water) {
  if (!water) return false
  if (water.lake?.outer && pointInRing(p, water.lake.outer)) {
    if (water.lake.island && pointInRing(p, water.lake.island)) return false
    return true
  }
  if (Array.isArray(water.grotto) && pointInRing(p, water.grotto)) return true
  if (water.grotto?.outer && pointInRing(p, water.grotto.outer)) return true
  return false
}

// A path is a "bridge" if the majority of its segment midpoints fall over
// water. (Phase 5: superseded by a carried OSM bridge tag; kept as fallback.)
export function classifyBridgePath(path, water) {
  const pts = path.points || path
  if (!pts || pts.length < 2) return false
  let inWater = 0, total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    if (pointInWater([(ax + bx) / 2, (az + bz) / 2], water)) inWater++
    total++
  }
  return inWater > total / 2
}
