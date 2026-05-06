/**
 * Meteorologist schema validators.
 *
 * Compiles every schema in pipeline/schema/ once, exports named validators
 * that return { ok, errors } so callers don't deal with ajv directly.
 *
 * Used by:
 *   - bake.js (validates drafts before publishing)
 *   - serve.js (rejects malformed PUT payloads)
 *   - src/lib/almanac-eval.js (validates fixtures during fixture roundtrip)
 *
 * Cross-schema invariants (preset-id uniqueness, almanac→preset reference
 * integrity) are NOT expressible in JSON Schema; bake.js layers those checks
 * on top via validateLibrary() below.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'schema')

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  // Schemas $ref each other by filename; load all of them up front so
  // resolution doesn't need a network or fs hit at validate time.
})
addFormats(ajv)

for (const f of readdirSync(SCHEMA_DIR)) {
  if (!f.endsWith('.schema.json')) continue
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf8'))
  // Register under both the $id and the bare filename so $refs work either way.
  ajv.addSchema(schema, f)
}

function compile(filename) {
  const fn = ajv.getSchema(filename)
  if (!fn) throw new Error(`Schema not loaded: ${filename}`)
  return fn
}

const validators = {
  preset:         compile('preset.schema.json'),
  presetsFile:    compile('presets-file.schema.json'),
  almanac:        compile('almanac.schema.json'),
  weatherPayload: compile('weather-payload.schema.json'),
  directive:      compile('directive.schema.json'),
}

function wrap(name) {
  const fn = validators[name]
  return (data) => {
    const ok = fn(data)
    return ok ? { ok: true, errors: null } : { ok: false, errors: fn.errors }
  }
}

export const validatePreset         = wrap('preset')
export const validatePresetsFile    = wrap('presetsFile')
export const validateAlmanac        = wrap('almanac')
export const validateWeatherPayload = wrap('weatherPayload')
export const validateDirective      = wrap('directive')

/**
 * Cross-schema checks that JSON Schema can't express on its own.
 * Returns { ok, errors: [{path, message}] }.
 */
export function validateLibrary({ presetsFile, almanac }) {
  const errors = []

  // 1. preset id uniqueness
  const seen = new Set()
  for (const p of presetsFile?.presets ?? []) {
    if (seen.has(p.id)) errors.push({ path: `presets[id=${p.id}]`, message: 'duplicate preset id' })
    seen.add(p.id)
  }

  // 2. every almanac directive references presets that exist + are enabled
  const enabledIds = new Set(
    (presetsFile?.presets ?? [])
      .filter(p => p.enabled !== false)
      .map(p => p.id)
  )
  const allIds = new Set((presetsFile?.presets ?? []).map(p => p.id))
  const checkDirective = (directive, where) => {
    for (const c of directive?.clouds ?? []) {
      if (!allIds.has(c.preset)) {
        errors.push({ path: `${where}.clouds[preset=${c.preset}]`, message: 'preset id does not exist' })
      } else if (!enabledIds.has(c.preset)) {
        errors.push({ path: `${where}.clouds[preset=${c.preset}]`, message: 'preset exists but is disabled (enabled=false)' })
      }
    }
  }
  for (const r of almanac?.rules ?? []) checkDirective(r.directive, `rules[id=${r.id}].directive`)
  if (almanac?.fallback) checkDirective(almanac.fallback, 'fallback')

  // 3. cloud-blend weights in any single directive should sum to <= 1.0 (allow <1 for sparse)
  const checkWeights = (directive, where) => {
    const sum = (directive?.clouds ?? []).reduce((a, c) => a + (c.weight ?? 0), 0)
    if (sum > 1.0001) {
      errors.push({ path: `${where}.clouds`, message: `cloud weights sum to ${sum.toFixed(3)}, must be <= 1.0` })
    }
  }
  for (const r of almanac?.rules ?? []) checkWeights(r.directive, `rules[id=${r.id}].directive`)
  if (almanac?.fallback) checkWeights(almanac.fallback, 'fallback')

  return { ok: errors.length === 0, errors }
}

// CLI usage: `node pipeline/validate.js <path-to-presets.json> <path-to-almanac.json>`
// Prints summary, exits non-zero on any error. Used by bake.js + ad-hoc checks.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , presetsPath, almanacPath] = process.argv
  if (!presetsPath || !almanacPath) {
    console.error('usage: node pipeline/validate.js <presets.json> <almanac.json>')
    process.exit(2)
  }
  const presetsFile = JSON.parse(readFileSync(presetsPath, 'utf8'))
  const almanac     = JSON.parse(readFileSync(almanacPath, 'utf8'))

  const r1 = validatePresetsFile(presetsFile)
  const r2 = validateAlmanac(almanac)
  const r3 = validateLibrary({ presetsFile, almanac })

  let failed = 0
  if (!r1.ok) { console.error('presets.json:', r1.errors); failed++ }
  if (!r2.ok) { console.error('almanac.json:', r2.errors); failed++ }
  if (!r3.ok) { console.error('cross-schema:', r3.errors); failed++ }
  if (failed === 0) console.log(`ok: ${presetsFile.presets.length} presets, ${almanac.rules.length} rules`)
  process.exit(failed === 0 ? 0 : 1)
}
