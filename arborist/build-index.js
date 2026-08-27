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
// TRACKED species-curation overlay. Hand-authored identity (label · scientific ·
// deciduous) + Promote (`promoted:true` → into the pool) live here, in git, while
// the `public/trees/<sp>/manifest.json` base stays GENERATED + gitignored.
// build-index merges the overlay over the manifest so no human decision lives in
// an ignored file (2026-07-08). Chassis-level equivalent: state/_chassis-curation.json.
const CURATION_PATH = path.resolve(__dirname, 'state', '_species-curation.json')

// ── NO-FILLER gate (2026-07-07) ─────────────────────────────────────────────
// The procedural + generic placeholder trees are doctrine-parked: "our
// procedural generator is not usable and its workspace is hidden … leave hidden"
// (arborist/ORIENTATION.md). But "no procedurals" was only ever enforced by
// HIDING THE UI — the rated procedural/generic GLBs stayed in this pool, so any
// look's intake could (and HiPointe's did) route census species straight onto
// them (the "~40% filler" bug). This is the structural gate that was always
// missing: fillers never enter the runtime pool, so no map / bake / look can
// select one. When a real procedural pipeline ships, flip EXCLUDE_FILLER — the
// destination is still procedural (feedback_procedural_trees_are_the_destination),
// just not this v1 stopgap.
const EXCLUDE_FILLER = true
const isFillerSpecies = (id) => /procedural|^generic_|_rt\d+/i.test(String(id))

export async function rebuildIndex() {
  const entries = await fs.readdir(TREES_DIR, { withFileTypes: true })
  const speciesDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  let curation = {}
  try { curation = JSON.parse(await fs.readFile(CURATION_PATH, 'utf8')).species || {} } catch {}

  const species = []
  const variants = []
  const excludedFiller = []

  for (const sp of speciesDirs) {
    if (EXCLUDE_FILLER && isFillerSpecies(sp)) { excludedFiller.push(sp); continue }
    const manifestPath = path.join(TREES_DIR, sp, 'manifest.json')
    let manifest
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    } catch {
      continue
    }
    const cur = curation[sp] || {}   // tracked overlay: identity + Promote

    species.push({
      species: manifest.species,
      label: cur.label || manifest.displayName || manifest.label,
      scientific: cur.scientific ?? manifest.scientific ?? null,
      category: manifest.category ?? null,
      tints: manifest.tints ?? null,
      deciduous: cur.deciduous ?? manifest.deciduous ?? true,
    })

    const entryOf = (v, quality) => {
      const skeletons = {}
      for (const lod of ['lod0', 'lod1', 'lod1far', 'lod2']) {
        if (v.skeletons?.[lod]) skeletons[lod] = `/trees/${manifest.species}/${v.skeletons[lod]}`
      }
      const entry = {
        species: manifest.species,
        variantId: v.id,
        category: v.category ?? manifest.category ?? null,
        quality,
        styles: v.stylesOverride ?? v.styles ?? manifest.defaultStyles ?? ['realistic'],
        approxHeightM: v.approxHeightM ?? null,
        normalizeScale: v.normalizeScale ?? 1,
        skeletons,
      }
      // Operator overrides — preserved separately so the bake step can distinguish
      // "operator vouched" from "auto-computed" (clamp / jitter / replace).
      if (v.scaleOverride !== undefined) entry.scaleOverride = v.scaleOverride
      if (v.rotationOverride !== undefined) entry.rotationOverride = v.rotationOverride
      if (v.positionOverride !== undefined) entry.positionOverride = v.positionOverride
      return entry
    }

    let pushed = 0
    for (const v of manifest.variants ?? []) {
      // Runtime gate: only Fill (2) / Mid (3) / Hero (4) ship. excluded=true =
      // hard-killed; effective rating 0 = Untouched; 1 = Trash.
      if (v.excluded === true) continue
      const effQuality = v.qualityOverride ?? v.quality ?? 0
      if (effQuality < 2) continue
      variants.push(entryOf(v, v.qualityOverride ?? v.quality ?? 4))
      pushed++
    }
    // Tracked Promote fallback: the overlay says this species is promoted but no
    // variant passed the quality gate (e.g. the manifest regenerated without the
    // qualityOverride) — include its primary skeleton variant so the Promote
    // survives a manifest rebuild without hand-editing the ignored manifest.
    if (cur.promoted && pushed === 0) {
      const v = (manifest.variants ?? []).find(x => x.excluded !== true && (x.skeletons?.lod0 || x.skeletons?.lod1 || x.skeletons?.lod2))
      if (v) variants.push(entryOf(v, 2))
    }
  }

  const index = {
    generatedAt: Date.now(),
    species,
    variants,
  }
  const out = path.join(TREES_DIR, 'index.json')
  await fs.writeFile(out, JSON.stringify(index, null, 2))
  return { speciesCount: species.length, variantCount: variants.length, excludedFiller, out }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isDirect) {
  rebuildIndex().then(({ speciesCount, variantCount, excludedFiller, out }) => {
    console.log(`[build-index] ${speciesCount} species, ${variantCount} variants → ${out}`)
    if (excludedFiller?.length) console.log(`[build-index] excluded ${excludedFiller.length} filler species (NO-FILLER gate): ${excludedFiller.join(', ')}`)
  }).catch((e) => {
    console.error('[build-index] failed:', e)
    process.exit(1)
  })
}
