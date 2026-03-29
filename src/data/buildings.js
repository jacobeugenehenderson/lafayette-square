/**
 * Shared buildings data + lookup maps.
 * Lazy-loaded: data is fetched on first access via dynamic import,
 * parsed once, and cached. All consumers share the same instance.
 *
 * Usage:
 *   import { buildings, buildingMap, ready } from '../data/buildings'
 *
 * - `buildings` / `buildingMap` are populated after `ready` resolves.
 * - Components that render buildings should check `buildings.length > 0`
 *   or await `ready` in an effect.
 * - Module-scope code that previously iterated at import time now
 *   runs inside `ready.then(...)` or is moved into components.
 */

export let buildings = []
export let buildingMap = {}
export let buildingCount = 0

export const ready = import('./buildings.json').then(m => {
  const data = m.default
  buildings = data.buildings || []
  buildingCount = buildings.length
  const map = {}
  buildings.forEach(b => { map[b.id] = b })
  buildingMap = map
  return { buildings, buildingMap, buildingCount }
})
