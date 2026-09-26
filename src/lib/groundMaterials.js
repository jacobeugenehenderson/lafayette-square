/**
 * groundMaterials.js — WHICH MATERIAL DRAWS A BAKED GROUND GROUP. One rule, read by BakedGround and by
 * `checks/claims-every-ground-surface-takes-the-lamp.mjs`, so the check walks the same dispatch the
 * map does (it was inline in BakedGround.jsx, where no check could reach it).
 *
 * Returns 'water' · 'gravel' · 'surface' (the procedural ground factory — grass, sand, crop) · 'fade'
 * (flat treated colour: asphalt, curb, sidewalk, and every class with no generator).
 */
import { isWaterGroupId } from '../components/waterMaterial.js'
import { surfaceOfGroup, SURFACES } from '../../cartograph/surfaces.mjs'

/** Ground groups drawn with the park gravel (Voronoi pebble) shader. */
export const GRAVEL_MATERIALS = new Set(['park_path'])

export const isGravelGroup = (group) => group.kind !== 'face' && GRAVEL_MATERIALS.has(group.id)
// ⛔ The id rule for water lives in waterMaterial.js, so the bake, the runtime and the checks all ask
// the SAME function what water is.
export const isWaterGroup = (group) => group.kind !== 'face' && isWaterGroupId(group.id)

/**
 * `hasFieldAxis`: whether the geometry carries per-field ids — a perField surface without them is
 * drawn flat (and BakedGround says so).
 */
export function groundMaterialFor(group, surfaceTable, { hasFieldAxis = true } = {}) {
  if (isWaterGroup(group)) return { kind: 'water' }
  if (isGravelGroup(group)) return { kind: 'gravel' }
  const surface = surfaceOfGroup(group, surfaceTable)
  if (surface && SURFACES[surface].perField && !hasFieldAxis) return { kind: 'fade', surface, noFields: true }
  return surface ? { kind: 'surface', surface } : { kind: 'fade' }
}
