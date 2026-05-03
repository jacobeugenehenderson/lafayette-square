/**
 * migrate-add-styles.js — add `styles` field to every variant in every
 * manifest, with a sensible heuristic default. Run once after batch publish
 * so the runtime gets the new field uniformly across the library. Safe to
 * re-run; only adds the field if missing (won't overwrite operator edits).
 *
 * Heuristic:
 *   - source === 'lidar'                          → ['pointcloud', 'realistic']
 *   - species_id contains 'stylized' or 'bonsai'  → ['stylized']
 *   - species_id contains 'burnt' or 'dead'       → ['winter', 'stylized']
 *   - species_id contains 'lowpoly' or 'low_poly' → ['realistic', 'lowpoly']
 *   - everything else                             → ['realistic']
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT  = path.resolve(__dirname, '..')
const TREES_DIR  = path.join(REPO_ROOT, 'public/trees')

function inferStyles({ speciesId, source }) {
  const id = (speciesId || '').toLowerCase()
  if (source === 'lidar')                            return ['pointcloud', 'realistic']
  if (/stylized|bonsai/.test(id))                    return ['stylized']
  if (/burnt|dead/.test(id))                         return ['winter', 'stylized']
  if (/lowpoly|low_poly/.test(id))                   return ['realistic', 'lowpoly']
  return ['realistic']
}

async function main() {
  const dirs = await fs.readdir(TREES_DIR, { withFileTypes: true })
  let touched = 0, skipped = 0, missing = 0
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const manifestPath = path.join(TREES_DIR, d.name, 'manifest.json')
    let manifest
    try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) }
    catch { missing++; continue }
    if (!manifest.variants) { missing++; continue }

    const styles = inferStyles({ speciesId: manifest.species, source: manifest.source })
    let changed = false
    for (const v of manifest.variants) {
      if (!v.styles) { v.styles = styles; changed = true }
    }
    // Also write top-level default for any consumer that wants species-wide style.
    if (!manifest.defaultStyles) { manifest.defaultStyles = styles; changed = true }

    if (changed) {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      touched++
      console.log(`[migrate] ${d.name}: styles=${JSON.stringify(styles)} (${manifest.variants.length} variants)`)
    } else {
      skipped++
    }
  }
  console.log(`[migrate] done: ${touched} touched, ${skipped} already had styles, ${missing} missing/invalid`)
}

main().catch(err => { console.error(err); process.exit(1) })
