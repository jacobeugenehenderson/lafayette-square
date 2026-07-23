// msbf-identity.js — the ONE definition of MSBF building identity.
//
// MSBF footprints carry no external id, so the permanent key is GEOMETRY: the
// footprint centroid (lon/lat), rounded. `keyOf` MUST be identical everywhere it
// is used (fetch-msbf mint/consult · the capture script · tests) — if a re-derived
// key differs by one digit it MISSES, and a miss makes the consult APPEND instead
// of reuse, i.e. the lock fails open into a fresh renumber. One definition, no drift.
//
// EXTENT-DESIGN §4 · EXTENT-EXCAVATION §0.8 · BRIEF-hpdm-identity-lock §3.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PREC = 7 // decimal places for the centroid key (~1 cm; 0 collisions across HPDM's 9880)

// The permanent key: the footprint centroid, rounded. `coords` = [{lon,lat,…}]
// (the rounded ring fetch-msbf writes; the capture reads the same rounded ring).
export function keyOf(coords) {
  let x = 0, y = 0, n = 0
  for (const c of coords) { x += c.lon; y += c.lat; n++ }
  return (x / n).toFixed(PREC) + ',' + (y / n).toFixed(PREC)
}

export function registryPath(RAW_DIR) {
  return join(RAW_DIR, '..', 'identity-registry.json')
}
export function loadRegistry(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}
// Deterministic serialization — a no-op fetch must produce a byte-identical file.
export function saveRegistry(path, reg) {
  writeFileSync(path, JSON.stringify(reg, null, 0) + '\n')
}

// Assign a permanent msbfId to every footprint.
//   existing registry (a SEALED scene, e.g. HPDM today): reuse each key's number;
//     an unseen key APPENDS at ++highWater. Nothing is ever renumbered.
//   null registry (a NEW scene's FIRST fetch = the seal): mint id = index i, and
//     the returned registry freezes that numbering for every fetch after.
// coordsList: [ ring, … ] where ring = [{lon,lat,…}] (rounded coords).
// Returns { ids, registry, minting, appended, collisions }.
export function assignIds(coordsList, existing, meta = {}) {
  const minting = !existing
  const registry = existing
    ? { ...existing, map: { ...existing.map } }
    : {
        version: 1, scene: meta.scene, key: `centroid-lonlat-${PREC}dp`,
        source: meta.source, dataset: meta.dataset,
        note: 'FROZEN identity: centroid-key -> permanent msbfId. fetch-msbf.js consults this; ' +
              're-fetch preserves existing numbers, appends new via highWater. Never renumber. (EXTENT-DESIGN §4)',
        highWater: -1, count: 0, map: {},
      }
  let highWater = registry.highWater
  let appended = 0, collisions = 0
  const ids = coordsList.map((coords, i) => {
    const k = keyOf(coords)
    if (minting) {
      // First-ever numbering: the array index IS the legitimate key. A repeated
      // centroid (coincident footprints) is a genuine collision — count it; the
      // building still gets its own unique index, but future consults are
      // ambiguous for that key, so it must be reported (0 for HPDM).
      if (k in registry.map) { collisions++; return i }
      registry.map[k] = i
      if (i > highWater) highWater = i
      return i
    }
    if (k in registry.map) return registry.map[k]  // permanent number, reused
    const id = ++highWater                          // unseen → append, never renumber
    registry.map[k] = id
    appended++
    return id
  })
  registry.highWater = highWater
  registry.count = Object.keys(registry.map).length
  return { ids, registry, minting, appended, collisions }
}
