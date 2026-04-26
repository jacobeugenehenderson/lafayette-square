#!/usr/bin/env node
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
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
const PORT = 3333

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
