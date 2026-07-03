/**
 * bake-tree-anchors.js — per-look ground anchors for the (global) tree
 * placements. Trees are baked once globally (public/baked/default.json), but
 * the ground is per-look, so the anchor that seats each tree on the DRAWN
 * ground lives here: baked/<look>/tree-anchors.json = { anchors:[groundRaw,…] }
 * parallel to default.json's instance order. The runtime (InstancedTrees)
 * fetches it and rigid-lifts each tree by anchor × uExag — the same
 * groundSampler / aGroundRaw regime as the lamps + foundations.
 *
 * Runs AFTER bake-ground (it reads the look's ground mesh). Re-run whenever the
 * ground or the tree placements change.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { loadSceneTerrain } from './terrainLoad.js'
import { makeGroundSampler } from './groundSampler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function readAB(p) {
  const u8 = readFileSync(p)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

export async function bakeTreeAnchors({ look = 'lafayette-square', scene = 'lafayette-square' } = {}) {
  const outDir = join(ROOT, 'public', 'baked', look)
  const groundJsonPath = join(outDir, 'ground.json')
  const groundBinPath  = join(outDir, 'ground.bin')
  const treesPath      = join(ROOT, 'public', 'baked', 'default.json')
  if (!existsSync(groundJsonPath) || !existsSync(groundBinPath) || !existsSync(treesPath)) {
    console.warn(`[bake-tree-anchors] missing ground (${look}) or default.json — skipped`)
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
  let look = 'lafayette-square', scene = 'lafayette-square'
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
