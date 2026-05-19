#!/usr/bin/env node
/**
 * Meteorologist backend (Phase 1 — read-only).
 *
 * Local-only Node service for the Meteorologist helper app. Mirrors
 * arborist/serve.js patterns. PUT/POST endpoints (autosave) land in
 * Phase 2 alongside the Teacup workstage.
 */
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

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
