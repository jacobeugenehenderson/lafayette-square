/**
 * Cartograph — Derive map layers (centerline-first, four-zone model)
 *
 * Pipeline:
 *   1. Polygonize centerline network → faces
 *   2. Per-edge variable inset (survey ROW widths) → curb polygons (block boundaries)
 *   3. Lamp correction: validate/adjust widths from streetlamp positions
 *   4. Round block corners → curb returns
 *   5. Four-zone cross-section: pavement | infrastructure | sidewalk | lot
 *
 * Authority stack:
 *   - Survey ROW (assessor) → curb placement
 *   - Lamps (OSM) → correct widths, define infrastructure zone
 *   - Parcels (assessor) → lot lines, land use
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import clipperLib from 'clipper-lib'
import { STANDARDS, getStreetSpec, crossSection } from './standards.js'
import { RAW_DIR, CARTOGRAPH_DIR, wgs84ToLocal } from './config.js'
import { nodeEdges } from './node.js'
import { polygonize } from './polygonize.js'
import { classify } from './classify.js'

const { Clipper, ClipperOffset, Paths, IntPoint,
        ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib

const SCALE = 100
const ARC_TOL = 0.01 * SCALE  // 1cm — smooth arcs

function toClipper(x, z) {
  return new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))
}
function fromClipper(pt) {
  return { x: pt.X / SCALE, z: pt.Y / SCALE }
}
function pathFromClipper(p) {
  return p.map(fromClipper)
}

// Ray-casting point-in-polygon for {x, z} rings (from polygonize output)
function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z
    const xj = ring[j].x, zj = ring[j].z
    if ((zi > pz) !== (zj > pz) &&
        px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function roundCorners(paths, radius) {
  if (radius <= 0) return paths
  const r = radius * SCALE
  const co1 = new ClipperOffset()
  co1.ArcTolerance = ARC_TOL
  co1.AddPaths(paths, JoinType.jtRound, EndType.etClosedPolygon)
  const shrunk = new Paths()
  co1.Execute(shrunk, -r)
  if (shrunk.length === 0) return paths
  const co2 = new ClipperOffset()
  co2.ArcTolerance = ARC_TOL
  co2.AddPaths(shrunk, JoinType.jtRound, EndType.etClosedPolygon)
  const rounded = new Paths()
  co2.Execute(rounded, r)
  return rounded
}

function shrinkPaths(paths, dist) {
  const co = new ClipperOffset()
  co.ArcTolerance = ARC_TOL
  co.AddPaths(paths, JoinType.jtRound, EndType.etClosedPolygon)
  const result = new Paths()
  co.Execute(result, -dist * SCALE)
  return result
}

function bufferPolyline(coords, halfWidth) {
  let path = coords.map(c => toClipper(c.x, c.z))

  // If closed (first ≈ last), remove last point so Clipper treats as open path.
  // Otherwise a closed loop buffer fills the interior.
  if (path.length > 2) {
    const first = path[0], last = path[path.length - 1]
    if (Math.abs(first.X - last.X) < 1 * SCALE && Math.abs(first.Y - last.Y) < 1 * SCALE) {
      path = path.slice(0, -1)
    }
  }

  const co = new ClipperOffset()
  co.ArcTolerance = ARC_TOL
  co.AddPath(path, JoinType.jtRound, EndType.etOpenRound)
  const result = new Paths()
  co.Execute(result, halfWidth * SCALE)
  return result
}

function unionAll(pathSets) {
  if (pathSets.length === 0) return new Paths()
  const allPaths = new Paths()
  for (const ps of pathSets) {
    for (let i = 0; i < ps.length; i++) allPaths.push(ps[i])
  }
  const c = new Clipper()
  c.AddPaths(allPaths, PolyType.ptSubject, true)
  const result = new Paths()
  c.Execute(ClipType.ctUnion, result, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return result
}

/**
 * Generate contour lines from elevation grid using marching squares.
 * Returns array of { coords: [{x, z}], elev: number }
 */
function generateContours(elevData, interval) {
  const pts = elevData.points
  if (!pts || pts.length < 4) return []

  // Build a regular grid from the scattered points
  const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b)
  const zs = [...new Set(pts.map(p => p.z))].sort((a, b) => a - b)
  if (xs.length < 2 || zs.length < 2) return []

  const nx = xs.length, nz = zs.length

  // Index points into grid
  const grid = Array.from({ length: nz }, () => new Float64Array(nx))
  const ptMap = {}
  for (const p of pts) {
    ptMap[`${p.x},${p.z}`] = p.elev
  }
  for (let zi = 0; zi < nz; zi++) {
    for (let xi = 0; xi < nx; xi++) {
      grid[zi][xi] = ptMap[`${xs[xi]},${zs[zi]}`] ?? NaN
    }
  }

  // Generate contours at each level
  const minElev = Math.ceil(elevData.minElev / interval) * interval
  const maxElev = Math.floor(elevData.maxElev / interval) * interval
  const contours = []

  for (let level = minElev; level <= maxElev; level += interval) {
    // Marching squares for this level
    const segments = []

    for (let zi = 0; zi < nz - 1; zi++) {
      for (let xi = 0; xi < nx - 1; xi++) {
        const v00 = grid[zi][xi], v10 = grid[zi][xi + 1]
        const v01 = grid[zi + 1][xi], v11 = grid[zi + 1][xi + 1]
        if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) continue

        const x0 = xs[xi], x1 = xs[xi + 1]
        const z0 = zs[zi], z1 = zs[zi + 1]

        // Classify corners (above/below level)
        const code = (v00 >= level ? 8 : 0) | (v10 >= level ? 4 : 0) |
                     (v11 >= level ? 2 : 0) | (v01 >= level ? 1 : 0)
        if (code === 0 || code === 15) continue

        // Interpolate edge crossings
        const lerp = (va, vb, a, b) => a + (level - va) / (vb - va) * (b - a)
        const top    = { x: lerp(v00, v10, x0, x1), z: z0 }
        const bottom = { x: lerp(v01, v11, x0, x1), z: z1 }
        const left   = { x: x0, z: lerp(v00, v01, z0, z1) }
        const right  = { x: x1, z: lerp(v10, v11, z0, z1) }

        // Standard marching squares lookup
        const edges = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]],
          4: [[top, right]], 5: [[top, left], [bottom, right]], 6: [[top, bottom]],
          7: [[top, left]], 8: [[top, left]], 9: [[top, bottom]],
          10: [[top, right], [bottom, left]], 11: [[top, right]],
          12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
        }

        const segs = edges[code]
        if (segs) {
          for (const [a, b] of segs) {
            segments.push([
              { x: Math.round(a.x * 100) / 100, z: Math.round(a.z * 100) / 100 },
              { x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 },
            ])
          }
        }
      }
    }

    // Chain segments into polylines
    if (segments.length > 0) {
      const chains = chainSegments(segments)
      for (const chain of chains) {
        contours.push({ coords: chain, elev: level })
      }
    }
  }

  return contours
}

/**
 * Chain disconnected line segments into continuous polylines.
 */
function chainSegments(segments) {
  const SNAP = 0.5
  const used = new Set()
  const chains = []

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    used.add(i)

    const chain = [segments[i][0], segments[i][1]]

    // Extend forward
    let changed = true
    while (changed) {
      changed = false
      const tail = chain[chain.length - 1]
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const [a, b] = segments[j]
        if (Math.abs(a.x - tail.x) < SNAP && Math.abs(a.z - tail.z) < SNAP) {
          chain.push(b); used.add(j); changed = true; break
        }
        if (Math.abs(b.x - tail.x) < SNAP && Math.abs(b.z - tail.z) < SNAP) {
          chain.push(a); used.add(j); changed = true; break
        }
      }
    }

    // Extend backward
    changed = true
    while (changed) {
      changed = false
      const head = chain[0]
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue
        const [a, b] = segments[j]
        if (Math.abs(a.x - head.x) < SNAP && Math.abs(a.z - head.z) < SNAP) {
          chain.unshift(b); used.add(j); changed = true; break
        }
        if (Math.abs(b.x - head.x) < SNAP && Math.abs(b.z - head.z) < SNAP) {
          chain.unshift(a); used.add(j); changed = true; break
        }
      }
    }

    if (chain.length >= 2) chains.push(chain)
  }

  return chains
}

/**
 * Calibrate street half-widths from streetlamp positions.
 * Lamps sit on sidewalks/tree lawns — their perpendicular distance
 * from the street centerline tells us where the curb is.
 */
function calibrateFromLamps(highways, lamps) {
  const widths = {}
  if (!lamps.length) return widths

  const streets = highways.filter(f =>
    ['residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
     'tertiary', 'tertiary_link', 'unclassified'].includes(f.tags?.highway) &&
    f.tags?.name && f.coords.length >= 2
  )

  for (const st of streets) {
    const name = st.tags.name
    if (widths[name]) continue

    const coords = st.coords
    const dx = coords[coords.length - 1].x - coords[0].x
    const dz = coords[coords.length - 1].z - coords[0].z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 5) continue

    const nx = -dz / len, nz = dx / len
    const mx = (coords[0].x + coords[coords.length - 1].x) / 2
    const mz = (coords[0].z + coords[coords.length - 1].z) / 2

    const distances = []
    for (const lamp of lamps) {
      const lx = lamp.x - mx, lz = lamp.z - mz
      const along = lx * dx / len + lz * dz / len
      const perp = Math.abs(lx * nx + lz * nz)
      if (Math.abs(along) < len / 2 + 20 && perp < 25) {
        distances.push(perp)
      }
    }

    if (distances.length >= 2) {
      distances.sort((a, b) => a - b)
      // Closest lamp = curb position (lamps are at the curb/tree lawn)
      // Use the 2nd closest to avoid outliers
      widths[name] = distances.length >= 3
        ? distances[Math.floor(distances.length * 0.25)]
        : distances[0]
    }
  }

  return widths
}

/**
 * Detect divided boulevards — paired one-way streets with the same name
 * running in opposite directions close together.
 * Returns { streetName: gapBetweenCenterlines }
 */
/**
 * For each street segment, find the nearest streetlamp along the street
 * and use its perpendicular distance as the curb width. That width
 * propagates to adjacent segments until another lamp overrides it.
 */
/**
 * Lamp constraint solver: every lamp must be inside a block.
 * For each lamp outside all blocks, expand the nearest block edge outward.
 *
 * Algorithm:
 * 1. Test each lamp — inside any block?
 * 2. For lamps outside: find nearest block edge segment
 * 3. Group failed lamps by which block edge they're nearest to
 * 4. For each edge with failed lamps, push that edge out by the max lamp distance
 * 5. The edge stays straight — just shifted outward along its normal
 */
