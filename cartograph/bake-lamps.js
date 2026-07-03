/**
 * bake-lamps.js — passthrough bake of street_lamps.json into the Look's
 * baked folder. Lamp placements aren't authored per-Look today; this
 * step exists so Preview reads only from the bake bundle (matches the
 * pure-Three-bake architecture).
 *
 * Future: per-Look lamp authoring (different lamp models, per-Look
 * positioning, color overrides) writes here.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeIfChanged } from './io.js'
import { loadSceneTerrain } from './terrainLoad.js'
import { makeGroundSampler } from './groundSampler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Read a .bin as a clean ArrayBuffer (Buffer is a view into a shared pool).
function readAB(path) {
  const u8 = readFileSync(path)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

// Bake the per-lamp ground anchor: the raw field where the DRAWN ground sits
// under each lamp (groundSampler over the look's baked ground mesh), so the
// runtime rigid-lifts the lamp onto the rendered surface instead of the smooth
// field — no float. Mutates each lamp with `groundRaw`. Needs the look's ground
// bake to exist (it runs earlier in the chain); skips with a warning otherwise.
function anchorLampsToGround(lamps, outDir, scene) {
  const groundJsonPath = join(outDir, 'ground.json')
  const groundBinPath  = join(outDir, 'ground.bin')
  if (!existsSync(groundJsonPath) || !existsSync(groundBinPath)) return 0
  const gj = JSON.parse(readFileSync(groundJsonPath, 'utf-8'))
  const gAB = readAB(groundBinPath)
  // Per-scene terrain (cartograph/data/<scene>/clean/terrain.*); flat fallback
  // if this installation has none baked yet.
  const terrain = loadSceneTerrain(scene) || { getElevationRaw: () => 0 }
  const sampler = makeGroundSampler(gj, gAB, terrain)
  for (const l of lamps) l.groundRaw = sampler.groundRawAt(l.x, l.z)
  return lamps.length
}

export async function bakeLamps({ look = 'default', scene = 'lafayette-square' } = {}) {
  const inPath  = join(ROOT, 'src', 'data', 'street_lamps.json')
  const outDir  = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const raw = JSON.parse(readFileSync(inPath, 'utf-8'))
  const lamps = raw.lamps || raw
  const anchored = anchorLampsToGround(lamps, outDir, scene)
  const out = {
    version: 1,
    look,
    count: lamps.length,
    lamps,
  }
  const outPath = join(outDir, 'lamps.json')
  const wrote = writeIfChanged(outPath, JSON.stringify(out, null, 2))
  console.log(`[bake-lamps] ${wrote ? 'wrote' : 'unchanged'} ${outPath} (${lamps.length} lamps${anchored ? `, ${anchored} ground-anchored` : ' — NO ground bake, un-anchored'})`)
}

async function main() {
  let look = 'default', scene = 'lafayette-square'
  for (const arg of process.argv.slice(2)) {
    let m
    if ((m = arg.match(/^--look=(.+)$/)))      look  = m[1]
    else if ((m = arg.match(/^--scene=(.+)$/))) scene = m[1]
  }
  // TODO(step C): scene-keyed lamp SOURCE — HiPointe's OSM lamps live in its
  // map.json (streetlamp layer); LS uses src/data/street_lamps.json.
  await bakeLamps({ look, scene })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
