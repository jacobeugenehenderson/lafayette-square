/**
 * windSheet — THE WIND, COMPUTED ONCE PER FRAME, READ BY EVERYTHING THAT MOVES IN IT (Jacob's design, 2026-10-04;
 * `docs/briefs/BRIEF-wind-sheet.md`, contract in `cartograph/ARCHITECTURE.md §8` "The wind sheet").
 *
 * ⭐ WHY ONE. The wind's STATE was shared, but every consumer computed its own noise from it (the overhead cards ran
 * 3-octave fBm several times per vertex per frame), and two of them didn't even read the same wind (water read the
 * live feed, the trees an Almanac rule). One field means a gust is one visible front across trees, grass and water,
 * and it can have MEMORY — a canopy that lags the gust and sways back — which per-vertex noise cannot.
 *
 * WHAT IT IS. A small half-float texture laid over the town's own disc (the stencil — never a constant), redrawn each
 * frame by `<WindSheet>` (src/components/WindSheet.jsx). Each texel holds the wind the canopy at that point FEELS:
 *   RG = the felt wind, world XZ, m/s, TO direction (sprung: it lags the air and overshoots on the way back)
 *   BA = its rate of change, m/s per s (zero where it is steady; the flick of a leaf when a gust arrives)
 * The air it springs toward is `wind-field.js#windAt` — the ONE definition, evaluated in GLSL (`WIND_FIELD_GLSL`).
 * The air's drift, direction and gusts come from `weatherAt` (the town's one weather), through `windStateOfWeather`.
 *
 * THE API — a material injects `WIND_SHEET_GLSL` in either stage and calls `bindWindSheet(shader)` in onBeforeCompile:
 *   vec4  windAt(vec2 xz)       — the field read (ONE sampler). .xy felt wind m/s · .z |felt wind| · .w |rate|.
 *                                 Intended: once per tree in the VERTEX shader (rigid lean, hula).
 *   vec2  windDetail(vec2 xz)   — analytic flutter in [-1, 1]², NO sampler: ~1.8 m cells drifting downwind with the
 *                                 town's wind. Intended: per FRAGMENT (flat cards). Scale it by your own gain × the
 *                                 strength you read from windAt (passed as a varying).
 *   float windSheetTime         — the sheet's clock (s), for a consumer's own periodic motion.
 * ⛔ A consumer that samples the sheet computes NO wind noise of its own — the detail is here, not in the consumer.
 *    Per-carrier floors and gains (metres per m/s) stay the consumer's: they are look, not weather.
 * ▶ node checks/claims-the-wind-has-one-authority.mjs · node checks/claims-the-wind-field-extent-is-the-towns.mjs
 */
import * as THREE from 'three'
import { WIND_FIELD } from './wind-field.js'
import { weatherAt } from './weatherAt.js'
import { deriveStorminess } from './weatherPresets.js'

// ── Sizing — derived from the field's own physics and the scene's disc ───────────────────────────────────────────
/** The gust's correlation length, metres — what the sheet's texels are counted against (wind-field.js). */
export const WIND_CORRELATION_M = 1 / WIND_FIELD.SPATIAL_NOISE_SCALE

/**
 * The sheet's extent and resolution. `extent` = {center:[x,z], radius} (a town's stencil, or a specimen's named
 * extent); `texelsPerCorrelation` = the surface's rung (qualityProfile). ⛔ No default for either: a missing extent
 * means the size is unknown, and the caller must say so.
 */
export function windSheetLayout(extent, texelsPerCorrelation, maxTextureSize) {
  if (!extent || !Number.isFinite(extent.radius) || extent.radius <= 0) throw new Error('[windSheet] ⛔ no extent — the town\'s stencil (or a specimen\'s named extent) is required; there is no default size')
  if (!Number.isFinite(texelsPerCorrelation) || texelsPerCorrelation <= 0) throw new Error('[windSheet] ⛔ the quality profile has no windTexelsPerCorrelation — the sheet\'s resolution is a per-surface rung')
  const mPerTexel = WIND_CORRELATION_M / texelsPerCorrelation
  const cx = extent.center?.[0] ?? 0, cz = extent.center?.[1] ?? 0
  // One texel of margin each side, so a bilinear read at the rim never clamps into the edge.
  const span = 2 * extent.radius + 2 * mPerTexel
  const size = Math.ceil(span / mPerTexel)
  if (maxTextureSize && size > maxTextureSize) throw new Error(`[windSheet] ⛔ a ${Math.round(span)} m town at ${mPerTexel.toFixed(2)} m/texel needs a ${size}² sheet, over this device's ${maxTextureSize}² limit — lower the rung for this surface`)
  return { origin: [cx - span / 2, cz - span / 2], span, size, mPerTexel, center: [cx, cz], radius: extent.radius }
}

