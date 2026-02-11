#!/usr/bin/env node
/**
 * Compute city block polygons from the street network.
 *
 * 1. Find intersections: both line-segment crossings AND shared endpoints
 * 2. Build planar graph
 * 3. Trace minimal faces (blocks)
 * 4. Filter to reasonable sizes
 * 5. Output to src/data/blocks.json
 */

const fs = require('fs')
const path = require('path')
const streetsData = require('../src/data/streets.json')

const named = streetsData.streets.filter(s => s.name && s.name.length > 0 && s.type !== 'service')
console.log('Named street segments:', named.length)

// ── Step 1: Find intersection points ──

function lineSegIntersect(a1, a2, b1, b2) {
  const d1x = a2[0] - a1[0], d1z = a2[1] - a1[1]
  const d2x = b2[0] - b1[0], d2z = b2[1] - b1[1]
  const det = d1x * d2z - d1z * d2x
  if (Math.abs(det) < 0.001) return null
  const t = ((b1[0] - a1[0]) * d2z - (b1[1] - a1[1]) * d2x) / det
  const u = ((b1[0] - a1[0]) * d1z - (b1[1] - a1[1]) * d1x) / det
  if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null
  return [a1[0] + t * d1x, a1[1] + t * d1z]
}

// Collect candidate intersection points from two sources:
// A) Line-segment crossings between different-named streets
// B) Shared endpoints — where endpoints of different-named streets are within 10m
const candidatePts = []

// Source A: Line crossings
for (let i = 0; i < named.length; i++) {
  for (let j = i + 1; j < named.length; j++) {
    if (named[i].name === named[j].name) continue
    const a = named[i], b = named[j]
    for (let ai = 0; ai < a.points.length - 1; ai++) {
      for (let bi = 0; bi < b.points.length - 1; bi++) {
        const pt = lineSegIntersect(a.points[ai], a.points[ai + 1], b.points[bi], b.points[bi + 1])
        if (pt) candidatePts.push(pt)
      }
    }
  }
}
console.log('  Line crossings:', candidatePts.length)

// Source B: Shared endpoints between different-named streets
const endpoints = []
named.forEach(seg => {
  endpoints.push({ pt: seg.points[0], name: seg.name })
  endpoints.push({ pt: seg.points[seg.points.length - 1], name: seg.name })
})

for (let i = 0; i < endpoints.length; i++) {
  for (let j = i + 1; j < endpoints.length; j++) {
    if (endpoints[i].name === endpoints[j].name) continue
    const dx = endpoints[i].pt[0] - endpoints[j].pt[0]
    const dz = endpoints[i].pt[1] - endpoints[j].pt[1]
    if (dx * dx + dz * dz < 100) { // within 10m
      candidatePts.push([
        (endpoints[i].pt[0] + endpoints[j].pt[0]) / 2,
        (endpoints[i].pt[1] + endpoints[j].pt[1]) / 2,
      ])
    }
  }
}
console.log('  Total candidates:', candidatePts.length)

// Merge nearby points (within 10m) into nodes
const nodes = []
const usedPt = new Set()
for (let i = 0; i < candidatePts.length; i++) {
  if (usedPt.has(i)) continue
  let sx = candidatePts[i][0], sz = candidatePts[i][1], count = 1
  for (let j = i + 1; j < candidatePts.length; j++) {
    if (usedPt.has(j)) continue
    const dx = candidatePts[j][0] - candidatePts[i][0]
    const dz = candidatePts[j][1] - candidatePts[i][1]
    if (dx * dx + dz * dz < 144) { // within 12m
      sx += candidatePts[j][0]
      sz += candidatePts[j][1]
      count++
      usedPt.add(j)
    }
  }
  usedPt.add(i)
  nodes.push({ id: nodes.length, x: sx / count, z: sz / count, edges: [] })
}
console.log('  Merged nodes:', nodes.length)

// ── Step 2: Build graph ──

// For each named street, find which nodes lie on/near it and connect consecutive ones
const streetChains = {}
named.forEach(seg => {
  if (!(seg.name in streetChains)) streetChains[seg.name] = []
  streetChains[seg.name].push(seg)
})

