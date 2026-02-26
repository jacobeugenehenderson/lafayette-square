/**
 * Vignette presets — 3 tonal palette styles derived from emoji color via HCT.
 * Each produces a CSS radial-gradient string for use as background.
 */
import { Hct } from '@material/material-color-utilities'
import { extractEmojiColor } from './emojiColor'

export const PRESET_IDS = ['v0', 'v1', 'v2']

function hctToRgb(h, c, t) {
  const argb = Hct.from(h, c, t).toInt()
  const r = (argb >> 16) & 0xff
  const g = (argb >> 8) & 0xff
  const b = argb & 0xff
  return `rgb(${r},${g},${b})`
}

/**
 * v0 "Deep" — saturated center, dark edge. Rich, warm.
 */
function deep(hct) {
  const h = hct.hue
  const c = Math.max(hct.chroma, 30)
  const center = hctToRgb(h, c, 55)
  const edge = hctToRgb(h, c * 0.8, 15)
  return `radial-gradient(circle, ${center}, ${edge})`
}

/**
 * v1 "Soft" — light center, medium edge. Airy, pastel.
 */
function soft(hct) {
  const h = hct.hue
  const c = Math.max(hct.chroma * 0.6, 20)
  const center = hctToRgb(h, c, 85)
  const edge = hctToRgb(h, c, 45)
  return `radial-gradient(circle, ${center}, ${edge})`
}

/**
 * v2 "Bold" — base hue center, complementary hue edge. High contrast.
 */
function bold(hct) {
  const h = hct.hue
  const c = Math.max(hct.chroma, 35)
  const center = hctToRgb(h, c, 50)
  const edge = hctToRgb((h + 180) % 360, c * 0.6, 20)
  return `radial-gradient(circle, ${center}, ${edge})`
}

const generators = { v0: deep, v1: soft, v2: bold }

/**
 * Get CSS radial-gradient background for an emoji + preset combo.
 * @param {string} emoji
 * @param {string} presetId — 'v0' | 'v1' | 'v2'
 * @returns {string} CSS background value
 */
export function getVignetteBackground(emoji, presetId) {
  if (!emoji || !presetId || !generators[presetId]) return 'none'
  const hct = extractEmojiColor(emoji)
  return generators[presetId](hct)
}

/**
 * Get all 3 vignette swatches for an emoji (for picker preview).
 * @param {string} emoji
 * @returns {{ id: string, background: string }[]}
 */
export function getVignetteSwatches(emoji) {
  if (!emoji) return PRESET_IDS.map(id => ({ id, background: 'none' }))
  const hct = extractEmojiColor(emoji)
  return PRESET_IDS.map(id => ({ id, background: generators[id](hct) }))
}
