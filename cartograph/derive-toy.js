/**
 * derive-toy.js — toy fixture pipeline (cleanroom test bed for cartograph).
 *
 * Reads `src/data/toy/toy-input.json` (hand-authored multi-vertex chains
 * with measures, couplers, capEnds — the operator-intent shape that real
 * Survey + Measure produce). Runs the same intersection-detection +
 * IX-vertex-splicing logic as `derive.js`, just on a tighter input
 * surface. Emits `src/data/toy/toy-ribbons.json` in the shape that
 * Designer's StreetRibbons + the bake's buildRibbonGeometry expect.
 *
 * Why a separate script: derive.js's main flow expects the full LS data
 * surface (skeleton + raw OSM + parcels + lamps + elevation + ...). For
 * cleanroom toy testing we only want the chain → ribbons projection,
 * with deterministic, hand-authored cases.
 *
 * Usage: `node cartograph/derive-toy.js`
 *
 * Author cases in toy-input.json. Each case is a set of chains placed
 * at a grid cell (suggested 200m spacing). Intersections at shared
 * vertices, segment crossings, or endpoint-on-interior are auto-
 * detected and spliced — same convention as real derive.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const INPUT_PATH  = join(__dirname, '..', 'src', 'data', 'toy', 'toy-input.json')
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', 'toy', 'toy-ribbons.json')

// Match derive.js's IX-vertex snap: if an existing chain vertex is within
// 0.2m of the IX point, snap that vertex; otherwise splice a new vertex.
const IX_VERTEX_SNAP = 0.2

function dist2(a, b) { const dx = a[0] - b[0], dz = a[1] - b[1]; return dx*dx + dz*dz }
function dist(a, b)  { return Math.sqrt(dist2(a, b)) }

// Standard 2D segment intersection. Returns [x, z] of intersection or null.
// Excludes endpoint-only contact (those are handled by the endpoint-shared
// detection pass below).
function segCross(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1]
  const x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1]
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-9) return null
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
  // Strict interior: exclude shared endpoints (handled separately).
  const EPS = 1e-6
  if (t < EPS || t > 1 - EPS || u < EPS || u > 1 - EPS) return null
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

// Splice or snap a vertex into a chain at a target world point. Returns
// the index in chain.points where the vertex now sits.
function spliceOrSnapVertex(chain, target) {
  const pts = chain.points
  // First check if any existing vertex is within IX_VERTEX_SNAP.
  for (let i = 0; i < pts.length; i++) {
    if (dist(pts[i], target) < IX_VERTEX_SNAP) {
      pts[i] = [target[0], target[1]]
      return i
    }
  }
  // Otherwise find best segment by perpendicular projection.
  let best = { idx: -1, t: 0, dist: Infinity }
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i+1][0], bz = pts[i+1][1]
    const dx = bx - ax, dz = bz - az
    const len2 = dx*dx + dz*dz
    if (len2 < 1e-9) continue
    let t = ((target[0]-ax)*dx + (target[1]-az)*dz) / len2
    t = Math.max(0, Math.min(1, t))
    const px = ax + t*dx, pz = az + t*dz
    const d = Math.hypot(px - target[0], pz - target[1])
    if (d < best.dist) best = { idx: i, t, dist: d }
  }
  if (best.idx < 0 || best.dist > 1.0) return -1   // outside threshold
  const newIdx = best.idx + 1
  pts.splice(newIdx, 0, [target[0], target[1]])
  // Shift any per-chain.intersections records past newIdx.
  if (chain.intersections) {
    for (const rec of chain.intersections) {
      if (rec.ix >= newIdx) rec.ix += 1
    }
  }
  return newIdx
}

// Detect all IX points across the chain set:
//   1. Endpoint-shared: two chains' endpoints land at the same point (within snap).
//   2. Endpoint-on-interior: one chain's endpoint lies on another chain's segment interior.
//   3. Segment crossings: two chains' segments cross.
function detectIntersections(streets) {
  // Cluster all candidate IX points (one entry per unique world location).
  const ixClusters = []   // [{point, chainSet:Set<idx>}]
  const SNAP = 0.5

  function findCluster(pt) {
    for (const c of ixClusters) {
      if (dist(c.point, pt) < SNAP) return c
    }
    return null
  }
  function addToCluster(pt, streetIdx) {
    let c = findCluster(pt)
    if (!c) { c = { point: [pt[0], pt[1]], chainSet: new Set() }; ixClusters.push(c) }
    c.chainSet.add(streetIdx)
  }

  // Pass 1: vertex-shared — every chain VERTEX is a candidate (interior
  // or endpoint). Cleanroom toy authors place shared vertices deliberately
  // at intersection points; clustering finds them.
  for (let i = 0; i < streets.length; i++) {
    const pts = streets[i].points
    for (const p of pts) addToCluster(p, i)
  }

  // Pass 2: endpoint-on-interior — each chain endpoint vs every other chain's segments.
  for (let i = 0; i < streets.length; i++) {
    const a = streets[i].points
    for (const ep of [a[0], a[a.length - 1]]) {
      for (let j = 0; j < streets.length; j++) {
        if (j === i) continue
        const b = streets[j].points
        for (let pi = 0; pi < b.length - 1; pi++) {
          const ax = b[pi][0], az = b[pi][1], bx = b[pi+1][0], bz = b[pi+1][1]
          const dx = bx - ax, dz = bz - az
          const len2 = dx*dx + dz*dz
          if (len2 < 1e-9) continue
          let t = ((ep[0]-ax)*dx + (ep[1]-az)*dz) / len2
          if (t <= 0 || t >= 1) continue   // endpoint, not interior
          const px = ax + t*dx, pz = az + t*dz
          if (Math.hypot(px - ep[0], pz - ep[1]) < SNAP) {
            addToCluster([px, pz], i)
            addToCluster([px, pz], j)
          }
        }
      }
    }
  }

  // Pass 3: segment crossings.
  for (let i = 0; i < streets.length; i++) {
    const a = streets[i].points
    for (let j = i + 1; j < streets.length; j++) {
      const b = streets[j].points
      for (let pi = 0; pi < a.length - 1; pi++) {
        for (let qi = 0; qi < b.length - 1; qi++) {
          const x = segCross(a[pi], a[pi+1], b[qi], b[qi+1])
          if (x) { addToCluster(x, i); addToCluster(x, j) }
        }
      }
    }
  }

  // Filter to clusters with ≥2 distinct chains.
  return ixClusters.filter(c => c.chainSet.size >= 2)
}

function main() {
  const input = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'))

  // Normalize input streets to ribbon shape. Each input street: id, name,
  // highway?, points (array of [x, z]), measure, optional capEnds, couplers,
  // segmentMeasures, anchor, innerSign, smooth.
  const streets = input.streets.map((s, i) => {
    const street = {
      skelId: s.id || `toy-chain-${i}`,
      name: s.name || s.id || `toy-chain-${i}`,
      points: s.points.map(p => [p[0], p[1]]),
      measure: s.measure,
      intersections: [],
    }
    if (s.highway) street.highway = s.highway
    if (s.capEnds) street.capEnds = s.capEnds
    if (s.couplers) street.couplers = s.couplers
    if (s.segmentMeasures) street.segmentMeasures = s.segmentMeasures
    if (s.anchor) street.anchor = s.anchor
    if (s.innerSign != null) street.innerSign = s.innerSign
    if (s.smooth != null) street.smooth = s.smooth
    if (s.disabled) street.disabled = true
    return street
  })

  // Detect IX clusters.
  const clusters = detectIntersections(streets)
  console.log(`detected ${clusters.length} IX clusters (≥2 distinct chains)`)

  // For each cluster, splice/snap an IX vertex into each participating chain.
  // Operator-authored per-intersection overrides (cornerRadius, disabled,
  // etc.) come from input.intersections, keyed by an `at` point.
  const overrideAt = (pt) => {
    if (!input.intersections) return null
    for (const ovr of input.intersections) {
      if (ovr.at && Math.hypot(ovr.at[0] - pt[0], ovr.at[1] - pt[1]) < 1.0) return ovr
    }
    return null
  }
  const intersections = []
  for (const cluster of clusters) {
    const ixData = { point: cluster.point, streets: [] }
    const ovr = overrideAt(cluster.point)
    if (ovr) {
      if (Number.isFinite(ovr.cornerRadius)) ixData.cornerRadius = ovr.cornerRadius
      if (ovr.disabled) ixData.disabled = true
    }
    for (const streetIdx of cluster.chainSet) {
      const chain = streets[streetIdx]
      const idx = spliceOrSnapVertex(chain, cluster.point)
      if (idx < 0) { continue }
      chain.intersections.push({ ix: idx, withStreets: [...cluster.chainSet].filter(j => j !== streetIdx).map(j => streets[j].name) })
      ixData.streets.push({ name: chain.name, ix: idx })
    }
    if (ixData.streets.length >= 2) intersections.push(ixData)
  }

  // De-dup withStreets in chain.intersections + flatten to ribbons.json shape.
  for (const st of streets) {
    for (const rec of st.intersections) {
      rec.withStreets = [...new Set(rec.withStreets)]
    }
  }

  const output = {
    meta: input.meta || { source: 'toy', description: 'Toy fixture (auto-derived)' },
    streets: streets.map(st => {
      const out = {
        name: st.name,
        skelId: st.skelId,
        points: st.points,
        measure: st.measure,
        intersections: st.intersections,
      }
      if (st.highway) out.highway = st.highway
      if (st.capEnds) out.capEnds = st.capEnds
      if (st.couplers) out.couplers = st.couplers
      if (st.segmentMeasures) out.segmentMeasures = st.segmentMeasures
      if (st.anchor) out.anchor = st.anchor
      if (st.innerSign != null) out.innerSign = st.innerSign
      if (st.smooth != null) out.smooth = st.smooth
      if (st.disabled) out.disabled = true
      return out
    }),
    intersections,
    faces: input.faces || [],
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2))
  console.log(`wrote ${OUTPUT_PATH}`)
  console.log(`  ${output.streets.length} streets, ${output.intersections.length} intersections, ${output.faces.length} faces`)
}

main()
