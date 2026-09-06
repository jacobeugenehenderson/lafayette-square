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

// ⛔ REFUSE A SILENT MATERIAL CLOBBER. This step overwrites the artifact the operator's
// map is actually made of, so a promote that CHANGES its shape must be a decision, not a
// side effect. Counts equal ⇒ proceed silently.
//
// ⭐⭐ WHAT THIS GUARD IS *NOT*: a reason to hesitate over an ordinary re-pour.
// This comment used to say a fresh run "produced a MATERIALLY DIFFERENT LS map" and that
// promoting it "destroyed his map — three times in one day". ⛔ THAT DOES NOT REPRODUCE and
// the retraction is older than this text: `ROADMAP A01` established the pipeline is
// DETERMINISTIC (two runs byte-identical; byte-identical across six days) and that the
// COMMITTED artifact is the stale one. The "worse on the eye" verdict came from a session
// that was measuring the wrong scene with a flag-off bake and a stale cache.
// ⭐ MEASURED AGAIN 2026-09-06 on LS: skeleton `[unchanged]`, and every layer the map is
// made of — streets, tiles, faces, junctionMap, medians, corridors, paths, alleys,
// intersections, junctions, nameTransitions — byte-identical to the committed artifact. The
// only delta was one ADDED key (`protopolygon`), which is additive and cannot move the map.
// ⛔ RE-RUN IT, DO NOT QUOTE IT: `node scratch/claims-repour-changes-nothing.mjs <scene>`.
// The stale alarm cost a session: it was raised as a blocker against a re-pour that had
// already been settled, because the doc still read as live.
//
// ⚠️ THE REAL LIMIT OF THIS GUARD IS STILL TRUE AND IS THE ONLY THING TO CARRY FORWARD:
// it compares COUNTS, so a same-count different-GEOMETRY pour passes silently. That is what
// the check above exists to catch — diff the layers, never the counts.
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
