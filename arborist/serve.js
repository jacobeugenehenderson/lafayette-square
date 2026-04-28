#!/usr/bin/env node
/**
 * Arborist backend.
 *
 * Local-only Node service for the Arborist helper app. Mirrors
 * cartograph/serve.js patterns — see arborist/SPEC.md § "Backend
 * (arborist/serve.js)" for the full endpoint contract.
 */
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, createReadStream } from 'fs'
import { execFile } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const PUBLIC_TREES = join(ROOT, 'public', 'trees')
const STATE_DIR    = join(__dirname, 'state')
const CACHE_DIR    = join(__dirname, '_cache')
const PREVIEW_DIR  = join(CACHE_DIR, 'preview')
const VENV_PYTHON  = join(__dirname, '.venv', 'bin', 'python')
const PREVIEW_PY   = join(__dirname, 'preview-laz.py')
const SPECIES_MAP  = join(__dirname, 'species-map.json')
const CONFIG_PATH  = join(__dirname, 'config.json')
const PORT = 3334

// ── First-boot scaffolding ─────────────────────────────────────────────────
function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }) }
ensureDir(PUBLIC_TREES)
ensureDir(STATE_DIR)
ensureDir(PREVIEW_DIR)
const indexPath = join(PUBLIC_TREES, 'index.json')
if (!existsSync(indexPath)) {
  writeFileSync(indexPath, JSON.stringify({ species: [] }, null, 2))
  console.log('[arborist] initialized empty public/trees/index.json')
}

// ── Helpers ────────────────────────────────────────────────────────────────
function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}
function writeJson(path, obj) {
  ensureDir(dirname(path))
  writeFileSync(path, JSON.stringify(obj, null, 2))
}
function jsonRes(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}
function notImplemented(res, route) {
  jsonRes(res, 501, { error: 'not implemented', route })
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => data += c)
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}
function execAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout; err.stderr = stderr
        return reject(err)
      }
      resolve({ stdout, stderr })
    })
  })
}

// ── Startup config + caches ────────────────────────────────────────────────
const SPECIES_DECL = readJsonOrNull(SPECIES_MAP)?.species || {}
const CONFIG = readJsonOrNull(CONFIG_PATH) || {}
const META_CSV_PATH = join(ROOT, CONFIG.metadataCsv || 'botanica/tree_metadata_dev.csv')
const DATASET_ROOT  = join(ROOT, CONFIG.datasetRoot || 'botanica')

// Parse the FOR-species20K metadata CSV once and group by species name
// (e.g. "Acer_saccharum"). Each row: { treeId, species, genus, dataset,
// dataType, treeH, filename }. fileSize attached lazily to dodge stat
// calls on cold start; cached on first /specimens hit per species.
let CSV_BY_SPECIES = null
function loadCsv() {
  if (CSV_BY_SPECIES) return CSV_BY_SPECIES
  if (!existsSync(META_CSV_PATH)) {
    console.warn(`[arborist] metadata CSV missing: ${META_CSV_PATH}`)
    CSV_BY_SPECIES = new Map()
    return CSV_BY_SPECIES
  }
  const lines = readFileSync(META_CSV_PATH, 'utf-8').split(/\r?\n/)
  const header = lines.shift().split(',')
  const idx = (name) => header.indexOf(name)
  const I_ID = idx('treeID'), I_SP = idx('species'), I_GEN = idx('genus'),
        I_DS = idx('dataset'), I_DT = idx('data_type'),
        I_H  = idx('tree_H'), I_FN = idx('filename')
  const map = new Map()
  for (const line of lines) {
    if (!line.trim()) continue
    const f = line.split(',')
    const sp = f[I_SP]
    if (!sp) continue
    const row = {
      treeId:    f[I_ID],
      species:   sp,
      genus:     f[I_GEN],
      dataset:   f[I_DS],
      dataType:  f[I_DT],
      treeH:     parseFloat(f[I_H]) || 0,
      filename:  f[I_FN],
    }
    if (!map.has(sp)) map.set(sp, [])
    map.get(sp).push(row)
  }
  CSV_BY_SPECIES = map
  return map
}

