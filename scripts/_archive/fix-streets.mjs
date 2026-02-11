import { readFileSync, writeFileSync } from 'fs'

const data = JSON.parse(readFileSync('src/data/streets.json', 'utf8'))
let streets = data.streets
const originalCount = streets.length

// ═══════════════════════════════════════════════════
// 1. Remove Geyer Avenue stub (st-1018, 3.7m primary stub)
// ═══════════════════════════════════════════════════
streets = streets.filter(s => s.id !== 'st-1018')
console.log(`Removed Geyer Avenue stub (${originalCount - streets.length} segment)`)

// ═══════════════════════════════════════════════════
// 2. Fix segment types
// ═══════════════════════════════════════════════════
for (const s of streets) {
  if (s.name === 'South 18th Street' && s.type !== 'residential') {
    console.log(`Fixed ${s.id} (South 18th Street): ${s.type} → residential`)
    s.type = 'residential'
  }
  if (s.id === 'st-0833' && s.name === 'Waverly Place') {
    console.log(`Fixed ${s.id} (Waverly Place): ${s.type} → residential`)
    s.type = 'residential'
  }
}

// ═══════════════════════════════════════════════════
// 3. Border street interpolators
// ═══════════════════════════════════════════════════
function collectPts(name, sortByX) {
  const pts = []
  streets.filter(s => s.name === name).forEach(s => {
    s.points.forEach(p => pts.push([...p]))
  })
  pts.sort((a, b) => sortByX ? a[0] - b[0] : a[1] - b[1])
  return pts
}

const lafPts = collectPts('Lafayette Avenue', true)
const truPts = collectPts('Truman Parkway', false)
const chouPts = collectPts('Chouteau Avenue', true)

function interpZ(pts, x) {
  if (!pts.length) return 0
  if (x <= pts[0][0]) return pts[0][1]
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i][0] && x <= pts[i + 1][0]) {
      const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0])
      return pts[i][1] + t * (pts[i + 1][1] - pts[i][1])
    }
  }
  return pts[pts.length - 1][1]
}

function interpX(pts, z) {
  if (!pts.length) return 0
  if (z <= pts[0][1]) return pts[0][0]
  if (z >= pts[pts.length - 1][1]) return pts[pts.length - 1][0]
  for (let i = 0; i < pts.length - 1; i++) {
    if (z >= pts[i][1] && z <= pts[i + 1][1]) {
      const t = (z - pts[i][1]) / (pts[i + 1][1] - pts[i][1])
      return pts[i][0] + t * (pts[i + 1][0] - pts[i][0])
    }
  }
  return pts[pts.length - 1][0]
}

// ═══════════════════════════════════════════════════
// 4. Polyline clipper (handles any point ordering)
// ═══════════════════════════════════════════════════
function clipPolyline(points, inBounds) {
  if (points.length < 2) return points
  const result = []

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    const currIn = inBounds(curr)

    if (i > 0) {
      const prev = points[i - 1]
      const prevIn = inBounds(prev)

      if (!prevIn && currIn) {
        result.push(findCrossing(prev, curr, inBounds))
      }
      if (prevIn && !currIn) {
        result.push(findCrossing(prev, curr, inBounds))
      }
    }

    if (currIn) result.push(curr)
  }

  return result
}

function findCrossing(p1, p2, inBounds) {
  let lo = 0, hi = 1
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2
    const midPt = [
      p1[0] + mid * (p2[0] - p1[0]),
      p1[1] + mid * (p2[1] - p1[1])
    ]
    if (inBounds(midPt) === inBounds(p1)) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  return [
    Math.round((p1[0] + t * (p2[0] - p1[0])) * 10) / 10,
    Math.round((p1[1] + t * (p2[1] - p1[1])) * 10) / 10
  ]
}

// ═══════════════════════════════════════════════════
// 5. Trim south exits past Lafayette (target: 50m)
// ═══════════════════════════════════════════════════
const EXT = 50

const southExits = [
  'South Jefferson Avenue', 'Mississippi Avenue', 'Missouri Avenue',
  'South 18th Street', 'Nicholson Place', 'Preston Place', 'Simpson Place'
]

for (const name of southExits) {
  for (const s of streets.filter(seg => seg.name === name)) {
    const maxZ = Math.max(...s.points.map(p => p[1]))
    // Use this segment's center x to compute local Lafayette z
    const cx = s.points.reduce((sum, p) => sum + p[0], 0) / s.points.length
    const lafZ = interpZ(lafPts, cx)
    const clipZ = lafZ + EXT

    if (maxZ > clipZ) {
      const oldLen = s.points.length
      const clipped = clipPolyline(s.points, p => p[1] <= clipZ)
      if (clipped.length >= 2) {
        s.points = clipped
        console.log(`Trimmed ${s.id} (${name}) south: ${oldLen}→${clipped.length} pts`)
      } else {
        s._remove = true
        console.log(`Removing ${s.id} (${name}) - entirely past south clip z=${clipZ.toFixed(0)}`)
      }
    }
  }
}

