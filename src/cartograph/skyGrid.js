/**
 * skyGrid.js — kit-canonical seasonal sky data + the resolver that turns
 * (date, overrides, minute) into the 5-band hex tuple the shader reads.
 *
 * Architecture (2026-05-20 sky pivot, see meteorologist/NOTES.md ADR):
 *
 *   cartograph/proceduralSky.js           ← keyframes + math (kit canon)
 *   cartograph/pipeline/hydrate-anchor-cards.js  ← one-shot generator
 *   ────────────────────────────────────────────────────────────────
 *   ANCHOR_CARDS  (this file, static data)       ← procedural-hydrated +
 *                                                  Wren's artistic
 *                                                  deviation (Phase B)
 *   ────────────────────────────────────────────────────────────────
 *   buildMosaicForDate(date, overrides)          ← runtime resolver
 *     │   1. flanking anchors by dayOfYear
 *     │   2. lerp 24×5 base
 *     │   3. apply spatial Chebyshev × temporal envelope per override
 *     └── 24 × 5 hex grid
 *   resolveSkyAtMinute(channel, minute, …)        ← shader-facing wrapper:
 *                                                  buildMosaic + minute-
 *                                                  level hour lerp → 5
 *                                                  band-RGB triples
 *
 * Per-Look state lives in scene.json's `sky.overrides` (sparse). Defaults
 * to []; operators add `{ hour, band, hex }` cells via the Sky Builder.
 */
import SunCalc from 'suncalc'
import useCalendar from '../hooks/useCalendar.js'
import { INSTANCE } from '../instance.js'
import { buildAnchorCards, standardUtcOffsetHours } from '../../cartograph/proceduralSky.js'

export const SKY_BANDS = ['horizon', 'low', 'mid', 'high', 'sunGlow']
export const SKY_HOURS = 24

// Four cardinal year anchors at solstices + equinoxes. Aligned with
// useCalendar.season() boundaries and DawnTimeline's season chips.
export const SKY_ANCHORS = ['winter', 'spring', 'summer', 'autumn']
export const SKY_ANCHOR_DOY = {
  spring: 79,   // Mar 20
  summer: 172,  // Jun 21
  autumn: 265,  // Sep 22
  winter: 355,  // Dec 21
}
const DAYS_IN_YEAR = 365  // ignore leap-day in anchor math; ±1d is invisible

// ─────────────────────────────────────────────────────────────────────
// ANCHOR_CARDS — the 4 × 24 × 5 colour table, SAMPLED AT THIS TOWN'S LAT/LON.
//
// ⛔⛔ THIS WAS 118 LINES OF CHECKED-IN HEX, GENERATED ONCE AT LAFAYETTE SQUARE'S
// COORDINATES AND SHIPPED TO EVERY TOWN. Jacob, 2026-09-20: "the sky should be set to
// the lat long of its host map, another place where LS is totally inappropriate."
// In Łódź (51.75°N, 13° north of LS) the sun set ~90 minutes before the dome darkened,
// because the SUN was computed from the instance's real position while the SKY was
// painted from St. Louis's schedule. (BRIEF-ls-bleed-excision site 6.)
//
// ⭐ The colour canon itself never needed changing — `proceduralSkyAt` maps sun ALTITUDE
// to colour and takes no latitude, so it was always universal. Only the trajectory (which
// altitudes occur at which clock hour) was St. Louis's. See `buildAnchorCards` in
// cartograph/proceduralSky.js for the full reasoning.
//
// ⭐ PROVEN BYTE-IDENTICAL FOR LS: deriving at 38.6160/-90.2161/-6 reproduces all 480
// cells of the retired constant exactly — ▶ node checks/claims-sky-follows-its-town.mjs.
// The other towns move, which is the point: HPDM 73 cells, altadena 97, huron 120.
//
// ⚠️ Derived once at module load (~96 SunCalc calls), not per frame.
const _geo = INSTANCE.geography
export const ANCHOR_CARDS = buildAnchorCards(
  SunCalc, _geo.lat, _geo.lon, standardUtcOffsetHours(_geo.timezone),
)

// ─── Hex / RGB helpers (CPU-side; shader does its own) ────────────────
function hexToRGB(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

function rgbToHex(rgb) {
  const c = (v) => {
    const x = Math.max(0, Math.min(255, Math.round(v * 255)))
    return x.toString(16).padStart(2, '0')
  }
  return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2])
}

function lerpRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function lerpHex(a, b, t) {
  return rgbToHex(lerpRGB(hexToRGB(a), hexToRGB(b), Math.max(0, Math.min(1, t))))
}

