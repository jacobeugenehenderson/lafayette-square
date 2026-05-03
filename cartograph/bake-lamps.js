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

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

export async function bakeLamps({ look = 'default' } = {}) {
  const inPath  = join(ROOT, 'src', 'data', 'street_lamps.json')
  const outDir  = join(ROOT, 'public', 'baked', look)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const raw = JSON.parse(readFileSync(inPath, 'utf-8'))
  const lamps = raw.lamps || raw
  const out = {
    version: 1,
    look,
    generatedAt: Date.now(),
    count: lamps.length,
    lamps,
  }
  const outPath = join(outDir, 'lamps.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`[bake-lamps] wrote ${outPath} (${lamps.length} lamps)`)
}

async function main() {
  let look = 'default'
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--look=(.+)$/)
    if (m) look = m[1]
  }
  await bakeLamps({ look })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
