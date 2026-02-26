/**
 * Vignette presets — 4 compositions using the 3 colors extracted from an emoji.
 * Each returns a style object { background, boxShadow, borderColor } for
 * dimensional, layered rendering.
 *
 * Colors arrive as [light, mid, dark] from extractEmojiColors.
 *
 * v0 "Decorator"  — Refined interplay of all 3, subtle banded depth
 * v1 "Soft"       — Desaturated, pastel, airy glow
 * v2 "Vivid"      — Saturated, rich, jewel-like with contrasting band
 * v3 "Bold"       — Near-black base, neon accent ring from the palette
 */
import { extractEmojiColors } from './emojiColor'

export const PRESET_IDS = ['v0', 'v1', 'v2', 'v3']

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

/**
 * v0 "Decorator" — All 3 colors in a harmonious radial with a mid-tone band.
 */
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

/**
 * v1 "Soft" — Pastel, airy. Colors desaturated and lifted, gentle inner glow.
 */
function soft([light, mid]) {
  const center = hsl(light.h, light.s * 0.4, Math.min(light.l + 15, 85))
  const outer = hsl(mid.h, mid.s * 0.45, Math.min(mid.l + 5, 60))
  return {
    background: `radial-gradient(circle at 45% 40%, ${center} 0%, ${outer} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${hsla(light.h, light.s * 0.3, 90, 0.3)}, inset 0 1px 4px ${hsla(light.h, light.s * 0.5, light.l + 10, 0.4)}`,
    borderColor: hsl(mid.h, mid.s * 0.4, mid.l + 10),
  }
}

/**
 * v2 "Vivid" — Saturated, rich. Jewel-like with a contrasting inner band.
 */
function vivid([light, mid, dark]) {
  const center = hsl(light.h, Math.max(light.s, 55), Math.min(light.l, 60))
  const edge = hsl(dark.h, Math.max(dark.s, 40), Math.max(dark.l * 0.45, 10))
  return {
    background: `radial-gradient(circle at 40% 35%, ${center} 0%, ${edge} 100%)`,
    boxShadow: `inset 0 0 0 2.5px ${hsla(mid.h, Math.max(mid.s, 50), mid.l + 10, 0.5)}, inset 0 -3px 8px ${hsla(dark.h, dark.s, dark.l * 0.3, 0.6)}`,
    borderColor: hsl(mid.h, Math.max(mid.s, 40), Math.min(mid.l + 5, 55)),
  }
}

/**
 * v3 "Bold" — Near-black base, neon accent ring from the most saturated color.
 */
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

const generators = { v0: decorator, v1: soft, v2: vivid, v3: bold }

/**
 * Get full vignette style object for an emoji + preset.
 */
export function getVignetteStyle(emoji, presetId) {
  if (!emoji || !presetId || !generators[presetId]) return null
  const colors = extractEmojiColors(emoji)
  return generators[presetId](colors)
}

/**
 * Get all 4 swatch styles for picker preview.
 */
export function getVignetteSwatches(emoji) {
  if (!emoji) return PRESET_IDS.map(id => ({ id, style: null }))
  const colors = extractEmojiColors(emoji)
  return PRESET_IDS.map(id => ({ id, style: generators[id](colors) }))
}
