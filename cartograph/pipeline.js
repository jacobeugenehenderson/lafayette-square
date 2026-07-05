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
import { RAW_DIR, CLEAN_DIR, SCENE, DEFAULT_SCENE } from './config.js'
import { writeIfChanged } from './io.js'
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
  // The curated src/data/buildings.json is the DEFAULT scene's (Lafayette
  // Square) hand-enriched building set — it must NOT be pulled into another
  // scene. A non-default scene uses its own msbf.json / OSM buildings.
  const PROJECT_ROOT = join(RAW_DIR, '..', '..', '..', '..')
  const projectBldgPath = join(PROJECT_ROOT, 'src', 'data', 'buildings.json')
  const msbfPath = join(RAW_DIR, 'msbf.json')
  if (SCENE === DEFAULT_SCENE && existsSync(projectBldgPath)) {
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
  let buildings = deriveBuildings(snapped.buildings, raw.buildingSource)

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

  // ── Clip to the neighborhood boundary (KIT) ─────────────────────────
  // If the scene has a committed neighborhood_boundary.json, drop every feature
  // OUTSIDE the circle (+ the street-fade margin) so map.json/ribbons carry only
  // the neighborhood, not the whole fetched square (a wide fetch otherwise pours
  // 100s of MB). INCLUSIVE — keep anything TOUCHING the margin — so tile→street
  // edge refs and crossing arterials survive. No boundary (uncommitted) = no clip.
  const nbPath = join(RAW_DIR, '..', 'neighborhood_boundary.json')
  if (existsSync(nbPath)) {
    const nb = JSON.parse(readFileSync(nbPath, 'utf-8'))
    const cx = nb.center?.[0] ?? 0, cz = nb.center?.[1] ?? 0
    const keepR = (nb.streetFade?.outer ?? nb.radius ?? Infinity) + 30
    const R2 = keepR * keepR
    const touches = (pts) => {
      if (!Array.isArray(pts)) return false
      for (const p of pts) {
        const x = Array.isArray(p) ? p[0] : p.x, z = Array.isArray(p) ? p[1] : p.z
        if ((x - cx) ** 2 + (z - cz) ** 2 <= R2) return true
      }
      return false
    }
    const keep = (item) => {
      if (typeof item.x === 'number' && typeof item.z === 'number') return (item.x - cx) ** 2 + (item.z - cz) ** 2 <= R2
      return touches(item.ring || item.points || item.coords)
    }
    let dropped = 0, kept = 0
    for (const cat of Object.keys(layers || {})) {
      const arr = layers[cat]
      if (Array.isArray(arr)) { const before = arr.length; layers[cat] = arr.filter(keep); dropped += before - layers[cat].length; kept += layers[cat].length }
    }
    // ⭐ Polyline CLIP (the Data-Wall neuter): trim a street/path polyline to the
    // circle, keeping the longest inside run — so a named BOUNDARY ARTERIAL isn't
    // carried through at full city length (South Big Bend ran 3882 m across a
    // 2502 m hood, sticking out and skewing the 3D framing). Whole-street keep/drop
    // is not enough; the geometry itself must stop at the boundary. [x,z] arrays.
    const clipRun = (pts) => {
      if (!Array.isArray(pts) || pts.length < 2) return pts
      const inC = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= R2
      const pieces = []; let cur = null
      const close = () => { if (cur && cur.length >= 2) pieces.push(cur); cur = null }
      const push = (p) => { if (!cur) { cur = [p]; return } const l = cur[cur.length - 1]; if (l[0] !== p[0] || l[1] !== p[1]) cur.push(p) }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], A = dx * dx + dz * dz
        const ts = []
        if (A > 1e-12) {
          const fx = a[0] - cx, fz = a[1] - cz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R2, disc = B * B - 4 * A * C
          if (disc > 0) { const sq = Math.sqrt(disc); for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (t > 1e-9 && t < 1 - 1e-9) ts.push(t) }
        }
        ts.sort((x, y) => x - y)
        const stops = [0, ...ts, 1]
        for (let s = 0; s < stops.length - 1; s++) {
          const t0 = stops[s], t1 = stops[s + 1]; if (t1 - t0 < 1e-9) continue
          const mt = (t0 + t1) / 2
          if (inC(a[0] + dx * mt, a[1] + dz * mt)) { push([a[0] + dx * t0, a[1] + dz * t0]); push([a[0] + dx * t1, a[1] + dz * t1]) } else close()
        }
      }
      close()
      if (!pieces.length) return null
      return pieces.reduce((p, q) => (q.length > p.length ? q : p))
    }
    const POLYLINE = new Set(['streets', 'alleys', 'paths'])
    const rb = layers.ribbons
    if (rb && typeof rb === 'object' && !Array.isArray(rb)) {
      for (const key of ['streets', 'faces', 'tiles', 'medians', 'corridors', 'alleys', 'paths', 'intersections', 'junctions', 'nameTransitions']) {
        if (!Array.isArray(rb[key])) continue
        const before = rb[key].length
        if (POLYLINE.has(key)) {
          rb[key] = rb[key].map(it => { const run = clipRun(it.points); return run ? { ...it, points: run } : null }).filter(Boolean)
        } else {
          rb[key] = rb[key].filter(keep)
        }
        dropped += before - rb[key].length; kept += rb[key].length
      }
    }
    // Buildings STOP at the neighborhood circle (radius R), NOT the street-fade
    // margin — else they float ~200 m outside the boundary fade in 3D. Centroid-
    // in-circle test (streets can trail past the rim; buildings can't).
    const bR2 = (nb.radius ?? Infinity) ** 2
    const bBefore = buildings.length
    buildings = buildings.filter((b) => {
      const pts = b.ring || []
      if (!pts.length) return true
      let sx = 0, sz = 0
      for (const p of pts) { sx += Array.isArray(p) ? p[0] : p.x; sz += Array.isArray(p) ? p[1] : p.z }
      const dx = sx / pts.length - cx, dz = sz / pts.length - cz
      return dx * dx + dz * dz <= bR2
    })
    dropped += bBefore - buildings.length
    console.log(`  Boundary clip: streets/ground R=${Math.round(keepR)}m, buildings R=${Math.round(nb.radius)}m — kept ${kept + buildings.length}, dropped ${dropped}`)
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

  // Content-aware so a no-op pipeline run doesn't cascade-invalidate
  // ground / buildings / lamps / scene / ground-ao downstream.
  const mapJson = JSON.stringify(output, null, 2)
  const wrote = writeIfChanged(join(CLEAN_DIR, 'map.json'), mapJson)
  const sizeKb = Math.round(mapJson.length / 1024)
  console.log(`\n  Output: ${join(CLEAN_DIR, 'map.json')} (${sizeKb} KB)${wrote ? '' : ' [unchanged]'}`)
  console.log(`  Buildings: ${buildings.length}`)

  if (elevationGrid) {
    writeIfChanged(join(CLEAN_DIR, 'elevation.json'), JSON.stringify(elevationGrid, null, 2))
  }

  console.log('='.repeat(60))
}

main()
