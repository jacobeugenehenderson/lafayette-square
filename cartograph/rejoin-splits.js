#!/usr/bin/env node
// Remediation: rejoin centerlines that were destructively split via the old
// splitAtNode action. Two adjacent same-name centerlines whose endpoints
// coincide (within 0.5m) get merged back into a single polyline. Anything
// non-adjacent is left alone (legitimate disconnected same-name streets).
//
// Usage: node rejoin-splits.js [--dry-run]
// Backs up the existing centerlines.json before writing.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FILE = path.join(__dirname, 'data/raw/centerlines.json')
const EPS = 0.5
const dryRun = process.argv.includes('--dry-run')

const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
const streets = data.streets

function near(a, b) {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS
}

// Group by name. Within each name, find pairs whose endpoints touch.
const byName = new Map()
for (let i = 0; i < streets.length; i++) {
  const s = streets[i]
  if (!s.name) continue
  if (!byName.has(s.name)) byName.set(s.name, [])
  byName.get(s.name).push({ idx: i, st: s })
}

const removed = new Set()
let mergedCount = 0
let pairsConsidered = 0

// Iterate by name. For each pair of unmerged segments, check endpoint match
// and merge if found. A street might have been split N times so loop until
// no more merges possible per name.
for (const [name, group] of byName) {
  if (group.length < 2) continue
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < group.length; i++) {
      const A = group[i]
      if (removed.has(A.idx)) continue
      const aPts = A.st.points
      for (let j = 0; j < group.length; j++) {
        if (i === j) continue
        const B = group[j]
        if (removed.has(B.idx)) continue
        const bPts = B.st.points
        pairsConsidered++

        // A.end ↔ B.start: append B to A
        if (near(aPts[aPts.length - 1], bPts[0])) {
          A.st.points = aPts.concat(bPts.slice(1))
          if (A.st._original) A.st._original = A.st._original.concat(bPts.slice(1).map(p => [p[0], p[1]]))
          removed.add(B.idx)
          mergedCount++
          changed = true
          break
        }
        // A.end ↔ B.end (B reversed): append reversed B to A
        if (near(aPts[aPts.length - 1], bPts[bPts.length - 1])) {
          const reversed = bPts.slice().reverse()
          A.st.points = aPts.concat(reversed.slice(1))
          if (A.st._original) A.st._original = A.st._original.concat(reversed.slice(1).map(p => [p[0], p[1]]))
          removed.add(B.idx)
          mergedCount++
          changed = true
          break
        }
        // A.start ↔ B.end: prepend B to A
        if (near(aPts[0], bPts[bPts.length - 1])) {
          A.st.points = bPts.concat(aPts.slice(1))
          if (A.st._original) A.st._original = bPts.map(p => [p[0], p[1]]).concat(A.st._original.slice(1))
          removed.add(B.idx)
          mergedCount++
          changed = true
          break
        }
        // A.start ↔ B.start (A reversed): prepend reversed B to A
        if (near(aPts[0], bPts[0])) {
          const reversed = bPts.slice().reverse()
          A.st.points = reversed.concat(aPts.slice(1))
          if (A.st._original) A.st._original = reversed.map(p => [p[0], p[1]]).concat(A.st._original.slice(1))
          removed.add(B.idx)
          mergedCount++
          changed = true
          break
        }
      }
      if (changed) break
    }
  }
}

const kept = streets.filter((_, i) => !removed.has(i))
console.log(`Streets: ${streets.length} → ${kept.length} (merged ${mergedCount} pairs across ${pairsConsidered} comparisons)`)

if (dryRun) {
  console.log('Dry run — no write.')
} else {
  const backup = FILE.replace('.json', `.backup-${Date.now()}.json`)
  fs.copyFileSync(FILE, backup)
  console.log(`Backup: ${backup}`)
  fs.writeFileSync(FILE, JSON.stringify({ ...data, streets: kept }, null, 2))
  console.log(`Wrote: ${FILE}`)
}
