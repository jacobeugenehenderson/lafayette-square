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

  // ⛔⛔ BIND THE ANCHORS TO THE PLACEMENTS THEY WERE SAMPLED FROM. The runtime gated
  // only on `anchors.length === instances.length`, which cannot tell a good file from a
  // STALE one of the same length — a re-pour that keeps the count but changes the ORDER
  // mis-seats every tree, silently, and the map looks plausible while every trunk floats
  // or sinks. Nothing on LS today (residual median 0.07 m, p95 0.68 m against a shuffled
  // control of 6.45 m — measured 2026-09-03), but a length gate is not evidence, it is
  // the absence of one, and on town #2 it passes while the whole canopy is wrong.
  // ⭐ FNV-1a over the placement COORDINATES, in order — the exact thing that must not
  // have moved. Cheap to compute, cheap to verify, and it fails on reorder as loudly as
  // on a count change.
  let h = 2166136261 >>> 0
  for (const t of trees) {
    const k = `${t.x.toFixed(3)},${t.z.toFixed(3)}`
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  }
  const placementKey = h.toString(16).padStart(8, '0')
  const out = { version: 2, look, count: anchors.length, placementKey, anchors }
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
