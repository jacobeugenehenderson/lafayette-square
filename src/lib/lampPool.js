/**
 * lampPool.js — ONE model of how a street lamp's light falls on the world: ground, trees, walls.
 *
 * Read by the ground's pool bake (`cartograph/bake-ground-ao.js`, the R channel of
 * `ground.poolmap.png`), the per-tree glow bake (`arborist/bake-trees.js`) and the building walls
 * (`SlabBuildings.jsx`, via the grid below), so a tree or a wall is lit exactly where the ground is.
 *
 * ⭐ THE REACH IS THE TOWN'S, DERIVED — NOT A CONSTANT (Jacob, 2026-09-26: "The ground pools should
 * overlap"). A 16 m reach at 27 m spacing left the midpoint between neighbours at 16% of a pool's
 * peak: separate spots. `overlapReach(spacing)` solves for the reach at which the midpoint between two
 * neighbours equals a lone pool's peak — from this file's own profile, so nothing is typed — and
 * bake-lamps stamps it into lamps.json (`reach`), which every consumer reads.
 * ⭐ The PERCEIVED radius is a separate, live control: the ground draws a circle of that radius (POOL_SHAPE_GLSL) from
 * a baked nearest-lamp distance map; walls and trees clip by `canopyWipe` /
 * `canopyWipe` turn the Radius knob into a threshold that clips the soft tail at runtime.
 */

export const POOL_RING_POS    = 0.32 // normalized radius of the bright ring on the ground (0..1)
export const POOL_RING_SHARP  = 4.5  // ring sharpness; LOWER = blurrier ring
export const POOL_SHADOW_FRAC = 0.18 // centre radius the pole blocks its own light, on the ground
export const POOL_MAX         = 3.0  // headroom: overlapping lamps sum up to this before clipping

/** The distance falloff every surface shares — full at the lamp, zero at the reach. `rn` = d / reach. */
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
 */
export const canopyLight = (rn) => lampFalloff(rn)

const POOL_PEAK = (() => { let p = 0; for (let i = 0; i <= 2000; i++) p = Math.max(p, groundPool(i / 2000)); return p })()

/**
 * The reach at which two lamps `spacing` apart light the ground midway between them as brightly as
 * one pool's peak. Solved by bisection on this file's own profile — change the profile, the reach follows.
 */
export function overlapReach(spacing) {
  if (!(spacing > 0)) throw new Error(`[lampPool] overlapReach needs a positive spacing, got ${spacing}`)
  const mid = (R) => { const rn = (spacing / 2) / R; return rn < 1 ? 2 * groundPool(rn) : 0 }
  let lo = spacing / 2, hi = spacing * 4           // at lo the midpoint sits on the rim (0); at hi it is well past the peak
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (mid(m) < POOL_PEAK) lo = m; else hi = m }
  return +((lo + hi) / 2).toFixed(2)
}

/**
 * The Radius knob → a threshold on the summed light, so a LONE pool reads out to `radius` of its full reach.
 * ⭐ MONOTONIC, 0 = OFF (Loupe's audit, 2026-09-26: the first version followed groundPool itself, whose centre is
 * dark — the pole's shadow — so radius 0 clipped NOTHING and the pool was smallest near 0.2). The ground uses the
 * pool's OUTER ENVELOPE — the brightest it gets at or beyond a distance, which only falls — so the pool only grows
 * with the knob; the canopy's falloff already only falls. radius ≤ 0 → a threshold nothing reaches → no light.
 */
const WIPE_OFF = 1e9
// The smallest pool is its own bright ring — no threshold can clip inside where the light is brightest. So the
// knob runs from that ring (just above 0) to the full reach (1), with no dead stretch at the bottom. Read off the
// profile, not typed: the distance at which the ground pool peaks.
export const POOL_RING_REACH = (() => { let best = 0, at = 0; for (let i = 0; i <= 2000; i++) { const v = groundPool(i / 2000); if (v > best) { best = v; at = i / 2000 } } return at })()
const knobToReach = (k) => POOL_RING_REACH + Math.min(1, k) * (1 - POOL_RING_REACH)
export const canopyWipe = (radius) => (radius >= 1 ? 0 : radius <= 0 ? WIPE_OFF : lampFalloff(knobToReach(radius)))

/** Summed canopy light at (x, z) from a town's baked lamps, within `reach`, clamped to the pool's headroom. */
export function canopyLightAt(lamps, x, z, reach) {
  if (!(reach > 0)) throw new Error(`[lampPool] canopyLightAt needs the town's reach (lamps.json#reach), got ${reach}`)
  let acc = 0
  const R2 = reach * reach
  for (const l of lamps) {
    const dx = x - l.x, dz = z - l.z, d2 = dx * dx + dz * dz
    if (d2 >= R2) continue
    acc += canopyLight(Math.sqrt(d2) / reach)
  }
  return Math.min(acc, POOL_MAX)
}

// ── Building walls (Jacob, 2026-09-26: "Can buildings get streetlight as well?") ──────────────
// A wall pixel sums every lamp within reach: the SAME falloff, measured in 3D from the lamp head,
// × how squarely the wall faces it. There are thousands of lamps, so they are binned into a grid of
// reach-sized cells — a pixel only ever needs its own cell and the 8 around it.

