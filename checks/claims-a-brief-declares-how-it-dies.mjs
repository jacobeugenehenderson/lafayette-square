#!/usr/bin/env node
/**
 * claims-a-brief-declares-how-it-dies — EVERY BRIEF ON THE ROSTER SAYS WHEN IT LEAVES IT.
 *
 * ⛔ THE DISEASE THIS EXISTS TO CATCH: the corpus records DISPATCH and never records RETURN.
 *    Measured 2026-08-31 (`docs/audits/2026-08-31/REPORT-01-root-docs.md §1.2`): of 23 root briefs
 *    and findings docs, 2 still governed work — 8.7%. Twelve were superseded and NONE said so. A
 *    reader could not tell live from dead without reconstructing git history. That is how the
 *    repository root reached 54 markdown files.
 *
 *    On 2026-09-13 it happened again inside a single evening: two briefs written that morning were
 *    finished by that night, and NEITHER FILE SAID SO — they were about to be filed as open work.
 *
 * ⭐ THE CURE IS NOT DILIGENCE, IT IS A DECLARED DEATH CONDITION. A brief that cannot say what
 *    would make it done is not dispatchable, because nobody — including its author — can tell when
 *    to retire it. So every brief carries:
 *
 *        <!-- BRIEF-STATE
 *        status: OPEN | LANDED | PARKED | HOLD | UNVERIFIED
 *        dispatched: no | <agent name>
 *        written: YYYY-MM-DD
 *        evict-when: <a shell command, or RULING: <the question only the operator can answer>>
 *        -->
 *
 * ⛔ THIS CHECK DOES NOT RUN `evict-when`. Running arbitrary commands out of a document would make
 *    this check `live` tier and would execute whatever a brief happens to contain. It asserts that
 *    the condition EXISTS and is well-formed, and prints the commands for a human to run. The
 *    structural claim is the one that can be made safely, so it is the one made here.
 *
 * ⛔ A brief marked LANDED that is still on the roster is the eviction failure itself — that FAILS.
 *
 * ▶ node checks/claims-a-brief-declares-how-it-dies.mjs
 * ▶ node checks/claims-a-brief-declares-how-it-dies.mjs --list   (print every death condition)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'docs/briefs')
const LIST = process.argv.includes('--list')
const STATUSES = new Set(['OPEN', 'LANDED', 'PARKED', 'HOLD', 'UNVERIFIED'])

console.log('BRIEF ROSTER — does every brief say when it leaves the roster?\n')

if (!fs.existsSync(DIR)) {
  console.error(`⛔ ${path.relative(ROOT, DIR)} does not exist.`)
  console.error('   ⛔ This is a LOUD failure on purpose: a check that silently passes when it')
  console.error('      cannot find its subject is the vacuous green this repo keeps re-learning.')
  process.exit(2)
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort()
if (!files.length) { console.error('⛔ No briefs found — the roster cannot be empty and correct.'); process.exit(2) }

const missing = [], malformed = [], unevicted = [], ok = []

for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8')
  const m = src.match(/<!--\s*BRIEF-STATE\s*([\s\S]*?)-->/)
  if (!m) { missing.push(f); continue }

  const field = (k) => (m[1].match(new RegExp(`^\\s*${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim()
  const status = field('status'), evict = field('evict-when'), written = field('written')

  const why = []
  if (!status) why.push('no status')
  else if (!STATUSES.has(status)) why.push(`status "${status}" is not one of ${[...STATUSES].join('/')}`)
  if (!written) why.push('no written date')
  if (!evict) why.push('no evict-when')
  // ⭐ A death condition must be checkable OR explicitly escalated. "when it feels done" is how the
  //    root reached 54 files, so RULING: must name the question, not merely defer.
  else if (/^RULING:/.test(evict) && evict.replace(/^RULING:/, '').trim().length < 12)
    why.push('evict-when is RULING: with no question stated')

  if (why.length) { malformed.push([f, why]); continue }
  if (status === 'LANDED') { unevicted.push([f, evict]); continue }
  ok.push([f, status, evict])
}

if (LIST) for (const [f, s, e] of ok) console.log(`  ${s.padEnd(10)} ${f}\n             ▶ ${e}`)

console.log(`  ${files.length} brief(s) on the roster · ${ok.length} declare a death condition\n`)

let failed = false

if (missing.length) {
  failed = true
  console.log(`⛔ ${missing.length} brief(s) with NO BRIEF-STATE block — nobody can tell when these are done:`)
  for (const f of missing) console.log(`     ${f}`)
  console.log()
}

if (malformed.length) {
  failed = true
  console.log(`⛔ ${malformed.length} brief(s) with an unusable BRIEF-STATE block:`)
  for (const [f, why] of malformed) console.log(`     ${f} — ${why.join(' · ')}`)
  console.log()
}

if (unevicted.length) {
  failed = true
  console.log(`⛔ ${unevicted.length} brief(s) marked LANDED and STILL ON THE ROSTER.`)
  console.log(`   This is the eviction failure itself: a finished brief reads as open work to`)
  console.log(`   everyone who scans the directory. Move it to _archive/ dated, and repoint`)
  console.log(`   every reference in the same commit.`)
  for (const [f] of unevicted) console.log(`     ${f}`)
  console.log()
}

if (!failed) {
  console.log('✅ PASS — every brief declares how it dies, and no landed brief is still on the roster.')
  console.log('   ⛔ This asserts the condition EXISTS, not that it is still unmet. To find briefs')
  console.log('      that are secretly done, run their conditions:')
  console.log('      node checks/claims-a-brief-declares-how-it-dies.mjs --list')
} else {
  console.log('⛔ FAIL — a brief that cannot say what would make it done is not dispatchable, and')
  console.log('   a landed one left on the roster is how a repository root reaches 54 files.')
}

process.exit(failed ? 1 : 0)
