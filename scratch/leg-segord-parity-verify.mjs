// leg-segord-parity-verify.mjs — A1 DIAGNOSIS (ROADMAP A1; HANDOFF-dead-end-cap-flip §OPEN).
//
// WHY: a material flip on a dead-end LEG renders Δ=0.0. Hypothesis: WRITE→READ
// key parity fails for terminal legs — the write (resolveStripHit →
// naturalSegmentOrdinal(frame.segI)) computes a DIFFERENT segOrd than the render
// reads (run.segOrd, assigned by segmentForLeg). Proven on the FROZEN artifact,
// never a live metric.
//
//   run:  node scratch/leg-segord-parity-verify.mjs [skelId]   (default south-18th-street-3)
//
// For each frozen run of the target chain: READ key = run.segOrd (render). WRITE
// key = naturalSegmentOrdinal(segI(strip-midpoint)) (the click). Parity == they match.

import fs from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'

const TARGET = process.argv[2] || 'south-18th-street-3'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape   = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const streets = ribbons.streets

// ── verbatim copies of the two shipped functions (buildBlockGeometryV2.js) ────
function naturalSegments(street, ixSet) {
  const n = (street.points || []).length
  if (n < 2) return []
  let ixs = ixSet
    ? [...ixSet].filter(i => Number.isInteger(i) && i > 0 && i < n - 1).sort((a, b) => a - b)
    : (street.intersections || []).map(r => r.ix).filter(i => Number.isInteger(i) && i > 0 && i < n - 1).sort((a, b) => a - b)
  if (!ixs.length) return [{ start: 0, end: n - 1 }]
  const segs = []; let prev = 0
  for (const ix of ixs) { if (ix > prev) segs.push({ start: prev, end: ix }); prev = ix }
  if (prev < n - 1) segs.push({ start: prev, end: n - 1 })
  return segs
}
// naturalSegmentOrdinal (MeasureOverlay.jsx:227) — what the WRITE computes.
function naturalSegmentOrdinal(street, segI, ixSet) {
  const n = (street.points || []).length
  if (n < 2) return 0
  let ixs = ixSet
    ? [...ixSet].filter(i => Number.isInteger(i) && i > 0 && i < n - 1).sort((a, b) => a - b)
    : (street.intersections || []).map(r => r.ix).filter(i => Number.isInteger(i) && i > 0 && i < n - 1).sort((a, b) => a - b)
  if (!ixs.length) return 0
  for (let k = 0; k < ixs.length; k++) if (segI < ixs[k]) return k
  return ixs.length
}

// nearest chain-points segment index to a point (frameAtPoint's segI core).
function segIAt(points, x, z) {
  let best = 0, bestD = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1]
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t))
    const px = ax + dx * t, pz = az + dz * t
    const d = (x - px) ** 2 + (z - pz) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

const st = streets.find(s => (s.skelId || s.name) === TARGET)
if (!st) { console.log('chain not found:', TARGET); process.exit(1) }
const ixSet = resolveChainSegmentation(streets).get(st)
const segs = naturalSegments(st, ixSet)

console.log(`\n=== ${TARGET} ===`)
console.log('points:', st.points.length, '| resolveChainSegmentation ixs:', [...(ixSet || [])].sort((a,b)=>a-b))
console.log('naturalSegments:', segs.map((s, k) => `#${k}[${s.start}..${s.end}]`).join('  '))

// frozen runs of this chain (READ side)
const runs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) {
  if (r.skelId === TARGET && r.poly?.length >= 2) runs.push(r)
}
console.log(`\nfrozen runs (READ = run.segOrd) vs a click's WRITE key:`)
let fails = 0
for (const r of runs) {
  const mid = r.poly[Math.floor(r.poly.length / 2)]
  const segI = segIAt(st.points, mid[0], mid[1])
  const writeSeg = naturalSegmentOrdinal(st, segI, ixSet)
  const match = writeSeg === r.segOrd
  if (!match) fails++
  console.log(`  ${r.side.padEnd(5)} READ segOrd=${r.segOrd}  |  stripMid=[${mid.map(v=>v.toFixed(1))}] → segI=${segI} → WRITE segOrd=${writeSeg}  ${match ? '✓' : '✗ MISMATCH'}`)
}
console.log(`\nVERDICT: ${fails === 0 ? 'PARITY OK — segOrd is not the bug' : `${fails}/${runs.length} runs MISMATCH — the write key never reaches the render's slot (Δ=0.0)`}\n`)
