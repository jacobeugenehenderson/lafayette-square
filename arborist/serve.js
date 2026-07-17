#!/usr/bin/env node
/**
 * Arborist backend.
 *
 * Local-only Node service for the Arborist helper app. Mirrors
 * cartograph/serve.js patterns — see arborist/SPEC.md § "Backend
 * (arborist/serve.js)" for the full endpoint contract.
 */
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, createReadStream, readdirSync } from 'fs'
import { execFile } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { bakeLook } from './bake-look.js'
import { treeBakeInputsForScene, sceneForLook } from '../cartograph/tree-bake-inputs.mjs'
import { DEFAULT_SCENE } from '../cartograph/config.js'
import { publishLidarSpecies } from './lidar-publish.js'
import {
  PRESETS as PROCEDURAL_PRESETS,
  generateSingleVariantGLB,
  readEffectiveSeedlings,
  writeSeedlings,
} from './generate-procedural.js'
import {
  listSalonSpecies,
  listChassis as listSalonChassis,
  listForestChassis,
  listBarkRefs as listSalonBarkRefs,
  listLeafPacks as listSalonLeafPacks,
  readEffectiveCompositions,
  writeCompositions,
  generateSingleCompositionGLB,
} from './generate-salon.js'
import { DEFAULT_SCA_BY_PRESET } from './spaceColonization.js'
import { buildPreviewAtlas, previewDir } from './salon-preview-atlas.js'
import { computeCoverage } from './roster-coverage.js'
import { salonOptionsForSpecies } from './salon-options.js'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const PUBLIC_TREES = join(ROOT, 'public', 'trees')
const STATE_DIR    = join(__dirname, 'state')
const CACHE_DIR    = join(__dirname, '_cache')
const PREVIEW_DIR  = join(CACHE_DIR, 'preview')
const VENV_PYTHON  = join(__dirname, '.venv', 'bin', 'python')
const PREVIEW_PY   = join(__dirname, 'preview-laz.py')
const SPECIES_MAP  = join(__dirname, 'species-map.json')
const ROSTER_CANON = join(__dirname, 'roster-name-canon.json')
const CONFIG_PATH  = join(__dirname, 'config.json')
const PORT = Number(process.env.ARB_PORT) || 3334

// ── The closed silhouette set (chassis-tagging gauntlet) ───────────────────
// The 9 chassis SILHOUETTES — a finite, complete, closed botanical crown-form
// set, mirroring rubric.json's chassis.habit value-list. A chassis is pure
// woody structure, so its ONE meaningful classification is its silhouette (a
// fact, assigned once — "categorize, don't recommend"). Leaf-shape and
// bark-type are SEPARATE part libraries, not properties of a chassis, so they
// are deliberately NOT tagged here. The POST /salon/curation validator rejects
// off-set values so the shelves stay honest.
const CHASSIS_HABITS = new Set(['vase', 'columnar', 'oval', 'spreading', 'weeping', 'multi-stem', 'pyramidal', 'rounded', 'irregular'])

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
// Re-read species-map.json per request — operator-edits during dev (adding
// a species, tweaking a tint) shouldn't require a server restart.
function readSpeciesDecl() {
  return readJsonOrNull(SPECIES_MAP)?.species || {}
}
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

// Scan public/trees/*/manifest.json so both LiDAR and GLB ingest paths
// surface here — the Arborist UI is source-agnostic. Then merge with
// species-map.json declarations so undeclared-but-baked and
// declared-but-not-yet-baked species both appear in the library.
function scanBakedManifests() {
  const out = new Map()
  let entries = []
  try { entries = readdirSync(PUBLIC_TREES, { withFileTypes: true }) } catch {}
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const manifestPath = join(PUBLIC_TREES, ent.name, 'manifest.json')
    const m = readJsonOrNull(manifestPath)
    if (!m) continue
    out.set(ent.name, m)
  }
  return out
}

// NO-FILLER: procedural + generic placeholders never appear in the Grove or the
// runtime pool (mirrors build-index.js). Same doctrine, applied to the gallery.
const isFillerSpecies = (id) => /procedural|^generic_|_rt\d+/i.test(String(id))

// ELIGIBLE = the species has an AUTHORED COMPOSITION (≥1 slot with a chassis).
// The Grove's membership gate per the 2026-06-20 "Grove → Slab" decision
// (README §"The Grove → Slab"): "Grove membership = eligible + approved". The old
// `quality ≥ 2` gate was meant to collapse into this and never fully did, so
// stale/raw vendor publishes (uncomposed conifers, `platanus_acerifolia`,
// group-mix packs, botanical-id duplicates like `nyssa_sylvatica` alongside the
// composed `blackgum`) leaked into the gallery. Composed-only clears the wreck.
const hasComposition = (id) => {
  const data = readJsonOrNull(join(STATE_DIR, id, 'compositions.json'))
  return Array.isArray(data?.compositions) && data.compositions.some(c => c && c.chassis)
}