// ─── Anchor / day math ────────────────────────────────────────────────
function dayOfYearFromDate(date) {
  const start = Date.UTC(date.getFullYear(), 0, 1)
  const cur = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((cur - start) / 86400000) + 1
}

// Given a day-of-year (1..365), return [anchorA, anchorB, t] where the
// date falls cyclically between A and B on the year ring (winter→spring
// wraps through year-end correctly).
export function flankingAnchors(doy) {
  const ring = SKY_ANCHORS
    .map(a => ({ a, doy: SKY_ANCHOR_DOY[a] }))
    .sort((x, y) => x.doy - y.doy)
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i]
    const next = ring[(i + 1) % ring.length]
    const startDoy = cur.doy
    let endDoy = next.doy
    if (endDoy <= startDoy) endDoy += DAYS_IN_YEAR
    let probe = doy
    if (probe < startDoy) probe += DAYS_IN_YEAR
    if (probe >= startDoy && probe < endDoy) {
      const span = endDoy - startDoy || 1
      return [cur.a, next.a, (probe - startDoy) / span]
    }
  }
  return ['summer', 'summer', 0]
}

// ─── Override envelope ────────────────────────────────────────────────
// Per-Look overrides live in scene.json's sky.overrides array as a sparse
// list of { hour, band, hex } cells. Each override paints:
//   - the cell itself at full strength (Chebyshev d=0)
//   - the 8 neighbor cells (d=1, king-move) at 50% blend
//   - no influence past d=1 (hard fall-off)
// Temporally, an override owns its full clock-hour [hour:00, hour:60) at
// strength 1.0; ramps in over the 15min before and ramps out over the
// 15min after. Hour distance wraps at midnight.

const OVERRIDE_RAMP_MINUTES = 15
const BAND_INDEX = Object.fromEntries(SKY_BANDS.map((b, i) => [b, i]))

function spatialWeight(h, b, overrideHour, overrideBand) {
  const bandIdx = BAND_INDEX[b]
  const ovBandIdx = BAND_INDEX[overrideBand]
  if (bandIdx == null || ovBandIdx == null) return 0
  let hourDist = Math.abs(h - overrideHour)
  if (hourDist > SKY_HOURS / 2) hourDist = SKY_HOURS - hourDist  // cyclic
  const bandDist = Math.abs(bandIdx - ovBandIdx)
  const d = Math.max(hourDist, bandDist)
  if (d === 0) return 1.0
  if (d === 1) return 0.5
  return 0
}

function temporalWeight(minuteWithinDay, overrideHour) {
  const ovStart = overrideHour * 60
  const ovEnd = ovStart + 60
  // Cyclic minute distance — handles overrides near midnight cleanly.
  const wrap = (a) => ((a % 1440) + 1440) % 1440
  const m = wrap(minuteWithinDay)
  const inside = (start, end) => {
    if (start <= end) return m >= start && m < end
    return m >= start || m < end  // wraps across midnight
  }
  if (inside(wrap(ovStart), wrap(ovEnd))) return 1.0
  // Ramp-in window [ovStart - RAMP, ovStart)
  const rampInStart = wrap(ovStart - OVERRIDE_RAMP_MINUTES)
  if (inside(rampInStart, wrap(ovStart))) {
    // Distance from ramp-in start
    let d = m - rampInStart
    if (d < 0) d += 1440
    return Math.max(0, Math.min(1, d / OVERRIDE_RAMP_MINUTES))
  }
  // Ramp-out window [ovEnd, ovEnd + RAMP)
  const rampOutEnd = wrap(ovEnd + OVERRIDE_RAMP_MINUTES)
  if (inside(wrap(ovEnd), rampOutEnd)) {
    let d = rampOutEnd - m
    if (d < 0) d += 1440
    return Math.max(0, Math.min(1, d / OVERRIDE_RAMP_MINUTES))
  }
  return 0
}

// ─── Build the 24×5 base mosaic for a date (anchor lerp only) ─────────
function buildBaseMosaic(date) {
  const doy = dayOfYearFromDate(date)
  const [anchorA, anchorB, t] = flankingAnchors(doy)
  const cardA = ANCHOR_CARDS[anchorA]
  const cardB = ANCHOR_CARDS[anchorB]
  const mosaic = new Array(SKY_HOURS)
  for (let h = 0; h < SKY_HOURS; h++) {
    const a = cardA[h]
    const b = cardB[h]
    const cell = {}
    for (const band of SKY_BANDS) {
      cell[band] = lerpHex(a[band], b[band], t)
    }
    mosaic[h] = cell
  }
  return mosaic
}

