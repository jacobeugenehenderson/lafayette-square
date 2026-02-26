/**
 * Vignette presets — 3 decorative styles derived from emoji's dominant hue.
 * Pure HSL math, no external dependencies.
 *
 * v0 "Decorator" — soft watercolor wash. The tasteful default.
 * v1 "Vivid"     — saturated center, dark edge. Bold.
 * v2 "Complement" — base hue center, shifted hue edge. Artistic.
 */
import { extractEmojiColor, extractEmojiColorSync } from './emojiColor'

export const PRESET_IDS = ['v0', 'v1', 'v2']

function hsl(h, s, l) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(Math.max(0, s))}%, ${Math.round(Math.max(0, Math.min(100, l)))}%)`
}

/**
 * v0 "Decorator" — gentle wash, enough color to read clearly.
 */
function decorator({ h, s }) {
  const sat = Math.max(s, 40)
  const center = hsl(h, sat * 0.55, 68)
  const edge = hsl(h, sat * 0.65, 30)
  return `radial-gradient(circle, ${center}, ${edge})`
}

/**
 * v1 "Vivid" — rich, punchy. High saturation.
 */
function vivid({ h, s }) {
  const sat = Math.max(s, 50)
  const center = hsl(h, sat * 0.95, 52)
  const edge = hsl(h, sat * 0.8, 16)
  return `radial-gradient(circle, ${center}, ${edge})`
}

/**
 * v2 "Complement" — base hue center, 150° shifted edge. Unexpected pairing.
 */
function complement({ h, s }) {
  const sat = Math.max(s, 45)
  const center = hsl(h, sat * 0.8, 48)
  const edge = hsl(h + 150, sat * 0.55, 18)
  return `radial-gradient(circle, ${center}, ${edge})`
}

const generators = { v0: decorator, v1: vivid, v2: complement }

/**
 * Get CSS radial-gradient background for an emoji + preset combo.
 * Uses sync (cached) color — call warmUpEmojiColor() first for accuracy.
 */
export function getVignetteBackground(emoji, presetId) {
  if (!emoji || !presetId || !generators[presetId]) return 'none'
  const color = extractEmojiColorSync(emoji)
  return generators[presetId](color)
}

/**
 * Get all 3 vignette swatches for an emoji.
 * Uses sync (cached) color.
 */
export function getVignetteSwatches(emoji) {
  if (!emoji) return PRESET_IDS.map(id => ({ id, background: 'none' }))
  const color = extractEmojiColorSync(emoji)
  return PRESET_IDS.map(id => ({ id, background: generators[id](color) }))
}

/**
 * Warm up the color cache for an emoji (async).
 * Call this when an emoji is selected, then re-render once resolved.
 * @returns {Promise<{ h, s, l }>}
 */
export async function warmUpEmojiColor(emoji) {
  return extractEmojiColor(emoji)
}
