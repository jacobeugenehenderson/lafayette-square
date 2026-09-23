// boulder-chatter-cause.mjs — WHY DOES THE ARMOUR FLICKER STATION TO STATION?
//
// Measured 2026-09-23: 148 HOLES — bare gaps under 25 m with armour on both sides,
// median ~0 m, i.e. ONE STATION flipping bare inside an otherwise continuous wall.
// That is what reads as "totally patchy". This asks WHY each of those stations flipped,
// because the cure depends entirely on the answer:
//   · `below-one-course` with a crest just under the threshold ⇒ FLICKER. The cure is at
//     the predicate's INPUT — a grid-scale read or hysteresis, derived from the grid step.
//   · `soft-shore` ⇒ NOT flicker. A land-use polygon edge genuinely crosses there, and
//     closing it by morphology would be overriding a real statement about the town.
//   · `no-height` ⇒ the heightfield has no data at that station; a third thing again.
// ⛔ Do not cure what you have not diagnosed. Read-only.
// ▶ node scratch/boulder-chatter-cause.mjs
import { readFileSync } from 'node:fs'
import { shoreArmourFor, MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'

const doc = JSON.parse(readFileSync('public/baked/huron/revetment.json', 'utf8'))
const osm = JSON.parse(readFileSync('cartograph/data/huron/raw/osm.json', 'utf8'))
const armourAt = shoreArmourFor(osm.ground || {})

const why = {}, margins = []
let holeStations = 0
for (const a of doc.arcs) {
  const st = a.stations
  // Runs, so a "hole" is a maximal bare run with armour on both sides.
  const segs = []; let i = 0
  while (i < st.length) {
    const v = !!st[i].armour; let j = i, len = 0
    while (j < st.length && !!st[j].armour === v) { if (j > i) len += Math.hypot(st[j].x - st[j-1].x, st[j].z - st[j-1].z); j++ }
    segs.push({ v, len, i0: i, i1: j - 1 }); i = j
  }
  for (let k = 1; k < segs.length - 1; k++) {
    const s = segs[k]
    if (s.v || s.len >= 25 || !segs[k-1].v || !segs[k+1].v) continue
    for (let n = s.i0; n <= s.i1; n++) {
      const p = st[n]
      const v = armourAt(p.x, p.z, p.crest ?? NaN)
      why[v.why] = (why[v.why] || 0) + 1
      holeStations++
      if (p.crest != null && Number.isFinite(p.crest)) margins.push(p.crest - MIN_ARMOUR_D50_M)
    }
  }
}
console.log(`148 holes · ${holeStations} flipped stations · threshold = MIN_ARMOUR_D50_M ${MIN_ARMOUR_D50_M} m\n`)
console.log('why each flipped station reads BARE:')
for (const [k, n] of Object.entries(why).sort((x, y) => y[1] - x[1])) {
  console.log(`   ${k.padEnd(20)} ${String(n).padStart(4)}  ${(100*n/holeStations).toFixed(1)}%`)
}
margins.sort((a, b) => a - b)
const p = q => margins[Math.min(margins.length - 1, Math.floor(q * margins.length))]
console.log(`\ncrest minus threshold at flipped stations (negative = below one course):`)
console.log(`   min ${p(0).toFixed(3)} · p25 ${p(0.25).toFixed(3)} · median ${p(0.5).toFixed(3)} · p75 ${p(0.75).toFixed(3)} · max ${p(1).toFixed(3)} m`)
const near = margins.filter(m => Math.abs(m) < 0.1).length
console.log(`   within ±0.10 m of the threshold: ${near} of ${margins.length} (${(100*near/margins.length).toFixed(1)}%)`)
console.log(`\n⚠️ "within a hair of the threshold" is the signature of flicker. Far below it is a genuinely low shore.`)
