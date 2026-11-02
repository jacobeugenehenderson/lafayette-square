#!/usr/bin/env node
/**
 * "WOULD DEPLOYING THIS WORKER TAKE A LIVE TOWN DARK?"
 *
 * WHY (2026-09-28, Warden). Both Workers decide a town is live by HEADing its `manifest.json`
 * (9f4966ee, `claims-a-town-is-live-by-its-manifest`). A town published before it had a manifest
 * has `scene.json` in R2 and no `manifest.json`: the Worker in the repo 404s it; the one deployed
 * today serves it. Deploying first darkens it, and nothing else would say so.
 *
 * STAGING — the towns are what staging-sites reads, listed from the bucket: every map with a player record
 * (`staging/sites/<map>/`) or a slab (`staging/baked/<map>/`), so a slab with no record is seen too. ⛔ Not the
 * instance registry (Boz, 2026-10-30): a town on staging and missing from it was invisible. Each map goes through
 * `index.js`'s sequence: a rename table the Worker would throw on refuses; a former name in `staging/renamed.json` is
 * a 301 (skipped) when its new name's slab is there, else its old links 404 (dark); a slab with neither `manifest.json` nor `scene.json` is not published (skipped); otherwise
 * the `manifest.json`, the town's player record (BRIEF-ward-on-staging, 2026-09-28 — no record is a 404, ▶ node
 * scripts/set-staging-player.mjs --map=<t> --player=ward) and the Ward build it serves, asked through
 * src/lib/stagingPlayer.js#stagingPlayerOf: the Worker's own answer, so the gate and the Worker cannot disagree (a record
 * naming the retired legacy player is dark here, as the Worker refuses it). The town prefix is read from wrangler.jsonc.
 *
 * PRODUCTION — the towns are what production-sites reads: every `hosts/<host>.json` record (Promote's), listed
 * from the bucket. Each is put through the Worker's own `route.js#route` for a page, and every key the Worker asks
 * for before it serves that page must be there: the slab's `manifest.json`, a Ward town's kit `manifest.json`, and
 * the page itself (`ward/<sha>/index.html`) — `index.js`'s document
 * branch. ⛔ Not a list of towns, and not the legacy key alone (Ward, 2026-10-30): that gate counted a town as served
 * only if `player/<map>/index.html` existed, so HPDM, promoted to the Ward only, was skipped, and PTown passed on a
 * leftover. (lafayette-square.com's Pages site is not this Worker.)
 *
 * ⭐ BOTH ARE READ THROUGH THE R2 API with Wrangler's sign-in: each Worker reads R2 by its binding with no edge in
 * front, and an edge copy of a record can be stale.
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
 *        node checks/claims-a-worker-deploy-darkens-no-town.mjs --mutants   (both readings, on fixtures; no network)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { route, MAP_ID } from '../workers/production-sites/src/route.js'
import { stagingPlayerOf } from '../src/lib/stagingPlayer.js'
import { importSource, sourceOf } from './_importSource.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENVS = ['staging', 'prod']

// ── the bucket ───────────────────────────────────────────────────────────────────────────────────────────────

/** The R2 objects API over `call(path, query) → {status, body}` (`path` '' lists; '/<key>' gets one object). */
function r2Store(call) {
  const pages = async (query, take) => {
    const { prefix } = query
    let cursor = null
    do {
      const r = await call('', { ...query, per_page: '1000', ...(cursor ? { cursor } : {}) })
      if (r.status !== 200) throw new Error(`listing ${prefix} answered ${r.status}`)
      const j = JSON.parse(r.body)
      if (!j.success) throw new Error(`listing ${prefix}: ${JSON.stringify(j.errors)}`)
      take(j)
      cursor = j.result_info?.is_truncated ? j.result_info.cursor : null
    } while (cursor)
  }
  return {
    async list(prefix) {
      const keys = []
      await pages({ prefix }, (j) => keys.push(...j.result.map((o) => o.key)))
      return keys
    },
    /** The names one level under `prefix` (`staging/sites/` → the maps). */
    async dirs(prefix) {
      const out = []
      await pages({ prefix, delimiter: '/' }, (j) => out.push(...(j.result_info?.delimited || []).map((d) => d.slice(prefix.length, -1))))
      return out
    },
    /** Whether `key` exists, without downloading it: the first key listed at it is itself. */
    async has(key) {
      const r = await call('', { prefix: key, per_page: '1' })
      if (r.status !== 200) throw new Error(`asking for ${key} answered ${r.status}`)
      return JSON.parse(r.body).result?.[0]?.key === key
    },
    async get(key) {
      const r = await call('/' + key.split('/').map(encodeURIComponent).join('/'))
      if (r.status === 404) return null
      if (r.status !== 200) throw new Error(`${key} answered ${r.status}`)
      return r.body
    },
  }
}

