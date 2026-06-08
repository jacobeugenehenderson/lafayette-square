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
import { RAW_DIR, CLEAN_DIR, CARTOGRAPH_DIR, wgs84ToLocal } from './config.js'
import { nodeEdges } from './node.js'
import { polygonize } from './polygonize.js'
import { classify } from './classify.js'
import { defaultMeasure, defaultSideMeasure, measureFromSeed, CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
// [D2] The block-face DCEL walk — runs HERE at prebake now (the face freeze);
// tileGround consumes the frozen result and keeps this same function only as
// its fallback for pre-D2 artifacts.
import { extractFaces } from '../src/lib/tileGround.js'

const { Clipper, ClipperOffset, Paths, IntPoint, PolyTree,
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

  // Load OSM data (for park polygon fallback)
  const osmData = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))

  // Park polygon: prefer the authored 4-corner polygon; fall back to the
  // OSM leisure=park trace only if the authored file is missing. Authored
  // polygon is the canonical source per the ribbon doctrine — clean
  // 4-corner topology means the round-corners op + the three corner-plug
  // components (asphalt / curb / concrete) reconcile cleanly. The OSM
  // trace's 41-vertex slow turns at each corner produce dirty plug
  // geometry; never use it as the geometry authority when we have an
  // authored polygon. See cartograph/FEATURES.md "The ribbon doctrine".
  let parkPolygon = null
  const authoredParkPath = join(CLEAN_DIR, 'park-polygon.json')
  if (existsSync(authoredParkPath)) {
    const authored = JSON.parse(readFileSync(authoredParkPath, 'utf-8'))
    parkPolygon = authored.corners.map(([x, z]) => toClipper(x, z))
    console.log(`    Park polygon: ${authored.corners.length} authored corners (${authored.name || 'unnamed'})`)
  } else {
    const osmLeisure = osmData.ground?.leisure || []
    const lafayettePark = osmLeisure.find(f => f.tags?.name === 'Lafayette Park' && f.isClosed)
    if (lafayettePark) {
      parkPolygon = lafayettePark.coords.map(c => toClipper(c.x, c.z))
      console.warn(`    [park] Using OSM 41-vertex polygon — authored 4-corner polygon expected at ${authoredParkPath}; corner plugs will degrade.`)
    }
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
            'tertiary', 'tertiary_link', 'unclassified',
            // Freeway corridor — included so the I-44 edge of the
            // neighborhood reads as real geography rather than absence.
            'motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(t) && f.coords.length >= 2
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
  // ── Densify curved streets (Goldilocks, offset-safe) ─────────
  // Curved streets with too few OSM points → faceted face boundaries. Catmull-
  // Rom subdivision adds interpolated points so blocks follow a smooth arc.
  // (Formerly two per-name hacks here — see the [Vesalius P1] note below.)
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
  // [Vesalius P1-frame-enrichment] Replaced two frame-thinness hacks here:
  //   (a) the per-name `CURVE_STREETS=['West 18th Street']` densify, and
  //   (b) the `Lasalle Street` magic-coordinate extend — which forensics found
  //       was already a DEAD no-op (its guard never matched current raw OSM).
  // (a) is generalized to a principled Goldilocks curve-densify: any vehicular
  // street that actually bends (max interior turn > CURVE_TURN) is subdivided
  // to CURVE_MAX_SEG so a wide ribbon offset of its block face stays kink-free
  // (OSM-FORENSICS.md Part 3.3 — density target set by the widest ribbon, a
  // frame-quality rule, not a per-street patch). Densify preserves the ring
  // bbox, so blockKey stays stable. The deeper fix — routing the faces path
  // through the enriched skeleton instead of raw OSM — is the Layer-2 unify.
  const CURVE_TURN = 12 * Math.PI / 180   // a "real bend" threshold
  const CURVE_MAX_SEG = 5                  // meters between samples on a bend
  let densifiedCurves = 0
  for (const f of vehicularStreets) {
    const c = f.coords
    if (c.length < 3) continue
    let maxTurn = 0
    for (let i = 1; i < c.length - 1; i++) {
      const a1 = Math.atan2(c[i].z - c[i-1].z, c[i].x - c[i-1].x)
      const a2 = Math.atan2(c[i+1].z - c[i].z, c[i+1].x - c[i].x)
      let t = Math.abs(a2 - a1); if (t > Math.PI) t = 2 * Math.PI - t
      if (t > maxTurn) maxTurn = t
    }
    if (maxTurn > CURVE_TURN) { f.coords = densifyCoords(c, CURVE_MAX_SEG); densifiedCurves++ }
  }
  console.log(`    Densified ${densifiedCurves} curved streets (Goldilocks, max-seg ${CURVE_MAX_SEG}m)`)

  const streetPolylines = vehicularStreets.map(f =>
    f.coords.map(c => ({ x: c.x, z: c.z }))
  )

  // Inject neighborhood boundary as closing edges (dense polyline so face
  // rings step through many short segments rather than one long chord —
  // avoids visible straight edges in the fade zone).
  try {
    const boundaryData = JSON.parse(readFileSync(
      join(CARTOGRAPH_DIR, 'data', 'lafayette-square', 'neighborhood_boundary.json'), 'utf-8'
    ))
    const boundaryRing = boundaryData.boundary.map(([x, z]) => ({ x, z }))
    if (boundaryRing.length > 2) {
      const first = boundaryRing[0], last = boundaryRing[boundaryRing.length - 1]
      if (first.x !== last.x || first.z !== last.z) boundaryRing.push({ x: first.x, z: first.z })
      streetPolylines.push(boundaryRing)
      console.log(`    Injected neighborhood boundary (${boundaryRing.length} points)`)
    }
  } catch (e) {
    console.log(`    (no neighborhood_boundary.json — skipping: ${e.message})`)
  }

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
    blockPatches = JSON.parse(readFileSync(join(CLEAN_DIR, 'block_patches.json'), 'utf-8'))
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

  // Which streets have operator-marked caps? Used below to skip the tip-cap
  // circle-cut so the ribbon cap paints over the face without leaving
  // uncovered half-circle artifacts.
  const streetNamesWithOperatorCaps = new Set()
  try {
    const cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(cPath)) {
      const cd = JSON.parse(readFileSync(cPath, 'utf-8'))
      for (const cl of (cd.streets || [])) {
        if (cl.name && (cl.capStart || cl.capEnd || cl.deadEnd)) {
          streetNamesWithOperatorCaps.add(cl.name)
        }
      }
    }
  } catch { /* ignore */ }

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
      // Skip when the operator has marked this street with a cap — the
      // ribbon cap covers 180°, so a full 360° cut here leaves the other
      // 180° exposed as a "green artifact." Let the cap render on top.
      for (const f of vehicularStreets) {
        if (LOOP_STREET_NAMES.has(f.tags?.name)) continue
        const c = f.coords
        if (c.length < 2) continue
        if (streetNamesWithOperatorCaps.has(f.tags?.name)) continue
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
  // Per-street ROW buffer out to the computed back-of-sidewalk — the SAME
  // math that drives ribbon rendering, so the alley clip line matches the
  // visible sidewalk back-edge per street (not a standards-based average).
  // Preference order: centerlines.json measure (per-side, surveyor-authored)
  // → standards.crossSection fallback.
  let _centerlineForAlleys = new Map()
  try {
    const _cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(_cPath)) {
      const cd = JSON.parse(readFileSync(_cPath, 'utf-8'))
      for (const st of (cd.streets || [])) {
        if (!st.name || _centerlineForAlleys.has(st.name)) continue
        _centerlineForAlleys.set(st.name, st)
      }
    }
  } catch { /* no centerlines */ }

  const _rowBufferPaths = new Paths()
  for (const f of vehicularStreets) {
    const name = f.tags?.name
    if (name && LOOP_STREET_NAMES.has(name)) continue
    let rowHW
    const cl = _centerlineForAlleys.get(name)
    if (cl?.measure?.left && cl?.measure?.right) {
      const L = cl.measure.left, R = cl.measure.right
      // Full spectrum: pavement + curb + treelawn + sidewalk (matches
      // streetProfiles.getHalfWidth — the exact back-of-sidewalk reach
      // that StreetRibbons renders).
      const lCurb = L.terminal === 'none' ? 0 : CURB_WIDTH
      const rCurb = R.terminal === 'none' ? 0 : CURB_WIDTH
      const leftOuter  = L.pavementHW + lCurb + (L.treelawn || 0) + (L.sidewalk || 0)
      const rightOuter = R.pavementHW + rCurb + (R.treelawn || 0) + (R.sidewalk || 0)
      rowHW = Math.max(leftOuter, rightOuter)
    } else {
      const hw = f.tags?.highway
      const type = hw === 'motorway' ? 'motorway'
                 : hw === 'motorway_link' || hw === 'trunk_link' ? 'motorway_link'
                 : hw === 'trunk' ? 'trunk'
                 : hw === 'primary' ? 'primary'
                 : hw === 'secondary' || hw === 'tertiary' ? 'secondary'
                 : 'residential'
      // Pass survey so fallback streets (Chouteau, Jefferson, Dolman, …)
      // still pick up their surveyed pavementHalfWidth + sidewalk offsets.
      const dm = defaultMeasure(type, correctedSurvey[name])
      const L = dm.left, R = dm.right
      const lCurb = L.terminal === 'none' ? 0 : CURB_WIDTH
      const rCurb = R.terminal === 'none' ? 0 : CURB_WIDTH
      const leftOuter  = L.pavementHW + lCurb + (L.treelawn || 0) + (L.sidewalk || 0)
      const rightOuter = R.pavementHW + rCurb + (R.treelawn || 0) + (R.sidewalk || 0)
      rowHW = Math.max(leftOuter, rightOuter)
    }
    // NOTE: no divide-by-2 for divided streets here.  For alley clipping we
    // want the ROW buffer to reach the outer back-of-sidewalk regardless of
    // whether the OSM centerline represents the whole pavement or one half.
    const simplified = simplifyPolyline(f.coords, 1.0)
    const buf = bufferPolyline(simplified, rowHW)
    for (let i = 0; i < buf.length; i++) _rowBufferPaths.push(buf[i])
  }
  const streetROWUnion = new Paths()
  {
    const c = new Clipper()
    c.AddPaths(_rowBufferPaths, PolyType.ptSubject, true)
    c.Execute(ClipType.ctUnion, streetROWUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  }

  const alleyKeptPieces = new Paths()
  const alleyCenterlines = []  // {name, points:[[x,z]], pavedWidth}
  for (const f of alleys) {
    if (!f.coords || f.coords.length < 2) continue
    const linePath = f.coords.map(c => toClipper(c.x, c.z))
    const lineClipper = new Clipper()
    lineClipper.AddPath(linePath, PolyType.ptSubject, false)  // open
    lineClipper.AddPaths(streetROWUnion, PolyType.ptClip, true)
    const tree = new PolyTree()
    lineClipper.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    const trimmedSegs = Clipper.OpenPathsFromPolyTree(tree)
    for (const seg of trimmedSegs) {
      if (seg.length < 2) continue
      let segLen = 0
      for (let k = 1; k < seg.length; k++) {
        const dx = (seg[k].X - seg[k - 1].X) / SCALE
        const dy = (seg[k].Y - seg[k - 1].Y) / SCALE
        segLen += Math.hypot(dx, dy)
      }
      // Drop tiny fragments (OSM polyline ends that barely poked past a
      // curb — they'd buffer into useless stubs on far sides of streets).
      if (segLen < 8) continue
      // Emit centerline (pre-buffer polyline) so StreetRibbons can render
      // the alley as a proper ribbon (centerline spine + silhouette + edge
      // strokes) matching street treatment in Survey/Measure/Design.
      const pts = []
      for (let k = 0; k < seg.length; k++) {
        pts.push([seg[k].X / SCALE, seg[k].Y / SCALE])
      }
      alleyCenterlines.push({
        name: f.tags?.name || null,
        points: pts,
        pavedWidth: STANDARDS.alley.pavedWidth,
      })
      const co = new ClipperOffset()
      co.ArcTolerance = ARC_TOL
      // etOpenButt: flat cap terminating at the polyline endpoint (no
      // bulge past it).  Alley ends flush at the block boundary where
      // the polyline was trimmed — no rounded caps, no pavement poke.
      co.AddPath(seg, JoinType.jtRound, EndType.etOpenButt)
      const buf = new Paths()
      co.Execute(buf, STANDARDS.alley.pavedWidth / 2 * SCALE)
      for (let i = 0; i < buf.length; i++) alleyKeptPieces.push(buf[i])
    }
  }
  // Union overlapping kept pieces (alleys meeting at T/+ junctions).
  const alleyUnion = new Paths()
  {
    const c = new Clipper()
    c.AddPaths(alleyKeptPieces, PolyType.ptSubject, true)
    c.Execute(ClipType.ctUnion, alleyUnion, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  }
  console.log(`    ${alleyUnion.length} alley polygons (block-trim polyline, caps inside sidewalk)`)

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
  // Emit path centerlines alongside polygons so StreetRibbons can render
  // them as roadway ribbons (centerline + silhouette + edge strokes) in
  // Survey/Measure/Design, matching the street/alley treatment.
  function centerlinesFor(features, kind, width) {
    const out = []
    for (const f of features) {
      if (!f.coords || f.coords.length < 2) continue
      out.push({
        name: f.tags?.name || null,
        kind,
        points: f.coords.map(c => [c.x, c.z]),
        pavedWidth: width,
      })
    }
    return out
  }

  const footways = highways.filter(f =>
    f.tags?.highway === 'footway' && f.tags?.footway !== 'crossing' && f.tags?.footway !== 'sidewalk' && f.coords.length >= 2
  )
  const cycleways = highways.filter(f => f.tags?.highway === 'cycleway' && f.coords.length >= 2)
  const steps = highways.filter(f => f.tags?.highway === 'steps' && f.coords.length >= 2)
  const paths = highways.filter(f => (f.tags?.highway === 'path' || f.tags?.highway === 'pedestrian') && f.coords.length >= 2)

  const pathCenterlines = [
    ...centerlinesFor(footways,  'footway',  STANDARDS.footway.width),
    ...centerlinesFor(cycleways, 'cycleway', STANDARDS.cycleway.width),
    ...centerlinesFor(steps,     'steps',    STANDARDS.steps.width),
    ...centerlinesFor(paths,     'path',     STANDARDS.path.width),
  ]

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

  // Load centerlines (surveyor-curated street metadata + optional measure).
  // `measure: {left, right}` is the current schema; per-name first-segment wins.
  let centerlineByName = new Map()
  try {
    const cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(cPath)) {
      const cd = JSON.parse(readFileSync(cPath, 'utf-8'))
      for (const st of (cd.streets || [])) {
        if (!st.name) continue
        if (!centerlineByName.has(st.name)) {
          centerlineByName.set(st.name, st)
        } else if (st.measure && !centerlineByName.get(st.name).measure) {
          centerlineByName.set(st.name, st)
        }
      }
    }
  } catch { /* no centerlines */ }

  // Map OSM highway tag → streetProfiles.js type vocabulary
  function mapHighwayToStreetType(highway) {
    switch (highway) {
      case 'motorway':       return 'motorway'
      case 'motorway_link':  return 'motorway_link'
      case 'trunk':          return 'trunk'
      case 'trunk_link':     return 'motorway_link'
      case 'primary': case 'primary_link': return 'primary'
      case 'secondary': case 'secondary_link':
      case 'tertiary': case 'tertiary_link': return 'secondary'
      case 'service':  return 'service'
      case 'footway':  return 'footway'
      case 'cycleway': return 'cycleway'
      case 'pedestrian': return 'pedestrian'
      case 'steps':    return 'steps'
      default:         return 'residential'
    }
  }

  /**
   * Resolve the cross-section measure for a street. Returns {left, right, source}
   * where each side is {pavementHW, treelawn, sidewalk, terminal}.
   *
   * Authority: skeleton seed → survey-driven default. The seed IS the width
   * base (E1): skeleton.js bakes custom (survey.json) → OSM lanes → AASHTO
   * into it, per side, name-propagated to every chain (divided carriageways
   * included; their median sides are zeroed by the divided-pair pass below).
   * The operator's overlay wins upstream of this call (overlay = tweaks only).
   *
   * The legacy centerlines.json measure tier was REMOVED here (E1): its 11
   * measured names are all carried by overlay.json already (migrate-overlay
   * broadcast them), so the tier could only re-shadow the seed base with
   * stale machine values — South 18th's pavementHW=2 lived there.
   */
  function computeStreetMeasure(name, tags, seed) {
    const type = mapHighwayToStreetType(tags?.highway)

    if (seed) {
      const m = measureFromSeed(seed, type)
      return {
        left: m.left,
        right: m.right,
        symmetric: m.symmetric,
        source: seed.widthSource === 'survey' ? 'seed-survey' : 'seed',
      }
    }

    const survey = correctedSurvey[name]
    const d = defaultMeasure(type, survey)
    return {
      left: d.left,
      right: d.right,
      source: survey?.rowWidth ? 'survey-default' : 'default',
    }
  }

  // Street geometry comes from skeleton.json (Phase 0). Skeleton has already
  // welded same-name fragments, collapsed divided pairs (where listed in
  // DIVIDED_PAIRS), simplified, and fixed direction. Every skeleton entry
  // becomes one ribbon chain here — no re-welding, no reversal-detection,
  // no substantive-ratio heuristics. If Park Ave still splits into three
  // chains, that's because it isn't in DIVIDED_PAIRS yet; the signal is
  // visible and correct.
  const skelPath = join(CLEAN_DIR, 'skeleton.json')
  if (!existsSync(skelPath)) {
    throw new Error(`skeleton.json not found at ${skelPath}. Run \`node skeleton.js\` first.`)
  }
  const skeleton = JSON.parse(readFileSync(skelPath, 'utf-8'))
  const skelStreets = skeleton.streets || []

  // Operator-intent overlay: skelId-keyed measure/caps/segmentMeasures/
  // couplers/anchor overrides written by Survey + Measure tools. The
  // Designer runtime merges these the same way (useCartographStore.js
  // `_loadCenterlines`); applying here makes the bake reflect operator
  // edits, otherwise pipeline reads stale defaults and Stage diverges
  // from Designer Preview.
  let overlayById = {}
  try {
    const overlayPath = join(CLEAN_DIR, 'overlay.json')
    if (existsSync(overlayPath)) {
      const overlay = JSON.parse(readFileSync(overlayPath, 'utf-8'))
      overlayById = overlay.streets || {}
    }
  } catch { /* no overlay; bake from defaults */ }

  const ribbonStreets = []
  const intersections = []
  for (const s of skelStreets) {
    if (!s.name || !s.points || s.points.length < 2) continue
    const points = s.points.map(p => [p.x, p.z])
    const ov = overlayById[s.id] || null
    // Measure: overlay override → computeStreetMeasure default fallback.
    // `_measureAuthored` distinguishes operator-authored overlay measures from
    // name-keyed/default fallbacks — the divided-pair pass below normalizes
    // NON-authored carriageway measures to the inner-edge model (corridor
    // facts must not land verbatim on a carriageway's sides — that is the
    // broadcast smear that flooded every LS median, D1). Underscore-prefixed,
    // so the serializer whitelist drops it from the artifact.
    const ovAuthored = !!(ov?.measure?.left && ov?.measure?.right)
    const measure = ovAuthored
      ? ov.measure
      : computeStreetMeasure(s.name, { highway: s.highway }, s.seed)
    const street = {
      name: s.name,
      points,
      measure,
      intersections: [],
      oneway: !!s.oneway,
      skelId: s.id,
      phase: s.phase || null,
      // OSM highway class carried through from skeleton.js so V2 corner
      // radii (and any other class-conditional logic) can resolve to
      // the right AASHTO/NACTO defaults. Falls back to 'residential'
      // when missing — matches mapHighwayToStreetType's default.
      highway: s.highway || 'residential',
      type: mapHighwayToStreetType(s.highway),
      _measureAuthored: ovAuthored,
      // [P1 frame-enrichment] Carry the enriched frame fields off the skeleton
      // street so they survive into ribbons.json. These are PRESENT-but-not-yet-
      // consumed (the consumers — caps→chainPavementRing, seed→computeStreetMeasure,
      // chainGap/continuesAs — wire up at the Wall / Layer-2). Plumbing only.
      ...(Number.isFinite(s.lanes) ? { lanes: s.lanes } : {}),
      ...(s.surface ? { surface: s.surface } : {}),
      ...(s.maxspeed ? { maxspeed: s.maxspeed } : {}),
      ...(s.seed ? { seed: s.seed } : {}),
      ...(s.caps ? { caps: s.caps } : {}),
      ...(s.continuesAs ? { continuesAs: s.continuesAs } : {}),
      // [Part 2 grade separation] Carry the frame's grade flag through so the
      // face consumer (tileGround.extractFaces) can exclude grade-separated
      // roads from the planar face walk — the fix for the interchange-triangle /
      // sliver / false-block degenerates, which are grade-separated centerlines
      // crossing in 2D without a shared vertex. `gradeSeparated` is the operative
      // one-field filter (`streets.filter(s => !s.gradeSeparated)`); layer/bridge/
      // tunnel are the raw facts for any finer rule. See HANDOFF-onframe-faces.
      gradeSeparated: !!s.gradeSeparated,
      ...(s.layer ? { layer: s.layer } : {}),
      ...(s.bridge ? { bridge: true } : {}),
      ...(s.tunnel ? { tunnel: true } : {}),
    }
    // Skel owns geometric couplers; overlay-authored couplers override.
    if (ov?.couplers) street.couplers = ov.couplers
    else if (s.couplers) street.couplers = s.couplers
    if (ov?.segmentMeasures) street.segmentMeasures = ov.segmentMeasures
    if (ov?.anchor) street.anchor = ov.anchor
    if (ov?.innerSign) street.innerSign = ov.innerSign
    if (ov?.disabled) street.disabled = true
    // capEnds: overlay-first; legacy centerlines.json fallback runs below.
    if (ov?.capStart || ov?.capEnd) {
      street.capEnds = { start: ov.capStart || null, end: ov.capEnd || null }
    }
    ribbonStreets.push(street)
  }
  console.log(`    ${ribbonStreets.length} ribbon chains from skeleton (${skelStreets.length} skeleton streets, ${Object.keys(overlayById).length} overlay overrides)`)

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

  // For each noded intersection, find matching points on ribbon polylines.
  // Skeleton polylines are RDP-simplified, so an intersection often falls
  // on the INTERIOR of a segment rather than at a vertex. We project the
  // noded intersection onto the nearest segment of each polyline; if the
  // projection lies within IX_SEG_SNAP of a segment, we splice a new
  // vertex at the projection (unless an endpoint of that segment is
  // already within IX_VERTEX_SNAP, in which case we snap the vertex).
  const IX_SEG_SNAP = 3.0    // meters — how close an OSM-noded intersection must lie to a skeleton segment
  const IX_VERTEX_SNAP = 0.2 // meters — only "snap" (move) an existing vertex if it's already essentially at the intersection
  // When ≥2 noded intersections land within this distance on the SAME chain,
  // they represent effectively one junction location; merging their splice
  // points into a single vertex avoids 0.2–0.8m micro-segments at junctions
  // that collapse into needles/notches once offset inward by band depth.
  // (IX_VERTEX_SNAP dedups a splice against EXISTING vertices; this dedups
  // candidate splice points against EACH OTHER.) Tunable.
  const IX_INTER_SPLICE_SNAP = 1.0 // meters — merge near-coincident NEW splice points on the same chain
  const MICRO_SEG_COLLAPSE = 0.8   // meters — collapse residual micro-segments at intersection vertices post-splice
                                   // (covers the 0.2–0.8m junction-clustering band; kept below ~1m so genuinely
                                   //  distinct closely-noded junctions — e.g. motorway ramp nodes 1–2m apart — survive)

  // Apply splices in descending pointIdx order so earlier indices stay
  // valid. Collect first, sort, then mutate.
  const splicesByStreet = new Map()
  const ixMatches = []
  for (const npt of nodedIxPts) {
    const matches = []
    for (let si = 0; si < ribbonStreets.length; si++) {
      const st = ribbonStreets[si]
      let best = { dist: Infinity, segIdx: -1, t: 0, projX: 0, projZ: 0 }
      for (let pi = 0; pi < st.points.length - 1; pi++) {
        const ax = st.points[pi][0], az = st.points[pi][1]
        const bx = st.points[pi + 1][0], bz = st.points[pi + 1][1]
        const dx = bx - ax, dz = bz - az
        const len2 = dx * dx + dz * dz
        if (len2 < 1e-9) continue
        let t = ((npt.x - ax) * dx + (npt.z - az) * dz) / len2
        t = Math.max(0, Math.min(1, t))
        const px = ax + t * dx, pz = az + t * dz
        const d = Math.hypot(px - npt.x, pz - npt.z)
        if (d < best.dist) best = { dist: d, segIdx: pi, t, projX: px, projZ: pz }
      }
      if (best.dist < IX_SEG_SNAP) matches.push({ streetIdx: si, ...best })
    }
    if (matches.length < 2) continue
    ixMatches.push({ npt, matches })
  }

  for (const { npt, matches } of ixMatches) {
    const pt = [npt.x, npt.z]
    const ixData = { point: pt, streets: [] }
    for (const m of matches) {
      const st = ribbonStreets[m.streetIdx]
      // Decide: snap to an endpoint of the matched segment, or splice a
      // new vertex at the projection.
      const a = st.points[m.segIdx], b = st.points[m.segIdx + 1]
      const dA = Math.hypot(a[0] - npt.x, a[1] - npt.z)
      const dB = Math.hypot(b[0] - npt.x, b[1] - npt.z)
      let targetIdx
      if (dA < IX_VERTEX_SNAP && dA <= dB) {
        st.points[m.segIdx] = pt
        targetIdx = m.segIdx
      } else if (dB < IX_VERTEX_SNAP) {
        st.points[m.segIdx + 1] = pt
        targetIdx = m.segIdx + 1
      } else {
        // Schedule a splice; apply in descending order later.
        // `t` is the projection parameter along segment afterIdx→afterIdx+1.
        const list = splicesByStreet.get(m.streetIdx) || []
        list.push({ afterIdx: m.segIdx, t: m.t, point: pt, ixData })
        splicesByStreet.set(m.streetIdx, list)
        continue
      }
      st.intersections.push({ ix: targetIdx, with: ixData })
      ixData.streets.push({ name: st.name, ix: targetIdx })
    }
    intersections.push(ixData)
  }

  // Apply splices in descending (afterIdx, t) order so earlier indices
  // stay valid AND multiple splices onto the same segment land in
  // increasing-t order in the final polyline (later-spliced points get
  // pushed before earlier ones, so splice LAST what should end up FIRST).
  for (const [streetIdx, list] of splicesByStreet) {
    const st = ribbonStreets[streetIdx]
    list.sort((a, b) => (b.afterIdx - a.afterIdx) || (b.t - a.t))

    // ── Inter-splice dedup ──────────────────────────────────────────
    // Merge splice points that land within IX_INTER_SPLICE_SNAP of each
    // other (by actual coords) into a SINGLE group. Each group becomes
    // one spliced vertex; ALL its source intersections are recorded at
    // that one index (so no genuine crossing is dropped — only the
    // duplicate VERTEX is). Walk the sorted list (descending afterIdx,t,
    // i.e. by decreasing position along the chain) and start a new group
    // whenever the next splice is farther than the tolerance from the
    // current group's representative point.
    const groups = []
    let cur = null
    for (const sp of list) {
      if (cur && Math.hypot(sp.point[0] - cur.point[0], sp.point[1] - cur.point[1]) <= IX_INTER_SPLICE_SNAP) {
        cur.ixDatas.push(sp.ixData)
      } else {
        // Representative position = the LAST splice in chain order within
        // the group (largest afterIdx/t); since the list is descending,
        // that is the FIRST splice we see, so seed the group from it.
        cur = { afterIdx: sp.afterIdx, point: sp.point, ixDatas: [sp.ixData] }
        groups.push(cur)
      }
    }

    for (const { afterIdx, point, ixDatas } of groups) {
      const newIdx = afterIdx + 1
      st.points.splice(newIdx, 0, point)
      // Shift any previously-recorded intersections on this street whose
      // ix >= newIdx up by 1 (they moved due to the splice).
      for (const prev of st.intersections) {
        if (prev.ix >= newIdx) prev.ix += 1
      }
      for (const ix of intersections) {
        for (const s of ix.streets) {
          if (s.name === st.name && s.ix >= newIdx) s.ix += 1
        }
      }
      // Record every source intersection of this merged group at the one
      // shared vertex index.
      for (const ixData of ixDatas) {
        st.intersections.push({ ix: newIdx, with: ixData })
        ixData.streets.push({ name: st.name, ix: newIdx })
      }
    }
  }

  // ── Collapse residual micro-segments at intersection vertices ──────
  // The inter-splice dedup above only merges NEW splice points against each
  // other. A noded intersection can still land within ~IX_VERTEX_SNAP of an
  // EXISTING skeleton vertex (snapped) while a second intersection splices a
  // new vertex a fraction of a metre away — leaving a <MICRO_SEG_COLLAPSE
  // segment between two vertices that offsets inward into a needle/notch.
  // For each such short segment we either:
  //   • drop the NON-intersection endpoint (merge it into the IX vertex), or
  //   • if BOTH endpoints are intersection vertices (two distinct noded
  //     crossings effectively coincident at this scale), merge them into the
  //     LOWER vertex and re-point the upper vertex's intersection records to
  //     it — so no genuine crossing is dropped, only the duplicate vertex.
  // Segments with NEITHER endpoint at an intersection are left alone (real
  // skeleton/RDP geometry, not a junction artifact). Never drop an endpoint
  // of the chain.
  let microCollapsed = 0
  for (let si = 0; si < ribbonStreets.length; si++) {
    const st = ribbonStreets[si]
    if (!st.points || st.points.length < 3) continue
    const isIx = () => new Set(st.intersections.map(x => x.ix))
    let ix = isIx()
    // Walk high→low so removals don't invalidate lower indices.
    for (let i = st.points.length - 2; i >= 0; i--) {
      const a = st.points[i], b = st.points[i + 1]
      const d = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (d >= MICRO_SEG_COLLAPSE || d < 1e-9) continue
      const aIx = ix.has(i), bIx = ix.has(i + 1)
      if (!aIx && !bIx) continue // real geometry — not a junction artifact
      // Choose which vertex to drop. Prefer dropping a non-IX endpoint;
      // for IX-to-IX, drop the upper (i+1) and keep the lower (i).
      let dropIdx, keepIdx
      if (aIx && !bIx) { dropIdx = i + 1; keepIdx = i }
      else if (bIx && !aIx) { dropIdx = i; keepIdx = i + 1 }
      else { dropIdx = i + 1; keepIdx = i } // both IX
      const lastIdx = st.points.length - 1
      // Never drop a chain endpoint. If the chosen drop is an endpoint
      // (e.g. a terminal junction sliver), flip to drop the inner vertex so
      // the geometric terminus is preserved — but only when the survivor is
      // itself an intersection vertex (so we don't move a non-IX endpoint).
      if (dropIdx === 0 || dropIdx === lastIdx) {
        if ((keepIdx === 0 || keepIdx === lastIdx) || !ix.has(keepIdx)) continue
        const tmp = dropIdx; dropIdx = keepIdx; keepIdx = tmp
      }
      st.points.splice(dropIdx, 1)
      // Re-point records AT dropIdx onto the surviving vertex; shift records
      // ABOVE dropIdx down by one. keepIdx itself shifts down if it was above.
      const survivor = keepIdx > dropIdx ? keepIdx - 1 : keepIdx
      const remap = (rec) => {
        if (rec.ix === dropIdx) rec.ix = survivor
        else if (rec.ix > dropIdx) rec.ix -= 1
      }
      for (const prev of st.intersections) remap(prev)
      for (const isec of intersections) {
        for (const s of isec.streets) {
          if (s.name === st.name) remap(s)
        }
      }
      microCollapsed++
      ix = isIx()
    }
  }
  if (microCollapsed) console.log(`    Collapsed ${microCollapsed} micro-segment(s) at junctions`)

  // ── Emit capEnds from operator-marked centerlines ──────────────
  // Per-chain emission: for each ribbon chain, scan all centerlines of the
  // same name and apply cap flags whose endpoint matches the chain's endpoint
  // (handles reversed direction too). This fixes two bugs:
  //   - caps lost when centerlineByName kept a different segment per name
  //   - caps over-spread to every chain of a multi-chain street
  const centerlinesByName = new Map()
  try {
    const cPath = join(RAW_DIR, 'centerlines.json')
    if (existsSync(cPath)) {
      const cd = JSON.parse(readFileSync(cPath, 'utf-8'))
      for (const cl of (cd.streets || [])) {
        if (!cl.name) continue
        if (!centerlinesByName.has(cl.name)) centerlinesByName.set(cl.name, [])
        centerlinesByName.get(cl.name).push(cl)
      }
    }
  } catch { /* ignore */ }
  const PTS_EQ_TOL = 2  // meters — endpoints within this are "the same"
  function ptsNear(a, b) {
    const ax = a[0] ?? a.x, az = a[1] ?? a.z
    const bx = b[0] ?? b.x, bz = b[1] ?? b.z
    return Math.hypot(ax - bx, az - bz) <= PTS_EQ_TOL
  }
  for (const st of ribbonStreets) {
    // Overlay-supplied caps win; skip the legacy fallback for these chains.
    if (st.capEnds && (st.capEnds.start || st.capEnds.end)) continue
    let capStart = null, capEnd = null
    const chFirst = st.points[0], chLast = st.points[st.points.length - 1]
    for (const cl of (centerlinesByName.get(st.name) || [])) {
      let cStart = cl.capStart ?? null
      let cEnd = cl.capEnd ?? null
      if (cStart === null && cEnd === null && cl.deadEnd) cEnd = cl.capStyle || 'round'
      if (!cStart && !cEnd) continue
      if (!cl.points || cl.points.length < 2) continue
      const clFirst = cl.points[0], clLast = cl.points[cl.points.length - 1]
      // Match by endpoint. Handle reversed polyline: if chain's start == cl's end,
      // then cl.capEnd belongs to chain's start.
      if (cStart && ptsNear(chFirst, clFirst)) capStart = capStart || cStart
      if (cStart && ptsNear(chLast,  clFirst)) capEnd   = capEnd   || cStart
      if (cEnd   && ptsNear(chFirst, clLast))  capStart = capStart || cEnd
      if (cEnd   && ptsNear(chLast,  clLast))  capEnd   = capEnd   || cEnd
    }
    st.capEnds = { start: capStart, end: capEnd }
  }

  // ── Face fills (land-use classification per polygonized face) ──
  // Each polygonized face gets a single land-use color. Block faces:
  //   1. OSM landuse/leisure/natural/amenity polygons (authoritative) —
  //      whichever LU category covers the most area of this face wins.
  //   2. Parcel majority vote (fallback when no OSM polygon hits the face).
  //   3. 'residential' default (when neither is available).
  const OSM_TO_LU = {
    'landuse:retail': 'commercial', 'landuse:commercial': 'commercial',
    'landuse:residential': 'residential', 'landuse:industrial': 'industrial',
    'landuse:religious': 'institutional',
    'landuse:grass': 'recreation', 'landuse:recreation_ground': 'recreation',
    'landuse:allotments': 'recreation', 'landuse:construction': 'vacant',
    'leisure:garden': 'recreation', 'leisure:playground': 'recreation',
    'leisure:swimming_pool': 'recreation', 'leisure:pitch': 'recreation',
    'leisure:sports_centre': 'recreation',
    'natural:wood': 'recreation', 'natural:scrub': 'recreation', 'natural:tree_row': 'recreation',
    'amenity:school': 'institutional', 'amenity:place_of_worship': 'institutional',
    'amenity:library': 'institutional', 'amenity:university': 'institutional',
    'amenity:fire_station': 'institutional', 'amenity:crematorium': 'institutional',
    'amenity:fuel': 'commercial', 'amenity:cafe': 'commercial',
    'amenity:bar': 'commercial', 'amenity:restaurant': 'commercial',
    'amenity:fast_food': 'commercial', 'amenity:veterinary': 'commercial',
    'amenity:charging_station': 'commercial', 'amenity:parking': 'parking',
    'amenity:waste_disposal': 'industrial',
  }
  // Collect every OSM polygon with an LU mapping, annotate with centroid + area.
  function ringArea(coords) {
    let a = 0
    for (let i = 0; i < coords.length; i++) {
      const p = coords[i], q = coords[(i + 1) % coords.length]
      a += (p.x ?? p[0]) * (q.z ?? q[1]) - (q.x ?? q[0]) * (p.z ?? p[1])
    }
    return Math.abs(a / 2)
  }
  const osmLUPolys = []
  for (const [cat, key] of [['landuse','landuse'],['leisure','leisure'],['natural','natural'],['amenity','amenity']]) {
    for (const f of (osmData.ground?.[cat] || [])) {
      const subtype = f.tags?.[key]
      if (!subtype) continue
      const lu = OSM_TO_LU[`${cat}:${subtype}`]
      if (!lu) continue
      if (!f.coords || f.coords.length < 3) continue
      let sx = 0, sz = 0
      for (const p of f.coords) { sx += p.x; sz += p.z }
      osmLUPolys.push({
        lu,
        cx: sx / f.coords.length, cz: sz / f.coords.length,
        area: ringArea(f.coords),
      })
    }
  }
  console.log(`    OSM LU-annotated polygons: ${osmLUPolys.length}`)

  const faceFills = []
  let osmClassified = 0, parcelClassified = 0
  for (let fi = 0; fi < classifiedFaces.length; fi++) {
    const face = classifiedFaces[fi]
    if (face.type === 'fragment') continue

    let use = face.type
    if (face.type === 'block') {
      // OSM vote by area: for each OSM polygon whose centroid is inside this
      // face, add its area to the (face, lu) tally.
      const osmAreas = {}
      for (const o of osmLUPolys) {
        if (!pointInRing(o.cx, o.cz, face.ring)) continue
        osmAreas[o.lu] = (osmAreas[o.lu] || 0) + o.area
      }
      let bestLU = null, bestArea = 0
      for (const [u, a] of Object.entries(osmAreas)) {
        if (a > bestArea) { bestArea = a; bestLU = u }
      }
      if (bestLU) { use = bestLU; osmClassified++ }
      else {
        // Fall back to parcel majority vote.
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
            parcelClassified++
          } else {
            use = 'residential'
          }
        }
      }
    }
    faceFills.push({
      ring: face.ring.map(p => [p.x, p.z]),
      use,
    })
  }
  console.log(`    ${faceFills.length} face fills (${osmClassified} via OSM, ${parcelClassified} via parcels)`)

  // Park face polygon override: if an authored park polygon exists, replace
  // the polygonized park face's ring with the 4 authored corners. The
  // polygonization inherits OSM's 41-vertex slow-turn corners; the authored
  // polygon has clean 4-corner topology so V2's round-corners op + the
  // three corner-plug components reconcile cleanly. Targets the largest
  // park-classified face whose centroid sits inside the authored polygon.
  // See cartograph/FEATURES.md "The ribbon doctrine".
  if (parkPolygon) {
    const authoredRing = pathFromClipper(parkPolygon).map(p => [p.x, p.z])
    function ringAreaXZ(ring) {
      let a = 0
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length]
        a += p[0] * q[1] - q[0] * p[1]
      }
      return Math.abs(a / 2)
    }
    function ringCentroid(ring) {
      let sx = 0, sz = 0
      for (const v of ring) { sx += v[0]; sz += v[1] }
      return [sx / ring.length, sz / ring.length]
    }
    const authoredCentroid = ringCentroid(authoredRing)
    const authoredAuthorRing = authoredRing.map(([x, z]) => ({ x, z }))
    let bestIdx = -1, bestArea = 0
    for (let i = 0; i < faceFills.length; i++) {
      const f = faceFills[i]
      if (f.use !== 'park') continue
      const c = ringCentroid(f.ring)
      // Centroid of the polygonized face must lie inside the authored polygon.
      if (!pointInRing(c[0], c[1], authoredAuthorRing)) continue
      const area = ringAreaXZ(f.ring)
      if (area > bestArea) { bestArea = area; bestIdx = i }
    }
    if (bestIdx >= 0) {
      const before = faceFills[bestIdx].ring.length
      faceFills[bestIdx] = { ring: authoredRing, use: 'park' }
      console.log(`    Park face overridden: ${before} polygonized vertices → ${authoredRing.length} authored corners`)
    } else {
      console.warn(`    [park] No polygonized park face matched authored polygon centroid; override skipped.`)
    }
  }

  // Face fills are emitted UNCLIPPED (extending to street centerlines).
  // StreetRibbons.jsx clips them at render time against the live ribbon
  // silhouette so blocks shrink/grow as Measure drags widths.

  // ── Corridors, divided pairs, medians, anchors ─────────────
  // Phase 4 (Path B): skeleton.js now classifies each chain as
  // single/spine or carriageway-A/-B, with corridorName and start/end
  // node coords stamped into `street.phase`. We consume that directly
  // — no perpendicular-distance hunting, no oneway-edge pair detection.
  //
  // One pass builds:
  //   - corridors[]  → per-name ordered list of phases (single | divided)
  //                    plus transition nodes; consumed by ribbons.json.
  //   - dividedPairs → list of {aIdx, bIdx} carriageway pairs; drives
  //                    median ring construction and anchor stamping.
  //
  // The median ring itself is purely geometric: walk A forward, B
  // reversed, close the ring. Pick the larger-area orientation as a
  // self-intersection guard for figure-eight cases.
  function polygonArea(ring) {
    let a = 0
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i]
      const [x2, z2] = ring[(i + 1) % ring.length]
      a += x1 * z2 - x2 * z1
    }
    return a / 2
  }
  function innerSideSign(aPoints, bPoints) {
    // FACE ADJACENCY, not a centroid vote: which side of A is the inner
    // (median-facing) side = which side of A bounds the inter-carriageway
    // face = which side faces the MATE LOCALLY. Per segment of A, drop the
    // midpoint's FOOT on B's polyline and vote toward the foot, weighted by
    // segment length. The old form voted every segment, unweighted, toward
    // B's global CENTROID — on a snaking corridor a segment's perp can point
    // away from the centroid while the mate runs right alongside (s18-6
    // verified flipped; the E3.4 foot-vote bug class). The local foot is the
    // operational half-edge adjacency until the D2 face freeze carries it as
    // a frozen face fact (OSM2STREETS-GROUNDING §2 'innerSign' row).
    // CONVENTION (pin it here, it has bitten twice — see tileGround.js:347):
    // the perp used below, (-dz, dx), is what production's measure calls the
    // RIGHT-perp. So innerSign === +1 means the partner (the median) lies on
    // the measure-RIGHT side → inboard key 'right'; -1 → 'left'. This matches
    // tileGround.isMedianFacing and streetProfiles.innerEdgeMeasure exactly.
    const bPts = bPoints.map(p => [p[0], p[1]])
    const bCum = arcLengths(bPts)
    let acc = 0
    for (let i = 0; i < aPoints.length - 1; i++) {
      const dx = aPoints[i + 1][0] - aPoints[i][0]
      const dz = aPoints[i + 1][1] - aPoints[i][1]
      const L = Math.hypot(dx, dz)
      if (L < 1e-9) continue
      // measure-RIGHT perpendicular of the point-order tangent.
      const px = -dz / L, pz = dx / L
      const mx = (aPoints[i][0] + aPoints[i + 1][0]) / 2
      const mz = (aPoints[i][1] + aPoints[i + 1][1]) / 2
      const foot = pointAtS(bPts, bCum, closestOnPolyline([mx, mz], bPts, bCum).s)
      const dot = (foot[0] - mx) * px + (foot[1] - mz) * pz
      if (Math.abs(dot) < 1e-6) continue                 // foot on-axis — no information
      acc += (dot > 0 ? 1 : -1) * L
    }
    return acc >= 0 ? +1 : -1
  }
  // Build corridors + divided pairs from phase metadata. One pass per
  // corridor name: cluster endpoints into nodes, look up which chains
  // are paired carriageways via phase.role, and walk the node graph to
  // order phases along the corridor.
  const NODE_TOL = 15 // meters — carriageway pair ends often sit apart
  const byCorridorName = new Map()
  for (let i = 0; i < ribbonStreets.length; i++) {
    const s = ribbonStreets[i]
    const cname = s.phase?.corridorName || s.name
    if (!byCorridorName.has(cname)) byCorridorName.set(cname, [])
    byCorridorName.get(cname).push(i)
  }

  const corridors = []
  const dividedPairs = [] // [{ aIdx, bIdx }, ...] — drives medians + anchors

  for (const [name, idxs] of byCorridorName) {
    // Cluster endpoints within NODE_TOL into nodes.
    const nodes = [] // { pt: avg, endpoints: [{ chainIdx, which }] }
    for (const ci of idxs) {
      const pts = ribbonStreets[ci].points
      for (const which of ['start', 'end']) {
        const pt = which === 'start' ? pts[0] : pts[pts.length - 1]
        let found = null
        for (const n of nodes) {
          if (Math.hypot(pt[0] - n.pt[0], pt[1] - n.pt[1]) < NODE_TOL) { found = n; break }
        }
        if (found) {
          found.endpoints.push({ chainIdx: ci, which })
          const k = found.endpoints.length
          found.pt = [
            found.pt[0] + (pt[0] - found.pt[0]) / k,
            found.pt[1] + (pt[1] - found.pt[1]) / k,
          ]
        } else {
          nodes.push({ pt: [pt[0], pt[1]], endpoints: [{ chainIdx: ci, which }] })
        }
      }
    }

    // Chain → [startNodeIdx, endNodeIdx]
    const chainNodes = new Map()
    for (const [ni, node] of nodes.entries()) {
      for (const { chainIdx, which } of node.endpoints) {
        if (!chainNodes.has(chainIdx)) chainNodes.set(chainIdx, [null, null])
        chainNodes.get(chainIdx)[which === 'start' ? 0 : 1] = ni
      }
    }

    // Pair carriageway-A ↔ carriageway-B by phase.pairKey. The skeleton
    // analyzer assigned a stable pairKey at the OSM level; weldChains
    // gates on (signature, pairKey), so welded A and B chains for the
    // same pair carry the same pairKey. No geometry guessing.
    const inPair = new Map()
    const byPairKey = new Map() // pairKey → { a, b }
    for (const ci of idxs) {
      const phase = ribbonStreets[ci].phase
      if (!phase?.pairKey) continue
      if (!byPairKey.has(phase.pairKey)) byPairKey.set(phase.pairKey, {})
      const slot = byPairKey.get(phase.pairKey)
      if (phase.role === 'carriageway-A') slot.a = ci
      else if (phase.role === 'carriageway-B') slot.b = ci
    }
    for (const { a, b } of byPairKey.values()) {
      if (a == null || b == null) continue
      inPair.set(a, b); inPair.set(b, a)
      dividedPairs.push({ aIdx: a, bIdx: b })
    }

    // Walk the node graph to order phases. Start at a leaf (degree 1)
    // if available so single→divided→single transitions emit in order.
    const nodeDegree = nodes.map(n => n.endpoints.length)
    let startNode = nodeDegree.findIndex(d => d === 1)
    if (startNode < 0) startNode = 0

    const phases = []
    const transitions = []
    const visitedChains = new Set()
    let current = startNode
    let prevPhaseKind = null

    while (true) {
      const node = nodes[current]
      let nextChain = null
      for (const { chainIdx } of node.endpoints) {
        if (!visitedChains.has(chainIdx)) { nextChain = chainIdx; break }
      }
      if (nextChain == null) break

      const isDivided = inPair.has(nextChain)
      const phase = isDivided
        ? { kind: 'divided', chainIds: [ribbonStreets[nextChain].skelId, ribbonStreets[inPair.get(nextChain)].skelId] }
        : { kind: 'single', chainIds: [ribbonStreets[nextChain].skelId] }

      if (prevPhaseKind && prevPhaseKind !== phase.kind) {
        transitions.push({ at: node.pt, from: prevPhaseKind, to: phase.kind, pinch: prevPhaseKind === 'single' || phase.kind === 'single' })
      }
      phases.push(phase)
      prevPhaseKind = phase.kind

      visitedChains.add(nextChain)
      if (isDivided) visitedChains.add(inPair.get(nextChain))

      const [sNode, eNode] = chainNodes.get(nextChain)
      current = sNode === current ? eNode : sNode
    }

    // Disconnected components: emit any chains the walk didn't reach.
    for (const ci of idxs) {
      if (visitedChains.has(ci)) continue
      const isDivided = inPair.has(ci)
      if (isDivided && visitedChains.has(inPair.get(ci))) { visitedChains.add(ci); continue }
      const phase = isDivided
        ? { kind: 'divided', chainIds: [ribbonStreets[ci].skelId, ribbonStreets[inPair.get(ci)].skelId] }
        : { kind: 'single', chainIds: [ribbonStreets[ci].skelId] }
      phases.push(phase)
      visitedChains.add(ci)
      if (isDivided) visitedChains.add(inPair.get(ci))
    }

    corridors.push({ name, phases, transitions })
  }
  const pinchCount = corridors.reduce((a, c) => a + c.transitions.filter(t => t.pinch).length, 0)
  console.log(`    ${corridors.length} corridors, ${pinchCount} pinch transitions`)

  // [E2] CONSTRUCTED medians — the median is a real polygon decided here at
  // prebake, not a residual face re-derived per render. Per divided pair:
  // the polygon between the pair's two inner-edge chains (D9: the chains ARE
  // the median's edges; phase.chainGap = its width), with two refinements:
  //   1. Mutual-overlap window — each edge spans only the stations where its
  //      mate runs alongside (project B's endpoints onto A). Where one chain
  //      overhangs its mate (map-edge clips, interchange fragments) the
  //      median must not wedge across the overhang.
  //   2. Blunt ~2 m NOSE — where the gap pinches below NOSE_GAP (a divided↔
  //      undivided transition: both chains taper into the shared spine node)
  //      the median is trimmed back to the first station ≥ NOSE_GAP apart and
  //      closed with a blunt cut. The merge region (node → nose) is corridor
  //      asphalt — lanes joining — and is filled positively by tileGround.
  // Tagged kind:'median' so downstream consumes it by IDENTITY (tileGround
  // median tiles, material/LU), replacing the emergent >40%-median-facing
  // heuristic + the vestigial A+B.reversed ring this block used to emit
  // (TRUMAN-FORENSICS §2a — that decoy had zero consumers).
  const NOSE_GAP = 2.0   // m — median trimmed back to where the chains are ≥ this apart
  const NOSE_STEP = 0.5  // m — gap-profile sampling step for the trim search
  const arcLengths = (pts) => {
    const s = [0]
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return s
  }
  const pointAtS = (pts, cum, s) => {
    const t = Math.max(0, Math.min(cum[cum.length - 1], s))
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= t) {
        const f = cum[i] === cum[i - 1] ? 0 : (t - cum[i - 1]) / (cum[i] - cum[i - 1])
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]
      }
    }
    return [pts[pts.length - 1][0], pts[pts.length - 1][1]]
  }
  // closest point on polyline → { d: distance, s: arclength station of the foot }
  const closestOnPolyline = (p, pts, cum) => {
    let best = { d: Infinity, s: 0 }
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1]
      const dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az
      const L2 = dx * dx + dz * dz
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2)) : 0
      const d = Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t))
      if (d < best.d) best = { d, s: cum[i] + Math.sqrt(L2) * t }
    }
    return best
  }
  const cutPolylineAt = (pts, cum, s0, s1) => {
    const out = [pointAtS(pts, cum, s0)]
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] > s0 + 1e-9 && cum[i] < s1 - 1e-9) out.push([pts[i][0], pts[i][1]])
    }
    out.push(pointAtS(pts, cum, s1))
    const ded = [out[0]]
    for (const p of out.slice(1)) if (Math.hypot(p[0] - ded[ded.length - 1][0], p[1] - ded[ded.length - 1][1]) > 1e-6) ded.push(p)
    return ded
  }
  // Shared-vertex index over all ribbon streets (junction = exact shared
  // coordinate, the same identity extractFaces uses) — drives the crossing
  // detection below.
  const NOSE_SETBACK = 1.5  // m — median nose set back from a crossing street's curb line
  const MIN_SEG = 4.0       // m — a median segment shorter than this folds into the adjacent merge
  const vKey = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
  const vertexStreets = new Map()
  ribbonStreets.forEach((s, i) => {
    for (const p of s.points) {
      const k = vKey(p)
      let set = vertexStreets.get(k)
      if (!set) { set = new Set(); vertexStreets.set(k, set) }
      set.add(i)
    }
  })
  const medians = []
  const noseRecs = []   // [E3.1] { idx, end: 'start'|'end', nose: m-from-that-end } per pinching transition end
  let medianSkips = 0, mergeCount = 0, crossingCount = 0
  for (const { aIdx, bIdx } of dividedPairs) {
    const A = ribbonStreets[aIdx]
    const B = ribbonStreets[bIdx]
    const a = A.points.map(p => [p[0], p[1]])
    const b = B.points.map(p => [p[0], p[1]])
    // Orient B co-directional with A so stations correspond end-to-end.
    const dot = (a[a.length - 1][0] - a[0][0]) * (b[b.length - 1][0] - b[0][0]) +
                (a[a.length - 1][1] - a[0][1]) * (b[b.length - 1][1] - b[0][1])
    const eb = dot > 0 ? b : b.slice().reverse()
    const cumA = arcLengths(a)
    const cumB = arcLengths(eb)
    const lenA = cumA[cumA.length - 1]
    const gapAt = (s) => closestOnPolyline(pointAtS(a, cumA, s), eb, cumB).d
    // (1) mutual-overlap window on A
    const vb0 = closestOnPolyline(eb[0], a, cumA).s
    const vb1 = closestOnPolyline(eb[eb.length - 1], a, cumA).s
    const winLo = Math.max(0, Math.min(vb0, vb1))
    const winHi = Math.min(lenA, Math.max(vb0, vb1))
    // (2) nose trim from each pinching end (a transition: the chains taper
    // into the shared spine node; gap → 0)
    const startPinched = gapAt(0) < NOSE_GAP      // [E3.1] pinch flags hoisted so the
    const endPinched = gapAt(lenA) < NOSE_GAP     // junction map can reuse the noses
    let s0 = 0
    if (startPinched) {
      while (s0 < lenA && gapAt(s0) < NOSE_GAP) s0 += NOSE_STEP
      const g1 = gapAt(s0), g0 = gapAt(s0 - NOSE_STEP)
      if (g1 > g0) s0 = s0 - NOSE_STEP + NOSE_STEP * (NOSE_GAP - g0) / (g1 - g0)
    }
    let s1 = lenA
    if (endPinched) {
      while (s1 > 0 && gapAt(s1) < NOSE_GAP) s1 -= NOSE_STEP
      const g0 = gapAt(s1), g1 = gapAt(s1 + NOSE_STEP)
      if (g0 > g1) s1 = s1 + NOSE_STEP - NOSE_STEP * (NOSE_GAP - g1) / (g0 - g1)
    }
    s0 = Math.max(s0, winLo)
    s1 = Math.min(s1, winHi)
    if (!(s1 - s0 > 1)) { medianSkips++; continue }   // window collapsed — pair too short
    // [E3.1] Capture the E2 nose stations per pinching chain-end — ONE nose
    // truth (JUNCTION-CURE-PLAN §4.3): the junction map's de-taper windows
    // consume these stations, never re-derive the gap profile. `nose` is the
    // arclength distance from that chain's own endpoint at that end (its own
    // point order), so the consumer needs no pair-orientation knowledge.
    const lenB = cumB[cumB.length - 1]
    if (startPinched) {
      noseRecs.push({ idx: aIdx, end: 'start', nose: s0 })
      const u0 = closestOnPolyline(pointAtS(a, cumA, s0), eb, cumB).s
      noseRecs.push({ idx: bIdx, end: dot > 0 ? 'start' : 'end', nose: u0 })
    }
    if (endPinched) {
      noseRecs.push({ idx: aIdx, end: 'end', nose: lenA - s1 })
      const u1 = closestOnPolyline(pointAtS(a, cumA, s1), eb, cumB).s
      noseRecs.push({ idx: bIdx, end: dot > 0 ? 'end' : 'start', nose: lenB - u1 })
    }
    // (3) CROSSING cuts — a street that junctions BOTH carriageways (shared
    // vertex on each, not the corridor itself, not grade-separated) crosses
    // the median: the median OPENS there. Cut halfwidth = the crossing
    // street's asphalt halfwidth + NOSE_SETBACK. One-sided T's (junction on
    // one carriageway only) do NOT cut — the median runs over them (the
    // Truman addendum fragmentation cure).
    const corridorName = A.phase?.corridorName || A.name
    const crossersA = new Map(), crossersB = new Map()   // street idx → junction point
    const collect = (pts, self, into) => {
      for (const p of pts) {
        for (const j of vertexStreets.get(vKey(p)) || []) {
          if (j === aIdx || j === bIdx) continue
          const S = ribbonStreets[j]
          if (S.gradeSeparated) continue
          if ((S.phase?.corridorName || S.name) === corridorName) continue
          if (!into.has(j)) into.set(j, p)
        }
      }
    }
    collect(a, aIdx, crossersA)
    collect(eb, bIdx, crossersB)
    const cuts = []   // [lo, hi] station intervals on A
    for (const [j, pA] of crossersA) {
      if (!crossersB.has(j)) continue
      const S = ribbonStreets[j]
      const sOnA = closestOnPolyline(pA, a, cumA).s
      const sOfB = closestOnPolyline(crossersB.get(j), a, cumA).s
      const c = (sOnA + sOfB) / 2
      const hw = Math.max(S.measure?.left?.pavementHW || 0, S.measure?.right?.pavementHW || 0)
      const w = hw + NOSE_SETBACK
      cuts.push([c - w, c + w])
      crossingCount++
    }
    // Merge overlapping/near cut intervals; fold sub-MIN_SEG median slivers
    // between cuts into the cuts (a divided×divided crossing's central box
    // must be merge-asphalt, not a 1 m median crumb).
    cuts.sort((p, q) => p[0] - q[0])
    let merged = []
    for (const c of cuts) {
      const last = merged[merged.length - 1]
      if (last && c[0] - last[1] < MIN_SEG) last[1] = Math.max(last[1], c[1])
      else merged.push([c[0], c[1]])
    }
    merged = merged.map(c => [Math.max(c[0], s0), Math.min(c[1], s1)]).filter(c => c[1] - c[0] > 0.1)
    // (4) emit — median segments between cuts (kind:'median') + the merge
    // regions (kind:'merge': the nose-trimmed transition tapers AND the
    // crossing windows — corridor asphalt, lanes joining, constructed
    // positively per DIVIDED-CORRIDOR-PLAN §4.4). Both are polygons between
    // the chains: cut A at the window, follow the feet on B, blunt closes.
    const stamp = (kind, w0, w1, minArea) => {
      if (!(w1 - w0 > 0.25)) return false
      const P0 = pointAtS(a, cumA, w0)
      const P1 = pointAtS(a, cumA, w1)
      const u0 = closestOnPolyline(P0, eb, cumB).s
      const u1 = closestOnPolyline(P1, eb, cumB).s
      if (!(u1 - u0 > 0.25)) return false
      const ta = cutPolylineAt(a, cumA, w0, w1)
      const tb = cutPolylineAt(eb, cumB, u0, u1)
      const ring = [...ta, ...tb.reverse()]
      if (Math.abs(polygonArea(ring)) < minArea) return false
      medians.push({
        kind,
        name: corridorName,
        streets: [A.name, B.name],
        chains: [A.skelId, B.skelId],
        pairKey: A.phase?.pairKey || null,
        ring,
      })
      return true
    }
    // A median segment must clear MIN_MED_AREA (25 m²) to stamp as median —
    // below that it's an intersection crumb (the divided×divided central
    // box), which stamps as merge ASPHALT instead so the region never falls
    // through to a parcel-LU pill.
    const stampMedianOrMerge = (w0, w1) => {
      if (stamp('median', w0, w1, 25)) { emitted++; return }
      if (stamp('merge', w0, w1, 1)) mergeCount++
    }
    let cursor = s0
    let emitted = 0
    for (const [lo, hi] of merged) {
      stampMedianOrMerge(cursor, lo)
      if (stamp('merge', lo, hi, 1)) mergeCount++
      cursor = hi
    }
    stampMedianOrMerge(cursor, s1)
    if (!emitted) medianSkips++
    // Transition tapers (node → nose) as merge patches, so the taper needle
    // is positively asphalt even when its face doesn't match a median tile.
    if (stamp('merge', winLo, s0, 1)) mergeCount++
    if (stamp('merge', s1, winHi, 1)) mergeCount++
  }
  const medCount = medians.filter(m => m.kind === 'median').length
  console.log(`    ${medCount} constructed median segments + ${mergeCount} merge patches from ${dividedPairs.length} pairs (${crossingCount} crossings cut${medianSkips ? `, ${medianSkips} pairs degenerate` : ''})`)

  // D1 (carriageway measure hygiene): canonicalize a divided carriageway's
  // per-side measure to the anchor='inner-edge' model — the chain sits at the
  // carriageway's median-facing edge, so the OUTER side carries the full
  // carriageway width and the median-facing (inboard) side is effectively 0.
  //
  // Why this must be re-resolved EVERY bake, through innerSign: the measure's
  // left/right keys are point-order-relative, and a longitudinal weld can
  // REVERSE a chain's stored direction (commit 5348fbc reversed
  // lafayette-avenue-6, silently swapping which physical side every persisted
  // key referred to — the false-corner's data root: outer pavementHW became 0,
  // the block ran flush to the chain). innerSign is recomputed from current
  // geometry each bake, so sides resolved through it are reversal-proof.
  //
  //   1. RECLAIM a misfiled width: outer pavementHW <= 0 with inboard > 0 is
  //      an impossible road (a zero-width carriageway) — the width datum is
  //      sitting on the median key because the chain reversed under it.
  //      Swap the two side sections back.
  //   2. NON-authored measures (name-keyed centerlines fallback / class
  //      default) are CORRIDOR facts, not carriageway facts — landing them
  //      verbatim on a carriageway puts corridor half-widths on the median
  //      side and floods the gap with asphalt (the broadcast smear; 42/44 LS
  //      carriageways). Zero the inboard side outright. Authored (overlay)
  //      inboard values are preserved: inboard pavement > 0 is the operator's
  //      documented "eat into the median" control (streetProfiles.js).
  function innerEdgeAssign(m, innerSign, authored) {
    if (!m || !innerSign || !m.left || !m.right) return m
    const inbKey = innerSign === +1 ? 'right' : 'left'   // measure-RIGHT = (-dz,dx) perp; see innerSideSign
    const outKey = inbKey === 'left' ? 'right' : 'left'
    let inb = m[inbKey], out = m[outKey]
    if (!(out?.pavementHW > 0) && inb?.pavementHW > 0) { const t = out; out = inb; inb = t }   // (1) reclaim
    if (!authored) inb = { ...inb, pavementHW: 0, treelawn: 0, sidewalk: 0, terminal: 'none' } // (2) corridor facts
    return { ...m, symmetric: false, [outKey]: out, [inbKey]: inb }
  }

  // Anchor + innerSign for paired carriageways. Runtime uses these to
  // render the visible centerline at the inner edge and emit ribbons
  // outward. Operator can override `anchor` per chain in Survey.
  for (const { aIdx, bIdx } of dividedPairs) {
    const A = ribbonStreets[aIdx]
    const B = ribbonStreets[bIdx]
    A.anchor = 'inner-edge'
    A.innerSign = innerSideSign(A.points, B.points)
    A.pairId = B.skelId
    B.anchor = 'inner-edge'
    B.innerSign = innerSideSign(B.points, A.points)
    B.pairId = A.skelId
    // Normalize measures into the inner-edge model (see innerEdgeAssign).
    // segmentMeasures are overlay-only → authored by definition (reclaim only).
    for (const st of [A, B]) {
      st.measure = innerEdgeAssign(st.measure, st.innerSign, st._measureAuthored)
      if (st.segmentMeasures) {
        const sm = {}
        for (const k of Object.keys(st.segmentMeasures)) {
          sm[k] = innerEdgeAssign(st.segmentMeasures[k], st.innerSign, true)
        }
        st.segmentMeasures = sm
      }
    }
  }
  const innerEdgeCount = ribbonStreets.filter(s => s.anchor === 'inner-edge').length
  if (innerEdgeCount) console.log(`    ${innerEdgeCount} chains marked anchor=inner-edge (divided carriageways)`)

  // ── [E3.1] THE JUNCTION MAP — frozen per-node identity stamps ─────────
  // The junction silhouette is never CONSTRUCTED today: it is emergent from
  // independent constant-width butt-capped chain strokes, so every width
  // discontinuity at a node manufactures spurious geometry (53 instances —
  // JUNCTION-CURE-PLAN §1/§2, SKELETON.md §5e). The cure constructs the
  // junction; THIS is its map: per node, the prebake stamps WHICH curbs are
  // one physical curb through the node (continuity pairs), WHERE the taper
  // region ends (de-taper windows — E2's nose stations, one nose truth),
  // WHICH legs may corner (corner identities — the corridor outer-edge legs,
  // never the carriageway stubs, the §5e/D3 freeze), and ONE junction-interior
  // apron spec per node. GEOMETRY-NEUTRAL (the 61930d7 pattern): stamps are
  // identities; widths resolve at shape time (runMeasure/blockCustoms) and the
  // construction lands in E3.2/E3.3, which consume these stamps by identity.
  // Side keys ('left'/'right') are point-order-relative and re-stamped every
  // bake from current geometry — reversal-proof the same way innerSign is
  // (the D1 lesson; see innerSideSign convention pin).
  const junctionMap = (() => {
    const byskelId = new Map(ribbonStreets.map(s => [s.skelId, s]))
    const idxOf = new Map(ribbonStreets.map((s, i) => [s, i]))
    const curbed = (s) => !s.gradeSeparated && !s.disabled
    const ptOf = (s, end) => end === 'start' ? s.points[0] : s.points[s.points.length - 1]
    const norm = (vx, vz) => { const L = Math.hypot(vx, vz) || 1; return [vx / L, vz / L] }
    // Unit vector from the node INTO the chain's body.
    const outward = (s, end) => {
      const p = s.points
      const [n, a] = end === 'start' ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]
      return norm(a[0] - n[0], a[1] - n[1])
    }
    // World direction of the measure-RIGHT side at the chain's end vertex:
    // (-dz, dx) of the POINT-ORDER tangent (the convention pinned at
    // innerSideSign — measure-RIGHT = (-dz, dx) perp).
    const rightDir = (s, end) => {
      const p = s.points
      const [a, b] = end === 'start' ? [p[0], p[1]] : [p[p.length - 2], p[p.length - 1]]
      const [tx, tz] = norm(b[0] - a[0], b[1] - a[1])
      return [-tz, tx]
    }
    const sideDir = (s, end, side) => {
      const r = rightDir(s, end)
      return side === 'right' ? r : [-r[0], -r[1]]
    }
    // Point + point-order tangent at arclength d from the given end — the
    // chain's BODY, past the endpoint taper curl. A carriageway's last
    // segment bends toward the shared node, so side directions evaluated at
    // the endpoint misresolve; evaluate them on the body instead.
    const stationAt = (s, end, d) => {
      const p = s.points
      const idx = (i) => end === 'start' ? i : p.length - 1 - i
      let acc = 0
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[idx(i)], b = p[idx(i + 1)]
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (acc + L >= d || i === p.length - 2) {
          const f = L > 0 ? Math.min(1, (d - acc) / L) : 0
          const pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
          // tangent in POINT ORDER (a→b is node-outward at 'start', flip at 'end')
          const t = end === 'start' ? norm(b[0] - a[0], b[1] - a[1]) : norm(a[0] - b[0], a[1] - b[1])
          return { pt, t }
        }
        acc += L
      }
      const t = end === 'start' ? norm(p[1][0] - p[0][0], p[1][1] - p[0][1]) : norm(p[p.length - 1][0] - p[p.length - 2][0], p[p.length - 1][1] - p[p.length - 2][1])
      return { pt: ptOf(s, end), t }
    }
    const BODY_D = 25 // m — far enough past every observed taper (max nose ~7 m)
    // A divided carriageway's OUTER (block-facing) measure key AT this end,
    // resolved LOCALLY against the pair mate's polyline. The global innerSign
    // vote is unweighted per segment and misresolves on snaking corridors
    // (s18-6 verified flipped) — the junction map must not inherit that.
    const outerSideAt = (s, end) => {
      const mate = byskelId.get(s.pairId)
      if (!mate) return s.innerSign === +1 ? 'left' : 'right'
      const d = Math.min(BODY_D, polylineLen(s.points) * 0.4)
      const { pt, t } = stationAt(s, end, d)
      // Foot on the mate's SEGMENTS (closest vertex is degenerate on short
      // 2-point chains — it returns the shared node, which sits on-axis).
      const mPts = mate.points.map(q => [q[0], q[1]])
      const mCum = arcLengths(mPts)
      const foot = pointAtS(mPts, mCum, closestOnPolyline(pt, mPts, mCum).s)
      const r = [-t[1], t[0]] // measure-RIGHT of point-order tangent
      const inner = (r[0] * (foot[0] - pt[0]) + r[1] * (foot[1] - pt[1])) > 0 ? 'right' : 'left'
      return inner === 'right' ? 'left' : 'right'
    }
    const polylineLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L }
    // World direction of a side, evaluated on the body past the taper.
    const sideDirBody = (s, end, side) => {
      const { t } = stationAt(s, end, Math.min(BODY_D, polylineLen(s.points) * 0.4))
      const r = [-t[1], t[0]]
      return side === 'right' ? r : [-r[0], -r[1]]
    }
    const corOf = (s) => s.phase?.corridorName || s.name
    const isCw = (s) => /^carriageway/.test(s.phase?.role || '')

    const noseByEnd = new Map()
    for (const r of noseRecs) noseByEnd.set(`${r.idx}|${r.end}`, Math.round(r.nose * 100) / 100)

    // Node registry — keyed by the exact shared-vertex coordinate (the same
    // identity extractFaces uses).
    const jnodes = new Map()
    const unpaired = []
    const nodeFor = (pt) => {
      const k = vKey(pt)
      let n = jnodes.get(k)
      if (!n) {
        n = { key: k, at: [pt[0], pt[1]], kinds: new Set(), legs: new Map(), continuity: [], _pairKeys: new Set(), _claims: new Map(), deTaper: [], _windowKeys: new Set(), corners: { outer: [], apex: [], stub: [] }, _cornerKeys: new Set(), apron: null }
        jnodes.set(k, n)
      }
      return n
    }
    const addLeg = (n, s, end, role) => {
      const k = `${s.skelId}|${end}`
      if (!n.legs.has(k)) n.legs.set(k, { chain: s.skelId, end, role })
    }
    const addPair = (n, a, b, source) => {
      const ka = `${a.chain}|${a.side}`, kb = `${b.chain}|${b.side}`
      const k = [ka, kb].sort().join('~')
      if (n._pairKeys.has(k)) return
      // A curb can be one physical curb with at most ONE partner through a
      // node. At forks (Tucker 5-way, S-14th off Lafayette) several strands
      // claim the same curb — first source wins (sources run in confidence
      // order: spine-link → joins/continuations → branch), the rest are
      // surfaced as contested rather than silently double-stamped.
      const cA = n._claims.get(ka), cB = n._claims.get(kb)
      if ((cA && cA !== kb) || (cB && cB !== ka)) {
        unpaired.push({ key: n.key, chains: [a.chain, b.chain], reason: `curb already claimed at this node (fork) — ${cA && cA !== kb ? ka : kb} kept its first partner` })
        return
      }
      n._pairKeys.add(k)
      n._claims.set(ka, kb)
      n._claims.set(kb, ka)
      n.continuity.push({ a, b, source })
    }
    const addWindow = (n, s, end) => {
      const nose = noseByEnd.get(`${idxOf.get(s)}|${end}`)
      if (nose == null) return false
      const k = `${s.skelId}|${end}`
      if (n._windowKeys.has(k)) return true
      n._windowKeys.add(k)
      n.deTaper.push({ chain: s.skelId, end, nose })
      return true
    }
    const addCorner = (n, list, rec) => {
      const k = JSON.stringify(rec)
      if (n._cornerKeys.has(k)) return
      n._cornerKeys.add(k)
      list.push(rec)
    }
    // Match the physical side of `t` (at its end `tEnd`) that lies on the same
    // world side as direction w.
    const matchSide = (t, tEnd, w) => {
      const r = rightDir(t, tEnd)
      return (r[0] * w[0] + r[1] * w[1]) > 0 ? 'right' : 'left'
    }

    // Endpoint + interior-vertex indexes over CURBED chains only (grade-
    // separated chains never reach the ground silhouette — extractFaces
    // filters them — so they carry no curb identity).
    const endsAt = new Map()      // vKey -> [{ s, end }]
    const interiorAt = new Map()  // vKey -> [s]
    for (const s of ribbonStreets) {
      if (!curbed(s)) continue
      const p = s.points
      for (const [end, pt] of [['start', p[0]], ['end', p[p.length - 1]]]) {
        const k = vKey(pt)
        if (!endsAt.has(k)) endsAt.set(k, [])
        endsAt.get(k).push({ s, end })
      }
      for (let i = 1; i < p.length - 1; i++) {
        const k = vKey(p[i])
        if (!interiorAt.has(k)) interiorAt.set(k, [])
        const arr = interiorAt.get(k)
        if (!arr.includes(s)) arr.push(s)
      }
    }

    // ── Source 1: divided transitions via phase.spineAtStart/End (the frozen
    // 61930d7 frame link). The carriageway's OUTER curb is one curb with the
    // spine's same-physical-side curb; the taper end is a stub that must
    // never corner (§5e).
    let spineLinkPairs = 0
    for (const s of ribbonStreets) {
      if (!curbed(s) || !isCw(s)) continue
      for (const [field, end] of [['spineAtStart', 'start'], ['spineAtEnd', 'end']]) {
        const spineId = s.phase?.[field]
        if (!spineId) continue
        const spine = byskelId.get(spineId)
        if (!spine || !curbed(spine)) { unpaired.push({ key: vKey(ptOf(s, end)), chains: [s.skelId, spineId], reason: 'spineAt* target missing or not curbed' }); continue }
        const pt = ptOf(s, end)
        const k = vKey(pt)
        const spineEnd = vKey(spine.points[0]) === k ? 'start' : vKey(spine.points[spine.points.length - 1]) === k ? 'end' : null
        if (!spineEnd) { unpaired.push({ key: k, chains: [s.skelId, spineId], reason: 'spineAt* node is not a spine endpoint' }); continue }
        const n = nodeFor(pt)
        n.kinds.add('divided-transition')
        addLeg(n, s, end, s.phase.role)
        addLeg(n, spine, spineEnd, 'spine')
        const oSide = outerSideAt(s, end)
        const w = sideDirBody(s, end, oSide)
        const spSide = matchSide(spine, spineEnd, w)
        addPair(n, { chain: s.skelId, side: oSide }, { chain: spine.skelId, side: spSide }, 'spine-link')
        spineLinkPairs++
        addCorner(n, n.corners.outer, { chain: s.skelId, side: oSide })
        addCorner(n, n.corners.outer, { chain: spine.skelId, side: spSide })
        addCorner(n, n.corners.stub, { chain: s.skelId, end })
        addWindow(n, s, end)
      }
    }
    // ── Sources 2+4: end-to-end chain joins (same corridor or different),
    // gated on CONTINUATION geometry (outward tangents ~opposite — the same
    // gate nameTransitions uses). Same-corridor cw↔spine meetings are Source
    // 1's transitions (already stamped); skip them here.
    const DOT_CONTINUES = -0.6
    const seenJoin = new Set()
    for (const [k, list] of endsAt) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const P = list[i], Q = list[j]
        if (P.s === Q.s) continue
        const jk = [P.s.skelId, Q.s.skelId].sort().join('~') + '@' + k
        if (seenJoin.has(jk)) continue
        seenJoin.add(jk)
        const sameCorridor = corOf(P.s) === corOf(Q.s)
        const pCw = isCw(P.s), qCw = isCw(Q.s)
        if (sameCorridor && P.s.phase?.pairKey && P.s.phase.pairKey === Q.s.phase?.pairKey && P.s.phase.role !== Q.s.phase.role) continue // the divided A|B pair itself
        if (sameCorridor && pCw !== qCw) continue // cw↔spine same corridor = the Source-1 transition
        const oP = outward(P.s, P.end), oQ = outward(Q.s, Q.end)
        const dot = oP[0] * oQ[0] + oP[1] * oQ[1]
        if (dot > -DOT_CONTINUES) { // both leave the node the same way — parallel strands, not a join
          if (sameCorridor || Math.abs(oP[0] * oQ[1] - oP[1] * oQ[0]) < 0.5) unpaired.push({ key: k, chains: [P.s.skelId, Q.s.skelId], reason: 'doubles back (parallel strands?) — not pairable' })
          continue
        }
        if (dot > DOT_CONTINUES) {
          if (sameCorridor) unpaired.push({ key: k, chains: [P.s.skelId, Q.s.skelId], reason: 'same-corridor L-corner — not a continuation' })
          continue // a genuine corner between different streets — not junction-map material
        }
        const linked = P.s.continuesAs === Q.s.skelId || Q.s.continuesAs === P.s.skelId
        const source = sameCorridor ? 'same-corridor' : linked ? 'continuesAs' : 'collinear'
        const n = nodeFor(ptOf(P.s, P.end))
        n.kinds.add(sameCorridor ? 'same-corridor-join' : 'continuation')
        addLeg(n, P.s, P.end, P.s.phase?.role || 'single')
        addLeg(n, Q.s, Q.end, Q.s.phase?.role || 'single')
        if (pCw !== qCw) {
          // carriageway meets a different-name spine end-to-end: only the
          // outer curb continues (the inner side dies into the median nose).
          const cw = pCw ? P : Q, sp = pCw ? Q : P
          const oSide = outerSideAt(cw.s, cw.end)
          const w = sideDirBody(cw.s, cw.end, oSide)
          addPair(n, { chain: cw.s.skelId, side: oSide }, { chain: sp.s.skelId, side: matchSide(sp.s, sp.end, w) }, source)
          addCorner(n, n.corners.stub, { chain: cw.s.skelId, end: cw.end })
          addWindow(n, cw.s, cw.end)
        } else {
          // spine↔spine or cw↔cw: both physical curbs run through the node.
          // Sides resolved on the bodies (a carriageway's endpoint segment is
          // the taper curl).
          for (const side of ['left', 'right']) {
            const w = sideDirBody(P.s, P.end, side)
            const rQ = stationAt(Q.s, Q.end, Math.min(BODY_D, polylineLen(Q.s.points) * 0.4)).t
            const qRight = [-rQ[1], rQ[0]]
            addPair(n, { chain: P.s.skelId, side }, { chain: Q.s.skelId, side: (qRight[0] * w[0] + qRight[1] * w[1]) > 0 ? 'right' : 'left' }, source)
          }
          if (pCw) { addCorner(n, n.corners.stub, { chain: P.s.skelId, end: P.end }); addWindow(n, P.s, P.end) }
          if (qCw) { addCorner(n, n.corners.stub, { chain: Q.s.skelId, end: Q.end }); addWindow(n, Q.s, Q.end) }
        }
      }
    }

    // ── Source 5: endpoint-on-interior — a chain END landing on another
    // curbed chain's THROUGH vertex. Collinear → a BRANCH (Grattan off
    // Truman): the wedge-facing curbs meet at a constructed apex, the
    // envelope-side curb hands off. Perpendicular + the ender is a divided
    // carriageway → a CORRIDOR TERMINUS (the Truman↔Lafayette nodes — no
    // spineAt* there because the corridor NAME changes; this is the link
    // gap the E3 spike found via marks #0/#1): the carriageway's outer curb
    // corners against the receiving street's near-side curb; the tip is a
    // stub. Ordinary single-street T's are NOT stamped (no width-step
    // construction needed there — the junction map covers junction
    // CONSTRUCTION nodes, not every intersection).
    for (const [k, list] of endsAt) {
      for (const { s, end } of list) {
        for (const q of interiorAt.get(k) || []) {
          if (q === s) continue
          const p = q.points
          let vi = -1
          for (let i = 1; i < p.length - 1; i++) if (vKey(p[i]) === k) { vi = i; break }
          if (vi < 0) continue
          const oP = outward(s, end)
          const [qtx, qtz] = norm(p[vi + 1][0] - p[vi - 1][0], p[vi + 1][1] - p[vi - 1][1])
          const align = oP[0] * qtx + oP[1] * qtz
          const undirected = Math.abs(align)
          if (undirected > Math.cos(25 * Math.PI / 180)) {
            // BRANCH — q's body diverges collinearly from s's body. When s is
            // a carriageway landing on its OWN corridor's spine interior this
            // is a STAGGERED divided transition (the spineAt* stamper matches
            // spine ENDPOINTS only, so it missed it — Geyer at Missouri).
            const sameCorridor = corOf(s) === corOf(q)
            const n = nodeFor(ptOf(s, end))
            n.kinds.add(sameCorridor && isCw(s) ? 'divided-transition' : 'branch')
            addLeg(n, s, end, s.phase?.role || 'single')
            addLeg(n, q, 'through', q.phase?.role || 'single')
            // q's half-tangent aligned with s's body = the diverging half.
            const qa = align > 0 ? [qtx, qtz] : [-qtx, -qtz]
            // Side of s facing q's diverging half = the wedge side. Body
            // tangent, not the endpoint segment (the taper curl).
            const tS = stationAt(s, end, Math.min(BODY_D, polylineLen(s.points) * 0.4)).t
            const rS = [-tS[1], tS[0]]
            const wedgeS = (rS[0] * qa[0] + rS[1] * qa[1]) > 0 ? 'right' : 'left'
            // Side of q facing s's body = q's wedge side. q's tangent at an
            // interior vertex: use the point-order tangent there.
            const rQ = norm(-(p[vi + 1][1] - p[vi - 1][1]), p[vi + 1][0] - p[vi - 1][0])
            const wedgeQ = (rQ[0] * oP[0] + rQ[1] * oP[1]) > 0 ? 'right' : 'left'
            // A carriageway's INNER side carries no curb (it dies into the
            // median) — only its OUTER side may corner or hand off.
            const oSide = isCw(s) ? outerSideAt(s, end) : null
            if (!oSide || wedgeS === oSide) addCorner(n, n.corners.apex, { legA: { chain: s.skelId, side: wedgeS }, legB: { chain: q.skelId, side: wedgeQ } })
            const envS = wedgeS === 'left' ? 'right' : 'left'
            if (!oSide || envS === oSide) {
              const w = sideDirBody(s, end, envS)
              addPair(n, { chain: s.skelId, side: envS }, { chain: q.skelId, side: (rQ[0] * w[0] + rQ[1] * w[1]) > 0 ? 'right' : 'left' }, 'branch-envelope')
            }
            if (isCw(s)) { addCorner(n, n.corners.stub, { chain: s.skelId, end }); addWindow(n, s, end) }
          } else if (isCw(s)) {
            // CORRIDOR TERMINUS — a divided carriageway T-ing into a cross
            // street it does not continue along (the Truman↔Lafayette nodes).
            const n = nodeFor(ptOf(s, end))
            n.kinds.add('corridor-terminus')
            addLeg(n, s, end, s.phase.role)
            addLeg(n, q, 'through', q.phase?.role || 'single')
            const oSide = outerSideAt(s, end)
            // q's side facing the corridor body — probe the body past the
            // taper curl, not the endpoint segment.
            const body = stationAt(s, end, Math.min(BODY_D, polylineLen(s.points) * 0.4)).pt
            const v = norm(body[0] - n.at[0], body[1] - n.at[1])
            const rQ = norm(-(p[vi + 1][1] - p[vi - 1][1]), p[vi + 1][0] - p[vi - 1][0])
            const qSide = (rQ[0] * v[0] + rQ[1] * v[1]) > 0 ? 'right' : 'left'
            addCorner(n, n.corners.outer, { chain: s.skelId, side: oSide })
            addCorner(n, n.corners.outer, { chain: q.skelId, side: qSide })
            addCorner(n, n.corners.stub, { chain: s.skelId, end })
            addWindow(n, s, end)
          }
        }
      }
    }

    // ── Source 6: pendant tips with L↔R asymmetry — the tip itself is the
    // continuity point (the butt cap wraps one curb into the other; a width
    // step there is the SAME-STREET step family).
    let tipCount = 0
    for (const [k, list] of endsAt) {
      if (list.length !== 1 || (interiorAt.get(k) || []).length) continue
      const { s, end } = list[0]
      const L = s.measure?.left?.pavementHW || 0
      const R = s.measure?.right?.pavementHW || 0
      if (Math.abs(L - R) < 0.5) continue
      const n = nodeFor(ptOf(s, end))
      n.kinds.add('pendant-tip')
      addLeg(n, s, end, s.phase?.role || 'single')
      addPair(n, { chain: s.skelId, side: 'left' }, { chain: s.skelId, side: 'right' }, 'tip-wrap')
      tipCount++
    }

    // ── Cross-street legs at junction-construction nodes (for E3.3's fillet:
    // corners are built corridor-outer-leg × cross-street, never stub ×
    // anything). A cross street is any other curbed chain at the node that
    // carries none of the node's continuity identities.
    for (const n of jnodes.values()) {
      if (!n.kinds.has('divided-transition') && !n.kinds.has('corridor-terminus')) continue
      const inMap = new Set([...n.legs.values()].map(l => l.chain))
      const here = [
        ...(endsAt.get(n.key) || []).map(({ s, end }) => ({ s, end })),
        ...(interiorAt.get(n.key) || []).map(s => ({ s, end: 'through' })),
      ]
      for (const { s, end } of here) {
        if (inMap.has(s.skelId)) continue
        addLeg(n, s, end, 'cross')
      }
    }

    // ── Source 0: EVERY junction node — the standard's invariant (a
    // first-class Intersection at every node; OSM2STREETS-GROUNDING §4.2
    // item 2 / HANDOFF-intersection-everywhere). The construction sources
    // above reach only the divided/joined/branched population; every OTHER
    // node of degree ≥ 3 now gets a record too: kind 'plain' + its full leg
    // set. IDENTITY ONLY — no continuity pairs, no de-taper windows, and
    // (below) no apron spec — so the stamp is geometry-neutral; the
    // shape-side through-node construction (tileGround) and the future
    // apron-everywhere / fillet-identity gates consume these records as they
    // land. Existing nodes' leg sets are NOT extended here: the E3.2 apron
    // fans over nd.legs, so enriching legs would move built geometry — leg
    // completeness for constructed nodes travels with the apron-everywhere
    // phase, deliberately.
    let plainCount = 0
    {
      const allKeys = new Set([...endsAt.keys(), ...interiorAt.keys()])
      for (const k of allKeys) {
        if (jnodes.has(k)) continue
        const ends = endsAt.get(k) || []
        const thrs = interiorAt.get(k) || []
        if (ends.length + thrs.length * 2 < 3) continue   // not a junction
        const pt = ends.length ? ptOf(ends[0].s, ends[0].end) : thrs[0].points[[...thrs[0].points.keys()].find(i => vKey(thrs[0].points[i]) === k)]
        const n = nodeFor(pt)
        n.kinds.add('plain')
        for (const { s, end } of ends) addLeg(n, s, end, s.phase?.role || 'single')
        for (const s of thrs) addLeg(n, s, 'through', s.phase?.role || 'single')
        plainCount++
      }
    }

    // ── Corner pairs by CLOCKWISE LEG ADJACENCY — the standard's corner
    // assembly, stamped as frozen identity at EVERY node (the only legal
    // corner locations; subsumes corner identities — OSM2STREETS-GROUNDING
    // §4.2: "filletRing corners identified legs only, everywhere"). Computed
    // from ALL incident curbed chains (not the node's stamped legs — a
    // partial leg set would fabricate false adjacencies). Sides are
    // point-order measure keys resolved per directed leg: the CCW-wedge side
    // of a leg is measure-RIGHT iff the leg points along point order.
    // PRESENT-but-not-yet-consumed: the fillet-identity gate flips on these
    // once the through-node construction is blessed.
    let adjacentPairs = 0
    for (const n of jnodes.values()) {
      const dirs = []
      for (const { s, end } of endsAt.get(n.key) || []) {
        if (!curbed(s)) continue
        const u = outward(s, end)
        dirs.push({ chain: s.skelId, end, half: null, u, alongPO: end === 'start' })
      }
      for (const s of interiorAt.get(n.key) || []) {
        if (!curbed(s)) continue
        const p = s.points
        let vi = -1
        for (let i = 1; i < p.length - 1; i++) if (vKey(p[i]) === n.key) { vi = i; break }
        if (vi < 0) continue
        const fwd = norm(p[vi + 1][0] - p[vi][0], p[vi + 1][1] - p[vi][1])
        const back = norm(p[vi - 1][0] - p[vi][0], p[vi - 1][1] - p[vi][1])
        dirs.push({ chain: s.skelId, end: 'through', half: 'fwd', u: fwd, alongPO: true })
        dirs.push({ chain: s.skelId, end: 'through', half: 'back', u: back, alongPO: false })
      }
      if (dirs.length < 3) continue
      dirs.sort((a, b) => Math.atan2(a.u[1], a.u[0]) - Math.atan2(b.u[1], b.u[0]))
      n.cornersAdjacent = []
      for (let i = 0; i < dirs.length; i++) {
        const A = dirs[i], B = dirs[(i + 1) % dirs.length]
        if (A.chain === B.chain && A.end === B.end && A.half === B.half) continue
        // wedge runs CCW from A to B: A bounds it on its CCW side, B on its CW
        n.cornersAdjacent.push({
          a: { chain: A.chain, end: A.end, ...(A.half ? { half: A.half } : {}), side: A.alongPO ? 'right' : 'left' },
          b: { chain: B.chain, end: B.end, ...(B.half ? { half: B.half } : {}), side: B.alongPO ? 'left' : 'right' },
        })
        adjacentPairs++
      }
    }

    // ── The node APRON spec — ONE junction-interior polygon per NODE (not
    // per pair; multi-corridor deg-6 nodes get one apron), bounded by the
    // constructed curbs/corners and spanning all incident merge windows.
    // Spec only — construction is E3.2. A small kind:'median' fragment
    // sitting inside a node's merge zone is ABSORBED by that node's apron
    // (the 69 m² S-18th piece at the (658.3,-726.7) nose —
    // JUNCTION-CURE-PLAN §4.2); it stays in medians[] untouched this pass
    // (geometry-neutral) and E3.2 folds it into the apron interior.
    // 'plain' nodes carry no construction yet → no apron spec (the apron-
    // everywhere phase lands it deliberately, with the leg completeness).
    const ABSORB_R = 10, ABSORB_AREA = 100
    let apronCount = 0, absorbed = 0
    for (const n of jnodes.values()) {
      if (n.kinds.has('pendant-tip') && n.kinds.size === 1) continue
      if (n.kinds.has('plain') && n.kinds.size === 1) continue
      const chains = [...n.legs.values()].map(l => l.chain)
      const absorbsMedians = []
      medians.forEach((m, mi) => {
        if (m.kind !== 'median') return
        if (!chains.includes(m.chains[0]) && !chains.includes(m.chains[1])) return
        const area = Math.abs(polygonArea(m.ring))
        if (area > ABSORB_AREA) return
        let dMin = Infinity
        for (const p of m.ring) dMin = Math.min(dMin, Math.hypot(p[0] - n.at[0], p[1] - n.at[1]))
        if (dMin > ABSORB_R) return
        absorbsMedians.push(mi)
        m.absorbedBy = n.key
        absorbed++
      })
      n.apron = { chains, ...(absorbsMedians.length ? { absorbsMedians } : {}) }
      apronCount++
    }

    const nodes = [...jnodes.values()]
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      .map(n => ({
        key: n.key,
        at: n.at,
        kinds: [...n.kinds].sort(),
        legs: [...n.legs.values()],
        continuity: n.continuity,
        ...(n.deTaper.length ? { deTaper: n.deTaper } : {}),
        corners: { outer: n.corners.outer, ...(n.corners.apex.length ? { apex: n.corners.apex } : {}), ...(n.corners.stub.length ? { stub: n.corners.stub } : {}) },
        ...(n.cornersAdjacent?.length ? { cornersAdjacent: n.cornersAdjacent } : {}),
        ...(n.apron ? { apron: n.apron } : {}),
      }))
    const kindCounts = {}
    for (const n of nodes) for (const kd of n.kinds) kindCounts[kd] = (kindCounts[kd] || 0) + 1
    const pairCount = nodes.reduce((a, n) => a + n.continuity.length, 0)
    const windowCount = nodes.reduce((a, n) => a + (n.deTaper?.length || 0), 0)
    console.log(`    [E3.1] junction map: ${nodes.length} nodes [${Object.entries(kindCounts).map(([k, v]) => `${k} ${v}`).join(', ')}]`)
    console.log(`    [E3.1]   ${pairCount} continuity pairs (${spineLinkPairs} spine-link), ${windowCount} de-taper windows, ${apronCount} aprons, ${absorbed} median fragment(s) absorbed, ${tipCount} pendant tips`)
    console.log(`    [E3.1]   intersection-everywhere: ${plainCount} plain nodes stamped, ${adjacentPairs} clockwise-adjacency corner pairs`)
    if (unpaired.length) console.log(`    [E3.1]   unpaired: ${unpaired.map(u => `${u.chains.join('+')}@${u.key} (${u.reason})`).join('; ')}`)
    return { nodes, unpaired }
  })()

  // Serialize (remove circular refs)
  const ribbonsLayer = {
    streets: ribbonStreets.map(st => ({
      skelId: st.skelId,
      name: st.name,
      points: st.points,
      measure: st.measure,
      capEnds: st.capEnds,
      anchor: st.anchor || 'center',
      innerSign: st.innerSign || 0,
      pairId: st.pairId || null,
      // [D6] oneway was dropped here until now → Survey's One-way checkbox
      // always rendered unchecked on divided carriageways. Carry it through
      // (plus phase.role/pairKey, so the cross-section-origination half of the
      // divided-road authoring goal can read the carriageway identity without
      // re-deriving it). See HANDOFF-divided-carriageway-weld.md.
      oneway: !!st.oneway,
      // phase.chainGap: the paired-carriageway CHAIN gap (formerly mislabeled
      // `medianWidth` — it measures chain-to-chain, not the median; D1). The
      // `?? medianWidth` read is back-compat for a pre-rename skeleton.json.
      ...(st.phase ? { phase: { role: st.phase.role || null, kind: st.phase.kind || null, pairKey: st.phase.pairKey || null, ...((st.phase.chainGap ?? st.phase.medianWidth) != null ? { chainGap: st.phase.chainGap ?? st.phase.medianWidth } : {}), ...(st.phase.spineAtStart ? { spineAtStart: st.phase.spineAtStart } : {}), ...(st.phase.spineAtEnd ? { spineAtEnd: st.phase.spineAtEnd } : {}) } } : {}),
      highway: st.highway || 'residential',
      type: st.type || 'residential',
      // Operator-intent fields the V2 emitter consumes. Designer reads
      // these from the live store via `_loadCenterlines`; if we strip
      // them here, the bake's V2 call sees a narrower per-side ped
      // zone than Designer and faces extend past the curb. Keep shape
      // parity with `_loadCenterlines` output.
      ...(st.couplers ? { couplers: st.couplers } : {}),
      ...(st.segmentMeasures ? { segmentMeasures: st.segmentMeasures } : {}),
      ...(st.disabled ? { disabled: true } : {}),
      // [P1 frame-enrichment] Enriched frame fields surviving the serializer
      // whitelist. PRESENT-but-not-yet-consumed: the consumer wiring is
      // deferred to the Wall / Layer-2 (caps→chainPavementRing cap-as-fact,
      // seed→computeStreetMeasure standards cross-section, lanes/surface/
      // maxspeed cross-section priors, continuesAs→per-street name-transition).
      // Without this the fields were stripped here and P1 was invisible.
      ...(Number.isFinite(st.lanes) ? { lanes: st.lanes } : {}),
      ...(st.surface ? { surface: st.surface } : {}),
      ...(st.maxspeed ? { maxspeed: st.maxspeed } : {}),
      ...(st.seed ? { seed: st.seed } : {}),
      ...(st.caps ? { caps: st.caps } : {}),
      ...(st.continuesAs ? { continuesAs: st.continuesAs } : {}),
      // [Part 2 grade separation] The operative exclude-from-faces flag + raw
      // facts, surviving the serializer whitelist so they reach ribbons.streets.
      // CONSUMER: tileGround.extractFaces filters `streets.filter(s => !s.gradeSeparated)`
      // before the planar walk — clears the interchange-triangle/sliver/false-block
      // degenerates (grade-separated centerlines crossing without a shared vertex).
      gradeSeparated: !!st.gradeSeparated,
      ...(st.layer ? { layer: st.layer } : {}),
      ...(st.bridge ? { bridge: true } : {}),
      ...(st.tunnel ? { tunnel: true } : {}),
      intersections: st.intersections.map(ix => ({
        ix: ix.ix,
        withStreets: ix.with.streets.filter(s => s.name !== st.name).map(s => s.name),
      })),
    })),
    // Alleys + paths as roadway ribbons (centerline + paved width).
    // StreetRibbons renders them with the same silhouette/edge-stroke
    // pipeline as streets; widths are pavement-only (no curb/treelawn/
    // sidewalk bands).
    alleys: alleyCenterlines,
    paths: pathCenterlines,
    intersections: intersections.map(ix => ({
      point: ix.point,
      streets: ix.streets.map(s => ({ name: s.name, ix: s.ix })),
    })),
    faces: faceFills,
    // [E2] constructed medians (kind:'median') — consumed by identity in
    // tileGround (median-tile detection + the merge-region asphalt fill).
    medians: medians.map(m => ({ kind: m.kind, name: m.name, streets: m.streets, chains: m.chains, pairKey: m.pairKey, ...(m.absorbedBy ? { absorbedBy: m.absorbedBy } : {}), ring: m.ring })),
    corridors,
    // [E3.1] The junction map — frozen per-node junction identity (continuity
    // pairs, de-taper windows, corner identities, apron specs). PRESENT-but-
    // not-yet-consumed: E3.2 (de-tapered strokes + wedges + aprons) and E3.3
    // (fillet corner identities) consume these stamps in tileGround.
    junctionMap,
    // [P1 frame-enrichment] Top-level frame metadata carried straight from the
    // skeleton so the typed-node graph + name-transition stamps survive into
    // ribbons.json. PRESENT-but-not-yet-consumed: the on-frame faces/intersection
    // unify (which reads junctions) is the Wall (Phase 3); here we only stop the
    // strip so the data is available when that consumer lands.
    ...(skeleton.junctions ? { junctions: skeleton.junctions } : {}),
    ...(skeleton.nameTransitions ? { nameTransitions: skeleton.nameTransitions } : {}),
  }

  // [D2 — THE PREBAKE FACE FREEZE] The block-face TOPOLOGY is decided here,
  // once, and frozen into the artifact. extractFaces — the same pure DCEL
  // walk Survey used to re-run on every render and bake — walks the
  // SERIALIZED chains (exactly the consumer's input: ≥2 points, not
  // grade-separated, UNSMOOTHED — smoothing is an interpolating,
  // junction-pinned geometric map that cannot change topology and must never
  // bake into the artifact) and the result freezes as ribbons.tiles[]:
  // per tile { ring, edges:[{ skelId, side }] }. The walk's per-edge
  // streetIdx (an array index) is resolved to the stable skelId so frozen
  // tiles survive array-order shifts across builds; `side` is the
  // measure-side tag ('right' ⇔ forward half-edge — the extractFaces
  // convention), from which the consumer recovers `forward` bijectively.
  // Chains die at this boundary for block-shape topology (WALL.md §6 — the
  // wall at ~P3). L1 ONLY: corner construction stays live in Survey
  // (L2 = D3, deferred to §HARDENING); the raw-OSM LU faces
  // (ribbons.faces) are untouched (C5 = D4).
  {
    const faceStreets = ribbonsLayer.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
    ribbonsLayer.tiles = extractFaces(faceStreets).map(f => ({
      ring: f.ring.map(p => [p[0], p[1]]),
      edges: f.edges.map(e => ({ skelId: faceStreets[e.streetIdx].skelId || faceStreets[e.streetIdx].name, side: e.side })),
    }))
    console.log(`    [D2] froze ${ribbonsLayer.tiles.length} block-face tiles (skeleton-derived topology)`)
  }

  console.log(`    ${ribbonStreets.length} streets, ${intersections.length} intersections`)
  for (const st of ribbonsLayer.streets) {
    const m = st.measure
    const tag = m.source === 'default' ? ' [DEFAULT]' : ''
    const L = m.left, R = m.right
    console.log(`      ${st.name}: L{pav=${L.pavementHW.toFixed(2)} tl=${L.treelawn.toFixed(2)} sw=${L.sidewalk.toFixed(2)} ${L.terminal}} R{pav=${R.pavementHW.toFixed(2)} tl=${R.treelawn.toFixed(2)} sw=${R.sidewalk.toFixed(2)} ${R.terminal}}${tag}`)
  }

  // ── Surface overlays (sub-face features from OSM) ───────────
  // These sit inside block faces as visual overlays above face fill, below
  // buildings. They never replace ribbon-block geometry (use landuse=* for
  // face classification, not rendering).
  const _amenity = osmData.ground?.amenity || []
  const _leisure = osmData.ground?.leisure || []
  const _natural = osmData.ground?.natural || []
  const _barrier = osmData.ground?.barrier || []

  const parkingLots = []
  const institutionOverlays = []
  for (const f of _amenity) {
    if (!f.coords || f.coords.length < 3) continue
    const ring = f.coords.map(c => ({ x: c.x, z: c.z }))
    if (f.tags?.amenity === 'parking') {
      parkingLots.push({ ring, surface: f.tags.surface || 'asphalt', access: f.tags.access || null })
    } else if (f.tags?.amenity) {
      institutionOverlays.push({ ring, use: f.tags.amenity })
    }
  }
  const leisureOverlays = []
  for (const f of _leisure) {
    if (!f.coords || f.coords.length < 3) continue
    if (f.tags?.leisure === 'park') continue  // Lafayette Park rendered separately
    leisureOverlays.push({ ring: f.coords.map(c => ({ x: c.x, z: c.z })), use: f.tags?.leisure })
  }
  const naturalOverlays = []
  for (const f of _natural) {
    if (!f.coords || f.coords.length < 3) continue
    naturalOverlays.push({ ring: f.coords.map(c => ({ x: c.x, z: c.z })), use: f.tags?.natural })
  }
  // Barriers are linear. Emit as polylines (coords, not ring) keyed by kind.
  const barrierLines = []
  for (const f of _barrier) {
    if (!f.coords || f.coords.length < 2) continue
    if (!['fence', 'wall', 'hedge', 'retaining_wall'].includes(f.tags?.barrier)) continue
    barrierLines.push({ coords: f.coords.map(c => ({ x: c.x, z: c.z })), kind: f.tags.barrier })
  }
  console.log(`    parking_lot: ${parkingLots.length}, institution: ${institutionOverlays.length}, leisure: ${leisureOverlays.length}, natural: ${naturalOverlays.length}, barrier: ${barrierLines.length}`)


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
    alley:          toFeats(alleyUnion),
    centerStripe:   stripeMeta,
    bikeLane:       bikeLanes,
    parkingLine:    parkingLines,
    footway:        bufferEach(footways, STANDARDS.footway.width / 2),
    cycleway:       bufferEach(cycleways, STANDARDS.cycleway.width / 2),
    steps:          bufferEach(steps,    STANDARDS.steps.width    / 2),
    path:           bufferEach(paths,    STANDARDS.path.width     / 2),
    streetlamp:     streetlamps,
    contour:        contours,
    spike:          toFeats(spikeBlockPaths),
    parking_lot:    parkingLots,
    institution:    institutionOverlays,
    leisure:        leisureOverlays,
    natural:        naturalOverlays,
    barrier:        barrierLines,
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
