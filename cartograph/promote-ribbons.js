// Copy data/clean/map.json → layers.ribbons into src/data/ribbons.json
// so the bundled runtime sees the freshly-built ribbons (skelIds, anchors,
// medians, corridors). Backs up the old bundle with a timestamp first.
//
// Run after every `node pipeline.js` whose output should reach the React app.

import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SCENE, sceneCleanDir } from './config.js'
import { writeIfChanged } from './io.js'

// CLI: --scene=<name> chooses which scene's map.json to read. The output
// path is currently fixed at src/data/ribbons.json (the default-scene
// runtime bundle). Non-default scenes need their own bundled ribbons file
// (see SCENE_REGISTRY in CartographApp.jsx); wire that up alongside a
// per-scene src/data/<scene>/ribbons.json migration.
let scene = DEFAULT_SCENE
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--scene=(.+)$/)
  if (m) scene = m[1]
}
const MAP_PATH = join(sceneCleanDir(scene), 'map.json')
const BUNDLED_PATH = join(import.meta.dirname, '..', 'src', 'data', 'ribbons.json')

const map = JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
const ribbons = map.layers?.ribbons
if (!ribbons) throw new Error('map.json has no layers.ribbons')

// Content-aware: skip the write (and the mtime bump) when bytes match,
// so a no-op pipeline run doesn't cascade-invalidate every downstream
// bake step. Backup snapshots dropped — git is the source of truth.
const wrote = writeIfChanged(BUNDLED_PATH, JSON.stringify(ribbons, null, 2))
console.log(`${wrote ? 'Wrote' : 'Unchanged'}: ${BUNDLED_PATH}`)
console.log(`  streets: ${ribbons.streets?.length || 0}`)
console.log(`  corridors: ${ribbons.corridors?.length || 0}`)
console.log(`  medians: ${ribbons.medians?.length || 0}`)
console.log(`  faces: ${ribbons.faces?.length || 0}`)
