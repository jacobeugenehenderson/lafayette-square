/**
 * waterLevel.mjs — WHERE THE WATER STANDS, as a value read at a time and a place.
 *
 * Ruled 2026-09-27 (Jacob, BRIEF-bathymetry): a town's water stands at a chosen tide, not at the survey flight's —
 * a LOW and a HIGH level per town, and a clock between them. ⛔ "Build the fixed
 * level so the moving one extends it: a level is a value read at a time, never a constant baked into geometry."
 *
 * The levels are terrain.json `water` (bake-terrain, from NOAA VDatum): fields over a coarse grid, in metres above the
 * terrain's zero. `levelAt(x, z, phase)` = low + (high − low) · phase; `tidePhase(date, water, tide)` is the phase on
 * NOAA's clock (below). One module for the bake, the checks and the player.
 */

import { tidePhaseClock } from './tide.mjs'

const _clocks = new WeakMap()
/**
 * The tide's phase at a time: 0 = the town's low level, 1 = its high. ⭐ On NOAA's clock (Jacob, 2026-09-28, BRIEF-tide:
 * "We decide the 'high' and 'low' tides, and clamp them to the times"): 1 at each predicted high, 0 at each low, a
 * half-cosine between — `cartograph/tide.mjs` tidePhaseClock, over the town manifest's `tide` record.
 * A lake (water.tidal false) has one level, so its phase is moot: 1.
 * ⛔ A TIDAL town with no tide record THROWS — never a silent high tide. The caller says so and draws HIGH.
 * @param date   the SCENE's time (Stage's scrubbed clock / the player's live one), not the wall clock
 * @param water  terrain.json `water`
 * @param tide   the town manifest's `tide`
 */
export function tidePhase(date, water, tide) {
  if (!water?.tidal) return 1
  if (!tide) throw new Error('tidePhase: this town is tidal but its manifest carries no `tide` clock — ▶ node cartograph/bake-manifest.mjs')
  let clock = _clocks.get(tide)
  if (!clock) { clock = tidePhaseClock(tide); _clocks.set(tide, clock) }
  return clock(date instanceof Date ? date : new Date(date))
}

/**
 * @param water terrain.json `water`
 * @returns { tidal, lowName, highName, lowAt, highAt, levelAt, range: { low: [min, max], high: [min, max] }, uncertaintyM }
 * ⛔ Throws on a record it cannot read — a missing level is never read as 0 (the flight's level, which no one chose).
 */
export function waterLevels(water) {
  if (!water || typeof water !== 'object') throw new Error('waterLevels: terrain.json carries no `water` record — the town has no chosen level. ▶ re-bake the terrain')
  const d = water.datums, g = d?.grid
  const low = d?.[water.low], high = d?.[water.high]
  if (!g || !Array.isArray(g.min) || !Array.isArray(g.step) || !(g.w >= 1) || !(g.h >= 1)) throw new Error('waterLevels: `water.datums.grid` is malformed')
  for (const [name, f] of [[water.low, low], [water.high, high]]) {
    if (!Array.isArray(f) || f.length !== g.w * g.h || !f.every(Number.isFinite)) throw new Error(`waterLevels: datum field ${name} is missing or not ${g.w}×${g.h} numbers`)
  }
  // Bilinear over the grid (row-major by z then x), clamped at its edges.
  const field = (f) => (x, z) => {
    if (g.w === 1 && g.h === 1) return f[0]
    const fx = g.w > 1 ? Math.min(g.w - 1, Math.max(0, (x - g.min[0]) / g.step[0])) : 0
    const fz = g.h > 1 ? Math.min(g.h - 1, Math.max(0, (z - g.min[1]) / g.step[1])) : 0
    const i = Math.min(g.w - 2, Math.floor(fx)), j = Math.min(g.h - 2, Math.floor(fz))
    const i0 = Math.max(0, i), j0 = Math.max(0, j), i1 = Math.min(g.w - 1, i0 + 1), j1 = Math.min(g.h - 1, j0 + 1)
    const tx = fx - i0, tz = fz - j0, at = (a, b) => f[b * g.w + a]
    return (at(i0, j0) * (1 - tx) + at(i1, j0) * tx) * (1 - tz) + (at(i0, j1) * (1 - tx) + at(i1, j1) * tx) * tz
  }
  const lowAt = field(low), highAt = field(high)
  const mm = (f) => [Math.min(...f), Math.max(...f)]
  return {
    tidal: !!water.tidal, lowName: water.low, highName: water.high,
    lowAt, highAt, levelAt: (x, z, phase) => lowAt(x, z) + (highAt(x, z) - lowAt(x, z)) * phase,
    range: { low: mm(low), high: mm(high) }, uncertaintyM: d.uncertaintyM ?? null,
  }
}
