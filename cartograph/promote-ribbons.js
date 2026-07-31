// Copy data/clean/map.json → layers.ribbons into src/data/ribbons.json
// so the bundled runtime sees the freshly-built ribbons (skelIds, anchors,
// medians, corridors). Backs up the old bundle with a timestamp first.
//
// Run after every `node pipeline.js` whose output should reach the React app.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SCENE, SCENE, sceneCleanDir, requireExplicitScene} from './config.js'
import { writeIfChanged } from './io.js'

// ⛔ No silent default on a WRITE path (BRIEF-ls-bleed-excision site 11).
requireExplicitScene('promote-ribbons.js (writes the runtime ribbons bundle)')

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

// ⛔⛔ REFUSE A SILENT MATERIAL CLOBBER (2026-07-31).
// This step overwrites the artifact the operator's map is actually made of. On
// 2026-07-31 a fresh `pipeline.js` run on unchanged inputs produced a MATERIALLY
// DIFFERENT LS map than the committed one (101 tiles either way, but 233 vs 228
// junction nodes and a different FILL: 75 vs 71 asphalt rings), and the fresh
// derivation was WORSE on the operator's eye. Promoting it silently destroyed his
// map — three times in one day, twice while merely "verifying" an unrelated change.
// Until `ROADMAP A01` (the pipeline does not reproduce its own committed output) is
// understood, a promote that changes the shape of the artifact must be a decision,
// not a side effect. Counts equal ⇒ proceed silently, as before.
if (existsSync(BUNDLED_PATH) && !process.argv.includes('--yes')) {
  try {
    const prev = JSON.parse(readFileSync(BUNDLED_PATH, 'utf-8'))
    const shape = (r) => ({
      streets: r.streets?.length || 0, tiles: r.tiles?.length || 0,
      faces: r.faces?.length || 0, medians: r.medians?.length || 0,
      nodes: r.junctionMap?.nodes?.length || 0,
      caps: (r.tiles || []).reduce((a, t) => a + (t.caps?.length || 0), 0),
    })
    const a = shape(prev), b = shape(ribbons)
    const moved = Object.keys(a).filter(k => a[k] !== b[k])
    if (moved.length) {
      console.error(`\n⛔ refusing to promote: this would MATERIALLY CHANGE ${BUNDLED_PATH}\n`)
      for (const k of moved) console.error(`     ${k.padEnd(9)} ${a[k]}  →  ${b[k]}`)
      console.error(`
   That file is what the operator's map is made of. A fresh pipeline run is not
   guaranteed to reproduce it (ROADMAP A01), and the re-derivation has been worse
   on the eye before.

   Look at the delta, then re-run with --yes if you mean it.
`)
      process.exit(2)
    }
  } catch { /* unreadable previous artifact — fall through and write */ }
}

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
