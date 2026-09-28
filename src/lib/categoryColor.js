/**
 * A TOWN'S CATEGORY COLOURS — its neon, its chips — are ITS OWN (BRIEF-town-palette; Jacob, 2026-09-27: "the neon is
 * meant to convey things about the neighborhood, not the portal"). One module decides a category's colour, for the
 * renderer (NeonBands, SceneNeon), Stage's swatch defaults and the town manifest (taxonomy.categories[].color).
 *
 * THE CHANNEL is the Look's `materialColors.neon_<category>` — authored in Stage › Surfaces › Neon, baked into
 * scene.json. A category the Look did not author draws the kit's NEUTRAL default, which must READ AS UNAUTHORED (low
 * saturation, one lightness — a placeholder, visibly) and still tell categories apart. ⏳ Proposed; Jacob picks from a
 * render. ▶ node checks/claims-a-towns-colours-are-its-own.mjs
 *
 * ⏳ A scene baked before this module (no `neonAuthored` stamp) still draws the OLD kit palette — Lafayette Square's
 * Victorian decor, which every town inherited — until its scene is re-baked; the check lists those towns and this
 * branch is deleted when the list is empty (the labels.json v3 pattern). The old player (SidePanel, LandmarkMarkers,
 * COLOR_CLASSES) keeps tokens/categories.js's palette until cutover.
 */
import { CATEGORY_HEX as PRE_PALETTE_HEX, UNKNOWN_HEX } from '../tokens/categories.js'

/** The kit's neutral category colours: what a town that authored none draws. Not any town's decor. (Proposed.) */
export const NEUTRAL_CATEGORY_HEX = {
  dining:      '#B38888',
  historic:    '#B3A088',
  arts:        '#AFB388',
  parks:       '#98B388',
  shopping:    '#88B390',
  services:    '#88B3A7',
  hospitality: '#88A7B3',
  community:   '#8890B3',
  residential: '#9888B3',
  commercial:  '#AF88B3',
  industrial:  '#B388A0',
}

/** The category ids the Look authored a colour for (materialColors.neon_<id>). */
export function authoredCategories(materialColors) {
  return Object.keys(materialColors || {}).filter(k => k.startsWith('neon_') && materialColors[k]).map(k => k.slice(5))
}

/**
 * A category's colour for a town. `scene` is its baked scene.json (or { materialColors, neonAuthored: [] } for Stage's
 * live values). Unknown / unclassified → UNKNOWN_HEX (the absence of a category, never a member of the palette).
 */
export function categoryHex(category, scene) {
  const key = (category || '').replace(/^neon_/, '')
  if (!key) return UNKNOWN_HEX
  if (!Array.isArray(scene?.neonAuthored)) return PRE_PALETTE_HEX[key] || UNKNOWN_HEX   // ⏳ pre-palette bake
  return scene.materialColors?.[`neon_${key}`] || NEUTRAL_CATEGORY_HEX[key] || UNKNOWN_HEX
}

/** Is this category's colour the town's own (authored), or the kit's neutral default? */
export function isAuthoredCategory(category, scene) {
  return !!scene?.materialColors?.[`neon_${(category || '').replace(/^neon_/, '')}`]
}
