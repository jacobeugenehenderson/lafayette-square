#!/usr/bin/env node
/**
 * "DOES A TOWN'S PRODUCTION SITE PLAY EXACTLY THE PLAYER PROMOTE PINNED — AND A RECORD THAT NAMES
 *  NONE, NONE?"  The production twin of claims-a-staging-town-names-its-player.
 *
 * WHY (BRIEF-ls-onto-the-ward Phase 2, 2026-09-29). Promote pins whichever player the town's staging
 * record names: `ward` → the Ward build + its kit bundle, write-once per commit. A record naming the retired
 * `legacy` player refuses (2026-11-01). The production Worker plays what the host record says (`route.js#appOf`). ⛔ No default
 * player anywhere: no staging record refuses the promote, and a host record that names no player is a
 * 500 — except a pre-v2 record whose `player` is the old build TIMESTAMP, which proves it legacy
 * (Boz, 2026-09-29: absence alone proves nothing).
 *
 * Two halves, both behaviour:
 *   A. the production Worker, bundled from source, in Miniflare against an in-memory R2 — minted
 *      towns, domains and shas, so nothing here can be known by name;
 *   B. scripts/promote-player-to-prod.mjs itself, `--dry-run`, against a local stand-in for the asset
 *      host (ASSET_BASE) — the record read, the refusals, and the write-once rule. No R2, no wrangler.
 * ⛔ Mutation-tested 2026-09-29: (1) a missing app read as legacy, (2) a bare {map, look, domain}
 *    record read as legacy, (3) Promote defaulting a missing staging record — each turns this red.
 *
 * ⭐ The share card (2026-11-01): the town's own record's three refusals (none, not JSON, no entry) and `--card-only`'s one-key write, each run as a mutant
 *    of the script (sourceFile) that must turn it red; writes are seen through a stand-in `npx` on PATH, never made.
 * ⛔ LOCAL ONLY. Usage: node checks/claims-a-production-town-plays-the-player-promote-pinned.mjs
 */
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { sourceFile } from './_sourceFile.mjs'
import { stagingTownsKey, townsKey } from '../src/lib/townsRecordKeys.js'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { workerInMiniflare, mint, hex } from './_miniflare.mjs'

const run = promisify(execFile)
const fails = []
const expect = (what, ok, got) => { if (!ok) fails.push(`${what} — got ${got.status}: ${String(got.body).slice(0, 180).replace(/\n/g, ' ')}`) }
const kitTags = (b) => b.match(/<meta name="ward-kit-base" content="([^"]*)"/g) || []

// ── A. The production Worker ────────────────────────────────────────────────
const { mf, r2, get } = await workerInMiniflare(join(ROOT, 'workers/production-sites/src/index.js'))
const W = hex(), K = hex()
const towns = ['ward', 'legacy', 'old', 'bare', 'odd', 'nokit', 'noapp'].map((t) => ({ t, map: mint(t) }))
const T = Object.fromEntries(towns.map(({ t, map }) => [t, { map, look: map, domain: `${map}.example` }]))
const host = (t, extra) => r2.put(`hosts/${T[t].domain}.json`, JSON.stringify({ ...T[t], ...extra }))
for (const { t } of towns) {
  await r2.put(`baked/${T[t].look}/manifest.json`, '{}')
  await r2.put(`player/${T[t].map}/index.html`, '<!doctype html><html><head><title>x</title></head><body>LEGACY</body></html>')
}
await r2.put(`ward/${W}/index.html`, `<!doctype html><html><head>\n<meta name="ward-build" content="${W}"><title>x</title></head><body>WARD</body></html>`, { httpMetadata: { cacheControl: 'no-cache' } })
await r2.put(`ward/${W}/build.json`, JSON.stringify({ ward: W, kit: K }), { httpMetadata: { cacheControl: 'no-cache' } })
await r2.put(`kit/${K}/manifest.json`, '{}')
await r2.put(`kit/${K}/basis/basis_transcoder.js`, '//', { httpMetadata: { cacheControl: 'public, max-age=31536000, immutable' } })
await host('ward', { v: 2, app: 'ward', ward: W, kit: K })
await host('legacy', { v: 2, app: 'legacy', player: '2026-09-29T00:00:00.000Z' })
await host('old', { player: '2026-09-28T08:20:15.084Z' })          // a pre-v2 record, as provincetown.online's is
await host('bare', {})                                               // no v, no timestamp: proves nothing
await host('odd', { v: 2, app: 'sometimes' })
await host('noapp', { v: 2 })
await host('nokit', { v: 2, app: 'ward', ward: W, kit: hex() })     // pins a kit that is not in production
const at = (t, p = '/') => get(`https://${T[t].domain}${p}`)

