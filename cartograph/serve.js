#!/usr/bin/env node
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { join, extname, dirname } from 'path'
import { spawn } from 'child_process'
import { DEFAULT_SCENE, sceneRawDir, sceneCleanDir } from './config.js'

// Promise wrapper around spawn with shell: true. Matches execSync's
// command-string semantics + timeout option, but the event loop keeps
// serving other requests while the child runs — so `/api/cartograph/*`
// requests don't pend during a long bake.
function runShell(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      shell: true,
      stdio: 'inherit',
      cwd: opts.cwd,
      env: opts.env,
    })
    let timer = null
    if (opts.timeout) {
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Command timed out after ${opts.timeout}ms: ${cmd}`))
      }, opts.timeout)
    }
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Command failed (code=${code}, signal=${signal}): ${cmd}`))
    })
  })
}

// Per-look bake lock. A double-click on the Stage button would otherwise
// kick off two simultaneous bakes against the same `public/baked/<id>/`
// directory; the second loses races against the first's writes.
const _bakesInFlight = new Set()

// Per-scene file resolver. Phase 0a only wires the default scene
// (lafayette-square) and toy through here; further scenes follow the same
// pattern. The raw/ + clean/ split inside each scene matches the existing
// LS layout (raw = OSM ingestion / authored input; clean = derived).
function sceneDataPaths(scene) {
  const raw = sceneRawDir(scene)
  const clean = sceneCleanDir(scene)
  return {
    raw, clean,
    markers:      join(clean, 'marker_strokes.json'),
    measurements: join(raw,   'measurements.json'),
    centerlines:  join(raw,   'centerlines.json'),
    skeleton:     join(clean, 'skeleton.json'),
    overlay:      join(clean, 'overlay.json'),
    map:          join(clean, 'map.json'),
  }
}

// Default-scene aliases — preserved so the static-file serving path and
// the analyze() routine keep working without per-request scene plumbing.
// Per-scene routes resolve via sceneDataPaths(scene) instead.
const DEFAULT_PATHS = sceneDataPaths(DEFAULT_SCENE)
const DIR     = DEFAULT_PATHS.clean
const RAW     = DEFAULT_PATHS.raw
const MARKERS = DEFAULT_PATHS.markers
const MEASUREMENTS = DEFAULT_PATHS.measurements
const CENTERLINES  = DEFAULT_PATHS.centerlines
const SKELETON     = DEFAULT_PATHS.skeleton
const OVERLAY      = DEFAULT_PATHS.overlay
const PARCEL_FILE = join(import.meta.dirname, '..', 'scripts', 'raw', 'stl_parcels.json')

// mtime-based dirty check used by the bake chain. Returns true if any output
// is missing or any input is newer than the oldest output. Missing inputs
// are treated as mtime=0 (won't force a rebuild on their own); missing
// outputs always force a rebuild. Both inputs and outputs lists may include
// .js source paths so script edits invalidate downstream artifacts.
function needsRebuild(inputs, outputs) {
  const outMtimes = outputs.map(o => existsSync(o) ? statSync(o).mtimeMs : 0)
  if (outMtimes.some(t => t === 0)) return true
  const minOut = Math.min(...outMtimes)
  const inMtimes = inputs.map(i => existsSync(i) ? statSync(i).mtimeMs : 0)
  const maxIn = inMtimes.length ? Math.max(...inMtimes) : 0
  return maxIn > minOut
}
// Looks: each Look is a styling snapshot — a complete material palette plus
// the per-Look bake bundle (ground.json + bin + lightmap + buildings + lamps
// + scene snapshot) under public/baked/<id>/. design.json (authoring state)
// lives under public/looks/<id>/. index.json tracks names + order; the
// default Look 'lafayette-square' is the project's 0-state and can't be
// deleted.
const PUBLIC_DIR = join(import.meta.dirname, '..', 'public')
const LOOKS_DIR = join(PUBLIC_DIR, 'looks')
const LOOKS_INDEX = join(LOOKS_DIR, 'index.json')
const DEFAULT_LOOK_ID = 'lafayette-square'
const PORT = 3333

