#!/usr/bin/env node
/**
 * seed-presets.js — Apply Cloud Specialist (Nimbus) tunings into presets.json.
 *
 * Reads meteorologist/data/specialist-seed.json and merges params + descriptions
 * into public/clouds/presets.json. Idempotent: presets with `authored:true` are
 * preserved (operator-touched), as are presets carrying the `preserve_authored`
 * flag from the seed (currently only cumulus_humilis, whose Phase 4b.1 hand-tune
 * is canonical).
 *
 * Kind-aware seeding:
 *   - cloud   → 12 cloud-shader params (Phase 2 channel shape)
 *   - stub    → all 12 cloud params (additionalProperties:true allows it)
 *   - fog     → only the 4 fogParams keys (density, baseAlt, thickness,
 *               ambientFloor); fog tint is preserved from the existing preset
 *
 * Re-runnable; safe.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED    = path.resolve(__dirname, '../data/specialist-seed.json')
const PRESETS = path.resolve(__dirname, '../../public/clouds/presets.json')

const FOG_PARAM_KEYS = ['density', 'baseAlt', 'thickness', 'ambientFloor']

function paramChannel(value) {
  return { values: { value } }
}

function seedParamsForKind(kind, seedParams, currentParams) {
  if (kind === 'fog') {
    const out = {}
    for (const k of FOG_PARAM_KEYS) {
      if (k in seedParams) out[k] = paramChannel(seedParams[k])
    }
    if (currentParams?.tint) out.tint = currentParams.tint
    return out
  }
  // cloud + rain + snow + lightning (stubs allow any keys)
  return Object.fromEntries(
    Object.entries(seedParams).map(([k, v]) => [k, paramChannel(v)])
  )
}

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'))
const doc  = JSON.parse(fs.readFileSync(PRESETS, 'utf8'))

const seedById = new Map(seed.presets.map(p => [p.id, p]))
let touched = 0, skipped = 0
const missing = []

doc.presets = doc.presets.map(preset => {
  const s = seedById.get(preset.id)
  if (!s) { missing.push(preset.id); return preset }

  // Operator-touched preset: don't overwrite anything.
  if (preset.authored) { skipped++; return preset }

  // preserve_authored flag from the seed: skip params, but still seed the
  // description (Nimbus's draft is the canonical first caption) and lock
  // the preset by marking authored:true so future re-runs leave it alone.
  if (s.flags?.includes('preserve_authored')) {
    const next = { ...preset, authored: true }
    if (s.description) next.description = s.description
    skipped++
    return next
  }

  const nextParams = seedParamsForKind(preset.kind, s.params, preset.params)
  const next = { ...preset, params: nextParams }
  if (s.description) next.description = s.description
  touched++
  return next
})

fs.writeFileSync(PRESETS, JSON.stringify(doc, null, 2) + '\n')

console.log(`seeded: ${touched}, skipped (authored): ${skipped}, missing: ${missing.length}`)
if (missing.length) console.warn('missing seeds:', missing)