let r = await at('ward')
expect('a "ward" town serves its pinned Ward build', r.status === 200 && r.body.includes('WARD') && r.body.includes(`content="${W}"`), r)
const tags = kitTags(r.body)
expect(`a "ward" page names exactly one kit base, its own origin's kit/<kit>/`, tags.length === 1 && tags[0].includes(`"https://${T.ward.domain}/kit/${K}/"`), { status: tags.length, body: tags.join(' ') })
expect('a "ward" page is told its town', r.body.includes(`<meta name="ward-look" content="${T.ward.look}"`), r)
r = await at('ward', `/_ward/${W}/build.json`)
expect('/_ward/<pinned>/ is served with the cache policy Promote copied', r.status === 200 && r.body.includes(W) && r.cache === 'no-cache', r)
r = await at('ward', `/_ward/${hex()}/index.html`)
expect('another Ward sha is not this town\'s', r.status === 404, r)
r = await at('ward', `/kit/${K}/basis/basis_transcoder.js`)
expect('/kit/<pinned>/ is served, immutable', r.status === 200 && /immutable/.test(r.cache || ''), r)
r = await at('ward', `/kit/${hex()}/manifest.json`)
expect('another kit sha is not this town\'s', r.status === 404, r)
r = await at('ward', '/_player/index.html')
expect('a "ward" town has no /_player/', r.status === 404, r)
r = await at('nokit')
expect('a "ward" town whose kit bundle is missing refuses, naming the kit', r.status === 404 && r.body.includes('kit/'), r)
for (const t of ['legacy', 'old']) {
  r = await at(t, '/deep/route')
  expect(`a ${t === 'old' ? 'pre-v2 (timestamped)' : 'v2 legacy'} town serves the kit's player, and no kit base from the Worker`, r.status === 200 && r.body.includes('LEGACY') && kitTags(r.body).length === 0, r)
}
r = await at('legacy', `/_ward/${W}/index.html`)
expect('a "legacy" town has no /_ward/', r.status === 404, r)
for (const t of ['bare', 'odd', 'noapp']) {
  r = await at(t)
  expect(`a host record that names no player (${t}) refuses by name`, r.status === 500 && (r.body.includes(T[t].map) || /player|app/.test(r.body)), r)
}
await mf.dispose()

