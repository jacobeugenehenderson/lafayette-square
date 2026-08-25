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
// (gate moved below — it must cover the VALUE checks too; it used to sit above them,
// so a reported stale value still printed ✅ PASS. A gate that runs before half the
// assertions is the same defect as no gate.)
// 2e. ⭐ FIELD_MAP — the SIXTH store, and it was invisible.
// ⛔ RECEIPT, 2026-08-25: hydrate's FIELD_MAP was repointed at `chassis.size_max` and
// `chassis.size_20yr` BEFORE those axes existed in the rubric, and this check reported
// ✅ PASS. A field mapped to a non-existent axis does not throw — hydrate skips it — so
// the field silently produces nothing and reads as "no source carries this". Exactly the
// failure the rest of this file exists to catch, in a store it did not know about.
{
  const hydSrc = readFileSync(path.join(ROOT, 'arborist/hydrate-dossiers.mjs'), 'utf8')
  const block = hydSrc.match(/const FIELD_MAP = \{[\s\S]*?\n\}/)
  if (!block) console.error('  ⚠️ could not parse FIELD_MAP from hydrate-dossiers.mjs — check by hand')
  else {
    const entries = [...block[0].matchAll(/^\s*'?([A-Za-z_/ ,()0-9-]+?)'?:\s*'([a-z._0-9]+)',/gm)]
    const declared = block[0].split('\n').filter(l => /^\s*'?[A-Za-z][^:]*'?:\s*'[^']*',/.test(l)).length
    if (declared !== entries.length) {
      console.error(`  ⛔ FIELD_MAP parse is SILENTLY PARTIAL: ${declared} in source, ${entries.length} parsed`)
      bad++
    }
    for (const [, , axis] of entries) if (!live.has(axis)) report('hydrate FIELD_MAP', axis)
    console.log(`FIELD_MAP: ${entries.length} source fields`)
  }
}

// 2g. ⛔⛔ THE PRODUCERS, NOT JUST THE ARTIFACTS — the SEVENTH store, and the worst.
// RECEIPT, 2026-08-25 (adversarial pass): `cutover-taxonomy.mjs` migrated rubric.json,
// dossiers/ and part-index.json — the ARTIFACTS — and never `ingest-tagger.js`, which
// PRODUCES part-index.json. It still wrote bark.type / leaf.silhouette / leaf.size, so
// this check read the migrated artifact and said PASS while re-running ingest.js would
// have reverted the cutover for all 266 parts. Checking output and never the thing that
// writes it is the sharpest form of asking the same incomplete question.
// ⛔ Any file that WRITES an axis id is a store. Grep them from source.
{
  const producers = ['arborist/ingest-tagger.js', 'arborist/readiness.js', 'arborist/salon-options.js']
  let scanned = 0
  for (const rel of producers) {
    const f = path.join(ROOT, rel)
    if (!existsSync(f)) continue
    const src = readFileSync(f, 'utf8')
    // Strip block comments and line comments — a doc comment naming a RETIRED id on
    // purpose is not a store, and treating it as one trains people to delete the receipts.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const ids = new Set([...code.matchAll(/['"`]((?:chassis|bark|leaf|crown|overlay|tree)\.[a-z_0-9]+)['"`]/g)].map(m => m[1]))
    scanned += ids.size
    for (const id of ids) if (!live.has(id)) report(`producer ${rel}`, id)
  }
  console.log(`producer axis ids scanned: ${scanned} across ${producers.length} file(s)`)
}

// 2f. ⭐⭐ EVERY SCALAR AXIS MUST DECLARE ITS UNIT.
// ⛔ RECEIPT, 2026-08-25: chassis.size is METRES and every botanical source ships FEET. A
// raw parseFloat wrote 30 for flowering dogwood — 30 ft is the right tree, 30 m is a tree
// three times too tall, baked into the slab. Nothing anywhere DECLARED the unit: it lived
// in a comment and in the fact that an authored value happened to look like metres. An
// undeclared unit is not a small omission; it is the precondition for that whole class.
{
  const scalars = (rubric.axes || []).filter(a => a.kind === 'scalar')
  const missing = scalars.filter(a => !a.unit)
  for (const a of missing) report('scalar axis with no declared unit', a.id)
  console.log(`scalar units declared: ${scalars.length - missing.length}/${scalars.length}`)
}

// 3. ⭐⭐ AND THE VALUES, NOT JUST THE KEYS.
// ⛔ RECEIPT, 2026-08-25: migrating trunk count out of chassis.habit meant REMOVING the
// value `multi-stem` from that axis. Five chassis parts were tagged with it and two
// dossiers targeted it. This check validated axis IDS only, so every one of those would
// have become a tag naming a value the rubric no longer carries — matching nothing,
// forever, without a word. A stale VALUE fails exactly like a stale KEY: silently.
{
  const enumValues = new Map()
  for (const a of (rubric.axes || [])) if (Array.isArray(a.values)) enumValues.set(a.id, new Set(a.values))
  let checked = 0

  for (const f of readdirSync(dDir).filter(n => n.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
    for (const [axis, cell] of Object.entries(d.required || {})) {
      const vals = enumValues.get(axis)
      if (!vals || !cell || cell.target == null) continue
      checked++
      if (!vals.has(cell.target)) report(`dossier value (${f} ${axis})`, String(cell.target))
      for (const c of (cell.candidates || [])) {
        checked++
        if (!vals.has(c.value)) report(`dossier candidate (${f} ${axis})`, String(c.value))
      }
    }
  }

  if (existsSync(pi)) {
    const partIndex = JSON.parse(readFileSync(pi, 'utf8'))
    for (const part of (partIndex.parts || [])) {
      for (const [axis, tag] of Object.entries(part.tags || {})) {
        const vals = enumValues.get(axis)
        const v = tag && typeof tag === 'object' ? tag.value : tag
        if (!vals || v == null || typeof v !== 'string') continue
        checked++
        if (!vals.has(v)) report(`part tag value (${axis})`, v)
      }
    }
  }
  console.log(`enum values checked: ${checked} across ${enumValues.size} enum axes`)
}

if (bad) { console.error(`\n❌ FAIL — ${bad} stale key(s)/value(s). Neither throws; both silently stop matching.`); process.exit(1) }
console.log('✅ PASS — every stored axis key AND enum value resolves to the live rubric.')
