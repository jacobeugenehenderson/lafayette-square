/**
 * Extract top 3 color clusters from an emoji.
 *
 * Uses canvas fillText + getImageData. Works on Chrome (color emoji).
 * On platforms where emoji render monochrome to canvas (Safari),
 * falls back to a hue derived from the emoji's codepoint.
 *
 * Returns 3 HSL colors sorted lightest → darkest.
 */

const cache = new Map()

// Neutral fallback palette
const NEUTRAL = [
  { h: 260, s: 30, l: 65 },
  { h: 260, s: 25, l: 45 },
  { h: 260, s: 20, l: 25 },
]

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
 * Codepoint-based fallback hue for platforms that render monochrome emoji.
 * Deterministic — same emoji always gives same hue.
 */
function codepointHue(emoji) {
  let sum = 0
  for (const cp of emoji) {
    sum += cp.codePointAt(0)
  }
  return sum % 360
}

function buildFallbackPalette(emoji) {
  const h = codepointHue(emoji)
  return [
    { h, s: 50, l: 65 },
    { h: (h + 30) % 360, s: 45, l: 42 },
    { h: (h + 15) % 360, s: 35, l: 22 },
  ]
}

/**
 * Render emoji to canvas and extract pixels.
 */
function extractPixels(emoji) {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, size, size)
  ctx.font = `${size - 8}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + 2)
  return ctx.getImageData(0, 0, size, size).data
}

/**
 * Analyze pixel data into top 3 color clusters, sorted light → dark.
 */
function analyzePixels(data, emoji) {
  // Collect chromatic pixels
  const pixels = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 100) continue
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (hsl.s > 10 && hsl.l > 5 && hsl.l < 95) pixels.push(hsl)
  }

  // Not enough chromatic pixels — platform likely rendered monochrome
  if (pixels.length < 10) return buildFallbackPalette(emoji)

  // Bin hues into 12 buckets (30° each)
  const bins = new Array(12).fill(null).map(() => ({ count: 0, h: 0, s: 0, l: 0 }))
  for (const p of pixels) {
    const bin = Math.floor(p.h / 30) % 12
    bins[bin].count++
    bins[bin].h += p.h
    bins[bin].s += p.s
    bins[bin].l += p.l
  }

  // Sort by population, take top 3
  const ranked = bins
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(b => ({
      h: b.h / b.count,
      s: b.s / b.count,
      l: b.l / b.count,
    }))

  // Pad to 3 if fewer clusters found
  while (ranked.length < 3) {
    const base = ranked[ranked.length - 1]
    ranked.push({ h: (base.h + 30) % 360, s: base.s * 0.7, l: Math.max(base.l - 20, 10) })
  }

  // Sort light → dark
  ranked.sort((a, b) => b.l - a.l)
  return ranked
}

/**
 * Extract top 3 color clusters from an emoji (synchronous).
 * @param {string} emoji
 * @returns {[{h,s,l}, {h,s,l}, {h,s,l}]} light → dark
 */
export function extractEmojiColors(emoji) {
  if (cache.has(emoji)) return cache.get(emoji)
  const data = extractPixels(emoji)
  const result = analyzePixels(data, emoji)
  cache.set(emoji, result)
  return result
}
