/**
 * The Light Show's geometry: where strands hang, how big a bulb is, how strong the one average glow. PURE, and every
 * number derived from the set-piece's declared extent or the display's own strands, never from one tower
 * (CLAUDE.md Layer 0; Zob's review and Boz's ruling, 2026-10-31). ▶ node checks/claims-a-display-scales-with-its-set-piece.mjs
 *
 * The ridge and the pinnacle are REGULAR POLYGONS the set-piece declares: `sides` and `halfWidthM` (the apothem, centre
 * to the middle of a face). The frame's faces must equal the ridge's sides: a count the geometry cannot place THROWS.
 */
import { Refusal } from '../../lib/refusal.js'

// A bulb's radius is this fraction of its own strand's bulb spacing, so bulbs keep their look at any size and never
// merge into a tube. (0.31 is how the Pilgrim Monument's first bulbs read.)
export const BULB_OF_SPACING = 0.31
// The one average glow: the illuminance (lux) it gives at a distance equal to its own height above the base; its
// intensity follows (I = E · d²), so the wash scales with the set-piece.
export const AVG_GLOW_LUX = 5
export const AVG_GLOW_HEIGHT_OF_RIDGE = 0.45

/** The frame's faces must be the ridge's sides. Throws by name otherwise. */
export function checkFaces(faces, extent, where) {
  const sides = extent?.ridge?.sides
  if (!(sides >= 3)) throw new Refusal(`[LightShow] ⛔ ${where}: the set-piece's ridge declares no sides, so the strands cannot be placed`)
  if (faces !== sides) throw new Refusal(`[LightShow] ⛔ ${where}: the drawer's frame has ${faces} faces and the set-piece's ridge has ${sides} sides; a look's faces must be the ridge's`)
  if (extent.pinnacle && extent.pinnacle.sides !== sides) throw new Refusal(`[LightShow] ⛔ ${where}: the pinnacle has ${extent.pinnacle.sides} sides and the ridge ${sides}`)
}

/** Face k of a regular `sides`-gon of apothem `a`: the point at u ∈ [-1, 1] along it, in the base frame (x, z). */
export function onFace(k, u, a, sides) {
  const rot = -k * 2 * Math.PI / sides, half = a * Math.tan(Math.PI / sides), x0 = u * half
  return [x0 * Math.cos(rot) - a * Math.sin(rot), x0 * Math.sin(rot) + a * Math.cos(rot)]
}

/** n strands, evenly round the ridge's faces, each with its top on the ridge and its foot on a ring of radius ringR. */
export function strandEnds(n, sides, ridgeHalf, ringR) {
  const per = n / sides, out = []
  for (let s = 0; s < n; s++) {
    const k = Math.floor(s / per), u = ((s % per) + 0.5) / per * 2 - 1, [tx, tz] = onFace(k, u, ridgeHalf, sides)
    const th = ((s + 0.5) / n - 0.5 / sides) * 2 * Math.PI
    out.push({ tx, tz, bx: ringR * Math.sin(th), bz: ringR * Math.cos(th) })
  }
  return out
}

/** The pinnacle's face k: its width, its centre (x, y, z) a hair off the stone, and its turn about +Y. */
export function pinnacleFace(k, pin) {
  const rot = -k * 2 * Math.PI / pin.sides, a = pin.halfWidthM + 0.05, H = pin.toM - pin.fromM
  return { width: 2 * pin.halfWidthM * Math.tan(Math.PI / pin.sides), height: H, position: [-a * Math.sin(rot), pin.fromM + H / 2, a * Math.cos(rot)], rotation: [0, -rot, 0] }
}

/**
 * The pinnacle's wash at height `up` on a face (0 at the strip, 1 at the top): the face's lower colour `lo` and upper
 * colour `hi` (each 0…1 per channel, the look's own pinnacle, already scaled by how far the pinnacle is up), brightest
 * at the strip and falling away up the stone. Writes rgb into `out`.
 * ⛔ NEVER OUT OF GAMUT: the wash is drawn without tone mapping, so a channel past 1 is not light, it is a different
 * colour; Jacob, 2026-10-31, saw a red pinnacle go pink. The strip's gain is applied, and then, where any channel would
 * pass 1, the whole colour is scaled down together, so it keeps its hue (never clamped channel by channel).
 * ▶ node checks/claims-a-pinnacle-stays-in-gamut.mjs --mutants
 */
