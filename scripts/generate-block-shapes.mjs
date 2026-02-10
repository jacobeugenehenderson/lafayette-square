#!/usr/bin/env node
/**
 * Generate block shapes by buffering street polylines and extracting voids.
 *
 * Pipeline:
 *   1. Load streets.json + blocks_clean.json street_widths
 *   2. Join same-name street segments into continuous polylines
 *   3. Buffer each polyline by half-ROW using ClipperOffset
 *   4. Union all buffered polygons → PolyTree (preserves holes)
 *   5. Extract holes as block shapes
 *   6. Filter out park overlaps and tiny artifacts
 *   7. Round corners via shrink-then-expand
 *   8. Expand each block by sidewalk width for sidewalk outer ring
 *   9. Compute alley fill polygons via Clipper difference
 *  10. Add park as a block (rounded rectangle)
 *  11. Smooth southern border
 *
 * Output: src/data/block_shapes.json
 */

import { readFileSync, writeFileSync } from 'fs'
import clipperLib from 'clipper-lib'

const { Clipper, ClipperOffset, Paths, PolyTree, IntPoint,
        ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib

// ── Config ──────────────────────────────────────────────────────────────────
const SCALE = 100                 // clipper uses integers; 100 = cm precision
const GRID_ANGLE = -9.2 * Math.PI / 180
const SIDEWALK_WIDTH = 2.0
const CORNER_ROUND = 3.0          // shrink-expand radius for rounding corners
const MIN_BLOCK_AREA = 800        // m² — filter tiny artifacts
const PARK_HALF = 175             // park rounded rect half-size
const PARK_CORNER_RADIUS = 4
const PARK_CORNER_SEGMENTS = 8
const PARK_SIDEWALK_WIDTH = 4.0   // wide sidewalk around park perimeter

const ALLEY_NAMES = new Set(['Mississippi Alley', 'Hickory Lane', 'Rutger Lane'])

// Southern border clip rect
const CLIP_RECT = { xMin: -600, xMax: 900, zMin: -900, zMax: 360 }

// ── Street width lookup ─────────────────────────────────────────────────────
const cleanData = JSON.parse(readFileSync('src/data/blocks_clean.json', 'utf-8'))
const ROW_WIDTHS = { ...cleanData.street_widths }
// Manual overrides for streets not in parcel data
Object.assign(ROW_WIDTHS, {
  'South Tucker Boulevard': 14,
  'Gravois Avenue': 6,
  'Officer David Haynes Memorial Highway': 14,
  'Russell Boulevard': 16,
  'South 13th Street': 12,
  'Papin Street': 13,
  'Geyer Avenue': 9,
  'Allen Avenue': 9,
  'Ohio Avenue': 8,
  'Ann Avenue': 9,
  'McNair Avenue': 9,
  'Caroline Street': 5,
  'Serbian Drive': 8,
  'South 12th Street': 5,
  'South 17th Street': 6,
  'Josephine Street': 6,
  '21st Street Cycle Track': 5,
})

const TYPE_DEFAULTS = { primary: 24, secondary: 18, residential: 14, service: 10 }

function getROW(name, type) {
  if (ROW_WIDTHS[name]) return ROW_WIDTHS[name]
  return TYPE_DEFAULTS[type] || 14
}

// ── Load streets ────────────────────────────────────────────────────────────
const streetsRaw = JSON.parse(readFileSync('src/data/streets.json', 'utf-8'))

// ── Join same-name street segments into continuous polylines ─────────────────
function joinStreetSegments(streets) {
  const byName = new Map()
  for (const s of streets) {
    if (!s.name || !s.points || s.points.length < 2) continue
    if (!byName.has(s.name)) byName.set(s.name, [])
    byName.get(s.name).push({ points: s.points.map(p => [...p]), type: s.type, name: s.name })
  }

  const SNAP = 8
  const results = []

  for (const [name, segs] of byName) {
    const used = new Set()
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue
      used.add(i)
      let chain = [...segs[i].points]
      let changed = true
      while (changed) {
        changed = false
        for (let j = 0; j < segs.length; j++) {
          if (used.has(j)) continue
          const seg = segs[j].points
          const headC = chain[0], tailC = chain[chain.length - 1]
          const headS = seg[0], tailS = seg[seg.length - 1]
          const dTH = Math.hypot(tailC[0] - headS[0], tailC[1] - headS[1])
          const dTT = Math.hypot(tailC[0] - tailS[0], tailC[1] - tailS[1])
          const dHT = Math.hypot(headC[0] - tailS[0], headC[1] - tailS[1])
          const dHH = Math.hypot(headC[0] - headS[0], headC[1] - headS[1])
          if      (dTH < SNAP) { chain = [...chain, ...seg.slice(1)];                used.add(j); changed = true }
          else if (dTT < SNAP) { chain = [...chain, ...[...seg].reverse().slice(1)]; used.add(j); changed = true }
          else if (dHT < SNAP) { chain = [...seg, ...chain.slice(1)];                used.add(j); changed = true }
          else if (dHH < SNAP) { chain = [...[...seg].reverse(), ...chain.slice(1)]; used.add(j); changed = true }
        }
      }
      results.push({ points: chain, type: segs[i].type, name })
    }
  }
  return results
}

