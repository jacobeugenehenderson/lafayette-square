#!/usr/bin/env node
/**
 * Cartograph — Seed centerlines.json from block_shapes.json + OSM
 *
 * One-time script to generate the initial centerline data for the
 * Surveyor mode. Curated geometry (block_shapes.json) takes precedence;
 * OSM fills gaps for streets not in the curated set.
 *
 * Will NOT overwrite an existing centerlines.json — run only once.
 *
 * Usage:  node seed-centerlines.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR } from './config.js'

const SRC_DATA = join(import.meta.dirname, '..', 'src', 'data')
const OUT = join(RAW_DIR, 'centerlines.json')

if (existsSync(OUT)) {
  console.log(`centerlines.json already exists — not overwriting.`)
  console.log(`Delete ${OUT} first if you want to re-seed.`)
  process.exit(0)
}

// ── Load sources ─────────────────────────────────────────────────
const blockData = JSON.parse(readFileSync(join(SRC_DATA, 'block_shapes.json'), 'utf-8'))
const curatedStreets = blockData.streets || []

let osmHW = []
if (existsSync(join(RAW_DIR, 'osm.json'))) {
  const osm = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))
  osmHW = osm.ground?.highway || []
}

// ── Simplify (Ramer-Douglas-Peucker) ─────────────────────────────
function simplify(pts, tolerance) {
  if (pts.length <= 2) return pts
  const a = pts[0], b = pts[pts.length - 1]
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  let maxDist = 0, maxIdx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    let dist
    if (len2 < 1e-6) {
      dist = Math.sqrt((p[0]-a[0])**2 + (p[1]-a[1])**2)
    } else {
      const t = ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / len2
      dist = Math.sqrt((p[0]-(a[0]+t*dx))**2 + (p[1]-(a[1]+t*dz))**2)
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist <= tolerance) return [a, b]
  const left = simplify(pts.slice(0, maxIdx + 1), tolerance)
  const right = simplify(pts.slice(maxIdx), tolerance)
  return [...left.slice(0, -1), ...right]
}

function polyLength(pts) {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dz = pts[i][1] - pts[i-1][1]
    len += Math.sqrt(dx*dx + dz*dz)
  }
  return len
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Map highway types to our types ───────────────────────────────
function mapType(highway) {
  if (highway === 'primary' || highway === 'primary_link') return 'primary'
  if (highway === 'secondary' || highway === 'secondary_link') return 'secondary'
  if (highway === 'service') return 'service'
  return 'residential'
}

// ── Vehicular street filter (same as render.js) ──────────────────
const vehicularTypes = new Set([
  'residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified',
])
const osmVehicular = osmHW.filter(f =>
  vehicularTypes.has(f.tags?.highway) && f.coords?.length >= 2
)
const osmAlleys = osmHW.filter(f =>
  f.tags?.highway === 'service' && f.tags?.service === 'alley' && f.coords?.length >= 2
)
const osmPaths = osmHW.filter(f => {
  const hw = f.tags?.highway
  if (!['footway', 'path', 'cycleway', 'steps', 'pedestrian'].includes(hw)) return false
  if (f.coords?.length < 2) return false
  // Exclude sidewalks, crossings, traffic islands — not independent paths
  const fw = f.tags?.footway
  if (hw === 'footway' && (fw === 'sidewalk' || fw === 'crossing' || fw === 'traffic_island' || fw === 'access_aisle')) return false
  return true
})

// ── Build centerlines ────────────────────────────────────────────
const streets = []
const coveredNames = new Set()
const idCounts = {}

function nextId(name) {
  const base = slug(name || 'unnamed')
  const n = idCounts[base] || 0
  idCounts[base] = n + 1
  return `${base}-${n}`
}

// 1. Curated streets from block_shapes.json
for (const st of curatedStreets) {
  streets.push({
    id: nextId(st.name),
    name: st.name,
    type: st.type || 'residential',
    oneway: false,
    deadEnd: false,
    loop: false,
    smooth: false,
    points: st.points.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
    source: 'curated',
  })
  coveredNames.add(st.name)
}

// 2. OSM vehicular streets (fill gaps)
for (const f of osmVehicular) {
  const name = f.tags?.name
  if (name && coveredNames.has(name)) continue

  const pts = simplify(f.coords.map(c => [c.x, c.z]), 1.5)
  if (pts.length < 2) continue
  if (polyLength(pts) < 10 && !name) continue

  const isOneway = f.tags?.oneway === 'yes'

  streets.push({
    id: nextId(name || 'unnamed'),
    name: name || '',
    type: mapType(f.tags?.highway),
    oneway: isOneway,
    deadEnd: false,
    loop: false,
    smooth: false,
    points: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
    source: 'osm',
  })
  if (name) coveredNames.add(name)
}

// 3. Alleys
for (const f of osmAlleys) {
  const name = f.tags?.name
  const pts = simplify(f.coords.map(c => [c.x, c.z]), 1.5)
  if (pts.length < 2) continue
  if (polyLength(pts) < 5) continue

  streets.push({
    id: nextId(name || 'alley'),
    name: name || '',
    type: 'service',
    oneway: false,
    deadEnd: false,
    loop: false,
    smooth: false,
    points: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
    source: 'osm',
  })
}

// 4. Walkways, paths, cycleways, steps
for (const f of osmPaths) {
  const name = f.tags?.name
  const pts = simplify(f.coords.map(c => [c.x, c.z]), 1.0)
  if (pts.length < 2) continue
  if (polyLength(pts) < 3) continue

  const hw = f.tags?.highway
  const type = hw === 'cycleway' ? 'cycleway'
    : hw === 'steps' ? 'steps'
    : hw === 'pedestrian' ? 'pedestrian'
    : 'footway'

  streets.push({
    id: nextId(name || type),
    name: name || '',
    type,
    oneway: false,
    deadEnd: false,
    loop: false,
    smooth: false,
    points: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
    source: 'osm',
  })
}

// ── Stamp _original on every street (frozen source-of-truth for revert) ──
for (const st of streets) {
  st._original = st.points.map(([x, z]) => [x, z])
}

// ── Write ────────────────────────────────────────────────────────
const output = { streets }
writeFileSync(OUT, JSON.stringify(output, null, 2))

const curated = streets.filter(s => s.source === 'curated').length
const osm = streets.filter(s => s.source === 'osm').length
console.log(`Seeded ${streets.length} streets (${curated} curated, ${osm} OSM) → ${OUT}`)
