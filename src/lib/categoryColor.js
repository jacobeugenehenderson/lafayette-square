/**
 * A TOWN'S CATEGORY COLOURS — its neon, its chips — are ITS OWN (BRIEF-town-palette; Jacob, 2026-09-27: "the neon is
 * meant to convey things about the neighborhood, not the portal"). One module decides them, for the renderer
 * (NeonBands, SceneNeon), Stage's swatches and the town manifest (taxonomy.categories[].neon / .detail).
 *
 * ⭐ ONE SOURCE PER CATEGORY, TWO FORMS DERIVED FROM IT (Jacob, 2026-09-28: "they are the bases of the neon lights that
 * go along with them; perhaps the neon is full saturation and the pastels are the detail colors"):
 *   · `neon`   — the tube on the map: the Look's authored hex EXACTLY, else the neutral hue at full saturation;
 *   · `detail` — the pastel for the Ward's chips, dots and accents: the neon's hue, softened. Derived, never stored.
 * THE SOURCE is the Look's `materialColors.neon_<category>` (Stage › Surfaces › Neon, baked into scene.json); a category
 * the Look did not author takes the kit's NEUTRAL hue — one hue per category, evenly spaced, so categories stay apart;
 * its detail form reads as unauthored (a pastel placeholder). ▶ node checks/claims-a-towns-colours-are-its-own.mjs
 *
 * ⏳ A scene baked before the town palette (no `neonAuthored` stamp) still draws the OLD kit palette — Lafayette
 * Square's Victorian decor, which every town inherited — until its scene is re-baked; the check lists those towns and
 * that branch is deleted when the list is empty. The old player (SidePanel, LandmarkMarkers, COLOR_CLASSES) keeps
 * tokens/categories.js's palette until cutover.
 */
import { CATEGORY_HEX as PRE_PALETTE_HEX, UNKNOWN_HEX } from '../tokens/categories.js'
import { parseHex, rgbToHsl, hslToRgb } from './buildingTint.js'

/** The kit's neutral hue (degrees) per category: 11 evenly spaced — a town that authored none. Not any town's. */
export const NEUTRAL_CATEGORY_HUE = {
  dining: 0, historic: 33, arts: 65, parks: 98, shopping: 131, services: 164,
  hospitality: 196, community: 229, residential: 262, commercial: 295, industrial: 327,
}
// The two forms (HSL, 0..1). Neon: the hue at full saturation. Detail: a pastel — Jacob asked for "a few % more
// saturated" than the first proposal (0.22) — never more saturated than its source (a grey stays grey).
const NEON_S = 1, NEON_L = 0.55
const DETAIL_S = 0.3, DETAIL_L = 0.64

const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
const hslHex = (h, s, l) => toHex(hslToRgb(h, s, l))

/** A neutral hue's neon form. */
export const neutralNeon = (category) => NEUTRAL_CATEGORY_HUE[category] == null ? null : hslHex(NEUTRAL_CATEGORY_HUE[category] / 360, NEON_S, NEON_L)
/** The detail (pastel) form of any neon hex: its hue, softened; never more saturated than it is. */
export function detailOf(neonHex) {
  const [h, s] = rgbToHsl(...parseHex(neonHex))
  return hslHex(h, Math.min(s, DETAIL_S), DETAIL_L)
}
/** The neutral set in its neon form (Stage's swatch defaults: what an unauthored category draws). */
export const NEUTRAL_CATEGORY_NEON = Object.fromEntries(Object.keys(NEUTRAL_CATEGORY_HUE).map(k => [k, neutralNeon(k)]))

/** The category ids the Look authored a colour for (materialColors.neon_<id>). */
export function authoredCategories(materialColors) {
  return Object.keys(materialColors || {}).filter(k => k.startsWith('neon_') && materialColors[k]).map(k => k.slice(5))
}

/**
 * A category's NEON colour for a town — the tube on the map. `scene` is its baked scene.json (or { materialColors,
 * neonAuthored: [] } for Stage's live values). Unknown / unclassified → UNKNOWN_HEX (the absence of a category).
 */
export function categoryNeon(category, scene) {
  const key = (category || '').replace(/^neon_/, '')
  if (!key) return UNKNOWN_HEX
  if (!Array.isArray(scene?.neonAuthored)) return PRE_PALETTE_HEX[key] || UNKNOWN_HEX   // ⏳ pre-palette bake
  return scene.materialColors?.[`neon_${key}`] || neutralNeon(key) || UNKNOWN_HEX
}
/** A category's DETAIL colour — the pastel for chips, dots and accents: derived from its neon, one source. */
export function categoryDetail(category, scene) { return detailOf(categoryNeon(category, scene)) }

/** Is this category's colour the town's own (authored), or the kit's neutral default? */
export function isAuthoredCategory(category, scene) {
  return !!scene?.materialColors?.[`neon_${(category || '').replace(/^neon_/, '')}`]
}