// ── B. Promote, --dry-run, against a stand-in asset host ─────────────────────
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const md5 = (s) => createHash('md5').update(s).digest('hex')
const MAP = mint('promote'), PW = hex(), PK = hex()
const store = new Map()
const putS = (k, v) => store.set(k, typeof v === 'string' ? v : JSON.stringify(v))
const wardFiles = { 'index.html': '<html></html>', 'assets/app-abcdef12.js': 'app()' }
const kitFiles = { 'basis/basis_transcoder.js': '//t', 'clouds/almanac.json': '{}' }
const townsJson = JSON.stringify({ [MAP]: { title: MAP } })
function seedStaging(app) {
  store.clear()
  if (app) putS(`staging/sites/${MAP}/player.json`, { player: app })
  putS('staging/ward/current.json', { sha: PW, kit: PK })
  for (const [rel, b] of Object.entries(wardFiles)) putS(`staging/ward/${PW}/${rel}`, b)
  putS(`staging/ward/${PW}/build.json`, { ward: PW, kit: PK, files: Object.fromEntries(Object.entries(wardFiles).map(([k, v]) => [k, sha256(v)])) })
  for (const [rel, b] of Object.entries(kitFiles)) putS(`staging/kit/${PK}/${rel}`, b)
  putS(`staging/kit/${PK}/manifest.json`, { kit: PK, files: Object.fromEntries(Object.entries(kitFiles).map(([k, v]) => [k, sha256(v)])) })
  putS(stagingTownsKey(MAP), townsJson)   // the town's own share-card record, written by its Publish
}
const server = createServer((req, res) => {
  const k = decodeURIComponent(req.url.split('?')[0].slice(1))
  if (!store.has(k)) { res.writeHead(404); return res.end() }
  const b = store.get(k)
  res.writeHead(200, { etag: `"${md5(b)}"` }); res.end(req.method === 'HEAD' ? undefined : b)
}).listen(0, '127.0.0.1')
await new Promise((ok) => server.on('listening', ok))
const base = `http://127.0.0.1:${server.address().port}/`
// ⭐ Writes are seen, not made: a stand-in `npx` first on PATH logs each `wrangler r2 object put <bucket>/<key>` and swallows
// its bytes, so a real (non-dry) card-only run can be held to the one key it may write.
const fakeBin = mkdtempSync(join(tmpdir(), 'promote-npx-')), putLog = join(fakeBin, 'puts.log')
writeFileSync(join(fakeBin, 'npx'), `#!/bin/sh\necho "$5" >> "${putLog}"\ncat > /dev/null\nexit 0\n`)
chmodSync(join(fakeBin, 'npx'), 0o755)
const putsSeen = () => (existsSync(putLog) ? readFileSync(putLog, 'utf8').trim().split('\n').filter(Boolean) : [])
async function promote(args = [`--map=${MAP}`, `--look=${MAP}`, '--dry-run'], script = 'scripts/promote-player-to-prod.mjs') {
  rmSync(putLog, { force: true })
  try {
    const { stdout } = await run('node', [script, ...args],
      { cwd: ROOT, env: { ...process.env, ASSET_BASE: base, PATH: `${fakeBin}:${process.env.PATH}` } })
    return { code: 0, out: stdout, last: stdout.trim().split('\n').pop() }
  } catch (e) { return { code: e.code ?? 1, out: `${e.stdout}${e.stderr}` } }
}
/** The towns-record refusals and the card-only pin, for the script at `script` (the repo's, or a mutant's). */
async function cardFails(script) {
  const f = []
  const exp = (what, ok, got) => { if (!ok) f.push(`${what} — got ${got.status}: ${String(got.body).slice(0, 180).replace(/\n/g, ' ')}`) }
  // ⛔ The town's share-card record is published (by its Publish) before Promote pins it: none, one that is not JSON, or one
  // without this town → Promote refuses by name, and never reads another town's record or the retired legacy player's copy.
  const KEY = stagingTownsKey(MAP)
  seedStaging('ward'); store.delete(KEY)
  let p = await promote(undefined, script)
  exp("Promote refuses when the town's share card was never published", p.code !== 0 && p.out.includes(KEY) && p.out.includes('has not been published'), { status: p.code, body: p.out })
  seedStaging('ward'); putS(KEY, '{not json')
  p = await promote(undefined, script)
  exp("Promote refuses a share-card record that is not JSON", p.code !== 0 && p.out.includes('is not JSON'), { status: p.code, body: p.out })
  seedStaging('ward'); putS(KEY, JSON.stringify({ other: { title: 'x' } }))
  p = await promote(undefined, script)
  exp('Promote refuses a share-card record with no entry for the town', p.code !== 0 && p.out.includes(`no entry for "${MAP}"`), { status: p.code, body: p.out })
  // ⭐ --card-only (Boz, 2026-11-01): the same verification, then sites/<map>/towns.json and nothing else.
  seedStaging('ward'); store.delete(KEY)
  p = await promote([`--map=${MAP}`, '--card-only'], script)
  exp('--card-only refuses an unpublished share card, as the full promote does', p.code !== 0 && p.out.includes('has not been published') && !putsSeen().length, { status: p.code, body: `${p.out} puts=${putsSeen().join(',')}` })
  seedStaging('ward')
  p = await promote([`--map=${MAP}`, '--card-only'], script)
  const puts = putsSeen()
  exp('--card-only writes exactly sites/<map>/towns.json', p.code === 0 && puts.length === 1 && puts[0].endsWith(`/${townsKey(MAP)}`), { status: p.code, body: `${p.out} puts=${puts.join(',')}` })
  return f
}

