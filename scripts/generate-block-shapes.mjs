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

// Haynes Memorial Highway ramp — southern boundary of the neighborhood
const HAYNES_SLOPE = 0.3465
const HAYNES_INTERCEPT = 349.1   // 354.1 - 5m buffer north of centerline
const HAYNES_WEST_X = -142.3
const HAYNES_FLAT_Z = 300.0
function haynesBoundaryZ(x) {
  if (x < HAYNES_WEST_X) return HAYNES_FLAT_Z
  return HAYNES_SLOPE * x + HAYNES_INTERCEPT
}

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

// ── Graph-based street segment joiner ─────────────────────────────────────────
// Replaces deduplicateReverseSegments() + joinStreetSegments() with a robust
// 7-phase algorithm: graph build → dedup multi-edges → connected components →
// chain walk → bridge gaps → absorb stubs → orient consistently.
function joinStreetSegmentsGraph(streets) {
  const SNAP = 15          // endpoint snap radius (meters)
  const BRIDGE_DIST = 50   // max gap to bridge between components
  const BRIDGE_ANGLE = 45  // max bearing difference (degrees) to bridge
  const STUB_MIN = 15      // discard components shorter than this

  // Group segments by street name
  const byName = new Map()
  for (const s of streets) {
    if (!s.name || !s.points || s.points.length < 2) continue
    if (!byName.has(s.name)) byName.set(s.name, [])
    byName.get(s.name).push({ points: s.points.map(p => [...p]), type: s.type })
  }

  const results = []
  let totalRaw = 0, totalDeduped = 0, totalBridged = 0, totalStubs = 0

  for (const [name, segs] of byName) {
    totalRaw += segs.length

    // ── Phase 1: Build node-edge graph with union-find snapping ──────────
    // Collect all endpoints
    const allEndpoints = [] // [{x, z, segIdx, end: 'start'|'end'}]
    for (let i = 0; i < segs.length; i++) {
      const pts = segs[i].points
      allEndpoints.push({ x: pts[0][0], z: pts[0][1], segIdx: i, end: 'start' })
      allEndpoints.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], segIdx: i, end: 'end' })
    }

    // Union-find for snapping
    const parent = allEndpoints.map((_, i) => i)
    function find(a) {
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] }
      return a
    }
    function unite(a, b) { parent[find(a)] = find(b) }

    for (let i = 0; i < allEndpoints.length; i++) {
      for (let j = i + 1; j < allEndpoints.length; j++) {
        const d = Math.hypot(allEndpoints[i].x - allEndpoints[j].x,
                             allEndpoints[i].z - allEndpoints[j].z)
        if (d < SNAP) unite(i, j)
      }
    }

    // Compute node IDs (canonical representative of each cluster)
    // and average position per node
    const nodePositions = new Map() // nodeId → {sx, sz, count}
    const endpointNode = [] // index parallel to allEndpoints → nodeId
    for (let i = 0; i < allEndpoints.length; i++) {
      const nodeId = find(i)
      endpointNode.push(nodeId)
      if (!nodePositions.has(nodeId)) nodePositions.set(nodeId, { sx: 0, sz: 0, count: 0 })
      const np = nodePositions.get(nodeId)
      np.sx += allEndpoints[i].x; np.sz += allEndpoints[i].z; np.count++
    }

    // Build edges: each segment → edge from startNode to endNode
    const edges = [] // {startNode, endNode, points, segIdx}
    for (let i = 0; i < segs.length; i++) {
      const startEpIdx = i * 2
      const endEpIdx = i * 2 + 1
      const startNode = endpointNode[startEpIdx]
      const endNode = endpointNode[endEpIdx]
      edges.push({ startNode, endNode, points: segs[i].points, segIdx: i })
    }

    // ── Phase 2: Deduplicate multi-edges ─────────────────────────────────
    // For node pairs with multiple edges, keep the one closest to origin
    const edgePairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`
    const edgesByPair = new Map()
    for (let i = 0; i < edges.length; i++) {
      const key = edgePairKey(edges[i].startNode, edges[i].endNode)
      if (!edgesByPair.has(key)) edgesByPair.set(key, [])
      edgesByPair.get(key).push(i)
    }

    const removeEdges = new Set()
    for (const [, indices] of edgesByPair) {
      if (indices.length <= 1) continue
      // Keep edge whose midpoint is closest to origin (inner lane)
      let bestIdx = indices[0], bestDist = Infinity
      for (const idx of indices) {
        const pts = edges[idx].points
        const mid = Math.floor(pts.length / 2)
        const d = Math.hypot(pts[mid][0], pts[mid][1])
        if (d < bestDist) { bestDist = d; bestIdx = idx }
      }
      for (const idx of indices) {
        if (idx !== bestIdx) removeEdges.add(idx)
      }
    }

    const liveEdges = edges.filter((_, i) => !removeEdges.has(i))
    totalDeduped += removeEdges.size

    // ── Phase 3: Connected components (BFS) ──────────────────────────────
    // Build adjacency list from live edges
    const adj = new Map() // nodeId → [{edgeIdx, neighbor}]
    for (let i = 0; i < liveEdges.length; i++) {
      const e = liveEdges[i]
      if (!adj.has(e.startNode)) adj.set(e.startNode, [])
      if (!adj.has(e.endNode)) adj.set(e.endNode, [])
      adj.get(e.startNode).push({ edgeIdx: i, neighbor: e.endNode })
      adj.get(e.endNode).push({ edgeIdx: i, neighbor: e.startNode })
    }

    const visited = new Set()
    const components = [] // each: [{edgeIdx}]

    for (const startNode of adj.keys()) {
      if (visited.has(startNode)) continue
      visited.add(startNode)
      const compNodes = [startNode]
      const compEdgeIndices = new Set()
      const queue = [startNode]
      while (queue.length > 0) {
        const cur = queue.shift()
        for (const { edgeIdx, neighbor } of (adj.get(cur) || [])) {
          compEdgeIndices.add(edgeIdx)
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            compNodes.push(neighbor)
            queue.push(neighbor)
          }
        }
      }
      components.push({ nodes: compNodes, edgeIndices: [...compEdgeIndices] })
    }

    // ── Phase 4: Longest path per component (chain walk) ─────────────────
    function chainWalk(comp) {
      if (comp.edgeIndices.length === 0) return null

      // Build local adjacency
      const localAdj = new Map()
      for (const ei of comp.edgeIndices) {
        const e = liveEdges[ei]
        if (!localAdj.has(e.startNode)) localAdj.set(e.startNode, [])
        if (!localAdj.has(e.endNode)) localAdj.set(e.endNode, [])
        localAdj.get(e.startNode).push({ edgeIdx: ei, neighbor: e.endNode })
        localAdj.get(e.endNode).push({ edgeIdx: ei, neighbor: e.startNode })
      }

      // Find degree-1 nodes (chain endpoints)
      let startNode = null
      for (const [node, neighbors] of localAdj) {
        if (neighbors.length === 1) { startNode = node; break }
      }
      // Cycle: pick arbitrary start
      if (startNode === null) startNode = comp.nodes[0]

      // Walk the chain, concatenating point arrays
      const usedEdges = new Set()
      let currentNode = startNode
      let polyline = []

      while (true) {
        const neighbors = localAdj.get(currentNode) || []
        let nextEdge = null
        for (const { edgeIdx, neighbor } of neighbors) {
          if (!usedEdges.has(edgeIdx)) {
            nextEdge = { edgeIdx, neighbor }
            break
          }
        }
        if (!nextEdge) break

        usedEdges.add(nextEdge.edgeIdx)
        const e = liveEdges[nextEdge.edgeIdx]

        // Determine if we walk this edge forward or backward
        let edgePts
        if (e.startNode === currentNode) {
          edgePts = e.points
        } else {
          edgePts = [...e.points].reverse()
        }

        if (polyline.length === 0) {
          polyline = [...edgePts]
        } else {
          polyline = [...polyline, ...edgePts.slice(1)]
        }

        currentNode = nextEdge.neighbor
      }

      return polyline
    }

    const polylines = []
    for (const comp of components) {
      const pl = chainWalk(comp)
      if (pl && pl.length >= 2) polylines.push(pl)
    }

    // ── Phase 5: Bridge nearby components ────────────────────────────────
    function polylineLength(pts) {
      let len = 0
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      }
      return len
    }

    function bearing(p1, p2) {
      return Math.atan2(p2[0] - p1[0], p2[1] - p1[1])
    }

    function bearingDiffDeg(a, b) {
      let diff = Math.abs(a - b) * 180 / Math.PI
      if (diff > 180) diff = 360 - diff
      return diff
    }

    // Iteratively try to bridge components
    let merged = true
    while (merged && polylines.length > 1) {
      merged = false
      let bestI = -1, bestJ = -1, bestDist = Infinity, bestFlipI = false, bestFlipJ = false

      for (let i = 0; i < polylines.length; i++) {
        for (let j = i + 1; j < polylines.length; j++) {
          const pi = polylines[i], pj = polylines[j]
          // Try all 4 endpoint pairings
          const pairs = [
            { pi_end: pi.length - 1, pj_end: 0, flipI: false, flipJ: false,
              bearI: bearing(pi[pi.length - 2], pi[pi.length - 1]),
              bearJ: bearing(pj[0], pj[1]) },
            { pi_end: pi.length - 1, pj_end: pj.length - 1, flipI: false, flipJ: true,
              bearI: bearing(pi[pi.length - 2], pi[pi.length - 1]),
              bearJ: bearing(pj[pj.length - 1], pj[pj.length - 2]) },
            { pi_end: 0, pj_end: 0, flipI: true, flipJ: false,
              bearI: bearing(pi[1], pi[0]),
              bearJ: bearing(pj[0], pj[1]) },
            { pi_end: 0, pj_end: pj.length - 1, flipI: true, flipJ: true,
              bearI: bearing(pi[1], pi[0]),
              bearJ: bearing(pj[pj.length - 1], pj[pj.length - 2]) },
          ]
          for (const p of pairs) {
            const d = Math.hypot(pi[p.pi_end][0] - pj[p.pj_end][0],
                                 pi[p.pi_end][1] - pj[p.pj_end][1])
            if (d < BRIDGE_DIST && bearingDiffDeg(p.bearI, p.bearJ) < BRIDGE_ANGLE && d < bestDist) {
              bestDist = d; bestI = i; bestJ = j; bestFlipI = p.flipI; bestFlipJ = p.flipJ
            }
          }
        }
      }

      if (bestI >= 0) {
        let pi = polylines[bestI], pj = polylines[bestJ]
        if (bestFlipI) pi = [...pi].reverse()
        if (bestFlipJ) pj = [...pj].reverse()
        // Concatenate: pi tail → pj head
        const bridged = [...pi, ...pj]
        polylines.splice(bestJ, 1)
        polylines.splice(bestI, 1)
        polylines.push(bridged)
        merged = true
        totalBridged++
      }
    }

    // ── Phase 6: Absorb tiny stubs ───────────────────────────────────────
    const filtered = polylines.filter(pl => {
      if (polylineLength(pl) < STUB_MIN) { totalStubs++; return false }
      return true
    })

    // ── Phase 7: Orient consistently ─────────────────────────────────────
    for (const pl of filtered) {
      const dx = pl[pl.length - 1][0] - pl[0][0]
      const dz = pl[pl.length - 1][1] - pl[0][1]
      if (Math.abs(dx) >= Math.abs(dz)) {
        // E-W street: ensure W→E (increasing X)
        if (dx < 0) pl.reverse()
      } else {
        // N-S street: ensure N→S (increasing Z)
        if (dz < 0) pl.reverse()
      }
      results.push({ points: pl, type: segs[0].type, name })
    }
  }

  console.log(`  Graph join: ${totalRaw} raw segments → ${results.length} polylines`)
  console.log(`    Deduped ${totalDeduped} multi-edges, bridged ${totalBridged} gaps, dropped ${totalStubs} stubs`)

  // Per-street summary
  const countByName = new Map()
  for (const r of results) {
    countByName.set(r.name, (countByName.get(r.name) || 0) + 1)
  }
  const multiSegs = [...countByName.entries()].filter(([, c]) => c > 1)
  if (multiSegs.length > 0) {
    console.log(`    Multi-segment streets: ${multiSegs.map(([n, c]) => `${n}=${c}`).join(', ')}`)
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
console.log('Joining street segments (graph pathfinder)...')
const joined = joinStreetSegmentsGraph(streetsRaw.streets)

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
const TRUMAN_X = 620  // eastern boundary — core stops at Truman Parkway
const filtered = rawHoles.filter(hole => {
  const area = polygonArea(hole)
  if (area < MIN_BLOCK_AREA) return false
  const [cx, cz] = centroid(hole)
  if (isInsidePark(cx, cz)) return false
  if (cx > TRUMAN_X) return false  // east of Truman — outside core
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
// Edge blocks get lot fills but NO sidewalk rings (diagonal artifacts from
// non-axis-aligned street buffers). Street flanking sidewalks provide the surface.
const edgeBlockIndices = new Set()
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
console.log(`  ${orphans.length} orphan buildings total`)

// Only keep south-side orphans (between core and Haynes highway)
const southOrphans = orphans.filter(o =>
  o.z > 150 && o.z < haynesBoundaryZ(o.x) && o.x > -200 && o.x < 530
)
console.log(`  ${southOrphans.length} south-side orphans (dropped ${orphans.length - southOrphans.length} W/N/E)`)

if (southOrphans.length > 0) {
  // Spatial clustering: group nearby orphans (generous 120m radius)
  const CLUSTER_RADIUS = 120
  const clusters = []
  const visited = new Set()

  for (let i = 0; i < southOrphans.length; i++) {
    if (visited.has(i)) continue
    const cluster = [southOrphans[i]]
    visited.add(i)
    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < southOrphans.length; j++) {
        if (visited.has(j)) continue
        for (const c of cluster) {
          if (Math.hypot(southOrphans[j].x - c.x, southOrphans[j].z - c.z) < CLUSTER_RADIUS) {
            cluster.push(southOrphans[j])
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

  // Highway boundary clip polygon (everything north of the ramp).
  // Polyline follows the Haynes boundary, closed with far-north corners.
  const hwClipPoints = []
  for (let x = -500; x <= 800; x += 20) {
    hwClipPoints.push([x, haynesBoundaryZ(x)])
  }
  hwClipPoints.push([800, haynesBoundaryZ(800)])
  const hwClipPoly = [
    [-500, -900], [800, -900],  // far north corners
    ...hwClipPoints.reverse(),  // along highway from east to west
  ].map(([x, z]) => toInt(x, z))
  if (Clipper.Area(hwClipPoly) < 0) hwClipPoly.reverse()

  // Helper: create edge block from a rectangle, subtract streets, clip to highway, dedup, add
  function tryAddEdgeBlock(xMin, zMin, xMax, zMax) {
    if (xMax - xMin < 10 || zMax - zMin < 10) return 0
    const blockPoly = [[xMin, zMin], [xMax, zMin], [xMax, zMax], [xMin, zMax]]
    if (polygonArea(blockPoly) < MIN_BLOCK_AREA) return 0

    const blockClipper = blockPoly.map(([x, z]) => toInt(x, z))
    if (Clipper.Area(blockClipper) < 0) blockClipper.reverse()

    // Subtract streets, then clip to highway boundary
    const afterStreets = clipperDifference([blockClipper], streetUnionFlat)
    const clipped = []
    for (const poly of afterStreets) {
      const trimmed = clipperIntersection([poly], [hwClipPoly])
      clipped.push(...trimmed)
    }

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
      edgeBlockIndices.add(roundedBlocks.length - 1)
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
    const cMidX = (cMinX + cMaxX) / 2
    let zMax = southSt ? southSt.avgZ - southSt.halfROW : haynesBoundaryZ(cMidX)
    zMax = Math.min(zMax, haynesBoundaryZ(cMidX))

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
for (let i = 0; i < roundedBlocks.length; i++) {
  const lot = roundedBlocks[i]
  const isEdge = edgeBlockIndices.has(i)
  const clipperLot = lot.map(([x, z]) => toInt(x, z))
  if (Clipper.Area(clipperLot) < 0) clipperLot.reverse()

  // Skip sidewalk rings for edge blocks (diagonal artifacts from street buffers)
  let sidewalk = null
  if (!isEdge) {
    const sidewalkPoly = offsetPolygon(clipperLot, SIDEWALK_WIDTH)
    if (!sidewalkPoly || sidewalkPoly.length < 3) continue
    sidewalk = sidewalkPoly.map(fromInt)
  }

  const [cx, cz] = centroid(lot)
  const area = polygonArea(lot)

  const round2 = v => Math.round(v * 100) / 100
  blocks.push({
    id: `blk-${String(blockId++).padStart(4, '0')}`,
    lot: lot.map(([x, z]) => [round2(x), round2(z)]),
    sidewalk: sidewalk ? sidewalk.map(([x, z]) => [round2(x), round2(z)]) : null,
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
  console.log(`  ${b.id}: area=${b.area}m²  centroid=(${b.centroid[0].toFixed(0)}, ${b.centroid[1].toFixed(0)})  lot=${b.lot.length}pts  sw=${b.sidewalk ? b.sidewalk.length + 'pts' : 'none'}`)
})
console.log(`\n${alleyFillsOut.length} alley fill polygons`)
alleyFillsOut.forEach(af => {
  console.log(`  ${af.name}: ${af.polygon.length} pts`)
})

writeFileSync('src/data/block_shapes.json', JSON.stringify(output))
console.log('Written to src/data/block_shapes.json')
