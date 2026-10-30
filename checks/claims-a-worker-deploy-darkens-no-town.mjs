#!/usr/bin/env node
/**
 * "WOULD DEPLOYING THIS WORKER TAKE A LIVE TOWN DARK?"
 *
 * WHY (2026-09-28, Warden). Both Workers decide a town is live by HEADing its `manifest.json`
 * (9f4966ee, `claims-a-town-is-live-by-its-manifest`). A town published before it had a manifest
 * has `scene.json` in R2 and no `manifest.json`: the Worker in the repo 404s it; the one deployed
 * today serves it. Deploying first darkens it, and nothing else would say so.
 *
 * STAGING — for every registered town whose slab is published there (`scene.json` answers), its
 * `manifest.json` must answer. Read-only HEADs through the public bucket origin.
 * ⭐ STAGING ALSO NEEDS THE TOWN'S PLAYER RECORD (`staging/sites/<map>/player.json`, BRIEF-ward-on-staging,
 * 2026-09-28): the staging Worker 404s a town that names no player, so a town published before its record
 * would go dark. ▶ node scripts/set-staging-player.mjs --map=<t> --player=ward, then deploy.
 *
 * PRODUCTION — the towns are what production-sites reads: every `hosts/<host>.json` record (Promote's), listed
 * from the bucket. Each is put through the Worker's own `route.js#route` for a page, and every key the Worker asks
 * for before it serves that page must be there: the slab's `manifest.json`, a Ward town's kit `manifest.json`, and
 * the page itself (`ward/<sha>/index.html`, or a legacy town's `player/<map>/index.html`) — `index.js`'s document
 * branch. ⛔ Not a list of towns, and not the legacy key alone (Ward, 2026-10-30): that gate counted a town as served
 * only if `player/<map>/index.html` existed, so HPDM, promoted to the Ward only, was skipped, and PTown passed on a
 * leftover. Read through the R2 API with Wrangler's sign-in, because the Worker reads R2 by its binding with no edge
 * in front, and an edge copy of a record can be stale. (lafayette-square.com's Pages site is not this Worker.)
 *
 * ⭐ IT RUNS BEFORE EVERY `wrangler deploy` of either Worker (each wrangler.jsonc's build.command), so
 * the deploy itself refuses. ▶ The cure is the order in PUBLISH.md §0.5: (a) publish every town with
 * its manifest, THEN (b) deploy.
 *
 * ⭐ STAGING ONLY: AN OPERATOR MAY ACCEPT A TOWN GOING DARK, BY NAME, FOR ONE DEPLOY (Jacob,
 * 2026-09-29: "3 is fine for today" — LS left off staging while provincetown and huron go to the Ward).
 *   ACCEPT_DARK=lafayette-square npx wrangler deploy      (comma-separate several)
 * Each accepted town is printed as going dark BY THAT DECISION. ⛔ Never production. ⛔ A town named
 * that would NOT go dark fails the gate — an acknowledgment that outlives its reason is a stale skip.
 * ⛔ It lives on the command line of one deploy, never in this file or in wrangler.jsonc.
 *
 * Usage: node checks/claims-a-worker-deploy-darkens-no-town.mjs [--env=staging|prod]   (default: both)
 *        node checks/claims-a-worker-deploy-darkens-no-town.mjs --mutants   (production's reading, on fixtures; no network)
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, basename } from 'node:path'
import { registeredMaps } from '../src/instances/registry.js'
import { route } from '../workers/production-sites/src/route.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = (process.env.ASSET_BASE || 'https://assets.theward.online/').replace(/\/?$/, '/')
const ENVS = { staging: 'staging/', prod: '' }

// ── production: what production-sites reads ────────────────────────────────────────────────────────────────

/** The R2 objects API over `call(path, query) → {status, body}` (`path` '' lists; '/<key>' gets one object). */
function r2Store(call) {
  return {
    async list(prefix) {
      const keys = []
      let cursor = null
      do {
        const r = await call('', { prefix, per_page: '1000', ...(cursor ? { cursor } : {}) })
        if (r.status !== 200) throw new Error(`listing ${prefix} answered ${r.status}`)
        const j = JSON.parse(r.body)
        if (!j.success) throw new Error(`listing ${prefix}: ${JSON.stringify(j.errors)}`)
        keys.push(...j.result.map((o) => o.key))
        cursor = j.result_info?.is_truncated ? j.result_info.cursor : null
      } while (cursor)
      return keys
    },
    async get(key) {
      const r = await call('/' + key.split('/').map(encodeURIComponent).join('/'))
      if (r.status === 404) return null
      if (r.status !== 200) throw new Error(`${key} answered ${r.status}`)
      return r.body
    },
  }
}

