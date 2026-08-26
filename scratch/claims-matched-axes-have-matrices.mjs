#!/usr/bin/env node
// ⛔ CLAIM: every ENUM axis the matcher scores has a similarity matrix.
//
// Without one, enumDistance returns farDistance (9) for ANY non-identical pair
// (matcher.js:53-57) — so the axis is exact-match-or-nothing and every near miss is
// scored as far as every absurd one. `elliptical` cannot reach `ovate`; a bur oak and a
// white oak cannot share a lobed pack.
//
// ⭐ THE ASPIRATION CASE (CLAUDE.md's smell detector): rubric.json's
// `_cutover.similarityMatrices.owed` LISTS all five leaf axes. They were filed as owed and
// never built — a doc describing intent that was never realised. Neither rot to evict nor a
// doc to quietly correct: unbuilt work, surfaced.
//
// ⛔ A matrix is TASTE, not data — rubric `_doc`: "the single place human taste re-enters".
// Nothing here can generate one. This check only proves whether one EXISTS.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const rubric = JSON.parse(readFileSync(path.join(ROOT, 'arborist/rubric.json'), 'utf8'))
const src = readFileSync(path.join(ROOT, 'arborist/matcher.js'), 'utf8')

// read the matched axes out of matcher.js — never restated here
const block = src.match(/const MATCH_AXES = \{([\s\S]*?)\n\}/)
if (!block) { console.error('⛔ MATCH_AXES not found in matcher.js'); process.exit(1) }
// MATCH_AXES groups axis ids by PART TYPE: { chassis: ['chassis.habit', ...], ... }
const matched = [...new Set([...block[1].matchAll(/'([\w]+\.[\w]+)'/g)].map(m => m[1]))]
if (!matched.length) { console.error('⛔ MATCH_AXES parsed to nothing — parser and source have drifted'); process.exit(1) }

const kind = new Map(rubric.axes.map(a => [a.id, a.kind]))
const terms = new Map(rubric.axes.map(a => [a.id, a.values || []]))
const mats = rubric.similarityMatrices || {}
const missing = []
console.log(`matcher scores ${matched.length} axes; checking the enum ones for a matrix\n`)
for (const a of matched) {
  if (kind.get(a) !== 'enum') continue
  const n = (terms.get(a) || []).length
  const pairs = n * (n - 1) / 2
  if (mats[a]) { console.log(`  ✅ ${a.padEnd(20)} matrix present`); continue }
  missing.push({ a, n, pairs })
  console.log(`  ⛔ ${a.padEnd(20)} NO MATRIX — ${n} terms, ${pairs} pairs to author; every near miss scores ${mats.farDistance ?? 9}`)
}
const owed = rubric._cutover?.similarityMatrices?.owed || []
const stillOwed = owed.filter(a => !mats[a])
if (stillOwed.length) console.log(`\n📋 rubric._cutover.similarityMatrices.owed still unbuilt: ${stillOwed.join(', ')}`)

if (missing.length) {
  console.log(`\n⛔ FAIL — ${missing.length} matched enum axis/axes with no matrix.`)
  console.log(`   Total pairs to author: ${missing.reduce((s, m) => s + m.pairs, 0)}`)
  console.log(`   ⭐ This is AUTHORING, not a script — the matrix IS the matcher's taste.`)
  process.exit(1)
}
console.log('\n✅ PASS — every matched enum axis has a similarity matrix.')