// ── Looks helpers ──────────────────────────────────────────────────────────
function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}
function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2))
}
function lookDir(id) { return join(LOOKS_DIR, id) }
function lookDesignPath(id) { return join(lookDir(id), 'design.json') }
function readLooksIndex() {
  return readJsonOrNull(LOOKS_INDEX) || { default: DEFAULT_LOOK_ID, looks: [] }
}
function saveLooksIndex(idx) { writeJson(LOOKS_INDEX, idx) }
function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'look'
}
function uniqueLookId(base, existingIds) {
  let id = base, n = 2
  while (existingIds.includes(id)) { id = `${base}-${n}`; n++ }
  return id
}

// One-time migration: if public/looks/ doesn't exist, create it and seed the
// default Look from overlay.json's design block (or empty if absent). Strip
// the design block from overlay.json so it stops drifting from the Look.
function migrateLooksOnBoot() {
  if (existsSync(LOOKS_INDEX)) return
  mkdirSync(lookDir(DEFAULT_LOOK_ID), { recursive: true })
  const overlay = readJsonOrNull(OVERLAY) || {}
  const design = overlay.design || {}
  writeJson(lookDesignPath(DEFAULT_LOOK_ID), design)
  saveLooksIndex({
    default: DEFAULT_LOOK_ID,
    looks: [
      { id: DEFAULT_LOOK_ID, name: 'Lafayette Square', scene: DEFAULT_SCENE, createdAt: Date.now() },
    ],
  })
  if (overlay.design) {
    delete overlay.design
    writeJson(OVERLAY, overlay)
  }
  console.log(`[looks] migrated overlay.design → ${DEFAULT_LOOK_ID}`)
}
migrateLooksOnBoot()

// Idempotent migration: stamp `scene` on any pre-existing Look entry that
// lacks it. Defaults to the project's 0-state scene (Lafayette Square).
// Runs every boot but only writes if something needed stamping.
function backfillLookScenesOnBoot() {
  const idx = readJsonOrNull(LOOKS_INDEX)
  if (!idx || !Array.isArray(idx.looks)) return
  let changed = false
  for (const entry of idx.looks) {
    if (!entry.scene) { entry.scene = DEFAULT_SCENE; changed = true }
  }
  if (changed) {
    saveLooksIndex(idx)
    console.log(`[looks] backfilled scene field on ${idx.looks.length} entr${idx.looks.length === 1 ? 'y' : 'ies'}`)
  }
}
backfillLookScenesOnBoot()

const MIME = {
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
}

if (!existsSync(MARKERS)) writeFileSync(MARKERS, '[]')
if (!existsSync(MEASUREMENTS)) writeFileSync(MEASUREMENTS, '{"measurements":[]}')
if (!existsSync(CENTERLINES)) writeFileSync(CENTERLINES, '{"streets":[]}')
if (!existsSync(OVERLAY)) writeFileSync(OVERLAY, '{"version":1,"streets":{}}')

function pointInRing(px, pz, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1]
    const xj = ring[j][0], zj = ring[j][1]
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function strokeBBox(strokes) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }
  return { minX, maxX, minZ, maxZ }
}

