/**
 * The two dossier writers must agree — on VOCABULARY, and on the result regardless of
 * which ran last.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR. mint-dossiers and hydrate-dossiers both write `required`,
 * and mint rebuilds a minted stub's block wholesale. mint said `unresolved`/`alternatives`
 * where hydrate says `contested`/`candidates`/`settle`, and the Salon's rail renders only
 * hydrate's names. So running mint last silently replaced the disagreement cells with a
 * shape nothing displays: nine species showed NO contested axes while having ties, and the
 * count moved 47 → 12 with no error anywhere. It hid behind run order, which is why
 * checking one order proves nothing.
 *
 * Two assertions:
 *   1. Every contested cell uses the shared vocabulary and carries sources.
 *   2. mint-then-hydrate and hydrate-then-mint produce the same contested set.
 *
 *   node scratch/claims-dossier-writers-agree.mjs
 */
import { readFileSync, readdirSync, cpSync, rmSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const dDir = path.join(root, 'arborist/dossiers')
let fail = 0

const snapshot = () => {
  const out = new Map()
  for (const f of readdirSync(dDir).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
    for (const [axis, c] of Object.entries(d.required || {})) {
      if (!c?.contested) continue
      out.set(`${f}|${axis}`, (c.candidates || []).map(x => `${x.value}:${(x.sources || []).join('+')}`).sort().join(','))
    }
  }
  return out
}

// 1. shared vocabulary.
// ⛔⛔ THIS MUST RUN ON WHAT THE WRITERS PRODUCE, NOT ON WHAT IS COMMITTED.
// RECEIPT, 2026-08-25 (adversarial pass): this pass used to run ONCE, here, against the
// dossiers as they sat on disk at start — and §2 below then ran the writers and restored
// from backup, so their output was discarded before this ever saw it. Making BOTH writers
// emit `sources: []` on every candidate — the exact condition the loop below declares it
// guards — passed, exit 0. A check that reads committed state cannot assert anything about
// the code that writes it, which is the thing this file's own docstring exists for.
// It is called three times now: the committed state, then after EACH run ordering.
const LEGACY = ['unresolved', 'alternatives']
const assertVocabulary = (label) => {
  for (const f of readdirSync(dDir).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
    for (const [axis, c] of Object.entries(d.required || {})) {
      if (!c || typeof c !== 'object') continue
      for (const k of LEGACY) if (k in c) { console.error(`  ⛔ [${label}] ${f} ${axis}: legacy key \`${k}\` — the Salon rail does not render it`); fail++ }
      if (c.contested) {
        if (!Array.isArray(c.candidates) || !c.candidates.length) { console.error(`  ⛔ [${label}] ${f} ${axis}: contested with no candidates`); fail++ }
        else for (const cand of c.candidates) {
          if (!Array.isArray(cand.sources) || !cand.sources.length) { console.error(`  ⛔ [${label}] ${f} ${axis}: candidate ${cand.value} carries no sources — the operator cannot judge it`); fail++ }
        }
      }
      if (Array.isArray(c.candidates) && !c.contested && !c.settledOver) { console.error(`  ⛔ [${label}] ${f} ${axis}: candidates present but not marked contested — invisible in the Salon`); fail++ }
    }
  }
}
assertVocabulary('committed')

// 2. order independence. Runs against a COPY; the live dossiers are never touched.
const backup = mkdtempSync(path.join(tmpdir(), 'dossiers-'))
cpSync(dDir, backup, { recursive: true })
const run = (script) => execFileSync('node', [path.join(root, 'arborist', script), '--write'], { cwd: root, stdio: 'pipe' })
try {
  run('mint-dossiers.mjs'); run('hydrate-dossiers.mjs')
  const a = snapshot()
  assertVocabulary('mint-then-hydrate')
  run('hydrate-dossiers.mjs'); run('mint-dossiers.mjs')
  const b = snapshot()
  assertVocabulary('hydrate-then-mint')
  const keys = new Set([...a.keys(), ...b.keys()])
  for (const k of keys) {
    if (a.get(k) !== b.get(k)) { console.error(`  ⛔ order-dependent: ${k}\n      mint-last:    ${b.get(k) ?? '(absent)'}\n      hydrate-last: ${a.get(k) ?? '(absent)'}`); fail++ }
  }
  console.log(`contested cells: ${a.size} (mint-then-hydrate) vs ${b.size} (hydrate-then-mint)`)
} finally {
  rmSync(dDir, { recursive: true, force: true })
  cpSync(backup, dDir, { recursive: true })
  rmSync(backup, { recursive: true, force: true })
}

if (fail) { console.error(`\n❌ FAIL — ${fail} problem(s). A blank rail is indistinguishable from agreement.`); process.exit(1) }
console.log('✅ PASS — one vocabulary, every candidate sourced, and the result does not depend on run order.')
