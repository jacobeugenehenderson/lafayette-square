/**
 * Extract dominant color from an emoji as HSL.
 *
 * Uses SVG foreignObject → canvas drawImage to get color emoji pixels
 * (plain fillText renders monochrome on Apple platforms).
 * Async because it needs Image.onload for the SVG blob.
 *
 * Returns a promise of { h, s, l }. Results are cached per emoji.
 */

const cache = new Map()
const pending = new Map()

// Neutral fallback for monochrome/symbol emoji
const NEUTRAL = { h: 260, s: 25, l: 50 }

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
 * Render emoji via SVG foreignObject to get color pixels on all platforms.
 */
function renderEmojiToCanvas(emoji, size) {
  return new Promise((resolve) => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <foreignObject width="${size}" height="${size}">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${size - 8}px;line-height:${size}px;text-align:center;width:${size}px;height:${size}px;">${emoji}</div>
        </foreignObject>
      </svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(ctx.getImageData(0, 0, size, size).data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function analyzePixels(data) {
  if (!data) return NEUTRAL

  const pixels = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 100) continue
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2])
    // Keep chromatic pixels (skip grays and extremes)
    if (hsl.s > 12 && hsl.l > 8 && hsl.l < 92) pixels.push(hsl)
  }

  if (pixels.length < 5) return NEUTRAL

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
  return {
    h: binSums[maxBin].h / count,
    s: binSums[maxBin].s / count,
    l: binSums[maxBin].l / count,
  }
}

/**
 * Extract the dominant chromatic color from an emoji.
 * @param {string} emoji — single emoji character
 * @returns {Promise<{ h: number, s: number, l: number }>}
 */
export async function extractEmojiColor(emoji) {
  if (cache.has(emoji)) return cache.get(emoji)
  if (pending.has(emoji)) return pending.get(emoji)

  const p = renderEmojiToCanvas(emoji, 64).then(data => {
    const result = analyzePixels(data)
    cache.set(emoji, result)
    pending.delete(emoji)
    return result
  })
  pending.set(emoji, p)
  return p
}

/**
 * Synchronous version — returns cached result or NEUTRAL.
 * Use after an async extraction has completed, or as an instant fallback.
 */
export function extractEmojiColorSync(emoji) {
  return cache.get(emoji) || NEUTRAL
}
