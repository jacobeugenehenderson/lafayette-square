#!/usr/bin/env node
// ⛔⛔ CLAIM: a COARSE source value never DECIDES a cell.
//
// The defect this exists for, measured 2026-08-26: SelecTree's `leaf_form` has three
// values in the whole corpus (Simple 30 · Pinnately Compound 3 · Bipinnately Compound 1).
// It answers simple-vs-compound and has NO needle or scale vocabulary, so `Simple` is its
// default for every conifer. Mapped onto our seven-term `leaf.type` it wrote
// `leaf.type: simple` onto White Pine, Austrian Pine and Chinese Juniper — which then
// scored GAP against `long_needle`, a pack already on the shelf, and reached a
// procurement brief as 100 placements of leaves to go buy.
//
// ⭐ It looked CORRECT on 26 broadleaves, where the admitted set happens to collapse to one
// member. That is the signature shape: cleanest on the common case, wrong exactly where
// the axis has more to say. A threshold or a spot-check would never have found it.
//
// ⭐ THIS CHECK READS THE SOURCE. COARSE_FIELDS is parsed out of hydrate-dossiers.mjs, never
// restated here, so it cannot go stale when a new coarse field is declared. Add a field
// there and this check covers it the same day.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const src = readFileSync(path.join(ROOT, 'arborist/hydrate-dossiers.mjs'), 'utf8')

// ── parse COARSE_FIELDS out of the hydrator ─────────────────────────────────
const block = src.match(/const COARSE_FIELDS = \{([\s\S]*?)\n\}/)
if (!block) { console.error('⛔ COARSE_FIELDS not found in hydrate-dossiers.mjs — did it move or get renamed?'); process.exit(1) }
const coarse = new Map()   // field -> Map(value -> admits[])
for (const m of block[1].matchAll(/(\w+):\s*\{\s*axis:\s*'([^']+)',\s*admits:\s*\{([^}]*)\}/g)) {
  const [, field, axis, body] = m
  const vals = new Map()
  for (const v of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    vals.set(v[1], v[2].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean))
  }
  coarse.set(field, { axis, vals })
}
if (!coarse.size) { console.error('⛔ COARSE_FIELDS parsed to nothing — the parser and the declaration have drifted.'); process.exit(1) }
console.log(`parsed ${coarse.size} coarse field(s) from the hydrator: ${[...coarse.keys()].join(', ')}`)
// ⛔ VALUE-LEVEL, NOT FIELD-LEVEL. My first cut keyed this on the FIELD and flagged
// gleditsia and koelreuteria, whose cells came from `leaf_form: "Pinnately Compound"` —
// a value that admits exactly ONE term and therefore legitimately decides. A coarse FIELD
// is not a coarse VALUE; only the under-specified values cannot decide.
const plural = new Set()   // "field|axis|value"
for (const [field, { axis, vals }] of coarse) {
  for (const [v, admits] of vals) if (admits.length > 1) { plural.add(`${field}|${axis}|${v}`); console.log(`  ${field} "${v}" admits ${admits.length}: ${admits.join(' / ')}`) }
}
const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── scan every dossier ──────────────────────────────────────────────────────
const dDir = path.join(ROOT, 'arborist/dossiers')
const fails = []
let checked = 0, open = 0
for (const f of readdirSync(dDir).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
  for (const [axis, cell] of Object.entries(d.required || {})) {
    if (!cell || !cell.sourced) continue          // authored cells are the operator's
    const asked = cell.askedAs || []
    if (!asked.length) continue
    checked++
    // which source FIELDS did this cell's evidence come from?
    // ⭐ The hydrator writes a coarse hint's provenance WITH its value (`field="Simple"`)
    // and a point vote's without. That distinction is what makes this checkable at all.
    const coarseOnly = asked.every(a => {
      const i = a.indexOf(': ')
      const rest = i < 0 ? a : a.slice(i + 2)
      const m = rest.match(/^([^=]+?)\s*=\s*"([^"]*)"/)
      if (!m) return false                      // no value quoted ⇒ a point vote, not a hint
      return plural.has(`${m[1].trim()}|${axis}|${norm(m[2])}`)
    })
    if (!coarseOnly) continue
    if (cell.target != null) {
      fails.push(`${f}  ${axis}  target="${cell.target}" decided by COARSE evidence alone — ${asked.join(' · ')}`)
    } else { open++ }
  }
  // a cell may not carry BOTH a target and an admitted set — that is a contradiction.
  for (const [axis, cell] of Object.entries(d.required || {})) {
    if (cell?.admits && cell.target != null) {
      fails.push(`${f}  ${axis}  carries admits=[${cell.admits.join('/')}] AND target="${cell.target}" — a narrowed cell cannot also be a decided one`)
    }
  }
}

