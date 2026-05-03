/**
 * bake-scene.js — write the Look's authoring snapshot to
 * `public/baked/<look>/scene.json`.
 *
 * scene.json is the contract Preview reads. v1 fields:
 *   - look          — Look id
 *   - generatedAt   — ms epoch
 *   - palette       — 12-color building tint palette
 *   - materialPhysics — per-material shader knobs (roughness/metalness/textureScale/textureStrength/emissive/emissiveIntensity)
 *   - materialColors  — per-material default colors (foundation, etc.)
 *   - layerColors / luColors — kept for potential future runtime use
 *
 * Future fields (not yet authored as state, will be added once Stage
 * persists them): env (post-FX, exposure), arch (distance/scale), time
 * (default hour, sun curve overrides), surfaces (per-material extra).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const DEFAULT_PALETTE = [
  '#dcdcdc', '#a0522d', '#cd853f', '#8b2500',
  '#d2b48c', '#778899', '#8b4513', '#a52a2a',
  '#f5deb3', '#696969', '#b22222', '#808080',
]

export async function bakeScene({ look = 'default' } = {}) {
  const designPath = join(ROOT, 'public', 'looks', look, 'design.json')
  const outDir     = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  let design = {}
  if (existsSync(designPath)) {
    design = JSON.parse(readFileSync(designPath, 'utf-8'))
  } else {
    console.warn(`[bake-scene] no design.json at ${designPath}; using defaults`)
  }

  const scene = {
    version: 1,
    look,
    generatedAt: Date.now(),
    palette:         design.buildingPalette || DEFAULT_PALETTE,
    materialPhysics: design.materialPhysics || {},
    materialColors:  design.materialColors  || {},
    layerColors:     design.layerColors     || {},
    luColors:        design.luColors        || {},
    layerVis:        design.layerVis        || {},
    lampGlow:        design.lampGlow        || { grass: 0.06, trees: 0.40, pool: 1.0 },
  }

  const outPath = join(outDir, 'scene.json')
  writeFileSync(outPath, JSON.stringify(scene, null, 2))
  console.log(`[bake-scene] wrote ${outPath}`)
  return scene
}

async function main() {
  let look = 'default'
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--look=(.+)$/)
    if (m) look = m[1]
  }
  await bakeScene({ look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
