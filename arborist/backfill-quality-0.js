/**
 * One-shot: convert all auto-derived `quality: 4` defaults to `quality: 0`
 * across the library. Operator-set qualityOverride values are preserved.
 *
 * Run once after the rating-ladder rework. Idempotent — re-running is a
 * no-op once everything's been migrated.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuildIndex } from './build-index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TREES_DIR = path.resolve(__dirname, '..', 'public', 'trees')

const dirs = (await fs.readdir(TREES_DIR, { withFileTypes: true }))
  .filter(e => e.isDirectory()).map(e => e.name)

let touched = 0, varTouched = 0
for (const d of dirs) {
  const p = path.join(TREES_DIR, d, 'manifest.json')
  let m
  try { m = JSON.parse(await fs.readFile(p, 'utf8')) } catch { continue }
  let dirty = false
  for (const v of m.variants ?? []) {
    if (v.quality === 4) { v.quality = 0; varTouched++; dirty = true }
  }
  if (dirty) { await fs.writeFile(p, JSON.stringify(m, null, 2)); touched++ }
}
console.log(`[backfill] ${touched} manifests, ${varTouched} variants reset to quality: 0`)

const idx = await rebuildIndex()
console.log(`[backfill] rebuilt index.json (${idx.speciesCount} species, ${idx.variantCount} variants)`)
