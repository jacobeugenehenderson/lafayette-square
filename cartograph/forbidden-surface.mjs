/**
 * forbidden-surface.mjs — "a tree can never stand here" mask.
 *
 * Shared by arborist/bake-trees.js (drops any placement on hardscape) and
 * scripts/17-fill-canopy-trees.mjs (RELOCATES canopy candidates off hardscape
 * onto the nearest allowed ground). One source of truth so the two never drift.
 *
 * Scene-aware: pass { mapPath } for a poured scene (its own clean/map.json +
 * water layer). Default is Lafayette Square (park_water.json). A poured scene
 * forbids the road surface (`block`), parking, and steps that LS's park-only
 * tester omits. Allowed: yards, parcels, parkland, and the treelawn (the
 * curb-to-sidewalk planting strip — where street trees belong).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygon(px, pz, poly) {
  const ring = poly.ring || poly
  if (!pointInRing(px, pz, ring)) return false
  if (poly.holes) for (const h of poly.holes) if (pointInRing(px, pz, h)) return false
  return true
}

// Attach an axis-aligned bbox so the classifier can reject most polygons with a
// cheap min/max compare before the O(ring) test (thousands of polys × thousands
// of trees — a spatial prefilter is mandatory).
export function polyWithBbox(ring, holes) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const [x, z] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  return { ring, holes: holes || null, minX, minZ, maxX, maxZ }
}

export function makeForbiddenTester(opts = {}) {
  const scened = !!opts.mapPath
  const mapPath = opts.mapPath || path.join(REPO_ROOT, 'cartograph', 'data', 'lafayette-square', 'clean', 'map.json')
  const map = JSON.parse(readFileSync(mapPath, 'utf-8'))
  // park_water.json uses [x,z] arrays; map.json uses {x,z} objects. Normalize.
  const toArr = (ring) => ring.map(p => Array.isArray(p) ? p : [p.x, p.z])

  const waterPolys = []
  if (!scened) {
    const water = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src', 'data', 'park_water.json'), 'utf-8'))
    const lakeOuter = water.lake?.outer || [], lakeIsland = water.lake?.island || [], grotto = water.grotto || []
    if (lakeOuter.length) waterPolys.push(polyWithBbox(toArr(lakeOuter), lakeIsland.length ? [toArr(lakeIsland)] : null))
    if (grotto.length) waterPolys.push(polyWithBbox(toArr(grotto)))
  } else {
    for (const p of (map.layers?.water || [])) if ((p.ring || []).length >= 3)
      waterPolys.push(polyWithBbox(toArr(p.ring), p.holes ? p.holes.map(toArr) : null))
  }

  const buildings = (map.buildings || [])
    .map(b => toArr(b.footprint || b.ring || []))
    .filter(r => r.length >= 3).map(r => polyWithBbox(r))
  const layer = (k) => (map.layers?.[k] || [])
    .filter(p => (p.ring || []).length >= 3)
    .map(p => polyWithBbox(toArr(p.ring), p.holes ? p.holes.map(toArr) : null))

  // `parkSidewalk` (a single polygon covering the park interior) is excluded —
  // it would forbid every park tree; interior walks are caught via path/footway.
  const checks = [
    ['water',    waterPolys],
    ['building', buildings],
    ['pavement', layer('pavement')],
    ['alley',    layer('alley')],
    ['sidewalk', layer('sidewalk')],
    ['footway',  layer('footway')],
    ['path',     layer('path')],
  ]
  if (scened) checks.push(
    ['asphalt', layer('block')],        // the carriageway / road surface
    ['parking', layer('parking_lot')],
    ['steps',   layer('steps')],
  )
  return function classify(wx, wz) {
    for (const [reason, polys] of checks) {
      for (const p of polys) {
        if (wx < p.minX || wx > p.maxX || wz < p.minZ || wz > p.maxZ) continue
        if (pointInPolygon(wx, wz, p)) return reason
      }
    }
    return null
  }
}
