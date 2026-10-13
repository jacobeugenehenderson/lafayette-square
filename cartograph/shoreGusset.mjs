/**
 * shoreGusset.mjs — THE GUSSET, RECORDED: the bank from the high water down to the low water, per station of the coast.
 *
 * Ruled (Jacob, 2026-10-11): the coast line is where the lidar meets HIGH water, and "the gusset is the bank from there
 * down to the LOW-WATER plane". Its SHAPE is data (2026-10-10: "it would determine particulate/fill size"), so it is
 * RECORDED, never smoothed away. ⛔ Nothing here moves the ground: the water side is the terrain the slab draws (the
 * surveyed lidar flats, the bed below the flown water), measured as it stands (Boz's ruling, 2026-10-13).
 *
 * Per vertex of a coast run (the line's height is the run's own `h`, the HIGH there):
 *   · `ground`: the terrain AT the line, the water side's height where it meets the land
 *   · `toLow`:  metres from the line, walked across the water side, to the first ground at or below LOW (the crossing
 *               interpolated between samples one terrain step apart), or null: NOT REACHED within `reachM`
 *   · a station whose water side cannot be told (drawn water on both sides or neither) records null for both, COUNTED
 * ⛔ null is never replaced by a value: "not reached within reachM" is the answer, and `reachM` travels with the record.
 *
 * `reachM` is the town's, derived: the equilibrium profile's own run from HIGH to LOW over the town's widest tidal range,
 * ((high − low) / A)^(3/2) with A the bed's Dean coefficient (bake-terrain, from the town's sand), and never less than
 * one terrain step. On a lake HIGH = LOW, so it is one step.
 * ▶ node checks/claims-the-gusset-is-recorded.mjs
 */

/** The search reach and its derivation, from the terrain's bed record and the levels. ⛔ Throws without a bed. */
export function gussetReach({ bed, levels, stepM }) {
  if (!(bed?.A > 0)) throw new Error('gussetReach: the terrain carries no bed profile (bed.A) — the bank\'s reach is unknown. ▶ re-bake the terrain')
  if (!(stepM > 0)) throw new Error('gussetReach: the terrain carries no grid step')
  const range = Math.max(0, levels.range.high[1] - levels.range.low[0])
  const dean = Math.pow(range / bed.A, 1.5)
  return { reachM: Math.max(stepM, dean), from: dean >= stepM ? `the bed's run from ${levels.highName} to ${levels.lowName} over the widest range (${range.toFixed(2)} m, A ${bed.A})` : 'one terrain step (no tidal range)' }
}

/**
 * @param poly    a coast run's vertices [[x, z], …]
 * @param o.ground  (x, z) → the terrain's raw height (metres above zero), what the slab draws on the water side
 * @param o.lowAt   (x, z) → the LOW level there
 * @param o.wetAt   (x, z) → true inside the drawn water
 * @param o.stepM   the terrain's grid step: the walk's sample spacing, and the side probe is half of it
 * @param o.reachM  how far the walk looks for LOW (gussetReach)
 * @returns {{ ground: (number|null)[], toLow: (number|null)[], noSide: number, reached: number, notReached: number }}
 */
export function gussetAlong(poly, { ground, lowAt, wetAt, stepM, reachM }) {
  if (!(stepM > 0) || !(reachM > 0)) throw new Error('gussetAlong: stepM and reachM must be positive')
  const out = { ground: [], toLow: [], noSide: 0, reached: 0, notReached: 0 }
  const probe = stepM / 2
  for (let i = 0; i < poly.length; i++) {
    const [x, z] = poly[i]
    // the vertex normal: the mean of its segments' left normals
    const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)]
    const tx = b[0] - a[0], tz = b[1] - a[1], m = Math.hypot(tx, tz)
    const wl = m > 0 && wetAt(x - tz / m * probe, z + tx / m * probe), wr = m > 0 && wetAt(x + tz / m * probe, z - tx / m * probe)
    if (wl === wr) { out.ground.push(null); out.toLow.push(null); out.noSide++; continue }
    const nx = (wl ? -tz : tz) / m, nz = (wl ? tx : -tx) / m
    out.ground.push(+ground(x, z).toFixed(3))
    let prevD = 0, prevE = ground(x, z) - lowAt(x, z), hit = prevE <= 0 ? 0 : null
    for (let d = stepM; hit == null && d <= reachM + 1e-9; d += stepM) {
      const px = x + nx * d, pz = z + nz * d, e = ground(px, pz) - lowAt(px, pz)
      if (e <= 0) hit = prevD + (d - prevD) * prevE / (prevE - e)
      prevD = d; prevE = e
    }
    if (hit == null) { out.toLow.push(null); out.notReached++ } else { out.toLow.push(+hit.toFixed(3)); out.reached++ }
  }
  return out
}
