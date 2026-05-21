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
import {
  validatePreset, validatePresetsFile,
  validateRule, validateAlmanac, validateLibrary,
  validateModulator, validateModulators,
} from './pipeline/validate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const PRESETS          = join(ROOT, 'public', 'clouds', 'presets.json')
const ALMANAC          = join(ROOT, 'public', 'clouds', 'almanac.json')
const ALMANAC_DEFAULTS = join(ROOT, 'public', 'clouds', 'almanac.defaults.json')
const MODULATORS          = join(ROOT, 'public', 'clouds', 'modulators.json')
const MODULATORS_DEFAULTS = join(ROOT, 'public', 'clouds', 'modulators.defaults.json')
const SPECIALIST_SEED  = join(ROOT, 'meteorologist', 'data', 'specialist-seed.json')
const PORT      = 3335

// ── Boot scaffolding ───────────────────────────────────────────────────────
// Phase 1 is read-only; both files MUST exist (they're scaffolded). Don't
// auto-initialize — silent empties would mask a real misconfiguration.
for (const p of [PRESETS, ALMANAC, ALMANAC_DEFAULTS, MODULATORS, MODULATORS_DEFAULTS]) {
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

    // Cloud Specialist (Nimbus) seed — immutable canon used by Teacup's
    // "Revert to seed" affordance. Lives outside public/ to keep single-
    // source-of-truth; served here so the UI can fetch it.
    if (req.method === 'GET' && path === '/specialist-seed') {
      const d = readJsonOrNull(SPECIALIST_SEED)
      if (!d) return jsonRes(res, 500, { error: 'failed to read specialist-seed.json' })
      return jsonRes(res, 200, d)
    }

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

    // GET /almanac/:id — one rule for tooling + curl sanity checks.
    if (req.method === 'GET' && (m = path.match(/^\/almanac\/([^/]+)$/))) {
      const id = m[1]
      const file = readJsonOrNull(ALMANAC)
      if (!file) return jsonRes(res, 500, { error: 'failed to read almanac.json' })
      const rule = (file.rules || []).find(r => r.id === id)
      if (!rule) return jsonRes(res, 404, { error: 'rule not found', id })
      return jsonRes(res, 200, rule)
    }

    // PUT /almanac/:id — validate body against the rule subschema, splice
    // into rules[], re-validate the whole almanac AND cross-schema
    // (directive.clouds[].preset must reference live presets), then write.
    if (req.method === 'PUT' && (m = path.match(/^\/almanac\/([^/]+)$/))) {
      const id = m[1]
      const incoming = await readBody(req)
      if (!incoming || incoming.id !== id) {
        return jsonRes(res, 400, { error: 'id mismatch', urlId: id, bodyId: incoming?.id })
      }
      const v = validateRule(incoming)
      if (!v.ok) return jsonRes(res, 400, { error: 'schema invalid', details: v.errors })
      const file = readJsonOrNull(ALMANAC)
      if (!file) return jsonRes(res, 500, { error: 'failed to read almanac.json' })
      const idx = (file.rules || []).findIndex(r => r.id === id)
      if (idx < 0) return jsonRes(res, 404, { error: 'rule not found', id })
      const next = { ...file, rules: file.rules.slice() }
      next.rules[idx] = incoming
      const v2 = validateAlmanac(next)
      if (!v2.ok) return jsonRes(res, 400, { error: 'almanac invalid after splice', details: v2.errors })
      const presetsFile = readJsonOrNull(PRESETS)
      const v3 = validateLibrary({ presetsFile, almanac: next })
      if (!v3.ok) return jsonRes(res, 400, { error: 'cross-schema invalid', details: v3.errors })
      writeFileSync(ALMANAC, JSON.stringify(next, null, 2) + '\n')
      return jsonRes(res, 200, { ok: true, id })
    }

    // POST /almanac/:id/revert — copy the matching rule from
    // almanac.defaults.json onto the live almanac.json. Per-condition
    // (not file-wide); other rules are untouched.
    if (req.method === 'POST' && (m = path.match(/^\/almanac\/([^/]+)\/revert$/))) {
      const id = m[1]
      const defaults = readJsonOrNull(ALMANAC_DEFAULTS)
      if (!defaults) return jsonRes(res, 500, { error: 'failed to read almanac.defaults.json' })
      const seed = (defaults.rules || []).find(r => r.id === id)
      if (!seed) return jsonRes(res, 404, { error: 'rule not in defaults', id })
      const file = readJsonOrNull(ALMANAC)
      if (!file) return jsonRes(res, 500, { error: 'failed to read almanac.json' })
      const idx = (file.rules || []).findIndex(r => r.id === id)
      if (idx < 0) return jsonRes(res, 404, { error: 'rule not found in live almanac', id })
      const next = { ...file, rules: file.rules.slice() }
      next.rules[idx] = seed
      const v = validateAlmanac(next)
      if (!v.ok) return jsonRes(res, 500, { error: 'defaults invalid', details: v.errors })
      writeFileSync(ALMANAC, JSON.stringify(next, null, 2) + '\n')
      return jsonRes(res, 200, { ok: true, id, rule: seed })
    }

    // ── Modulators (Phase 6, Halo 2026-05-20) ────────────────────────
    if (req.method === 'GET' && path === '/modulators') {
      const d = readJsonOrNull(MODULATORS)
      if (!d) return jsonRes(res, 500, { error: 'failed to read modulators.json' })
      return jsonRes(res, 200, d)
    }

    if (req.method === 'GET' && (m = path.match(/^\/modulators\/([^/]+)$/))) {
      const id = m[1]
      const file = readJsonOrNull(MODULATORS)
      if (!file) return jsonRes(res, 500, { error: 'failed to read modulators.json' })
      const mod = (file.modulators || []).find(x => x.id === id)
      if (!mod) return jsonRes(res, 404, { error: 'modulator not found', id })
      return jsonRes(res, 200, mod)
    }

    if (req.method === 'PUT' && (m = path.match(/^\/modulators\/([^/]+)$/))) {
      const id = m[1]
      const incoming = await readBody(req)
      if (!incoming || incoming.id !== id) {
        return jsonRes(res, 400, { error: 'id mismatch', urlId: id, bodyId: incoming?.id })
      }
      const v = validateModulator(incoming)
      if (!v.ok) return jsonRes(res, 400, { error: 'schema invalid', details: v.errors })
      const file = readJsonOrNull(MODULATORS)
      if (!file) return jsonRes(res, 500, { error: 'failed to read modulators.json' })
      const idx = (file.modulators || []).findIndex(x => x.id === id)
      if (idx < 0) return jsonRes(res, 404, { error: 'modulator not found', id })
      const next = { ...file, modulators: file.modulators.slice() }
      next.modulators[idx] = incoming
      const v2 = validateModulators(next)
      if (!v2.ok) return jsonRes(res, 400, { error: 'modulators invalid after splice', details: v2.errors })
      writeFileSync(MODULATORS, JSON.stringify(next, null, 2) + '\n')
      return jsonRes(res, 200, { ok: true, id })
    }

    if (req.method === 'POST' && (m = path.match(/^\/modulators\/([^/]+)\/revert$/))) {
      const id = m[1]
      const defaults = readJsonOrNull(MODULATORS_DEFAULTS)
      if (!defaults) return jsonRes(res, 500, { error: 'failed to read modulators.defaults.json' })
      const seed = (defaults.modulators || []).find(x => x.id === id)
      if (!seed) return jsonRes(res, 404, { error: 'modulator not in defaults', id })
      const file = readJsonOrNull(MODULATORS)
      if (!file) return jsonRes(res, 500, { error: 'failed to read modulators.json' })
      const idx = (file.modulators || []).findIndex(x => x.id === id)
      if (idx < 0) return jsonRes(res, 404, { error: 'modulator not found in live file', id })
      const next = { ...file, modulators: file.modulators.slice() }
      next.modulators[idx] = seed
      const v = validateModulators(next)
      if (!v.ok) return jsonRes(res, 500, { error: 'defaults invalid', details: v.errors })
      writeFileSync(MODULATORS, JSON.stringify(next, null, 2) + '\n')
      return jsonRes(res, 200, { ok: true, id, modulator: seed })
    }

    return jsonRes(res, 404, { error: 'route not found', method: req.method, url: req.url })
  } catch (err) {
    return jsonRes(res, 500, { error: err.message, stack: err.stack?.split('\n').slice(0, 5) })
  }
})

server.listen(PORT, () => {
  console.log(`Meteorologist backend → http://localhost:${PORT}`)
  const presets    = readJsonOrNull(PRESETS)?.presets?.length ?? 0
  const almanac    = readJsonOrNull(ALMANAC)?.rules?.length ?? 0
  const modulators = readJsonOrNull(MODULATORS)?.modulators?.length ?? 0
  console.log(`  presets: ${presets}    conditions: ${almanac}    modulators: ${modulators}`)
})
