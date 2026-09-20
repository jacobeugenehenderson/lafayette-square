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
 * fade band, so objects thin out over exactly the band the ground fades on.
 *
 * ⛔⛔ AND IT IS DERIVED, NOT READ. This module used to read a stored
 * `fade: {inner, outer}` off the artifact with `?? R` on both sides. The fade-SSoT
 * work (77aa5aa9) deleted that stored field — it was a copy of numbers derivable
 * from `radius` — and BOTH `??` then fired, collapsing fadeIn and fadeOut onto R.
 * `density()` became 1-inside / 0-outside: exactly the on/off dichotomy quoted
 * above, reinstated four lines below the ruling against it, silently, in every
 * town. ⭐ 77aa5aa9 found ONE consumer of the deleted field (bake-ground's manifest
 * gate) and there were FOUR; the other three reach it through here. Found by the
 * arborist seat 2026-09-20, measured on HPDM: 34 lamps and 1,417 derived trees had
 * stopped thinning.
 *
 * ⛔ NO `??` HERE EVER AGAIN. An absent fade is a MEANINGFUL state, not a hole to
 * plug with a default — see the `fadeBand` gate in `makeMembership`.
 */
import { readFileSync } from 'node:fs'
import { deriveFade } from './boundaryRecords.mjs'

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
  // The ground's own fade band — DERIVED from the same SSoT the stencil and the
  // terrain bake use (`deriveFade`), so objects thin over exactly the band the
  // ground fades on. This is that rule's fourth call site.
  //
  // ⛔⛔ THE GATE IS THE POINT: an absent `fadeBand` means the scene authored NO
  // dissolve, and that absence is LEGAL AND READ elsewhere in the kit
  // (`classifyFade` → 'absent'; `sceneStencil` → `manifest.stencil = null`). Deriving
  // unconditionally would INVENT a band for such a scene — toy (radius 180, no
  // fadeBand) would gain a dissolve across its entire disc, 0 → 180, where the
  // author asked for none. ⭐ That is a sentinel treated as a value
  // (`project_a_sentinel_is_not_a_value`). For a scene with no authored fade, a hard
  // cut AT the radius is the intended behaviour, so fadeIn === fadeOut === R is
  // correct there — and only there.
  const hasFade = Number.isFinite(b.fadeBand)
  const { inner: fadeIn, outer: fadeOut } = hasFade
    ? deriveFade(R, b.fadeBand)
    : { inner: R, outer: R }

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

  // ⭐ `fade` is exposed so the band can be asserted DIRECTLY. It cannot be inferred
  // from density(): on a scene with no boundary-street polygon, isInside covers the
  // whole disc and SHADOWS the band entirely, so an invented band is invisible to
  // every behavioural probe. A check that can only see symptoms cannot pin this.
  return { isInside, keep, density, hasPolygon: !!poly, hasFade, fade: { inner: fadeIn, outer: fadeOut }, radius: R }
}
