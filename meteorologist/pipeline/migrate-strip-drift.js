#!/usr/bin/env node
/**
 * One-shot migration: strip `drift` from every cloud preset.
 *
 * Architectural change (2026-05-20): `drift` was conflating
 * static cloud authoring (Teacup) with dynamics authoring
 * (Conditions). Wind belongs only to Conditions; the Teacup is
 * purely about cloud shape + lighting. Schema cut + preset
 * migration land in the same commit.
 *
 * Run once:
 *   node meteorologist/pipeline/migrate-strip-drift.js public/clouds/presets.json
 *
 * Idempotent — re-running on already-migrated data is a no-op.
 * Kept in repo as a precedent for future schema-narrowing migrations
 * (alongside migrate-params-to-channels.js from Phase 2).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [, , inPath] = process.argv
if (!inPath) {
  console.error('usage: node migrate-strip-drift.js <path-to-presets.json>')
  process.exit(2)
}

const abs = resolve(inPath)
const file = JSON.parse(readFileSync(abs, 'utf8'))

let stripped = 0
let alreadyClean = 0
for (const preset of file.presets || []) {
  if (preset.kind !== 'cloud') continue
  if (preset.params && 'drift' in preset.params) {
    delete preset.params.drift
    stripped += 1
  } else {
    alreadyClean += 1
  }
}

writeFileSync(abs, JSON.stringify(file, null, 2) + '\n')
console.log(`stripped drift from ${stripped} cloud presets; ${alreadyClean} already clean`)