/** The falloff above, in GLSL — keep the two in step (▶ checks/claims-light-sources-are-live.mjs compares them). */
export const LAMP_FALLOFF_GLSL = `
  float lampFalloff(float rn) {
    float penumbra = exp(-rn * rn * 1.6);
    float rim = 1.0 - clamp((rn - 0.7) / 0.3, 0.0, 1.0);
    return penumbra * rim;
  }`

/**
 * Bin lamps into `reach`-sized cells. Each cell holds up to `k` lamps (k = the busiest cell's count,
 * MEASURED from these lamps — never a cap), as RGBA float texels (x, z, 0, 1); an empty slot is (0,0,0,0).
 * Texture layout: width = cols × k, height = rows; cell (cx, cz), slot s → texel (cx × k + s, cz).
 * @returns {{ data: Float32Array, cols: number, rows: number, k: number, min: [number, number], cell: number } | null}
 */
export function buildLampGrid(lamps, reach) {
  if (!lamps?.length) return null
  if (!(reach > 0)) throw new Error(`[lampPool] buildLampGrid needs the town's reach (lamps.json#reach), got ${reach}`)
  const cell = reach
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const l of lamps) { minX = Math.min(minX, l.x); minZ = Math.min(minZ, l.z); maxX = Math.max(maxX, l.x); maxZ = Math.max(maxZ, l.z) }
  const cols = Math.floor((maxX - minX) / cell) + 1, rows = Math.floor((maxZ - minZ) / cell) + 1
  const cellOf = (l) => Math.floor((l.z - minZ) / cell) * cols + Math.floor((l.x - minX) / cell)
  const counts = new Uint16Array(cols * rows)
  for (const l of lamps) counts[cellOf(l)]++
  let k = 0; for (const c of counts) k = Math.max(k, c)
  const data = new Float32Array(cols * k * rows * 4), fill = new Uint16Array(cols * rows)
  for (const l of lamps) {
    const c = cellOf(l), cx = c % cols, cz = (c - cx) / cols, s = fill[c]++
    const t = ((cz * cols * k) + cx * k + s) * 4
    data[t] = l.x; data[t + 1] = l.z; data[t + 3] = 1
  }
  return { data, cols, rows, k, min: [minX, minZ], cell }
}

/** The Radius wipe, in GLSL — walls and trees clip with it (the ground draws POOL_SHAPE_GLSL). `th` from canopyWipe.
 *  The soft band is the top tenth of the threshold: a wider band (it was half) kept the ring's shoulders and
 *  pinned the pool at ~55% of its reach for the whole bottom third of the knob. */
export const LAMP_WIPE_GLSL = `
  float lampWipe(float v, float th) { return th > 0.0 ? v * smoothstep(0.9 * th, th, v) : v; }`


// ── THE POOL'S SHAPE (Jacob, 2026-09-26) ─────────────────────────────────────────────────────────
// "It should be a circle, that can get bigger or smaller … and THEN the soft center is taken out. The center
// circle doesn't change radius" · "The center circle … should be rather pronounced and contrast."
//   · the CIRCLE — its radius is the Pool radius knob × the town's reach; a soft outer edge (the outer POOL_SOFT
//     of the radius). Overlapping pools are the UNION (nearest-lamp distance), so they merge, never double.
//   · the CENTRE — an authored radius in metres (Lamp Glow › Pool centre), dark (CENTRE_FLOOR of the light left)
//     with an authored softness (Lamp Glow › Pool centre softness: the edge runs from (1 − s) to (1 + s) of its
//     radius, so 0 is crisp and 1 fades over the whole centre). It does not scale with the circle.
// Unitless shape fractions; the sizes are the knob and the authored centre. JS twins below are for the checks.
export const POOL_SOFT = 0.4
export const CENTRE_FLOOR = 0.05
// smoothstep needs two distinct edges; softness 0 draws the crispest edge the shader can (a hair, not a step).
export const CENTRE_SOFT_MIN = 0.005
const f3 = (v) => v.toFixed(3)
export const POOL_SHAPE_GLSL = `
  float poolDisc(float d, float R) { return R <= 0.0 ? 0.0 : 1.0 - smoothstep(${f3(1 - POOL_SOFT)} * R, R, d); }
  float poolCentre(float d, float c, float s) {
    s = max(s, ${f3(CENTRE_SOFT_MIN)});
    return c <= 0.0 ? 1.0 : mix(${f3(CENTRE_FLOOR)}, 1.0, smoothstep(c * (1.0 - s), c * (1.0 + s), d));
  }`
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const poolDisc = (d, R) => (R <= 0 ? 0 : 1 - smooth((1 - POOL_SOFT) * R, R, d))
export const poolCentre = (d, c, s) => {
  if (c <= 0) return 1
  s = Math.max(s, CENTRE_SOFT_MIN)
  return CENTRE_FLOOR + (1 - CENTRE_FLOOR) * smooth(c * (1 - s), c * (1 + s), d)
}
