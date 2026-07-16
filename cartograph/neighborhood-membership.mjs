/**
 * neighborhood-membership.mjs — "is this inside the neighborhood proper?"
 *
 * ⭐ THE RULE (Jacob, 2026-07-15): *"We want the trees and lamps as literal as
 * possible inside the neighborhood proper; outside, inside the radius, we watch
 * for GPU."*
 *
 * Two regions, and the canon already draws the line (`NEIGHBORHOOD-INPUTS §5.2`,
 * `README §21`): **the neighborhood is the boundary-STREET POLYGON, not the
 * circle — the circle stays the slab disc/fade.**
 *
 *   INSIDE the polygon   → LITERAL. Real census, honest surfaces, nothing thinned.
 *   OUTSIDE, inside R    → the greater circle. GPU-managed: dissolve + hero-tier.
 *
 * Buildings (`pipeline.js`) and lamps (`bake-lamps.js`) already test membership
 * this way; each rolled its own copy. This is the shared one, so the hood's edge
 * means the same thing for every object standing in it
 * (`project_the_palimpsest_code_path_multiplicity` — collapse paths, never add one).
 *
 * ⚠️ A DISSOLVE, never an on/off cut (Jacob: *"I'd rather a dissolve [than an]
 * on/off edge fade dichotomy"*). The ramp is not invented here — it is the ground's
 * own authored `fade: {inner, outer}` from `neighborhood_boundary.json`, so objects
 * thin out over exactly the band the ground fades on. Today trees ignore it
 * entirely (they clip to the raw disc), which is the "trees don't fade" tell.
 */
import { readFileSync } from 'node:fs'

/** Ray-cast point-in-polygon. Accepts [{x,z}] or [[x,z]]. */
function pointInPolygon(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    const xi = a.x ?? a[0], zi = a.z ?? a[1]
    const xj = b.x ?? b[0], zj = b.z ?? b[1]
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Deterministic [0,1) from a position — stable across re-bakes. */
function hash01(x, z, salt) {
  let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663) ^ Math.imul(salt, 83492791)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * @param {string} boundaryPath  cartograph/data/<scene>/neighborhood_boundary.json
 * @returns {{
 *   isInside(x,z): boolean,        // inside the neighborhood proper (the street polygon)
 *   keep(x,z, salt?): boolean,     // the DISSOLVE — inside: always; outside: thinning to 0 at the rim
 *   density(x,z): number,          // 1 inside, ramping to 0 across the fade band
 *   hasPolygon: boolean,           // false → no street polygon persisted; disc is all we have
 *   radius: number,
 * }}
 */
export function makeMembership(boundaryPath) {
  const b = JSON.parse(readFileSync(boundaryPath, 'utf-8'))
  const poly = Array.isArray(b.polygon) && b.polygon.length >= 3 ? b.polygon : null
  const excl = (Array.isArray(b.exclusions) ? b.exclusions : []).filter(e => Array.isArray(e) && e.length >= 3)
  const R = b.radius ?? Infinity
  // The ground's own fade band — reused, not reinvented.
  const fadeIn = b.fade?.inner ?? R
  const fadeOut = b.fade?.outer ?? R

  const isInside = (x, z) => {
    for (const e of excl) if (pointInPolygon(x, z, e)) return false
    return poly ? pointInPolygon(x, z, poly) : Math.hypot(x, z) <= R
  }

  /**
   * 1.0 inside the neighborhood proper — literal, never thinned.
   * Outside, it rides the ground's fade band to 0 at the rim, so the greater
   * circle dissolves rather than ending at a seam.
   */
  const density = (x, z) => {
    if (isInside(x, z)) return 1
    const r = Math.hypot(x, z)
    if (r >= fadeOut) return 0
    if (r <= fadeIn) return 1
    return 1 - (r - fadeIn) / (fadeOut - fadeIn)
  }

  const keep = (x, z, salt = 1) => {
    const d = density(x, z)
    if (d >= 1) return true
    if (d <= 0) return false
    return hash01(x, z, salt) < d
  }

  return { isInside, keep, density, hasPolygon: !!poly, radius: R }
}
