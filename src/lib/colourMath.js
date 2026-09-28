/**
 * COLOUR MATH — one home for the kit's colour arithmetic: hex ↔ sRGB, WCAG relative luminance and contrast, and
 * OKLab / OKLCH (Björn Ottosson's, for perceptual distance and hue). Pure; used by the palette suggester
 * (src/cartograph/suggestFromMark.js), its checks, and the page reader (scripts/lib/read-page.mjs).
 */

/** '#rrggbb' → [r, g, b] 0..255. Throws on anything else. */
export function hexToRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a '#rrggbb' colour: ${JSON.stringify(hex)}`)
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
/** [r, g, b] 0..255 (clamped, rounded) → '#RRGGBB'. */
export const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()

// ── WCAG 2 ───────────────────────────────────────────────────────────────────────────────────────────────────
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
/** Relative luminance of [r, g, b] 0..255. */
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
/** WCAG contrast ratio of two luminances. */
export const contrastOfLuminances = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
/** WCAG contrast ratio of two colours ('#rrggbb' or [r, g, b]). */
export const contrast = (a, b) => contrastOfLuminances(luminance(typeof a === 'string' ? hexToRgb(a) : a), luminance(typeof b === 'string' ? hexToRgb(b) : b))

// ── OKLab / OKLCH ────────────────────────────────────────────────────────────────────────────────────────────
const toLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const fromLinear = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** [r, g, b] 0..255 → [L, a, b] OKLab. */
export function rgbToOklab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
/** [L, a, b] OKLab → [r, g, b] 0..255, UNCLAMPED (out-of-gamut channels fall outside 0..255 — see inGamut). */
export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(fromLinear)
}
export const inGamut = (rgb) => rgb.every((v) => v >= -0.5 && v <= 255.5)
/** OKLCH [L, C, h°] ↔ OKLab. */
export const oklchToOklab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]
export const oklabToOklch = ([L, a, b]) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
/** Perceptual distance (Euclidean in OKLab) between two colours ('#rrggbb' or [r, g, b]). */
export function deltaE(a, b) {
  const [x, y] = [a, b].map((c) => rgbToOklab(typeof c === 'string' ? hexToRgb(c) : c))
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
