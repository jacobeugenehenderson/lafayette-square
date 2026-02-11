#!/usr/bin/env node
/**
 * Generate clean city block data from parcel boundaries.
 *
 * Strategy:
 * 1. Use city block polygons (from git HEAD) as grouping regions
 * 2. Assign each parcel to its containing city block
 * 3. Compute clean oriented bounding rectangles (4 points, aligned to -9.2° grid)
 * 4. Keep convex hull for detailed outline
 * 5. Measure street widths from parcel-to-parcel gaps
 */

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(__dirname, 'raw')
const DATA_DIR = join(__dirname, '..', 'src', 'data')

// Street grid rotation (-9.2° CCW)
const GRID_ANGLE = 9.2 * Math.PI / 180
const COS_G = Math.cos(GRID_ANGLE)
const SIN_G = Math.sin(GRID_ANGLE)
function toGrid(x, z) { return [x * COS_G + z * SIN_G, -x * SIN_G + z * COS_G] }
function toWorld(gx, gz) { return [gx * COS_G - gz * SIN_G, gx * SIN_G + gz * COS_G] }

// Point-in-polygon (ray casting)
function pointInPoly(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi)
      inside = !inside
  }
  return inside
}

// Convex hull (Andrew's monotone chain)
function convexHull(points) {
  if (points.length < 3) return points.slice()
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (O, A, B) => (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length-1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], pts[i]) <= 0) upper.pop()
    upper.push(pts[i])
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

// Oriented bounding rectangle (aligned to street grid)
function orientedBoundingRect(points) {
  const gridPts = points.map(p => toGrid(p[0], p[1]))
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [gx, gz] of gridPts) {
    if (gx < minX) minX = gx; if (gx > maxX) maxX = gx
    if (gz < minZ) minZ = gz; if (gz > maxZ) maxZ = gz
  }
  return [
    toWorld(minX, minZ), toWorld(maxX, minZ),
    toWorld(maxX, maxZ), toWorld(minX, maxZ),
  ].map(p => [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10])
}

function polyArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i+1) % pts.length
    a += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1]
  }
  return Math.abs(a/2)
}

// ═══════════════════════════════════════════════════
// 1. LOAD DATA
// ═══════════════════════════════════════════════════
console.log('Loading data...')
const parcelsFile = JSON.parse(readFileSync(join(RAW_DIR, 'stl_parcels.json'), 'utf8'))
const parcels = parcelsFile.parcels.filter(p => p.rings && p.rings[0] && p.rings[0].length >= 3)
console.log(`  ${parcels.length} parcels with valid polygons`)

// Use city block polygons from HEAD as grouping regions
const headBlocks = JSON.parse(execSync('git show HEAD:src/data/blocks.json').toString())
console.log(`  ${headBlocks.blocks.length} city block polygons (from HEAD)`)

const streetsData = JSON.parse(readFileSync(join(DATA_DIR, 'streets.json'), 'utf8'))
const namedStreets = streetsData.streets.filter(s => s.name && s.name.length > 0)
console.log(`  ${namedStreets.length} named streets`)

// ═══════════════════════════════════════════════════
// 2. ASSIGN PARCELS TO CITY BLOCKS
// ═══════════════════════════════════════════════════
console.log('\nAssigning parcels to city blocks...')

// For each parcel, find which city block contains its centroid
const blockParcels = new Map() // blockId → [parcel indices]
let unassigned = 0

for (let pi = 0; pi < parcels.length; pi++) {
  const p = parcels[pi]
  const ring = p.rings[0]
  const cx = ring.reduce((s, pt) => s + pt[0], 0) / ring.length
  const cz = ring.reduce((s, pt) => s + pt[1], 0) / ring.length

  let assigned = false
  for (const block of headBlocks.blocks) {
    if (pointInPoly(cx, cz, block.points)) {
      if (!blockParcels.has(block.id)) blockParcels.set(block.id, [])
      blockParcels.get(block.id).push(pi)
      assigned = true
      break
    }
  }

  if (!assigned) {
    // Find nearest block centroid as fallback
    let bestDist = Infinity, bestId = null
    for (const block of headBlocks.blocks) {
      const bcx = block.points.reduce((s,pt) => s+pt[0], 0) / block.points.length
      const bcz = block.points.reduce((s,pt) => s+pt[1], 0) / block.points.length
      const d = (bcx-cx)**2 + (bcz-cz)**2
      if (d < bestDist) { bestDist = d; bestId = block.id }
    }
    if (bestId && bestDist < 200*200) { // within 200m
      if (!blockParcels.has(bestId)) blockParcels.set(bestId, [])
      blockParcels.get(bestId).push(pi)
    } else {
      unassigned++
    }
  }
}