// ── Extend polylines at endpoints ────────────────────────────────────────────
function extendPolyline(points, extension) {
  if (points.length < 2) return points
  const result = [...points.map(p => [...p])]

  // Extend start
  const [x0, z0] = result[0]
  const [x1, z1] = result[1]
  const d0 = Math.hypot(x1 - x0, z1 - z0) || 1
  result[0] = [x0 - (x1 - x0) / d0 * extension, z0 - (z1 - z0) / d0 * extension]

  // Extend end
  const n = result.length
  const [xa, za] = result[n - 2]
  const [xb, zb] = result[n - 1]
  const d1 = Math.hypot(xb - xa, zb - za) || 1
  result[n - 1] = [xb + (xb - xa) / d1 * extension, zb + (zb - za) / d1 * extension]

  return result
}

// ── Clipper helpers ─────────────────────────────────────────────────────────
const toInt = (x, z) => new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))
const fromInt = (pt) => [pt.X / SCALE, pt.Y / SCALE]

function polylineToClipperPath(points) {
  return points.map(([x, z]) => toInt(x, z))
}

function bufferPolyline(path, distance) {
  const co = new ClipperOffset()
  co.AddPath(path, JoinType.jtMiter, EndType.etOpenSquare)
  const solution = new Paths()
  co.Execute(solution, Math.round(distance * SCALE))
  return solution
}

function unionPolygons(allPaths) {
  const clipper = new Clipper()
  for (const paths of allPaths) {
    for (let i = 0; i < paths.length; i++) {
      clipper.AddPath(paths[i], PolyType.ptSubject, true)
    }
  }
  const tree = new PolyTree()
  clipper.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return tree
}

