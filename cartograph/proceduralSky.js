/**
 * proceduralSky.js — kit-level canonical procedural sky function.
 *
 * Pure-JS hex output (no THREE.Color). Portable to Node ESM so the build-
 * time hydration script (cartograph/pipeline/hydrate-anchor-cards.js) can
 * sample it without a browser bundle.
 *
 * History: this IS the function that produced the project's lovely summer
 * card. Lifted from `47c2760^:src/components/CelestialBodies.jsx` lines
 * 405–510 (GradientSky), reformulated as a pure data function over (sun
 * altitude, isDawn).
 *
 * Architecture role: hydrates the 4 static anchor cards in skyGrid.js at
 * build time. Runtime reads the cards + applies per-Look overrides; it
 * does NOT re-evaluate this function each frame. See
 * meteorologist/NOTES.md 2026-05-20 "Sky architecture pivot" ADR.
 */

// ─────────────────────────────────────────────────────────────────────
// Canonical sky color keyframes.
// Each keyframe is a 4-band tuple (horizon → low → mid → high/zenith).
// Dawn and dusk are intentionally distinct palettes — dawn is cooler /
// rose / lavender; dusk is warmer / amber / coral. Matches the original
// procedural shader's authored palette.
// ─────────────────────────────────────────────────────────────────────
export const KEYFRAMES = {
  // Shared night and day
  night:           { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508' },
  day:             { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0' },

  // Dawn ladder (cooler / rose / steel / lavender)
  dawnDeep:        { horizon: '#3a2838', low: '#30254a', mid: '#151838', high: '#0a0c1a' },
  dawnPeak:        { horizon: '#c07050', low: '#885578', mid: '#4a3878', high: '#141838' },
  dawnEarlyGolden: { horizon: '#dda065', low: '#b08088', mid: '#7068b0', high: '#223060' },
  dawnGolden:      { horizon: '#d0b888', low: '#a8a0a8', mid: '#7895c0', high: '#3a6aaa' },

  // Dusk ladder (warmer / amber / coral / purple)
  duskGolden:      { horizon: '#ccaa70', low: '#aa9088', mid: '#7090bb', high: '#3a68a8' },
  duskEarlyGolden: { horizon: '#dd8840', low: '#bb7065', mid: '#6858a0', high: '#1a2555' },
  duskPeak:        { horizon: '#cc6030', low: '#a05058', mid: '#4a3570', high: '#141835' },
  duskDeep:        { horizon: '#7a3828', low: '#40253a', mid: '#181535', high: '#0a0c1a' },
}

// ─────────────────────────────────────────────────────────────────────
// SEASON_TRANSFORMS — three HSV knobs per anchor. Applied to KEYFRAMES at
// sample time before the altitude-banded lerp, so each season's altitude
// trajectory walks through a palette-shifted copy of the canon. Summer is
// locked to identity (it IS the canonical palette). Winter / spring /
// autumn deviate per Wren's eye via these dials:
//
//   hueDeg: rotate the palette around the hue wheel (degrees, can wrap).
//           Subtle — altitude does most of the seasonal work.
//   sat:    multiply saturation. <1 desaturated, >1 boosted.
//   val:    multiply brightness. <1 darkened, >1 lifted.
//
// Phase B re-tuning loop:
//   1. edit the three numbers for a season here
//   2. node cartograph/pipeline/hydrate-anchor-cards.js > /tmp/cards.js
//   3. paste new ANCHOR_CARDS_PROCEDURAL into src/cartograph/skyGrid.js
//   4. reload Stage → eye-check → iterate
// ─────────────────────────────────────────────────────────────────────
export const SEASON_TRANSFORMS = {
  // Summer = identity. Canonical reference.
  summer: { hueDeg:   0, sat: 1.00, val: 1.00 },
  // Winter — cooler, desaturated, slight darken. Pale-hazy-clear-air feel.
  // Negative hueDeg pulls day-blue keyframe toward cyan; saturated dawn /
  // dusk peaks fade toward muted purples.
  winter: { hueDeg:  -8, sat: 0.78, val: 0.93 },
  // Spring — slight warm shift, near-full saturation, slight lift. Crisper
  // noon zenith; the warm hue rotation tinges dawn/dusk peaks more rosily.
  spring: { hueDeg:  +5, sat: 0.95, val: 1.02 },
  // Autumn — saturation push for vividness; small negative hue toward red
  // deepens dawn/dusk peaks toward crimson; slight darken for harvest tone.
  autumn: { hueDeg:  -6, sat: 1.18, val: 0.97 },
}

// ─── Hex / RGB / HSV helpers ──────────────────────────────────────────
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
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

export function lerpHex(a, b, t) {
  return rgbToHex(lerpRGB(hexToRGB(a), hexToRGB(b), Math.max(0, Math.min(1, t))))
}

// ─── HSV conversion + transform ───────────────────────────────────────
// HSV used because the season knobs (hue rotate, sat scale, val scale) map
// directly to operator intent. Round-trips RGB → HSV → transform → RGB
// per band per keyframe at hydration time.
function rgbToHSV([r, g, b]) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = mx === 0 ? 0 : d / mx
  return [h, s, mx]
}

function hsvToRGB([h, s, v]) {
  const c = v * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh < 1)      { r = c; g = x; b = 0 }
  else if (hh < 2) { r = x; g = c; b = 0 }
  else if (hh < 3) { r = 0; g = c; b = x }
  else if (hh < 4) { r = 0; g = x; b = c }
  else if (hh < 5) { r = x; g = 0; b = c }
  else             { r = c; g = 0; b = x }
  const m = v - c
  return [r + m, g + m, b + m]
}

