// D6a.0 — weld ONE corridor's carriageways to their spine continuation and
// PRINT the result. Gate: the polyline is continuous through the transition
// node (no stub tip), and the spine extends roughly straight beyond the node.
// V1 corridor = Lafayette×Mississippi, pair 1349812898-1488940913.
import fs from 'fs'

const r = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const byId = new Map(r.streets.map(s => [s.skelId, s]))

const EQ = 1e-6
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3

// Weld a carriageway to its spine continuation at whichever end is linked.
// Returns the continuous outer-following polyline (carriageway oriented as
// authored; spine spliced on, oriented so the shared node coincides).
function weld(carId) {
  const car = byId.get(carId)
  const pts = car.points.map(p => [p[0], p[1]])
  const ph = car.phase
  const joins = []   // record each weld for reporting

  // spineAtStart: spine continues BEFORE the carriageway's first point.
  if (ph.spineAtStart) {
    const sp = byId.get(ph.spineAtStart)
    const node = pts[0]
    let spPts = sp.points.map(p => [p[0], p[1]])
    // orient spine so it ENDS at the node, then prepend (drop the dup node)
    if (same(spPts[spPts.length - 1], node)) { /* ends at node, good */ }
    else if (same(spPts[0], node)) spPts.reverse()
    else throw new Error(`spineAtStart ${ph.spineAtStart} touches neither end of ${carId} @ ${node}`)
    joins.push({ end: 'start', node, prev: spPts[spPts.length - 2], next: pts[1] })
    pts.unshift(...spPts.slice(0, -1))
  }
  // spineAtEnd: spine continues AFTER the carriageway's last point.
  if (ph.spineAtEnd) {
    const sp = byId.get(ph.spineAtEnd)
    const node = pts[pts.length - 1]
    let spPts = sp.points.map(p => [p[0], p[1]])
    // orient spine so it STARTS at the node, then append (drop the dup node)
    if (same(spPts[0], node)) { /* starts at node, good */ }
    else if (same(spPts[spPts.length - 1], node)) spPts.reverse()
    else throw new Error(`spineAtEnd ${ph.spineAtEnd} touches neither end of ${carId} @ ${node}`)
    joins.push({ end: 'end', node, prev: pts[pts.length - 2], next: spPts[1] })
    pts.push(...spPts.slice(1))
  }
  return { car, pts, joins }
}

function jointAngle(prev, node, next) {
  const a = Math.atan2(node[1] - prev[1], node[0] - prev[0])
  const b = Math.atan2(next[1] - node[1], next[0] - node[0])
  let d = (b - a) * 180 / Math.PI
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d  // 0 = perfectly straight through the node
}

function report(carId) {
  const { car, pts, joins } = weld(carId)
  console.log(`\n=== ${carId} (${car.phase.role}, innerSign ${car.innerSign}) ===`)
  console.log(`  raw points: ${car.points.length}  →  welded points: ${pts.length}`)
  console.log(`  welded polyline:`)
  for (const p of pts) console.log(`    [${p[0].toFixed(2)}, ${p[1].toFixed(2)}]`)
  // continuity: no consecutive duplicates
  let dups = 0
  for (let i = 1; i < pts.length; i++) if (same(pts[i], pts[i - 1])) dups++
  console.log(`  consecutive-duplicate vertices: ${dups} (want 0)`)
  for (const j of joins) {
    const ang = jointAngle(j.prev, j.node, j.next)
    console.log(`  JOIN @ ${j.end} node [${j.node[0].toFixed(2)}, ${j.node[1].toFixed(2)}]: ` +
      `bend ${ang.toFixed(1)}°  (≈0 = spine runs straight through, no stub tip)`)
  }
}

console.log('D6a.0 — Lafayette×Mississippi corridor weld (pair 1349812898-1488940913)')
console.log('transition node at the Mississippi crossing: [166.50, 221.90]')
report('lafayette-avenue-5')   // carriageway-A, spineAtStart
report('lafayette-avenue-6')   // carriageway-B, spineAtEnd
