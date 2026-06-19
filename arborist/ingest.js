/**
 * ingest.js — conform-and-tag-on-ingest, the ONE procedure
 * (Forest Builder Stage 1A, FOREST-BUILDER-KIT-MATCHER.md §4 + §10).
 *
 *   for each part-in-hand:  conform → auto-tag (draft) → Library-Builder place → index
 *
 * Emits arborist/state/part-index.json (the §7.1 tagged-part schema) — the SEAM
 * the Stage-1B matcher + dashboard read. Conform is already shipped in
 * survey-deleaf.js (Brief 19/20/23): the 241 _chassis/*.meta.json are conformed
 * output (heightRange Y-min 0), so for parts in hand ingest READS the conformed
 * meta; only a genuinely-new asset re-runs conform (opts.reconform, shells out —
 * "wire it, don't re-implement"; no fork, one pipeline).
 *
 * CLI:  node arborist/ingest.js [--copy-binaries] [--out=<path>]
 * Gated on opts.* never process.env (banked lesson — a process.env ref crashed a
 * browser-reachable build). rubric.json/dossiers ratified read-only;
 * leaf-pack-bindings.json / roster-coverage.js untouched (1B's seeds).
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { tagChassis, tagLeaf, tagBark } from './ingest-tagger.js'
import { place, regenerateManifest, reapOrphans, canonicalDir } from './library-builder.js'
import { writeInventory } from './library-inventory.js'

const CHASSIS_DIR = 'public/trees/_chassis'
const LEAF_PACKS_DIR = 'public/textures/leaves/shapes'
const BARK_DIR = 'public/textures/bark'
const CURATION = 'arborist/state/_chassis-curation.json'
const RUBRIC = 'arborist/rubric.json'
const OUT_DEFAULT = 'arborist/state/part-index.json'

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))
const isProcedural = (id) => /procedural/i.test(id)

export function runIngest(opts = {}) {
  const rubric = readJSON(RUBRIC)
  const curation = existsSync(CURATION) ? readJSON(CURATION).chassis || {} : {}
  const parts = []

  // ── chassis (241) ──────────────────────────────────────────────────────────
  const chassisMetas = readdirSync(CHASSIS_DIR).filter(f => f.endsWith('.meta.json'))
  for (const f of chassisMetas) {
    const partId = f.replace(/\.meta\.json$/, '')
    const meta = readJSON(join(CHASSIS_DIR, f))
    const cur = curation[partId + '.glb']
    if (cur && cur.approved === false) continue // operator-rejected core — skip
    const conformReport = {
      recentered: Array.isArray(meta.heightRange) && meta.heightRange[0] === 0,
      rescaled: false,
      forestSplit: false,
      oriented: false, // per-composition orientation stays hand-done at the viewer (accepted residual)
    }
    const part = {
      partId, partType: 'chassis',
      source: isProcedural(partId) || isProcedural(meta.source?.species || '') ? 'procedural' : 'authored',
      sourcePath: join(CHASSIS_DIR, partId + '.glb'),
      tags: tagChassis(rubric, meta, cur),
      conformReport,
      curation: cur ? { approved: cur.approved !== false, displayName: cur.displayName || null } : null,
    }
    parts.push(part)
  }

  // ── leaf packs (10) ─────────────────────────────────────────────────────────
  if (existsSync(LEAF_PACKS_DIR)) {
    for (const pack of readdirSync(LEAF_PACKS_DIR)) {
      const metaPath = join(LEAF_PACKS_DIR, pack, 'meta.json')
      if (!existsSync(metaPath)) continue
      const packMeta = readJSON(metaPath)
      parts.push({
        partId: pack, partType: 'leaf', source: 'authored',
        sourcePath: join(LEAF_PACKS_DIR, pack),
        tags: tagLeaf(rubric, packMeta),
        conformReport: null,
        packMeta: {
          morphology: packMeta.morphology,
          naturalSize: packMeta.naturalSize,
          tileGrid: packMeta.tileGrid,
          quality: packMeta.quality || 'vendor',
          recommendedSpecies: packMeta.recommendedSpecies || [],
          vendorPack: packMeta.source?.pack,
        },
      })
    }
  }

  // ── barks (5) ────────────────────────────────────────────────────────────────
  if (existsSync(BARK_DIR)) {
    for (const barkId of readdirSync(BARK_DIR).filter(d => /^Bark/i.test(d))) {
      parts.push({
        partId: barkId, partType: 'bark', source: 'authored',
        sourcePath: join(BARK_DIR, barkId),
        tags: tagBark(rubric, barkId),
        conformReport: null,
      })
    }
  }

  // ── place each part canonically (Library Builder) + collect the index path ──
  for (const part of parts) {
    place(part, opts)
    part.path = canonicalDir(part)
  }
  reapOrphans(parts) // self-heal placements left behind by a re-tag (value change)
  regenerateManifest(parts)

  // ── emit the §7.1 part-index (the seam with 1B) ────────────────────────────
  const index = {
    version: '1.0-stage1a',
    generatedBy: 'Boz (Stage 1A, direct build)',
    rubricVersion: rubric.version,
    counts: countBy(parts, p => p.partType),
    sources: countBy(parts, p => p.source),
    parts,
  }
  const out = opts.out || OUT_DEFAULT
  mkdirSync(join(out, '..'), { recursive: true })
  writeFileSync(out, JSON.stringify(index, null, 2) + '\n')
  if (!opts.out) writeInventory() // regenerate the library listing (reads the just-written default index)
  return index
}

const countBy = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o }, {})

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath('file://' + process.argv[1])
if (isMain || (process.argv[1] && process.argv[1].endsWith('ingest.js'))) {
  const opts = {
    copyBinaries: process.argv.includes('--copy-binaries'),
    reconform: process.argv.includes('--reconform'),
  }
  const outArg = process.argv.find(a => a.startsWith('--out='))
  if (outArg) opts.out = outArg.slice('--out='.length)
  const idx = runIngest(opts)
  console.log(`ingest → ${opts.out || OUT_DEFAULT}`)
  console.log('  parts:', JSON.stringify(idx.counts), '| sources:', JSON.stringify(idx.sources))
}