// ─── buildMosaicForDate — base + overrides at a specific minute ──────
// Returns a 24-tuple of 5-band cells representing the resolved sky
// across the full day for the given date+minute. Overrides apply per
// the spatial × temporal envelope above.
export function buildMosaicForDate(date, overrides = [], minuteWithinDay = null) {
  const base = buildBaseMosaic(date)
  if (!overrides || overrides.length === 0) return base
  // If no minute given, use noon — primarily for editor preview rendering.
  const m = minuteWithinDay != null
    ? minuteWithinDay
    : (date.getHours() * 60 + date.getMinutes())

  const out = base.map(cell => ({ ...cell }))
  for (const O of overrides) {
    if (typeof O?.hour !== 'number' || !SKY_BANDS.includes(O?.band) || typeof O?.hex !== 'string') continue
    const tw = temporalWeight(m, O.hour)
    if (tw <= 0) continue
    for (let h = 0; h < SKY_HOURS; h++) {
      for (const band of SKY_BANDS) {
        const sw = spatialWeight(h, band, O.hour, O.band)
        const w = sw * tw
        if (w <= 0) continue
        out[h][band] = lerpHex(out[h][band], O.hex, w)
      }
    }
  }
  return out
}

// ─── resolveSkyAtMinute — shader-facing entry point ──────────────────
// Returns { horizon, low, mid, high, sunGlow } as [r,g,b] floats (the
// shape CelestialBodies' useFrame writes into the shader uniforms).
// Reads dayOfYear from useCalendar if not supplied.
//
// Note: `slotMinutes` is kept in the signature for backward compatibility
// with the existing CelestialBodies call site, but is unused under the
// 24-hour grid (no slot-fraction interpolation; pure adjacent-hour lerp).
export function resolveSkyAtMinute(channel, minute, slotMinutes, dayOfYear) {
  const overrides = (channel && Array.isArray(channel.overrides)) ? channel.overrides : []

  // Construct the reference date from useCalendar (or supplied doy).
  // We need a Date for buildMosaicForDate's dayOfYear math. Using the
  // calendar's currentDate ensures consumers stay coherent with the
  // user's year-scrub position.
  let date
  if (dayOfYear != null) {
    const year = (typeof window !== 'undefined' ? new Date().getFullYear() : 2026)
    date = new Date(year, 0, 1)
    date.setDate(dayOfYear)
  } else {
    date = useCalendar.getState().currentDate
  }

  const mosaic = buildMosaicForDate(date, overrides, minute)

  // Lerp adjacent hour columns by sub-minute for smooth minute-of-day
  // continuity. Cell h covers [h*60, h*60+60); the cell midpoint at
  // h*60+30 is the "true" sample point, so lerp between h and h±1
  // based on offset from the midpoint.
  const wrapH = (x) => ((x % SKY_HOURS) + SKY_HOURS) % SKY_HOURS
  const m = ((minute % 1440) + 1440) % 1440
  const exactH = m / 60
  const aH = wrapH(Math.floor(exactH - 0.5))
  const bH = wrapH(aH + 1)
  let t = (exactH - 0.5) - Math.floor(exactH - 0.5)  // 0..1

  const a = mosaic[aH]
  const b = mosaic[bH]
  const out = {}
  for (const band of SKY_BANDS) {
    const ra = hexToRGB(a[band])
    const rb = hexToRGB(b[band])
    out[band] = lerpRGB(ra, rb, t)
  }
  return out
}

// ─── Migration ────────────────────────────────────────────────────────
// Three legacy shapes feed in:
//   (1) undefined / null / empty             → new {overrides: []}
//   (2) legacy 1-layer `{ values: { dawn: [...], sunrise: [...], ... } }`
//        (pre-bff87b5; LS's design.json today) → new {overrides: []}
//        Summer card IS what 1-layer represented; the procedural seed
//        already captures this. No deviations to salvage.
//   (3) bff87b5 4-anchor `{ values: { winter: {...}, ..., autumn: {...} } }`
//        → new {overrides: []}. The 4 anchor cards in scene.json were all
//        copies of the summer 1-layer (per bff87b5 migration logic);
//        nothing to salvage that isn't already in ANCHOR_CARDS_PROCEDURAL.
//
// Future: if operator-authored deviations from procedural seed appear
// in legacy design.json files, extend this to walk the cells, compare to
// `ANCHOR_CARDS_PROCEDURAL[anchor][hour][band]`, and emit overrides for
// non-matching cells. Not needed today; LS has no such deviations.
export function migrateSkyChannel(legacy) {
  if (legacy && Array.isArray(legacy.overrides)) {
    // Already-new shape — preserve overrides.
    return { overrides: legacy.overrides.slice() }
  }
  return { overrides: [] }
}
