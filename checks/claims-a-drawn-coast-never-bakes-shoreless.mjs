#!/usr/bin/env node
// claims-a-drawn-coast-never-bakes-shoreless.mjs — A TOWN THAT DRAWS A COAST NEVER GETS A GROUND WITH NO SHORE, QUIETLY.
//
// The class (Swale; Boz's ruling 2026-10-12): bake-ground read the shore median from its out-dir, and with none there (or
// a stale one) it printed "⛔ SHORE: … NO shore sand painted" and WROTE the slab. Cairn's Huron dump was taken that way and
// compared against a bake that had the median: 0 against 2 T-junctions, an hour of forensics on two different inputs. A
// town #2 operator gets a shoreless map and never learns it is wrong (Layer 0, question 2).
// The legitimate case: the Bake's FIRST ground pass writes the shoreline the median is walked on, so it cannot have the
// median yet. It says so with `--shore=pending` (serve.js 'ground' only) and stamps the slab; 'ground-shore' re-runs
// without the flag.
// ASSERTS, on the rule itself (`bake-ground.js#shoreMedianFor`, imported) and on the Bake's wiring (serve.js, read):
//   - a coastal town with the median absent, of another version, or walked on another shoreline REFUSES, naming the
//     town and the file; with --shore=pending it paints nothing and is stamped pending; a current median is painted;
//     a town with no coast (or an inland one) owes none;
//   - bakeGround decides through shoreMedianFor (one rule), and parses --shore=pending;
//   - serve.js passes --shore=pending on the 'ground' step and on NO other bake-ground run ('ground-shore' included);
//   - 'ground-shore' runs ONLY when the first pass stamped the shore pending (`shoreRuns.mjs#groundShorePass`, imported):
//     an inland town and a coast whose median was current skip it, each with its reason; a missing first-pass ground.json
//     or an unknown stamp refuses; serve.js decides the step through that rule and skips it by name (Boz, 2026-10-21); it
//     also runs when 'shore-median' re-walked the median in this bake, and a plan whose 'ground' would run (or a new town)
//     says "decided after the first pass" (Zob);
//   - a slab stamped pending does not SHIP: the uploader's plan (`scripts/upload-baked-to-r2.mjs#plan`, imported; it is
//     what Publish, Promote and the CLI all run) refuses it on a scratch tree, naming the look; an unstamped one plans.
//     ⛔ No env, no network: plan() only reads the tree it is given.
// ⭐ MUTATION TEST: `--selftest` — the rule as shipped is GREEN; the warn-and-continue it replaced (no throw, no stamp)
//   is RED; a pending pass that paints a stale median is RED; a serve.js that flags 'ground-shore' too is RED; the
//   uploader with its ground.json read dropped is RED; the old gate (a serve.js that runs 'ground-shore' whenever 'ground'
//   ran) is RED; a rule that always runs the second pass is RED; one that ignores a re-walked median is RED; a plan that
//   decides off the old stamp is RED.
//   node checks/claims-a-drawn-coast-never-bakes-shoreless.mjs [--selftest]
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import { shoreMedianFor } from '../cartograph/bake-ground.js'
import { plan } from '../scripts/upload-baked-to-r2.mjs'
import { groundShorePass } from '../cartograph/shoreRuns.mjs'

const R = new URL('../', import.meta.url).pathname
const groundSrc = readFileSync(R + 'cartograph/bake-ground.js', 'utf8')
const serveSrc = readFileSync(R + 'cartograph/serve.js', 'utf8')

const HERE = 'fp-now', MED = '/x/huron/shore-median.json'
const current = { version: 2, shoreFingerprint: HERE }
const cases = [
  ['absent', null], ['another version', { version: 1, shoreFingerprint: HERE }],
  ['another shoreline', { version: 2, shoreFingerprint: 'fp-old' }],
]
const outcome = (rule, a) => { try { return { ok: rule(a) } } catch (e) { return { threw: String(e.message) } } }

