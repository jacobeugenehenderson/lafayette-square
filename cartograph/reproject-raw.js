/**
 * reproject-raw.js — re-derive raw geometry's local x/z from stored lon/lat
 * through the CURRENT geography (config.js, scene-aware via CARTOGRAPH_SCENE).
 *
 * WHY: fetch time bakes x/z via wgs84ToLocal, but keeps the frame-independent
 * lon/lat alongside. When geography.json is re-centered, the baked x/z go stale
 * while every downstream artifact (skeleton.json junctions, map, ribbons, and
 * the BUILDINGS) inherits that stale frame. The honest re-derive is NOT a
 * destructive network re-fetch — it's re-projecting the stored lon/lat (ground
 * truth) through the new center. Deterministic, offline.
 *
 * ⭐ EVERY frame-dependent raw file must be reprojected, not just osm.json —
 * else one layer moves to the new frame and another stays in the old one and
 * they no longer register. That is exactly the "buildings drift off their
 * blocks" bug (2026-07-04): streets came from reprojected osm.json, buildings
 * from msbf.json which was never reprojected → ~557 m offset after a re-center.
 *
 * This is the §11 "living boundary" lever: a re-center WITHIN the fetched bbox
 * needs only reproject + re-skeleton (+ downstream), never a re-fetch. A grow
 * BEYOND the bbox is the one case that still needs fetch.js.
 *
 * Run:  CARTOGRAPH_SCENE=<scene> node cartograph/reproject-raw.js
 * Then: CARTOGRAPH_SCENE=<scene> node cartograph/skeleton.js   (re-derive the frame)
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { wgs84ToLocal, sceneRawDir, SCENE } from './config.js'
import { writeIfChanged } from './io.js'

let reprojected = 0
// Recursively re-derive x/z from lon/lat wherever a coordinate carries both.
// A raw file mixes many shapes (osm.ground layers, osm.buildings, msbf
// buildings, admin rings); walking for the {lon,lat} pair reprojects them all
// uniformly regardless of nesting, and can only make x/z agree with lon/lat.
function reprojectDeep(node) {
  if (Array.isArray(node)) { for (const el of node) reprojectDeep(el); return }
  if (node && typeof node === 'object') {
    if (typeof node.lon === 'number' && typeof node.lat === 'number') {
      const [x, z] = wgs84ToLocal(node.lon, node.lat)
      node.x = Math.round(x * 100) / 100
      node.z = Math.round(z * 100) / 100
      reprojected++
    }
    for (const k in node) reprojectDeep(node[k])
  }
}

// Frame-dependent raw files whose coords are {lon,lat,x,z} objects — the deep
// walker re-derives x/z from lon/lat in place.
const FRAME_DEPENDENT = ['osm.json', 'msbf.json', 'admin_boundaries.json']

for (const name of FRAME_DEPENDENT) {
  const path = join(sceneRawDir(SCENE), name)
  if (!existsSync(path)) continue
  const before = reprojected
  const data = JSON.parse(readFileSync(path, 'utf8'))
  reprojectDeep(data)
  const wrote = writeIfChanged(path, JSON.stringify(data, null, 2))
  console.log(`[reproject] ${name}: ${reprojected - before} coords → ${wrote ? 'wrote' : 'no change'}`)
}

// Parcels are JUST AS frame-dependent (centroid/rings drive the address→building
// join) but store [x,z] ARRAYS readers depend on, with WGS84 siblings
// (centroid_ll / rings_ll) as the frame-independent ground truth. Leaving them
// out is exactly the "one layer moves, another stays" trap above — it stranded
// the parcels ~800m off after a re-center and scrambled every roster address
// (2026-07-08). Re-derive their x/z from the WGS84 siblings on every re-center.
const projectXZ = (lon, lat) => {
  const [x, z] = wgs84ToLocal(lon, lat)
  return [Math.round(x * 100) / 100, Math.round(z * 100) / 100]
}
for (const name of ['stl_parcels.json', 'stlco_parcels.json']) {
  const path = join(sceneRawDir(SCENE), name)
  if (!existsSync(path)) continue
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let n = 0, stale = 0
  for (const par of (data.parcels || [])) {
    if (Array.isArray(par.centroid_ll)) {
      par.centroid = projectXZ(par.centroid_ll[0], par.centroid_ll[1]); reprojected++; n++
    } else stale++
    if (Array.isArray(par.rings_ll)) {
      par.rings = par.rings_ll.map(ring => ring.map(([lon, lat]) => projectXZ(lon, lat)))
    }
  }
  const wrote = writeIfChanged(path, JSON.stringify(data, null, 2))
  const warn = stale ? `, ⚠️ ${stale} MISSING centroid_ll (pre-fix fetch — re-run scripts/03*)` : ''
  console.log(`[reproject] ${name}: ${n} parcels${warn} → ${wrote ? 'wrote' : 'no change'}`)
}

console.log(`[reproject] scene=${SCENE}: reprojected ${reprojected} coords total via current geography`)
