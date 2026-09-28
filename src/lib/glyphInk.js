/**
 * GLYPH INK — an emoji drawn as THIS device draws it, and its inked pixels: the one home for the method (Warden's ruling,
 * 2026-09-28). The Ward's rating-mark field measurement and glyph fitting read it through the Town entry
 * (src/components/Town.jsx re-exports it); Stage's "Suggest from mark" reads the ink's colours
 * (src/cartograph/suggestFromMark.js).
 *
 * Measured per device because every platform draws emoji differently. ⛔ Browser-only (a canvas); a glyph that draws no
 * ink throws — it is never treated as an empty palette.
 */

export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

/** An inked pixel's alpha floor for its COLOUR: opaque cores only, so anti-aliased edges don't average toward black. */
export const COLOUR_ALPHA = 128

/**
 * The glyph drawn centred on a `size`-px square canvas at 0.75 of it (the vignette measurement's framing) →
 * its pixels with alpha ≥ `alpha`, as [r, g, b] 0..255.
 */
export function glyphInk(glyph, { size = 96, alpha = COLOUR_ALPHA } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.font = `${size * 0.75}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, size / 2, size / 2)
  const px = ctx.getImageData(0, 0, size, size).data
  const ink = []
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= alpha) ink.push([px[i], px[i + 1], px[i + 2]])
  if (!ink.length) throw new Error(`[glyphInk] "${glyph}" draws no ink on this device`)
  return ink
}