function applyHSV(hex, transform) {
  const [h, s, v] = rgbToHSV(hexToRGB(hex))
  const h2 = h + (transform.hueDeg || 0)
  const s2 = Math.max(0, Math.min(1, s * (transform.sat ?? 1)))
  const v2 = Math.max(0, Math.min(1, v * (transform.val ?? 1)))
  return rgbToHex(hsvToRGB([h2, s2, v2]))
}

// Apply the season transform across every keyframe / band. Returns a
// fresh KEYFRAMES-shaped object the procedural lerp can read.
function transformKeyframes(kf, transform) {
  if (!transform || (transform.hueDeg === 0 && transform.sat === 1 && transform.val === 1)) {
    return kf  // identity short-circuit (summer)
  }
  const out = {}
  for (const name of Object.keys(kf)) {
    const f = kf[name]
    out[name] = {
      horizon: applyHSV(f.horizon, transform),
      low:     applyHSV(f.low,     transform),
      mid:     applyHSV(f.mid,     transform),
      high:    applyHSV(f.high,    transform),
    }
  }
  return out
}

function lerpBands(a, b, t) {
  return {
    horizon: lerpHex(a.horizon, b.horizon, t),
    low:     lerpHex(a.low,     b.low,     t),
    mid:     lerpHex(a.mid,     b.mid,     t),
    high:    lerpHex(a.high,    b.high,     t),
  }
}

