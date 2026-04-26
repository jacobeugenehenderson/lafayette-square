// Rebind data/clean/overlay.json against the current data/clean/skeleton.json.
//
// Why: skeleton's chain IDs shifted across Path B (Phases 2 + 4 +
// splitAtFolds). overlay entries are keyed by old skelId, so authored
// cross-sections orphan to chains that don't exist anymore.
//
// What this script does:
// - Backs up overlay.json with a timestamp.
// - Groups old entries by `name`. For each name, picks the first entry
//   that has a `measure` as the "primary" entry.
// - For every new chain in skeleton.json with a matching name, writes a
//   new overlay entry carrying the primary's `measure` + `capStart` +
//   `capEnd` + `name`. Drops `segmentMeasures` and `couplers` because
//   they reference ordinal segment positions / world coords whose
//   meaning depends on the OLD chain decomposition that no longer exists.
// - Logs everything that would be lost so the operator can re-author.
//
// Run: `node cartograph/migrate-overlay.js`
// Output: rewrites cartograph/data/clean/overlay.json in place.

import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dirname, 'data', 'clean')
const OVERLAY_PATH = join(ROOT, 'overlay.json')
const SKELETON_PATH = join(ROOT, 'skeleton.json')

const overlay = JSON.parse(readFileSync(OVERLAY_PATH, 'utf-8'))
const skeleton = JSON.parse(readFileSync(SKELETON_PATH, 'utf-8'))

const oldEntries = Object.entries(overlay.streets || {})
const newStreets = skeleton.streets || []

console.log(`Old overlay: ${oldEntries.length} entries`)
console.log(`New skeleton: ${newStreets.length} streets\n`)

// Group old entries by name; pick first entry with `measure` as primary.
const byName = new Map()
for (const [oldId, entry] of oldEntries) {
  const name = entry.name
  if (!byName.has(name)) byName.set(name, [])
  byName.get(name).push({ oldId, entry })
}
const primaries = new Map()
for (const [name, entries] of byName) {
  const withMeasure = entries.find(e => e.entry.measure)
  primaries.set(name, withMeasure || entries[0])
}

// Group new chains by name.
const newByName = new Map()
for (const s of newStreets) {
  if (!newByName.has(s.name)) newByName.set(s.name, [])
  newByName.get(s.name).push(s)
}

// Build new overlay.streets.
const newStreetsMap = {}
let migratedCount = 0
let lostMeasureEntries = 0
let lostSegmentMeasures = 0
let lostCouplers = 0
const lostNames = []
const unmappedNames = []

for (const [name, primary] of primaries) {
  const newChains = newByName.get(name) || []
  if (!newChains.length) {
    unmappedNames.push(name)
    continue
  }
  const all = byName.get(name)
  const withSegment = all.filter(e => e.entry.segmentMeasures && Object.keys(e.entry.segmentMeasures).length > 0)
  const withCouplers = all.filter(e => e.entry.couplers && e.entry.couplers.length > 0)
  if (withSegment.length) lostSegmentMeasures += withSegment.length
  if (withCouplers.length) lostCouplers += withCouplers.length
  if (all.length > 1 && (withSegment.length || withCouplers.length)) {
    lostNames.push({ name, oldEntries: all.length, withSegment: withSegment.length, withCouplers: withCouplers.length })
  }
  // Broadcast primary's measure + caps to every new chain of this name.
  for (const chain of newChains) {
    const newEntry = { name }
    if (primary.entry.measure) newEntry.measure = primary.entry.measure
    if (primary.entry.capStart) newEntry.capStart = primary.entry.capStart
    if (primary.entry.capEnd) newEntry.capEnd = primary.entry.capEnd
    newStreetsMap[chain.id] = newEntry
    migratedCount++
  }
  if (!primary.entry.measure) lostMeasureEntries++
}

// Backup + write.
const stamp = Date.now()
const backupPath = OVERLAY_PATH + `.backup-${stamp}`
copyFileSync(OVERLAY_PATH, backupPath)
console.log(`Backup: ${backupPath}`)

const newOverlay = { ...overlay, streets: newStreetsMap }
writeFileSync(OVERLAY_PATH, JSON.stringify(newOverlay, null, 2))
console.log(`Wrote: ${OVERLAY_PATH}`)

console.log(`\n— Migration summary —`)
console.log(`Migrated: ${migratedCount} new overlay entries (broadcast from ${primaries.size} unique names)`)
console.log(`Names with no measure to migrate: ${lostMeasureEntries}`)
console.log(`Old entries with segmentMeasures (DROPPED): ${lostSegmentMeasures}`)
console.log(`Old entries with couplers (DROPPED): ${lostCouplers}`)
if (unmappedNames.length) {
  console.log(`\nUnmapped (name not in new skeleton): ${unmappedNames.length}`)
  for (const n of unmappedNames) console.log(`  ${n}`)
}
if (lostNames.length) {
  console.log(`\nNames where per-chain authored detail was collapsed:`)
  for (const l of lostNames) console.log(`  ${l.name}: ${l.oldEntries} old entries, ${l.withSegment} had segmentMeasures, ${l.withCouplers} had couplers`)
}
