#!/usr/bin/env node
/**
 * "DOES STAGE KNOW, ON ENTRY, THAT ITS SLAB IS OLDER THAN WHAT THE BAKE READS?"
 *
 * WHY (Phase 2 A, 2026-10-04): Stage's entry decided staleness as `bakeStale = !entry.bakedAt`, i.e. "ever baked".
 * A reload or a link enters Stage WITHOUT a bake, so a slab older than an overlay, skeleton, design or code edit
 * drew as current, silently. The bake route already knew the real answer (its content records, `bake-reads.json`, and
 * the pour's re-pour question); nothing asked it without baking.
 *
 * Asserts, by READING the source (never a copy of it):
 *  ① serve.js has ONE `runIfDirty` and ONE bake route, answering both POST (bake) and GET (plan) — no second model;
 *  ② the store asks that route (`fetchBakePlan`) on every entry path, and nothing decides staleness from `bakedAt`;
 *  ③ StatusBar alarms on the measured age in Stage and offers the Bake.
 * And RUNS it, a mutation test of the live route against the cartograph server named by --server (never a default): for every Look with a scene, the
 * plan answers; then one data hash in that town's `bake-reads.json` record for the `scene` step is changed — the slab
 * now "read" a different design.json than the one on disk — and the plan MUST name `scene` with design.json in its
 * why. The record is restored byte-for-byte in a finally. ⛔ Nothing is baked; no authoring input is touched.
 *
 * ⛔ THE SERVER MUST SERVE THIS TREE. The mutation edits a file under this check's ROOT, so a server reading another tree
 * (a worktree's check against the main checkout's server) can never see it, and the row means nothing. The check asks
 * the server's GET /tree and REFUSES (exit 2, naming both) unless it is this ROOT. There is no default server: :5173 is
 * the operator's.
 *
 * Usage: node checks/claims-a-stage-entry-knows-its-slab-age.mjs --server=http://localhost:<port>[/api/cartograph]
 */
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = join(import.meta.dirname, '..')
const BASE = process.argv.find(a => a.startsWith('--server='))?.slice('--server='.length).replace(/\/$/, '')
const read = (p) => readFileSync(join(ROOT, p), 'utf-8')
const fails = []
const fail = (m) => { fails.push(m); console.log(`  ✗ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

// ① one model
const serve = read('cartograph/serve.js')
const defs = serve.match(/const runIfDirty = /g)?.length || 0
defs === 1 ? ok('serve.js defines runIfDirty once') : fail(`serve.js defines runIfDirty ${defs}× — a second staleness model`)
const ROUTE = "path.match(/^\\/looks\\/([^/]+)\\/bake$/)"
const routes = serve.split(ROUTE).length - 1
routes === 1 ? ok('one /looks/<id>/bake route') : fail(`${routes} /looks/<id>/bake routes`)
serve.includes(`(req.method === 'POST' || req.method === 'GET') && (m = ${ROUTE})`)
  ? ok('the bake route answers GET (the plan) and POST (the bake) in one body') : fail('the plan is not the bake route walked as a plan')
const runStepHead = serve.slice(serve.indexOf('async function runStep'), serve.indexOf('async function runStep') + 300)
runStepHead.includes('if (P.plan) return') ? ok('runStep runs nothing in a plan') : fail('runStep does not stand down in a plan — a GET could bake')

// ② the store's entry asks it
const store = read('src/cartograph/stores/useCartographStore.js')
const decidedByBakedAt = store.match(/bakeStale:\s*!+[^,}\n]*bakedAt/g) || []
decidedByBakedAt.length ? fail(`the store still decides staleness from bakedAt: ${decidedByBakedAt.join(' · ')}`) : ok('nothing decides staleness from bakedAt')
;/_measureSlabAge:\s*async[\s\S]{0,400}fetchBakePlan\(/.test(store) ? ok('_measureSlabAge asks the bake plan') : fail('_measureSlabAge does not ask fetchBakePlan')
for (const fn of ['_loadLooks', 'setActiveLook', 'runBake']) {
  const a = store.indexOf(`  ${fn}: async`), b = store.indexOf('\n  },\n', a)
  a >= 0 && store.slice(a, b).includes('_measureSlabAge()') ? ok(`${fn} measures the slab's age`) : fail(`${fn} does not measure the slab's age`)
}
const api = read('src/cartograph/api.js')
;/export async function fetchBakePlan[\s\S]{0,200}\/bake`\)/.test(api) ? ok('fetchBakePlan GETs the bake route') : fail('fetchBakePlan does not GET /looks/<id>/bake')

// ③ said out loud in Stage
const bar = read('src/cartograph/StatusBar.jsx')
;/slabAge/.test(bar) && /carto-status--alarm[\s\S]{0,600}runBake\(\)/.test(bar.slice(bar.indexOf('slabAge?.error'))) ? ok('StatusBar alarms on the slab age and offers the Bake') : fail('StatusBar does not alarm on slabAge with a Bake')

// RUN: the live route, and its mutation — only against a server named outright, and only if it serves THIS tree
if (!BASE) { console.log('⛔ NOT RUN — the live half needs the server named: --server=http://localhost:<port>[/api/cartograph]. There is no default.'); process.exit(2) }
let served
try { served = (await (await fetch(`${BASE}/tree`)).json()).root } catch (e) { served = null }
const mine = realpathSync(ROOT)
if (served !== mine) {
  console.log(`⛔ NOT RUN — ${BASE} serves ${served ? `the tree ${served}` : 'no tree it will name (no GET /tree: an older serve.js, restart it)'}, and this check is ${mine}. `
    + 'Its mutation edits a file under its own tree, so another tree\'s server cannot see it. Name the server of this tree.')
  process.exit(2)
}
ok(`${BASE} serves this tree (${mine})`)
let idx
try { idx = await (await fetch(`${BASE}/looks`)).json() } catch (e) { console.log(`⛔ CANNOT RUN the live half — ${BASE} did not answer (${e.message})`); process.exit(2) }
const towns = idx.looks.filter(l => l.scene)
for (const l of towns) {
  const r = await fetch(`${BASE}/looks/${l.id}/bake`)
  const b = await r.json().catch(() => ({}))
  if (r.status === 409) { console.log(`  · ${l.id}: a bake is running — not measured`); continue }
  r.ok && Array.isArray(b.stale) ? ok(`${l.id}: the plan answers (${b.stale.length} step(s) would re-run)`) : fail(`${l.id}: the plan did not answer (${r.status} ${b.error || ''})`)
}
const l = towns.find(t => existsSync(join(ROOT, 'cartograph/data', t.scene, 'clean/bake-reads.json')))
if (!l) fail('no town has a bake-reads.json to mutate — the mutation test could not run')
else {
  const path = join(ROOT, 'cartograph/data', l.scene, 'clean/bake-reads.json')
  const before = readFileSync(path)
  const rec = JSON.parse(before)
  const key = `${l.id}:scene`, designKey = `public/looks/${l.id}/design.json`
  if (!rec[key]?.data?.[designKey]) fail(`${key} has no record of ${designKey} to mutate`)
  else {
    try {
      rec[key].data[designKey] = '0'.repeat(40)
      writeFileSync(path, JSON.stringify(rec, null, 1))
      const b = await (await fetch(`${BASE}/looks/${l.id}/bake`)).json()
      const step = b.stale?.find(s => s.step === 'scene')
      step?.why?.some(w => w.includes(designKey)) ? ok(`mutation: ${l.id}'s design.json differs from what its slab read → the plan names "scene" (${designKey})`)
        : fail(`mutation: ${l.id}'s slab read another design.json and the plan did not say so (${JSON.stringify(step || null)})`)
    } finally { writeFileSync(path, before) }
  }
}
console.log(fails.length ? `\n⛔ ${fails.length} failure(s)` : '\n✅ Stage knows its slab\'s age, from the bake\'s one model')
process.exit(fails.length ? 1 : 0)