function unionPolygonsToPaths(allPaths) {
  const clipper = new Clipper()
  for (const paths of allPaths) {
    for (let i = 0; i < paths.length; i++) {
      clipper.AddPath(paths[i], PolyType.ptSubject, true)
    }
  }
  const solution = new Paths()
  clipper.Execute(ClipType.ctUnion, solution, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return solution
}

function clipperDifference(subjectPaths, clipPaths) {
  const clipper = new Clipper()
  for (const p of subjectPaths) {
    clipper.AddPath(p, PolyType.ptSubject, true)
  }
  for (const p of clipPaths) {
    clipper.AddPath(p, PolyType.ptClip, true)
  }
  const solution = new Paths()
  clipper.Execute(ClipType.ctDifference, solution, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return solution
}

function clipperIntersection(subjectPaths, clipPaths) {
  const clipper = new Clipper()
  for (const p of subjectPaths) {
    clipper.AddPath(p, PolyType.ptSubject, true)
  }
  for (const p of clipPaths) {
    clipper.AddPath(p, PolyType.ptClip, true)
  }
  const solution = new Paths()
  clipper.Execute(ClipType.ctIntersection, solution, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return solution
}

function offsetPolygon(polygon, distance, joinType = JoinType.jtRound) {
  const co = new ClipperOffset()
  co.ArcTolerance = 0.25 * SCALE  // smooth curves
  co.AddPath(polygon, joinType, EndType.etClosedPolygon)
  const solution = new Paths()
  co.Execute(solution, Math.round(distance * SCALE))
  return solution.length > 0 ? solution[0] : null
}

function polygonArea(poly) {
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    area += poly[i][0] * poly[j][1]
    area -= poly[j][0] * poly[i][1]
  }
  return Math.abs(area) / 2
}

function clipperPolygonArea(path) {
  return Math.abs(Clipper.Area(path)) / (SCALE * SCALE)
}

function centroid(poly) {
  let cx = 0, cz = 0
  for (const [x, z] of poly) { cx += x; cz += z }
  return [cx / poly.length, cz / poly.length]
}

// ── Park overlap check (rotated rectangle) ──────────────────────────────────
function isInsidePark(x, z) {
  const angle = 9.2 * Math.PI / 180
  const c = Math.cos(angle), s = Math.sin(angle)
  const rx = x * c + z * s
  const rz = -x * s + z * c
  return Math.abs(rx) < 185 && Math.abs(rz) < 185
}

// ── Generate park rounded rectangle ─────────────────────────────────────────
function generateParkPolygon() {
  const half = PARK_HALF
  const r = PARK_CORNER_RADIUS
  const segs = PARK_CORNER_SEGMENTS
  const pts = []

  // Bottom edge (south, -z direction in local = +z in park-local)
  pts.push([-half + r, -half])
  pts.push([half - r, -half])
  // Bottom-right corner
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / segs)
    pts.push([half - r + r * Math.cos(a), -half + r + r * Math.sin(a)])
  }
  // Right edge
  pts.push([half, -half + r])
  pts.push([half, half - r])
  // Top-right corner
  for (let i = 0; i <= segs; i++) {
    const a = 0 + (Math.PI / 2) * (i / segs)
    pts.push([half - r + r * Math.cos(a), half - r + r * Math.sin(a)])
  }
  // Top edge
  pts.push([half - r, half])
  pts.push([-half + r, half])
  // Top-left corner
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / segs)
    pts.push([-half + r + r * Math.cos(a), half - r + r * Math.sin(a)])
  }
  // Left edge
  pts.push([-half, half - r])
  pts.push([-half, -half + r])
  // Bottom-left corner
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / segs)
    pts.push([-half + r + r * Math.cos(a), -half + r + r * Math.sin(a)])
  }

  // Rotate by GRID_ANGLE to world coords (Three.js Y-axis rotation convention)
  const cos = Math.cos(GRID_ANGLE), sin = Math.sin(GRID_ANGLE)
  return pts.map(([x, z]) => {
    const rx = x * cos + z * sin
    const rz = -x * sin + z * cos
    return [rx, rz]
  })
}

// ── Extract blocks from PolyTree ────────────────────────────────────────────
function extractHoles(node) {
  const holes = []
  for (let i = 0; i < node.ChildCount(); i++) {
    const child = node.Childs()[i]
    for (let j = 0; j < child.ChildCount(); j++) {
      const hole = child.Childs()[j]
      const pts = hole.Contour().map(fromInt)
      if (pts.length >= 3) {
        holes.push(pts)
      }
      const nested = extractHoles(hole)
      holes.push(...nested)
    }
  }
  return holes
}

function extractOuters(node) {
  const outers = []
  for (let i = 0; i < node.ChildCount(); i++) {
    const child = node.Childs()[i]
    const pts = child.Contour().map(fromInt)
    if (pts.length >= 3) outers.push(pts)
  }
  return outers
}

// ── Main pipeline ───────────────────────────────────────────────────────────
console.log('Joining street segments...')
const joined = joinStreetSegments(streetsRaw.streets)
console.log(`  ${joined.length} joined polylines from ${streetsRaw.streets.filter(s => s.name).length} named segments`)

const namedStreets = joined.filter(s => {
  if (!s.name) return false
  return true
})
console.log(`  ${namedStreets.length} named street polylines`)

// Extend polylines so buffers overlap at intersections
const extendedStreets = namedStreets.map(s => {
  const pts = s.points
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1])
  }
  const ext = Math.min(len < 400 ? 100 : 20, len * 0.5)
  return { ...s, points: extendPolyline(s.points, ext) }
})