function judgeRule(rule) {
  const rows = []
  for (const [name, doc] of cases) {
    const r = outcome(rule, { scene: 'huron', medPath: MED, doc, here: HERE, coastal: () => true, shorePending: false }) /* fixture */
    rows.push([`coastal, median ${name}: refuses, naming the town and the file`, !!r.threw && r.threw.includes('huron') && r.threw.includes(MED), r.threw ?? `returned ${JSON.stringify(r.ok)}`]) /* fixture */
    const p = outcome(rule, { scene: 'huron', medPath: MED, doc, here: HERE, coastal: () => true, shorePending: true }) /* fixture */
    rows.push([`coastal, median ${name}, --shore=pending: no sand, stamped pending`, !!p.ok && !p.ok.paint && p.ok.state === 'pending', JSON.stringify(p.ok ?? p.threw)])
    const n = outcome(rule, { scene: 'inland', medPath: MED, doc, here: HERE, coastal: () => false, shorePending: false })
    rows.push([`no coast (or inland), median ${name}: owes none`, !!n.ok && !n.ok.paint && !n.ok.state, JSON.stringify(n.ok ?? n.threw)])
  }
  const c = outcome(rule, { scene: 'huron', medPath: MED, doc: current, here: HERE, coastal: () => true, shorePending: false }) /* fixture */
  rows.push(['coastal, median current: painted', !!c.ok && c.ok.paint === current && !c.ok.state, JSON.stringify(c.ok ?? c.threw)])
  return rows
}