// ─────────────────────────────────────────────────────────────────────
// proceduralSkyAt — the canonical altitude → 5-band-color function.
//
// `altitude` is sun altitude in radians (SunCalc.getPosition output).
// `isDawn` selects the dawn vs dusk palette: true when sun is rising
// (clockHour < solarNoonHour at the reference date).
//
// Returns { horizon, low, mid, high, sunGlow } as hex strings.
//
// Altitude breakpoints (radians, mirror the historical shader):
//   alt < -0.12          → night
//   alt < -0.02          → night → deep   (twilight begin)
//   alt <  0.03          → deep → peak    (electric twilight moment)
//   alt <  0.08          → peak → earlyGolden
//   alt <  0.22          → earlyGolden → golden
//   alt <  0.35          → golden → day
//   alt >= 0.35          → day
// ─────────────────────────────────────────────────────────────────────
export function proceduralSkyAt(altitude, isDawn, seasonTransform = SEASON_TRANSFORMS.summer) {
  const alt = altitude
  const tk = transformKeyframes(KEYFRAMES, seasonTransform)

  const deep        = isDawn ? tk.dawnDeep        : tk.duskDeep
  const peak        = isDawn ? tk.dawnPeak        : tk.duskPeak
  const earlyGolden = isDawn ? tk.dawnEarlyGolden : tk.duskEarlyGolden
  const golden      = isDawn ? tk.dawnGolden     : tk.duskGolden

  let bands
  if (alt < -0.12) {
    bands = { ...tk.night }
  } else if (alt < -0.02) {
    bands = lerpBands(tk.night, deep, (alt + 0.12) / 0.10)
  } else if (alt < 0.03) {
    bands = lerpBands(deep, peak, (alt + 0.02) / 0.05)
  } else if (alt < 0.08) {
    bands = lerpBands(peak, earlyGolden, (alt - 0.03) / 0.05)
  } else if (alt < 0.22) {
    bands = lerpBands(earlyGolden, golden, (alt - 0.08) / 0.14)
  } else if (alt < 0.35) {
    bands = lerpBands(golden, tk.day, (alt - 0.22) / 0.13)
  } else {
    bands = { ...tk.day }
  }

  // Sun glow — separate ladder, dawn rosier vs dusk amber.
  let sunGlow
  if (alt < -0.1) {
    sunGlow = '#000000'
  } else if (alt < 0.0) {
    const t = (alt + 0.1) / 0.1
    const warm = isDawn ? '#dd4433' : '#ff3318'
    const mid  = isDawn ? '#ee7755' : '#ff7733'
    const blended = lerpHex(warm, mid, t)
    // Scale by twilight ramp (multiply RGB by t) so sun glow fades in.
    const rgb = hexToRGB(blended).map(c => c * t)
    sunGlow = rgbToHex(rgb)
  } else if (alt < 0.08) {
    const t = alt / 0.08
    const from = isDawn ? '#ee7755' : '#ff7733'
    const to   = isDawn ? '#ffbb77' : '#ffaa55'
    sunGlow = lerpHex(from, to, t)
  } else if (alt < 0.3) {
    const t = (alt - 0.08) / 0.22
    const from = isDawn ? '#ffbb77' : '#ffaa55'
    sunGlow = lerpHex(from, '#ffeedd', t)
  } else {
    sunGlow = '#ffeedd'
  }

  return {
    horizon: bands.horizon,
    low:     bands.low,
    mid:     bands.mid,
    high:    bands.high,
    sunGlow,
  }
}

// ─────────────────────────────────────────────────────────────────────
// buildAnchorCards — THE SKY'S COLOUR TABLE, SAMPLED AT THE HOST MAP'S LAT/LON.
//
// ⛔⛔ THIS USED TO BE A STATIC 4×24×5 TABLE OF HEX STRINGS IN skyGrid.js, GENERATED
// ONCE AT LAFAYETTE SQUARE'S COORDINATES AND SHIPPED TO EVERY TOWN. Jacob, 2026-09-20:
// "the sky should be set to the lat long of its host map, another place where LS is
// totally inappropriate." (BRIEF-ls-bleed-excision site 6.)
//
// ⭐⭐ WHY THIS IS A SAMPLING FIX AND NOT A REWRITE — the thing to understand before
// touching it. `proceduralSkyAt(altitude, isDawn, transform)` TAKES NO LATITUDE. It maps
// SUN ALTITUDE → colour, and that relationship is the same everywhere on Earth: winter
// noon's low sun produces the colours summer reaches at 8am, automatically (the
// 2026-05-20 ADR's point 3). So the colour canon was ALREADY universal. What was
// LS-specific was only WHICH ALTITUDES OCCUR AT WHICH CLOCK HOUR — pure geometry, and
// the one thing a town's lat/lon answers.
// ⇒ The artistic layer (SEASON_TRANSFORMS) stays kit canon and does NOT vary by town.
// Only the trajectory is resampled. A town is not given a different palette; it is given
// its own sun.
//
// ⭐ The geometry half of the sky was never wrong: CelestialBodies already computes the
// true sun, moon, star field and celestial-pole tilt from INSTANCE.geography. The defect
// was that the sky was PAINTED on St. Louis's schedule while the sun stood in the right
// place — so in Łódź (51.75°N) the sun set ~90 min before the dome darkened.
//
// ⚠️ Deriving this is ~96 SunCalc calls + 96 colour evaluations, once at module load.
// It replaces ~118 lines of checked-in hex that could only ever be right for one town.
export const SKY_SEASONS = ['winter', 'spring', 'summer', 'autumn']

// Cardinal year anchors — ASTRONOMICAL dates, not "this town's summer". On 21 June the
// sun is at its northern extreme whether you are in St. Louis or Sydney; what differs is
// whether you CALL that day summer. The anchor slot keeps the astronomical name so the
// day-of-year interpolation in skyGrid.flankingAnchors stays simple; the hemisphere
// enters below, in which artistic TINT each date is painted with.
const REF_DATES = {
  winter: { year: 2026, month: 11, day: 21 },  // Dec 21 — solstice
  spring: { year: 2026, month:  2, day: 20 },  // Mar 20 — equinox
  summer: { year: 2026, month:  5, day: 21 },  // Jun 21 — solstice
  autumn: { year: 2026, month:  8, day: 22 },  // Sep 22 — equinox
}

