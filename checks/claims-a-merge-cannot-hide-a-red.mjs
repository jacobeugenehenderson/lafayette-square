#!/usr/bin/env node
/**
 * A MERGE CANNOT HIDE A NEW RED AMONG OLD ONES (Boz, 2026-11-01: "the safe-tier reds have no baseline").
 *
 * `npm test -- --against <rev>` judges today's safe run against the run RECORDED for <rev>'s tree (`--record`), through
 * checks/_redsDelta.mjs#redsDelta. Claims, each driven or read:
 *   1. DRIVEN on planted record pairs: a red that is NEW (green, not checked or absent before), CHANGED (red before, its
 *      stdout OR stderr different now, or a different failing bucket), UNMEASURED (measured before, not checked now) or
 *      GONE (red before, not run now) blocks; a red with the same output does not; a red now green is FIXED.
 *   2. READ from checks/run.mjs: --against refuses with no record for the tree, a record taken dirty, a base that is not
 *      an ancestor of HEAD, and data changed since the record; the run's exit is the delta's; the streams are hashed
 *      APART with the root path replaced (a combined hash varies under load: 8 parallel runs, 8 distinct, measured); a failing
 *      row keeps its last lines, and a CHANGED red is SHOWN (−/+), never only flagged.
 * Usage: node checks/claims-a-merge-cannot-hide-a-red.mjs [--mutants]
 *   --mutants: each way the delta or the wiring could let a red through → RED.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const row = (label, bucket, stdout = 'o', stderr = 'e') => ({ label, bucket, out: { stdout, stderr } })
const CASES = [
  // [name, base rows, today rows, { kind: [labels] } expected, blocking?]
  ['a red with the same output', [row('a', 'red')], [row('a', 'red')], { same: ['a'] }, false],
  ['a red whose stdout grew', [row('a', 'red')], [row('a', 'red', 'o2')], { changed: ['a'] }, true],
  ['a red whose stderr alone changed', [row('a', 'red')], [row('a', 'red', 'o', 'e2')], { changed: ['a'] }, true],
  ['a red that now times out', [row('a', 'red')], [row('a', 'timedOut')], { changed: ['a'] }, true],
  ['a green gone red', [row('a', 'green')], [row('a', 'red')], { new: ['a'] }, true],
  ['a new check, red', [], [row('a', 'red')], { new: ['a'] }, true],
  ['a not-checked gone red', [row('a', 'notChecked')], [row('a', 'red')], { new: ['a'] }, true],
  ['a new check, blocked', [], [row('a', 'blocked')], { new: ['a'] }, true],
  ['a green that lost its data', [row('a', 'green')], [row('a', 'notChecked')], { unmeasured: ['a'] }, true],
  ['a red that lost its data', [row('a', 'red')], [row('a', 'notChecked')], { unmeasured: ['a'] }, true],
  ['a red check deleted', [row('a', 'red')], [], { gone: ['a'] }, true],
  ['a red now green', [row('a', 'red')], [row('a', 'green')], { fixed: ['a'] }, false],
  ['a not-checked still not checked', [row('a', 'notChecked')], [row('a', 'notChecked')], {}, false],
  ['an old red beside a new one', [row('a', 'red'), row('b', 'green')], [row('a', 'red'), row('b', 'red')], { same: ['a'], new: ['b'] }, true],
]
const KINDS = ['new', 'changed', 'unmeasured', 'gone', 'same', 'fixed']

function drive(D) {
  const fails = []
  for (const [name, base, today, want, blocks] of CASES) {
    let d
    try { d = D.redsDelta({ rows: base }, today) } catch (e) { fails.push(`${name}: threw ${e.message}`); continue }
    for (const k of KINDS) {
      const got = (d[k] || []).map(x => x.label).sort().join(','), exp = (want[k] || []).slice().sort().join(',')
      if (got !== exp) fails.push(`${name}: ${k} is [${got}], not [${exp}]`)
    }
    if ((D.blockingCount(d) > 0) !== blocks) fails.push(`${name}: ${blocks ? 'does not block' : 'blocks'} the gate`)
  }
  let threw = false
  try { D.redsDelta({}, []) } catch { threw = true }
  if (!threw) fails.push('a base record with no rows is compared against, not refused')
  return fails
}

const WIRING = [
  [/no record for its tree/, '--against does not refuse a base with no record'],
  [/if \(base\.dirty\)/, '--against does not refuse a record taken on a dirty tree'],
  [/'merge-base', '--is-ancestor', AGAINST, 'HEAD'/, '--against does not refuse a base that is not an ancestor of HEAD'],
  [/d\.hash !== base\.data\?\.hash/, '--against does not refuse data changed since the record'],
  [/process\.exit\(n \? 1 : 0\)/, "the run's exit under --against is not the delta's"],
  [/out: \{ stdout: fp\(r\.stdout\), stderr: fp\(r\.stderr\) \}/, 'the record does not hash stdout and stderr apart'],
  [/split\(ROOT\.replace\(\/\\\/\$\/, ''\)\)\.join\('<ROOT>'\)/, 'the fingerprint keeps the root path, so two worktrees never match'],
  [/rev-parse', 'HEAD\^\{tree\}'/, 'the record is not keyed by the tree'],
  [/\(green \? \{\} : \{ tail: norm\(r\.stdout\)[^\n]*errTail: norm\(r\.stderr\)/, 'a failing row keeps none of its output, so a CHANGED red cannot be shown'],
  [/for \(const c of d\.changed\)/, '--against flags a CHANGED red without showing what changed'],
]
const wiring = (src) => WIRING.filter(([re]) => !re.test(src)).map(([, why]) => why)

const load = (transform) => importSource('checks/_redsDelta.mjs', transform ? { transform } : {})
const RUN = sourceOf('checks/run.mjs')
const fails = [...drive(await load()), ...wiring(RUN)]
if (fails.length) { console.log('⛔ a merge can hide a red:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log(`✅ a merge cannot hide a red: ${CASES.length} planted record pairs judged as they must be; --against refuses a missing, dirty, unrelated or stale-data base, exits on the delta, and hashes the streams apart`)

if (process.argv.includes('--mutants')) {
  const swap = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] re-aim: "${from.slice(0, 60)}" is gone`); return t.replace(from, to) }
  const DELTA = [
    ['a changed output read as the same red', swap(" || b.out?.stdout !== r.out?.stdout || b.out?.stderr !== r.out?.stderr", '')],
    ['stderr ignored', swap(' || b.out?.stderr !== r.out?.stderr', '')],
    ['a newly unmeasured check let through', swap("d.unmeasured.push({ label, was: b.bucket })", '0')],
    ['a deleted red let through', swap("d.gone.push({ label, was: b.bucket })", '0')],
    ['changed reds not blocking', swap('d.new.length + d.changed.length +', 'd.new.length +')],
    ['blocked and timed-out not failures', swap("new Set(['red', 'blocked', 'timedOut'])", "new Set(['red'])")],
  ]
  const RUNM = [
    ['the dirty refusal removed', swap('if (base.dirty)', 'if (false)')],
    ['the data refusal removed', swap('d.hash !== base.data?.hash', 'false')],
    ['one stream hashed', swap('out: { stdout: fp(r.stdout), stderr: fp(r.stderr) }', 'out: { stdout: fp(r.out), stderr: "" }')],
    ['the exit not the delta', swap('process.exit(n ? 1 : 0)', 'process.exit(0)')],
    ['a failing row keeps no lines', swap("...(green ? {} : { tail: norm(r.stdout)", "...(true ? {} : { tail: norm(r.stdout)")],
    ['a CHANGED red not shown', swap('for (const c of d.changed)', 'for (const c of [])')],
  ]
  let bad = 0
  for (const [name, t] of DELTA) { const f = drive(await load(t)); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  for (const [name, t] of RUNM) { const f = wiring(t(RUN)); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