// FOR-species20K stores .laz under botanica/dev/<NNNN>.laz; the CSV's
// `filename` field reads "/train/00070.las" but actual on-disk files end
// in .laz and live under botanica/dev/. Translate.
function specimenLazPath(treeId) {
  // Pad treeId to at least 5 digits — the dataset uses 5-digit filenames
  // for early IDs ("00070") but Sugar Maple IDs are 5-digit anyway (10178).
  // Keep raw ID since it's already correct length for our species.
  return join(DATASET_ROOT, 'dev', `${treeId}.laz`)
}

function attachFileSize(specimens) {
  for (const s of specimens) {
    try {
      const path = specimenLazPath(s.treeId)
      s.fileSize = statSync(path).size
      s.sourceFile = `botanica/dev/${s.treeId}.laz`
    } catch {
      s.fileSize = 0
      s.sourceFile = null
    }
  }
  return specimens
}

// Stratified-sampling recommend: divide the height range into N bands,
// pick the densest (largest .laz) specimen per band. Marks N as
// recommended; returns all specimens. Default N from config; per-species
// override via species-map (future).
function markRecommended(specimens, count = 10) {
  const present = specimens.filter(s => s.fileSize > 0)
  if (present.length === 0) return specimens
  const heights = present.map(s => s.treeH).sort((a, b) => a - b)
  const minH = heights[0], maxH = heights[heights.length - 1]
  const span = maxH - minH || 1
  const bands = Array.from({ length: count }, () => [])
  for (const s of present) {
    const t = (s.treeH - minH) / span
    const band = Math.min(count - 1, Math.floor(t * count))
    bands[band].push(s)
  }
  for (const band of bands) {
    if (!band.length) continue
    band.sort((a, b) => b.fileSize - a.fileSize)
    band[0].recommended = true
  }
  return specimens
}

