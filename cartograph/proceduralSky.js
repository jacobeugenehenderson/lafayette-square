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