function analyzeMarkers() {
  const strokes = JSON.parse(readFileSync(MARKERS, 'utf-8'))
  if (!strokes.length) return { strokes: 0, message: 'No marker strokes' }

  const bbox = strokeBBox(strokes)
  const result = { strokes: strokes.length, bbox }

  // Find parcels overlapping the marker bbox
  if (existsSync(PARCEL_FILE)) {
    const parcelData = JSON.parse(readFileSync(PARCEL_FILE, 'utf-8'))
    const overlapping = []
    for (const p of parcelData.parcels) {
      const ring = p.rings?.[0]
      if (!ring || ring.length < 3) continue
      const xs = ring.map(pt => pt[0]), zs = ring.map(pt => pt[1])
      const pMinX = Math.min(...xs), pMaxX = Math.max(...xs)
      const pMinZ = Math.min(...zs), pMaxZ = Math.max(...zs)
      // BBox overlap test
      if (pMaxX < bbox.minX || pMinX > bbox.maxX || pMaxZ < bbox.minZ || pMinZ > bbox.maxZ) continue
      overlapping.push({
        address: (p.address || '').trim(),
        bounds: { minX: +pMinX.toFixed(1), maxX: +pMaxX.toFixed(1), minZ: +pMinZ.toFixed(1), maxZ: +pMaxZ.toFixed(1) },
        centroid: { x: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), z: +(zs.reduce((a, b) => a + b, 0) / zs.length).toFixed(1) },
        vertexCount: ring.length,
        ring
      })
    }
    result.parcels = overlapping.map(p => ({ ...p, ring: undefined }))
    result.parcelCount = overlapping.length
  }

  // Find blocks overlapping the marker bbox
  const mapFile = join(DIR, 'map.json')
  if (existsSync(mapFile)) {
    const map = JSON.parse(readFileSync(mapFile, 'utf-8'))
    const blocks = map.layers?.block || []
    const overlappingBlocks = []
    for (let i = 0; i < blocks.length; i++) {
      const ring = blocks[i].ring
      const xs = ring.map(p => p.x), zs = ring.map(p => p.z)
      const bMinX = Math.min(...xs), bMaxX = Math.max(...xs)
      const bMinZ = Math.min(...zs), bMaxZ = Math.max(...zs)
      if (bMaxX < bbox.minX || bMinX > bbox.maxX || bMaxZ < bbox.minZ || bMinZ > bbox.maxZ) continue
      overlappingBlocks.push({
        index: i,
        bounds: { minX: +bMinX.toFixed(1), maxX: +bMaxX.toFixed(1), minZ: +bMinZ.toFixed(1), maxZ: +bMaxZ.toFixed(1) }
      })
    }
    result.blocks = overlappingBlocks
    result.blockCount = overlappingBlocks.length
  }

  return result
}

