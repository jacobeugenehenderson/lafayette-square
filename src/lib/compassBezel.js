// The town's edge as a compass bezel — THE ONE MODEL (BRIEF-compass-bezel).
//
// The neighbourhood's disc is an edge of the drawing; this gives that edge a job: ticks round the
// rim, as on a watch bezel (no drawn ring — the ticks imply the circle), heavier at the four
// cardinals with N · E · S · W. Pure: the plan layer (on the ground at the rim) and Street's
// screen-space bezel both draw from THIS, so there is one definition of a tick, not two.
//
// ⛔ NOTHING HERE IS A TOWN'S. The centre and radius are the town's own disc (`ground.json`'s
// `stencil`); every radial size is a FRACTION of that radius; the spacing is an ANGLE, so a town
// of any size reads the same when its disc is fitted to a screen. The divisions are the Look's
// authored `compass` block, with a neutral default. ▶ node checks/claims-the-bezel-carries-no-towns-constant.mjs
//
// Bearings are degrees TRUE, clockwise from north. The town frame is x east, z SOUTH (TownPoint
// projects `z = (lat0 − lat) · k`), so north is −z.

/** The neutral default. A Look overrides any of it under `compass`; nothing here is tuned to a town. */
export const BEZEL_DEFAULTS = Object.freeze({
  tickDegrees: 5,        // minor tick spacing, degrees — must divide 90 so the cardinals land on ticks
  majorEvery: 6,         // every Nth tick is a major (5° × 6 = every 30°)
  minorLength: 0.018,    // tick lengths, as fractions of the radius, drawn inward from the rim
  majorLength: 0.032,
  cardinalLength: 0.05,
  tickWidth: 0.0022,     // tick width, fraction of the radius
  cardinalWidth: 0.0045,
  letterSize: 0.045,     // N · E · S · W cap height, fraction of the radius
  letterInset: 0.085,    // letter centre, inward from the rim, fraction of the radius
  color: '#e8e8f0',
  opacity: 0.85,
  halo: '#14141c',
})

const CARDINALS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
const norm = (d) => ((d % 360) + 360) % 360

/** A point at `bearing` degrees true and `r` metres from `center`, in the town frame. */
export function atBearing([cx, cz], bearing, r) {
  const b = bearing * Math.PI / 180
  return [cx + r * Math.sin(b), cz - r * Math.cos(b)]
}

/**
 * The bezel for one town.
 * @param stencil  `ground.json`'s stencil ({ center:[x,z], radius }) — or null
 * @param authored the Look's `compass` block (scene.json), or undefined
 * @returns {{ ok: false, reason } | { ok: true, center, radius, style, ticks, cardinals }}
 *   ticks:     [{ bearing, kind: 'minor'|'major'|'cardinal', inner, outer, width }]   (metres from centre)
 *   cardinals: [{ letter, bearing, r, size }]
 */
export function bezelModel(stencil, authored) {
  if (!stencil) return { ok: false, reason: 'this town has no disc (ground.json stencil is null) — no bezel' }
  const { center, radius } = stencil
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) {
    return { ok: false, reason: `the stencil's centre is not a point (${JSON.stringify(center)})` }
  }
  if (!(radius > 0)) return { ok: false, reason: `the stencil's radius is not a length (${radius})` }

  for (const k of Object.keys(authored || {})) {
    if (!(k in BEZEL_DEFAULTS)) throw new Error(`[compassBezel] ⛔ unknown compass field "${k}" (have: ${Object.keys(BEZEL_DEFAULTS).join(' ')})`)
  }
  const s = { ...BEZEL_DEFAULTS, ...authored }
  const n = 360 / s.tickDegrees
  if (!Number.isInteger(n) || !Number.isInteger(90 / s.tickDegrees)) {
    throw new Error(`[compassBezel] ⛔ tickDegrees ${s.tickDegrees} must divide 90 — the cardinals must land on ticks`)
  }
  if (!Number.isInteger(s.majorEvery) || s.majorEvery < 1) throw new Error(`[compassBezel] ⛔ majorEvery ${s.majorEvery} must be a whole number ≥ 1`)

  const R = radius
  const ticks = []
  for (let i = 0; i < n; i++) {
    const bearing = i * s.tickDegrees
    const kind = bearing % 90 === 0 ? 'cardinal' : i % s.majorEvery === 0 ? 'major' : 'minor'
    const len = kind === 'cardinal' ? s.cardinalLength : kind === 'major' ? s.majorLength : s.minorLength
    ticks.push({ bearing, kind, inner: R * (1 - len), outer: R, width: R * (kind === 'cardinal' ? s.cardinalWidth : s.tickWidth) })
  }
  const cardinals = CARDINALS.map(([letter, bearing]) => ({ letter, bearing, r: R * (1 - s.letterInset), size: R * s.letterSize }))
  return { ok: true, center: [center[0], center[1]], radius: R, style: s, ticks, cardinals }
}

/** "facing north-east" words for a heading — the 8-point name, for a spoken readout. null in, null out. */
export function compassWord(heading) {
  if (!Number.isFinite(heading)) return null
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(norm(heading) / 45) % 8]
}