// ── Buffer streets, separating alleys from non-alleys ───────────────────────
console.log('Buffering streets...')
const allBuffered = []       // all streets (for block extraction)
const nonAlleyBuffered = []  // non-alley streets (for alley fill clipping)
const alleyBuffered = []     // alley buffers only

for (const street of extendedStreets) {
  const row = getROW(street.name, street.type)
  const halfROW = row / 2
  const path = polylineToClipperPath(street.points)
  const buffered = bufferPolyline(path, halfROW)
  if (buffered.length > 0) {
    allBuffered.push(buffered)
    if (ALLEY_NAMES.has(street.name)) {
      alleyBuffered.push({ name: street.name, paths: buffered })
    } else {
      nonAlleyBuffered.push(buffered)
    }
  }
}
console.log(`  ${allBuffered.length} buffered polygons (${alleyBuffered.length} alleys, ${nonAlleyBuffered.length} non-alleys)`)

// Union all buffered polygons (for block extraction — includes alleys)
console.log('Computing union...')
const tree = unionPolygons(allBuffered)

// ── Compute alley fill polygons ─────────────────────────────────────────────
console.log('Computing alley fills...')
// Union non-alley buffers into a single set of paths
const nonAlleyUnion = unionPolygonsToPaths(nonAlleyBuffered)
console.log(`  Non-alley union: ${nonAlleyUnion.length} paths`)

const alleyFills = []
for (const alley of alleyBuffered) {
  // Buffer alley centerline generously (already buffered by half-ROW, extend by 300m)
  // Actually we already have the alley buffer polygon — just difference it against non-alley union
  const diffResult = clipperDifference(alley.paths, nonAlleyUnion)
  for (let i = 0; i < diffResult.length; i++) {
    const poly = diffResult[i]
    const area = clipperPolygonArea(poly)
    if (area > 10) { // filter slivers < 10m²
      const pts = poly.map(fromInt)
      alleyFills.push({ name: alley.name, polygon: pts })
    }
  }
}
console.log(`  ${alleyFills.length} alley fill polygons`)

// ── Extract boundary and holes ──────────────────────────────────────────────
const outers = extractOuters(tree)
console.log(`  ${outers.length} outer boundary/boundaries`)

let border = null
let maxArea = 0
for (const outer of outers) {
  const a = polygonArea(outer)
  if (a > maxArea) { maxArea = a; border = outer }
}
console.log(`  Border area: ${(maxArea).toFixed(0)} m²`)

// ── Smooth southern border ──────────────────────────────────────────────────
console.log('Smoothing southern border...')
if (border) {
  const borderClipperPath = border.map(([x, z]) => toInt(x, z))
  const clipRect = [
    toInt(CLIP_RECT.xMin, CLIP_RECT.zMin),
    toInt(CLIP_RECT.xMax, CLIP_RECT.zMin),
    toInt(CLIP_RECT.xMax, CLIP_RECT.zMax),
    toInt(CLIP_RECT.xMin, CLIP_RECT.zMax),
  ]
  const clipped = clipperIntersection([borderClipperPath], [clipRect])
  if (clipped.length > 0) {
    // Find largest result polygon
    let bestIdx = 0, bestArea = 0
    for (let i = 0; i < clipped.length; i++) {
      const a = Math.abs(Clipper.Area(clipped[i]))
      if (a > bestArea) { bestArea = a; bestIdx = i }
    }
    border = clipped[bestIdx].map(fromInt)
    console.log(`  Border clipped, new area: ${(bestArea / (SCALE * SCALE)).toFixed(0)} m²`)
  }
}

const rawHoles = extractHoles(tree)
console.log(`  ${rawHoles.length} raw holes (potential blocks)`)

// Filter: remove park overlaps and tiny blocks
const filtered = rawHoles.filter(hole => {
  const area = polygonArea(hole)
  if (area < MIN_BLOCK_AREA) return false
  const [cx, cz] = centroid(hole)
  if (isInsidePark(cx, cz)) return false
  return true
})
console.log(`  ${filtered.length} blocks after filtering (min area ${MIN_BLOCK_AREA}m², park exclusion)`)

