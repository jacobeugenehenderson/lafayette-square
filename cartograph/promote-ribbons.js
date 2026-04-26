// Copy data/clean/map.json → layers.ribbons into src/data/ribbons.json
// so the bundled runtime sees the freshly-built ribbons (skelIds, anchors,
// medians, corridors). Backs up the old bundle with a timestamp first.
//
// Run after every `node pipeline.js` whose output should reach the React app.

import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { join } from 'path'

const MAP_PATH = join(import.meta.dirname, 'data', 'clean', 'map.json')
const BUNDLED_PATH = join(import.meta.dirname, '..', 'src', 'data', 'ribbons.json')

const map = JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
const ribbons = map.layers?.ribbons
if (!ribbons) throw new Error('map.json has no layers.ribbons')

const stamp = Date.now()
const backupPath = BUNDLED_PATH + `.backup-${stamp}`
copyFileSync(BUNDLED_PATH, backupPath)
console.log(`Backup: ${backupPath}`)

writeFileSync(BUNDLED_PATH, JSON.stringify(ribbons, null, 2))
console.log(`Wrote: ${BUNDLED_PATH}`)
console.log(`  streets: ${ribbons.streets?.length || 0}`)
console.log(`  corridors: ${ribbons.corridors?.length || 0}`)
console.log(`  medians: ${ribbons.medians?.length || 0}`)
console.log(`  faces: ${ribbons.faces?.length || 0}`)
