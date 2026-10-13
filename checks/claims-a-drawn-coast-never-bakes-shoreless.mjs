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
//   - a slab stamped pending does not SHIP: the uploader's plan (`scripts/upload-baked-to-r2.mjs#plan`, imported; it is
//     what Publish, Promote and the CLI all run) refuses it on a scratch tree, naming the look; an unstamped one plans.
//     ⛔ No env, no network: plan() only reads the tree it is given.
// ⭐ MUTATION TEST: `--selftest` — the rule as shipped is GREEN; the warn-and-continue it replaced (no throw, no stamp)
//   is RED; a pending pass that paints a stale median is RED; a serve.js that flags 'ground-shore' too is RED; the
//   uploader with its ground.json read dropped is RED.
//   node checks/claims-a-drawn-coast-never-bakes-shoreless.mjs [--selftest]
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import { shoreMedianFor } from '../cartograph/bake-ground.js'
import { plan } from '../scripts/upload-baked-to-r2.mjs'

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
    const r = outcome(rule, { scene: 'huron', medPath: MED, doc, here: HERE, coastal: () => true, shorePending: false })
    rows.push([`coastal, median ${name}: refuses, naming the town and the file`, !!r.threw && r.threw.includes('huron') && r.threw.includes(MED), r.threw ?? `returned ${JSON.stringify(r.ok)}`])
    const p = outcome(rule, { scene: 'huron', medPath: MED, doc, here: HERE, coastal: () => true, shorePending: true })
    rows.push([`coastal, median ${name}, --shore=pending: no sand, stamped pending`, !!p.ok && !p.ok.paint && p.ok.state === 'pending', JSON.stringify(p.ok ?? p.threw)])
    const n = outcome(rule, { scene: 'inland', medPath: MED, doc, here: HERE, coastal: () => false, shorePending: false })
    rows.push([`no coast (or inland), median ${name}: owes none`, !!n.ok && !n.ok.paint && !n.ok.state, JSON.stringify(n.ok ?? n.threw)])
  }
  const c = outcome(rule, { scene: 'huron', medPath: MED, doc: current, here: HERE, coastal: () => true, shorePending: false })
  rows.push(['coastal, median current: painted', !!c.ok && c.ok.paint === current && !c.ok.state, JSON.stringify(c.ok ?? c.threw)])
  return rows
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
  ]
  for (const [m, ok] of tests) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
  process.exit(tests.every(t => t[1]) ? 0 : 1)
}

const rows = [...judgeRule(shoreMedianFor), ...judgeWiring(groundSrc, serveSrc), ...judgeShip(plan)]
show(rows)
const bad = rows.filter(r => !r[1]).length
console.log(bad ? `⛔ ${bad} row(s): a drawn coast can bake with no shore` : '✅ a drawn coast never bakes shoreless: no current median refuses, except the Bake\'s first pass, which is stamped pending and does not ship')
process.exit(bad ? 1 : 0)
