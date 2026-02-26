/**
 * Vignette presets — 8 compositions using the 3 colors extracted from an emoji.
 * Each returns a style object { background, boxShadow, borderColor }.
 *
 * Colors arrive as [light, mid, dark] from extractEmojiColors.
 *
 * ── Coordinated (use the emoji's own palette) ──
 * v0 "Decorator"  — Refined interplay of all 3, subtle banded depth
 * v1 "Soft"       — Desaturated, pastel, airy glow
 * v2 "Vivid"      — Saturated, rich, jewel-like with contrasting band
 * v3 "Bold"       — Near-black base, neon accent ring
 *
 * ── Contrast (introduce hues the emoji doesn't have) ──
 * v4 "Complement" — Opposite hue, emoji pops against its inverse
 * v5 "Cool"       — Cool blue-violet wash regardless of emoji color
 * v6 "Warm"       — Warm amber-rose wash regardless of emoji color
 * v7 "Midnight"   — Deep navy-black with a complementary neon edge
 */
import { extractEmojiColors } from './emojiColor'

export const PRESET_IDS = ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s))
  l = Math.max(0, Math.min(100, l))
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

function hsla(h, s, l, a) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s))
  l = Math.max(0, Math.min(100, l))
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`
}

/** Average hue of the palette (for deriving contrast hues) */
function avgHue([light, mid, dark]) {
  // Circular mean of hues
  const toRad = d => d * Math.PI / 180
  const sinSum = Math.sin(toRad(light.h)) + Math.sin(toRad(mid.h)) + Math.sin(toRad(dark.h))
  const cosSum = Math.cos(toRad(light.h)) + Math.cos(toRad(mid.h)) + Math.cos(toRad(dark.h))
  return ((Math.atan2(sinSum, cosSum) * 180 / Math.PI) + 360) % 360
}

// ── Coordinated presets ─────────────────────────────────────────────

function decorator([light, mid, dark]) {
  const center = hsl(light.h, light.s * 0.7, Math.min(light.l, 72))
  const band = hsl(mid.h, mid.s * 0.8, mid.l)
  const edge = hsl(dark.h, dark.s * 0.9, Math.max(dark.l * 0.6, 12))
  return {
    background: `radial-gradient(circle at 40% 35%, ${center} 0%, ${band} 55%, ${edge} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${hsla(mid.h, mid.s * 0.6, mid.l + 15, 0.35)}, inset 0 -2px 6px ${hsla(dark.h, dark.s, dark.l * 0.4, 0.5)}`,
    borderColor: hsl(dark.h, dark.s * 0.5, dark.l * 0.5),
  }
}

function soft([light, mid]) {
  const center = hsl(light.h, light.s * 0.4, Math.min(light.l + 15, 85))
  const outer = hsl(mid.h, mid.s * 0.45, Math.min(mid.l + 5, 60))
  return {
    background: `radial-gradient(circle at 45% 40%, ${center} 0%, ${outer} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${hsla(light.h, light.s * 0.3, 90, 0.3)}, inset 0 1px 4px ${hsla(light.h, light.s * 0.5, light.l + 10, 0.4)}`,
    borderColor: hsl(mid.h, mid.s * 0.4, mid.l + 10),
  }
}

function vivid([light, mid, dark]) {
  const center = hsl(light.h, Math.max(light.s, 55), Math.min(light.l, 60))
  const edge = hsl(dark.h, Math.max(dark.s, 40), Math.max(dark.l * 0.45, 10))
  return {
    background: `radial-gradient(circle at 40% 35%, ${center} 0%, ${edge} 100%)`,
    boxShadow: `inset 0 0 0 2.5px ${hsla(mid.h, Math.max(mid.s, 50), mid.l + 10, 0.5)}, inset 0 -3px 8px ${hsla(dark.h, dark.s, dark.l * 0.3, 0.6)}`,
    borderColor: hsl(mid.h, Math.max(mid.s, 40), Math.min(mid.l + 5, 55)),
  }
}

function bold([light, mid, dark]) {
  const accent = [light, mid, dark].reduce((a, b) => b.s > a.s ? b : a)
  const neon = hsl(accent.h, Math.min(accent.s * 1.3, 100), Math.min(accent.l + 15, 65))
  const neonGlow = hsla(accent.h, Math.min(accent.s * 1.3, 100), Math.min(accent.l + 15, 65), 0.4)
  const base = hsl(dark.h, dark.s * 0.3, 8)
  const tint = hsl(dark.h, dark.s * 0.4, 14)
  return {
    background: `radial-gradient(circle at 45% 40%, ${tint} 0%, ${base} 100%)`,
    boxShadow: `inset 0 0 0 2px ${neon}, 0 0 6px ${neonGlow}, inset 0 0 8px ${neonGlow}`,
    borderColor: 'transparent',
  }
}

// ── Contrast presets ────────────────────────────────────────────────

/** v4 "Complement" — opposite hue, the emoji pops against its inverse */
function complement(colors) {
  const h = avgHue(colors)
  const opp = (h + 180) % 360
  const center = hsl(opp, 45, 55)
  const edge = hsl(opp + 20, 40, 18)
  return {
    background: `radial-gradient(circle at 40% 35%, ${center} 0%, ${edge} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${hsla(opp, 35, 65, 0.4)}, inset 0 -2px 6px ${hsla(opp + 20, 30, 10, 0.5)}`,
    borderColor: hsl(opp, 30, 30),
  }
}

/** v5 "Cool" — blue-violet wash, works as contrast for warm emoji */
function cool() {
  const center = hsl(230, 40, 60)
  const edge = hsl(260, 45, 18)
  return {
    background: `radial-gradient(circle at 40% 35%, ${center} 0%, ${hsl(245, 42, 35)} 60%, ${edge} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${hsla(220, 35, 70, 0.3)}, inset 0 -2px 6px ${hsla(270, 40, 12, 0.5)}`,
    borderColor: hsl(250, 35, 25),
  }
}

/** v6 "Warm" — amber-rose wash, works as contrast for cool emoji */
function warm() {
  const center = hsl(25, 55, 60)
  const edge = hsl(345, 45, 18)
  return {
    background: `radial-gradient(circle at 40% 35%, ${center} 0%, ${hsl(5, 48, 35)} 60%, ${edge} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${hsla(30, 45, 70, 0.3)}, inset 0 -2px 6px ${hsla(350, 40, 12, 0.5)}`,
    borderColor: hsl(350, 35, 22),
  }
}

/** v7 "Midnight" — deep navy-black with a complementary neon edge glow */
function midnight(colors) {
  const h = avgHue(colors)
  const opp = (h + 180) % 360
  const neon = hsl(opp, 80, 60)
  const neonGlow = hsla(opp, 80, 60, 0.35)
  return {
    background: `radial-gradient(circle at 45% 40%, ${hsl(225, 30, 14)} 0%, ${hsl(230, 25, 6)} 100%)`,
    boxShadow: `inset 0 0 0 2px ${neon}, 0 0 6px ${neonGlow}, inset 0 0 8px ${neonGlow}`,
    borderColor: 'transparent',
  }
}

const generators = {
  v0: decorator, v1: soft, v2: vivid, v3: bold,
  v4: complement, v5: cool, v6: warm, v7: midnight,
}

/**
 * Get full vignette style object for an emoji + preset.
 */
export function getVignetteStyle(emoji, presetId) {
  if (!emoji || !presetId || !generators[presetId]) return null
  const colors = extractEmojiColors(emoji)
  return generators[presetId](colors)
}

/**
 * Get all 8 swatch styles for picker preview.
 */
export function getVignetteSwatches(emoji) {
  if (!emoji) return PRESET_IDS.map(id => ({ id, style: null }))
  const colors = extractEmojiColors(emoji)
  return PRESET_IDS.map(id => ({ id, style: generators[id](colors) }))
}
