/**
 * One-shot recovery: my earlier split-group-shots.js had a bug where
 * --dry still renamed originals to .bak. This walks public/trees/, and
 * for each species:
 *   1. Restores any *.glb.bak to *.glb (overwriting if needed).
 *   2. Deletes any skeleton-N-lod*.glb whose variant id isn't in the manifest.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TREES_DIR = path.resolve(__dirname, '..', 'public', 'trees')

async function main() {
  const dirs = (await fs.readdir(TREES_DIR, { withFileTypes: true }))
    .filter(e => e.isDirectory()).map(e => e.name)
  let restored = 0, deleted = 0, manifestsCleaned = 0
  for (const dir of dirs) {
    const speciesDir = path.join(TREES_DIR, dir)
    const manifestPath = path.join(speciesDir, 'manifest.json')
    let manifest
    try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) }
    catch { continue }
    // Clean manifest: drop split-derived variants, un-mark originals.
    let dirty = false
    const before = manifest.variants?.length || 0
    if (manifest.variants?.some(v => v.splitFromVariantId != null) ||
        manifest.variants?.some(v => v.excluded === true && v.splitInto)) {
      dirty = true
      manifest.variants = manifest.variants.filter(v => v.splitFromVariantId == null)
      for (const v of manifest.variants) {
        if (v.splitInto) {
          delete v.splitInto
          if (v.excluded === true) delete v.excluded
        }
      }
    }
    if (dirty) {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      manifestsCleaned++
    }
    const validIds = new Set((manifest.variants || []).map(v => v.id))
    const files = await fs.readdir(speciesDir)
    for (const f of files) {
      if (!f.endsWith('.glb.bak')) continue
      const orig = path.join(speciesDir, f.slice(0, -4))
      try { await fs.rename(path.join(speciesDir, f), orig); restored++ } catch (e) {}
    }
    const filesAfter = await fs.readdir(speciesDir)
    for (const f of filesAfter) {
      const m = f.match(/^skeleton-(\d+)-lod[012]\.glb$/)
      if (!m) continue
      const id = parseInt(m[1], 10)
      if (!validIds.has(id)) {
        await fs.unlink(path.join(speciesDir, f))
        deleted++
      }
    }
  }
  console.log(`[restore] cleaned ${manifestsCleaned} manifest(s), restored ${restored} .bak file(s), deleted ${deleted} orphan LOD file(s)`)
}

main().catch(e => { console.error(e); process.exit(1) })
