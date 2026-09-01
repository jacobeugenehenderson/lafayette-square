/**
 * bake-tree-anchors.js — per-look ground anchors for a neighbourhood's tree
 * placements. The anchor that seats each tree on the DRAWN ground lives here:
 * baked/<look>/tree-anchors.json = { anchors:[groundRaw,…] }, index-parallel to
 * the instance order of the placements the runtime fetches. The runtime
 * (InstancedTrees) rigid-lifts each tree by anchor × uExag — the same
 * groundSampler / aGroundRaw regime as the lamps + foundations.
 *
 * ⚠️ The anchors are read from the SAME file the runtime reads for this look
 * (baked/<look>/trees.json) — that is what keeps the two arrays parallel. Until
 * 2026-07-15 this hardcoded LS's baked/default.json regardless of the look, so
 * it could only ever anchor Lafayette Square; pointed at any other
 * neighbourhood it wrote LS's trunk heights into that look's dir, and the
 * runtime's length check threw them all away (trees fell back to smooth-field
 * sampling and floated). Never reintroduce a census path that ignores the look.
 *
 * Runs AFTER bake-ground (it reads the look's ground mesh). Re-run whenever the
 * ground or the tree placements change.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { assertBakeTarget } from './bake-target.js'
import { loadSceneTerrain } from './terrainLoad.js'
import { makeGroundSampler } from './groundSampler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function readAB(p) {
  const u8 = readFileSync(p)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

export async function bakeTreeAnchors({ look, scene = 'lafayette-square' } = {}) {
  assertBakeTarget('bake-tree-anchors', look, scene)
  const outDir = join(ROOT, 'public', 'baked', look)
  const groundJsonPath = join(outDir, 'ground.json')
  const groundBinPath  = join(outDir, 'ground.bin')
  const treesPath      = join(outDir, 'trees.json')
  if (!existsSync(groundJsonPath) || !existsSync(groundBinPath) || !existsSync(treesPath)) {
    console.warn(`[bake-tree-anchors] missing ground or trees.json for look '${look}' — skipped`)
    return
  }
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const gj = JSON.parse(readFileSync(groundJsonPath, 'utf-8'))
  const gAB = readAB(groundBinPath)
  const terrain = loadSceneTerrain(scene) || { getElevationRaw: () => 0 }
  const sampler = makeGroundSampler(gj, gAB, terrain)

  const trees = (JSON.parse(readFileSync(treesPath, 'utf-8')).instances) || []
  const anchors = trees.map(t => sampler.groundRawAt(t.x, t.z))

  const out = { version: 1, look, count: anchors.length, anchors }
  const outPath = join(outDir, 'tree-anchors.json')
  const wrote = writeIfChanged(outPath, JSON.stringify(out))
  console.log(`[bake-tree-anchors] ${wrote ? 'wrote' : 'unchanged'} ${outPath} (${anchors.length} tree anchors)`)
}

async function main() {
  let look = null, scene = 'lafayette-square'
  for (const a of process.argv.slice(2)) {
    let m
    if ((m = a.match(/^--look=(.+)$/)))       look  = m[1]
    else if ((m = a.match(/^--scene=(.+)$/)))  scene = m[1]
  }
  await bakeTreeAnchors({ look, scene })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