function solveLampConstraints(blocks, lamps) {
  if (!lamps.length || !blocks.length) return blocks

  // Convert blocks to JS arrays for manipulation
  const jsBlocks = []
  for (let i = 0; i < blocks.length; i++) {
    jsBlocks.push(blocks[i].map(pt => ({ X: pt.X, Y: pt.Y })))
  }

  // Test each lamp
  const failed = [] // lamps outside all blocks
  for (const lamp of lamps) {
    const lx = Math.round(lamp.x * SCALE)
    const lz = Math.round(lamp.z * SCALE)
    const pt = new IntPoint(lx, lz)

    let inside = false
    for (let bi = 0; bi < blocks.length; bi++) {
      if (Clipper.PointInPolygon(pt, blocks[bi]) !== 0) {
        inside = true
        break
      }
    }

    if (!inside) {
      failed.push({ x: lx, z: lz })
    }
  }

  console.log(`    ${failed.length} lamps outside blocks (of ${lamps.length})`)
  if (failed.length === 0) return blocks

  // For each failed lamp, find nearest block edge
  const edgeAdjustments = [] // { blockIdx, edgeIdx, distance }

  for (const lamp of failed) {
    let bestDist = Infinity
    let bestBlock = -1
    let bestEdge = -1
    let bestNormalDist = 0

    for (let bi = 0; bi < jsBlocks.length; bi++) {
      const block = jsBlocks[bi]
      for (let ei = 0; ei < block.length; ei++) {
        const a = block[ei]
        const b = block[(ei + 1) % block.length]

        // Distance from lamp to this edge segment
        const edx = b.X - a.X, edz = b.Y - a.Y
        const len2 = edx * edx + edz * edz
        if (len2 < 1) continue

        const t = Math.max(0, Math.min(1,
          ((lamp.x - a.X) * edx + (lamp.z - a.Y) * edz) / len2
        ))
        const projX = a.X + t * edx
        const projZ = a.Y + t * edz
        const dx = lamp.x - projX, dz = lamp.z - projZ
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < bestDist) {
          bestDist = dist
          bestBlock = bi
          bestEdge = ei

          // Normal distance (how far to push the edge)
          const len = Math.sqrt(len2)
          const nx = -edz / len, nz = edx / len
          bestNormalDist = (lamp.x - a.X) * nx + (lamp.z - a.Y) * nz
        }
      }
    }

    if (bestBlock >= 0 && bestDist < 30 * SCALE) {
      edgeAdjustments.push({
        blockIdx: bestBlock,
        edgeIdx: bestEdge,
        normalDist: bestNormalDist,
        lampDist: bestDist,
      })
    }
  }

  // Group adjustments by block+edge, take max distance per edge
  const edgeMax = {} // "blockIdx:edgeIdx" → max normal distance
  for (const adj of edgeAdjustments) {
    const key = `${adj.blockIdx}:${adj.edgeIdx}`
    const existing = edgeMax[key]
    if (!existing || Math.abs(adj.normalDist) > Math.abs(existing)) {
      edgeMax[key] = adj.normalDist
    }
  }

  console.log(`    ${Object.keys(edgeMax).length} block edges need adjustment`)

  // Apply adjustments: push each edge's two vertices outward along the edge normal
  // Include neighboring edges (propagate until we hit an edge that has its own lamp)
  const edgesWithLamps = new Set(Object.keys(edgeMax))

  for (const [key, normalDist] of Object.entries(edgeMax)) {
    const [bi, ei] = key.split(':').map(Number)
    const block = jsBlocks[bi]
    const n = block.length

    const a = block[ei]
    const b = block[(ei + 1) % n]
    const edx = b.X - a.X, edz = b.Y - a.Y
    const len = Math.sqrt(edx * edx + edz * edz)
    if (len < 1) continue

    // Outward normal (push away from block center)
    const nx = -edz / len, nz = edx / len

    // Determine push direction (toward the lamp, not away)
    const push = normalDist > 0 ? 1 : -1
    const amount = Math.abs(normalDist) + 2 * SCALE // add 2m margin so lamp is clearly inside

    // Move both vertices of this edge
    a.X += nx * amount * push
    a.Y += nz * amount * push
    b.X += nx * amount * push
    b.Y += nz * amount * push

    // Propagate to adjacent edges if they don't have their own lamp adjustment
    // Forward
    for (let k = 1; k < n; k++) {
      const nextEi = (ei + 1 + k) % n
      const nextKey = `${bi}:${nextEi}`
      if (edgesWithLamps.has(nextKey)) break
      const v = block[(ei + 1 + k) % n]
      v.X += nx * amount * push
      v.Y += nz * amount * push
    }
    // Backward
    for (let k = 1; k < n; k++) {
      const prevEi = (ei - k + n) % n
      const prevKey = `${bi}:${prevEi}`
      if (edgesWithLamps.has(prevKey)) break
      const v = block[(ei - k + n) % n]
      v.X += nx * amount * push
      v.Y += nz * amount * push
    }
  }

  // Convert back to Clipper Paths
  const result = new Paths()
  for (const block of jsBlocks) {
    const path = block.map(pt => new IntPoint(pt.X, pt.Y))
    result.push(path)
  }

  // Verify improvement
  let nowInside = 0
  for (const lamp of failed) {
    const pt = new IntPoint(lamp.x, lamp.z)
    for (let bi = 0; bi < result.length; bi++) {
      if (Clipper.PointInPolygon(pt, result[bi]) !== 0) { nowInside++; break }
    }
  }
  console.log(`    Fixed ${nowInside} of ${failed.length} failed lamps`)

  return result
}

function calibrateSegmentsFromLamps(streets, lamps, survey, nameWidths) {
  const widths = new Array(streets.length)

  for (let si = 0; si < streets.length; si++) {
    const f = streets[si]
    const name = f.tags?.name
    const coords = f.coords
    if (coords.length < 2) { widths[si] = 7; continue }

    const dx = coords[coords.length-1].x - coords[0].x
    const dz = coords[coords.length-1].z - coords[0].z
    const len = Math.sqrt(dx*dx + dz*dz)
    if (len < 1) { widths[si] = 7; continue }

    const nx = -dz/len, nz = dx/len
    const mx = (coords[0].x + coords[coords.length-1].x) / 2
    const mz = (coords[0].z + coords[coords.length-1].z) / 2

    // Find the closest lamp to this segment (along + perpendicular)
    let bestLampDist = Infinity
    let bestPerp = null

    for (const lamp of lamps) {
      const lx = lamp.x - mx, lz = lamp.z - mz
      const along = lx * dx/len + lz * dz/len
      const perp = Math.abs(lx * nx + lz * nz)

      // Lamp must be within reach along the street and reasonably close perpendicular
      if (perp > 1 && perp < 30) {
        // Distance along street — allow extending beyond segment to catch propagation
        const alongDist = Math.max(0, Math.abs(along) - len/2)
        // Total "closeness" — prefer lamps near this segment
        const totalDist = alongDist + perp * 0.1 // slight preference for closer perp
        if (totalDist < bestLampDist) {
          bestLampDist = totalDist
          bestPerp = perp
        }
      }
    }

    if (bestPerp !== null && bestLampDist < 100) {
      // Lamp found — use its perpendicular distance
      widths[si] = bestPerp
    } else if (name && nameWidths[name]) {
      widths[si] = nameWidths[name]
    } else if (name && survey[name]?.rowWidth) {
      widths[si] = survey[name].rowWidth / 2
    } else {
      widths[si] = 7
    }
  }

  return widths
}

function detectDividedStreets(streets) {
  const oneway = streets.filter(f => f.tags?.oneway === 'yes' && f.tags?.name)

  // Group by name
  const byName = {}
  for (const f of oneway) {
    if (!byName[f.tags.name]) byName[f.tags.name] = []
    byName[f.tags.name].push(f)
  }

  const gaps = {}
  for (const [name, segs] of Object.entries(byName)) {
    if (segs.length < 2) continue

    // Find pairs going opposite directions at similar locations
    for (let i = 0; i < segs.length; i++) {
      const c0 = segs[i].coords
      const dx0 = c0[c0.length-1].x - c0[0].x, dz0 = c0[c0.length-1].z - c0[0].z
      const len0 = Math.sqrt(dx0*dx0 + dz0*dz0)
      if (len0 < 10) continue
      const ang0 = Math.atan2(dz0, dx0)
      const mx0 = (c0[0].x + c0[c0.length-1].x) / 2
      const mz0 = (c0[0].z + c0[c0.length-1].z) / 2

      for (let j = i + 1; j < segs.length; j++) {
        const c1 = segs[j].coords
        const dx1 = c1[c1.length-1].x - c1[0].x, dz1 = c1[c1.length-1].z - c1[0].z
        const len1 = Math.sqrt(dx1*dx1 + dz1*dz1)
        if (len1 < 10) continue
        const ang1 = Math.atan2(dz1, dx1)

        // Opposite directions: angles differ by ~PI
        let angleDiff = Math.abs(ang0 - ang1)
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff

        if (angleDiff > 2.5) { // ~143°+ = roughly opposite
          // Measure perpendicular gap between midpoints
          const nx = -dz0/len0, nz = dx0/len0
          const mx1 = (c1[0].x + c1[c1.length-1].x) / 2
          const mz1 = (c1[0].z + c1[c1.length-1].z) / 2
          const gap = Math.abs((mx1-mx0)*nx + (mz1-mz0)*nz)

          if (gap > 2 && gap < 30) {
            gaps[name] = Math.max(gaps[name] || 0, gap)
          }
        }
      }
    }
  }

  return gaps
}

function clipParcelsToRoundedBlocks(parcels, parkParcelIds, roundedBlocks) {
  const result = []
  for (const p of parcels) {
    if (parkParcelIds.has(p.handle)) continue
    if (!p.rings?.length || p.rings[0].length < 3) continue

    const parcelPath = p.rings[0].map(pt => toClipper(pt[0], pt[1]))

    // Find which rounded block contains this parcel's centroid
    const cx = p.centroid ? Math.round(p.centroid[0] * SCALE) :
      parcelPath.reduce((s, pt) => s + pt.X, 0) / parcelPath.length
    const cz = p.centroid ? Math.round(p.centroid[1] * SCALE) :
      parcelPath.reduce((s, pt) => s + pt.Y, 0) / parcelPath.length
    const testPt = new IntPoint(cx, cz)

    let blockIdx = -1
    for (let i = 0; i < roundedBlocks.length; i++) {
      if (Clipper.PointInPolygon(testPt, roundedBlocks[i]) !== 0) {
        blockIdx = i; break
      }
    }

    if (blockIdx === -1) {
      // Not in any rounded block — keep as-is
      result.push({
        ring: p.rings[0].map(pt => ({ x: pt[0], z: pt[1] })),
        use: classifyLandUse(p.land_use_code),
        vacant: p.vacant || false,
      })
      continue
    }

    // Clip parcel to rounded block
    const clipper = new Clipper()
    const subj = new Paths(); subj.push(parcelPath)
    const clip = new Paths(); clip.push(roundedBlocks[blockIdx])
    clipper.AddPaths(subj, PolyType.ptSubject, true)
    clipper.AddPaths(clip, PolyType.ptClip, true)
    const clipped = new Paths()
    clipper.Execute(ClipType.ctIntersection, clipped, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

    if (clipped.length > 0) {
      // Use largest result
      let best = 0, bestArea = 0
      for (let i = 0; i < clipped.length; i++) {
        const a = Math.abs(Clipper.Area(clipped[i]))
        if (a > bestArea) { bestArea = a; best = i }
      }
      result.push({
        ring: pathFromClipper(clipped[best]),
        use: classifyLandUse(p.land_use_code),
        vacant: p.vacant || false,
      })
    }
  }
  return result
}

function classifyLandUse(code) {
  if (!code) return 'unknown'
  const c = Number(code)
  if (c >= 1010 && c <= 1019) return 'vacant'        // vacant residential
  if (c >= 1100 && c <= 1199) return 'residential'    // all residential types
  if (c >= 1300 && c <= 1399) return 'institutional'  // schools, churches
  if (c === 3000 || c === 3300 || c === 3900) return 'vacant-commercial'
  if (c >= 4000 && c <= 4999) return 'recreation'     // parks, rec
  if (c >= 5000 && c <= 5999) return 'commercial'     // commercial/retail
  if (c >= 6000 && c <= 6999) return 'institutional'  // govt, utilities
  if (c >= 7000 && c <= 7999) return 'industrial'
  if (c === 1185) return 'parking'                     // residential parking
  return 'residential'
}

function loadSurvey() {
  const p = join(RAW_DIR, 'survey.json')
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, 'utf-8')).streets || {}
}

// ══════════════════════════════════════════════════════════════════
// Centerline-first block generation
// ══════════════════════════════════════════════════════════════════

/**
 * Variable-width polygon inset: offset each edge inward by a different distance.
 *
 * For each vertex, finds the intersection of the two adjacent offset edges.
 * Works for CW-wound polygons (positive signed area in our coord system).
 *
 * @param {Array<{x,z}>} ring - Polygon vertices (CW winding)
 * @param {Array<number>} distances - Inset distance per edge (edge i = ring[i]→ring[i+1])
 * @returns {Array<{x,z}>|null} Inset polygon, or null if degenerate
 */