// ── The wind from the weather — the one source (Jacob, 2026-10-04: "connect it to weather") ──────────────────────
/**
 * ⭐⭐ THE ONE CABLE (Jacob, 2026-10-04: "when the time comes we do not want to collect 500 loose cables to wire into
 * the Meteorologist; ideally we have 1"). Everything the sheet knows about the weather arrives in the object this
 * returns, and nowhere else. Today it is filled from weatherAt; when the Meteorologist has the final say it fills THIS
 * object, and no consumer changes. A new weather-driven property of the wind is a new FIELD here, never a new input.
 *
 * The air's state from the weather at this instant. Mirrors the atmosphere directive's own reading rule
 * (useAtmosphereDirective): the store's targets while the clock is live or a preset stands, else the forecast hour
 * through weatherAt. Returns { status, baseSpeedMps, baseDirection:[x,z] (TO), gustsScale, gustEnvelope, frontVel:[x,z] }.
 * status: 'live' | 'preset' | 'forecast' | 'no-weather' (no reading has arrived and no preset stands — said, not hidden).
 * ⛔ Outside the forecast weatherAt THROWS a WeatherRangeError; the caller holds its last state and says so (as the sky).
 */
export function windStateOfWeather(sky, clock) {
  let status, speed, dirDeg, gusts, storminess
  if (clock.isLive || sky.feedPaused) {
    if (!sky.feedPaused && sky.weatherAt == null) return { status: 'no-weather', ...CALM }
    status = sky.feedPaused ? 'preset' : 'live'
    speed = sky.windSpeedMs; dirDeg = sky.windDirDeg; gusts = sky.windGustsMs; storminess = sky.feedStorminess
  } else {
    if (!sky.hourlyForecast?.length) return { status: 'no-weather', ...CALM }
    const r = weatherAt(clock.currentTime, { live: false, hourly: sky.hourlyForecast })
    status = 'forecast'
    speed = r.windSpeedMs; dirDeg = r.windDirDeg; gusts = r.windGustsMs
    storminess = deriveStorminess(r.weatherCode ?? 0, r.precipitation ?? 0)   // the rule the sky's own targets use
  }
  speed = Number.isFinite(speed) ? Math.max(0, speed) : 0
  // Meteorological: degrees the wind blows FROM. The world is +X east, +Z SOUTH (bake-landscape.js), so the TO vector
  // is (east, south) = (−sin from, +cos from) — as WaterSurface has it. ⛔ NOT wind-field.js#resolveWindState's
  // (−sin, −cos): that mirrors the wind north↔south (measured 2026-10-04: a 284° wind blew the trees toward 76°,
  // not 104°). It stays until the trees migrate onto this sheet; the sheet does not inherit it.
  const from = ((dirDeg ?? 0) * Math.PI) / 180
  const dir = [-Math.sin(from), Math.cos(from)]
  // The gust spike's amplitude is how far the 10 m gust stands above the mean: the reading, not a knob.
  const gustsScale = Number.isFinite(gusts) ? Math.max(0, gusts - speed) : 0
  return {
    status, baseSpeedMps: speed, baseDirection: dir, gustsScale, gustEnvelope: 1,
    frontVel: [dir[0] * WIND_FIELD.GUST_FRONT_DEFAULT_MPS, dir[1] * WIND_FIELD.GUST_FRONT_DEFAULT_MPS],
    hasGusts: Number.isFinite(gusts),
    // The gust's shape (wind-field.js#gustLengths): a storm's gusts arrive as straight squall lines, an ordinary day's
    // as patches drifting downwind (Jacob, 2026-10-04: "this linear wind looks like a storm"). Lines at a
    // thunderstorm's storminess and above (weatherPresets.deriveStorminess gives a thunderstorm 0.8), patches at calm.
    gustShape: Math.min(1, Math.max(0, (storminess ?? 0) / STORM_LINES_AT)),
    storminess: storminess ?? 0,
  }
}
const STORM_LINES_AT = 0.8
/**
 * A SPECIMEN's wind — the Grove / Salon / a diorama, which have no town and so no weather. Named, like its extent:
 * `{ speedMps, dirDeg (FROM), gustsMps }` (gustsMps = the gust's peak, as the weather reports it). Same shape out as
 * windStateOfWeather, status 'specimen'. ⛔ Every field is required — a specimen that does not say its wind throws.
 */
export function windStateOfSpecimen(wind) {
  if (!wind || !['speedMps', 'dirDeg', 'gustsMps'].every((k) => Number.isFinite(wind[k]))) throw new Error('[windSheet] ⛔ a specimen extent needs a named wind {speedMps, dirDeg, gustsMps} — it has no weather to read, and there is no default breeze')
  const from = (wind.dirDeg * Math.PI) / 180
  const dir = [-Math.sin(from), Math.cos(from)]
  const speed = Math.max(0, wind.speedMps)
  return { status: 'specimen', baseSpeedMps: speed, baseDirection: dir, gustsScale: Math.max(0, wind.gustsMps - speed), gustEnvelope: 1,
    frontVel: [dir[0] * WIND_FIELD.GUST_FRONT_DEFAULT_MPS, dir[1] * WIND_FIELD.GUST_FRONT_DEFAULT_MPS], hasGusts: true,
    // A preview has no weather: its breeze is an ordinary day's, so its gusts are patches. Not part of the cable.
    gustShape: 0, storminess: 0 }
}
const CALM = { baseSpeedMps: 0, baseDirection: [1, 0], gustsScale: 0, gustEnvelope: 0, frontVel: [WIND_FIELD.GUST_FRONT_DEFAULT_MPS, 0], hasGusts: false, gustShape: 0, storminess: 0 }