console.log(`  Assigned parcels to ${blockParcels.size} blocks`)
if (unassigned > 0) console.log(`  ${unassigned} parcels unassigned (too far from any block)`)

// Show assignment counts
for (const [bid, pis] of [...blockParcels.entries()].sort((a,b) => b[1].length - a[1].length)) {
  if (pis.length >= 20) console.log(`  Block ${bid}: ${pis.length} parcels`)
}

// ═══════════════════════════════════════════════════
// 3. GENERATE CLEAN BLOCK OUTLINES
// ═══════════════════════════════════════════════════
console.log('\nGenerating clean block outlines...')

const MIN_BLOCK_AREA = 500

// Find bounding street names for a block
function findBoundingStreets(rect) {
  const names = new Set()
  for (const corner of rect) {
    let best = Infinity, bestName = ''
    for (const s of namedStreets) {
      for (const p of s.points) {
        const d = (p[0]-corner[0])**2 + (p[1]-corner[1])**2
        if (d < best) { best = d; bestName = s.name }
      }
    }
    if (bestName) names.add(bestName)
  }
  return [...names]
}

const blocks = []

for (const [blockId, parcelIndices] of blockParcels) {
  if (parcelIndices.length < 2) continue

  // Collect all boundary points
  const allPts = []
  const handles = []
  for (const pi of parcelIndices) {
    const p = parcels[pi]
    for (const pt of p.rings[0]) allPts.push(pt)
    handles.push(p.handle)
  }

  const hull = convexHull(allPts)
  const hullArea = polyArea(hull)
  if (hullArea < MIN_BLOCK_AREA) continue

  const rect = orientedBoundingRect(allPts)
  const cx = allPts.reduce((s,p) => s+p[0], 0) / allPts.length
  const cz = allPts.reduce((s,p) => s+p[1], 0) / allPts.length

  blocks.push({
    id: blockId,
    parcel_count: parcelIndices.length,
    parcels: handles,
    rect,
    hull: hull.map(p => [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]),
    area: Math.round(hullArea),
    rect_area: Math.round(polyArea(rect)),
    centroid: [Math.round(cx*10)/10, Math.round(cz*10)/10],
    bounding_streets: findBoundingStreets(rect),
  })
}

blocks.sort((a,b) => b.area - a.area)
console.log(`  ${blocks.length} blocks generated`)
for (const b of blocks.slice(0, 8)) {
  console.log(`  ${b.id}: ${b.parcel_count} parcels, ${b.area}m², streets: ${b.bounding_streets.join(', ')}`)
}

// ═══════════════════════════════════════════════════
// 4. COMPUTE STREET WIDTHS
// ═══════════════════════════════════════════════════
console.log('\nMeasuring street widths from parcel gaps...')

const streetWidths = {}
for (const street of namedStreets) {
  if (!street.points || street.points.length < 2) continue

  const samples = []
  for (const sp of street.points) {
    const idx = street.points.indexOf(sp)
    const next = street.points[Math.min(idx+1, street.points.length-1)]
    const prev = street.points[Math.max(idx-1, 0)]
    const dx = next[0]-prev[0], dz = next[1]-prev[1]
    const len = Math.sqrt(dx*dx + dz*dz) || 1
    const px = -dz/len, pz = dx/len // perpendicular

    let minL = Infinity, minR = Infinity
    for (const parcel of parcels) {
      for (const pt of parcel.rings[0]) {
        const rx = pt[0]-sp[0], rz = pt[1]-sp[1]
        const dist = Math.sqrt(rx*rx + rz*rz)
        if (dist > 50) continue
        const proj = rx*px + rz*pz
        if (proj > 0.5) minR = Math.min(minR, proj)
        else if (proj < -0.5) minL = Math.min(minL, -proj)
      }
    }
    if (minL < 50 && minR < 50) samples.push(minL + minR)
  }

  if (samples.length > 0) {
    samples.sort((a,b) => a-b)
    streetWidths[street.name] = Math.round(samples[Math.floor(samples.length/2)] * 10) / 10
  }
}

console.log('\nStreet widths (parcel-to-parcel):')
for (const name of Object.keys(streetWidths).sort()) {
  console.log(`  ${name}: ${streetWidths[name]}m`)
}

// ═══════════════════════════════════════════════════
// 5. WRITE OUTPUT
// ═══════════════════════════════════════════════════
const output = {
  _generated: new Date().toISOString(),
  _description: 'Clean city blocks from parcel boundaries, grouped by city block regions.',
  street_widths: streetWidths,
  blocks,
}

writeFileSync(join(DATA_DIR, 'blocks_clean.json'), JSON.stringify(output, null, 2))
console.log(`\nWrote blocks_clean.json: ${blocks.length} blocks, ${Object.keys(streetWidths).length} street widths`)