// ── production: what production-sites reads ────────────────────────────────────────────────────────────────

/** What production-sites does before it serves this record's page (`index.js`, the document branch). */
async function prodVerdict(rec, store) {
  const r = route('/', rec)
  if (r.kind === 'refuse') return { dark: `the Worker refuses its record (${r.status}): ${r.why}` }
  const need = [`baked/${rec.look}/manifest.json`]
  need.push(`kit/${rec.kit}/manifest.json`)
  need.push(r.key)
  const got = await Promise.all(need.map((k) => store.has(k)))
  const missing = need.filter((k, i) => !got[i])
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

// ── staging: what staging-sites reads ──────────────────────────────────────────────────────────────────────

const configOf = (env) => {
  const at = `workers/${env === 'prod' ? 'production' : 'staging'}-sites/wrangler.jsonc`
  const src = readFileSync(join(REPO_ROOT, at), 'utf8')
  return (k) => { const m = src.match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`)); if (!m) throw new Error(`${at} names no ${k}`); return m[1] }
}
const stagingVars = () => { const v = configOf('staging'); return { SITE: v('SITE_PREFIX') } }
const SLAB = 'staging/baked/', KIT = 'staging/kit/', RENAMED = 'staging/renamed.json'   // index.js's own literals
const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)

/** What staging-sites does before it serves `/<map>/` (`index.js`, after the rename table). */
async function stagingVerdict(map, store, vars) {
  const recordKey = `${vars.SITE}${map}/player.json`
  const [manifest, scene, rec] = await Promise.all([store.has(`${SLAB}${map}/manifest.json`), store.has(`${SLAB}${map}/scene.json`), store.get(recordKey)])
  if (!manifest && !scene) return { unpublished: rec != null ? 'a player record and no slab' : 'no slab' }
  if (!manifest) return { dark: 'published (scene.json) with NO manifest.json' }
  const p = await stagingPlayerOf(map, { json: async (k) => { const b = await store.get(k); if (b == null) return null; try { return JSON.parse(b) } catch { return {} } }, exists: (k) => store.has(k) })
  return p.current ? { ok: `manifest.json · player record (ward) · Ward ${p.ward.slice(0, 8)} on kit ${p.kit.slice(0, 8)}` } : { dark: p.why }
}

/** → { [map]: 'ok' | 'dark' | 'accepted' | 'unpublished' | 'renamed' | 'uncertain', ['ACCEPT_DARK <t>']: 'stale' }, printing each. */
async function stagingRun(store, accepted, say = console) {
  const out = {}
  let vars, maps, renamed
  try {
    vars = stagingVars()
    const [sites, slabs, table] = await Promise.all([store.dirs(vars.SITE), store.dirs(SLAB), store.get(RENAMED)])
    maps = [...new Set([...sites, ...slabs])].sort()
    renamed = table == null ? {} : JSON.parse(table)
    // index.js#renamedTable's own test: one bad value 500s every town on staging, so it refuses here.
    if (!renamed || typeof renamed !== 'object' || Array.isArray(renamed) || Object.values(renamed).some((v) => typeof v !== 'string' || !MAP_ID.test(v))) {
      throw new Error(`${RENAMED} is not a { "<old map>": "<new map>" } table — the Worker would 500 every town`)
    }
  } catch (err) {
    say.error(`  ⛔ staging the towns (${vars?.SITE ?? 'staging/sites/'}, ${SLAB}) could not be listed: ${err.message} — refusing to say it is safe`)
    return { '*': 'uncertain' }
  }
  for (const map of maps) {
    const tag = `${'staging'.padEnd(8)}${map.padEnd(26)}`
    // A former name is a 301 before any slab is asked for; the name it points at is judged as itself.
    try {
      if (renamed[map]) {   // the Worker 301s it only if the new name's slab is there, else 404s the old name
        if (await store.has(`${SLAB}${renamed[map]}/manifest.json`)) { out[map] = 'renamed'; say.log(`  ·  ${tag} renamed to "${renamed[map]}" (${RENAMED}): a redirect, not a town`); continue }
        throw Object.assign(new Error(), { dark: `renamed to "${renamed[map]}", which has no ${SLAB}${renamed[map]}/manifest.json — its old links 404` })
      }
      const v = await stagingVerdict(map, store, vars)
      if (v.ok) { out[map] = 'ok'; say.log(`  ✅ ${tag} ${v.ok}`) }
      else if (v.unpublished) { out[map] = 'unpublished'; say.log(`  ·  ${tag} not published here (${v.unpublished})`) }
      else if (accepted.has(map)) { out[map] = 'accepted'; say.warn(`  ⚠️ ${tag} goes DARK on staging BY YOUR DECISION (ACCEPT_DARK) — ${v.dark}`) }
      else { out[map] = 'dark'; say.error(`  ⛔ ${tag} this Worker would 404 it — ${v.dark}`) }
    } catch (err) {
      if (err.dark && accepted.has(map)) { out[map] = 'accepted'; say.warn(`  ⚠️ ${tag} goes DARK on staging BY YOUR DECISION (ACCEPT_DARK) — ${err.dark}`); continue }
      if (err.dark) { out[map] = 'dark'; say.error(`  ⛔ ${tag} this Worker would 404 it — ${err.dark}`); continue }
      out[map] = 'uncertain'
      say.error(`  ⛔ ${tag} could not be read (${err.message}) — refusing to say it is safe`)
    }
  }
  for (const t of accepted) {
    if (out[t] !== 'accepted') { out[`ACCEPT_DARK ${t}`] = 'stale'; say.error(`  ⛔ ACCEPT_DARK names "${t}", which would NOT go dark on staging here — drop it; a stale acknowledgment is a skip list`) }
  }
  return out
}

/** The live store: the R2 API, with the sign-in Wrangler already holds; the bucket is the Worker's binding. */
async function liveStore(which) {
  const bucket = configOf(which)('bucket_name')
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
  ['a record naming the retired legacy player, its copy still there', legacy, { 'ls.online': 'dark' }],
  ['a record naming the retired legacy player, no copy', without(legacy, 'player/lafayette-square/index.html'), { 'ls.online': 'dark' }],
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
    let keys = Object.keys(objects).filter((k) => k.startsWith(query.prefix)).sort()
    if (query.delimiter) {   // one directory per page, as result_info.delimited
      const dirs = [...new Set(keys.map((k) => k.slice(0, k.indexOf('/', query.prefix.length) + 1)).filter((d) => d.length > query.prefix.length))]
      const at = query.cursor ? dirs.indexOf(query.cursor) : 0
      const more = at + 1 < dirs.length
      return { status: 200, body: JSON.stringify({ success: true, errors: [], result: [],
        result_info: { delimited: dirs.slice(at, at + 1), ...(more ? { is_truncated: true, cursor: dirs[at + 1] } : {}) } }) }
    }
    const at = query.cursor ? keys.indexOf(query.cursor) : 0
    const more = at + 1 < keys.length
    return { status: 200, body: JSON.stringify({ success: true, errors: [], result: keys.slice(at, at + 1).map((key) => ({ key })),
      ...(more ? { result_info: { is_truncated: true, cursor: keys[at + 1] } } : {}) }) }
  }
}
const stWard = { 'staging/ward/current.json': JSON.stringify({ sha: W, kit: K }), [`staging/kit/${K}/manifest.json`]: '{}', [`staging/ward/${W}/index.html`]: '<!doctype html>' }
const stTown = (map, player = 'ward') => ({ [`staging/baked/${map}/manifest.json`]: '{}', [`staging/sites/${map}/player.json`]: JSON.stringify({ player }) })
const huronNoRecord = { ...stWard, ...stTown('provincetown'), 'staging/baked/huron/manifest.json': '{}' }
const STAGING_CASES = [
  ['a staging town missing from the registry is still seen', { ...stWard, ...stTown('provincetown'), ...stTown('zz-not-registered') }, [], { provincetown: 'ok', 'zz-not-registered': 'ok' }],
  ['a slab with no player record', huronNoRecord, [], { provincetown: 'ok', huron: 'dark' }],
  ['a record and no slab is not published', { ...stWard, 'staging/sites/lafayette-square/player.json': '{"player":"ward"}' }, [], { 'lafayette-square': 'unpublished' }],
  ['a slab with scene.json and no manifest.json', { ...stWard, 'staging/baked/old/scene.json': '{}', 'staging/sites/old/player.json': '{"player":"ward"}' }, [], { old: 'dark' }],
  ['the Ward not published', stTown('provincetown'), [], { provincetown: 'dark' }],
  ['the Ward\'s kit bundle not published', { ...without(stWard, `staging/kit/${K}/manifest.json`), ...stTown('provincetown') }, [], { provincetown: 'dark' }],
  ['the Ward build with no page', { ...without(stWard, `staging/ward/${W}/index.html`), ...stTown('provincetown') }, [], { provincetown: 'dark' }],
  ['a record naming the retired legacy player, its build still there', { ...stWard, ...stTown('ls', 'legacy'), 'staging/player/index.html': 'x' }, [], { ls: 'dark' }],
  ['a record naming no player the Worker plays', { ...stWard, ...stTown('x', 'kit') }, [], { x: 'dark' }],
  ['ACCEPT_DARK names a town going dark', huronNoRecord, ['huron'], { provincetown: 'ok', huron: 'accepted' }],
  ['ACCEPT_DARK names a town that is fine', { ...stWard, ...stTown('provincetown') }, ['provincetown'], { provincetown: 'ok', 'ACCEPT_DARK provincetown': 'stale' }],
  ['a former name with a leftover slab is a redirect', { ...stWard, ...stTown('hipointedemun'), 'staging/baked/hipointe-demun/scene.json': '{}', 'staging/renamed.json': '{"hipointe-demun":"hipointedemun"}' }, [], { hipointedemun: 'ok', 'hipointe-demun': 'renamed' }],
  ['a former name whose new name has no slab: its old links 404', { ...stWard, 'staging/baked/hipointe-demun/scene.json': '{}', 'staging/renamed.json': '{"hipointe-demun":"hipointedemun"}' }, [], { 'hipointe-demun': 'dark' }],
  ['a rename table with a number for a name', { ...stWard, ...stTown('provincetown'), 'staging/renamed.json': '{"old":7}' }, [], { '*': 'uncertain' }],
  ['a rename table with a name that is not a map id', { ...stWard, ...stTown('provincetown'), 'staging/renamed.json': '{"old":"Bad Name"}' }, [], { '*': 'uncertain' }],
  ['the towns cannot be listed', null, [], { '*': 'uncertain' }],
]
async function selfTest() {
  const quiet = { log() {}, warn() {}, error() {} }
  const fails = []
  const same = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort())
  for (const [name, objects, want] of CASES) {
    const got = await prodRun(r2Store(fakeApi(objects)), quiet)
    if (!same(got, want)) fails.push(`prod: ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
  for (const [name, objects, accepted, want] of STAGING_CASES) {
    const got = await stagingRun(r2Store(fakeApi(objects)), new Set(accepted), quiet)
    if (!same(got, want)) fails.push(`staging: ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
  return fails
}

// ── mutants: each this file's readings with one rule changed, imported in memory (checks/_importSource.mjs), must fail ──
const MUTANTS = [
  ['the legacy key gates a Ward town again', 'need.push(r.key)', 'need.push(r.key, `player/${rec.map}/index.html`)'],
  ['the slab manifest not asked for', 'const need = [`baked/${rec.look}/manifest.json`]', 'const need = []'],
  ['the kit manifest not asked for', "need.push(`kit/${rec.kit}/manifest.json`)", ''],
  ['the page not asked for', 'need.push(r.key)', ''],
  ['only the first page of records read', 'cursor = j.result_info?.is_truncated ? j.result_info.cursor : null', 'cursor = null'],
  ['an unlistable bucket read as no towns', "if (r.status !== 200) throw new Error(`listing ${prefix} answered ${r.status}`)", 'if (r.status !== 200) return'],
  ['staging: the registry\'s towns instead of the bucket\'s', 'maps = [...new Set([...sites, ...slabs])].sort()', "maps = (await import('../src/instances/registry.js')).registeredMaps()"],
  ['staging: only the records listed (a slab with no record unseen)', '[...sites, ...slabs]', '[...sites]'],
  ['staging: the town\'s player not asked for', 'const p = await stagingPlayerOf(map,', "const p = { current: true, ward: 'x'.repeat(40), kit: 'x'.repeat(40) }; void (map,"],
  ['staging: a record with no slab called dark', "if (!manifest && !scene) return { unpublished:", "if (false) return { unpublished:"],
  ['staging: the rename table not read', 'if (renamed[map]) {', 'if (false) {'],
  ['staging: the rename table\'s values not tested', " || Object.values(renamed).some((v) => typeof v !== 'string' || !MAP_ID.test(v))", ''],
  ['staging: a rename to an unpublished name read as a redirect', "if (await store.has(`${SLAB}${renamed[map]}/manifest.json`)) {", 'if (true) {'],
  ['staging: ACCEPT_DARK ignored', 'else if (accepted.has(map))', 'else if (false)'],
  ['staging: a stale ACCEPT_DARK passes', "if (out[t] !== 'accepted') {", 'if (false) {'],
]

if (process.argv.includes('--self-test') || process.argv.includes('--mutants')) {
  const fails = await selfTest()
  if (fails.length) { console.error(`⛔ a Worker's reading is wrong:\n   ${fails.join('\n   ')}`); process.exit(1) }
  if (process.argv.includes('--self-test')) process.exit(0)
  console.log(`✅ both Workers' readings: ${CASES.length} production fixtures, ${STAGING_CASES.length} staging`)
  let alive = 0
  const src = sourceOf('checks/claims-a-worker-deploy-darkens-no-town.mjs')
  const readings = (edit) => importSource('checks/claims-a-worker-deploy-darkens-no-town.mjs', { span: { to: '// ── mutants: each this file' }, suffix: 'export { selfTest }',
    transform: edit })
  // ⛔ the control: the copy unchanged, imported the same way, must read GREEN — else every mutant's "RED" is the loader's
  const control = await (await readings((t) => t)).selfTest()
  if (control.length) { console.error(`⛔ the in-memory copy of the readings fails unmutated — the mutants prove nothing:\n   ${control.join('\n   ')}`); process.exit(1) }
  for (let [name, from, to] of MUTANTS) {
    if (!src.includes(from)) { console.error(`⛔ mutant "${name}": its target text is gone — re-aim it`); alive++; continue }
    // the readings only (the span stops before the mutants)
    let red
    try {
      red = (await (await readings((t) => t.replace(from, to))).selfTest()).length > 0
    } catch (e) { red = true; name += ` (by throwing: ${e.message.slice(0, 80)})` }   // as the spawned copy's non-zero exit was
    console.log(`   ${red ? 'RED  ' : 'ALIVE'} ${name}`)
    if (!red) alive++
  }
  if (alive) { console.error(`⛔ ${alive} mutant(s) survived`); process.exit(1) }
  console.log(`✅ all ${MUTANTS.length} mutants RED`)
  process.exit(0)
}

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────────────

const want = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1]
if (want && !ENVS.includes(want)) { console.error(`⛔ --env=${want}: staging | prod`); process.exit(2) }

const accepted = new Set((process.env.ACCEPT_DARK || '').split(',').map((t) => t.trim()).filter(Boolean))
let dark = 0, uncertain = 0
for (const env of want ? [want] : ENVS) {
  let store
  try { store = await liveStore(env) } catch (err) { uncertain++; console.error(`  ⛔ ${env.padEnd(8)}cannot read the bucket (${err.message}) — refusing to say it is safe`); continue }
  const out = env === 'prod' ? await prodRun(store) : await stagingRun(store, accepted)
  for (const v of Object.values(out)) { if (v === 'dark' || v === 'stale') dark++; if (v === 'uncertain') uncertain++ }
}
if (dark || uncertain) {
  console.error(`\n⛔ ${dark} town(s) would go dark${uncertain ? `, ${uncertain} unreadable` : ''}. On staging, publish each with its manifest first `
    + '(node cartograph/bake-manifest.mjs --town=<t>, then upload) and its player record (node scripts/set-staging-player.mjs); '
    + 'on production, Promote the town again. Then deploy. PUBLISH.md §0.5.')
  process.exit(1)
}
console.log('\n✅ every town each Worker serves has what it asks for — deploying the Workers darkens none')