// ── The canopy's spring — the memory (BRIEF step 3) ──────────────────────────────────────────────────────────────
/**
 * A damped spring per texel: the felt wind is pulled toward the air and carries momentum, so a gust BUILDS, the
 * canopy overshoots, and sways back. Units are seconds and a ratio — properties of a canopy, not of a town.
 *   period  — how long the canopy takes to swing once (s)
 *   damping — ζ; below 1 it overshoots (sways back), at 1 it settles without.
 */
export const WIND_SPRING = Object.freeze({ PERIOD_S: 2.6, DAMPING: 0.4 })

// ── The uniforms every consumer shares (the SAME objects — one update reaches every material) ─────────────────────
const _empty = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType)
_empty.needsUpdate = true
_empty.name = 'windSheet:unallocated'
export const windSheetUniforms = {
  uWindSheet:        { value: _empty },
  uWindSheetOrigin:  { value: new THREE.Vector2(0, 0) },
  uWindSheetSpan:    { value: 1 },
  windSheetTime:     { value: 0 },
  // windDetail's drift: an accumulated offset (wrapped on the lattice period, so it never loses float precision).
  uWindDetailOffset: { value: new THREE.Vector2(0, 0) },
}

/** Wire a material's compiled shader to the sheet. Call in onBeforeCompile, beside injecting WIND_SHEET_GLSL. */
export function bindWindSheet(shader) {
  if (!_mounted) throw new Error('[windSheet] ⛔ bindWindSheet with no <WindSheet> mounted — the field this material reads would never be drawn. Mount <WindSheet extent=…> (Town does) before the material compiles.')
  for (const k in windSheetUniforms) shader.uniforms[k] = windSheetUniforms[k]
}
let _mounted = 0
/** @internal — <WindSheet> marks itself mounted so a consumer with no sheet fails loudly instead of reading zeros. */
export function _markWindSheetMounted(delta) { _mounted += delta }

/** windDetail's cell, metres — the flutter's wavelength (today's overhead flutter: 0.55 cycles/m ⇒ ~1.8 m). */
export const WIND_DETAIL_CELL_M = 1.8
/** windDetail's drift, cells per second per m/s of wind — it advects downwind as fast as the wind is strong. */
export const WIND_DETAIL_DRIFT = 0.22

/** The chunk a consumer injects (vertex or fragment). Declares the uniforms itself — inject once per stage. */
export const WIND_SHEET_GLSL = /* glsl */`
  uniform sampler2D uWindSheet;
  uniform vec2  uWindSheetOrigin;
  uniform float uWindSheetSpan;
  uniform float windSheetTime;
  uniform vec2  uWindDetailOffset;
  vec4 windAt(vec2 xz) {
    vec4 s = texture2D(uWindSheet, (xz - uWindSheetOrigin) / uWindSheetSpan);
    return vec4(s.xy, length(s.xy), length(s.zw));
  }
  float wsHash(vec2 p) {
    p = p - floor(p * (1.0 / 289.0)) * 289.0;
    float h = mod((p.x * 34.0 + 1.0) * p.x, 289.0) + p.y;
    return mod((h * 34.0 + 1.0) * h, 289.0) / 289.0;
  }
  float wsNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wsHash(i), wsHash(i + vec2(1.0, 0.0)), u.x), mix(wsHash(i + vec2(0.0, 1.0)), wsHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec2 windDetail(vec2 xz) {
    vec2 p = xz * ${(1 / WIND_DETAIL_CELL_M).toFixed(4)} + uWindDetailOffset;
    vec2 q = p * 2.03 + 17.1;
    return vec2(wsNoise(p) * 0.67 + wsNoise(q) * 0.33, wsNoise(p + 41.7) * 0.67 + wsNoise(q + 41.7) * 0.33) * 2.0 - 1.0;
  }
`

// ── The readout — what the tools column's Wind sheet card shows (Jacob, 2026-10-04: "it should go in the same tools
// column as everything else"). <WindSheet> publishes; WindSheetCard reads. `overlay` is the card's "show on map".
let _readout = null
let _overlay = false
const _readoutSubs = new Set()
const _notify = () => { for (const cb of _readoutSubs) cb() }
/** @internal — <WindSheet> publishes a few times a second. */
export function _publishWindSheetReadout(r) { _readout = r; _notify() }
export function getWindSheetReadout() { return _readout }
export function getWindSheetOverlay() { return _overlay }
export function setWindSheetOverlay(on) { _overlay = !!on; _notify() }
/** Subscribe to readout and overlay changes; returns an unsubscribe. */
export function onWindSheetReadout(cb) { _readoutSubs.add(cb); return () => _readoutSubs.delete(cb) }