// Round corners: shrink by CORNER_ROUND, then expand by CORNER_ROUND
console.log('Rounding corners...')
const roundedBlocks = []
for (const hole of filtered) {
  const clipperPoly = hole.map(([x, z]) => toInt(x, z))
  if (Clipper.Area(clipperPoly) < 0) clipperPoly.reverse()

  const shrunk = offsetPolygon(clipperPoly, -CORNER_ROUND, JoinType.jtMiter)
  if (!shrunk || shrunk.length < 3) continue

  const expanded = offsetPolygon(shrunk, CORNER_ROUND, JoinType.jtRound)
  if (!expanded || expanded.length < 3) continue

  roundedBlocks.push(expanded.map(fromInt))
}
console.log(`  ${roundedBlocks.length} blocks after rounding`)

// ── Edge blocks for orphan buildings ──────────────────────────────────────
// Buildings not covered by interior blocks get blocks defined by named streets.
console.log('Generating edge blocks for orphan buildings...')
const buildingsRaw = JSON.parse(readFileSync('src/data/buildings.json', 'utf-8'))

function pip(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1]
    const xj = poly[j][0], zj = poly[j][1]
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// Find orphan building centroids
const orphans = []
for (const bldg of buildingsRaw.buildings) {
  if (!bldg.footprint || bldg.footprint.length < 3) continue
  let sx = 0, sz = 0
  for (const [x, z] of bldg.footprint) { sx += x; sz += z }
  const cx = sx / bldg.footprint.length, cz = sz / bldg.footprint.length
  if (isInsidePark(cx, cz)) continue
  let inBlock = false
  for (const lot of roundedBlocks) {
    if (pip(cx, cz, lot)) { inBlock = true; break }
  }
  if (!inBlock) orphans.push({ id: bldg.id, x: cx, z: cz })
}
console.log(`  ${orphans.length} orphan buildings`)

