/**
 * merge-london-plane.js — one-shot consolidation of three London Plane
 * species (platanus_acerifolia, platanus_summer, platanus_green) into a
 * single platanus_acerifolia.
 *
 * Drops the loose-parts variants in platanus_summer (v9-v17 are
 * Caps/Branches/Leaves assembly sheets, not real trees).
 *
 * Renumbers the kept variants and updates every cross-reference:
 *   - Renames skeleton GLBs into platanus_acerifolia/
 *   - Merges variant entries in platanus_acerifolia/manifest.json
 *   - Rewrites public/looks/<look>/design.json#/trees rosters
 *   - Updates src/data/park_species_map.json
 *   - Deletes platanus_summer/ and platanus_green/ trees dirs
 *   - Rebuilds public/trees/index.json
 *
 * Idempotent: errors out if either source species is already gone.
 *
 * Usage: node arborist/merge-london-plane.js
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuildIndex } from './build-index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const TREES_DIR = path.join(REPO_ROOT, 'public/trees')
const LOOKS_DIR = path.join(REPO_ROOT, 'public/looks')
const PARK_SPECIES_MAP = path.join(REPO_ROOT, 'src/data/park_species_map.json')

const TARGET = 'platanus_acerifolia'
const LODS = ['lod0', 'lod1', 'lod2']

// Source species → variants to migrate (drop everything else).
const MIGRATIONS = [
  { source: 'platanus_summer', keepIds: [1, 2, 3, 4, 5, 6, 7, 8] },
  { source: 'platanus_green',  keepIds: [1, 2] },
]

async function pathExists(p) { try { await fs.access(p); return true } catch { return false } }

async function main() {
  // Sanity: target exists, sources exist
  for (const sp of [TARGET, ...MIGRATIONS.map(m => m.source)]) {
    if (!await pathExists(path.join(TREES_DIR, sp))) {
      throw new Error(`expected dir missing: ${sp}`)
    }
  }
  const targetManifestPath = path.join(TREES_DIR, TARGET, 'manifest.json')
  const targetManifest = JSON.parse(await fs.readFile(targetManifestPath, 'utf8'))
  let nextId = Math.max(...targetManifest.variants.map(v => v.id)) + 1

  // Build (oldSpecies, oldVariantId) → newVariantId mapping; do file moves.
  const mapping = []  // [{ oldSpecies, oldId, newId, sourceName }]
  for (const { source, keepIds } of MIGRATIONS) {
    const srcDir = path.join(TREES_DIR, source)
    const srcManifest = JSON.parse(await fs.readFile(path.join(srcDir, 'manifest.json'), 'utf8'))
    for (const v of srcManifest.variants) {
      if (!keepIds.includes(v.id)) continue
      const newId = nextId++
      // Rename GLBs into target species dir.
      for (const lod of LODS) {
        const srcFile = path.join(srcDir, `skeleton-${v.id}-${lod}.glb`)
        const dstFile = path.join(TREES_DIR, TARGET, `skeleton-${newId}-${lod}.glb`)
        if (!await pathExists(srcFile)) {
          console.warn(`  missing source: ${srcFile} — skipping`)
          continue
        }
        await fs.rename(srcFile, dstFile)
      }
      // Append variant entry, preserving fields, with new id + new skeleton paths.
      const entry = {
        ...v,
        id: newId,
        skeletons: {
          lod0: `skeleton-${newId}-lod0.glb`,
          lod1: `skeleton-${newId}-lod1.glb`,
          lod2: `skeleton-${newId}-lod2.glb`,
        },
      }
      targetManifest.variants.push(entry)
      mapping.push({ oldSpecies: source, oldId: v.id, newId, sourceName: v.sourceName })
      console.log(`  ${source} v${v.id} (${v.sourceName}) → ${TARGET} v${newId}`)
    }
  }

  // Bookkeeping: bump bakedAt to "now" so /grove cache-busts.
  targetManifest.bakedAt = new Date().toISOString()
  await fs.writeFile(targetManifestPath, JSON.stringify(targetManifest, null, 2))
  console.log(`\nMerged ${mapping.length} variants into ${TARGET} (now ${targetManifest.variants.length} total)`)

  // Update Look design.json rosters
  let looksUpdated = 0
  try {
    const lookDirs = await fs.readdir(LOOKS_DIR, { withFileTypes: true })
    for (const ent of lookDirs) {
      if (!ent.isDirectory()) continue
      const designPath = path.join(LOOKS_DIR, ent.name, 'design.json')
      if (!await pathExists(designPath)) continue
      const design = JSON.parse(await fs.readFile(designPath, 'utf8'))
      const trees = Array.isArray(design.trees) ? design.trees : []
      let changed = false
      const next = trees.map(t => {
        const m = mapping.find(x => x.oldSpecies === t.species && Number(x.oldId) === Number(t.variantId))
        if (m) { changed = true; return { species: TARGET, variantId: m.newId } }
        // Drop refs to dropped variants
        if (MIGRATIONS.some(mig => mig.source === t.species)) { changed = true; return null }
        return t
      }).filter(Boolean)
      if (changed) {
        design.trees = next
        await fs.writeFile(designPath, JSON.stringify(design, null, 2))
        console.log(`Updated Look "${ent.name}" — ${trees.length} → ${next.length} tree refs`)
        looksUpdated++
      }
    }
  } catch (err) {
    console.warn('looks update failed:', err.message)
  }

  // Update src/data/park_species_map.json: collapse the platanus alias list.
  try {
    const map = JSON.parse(await fs.readFile(PARK_SPECIES_MAP, 'utf8'))
    let mapChanged = false
    for (const [k, v] of Object.entries(map)) {
      if (Array.isArray(v) && v.some(s => s === 'platanus_summer' || s === 'platanus_green')) {
        map[k] = [TARGET]
        mapChanged = true
      }
    }
    if (mapChanged) {
      await fs.writeFile(PARK_SPECIES_MAP, JSON.stringify(map, null, 2))
      console.log('Updated src/data/park_species_map.json')
    }
  } catch (err) {
    console.warn('park_species_map update skipped:', err.message)
  }

  // Delete source species directories
  for (const { source } of MIGRATIONS) {
    await fs.rm(path.join(TREES_DIR, source), { recursive: true, force: true })
    console.log(`Deleted ${source}/`)
  }

  // Rebuild library index
  await rebuildIndex()
  console.log('\nIndex rebuilt.')
  console.log(`\nDone. ${looksUpdated} Look(s) updated. Re-bake any affected Looks via POST /atlas/bake?look=<name>.`)
}

main().catch(err => { console.error(err); process.exit(1) })
