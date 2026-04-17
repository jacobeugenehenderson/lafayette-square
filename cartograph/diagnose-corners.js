#!/usr/bin/env node
/**
 * Corner plug diagnostic.
 *
 * For every intersection in ribbons.json, enumerate every pair of streets at
 * that intersection and report whether the StreetRibbons corner-plug code
 * would render a plug for that pair — and if not, why.
 *
 * Failure modes mirror the guards in src/components/StreetRibbons.jsx:
 *   - NO_MATCH:        streets can't resolve each other's data (intersections[] not linked)
 *   - TERMINAL_A:      street A's ixA is at its own endpoint (can't compute plug arm)
 *   - TERMINAL_B:      street B's ixB is at its own endpoint
 *   - OUT_OF_BOUNDARY: street not in the rendered set (filtered by neighborhood boundary)
 *
 * Usage:  node diagnose-corners.js
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const RIBBONS = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'ribbons.json'), 'utf-8')
)

const streets = RIBBONS.streets
const intersections = RIBBONS.intersections

// Index streets by name for lookup
const streetsByName = new Map()
for (const st of streets) {
  if (!streetsByName.has(st.name)) streetsByName.set(st.name, [])
  streetsByName.get(st.name).push(st)
}

let totalPairs = 0
let plugs4 = 0   // X-intersection pair: 4 plug quadrants (non-terminal × non-terminal)
let plugs2 = 0   // T-intersection pair: 2 plug quadrants (one terminal, one through)
const reasons = { NO_MATCH: 0, SAME_STREET: 0, BOTH_TERMINAL: 0 }
const missByStreetPair = new Map()

for (const ix of intersections) {
  if (ix.streets.length < 2) continue

  for (let ai = 0; ai < ix.streets.length; ai++) {
    for (let bi = ai + 1; bi < ix.streets.length; bi++) {
      totalPairs++
      const stA_ref = ix.streets[ai]
      const stB_ref = ix.streets[bi]

      if (stA_ref.name === stB_ref.name) {
        reasons.SAME_STREET++
        continue
      }

      const stA_data = streets.find(s =>
        s.name === stA_ref.name && s.intersections.some(i =>
          i.ix === stA_ref.ix && i.withStreets.includes(stB_ref.name)))
      const stB_data = streets.find(s =>
        s.name === stB_ref.name && s.intersections.some(i =>
          i.ix === stB_ref.ix && i.withStreets.includes(stA_ref.name)))

      if (!stA_data || !stB_data) {
        reasons.NO_MATCH++
        const key = `${stA_ref.name} × ${stB_ref.name}`
        missByStreetPair.set(key, (missByStreetPair.get(key) || 0) + 1)
        continue
      }

      const ixA = stA_ref.ix
      const ixB = stB_ref.ix
      const termAstart = ixA === 0
      const termAend = ixA === stA_data.points.length - 1
      const termBstart = ixB === 0
      const termBend = ixB === stB_data.points.length - 1
      const termA = termAstart || termAend
      const termB = termBstart || termBend

      if ((termAstart && termAend) || (termBstart && termBend)) {
        reasons.BOTH_TERMINAL++
        const key = `${stA_ref.name} × ${stB_ref.name}`
        missByStreetPair.set(key, (missByStreetPair.get(key) || 0) + 1)
      } else if (termA || termB) {
        plugs2++  // T-intersection — 2 plug quadrants
      } else {
        plugs4++  // X-intersection — 4 plug quadrants
      }
    }
  }
}

console.log(`\n========== Corner plug diagnostic ==========`)
console.log(`Intersections: ${intersections.length}`)
console.log(`Total street pairs at intersections: ${totalPairs}`)
console.log(`X-intersection pairs (4 plugs each): ${plugs4}  →  ${plugs4 * 4} plug quadrants`)
console.log(`T-intersection pairs (2 plugs each): ${plugs2}  →  ${plugs2 * 2} plug quadrants`)
console.log(`Total expected plug quadrants: ${plugs4 * 4 + plugs2 * 2}`)
console.log(`\nSkipped pairs:`)
console.log(`  SAME_STREET (pair is same-named segments): ${reasons.SAME_STREET}`)
console.log(`  NO_MATCH (intersections[] not linked):     ${reasons.NO_MATCH}`)
console.log(`  BOTH_TERMINAL (degenerate):                ${reasons.BOTH_TERMINAL}`)
console.log(`\nTop 10 NO_MATCH pairs (these need Survey-mode cleanup):`)
const sorted = [...missByStreetPair.entries()].sort((a, b) => b[1] - a[1])
for (const [pair, count] of sorted.slice(0, 10)) {
  console.log(`  ${count}× ${pair}`)
}
