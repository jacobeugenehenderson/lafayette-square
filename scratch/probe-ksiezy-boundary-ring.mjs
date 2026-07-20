/**
 * READ-ONLY PROBE — does Księży Młyn's boundary ring close on the CURRENT skeleton?
 *
 * Replicates serve.js `computeBoundaryFromSelection` (:337-421) corner logic verbatim
 * — shared degree>=3 junction within CORNER_EPS, nearest-to-origin on double crossings
 * — against the four boundary streets Jacob named, WITHOUT mounting anything or
 * touching a subsystem file. Answers one question before any re-fetch is run:
 * which corners resolve today, and is the NE corner the only casualty of the bbox?
 *
 * Reads only. Writes nothing. Verge, 2026-07-20.
 */
import { readFileSync } from 'fs'

const CORNER_EPS = 12   // serve.js:246

const SIDES = [
  ['Aleja Marszałka Józefa Piłsudskiego',   'north'],
  ['Aleja Marszałka Edwarda Śmigłego-Rydza', 'east'],
  ['Milionowa',                              'south'],
  ['Jana Kilińskiego',                       'west'],
]

const sk = JSON.parse(readFileSync('cartograph/data/ksi-y-m-yn/clean/skeleton.json', 'utf8'))
const geo = JSON.parse(readFileSync('cartograph/data/ksi-y-m-yn/geography.json', 'utf8'))

// serve.js:distPointToChains — verbatim
function distPointToChains(j, chains) {
  let best = Infinity
  for (const s of chains) {
    const pts = s.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const dx = b.x - a.x, dz = b.z - a.z
      const len2 = dx * dx + dz * dz || 1
      let t = ((j.x - a.x) * dx + (j.z - a.z) * dz) / len2
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(j.x - (a.x + t * dx), j.z - (a.z + t * dz))
      if (d < best) best = d
    }
  }
  return best
}

const chainsOf = (nm) => sk.streets.filter(s => (s.name === nm || s.corridor === nm) && s.points && s.points.length >= 2)
const junctions = sk.junctions.filter(j => j.degree >= 3)

const info = SIDES.map(([nm, dir]) => {
  const chains = chainsOf(nm)
  const touched = new Set()
  for (let ji = 0; ji < junctions.length; ji++) if (distPointToChains(junctions[ji], chains) < CORNER_EPS) touched.add(ji)
  // extent of this street in the local frame, to reason about what the bbox clipped
  let maxZ = -Infinity, minZ = Infinity, maxX = -Infinity, minX = Infinity
  for (const c of chains) for (const p of c.points) {
    maxZ = Math.max(maxZ, p.z); minZ = Math.min(minZ, p.z)
    maxX = Math.max(maxX, p.x); minX = Math.min(minX, p.x)
  }
  return { name: nm, dir, chains: chains.length, touched, minX, maxX, minZ, maxZ }
})
const byName = new Map(info.map(s => [s.name, s]))

const cornerBetween = (a, b) => {
  const A = byName.get(a), B = byName.get(b)
  let best = null
  for (const ji of A.touched) {
    if (!B.touched.has(ji)) continue
    const j = junctions[ji], d2 = j.x * j.x + j.z * j.z
    if (!best || d2 < best.d2) best = { d2, pt: { x: j.x, z: j.z } }
  }
  return best ? best.pt : null
}

console.log('=== Księży Młyn — boundary ring probe (read-only) ===')
console.log(`skeleton: ${sk.streets.length} streets, ${junctions.length} junctions of degree>=3`)
console.log(`fetch bbox: lat ${geo.bbox.minLat}–${geo.bbox.maxLat}  lon ${geo.bbox.minLon}–${geo.bbox.maxLon}\n`)

console.log('-- the four selected streets --')
for (const s of info) {
  console.log(`  ${s.dir.padEnd(6)} ${s.name.padEnd(42)} ${String(s.chains).padStart(2)} chains, touches ${String(s.touched.size).padStart(2)} junctions`)
}

// adjacency + gaps, exactly as the resolver computes them
const names = SIDES.map(s => s[0])
const adj = new Map(names.map(n => [n, []]))
console.log('\n-- corners (each adjacent pair must share a junction) --')
const ringPairs = [[0, 1, 'NE'], [1, 2, 'SE'], [2, 3, 'SW'], [3, 0, 'NW']]
for (const [i, k, label] of ringPairs) {
  const c = cornerBetween(names[i], names[k])
  if (c) { adj.get(names[i]).push(names[k]); adj.get(names[k]).push(names[i]) }
  const short = (n) => n.replace('Aleja Marszałka ', '').replace('Edwarda ', '').replace('Józefa ', '').replace('Jana ', '')
  console.log(`  ${label}  ${short(names[i])} × ${short(names[k])}`.padEnd(58) +
    (c ? `CLOSES at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})  r=${Math.hypot(c.x, c.z).toFixed(0)}m` : '*** NO SHARED JUNCTION — GAP ***'))
}

const gaps = names.filter(n => adj.get(n).length !== 2)
const closed = gaps.length === 0
console.log(`\n-- verdict --`)
console.log(`  closed: ${closed}`)
if (gaps.length) {
  console.log(`  gaps (${gaps.length}) — the resolver would surface these to the operator:`)
  for (const g of gaps) {
    const d = adj.get(g).length
    console.log(`    ${g}  — ${d} boundary neighbour${d === 1 ? '' : 's'} (${d < 2 ? 'dangling' : 'interior street?'})`)
  }
}

// how close did the fetch come to the missing corner?
const north = byName.get('Aleja Marszałka Józefa Piłsudskiego')
const east = byName.get('Aleja Marszałka Edwarda Śmigłego-Rydza')
console.log(`\n-- why (local frame, +x=E +z=S, north=-z) --`)
console.log(`  Piłsudskiego  (north edge) northernmost z = ${north.minZ.toFixed(1)}, easternmost x = ${north.maxX.toFixed(1)}`)
console.log(`  Śmigłego-Rydza (east edge)  northernmost z = ${east.minZ.toFixed(1)}, easternmost x = ${east.maxX.toFixed(1)}`)
const dz = Math.abs(north.minZ - east.minZ)
console.log(`  the two north ends differ by ${dz.toFixed(0)}m in z — if they never meet, the crossing sat outside the fetch`)
console.log(`  bbox maxLat ${geo.bbox.maxLat} vs NE corner ~51.7614 → ${((51.7614 - geo.bbox.maxLat) * 111000).toFixed(0)}m unfetched`)
