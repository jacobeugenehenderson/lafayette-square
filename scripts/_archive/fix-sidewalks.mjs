import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

// ═══════════════════════════════════════════════════
// BOUNDARY: Haynes Highway south edge
// ═══════════════════════════════════════════════════
function zHaynes(x) {
  return x < -142.3 ? 300 : 0.3465 * x + 349.1
}

// ═══════════════════════════════════════════════════
// POLYGON CLIPPING (Sutherland-Hodgman, one edge)
// ═══════════════════════════════════════════════════
function clipPoly(poly, isInside) {
  if (poly.length < 3) return poly
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i]
    const prev = poly[(i - 1 + poly.length) % poly.length]
    const cIn = isInside(curr), pIn = isInside(prev)
    if (cIn) {
      if (!pIn) out.push(cross(prev, curr, isInside))
      out.push(curr)
    } else if (pIn) {
      out.push(cross(prev, curr, isInside))
    }
  }
  return out
}

function cross(p1, p2, isInside) {
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const pt = [p1[0] + mid * (p2[0] - p1[0]), p1[1] + mid * (p2[1] - p1[1])]
    if (isInside(pt) === isInside(p1)) lo = mid; else hi = mid
  }
  const t = (lo + hi) / 2
  return [
    Math.round((p1[0] + t * (p2[0] - p1[0])) * 10) / 10,
    Math.round((p1[1] + t * (p2[1] - p1[1])) * 10) / 10
  ]
}

function polyArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return Math.round(Math.abs(a / 2))
}

// ═══════════════════════════════════════════════════
// 1. RESTORE MISSING BLOCKS (clipped to Haynes boundary)
// ═══════════════════════════════════════════════════
console.log('=== RESTORING MISSING BLOCKS ===')
const blocksData = JSON.parse(readFileSync('src/data/blocks.json', 'utf8'))
const headBlocks = JSON.parse(execSync('git show HEAD:src/data/blocks.json').toString())
const currentIds = new Set(blocksData.blocks.map(b => b.id))

const isNorthOfHaynes = p => p[1] <= zHaynes(p[0])

// Blocks to restore: the 6 that are within the neighborhood
const restoreIds = new Set(['1132300', '1132400', '1132500', '1082005', '1125100', '1125200'])

for (const hBlock of headBlocks.blocks) {
  if (!restoreIds.has(hBlock.id) || currentIds.has(hBlock.id)) continue

  let poly = clipPoly(hBlock.points, isNorthOfHaynes)
  if (poly.length < 3) { console.log(`  Skip ${hBlock.id}: degenerate after clip`); continue }

  const area = polyArea(poly)
  if (area < 1500) { console.log(`  Skip ${hBlock.id}: area ${area} too small`); continue }

  blocksData.blocks.push({ id: hBlock.id, points: poly, area })
  console.log(`  Restored ${hBlock.id}: ${hBlock.points.length}→${poly.length} pts, area=${area}`)
}

// ═══════════════════════════════════════════════════
// 2. SIMPLIFY IRREGULAR BLOCKS (1125300, 1125600)
// ═══════════════════════════════════════════════════
console.log('\n=== SIMPLIFYING IRREGULAR BLOCKS ===')
// North edge line (Chouteau side): z = 0.162*x + 45.7
const zChou = x => Math.round((0.162 * x + 45.7) * 10) / 10

for (const block of blocksData.blocks) {
  if (block.id === '1125300') {
    // Remove irregular western zigzag (points 15-26)
    const south = block.points.slice(0, 15)       // [571,270] → [484,256]
    const nw = [484.0, zChou(484)]                  // NW corner on Chouteau line
    const northEast = block.points.slice(27)        // [504.8,127.5] → [571,270]
    block.points = [...south, nw, ...northEast]
    block.area = polyArea(block.points)
    console.log(`  Block 1125300: 42→${block.points.length} pts, area=${block.area}`)
  }

  if (block.id === '1125600') {
    // Replace 102-point highway-traced polygon with clean shape
    block.points = [
      // South edge going west (counterclockwise winding)
      [466.0, 253.4], [458.1, 252.1], [450.6, 250.8], [443.1, 249.6],
      [435.5, 248.4], [428.0, 247.2], [420.5, 246.0], [413.0, 244.7],
      [405.5, 243.5], [398.0, 242.3], [390.5, 241.1], [382.6, 239.8],
      // West edge north
      [383.0, zChou(383)],
      // North edge east (Chouteau line)
      [400.0, zChou(400)], [420.0, zChou(420)], [440.0, zChou(440)],
      [460.0, zChou(460)],
      // NE corner
      [486.8, zChou(486.8)],
      // East edge south
      [480.0, 166.8], [471.8, 217.3]
    ]
    block.area = polyArea(block.points)
    console.log(`  Block 1125600: 102→${block.points.length} pts, area=${block.area}`)
  }
}

