#!/usr/bin/env node
/**
 * Cartograph — Main pipeline
 *
 * Centerline-out: load raw → snap → derive layers from standards → write
 *
 * Usage:    node pipeline.js [--skip-elevation]
 * Prereq:  node fetch.js (to populate data/raw/osm.json)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, CLEAN_DIR } from './config.js'
import { snapAll } from './snap.js'
import { deriveLayers, deriveBuildings, _lotPaths } from './derive.js'
import { fetchElevationGrid, interpolateElevation } from './elevation.js'

const skipElevation = process.argv.includes('--skip-elevation')

async function main() {
  console.log('='.repeat(60))
  console.log('cartograph/pipeline.js — Centerline-out pipeline')
  console.log('='.repeat(60))

  // ── Load ────────────────────────────────────────────────────────────
  console.log('\n[1/4] Loading raw data...')
  const raw = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))
  const hwCount = (raw.ground.highway || []).length
  console.log(`  ${hwCount} highway features, ${raw.buildings.length} OSM buildings`)

  // Building source priority:
  //   1. src/data/buildings.json — curated project data (detailed footprints
  //      with materials, stories, sqft, addresses). Built for the 3D app.
  //   2. data/raw/msbf.json       — Microsoft Building Footprints (fallback)
  //   3. osm.buildings            — OSM (lowest quality, historical fallback)
  const PROJECT_ROOT = join(RAW_DIR, '..', '..', '..')
  const projectBldgPath = join(PROJECT_ROOT, 'src', 'data', 'buildings.json')
  const msbfPath = join(RAW_DIR, 'msbf.json')
  if (existsSync(projectBldgPath)) {
    const proj = JSON.parse(readFileSync(projectBldgPath, 'utf-8'))
    const list = proj.buildings || []
    raw.buildings = list
      .filter(b => b.footprint && b.footprint.length >= 3)
      .map(b => ({
        projectId: b.id,
        tags: {
          building: 'yes',
          source: 'project',
          ...(b.address && { address: b.address.trim() }),
          ...(b.stories && { stories: b.stories }),
          ...(b.building_sqft && { sqft: b.building_sqft }),
          ...(b.wall_material && { wall_material: b.wall_material }),
          ...(b.roof_material && { roof_material: b.roof_material }),
          ...(b.historic_status && { historic_status: b.historic_status }),
          ...(b.zoning && { zoning: b.zoning }),
        },
        isClosed: true,
        coords: b.footprint.map(([x, z]) => ({ x, z })),
      }))
    console.log(`  Using src/data/buildings.json: ${raw.buildings.length} curated buildings`)
    raw.buildingSource = 'project'
  } else if (existsSync(msbfPath)) {
    const msbf = JSON.parse(readFileSync(msbfPath, 'utf-8'))
    console.log(`  Using Microsoft Building Footprints: ${msbf.buildings.length} buildings`)
    raw.buildings = msbf.buildings
    raw.buildingSource = 'microsoft'
  } else {
    raw.buildingSource = 'osm'
  }

  // ── Snap ────────────────────────────────────────────────────────────
  console.log('\n[2/4] Snapping coordinates to grid...')
  const snapped = snapAll(raw)

  // ── Derive ──────────────────────────────────────────────────────────
  console.log('\n[3/5] Deriving layers from centerlines + standards...')
  const layers = deriveLayers(snapped.ground.highway || [])
  const buildings = deriveBuildings(snapped.buildings, raw.buildingSource)

  // ── Elevation ───────────────────────────────────────────────────────
  console.log('\n[4/4] Elevation...')
  let elevationGrid = null
  const elevCachePath = join(RAW_DIR, 'elevation.json')

  if (skipElevation) {
    console.log('  Skipped (--skip-elevation)')
  } else if (existsSync(elevCachePath)) {
    console.log('  Loading cached elevation grid...')
    elevationGrid = JSON.parse(readFileSync(elevCachePath, 'utf-8'))
    console.log(`  ${elevationGrid.points.length} cached samples, ${elevationGrid.minElev.toFixed(1)}–${elevationGrid.maxElev.toFixed(1)}m`)
  } else {
    console.log('  Fetching from USGS...')
    elevationGrid = await fetchElevationGrid()
    writeFileSync(elevCachePath, JSON.stringify(elevationGrid, null, 2))
  }

  if (elevationGrid) {
    for (const b of buildings) {
      const cx = b.ring.reduce((s, p) => s + p.x, 0) / b.ring.length
      const cz = b.ring.reduce((s, p) => s + p.z, 0) / b.ring.length
      b.elev = Math.round(interpolateElevation(cx, cz, elevationGrid) * 100) / 100
    }
  }

  // ── World-coord bbox (derived from projected layers + buildings) ────
  // raw.bbox is geographic (lat/lon) and unsuitable for runtime consumers
  // that work in world coords. Walk the projected outputs to compute the
  // actual world extent.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  const visit = (x, z) => {
    if (Number.isFinite(x) && Number.isFinite(z)) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }
  for (const b of buildings) for (const p of (b.ring || [])) visit(p.x, p.z)
  for (const cat of Object.keys(layers || {})) {
    const arr = layers[cat]
    if (!Array.isArray(arr)) continue  // skip nested-object layers like 'ribbons'
    for (const item of arr) {
      // Point features: streetlamp etc. carry x/z directly
      if (typeof item.x === 'number' && typeof item.z === 'number') {
        visit(item.x, item.z)
        continue
      }
      // Polyline/polygon features: ring | coords | points
      const pts = item.ring || item.coords || item.points || []
      for (const p of pts) {
        if (Array.isArray(p)) visit(p[0], p[1]); else visit(p.x, p.z)
      }
    }
  }
  const worldBbox = Number.isFinite(minX)
    ? { minX, maxX, minZ, maxZ }
    : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }

  // ── Write ───────────────────────────────────────────────────────────
  mkdirSync(CLEAN_DIR, { recursive: true })

  const output = {
    bbox: worldBbox,
    geoBbox: raw.bbox,
    elevation: elevationGrid ? {
      minElev: elevationGrid.minElev,
      maxElev: elevationGrid.maxElev,
      sampleCount: elevationGrid.points.length,
    } : null,
    layers,
    buildings,
  }

  writeFileSync(join(CLEAN_DIR, 'map.json'), JSON.stringify(output, null, 2))
  const sizeKb = Math.round(JSON.stringify(output).length / 1024)
  console.log(`\n  Output: data/clean/map.json (${sizeKb} KB)`)
  console.log(`  Buildings: ${buildings.length}`)

  if (elevationGrid) {
    writeFileSync(join(CLEAN_DIR, 'elevation.json'), JSON.stringify(elevationGrid, null, 2))
  }

  console.log('='.repeat(60))
}

main()