// ⭐⭐⭐ THE CLASS-CATCHER. The check above only proves a DECLARED hint behaved. The original
// defect was that `leaf_form` was never declared coarse in the first place — it was mapped
// onto leaf.type as an ordinary point vote, and nothing anywhere objected.
//
// The signature is measurable without knowing a single species: take every field mapped
// onto an ENUM axis, resolve its observed values, and ask WHICH TERMS OF THAT AXIS THE
// FIELD CAN REACH AT ALL. `leaf_form` reaches 3 of leaf.type's 7 terms — needle, scale and
// frond are unreachable through it by construction. A field that is the SOLE evidence for
// an axis on some species can therefore never produce those terms for them, and will
// instead produce a confident wrong one.
//
// ⛔ This is the town-#2 form: it needs no knowledge of pines, of Lafayette Square, or of
// which species are conifers. Point it at a new source or a new roster and it reports the
// same class on the first run.
import { resolveTerm, axisTerms, normalize as nz, resolveSpecies, aliasesFor } from '../arborist/vocabulary.mjs'

const fm = src.match(/const FIELD_MAP = \{([\s\S]*?)\n\}/)
const FIELD_MAP = {}
if (fm) for (const m of fm[1].matchAll(/^\s*'?([^':\n]+?)'?:\s*'([^']+)',/gm)) FIELD_MAP[m[1]] = m[2]

const OBS = path.join(ROOT, 'scratch/dossier-raw-observations.jsonl')
let obs = []
try { obs = readFileSync(OBS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch {}

if (obs.length) {
  const reach = new Map()      // "field|axis" -> Set(terms)
  const evidence = new Map()   // "species|axis" -> Set(fields)
  for (const o of obs) {
    const axis = FIELD_MAP[o.field]
    if (!axis) continue
    const terms = axisTerms(axis)
    if (!terms.length) continue                     // scalar or unknown — not this check
    const r = resolveTerm(axis, o.value)
    const k = `${o.field}|${axis}`
    if (!reach.has(k)) reach.set(k, new Set())
    if (r.resolved) reach.get(k).add(r.value)
    const ek = `${o.species}|${axis}`
    if (!evidence.has(ek)) evidence.set(ek, new Set())
    evidence.get(ek).add(o.field)
  }
  const declared = new Set([...coarse].map(([f, { axis }]) => `${f}|${axis}`))
  const rows = []
  for (const [k, got] of reach) {
    const [field, axis] = k.split('|')
    const terms = axisTerms(axis)
    if (got.size >= terms.length) continue
    // on how many species is this field the ONLY evidence for that axis?
    let sole = 0
    for (const [ek, fields] of evidence) {
      if (!ek.endsWith('|' + axis)) continue
      if (fields.size === 1 && fields.has(field)) sole++
    }
    if (!sole) continue
    rows.push({ field, axis, got: got.size, of: terms.length, sole, declared: declared.has(k),
                missing: terms.filter(t => !got.has(t)) })
  }
  rows.sort((a, b) => b.sole - a.sole || (a.got / a.of) - (b.got / b.of))
  if (rows.length) {
    console.log(`\n📐 FIELD REACH — a field that is the SOLE evidence for an axis, and cannot reach every term of it:`)
    for (const r of rows) {
      console.log(`   ${r.declared ? '✅ declared' : '⚠️ UNDECLARED'}  ${r.field} → ${r.axis}   reaches ${r.got}/${r.of}, sole evidence on ${r.sole} species`)
      console.log(`        unreachable through this field: ${r.missing.join(' / ')}`)
    }
    console.log(`\n   ⭐ UNDECLARED rows are not automatically defects — a field may simply be the only`)
    console.log(`      one we have. They are where THIS DEFECT LIVES IF IT LIVES ANYWHERE, ranked by`)
    console.log(`      how many species can only ever hear from that one field. Jacob rules on each.`)
  }
}

console.log(`\nchecked ${checked} sourced cell(s) with provenance`)
console.log(`${open} cell(s) correctly left OPEN on coarse evidence alone`)
if (fails.length) {
  console.log(`\n⛔ FAIL — ${fails.length} cell(s) decided by a hint that cannot decide:`)
  for (const x of fails) console.log('   ' + x)
  process.exit(1)
}
console.log('\n✅ PASS — no coarse value decided a cell.')
