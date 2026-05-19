#!/usr/bin/env node
/**
 * Meteorologist backend (Phase 1 — read-only).
 *
 * Local-only Node service for the Meteorologist helper app. Mirrors
 * arborist/serve.js patterns. PUT/POST endpoints (autosave) land in
 * Phase 2 alongside the Teacup workstage.
 */
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { validatePreset, validatePresetsFile } from './pipeline/validate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const PRESETS   = join(ROOT, 'public', 'clouds', 'presets.json')
const ALMANAC   = join(ROOT, 'public', 'clouds', 'almanac.json')
const PORT      = 3335

// ── Boot scaffolding ───────────────────────────────────────────────────────
// Phase 1 is read-only; both files MUST exist (they're scaffolded). Don't
// auto-initialize — silent empties would mask a real misconfiguration.
for (const p of [PRESETS, ALMANAC]) {
  if (!existsSync(p)) {
    console.error(`[meteorologist] required file missing: ${p}`)
    process.exit(1)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null }
}
function jsonRes(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
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

// ── Server ─────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const path = (req.url || '').split('?')[0]

    if (req.method === 'GET' && path === '/presets') {
      const d = readJsonOrNull(PRESETS)
      if (!d) return jsonRes(res, 500, { error: 'failed to read presets.json' })
      return jsonRes(res, 200, d)
    }

    if (req.method === 'GET' && path === '/almanac') {
      const d = readJsonOrNull(ALMANAC)
      if (!d) return jsonRes(res, 500, { error: 'failed to read almanac.json' })
      return jsonRes(res, 200, d)
    }

    // GET /presets/:id — one preset for cold-load consumers (Teacup
    // already has the whole library via /presets; this endpoint is for
    // tooling + curl-based sanity checks).
    let m
    if (req.method === 'GET' && (m = path.match(/^\/presets\/(.+)$/))) {
      const id = m[1]
      const file = readJsonOrNull(PRESETS)
      if (!file) return jsonRes(res, 500, { error: 'failed to read presets.json' })
      const preset = (file.presets || []).find(p => p.id === id)
      if (!preset) return jsonRes(res, 404, { error: 'preset not found', id })
      return jsonRes(res, 200, preset)
    }

    // PUT /presets/:id — validate the body against preset.schema.json,
    // splice it into the in-file presets array, write back. Re-validates
    // the whole presets-file shape afterward as a belt-and-braces check
    // against e.g. accidental cross-preset key collisions a single-record
    // validator can't see.
    if (req.method === 'PUT' && (m = path.match(/^\/presets\/(.+)$/))) {
      const id = m[1]
      const incoming = await readBody(req)
      if (!incoming || incoming.id !== id) {
        return jsonRes(res, 400, { error: 'id mismatch', urlId: id, bodyId: incoming?.id })
      }
      const v = validatePreset(incoming)
      if (!v.ok) return jsonRes(res, 400, { error: 'schema invalid', details: v.errors })
      const file = readJsonOrNull(PRESETS)
      if (!file) return jsonRes(res, 500, { error: 'failed to read presets.json' })
      const idx = (file.presets || []).findIndex(p => p.id === id)
      if (idx < 0) return jsonRes(res, 404, { error: 'preset not found', id })
      const next = { ...file, presets: file.presets.slice() }
      next.presets[idx] = incoming
      const v2 = validatePresetsFile(next)
      if (!v2.ok) return jsonRes(res, 400, { error: 'presets-file invalid after splice', details: v2.errors })
      writeFileSync(PRESETS, JSON.stringify(next, null, 2) + '\n')
      return jsonRes(res, 200, { ok: true, id })
    }

    return jsonRes(res, 404, { error: 'route not found', method: req.method, url: req.url })
  } catch (err) {
    return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
  }
})

server.listen(PORT, () => {
  console.log(`Meteorologist backend → http://localhost:${PORT}`)
  const presets  = readJsonOrNull(PRESETS)?.presets?.length ?? 0
  const almanac  = readJsonOrNull(ALMANAC)?.rules?.length ?? 0
  console.log(`  presets: ${presets}    conditions: ${almanac}`)
})
