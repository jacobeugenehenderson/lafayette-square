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

// Every frame-dependent raw file (carries baked x/z alongside lon/lat). Lamps +
// parcels project from lon/lat at pipeline time (no stale baked x/z), so they
// need no reprojection here.
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
console.log(`[reproject] scene=${SCENE}: reprojected ${reprojected} coords total via current geography`)
