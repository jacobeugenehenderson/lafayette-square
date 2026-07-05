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
 *
 * This module is the REFERENCE CALLER of the `loadInstanceData` seam
 * (Universal Reader Phase 2): the raw buildings JSON is loaded by
 * `INSTANCE.lookId` through the one shared route; this file just adds
 * buildings' bespoke lookup indices (`buildingMap`, `buildingCount`) on
 * top. No parallel bespoke loader — one pattern for all installation
 * data (`feedback_dual_hydration_paths_drift`).
 */

import { INSTANCE } from '../instance.js'
import { loadInstanceData } from './loadInstanceData.js'

export let buildings = []
export let buildingMap = {}
export let buildingCount = 0

export const ready = loadInstanceData(INSTANCE.lookId, 'buildings').ready.then(data => {
  buildings = (data && data.buildings) || []
  buildingCount = buildings.length
  const map = {}
  buildings.forEach(b => { map[b.id] = b })
  buildingMap = map
  return { buildings, buildingMap, buildingCount }
})
