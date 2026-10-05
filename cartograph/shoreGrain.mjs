/**
 * shoreGrain.mjs — HOW COARSE THE SHORE MEDIAN'S MATERIAL IS, from the slope across it.
 *
 * ⭐ Ruled 2026-10-04 (Jacob, BRIEF-the-shore-is-closed): the grain follows the SLOPE — boulders where the ground
 * drops steeply to the water, rocks, then gravel, then sand where it is gentle. One continuous value, so there is no
 * line where one material stops and the next starts.
 *
 * The slope at a station is the rise across the median over its width: atan(h − he, w), in degrees.
 *
 * ⚠️ PROVISIONAL — ONE END IS SOURCED, THE SHAPE BETWEEN IS NOT. The steep end is riprap's angle of repose
 * (`RIPRAP_REPOSE_DEG`, a property of stone): no loose stone stands steeper, so that slope takes the coarsest grain.
 * Flat takes sand. Between them the grain is LINEAR in the angle until the slope at which each size class takes over
 * is read from the USACE Coastal Engineering Manual (open: the slope-by-grain finding, not yet in references/).
 * ⛔ Replace the line with those values; do not tune it by eye.
 *
 * @returns g in [0, 1]: 0 = sand, 1 = the coarsest grain the shore takes (boulders, today).
 */
import { RIPRAP_REPOSE_DEG } from './shore-armour.mjs'

export function slopeDeg(h, he, w) {
  if (!(w > 0) || !Number.isFinite(h) || !Number.isFinite(he)) return NaN
  return Math.atan2(Math.abs(h - he), w) * 180 / Math.PI
}

export function grainFromSlope(deg) {
  if (!Number.isFinite(deg)) throw new Error(`shoreGrain: no slope (${deg}) — a station with no known median takes no grain, and the caller must say so`)
  return Math.max(0, Math.min(1, deg / RIPRAP_REPOSE_DEG))
}
