/**
 * Vignette presets — 3 decorative styles derived from emoji's dominant hue.
 * Pure HSL math, no external dependencies.
 *
 * v0 "Decorator" — subtle watercolor wash. The tasteful default.
 * v1 "Vivid"     — saturated center, dark edge. Bold and warm.
 * v2 "Complement" — base hue center, split-complement edge. Artistic.
 */
import { extractEmojiColor } from './emojiColor'

export const PRESET_IDS = ['v0', 'v1', 'v2']

function hsl(h, s, l) {
  return `hsl(${Math.round(h % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

/**
 * v0 "Decorator" — gentle, low-saturation wash. Tasteful default.
 */
function decorator({ h, s }) {
  const center = hsl(h, Math.min(s * 0.45, 35), 72)
  const edge = hsl(h, Math.min(s * 0.5, 40), 38)
  return `radial-gradient(circle, ${center}, ${edge})`
}

/**
 * v1 "Vivid" — rich, saturated. Punchy.
 */
function vivid({ h, s }) {
  const center = hsl(h, Math.min(s * 1.1, 80), 55)
  const edge = hsl(h, Math.min(s * 0.9, 70), 18)
  return `radial-gradient(circle, ${center}, ${edge})`
}

/**
 * v2 "Complement" — base hue center, shifted hue edge. Unexpected pairing.
 */
function complement({ h, s }) {
  const center = hsl(h, Math.min(s * 0.8, 65), 50)
  const edge = hsl((h + 150) % 360, Math.min(s * 0.5, 45), 22)
  return `radial-gradient(circle, ${center}, ${edge})`
}

const generators = { v0: decorator, v1: vivid, v2: complement }

/**
 * Get CSS radial-gradient background for an emoji + preset combo.
 * @param {string} emoji
 * @param {string} presetId — 'v0' | 'v1' | 'v2'
 * @returns {string} CSS background value
 */
export function getVignetteBackground(emoji, presetId) {
  if (!emoji || !presetId || !generators[presetId]) return 'none'
  const color = extractEmojiColor(emoji)
  return generators[presetId](color)
}

/**
 * Get all 3 vignette swatches for an emoji (for picker preview).
 * @param {string} emoji
 * @returns {{ id: string, background: string }[]}
 */
export function getVignetteSwatches(emoji) {
  if (!emoji) return PRESET_IDS.map(id => ({ id, background: 'none' }))
  const color = extractEmojiColor(emoji)
  return PRESET_IDS.map(id => ({ id, background: generators[id](color) }))
}