try {
  fails.push(...await cardFails('scripts/promote-player-to-prod.mjs'))
  // Each refusal and the card-only bound, removed in turn from a copy of the script: each must turn the card half red.
  const must = (from, to) => (s) => { if (!s.includes(from)) throw new Error(`mutant anchor gone: ${from.slice(0, 70)}`); return s.replace(from, to) }
  for (const [name, transform] of [
    ['no share card read as fine', must("  if (!townsBuf) throw new Error(`no ${key}", "  if (false) throw new Error(`no ${key}")],
    ['a record that is not JSON pinned', must("  try { rec = JSON.parse(townsBuf) } catch { throw new Error(`${key} is not JSON", "  try { rec = JSON.parse(townsBuf) } catch { rec = { [map]: {} }; if (false) throw new Error(`${key} is not JSON")],
    ['a record with no entry for the town pinned', must('  if (!rec?.[map]) throw', '  if (false) throw')],
    ['--card-only skips the verification', must("    const townsBuf = await verifiedTownsRecord()\n    console.log(`card", "    const townsBuf = await getBytes(stagingTownsKey(map))\n    console.log(`card")],
    ['--card-only writes beyond its key', must('    await pinTownsRecord(townsBuf)\n    console.log(JSON.stringify({ ok: true, map, cardOnly', "    await put(`hosts/${map}.json`, Buffer.from('{}'), 'x.json')\n    await pinTownsRecord(townsBuf)\n    console.log(JSON.stringify({ ok: true, map, cardOnly")],
  ]) {
    const got = await cardFails(sourceFile('scripts/promote-player-to-prod.mjs', { transform }))
    console.log(`${got.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`)
    if (!got.length) fails.push(`mutant survived: ${name}`)
  }

  seedStaging(null)
  let p = await promote()
  expect('Promote refuses a town with no staging record, by name', p.code !== 0 && p.out.includes(MAP) && p.out.includes('player.json'), { status: p.code, body: p.out })
  seedStaging('sometimes')
  p = await promote()
  expect('Promote refuses an unknown staging player', p.code !== 0 && p.out.includes('sometimes'), { status: p.code, body: p.out })
  seedStaging('ward')
  p = await promote()
  let j = null; try { j = JSON.parse(p.last) } catch { /* reported */ }
  expect('Promote plans a "ward" town as the Ward build + kit staging serves', p.code === 0 && j?.player === 'ward' && j?.ward === PW && j?.kit === PK, { status: p.code, body: p.out })
  expect('…copying every file of both', /copy\s+4 files \(0 already/.test(p.out), { status: p.code, body: p.out })
  putS(`ward/${PW}/assets/app-abcdef12.js`, 'app()')                 // already in production, same bytes
  p = await promote()
  expect('a Ward file already in production with the SAME bytes is verified and kept', p.code === 0 && /copy\s+3 files \(1 already/.test(p.out), { status: p.code, body: p.out })
  putS(`kit/${PK}/clouds/almanac.json`, '{"changed":1}')             // already in production, DIFFERENT bytes
  p = await promote()
  expect('a shared key already in production with different bytes refuses — write-once, never overwritten', p.code !== 0 && /write-once/.test(p.out) && p.out.includes(`kit/${PK}/clouds/almanac.json`), { status: p.code, body: p.out })
  seedStaging('legacy')
  p = await promote()
  expect('Promote refuses a staging record naming the retired legacy player, by name', p.code !== 0 && p.out.includes('retired player (legacy)'), { status: p.code, body: p.out })
} finally { server.close() }

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ a production town plays exactly the player Promote pinned from its staging record; no record, no player — and a shared commit is written once')
