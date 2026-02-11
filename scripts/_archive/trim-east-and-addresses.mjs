#!/usr/bin/env node
/**
 * Remove buildings east of Truman Parkway (except Bellwether + Walgreens)
 * and specific buildings at 1115 S Jefferson and 1539 Chouteau.
 * Also removes associated landmarks.
 */

import { readFileSync, writeFileSync } from 'fs'

const TRUMAN_X = 620  // Truman Parkway approximate western edge
const KEEP_EAST = new Set(['bldg-0711', 'bldg-1162'])  // Bellwether, Walgreens
const REMOVE_IDS = new Set(['bldg-0101', 'bldg-0102'])  // 1115 S Jefferson

// ── Buildings ──
const bldgData = JSON.parse(readFileSync('src/data/buildings.json', 'utf-8'))
const before = bldgData.buildings.length
const removedIds = new Set()

bldgData.buildings = bldgData.buildings.filter(b => {
  const x = b.position[0]
  // Remove specific addresses
  if (REMOVE_IDS.has(b.id)) { removedIds.add(b.id); return false }
  // Remove east of Truman (except keepers)
  if (x > TRUMAN_X && !KEEP_EAST.has(b.id)) { removedIds.add(b.id); return false }
  return true
})
console.log(`Buildings: ${before} → ${bldgData.buildings.length} (removed ${removedIds.size})`)
writeFileSync('src/data/buildings.json', JSON.stringify(bldgData))

// ── Landmarks ──
const lmkData = JSON.parse(readFileSync('src/data/landmarks.json', 'utf-8'))
const lmkBefore = lmkData.landmarks.length
lmkData.landmarks = lmkData.landmarks.filter(l => {
  const bid = l.building_id || l.id
  return !removedIds.has(bid)
})
console.log(`Landmarks: ${lmkBefore} → ${lmkData.landmarks.length} (removed ${lmkBefore - lmkData.landmarks.length})`)
writeFileSync('src/data/landmarks.json', JSON.stringify(lmkData))

// ── Street lamps east of Truman ──
const lampData = JSON.parse(readFileSync('src/data/street_lamps.json', 'utf-8'))
const lampBefore = lampData.lamps.length
lampData.lamps = lampData.lamps.filter(l => l.x <= TRUMAN_X + 60)  // keep lamps near Bellwether/Walgreens
console.log(`Lamps: ${lampBefore} → ${lampData.lamps.length} (removed ${lampBefore - lampData.lamps.length})`)
writeFileSync('src/data/street_lamps.json', JSON.stringify(lampData))

console.log(`\nRemoved building IDs (sample): ${[...removedIds].slice(0, 10).join(', ')}...`)
