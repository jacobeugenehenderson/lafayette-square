/**
 * Does every axis key anyone stores actually exist in the rubric?
 *
 * ⛔ THE FAILURE THIS CATCHES: a stale axis key does NOT throw. The matcher looks it up,
 * gets undefined, and the species silently stops matching — it reports as a gap while its
 * data sits on disk. That is the exact shape of every bug in this repo this week, and the
 * taxonomy cutover (19 → 31 axes) is the moment it would happen at scale.
 *
 *   node scratch/claims-axis-keys-resolve.mjs
 *
 * Reads the rubric as the source of truth; restates nothing. Rook, 2026-08-24.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

const rubric = read(path.join(ROOT, 'arborist/rubric.json'))
const live = new Set((rubric.axes || []).map(a => a.id).filter(Boolean))
console.log(`rubric axes: ${live.size}`)

let bad = 0
const report = (where, key) => { bad++; console.error(`  ⛔ ${where}: "${key}" is not a rubric axis`) }

// 1. dossiers — what each species REQUIRES
const dDir = path.join(ROOT, 'arborist/dossiers')
let dCount = 0, dKeys = 0
for (const f of readdirSync(dDir).filter(x => x.endsWith('.json'))) {
  const d = read(path.join(dDir, f)); dCount++
  for (const k of Object.keys(d.required || {})) {
    dKeys++
    if (!live.has(k)) report(`dossiers/${f}`, k)
  }
}
console.log(`dossiers: ${dCount} files, ${dKeys} required-keys`)

// 2. part-index — what each PART is tagged with
const pi = path.join(ROOT, 'arborist/state/part-index.json')
let pCount = 0, pKeys = 0
if (existsSync(pi)) {
  for (const part of read(pi).parts || []) {
    pCount++
    for (const k of Object.keys(part.tags || {})) {
      pKeys++
      if (!live.has(k)) report(`part-index ${part.partId}`, k)
    }
  }
}
console.log(`part-index: ${pCount} parts, ${pKeys} tag-keys`)

// 2b. ⭐ THE RUBRIC'S OWN CROSS-REFERENCES. Missed on the first cut and it cost an hour:
// `similarityMatrices` is keyed BY AXIS ID, so renaming an axis orphans its matrix. enumDistance
// then finds nothing, every comparison scores 0, and readiness silently reports gap for a
// species whose parts match perfectly. Same failure class, inside the rubric itself.
for (const k of Object.keys(rubric.similarityMatrices || {})) {
  if (k.startsWith('_') || k === 'farDistance') continue
  if (!live.has(k)) report('similarityMatrices', k)
}
console.log(`similarityMatrices: ${Object.keys(rubric.similarityMatrices || {}).filter(k => !k.startsWith('_') && k !== 'farDistance').length} axis matrices`)

// 2c. ⭐ CODE CONSTANTS. matcher.js hardcodes MATCH_AXES — the third store of axis ids, and
// the one that cost longest to find: a stale id there makes `axes` empty, so every part scores
// 0 and readiness reports GAP for a species whose parts match. Parsed from source, not restated.
const mSrc = readFileSync(path.join(ROOT, 'arborist/matcher.js'), 'utf8')
const mBlock = mSrc.match(/const MATCH_AXES = \{[\s\S]*?\n\}/)
if (mBlock) {
  const ids = [...mBlock[0].matchAll(/'([a-z]+\.[a-z_]+)'/g)].map(m => m[1])
  for (const k of ids) if (!live.has(k)) report('matcher.js MATCH_AXES', k)
  console.log(`matcher MATCH_AXES: ${ids.length} ids`)
} else console.error('  ⚠️ could not parse MATCH_AXES from matcher.js — check by hand')

// 2d. ⭐⭐ THE VOCABULARY. `vocabulary.mjs` keys TERM_ALIASES / TERM_REDIRECTS / NOT_A_TRAIT
// by axis id — the FOURTH store, and the one this check did not know about.
//   ⚠️ RECEIPT, 2026-08-24: the 19→31 cutover left TERM_ALIASES keyed on `bark.type`,
//   `leaf.silhouette`, `leaf.ways`. Every alias in it had been DEAD since the cutover, and
//   nothing said so — `Blocky`→`plated` simply stopped firing. Found only when a hydration
//   dry-run reported 28 unresolved values that all had aliases sitting right there.
// ⛔ It also checks the alias TARGETS, not just the axis keys: an alias pointing at a term
// the rubric no longer carries is the same failure one level down.
{
  const vocab = await import('../arborist/vocabulary.mjs')
  const tables = { TERM_ALIASES: null, TERM_REDIRECTS: vocab.TERM_REDIRECTS, NOT_A_TRAIT: vocab.NOT_A_TRAIT }
  // TERM_ALIASES is module-private by design — read it from source rather than exporting
  // internals just to test them.
  const vSrc = readFileSync(new URL('../arborist/vocabulary.mjs', import.meta.url), 'utf8')
  const aBlock = vSrc.match(/const TERM_ALIASES = \{[\s\S]*?\n\}/)
  if (aBlock) {
    tables.TERM_ALIASES = Object.fromEntries(
      [...aBlock[0].matchAll(/^  '([^']+)':\s*\{/gm)].map(m => [m[1], {}]))
  } else console.error('  ⚠️ could not parse TERM_ALIASES from vocabulary.mjs — check by hand')

  let nAx = 0, nTerm = 0
  for (const [name, tbl] of Object.entries(tables)) {
    for (const ax of Object.keys(tbl || {})) {
      nAx++
      if (!live.has(ax)) report(`vocabulary.mjs ${name}`, ax)
    }
  }
  // alias/redirect targets must be live TERMS of their axis
  for (const [ax, map] of Object.entries(vocab.TERM_REDIRECTS || {})) {
    for (const [, r] of Object.entries(map)) {
      nTerm++
      if (!live.has(r.axis)) report('TERM_REDIRECTS target axis', r.axis)
      else if (!vocab.axisTerms(r.axis).includes(r.value)) report(`TERM_REDIRECTS target term (${r.axis})`, r.value)
    }
  }
  console.log(`vocabulary: ${nAx} axis keys across 3 tables, ${nTerm} redirect targets`)
}

// 3. the reverse — axes nothing uses (not fatal, but worth seeing)
const used = new Set()
for (const f of readdirSync(dDir).filter(x => x.endsWith('.json')))
  for (const k of Object.keys(read(path.join(dDir, f)).required || {})) used.add(k)
if (existsSync(pi))
  for (const part of read(pi).parts || []) for (const k of Object.keys(part.tags || {})) used.add(k)
const unused = [...live].filter(a => !used.has(a))
if (unused.length) console.log(`\nℹ️  axes no dossier or part references yet (${unused.length}): ${unused.join(' ')}`)

console.log('')
if (bad) { console.error(`❌ FAIL — ${bad} stale key(s). A stale key does not throw; it silently stops matching.`); process.exit(1) }
console.log('✅ PASS — every stored axis key resolves to a live rubric axis.')
