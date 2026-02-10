#!/usr/bin/env node
/**
 * Offset street lamps from road centerlines to sidewalk edges.
 *
 * For each lamp:
 *   1. Find the nearest street centerline segment
 *   2. Project the lamp onto that segment to get the closest point
 *   3. Compute the perpendicular direction
 *   4. Offset by (halfROW - 1.0m) toward the side the lamp was originally on
 *
 * This moves lamps from their OSM positions (often on centerlines) to realistic
 * sidewalk-edge positions, while preserving which side of the street they're on.
 */

import { readFileSync, writeFileSync } from 'fs'

const blockData = JSON.parse(readFileSync('src/data/block_shapes.json', 'utf-8'))
const lampData = JSON.parse(readFileSync('src/data/street_lamps.json', 'utf-8'))

// Park check — don't offset lamps deep inside the park.
// Use a tight threshold (160m) so lamps on park-perimeter streets get offset.
function isInsidePark(x, z) {
  const angle = 9.2 * Math.PI / 180
  const c = Math.cos(angle), s = Math.sin(angle)
  const rx = x * c + z * s
  const rz = -x * s + z * c
  return Math.abs(rx) < 160 && Math.abs(rz) < 160
}

// Project point P onto segment AB, return { closest, t, dist, perpX, perpZ }
function projectOntoSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az
  const abLen2 = abx * abx + abz * abz
  if (abLen2 < 0.001) {
    const dist = Math.hypot(px - ax, pz - az)
    return { closest: [ax, az], t: 0, dist, perpX: 0, perpZ: 0 }
  }
  let t = ((px - ax) * abx + (pz - az) * abz) / abLen2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx, cz = az + t * abz
  const dist = Math.hypot(px - cx, pz - cz)

  // Perpendicular to segment (pointing "left" of AB direction)
  const abLen = Math.sqrt(abLen2)
  const perpX = -abz / abLen
  const perpZ = abx / abLen

  return { closest: [cx, cz], t, dist, perpX, perpZ }
}

// Flatten all street polylines into segments with halfROW info
const segments = []
for (const street of blockData.streets) {
  const halfROW = street.width / 2
  for (let i = 0; i < street.points.length - 1; i++) {
    segments.push({
      ax: street.points[i][0],
      az: street.points[i][1],
      bx: street.points[i + 1][0],
      bz: street.points[i + 1][1],
      halfROW,
      name: street.name,
    })
  }
}

console.log(`Loaded ${lampData.lamps.length} lamps, ${segments.length} street segments`)

let offsetCount = 0
let parkCount = 0
let noMatchCount = 0

const MAX_SNAP_DIST = 20 // only offset lamps within 20m of a centerline

for (const lamp of lampData.lamps) {
  if (isInsidePark(lamp.x, lamp.z)) {
    parkCount++
    continue
  }

  // Find nearest street segment
  let bestDist = Infinity
  let bestProj = null

  for (const seg of segments) {
    const proj = projectOntoSegment(lamp.x, lamp.z, seg.ax, seg.az, seg.bx, seg.bz)
    if (proj.dist < bestDist) {
      bestDist = proj.dist
      bestProj = { ...proj, halfROW: seg.halfROW, name: seg.name }
    }
  }

  if (!bestProj || bestDist > MAX_SNAP_DIST) {
    noMatchCount++
    continue
  }

  // Determine which side of the street the lamp is on
  const { closest, perpX, perpZ, halfROW } = bestProj
  const dx = lamp.x - closest[0]
  const dz = lamp.z - closest[1]
  const side = dx * perpX + dz * perpZ  // positive = left side, negative = right side

  // Offset from centerline to sidewalk (halfROW + 1.0m past curb edge)
  const offsetDist = halfROW + 1.0
  const sign = side >= 0 ? 1 : -1

  lamp.x = Math.round((closest[0] + sign * perpX * offsetDist) * 10) / 10
  lamp.z = Math.round((closest[1] + sign * perpZ * offsetDist) * 10) / 10
  offsetCount++
}

console.log(`Offset ${offsetCount} lamps to sidewalk edges`)
console.log(`Skipped ${parkCount} park lamps, ${noMatchCount} unmatched (> ${MAX_SNAP_DIST}m from any street)`)

// ── Validation pass: fix lamps that ended up inside a different road ────────
let fixCount = 0
for (const lamp of lampData.lamps) {
  if (isInsidePark(lamp.x, lamp.z)) continue

  let bestDist = Infinity
  let bestProj = null
  for (const seg of segments) {
    const proj = projectOntoSegment(lamp.x, lamp.z, seg.ax, seg.az, seg.bx, seg.bz)
    if (proj.dist < bestDist) {
      bestDist = proj.dist
      bestProj = { ...proj, halfROW: seg.halfROW, name: seg.name }
    }
  }
  if (!bestProj) continue

  // If lamp is inside this road (closer than halfROW), push it out
  if (bestDist < bestProj.halfROW - 0.5) {
    const { closest, perpX, perpZ, halfROW } = bestProj
    const dx = lamp.x - closest[0]
    const dz = lamp.z - closest[1]
    const side = dx * perpX + dz * perpZ
    const sign = side >= 0 ? 1 : -1
    const offsetDist = halfROW + 1.0

    lamp.x = Math.round((closest[0] + sign * perpX * offsetDist) * 10) / 10
    lamp.z = Math.round((closest[1] + sign * perpZ * offsetDist) * 10) / 10
    fixCount++
  }
}
console.log(`Validation pass: fixed ${fixCount} lamps that landed inside a road`)

writeFileSync('src/data/street_lamps.json', JSON.stringify(lampData))
console.log('Written to src/data/street_lamps.json')