function variableInset(ring, distances) {
  const n = ring.length
  if (n < 3) return null

  // Compute offset edges (each edge shifted inward by its distance)
  const offsetEdges = []
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 1e-6) {
      offsetEdges.push(null)
      continue
    }
    // Inward normal for CW polygon: (-dz, dx) / len
    const nx = -dz / len, nz = dx / len
    const d = distances[i]
    offsetEdges.push({
      ax: a.x + nx * d, az: a.z + nz * d,
      bx: b.x + nx * d, bz: b.z + nz * d,
      dx, dz,
    })
  }

  // Find intersection of adjacent offset edges → new vertices
  const result = []
  const MAX_MITER_RATIO = 4.0

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n
    const prev = offsetEdges[prevIdx]
    const curr = offsetEdges[i]

    if (!prev || !curr) continue

    // Intersect the two offset lines
    const denom = prev.dx * curr.dz - prev.dz * curr.dx

    if (Math.abs(denom) < 1e-10) {
      // Parallel — use midpoint of the two offset positions
      result.push({ x: (prev.bx + curr.ax) / 2, z: (prev.bz + curr.az) / 2 })
    } else {
      const t = ((curr.ax - prev.ax) * curr.dz - (curr.az - prev.az) * curr.dx) / denom
      const ix = prev.ax + t * prev.dx
      const iz = prev.az + t * prev.dz

      // Miter limit: clamp if the new point is too far from the original vertex
      const origX = ring[i].x, origZ = ring[i].z
      const dist = Math.sqrt((ix - origX) ** 2 + (iz - origZ) ** 2)
      const maxDist = Math.max(distances[prevIdx], distances[i]) * MAX_MITER_RATIO

      if (dist > maxDist) {
        const scale = maxDist / dist
        result.push({
          x: origX + (ix - origX) * scale,
          z: origZ + (iz - origZ) * scale,
        })
      } else {
        result.push({ x: ix, z: iz })
      }
    }
  }

  if (result.length < 3) return null

  // Check that the result has positive area (not inverted)
  let area = 0
  for (let i = 0; i < result.length; i++) {
    const a = result[i]
    const b = result[(i + 1) % result.length]
    area += a.x * b.z - b.x * a.z
  }
  if (area <= 0) return null

  return result
}

/**
 * Clean a polygon via Clipper to fix self-intersections.
 * Returns the largest positive-area ring, or null.
 */
function cleanPolygon(ring) {
  const path = ring.map(p => toClipper(p.x, p.z))
  const c = new Clipper()
  const subj = new Paths(); subj.push(path)
  c.AddPaths(subj, PolyType.ptSubject, true)
  const result = new Paths()
  c.Execute(ClipType.ctUnion, result, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

  let best = null, bestArea = 0
  for (let i = 0; i < result.length; i++) {
    const area = Clipper.Area(result[i])
    if (area > bestArea) { bestArea = area; best = result[i] }
  }

  return best ? pathFromClipper(best) : null
}

/**
 * Build spatial index of original street segments for edge-to-street matching.
 */
function buildStreetSegmentIndex(streets) {
  const CELL = 20
  const grid = {}
  const entries = []

  for (let si = 0; si < streets.length; si++) {
    const f = streets[si]
    const coords = f.coords
    const name = f.tags?.name || ''

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1]
      const entry = { a, b, name, tags: f.tags, streetIdx: si }
      const idx = entries.length
      entries.push(entry)

      const minCx = Math.floor(Math.min(a.x, b.x) / CELL)
      const maxCx = Math.floor(Math.max(a.x, b.x) / CELL)
      const minCz = Math.floor(Math.min(a.z, b.z) / CELL)
      const maxCz = Math.floor(Math.max(a.z, b.z) / CELL)
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = `${cx},${cz}`
          if (!grid[key]) grid[key] = []
          grid[key].push(idx)
        }
      }
    }
  }

  return { entries, grid, CELL }
}

/**
 * Find the nearest original street segment for a given point.
 */
function findStreetForPoint(px, pz, index) {
  const cx = Math.floor(px / index.CELL)
  const cz = Math.floor(pz / index.CELL)

  let bestDist = Infinity
  let bestEntry = null

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const key = `${cx + dx},${cz + dz}`
      const indices = index.grid[key]
      if (!indices) continue

      for (const idx of indices) {
        const entry = index.entries[idx]
        const { a, b } = entry

        const edx = b.x - a.x, edz = b.z - a.z
        const len2 = edx * edx + edz * edz
        if (len2 < 1e-6) continue

        const t = Math.max(0, Math.min(1,
          ((px - a.x) * edx + (pz - a.z) * edz) / len2
        ))
        const projX = a.x + t * edx, projZ = a.z + t * edz
        const dist = Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2)

        if (dist < bestDist) {
          bestDist = dist
          bestEntry = entry
        }
      }
    }
  }

  return bestEntry
}

/**
 * Get the pavementHalfWidth for each edge of a face polygon,
 * by matching edges to original streets and looking up survey data.
 */
function getEdgeWidths(ring, sourceStreets, survey, defaultWidth) {
  const n = ring.length
  const widths = []

  for (let i = 0; i < n; i++) {
    const vertex = ring[i]
    // Each vertex carries a source index from the noded segment
    // that produced this face edge — the street it came from.
    const src = vertex.source
    if (src >= 0 && src < sourceStreets.length) {
      const street = sourceStreets[src]
      const name = street.tags?.name
      if (name && survey[name]?.pavementHalfWidth) {
        widths.push(survey[name].pavementHalfWidth)
      } else if (street.tags) {
        const spec = getStreetSpec(street.tags)
        const section = crossSection(spec)
        widths.push(section.pavement)
      } else {
        widths.push(defaultWidth)
      }
    } else {
      widths.push(defaultWidth)
    }
  }

  return widths
}

/**
 * Correct street pavementHalfWidths using lamp positions.
 *
 * Lamps are on concrete infrastructure, never in the street.
 * If a lamp is closer to the centerline than the survey says the curb is,
 * the survey is wrong — reduce the pavementHalfWidth.
 *
 * Check both sides of each street:
 *   - Lamps close on BOTH sides → street is genuinely narrower
 *   - Lamps close on ONE side → infrastructure bulge, don't narrow street
 */
function correctStreetWidths(streets, lamps, survey) {
  const corrected = {}
  for (const [name, data] of Object.entries(survey)) {
    corrected[name] = { ...data }
  }

  const defaultInfra = STANDARDS.treeLawn.width

  for (const street of streets) {
    const name = street.tags?.name
    if (!name || !corrected[name]?.pavementHalfWidth) continue
    // Trust direct measurements and assessor ROW — lamps only correct computed values
    if (corrected[name].source === 'assessor' || corrected[name].source === 'measured') continue

    const coords = street.coords
    if (coords.length < 2) continue

    const dx = coords[coords.length - 1].x - coords[0].x
    const dz = coords[coords.length - 1].z - coords[0].z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 5) continue

    const nx = -dz / len, nz = dx / len
    const mx = (coords[0].x + coords[coords.length - 1].x) / 2
    const mz = (coords[0].z + coords[coords.length - 1].z) / 2

    // Collect lamp distances per side
    const leftDists = [], rightDists = []
    for (const lamp of lamps) {
      const lx = lamp.x - mx, lz = lamp.z - mz
      const along = lx * dx / len + lz * dz / len
      const perp = lx * nx + lz * nz // signed

      if (Math.abs(along) < len / 2 + 20 && Math.abs(perp) > 1 && Math.abs(perp) < 25) {
        if (perp > 0) rightDists.push(perp)
        else leftDists.push(-perp)
      }
    }

    if (leftDists.length === 0 && rightDists.length === 0) continue

    const surveyHW = corrected[name].pavementHalfWidth
    const minLeft = leftDists.length > 0 ? Math.min(...leftDists) : null
    const minRight = rightDists.length > 0 ? Math.min(...rightDists) : null

    // Both sides have lamps closer than survey half-width → street is narrower
    if (minLeft !== null && minRight !== null) {
      const avgLampDist = (minLeft + minRight) / 2
      if (avgLampDist < surveyHW) {
        // Lamp is at curb + infra. Curb = lamp distance - infra width.
        const impliedHW = Math.max(2, avgLampDist - defaultInfra)
        corrected[name].pavementHalfWidth = impliedHW
        corrected[name].correctedBy = 'lamps-both'
      }
    }
    // One-side only: don't narrow (it's an infrastructure bulge)
  }

  return corrected
}

// ══════════════════════════════════════════════════════════════════

