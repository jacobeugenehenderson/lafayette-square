/**
 * Cartograph — Elevation: fetch USGS elevation for all vertices
 *
 * Uses the USGS Elevation Point Query Service (EPQS) to sample
 * ground height at a grid of points, then interpolates for each vertex.
 *
 * We fetch a grid rather than per-vertex to stay within rate limits
 * and because nearby vertices share the same elevation anyway.
 */

import { BBOX, wgs84ToLocal } from './config.js'

const EPQS_URL = 'https://epqs.nationalmap.gov/v1/json'
const GRID_STEP = 0.0005 // ~55m lat, ~43m lon — gives us a reasonable grid

/**
 * Fetch elevation for a single lat/lon point.
 * Returns height in meters or null on failure.
 */
async function fetchElevation(lat, lon) {
  const url = `${EPQS_URL}?x=${lon}&y=${lat}&wkid=4326&units=Meters&includeDate=false`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data.value != null ? parseFloat(data.value) : null
  } catch {
    return null
  }
}

/**
 * Build an elevation grid covering the bounding box.
 * Returns { points: [{lat, lon, x, z, elev}], minElev, maxElev }
 */
export async function fetchElevationGrid(bbox = BBOX) {
  const points = []

  // Build sample points
  const lats = []
  const lons = []
  for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += GRID_STEP) lats.push(lat)
  for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += GRID_STEP) lons.push(lon)

  console.log(`  Elevation grid: ${lats.length} x ${lons.length} = ${lats.length * lons.length} points`)

  // Fetch in batches to avoid hammering the API
  const BATCH = 8
  const tasks = []
  for (const lat of lats) {
    for (const lon of lons) {
      tasks.push({ lat, lon })
    }
  }

  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(({ lat, lon }) => fetchElevation(lat, lon))
    )

    for (let j = 0; j < batch.length; j++) {
      const { lat, lon } = batch[j]
      const elev = results[j]
      if (elev == null) continue
      const [x, z] = wgs84ToLocal(lon, lat)
      points.push({
        lat: Math.round(lat * 1e7) / 1e7,
        lon: Math.round(lon * 1e7) / 1e7,
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        elev: Math.round(elev * 100) / 100,
      })
    }

    if (i % (BATCH * 10) === 0 && i > 0) {
      console.log(`    ${i}/${tasks.length} fetched...`)
    }
  }

  let minElev = Infinity, maxElev = -Infinity
  for (const p of points) {
    if (p.elev < minElev) minElev = p.elev
    if (p.elev > maxElev) maxElev = p.elev
  }

  console.log(`  ${points.length} elevation samples, range ${minElev.toFixed(1)}–${maxElev.toFixed(1)}m`)
  return { points, minElev, maxElev }
}

/**
 * Interpolate elevation at an arbitrary (x, z) point from the grid.
 * Uses inverse-distance weighting of nearest grid points.
 */
export function interpolateElevation(x, z, grid) {
  let sumW = 0, sumE = 0

  for (const p of grid.points) {
    const dx = p.x - x, dz = p.z - z
    const d2 = dx * dx + dz * dz
    if (d2 < 0.01) return p.elev // exact match

    const w = 1 / d2
    sumW += w
    sumE += w * p.elev
  }

  return sumW > 0 ? sumE / sumW : null
}
