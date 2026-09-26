/**
 * lampPool.js — ONE model of how far a street lamp's light reaches and how it falls off.
 *
 * Read by the ground's pool bake (`cartograph/bake-ground-ao.js`, the R channel of
 * `ground.poolmap.png`) AND by the per-tree glow bake (`arborist/bake-trees.js`), so a
 * tree is lit exactly where the ground under it is — never a second copy of the numbers.
 * (It was: the trees ran a gaussian σ 12 m cut at 48 m, the pool reached 16 m, so a tree
 * 30 m out glowed over unlit ground. Jacob, 2026-09-26: *"Lamps should affect tree albedo."*)
 *
 * The constants are the LAMP's, not a town's: one light fixture, the same everywhere.
 */

export const POOL_RADIUS_M    = 16   // outer reach of one lamp's light (m)
export const POOL_RING_POS    = 0.32 // normalized radius of the bright ring on the ground (0..1)
export const POOL_RING_SHARP  = 4.5  // ring sharpness; LOWER = blurrier ring
export const POOL_SHADOW_FRAC = 0.18 // centre radius the pole blocks its own light, on the ground
export const POOL_MAX         = 3.0  // headroom: overlapping lamps sum up to this before clipping

/** The distance falloff every surface shares — full at the lamp, zero at POOL_RADIUS_M. `rn` = d / POOL_RADIUS_M. */
export function lampFalloff(rn) {
  const penumbra = Math.exp(-rn * rn * 1.6)
  const rim = 1 - Math.max(0, Math.min(1, (rn - 0.7) / 0.3))
  return penumbra * rim
}

/**
 * Light on the GROUND: the falloff, plus the two things only the ground sees — the bright
 * ring the lamp head throws on the pavement, and the dark spot where the pole blocks its own light.
 */
export function groundPool(rn) {
  const postShadow = Math.min(1, rn / POOL_SHADOW_FRAC)
  const ringD = (rn - POOL_RING_POS) * POOL_RING_SHARP
  const ring = Math.exp(-ringD * ringD)
  const penumbra = Math.exp(-rn * rn * 1.6)
  const rim = 1 - Math.max(0, Math.min(1, (rn - 0.7) / 0.3))
  return (ring * 0.55 + penumbra * 0.45) * postShadow * rim
}

/**
 * Light on a CANOPY: the same reach and falloff, WITHOUT the ring and the pole shadow — a
 * crown up by the lamp head is neither on the pavement nor behind the pole (Jacob, 2026-09-26).
 * ⭐ Flip this one line to `groundPool(rn)` if the trees should carry the ground's shape too.
 */
export const canopyLight = (rn) => lampFalloff(rn)

/** Summed canopy light at (x, z) from a town's baked lamps, clamped to the same headroom as the pool. */
export function canopyLightAt(lamps, x, z) {
  let acc = 0
  const R2 = POOL_RADIUS_M * POOL_RADIUS_M
  for (const l of lamps) {
    const dx = x - l.x, dz = z - l.z, d2 = dx * dx + dz * dz
    if (d2 >= R2) continue
    acc += canopyLight(Math.sqrt(d2) / POOL_RADIUS_M)
  }
  return Math.min(acc, POOL_MAX)
}
