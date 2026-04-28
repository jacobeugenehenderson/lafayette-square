#!/usr/bin/env node
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { join, extname } from 'path'
import { execSync } from 'child_process'

const DIR = join(import.meta.dirname, 'data', 'clean')
const RAW = join(import.meta.dirname, 'data', 'raw')
const MARKERS = join(DIR, 'marker_strokes.json')
const MEASUREMENTS = join(RAW, 'measurements.json')
const CENTERLINES = join(RAW, 'centerlines.json')
const SKELETON = join(DIR, 'skeleton.json')
const OVERLAY = join(DIR, 'overlay.json')
const PARCEL_FILE = join(import.meta.dirname, '..', 'scripts', 'raw', 'stl_parcels.json')
// Looks: each Look is a styling snapshot — a complete material palette + its
// baked SVG. Lives under public/looks/<id>/{design.json, ground.svg} so the
// browser can fetch design and SVG via simple static URLs. index.json tracks
// names + order; the default Look 'lafayette-square' is the project's 0-state
// and can't be deleted.
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
function lookSvgPath(id) { return join(lookDir(id), 'ground.svg') }
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
      { id: DEFAULT_LOOK_ID, name: 'Lafayette Square', createdAt: Date.now() },
    ],
  })
  if (overlay.design) {
    delete overlay.design
    writeJson(OVERLAY, overlay)
  }
  console.log(`[looks] migrated overlay.design → ${DEFAULT_LOOK_ID}`)
}
migrateLooksOnBoot()

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

createServer((req, res) => {
  // GET /markers — read strokes
  if (req.method === 'GET' && req.url === '/markers') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(MARKERS))
    return
  }

  // POST /markers — write strokes
  if (req.method === 'POST' && req.url === '/markers') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      writeFileSync(MARKERS, JSON.stringify(JSON.parse(body), null, 2))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }

  // GET /analyze — report what's under the marker strokes
  if (req.method === 'GET' && req.url === '/analyze') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(analyzeMarkers(), null, 2))
    return
  }

  // GET /measurements — read measurements
  if (req.method === 'GET' && req.url === '/measurements') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(MEASUREMENTS))
    return
  }

  // POST /measurements — write measurements
  if (req.method === 'POST' && req.url === '/measurements') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        writeFileSync(MEASUREMENTS, JSON.stringify(parsed, null, 2))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /skeleton — read Phase-0 skeleton output
  if (req.method === 'GET' && req.url === '/skeleton') {
    if (!existsSync(SKELETON)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end('{"error":"skeleton.json not found — run `node skeleton.js`"}')
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(SKELETON))
    return
  }

  // GET /centerlines — read centerline data
  if (req.method === 'GET' && req.url === '/centerlines') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(CENTERLINES))
    return
  }

  // POST /centerlines — write centerline data
  if (req.method === 'POST' && req.url === '/centerlines') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        writeFileSync(CENTERLINES, JSON.stringify(parsed, null, 2))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // GET /overlay — read the operator-intent overlay (skelId-keyed)
  if (req.method === 'GET' && req.url === '/overlay') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(readFileSync(OVERLAY))
    return
  }

  // POST /overlay — write overlay (authored caps, couplers, measures,
  // segmentMeasures keyed by skeleton chain id). Skeleton owns geometry;
  // this file owns operator intent.
  if (req.method === 'POST' && req.url === '/overlay') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        writeFileSync(OVERLAY, JSON.stringify(parsed, null, 2))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /bake — run the cartograph bake step (ribbons.json → SVG).
  // The bake is the cartograph's only publish artifact — see memory
  // `project_cartograph_bake_step`. Synchronous on the server side; the
  // client shows a modal during the round-trip.
  if (req.method === 'POST' && req.url === '/bake') {
    try {
      const t0 = Date.now()
      execSync('node bake-svg.js', { cwd: import.meta.dirname, timeout: 60000 })
      const ms = Date.now() - t0
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ms, path: 'public/cartograph-ground.svg' }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // ── Looks ───────────────────────────────────────────────────────────────
  // Each Look is a styling snapshot: design.json (material palette + shader
  // params) + ground.svg (baked artifact). The default Look is the project's
  // 0-state and can't be deleted.

  // GET /looks — list of {id, name, createdAt} + the default id.
  if (req.method === 'GET' && req.url === '/looks') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(readLooksIndex()))
    return
  }

  // GET /looks/<id>/design — the Look's autosaved design block.
  // Returns {} (not 404) for an existing Look without a design yet, so the
  // client can hydrate without a special-case error path.
  let m
  if (req.method === 'GET' && (m = req.url.match(/^\/looks\/([^/]+)\/design$/))) {
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
  if (req.method === 'POST' && (m = req.url.match(/^\/looks\/([^/]+)\/design$/))) {
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
        mkdirSync(lookDir(id), { recursive: true })
        writeJson(lookDesignPath(id), parsed)
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

  // POST /looks/<id>/bake — re-render the SVG for this Look from its
  // design.json. Synchronous; client shows a modal during the round-trip.
  if (req.method === 'POST' && (m = req.url.match(/^\/looks\/([^/]+)\/bake$/))) {
    const id = m[1]
    const idx = readLooksIndex()
    if (!idx.looks.some(l => l.id === id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unknown look' }))
      return
    }
    try {
      const t0 = Date.now()
      execSync(`node bake-svg.js --look=${id}`, { cwd: import.meta.dirname, timeout: 60000 })
      const ms = Date.now() - t0
      const idx2 = readLooksIndex()
      const entry = idx2.looks.find(l => l.id === id)
      if (entry) { entry.bakedAt = Date.now(); saveLooksIndex(idx2) }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ms, lookId: id }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /looks — create a new Look. Body: { name, fromLookId? }.
  // Seeds the new Look's design.json from `fromLookId` (defaults to the
  // currently-active or default Look). Caller bakes separately.
  if (req.method === 'POST' && req.url === '/looks') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { name, fromLookId } = JSON.parse(body || '{}')
        if (!name || !String(name).trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'name required' }))
          return
        }
        const idx = readLooksIndex()
        const seedId = fromLookId && idx.looks.some(l => l.id === fromLookId)
          ? fromLookId : idx.default
        const id = uniqueLookId(slugify(name), idx.looks.map(l => l.id))
        mkdirSync(lookDir(id), { recursive: true })
        const seedDesign = readJsonOrNull(lookDesignPath(seedId)) || {}
        writeJson(lookDesignPath(id), seedDesign)
        idx.looks.push({ id, name: String(name).trim(), createdAt: Date.now() })
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
  if (req.method === 'DELETE' && (m = req.url.match(/^\/looks\/([^/]+)$/))) {
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
  if (req.method === 'POST' && req.url === '/rebuild') {
    try {
      execSync('node render.js', { cwd: import.meta.dirname, timeout: 30000 })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // Static file serving
  const file = req.url === '/' ? '/preview.html' : req.url
  const path = join(DIR, file)
  if (!existsSync(path)) { res.writeHead(404); res.end('Not found'); return }
  const ext = extname(path)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(path))
}).listen(PORT, () => {
  console.log(`Cartograph preview → http://localhost:${PORT}`)
})