export const PIN_STRIP_GAIN = 1.6
export function pinnacleWash(lo, hi, up, out) {
  const m = up < 0.35 ? 0.95 + (0.55 - 0.95) * up / 0.35 : 0.55 + (0.18 - 0.55) * (up - 0.35) / 0.65
  const mix = Math.min(1, up / 0.35) * 0.5 + Math.max(0, up - 0.35) / 0.65 * 0.5, g = m * PIN_STRIP_GAIN
  for (let i = 0; i < 3; i++) out[i] = (lo[i] + (hi[i] - lo[i]) * mix) * g
  const k = Math.max(out[0], out[1], out[2])
  if (k > 1) for (let i = 0; i < 3; i++) out[i] /= k
  return out
}

/** A bulb's radius on a strand of `length` metres carrying `rows` bulbs. */
export const bulbRadius = (length, rows) => BULB_OF_SPACING * length / rows
// The cord and each bulb's Edison socket, sized from the same spacing, so neither is a thickness tuned to one tower.
export const CORD_OF_SPACING = 0.02
export const SOCKET_OF_BULB = { radius: 0.42, height: 0.7 }
/** A cord's radius on a strand of `length` metres carrying `rows` bulbs. */
export const cordRadius = (length, rows) => CORD_OF_SPACING * length / rows

/** The average glow: where it stands (its height) and its intensity for a mean brightness `lum` (0…1). */
export function avgGlow(extent, lum) {
  const d = extent.ridge.yM * AVG_GLOW_HEIGHT_OF_RIDGE
  return { y: d, intensity: AVG_GLOW_LUX * d * d * lum }
}

/**
 * The strands' INSTANCE ORDER: the glow's strands first, then the rest, so a mesh's draw count can stop at what hangs
 * (LightShow.jsx: at glow only the glow's strands are drawn, never the rest as zero-scaled instances). `n` strands,
 * `isGlow(s)` which are the glow's. → { pos: strand → its place, glow: the glow's strands, all: every strand, in order }.
 * ▶ node checks/claims-a-display-draws-only-what-hangs.mjs
 */
export function strandOrder(n, isGlow) {
  const glow = [], rest = []
  for (let s = 0; s < n; s++) (isGlow(s) ? glow : rest).push(s)
  const all = [...glow, ...rest], pos = new Array(n)
  all.forEach((s, k) => { pos[s] = k })
  return { pos, glow, all }
}

/**
 * A BULB DRAWN TO ITS SIZE (Boz's (2), 2026-11-02: at the hero camera PTown's 5,760 bulbs, 184 triangles each, are a few
 * pixels or less). bulbPx: a bulb's projected radius in framebuffer pixels, its radius over its distance times the camera's
 * focal length in pixels (framebuffer height / (2·tan(fov/2))). Below ONE pixel (the unit, not a town number) its glass and
 * socket cannot be told apart, so only its light is drawn, as a camera-facing card of the light's own projected AREA: a
 * square of side r·CARD_SIDE has the disc's area π·r². At the switch both forms are under a pixel, so nothing can be seen
 * to change there and no hysteresis is needed. ▶ node checks/claims-a-bulb-is-drawn-to-its-size.mjs
 */
export const CARD_SIDE = Math.sqrt(Math.PI)
export const bulbPx = (radiusM, distanceM, focalPx) => (distanceM > 0 ? (radiusM * focalPx) / distanceM : Infinity)
export const bulbAsCard = (radiusM, distanceM, focalPx) => bulbPx(radiusM, distanceM, focalPx) < 1
/**
 * Which parts of a hung bulb draw: the full bulb (glass, socket, light core) at a pixel or more; under one, the card for its
 * LIGHT. A card stands in for the light ONLY: unlit, there is no light for it to stand in for, so the strand draws as it is,
 * its clear glass and dark sockets (Jacob, 2026-11-02, by day in Stage: "the strands aren't even showing when they're
 * turned off"; measured: cords alone, glass and sockets hidden by the card switch, the cards hidden as unlit).
 */
export const bulbParts = (lit, cards) => ({ core: lit && !cards, card: lit && cards, glass: !(lit && cards), socket: !(lit && cards) })