if (orphans.length > 0) {
  // Spatial clustering: group nearby orphans (generous 120m radius)
  const CLUSTER_RADIUS = 120
  const clusters = []
  const visited = new Set()

  for (let i = 0; i < orphans.length; i++) {
    if (visited.has(i)) continue
    const cluster = [orphans[i]]
    visited.add(i)
    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < orphans.length; j++) {
        if (visited.has(j)) continue
        for (const c of cluster) {
          if (Math.hypot(orphans[j].x - c.x, orphans[j].z - c.z) < CLUSTER_RADIUS) {
            cluster.push(orphans[j])
            visited.add(j)
            changed = true
            break
          }
        }
      }
    }
    clusters.push(cluster)
  }
  console.log(`  ${clusters.length} orphan clusters`)

  // Classify streets as N-S or E-W
  const nsStreets = []
  const ewStreets = []
  for (const street of namedStreets) {
    const pts = street.points
    const dx = pts[pts.length - 1][0] - pts[0][0]
    const dz = pts[pts.length - 1][1] - pts[0][1]
    let avgX = 0, avgZ = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of pts) {
      avgX += x; avgZ += z
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
    avgX /= pts.length; avgZ /= pts.length
    const halfROW = getROW(street.name, street.type) / 2
    if (Math.abs(dz) > Math.abs(dx)) {
      nsStreets.push({ name: street.name, avgX, minZ, maxZ, halfROW })
    } else {
      ewStreets.push({ name: street.name, avgZ, minX, maxX, halfROW })
    }
  }
  nsStreets.sort((a, b) => a.avgX - b.avgX)
  ewStreets.sort((a, b) => a.avgZ - b.avgZ)

  const streetUnionFlat = unionPolygonsToPaths(allBuffered)
  let edgeBlockCount = 0
  const OPEN_PAD = 30 // generous padding on open sides

  // Helper: create edge block from a rectangle, subtract streets, dedup, add
  function tryAddEdgeBlock(xMin, zMin, xMax, zMax) {
    if (xMax - xMin < 10 || zMax - zMin < 10) return 0
    const blockPoly = [[xMin, zMin], [xMax, zMin], [xMax, zMax], [xMin, zMax]]
    if (polygonArea(blockPoly) < MIN_BLOCK_AREA) return 0

    const blockClipper = blockPoly.map(([x, z]) => toInt(x, z))
    if (Clipper.Area(blockClipper) < 0) blockClipper.reverse()
    const clipped = clipperDifference([blockClipper], streetUnionFlat)

    let added = 0
    for (const poly of clipped) {
      if (clipperPolygonArea(poly) < MIN_BLOCK_AREA) continue
      if (Clipper.Area(poly) < 0) poly.reverse()
      const shrunk = offsetPolygon(poly, -CORNER_ROUND, JoinType.jtMiter)
      if (!shrunk || shrunk.length < 3) continue
      const expanded = offsetPolygon(shrunk, CORNER_ROUND, JoinType.jtRound)
      if (!expanded || expanded.length < 3) continue

      const newLot = expanded.map(fromInt)
      const [ncx, ncz] = centroid(newLot)
      if (isInsidePark(ncx, ncz)) continue
      let isDup = false
      for (const existing of roundedBlocks) {
        if (pip(ncx, ncz, existing)) { isDup = true; break }
      }
      if (isDup) continue
      roundedBlocks.push(newLot)
      added++
    }
    return added
  }

  for (const cluster of clusters) {
    // Cluster bounding box
    let cMinX = Infinity, cMaxX = -Infinity, cMinZ = Infinity, cMaxZ = -Infinity
    for (const o of cluster) {
      cMinX = Math.min(cMinX, o.x); cMaxX = Math.max(cMaxX, o.x)
      cMinZ = Math.min(cMinZ, o.z); cMaxZ = Math.max(cMaxZ, o.z)
    }

    // Find ALL N-S streets that pass through the cluster's x and z range
    const relevantNS = nsStreets.filter(s =>
      s.avgX >= cMinX - 80 && s.avgX <= cMaxX + 80 &&
      s.maxZ >= cMinZ - 50 && s.minZ <= cMaxZ + 50
    ).sort((a, b) => a.avgX - b.avgX)

    // Find E-W bounding streets OUTSIDE the cluster (north of all bldgs, south of all bldgs)
    let northSt = null, southSt = null
    for (const s of ewStreets) {
      if (s.maxX < cMinX - 80 || s.minX > cMaxX + 80) continue
      if (s.avgZ < cMinZ && (!northSt || s.avgZ > northSt.avgZ)) northSt = s
      if (s.avgZ > cMaxZ && (!southSt || s.avgZ < southSt.avgZ)) southSt = s
    }

    let zMin = northSt ? northSt.avgZ + northSt.halfROW : cMinZ - OPEN_PAD
    let zMax = southSt ? southSt.avgZ - southSt.halfROW : cMaxZ + OPEN_PAD
    zMax = Math.min(zMax, CLIP_RECT.zMax - 5)

    if (zMax - zMin < 10) continue

    // Create a block for each "column" between adjacent N-S streets
    const xEdges = []
    if (relevantNS.length === 0) {
      // No N-S streets — single block for the whole cluster
      xEdges.push([cMinX - OPEN_PAD, cMaxX + OPEN_PAD])
    } else {
      // Left open side (west of first N-S street)
      if (cMinX < relevantNS[0].avgX - relevantNS[0].halfROW - 5) {
        xEdges.push([cMinX - OPEN_PAD, relevantNS[0].avgX - relevantNS[0].halfROW])
      }
      // Between each pair of adjacent N-S streets
      for (let i = 0; i < relevantNS.length - 1; i++) {
        const left = relevantNS[i].avgX + relevantNS[i].halfROW
        const right = relevantNS[i + 1].avgX - relevantNS[i + 1].halfROW
        if (right - left > 10) xEdges.push([left, right])
      }
      // Right open side (east of last N-S street)
      const lastNS = relevantNS[relevantNS.length - 1]
      if (cMaxX > lastNS.avgX + lastNS.halfROW + 5) {
        xEdges.push([lastNS.avgX + lastNS.halfROW, cMaxX + OPEN_PAD])
      }
    }

    let clusterAdded = 0
    for (const [xMin, xMax] of xEdges) {
      clusterAdded += tryAddEdgeBlock(xMin, zMin, xMax, zMax)
    }
    edgeBlockCount += clusterAdded

    if (clusterAdded > 0) {
      const streetNames = [...relevantNS.map(s => s.name), northSt?.name, southSt?.name]
        .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')
      console.log(`  Cluster (${cluster.length} bldgs): ${streetNames} — ${clusterAdded} blocks added`)
    }
  }

  console.log(`  +${edgeBlockCount} edge blocks (${roundedBlocks.length} total)`)
}