/**
 * The 4 × 24 × 5 seasonal colour table for one location.
 *
 * @param SunCalc  the suncalc module (injected so this file stays dependency-free and
 *                 usable from both the browser bundle and a node script).
 * @param lat,lon  the HOST MAP's coordinates — `INSTANCE.geography` at runtime,
 *                 `cartograph/data/<scene>/geography.json` on the node side.
 * @param tzOffsetHours  the town's standard-time UTC offset, used only to place the
 *                 clock hours. ⛔ DST is deliberately ignored: these are cardinal
 *                 reference days for interpolation, not wall-clock predictions.
 */
export function buildAnchorCards(SunCalc, lat, lon, tzOffsetHours) {
  const hourClock = (ref, hour) => new Date(Date.UTC(
    ref.year, ref.month, ref.day, hour - tzOffsetHours, 0, 0,
  ))
  // ⛔⛔ THE HEMISPHERE ENTERS HERE, AND ONLY HERE. The sun ALTITUDES are already right
  // for any latitude — SunCalc handles that — so a southern town's 21 June card carries a
  // genuinely low winter sun without anyone asking. What does NOT follow automatically is
  // the artistic tint: SEASON_TRANSFORMS is keyed by season NAME, so Sydney's June would
  // otherwise get summer's warm, saturated wash laid over a winter sky.
  // ⇒ Below the equator the tints swap, exactly as `useCalendar.seasonFromDoy` already
  // inverts the season names for `lat < 0`. Two places that must agree; they now do.
  // (The old static table could not express this at all — it was one northern town's
  // output, so a southern install had a summer calendar against a winter sky.)
  const southern = lat < 0
  const FLIP = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }
  const cards = {}
  for (const season of SKY_SEASONS) {
    const ref = REF_DATES[season]
    const transform = SEASON_TRANSFORMS[southern ? FLIP[season] : season]
    // Solar noon splits the day into dawn-side and dusk-side, which is what selects the
    // warm keyframe pair. It MOVES with longitude, so it has to be recomputed per town —
    // hardcoding it is the same class of bug as hardcoding the latitude.
    const times = SunCalc.getTimes(hourClock(ref, 12), lat, lon)
    const solarNoonLocalH = times.solarNoon.getUTCHours() + tzOffsetHours
      + times.solarNoon.getUTCMinutes() / 60
    const card = []
    for (let h = 0; h < 24; h++) {
      const sunPos = SunCalc.getPosition(hourClock(ref, h), lat, lon)
      card.push(proceduralSkyAt(sunPos.altitude, h < solarNoonLocalH, transform))
    }
    cards[season] = card
  }
  return cards
}

/**
 * The STANDARD-time UTC offset, in hours, for an IANA timezone name.
 *
 * ⛔ DERIVED FROM THE ZONE, NEVER A LOOKUP TABLE. A hardcoded
 * `{'America/Chicago': -6, …}` map is a skip list: it is correct for the towns
 * someone happened to list and silently wrong for town #2 (`CLAUDE.md` Layer 0).
 *
 * ⭐ THE RULE, and it is hemisphere-agnostic: DST always moves the clock FORWARD,
 * so of a zone's two offsets the STANDARD one is the smaller. Sampling January and
 * July catches both hemispheres without asking which one we are in — northern zones
 * are standard in January, southern in July, and a zone with no DST returns the same
 * number twice.
 *
 * ⚠️ Standard time on purpose, not an oversight. These are four cardinal reference
 * days whose cards get interpolated across the year; pinning them to one offset keeps
 * the anchor set internally consistent. A DST-aware sampling would shift the summer
 * card an hour against the other three and make the interpolation lumpy.
 */
export function standardUtcOffsetHours(timeZone) {
  const offsetAt = (month) => {
    const d = new Date(Date.UTC(2026, month, 15, 12, 0, 0))
    // 'longOffset' yields e.g. "GMT-6" / "GMT-05:30" / "GMT" — parse both forms.
    const s = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'GMT'
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s)
    if (!m) return 0
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] || 0) / 60)
  }
  return Math.min(offsetAt(0), offsetAt(6))
}
