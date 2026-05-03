/**
 * surfaceState — module-scoped material registry authored by the Stage
 * Surfaces panel. Mirrors the envState pattern in StageApp.jsx.
 *
 * Each material has a uniform schema:
 *   color              — base diffuse hex
 *   roughness          — 0..1
 *   metalness          — 0..1
 *   texture            — id (matches a JPG in public/textures/buildings/) or 'none'
 *   textureScale       — tiling multiplier (1 = native)
 *   textureStrength    — 0..1 mix between solid color and texture
 *   normalMap          — id or 'none'
 *   normalScale        — 0..1
 *   emissive           — hex
 *   emissiveIntensity  — 0..5
 *
 * State is plain objects + a subscribe model so the rendering side can
 * read live without a re-render storm. Defaults seed from existing
 * LafayetteScene + bake-buildings palettes so the look doesn't change
 * until an operator actually tunes a material.
 */

const W = (color, roughness, texture) => ({
  color, roughness, metalness: 0,
  texture, textureScale: 1, textureStrength: 0.4,
  normalMap: 'none', normalScale: 0.5,
  emissive: '#000000', emissiveIntensity: 0,
})
const R = (color, roughness, metalness, texture) => ({
  color, roughness, metalness,
  texture, textureScale: 1, textureStrength: 0.4,
  normalMap: 'none', normalScale: 0.5,
  emissive: '#000000', emissiveIntensity: 0,
})

export const SURFACE_DEFAULTS = {
  walls: {
    brick_red:       W('#8a4636', 0.90, 'brick_red'),
    brick_weathered: W('#a06754', 0.95, 'brick_weathered'),
    stone:           W('#7a766c', 0.85, 'stone'),
    stucco:          W('#cdb89a', 0.95, 'stucco'),
    wood_siding:     W('#9a6e44', 0.85, 'wood_siding'),
  },
  roofs: {
    flat:  R('#2a2a2e', 0.9, 0,   'none'),
    slate: R('#3a3a42', 0.7, 0,   'slate'),
    metal: R('#555560', 0.5, 0.4, 'metal'),
  },
  foundations: {
    foundation: W('#B8A88A', 0.95, 'none'),
  },
}

// Texture id catalog — what can appear in the texture dropdown.
export const TEXTURE_OPTIONS = [
  'none',
  'brick_red', 'brick_weathered', 'stone', 'stucco', 'wood_siding',
  'slate', 'metal',
]

// Deep clone of defaults — operator changes mutate this; defaults stay pristine.
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

export const surfaceState = deepClone(SURFACE_DEFAULTS)

const subs = new Set()
function subscribe(fn) { subs.add(fn); return () => subs.delete(fn) }
function notify() { for (const fn of subs) fn() }

// Mutate a single material's fields. Updates are merged.
export function setSurface(category, materialId, updates) {
  const cat = surfaceState[category]
  if (!cat || !cat[materialId]) return
  Object.assign(cat[materialId], updates)
  notify()
}

// Reset a single material (or whole category) to defaults.
export function resetSurface(category, materialId) {
  const def = SURFACE_DEFAULTS[category]?.[materialId]
  if (!def) return
  Object.assign(surfaceState[category][materialId], deepClone(def))
  notify()
}
export function resetCategory(category) {
  const def = SURFACE_DEFAULTS[category]
  if (!def) return
  for (const id of Object.keys(def)) resetSurface(category, id)
}

// React hook — subscribes the calling component so it re-renders when
// any material changes. Returns a deep clone so consumers don't mutate.
import { useEffect, useState } from 'react'
export function useSurfaceState() {
  const [s, set] = useState(() => deepClone(surfaceState))
  useEffect(() => subscribe(() => set(deepClone(surfaceState))), [])
  return s
}

// Snapshot for Look serialization — Stage's Save Look button writes this
// into the Look's scene.json.
export function exportSurfaces() { return deepClone(surfaceState) }

// Apply a saved snapshot — used when loading a Look.
export function importSurfaces(snapshot) {
  if (!snapshot) return
  for (const cat of Object.keys(surfaceState)) {
    if (!snapshot[cat]) continue
    for (const id of Object.keys(surfaceState[cat])) {
      if (!snapshot[cat][id]) continue
      Object.assign(surfaceState[cat][id], snapshot[cat][id])
    }
  }
  notify()
}

// Direct, non-React-hook accessor for hot paths (useFrame in render).
export function readSurface(category, materialId) {
  return surfaceState[category]?.[materialId] || null
}