export function deriveLayers(highways) {
  console.log(`  ${highways.length} highway features`)

  // ── Load parcels ──────────────────────────────────────────────
  console.log('  [1/4] Loading parcels...')
  const parcelPath = join(CARTOGRAPH_DIR, '..', 'scripts', 'raw', 'stl_parcels.json')
  const parcelData = JSON.parse(readFileSync(parcelPath, 'utf-8'))
  const parcels = Object.values(parcelData.parcels)
  console.log(`    ${parcels.length} parcels`)

  // Find the park parcel(s) — exclude parcels with park/recreation land use
  // near the park center, and use the OSM park polygon instead
  const PARK_CENTER = { x: -15, z: -15 }
  const PARK_LAND_USE_CODES = new Set([4800, 4810, 4820, 4900])  // park/recreation codes
  const parkParcelIds = new Set()
  for (const parcel of parcels) {
    if (!parcel.centroid) continue
    const dx = parcel.centroid[0] - PARK_CENTER.x
    const dz = parcel.centroid[1] - PARK_CENTER.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    // Only exclude if land use is actually park/recreation
    if (dist < 250 && PARK_LAND_USE_CODES.has(parcel.land_use_code)) {
      parkParcelIds.add(parcel.handle)
    }
  }

  console.log(`    Excluding ${parkParcelIds.size} park parcel(s)`)

  // Load OSM data (for park polygon)
  const osmData = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))

  // Load OSM park polygon as a special lot
  let parkPolygon = null
  const osmLeisure = osmData.ground?.leisure || []
  const lafayettePark = osmLeisure.find(f => f.tags?.name === 'Lafayette Park' && f.isClosed)
  if (lafayettePark) {
    parkPolygon = lafayettePark.coords.map(c => toClipper(c.x, c.z))
    console.log(`    Park polygon: ${lafayettePark.coords.length} pts`)
  }

  // ── Load streetlamps (used for width correction + rendering) ──
  let streetlamps = []
  try {
    const lampRaw = JSON.parse(readFileSync(
      join(CARTOGRAPH_DIR, '..', 'scripts', 'raw', 'osm_street_lamps.json'), 'utf-8'
    ))
    const nodes = (lampRaw.elements || []).filter(e => e.type === 'node' && e.lat && e.lon)
    for (const n of nodes) {
      const [x, z] = wgs84ToLocal(n.lon, n.lat)
      streetlamps.push({
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
        type: n.tags?.lamp_type || 'street',
      })
    }
    console.log(`    ${streetlamps.length} streetlamps loaded`)
  } catch { console.log('    No streetlamp data') }

  // ── Filter street types ──────────────────────────────────────
  console.log('  [2/8] Filtering street types...')

  const vehicularStreets = highways.filter(f => {
    const t = f.tags?.highway
    return ['residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
            'tertiary', 'tertiary_link', 'unclassified'].includes(t) && f.coords.length >= 2
  })
  console.log(`    ${vehicularStreets.length} vehicular street segments`)

  const alleys = highways.filter(f =>
    f.tags?.highway === 'service' && f.tags?.service === 'alley' && f.coords.length >= 2
  )
  console.log(`    ${alleys.length} alley segments`)

  const sidewalks = highways.filter(f => f.tags?.footway === 'sidewalk' && f.coords.length >= 2)

  // Compute bounding box from all street coordinates
  let bboxMinX = Infinity, bboxMaxX = -Infinity
  let bboxMinZ = Infinity, bboxMaxZ = -Infinity
  for (const f of vehicularStreets) {
    for (const c of f.coords) {
      if (c.x < bboxMinX) bboxMinX = c.x
      if (c.x > bboxMaxX) bboxMaxX = c.x
      if (c.z < bboxMinZ) bboxMinZ = c.z
      if (c.z > bboxMaxZ) bboxMaxZ = c.z
    }
  }
  const BBOX_PAD = 50
  bboxMinX -= BBOX_PAD; bboxMaxX += BBOX_PAD
  bboxMinZ -= BBOX_PAD; bboxMaxZ += BBOX_PAD

  // ── Polygonize street network → block superstructure ────────
  console.log('  [3/8] Polygonizing street network...')

  // Feed street centerlines into noding + polygonization.
  // Interior faces of the street grid = city blocks.
  // Boundary streets that exit the area don't form closed faces,
  // so edge parcels are handled by fallback below.
  // ── Densify curved streets + extend LaSalle ──────────────────
  // S 18th curve (labeled "West 18th Street" + connected "South 18th Street")
  // has too few OSM points → faceted face boundaries. Catmull-Rom subdivision
  // adds interpolated points so blocks follow a smooth arc.
  function catmullRomPt(p0, p1, p2, p3, t) {
    const t2 = t*t, t3 = t2*t
    return {
      x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      z: 0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
    }
  }
  function densifyCoords(coords, maxSegLen) {
    if (coords.length < 2) return coords
    const result = [coords[0]]
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i-1)]
      const p1 = coords[i]
      const p2 = coords[i+1]
      const p3 = coords[Math.min(coords.length-1, i+2)]
      const segLen = Math.hypot(p2.x-p1.x, p2.z-p1.z)
      const steps = Math.max(1, Math.ceil(segLen / maxSegLen))
      for (let s = 1; s <= steps; s++) {
        result.push(catmullRomPt(p0, p1, p2, p3, s/steps))
      }
    }
    return result
  }
  const CURVE_STREETS = new Set(['West 18th Street'])
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (name && CURVE_STREETS.has(name)) {
      const before = f.coords.length
      f.coords = densifyCoords(f.coords, 3)
      console.log(`    Densified ${name}: ${before} → ${f.coords.length} points`)
    }
    // Extend LaSalle to meet S 18th at the curve
    if (name === 'Lasalle Street') {
      const last = f.coords[f.coords.length - 1]
      if (Math.abs(last.x - 492.1) < 1 && Math.abs(last.z - (-395.1)) < 1) {
        f.coords.push({ x: 506.6, z: -391.1 })
        console.log(`    Extended LaSalle to [506.6, -391.1]`)
      }
    }
  }

  const streetPolylines = vehicularStreets.map(f =>
    f.coords.map(c => ({ x: c.x, z: c.z }))
  )

  const nodedSegments = nodeEdges(streetPolylines)
  const faces = polygonize(nodedSegments)

  // Classify faces using OSM overlays
  const classifiedFaces = classify(faces, osmData)
  const blockFaces = classifiedFaces.filter(f => f.type === 'block')
  console.log(`    ${blockFaces.length} block faces from ${classifiedFaces.length} total faces`)

  // ── Independent street pavement layer ───────────────────────
  console.log('  [4/8] Buffering streets by standards...')

  const survey = loadSurvey()
  const defaultHalfWidth = crossSection(STANDARDS.streets.residential).pavement

  const correctedSurvey = correctStreetWidths(vehicularStreets, streetlamps, survey)
  const corrections = Object.values(correctedSurvey).filter(s => s.correctedBy).length
  console.log(`    ${corrections} streets corrected by lamp data`)

  // Spatial index for matching face edges to streets (used by face-inset clipping)
  const streetIndex = buildStreetSegmentIndex(vehicularStreets)

  // Detect divided roads
  const dividedStreets = new Set()
  for (const [name, data] of Object.entries(correctedSurvey)) {
    if (data.oneway && data.rowWidth && data.rowWidth > 20) {
      dividedStreets.add(name)
    }
  }
  const geoDivided = detectDividedStreets(vehicularStreets)
  for (const [name, gap] of Object.entries(geoDivided)) {
    if (!correctedSurvey[name]?.source && gap > 3 && gap < 15) {
      dividedStreets.add(name)
    }
  }
  if (dividedStreets.size > 0) {
    console.log(`    Divided roads: ${[...dividedStreets].join(', ')}`)
  }

  // Douglas-Peucker simplification
  function simplifyPolyline(coords, tolerance) {
    if (coords.length <= 2) return coords
    const a = coords[0], b = coords[coords.length - 1]
    const dx = b.x - a.x, dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    let maxDist = 0, maxIdx = 0
    for (let i = 1; i < coords.length - 1; i++) {
      const p = coords[i]
      let dist
      if (len2 < 1e-6) {
        dist = Math.sqrt((p.x - a.x) ** 2 + (p.z - a.z) ** 2)
      } else {
        const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
        const projX = a.x + t * dx, projZ = a.z + t * dz
        dist = Math.sqrt((p.x - projX) ** 2 + (p.z - projZ) ** 2)
      }
      if (dist > maxDist) { maxDist = dist; maxIdx = i }
    }
    if (maxDist <= tolerance) return [a, b]
    const left = simplifyPolyline(coords.slice(0, maxIdx + 1), tolerance)
    const right = simplifyPolyline(coords.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }

  // Buffer streets: for non-divided streets, merge all same-name segments
  // into a single polyline and buffer once. This avoids centerline offset
  // problems from independent OSM segments.
  const streetBufferPaths = new Paths()

  // Group segments by name (unnamed get buffered individually)
  const streetsByName = new Map()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (!name || dividedStreets.has(name)) {
      // Divided streets or unnamed: buffer each segment independently
      let hw
      if (name && correctedSurvey[name]?.pavementHalfWidth) {
        hw = correctedSurvey[name].pavementHalfWidth / 2
      } else if (f.tags) {
        hw = crossSection(getStreetSpec(f.tags)).pavement
      } else {
        hw = defaultHalfWidth
      }
      if (name && dividedStreets.has(name)) hw = hw / 2
      const simplified = simplifyPolyline(f.coords, 1.0)
      const buf = bufferPolyline(simplified, hw)
      for (let i = 0; i < buf.length; i++) streetBufferPaths.push(buf[i])
      continue
    }
    if (!streetsByName.has(name)) streetsByName.set(name, [])
    streetsByName.get(name).push(f)
  }

  // Chain and buffer each named non-divided street
  const SNAP = 3  // meters — endpoints within this distance are joined
  for (const [name, segs] of streetsByName) {
    let hw
    if (correctedSurvey[name]?.pavementHalfWidth) {
      hw = correctedSurvey[name].pavementHalfWidth
    } else {
      hw = crossSection(getStreetSpec(segs[0].tags)).pavement
    }

    // Chain segments into continuous polylines
    const pieces = segs.map(f => f.coords.map(c => ({ x: c.x, z: c.z })))
    const used = new Set()
    const chains = []
    for (let i = 0; i < pieces.length; i++) {
      if (used.has(i)) continue
      used.add(i)
      let chain = [...pieces[i]]
      let changed = true
      while (changed) {
        changed = false
        const tail = chain[chain.length - 1]
        for (let j = 0; j < pieces.length; j++) {
          if (used.has(j)) continue
          const pts = pieces[j]
          const dHead = Math.hypot(pts[0].x - tail.x, pts[0].z - tail.z)
          const dTail = Math.hypot(pts[pts.length-1].x - tail.x, pts[pts.length-1].z - tail.z)
          if (dHead < SNAP) { chain.push(...pts.slice(1)); used.add(j); changed = true; break }
          if (dTail < SNAP) { chain.push(...[...pts].reverse().slice(1)); used.add(j); changed = true; break }
        }
      }
      changed = true
      while (changed) {
        changed = false
        const head = chain[0]
        for (let j = 0; j < pieces.length; j++) {
          if (used.has(j)) continue
          const pts = pieces[j]
          const dHead = Math.hypot(pts[0].x - head.x, pts[0].z - head.z)
          const dTail = Math.hypot(pts[pts.length-1].x - head.x, pts[pts.length-1].z - head.z)
          if (dTail < SNAP) { chain = [...pts.slice(0, -1), ...chain]; used.add(j); changed = true; break }
          if (dHead < SNAP) { chain = [...[...pts].reverse().slice(0, -1), ...chain]; used.add(j); changed = true; break }
        }
      }
      chains.push(chain)
    }

    for (const chain of chains) {
      const simplified = simplifyPolyline(chain, 1.0)
      const buf = bufferPolyline(simplified, hw)
      for (let i = 0; i < buf.length; i++) streetBufferPaths.push(buf[i])
    }
  }

  // Build a grid-only street union for cutting blocks.
  // Loop streets and alleys do NOT cut blocks — they render on top.
  // Sidewalks go straight across them.
  const LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])
  const gridStreetPaths = new Paths()
  for (let i = 0; i < streetBufferPaths.length; i++) {
    gridStreetPaths.push(streetBufferPaths[i])
  }
  // Remove loop streets from the grid buffer (they were included via vehicularStreets)
  // We rebuild without them:
  const gridBufferPaths = new Paths()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (name && LOOP_STREET_NAMES.has(name)) continue  // skip loop streets
    let hw
    if (name && correctedSurvey[name]?.pavementHalfWidth) {
      hw = correctedSurvey[name].pavementHalfWidth
    } else if (f.tags) {
      hw = crossSection(getStreetSpec(f.tags)).pavement
    } else {
      hw = defaultHalfWidth
    }
    if (name && dividedStreets.has(name)) hw = hw / 2
    const simplified = simplifyPolyline(f.coords, 1.0)
    const buf = bufferPolyline(simplified, hw)
    for (let i = 0; i < buf.length; i++) gridBufferPaths.push(buf[i])
  }
  const gridUnionClipper = new Clipper()
  gridUnionClipper.AddPaths(gridBufferPaths, PolyType.ptSubject, true)
  const gridStreetUnion = new Paths()
  gridUnionClipper.Execute(ClipType.ctUnion, gridStreetUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

  // Union all street buffers → independent street pavement (for rendering)
  const streetUnionClipper = new Clipper()
  streetUnionClipper.AddPaths(streetBufferPaths, PolyType.ptSubject, true)
  const streetUnion = new Paths()
  streetUnionClipper.Execute(ClipType.ctUnion, streetUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  // NOTE: streetUnion will be clipped to exclude blocks after blocks are built (below)

  // ── Build blocks: parcel-union per face, face-polygon fallback ──
  console.log('  [5/8] Building blocks...')

  const radius = STANDARDS.intersection.curbReturnRadius
  const allBlockPaths = new Paths()
  const blockMeta = []

  // Assign parcels to faces — a parcel contributes to every face it overlaps
  const faceParcelMap = new Map()
  for (const parcel of parcels) {
    if (parkParcelIds.has(parcel.handle)) continue
    if (!parcel.centroid && !parcel.rings?.[0]) continue
    const assignedFaces = new Set()
    // Check centroid
    if (parcel.centroid) {
      const cx = parcel.centroid[0], cz = parcel.centroid[1]
      for (let fi = 0; fi < blockFaces.length; fi++) {
        if (pointInRing(cx, cz, blockFaces[fi].ring)) {
          assignedFaces.add(fi)
        }
      }
    }
    // Check all ring vertices — parcel belongs to every face it touches
    if (parcel.rings?.[0]) {
      for (const pt of parcel.rings[0]) {
        for (let fi = 0; fi < blockFaces.length; fi++) {
          if (assignedFaces.has(fi)) continue
          if (pointInRing(pt[0], pt[1], blockFaces[fi].ring)) {
            assignedFaces.add(fi)
          }
        }
      }
    }
    for (const fi of assignedFaces) {
      if (!faceParcelMap.has(fi)) faceParcelMap.set(fi, [])
      faceParcelMap.get(fi).push(parcel)
    }
  }

  // Load manual block patches (drawn in preview GUI)
  let blockPatches = []
  try {
    blockPatches = JSON.parse(readFileSync(join(CARTOGRAPH_DIR, 'data', 'clean', 'block_patches.json'), 'utf-8'))
    if (blockPatches.length > 0) console.log(`    ${blockPatches.length} manual block patches loaded`)
  } catch {}

  function buildParcelBlock(faceParcels, faceRing) {
    const pPaths = new Paths()
    for (const p of faceParcels) {
      if (!p.rings?.length) continue
      const r0 = p.rings[0]
      let rArea = 0
      for (let ri = 0; ri < r0.length; ri++) {
        const a = r0[ri], b = r0[(ri + 1) % r0.length]
        rArea += a[0] * b[1] - b[0] * a[1]
      }
      if (Math.abs(rArea / 2) < 20) continue
      for (const ring of p.rings) {
        const path = ring.map(pt => toClipper(pt[0], pt[1]))
        if (path.length >= 3) pPaths.push(path)
      }
    }
    // Add manual patches whose centroid falls in this face
    if (faceRing) {
      for (const patch of blockPatches) {
        if (!patch.ring || patch.ring.length < 3) continue
        const pcx = patch.ring.reduce((s, p) => s + p.x, 0) / patch.ring.length
        const pcz = patch.ring.reduce((s, p) => s + p.z, 0) / patch.ring.length
        if (pointInRing(pcx, pcz, faceRing)) {
          pPaths.push(patch.ring.map(p => toClipper(p.x, p.z)))
        }
      }
    }

    if (pPaths.length === 0) return new Paths()

    const CLOSE_DIST = 4.0
    const co1 = new ClipperOffset(); co1.ArcTolerance = ARC_TOL
    co1.AddPaths(pPaths, JoinType.jtRound, EndType.etClosedPolygon)
    const exp = new Paths(); co1.Execute(exp, CLOSE_DIST * SCALE)
    const uc = new Clipper()
    uc.AddPaths(exp, PolyType.ptSubject, true)
    const uni = new Paths()
    uc.Execute(ClipType.ctUnion, uni, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    const co2 = new ClipperOffset(); co2.ArcTolerance = ARC_TOL
    co2.AddPaths(uni, JoinType.jtRound, EndType.etClosedPolygon)
    const closed = new Paths(); co2.Execute(closed, -CLOSE_DIST * SCALE)
    if (closed.length === 0) return closed

    // Simplify block perimeter to remove footway-scale notches.
    // Parcels have indentations where footway easements cross them;
    // these survive morph-close because they're on the exterior edge.
    // Clipper's SimplifyPolygons removes self-intersections, but we
    // need to remove small concavities. Use CleanPolygons to merge
    // vertices closer than ~3m, which smooths out narrow notches.
    const CLEAN_DIST = 3.0 * SCALE
    const cleaned = new Paths()
    for (let i = 0; i < closed.length; i++) {
      const c = Clipper.CleanPolygon(closed[i], CLEAN_DIST)
      if (c.length >= 3) cleaned.push(c)
    }

    return cleaned.length > 0 ? cleaned : closed
  }

  function buildFaceBlock(faceRing) {
    const facePath = faceRing.map(p => toClipper(p.x, p.z))
    if (facePath.length < 3) return new Paths()
    const FACE_INSET = 3.0
    const co = new ClipperOffset(); co.ArcTolerance = ARC_TOL
    const fp = new Paths(); fp.push(facePath)
    co.AddPaths(fp, JoinType.jtMiter, EndType.etClosedPolygon)
    const result = new Paths(); co.Execute(result, -FACE_INSET * SCALE)
    return result
  }

  // ── Detect dead-end street endpoints ──────────────────────────
  // Only true streets (not alleys/service) — only things with sidewalks.
  // Use noded segments (post-polygonize) which are properly connected,
  // so we detect true dead ends, not multi-segment gaps.
  const DEAD_END_SNAP = 5  // tight snap on noded data (already snapped by nodeEdges)
  // Build endpoint list from the noded street segments
  const nodedEndpoints = []
  for (const seg of nodedSegments) {
    nodedEndpoints.push({ x: seg[0].x, z: seg[0].z })
    nodedEndpoints.push({ x: seg[1].x, z: seg[1].z })
  }
  // A noded vertex is a dead end if it appears in exactly 1 segment
  // (degree-1 node in the planar graph)
  const vertexDegree = {}
  for (const seg of nodedSegments) {
    for (const pt of [seg[0], seg[1]]) {
      const key = `${Math.round(pt.x*10)},${Math.round(pt.z*10)}`
      vertexDegree[key] = (vertexDegree[key] || 0) + 1
    }
  }
  const deadEndNodes = new Set()
  for (const [key, deg] of Object.entries(vertexDegree)) {
    if (deg === 1) deadEndNodes.add(key)  // degree-1 = dead end
  }

  const deadEndPoints = []
  for (const f of vehicularStreets) {
    if (LOOP_STREET_NAMES.has(f.tags?.name)) continue
    const c = f.coords
    if (c.length < 2) continue
    for (const ep of [c[0], c[c.length-1]]) {
      const key = `${Math.round(ep.x*10)},${Math.round(ep.z*10)}`
      if (!deadEndNodes.has(key)) continue
      // Skip boundary dead ends
      if (ep.x < bboxMinX + 40 || ep.x > bboxMaxX - 40 ||
          ep.z < bboxMinZ + 40 || ep.z > bboxMaxZ - 40) continue
      const isStart = ep === c[0]
      const adj = isStart ? c[1] : c[c.length - 2]
      const dx = ep.x - adj.x, dz = ep.z - adj.z
      const len = Math.sqrt(dx*dx + dz*dz)
      if (len < 0.1) continue
      const hw = (correctedSurvey[f.tags?.name]?.pavementHalfWidth) || defaultHalfWidth
      // Use a longer segment (up to 15 points / ~60m) so the pad overlaps
      // well with the existing block, preventing disconnected gaps
      const segLen = Math.min(15, c.length)
      const seg = isStart ? c.slice(0, segLen).reverse() : c.slice(c.length - segLen)
      // Pull the dead-end point BACK so the round cap (radius=cutHW)
      // doesn't extend too far past the dead end. The cap should extend
      // only about halfWidth + sidewalk zone past the pulled-back point,
      // matching the road cap + a consistent sidewalk gap.
      const swZ2 = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      // Cap should extend (cutHW - hw - 0.6) past curb cap (which is 0.6m
      // past dead end), matching the side gap. So cap extends cutHW - hw
      // past dead end, and pullback = cutHW - (cutHW - hw) = hw.
      const pullback = hw
      const lastIdx = seg.length - 1
      if (pullback > 0 && seg.length >= 2) {
        const last = seg[lastIdx]
        const prev = seg[lastIdx - 1]
        const pdx = prev.x - last.x, pdz = prev.z - last.z
        const plen = Math.sqrt(pdx*pdx + pdz*pdz)
        if (plen > pullback) {
          seg[lastIdx] = { x: last.x + pdx/plen * pullback, z: last.z + pdz/plen * pullback }
        }
      }
      deadEndPoints.push({
        x: ep.x, z: ep.z,
        dirX: dx/len, dirZ: dz/len,
        name: f.tags?.name || '',
        halfWidth: hw,
        segment: seg,
      })
    }
  }
  if (deadEndPoints.length > 0) {
    console.log(`    ${deadEndPoints.length} dead-end streets: ${[...new Set(deadEndPoints.map(d=>d.name))].join(', ')}`)
  }

  let parcelBlocks = 0, faceBlocks = 0

  for (let fi = 0; fi < blockFaces.length; fi++) {
    const face = blockFaces[fi]
    const faceParcels = faceParcelMap.get(fi) || []

    // Try parcel-union first
    let closed = buildParcelBlock(faceParcels, face.ring)

    if (faceParcels.length === 0) {
      closed = buildFaceBlock(face.ring)
      faceBlocks++
    } else {
      parcelBlocks++
      // For faces bordering the S 18th curve, parcel boundaries don't
      // extend to the curved face edge. Union parcel block with face
      // inset so the block follows the arc.
      // Detect by checking for a long run of consecutive short edges
      // (densified curve segments) on the face boundary.
      if (closed.length > 0 && face.ring.length >= 3) {
        let maxConsecutiveShort = 0, consecutive = 0
        for (let ri = 0; ri < face.ring.length; ri++) {
          const rn = (ri + 1) % face.ring.length
          const segLen = Math.hypot(face.ring[rn].x - face.ring[ri].x, face.ring[rn].z - face.ring[ri].z)
          if (segLen > 1 && segLen < 5) {
            consecutive++
            if (consecutive > maxConsecutiveShort) maxConsecutiveShort = consecutive
          } else {
            consecutive = 0
          }
        }
        if (maxConsecutiveShort >= 25 && closed.length === 1) {
          // Single-polygon parcel block next to a curve: use face inset
          // so the block edge follows the arc instead of cutting straight.
          // Use road half-width + sidewalk zone as inset (face ring is at
          // street centerline, block edge should be at property line).
          const swZone = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
          const curveInset = 6.5 + swZone  // ~6.5m road half-width + ~2.9m sidewalk
          const facePath = face.ring.map(p => toClipper(p.x, p.z))
          const fp = new Paths(); fp.push(facePath)
          const coFace = new ClipperOffset(); coFace.ArcTolerance = ARC_TOL
          coFace.AddPaths(fp, JoinType.jtRound, EndType.etClosedPolygon)
          const insetResult = new Paths()
          coFace.Execute(insetResult, -curveInset * SCALE)
          if (insetResult.length > 0) closed = insetResult
        }
      }
    }


    // Cut loop streets from blocks (so sidewalk follows the loop curve)
    const loopCutPaths = new Paths()
    for (const f of vehicularStreets) {
      const name = f.tags?.name
      if (!name || !LOOP_STREET_NAMES.has(name)) continue
      const isOneway = f.tags?.oneway === 'yes'
      const curatedHW = (correctedSurvey[name]?.pavementHalfWidth) || 2
      const renderHW = isOneway ? curatedHW : curatedHW * 2
      const swW = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      const buf = bufferPolyline(f.coords, renderHW + swW)
      for (let bi = 0; bi < buf.length; bi++) loopCutPaths.push(buf[bi])
    }
    if (loopCutPaths.length > 0) {
      // Save pre-cut block as clipping mask
      const preCut = new Paths()
      for (let i = 0; i < closed.length; i++) preCut.push(closed[i])

      const loopCutter = new Clipper()
      loopCutter.AddPaths(closed, PolyType.ptSubject, true)
      loopCutter.AddPaths(loopCutPaths, PolyType.ptClip, true)
      const afterCut = new Paths()
      loopCutter.Execute(ClipType.ctDifference, afterCut, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

      // Patch the frontage gap: for each loop street stem, add a small
      // rectangle at its entry point to fill the concavity left by the cut.
      const patchPaths = new Paths()
      for (const f of vehicularStreets) {
        const name = f.tags?.name
        if (!name || !LOOP_STREET_NAMES.has(name)) continue
        if (f.isClosed) continue  // only stems, not loops
        // Stem entry = first coordinate (the street-grid end)
        const entry = f.coords[0]
        const next = f.coords[1]
        // Stem direction at entry
        const sdx = next.x - entry.x, sdz = next.z - entry.z
        const slen = Math.sqrt(sdx * sdx + sdz * sdz)
        if (slen < 0.1) continue
        // Perpendicular = frontage direction
        const fx = -sdz / slen, fz = sdx / slen
        // Patch dimensions
        const curatedHW = (correctedSurvey[name]?.pavementHalfWidth) || 2
        const swW = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
        const halfWidth = (curatedHW * 2) + swW + 5  // stem buffer + margin
        const depth = halfWidth + 2  // just enough to cover the opening
        // Rectangle perpendicular to stem at entry
        const p1x = entry.x + fx * halfWidth, p1z = entry.z + fz * halfWidth
        const p2x = entry.x - fx * halfWidth, p2z = entry.z - fz * halfWidth
        const p3x = p2x + (sdx / slen) * depth, p3z = p2z + (sdz / slen) * depth
        const p4x = p1x + (sdx / slen) * depth, p4z = p1z + (sdz / slen) * depth
        patchPaths.push([
          toClipper(p1x, p1z), toClipper(p2x, p2z),
          toClipper(p3x, p3z), toClipper(p4x, p4z),
        ])
      }

      if (patchPaths.length > 0) {
        // Union patches with cut block
        const patcher = new Clipper()
        patcher.AddPaths(afterCut, PolyType.ptSubject, true)
        patcher.AddPaths(patchPaths, PolyType.ptClip, true)
        const patched = new Paths()
        patcher.Execute(ClipType.ctUnion, patched, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        // Clip to pre-cut boundary (patch can't extend beyond original block)
        const clipper = new Clipper()
        clipper.AddPaths(patched, PolyType.ptSubject, true)
        clipper.AddPaths(preCut, PolyType.ptClip, true)
        const clipped = new Paths()
        clipper.Execute(ClipType.ctIntersection, clipped, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        closed = clipped.length > 0 ? clipped : afterCut
      } else {
        closed = afterCut
      }
    }

    // ── Detect street-offset faces early (needed to skip dead-end cuts) ──
    let useStreetOffset = false
    for (let ci = 0; ci < closed.length && !useStreetOffset; ci++) {
      for (const pt of closed[ci]) {
        const px = pt.X / SCALE, pz = pt.Y / SCALE
        if (px > 15 && px < 55 && pz > -510 && pz < -430) { useStreetOffset = true; break }
        if (px > -270 && px < -94 && pz > -490 && pz < -410) { useStreetOffset = true; break }
        if (px > -32 && px < 268 && pz > -421 && pz < -181) { useStreetOffset = true; break }
      }
    }

    // ── Dead-end "Divide" treatment ────────────────────────────────
    // When a dead-end street is in this face, carve the road channel
    // from the block. The cut removes block material in the road zone
    // and creates a semicircular gap at the dead end.
    const deadsInFace = deadEndPoints.filter(dep => {
      for (const p of face.ring) {
        if (Math.hypot(p.x - dep.x, p.z - dep.z) < 1) return true
      }
      return false
    })
    for (const dep of deadsInFace) {
      // Check if dead end is inside the block already
      let insideBlock = false
      for (let ci = 0; ci < closed.length; ci++) {
        const ring = closed[ci].map(pt => ({ x: pt.X / SCALE, z: pt.Y / SCALE }))
        if (pointInRing(dep.x, dep.z, ring)) { insideBlock = true; break }
      }
      // If not inside, fill first — but only if the block is close to the
      // road (within ~15m). Otherwise the fill creates standalone blobs.
      if (!insideBlock) {
        let blockNearDead = false
        const proxDist = dep.halfWidth + 10  // ~16m proximity check
        for (let ci = 0; ci < closed.length && !blockNearDead; ci++) {
          for (const pt of closed[ci]) {
            if (Math.hypot(pt.X/SCALE - dep.x, pt.Y/SCALE - dep.z) < proxDist) {
              blockNearDead = true; break
            }
          }
        }
        if (!blockNearDead) continue
        const swZ = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
        const fillHW = dep.halfWidth + swZ + 5
        // Only fill near the dead end (last 3 points), not the full street
        const fillSeg = dep.segment.slice(Math.max(0, dep.segment.length - 3))
        const fillBuf = bufferPolyline(fillSeg, fillHW)
        if (fillBuf.length > 0) {
          const merger = new Clipper()
          merger.AddPaths(closed, PolyType.ptSubject, true)
          merger.AddPaths(fillBuf, PolyType.ptClip, true)
          const merged = new Paths()
          merger.Execute(ClipType.ctUnion, merged, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
          if (merged.length > 0) closed = merged
        }
      }
      // Cut the full street right-of-way: pavement + curb + tree lawn +
      // sidewalk. Flat end at dead end so sidewalk doesn't wrap around cap.
      const swZ = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      const cutHW = dep.halfWidth + swZ + 2  // road + sidewalk zone + margin
      const roadBuf = bufferPolyline(dep.segment, cutHW)
      if (roadBuf.length > 0) {
        const cutter = new Clipper()
        cutter.AddPaths(closed, PolyType.ptSubject, true)
        cutter.AddPaths(roadBuf, PolyType.ptClip, true)
        const afterCut = new Paths()
        cutter.Execute(ClipType.ctDifference, afterCut, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        if (afterCut.length > 0) closed = afterCut
      }
    }

    // ── Street-offset block (edge-case fallback) ─────────────────
    // When parcel boundaries produce jagged blocks, build the block
    // directly from street centerlines: face - street buffers at
    // per-street halfWidth + sidewalkZone. This gives perfectly straight
    // edges by construction. NOT a universal fix — invoke manually for
    // specific problem faces. Will break normal blocks if applied blindly.
    //
    // To use: check face centroid against target coordinates, or wire up
    // marker-stroke trigger. Currently hardcoded for the Mackay/Hickory
    // channel area where parcel boundaries don't align.
    const faceCx = face.ring.reduce((s, p) => s + p.x, 0) / face.ring.length
    const faceCz = face.ring.reduce((s, p) => s + p.z, 0) / face.ring.length
    // Target: Mackay/Hickory channel area (hardcoded for now)
    // Log all face centroids in broad area to find the right ones
    // Check if this face should use street-offset block instead of parcels.
    // Currently targets the Mackay/Hickory channel where parcel boundaries
    // don't align. TODO: wire up marker-stroke trigger for other areas.
    if (useStreetOffset && face.ring.length >= 3 && closed.length > 0) {
      const swZone = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
      const edgeWidths = getEdgeWidths(face.ring, vehicularStreets, correctedSurvey, 6.0)
      const streetBufs = new Paths()
      for (let ei = 0; ei < face.ring.length; ei++) {
        const a = face.ring[ei]
        const b = face.ring[(ei + 1) % face.ring.length]
        const hw = edgeWidths[ei] + swZone
        // At dead-end endpoints, pull back to match render.js street cap
        const segPts = [{ ...a }, { ...b }]
        for (let si = 0; si < 2; si++) {
          const pt = si === 0 ? a : b
          for (const dep of deadsInFace) {
            if (Math.hypot(pt.x - dep.x, pt.z - dep.z) < 2) {
              const other = si === 0 ? b : a
              const dx = other.x - pt.x, dz = other.z - pt.z
              const len = Math.hypot(dx, dz)
              if (len > dep.halfWidth) {
                segPts[si] = { x: pt.x + dx/len * dep.halfWidth, z: pt.z + dz/len * dep.halfWidth }
              }
            }
          }
        }
        const buf = bufferPolyline([segPts[0], segPts[1]], hw)
        for (let bi = 0; bi < buf.length; bi++) streetBufs.push(buf[bi])
      }
      const facePath = face.ring.map(p => toClipper(p.x, p.z))
      const fp = new Paths(); fp.push(facePath)
      const maskClipper = new Clipper()
      maskClipper.AddPaths(fp, PolyType.ptSubject, true)
      maskClipper.AddPaths(streetBufs, PolyType.ptClip, true)
      const mask = new Paths()
      maskClipper.Execute(ClipType.ctDifference, mask, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      if (mask.length > 0) closed = mask
    }

    // Smooth + round corners
    for (let i = 0; i < closed.length; i++) {
      const area = Math.abs(Clipper.Area(closed[i]))
      if (area < 50 * SCALE * SCALE) continue
      const single = new Paths(); single.push(closed[i])
      const smoothed = roundCorners(single, 1.0)
      for (let j = 0; j < smoothed.length; j++) {
        const s2 = new Paths(); s2.push(smoothed[j])
        const rounded = roundCorners(s2, radius)
        for (let k = 0; k < rounded.length; k++) {
          allBlockPaths.push(rounded[k])
          let dominant = 'residential', maxCount = 0
          const useCounts = {}
          for (const p of faceParcels) {
            const use = classifyLandUse(p.land_use_code)
            useCounts[use] = (useCounts[use] || 0) + 1
          }
          for (const [use, count] of Object.entries(useCounts)) {
            if (count > maxCount) { maxCount = count; dominant = use }
          }
          const isMedian = faceParcels.length === 0 && face.absArea < 5000
          blockMeta.push({ clipperPath: rounded[k], dominantUse: dominant, isMedian })
        }
      }
    }
  }

  // Create medians from closed loop street geometry
  // (These don't form faces in polygonize — they're dead-end loops)
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (!name || !LOOP_STREET_NAMES.has(name)) continue
    if (!f.isClosed) continue  // only the closed loop, not the stem
    // Shrink the loop inward to get the median polygon
    const loopPath = f.coords.map(c => toClipper(c.x, c.z))
    const medInset = new ClipperOffset()
    medInset.ArcTolerance = ARC_TOL
    const lp = new Paths(); lp.push(loopPath)
    medInset.AddPaths(lp, JoinType.jtRound, EndType.etClosedPolygon)
    const medPaths = new Paths()
    // Inset by road half-width + sidewalk to get green median
    const curatedHW = (correctedSurvey[name]?.pavementHalfWidth) || 2
    medInset.Execute(medPaths, -(curatedHW + 1.0) * SCALE)  // road + small gap
    for (let i = 0; i < medPaths.length; i++) {
      const area = Math.abs(Clipper.Area(medPaths[i]))
      if (area < 20 * SCALE * SCALE) continue
      allBlockPaths.push(medPaths[i])
      blockMeta.push({ clipperPath: medPaths[i], dominantUse: 'park', isMedian: true })
    }
  }


  console.log(`    ${allBlockPaths.length} blocks (${parcelBlocks} from parcels, ${faceBlocks} from face polygons, medians included)`)

  // ── SPIKE: street-offset blocks for comparison ──────────────
  // Build blocks from face − street buffers (pavementHalfWidth only,
  // block edge = curb). Run for ALL block faces so we can compare
  // the full street-offset model against the parcel-union model.
  const SPIKE = true
  const spikeBlockPaths = new Paths()
  if (SPIKE) {
    console.log('  [SPIKE] Building street-offset blocks (block edge = curb)...')
    let spikeDeadEndHits = 0
    for (let fi = 0; fi < blockFaces.length; fi++) {
      const face = blockFaces[fi]
      if (face.ring.length < 3) continue

      // Buffer each face edge by its street's pavementHalfWidth
      const edgeWidths = getEdgeWidths(face.ring, vehicularStreets, correctedSurvey, 6.0)
      const streetBufs = new Paths()
      for (let ei = 0; ei < face.ring.length; ei++) {
        const a = face.ring[ei]
        const b = face.ring[(ei + 1) % face.ring.length]
        const hw = edgeWidths[ei]
        const buf = bufferPolyline([a, b], hw)
        for (let bi = 0; bi < buf.length; bi++) streetBufs.push(buf[bi])
      }

      // Dead-end tip caps: the face has a slit going to the dead-end
      // vertex and back. The edge buffers along the slit leave a small
      // uncovered triangle at the very tip. Add a circle at the dead-end
      // point (radius = pavementHalfWidth) to close it.
      for (const f of vehicularStreets) {
        if (LOOP_STREET_NAMES.has(f.tags?.name)) continue
        const c = f.coords
        if (c.length < 2) continue
        for (const ep of [c[0], c[c.length - 1]]) {
          let onFace = false
          for (const p of face.ring) {
            if (Math.hypot(p.x - ep.x, p.z - ep.z) < 2) { onFace = true; break }
          }
          if (!onFace) continue
          const key = `${Math.round(ep.x*10)},${Math.round(ep.z*10)}`
          if (!deadEndNodes.has(key)) continue
          const hw = (correctedSurvey[f.tags?.name]?.pavementHalfWidth) || defaultHalfWidth
          // Approximate circle at the dead-end point
          const N = 24
          const circle = []
          for (let i = 0; i < N; i++) {
            const angle = (2 * Math.PI * i) / N
            circle.push(toClipper(ep.x + hw * Math.cos(angle), ep.z + hw * Math.sin(angle)))
          }
          streetBufs.push(circle)
          spikeDeadEndHits++
          break
        }
      }

      // Block = face minus street buffers
      const facePath = face.ring.map(p => toClipper(p.x, p.z))
      const fp = new Paths(); fp.push(facePath)
      const maskClipper = new Clipper()
      maskClipper.AddPaths(fp, PolyType.ptSubject, true)
      maskClipper.AddPaths(streetBufs, PolyType.ptClip, true)
      const mask = new Paths()
      maskClipper.Execute(ClipType.ctDifference, mask, PolyFillType.pftNonZero, PolyFillType.pftNonZero)

      // Round corners same as regular blocks
      for (let i = 0; i < mask.length; i++) {
        const area = Math.abs(Clipper.Area(mask[i]))
        if (area < 50 * SCALE * SCALE) continue
        const single = new Paths(); single.push(mask[i])
        const smoothed = roundCorners(single, 1.0)
        for (let j = 0; j < smoothed.length; j++) {
          const s2 = new Paths(); s2.push(smoothed[j])
          const rounded = roundCorners(s2, radius)
          for (let k = 0; k < rounded.length; k++) {
            spikeBlockPaths.push(rounded[k])
          }
        }
      }
    }
    console.log(`    [SPIKE] ${spikeBlockPaths.length} street-offset blocks, ${spikeDeadEndHits} dead-end buffers applied, ${[...new Set(blockFaces.flatMap((f,fi) => { const dvs = []; for (let ri = 0; ri < f.ring.length; ri++) { const p = f.ring[ri]; const key = Math.round(p.x*10)+","+Math.round(p.z*10); if (deadEndNodes.has(key)) dvs.push(key); } return dvs; }))].length} dead-end vertices on face rings`)
  }

  // (block_patches reserved for future gap-fill work)

  // ── Sidewalk: uniform geometric inset ────────────────────────
  console.log('  [6/8] Deriving sidewalk strips...')

  const sidewalkWidth = STANDARDS.sidewalk.width + STANDARDS.treeLawn.width
  const lotPaths = new Paths()
  const sidewalkStripPaths = new Paths()

  for (let bi = 0; bi < allBlockPaths.length; bi++) {
    const blockPath = allBlockPaths[bi]

    // Medians (loop interiors): all green, no sidewalk inset
    if (blockMeta[bi]?.isMedian) {
      lotPaths.push(blockPath)
      continue
    }

    // Uniform inset: shrink block by sidewalk width to get lot
    const single = new Paths(); single.push(blockPath)
    const shrunk = shrinkPaths(single, sidewalkWidth)

    if (shrunk.length === 0) {
      // Block too small to shrink — lot IS the block
      lotPaths.push(blockPath)
      continue
    }

    for (let i = 0; i < shrunk.length; i++) {
      lotPaths.push(shrunk[i])
    }

    // Sidewalk strip = block minus lot
    const stripClipper = new Clipper()
    const blockSingle = new Paths(); blockSingle.push(blockPath)
    stripClipper.AddPaths(blockSingle, PolyType.ptSubject, true)
    stripClipper.AddPaths(shrunk, PolyType.ptClip, true)
    const strip = new Paths()
    stripClipper.Execute(ClipType.ctDifference, strip, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    for (let i = 0; i < strip.length; i++) sidewalkStripPaths.push(strip[i])
  }

  const sidewalkEdgeCount = allBlockPaths.length > 0
    ? Math.round(lotPaths.length / allBlockPaths.length * 100) : 0
  console.log(`    ${sidewalkStripPaths.length} sidewalk strips, ${lotPaths.length} lots`)

  // ── Alleys: separate internal layer ─────────────────────────
  console.log('  [7/8] Processing alleys...')
  const alleyBuffers = alleys.map(f => {
    const co = new ClipperOffset()
    co.ArcTolerance = ARC_TOL
    co.AddPath(
      f.coords.map(c => toClipper(c.x, c.z)),
      JoinType.jtRound, EndType.etOpenRound
    )
    const result = new Paths()
    co.Execute(result, STANDARDS.alley.pavedWidth / 2 * SCALE)
    return result
  })
  const alleyRaw = unionAll(alleyBuffers)

  // Clip alleys to block polygons (internal features)
  const alleyClipper = new Clipper()
  alleyClipper.AddPaths(alleyRaw, PolyType.ptSubject, true)
  alleyClipper.AddPaths(allBlockPaths, PolyType.ptClip, true)
  const alleyUnion = new Paths()
  alleyClipper.Execute(ClipType.ctIntersection, alleyUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  console.log(`    ${alleyUnion.length} alley polygons (clipped to blocks)`)

  // ── Street markings ─────────────────────────────────────────
  const stripeMeta = []
  const bikeLanes = []
  const parkingLines = []

  for (const f of highways) {
    const t = f.tags?.highway
    if (!['residential', 'primary', 'primary_link', 'secondary', 'secondary_link',
          'tertiary', 'tertiary_link', 'unclassified'].includes(t)) continue
    if (f.coords.length < 2) continue

    const coords = f.coords.map(c => ({ x: c.x, z: c.z }))
    const name = f.tags.name || t

    if (f.tags.oneway !== 'yes') {
      stripeMeta.push({ coords, name, dashed: t === 'residential' })
    }

    const cyc = f.tags.cycleway || f.tags['cycleway:left'] || f.tags['cycleway:right']
    if (cyc === 'lane' || cyc === 'track') {
      const spec = getStreetSpec(f.tags)
      const laneOffset = (spec.lanes / 2) * spec.laneWidth
      bikeLanes.push({ coords, name, offset: laneOffset })
    }

    if (f.tags.highway !== 'service') {
      const spec = getStreetSpec(f.tags)
      if (spec.parkingWidth > 0) {
        const parkOffset = (spec.lanes / 2) * spec.laneWidth
        parkingLines.push({ coords, name, offset: parkOffset })
      }
    }
  }

  // ── Footways, cycleways, steps, paths ───────────────────────
  function bufferEach(features, hw) {
    const result = []
    for (const f of features) {
      const buf = bufferPolyline(f.coords, hw)
      for (let i = 0; i < buf.length; i++)
        result.push({ ring: pathFromClipper(buf[i]) })
    }
    return result
  }

  const footways = highways.filter(f =>
    f.tags?.highway === 'footway' && f.tags?.footway !== 'crossing' && f.tags?.footway !== 'sidewalk' && f.coords.length >= 2
  )
  const cycleways = highways.filter(f => f.tags?.highway === 'cycleway' && f.coords.length >= 2)
  const steps = highways.filter(f => f.tags?.highway === 'steps' && f.coords.length >= 2)
  const paths = highways.filter(f => (f.tags?.highway === 'path' || f.tags?.highway === 'pedestrian') && f.coords.length >= 2)

  const toFeats = (cp) =>
    Array.from({ length: cp.length }, (_, i) => ({ ring: pathFromClipper(cp[i]) }))

  // ── Elevation contours ──────────────────────────────────────
  let contours = []
  try {
    const elevData = JSON.parse(readFileSync(join(RAW_DIR, 'elevation.json'), 'utf-8'))
    contours = generateContours(elevData, 2)
    console.log(`    Contours: ${contours.length} lines (2m interval, ${elevData.minElev.toFixed(0)}-${elevData.maxElev.toFixed(0)}m)`)
  } catch { console.log('    No elevation data (run pipeline without --skip-elevation)') }

  // ── Park ────────────────────────────────────────────────────
  let parkFeats = []
  let parkSidewalkFeats = []
  if (parkPolygon) {
    parkFeats = [{ ring: pathFromClipper(parkPolygon) }]

    const PARK_SIDEWALK = 2.5
    const parkSWOffset = new ClipperOffset()
    parkSWOffset.ArcTolerance = ARC_TOL
    const parkPaths = new Paths()
    parkPaths.push(parkPolygon)
    parkSWOffset.AddPaths(parkPaths, JoinType.jtRound, EndType.etClosedPolygon)
    const parkSidewalkPaths = new Paths()
    parkSWOffset.Execute(parkSidewalkPaths, PARK_SIDEWALK * SCALE)

    parkSidewalkFeats = Array.from({ length: parkSidewalkPaths.length }, (_, i) => ({
      ring: pathFromClipper(parkSidewalkPaths[i])
    }))
    console.log(`    Park sidewalk: ${parkSidewalkFeats.length}`)
  }

  // ── Clip street pavement to exclude blocks ──────────────────
  // OSM centerlines can be off-center in the ROW, causing street buffers
  // to overlap block perimeters (and cover sidewalks). Clip streets to
  // the space between blocks so they never paint over sidewalks.
  const streetClipClipper = new Clipper()
  streetClipClipper.AddPaths(streetUnion, PolyType.ptSubject, true)
  streetClipClipper.AddPaths(allBlockPaths, PolyType.ptClip, true)
  const clippedStreets = new Paths()
  streetClipClipper.Execute(ClipType.ctDifference, clippedStreets, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const pavementFeats = toCompoundFeatures(clippedStreets)
  console.log(`    ${pavementFeats.length} street pavement polygons (clipped to exclude blocks)`)

  // ── Compute ribbons layer (3D street cross-section data) ───
  console.log('  [8/8] Computing ribbons layer...')

  // Load measurements (user overrides from the measure tool)
  let measurements = []
  try {
    const mPath = join(RAW_DIR, 'measurements.json')
    if (existsSync(mPath)) {
      measurements = JSON.parse(readFileSync(mPath, 'utf-8')).measurements || []
    }
  } catch { /* no measurements */ }

  /**
   * Resolve the cross-section profile for a street.
   * Authority: measurements.json → survey.json → standards.js defaults.
   * Returns distances from centerline: { asphalt, curb, treelawn, sidewalk, source }
   */
  function computeStreetProfile(name, tags) {
    const spec = getStreetSpec(tags || {})
    const defaults = crossSection(spec)

    // Start with standards defaults
    let asphalt = defaults.pavement
    let curb = defaults.curb
    let treelawn = defaults.treeLawnOuter
    let sidewalk = defaults.sidewalkOuter
    let source = 'standards'

    // Override with survey data if available
    const sv = correctedSurvey[name]
    if (sv?.pavementHalfWidth) {
      asphalt = sv.pavementHalfWidth
      curb = asphalt + STANDARDS.curb.width
      treelawn = curb + STANDARDS.treeLawn.width
      sidewalk = treelawn + STANDARDS.sidewalk.width
      source = sv.source || 'survey'
    }

    // Override with measurement tool data if available
    const meas = measurements.find(m => m.street === name)
    if (meas?.profile) {
      if (meas.profile.asphalt) asphalt = meas.profile.asphalt
      if (meas.profile.curb) curb = meas.profile.curb
      if (meas.profile.treelawn) treelawn = meas.profile.treelawn
      if (meas.profile.sidewalk) sidewalk = meas.profile.sidewalk
      source = 'measured'
    }

    return { asphalt, curb, treelawn, sidewalk, source }
  }

  // Build per-street ribbon data: chain same-name segments into polylines,
  // compute profiles, detect intersection points
  const ribbonsByName = new Map()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (!name) continue
    if (!ribbonsByName.has(name)) ribbonsByName.set(name, { segments: [], tags: f.tags })
    ribbonsByName.get(name).segments.push(f.coords.map(c => [c.x, c.z]))
  }

  // Chain segments into continuous polylines, producing MULTIPLE chains
  // for disconnected segments of the same street name
  function chainAllSegments(segments) {
    if (segments.length === 0) return []
    if (segments.length === 1) return [segments[0]]

    const used = new Set()
    const chains = []
    const EPS = 0.5

    while (used.size < segments.length) {
      // Start a new chain from the first unused segment
      let startIdx = -1
      for (let i = 0; i < segments.length; i++) {
        if (!used.has(i)) { startIdx = i; break }
      }
      if (startIdx === -1) break

      const result = [...segments[startIdx]]
      used.add(startIdx)

      let changed = true
      while (changed) {
        changed = false
        for (let i = 0; i < segments.length; i++) {
          if (used.has(i)) continue
          const seg = segments[i]
          const rFirst = result[0], rLast = result[result.length - 1]
          const sFirst = seg[0], sLast = seg[seg.length - 1]

          if (Math.hypot(rLast[0] - sFirst[0], rLast[1] - sFirst[1]) < EPS) {
            result.push(...seg.slice(1)); used.add(i); changed = true
          } else if (Math.hypot(rLast[0] - sLast[0], rLast[1] - sLast[1]) < EPS) {
            result.push(...[...seg].reverse().slice(1)); used.add(i); changed = true
          } else if (Math.hypot(rFirst[0] - sLast[0], rFirst[1] - sLast[1]) < EPS) {
            result.unshift(...seg.slice(0, -1)); used.add(i); changed = true
          } else if (Math.hypot(rFirst[0] - sFirst[0], rFirst[1] - sFirst[1]) < EPS) {
            result.unshift(...[...seg].reverse().slice(0, -1)); used.add(i); changed = true
          }
        }
      }
      chains.push(result)
    }
    return chains
  }

  // Build ribbon entries: each connected chain of a named street becomes one ribbon
  const ribbonStreets = []
  const intersections = []

  for (const [name, data] of ribbonsByName) {
    const chains = chainAllSegments(data.segments)
    const profile = computeStreetProfile(name, data.tags)
    for (const points of chains) {
      ribbonStreets.push({ name, points, profile, intersections: [] })
    }
  }

  // Find intersection points: use noded segments (which have shared vertices
  // at crossings) to detect where different streets' polylines meet.
  // For each noded vertex, find the closest point on each street's polyline.
  const IX_SNAP = 1.0 // meters — tolerance for matching noded vertices to polylines

  // Collect all noded intersection vertices (degree >= 3 in the noded graph)
  const nodedVertexDeg = new Map()
  for (const seg of nodedSegments) {
    for (const pt of [seg[0], seg[1]]) {
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`
      nodedVertexDeg.set(key, (nodedVertexDeg.get(key) || 0) + 1)
    }
  }

  // Intersection vertices have degree >= 3 (two streets crossing = 4 segments meeting)
  const nodedIxPts = []
  for (const seg of nodedSegments) {
    for (const pt of [seg[0], seg[1]]) {
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`
      if (nodedVertexDeg.get(key) >= 3) {
        if (!nodedIxPts.find(p => Math.hypot(p.x - pt.x, p.z - pt.z) < 0.1)) {
          nodedIxPts.push(pt)
        }
      }
    }
  }

  // For each noded intersection, find matching points on ribbon polylines
  for (const npt of nodedIxPts) {
    const matches = []
    for (let si = 0; si < ribbonStreets.length; si++) {
      const st = ribbonStreets[si]
      let bestDist = Infinity, bestIdx = -1
      for (let pi = 0; pi < st.points.length; pi++) {
        const d = Math.hypot(st.points[pi][0] - npt.x, st.points[pi][1] - npt.z)
        if (d < bestDist) { bestDist = d; bestIdx = pi }
      }
      if (bestDist < IX_SNAP) matches.push({ streetIdx: si, pointIdx: bestIdx, dist: bestDist })
    }
    if (matches.length < 2) continue

    const pt = [npt.x, npt.z]
    const ixData = { point: pt, streets: [] }
    for (const m of matches) {
      const st = ribbonStreets[m.streetIdx]
      // Snap the polyline point to the exact intersection coordinate
      st.points[m.pointIdx] = pt
      st.intersections.push({ ix: m.pointIdx, with: ixData })
      ixData.streets.push({ name: st.name, ix: m.pointIdx })
    }
    intersections.push(ixData)
  }

  // ── Face fills (land-use classification per polygonized face) ──
  // Each polygonized face gets a single land-use color. Block faces use
  // parcel majority vote; park/parking faces use their classified type.
  const faceFills = []
  for (let fi = 0; fi < classifiedFaces.length; fi++) {
    const face = classifiedFaces[fi]
    if (face.type === 'fragment') continue  // tiny artifacts, skip

    let use = face.type  // park, parking, island, water
    if (face.type === 'block') {
      // Find this face's index in blockFaces to look up parcels
      const bfi = blockFaces.indexOf(face)
      if (bfi >= 0) {
        const faceParcels = faceParcelMap.get(bfi) || []
        if (faceParcels.length > 0) {
          const useCounts = {}
          for (const p of faceParcels) {
            const u = classifyLandUse(p.land_use_code)
            useCounts[u] = (useCounts[u] || 0) + 1
          }
          let maxCount = 0
          for (const [u, count] of Object.entries(useCounts)) {
            if (count > maxCount) { maxCount = count; use = u }
          }
        } else {
          use = 'residential'  // default for blocks without parcels
        }
      }
    }
    faceFills.push({
      ring: face.ring.map(p => [p.x, p.z]),
      use,
    })
  }
  console.log(`    ${faceFills.length} face fills`)

  // Serialize (remove circular refs)
  const ribbonsLayer = {
    streets: ribbonStreets.map(st => ({
      name: st.name,
      points: st.points,
      profile: st.profile,
      intersections: st.intersections.map(ix => ({
        ix: ix.ix,
        withStreets: ix.with.streets.filter(s => s.name !== st.name).map(s => s.name),
      })),
    })),
    intersections: intersections.map(ix => ({
      point: ix.point,
      streets: ix.streets.map(s => ({ name: s.name, ix: s.ix })),
    })),
    faces: faceFills,
  }

  console.log(`    ${ribbonStreets.length} streets, ${intersections.length} intersections`)
  for (const st of ribbonsLayer.streets) {
    const tag = st.profile.source === 'standards' ? ' [DEFAULT]' : ''
    console.log(`      ${st.name}: asph=${st.profile.asphalt.toFixed(2)} sw=${st.profile.sidewalk.toFixed(2)}${tag}`)
  }

  // ── Assemble layers ─────────────────────────────────────────
  console.log('  [9/9] Assembling layers...')

  const layers = {
    pavement:       pavementFeats,                                     // streets from standards (independent)
    block:          toFeats(allBlockPaths),                             // parcel-union boundaries
    sidewalk:       toFeats(sidewalkStripPaths),                        // geometric insets where OSM confirms
    lot:            toFeats(lotPaths),                                  // block minus sidewalk strips
    parkSidewalk:   parkSidewalkFeats,
    park:           parkFeats,
    parcel:         clipParcelsToRoundedBlocks(parcels, parkParcelIds, allBlockPaths),
    alley:          toFeats(alleyUnion),                                // internal to blocks
    centerStripe:   stripeMeta,
    bikeLane:       bikeLanes,
    parkingLine:    parkingLines,
    footway:        bufferEach(footways, STANDARDS.footway.width / 2),
    cycleway:       bufferEach(cycleways, STANDARDS.cycleway.width / 2),
    steps:          bufferEach(steps, STANDARDS.steps.width / 2),
    path:           bufferEach(paths, STANDARDS.path.width / 2),
    streetlamp:     streetlamps,
    contour:        contours,
    spike:          toFeats(spikeBlockPaths),
    ribbons:        ribbonsLayer,
  }

  // Store block polygons for building clipping
  _lotPaths = allBlockPaths

  // Validate: how many lamps are inside blocks?
  let lampsInside = 0
  for (const lamp of streetlamps) {
    const pt = new IntPoint(Math.round(lamp.x * SCALE), Math.round(lamp.z * SCALE))
    for (let i = 0; i < allBlockPaths.length; i++) {
      if (Clipper.PointInPolygon(pt, allBlockPaths[i]) !== 0) { lampsInside++; break }
    }
  }
  console.log(`    Lamp validation: ${lampsInside}/${streetlamps.length} lamps inside blocks (${(100 * lampsInside / streetlamps.length).toFixed(0)}%)`)

  console.log('  Layers:')
  for (const [n, f] of Object.entries(layers)) {
    if (f.length > 0) console.log(`    ${n}: ${f.length}`)
  }

  return layers
}

function toCompoundFeatures(clipperPaths) {
  const outers = [], holes = []
  for (let i = 0; i < clipperPaths.length; i++) {
    const area = Clipper.Area(clipperPaths[i])
    const ring = pathFromClipper(clipperPaths[i])
    if (area >= 0) outers.push({ ring, cp: clipperPaths[i] })
    else holes.push({ ring, cp: clipperPaths[i] })
  }
  const features = []
  const used = new Set()
  for (const o of outers) {
    const myH = []
    for (let h = 0; h < holes.length; h++) {
      if (used.has(h)) continue
      if (Clipper.PointInPolygon(holes[h].cp[0], o.cp) !== 0) {
        myH.push(holes[h].ring)
        used.add(h)
      }
    }
    features.push({ ring: o.ring, holes: myH.length ? myH : undefined })
  }
  return features
}

/**
 * Compute building footprints.
 *
 * For OSM-sourced buildings we *used to* scale by sqft/stories because
 * OSM footprints were unreliable. MSBF footprints are ML-derived from
 * recent aerial imagery and are already accurate — scaling them based
 * on gross-sqft-per-story is actively wrong (gross sqft includes wall
 * thickness, stairwells, etc., so the target area is not the real
 * footprint area). So we pass MSBF through untouched.
 *
 * The `source` argument is 'microsoft' or 'osm' (from pipeline.js).
 */
export function deriveBuildings(buildings, source = 'osm') {
  // Curated project data / MSBF: pass through, no scaling.
  if (source === 'project' || source === 'microsoft') {
    const result = buildings.map(b => ({
      ring: b.coords.map(c => ({ x: c.x, z: c.z })),
      projectId: b.projectId,
      msbfId: b.msbfId,
      tags: b.tags,
      elev: b.elev || null,
    })).filter(b => b.ring.length >= 3)
    console.log(`  Buildings: ${result.length} ${source} footprints kept as-is (no scaling)`)
    return result
  }

  // OSM path: the original fix-up logic, unchanged.
  return _deriveBuildingsOSM(buildings)
}

function _deriveBuildingsOSM(buildings) {
  // Load enriched buildings with sqft data, indexed by position for matching
  let enrichedList = []
  try {
    const bd = JSON.parse(readFileSync(
      join(CARTOGRAPH_DIR, '..', 'src', 'data', 'buildings.json'), 'utf-8'
    ))
    enrichedList = Object.values(bd.buildings || bd).filter(b => b.position && b.building_sqft)
    console.log(`  Building enrichment: ${enrichedList.length} with sqft data`)
  } catch { console.log('  No enriched building data') }

  const result = []
  let scaled = 0, kept = 0

  for (const b of buildings) {
    const ring = b.coords.map(c => ({ x: c.x, z: c.z }))
    if (ring.length < 3) continue

    // Match by proximity — find enriched building closest to this one's centroid
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length
    const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length

    let match = null, bestDist = 5 // max 5m matching radius
    for (const e of enrichedList) {
      const dx = e.position[0] - cx
      const dz = e.position[2] - cz
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d < bestDist) { bestDist = d; match = e }
    }

    if (match?.building_sqft && match?.stories) {
      const SQFT_TO_SQM = 0.0929
      const targetArea = (match.building_sqft * SQFT_TO_SQM) / match.stories

      // Current footprint area (shoelace formula)
      let currentArea = 0
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length
        currentArea += ring[i].x * ring[j].z - ring[j].x * ring[i].z
      }
      currentArea = Math.abs(currentArea) / 2

      if (currentArea > 1 && targetArea > 1) {
        // Scale factor: sqrt because area scales as square of linear dimension
        const scale = Math.sqrt(targetArea / currentArea)

        // Only shrink, never grow (rooflines >= foundations)
        // And only if meaningfully different (> 5%)
        if (scale < 0.95) {
          // Scale around centroid
          const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length
          const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length

          const scaledRing = ring.map(p => ({
            x: Math.round((cx + (p.x - cx) * scale) * 100) / 100,
            z: Math.round((cz + (p.z - cz) * scale) * 100) / 100,
          }))

          result.push({
            ring: scaledRing,
            osmId: b.osmId, tags: b.tags, elev: b.elev || null,
          })
          scaled++
          continue
        }
      }
    }

    // No sqft data or scale not needed — keep as-is
    result.push({
      ring, osmId: b.osmId, tags: b.tags, elev: b.elev || null,
    })
    kept++
  }

  console.log(`  Buildings: ${scaled} scaled from assessor data, ${kept} kept as-is`)
  return result
}

export let _lotPaths = null