// Merge species-map (declared) with public/trees/index.json (baked) so
// /species lists every species the Arborist knows about — including ones
// not yet baked (those carry bakedAt: null and seedlingsPicked counts).
function listSpecies() {
  const baked = readJsonOrNull(indexPath)?.species || []
  const bakedById = new Map(baked.map(s => [s.id, s]))
  const out = []
  for (const [id, decl] of Object.entries(SPECIES_DECL)) {
    const seedlings = readJsonOrNull(join(STATE_DIR, id, 'seedlings.json'))
    const seedlingCount = Array.isArray(seedlings?.seedlings)
      ? seedlings.seedlings.length : 0
    const b = bakedById.get(id)
    out.push({
      id,
      label:        decl.label,
      scientific:   decl.scientific,
      tier:         decl.tier,
      leafMorph:    decl.leafMorph,
      barkMorph:    decl.barkMorph,
      deciduous:    decl.deciduous,
      hasFlowers:   decl.hasFlowers,
      seedlingsPicked: seedlingCount,
      variants:     b?.variants || 0,
      bakedAt:      b?.bakedAt || null,
    })
  }
  return out
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  let m

  try {
    // GET /species — declared + baked merged
    if (req.method === 'GET' && req.url === '/species') {
      return jsonRes(res, 200, { species: listSpecies() })
    }

    // GET /species/:id — manifest from public/trees (404 until baked)
    if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)$/))) {
      const manifestPath = join(PUBLIC_TREES, m[1], 'manifest.json')
      const manifest = readJsonOrNull(manifestPath)
      if (!manifest) return jsonRes(res, 404, { error: 'not yet baked', species: m[1] })
      return jsonRes(res, 200, manifest)
    }

    // GET /species/:id/specimens — candidates from FOR-species20K + recommended flags
    if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)\/specimens$/))) {
      const id = m[1]
      const decl = SPECIES_DECL[id]
      if (!decl) return jsonRes(res, 404, { error: 'unknown species', id })
      const csv = loadCsv()
      const rows = csv.get(decl.forSpeciesName) || []
      if (!rows.length) {
        return jsonRes(res, 200, { species: id, specimens: [], note: `no rows for ${decl.forSpeciesName} in metadata CSV` })
      }
      const specimens = rows.map(r => ({ ...r, recommended: false }))
      attachFileSize(specimens)
      const recommendCount = (decl.seedlingCount || CONFIG.defaultSeedlingCount || 10)
      markRecommended(specimens, recommendCount)
      return jsonRes(res, 200, { species: id, count: specimens.length, recommendCount, specimens })
    }

    // GET /species/:id/seedlings — picked seedlings + tune params
    if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)\/seedlings$/))) {
      const id = m[1]
      const data = readJsonOrNull(join(STATE_DIR, id, 'seedlings.json'))
      if (!data) return jsonRes(res, 404, { error: 'no seedlings picked yet', species: id })
      return jsonRes(res, 200, data)
    }

    // POST /species/:id/seedlings — save the seedling library for a species
    if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/seedlings$/))) {
      const id = m[1]
      if (!SPECIES_DECL[id]) return jsonRes(res, 404, { error: 'unknown species', id })
      const body = await readBody(req)
      if (!Array.isArray(body.seedlings)) {
        return jsonRes(res, 400, { error: '`seedlings` must be an array' })
      }
      const out = {
        species: id,
        seedlings: body.seedlings,
        savedAt: Date.now(),
      }
      writeJson(join(STATE_DIR, id, 'seedlings.json'), out)
      return jsonRes(res, 200, { ok: true, count: body.seedlings.length })
    }

    // GET /specimens/:treeId/preview.ply — stream a converted PLY (cached)
    if (req.method === 'GET' && (m = req.url.match(/^\/specimens\/([^/]+)\/preview\.ply$/))) {
      const treeId = m[1]
      const lazPath = specimenLazPath(treeId)
      const plyPath = join(PREVIEW_DIR, `${treeId}.ply`)
      if (!existsSync(lazPath)) {
        return jsonRes(res, 404, { error: 'specimen not on disk', treeId, lazPath })
      }
      if (!existsSync(plyPath)) {
        // First request — convert via the Python utility.
        try {
          await execAsync(VENV_PYTHON, [PREVIEW_PY, '--input', lazPath, '--output', plyPath])
        } catch (err) {
          return jsonRes(res, 500, {
            error: 'preview conversion failed', treeId,
            stderr: String(err.stderr || err.message).slice(0, 4000),
          })
        }
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': statSync(plyPath).size,
        // Cached PLYs are deterministic per specimen — let the browser cache.
        'Cache-Control': 'public, max-age=3600',
      })
      createReadStream(plyPath).pipe(res)
      return
    }

    // POST /species/:id/bake — placeholder until bake-tree.py lands
    if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/bake$/))) {
      return notImplemented(res, 'POST /species/:id/bake')
    }

    // DELETE /species/:id — placeholder
    if (req.method === 'DELETE' && (m = req.url.match(/^\/species\/([^/]+)$/))) {
      return notImplemented(res, 'DELETE /species/:id')
    }

    // GET /inventory — species histogram from src/data/park_trees.json
    if (req.method === 'GET' && req.url === '/inventory') {
      const trees = readJsonOrNull(join(ROOT, 'src', 'data', 'park_trees.json'))?.trees || []
      const counts = {}
      for (const t of trees) {
        const k = t.species || 'unknown'
        counts[k] = (counts[k] || 0) + 1
      }
      const sorted = Object.entries(counts)
        .map(([species, count]) => ({ species, count }))
        .sort((a, b) => b.count - a.count)
      return jsonRes(res, 200, { total: trees.length, species: sorted })
    }

    // 404
    return jsonRes(res, 404, { error: 'route not found', method: req.method, url: req.url })
  } catch (err) {
    return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
  }
})

server.listen(PORT, () => {
  console.log(`Arborist backend → http://localhost:${PORT}`)
  console.log(`  declared species: ${Object.keys(SPECIES_DECL).join(', ') || '(none)'}`)
})