// the second pass's gate, on the first pass's ground.json
function judgeGate(gate) {
  const g = (ground, medianWritten, more = {}) => outcome(() => gate(ground, { medianWritten, ...more }))
  const inland = g({}, false), current = g({}, true), pending = g({ shore: 'pending' }, true), none = g(null, false), odd = g({ shore: 'later' }, true)
  const rewalked = g({}, true, { medianRan: true }), inlandRan = g({}, false, { medianRan: true })
  const planStale = g({}, true, { plan: true, groundStale: true }), planNew = g(null, false, { plan: true }), planClean = g({}, true, { plan: true })
  return [
    ["the median re-walked in this bake ('shore-median' ran, median written): runs, so new sand never ships under an old ground", rewalked.ok?.run === true, JSON.stringify(rewalked.ok ?? rewalked.threw)],
    ["inland with 'shore-median' run (it wrote nothing): still skipped", inlandRan.ok?.run === false && /inland/.test(inlandRan.ok.why), JSON.stringify(inlandRan.ok ?? inlandRan.threw)],
    ["a plan whose 'ground' would run: decided after the first pass, never off the old stamp", planStale.ok?.run === null && /after the first pass/.test(planStale.ok.why), JSON.stringify(planStale.ok ?? planStale.threw)],
    ['a plan for a town with no ground.json yet: decided after the first pass, no throw', planNew.ok?.run === null, JSON.stringify(planNew.ok ?? planNew.threw)],
    ["a plan whose 'ground' is clean decides as a bake would", planClean.ok?.run === false, JSON.stringify(planClean.ok ?? planClean.threw)],
    ["inland (no stamp, no median written): 'ground-shore' skipped, saying so", inland.ok?.run === false && /inland/.test(inland.ok.why), JSON.stringify(inland.ok ?? inland.threw)],
    ["median current (no stamp, median written): skipped, saying so", current.ok?.run === false && /median current/.test(current.ok.why), JSON.stringify(current.ok ?? current.threw)],
    ["the first pass stamped the shore pending: 'ground-shore' runs", pending.ok?.run === true, JSON.stringify(pending.ok ?? pending.threw)],
    ['no first-pass ground.json refuses', !!none.threw, JSON.stringify(none.ok ?? none.threw)],
    ['a shore stamp the rule does not know refuses', !!odd.threw, JSON.stringify(odd.ok ?? odd.threw)],
  ]
}
// every bake-ground command serve.js runs, by step name: runIfDirty('<step>', …, `node bake-ground.js …`
function bakeGroundSteps(src) {
  const out = []
  for (const m of src.matchAll(/runIfDirty\('([^']+)'/g)) {
    const next = src.indexOf('runIfDirty(', m.index + 1), body = src.slice(m.index, next < 0 ? undefined : next)
    const cmd = body.match(/`node bake-ground\.js[^`]*`/)
    if (cmd) out.push([m[1], cmd[0]])
  }
  return out
}
function judgeWiring(gsrc, ssrc) {
  const steps = bakeGroundSteps(ssrc), flagged = steps.filter(([, c]) => c.includes('--shore=pending')).map(([s]) => s)
  return [
    ['serve.js runs bake-ground on \'ground\' and \'ground-shore\'', steps.some(([s]) => s === 'ground') && steps.some(([s]) => s === 'ground-shore'), steps.map(([s]) => s).join(', ')],
    ['only the \'ground\' step passes --shore=pending', flagged.length === 1 && flagged[0] === 'ground', `flagged: ${flagged.join(', ') || 'none'}`],
    ['bakeGround decides the shore through shoreMedianFor', /bakeGround\(\{[^]*shoreMedianFor\(\{/.test(gsrc.slice(gsrc.indexOf('export async function bakeGround'))), 'bake-ground.js'],
    ['bake-ground parses --shore=pending', /arg === '--shore=pending'/.test(gsrc), 'bake-ground.js main'],
    ['no warn-and-continue shore branch is left', !/NO shore sand painted/.test(gsrc), 'bake-ground.js'],
    ["serve.js feeds the gate this bake's 'shore-median' (ranSteps, or a plan's stale list) and a plan's stale 'ground'", /medianRan: P\.plan \? inPlan\('shore-median'\) : ranSteps\.includes\('shore-median'\), plan: !!P\.plan, groundStale: inPlan\('ground'\)/.test(ssrc) && /if \(shorePass\.run === null\) P\.plan\.stale\.push/.test(ssrc), 'serve.js'],
    ["serve.js decides 'ground-shore' through groundShorePass, and skips it by name", /const shorePass = groundShorePass\(/.test(ssrc) && /if \(shorePass\.run\) await runIfDirty\('ground-shore'/.test(ssrc) && /else \{ skip\(`ground-shore \(\$\{shorePass\.why\}\)`\)/.test(ssrc), 'serve.js'],
  ]
}
// a scratch baked tree: one look stamped pending, one not
const scratch = mkdtempSync(join(tmpdir(), 'shore-pending-'))
for (const [l, g] of [['wet', { shore: 'pending' }], ['dry', {}]]) { mkdirSync(join(scratch, l)); writeFileSync(join(scratch, l, 'ground.json'), JSON.stringify(g)) }
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))
function judgeShip(planFn) {
  const p = outcome(planFn, { look: 'wet', prefix: 'scratch/', root: scratch })
  const d = outcome(planFn, { look: 'dry', prefix: 'scratch/', root: scratch })
  return [
    ['the uploader refuses a slab stamped shore: "pending", naming the look', !!p.threw && p.threw.includes('"wet"') && p.threw.includes('pending'), p.threw ?? `planned ${p.ok?.files?.length} file(s)`],
    ['the uploader plans an unstamped slab', !!d.ok && d.ok.files.length === 1, d.threw ?? `planned ${d.ok.files.length} file(s)`],
  ]
}
const show = (rows) => { for (const [n, ok, w] of rows) console.log(`  ${ok ? '✅' : '⛔'} ${n} (${w})`) }

if (process.argv.includes('--selftest')) {
  // the replaced behaviour, planted: a coast with no current median paints nothing and goes on (a warning, no stamp)
  const warnAndContinue = ({ doc, here }) => (doc && doc.version === 2 && doc.shoreFingerprint === here) ? { paint: doc, state: null } : { paint: null, state: null }
  // a pending pass that paints whatever median it finds
  const pendingPaintsStale = (a) => a.shorePending && a.doc ? { paint: a.doc, state: 'pending' } : shoreMedianFor(a)
  const groundShoreFlagged = serveSrc.replace(/(runIfDirty\('ground-shore'[^]*?`node bake-ground\.js[^`]*)`/, '$1 --shore=pending`')
  // the uploader with its ground.json read dropped, imported from a scratch copy (its relative imports made absolute)
  const upSrc = readFileSync(R + 'scripts/upload-baked-to-r2.mjs', 'utf8'), READ = "if (ground?.shore === 'pending')"
  if (upSrc.split(READ).length !== 2) throw new Error('the uploader\'s pending read is not found exactly once — the self-test is stale')
  const mutPath = join(scratch, 'upload-noread.mjs')
  writeFileSync(mutPath, upSrc.replace(READ, 'if (false)')
    .replace(/from '\.\.\/([^']+)'/g, (_, p) => `from '${pathToFileURL(R + p).href}'`)
    .replace(/from '\.\/([^']+)'/g, (_, p) => `from '${pathToFileURL(R + 'scripts/' + p).href}'`)
    .replace("new URL('..', import.meta.url)", `new URL('${pathToFileURL(R).href}')`))
  const noRead = (await import(pathToFileURL(mutPath).href)).plan
  const tests = [
    ['the uploader as shipped refuses a pending slab', judgeShip(plan).every(r => r[1])],
    ['the uploader with the read dropped is RED', judgeShip(noRead).some(r => !r[1])],
    ['the rule as shipped is GREEN', judgeRule(shoreMedianFor).every(r => r[1])],
    ['warn-and-continue (the replaced branch) is RED', judgeRule(warnAndContinue).some(r => !r[1])],
    ['a pending pass painting a stale median is RED', judgeRule(pendingPaintsStale).some(r => !r[1])],
    ['the wiring as shipped is GREEN', judgeWiring(groundSrc, serveSrc).every(r => r[1])],
    ["'ground-shore' flagged pending too is RED", groundShoreFlagged !== serveSrc && judgeWiring(groundSrc, groundShoreFlagged).some(r => !r[1])],
    ['the gate as shipped is GREEN', judgeGate(groundShorePass).every(r => r[1])],
    ['a gate that always runs the second pass is RED', judgeGate(() => ({ run: true, why: 'always' })).some(r => !r[1])],
    ["a gate that ignores a re-walked median is RED", judgeGate((gr, o) => groundShorePass(gr, { ...o, medianRan: false })).some(r => !r[1])],
    ['a plan that decides off the old stamp is RED', judgeGate((gr, o) => groundShorePass(gr ?? {}, { ...o, plan: false })).some(r => !r[1])],
    ["the old gate (serve.js runs 'ground-shore' whenever 'ground' ran) is RED", (() => { const old = serveSrc.replace('if (shorePass.run) await runIfDirty(', 'await runIfDirty(')
      return old !== serveSrc && judgeWiring(groundSrc, old).some(r => !r[1]) })()],
  ]
  for (const [m, ok] of tests) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(tests.every(t => t[1]) ? 0 : 1)
}

const rows = [...judgeRule(shoreMedianFor), ...judgeGate(groundShorePass), ...judgeWiring(groundSrc, serveSrc), ...judgeShip(plan)]
show(rows)
const bad = rows.filter(r => !r[1]).length
console.log(bad ? `⛔ ${bad} row(s): a drawn coast can bake with no shore` : '✅ a drawn coast never bakes shoreless: no current median refuses, except the Bake\'s first pass, which is stamped pending and does not ship')
process.exit(bad ? 1 : 0)