/** What production-sites does before it serves this record's page (`index.js`, the document branch). */
async function prodVerdict(rec, store) {
  const r = route('/', rec)
  if (r.kind === 'refuse') return { dark: `the Worker refuses its record (${r.status}): ${r.why}` }
  const need = [`baked/${rec.look}/manifest.json`]
  if (r.app === 'ward') need.push(`kit/${rec.kit}/manifest.json`)
  need.push(r.key)
  const got = await Promise.all(need.map((k) => store.get(k)))
  const missing = need.filter((k, i) => got[i] == null)
  return missing.length ? { dark: `nothing at ${missing.join(', ')}` } : { ok: `${r.app}: ${need.join(' · ')}` }
}

/** → { [host]: 'ok' | 'dark' | 'uncertain' }, printing each. `'*'` holds a failure to list at all. */
async function prodRun(store, say = console) {
  const out = {}
  let keys
  try { keys = (await store.list('hosts/')).filter((k) => k.endsWith('.json')) } catch (err) {
    say.error(`  ⛔ prod    the host records (hosts/) could not be listed: ${err.message} — refusing to say it is safe`)
    return { '*': 'uncertain' }
  }
  if (!keys.length) say.log('  ·  prod    no host records: no town is promoted, so none can go dark')
  for (const key of keys) {
    const host = key.slice('hosts/'.length, -'.json'.length)
    try {
      const body = await store.get(key)
      if (body == null) throw new Error(`${key} was listed and then not there`)
      const rec = JSON.parse(body)
      const v = await prodVerdict(rec, store)
      const tag = `${'prod'.padEnd(8)}${host.padEnd(26)}→ ${String(rec.map).padEnd(18)}`
      if (v.ok) { out[host] = 'ok'; say.log(`  ✅ ${tag} ${v.ok}`) }
      else { out[host] = 'dark'; say.error(`  ⛔ ${tag} this Worker would not serve it — ${v.dark}. Promote it again.`) }
    } catch (err) {
      out[host] = 'uncertain'
      say.error(`  ⛔ prod    ${host.padEnd(26)} could not be read (${err.message}) — refusing to say it is safe`)
    }
  }
  return out
}

/** The live store: the R2 API, with the sign-in Wrangler already holds; the bucket is the Worker's binding. */
async function liveStore() {
  const bucket = (readFileSync(join(REPO_ROOT, 'workers/production-sites/wrangler.jsonc'), 'utf8')
    .match(/"bucket_name"\s*:\s*"([^"]+)"/) || [])[1]
  if (!bucket) throw new Error('workers/production-sites/wrangler.jsonc names no bucket_name')
  const env = { ...process.env }
  for (const k of ['WATCH_REPORT_DEPENDENCIES', 'NODE_CHANNEL_FD']) delete env[k]   // see bind-production-domain.mjs
  const tok = execFileSync('npx', ['wrangler', 'auth', 'token'], { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .trim().split('\n').pop().trim()
  if (!tok) throw new Error('`npx wrangler auth token` printed no token — run `npx wrangler login`')
  const api = async (path) => {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { authorization: `Bearer ${tok}` } })
        return { status: r.status, body: await r.text() }
      } catch (err) { if (i === 2) throw err }
    }
  }
  const accounts = JSON.parse((await api('/accounts')).body).result || []
  const owners = []
  for (const a of accounts) if ((await api(`/accounts/${a.id}/r2/buckets/${bucket}`)).status === 200) owners.push(a.id)
  if (owners.length !== 1) throw new Error(`${owners.length} of this sign-in's ${accounts.length} account(s) hold the bucket "${bucket}"`)
  return r2Store((path, query) => api(`/accounts/${owners[0]}/r2/buckets/${bucket}/objects${path}${query ? '?' + new URLSearchParams(query) : ''}`))
}

// ── fixtures: production's reading against a fake R2 API that pages one object at a time ─────────────────────

