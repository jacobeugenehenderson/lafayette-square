/**
 * normalize-manifests.js — one-shot pass over public/trees/&lt;species&gt;/manifest.json:
 *
 *   1. Backfill missing per-variant fields (category, quality, styles)
 *   2. Re-categorize species-by-id when the publish-time auto-guess was wrong
 *      (e.g. abies/picea/pseudotsuga published as broadleaf)
 *   3. Compute normalizeScale per variant from approxHeightM → category target
 *      height, so the runtime can ship visually consistent trees regardless
 *      of vendor authoring scale.
 *
 * Idempotent. Run any time. After running, regenerate index.json via
 * build-index.js (or publish-glb's import).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuildIndex } from './build-index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TREES_DIR = path.resolve(__dirname, '..', 'public', 'trees')

// Realistic urban-tree heights (meters). Per-instance jitter applied at runtime.
const TARGET_HEIGHT = {
  broadleaf: 12,
  conifer: 18,
  ornamental: 6,
  weeping: 10,
  columnar: 12,
}

// Species-id substrings that force a category. Override the auto-guess from
// publish-glb when it produced an obvious mistake.
const CONIFER_HINTS = [
  'abies', 'picea', 'pinus', 'pine', 'pseudotsuga', 'tsuga', 'juniperus',
  'cedar', 'cedrus', 'cupressus', 'callitropsis', 'spruce', 'fir', 'larix',
  'thuja', 'taxus', 'douglas',
]
const ORNAMENTAL_HINTS = [
  'magnolia', 'dogwood', 'crabapple', 'cherry', 'hawthorn', 'serviceberry',
  'redbud', 'witchhazel', 'witch_hazel',
]
const WEEPING_HINTS = ['willow', 'salix_babylonica', 'weeping']
const COLUMNAR_HINTS = ['cupressus_sempervirens', 'columnar', 'fastigiate']

function inferCategory(speciesId, current) {
  const s = speciesId.toLowerCase()
  if (COLUMNAR_HINTS.some((h) => s.includes(h))) return 'columnar'
  if (WEEPING_HINTS.some((h) => s.includes(h))) return 'weeping'
  if (CONIFER_HINTS.some((h) => s.includes(h))) return 'conifer'
  if (ORNAMENTAL_HINTS.some((h) => s.includes(h))) return 'ornamental'
  if (current && current !== 'broadleaf') return current
  return current || 'broadleaf'
}

async function processManifest(speciesDir) {
  const manifestPath = path.join(TREES_DIR, speciesDir, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch {
    return null
  }

  const before = JSON.stringify(manifest)
  const newCategory = inferCategory(manifest.species, manifest.category)
  manifest.category = newCategory

  if (!Array.isArray(manifest.defaultStyles) || manifest.defaultStyles.length === 0) {
    manifest.defaultStyles = ['realistic']
  }

  for (const v of manifest.variants ?? []) {
    v.category = newCategory
    if (typeof v.quality !== 'number') v.quality = 4
    if (!Array.isArray(v.styles) || v.styles.length === 0) {
      v.styles = manifest.defaultStyles.slice()
    }
    const target = TARGET_HEIGHT[v.category] ?? TARGET_HEIGHT.broadleaf
    if (typeof v.approxHeightM === 'number' && v.approxHeightM > 0.001) {
      v.normalizeScale = +(target / v.approxHeightM).toFixed(6)
    } else if (typeof v.normalizeScale !== 'number') {
      v.normalizeScale = 1
    }
  }

  const after = JSON.stringify(manifest)
  if (before === after) return { species: manifest.species, changed: false }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  return { species: manifest.species, changed: true, category: newCategory }
}

async function main() {
  const entries = await fs.readdir(TREES_DIR, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  const results = []
  for (const d of dirs) {
    const r = await processManifest(d)
    if (r) results.push(r)
  }
  const changed = results.filter((r) => r.changed)
  console.log(`[normalize] processed ${results.length} manifests, updated ${changed.length}`)
  for (const r of changed) console.log(`  ${r.species} → category=${r.category}`)

  const idx = await rebuildIndex()
  console.log(`[normalize] rebuilt index.json (${idx.speciesCount} species, ${idx.variantCount} variants)`)
}

main().catch((e) => {
  console.error('[normalize] failed:', e)
  process.exit(1)
})