function listSpecies() {
  const baked = scanBakedManifests()
  const SPECIES_DECL = readSpeciesDecl()
  const out = []
  const seen = new Set()
  // Declared species first (preserves species-map ordering).
  for (const [id, decl] of Object.entries(SPECIES_DECL)) {
    const seedlings = readJsonOrNull(join(STATE_DIR, id, 'seedlings.json'))
    const seedlingCount = Array.isArray(seedlings?.seedlings)
      ? seedlings.seedlings.length : 0
    const m = baked.get(id)
    out.push({
      id,
      label:        m?.displayName || decl.label,
      scientific:   decl.scientific,
      source:       decl.source || m?.source || 'lidar',
      forSpeciesName: decl.forSpeciesName || null,
      heroSpecies:  decl.heroSpecies || null,
      tier:         decl.tier,
      leafMorph:    decl.leafMorph,
      barkMorph:    decl.barkMorph,
      deciduous:    decl.deciduous,
      hasFlowers:   decl.hasFlowers,
      seedlingsPicked: seedlingCount,
      variants:     m?.variants?.length || 0,
      bakedAt:      m?.bakedAt || null,
    })
    seen.add(id)
  }
  // Baked-but-undeclared species (e.g. a quick GLB publish before adding to species-map).
  for (const [id, m] of baked) {
    if (seen.has(id)) continue
    out.push({
      id,
      label:        m.displayName || m.label || id,
      scientific:   m.scientific || null,
      source:       m.source || 'lidar',
      tier:         m.tier || null,
      leafMorph:    m.leafMorph || null,
      barkMorph:    m.barkMorph || null,
      deciduous:    m.deciduous ?? true,
      hasFlowers:   m.hasFlowers ?? false,
      seedlingsPicked: 0,
      variants:     m.variants?.length || 0,
      bakedAt:      m.bakedAt || null,
    })
  }
  // Alphabetical by display label so the library order matches the
  // Workstage prev/next arrow-key navigation.
  out.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id))
  return out
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  let m

  try {
    // GET /species — declared + baked merged. Strip query string to allow
    // cache-busting (?t=...) without breaking the exact-URL match.
    const path = (req.url || '').split('?')[0]
    if (req.method === 'GET' && path === '/species') {
      return jsonRes(res, 200, { species: listSpecies() })
    }

    // GET /grove — published Salon compositions across the library,
    // flattened. Used by the Arborist Grove view to render every published
    // composition side-by-side so the operator can spot the duds. Includes
    // the `excluded` flag so the view can show kill-switched variants too.
    // (Distinct from the Stage app downstream, which consumes published
    // trees rather than producing them.)
    if (req.method === 'GET' && path === '/grove') {
      const baked = scanBakedManifests()
      const variants = []
      for (const [speciesId, m] of baked) {
        if (isFillerSpecies(speciesId)) continue   // no procedural/generic fillers
        if (!hasComposition(speciesId)) continue   // ELIGIBLE = composed only (README §Grove → Slab)
        if (m.source !== 'glb' || !Array.isArray(m.variants)) continue
        const speciesLabel = m.displayName || m.label || speciesId
        const speciesCategory = m.category || null
        for (const v of m.variants) {
          const quality = v.qualityOverride ?? v.quality ?? 0
          // Published-not-raw-chassis gate (Brief 27): publish stamps
          // `qualityOverride: 4` (generate-salon#patchManifestForSalon),
          // so this keeps raw INGESTED vendor chassis (quality 0, never
          // composed) out of the Grove. NOT a Fill/Mid/Hero rating gate —
          // Grove visibility is published-and-in-roster, never a rating the
          // operator must set. (A future explicit `v.published` marker would
          // decouple this from the rating *value*; deferred — Brief 27.)
          if (quality < 2) continue
          // Grove is the cosmetic confirmation gallery (one tree per species,
          // not 745 placements) → render the full-quality lod0 canopy. The
          // bark smooth-weld keeps lod0 light enough for a per-species gallery;
          // if a heavy holdout (e.g. linden) OOMs the Grove, fall back to lod1
          // (now full-leaved again — see publish-glb.js LODS, 2026-06-24).
          const lod = v.skeletons?.lod0 || v.skeletons?.lod1 || v.skeletons?.lod2
          if (!lod) continue
          variants.push({
            speciesId,
            speciesLabel,
            variantId: v.id,
            quality,
            excluded: v.excluded === true,
            category: v.categoryOverride ?? v.category ?? speciesCategory,
            styles: v.stylesOverride ?? v.styles ?? [],
            normalizeScale: v.scaleOverride ?? v.normalizeScale ?? 1,
            approxHeightM: v.approxHeightM ?? null,
            position: v.positionOverride ?? null,
            rotation: v.rotationOverride ?? null,
            operatorNotes: v.operatorNotes || '',
            glbUrl: `/trees/${speciesId}/${lod}?v=${m.bakedAt || 0}`,
            sourceName: v.sourceName || null,
          })
        }
      }
      return jsonRes(res, 200, { variants, count: variants.length })
    }

    // GET /species/:id — manifest from public/trees (404 until baked).
    // `[^/?]+` so a `?t=...` cache-buster doesn't get sucked into the id capture.
    if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/?]+)(?:\?.*)?$/))) {
      const manifestPath = join(PUBLIC_TREES, m[1], 'manifest.json')
      const manifest = readJsonOrNull(manifestPath)
      if (!manifest) return jsonRes(res, 404, { error: 'not yet baked', species: m[1] })
      return jsonRes(res, 200, manifest)
    }

    // GET /species/:id/specimens — candidates from FOR-species20K + recommended flags
    if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)\/specimens$/))) {
      const id = m[1]
      const decl = readSpeciesDecl()[id]
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
    if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/?]+)\/seedlings(?:\?.*)?$/))) {
      const id = m[1]
      const data = readJsonOrNull(join(STATE_DIR, id, 'seedlings.json'))
      if (!data) return jsonRes(res, 404, { error: 'no seedlings picked yet', species: id })
      return jsonRes(res, 200, data)
    }

    // POST /species/:id/seedlings — save the species's curation state.
    // Body shape: { starred: string[], seedlings: [...], displayNames?: {treeId: name} }
    //   starred       — free operator notes (UI only, no system action)
    //   seedlings     — the "checked" set; bake-tree.py reads only this field.
    //   displayNames  — Phase L Cycle 1 (2026-05-19): operator-given labels
    //                   per treeId. Preserved across POSTs that omit them so
    //                   the LidarWorkstage and Scan Workstage can each save
    //                   their slice without trampling the other's edits.
    // Each field is optional; missing means empty (or — for displayNames —
    // preserves the on-disk value).
    if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/seedlings$/))) {
      const id = m[1]
      if (!readSpeciesDecl()[id]) return jsonRes(res, 404, { error: 'unknown species', id })
      const body = await readBody(req)
      const seedlingsPath = join(STATE_DIR, id, 'seedlings.json')
      const existing = readJsonOrNull(seedlingsPath) || {}
      const starred = Array.isArray(body.starred) ? body.starred : []
      const seedlings = Array.isArray(body.seedlings) ? body.seedlings : []
      // Merge displayNames: incoming wins per-key; `null` clears; absent keys
      // inherit on-disk value. Per [[feedback_absence_means_inherit_in_authored_blocks]].
      const displayNames = { ...(existing.displayNames || {}) }
      if (body.displayNames && typeof body.displayNames === 'object') {
        for (const [k, v] of Object.entries(body.displayNames)) {
          if (v === null || v === '') delete displayNames[k]
          else displayNames[k] = String(v)
        }
      }
      writeJson(seedlingsPath, {
        species: id,
        starred,
        seedlings,
        displayNames,
        savedAt: Date.now(),
      })
      return jsonRes(res, 200, { ok: true, starred: starred.length, picked: seedlings.length,
        displayNames: Object.keys(displayNames).length })
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

    // POST /species/:id/bake — exec bake-tree.py for one species. Synchronous;
    // the Workstage shows a modal during the round-trip. Bakes are infrequent
    // (operator action) and bounded (~10s for 3 seedlings on a Mac).
    if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/bake$/))) {
      const id = m[1]
      if (!readSpeciesDecl()[id]) return jsonRes(res, 404, { error: 'unknown species', id })
      const seedlingsPath = join(STATE_DIR, id, 'seedlings.json')
      if (!existsSync(seedlingsPath)) {
        return jsonRes(res, 400, { error: 'no seedlings picked yet — pick some in the workstage first', id })
      }
      const t0 = Date.now()
      try {
        const bake = join(__dirname, 'bake-tree.py')
        const { stdout, stderr } = await execAsync(VENV_PYTHON, [bake, `--species=${id}`])
        const ms = Date.now() - t0
        return jsonRes(res, 200, { ok: true, ms, species: id, log: stdout })
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'bake failed',
          species: id,
          stderr: String(err.stderr || err.message).slice(0, 8000),
          stdout: String(err.stdout || '').slice(0, 4000),
        })
      }
    }

    // GET /lidar/specimen/:treeId/seedling-state?species=<id>
    // Phase L Cycle 1 (2026-05-19). Returns the operator-tuned extraction
    // params for one specimen + its display name. Reads from
    // arborist/state/<species>/seedlings.json with a fall-through to
    // config.tuneDefaults when the specimen hasn't been saved yet. Used by
    // LidarWorkstage to pre-populate the extraction tuner + name field.
    if (req.method === 'GET' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/seedling-state(\?.*)?$/))) {
      const treeId = m[1]
      const species = new URL(req.url, 'http://x').searchParams.get('species')
      if (!species) return jsonRes(res, 400, { error: 'missing ?species=<id>' })
      if (!readSpeciesDecl()[species]) return jsonRes(res, 404, { error: 'unknown species', species })
      const seedlings = readJsonOrNull(join(STATE_DIR, species, 'seedlings.json')) || {}
      const list = Array.isArray(seedlings.seedlings) ? seedlings.seedlings : []
      const hit = list.find(s => String(s.treeId) === String(treeId))
      const defaults = CONFIG.tuneDefaults || { voxelSize: 0.03, minRadius: 0.005, tipRadius: 0.02 }
      const tune = (hit && hit.tuneParams) ? hit.tuneParams : defaults
      const displayName = seedlings.displayNames?.[treeId] || null
      return jsonRes(res, 200, {
        treeId,
        species,
        saved: !!hit,
        displayName,
        extractionParams: {
          voxelSize: Number(tune.voxelSize ?? defaults.voxelSize),
          minRadius: Number(tune.minRadius ?? defaults.minRadius),
          tipRadius: Number(tune.tipRadius ?? defaults.tipRadius),
        },
      })
    }

    // POST /lidar/specimen/:treeId/extract
    // Phase L Cycle 1 (2026-05-19). Body { species, voxelSize, minRadius,
    // tipRadius }. Runs lidar_extract.py against the specimen .laz and
    // returns the node graph (nodes: [{x,y,z,radius,parentIdx}, ...]). No
    // GLB write; this is for live tuning in the LidarWorkstage. The bake
    // step (POST /species/:id/bake) still runs bake-tree.py for the full
    // mesh + tips + manifest emission.
    if (req.method === 'POST' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/extract$/))) {
      const treeId = m[1]
      const body = await readBody(req)
      const species = body.species
      if (species && !readSpeciesDecl()[species]) {
        return jsonRes(res, 404, { error: 'unknown species', species })
      }
      const lazPath = specimenLazPath(treeId)
      if (!existsSync(lazPath)) {
        return jsonRes(res, 404, { error: 'specimen not on disk', treeId, lazPath })
      }
      const defaults = CONFIG.tuneDefaults || { voxelSize: 0.03, minRadius: 0.005, tipRadius: 0.02 }
      const voxelSize = Number(body.voxelSize ?? defaults.voxelSize)
      const minRadius = Number(body.minRadius ?? defaults.minRadius)
      const tipRadius = Number(body.tipRadius ?? defaults.tipRadius)
      const t0 = Date.now()
      try {
        const extract = join(__dirname, 'lidar_extract.py')
        const { stdout } = await execAsync(VENV_PYTHON, [
          extract,
          `--treeId=${treeId}`,
          `--voxelSize=${voxelSize}`,
          `--minRadius=${minRadius}`,
          `--tipRadius=${tipRadius}`,
        ])
        const result = JSON.parse(stdout)
        result.serverMs = Date.now() - t0
        return jsonRes(res, 200, result)
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'extract failed',
          treeId,
          stderr: String(err.stderr || err.message).slice(0, 4000),
          stdout: String(err.stdout || '').slice(0, 1000),
        })
      }
    }

    // POST /lidar/specimen/:treeId/bidirectional-extract
    // Phase N.1 (2026-05-19). Body { species, voxelSize, kNearest, viewCount,
    // minRadius }. Shells bidirectional_skeleton.py — Strategy A geodesic
    // Dijkstra over a density-weighted KNN graph. Same JSON shape as
    // /extract so the LidarWorkstage's cylinder renderer can render either
    // algorithm interchangeably (source Z-up frame; load-time Z→Y at the JS
    // overlay layer). No GLB write, no manifest change; spike-only surface.
    if (req.method === 'POST' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/bidirectional-extract$/))) {
      const treeId = m[1]
      const body = await readBody(req)
      const species = body.species
      if (species && !readSpeciesDecl()[species]) {
        return jsonRes(res, 404, { error: 'unknown species', species })
      }
      const lazPath = specimenLazPath(treeId)
      if (!existsSync(lazPath)) {
        return jsonRes(res, 404, { error: 'specimen not on disk', treeId, lazPath })
      }
      const voxelSize = Number(body.voxelSize ?? 0.05)
      const kNearest  = Number(body.kNearest  ?? 20)
      const viewCount = Number(body.viewCount ?? 12)
      const minRadius = Number(body.minRadius ?? 0.005)
      const t0 = Date.now()
      try {
        const script = join(__dirname, 'bidirectional_skeleton.py')
        const { stdout } = await execAsync(VENV_PYTHON, [
          script,
          `--treeId=${treeId}`,
          `--voxelSize=${voxelSize}`,
          `--kNearest=${kNearest}`,
          `--viewCount=${viewCount}`,
          `--minRadius=${minRadius}`,
        ])
        const result = JSON.parse(stdout)
        result.serverMs = Date.now() - t0
        return jsonRes(res, 200, result)
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'bidirectional-extract failed',
          treeId,
          stderr: String(err.stderr || err.message).slice(0, 4000),
          stdout: String(err.stdout || '').slice(0, 1000),
        })
      }
    }

    // POST /lidar/specimen/:treeId/lil-vera-extract
    // Project: Li'l Vera, Stage N.2.0 (2026-05-20, Tycho). Body {
    //   species, N, kOrient, pitch, voxelSize, imageW?, imageH?,
    //   splatRadius?, workers? }. Shells lil_vera.py — Posture-B
    // observational skeleton apparatus (rendered-pixel-only extraction).
    // Same {x,y,z,radius,parentIdx} JSON shape; CylinderSkeleton renders
    // unchanged. Disk-persisted to arborist/state/lil-vera/<treeId>/run-*.json
    // by the CLI itself; HTTP response includes savedTo for the operator.
    // maxBuffer bumped to 64MB since N=500 overnight runs can exceed 8MB.
    if (req.method === 'POST' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/lil-vera-extract$/))) {
      const treeId = m[1]
      const body = await readBody(req)
      const species = body.species
      if (species && !readSpeciesDecl()[species]) {
        return jsonRes(res, 404, { error: 'unknown species', species })
      }
      const lazPath = specimenLazPath(treeId)
      if (!existsSync(lazPath)) {
        return jsonRes(res, 404, { error: 'specimen not on disk', treeId, lazPath })
      }
      const N         = Number(body.N         ?? 50)
      const kOrient   = Number(body.kOrient   ?? 200)
      const pitch     = Number(body.pitch     ?? 0.3)
      const voxelSize = Number(body.voxelSize ?? 0.03)
      const imageW    = Number(body.imageW    ?? 384)
      const imageH    = Number(body.imageH    ?? 288)
      const splatRad  = Number(body.splatRadius ?? 1)
      const consolVox = Number(body.consolidationVoxel ?? 0.05)
      const passes    = Number(body.passes    ?? 1)
      const workers   = Number(body.workers   ?? 0)
      const t0 = Date.now()
      try {
        const script = join(__dirname, 'lil_vera.py')
        const { stdout } = await new Promise((resolve, reject) => {
          execFile(VENV_PYTHON, [
            script,
            `--treeId=${treeId}`,
            `--N=${N}`,
            `--kOrient=${kOrient}`,
            `--pitch=${pitch}`,
            `--voxelSize=${voxelSize}`,
            `--imageW=${imageW}`,
            `--imageH=${imageH}`,
            `--splatRadius=${splatRad}`,
            `--consolidationVoxel=${consolVox}`,
            `--passes=${passes}`,
            `--workers=${workers}`,
          ], { maxBuffer: 64 * 1024 * 1024 }, (err, so, se) => {
            if (err) { err.stdout = so; err.stderr = se; return reject(err) }
            resolve({ stdout: so, stderr: se })
          })
        })
        const result = JSON.parse(stdout)
        result.serverMs = Date.now() - t0
        return jsonRes(res, 200, result)
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'lil-vera-extract failed',
          treeId,
          stderr: String(err.stderr || err.message).slice(0, 4000),
          stdout: String(err.stdout || '').slice(0, 1000),
        })
      }
    }

    // GET /lidar/specimen/:treeId/lil-vera-runs
    // List saved Li'l Vera runs for this specimen (newest first). Used by
    // the Saved Runs picker so the operator can browse past overnight runs.
    // Optional ?t= cache-buster appended by the frontend; tolerated by the
    // regex (same pattern as commit 182bd54's /species/:id fix).
    if (req.method === 'GET' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/lil-vera-runs(\?.*)?$/))) {
      const treeId = m[1]
      const dir = join(STATE_DIR, 'lil-vera', treeId)
      if (!existsSync(dir)) return jsonRes(res, 200, { treeId, runs: [] })
      const runs = []
      for (const fname of readdirSync(dir)) {
        if (!fname.endsWith('.json')) continue
        try {
          const fp = join(dir, fname)
          const st = statSync(fp)
          // Lightweight peek — load and strip nodes for the index response.
          const parsed = readJsonOrNull(fp)
          if (!parsed) continue
          runs.push({
            filename: fname,
            mtime: st.mtimeMs,
            sizeBytes: st.size,
            stage: parsed.hyperparams?.stage,
            N: parsed.hyperparams?.N,
            nodes: parsed.stats?.nodes,
            cylinders: parsed.stats?.cylinders,
            elapsedMs: parsed.stats?.elapsedMs,
          })
        } catch { /* skip unreadable */ }
      }
      runs.sort((a, b) => b.mtime - a.mtime)
      return jsonRes(res, 200, { treeId, runs })
    }

    // GET /lidar/specimen/:treeId/lil-vera-run/:filename
    // Load a specific saved run by filename.
    if (req.method === 'GET' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/lil-vera-run\/([^/?]+)(\?.*)?$/))) {
      const treeId = m[1]
      const filename = m[2]
      if (!/^run-[0-9A-Za-z._-]+\.json$/.test(filename)) {
        return jsonRes(res, 400, { error: 'invalid filename', filename })
      }
      const fp = join(STATE_DIR, 'lil-vera', treeId, filename)
      if (!existsSync(fp)) return jsonRes(res, 404, { error: 'run not found', treeId, filename })
      const parsed = readJsonOrNull(fp)
      if (!parsed) return jsonRes(res, 500, { error: 'unreadable run file' })
      return jsonRes(res, 200, parsed)
    }

    // POST /lidar/specimen/:treeId/lil-vera-v2-extract
    // Project: Li'l Vera Cycle 1 rev. 2, Stage N.3.0 (2026-05-20, Penzias).
    // Body { species, N, kOrient, pitch, voxelSize?, consolidationVoxel?,
    //   imageW?, imageH?, splatRadius?, seed?, tipGeometricMin?,
    //   tipElongationMin?, tauTipPrior?, tipNeighborhoodRadius?,
    //   minNbhdCount?, workers? }. Shells lil_vera_v2.py — Posture-B
    // observational skeleton apparatus conditioned on species priors.
    // Output is per-candidate classification + tipAnchors + diagnostics
    // (NOT the cylinder-graph shape; the 6th alignment-oracle layer
    // renders candidates as priors-coloured dots + tip anchors as orange-
    // gold spheres). Disk-persisted to
    // arborist/state/lil-vera-v2/<treeId>/run-*.json by the CLI; HTTP
    // response includes savedTo for the operator. v1 endpoints
    // (/lil-vera-extract) remain untouched.
    if (req.method === 'POST' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/lil-vera-v2-extract$/))) {
      const treeId = m[1]
      const body = await readBody(req)
      const species = body.species
      if (!species) return jsonRes(res, 400, { error: 'missing species in body' })
      if (!readSpeciesDecl()[species]) {
        return jsonRes(res, 404, { error: 'unknown species', species })
      }
      const lazPath = specimenLazPath(treeId)
      if (!existsSync(lazPath)) {
        return jsonRes(res, 404, { error: 'specimen not on disk', treeId, lazPath })
      }
      const N         = Number(body.N         ?? 50)
      const kOrient   = Number(body.kOrient   ?? 200)
      const pitch     = Number(body.pitch     ?? 0.3)
      const voxelSize = Number(body.voxelSize ?? 0.03)
      const consolVox = Number(body.consolidationVoxel ?? 0.05)
      const imageW    = Number(body.imageW    ?? 384)
      const imageH    = Number(body.imageH    ?? 288)
      const splatRad  = Number(body.splatRadius ?? 1)
      const seed      = Number(body.seed      ?? 42)
      const tipGeoMin = Number(body.tipGeometricMin       ?? 0.12)
      const tipElong  = Number(body.tipElongationMin      ?? 2.5)
      const tauTip    = Number(body.tauTipPrior           ?? 0.5)
      const tipNbR    = Number(body.tipNeighborhoodRadius ?? 0.25)
      const minNbhd   = Number(body.minNbhdCount          ?? 6)
      const workers   = Number(body.workers   ?? 0)
      const t0 = Date.now()
      try {
        const script = join(__dirname, 'lil_vera_v2.py')
        const { stdout } = await new Promise((resolve, reject) => {
          execFile(VENV_PYTHON, [
            script,
            `--treeId=${treeId}`,
            `--species=${species}`,
            `--N=${N}`,
            `--seed=${seed}`,
            `--kOrient=${kOrient}`,
            `--pitch=${pitch}`,
            `--voxelSize=${voxelSize}`,
            `--consolidationVoxel=${consolVox}`,
            `--imageW=${imageW}`,
            `--imageH=${imageH}`,
            `--splatRadius=${splatRad}`,
            `--tipGeometricMin=${tipGeoMin}`,
            `--tipElongationMin=${tipElong}`,
            `--tauTipPrior=${tauTip}`,
            `--tipNeighborhoodRadius=${tipNbR}`,
            `--minNbhdCount=${minNbhd}`,
            `--workers=${workers}`,
          ], { maxBuffer: 128 * 1024 * 1024 }, (err, so, se) => {
            if (err) { err.stdout = so; err.stderr = se; return reject(err) }
            resolve({ stdout: so, stderr: se })
          })
        })
        const result = JSON.parse(stdout)
        result.serverMs = Date.now() - t0
        return jsonRes(res, 200, result)
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'lil-vera-v2-extract failed',
          treeId,
          stderr: String(err.stderr || err.message).slice(0, 4000),
          stdout: String(err.stdout || '').slice(0, 1000),
        })
      }
    }

    // GET /lidar/specimen/:treeId/lil-vera-v2-runs
    // List saved Li'l Vera v2 runs for this specimen (newest first).
    if (req.method === 'GET' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/lil-vera-v2-runs(\?.*)?$/))) {
      const treeId = m[1]
      const dir = join(STATE_DIR, 'lil-vera-v2', treeId)
      if (!existsSync(dir)) return jsonRes(res, 200, { treeId, runs: [] })
      const runs = []
      for (const fname of readdirSync(dir)) {
        if (!fname.endsWith('.json')) continue
        try {
          const fp = join(dir, fname)
          const st = statSync(fp)
          const parsed = readJsonOrNull(fp)
          if (!parsed) continue
          runs.push({
            filename: fname,
            mtime: st.mtimeMs,
            sizeBytes: st.size,
            stage: parsed.hyperparams?.stage,
            N: parsed.hyperparams?.N,
            speciesId: parsed.speciesId,
            candidates: parsed.stats?.candidates,
            tipAnchorCount: parsed.stats?.tipAnchorCount,
            elapsedMs: parsed.stats?.elapsedMs,
          })
        } catch { /* skip unreadable */ }
      }
      runs.sort((a, b) => b.mtime - a.mtime)
      return jsonRes(res, 200, { treeId, runs })
    }

    // GET /lidar/specimen/:treeId/lil-vera-v2-run/:filename
    if (req.method === 'GET' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/lil-vera-v2-run\/([^/?]+)(\?.*)?$/))) {
      const treeId = m[1]
      const filename = m[2]
      if (!/^run-[0-9A-Za-z._-]+\.json$/.test(filename)) {
        return jsonRes(res, 400, { error: 'invalid filename', filename })
      }
      const fp = join(STATE_DIR, 'lil-vera-v2', treeId, filename)
      if (!existsSync(fp)) return jsonRes(res, 404, { error: 'run not found', treeId, filename })
      const parsed = readJsonOrNull(fp)
      if (!parsed) return jsonRes(res, 500, { error: 'unreadable run file' })
      return jsonRes(res, 200, parsed)
    }

    // POST /lidar/specimen/:treeId/publish
    // Phase L Cycle 2 (2026-05-19). Body { species, lookId?, tuneParams?, displayName? }.
    // AWAITED, NOT FIRE-AND-FORGET (per brief). End-to-end pipeline:
    //   1. Persist seedling + tuneParams via existing seedlings POST shape
    //   2. Shell bake-tree.py → emits skeleton-N.glb under public/trees/<heroSpecies>/
    //   3. Shell lidar-publish.js → splits into lod0/1/2 + promotes manifest schema
    //   4. Ensure hero species appears in active Look's design.json#/trees roster
    //   5. Run bake-look(lookId) → atlas + barkBySpecies regenerated
    // Returns timings. Operator-facing acceptance: a Publish click ends with the
    // trees-atlas.json updated mtime + the hero species visible in barkBySpecies.
    if (req.method === 'POST' && (m = req.url.match(/^\/lidar\/specimen\/([^/]+)\/publish$/))) {
      const treeId = m[1]
      const body = await readBody(req)
      const species = body.species
      const lookId = body.lookId || null
      if (!species) return jsonRes(res, 400, { error: 'missing species in body' })
      const decl = readSpeciesDecl()[species]
      if (!decl) return jsonRes(res, 404, { error: 'unknown species', species })
      const heroSpecies = decl.heroSpecies || species
      const lazPath = specimenLazPath(treeId)
      if (!existsSync(lazPath)) return jsonRes(res, 404, { error: 'specimen not on disk', treeId, lazPath })

      const timings = {}
      try {
        // (1) Persist seedling (merge into existing seedlings.json).
        const seedlingsPath = join(STATE_DIR, species, 'seedlings.json')
        const existing = readJsonOrNull(seedlingsPath) || { species, starred: [], seedlings: [], displayNames: {} }
        const list = Array.isArray(existing.seedlings) ? existing.seedlings : []
        const defaults = CONFIG.tuneDefaults || { voxelSize: 0.03, minRadius: 0.005, tipRadius: 0.02 }
        const incomingTune = body.tuneParams || {}
        const tune = {
          voxelSize: Number(incomingTune.voxelSize ?? defaults.voxelSize),
          minRadius: Number(incomingTune.minRadius ?? defaults.minRadius),
          tipRadius: Number(incomingTune.tipRadius ?? defaults.tipRadius),
        }
        if (incomingTune.regionThreshold != null) tune.regionThreshold = Number(incomingTune.regionThreshold)
        const hitIdx = list.findIndex(s => String(s.treeId) === String(treeId))
        const nextList = hitIdx >= 0
          ? list.map((s, i) => i === hitIdx ? { ...s, tuneParams: tune } : s)
          : [...list, {
              id: (list.length ? Math.max(...list.map(s => s.id || 0)) : 0) + 1,
              treeId: String(treeId),
              tuneParams: tune,
            }]
        const starredSet = new Set([...(existing.starred || []).map(String), String(treeId)])
        const nextDisplayNames = { ...(existing.displayNames || {}) }
        if (body.displayName != null) {
          if (body.displayName === '') delete nextDisplayNames[treeId]
          else nextDisplayNames[treeId] = body.displayName
        }
        writeJson(seedlingsPath, {
          species,
          starred: [...starredSet],
          seedlings: nextList,
          displayNames: nextDisplayNames,
          savedAt: Date.now(),
        })

        // (2) Run bake-tree.py (awaited).
        const t0 = Date.now()
        const bake = join(__dirname, 'bake-tree.py')
        const { stdout: bakeStdout, stderr: bakeStderr } = await execAsync(VENV_PYTHON, [bake, `--species=${species}`])
        timings.bakeMs = Date.now() - t0

        // (3) LOD pass + manifest schema promotion (awaited).
        const t1 = Date.now()
        await publishLidarSpecies(heroSpecies)
        timings.lodMs = Date.now() - t1

        // (4) Ensure hero species variant(s) appear in active Look's roster.
        let rosterMutated = false
        if (lookId) {
          const designPath = join(ROOT, 'public', 'looks', lookId, 'design.json')
          const design = readJsonOrNull(designPath)
          if (design) {
            const trees = Array.isArray(design.trees) ? design.trees : []
            const heroManifest = readJsonOrNull(join(PUBLIC_TREES, heroSpecies, 'manifest.json'))
            const heroVariants = Array.isArray(heroManifest?.variants) ? heroManifest.variants : []
            const next = [...trees]
            for (const v of heroVariants) {
              const has = next.some(t => t.species === heroSpecies && t.variantId === v.id)
              if (!has) {
                next.push({ species: heroSpecies, variantId: v.id })
                rosterMutated = true
              }
            }
            if (rosterMutated) {
              writeJson(designPath, { ...design, trees: next })
            }
          }
        }

        // (5) bake-look AWAITED (not fire-and-forget).
        let bakeLookResult = null
        if (lookId) {
          const t2 = Date.now()
          bakeLookResult = await bakeLook(lookId, { viz: false })
          timings.bakeLookMs = Date.now() - t2
        }

        // (6) bake-trees AWAITED — rebuilds placement substitution into
        // public/baked/lafayette-square/trees.json, which InstancedTrees fetches
        // at runtime. Without this the 88 Sugar Maple placements stay on the old
        // variant. LS-only by design (the Salon publishes into LS's census);
        // named through the helper so the scene axis is explicit and this file's
        // output matches the Grove bake's byte-for-byte.
        const t3 = Date.now()
        const { bakeTrees } = await import('./bake-trees.js')
        const { inputs: _lsInputs, ...lsBakeArgs } = treeBakeInputsForScene(DEFAULT_SCENE)
        await bakeTrees({ ...lsBakeArgs })
        timings.bakeTreesMs = Date.now() - t3

        return jsonRes(res, 200, {
          ok: true,
          species,
          heroSpecies,
          treeId,
          lookId,
          rosterMutated,
          timings,
          bakeLog: bakeStdout?.slice(-2000) || '',
          bakeLook: bakeLookResult,
        })
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'publish failed',
          species, treeId, lookId,
          stderr: String(err.stderr || err.message || err).slice(0, 4000),
          stdout: String(err.stdout || '').slice(0, 2000),
          timings,
        })
      }
    }

    // POST /species/:id/overrides
    // Body: subset of { displayName, displayNotes }
    // Updates manifest-level operator fields on the species (not variant).
    // Pass `null` to clear. Rebuilds index.json afterward.
    if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/overrides$/))) {
      const id = m[1]
      const manifestPath = join(PUBLIC_TREES, id, 'manifest.json')
      if (!existsSync(manifestPath)) return jsonRes(res, 404, { error: 'no manifest', species: id })
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      const body = await readBody(req)
      for (const k of ['displayName', 'displayNotes']) {
        if (!(k in body)) continue
        if (body[k] === null) delete manifest[k]
        else manifest[k] = body[k]
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      try {
        const { rebuildIndex } = await import('./build-index.js')
        await rebuildIndex()
      } catch (e) {
        console.warn('[arborist] index rebuild failed:', e.message)
      }
      return jsonRes(res, 200, { ok: true, manifest })
    }

    // POST /species/:id/variants/:variantId/overrides
    // Body: any subset of { qualityOverride, stylesOverride, scaleOverride,
    //   categoryOverride, excluded, operatorNotes }. Pass `null` to clear.
    // Updates the variant in public/trees/:id/manifest.json + rebuilds
    // public/trees/index.json so the runtime picker sees the change.
    if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/variants\/([^/]+)\/overrides$/))) {
      const id = m[1]
      const variantId = parseInt(m[2], 10)
      const manifestPath = join(PUBLIC_TREES, id, 'manifest.json')
      if (!existsSync(manifestPath)) return jsonRes(res, 404, { error: 'no manifest', species: id })
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      const variant = manifest.variants?.find(v => v.id === variantId)
      if (!variant) return jsonRes(res, 404, { error: 'no such variant', species: id, variantId })
      const body = await readBody(req)
      const fields = ['qualityOverride', 'stylesOverride', 'scaleOverride', 'categoryOverride', 'positionOverride', 'rotationOverride', 'excluded', 'operatorNotes']
      for (const k of fields) {
        if (!(k in body)) continue
        if (body[k] === null) delete variant[k]
        else variant[k] = body[k]
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      try {
        const { rebuildIndex } = await import('./build-index.js')
        await rebuildIndex()
      } catch (e) {
        console.warn('[arborist] index rebuild failed:', e.message)
      }
      try {
        const { bakeTrees } = await import('./bake-trees.js')
        // Re-bake LS's placements so the cartograph reflects the new rating.
        // LS-only by design; scene named explicitly via the helper.
        const { inputs: _rateInputs, ...rateBakeArgs } = treeBakeInputsForScene(DEFAULT_SCENE)
        await bakeTrees({ ...rateBakeArgs })
      } catch (e) {
        console.warn('[arborist] bake failed:', e.message)
      }
      return jsonRes(res, 200, { ok: true, variant })
    }

    // DELETE /species/:id — placeholder
    if (req.method === 'DELETE' && (m = req.url.match(/^\/species\/([^/]+)$/))) {
      return notImplemented(res, 'DELETE /species/:id')
    }

    // GET /inventory — species histogram from LS's authored park census
    if (req.method === 'GET' && path === '/inventory') {
      const trees = readJsonOrNull(join(ROOT, 'cartograph', 'data', 'lafayette-square', 'clean', 'park_census.json'))?.trees || []
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

    // GET /coverage — roster-anchored "have vs need" join (Brief 24, Cadastre).
    // READ-ONLY. The join itself lives in `roster-coverage.js` (lifted into a
    // shared module for Brief 26, AC5). Each species row carries the Brief 24
    // diagnostic (coverage class / covering / routing) PLUS the Brief 26 fields
    // (canonicalId slug / recommendedChassis / authoringState). Writes nothing;
    // provenance derived on the fly (no persisted provenance field — Brief 25).
    // GET /coverage — roster-anchored "have vs need" join (the Grove's Coverage
    // view, CoverageView.jsx). Now carries the Forest Builder per-part readiness
    // (Chassis·Bark·Leaves, §8) for dossier-backed species, folded in by
    // computeCoverage via the matcher. READ-ONLY.
    if (req.method === 'GET' && path === '/coverage') {
      try {
        return jsonRes(res, 200, await computeCoverage())
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // POST /coverage/:rosterName/routing — the Brief 26 routing-map write. The
    // ONE write the roster-driven Salon makes to park_species_map.json (the
    // routing source of truth, roster-name → canonical id). Body:
    //   { canonicalId: "<slug>" }   → map[rosterName] = [canonicalId] (composed)
    //   { notAvailable: true }      → map[rosterName] = []  (deliberate gap)
    // `rosterName` is the CANONICAL roster name; the merge table's raw aliases
    // are mirrored to the same value so bake-trees#pickVariant routes every
    // placement. Preserves the file's _doc/_libraryAt + existing key order;
    // only the `map` object is mutated. (bake-trees honoring "" → no tree is a
    // separate bake-side follow-up — out of this brief's scope walls.)
    if (req.method === 'POST' && (m = path.match(/^\/coverage\/([^/]+)\/routing$/))) {
      const rosterName = decodeURIComponent(m[1])
      const body = await readBody(req)
      const mapPath = join(ROOT, 'cartograph', 'data', 'lafayette-square', 'tree-species-map.json')
      const doc = readJsonOrNull(mapPath)
      if (!doc || typeof doc.map !== 'object') {
        return jsonRes(res, 500, { error: 'tree-species-map.json unreadable' })
      }
      const canon = readJsonOrNull(ROSTER_CANON)?.canon || {}
      // Which raw names canonicalize to this roster name? Route them all to the
      // same value (so merged duplicates like "Oak, Pin (restricted use)" follow).
      const aliases = new Set([rosterName])
      for (const [raw, c] of Object.entries(canon)) if (c === rosterName) aliases.add(raw)
      let value
      if (body.notAvailable === true) value = []
      else if (typeof body.canonicalId === 'string' && body.canonicalId) value = [body.canonicalId]
      else return jsonRes(res, 400, { error: 'body needs {canonicalId} or {notAvailable:true}' })
      for (const name of aliases) doc.map[name] = value
      writeJson(mapPath, doc)
      return jsonRes(res, 200, { ok: true, rosterName, aliases: [...aliases], value })
    }

    // POST /atlas/bake?look=<name> — per-Look tree atlas + UV-rewritten GLBs.
    // Reads public/looks/<look>/design.json#/trees, writes outputs to
    // public/baked/<look>/. Empty roster = clean skip.
    if (req.method === 'POST' && path === '/atlas/bake') {
      const lookName = new URL(req.url, 'http://x').searchParams.get('look')
      if (!lookName) return jsonRes(res, 400, { error: 'missing ?look=<name>' })
      // Defensive: reject path traversal
      if (lookName.includes('/') || lookName.includes('..') || lookName.startsWith('.')) {
        return jsonRes(res, 400, { error: 'invalid look name' })
      }
      try {
        const result = await bakeLook(lookName)
        return jsonRes(res, result.ok ? 200 : 500, result)
      } catch (err) {
        return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
      }
    }

    // POST /grove/bake?look=<name> — the explicit Grove "ship-to-slab"
    // gesture. PHASE 1 (2026-06-23): regenerate-from-source FIRST so the bake
    // never ships stale GLBs — closes the "knobs work in the Salon but not the
    // Grove / LS / after a bake" gap (the long-queued finish of the
    // Grove→Slab 2026-06-20 decision: "the bake regenerates each composition
    // from its recipe + parts"). Order:
    //   1. generate-salon (no --species = ALL composed species; re-emits the
    //      published GLBs from compositions + parts: leaf size, bark, transform)
    //   2. bakeLook   — repack the master atlas from the FRESH published GLBs
    //   3. bakeTrees  — substitute placements
    // The slab is the contract — this is what LS renders. (/atlas/bake stays
    // atlas-only, for the per-toggle fire-and-forget auto-bake.)
    if (req.method === 'POST' && path === '/grove/bake') {
      const lookName = new URL(req.url, 'http://x').searchParams.get('look')
      if (!lookName) return jsonRes(res, 400, { error: 'missing ?look=<name>' })
      if (lookName.includes('/') || lookName.includes('..') || lookName.startsWith('.')) {
        return jsonRes(res, 400, { error: 'invalid look name' })
      }
      try {
        const t0 = Date.now()
        // 1. Regenerate every composed species from its recipe + parts so the
        //    GLBs the atlas repacks carry the current authored state. Mirrors
        //    the /salon/:id/publish shell, minus --species (= all species).
        const tRegen = Date.now()
        let regenLog = ''
        try {
          const { stdout } = await execAsync('node', [join(__dirname, 'generate-salon.js')])
          regenLog = String(stdout).slice(-2000)
          const { rebuildIndex } = await import('./build-index.js')
          await rebuildIndex()
        } catch (e) {
          return jsonRes(res, 500, {
            error: 'regenerate-from-source failed (generate-salon)',
            stderr: String(e.stderr || e.message).slice(0, 8000),
            stdout: String(e.stdout || '').slice(0, 4000),
          })
        }
        const regenMs = Date.now() - tRegen
        // 2. Atlas — the custom per-LOOK atlas. bake-look reads the LOOK's
        //    roster (public/looks/<look>/design.json#/trees) and repacks the
        //    master atlas + the UV-rewritten GLBs into baked/<look>/, which is
        //    exactly where the runtime fetches them. This step is Look-keyed and
        //    STAYS Look-keyed: under the target model the atlas is a
        //    neighbourhood fact, but moving where it lives is a contract change
        //    (Phase 3/4), not this fix.
        const atlas = await bakeLook(lookName, { viz: false })
        if (!atlas.ok) return jsonRes(res, 500, { error: 'bake-look failed', atlas })

        // 3. Placements — the OTHER axis. The census is the NEIGHBOURHOOD's, so
        //    it is resolved from the scene behind this Look, never from the Look
        //    itself. Passing the Look name as the scene is the bug this fixes: on
        //    LS it sent the census to the phantom baked/lafayette-square.json (a
        //    path nothing reads) while the atlas above landed correctly — which is
        //    why a Grove bake changed the tree MODELS but never the census.
        //    heroLook stays the Look: the hero ROLE per placement is read off the
        //    camera tracks, and tracks are authored per Look.
        const scene = sceneForLook(lookName)
        if (!scene) return jsonRes(res, 400, { error: `unknown look '${lookName}' — not in public/looks/index.json` })
        const treeInputs = treeBakeInputsForScene(scene)
        let placements
        if (!treeInputs) {
          // Honest zero: no census on disk for this neighbourhood. Skip rather
          // than bake LS's trees under someone else's name.
          placements = { skipped: true, reason: `no tree census on disk for scene '${scene}'` }
        } else {
          const { inputs: _dirtyInputs, ...bakeArgs } = treeInputs
          const { bakeTrees } = await import('./bake-trees.js')
          placements = await bakeTrees({ ...bakeArgs, lod: 'lod2', heroLook: lookName })
        }
        return jsonRes(res, 200, { ok: true, look: lookName, scene, regenMs, regenLog, atlas, placements, totalMs: Date.now() - t0 })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
      }
    }

    // ── Salon authoring (Brief 1, Sequoia 2026-05-21) ─────────────────
    //
    // Fourth top-level mode: chassis + bark + leaves composition.
    // Mirrors the procedural endpoint block's shape exactly. The species
    // path segment is informational (filters / labels); chassis / bark /
    // leaves listings are global filesystem reads under `_all` aliasing
    // or the species id (both routes accepted).

    // GET /salon/species — species filtered to "has chassis OR has compositions.json"
    if (req.method === 'GET' && path === '/salon/species') {
      try {
        return jsonRes(res, 200, { species: await listSalonSpecies() })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // GET /salon/:species/chassis — full chassis catalog. Brief calls for an
    // optional ?morphology= filter; the workstage does its own client-side
    // ranking, so server-side filter is only useful for tooling.
    if (req.method === 'GET' && (m = path.match(/^\/salon\/([^/]+)\/chassis$/))) {
      try {
        const url = new URL(req.url, 'http://x')
        const filter = url.searchParams.get('morphology') || null
        // ?all=1 — the BROWSE-ALL / tagging-gauntlet catalog: every chassis on
        // disk (all 241), nothing dropped. The Shelves surface needs to SEE the
        // whole library to tag it — you can't label what a filter hides
        // (HANDOFF-chassis-tagging-gauntlet.md). Forests are MARKED, not hidden
        // (`isForest`), so the operator can still tag them; they stay
        // usable-only-once-split (Brief 23a). The species DROPDOWN keeps its
        // procedural/LiDAR exclusion (listSalonSpecies) — that's a separate gate.
        const all = url.searchParams.get('all') === '1'
        let chassis = await listSalonChassis()
        const forestChassis = await listForestChassis()
        if (all) {
          chassis = chassis.map(c => ({ ...c, isForest: forestChassis.has(c.name) }))
          if (filter) chassis = chassis.filter(c => c.morphology === filter)
          return jsonRes(res, 200, { chassis })
        }
        // ── The Salon per-species picker path (default): the four reducers ──
        // Brief 15 extension (Boz inline 2026-05-25): the species dropdown
        // already excludes procedural + LiDAR species, but the chassis catalog
        // was never filtered — so after Brief 20's regen, procedural variants
        // (acer_saccharum_procedural_*) and LiDAR-species chassis
        // (acer_saccharum_a/c, source.species=acer_saccharum) leaked into the
        // slot-card picker. Filter the catalog to chassis whose species is in
        // the Salon picker set, mirroring listSalonSpecies's exclusions.
        const allowedSpecies = new Set((await listSalonSpecies()).map(s => s.speciesId))
        chassis = chassis.filter(c => !c.source?.species || allowedSpecies.has(c.source.species))
        // Brief 23 (Mistral 2026-05-25): suppress MERGED single-mesh forests
        // (group shots — one mesh holding N trunks, e.g. acer_saccharum_lowpoly,
        // burnt_tree) until Brief 23a splits them into per-tree singles. Keys on
        // survey-deleaf's producer-derived forest worklist, so it hits ONLY the
        // merged meshes — the 58 already-separable splits stay in the catalog.
        chassis = chassis.filter(c => !forestChassis.has(c.name))
        if (filter) chassis = chassis.filter(c => c.morphology === filter)
        return jsonRes(res, 200, { chassis })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // GET /salon/:species/bark — bark refs available under public/textures/bark/
    if (req.method === 'GET' && (m = path.match(/^\/salon\/([^/]+)\/bark$/))) {
      try {
        return jsonRes(res, 200, { bark: await listSalonBarkRefs() })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // GET /salon/:species/leaves — leaf packs (Phase F target dir + flat PNG fallback)
    if (req.method === 'GET' && (m = path.match(/^\/salon\/([^/]+)\/leaves$/))) {
      try {
        return jsonRes(res, 200, { leaves: await listSalonLeafPacks() })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // GET /salon/:species/options — the Forest Builder matcher's ranked options
    // per part-type + the dossier (reference plates + required) for this species
    // (§9/§7). { dossier|null, options:{chassis,bark,leaf}|null }. READ-ONLY.
    if (req.method === 'GET' && (m = path.match(/^\/salon\/([^/]+)\/options$/))) {
      try {
        return jsonRes(res, 200, salonOptionsForSpecies(decodeURIComponent(m[1])))
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // ── Salon chassis curation (Brief 1.5b, Quill 2026-05-21) ─────────
    //
    // Operator-authored sidecar at `arborist/state/_chassis-curation.json`
    // (NOT under public/trees/_chassis/, NOT regenerable by survey-deleaf).
    // Each entry is keyed by chassis filename (`<name>.glb`) and carries
    // `{displayName, approved, notes}`. `approved` is a tri-state:
    // `true` (approved), `false` (rejected), `null` (unreviewed). Absent
    // entry == fully unreviewed.

    // GET /salon/curation — full curation file or empty stub
    if (req.method === 'GET' && path === '/salon/curation') {
      const p = join(STATE_DIR, '_chassis-curation.json')
      const data = readJsonOrNull(p)
      return jsonRes(res, 200, data && data.chassis ? data : { chassis: {} })
    }

    // POST /salon/curation/:chassisName — merge with absent-keys-preserved
    //
    // Body fields:
    //   displayName: string | null     null → clear to ""
    //   approved:    true | false | null     null → restore unreviewed
    //   notes:       string | null     null → clear to ""
    // Fields ABSENT from body are NOT touched on disk
    // (`feedback_absence_means_inherit_in_authored_blocks`). Empty entries
    // (no displayName / null approved / empty notes) are pruned to keep
    // the file from accumulating noise across browse-only sessions.
    if (req.method === 'POST' && (m = path.match(/^\/salon\/curation\/(.+)$/))) {
      const chassisName = decodeURIComponent(m[1])
      // Defensive: chassis filenames are kebab/underscore + ".glb"; reject
      // anything with path traversal or slashes.
      if (chassisName.includes('/') || chassisName.includes('..') || chassisName.startsWith('.')) {
        return jsonRes(res, 400, { error: 'invalid chassis name' })
      }
      const body = await readBody(req)
      const p = join(STATE_DIR, '_chassis-curation.json')
      const file = readJsonOrNull(p) || { chassis: {} }
      if (!file.chassis || typeof file.chassis !== 'object') file.chassis = {}
      const prev = file.chassis[chassisName] || { displayName: '', approved: null, notes: '' }
      const next = { ...prev }
      // Per-field merge: only touch fields that are PRESENT in body. The
      // value `null` is a distinct signal (clear / unreview), not the
      // same as "absent."
      if ('displayName' in body) {
        next.displayName = body.displayName == null ? '' : String(body.displayName)
      }
      if ('approved' in body) {
        next.approved = body.approved === true ? true
                      : body.approved === false ? false
                      : null
      }
      if ('notes' in body) {
        next.notes = body.notes == null ? '' : String(body.notes)
      }
      // Chassis-tagging gauntlet (HANDOFF-chassis-tagging-gauntlet.md): the
      // silhouette tag — habit (1-of-9). A tag is a FACT assigned once
      // ("categorize, don't recommend"), persisted as curation so it survives
      // survey-deleaf re-runs. `null` clears it; an off-set value is rejected so
      // the shelves stay closed + honest. (Leaf/bark are separate libraries —
      // not chassis attributes — so they are not tagged here.)
      if ('habit' in body) next.habit = CHASSIS_HABITS.has(body.habit) ? body.habit : null
      // setAside — the gauntlet's "exclude this chassis from the sorts" tag. Kept
      // DISTINCT from `approved` (whose `false` = a Salon reject, painted red ✗):
      // a set-aside must not turn the Salon red. Both, however, exclude from
      // ingest (glb-scene-utils / ingest.js). Stored only when true.
      if ('setAside' in body) { if (body.setAside === true) next.setAside = true; else delete next.setAside }
      // Prune entries that revert to fully-unreviewed defaults so the
      // file doesn't accumulate empty stubs from operator-cancelled edits.
      const isEmpty = (!next.displayName) && next.approved == null && (!next.notes) && !next.habit && !next.setAside
      if (isEmpty) delete file.chassis[chassisName]
      else file.chassis[chassisName] = next
      writeJson(p, file)
      return jsonRes(res, 200, { ok: true, chassisName, entry: isEmpty ? null : next })
    }

    // GET /salon/:species/compositions — overlay with `effective` layered
    if (req.method === 'GET' && (m = path.match(/^\/salon\/([^/]+)\/compositions$/))) {
      const species = m[1]
      try {
        const compositions = await readEffectiveCompositions(species)
        return jsonRes(res, 200, { species, compositions })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // POST /salon/:species/compositions — persist overlay. Absent keys
    // preserved per `feedback_absence_means_inherit_in_authored_blocks`.
    if (req.method === 'POST' && (m = path.match(/^\/salon\/([^/]+)\/compositions$/))) {
      const species = m[1]
      const body = await readBody(req)
      const compositions = Array.isArray(body.compositions) ? body.compositions : null
      if (!compositions) return jsonRes(res, 400, { error: 'missing compositions[]' })
      try {
        await writeCompositions(species, compositions)
        return jsonRes(res, 200, { ok: true, species, count: compositions.length })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // POST /overhead/:look/:species — persist a PREBAKED overhead-snapshot asset
    // into the look's slab. The Salon Browse capture auto-POSTs here (no publish
    // button — everything autopersists until pour). Body:
    //   { heightM, canopyRadiusM, bands:[{key, yLoNorm, yHiNorm,
    //     albedo:<png dataURL>, ao:<png dataURL>}] }  (bottom→top)
    // Writes the band PNGs under public/baked/<look>/trees/overhead/<species>/ and
    // merges an overheadBySpecies[species] entry into that look's trees-atlas.json.
    // The runtime (OverheadTrees) reads that manifest + lazy-loads the PNGs.
    if (req.method === 'POST' && (m = path.match(/^\/overhead\/([^/]+)\/([^/]+)$/))) {
      const look = m[1], species = m[2]
      const body = await readBody(req)
      try {
        const dir = join(ROOT, 'public', 'baked', look, 'trees', 'overhead', species)
        mkdirSync(dir, { recursive: true })
        const decode = (dataUrl) => Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64')
        const bands = (body.bands || []).map((b) => {
          const write = (kind, dataUrl) => {
            const file = `${b.key}.${kind}.png`
            writeFileSync(join(dir, file), decode(dataUrl))
            return `/trees/overhead/${species}/${file}`
          }
          return {
            key: b.key, yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm,
            albedo: write('albedo', b.albedo),
            ao: write('ao', b.ao),
          }
        })
        // Merge into the look's trees-atlas.json (read-modify-write). bake-look
        // regenerates that file on a full re-bake and now carries this field
        // forward unconditionally (bake-look.js, after the manifest literal) —
        // browser-authored overhead can't be CLI-regenerated, so preservation
        // is the only option.
        const atlasPath = join(ROOT, 'public', 'baked', look, 'trees-atlas.json')
        let atlas = {}
        if (existsSync(atlasPath)) { try { atlas = JSON.parse(readFileSync(atlasPath, 'utf8')) } catch {} }
        atlas.overheadBySpecies = atlas.overheadBySpecies || {}
        atlas.overheadBySpecies[species] = {
          heightM: body.heightM ?? null,
          canopyRadiusM: body.canopyRadiusM ?? null,
          bands,
        }
        writeFileSync(atlasPath, JSON.stringify(atlas))
        console.log('[overhead] persisted', look, species, '→', bands.length, 'bands')
        return jsonRes(res, 200, { ok: true, look, species, bands: bands.length })
      } catch (err) {
        console.warn('[overhead] persist failed', look, species, err.message)
        return jsonRes(res, 500, { error: 'overhead persist failed', look, species, message: err.message })
      }
    }

    // Brief 7 (Cambium): POST /salon/:species/:slot/preview-atlas
    //
    // Rebuilds the Salon-side per-composition atlas + UV-rewritten chassis
    // GLB into arborist/_cache/salon-preview/<species>/<slot>/. The
    // workstage calls this AFTER persisting the overlay (POST compositions)
    // so the builder sees the operator's just-saved state on disk. Returns
    // { atlasUrl, normalUrl, glbUrl, manifestUrl, path: 'full' |
    // 'gradient-only' | 'noop', ms }. Path semantics:
    //   full          → chassis/bark/leaves/etc. changed; full rebuild
    //   gradient-only → only bark.gradientStops / gradientHashAmp changed;
    //                   LUT tile spliced into existing atlas-color.png
    //                   (~tens of ms, no GLB regen)
    //   noop          → snapshot matches the prior build; no work done
    if (req.method === 'POST' && (m = path.match(/^\/salon\/([^/]+)\/([^/]+)\/preview-atlas$/))) {
      const species = m[1]
      const slot = m[2]
      const body = await readBody(req)
      console.log('[preview-atlas] POST', species, slot, 'chassis=', body.chassis, 'bark.ref=', body.bark?.ref, 'leaves.pack=', body.leaves?.pack)
      try {
        const out = await buildPreviewAtlas({
          species, slot,
          composition: {
            chassis: body.chassis,
            bark:    body.bark   || {},
            leaves:  body.leaves || {},
          },
        })
        return jsonRes(res, 200, { ok: true, species, slot, ...out })
      } catch (err) {
        const code = err.statusCode || 500
        // Echo the request body's identifying fields so the failure is
        // diagnosable from the network tab without a server-side log dive.
        return jsonRes(res, code, {
          error: 'preview-atlas build failed',
          species, slot,
          chassis: body.chassis,
          barkRef: body.bark?.ref,
          leavesPack: body.leaves?.pack,
          message: err.message,
          stack: err.stack?.split('\n').slice(0, 6),
        })
      }
    }

    // GET /preview-atlas/:species/:slot/(atlas-color.png|atlas-normal.png
    //                                    |chassis.glb|manifest.json)
    //
    // Serves the static artifacts the builder wrote. Per-composition
    // isolation lives in the directory path. Files are written atomically
    // by the builder so a concurrent GET mid-write reads either the prior
    // build's bytes (fine — they were a valid build) or the new bytes
    // (also fine) — never a torn write.
    if (req.method === 'GET' && (m = path.match(/^\/preview-atlas\/([^/]+)\/([^/]+)\/(atlas-color\.png|atlas-normal\.png|chassis\.glb|manifest\.json)$/))) {
      const species = m[1], slot = m[2], file = m[3]
      const filePath = join(previewDir(species, slot), file)
      if (!existsSync(filePath)) return jsonRes(res, 404, { error: 'not built', species, slot, file })
      const ct = file.endsWith('.png')  ? 'image/png'
               : file.endsWith('.glb')  ? 'model/gltf-binary'
               : file.endsWith('.json') ? 'application/json'
               : 'application/octet-stream'
      const stat = statSync(filePath)
      res.writeHead(200, { 'Content-Type': ct, 'Content-Length': stat.size, 'Cache-Control': 'no-store' })
      createReadStream(filePath).pipe(res)
      return
    }

    // POST /salon/generate — body { chassis, bark, leaves, lod }
    // Returns the GLB binary directly. Used by the workstage live preview.
    if (req.method === 'POST' && path === '/salon/generate') {
      const body = await readBody(req)
      const { chassis, bark, leaves, lod } = body || {}
      if (!chassis || typeof chassis !== 'string') {
        return jsonRes(res, 400, { error: 'chassis is required' })
      }
      const lodN = (lod === 1 || lod === 2) ? lod : 0
      try {
        const buf = await generateSingleCompositionGLB({
          chassis, bark: bark || {}, leaves: leaves || {}, lod: lodN,
        })
        res.writeHead(200, {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': buf.length,
        })
        res.end(buf)
        return
      } catch (err) {
        return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
      }
    }

    // POST /salon/:species/publish — authoring-side "stage to library" only:
    // shell out to `generate-salon.js --species <id>` (writes species artifacts +
    // syncs the Look roster metadata via its main()) and rebuild the index.
    // Brief 14 (Lintel 2026-05-23): the slab bake is DECOUPLED — this endpoint
    // no longer fires bakeLook. Shipping to the slab is now the explicit Grove
    // gesture (POST /atlas/bake?look=<id>). Per
    // [[project_authoring_is_live_production_is_static]], Re-publish stages to
    // the library; Grove bakes the slab. The ?look= param is still accepted
    // (echoed in the response) but is now vestigial — it no longer triggers a bake.
    if (req.method === 'POST' && (m = path.match(/^\/salon\/([^/]+)\/publish$/))) {
      const species = m[1]
      const lookName = new URL(req.url, 'http://x').searchParams.get('look') || null
      if (lookName && (lookName.includes('/') || lookName.includes('..') || lookName.startsWith('.'))) {
        return jsonRes(res, 400, { error: 'invalid look name' })
      }
      const t0 = Date.now()
      try {
        const { stdout } = await execAsync('node', [
          join(__dirname, 'generate-salon.js'),
          '--species', species,
        ])
        try {
          const { rebuildIndex } = await import('./build-index.js')
          await rebuildIndex()
        } catch (e) {
          console.warn('[arborist] index rebuild failed after salon publish:', e.message)
        }
        return jsonRes(res, 200, {
          ok: true, ms: Date.now() - t0, species,
          look: lookName, log: String(stdout).slice(-4000),
        })
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'publish failed', species,
          stderr: String(err.stderr || err.message).slice(0, 8000),
          stdout: String(err.stdout || '').slice(0, 4000),
        })
      }
    }

    // ── Procedural authoring (v1.5 Phase A — dice/adopt/republish) ─────
    //
    // Plumbs the iteration surface for the procedural tree generator. The
    // generator algorithm is unchanged; these endpoints expose the dice
    // (live preview, no file write) → adopt (persist seed) → republish
    // (rebake species, fire per-Look atlas) flow that ProceduralWorkstage
    // binds to. Seedlings overlay lives in `arborist/state/procedural_<id>/seedlings.json`
    // (gitignored); fresh checkouts fall back to the canonical PRESETS table.

    // GET /procedural/species — list the 5 published procedural species
    if (req.method === 'GET' && path === '/procedural/species') {
      return jsonRes(res, 200, {
        species: Object.entries(PROCEDURAL_PRESETS).map(([id, cfg]) => ({
          speciesId:    id,
          label:        cfg.label,
          leafMorph:    cfg.leafMorph,
          variantCount: cfg.variants.length,
        })),
      })
    }

    // GET /procedural/:species/seedlings — current effective seedlings.
    // Match against the query-stripped `path` (the store cache-busts with
    // `?t=Date.now()`), not raw `req.url` — same bug would bite any future
    // procedural route that the store hits with a query string.
    //
    // Phase D: each variant also carries an `effective` field with the
    // resolved envelope/sca/etc. (PRESETS base merged with the operator
    // overlay). The UI binds slider positions to `effective`; adopt still
    // POSTs back the overlay-only `{slot, seed, params}` shape so disk
    // state stays minimal — touched fields only.
    if (req.method === 'GET' && (m = path.match(/^\/procedural\/([^/]+)\/seedlings$/))) {
      const species = m[1]
      if (!PROCEDURAL_PRESETS[species]) {
        return jsonRes(res, 404, { error: 'unknown procedural species', species })
      }
      try {
        const variants = await readEffectiveSeedlings(species)
        const cfg = PROCEDURAL_PRESETS[species]
        const enriched = variants.map(v => {
          const base = cfg.variants[(v.slot - 1) % cfg.variants.length]
          const merged = { ...base, ...(v.params || {}), seedN: v.seed }
          // Layer priority (lowest → highest):
          //   1. DEFAULT_SCA_BY_PRESET[preset][key]  — kernel-side defaults
          //      (phyllotaxisMode, scaffoldEmergenceBias, deformers, etc.)
          //   2. base[key]                            — PRESETS variant
          //   3. v.params[key]                        — operator overlay
          // The same order the generator's resolveVariantParams +
          // generateTreeMesh apply at runtime — keeps the UI's displayed
          // values in lock-step with what the kernel actually consumes.
          const defaultsForPreset = DEFAULT_SCA_BY_PRESET[merged.preset] || {}
          for (const key of ['envelope', 'sca', 'branching', 'deformers']) {
            const layered = {
              ...(defaultsForPreset[key] || {}),
              ...(base[key] || {}),
              ...((v.params && v.params[key]) || {}),
            }
            if (Object.keys(layered).length) merged[key] = layered
          }
          // Width/height default from canopyR/canopyH if not in envelope.
          if (merged.envelope) {
            if (merged.envelope.width  === undefined) merged.envelope.width  = merged.canopyR
            if (merged.envelope.height === undefined) merged.envelope.height = merged.canopyH
          }
          return {
            slot: v.slot, seed: v.seed, params: v.params || {},
            effective: {
              preset:    merged.preset,
              dbh:       merged.dbh,
              envelope:  merged.envelope || null,
              sca:       merged.sca || null,
              deformers: merged.deformers || null,
            },
          }
        })
        return jsonRes(res, 200, { species, variants: enriched })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // POST /procedural/:species/seedlings — body { variants: [{slot, seed, params}] }
    if (req.method === 'POST' && (m = path.match(/^\/procedural\/([^/]+)\/seedlings$/))) {
      const species = m[1]
      if (!PROCEDURAL_PRESETS[species]) {
        return jsonRes(res, 404, { error: 'unknown procedural species', species })
      }
      const body = await readBody(req)
      const variants = Array.isArray(body.variants) ? body.variants : null
      if (!variants) return jsonRes(res, 400, { error: 'missing variants[]' })
      try {
        await writeSeedlings(species, variants)
        return jsonRes(res, 200, { ok: true, species, variants })
      } catch (err) {
        return jsonRes(res, 500, { error: err.message })
      }
    }

    // POST /procedural/generate — body { species, slot, seed, params }
    // Returns the GLB binary directly. Used by the dice live preview.
    if (req.method === 'POST' && path === '/procedural/generate') {
      const body = await readBody(req)
      const { species, slot, seed, params, lod } = body || {}
      if (!species || !PROCEDURAL_PRESETS[species]) {
        return jsonRes(res, 400, { error: 'unknown or missing species', species })
      }
      if (!Number.isInteger(slot) || slot < 1) {
        return jsonRes(res, 400, { error: 'slot must be a positive integer' })
      }
      if (!Number.isFinite(seed)) {
        return jsonRes(res, 400, { error: 'seed must be a finite number' })
      }
      const lodN = (lod === 1 || lod === 2) ? lod : 0
      try {
        const buf = await generateSingleVariantGLB({ species, slot, seed, params: params || {}, lod: lodN })
        res.writeHead(200, {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': buf.length,
        })
        res.end(buf)
        return
      } catch (err) {
        return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
      }
    }

    // POST /procedural/:species/publish — authoring-side "stage to library"
    // only: shell out to `generate-procedural.js --species <id>` (writes species
    // artifacts + syncs the Look roster metadata via its main()) and rebuild the
    // index. Shell-out matches the v1 CLI invocation so the publish path
    // round-trips through publish-glb.js untouched.
    // Brief 14.1 (Corbel 2026-05-25): the slab bake is DECOUPLED — mirrors the
    // Salon path's Brief 14 (Lintel) change. This endpoint no longer fires
    // bakeLook. Shipping to the slab is now the explicit Grove gesture
    // (POST /atlas/bake?look=<id>). Per
    // [[project_authoring_is_live_production_is_static]], Re-publish stages to
    // the library; Grove bakes the slab. The ?look= param is still accepted
    // (echoed in the response) but is now vestigial — it no longer triggers a bake.
    if (req.method === 'POST' && (m = path.match(/^\/procedural\/([^/]+)\/publish$/))) {
      const species = m[1]
      if (!PROCEDURAL_PRESETS[species]) {
        return jsonRes(res, 404, { error: 'unknown procedural species', species })
      }
      const lookName = new URL(req.url, 'http://x').searchParams.get('look') || null
      if (lookName && (lookName.includes('/') || lookName.includes('..') || lookName.startsWith('.'))) {
        return jsonRes(res, 400, { error: 'invalid look name' })
      }
      const t0 = Date.now()
      try {
        const { stdout } = await execAsync('node', [
          join(__dirname, 'generate-procedural.js'),
          '--species', species,
        ])
        // Rebuild index so the new manifest is visible to the runtime picker.
        try {
          const { rebuildIndex } = await import('./build-index.js')
          await rebuildIndex()
        } catch (e) {
          console.warn('[arborist] index rebuild failed after procedural publish:', e.message)
        }
        return jsonRes(res, 200, {
          ok: true, ms: Date.now() - t0, species,
          look: lookName, log: String(stdout).slice(-4000),
        })
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'publish failed', species,
          stderr: String(err.stderr || err.message).slice(0, 8000),
          stdout: String(err.stdout || '').slice(0, 4000),
        })
      }
    }

    // 404
    return jsonRes(res, 404, { error: 'route not found', method: req.method, url: req.url })
  } catch (err) {
    return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
  }
})

server.listen(PORT, () => {
  console.log(`Arborist backend → http://localhost:${PORT}`)
  console.log(`  declared species: ${Object.keys(readSpeciesDecl()).join(', ') || '(none)'}`)
})