for (const [streetName, segs] of Object.entries(streetChains)) {
  // Compute a single consistent direction for this street from all its points
  const allPts = []
  for (const seg of segs) allPts.push(...seg.points)
  // Use PCA-like approach: find the axis of maximum spread
  const cx = allPts.reduce((s, p) => s + p[0], 0) / allPts.length
  const cz = allPts.reduce((s, p) => s + p[1], 0) / allPts.length
  let sxx = 0, sxz = 0, szz = 0
  for (const p of allPts) {
    const dx = p[0] - cx, dz = p[1] - cz
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz
  }
  // Principal axis via eigenvalue of 2x2 covariance
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz)
  const mainUx = Math.cos(ang), mainUz = Math.sin(ang)

  const nodesOnStreet = new Map() // nodeId -> projDist

  for (const seg of segs) {
    const pts = seg.points
    for (const node of nodes) {
      if (nodesOnStreet.has(node.id)) continue
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.1) continue
        const ux = dx / len, uz = dz / len
        const ox = node.x - pts[i][0], oz = node.z - pts[i][1]
        const along = ox * ux + oz * uz
        const perp = Math.abs(-ox * uz + oz * ux)
        if (perp < 12 && along >= -8 && along <= len + 8) {
          // Project onto consistent street axis for ordering
          const projDist = node.x * mainUx + node.z * mainUz
          nodesOnStreet.set(node.id, projDist)
          break
        }
      }
    }
  }

  // Sort nodes by projected distance along the consistent axis
  const sorted = [...nodesOnStreet.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => nodes[id])

  // Connect consecutive nodes if within 250m
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    const dx = b.x - a.x, dz = b.z - a.z
    if (dx * dx + dz * dz < 250 * 250) {
      if (!a.edges.includes(b.id)) a.edges.push(b.id)
      if (!b.edges.includes(a.id)) b.edges.push(a.id)
    }
  }
}

let edgeCount = 0
nodes.forEach(n => { edgeCount += n.edges.length })
console.log('  Edges:', edgeCount / 2)
console.log('  Nodes with degree >= 2:', nodes.filter(n => n.edges.length >= 2).length)

// ── Step 3: Trace faces ──

// Sort edges at each node by angle (counterclockwise)
nodes.forEach(node => {
  node.edges = [...new Set(node.edges)]
  node.edges.sort((a, b) => {
    const angA = Math.atan2(nodes[a].z - node.z, nodes[a].x - node.x)
    const angB = Math.atan2(nodes[b].z - node.z, nodes[b].x - node.x)
    return angA - angB
  })
})

// Half-edge "next" map: for directed edge u->v, the next edge is at node v,
// immediately clockwise from the reverse edge v->u
const heNext = {}
nodes.forEach(node => {
  for (const dest of node.edges) {
    const destNode = nodes[dest]
    const backIdx = destNode.edges.indexOf(node.id)
    if (backIdx === -1) continue
    const prevIdx = (backIdx - 1 + destNode.edges.length) % destNode.edges.length
    heNext[node.id + '>' + dest] = dest + '>' + destNode.edges[prevIdx]
  }
})

// Trace faces
const usedHE = new Set()
const faces = []

nodes.forEach(startNode => {
  for (const firstDest of startNode.edges) {
    const startKey = startNode.id + '>' + firstDest
    if (usedHE.has(startKey)) continue

    const face = []
    let key = startKey
    let steps = 0

    while (steps < 60) {
      if (usedHE.has(key)) {
        if (key === startKey && steps >= 3) faces.push(face)
        break
      }
      usedHE.add(key)
      const fromId = parseInt(key.split('>')[0])
      face.push([nodes[fromId].x, nodes[fromId].z])
      const nextKey = heNext[key]
      if (!nextKey) break
      key = nextKey
      steps++
    }
  }
})

console.log('  Raw faces:', faces.length)

// ── Step 4: Filter ──

function polygonArea(pts) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return area / 2
}

const blocks = faces.filter(face => {
  if (face.length < 3) return false
  const absArea = Math.abs(polygonArea(face))
  return absArea > 500 && absArea < 80000
})

// Ensure consistent winding (clockwise in screen coords = negative signed area)
blocks.forEach(block => {
  if (polygonArea(block) > 0) block.reverse()
})

console.log('  Blocks after filtering:', blocks.length)

// ── Step 5: Output ──

const output = {
  meta: { source: 'computed from streets.json', count: blocks.length },
  blocks: blocks.map((pts, i) => ({
    id: 'block-' + String(i).padStart(3, '0'),
    points: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]),
  })),
}

const outPath = path.join(__dirname, '..', 'src', 'data', 'blocks.json')
fs.writeFileSync(outPath, JSON.stringify(output, null, 2))
console.log('\nWrote', blocks.length, 'blocks to', outPath)

blocks.forEach((b, i) => {
  const area = Math.abs(polygonArea(b))
  const xs = b.map(p => p[0]), zs = b.map(p => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  console.log('  block-' + String(i).padStart(3, '0'),
    'verts:', b.length,
    'area:', Math.round(area) + 'm²',
    'center:', Math.round(cx) + ',' + Math.round(cz))
})
