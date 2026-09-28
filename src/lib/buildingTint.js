/**
 * THE BUILDING TINT — one module, imported by the bake (cartograph/bake-buildings.js) AND the player
 * (SlabBuildings.jsx), so a live palette drag and a re-bake compute the SAME colour (BRIEF-live-building-palette).
 * ▶ node checks/claims-live-palette-equals-the-bake.mjs — recomputes every town's baked colours from this module.
 *
 * Precedence, per building: a FIXED colour (an override the operator set on that building) → the wall material's
 * own palette (`wallPalettes[wallMaterial]`, when it has swatches) → the town's base `buildingPalette`, the slot
 * `hashStr(id) % length`. The roof takes a desaturated, darkened version of the wall tint per material; a flat
 * roof is a near-black constant with no tint. Colours are sRGB 0..1, exactly as the slab stores them.
 * Pure: no DOM, no three.js — the bake runs it under Node.
 */

export const DEFAULT_PALETTE = [
  '#dcdcdc', '#a0522d', '#cd853f', '#8b2500',
  '#d2b48c', '#778899', '#8b4513', '#a52a2a',
  '#f5deb3', '#696969', '#b22222', '#808080',
]
/** The flat roof: near-black, untinted, stored raw (the shader uses it as-is). */
export const FLAT_ROOF_RGB = [0.04, 0.04, 0.045]

/** Deterministic string hash — the slot a building draws from a palette. */
export function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** `#rrggbb` → [r, g, b] in 0..1. */
export function parseHex(hex) {
  const h = (hex || '#888888').replace('#', '')
  return [parseInt(h.substring(0, 2), 16) / 255, parseInt(h.substring(2, 4), 16) / 255, parseInt(h.substring(4, 6), 16) / 255]
}

export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h, s, l]
}
export function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l]
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
}

/** Roof tint: the wall tint's hue, desaturated and darkened per roof material. */
export function roofTintFor(buildingColorHex, roofMat) {
  const [r, g, b] = parseHex(buildingColorHex)
  const [h, s] = rgbToHsl(r, g, b)
  const lum = roofMat === 'slate' ? 0.15 : roofMat === 'metal' ? 0.28 : 0.20
  return hslToRgb(h, s * 0.3, lum)
}

/**
 * Where a building's wall tint comes from: { fixed: '#hex' } when an override set it, else the palette it draws
 * from — { palette: <wallMaterial> } when that material has its own swatches, { palette: 'base' } otherwise.
 * The bake stamps this in the index (buildings.json v3); the player reads it.
 */
export function tintSourceFor({ fixedColor = null, wallMaterial }, { wallPalettes = {} } = {}) {
  if (fixedColor) return { fixed: fixedColor }
  return { palette: wallPalettes?.[wallMaterial]?.length ? wallMaterial : 'base' }
}

/** The wall tint hex for a building, from its tint source and the town's palettes (live or baked). */
export function wallTintHex(id, tint, { palette, wallPalettes = {} }) {
  if (tint?.fixed) return tint.fixed
  const base = palette?.length ? palette : DEFAULT_PALETTE
  const pal = tint?.palette && tint.palette !== 'base' && wallPalettes?.[tint.palette]?.length ? wallPalettes[tint.palette] : base
  return pal[hashStr(id) % pal.length]
}

/** A building's colours as the slab stores them (sRGB 0..1): { wall, roof }. */
export function buildingColors(id, tint, roofMaterial, palettes) {
  const hex = wallTintHex(id, tint, palettes)
  return { wall: parseHex(hex), roof: roofMaterial === 'flat' ? FLAT_ROOF_RGB : roofTintFor(hex, roofMaterial) }
}