const W = 'a'.repeat(40), K = 'b'.repeat(40)
const wardTown = (map) => ({
  [`hosts/${map}.online.json`]: JSON.stringify({ v: 2, app: 'ward', map, look: map, domain: `${map}.online`, ward: W, kit: K }),
  [`baked/${map}/manifest.json`]: '{}', [`kit/${K}/manifest.json`]: '{}', [`ward/${W}/index.html`]: '<!doctype html>',
})
const without = (o, ...ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)))
const both = { ...wardTown('provincetown'), ...wardTown('hipointedemun') }
const legacy = { 'hosts/ls.online.json': JSON.stringify({ v: 2, app: 'legacy', map: 'lafayette-square', look: 'lafayette-square' }),
  'baked/lafayette-square/manifest.json': '{}', 'player/lafayette-square/index.html': '<!doctype html>' }
const CASES = [
  ['two Ward towns, PTown with a leftover legacy key', { ...both, 'player/provincetown/index.html': 'x' }, { 'provincetown.online': 'ok', 'hipointedemun.online': 'ok' }],
  ['PTown\'s legacy key removed: PTown is still seen', both, { 'provincetown.online': 'ok', 'hipointedemun.online': 'ok' }],
  ['HPDM with no slab manifest', without(both, 'baked/hipointedemun/manifest.json'), { 'provincetown.online': 'ok', 'hipointedemun.online': 'dark' }],
  ['a Ward town whose kit is not in production', without(wardTown('provincetown'), `kit/${K}/manifest.json`), { 'provincetown.online': 'dark' }],
  ['a Ward town whose pinned build has no page', without(wardTown('provincetown'), `ward/${W}/index.html`), { 'provincetown.online': 'dark' }],
  ['a legacy town with its player', legacy, { 'ls.online': 'ok' }],
  ['a legacy town with no player', without(legacy, 'player/lafayette-square/index.html'), { 'ls.online': 'dark' }],
  ['a record naming no player the Worker plays', { 'hosts/x.online.json': JSON.stringify({ v: 2, app: 'kit', map: 'x', look: 'x' }), 'baked/x/manifest.json': '{}' }, { 'x.online': 'dark' }],
  ['the records cannot be listed', null, { '*': 'uncertain' }],
]
function fakeApi(objects) {
  return async (path, query) => {
    if (!objects) return { status: 500, body: '' }
    if (path) {
      const key = decodeURIComponent(path.slice(1))
      return key in objects ? { status: 200, body: objects[key] } : { status: 404, body: '' }
    }
    const keys = Object.keys(objects).filter((k) => k.startsWith(query.prefix)).sort()
    const at = query.cursor ? keys.indexOf(query.cursor) : 0
    const more = at + 1 < keys.length
    return { status: 200, body: JSON.stringify({ success: true, errors: [], result: keys.slice(at, at + 1).map((key) => ({ key })),
      ...(more ? { result_info: { is_truncated: true, cursor: keys[at + 1] } } : {}) }) }
  }
}
async function selfTest() {
  const quiet = { log() {}, error() {} }
  const fails = []
  for (const [name, objects, want] of CASES) {
    const got = await prodRun(r2Store(fakeApi(objects)), quiet)
    if (JSON.stringify(got, Object.keys(got).sort()) !== JSON.stringify(want, Object.keys(want).sort())) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
  return fails
}

// ── mutants: each a copy beside this file, run with --self-test, must fail ─────────────────────────────────
const MUTANTS = [
  ['the legacy key gates a Ward town again', 'need.push(r.key)', 'need.push(r.key, `player/${rec.map}/index.html`)'],
  ['the slab manifest not asked for', 'const need = [`baked/${rec.look}/manifest.json`]', 'const need = []'],
  ['the kit manifest not asked for', "if (r.app === 'ward') need.push(`kit/${rec.kit}/manifest.json`)", ''],
  ['the page not asked for', 'need.push(r.key)', ''],
  ['only the first page of records read', 'cursor = j.result_info?.is_truncated ? j.result_info.cursor : null', 'cursor = null'],
  ['an unlistable bucket read as no towns', "if (r.status !== 200) throw new Error(`listing ${prefix} answered ${r.status}`)", 'if (r.status !== 200) return keys'],
]

const SELF = fileURLToPath(import.meta.url)
if (process.argv.includes('--self-test') || process.argv.includes('--mutants')) {
  const fails = await selfTest()
  if (fails.length) { console.error(`⛔ production's reading is wrong:\n   ${fails.join('\n   ')}`); process.exit(1) }
  if (process.argv.includes('--self-test')) process.exit(0)
  console.log(`✅ production's reading: ${CASES.length} fixtures`)
  let alive = 0
  const src = readFileSync(SELF, 'utf8')
  for (const [name, from, to] of MUTANTS) {
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone — re-aim it`); alive++; continue }
    const copy = join(dirname(SELF), `.mutant-${basename(SELF)}`)
    writeFileSync(copy, src.replace(from, to))
    let red
    try { red = spawnSync(process.execPath, [copy, '--self-test'], { stdio: 'ignore' }).status !== 0 } finally { rmSync(copy, { force: true }) }
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
  process.exit(0)
}

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────────────

const want = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1]
if (want && !(want in ENVS)) { console.error(`⛔ --env=${want}: staging | prod`); process.exit(2) }

const head = async (key) => {
  for (let i = 0; i < 3; i++) {
    try { return (await fetch(BASE + key, { method: 'HEAD', cache: 'no-store' })).status } catch { /* retry */ }
  }
  return 'unreachable'
}

const accepted = new Set((process.env.ACCEPT_DARK || '').split(',').map((t) => t.trim()).filter(Boolean))
const acceptedUsed = new Set()
let dark = 0, uncertain = 0
for (const env of want ? [want] : Object.keys(ENVS)) {
  if (env === 'prod') {
    let store
    try { store = await liveStore() } catch (err) { uncertain++; console.error(`  ⛔ prod    cannot read the bucket (${err.message}) — refusing to say it is safe`); continue }
    for (const v of Object.values(await prodRun(store))) { if (v === 'dark') dark++; if (v === 'uncertain') uncertain++ }
    continue
  }
  const pre = ENVS[env]
  for (const town of registeredMaps()) {
    const [scene, manifest] = await Promise.all([head(`${pre}baked/${town}/scene.json`), head(`${pre}baked/${town}/manifest.json`)])
    if (scene === 'unreachable' || manifest === 'unreachable') { uncertain++; console.error(`  ⛔ ${env.padEnd(8)}${town.padEnd(26)} could not be read — refusing to say it is safe`); continue }
    if (scene !== 200 && manifest !== 200) continue  // not published to this env
    if (manifest === 200) {
      const record = await head(`staging/sites/${town}/player.json`)
      if (record === 'unreachable') { uncertain++; console.error(`  ⛔ ${env.padEnd(8)}${town.padEnd(26)} player record could not be read — refusing to say it is safe`); continue }
      if (record === 200) { console.log(`  ✅ ${env.padEnd(8)}${town.padEnd(26)} manifest.json present · player record present`); continue }
      if (accepted.has(town)) { acceptedUsed.add(town); console.warn(`  ⚠️ ${env.padEnd(8)}${town.padEnd(26)} goes DARK on staging BY YOUR DECISION (ACCEPT_DARK) — no player record`); continue }
      dark++
      console.error(`  ⛔ ${env.padEnd(8)}${town.padEnd(26)} names no player (staging/sites/${town}/player.json ${record}) — this Worker would 404 it. `
        + `▶ node scripts/set-staging-player.mjs --map=${town} --player=ward`)
      continue
    }
    if (accepted.has(town)) { acceptedUsed.add(town); console.warn(`  ⚠️ ${env.padEnd(8)}${town.padEnd(26)} goes DARK on staging BY YOUR DECISION (ACCEPT_DARK) — no manifest.json`); continue }
    dark++
    console.error(`  ⛔ ${env.padEnd(8)}${town.padEnd(26)} published (scene.json ${scene}) with NO manifest.json — this Worker would 404 it`)
  }
}
for (const t of accepted) {
  if (!acceptedUsed.has(t)) { dark++; console.error(`  ⛔ ACCEPT_DARK names "${t}", which would NOT go dark on staging here — drop it; a stale acknowledgment is a skip list`) }
}
if (dark || uncertain) {
  console.error(`\n⛔ ${dark} town(s) would go dark${uncertain ? `, ${uncertain} unreadable` : ''}. On staging, publish each with its manifest first `
    + '(node cartograph/bake-manifest.mjs --town=<t>, then upload) and its player record (node scripts/set-staging-player.mjs); '
    + 'on production, Promote the town again. Then deploy. PUBLISH.md §0.5.')
  process.exit(1)
}
console.log('\n✅ every town each Worker serves has what it asks for — deploying the Workers darkens none')
