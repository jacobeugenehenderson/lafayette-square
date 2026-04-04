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
  console.log('\n[1/4] Loading raw OSM data...')
  const raw = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))
  const hwCount = (raw.ground.highway || []).length
  console.log(`  ${hwCount} highway features, ${raw.buildings.length} buildings`)

  // ── Snap ────────────────────────────────────────────────────────────
  console.log('\n[2/4] Snapping coordinates to grid...')
  const snapped = snapAll(raw)

  // ── Derive ──────────────────────────────────────────────────────────
  console.log('\n[3/5] Deriving layers from centerlines + standards...')
  const layers = deriveLayers(snapped.ground.highway || [])
  const buildings = deriveBuildings(snapped.buildings)

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

  // ── Write ───────────────────────────────────────────────────────────
  mkdirSync(CLEAN_DIR, { recursive: true })

  const output = {
    bbox: raw.bbox,
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
