// Copy data/clean/map.json → layers.ribbons into src/data/ribbons.json
// so the bundled runtime sees the freshly-built ribbons (skelIds, anchors,
// medians, corridors). Backs up the old bundle with a timestamp first.
//
// Run after every `node pipeline.js` whose output should reach the React app.

import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SCENE, SCENE, sceneCleanDir } from './config.js'
import { writeIfChanged } from './io.js'

// Scene selection: --scene=<name> or CARTOGRAPH_SCENE (env, shared with the
// rest of the pipeline). The OUTPUT is scene-scoped: the DEFAULT scene keeps
// writing the runtime bundle at src/data/ribbons.json (unchanged); a
// non-default scene writes its OWN clean/ribbons.json so LS's bundle is never
// clobbered. The cartograph SCENE_REGISTRY loads a non-default scene's ribbons
// from that path (Phase 0e).
let scene = SCENE
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--scene=(.+)$/)
  if (m) scene = m[1]
}
const MAP_PATH = join(sceneCleanDir(scene), 'map.json')
const BUNDLED_PATH = scene === DEFAULT_SCENE
  ? join(import.meta.dirname, '..', 'src', 'data', 'ribbons.json')
  : join(sceneCleanDir(scene), 'ribbons.json')

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
console.log(`  tiles: ${ribbons.tiles?.length || 0}`)   // [D2] the frozen block-face topology
