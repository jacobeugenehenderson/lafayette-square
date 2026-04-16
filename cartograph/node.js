/**
 * Cartograph — Step 2b: Node (split segments at intersections)
 *
 * The core topology problem: OSM gives us ways that cross each other
 * without sharing a node at the intersection. This step:
 *
 *   1. Inserts every segment into a spatial index
 *   2. Finds all segment-segment intersections
 *   3. Splits segments at intersection points (snapped to grid)
 *   4. Outputs a clean set of edges where every crossing is a shared vertex
 *
 * This is what PostGIS ST_Node does. We do it in JS so the pipeline
 * is self-contained and reproducible for any neighborhood.
 */

import { snapCoord } from './snap.js'

const EPSILON = 1e-6

// ── Segment intersection ──────────────────────────────────────────────

/**
 * Find intersection point of segments (ax1,az1)-(ax2,az2) and (bx1,bz1)-(bx2,bz2).
 * Returns [x, z] or null if parallel/no intersection.
 * Only returns interior intersections (not at endpoints).
 */
function segmentIntersection(ax1, az1, ax2, az2, bx1, bz1, bx2, bz2) {
  const dx1 = ax2 - ax1, dz1 = az2 - az1
  const dx2 = bx2 - bx1, dz2 = bz2 - bz1
  const denom = dx1 * dz2 - dz1 * dx2

  if (Math.abs(denom) < EPSILON) return null // parallel

  const t = ((bx1 - ax1) * dz2 - (bz1 - az1) * dx2) / denom
  const u = ((bx1 - ax1) * dz1 - (bz1 - az1) * dx1) / denom

  // Interior only: exclude endpoints (they're already shared if they match)
  if (t <= EPSILON || t >= 1 - EPSILON) return null
  if (u <= EPSILON || u >= 1 - EPSILON) return null

  const x = snapCoord(ax1 + t * dx1)
  const z = snapCoord(az1 + t * dz1)
  return [x, z]
}

// ── Spatial grid for broad-phase ──────────────────────────────────────

const CELL_SIZE = 20 // meters

function cellKey(x, z) {
  return `${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`
}

function segmentCells(x1, z1, x2, z2) {
  const cells = new Set()
  const minCx = Math.floor(Math.min(x1, x2) / CELL_SIZE)
  const maxCx = Math.floor(Math.max(x1, x2) / CELL_SIZE)
  const minCz = Math.floor(Math.min(z1, z2) / CELL_SIZE)
  const maxCz = Math.floor(Math.max(z1, z2) / CELL_SIZE)
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      cells.add(`${cx},${cz}`)
    }
  }
  return cells
}

// ── Main noding function ──────────────────────────────────────────────

/**
 * Takes an array of edges (each edge = array of {x, z} points, i.e. a polyline).
 * Returns a new array of edges, split at every intersection.
 * Each output edge is exactly 2 points (a segment).
 */
export function nodeEdges(polylines) {
  // Step 1: Explode polylines into segments, tracking which polyline each came from
  const segments = []
  const segSource = []  // segSource[i] = index of the polyline that produced segment i
  for (let li = 0; li < polylines.length; li++) {
    const line = polylines[li]
    for (let i = 0; i < line.length - 1; i++) {
      segments.push([line[i].x, line[i].z, line[i + 1].x, line[i + 1].z])
      segSource.push(li)
    }
  }

  console.log(`  Noding: ${segments.length} input segments`)

  // Step 2: Build spatial index
  const grid = {}
  for (let i = 0; i < segments.length; i++) {
    const [x1, z1, x2, z2] = segments[i]
    for (const cell of segmentCells(x1, z1, x2, z2)) {
      if (!grid[cell]) grid[cell] = []
      grid[cell].push(i)
    }
  }

  // Step 3: Find all intersections
  // splitPoints[i] = array of [x, z, t] for segment i
  const splitPoints = segments.map(() => [])
  const tested = new Set()
  let intCount = 0

  for (const cell of Object.keys(grid)) {
    const indices = grid[cell]
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a], j = indices[b]
        const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`
        if (tested.has(pairKey)) continue
        tested.add(pairKey)

        const [ax1, az1, ax2, az2] = segments[i]
        const [bx1, bz1, bx2, bz2] = segments[j]

        const pt = segmentIntersection(ax1, az1, ax2, az2, bx1, bz1, bx2, bz2)
        if (pt) {
          const [x, z] = pt
          // Compute t parameter for sorting splits along each segment
          const ti = Math.abs(ax2 - ax1) > Math.abs(az2 - az1)
            ? (x - ax1) / (ax2 - ax1)
            : (z - az1) / (az2 - az1)
          const tj = Math.abs(bx2 - bx1) > Math.abs(bz2 - bz1)
            ? (x - bx1) / (bx2 - bx1)
            : (z - bz1) / (bz2 - bz1)

          splitPoints[i].push([x, z, ti])
          splitPoints[j].push([x, z, tj])
          intCount++
        }
      }
    }
  }

  console.log(`  Found ${intCount} intersections`)

  // Step 4: Split segments at intersection points
  // Each output segment carries the source polyline index from the input.
  const result = []

  for (let i = 0; i < segments.length; i++) {
    const [x1, z1, x2, z2] = segments[i]
    const src = segSource[i]
    const splits = splitPoints[i]

    if (splits.length === 0) {
      result.push([{ x: x1, z: z1 }, { x: x2, z: z2 }, src])
      continue
    }

    // Sort by t parameter
    splits.sort((a, b) => a[2] - b[2])

    // Deduplicate (two intersections might snap to same point)
    const unique = [splits[0]]
    for (let k = 1; k < splits.length; k++) {
      const prev = unique[unique.length - 1]
      if (splits[k][0] !== prev[0] || splits[k][1] !== prev[1]) {
        unique.push(splits[k])
      }
    }

    // Build sub-segments
    let prevPt = { x: x1, z: z1 }
    for (const [sx, sz] of unique) {
      const splitPt = { x: sx, z: sz }
      if (splitPt.x !== prevPt.x || splitPt.z !== prevPt.z) {
        result.push([prevPt, splitPt, src])
      }
      prevPt = splitPt
    }
    const endPt = { x: x2, z: z2 }
    if (endPt.x !== prevPt.x || endPt.z !== prevPt.z) {
      result.push([prevPt, endPt, src])
    }
  }

  console.log(`  → ${result.length} output segments (after splitting)`)
  return result
}