// Compute sidewalk rings (expand each block by SIDEWALK_WIDTH)
console.log('Computing sidewalk rings...')
const blocks = []
let blockId = 0
for (const lot of roundedBlocks) {
  const clipperLot = lot.map(([x, z]) => toInt(x, z))
  if (Clipper.Area(clipperLot) < 0) clipperLot.reverse()

  const sidewalkPoly = offsetPolygon(clipperLot, SIDEWALK_WIDTH)
  if (!sidewalkPoly || sidewalkPoly.length < 3) continue

  const sidewalk = sidewalkPoly.map(fromInt)
  const [cx, cz] = centroid(lot)
  const area = polygonArea(lot)

  const round2 = v => Math.round(v * 100) / 100
  blocks.push({
    id: `blk-${String(blockId++).padStart(4, '0')}`,
    lot: lot.map(([x, z]) => [round2(x), round2(z)]),
    sidewalk: sidewalk.map(([x, z]) => [round2(x), round2(z)]),
    centroid: [round2(cx), round2(cz)],
    area: Math.round(area),
  })
}

// ── Add park block with wide sidewalk ring ──────────────────────────────────
console.log('Adding park block...')
const parkPoly = generateParkPolygon()
const parkArea = polygonArea(parkPoly)
const round2 = v => Math.round(v * 100) / 100
const [parkCx, parkCz] = centroid(parkPoly)

// Compute park sidewalk ring (expand park polygon by PARK_SIDEWALK_WIDTH)
const parkClipperPoly = parkPoly.map(([x, z]) => toInt(x, z))
if (Clipper.Area(parkClipperPoly) < 0) parkClipperPoly.reverse()
const parkSidewalkPoly = offsetPolygon(parkClipperPoly, PARK_SIDEWALK_WIDTH)
const parkSidewalk = parkSidewalkPoly ? parkSidewalkPoly.map(fromInt) : null

blocks.push({
  id: 'blk-park',
  lot: parkPoly.map(([x, z]) => [round2(x), round2(z)]),
  sidewalk: parkSidewalk ? parkSidewalk.map(([x, z]) => [round2(x), round2(z)]) : null,
  centroid: [round2(parkCx), round2(parkCz)],
  area: Math.round(parkArea),
  isPark: true,
})
console.log(`  Park block: area=${Math.round(parkArea)}m², sidewalk=${parkSidewalk ? parkSidewalk.length + 'pts' : 'none'}`)

// Build cleaned street polylines for the renderer
const streetLines = namedStreets.map(s => ({
  name: s.name,
  type: s.type,
  points: s.points.map(([x, z]) => [round2(x), round2(z)]),
  width: getROW(s.name, s.type),
}))

// Simplify border
const borderOut = border
  ? border.map(([x, z]) => [round2(x), round2(z)])
  : null

// Round alley fill polygons
const alleyFillsOut = alleyFills.map(af => ({
  name: af.name,
  polygon: af.polygon.map(([x, z]) => [round2(x), round2(z)]),
}))

const output = {
  border: borderOut,
  streets: streetLines,
  blocks,
  alleyFills: alleyFillsOut,
}

console.log(`\nGenerated ${blocks.length} block shapes (${blocks.filter(b => !b.isPark).length} city + 1 park)`)
blocks.filter(b => !b.isPark).forEach(b => {
  console.log(`  ${b.id}: area=${b.area}m²  centroid=(${b.centroid[0].toFixed(0)}, ${b.centroid[1].toFixed(0)})  lot=${b.lot.length}pts  sw=${b.sidewalk.length}pts`)
})
console.log(`\n${alleyFillsOut.length} alley fill polygons`)
alleyFillsOut.forEach(af => {
  console.log(`  ${af.name}: ${af.polygon.length} pts`)
})

writeFileSync('src/data/block_shapes.json', JSON.stringify(output))
console.log('Written to src/data/block_shapes.json')