writeFileSync('src/data/blocks.json', JSON.stringify(blocksData))
console.log(`\nWrote blocks.json: ${blocksData.blocks.length} blocks`)

// ═══════════════════════════════════════════════════
// 3. STRAIGHTEN LAFAYETTE AVENUE (east of x=350)
// ═══════════════════════════════════════════════════
console.log('\n=== STRAIGHTENING LAFAYETTE ===')
const streetsData = JSON.parse(readFileSync('src/data/streets.json', 'utf8'))
const lafSegs = streetsData.streets.filter(s => s.name === 'Lafayette Avenue')

// Fit center line using SINGLE-carriageway points (x >= 400, no lane-split ambiguity)
const singlePts = []
for (const s of lafSegs) {
  for (const p of s.points) {
    if (p[0] >= 400) singlePts.push(p)
  }
}

if (singlePts.length >= 2) {
  // Least-squares fit
  const n = singlePts.length
  const sx = singlePts.reduce((s, p) => s + p[0], 0)
  const sz = singlePts.reduce((s, p) => s + p[1], 0)
  const sxx = singlePts.reduce((s, p) => s + p[0] * p[0], 0)
  const sxz = singlePts.reduce((s, p) => s + p[0] * p[1], 0)
  const m = (n * sxz - sx * sz) / (n * sxx - sx * sx)
  const b = (sz - m * sx) / n
  const zLaf = x => m * x + b

  console.log(`  Center line: z = ${m.toFixed(4)}*x + ${b.toFixed(1)}`)

  // Detect dual-carriageway lane offset from paired points at x < 400
  const dualPts = []
  for (const s of lafSegs) {
    for (const p of s.points) {
      if (p[0] >= 350 && p[0] < 400) dualPts.push(p)
    }
  }
  dualPts.sort((a, b) => a[0] - b[0])

  let totalOffset = 0, pairCount = 0
  for (let i = 0; i < dualPts.length - 1; i++) {
    if (Math.abs(dualPts[i][0] - dualPts[i + 1][0]) < 8) {
      totalOffset += Math.abs(dualPts[i][1] - dualPts[i + 1][1]) / 2
      pairCount++
      i++ // skip next (already paired)
    }
  }
  const laneOffset = pairCount > 0 ? totalOffset / pairCount : 0
  console.log(`  Lane half-offset: ${laneOffset.toFixed(1)}m (${pairCount} pairs)`)

  // Straighten points
  let count = 0
  for (const s of lafSegs) {
    let changed = false
    for (const p of s.points) {
      if (p[0] < 350) continue
      const center = zLaf(p[0])
      let newZ

      if (p[0] < 400 && laneOffset > 1) {
        // Dual carriageway: maintain lane separation
        newZ = p[1] > center ? center + laneOffset : center - laneOffset
      } else {
        // Single carriageway: snap to center
        newZ = center
      }

      newZ = Math.round(newZ * 10) / 10
      if (Math.abs(p[1] - newZ) > 0.3) {
        p[1] = newZ
        changed = true
      }
    }
    if (changed) { console.log(`  Straightened ${s.id}`); count++ }
  }
  console.log(`  Total: ${count} segments straightened`)
}

writeFileSync('src/data/streets.json', JSON.stringify(streetsData))
console.log(`\nWrote streets.json: ${streetsData.streets.length} segments`)
console.log('\nDone!')
