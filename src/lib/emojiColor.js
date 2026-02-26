/**
 * Extract dominant color from an emoji as HSL.
 * Renders emoji to a small offscreen canvas, bins pixel hues,
 * and returns { h, s, l } for decorative palette generation.
 */

const cache = new Map()

// Neutral fallback for monochrome/symbol emoji (muted blue-purple)
const NEUTRAL = { h: 260, s: 20, l: 50 }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max - min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

/**
 * Extract the dominant chromatic color from an emoji.
 * @param {string} emoji — single emoji character
 * @returns {{ h: number, s: number, l: number }}
 */
export function extractEmojiColor(emoji) {
  if (cache.has(emoji)) return cache.get(emoji)

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

  // Collect chromatic pixels (skip transparent and near-gray)
  const pixels = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (hsl.s > 15 && hsl.l > 10 && hsl.l < 90) pixels.push(hsl)
  }

  if (pixels.length < 5) {
    cache.set(emoji, NEUTRAL)
    return NEUTRAL
  }

  // Bin hues into 12 buckets (30° each), pick the most populated
  const bins = new Array(12).fill(0)
  const binSums = Array.from({ length: 12 }, () => ({ h: 0, s: 0, l: 0 }))
  for (const p of pixels) {
    const bin = Math.floor(p.h / 30) % 12
    bins[bin]++
    binSums[bin].h += p.h
    binSums[bin].s += p.s
    binSums[bin].l += p.l
  }

  let maxBin = 0
  for (let i = 1; i < 12; i++) {
    if (bins[i] > bins[maxBin]) maxBin = i
  }

  const count = bins[maxBin]
  const result = {
    h: binSums[maxBin].h / count,
    s: Math.min(binSums[maxBin].s / count, 85),
    l: Math.max(Math.min(binSums[maxBin].l / count, 65), 35),
  }

  cache.set(emoji, result)
  return result
}
