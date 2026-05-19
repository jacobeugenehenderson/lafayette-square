#!/usr/bin/env node
/**
 * One-shot migration: wrap each numeric cloud/fog param in a TodChannel
 * "flat" channel shape so the Meteorologist Teacup can author them with
 * the same primitive Stage uses for Sky & Light.
 *
 * Before:
 *   "params": { "coverage": 0.5, "density": 1.0, ... }
 * After:
 *   "params": { "coverage": { "values": { "value": 0.5 } }, ... }
 *
 * Idempotent: re-running on already-migrated data is a no-op.
 * Skips non-numeric params (e.g. fogParams.tint hex string).
 * Skips kinds that aren't 'cloud' or 'fog' (stubs stay as-is).
 *
 * Usage:
 *   node meteorologist/pipeline/migrate-params-to-channels.js <presets.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function wrapNumber(v) {
  if (typeof v !== 'number') return v
  return { values: { value: v } }
}

function isAlreadyChannel(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && 'values' in v
}

function migrateParams(params) {
  const out = {}
  let touched = 0
  for (const [k, v] of Object.entries(params || {})) {
    if (typeof v === 'number') {
      out[k] = wrapNumber(v)
      touched++
    } else if (isAlreadyChannel(v)) {
      out[k] = v  // already migrated
    } else {
      out[k] = v  // non-numeric (fogParams.tint hex string)
    }
  }
  return { params: out, touched }
}

function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('usage: node migrate-params-to-channels.js <presets.json>')
    process.exit(2)
  }
  const path = resolve(inputPath)
  const file = JSON.parse(readFileSync(path, 'utf8'))
  let wrappedCount = 0
  let presetCount = 0
  for (const p of file.presets || []) {
    if (p.kind !== 'cloud' && p.kind !== 'fog') continue
    const { params, touched } = migrateParams(p.params)
    p.params = params
    if (touched) presetCount++
    wrappedCount += touched
  }
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n')
  console.log(`migrated ${wrappedCount} params across ${presetCount} presets → ${path}`)
}

main()
