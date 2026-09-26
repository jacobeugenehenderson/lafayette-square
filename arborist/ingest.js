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
import { tagChassis, tagLeaf, tagBark, labelChassis, labelLeaf, labelBark } from './ingest-tagger.js'
import { place, regenerateManifest, reapOrphans, canonicalDir, assignedIds } from './library-builder.js'
import { writeInventory } from './library-inventory.js'

const CHASSIS_DIR = 'public/trees/_chassis'
const LEAF_PACKS_DIR = 'public/textures/leaves/shapes'
const BARK_DIR = 'public/textures/bark'
const CURATION = 'arborist/state/_chassis-curation.json'
const RUBRIC = 'arborist/rubric.json'
const OUT_DEFAULT = 'arborist/state/part-index.json'
const TREES_DIR = 'public/trees'
const INDEX_JSON = 'public/trees/index.json'
const DOSSIER_DIR = 'arborist/dossiers'

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))
const isProcedural = (id) => /procedural/i.test(id)

/** Every texture a vendor tree GLB carries, labelled by its species dir — the barks and
 *  leaves the library holds but never indexed as plates. Read from the GLB's JSON chunk. */
function embeddedTextures(indexSpecies) {
  const out = []
  if (!existsSync(TREES_DIR)) return out
  for (const ent of readdirSync(TREES_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('_')) continue
    const seen = new Set()
    for (const f of readdirSync(join(TREES_DIR, ent.name)).filter(f => /^skeleton-\d+-lod0\.glb$/.test(f))) {
      const b = readFileSync(join(TREES_DIR, ent.name, f))
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString())
      for (const img of j.images || []) {
        const name = img.name || ''
        if (!name || seen.has(name) || /normal|rough|metal|ao\b|opacity|height|disp/i.test(name)) continue
        seen.add(name)
        const kind = /bark|trunk|wood/i.test(name) ? 'bark' : /leaf|leaves|needle|foliage|frond/i.test(name) ? 'leaf' : 'other'
        out.push({ id: `${ent.name}#${name}`, kind, glb: join(TREES_DIR, ent.name, f), image: name,
          label: labelChassis({ source: { species: ent.name } }, indexSpecies, {}) })
      }
    }
  }
  return out
}

export function runIngest(opts = {}) {
  const rubric = readJSON(RUBRIC)
  const indexSpecies = existsSync(INDEX_JSON) ? readJSON(INDEX_JSON).species || [] : []
  const dossiers = {}
  if (existsSync(DOSSIER_DIR)) for (const f of readdirSync(DOSSIER_DIR).filter(f => f.endsWith('.json'))) {
    try { dossiers[f.replace(/\.json$/, '')] = readJSON(join(DOSSIER_DIR, f)) } catch { /* a dossier that does not parse labels nothing */ }
  }
  const curation = existsSync(CURATION) ? readJSON(CURATION).chassis || {} : {}
  const parts = []
  // ⛔ A minted id is authored: keep the library's id for a source it already holds.
  const ids = assignedIds(opts.libRoot)
  const idFor = (sourcePath, minted) => ids.get(sourcePath) || minted

  // ── chassis (241) ──────────────────────────────────────────────────────────
  const chassisMetas = readdirSync(CHASSIS_DIR).filter(f => f.endsWith('.meta.json'))
  for (const f of chassisMetas) {
    const partId = f.replace(/\.meta\.json$/, '')
    const meta = readJSON(join(CHASSIS_DIR, f))
    const cur = curation[partId + '.glb']
    if (cur && (cur.approved === false || cur.setAside)) continue // operator-rejected or set-aside — skip
    const conformReport = {
      recentered: Array.isArray(meta.heightRange) && meta.heightRange[0] === 0,
      rescaled: false,
      forestSplit: false,
      oriented: false, // per-composition orientation stays hand-done at the viewer (accepted residual)
    }
    const part = {
      partId: idFor(join(CHASSIS_DIR, partId + '.glb'), partId), partType: 'chassis',
      source: isProcedural(partId) || isProcedural(meta.source?.species || '') ? 'procedural' : 'authored',
      sourcePath: join(CHASSIS_DIR, partId + '.glb'),
      tags: tagChassis(rubric, meta, cur),
      conformReport,
      curation: cur ? { approved: cur.approved !== false, displayName: cur.displayName || null } : null,
      label: labelChassis(meta, indexSpecies, dossiers),
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
        partId: idFor(join(LEAF_PACKS_DIR, pack), pack), partType: 'leaf', source: 'authored',
        sourcePath: join(LEAF_PACKS_DIR, pack),
        tags: tagLeaf(rubric, packMeta),
        label: labelLeaf(packMeta),
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

  // ── barks (ambientCG Bark0NN + wired Poly Haven CC0 dirs) ─────────────────────
  if (existsSync(BARK_DIR)) {
    for (const ent of readdirSync(BARK_DIR, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue
      const barkId = ent.name
      const bmetaPath = join(BARK_DIR, barkId, 'meta.json')
      const bmeta = existsSync(bmetaPath) ? readJSON(bmetaPath) : null
      parts.push({
        partId: idFor(join(BARK_DIR, barkId), barkId), partType: 'bark', source: 'authored',
        sourcePath: join(BARK_DIR, barkId),
        tags: tagBark(rubric, barkId),
        label: labelBark(barkId, bmeta),
        conformReport: null,
        provenance: bmeta?.provenance || 'ambientCG (draft quality)',
      })
    }
  }

  // ── place each part canonically (Library Builder) + collect the index path ──
  // ⛔ ONLY on a real run. A preview (`--out`) writes its index and NOTHING else: it once
  // re-laid the real public/library from a scratch run (2026-09-25). `opts.libRoot` lets a
  // check drive the placement against a scratch library.
  const libRoot = opts.libRoot
  const writeLibrary = !opts.out || !!libRoot
  for (const part of parts) {
    if (writeLibrary) place(part, { ...opts, libRoot })
    part.path = canonicalDir(part, libRoot)
  }
  if (writeLibrary) {
    reapOrphans(parts, libRoot) // self-heal placements left behind by a re-tag (value change)
    regenerateManifest(parts, libRoot)
  }

  // ── emit the §7.1 part-index (the seam with 1B) ────────────────────────────
  const index = {
    version: '1.0-stage1a',
    generatedBy: 'Boz (Stage 1A, direct build)',
    rubricVersion: rubric.version,
    counts: countBy(parts, p => p.partType),
    sources: countBy(parts, p => p.source),
    parts,
    // The textures vendor GLBs embed, labelled — plates the library holds but has not yet
    // lifted into its own bark/leaf dirs. Outside `parts` so nothing places or composes them yet.
    embedded: embeddedTextures(indexSpecies),
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
