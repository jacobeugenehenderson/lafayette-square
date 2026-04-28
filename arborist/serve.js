#!/usr/bin/env node
/**
 * Arborist backend.
 *
 * Local-only Node service for the Arborist helper app. Mirrors
 * cartograph/serve.js patterns — see arborist/SPEC.md § "Backend
 * (arborist/serve.js)" for the full endpoint contract.
 *
 * v1 status: stub. Endpoints exist, return fixtures or empty results.
 * Filling them in is sequenced behind the Specimen Browser + bake
 * pipeline tasks.
 */
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PUBLIC_TREES = join(ROOT, 'public', 'trees')
const STATE_DIR = join(__dirname, 'state')
const CACHE_DIR = join(__dirname, '_cache')
const PORT = 3334

// ── Helpers ────────────────────────────────────────────────────────────────
function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}
function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }) }
function jsonRes(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}
function notImplemented(res, route) {
  jsonRes(res, 501, { error: 'not implemented', route })
}

// ── First-boot scaffolding ─────────────────────────────────────────────────
ensureDir(PUBLIC_TREES)
ensureDir(STATE_DIR)
ensureDir(CACHE_DIR)
const indexPath = join(PUBLIC_TREES, 'index.json')
if (!existsSync(indexPath)) {
  writeFileSync(indexPath, JSON.stringify({ species: [] }, null, 2))
  console.log('[arborist] initialized empty public/trees/index.json')
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  // GET /species — read public/trees/index.json
  if (req.method === 'GET' && req.url === '/species') {
    const idx = readJsonOrNull(indexPath) || { species: [] }
    return jsonRes(res, 200, idx)
  }

  // GET /species/:id — manifest for one species (404 until baked)
  let m
  if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)$/))) {
    const manifestPath = join(PUBLIC_TREES, m[1], 'manifest.json')
    const manifest = readJsonOrNull(manifestPath)
    if (!manifest) return jsonRes(res, 404, { error: 'unknown or not yet baked', species: m[1] })
    return jsonRes(res, 200, manifest)
  }

  // GET /species/:id/specimens — candidate specimens from FOR-species20K
  if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)\/specimens$/))) {
    return notImplemented(res, '/species/:id/specimens')
  }

  // GET /species/:id/seedlings — picked seedlings + per-seedling tune params
  if (req.method === 'GET' && (m = req.url.match(/^\/species\/([^/]+)\/seedlings$/))) {
    const seedlingsPath = join(STATE_DIR, m[1], 'seedlings.json')
    const data = readJsonOrNull(seedlingsPath)
    if (!data) return jsonRes(res, 404, { error: 'no seedlings picked yet', species: m[1] })
    return jsonRes(res, 200, data)
  }

  // POST /species/:id/seedlings — save the seedling library for a species
  if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/seedlings$/))) {
    return notImplemented(res, 'POST /species/:id/seedlings')
  }

  // GET /specimens/:treeId/preview.ply — point-cloud preview for the workstage
  if (req.method === 'GET' && (m = req.url.match(/^\/specimens\/([^/]+)\/preview\.ply$/))) {
    return notImplemented(res, '/specimens/:treeId/preview.ply')
  }

  // POST /species/:id/bake — bake-tree.py for one species
  if (req.method === 'POST' && (m = req.url.match(/^\/species\/([^/]+)\/bake$/))) {
    return notImplemented(res, 'POST /species/:id/bake')
  }

  // DELETE /species/:id — remove a species's published artifacts + state
  if (req.method === 'DELETE' && (m = req.url.match(/^\/species\/([^/]+)$/))) {
    return notImplemented(res, 'DELETE /species/:id')
  }

  // GET /inventory — species histogram from src/data/park_trees.json
  if (req.method === 'GET' && req.url === '/inventory') {
    try {
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
    } catch (err) {
      return jsonRes(res, 500, { error: err.message })
    }
  }

  // 404
  jsonRes(res, 404, { error: 'route not found', method: req.method, url: req.url })
})

server.listen(PORT, () => {
  console.log(`Arborist backend → http://localhost:${PORT}`)
})
