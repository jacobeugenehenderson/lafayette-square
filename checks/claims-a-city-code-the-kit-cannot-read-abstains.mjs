#!/usr/bin/env node
/**
 * CLAIM: a St. Louis CITY assessor code the kit cannot read ABSTAINS. It never becomes a plausible land use
 *        (cartograph/parcel-landuse.mjs#classifyParcelLandUse, 'city'): it returns null, so the parcel casts no vote and
 *        the face reads `underived`.
 *
 * ⛔ THE DEFECT (Truss, 2026-10-21, Ward's eye on production HPDM): bare code 5000 was read 'commercial'. It is a mixed
 * bucket (churches, the Board of Education, the State, the zoo district, and ALL of Forest Park as one parcel), so
 * HPDM's whole east third painted commercial tan. 4000–4999 was read 'recreation', but it holds transit, utilities,
 * the railroads and a historical society. Both are removed (Boz's ruling). The specific 51xx–59xx stay commercial,
 * UNVERIFIED until a City code table is sourced.
 *
 * ⭐ IT READS THE CLASSIFIER, IT DOES NOT RESTATE IT: the rows call the live `classifyParcelLandUse`. The mutants cut
 * `classifyCity` out of the module's source, put a removed range back, and evaluate it in memory (node:vm). Nothing
 * is written.
 * ⭐ MUTATION TEST, every run: each removed range put back → RED.
 *   node checks/claims-a-city-code-the-kit-cannot-read-abstains.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { classifyParcelLandUse } from '../cartograph/parcel-landuse.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(join(ROOT, 'cartograph/parcel-landuse.mjs'), 'utf8')

// [code, wanted class (null = abstains), why]
const ROWS = [
  [5000, null, 'bare 5000 — the mixed bucket (Forest Park, churches, the State, schools)'],
  [4000, null, '4000 — transit (Bi-State)'],
  [4600, null, '4600 — a historical society'],
  [4800, null, '4800 — utilities and the railroads'],
  [5300, 'commercial', '5300 — a specific trade code stays commercial'],
  [5811, 'commercial', '5811 — eating places stay commercial'],
  [1110, 'residential', '1110 — residential, unchanged'],
  [1310, 'institutional', '1310 — institutional, unchanged'],
]
const run = (fn) => ROWS.map(([code, want, why]) => { const got = fn(code); return { why, ok: got === want, got, want } })

let bad = 0
for (const r of run((c) => classifyParcelLandUse(c, 'city'))) { if (!r.ok) bad++; console.log(`  ${r.ok ? '✓' : '⛔'} ${r.why}${r.ok ? '' : ` — got ${r.got}, want ${r.want}`}`) }

// `function classifyCity(…) { … }` out of the module's source, by its balanced braces
export function cut(src) {
  const at = src.indexOf('function classifyCity(')
  if (at < 0) return null
  let i = src.indexOf('{', at), depth = 0
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1) }
  return null
}
const fn = cut(SRC)
if (!fn) { bad++; console.log('  ⛔ no `function classifyCity(` in cartograph/parcel-landuse.mjs — the mutants cannot read what they guard') }
else {
  const ANCHOR = "  if (c >= 5001 && c <= 5999) return 'commercial'"
  const MUTANTS = [
    ['bare 5000 read commercial again', (s) => s.replace(ANCHOR, "  if (c >= 5000 && c <= 5999) return 'commercial'")],
    ['4000–4999 read recreation again', (s) => s.replace(ANCHOR, "  if (c >= 4000 && c <= 4999) return 'recreation'\n" + ANCHOR)],
  ]
  for (const [name, mut] of MUTANTS) {
    const m = mut(fn)
    if (m === fn) { bad++; console.log(`  ⛔ mutant "${name}": could not be put back — the anchor moved, so this check is blind to it`); continue }
    const red = run(runInNewContext(`(${m})`)).filter(r => !r.ok)
    if (red.length) console.log(`  ✓ mutant: ${name} → RED (${red.map(r => r.why.split(' —')[0]).join('; ')})`)
    else { bad++; console.log(`  ⛔ mutant: ${name} → still green: this check cannot see the defect it guards`) }
  }
}
console.log(`\n${bad ? `⛔ FAIL — ${bad}` : '✅ PASS'}`)
process.exit(bad ? 1 : 0)
