// claims-the-tiers-are-current.mjs — A DRIFTED checks/TIERS.json STOPS `npm test`, NAMING EVERY CHECK THAT MOVED.
//
// ⭐ WHY (Boz, 2026-10-21): the runner derives each tier at run time and never reads TIERS.json, so a check that turned
//   unreadable left `npm test` SILENTLY while the committed table still said `safe` (two deformer checks, that night).
//   The runner now compares its fresh classification with the committed table before it runs anything
//   (`run.mjs` → `_tiersDrift.mjs#tiersDrift`) and refuses on any drift.
// ⛔ This check cannot classify the suite itself: importing checks/tier.mjs would tier it LIVE (tier.mjs's own text names
//   every effect it hunts for), so `npm test` would never run it. It tests the COMPARISON on planted classifications and
//   reads the runner's WIRING; the runner does the real comparison on every run.
//   1. the comparison: a planted classification equal to its record → no drift; a tier flipped → `changed`, named;
//      an entry dropped from the record → `added`; one invented in the record → `removed`. Each counted.
//   2. the wiring: run.mjs calls tiersDrift on classifyAll() and the committed checks/TIERS.json, and exits non-zero on
//      a drift BEFORE it spawns any check.
//
//   node checks/claims-the-tiers-are-current.mjs [--selftest]
// ⭐ MUTATION TEST (`--selftest`, in memory): a comparison that ignores tier changes, one that ignores added checks, one that
//   ignores removed ones, and a runner whose refusal is gone (or comes after the spawn) → each RED.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tiersDrift, driftCount, driftLines } from './_tiersDrift.mjs'

const SELFTEST = process.argv.includes('--selftest')
const RUNNER = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'run.mjs'), 'utf8')

// planted: a record of three checks and today's classification of the same three
const REC = { checks: [{ file: 'checks/claims-a.mjs', tier: 'safe', why: [] }, { file: 'checks/claims-b.mjs', tier: 'local-effect', why: [] }, { file: 'checks/claims-c.mjs', tier: 'live', why: [] }] }
const TODAY = REC.checks.map(c => ({ ...c, why: ['planted'] }))

const rows = (drift, runner) => {
  const flipped = structuredClone(TODAY); flipped[0].tier = 'live'
  const dropped = { checks: REC.checks.slice(1) }
  const invented = { checks: [...REC.checks, { file: 'checks/claims-gone.mjs', tier: 'safe', why: [] }] }
  const same = drift(REC, TODAY), f = drift(REC, flipped), a = drift(dropped, TODAY), r = drift(invented, TODAY)
  // the wiring, read: the refusal is computed from classifyAll() and the committed table, and exits before any spawn
  const call = runner.indexOf('tiersDrift(JSON.parse(readFileSync(join(ROOT, \'checks/TIERS.json\')'), exit = runner.indexOf('process.exit(1)', call)
  const firstSpawn = runner.search(/\bspawn\(/)
  return [
    ['a classification equal to its record is no drift', driftCount(same) === 0],
    ['a flipped tier is named as changed (safe → live)', f.changed.length === 1 && f.changed[0].file === 'checks/claims-a.mjs' && f.changed[0].to === 'live' && driftLines(f)[0].includes('safe → live')],
    ['a check missing from the record is named as added', a.added.length === 1 && a.added[0].file === 'checks/claims-a.mjs'],
    ['a check the record lists but today does not is named as removed', r.removed.length === 1 && r.removed[0].file === 'checks/claims-gone.mjs'],
    ['the runner compares classifyAll() with the committed TIERS.json', call > 0 && /const all = classifyAll\(\)/.test(runner) && runner.indexOf('const all = classifyAll()') < call],
    ['the runner refuses on a drift before it spawns any check', call > 0 && exit > call && /if \(driftCount\(drift\)\)/.test(runner) && (firstSpawn < 0 || exit < firstSpawn)],
  ]
}

if (SELFTEST) {
  const blind = (k) => (rec, today) => ({ ...tiersDrift(rec, today), [k]: [] })
  const muts = [
    ['a comparison blind to tier changes', blind('changed'), RUNNER, 1],
    ['a comparison blind to added checks', blind('added'), RUNNER, 2],
    ['a comparison blind to removed checks', blind('removed'), RUNNER, 3],
    ['a runner whose refusal is gone', tiersDrift, RUNNER.replace('if (driftCount(drift)) {', 'if (false) {'), 5],
  ]
  let ok = true
  for (const [what, d, runner, row] of muts) { const R = rows(d, runner), red = !R[row][1]
    console.log(`  ${red ? '✅' : '⛔'} mutant · ${what}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'} (${R[row][0]})`); if (!red) ok = false }
  process.exit(ok ? 0 : 1)
}

const R = rows(tiersDrift, RUNNER)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ a drifted TIERS.json stops npm test, naming every check that moved' : '⛔ a drifted TIERS.json would not stop npm test')
process.exit(ok ? 0 : 1)