createServer(async (req, res) => {
  // Strip query string for route matching. Clients add cache-busting
  // ?t=... that would otherwise miss exact-equality checks.
  const path = (req.url || '').split('?')[0]
  // GET /analyze — report what's under the marker strokes (LS-only helper).
  if (req.method === 'GET' && path === '/analyze') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(analyzeMarkers(), null, 2))
    return
  }

  // ── Per-scene data routes ──────────────────────────────────────────────
  // Canonical: /<scene>/<verb> (e.g. /lafayette-square/centerlines, /toy/overlay).
  // Legacy: /<verb> with no scene prefix resolves to the default scene; this
  // alias exists so older clients keep working through Phase 0c's store
  // migration. Once every caller is scene-aware we can retire it.
  //
  // Verbs split by allowed methods to match the prior per-route behavior
  // exactly: skeleton is GET-only (derived artifact), the rest accept POST
  // for autosave. Empty-payload defaults match the boot-time inits.
  const READ_VERBS = ['markers', 'measurements', 'skeleton', 'centerlines', 'overlay']
  const WRITE_VERBS = ['markers', 'measurements', 'centerlines', 'overlay']
  const EMPTY = {
    markers:      '[]',
    measurements: '{"measurements":[]}',
    centerlines:  '{"streets":[]}',
    overlay:      '{"version":1,"streets":{}}',
  }
  // Reserved top-level prefixes that must NOT be mistaken for scene names.
  const RESERVED_PREFIXES = new Set(['looks', 'analyze', 'rebuild'])
  const sceneRouteMatch = path.match(/^\/(?:([a-z0-9][a-z0-9-]*)\/)?(markers|measurements|skeleton|centerlines|overlay)$/)
  if (sceneRouteMatch && !RESERVED_PREFIXES.has(sceneRouteMatch[1])) {
    const scene = sceneRouteMatch[1] || DEFAULT_SCENE
    const verb = sceneRouteMatch[2]
    const paths = sceneDataPaths(scene)
    const filePath = paths[verb]

    if (req.method === 'GET' && READ_VERBS.includes(verb)) {
      if (!existsSync(filePath)) {
        if (verb === 'skeleton') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `skeleton.json not found for scene '${scene}' — run skeleton.js` }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(EMPTY[verb] || '{}')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(readFileSync(filePath))
      return
    }

    if (req.method === 'POST' && WRITE_VERBS.includes(verb)) {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          mkdirSync(dirname(filePath), { recursive: true })
          writeFileSync(filePath, JSON.stringify(parsed, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{"ok":true}')
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
  }

  // ── Looks ───────────────────────────────────────────────────────────────
  // Each Look is a styling snapshot: design.json (material palette + shader
  // params) + the per-Look bake bundle (public/baked/<id>/). The default
  // Look is the project's 0-state and can't be deleted.

  // GET /looks — list of {id, name, createdAt} + the default id.
  if (req.method === 'GET' && path === '/looks') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(readLooksIndex()))
    return
  }

  // GET /looks/<id>/design — the Look's autosaved design block.
  // Returns {} (not 404) for an existing Look without a design yet, so the
  // client can hydrate without a special-case error path.
  let m
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/design$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    const design = readJsonOrNull(lookDesignPath(id)) || {}
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(design))
    return
  }

  // POST /looks/<id>/design — autosave write. Body: design block JSON.
  // Preserves keys Cartograph doesn't author (notably `trees`, written
  // by Arborist) so a Cartograph autosave can't clobber Arborist's
  // roster. Co-authoring across apps relies on this merge.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/design$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        const existing = readJsonOrNull(lookDesignPath(id)) || {}
        // Preserve Arborist-owned keys if the incoming payload omits them.
        const merged = { ...parsed }
        for (const k of ['trees']) {
          if (!(k in parsed) && k in existing) merged[k] = existing[k]
        }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        // Touch updatedAt so clients can show "last edited" if they want.
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /looks/<id>/trees — Arborist's tree roster for this Look.
  // Returns [] when the Look hasn't been curated yet.
  if (req.method === 'GET' && (m = path.match(/^\/looks\/([^/]+)\/trees$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    const design = readJsonOrNull(lookDesignPath(id)) || {}
    const trees = Array.isArray(design.trees) ? design.trees : []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ trees }))
    return
  }

  // POST /looks/<id>/trees — replace this Look's tree roster. Body:
  // { trees: [{species, variantId}, …] }. Read-merge-write so a
  // concurrent Cartograph autosave can't drop the trees field.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/trees$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const trees = Array.isArray(parsed.trees) ? parsed.trees : []
        // Normalize: drop entries missing species or variantId.
        const clean = trees
          .filter(t => t && t.species && (t.variantId != null))
          .map(t => ({ species: String(t.species), variantId: Number(t.variantId) }))
        const existing = readJsonOrNull(lookDesignPath(id)) || {}
        const merged = { ...existing, trees: clean }
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), merged)
        const idx2 = readLooksIndex()
        const entry = idx2.looks.find(l => l.id === id)
        if (entry) { entry.updatedAt = Date.now(); saveLooksIndex(idx2) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, count: clean.length }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /looks/<id>/bake — re-bake this Look's bundle (ground / buildings
  // / lamps / scene / trees / ground-ao) from its design.json. Steps run
  // via `runShell` (async spawn) so other API requests keep flowing during
  // the bake. Per-look lock rejects concurrent bakes against the same Look.
  if (req.method === 'POST' && (m = path.match(/^\/looks\/([^/]+)\/bake$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    if (_bakesInFlight.has(id)) {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bake already in progress for this look', lookId: id }))
      return
    }
    _bakesInFlight.add(id)
    try {
      const t0 = Date.now()
      // Full bake chain — every step the operator might forget rolled into
      // the Bake button so "edit, bake, see" actually works:
      //
      //   1. pipeline.js + promote-ribbons.js — re-derive map.json + ribbons
      //      from the latest measurements/overlay/centerlines edits.
      //   2. cartograph bakes — ground / buildings / lamps / scene from
      //      the freshly-derived map.json.
      //   3. arborist tree bake — public/baked/default.json placements;
      //      reads map.json for forbidden-surface polygons.
      //   4. ground-ao bake last — slowest (~25 sec), benefits from
      //      stable upstream geometry.
      //
      // Each step is incremental: skipped when all outputs are newer than
      // every declared input (including its own .js source). Pass
      // `?force=1` on the bake URL to force a full rebuild.
      //
      // bake-svg.js is intentionally NOT run here — it's demoted to a
      // CLI-only QA artifact (human-readable / diffable); the runtime
      // consumes ground.json + ground.bin + ground.lightmap exclusively.
      const force = /[?&]force=1\b/.test(req.url || '')
      const REPO_ROOT = join(import.meta.dirname, '..')
      const here = import.meta.dirname
      // Bake inputs come from the active Look's scene. Looks without an
      // explicit scene fall back to the default; pipeline.js + promote-
      // ribbons.js + arborist trees are skipped for non-LS scenes today
      // (toy doesn't have an OSM-derived pipeline yet — its centerlines
      // are hand-authored, so the pipeline step is a no-op for now).
      const bakeLookEntry = idx.looks.find(l => l.id === id)
      const bakeScene = bakeLookEntry?.scene || DEFAULT_SCENE
      const isDefaultScene = bakeScene === DEFAULT_SCENE
      const bakePaths = sceneDataPaths(bakeScene)
      // overlay.json + skeleton.json are operator-edited / derived
      // (Survey/Measure write to /overlay → clean/overlay.json; skeleton
      // is derived). Everything else is raw inputs.
      const RAW_PATHS = [
        join(bakePaths.raw,   'osm.json'),
        bakePaths.measurements,
        bakePaths.centerlines,
        join(bakePaths.raw,   'elevation.json'),
        bakePaths.overlay,
        bakePaths.skeleton,
        join(REPO_ROOT, 'src', 'data', 'buildings.json'),
      ]
      const PIPELINE_SRC = ['pipeline.js', 'derive.js', 'snap.js', 'classify.js', 'standards.js', 'config.js'].map(f => join(here, f))
      const MAP_JSON   = bakePaths.map
      const RIBBONS    = join(REPO_ROOT, 'src', 'data', 'ribbons.json')
      const PARK_TREES = join(REPO_ROOT, 'src', 'data', 'park_trees.json')
      const PARK_WATER = join(REPO_ROOT, 'src', 'data', 'park_water.json')
      const STREET_LAMPS = join(REPO_ROOT, 'src', 'data', 'street_lamps.json')
      const DESIGN    = join(REPO_ROOT, 'public', 'looks', id, 'design.json')
      const LOOK_DIR  = join(REPO_ROOT, 'public', 'baked', id)
      const sceneFlag = `--scene=${bakeScene}`
      const ranSteps = []
      const skipped = []
      const runIfDirty = async (label, inputs, outputs, cmd, opts) => {
        if (!force && !needsRebuild(inputs, outputs)) { skipped.push(label); return }
        await runShell(cmd, opts)
        ranSteps.push(label)
      }

      // pipeline.js is LS-specific (reads OSM ingest → derives map.json).
      // For toy we skip — the toy fixture is hand-authored centerlines +
      // overlay; a future toy-pipeline.js will derive map.json from those.
      if (isDefaultScene) {
        await runIfDirty('pipeline',
          [...RAW_PATHS, ...PIPELINE_SRC],
          [MAP_JSON],
          `node pipeline.js`,
          { cwd: here, timeout: 120000 })
        await runIfDirty('promote-ribbons',
          [MAP_JSON, join(here, 'promote-ribbons.js')],
          [RIBBONS],
          `node promote-ribbons.js ${sceneFlag}`,
          { cwd: here, timeout: 30000 })
      } else {
        skipped.push('pipeline (scene-specific pipeline not yet implemented)')
        skipped.push('promote-ribbons (depends on pipeline)')
      }
      await runIfDirty('ground',
        [MAP_JSON, DESIGN, join(here, 'bake-ground.js'), join(REPO_ROOT, 'src', 'lib', 'ribbonsGeometry.js')],
        [join(LOOK_DIR, 'ground.json'), join(LOOK_DIR, 'ground.bin')],
        `node bake-ground.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 60000 })
      await runIfDirty('buildings',
        [MAP_JSON, DESIGN, join(here, 'bake-buildings.js')],
        [join(LOOK_DIR, 'buildings.json'), join(LOOK_DIR, 'buildings.bin')],
        `node bake-buildings.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 60000 })
      await runIfDirty('lamps',
        [STREET_LAMPS, DESIGN, join(here, 'bake-lamps.js')],
        [join(LOOK_DIR, 'lamps.json')],
        `node bake-lamps.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 30000 })
      await runIfDirty('scene',
        [DESIGN, join(here, 'bake-scene.js')],
        [join(LOOK_DIR, 'scene.json')],
        `node bake-scene.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 30000 })
      // Trees: LS-only today (the LS scene's PARK_TREES + PARK_WATER are
      // hardcoded inputs, and tree placements are shared across LS Looks).
      // Toy has its own ToyTrees component fed by a static JSON; no bake
      // step is needed for it yet.
      if (isDefaultScene) {
        await runIfDirty('trees',
          [PARK_TREES, PARK_WATER, MAP_JSON, join(REPO_ROOT, 'arborist', 'bake-trees.js')],
          [join(REPO_ROOT, 'public', 'baked', 'default.json')],
          `node arborist/bake-trees.js --look default`,
          { cwd: REPO_ROOT, timeout: 60000 })
      } else {
        skipped.push('trees (LS-only today; toy uses its own static fixture)')
      }
      // AO bake last — slowest, benefits from updated geometry.
      await runIfDirty('ground-ao',
        [MAP_JSON, DESIGN, join(LOOK_DIR, 'ground.json'), join(here, 'bake-ground-ao.js')],
        [join(LOOK_DIR, 'ground.lightmap.png')],
        `node bake-ground-ao.js --look=${id} ${sceneFlag}`,
        { cwd: here, timeout: 120000 })
      const ms = Date.now() - t0
      const idx2 = readLooksIndex()
      const entry = idx2.looks.find(l => l.id === id)
      if (entry) { entry.bakedAt = Date.now(); saveLooksIndex(idx2) }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ms, lookId: id, ran: ranSteps, skipped, force }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    } finally {
      _bakesInFlight.delete(id)
    }
    return
  }

  // POST /looks — create a new Look. Body: { name, fromLookId?, scene? }.
  // Seeds the new Look's design.json from `fromLookId` (defaults to the
  // currently-active or default Look). The new Look's scene defaults to
  // the seed Look's scene — cloning a Look keeps you in its scene unless
  // the caller explicitly passes a different one. Caller bakes separately.
  if (req.method === 'POST' && path === '/looks') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { name, fromLookId, scene } = JSON.parse(body || '{}')
        if (!name || !String(name).trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'name required' }))
          return
        }
        const idx = readLooksIndex()
        const seedEntry = (fromLookId && idx.looks.find(l => l.id === fromLookId))
          || idx.looks.find(l => l.id === idx.default)
        const seedId = seedEntry ? seedEntry.id : idx.default
        const newScene = (scene && String(scene).trim()) || (seedEntry && seedEntry.scene) || DEFAULT_SCENE
        const id = uniqueLookId(slugify(name), idx.looks.map(l => l.id))
        mkdirSync(lookDir(id), { recursive: true })
        const seedDesign = readJsonOrNull(lookDesignPath(seedId)) || {}
        writeJson(lookDesignPath(id), seedDesign)
        idx.looks.push({ id, name: String(name).trim(), scene: newScene, createdAt: Date.now() })
        saveLooksIndex(idx)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // DELETE /looks/<id> — remove a Look. Forbidden for the default 0-state.
  if (req.method === 'DELETE' && (m = path.match(/^\/looks\/([^/]+)$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (id === idx.default) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'cannot delete default look' }))
      return
    }
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    try {
      rmSync(lookDir(id), { recursive: true, force: true })
      idx.looks = idx.looks.filter(l => l.id !== id)
      saveLooksIndex(idx)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /rebuild — re-run render.js and reload preview
  if (req.method === 'POST' && path === '/rebuild') {
    try {
      await runShell('node render.js', { cwd: import.meta.dirname, timeout: 30000 })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // Static file serving — uses the query-stripped path so cache-busting
  // suffixes don't break file resolution.
  const file = path === '/' ? '/preview.html' : path
  const filePath = join(DIR, file)
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return }
  const ext = extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(filePath))
}).listen(PORT, () => {
  console.log(`Cartograph preview → http://localhost:${PORT}`)
})
