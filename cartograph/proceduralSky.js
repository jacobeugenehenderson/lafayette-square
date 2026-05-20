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

// ─── Hex / RGB / lerp helpers ──────────────────────────────────────────
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
export function proceduralSkyAt(altitude, isDawn) {
  const alt = altitude

  const deep        = isDawn ? KEYFRAMES.dawnDeep        : KEYFRAMES.duskDeep
  const peak        = isDawn ? KEYFRAMES.dawnPeak        : KEYFRAMES.duskPeak
  const earlyGolden = isDawn ? KEYFRAMES.dawnEarlyGolden : KEYFRAMES.duskEarlyGolden
  const golden      = isDawn ? KEYFRAMES.dawnGolden     : KEYFRAMES.duskGolden

  let bands
  if (alt < -0.12) {
    bands = { ...KEYFRAMES.night }
  } else if (alt < -0.02) {
    bands = lerpBands(KEYFRAMES.night, deep, (alt + 0.12) / 0.10)
  } else if (alt < 0.03) {
    bands = lerpBands(deep, peak, (alt + 0.02) / 0.05)
  } else if (alt < 0.08) {
    bands = lerpBands(peak, earlyGolden, (alt - 0.03) / 0.05)
  } else if (alt < 0.22) {
    bands = lerpBands(earlyGolden, golden, (alt - 0.08) / 0.14)
  } else if (alt < 0.35) {
    bands = lerpBands(golden, KEYFRAMES.day, (alt - 0.22) / 0.13)
  } else {
    bands = { ...KEYFRAMES.day }
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
