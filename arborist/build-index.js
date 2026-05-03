/**
 * build-index.js — scans public/trees/&lt;species&gt;/manifest.json and writes
 * public/trees/index.json as a flattened pool the runtime can consume in one
 * fetch.
 *
 * Schema:
 *   {
 *     generatedAt: number,
 *     species: [{ species, label, scientific, category, tints, deciduous }],
 *     variants: [{
 *       species, variantId, category, quality, styles, approxHeightM,
 *       normalizeScale, skeletons: { lod0, lod1, lod2 }
 *     }]
 *   }
 *
 * Used by InstancedTrees to build the picker pool. Re-run after every
 * publish (or import rebuildIndex() from publish-glb.js).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TREES_DIR = path.resolve(__dirname, '..', 'public', 'trees')

export async function rebuildIndex() {
  const entries = await fs.readdir(TREES_DIR, { withFileTypes: true })
  const speciesDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  const species = []
  const variants = []

  for (const sp of speciesDirs) {
    const manifestPath = path.join(TREES_DIR, sp, 'manifest.json')
    let manifest
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    } catch {
      continue
    }

    species.push({
      species: manifest.species,
      label: manifest.displayName || manifest.label,
      scientific: manifest.scientific ?? null,
      category: manifest.category ?? null,
      tints: manifest.tints ?? null,
      deciduous: manifest.deciduous ?? true,
    })

    for (const v of manifest.variants ?? []) {
      // Runtime gate: only Fill (2) / Mid (3) / Hero (4) ship.
      //   excluded=true        — operator hard-killed this variant
      //   effective rating 0   — Untouched, must be rated before use
      //   effective rating 1   — Trash, operator rejected
      if (v.excluded === true) continue
      const effQuality = v.qualityOverride ?? v.quality ?? 0
      if (effQuality < 2) continue
      const skeletons = {}
      for (const lod of ['lod0', 'lod1', 'lod2']) {
        if (v.skeletons?.[lod]) {
          skeletons[lod] = `/trees/${manifest.species}/${v.skeletons[lod]}`
        }
      }
      const entry = {
        species: manifest.species,
        variantId: v.id,
        category: v.category ?? manifest.category ?? null,
        quality: v.qualityOverride ?? v.quality ?? 4,
        styles: v.stylesOverride ?? v.styles ?? manifest.defaultStyles ?? ['realistic'],
        approxHeightM: v.approxHeightM ?? null,
        normalizeScale: v.normalizeScale ?? 1,
        skeletons,
      }
      // Operator overrides — preserved separately so the bake step can
      // distinguish "operator vouched" from "auto-computed" and decide
      // whether to clamp / jitter / replace.
      if (v.scaleOverride !== undefined) entry.scaleOverride = v.scaleOverride
      if (v.rotationOverride !== undefined) entry.rotationOverride = v.rotationOverride
      if (v.positionOverride !== undefined) entry.positionOverride = v.positionOverride
      variants.push(entry)
    }
  }

  const index = {
    generatedAt: Date.now(),
    species,
    variants,
  }
  const out = path.join(TREES_DIR, 'index.json')
  await fs.writeFile(out, JSON.stringify(index, null, 2))
  return { speciesCount: species.length, variantCount: variants.length, out }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isDirect) {
  rebuildIndex().then(({ speciesCount, variantCount, out }) => {
    console.log(`[build-index] ${speciesCount} species, ${variantCount} variants → ${out}`)
  }).catch((e) => {
    console.error('[build-index] failed:', e)
    process.exit(1)
  })
}
