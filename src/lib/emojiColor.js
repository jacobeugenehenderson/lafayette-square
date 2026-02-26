/**
 * Extract dominant color from an emoji using Material HCT color science.
 * Renders emoji to a small offscreen canvas, quantizes pixel data,
 * and returns an Hct object for tonal palette generation.
 */
import {
  QuantizerCelebi,
  Score,
  Hct,
  argbFromRgb,
} from '@material/material-color-utilities'

const cache = new Map()

// Neutral fallback for monochrome/symbol emoji
const NEUTRAL_HCT = Hct.from(260, 16, 50)

/**
 * Render emoji to 64×64 canvas and extract pixel ARGB values.
 */
function getEmojiPixels(emoji) {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.font = `${size - 8}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + 2)

  const { data } = ctx.getImageData(0, 0, size, size)
  const pixels = []
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue // skip transparent
    pixels.push(argbFromRgb(data[i], data[i + 1], data[i + 2]))
  }
  return pixels
}

/**
 * Extract the dominant theme-suitable color from an emoji.
 * @param {string} emoji — single emoji character
 * @returns {Hct} Material HCT color object
 */
export function extractEmojiColor(emoji) {
  if (cache.has(emoji)) return cache.get(emoji)

  const pixels = getEmojiPixels(emoji)
  if (pixels.length < 10) {
    cache.set(emoji, NEUTRAL_HCT)
    return NEUTRAL_HCT
  }

  const quantized = QuantizerCelebi.quantize(pixels, 4)
  const scored = Score.score(quantized)

  if (!scored.length) {
    cache.set(emoji, NEUTRAL_HCT)
    return NEUTRAL_HCT
  }

  const hct = Hct.fromInt(scored[0])
  cache.set(emoji, hct)
  return hct
}
