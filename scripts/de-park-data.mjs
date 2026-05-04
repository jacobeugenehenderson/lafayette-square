// de-park-data.mjs — one-shot migration: rotate park-local datasets into
// world frame. After this runs, every spatial dataset speaks the same
// frame (= terrain.json frame), and every PARK_GRID_ROTATION render-time
// transform can be deleted.
//
// Datasets touched:
//   src/data/park_trees.json   (park-local → world; full table)
//   src/data/park_water.json   (compose pivot-undo + park rotation)
//
// Idempotency: this script writes a `meta.frame: "world"` marker. If
// already present, the script aborts to avoid double-rotation.
//
// Run: node scripts/de-park-data.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PARK_GRID_ROTATION } from '../src/lib/terrainCommon.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'src', 'data')

// 2D rotation around origin by angle θ in the XZ plane (Y-up, three.js
// convention — matches arborist/bake-trees.js's elevationParkLocal):
//   (x, z) → (x cos θ + z sin θ, -x sin θ + z cos θ)
function rotXZ(x, z, c, s) {
  return [x * c + z * s, -x * s + z * c]
}

function rotXZAround(x, z, cx, cz, c, s) {
  const [dx, dz] = rotXZ(x - cx, z - cz, c, s)
  return [cx + dx, cz + dz]
}

function loadJSON(p) { return JSON.parse(readFileSync(p, 'utf-8')) }
function saveJSON(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8')
  console.log(`  wrote ${path.relative(ROOT, p)}`)
}

const PARK_C = Math.cos(PARK_GRID_ROTATION)
const PARK_S = Math.sin(PARK_GRID_ROTATION)

// ── park_trees.json ─────────────────────────────────────────────────────
function migrateTrees() {
  const p = path.join(DATA, 'park_trees.json')
  const data = loadJSON(p)
  if (data.meta?.frame === 'world') {
    console.log('  park_trees.json: already migrated, skipping')
    return
  }
  const before = data.trees[0]
  for (const t of data.trees) {
    const [wx, wz] = rotXZ(t.x, t.z, PARK_C, PARK_S)
    t.x = +wx.toFixed(4)
    t.z = +wz.toFixed(4)
  }
  data.meta = {
    ...(data.meta || {}),
    frame: 'world',
    coordinate_system: 'World meters, neighborhood-aligned (de-parking 2026-05-03).',
    note: 'Migrated from park-local by scripts/de-park-data.mjs.',
  }
  saveJSON(p, data)
  console.log(`  park_trees: rotated ${data.trees.length} trees. ` +
              `First tree: (${before.x}, ${before.z}) → (${data.trees[0].x}, ${data.trees[0].z})`)
}

// ── park_water.json ─────────────────────────────────────────────────────
// Lake outer + grotto were captured in a frame rotated +9.2° around
// ISLAND_PIVOT (33.96, 86) relative to park-local. Lake island sits in
// park-local correctly. Compose to world:
//   lake.outer / grotto: rot(-PARK_GRID_ROTATION around PIVOT) → park-local
//                        then rot(PARK_GRID_ROTATION around origin) → world
//   lake.island:                  rot(PARK_GRID_ROTATION around origin) → world
function migrateWater() {
  const p = path.join(DATA, 'park_water.json')
  const data = loadJSON(p)
  if (data.meta?.frame === 'world') {
    console.log('  park_water.json: already migrated, skipping')
    return
  }
  const PIV = [33.96, 86.00]
  const A_REV = -PARK_GRID_ROTATION
  const cR = Math.cos(A_REV), sR = Math.sin(A_REV)

  function captureFrameToWorld(pt) {
    const [lx, lz] = rotXZAround(pt[0], pt[1], PIV[0], PIV[1], cR, sR)
    return rotXZ(lx, lz, PARK_C, PARK_S).map(v => +v.toFixed(4))
  }
  function parkLocalToWorld(pt) {
    return rotXZ(pt[0], pt[1], PARK_C, PARK_S).map(v => +v.toFixed(4))
  }

  const before = data.lake?.outer?.[0]
  if (data.lake) {
    if (data.lake.outer)  data.lake.outer  = data.lake.outer.map(captureFrameToWorld)
    if (data.lake.island) data.lake.island = data.lake.island.map(parkLocalToWorld)
  }
  if (data.grotto) data.grotto = data.grotto.map(captureFrameToWorld)

  data.meta = {
    ...(data.meta || {}),
    frame: 'world',
    coordinate_system: 'World meters, neighborhood-aligned (de-parking 2026-05-03).',
    note: 'Migrated from capture-frame + park-local by scripts/de-park-data.mjs. ' +
          'Lake outer + grotto: captureFrameToWorld (compose pivot-undo + park rotation). ' +
          'Lake island: parkLocalToWorld.',
  }
  saveJSON(p, data)
  if (before) {
    console.log(`  park_water: lake.outer[0] (${before[0]}, ${before[1]}) → ` +
                `(${data.lake.outer[0][0]}, ${data.lake.outer[0][1]})`)
  }
}

console.log('De-parking migration:')
migrateTrees()
migrateWater()
console.log('Done.')