// ═══════════════════════════════════════════════════
// 6. Trim South 21st Street north past Chouteau
// ═══════════════════════════════════════════════════
for (const s of streets.filter(seg => seg.name === 'South 21st Street')) {
  const minZ = Math.min(...s.points.map(p => p[1]))
  const cx = s.points.reduce((sum, p) => sum + p[0], 0) / s.points.length
  const chouZ = interpZ(chouPts, cx)
  const clipZ = chouZ - EXT  // north = more negative z

  if (minZ < clipZ) {
    const oldLen = s.points.length
    const clipped = clipPolyline(s.points, p => p[1] >= clipZ)
    if (clipped.length >= 2) {
      s.points = clipped
      console.log(`Trimmed ${s.id} (South 21st Street) north: ${oldLen}→${clipped.length} pts`)
    } else {
      s._remove = true
      console.log(`Removing ${s.id} (South 21st Street) - entirely past north clip`)
    }
  }
}

// ═══════════════════════════════════════════════════
// 7. Trim east exits past Truman (EXCEPT Park Ave & Lafayette Ave)
// ═══════════════════════════════════════════════════
const eastExits = ['Chouteau Avenue', 'Carroll Street', 'Hickory Lane']

for (const name of eastExits) {
  for (const s of streets.filter(seg => seg.name === name)) {
    const maxX = Math.max(...s.points.map(p => p[0]))
    const cz = s.points.reduce((sum, p) => sum + p[1], 0) / s.points.length
    const truX = interpX(truPts, cz)
    const clipX = truX + EXT

    if (maxX > clipX) {
      const oldLen = s.points.length
      const clipped = clipPolyline(s.points, p => p[0] <= clipX)
      if (clipped.length >= 2) {
        s.points = clipped
        console.log(`Trimmed ${s.id} (${name}) east: ${oldLen}→${clipped.length} pts`)
      } else {
        s._remove = true
        console.log(`Removing ${s.id} (${name}) - entirely past east clip`)
      }
    }
  }
}

// ═══════════════════════════════════════════════════
// 8. Remove marked segments
// ═══════════════════════════════════════════════════
const before = streets.length
streets = streets.filter(s => !s._remove)
streets.forEach(s => delete s._remove)
if (before > streets.length) {
  console.log(`Removed ${before - streets.length} segments past clip boundaries`)
}

// ═══════════════════════════════════════════════════
// 9. Verify
// ═══════════════════════════════════════════════════
console.log('\n=== VERIFICATION ===')
function checkExt(name, dir) {
  const segs = streets.filter(s => s.name === name)
  if (!segs.length) return

  if (dir === 'south') {
    let maxZ = -Infinity, xAt = 0
    segs.forEach(s => s.points.forEach(p => { if (p[1] > maxZ) { maxZ = p[1]; xAt = p[0] } }))
    const lafZ = interpZ(lafPts, xAt)
    console.log(`  ${name}: ${(maxZ - lafZ).toFixed(0)}m south of Lafayette`)
  } else if (dir === 'north') {
    let minZ = Infinity, xAt = 0
    segs.forEach(s => s.points.forEach(p => { if (p[1] < minZ) { minZ = p[1]; xAt = p[0] } }))
    const chouZ = interpZ(chouPts, xAt)
    console.log(`  ${name}: ${(chouZ - minZ).toFixed(0)}m north of Chouteau`)
  } else if (dir === 'east') {
    let maxX = -Infinity, zAt = 0
    segs.forEach(s => s.points.forEach(p => { if (p[0] > maxX) { maxX = p[0]; zAt = p[1] } }))
    const truX = interpX(truPts, zAt)
    console.log(`  ${name}: ${(maxX - truX).toFixed(0)}m east of Truman`)
  }
}

console.log('South exits:')
southExits.forEach(n => checkExt(n, 'south'))
console.log('North exits:')
checkExt('South 21st Street', 'north')
console.log('East exits:')
eastExits.forEach(n => checkExt(n, 'east'))
console.log('Kept long (east):')
checkExt('Lafayette Avenue', 'east')
checkExt('Park Avenue', 'east')

// Write
data.streets = streets
writeFileSync('src/data/streets.json', JSON.stringify(data, null, 2) + '\n')
console.log(`\nDone. ${originalCount} → ${streets.length} segments`)
